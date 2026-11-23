/*
 * Stage 3 (owner decision 01/10, registro 12): the ENTRY says whether a person can answer the model's questions, as it says
 * which environment keys it may use (environment-key-entries.test.ts). Only the interactive screen says `present`; `-p` and
 * every one-shot command leave it out, and the composition then never offers ask_user_question (closed by default).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {main} from '../../src/main.ts';
import {hermetic} from '../provider/first-run-fixture.ts';

const MODEL='openrouter:vendor/live-model-a';

test('only the interactive screen declares a person; -p does not',async()=>hermetic(async h=>{
  const seen:Array<[string,unknown]>=[];
  const fakeContext={registry:{ripristina:async()=>({}),elenca:()=>[{sessionId:'s1',modello:MODEL}],avvia:()=>({sessionId:'auto-1'}),iscriviti:()=>()=>{}},runtime:{start:async()=>'sess-1',resume:async(id:string)=>id,subscribe:()=>()=>{},close:async()=>{}},providerStore:{listPublic:()=>[]},tuiCatalog:{listProviders:async()=>[]}};
  const io=(tty:boolean)=>({writeOut:()=>{},writeErr:()=>{},stdinIsTTY:tty,stdoutIsTTY:tty,readStdin:async()=>''} as any);
  assert.equal(await main(['--project',h.project],{io:io(true),createRuntimeContext:async(input:any)=>{seen.push(['screen',input?.person]);return fakeContext;},runTui:async()=>{}}),0);
  await main(['--project',h.project,'-p','hello','--json','--timeout','1'],{io:io(false),createRuntime:async(input:any)=>{seen.push(['-p',input?.person]);return{...fakeContext.runtime,listSessions:async()=>[],answerApproval:async()=>{},answerQuestion:async()=>{},cancel:async()=>{},start:async()=>{throw Object.assign(new Error('stop here'),{code:'TEST_STOP'});}};}});
  assert.deepEqual(seen,[['screen','present'],['-p',undefined]]);
}));
