import { assertPlainLanguage, assertSafeSlideText, inferCategory } from './content.js';
import type { DiagnosticContext, Evidence, Finding, PresentationSpec, SlideLayout } from './types.js';

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function validateDiagnosticContext(context: DiagnosticContext): void {
  if (!context.analysisId.trim()) throw new Error('analysisId é obrigatório');
  if (!isHttpUrl(context.input.mapsUrl)) throw new Error('mapsUrl deve ser uma URL HTTP válida');
  if (context.input.websiteUrl && !isHttpUrl(context.input.websiteUrl)) {
    throw new Error('websiteUrl deve ser uma URL HTTP válida');
  }
  if (context.input.instagramUrl && !isHttpUrl(context.input.instagramUrl)) {
    throw new Error('instagramUrl deve ser uma URL HTTP válida');
  }
  if (!context.evidence.length) throw new Error('A apresentação exige pelo menos uma evidência coletada');
  const ids = new Set<string>();
  for (const evidence of context.evidence) {
    if (!evidence.id.trim()) throw new Error('Toda evidência precisa de id');
    if (ids.has(evidence.id)) throw new Error(`Id de evidência duplicado: ${evidence.id}`);
    ids.add(evidence.id);
    if (!Number.isFinite(evidence.confidence) || evidence.confidence < 0 || evidence.confidence > 1) {
      throw new Error(`Confiança inválida na evidência ${evidence.id}`);
    }
    if (Number.isNaN(Date.parse(evidence.observedAt))) {
      throw new Error(`Data inválida na evidência ${evidence.id}`);
    }
  }
}

export function validateFindings(findings: Finding[], evidence: Evidence[]): void {
  const evidenceIds = new Set(evidence.map((item) => item.id));
  for (const finding of findings) {
    if (!finding.evidenceIds.length) throw new Error(`Achado ${finding.id} não possui evidência`);
    const missing = finding.evidenceIds.filter((id) => !evidenceIds.has(id));
    if (missing.length) throw new Error(`Achado ${finding.id} referencia evidências ausentes: ${missing.join(', ')}`);
    assertSafeSlideText([
      finding.observation,
      finding.possibleImpact,
      finding.idealState,
      finding.recommendedDirection,
    ]);
    if (!finding.idealState.trim()) throw new Error(`Achado ${finding.id} não explica como deveria estar`);
    assertPlainLanguage(`${finding.observation} ${finding.possibleImpact} ${finding.idealState} ${finding.recommendedDirection}`);
  }
}

export function requiredSlideLayouts(evidence: Evidence[]): SlideLayout[] {
  const layouts: SlideLayout[] = ['cover', 'summary', 'profile', 'reputation', 'responses', 'media'];
  if (evidence.some((item) => item.source === 'website' || item.source === 'pagespeed')) layouts.push('website');
  if (evidence.some((item) => item.source === 'instagram')) layouts.push('instagram');
  layouts.push('priorities', 'cta');
  return layouts;
}

const relevantCategories: Partial<Record<SlideLayout, string[]>> = {
  profile: ['profile', 'comparison'],
  reputation: ['reputation'],
  responses: ['reputation'],
  media: ['media'],
  website: ['website'],
  instagram: ['instagram'],
};

function hasNarrativeStructure(body: string): boolean {
  return ['O que encontramos', 'Por que isso pode custar oportunidades', 'Como deveria estar', 'Direção']
    .every((label) => body.includes(label));
}

export function validatePresentation(presentation: PresentationSpec, evidence: Evidence[]): void {
  const count = presentation.slides.length;
  if (count < 8 || count > 10) throw new Error(`A apresentação precisa ter entre 8 e 10 slides; recebeu ${count}`);
  if (presentation.slides[0]?.layout !== 'cover') throw new Error('O primeiro slide precisa ser a capa');
  if (presentation.slides[count - 2]?.layout !== 'priorities' || presentation.slides[count - 1]?.layout !== 'cta') {
    throw new Error('A apresentação precisa terminar com prioridades e convite para conversa');
  }
  const expectedLayouts = requiredSlideLayouts(evidence);
  const receivedLayouts = presentation.slides.map((slide) => slide.layout);
  if (JSON.stringify(receivedLayouts) !== JSON.stringify(expectedLayouts)) {
    throw new Error(`Estrutura de slides incompatível com as evidências. Esperado: ${expectedLayouts.join(', ')}`);
  }
  const ids = new Set<string>();
  const evidenceIds = new Set(evidence.map((item) => item.id));
  for (const slide of presentation.slides) {
    if (ids.has(slide.id)) throw new Error(`Id de slide duplicado: ${slide.id}`);
    ids.add(slide.id);
    if (slide.durationSeconds < 30 || slide.durationSeconds > 45) {
      throw new Error(`O slide ${slide.id} precisa ter roteiro entre 30 e 45 segundos`);
    }
    const missing = slide.evidenceIds.filter((id) => !evidenceIds.has(id));
    if (missing.length) throw new Error(`Slide ${slide.id} referencia evidências ausentes: ${missing.join(', ')}`);
    if (!['cover', 'summary', 'priorities', 'cta'].includes(slide.layout) && !hasNarrativeStructure(slide.body)) {
      throw new Error(`O slide ${slide.id} precisa explicar o problema, o impacto, o cenário correto e a direção.`);
    }
    const allowedCategories = relevantCategories[slide.layout];
    if (allowedCategories) {
      if (!slide.evidenceIds.length) throw new Error(`O slide ${slide.id} não possui evidência da fonte correspondente.`);
      const linked = evidence.filter((item) => slide.evidenceIds.includes(item.id));
      if (!linked.some((item) => allowedCategories.includes(inferCategory(item)))) {
        throw new Error(`O slide ${slide.id} não possui evidência compatível com seu tema.`);
      }
    }
    assertSafeSlideText([slide.title, slide.body, slide.speakerNotes]);
    assertPlainLanguage(`${slide.title} ${slide.body} ${slide.speakerNotes}`);
  }
  if (presentation.totalDurationSeconds < 240 || presentation.totalDurationSeconds > 360) {
    throw new Error('O roteiro total precisa durar entre 4 e 6 minutos');
  }
}
