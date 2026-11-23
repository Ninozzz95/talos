import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {queueEditorLines,queueEditorSelected} from '../../src/tui/overlays/queue-editor.ts';

test('M3-D queue editor renders numbered sanitized state and explicit recovery controls',()=>{
  const entries:any[]=[
    {id:'a',kind:'prompt',text:'safe\u001b[2J\u202Ehidden\nnext',status:'pending'},
    {id:'b',kind:'command',text:'npm test',status:'uncertain'},
  ];
  const lines=queueEditorLines({entries,selected:1,paused:true,editing:false,draft:''});
  const rendered=lines.join('\n');
  assert.match(rendered,/Queue · RESTORED · paused/u);assert.match(rendered,/1\./u);assert.match(rendered,/2\./u);assert.match(rendered,/uncertain/u);
  assert.equal(rendered.includes('\u001b'),false);assert.equal(rendered.includes('\u202e'),false);assert.match(rendered,/\\u001b/u);assert.match(rendered,/\\u202e/u);
  assert.match(rendered,/e edit/u);assert.match(rendered,/Shift\+Up\/Down move/u);assert.match(rendered,/d delete/u);assert.match(rendered,/c clear/u);assert.match(rendered,/r resume/u);
  assert.equal(queueEditorSelected(entries,99)?.id,'b');
});

test('M3-D app wires queue editor mutations without adding queue/steer ambiguity',async()=>{
  const source=await readFile(new URL('../../src/tui/app.ts',import.meta.url),'utf8');
  /* R1 (Q-R1-3): app.ts renders overlays through lane O's fitted builders (overlays/scroll-window.ts); the *Lines functions stay for their own tests. */
  assert.match(source,/queueEditorOverlay/u);assert.match(source,/editQueue/u);assert.match(source,/moveQueue/u);assert.match(source,/deleteQueue/u);assert.match(source,/clearQueue/u);assert.match(source,/dispatchQueue/u);
  assert.doesNotMatch(source,/steerQueue|queueSteer/u);
});
