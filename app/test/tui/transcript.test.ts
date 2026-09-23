import assert from 'node:assert/strict';
import test from 'node:test';
import {reduceViewport,transcriptWindow} from '../../src/tui/components/transcript.ts';
import {parseMarkdownBlocks} from '../../src/tui/components/markdown.ts';
import {assistantStreamView} from '../../src/tui/components/assistant-stream.ts';
import {thinkingRowText} from '../../src/tui/components/thinking-row.ts';

test('new content follows tail only while user has not scrolled away',()=>{
  let v={offset:0,pageSize:20,unseen:0,followingTail:true};
  v=reduceViewport(v,'page-up',100);assert.equal(v.followingTail,false);
  v=reduceViewport(v,'new-content',101);assert.equal(v.unseen,1);
  v=reduceViewport(v,'jump-tail',101);assert.deepEqual(v,{offset:0,pageSize:20,unseen:0,followingTail:true});
});

test('transcript window retains all navigation positions without duplicating rows',()=>{
  const rows=Array.from({length:50},(_,i)=>({id:String(i)}));
  assert.deepEqual(transcriptWindow(rows,{offset:10,pageSize:5,unseen:0,followingTail:false}).map((x:any)=>x.id),['35','36','37','38','39']);
});

test('markdown parser isolates fenced code and headings',()=>{
  const blocks=parseMarkdownBlocks('# Title\n```ts\nconst x=1\n```\ntext');
  assert.deepEqual(blocks.map(x=>x.kind),['heading','code','paragraph']);
  assert.equal((blocks[1] as any).language,'ts');
});

test('live assistant and thinking surfaces remain independent',()=>{
  assert.deepEqual(assistantStreamView({id:'a',text:'answer'}),{label:'TALOS',id:'a',text:'answer'});
  assert.equal(thinkingRowText('private progress',false),null);
  assert.equal(thinkingRowText('private progress',true),'private progress');
});


test('M4-B new-content semantics count rows rather than streaming deltas',async()=>{
  const {transcriptEventAddsItem}=await import('../../src/tui/components/transcript.ts');
  assert.equal(transcriptEventAddsItem({type:'message.started',messageId:'a',role:'assistant'}),true);
  assert.equal(transcriptEventAddsItem({type:'message.delta',messageId:'a',delta:'x'}),false);
  assert.equal(transcriptEventAddsItem({type:'tool.started',toolCallId:'t',toolName:'bash'}),true);
  assert.equal(transcriptEventAddsItem({type:'tool.output',toolCallId:'t',delta:'x'}),false);
});
