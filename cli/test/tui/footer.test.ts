import assert from 'node:assert/strict';
import test from 'node:test';
import {displayWidth} from '../../src/tui/text-width.ts';
import {headerLine} from '../../src/tui/components/header.ts';
import {contextUsageLabel,layoutFooter,sanitizeStatus,type FooterField} from '../../src/tui/components/footer.ts';
import {helpDialogText} from '../../src/tui/overlays/help-dialog.ts';
import {keybindingHelp} from '../../src/tui/keybindings.ts';

test('footer drops low-priority fields first and never exceeds width',()=>{
  const fields:FooterField[]=[
    {id:'run',text:'ready',priority:100},
    {id:'queue',text:'queued 2',priority:96},
    {id:'unseen',text:'3 new',priority:95},
    {id:'model',text:'model openai:gpt-5-mini',priority:90},
    {id:'mode',text:'mode default',priority:80},
    {id:'session',text:'session s1',priority:70},
    {id:'context',text:'context 12k',priority:60},
    {id:'workspace',text:'/repo/talos',priority:50},
  ];
  const wide=layoutFooter(fields,120);
  const narrow=layoutFooter(fields,50);
  assert.match(wide,/session/u);
  assert.match(wide,/context/u);
  assert.match(wide,/queued 2/u);
  assert.ok(displayWidth(narrow)<=50);
  assert.match(narrow,/model/u);
  assert.doesNotMatch(narrow,/repo\/talos/u);
});

test('status text is sanitized to one line',()=>{
  assert.equal(sanitizeStatus('connected\nsecret\t now'),'connected secret now');
});

test('turn usage never impersonates measured context occupancy',()=>{
  assert.equal(contextUsageLabel({prompt_tokens:1200,completion_tokens:300},null),'usage 1.5k');
  assert.equal(contextUsageLabel({prompt_tokens:1200,completion_tokens:300},8192),'usage 1.5k');
  assert.equal(contextUsageLabel({prompt_tokens:1200},null),'usage 1.2k');
  assert.equal(contextUsageLabel({},128000),null);
  assert.equal(contextUsageLabel({
    schema:'talos.cli.context-status.v1',
    measurement:{inputTokens:40_000,windowTokens:100_000,percentOfWindow:40,stale:false},
  },null),'context 40k/100k · 40%');
});

test('header carries brand and workspace identity without footer fields',()=>{
  const line=headerLine({workspace:'/repo/talos',status:'ready\nnow'});
  assert.match(line,/TALOS/u);
  assert.match(line,/\/repo\/talos/u);
  assert.match(line,/ready now/u);
  assert.doesNotMatch(line,/model|permission|session|context/u);
});

test('help dialog is rendered directly from the keybinding registry',()=>{
  // M2-F (1fd6c646d): help renders the slash catalog, then the keymap; the Keyboard section is the registry verbatim.
  const [commands,keyboard]=helpDialogText().split('\n\nKeyboard\n');
  assert.match(commands??'',/^Commands\n/u);
  assert.equal(keyboard,keybindingHelp());
  assert.match(helpDialogText(),/Ctrl\+L/u);
  assert.match(helpDialogText(),/Alt\+P/u);
});
