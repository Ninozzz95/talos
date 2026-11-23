/*
 * 0.6.13: `talos -p` in text says a compaction that did not happen on stderr, once, and leaves stdout to the answer — as it says
 * an MCP server that did not start (0.6.9, B1) and as Codex's human exec output prints every warning on stderr
 * (`codex-rs/exec/src/event_processor_with_human_output.rs:244`, `:385-390`). JSON and stream-json keep it in their events only.
 * Other warnings keep today's text output (only the three COMPACTION_* codes and MCP_START_FAILED are written).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {output} from '../../src/main.ts';
import {createEventBridge} from '../../src/events/bridge.ts';
import {createV2EventBridge} from '../../src/protocol/v2/events.ts';

const row=(value:Record<string,unknown>)=>({type:'CUSTOM',name:'talos.compattazione',_sequenza:5,value});
function io(){const out:string[]=[];const err:string[]=[];return{out,err,api:{writeOut:(s:string)=>{out.push(s);},writeErr:(s:string)=>{err.push(s);},stdinIsTTY:false,stdoutIsTTY:false,readStdin:async()=>''} as any};}
const result={ok:true,sessionId:'s-1',text:'ANSWER',warnings:[],toolCalls:[],changedFiles:[],usage:null,status:'completed'} as any;
const cases:Array<[string,Record<string,unknown>]>=[
  ['COMPACTION_FALLBACK',{fase:'fine',compattato:false,motivo:'ripiego',codice:'CTX_HISTORY_DIVERGED'}],
  ['COMPACTION_HISTORY_REALIGNED',{fase:'fine',compattato:false,motivo:'archivio-riallineato',codice:'CTX_HISTORY_DIVERGED'}],
  ['COMPACTION_FAILED',{fase:'fine',compattato:false,motivo:'troncato'}],
];

test('-p text (v1): each compaction warning is one stderr line, stdout keeps the answer',()=>{
  for(const [code,value] of cases){
    const v1=createEventBridge('s-1').translate(row(value) as any) as any;
    assert.equal(v1?.data?.code,code);
    const x=io();output(x.api,'text','v1',{result,events:[v1]});
    assert.deepEqual(x.err,[`Warning: ${v1.data.message}\n`],code);
    assert.equal(x.out.join('').includes('compact'),false,'stdout keeps the answer only');
  }
});

test('-p text (v2): the same line from the v2 event',()=>{
  const v2=createV2EventBridge('s-1').translate(row(cases[0]![1]) as any) as any;
  const x=io();output(x.api,'text','v2',{result:{...result,schema:'talos.cli.result.v2'},events:[v2]});
  assert.equal(x.err.filter(line=>line.startsWith('Warning: The Context Engine failed')).length,1);
});

test('-p json and stream-json never write it to stderr; another warning keeps text quiet as before',()=>{
  const v1=createEventBridge('s-1').translate(row(cases[2]![1]) as any) as any;
  for(const format of ['json','stream-json']){const x=io();output(x.api,format,'v1',{result,events:[v1]});assert.deepEqual(x.err,[],format);}
  const other={schema:'talos.cli.event.v1',seq:1,ts:'t',sessionId:'s-1',type:'warning',data:{code:'CLI_NOTICE',message:'something else'}};
  const x=io();output(x.api,'text','v1',{result,events:[other]});
  assert.deepEqual(x.err,[]);
});
