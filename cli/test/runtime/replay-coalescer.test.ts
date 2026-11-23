/*
 * P-D (owner 07/10 night, «prima la coda» + parità sulle chat lunghe; registro 12 Voce 19): the journal keeps EVERY streamed delta as its
 * own record, so a long session replays tens of thousands of tiny events (the owner's real 12.3 MB session: 30,574 records, 16,285 of them
 * reasoning deltas and 9,612 text deltas = 85%). Each one is cloned, redacted, translated and reduced on the way to the screen (profile:
 * 450 ms of a 2.1 s resume). On replay only, adjacent deltas of the same message are folded into one event. Codex (rollout/src/policy.rs:94),
 * Pi (agent-session.ts:925) and OpenCode (session.ts:877: the delta is published, the part is stored whole) persist completed items, never
 * deltas; AG-UI (docs.ag-ui.com/concepts/events): clients concatenate the deltas of a message in arrival order.
 * What these tests pin: the folded event is the same text in the same order; nothing else is merged, moved or dropped; the kernel's stored
 * events are never mutated; live events after the replay pass through at once.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import * as coalescer from '../../src/runtime/replay-coalescer.ts';
const {createReplayCoalescer}=coalescer;
const isFolded=(event:unknown):boolean=>(coalescer as any).isFoldedReplayEvent?.(event)===true;

type Ev=Record<string,unknown>;
const text=(messageId:string,delta:string,seq:number):Ev=>({type:'TextMessageContent',messageId,delta,_sequenza:seq});
const reasoning=(messageId:string,delta:string,seq:number):Ev=>({type:'ReasoningMessageContent',messageId,delta,_sequenza:seq});
const args=(toolCallId:string,delta:string,seq:number):Ev=>({type:'ToolCallArgs',toolCallId,delta,_sequenza:seq});
const run=(events:Ev[],live:Ev[]=[])=>{const out:unknown[]=[];const c=createReplayCoalescer(e=>out.push(e));for(const e of events)c.push(e);c.end();for(const e of live)c.push(e);return out as Ev[];};

test('P-D adjacent deltas of one message become one event: same text, same order, the last sequence',()=>{
  const out=run([text('m1','Hel',5),text('m1','lo ',6),text('m1','world',7)]);
  assert.deepEqual(out,[{type:'TextMessageContent',messageId:'m1',delta:'Hello world',_sequenza:7}]);
});

test('P-D reasoning deltas and tool-argument deltas fold the same way, each by its own id',()=>{
  assert.deepEqual(run([reasoning('r1','a',1),reasoning('r1','b',2)]),[{type:'ReasoningMessageContent',messageId:'r1',delta:'ab',_sequenza:2}]);
  assert.deepEqual(run([args('c1','{"a"',1),args('c1',':1}',2)]),[{type:'ToolCallArgs',toolCallId:'c1',delta:'{"a":1}',_sequenza:2}]);
});

test('P-D nothing is merged across another message, another kind of event, or another id; order is kept',()=>{
  const events:Ev[]=[text('m1','a',1),text('m2','b',2),text('m2','c',3),{type:'ToolCallStart',toolCallId:'c1',_sequenza:4},args('c1','x',5),args('c2','y',6),text('m1','d',7),reasoning('m1','e',8),text('m1','f',9)];
  assert.deepEqual(run(events),[text('m1','a',1),text('m2','bc',3),{type:'ToolCallStart',toolCallId:'c1',_sequenza:4},args('c1','x',5),args('c2','y',6),text('m1','d',7),reasoning('m1','e',8),text('m1','f',9)]);
});

test('P-D an event between two deltas of the same message stops the fold (the text before and after stay apart)',()=>{
  const out=run([text('m1','a',1),{type:'StateDelta',delta:[{op:'replace',path:'/usage',value:{}}],_sequenza:2},text('m1','b',3)]);
  assert.deepEqual(out.map(e=>e.type),['TextMessageContent','StateDelta','TextMessageContent']);
  assert.equal(out[0]!.delta,'a');assert.equal(out[2]!.delta,'b');
});

test('P-D events that are not folded keep their identity, and a lone delta is delivered as it came',()=>{
  const start:Ev={type:'TextMessageStart',messageId:'m1',role:'assistant',_sequenza:1};const lone=text('m1','x',2);const end:Ev={type:'TextMessageEnd',messageId:'m1',_sequenza:3};
  const out=run([start,lone,end]);
  assert.equal(out[0],start);assert.equal(out[1],lone);assert.equal(out[2],end);
});

test('P-D the stored events are never mutated by a fold',()=>{
  const a=text('m1','a',1),b=text('m1','b',2);const before=JSON.stringify([a,b]);
  const out=run([a,b]);
  assert.equal(JSON.stringify([a,b]),before);
  assert.notEqual(out[0],a);
});

test('P-D a delta without a string delta or without an id is passed through untouched',()=>{
  /* each kind comes in an adjacent PAIR, the case where a missing guard would fold them */
  const odd:Ev[]=[{type:'TextMessageContent',messageId:'m1',delta:7,_sequenza:1},{type:'TextMessageContent',messageId:'m1',delta:8,_sequenza:2},{type:'TextMessageContent',delta:'x',_sequenza:3},{type:'TextMessageContent',delta:'y',_sequenza:4},{type:'TextMessageContent',messageId:'',delta:'p',_sequenza:5},{type:'TextMessageContent',messageId:'',delta:'q',_sequenza:6},{type:'ToolCallArgs',delta:'z',_sequenza:7},{type:'ToolCallArgs',delta:'w',_sequenza:8}];
  assert.deepEqual(run(odd),odd);
  assert.deepEqual(run([null as unknown as Ev,'text' as unknown as Ev,{type:'RunStarted',_sequenza:1}]),[null,'text',{type:'RunStarted',_sequenza:1}]);
});

test('P-D an event without a sequence folds, and keeps the last sequence that exists',()=>{
  const out=run([{type:'TextMessageContent',messageId:'m1',delta:'a'},{type:'TextMessageContent',messageId:'m1',delta:'b',_sequenza:9},{type:'TextMessageContent',messageId:'m1',delta:'c'}]);
  assert.deepEqual(out,[{type:'TextMessageContent',messageId:'m1',delta:'abc',_sequenza:9}]);
});

test('P-D the buffered tail is delivered by end(), and live events after it pass straight through',()=>{
  const out:unknown[]=[];const c=createReplayCoalescer(e=>out.push(e));
  c.push(text('m1','a',1));c.push(text('m1','b',2));
  assert.equal(out.length,0,'the replay tail is held until end()');
  c.end();
  assert.equal(out.length,1);
  c.push(text('m1','c',3));
  assert.equal(out.length,2,'a live delta is delivered at once');
  assert.equal((out[1] as Ev).delta,'c');
  c.push(text('m1','d',4));
  assert.equal(out.length,3,'and the next live delta is not folded into it');
});

test('P-D end() with nothing buffered delivers nothing, and calling it twice is harmless',()=>{
  const out:unknown[]=[];const c=createReplayCoalescer(e=>out.push(e));
  c.end();c.end();
  assert.deepEqual(out,[]);
});

test('P-D property: for any stream, the text per message and the order of every other event are what the unfolded stream gives',()=>{
  let seed=0x5eed;const next=()=>{seed=(seed*1103515245+12345)&0x7fffffff;return seed/0x7fffffff;};
  const kinds=['text','reasoning','args','start','state','end'] as const;
  for(let round=0;round<400;round++){
    const events:Ev[]=[];let seq=0;
    for(let i=0,n=Math.floor(next()*60);i<n;i++){
      const kind=kinds[Math.floor(next()*kinds.length)]!;const id=`m${Math.floor(next()*3)}`;const piece=`p${i}${next()<0.3?'é👍':''}`;seq+=1;
      events.push(kind==='text'?text(id,piece,seq):kind==='reasoning'?reasoning(id,piece,seq):kind==='args'?args(id,piece,seq):kind==='start'?{type:'TextMessageStart',messageId:id,_sequenza:seq}:kind==='state'?{type:'StateDelta',delta:[],_sequenza:seq}:{type:'TextMessageEnd',messageId:id,_sequenza:seq});
    }
    const folded=run(events);
    const accumulate=(list:Ev[])=>{const per=new Map<string,string>();const others:string[]=[];for(const e of list){const id=String(e.messageId??e.toolCallId??'');if(typeof e.delta==='string'&&['TextMessageContent','ReasoningMessageContent','ToolCallArgs'].includes(String(e.type)))per.set(`${e.type}:${id}`,(per.get(`${e.type}:${id}`)??'')+e.delta);else others.push(`${e.type}:${id}`);}return{per:[...per].sort(),others};};
    assert.deepEqual(accumulate(folded),accumulate(events),`round ${round}`);
    /* order: walking both streams, a delta of (type,id) appears in the folded stream exactly where its first delta of a run was */
    const runsOf=(list:Ev[])=>list.reduce<string[]>((acc,e)=>{const tag=`${e.type}:${String(e.messageId??e.toolCallId??'')}`;if(['TextMessageContent','ReasoningMessageContent','ToolCallArgs'].includes(String(e.type))&&acc.at(-1)===tag)return acc;acc.push(tag);return acc;},[]);
    assert.deepEqual(folded.map(e=>`${e.type}:${String(e.messageId??e.toolCallId??'')}`),runsOf(events),`order, round ${round}`);
    assert.ok(folded.length<=events.length);
  }
});

test('P-D fold: an event the fold built says so, and nothing else does (the supervisor keeps the kernel\'s own events apart from the views)',()=>{
  const lone=text('m1','x',9);const start:Ev={type:'TextMessageStart',messageId:'m1',_sequenza:1};
  const out=run([start,text('m1','a',2),text('m1','b',3),text('m2','c',4),lone,reasoning('r1','d',6)]);
  assert.deepEqual(out.map(e=>[e.type,isFolded(e)]),[['TextMessageStart',false],['TextMessageContent',true],['TextMessageContent',false],['TextMessageContent',false],['ReasoningMessageContent',false]]);
  assert.equal(isFolded(out[0]),false,'a passed-through event is the kernel\'s own object');
  assert.equal(isFolded(null),false);assert.equal(isFolded('text'),false);assert.equal(isFolded({...out[1]}),false,'a copy is not the fold\'s own object');
});

test('P-D fold: the mark is invisible - the event keeps its exact shape, keys and JSON',()=>{
  const out=run([text('m1','a',1),text('m1','b',2)]);
  assert.equal(isFolded(out[0]),true);
  assert.deepEqual(Object.keys(out[0]!),['type','messageId','delta','_sequenza']);
  assert.equal(JSON.stringify(out[0]),'{"type":"TextMessageContent","messageId":"m1","delta":"ab","_sequenza":2}');
  assert.equal(Object.getOwnPropertySymbols(out[0]!).length,0);
});

/*
 * C2 (owner 07/10 night «prima la coda»; registro 12 Voce 22-24): six tool results of the owner's 30.7 MB session weigh 30.45 MB (the largest 5.16 M
 * characters, field `content`), and the screen keeps 8 KiB of each (MAX_TOOL_SUMMARY_CHARS) plus the facts of the first line. The replay still cloned,
 * fingerprinted (canonical copy, JSON, sha256: 129 ms in the profile), redacted and translated every character. On a replay made for the SCREEN only,
 * a result over a limit arrives as a view: its head and its tail, the middle named. The kernel's stored event is not touched; every other consumer
 * (headless, export, agent view) still gets the whole event because the option is the TUI's alone. Pi truncate.ts (2000 lines / 50 KB, tail), OpenCode
 * tool/truncate.ts (2000 / 50 KB, the rest saved) and Codex TruncationPolicy limit the output BEFORE it enters the history; TALOS keeps the whole
 * result in the journal for the desktop, so the limit belongs to the read side, like the fold.
 */
const SCREEN={over:100,head:20,tail:40};
const result=(content:unknown,seq=5,extra:Ev={}):Ev=>({type:'ToolCallResult',toolCallId:'t1',messageId:'m1',role:'tool',content,_sequenza:seq,...extra});
const screenRun=(events:Ev[],live:Ev[]=[],options:any={giantResults:SCREEN})=>{const out:unknown[]=[];const c=(createReplayCoalescer as any)(e=>out.push(e),options);for(const e of events)c.push(e);c.end();for(const e of live)c.push(e);return out as Ev[];};
const alphabet=(length:number)=>Array.from({length},(_,i)=>String.fromCharCode(97+i%26)).join('');

test('C2 a result over the limit arrives as its head and its tail, the middle named; every other field is as it was',()=>{
  const full=alphabet(1000);const original=result(full);
  const [view]=screenRun([original]);
  const removed=1000-20-40;
  assert.equal(view!.content,`${full.slice(0,20)}\n[… ${removed} characters of this result are not loaded in this view …]\n${full.slice(-40)}`);
  assert.deepEqual(Object.keys(view!),Object.keys(original),'same keys in the same order');
  assert.deepEqual({...view,content:null},{...original,content:null},'only the content differs');
  assert.equal(original.content,full,'the kernel\'s stored event is not touched');
  assert.equal(isFolded(view),true,'a view says so: the supervisor keeps it out of the buffer of the kernel\'s own events');
  assert.equal(isFolded(original),false);
  assert.equal(JSON.stringify(view).length<400,true);
});

test('C2 what the screen draws is kept: the first line, and the last characters, byte for byte',()=>{
  const body=`exit 0 [sandbox: none]\n${alphabet(300_000)}\nlast line\n`;
  const [view]=screenRun([result(body)],[],{giantResults:{over:64*1024,head:4*1024,tail:32*1024}});
  const content=String(view!.content);
  assert.equal(content.split('\n')[0],'exit 0 [sandbox: none]','the first line the row hides is the kernel\'s own');
  assert.equal(content.slice(-8*1024),body.slice(-8*1024),'the 8 KiB the transcript keeps are the same 8 KiB');
  assert.ok(content.length<40*1024);
});

test('C2 at the limit, below it, or not a string: the event passes as it came, the same object',()=>{
  const exact=result(alphabet(100)),small=result('short'),array=result(['x'.repeat(1000)]),none=result(undefined);
  const out=screenRun([exact,small,array,none]);
  assert.deepEqual(out.map((e,i)=>e===[exact,small,array,none][i]),[true,true,true,true]);
  assert.equal(out.some(isFolded),false);
});

test('C2 only a tool result is cut: a large field of any other event passes untouched',()=>{
  const big=alphabet(5000);
  const others=[{type:'TextMessageContent',messageId:'m',delta:big,_sequenza:1},{type:'CUSTOM',name:'x',value:{content:big},_sequenza:2},{type:'RunStarted',content:big,_sequenza:3},{type:'ToolCallOutput',toolCallId:'t',delta:big,_sequenza:4}] as Ev[];
  const out=screenRun(others);
  assert.deepEqual(out.map(e=>JSON.stringify(e)),others.map(e=>JSON.stringify(e)));
});

test('C2 without the option, or after end(), a giant result passes whole: headless and the live stream are not changed',()=>{
  const giant=result(alphabet(200_000));/* over the TUI's own limit too: the default limits must not apply by themselves */
  const [a]=screenRun([giant],[],{});
  const plain:unknown[]=[];const bare=createReplayCoalescer(e=>plain.push(e));bare.push(giant);bare.end();
  assert.equal(a,giant);assert.equal(plain[0],giant,'no second argument at all: as before');
  const [live]=screenRun([],[giant]);
  assert.equal(live,giant,'a live event is delivered as it is, even over the limit');
});

test('C2 a view keeps its place: the deltas before it are delivered first, and the order of everything is the stream\'s',()=>{
  const out=screenRun([text('m1','a',1),text('m1','b',2),result(alphabet(500),3),text('m2','c',4)]);
  assert.deepEqual(out.map(e=>[e.type,e._sequenza]),[['TextMessageContent',2],['ToolCallResult',3],['TextMessageContent',4]]);
  assert.equal(out[0]!.delta,'ab');
});

test('C2 the tail edge never lands inside a surrogate pair either (an odd tail length meets the second half of a pair)',()=>{
  for(const shift of [0,1]){
    const full='x'.repeat(shift)+'😀'.repeat(300);
    const [view]=screenRun([result(full)],[],{giantResults:{over:100,head:20,tail:41}});
    assert.equal(String(view!.content).isWellFormed(),true,`shift ${shift}`);
    assert.ok(String(view!.content).endsWith('😀'),'it ends with a whole emoji');
  }
});

test('C2 a cut never splits a surrogate pair at either edge, and the view is well-formed text',()=>{
  const emoji='😀';
  for(const shift of [0,1]){
    const full='x'.repeat(shift)+emoji.repeat(300);
    const [view]=screenRun([result(full)]);
    assert.equal(String(view!.content).isWellFormed(),true,`shift ${shift}`);
    assert.ok(String(view!.content).length<=20+40+80,'still short');
  }
});
