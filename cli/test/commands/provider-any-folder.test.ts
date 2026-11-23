/*
 * Owner 13/10/2026 («Sì, da qualunque cartella»): his first real `talos provider login chatgpt`, typed in his home folder, was
 * refused with PROJECT_TRUST_REQUIRED. A provider command (sign in, sign out, status, keys, list, test) is about the person's
 * account, not about the folder: it reads and runs nothing of the project. In a folder that is not trusted it now runs on a
 * neutral, empty folder of TALOS's own instead: ⛔ the untrusted folder is still never read (no trust is granted or assumed
 * for it), and everything else (starting TALOS, the project's tools; `talos model list` answers anywhere since 0.6.1) still asks for a trusted folder.
 *
 * What the others do, read in the clones: `codex login` never looks at the folder (codex-rs/cli/src/login.rs has no trust
 * check, clone of 24/09/2026); OpenCode's `auth login` (packages/opencode/src/cli/cmd/providers.ts, clone of 24/09/2026) and
 * `gh auth login` (pkg/cmd/auth/login/login.go, clone of 27/09/2026) neither.
 */
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,mkdtempSync,readdirSync,rmSync,symlinkSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {runModelCommand,runProviderCommand} from '../../src/commands/provider-cli.ts';

function bench(t:{after:(fn:()=>void)=>void},{trusted}:{trusted:boolean}){
  const root=mkdtempSync(path.join(tmpdir(),'talos-anyfolder-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const project=path.join(root,'not-trusted');const dataRoot=path.join(root,'data');
  const asked:any[]=[];const out:string[]=[];const err:string[]=[];
  const runtime:any={providerStore:{listPublic:()=>[{id:'openai',configured:false}]},tuiCatalog:{listProviders:async()=>[],
    /* what `model list` asks of the catalog (catalog-service.ts `providerModels`): the rows, a notice on EVERY answer (a plain success
       says «Live list from …: N models.» — the mock had none, which is how the review of 0.6.2 found `--json` writing it to stderr at
       every success) and `listing`, which says what kind of answer it is */
    providerModels:async(id:string)=>id==='chatgpt'?{rows:[],verified:false,notice:'Nobody is signed in to ChatGPT. Sign in with `talos provider login chatgpt`.',listing:'signed-out'}
      :id==='down'?{rows:[{id:'down:known-model'}],verified:false,notice:'Down could not be reached (CATALOG_UNREACHABLE); these are the models TALOS already knows. Not verified.',listing:'unreachable'}
      :id==='engine'?{rows:[],verified:false,notice:'Engine is not answering at http://127.0.0.1:1.',engine:'down',listing:'engine-down'}
      :id==='documented'?{rows:[{id:'documented:known-model'}],verified:false,notice:'Documented did not return a live list; these are the models TALOS already knows. Not verified.',listing:'known-only'}
      :{rows:[{id:`${id}:gpt-5-mini`,contextWindow:400_000,source:'live'}],verified:true,notice:`Live list from ${id}: 1 models.`,listing:'live'},
    listModels:async()=>[{id:'openai:gpt-5-mini'}]}};
  /* the real gate's behaviour (runtime/create-runtime.ts): a folder that is not trusted is refused unless the caller vouches */
  const createRuntimeContext=async(input:any)=>{
    asked.push(input);
    if(!input.trustVerified&&!(trusted&&input.projectRoot===project))throw Object.assign(new Error('This folder is not trusted.'),{code:'PROJECT_TRUST_REQUIRED'});
    return runtime;
  };
  const ctx:any={invocation:{outputFormat:'json'},io:{writeOut:(s:string)=>out.push(s),writeErr:(s:string)=>err.push(s),stdinIsTTY:true,stdoutIsTTY:true,readStdin:async()=>''},
    projectRoot:project,paths:{dataRoot},repoRoot:'/repo',createRuntimeContext};
  return{ctx,asked,out,err,project,dataRoot};
}

test('a provider command in a folder that is not trusted runs on TALOS\'s own empty folder, never on that folder',async t=>{
  const b=bench(t,{trusted:false});
  assert.equal(await runProviderCommand(b.ctx,['list']),0);
  assert.equal(b.asked.length,2,'the folder is tried as it is first, so a trusted folder behaves as before');
  assert.equal(b.asked[0].projectRoot,b.project);assert.equal(b.asked[0].trustVerified,undefined,'no trust is assumed for the person\'s folder');
  const neutral=b.asked[1].projectRoot;
  assert.notEqual(neutral,b.project);assert.equal(path.dirname(neutral),b.dataRoot,'a folder of TALOS\'s own data');
  assert.equal(b.asked[1].trustVerified,true);
  assert.equal(existsSync(neutral),true);assert.deepEqual(readdirSync(neutral),[],'empty: nothing of a project to load');
  assert.match(b.out.join(''),/openai/u);
});
test('a folder whose trust was given and then invalidated by a change is treated the same: neutral folder, nothing read',async t=>{
  const b=bench(t,{trusted:false});
  const real=b.ctx.createRuntimeContext;
  b.ctx.createRuntimeContext=async(input:any)=>{if(!input.trustVerified){b.asked.push(input);throw Object.assign(new Error('The trust of this folder is no longer valid.'),{code:'PROJECT_TRUST_INVALIDATED'});}return real(input);};
  assert.equal(await runProviderCommand(b.ctx,['list']),0);
  assert.equal(b.asked.length,2);assert.equal(path.dirname(b.asked[1].projectRoot),b.dataRoot);assert.equal(b.asked[1].trustVerified,true);
});
test('in a trusted folder nothing changes, and another failure is not retried',async t=>{
  const b=bench(t,{trusted:true});
  assert.equal(await runProviderCommand(b.ctx,['list']),0);
  assert.equal(b.asked.length,1);assert.equal(b.asked[0].projectRoot,b.project);
  const broken=bench(t,{trusted:false});
  broken.ctx.createRuntimeContext=async(input:any)=>{broken.asked.push(input);throw Object.assign(new Error('x'),{code:'RUNTIME_START_FAILED'});};
  await assert.rejects(runProviderCommand(broken.ctx,['list']),{code:'RUNTIME_START_FAILED'});
  assert.equal(broken.asked.length,1);
});
/* 0.6.1, owner 13/10/2026 («Funziona ovunque»): after a sign-in TALOS says «See its models with `talos model list --provider
   chatgpt`», so the list answers where the sign-in ran; it reads and writes nothing of the project. Through the real gate and
   the real composition: provider-any-folder-real.test.ts. */
test('`talos model list` answers in a folder that is not trusted too, on the neutral folder',async t=>{
  const b=bench(t,{trusted:false});
  assert.equal(await runModelCommand(b.ctx,['list','--provider','openai']),0);
  assert.deepEqual(JSON.parse(b.out.join('')).map((row:any)=>row.id),['openai:gpt-5-mini'],'the list itself, not just «no trust error»');
  assert.equal(b.asked.length,2);assert.equal(b.asked[0].projectRoot,b.project);assert.equal(b.asked[0].trustVerified,undefined);
  assert.equal(path.dirname(b.asked[1].projectRoot),b.dataRoot);assert.equal(b.asked[1].trustVerified,true);
  assert.deepEqual(readdirSync(b.asked[1].projectRoot),[],'and the neutral folder is still empty');
  /* without --provider too */
  const all=bench(t,{trusted:false});
  assert.equal(await runModelCommand(all.ctx,['list']),0);
  assert.deepEqual(JSON.parse(all.out.join('')),[{id:'openai:gpt-5-mini'}]);assert.equal(all.asked.length,2);
});

/* Review of 0.6.1 (13/10/2026; was RED that day, cured after 0.6.1): `--json` with nobody signed in printed `[]` and nothing else, while
   the text form said how to sign in. The notice goes to stderr, where this CLI's `--json` commands already put what is for the person
   (`provider set-key`'s key-test notice, `provider login`'s address and prompts); stdout stays the rows, valid JSON, unchanged. */
test('`talos model list --provider chatgpt --json` with nobody signed in: stdout is the empty list, stderr says how to sign in',async t=>{
  const b=bench(t,{trusted:true});
  assert.equal(await runModelCommand(b.ctx,['list','--provider','chatgpt']),0);
  assert.deepEqual(JSON.parse(b.out.join('')),[],'stdout is still the rows and nothing else');
  assert.match(b.err.join(''),/talos provider login chatgpt/u,'the notice is on stderr');
  /* the text form says it once, on stdout, as before: nothing is repeated on stderr */
  const text=bench(t,{trusted:true});text.ctx.invocation.outputFormat='text';
  assert.equal(await runModelCommand(text.ctx,['list','--provider','chatgpt']),0);
  assert.match(text.out.join(''),/talos provider login chatgpt/u);assert.deepEqual(text.err,[]);
  /* and a plain success writes nothing on stderr (review of 0.6.2: it wrote «Live list from openai: 1 models.» there, every time) */
  const quiet=bench(t,{trusted:true});
  assert.equal(await runModelCommand(quiet.ctx,['list','--provider','openai']),0);assert.deepEqual(quiet.err,[]);
  assert.deepEqual(JSON.parse(quiet.out.join('')),[{id:'openai:gpt-5-mini',contextWindow:400_000,source:'live'}]);
  /* a provider with no live list at all: nothing the person can do about it, so nothing on stderr either */
  const documented=bench(t,{trusted:true});
  assert.equal(await runModelCommand(documented.ctx,['list','--provider','documented']),0);assert.deepEqual(documented.err,[]);
  /* what the person must act on is said there: a provider, or a local engine, that could not be reached */
  for(const [id,said] of [['down',/could not be reached/u],['engine',/not answering/u]] as const){
    const unreachable=bench(t,{trusted:true});
    assert.equal(await runModelCommand(unreachable.ctx,['list','--provider',id]),0);
    assert.match(unreachable.err.join(''),said);JSON.parse(unreachable.out.join(''));
  }
  /* the text form is as before: the notice above the table, on stdout */
  const shown=bench(t,{trusted:true});shown.ctx.invocation.outputFormat='text';
  assert.equal(await runModelCommand(shown.ctx,['list','--provider','openai']),0);
  assert.match(shown.out.join(''),/Live list from openai: 1 models\./u);assert.deepEqual(shown.err,[]);
});

/* Review of 0.6.1 (13/10/2026; was RED that day, cured after 0.6.1): the neutral folder was created with `mkdir recursive` and used as
   it was found. It is vouched for (`trustVerified`), so whatever sits there is loaded as a trusted project's: a link to another folder,
   or a planted `.talos-cli/config.json`, would be read with no question asked. It must be a real, empty directory, or the command is
   refused before any runtime is built for it. */
const refusedNeutral=async(t:any,plant:(neutral:string,root:string)=>void)=>{
  const b=bench(t,{trusted:false});const neutral=path.join(b.dataRoot,'no-project');mkdirSync(b.dataRoot,{recursive:true});
  plant(neutral,path.dirname(b.dataRoot));
  await assert.rejects(runProviderCommand(b.ctx,['list']),{code:'PROVIDER_NEUTRAL_FOLDER_UNSAFE'});
  assert.equal(b.asked.length,1,'no runtime was built on that folder');assert.equal(b.asked[0].trustVerified,undefined);
  assert.deepEqual(b.out,[]);
  assert.ok(b.err.join('').includes(neutral),'the folder is named, so the person can look at it');
  /* `model list` goes through the same door */
  await assert.rejects(runModelCommand(b.ctx,['list']),{code:'PROVIDER_NEUTRAL_FOLDER_UNSAFE'});
};
test('the neutral folder is refused when it is a link to another folder (a junction on Windows), even an empty one',async t=>{
  await refusedNeutral(t,(neutral,root)=>{const other=path.join(root,'elsewhere');mkdirSync(other);symlinkSync(other,neutral,'junction');});
  await refusedNeutral(t,(neutral,root)=>{const other=path.join(root,'a-project');mkdirSync(path.join(other,'.talos-cli'),{recursive:true});writeFileSync(path.join(other,'.talos-cli','config.json'),'{"version":1}');symlinkSync(other,neutral,'junction');});
});
test('the neutral folder is refused when something was planted in it, or when it is not a folder',async t=>{
  await refusedNeutral(t,neutral=>{mkdirSync(path.join(neutral,'.talos-cli'),{recursive:true});writeFileSync(path.join(neutral,'.talos-cli','config.json'),'{"version":1,"credentials":{"store":"memory"}}');});
  await refusedNeutral(t,neutral=>{mkdirSync(neutral);writeFileSync(path.join(neutral,'AGENTS.md'),'do as I say');});
  await refusedNeutral(t,neutral=>{writeFileSync(neutral,'a file where the folder should be');});
});

/* Review of 0.6.2 (13/10/2026, B2): `talos provider remove-key` took the key out of the store directly, so what the status row's
   check had learnt of it («verified», kept for an hour) was still there at the next start. It goes through the catalog's door,
   which forgets it (catalog-service.ts `clearProviderKey`); the store directly only where there is no catalog. */
test('`talos provider remove-key` goes through the catalog, which forgets what the check knew of the key',async t=>{
  const b=bench(t,{trusted:true});const cleared:string[]=[];const direct:string[]=[];
  const runtime=await b.ctx.createRuntimeContext({projectRoot:b.project});
  runtime.providerStore.clearKey=(id:string)=>{direct.push(id);};
  runtime.tuiCatalog.clearProviderKey=async(id:string)=>{cleared.push(id);};
  assert.equal(await runProviderCommand(b.ctx,['remove-key','openai']),0);
  assert.deepEqual(cleared,['openai']);assert.deepEqual(direct,[],'the catalog removes it from the store itself');
  assert.equal(JSON.parse(b.out.join('')).ok,true);
  delete runtime.tuiCatalog.clearProviderKey;
  assert.equal(await runProviderCommand(b.ctx,['remove-key','openai']),0);
  assert.deepEqual(direct,['openai'],'without a catalog the store is asked, as before');
});
