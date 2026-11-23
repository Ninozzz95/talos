/*
 * R3 lane SP — gate E5, owner decision Q-R3-12. The shared executor runs both the person's `!` commands and the model's
 * `shell` tool (M1-E: one executor), so it cannot know who typed a command; its reason sentences used to begin with
 * "typed by you;", which the model's own commands showed on screen and which the model itself read as the first line of
 * its tool result (`exit N [sandbox: <enforcement>]`, talosHarness.mjs:8662). Who ran it is now the row's own field
 * (`tool.origin` / `tool.decision`). The kernel-contract markers stay byte-identical (R2 E2).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {EXECUTION_TEXT,createBrokeredKernelExecutor} from '../../src/runtime/brokered-executor.ts';

/* F-021 (owner 03/10): the reason says only what the boundary probe measured */
const SAMPLE_EVIDENCE={appContainer:false,filesystem:'bfs',network:'deny',processTree:'job-object-kill-on-close',boundary:{appContainer:false,integrity:'low',writesOutside:'blocked',network:'blocked'}};
function everyReason():string[]{
  const r=EXECUTION_TEXT.reason;
  return[
    r.verified(SAMPLE_EVIDENCE),r.backendUnavailable('why'),r.brokerNotConfigured,r.brokerConstructionFailed('detail'),
    r.destinationMobile,r.destinationWsl2,r.platformNotWindows('linux'),r.timedOut(5_000),r.stoppedOnRequest,
    r.sandboxUnverified('why'),r.brokerUnbuildable('detail'),r.hostPlatform('linux'),r.hostNoBroker,
  ];
}

test('R3-SP E5: no executor reason claims who typed the command',()=>{
  const offending=everyReason().filter(reason=>/typed by you/iu.test(reason));
  assert.deepEqual(offending,[],`E5: executor reasons still say who typed the command: ${offending.join(' | ')}`);
});

test('R3-SP E5: the verified reason starts with the isolation facts',()=>{
  assert.equal(EXECUTION_TEXT.reason.verified(SAMPLE_EVIDENCE),'measured: writes only in the project, network blocked, reads the whole disk, its processes end with it');
});

test('R3-SP E5: a brokered model command no longer tells the model the person typed it',async()=>{
  const kernel=async()=>({uscitaUtile:(testo:string)=>testo,staccaCartellaFinale:(testo:string)=>({testo,cartella:null}),codaCheStampaLaCartella:()=>'',eseguiComandoSandboxato:async()=>({codice:0,testo:'',enforcement:'none'})});
  const broker={execute:async()=>({exitCode:0,stdout:'ok',stderr:'',evidence:{backend:'mxc-appcontainer',...SAMPLE_EVIDENCE}})} as any;
  const result=await createBrokeredKernelExecutor({kernel,broker,platform:'win32'})('git status','C:\\work',{dove:'windows'});
  assert.equal(result.enforcement,'⛉ sandbox (mxc-appcontainer) — measured: writes only in the project, network blocked, reads the whole disk, its processes end with it');
});

test('R3-SP E5: the kernel-contract markers are untouched',()=>{
  assert.equal(EXECUTION_TEXT.marker.stoppedOnRequest,'⛔ Stopped on request:');
  assert.equal(EXECUTION_TEXT.marker.stoppedOnRequestSentence,'the command was stopped while it ran.');
  assert.equal(EXECUTION_TEXT.marker.timedOut(120_000),'⛔ Stopped when the 120 seconds ran out: it did not finish on its own.');
});
