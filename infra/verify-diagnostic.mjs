import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AnalysisRepository } from '../dist/server/repository.js';
import { AuthStore } from '../dist/server/auth.js';
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
    if (![4,5].includes(model.pageCount)) throw new Error('Invalid commercial page count');
    if (analysis.sourceStatuses.instagram.status === 'completed' && !model.coverage.some(item=>item.source==='Instagram')) throw new Error('Instagram coverage omitted');
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
