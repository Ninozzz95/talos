/*
 * R5a (coordinator; owner 2026-09-24, twice): the effort selector as a line of nodes in TALOS's glyph style, then, after
 * comparing it with Claude Code's (`Faster … Smarter`, evenly spaced levels, a ▲ under the chosen one): "rendilo migliore e
 * mi raccomando accento ambra e gli effort in ordine da default … max". The owner's frame showed `default — max — high —
 * low`: the levels were drawn in the order the model declared them.
 *
 *   Effort · Z.ai: GLM 5.3 Flash
 *   Faster                                 Smarter
 *      ○────────○────────○────────●────────○
 *                                 ▲                      (amber)
 *   default   low     medium    high      max
 *                             ────                       (amber)
 *   High: deeper reasoning, slower, more tokens.
 *   In use now: medium
 *   ← → adjust · Enter confirm · Esc cancel
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {effortLineOverlay,effortLineRows,orderedEfforts} from '../../src/tui/overlays/effort-line.ts';
import {SLASH_COMMANDS} from '../../src/tui/slash-commands.ts';
import {resolveKeybinding,KEYBINDINGS} from '../../src/tui/keybindings.ts';
import {displayWidth} from '../../src/tui/text-width.ts';

const LEVELS=['default','low','medium','high','max'] as const;
/** The column under which `word` starts in the labels row. */
const col=(labels:string,word:string)=>labels.search(new RegExp(`(?<![a-z])${word}(?![a-z])`,'u'));

test('R5a /effort: the levels are always in order, default first, whatever order the model declares them in',()=>{
  assert.deepEqual(orderedEfforts(['max','high','low']),['low','high','max']);
  assert.deepEqual(orderedEfforts(['xhigh','minimal','medium','max','low','high']),['minimal','low','medium','high','xhigh','max']);
  assert.deepEqual(orderedEfforts(['turbo','high']),['high','turbo'],'a level TALOS does not know goes last, never dropped');
});

test('R5a /effort: evenly spaced nodes, the chosen one filled, ▲ and an underline under it, Faster … Smarter',()=>{
  const r=effortLineRows({choices:LEVELS,selected:3,width:80,unicode:true});
  assert.match(r.axis,/^Faster +Smarter$/u);
  assert.equal([...r.track].filter(ch=>ch==='●').length,1);
  assert.equal([...r.track].filter(ch=>ch==='○').length,4);
  const labels=r.labels,high=col(labels,'high');
  assert.ok(col(labels,'default')<col(labels,'low')&&col(labels,'low')<col(labels,'medium')&&col(labels,'medium')<high&&high<col(labels,'max'),labels);
  assert.equal(r.track.indexOf('●'),r.pointer.indexOf('▲'),'the pointer sits under the filled node');
  assert.ok(r.pointer.indexOf('▲')>=high&&r.pointer.indexOf('▲')<high+4,'…and over the chosen label');
  assert.equal(r.underline.indexOf('─'),high);assert.equal(r.underline.trim().length,4);
  const gaps=['default','low','medium','high','max'].map(w=>r.track.charAt(col(labels,w)+Math.floor(w.length/2)));
  assert.deepEqual(gaps,['○','○','○','●','○'],'each node sits over the middle of its label');
  assert.match(r.sentence,/^High: /u);
});

test('R5a /effort: 60 columns hold seven levels; a narrower screen trims the far ends with …, keeping the chosen one',()=>{
  const seven=['default','minimal','low','medium','high','xhigh','max'];
  for(let selected=0;selected<seven.length;selected++){
    const r=effortLineRows({choices:seven,selected,width:54,unicode:true});
    for(const row of [r.axis,r.track,r.pointer,r.labels,r.underline])assert.ok(displayWidth(row)<=54,`${row} (${displayWidth(row)})`);
    assert.ok(seven.every(w=>col(r.labels,w)>=0),`all seven at 54 columns: ${r.labels}`);
  }
  for(let selected=0;selected<seven.length;selected++){
    const r=effortLineRows({choices:seven,selected,width:30,unicode:true});
    for(const row of [r.track,r.pointer,r.labels,r.underline])assert.ok(displayWidth(row)<=30,`${row} (${displayWidth(row)})`);
    assert.ok(col(r.labels,seven[selected]!)>=0,`the chosen level stays: ${r.labels}`);
    assert.equal(r.track.indexOf('●'),r.pointer.indexOf('▲'));
  }
});

test('R5a /effort: plain terminals get ASCII',()=>{
  const r=effortLineRows({choices:LEVELS,selected:1,width:80,unicode:false});
  assert.doesNotMatch(r.track+r.pointer+r.underline,/[─○●▲…]/u);
  assert.match(r.track,/\*/u);assert.match(r.pointer,/\^/u);
});

test('R5a /effort: the overlay: amber pointer and underline, the sentence, what is in use, the keys',()=>{
  const overlay=effortLineOverlay({name:'qwen3-coder',choices:LEVELS,selected:3,current:'medium',width:80,unicode:true});
  const lines=[...(overlay.head??[]),...overlay.sections.flatMap(s=>s.lines),...(overlay.foot??[])];
  const text=lines.map(l=>l.text).join('\n');
  assert.match(text,/Effort · qwen3-coder/u);
  assert.match(text,/High: deeper reasoning/u);
  assert.match(text,/In use now: medium/u);
  assert.match(text,/← → adjust · Enter confirm · Esc cancel/u);
  assert.equal(lines.find(l=>l.text.includes('▲'))?.tone,'accent');
  assert.equal(lines.find(l=>/^ *─+$/u.test(l.text))?.tone,'accent');
  const same=effortLineOverlay({name:'x',choices:LEVELS,selected:2,current:'medium',width:80,unicode:true});
  assert.doesNotMatch([...same.sections.flatMap(s=>s.lines)].map(l=>l.text).join('\n'),/In use now/u,'no "in use" line when the chosen level is the one in use');
});

test('R5a /effort: the command exists with an optional level, and ← → move in every picker',()=>{
  assert.ok(SLASH_COMMANDS.some(c=>c.name==='effort'&&/level/u.test(c.usage)),'/effort [level] is listed');
  assert.equal(resolveKeybinding('',{leftArrow:true} as any,['model-picker'],KEYBINDINGS),'picker-up');
  assert.equal(resolveKeybinding('',{rightArrow:true} as any,['model-picker'],KEYBINDINGS),'picker-down');
});
