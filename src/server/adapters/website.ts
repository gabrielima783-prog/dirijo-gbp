import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { chromium } from "playwright";
import type { FetchLike } from "./apify.js";

export type WebsiteContactKind = "whatsapp" | "phone" | "booking" | "contact";

export interface WebsiteContactAction {
  kind: WebsiteContactKind;
  label: string;
  element: "link" | "button";
  target?: string | undefined;
}

export interface WebsitePage {
  url: string;
  status: number;
  title?: string | undefined;
  description?: string | undefined;
  canonical?: string | undefined;
  h1: string[];
  hasWhatsApp: boolean;
  hasBooking: boolean;
  hasCallToAction: boolean;
  contactActions: WebsiteContactAction[];
  rendered?: boolean | undefined;
  analytics: {
    ga4: boolean; gtm: boolean; metaPixel: boolean; googleAds: boolean;
    tiktokPixel: boolean; microsoftUet: boolean; clarity: boolean;
  };
  structuredData: boolean;
  visibleText?: string | undefined;
}

export interface WebsiteAudit {
  origin: string;
  pages: WebsitePage[];
  https: boolean;
  robots: boolean;
  sitemap: boolean;
  screenshotDataUrl?: string;
}

interface RenderedPage {
  requestedUrl: string;
  title?: string;
  description?: string;
  h1: string[];
  visibleText: string;
  contactActions: WebsiteContactAction[];
  screenshotDataUrl?: string;
}

export class WebsiteAuditor {
  constructor(private readonly fetcher: FetchLike = fetch) {}

  async audit(rawUrl: string): Promise<WebsiteAudit> {
    const initial = normalizeUrl(rawUrl);
    await assertPublicUrl(initial);
    const pages: WebsitePage[] = [];
    const queue = [initial];
    const seen = new Set<string>();

    while (queue.length && pages.length < 5) {
      const url = queue.shift()!;
      if (seen.has(url.href)) continue;
      seen.add(url.href);
      await assertPublicUrl(url);
      const response = await this.fetcher(url, {
        redirect: "manual",
        headers: { "user-agent": "DirijoGBP/1.0 (+local audit)" },
        signal: AbortSignal.timeout(12_000),
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (location) {
          const redirect = new URL(location, url);
          await assertPublicUrl(redirect);
          if (redirect.origin === initial.origin) queue.unshift(redirect);
        }
        continue;
      }

      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("text/html")) continue;
      const html = (await response.text()).slice(0, 2_000_000);
      pages.push(inspectPage(url.href, response.status, html));
      for (const href of extractLinks(html)) {
        try {
          const candidate = new URL(href, url);
          candidate.hash = "";
          if (isRelevantAuditLink(initial, candidate) && !seen.has(candidate.href)) {
            queue.push(candidate);
          }
        } catch { /* link inválido */ }
      }
    }

    const rendered = await capturePages(initial, pages).catch(() => ({ pages: [] as RenderedPage[] }));
    const renderedByUrl = new Map(rendered.pages.map((page) => [page.requestedUrl, page]));
    const enrichedPages = pages.map((page) => {
      const renderedPage = renderedByUrl.get(page.url);
      if (!renderedPage) return page;
      const contactActions = mergeActions(page.contactActions, renderedPage.contactActions);
      return {
        ...page,
        title: renderedPage.title || page.title,
        description: renderedPage.description || page.description,
        h1: renderedPage.h1.length ? renderedPage.h1 : page.h1,
        visibleText: renderedPage.visibleText || page.visibleText,
        contactActions,
        rendered: true,
        hasWhatsApp: page.hasWhatsApp || contactActions.some((action) => action.kind === "whatsapp"),
        hasBooking: page.hasBooking || contactActions.some((action) => action.kind === "booking"),
        hasCallToAction: page.hasCallToAction || contactActions.length > 0,
      };
    });
    const screenshotDataUrl = rendered.pages.find((page) => page.requestedUrl === initial.href)?.screenshotDataUrl;
    const [robots, sitemap] = await Promise.all([
      exists(this.fetcher, new URL("/robots.txt", initial)),
      exists(this.fetcher, new URL("/sitemap.xml", initial)),
    ]);
    return {
      origin: initial.origin,
      pages: enrichedPages,
      https: initial.protocol === "https:",
      robots,
      sitemap,
      ...(screenshotDataUrl ? { screenshotDataUrl } : {}),
    };
  }
}

export class PageSpeedClient {
  constructor(private readonly apiKey?: string, private readonly fetcher: FetchLike = fetch) {}
  async inspect(url: string): Promise<Record<string, unknown>> {
    const target = normalizeUrl(url);
    await assertPublicUrl(target);
    const endpoint = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
    endpoint.searchParams.set("url", target.href);
    endpoint.searchParams.set("strategy", "mobile");
    endpoint.searchParams.append("category", "performance");
    if (this.apiKey) endpoint.searchParams.set("key", this.apiKey);
    const response = await this.fetcher(endpoint, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`PageSpeed indisponível (${response.status}).`);
    const body = await response.json() as Record<string, unknown>;
    const lighthouse = body.lighthouseResult as Record<string, unknown> | undefined;
    const categories = lighthouse?.categories as Record<string, Record<string, unknown>> | undefined;
    const audits = lighthouse?.audits as Record<string, Record<string, unknown>> | undefined;
    const finalScreenshot = audits?.["final-screenshot"]?.details as Record<string, unknown> | undefined;
    return {
      performanceScore: typeof categories?.performance?.score === "number" ? Math.round(Number(categories.performance.score) * 100) : undefined,
      firstContentfulPaint: audits?.["first-contentful-paint"]?.displayValue,
      largestContentfulPaint: audits?.["largest-contentful-paint"]?.displayValue,
      cumulativeLayoutShift: audits?.["cumulative-layout-shift"]?.displayValue,
      ...(typeof finalScreenshot?.data === "string" && finalScreenshot.data.startsWith("data:image/") ? { screenshotDataUrl: finalScreenshot.data } : {}),
      observedAt: new Date().toISOString(),
      strategy: "mobile",
    };
  }
}

function normalizeUrl(raw: string): URL {
  const value = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const url = new URL(value);
  if (!/^https?:$/.test(url.protocol)) throw new Error("URL do site precisa usar HTTP ou HTTPS.");
  url.username = "";
  url.password = "";
  return url;
}

async function assertPublicUrl(url: URL): Promise<void> {
  if (["localhost", "localhost.localdomain"].includes(url.hostname) || url.hostname.endsWith(".local")) {
    throw new Error("Endereço local não permitido.");
  }
  const addresses = await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) throw new Error("Endereço privado não permitido.");
}

function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const parts = address.split(".").map(Number);
    const a = parts[0] ?? -1;
    const b = parts[1] ?? -1;
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  const value = address.toLowerCase();
  return value === "::1" || value === "::" || value.startsWith("fc") || value.startsWith("fd") || value.startsWith("fe80:") || value.startsWith("::ffff:127.") || value.startsWith("::ffff:10.") || value.startsWith("::ffff:192.168.");
}

async function exists(fetcher: FetchLike, url: URL): Promise<boolean> {
  try {
    await assertPublicUrl(url);
    const response = await fetcher(url, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(5_000) });
    return response.ok;
  } catch { return false; }
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;|&#160;|&#xA0;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_match, decimal: string) => String.fromCodePoint(Number(decimal)))
    .replace(/&#x([\da-f]+);/gi, (_match, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)));
}

function stripHtml(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function textMatch(html: string, pattern: RegExp): string | undefined {
  const value = html.match(pattern)?.[1];
  return value ? stripHtml(value) : undefined;
}

function attribute(source: string, name: string): string | undefined {
  const match = source.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return decodeHtmlEntities(match?.[1] ?? match?.[2] ?? match?.[3] ?? "").trim() || undefined;
}

function safeTarget(raw: string | undefined, baseUrl: string): string | undefined {
  if (!raw) return undefined;
  if (/^tel:/i.test(raw)) {
    const digits = raw.slice(4).replace(/[^\d+]/g, "");
    return digits ? `tel:${digits}` : undefined;
  }
  try {
    const url = new URL(raw, baseUrl);
    if (!/^https?:$/.test(url.protocol)) return undefined;
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.href;
  } catch { return undefined; }
}

function classifyAction(label: string, rawTarget: string | undefined, element: "link" | "button", baseUrl: string): WebsiteContactAction | undefined {
  const target = safeTarget(rawTarget, baseUrl);
  const labelSignal = label.toLocaleLowerCase("pt-BR");
  const targetSignal = (rawTarget ?? "").toLocaleLowerCase("pt-BR");
  let kind: WebsiteContactKind | undefined;
  if (/wa\.me|wa\.link|api\.whatsapp\.com|whatsapp\.com|whatsapp:|whats\s*app/i.test(`${labelSignal} ${targetSignal}`)) kind = "whatsapp";
  else if (/\b(?:agend\w*|marcar|reserv\w*|book(?:ing)?|consulta|avalia[cç][aã]o)\b/i.test(labelSignal) || /(?:agend|reserv|booking)(?:\/|\b)/i.test(targetSignal)) kind = "booking";
  else if (/^tel:/i.test(rawTarget ?? "") || /\b(?:telefone|ligue|ligar|chamada|call)\b/i.test(labelSignal)) kind = "phone";
  else if (/\b(?:contato|contact|fale conosco|entre em contato|fale com)\b/i.test(labelSignal) || /\/(?:contato|contact)(?:\/|\b)/i.test(targetSignal)) kind = "contact";
  if (!kind) return undefined;
  const cleanLabel = label.replace(/\s+/g, " ").trim().slice(0, 140) || kindLabel(kind);
  return { kind, label: cleanLabel, element, ...(target ? { target } : {}) };
}

function kindLabel(kind: WebsiteContactKind): string {
  return ({ whatsapp: "WhatsApp", phone: "Telefone", booking: "Agendamento", contact: "Contato" })[kind];
}

function staticActions(html: string, baseUrl: string): WebsiteContactAction[] {
  const actions: WebsiteContactAction[] = [];
  const tags = /<(a|button)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi;
  for (const match of html.matchAll(tags)) {
    const tag = (match[1] ?? "a").toLowerCase();
    const attributes = match[2] ?? "";
    const body = match[3] ?? "";
    const label = [stripHtml(body), attribute(attributes, "aria-label"), attribute(attributes, "title"), attribute(body, "alt")]
      .filter((part): part is string => Boolean(part)).join(" ");
    const href = tag === "a" ? attribute(attributes, "href") : attribute(attributes, "data-href");
    const action = classifyAction(label, href, tag === "a" ? "link" : "button", baseUrl);
    if (action) actions.push(action);
  }
  return mergeActions([], actions);
}

function mergeActions(...groups: WebsiteContactAction[][]): WebsiteContactAction[] {
  const seen = new Set<string>();
  const result: WebsiteContactAction[] = [];
  for (const action of groups.flat()) {
    const key = `${action.kind}|${action.label.toLocaleLowerCase("pt-BR")}|${action.target ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(action);
    if (result.length >= 30) return result;
  }
  return result;
}

function inspectPage(url: string, status: number, html: string): WebsitePage {
  const contactActions = staticActions(html, url);
  const analytics = {
    ga4: /gtag\(|G-[A-Z0-9]+/i.test(html),
    gtm: /GTM-[A-Z0-9]+/i.test(html),
    metaPixel: /fbq\(|connect\.facebook\.net/i.test(html),
    googleAds: /AW-\d+|googleadservices\.com\/pagead\/conversion|googleads\.g\.doubleclick\.net/i.test(html),
    tiktokPixel: /analytics\.tiktok\.com|ttq\s*\./i.test(html),
    microsoftUet: /bat\.bing\.com\/bat\.js|uetq/i.test(html),
    clarity: /clarity\.ms\/tag\/|clarity\s*\(/i.test(html),
  };
  const visibleText = stripHtml(html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")).slice(0, 12_000);
  const hasWhatsApp = /wa\.me|wa\.link|api\.whatsapp\.com|whatsapp\.com|whatsapp:/i.test(html) || contactActions.some((action) => action.kind === "whatsapp");
  const hasBooking = /agend|reserv|book(?:ing)?/i.test(html) || contactActions.some((action) => action.kind === "booking");
  return {
    url,
    status,
    title: textMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i),
    description: textMatch(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)
      ?? textMatch(html, /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i),
    canonical: textMatch(html, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i),
    h1: [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].map((match) => stripHtml(match[1] ?? "")).filter(Boolean).slice(0, 5),
    hasWhatsApp,
    hasBooking,
    hasCallToAction: /fale conosco|entre em contato|agende|solicite|orçamento|saiba mais/i.test(visibleText) || contactActions.length > 0,
    contactActions,
    analytics,
    structuredData: /application\/ld\+json/i.test(html),
    visibleText,
  };
}

function extractLinks(html: string): string[] {
  return [...html.matchAll(/<a[^>]+href=["']([^"'#]+)["']/gi)]
    .map((match) => match[1]).filter((value): value is string => Boolean(value));
}

/** Shared profile providers must not lend their institutional pages to a business audit. */
export function isRelevantAuditLink(initial: URL, candidate: URL): boolean {
  if (candidate.origin !== initial.origin || !/^https?:$/.test(candidate.protocol)) return false;
  if (/(^|\.)linktr\.ee$/i.test(initial.hostname)) return candidate.pathname.replace(/\/$/, '') === initial.pathname.replace(/\/$/, '');
  return isUsefulPath(candidate.pathname);
}

function isUsefulPath(path: string): boolean {
  return path === "/" || /(servi|sobre|contato|agend|trat|especial|produto)/i.test(path);
}

async function capturePages(initial: URL, pages: WebsitePage[]): Promise<{ pages: RenderedPage[] }> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const hostChecks = new Map<string, Promise<void>>();
    await page.route("**/*", async (route) => {
      const requestUrl = route.request().url();
      if (requestUrl.startsWith("data:") || requestUrl.startsWith("blob:") || requestUrl === "about:blank") {
        await route.continue();
        return;
      }
      try {
        const target = new URL(requestUrl);
        if (!/^https?:$/.test(target.protocol)) throw new Error("Protocolo bloqueado.");
        let check = hostChecks.get(target.hostname);
        if (!check) {
          check = assertPublicUrl(target);
          hostChecks.set(target.hostname, check);
        }
        await check;
        await route.continue();
      } catch {
        await route.abort();
      }
    });

    const snapshots: RenderedPage[] = [];
    for (const item of pages.slice(0, 5)) {
      try {
        const requested = new URL(item.url);
        if (requested.origin !== initial.origin) continue;
        const response = await page.goto(requested.href, { waitUntil: "domcontentloaded", timeout: 20_000 });
        if (!response || new URL(page.url()).origin !== initial.origin) continue;
        await page.waitForLoadState("networkidle", { timeout: 1_500 }).catch(() => undefined);
        const visibleText = await page.locator("body").innerText({ timeout: 2_000 }).catch(() => "");
        if (/ErrorDocument|This resource was encountered while trying to use an ErrorDocument/i.test(visibleText)) continue;
        const snapshot = await page.evaluate(() => {
          const isVisible = (element: Element): boolean => {
            const style = window.getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0;
          };
          const elements = [...document.querySelectorAll("a[href], button, [role='button']")].filter(isVisible).slice(0, 250);
          return {
            title: document.title || undefined,
            description: document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content || undefined,
            h1: [...document.querySelectorAll("h1")].map((element) => element.innerText.trim()).filter(Boolean).slice(0, 5),
            contactActions: elements.map((element) => {
              const label = [element.textContent, element.getAttribute("aria-label"), element.getAttribute("title"), ...[...element.querySelectorAll("img[alt]")].map((image) => image.getAttribute("alt"))]
                .filter(Boolean).join(" ").replace(/\s+/g, " ").trim().slice(0, 240);
              const href = element instanceof HTMLAnchorElement ? element.href : element.getAttribute("data-href") ?? undefined;
              return { label, href, element: (element instanceof HTMLAnchorElement ? "link" : "button") as "link" | "button" };
            }).filter((item) => Boolean(item.label) || Boolean(item.href)),
          };
        });
        const contactActions = snapshot.contactActions
          .map((action) => classifyAction(action.label, action.href, action.element, requested.href))
          .filter((action): action is WebsiteContactAction => Boolean(action));
        const initialPage = requested.href === initial.href;
        let screenshotDataUrl: string | undefined;
        if (initialPage) {
          await page.evaluate(async () => { await document.fonts.ready; }).catch(() => undefined);
          const bytes = await page.screenshot({ type: "jpeg", quality: 72, fullPage: false }).catch(() => undefined);
          if (bytes) screenshotDataUrl = `data:image/jpeg;base64,${bytes.toString("base64")}`;
        }
        snapshots.push({
          requestedUrl: item.url,
          ...(snapshot.title ? { title: snapshot.title } : {}),
          ...(snapshot.description ? { description: snapshot.description } : {}),
          h1: snapshot.h1,
          visibleText: visibleText.slice(0, 12_000),
          contactActions: mergeActions([], contactActions),
          ...(screenshotDataUrl ? { screenshotDataUrl } : {}),
        });
      } catch {
        // Mantém a coleta HTML estática quando a página não renderiza no navegador.
      }
    }
    return { pages: snapshots };
  } finally {
    await browser.close();
  }
}
