/*
 * R4 lane F — trust for every new folder (owner decisions Q-R4-1 and Q-R4-3; gate E1-E3; s01 D-09, R4-TRUST).
 * - Every folder without a saved decision is asked once, with or without project files; the decision is saved per folder.
 * - "Trust the parent folder" saves the decision for the parent, and every folder under it is decided.
 * - The home folder and a drive root count for the session only: nothing is ever saved for them, and a record found there
 *   (written before R4) never decides the folders below.
 * - The resource snapshot rule is untouched: files that appear or change are still asked about, in a decided folder too.
 * - Headless runs never ask: a folder with no project files runs, a folder with untrusted files is refused (E3).
 */
import assert from 'node:assert/strict';
import {access,mkdir,mkdtemp,readdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join,parse} from 'node:path';
import test,{after} from 'node:test';
import {runProjectCommand} from '../../src/commands/project-cli.ts';
import {assessProjectTrust,assertProjectTrusted,needsTrustQuestion,projectTrustFailure,trustProjectAssessment} from '../../src/security/project-trust-gate.ts';
import {createTrustAuthority,isSessionOnlyFolder} from '../../src/security/trust-authority.ts';

const roots:string[]=[];
after(async()=>{for(const root of roots)await rm(root,{recursive:true,force:true});});
async function layout(prefix='r4-f-trust-'){
  const parent=await mkdtemp(join(tmpdir(),prefix));roots.push(parent);
  const area=join(parent,'area');const projectRoot=join(area,'project');const sibling=join(area,'sibling');const trustRoot=join(parent,'trust');
  await mkdir(projectRoot,{recursive:true});await mkdir(sibling,{recursive:true});
  return{parent,area,projectRoot,sibling,trustRoot};
}
async function exists(pathname:string){try{await access(pathname);return true;}catch{return false;}}
function io(){const out:string[]=[];return{out,api:{writeOut:(s:string)=>out.push(s),writeErr(){},stdinIsTTY:false,stdoutIsTTY:false,readStdin:async()=>''}};}
function context(projectRoot:string,trustRoot:string,format:'json'|'text'='json'){const x=io();return{x,ctx:{invocation:{outputFormat:format},io:x.api,projectRoot,repoRoot:projectRoot,paths:{trust:{projects:trustRoot}},createRuntimeContext:async()=>{throw new Error('runtime must not start');}} as any};}

test('Q-R4-1: a plain folder is not decided, so the question is asked; -p refuses it until it is decided (one line, step 3)',async()=>{
  const f=await layout();
  const assessment=await assessProjectTrust({projectRoot:f.projectRoot,trustRoot:f.trustRoot});
  assert.equal(assessment.trusted,true,'no project file is untrusted: headless and the runtime behave as before');
  assert.equal(assessment.reason,'NO_PROJECT_RESOURCES');
  const {parent,...decision}=assessment.folder??{} as any;
  assert.deepEqual(decision,{decided:false,source:null,path:null,sessionOnly:false});
  assert.equal(parse(parent??'').base,'area','the parent folder may be trusted instead (Q-R4-2)');
  assert.equal(needsTrustQuestion(assessment),true,'an interactive start asks');
  /* «One line», step 3 (11/11/2026, brief point b, PC cure «never asked is not trusted»): -p cannot ask, so a folder never decided is refused */
  await assert.rejects(()=>assertProjectTrusted({projectRoot:f.projectRoot,trustRoot:f.trustRoot}),(error:any)=>error?.code==='PROJECT_TRUST_REQUIRED'&&/talos project trust/u.test(error.message),'-p never asks, so it does not run in a folder nobody decided');
});

test('Q-R4-1: "Trust this folder" saves the decision for a plain folder, and the next start is not asked',async()=>{
  const f=await layout();
  const before=await assessProjectTrust({projectRoot:f.projectRoot,trustRoot:f.trustRoot});
  const granted=await trustProjectAssessment({assessment:before,trustRoot:f.trustRoot,nestedRepositories:[]});
  assert.equal(granted.folder?.decided,true);
  const after=await assessProjectTrust({projectRoot:f.projectRoot,trustRoot:f.trustRoot});
  assert.equal(after.folder?.decided,true);assert.equal(after.folder?.source,'folder');
  assert.equal(needsTrustQuestion(after),false);
  const sibling=await assessProjectTrust({projectRoot:f.sibling,trustRoot:f.trustRoot});
  assert.equal(sibling.folder?.decided,false,'trusting a folder decides nothing for its neighbour');
});

test('Q-R4-2: "Trust the parent folder" decides every folder under the parent; the current files are trusted too',async()=>{
  const f=await layout();
  await writeFile(join(f.projectRoot,'AGENTS.md'),'Always answer in English.\n');
  const before=await assessProjectTrust({projectRoot:f.projectRoot,trustRoot:f.trustRoot});
  assert.equal(before.trusted,false);
  await trustProjectAssessment({assessment:before,trustRoot:f.trustRoot,nestedRepositories:[],folder:'parent'});
  const project=await assessProjectTrust({projectRoot:f.projectRoot,trustRoot:f.trustRoot});
  assert.equal(project.trusted,true,'the AGENTS.md the person saw in the question is trusted');
  assert.equal(needsTrustQuestion(project),false);
  const sibling=await assessProjectTrust({projectRoot:f.sibling,trustRoot:f.trustRoot});
  assert.equal(sibling.folder?.decided,true);assert.equal(sibling.folder?.source,'parent');
  assert.equal(parse(sibling.folder!.path!).base,'area');
  assert.equal(needsTrustQuestion(sibling),false);
  await writeFile(join(f.sibling,'AGENTS.md'),'new rules\n');
  const changed=await assessProjectTrust({projectRoot:f.sibling,trustRoot:f.trustRoot});
  assert.equal(changed.trusted,false,'files in a decided folder are still asked about (snapshot rule untouched)');
  assert.equal(needsTrustQuestion(changed),true);
});

test('Q-R4-1: the home folder and drive roots count for the session only; nothing is saved and nothing is inherited from them',async()=>{
  const f=await layout();
  assert.equal(isSessionOnlyFolder(parse(f.projectRoot).root,{home:f.area}),true,'a drive root');
  assert.equal(isSessionOnlyFolder(f.area,{home:f.area}),true,'the home folder');
  assert.equal(isSessionOnlyFolder(f.projectRoot,{home:f.area}),false);
  const home=createTrustAuthority({projectRoot:f.area,trustRoot:f.trustRoot,homeDir:f.area});
  assert.deepEqual(await home.folderDecision(),{decided:false,source:null,path:null,sessionOnly:true,parent:null});
  await assert.rejects(()=>home.trustProject({folder:'this'}),(error:any)=>error?.code==='PROJECT_TRUST_REQUIRED','the home folder is never saved');
  assert.equal(await exists(join(f.trustRoot,'folders')),false,'nothing was written');
  const child=createTrustAuthority({projectRoot:f.projectRoot,trustRoot:f.trustRoot,homeDir:f.area});
  await assert.rejects(()=>child.trustProject({folder:'parent'}),(error:any)=>error?.code==='PROJECT_TRUST_REQUIRED','the parent is the home folder: not offered, never saved');
  /* A record for the home folder written before R4 decides nothing below it. */
  const planted=createTrustAuthority({projectRoot:f.area,trustRoot:f.trustRoot,homeDir:join(f.parent,'elsewhere')});
  await planted.trustProject({folder:'this'});
  assert.equal((await child.folderDecision()).decided,false,'a saved home folder never decides the folders under it');
  assert.equal((await createTrustAuthority({projectRoot:f.projectRoot,trustRoot:f.trustRoot,homeDir:join(f.parent,'elsewhere')}).folderDecision()).source,'parent','control: the same record decides them when that folder is not the home folder');
});

test('Q-R4-3: cancelling the question for a plain folder is PROJECT_TRUST_REQUIRED, not a changed snapshot',async()=>{
  const f=await layout();
  const failure:any=projectTrustFailure(await assessProjectTrust({projectRoot:f.projectRoot,trustRoot:f.trustRoot}));
  assert.equal(failure.code,'PROJECT_TRUST_REQUIRED');
  assert.doesNotMatch(failure.message,/snapshot changed|NO_PROJECT_RESOURCES/u);
});

test('E2: talos project trust / status / revoke save, show and remove the folder decision of a plain folder',async()=>{
  const f=await layout();const {x,ctx}=context(f.projectRoot,f.trustRoot);
  assert.equal(await runProjectCommand(ctx,['status']),0);
  assert.deepEqual(JSON.parse(x.out.pop()!).folder,{decided:false,source:null,path:null,sessionOnly:false});
  assert.equal(await runProjectCommand(ctx,['trust']),0);
  assert.equal(JSON.parse(x.out.pop()!).folder.decided,true,'a plain folder is saved, not reported as "already trusted"');
  assert.equal((await assessProjectTrust({projectRoot:f.projectRoot,trustRoot:f.trustRoot})).folder?.decided,true);
  assert.equal(await runProjectCommand(ctx,['revoke']),0);
  assert.equal(JSON.parse(x.out.pop()!).folder.decided,false);
  assert.deepEqual(await readdir(join(f.trustRoot,'folders')),[],'the folder record is gone');
});

test('Q-R4-1: talos project trust in the home folder saves nothing and says the question is asked at every start',async()=>{
  const f=await layout();const {x,ctx}=context(f.area,f.trustRoot,'text');
  assert.equal(await runProjectCommand(ctx,['trust'],{homeDir:f.area}),0);
  assert.match(x.out.join(''),/every start/u);
  assert.equal(await exists(join(f.trustRoot,'folders')),false);
  assert.equal(await exists(dirname(f.trustRoot)),true);
});
