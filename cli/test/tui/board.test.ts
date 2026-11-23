/* C6 of the redesign: a session's state by the PC's cascade, the Conversations page with its filters, order and selection, and the Board with its table and lanes. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {boardSheet,resumeSheet,sheetStep,type ResumeRow,type SheetState} from '../../src/tui/panel/commands.ts';
import {boardCardAt,boardFilterRow,boardLaneRows,boardMove,boardTableRows,type BoardRow} from '../../src/tui/panel/board.ts';
import {asPage,pageRows} from '../../src/tui/panel/page.ts';
import {listItems,panelKey} from '../../src/tui/panel/sheet.ts';
import {sessionState} from '../../src/tui/session-state.ts';
import {displayWidth} from '../../src/tui/text-width.ts';

const text=(row:readonly {text:string}[])=>row.map(segment=>segment.text).join('');
const all=(rows:readonly (readonly {text:string}[])[])=>rows.map(text).join('\n');
const press=(sheet:SheetState,key:string)=>sheetStep(sheet,panelKey(sheet.panel,{name:key}));

test('the cascade: the first that holds wins, as on the PC',()=>{
  assert.equal(sessionState({waiting:true,interrupted:true,outcome:'interrupted'}),'waiting','a question can still be answered after a restart');
  assert.equal(sessionState({interrupted:true,open:true}),'interrupted','nobody runs it, even if it reads as open');
  assert.equal(sessionState({open:true,outcome:'unknown'}),'progress','an open conversation with an earlier outcome');
  assert.equal(sessionState({outcome:'running'}),'progress');
  assert.equal(sessionState({outcome:'completed',agentsWorking:2}),'progress','its agents still work');
  assert.equal(sessionState({outcome:'failed'}),'toResume','the last turn in error does not judge the chat');
  assert.equal(sessionState({outcome:'stopped'}),'concluded');assert.equal(sessionState({outcome:'completed'}),'concluded');
  assert.equal(sessionState({outcome:'unknown'}),'unknown');assert.equal(sessionState({}),'unknown');
});

const row=(id:string,state:ResumeRow['state'],over:Partial<ResumeRow>={}):ResumeRow=>({id,title:`Session ${id}`,at:null,messages:2,branch:null,model:null,current:false,you:null,answer:null,state,...over});
const ROWS=[row('a','progress',{current:true}),row('b','toResume'),row('c','concluded'),row('d','interrupted')];
const page=(sheet:SheetState)=>asPage(sheet);
const resume=()=>page(resumeSheet(ROWS,{project:'p'}));
const items=(sheet:SheetState)=>{const body=sheet.panel.tabs[0]!.body;return body.kind==='list'?listItems(body):[];};

test('Conversations: filters with their counts, and each row says the word of its filter',()=>{
  const shown=all(pageRows(resume().panel,120,24));
  assert.match(shown,/All 4 .*In progress 1 .*Waiting for you 0 .*Concluded 1 .*To resume 1 .*Interrupted 1/u);
  assert.doesNotMatch(shown,/stopped/iu);
  assert.match(items(resume())[1]!.desc!,/^to resume · /u);
  const onlyResume=[...Array(4)].reduce((sheet:SheetState)=>press(sheet,']').sheet!,resume());
  assert.deepEqual(items(onlyResume).map(item=>item.id),['b']);
  assert.match(all(pageRows(onlyResume.panel,120,24)),/The last turn stopped on an error\./u);
});

test('o reverses the order and keeps the place; v selects, space marks, a marks what the filter shows',()=>{
  const flipped=press(press(resume(),'ArrowDown').sheet!,'o');
  assert.deepEqual(items(flipped.sheet!).map(item=>item.id),['d','c','b','a']);
  assert.deepEqual(flipped.action,{kind:'notice',text:'Order: Least recent'});
  const body=flipped.sheet!.panel.tabs[0]!.body;assert.equal(body.kind==='list'?body.sel:-1,1,'the place stays');
  let sheet=press(resume(),'v').sheet!;
  assert.match(all(pageRows(sheet.panel,120,24)),/Select sessions/u);
  sheet=press(press(sheet,'ArrowDown').sheet!,' ').sheet!;
  assert.match(all(pageRows(sheet.panel,120,24)),/1 selected/u);
  sheet=press(sheet,']').sheet!;sheet=press(sheet,']').sheet!;sheet=press(sheet,']').sheet!;
  sheet=press(sheet,'a').sheet!;
  assert.deepEqual([...sheet.context!.resume!.options.chosen!],['c'],'what the filter shows, and only that');
  assert.equal(press(press(sheet,'v').sheet!,'v').sheet!.context!.resume!.options.chosen!.size,0);
});

test('with a selection: the ids are copied, the transcripts exported, and d says how many and that it cannot be undone',()=>{
  let sheet=press(resume(),'v').sheet!;
  sheet=press(press(sheet,'ArrowDown').sheet!,' ').sheet!;sheet=press(press(sheet,'ArrowDown').sheet!,' ').sheet!;
  assert.deepEqual(press(sheet,'c').action,{kind:'copy',text:'b\nc',notice:'2 ids copied'});
  assert.deepEqual(press(sheet,'e').action,{kind:'exportSessions',ids:[{id:'b',title:'Session b'},{id:'c',title:'Session c'}]});
  const asked=press(sheet,'d').sheet!;
  assert.match(all(pageRows(asked.panel,160,24)),/Delete 2 sessions\? Their transcripts are removed from disk\. This cannot be undone\. d confirm · esc cancel/u);
  assert.deepEqual(press(asked,'d').action,{kind:'deleteSessions',ids:['b','c']});
  assert.equal(press(asked,'Escape').action,null);
});

test('the one in use cannot be deleted with the others, and with nothing marked d does nothing',()=>{
  const none=press(resume(),'v').sheet!;
  assert.equal(press(none,'d').action,null);assert.equal(press(none,'d').sheet!.panel.confirmDel??null,null);
  const withCurrent=press(none,' ').sheet!;
  assert.equal((press(withCurrent,'d').action as {kind:string}).kind,'notice');
});

const card=(id:string,state:BoardRow['state'],over:Partial<BoardRow>={}):BoardRow=>({id,title:`Work ${id}`,state,model:'openai:sol-6.1',tokens:1200,when:'2m',...over});
const BOARD=[card('p','progress'),card('w','waiting'),card('r','toResume'),card('i','interrupted'),card('c','concluded')];

test('the table comes first, shows only true columns, and fits',()=>{
  const sheet=page(boardSheet(BOARD));
  assert.deepEqual(sheet.panel.tabs.map(tab=>tab.name),['Table','Lanes']);
  const shown=all(pageRows(sheet.panel,120,24));
  assert.match(shown,/── Board What is running, how it went/u);assert.match(shown,/Session +State +Model +Tokens +Started/u);
  assert.doesNotMatch(shown,/First token|Cache|Closed by|steps/u);
  assert.match(shown,/Work r +↻ To resume +sol-6\.1 +1\.2k +2m/u);
  for(const width of [40,60,80,100,160])assert.ok(boardTableRows(BOARD,{width,selected:0}).every(row=>displayWidth(text(row))<=width),`too wide at ${width}`);
  assert.doesNotMatch(text(boardTableRows([card('x','unknown',{tokens:null})],{width:120,selected:0})[2]!),/ 0 /u,'a row with no tokens says nothing, not zero');
  assert.match(all(boardTableRows([],{width:80,selected:0})),/No sessions here\./u);
});

test('four lanes, To resume says how many were interrupted, and the cards never spill',()=>{
  const lanes=all(boardLaneRows(BOARD,{width:120,height:20,pick:{lane:0,card:0}}));
  assert.match(lanes,/In progress 1 +Waiting for you 1 +To resume 2 · 1 interrupted +Concluded 1/u);
  assert.ok(boardLaneRows(BOARD,{width:120,height:20,pick:{lane:0,card:0}}).every(row=>displayWidth(text(row))<=120));
  const narrow=all(boardLaneRows(BOARD,{width:80,height:20,pick:{lane:2,card:1}}));
  assert.match(narrow,/To resume 2 · 1 interrupted/u);assert.match(narrow,/ › ✗ Work i/u);
  const many=Array.from({length:12},(_,i)=>card(String(i),'progress'));
  const tall=boardLaneRows(many,{width:120,height:14,pick:{lane:0,card:0}});
  assert.ok(tall.length<=14);assert.match(all(tall),/↓ more/u);
  assert.match(all(boardLaneRows(BOARD,{width:120,height:20,pick:{lane:9,card:0}}).slice(0,1)),/In progress/u);
});

test('the arrows stay inside, a filter holds in both views, and Enter or a second click opens',()=>{
  assert.deepEqual(boardMove(BOARD,{lane:0,card:0},'ArrowLeft'),{lane:0,card:0});
  assert.deepEqual(boardMove(BOARD,{lane:3,card:0},'ArrowRight'),{lane:3,card:0});
  assert.deepEqual(boardMove(BOARD,{lane:2,card:0},'ArrowDown'),{lane:2,card:1});
  assert.deepEqual(boardMove(BOARD,{lane:2,card:1},'ArrowDown'),{lane:2,card:1});
  assert.equal(boardCardAt(BOARD,{lane:2,card:1})!.id,'i');
  let sheet=page(boardSheet(BOARD));
  assert.deepEqual(press(press(sheet,'ArrowDown').sheet!,'Enter').action,{kind:'resume',id:'w'});
  sheet=press(sheet,']').sheet!;
  assert.match(text(boardFilterRow(BOARD,1,100)),/All 5 .*In progress 1/u);assert.equal(sheet.context!.board!.filter,1);
  assert.deepEqual(press(sheet,'Enter').action,{kind:'resume',id:'p'});
  sheet=press(sheet,'[').sheet!;assert.equal(sheet.context!.board!.filter,0);
  sheet=press(sheet,'[').sheet!;assert.equal(sheet.context!.board!.filter,5,'it wraps');
  const lanes=press(page(boardSheet(BOARD)),'Tab').sheet!;
  assert.equal(lanes.panel.tab,1);
  const moved=press(press(lanes,'ArrowRight').sheet!,'ArrowRight').sheet!;
  assert.equal(moved.panel.tab,1,'in the lanes the arrows move the card');
  assert.deepEqual(press(moved,'Enter').action,{kind:'resume',id:'r'});
  assert.equal(press(page(boardSheet([])),'Enter').action,null);
});
