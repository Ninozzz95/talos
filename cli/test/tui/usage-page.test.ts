/* C5 of the redesign: the «CLI usage» page, from the record of the turns: the days add up, the money stays unknown until a turn has a price, and the charts fit. */
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {readUsageHistory,usageHistory,type UsageRecordLine} from '../../src/sessions/usage-record.ts';
import {USAGE_CHART_DAYS,usageByDayRows,usageByModelRows,usageCalendarRows,usageCalendarValues,usageDayStep,usageEmptyRows} from '../../src/tui/panel/usage-page.ts';
import {displayWidth} from '../../src/tui/text-width.ts';

const NOW=new Date(2026,10,1,12);
const at=(daysAgo:number,hour=10)=>new Date(2026,10,1-daysAgo,hour).toISOString();
const line=(over:Partial<UsageRecordLine>):UsageRecordLine=>({at:at(0),session:'a',model:'openai:sol-6.1',in:100,out:20,cached:5,usd:null,...over});
const text=(row:readonly {text:string}[])=>row.map(segment=>segment.text).join('');

test('every day of the period is there, today last, and the turns of a day add up by model',()=>{
  const history=usageHistory([line({usd:0.5}),line({session:'b',model:'qwen3',in:50,out:0}),line({at:at(1),usd:null}),line({at:at(90)})],NOW);
  assert.equal(history.days.length,60);
  assert.equal(history.days.at(-1)!.date,'2026-11-01');assert.equal(history.days.at(-2)!.date,'2026-10-31');
  const today=history.days.at(-1)!;
  assert.deepEqual({tokens:today.tokens,sessions:today.sessions.length,turns:today.turns,usd:today.usd,byModel:today.byModel},{tokens:170,sessions:2,turns:2,usd:0.5,byModel:{'sol-6.1':120,qwen3:50}});
  assert.equal(history.days.at(-2)!.usd,null,'a day with no price has no money, not zero');
  assert.deepEqual(history.models,['sol-6.1','qwen3'],'who spent most first; the turn out of the period counts for nothing');
  assert.deepEqual(usageHistory([line({model:'small',in:1,out:0}),line({model:'big'})],NOW).models,['big','small'],'whatever the order of the turns');
});

test('the record is read as it is on disk: none, empty, torn lines, nothing in the period',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'usage-page-'));
  try{
    const file=join(dir,'p.jsonl');
    assert.equal(await readUsageHistory(file,{now:NOW}),null);
    writeFileSync(file,`${JSON.stringify(line({at:at(90)}))}\n`);assert.equal(await readUsageHistory(file,{now:NOW}),null);
    writeFileSync(file,`${JSON.stringify(line({}))}\n{"at":"2026-\n`);
    assert.equal((await readUsageHistory(file,{now:NOW}))!.days.at(-1)!.turns,1);
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('←/→ stay inside the two weeks of the chart, and a click names its day',()=>{
  assert.equal(usageDayStep(59,'ArrowRight',60),59);assert.equal(usageDayStep(59,'ArrowLeft',60),58);
  assert.equal(usageDayStep(60-USAGE_CHART_DAYS,'ArrowLeft',60),60-USAGE_CHART_DAYS);
  assert.equal(usageDayStep(59,'uday:50',60),50);assert.equal(usageDayStep(59,'uday:3',60),60-USAGE_CHART_DAYS,'a day off the chart cannot be chosen');
  assert.equal(usageDayStep(59,'x',60),59);
});

test('By day fits every width, shows the chosen day and clicks on its columns',()=>{
  const history=usageHistory([line({usd:0.25}),line({at:at(2),model:'qwen3'})],NOW);
  for(const width of [40,60,80,120,200]){
    const rows=usageByDayRows(history,59,width,24);
    assert.ok(rows.every(row=>displayWidth(text(row))<=width),`too wide at ${width}`);
  }
  assert.ok(usageByModelRows(history,40).every(row=>displayWidth(text(row))<=40));assert.ok(usageCalendarRows(history,40,NOW).every(row=>displayWidth(text(row))<=40));
  const rows=usageByDayRows(history,57,120,24),lines=rows.map(text).join('\n');
  assert.match(lines,/Tokens per day, by model {2}last two weeks · peak 120 · average 17/u);
  assert.match(lines,/Fri, Oct 30|Fri 30 Oct|Oct 30/u);assert.match(lines,/120 tokens · 1 session · 1 turn/u);assert.match(lines,/qwen3 +120 +100%/u);
  assert.doesNotMatch(lines,/\$/u,'that day has no price');
  assert.match(usageByDayRows(history,59,120,24).map(text).join('\n'),/\$0\.25/u);
  assert.ok(rows.flat().some(segment=>segment.action==='uday:59'));
  assert.ok(rows.flat().some(segment=>segment.text.startsWith('▲')));
});

test('without colour or Unicode the charts still say it, in plain cells',()=>{
  const history=usageHistory([line({})],NOW),mode={color:false,unicode:false};
  const all=[...usageByDayRows(history,59,80,24,mode),...usageByModelRows(history,80,mode),...usageCalendarRows(history,80,NOW,mode)];
  assert.ok(all.flat().every(segment=>!segment.roles.some(role=>/^[fg]:/u.test(role))||segment.text===''),'no colour');
  /* the middle dot is the UI's own separator, in every terminal */
  assert.ok(all.every(row=>/^[\x20-\x7e]*$/u.test(text(row).replaceAll('·',''))),'plain ASCII');
});

test('By model sums the two weeks, each spending once, with its share and its peak',()=>{
  const history=usageHistory([line({usd:1}),line({model:'qwen3',in:60,out:0,session:'b'}),line({at:at(30)})],NOW);
  const lines=usageByModelRows(history,100).map(text).join('\n');
  assert.match(lines,/sol-6\.1 .* 120 +67%/u);assert.match(lines,/qwen3 .* 60 +33%/u);assert.match(lines,/peak 120/u);
  assert.match(lines,/2 sessions · 2 turns · \$1\.00/u);
  const twoDays=usageHistory([line({}),line({at:at(1)})],NOW);
  assert.match(usageByModelRows(twoDays,100).map(text).join('\n'),/1 session · 2 turns/u,'a session over two days is one session');
});

test('the calendar runs by true weeks from Monday, at most nine of them, and says what a square is',()=>{
  const history=usageHistory([line({})],NOW);
  const values=usageCalendarValues(history.days,9,NOW);
  assert.equal(values.length,63);
  assert.equal(values[8*7+6],120,'1 November 2026 is a Sunday: the last square of the last week');
  assert.equal(values.reduce((sum,value)=>sum+value,0),120);
  const rows=usageCalendarRows(history,200,NOW);
  assert.match(text(rows[0]!),/Calendar {2}9 weeks · each square is a day/u);
});

test('an empty record says so',()=>{
  assert.match(usageEmptyRows(60).map(text).join('\n'),/No usage recorded in this project yet\./u);
});
