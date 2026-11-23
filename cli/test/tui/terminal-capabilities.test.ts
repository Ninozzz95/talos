import assert from 'node:assert/strict';
import test from 'node:test';
import {detectTerminalCapabilities} from '../../src/tui/terminal-capabilities.ts';

test('no-color and reduced-motion disable animation without losing text semantics',()=>{
  const c=detectTerminalCapabilities({stdinIsTTY:true,stdoutIsTTY:true,color:false,env:{TALOS_REDUCED_MOTION:'1',TERM:'xterm-256color'}});
  assert.equal(c.interactive,true);
  assert.equal(c.color,false);
  assert.equal(c.motion,false);
});

test('dumb terminal falls back from unicode glyphs',()=>{
  const c=detectTerminalCapabilities({stdinIsTTY:true,stdoutIsTTY:true,color:true,env:{TERM:'dumb'}});
  assert.equal(c.unicode,false);
});


test('M2-C NO_COLOR produces mono capabilities while TERM dumb and non-TTY produce plain-safe capabilities',()=>{
  const noColor=detectTerminalCapabilities({stdinIsTTY:true,stdoutIsTTY:true,color:true,env:{TERM:'xterm-256color',NO_COLOR:'1'}});
  assert.equal(noColor.interactive,true);
  assert.equal(noColor.color,false);
  assert.equal(noColor.motion,false);
  assert.equal(noColor.unicode,true);

  const dumb=detectTerminalCapabilities({stdinIsTTY:true,stdoutIsTTY:true,color:true,env:{TERM:'dumb'}});
  assert.deepEqual(dumb,{interactive:true,color:false,motion:false,unicode:false});

  const piped=detectTerminalCapabilities({stdinIsTTY:false,stdoutIsTTY:true,color:true,env:{TERM:'xterm-256color'}});
  assert.deepEqual(piped,{interactive:false,color:false,motion:false,unicode:false});
});

test('reduced motion preserves color and unicode on an otherwise capable terminal',()=>{
  const reduced=detectTerminalCapabilities({stdinIsTTY:true,stdoutIsTTY:true,color:true,env:{TERM:'xterm-256color',TALOS_REDUCED_MOTION:'true'}});
  assert.equal(reduced.color,true);
  assert.equal(reduced.unicode,true);
  assert.equal(reduced.motion,false);
});
