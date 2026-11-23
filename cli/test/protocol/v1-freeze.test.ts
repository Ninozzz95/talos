import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {renderJson,renderStreamJson,type RunResult} from '../../src/headless/result.ts';
import type {CliEvent} from '../../src/events/bridge.ts';

const FIXTURES={
  'event-cancelled.jsonl':{bytes:174,sha256:'a42fbe272793112d7e957df332f8305db4d164451f44d8ce9717ec3e56be0404'},
  'event-completed.jsonl':{bytes:152,sha256:'53f884e526531e72305b9814268c127e5d6a2f1f13e635652495e3b1b202a170'},
  'event-failed.jsonl':{bytes:175,sha256:'4f39b17f0994a1c7847f5ab9b18a4a93052844f476b2e2144ce4e1c8f4bf8d0e'},
  'event-tool.jsonl':{bytes:184,sha256:'235f2fbdb3e5d2ca64bc9e7120e0864a97c7c78e7da21334f7e2cbeeed13908e'},
  'result-cancelled.json':{bytes:202,sha256:'0e80b91f209886437bc08903c38a4692c70a4e72a69ecff1047d4b2ae77c0606'},
  'result-error.json':{bytes:204,sha256:'a16a688ae2a79f81f3c63b843524c370bb1af1be8c09c92e5cc7e385dc179c29'},
  'result-success.json':{bytes:201,sha256:'a63eb1794147cc8378be0a51c1c4bfb025149f53ad39634ecf3aaf2ee922ba91'},
} as const;

async function fixture(name:keyof typeof FIXTURES){return readFile(new URL('../fixtures/protocol/v1/'+name,import.meta.url));}

test('M7-A freezes every existing v1 golden byte by size and sha256',async()=>{
  for(const [name,expected] of Object.entries(FIXTURES) as Array<[keyof typeof FIXTURES,(typeof FIXTURES)[keyof typeof FIXTURES]]>){
    const raw=await fixture(name);
    assert.equal(raw.byteLength,expected.bytes,name+' byte length changed');
    assert.equal(createHash('sha256').update(raw).digest('hex'),expected.sha256,name+' bytes changed');
    assert.equal(raw.at(-1),0x0a,name+' must retain the final newline');
  }
});

test('M7-A keeps the public v1 schema tags immutable',async()=>{
  for(const name of Object.keys(FIXTURES) as Array<keyof typeof FIXTURES>){
    const parsed=JSON.parse((await fixture(name)).toString('utf8').trim());
    assert.equal(parsed.schema,name.startsWith('event-')?'talos.cli.event.v1':'talos.cli.result.v1',name);
  }
});

test('v1 event renderer remains byte-identical to the existing completed golden',async()=>{
  const event:CliEvent={
    schema:'talos.cli.event.v1',seq:1,ts:'2026-09-16T10:00:00.000Z',sessionId:'session-1',
    type:'run.completed',data:{result:{detto:'ok'}},
  };
  assert.deepEqual(Buffer.from(renderStreamJson([event]),'utf8'),await fixture('event-completed.jsonl'));
});

test('v1 result renderer remains byte-identical to the existing success golden',async()=>{
  const result:RunResult={
    schema:'talos.cli.result.v1',ok:true,sessionId:'session-1',
    result:{text:'OK',outcome:'success',changedFiles:['src/example.ts'],usage:{inputTokens:3,outputTokens:1}},
    warnings:[],
  };
  assert.deepEqual(Buffer.from(renderJson(result),'utf8'),await fixture('result-success.json'));
});
