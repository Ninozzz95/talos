import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {KEYBINDINGS} from '../../src/tui/keybindings.ts';
import {SLASH_COMMANDS} from '../../src/tui/slash-commands.ts';
import {helpDialogText} from '../../src/tui/overlays/help-dialog.ts';
import {renderCommandReference} from '../../scripts/generate-command-reference.ts';

test('M2-F-RED-2 — help comes from slash catalog plus supplied effective keymap',()=>{
  const effective=KEYBINDINGS.map(row=>row.id==='model-picker'?{...row,keys:['Alt+M']}:row);
  const text=helpDialogText(effective);
  for(const command of SLASH_COMMANDS)assert.ok(text.includes('/'+command.name),command.name);
  assert.ok(text.includes('Alt+M'));
  const modelLine=text.split(/\r?\n/u).find(line=>line.includes('Open model picker'));
  assert.ok(modelLine);
  assert.equal(modelLine.includes('Ctrl+L'),false);
});

test('M2-F-RED-3 — generated command reference is byte-identical to current runtime catalogs',async()=>{
  const generated=renderCommandReference();
  const file=await readFile(new URL('../../../docs/talos-cli/command-reference.md',import.meta.url),'utf8');
  assert.equal(file,generated);
  // A command with a usage is rendered inside the same code span (`/model [provider:model]`).
  for(const command of SLASH_COMMANDS){
    assert.ok(file.includes('| `/'+command.name+'`')||file.includes('| `/'+command.name+' '),command.name);
  }
  for(const binding of KEYBINDINGS)for(const key of binding.keys)assert.ok(file.includes('`'+key+'`'),binding.id+': '+key);
});
