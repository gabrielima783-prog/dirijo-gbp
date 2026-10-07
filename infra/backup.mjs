import { DatabaseSync, backup } from 'node:sqlite';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { readFile, writeFile, mkdir, mkdtemp, cp, rm, readdir, stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
const config=JSON.parse(await readFile('/run/secrets/r2-backup.json','utf8'));
const encryptionKey=Buffer.from(config.backupEncryptionKey,'hex');
if(encryptionKey.length!==32) throw new Error('backupEncryptionKey must contain 32 bytes');
if(process.argv[2]==='decrypt') {
  const [input,output]=process.argv.slice(3);
  if(!input||!output) throw new Error('decrypt requires input and output paths');
  const f=await import('node:fs/promises').then(m=>m.open(input,'r'));
  const header=Buffer.alloc(28); await f.read(header,0,28,0); await f.close();
  const decipher=createDecipheriv('aes-256-gcm',encryptionKey,header.subarray(0,12));
  decipher.setAuthTag(header.subarray(12));
  await pipeline(createReadStream(input,{start:28}),decipher,createWriteStream(output,{mode:0o600}));
  process.exit(0);
}
async function upload(path,key) {
  const bytes=(await stat(path)).size;
  const partSize=50*1024*1024;
  const request=async(action,options={},parameters={})=>{
    const url=new URL(`/backups/${key}`,config.endpoint);
    if(action)url.searchParams.set('action',action);
    for(const [name,value] of Object.entries(parameters))url.searchParams.set(name,String(value));
    const response=await fetch(url,{...options,headers:{authorization:`Bearer ${config.token}`,...options.headers},signal:AbortSignal.timeout(300000)});
    if(!response.ok)throw new Error(`R2 backup upload failed (${response.status})`);
    return response.json();
  };
  if(bytes<=partSize) {
    const result=await request('',{method:'PUT',headers:{'content-type':'application/octet-stream','content-length':String(bytes)},body:createReadStream(path),duplex:'half'});
    if(result.bytes!==bytes)throw new Error('R2 backup size mismatch');
    return;
  }
  const {uploadId}=await request('create',{method:'POST'});
  try {
    const parts=[];
    for(let start=0,partNumber=1;start<bytes;start+=partSize,partNumber++) {
      const end=Math.min(start+partSize,bytes)-1;
      parts.push(await request('part',{method:'PUT',headers:{'content-length':String(end-start+1)},body:createReadStream(path,{start,end}),duplex:'half'},{uploadId,partNumber}));
    }
    const result=await request('complete',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({parts,bytes})},{uploadId});
    if(result.bytes!==bytes)throw new Error('R2 backup size mismatch');
  } catch(error) {
    await request('abort',{method:'DELETE'},{uploadId}).catch(()=>{});
    throw error;
  }
}
await mkdir('/backups',{recursive:true});
const temporary=await mkdtemp('/backups/.snapshot-');
try {
  const snapshot=join(temporary,'data'); await mkdir(snapshot);
  const database=new DatabaseSync('/app/data/dirijo-gbp.sqlite',{readOnly:true});
  await backup(database,join(snapshot,'dirijo-gbp.sqlite')); database.close();
  for(const entry of await readdir('/app/data'))if(!entry.startsWith('dirijo-gbp.sqlite'))await cp(join('/app/data',entry),join(snapshot,entry),{recursive:true});
  const check=new DatabaseSync(join(snapshot,'dirijo-gbp.sqlite'),{readOnly:true});
  if(check.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw new Error('Snapshot integrity failed');check.close();
  const archive=join(temporary,'snapshot.tar.gz'); execFileSync('tar',['-czf',archive,'-C',temporary,'data']);
  const iv=randomBytes(12), cipher=createCipheriv('aes-256-gcm',encryptionKey,iv);
  const filename=`dirijo-gbp-${new Date().toISOString().replace(/[:.]/g,'-')}.tar.gz.enc`;
  const output=join('/backups',filename);
  await writeFile(output,Buffer.concat([iv,Buffer.alloc(16)]),{mode:0o600});
  await pipeline(createReadStream(archive),cipher,createWriteStream(output,{flags:'a',mode:0o600}));
  const handle=await import('node:fs/promises').then(m=>m.open(output,'r+'));await handle.write(cipher.getAuthTag(),0,16,12);await handle.close();
  await upload(output,filename);
  const old=(await readdir('/backups')).filter(n=>n.startsWith('dirijo-gbp-')&&n.endsWith('.enc')).sort().reverse().slice(7);
  for(const name of old)await rm(join('/backups',name));
  console.log(`backup_ok:${filename}`);
} finally { await rm(temporary,{recursive:true,force:true}); }
