/*
 * Stage 7.10c: a provider step (consent, sign-in way, sign-in under way, masked key) drawn as the mockup's sheet, with the
 * step's own words: the selected choice in the accent, the keys under it.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {overlayAsPanel} from '../../src/tui/panel/from-overlay.ts';
import {panelHeight,panelRows} from '../../src/tui/panel/sheet.ts';
import {providerConsentOverlay,providerKeyOverlay} from '../../src/tui/overlays/provider-picker.ts';

const draw=(panel:any,w=100)=>panelRows(panel,w,panelHeight(panel,w,40,2,0));
const text=(rows:any[])=>rows.map(row=>row.map((s:any)=>s.text).join('').replace(/\s+$/u,''));

test('the consent step as a sheet: the title, the question, No preselected in the accent, the keys',()=>{
  const panel=overlayAsPanel('AI provider','OpenRouter',providerConsentOverlay({provider:{label:'OpenRouter',environmentVariable:'OPENROUTER_API_KEY'},choice:'no'}));
  const rows=draw(panel);const lines=text(rows);
  assert.match(lines[0]!,/^── AI provider OpenRouter ─+ ✕$/u);
  assert.ok(lines.some(line=>/OPENROUTER_API_KEY was found in the environment\. Use it for OpenRouter\?/u.test(line)),lines.join('\n'));
  const no=rows.find((row:any)=>row.map((s:any)=>s.text).join('').includes('› No (recommended)'));
  assert.ok(no,'No is preselected');assert.deepEqual([...no!.find((s:any)=>s.text.includes('No (recommended)'))!.roles].sort(),['acc','b']);
  assert.ok(lines.some(line=>/^  \S/u.test(line)&&/Enter|Esc/u.test(line)),'the step\'s keys are said');
});

test('the masked key step as a sheet: only the dots, never the key',()=>{
  const panel=overlayAsPanel('AI provider','OpenAI',providerKeyOverlay({label:'OpenAI',remediation:null,benched:null,masked:'•••••',keyTestNotice:null,testing:false,result:null}));
  const lines=text(draw(panel));
  assert.ok(lines.some(line=>/•••••/u.test(line)),lines.join('\n'));
});
