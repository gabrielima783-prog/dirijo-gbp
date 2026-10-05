import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertResponseFacts } from '../src/core/review-responses.js';

const report = JSON.parse(readFileSync('data/audits/review-response-repair-applied.json', 'utf8'));
const exportPdfs = process.argv.includes('--pdf');
const results = [];
for (const item of report.analyses) {
  const response = await fetch(`http://127.0.0.1:8787/api/analyses/${item.analysisId}`);
  assert.equal(response.status, 200);
  const analysis = await response.json();
  const value = analysis.evidence.find((e: any) => e.source === 'reviews').value;
  assert.equal(value.ownerResponseCount, item.after.count);
  assert.equal(value.ownerResponseRate, item.after.rate);
  assert.equal(value.ownerResponseVerification, item.after.verification);
  for (const slide of analysis.slides) assertResponseFacts(`${slide.title}. ${slide.body}. ${slide.speakerNotes}`, value);
  const exports = [];
  if (exportPdfs && item.narrativeRepaired) {
    for (const format of ['mobile', 'desktop']) {
      const file = resolve(`data/exports/${item.analysisId}-${format}.pdf`);
      if (!existsSync(file) && format === 'desktop') continue;
      const backupDir = resolve('data/backups/pdfs-before-review-response-repair');
      mkdirSync(backupDir, { recursive: true });
      const backupFile = `${backupDir}/${item.analysisId}-${format}.pdf`;
      if (existsSync(file) && !existsSync(backupFile)) copyFileSync(file, backupFile);
      const pdf = await fetch(`http://127.0.0.1:8787/api/analyses/${item.analysisId}/pdf?format=${format}`);
      assert.equal(pdf.status, 200, `PDF export failed: ${item.company} ${format}: ${pdf.status}`);
      const bytes = Buffer.from(await pdf.arrayBuffer());
      assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
      assert.ok(bytes.length > 10000);
      exports.push({ format, bytes: bytes.length });
    }
  }
  results.push({ company: item.company, count: value.ownerResponseCount, sample: value.sampleSize, verification: value.ownerResponseVerification, exports });
  console.log(JSON.stringify(results.at(-1)));
}
writeFileSync('data/audits/review-response-repair-verification.json', JSON.stringify({ verifiedAt: new Date().toISOString(), results }, null, 2));
