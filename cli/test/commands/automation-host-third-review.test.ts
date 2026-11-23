/*
 * 0.6.6, the third review (DO-NOT-PUBLISH, its probes turned the right way round) — the automations' host with a stand-in registry
 * on the kernel's real store:
 * - F1: `serve --once` checks the schedules ONCE: an automation that comes due while it waits for its runs is not started (and so
 *   not stopped when it leaves);
 * - F2: `run <id>` stops checking the schedules when its own run ends, says what it still waits for, and leaves when that ends;
 * - F3: a host that loses the lease stops the runs of its own process and leaves (never back to waiting with a second runtime);
 * - F4: a run a killed process left open is closed at once, not waited on.
 */
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {runAutomationCommand} from '../../src/commands/advanced-cli.ts';
import {resolveCliPaths} from '../../src/paths.ts';

const REAL_REPO=fileURLToPath(new URL('../../../',import.meta.url));
const wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

function standIn(){
  const live=new Map<string,(value:unknown)=>void>();const started:string[]=[];const stopped:string[]=[];
  const registry:any={
    ripristina:async()=>({}),
    avviaGiroAutomazione(input:any){const sessionId=`s-${input.automazioneId}-${started.length}`;started.push(input.automazioneId);return{sessionId,fine:new Promise(resolve=>{live.set(sessionId,resolve);})};},
    statoGiroAutomazione:(sessionId:string)=>live.has(sessionId)?'in-corso':'conclusa',
    ferma(sessionId:string){stopped.push(sessionId);const end=live.get(sessionId);live.delete(sessionId);end?.({sessionId,esito:'cancelled'});},
    leggiEsitoSessioneDiPasso:async()=>null,iscriviti:()=>()=>{},rispondiApprovazione:()=>({}),
  };
  const finish=(id:string)=>{for(const [sessionId,end] of live)if(sessionId.startsWith(`s-${id}-`)){live.delete(sessionId);end({sessionId,esito:'succeeded',testoFinale:'ok'});}};
  return{registry,started,stopped,finish};
}
async function setup(){
  const project=await mkdtemp(join(tmpdir(),'talos-auto-third-'));const out:string[]=[];const err:string[]=[];
  const paths=resolveCliPaths({APPDATA:join(project,'.app'),LOCALAPPDATA:join(project,'.local')},'win32',join(project,'.home'));
  const stand=standIn();
  const ctx:any={invocation:{outputFormat:'text'},io:{writeOut:(s:string)=>out.push(s),writeErr:(s:string)=>err.push(s),stdinIsTTY:false,stdoutIsTTY:false,readStdin:async()=>''},
    projectRoot:project,repoRoot:REAL_REPO,paths,createRuntimeContext:async()=>({registry:stand.registry,runtime:{}})};
  const mod:any=await import(new URL('../../../harness-ui/src/automation-store.mjs',import.meta.url).href);
  const store=mod.createAutomationStore({cartella:join(paths.dataRoot,'automations')});
  const dueNow=async(id:string)=>{const file=join(paths.dataRoot,'automations',`${id}.json`);const row=JSON.parse(await readFile(file,'utf8'));row.prossimaEsecuzione=new Date(Date.now()-5_000).toISOString();await writeFile(file,JSON.stringify(row,null,2));};
  const make=async(nome:string,due:boolean)=>{const row=await store.crea({nome,istruzioni:'x',cartella:project,permessi:'Workspace write',pianificazione:{tipo:'ogni-n-minuti',minuti:30}});if(due)await dueNow(row.id);return row;};
  return{project,paths,out,err,stand,ctx,store,make,dueNow};
}
const trusted={assessTrust:async()=>({trusted:true})};

test('F1: serve --once checks once — what comes due while it waits is not started, so nothing is stopped when it leaves',async()=>{
  const s=await setup();const a=await s.make('A',true);const b=await s.make('B',false);
  const serving=runAutomationCommand(s.ctx,['serve','--once'],{...trusted,pollMs:20,tickMs:50,onceMs:5_000} as any);
  for(let i=0;i<300&&!s.stand.started.includes(a.id);i++)await wait(10);
  assert.ok(s.stand.started.includes(a.id),'A started by its one check');
  await s.dueNow(b.id);await wait(400);
  assert.ok(!s.stand.started.includes(b.id),'B, due later, is not started by serve --once');
  s.stand.finish(a.id);
  assert.equal(await serving,0);
  assert.deepEqual(s.stand.stopped,[],'nothing stopped on leaving');
});

test('F2: run stops checking the schedules once its own run ended, says what it waits for, and leaves when that ends',async()=>{
  const s=await setup();
  const own=await s.store.crea({nome:'Own',istruzioni:'x',cartella:s.project,permessi:'Workspace write',pianificazione:{tipo:'manuale'}});
  const due=await s.make('Due',true);const later=await s.make('Later',false);
  let settled=false;
  const running=runAutomationCommand(s.ctx,['run',own.id],{...trusted,pollMs:20,tickMs:50} as any).finally(()=>{settled=true;});
  /* 27/10/2026: under a loaded suite the sentence came after a fixed 700 ms wait; the failed assertion then left `due` running and the
     test file never exited (the whole suite hung 48 min). Waits are polled and bounded, and every run is finished whatever happens. */
  try{
    for(let i=0;i<300&&!(s.stand.started.includes(own.id)&&s.stand.started.includes(due.id));i++)await wait(10);
    assert.ok(s.stand.started.includes(due.id),'what came due while it hosted started (N2)');
    s.stand.finish(own.id);
    const said=/Waiting for 1 more automation run\(s\) this process started before it leaves/u;
    for(let i=0;i<500&&!said.test(s.err.join(''));i++)await wait(20);
    assert.equal(settled,false,'it waits for the run it started');
    assert.match(s.err.join(''),said,'and says so');
    await s.dueNow(later.id);await wait(400);
    assert.ok(!s.stand.started.includes(later.id),'no new run after its own ended');
  }finally{s.stand.finish(due.id);s.stand.finish(own.id);}
  assert.equal(await running,0);
});

test('F3: a host that loses the lease stops the runs of its own process and leaves',async()=>{
  const s=await setup();const due=await s.make('Due',true);
  let acquired=0;
  const lease:any={file:'x',tryAcquire(){acquired++;return acquired===1?{ok:true}:{ok:false,holder:{pid:4242,token:'other',role:'run',startedAt:'',beatAt:''}};},
    beat:()=>false,owns:()=>true,release(){},take:()=>[],answer(){},result:()=>null,holder:()=>({pid:4242}),send:()=>'r',withdraw:()=>true,held:()=>false};
  const serving=runAutomationCommand(s.ctx,['serve'],{...trusted,pollMs:20,tickMs:50,waitMs:50,beatMs:300,lease} as any);
  assert.equal(await serving,1,'it leaves');
  assert.ok(s.stand.started.includes(due.id),'its run had started');
  assert.ok(s.stand.stopped.some(id=>id.startsWith(`s-${due.id}-`)),'and was stopped in this process');
  assert.equal(acquired,1,'never back to waiting');
  assert.match(s.err.join(''),/took over the automations; this one stops its runs and leaves/u);
});

test('F4: a run a killed process left open in the store is closed at once, not waited on',async()=>{
  const s=await setup();
  const own=await s.store.crea({nome:'Own',istruzioni:'x',cartella:s.project,permessi:'Workspace write',pianificazione:{tipo:'manuale'}});
  const orphan=await s.store.crea({nome:'Orphan',istruzioni:'x',cartella:s.project,permessi:'Workspace write',pianificazione:{tipo:'manuale'}});
  await s.store.apriGiro(orphan.id,{runId:'r-dead',sessionId:'s-dead'});
  const started=Date.now();
  const running=runAutomationCommand(s.ctx,['run',own.id],{...trusted,pollMs:20} as any);
  for(let i=0;i<300&&!s.stand.started.includes(own.id);i++)await wait(10);
  s.stand.finish(own.id);
  assert.equal(await running,0);
  assert.ok(Date.now()-started<5_000,`left at once, not after the next check (${Date.now()-started} ms)`);
  assert.equal((await s.store.leggi(orphan.id)).giroInCorso,null,'the orphan was closed');
});
