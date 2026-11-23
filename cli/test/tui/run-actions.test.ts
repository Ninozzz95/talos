import assert from 'node:assert/strict';
import test from 'node:test';
import {runControllerSlashAction,slashCommandToCliArgs,togglePlanMode} from '../../src/tui/app.ts';

test('/compact invokes the attached session compactor and returns a user-facing result',async()=>{
  const calls:string[]=[];
  const text=await runControllerSlashAction('compact',{compact:async()=>{calls.push('compact');return{ok:true,compattato:true};}} as any);
  assert.deepEqual(calls,['compact']);
  assert.equal(text,'Context compacted.');
});

test('/plan toggles into plan and returns to the original permission mode',()=>{
  assert.equal(togglePlanMode('default','default'),'plan');
  assert.equal(togglePlanMode('plan','default'),'default');
  assert.equal(togglePlanMode('acceptEdits','acceptEdits'),'plan');
  assert.equal(togglePlanMode('plan','acceptEdits'),'acceptEdits');
});

test('service slash commands map to real CLI subcommands without shell interpolation',()=>{
  assert.deepEqual(slashCommandToCliArgs('mcp',[]),['mcp','list']);
  assert.deepEqual(slashCommandToCliArgs('hooks',['trust','h1']),['hook','trust','h1']);
  assert.deepEqual(slashCommandToCliArgs('plugins',['list']),['plugin','list']);
  assert.deepEqual(slashCommandToCliArgs('automations',['list']),['automation','list']);
  assert.deepEqual(slashCommandToCliArgs('doctor',[]),['doctor']);
  assert.deepEqual(slashCommandToCliArgs('memory',[]),['memory','list']);
  assert.equal(slashCommandToCliArgs('plan',[]),null);
});
