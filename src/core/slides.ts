import { compactText, humanizeValue, inferCategory } from './content.js';
import type { AssessedEvidence, DiagnosticContext, Finding, PresentationSpec, SlideLayout, SlideSpec } from './types.js';
import { validatePresentation } from './validation.js';

const BRAND = {
  name: 'Dirijo' as const,
  ink: '#091016' as const,
  system: '#23C5C9' as const,
  drive: '#FFB52B' as const,
  stone: '#F1F0E9' as const,
  headingFont: 'Manrope' as const,
  bodyFont: 'Inter' as const,
};

const layoutCategory: Partial<Record<SlideLayout, string[]>> = {
  profile: ['profile', 'comparison'],
  reputation: ['reputation'],
  responses: ['reputation'],
  media: ['media'],
  website: ['website'],
  instagram: ['instagram'],
};

const sourceLabels: Record<string, string> = {
  maps: 'Perfil da Empresa no Google',
  reviews: 'Avaliações públicas no Google',
  competitors: 'Negócios semelhantes encontrados na consulta',
  website: 'Site público informado',
  pagespeed: 'Teste de desempenho do Google',
  instagram: 'Perfil e publicações públicas do Instagram',
  operator: 'Observação do analista',
};

function resolveCompanyName(context: DiagnosticContext): string {
  if (context.companyName?.trim()) return context.companyName.trim();
  if (context.input.companyName?.trim()) return context.input.companyName.trim();
  const profile = context.evidence.find((item) => item.source === 'maps' && inferCategory(item) === 'profile');
  const value = profile?.value as Record<string, unknown> | undefined;
  return typeof value?.title === 'string' ? compactText(value.title, 72) : 'Empresa analisada';
}

function audienceTerms(context: DiagnosticContext): { person: string; action: string } {
  const profile = context.evidence.find((item) => item.source === 'maps' && inferCategory(item) === 'profile');
  const text = JSON.stringify(profile?.value ?? '').toLocaleLowerCase('pt-BR');
  if (/cl[ií]nica|odont|m[eé]dic|sa[uú]de|est[eé]tica|hospital|consult[oó]rio/.test(text)) {
    return { person: 'paciente', action: 'agendar' };
  }
  return { person: 'cliente', action: 'entrar em contato' };
}

function evidenceForLayout(layout: SlideLayout, evidence: AssessedEvidence[]): AssessedEvidence[] {
  const categories = layoutCategory[layout];
  if (!categories) return [];
  return evidence.filter((item) => categories.includes(inferCategory(item)));
}

function findingsForLayout(layout: SlideLayout, findings: Finding[]): Finding[] {
  const categories = layoutCategory[layout];
  if (!categories) return [];
  const approved = findings.filter((finding) => finding.approved);
  const targeted = approved.filter((finding) => finding.targetLayout === layout);
  return targeted.length ? targeted : approved.filter((finding) => categories.includes(finding.category));
}

function assets(evidence: AssessedEvidence[]): string[] {
  return evidence.filter((item) => item.screenshotPath).map((item) => item.id).slice(0, 3);
}

function sources(evidence: AssessedEvidence[]): string {
  return [...new Set(evidence.map((item) => sourceLabels[String(item.source)] ?? String(item.source)))].join(' + ');
}

export function narrativeBody(parts: { issue: string; impact: string; ideal: string; direction: string; source?: string }): string {
  const body = [
    'O que encontramos', compactText(parts.issue, 360),
    '', 'Por que isso pode custar oportunidades', compactText(parts.impact, 360),
    '', 'Como deveria estar', compactText(parts.ideal, 360),
    '', 'Direção', compactText(parts.direction, 300),
  ].join('\n');
  return parts.source ? `${body}\n\nFonte: ${parts.source}` : body;
}

function plainNarrative(body: string): string {
  return body.replace(/(?:O que encontramos|Por que isso pode custar oportunidades|Como deveria estar|Direção|Fonte:)/giu, ' ').replace(/\s+/g, ' ').trim();
}

function speakerNotes(title: string, body: string, transition: string): string {
  return compactText(`Neste ponto, o dado principal é ${title.toLocaleLowerCase('pt-BR')}. ${plainNarrative(body)} ${transition}`, 900);
}

function fallbackFinding(layout: SlideLayout, evidence: AssessedEvidence[]): Finding {
  const fact = evidence.length
    ? evidence.slice(0, 2).map((item) => `${item.title}: ${humanizeValue(item.value)}`).join(' ')
    : 'A coleta não trouxe evidências suficientes para uma conclusão responsável.';
  const defaults: Record<string, Pick<Finding, 'possibleImpact' | 'idealState' | 'recommendedDirection'>> = {
    profile: { possibleImpact: 'Quando a primeira impressão deixa dúvidas, a pessoa pode continuar comparando outras opções em vez de iniciar o contato.', idealState: 'A pessoa deveria entender rapidamente o que a empresa oferece, por que confiar e qual é o próximo passo.', recommendedDirection: 'Organizar o perfil para transformar a atenção existente em uma decisão mais simples.' },
    reputation: { possibleImpact: 'Dúvidas públicas sem contexto podem aumentar a insegurança de quem ainda está escolhendo.', idealState: 'As avaliações deveriam reforçar os diferenciais e mostrar que a empresa acompanha a experiência de seus clientes.', recommendedDirection: 'Usar a reputação como demonstração pública de confiança, atenção e capacidade de resposta.' },
    responses: { possibleImpact: 'Sem uma resposta, a crítica permanece como a única versão disponível para quem pesquisa.', idealState: 'A resposta deveria demonstrar atenção, contexto e disposição para resolver sem entrar em conflito.', recommendedDirection: 'Transformar respostas públicas em sinais de cuidado e acompanhamento.' },
    media: { possibleImpact: 'Imagens antigas ou genéricas dificultam a percepção de estrutura, equipe e qualidade da experiência.', idealState: 'O perfil deveria mostrar imagens atuais e coerentes com o serviço que a empresa deseja vender.', recommendedDirection: 'Usar o conteúdo visual para reduzir insegurança e aumentar o valor percebido.' },
    website: { possibleImpact: 'Atritos no celular podem fazer a pessoa desistir antes de encontrar o serviço ou o botão de contato.', idealState: 'A página deveria apresentar rapidamente a mensagem principal, os serviços e o caminho até o contato.', recommendedDirection: 'Priorizar uma experiência mobile rápida, estável e direta até o WhatsApp ou agendamento.' },
    instagram: { possibleImpact: 'O conteúdo pode gerar atenção sem deixar claro por que confiar ou como avançar para uma conversa.', idealState: 'Bio, publicações e provas deveriam conduzir naturalmente do interesse até o contato.', recommendedDirection: 'Alinhar posicionamento, prova e próximo passo ao serviço prioritário.' },
  };
  const selected = defaults[layout] ?? defaults.profile!;
  return { id: `fallback-${layout}`, analysisId: '', evidenceIds: evidence.map((item) => item.id), category: layout === 'responses' ? 'reputation' : layout, priority: 'opportunity', observation: fact, ...selected, approved: true, position: 0 };
}

function makeSlide(context: DiagnosticContext, position: number, layout: SlideLayout, title: string, findings: Finding[], transition: string): SlideSpec {
  const evidence = evidenceForLayout(layout, context.evidence);
  const related = findingsForLayout(layout, findings);
  const selected = related[0] ?? fallbackFinding(layout, evidence);
  const resolvedTitle = selected.headline?.trim() || title;
  const narrative = narrativeForLayout(layout, evidence, related, selected);
  const source = evidence.length ? sources(evidence) : undefined;
  const body = narrativeBody({ ...narrative, ...(source ? { source } : {}) });
  return { id: `slide-${layout}`, analysisId: context.analysisId, layout, title: resolvedTitle, body, evidenceIds: evidence.map((item) => item.id), visualAssetIds: assets(evidence), speakerNotes: speakerNotes(resolvedTitle, body, transition), durationSeconds: 30, approved: true, position };
}

function narrativeForLayout(layout: SlideLayout, evidence: AssessedEvidence[], related: Finding[], selected: Finding): { issue: string; impact: string; ideal: string; direction: string } {
  const defaultNarrative = {
    issue: [selected.observation, ...related.slice(1, 3).map((finding) => finding.observation)].join(' '),
    impact: selected.possibleImpact,
    ideal: selected.idealState,
    direction: selected.recommendedDirection,
  };
  if (selected.targetLayout || selected.headline) return defaultNarrative;
  const reviews = evidence.find((item) => item.source === 'reviews')?.value as Record<string, unknown> | undefined;
  if (layout === 'reputation' && reviews) {
    const sample = Number(reviews.sampleSize ?? 0);
    const positive = Number(reviews.positiveCount ?? 0);
    const recent = Number(reviews.reviewsLast90Days ?? 0);
    const themes = Array.isArray(reviews.themes) ? reviews.themes as Array<Record<string, unknown>> : [];
    const recurring = themes.filter((theme) => Number(theme.count ?? 0) >= 3).slice(0, 2).map((theme) => String(theme.theme));
    return {
      issue: `${positive} de ${sample} avaliações analisadas são positivas, com ${recent} novas avaliações nos últimos 90 dias${recurring.length ? `. Os elogios se concentram em ${recurring.join(' e ')}` : ''}.`,
      impact: 'Essa reputação recente reduz insegurança e oferece uma prova pública forte para quem ainda está comparando imobiliárias.',
      ideal: 'A empresa deve preservar a entrada de avaliações e aproveitar os elogios recorrentes como prova de atendimento e confiança.',
      direction: 'Destacar os temas mais elogiados na comunicação e manter o pedido de avaliações após atendimentos concluídos.',
    };
  }
  if (layout === 'responses' && reviews) {
    const sample = Number(reviews.sampleSize ?? 0);
    const responses = Number(reviews.ownerResponseCount ?? 0);
    return {
      issue: `Das ${sample} avaliações analisadas no Google, ${responses} receberam resposta pública da empresa.`,
      impact: 'Sem resposta, elogios deixam de ser reforçados e críticas permanecem sem o contexto da empresa para quem está pesquisando.',
      ideal: 'Avaliações recentes e críticas deveriam receber respostas humanas que demonstrem atenção, agradecimento e disposição para resolver.',
      direction: 'Responder primeiro às avaliações recentes e às críticas, depois manter uma rotina semanal no Perfil da Empresa no Google.',
    };
  }
  if (layout === 'website') {
    const siteFinding = related.find((finding) => finding.evidenceIds.some((id) => evidence.find((item) => item.id === id)?.source === 'website'));
    const speedFinding = related.find((finding) => finding.evidenceIds.some((id) => evidence.find((item) => item.id === id)?.source === 'pagespeed'));
    if (siteFinding && speedFinding) return {
      issue: `${siteFinding.observation} ${speedFinding.observation}`,
      impact: `${siteFinding.possibleImpact} ${speedFinding.possibleImpact}`,
      ideal: `${siteFinding.idealState} ${speedFinding.idealState}`,
      direction: `${siteFinding.recommendedDirection} ${speedFinding.recommendedDirection}`,
    };
  }
  return defaultNarrative;
}

function summarySlide(context: DiagnosticContext, findings: Finding[], position: number): SlideSpec {
  const body = [
    'Analisamos como a empresa aparece, gera confiança e conduz uma pessoa da pesquisa até a conversa comercial.',
    '', 'Google Maps', 'Perfil, comparação local, fotos e sinais de atividade pública.',
    '', 'Reputação', 'Avaliações recentes, temas recorrentes e respostas da empresa.',
    '', 'Site', 'Clareza, experiência no celular e caminho até o contato.',
    '', 'Instagram', 'Frequência, oferta apresentada, provas e convite para conversar.',
    '', 'Verde', 'Ponto forte que merece ser preservado.',
    '', 'Amarelo', 'Oportunidade que pode melhorar o resultado.',
    '', 'Vermelho', 'Ponto que merece correção prioritária.',
  ].join('\n');
  return { id: 'slide-summary', analysisId: context.analysisId, layout: 'summary', title: 'O caminho que um cliente percorre antes de entrar em contato.', body, evidenceIds: [], visualAssetIds: [], speakerNotes: 'Antes das conclusões, vale entender o caminho analisado. Observamos como a empresa aparece no Google Maps, como a reputação influencia a confiança, como o site conduz até o contato e como o Instagram mantém a presença ativa. Verde mostra pontos fortes, amarelo indica oportunidades e vermelho sinaliza correções prioritárias. Agora vamos abrir cada etapa com suas evidências.', durationSeconds: 30, approved: true, position };
}

function prioritiesSlide(context: DiagnosticContext, findings: Finding[], position: number): SlideSpec {
  const selected = findings.filter((finding) => finding.approved && finding.priority !== 'strength').slice(0, 3);
  const lines = selected.length ? selected.map((finding, index) => `${index + 1}. ${finding.recommendedDirection}`) : ['1. Preservar os pontos fortes e validar a próxima oportunidade com a empresa.'];
  const body = lines.join('\n');
  return { id: 'slide-priorities', analysisId: context.analysisId, layout: 'priorities', title: 'Três ajustes objetivos para fortalecer o caminho até o contato.', body, evidenceIds: [...new Set(selected.flatMap((finding) => finding.evidenceIds))], visualAssetIds: [], speakerNotes: compactText(`Estas são as prioridades mais específicas encontradas na análise. ${lines.join(' ')} Cada uma aponta exatamente o canal e o ponto que merece atenção primeiro.`, 900), durationSeconds: 30, approved: true, position };
}

function ctaSlide(context: DiagnosticContext, position: number): SlideSpec {
  const name = resolveCompanyName(context);
  const terms = audienceTerms(context);
  const acquisition = terms.person === 'paciente' ? 'aquisição de pacientes' : 'aquisição de clientes';
  const body = [
    `Este diagnóstico avaliou a presença pública de ${name}. Ainda existem outros pontos que influenciam o resultado e exigem uma análise mais profunda: geração de demanda, anúncios, páginas, acompanhamento dos resultados, organização dos contatos e acompanhamento comercial.`,
    '',
    `A Dirijo estrutura ${acquisition} e presença digital para transformar atenção em oportunidades reais, conectando estratégia, anúncios, páginas, dados, organização dos contatos e inteligência artificial.`,
    '',
    'Próximo passo',
    'Agendar uma conversa estratégica de aproximadamente 30 minutos com a Dirijo.',
  ].join('\n');
  return { id: 'slide-cta', analysisId: context.analysisId, layout: 'cta', title: 'A presença pública é só uma parte do resultado.', body, evidenceIds: [], visualAssetIds: [], speakerNotes: `O que vimos até aqui é a parte pública do caminho. Para entender o potencial completo de ${name}, ainda precisamos olhar como a demanda é gerada, medida, organizada e acompanhada. A Dirijo conecta estratégia, anúncios, páginas, dados, organização dos contatos e inteligência artificial para transformar atenção em oportunidades reais. Em uma conversa de aproximadamente 30 minutos, podemos aprofundar os outros pontos e definir o melhor começo.`, durationSeconds: 30, approved: true, position };
}

function responseTitle(context: DiagnosticContext): string {
  const reviews = context.evidence.find((item) => item.source === 'reviews')?.value as Record<string, unknown> | undefined;
  return Number(reviews?.ownerResponseRate ?? 0) >= 60 ? 'Respostas no Google: atenção que reforça confiança.' : 'Respostas no Google: nenhuma avaliação analisada recebeu retorno.';
}

function assignPositionsAndDurations(slides: SlideSpec[]): SlideSpec[] {
  const target = 300;
  const base = Math.min(45, Math.max(30, Math.round(target / slides.length)));
  const adjustment = target - base * slides.length;
  return slides.map((slide, index) => ({ ...slide, position: index, durationSeconds: index === slides.length - 1 ? Math.min(45, Math.max(30, base + adjustment)) : base }));
}

export function buildPresentation(context: DiagnosticContext, findings: Finding[]): PresentationSpec {
  const name = resolveCompanyName(context);
  const terms = audienceTerms(context);
  const slides: SlideSpec[] = [
    { id: 'slide-cover', analysisId: context.analysisId, layout: 'cover', title: `O que um ${terms.person} encontra antes de escolher ${name}.`, body: `Uma análise da presença no Google, da reputação e dos caminhos até ${terms.action}.`, evidenceIds: [], visualAssetIds: context.input.companyLogo ? ['company-logo'] : [], speakerNotes: `Preparei esta análise para mostrar como ${name} aparece hoje para quem pesquisa, compara e decide ${terms.action}. O objetivo é localizar pontos que podem interromper esse caminho e entender como deveria ser a experiência correta.`, durationSeconds: 30, approved: true, position: 0 },
    summarySlide(context, findings, 1),
    makeSlide(context, 2, 'profile', 'Google Maps: a reputação é forte, mas o perfil deixa uma lacuna.', findings, 'Depois do perfil, a reputação mostra quais provas já ajudam a empresa.'),
    makeSlide(context, 3, 'reputation', 'Avaliações no Google: confiança forte e recente.', findings, 'Agora vamos olhar a oportunidade que existe nas respostas públicas.'),
    makeSlide(context, 4, 'responses', responseTitle(context), findings, 'Em seguida, vamos olhar fotos e sinais de atividade no Google.'),
    makeSlide(context, 5, 'media', 'Fotos no Google: há acervo, mas falta atividade publicada pela empresa.', findings, 'Com o Google analisado, seguimos para os canais próprios da empresa.'),
  ];
  if (context.evidence.some((item) => item.source === 'website' || item.source === 'pagespeed')) slides.push(makeSlide(context, slides.length, 'website', 'Site: desempenho excelente e caminho de contato funcionando.', findings, 'O próximo canal mostra se a presença permanece ativa depois da visita ao site.'));
  if (context.evidence.some((item) => item.source === 'instagram')) slides.push(makeSlide(context, slides.length, 'instagram', 'Instagram: o contato está claro, mas a frequência caiu.', findings, 'Com todos os canais revisados, fechamos com as prioridades mais objetivas.'));
  slides.push(prioritiesSlide(context, findings, slides.length));
  slides.push(ctaSlide(context, slides.length));
  const timedSlides = assignPositionsAndDurations(slides);
  const presentation: PresentationSpec = { analysisId: context.analysisId, companyName: name, generatedAt: context.generatedAt ?? new Date().toISOString(), slides: timedSlides, totalDurationSeconds: timedSlides.reduce((total, slide) => total + slide.durationSeconds, 0), brand: BRAND };
  validatePresentation(presentation, context.evidence);
  return presentation;
}
