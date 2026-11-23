/*
 * R1 lane R (2026-09-24) — a resumed session rebuilds the person's messages (review D-04, resume half; gate E9 second bullet)
 * and a run cut off by closing TALOS replays as ended, not running (review D-08; acceptance s09).
 *
 * Measured first (probe through the real composition, 2026-09-24): the kernel records the person's prompt ONLY as
 * `RunStarted.input.consegna` — no `TextMessageStart role:user` is ever emitted — and a cut-off run replays as
 * RunStarted, TextMessageStart, TextMessageContent with no terminal event, while `listSessions` says `interrupted`.
 *
 * Everything goes through the REAL composition (`composeTalosRuntime`, the kernel's session registry, a restore in a second
 * composition on the same profile as a fresh process would do) and a fake provider on 127.0.0.1 with dummy keys. The screen
 * side is the real controller feeding the real transcript reducer, plus the exact local echo `app.ts` makes at send time
 * (`appendTranscriptMessage(transcript,{role:'user',text:text.trim()})`, app.ts `userMessage`).
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import {writeFileSync} from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {dummyKey,fakeKeyring,hermetic,REPO_ROOT,settle,startFakeProvider,writeProviderRuntime,type Hermetic} from '../provider/first-run-fixture.ts';
import {createTuiSessionController} from '../../src/tui/session-controller.ts';
import {appendTranscriptMessage,createTranscriptModel,reduceTranscriptEvent,transcriptItemText,type TranscriptModel} from '../../src/tui/transcript-model.ts';
import type {TuiEvent} from '../../src/tui/event-adapter.ts';

const MODEL='deepseek:deepseek-flash';
const MODELS=[{id:'deepseek-flash',name:'DeepSeek Flash'}];

async function compose(h:Hermetic,url:string,key:string){
  const {composeTalosRuntime}=await import('../../src/runtime/talos-composition.ts');
  writeProviderRuntime(h.paths,{deepseek:url});
  const context:any=await composeTalosRuntime({repoRoot:REPO_ROOT,projectRoot:h.project,paths:h.paths,model:MODEL,env:{...process.env},environmentKeys:'consent',keyring:fakeKeyring()} as any);
  context.providerStore.setKey('deepseek',key);await context.tuiCatalog.chooseProvider('deepseek');
  return context;
}
/** The screen: a transcript fed by the real controller, with the app's own local echo at send time. */
const controllers:Array<{close():void}>=[];
function screen(context:any,h:Hermetic){
  let model:TranscriptModel=createTranscriptModel();const events:TuiEvent[]=[];const errors:unknown[]=[];
  const controller=createTuiSessionController({runtime:context.runtime,projectRoot:h.project,model:MODEL,mode:'default',rules:{allow:[],ask:[],deny:[]},onEvent:(event:TuiEvent)=>{events.push(event);model=reduceTranscriptEvent(model,event);},onError:(error:unknown)=>errors.push(error)} as any);
  controllers.push(controller);
  const ends=()=>events.filter(e=>e.type==='run.completed'||e.type==='run.failed'||e.type==='run.cancelled').length;
  return{
    controller,events,errors,
    get model(){return model;},
    async send(text:string){
      const before=ends();
      model=appendTranscriptMessage(model,{role:'user',text:text.trim()});
      await controller.send(text,{model:MODEL,running:false});
      const deadline=Date.now()+30_000;while(ends()<=before){if(Date.now()>deadline)throw new Error('the run did not end');await new Promise(r=>setTimeout(r,20));}
    },
  };
}
const messages=(model:TranscriptModel)=>model.items.filter(item=>item.kind==='message').map(item=>transcriptItemText(item));
/* R3 Q-R3-9 (owner 2026-09-24): runs have no row any more; a run still "running" is one in `model.runs`. */
const running=(model:TranscriptModel)=>model.items.filter(item=>(item.kind==='run'&&item.status==='running')||((item.kind==='message'||item.kind==='reasoning')&&item.streaming));
const runningRuns=(model:TranscriptModel)=>(model.runs??[]).filter(run=>run.status==='running').map(run=>run.key);

test('R1-R — a two-turn session replays You/TALOS/You/TALOS in order after a restore, and the live screen shows each prompt once',{timeout:90_000},async()=>hermetic(async h=>{
  const key=dummyKey('deepseek');const fake=await startFakeProvider({goodKey:key,models:MODELS});
  writeFileSync(path.join(h.project,'README.md'),'# demo\n');
  const contexts:any[]=[];
  try{
    const live=await compose(h,fake.url,key);contexts.push(live);const first=screen(live,h);
    await first.send('hello first message');
    await first.send('second message about @README.md');
    assert.deepEqual(messages(first.model),['You\nhello first message','TALOS\nOK','You\nsecond message about @README.md','TALOS\nOK'],
      'the live screen shows every prompt exactly once: the local echo and the replayed RunStarted are one item');
    const sessionId=first.controller.current()!;
    await settle(h.root);
    // A fresh process: a second composition restores the profile from disk and the screen resumes the session.
    const restarted=await compose(h,fake.url,key);contexts.push(restarted);await restarted.runtime.restore();
    const resumed=screen(restarted,h);
    assert.equal(await resumed.controller.resumeSession(sessionId),sessionId);
    assert.deepEqual(messages(resumed.model),['You\nhello first message','TALOS\nOK','You\nsecond message about @README.md','TALOS\nOK'],
      'D-04: the resumed conversation shows what the person wrote, in order, with the reference summarised as typed');
    /* R3 Q-R3-9: there is no Run row to come after the message; the order that matters is the person first, then the answer. */
    const firstUser=resumed.model.items.findIndex(item=>item.kind==='message'&&item.role==='user');
    const firstAnswer=resumed.model.items.findIndex(item=>item.kind==='message'&&item.role==='assistant');
    assert.ok(firstUser>=0&&firstUser<firstAnswer,'D-08: the You message comes before the answer of its run');
    assert.equal(resumed.model.items.some(item=>item.kind==='run'),false,'Q-R3-9: no Run rows');
    assert.deepEqual(running(resumed.model),[],'a finished session replays with nothing running');
    assert.deepEqual(runningRuns(resumed.model),[],'and no run left running');
    // Replaying the same history twice (a second /resume of the same session) does not duplicate anything.
    await resumed.controller.resumeSession(sessionId);
    assert.equal(messages(resumed.model).length,4,'a second replay of the same session adds no item');
    // The person sends again the text of the last replayed prompt: the echo shows at once (even if that send then fails),
    // because a replayed history message never absorbs a new echo (the controller marks the replay as history).
    const echoed=appendTranscriptMessage(resumed.model,{role:'user',text:'second message about @README.md'});
    assert.equal(messages(echoed).length,5,'the new echo is its own message, not swallowed by the replayed one');
    assert.deepEqual(h.network.blocked,[],'nothing tried to leave the machine');
  }finally{for(const controller of controllers.splice(0))controller.close();for(const context of contexts)await context.runtime.close?.().catch(()=>{});await fake.close();}
}));

test('R1-R — a run cut off by closing TALOS mid-answer replays as interrupted, not running',{timeout:90_000},async()=>hermetic(async h=>{
  const key=dummyKey('deepseek');const open:http.ServerResponse[]=[];
  // A provider that starts the answer and never finishes it: the run is alive when the "process" goes away.
  const server=http.createServer(async(req,res)=>{
    for await(const _ of req){/* drain */}
    if(req.method==='GET'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({data:MODELS}));return;}
    res.writeHead(200,{'content-type':'text/event-stream'});
    res.write(`data: ${JSON.stringify({id:'c1',choices:[{index:0,delta:{role:'assistant',content:'partial answer'}}]})}\n\n`);open.push(res);
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',()=>resolve()));
  const url=`http://127.0.0.1:${(server.address() as any).port}`;
  const contexts:any[]=[];
  try{
    const live=await compose(h,url,key);contexts.push(live);
    const id:string=await live.runtime.start({projectRoot:h.project,prompt:'cut me off',model:MODEL,permissionMode:'default'});
    await new Promise<void>(resolve=>{const off=live.runtime.subscribe(id,(e:any)=>{if(e?.type==='TextMessageContent'){queueMicrotask(()=>off?.());resolve();}},0);});
    await settle(h.root,{quietMs:800});
    // TALOS is "closed" here: nothing finalises the run; a second composition restores the profile as the next launch does.
    const restarted=await compose(h,url,key);contexts.push(restarted);await restarted.runtime.restore();
    const rows=await restarted.runtime.listSessions();
    assert.equal(rows.find((row:any)=>row.sessionId===id)?.outcome,'interrupted','precondition: the kernel knows the run was cut off');
    const resumed=screen(restarted,h);
    await resumed.controller.resumeSession(id);
    assert.deepEqual(messages(resumed.model),['You\ncut me off','TALOS\npartial answer'],'the cut-off conversation is shown, the person first');
    assert.deepEqual(running(resumed.model).map(item=>transcriptItemText(item)),[],'D-08: no "Run · running" row and no streaming item after the replay');
    /* R3 Q-R3-8/9: the run is closed as interrupted and leaves one neutral line saying why, instead of a Run row. */
    assert.deepEqual(runningRuns(resumed.model),[],'no run left running');
    const notice=resumed.model.items.find(item=>item.kind==='warning'&&item.outcome==='interrupted');
    assert.equal(notice?transcriptItemText(notice):null,'Interrupted · TALOS was closed before this run finished','the line says the run was interrupted');
    const closing=resumed.events.filter(e=>e.type==='run.cancelled');
    assert.equal(closing.length,1,'one terminal event reaches the rest of the screen, so the status line stops "thinking" too (state.ts)');
  }finally{
    for(const r of open)r.destroy();
    for(const controller of controllers.splice(0))controller.close();
    for(const context of contexts)await context.runtime.close?.().catch(()=>{});
    server.closeAllConnections?.();await new Promise<void>(resolve=>server.close(()=>resolve()));}
}));
