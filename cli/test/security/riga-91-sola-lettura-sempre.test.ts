/*
 * Row 91 of the judge's table (P018, «Read only» like Claude Code; verifier 19/11/2026): in the terminal, can an «always» already saved
 * override the «only once» of «Read only»? On the PC a remembered yes does not count there: the kernel composes «ask» for an outside
 * tool in «Read only» (talosHarness.mjs `permessiDelloStrumentoDiFuori`, level `lettura`) and marks the card `soloUnaVolta`
 * (`:15917`) and `sempreNonBasta` (session-registry.mjs `:8195-8197`). The CLI's «Read only» is plan mode (session-facade.ts
 * `registryPermission`).
 * Engine measure, not behaviour: with plan from the start the kernel neither offers nor runs an MCP tool (talosHarness.mjs:15710-15712,
 * :17706; real run on 0.6.17, 19/11). This card reaches the engine only where the kernel's level is Read only while its operating mode is
 * still normal: Shift+Tab during a turn (session-facade.ts:120-131) and an automation in plan (kernel-runs.ts:72,
 * session-registry.mjs:14514).
 * Cured in 0.6.18 (riga 91, cure 1) and stricter than this test first asked: in plan an outside tool is REFUSED as a write
 * (`PLAN_MODE_READ_ONLY`), before any rule or session yes, on the screen and with nobody in front (riga-91-plan-only-once-plugin-key
 * .test.ts:28-47). 0.7.0 (judge v2451, list item 16): the former `todo` (it wanted `ask`, and reported the cure as a failure) is now a
 * plain test of that refusal; outside plan the same «only once» card still asks.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {permissionActionFromApproval} from '../../src/security/from-approval.ts';
import {createPermissionEngine} from '../../src/security/permission-engine.ts';

/* the kernel's card, as the registry would send it there */
const ONLY_ONCE={tipo:'mcp_tool',server:'gh',attrezzo:'x',soloUnaVolta:true,sempreNonBasta:true};
const engineWithAlways=()=>createPermissionEngine({projectRoot:process.cwd(),rules:{allow:['Mcp(gh:x)'],ask:[],deny:[]}});

test('row 91: in Read only (plan) an «always» saved for an MCP tool never answers the kernel’s «only once» card: plan refuses it',async()=>{
  for(const interactive of [true,false]){
    const decision=await engineWithAlways().decide(permissionActionFromApproval({azione:{...ONLY_ONCE}}),{interactive,mode:'plan',sessionId:'s'});
    assert.equal(decision.kind,'deny',`interactive ${interactive}: the saved rule answered the card by itself (${decision.kind})`);
    assert.equal((decision as {code:string}).code,'PLAN_MODE_READ_ONLY',`interactive ${interactive}`);
  }
});

test('row 91, the other way: outside plan the saved «always» does not answer the «only once» card either, the person does',async()=>{
  const decision=await engineWithAlways().decide(permissionActionFromApproval({azione:{...ONLY_ONCE}}),{interactive:true,mode:'default',sessionId:'s'});
  assert.equal(decision.kind,'ask',`the saved rule answered the card by itself (${decision.kind})`);
});
