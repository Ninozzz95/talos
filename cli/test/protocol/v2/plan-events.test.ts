/*
 * Stage 3, the plan card (owner 02/10, registro 12). The kernel proposes a plan and records the person's choice as CUSTOM
 * `talos.plan` (plan-contract.mjs, `talos.plan.v1`); until now the v2 bridge dropped every CUSTOM it did not know, so the CLI
 * never saw a plan and the turn waited. Like the questions: `plan.required` for a proposal, `plan.resolved` for every close
 * (approved, changes requested, cancelled), durable; the Italian bookkeeping in English value by value.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createV2EventBridge} from '../../../src/protocol/v2/events.ts';

const clock=()=>'2026-10-02T15:00:00.000Z';
const HASH='sha256:'+'a'.repeat(64);
const base={schema:'talos.plan.v1',planId:'p-1',sessionId:'s-1',revision:2,requestId:'r-1',hash:HASH,toolCallId:'call_plan'};
const plan=(value:Record<string,unknown>)=>({type:'CUSTOM',name:'talos.plan',value:{...base,...value}});

test('a proposed plan becomes plan.required with its text, revision, hash and tool call, durable',()=>{
  const event=createV2EventBridge('s-1',clock).translate(plan({status:'proposed',content:'1. Move the resize\n2. Queue jobs',model:'m',at:'2026-10-02T14:59:00.000Z',ripristinabile:true}));
  assert.equal(event?.type,'plan.required');
  assert.equal(event?.durability,'durable');
  assert.deepEqual(event?.data,{planId:'p-1',revision:2,requestId:'r-1',hash:HASH,toolCallId:'call_plan',content:'1. Move the resize\n2. Queue jobs',restorable:true,at:'2026-10-02T14:59:00.000Z'});
});

test('every choice and every close becomes plan.resolved, decision, who and why in English',()=>{
  const bridge=createV2EventBridge('s-1',clock);
  const resolved=(value:Record<string,unknown>)=>bridge.translate(plan(value));
  for(const [decisione,decision] of [['procedi-con-conferma','ask-before-edits'],['procedi-accetta-modifiche','accept-edits'],['conversazione-pulita','clean-conversation']]){
    const event=resolved({status:'approved',decisione,da:'persona',at:'t',...(decisione==='conversazione-pulita'?{nuovaSessionId:'s-2'}:{})});
    assert.equal(event?.type,'plan.resolved');assert.equal(event?.durability,'durable');
    assert.deepEqual(event?.data,{planId:'p-1',revision:2,requestId:'r-1',hash:HASH,toolCallId:'call_plan',status:'approved',decision,by:'person',at:'t',...(decisione==='conversazione-pulita'?{newSessionId:'s-2'}:{})});
  }
  assert.deepEqual((resolved({status:'changes-requested',decisione:'continua-a-pianificare',feedback:'smaller steps',da:'persona'})?.data as any),
    {planId:'p-1',revision:2,requestId:'r-1',hash:HASH,toolCallId:'call_plan',status:'changes-requested',decision:'keep-planning',feedback:'smaller steps',by:'person'});
  for(const [motivo,reason] of [['nuovo-messaggio','new-message'],['reindirizzamento','redirected'],['fermato','stopped'],['interrotta','interrupted']]){
    const event=resolved({status:'cancelled',motivo,da:'sistema'});
    assert.equal(event?.type,'plan.resolved');
    assert.equal((event?.data as any).reason,reason,`motivo ${motivo}`);
    assert.equal((event?.data as any).by,'system');
  }
});

test('a plan that is not talos.plan.v1, or has no request, is not invented',()=>{
  const bridge=createV2EventBridge('s-1',clock);
  assert.equal(bridge.translate({type:'CUSTOM',name:'talos.plan',value:{...base,schema:'talos.plan.v9',status:'proposed',content:'x'}}),null);
  assert.equal(bridge.translate({type:'CUSTOM',name:'talos.plan',value:{...base,requestId:undefined,status:'proposed',content:'x'}}),null);
  assert.equal(bridge.translate({type:'CUSTOM',name:'talos.plan',value:{...base,status:'weird'}}),null,'an unknown status is not a close');
});

test('a secret in the plan text is redacted like every v2 string',()=>{
  const secret='sk-or-v1-abcdefghijklmnopqrstuvwxyz0123456789';
  const event=createV2EventBridge('s-1',clock,[secret]).translate(plan({status:'proposed',content:`1. Use ${secret}`}));
  assert.equal(event?.type,'plan.required');
  assert.doesNotMatch(JSON.stringify(event),/abcdefghijklmnopqrstuvwxyz0123456789/u);
});
