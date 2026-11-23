import assert from 'node:assert/strict';
import test from 'node:test';
import {createHookCenterModel,moveHookCenterSelection,renderHookCenterLines,replaceHookCenterRow} from '../../src/tui/overlays/hook-center.ts';

const row:any={
  id:'audit\u001b[2J',events:['pre_tool_call'],launch:{command:'node audit.mjs'},
  trust:{projectTrusted:true,state:'changed',trusted:false,currentFingerprint:'current-123',trustedFingerprint:'trusted-456',changed:true},
  quarantine:{active:true,reason:'manual review',quarantinedAt:'2026-09-21T10:00:00.000Z',reviewedFingerprint:'current-123'},
  lastExecutions:[{sessionId:'s1',sessionStartedAt:'2026-09-21T09:00:00.000Z',sequence:7,eventType:'pre_tool_call',action:'write',result:{consentito:false,motivo:'blocked\nnext'},executedAt:null}],
  lastDryRun:null
};

test('M8-B RED — Hook Center renders trust diff quarantine dry-run warning and real history as inert text',()=>{
  const model=createHookCenterModel([row],0);
  const lines=renderHookCenterLines(model);const text=lines.join('\n');
  for(const token of ['Hooks','current-123','trusted-456','quarantined','manual review','Dry run','REAL hook process','Last executions','sequence 7'])assert.match(text,new RegExp(token,'u'));
  assert.equal(text.includes('\u001b'),false);
  assert.equal(lines.some(line=>line.includes('blocked\nnext')),false);
});

test('M8-B RED — Hook Center selection and measured dry-run replacement stay bounded',()=>{
  let model=createHookCenterModel([{...row,id:'a'},{...row,id:'b'}],0);
  model=moveHookCenterSelection(model,1);assert.equal(model.selected,1);
  model=moveHookCenterSelection(model,20);assert.equal(model.selected,1);
  model=replaceHookCenterRow(model,{...row,id:'b',lastDryRun:{realProcess:true,syntheticEvent:true,eventType:'pre_tool_call',result:{consentito:true}}});
  assert.equal(model.rows[1]?.lastDryRun?.realProcess,true);
});
