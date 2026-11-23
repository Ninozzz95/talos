/*
 * Stage 7.13 (/clear «Start a new conversation»; Claude Code /clear keeps the old conversation in /resume): the controller
 * lets go of the session so the next message starts a new one, and refuses while a turn runs, so nothing is dropped.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createTuiSessionController} from '../../src/tui/session-controller.ts';

function fakeRuntime(){
  const sinks=new Map<string,Set<(event:any)=>void>>();const starts:string[]=[];const resumes:string[]=[];
  const r:any={
    restore:async()=>({restored:0,total:0}),listSessions:async()=>[],export:()=>({eventi:[]}),
    start:async({prompt}:{prompt:string})=>{starts.push(prompt);return`s${starts.length}`;},resume:async(id:string)=>{resumes.push(id);return id;},
    subscribe(id:string,sink:(event:any)=>void){const set=sinks.get(id)??new Set();set.add(sink);sinks.set(id,set);return()=>set.delete(sink);},
    answerApproval:async()=>{},cancel:async()=>{},close:async()=>{},
  };
  return{r,starts,resumes,listeners:(id:string)=>sinks.get(id)?.size??0};
}

test('startFresh: refused while a turn runs; otherwise the session is let go and the next message starts a new one',async()=>{
  const f=fakeRuntime();
  const c=createTuiSessionController({runtime:f.r,projectRoot:process.cwd(),model:'m',mode:'default',rules:{allow:[],ask:[],deny:[]},onEvent:()=>{}} as any);
  await c.send('first',{model:'m',running:false});
  assert.equal(c.current(),'s1');assert.equal(f.listeners('s1'),1);
  assert.throws(()=>c.startFresh({running:true}),(error:any)=>error.code==='SESSION_BUSY');
  assert.equal(c.current(),'s1','a refusal changes nothing');
  c.startFresh({running:false});
  assert.equal(c.current(),null);assert.equal(f.listeners('s1'),0,'the old session is no longer followed');
  await c.send('second',{model:'m',running:false});
  assert.deepEqual([f.starts,f.resumes],[['first','second'],[]]);
  assert.equal(c.current(),'s2');
});
