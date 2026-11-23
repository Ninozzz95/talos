/*
 * 0.6.9, the bugfixer's review (B1, N2): the notice of a trusted MCP server that did not start must reach every surface.
 * - B1: in `-p` text (the default form) the run's warnings never left the result, so the notice was silent there.
 * - N2: on the screen a notice whose reason (or server id) looked Italian was replaced whole by «no English text yet», losing the
 *   server's name and the check command.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {output} from '../../src/main.ts';
import {createEventBridge} from '../../src/events/bridge.ts';
import {createV2EventBridge} from '../../src/protocol/v2/events.ts';
import {createTuiEventAdapter} from '../../src/tui/event-adapter.ts';
import {MCP_START_FAILED,mcpStartFailedEvent} from '../../src/runtime/provider-attempts.ts';

const raw=mcpStartFailedEvent('docs','spawn node-missing ENOENT');
const SENTENCE='MCP server "docs" did not start: spawn node-missing ENOENT. Its tools are not available in this turn. Check it with: talos mcp test docs';

function io(){const out:string[]=[];const err:string[]=[];return{out,err,api:{writeOut:(s:string)=>{out.push(s);},writeErr:(s:string)=>{err.push(s);},stdinIsTTY:false,stdoutIsTTY:false,readStdin:async()=>''} as any};}
const result={ok:true,sessionId:'s-1',text:'ANSWER',warnings:[],toolCalls:[],changedFiles:[],usage:null,status:'completed'} as any;

test('B1 — `-p` text says the notice on stderr, once, and leaves stdout to the answer',()=>{
  const v1=createEventBridge('s-1').translate(raw as any);
  assert.equal(v1?.type,'warning');assert.equal((v1 as any)?.data?.code,MCP_START_FAILED);assert.equal((v1 as any)?.data?.message,SENTENCE);
  const x=io();
  output(x.api,'text','v1',{result,events:[v1]});
  assert.deepEqual(x.err,[`Warning: ${SENTENCE}\n`]);
  assert.equal(x.out.join('').includes('did not start'),false,'stdout keeps the answer only');
});

test('B1 — the JSON form keeps it in its events and never writes it twice to stderr',()=>{
  const v1=createEventBridge('s-1').translate(raw as any);
  const x=io();
  output(x.api,'json','v1',{result,events:[v1]});
  assert.deepEqual(x.err,[]);
});

test('v2 carries the code, the server and the reason apart from the sentence',()=>{
  const bridge=createV2EventBridge('s-1');const events=bridge.translate(raw as any) as any;
  const warning=(Array.isArray(events)?events:[events]).find((event:any)=>event?.type==='warning');
  assert.equal(warning?.data?.code,MCP_START_FAILED);assert.equal(warning?.data?.serverId,'docs');assert.equal(warning?.data?.reason,'spawn node-missing ENOENT');
  assert.equal(warning?.data?.message,SENTENCE);
});

test('N2 — the screen keeps the server and the check command; only a reason that is not English is left out',()=>{
  const screen=(event:any)=>{const adapter=createTuiEventAdapter();adapter.bindSession('s-1');return adapter.translate(event) as any;};
  assert.equal(screen(raw)?.message,SENTENCE,'an English reason is shown whole');
  const italian=screen(mcpStartFailedEvent('docs','errore: la sessione è chiusa'));
  assert.equal(italian?.message,'MCP server "docs" did not start. Its tools are not available in this turn. Check it with: talos mcp test docs');
  assert.match(String(italian?.raw),/la sessione è chiusa/u,'the reason stays for the expanded view');
  const named=screen(mcpStartFailedEvent('sessione','spawn x ENOENT'));
  assert.match(String(named?.message),/^MCP server "sessione" did not start: spawn x ENOENT\./u,'a server named like an Italian word is not Italian text');
});
