import assert from 'node:assert/strict';
import test from 'node:test';
import {KEYBINDINGS,keybindingHelp,cyclePermissionMode,resolveKeybinding} from '../../src/tui/keybindings.ts';

test('keyboard reference covers semantic actions without duplicate chords in the same context',()=>{
 for(const id of ['submit','newline','interrupt','exit','left','right','home','end','word-left','word-right','backspace','delete-forward','kill-start','kill-end','kill-word','yank','history-prev','history-next','history-search','palette','page-up','page-down','redraw','permission-cycle','model-picker','provider-picker','reasoning-toggle','external-editor','tool-details','approval-once','approval-session','approval-always','approval-deny-once','approval-deny-always','approval-cancel','help'])assert.ok(KEYBINDINGS.some(x=>x.id===id),`missing ${id}`);
 const seen=new Set<string>();for(const b of KEYBINDINGS){for(const key of b.keys){const k=`${b.context}:${key}`;assert.equal(seen.has(k),false,`duplicate ${k}`);seen.add(k);}}
 assert.match(keybindingHelp(),/Ctrl\+R/u);assert.match(keybindingHelp(),/Shift\+Tab/u);assert.match(keybindingHelp(),/Alt\+P/u);assert.match(keybindingHelp(),/Ctrl\+O/u);assert.match(keybindingHelp(),/Ctrl\+L/u);
});

/* Owner 27/09 ("la modalità full access con shift tab non esiste, da sistemare immediatamente"): Full access is in the
   Shift+Tab cycle, after plan; it used to be left out, as in Claude Code without its skip-permissions flag. */
test('permission cycle is predictable and reaches Full access',()=>{
 assert.equal(cyclePermissionMode('default'),'acceptEdits');assert.equal(cyclePermissionMode('acceptEdits'),'plan');assert.equal(cyclePermissionMode('plan'),'bypassPermissions');assert.equal(cyclePermissionMode('bypassPermissions'),'default');assert.equal(cyclePermissionMode('dontAsk'),'default');
});

test('Ink key events resolve through the same binding registry used by help',()=>{
 /* R4 Q-R4-6: Ctrl+L redraws; Alt+P opens the model picker. */
 assert.equal(resolveKeybinding('l',{ctrl:true},['composer','global']),'redraw');
 assert.equal(resolveKeybinding('p',{meta:true},['composer','global']),'model-picker');
 assert.equal(resolveKeybinding('',{shift:true,tab:true},['composer','global']),'permission-cycle');
 assert.equal(resolveKeybinding('p',{ctrl:true},['history','composer','global']),'history-prev');
 assert.equal(resolveKeybinding('1',{},['approval']),'approval-once');
 assert.equal(resolveKeybinding('d',{ctrl:true},['composer','global']),'delete-forward');
 assert.equal(resolveKeybinding('',{pageUp:true},['transcript','global']),'page-up');
 assert.equal(resolveKeybinding('',{upArrow:true},['model-picker','global']),'picker-up');
});

test('overlays expose semantic close, search edit, and approval review actions',()=>{
  assert.equal(resolveKeybinding('',{backspace:true},['model-picker','global']),'picker-backspace');
  assert.equal(resolveKeybinding('',{escape:true},['help','global']),'overlay-close');
  assert.equal(resolveKeybinding('v',{},['approval','global']),'approval-view');
});


test('M2-D keybinding help and resolution accept the same effective map',async()=>{
  const {assertValidKeymap}=await import('../../src/tui/keymap-resolver.ts');
  const effective=assertValidKeymap({'model-picker':['Alt+M']});
  assert.equal(resolveKeybinding('m',{meta:true},['composer','global'],effective),'model-picker');
  assert.equal(resolveKeybinding('l',{ctrl:true},['composer','global'],effective),'redraw');
  const help=keybindingHelp(effective);
  assert.match(help,/Alt\+M — Open model picker/u);
  assert.doesNotMatch(help,/Ctrl\+L — Open model picker/u);
});
