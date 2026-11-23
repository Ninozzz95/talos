/*
 * Stage 3 (owner 01-02/10, registro 12): the question card the model's `ask_user_question` opens. Drawn as the approved
 * mockup draws it — text AND style roles compared row by row with its golden frames (step-03-domande-del-modello-t12s at
 * 120×40 and 80×24, copied in fixtures/question-card-golden.json) — and answered through the kernel contract
 * (user-question-contract.mjs: answered with skipped/notes, skipped, cancelled, expired).
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {openQuestionCard,questionCardClick,questionCardKey,shownOptions,questionCardTick,responseOf,type CardKey,type CardQuestion,type QuestionCardState} from '../../src/tui/question-card.ts';
import {questionCardRows,type CardRow} from '../../src/tui/question-card-rows.ts';

const golden=JSON.parse(readFileSync(new URL('./fixtures/question-card-golden.json',import.meta.url),'utf8')) as {frames:Record<string,{text:string[];style:string[]}>};

const QUESTIONS:CardQuestion[]=[
 {id:'fix',header:'Fix',question:'How should the test wait for the session?',why:'This decides whether the test or the product changes.',options:[
  {label:'Wait for the cookie',description:'replace the sleep with waitForSession(); product unchanged',recommended:true,preview:'-  await page.waitForTimeout(500)\n+  await waitForSession(page)'},
  {label:'Shorten the retry',description:'cap the jitter in refreshSession(); faster, changes the product',preview:'-  const jitter = rand(0, 900)\n+  const jitter = rand(0, 300)'},
  {label:'Both',description:'robust test and a shorter worst case',preview:'+  await waitForSession(page)\n+  const jitter = rand(0, 300)'}]},
 {id:'scope',header:'Verify',question:'Which checks should TALOS run after the fix?',why:'More checks take longer but catch regressions elsewhere.',multiSelect:true,options:[
  {label:'Login e2e, 10 runs',description:'proves the flake is gone',recommended:true},{label:'All auth unit tests',description:'about 40 s'},{label:'Full e2e suite',description:'about 6 min'}]},
 {id:'note',header:'Commit',question:'Commit the change when the checks pass?',why:'TALOS never commits without your say.',options:[
  {label:'Commit locally',description:'one commit, message drafted by TALOS',recommended:true},{label:'Leave it uncommitted',description:'you review the diff first'}]}];

const open=(questions=QUESTIONS,timeoutMs:number|null=300_000)=>openQuestionCard({requestId:'req-1',questions,now:6_600,timeoutMs});
const text=(rows:CardRow[])=>rows.map(r=>r.map(s=>s.text).join('').replace(/\s+$/u,''));
/* The golden style format: runs `start+length:roles` per row (roles sorted, unstyled cells left out). */
const style=(rows:CardRow[])=>rows.map(r=>{let x=0;const out:Array<{start:number;end:number;roles:string}>=[];
  for(const s of r){const n=[...s.text].length;const roles=[...s.roles].sort().join(',');const last=out.at(-1);
    if(roles&&n){if(last&&last.roles===roles&&last.end===x)last.end=x+n;else out.push({start:x,end:x+n,roles});}x+=n;}
  return out.map(o=>`${o.start}+${o.end-o.start}:${o.roles}`).join(' ');});
function keys(state:QuestionCardState,...list:Array<string|CardKey>){
  let outcome:ReturnType<typeof questionCardKey>['outcome']={kind:'none'};
  for(const k of list){const key=typeof k==='string'?(k.length===1?{name:k,text:k}:{name:k}):k;({state,outcome}=questionCardKey(state,key));}
  return{state,outcome};
}

for(const [size,width] of [['120x40',120],['80x24',80]] as const){
  test(`the card matches the approved mockup at ${size}, text and style`,()=>{
    const rows=questionCardRows(open(),width,12_000);
    assert.deepEqual(text(rows),golden.frames[size]!.text);
    assert.deepEqual(style(rows),golden.frames[size]!.style);
  });
}

test('Enter takes the highlighted option and moves on; the recommended one is first',()=>{
  const {state}=keys(open(),'return');
  assert.equal(state.answers.fix,'Wait for the cookie');
  assert.equal(state.qi,1);
});

test('a number picks that option directly',()=>{
  assert.equal(keys(open(),'2').state.answers.fix,'Shorten the retry');
});

test('multiple choice: space toggles, Enter keeps the picks',()=>{
  const {state}=keys(open(),'return',{name:'down'},{name:'space'},{name:'down'},{name:'space'},{name:'return'});
  assert.deepEqual(state.answers.scope,['All auth unit tests','Full e2e suite']);
});

test('Other opens a free answer; Enter with text answers it, esc goes back without cancelling',()=>{
  let {state,outcome}=keys(open(),'4');
  assert.equal(state.editing?.kind,'other');
  ({state,outcome}=keys(state,{name:'escape'}));
  assert.equal(outcome.kind,'none');assert.equal(state.editing,null);
  ({state}=keys(state,'4','u','s','e',' ','b','o','t','h','return'));
  assert.equal(state.answers.fix,'use both');
});

test('a note (Tab) is kept for the question and leaves the highlighted option where it was (Claude Code 2.1.274 fix)',()=>{
  const {state}=keys(open(),{name:'down'},{name:'tab'},'w','h','y',{name:'return'});
  assert.equal(state.notes.fix,'why');
  assert.equal(state.sel,1,'still on the option the person had highlighted');
  assert.equal(state.answers.fix,undefined,'a note is not an answer');
});

test('review: everything answered, a skipped question and a note go to the kernel in the contract shape',()=>{
  const {state,outcome}=keys(open(),{name:'tab'},'n','b',{name:'return'},'return',{name:']',ctrl:true},'1');
  assert.equal(state.review,true);assert.equal(outcome.kind,'none');
  const sent=keys(state,{name:'return'}).outcome;
  assert.deepEqual(sent,{kind:'send',response:{status:'answered',answers:{fix:'Wait for the cookie',note:'Commit locally'},skipped:['scope'],notes:{fix:'nb'}}});
});

test('all skipped is `skipped`, never an empty answer',()=>{
  const {state}=keys(open(),{name:']',ctrl:true},{name:']',ctrl:true},{name:']',ctrl:true});
  assert.deepEqual(responseOf(state),{status:'skipped'});
});

test('esc cancels from the options and from the review',()=>{
  assert.deepEqual(keys(open(),{name:'escape'}).outcome,{kind:'send',response:{status:'cancelled'}});
  const {state}=keys(open(),'1','1','1');
  assert.deepEqual(keys(state,{name:'escape'}).outcome,{kind:'send',response:{status:'cancelled'}});
});

test('the clock: before the deadline nothing, at it `expired`; no setting means no clock',()=>{
  const state=open();
  assert.deepEqual(questionCardTick(state,6_600+299_999),{kind:'none'});
  assert.deepEqual(questionCardTick(state,6_600+300_000),{kind:'send',response:{status:'expired'}});
  assert.deepEqual(questionCardTick(open(QUESTIONS,null),10**12),{kind:'none'});
  assert.ok(!text(questionCardRows(open(QUESTIONS,null),120,12_000))[0]!.includes('closes in'));
});

test('a question without options is a free answer from the start',()=>{
  const {state,outcome}=keys(open([{id:'name',question:'What should the branch be called?'}]),'f','i','x','return');
  assert.equal(outcome.kind,'none');assert.equal(state.review,true);
  assert.deepEqual(responseOf(state),{status:'answered',answers:{name:'fix'}});
});

test('Enter on an empty free answer does nothing; a blank note is not sent',()=>{
  const free=open([{id:'name',question:'What should the branch be called?'}]);
  const {state}=keys(free,'return');
  assert.equal(state.answers.name,undefined);assert.equal(state.review,false);
  const withBlankNote=keys(open(),{name:'tab'},' ',{name:'return'},'1','1','1').state;
  assert.deepEqual(responseOf(withBlankNote),{status:'answered',answers:{fix:'Wait for the cookie',scope:['Login e2e, 10 runs'],note:'Commit locally'}});
});

test('the last minute is drawn as a warning; the last question says Enter goes to the review',()=>{
  const rows=questionCardRows(open(),120,6_600+300_000-59_000);
  const clock=rows[0]!.find(s=>s.text.includes('closes in'))!;
  assert.deepEqual(clock.roles,['warn']);
  assert.match(text(questionCardRows(keys(open(),'1','1').state,120,12_000)).at(-2)!,/enter review ·/u);
});

test('terminal keys as the card reads them',async()=>{
  const {cardKeyOf}=await import('../../src/tui/question-card.ts');
  assert.deepEqual(cardKeyOf('\r',{return:true}),{name:'return'});
  assert.deepEqual(cardKeyOf('',{escape:true}),{name:'escape'});
  assert.deepEqual(cardKeyOf('\t',{tab:true}),{name:'tab'});
  assert.equal(cardKeyOf('\t',{tab:true,shift:true}),null);
  assert.deepEqual([cardKeyOf('',{upArrow:true}),cardKeyOf('',{downArrow:true}),cardKeyOf('',{leftArrow:true}),cardKeyOf('',{rightArrow:true})].map(k=>k?.name),['up','down','left','right']);
  assert.deepEqual(cardKeyOf('',{backspace:true}),{name:'backspace'});
  assert.deepEqual(cardKeyOf('',{delete:true}),{name:'backspace'});
  assert.deepEqual(cardKeyOf('\x1d',{}),{name:']',ctrl:true});
  assert.deepEqual(cardKeyOf(']',{ctrl:true}),{name:']',ctrl:true});
  assert.equal(cardKeyOf('c',{ctrl:true}),null);
  assert.equal(cardKeyOf('x',{meta:true}),null);
  assert.equal(cardKeyOf('\x01',{}),null);
  assert.deepEqual(cardKeyOf(' ',{}),{name:'space',text:' '});
  assert.deepEqual(cardKeyOf('2',{}),{name:'2',text:'2'});
  assert.deepEqual(cardKeyOf('use both',{}),{name:'text',text:'use both'});
  assert.deepEqual(cardKeyOf('é',{}),{name:'é',text:'é'});
  /* two keys in one chunk: the second arrives as its raw byte */
  assert.deepEqual(cardKeyOf('\t',{}),{name:'tab'});
  assert.deepEqual(cardKeyOf('\r',{}),{name:'return'});
  assert.deepEqual(cardKeyOf('\x1b',{}),{name:'escape'});
  assert.deepEqual(cardKeyOf('\x7f',{}),{name:'backspace'});
  assert.deepEqual(cardKeyOf('\b',{}),{name:'backspace'});
});

test('the layout gives a card in the composer\'s place its own height, up to the frame less the activity row and one transcript row',async()=>{
  const {budget,budgetRows}=await import('../../src/tui/regions/budget.ts');
  const base={rows:40,columns:120,frameRows:40,composerLines:1,composerHints:0,header:1,shortcut:1,roster:0,extras:0,footer:1};
  const normal=budget(base);
  assert.equal(normal.composer,3,'the composer keeps its border and one row');
  const card=budget({...base,composerRows:17});
  assert.equal(card.composer,17);assert.equal(card.composerContent,0);assert.equal(card.composerHints,0);
  assert.equal(budgetRows(card),card.frameRows,'every row is accounted for');
  assert.equal(card.status,1,'the activity row stays above the card');
  const small=budget({...base,rows:24,frameRows:24,composerRows:40});
  assert.equal(small.composer,24-1-1,'at most the frame less the activity row and one transcript row');
  assert.equal(budgetRows(small),small.frameRows);
});

test('a chunk of several keys is read key by key: a Tab glued to the letters after it is still a Tab (measured in the gate)',async()=>{
  const {cardKeysOf}=await import('../../src/tui/question-card.ts');
  assert.deepEqual(cardKeysOf('\tkeep',{}),[{name:'tab'},{name:'k',text:'k'},{name:'e',text:'e'},{name:'e',text:'e'},{name:'p',text:'p'}]);
  assert.deepEqual(cardKeysOf('\x1b[B\t',{}),[{name:'down'},{name:'tab'}]);
  assert.deepEqual(cardKeysOf('ok\r',{}),[{name:'o',text:'o'},{name:'k',text:'k'},{name:'return'}]);
  assert.deepEqual(cardKeysOf('ab\x7f',{}),[{name:'a',text:'a'},{name:'b',text:'b'},{name:'backspace'}]);
  assert.deepEqual(cardKeysOf('\x1b',{}),[{name:'escape'}]);
  assert.deepEqual(cardKeysOf('\x1b[A\x1b[C\x1b[D',{}),[{name:'up'},{name:'right'},{name:'left'}]);
  assert.deepEqual(cardKeysOf('\x1d',{}),[{name:']',ctrl:true}]);
  assert.deepEqual(cardKeysOf('\x01x',{}),[{name:'x',text:'x'}],'other control bytes are dropped, never typed');
  /* a key Ink already named stays one key */
  assert.deepEqual(cardKeysOf('',{downArrow:true}),[{name:'down'}]);
  assert.deepEqual(cardKeysOf('c',{ctrl:true}),[]);
  /* one key per character, so a number still picks its option */
  assert.deepEqual(cardKeysOf('2',{}),[{name:'2',text:'2'}]);
  assert.deepEqual(cardKeysOf('é ',{}),[{name:'é',text:'é'},{name:'space',text:' '}]);
});

/* Stage 6c «tutto cliccabile» (owner 02/10; mockup `click`: opt, qtab, send). A click goes through the same card logic as
   its key: a choice is picked like its digit, a choice of a multiple question is toggled like Space, a tab opens its
   question like ←/→, «Send answers» sends like Enter on the review. A click the card cannot take is null. */
test('a click picks, toggles, moves between questions and sends, as the keys do',()=>{
  let state=open();
  const first=questionCardClick(state,'opt:1')!;
  assert.deepEqual(first,keys(state,'2'),'a choice is its digit');
  state=first.state;
  assert.equal(state.qi,1);
  state=questionCardClick(state,'opt:2')!.state;
  assert.deepEqual(state.picks.scope,['Full e2e suite'],'a choice of a multiple question toggles');
  state=questionCardClick(state,'opt:2')!.state;
  assert.deepEqual(state.picks.scope,[],'and toggles back');
  assert.equal(state.qi,1,'toggling stays on the question');
  state=questionCardClick(state,'qtab:0')!.state;
  assert.equal(state.qi,0);
  assert.equal(questionCardClick(state,'send'),null,'nothing to send outside the review');
  state=keys(state,'1','1',{name:'return'}).state;
  assert.equal(state.review,true);
  const sent=questionCardClick(state,'send')!;
  assert.deepEqual(sent.outcome,{kind:'send',response:responseOf(state)});
  assert.equal(questionCardClick(state,'qtab:0')!.state.review,false,'«Change» leaves the review');
  assert.equal(questionCardClick(state,'opt:0'),null,'the review has no choices to click');
  assert.equal(questionCardClick(open(),`opt:${shownOptions(QUESTIONS[0]!).length}`),null,'one past the last choice');
  assert.equal(questionCardClick(open(),`qtab:${QUESTIONS.length}`),null,'one past the last tab');
  assert.equal(questionCardClick(open(),'agents'),null);
});

test('a click on «Other» opens its text, as its digit does',()=>{
  const state=open();const other=shownOptions(state.questions[0]!).length-1;
  assert.deepEqual(questionCardClick(state,`opt:${other}`),keys(state,String(other+1)));
  assert.equal(questionCardClick(state,`opt:${other}`)!.state.editing?.kind,'other');
  const multi=keys(state,'1').state;const otherOfMulti=QUESTIONS[1]!.options!.length;
  assert.equal(questionCardClick(multi,`opt:${otherOfMulti}`)!.state.editing?.kind,'other','«Other» of a multiple question opens its text, it is not toggled');
});
