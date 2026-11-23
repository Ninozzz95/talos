import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {parseUnifiedDiff} from '../../src/tui/diff-model.ts';
import {renderDiffModel} from '../../src/tui/components/diff.ts';

const patch=[
  'diff --git a/src/a.ts b/src/a.ts',
  'index 1111111..2222222 100644',
  '--- a/src/a.ts',
  '+++ b/src/a.ts',
  '@@ -10,3 +10,4 @@ function a() {',
  ' context',
  '-old value',
  '+new value',
  '+extra',
  '\\ No newline at end of file',
].join('\n');

test('M4-C RED — Git unified parser distinguishes metadata hunks context additions and removals',()=>{
  const model=parseUnifiedDiff(patch);
  assert.equal(model.files.length,1);assert.equal(model.files[0]?.oldPath,'a/src/a.ts');assert.equal(model.files[0]?.newPath,'b/src/a.ts');
  const rows=model.files[0]!.rows;
  assert.deepEqual(rows.map(row=>row.kind),['meta','meta','meta','hunk','context','remove','add','add','no-newline']);
  assert.equal(rows.filter(row=>row.kind==='remove')[0]?.text,'old value');
  assert.equal(rows.filter(row=>row.kind==='add')[0]?.text,'new value');
  assert.equal(rows.find(row=>row.text==='old value')?.oldLine,11);
  assert.equal(rows.find(row=>row.text==='old value')?.newLine,null);
  assert.equal(rows.find(row=>row.text==='new value')?.oldLine,null);
  assert.equal(rows.find(row=>row.text==='new value')?.newLine,11);
  assert.equal(rows.find(row=>row.text==='context')?.oldLine,10);
  assert.equal(rows.find(row=>row.text==='context')?.newLine,10);
});

test('M4-C RED — file headers never become fake add/remove rows',()=>{
  const model=parseUnifiedDiff(patch);const rows=model.files[0]!.rows;
  const oldHeader=rows.find(row=>row.text==='--- a/src/a.ts'),newHeader=rows.find(row=>row.text==='+++ b/src/a.ts');
  assert.equal(oldHeader?.kind,'meta');assert.equal(newHeader?.kind,'meta');
  assert.equal(rows.filter(row=>row.kind==='add').some(row=>row.text.startsWith('++ b/')),false);
  assert.equal(rows.filter(row=>row.kind==='remove').some(row=>row.text.startsWith('-- a/')),false);
});

test('M4-C RED — malformed/non-patch input is plain evidence and never invented as changes',()=>{
  const model=parseUnifiedDiff('--- looks old\n+++ looks new\n+not a real hunk\n-ditto');
  assert.equal(model.files.length,0);assert.equal(model.plain.length,4);
  assert.equal(model.plain.some(row=>row.kind==='add'||row.kind==='remove'),false);
});

test('M4-C RED — responsive renderer keeps real prefixes and drops gutters in narrow mode',()=>{
  const model=parseUnifiedDiff(patch);
  const wide=renderDiffModel(model,100);assert.equal(wide.mode,'unified');assert.ok(wide.lines.some(row=>row.text.includes('11')&&row.text.includes('-old value')));assert.ok(wide.lines.some(row=>row.text.includes('+new value')));
  const narrow=renderDiffModel(model,30);assert.equal(narrow.mode,'narrow');assert.ok(narrow.lines.some(row=>row.text.startsWith('-old value')));assert.ok(narrow.lines.some(row=>row.text.startsWith('+new value')));
  assert.equal(narrow.lines.some(row=>/^\s*11\s/u.test(row.text)),false);
});

test('M4-C RED — no-change and terminal-control input degrade safely',()=>{
  const empty=renderDiffModel(parseUnifiedDiff('(no changes)'),40);assert.equal(empty.empty,true);assert.deepEqual(empty.lines.map(row=>row.text),['(no changes)']);
  const bad=renderDiffModel(parseUnifiedDiff('git error \u001b[31mred\u0007'),40);
  const rendered=bad.lines.map(row=>row.text).join('\n');assert.equal(rendered.includes('\u001b'),false);assert.equal(rendered.includes('\u0007'),false);assert.match(rendered,/\\u001b/u);
});

test('M4-C RED — app keeps real git diff acquisition but renders semantic responsive rows',async()=>{
  const source=await readFile(new URL('../../src/tui/app.ts',import.meta.url),'utf8');
  /* stage 7.16: /diff reads git diff HEAD (the untracked files beside it) into the mockup's sheet */
  assert.match(source,/\['diff','HEAD',\.\.\.diffArgs,'--no-color','--unified=3'\]/u);assert.match(source,/gitDiffFiles\(text\)/u);
  assert.match(source,/parseUnifiedDiff/u);assert.match(source,/renderDiffModel/u);
  assert.doesNotMatch(source,/diff\.slice\(-MAX_DIFF_CHARS\)/u);
  assert.match(source,/markdownBlockLines/u);assert.match(source,/parseMarkdownInline\(text\)\.map\(\(token:MarkdownInlineToken/u);// inline seam since 356c4b74e
});
