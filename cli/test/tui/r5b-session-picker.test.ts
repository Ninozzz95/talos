/*
 * R5b D2 (owner decision Q-R5-12: "/rename; richer resume picker with the branch tree"). A session can be named (kept in the
 * CLI's session metadata, beside tags and pins: the kernel has no rename); the /resume and /fork picker rows say the name,
 * how long ago, how many turns and the model, and a fork is drawn under the conversation it came from with ⑂.
 */
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test,{after} from 'node:test';
import {createSessionMetadataStore} from '../../src/sessions/metadata-store.ts';
import {sessionAge,sessionPickerOverlay,sessionTree,type TuiSessionSummary} from '../../src/tui/overlays/session-picker.ts';
import {hermeticProfile} from './r1-layout-fixture.ts';
import {mountR5a} from './r5a-s-fixture.ts';

const env=hermeticProfile();after(()=>env.restore());
const NOW=Date.parse('2026-09-25T12:00:00Z');
function row(id:string,over:Partial<TuiSessionSummary>={}):TuiSessionSummary{
  return{id,sessionId:id,name:null,project:'C:/p/demo',path:null,model:'openai:gpt-5-mini',parentId:null,depth:0,delegatedTask:null,forkedFrom:null,startedAt:null,updatedAt:'2026-09-25T10:00:00Z',endedAt:null,outcome:'completed',interrupted:false,usage:{promptTokens:null,completionTokens:null,cachedTokens:null,turns:5,executions:null},approvalWait:null,collisions:[],delegationOutcome:null,delegationEvidence:null,title:id,tags:[],pinned:false,...over} as TuiSessionSummary;
}

test('R5b: a session name is kept in the metadata, validated, and can be cleared',async t=>{
  const root=await mkdtemp(join(tmpdir(),'r5b-name-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const store:any=createSessionMetadataStore({rootDir:root});
  assert.equal((await store.setName('s1','  Big refactor  ')).name,'Big refactor');
  assert.equal((await store.get('s1')).name,'Big refactor');
  await assert.rejects(store.setName('s1','x'.repeat(81)),{code:'SESSION_METADATA_INVALID'});
  await assert.rejects(store.setName('s1','bad\u0007name'),{code:'SESSION_METADATA_INVALID'});
  assert.equal((await store.setName('s1',null)).name,undefined);
});

test('R5b: ages read as a person says them',()=>{
  assert.equal(sessionAge('2026-09-25T11:59:40Z',NOW),'just now');
  assert.equal(sessionAge('2026-09-25T11:45:00Z',NOW),'15 min ago');
  assert.equal(sessionAge('2026-09-25T10:00:00Z',NOW),'2 h ago');
  assert.equal(sessionAge('2026-09-22T12:00:00Z',NOW),'3 d ago');
  assert.equal(sessionAge('2026-08-01T12:00:00Z',NOW),'2026-08-01');
  assert.equal(sessionAge(null,NOW),'');
});

test('R5b: forks are drawn under the conversation they came from, with ⑂; the rest keep their order',()=>{
  const rows=[row('b',{updatedAt:'2026-09-25T11:00:00Z'}),row('c',{forkedFrom:'a',updatedAt:'2026-09-25T11:30:00Z'}),row('a',{updatedAt:'2026-09-25T09:00:00Z'})];
  const tree=sessionTree(rows);
  assert.deepEqual(tree.map(r=>[r.id,r.forkDepth]),[['b',0],['a',0],['c',1]]);
  const overlay=sessionPickerOverlay({action:'resume',query:'',rows:tree,selected:0,now:NOW});
  const text=overlay.sections[0]!.lines.map(l=>l.text);
  assert.match(text[0]!,/b · 1 h ago · 5 turns · openai:gpt-5-mini/u);
  assert.match(text[2]!,/^\s+⑂ c · 30 min ago/u,text.join('\n'));
  assert.doesNotMatch(text.join('\n'),/C:\/p\/demo/u,'the long path is not repeated on every row');
});

test('R5b /rename: the current session gets a name the picker shows',async()=>{
  const history=[{type:'run.started',data:{runId:'r0',input:{prompt:'hello'}}},{type:'run.completed',data:{runId:'r0'}}];
  const app=await mountR5a({cols:120,rows:40,root:env.root,paths:env.paths,history});
  try{
    await app.waitFor('the session attached',s=>s.text.includes('hello'));
    await app.type('/rename Big refactor');app.press('\r');
    await app.waitFor('the rename said',s=>/Renamed this conversation to "Big refactor"/u.test(s.text));
    const {sessionMetadataRoot}=await import('../../src/sessions/metadata-store.ts');
    const store:any=createSessionMetadataStore({rootDir:sessionMetadataRoot(env.paths.dataRoot)});
    assert.equal((await store.get('s1'))?.name,'Big refactor');
  }finally{app.unmount();}
});

test('R5b: talos session rename names a session, and session list shows the name',async t=>{
  const {runSessionCommand}=await import('../../src/commands/session-cli.ts');
  const root=await mkdtemp(join(tmpdir(),'r5b-rename-cli-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const out:string[]=[];
  const registry={ripristina:async()=>({}),elenca:()=>[{sessionId:'s1',conclusa:true,nome:'kernel name'}]};
  const ctx={invocation:{outputFormat:'json'},io:{writeOut:(x:string)=>out.push(x),writeErr(){},stdinIsTTY:false,stdoutIsTTY:false,readStdin:async()=>''},projectRoot:root,paths:{dataRoot:join(root,'data'),sessionsRoot:join(root,'sessions')},repoRoot:root,createRuntimeContext:async()=>({registry,runtime:{}})} as any;
  assert.equal(await runSessionCommand(ctx,['rename','s1','Big','refactor']),0);
  assert.equal(JSON.parse(out.at(-1)!).name,'Big refactor');
  await runSessionCommand(ctx,['list']);
  assert.equal(JSON.parse(out.at(-1)!)[0].name,'Big refactor');
});

/* Found by acceptance s09 (2026-09-25): the count said "1 turns". One turn is "1 turn". */
test('R5b: one turn is "1 turn", more are "N turns"',()=>{
  const one=sessionPickerOverlay({action:'resume',query:'',rows:sessionTree([row('solo',{usage:{turns:1}} as any)]),selected:0,now:NOW}).sections[0]!.lines[0]!.text;
  assert.match(one,/ · 1 turn · /u);assert.doesNotMatch(one,/1 turns/u);
});
