import type { AnalysisInput, Evidence, Finding, SlideSpec } from '../shared/types.js';

export * from '../shared/types.js';

export type EvidenceCategory =
  | 'profile'
  | 'reputation'
  | 'media'
  | 'comparison'
  | 'website'
  | 'instagram'
  | 'general';

export interface EvidenceAssessment {
  category?: EvidenceCategory;
  assessment?: 'positive' | 'negative' | 'neutral' | 'unknown';
  impact?: 'high' | 'medium' | 'low';
  recommendation?: string;
}

export type AssessedEvidence = Evidence & EvidenceAssessment;

export interface PresentationSpec {
  analysisId: string;
  companyName: string;
  generatedAt: string;
  slides: SlideSpec[];
  totalDurationSeconds: number;
  brand: {
    name: 'Dirijo';
    ink: '#091016';
    system: '#23C5C9';
    drive: '#FFB52B';
    stone: '#F1F0E9';
    headingFont: 'Manrope';
    bodyFont: 'Inter';
  };
}

export interface DiagnosticResult {
  findings: Finding[];
  presentation: PresentationSpec;
}

export interface DiagnosticContext {
  analysisId: string;
  input: AnalysisInput;
  companyName?: string;
  evidence: AssessedEvidence[];
  generatedAt?: string;
}
