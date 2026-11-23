/*
 * R3 lane RD (owner Q-R3-4, Q-R3-11; gate E10): ONE line diff, jsdiff 9.0.0 (pinned, BSD-3-Clause), feeds the write/edit
 * row summary, its Ctrl+O diff and the approval preview. It replaces the multiset count of edit-renderer.ts, which saw a
 * moved line as no change and an edit of one of two identical lines as nothing (gate §3.1).
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {lineDiff} from '../../src/tui/line-diff.ts';
import {renderDiffModel} from '../../src/tui/components/diff.ts';

const rows=(before:string|null,after:string)=>lineDiff(before,after,{path:'src/a.ts'}).model.files.flatMap(file=>file.rows.map(row=>`${row.kind}:${row.oldLine??''}:${row.newLine??''}:${row.text}`));

test('R3 RD: one changed line is +1 −1 with old and new line numbers (unified rows the /diff panel already renders)',()=>{
  const diff=lineDiff('a\nconsole.log(1)\nb\n','a\nconsole.log(2)\nb\n',{path:'src/index.js'});
  assert.equal(diff.added,1);assert.equal(diff.removed,1);
  assert.deepEqual(diff.model.files.map(file=>[file.oldPath,file.newPath]),[['src/index.js','src/index.js']]);
  assert.deepEqual(rows('a\nconsole.log(1)\nb\n','a\nconsole.log(2)\nb\n'),[
    'hunk:::@@ -1,3 +1,3 @@','context:1:1:a','remove:2::console.log(1)','add::2:console.log(2)','context:3:3:b',
  ]);
  assert.equal(diff.model.empty,false);
});

test('R3 RD: a new file is all additions; an unchanged file is empty (the renderer says "no changes")',()=>{
  const created=lineDiff(null,'one\ntwo\nthree\n',{path:'notes.txt'});
  assert.equal(created.added,3);assert.equal(created.removed,0);
  assert.deepEqual(created.model.files[0]!.rows.filter(row=>row.kind==='add').map(row=>row.newLine),[1,2,3]);
  const same=lineDiff('x\n','x\n');
  assert.deepEqual([same.added,same.removed,same.model.empty],[0,0,true]);
  assert.deepEqual(renderDiffModel(same.model,80).lines.map(line=>line.text),['(no changes)']);
});

test('R3 RD: a real diff, not a multiset — a moved line and an edit of one of two identical lines are both seen',()=>{
  const moved=lineDiff('a\nb\nc\n','b\na\nc\n');
  assert.ok(moved.added>=1&&moved.removed>=1,`a moved line is a change: +${moved.added} −${moved.removed}`);
  const twin=lineDiff('x = 1\nx = 1\n','x = 1\nx = 2\n');
  assert.deepEqual([twin.added,twin.removed],[1,1]);
});

test('R3 RD: line ends are diffed as they are but never reach the screen as a carriage return',()=>{
  const diff=lineDiff('a\r\nb\r\n','a\r\nc\r\n');
  assert.deepEqual([diff.added,diff.removed],[1,1]);
  const texts=diff.model.files.flatMap(file=>file.rows.map(row=>row.text));
  assert.equal(texts.some(text=>text.includes('\r')),false,JSON.stringify(texts));
});

test('R3 RD: the renderer draws the model at both widths (unified with line numbers ≥ 72 columns, prefixes below)',()=>{
  const diff=lineDiff('a\nb\n','a\nc\n',{path:'x.ts'});
  const wide=renderDiffModel(diff.model,100).lines.map(line=>line.text);
  assert.ok(wide.some(line=>/^\s+2\s+│ -b$/u.test(line)),wide.join('\n'));
  assert.ok(wide.some(line=>/^\s+2 │ \+c$/u.test(line)),wide.join('\n'));
  const narrow=renderDiffModel(diff.model,40).lines.map(line=>line.text);
  assert.ok(narrow.includes('-b')&&narrow.includes('+c'),narrow.join('\n'));
});

test('R3 RD: a change too large to compare line by line says so and is flagged approximate, never a fake minimal diff',()=>{
  const before=Array.from({length:60_000},(_,i)=>`line ${i}`).join('\n');
  const after=Array.from({length:60_000},(_,i)=>`row ${i}`).join('\n');
  const diff=lineDiff(before,after);
  assert.equal(diff.approximate,true);
  assert.equal(diff.model.empty,false);
  assert.match(renderDiffModel(diff.model,80).lines.map(line=>line.text).join('\n'),/too large to compare line by line/u);
});

test('R3 RD: jsdiff is the pinned 9.0.0 (Q-R3-11) and the multiset count is gone from the edit renderer (E10)',()=>{
  const pkg=JSON.parse(readFileSync(new URL('../../package.json',import.meta.url),'utf8'));
  /* installation (02/10): jsdiff is bundled into dist/ (scripts/bundle.mjs), so it is a build dependency; the pin is the decision */
  assert.equal(pkg.devDependencies?.diff??pkg.dependencies?.diff,'9.0.0');
  const edit=readFileSync(new URL('../../src/tui/tools/edit-renderer.ts',import.meta.url),'utf8');
  assert.doesNotMatch(edit,/new Map<string,number>\(\)/u,'the multiset count (oldCounts/newCounts) is gone');
  assert.match(edit,/lineDiff|changeDiff/u,'the edit row reads the one line diff');
});
