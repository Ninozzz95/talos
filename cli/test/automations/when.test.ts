/* 0.6.6 (owner 14/10, «Una frase breve»): the --when phrase → the kernel's schedule, checked by the kernel's own normalizer. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {describeWhen,parseWhen,WHEN_FORMS} from '../../src/automations/when.ts';

const KERNEL=new URL('../../../harness-ui/src/automation-pianificazione.mjs',import.meta.url);

test('every documented form reads, and the kernel accepts what it becomes',async()=>{
  const {normalizzaPianificazione}=await import(KERNEL.href);
  for(const form of WHEN_FORMS)assert.doesNotThrow(()=>normalizzaPianificazione(parseWhen(form)),form);
  assert.deepEqual(parseWhen('every 30m'),{tipo:'ogni-n-minuti',minuti:30});
  assert.deepEqual(parseWhen('every 2h'),{tipo:'ogni-n-minuti',minuti:120});
  assert.deepEqual(parseWhen('Every 45 Minutes'),{tipo:'ogni-n-minuti',minuti:45});
  assert.deepEqual(parseWhen('hourly'),{tipo:'ogni-ora',minuto:0});
  assert.deepEqual(parseWhen('hourly :15'),{tipo:'ogni-ora',minuto:15});
  assert.deepEqual(parseWhen('daily 9:05'),{tipo:'giornaliera',ora:'09:05'});
  assert.deepEqual(parseWhen('every day at 18:30'),{tipo:'giornaliera',ora:'18:30'});
  assert.deepEqual(parseWhen('weekdays 09:00'),{tipo:'feriali',ora:'09:00'});
  assert.deepEqual(parseWhen('weekly mon 09:00'),{tipo:'settimanale',ora:'09:00',giorno:1});
  assert.deepEqual(parseWhen('every sunday 20:00'),{tipo:'settimanale',ora:'20:00',giorno:0});
  assert.deepEqual(parseWhen('once 2026-10-20 09:00'),{tipo:'una-volta',quando:'2026-10-20T09:00'});
  assert.deepEqual(parseWhen('cron "0 9 * * 1-5"'),{tipo:'cron',espressione:'0 9 * * 1-5'});
  assert.deepEqual(parseWhen('manual'),{tipo:'manuale'});
});

test('the kernel still keeps its rules: every 3 minutes is too often, and a cron with four fields is refused',async()=>{
  const {normalizzaPianificazione}=await import(KERNEL.href);
  assert.throws(()=>normalizzaPianificazione(parseWhen('every 3m')),{code:'AUTOMATION_SCHEDULE_TOO_FREQUENT'});
  assert.throws(()=>normalizzaPianificazione(parseWhen('cron "0 9 * *"')),{code:'AUTOMATION_CRON_FIELDS'});
});

test('a phrase that is not one of the forms is refused with the forms, never guessed',()=>{
  for(const phrase of ['tomorrow morning','daily 25:00','weekly funday 09:00','every','once 2026-10-20','every 0m','hourly :75'])
    assert.throws(()=>parseWhen(phrase),(error:any)=>error.code==='AUTOMATION_WHEN_INVALID'&&/every 30m/u.test(error.message),phrase);
});

test('the phrase back from the kernel\'s schedule, as list shows it',()=>{
  for(const form of ['every 30m','every 2h','hourly','hourly :15','daily 09:00','weekdays 09:00','weekly mon 09:00','once 2026-10-20 09:00','cron "0 9 * * 1-5"','manual'])
    assert.equal(describeWhen(parseWhen(form)),form);
  assert.equal(describeWhen({tipo:'boh'}),'unknown');
});
