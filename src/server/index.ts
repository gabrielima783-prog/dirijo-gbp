import { DomainTransition, backgroundJobsInitiallyEnabled } from "./domain-transition.js";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { ApifyClient } from "./adapters/apify.js";
import { OpenAIDiagnosticClient } from "./adapters/openai.js";
import { PageSpeedClient, WebsiteAuditor } from "./adapters/website.js";
import { AuthStore } from "./auth.js";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createDatabase } from "./db.js";
import { AnalysisRepository } from "./repository.js";
import { AnalysisService } from "./service.js";
import { LocalSettingsStore } from "./settings.js";
import type { ServerConfig } from "./config.js";

const projectDir = resolve(process.cwd());
const baseConfig = loadConfig(projectDir);
const settings = new LocalSettingsStore(baseConfig, resolve(projectDir, "data"));
const config = settings.resolve();
const database = createDatabase({ filename: config.databaseFile });
const repository = new AnalysisRepository(database);
const transition = new DomainTransition(backgroundJobsInitiallyEnabled());
const sourceRunsRunning = () => Number((database.prepare("SELECT COUNT(*) AS count FROM source_runs WHERE status='running'").get() as { count: number }).count);
const analysesCollecting = () => Number((database.prepare("SELECT COUNT(*) AS count FROM analyses WHERE status='collecting'").get() as { count: number }).count);
if (transition.active) repository.recoverInterrupted();
else {
  if (!process.env.ACTIVE_BACKEND_URL || !process.env.ACTIVE_BACKEND_PUBLIC_URL || !process.env.BACKGROUND_JOBS_ENABLE_FILE) throw new Error("HTTP candidate requires explicit active backend and activation marker configuration.");
}
if (process.env.BACKGROUND_JOBS_ENABLE_FILE) {
  process.on("SIGUSR2", () => {
    if (transition.requestActivation(existsSync(process.env.BACKGROUND_JOBS_ENABLE_FILE!), sourceRunsRunning() + analysesCollecting())) repository.recoverInterrupted();
  });
  process.on("SIGHUP", () => transition.resumeProxy());
}
const auth = new AuthStore(database);
function integrations(current: ServerConfig) {
  return {
    apify: current.apifyToken ? new ApifyClient({ token: current.apifyToken, actorId: current.apifyActorId }) : undefined,
    instagram: current.apifyToken ? new ApifyClient({ token: current.apifyToken, actorId: current.apifyInstagramActorId }) : undefined,
    openai: current.openaiApiKey ? new OpenAIDiagnosticClient({ apiKey: current.openaiApiKey, model: current.openaiModel }) : undefined,
    pageSpeed: new PageSpeedClient(current.pageSpeedApiKey),
  };
}
const service = new AnalysisService({
  repository,
  ...integrations(config),
  website: new WebsiteAuditor(), costLimitUsd: config.costLimitUsd,
});
const baseUrl = process.env.NODE_ENV === "production" ? `http://127.0.0.1:${config.port}` : "http://127.0.0.1:5173";
const app = createApp({
  auth,
  transition,
  sourceRunsRunning,
  analysesCollecting,
  ...(process.env.ACTIVE_BACKEND_URL ? { activeBackendUrl: process.env.ACTIVE_BACKEND_URL, activeBackendPublicUrl: process.env.ACTIVE_BACKEND_PUBLIC_URL! } : {}),
  service,
  repository,
  config,
  settings,
  onSettingsChanged: (next) => service.updateIntegrations(integrations(next)),
  baseUrl,
});
const webRoot = resolve(projectDir, "dist-web");
if (existsSync(webRoot)) {
  app.use("/assets/*", serveStatic({ root: webRoot }));
  app.get("/fonts/*", serveStatic({ root: webRoot }));
  app.get("/dirijo-simbolo.svg", serveStatic({ root: webRoot }));
  app.get("*", serveStatic({ root: webRoot, path: "index.html" }));
}
serve({ fetch: app.fetch, hostname: config.host, port: config.port }, ({ address, port }) => {
  console.log(`Dirijo GBP disponível em http://${address}:${port}`);
});
