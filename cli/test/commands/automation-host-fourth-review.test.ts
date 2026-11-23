/*
 * 0.6.6, the fourth review (PUBLISH with reservations), each reservation the right way round:
 * - N-A: a lease file that cannot be READ this instant is not a lost lease; only a file gone or naming another token is;
 * - N-B: a request the host took just before the deadline gets a short grace for its answer;
 * - N-C: a `run` host that loses the lease stops its own run and leaves with the lost message, it does not follow it to the end;
 * - N-F: a run entry that can never be read again ends the wait after a while;
 * - N-G: a `run` the host refused starts nothing else;
 * - N-H: a host whose lease is no longer its own takes no request and starts nothing, even if its timers fire before the beat.
 */
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {runAutomationCommand} from '../../src/commands/advanced-cli.ts';
import {createHostLease} from '../../src/automations/host-lease.ts';
import {runEnded} from '../../src/automations/cli-scheduler.ts';
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
  return{registry,started,stopped};
}
async function setup(){
  const project=await mkdtemp(join(tmpdir(),'talos-auto-fourth-'));const out:string[]=[];const err:string[]=[];
  const paths=resolveCliPaths({APPDATA:join(project,'.app'),LOCALAPPDATA:join(project,'.local')},'win32',join(project,'.home'));
  const stand=standIn();
  const ctx:any={invocation:{outputFormat:'json'},io:{writeOut:(s:string)=>out.push(s),writeErr:(s:string)=>err.push(s),stdinIsTTY:false,stdoutIsTTY:false,readStdin:async()=>''},
    projectRoot:project,repoRoot:REAL_REPO,paths,createRuntimeContext:async()=>({registry:stand.registry,runtime:{}})};
  const mod:any=await import(new URL('../../../harness-ui/src/automation-store.mjs',import.meta.url).href);
  const store=mod.createAutomationStore({cartella:join(paths.dataRoot,'automations')});
  const dueNow=async(id:string)=>{const file=join(paths.dataRoot,'automations',`${id}.json`);const row=JSON.parse(await readFile(file,'utf8'));row.prossimaEsecuzione=new Date(Date.now()-5_000).toISOString();await writeFile(file,JSON.stringify(row,null,2));};
  const make=async(nome:string,schedule:any={tipo:'manuale'})=>store.crea({nome,istruzioni:'x',cartella:project,permessi:'Workspace write',pianificazione:schedule});
  return{project,paths,out,err,stand,ctx,store,make,dueNow,leaseDir:join(paths.dataRoot,'automation-host')};
}

test('N-A: a lease file that cannot be read this instant is still this process\'s; a file gone or naming another token is not',t=>{
  const d=mkdtempSync(join(tmpdir(),'talos-lease-owns-'));t.after(()=>rmSync(d,{recursive:true,force:true}));
  const lease=createHostLease({dir:d,role:'serve',isAlive:()=>true});assert.equal(lease.tryAcquire().ok,true);
  const file=join(d,'automation-host.json');
  rmSync(file);mkdirSync(file);/* a read now fails, and not with ENOENT */
  assert.equal(lease.owns(),true,'a failed read is not a loss');assert.equal(lease.beat(),true,'nor for the beat');
  rmSync(file,{recursive:true});writeFileSync(file,JSON.stringify({pid:1,token:'someone-else',beatAt:new Date().toISOString()}));
  assert.equal(lease.owns(),false,'another token');
  const other=createHostLease({dir:mkdtempSync(join(tmpdir(),'talos-lease-gone-')),role:'serve',isAlive:()=>true});other.tryAcquire();
  rmSync(other.file);assert.equal(other.owns(),false,'a file that is gone');
});

test('N-B: a request the host took just before the deadline still gets its answer within the grace',async()=>{
  const s=await setup();const auto=await s.make('A');
  const host=createHostLease({dir:s.leaseDir,role:'serve'});host.tryAcquire();
  const running=runAutomationCommand(s.ctx,['run',auto.id],{pollMs:20,answerMs:150} as any);
  let request:any;for(let i=0;i<100&&!request;i++){[request]=host.take();if(!request)await wait(10);}
  await wait(400);/* past the deadline, inside the grace */
  host.answer(request.requestId,{ok:false,code:'AUTOMATION_RUN_IN_PROGRESS'});
  assert.equal(await running,1);assert.equal(JSON.parse(s.out.at(-1)!).code,'AUTOMATION_RUN_IN_PROGRESS','the answer, not AUTOMATION_HOST_NOT_ANSWERING');
  host.release();
});

test('N-C: a run host that loses the lease stops its own run and leaves, without following it to the end',async()=>{
  const s=await setup();const own=await s.make('Own');
  let beats=0;const lease:any={file:'x',tryAcquire:()=>({ok:true}),beat:()=>(++beats<2),owns:()=>true,release(){},take:()=>[],answer(){},result:()=>null,holder:()=>null,send:()=>'r',withdraw:()=>true,held:()=>true};
  const running=runAutomationCommand(s.ctx,['run',own.id],{assessTrust:async()=>({trusted:true}),pollMs:20,beatMs:200,lease} as any);
  assert.equal(await Promise.race([running,wait(10_000).then(()=>'still following')]),1);
  assert.ok(s.stand.stopped.some(id=>id.startsWith(`s-${own.id}-`)),'its run was stopped in this process');
  assert.match(s.err.join(''),/took over the automations; this one stops its runs and leaves/u);
});

test('N-F: an entry that can never be read again ends the wait after a while',async()=>{
  let reads=0;const started=Date.now();
  await runEnded({leggi:async()=>{reads++;throw Object.assign(new Error('x'),{code:'AUTOMATION_STORE_READ_FAILED'});}},'a','r',undefined,1_200);
  assert.ok(Date.now()-started<5_000&&reads>=2,`${reads} reads in ${Date.now()-started} ms`);
});

test('N-G: a run the host refused starts nothing else, even what is due',async()=>{
  const s=await setup();const own=await s.make('Own');
  /* the due one lives in a trusted folder: only the person's own run is refused (its folder is not trusted) */
  const elsewhere=join(s.project,'trusted');mkdirSync(elsewhere);
  const due=await s.store.crea({nome:'Due',istruzioni:'x',cartella:elsewhere,permessi:'Workspace write',pianificazione:{tipo:'ogni-n-minuti',minuti:30}});await s.dueNow(due.id);
  assert.equal(await runAutomationCommand(s.ctx,['run',own.id],{assessTrust:async({projectRoot}:any)=>({trusted:projectRoot===elsewhere}),pollMs:20} as any),1);
  assert.deepEqual(s.stand.started,[],'nothing started');
});

test('N-H: a host whose lease is no longer its own takes no request and starts nothing',async()=>{
  const s=await setup();const due=await s.make('Due',{tipo:'ogni-n-minuti',minuti:30});
  let taken=0;const lease:any={file:'x',tryAcquire:()=>({ok:true}),beat:()=>true,owns:()=>false,release(){},take:()=>{taken++;return[];},answer(){},result:()=>null,holder:()=>null,send:()=>'r',withdraw:()=>true,held:()=>true};
  const ctrlC=new AbortController();
  const serving=runAutomationCommand(s.ctx,['serve'],{assessTrust:async()=>({trusted:true}),pollMs:20,tickMs:50,lease,signal:ctrlC.signal} as any);
  await wait(300);await s.dueNow(due.id);await wait(400);
  assert.equal(taken,0,'no request taken');assert.deepEqual(s.stand.started,[],'nothing started by the timers');
  ctrlC.abort();assert.equal(await serving,0);
});
