import assert from 'node:assert/strict';
import test from 'node:test';
import { OpenAIDiagnosticClient } from '../src/server/adapters/openai.js';
import type { Evidence, FindingPriority, SlideLayout } from '../src/shared/types.js';

const layouts: SlideLayout[] = ['profile', 'reputation', 'responses', 'media'];

function modelOutput(pass: 'draft' | 'verified') {
  const evidenceByLayout: Record<string, string> = { profile: 'e-profile', reputation: 'e-reviews', responses: 'e-reviews', media: 'e-media' };
  const categoryByLayout: Record<string, string> = { profile: 'profile', reputation: 'reputation', responses: 'reputation', media: 'media' };
  return {
    findings: layouts.map((layout, index) => ({
      targetLayout: layout,
      headline: pass === 'verified' && layout === 'profile' ? 'Google Maps: a descrição pode facilitar o primeiro contato.' : `${layout}: conclusão personalizada.`,
      evidenceIds: [evidenceByLayout[layout]],
      category: categoryByLayout[layout],
      priority: (index === 3 ? 'strength' : index === 0 ? 'important' : 'opportunity') as FindingPriority,
      observation: layout === 'profile' ? 'O perfil tem nota 4,9, 105 reviews e não apresenta descrição.' : layout === 'responses' ? 'ownerResponseCount = 0 e ownerResponseRate = 0.' : `Leitura específica de ${layout}.`,
      possibleImpact: 'Quem pesquisa pode precisar comparar mais antes de entrar em contato.',
      idealState: 'A informação deve responder as dúvidas principais e facilitar a decisão.',
      recommendedDirection: 'Deixar a informação principal mais clara e conectada ao próximo passo.',
    })),
  };
}

test('Responses API gera, verifica e monta os slides localmente', async () => {
  const requests: Array<Record<string, unknown>> = [];
  let call = 0;
  const client = new OpenAIDiagnosticClient({
    apiKey: 'test-key',
    fetch: async (_input, init) => {
      requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      call += 1;
      return new Response(JSON.stringify({
        id: `resp-${call}`,
        output_text: JSON.stringify(modelOutput(call === 1 ? 'draft' : 'verified')),
        usage: { input_tokens: 100 * call, output_tokens: 50 * call },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  const observedAt = new Date().toISOString();
  const evidence: Evidence[] = [
    { id: 'e-profile', analysisId: 'a-1', source: 'maps', title: 'Perfil', value: { title: 'Empresa', totalScore: 4.9, reviewsCount: 105, description: '' }, category: 'profile', observedAt, confidence: 1 },
    { id: 'e-reviews', analysisId: 'a-1', source: 'reviews', title: 'Avaliações', value: { sampleSize: 10, ownerResponseRate: 20, reviews: [{ name: 'Pessoa real', rating: 5, text: 'Atendimento acolhedor.' }] }, category: 'reputation', observedAt, confidence: 1 },
    { id: 'e-media', analysisId: 'a-1', source: 'maps', title: 'Fotos e atividade', value: { photoCount: 8, updateCount: 2 }, category: 'media', observedAt, confidence: 1 },
  ];
  const result = await client.generate('Empresa', evidence);

  assert.equal(requests.length, 2);
  for (const request of requests) {
    assert.equal(request.store, false);
    assert.equal((request.text as { format?: { type?: string; strict?: boolean } }).format?.type, 'json_schema');
    assert.equal((request.text as { format?: { type?: string; strict?: boolean } }).format?.strict, true);
  }
  const firstText = JSON.stringify(requests[0]?.input);
  const secondText = JSON.stringify(requests[1]?.input);
  assert.match(firstText, /representativeExamples/);
  assert.match(firstText, /Atendimento acolhedor/);
  assert.doesNotMatch(firstText, /Pessoa real/);
  assert.match(secondText, /draftFindings/);
  assert.match(secondText, /supportingEvidence/);
  assert.doesNotMatch(secondText, /slides/);
  assert.equal(result.verificationApplied, true);
  assert.equal(result.verificationResponseId, 'resp-2');
  assert.deepEqual(result.usage, { inputTokens: 300, outputTokens: 150 });
  assert.equal(result.output.slides[0]?.layout, 'cover');
  assert.equal(result.output.slides.at(-1)?.layout, 'cta');
  assert.match(result.output.slides.find((slide) => slide.layout === 'profile')?.title ?? '', /descrição pode facilitar/i);
  assert.doesNotMatch(JSON.stringify(result.output), /[\u2014\u2013\u2011]/u);
  const publishedText = [
    ...result.output.findings.flatMap((finding) => [finding.headline, finding.observation, finding.possibleImpact, finding.idealState, finding.recommendedDirection]),
    ...result.output.slides.flatMap((slide) => [slide.title, slide.body, slide.speakerNotes]),
  ].join(' ');
  assert.doesNotMatch(publishedText, /ownerResponse|\breviews?\b/i);
});
