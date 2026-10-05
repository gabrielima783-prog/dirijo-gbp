import assert from 'node:assert/strict';
import test from 'node:test';
import { createDatabase } from '../src/server/db.js';
import { AnalysisRepository } from '../src/server/repository.js';

test('history is small and never loads full diagnostics or screenshots',()=>{
 const db=createDatabase({filename:':memory:'});const repository=new AnalysisRepository(db);
 const analysis=repository.create({mapsUrl:'https://maps.google.com/?cid=123',companyName:'Empresa histórica'},0.1,1);
 repository.setSource(analysis.id,'maps','completed');
 repository.addCost(analysis.id,'maps',0.03);
 repository.addCost(analysis.id,'ai',0.02);
 db.prepare('INSERT INTO assets(id,analysis_id,kind,path,mime_type,created_at) VALUES(?,?,?,?,?,?)').run('large-image',analysis.id,'screenshot','data:image/png;base64,'+'A'.repeat(1_000_000),'image/png',new Date().toISOString());
 repository.get=()=>{throw new Error('History must not read the complete diagnostic');};
 const result=repository.list();assert.equal(result.length,1);
 assert.equal(result[0]!.companyName,'Empresa histórica');assert.equal(result[0]!.actualCostUsd,0.05);
 assert.equal(result[0]!.sourceStatuses.maps.status,'completed');
 assert.equal(result[0]!.sourceStatuses.ai.status,'pending');
 for(const key of ['input','evidence','assets','findings','slides','costs'])assert.equal(key in result[0]!,false);
 assert.ok(JSON.stringify(result).length<1500);db.close();
});
