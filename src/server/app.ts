import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Hono, type Context } from "hono";
import type { AnalysisInput, Finding, SlideSpec, SourceName } from "../shared/types.js";
import { type ServerConfig } from "./config.js";
import { AnalysisRepository } from "./repository.js";
import { AnalysisService, CostLimitError, NotFoundError, OperationBusyError } from "./service.js";
import { exportAnalysisPdf } from "./pdf.js";
import { buildCompactDiagnostic } from "../core/compact-diagnostic.js";
import type { DomainTransition } from "./domain-transition.js";
import { AuthStore } from "./auth.js";
import { LocalSettingsStore, type SettingsProvider, type SettingsUpdate } from "./settings.js";

export interface AppDependencies {
  auth?: AuthStore;
  service: AnalysisService;
  repository: AnalysisRepository;
  config: ServerConfig;
  settings?: LocalSettingsStore | undefined;
  onSettingsChanged?: ((config: ServerConfig) => void) | undefined;
  baseUrl?: string | undefined;
  transition?: DomainTransition;
  sourceRunsRunning?: () => number;
  activeBackendUrl?: string;
  activeBackendPublicUrl?: string;
}

export function createApp(deps: AppDependencies): Hono {
  const app = new Hono();
  if (deps.transition) app.use("*", async (c, next) => {
    if (c.req.path === "/api/health") return next();
    await deps.transition!.waitForHandover();
    if (deps.transition!.active) return next();
    const origin = c.req.header("origin");
    const allowed = new Set([process.env.PUBLIC_URL ?? deps.baseUrl ?? c.req.url, ...(process.env.ADDITIONAL_PUBLIC_ORIGINS ?? "").split(",").filter(Boolean)].map(value => new URL(value.trim()).origin));
    if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method) && (!origin || !allowed.has(origin))) return c.json({ error: "Origem da solicitação inválida." }, 403);
    const url = new URL(c.req.url);
    const target = new URL(url.pathname + url.search, deps.activeBackendUrl!);
    const headers = new Headers(c.req.raw.headers);
    headers.delete("host");
    if (origin && allowed.has(origin)) headers.set("origin", new URL(deps.activeBackendPublicUrl!).origin);
    const proxied = new Request(target, c.req.raw);
    headers.forEach((value, name) => proxied.headers.set(name, value));
    proxied.headers.delete("host");
    deps.transition!.beginProxy();
    try {
      const response = await fetch(proxied, { redirect: "manual" });
      // Keep the request in flight until its response body has finished, including PDFs.
      const body = response.body;
      if (!body) { deps.transition!.finishProxy(); return response; }
      const reader = body.getReader();
      let finished = false;
      const finish = () => { if (!finished) { finished = true; deps.transition!.finishProxy(); } };
      const stream = new ReadableStream<Uint8Array>({
        async pull(controller) { try { const part = await reader.read(); if (part.done) { finish(); controller.close(); } else controller.enqueue(part.value); } catch(error) { finish(); controller.error(error); } },
        async cancel(reason) { finish(); await reader.cancel(reason); },
      });
      return new Response(stream, { status: response.status, statusText: response.statusText, headers: response.headers });
    } catch (error) { deps.transition!.finishProxy(); throw error; }
  });
  app.onError((error, c) => {
    if (error instanceof OperationBusyError) return c.json({error:error.message},409);
    if (error instanceof NotFoundError) return c.json({ error: error.message }, 404);
    if (error instanceof CostLimitError) return c.json({ error: error.message, estimatedUsd: error.estimatedUsd, limitUsd: error.limitUsd, requiresConfirmation: true }, 409);
    console.error("Falha da API:", error instanceof Error ? error.message : "erro desconhecido");
    return c.json({ error: error instanceof Error ? error.message : "Falha inesperada." }, 400);
  });

  if (deps.auth) {
    const auth = deps.auth;
    app.use("*", async (c, next) => {
      if (c.req.path === "/api/health") return next();
      if (!c.req.path.startsWith("/api/") && !/^\/(presentation|apresentacao|presenter|apresentador)\//.test(c.req.path)) return next();
      if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
        const origin = c.req.header("origin");
        const allowed = new Set([process.env.PUBLIC_URL ?? deps.baseUrl ?? c.req.url, ...(process.env.ADDITIONAL_PUBLIC_ORIGINS ?? "").split(",").filter(Boolean)].map(value => new URL(value.trim()).origin));
        if (!origin || !allowed.has(origin)) return c.json({error:"Origem da solicitação inválida."},403);
      }
      if (c.req.path === "/api/auth/login") return next();
      if (auth.isRenderer(c)) return next();
      const user = auth.user(c);
      if (!user) return c.json({error:"Entre para acessar o GBP."},401);
      if (user.mustChangePassword && !["/api/auth/me","/api/auth/password","/api/auth/logout"].includes(c.req.path)) return c.json({error:"Troque sua senha inicial para continuar."},403);
      if ((c.req.path.startsWith("/api/settings") || c.req.method === "DELETE") && user.role !== "admin") return c.json({error:"Acesso reservado ao administrador."},403);
      if (user.role !== "admin" && ["POST","PUT"].includes(c.req.method) && c.req.header("content-type")?.includes("application/json")) {
        const body = await c.req.json<Record<string,unknown>>().catch(()=>({} as Record<string,unknown>));
        if (body.confirmOverBudget || body.confirmOverCap) return c.json({error:"Somente o administrador pode autorizar exceder o limite."},403);
      }
      return next();
    });
    app.post("/api/auth/login", async c => {
      const body=await readJson<{email:string;password:string}>(c);
      if (typeof body.email !== "string" || typeof body.password !== "string") return c.json({error:"Informe e-mail e senha."},400);
      const user=auth.login(c,body.email,body.password);
      return user ? c.json(user) : c.json({error:"E-mail ou senha incorretos."},401);
    });
    app.get("/api/auth/me", c => c.json(auth.user(c) ?? {id:"renderer",name:"Renderização",role:"renderer",mustChangePassword:false}));
    app.post("/api/auth/logout", c => {auth.logout(c);return c.body(null,204);});
    app.post("/api/auth/password", async c => { const body=await readJson<{currentPassword:string;newPassword:string}>(c);auth.changePassword(c,body.currentPassword,body.newPassword);return c.json(auth.user(c)); });
  }
  app.get("/api/health", (c) => c.json({ ok: true, running: true, ...(deps.transition ? { proxyActive: !deps.transition.active, draining: deps.transition.draining, proxyInFlight: deps.transition.proxyInFlight, queuedRequests: deps.transition.queuedRequests, sourceRunsRunning: deps.sourceRunsRunning?.() ?? 0 } : {}) }));
  app.get("/api/settings", (c) => {
    if (!deps.settings) throw new Error("Configurações locais não disponíveis.");
    return c.json(deps.settings.publicView());
  });
  app.put("/api/settings", async (c) => {
    if (!deps.settings) throw new Error("Configurações locais não disponíveis.");
    const config = deps.settings.save(await readJson<SettingsUpdate>(c));
    Object.assign(deps.config, config);
    deps.onSettingsChanged?.(deps.config);
    return c.json(deps.settings.publicView());
  });
  app.post("/api/settings/test/:provider", async (c) => {
    if (!deps.settings) throw new Error("Configurações locais não disponíveis.");
    const provider = c.req.param("provider") as SettingsProvider;
    if (!VALID_SETTINGS_PROVIDERS.has(provider)) throw new Error("Integração inválida.");
    return c.json(await deps.settings.test(provider));
  });
  app.get("/api/analyses", (c) => c.json(deps.service.list()));
  app.post("/api/analyses", async (c) => {const analysis=deps.service.create(await readJson<AnalysisInput>(c));deps.auth?.record(c,analysis.id,"created");return c.json(analysis,201);});
  app.get("/api/analyses/:id", (c) => c.json(deps.service.get(c.req.param("id"))));
  app.get("/api/analyses/:id/versions", (c) => { deps.service.get(c.req.param("id")); return c.json(deps.repository.versions(c.req.param("id"))); });
  app.post("/api/analyses/:id/duplicate", (c) => {
    const result = deps.repository.duplicate(c.req.param("id")); if (!result) throw new NotFoundError(); deps.auth?.record(c,result.id,"duplicated");return c.json(result, 201);
  });
  app.delete("/api/analyses/:id", (c) => {
    const id = c.req.param("id");
    if (deps.service.isRunning(id)) throw new Error("Aguarde a coleta terminar antes de excluir esta análise.");
    if (!deps.repository.delete(id)) throw new NotFoundError();
    return c.body(null, 204);
  });
  app.get("/api/analyses/:id/cost-estimate", (c) => { const analysis = deps.service.get(c.req.param("id")); return c.json({ ...deps.service.estimate(analysis.input), estimatedCostUsd: analysis.estimatedCostUsd }); });
  app.post("/api/analyses/:id/collect", async (c) => {
    const id = c.req.param("id"); const analysis = deps.service.get(id); const body = await optionalJson<{ confirmOverBudget?: boolean; confirmOverCap?: boolean }>(c);
    const confirmed = Boolean(body.confirmOverBudget ?? body.confirmOverCap);
    const estimate = deps.service.estimate(analysis.input);
    if (estimate.requiresConfirmation && !confirmed) throw new CostLimitError(estimate.totalUsd, estimate.capUsd);
    deps.service.ensureAvailable();
    deps.auth?.record(c,id,"collection_requested");
    void deps.service.collect(id, confirmed).catch(() => undefined);
    return c.json(deps.service.get(id), 202);
  });
  app.post("/api/analyses/:id/retry/:source", async (c) => {
    const source = c.req.param("source") as SourceName;
    if (!VALID_SOURCES.has(source)) throw new Error("Fonte inválida.");
    const body = await optionalJson<{ confirmOverBudget?: boolean; confirmOverCap?: boolean }>(c);
    return c.json(await deps.service.retry(c.req.param("id"), source, Boolean(body.confirmOverBudget ?? body.confirmOverCap)));
  });
  app.put("/api/analyses/:id/findings", async (c) => { const id=c.req.param("id"); deps.service.get(id); const body=await readJson<{findings:Finding[]}>(c); deps.repository.replaceFindings(id,body.findings); return c.json(deps.service.get(id)); });
  app.put("/api/analyses/:id/slides", async (c) => { const id=c.req.param("id"); deps.service.get(id); const body=await readJson<{slides:SlideSpec[]}>(c); deps.repository.replaceSlides(id,body.slides); return c.json(deps.service.get(id)); });
  app.post("/api/analyses/:id/slides/:slideId/regenerate", async (c) => c.json(await deps.service.regenerateSlide(c.req.param("id"), c.req.param("slideId"))));
  app.post("/api/analyses/:id/finalize", (c) => c.json(deps.service.finalize(c.req.param("id"))));
  app.get("/api/analyses/:id/presentation", (c) => { const analysis=deps.service.get(c.req.param("id")); return c.json({ analysisId:analysis.id,companyName:analysis.companyName,generatedAt:analysis.updatedAt,slides:analysis.slides,totalDurationSeconds:analysis.slides.reduce((sum,slide)=>sum+slide.durationSeconds,0) }); });
  app.get("/api/analyses/:id/pdf", async (c) => {
    const analysis=deps.service.get(c.req.param("id")); if (!analysis.slides.length) throw new Error("A apresentação ainda não possui slides.");
    const compact=c.req.query("view") !== "complete";
    const format=compact || c.req.query("format") === "mobile" ? "mobile" : "desktop";
    const outputDir=join(process.cwd(),"data","exports"); mkdirSync(outputDir,{recursive:true}); const path=join(outputDir,`${analysis.id}-${compact ? "compact" : format}.pdf`);
    const renderer=deps.auth?.renderer(analysis.id);
    try { await deps.service.withHeavyOperation(() => exportAnalysisPdf({analysisId:analysis.id,outputPath:path,format,compact,baseUrl:deps.baseUrl??`http://127.0.0.1:${deps.config.port}`,expectedSlideCount:compact ? buildCompactDiagnostic(analysis).pageCount : analysis.slides.length,...(renderer ? {sessionToken:renderer.token} : {})})); }
    finally { renderer?.revoke(); }
    const bytes=readFileSync(path); c.header("content-type","application/pdf"); c.header("content-disposition",`attachment; filename=\"${pdfDownloadFilename(analysis.companyName,analysis.finalizedAt??analysis.updatedAt,format)}\"`); return c.body(bytes);
  });
  return app;
}

export function pdfDownloadFilename(companyName: string | undefined, dateValue: string, format: "desktop" | "mobile"): string {
  const words = (companyName || "Dirijo GBP").normalize("NFD").replace(/[\u0300-\u036f]/g, "").match(/[A-Za-z0-9]+/g) ?? ["Dirijo", "GBP"];
  const safeName = words.map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`).join("");
  const date = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit" })
    .format(new Date(dateValue)).replace(/\//g, "-");
  return `${safeName}-${date}${format === "mobile" ? "-Celular" : ""}.pdf`;
}

const VALID_SOURCES = new Set<SourceName>(["maps","reviews","website","pagespeed","instagram","operator","ai"]);
const VALID_SETTINGS_PROVIDERS = new Set<SettingsProvider>(["apify", "openai", "pagespeed"]);
async function readJson<T>(c: Context): Promise<T> { try { return await c.req.json<T>(); } catch { throw new Error("Corpo JSON inválido."); } }
async function optionalJson<T>(c: Context): Promise<Partial<T>> { const contentType=c.req.header("content-type")??""; if(!contentType.includes("application/json"))return{}; try{return await c.req.json<Partial<T>>();}catch{return{};} }
