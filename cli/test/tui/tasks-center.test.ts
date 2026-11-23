import assert from 'node:assert/strict';
import test from 'node:test';
import {createTasksCenterModel,moveTasksCenterSelection,renderTasksCenterLines,selectedTask} from '../../src/tui/overlays/tasks-center.ts';

const row:any={
  id:'t\\1\u001b[2J',title:'Ship\u202E board\nnext',description:'Body\u0007text',status:'doing',priority:'high',writer:'persona',writerEvidence:'persisted',createdAt:null,updatedAt:null,
  dependencies:[{taskId:'t\\1\u001b[2J',targetTaskId:'t2',state:'available',label:'Verify',createdAt:'2026-09-21T12:00:00.000Z'}],
  evidence:[{taskId:'t\\1\u001b[2J',sessionId:'e-1',state:'available',measurement:{scritture:1,artefatti:1,toolCalls:2,toolCallsOk:2,toolCallsFalliti:0,verificabile:true},createdAt:'2026-09-21T12:00:00.000Z'}],
  agents:[{taskId:'t\\1\u001b[2J',sessionId:'a-1',state:'available',parentSessionId:'s-main',depth:1,task:'Implement',createdAt:'2026-09-21T12:00:00.000Z'}],
  schedules:[{taskId:'t\\1\u001b[2J',automationId:'auto-1',state:'available',executionTaskId:'catalog:nightly-check',name:'Nightly',intervalMinutes:60,dailyLimit:3,active:true,lastExecution:null,nextExecution:'2026-09-21T12:00:00.000Z',createdAt:'2026-09-21T12:00:00.000Z'}]
};
const snapshot:any={state:'ready',rows:[row],error:null,legacyRows:[]};

test('M9-C RED — Task Board renders status priority dependencies evidence agents and real schedule target',()=>{
  const text=renderTasksCenterLines(createTasksCenterModel(snapshot,0)).join('\n');
  for(const token of ['Task Board','doing','high','depends','t2','evidence','e-1','agent','a-1','schedule','auto-1','catalog:nightly-check'])assert.match(text,new RegExp(token,'iu'));
});

test('M9-C RED — Task Board neutralizes controls bidi line breaks and backslashes',()=>{
  const lines=renderTasksCenterLines(createTasksCenterModel(snapshot,0));const text=lines.join('\n');
  assert.equal(text.includes('\u001b'),false);assert.equal(text.includes('\u202e'),false);assert.equal(text.includes('\u0007'),false);
  assert.equal(lines.some(line=>line.includes('board\nnext')),false);
  assert.match(text,/\\u001b/u);assert.match(text,/\\u202e/u);assert.match(text,/\\u0007/u);assert.match(text,/\\\\/u);
});

test('M9-C RED — selection remains bounded and preserves authoritative task id',()=>{
  const second={...row,id:'t2',title:'Second',dependencies:[],evidence:[],agents:[],schedules:[]};
  let model=createTasksCenterModel({...snapshot,rows:[row,second]},0);
  model=moveTasksCenterSelection(model,1);assert.equal(selectedTask(model)?.id,'t2');
  model=moveTasksCenterSelection(model,99);assert.equal(model.selected,1);
  model=moveTasksCenterSelection(model,-99);assert.equal(model.selected,0);
});

test('M9-C RED — invalid board state is visible rather than guessed',()=>{
  const invalid:any={state:'invalid',rows:[],error:{code:'TASK_BOARD_INVALID',message:'broken edge'},legacyRows:[]};
  const text=renderTasksCenterLines(createTasksCenterModel(invalid,0)).join('\n');
  assert.match(text,/TASK_BOARD_INVALID/u);assert.match(text,/broken edge/u);
});
