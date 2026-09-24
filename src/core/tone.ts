import type { FindingPriority } from '../shared/types.js';

export type SlideTone = 'neutral' | 'attention' | 'problem' | 'positive';

interface ToneFinding {
  evidenceIds: string[];
  category: string;
  priority: FindingPriority;
  observation: string;
  recommendedDirection: string;
  targetLayout?: string | undefined;
}

interface ToneSlide {
  layout: string;
  body: unknown;
  evidenceIds: string[];
}

const priorityWeight: Record<FindingPriority, number> = {
  critical: 0,
  important: 1,
  opportunity: 2,
  strength: 3,
};

const categoriesByLayout: Record<string, string[]> = {
  profile: ['profile', 'comparison'],
  reputation: ['reputation'],
  responses: ['reputation'],
  media: ['media'],
  website: ['website'],
  instagram: ['instagram'],
};

export function toneForPriority(priority: FindingPriority): SlideTone {
  if (priority === 'strength') return 'positive';
  if (priority === 'opportunity') return 'attention';
  return 'problem';
}

export function toneForSlide(slide: ToneSlide, findings: ToneFinding[]): SlideTone {
  if (['cover', 'summary', 'cta'].includes(slide.layout)) return 'neutral';
  if (slide.layout === 'priorities') return 'attention';

  const body = typeof slide.body === 'string' ? normalize(slide.body) : normalize(JSON.stringify(slide.body ?? ''));
  const exact = findings.filter((finding) => {
    const observation = normalize(finding.observation);
    const direction = normalize(finding.recommendedDirection);
    return (observation.length >= 18 && body.includes(observation)) || (direction.length >= 18 && body.includes(direction));
  });
  const targeted = findings.filter((finding) => finding.targetLayout === slide.layout);
  const allowedCategories = categoriesByLayout[slide.layout] ?? [];
  const linked = findings.filter((finding) =>
    allowedCategories.includes(finding.category)
    && finding.evidenceIds.some((id) => slide.evidenceIds.includes(id))
    && matchesLayoutMeaning(slide.layout, finding),
  );
  const candidates = exact.length ? exact : targeted.length ? targeted : linked;
  if (!candidates.length) return 'attention';
  const strongestSignal = [...candidates].sort((a, b) => priorityWeight[a.priority] - priorityWeight[b.priority])[0];
  return strongestSignal ? toneForPriority(strongestSignal.priority) : 'attention';
}

function matchesLayoutMeaning(layout: string, finding: ToneFinding): boolean {
  if (!['reputation', 'responses'].includes(layout)) return true;
  const aboutResponses = /respost(?:a|as|ar|ou|am|ida|idas)/iu.test(`${finding.observation} ${finding.recommendedDirection}`);
  return layout === 'responses' ? aboutResponses : !aboutResponses;
}

function normalize(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('pt-BR');
}
