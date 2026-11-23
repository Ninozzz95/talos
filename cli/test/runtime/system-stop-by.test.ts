/*
 * Who stops a turn (05/11/2026). The kernel's `ferma(sessionId,{daChi})` records WHO stopped it: 'persona' (the default) lets the
 * parent wake up with its children's results and tells /goal the person stopped it (session-registry.mjs, `fermataDallaPersona`);
 * 'sistema' does not. The CLI's own stops — the run timeout, a permission engine error, the end of a one-shot run with children
 * still working, the tools check of /setup — were sent as the person's. Hermes had the same defect and labels a system stop on its
 * own (agent/interrupt_control.py:182-189, «the abort was attributed to the user», #130207).
 * Ctrl+C and the TUI's Stop stay the person's.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import test from 'node:test';
import {collectHeadlessRun} from '../../src/headless/run.ts';
import {createSessionFacade} from '../../src/runtime/session-facade.ts';

test('the facade: a system stop reaches the kernel as «sistema», a plain stop stays the person’s',async()=>{
  const calls:unknown[][]=[];
  const registry:any={ripristina:async()=>({}),avviaLibero:()=>({sessionId:'s1'}),elenca:()=>[{sessionId:'s1'},{sessionId:'s2'}],iscriviti:()=>()=>{},
    ferma:(...args:unknown[])=>{calls.push(args);return true;},rispondiApprovazione:()=>({ok:true})};
  const facade=createSessionFacade(registry,{model:'p:m'});
  await facade.cancel('s1',{by:'system'});
  await facade.cancel('s2');
  assert.deepEqual(calls[0],['s1',{daChi:'sistema'}]);
  assert.deepEqual(calls[1],['s2']);
});

const agent=(childId:string)=>({type:'CUSTOM',name:'talos.agenti',
  value:{version:1,sessionId:'s',parentId:'s',childId,reason:'created',agent:{sessionId:childId,taskCorto:`task ${childId}`,conclusa:false},operation:{kind:'lifecycle',status:'started'}}});
function fake(){
  const sinks=new Map<string,(event:any)=>void>();const cancels:Array<{id:string;by:unknown}>=[];
  const runtime:any={start:async()=>'s',subscribe(id:string,fn:(event:any)=>void){sinks.set(id,fn);return()=>{if(sinks.get(id)===fn)sinks.delete(id);};},answerApproval:async()=>{},
    cancel:async(id:string,options?:{by?:string})=>{cancels.push({id,by:options?.by??'person'});if(id==='s')sinks.get('s')?.({type:'RunError',code:'fermato',message:'stopped'});},
    restore:async()=>({restored:0,total:0}),resume:async(x:string)=>x,fork:async()=>'',export:()=>null,close:async()=>{}};
  return{runtime,cancels,send:(...events:any[])=>{for(const event of events)sinks.get('s')?.(event);}};
}
const tick=()=>new Promise(resolve=>setTimeout(resolve,5));
const input=(extra:Record<string,unknown>={})=>({projectRoot:process.cwd(),prompt:'x',model:'m',permissionMode:'dontAsk',permissionRules:{allow:[],ask:[],deny:[]},...extra}) as any;

for(const protocolVersion of ['v1','v2'] as const){
  test(`-p (${protocolVersion}): the timeout stops the turn and the children as the system`,async()=>{
    const f=fake();
    const run=collectHeadlessRun(f.runtime,input({protocolVersion,timeoutSeconds:0.05}));
    await tick();f.send({type:'RunStarted',runId:'r'},agent('c1'));
    const x:any=await run;
    assert.equal(x.result.error?.code??x.result.error?.envelope?.code,'RUN_TIMEOUT');
    const by=Object.fromEntries(f.cancels.map(c=>[c.id,c.by]));
    assert.equal(by.s,'system','the turn');
    assert.equal(by.c1,'system','the child');
  });
}

test('-p: the children still working when the run ends are stopped by the system',async()=>{
  const f=fake();
  const run=collectHeadlessRun(f.runtime,input());
  await tick();f.send({type:'RunStarted',runId:'r'},agent('c1'),{type:'RunError',code:'PROVIDER_ERROR',message:'boom'});
  await run;
  assert.deepEqual(f.cancels.filter(c=>c.id==='c1'),[{id:'c1',by:'system'}]);
});

test('-p: Ctrl+C stops the turn and the children as the person',async()=>{
  const f=fake();const abort=new AbortController();
  const run=collectHeadlessRun(f.runtime,input({signal:abort.signal}));
  await tick();f.send({type:'RunStarted',runId:'r'},agent('c1'));
  abort.abort();
  await run;
  const by=Object.fromEntries(f.cancels.map(c=>[c.id,c.by]));
  assert.equal(by.s,'person','the turn');
  assert.equal(by.c1,'person','the child');
});

test('the CLI’s own stops say «system» in the source; the person’s Stop does not',()=>{
  const run=readFileSync(join(process.cwd(),'src','headless','run.ts'),'utf8');
  assert.equal(run.match(/fail\('PERMISSION_ENGINE_ERROR'[^\n]*?void runtime\.cancel\(id,\{by:'system'\}\)/gu)?.length,2,'the permission engine error, in v1 and v2');
  assert.equal(run.match(/watchInterrupt\(input,\(\)=>\{wait\.stopChildren\(\);void runtime\.cancel\(id\)\.catch/gu)?.length,2,'Ctrl+C stays the person’s');
  const check=readFileSync(join(process.cwd(),'src','tui','setup-tools-check.ts'),'utf8');
  assert.match(check,/await runtime\.cancel\(id,\{by:'system'\}\)\.catch/u);
  const deferred=readFileSync(join(process.cwd(),'src','runtime','deferred-context.ts'),'utf8');
  assert.match(deferred,/cancel:\(id,options\)=>later\(c=>c\.runtime\.cancel\(id,options\)\)/u);
});
