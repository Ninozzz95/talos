/*
 * Stages 7.6/7.8 (owner 03/10 «taglio prima + messaggio nel composer», «foglio intero, conversazione via fork»; desktop
 * 88c68695c): when the kernel says it can cut (`capacita.forkPrimaDelGiro`), /fork lists every message of yours and an earlier
 * one starts a new conversation just before it, its words back in the composer; /undo's Enter (code and conversation) and c
 * (conversation only) go back the same way, Enter first putting the files back. The conversation of now stays in /resume.
 * A refusal says why and leaves you where you were. Mount: the REAL TuiApp (r5a-s-fixture.ts), a temp profile, no network.
 */
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import test,{after} from 'node:test';
import {hermeticProfile,sleep} from './r1-layout-fixture.ts';
import {mountR5a} from './r5a-s-fixture.ts';
import {createCheckpointStore} from '../../src/workspace/checkpoint-store.ts';
import {createSessionMetadataStore,sessionMetadataRoot} from '../../src/sessions/metadata-store.ts';
import {CliRuntimeError} from '../../src/runtime/types.ts';

process.env.FORCE_COLOR='3';
const env=hermeticProfile();after(()=>env.restore());
const ENTER='\r',DOWN='\x1b[B';
let n=0;const project=()=>{const root=join(env.root,`fork-cut-${++n}`);mkdirSync(root,{recursive:true});return root;};
const turns=(...prompts:string[])=>prompts.map((prompt,i)=>({type:'RunStarted',runId:`r${i+1}`,input:{prompt}}));
const composerHas=(text:string,needle:string)=>text.split('\n').some(line=>line.includes('› '+needle));

function cutting(answer:(id:string,runId:string)=>Promise<any>){
  const cuts:string[][]=[];const resumed:string[]=[];
  return{cuts,resumed,extra:{
    capabilities:()=>({forkBeforeRun:true}),
    forkBeforeRun:async(id:string,runId:string)=>{cuts.push([id,runId]);return answer(id,runId);},
    subscribe:(id:string)=>{resumed.push(id);return()=>{};},
  }};
}

test('stage 7.6 /fork with the cut: an earlier message starts a new conversation before it, its words in the composer',async()=>{
  const root=project();const store=createSessionMetadataStore({rootDir:sessionMetadataRoot(env.paths.dataRoot)});
  await store.setName('s1','Flaky login test');
  const k=cutting(async()=>({sessionId:'s-cut',message:'Show me how sessions are refreshed',attachments:[{tipo:'immagine',nome:'a.png'}]}));
  const app=await mountR5a({cols:120,rows:40,root,paths:env.paths,runtimeExtra:{...k.extra,
    export:(id:string)=>({sessionId:id,eventi:turns('Show me how sessions are refreshed','The login e2e test is flaky. Find out why and fix it.')})}});
  try{
    await app.type('/fork');app.press(ENTER);
    let s=await app.waitFor('the sheet',x=>/── Fork from a message/u.test(x.text)&&/1 back/u.test(x.text));
    assert.match(s.text,/latest/u);
    app.press(DOWN);
    s=await app.waitFor('the earlier row',x=>/The new conversation keeps everything before/u.test(x.text));
    assert.match(s.text,/This message goes back in the composer/u);
    app.press(ENTER);
    /* the notice wraps at 120 columns: read it as one line */
    s=await app.waitFor('the notice',x=>/Forked before "Show me how sessions are refreshed" · you are now in "Flaky login test \(fork\)" · the message is back in the composer/u.test(x.lines.map(line=>line.trim()).join(' ')));
    assert.match(s.text,/Its images are not put back/u);
    assert.ok(composerHas(s.text,'Show me how sessions are refreshed'),'the message is in the composer');
    assert.deepEqual(k.cuts,[['s1','r1']]);
    assert.equal(k.resumed.at(-1),'s-cut','you are now in the new conversation');
    assert.equal((await store.get('s-cut'))?.name,'Flaky login test (fork)');
    assert.ok(app.calls.every(call=>!call.startsWith('resume Show')),'nothing is sent by itself');
  }finally{app.unmount();}
});

test('stage 7.6 /fork: a refusal says why; «latest» still forks it all; without the capability only «latest»',async()=>{
  const root=project();
  const k=cutting(async()=>{throw new CliRuntimeError('FORK_POINT_COMPACTED','inside a summary');});
  const app=await mountR5a({cols:120,rows:40,root,paths:env.paths,runtimeExtra:{...k.extra,export:(id:string)=>({sessionId:id,eventi:turns('first','second')})}});
  try{
    await app.type('/fork');app.press(ENTER);
    await app.waitFor('the sheet',x=>/1 back/u.test(x.text));
    app.press(DOWN);await sleep(40);app.press(ENTER);
    const s=await app.waitFor('the refusal',x=>/inside the part of this conversation that was summarized/u.test(x.text));
    assert.doesNotMatch(s.text,/Forked before/u);
  }finally{app.unmount();}
  const old=await mountR5a({cols:120,rows:40,root,paths:env.paths,runtimeExtra:{capabilities:()=>({forkBeforeRun:false}),export:(id:string)=>({sessionId:id,eventi:turns('first','second')})}});
  try{
    await old.type('/fork');old.press(ENTER);
    const s=await old.waitFor('the sheet',x=>/── Fork from a message/u.test(x.text)&&/latest/u.test(x.text));
    assert.doesNotMatch(s.text,/1 back/u);
  }finally{old.unmount();}
});

/* two turns of session s1, each with its checkpoint; the oldest is the start of the conversation */
async function checkpoints(root:string){
  const store=createCheckpointStore({rootDir:env.paths.checkpointsRoot,projectRoot:root});
  const a=join(root,'a.txt');await writeFile(a,'v1');
  const turn=async(change:()=>Promise<void>)=>{const h=await store.begin({operation:'resume',sessionId:'s1'});await change();return (await h.finalize()).id;};
  const t1=await turn(()=>writeFile(a,'v2'));await sleep(5);
  const t2=await turn(()=>writeFile(a,'v3'));
  return{store,a,t1,t2};
}

test('stage 7.8 /undo with the cut: Enter puts the files back, then the conversation goes back before that message',async()=>{
  const root=project();const {a,store,t2}=await checkpoints(root);
  const k=cutting(async(_id,runId)=>({sessionId:'s-back',message:runId==='r2'?'make it v3':'make it v2'}));
  const app=await mountR5a({cols:120,rows:40,root,paths:env.paths,runtimeExtra:{...k.extra,export:(id:string)=>({sessionId:id,eventi:turns('make it v2','make it v3')})}});
  try{
    await app.type('/undo');app.press(ENTER);
    let s=await app.waitFor('the sheet',x=>/── Go back to an earlier point/u.test(x.text));
    assert.match(s.text,/enter code and conversation/u);assert.match(s.text,/c conversation only/u);
    app.press(ENTER);
    s=await app.waitFor('back',x=>/Back to before "make it v3" in a new conversation · this one stays in \/resume/u.test(x.text));
    assert.equal(await readFile(a,'utf8'),'v2','the files went back first');
    assert.equal((await store.show(t2)).state,'undone');
    assert.deepEqual(k.cuts,[['s1','r2']]);
    assert.ok(composerHas(s.text,'make it v3'),'the message is in the composer');
  }finally{app.unmount();}
});

test('stage 7.8 /undo c: the conversation only, the files stay',async()=>{
  const root=project();const {a}=await checkpoints(root);
  const k=cutting(async()=>({sessionId:'s-back',message:'make it v2'}));
  const app=await mountR5a({cols:120,rows:40,root,paths:env.paths,runtimeExtra:{...k.extra,export:(id:string)=>({sessionId:id,eventi:turns('make it v2','make it v3')})}});
  try{
    await app.type('/undo');app.press(ENTER);
    await app.waitFor('the sheet',x=>/── Go back to an earlier point/u.test(x.text));
    app.press(DOWN);await sleep(40);await app.type('c');
    await app.waitFor('back',x=>/Back to before "make it v2"/u.test(x.text));
    assert.equal(await readFile(a,'utf8'),'v3','files untouched');
    assert.deepEqual(k.cuts,[['s1','r1']]);
  }finally{app.unmount();}
});

test('stage 7.8 /undo: a point with no message of yours says so and cuts nothing',async()=>{
  const root=project();await checkpoints(root);
  const k=cutting(async()=>({sessionId:'s-back',message:'x'}));
  const app=await mountR5a({cols:120,rows:40,root,paths:env.paths,runtimeExtra:{...k.extra,export:(id:string)=>({sessionId:id,eventi:[]})}});
  try{
    await app.type('/undo');app.press(ENTER);
    await app.waitFor('the sheet',x=>/── Go back to an earlier point/u.test(x.text));
    await app.type('c');
    await app.waitFor('no turn',x=>/This point has no message of yours to go back to/u.test(x.text));
    assert.deepEqual(k.cuts,[]);
  }finally{app.unmount();}
});
