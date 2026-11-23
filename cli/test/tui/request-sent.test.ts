/* The Context Manager's «Request sent» (owner 01/11): the last request as the kernel keeps it, images left out and counted, the text as sent. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {contextSheet} from '../../src/tui/panel/commands.ts';
import {shownMessage,type RequestSent} from '../../src/tui/panel/request-sent.ts';
import {asPage,pageRows} from '../../src/tui/panel/page.ts';

const all=(rows:readonly (readonly {text:string}[])[])=>rows.map(row=>row.map(segment=>segment.text).join('')).join('\n');
const flat=(text:string)=>text.replace(/[ │]*\n[ │]*/gu,' ');
const STATUS={sessionId:'s1',engine:'unavailable',reason:'no-session'} as any;
const SENT:RequestSent={at:'2026-11-01T18:42:00',model:'openrouter:qwen/qwen3-coder',tools:25,messages:[
  {role:'system',content:'You are TALOS, a coding agent.\nRules follow.'},
  {role:'user',content:[{type:'text',text:'What is in this screenshot?'},{type:'image_url',omitted:true},{type:'image_url',omitted:true}]},
  {role:'assistant',content:'',tool_calls:[{function:{name:'leggi'}}]},
  {role:'tool',content:'# demo\n'}]};
const page=(sent:RequestSent|null)=>asPage(contextSheet({status:STATUS,snapshot:null,versions:[],overTime:[],now:Date.parse('2026-11-01T19:00:00Z'),sent},{tab:5}));

test('the request as it went: who sent each message, its first line, the images left out counted',()=>{
  const shown=flat(all(pageRows(page(SENT).panel,120,26)));
  assert.match(shown,/Request sent/u);
  assert.match(shown,/sent at 18:42 · openrouter:qwen\/qwen3-coder · 4 messages · 25 tools · 2 images not shown/u);assert.doesNotMatch(shown,/Last request/u);
  /* Frontend 01/11: several instructions are numbered, so no two rows read the same */
  const many={...SENT,messages:[SENT.messages[0]!,{role:'system',content:'Structure of «project»'},{role:'system',content:'Where you are'},SENT.messages[1]!]};
  const rows=all(pageRows(page(many).panel,120,26));
  assert.match(rows,/Instructions 1 of 3/u);assert.match(rows,/Instructions 2 of 3/u);assert.match(rows,/Instructions 3 of 3/u);
  assert.match(shown,/Instructions .*You are TALOS, a coding agent\./u);
  assert.match(all(pageRows(page(SENT).panel,120,26)),/^ (?:›| ) {1,2}You +2 images/mu,'your message is named «You», on its own row');assert.match(shown,/TALOS .*asks for: leggi/u);assert.match(shown,/Tool result/u);
  assert.match(shown,/Rules follow\./u,'the detail is the text as sent, every line');
  assert.deepEqual(shownMessage(SENT.messages[1]),{role:'user',text:'What is in this screenshot?',images:2,calls:[]});
});

test('before the first request, or after a restart, it says it is kept in memory only',()=>{
  assert.match(flat(all(pageRows(page(null).panel,120,20))),/No request sent yet in this chat, or TALOS started again since: it is kept in memory only\./u);
});
