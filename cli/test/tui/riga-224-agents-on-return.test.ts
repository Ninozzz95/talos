/*
 * Riga 224 (T4, return; judge v2626): the footer counts the agents of the conversation on screen. Back on a conversation, its
 * descendants still at work (a child, a grandchild) are counted again from the kernel's list; another conversation's agents, a fork
 * of it and an agent that has ended are not. Mount: the real session controller over a fake runtime, no kernel, no network.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createTuiSessionController} from '../../src/tui/session-controller.ts';

const tick=(ms=0)=>new Promise(resolve=>setTimeout(resolve,ms));
const ROWS=[
  {sessionId:'A',parentId:null,depth:0,conclusa:true,ultimoEsito:'successo'},
  {sessionId:'k1',parentId:'A',depth:1,conclusa:false,delegatedTask:'Audit the dependencies'},
  {sessionId:'k2',parentId:'k1',depth:2,conclusa:false,delegatedTask:'Read the lockfile'},
  {sessionId:'k3',parentId:'A',depth:1,conclusa:true,ultimoEsito:'successo',delegatedTask:'Done already'},
  {sessionId:'C',parentId:null,depth:0,conclusa:true,ultimoEsito:'successo'},
  {sessionId:'c1',parentId:'C',depth:1,conclusa:false,delegatedTask:'Work of C'},
  {sessionId:'F',parentId:null,depth:0,conclusa:true,ultimoEsito:'successo',forkedFrom:'A'},
];

test('riga 224: back on a conversation its agents at work are counted again, and only its own',async()=>{
  const counted:{session:string|null;childId:string;task:string|null}[]=[];let open:string|null=null;
  const r:any={restore:async()=>({restored:0,total:0}),start:async()=>'A',resume:async(id:string)=>id,fork:async()=>'F',listSessions:async()=>ROWS,export:()=>({eventi:[]}),
    subscribe:(id:string)=>{open=id;return()=>{};},answerApproval:async()=>{},setPermissionMode:async()=>{},cancel:async()=>{},close:async()=>{}};
  const c=createTuiSessionController({runtime:r,projectRoot:process.cwd(),model:'m',mode:'default',rules:{allow:[],ask:[],deny:[]},
    onEvent:(event:any)=>{if(event.type==='agent.changed')counted.push({session:open,childId:event.childId,task:event.task});},onApproval:()=>{}} as any);
  const visit=async(go:()=>Promise<unknown>)=>{counted.length=0;await go();await tick(30);return counted.map(row=>`${row.session}:${row.childId}`).sort();};
  assert.deepEqual(await visit(()=>c.resumeSession('A')),['A:k1','A:k2'],'A: its child and grandchild at work, not the one that ended');
  assert.equal(counted.find(row=>row.childId==='k1')?.task,'Audit the dependencies');
  assert.deepEqual(await visit(()=>c.resumeSession('C')),['C:c1'],'C: its own agent only, none of A');
  assert.deepEqual(await visit(()=>c.forkSession('A')),[],'a fork of A starts with no agent of A');
  assert.deepEqual(await visit(()=>c.resumeSession('A')),['A:k1','A:k2'],'back on A, its agents again');
  /* the kernel's list answers late, after the person already moved on to C: A's agents are not counted in C */
  let open_list!:()=>void;const late=new Promise<void>(resolve=>{open_list=resolve;});r.listSessions=async()=>{await late;return ROWS;};
  counted.length=0;c.attach('A',0,true);c.attach('C',0,true);open_list();await tick(30);
  assert.deepEqual(counted.map(row=>`${row.session}:${row.childId}`).sort(),['C:c1'],'a late answer for A counted its agents in C');
  c.close();
});
