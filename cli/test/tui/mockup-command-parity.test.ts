/*
 * Tappa 8 C3 (dossier RICERCA-5x5x5x5-TAPPA8-CONFORMITA-2026-10-07): the product's command catalogue must speak the
 * approved mockup's words (fixtures/mockup-commands.json, source MOCKUP-FASE-UI-2026-10-01-v2 COMMANDS/GROUPS).
 * Known, documented divergences: /tui and /whatsnew are mockup-only («not in this version yet», slash-commands.ts);
 * the usage strings of permissions/hooks/plugins keep the product's full subcommand list where the mockup abbreviates
 * (quarantine, release, history are real subcommands — hiding them would document less than the product does).
 * /remote is product-only: 0.6.15 T4 (the approved plan PIANO-0615-REMOTO.md and the pairing mockup v3) adds it after the menu's mockup.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {helpCommands} from '../../src/tui/slash-commands.ts';
import {commandMenuItems,commandMenuOverlay} from '../../src/tui/components/command-menu.ts';

const MOCK=JSON.parse(readFileSync(new URL('./fixtures/mockup-commands.json',import.meta.url),'utf8')) as {groups:[string,string][];commands:Array<{name:string;group:string;desc:string;usage:string;fresh:boolean}>};
const GROUP_LABEL=new Map<string,string>(MOCK.groups) as ReadonlyMap<string,string>;
const MOCK_ONLY=new Set(['tui','whatsnew']);
/* FE-048 (owner 01/11, pages of the redesign): /board, /models, /capability come from the CLI mockup's sections, after this menu's mockup */
const PRODUCT_ONLY=new Set(['remote','zen','essential','full','sidebar','panel','shelf','home','new','board','models','capability','devices','processes','trust',/* C11b: the CLI mockup's palette, bozzetto-cli-retro/index.html:562 */'projects']);
/* FE-048 (01/11): /usage opens the CLI usage page (C5, form agreed with the sessions), so it says what that page holds */
const NEW_WORDS:Record<string,string>={usage:'Tokens and cost by day and by model'};
const USAGE_KEEPERS=['permissions','hooks','plugins'];

test('C3: the catalogue matches the mockup — same commands, groups, order and words',()=>{
  const product=helpCommands().filter(row=>!PRODUCT_ONLY.has(row.name));
  const expected=MOCK.commands.filter(command=>!MOCK_ONLY.has(command.name));
  assert.deepEqual(product.map(row=>row.name),expected.map(row=>row.name),'the product lists exactly the mockup commands, in its order');
  /* the fixture stores the group's key («session»); the mockup's word is the label («Session») — compare labels. */
  assert.deepEqual(product.map(row=>row.group),expected.map(row=>GROUP_LABEL.get(row.group)),'the group names are the mockup ones');
  const byName=new Map(product.map(row=>[row.name,row]));
  for(const command of expected){
    const row=byName.get(command.name)!;
    assert.equal(row.desc,NEW_WORDS[command.name]??command.desc,`/${command.name}: the description must be the mockup words`);
  }
});

test('C3: usage strings match the mockup except the documented full-subcommand keepers',()=>{
  const byName=new Map(helpCommands().map(row=>[row.name,row]));
  for(const command of MOCK.commands){
    if(MOCK_ONLY.has(command.name)||USAGE_KEEPERS.includes(command.name))continue;
    assert.equal(byName.get(command.name)!.usage,command.usage,`/${command.name} usage`);
  }
  assert.ok(byName.get('hooks')!.usage.includes('quarantine'),'the full hook subcommands stay documented');
});

test('C3: the palette at an empty query lists the catalogue in the mockup group order, not alphabetically',()=>{
  const rows=commandMenuItems('/');
  assert.deepEqual(rows.map(row=>row.command.name).slice(0,10),
    ['resume','fork','rename','export','undo','history','clear','compact','exit','provider'],
    'the empty query follows the mockup order (HELP_ORDER)');
});

test('C3: the palette overlay draws the five group headers with the descriptions aligned in one column',()=>{
  const overlay=commandMenuOverlay({text:'/',selected:0});
  const lines=overlay.sections[0]!.lines.map(line=>line.text);
  const headers=lines.filter(text=>!text.trimStart().startsWith('/')&&!text.includes('›')&&text.trim().length>0);
  assert.deepEqual(headers.map(text=>text.trim()),['Session','Model and turn','View','Work','Extensions']);
  const resume=lines.find(text=>text.includes('/resume'))!;
  const fork=lines.find(text=>text.includes('/fork'))!;
  assert.ok(resume.startsWith('›'),`the first row of the empty palette is highlighted: ${JSON.stringify(resume)}`);
  assert.equal(resume.indexOf('Pick up an earlier conversation'),fork.indexOf('Branch this conversation from a message'),
    'the mockup aligns the description column across rows');
  assert.ok(fork.includes('/fork'),`the rows keep the /name: ${JSON.stringify(fork)}`);
});
