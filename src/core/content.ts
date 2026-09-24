import type { AssessedEvidence, EvidenceCategory, FindingPriority } from './types.js';

const whitespace = /\s+/g;
const exactRankingPatterns = [
  /\b(?:esta|está|ficou|aparece)\s+(?:em|na)\s+\d+[ºªo]?\s+(?:posicao|posição|lugar)\b/iu,
  /\bposicao\s+exata\b/iu,
  /\branking\s+exato\b/iu,
  /\b(?:top|posição)\s*#?\s*\d+\b/iu,
  /\bposição\s+(?:frente|em\s+relação)\b/iu,
];
const absoluteCausalityPatterns = [
  /\bgarante\b/iu,
  /\bdetermina\s+(?:o|a)\b/iu,
  /\bfaz\s+(?:o\s+)?perfil\s+subir\b/iu,
  /\bcom\s+certeza\b/iu,
];
const scorePatterns = [
  /\b(?:nota|score|pontuacao|pontuação)\s+(?:geral\s+)?(?:de\s+)?\d{1,3}\s*(?:\/|de)\s*100\b/iu,
  /\b\d{1,3}\s*\/\s*100\b/iu,
];
const unsupportedRevenuePatterns = [
  /\b(?:perde|perdendo|deixa\s+de\s+ganhar)\s+R\$\s*[\d.]+/iu,
  /\b(?:vai|irá)\s+(?:aumentar|gerar|trazer)\s+\d+\s*%/iu,
  /\b(?:vai|irá)\s+(?:gerar|trazer)\s+(?:mais\s+)?(?:clientes|pacientes|vendas|agendamentos)\b/iu,
];
const technicalJargonPatterns = [
  /\bbenchmarking\b/iu,
  /\bNAP\b/u,
  /\bnapConsistency\b/iu,
  /\bownerResponse(?:Count|Rate)\b/iu,
  /\bcanonical\b/iu,
  /\b(?:LCP|FCP|CLS)\b/u,
  /\bCTA\b/u,
  /\bschema(?:\s+markup)?\b/iu,
  /\bstructured\s+data\b/iu,
  /\bsitemap\b/iu,
  /\bHTTPS\b/u,
  /\bscore\b/iu,
  /\breviews?\b/iu,
  /\bbusiness\s+account\b/iu,
  /\bengajamento\b/iu,
  /\bprova\s+social\b/iu,
  /\bproatividade\b/iu,
  /\bleads?\b/iu,
  /\breels?\b/iu,
  /\bCRM\b/u,
  /\brastreamento\b/iu,
  /\bSEO\b/u,
  /\bCore\s+Web\s+Vitals\b/iu,
];

export function simplifyTechnicalLanguage(value: string): string {
  return value
    .replace(/ownerResponseCount\s*=\s*0\s*(?:e|,|;)\s*ownerResponseRate\s*=\s*0/giu, 'nenhuma das avaliações analisadas recebeu resposta pública da empresa')
    .replace(/\bownerResponseCount\b/giu, 'quantidade de avaliações respondidas pela empresa')
    .replace(/\bownerResponseRate\b/giu, 'percentual de avaliações respondidas pela empresa')
    .replace(/\bnapConsistency\s+(?:negativos?|false)\b/giu, 'nome, endereço e telefone não encontrados nas páginas analisadas')
    .replace(/\bnapConsistency\b/giu, 'presença do nome, endereço e telefone nas páginas analisadas')
    .replace(/\bstructured\s+data\b/giu, 'informações organizadas para os buscadores')
    .replace(/\bsitemap\b/giu, 'estrutura que ajuda o Google a encontrar as páginas')
    .replace(/\bHTTPS\b/gu, 'conexão segura')
    .replace(/\bscore\s+(\d{1,3})\b/giu, 'resultado de $1 pontos no teste de desempenho no celular')
    .replace(/\bCTA(?:s)?\b/gu, 'botões de contato')
    .replace(/\breviews?\b/giu, 'avaliações')
    .replace(/\bbusiness\s+account\b/giu, 'perfil comercial')
    .replace(/\bposts?\b/giu, 'publicações')
    .replace(/\batividade e engajamento recentes fracos\b/giu, 'pouca atividade e poucas interações recentes')
    .replace(/\bbaixo engajamento\b/giu, 'poucas interações')
    .replace(/\bpouco engajamento\b/giu, 'poucas interações')
    .replace(/\b(\d+)\s+reels?\s*\/\s*m[eê]s\b/giu, '$1 vídeo curto por mês')
    .replace(/\bengajamento\b/giu, 'interações')
    .replace(/\bprova\s+social\b/giu, 'sinais públicos de confiança')
    .replace(/\bproatividade\b/giu, 'atenção')
    .replace(/\bleads?\b/giu, 'pessoas interessadas')
    .replace(/\breels?\b/giu, 'vídeos curtos')
    .replace(/\bCRM\b/gu, 'organização dos contatos')
    .replace(/\bno organização dos contatos\b/giu, 'na organização dos contatos')
    .replace(/\brastreamento\b/giu, 'acompanhamento dos resultados')
    .replace(/\bSEO\b/gu, 'presença no Google')
    .replace(/\bCore\s+Web\s+Vitals\b/giu, 'experiência de carregamento no celular')
    .replace(/\b([0-5])\.(\d)\b/g, '$1,$2')
    .replace(/\bbenchmarking\b/giu, 'comparação com negócios semelhantes')
    .replace(/\bNAP\b/gu, 'nome, endereço e telefone')
    .replace(/\bcanonical\b/giu, 'endereço principal da página')
    .replace(/\bLCP\b/gu, 'tempo para mostrar o conteúdo principal')
    .replace(/\bFCP\b/gu, 'tempo para mostrar o primeiro conteúdo')
    .replace(/\bCLS\b/gu, 'estabilidade visual')
    .replace(/\bschema(?:\s+markup)?\b/giu, 'informações organizadas para os buscadores')
    .replace(/\s+/g, ' ')
    .trim();
}

export function compactText(value: string, maximum = 220): string {
  const normalized = value.replace(whitespace, ' ').trim();
  if (normalized.length <= maximum) return normalized;
  return `${normalized.slice(0, Math.max(0, maximum - 1)).trimEnd()}…`;
}

export function humanizeValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Informação não encontrada na coleta';
  if (typeof value === 'string') return compactText(value);
  if (typeof value === 'number') return new Intl.NumberFormat('pt-BR').format(value);
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (Array.isArray(value)) {
    const safeItems = value
      .slice(0, 4)
      .map((item) => humanizeValue(redactReviewIdentity(item)))
      .filter(Boolean);
    return compactText(safeItems.join(', '));
  }
  if (typeof value === 'object') {
    const record = redactReviewIdentity(value) as Record<string, unknown>;
    const preferred = ['summary', 'fact', 'label', 'value', 'count', 'rating', 'text', 'responseText', 'status'];
    const selected = preferred
      .filter((key) => record[key] !== undefined)
      .map((key) => `${humanizeKey(key)}: ${humanizeValue(record[key])}`);
    if (selected.length) return compactText(selected.join(' · '));
    const entries = Object.entries(record)
      .filter(([, entry]) => typeof entry !== 'object')
      .slice(0, 4)
      .map(([key, entry]) => `${humanizeKey(key)}: ${humanizeValue(entry)}`);
    return compactText(entries.join(' · ') || 'Dado coletado');
  }
  return compactText(String(value));
}

export function redactReviewIdentity(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactReviewIdentity);
  if (!value || typeof value !== 'object') return value;
  const blocked = /^(?:author|authorName|reviewer|reviewerName|profile|profileUrl|avatar|photoUrl)$/i;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !blocked.test(key))
      .map(([key, entry]) => [key, redactReviewIdentity(entry)]),
  );
}

export function humanizeKey(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .toLowerCase();
}

export function inferCategory(evidence: Pick<AssessedEvidence, 'source' | 'title'> & { category?: string | undefined }): EvidenceCategory {
  if (evidence.category && ['profile', 'reputation', 'media', 'comparison', 'website', 'instagram', 'general'].includes(evidence.category)) return evidence.category as EvidenceCategory;
  const source = String(evidence.source);
  if (source === 'reviews') return 'reputation';
  if (source === 'media' || (source === 'maps' && /foto|midia|mídia|atualiza/i.test(evidence.title))) return 'media';
  if (source === 'competitors') return 'comparison';
  if (source === 'website' || source === 'pagespeed') return 'website';
  if (source === 'instagram') return 'instagram';
  if (source === 'maps') return 'profile';
  return 'general';
}

export function inferPriority(evidence: AssessedEvidence): FindingPriority {
  if (evidence.assessment === 'positive') return 'strength';
  if (evidence.impact === 'high' && evidence.assessment === 'negative') return 'critical';
  if (evidence.assessment === 'negative') return 'important';

  const text = `${evidence.title} ${humanizeValue(evidence.value)}`.toLowerCase();
  if (/excelente|completo|responde|atualizado|forte|consistente|positivo/.test(text)) return 'strength';
  if (/ausente|nao encontrado|não encontrado|sem resposta|desatualizado|inconsistente|erro/.test(text)) {
    return evidence.impact === 'high' ? 'critical' : 'important';
  }
  return 'opportunity';
}

export function assertSafeClaim(text: string): void {
  for (const pattern of [...exactRankingPatterns, ...absoluteCausalityPatterns, ...scorePatterns, ...unsupportedRevenuePatterns]) {
    if (pattern.test(text)) throw new Error(`Afirmação não permitida na apresentação: "${compactText(text, 100)}"`);
  }
}

export function assertPlainLanguage(text: string): void {
  const narrative = text.replace(/Fonte:[\s\S]*$/iu, '');
  for (const pattern of technicalJargonPatterns) {
    if (pattern.test(narrative)) throw new Error(`Termo técnico não permitido no texto principal: "${compactText(text, 100)}"`);
  }
}

export function assertSafeSlideText(parts: string[]): void {
  parts.forEach(assertSafeClaim);
}

export function sourceLabel(evidence: AssessedEvidence[]): string {
  const sources = new Set(evidence.map((item) => item.source));
  const labels: Record<string, string> = {
    maps: 'Perfil da Empresa no Google',
    reviews: 'Avaliações públicas no Google',
    media: 'Fotos e atualizações públicas no Google',
    competitors: 'Amostra pública de negócios semelhantes',
    website: 'Site público da empresa',
    pagespeed: 'Google PageSpeed Insights',
    instagram: 'Perfil e publicações públicas do Instagram',
    operator: 'Observação do analista',
  };
  return [...sources].map((source) => labels[source] ?? source).join(' + ');
}
