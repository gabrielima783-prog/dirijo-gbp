import type { Evidence, PublicReview } from '../shared/types.js';
import { compactText, inferCategory, redactReviewIdentity } from './content.js';

export interface AIEvidenceBrief {
  evidenceId: string;
  source: Evidence['source'];
  category: string;
  title: string;
  confidence: number;
  facts: unknown;
  representativeExamples?: Array<Record<string, unknown>> | undefined;
}

export interface AIDiagnosticBrief {
  evidence: AIEvidenceBrief[];
  crossChannelSignals: Array<{ label: string; detail: string; evidenceIds: string[] }>;
}

const record = (value: unknown): Record<string, unknown> | undefined => value && typeof value === 'object' && !Array.isArray(value)
  ? value as Record<string, unknown>
  : undefined;

const pick = (value: Record<string, unknown>, keys: string[]): Record<string, unknown> => Object.fromEntries(
  keys.filter((key) => value[key] !== undefined).map((key) => [key, value[key]]),
);

function reviewExamples(value: Record<string, unknown>): Array<Record<string, unknown>> {
  const reviews = Array.isArray(value.reviews) ? value.reviews as PublicReview[] : [];
  const select = (predicate: (review: PublicReview) => boolean, limit: number) => reviews
    .filter((review) => predicate(review) && Boolean(review.text?.trim()))
    .slice(0, limit)
    .map((review) => ({
      rating: review.rating,
      publishedAt: review.publishedAt,
      text: compactText(review.text ?? '', 220),
      hasOwnerResponse: review.responseText || review.responseAt || review.responseStatus === 'present' ? true : review.responseStatus === 'absent' ? false : null,
      ...(review.responseText ? { responseExcerpt: compactText(review.responseText, 160) } : {}),
    }));
  return [...select((review) => (review.rating ?? 0) >= 4, 3), ...select((review) => (review.rating ?? 5) <= 3, 3)];
}

function briefFacts(evidence: Evidence): { facts: unknown; representativeExamples?: Array<Record<string, unknown>> } {
  const value = record(redactReviewIdentity(evidence.value));
  if (!value) return { facts: evidence.value };
  const category = inferCategory(evidence);

  if (evidence.source === 'reviews') {
    const facts = {
      'avaliações analisadas': value.sampleSize,
      'avaliações positivas': value.positiveCount,
      'avaliações críticas': value.criticalCount,
      'avaliações respondidas pela empresa': value.ownerResponseCount,
      'percentual de avaliações respondidas': value.ownerResponseRate,
      'avaliações cuja resposta não pôde ser verificada': value.ownerResponseUnknownCount,
      'verificação das respostas': value.ownerResponseVerification,
      'avaliações recebidas nos últimos 90 dias': value.reviewsLast90Days,
      'dias desde a avaliação mais recente': value.daysSinceLatestReview,
      'temas recorrentes': value.themes,
      'distribuição das notas': value.distribution,
    };
    return { facts, representativeExamples: reviewExamples(value) };
  }

  if (evidence.source === 'competitors') {
    return { facts: pick(value, ['term', 'location', 'observedAt', 'competitors']) };
  }

  if (evidence.source === 'website') {
    if (value.present === false) return { facts: {
      'possui site próprio': false,
      motivo: value.reason,
      'direção sugerida': evidence.recommendation,
    } };
    const nap = record(value.napConsistency) ?? {};
    const primaryActions = Array.isArray(nap.contactActions) ? nap.contactActions.slice(0, 8) : [];
    const pages = Array.isArray(value.pages) ? value.pages.slice(0, 5).map((page, pageIndex) => {
      const item = record(page) ?? {};
      const rawActions = pageIndex === 0 && primaryActions.length
        ? primaryActions
        : Array.isArray(item.contactActions) ? item.contactActions.slice(0, 8) : [];
      const skipGeneralPhone = pageIndex > 0 && primaryActions.some((action) => record(action)?.kind === 'whatsapp');
      const contactActions = rawActions.filter((action) => !(skipGeneralPhone && record(action)?.kind === 'phone')).map((action) => {
        const contact = record(action) ?? {};
        const label = contact.kind === 'whatsapp' && typeof contact.label === 'string' && /^\+?[\d\s().-]+$/.test(contact.label)
          ? 'WhatsApp da unidade'
          : contact.label;
        return { tipo: contact.kind, texto: label, elemento: contact.element };
      });
      return {
        endereço: item.url,
        'página acessível': item.status,
        título: item.title,
        resumo: item.description,
        'título principal': item.h1,
        'possui WhatsApp': item.hasWhatsApp,
        'possui agendamento': item.hasBooking,
        'possui convite para contato': item.hasCallToAction,
        'página renderizada no navegador': item.rendered,
        'botões e links identificados': contactActions,
      };
    }) : [];
    return { facts: {
      'endereço principal do site': value.origin,
      'usa conexão segura': value.https,
      'nome da unidade identificado na coleta': nap.nameFound === true ? 'sim' : 'não validado pela coleta; isso não confirma ausência',
      'nome da unidade confere com o Google': nap.nameMatchesProfile === true ? 'sim' : nap.nameMatchesProfile === false ? 'não; há diferença a conferir' : 'não comparado',
      'endereço identificado na coleta': nap.addressFound === true ? 'sim' : 'não identificado nas páginas capturadas; isso não confirma ausência',
      'endereço exibido no site': nap.siteAddress,
      'endereço confere com o Google': nap.addressMatchesProfile === true ? 'sim' : nap.addressMatchesProfile === false ? 'não; há diferença a conferir' : 'não comparado',
      'telefone identificado na coleta': nap.phoneFound === true ? 'sim' : 'não identificado pela coleta; isso não confirma ausência',
      'telefone do botão confere com o Google': nap.phoneMatchesProfile === true ? 'sim' : nap.phoneMatchesProfile === false ? 'não; há diferença a conferir' : 'não comparado',
      'caminhos de contato identificados': nap.contactActions,
      'cobertura da coleta': nap.collectionNote,
      'páginas analisadas': pages,
    } };
  }

  if (evidence.source === 'pagespeed') {
    return { facts: {
      'resultado do desempenho no celular, de 0 a 100': value.performanceScore,
      'tempo para mostrar o primeiro conteúdo': value.firstContentfulPaint,
      'tempo para mostrar o conteúdo principal': value.largestContentfulPaint,
      'estabilidade visual': value.cumulativeLayoutShift,
      'tipo de aparelho testado': value.strategy,
      'data da medição': value.observedAt,
    } };
  }

  if (evidence.source === 'instagram') {
    const posts = Array.isArray(value.latestPosts) ? value.latestPosts.slice(0, 12).map((post) => {
      const item = record(post) ?? {};
      return {
        'data da publicação': item.publishedAt,
        formato: item.format,
        curtidas: item.likesCount,
        comentários: item.commentsCount,
        fixada: item.pinned,
        ...(typeof item.caption === 'string' ? { texto: compactText(item.caption, 260) } : {}),
      };
    }) : [];
    return {
      facts: {
        'nome de usuário': value.username,
        nome: value.fullName,
        apresentação: value.biography,
        'link do perfil': value.externalUrl,
        categoria: value.category,
        seguidores: value.followersCount,
        'total de publicações': value.postsCount,
        verificado: value.verified,
        'perfil comercial': value.businessAccount,
        'sinais de atividade e contato': value.signals,
        'observações manuais': value.manual,
        'publicações recentes': posts,
      },
    };
  }

  if (evidence.source === 'maps' && category === 'profile') {
    if (value.present === false) return { facts: {
      'possui Perfil da Empresa no Google': false,
      motivo: value.reason,
      'direção sugerida': evidence.recommendation,
    } };
    return {
      facts: {
        nome: value.title,
        'categoria principal': value.category,
        categorias: value.categories,
        endereço: value.address,
        cidade: value.city,
        telefone: value.phone,
        site: value.website,
        descrição: value.description,
        horários: value.openingHours,
        'nota pública': value.totalScore,
        'total de avaliações': value.reviewsCount,
        'distribuição das avaliações': value.reviewsDistribution,
        'outras informações públicas': value.additionalInfo,
      },
    };
  }

  if (evidence.source === 'maps' && category === 'media') {
    return { facts: { 'fotos encontradas': value.photoCount, 'atualizações publicadas pela empresa': value.updateCount, 'perguntas públicas': value.questionCount } };
  }

  return { facts: Object.fromEntries(Object.entries(value).filter(([key]) => !/(?:image|screen|recentReviews)/i.test(key))) };
}

function crossChannelSignals(evidence: Evidence[]): AIDiagnosticBrief['crossChannelSignals'] {
  const profile = evidence.find((item) => item.source === 'maps' && inferCategory(item) === 'profile');
  const website = evidence.find((item) => item.source === 'website');
  const instagram = evidence.find((item) => item.source === 'instagram');
  const result: AIDiagnosticBrief['crossChannelSignals'] = [];

  const profileValue = record(profile?.value);
  const websiteValue = record(website?.value);
  const instagramValue = record(instagram?.value);
  const nap = record(websiteValue?.napConsistency);
  if (profile && profileValue?.present !== false && website && websiteValue?.present !== false && nap) {
    const status = (found: unknown, matches: unknown): string => {
      if (matches === true) return 'identificado e compatível com o Google';
      if (matches === false) return 'identificado, mas diferente do Google; conferir qual informação está atualizada';
      if (found === true) return 'identificado na página, sem comparação conclusiva com o Google';
      return 'não validado pela coleta; isso não confirma ausência no site';
    };
    result.push({
      label: 'Consistência entre Google e site',
      detail: `Nome: ${status(nap.nameFound, nap.nameMatchesProfile)}; endereço: ${status(nap.addressFound, nap.addressMatchesProfile)}; telefone: ${status(nap.phoneFound, nap.phoneMatchesProfile)}.`,
      evidenceIds: [profile.id, website.id],
    });
  }
  if (profile && instagram && profileValue && profileValue.present !== false && instagramValue) {
    const googleCategories = [profileValue.category, ...(Array.isArray(profileValue.categories) ? profileValue.categories : [])].filter(Boolean).join(', ');
    const instagramPositioning = [instagramValue.category, instagramValue.biography].filter((item) => typeof item === 'string' && item.trim()).join(' | ');
    if (googleCategories || instagramPositioning) {
      result.push({
        label: 'Posicionamento entre Google e Instagram',
        detail: `Google: ${compactText(googleCategories || 'não identificado', 180)}. Instagram: ${compactText(instagramPositioning || 'não identificado', 240)}.`,
        evidenceIds: [profile.id, instagram.id],
      });
    }
  }
  return result;
}

export function buildAIDiagnosticBrief(evidence: Evidence[]): AIDiagnosticBrief {
  evidence = evidence.filter((item) => item.source !== 'competitors');
  return {
    evidence: evidence
      .filter((item) => item.source !== 'ai' && item.source !== 'competitors')
      .map((item) => {
        const detail = briefFacts(item);
        return {
          evidenceId: item.id,
          source: item.source,
          category: inferCategory(item),
          title: item.title,
          confidence: item.confidence,
          facts: detail.facts,
          ...(detail.representativeExamples?.length ? { representativeExamples: detail.representativeExamples } : {}),
        };
      }),
    crossChannelSignals: crossChannelSignals(evidence),
  };
}
