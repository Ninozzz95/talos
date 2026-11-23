/*
 * 0.6.11: the desktop's kernel now writes its own durable event for every MCP start (`CUSTOM talos.mcp-avvio {id, esiti}`,
 * agent-service.mjs). The CLI says a server that did not start with its own notice since 0.6.9 (MCP_START_FAILED, from the
 * preparation's `falliti`, which the kernel still returns), so the kernel's event must not become a second warning: in v1 and v2
 * it maps to nothing. A replayed journal (resume) carries it too.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createEventBridge} from '../../src/events/bridge.ts';
import {createV2EventBridge} from '../../src/protocol/v2/events.ts';

const clock=()=>'2026-10-20T00:00:00.000Z';
const avvio={type:'CUSTOM',name:'talos.mcp-avvio',_sequenza:3,value:{id:'u1',esiti:[
  {serverId:'srv',hash:'h',esito:'non-partito',motivo:'spawn node-missing ENOENT',motivoChiave:'server.program.notOnPath',motivoParams:{command:'node-missing'}},
  {serverId:'ok',hash:'h2',esito:'collegato'},
]}};

test('the kernel\'s talos.mcp-avvio event is not a second MCP warning, in v1 or in v2',()=>{
  assert.equal(createEventBridge('s1',clock).translate(avvio as any),null,'v1 turned the kernel event into an event');
  assert.equal(createV2EventBridge('s1',clock).translate(avvio as any),null,'v2 turned the kernel event into an event');
});

test('the CLI\'s own notice still is the one MCP warning',()=>{
  const notice={type:'CUSTOM',name:'talos.cli.notice',_sequenza:4,value:{message:'MCP server "srv" did not start: x. Its tools are not available in this turn. Check it with: talos mcp test srv',code:'MCP_START_FAILED',serverId:'srv',reason:'x'}};
  const v1=createEventBridge('s1',clock).translate(notice as any) as any;
  assert.equal(v1?.type,'warning');assert.equal(v1?.data.code,'MCP_START_FAILED');
  const v2=createV2EventBridge('s1',clock).translate(notice as any) as any;
  assert.equal(v2?.data?.code,'MCP_START_FAILED');
});
