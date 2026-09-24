import type { InstagramPostSnapshot, InstagramSnapshot, PlaceSnapshot, PublicReview } from "../../shared/types.js";
import { chromium } from "playwright";

export interface FetchLike { (input: string | URL | Request, init?: RequestInit): Promise<Response> }
export interface ApifyRunResult { runId: string; datasetId: string; costUsd: number; items: unknown[] }

export interface ApifyClientOptions {
  token: string;
  actorId?: string;
  fetch?: FetchLike;
  baseUrl?: string;
  waitSeconds?: number;
}

export class ApifyClient {
  private readonly fetcher: FetchLike;
  private readonly actorId: string;
  private readonly baseUrl: string;
  private readonly waitSeconds: number;
  private readonly resolvedMapsUrls = new Map<string, string>();

  constructor(private readonly options: ApifyClientOptions) {
    this.fetcher = options.fetch ?? fetch;
    this.actorId = (options.actorId ?? "compass/crawler-google-places").replace("/", "~");
    this.baseUrl = options.baseUrl ?? "https://api.apify.com/v2";
    this.waitSeconds = options.waitSeconds ?? 180;
  }

  async run(input: Record<string, unknown>): Promise<ApifyRunResult> {
    if (!this.options.token) throw new Error("APIFY_TOKEN ausente.");
    const runUrl = new URL(`${this.baseUrl}/acts/${this.actorId}/runs`);
    runUrl.searchParams.set("token", this.options.token);
    runUrl.searchParams.set("waitForFinish", String(this.waitSeconds));
    const response = await this.fetcher(runUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
    if (!response.ok) throw new Error(`Apify recusou a execução (${response.status}).`);
    let run = (await response.json()) as { data?: Record<string, unknown> };
    let data = run.data ?? {};
    if (data.status !== "SUCCEEDED") {
      const runId = String(data.id ?? "");
      if (!runId) throw new Error("Apify não retornou o identificador da execução.");
      data = await this.waitForRun(runId);
    }
    if (data.status !== "SUCCEEDED") throw new Error(`Execução Apify terminou como ${String(data.status ?? "desconhecida")}.`);
    const datasetId = String(data.defaultDatasetId ?? "");
    if (!datasetId) throw new Error("Apify não retornou dataset.");
    const itemsUrl = new URL(`${this.baseUrl}/datasets/${datasetId}/items`);
    itemsUrl.searchParams.set("token", this.options.token);
    itemsUrl.searchParams.set("clean", "true");
    const itemsResponse = await this.fetcher(itemsUrl);
    if (!itemsResponse.ok) throw new Error(`Não foi possível ler o dataset Apify (${itemsResponse.status}).`);
    const items = (await itemsResponse.json()) as unknown[];
    return {
      runId: String(data.id), datasetId,
      costUsd: numberOrZero(data.usageTotalUsd ?? (data.stats as Record<string, unknown> | undefined)?.costUsd),
      items,
    };
  }

  async collectPlace(mapsUrl: string, reviewSort: "newest" | "lowestRanking" = "newest", maxReviews = 60): Promise<ApifyRunResult> {
    const cached = this.resolvedMapsUrls.get(mapsUrl);
    const resolvedMapsUrl = cached ?? await resolveSharedGoogleMapsUrl(mapsUrl, this.fetcher);
    this.resolvedMapsUrls.set(mapsUrl, resolvedMapsUrl);
    const result = await this.run({
      startUrls: [{ url: resolvedMapsUrl }], language: "pt-BR", maxCrawledPlacesPerSearch: 1,
      scrapePlaceDetailPage: true, maxReviews, reviewsSort: reviewSort,
      reviewsOrigin: "google", scrapeReviewsPersonalData: false,
      maxImages: 12, scrapeImageAuthors: false, skipClosedPlaces: false,
    });
    assertCollectedPlaceMatchesUrl(result.items[0], resolvedMapsUrl);
    return result;
  }

  async collectCompetitors(category: string, location: string): Promise<ApifyRunResult> {
    return this.run({
      searchStringsArray: [category], locationQuery: location, language: "pt-BR",
      maxCrawledPlacesPerSearch: 6, scrapePlaceDetailPage: true, maxReviews: 3,
      reviewsSort: "newest", reviewsOrigin: "google", scrapeReviewsPersonalData: false,
      maxImages: 0, scrapeImageAuthors: false, skipClosedPlaces: true,
      enableCompetitorAnalysis: false,
    });
  }

  private async waitForRun(runId: string): Promise<Record<string, unknown>> {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const url = new URL(`${this.baseUrl}/actor-runs/${runId}`);
      url.searchParams.set("token", this.options.token);
      url.searchParams.set("waitForFinish", "5");
      const response = await this.fetcher(url);
      if (!response.ok) throw new Error(`Não foi possível acompanhar a execução Apify (${response.status}).`);
      const data = ((await response.json()) as { data: Record<string, unknown> }).data;
      if (["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(String(data.status))) return data;
    }
    throw new Error("A execução Apify excedeu o tempo limite.");
  }
}

export async function resolveSharedGoogleMapsUrl(rawUrl: string, fetcher: FetchLike = fetch): Promise<string> {
  let url: URL;
  try { url = new URL(rawUrl); } catch { throw new Error("Link do Google Maps inválido."); }
  if (!/(^|\.)share\.google$/i.test(url.hostname)) return rawUrl;
  const response = await fetcher(url, {
    redirect: "follow",
    headers: { "user-agent": "Mozilla/5.0 DirijoGBP/1.0" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`Não foi possível abrir o link compartilhado do Google (${response.status}).`);
  const html = (await response.text()).slice(0, 1_000_000);
  const exactFromHtml = exactMapsPlaceUrl(html, response.url);
  if (exactFromHtml) return exactFromHtml;

  const exactFromBrowser = await resolveSharedLinkInBrowser(rawUrl).catch(() => undefined);
  if (exactFromBrowser) return exactFromBrowser;

  throw new Error("Não foi possível confirmar a ficha exata desse link compartilhado. Abra a empresa no Google Maps, use Compartilhar > Copiar link e tente novamente.");
}

function exactMapsPlaceUrl(html: string, baseUrl: string): string | undefined {
  const decoded = html.replace(/&amp;/gi, "&").replace(/\\u003d/gi, "=").replace(/\\u0026/gi, "&").replace(/\\\//g, "/");
  const href = decoded.match(/(?:href=["']|["'])(https?:\/\/[^"']*google\.[^/"']+\/maps\/place\/[^"']+|\/maps\/place\/[^"']+)["']/i)?.[1];
  if (!href) return undefined;
  const resolved = /^https?:\/\//i.test(href) ? new URL(href) : new URL(href, baseUrl || "https://www.google.com");
  resolved.hash = "";
  return resolved.href;
}

async function resolveSharedLinkInBrowser(rawUrl: string): Promise<string | undefined> {
  const launchOptions = { headless: true, args: ["--disable-blink-features=AutomationControlled"] };
  let browser: Awaited<ReturnType<typeof chromium.launch>>;
  try {
    browser = await chromium.launch({ ...launchOptions, channel: "chrome" });
  } catch {
    browser = await chromium.launch(launchOptions);
  }
  try {
    const page = await browser.newPage({
      locale: "pt-BR",
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
    });
    await page.goto(rawUrl, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.waitForTimeout(1_500);
    const hrefs = await page.locator('a[href*="/maps/place/"]').evaluateAll((anchors) => anchors.map((anchor) => (anchor as HTMLAnchorElement).href));
    const exact = hrefs.find((href) => /google\.[^/]+\/maps\/place\//i.test(href));
    return exact ? new URL(exact).href : undefined;
  } finally {
    await browser.close();
  }
}

export function assertCollectedPlaceMatchesUrl(item: unknown, resolvedMapsUrl: string): void {
  const expected = expectedPlaceName(resolvedMapsUrl);
  if (!expected || !item || typeof item !== "object") return;
  const actual = string((item as Record<string, unknown>).title ?? (item as Record<string, unknown>).name);
  if (!actual || placeNameSimilarity(expected, actual) >= 0.5) return;
  throw new Error(`O Google retornou uma empresa diferente da ficha enviada (${actual}). A coleta foi interrompida para não gerar um diagnóstico incorreto.`);
}

function expectedPlaceName(rawUrl: string): string | undefined {
  try {
    const url = new URL(rawUrl);
    const match = url.pathname.match(/\/maps\/place\/([^/]+)/i);
    return match?.[1] ? decodeURIComponent(match[1].replace(/\+/g, " ")) : undefined;
  } catch { return undefined; }
}

function placeNameSimilarity(left: string, right: string): number {
  const tokens = (value: string) => new Set(value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]+/g, " ").split(/\s+/).filter((token) => token.length > 2));
  const a = tokens(left); const b = tokens(right);
  if (!a.size || !b.size) return 1;
  const shared = [...a].filter((token) => b.has(token)).length;
  return (2 * shared) / (a.size + b.size);
}

const numberOrZero = (value: unknown): number => typeof value === "number" && Number.isFinite(value) ? value : 0;
const string = (value: unknown): string | undefined => typeof value === "string" && value.trim() ? value.trim() : undefined;

export function sanitizeReview(input: unknown): PublicReview | undefined {
  if (!input || typeof input !== "object") return undefined;
  const item = input as Record<string, unknown>;
  const text = string(item.text ?? item.reviewText ?? item.comment);
  const rating = numberOrZero(item.stars ?? item.rating);
  if (!text && !rating) return undefined;
  const response = item.responseFromOwner && typeof item.responseFromOwner === "object" ? item.responseFromOwner as Record<string, unknown> : undefined;
  return {
    rating: rating || undefined, text,
    publishedAt: string(item.publishedAtDate ?? item.publishedAt ?? item.publishAt),
    responseText: string(response?.text ?? item.responseText),
    responseAt: string(response?.publishedAtDate ?? item.responseAt),
  };
}

export function normalizePlace(input: unknown, sourceUrl: string): PlaceSnapshot {
  if (!input || typeof input !== "object") throw new Error("Registro de local inválido.");
  const item = input as Record<string, unknown>;
  const reviews = (Array.isArray(item.reviews) ? item.reviews : []).map(sanitizeReview).filter(Boolean) as PublicReview[];
  const images = (Array.isArray(item.imageUrls) ? item.imageUrls : Array.isArray(item.images) ? item.images : [])
    .map((image) => typeof image === "string" ? image : string((image as Record<string, unknown>)?.imageUrl)).filter(Boolean) as string[];
  const categories = (Array.isArray(item.categories) ? item.categories : []).filter((entry): entry is string => typeof entry === "string");
  const address = string(item.address ?? item.street);
  const city = string(item.city) ?? inferCity(address);
  const safeKeys = ["title", "categoryName", "categories", "address", "city", "phone", "website", "totalScore", "reviewsCount", "openingHours", "reviewsDistribution", "additionalInfo", "ownerUpdates", "questionsAndAnswers"];
  const rawSafe = Object.fromEntries(safeKeys.filter((key) => item[key] !== undefined).map((key) => [key, item[key]]));
  return {
    title: string(item.title ?? item.name) ?? "Empresa analisada",
    category: string(item.categoryName ?? item.category), categories,
    address, city, phone: string(item.phone), website: string(item.website),
    description: string(item.description), openingHours: item.openingHours,
    totalScore: numberOrZero(item.totalScore ?? item.rating) || undefined,
    reviewsCount: numberOrZero(item.reviewsCount ?? item.reviews) || undefined,
    reviewsDistribution: item.reviewsDistribution, reviews,
    imageUrls: images.slice(0, 12),
    ownerUpdates: Array.isArray(item.ownerUpdates) ? item.ownerUpdates : [],
    questionsAndAnswers: Array.isArray(item.questionsAndAnswers) ? item.questionsAndAnswers : [],
    sourceUrl: string(item.url) ?? sourceUrl, rawSafe,
  };
}

function inferCity(address?: string): string | undefined {
  if (!address) return undefined;
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  return parts.length >= 2 ? parts.at(-2)?.replace(/\s*-\s*[A-Z]{2}$/i, "") : undefined;
}

export function instagramUsername(rawUrl: string): string {
  let url: URL;
  try { url = new URL(rawUrl); } catch { throw new Error("Link do Instagram inválido."); }
  if (!/(^|\.)instagram\.com$/i.test(url.hostname)) throw new Error("Informe um link válido do Instagram.");
  const username = url.pathname.split("/").filter(Boolean)[0]?.replace(/^@/, "");
  if (!username || ["p", "reel", "reels", "stories", "explore"].includes(username.toLowerCase())) {
    throw new Error("Use o link público do perfil do Instagram, não de uma publicação.");
  }
  return username;
}

export function normalizeInstagramProfile(input: unknown, sourceUrl: string, now = new Date()): InstagramSnapshot {
  if (!input || typeof input !== "object") throw new Error("O Instagram não retornou um perfil público válido.");
  const item = input as Record<string, unknown>;
  if (item.error) throw new Error(`Instagram indisponível: ${String(item.error)}`);
  const username = string(item.username) ?? instagramUsername(sourceUrl);
  const rawPosts = Array.isArray(item.latestPosts) ? item.latestPosts : [];
  const latestPosts = rawPosts.map(normalizeInstagramPost).filter((post): post is InstagramPostSnapshot => Boolean(post)).slice(0, 12);
  const datedPosts = latestPosts.filter((post) => post.publishedAt && !Number.isNaN(Date.parse(post.publishedAt)));
  const ageInDays = (date: string) => Math.max(0, Math.floor((now.getTime() - Date.parse(date)) / 86_400_000));
  const daysSinceLastPost = datedPosts.length ? Math.min(...datedPosts.map((post) => ageInDays(post.publishedAt!))) : undefined;
  return {
    username,
    fullName: string(item.fullName),
    biography: string(item.biography),
    externalUrl: string(item.externalUrl),
    category: string(item.businessCategoryName),
    followersCount: optionalNumber(item.followersCount),
    followingCount: optionalNumber(item.followsCount ?? item.followingCount),
    postsCount: optionalNumber(item.postsCount),
    verified: Boolean(item.verified ?? item.isVerified),
    businessAccount: Boolean(item.isBusinessAccount),
    privateAccount: Boolean(item.private ?? item.isPrivate),
    latestPosts,
    signals: {
      sampleSize: latestPosts.length,
      postsLast30Days: datedPosts.filter((post) => ageInDays(post.publishedAt!) <= 30).length,
      postsLast90Days: datedPosts.filter((post) => ageInDays(post.publishedAt!) <= 90).length,
      ...(daysSinceLastPost === undefined ? {} : { daysSinceLastPost }),
      reelsInSample: latestPosts.filter((post) => post.format === "vídeo").length,
      carouselsInSample: latestPosts.filter((post) => post.format === "carrossel").length,
      postsWithCallToAction: latestPosts.filter((post) => hasCallToAction(post.caption)).length,
      postsWithProofSignals: latestPosts.filter((post) => hasProofSignal(post.caption)).length,
    },
  };
}

function normalizeInstagramPost(input: unknown): InstagramPostSnapshot | undefined {
  if (!input || typeof input !== "object") return undefined;
  const item = input as Record<string, unknown>;
  const url = string(item.url) ?? (string(item.shortCode) ? `https://www.instagram.com/p/${string(item.shortCode)}/` : undefined);
  if (!url) return undefined;
  const rawType = String(item.type ?? item.productType ?? "").toLowerCase();
  const childPosts = Array.isArray(item.childPosts) ? item.childPosts : [];
  const format: InstagramPostSnapshot["format"] = childPosts.length || /sidecar|carousel/.test(rawType)
    ? "carrossel"
    : /video|clips|reel/.test(rawType)
      ? "vídeo"
      : "imagem";
  const publishedAt = normalizeInstagramDate(item.timestamp ?? item.takenAt ?? item.takenAtIso);
  const imageUrl = string(item.displayUrl ?? item.thumbnailUrl ?? (Array.isArray(item.images) ? item.images[0] : undefined));
  return {
    url,
    caption: string(item.caption),
    publishedAt,
    format,
    likesCount: optionalNumber(item.likesCount),
    commentsCount: optionalNumber(item.commentsCount),
    imageUrl,
    pinned: Boolean(item.isPinned),
  };
}

function normalizeInstagramDate(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value > 10_000_000_000 ? value : value * 1000).toISOString();
  if (typeof value !== "string" || !value.trim()) return undefined;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return new Date(numeric > 10_000_000_000 ? numeric : numeric * 1000).toISOString();
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString();
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function hasCallToAction(caption?: string): boolean {
  return Boolean(caption && /(?:agend|marque|fale|chame|whats(?:app)?|link\s+na\s+bio|saiba\s+mais|envie\s+(?:uma\s+)?mensagem|direct)/iu.test(caption));
}

function hasProofSignal(caption?: string): boolean {
  return Boolean(caption && /(?:depoimento|resultado|antes\s+e\s+depois|caso\s+(?:real|cl[ií]nico)|paciente|cliente|transforma[cç][aã]o)/iu.test(caption));
}
