import assert from 'node:assert/strict';
import test from 'node:test';
import {reduceRunResult,renderJson,renderStreamJson,exitCodeForResult} from '../../src/headless/result.ts';import {exitCodeForError} from '../../src/errors.ts';
const ev=(seq:number,type:string,data:Record<string,unknown>)=>({schema:'talos.cli.event.v1',seq,ts:'2026-01-01T00:00:00Z',sessionId:'s',type,data} as never);
test('final reducer joins message deltas and changed files',()=>{const r=reduceRunResult([ev(1,'message.delta',{messageId:'m',delta:'hel'}),ev(2,'message.delta',{messageId:'m',delta:'lo'}),ev(3,'file.changed',{path:'a.ts'}),ev(4,'run.completed',{})]);assert.equal(r.ok,true);assert.equal(r.result?.text,'hello');assert.deepEqual(r.result?.changedFiles,['a.ts']);assert.equal(exitCodeForResult(r),0);});
test('json emits exactly one document with newline',()=>{const text=renderJson({schema:'talos.cli.result.v1',ok:true,sessionId:'s',result:{text:'OK',outcome:'success',changedFiles:[],usage:null},warnings:[]});assert.equal(text.split('\n').filter(Boolean).length,1);assert.equal(JSON.parse(text).schema,'talos.cli.result.v1');});
test('stream json is one valid object per line',()=>{const text=renderStreamJson([ev(1,'run.started',{}),ev(2,'run.completed',{})]);assert.equal(text.trim().split('\n').map(JSON.parse).length,2);});
test('public exit codes are stable',()=>{const failed=(code:string)=>({schema:'talos.cli.result.v1',ok:false,sessionId:null,error:{code,message:'x',details:{}},warnings:[]} as const);assert.equal(exitCodeForResult(failed('PERMISSION_REQUIRED') as never),10);assert.equal(exitCodeForResult(failed('PROVIDER_AUTH') as never),11);assert.equal(exitCodeForResult(failed('CANCELLED') as never),130);assert.equal(exitCodeForResult(failed('INTERNAL_ERROR') as never),70);});

test('incremental accumulator produces the same result without retaining the event log',async()=>{
  const {createRunResultAccumulator}=await import('../../src/headless/result.ts');
  const acc=createRunResultAccumulator();
  acc.add(ev(1,'message.delta',{delta:'a'}));
  acc.add(ev(2,'file.changed',{path:'x.ts'}));
  acc.add(ev(3,'message.delta',{delta:'b'}));
  acc.add(ev(4,'run.completed',{}));
  assert.deepEqual(acc.result(),reduceRunResult([ev(1,'message.delta',{delta:'a'}),ev(2,'file.changed',{path:'x.ts'}),ev(3,'message.delta',{delta:'b'}),ev(4,'run.completed',{})]));
});


test('in-run failures carry a hidden canonical envelope while v1 JSON stays enumerable-compatible',()=>{
  const r=reduceRunResult([ev(1,'run.failed',{code:'PROVIDER_UNREACHABLE',message:'offline'})]);
  const failure=(r as any).failure;
  assert.ok(failure,'failed RunResult must carry internal failure state');
  assert.equal(Object.keys(r as any).includes('failure'),false,'internal failure state must not change v1 JSON bytes');
  assert.equal(failure.envelope.code,'PROVIDER_UNREACHABLE');
  assert.equal(failure.envelope.component,'runtime');
  assert.equal(failure.envelope.retryable,false);
  assert.ok(String(failure.envelope.traceId).length>0);
  assert.equal(failure.message,'offline');
  assert.equal(exitCodeForResult(r),exitCodeForError({code:failure.envelope.code}));
});

test('a turn the kernel reopens keeps its two answers apart in the result; one message stays as it was',async()=>{
  const {createRunResultAccumulator}=await import('../../src/headless/result.ts');
  const delta=(messageId:string,text:string)=>({schema:'talos.cli.event.v1',seq:1,ts:'',sessionId:'s',type:'message.delta',data:{messageId,delta:text}}) as any;
  const reopened=createRunResultAccumulator();
  for(const event of [delta('m1','The tests still fail.'),delta('m2','All done.')])reopened.add(event);
  assert.equal((reopened.result() as any).result.text,'The tests still fail.\n\nAll done.');
  const one=createRunResultAccumulator();
  for(const event of [delta('m1','Hello '),delta('m1','world')])one.add(event);
  assert.equal((one.result() as any).result.text,'Hello world');
});
