import { confirmedAbsence } from './channel-presence.js';
import type { ChannelPresence } from '../shared/types.js';
import { responseNarrative } from './review-responses.js';

/** Structural input shared by the server and the browser's public analysis model. */
type Presence = ChannelPresence;
export interface CompactDiagnosticInput {
  companyName?: string | undefined;
  input: { companyName?: string | undefined; websiteUrl?: string | undefined; businessType?: string | undefined; niche?: string | undefined; instagramUrl?: string | undefined; mapsUrl?: string | undefined; channelPresence?: Partial<Record<'google' | 'instagram' | 'website', Presence>> | undefined; googleEligibility?: string | undefined };
  createdAt: string;
  evidence: Array<{ id: string; source: string; category?: string | undefined; sourceUrl?: string | undefined; value: unknown; observedAt: string; confidence?: number | undefined; channelPresence?: Presence | undefined }>;
  sourceStatuses: Partial<Record<string, { status: string }>>;
}

export interface CompactMetric {
  value: string;
  label: string;
  evidenceIds: string[];
}
export interface CompactFinding {
  title: string;
  body: string;
  source: string;
  evidenceIds: string[];
  kind: 'opportunity' | 'strength' | 'verification';
  consequence?: string;
  direction?: string;
  proof?: { value: string; label: string }[];
}
export interface CompactEditorialPage {
  section: string;
  title: string;
  emphasis: string;
  intro: string;
  metrics?: CompactMetric[];
  blocks?: Array<{ title: string; body: string }>;
  path?: Array<{ title: string; body: string }>;
  note?: string;
  finding?: CompactFinding;
}
export interface CompactDiagnostic {
  companyName: string;
  date: string;
  pageCount: number;
  editorialPages: CompactEditorialPage[];
  openingItems: Array<{ title: string; body: string }>;
  openingEmphasis: string;
  reviewRequired: boolean;
  scenario: 'google_instagram' | 'google_only' | 'instagram_only' | 'partial';
  coverage: CompactFinding[];
  priorities: Array<{ title: string; body: string; label?: string }>;
  strength?: CompactFinding | undefined;
  patientBusiness: boolean;
  hasProblems: boolean;
  headline: string;
  subtitle: string;
  intro: string;
  metrics: CompactMetric[];
  findings: CompactFinding[];
  bridge: string;
  impactTopics: string[];
  solutionTitle: string;
  questions: string[];
  services: Array<{ title: string; body: string }>;
  cta: { headline: string; body: string; button: string; url: string; durationMinutes: 20; focus: string };
}

type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue => value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};
const numeric = (value: unknown): number | undefined => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
const shorten = (value: string, max: number) => value.length <= max ? value : `${value.slice(0, max - 1).replace(/\s+\S*$/, '').trim()}…`;
const isReliable = (evidence: CompactDiagnosticInput['evidence'][number]) => (evidence.confidence ?? 0) >= 0.8;
/** Instagram conclusions cover only observed cadence, biography and its invitation. */
function instagramReading(value: RecordValue, observedAt: string) {
  const manual = record(value.checklist ?? record(value.manual).checklist ?? value.manual);
  const bio = text(value.biography) || text(manual.bio);
  const posts = Array.isArray(value.latestPosts) ? value.latestPosts.map(record) : [];
  const observation = Date.parse(observedAt);
  const dates = posts.map(post => Date.parse(text(post.publishedAt))).filter(date => Number.isFinite(date) && date <= observation);
  const recent = dates.filter(date => date > observation - 30 * 86_400_000).length;
  const hasDates = Number.isFinite(observation) && dates.length > 0;
  const completeDates = hasDates && dates.length === posts.length;
  const service = /rejuvenesc|facial|corporal|cl[ií]nica|est[eé]tica|servi[çc]|atend|nutri|odont|procedimento|especial|consulta|tratamento|produto|terapia|jo[ií]a|turismo|advoca|fisioterap/i.test(bio);
  const audience = /pacientes?\s*\d|\d+\s*\+|mulheres|homens|crian[çc]|gestantes|empresas/i.test(bio);
  const location = /\b(?:RJ|ES|SP|MG|BH)\b|ilha do governador|vila velha|vit[oó]ria|rio de janeiro|belo horizonte|localiza|endere[çc]/i.test(bio);
  const invitation = /agend|marque|fa[çc]a (?:a |sua |uma )?avalia[çc][ãa]o|whatsapp|entre em contato|fale (?:conosco|com)|link (?:da |na )?bio|clique|reserve|pe[çc]a/i.test(bio + ' ' + text(manual.callToAction));
  const frequency = hasDates && !completeDates ? `A amostra registra ${recent} posts com data nos últimos 30 dias. Há datas indisponíveis; não concluímos se a frequência está adequada.` : hasDates
    ? `Amostra: ${recent} de ${posts.length} posts nos últimos 30 dias. ${recent >= 12 ? 'Atinge a referência de 12 posts no período. Manter a constância.' : 'Abaixo da referência de 12 posts no período. Organizar uma rotina de publicação.'}`
    : 'As publicações disponíveis não têm datas suficientes para avaliar a frequência. Este diagnóstico não conclui se o ritmo está adequado.';
  const biography = bio ? `“${shorten(bio.replace(/\s+/g, ' '), 95)}” ${service ? `A bio identifica a atuação${audience ? ' e o público' : ''}${location ? ', com referência de localização' : ''}.` : 'O trecho não identifica claramente o serviço. Explicitar a atuação na primeira linha.'}` : 'O texto da bio não ficou disponível na análise. Não há base para avaliar sua clareza ou estrutura.';
  const cta = invitation && !bio ? 'A revisão manual registrou um convite para contato. Sem o texto completo da bio, não avaliamos sua estrutura.' : invitation ? 'A bio contém um convite para agendamento ou contato. Manter essa chamada explícita junto da apresentação do serviço.' : bio ? 'Não há convite explícito na bio. Acrescentar “Agende sua avaliação” ou outra chamada de contato para orientar quem se interessou.' : 'Sem o texto da bio, não foi possível avaliar o CTA. Não concluímos que ele esteja ausente.';
  const gaps = [completeDates && recent < 12 ? 'a constância de publicação' : '', bio && !service ? 'a clareza do serviço na bio' : '', bio && !invitation ? 'o convite para contato na bio' : ''].filter(Boolean);
  const direction = gaps.length ? [completeDates && recent < 12 ? 'Organizar a rotina para a referência de 12 publicações em 30 dias.' : '', bio && !service ? 'Explicitar o serviço na primeira linha da bio.' : '', bio && !invitation ? 'Acrescentar à bio um convite explícito para contato ou avaliação.' : ''].filter(Boolean).join(' ') : 'Manter a apresentação clara, a chamada para contato e uma rotina de publicações consistente.';
  const title = completeDates && recent < 12 ? 'Ajustar a constância das publicações.' : bio && !service ? 'Explicitar o serviço na bio.' : bio && !invitation ? 'Completar a bio com um convite.' : 'Manter o que já funciona no perfil.';
  return { bio, posts, frequency, biography, cta, service, invitation, gaps, direction, title, hasDates, recent,
    summary: gaps.length ? `${hasDates ? `A amostra registra ${recent} posts em 30 dias. ` : ''}${bio && !invitation ? 'A bio apresenta o perfil, mas falta um convite explícito para contato.' : bio && !service ? 'A bio precisa explicitar o serviço oferecido.' : 'A prioridade é manter uma rotina de conteúdo mais constante.'}` : `${hasDates ? `A amostra registra ${recent} posts em 30 dias. ` : ''}${service && invitation ? 'A bio identifica a atuação e orienta o contato.' : 'Os dados disponíveis não sustentam uma conclusão sobre todos os três pontos.'}` };
}
/** Commercial copy is derived from source facts, independently of older AI slides. */
export function buildCompactDiagnostic(analysis: CompactDiagnosticInput): CompactDiagnostic {
  const evidence = analysis.evidence.filter(isReliable);
  const maps = evidence.find((item) => item.source === 'maps' && (item.category === 'profile' || text(record(item.value).title)));
  const profile = record(maps?.value);
  const reviews = evidence.find((item) => item.source === 'reviews' && numeric(record(item.value).sampleSize) !== undefined);
  const reviewValue = record(reviews?.value);
  const instagram = evidence.find((item) => item.source === 'instagram' && item.category !== 'coverage' && (record(item.value).signals || record(item.value).manual || record(item.value).checklist || text(record(item.value).biography) || Array.isArray(record(item.value).latestPosts)));
  const instagramValue = record(instagram?.value);
  const suppliedName = analysis.companyName || analysis.input.companyName || text(profile.title) || 'Sua empresa';
  const normalizeName = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const companyName = shorten(text(profile.title) && normalizeName(text(profile.title)) === normalizeName(suppliedName) ? text(profile.title) : suppliedName, 90);
  const extendedInput = analysis.input;
  const businessContext = [companyName, profile.category, ...(Array.isArray(profile.categories) ? profile.categories : []), instagramValue.category, extendedInput.businessType, extendedInput.niche].filter((item) => typeof item === 'string').join(' ');
  const patientBusiness = /cl[ií]nica|est[eé]tica|homenz|sa[uú]de|m[eé]dic|odont|dentist|nutri|fisioterap|dermatolog|psicolog|hospital/i.test(businessContext);
    const businessLower = patientBusiness ? 'sua clínica' : 'sua empresa';
  const opportunities: CompactFinding[] = [];
  const strengths: CompactFinding[] = [];
  const verifications: CompactFinding[] = [];
  const metrics: CompactMetric[] = [];
  const add = (target: CompactFinding[], item: CompactFinding) => target.push({ ...item, title: shorten(item.title, 80), body: shorten(item.body, 220) });
  const score = numeric(profile.totalScore);
  const totalReviews = numeric(profile.reviewsCount);
  if (maps && profile.present !== false) {
    if (score !== undefined) metrics.push({ value: score.toFixed(1).replace('.', ','), label: 'nota no Google', evidenceIds: [maps.id] });
    if (totalReviews !== undefined) metrics.push({ value: String(totalReviews), label: 'avaliações no Google', evidenceIds: [maps.id] });
  }

  const sample = numeric(reviewValue.sampleSize);
  const responseCount = numeric(reviewValue.ownerResponseCount);
  const responseState = responseNarrative(reviewValue).state;
  if (reviews && sample && reviewValue.ownerResponseVerification === 'verified' && responseCount !== undefined && responseCount <= sample && responseState !== 'unknown') {
    const missing = sample - responseCount;
    if (missing > 0) add(opportunities, {
      title: `${missing} das ${sample} avaliações analisadas ${missing === 1 ? 'estava' : 'estavam'} sem resposta.`,
      body: `Das ${sample} avaliações analisadas, ${responseCount} receberam retorno público. Responder demonstra atenção a quem já foi atendido e a quem ainda está escolhendo onde ${patientBusiness ? 'agendar' : 'comprar'}.`,
      source: 'Avaliações no Google', evidenceIds: [reviews.id], kind: 'opportunity',
    });
    else add(strengths, {
      title: 'Todas as avaliações analisadas receberam resposta.',
      body: `As ${sample} avaliações da amostra receberam retorno público. Essa rotina demonstra acompanhamento e ajuda a fortalecer a confiança de quem pesquisa ${businessLower}.`,
      source: 'Avaliações no Google', evidenceIds: [reviews.id], kind: 'strength',
    });
  } else if (reviews && sample) add(verifications, {
    title: 'As respostas às avaliações precisam de confirmação.',
    body: 'O diagnóstico não permite confirmar as respostas em toda a amostra. Esse ponto deve ser verificado no perfil antes de definir ajustes na rotina da empresa.',
    source: 'Avaliações no Google', evidenceIds: [reviews.id], kind: 'verification',
  });

  const googleCoverage = evidence.find(item => item.source === 'maps' && item.category === 'coverage');
  const googlePresence = analysis.input.channelPresence?.google ?? maps?.channelPresence ?? googleCoverage?.channelPresence ?? record(googleCoverage?.value).presence as Presence | undefined;
  const missingGoogleOpportunity = confirmedAbsence(googlePresence) && !text(analysis.input.mapsUrl) && !text(profile.title) && analysis.input.googleEligibility !== 'ineligible';
  if (missingGoogleOpportunity) add(opportunities, {
    title: 'Ser encontrado por quem procura seus serviços no Google.',
    body: `A verificação registrada não identificou um Perfil da Empresa no Google para ${companyName}. Esse canal merece atenção na descoberta dos serviços.`,
    source: 'Perfil no Google', evidenceIds: googleCoverage ? [googleCoverage.id] : [], kind: 'opportunity',
    consequence: 'Quem busca um serviço na região pode não conhecer seu nome ou Instagram. Um perfil ajuda a apresentar seu trabalho nesse momento de escolha.',
    direction: analysis.input.googleEligibility === 'eligible' ? 'Conferir possíveis cadastros existentes e preparar um perfil com serviços, informações corretas, fotos e contato.' : 'Confirmar o atendimento presencial ou no endereço do cliente e conferir possíveis cadastros. Depois, planejar serviços, fotos e contato.',
  });
  else if (maps && profile.present !== false && analysis.sourceStatuses.maps?.status === 'completed' && text(profile.title)) {
    if (score !== undefined && score >= 4.5 && (totalReviews ?? 0) > 0) add(strengths, {
      title: 'A reputação no Google transmite confiança.',
      body: `O perfil reúne nota ${score.toFixed(1).replace('.', ',')} e ${totalReviews} avaliações. Essa base pode apoiar a decisão de quem conhece ${businessLower} pela primeira vez.`,
      source: 'Perfil no Google', evidenceIds: [maps.id], kind: 'strength',
    });
    if (totalReviews === 0) add(opportunities, {
      title: 'O perfil ainda não reúne avaliações no Google.',
      body: 'O perfil observado não reúne avaliações. Uma rotina legítima de pedidos a clientes atendidos pode ajudar a construir relatos públicos.',
      source: 'Perfil no Google', evidenceIds: [maps.id], kind: 'opportunity',
      consequence: 'Relatos públicos podem apoiar quem está escolhendo; não medimos o efeito nas vendas.',
      direction: 'Conferir uma rotina de pedidos de avaliação sem incentivos ou seleção de clientes.',
    });
  }

  const website = evidence.find((item) => item.source === 'website' && Array.isArray(record(item.value).pages));
  const websiteValue = record(website?.value);
  const pages = Array.isArray(websiteValue.pages) ? websiteValue.pages.map(record) : [];
  const pageSpeed = evidence.find((item) => item.source === 'pagespeed');
  const speedValue = record(pageSpeed?.value);
  const speedScore = numeric(speedValue.performanceScore);
  const rawLcp = speedValue.largestContentfulPaint;
  const lcpSeconds = typeof rawLcp === 'number' && Number.isFinite(rawLcp) && rawLcp >= 0 ? rawLcp / 1000 : typeof rawLcp === 'string' && /^\s*\d+(?:[.,]\d+)?\s*s\s*$/.test(rawLcp) ? Number.parseFloat(rawLcp.replace(',', '.')) : undefined;
  const canonicalUrl = (value: unknown) => { try { const url = new URL(text(value)); if (!['http:', 'https:'].includes(url.protocol)) return ''; url.hash = ''; return url.href.replace(/\/$/, ''); } catch { return ''; } };
  const expectedUrl = canonicalUrl(analysis.input.websiteUrl) || canonicalUrl(profile.website) || canonicalUrl(instagramValue.externalUrl);
  const testedUrl = canonicalUrl(pageSpeed?.sourceUrl);
  const collectedUrls = [website?.sourceUrl, ...pages.map(page => page.url)].map(canonicalUrl);

  const accessiblePages = pages.length > 0 && pages.every((page) => {
    const status = numeric(page.status);
    return status !== undefined && status >= 200 && status < 300 && !/access denied|forbidden|just a moment|attention required|verifique que voc[eê] [eé] humano/i.test(text(page.title));
  });
  if (website && pageSpeed && expectedUrl && testedUrl === expectedUrl && collectedUrls.includes(expectedUrl) && accessiblePages && speedValue.strategy === 'mobile' && analysis.sourceStatuses.pagespeed?.status === 'completed' && speedScore !== undefined && speedScore < 50) add(opportunities, {
    title: 'Facilitar o acesso ao contato no celular.',
    body: `Este é o link usado pela empresa. A abertura no celular merece revisão.`,
    proof: [{ value: `${speedScore}/100`, label: 'desempenho no celular' }, ...(lcpSeconds !== undefined ? [{ value: `${lcpSeconds.toFixed(1).replace('.', ',')} s`, label: 'até o principal elemento visual' }] : [])],
    source: 'Caminho de contato', evidenceIds: [website.id, pageSpeed.id], kind: 'opportunity',
    consequence: 'Uma abertura lenta pode acrescentar espera no caminho até o contato.',
    direction: 'Testar o link em um celular real e decidir se o destino atual precisa de ajuste.',
  });

  const coverage: CompactFinding[] = [];
  const googleAssessed = Boolean(maps && profile.present !== false && text(profile.title) && analysis.sourceStatuses.maps?.status === 'completed');
  if (googleAssessed) coverage.push(strengths.find(item => item.source === 'Perfil no Google') ?? {
    title: 'Google: informações públicas avaliadas.', body: 'O perfil correspondente à empresa foi observado. As conclusões se limitam às informações e à amostra coletadas.',
    source: 'Perfil no Google', evidenceIds: [maps!.id], kind: 'verification',
  });
  const instagramAssessed = Boolean(instagram && instagramValue.privateAccount !== true && analysis.sourceStatuses.instagram?.status === 'completed');
  if (instagramAssessed) {
    const reading = instagramReading(instagramValue, instagram!.observedAt);
    if (reading.gaps.length) add(opportunities, {
      title: reading.title, body: reading.summary,
      source: 'Instagram', evidenceIds: [instagram!.id], kind: 'opportunity',
      consequence: 'A constância mantém o trabalho visível; uma bio clara ajuda a entender o serviço e o próximo passo.',
      direction: reading.direction,
    });
    coverage.push({ title: text(instagramValue.username) ? `Instagram: @${shorten(text(instagramValue.username), 30)}.` : 'Instagram: frequência, bio e CTA.', body: `${reading.frequency} ${reading.biography} ${reading.cta}`, source: 'Instagram', evidenceIds: [instagram!.id], kind: reading.service && reading.invitation ? 'strength' : 'verification' });
  }
  for (const [channel, label, source] of [['google', 'Google', 'maps'], ['instagram', 'Instagram', 'instagram'], ['website', 'Site próprio', 'website']] as const) {
    if ((channel === 'google' && googleAssessed) || (channel === 'instagram' && instagramAssessed)) continue;
    const channelEvidence = evidence.find(item => item.source === source && item.category === 'coverage');
    const presence = analysis.input.channelPresence?.[channel] ?? channelEvidence?.channelPresence ?? record(channelEvidence?.value).presence as Presence | undefined;
    const status = analysis.sourceStatuses[source]?.status;
    const state = presence?.state;
    const channelUrl = channel === 'google' ? analysis.input.mapsUrl : channel === 'instagram' ? analysis.input.instagramUrl : analysis.input.websiteUrl;
    const confirmed = confirmedAbsence(presence) && !text(channelUrl) && !(channel === 'website' && website && accessiblePages && !/(^|\.)linktr\.ee$/.test(new URL(expectedUrl || 'https://invalid.test').hostname));
    const assessedWebsite = channel === 'website' && Boolean(website && accessiblePages);
    const description = confirmed ? 'Ausência confirmada; sua utilidade depende da necessidade do negócio.' : assessedWebsite ? 'Destino público analisado. Um agregador ou agenda externa não comprova site próprio.' : state === 'restricted' ? 'Acesso restrito; não foi possível avaliar o conteúdo.' : status === 'failed' || state === 'collection_failed' ? 'Leitura incompleta. Não emitimos conclusão negativa sobre esse canal.' : state === 'present_unassessed' ? 'Canal identificado, ainda não avaliado.' : 'Presença a confirmar. Não informar um endereço não comprova ausência.';
    coverage.push({ title: `${label}: ${confirmed ? 'ausência confirmada' : assessedWebsite ? 'destino avaliado' : 'cobertura parcial'}.`, body: description, source: label, evidenceIds: assessedWebsite ? [website!.id] : [], kind: 'verification' });
  }
  const ownWebsiteObserved = Boolean(website && accessiblePages && expectedUrl && !/(^|\.)(?:linktr\.ee|instagram\.com|facebook\.com|wa\.me|whatsapp\.com)$/.test(new URL(expectedUrl).hostname));
  const confirmedAbsent = (channel: 'google' | 'instagram' | 'website') => {
    const presence = analysis.input.channelPresence?.[channel];
    const inputUrl = channel === 'google' ? analysis.input.mapsUrl : channel === 'instagram' ? analysis.input.instagramUrl : analysis.input.websiteUrl;
    return confirmedAbsence(presence) && !text(inputUrl) && !(channel === 'google' && googleAssessed) && !(channel === 'instagram' && instagramAssessed) && !(channel === 'website' && ownWebsiteObserved);
  };
  const scenario: CompactDiagnostic['scenario'] = googleAssessed && instagramAssessed && confirmedAbsent('website') ? 'google_instagram' : googleAssessed && confirmedAbsent('instagram') && confirmedAbsent('website') ? 'google_only' : instagramAssessed && confirmedAbsent('google') && confirmedAbsent('website') ? 'instagram_only' : 'partial';
  // Confirmed Google absence leads the commercial narrative; contact stays secondary in this scenario.
  const opportunityOrder = (item: CompactFinding) => missingGoogleOpportunity ? item.source === 'Perfil no Google' ? 0 : item.source === 'Instagram' ? 1 : 2 : item.source === 'Caminho de contato' ? 0 : 1;
  opportunities.sort((a, b) => opportunityOrder(a) - opportunityOrder(b));
  const findings = opportunities.slice(0, 2).map(finding => ({
    ...finding,
    consequence: finding.consequence ?? 'Responder aos relatos pode valorizar a confiança já demonstrada e apoiar quem está escolhendo. Não medimos o efeito comercial.',
    direction: finding.direction ?? 'Conferir os relatos recentes e organizar respostas públicas, respeitando a privacidade de cada cliente.',
  }));
  const dateValue = maps?.observedAt || reviews?.observedAt || instagram?.observedAt || analysis.createdAt;
  const parsedDate = new Date(dateValue);
  const date = Number.isNaN(parsedDate.getTime()) ? '' : parsedDate.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const posts = Array.isArray(instagramValue.latestPosts) ? instagramValue.latestPosts.map(record) : [];
  const googleFinding = findings.find(item => item.source === 'Avaliações no Google' || item.source === 'Perfil no Google');
  const instagramFinding = opportunities.find(item => item.source === 'Instagram');
  const contactFinding = opportunities.find(item => item.source === 'Caminho de contato');
  const absentGoogleFinding = missingGoogleOpportunity ? opportunities.find(item => item.source === 'Perfil no Google') : undefined;
  const positiveReputation = googleAssessed && score !== undefined && score >= 4.5 && (totalReviews ?? 0) > 0;
  const editorialPages: CompactEditorialPage[] = [];
  const openingItems: CompactDiagnostic['openingItems'] = [];
  if (googleAssessed) {
    const missingResponses = reviews && sample && responseCount !== undefined && responseCount < sample && reviewValue.ownerResponseVerification === 'verified' && responseState !== 'unknown';
    editorialPages.push({
      section: 'Google · Reputação e escolha',
      title: positiveReputation ? 'Seus clientes já falam bem.' : googleFinding?.title ?? 'O Google ajuda na escolha.',
      emphasis: positiveReputation ? `${companyName.length > 24 ? 'Sua empresa' : companyName} pode participar dessa conversa.` : 'Informações e relatos ajudam quem pesquisa.',
      intro: missingResponses ? `${sample === totalReviews ? 'O perfil reúne' : 'Na amostra de'} ${sample} avaliações${sample === totalReviews && score !== undefined ? ` com nota ${score.toFixed(1).replace('.', ',')}` : ''}. ${responseCount === 0 ? 'Na amostra analisada, nenhuma recebeu uma resposta pública da empresa.' : `${sample! - responseCount!} estavam sem resposta pública da empresa.`}` : positiveReputation ? `O perfil reúne nota ${score!.toFixed(1).replace('.', ',')} e ${totalReviews} avaliações. Essa base pode apoiar a decisão de quem está conhecendo ${companyName}.` : 'O perfil público reúne informações sobre a empresa. A análise considera as informações e avaliações disponíveis.',
      metrics: missingResponses ? [{ value: String(sample), label: 'avaliações analisadas', evidenceIds: [reviews!.id] }, { value: String(responseCount), label: 'respostas públicas identificadas', evidenceIds: [reviews!.id] }] : metrics,
      blocks: [{ title: 'Por que esse ponto importa.', body: `Quem pesquisa ${companyName} pode ler os relatos antes do contato. ${missingResponses ? 'Uma resposta cuidadosa mostra como a empresa acolhe o retorno de quem já foi atendido.' : 'Informações atualizadas e relatos públicos dão contexto para essa escolha.'}` }, { title: 'Por onde eu começaria.', body: missingResponses ? 'Começar pelas avaliações recentes e manter respostas específicas, sem expor informações do atendimento.' : googleFinding?.direction ?? 'Preservar as informações úteis do perfil e conferir serviços, horários e contato.' }],
      note: `Fonte: perfil${sample ? ` e amostra de ${sample} avaliações` : ''} no Google. O efeito sobre contatos e ${patientBusiness ? 'agendamentos' : 'vendas'} não foi medido.`, ...(googleFinding ? { finding: googleFinding } : {}),
    });
    openingItems.push({ title: positiveReputation ? 'Valorizar a confiança no Google.' : 'Cuidar da apresentação no Google.', body: missingResponses ? `As ${sample! - responseCount!} avaliações analisadas estavam sem resposta pública. Há espaço para tornar a atenção da empresa mais visível.` : googleFinding?.body ?? 'O perfil e os relatos públicos ajudam quem pesquisa a conhecer a empresa antes do contato.' });
  }
  if (absentGoogleFinding) {
    editorialPages.push({ section: 'Google · Descoberta e escolha', title: 'Seu trabalho também pode', emphasis: 'ser descoberto no Google.', intro: absentGoogleFinding.body,
      blocks: [{ title: 'Por que isso importa.', body: absentGoogleFinding.consequence! }, { title: 'Como o perfil pode ajudar.', body: 'Serviços, localização, fotos, avaliações e contato dão contexto para a pessoa conhecer o negócio e decidir com quem conversar.' }, { title: 'Por onde eu começaria.', body: absentGoogleFinding.direction! }],
      note: 'Fonte: verificação registrada do negócio. A criação depende da modalidade de atendimento. O efeito sobre contatos não foi medido.', finding: absentGoogleFinding });
    openingItems.push({ title: 'Ser encontrado nas buscas locais.', body: 'A verificação não identificou um perfil. Esse canal pode reunir serviços, avaliações e contato para quem procura uma opção na região.' });
  }
  if (instagramAssessed) {
    const username = text(instagramValue.username);
    const reading = instagramReading(instagramValue, instagram!.observedAt);
    editorialPages.push({
      section: 'Instagram · Apresentação e contato', title: 'Frequência, bio e CTA.',
      emphasis: reading.gaps.length ? 'O que merece ajuste.' : 'O que já funciona.',
      intro: `${username ? `@${username}. ` : ''}Três pontos que ajudam a conhecer o trabalho e iniciar o contato.`,
      blocks: [{ title: 'Frequência de publicação.', body: reading.frequency }, { title: 'Clareza e estrutura da bio.', body: reading.biography }, { title: 'Chamada para ação na bio.', body: reading.cta }],
      note: `Fonte: bio e amostra de ${posts.length} publicações, observadas em ${new Date(instagram!.observedAt).toLocaleDateString('pt-BR', {timeZone: 'UTC'})}. A amostra não garante todo o histórico. Stories e conversas não avaliados.`,
      ...(instagramFinding ? { finding: instagramFinding } : {}),
    });
    openingItems.push({ title: reading.title, body: reading.summary });
  }
  if (contactFinding && !absentGoogleFinding) {
    editorialPages.push({ section: 'Contato · Abertura no celular', title: 'Ela se interessou.', emphasis: 'O contato precisa ser simples.', intro: `${contactFinding.body} ${contactFinding.consequence}`,
      ...(contactFinding.proof ? { metrics: contactFinding.proof.map(proof => ({ ...proof, evidenceIds: contactFinding.evidenceIds })) } : {}), blocks: [{ title: 'Por onde eu começaria.', body: contactFinding.direction! }], note: 'Fonte: teste técnico do destino no celular. Esse tempo não mede quando o botão ficou clicável nem o tempo até uma conversa.', finding: contactFinding });

  }
  if (!editorialPages.length) editorialPages.push({ section: 'Direção · Revisão necessária', title: 'A conclusão precisa de mais contexto.', emphasis: 'Vamos conferir antes de recomendar.', intro: 'As evidências disponíveis não sustentam uma oportunidade específica para esta empresa.', blocks: [{ title: 'Antes de escolher ajustes.', body: 'Confirmar os canais da empresa e revisar as informações públicas disponíveis.' }], note: 'Informações desconhecidas e falhas de leitura não comprovam problemas no negócio.' });
  const priorities: CompactDiagnostic['priorities'] = [];
  if (absentGoogleFinding) priorities.push({ label: 'Primeiro', title: 'Preparar a descoberta no Google.', body: absentGoogleFinding.direction! });
  if (googleAssessed && googleFinding) priorities.push({ label: 'Primeiro', title: googleFinding.source === 'Avaliações no Google' ? 'Organizar as respostas no Google.' : googleFinding.title, body: googleFinding.source === 'Avaliações no Google' ? `Começar pelos relatos recentes torna a atenção de ${companyName} visível para quem está pesquisando. É uma oportunidade confirmada nesta análise.` : googleFinding.direction! });
  if (contactFinding) priorities.push({ label: priorities.length ? 'Em seguida' : 'Primeiro', title: contactFinding.title, body: absentGoogleFinding ? `O teste do destino registrou ${speedScore}/100${lcpSeconds !== undefined ? ` e ${lcpSeconds.toFixed(1).replace('.', ',')} s até o elemento principal` : ''}. Conferir o acesso ao contato no celular; esse tempo não mede quando o botão ficou clicável.` : contactFinding.direction! });
  else if (instagramAssessed) priorities.push({ label: priorities.length ? 'Em seguida' : 'Primeiro', title: 'Organizar frequência, bio e CTA.', body: instagramReading(instagramValue, instagram!.observedAt).direction });
  else if (!priorities.length && googleAssessed) priorities.push({ label: 'Primeiro', title: 'Preservar a reputação e as informações.', body: 'Manter informações úteis e atualizadas para quem pesquisa a empresa antes do contato.' });
  if (scenario === 'google_only') priorities.push({ label: 'Para avaliar', title: 'Considerar como apresentar o trabalho.', body: 'Um Instagram pode mostrar serviços e esclarecer dúvidas antes do contato, se houver condição de manter conteúdo útil. Sua ausência não é uma falha automática.' });
  if (!absentGoogleFinding && scenario === 'instagram_only' && analysis.input.googleEligibility !== 'eligible') priorities.push({ label: 'Para avaliar', title: analysis.input.googleEligibility === 'ineligible' ? 'Aprofundar a apresentação no Instagram.' : 'Confirmar a modalidade do atendimento.', body: analysis.input.googleEligibility === 'ineligible' ? 'Para um negócio sem elegibilidade local, preservar o Instagram e fortalecer informações úteis ao público; não prescrever um perfil no Google.' : 'Entender se existe atendimento presencial ou serviço local elegível antes de recomendar um perfil no Google.' });
  if (!priorities.length) priorities.push({ label: 'Primeiro', title: 'Confirmar os canais e as informações.', body: 'Revisar a cobertura antes de escolher mudanças. As evidências disponíveis não sustentam um problema comercial.' });
  priorities.push({ label: 'Para decidir na conversa', title: 'Escolher o foco da aquisição.', body: 'Entender os serviços prioritários e a origem dos interessados. Isso orienta os próximos ajustes e ações de divulgação.' });
  const headline = absentGoogleFinding ? 'Quem procura seu serviço no Google' : positiveReputation ? `Nota ${score!.toFixed(1).replace('.', ',')} no Google.` : googleAssessed ? 'Sua presença no Google ajuda na escolha.' : instagramAssessed ? 'Seu Instagram apresenta o negócio.' : 'Uma análise para escolher a direção.';
  const openingEmphasis = absentGoogleFinding ? 'pode não estar chegando até você.' : positiveReputation ? 'Uma confiança que merece ser mais bem aproveitada.' : 'O próximo passo depende do que observamos.';
  const intro = absentGoogleFinding ? `${instagramAssessed ? `O Instagram de ${companyName} já apresenta o trabalho. ` : ''}A ausência registrada do Perfil da Empresa no Google abre uma oportunidade de descoberta para quem procura serviços na região.` : positiveReputation ? `Quem já passou por ${companyName} deixa uma boa avaliação. Olhamos como essa reputação${instagramAssessed ? ' e o Instagram ajudam' : ' ajuda'} quem ainda está escolhendo chegar ao contato.` : `Olhamos os canais públicos de ${companyName} para entender como apresentam a empresa e conduzem ao contato.`;
  return {
    companyName, date, patientBusiness, pageCount: editorialPages.length + 3, editorialPages, openingItems, openingEmphasis,
    reviewRequired: findings.length === 0, scenario, coverage, priorities, strength: strengths[0],
    hasProblems: findings.length > 0,
    headline,
    subtitle: 'Evidências públicas para escolher uma direção com contexto.',
    intro,
    metrics: metrics.slice(0, 2), findings,
    bridge: absentGoogleFinding ? 'A prioridade é avaliar a presença no Google e conectar a descoberta ao Instagram e ao contato.' : positiveReputation && instagramAssessed ? 'A prioridade é aproveitar a reputação positiva e o conteúdo publicado, conferindo o caminho até o contato.' : positiveReputation ? 'A prioridade é aproveitar a reputação positiva, conferindo as informações e o caminho até o contato.' : 'Os objetivos e a origem dos contatos ajudam a escolher a prioridade do negócio.', impactTopics: [],
    solutionTitle: 'O que cuidar agora. O que decidir com você.', questions: [], services: [],
    cta: {
      headline: `Qual ponto vale cuidar primeiro ${patientBusiness ? 'na' : 'em'} ${companyName}?`,
      body: absentGoogleFinding ? `Vamos definir o primeiro passo para a presença de ${companyName} no Google.` : `Vamos ligar os pontos desta análise aos serviços que ${companyName} quer fortalecer agora.`,
      focus: absentGoogleFinding ? 'o Google' : 'reputação ou contato',
      button: 'Quero definir minha prioridade',
      url: `https://wa.me/5527998615616?text=${encodeURIComponent(`Olá, Gabriel. Vi o diagnóstico de ${companyName} e quero marcar a conversa de 20 minutos para definir minha prioridade.`)}`,
      durationMinutes: 20,
    },
  };
}
