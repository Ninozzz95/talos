/*
 * Stage 7.11e (owner 03/10 «registro d'uso locale»): a turn's line is what the session's total grew by between run.started and
 * its end; the file holds numbers only, in the profile; it stays under its cap; the Settings sheet reads this session's last
 * turns, today in this project and today's share by model.
 */
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync,writeFileSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import test,{after} from 'node:test';
import {createUsageRecorder,createUsageRecordWriter,readUsageRecord,usageRecordFile,USAGE_RECORD_MAX_BYTES} from '../../src/sessions/usage-record.ts';

const root=mkdtempSync(join(tmpdir(),'talos-usage-record-'));after(()=>rmSync(root,{recursive:true,force:true}));

test('a turn is the growth of the session total; nothing of the conversation is written; a turn with no tokens is not a line',()=>{
  const rows:any[]=[];let id:string|null='s1';
  const recorder=createUsageRecorder({write:row=>rows.push(row),model:()=>'openrouter:qwen3-coder',session:()=>id,now:()=>new Date('2026-10-03T10:00:00Z')});
  /* the cost the provider declared for the session, as /usage reads it: 0.01 at the start, 0.03 at the end */
  recorder.observe({type:'usage.updated',value:{promptTokens:1000,completionTokens:100,cachedTokens:500,declaredCostUsd:0.01}});
  recorder.observe({type:'run.started'});
  recorder.observe({type:'usage.updated',value:{promptTokens:3500,completionTokens:400,cachedTokens:1500,declaredCostUsd:0.03}});
  recorder.observe({type:'run.completed'});
  assert.equal(rows.length,1);assert.equal(rows[0].usd.toFixed(4),'0.0200','the turn\'s cost is the growth too');
  assert.deepEqual({...rows[0],usd:null},{at:'2026-10-03T10:00:00.000Z',session:'s1',model:'openrouter:qwen3-coder',in:2500,out:300,cached:1000,usd:null});
  recorder.observe({type:'run.started'});recorder.observe({type:'run.failed'});
  assert.equal(rows.length,1,'no growth, no line');
  recorder.observe({type:'run.completed'});assert.equal(rows.length,1,'an end without its start is not a turn');
  id=null;recorder.observe({type:'run.started'});recorder.observe({type:'run.completed'});assert.equal(rows.length,1);
  assert.doesNotMatch(JSON.stringify(rows),/prompt|text|content/u);
});

test('the Usage facts: this session\'s last turns, today in this project, today\'s share by model',async()=>{
  const file=usageRecordFile(join(root,'data'),join(root,'project'));
  mkdirSync(dirname(file),{recursive:true});
  const line=(at:string,session:string,model:string,inT:number,out:number,usd:number|null)=>JSON.stringify({at,session,model,in:inT,out,cached:0,usd});
  writeFileSync(file,[line('2026-10-02T10:00:00Z','s0','openrouter:qwen3-coder',5000,500,0.01),line('2026-10-03T09:00:00Z','s1','openrouter:qwen3-coder',90_000,2_000,0.10),
    'not json',line('2026-10-03T09:30:00Z','s1','openrouter:glm-5.3-flash',7_000,1_000,null),line('2026-10-03T10:00:00Z','s2','openrouter:qwen3-coder',100_000,14_000,0.09)].join('\n')+'\n');
  const facts=await readUsageRecord(file,{session:'s1',now:new Date('2026-10-03T12:00:00')});
  assert.deepEqual(facts!.perTurn,[92_000,8_000]);
  assert.equal(facts!.today!.tokens,214_000);assert.equal(facts!.today!.usd!.toFixed(2),'0.19');
  assert.deepEqual(facts!.byModel.map(row=>[row.model,Math.round(row.share*100)]),[['qwen3-coder',96],['glm-5.3-flash',4]]);
  assert.equal(await readUsageRecord(join(root,'missing.jsonl'),{session:'s1'}),null);
});

test('the writer appends in order and keeps the file under its cap with the last 60 days',async()=>{
  const file=join(root,'cap','u.jsonl');const now=new Date('2026-10-03T00:00:00Z');
  const writer=createUsageRecordWriter(file,{now:()=>now});
  const old={at:'2026-06-01T00:00:00Z',session:'s',model:'m',in:1,out:1,cached:0,usd:null};
  const recent={at:'2026-10-02T00:00:00Z',session:'s',model:'m',in:2,out:2,cached:0,usd:null};
  /* a file already at its cap with lines older than 60 days; the next turn trims it */
  mkdirSync(dirname(file),{recursive:true});
  const oldLine=JSON.stringify({...old,session:'x'.repeat(200)})+'\n';
  writeFileSync(file,oldLine.repeat(Math.ceil(USAGE_RECORD_MAX_BYTES/oldLine.length)));
  await writer.append(recent);await writer.flush();
  const kept=readFileSync(file,'utf8').trim().split('\n').map(line=>JSON.parse(line));
  assert.ok(kept.length>=1&&kept.every(row=>row.at===recent.at),'only the last 60 days stay once past the cap');
});
