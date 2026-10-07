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


test('resumo distingue CTA real da empresa e promoções da Linktree sem alterar evidências', () => {
  const actions = [
    { kind: 'whatsapp', label: 'Agendar Avaliação', element: 'link', target: 'https://wa.me/message/REAL' },
    { kind: 'booking', label: 'Agendar Avaliação Business Account Share', element: 'button' },
    { kind: 'booking', label: 'Agendar AvaliaçãoBusiness Account Share', element: 'button' },
    { kind: 'contact', label: 'Collect leads with contact forms', element: 'link', target: 'https://linktr.ee/features/contact-forms' },
    { kind: 'contact', label: 'Create a digital business card', element: 'link', target: 'https://linktr.ee/digital-business-cards' },
    { kind: 'contact', label: 'Perfil da empresa', element: 'link', target: 'https://linktr.ee/empresa' },
  ];
  const evidence: Evidence[] = [{
    id: 'site', analysisId: 'a', source: 'website', title: 'Site', category: 'website',
    observedAt: '2026-10-07T18:00:00.000Z', confidence: 1,
    value: { origin: 'https://linktr.ee/empresa', napConsistency: { contactActions: actions },
      pages: [{ url: 'https://linktr.ee/empresa', contactActions: actions },
        { url: 'https://linktr.ee/empresa/extra', contactActions: actions }] },
  }];
  const original = structuredClone(evidence);
  const facts = buildAIDiagnosticBrief(evidence).evidence[0]?.facts as Record<string, unknown>;
  const serialized = JSON.stringify(facts);
  assert.match(serialized, /Agendar Avaliação/);
  assert.match(serialized, /wa\.me\/message\/REAL/);
  assert.match(serialized, /Perfil da empresa/);
  assert.doesNotMatch(serialized, /Business Account Share|Collect leads|digital business card|features\/contact-forms|digital-business-cards/);
  assert.deepEqual(evidence, original);
  const pages = facts['páginas analisadas'] as Array<Record<string, unknown>>;
  assert.equal((pages[0]?.['botões e links identificados'] as unknown[]).length, 4);
  assert.equal((pages[1]?.['botões e links identificados'] as unknown[]).length, 4);
});
