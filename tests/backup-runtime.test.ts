import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

for (const mode of ['legacy','domain','mismatch']) {
 test(`backup usa imagem imutável do runtime ${mode} e recusa divergência`,()=>{
  const root=mkdtempSync(join(tmpdir(),'gbp-backup-runtime-'));
  try {
   const release='a'.repeat(40),container='b'.repeat(64),image=`sha256:${'c'.repeat(64)}`;
   const releaseDir=join(root,'releases',release),state=join(root,'state','production'),bin=join(root,'bin'),log=join(root,'docker-args');
   mkdirSync(releaseDir,{recursive:true});mkdirSync(state,{recursive:true});mkdirSync(bin);
   writeFileSync(join(releaseDir,'compose.production.yaml'),'services: {}');symlinkSync(releaseDir,join(state,'current'));
   if(mode!=='legacy')writeFileSync(join(state,'domain-migration-active.json'),JSON.stringify({candidate_id:container,new_release:mode==='mismatch'?'d'.repeat(40):release}));
   writeFileSync(join(bin,'docker'),`#!/bin/bash\nif [ "$1" = inspect ] || [ "$1" = image ]; then echo '${image}'; else printf '%s\\n' "$@" > '${log}'; fi\n`,{mode:0o755});
   const result=spawnSync('bash',[resolve('infra/backup.sh')],{env:{...process.env,DIRIJO_GBP_ROOT:root,PATH:`${bin}:${process.env.PATH}`},encoding:'utf8'});
   if(mode==='mismatch'){assert.notEqual(result.status,0);assert.match(result.stderr,/disagree/);}
   else{assert.equal(result.status,0,result.stderr);assert.ok(readFileSync(log,'utf8').split('\n').includes(image));assert.doesNotMatch(readFileSync(log,'utf8'),/dirijo-gbp:/);}
  } finally{rmSync(root,{recursive:true,force:true});}
 });
}
