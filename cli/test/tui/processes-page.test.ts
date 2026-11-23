/* C12d of the redesign: Processes. The ledger's commands in words, Running first, when the page was read, s and a twice; a finished one says so. */
import assert from 'node:assert/strict';
import test from 'node:test';
import type {CliProcessRow} from '../../src/runtime/types.ts';
import {processesRedraw,processesSheet,sheetStep,type SheetState} from '../../src/tui/panel/commands.ts';
import {processDetail,processDuration,type ProcessesData} from '../../src/tui/panel/processes-page.ts';
import {asPage,pageRows} from '../../src/tui/panel/page.ts';
import {panelKey} from '../../src/tui/panel/sheet.ts';

const all=(rows:readonly (readonly {text:string}[])[])=>rows.map(row=>row.map(segment=>segment.text).join('')).join('\n');
const press=(sheet:SheetState,key:string)=>sheetStep(sheet,panelKey(sheet.panel,{name:key}));
const p=(toolCallId:string,fields:Partial<CliProcessRow>):CliProcessRow=>({sessionId:'s1',sessionTitle:'Fix the login',toolCallId,command:`cmd ${toolCallId}`,description:null,origin:'modello',startedAt:'2026-11-01T19:00:00Z',
  durationMs:null,runningForMs:null,outcome:'concluso',exitCode:0,background:false,outputFile:null,...fields});
/* tester 01/11 R2: a running one counts from its start; the ledger's runningForMs (here stale) is only a floor */
const READ=Date.parse('2026-11-01T19:02:05Z');
const DATA:ProcessesData={readAt:READ,error:null,rows:[
  p('a',{command:'npm run dev',outcome:'in-sfondo',background:true,runningForMs:6_000,outputFile:'C:\\tmp\\dev.log'}),
  p('b',{command:'npm test',outcome:'in-corso',startedAt:'2026-11-01T19:01:25Z',runningForMs:6_000}),
  p('c',{command:'npm audit',outcome:'concluso',exitCode:1,durationMs:3_000}),
  p('d',{command:'git status',outcome:'concluso',exitCode:0,durationMs:200})]};

test('Running first; each command says its state, how long, which chat; the page says when it was read',()=>{
  const shown=all(pageRows(asPage(processesSheet(DATA)).panel,120,26));
  assert.match(shown,/── Processes Commands the chats of this window ran/u);
  assert.match(shown,/Running 2 +Finished 2 +All 4/u);
  assert.match(shown,/2 running · followed while the page is open/u);
  assert.match(all(pageRows(asPage(processesSheet({...DATA,rows:[DATA.rows[3]!]})).panel,120,26)),/Read at \d\d:\d\d:\d\d · nothing runs now · r reads it again/u);
  assert.match(shown,/npm run dev .*in background .*2m 05s/u);assert.match(shown,/npm test .*running .*40 s/u);assert.doesNotMatch(shown,/npm audit/u,'Running shows only what runs');
  const finished=all(pageRows(asPage(processesSheet(DATA,{filterAt:1})).panel,120,26));
  assert.match(finished,/npm audit .*failed/u);assert.match(finished,/git status .*done/u);
  assert.match(all(pageRows(asPage(processesSheet(DATA,{selectedId:'s1:a'})).panel,120,26)),/Output file/u);
  assert.equal(processDuration(3_725_000),'1h 02m');assert.equal(processDuration(null),'');
});

test('tester 01/11: a stop is seen at once and counted; past 10 s it says it did not stop; s is offered only on a running row',()=>{
  const key='s1:b';
  const asked=all(pageRows(asPage(processesSheet({...DATA,stopping:{[key]:READ-3_000},now:READ},{selectedId:key})).panel,120,26));
  assert.match(asked,/npm test .*stopping… .*3 s/u,'R2: «stopping…» with its seconds, at once');
  const late=all(pageRows(asPage(processesSheet({...DATA,stopping:{[key]:READ-12_000},now:READ},{selectedId:key})).panel,120,26));
  assert.match(late,/npm test .*still running/u);assert.match(late,/asked to stop 12 s ago/u);
  const detail=processDetail({...DATA,stopping:{[key]:READ-12_000},now:READ},key,200).map(row=>row.map(segment=>segment.text).join('')).join(' ');
  assert.match(detail,/Asked to stop 12 s ago and still running: s asks again\./u,'the whole sentence in the detail');
  /* a running row counts its time from its start between two reads of the ledger */
  assert.match(all(pageRows(asPage(processesSheet({...DATA,now:READ+20_000},{selectedId:key})).panel,120,26)),/npm test .*1m 00s/u);
  /* R4: on a finished row the key bar does not offer s; on a running one it does */
  assert.doesNotMatch(all(pageRows(asPage(processesSheet(DATA,{filterAt:1,selectedId:'s1:c'})).panel,120,26)),/ s stop /u);
  assert.match(all(pageRows(asPage(processesSheet(DATA,{selectedId:key})).panel,120,26)),/ s stop /u);
  assert.equal(processesSheet(DATA).context?.ticking,true,'alive while something runs');
  assert.equal(processesSheet({...DATA,rows:[DATA.rows[3]!]}).context?.ticking,undefined,'no beat with nothing running');
});

test('tester 01/11: Tab changes the filter, the key bar says so; the empty page invites to nothing',()=>{
  const page=asPage(processesSheet(DATA));
  assert.match(all(pageRows(page.panel,120,26)),/tab next filter/u,'R3: the key is said');
  const next=press(page,'Tab').sheet!;const body=next.panel.tabs[0]!.body;
  assert.equal(body.kind==='list'?body.filterAt:-1,1,'R3: Tab goes to Finished');
  const none=all(pageRows(asPage(processesSheet({...DATA,rows:[]})).panel,120,26));
  assert.doesNotMatch(none,/to add one/u,'R1: no invitation to press a');
});

test('s stops the one under the cursor; on a finished one it says so, without an error; a twice stops every running one',()=>{
  assert.deepEqual(press(asPage(processesSheet(DATA,{selectedId:'s1:b'})),'s').action,{kind:'processes',verb:'stop',sessionId:'s1',toolCallId:'b'});
  const done=press(asPage(processesSheet(DATA,{filterAt:1,selectedId:'s1:c'})),'s').action;
  assert.equal(done?.kind,'notice');assert.match((done as any).text,/Already finished: npm audit/u);
  const asked=press(asPage(processesSheet(DATA)),'a');assert.equal(asked.action,null,'tester N3: the question is not a line in the chat');
  assert.match(all(pageRows(asked.sheet!.panel,120,26)),/Stop 2 running commands\?/u);
  assert.deepEqual(press(asked.sheet!,'a').action,{kind:'processes',verb:'stopAll'});
  const back=press(asked.sheet!,'r').sheet!;assert.equal(press(back,'a').action,null,'another key takes the question back: this a only asks again');
  assert.doesNotMatch(all(pageRows(back.panel,120,26)),/Stop 2 running commands\?/u,'and the row goes with it');
  assert.equal(press(asPage(processesSheet({...DATA,rows:[DATA.rows[3]!]})),'a').action,null,'nothing to stop: a does nothing');
});

test('tester N1: each filter says its own emptiness, also after a Tab, and Running says where the finished ones are',()=>{
  const onlyRunning={...DATA,rows:[DATA.rows[0]!]},onlyFinished={...DATA,rows:[DATA.rows[3]!]};
  const shown=all(pageRows(press(asPage(processesSheet(onlyRunning)),'Tab').sheet!.panel,120,26));
  assert.match(shown,/Nothing finished yet\./u,'one runs, none finished');
  assert.doesNotMatch(shown,/Nothing runs now/u);
  assert.match(all(pageRows(asPage(processesSheet(onlyFinished)).panel,120,26)),/Nothing runs now\. 1 finished: tab shows them\./u);
  assert.match(all(pageRows(asPage(processesSheet({...DATA,rows:[]})).panel,120,26)),/Nothing has run in the chats/u,'a window with nothing at all says that');
});

test('tester N2: at 80 columns the question of «stop all» is whole, and how to confirm it can be read',()=>{
  const asked=press(asPage(processesSheet(DATA)),'a').sheet!;
  const text=all(pageRows(asked.panel,80,24)).replace(/\s+/gu,' ');
  assert.match(text,/Stop 2 running commands\? The chats go on; what they already wrote stays\. a confirm · any other key keeps them/u);
});

test('tester N3 and N4: the question leaves when nothing runs; «a stop all» is offered only with something to stop',()=>{
  const asked=press(asPage(processesSheet(DATA)),'a').sheet!;
  const after=processesRedraw(asked,{...DATA,rows:DATA.rows.slice(2)});
  assert.equal(after.context?.processesStopAll,undefined,'nothing left to stop: not armed any more');
  const shown=all(pageRows(after.panel,120,26));
  assert.doesNotMatch(shown,/Stop \d running commands/u);assert.doesNotMatch(shown,/a stop all/u);
  assert.match(all(pageRows(asPage(processesSheet(DATA)).panel,120,26)),/a stop all/u);
});

test('Desktop review 02/11 P1: the live redraw keeps a «stop all» waiting for its second a, and the row, the filter and the search',()=>{
  const asked=press(asPage(processesSheet(DATA)),'a');
  assert.equal(asked.sheet?.context?.processesStopAll,true,'the first a arms');
  const redrawn=processesRedraw(asked.sheet!,{...DATA,now:READ+500});
  assert.equal(redrawn.context?.processesStopAll,true,'the redraw keeps it');
  assert.deepEqual(press(asPage(redrawn),'a').action,{kind:'processes',verb:'stopAll'},'so the second a stops them all');
  /* the row, the filter and a search under way survive the redraw too */
  const finished=press(asPage(processesSheet(DATA,{filterAt:1,selectedId:'s1:d'})),'/').sheet!;
  const typed=['g','i','t'].reduce((sheet,key)=>press(sheet,key).sheet!,finished);
  const again=processesRedraw(typed,{...DATA,now:READ+500});const body=again.panel.tabs[0]!.body;
  assert.equal(body.kind==='list'?body.filterAt:-1,1);assert.equal(body.kind==='list'?body.filter:'','git');assert.equal(body.kind==='list'?body.filtering:false,true);
  assert.equal(processesRedraw(null,DATA).context?.processesStopAll,undefined,'a page opened fresh is not armed');
});
