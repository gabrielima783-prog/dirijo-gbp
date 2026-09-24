export type AnalysisStatus = "draft" | "collecting" | "review" | "finalized" | "failed";
export type SourceName = "maps" | "reviews" | "competitors" | "website" | "pagespeed" | "instagram" | "operator" | "ai";
export type SourceStatusValue = "pending" | "running" | "completed" | "failed" | "skipped";
export type FindingPriority = "critical" | "important" | "opportunity" | "strength";

export interface InstagramChecklist {
  bio?: string | undefined;
  positioning?: string | undefined;
  services?: string | undefined;
  recentContent?: string | undefined;
  socialProof?: string | undefined;
  callToAction?: string | undefined;
  bioLink?: string | undefined;
  strengths?: string | undefined;
  opportunities?: string | undefined;
}

export interface AnalysisInput {
  mapsUrl: string;
  companyName?: string | undefined;
  websiteUrl?: string | undefined;
  instagramUrl?: string | undefined;
  contactName?: string | undefined;
  companyLogo?: string | undefined;
  instagramChecklist?: InstagramChecklist | undefined;
  instagramScreenshots?: string[] | undefined;
}

export interface SourceStatus {
  status: SourceStatusValue;
  error?: string | undefined;
  updatedAt: string;
}

export interface Evidence {
  id: string;
  analysisId: string;
  source: SourceName;
  title: string;
  value: unknown;
  sourceUrl?: string | undefined;
  observedAt: string;
  screenshotPath?: string | undefined;
  confidence: number;
  category?: string | undefined;
  assessment?: string | undefined;
  impact?: string | undefined;
  recommendation?: string | undefined;
}

export interface Finding {
  id: string;
  analysisId: string;
  evidenceIds: string[];
  category: string;
  priority: FindingPriority;
  observation: string;
  possibleImpact: string;
  idealState: string;
  recommendedDirection: string;
  approved: boolean;
  position: number;
  /** Usado durante a geração para montar o slide localmente. Não precisa ser persistido. */
  headline?: string | undefined;
  /** Canal visual ao qual o achado pertence durante a geração. */
  targetLayout?: SlideLayout | undefined;
}

export type SlideLayout = "cover" | "summary" | "profile" | "reputation" | "responses" | "media" | "website" | "instagram" | "priorities" | "cta";

export interface SlideSpec {
  id: string;
  analysisId: string;
  layout: SlideLayout;
  title: string;
  body: string;
  evidenceIds: string[];
  visualAssetIds: string[];
  speakerNotes: string;
  durationSeconds: number;
  approved: boolean;
  position: number;
}

export interface Asset {
  id: string;
  analysisId: string;
  kind: "logo" | "screenshot" | "photo" | "document";
  path: string;
  mimeType: string;
  originalName?: string | undefined;
  createdAt: string;
}

export interface CostEntry {
  id: string;
  analysisId: string;
  source: SourceName;
  amountUsd: number;
  units?: number | undefined;
  metadata?: Record<string, unknown> | undefined;
  createdAt: string;
}

export interface Analysis {
  id: string;
  status: AnalysisStatus;
  input: AnalysisInput;
  companyName?: string | undefined;
  estimatedCostUsd: number;
  actualCostUsd: number;
  costLimitUsd: number;
  sourceStatuses: Record<SourceName, SourceStatus>;
  evidence: Evidence[];
  findings: Finding[];
  slides: SlideSpec[];
  assets: Asset[];
  costs: CostEntry[];
  createdAt: string;
  updatedAt: string;
  finalizedAt?: string | undefined;
}

export interface PublicReview {
  rating?: number | undefined;
  text?: string | undefined;
  publishedAt?: string | undefined;
  responseText?: string | undefined;
  responseAt?: string | undefined;
}

export interface PlaceSnapshot {
  title: string;
  category?: string | undefined;
  categories: string[];
  address?: string | undefined;
  city?: string | undefined;
  phone?: string | undefined;
  website?: string | undefined;
  description?: string | undefined;
  openingHours?: unknown | undefined;
  totalScore?: number | undefined;
  reviewsCount?: number | undefined;
  reviewsDistribution?: unknown | undefined;
  reviews: PublicReview[];
  imageUrls: string[];
  ownerUpdates?: unknown[] | undefined;
  questionsAndAnswers?: unknown[] | undefined;
  sourceUrl: string;
  rawSafe: Record<string, unknown>;
}

export interface InstagramPostSnapshot {
  url: string;
  caption?: string | undefined;
  publishedAt?: string | undefined;
  format?: "imagem" | "vídeo" | "carrossel" | undefined;
  likesCount?: number | undefined;
  commentsCount?: number | undefined;
  imageUrl?: string | undefined;
  pinned?: boolean | undefined;
}

export interface InstagramSnapshot {
  username: string;
  fullName?: string | undefined;
  biography?: string | undefined;
  externalUrl?: string | undefined;
  category?: string | undefined;
  followersCount?: number | undefined;
  followingCount?: number | undefined;
  postsCount?: number | undefined;
  verified: boolean;
  businessAccount: boolean;
  privateAccount: boolean;
  latestPosts: InstagramPostSnapshot[];
  signals: {
    sampleSize: number;
    postsLast30Days: number;
    postsLast90Days: number;
    daysSinceLastPost?: number | undefined;
    reelsInSample: number;
    carouselsInSample: number;
    postsWithCallToAction: number;
    postsWithProofSignals: number;
  };
}

export interface CollectionProgress {
  analysisId: string;
  status: AnalysisStatus;
  sourceStatuses: Record<SourceName, SourceStatus>;
  actualCostUsd: number;
}

export interface CostEstimate {
  currency: "USD";
  totalUsd: number;
  capUsd: number;
  breakdown: Partial<Record<SourceName, number>>;
  requiresConfirmation: boolean;
}
