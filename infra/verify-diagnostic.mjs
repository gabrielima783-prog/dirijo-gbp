import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AnalysisRepository } from '../dist/server/repository.js';
import { AuthStore } from '../dist/server/auth.js';
import { confirmedAbsence } from '../dist/core/channel-presence.js';
import { buildCompactDiagnostic } from '../dist/core/compact-diagnostic.js';
import { exportAnalysisPdf } from '../dist/server/pdf.js';

// Reuses collected evidence. No provider calls, regeneration or diagnostic edits.
const db = new DatabaseSync(process.env.DATABASE_FILE || '/app/data/dirijo-gbp.sqlite');
let temporary;
let renderer;
try {
  const row = db.prepare("SELECT id FROM analyses WHERE status='finalized' ORDER BY updated_at DESC LIMIT 1").get();
  if (!row) {
    console.log(JSON.stringify({event:'diagnostic_pdf_smoke_skipped',reason:'no_finalized_analysis'}));
  } else {
    const analysis = new AnalysisRepository(db).get(String(row.id));
    const model = buildCompactDiagnostic(analysis);
    if (model.pageCount !== model.editorialPages.length + 3 || model.pageCount < 4 || model.pageCount > 6) throw new Error('Invalid commercial page count');
    if (analysis.sourceStatuses.instagram.status === 'completed' && !model.coverage.some(item=>item.source==='Instagram')) throw new Error('Instagram coverage omitted');
    if (model.coverage.some(item=>item.source==='Instagram' && item.evidenceIds.length) && !model.editorialPages.some(page=>page.section.startsWith('Instagram'))) throw new Error('Instagram chapter omitted');
    if (confirmedAbsence(analysis.input.channelPresence?.google) && !analysis.input.mapsUrl && analysis.input.googleEligibility !== 'ineligible' && model.findings.some(item=>item.source==='Perfil no Google' && /encontrado/.test(item.title))) {
      if (!model.editorialPages[0]?.section.startsWith('Google') || !/Google/.test(model.headline)) throw new Error('Confirmed Google absence lost its main chapter');
      if (model.editorialPages.some(page=>page.section.startsWith('Instagram')) && model.pageCount !== 5) throw new Error('Google absence and Instagram must have five pages');
    }
    const instagramChapter = model.editorialPages.find(page=>page.section.startsWith('Instagram'));
    if (instagramChapter && (!instagramChapter.blocks?.some(block=>block.title.startsWith('Frequência')) || !instagramChapter.blocks.some(block=>block.title.includes('bio')) || !instagramChapter.blocks.some(block=>block.title.includes('ação')))) throw new Error('Instagram cadence, bio or CTA conclusion omitted');
    temporary = await mkdtemp(join(tmpdir(),'gbp-pdf-smoke-'));
    renderer = new AuthStore(db).renderer(analysis.id);
    const result = await exportAnalysisPdf({analysisId:analysis.id,outputPath:join(temporary,'smoke.pdf'),compact:true,baseUrl:'http://127.0.0.1:8787',sessionToken:renderer.token,expectedSlideCount:model.pageCount,timeoutMs:60000});
    console.log(JSON.stringify({event:'diagnostic_pdf_smoke_passed',pages:result.slideCount,bytes:result.bytes,reviewRequired:model.reviewRequired}));
  }
} finally {
  renderer?.revoke();
  if (temporary) await rm(temporary,{recursive:true,force:true});
  db.close();
}
