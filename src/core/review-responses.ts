/** Only verified collection fields can establish that a reply is absent. */
export function responseNarrative(value?: Record<string, unknown>) {
  const numeric = (item: unknown) => typeof item === 'number' && Number.isFinite(item) && item >= 0 ? item : undefined;
  const sample = numeric(value?.sampleSize);
  const count = numeric(value?.ownerResponseCount);
  const rate = numeric(value?.ownerResponseRate);
  const legacyReviews = Array.isArray(value?.reviews) ? value.reviews as Array<Record<string, unknown>> : [];
  const legacyUnverified = !value?.ownerResponseVerification && count === 0 && legacyReviews.some((review) => !review.responseStatus && !review.responseText && !review.responseAt);
  const unknown = legacyUnverified || value?.ownerResponseVerification === 'unknown' || (numeric(value?.ownerResponseUnknownCount) ?? 0) > 0;
  const state = !sample || unknown || (count === undefined && rate === undefined) ? 'unknown'
    : count !== undefined ? count === 0 ? 'none' : count >= sample ? 'all' : 'partial'
    : rate === 0 ? 'none' : rate === 100 ? 'all' : 'partial';
  const observation = state === 'unknown'
    ? `A coleta não permitiu confirmar as respostas da empresa em toda a amostra${count ? `. Foram identificadas ${count} avaliações com resposta pública` : ''}.`
    : count !== undefined ? `Das ${sample} avaliações analisadas no Google, ${count} receberam resposta pública da empresa.`
    : `${rate}% das ${sample} avaliações analisadas no Google receberam resposta pública da empresa.`;
  const headline = state === 'unknown' ? 'Respostas no Google: a coleta precisa de confirmação.'
    : state === 'none' ? 'Respostas no Google: nenhuma avaliação analisada recebeu retorno.'
    : state === 'all' ? 'Respostas no Google: todas as avaliações analisadas receberam retorno.'
    : 'Respostas no Google: parte das avaliações analisadas recebeu retorno.';
  return {
    state, headline, observation,
    possibleImpact: state === 'unknown' ? 'Sem uma verificação completa, não é possível avaliar a rotina de respostas da empresa.'
      : state === 'all' ? 'As respostas demonstram acompanhamento e reforçam a confiança de quem pesquisa a empresa.'
      : 'As avaliações sem resposta deixam de mostrar o acompanhamento público da empresa e podem deixar críticas sem contexto.',
    idealState: 'As respostas públicas devem demonstrar atenção, agradecimento e disposição para resolver as questões de cada avaliação.',
    recommendedDirection: state === 'unknown' ? 'Conferir as respostas diretamente no Perfil da Empresa no Google antes de definir ações.'
      : state === 'all' ? 'Manter a rotina de respostas e acompanhar as novas avaliações.'
      : 'Responder às avaliações ainda sem retorno, começando pelas críticas e pelas mais recentes.',
    priority: state === 'unknown' ? 'opportunity' as const : state === 'all' ? 'strength' as const : 'important' as const,
  };
}

export function assertResponseFacts(text: string, value: Record<string, unknown>): void {
  const state = responseNarrative(value).state;
  const claimsNone = /nenhuma[^.!?]{0,90}(?:respost|respond|retorno)|(?:nenhum|zero|0)\s+(?:respostas?|avaliações?\s+respondidas)|não[^.!?]{0,40}responde(?:u)?\s+(?:às?\s+)?avaliações/iu.test(text);
  const claimsAll = /todas[^.!?]{0,90}(?:respondidas|receberam[^.!?]{0,30}(?:resposta|retorno))|100\s*%[^.!?]{0,90}(?:respost|respond|retorno)/iu.test(text);
  if ((claimsNone && state !== 'none') || (claimsAll && state !== 'all')) {
    throw new Error('Afirmação sobre respostas às avaliações incompatível com a coleta verificada.');
  }
}
