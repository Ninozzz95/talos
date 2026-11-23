/*
 * Owner 11/10/2026 (through the desktop session): a pre_tool_call hook refused by the engine (e.g. shell operators in its command) —
 * "the tool is BLOCKED and the person sees why". The kernel already blocks the tools that change something ("REFUSED. <reason>");
 * the kernel's HookInvoked event now reaches the screen as a warning naming the hook, the tool and the reason.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createV2EventBridge} from '../../src/protocol/v2/events.ts';

const clock=()=>'2026-10-11T00:00:00.000Z';
const invoked=(esito:Record<string,unknown>,tipo='pre_tool_call')=>createV2EventBridge('s1',clock).translate({type:'HookInvoked',_sequenza:4,hookId:'s3-echo',tipo,azione:'scrivi',esito});

test('a hook that says no to a tool is a warning with the hook, the tool and the reason',()=>{
  const event:any=invoked({consentito:false,motivo:'The command cannot contain shell operators'});
  assert.equal(event?.type,'warning');
  assert.equal(event.data.code,'HOOK_REFUSED');
  assert.equal(event.data.hookId,'s3-echo');
  assert.match(event.data.message,/^The hook s3-echo said no to .+: The command cannot contain shell operators$/u);
  assert.doesNotMatch(event.data.message,/scrivi/u,'the tool is named in English, not by the kernel name');
});

test('a hook that allows, and any other hook event, stay silent',()=>{
  assert.equal(invoked({consentito:true,motivo:'ok'}),null);
  assert.equal(invoked({consentito:false,motivo:'x'},'post_tool_call'),null);
});
