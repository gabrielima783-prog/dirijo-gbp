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
      hasOwnerResponse: Boolean(review.responseText),
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
    const pages = Array.isArray(value.pages) ? value.pages.slice(0, 5).map((page) => {
      const item = record(page) ?? {};
      return {
        endereço: item.url,
        'página acessível': item.status,
        título: item.title,
        resumo: item.description,
        'título principal': item.h1,
        'possui WhatsApp': item.hasWhatsApp,
        'possui agendamento': item.hasBooking,
        'possui convite para contato': item.hasCallToAction,
      };
    }) : [];
    const nap = record(value.napConsistency) ?? {};
    return { facts: {
      'endereço principal do site': value.origin,
      'usa conexão segura': value.https,
      'nome da empresa encontrado nas páginas': nap.nameFound,
      'endereço encontrado nas páginas': nap.addressFound,
      'telefone encontrado nas páginas': nap.phoneFound,
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
  if (profile && website && nap) {
    result.push({
      label: 'Consistência entre Google e site',
      detail: `Nome no site: ${nap.nameFound === true ? 'encontrado' : nap.nameFound === false ? 'não encontrado' : 'não validado'}; endereço: ${nap.addressFound === true ? 'encontrado' : nap.addressFound === false ? 'não encontrado' : 'não validado'}; telefone: ${nap.phoneFound === true ? 'encontrado' : nap.phoneFound === false ? 'não encontrado' : 'não validado'}.`,
      evidenceIds: [profile.id, website.id],
    });
  }
  if (profile && instagram && profileValue && instagramValue) {
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
  return {
    evidence: evidence
      .filter((item) => item.source !== 'ai')
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
