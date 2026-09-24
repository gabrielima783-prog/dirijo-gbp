export type AnalysisStatus = 'draft' | 'collecting' | 'review' | 'finalized' | 'failed';
export type SourceKey = 'maps' | 'reviews' | 'competitors' | 'website' | 'pagespeed' | 'instagram' | 'operator' | 'ai';
export type SourceStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
export type FindingPriority = 'critical' | 'important' | 'opportunity' | 'strength';

export interface InstagramChecklist {
  bio?: string;
  positioning?: string;
  services?: string;
  recentContent?: string;
  socialProof?: string;
  callToAction?: string;
  bioLink?: string;
  strengths?: string;
  opportunities?: string;
}

export interface AnalysisInput {
  mapsUrl: string;
  websiteUrl?: string;
  instagramUrl?: string;
  contactName?: string;
  companyLogo?: string;
  instagramChecklist?: InstagramChecklist;
  instagramScreenshots?: string[];
}

export interface Evidence {
  id: string;
  source: string;
  title: string;
  value: unknown;
  sourceUrl?: string;
  observedAt: string;
  screenshotPath?: string;
  confidence?: number;
}

export interface Finding {
  id: string;
  evidenceIds: string[];
  category: string;
  priority: FindingPriority;
  observation: string;
  possibleImpact: string;
  idealState: string;
  recommendedDirection: string;
  approved: boolean;
  headline?: string;
  targetLayout?: string;
}

export interface SlideSpec {
  id: string;
  layout: string;
  title: string;
  body: unknown;
  evidenceIds: string[];
  visualAssetIds: string[];
  speakerNotes: string;
  durationSeconds: number;
  approved: boolean;
}

export interface Analysis {
  id: string;
  status: AnalysisStatus;
  input: AnalysisInput;
  companyName?: string;
  createdAt: string;
  updatedAt: string;
  estimatedCostUsd?: number;
  actualCostUsd?: number;
  sourceStatuses: Record<SourceKey, { status: SourceStatus; error?: string; updatedAt?: string }>;
  evidence: Evidence[];
  findings: Finding[];
  slides: SlideSpec[];
  assets?: Array<{ id: string; url?: string; path?: string; type?: string }>;
}

export type SettingsProvider = 'apify' | 'openai' | 'pagespeed';

export interface PublicSettings {
  apify: { configured: boolean; maskedValue?: string; source: 'painel' | 'ambiente' | 'ausente'; actorId: string; instagramActorId: string };
  openai: { configured: boolean; maskedValue?: string; source: 'painel' | 'ambiente' | 'ausente'; model: string };
  pageSpeed: { configured: boolean; maskedValue?: string; source: 'painel' | 'ambiente' | 'ausente' };
  storage: { encrypted: true; location: string };
}

export interface SettingsUpdate {
  apifyToken?: string | null;
  openaiApiKey?: string | null;
  pageSpeedApiKey?: string | null;
  openaiModel?: string;
  apifyActorId?: string;
  apifyInstagramActorId?: string;
}

export const sourceLabels: Record<SourceKey, string> = {
  maps: 'Perfil do Google',
  reviews: 'Avaliações',
  competitors: 'Cenário local',
  website: 'Site',
  pagespeed: 'Experiência mobile',
  instagram: 'Instagram público',
  operator: 'Revisão do operador',
  ai: 'Síntese estratégica',
};
