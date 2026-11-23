import assert from 'node:assert/strict';
import test from 'node:test';
import {createSessionFacade} from '../../src/runtime/session-facade.ts';

function fixture(){
  const starts:any[]=[];const updates:any[]=[];let resumes=0;
  const registry:any={
    ripristina:async()=>({ripristinate:0,totali:0}),
    avviaLibero:(input:any)=>{starts.push(input);return{sessionId:'s1'};},
    resume:()=>{resumes++;return{sessionId:'s1'};},
    aggiornaImpostazioni:(id:string,patch:any)=>{updates.push({id,patch});return{ok:true};},
    iscriviti:()=>()=>{},rispondiApprovazione:()=>({ok:true}),ferma:()=>true,
    esporta:(id:string)=>({sessionId:id,eventi:[]}),elenca:()=>[{sessionId:'s1'}],
  };
  return{starts,updates,get resumes(){return resumes;},runtime:createSessionFacade(registry,{model:'openai:gpt'})};
}

test('M4-D RED — launch default reaches registry start and an explicit start value wins',async()=>{
  const f=fixture();
  f.runtime.setDefaultReasoningEffort('high');
  await f.runtime.start({projectRoot:'/repo',prompt:'one',model:'openai:gpt',permissionMode:'default'});
  await f.runtime.start({projectRoot:'/repo',prompt:'two',model:'openai:gpt',permissionMode:'default',reasoningEffort:'low'} as any);
  assert.deepEqual(f.starts[0]?.reasoning,{effort:'high'});
  assert.deepEqual(f.starts[1]?.reasoning,{effort:'low'});
});

test('M4-D RED — live effort update maps only to aggiornaImpostazioni and creates no run',async()=>{
  const f=fixture();
  await f.runtime.setReasoningEffort('s1','xhigh');
  assert.deepEqual(f.updates,[{id:'s1',patch:{reasoning:{effort:'xhigh'}}}]);
  assert.equal(f.starts.length,0);
  assert.equal(f.resumes,0);
});

test('M4-D RED — model default omits reasoning instead of manufacturing an effort',async()=>{
  const f=fixture();
  f.runtime.setDefaultReasoningEffort(null);
  await f.runtime.start({projectRoot:'/repo',prompt:'one',model:'openai:gpt',permissionMode:'default'});
  assert.equal(Object.hasOwn(f.starts[0]??{},'reasoning'),false);
});
