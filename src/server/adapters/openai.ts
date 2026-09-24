import type { Evidence, Finding, FindingPriority, SlideLayout, SlideSpec } from '../../shared/types.js';
import type { FetchLike } from './apify.js';
import { buildAIDiagnosticBrief, type AIDiagnosticBrief } from '../../core/ai-brief.js';
import { assertPlainLanguage, assertSafeClaim, inferCategory, simplifyTechnicalLanguage } from '../../core/content.js';
import { generateFindings } from '../../core/diagnostic.js';
import { buildPresentation } from '../../core/slides.js';
import type { AssessedEvidence, DiagnosticContext } from '../../core/types.js';
import { requiredSlideLayouts, validateFindings } from '../../core/validation.js';

export interface DiagnosticOutput {
  findings: Array<Omit<Finding, 'id' | 'analysisId' | 'position'>>;
  slides: Array<Omit<SlideSpec, 'id' | 'analysisId' | 'position'>>;
}

export interface OpenAIClientOptions { apiKey: string; model?: string; fetch?: FetchLike; baseUrl?: string }

interface ModelFinding {
  targetLayout: SlideLayout;
  headline: string;
  evidenceIds: string[];
  category: string;
  priority: FindingPriority;
  observation: string;
  possibleImpact: string;
  idealState: string;
  recommendedDirection: string;
}

interface FindingsResponse { findings: ModelFinding[] }
interface ModelCallResult {
  output: FindingsResponse;
  usage: { inputTokens: number; outputTokens: number };
  responseId?: string;
}

const DIAGNOSTIC_LAYOUTS: SlideLayout[] = ['profile', 'reputation', 'responses', 'media', 'website', 'instagram'];
const categoryByLayout: Record<string, string> = {
  profile: 'profile', reputation: 'reputation', responses: 'reputation', media: 'media', website: 'website', instagram: 'instagram',
};
const categoriesByLayout: Record<string, string[]> = {
  profile: ['profile', 'comparison'], reputation: ['reputation'], responses: ['reputation'], media: ['media'], website: ['website'], instagram: ['instagram'],
};
const priorityWeight: Record<FindingPriority, number> = { critical: 0, important: 1, opportunity: 2, strength: 3 };

export class OpenAIDiagnosticClient {
  private readonly fetcher: FetchLike;
  readonly model: string;
  constructor(private readonly options: OpenAIClientOptions) {
    this.fetcher = options.fetch ?? fetch;
    this.model = options.model ?? 'gpt-5-mini';
  }

  async generate(companyName: string, evidence: Evidence[]): Promise<{
    output: DiagnosticOutput;
    usage: { inputTokens: number; outputTokens: number };
    responseId?: string;
    verificationResponseId?: string;
    verificationApplied: boolean;
  }> {
    if (!this.options.apiKey) throw new Error('OPENAI_API_KEY ausente.');
    const requiredLayouts = requiredSlideLayouts(evidence);
    const findingLayouts = requiredLayouts.filter((layout) => DIAGNOSTIC_LAYOUTS.includes(layout));
    const brief = buildAIDiagnosticBrief(evidence);
    const images = collectVisualSamples(evidence);
    const generated = await this.callModel(GENERATOR_PROMPT, [
      { type: 'input_text', text: JSON.stringify({ companyName, findingLayouts, brief }) },
      ...images.map((imageUrl) => ({ type: 'input_image', image_url: imageUrl, detail: 'low' })),
    ]);
    const firstPass = reconcileFindings(generated.output.findings, findingLayouts, evidence);

    let verified = firstPass;
    let verificationApplied = false;
    let verification: ModelCallResult | undefined;
    try {
      const supportingEvidence = selectSupportingBrief(brief, firstPass);
      verification = await this.callModel(VERIFIER_PROMPT, [{
        type: 'input_text',
        text: JSON.stringify({ companyName, findingLayouts, draftFindings: firstPass, supportingEvidence }),
      }]);
      verified = reconcileFindings(verification.output.findings, findingLayouts, evidence, firstPass);
      verificationApplied = true;
    } catch {
      // Uma falha da checagem não descarta uma primeira resposta que passou pelas regras locais.
    }

    const sorted = verified
      .sort((a, b) => priorityWeight[a.priority] - priorityWeight[b.priority] || findingLayouts.indexOf(a.targetLayout!) - findingLayouts.indexOf(b.targetLayout!))
      .map((finding, position) => ({ ...finding, id: `ai-finding-${position + 1}`, analysisId: evidence[0]?.analysisId ?? '', position, approved: false }));
    validateFindings(sorted, evidence);

    const presentationContext = makePresentationContext(companyName, evidence);
    const presentation = buildPresentation(presentationContext, sorted.map((finding) => ({ ...finding, approved: true })));
    const slides = presentation.slides.map(({ id: _id, analysisId: _analysisId, position: _position, ...slide }) => ({ ...slide, approved: false }));
    const findings = sorted.map(({ id: _id, analysisId: _analysisId, position: _position, ...finding }) => finding);
    const usage = {
      inputTokens: generated.usage.inputTokens + (verification?.usage.inputTokens ?? 0),
      outputTokens: generated.usage.outputTokens + (verification?.usage.outputTokens ?? 0),
    };
    return {
      output: { findings, slides },
      usage,
      ...(generated.responseId ? { responseId: generated.responseId } : {}),
      ...(verification?.responseId ? { verificationResponseId: verification.responseId } : {}),
      verificationApplied,
    };
  }

  private async callModel(systemPrompt: string, userContent: Array<Record<string, unknown>>): Promise<ModelCallResult> {
    const response = await this.fetcher(`${this.options.baseUrl ?? 'https://api.openai.com/v1'}/responses`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.options.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        store: false,
        input: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userContent }],
        text: { format: { type: 'json_schema', name: 'dirijo_gbp_findings', strict: true, schema: findingsSchema } },
      }),
    });
    if (!response.ok) throw new Error(`OpenAI recusou o diagnóstico (${response.status}).`);
    const body = await response.json() as Record<string, unknown>;
    const output = JSON.parse(extractOutputText(body)) as FindingsResponse;
    if (!Array.isArray(output.findings)) throw new Error('OpenAI não retornou achados estruturados.');
    const usage = (body.usage ?? {}) as Record<string, unknown>;
    return {
      output,
      usage: { inputTokens: Number(usage.input_tokens ?? 0), outputTokens: Number(usage.output_tokens ?? 0) },
      ...(typeof body.id === 'string' ? { responseId: body.id } : {}),
    };
  }
}

const GENERATOR_PROMPT = `Você analisa a presença digital pública de negócios locais para criar uma conversa comercial útil e personalizada. Escreva em português brasileiro simples, direto e humano.

Você receberá um resumo estruturado, já calculado pelo sistema, com fatos, exemplos anonimizados e IDs válidos. Não recalcule números nem invente fatos. Gere exatamente um achado para cada item de findingLayouts.

Cada achado precisa:
- targetLayout: o item correspondente de findingLayouts;
- headline: conclusão específica que identifica claramente o canal;
- evidenceIds: somente IDs fornecidos e compatíveis com o achado;
- observation: o fato concreto e personalizado;
- possibleImpact: por que isso pode afetar confiança, decisão, contatos ou agendamentos;
- idealState: como deveria estar a experiência correta;
- recommendedDirection: direção específica, sem tutorial completo.

Use exemplos e temas do negócio quando eles estiverem comprovados. Reconheça pontos fortes. Não invente um defeito para preencher a estrutura. Para respostas às avaliações, use targetLayout responses. Para a leitura geral das avaliações, use reputation.
Se a amostra tiver zero avaliações, trate a ausência de avaliações como problema de reputação, mas trate o bloco de respostas apenas como preparação: não existem comentários ignorados e isso não é uma falha da empresa.

Não afirme receita perdida, crescimento garantido, posição exata no Google ou causalidade absoluta. Não exponha identidade de avaliadores.

Escreva para uma pessoa leiga. Nunca repita nomes internos de campos ou termos técnicos. Não use ownerResponseCount, ownerResponseRate, napConsistency, HTTPS, sitemap, structured data, score, reviews, business account, posts, CTA, NAP, canonical, schema, LCP, FCP, CLS, engajamento, prova social, proatividade, lead, CRM, rastreamento ou SEO. Traduza sempre o significado para uma frase natural. Prefira "interações", "pessoas interessadas", "sinais públicos de confiança", "organização dos contatos" e "acompanhamento dos resultados".`;

const VERIFIER_PROMPT = `Você é a checagem final de um diagnóstico comercial. Receberá somente os achados propostos e as evidências específicas usadas por eles.

Devolva exatamente um achado para cada item de findingLayouts. Preserve targetLayout e utilize somente evidenceIds disponíveis. Corrija textos genéricos, conclusões não sustentadas, exageros, repetições e termos técnicos. Mantenha detalhes personalizados comprovados. Quando o indicador estiver bom, preserve-o como ponto forte. Quando não houver confirmação suficiente, use linguagem de oportunidade ou de validação, nunca trate como erro confirmado.

Não acrescente informações externas. Não afirme receita perdida, crescimento garantido, posição exata no Google ou causalidade absoluta. Não exponha identidade de avaliadores.
Se a amostra tiver zero avaliações, nunca diga que a empresa deixou clientes sem resposta. Explique que ainda não há comentários para responder e apresente a criação da rotina como oportunidade futura.

Escreva para uma pessoa leiga. Nunca repita nomes internos de campos ou termos técnicos. Não use ownerResponseCount, ownerResponseRate, napConsistency, HTTPS, sitemap, structured data, score, reviews, business account, posts, CTA, NAP, canonical, schema, LCP, FCP, CLS, engajamento, prova social, proatividade, lead, CRM, rastreamento ou SEO. Prefira frases naturais como "nenhuma avaliação analisada recebeu resposta", "o site usa conexão segura", "o teste no celular apresentou bom desempenho", "pessoas interessadas" e "acompanhamento dos resultados".`;

const modelFindingProperties = {
  targetLayout: { type: 'string', enum: DIAGNOSTIC_LAYOUTS },
  headline: { type: 'string' },
  evidenceIds: { type: 'array', items: { type: 'string' }, minItems: 1 },
  category: { type: 'string', enum: ['profile', 'reputation', 'media', 'comparison', 'website', 'instagram', 'general'] },
  priority: { type: 'string', enum: ['critical', 'important', 'opportunity', 'strength'] },
  observation: { type: 'string' },
  possibleImpact: { type: 'string' },
  idealState: { type: 'string' },
  recommendedDirection: { type: 'string' },
};
const findingsSchema = {
  type: 'object', additionalProperties: false, required: ['findings'], properties: {
    findings: { type: 'array', minItems: 4, maxItems: 6, items: { type: 'object', additionalProperties: false, required: Object.keys(modelFindingProperties), properties: modelFindingProperties } },
  },
};

function reconcileFindings(raw: ModelFinding[], layouts: SlideLayout[], evidence: Evidence[], previous: Finding[] = []): Finding[] {
  const fallback = generateFindings(evidence as AssessedEvidence[]);
  const normalize = (text: string): string => simplifyTechnicalLanguage(text
    .replace(/[\u2014\u2013\u2011]/gu, '-')
    .replace(/posi[cç][aã]o\s+(?:frente\s+[àa]|em\s+rela[cç][aã]o\s+aos?)\s+concorrentes?/giu, 'comparação com negócios semelhantes'));

  return layouts.map((layout, position) => {
    const allowedCategories = categoriesByLayout[layout] ?? [];
    const compatibleEvidence = evidence.filter((item) => allowedCategories.includes(inferCategory(item)));
    const compatibleIds = new Set(compatibleEvidence.map((item) => item.id));
    const candidate = raw.find((item) => item.targetLayout === layout)
      ?? previous.find((item) => item.targetLayout === layout)
      ?? fallback.find((item) => allowedCategories.includes(item.category));
    if (!candidate) throw new Error(`Não foi possível gerar o achado ${layout}.`);
    const evidenceIds = candidate.evidenceIds.filter((id) => compatibleIds.has(id));
    const finalEvidenceIds = evidenceIds.length ? evidenceIds.slice(0, 3) : compatibleEvidence.slice(0, 2).map((item) => item.id);
    if (!finalEvidenceIds.length) throw new Error(`O achado ${layout} não possui evidência compatível.`);
    const missingWebsite = layout === 'website' && compatibleEvidence.some((item) => {
      const value = item.value && typeof item.value === 'object' && !Array.isArray(item.value) ? item.value as Record<string, unknown> : undefined;
      return value?.present === false;
    });
    const finding: Finding = {
      id: `ai-${layout}`,
      analysisId: evidence[0]?.analysisId ?? '',
      targetLayout: layout,
      headline: normalize(('headline' in candidate && candidate.headline) ? candidate.headline : defaultHeadline(layout)),
      evidenceIds: finalEvidenceIds,
      category: allowedCategories.includes(candidate.category) ? candidate.category : categoryByLayout[layout] ?? 'general',
      priority: missingWebsite ? 'important' : candidate.priority,
      observation: normalize(candidate.observation),
      possibleImpact: normalize(candidate.possibleImpact),
      idealState: normalize(candidate.idealState),
      recommendedDirection: normalize(candidate.recommendedDirection),
      approved: false,
      position,
    };
    const noPublicReviews = ['reputation', 'responses'].includes(layout) && compatibleEvidence.some((item) => {
      const value = item.value && typeof item.value === 'object' && !Array.isArray(item.value) ? item.value as Record<string, unknown> : undefined;
      return value?.sampleSize === 0;
    });
    if (noPublicReviews && layout === 'reputation') Object.assign(finding, {
      headline: 'Avaliações no Google: a clínica ainda não possui relatos públicos.',
      priority: 'important',
      observation: 'Não foram encontradas avaliações públicas no Perfil da Empresa no Google.',
      possibleImpact: 'Quem ainda não conhece a clínica encontra menos relatos públicos para reduzir dúvidas antes de marcar um atendimento.',
      idealState: 'O perfil deveria reunir avaliações autênticas e recentes que descrevam o atendimento e a experiência oferecida.',
      recommendedDirection: 'Criar uma rotina simples para convidar pacientes satisfeitos a registrar avaliações verdadeiras no Google.',
    });
    if (noPublicReviews && layout === 'responses') Object.assign(finding, {
      headline: 'Respostas no Google: a rotina pode nascer junto com as primeiras avaliações.',
      priority: 'opportunity',
      observation: 'Como ainda não há avaliações públicas, também não existem comentários aguardando resposta da clínica.',
      possibleImpact: 'Isso não representa uma falha atual. A oportunidade é começar corretamente e demonstrar atenção desde as primeiras avaliações recebidas.',
      idealState: 'As primeiras avaliações deveriam receber respostas humanas, cuidadosas e coerentes com o atendimento da clínica.',
      recommendedDirection: 'Definir desde agora quem acompanhará e responderá as futuras avaliações no Perfil da Empresa no Google.',
    });
    [finding.headline ?? '', finding.observation, finding.possibleImpact, finding.idealState, finding.recommendedDirection].forEach((text) => {
      assertSafeClaim(text); assertPlainLanguage(text);
    });
    return finding;
  });
}

function defaultHeadline(layout: SlideLayout): string {
  return ({
    profile: 'Google Maps: as informações públicas precisam facilitar a primeira decisão.',
    reputation: 'Avaliações no Google: a reputação mostra como os clientes enxergam a experiência.',
    responses: 'Respostas no Google: a atenção pública também influencia a confiança.',
    media: 'Fotos e atualizações no Google: atividade recente ajuda a reduzir insegurança.',
    website: 'Site: clareza e experiência no celular precisam conduzir até o contato.',
    instagram: 'Instagram: conteúdo, prova e próximo passo precisam trabalhar juntos.',
  } as Partial<Record<SlideLayout, string>>)[layout] ?? 'Presença digital: existe uma oportunidade comprovada.';
}

function selectSupportingBrief(brief: AIDiagnosticBrief, findings: Finding[]): AIDiagnosticBrief {
  const selectedIds = new Set(findings.flatMap((finding) => finding.evidenceIds));
  return {
    evidence: brief.evidence.filter((item) => selectedIds.has(item.evidenceId)),
    crossChannelSignals: brief.crossChannelSignals.filter((item) => item.evidenceIds.some((id) => selectedIds.has(id))),
  };
}

function makePresentationContext(companyName: string, evidence: Evidence[]): DiagnosticContext {
  const sourceUrl = evidence.find((item) => item.source === 'maps')?.sourceUrl;
  const mapsUrl = sourceUrl && /^https?:\/\//i.test(sourceUrl) ? sourceUrl : 'https://www.google.com/maps';
  const websiteUrl = evidence.find((item) => item.source === 'website' || item.source === 'pagespeed')?.sourceUrl;
  const instagramUrl = evidence.find((item) => item.source === 'instagram')?.sourceUrl;
  return {
    analysisId: evidence[0]?.analysisId ?? 'analysis',
    companyName,
    input: { mapsUrl, companyName, ...(websiteUrl ? { websiteUrl } : {}), ...(instagramUrl ? { instagramUrl } : {}) },
    evidence: evidence as AssessedEvidence[],
    generatedAt: new Date().toISOString(),
  };
}

function collectVisualSamples(evidence: Evidence[]): string[] {
  const found: string[] = [];
  const visit = (value: unknown, key = ''): void => {
    if (typeof value === 'string' && /^data:image\/(?:jpeg|png|webp);base64,/i.test(value) && /image|screen/i.test(key)) found.push(value);
    else if (Array.isArray(value)) value.forEach((entry) => visit(entry, key));
    else if (value && typeof value === 'object') Object.entries(value as Record<string, unknown>).forEach(([childKey, entry]) => visit(entry, childKey));
  };
  evidence.forEach((item) => visit(item.value));
  return [...new Set(found)].slice(0, 4);
}

function extractOutputText(body: Record<string, unknown>): string {
  if (typeof body.output_text === 'string') return body.output_text;
  for (const item of Array.isArray(body.output) ? body.output : []) {
    if (!item || typeof item !== 'object') continue;
    for (const content of Array.isArray((item as Record<string, unknown>).content) ? (item as Record<string, unknown>).content as unknown[] : []) {
      if (content && typeof content === 'object' && typeof (content as Record<string, unknown>).text === 'string') return String((content as Record<string, unknown>).text);
    }
  }
  throw new Error('OpenAI não retornou texto estruturado.');
}
