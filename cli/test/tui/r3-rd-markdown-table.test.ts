/*
 * R3 lane RD (gate E13, D-13; §0.12, §7): the wide table layout wrote the Markdown alignment colon into its own separator
 * (`-----:-+--------`), which the s03 frame showed. The separator is dashes only; alignment stays in the cell padding
 * (`padCell`), as Codex, Crush, Goose and Qwen draw it (they honour alignment and never print the delimiter row).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {displayWidth} from '../../src/tui/text-width.ts';
import {markdownBlockLines,parseMarkdownBlocks} from '../../src/tui/components/markdown.ts';

const TABLE='| Left | Center | Right |\n| :--- | :---: | ---: |\n| a | b | c |\n| long left | mid | 12345 |';

test('R3 RD D-13: the separator of a wide table has no alignment colon, for left, center and right columns',()=>{
  const block:any=parseMarkdownBlocks(TABLE)[0];
  assert.deepEqual(block.align,['left','center','right'],'the parser still records the alignment');
  const layout=markdownBlockLines(block,80);
  assert.equal(layout.mode,'wide');
  const separator=layout.lines[1]!;
  assert.doesNotMatch(separator,/:/u,`the separator leaks the colon: ${separator}`);
  assert.match(separator,/^-+-\+--+-\+--+$/u,separator);
});

test('R3 RD D-13: alignment stays in the cell padding (left pads right, right pads left, center splits the gap)',()=>{
  const layout=markdownBlockLines(parseMarkdownBlocks(TABLE)[0]!,80);
  const cells=(line:string)=>line.split(' | ');
  const [left,center,right]=cells(layout.lines[2]!);
  assert.equal(left,'a        ','left: value then padding');
  assert.equal(right,'    c','right: padding then value');
  assert.equal(center,'  b   ','center: the gap split, the extra space on the right');
  const widths=layout.lines.map(line=>displayWidth(line));
  assert.equal(new Set(widths).size,1,`every row is as wide as the separator: ${widths.join(',')}`);
});

test('R3 RD D-13: a table without alignment colons renders exactly as before (dashes, same widths)',()=>{
  const layout=markdownBlockLines(parseMarkdownBlocks('| Name | Value |\n| --- | --- |\n| alpha | 12 |')[0]!,80);
  assert.deepEqual(layout.lines,['Name  | Value','------+------','alpha | 12   ']);
});
