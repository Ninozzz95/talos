/*
 * The hand pointer over clickable rows, only where the terminal implements OSC 22 with CSS names (owner 09/10/2026 «Solo dove
 * funziona»): kitty, Ghostty, foot. Windows Terminal, xterm and any other terminal get nothing — not even the motion reports.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createPointerShape,pointerShapeSupported} from '../../src/tui/pointer-shape.ts';

test('the pointer is asked for in kitty, Ghostty and foot only, and never over SSH',()=>{
  for(const env of [{KITTY_WINDOW_ID:'1'},{TERM:'xterm-kitty'},{TERM_PROGRAM:'ghostty'},{TERM:'xterm-ghostty'},{TERM:'foot'},{TERM:'foot-extra'}])
    assert.equal(pointerShapeSupported(env),true,JSON.stringify(env));
  for(const env of [{WT_SESSION:'x',TERM:'xterm-256color'},{XTERM_VERSION:'XTerm(390)',TERM:'xterm'},{TERM_PROGRAM:'vscode'},{TERM_PROGRAM:'WezTerm'},{},{KITTY_WINDOW_ID:'1',SSH_CONNECTION:'a b c d'},{TERM:'footprint'}])
    assert.equal(pointerShapeSupported(env),false,JSON.stringify(env));
});

test('the shape is written only when it changes, and reset gives the default back once',()=>{
  const out:string[]=[];const shape=createPointerShape(sequence=>out.push(sequence));
  shape.hover(false);shape.hover(true);shape.hover(true);shape.hover(false);shape.hover(true);shape.reset();shape.reset();
  assert.deepEqual(out,['\u001b]22;pointer\u001b\\','\u001b]22;default\u001b\\','\u001b]22;pointer\u001b\\','\u001b]22;default\u001b\\']);
});
