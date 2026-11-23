import assert from 'node:assert/strict';
import test from 'node:test';
import {buildAgentTree} from '../../src/runtime/agent-tree.ts';

function session(id:string,patch:Record<string,unknown>={}){
  return{
    id,sessionId:id,name:id,project:null,path:null,model:'openai:gpt-5-mini',
    parentId:null,depth:0,delegatedTask:null,forkedFrom:null,
    startedAt:'2026-09-20T10:00:00.000Z',updatedAt:'2026-09-20T10:00:00.000Z',endedAt:null,
    outcome:'running',interrupted:false,usage:null,approvalWait:null,collisions:[],
    delegationOutcome:null,delegationEvidence:null,...patch,
  } as any;
}

function ids(node:any):string[]{return[node.id,...node.children.flatMap(ids)];}

test('M6-C agent tree uses only native parent/depth edges and keeps fork lineage separate',()=>{
  const rows=[
    session('root'),
    session('fork',{forkedFrom:'root'}),
    session('child-a',{parentId:'root',depth:1,delegatedTask:'inspect auth',outcome:'completed',usage:{promptTokens:12,completionTokens:3,cachedTokens:null,turns:1,executions:1},collisions:[{path:'src/a.ts',beforeSessionId:null,afterSessionId:'child-b'}]}),
    session('child-b',{parentId:'root',depth:1,delegatedTask:'inspect tests'}),
    session('grand',{parentId:'child-a',depth:2,delegatedTask:'verify edge'}),
    session('bad-depth',{parentId:'root',depth:2,delegatedTask:'must not be repaired'}),
  ];
  const tree=buildAgentTree(rows,'grand');
  assert.ok(tree);assert.equal(tree.focusId,'grand');assert.equal(tree.root.id,'root');
  assert.deepEqual(tree.root.children.map((row:any)=>row.id),['child-a','child-b']);
  assert.deepEqual(tree.root.children[0]?.children.map((row:any)=>row.id),['grand']);
  assert.deepEqual(ids(tree.root),['root','child-a','grand','child-b']);
  assert.equal(ids(tree.root).includes('fork'),false,'fork origin never creates a delegation edge');
  assert.equal(ids(tree.root).includes('bad-depth'),false,'contradictory native depth is not repaired heuristically');
  const child=tree.root.children[0]!;
  assert.equal(child.task,'inspect auth');assert.equal(child.outcome,'completed');assert.equal(child.interrupted,false);
  assert.deepEqual(child.usage,{promptTokens:12,completionTokens:3,cachedTokens:null,turns:1,executions:1});
  assert.equal(child.collisions.length,1);assert.equal('budget' in child,false,'no per-agent budget is invented when the runtime does not measure one');
});

test('M6-C missing native parent leaves the focused session as its own root',()=>{
  const tree=buildAgentTree([session('orphan',{parentId:'missing',depth:1,delegatedTask:'real task'})],'orphan');
  assert.ok(tree);assert.equal(tree.root.id,'orphan');assert.deepEqual(tree.root.children,[]);
});

test('M6-C duplicate session ids fail closed instead of choosing an arbitrary agent',()=>{
  assert.throws(()=>buildAgentTree([session('same'),session('same',{parentId:'p',depth:1})],'same'),(error:any)=>error?.code==='AGENT_TREE_INVALID');
});

test('M6-C missing focus returns null and never fabricates a main agent',()=>{
  assert.equal(buildAgentTree([session('root')],'missing'),null);
});
