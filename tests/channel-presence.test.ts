import assert from 'node:assert/strict';
import test from 'node:test';
import { inputChannelPresence } from '../src/core/channel-presence.js';
import { normalizeInstagramProfile } from '../src/server/adapters/apify.js';
import { generateFindings } from '../src/core/diagnostic.js';
import { createDatabase } from '../src/server/db.js';
import { AnalysisRepository } from '../src/server/repository.js';
import { AnalysisService } from '../src/server/service.js';
import type { AnalysisInput } from '../src/shared/types.js';

const confirmation = { method: 'responsável', observedAt: '2026-10-07T12:00:00Z', reference: 'confirmado pelo responsável nesta análise' };

test('URL vazia é desconhecida; ausência exige confirmação auditável e URL identificada prevalece', () => {
  assert.equal(inputChannelPresence({}, 'google').state, 'not_provided');
  assert.equal(inputChannelPresence({ channelPresence: { google: { state: 'absent_confirmed' } } }, 'google').state, 'not_provided');
  assert.equal(inputChannelPresence({ channelPresence: { google: { state: 'absent_confirmed', confirmation } } }, 'google').state, 'absent_confirmed');
  assert.equal(inputChannelPresence({ mapsUrl: 'https://maps.google.com/?cid=1', channelPresence: { google: { state: 'absent_confirmed', confirmation } } }, 'google').state, 'present_unassessed');
});

test('Instagram reconhece convites reais para avaliação, mantendo contador como sinal da amostra', () => {
  const profile = normalizeInstagramProfile({ username: 'clinica', latestPosts: [
    'Faça sua avaliação', 'Marque sua avaliação', 'Venha fazer sua avaliação', 'Agendamentos pelo WhatsApp', 'Conteúdo sobre serviços',
  ].map((caption, i) => ({ caption, url: `https://instagram.com/p/post${i}/`, timestamp: '2026-10-06T12:00:00Z' })) }, 'https://instagram.com/clinica', new Date('2026-10-07T12:00:00Z'));
  assert.equal(profile.signals.postsWithCallToAction, 4);
  const findings = generateFindings([{ id: 'ig', analysisId: '1', source: 'instagram', category: 'instagram', title: 'Instagram', confidence: 1, observedAt: '2026-10-07', value: { ...profile, biography: 'Serviços e agendamentos' } }]);
  assert.match(findings[0]!.observation, /5 publicações nos últimos 30 dias/);
  assert.doesNotMatch(JSON.stringify(findings), /nenhuma nos últimos 30|imóveis|Barra Velha/);
});

test('falha e perfil privado preservam cobertura sem achado negativo e confirmação persiste', async () => {
  for (const privateAccount of [false, true]) {
    const repository = new AnalysisRepository(createDatabase({ filename: ':memory:' }));
    const service = new AnalysisService({ repository, instagram: { async run() {
      if (!privateAccount) throw new Error('falha de conexão');
      return { items: [{ username: 'clinica', private: true }] };
    } } as never });
    const input: AnalysisInput = { companyName: 'Clínica', instagramUrl: 'https://instagram.com/clinica', channelPresence: { google: { state: 'absent_confirmed', confirmation }, website: { state: 'absent_confirmed', confirmation } }, googleEligibility: 'unknown' };
    const created = service.create(input);
    const result = await service.collect(created.id);
    const coverage = result.evidence.find(item => item.source === 'instagram')!.value as { presence: { state: string } };
    assert.equal(coverage.presence.state, privateAccount ? 'restricted' : 'collection_failed');
    assert.equal(result.evidence.find(item => item.source === 'instagram')!.channelPresence?.state, coverage.presence.state);
    assert.equal(result.findings.length, 0);
    assert.equal(result.input.channelPresence?.google?.confirmation?.reference, confirmation.reference);
    assert.equal((result.evidence.find(item => item.source === 'maps')!.value as { presence: { state: string } }).presence.state, 'absent_confirmed');
  }
});

test('menção descritiva a avaliação não é tratada como convite pelo fallback', () => {
  const findings = generateFindings([{ id: 'ig', analysisId: '1', source: 'instagram', category: 'instagram', title: 'Instagram', confidence: 1, observedAt: '2026-10-07', value: { biography: 'Clínica de serviços', latestPosts: [{ caption: 'A avaliação mostrou melhora' }], signals: { postsLast30Days: 1 } } }]);
  assert.doesNotMatch(findings[0]!.observation, /convidam para contato/);
  assert.equal(findings[0]!.priority, 'opportunity');
});

test('audita o destino específico do Instagram quando Google e site não foram informados', async () => {
  const repository = new AnalysisRepository(createDatabase({ filename: ':memory:' }));
  let inspected: string | undefined;
  const service = new AnalysisService({ repository,
    instagram: { async run() { return { runId: 'ig', datasetId: 'ig', costUsd: 0, items: [{ username: 'clinica', biography: 'Agendamentos pelo link', externalUrl: 'https://linktr.ee/clinica', latestPosts: [] }] }; } } as never,
    website: { async audit(url: string) { inspected = url; return { origin: 'https://linktr.ee', pages: [], https: true }; } } as never,
  });
  const created = service.create({ companyName: 'Clínica', instagramUrl: 'https://instagram.com/clinica' });
  const result = await service.collect(created.id);
  assert.equal(inspected, 'https://linktr.ee/clinica');
  assert.equal(result.evidence.find(item => item.source === 'website')!.sourceUrl, inspected);
  assert.equal(result.sourceStatuses.website.status, 'completed');
});
