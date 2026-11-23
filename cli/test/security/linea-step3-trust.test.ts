/*
 * «One line», step 3 (11/11/2026). Two trust rules of the PC the terminal receives.
 *
 * b (brief point b; PC: «never asked is not trusted», harness-ui/tests/fiducia-cartella-mai-chiesta.test.mjs on c707d057a): `talos -p`
 *   cannot ask, so in an empty folder nobody decided it stops with PROJECT_TRUST_REQUIRED, starts no runtime (0 requests to any
 *   provider) and says `talos project trust`.
 * v1483 + owner decision 11/11 16:35 (judge v1499 point 2): a drive root, the home folder AND every folder above the home folder are
 *   never a saved trust target; a record already on disk for one of them decides nothing. Today's terminal does it for the root and
 *   the home folder (`trust-authority.ts:170-173`, `:180`, `:192-200`), not for the folders above the home folder.
 */
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test,{after} from 'node:test';
import {main} from '../../src/main.ts';
import {assertProjectTrusted} from '../../src/security/project-trust-gate.ts';
import {createTrustAuthority,isSessionOnlyFolder} from '../../src/security/trust-authority.ts';

const roots:string[]=[];
after(async()=>{for(const root of roots)await rm(root,{recursive:true,force:true});});
async function scratch(prefix:string){const dir=await mkdtemp(join(tmpdir(),prefix));roots.push(dir);return dir;}
function io(){return{stdout:'',stderr:'',writeOut(s:string){this.stdout+=s;},writeErr(s:string){this.stderr+=s;},stdinIsTTY:false,stdoutIsTTY:false,readStdin:async()=>''};}

for(const format of ['json','text'] as const){
  test(`LINEA-3 b (${format}): talos -p in an empty folder nobody decided stops with PROJECT_TRUST_REQUIRED, starts nothing, says talos project trust`,async()=>{
    const project=await scratch('talos-linea3-p-');
    let runtimes=0;const out=io();
    const code=await main(['--project',project,'-p','hi',...(format==='json'?['--json']:[])],{io:out,assertProjectTrusted,createRuntime:async()=>{runtimes++;throw new Error('must not start');},runTui:async()=>{}} as any);
    assert.notEqual(code,0,'a refused start exits with an error code');
    assert.equal(runtimes,0,'no runtime, so no request to any provider');
    const text=out.stdout+out.stderr;
    if(format==='json')assert.equal(JSON.parse(out.stdout).error.code,'PROJECT_TRUST_REQUIRED');
    assert.match(text,/talos project trust/u,text);
  });
}

test('LINEA-3 b: once the folder is decided (talos project trust), -p is let through',async()=>{
  const parent=await scratch('talos-linea3-decided-');const project=join(parent,'project');const trustRoot=join(parent,'trust');
  await mkdir(project,{recursive:true});
  await createTrustAuthority({projectRoot:project,trustRoot,homeDir:join(parent,'home')}).trustProject();
  await assert.doesNotReject(()=>assertProjectTrusted({projectRoot:project,trustRoot}));
});

test('LINEA-3 v1483: a folder above the home folder is session-only like the home folder; a name that only starts like the home folder is not',async()=>{
  const parent=await scratch('talos-linea3-above-');const area=join(parent,'area');const home=join(area,'home');
  await mkdir(home,{recursive:true});
  assert.equal(isSessionOnlyFolder(home,{home}),true);
  assert.equal(isSessionOnlyFolder(area,{home}),true,'the folder that holds the home folder');
  assert.equal(isSessionOnlyFolder(parent,{home}),true,'two levels above the home folder');
  assert.equal(isSessionOnlyFolder(`${home}x`,{home}),false,'a sibling whose name starts like the home folder');
  assert.equal(isSessionOnlyFolder(join(home,'project'),{home}),false,'a folder inside the home folder');
  /* mutant b3 of step 3 (above-home by text prefix) lived: a sibling whose name is the START of the home folder's name */
  assert.equal(isSessionOnlyFolder(join(area,'ho'),{home}),false,'a sibling whose name is a text prefix of the home folder\'s');
});

test('LINEA-3 v1483: a record already on disk for a folder above the home folder decides nothing, and «trust the parent» never saves it',async()=>{
  const parent=await scratch('talos-linea3-record-');const area=join(parent,'area');const home=join(area,'home');const other=join(area,'other');const project=join(home,'project');const trustRoot=join(parent,'trust');
  for(const dir of [home,other,project])await mkdir(dir,{recursive:true});
  /* a record written for `area` by a run whose home folder was elsewhere (an older TALOS, another account) */
  await createTrustAuthority({projectRoot:area,trustRoot,homeDir:join(parent,'elsewhere')}).trustProject();
  const below=createTrustAuthority({projectRoot:project,trustRoot,homeDir:home});
  const decision=await below.folderDecision();
  assert.equal(decision.decided,false,`a record above the home folder decided ${decision.path}`);
  assert.equal(await below.folderTrusted(),false);
  const sibling=createTrustAuthority({projectRoot:other,trustRoot,homeDir:home});
  await assert.rejects(()=>sibling.trustProject({folder:'parent'}),(error:any)=>error?.code==='PROJECT_TRUST_REQUIRED','«trust the parent» would save the folder that holds the home folder');
  const self=createTrustAuthority({projectRoot:area,trustRoot,homeDir:home});
  assert.equal((await self.folderDecision()).sessionOnly,true);
});
