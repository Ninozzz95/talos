import assert from 'node:assert/strict';
import test from 'node:test';
import {rendererForTool,renderTool,type ToolRowModel} from '../../src/tui/tools/registry.ts';

const row=(name:string,argsText:string,output=''):ToolRowModel=>({id:'t1',name,status:'completed',argsText,liveOutput:'',finalOutput:output,startedAt:0,endedAt:10});

/* R2 lane T (gate E3, Q-R2-3): renderers are looked up by the KERNEL name through tool-display.ts, and a title shows the
   English label and the primary argument ("Read file  src/a.ts"). The old keys `Read`/`Bash`… were no kernel tool's
   name, so these fixtures now use the names and argument keys the kernel really sends (talosHarness.mjs:1571-2806). */
test('built-in tool names select dedicated renderers and unknown tools use fallback',()=>{
  assert.equal(rendererForTool('leggi').kind,'read');
  assert.equal(rendererForTool('shell').kind,'bash');
  assert.equal(rendererForTool('mystery').kind,'generic');
});

test('bash compact renderer bounds output at narrow and normal widths',()=>{
  const r:ToolRowModel={id:'t1',name:'shell',status:'running',argsText:'{"comando":"npm test"}',liveOutput:'x'.repeat(20000),finalOutput:'',startedAt:0,endedAt:null};
  for(const width of [50,100])assert.ok(renderTool(r,width,false).detailLines.join('\n').length<5000);
});

test('dedicated renderers expose deterministic compact summaries at narrow and normal widths',()=>{
  const fixtures=[
    ['leggi',row('leggi','{"percorso":"src/a.ts","offset":10,"limit":20}','')],
    ['scrivi',row('scrivi','{"percorso":"src/a.ts","contenuto":"one\\ntwo"}','')],
    ['file_edit',row('file_edit','{"percorso":"src/a.ts","old_string":"old\\nline","new_string":"new\\nline\\nplus"}','')],
    ['shell',row('shell','{"comando":"npm test"}','ok')],
    ['cerca',row('cerca','{"testo":"needle","path":"src"}','a.ts:1\nb.ts:2')],
    ['mystery',row('mystery','{"x":1}','done')],
  ] as const;
  for(const width of [50,100]){
    const rendered=fixtures.map(([name,r])=>[name,renderTool(r,width,false).title,renderTool(r,width,false).statusLabel,renderTool(r,width,false).detailLines.join(' | ')]);
    /* R3 Q-R3-1/Q-R3-4 (owner 2026-09-24): label and target one space apart; the summary moves onto the row after the
       title (`statusLabel` is the row's facts, never the enum, gate E2); a command with no exit code reported says `done`;
       the edit count is the real line diff (jsdiff, gate E10), written `+a −r`. */
    assert.deepEqual(rendered,[
      ['leggi','Read file src/a.ts','lines 10–29',''],
      ['scrivi','Write file src/a.ts','2 lines',''],
      ['file_edit','Edit file src/a.ts','+2 −1',''],
      ['shell','Shell npm test','done','ok'],
      ['cerca','Search files needle','2 results','path: src | a.ts:1 | b.ts:2'],
      // Review D-07: an unknown tool's arguments are labelled lines, never `args {"x":1}`.
      ['mystery','Mystery','done','x: 1 | done'],
    ]);
  }
});

/* R3 Q-R3-4 / gate E10: the count is on the row and the expanded view (Ctrl+O) is the real diff drawn by components/diff.ts
   (a fragment has no file line numbers to claim, so none are printed). */
test('expanded edit exposes bounded diff detail',()=>{
  const r=row('file_edit','{"percorso":"x.ts","old_string":"a\\nb","new_string":"a\\nc\\nd"}','');
  const result=renderTool(r,80,true);assert.equal(result.statusLabel,'+2 −1');assert.match(result.detailLines.join('\n'),/│ -b$/mu);assert.match(result.detailLines.join('\n'),/│ \+c$/mu);
});

test('tool row component model delegates to registry without owning input',async()=>{
  const {toolRowView}=await import('../../src/tui/components/tool-row.ts');
  const r=row('shell','{"comando":"echo ok"}','ok');
  assert.deepEqual(toolRowView(r,60,false),renderTool(r,60,false));
});
