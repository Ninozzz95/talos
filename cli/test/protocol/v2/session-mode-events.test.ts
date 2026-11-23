/*
 * Stage 3, pezzo 13c (registro 12). The kernel changes a session's mode by itself — the model asks for plan mode
 * (`request_plan_mode`), or the person approves a plan — and says so with CUSTOM `talos.impostazioni-sessione`
 * {modalitaOperativa, permessi, motivo}. The v2 bridge dropped it, so the screen kept showing the old mode (ACP
 * `current_mode_update`; claude-agent-acp #1139 «publish effective mode after plan approval»). Now it is
 * `session.mode.changed` with the mode in the CLI's own words.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createV2EventBridge} from '../../../src/protocol/v2/events.ts';

const clock=()=>'2026-10-02T17:00:00.000Z';
const settings=(value:Record<string,unknown>)=>({type:'CUSTOM',name:'talos.impostazioni-sessione',value});

test('the kernel\'s own mode changes become session.mode.changed in the CLI\'s words, durable',()=>{
  const bridge=createV2EventBridge('s-1',clock);
  const cases:Array<[Record<string,unknown>,Record<string,unknown>]>=[
    [{modalitaOperativa:'piano',permessi:'Read only',motivo:'piano-richiesto-dal-modello'},{mode:'plan',reason:'model-requested'}],
    [{modalitaOperativa:'normale',permessi:'On request',motivo:'piano-approvato'},{mode:'default',reason:'plan-approved'}],
    [{modalitaOperativa:'normale',permessi:'Workspace write',motivo:'piano-approvato'},{mode:'acceptEdits',reason:'plan-approved'}],
    [{modalitaOperativa:'piano',permessi:'On request'},{mode:'plan'}],
  ];
  for(const [value,data] of cases){
    const event=bridge.translate(settings(value));
    assert.equal(event?.type,'session.mode.changed',JSON.stringify(value));
    assert.equal(event?.durability,'durable');
    assert.deepEqual(event?.data,data,JSON.stringify(value));
  }
});

test('a permission TALOS does not map, or no mode at all, is not invented',()=>{
  const bridge=createV2EventBridge('s-1',clock);
  assert.equal(bridge.translate(settings({modalitaOperativa:'normale',permessi:'Full access'})),null);
  assert.equal(bridge.translate(settings({motivo:'piano-approvato'})),null);
});
