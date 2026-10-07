import {test} from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore Worker source is intentionally runtime JavaScript.
import worker from '../infra/backup-worker/index.js';

test('backup Worker rejects requests without its private token', async()=>{
  const response=await worker.fetch(new Request('https://example.test/backups/test.enc'),{BACKUP_TOKEN:'test-token'});
  assert.equal(response.status,401);
});
test('multipart backup assembles uploaded parts and validates the final byte count',async()=>{
  const recorded:any[]=[];
  const upload={uploadId:'upload-test',uploadPart:async(n:number,_body:unknown)=>({partNumber:n,etag:`part-${n}`}),complete:async(parts:unknown)=>{recorded.push(parts);return {size:6};},abort:async()=>{}};
  const env={BACKUP_TOKEN:'test-token',BACKUPS:{createMultipartUpload:async()=>upload,resumeMultipartUpload:()=>upload}};
  const request=(action:string,method:string,body?:string,extra='')=>new Request(`https://example.test/backups/test.enc?action=${action}&uploadId=upload-test${extra}`,{method,headers:{authorization:'Bearer test-token','content-length':String(body?.length||0)},body});
  const created=await worker.fetch(request('create','POST'),env);
  assert.deepEqual(await created.json(),{uploadId:'upload-test'});
  const part=await worker.fetch(request('part','PUT','abcdef','&partNumber=1'),env);
  const parts=[await part.json()];
  const complete=await worker.fetch(request('complete','POST',JSON.stringify({parts,bytes:6})),env);
  assert.deepEqual(await complete.json(),{stored:true,bytes:6});
  assert.deepEqual(recorded,[parts]);
  const mismatch=await worker.fetch(request('complete','POST',JSON.stringify({parts,bytes:7})),env);
  assert.equal(mismatch.status,500);
});
test('multipart backup refuses oversized parts before reading their bodies',async()=>{
  let read=false;
  const env={BACKUP_TOKEN:'test-token',BACKUPS:{resumeMultipartUpload:()=>({uploadPart:()=>{read=true;}})}};
  const response=await worker.fetch(new Request('https://example.test/backups/test.enc?action=part&uploadId=test&partNumber=1',{method:'PUT',headers:{authorization:'Bearer test-token','content-length':String(51*1024*1024)},body:'a'}),env);
  assert.equal(response.status,400);assert.equal(read,false);
});
