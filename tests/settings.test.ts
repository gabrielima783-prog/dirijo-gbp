import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { ServerConfig } from '../src/server/config.js';
import { LocalSettingsStore } from '../src/server/settings.js';

test('configurações locais são cifradas, mascaradas e podem voltar ao ambiente', () => {
  const directory = mkdtempSync(join(tmpdir(), 'dirijo-settings-'));
  const base: ServerConfig = {
    host: '127.0.0.1', port: 8787, databaseFile: join(directory, 'db.sqlite'), assetsDir: join(directory, 'assets'),
    apifyToken: 'apify-environment-0000', apifyActorId: 'maps/default', apifyInstagramActorId: 'instagram/default',
    openaiApiKey: undefined, openaiModel: 'gpt-5-mini', pageSpeedApiKey: undefined, costLimitUsd: 1,
  };
  try {
    const store = new LocalSettingsStore(base, directory);
    const resolved = store.save({ apifyToken: 'apify-panel-1234', openaiApiKey: 'sk-secret-5678', pageSpeedApiKey: 'google-key-9012', openaiModel: 'gpt-5-mini' });
    assert.equal(resolved.apifyToken, 'apify-panel-1234');
    assert.equal(resolved.openaiApiKey, 'sk-secret-5678');
    const publicView = store.publicView();
    assert.equal(publicView.apify.source, 'painel');
    assert.match(publicView.apify.maskedValue ?? '', /1234$/);
    assert.doesNotMatch(JSON.stringify(publicView), /apify-panel|sk-secret|google-key/);
    assert.doesNotMatch(readFileSync(join(directory, 'settings.enc'), 'utf8'), /apify-panel|sk-secret|google-key/);
    const reverted = store.save({ apifyToken: null });
    assert.equal(reverted.apifyToken, 'apify-environment-0000');
    assert.equal(store.publicView().apify.source, 'ambiente');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
