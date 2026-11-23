/*
 * 14/10/2026, owner: «Sì, si risveglia da solo» (C06) and «Aggiungo il sottofondo, poi la sveglia». Through the REAL composition,
 * kernel and the CLI's executor on a fake provider: the model runs a command that outlives its time (it moves to the background,
 * not killed), the turn ends, and when the command ends the conversation wakes BY ITSELF — a new turn whose request tells the
 * model the command ended. Claude Code: a finished background command notifies the model; OpenCode `tool/task.ts` («You will be
 * notified automatically when it finishes»); Cline background-terminal; Hermes `notify_on_complete`; zcode `<task-notification>`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {dummyKey,hermetic} from '../provider/first-run-fixture.ts';
import {composeWithFake,runTurn,startScriptedProvider,textOf,type ChatRequest} from './r5a-r-fixture.ts';

const COMMAND=`node -e "setTimeout(function(){console.log('finished-bg')},3000)"`;
const endedNote=(request:ChatRequest)=>JSON.stringify(request.body.messages??[]).includes('finished-bg')||/background/iu.test(request.lastUser);

test('a command moved to the background wakes the conversation when it ends',{timeout:180_000},async()=>hermetic(async h=>{
  const key=dummyKey('deepseek');
  const fake=await startScriptedProvider({goodKey:key,respond:(request)=>{
    if(request.lastUser.includes('start the slow job')&&request.toolResults===0)return{kind:'tool',name:/^shell$/u,args:[{pattern:/^(command|comando)$/u,value:COMMAND},{pattern:/^timeout$/u,value:'1000'}]};
    if(request.lastUser.includes('start the slow job'))return{kind:'text',text:'It is running in the background.'};
    return{kind:'text',text:'Seen: the job ended.'};
  }});
  const context=await composeWithFake(h,fake.url,key);
  try{
    const {sessionId,raw}=await runTurn(context,h,'start the slow job');
    assert.ok(raw.some(e=>e?.type==='RunFinished'),'the first turn ended');
    const tool=JSON.stringify(fake.requests[1]?.body?.messages?.find((m:any)=>m.role==='tool')?.content??'');
    assert.match(tool,/IN BACKGROUND/u,`the command went to the background: ${tool.slice(0,300)}`);
    const before=fake.requests.length;
    const deadline=Date.now()+60_000;
    while(fake.requests.length===before&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,100));
    assert.ok(fake.requests.length>before,'a new request: the conversation woke by itself');
    const woke=fake.requests[before]!;
    const told=JSON.stringify(woke.body.messages??[]);
    assert.match(told,/node -e/u,`the model is told which command ended: ${textOf(woke.body.messages?.at(-1)?.content).slice(0,300)}`);
    await context.registry.attendiAssestamento(sessionId);
  }finally{await context.runtime.close?.();await fake.close();}
}));

test('a command the person stopped does not wake the conversation',{timeout:180_000},async()=>hermetic(async h=>{
  const key=dummyKey('deepseek');
  const fake=await startScriptedProvider({goodKey:key,respond:(request)=>{
    if(request.lastUser.includes('start the slow job')&&request.toolResults===0)return{kind:'tool',name:/^shell$/u,args:[{pattern:/^(command|comando)$/u,value:COMMAND},{pattern:/^timeout$/u,value:'1000'}]};
    return{kind:'text',text:'ok'};
  }});
  const context=await composeWithFake(h,fake.url,key);
  try{
    const {sessionId}=await runTurn(context,h,'start the slow job');
    const stops=await context.runtime.stopBackgroundCommands([sessionId],{waitMs:5_000});
    assert.equal(stops.length,1,'the background command was there and was stopped');
    const before=fake.requests.length;
    await new Promise(resolve=>setTimeout(resolve,5_000));
    assert.equal(fake.requests.length,before,'no wake after the person stopped it');
    void endedNote;
  }finally{await context.runtime.close?.();await fake.close();}
}));
