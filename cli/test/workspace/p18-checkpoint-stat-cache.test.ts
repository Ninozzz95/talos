/*
 * P18 (owner 2026-09-26: the slow checkpoint, fixed before the next release). A turn in a plain folder of 6,000 files cost
 * 39 s because every capture read, hashed, rewrote and synced every file. The capture now keeps a stat index like git's:
 * an unchanged file reuses its blob WITHOUT being read; a racily-clean, resized or blob-less file is read again. Coverage
 * and restore are unchanged (the existing checkpoint suites), and a restore still checks every blob's sha256.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,rmSync,statSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {captureWorkspaceSnapshot,type StatRow} from '../../src/workspace/checkpoint.ts';
import {createCheckpointStore} from '../../src/workspace/checkpoint-store.ts';

const sha=(text:string)=>createHash('sha256').update(text).digest('hex');
function setup(){
  const home=mkdtempSync(join(tmpdir(),'p18-ckpt-'));const project=join(home,'project'),blobs=join(home,'state','blobs');
  mkdirSync(project,{recursive:true});mkdirSync(blobs,{recursive:true});
  writeFileSync(join(project,'a.txt'),'alpha\n');
  /* a blob with OTHER content already in the store: a row pointing at it can only end in the snapshot if the file was not read */
  writeFileSync(join(blobs,sha('decoy\n')),'decoy\n');
  return{home,project,blobs,done:()=>rmSync(home,{recursive:true,force:true})};
}
const rowFor=(file:string,ref:string,verifiedAtMs:number):StatRow=>{const s=statSync(file);return{size:s.size,mtimeMs:s.mtimeMs,ctimeMs:s.ctimeMs,ref,verifiedAtMs};};
async function refOf(project:string,blobs:string,previous:Map<string,StatRow>){
  const next=new Map<string,StatRow>();
  const snap=await captureWorkspaceSnapshot({projectRoot:project,blobRoot:blobs,statCache:{previous,next}});
  const entry=snap.entries['a.txt'] as any;return{ref:entry.ref as string,next};
}

test('P18: an unchanged file reuses its blob without being read',async()=>{
  const x=setup();
  try{
    const file=join(x.project,'a.txt');
    const {ref,next}=await refOf(x.project,x.blobs,new Map([['a.txt',rowFor(file,sha('decoy\n'),Date.now()+10_000_000)]]));
    assert.equal(ref,sha('decoy\n'),'the row was trusted: the file was not read');
    assert.equal(next.get('a.txt')?.ref,sha('decoy\n'));
  }finally{x.done();}
});

test('P18: a racily clean, resized or blob-less file is read again',async()=>{
  const x=setup();
  try{
    const file=join(x.project,'a.txt');const real=sha('alpha\n');
    /* changed within the racy margin of the capture that saw it */
    assert.equal((await refOf(x.project,x.blobs,new Map([['a.txt',rowFor(file,sha('decoy\n'),Date.now())]]))).ref,real);
    /* another size */
    const resized={...rowFor(file,sha('decoy\n'),Date.now()+10_000_000),size:999};
    assert.equal((await refOf(x.project,x.blobs,new Map([['a.txt',resized]]))).ref,real);
    /* the blob is no longer in the store */
    const gone=rowFor(file,sha('never stored\n'),Date.now()+10_000_000);
    assert.equal((await refOf(x.project,x.blobs,new Map([['a.txt',gone]]))).ref,real);
    assert.equal(readFileSync(join(x.blobs,real),'utf8'),'alpha\n','the blob read again is stored');
  }finally{x.done();}
});

test('P18: the store keeps the stat index across processes, and a changed file gets its new blob',async()=>{
  const x=setup();
  try{
    const store=()=>createCheckpointStore({rootDir:join(x.home,'state'),projectRoot:x.project});
    const first=await store().capture();
    const index=join(x.home,'state','workspaces');assert.ok(existsSync(index));
    const second=await store().capture();
    assert.deepEqual(second.entries,first.entries,'same content, same snapshot');
    writeFileSync(join(x.project,'a.txt'),'alpha changed\n');
    const third=await store().capture();
    assert.equal((third.entries['a.txt'] as any).ref,sha('alpha changed\n'));
  }finally{x.done();}
});
