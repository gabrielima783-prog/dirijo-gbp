import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { ApifyClient } from "./adapters/apify.js";
import { OpenAIDiagnosticClient } from "./adapters/openai.js";
import { PageSpeedClient, WebsiteAuditor } from "./adapters/website.js";
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
const repository = new AnalysisRepository(createDatabase({ filename: config.databaseFile }));
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
const baseUrl = process.env.NODE_ENV === "production" ? `http://${config.host}:${config.port}` : "http://127.0.0.1:5173";
const app = createApp({
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
