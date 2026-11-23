/* C9 of the redesign: Research as a page. The state of each run in words, how its claims stood up, the Evidence, and the center's keys. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {researchSheet,sheetStep,type SheetState} from '../../src/tui/panel/commands.ts';
import {researchGroup,type ResearchData} from '../../src/tui/panel/research-page.ts';
import {asPage,pageRows} from '../../src/tui/panel/page.ts';
import {panelKey} from '../../src/tui/panel/sheet.ts';

const all=(rows:readonly (readonly {text:string}[])[])=>rows.map(row=>row.map(segment=>segment.text).join('')).join('\n');
const press=(sheet:SheetState,key:string)=>sheetStep(sheet,panelKey(sheet.panel,{name:key}));
const source={number:1,url:'https://example.org/a',title:'Paper A',publishedAt:null,obtained:null};
const DONE={id:'r1',question:'Which CLI agents keep a plan file?',name:null,status:'done',startedAt:'2026-11-01T10:00:00Z',finishedAt:null,phase:'done',progress:{done:4,total:4},journal:{events:9,skippedRows:0},
  summary:'Two of the three do.',verification:{total:3,supported:2,partial:0,unsupported:1,unchecked:0,contested:0},sources:[source],
  claims:[{number:1,text:'Agent X writes PLAN.md',source,passage:'it writes PLAN.md at start',quotePresent:true,verification:'yes',reason:'The quote says so.',judge:null,judgedAt:null,opposing:null},
    {number:2,text:'Agent Y keeps no plan',source:null,passage:'',quotePresent:null,verification:'no',reason:null,judge:null,judgedAt:null,opposing:null}],plan:null,steps:null,spent:null,expectedCost:null} as any;
const DATA:ResearchData={state:'ready',error:null,rows:[DONE,{id:'r2',question:'How fast is X?',name:null,status:'collecting',startedAt:'2026-11-01T11:00:00Z',finishedAt:null},{id:'r3',question:'Old one',name:null,status:'giri-esauriti',startedAt:null,finishedAt:null}],
  details:new Map([['r1',DONE]])};

test('the runs say their state in words, and the detail how the claims stood up',()=>{
  const shown=all(pageRows(asPage(researchSheet(DATA,{selectedId:'r1'})).panel,120,26));
  assert.match(shown,/── Research Questions researched on the web, with their sources/u);
  assert.match(shown,/All 3 +Running 1 +Paused 0 +Done 1 +Stopped 1/u);
  assert.match(shown,/Done · 4\/4/u);assert.match(shown,/Collecting sources/u);assert.match(shown,/Ran out of turns/u);
  assert.match(shown,/Claims +2 supported · 0 partly · 1 not supported/u);assert.match(shown,/Two of the three do\./u);
  assert.match(all(pageRows(asPage(researchSheet(DATA,{selectedId:'r2'})).panel,120,26)),/Its detail is read when you choose it: press Enter\./u);
  assert.equal(researchGroup('bloccata-dal-permesso'),'stopped');assert.equal(researchGroup('planning'),'running');
});

test('the Evidence lists each claim with its verdict, source and passage',()=>{
  const shown=all(pageRows(asPage(researchSheet(DATA,{selectedId:'r1',tab:1})).panel,120,26));
  assert.match(shown,/Agent X writes PLAN\.md .*supported/u);assert.match(shown,/Agent Y keeps no plan .*not supported/u);
  assert.match(shown,/\[1\] Paper A/u);assert.match(shown,/“it writes PLAN\.md at start”/u);assert.match(shown,/The quote says so\./u);
});

test('the keys are the center\'s acts, and cancel asks a second c',()=>{
  const page=asPage(researchSheet(DATA,{selectedId:'r2'}));
  assert.deepEqual(press(page,'p').action,{kind:'research',verb:'pause',id:'r2'});
  assert.deepEqual(press(page,'r').action,{kind:'research',verb:'resume',id:'r2'});
  assert.deepEqual(press(page,'e').action,{kind:'research',verb:'export',id:'r2'});
  assert.deepEqual(press(page,'Enter').action,{kind:'research',verb:'open',id:'r2'});
  const asked=press(page,'c');assert.equal(asked.action?.kind,'notice');
  assert.deepEqual(press(asked.sheet!,'c').action,{kind:'research',verb:'cancel',id:'r2'});
  assert.equal(press(press(asked.sheet!,'p').sheet!,'c').action?.kind,'notice','another key takes the question back');
});
