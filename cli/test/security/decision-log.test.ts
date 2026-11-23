/*
 * Stage 7.21 (mockup permissions «Recent»; owner 03/10: the last 50 decisions of this project, kept after the session): the
 * log, and the approval coordinator that feeds it — a request the engine blocked, an answer the person gave.
 */
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {createDecisionLog,DECISIONS_KEPT} from '../../src/security/decision-log.ts';
import {createPermissionEngine} from '../../src/security/permission-engine.ts';
import {createApprovalCoordinator} from '../../src/tui/approval.ts';

const ROOT=process.platform==='win32'?'C:\\work\\shop':'/work/shop';

test('newest first, at most 50, writes waiting for each other',async()=>{
  const file=join(await mkdtemp(join(tmpdir(),'talos-decisions-')),'p','decisions.json');const log=createDecisionLog(file);
  assert.deepEqual(await log.list(),[]);
  await Promise.all(Array.from({length:DECISIONS_KEPT+5},(_,i)=>log.append({at:String(i),action:{tool:'Bash',command:`echo ${i}`},outcome:'blocked'})));
  const rows=await log.list();
  assert.equal(rows.length,DECISIONS_KEPT);
  assert.deepEqual(rows.slice(0,2).map(row=>row.at),['54','53'],'every concurrent write kept, newest first');
  assert.equal(JSON.parse(await readFile(file,'utf8')).length,DECISIONS_KEPT);
});

test('an unreadable log says so by name, and the next decision starts it again',async()=>{
  const file=join(await mkdtemp(join(tmpdir(),'talos-decisions-')),'decisions.json');await writeFile(file,'{not json');
  const log=createDecisionLog(file);
  await assert.rejects(log.list(),{code:'DECISION_LOG_INVALID'});
  await log.append({at:'1',action:{tool:'Read',resource:'a'},outcome:'denied'});
  assert.deepEqual((await log.list()).map(row=>row.outcome),['denied']);
});

test('the coordinator tells each block and each answer, with the action',async()=>{
  const heard:unknown[]=[];
  const engine=createPermissionEngine({projectRoot:ROOT,rules:{allow:[],ask:[],deny:['Bash(rm:*)']}});
  const coordinator=createApprovalCoordinator({engine,answer:async()=>{},interactive:true,mode:'default',onDecided:decision=>heard.push(decision)});
  await coordinator.request('s1','r1',{tool:'Bash',command:'rm -rf dist'});
  const asked=await coordinator.request('s1','r2',{tool:'Bash',command:'npm test'});assert.equal(asked.pending,true);
  assert.equal(heard.length,1,'a request still waiting is not a decision');
  await coordinator.resolve('r2','allow-once');
  assert.deepEqual(heard,[{action:{tool:'Bash',command:'rm -rf dist'},choice:'blocked',code:(heard[0] as any).code},{action:{tool:'Bash',command:'npm test'},choice:'allow-once'}]);
  assert.ok((heard[0] as any).code);
  /* a listener that throws never changes the answer */
  const loud=createApprovalCoordinator({engine,answer:async()=>{},interactive:true,mode:'default',onDecided:()=>{throw new Error('boom');}});
  assert.equal((await loud.request('s1','r3',{tool:'Bash',command:'rm x'})).allowed,false);
});
