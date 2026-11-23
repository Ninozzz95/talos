/*
 * 14/10/2026, owner: «Sì: il secondo viene rifiutato con una frase chiara». Two TALOS on one conversation. The bugfixer measured
 * on the built CLI that a second process wrote into a conversation a live screen held (the kernel's lease was off in the CLI).
 * The kernel keeps ONE lease per archive per process (session-store.mjs `attivaAffittiArchivio`), so the other TALOS is a real
 * second process here: it takes the conversation's lease with the kernel's own module (fixtures/hold-session-lease.mjs) and keeps
 * it. While it lives, this TALOS is refused with the holder's sentence and SESSION_LEASED (exit 15) and nothing reaches the model;
 * once it dies, the conversation is taken over at once (its pid is gone: no 30-second wait) and the turn runs.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import test from 'node:test';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {dummyKey,hermetic,REPO_ROOT} from '../provider/first-run-fixture.ts';
import {exitCodeForEnvelope} from '../../src/errors.ts';
import {composeWithFake,runTurn,startScriptedProvider} from './r5a-r-fixture.ts';

const HOLDER=fileURLToPath(new URL('./fixtures/hold-session-lease.mjs',import.meta.url));

function holdInAnotherProcess(sessionsRoot:string,sessionId:string):Promise<{pid:number;stop():Promise<void>}>{
  const child=spawn(process.execPath,[HOLDER,REPO_ROOT,sessionsRoot,sessionId],{stdio:['ignore','pipe','pipe']});
  return new Promise((resolve,reject)=>{
    let out='';
    let exited=false;child.once('exit',()=>{exited=true;});
    /* stop twice is fine: once it has exited there is nothing to wait for */
    child.stdout.on('data',(chunk)=>{out+=chunk;const held=/held (\d+)/u.exec(out);if(held)resolve({pid:Number(held[1]),stop:()=>exited?Promise.resolve():new Promise<void>(done=>{child.once('exit',()=>done());child.kill();})});});
    child.once('exit',(code)=>reject(new Error(`the holder exited ${code}: ${out}`)));
  });
}

test('a conversation another TALOS holds is refused with who holds it; taken over at once when that one dies',{timeout:180_000},async()=>hermetic(async h=>{
  const key=dummyKey('deepseek');
  const fake=await startScriptedProvider({goodKey:key,respond:()=>({kind:'text' as const,text:'Done.'})});
  const first=await composeWithFake(h,fake.url,key);
  const {sessionId}=await runTurn(first,h,'hello from the first');
  await first.runtime.close?.();
  /* this process held the conversation since its first write: the kernel releases it 30 s after the last one, or at exit; released
     now, as the end of this process would, so the other TALOS can take it */
  const store:any=await import(pathToFileURL(path.join(REPO_ROOT,'harness-ui','src','session-store.mjs')).href);
  store.disattivaAffittiArchivio(h.paths.sessionsRoot);
  const holder=await holdInAnotherProcess(h.paths.sessionsRoot,sessionId);
  const second=await composeWithFake(h,fake.url,key);
  try{
    await second.runtime.restore?.();
    const before=fake.requests.length;
    await assert.rejects(second.runtime.resume(sessionId,'hello from the second'),(error:any)=>{
      assert.equal(error.code,'SESSION_LEASED');
      assert.match(String(error.message),/open in another TALOS process \(TALOS CLI \(the screen\), pid \d+/u);
      return true;
    });
    assert.equal(exitCodeForEnvelope({code:'SESSION_LEASED'}),15,'a stable exit code for -p');
    assert.equal(fake.requests.length,before,'nothing of the second reached the model');
    await holder.stop();
    const resumed=await runTurn(second,h,'hello again',{sessionId});
    assert.ok(resumed.raw.some((e:any)=>e?.type==='RunFinished'),'taken over at once: the holder is dead');
  }finally{await holder.stop().catch(()=>{});await second.runtime.close?.();await fake.close();}
}));
