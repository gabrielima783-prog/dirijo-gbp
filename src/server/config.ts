import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

export interface ServerConfig {
  host: string; port: number; databaseFile: string; assetsDir: string;
  apifyToken?: string | undefined; apifyActorId: string; apifyInstagramActorId: string; openaiApiKey?: string | undefined; openaiModel: string;
  pageSpeedApiKey?: string | undefined; costLimitUsd: number;
}

function parseEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const result: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!match) continue;
    const key = match[1];
    let value = match[2];
    if (!key || value === undefined) continue;
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    result[key] = value;
  }
  return result;
}

function readSecret(name: string, sources: Array<Record<string, string | undefined>>, sourceDirs: string[]): string | undefined {
  for (let i = 0; i < sources.length; i += 1) {
    const source = sources[i];
    if (!source) continue;
    const direct = source[name]?.trim();
    if (direct) return direct;
    const file = source[`${name}_FILE`]?.trim();
    if (!file) continue;
    const path = isAbsolute(file) ? file : resolve(sourceDirs[i] ?? process.cwd(), file);
    if (existsSync(path)) {
      const value = readFileSync(path, "utf8").trim();
      if (value) return value;
    }
  }
  return undefined;
}

export function loadConfig(projectDir = process.cwd(), runtimeEnv: NodeJS.ProcessEnv = process.env): ServerConfig {
  const local = { ...parseEnvFile(join(projectDir, ".env")), ...parseEnvFile(join(projectDir, ".env.local")) };
  const runtime = runtimeEnv as Record<string, string | undefined>;
  const sources = [runtime, local];
  const sourceDirs = [process.cwd(), projectDir];
  return {
    host: runtime.HOST || local.HOST || "127.0.0.1",
    port: Number(runtime.PORT || local.PORT || 8787),
    databaseFile: resolve(projectDir, runtime.DATABASE_FILE || local.DATABASE_FILE || "data/dirijo-gbp.sqlite"),
    assetsDir: resolve(projectDir, runtime.ASSETS_DIR || local.ASSETS_DIR || "data/assets"),
    apifyToken: readSecret("APIFY_TOKEN", sources, sourceDirs),
    apifyActorId: runtime.APIFY_MAPS_ACTOR_ID || local.APIFY_MAPS_ACTOR_ID || "compass/crawler-google-places",
    apifyInstagramActorId: runtime.APIFY_INSTAGRAM_ACTOR_ID || local.APIFY_INSTAGRAM_ACTOR_ID || "apify/instagram-profile-scraper",
    openaiApiKey: readSecret("OPENAI_API_KEY", sources, sourceDirs),
    openaiModel: runtime.OPENAI_MODEL || local.OPENAI_MODEL || "gpt-5-mini",
    pageSpeedApiKey: readSecret("PAGESPEED_API_KEY", sources, sourceDirs),
    costLimitUsd: Number(runtime.ANALYSIS_COST_LIMIT_USD || local.ANALYSIS_COST_LIMIT_USD || 1),
  };
}

export function configurationStatus(config: ServerConfig) {
  return {
    apify: { configured: Boolean(config.apifyToken), actorId: config.apifyActorId, instagramActorId: config.apifyInstagramActorId },
    openai: { configured: Boolean(config.openaiApiKey), model: config.openaiModel },
    pageSpeed: { configured: true, hasApiKey: Boolean(config.pageSpeedApiKey) },
  };
}
