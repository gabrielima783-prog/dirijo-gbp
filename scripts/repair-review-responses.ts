import { DatabaseSync, backup } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { AnalysisRepository } from '../src/server/repository.js';
import { sanitizeReview } from '../src/server/adapters/apify.js';
import { dedupeReviews, summarizeReviews } from '../src/server/service.js';
import { responseNarrative } from '../src/core/review-responses.js';
import { buildPresentation } from '../src/core/slides.js';
import type { AssessedEvidence, Finding } from '../src/core/types.js';

// Offline repair: only previously collected, sanitized datasets are used.
const apply = process.argv.includes('--apply');
const cacheDir = resolve('data/audits/review-responses-2026-10-02');
const databaseFile = resolve('data/dirijo-gbp.sqlite');
const db = new DatabaseSync(databaseFile, { readOnly: !apply });
const repo = new AnalysisRepository(db);
const timestamp = new Date().toISOString();
const repairId = timestamp.replace(/[:.]/g, '-');
const plans: Array<{ analysisId: string; company: string; before: unknown; after: unknown; updates: Array<{ id: string; value: unknown }>; findings?: Finding[]; slides?: ReturnType<typeof buildPresentation>['slides'] }> = [];
for (const file of readdirSync(cacheDir).filter(file => file.endsWith('.json'))) {
  const cache = JSON.parse(readFileSync(join(cacheDir, file), 'utf8'));
  const analysis = repo.get(cache.analysisId);
  if (!analysis) throw new Error(`Analysis missing: ${cache.analysisId}`);
  const evidence = analysis.evidence as AssessedEvidence[];
  const reviewEvidence = evidence.find(item => item.source === 'reviews');
  if (!reviewEvidence) continue;
  const old = reviewEvidence.value as Record<string, unknown>;
  const rawReviews = cache.sources.filter((source: any) => ['maps', 'reviews'].includes(source.source))
    .flatMap((source: any) => source.items.flatMap((item: any) => item.reviews ?? []));
  const reviews = dedupeReviews(rawReviews.map(sanitizeReview).filter(Boolean)).slice(0, 100);
  const summary = summarizeReviews(reviews, new Date(reviewEvidence.observedAt));
  const value = { ...old, ...summary, reviews, responseRepair: { repairedAt: timestamp, sourceRuns: cache.sources.filter((source: any) => ['maps', 'reviews'].includes(source.source)).map((source: any) => source.runId) } };
  reviewEvidence.value = value;
  const updates = [{ id: reviewEvidence.id, value }];
  const profile = evidence.find(item => item.source === 'maps' && item.category === 'profile');
  const rawProfile = cache.sources.find((source: any) => source.source === 'maps')?.items[0];
  if (profile && rawProfile) {
    profile.value = { ...(profile.value as Record<string, unknown>), recentReviews: (rawProfile.reviews ?? []).map(sanitizeReview).filter(Boolean) };
    updates.push({ id: profile.id, value: profile.value });
  }
  const competitorsEvidence = evidence.find(item => item.source === 'competitors');
  if (competitorsEvidence) {
    const competitorsValue = competitorsEvidence.value as Record<string, unknown>;
    const rawCompetitors = cache.sources.filter((source: any) => source.source === 'competitors').flatMap((source: any) => source.items);
    const competitors = (competitorsValue.competitors as Array<Record<string, unknown>> ?? []).map(competitor => {
      const raw = rawCompetitors.find((item: any) => item.title === competitor.title);
      if (!raw) return competitor;
      const sample = (raw.reviews ?? []).map(sanitizeReview).filter(Boolean);
      const metrics = summarizeReviews(sample);
      return { ...competitor, hasOwnerResponses: metrics.ownerResponseCount > 0 ? true : metrics.ownerResponseVerification === 'verified' ? false : undefined };
    });
    competitorsEvidence.value = { ...competitorsValue, competitors };
    updates.push({ id: competitorsEvidence.id, value: competitorsEvidence.value });
  }
  const changed = old.ownerResponseCount !== summary.ownerResponseCount || old.ownerResponseRate !== summary.ownerResponseRate;
  let findings: Finding[] | undefined;
  let slides: typeof analysis.slides | undefined;
  if (changed && analysis.slides.length) {
    const narrative = responseNarrative(value);
    findings = analysis.findings.map(finding => {
      if (finding.category !== 'reputation') return finding;
      const responsesFinding = /respost|respond|retorno p[uú]blico/iu.test(finding.observation);
      if (responsesFinding) return { ...finding, ...narrative, targetLayout: 'responses' as const, headline: narrative.headline };
      return { ...finding, targetLayout: 'reputation' as const,
        observation: reviews.length ? `Na amostra de ${summary.sampleSize} avaliações do Google, ${summary.positiveCount} são positivas e ${summary.criticalCount} têm nota de até três estrelas. ${summary.reviewsLast90Days} foram publicadas nos 90 dias anteriores à coleta.` : 'A coleta não trouxe uma amostra de avaliações. Isso não confirma ausência de avaliações ou de respostas no Google.',
        possibleImpact: 'Os relatos públicos ajudam quem pesquisa a empresa a avaliar a experiência de atendimento.',
        idealState: 'A empresa deve manter avaliações autênticas e acompanhar os relatos positivos e críticos.',
        recommendedDirection: 'Manter uma rotina de acompanhamento das avaliações e convites para que clientes relatem sua experiência real.',
        priority: summary.criticalCount ? 'opportunity' as const : 'strength' as const,
      };
    });
    const regenerated = buildPresentation({ analysisId: analysis.id, input: analysis.input, companyName: analysis.companyName, evidence, generatedAt: timestamp }, findings);
    slides = analysis.slides.map(slide => {
      if (!['responses', 'reputation', 'summary', 'priorities'].includes(slide.layout)) return slide;
      const replacement = regenerated.slides.find(item => item.layout === slide.layout)!;
      return { ...replacement, id: slide.id, position: slide.position, durationSeconds: slide.durationSeconds,
        title: slide.layout === 'reputation' ? 'Avaliações no Google: o que a amostra coletada mostra.' : replacement.title };
    });
  }
  plans.push({ analysisId: analysis.id, company: analysis.companyName ?? '', before: { sampleSize: old.sampleSize, count: old.ownerResponseCount, rate: old.ownerResponseRate }, after: { sampleSize: summary.sampleSize, count: summary.ownerResponseCount, rate: summary.ownerResponseRate, verification: summary.ownerResponseVerification }, updates, findings, slides });
}
if (apply) {
  mkdirSync(resolve('data/backups'), { recursive: true });
  const backupFile = resolve(`data/backups/before-review-response-repair-${repairId}.sqlite`);
  await backup(db, backupFile);
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const plan of plans) {
      const original = repo.get(plan.analysisId)!;
      db.prepare('INSERT INTO analysis_versions(id,analysis_id,kind,payload_json,created_at) VALUES (?,?,?,?,?)')
        .run(randomUUID(), plan.analysisId, 'finalized', JSON.stringify({ repair: 'before-review-responses', evidence: original.evidence, findings: original.findings, slides: original.slides }), timestamp);
      for (const update of plan.updates) db.prepare('UPDATE evidence SET value_json=? WHERE id=? AND analysis_id=?').run(JSON.stringify(update.value), update.id, plan.analysisId);
      for (const finding of plan.findings ?? []) db.prepare('UPDATE findings SET priority=?,observation=?,possible_impact=?,ideal_state=?,recommended_direction=? WHERE id=? AND analysis_id=?')
        .run(finding.priority, finding.observation, finding.possibleImpact, finding.idealState, finding.recommendedDirection, finding.id, plan.analysisId);
      for (const slide of plan.slides ?? []) db.prepare('UPDATE slides SET title=?,body=?,speaker_notes=?,evidence_ids_json=?,visual_asset_ids_json=? WHERE id=? AND analysis_id=?')
        .run(slide.title, slide.body, slide.speakerNotes, JSON.stringify(slide.evidenceIds), JSON.stringify(slide.visualAssetIds), slide.id, plan.analysisId);
      db.prepare('UPDATE analyses SET updated_at=? WHERE id=?').run(timestamp, plan.analysisId);
      const repaired = repo.get(plan.analysisId)!;
      db.prepare('INSERT INTO analysis_versions(id,analysis_id,kind,payload_json,created_at) VALUES (?,?,?,?,?)')
        .run(randomUUID(), plan.analysisId, 'finalized', JSON.stringify({ repair: 'after-review-responses', findings: repaired.findings, slides: repaired.slides }), timestamp);
    }
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  console.log(JSON.stringify({ backupFile }));
}
const report = { applied: apply, repairedAt: timestamp, analyses: plans.map(({ updates: _updates, findings, slides, ...plan }) => ({ ...plan, narrativeRepaired: Boolean(findings && slides) })) };
writeFileSync(resolve(`data/audits/review-response-repair-${apply ? 'applied' : 'preview'}.json`), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ applied: apply, evidenceAnalyses: plans.length, narrativeAnalyses: plans.filter(plan => plan.slides).length }));
db.close();
