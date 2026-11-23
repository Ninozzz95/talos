/*
 * Stage 7.7 (mockup /export «Tool output — Adds what each tool returned; the file gets larger.», «Thinking»; OpenCode's export
 * options «Include thinking», «Include tool details»): what each tool returned and TALOS's thinking go into an export only when
 * the person asks, in every format. `/export <format> <file>` with arguments stays as it was (everything, lossless rows).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {exportBody} from '../../src/tui/session-export.ts';

const payload={sessionId:'s-1',name:'Flaky login test',eventi:[
  {type:'RunStarted',runId:'r1',input:{prompt:'why is it flaky?'}},
  {type:'ReasoningStart',messageId:'t1'},{type:'ReasoningMessageStart',messageId:'t1'},{type:'ReasoningMessageContent',messageId:'t1',delta:'The cookie races the redirect.'},{type:'ReasoningMessageEnd',messageId:'t1'},{type:'ReasoningEnd',messageId:'t1'},
  {type:'ToolCallStart',toolCallId:'c1',toolCallName:'leggi'},{type:'ToolCallArgs',toolCallId:'c1',delta:'{"percorso":"src/login.ts"}'},{type:'ToolCallEnd',toolCallId:'c1'},
  {type:'ToolCallResult',toolCallId:'c1',content:'export function login() { return KEY_sk-test-1234567890abcdef }'},
  {type:'TextMessageStart',messageId:'a1',role:'assistant'},{type:'TextMessageContent',messageId:'a1',delta:'It waits for the cookie now.'},{type:'TextMessageEnd',messageId:'a1'},
]};
const secrets=['sk-test-1234567890abcdef'];

test('Markdown: tool output and thinking only when asked; keys never written',()=>{
  const plain=exportBody(payload,{format:'md',toolOutput:false,thinking:false,secrets});
  assert.match(plain,/why is it flaky\?/u);assert.match(plain,/It waits for the cookie now\./u);
  assert.doesNotMatch(plain,/export function login/u);assert.doesNotMatch(plain,/races the redirect/u);
  const full=exportBody(payload,{format:'md',toolOutput:true,thinking:true,secrets});
  assert.match(full,/export function login/u,'what the tool returned');
  assert.match(full,/races the redirect/u,'the thinking');
  assert.doesNotMatch(full,/sk-test-1234567890abcdef/u,'a key is never written');
  assert.ok(full.indexOf('races the redirect')<full.indexOf('export function login')&&full.indexOf('export function login')<full.indexOf('It waits for the cookie'),'in the order it happened');
});

test('JSON and JSONL: without tool output a result keeps its place but not its content; without thinking there is no reasoning',()=>{
  const rows=exportBody(payload,{format:'jsonl',toolOutput:false,thinking:false,secrets}).trim().split('\n').map(line=>JSON.parse(line));
  assert.ok(!rows.some(row=>/^Reasoning/u.test(row.type)),'no thinking');
  const result=rows.find(row=>row.type==='ToolCallResult');assert.ok(result,'the result keeps its place');assert.equal(result.content,undefined);
  const all=exportBody(payload,{format:'jsonl',toolOutput:true,thinking:true,secrets}).trim().split('\n').map(line=>JSON.parse(line));
  assert.equal(all.length,payload.eventi.length);assert.doesNotMatch(JSON.stringify(all),/sk-test-1234567890abcdef/u);
  const json=JSON.parse(exportBody(payload,{format:'json',toolOutput:false,thinking:true,secrets}));
  assert.equal(json.sessionId,'s-1');assert.ok(json.eventi.some((row:any)=>row.type==='ReasoningMessageContent'));
  assert.equal(json.eventi.find((row:any)=>row.type==='ToolCallResult').content,undefined);
});

test('the sheet\'s file name: talos-<name>-<date>.<format>, the id when there is no name',async()=>{
  const {exportFileName}=await import('../../src/tui/session-export.ts');
  const day=new Date(2026,9,1,12,0);
  assert.equal(exportFileName('Flaky login test','abcdef123456','md',day),'talos-flaky-login-test-2026-10-01.md');
  assert.equal(exportFileName('Ünïcode & spaces!!','abcdef123456','json',day),'talos-unicode-spaces-2026-10-01.json');
  assert.equal(exportFileName('','abcdef123456','jsonl',day),'talos-session-abcdef12-2026-10-01.jsonl');
  assert.equal(exportFileName('one two three four five six seven eight nine ten','x','md',day),'talos-one-two-three-four-five-six-seven-eight-2026-10-01.md','cut at a word, 40 at most');
});

test('a tool that returned a fence of its own keeps it: the export\'s fence is longer',()=>{
  const tick='`';const inner=tick.repeat(3)+'js\nconst a=1;\n'+tick.repeat(3);
  const body=exportBody({sessionId:'s',eventi:[{type:'RunStarted',input:{prompt:'show'}},{type:'ToolCallStart',toolCallId:'c',toolCallName:'leggi'},{type:'ToolCallEnd',toolCallId:'c'},{type:'ToolCallResult',toolCallId:'c',content:inner}]},{format:'md',toolOutput:true,thinking:false,secrets:[]});
  assert.ok(body.includes(tick.repeat(4)+'text\n'+inner+'\n'+tick.repeat(4)),body);
});

test('/export with arguments stays as it was: JSON and JSONL keep every row, tool output and thinking included',async()=>{
  const {exportSession}=await import('../../src/tui/session-export.ts');
  const {mkdtempSync,readFileSync,rmSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
  const dir=mkdtempSync(join(tmpdir(),'talos-export-'));
  try{
    const done=await exportSession({runtime:{export:()=>payload},sessionId:'s-1',projectRoot:dir,args:['jsonl','all.jsonl'],secrets});
    const rows=readFileSync(done.path,'utf8').trim().split('\n').map(line=>JSON.parse(line));
    assert.equal(rows.length,payload.eventi.length);assert.ok(rows.some(row=>row.type==='ReasoningMessageContent'));
    assert.match(rows.find(row=>row.type==='ToolCallResult').content,/export function login/u);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
