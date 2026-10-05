import assert from 'node:assert/strict';
import test from 'node:test';
import { sanitizeReview } from '../src/server/adapters/apify.js';
import { dedupeReviews, summarizeReviews } from '../src/server/service.js';
import { responseNarrative, assertResponseFacts } from '../src/core/review-responses.js';
import { createDiagnostic } from '../src/core/diagnostic.js';
import type { Evidence } from '../src/shared/types.js';

test('normaliza resposta pública no formato plano oficial Apify sem dados pessoais', () => {
  const review = sanitizeReview({ stars: 5, text: 'Ótimo atendimento', name: 'Não guardar', responseFromOwnerText: 'Agradecemos a visita!', responseFromOwnerDate: '2026-10-01T12:00:00Z' })!;
  assert.equal(review.responseText, 'Agradecemos a visita!');
  assert.equal(review.responseAt, '2026-10-01T12:00:00Z');
  assert.equal(review.responseStatus, 'present');
  assert.doesNotMatch(JSON.stringify(review), /Não guardar/);
  assert.equal(sanitizeReview({ stars: 4, responseFromOwner: { text: 'Obrigado', publishedAtDate: '2026-09-01' } })?.responseText, 'Obrigado');
  assert.equal(sanitizeReview({ stars: 4, responseText: 'Obrigado' })?.responseText, 'Obrigado');
});

test('diferencia ausência explícita de campo não coletado e preserva resposta na deduplicação', () => {
  const absent = sanitizeReview({ stars: 5, text: 'Ótimo', responseFromOwnerText: null, responseFromOwnerDate: null })!;
  const missing = sanitizeReview({ stars: 5, text: 'Ótimo' })!;
  const answered = sanitizeReview({ stars: 5, text: 'Ótimo', responseFromOwnerText: 'Obrigado' })!;
  assert.equal(absent.responseStatus, 'absent');
  assert.equal(missing.responseStatus, 'unknown');
  assert.equal(dedupeReviews([missing, absent, answered]).length, 1);
  assert.equal(dedupeReviews([missing, answered])[0]?.responseText, 'Obrigado');
  assert.equal(dedupeReviews([answered, missing])[0]?.responseText, 'Obrigado');
  assert.equal(summarizeReviews([missing]).ownerResponseRate, undefined);
  assert.equal(summarizeReviews([]).ownerResponseRate, undefined);
  assert.equal(summarizeReviews([absent]).ownerResponseRate, 0);
  assert.equal(summarizeReviews([answered]).ownerResponseRate, 100);
  assert.equal(summarizeReviews([answered, missing]).ownerResponseUnknownCount, 1);
});

for (const [label, count, total, state] of [['zero', 0, 5, 'none'], ['parcial abaixo de 60%', 1, 5, 'partial'], ['todas', 5, 5, 'all']] as const) {
  test(`apresentação usa respostas verificadas: ${label}`, () => {
    const reviews = Array.from({ length: total }, (_, i) => sanitizeReview({ stars: 5, text: `Relato ${i}`, responseFromOwnerText: i < count ? 'Obrigado' : null })!);
    const value = { ...summarizeReviews(reviews), reviews };
    const observedAt = new Date().toISOString();
    const evidence: Evidence[] = [
      { id: 'profile', analysisId: 'test', source: 'maps', category: 'profile', title: 'Perfil', value: { title: 'Empresa', totalScore: 5, reviewsCount: 20 }, observedAt, confidence: 1 },
      { id: 'reviews', analysisId: 'test', source: 'reviews', category: 'reputation', title: 'Avaliações', value, observedAt, confidence: 1 },
      { id: 'media', analysisId: 'test', source: 'maps', category: 'media', title: 'Fotos', value: { photoCount: 5 }, observedAt, confidence: 1 },
    ];
    const result = createDiagnostic({ analysisId: 'test', companyName: 'Empresa', input: { companyName: 'Empresa' }, evidence });
    const slide = result.presentation.slides.find((slide) => slide.layout === 'responses')!;
    assert.equal(responseNarrative(value).state, state);
    assert.match(slide.body, new RegExp(`${count} receberam resposta pública`));
    if (count > 0) assert.doesNotMatch(JSON.stringify(result), /Nenhuma recebeu resposta|nenhuma avaliação analisada recebeu retorno/iu);
    assert.equal(result.findings.find((finding) => finding.evidenceIds.includes('reviews'))?.priority, count === total ? 'strength' : 'important');
  });
}

test('bloqueia falsas conclusões zero/todas e não inventa zero em amostra desconhecida', () => {
  assert.throws(() => assertResponseFacts('Nenhuma avaliação recebeu resposta.', { sampleSize: 5, ownerResponseCount: 1, ownerResponseRate: 20 }), /incompatível/);
  assert.throws(() => assertResponseFacts('Todas as avaliações receberam resposta.', { sampleSize: 5, ownerResponseCount: 1, ownerResponseRate: 20 }), /incompatível/);
  assert.throws(() => assertResponseFacts('Nenhuma avaliação recebeu resposta.', { sampleSize: 0 }), /incompatível/);
  assert.equal(responseNarrative({ sampleSize: 0 }).state, 'unknown');
  assert.equal(responseNarrative({ sampleSize: 5, ownerResponseCount: 0, ownerResponseRate: 0, reviews: [{ rating: 5 }] }).state, 'unknown');
  assert.equal(responseNarrative({ sampleSize: 500, ownerResponseCount: 499, ownerResponseRate: 100 }).state, 'partial');
});
