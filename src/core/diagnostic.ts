import { compactText, humanizeValue, inferCategory, inferPriority, simplifyTechnicalLanguage } from './content.js';
import { buildPresentation } from './slides.js';
import { validateDiagnosticContext, validateFindings } from './validation.js';
import type {
  DiagnosticContext,
  DiagnosticResult,
  AssessedEvidence,
  EvidenceCategory,
  Finding,
  FindingPriority,
} from './types.js';

const categoryImpact: Record<EvidenceCategory, string> = {
  profile: 'Informações claras reduzem dúvidas antes do contato e ajudam o cliente a confirmar que encontrou o negócio certo.',
  reputation: 'A forma como avaliações e respostas aparecem influencia a confiança de quem ainda está comparando opções.',
  media: 'Fotos e atualizações recentes ajudam a representar melhor a experiência e os serviços oferecidos.',
  comparison: 'A amostra mostra diferenças visíveis entre negócios semelhantes na mesma região, sem medir posição exata.',
  website: 'O site pode facilitar ou dificultar a passagem da pesquisa para o contato, o WhatsApp ou o agendamento.',
  instagram: 'O Instagram pode reforçar especialidade, prova social e o próximo passo para quem chegou pelo Google.',
  general: 'O dado pode orientar uma revisão mais específica da presença digital.',
};

const categoryDirection: Record<EvidenceCategory, string> = {
  profile: 'Revisar os campos do perfil e priorizar as informações que ajudam o cliente a decidir e entrar em contato.',
  reputation: 'Criar uma rotina de solicitação e resposta que preserve o tom da marca e trate dúvidas recorrentes.',
  media: 'Atualizar imagens e publicações com registros reais dos serviços, da equipe e da experiência entregue.',
  comparison: 'Usar as diferenças observadas como referência para reforçar os pontos que ainda estão menos claros no perfil.',
  website: 'Ajustar a mensagem e o caminho de conversão, começando pelas páginas com maior intenção comercial.',
  instagram: 'Alinhar bio, conteúdo e chamada para ação com o serviço prioritário e com a prova disponível.',
  general: 'Confirmar o contexto com a empresa e transformar o achado em uma ação mensurável.',
};

const categoryIdealState: Record<EvidenceCategory, string> = {
  profile: 'A pessoa deveria entender rapidamente o que a empresa oferece, por que confiar e qual é o próximo passo para entrar em contato.',
  reputation: 'As avaliações deveriam reforçar os diferenciais e mostrar que a empresa acompanha a experiência de quem já comprou ou foi atendido.',
  media: 'O perfil deveria mostrar imagens atuais e coerentes com a experiência e os serviços que a empresa deseja vender.',
  comparison: 'A empresa deveria tornar sua proposta e o caminho até o contato tão claros quanto ou mais claros que os negócios semelhantes observados.',
  website: 'O site deveria apresentar rapidamente a principal mensagem, os serviços e o caminho até o WhatsApp ou agendamento, especialmente no celular.',
  instagram: 'A bio e os conteúdos recentes deveriam reforçar especialidade, prova, diferenciais e o próximo passo para contato.',
  general: 'O cenário correto precisa ser validado com a empresa e traduzido em uma experiência simples para quem está decidindo.',
};

function findingId(evidenceId: string): string {
  return `finding-${evidenceId.replace(/[^a-z0-9_-]/gi, '-').toLowerCase()}`;
}

function observationFor(evidence: AssessedEvidence): string {
  const value = evidence.value && typeof evidence.value === 'object' && !Array.isArray(evidence.value)
    ? evidence.value as Record<string, unknown>
    : undefined;
  if (!value) return compactText(`${evidence.title}: ${humanizeValue(evidence.value)}`, 240);
  const category = inferCategory(evidence);
  if (category === 'profile') {
    const rating = numberFrom(value.totalScore ?? value.nota);
    const reviews = numberFrom(value.reviewsCount ?? value.avaliacoes);
    const description = value.description ?? value.descricao;
    const facts = [
      rating !== undefined ? `nota pública ${rating.toLocaleString('pt-BR', { minimumFractionDigits: 1 })}` : undefined,
      reviews !== undefined ? `${reviews.toLocaleString('pt-BR')} avaliações` : undefined,
      !description || String(description).toLocaleLowerCase('pt-BR') === 'ausente' ? 'descrição não encontrada' : 'descrição preenchida',
    ].filter(Boolean);
    return `O perfil apresenta ${facts.join(', ')}.`;
  }
  if (category === 'reputation') {
    const sample = numberFrom(value.sampleSize ?? value.total);
    const responseRate = numberFrom(value.ownerResponseRate);
    const responseCount = numberFrom(value.ownerResponseCount ?? value.respostasRecentes);
    const recent = numberFrom(value.reviewsLast90Days ?? value.recentes90Dias);
    const facts = [
      sample !== undefined ? `${sample} avaliações analisadas` : undefined,
      responseRate !== undefined ? `${responseRate}% com resposta da empresa` : responseCount !== undefined ? `${responseCount} respostas observadas` : undefined,
      recent !== undefined ? `${recent} avaliações nos últimos 90 dias` : undefined,
    ].filter(Boolean);
    return `Na reputação pública, foram observadas ${facts.join(', ')}.`;
  }
  if (category === 'media') {
    const photos = numberFrom(value.photoCount);
    const updates = numberFrom(value.updateCount);
    return `A coleta encontrou ${photos ?? 0} fotos e ${updates ?? 0} atualizações públicas no perfil.`;
  }
  if (category === 'comparison') {
    const competitors = Array.isArray(value.competitors) ? value.competitors.length : numberFrom(value.amostra);
    const location = stringFrom(value.location ?? value.local);
    return `A consulta comparou ${competitors ?? 'alguns'} negócios semelhantes${location ? ` em ${location}` : ''}, como retrato do momento e sem medir posição exata.`;
  }
  if (category === 'website' && evidence.source === 'pagespeed') {
    const score = numberFrom(value.performanceScore ?? value.performance);
    const mainContent = stringFrom(value.largestContentfulPaint ?? value.lcp);
    return `No celular, o site recebeu ${score ?? 'uma medição disponível'}${typeof score === 'number' ? ' de 100' : ''}${mainContent ? ` e levou ${mainContent} para mostrar o conteúdo principal` : ''}.`;
  }
  if (category === 'website') {
    const pages = Array.isArray(value.pages) ? value.pages as Array<Record<string, unknown>> : [];
    const hasWhatsApp = pages.some((page) => page.hasWhatsApp === true) || value.whatsapp === true;
    const hasBooking = pages.some((page) => page.hasBooking === true) || value.agendamento === true;
    const tracker = pages.find((page) => page.analytics && typeof page.analytics === 'object')?.analytics as Record<string, unknown> | undefined;
    const metaPixel = tracker?.metaPixel ?? (value.analytics as Record<string, unknown> | undefined)?.metaPixel;
    return `O site ${hasWhatsApp ? 'mostra um caminho para o WhatsApp' : 'não mostrou um caminho claro para o WhatsApp'} e ${hasBooking ? 'apresenta agendamento' : 'não apresentou agendamento'}${metaPixel === false ? '. O rastreador público da Meta não foi encontrado' : ''}.`;
  }
  if (category === 'instagram') {
    const signals = value.signals && typeof value.signals === 'object' ? value.signals as Record<string, unknown> : undefined;
    const recent = numberFrom(signals?.postsLast30Days);
    const contact = numberFrom(signals?.postsWithCallToAction);
    return `Na amostra recente do Instagram, foram encontradas ${recent ?? 0} publicações nos últimos 30 dias e ${contact ?? 0} com convite claro para contato.`;
  }
  return compactText(`${evidence.title}: ${humanizeValue(evidence.value)}`, 240);
}

function copyForEvidence(evidence: AssessedEvidence, category: EvidenceCategory): Pick<Finding, 'observation' | 'possibleImpact' | 'idealState' | 'recommendedDirection' | 'priority'> {
  const value = evidence.value && typeof evidence.value === 'object' && !Array.isArray(evidence.value)
    ? evidence.value as Record<string, unknown>
    : undefined;
  const fallback = {
    observation: observationFor(evidence),
    possibleImpact: categoryImpact[category],
    idealState: categoryIdealState[category],
    recommendedDirection: evidence.recommendation ? compactText(evidence.recommendation, 240) : categoryDirection[category],
    priority: inferPriority(evidence),
  };
  if (!value) return fallback;

  if (category === 'profile') {
    const rating = numberFrom(value.totalScore ?? value.nota);
    const reviews = numberFrom(value.reviewsCount ?? value.avaliacoes);
    const description = stringFrom(value.description ?? value.descricao);
    const missingDescription = !description || description.toLocaleLowerCase('pt-BR') === 'ausente';
    return {
      observation: missingDescription
        ? `No Perfil da Empresa no Google, a nota ${rating?.toLocaleString('pt-BR', { minimumFractionDigits: 1 }) ?? 'pública'} e as ${reviews?.toLocaleString('pt-BR') ?? ''} avaliações são pontos fortes, mas o campo de descrição está vazio.`
        : `O Perfil da Empresa no Google reúne nota ${rating?.toLocaleString('pt-BR', { minimumFractionDigits: 1 }) ?? 'pública'}, ${reviews?.toLocaleString('pt-BR') ?? 'boas'} avaliações e uma descrição preenchida.`,
      possibleImpact: missingDescription
        ? 'Quem encontra a empresa vê uma reputação forte, mas precisa procurar em outros lugares para entender especialidades, região atendida e diferenciais antes de entrar em contato.'
        : 'A combinação de reputação e informações claras reduz dúvidas na primeira comparação.',
      idealState: missingDescription
        ? 'O perfil do Google deveria explicar em poucas linhas que a empresa atua com compra, venda e locação de imóveis em Barra Velha e indicar o caminho de contato.'
        : 'A reputação e a descrição devem continuar alinhadas aos serviços e à região atendida.',
      recommendedDirection: missingDescription
        ? 'Preencher a descrição do Perfil da Empresa no Google com atuação, tipos de imóveis, região atendida e convite para contato.'
        : 'Manter a descrição e os dados do Perfil da Empresa no Google atualizados conforme os serviços prioritários.',
      priority: missingDescription ? 'important' : 'strength',
    };
  }

  if (category === 'reputation') {
    const sample = numberFrom(value.sampleSize) ?? 0;
    const positives = numberFrom(value.positiveCount) ?? 0;
    const responseRate = numberFrom(value.ownerResponseRate) ?? 0;
    const recent = numberFrom(value.reviewsLast90Days) ?? 0;
    return {
      observation: `Nas avaliações do Google, ${positives} de ${sample} avaliações analisadas são positivas e ${recent} chegaram nos últimos 90 dias. Nenhuma recebeu resposta da empresa.`,
      possibleImpact: responseRate === 0
        ? 'A reputação gera confiança, mas elogios e críticas sem resposta deixam de mostrar atenção, acompanhamento e posicionamento público da empresa.'
        : 'A reputação recente ajuda a decisão, e respostas consistentes reforçam que a empresa acompanha a experiência do cliente.',
      idealState: 'As avaliações positivas devem continuar chegando, e cada comentário relevante deveria receber uma resposta humana que reforce atendimento, confiança e disponibilidade.',
      recommendedDirection: responseRate === 0
        ? 'Criar uma rotina de respostas no Perfil da Empresa no Google, começando pelas avaliações recentes e pelas críticas sem retorno.'
        : 'Manter a frequência de avaliações e responder de forma consistente no Perfil da Empresa no Google.',
      priority: responseRate === 0 ? 'important' : 'strength',
    };
  }

  if (category === 'media') {
    const photos = numberFrom(value.photoCount) ?? 0;
    const updates = numberFrom(value.updateCount) ?? 0;
    return {
      observation: `O Perfil da Empresa no Google possui ${photos} fotos coletadas, mas não apresentou atualizações publicadas pela empresa.`,
      possibleImpact: 'As fotos ajudam a comprovar presença, porém a ausência de atualizações reduz os sinais de atividade para quem está pesquisando imóveis e comparando opções.',
      idealState: 'O perfil deveria combinar fotos atuais da equipe, imóveis e atendimentos com atualizações que mostrem oportunidades e movimento recente.',
      recommendedDirection: 'Publicar atualizações no Perfil da Empresa no Google e renovar o acervo com fotos recentes da equipe, dos imóveis e da região.',
      priority: updates === 0 ? 'opportunity' : 'strength',
    };
  }

  if (category === 'comparison') {
    const competitors = Array.isArray(value.competitors) ? value.competitors as Array<Record<string, unknown>> : [];
    const volumes = competitors.map((item) => numberFrom(item.reviewsCount)).filter((item): item is number => item !== undefined);
    const maxReviews = volumes.length ? Math.max(...volumes) : undefined;
    return {
      observation: `Na amostra de ${competitors.length} imobiliárias da região, o maior volume encontrado foi de ${maxReviews ?? 'mais'} avaliações. Aline Almeida possui 105 avaliações e nota 4,9.`,
      possibleImpact: 'A empresa já apresenta uma reputação competitiva; a oportunidade está em transformar essa confiança em uma apresentação mais completa do perfil.',
      idealState: 'O perfil deveria preservar a reputação forte e deixar claros os serviços, a região atendida e o próximo passo para contato.',
      recommendedDirection: 'Usar a reputação já construída como base para completar e manter ativo o Perfil da Empresa no Google.',
      priority: 'strength',
    };
  }

  if (category === 'website' && evidence.source === 'pagespeed') {
    const score = numberFrom(value.performanceScore);
    const mainContent = stringFrom(value.largestContentfulPaint);
    const seconds = mainContent ? Number.parseFloat(mainContent.replace(',', '.')) : undefined;
    const strong = typeof score === 'number' && score >= 90 && typeof seconds === 'number' && seconds <= 2.5;
    return {
      observation: `No celular, o site alcançou ${score ?? 'boa medição'} de 100 e mostrou o conteúdo principal em ${mainContent ?? 'poucos segundos'}.`,
      possibleImpact: strong
        ? 'Isso favorece a experiência de quem acessa pelo celular e reduz o risco de abandono antes de ver os imóveis ou iniciar o contato.'
        : 'Uma espera maior no celular pode fazer parte dos visitantes desistir antes de ver os imóveis ou encontrar o contato.',
      idealState: strong
        ? 'A velocidade atual deve ser preservada conforme novas páginas, imagens e ferramentas forem adicionadas.'
        : 'O conteúdo principal deveria aparecer rapidamente e permanecer estável durante a navegação.',
      recommendedDirection: strong
        ? 'Preservar a boa velocidade mobile e monitorar o desempenho sempre que o site receber novas imagens ou funcionalidades.'
        : 'Priorizar a experiência mobile e reduzir o tempo necessário para mostrar o conteúdo principal.',
      priority: strong ? 'strength' : 'important',
    };
  }

  if (category === 'website') {
    const pages = Array.isArray(value.pages) ? value.pages as Array<Record<string, unknown>> : [];
    const hasWhatsApp = pages.some((page) => page.hasWhatsApp === true);
    const hasBooking = pages.some((page) => page.hasBooking === true);
    const structuredData = pages.some((page) => page.structuredData === true);
    const strong = hasWhatsApp && hasBooking;
    return {
      observation: `O site apresenta WhatsApp e caminhos de contato${structuredData ? ', além de informações organizadas para os mecanismos de busca' : ''}.`,
      possibleImpact: strong
        ? 'Esse caminho facilita a passagem entre o interesse em um imóvel e a conversa com a empresa.'
        : 'Sem um próximo passo visível, parte dos visitantes pode sair antes de iniciar uma conversa.',
      idealState: strong
        ? 'O site deve manter o contato acessível e explicar com clareza por que escolher a empresa em cada página importante.'
        : 'Cada página importante deveria conduzir com clareza até o WhatsApp ou formulário de contato.',
      recommendedDirection: strong
        ? 'Manter os caminhos de contato e reforçar diferenciais e provas nas páginas de maior intenção comercial.'
        : 'Tornar o WhatsApp ou formulário visível nas páginas de imóveis e serviços.',
      priority: strong ? 'strength' : 'important',
    };
  }

  if (category === 'instagram') {
    const signals = value.signals && typeof value.signals === 'object' ? value.signals as Record<string, unknown> : {};
    const last30 = numberFrom(signals.postsLast30Days) ?? 0;
    const last90 = numberFrom(signals.postsLast90Days) ?? 0;
    const days = numberFrom(signals.daysSinceLastPost);
    const contact = numberFrom(signals.postsWithCallToAction) ?? 0;
    return {
      observation: `No Instagram, a amostra encontrou ${last90} publicações nos últimos 90 dias, nenhuma nos últimos 30 dias e ${contact} conteúdos com convite para contato${days !== undefined ? `. A publicação mais recente foi há ${days} dias` : ''}.`,
      possibleImpact: 'Os conteúdos mostram imóveis e caminhos de contato, mas a pausa recente pode transmitir menor atividade justamente quando a pessoa procura sinais atuais do mercado e da empresa.',
      idealState: 'O Instagram deveria combinar frequência recente, imóveis disponíveis, prova de atendimento e convites claros para conversar.',
      recommendedDirection: 'Retomar uma frequência sustentável no Instagram, alternando imóveis, bastidores, orientações e provas de atendimento com convite para contato.',
      priority: last30 === 0 ? 'important' : 'strength',
    };
  }
  return fallback;
}

function numberFrom(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function stringFrom(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function generateFindings(evidence: AssessedEvidence[]): Finding[] {
  const findings = evidence
    .filter((item) => item.confidence >= 0.45 && item.source !== 'operator' && item.source !== 'ai')
    .map((item): Finding => {
      const category = inferCategory(item);
      const content = copyForEvidence(item, category);
      return {
        id: findingId(item.id),
        analysisId: item.analysisId,
        evidenceIds: [item.id],
        category,
        ...content,
        observation: simplifyTechnicalLanguage(content.observation),
        possibleImpact: simplifyTechnicalLanguage(content.possibleImpact),
        idealState: simplifyTechnicalLanguage(content.idealState),
        recommendedDirection: simplifyTechnicalLanguage(content.recommendedDirection),
        approved: true,
        position: 0,
      };
    });

  return deduplicateFindings(findings)
    .sort(compareFindings)
    .map((finding, position) => ({ ...finding, position }));
}

function deduplicateFindings(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const key = `${finding.category}:${finding.observation.toLocaleLowerCase('pt-BR')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function compareFindings(a: Finding, b: Finding): number {
  const weight: Record<FindingPriority, number> = {
    critical: 0,
    important: 1,
    opportunity: 2,
    strength: 3,
  };
  return weight[a.priority] - weight[b.priority] || a.id.localeCompare(b.id);
}

export function createDiagnostic(context: DiagnosticContext): DiagnosticResult {
  validateDiagnosticContext(context);
  const findings = generateFindings(context.evidence);
  validateFindings(findings, context.evidence);
  return {
    findings,
    presentation: buildPresentation(context, findings),
  };
}
