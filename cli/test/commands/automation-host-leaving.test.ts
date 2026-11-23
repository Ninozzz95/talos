/*
 * 0.6.6, the second review (N2, N3) — a `talos automation run` that hosts, on the kernel's real store with a stand-in registry:
 * - it checks the schedules while it hosts (a `serve` waiting meanwhile cannot): an automation due then starts;
 * - on Ctrl+C it stops what it still runs — its own run and the one another process handed it — before the lease goes, so no run
 *   is left going without a host (the next host would reconcile it, or run it a second time).
 */
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {runAutomationCommand} from '../../src/commands/advanced-cli.ts';
import {createHostLease} from '../../src/automations/host-lease.ts';
import {resolveCliPaths} from '../../src/paths.ts';

const REAL_REPO=fileURLToPath(new URL('../../../',import.meta.url));
const wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

function standInRegistry(){
  const live=new Map<string,(value:unknown)=>void>();const started:string[]=[];const stopped:string[]=[];
  const registry:any={
    ripristina:async()=>({}),
    avviaGiroAutomazione(input:any){const sessionId=`s-${input.automazioneId}`;started.push(input.automazioneId);return{sessionId,fine:new Promise(resolve=>{live.set(sessionId,resolve);})};},
    statoGiroAutomazione:(sessionId:string)=>live.has(sessionId)?'in-corso':'conclusa',
    ferma(sessionId:string){stopped.push(sessionId);const end=live.get(sessionId);live.delete(sessionId);end?.({sessionId,esito:'cancelled'});},
    leggiEsitoSessioneDiPasso:async()=>null,iscriviti:()=>()=>{},rispondiApprovazione:()=>({}),
  };
  return{registry,started,stopped};
}

test('a run that hosts checks the schedules, and on Ctrl+C stops its own run and the one handed to it before the lease goes',async()=>{
  const project=await mkdtemp(join(tmpdir(),'talos-auto-leave-'));const out:string[]=[];
  const paths=resolveCliPaths({APPDATA:join(project,'.app'),LOCALAPPDATA:join(project,'.local')},'win32',join(project,'.home'));
  const stand=standInRegistry();
  const ctx:any={invocation:{outputFormat:'json'},io:{writeOut:(s:string)=>out.push(s),writeErr:()=>{},stdinIsTTY:false,stdoutIsTTY:false,readStdin:async()=>''},
    projectRoot:project,repoRoot:REAL_REPO,paths,createRuntimeContext:async()=>({registry:stand.registry,runtime:{close:async()=>{closed+=1;}}})};
  let closed=0;
  const mod:any=await import(new URL('../../../harness-ui/src/automation-store.mjs',import.meta.url).href);
  const store=mod.createAutomationStore({cartella:join(paths.dataRoot,'automations')});
  const make=(nome:string)=>store.crea({nome,istruzioni:'x',cartella:project,permessi:'Workspace write',pianificazione:{tipo:'manuale'}});
  const own=await make('Own'),handed=await make('Handed');
  /* one due now: an interval entry whose next run is moved into the past on the disk */
  const due=await store.crea({nome:'Due',istruzioni:'x',cartella:project,permessi:'Workspace write',pianificazione:{tipo:'ogni-n-minuti',minuti:30}});
  const file=join(paths.dataRoot,'automations',`${due.id}.json`);
  const row=JSON.parse(await readFile(file,'utf8'));row.prossimaEsecuzione=new Date(Date.now()-5_000).toISOString();await writeFile(file,JSON.stringify(row,null,2));
  const ctrlC=new AbortController();
  const running=runAutomationCommand(ctx,['run',own.id],{assessTrust:async()=>({trusted:true}),pollMs:20,tickMs:50,signal:ctrlC.signal} as any);
  for(let i=0;i<200&&!stand.started.includes(own.id);i++)await wait(10);
  assert.ok(stand.started.includes(own.id),'its own run started');
  const asker=createHostLease({dir:join(paths.dataRoot,'automation-host'),role:'run'});asker.send('run',handed.id);
  for(let i=0;i<300&&!(stand.started.includes(handed.id)&&stand.started.includes(due.id));i++)await wait(10);
  assert.ok(stand.started.includes(handed.id),'the run another process handed it started');
  assert.ok(stand.started.includes(due.id),'the automation due while it hosted started (N2)');
  ctrlC.abort();
  assert.equal(await running,1,'its own run was stopped');
  for(const id of [own.id,handed.id,due.id])assert.ok(stand.stopped.includes(`s-${id}`),`${id} stopped before the host left (N3)`);
  for(const id of [own.id,handed.id,due.id])assert.equal((await store.leggi(id)).giroInCorso,null,`${id}: no run left open in the store`);
  assert.equal(existsSync(join(paths.dataRoot,'automation-host','automation-host.json')),false,'and the lease went last');
  assert.equal(closed,1,'0.6.7: the runtime the host built is closed before it leaves');
});

/* 0.6.7 (the reviews of 0.6.6): the scheduler's stop reaches a run's own session only; the agent it delegated to is a separate
   session, and the host that left on Ctrl+C left it working */
test('on Ctrl+C the host stops the agents its runs delegated to, not only the runs',async()=>{
  const project=await mkdtemp(join(tmpdir(),'talos-auto-leave-agents-'));
  const paths=resolveCliPaths({APPDATA:join(project,'.app'),LOCALAPPDATA:join(project,'.local')},'win32',join(project,'.home'));
  const stand=standInRegistry();
  /* the root's stream announces one agent at work, as the kernel's `talos.agenti` does */
  stand.registry.iscriviti=(sessionId:string,next:(raw:unknown)=>void)=>{
    if(sessionId.startsWith('s-'))setTimeout(()=>next({type:'CUSTOM',name:'talos.agenti',value:{childId:`child-of-${sessionId}`,parentId:sessionId,reason:'created',agent:{}}}),5);
    return()=>{};
  };
  const ctx:any={invocation:{outputFormat:'json'},io:{writeOut:()=>{},writeErr:()=>{},stdinIsTTY:false,stdoutIsTTY:false,readStdin:async()=>''},
    projectRoot:project,repoRoot:REAL_REPO,paths,createRuntimeContext:async()=>({registry:stand.registry,runtime:{}})};
  const mod:any=await import(new URL('../../../harness-ui/src/automation-store.mjs',import.meta.url).href);
  const store=mod.createAutomationStore({cartella:join(paths.dataRoot,'automations')});
  const own=await store.crea({nome:'Own',istruzioni:'x',cartella:project,permessi:'Workspace write',pianificazione:{tipo:'manuale'}});
  const ctrlC=new AbortController();
  const running=runAutomationCommand(ctx,['run',own.id],{assessTrust:async()=>({trusted:true}),pollMs:20,tickMs:50,signal:ctrlC.signal} as any);
  for(let i=0;i<200&&!stand.started.includes(own.id);i++)await wait(10);
  await wait(60);
  ctrlC.abort();
  await running;
  assert.ok(stand.stopped.includes(`s-${own.id}`),'the run is stopped');
  assert.ok(stand.stopped.includes(`child-of-s-${own.id}`),'and the agent it delegated to');
});

/* 0.6.7 (the reviews of 0.6.6): a Ctrl+C whose stop the scheduler refuses (the run had just ended) said nothing */
test('a Ctrl+C whose stop is refused says nothing was stopped, and the run\'s end is still told',async()=>{
  const project=await mkdtemp(join(tmpdir(),'talos-auto-stop-refused-'));const err:string[]=[];
  const paths=resolveCliPaths({APPDATA:join(project,'.app'),LOCALAPPDATA:join(project,'.local')},'win32',join(project,'.home'));
  const stand=standInRegistry();
  /* the kernel's scheduler refuses the stop when the run's session is no longer in progress; this run ends by itself 150 ms later */
  stand.registry.statoGiroAutomazione=()=>'conclusa';
  stand.registry.avviaGiroAutomazione=(input:any)=>{const sessionId=`s-${input.automazioneId}`;stand.started.push(input.automazioneId);return{sessionId,fine:new Promise(resolve=>setTimeout(()=>resolve({sessionId,esito:'succeeded'}),150))};};
  const ctx:any={invocation:{outputFormat:'text'},io:{writeOut:()=>{},writeErr:(s:string)=>err.push(s),stdinIsTTY:false,stdoutIsTTY:false,readStdin:async()=>''},
    projectRoot:project,repoRoot:REAL_REPO,paths,createRuntimeContext:async()=>({registry:stand.registry,runtime:{}})};
  const mod:any=await import(new URL('../../../harness-ui/src/automation-store.mjs',import.meta.url).href);
  const store=mod.createAutomationStore({cartella:join(paths.dataRoot,'automations')});
  const own=await store.crea({nome:'Own',istruzioni:'x',cartella:project,permessi:'Workspace write',pianificazione:{tipo:'manuale'}});
  const ctrlC=new AbortController();
  const running=runAutomationCommand(ctx,['run',own.id],{assessTrust:async()=>({trusted:true}),pollMs:20,tickMs:50,signal:ctrlC.signal} as any);
  for(let i=0;i<200&&!stand.started.includes(own.id);i++)await wait(10);
  ctrlC.abort();
  await running;
  assert.match(err.join(''),/Nothing was stopped: this automation is not running/u,err.join(''));
});
