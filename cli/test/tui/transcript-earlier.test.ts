/*
 * Long chats, tappa D (owner 07/10 night «prima la coda», decided with a mockup-free text: the last 5 turns first, a row «N earlier messages» that loads
 * pages of 100; search and copy-all see the whole conversation). Codex tui/src/app_server_session/history.rs:29-31 hydrates INITIAL_HISTORY_TURN_LIMIT = 5
 * turns and HISTORY_ITEM_PAGE_LIMIT = 100 items per page, and app/event_dispatch.rs:317-326 asks for the next older page when the view nears the top;
 * OpenCode session/message-v2.ts `page({limit, before})` pages from the newest with a cursor (50). Until now the TUI kept the last 768 items and DROPPED the
 * rest without a trace: a long session's beginning could not be reached at all. What these tests pin: nothing dropped is lost (it waits in `earlier`, oldest
 * first), a window keeps whole turns, a page loads whole turns and raises the cap by what it loaded so the next event does not drop it again, and none of
 * it touches a live (active) item.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import * as model from '../../src/tui/transcript-model.ts';

const api:any=model;
const {createTranscriptModel,appendTranscriptMessage,MAX_TRANSCRIPT_ITEMS}=model;
const ids=(items:readonly any[])=>items.map(item=>item.id);

/** `turns` turns of one user prompt and one assistant answer each, ids t<n>u / t<n>a, in order. */
function conversation(turns:number,{extraPerTurn=0}:{extraPerTurn?:number}={}){
  let m=createTranscriptModel();
  for(let n=1;n<=turns;n++){
    m=appendTranscriptMessage(m,{id:`t${n}u`,role:'user',text:`question ${n}`});
    for(let extra=0;extra<extraPerTurn;extra++)m=appendTranscriptMessage(m,{id:`t${n}x${extra}`,role:'assistant',text:`step ${extra}`});
    m=appendTranscriptMessage(m,{id:`t${n}a`,role:'assistant',text:`answer ${n}`});
  }
  return m;
}

test('EARLIER1 — what the cap drops is kept in `earlier`, oldest first, instead of vanishing',()=>{
  let m=createTranscriptModel();
  for(let n=0;n<MAX_TRANSCRIPT_ITEMS+30;n++)m=appendTranscriptMessage(m,{id:`m${n}`,role:n%2?'assistant':'user',text:`text ${n}`});
  assert.equal(m.items.length,MAX_TRANSCRIPT_ITEMS);
  assert.equal(api.earlierCount?.(m),30,'thirty items waited behind the cap');
  assert.deepEqual(ids(m.earlier??[]),Array.from({length:30},(_,n)=>`message:m${n}`),'the oldest thirty, in the order they were');
  assert.equal(m.items[0]!.id,'message:m30');
});

test('EARLIER2 — a live item is never moved out of the list, whatever the cap',()=>{
  let m=createTranscriptModel();
  m={...m,items:[{kind:'message',id:'message:live',role:'assistant',text:'still arriving',streaming:true},...m.items]};
  for(let n=0;n<MAX_TRANSCRIPT_ITEMS+5;n++)m=appendTranscriptMessage(m,{id:`m${n}`,role:'user',text:`text ${n}`});
  assert.ok(m.items.some(item=>item.id==='message:live'),'the streaming message stays');
  assert.ok(!(m.earlier??[]).some(item=>item.id==='message:live'));
});

test('EARLIER3 — `earlier` is itself bounded: the oldest of the oldest go first',()=>{
  let m=createTranscriptModel();
  const limit=api.MAX_EARLIER_ITEMS;
  assert.equal(typeof limit,'number');
  const total=MAX_TRANSCRIPT_ITEMS+limit+25;
  for(let n=0;n<total;n++)m=appendTranscriptMessage(m,{id:`m${n}`,role:'user',text:'x'});
  assert.equal(m.earlier!.length,limit);
  assert.equal(m.earlier![0]!.id,'message:m25','the first 25 are gone for good');
});

test('WINDOW1 — the window keeps the last N turns whole and moves the older ones to `earlier`, in order',()=>{
  const m=conversation(8,{extraPerTurn:2});
  const w=api.windowTranscript(m,5);
  assert.equal(w.items[0]!.id,'message:t4u','it starts at the prompt of the 5th turn from the end');
  assert.equal(w.items.length,5*4,'five turns of prompt, two steps and an answer');
  assert.deepEqual(ids(w.earlier),ids(m.items.slice(0,3*4)),'the three older turns wait, oldest first');
  assert.deepEqual(ids([...w.earlier,...w.items]),ids(m.items),'nothing lost, nothing reordered');
});

test('WINDOW2 — a conversation of N turns or fewer is left as it is (the same object)',()=>{
  const m=conversation(5);
  assert.equal(api.windowTranscript(m,5),m);
  assert.equal(api.windowTranscript(conversation(2),5).items.length,4);
  assert.equal(api.windowTranscript(createTranscriptModel(),5).items.length,0);
});

test('WINDOW3 — windowing twice gives the same window; items before a live item are never moved past it',()=>{
  const once=api.windowTranscript(conversation(9),5);
  const twice=api.windowTranscript(once,5);
  assert.deepEqual(ids(twice.items),ids(once.items));
  assert.deepEqual(ids(twice.earlier),ids(once.earlier));
  const live=conversation(9);
  live.items[1]={...(live.items[1] as any),streaming:true};
  const guarded=api.windowTranscript(live,5);
  assert.equal(guarded.items[0]!.id,live.items[1]!.id,'the window stops AT the live item: it and everything after it stay on the list');
  assert.ok(guarded.items.some(item=>item.id===live.items[1]!.id));
});

test('LOAD1 — a page loads whole turns: it starts at a prompt and is put before the window',()=>{
  const w=api.windowTranscript(conversation(60,{extraPerTurn:1}),5);          /* 55 older turns of 3 items = 165 items waiting */
  const loaded=api.revealEarlier(w,100);
  const taken=loaded.items.length-w.items.length;
  assert.ok(taken>=100&&taken<100+3,`a page of 100 items, extended back to the prompt that opens its first turn (took ${taken})`);
  assert.equal(loaded.items[0]!.kind==='message'&&(loaded.items[0] as any).role,'user');
  assert.deepEqual(ids([...loaded.earlier,...loaded.items]),ids([...w.earlier,...w.items]),'order and content unchanged');
});

test('LOAD2 — what was loaded is not dropped again by the next event; the cap grew by what the person asked for',()=>{
  const w=api.windowTranscript(conversation(60,{extraPerTurn:1}),5);
  const loaded=api.revealEarlier(w,100);
  const before=loaded.items.length;
  const next=appendTranscriptMessage(loaded,{id:'live1',role:'user',text:'one more'});
  assert.equal(next.items.length,before+1,'nothing was pushed back into `earlier`');
  assert.equal(next.earlier!.length,loaded.earlier!.length);
});

test('LOAD3 — loading everything empties `earlier`; with nothing waiting it returns the same object',()=>{
  const w=api.windowTranscript(conversation(40),5);
  const all=api.revealEarlier(w,Number.POSITIVE_INFINITY);
  assert.equal((all.earlier??[]).length,0);
  assert.equal(all.items.length,80);
  assert.equal(api.revealEarlier(all,100),all);
  assert.equal(api.revealEarlier(createTranscriptModel(),100).items.length,0);
});

test('LOAD4 — a turn of more than a page is loaded whole, up to a bounded extension',()=>{
  let m=createTranscriptModel();
  m=appendTranscriptMessage(m,{id:'p1',role:'user',text:'big task'});
  for(let n=0;n<150;n++)m=appendTranscriptMessage(m,{id:`s${n}`,role:'assistant',text:`step ${n}`});
  for(let n=2;n<=7;n++){m=appendTranscriptMessage(m,{id:`p${n}`,role:'user',text:`q${n}`});m=appendTranscriptMessage(m,{id:`a${n}`,role:'assistant',text:`a${n}`});}
  const w=api.windowTranscript(m,5);
  assert.equal(w.earlier.length,151+2,'the big first turn and the second turn wait');
  const loaded=api.revealEarlier(w,100);
  assert.equal(loaded.items[0]!.id,'message:p1','the page reached back to the prompt of the big turn');
});

test('SUMMARY1 — the row counts what waits: all items, and how many of them are messages',()=>{
  const w=api.windowTranscript(conversation(8,{extraPerTurn:1}),5);
  assert.equal(api.earlierCount(w),9);
  assert.deepEqual(api.earlierSummary(w),{items:9,messages:9});
  assert.deepEqual(api.earlierSummary(createTranscriptModel()),{items:0,messages:0});
});

test('STATE1 — the screen state windows its transcript on history.window and on nothing else',async()=>{
  const {initialTuiState,reduceTuiEvent}=await import('../../src/tui/state.ts');
  const state:any={...initialTuiState({model:'m',permissionMode:'default'}),transcript:conversation(9)};
  const windowed:any=reduceTuiEvent(state,{type:'history.window',turns:5} as any);
  assert.equal(windowed.transcript.items.length,10);
  assert.equal(windowed.transcript.earlier.length,8);
  assert.equal(windowed.running,state.running,'nothing else of the state moves');
  const other:any=reduceTuiEvent(state,{type:'warning',message:'x'} as any);
  assert.equal(other.transcript.earlier,undefined);
  assert.equal((reduceTuiEvent(windowed,{type:'history.window',turns:5} as any) as any).transcript.items.length,10,'a second window changes nothing');
});

test('LOAD5 — a page never pulls in a turn of a thousand steps: the extension back to a prompt is bounded',()=>{
  let m=createTranscriptModel();
  m=appendTranscriptMessage(m,{id:'p0',role:'user',text:'huge task'});
  for(let n=0;n<1000;n++)m=appendTranscriptMessage(m,{id:`s${n}`,role:'assistant',text:`step ${n}`});
  for(let n=1;n<=6;n++){m=appendTranscriptMessage(m,{id:`p${n}`,role:'user',text:`q${n}`});m=appendTranscriptMessage(m,{id:`a${n}`,role:'assistant',text:`a${n}`});}
  const w=api.windowTranscript(m,5);
  assert.ok(w.earlier.length>1000);
  const loaded=api.revealEarlier(w,100);
  const taken=loaded.items.length-w.items.length;
  assert.ok(taken>=100&&taken<=100+400,`at most four pages of extension (took ${taken})`);
});

test('WINDOW4 — exactly N turns, with something before the first prompt: nothing is moved (the whole conversation is inside the window)',()=>{
  let m=conversation(5);
  m={...m,items:[{kind:'warning',id:'warning:preamble',text:'resumed from an earlier run'} as any,...m.items]};
  const w=api.windowTranscript(m,5);
  assert.equal(w,m);
  assert.equal(api.windowTranscript(m,4).items[0]!.id,'message:t2u','one turn fewer in the window: the first turn and the preamble wait');
});

test('LOAD6 — a person who loaded more than the usual cap keeps it: the next events do not push it back',()=>{
  const w=api.windowTranscript(conversation(500),5);          /* 1000 items in all: 768 on the list, the rest waiting; then the window */
  const loaded=api.revealEarlier(w,900);
  assert.ok(loaded.items.length>MAX_TRANSCRIPT_ITEMS,`more than the usual cap on the list (${loaded.items.length})`);
  const before=loaded.items.length,waiting=loaded.earlier?.length??0;
  const next=appendTranscriptMessage(loaded,{id:'live1',role:'user',text:'one more'});
  assert.equal(next.items.length,before+1);
  assert.equal(next.earlier?.length??0,waiting,'nothing went back to the beginning');
});

test('SUMMARY2 — the row counts messages, not tool rows or notices',()=>{
  const w=api.windowTranscript(conversation(8),5);
  const mixed={...w,earlier:[...w.earlier,{kind:'warning',id:'w1',text:'x'},{kind:'warning',id:'w2',text:'y'}]};
  assert.deepEqual(api.earlierSummary(mixed),{items:8,messages:6});
});
