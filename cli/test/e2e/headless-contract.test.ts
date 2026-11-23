import test from 'node:test';
import assert from 'node:assert/strict';
import {main} from '../../src/main.ts';

function io(){const out:string[]=[];const err:string[]=[];return{out,err,impl:{writeOut:(s:string)=>out.push(s),writeErr:(s:string)=>err.push(s),stdinIsTTY:false,stdoutIsTTY:false,readStdin:async()=>''}};}
function runtime(){return{async start(){return's1';},subscribe(_id:string,fn:(e:unknown)=>void){queueMicrotask(()=>{fn({type:'RunStarted',runId:'r'});fn({type:'TextMessageContent',messageId:'m',delta:'OK'});fn({type:'RunFinished',runId:'r'});});return()=>{};},async answerApproval(){},async cancel(){},async close(){},async restore(){return{restored:0,total:0};},async resume(id:string){return id;},async fork(){return's2';},async listSessions(){return[];},export(){return{eventi:[]};}};}

test('compiled headless JSON contract has exactly one JSON document and no ANSI',async()=>{const f=io();const code=await main(['-p','hello','--json','--permission-mode','dontAsk'],{io:f.impl as any,createRuntime:async()=>runtime() as any});assert.equal(code,0);assert.equal(f.err.join(''),'');const text=f.out.join('');assert.equal(text.includes('\u001b['),false);const parsed=JSON.parse(text);assert.equal(parsed.schema,'talos.cli.result.v1');assert.equal(parsed.ok,true);assert.equal(parsed.result.text,'OK');});

test('stream-json is one JSON object per line and contains no decorative output',async()=>{const f=io();const code=await main(['-p','hello','--output-format','stream-json','--permission-mode','dontAsk'],{io:f.impl as any,createRuntime:async()=>runtime() as any});assert.equal(code,0);const text=f.out.join('');assert.equal(text.includes('\u001b['),false);const rows=text.trim().split('\n').map(JSON.parse);assert.ok(rows.length>=2);assert.ok(rows.every(x=>x.schema==='talos.cli.event.v1'));});
