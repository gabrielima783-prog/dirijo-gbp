import { responseNarrative } from './review-responses.js';

/** Structural input shared by the server and the browser's public analysis model. */
export interface CompactDiagnosticInput {
  companyName?: string | undefined;
  input: { companyName?: string | undefined; websiteUrl?: string | undefined; businessType?: string | undefined; niche?: string | undefined };
  createdAt: string;
  evidence: Array<{ id: string; source: string; category?: string | undefined; sourceUrl?: string | undefined; value: unknown; observedAt: string; confidence?: number | undefined }>;
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
}
export interface CompactDiagnostic {
  companyName: string;
  date: string;
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
  cta: { headline: string; body: string; button: string; url: string; durationMinutes: 20 };
}

type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue => value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};
const numeric = (value: unknown): number | undefined => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
const shorten = (value: string, max: number) => value.length <= max ? value : `${value.slice(0, max - 1).replace(/\s+\S*$/, '').trim()}…`;
const isReliable = (evidence: CompactDiagnosticInput['evidence'][number]) => (evidence.confidence ?? 0) >= 0.8;
const websiteHost = (value: unknown) => {
  try {
    const url = new URL(text(value));
    if (!['https:', 'http:'].includes(url.protocol)) return '';
    const hostname = url.hostname.replace(/^www\./, '').toLowerCase();
    return /(^|\.)(instagram\.com|facebook\.com|wa\.me|whatsapp\.com|linktr\.ee)$/.test(hostname) ? '' : hostname;
  } catch { return ''; }
};

/** Commercial copy is derived from source facts, independently of older AI slides. */
export function buildCompactDiagnostic(analysis: CompactDiagnosticInput): CompactDiagnostic {
  const evidence = analysis.evidence.filter(isReliable);
  const maps = evidence.find((item) => item.source === 'maps' && (item.category === 'profile' || text(record(item.value).title)));
  const profile = record(maps?.value);
  const reviews = evidence.find((item) => item.source === 'reviews' && numeric(record(item.value).sampleSize) !== undefined);
  const reviewValue = record(reviews?.value);
  const instagram = evidence.find((item) => item.source === 'instagram' && record(item.value).signals);
  const instagramValue = record(instagram?.value);
  const signals = record(instagramValue.signals);
  const companyName = shorten(analysis.companyName || analysis.input.companyName || text(profile.title) || 'Sua empresa', 90);
  const extendedInput = analysis.input;
  const businessContext = [companyName, profile.category, ...(Array.isArray(profile.categories) ? profile.categories : []), instagramValue.category, extendedInput.businessType, extendedInput.niche].filter((item) => typeof item === 'string').join(' ');
  const patientBusiness = /cl[ií]nica|est[eé]tica|homenz|sa[uú]de|m[eé]dic|odont|dentist|nutri|fisioterap|dermatolog|psicolog|hospital/i.test(businessContext);
  const people = patientBusiness ? 'pacientes' : 'clientes';
  const business = patientBusiness ? 'Sua clínica' : 'Sua empresa';
  const businessLower = patientBusiness ? 'sua clínica' : 'sua empresa';
  const destination = patientBusiness ? 'agendamento' : 'contato';
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

  if (maps && profile.present === false) add(opportunities, {
    title: 'A empresa ainda não possui um perfil no Google.',
    body: 'O diagnóstico registra a ausência do Perfil da Empresa. Criar e validar o perfil abre um caminho para apresentar serviços, localização e contato nas pesquisas locais.',
    source: 'Perfil no Google', evidenceIds: [maps.id], kind: 'opportunity',
  });
  else if (maps && analysis.sourceStatuses.maps?.status === 'completed' && text(profile.title)) {
    if (!text(profile.website)) add(opportunities, {
      title: 'O perfil do Google não apresentava um link de site.',
      body: `Quem pesquisa a unidade tem uma oportunidade a menos de acessar uma página com serviços e um próximo passo para o ${destination}. Vale conferir qual destino deve acompanhar o perfil.`,
      source: 'Perfil no Google', evidenceIds: [maps.id], kind: 'opportunity',
    });
    else if (score !== undefined && score >= 4.5 && (totalReviews ?? 0) > 0) add(strengths, {
      title: 'A reputação no Google transmite confiança.',
      body: `O perfil reúne nota ${score.toFixed(1).replace('.', ',')} e ${totalReviews} avaliações. Essa base pode apoiar a decisão de quem conhece ${businessLower} pela primeira vez.`,
      source: 'Perfil no Google', evidenceIds: [maps.id], kind: 'strength',
    });
    if (totalReviews === 0) add(opportunities, {
      title: 'O perfil ainda não reúne avaliações no Google.',
      body: 'Quem pesquisa encontra menos relatos públicos de experiências anteriores. Uma rotina legítima de pedidos a clientes atendidos pode ajudar a construir essa confiança.',
      source: 'Perfil no Google', evidenceIds: [maps.id], kind: 'opportunity',
    });
  }

  const website = evidence.find((item) => item.source === 'website' && Array.isArray(record(item.value).pages));
  const websiteValue = record(website?.value);
  const pages = Array.isArray(websiteValue.pages) ? websiteValue.pages.map(record) : [];
  const pageSpeed = evidence.find((item) => item.source === 'pagespeed');
  const speedValue = record(pageSpeed?.value);
  const speedScore = numeric(speedValue.performanceScore);
  const expectedHost = websiteHost(profile.website) || websiteHost(analysis.input.websiteUrl);
  const testedHost = websiteHost(pageSpeed?.sourceUrl);
  const siteHost = websiteHost(websiteValue.origin) || websiteHost(website?.sourceUrl);
  const accessiblePages = pages.length > 0 && pages.every((page) => {
    const status = numeric(page.status);
    return status !== undefined && status >= 200 && status < 300 && !/access denied|forbidden|just a moment|attention required|verifique que voc[eê] [eé] humano/i.test(text(page.title));
  });
  if (website && pageSpeed && expectedHost && testedHost === expectedHost && siteHost === expectedHost && accessiblePages && speedValue.strategy === 'mobile' && analysis.sourceStatuses.pagespeed?.status === 'completed' && speedScore !== undefined && speedScore < 50) add(opportunities, {
    title: 'O site tem uma oportunidade de melhoria no celular.',
    body: `O teste mobile registrou ${speedScore}/100 em desempenho. Melhorar o carregamento pode facilitar a leitura dos serviços e o caminho até o ${destination}. O resultado é uma medição técnica, não uma prova de perda de vendas.`,
    source: 'Desempenho mobile do site', evidenceIds: [website.id, pageSpeed.id], kind: 'opportunity',
  });

  const last30 = numeric(signals.postsLast30Days);
  const postsSample = numeric(signals.sampleSize);
  if (instagram && instagramValue.privateAccount !== true && last30 !== undefined && (postsSample ?? 0) > 0) {
    if (last30 <= 2) add(opportunities, {
      title: last30 === 0 ? 'Nenhuma publicação nos 30 dias analisados.' : `O Instagram teve ${last30} ${last30 === 1 ? 'publicação' : 'publicações'} nos 30 dias analisados.`,
      body: `A atividade observada abre espaço para apresentar mais ${patientBusiness ? 'procedimentos' : 'serviços'}, esclarecer dúvidas e convidar interessados a conversar. A frequência deve acompanhar a estratégia da empresa.`,
      source: 'Instagram', evidenceIds: [instagram.id], kind: 'opportunity',
    });
    else add(strengths, {
      title: 'O Instagram mantém atividade recente.',
      body: `O diagnóstico identificou ${last30} publicações nos últimos 30 dias. Essa presença permite apresentar serviços e criar oportunidades de conversa com os interessados.`,
      source: 'Instagram', evidenceIds: [instagram.id], kind: 'strength',
    });
  }

  let findings = [...opportunities, ...strengths, ...verifications].slice(0, 3);
  if (!findings.length) findings = [{
    title: 'O próximo passo exige entender a operação.',
    body: 'As informações disponíveis ainda não sustentam uma conclusão sobre falhas na presença pública. Anúncios, rastreamento e automações precisam de uma análise mais profunda.',
    source: 'Escopo do diagnóstico', evidenceIds: [], kind: 'verification',
  }];
  const hasOpportunities = opportunities.length > 0;
  const headline = hasOpportunities
    ? `${business} pode estar perdendo ${people} antes mesmo da primeira conversa.`
    : score !== undefined && score >= 4.5
      ? `${business} tem boa reputação. Quantos interessados chegam até o ${destination}?`
      : `${business}: como transformar mais interesse em novos ${people}?`;
  const dateValue = maps?.observedAt || reviews?.observedAt || instagram?.observedAt || analysis.createdAt;
  const parsedDate = new Date(dateValue);
  const date = Number.isNaN(parsedDate.getTime()) ? '' : parsedDate.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const consequences: string[] = [];
  const impactTopics: string[] = [];
  const displayedOpportunities = findings.filter(finding => finding.kind === 'opportunity');
  if (displayedOpportunities.some(finding => finding.source === 'Perfil no Google')) {
    impactTopics.push(...(totalReviews === 0 && text(profile.website) ? ['Menos relatos de clientes para apoiar a decisão.', 'Mais dificuldade para transmitir confiança a quem pesquisa.'] : profile.present === false ? ['Mais dificuldade para encontrar a empresa no Google.', 'Menos acesso aos serviços e ao contato nas pesquisas.'] : ['Mais dificuldade para conhecer os serviços.', `Dúvidas sobre o que a ${patientBusiness ? 'clínica' : 'empresa'} oferece.`]));
    consequences.push(profile.present === false
      ? 'Quem procura seus serviços no Google pode não encontrar sua empresa.'
      : 'Sem um link de site no perfil do Google, fica mais difícil conhecer seus serviços e entender o que você oferece.');
  }
  if (displayedOpportunities.some(finding => finding.source === 'Avaliações no Google')) {
    impactTopics.push('Comentários de clientes ficam sem resposta.', `Pode parecer que a ${patientBusiness ? 'clínica' : 'empresa'} dá pouca atenção.`);
    consequences.push('Avaliações sem resposta podem deixar dúvidas sobre a atenção que você dá aos clientes.');
  }
  if (displayedOpportunities.some(finding => finding.source === 'Instagram')) {
    impactTopics.push('Os serviços aparecem pouco no Instagram.', `Menos chances de atrair novos ${people}.`);
    consequences.push('Com poucas publicações, seus serviços ganham menos espaço para despertar o interesse de novos clientes.');
  }
  if (displayedOpportunities.some(finding => finding.source === 'Desempenho mobile do site')) {
    impactTopics.push('Mais dificuldade para acessar os serviços pelo celular.', 'O interessado pode desistir antes de entrar em contato.');
    consequences.push('Um site lento dificulta conhecer seus serviços e pode fazer o interessado desistir antes de entrar em contato.');
  }
  return {
    impactTopics: impactTopics.slice(0, 6),
    companyName, date, patientBusiness, hasProblems: hasOpportunities, headline,
    subtitle: hasOpportunities
      ? `Encontramos pontos na sua presença digital que merecem atenção de quem quer conquistar mais ${patientBusiness ? 'agendamentos' : 'clientes'}.`
      : `O diagnóstico mostra sua presença pública. O próximo passo é entender como esse interesse se transforma em ${patientBusiness ? 'agendamentos' : 'vendas'}.`,
    intro: `Analisei a presença digital da ${companyName} e encontrei estes pontos.`,
    metrics: metrics.slice(0, 2), findings,
    bridge: hasOpportunities
      ? consequences.join(' ')
      : 'Sua presença pública oferece uma base para o próximo passo. Anúncios, rastreamento e automações precisam de uma análise mais profunda para definir prioridades.',
    solutionTitle: `Como eu, Gabriel, posso ajudar ${businessLower} a conquistar mais ${people}.`,
    questions: [],
    services: [
      { title: 'Atrair interessados com ANÚNCIOS ONLINE.', body: '' },
      { title: 'Fazer as pessoas te encontrarem pelo Google.', body: '' },
      { title: 'Criar um site que mostre seus serviços e convide o cliente a entrar em contato.', body: '' },
      { title: 'Otimizar e potencializar os resultados que você já tem.', body: '' },
    ],
    cta: {
      headline: `Uma conversa sobre a sua ${patientBusiness ? 'clínica' : 'empresa'}.`,
      body: `Vamos olhar esses pontos juntos e entender o que pode ajudar ${businessLower} a atrair mais ${people}.`,
      button: 'Agendar minha conversa',
      url: `https://wa.me/5527998615616?text=${encodeURIComponent(`Quero agendar meu diagnóstico estratégico de 20 minutos para ${companyName}.`)}`,
      durationMinutes: 20,
    },
  };
}
