import assert from 'node:assert/strict';
import test from 'node:test';
import {decideShellInput} from '../../src/tui/shell-input.ts';

const ready={phase:'ready',runtimeReady:true,skipped:false} as const;

test('M2-A-RED-3 — shell input gates ownership before ordinary semantic routing',()=>{
  assert.deepEqual(
    decideShellInput({ch:'q',key:{},focus:'composer',composerText:'',commandMenuOpen:false,trustCenterOpen:true,approvalExpanded:false,boot:ready}),
    {skipBoot:false,closeTrustCenter:true,approvalScrollDelta:null,routed:null},
  );

  assert.deepEqual(
    decideShellInput({ch:'x',key:{},focus:'composer',composerText:'',commandMenuOpen:false,trustCenterOpen:true,approvalExpanded:false,boot:ready}),
    {skipBoot:false,closeTrustCenter:false,approvalScrollDelta:null,routed:null},
  );

  assert.deepEqual(
    decideShellInput({ch:'',key:{pageDown:true},focus:'approval',composerText:'',commandMenuOpen:false,trustCenterOpen:false,approvalExpanded:true,boot:ready}),
    {skipBoot:false,closeTrustCenter:false,approvalScrollDelta:4,routed:null},
  );
});

test('boot skip blocks input until runtime readiness but forwards the triggering key once ready',()=>{
  const blocked=decideShellInput({
    ch:'l',key:{ctrl:true},focus:'composer',composerText:'',commandMenuOpen:false,
    trustCenterOpen:false,approvalExpanded:false,
    boot:{phase:'running',runtimeReady:false,skipped:false},
  });
  assert.deepEqual(blocked,{skipBoot:true,closeTrustCenter:false,approvalScrollDelta:null,routed:null});

  const forwarded=decideShellInput({
    ch:'l',key:{ctrl:true},focus:'composer',composerText:'',commandMenuOpen:false,
    trustCenterOpen:false,approvalExpanded:false,
    boot:{phase:'running',runtimeReady:true,skipped:false},
  });
  assert.equal(forwarded.skipBoot,true);
  assert.deepEqual(forwarded.routed,{kind:'action',action:'redraw'});/* R4 Q-R4-6: Ctrl+L redraws */

  const normal=decideShellInput({
    ch:'?',key:{},focus:'composer',composerText:'',commandMenuOpen:false,
    trustCenterOpen:false,approvalExpanded:false,boot:ready,
  });
  assert.equal(normal.skipBoot,false);
  assert.deepEqual(normal.routed,{kind:'action',action:'help'});
});

test('shell input planner stays independent from React Ink and runtime',async()=>{
  const {readFile}=await import('node:fs/promises');
  const source=await readFile(new URL('../../src/tui/shell-input.ts',import.meta.url),'utf8');
  assert.doesNotMatch(source,/from ['"]react['"]|from ['"]ink['"]|session-controller|CliRuntime/u);
});
