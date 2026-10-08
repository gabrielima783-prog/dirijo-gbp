import assert from 'node:assert/strict';
import test from 'node:test';
import { DomainTransition, backgroundJobsInitiallyEnabled } from '../src/server/domain-transition.js';
test('candidate queues requests and activates only after the verified handover', async()=>{
 const transition = new DomainTransition(false);
 transition.beginProxy();
 assert.equal(transition.requestActivation(false, 1), false);
 let released=false;const request=transition.waitForHandover().then(()=>{released=true;});
 await Promise.resolve();assert.equal(released,false);assert.equal(transition.queuedRequests,1);
 assert.equal(transition.requestActivation(true, 0), false);
 transition.finishProxy();assert.equal(transition.requestActivation(true, 1), false);
 assert.equal(transition.requestActivation(true, 0), true);
 await request;assert.equal(released,true);assert.equal(transition.active,true);
 assert.equal(transition.requestActivation(true, 0), false);
});
test('candidate can resume the old backend when promotion is cancelled', async()=>{
 const transition=new DomainTransition(false);transition.requestActivation(false,0);
 const request=transition.waitForHandover();transition.resumeProxy();await request;
 assert.equal(transition.active,false);assert.equal(transition.draining,false);
});

import { createDatabase } from '../src/server/db.js';
import { createApp } from '../src/server/app.js';
import { AuthStore } from '../src/server/auth.js';
import { AnalysisRepository } from '../src/server/repository.js';
import { AnalysisService } from '../src/server/service.js';
import { loadConfig } from '../src/server/config.js';
test('candidate forwards authenticated requests only after validating the external origin',async()=>{
 const previous=process.env.PUBLIC_URL, previousAdditional=process.env.ADDITIONAL_PUBLIC_ORIGINS, previousFetch=globalThis.fetch;
 process.env.PUBLIC_URL='https://gbp.dirijobr.com';process.env.ADDITIONAL_PUBLIC_ORIGINS='https://gbp.viradadonutri.com.br';
 const db=createDatabase({filename:':memory:'});const repository=new AnalysisRepository(db), transition=new DomainTransition(false);
 const app=createApp({auth:new AuthStore(db,false),repository,service:new AnalysisService({repository}),config:loadConfig('/tmp/gbp-candidate-empty'),transition,sourceRunsRunning:()=>0,activeBackendUrl:'http://old-app:8787',activeBackendPublicUrl:'https://gbp.viradadonutri.com.br'});
 const requests:Request[]=[];
 globalThis.fetch=async input=>{const request=input as Request;requests.push(request);assert.equal(request.headers.get('origin'),'https://gbp.viradadonutri.com.br');assert.equal(request.headers.get('cookie'),'gbp_session=private-session');assert.deepEqual(await request.json(),{field:'value'});return new Response('response',{headers:{'set-cookie':'gbp_session=next; HttpOnly; Secure; SameSite=Lax'}});};
 try {
  const response=await app.request('https://gbp.dirijobr.com/api/test?x=1',{method:'POST',headers:{origin:'https://gbp.dirijobr.com',cookie:'gbp_session=private-session','content-type':'application/json'},body:JSON.stringify({field:'value'})});
  assert.equal(requests[0]!.url,'http://old-app:8787/api/test?x=1');assert.equal(transition.proxyInFlight,1);
  assert.equal(await response.text(),'response');assert.equal(transition.proxyInFlight,0);assert.match(response.headers.get('set-cookie')!,/HttpOnly/);
  assert.equal((await app.request('https://gbp.dirijobr.com/api/test',{method:'POST',headers:{origin:'https://evil.test'},body:'{}'})).status,403);assert.equal(requests.length,1);
  transition.requestActivation(false,0);
  const waiting=app.request('https://gbp.dirijobr.com/api/analyses');await new Promise(resolve=>setImmediate(resolve));assert.equal(transition.queuedRequests,1);
  assert.equal(transition.requestActivation(true,0),true);assert.equal((await waiting).status,401);assert.equal(requests.length,1);
 }finally{globalThis.fetch=previousFetch;db.close();if(previous===undefined)delete process.env.PUBLIC_URL;else process.env.PUBLIC_URL=previous;if(previousAdditional===undefined)delete process.env.ADDITIONAL_PUBLIC_ORIGINS;else process.env.ADDITIONAL_PUBLIC_ORIGINS=previousAdditional;}
});


import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
test('persistent marker restores the active owner after reboot',()=>{
 const folder=mkdtempSync(join(tmpdir(),'gbp-marker-'));const previousFlag=process.env.BACKGROUND_JOBS_ENABLED,previousMarker=process.env.BACKGROUND_JOBS_ENABLE_FILE;
 try {
  process.env.BACKGROUND_JOBS_ENABLED='false';process.env.BACKGROUND_JOBS_ENABLE_FILE=join(folder,'enabled');
  assert.equal(backgroundJobsInitiallyEnabled(),false);
  writeFileSync(process.env.BACKGROUND_JOBS_ENABLE_FILE,'enabled');assert.equal(backgroundJobsInitiallyEnabled(),true);
  assert.equal(new DomainTransition(backgroundJobsInitiallyEnabled()).active,true);
 }finally{rmSync(folder,{recursive:true,force:true});if(previousFlag===undefined)delete process.env.BACKGROUND_JOBS_ENABLED;else process.env.BACKGROUND_JOBS_ENABLED=previousFlag;if(previousMarker===undefined)delete process.env.BACKGROUND_JOBS_ENABLE_FILE;else process.env.BACKGROUND_JOBS_ENABLE_FILE=previousMarker;}
});
