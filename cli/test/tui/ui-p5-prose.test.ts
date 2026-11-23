import assert from 'node:assert/strict';
import test from 'node:test';
import {markdownBlockWidth,markdownRenderPropsEqual,parseMarkdownBlocks} from '../../src/tui/components/markdown.ts';
import {estimateTranscriptItemRows} from '../../src/tui/components/transcript-virtualizer.ts';

test('P5-WIDTH prose alone is capped; code, tables and source retain their full width',()=>{
  const source='# Heading\n\nParagraph words\n\n> Quoted text\n\n- List text\n\n```js\nconst example = 123;\n```\n\n| A | B |\n| --- | --- |\n| 1 | 2 |';
  const blocks=parseMarkdownBlocks(source),before=JSON.stringify(blocks);
  for(const block of blocks){
    assert.equal(markdownBlockWidth(block,120,60),block.kind==='code'||block.kind==='table'?120:60,block.kind);
    assert.equal(markdownBlockWidth(block,30,60),30);
    assert.equal(markdownBlockWidth(block,120,null),120);
  }
  assert.equal(JSON.stringify(blocks),before);
});
test('P5-MEMO changing only the prose cap invalidates the render',()=>{
  assert.equal(markdownRenderPropsEqual({text:'same',width:120,maxProseWidth:60},{text:'same',width:120,maxProseWidth:80}),false);
  assert.equal(markdownRenderPropsEqual({text:'same',width:120,maxProseWidth:60},{text:'same',width:120,maxProseWidth:60}),true);
});
test('P5-MEASURE capped assistant prose is counted before mounting, raw and user remain full width',()=>{
  const item:any={kind:'message',id:'a',role:'assistant',text:'word '.repeat(100)};
  assert.ok(estimateTranscriptItemRows(item,120,{maxProseWidth:40})>estimateTranscriptItemRows(item,120));
  assert.equal(estimateTranscriptItemRows({...item,role:'user'},120,{maxProseWidth:40}),estimateTranscriptItemRows({...item,role:'user'},120));
  assert.equal(estimateTranscriptItemRows(item,120,{raw:true,maxProseWidth:40}),estimateTranscriptItemRows(item,120,{raw:true}));
});
