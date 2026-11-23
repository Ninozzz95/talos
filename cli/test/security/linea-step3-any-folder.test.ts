/*
 * «One line», step 3, round after the report (judge v1534 point 2, 11/11/2026): `talos doctor`, `talos provider …`, `talos session …`
 * and `talos remote` do not stop on trust. In a folder nobody ever decided they leave out the folder's project settings (form B,
 * `projectUntrusted`, the TUI's own «No») and say so in ONE line; in a decided folder nothing changes; a folder whose trust was given
 * and then changed still stops them. Cure b of step 3 made every runtime without `trustVerified` refuse an undecided folder, and the
 * acceptance run of 11/11 showed it (s16 E8/E13).
 * Precedent: Claude Code's `mcp list`/`get` in an untrusted workspace start none of the repo's servers and show them pending
 * (CHANGELOG.md:5169); Codex can skip every project configuration layer (codex-rs/config/src/state.rs:55).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {hermetic,type Hermetic} from '../provider/first-run-fixture.ts';
import {runSystemCommand} from '../../src/commands/system-cli.ts';
import {runSessionCommand} from '../../src/commands/session-cli.ts';
import {openHost} from '../../src/commands/remote-cli.ts';
import {runProviderCommand} from '../../src/commands/provider-cli.ts';
import {createCliRuntimeContext} from '../../src/runtime/create-runtime.ts';
import {createTrustAuthority} from '../../src/security/trust-authority.ts';
import {projectSettingsReadable} from '../../src/commands/any-folder.ts';

const LINE=/^This folder was never trusted: TALOS left out its project settings, instructions, hooks and connections\. Trust it with `talos project trust`\.$/mu;
const lines=(text:string)=>text.split('\n').filter(line=>LINE.test(line)).length;

/** A context whose runtime factory records what it was asked and hands back a tiny fake (no composition, no network). */
function bench(h:Hermetic,{format='json'}:{format?:'text'|'json'}={}){
  const asked:any[]=[];const out:string[]=[];const err:string[]=[];
  const ctx:any={invocation:{outputFormat:format},io:{writeOut:(text:string)=>out.push(text),writeErr:(text:string)=>err.push(text),stdinIsTTY:false,stdoutIsTTY:false,readStdin:async()=>''},
    projectRoot:h.project,paths:h.paths,repoRoot:undefined,
    createRuntimeContext:async(input:any)=>{asked.push(input);return{registry:{ripristina:async()=>{},elenca:()=>[]},remoteKeyring:{},runtime:{listSessions:async()=>[]},
      /* doctor's providers section needs a control plane; readiness answers for any model, so an active model read from the folder shows */
      providerControlPlane:{list:()=>[],readiness:()=>({ready:false,code:'PROVIDER_KEY_MISSING',message:'no key'})}};}};
  return{ctx,asked,out:()=>out.join(''),err:()=>err.join('')};
}
const formB=(input:any)=>input?.trustVerified===true&&input?.projectUntrusted===true;
async function decide(h:Hermetic){await createTrustAuthority({projectRoot:h.project,trustRoot:h.paths.trust.projects}).trustProject();}

test('LINEA-3 v1534 doctor: in a folder nobody decided it leaves the project settings out and says so in one line',{timeout:120_000},async()=>hermetic(async h=>{
  const b=bench(h);
  await runSystemCommand(b.ctx,'doctor',['--json']).catch(()=>1);
  assert.ok(b.asked.length>0,'doctor asked for no runtime at all');
  for(const input of b.asked)assert.ok(formB(input),`doctor asked for a runtime that goes through trust: ${JSON.stringify(input)}`);
  assert.equal(lines(b.err()),1,b.err());
}));

test('LINEA-3 v1534 session list: in a folder nobody decided it leaves the project settings out and says so in one line',{timeout:120_000},async()=>hermetic(async h=>{
  const b=bench(h);
  await runSessionCommand(b.ctx,['list']);
  assert.equal(b.asked.length,1);assert.ok(formB(b.asked[0]),JSON.stringify(b.asked[0]));
  assert.equal(lines(b.err()),1,b.err());
}));

test('LINEA-3 v1534 remote: the host in a folder nobody decided ignores the folder\'s model and settings and says so in one line',{timeout:120_000},async()=>hermetic(async h=>{
  fs.mkdirSync(path.join(h.project,'.talos-cli'),{recursive:true});
  fs.writeFileSync(path.join(h.project,'.talos-cli','config.json'),JSON.stringify({version:1,model:'openrouter:planted/by-the-folder'})+'\n');
  const b=bench(h);
  await openHost(b.ctx,{httpDeps:(async()=>({})) as any,createHost:(async()=>({})) as any});
  assert.equal(b.asked.length,1);assert.ok(formB(b.asked[0]),JSON.stringify(b.asked[0]));
  assert.notEqual(b.asked[0].model,'openrouter:planted/by-the-folder','the host took its model from the folder nobody trusted');
  assert.equal(lines(b.err()),1,b.err());
}));

test('LINEA-3 v1534 provider list: through the real gate, a folder nobody decided runs on TALOS\'s own folder and says so in one line',{timeout:120_000},async()=>hermetic(async h=>{
  const asked:any[]=[];const built:any[]=[];const out:string[]=[];const err:string[]=[];
  const ctx:any={invocation:{outputFormat:'json'},io:{writeOut:(text:string)=>out.push(text),writeErr:(text:string)=>err.push(text),stdinIsTTY:false,stdoutIsTTY:false,readStdin:async()=>''},
    projectRoot:h.project,paths:h.paths,repoRoot:undefined,
    createRuntimeContext:async(input:any)=>{asked.push(input);const {repoRoot:_none,...rest}=input;const context=await createCliRuntimeContext(rest);built.push(context);return context;}};
  try{
    assert.equal(await runProviderCommand(ctx,['list']),0,out.join(''));
    assert.equal(asked.at(-1).projectRoot,path.join(h.paths.dataRoot,'no-project'));
    assert.equal(lines(err.join('')),1,err.join(''));
  }finally{for(const context of built)await context.runtime.close?.().catch(()=>{});}
}));

test('LINEA-3 v1534 AL CONTRARIO: in a decided folder doctor, session and remote go through trust as before, and say nothing',{timeout:120_000},async()=>hermetic(async h=>{
  await decide(h);
  const b=bench(h);
  await runSystemCommand(b.ctx,'doctor',['--json']).catch(()=>1);
  await runSessionCommand(b.ctx,['list']);
  await openHost(b.ctx,{httpDeps:(async()=>({})) as any,createHost:(async()=>({})) as any});
  assert.ok(b.asked.length>=3);
  for(const input of b.asked)assert.ok(!formB(input)&&input.projectUntrusted!==true,`a decided folder was opened without its settings: ${JSON.stringify(input)}`);
  assert.equal(lines(b.err()),0,b.err());
}));

/* Judge v1579 point 3 (reviewer, GIALLO): doctor said «left out its project settings» and still showed the model the folder planted
   (`system-cli.ts:54` loaded the project config with no `projectTrusted:false`, `:56` took its model). */
test('LINEA-3 v1579 doctor: in a folder nobody decided the model the folder planted is not shown, nor any of its settings',{timeout:120_000},async()=>hermetic(async h=>{
  fs.mkdirSync(path.join(h.project,'.talos-cli'),{recursive:true});
  fs.writeFileSync(path.join(h.project,'.talos-cli','config.json'),JSON.stringify({version:1,model:'openrouter:planted/by-the-folder'})+'\n');
  const b=bench(h);b.ctx.repoRoot=path.resolve(import.meta.dirname,'..','..','..');
  let failure:any=null;await runSystemCommand(b.ctx,'doctor',['--json']).catch(error=>{failure=error;});
  const report=JSON.parse(b.out()||'null');
  assert.ok(report?.sections?.providers&&report.sections.providers.state!=='unavailable',`doctor built no providers section, so a planted model could not show: ${failure?.stack??b.out().slice(0,400)}`);
  assert.doesNotMatch(b.out(),/planted\/by-the-folder/u,'doctor read the settings of a folder nobody trusted');
  assert.equal(lines(b.err()),1,b.err());
}));

/* Judge v1579 point 5 (reviewer's live mutants R1 and R4): a folder whose trust was given and then changed (PROJECT_TRUST_INVALIDATED)
   is not a missing answer: nothing runs there in form B, and the «never trusted» line is not said. */
async function invalidated(h:Hermetic){
  fs.mkdirSync(path.join(h.project,'.talos-cli'),{recursive:true});
  fs.writeFileSync(path.join(h.project,'.talos-cli','config.json'),JSON.stringify({version:1,model:'openrouter:planted/by-the-folder'})+'\n');
  await decide(h);
  fs.writeFileSync(path.join(h.project,'.talos-cli','config.json'),JSON.stringify({version:1,model:'openrouter:changed/after-trust'})+'\n');
  const {assessProjectTrust,projectTrustFailure}=await import('../../src/security/project-trust-gate.ts');
  const failure:any=projectTrustFailure(await assessProjectTrust({projectRoot:h.project,trustRoot:h.paths.trust.projects}));
  assert.equal(failure?.code,'PROJECT_TRUST_INVALIDATED','the scene is a folder whose trust changed');
}
test('LINEA-3 v1579 INVALIDATED: session list and remote stop, nothing runs in form B, and the «never trusted» line is not said',{timeout:120_000},async()=>hermetic(async h=>{
  await invalidated(h);
  const b=bench(h);
  await assert.rejects(()=>runSessionCommand(b.ctx,['list']),(error:any)=>error?.code==='PROJECT_TRUST_INVALIDATED');
  await assert.rejects(()=>openHost(b.ctx,{httpDeps:(async()=>({})) as any,createHost:(async()=>({})) as any}),(error:any)=>error?.code==='PROJECT_TRUST_INVALIDATED');
  for(const input of b.asked)assert.ok(!formB(input),`a changed folder ran in form B: ${JSON.stringify(input)}`);
  assert.equal(lines(b.err()),0,b.err());
}));
test('LINEA-3 v1579 INVALIDATED doctor: no form B, no «never trusted» line, and the changed folder\'s settings are not shown',{timeout:120_000},async()=>hermetic(async h=>{
  await invalidated(h);
  assert.equal(await projectSettingsReadable({projectRoot:h.project,paths:h.paths} as any),false,'a folder whose trust changed is read');
  const b=bench(h);b.ctx.repoRoot=path.resolve(import.meta.dirname,'..','..','..');
  let failure:any=null;await runSystemCommand(b.ctx,'doctor',['--json']).catch(error=>{failure=error;});
  assert.ok(b.out().length>0,`doctor printed nothing: ${failure?.stack??''}`);
  for(const input of b.asked)assert.ok(!formB(input),`doctor ran a changed folder in form B: ${JSON.stringify(input)}`);
  assert.equal(lines(b.err()),0,b.err());
  assert.doesNotMatch(b.out(),/changed\/after-trust|planted\/by-the-folder/u);
}));
test('LINEA-3 v1579 INVALIDATED provider list: through the real gate it runs on TALOS\'s own folder and does not say «never trusted»',{timeout:120_000},async()=>hermetic(async h=>{
  await invalidated(h);
  const asked:any[]=[];const built:any[]=[];const out:string[]=[];const err:string[]=[];
  const ctx:any={invocation:{outputFormat:'json'},io:{writeOut:(text:string)=>out.push(text),writeErr:(text:string)=>err.push(text),stdinIsTTY:false,stdoutIsTTY:false,readStdin:async()=>''},
    projectRoot:h.project,paths:h.paths,repoRoot:undefined,
    createRuntimeContext:async(input:any)=>{asked.push(input);const {repoRoot:_none,...rest}=input;const context=await createCliRuntimeContext(rest);built.push(context);return context;}};
  try{
    assert.equal(await runProviderCommand(ctx,['list']),0,out.join(''));
    assert.equal(asked.at(-1).projectRoot,path.join(h.paths.dataRoot,'no-project'),'the changed folder is left out');
    assert.equal(lines(err.join('')),0,err.join(''));
  }finally{for(const context of built)await context.runtime.close?.().catch(()=>{});}
}));

/* Judge v1597 (d), the reviewer's live mutant X3: the diagnostic bundle loads the configuration again for its `config.json`
   (`system-cli.ts:168`), so it too must leave out the settings of a folder nobody trusted. The zip is stored, not compressed
   (`writeStoredZip`), so what any entry holds is in its bytes. AL CONTRARIO: in a decided folder the same model IS in the bundle,
   so the bench can see it. */
async function bundleBytes(h:Hermetic){
  fs.mkdirSync(path.join(h.project,'.talos-cli'),{recursive:true});
  fs.writeFileSync(path.join(h.project,'.talos-cli','config.json'),JSON.stringify({version:1,model:'openrouter:planted/by-the-folder'})+'\n');
  return async()=>{
    const b=bench(h);b.ctx.repoRoot=path.resolve(import.meta.dirname,'..','..','..');
    const out=path.join(path.dirname(h.project),`diagnostic-${Date.now()}.zip`);
    assert.equal(await runSystemCommand(b.ctx,'diagnostic',['bundle','--out',out]),0,b.err());
    const bytes=fs.readFileSync(out).toString('latin1');
    assert.match(bytes,/config\.json/u,'the bundle has its config.json');
    return{bytes,err:b.err()};
  };
}
test('LINEA-3 v1597 (d) diagnostic bundle: in a folder nobody decided its config.json leaves out the model the folder planted',{timeout:120_000},async()=>hermetic(async h=>{
  const {bytes}=await (await bundleBytes(h))();
  assert.doesNotMatch(bytes,/planted\/by-the-folder/u,'the bundle read the settings of a folder nobody trusted');
}));
test('LINEA-3 v1597 (d) diagnostic bundle INVALIDATED: a folder whose trust changed is left out too',{timeout:120_000},async()=>hermetic(async h=>{
  await invalidated(h);
  const b=bench(h);b.ctx.repoRoot=path.resolve(import.meta.dirname,'..','..','..');
  const out=path.join(path.dirname(h.project),'diagnostic-invalidated.zip');
  assert.equal(await runSystemCommand(b.ctx,'diagnostic',['bundle','--out',out]),0,b.err());
  assert.doesNotMatch(fs.readFileSync(out).toString('latin1'),/changed\/after-trust|planted\/by-the-folder/u);
}));
test('LINEA-3 v1597 (d) diagnostic bundle AL CONTRARIO: in a decided folder the folder\'s model is in the bundle',{timeout:120_000},async()=>hermetic(async h=>{
  const run=await bundleBytes(h);await decide(h);
  const {bytes}=await run();
  assert.match(bytes,/planted\/by-the-folder/u,'the bench cannot see a model in the bundle at all');
}));
