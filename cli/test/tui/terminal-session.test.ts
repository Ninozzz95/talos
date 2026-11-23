import assert from 'node:assert/strict';
import test from 'node:test';
import {createTerminalSessionPlan} from '../../src/tui/terminal-session.ts';

test('M2-C-RED-1 — capable interactive color terminal gets fullscreen dark session',()=>{
  const plan=createTerminalSessionPlan({
    capabilities:{interactive:true,color:true,motion:true,unicode:true},
    env:{TERM:'xterm-256color'},
  });
  assert.deepEqual(plan,{mode:'full',alternateScreen:true,paintBackground:true,fallbackReason:null});
});

test('M2-C-RED-2 — no-color is mono but still fullscreen; reduced motion does not force plain mode',()=>{
  assert.deepEqual(createTerminalSessionPlan({
    capabilities:{interactive:true,color:false,motion:false,unicode:true},
    env:{TERM:'xterm-256color'},
  }),{mode:'mono',alternateScreen:true,paintBackground:false,fallbackReason:null});

  assert.deepEqual(createTerminalSessionPlan({
    capabilities:{interactive:true,color:true,motion:false,unicode:true},
    env:{TERM:'xterm-256color',TALOS_REDUCED_MOTION:'1'},
  }),{mode:'full',alternateScreen:true,paintBackground:true,fallbackReason:null});
});

test('M2-C-RED-3 — non-interactive dumb or unsupported alternate screen uses named plain fallback',()=>{
  assert.deepEqual(createTerminalSessionPlan({
    capabilities:{interactive:false,color:false,motion:false,unicode:false},
    env:{TERM:'xterm-256color'},
  }),{mode:'plain',alternateScreen:false,paintBackground:false,fallbackReason:'non-interactive'});

  assert.deepEqual(createTerminalSessionPlan({
    capabilities:{interactive:true,color:false,motion:false,unicode:false},
    env:{TERM:'dumb'},
  }),{mode:'plain',alternateScreen:false,paintBackground:false,fallbackReason:'term-dumb'});

  assert.deepEqual(createTerminalSessionPlan({
    capabilities:{interactive:true,color:true,motion:true,unicode:true},
    env:{TERM:'xterm-256color'},supportsAlternateScreen:false,
  }),{mode:'plain',alternateScreen:false,paintBackground:false,fallbackReason:'alternate-screen-unavailable'});
});
