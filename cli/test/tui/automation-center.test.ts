import test from 'node:test';
import assert from 'node:assert/strict';
import {createAutomationCenterModel,renderAutomationCenterLines,setAutomationCenterDetail} from '../../src/tui/overlays/automation-center.ts';

/* 0.6.6: the kernel's v2 automations — the schedule phrase, timezone, next run, folder, mode, instructions and the history of
   runs — as bounded inert text; an old-format entry says it cannot run. */
const row=(over:any={})=>({id:'a1',name:'Bad\x1b[2J',active:true,legacy:false,schedule:'weekdays 09:00',timezone:'Europe/Rome',nextRunAt:'2026-10-16T07:00:00.000Z',folder:'C:/p',mode:'acceptEdits',model:null,instructions:'check the build\u202e',runsLeft:null,running:false,lastRunAt:null,...over});

test('the Automation Center renders the schedule, next run, folder, mode, instructions and runs as bounded inert text',()=>{
  const snapshot:any={state:'ready',rows:[row()],error:null};
  const detail:any={...row(),adapterHealth:{state:'healthy'},runs:[{runId:'r1',partitaAlle:'2026-10-15T07:00:00.000Z',esito:'fallita',motivo:'dichiarato',sessionId:'s-1'},
    {runId:'r2',saltataAlle:'2026-10-15T06:30:00.000Z',esito:'saltata',motivo:'PROJECT_TRUST_REQUIRED',dettaglio:'The folder C:/p is not trusted.'}]};
  const text=renderAutomationCenterLines(setAutomationCenterDetail(createAutomationCenterModel(snapshot,0),detail)).join('\n');
  /* the second review of 0.6.6 (N4): the runs in words, the skipped one with its time and detail, the mode with its label */
  for(const token of ['weekdays 09:00','Europe/Rome','next 2026-10-16','Folder: C:/p','mode Accept edits \\(acceptEdits\\)','model default','Instructions: check the build','failed · the run said it failed','s-1','healthy','2026-10-15T06:30:00.000Z · skipped','The folder C:/p is not trusted','healthy'])assert.match(text,new RegExp(token,'iu'),token);
  assert.doesNotMatch(text,/fallita|saltata|dichiarato|PROJECT_TRUST_REQUIRED|\? · /u,'never the store\'s own words, a bare code or an unknown time');
  assert.doesNotMatch(text,/\x1b\[/u);assert.doesNotMatch(text,/\u202e/u);assert.ok(Math.max(...text.split('\n').map(x=>x.length))<=800);
  assert.doesNotMatch(text,/taskId|dry-run|backoff|missed/iu,'nothing of the old format\'s policy is left');
});

test('an old-format automation is shown as one that cannot run',()=>{
  const legacy=row({legacy:true,schedule:'old format (task t, every 5m)',folder:null,mode:null,instructions:null,timezone:null});
  const text=renderAutomationCenterLines(setAutomationCenterDetail(createAutomationCenterModel({state:'ready',rows:[legacy],error:null} as any,0),{...legacy,adapterHealth:{state:'healthy'},runs:[]})).join('\n');
  assert.match(text,/old format · /u);assert.match(text,/cannot run; delete it and make it again with instructions/u);
  assert.doesNotMatch(text,/Folder:|Instructions:/u);
});

test('every rendered Automation Center line stays bounded even with hostile long values',()=>{
  const long=row({name:'n'.repeat(5000),instructions:'i'.repeat(5000),folder:'f'.repeat(5000)});
  const detail:any={...long,adapterHealth:{state:'healthy'},runs:[{partitaAlle:'x'.repeat(5000),esito:'fallita',motivo:'m'.repeat(5000),sessionId:'s'.repeat(5000)}]};
  const lines=renderAutomationCenterLines(setAutomationCenterDetail(createAutomationCenterModel({state:'ready',rows:[long],error:null} as any,0),detail));
  assert.ok(Math.max(...lines.map((line:string)=>line.length))<=800);
  assert.ok(lines.some((line:string)=>line.includes('…')));
});
