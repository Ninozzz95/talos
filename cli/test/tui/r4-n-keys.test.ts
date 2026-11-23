/*
 * R4 lane N — Q-R4-6 (Ctrl+L redraws; the model picker moves to Alt+P; the provider picker stays on /provider), Q-R4-7 in
 * the key reference (Ctrl+D, Esc Esc), Q-R4-12 (the permission modes have human names on screen), E16 (the key reference
 * follows the keys: /help and docs/talos-cli/command-reference.md).
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {KEYBINDINGS,keybindingHelp,resolveKeybinding} from '../../src/tui/keybindings.ts';
import {routeInput} from '../../src/tui/input-router.ts';
import {helpDialogText} from '../../src/tui/overlays/help-dialog.ts';
import {permissionModeLabel,terminalShortcutStrip} from '../../src/tui/components/terminal-shell.ts';
import {renderCommandReference} from '../../scripts/generate-command-reference.ts';

test('R4-N Ctrl+L redraws the screen in every context; Alt+P opens the model picker; the provider picker has no key',()=>{
  assert.equal(resolveKeybinding('l',{ctrl:true},['composer','history','transcript','global']),'redraw');
  assert.equal(resolveKeybinding('l',{ctrl:true},['model-picker','global']),'redraw');
  assert.equal(resolveKeybinding('p',{meta:true},['composer','history','transcript','global']),'model-picker');
  assert.deepEqual(KEYBINDINGS.find(row=>row.id==='provider-picker')?.keys,[]);
  assert.deepEqual(routeInput({ch:'l',key:{ctrl:true},focus:'composer',composerText:'a draft',commandMenuOpen:false}),{kind:'action',action:'redraw'});
  assert.deepEqual(routeInput({ch:'p',key:{meta:true},focus:'composer',composerText:'',commandMenuOpen:false}),{kind:'action',action:'model-picker'});
});

test('R4-N /help lists the new keys: Ctrl+L redraw, Alt+P model picker, Esc Esc clears the draft, Ctrl+D twice exits',()=>{
  const help=helpDialogText();
  const line=(pattern:RegExp)=>help.split('\n').find(row=>pattern.test(row))??'';
  assert.match(line(/^Ctrl\+L /u),/redraw/iu);
  assert.match(line(/^Alt\+P /u),/model picker/iu);
  assert.doesNotMatch(help,/provider picker/iu,'the provider picker has no key any more (/provider)');
  assert.match(line(/Esc Esc/u),/clear/iu);
  assert.match(line(/Esc Esc/u),/Up/u,'the line says how to get the draft back');
  assert.match(line(/^Ctrl\+D /u),/twice|two/iu);
  assert.match(line(/^Ctrl\+C \/ Esc /u),/draft/iu,'Ctrl+C says what it does with a draft');
  assert.equal(keybindingHelp().includes('Ctrl+L — Open model picker'),false);
});

test('R4-N the generated command reference in the repository follows the keys (E16)',async()=>{
  const file=await readFile(new URL('../../../docs/talos-cli/command-reference.md',import.meta.url),'utf8');
  assert.equal(file,renderCommandReference());
  assert.match(file,/\| `redraw` \| `global` \| `Ctrl\+L` \|/u);
  assert.match(file,/\| `model-picker` \| `composer` \| `Alt\+P` \|/u);
  assert.match(file,/`Esc Esc`/u);
});

test('R4-N the permission modes have human names on screen (Q-R4-12)',()=>{
  const names=Object.fromEntries(['default','acceptEdits','plan','auto','dontAsk','bypassPermissions'].map(mode=>[mode,permissionModeLabel(mode)]));
  assert.deepEqual(names,{default:'manual',acceptEdits:'accept edits',plan:'plan',auto:'auto',dontAsk:"don't ask",bypassPermissions:'Full access'});
  assert.equal(permissionModeLabel('something-new'),'something-new','an unknown mode is shown as it came');
  const strip=terminalShortcutStrip({mode:'acceptEdits',running:false,queueCount:0,width:120});
  assert.match(strip,/^mode accept edits · Shift\+Tab cycle/u);
  assert.doesNotMatch(strip,/acceptEdits/u);
  assert.match(terminalShortcutStrip({mode:'default',running:false,queueCount:0,width:120}),/^mode manual · /u);
});
