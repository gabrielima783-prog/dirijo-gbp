import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { chromium } from "playwright";
import type { FetchLike } from "./apify.js";

export interface WebsitePage {
  url: string; status: number; title?: string | undefined; description?: string | undefined; canonical?: string | undefined;
  h1: string[]; hasWhatsApp: boolean; hasBooking: boolean; hasCallToAction: boolean;
  analytics: {
    ga4: boolean; gtm: boolean; metaPixel: boolean; googleAds: boolean;
    tiktokPixel: boolean; microsoftUet: boolean; clarity: boolean;
  };
  structuredData: boolean; visibleText?: string | undefined;
}
export interface WebsiteAudit { origin: string; pages: WebsitePage[]; https: boolean; robots: boolean; sitemap: boolean; screenshotDataUrl?: string }

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
      const response = await this.fetcher(url, { redirect: "manual", headers: { "user-agent": "DirijoGBP/1.0 (+local audit)" }, signal: AbortSignal.timeout(12_000) });
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
          if (candidate.origin === initial.origin && /^https?:$/.test(candidate.protocol) && !seen.has(candidate.href) && isUsefulPath(candidate.pathname)) queue.push(candidate);
        } catch { /* link inválido */ }
      }
    }
    const [robots, sitemap, screenshotDataUrl] = await Promise.all([
      exists(this.fetcher, new URL("/robots.txt", initial)),
      exists(this.fetcher, new URL("/sitemap.xml", initial)),
      captureHomepage(initial).catch(() => undefined),
    ]);
    return { origin: initial.origin, pages, https: initial.protocol === "https:", robots, sitemap, ...(screenshotDataUrl ? { screenshotDataUrl } : {}) };
  }
}

export class PageSpeedClient {
  constructor(private readonly apiKey?: string, private readonly fetcher: FetchLike = fetch) {}
  async inspect(url: string): Promise<Record<string, unknown>> {
    const target = normalizeUrl(url); await assertPublicUrl(target);
    const endpoint = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
    endpoint.searchParams.set("url", target.href); endpoint.searchParams.set("strategy", "mobile"); endpoint.searchParams.append("category", "performance");
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
      observedAt: new Date().toISOString(), strategy: "mobile",
    };
  }
}

function normalizeUrl(raw: string): URL { const value = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`; const url = new URL(value); if (!/^https?:$/.test(url.protocol)) throw new Error("URL do site precisa usar HTTP ou HTTPS."); url.username = ""; url.password = ""; return url; }
async function assertPublicUrl(url: URL): Promise<void> { if (["localhost","localhost.localdomain"].includes(url.hostname) || url.hostname.endsWith(".local")) throw new Error("Endereço local não permitido."); const addresses = await lookup(url.hostname, { all: true }); if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) throw new Error("Endereço privado não permitido."); }
function isPrivateAddress(address: string): boolean { if (isIP(address) === 4) { const parts = address.split(".").map(Number); const a=parts[0] ?? -1; const b=parts[1] ?? -1; return a===10 || a===127 || a===0 || (a===169&&b===254) || (a===172&&b>=16&&b<=31) || (a===192&&b===168); } const v=address.toLowerCase(); return v==="::1" || v==="::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80:") || v.startsWith("::ffff:127.") || v.startsWith("::ffff:10.") || v.startsWith("::ffff:192.168."); }
async function exists(fetcher: FetchLike, url: URL): Promise<boolean> { try { await assertPublicUrl(url); const response=await fetcher(url,{method:"GET",redirect:"manual",signal:AbortSignal.timeout(5_000)}); return response.ok; } catch { return false; } }
function textMatch(html:string,pattern:RegExp):string|undefined{return html.match(pattern)?.[1]?.replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim();}
function inspectPage(url:string,status:number,html:string):WebsitePage{return{url,status,title:textMatch(html,/<title[^>]*>([\s\S]*?)<\/title>/i),description:textMatch(html,/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)??textMatch(html,/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i),canonical:textMatch(html,/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i),h1:[...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].map(m=>(m[1]??"").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim()).slice(0,5),hasWhatsApp:/wa\.me|api\.whatsapp\.com|whatsapp:/i.test(html),hasBooking:/agend|reserv|book(?:ing)?/i.test(html),hasCallToAction:/fale conosco|entre em contato|agende|solicite|orçamento|saiba mais/i.test(html),analytics:{ga4:/gtag\(|G-[A-Z0-9]+/i.test(html),gtm:/GTM-[A-Z0-9]+/i.test(html),metaPixel:/fbq\(|connect\.facebook\.net/i.test(html),googleAds:/AW-\d+|googleadservices\.com\/pagead\/conversion|googleads\.g\.doubleclick\.net/i.test(html),tiktokPixel:/analytics\.tiktok\.com|ttq\s*\./i.test(html),microsoftUet:/bat\.bing\.com\/bat\.js|uetq/i.test(html),clarity:/clarity\.ms\/tag\/|clarity\s*\(/i.test(html)},structuredData:/application\/ld\+json/i.test(html),visibleText:html.replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/&nbsp;|&#160;/gi," ").replace(/\s+/g," ").trim().slice(0,12_000)}}
function extractLinks(html:string):string[]{return[...html.matchAll(/<a[^>]+href=["']([^"'#]+)["']/gi)].map(m=>m[1]).filter((value):value is string=>Boolean(value));}
function isUsefulPath(path:string):boolean{return path==="/"||/(servi|sobre|contato|agend|trat|especial|produto)/i.test(path);}

async function captureHomepage(url: URL): Promise<string> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.evaluate(async () => { await document.fonts.ready; });
    const visibleText = await page.locator("body").innerText().catch(() => "");
    if (/ErrorDocument|This resource was encountered while trying to use an ErrorDocument/i.test(visibleText)) throw new Error("A captura do site retornou uma página de erro.");
    const bytes = await page.screenshot({ type: "jpeg", quality: 72, fullPage: false });
    return `data:image/jpeg;base64,${bytes.toString("base64")}`;
  } finally {
    await browser.close();
  }
}
