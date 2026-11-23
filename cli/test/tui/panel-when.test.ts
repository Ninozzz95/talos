/* Stage 7.4: when something happened, as the approved mockup's /history and /resume say it. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {panelWhen} from '../../src/tui/panel/when.ts';

/* Friday 2 October 2026, 15:30 UTC, read in UTC (offset 0) */
const now=Date.UTC(2026,9,2,15,30);
const at=(d:number,h:number,m:number)=>Date.UTC(2026,9,d,h,m);

test('now, minutes and hours today, yesterday, the weekday inside the week, then the date',()=>{
  const when=(ms:number,ago=false)=>panelWhen(ms,{now,ago,offsetMinutes:0});
  assert.equal(when(at(2,15,29)+30_000),'now');
  assert.equal(when(at(2,15,16)),'14 min');
  assert.equal(when(at(2,13,25)),'2 h');
  assert.equal(when(at(2,13,25),true),'2 h ago','the /resume list says «ago»');
  assert.equal(when(at(2,0,5)),'15 h','still today');
  assert.equal(when(at(1,23,50)),'yesterday','before midnight is yesterday');
  assert.equal(when(Date.UTC(2026,8,28,9,0)),'Mon',"a day of this week: Monday 28 September");
  assert.equal(when(Date.UTC(2026,8,27,9,0)),'Sep 27','a week or more: the date');
  assert.equal(panelWhen('not a date',{now}),'');
  assert.equal(panelWhen(null,{now}),'');
});

test('the time zone decides what is today and yesterday',()=>{
  /* 23:50 UTC on 1 October is 01:50 on 2 October in UTC+2 (offset -120): today, not yesterday */
  assert.equal(panelWhen(at(1,23,50),{now,offsetMinutes:-120}),'15 h');
  assert.equal(panelWhen(at(1,23,50),{now,offsetMinutes:0}),'yesterday');
});

test('the edges: one minute is «1 min», sixty are «1 h»; a time ahead of the clock is «now»',()=>{
  const when=(ms:number)=>panelWhen(ms,{now,offsetMinutes:0});
  assert.equal(when(now-59_999),'now');
  assert.equal(when(now-60_000),'1 min');
  assert.equal(when(now-59*60_000),'59 min');
  assert.equal(when(now-60*60_000),'1 h');
  assert.equal(when(now+5*60_000),'now','a clock that runs ahead does not say «-5 min»');
});
