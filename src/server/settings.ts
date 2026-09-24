import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { ServerConfig } from './config.js';

export type SettingsProvider = 'apify' | 'openai' | 'pagespeed';

interface SavedSettings {
  apifyToken?: string;
  openaiApiKey?: string;
  pageSpeedApiKey?: string;
  openaiModel?: string;
  apifyActorId?: string;
  apifyInstagramActorId?: string;
}

export interface SettingsUpdate {
  apifyToken?: string | null;
  openaiApiKey?: string | null;
  pageSpeedApiKey?: string | null;
  openaiModel?: string;
  apifyActorId?: string;
  apifyInstagramActorId?: string;
}

export interface PublicSettings {
  apify: { configured: boolean; maskedValue?: string; source: 'painel' | 'ambiente' | 'ausente'; actorId: string; instagramActorId: string };
  openai: { configured: boolean; maskedValue?: string; source: 'painel' | 'ambiente' | 'ausente'; model: string };
  pageSpeed: { configured: boolean; maskedValue?: string; source: 'painel' | 'ambiente' | 'ausente' };
  storage: { encrypted: true; location: string };
}

export class LocalSettingsStore {
  private readonly keyPath: string;
  private readonly settingsPath: string;

  constructor(private readonly baseConfig: ServerConfig, dataDir: string) {
    this.keyPath = join(dataDir, 'settings.key');
    this.settingsPath = join(dataDir, 'settings.enc');
  }

  resolve(): ServerConfig {
    const saved = this.read();
    return {
      ...this.baseConfig,
      apifyToken: saved.apifyToken ?? this.baseConfig.apifyToken,
      openaiApiKey: saved.openaiApiKey ?? this.baseConfig.openaiApiKey,
      pageSpeedApiKey: saved.pageSpeedApiKey ?? this.baseConfig.pageSpeedApiKey,
      openaiModel: saved.openaiModel ?? this.baseConfig.openaiModel,
      apifyActorId: saved.apifyActorId ?? this.baseConfig.apifyActorId,
      apifyInstagramActorId: saved.apifyInstagramActorId ?? this.baseConfig.apifyInstagramActorId,
    };
  }

  publicView(): PublicSettings {
    const saved = this.read();
    const resolved = this.resolve();
    return {
      apify: {
        configured: Boolean(resolved.apifyToken),
        ...(resolved.apifyToken ? { maskedValue: mask(resolved.apifyToken) } : {}),
        source: saved.apifyToken ? 'painel' : this.baseConfig.apifyToken ? 'ambiente' : 'ausente',
        actorId: resolved.apifyActorId,
        instagramActorId: resolved.apifyInstagramActorId,
      },
      openai: {
        configured: Boolean(resolved.openaiApiKey),
        ...(resolved.openaiApiKey ? { maskedValue: mask(resolved.openaiApiKey) } : {}),
        source: saved.openaiApiKey ? 'painel' : this.baseConfig.openaiApiKey ? 'ambiente' : 'ausente',
        model: resolved.openaiModel,
      },
      pageSpeed: {
        configured: Boolean(resolved.pageSpeedApiKey),
        ...(resolved.pageSpeedApiKey ? { maskedValue: mask(resolved.pageSpeedApiKey) } : {}),
        source: saved.pageSpeedApiKey ? 'painel' : this.baseConfig.pageSpeedApiKey ? 'ambiente' : 'ausente',
      },
      storage: { encrypted: true, location: 'armazenamento local protegido' },
    };
  }

  save(update: SettingsUpdate): ServerConfig {
    const next = { ...this.read() };
    updateSecret(next, 'apifyToken', update.apifyToken);
    updateSecret(next, 'openaiApiKey', update.openaiApiKey);
    updateSecret(next, 'pageSpeedApiKey', update.pageSpeedApiKey);
    updateText(next, 'openaiModel', update.openaiModel);
    updateText(next, 'apifyActorId', update.apifyActorId);
    updateText(next, 'apifyInstagramActorId', update.apifyInstagramActorId);
    this.write(next);
    return this.resolve();
  }

  async test(provider: SettingsProvider): Promise<{ ok: boolean; message: string }> {
    const config = this.resolve();
    if (provider === 'apify') {
      if (!config.apifyToken) return { ok: false, message: 'Adicione o token da Apify antes de testar.' };
      const url = new URL('https://api.apify.com/v2/users/me');
      url.searchParams.set('token', config.apifyToken);
      const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      return response.ok ? { ok: true, message: 'Apify conectada e pronta para as coletas.' } : { ok: false, message: `A Apify recusou a credencial (${response.status}).` };
    }
    if (provider === 'openai') {
      if (!config.openaiApiKey) return { ok: false, message: 'Adicione a chave da OpenAI antes de testar.' };
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { authorization: `Bearer ${config.openaiApiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model: config.openaiModel, input: 'Responda somente OK.', max_output_tokens: 16, store: false }),
        signal: AbortSignal.timeout(30_000),
      });
      return response.ok ? { ok: true, message: `OpenAI conectada. Modelo ativo: ${config.openaiModel}.` } : { ok: false, message: `A OpenAI recusou a credencial ou o modelo (${response.status}).` };
    }
    if (!config.pageSpeedApiKey) return { ok: false, message: 'Adicione a chave do PageSpeed antes de testar.' };
    const url = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
    url.searchParams.set('url', 'https://example.com');
    url.searchParams.set('strategy', 'mobile');
    url.searchParams.set('category', 'performance');
    url.searchParams.set('key', config.pageSpeedApiKey);
    const response = await fetch(url, { signal: AbortSignal.timeout(45_000) });
    return response.ok ? { ok: true, message: 'PageSpeed conectado e pronto para analisar sites.' } : { ok: false, message: `O PageSpeed recusou a credencial ou atingiu o limite (${response.status}).` };
  }

  private read(): SavedSettings {
    if (!existsSync(this.settingsPath)) return {};
    if (!existsSync(this.keyPath)) throw new Error('A chave local das configurações não foi encontrada.');
    const key = readFileSync(this.keyPath);
    const payload = JSON.parse(readFileSync(this.settingsPath, 'utf8')) as { iv: string; tag: string; data: string };
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
    const clear = Buffer.concat([decipher.update(Buffer.from(payload.data, 'base64')), decipher.final()]);
    return JSON.parse(clear.toString('utf8')) as SavedSettings;
  }

  private write(value: SavedSettings): void {
    mkdirSync(dirname(this.settingsPath), { recursive: true });
    const key = this.ensureKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    writeFileSync(this.settingsPath, JSON.stringify({ iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: encrypted.toString('base64') }), { mode: 0o600 });
    chmodSync(this.settingsPath, 0o600);
  }

  private ensureKey(): Buffer {
    if (!existsSync(this.keyPath)) writeFileSync(this.keyPath, randomBytes(32), { mode: 0o600 });
    chmodSync(this.keyPath, 0o600);
    const key = readFileSync(this.keyPath);
    if (key.length !== 32) throw new Error('A chave local das configurações é inválida.');
    return key;
  }
}

function mask(value: string): string {
  const suffix = value.slice(-4);
  return `••••••••${suffix}`;
}

function updateSecret(target: SavedSettings, key: 'apifyToken' | 'openaiApiKey' | 'pageSpeedApiKey', value: string | null | undefined): void {
  if (value === undefined || value === '') return;
  if (value === null) delete target[key];
  else target[key] = value.trim();
}

function updateText(target: SavedSettings, key: 'openaiModel' | 'apifyActorId' | 'apifyInstagramActorId', value: string | undefined): void {
  if (value === undefined) return;
  const trimmed = value.trim();
  if (trimmed) target[key] = trimmed;
}
