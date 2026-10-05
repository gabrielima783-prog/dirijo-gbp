import test from 'node:test';
import assert from 'node:assert/strict';
import { AnalysisService, OperationBusyError } from '../src/server/service.js';
import { AnalysisRepository } from '../src/server/repository.js';
import { createDatabase } from '../src/server/db.js';
test('heavy operations release their lock on failure and interrupted collections require manual retry', async () => {
 const db=createDatabase({filename:':memory:'});const repository=new AnalysisRepository(db);const service=new AnalysisService({repository});
 let finish!:()=>void; const running=service.withHeavyOperation(()=>new Promise<void>(resolve=>{finish=resolve;}));
 assert.throws(()=>service.ensureAvailable(),OperationBusyError);finish();await running;service.ensureAvailable();
 await assert.rejects(service.withHeavyOperation(async()=>{throw new Error('failure');}));service.ensureAvailable();
 const analysis=repository.create({companyName:'Clínica de teste',mapsUrl:'',instagramUrl:'https://www.instagram.com/clinica/'});
 repository.setStatus(analysis.id,'collecting');repository.setSource(analysis.id,'instagram','running');
 assert.equal(repository.recoverInterrupted(),1);assert.equal(repository.get(analysis.id)?.status,'failed');assert.equal(repository.get(analysis.id)?.sourceStatuses.instagram.status,'failed');
 assert.equal(repository.recoverInterrupted(),0);db.close();
});
