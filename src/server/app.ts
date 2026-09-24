import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Hono, type Context } from "hono";
import type { AnalysisInput, Finding, SlideSpec, SourceName } from "../shared/types.js";
import { configurationStatus, type ServerConfig } from "./config.js";
import { AnalysisRepository } from "./repository.js";
import { AnalysisService, CostLimitError, NotFoundError } from "./service.js";
import { exportAnalysisPdf } from "./pdf.js";
import { LocalSettingsStore, type SettingsProvider, type SettingsUpdate } from "./settings.js";

export interface AppDependencies {
  service: AnalysisService;
  repository: AnalysisRepository;
  config: ServerConfig;
  settings?: LocalSettingsStore | undefined;
  onSettingsChanged?: ((config: ServerConfig) => void) | undefined;
  baseUrl?: string | undefined;
}

export function createApp(deps: AppDependencies): Hono {
  const app = new Hono();
  app.onError((error, c) => {
    if (error instanceof NotFoundError) return c.json({ error: error.message }, 404);
    if (error instanceof CostLimitError) return c.json({ error: error.message, estimatedUsd: error.estimatedUsd, limitUsd: error.limitUsd, requiresConfirmation: true }, 409);
    console.error("Falha da API:", error instanceof Error ? error.message : "erro desconhecido");
    return c.json({ error: error instanceof Error ? error.message : "Falha inesperada." }, 400);
  });

  app.get("/api/health", (c) => c.json({ ok: true, running: true, configuration: configurationStatus(deps.config) }));
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
  app.post("/api/analyses", async (c) => c.json(deps.service.create(await readJson<AnalysisInput>(c)), 201));
  app.get("/api/analyses/:id", (c) => c.json(deps.service.get(c.req.param("id"))));
  app.get("/api/analyses/:id/versions", (c) => { deps.service.get(c.req.param("id")); return c.json(deps.repository.versions(c.req.param("id"))); });
  app.post("/api/analyses/:id/duplicate", (c) => {
    const result = deps.repository.duplicate(c.req.param("id")); if (!result) throw new NotFoundError(); return c.json(result, 201);
  });
  app.get("/api/analyses/:id/cost-estimate", (c) => { const analysis = deps.service.get(c.req.param("id")); return c.json({ ...deps.service.estimate(analysis.input), estimatedCostUsd: analysis.estimatedCostUsd }); });
  app.post("/api/analyses/:id/collect", async (c) => {
    const id = c.req.param("id"); const analysis = deps.service.get(id); const body = await optionalJson<{ confirmOverBudget?: boolean; confirmOverCap?: boolean }>(c);
    const confirmed = Boolean(body.confirmOverBudget ?? body.confirmOverCap);
    const estimate = deps.service.estimate(analysis.input);
    if (estimate.requiresConfirmation && !confirmed) throw new CostLimitError(estimate.totalUsd, estimate.capUsd);
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
    const format=c.req.query("format") === "mobile" ? "mobile" : "desktop";
    const outputDir=join(process.cwd(),"data","exports"); mkdirSync(outputDir,{recursive:true}); const path=join(outputDir,`${analysis.id}-${format}.pdf`);
    await exportAnalysisPdf({analysisId:analysis.id,outputPath:path,format,baseUrl:deps.baseUrl??`http://${deps.config.host}:${deps.config.port}`,expectedSlideCount:analysis.slides.length});
    const suffix=format === "mobile" ? "mobile-9x16" : "apresentacao-16x9";
    const bytes=readFileSync(path); c.header("content-type","application/pdf"); c.header("content-disposition",`attachment; filename=\"dirijo-gbp-${analysis.id.slice(0,8)}-${suffix}.pdf\"`); return c.body(bytes);
  });
  return app;
}

const VALID_SOURCES = new Set<SourceName>(["maps","reviews","competitors","website","pagespeed","instagram","operator","ai"]);
const VALID_SETTINGS_PROVIDERS = new Set<SettingsProvider>(["apify", "openai", "pagespeed"]);
async function readJson<T>(c: Context): Promise<T> { try { return await c.req.json<T>(); } catch { throw new Error("Corpo JSON inválido."); } }
async function optionalJson<T>(c: Context): Promise<Partial<T>> { const contentType=c.req.header("content-type")??""; if(!contentType.includes("application/json"))return{}; try{return await c.req.json<Partial<T>>();}catch{return{};} }
