import assert from 'node:assert/strict';
import test from 'node:test';
import {buildAgentTree} from '../../src/runtime/agent-tree.ts';
import {agentRosterRows} from '../../src/tui/agent-roster.ts';

function session(id:string,patch:Record<string,unknown>={}){
  return{id,sessionId:id,name:id,project:null,path:null,model:'m',parentId:null,depth:0,delegatedTask:null,forkedFrom:null,startedAt:null,updatedAt:null,endedAt:null,outcome:'running',interrupted:false,usage:null,approvalWait:null,collisions:[],delegationOutcome:null,delegationEvidence:null,...patch} as any;
}

test('M6-C roster projection preserves hierarchy and only real measured agent facts',()=>{
  const tree=buildAgentTree([
    session('main',{model:'model-main'}),
    session('worker',{parentId:'main',depth:1,name:null,delegatedTask:'write tests',model:'model-child',outcome:'failed',collisions:[{path:'x.ts',beforeSessionId:'s1',afterSessionId:null}],usage:{promptTokens:9,completionTokens:null,cachedTokens:null,turns:null,executions:1}}),
    session('nested',{parentId:'worker',depth:2,name:null,delegatedTask:'inspect failure',interrupted:true,outcome:'interrupted'}),
    session('fork',{forkedFrom:'main'}),
  ],'nested');
  assert.ok(tree);
  const rows=agentRosterRows(tree);
  assert.deepEqual(rows.map(row=>[row.id,row.level,row.role]),[['main',0,'main'],['worker',1,'subagent'],['nested',2,'subagent']]);
  assert.equal(rows[1]?.task,'write tests');assert.equal(rows[1]?.model,'model-child');assert.equal(rows[1]?.outcome,'failed');
  assert.equal(rows[1]?.collisionCount,1);assert.equal(rows[1]?.hasCollision,true);
  assert.deepEqual(rows[1]?.usage,{promptTokens:9,completionTokens:null,cachedTokens:null,turns:null,executions:1});
  assert.equal(rows[2]?.interrupted,true);
  assert.equal(rows.some(row=>row.id==='fork'),false);
});

/* 0.6.8 (owner 16/10/2026 L3-17): a sub-agent born with a name («-N» among sisters) is called by it; one from before keeps its task */
test('a sub-agent is called by its name, the main conversation by its task line',()=>{
  const rows=agentRosterRows(buildAgentTree([session('main'),
    session('a',{parentId:'main',depth:1,name:'write tests',delegatedTask:'write tests'}),
    session('b',{parentId:'main',depth:1,name:'write tests-2',delegatedTask:'write tests'}),
    session('c',{parentId:'main',depth:1,name:null,delegatedTask:'older task'})],'main'));
  assert.deepEqual(rows.map(row=>[row.id,row.task]),[['main',null],['a','write tests'],['b','write tests-2'],['c','older task']]);
});

test('M6-C empty tree yields no roster rows',()=>{assert.deepEqual(agentRosterRows(null),[]);});
