/*
 * Rule 17 measure (03/11/2026, built CLI): leaving TALOS (Ctrl+C Ctrl+C, or /exit «Stop them and exit») while a delegated agent
 * still worked left its request to the provider open, and the exit backstop had to end the process two seconds later
 * («held {"TTYWrap":2,"TCPSocketWrap":1}»). Isolated one task per launch: only the delegation did it; an answer, a command and
 * /config exited clean. The exit hint promises the agents are stopped (interrupt.ts `screen.exit.agentsStopped`): the runtime's
 * last close now stops every conversation still at work with its whole tree (the kernel's `fermaTutto`, which also keeps a
 * parent from waking on its stopped children) before it stops the background commands and closes the registry.
 * Hermes does the same at close: run_agent.py `close()` → `_close_active_children(soft=False)` (lines 938-985).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createSessionFacade} from '../../src/runtime/session-facade.ts';

type Row={sessionId:string;padreId:string|null;conclusa:boolean;interrotta?:boolean;discendentiAlLavoro?:number};
function registryWith(rows:Row[],{withTree=true,failing=false}:{withTree?:boolean;failing?:boolean}={}){
  const order:string[]=[];
  const registry:any={avviaLibero(){return{sessionId:'s'};},iscriviti(){return()=>{};},elenca(){return rows;},
    chiudi:async()=>{order.push('chiudi');return{scaduta:false};},chiudiContesto:async()=>{order.push('context');}};
  if(withTree)registry.fermaTutto=(id:string,options:unknown)=>{order.push(`fermaTutto ${id} ${JSON.stringify(options)}`);if(failing)throw new Error('stop failed');return{fermata:true,figlieFermate:1,ids:[]};};
  registry.ferma=(id:string,options:unknown)=>{order.push(`ferma ${id} ${JSON.stringify(options??{})}`);return true;};
  return{registry,order};
}
const ROWS:Row[]=[
  {sessionId:'chat',padreId:null,conclusa:true,discendentiAlLavoro:1},  // answered, one agent still at work
  {sessionId:'agent',padreId:'chat',conclusa:false},                     // the agent: stopped with its parent's tree, not alone
  {sessionId:'busy',padreId:null,conclusa:false},                        // a turn still running (a forced exit)
  {sessionId:'idle',padreId:null,conclusa:true},                         // nothing at work: untouched
  {sessionId:'old',padreId:null,conclusa:false,interrotta:true},         // rebuilt after a crash: nothing runs in this process
];

test('the last close stops every conversation still at work with its tree, before the registry closes',async()=>{
  const {registry,order}=registryWith(ROWS);
  await createSessionFacade(registry,{model:'m'}).close();
  assert.deepEqual(order,['fermaTutto chat {"daChi":"persona"}','fermaTutto busy {"daChi":"persona"}','chiudi','context']);
});

test('a replacement\'s close stops nothing: the conversation goes on',async()=>{
  const {registry,order}=registryWith(ROWS);
  await (createSessionFacade(registry,{model:'m'}) as any).close({replacing:true});
  assert.deepEqual(order,['context']);
});

test('a kernel without the tree stop stops each working conversation; a stop that throws still lets TALOS end',async()=>{
  const single=registryWith(ROWS,{withTree:false});
  await createSessionFacade(single.registry,{model:'m'}).close();
  assert.deepEqual(single.order,['ferma agent {"daChi":"persona"}','ferma busy {"daChi":"persona"}','chiudi','context']);
  const failing=registryWith(ROWS,{failing:true});
  await createSessionFacade(failing.registry,{model:'m'}).close();
  assert.deepEqual(failing.order.slice(-2),['chiudi','context']);
});
