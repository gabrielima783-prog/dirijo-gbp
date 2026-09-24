import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAIDiagnosticBrief } from '../src/core/ai-brief.js';
import type { Evidence } from '../src/shared/types.js';

test('resumo para IA preserva sinais personalizados e remove identidade de avaliadores', () => {
  const observedAt = new Date().toISOString();
  const evidence: Evidence[] = [
    { id: 'profile', analysisId: 'a', source: 'maps', title: 'Perfil', category: 'profile', observedAt, confidence: 1, value: { title: 'Clínica Exemplo', category: 'Clínica', phone: '27999999999' } },
    { id: 'reviews', analysisId: 'a', source: 'reviews', title: 'Avaliações', category: 'reputation', observedAt, confidence: 1, value: { sampleSize: 2, positiveCount: 1, criticalCount: 1, reviews: [{ name: 'Maria Segredo', profileUrl: 'https://google.com/maria', rating: 5, text: 'Fui atendida com muito cuidado.' }, { reviewerName: 'João Segredo', rating: 2, text: 'Demoraram para responder.' }] } },
    { id: 'site', analysisId: 'a', source: 'website', title: 'Site', category: 'website', observedAt, confidence: 1, value: { napConsistency: { nameFound: true, phoneFound: false }, pages: [{ url: 'https://exemplo.com', title: 'Clínica Exemplo', hasWhatsApp: true }] } },
    { id: 'instagram', analysisId: 'a', source: 'instagram', title: 'Instagram', category: 'instagram', observedAt, confidence: 1, value: { category: 'Saúde', biography: 'Cuidado próximo para sua família', latestPosts: [{ caption: 'Agende sua avaliação hoje', format: 'image' }] } },
  ];
  const brief = buildAIDiagnosticBrief(evidence);
  const serialized = JSON.stringify(brief);

  assert.match(serialized, /Fui atendida com muito cuidado/);
  assert.match(serialized, /Demoraram para responder/);
  assert.doesNotMatch(serialized, /Maria Segredo|João Segredo|google\.com\/maria/);
  assert.match(serialized, /Consistência entre Google e site/);
  assert.match(serialized, /Posicionamento entre Google e Instagram/);
  assert.match(serialized, /Agende sua avaliação hoje/);
  assert.doesNotMatch(serialized, /ownerResponseCount|ownerResponseRate|napConsistency|structuredData|businessAccount/);
});
