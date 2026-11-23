import assert from 'node:assert/strict';
import test from 'node:test';
import {markdownBlockLines,markdownInlineText,parseMarkdownBlocks,parseMarkdownInline} from '../../src/tui/components/markdown.ts';

test('M4-C RED — parser keeps headings lists code and GFM-style tables as semantic blocks',()=>{
  const blocks=parseMarkdownBlocks([
    '# Title',
    '',
    '- alpha',
    '- beta',
    '',
    '3. three',
    '4. four',
    '',
    '| Left | Center | Right |',
    '| :--- | :---: | ---: |',
    '| a | b | c |',
    '',
    '```ts',
    'const x = 1',
    '```',
  ].join('\n'));
  assert.deepEqual(blocks.map(block=>block.kind),['heading','list','list','table','code']);
  const unordered:any=blocks[1];assert.equal(unordered.ordered,false);assert.deepEqual(unordered.items,['alpha','beta']);
  const ordered:any=blocks[2];assert.equal(ordered.ordered,true);assert.equal(ordered.start,3);assert.deepEqual(ordered.items,['three','four']);
  const table:any=blocks[3];assert.deepEqual(table.headers,['Left','Center','Right']);assert.deepEqual(table.align,['left','center','right']);assert.deepEqual(table.rows,[['a','b','c']]);
});

test('M4-C RED — inline links degrade to safe readable text and unsafe schemes remain literal',()=>{
  assert.equal(markdownInlineText('[OpenAI](https://openai.com/docs)'),'OpenAI (https://openai.com/docs)');
  assert.equal(markdownInlineText('[local](./docs/readme.md)'),'local (./docs/readme.md)');
  assert.equal(markdownInlineText('[bad](javascript:alert(1))'),'[bad](javascript:alert(1))');
  const control=markdownInlineText('safe\u001b]8;;https://evil.example\u0007x\u202Ey');
  assert.equal(control.includes('\u001b'),false);assert.equal(control.includes('\u0007'),false);assert.equal(control.includes('\u202e'),false);
  assert.match(control,/\\u001b/u);assert.match(control,/\\u0007/u);assert.match(control,/\\u202e/u);
});

test('M4-C RED — wide tables align by display width while narrow tables retain every field',()=>{
  const table:any=parseMarkdownBlocks('| 名 | Value |\n| --- | ---: |\n| 界 | 12 |\n| abc | 3 |')[0];
  const wide=markdownBlockLines(table,60);
  assert.equal(wide.mode,'wide');assert.ok(wide.lines.some((line:string)=>line.includes('名')&&line.includes('Value')));assert.ok(wide.lines.some((line:string)=>line.includes('界')&&line.includes('12')));
  const narrow=markdownBlockLines(table,18);
  assert.equal(narrow.mode,'narrow');
  const text=narrow.lines.join('\n');for(const value of ['名: 界','Value: 12','名: abc','Value: 3'])assert.match(text,new RegExp(value));
});

test('M4-C RED — links inside lists and tables use the same safe textual degradation',()=>{
  const list:any=parseMarkdownBlocks('- [docs](https://example.com/x)')[0];
  assert.deepEqual(markdownBlockLines(list,80).lines,['• docs (https://example.com/x)']);
  const table:any=parseMarkdownBlocks('| Ref |\n| --- |\n| [x](https://example.com) |')[0];
  assert.match(markdownBlockLines(table,80).lines.join('\n'),/x \(https:\/\/example\.com\)/u);
});


test('resize/markdown RED — rich inline Markdown removes delimiters into semantic tokens and blockquotes are structural',()=>{
  const tokens=parseMarkdownInline('A **bold** *italic* `code` ~~gone~~ [docs](https://example.com)');
  assert.deepEqual(tokens.map((token:any)=>token.kind),['text','strong','text','emphasis','text','code','text','strike','text','link']);
  assert.equal(tokens.find((token:any)=>token.kind==='strong')?.text,'bold');
  assert.equal(tokens.find((token:any)=>token.kind==='emphasis')?.text,'italic');
  assert.equal(tokens.find((token:any)=>token.kind==='code')?.text,'code');
  assert.equal(tokens.find((token:any)=>token.kind==='strike')?.text,'gone');
  assert.deepEqual(tokens.find((token:any)=>token.kind==='link'),{kind:'link',text:'docs',href:'https://example.com'});
  const blocks=parseMarkdownBlocks('> quoted **text**');
  assert.equal(blocks[0]?.kind,'blockquote');
});

test('resize/markdown RED — incomplete streaming inline syntax degrades to literal safe text',()=>{
  assert.deepEqual(parseMarkdownInline('partial **bold'),[{kind:'text',text:'partial **bold'}]);
  assert.deepEqual(parseMarkdownInline('partial `code'),[{kind:'text',text:'partial `code'}]);
});

test('productization RED-P1/P2 — per-view Markdown parse memo reuses unchanged text while width remains a layout concern',async()=>{
  const markdown:any=await import('../../src/tui/components/markdown.ts');
  assert.equal(typeof markdown.createMarkdownParseMemo,'function','a per-view parse memo seam must exist before optimization can be proven deterministically');
  let parses=0;
  const memo=markdown.createMarkdownParseMemo({
    parser:(text:string)=>{parses++;return markdown.parseMarkdownBlocks(text);},
  });
  const source='| Name | Value |\n| --- | ---: |\n| alpha | 12 |';
  const first=memo.get(source);
  const same=memo.get(source);
  assert.strictEqual(same,first,'unchanged finalized Markdown must retain the same parsed-block identity');
  assert.equal(parses,1,'unchanged Markdown must not be reparsed');

  const wide=markdown.markdownBlockLines(first[0],80);
  const narrow=markdown.markdownBlockLines(same[0],18);
  assert.equal(wide.mode,'wide');
  assert.equal(narrow.mode,'narrow');
  assert.equal(parses,1,'a width-only reflow must reuse width-independent parse structure');

  const changed=memo.get(source+'\n\n**tail**');
  assert.notStrictEqual(changed,first);
  assert.equal(parses,2,'text mutation must invalidate the parse memo exactly once');
});

test('productization RED-P3/P4/P5 — finalized views stay reusable while only a streaming tail or resize invalidates rendering',async()=>{
  const markdown:any=await import('../../src/tui/components/markdown.ts');
  assert.equal(typeof markdown.markdownRenderPropsEqual,'function','React memoization needs an explicit deterministic comparator seam');
  const same={text:'# stable **answer**',width:80};
  assert.equal(markdown.markdownRenderPropsEqual(same,{...same}),true,'unrelated parent/status renders must reuse finalized Markdown');
  assert.equal(markdown.markdownRenderPropsEqual(same,{text:'# stable **answer** + delta',width:80}),false,'streaming-tail text must invalidate only that view');
  assert.equal(markdown.markdownRenderPropsEqual(same,{text:same.text,width:60}),false,'resize must invalidate width-dependent layout');

  let parses=0;
  const parser=(text:string)=>{parses++;return markdown.parseMarkdownBlocks(text);};
  const finalizedA=markdown.createMarkdownParseMemo({parser});
  const finalizedB=markdown.createMarkdownParseMemo({parser});
  const tail=markdown.createMarkdownParseMemo({parser});
  finalizedA.get('## A');
  finalizedB.get('- B');
  tail.get('partial');
  assert.equal(parses,3);
  finalizedA.get('## A');
  finalizedB.get('- B');
  tail.get('partial + delta');
  assert.equal(parses,4,'a tail delta must not force reparsing of finalized sibling messages');

  const semantic=tail.get('**bold** *italic* `code` ~~gone~~ [docs](https://example.com)');
  assert.equal(semantic[0]?.kind,'paragraph','memoization must preserve the existing semantic parser output');
});
