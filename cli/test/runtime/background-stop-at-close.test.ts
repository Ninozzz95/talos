/*
 * Acceptance s68 (b), 14/10/2026, on the built CLI: a command still in the background (a464f3336) when the person pressed
 * Ctrl+C Ctrl+C — the screen left, every awaited clean-up ran, and the command's process and pipes held TALOS until the exit
 * backstop cut it (`held {"TTYWrap":2,"PipeWrap":3,"ProcessWrap":1}`). `talos -p` stops what it left in the background
 * (F-ENG-2, headless/background.ts); the screen's exit stopped nothing. Codex terminates its background terminals at Shutdown,
 * Hermes kills a session's processes at agent close (the sources of F-ENG-2).
 * The runtime's close (not a replacement's) stops the background commands of every session in memory, bounded, and says which.
 * Fake registry: no kernel, no process.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createSessionFacade} from '../../src/runtime/session-facade.ts';

function registryWith(rows:Record<string,any[]>,exitAfter:Record<string,number>){
  const calls:string[]=[];const asks=new Map<string,number>();let closedContext=0;
  const registry:any={avviaLibero(){return{sessionId:'s'};},iscriviti(){return()=>{};},
    elenca:()=>Object.keys(rows).map(sessionId=>({sessionId})),
    elencaProcessi:(id:string)=>({ok:true,registrato:true,processi:rows[id]??[]}),
    fermaComando(id:string,toolCallId:string){calls.push(`${id}/${toolCallId}`);const n=(asks.get(toolCallId)??0)+1;asks.set(toolCallId,n);
      const limit=exitAfter[toolCallId];if(limit===undefined)return 'non-in-corso';return n>limit?'non-in-corso':'fermato';},
    async chiudiContesto(){closedContext+=1;}};
  return{registry,calls,closed:()=>closedContext};
}
const row=(toolCallId:string,inSfondo:boolean)=>({toolCallId,attrezzo:'shell',comando:`node ${toolCallId}`,inSfondo,fileSfondo:inSfondo?`C:/o/${toolCallId}.log`:null});
function captureStderr(t:import('node:test').TestContext){
  const written:string[]=[];const original=process.stderr.write.bind(process.stderr);
  (process.stderr as any).write=(chunk:unknown,...rest:unknown[])=>{written.push(String(chunk));return true;};
  t.after(()=>{(process.stderr as any).write=original;});
  return written;
}

test('the runtime\'s close stops the background commands of every session in memory, and says which',async t=>{
  const said=captureStderr(t);
  const {registry,calls,closed}=registryWith({s:[row('a',true),row('b',false)],child:[row('c',true)]},{a:3,c:3});
  const runtime=createSessionFacade(registry,{model:'m'});
  await runtime.close!();
  assert.ok(calls.includes('s/a')&&calls.includes('child/c'),`every live background row was stopped: ${calls.join(', ')}`);
  assert.ok(!calls.some(call=>call.endsWith('/b')),'a row that is not in the background is left alone');
  assert.equal(closed(),1,'and the context is closed after');
  const text=said.join('');
  assert.match(text,/Stopped 2 background commands/u,`the person is told: ${text}`);
  assert.match(text,/node a \(output: C:\/o\/a\.log\)/u);
});

test('a replacement\'s close stops nothing (the conversation goes on), and nothing in the background says nothing',async t=>{
  const said=captureStderr(t);
  const first=registryWith({s:[row('a',true)]},{a:1});
  await createSessionFacade(first.registry,{model:'m'}).close!({replacing:true} as any);
  assert.deepEqual(first.calls,[]);
  const second=registryWith({s:[row('b',false)]},{});
  await createSessionFacade(second.registry,{model:'m'}).close!();
  assert.deepEqual(second.calls,[]);
  assert.equal(said.join(''),'');
});

test('FE-048: the count of what leaving a folder would stop reads the same ledger, and says zero when it cannot',()=>{
  const runtime=createSessionFacade({elencaProcessi:()=>({processi:[{inSfondo:true,toolCallId:'a'},{inSfondo:false,toolCallId:'b'},{inSfondo:true,toolCallId:'c'}]})} as any,{model:'m'});
  assert.equal(runtime.backgroundCommandCount!('s1'),2);
  assert.equal(createSessionFacade({} as any,{model:'m'}).backgroundCommandCount!('s1'),0);
  assert.equal(createSessionFacade({elencaProcessi:()=>{throw new Error('no');}} as any,{model:'m'}).backgroundCommandCount!('s1'),0);
});
