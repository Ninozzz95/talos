/* The adversarial review of the redesign block (01/11): each finding it verified, as a test that fails on the old code. */
import assert from 'node:assert/strict';
import test from 'node:test';
import * as plan from '../../../harness-ui/src/automation-pianificazione.mjs';
import {automationCalendar,type AutomationCenterRow} from '../../src/services/automation-facade.ts';
import {automationsSheet,researchSheet,sheetStep,type SheetState} from '../../src/tui/panel/commands.ts';
import {automationCalendarRows,type AutomationsData} from '../../src/tui/panel/automations-page.ts';
import {boardKeep,type BoardRow} from '../../src/tui/panel/board.ts';
import type {ResearchData} from '../../src/tui/panel/research-page.ts';
import {asPage,pageRows} from '../../src/tui/panel/page.ts';
import {panelKey,S} from '../../src/tui/panel/sheet.ts';

const all=(rows:readonly (readonly {text:string}[])[])=>rows.map(row=>row.map(segment=>segment.text).join('')).join('\n');
const press=(sheet:SheetState,key:string)=>sheetStep(sheet,panelKey(sheet.panel,{name:key}));
const NOW=new Date(2026,10,2,10,30);
const row=(id:string,fields:Partial<AutomationCenterRow>={}):AutomationCenterRow=>({id,name:id,active:true,legacy:false,schedule:'daily 09:00',timezone:null,nextRunAt:null,folder:'C:/p',mode:'acceptEdits',model:null,
  instructions:`Do ${id}`,runsLeft:null,running:false,lastRunAt:null,plan:{tipo:'giornaliera',ora:'09:00'},...fields});
const DATA:AutomationsData={state:'ready',error:null,review:[],runs:new Map(),calendar:{from:NOW.toISOString(),days:7,rows:[]},
  rows:[row('a1'),row('p1',{active:false}),row('a2'),row('p2',{active:false})]};

test('ALTO 1: with a filter on, the row kept after an action is the one acted on, and the next key acts on it again',()=>{
  /* Paused shows p1 and p2; the page read again after space on p1 must still have p1 under the cursor */
  const paused=asPage(automationsSheet(DATA,{now:NOW.getTime(),filterAt:2,selectedId:'p1'}));
  assert.deepEqual(press(paused,'space').action,{kind:'automation',verb:'resume',id:'p1'});
  const again=asPage(automationsSheet(DATA,{now:NOW.getTime(),filterAt:2,selectedId:'p2'}));
  assert.deepEqual(press(again,'space').action,{kind:'automation',verb:'resume',id:'p2'});
  /* the second d deletes the row the cursor is on, not the first one */
  const chosen=asPage(automationsSheet(DATA,{now:NOW.getTime(),selectedId:'a2'}));
  const asked=press(chosen,'d').sheet!;
  assert.deepEqual(press(asked,'d').action,{kind:'automation',verb:'delete',id:'a2'});
});

test('MEDIO 4: across the change of the clock the days keep their names and the runs their hours',()=>{
  const before=process.env.TZ;process.env.TZ='Europe/Rome';
  try{
    const now=new Date(2026,9,24,10,30);/* Saturday 24 October; Rome goes back an hour in the night of the 25th */
    const rows=[row('d',{plan:{tipo:'giornaliera',ora:'09:00'}})];
    const calendar=automationCalendar(rows,plan,{now});
    assert.deepEqual(calendar.rows[0]!.hours,[1,2,3,4,5,6].map(day=>day*24+9),'09:00 every day, the 25th included');
    const lines=automationCalendarRows({...DATA,rows,calendar},120,now.getTime()).map(line=>line.map(segment=>segment.text).join(''));
    const days=lines.filter(line=>/^ (Sat|Sun|Mon|Tue|Wed|Thu|Fri) \d\d/u.test(line)).map(line=>line.slice(1,7));
    assert.deepEqual(days,['Sat 24','Sun 25','Mon 26','Tue 27','Wed 28','Thu 29','Fri 30'],'no day twice, none missing');
  }finally{if(before===undefined)delete process.env.TZ;else process.env.TZ=before;}
});

test('ALTO 2: text from outside never brings a control or bidi character to the terminal',()=>{
  assert.equal(S('a\u001b]52;c;aGk=\u0007b\u202ec').text,'a ]52;c;aGk= b c');
  const research:ResearchData={state:'ready',error:null,rows:[{id:'r1',question:'Q\u001b[2J',name:null,status:'done',startedAt:null,finishedAt:null}],
    details:new Map([['r1',{id:'r1',question:'Q',name:null,status:'done',startedAt:null,finishedAt:null,phase:'done',progress:null,journal:null,summary:'S\u001b]0;title\u0007',verification:null,sources:null,claims:null,plan:null,steps:null,spent:null,expectedCost:null} as any]])};
  /* the rows are joined with line breaks here, so the line break is the one control character allowed in what is checked */
  assert.doesNotMatch(all(pageRows(asPage(researchSheet(research)).panel,120,20)),/[\u0000-\u0009\u000b-\u001f\u007f]/u);
});

test('MEDIO 5: Tab to Evidence shows the run under the cursor now',()=>{
  const detail=(id:string,claim:string)=>({id,question:id,name:null,status:'done',startedAt:null,finishedAt:null,phase:'done',progress:null,journal:null,summary:null,verification:null,sources:[],
    claims:[{number:1,text:claim,source:null,passage:'',quotePresent:null,verification:'yes',reason:null,judge:null,judgedAt:null,opposing:null}],plan:null,steps:null,spent:null,expectedCost:null}) as any;
  const data:ResearchData={state:'ready',error:null,rows:[{id:'A',question:'A',name:null,status:'done',startedAt:null,finishedAt:null},{id:'B',question:'B',name:null,status:'done',startedAt:null,finishedAt:null}],
    details:new Map([['A',detail('A','Claim of A')],['B',detail('B','Claim of B')]])};
  const page=asPage(researchSheet(data,{selectedId:'A'}));
  const down=sheetStep(page,panelKey(page.panel,{name:'ArrowDown'})).sheet!;
  const evidence=sheetStep(down,panelKey(down.panel,{name:'Tab'})).sheet!;
  const shown=all(pageRows(evidence.panel,120,20));
  assert.match(shown,/Claim of B/u);assert.doesNotMatch(shown,/Claim of A/u);
});

test('MEDIO 7: the Board read again keeps the chosen conversation by its id',()=>{
  const r=(id:string,state:BoardRow['state']):BoardRow=>({id,title:id,state,model:null,tokens:null,when:''});
  const before=[r('x','progress'),r('y','concluded'),r('z','concluded')];
  const after=[r('new','progress'),r('x','progress'),r('y','concluded'),r('z','concluded')];
  assert.deepEqual(boardKeep(before,after,{table:2,pick:{lane:0,card:0}}).table,3,'z stays chosen in the table');
  const kept=boardKeep(before,after,{pick:{lane:0,card:0}});
  assert.equal(after.filter(row=>row.state==='progress')[kept.pick.card]?.id,'x','x stays chosen in its lane');
});
