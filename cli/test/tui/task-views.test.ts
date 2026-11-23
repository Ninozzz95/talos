/*
 * Stage 7.19 (mockup tasks «today · in progress · agent working · Sep 27 · open»; owner 03/10: the board's detail beside the
 * list): the task board's rows as the /tasks sheet shows them.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {taskViews} from '../../src/tui/task-views.ts';
import {panelDay} from '../../src/tui/panel/when.ts';
import type {TaskBoardRow} from '../../src/services/task-board-facade.ts';

const NOW=Date.parse('2026-10-01T15:00:00Z');
const row=(over:Partial<TaskBoardRow>):TaskBoardRow=>({id:'t',title:'T',description:null,status:'todo',priority:'normal',writer:'persona',writerEvidence:'persisted',createdAt:null,updatedAt:null,dependencies:[],evidence:[],agents:[],schedules:[],...over});

test('the mockup\'s right column: today or the date for done, in progress, agent working, open',()=>{
  const views=taskViews([
    row({id:'a',title:'Done today',status:'done',updatedAt:'2026-10-01T09:00:00Z'}),
    row({id:'b',title:'Doing',status:'doing'}),
    row({id:'c',title:'Delegated',agents:[{taskId:'c',sessionId:'s9',state:'available',parentSessionId:'s1',depth:1,task:'Write the checkout tests',outcome:'running',createdAt:''}]}),
    row({id:'d',title:'Done before',status:'done',updatedAt:'2026-09-27T09:00:00Z'}),
    row({id:'e',title:'Open'}),
    /* an agent that has finished is no longer working on it */
    row({id:'f',title:'Agent done',agents:[{taskId:'f',sessionId:'s8',state:'available',parentSessionId:'s1',depth:1,task:'x',outcome:'completed',createdAt:''}]}),
  ],{now:NOW,offsetMinutes:0});
  assert.deepEqual(views.map(v=>[v.title,v.done,v.meta]),[['Done today',true,'today'],['Doing',false,'in progress'],['Delegated',false,'agent working'],['Done before',true,'Sep 27'],['Open',false,'open'],['Agent done',false,'open']]);
  assert.equal(panelDay('2026-10-01T00:30:00Z',{now:NOW,offsetMinutes:0}),'today');
  assert.equal(panelDay(null,{now:NOW,offsetMinutes:0}),'');
});

test('the detail: state and priority, description, and each link in words',()=>{
  const [view]=taskViews([row({id:'a',title:'Fix',status:'doing',priority:'high',description:'The cookie.',
    dependencies:[{taskId:'a',targetTaskId:'b',state:'available',label:'Other task',createdAt:''},{taskId:'a',targetTaskId:'zz',state:'dangling',label:'Stale name',createdAt:''}],
    evidence:[{taskId:'a',sessionId:'7f3a2c9d',state:'available',measurement:{scritture:4,artefatti:0,toolCalls:9,toolCallsOk:9,toolCallsFalliti:0,verificabile:true},createdAt:''}],
    agents:[{taskId:'a',sessionId:'s9',state:'available',parentSessionId:'s1',depth:1,task:'Write tests',outcome:'completed',createdAt:''}],
    schedules:[{taskId:'a',automationId:'au1',state:'available',executionTaskId:null,name:'Nightly',intervalMinutes:1440,dailyLimit:null,active:true,lastExecution:null,nextExecution:null,createdAt:''} as any]})],{now:NOW,offsetMinutes:0});
  assert.deepEqual(view!.detail,{description:'The cookie.',status:'in progress',priority:'high',
    depends:['Other task','zz (no longer there)'],evidence:['session 7f3a2c · 4 writes · 9 tool calls'],agents:['Write tests · completed'],schedules:['Nightly · every 1440 min']});
});
