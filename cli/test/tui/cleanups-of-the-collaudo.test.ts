/* The tester's small findings closed for 0.7.0: each one the sentence or the key the person was missing. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {agentsPill} from '../../src/tui/agents-panel.ts';
import {pageRows,asPage} from '../../src/tui/panel/page.ts';
import {modelSheet,providerSheet} from '../../src/tui/panel/commands.ts';
import {wrap} from '../../src/tui/panel/sheet.ts';
import {parseSlashCommand} from '../../src/tui/slash-commands.ts';

const words=(rows:readonly {text:string}[])=>rows.map(row=>row.text).join('');
const all=(rows:readonly (readonly {text:string}[])[])=>rows.map(row=>row.map(segment=>segment.text).join('')).join('\n');
const needs=[{state:'needs'},{state:'working'}] as any;

test('R13: a long path goes to the next row after a slash, whole names stay whole, and nothing is lost',()=>{
  const path='C:\\Users\\someone\\repo-json-repair\\background\\call_bg_2.log';
  const rows=wrap(path,20);
  assert.equal(rows.join(''),path);
  assert.ok(rows.every(row=>row.length<=20));
  assert.ok(rows.slice(0,-1).every(row=>row.endsWith('\\')||row.length===20),rows.join(' | '));
  assert.ok(rows.includes('background\\'),rows.join(' | '));
  assert.deepEqual(wrap('x'.repeat(25),10),['x'.repeat(10),'x'.repeat(10),'x'.repeat(5)],'with no slash, as before');
  assert.deepEqual(wrap('a/'+'b'.repeat(30),10)[0],'a/bbbbbbbb','a slash too early does not leave a row almost empty');
});

test('R8: /settings opens what /config opens',()=>{
  assert.equal(parseSlashCommand('/settings')?.name,'config');
});

test('N5: at 80 columns the pill says who waits for you, whole; wide, it says the rest too; with nobody waiting nothing changes',()=>{
  assert.match(words(agentsPill(needs,80)),/1 needs you/u);
  assert.doesNotMatch(words(agentsPill(needs,80)),/agents/u,'the short form, so the footer does not cut it');
  assert.match(words(agentsPill(needs,120)),/← 2 agents · 1 needs you/u);
  assert.match(words(agentsPill([{state:'working'}] as any,80)),/← 1 agent/u);
});

test('R11: a provider that needs no key does not say «no key» beside «no key needed»; one that needs it does',()=>{
  const row=(needsKey:boolean)=>({id:'x',label:'External agent',desc:'no key needed',state:'none',address:'',key:'none',needsKey,current:false});
  const shown=(needsKey:boolean)=>JSON.stringify(providerSheet([row(needsKey)] as any,{}));
  assert.doesNotMatch(shown(false),/"badge"/u);
  assert.match(shown(true),/"badge":"no key"/u);
});

const MODELS=[{id:'a:b',name:'b',desc:'',efforts:['low'],provider:'a'},{id:'a:c',name:'c',desc:'',efforts:['low'],provider:'a'}] as any;
const OPTIONS={current:'a:b',providerLabel:'A',effort:'medium',scale:['low']} as any;

test('N6: the key bar of /model says tab changes the page, at 80 columns too, and a page of one tab does not',()=>{
  const two=modelSheet(MODELS,{...OPTIONS,places:[{id:'p',label:'Place',desc:''}]});
  assert.match(all(pageRows(asPage(two).panel,80,24)),/tab next tab/u);
  assert.doesNotMatch(all(pageRows(asPage(modelSheet(MODELS,OPTIONS)).panel,80,24)),/tab next tab/u);
});

test('R12: «Takes effect from your next message» only where something would change',()=>{
  const shown=(sel:number)=>all(pageRows(asPage(modelSheet(MODELS,{...OPTIONS,sel})).panel,120,30));
  assert.doesNotMatch(shown(0),/Takes effect/u);
  assert.match(shown(1),/Takes effect from your next message/u);
});
