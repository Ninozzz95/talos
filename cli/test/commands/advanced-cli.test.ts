import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runAutomationCommand,runResearchCommand} from '../../src/commands/advanced-cli.ts';

async function fakeRepo(){
  const root=await mkdtemp(join(tmpdir(),'talos-cli-advanced-'));
  const src=join(root,'harness-ui','src'); await mkdir(src,{recursive:true});
  await writeFile(join(src,'automation-store.mjs'),`const rows=[]; export function createAutomationStore(){return {elenca:async()=>rows,leggi:async id=>rows.find(x=>x.id===id)||null,crea:async x=>{const v={id:'a1',...x,attiva:false};rows.push(v);return v},imposta:async(id,v)=>{const v2=rows.find(x=>x.id===id);if(!v2)return null;v2.attiva=Boolean(v);return v2},registraEsecuzione:async id=>({id,ultimaEsecuzione:'now'}),elimina:async()=>{}}}`);
  await writeFile(join(src,'research-store.mjs'),`export async function elencaRicerche(){return [{id:'r1',domanda:'q'}]} export async function leggiRicerca({id}){return id==='r1'?{id,domanda:'q'}:null} export async function aggiornaRicerca({id,nome}){return {id,nome}} export async function eliminaRicerca({id}){return {id}}`);
  return root;
}
function ctx(repoRoot:string,projectRoot:string){const out:string[]=[];return {out,ctx:{invocation:{outputFormat:'json'} as any,io:{writeOut:(s:string)=>out.push(s),writeErr:()=>{},stdinIsTTY:false,stdoutIsTTY:false,readStdin:async()=>''},projectRoot,repoRoot,paths:{dataRoot:join(projectRoot,'.data')} as any,createRuntimeContext:async()=>({registry:{ripristina:async()=>({}),elencaRicerche:async()=>({ok:true,ricerche:[{id:'rr'}],errore:null})},runtime:{start:async()=> 'sess',close:async()=>{}}})} as any};}

test('research list/read/rename/delete use TALOS research APIs',async()=>{const repo=await fakeRepo();const project=await mkdtemp(join(tmpdir(),'talos-project-'));const x=ctx(repo,project);assert.equal(await runResearchCommand(x.ctx,['list']),0);assert.equal(await runResearchCommand(x.ctx,['read','r1']),0);assert.equal(await runResearchCommand(x.ctx,['rename','r1','new']),0);assert.equal(await runResearchCommand(x.ctx,['delete','r1']),0);});

test('research start launches real agent request instead of fabricating a completed research record',async()=>{const repo=await fakeRepo();const project=await mkdtemp(join(tmpdir(),'talos-project-'));let started:any=null;const x=ctx(repo,project);x.ctx.createRuntimeContext=async()=>({registry:{ripristina:async()=>({})},runtime:{start:async(i:any)=>{started=i;return 'sess-r';},close:async()=>{}}});assert.equal(await runResearchCommand(x.ctx,['start','What','changed?','--depth','4']),0);assert.equal(started.projectRoot,project);assert.match(started.prompt,/Deep Research/u);assert.match(started.prompt,/What changed\?/u);assert.equal(started.permissionMode,'plan');});

test('automation install-runner requires explicit confirmation before touching Task Scheduler',async()=>{
  const repo=await fakeRepo();const project=await mkdtemp(join(tmpdir(),'talos-project-'));const x=ctx(repo,project);let calls=0;
  await assert.rejects(()=>runAutomationCommand(x.ctx,['install-runner'],{platform:'win32',installRunnerFn:async()=>{calls++;return {ok:true};}} as any),/AUTOMATION_CONFIRM_REQUIRED/u);
  assert.equal(calls,0);
});

test('automation install-runner and uninstall-runner call only the dedicated Windows task helpers after --yes',async()=>{
  const repo=await fakeRepo();const project=await mkdtemp(join(tmpdir(),'talos-project-'));const x=ctx(repo,project);const actions:string[]=[];
  const deps:any={platform:'win32',cliRoot:'C:\\TALOS CLI',username:'ME\\alice',installRunnerFn:async(i:any)=>{actions.push(`install:${i.cliRoot}:${i.username}`);return {ok:true,taskName:'TALOS CLI Automation Runner',definitionFile:'x'};},uninstallRunnerFn:()=>{actions.push('uninstall');return {ok:true,taskName:'TALOS CLI Automation Runner'};}};
  assert.equal(await runAutomationCommand(x.ctx,['install-runner','--yes'],deps),0);
  assert.equal(await runAutomationCommand(x.ctx,['uninstall-runner','--yes'],deps),0);
  assert.deepEqual(actions,['install:C:\\TALOS CLI:ME\\alice','uninstall']);
});


test('M10-A RED — research command surface exposes native pause resume cancel and canonical export through one facade',async()=>{
  const source=await readFile(new URL('../../src/commands/advanced-cli.ts',import.meta.url),'utf8');
  const start=source.indexOf('export async function runResearchCommand');const end=source.indexOf('export async function runAutomationCommand',start);
  assert.ok(start>=0&&end>start);const block=source.slice(start,end);
  assert.match(block,/createResearchFacade/u);
  for(const operation of ['pause','resume','cancel','export'])assert.match(block,new RegExp("\\b"+operation+"\\b",'u'));
  assert.doesNotMatch(block,/\.ferma\(/u,'generic session stop is not research cancellation');
});


/* 0.6.6 (owner 14/10, «Comandi ora, schermata dopo»; «Una frase breve»): `talos automation` on the kernel's v2 store (the real one) */
const REAL_REPO=fileURLToPath(new URL('../../../',import.meta.url));
const trusting=(verdict:boolean)=>async()=>({trusted:verdict}) as any;
function automationCtx(project:string){const x=ctx(REAL_REPO,project);x.ctx.paths={dataRoot:join(project,'.data'),trust:{projects:join(project,'.trust')}} as any;return x;}
test('automation add/list/show/edit/enable/disable/delete work on the kernel\'s v2 store, with a --when phrase',async()=>{
  const project=await mkdtemp(join(tmpdir(),'talos-project-'));const x=automationCtx(project);const deps={assessTrust:trusting(true)};
  assert.equal(await runAutomationCommand(x.ctx,['add','check the build and say what broke','--when','every 30m','--mode','plan'],deps as any),0);
  const made=JSON.parse(x.out.at(-1)!);assert.equal(made.schedule,'every 30m');assert.equal(made.mode,'plan');assert.equal(made.folder,project);assert.equal(made.active,true);assert.equal(made.legacy,false);
  assert.equal(made.name,'check the build and say what broke','the name defaults to the instructions');
  assert.equal(await runAutomationCommand(x.ctx,['edit',made.id,'--when','weekdays 09:00','--name','Build check'],deps as any),0);
  const edited=JSON.parse(x.out.at(-1)!);assert.equal(edited.schedule,'weekdays 09:00');assert.equal(edited.name,'Build check');
  assert.equal(await runAutomationCommand(x.ctx,['disable',made.id],deps as any),0);assert.equal(JSON.parse(x.out.at(-1)!).active,false);
  assert.equal(await runAutomationCommand(x.ctx,['enable',made.id],deps as any),0);assert.equal(JSON.parse(x.out.at(-1)!).active,true);
  assert.equal(await runAutomationCommand(x.ctx,['show',made.id],deps as any),0);assert.equal(JSON.parse(x.out.at(-1)!).instructions,'check the build and say what broke');
  assert.equal(await runAutomationCommand(x.ctx,['list'],deps as any),0);assert.equal(JSON.parse(x.out.at(-1)!).rows.length,1);
  assert.equal(await runAutomationCommand(x.ctx,['delete',made.id],deps as any),0);
  assert.equal(await runAutomationCommand(x.ctx,['list'],deps as any),0);assert.equal(JSON.parse(x.out.at(-1)!).rows.length,0);
});
test('automation add refuses: no --when, a phrase it does not read, a folder nobody trusted; the old operations say what replaced them',async()=>{
  const project=await mkdtemp(join(tmpdir(),'talos-project-'));const x=automationCtx(project);
  await assert.rejects(()=>runAutomationCommand(x.ctx,['add','check'],{assessTrust:trusting(true)} as any),{code:'AUTOMATION_WHEN_REQUIRED'});
  await assert.rejects(()=>runAutomationCommand(x.ctx,['add','check','--when','tomorrow'],{assessTrust:trusting(true)} as any),{code:'AUTOMATION_WHEN_INVALID'});
  await assert.rejects(()=>runAutomationCommand(x.ctx,['add','check','--when','every 3m'],{assessTrust:trusting(true)} as any),/at most every 5 minutes/u);
  await assert.rejects(()=>runAutomationCommand(x.ctx,['add','check','--when','every 30m'],{assessTrust:trusting(false)} as any),{code:'PROJECT_TRUST_REQUIRED'});
  await assert.rejects(()=>runAutomationCommand(x.ctx,['add','check','--when','every 30m','--mode','yolo'],{assessTrust:trusting(true)} as any),{code:'AUTOMATION_MODE_INVALID'});
  for(const op of ['schedule','dry-run'])await assert.rejects(()=>runAutomationCommand(x.ctx,[op,'a1'],{} as any),{code:'AUTOMATION_OPERATION_REMOVED'});
  assert.equal(await runAutomationCommand(x.ctx,['list'],{} as any),0);assert.equal(JSON.parse(x.out.at(-1)!).rows.length,0,'nothing was made');
});
test('an automation of the old format is listed as such and refused before any runtime starts',async()=>{
  const project=await mkdtemp(join(tmpdir(),'talos-project-'));const x=automationCtx(project);let runtimes=0;x.ctx.createRuntimeContext=async()=>{runtimes++;return {} as any;};
  const mod:any=await import(new URL('../../../harness-ui/src/automation-store.mjs',import.meta.url).href);
  const legacy=await mod.createAutomationStore({cartella:join(project,'.data','automations')}).crea({taskId:'catalog-task',intervalloMinuti:5});
  assert.equal(await runAutomationCommand(x.ctx,['list'],{} as any),0);const row=JSON.parse(x.out.at(-1)!).rows[0];assert.equal(row.legacy,true);assert.match(row.schedule,/old format/u);
  await assert.rejects(()=>runAutomationCommand(x.ctx,['run',legacy.id],{} as any),{code:'AUTOMATION_LEGACY'});
  await assert.rejects(()=>runAutomationCommand(x.ctx,['edit',legacy.id,'--when','every 30m'],{} as any),{code:'AUTOMATION_LEGACY'});
  assert.equal(runtimes,0,'no runtime for an automation that cannot run');
});

/* the second review of 0.6.6 (N5): the user name went to Task Scheduler with two backslashes and the text said a literal "\n" */
test('install-runner passes the Windows account as DOMAIN, one backslash, user, and prints a real line',async()=>{
  const repo=await fakeRepo();const project=await mkdtemp(join(tmpdir(),'talos-project-'));const x=ctx(repo,project);x.ctx.invocation.outputFormat='text';
  const saved={domain:process.env.USERDOMAIN,user:process.env.USERNAME};process.env.USERDOMAIN='DOM';process.env.USERNAME='person';
  try{
    let seen='';
    assert.equal(await runAutomationCommand(x.ctx,['install-runner','--yes'],{platform:'win32',cliRoot:'C:/T',installRunnerFn:async(i:any)=>{seen=i.username;return {ok:true};}} as any),0);
    assert.equal(seen,['DOM','person'].join(String.fromCharCode(92)));
    assert.equal(x.out.at(-1),'Automation runner installed'+String.fromCharCode(10));
  }finally{process.env.USERDOMAIN=saved.domain;process.env.USERNAME=saved.user;if(saved.domain===undefined)delete process.env.USERDOMAIN;if(saved.user===undefined)delete process.env.USERNAME;}
});
