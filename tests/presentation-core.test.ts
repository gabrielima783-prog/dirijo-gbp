import assert from 'node:assert/strict';
import test from 'node:test';
import { createDiagnostic } from '../src/core/diagnostic.js';
import type { AnalysisInput, AssessedEvidence, DiagnosticContext } from '../src/core/types.js';

function evidence(
  id: string,
  source: AssessedEvidence['source'],
  title: string,
  value: unknown,
  extras: Partial<AssessedEvidence> = {},
): AssessedEvidence {
  return {
    id,
    analysisId: 'analysis-1',
    source,
    title,
    value,
    observedAt: '2026-09-23T12:00:00.000Z',
    confidence: 0.95,
    ...extras,
  };
}

function context(input: AnalysisInput): DiagnosticContext {
  const items: AssessedEvidence[] = [
    evidence('ev-name', 'maps', 'Nome da empresa', 'Clínica Horizonte', {
      category: 'profile',
      assessment: 'positive',
    }),
    evidence('ev-profile', 'maps', 'Descrição do perfil ausente', 'Não encontrada', {
      category: 'profile',
      assessment: 'negative',
      impact: 'high',
    }),
    evidence('ev-reviews', 'reviews', 'Respostas às avaliações', '6 de 20 avaliações recentes têm resposta', {
      category: 'reputation',
      assessment: 'negative',
    }),
    evidence('ev-media', 'maps', 'Fotos e atividade recente', 'Última foto pública observada há 7 meses', {
      category: 'media',
      assessment: 'negative',
    }),
    evidence('ev-competitors', 'competitors', 'Comparação da amostra local', '4 de 5 negócios têm mais avaliações recentes', {
      category: 'comparison',
      assessment: 'neutral',
    }),
  ];
  if (input.websiteUrl) items.push(
    evidence('ev-site', 'website', 'Contato no site', 'WhatsApp visível na página inicial', {
      category: 'website',
      assessment: 'positive',
    }),
  );
  if (input.instagramUrl) items.push(
    evidence('ev-instagram', 'instagram', 'Bio e chamada para ação', 'Serviço principal claro, sem link direto para agendamento', {
      category: 'instagram',
      assessment: 'neutral',
    }),
  );
  return {
    analysisId: 'analysis-1',
    input,
    generatedAt: '2026-09-23T12:05:00.000Z',
    evidence: items,
  };
}

test('gera 8 slides com Maps, prioridades e CTA final', () => {
  const result = createDiagnostic(
    context({
      mapsUrl: 'https://www.google.com/maps/place/clinica',
      companyName: 'Clínica Horizonte',
    }),
  );

  assert.equal(result.presentation.slides.length, 8);
  assert.equal(result.presentation.slides[0]?.layout, 'cover');
  assert.match(result.presentation.slides[1]?.title ?? '', /caminho que um cliente percorre/i);
  assert.match(result.presentation.slides[1]?.body ?? '', /Verde[\s\S]*Amarelo[\s\S]*Vermelho/i);
  assert.equal(result.presentation.slides.at(-2)?.layout, 'priorities');
  assert.equal(result.presentation.slides.at(-1)?.layout, 'cta');
  assert.match(result.presentation.slides.at(-1)?.body ?? '', /organização dos contatos e inteligência artificial/i);
  assert.ok(result.presentation.totalDurationSeconds >= 240);
  assert.ok(result.presentation.totalDurationSeconds <= 360);
  assert.ok(result.presentation.slides.every((slide) => slide.durationSeconds >= 30));
  assert.ok(result.presentation.slides.every((slide) => slide.durationSeconds <= 45));
});

test('adapta a apresentação para 9 slides com site e 10 com Instagram', () => {
  const mapsAndSite = createDiagnostic(
    context({
      mapsUrl: 'https://maps.google.com/?cid=123',
      websiteUrl: 'https://clinica.example',
    }),
  );
  assert.equal(mapsAndSite.presentation.slides.length, 9);
  assert.ok(mapsAndSite.presentation.slides.some((slide) => slide.layout === 'website'));

  const complete = createDiagnostic(
    context({
      mapsUrl: 'https://maps.google.com/?cid=123',
      websiteUrl: 'https://clinica.example',
      instagramUrl: 'https://instagram.com/clinica',
      instagramChecklist: { bio: 'Especialidade clara', opportunities: 'Incluir agendamento' },
    }),
  );
  assert.equal(complete.presentation.slides.length, 10);
  assert.ok(complete.presentation.slides.some((slide) => slide.layout === 'instagram'));
});

test('inclui slide de site quando a URL foi descoberta e virou evidência', () => {
  const diagnosticContext = context({ mapsUrl: 'https://maps.google.com/?cid=123' });
  diagnosticContext.evidence.push(
    evidence('ev-pagespeed', 'pagespeed', 'Desempenho mobile', { performanceScore: 82 }, { category: 'website' }),
  );
  const result = createDiagnostic(diagnosticContext);
  assert.equal(result.presentation.slides.length, 9);
  assert.ok(result.presentation.slides.some((slide) => slide.layout === 'website'));
});

test('todo achado factual mantém vínculo com uma evidência existente', () => {
  const diagnosticContext = context({ mapsUrl: 'https://maps.app.goo.gl/example' });
  const result = createDiagnostic(diagnosticContext);
  const evidenceIds = new Set(diagnosticContext.evidence.map((item) => item.id));

  assert.ok(result.findings.length > 0);
  for (const finding of result.findings) {
    assert.ok(finding.evidenceIds.length > 0);
    assert.ok(finding.evidenceIds.every((id) => evidenceIds.has(id)));
  }
});

test('remove identidade pessoal de avaliadores ao resumir evidências', () => {
  const diagnosticContext = context({ mapsUrl: 'https://maps.app.goo.gl/example' });
  diagnosticContext.evidence.push(
    evidence(
      'ev-private-review',
      'reviews',
      'Amostra de avaliações',
      [{ reviewerName: 'Pessoa Exemplo', rating: 2, text: 'Demora no retorno' }],
      { category: 'reputation', assessment: 'negative' },
    ),
  );
  const result = createDiagnostic(diagnosticContext);
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /Pessoa Exemplo/);
  assert.match(serialized, /Demora no retorno/);
});

test('bloqueia ranking exato, score genérico e causalidade absoluta', () => {
  for (const unsafeValue of [
    'A empresa está em 9º lugar',
    'Score geral de 72/100',
    'Esta mudança garante mais visibilidade',
    'Posição frente à concorrência',
  ]) {
    const diagnosticContext = context({ mapsUrl: 'https://maps.app.goo.gl/example' });
    diagnosticContext.evidence.push(
      evidence('ev-unsafe', 'maps', 'Conclusão', unsafeValue, {
        category: 'general',
        assessment: 'negative',
      }),
    );
    assert.throws(() => createDiagnostic(diagnosticContext), /Afirmação não permitida/);
  }
});
