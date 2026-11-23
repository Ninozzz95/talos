/*
 * Stage 7.20 (mockup `markdownRows`, `inline`, `wrapSegs`): a note's Markdown as the sheet draws it — heading, items wrapped
 * under their bullet, a code block between ``` as «  │ » rows, **bold** and `code` inside a line.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {markdownRows} from '../../src/tui/panel/markdown-rows.ts';

/* the mockup's wrapSegs keeps the space before a break; the sheet pads every row, so it never shows */
const text=(rows:ReturnType<typeof markdownRows>)=>rows.map(row=>row.map(seg=>seg.text).join(''));
const shown=(rows:ReturnType<typeof markdownRows>)=>text(rows).map(line=>line.trimEnd());
/* words split for wrapping, joined back by role */
const runs=(row:ReturnType<typeof markdownRows>[number])=>row.reduce<[string,string][]>((out,seg)=>{const role=seg.roles.join(' ');const last=out.at(-1);if(last&&last[1]===role)last[0]+=seg.text;else out.push([seg.text,role]);return out;},[]);

test('a code block is «  │ » rows in the code role, its fences gone, its words never read as Markdown',()=>{
  const rows=markdownRows('## Run\n```\n- not an item\n**not bold**\n```\nafter',20);
  assert.deepEqual(text(rows),['Run','  │ - not an item   ','  │ **not bold**    ','after']);
  assert.deepEqual(rows[1]!.map(seg=>seg.roles),[['faint'],['code']]);
  assert.deepEqual(rows[0]![0]!.roles,['acc','b']);
});

test('a long item wraps by words under its bullet; a long line wraps with no indent',()=>{
  assert.deepEqual(shown(markdownRows('- Run the full end to end suite before tagging',20)),['  • Run the full end','    to end suite','    before tagging']);
  assert.deepEqual(shown(markdownRows('Boost exact title matches, then recency.',20)),['Boost exact title','matches, then','recency.']);
});

test('**bold** keeps the line\'s role and adds b; `code` is accent code',()=>{
  const [row]=markdownRows('Run `pnpm e2e` **first**',40);
  assert.deepEqual(runs(row!),[['Run ',''],['pnpm e2e','acc code'],[' ',''],['first','b']]);
});
