/* C9 of the redesign: Automations. The week ahead from the kernel's own schedule, the filters, and each key a real action. */
import assert from 'node:assert/strict';
import test from 'node:test';
import * as plan from '../../../harness-ui/src/automation-pianificazione.mjs';
import {automationCalendar,type AutomationCenterRow} from '../../src/services/automation-facade.ts';
import {automationsSheet,sheetStep,type SheetState} from '../../src/tui/panel/commands.ts';
import {automationCalendarRows,calendarLetter,inWords,type AutomationsData} from '../../src/tui/panel/automations-page.ts';
import {asPage,pageRows} from '../../src/tui/panel/page.ts';
import {panelKey} from '../../src/tui/panel/sheet.ts';

const text=(row:readonly {text:string}[])=>row.map(segment=>segment.text).join('');
const all=(rows:readonly (readonly {text:string}[])[])=>rows.map(text).join('\n');
const press=(sheet:SheetState,key:string)=>sheetStep(sheet,panelKey(sheet.panel,{name:key}));
const NOW=new Date(2026,10,2,10,30);
const at=(day:number,hour:number,minute=0)=>new Date(2026,10,2+day,hour,minute).toISOString();
const row=(id:string,plan:unknown,fields:Partial<AutomationCenterRow>={}):AutomationCenterRow=>({id,name:id,active:true,legacy:false,schedule:'',timezone:null,nextRunAt:null,folder:'C:/p',mode:'acceptEdits',model:null,
  instructions:`Do ${id}`,runsLeft:null,running:false,lastRunAt:null,plan,...fields});
const ROWS=[row('audit',{tipo:'giornaliera',ora:'09:00'},{schedule:'daily 09:00',nextRunAt:at(1,9)}),row('poll',{tipo:'ogni-n-minuti',minuti:30},{schedule:'every 30m',nextRunAt:at(0,11)}),
  row('tick',{tipo:'ogni-n-minuti',minuti:1},{schedule:'every 1m',nextRunAt:at(0,10,31)}),row('later',{tipo:'giornaliera',ora:'17:00'},{schedule:'daily 17:00',active:false}),
  row('hand',{tipo:'manuale'},{schedule:'manual'}),row('old',null,{legacy:true,schedule:'old format'})];

test('the week ahead comes from the kernel\'s schedule, an hour per cell, and «every minute» costs one look per hour',()=>{
  const cal=automationCalendar(ROWS,plan,{now:NOW});
  const hours=new Map(cal.rows.map(value=>[value.id,value.hours]));
  assert.deepEqual([...hours.keys()],['audit','poll','tick'],'paused, by hand and old format are not drawn');
  assert.deepEqual(hours.get('audit'),[1,2,3,4,5,6].map(day=>day*24+9),'today\'s 09:00 is past: six runs');
  assert.equal(hours.get('poll')!.length,13+6*24,'from 11:00 today to the end of the week');
  assert.equal(hours.get('tick')!.length,14+6*24,'every minute: one mark per hour, from this hour on');
  const late=automationCalendar([row('late',{tipo:'ogni-n-minuti',minuti:30},{nextRunAt:at(0,8)})],plan,{now:NOW}).rows[0]!.hours;
  assert.equal(late[0],10,'overdue since 08:00: the 10:30 run of this hour is drawn, the past ones are not');assert.equal(late.length,14+6*24);
  let looks=0;const counted={prossimoGiro:(p:unknown,o:any)=>{looks+=1;return plan.prossimoGiro(p,o);}};
  automationCalendar([row('cron',{tipo:'cron',espressione:'* * * * *'},{schedule:'cron'})],counted,{now:NOW});
  assert.ok(looks<=7*24+1,`a cron every minute asked ${looks} times`);
});

const DATA:AutomationsData={state:'ready',rows:ROWS,error:null,calendar:automationCalendar(ROWS,plan,{now:NOW}),
  review:[{automazioneId:'audit',runId:'r2',esito:'fallita'}],runs:new Map([['audit',[{runId:'r2',esito:'fallita',finitaAlle:at(0,9),partitaAlle:at(0,9)}]]])};

test('the list says on or off, the next run and what is to review; the filters count their rows',()=>{
  const page=asPage(automationsSheet(DATA,{now:NOW.getTime()}));
  const shown=all(pageRows(page.panel,120,30));
  assert.match(shown,/── Automations runs that start by themselves/u);assert.match(shown,/All 6 +Active 4 +Paused 2 +To review 1/u);
  assert.match(shown,/\[x\] audit .*To review 1 .*next in 23 h/u);assert.match(shown,/\[ \] later .*paused/u);assert.match(shown,/old format/u);
  assert.match(shown,/daily 09:00 · last run failed/u);
  /* Frontend 01/11: the filter's word, the model that will really run, and a long folder cut in the middle so its end shows */
  const long={...DATA,defaultModel:'openrouter:qwen/qwen3-coder',rows:[{...ROWS[0]!,folder:'C:\\Users\\someone\\AppData\\Local\\Temp\\a-very-long-folder-name\\shop-api'}]};
  const detail=all(pageRows(asPage(automationsSheet(long,{now:NOW.getTime(),selectedId:'audit'})).panel,120,30));
  assert.match(detail,/Status +active/u);assert.match(detail,/Model +default \(openrouter:qwen\/qwen3-coder\)/u);assert.match(detail,/Folder +C:\\Users.*….*shop-api/u);
  assert.equal(inWords(at(0,10,20),NOW.getTime()),'due now');
});

test('each key is the store\'s action, and new asks what and when',()=>{
  const page=asPage(automationsSheet(DATA,{now:NOW.getTime(),selectedId:'audit'}));
  assert.deepEqual(press(page,'space').action,{kind:'automation',verb:'pause',id:'audit'});
  assert.deepEqual(press(page,'r').action,{kind:'automation',verb:'run',id:'audit'});
  assert.deepEqual(press(page,'Enter').action,{kind:'automation',verb:'seen',id:'audit',runIds:['r2']});
  const asked=press(page,'n').sheet!;assert.match(asked.panel.edit!.label,/What should it do\?/u);
  const when=sheetStep(asked,{panel:{...asked.panel,edit:null},effect:{kind:'edited',value:'Audit the deps'}} as any).sheet!;
  assert.match(when.panel.edit!.label,/^When\?/u);
  assert.deepEqual(sheetStep(when,{panel:{...when.panel,edit:null},effect:{kind:'edited',value:'daily 02:00'}} as any).action,{kind:'automation',verb:'add',id:'',instructions:'Audit the deps',when:'daily 02:00'});
  const edit=press(page,'e').sheet!;assert.equal(edit.panel.edit!.value,'Do audit');
  const old=asPage(automationsSheet(DATA,{now:NOW.getTime(),selectedId:'old'}));
  assert.equal(press(old,'r').action?.kind,'notice','an old-format automation cannot run');
  assert.equal(press(asPage(automationsSheet(DATA,{now:NOW.getTime(),selectedId:'poll'})),'Enter').action,null,'nothing to review, nothing done');
});

test('the Calendar draws a letter where a run is due and blanks the hours already past',()=>{
  const rows=automationCalendarRows(DATA,120,NOW.getTime()).map(text);
  assert.equal(calendarLetter(0),'A');assert.equal(calendarLetter(26),'a');
  const today=rows.find(line=>/^ Mon 02/u.test(line))!;const tomorrow=rows.find(line=>/^ Tue 03/u.test(line))!;
  assert.ok(today,'today has its row');assert.match(today,/^ Mon 02 {2}( {4}){10}C {3}\+/u,'past hours blank, 10:00 holds only «every minute», 11:00 more than one');
  assert.match(tomorrow,/\+/u);assert.match(rows.join('\n'),/A {2}audit · daily 09:00 · 6 hours with a run/u);
  assert.match(all(automationCalendarRows({...DATA,calendar:{...DATA.calendar,rows:[]}},80,NOW.getTime())),/No active automation runs in the next seven days\./u);
});
