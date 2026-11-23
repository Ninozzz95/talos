/*
 * R5a lane R → G02: the retry contract the CLI relies on, now the UNIFIED kernel's (desktop agreement 30/09, lane R
 * G02-10a `918371b88`). The owner's R5a amendment (`retryAfterMaxMs`, `onRetryWait`, `retryAfterMsFn`) is gone; in its place:
 *   1. the provider's requested wait is honoured (`retry-after-ms` first, then RFC 9110 `Retry-After`,
 *      provider-retry.mjs `leggiAttesaRichiestaDalFornitore`), never shorter than the kernel's backoff;
 *   2. the host's optional cap `attesaRitentaMassimaMs` (the CLI passes 60 s, Q-R5-6): a longer requested wait ends the
 *      retries at once (pi-mono provider-retry.ts `validateServerRetryDelayMs`), with the status and the wait on the error;
 *   3. each wait is reported before it starts (`onRitenta`; through talosLavora, `onGiro` `{tipo:'provider-retry'}`);
 *   4. 401 and 403 are never retried, and keep their status.
 * The 8,000-character cut of R5a (point 4 of the old amendment) is group B: the unified kernel keeps command output instead.
 * The kernel is imported directly; every fetch is a fake, every wait is injected or a few milliseconds.
 */
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import test from 'node:test';
import {REPO_ROOT} from '../provider/first-run-fixture.ts';

const kernel:any=await import(pathToFileURL(path.join(REPO_ROOT,'harness-ui','src','kernel','talosHarness.mjs')).href);

type Reply={status:number;headers?:Record<string,string>};
function network(...replies:Reply[]){
  const calls:number[]=[];
  return{calls,fetch:async()=>{
    const reply=replies[Math.min(calls.length,replies.length-1)]!;calls.push(reply.status);
    const headers=new Headers(reply.headers??{});
    if(reply.status===200)return{ok:true,status:200,headers,json:async()=>({choices:[{message:{role:'assistant',content:'done'}}]}),text:async()=>''};
    return{ok:false,status:reply.status,headers,json:async()=>({}),text:async()=>`fake ${reply.status}`};
  }};
}
const base={modello:'x',chiave:'y',messaggi:[],attrezzi:[],caso:()=>0};
const waitsOf=(reported:any[])=>reported.filter(r=>r.fase==='attesa').map(r=>[r.tentativo,r.tentativiMassimi,r.httpStatus,r.attesaMs]);

test('G02-A1: the provider wait is honoured, retry-after-ms first, the backoff when it says nothing; each wait reported first',async()=>{
  const net=network({status:429,headers:{'retry-after':'7'}},{status:503,headers:{'retry-after-ms':'1500','retry-after':'9'}},{status:500},{status:200});
  const waits:number[]=[];const reported:any[]=[];
  const result=await kernel.chiamaConRitenta({...base,fetchDiRete:net.fetch,dormi:async(ms:number)=>{assert.equal(reported.filter(r=>r.fase==='attesa').length,waits.length+1,'reported before the wait');waits.push(ms);},attesaRitentaMassimaMs:60_000,onRitenta:(info:any)=>reported.push(info)});
  assert.equal(result.tentativi,4);
  assert.deepEqual(waits,[7000,1500,2000]);
  assert.deepEqual(waitsOf(reported),[[2,11,429,7000],[3,11,503,1500],[4,11,500,2000]]);
  assert.equal(reported.at(-1)?.fase,'fine','the kernel closes the report');
});

test('G02-A2: a requested wait above the cap ends the retries at once, with the status and the wait on the error',async()=>{
  const net=network({status:429,headers:{'retry-after':'120'}},{status:200});
  const waits:number[]=[];const reported:any[]=[];
  await assert.rejects(kernel.chiamaConRitenta({...base,fetchDiRete:net.fetch,dormi:async(ms:number)=>{waits.push(ms);},attesaRitentaMassimaMs:60_000,onRitenta:(info:any)=>reported.push(info)}),(error:any)=>{
    assert.equal(error.stato,429);assert.equal(error.retryAfterMs,120_000);return true;
  });
  assert.deepEqual(net.calls,[429],'one request: waiting two minutes inside a turn is not a retry');
  assert.deepEqual(waits,[]);assert.deepEqual(waitsOf(reported),[]);
});

test('G02-A2: without the cap (the desktop) the same two minutes are waited; the cap is the CLI\'s choice',async()=>{
  const net=network({status:429,headers:{'retry-after':'120'}},{status:200});const waits:number[]=[];
  await kernel.chiamaConRitenta({...base,fetchDiRete:net.fetch,dormi:async(ms:number)=>{waits.push(ms);}});
  assert.deepEqual(waits,[120_000]);
  await assert.rejects(kernel.chiamaConRitenta({...base,fetchDiRete:net.fetch,attesaRitentaMassimaMs:-1}),{code:'RETRY_CAP_INVALID'});
});

test('G02-A1: Retry-After 0 or a date in the past is not "retry at once": the kernel backoff applies',async()=>{
  const past=new Date(Date.now()-60_000).toUTCString();
  const net=network({status:429,headers:{'retry-after':'0'}},{status:429,headers:{'retry-after':past}},{status:200});
  const waits:number[]=[];
  await kernel.chiamaConRitenta({...base,fetchDiRete:net.fetch,dormi:async(ms:number)=>{waits.push(ms);},attesaRitentaMassimaMs:60_000});
  assert.deepEqual(waits,[500,1000]);
});

test('G02-A4: a 401 and a 403 are never retried, and the error that ends the call keeps the status',async()=>{
  for(const status of [401,403]){
    const net=network({status},{status:200});const reported:any[]=[];
    await assert.rejects(kernel.chiamaConRitenta({...base,fetchDiRete:net.fetch,dormi:async()=>{},attesaRitentaMassimaMs:60_000,onRitenta:(info:any)=>reported.push(info)}),(error:any)=>error.stato===status);
    assert.deepEqual(net.calls,[status]);assert.deepEqual(waitsOf(reported),[]);
  }
});

test('G02-A3: a report listener that throws does not change the retry',async()=>{
  const net=network({status:429},{status:200});
  const result=await kernel.chiamaConRitenta({...base,fetchDiRete:net.fetch,dormi:async()=>{},onRitenta:()=>{throw new Error('listener failed');}});
  assert.equal(result.tentativi,2);
});

async function runOnce(extra:Record<string,unknown>,replies:Reply[]){
  const cartella=mkdtempSync(path.join(tmpdir(),'g02-a-kernel-'));
  const giri:any[]=[];let requests=0;
  try{
    await kernel.talosLavora({cartella,task:{consegna:'say done'},modello:'x',chiave:'y',onGiro:(evento:any)=>giri.push(evento),...extra,
      fetchDiRete:async()=>{
        const reply=replies[Math.min(requests++,replies.length-1)]!;
        if(reply.status!==200)return{ok:false,status:reply.status,headers:new Headers(reply.headers??{}),text:async()=>'slow down'};
        return{ok:true,status:200,json:async()=>({choices:[{message:{role:'assistant',content:'done'}}]}),text:async()=>''};
      }});
    return{giri:giri.filter(e=>e?.tipo==='provider-retry'),requests,error:null as any};
  }catch(error){return{giri:giri.filter(e=>e?.tipo==='provider-retry'),requests,error};}
  finally{rmSync(cartella,{recursive:true,force:true});}
}

test('G02-A3 through talosLavora: each wait reaches onGiro as provider-retry, and the cap reaches the model call',async()=>{
  const ok=await runOnce({attesaRitentaMassimaMs:60_000},[{status:429,headers:{'retry-after-ms':'5'}},{status:200}]);
  assert.equal(ok.error,null);
  const waits=ok.giri.filter(e=>e.fase==='attesa');
  assert.deepEqual(waits.map(e=>[e.giro,e.tentativo,e.tentativiMassimi,e.httpStatus]),[[0,2,11,429]]);
  assert.ok(waits[0].attesaMs>=500&&waits[0].attesaMs<=750,`the backoff (500 ms + up to 50 % jitter) beats the 5 ms asked for: ${waits[0].attesaMs}`);
  const capped=await runOnce({attesaRitentaMassimaMs:60_000},[{status:429,headers:{'retry-after':'120'}}]);
  assert.equal(capped.requests,1);assert.equal(capped.error?.retryAfterMs,120_000);assert.equal(capped.error?.stato,429);
});
