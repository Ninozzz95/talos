/*
 * 0.6.6 — the words the model reads for the turn's permission are the CLI's real mode (runtime/model-permission.ts), never the
 * «On request» the kernel's gates get: in live-065 a model in Full access read «On request» and stopped.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {fullAccessForSession,modelPermissionWords,permissionForModel,permissionForModelWithNobody,withStartingMode} from '../../src/runtime/model-permission.ts';
import {rememberSessionMode} from '../../src/runtime/session-modes.ts';

test('every mode has one English line under 200 characters; the asking modes say that being asked is not a refusal',()=>{
  for(const mode of ['default','acceptEdits','plan','auto','dontAsk','bypassPermissions'] as const){
    const words=modelPermissionWords(mode)!;assert.ok(words&&words.length<=200&&!words.includes('\n'),mode);
    assert.doesNotMatch(words,/On request/u,`${mode}: never the gate's word`);
  }
  for(const mode of ['default','acceptEdits','auto'] as const)assert.match(modelPermissionWords(mode)!,/Being asked is not a refusal/u,mode);
  assert.match(modelPermissionWords('bypassPermissions')!,/^Full access: everything runs without asking, project secrets included; login keys/u);
  /* decisions 155-158 (owner 04/11/2026): a critical deletion and a paid research still ask; a network path no longer does */
  for(const nobody of [false,true]){const words=modelPermissionWords('bypassPermissions',{nobody})!;assert.match(words,/deleting a disk, a top, user or project folder or a parent/u);assert.match(words,/paid research/u);assert.doesNotMatch(words,/network path/u);}
  assert.equal(modelPermissionWords(null),null);assert.equal(modelPermissionWords('nonsense' as any),null);
});

test('the session\'s remembered mode decides; while a session starts, its starting mode; with neither, null (the kernel keeps permessi)',()=>{
  rememberSessionMode('s-known','bypassPermissions');
  assert.match(permissionForModel({sessionId:'s-known'})!,/^Full access/u);
  assert.equal(permissionForModel({sessionId:'s-new'}),null);
  const seen=withStartingMode('acceptEdits',()=>permissionForModel({sessionId:'s-new'}));
  assert.match(seen!,/^Accept edits/u,'the first turn of a new session reads the mode it is started with');
  assert.equal(permissionForModel({sessionId:'s-new'}),null,'the starting mode does not outlive the start');
  assert.match(withStartingMode('plan',()=>permissionForModel({sessionId:'s-known'}))!,/^Full access/u,'a known session keeps its own mode');
  assert.throws(()=>withStartingMode('default',()=>{throw new Error('start failed');}),/start failed/u);
  assert.equal(permissionForModel({}),null,'a failed start leaves nothing behind');
  assert.equal(permissionForModel(null),null);
});

/* the 0.6.6 review's F3: with nobody in front (`-p`, a command, an automation run) what would be asked is refused, so the words
   say so; the screen keeps «Being asked is not a refusal». The composition picks one by `askPerson` (talos-composition.ts). */
test('with nobody in front, every mode says what is refused and never that being asked is not a refusal',()=>{
  for(const mode of ['default','acceptEdits','plan','auto','dontAsk','bypassPermissions'] as const){
    const words=modelPermissionWords(mode,{nobody:true})!;assert.ok(words&&words.length<=200&&!words.includes('\n'),mode);
    assert.doesNotMatch(words,/Being asked is not a refusal|On request|asked to the person/u,mode);
  }
  for(const mode of ['default','acceptEdits','auto','bypassPermissions'] as const)assert.match(modelPermissionWords(mode,{nobody:true})!,/refused/u,mode);
  rememberSessionMode('s-nobody','acceptEdits');
  assert.match(permissionForModelWithNobody({sessionId:'s-nobody'})!,/^Accept edits, with nobody here to answer/u);
  assert.match(permissionForModel({sessionId:'s-nobody'})!,/Being asked is not a refusal/u);
});

/* 0.6.8 (desktop a4dfea6df): document_create asks the host whether the person is in Full access, since the gates get «On request» */
test('the host says Full access for the session in Full access and for its sub-agents, and only for them',()=>{
  rememberSessionMode('fa-root','bypassPermissions');rememberSessionMode('fa-other','default');
  assert.equal(fullAccessForSession({sessionId:'fa-root'}),true);
  assert.equal(fullAccessForSession({sessionId:'fa-child',radiceId:'fa-root'}),true,'a sub-agent has the mode of its root session');
  assert.equal(fullAccessForSession({sessionId:'fa-other'}),false);
  assert.equal(fullAccessForSession({sessionId:'fa-child2',radiceId:'fa-other'}),false);
  assert.equal(fullAccessForSession({sessionId:'unknown'}),false);assert.equal(fullAccessForSession(null),false);
  assert.equal(withStartingMode('bypassPermissions',()=>fullAccessForSession({sessionId:'new'})),true,'a session being started');
});
