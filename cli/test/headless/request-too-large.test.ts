/*
 * 0.6.13, «a request too large for the model» in `talos -p` (owner 22/10/2026; contract (b) with the Desktop). `--attach-if-too-large`
 * sets the kernel's run option `allegaSeTroppoGrande` for the run (a new turn and a resumed one); without it the run ends with the
 * typed error REQUEST_TOO_LARGE: in text on stderr with its numbers and nothing on stdout, in `json` and `stream-json` (v1 and v2)
 * with its code and numbers, exit 70 as the other typed run failures. Fakes only: no kernel, no network.
 */
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {main} from '../../src/main.ts';
import {parseCliArgs} from '../../src/args.ts';
import {collectHeadlessResume} from '../../src/headless/run.ts';
import {createSessionFacade} from '../../src/runtime/session-facade.ts';

const TOO_LARGE={type:'RunError',runId:'r1',code:'REQUEST_TOO_LARGE',message:'The request is too large for this model.',tokensRichiesta:15600,tokensCornice:9000,finestra:16000,fonte:'stima'};
function fakeRuntime(events:Array<Record<string,unknown>>){
  const starts:any[]=[];const resumes:any[]=[];
  const rt:any={starts,resumes,
    start:async(input:any)=>{starts.push(input);return 's-big';},resume:async(...args:any[])=>{resumes.push(args);return 's-big';},
    restore:async()=>({}),listSessions:async()=>[{sessionId:'s-big'}],export:()=>null,fork:async()=>'',
    subscribe(_id:string,sink:(e:any)=>void){queueMicrotask(()=>events.forEach(sink));return()=>{};},answerApproval:async()=>{},cancel:async()=>{},close:async()=>{}};
  return rt;
}
function io(){return{stdout:'',stderr:'',writeOut(s:string){this.stdout+=s;},writeErr(s:string){this.stderr+=s;},stdinIsTTY:false,stdoutIsTTY:false,readStdin:async()=>''} as any;}
const project=()=>mkdtemp(join(tmpdir(),'talos-too-large-'));

test('the flag is parsed only when given, and the help names it',async()=>{
  assert.equal(parseCliArgs(['-p','x','--attach-if-too-large']).attachIfTooLarge,true);
  assert.equal('attachIfTooLarge' in parseCliArgs(['-p','x']),false);
  const out=io();assert.equal(await main(['--help'],{io:out} as never),0);
  assert.match(out.stdout,/--attach-if-too-large/u);
});

test('-p --attach-if-too-large: the run input carries it to the runtime; without the flag it does not',async()=>{
  const rt=fakeRuntime([{type:'TextMessageContent',messageId:'m',delta:'OK'},{type:'RunFinished'}]);
  assert.equal(await main(['--project',await project(),'-p','a very long paste','--attach-if-too-large'],{io:io(),createRuntime:async()=>rt,runTui:async()=>{}} as never),0);
  assert.equal(rt.starts[0]?.attachIfTooLarge,true);
  const plain=fakeRuntime([{type:'RunFinished'}]);
  await main(['--project',await project(),'-p','short'],{io:io(),createRuntime:async()=>plain,runTui:async()=>{}} as never);
  assert.equal('attachIfTooLarge' in plain.starts[0],false);
});

test('a resumed turn carries it in the runtime options, beside --model',async()=>{
  const rt=fakeRuntime([{type:'RunFinished'}]);
  await collectHeadlessResume(rt,'s-big','again',{projectRoot:process.cwd(),model:'m',explicitModel:'p:m',permissionMode:'dontAsk',permissionRules:{allow:[],ask:[],deny:[]},attachIfTooLarge:true} as any);
  assert.deepEqual(rt.resumes[0][3],{model:'p:m',attachIfTooLarge:true});
});

test('the facade hands the kernel `allegaSeTroppoGrande` on a new turn and on a resumed one, only when asked',async()=>{
  const started:any[]=[];const resumed:any[]=[];
  const registry:any={ripristina:async()=>({}),avviaLibero:(input:any)=>{started.push(input);return{sessionId:'s1'};},resume:(...args:any[])=>{resumed.push(args);return{sessionId:'s1'};},elenca:()=>[{sessionId:'s1'}],iscriviti:()=>()=>{},ferma:()=>true,rispondiApprovazione:()=>({ok:true})};
  const facade=createSessionFacade(registry,{model:'p:m'});
  await facade.start({projectRoot:process.cwd(),prompt:'big',model:'p:m',permissionMode:'default',attachIfTooLarge:true});
  await facade.start({projectRoot:process.cwd(),prompt:'small',model:'p:m',permissionMode:'default'});
  assert.equal(started[0].allegaSeTroppoGrande,true);
  assert.equal('allegaSeTroppoGrande' in started[1],false);
  await facade.resume('s1','big',undefined,{attachIfTooLarge:true});
  await facade.resume('s1','small');
  assert.equal(resumed[0][3].allegaSeTroppoGrande,true);
  assert.equal(resumed[0][3].senzaInterfacciaNelGiro,false,'the turn options it had stay');
  assert.equal('allegaSeTroppoGrande' in resumed[1][3],false);
});

test('-p text: the typed error on stderr with its numbers, nothing on stdout, exit 70',async()=>{
  const out=io();
  const code=await main(['--project',await project(),'-p','a very long paste'],{io:out,createRuntime:async()=>fakeRuntime([{type:'RunStarted',runId:'r1',input:{consegna:'a very long paste'}},TOO_LARGE]),runTui:async()=>{}} as never);
  assert.equal(code,70);
  assert.equal(out.stdout,'');
  assert.match(out.stderr,/^Error: The message is too large for this model: about 15,600 tokens; with the system and tools \(about 9,000\) it is over this model’s 16,000\. Nothing was summarized or sent\.\n/u);
  assert.match(out.stderr,/--attach-if-too-large/u);
  assert.match(out.stderr,/\(REQUEST_TOO_LARGE\)/u);
});

test('-p json and stream-json, v1 and v2: the code and the numbers, exit 70',async()=>{
  const run=async(args:string[])=>{const out=io();const code=await main(['--project',await project(),'-p','big',...args],{io:out,createRuntime:async()=>fakeRuntime([{type:'RunStarted',runId:'r1',input:{consegna:'big'}},TOO_LARGE]),runTui:async()=>{}} as never);return{code,out};};
  const numbers={request:15600,frame:9000,window:16000,source:'estimate'};
  let x=await run(['--json']);assert.equal(x.code,70);
  let doc=JSON.parse(x.out.stdout);assert.equal(doc.error.code,'REQUEST_TOO_LARGE');assert.deepEqual(doc.error.details.requestTooLarge,numbers);
  x=await run(['--output-format','stream-json']);assert.equal(x.code,70);
  let rows=x.out.stdout.trim().split('\n').map((line:string)=>JSON.parse(line));let failed=rows.find((row:any)=>row.type==='run.failed');
  assert.equal(failed.data.code,'REQUEST_TOO_LARGE');assert.deepEqual(failed.data.requestTooLarge,numbers);
  x=await run(['--json','--protocol','v2']);assert.equal(x.code,70);
  doc=JSON.parse(x.out.stdout);assert.equal(doc.error.envelope.code,'REQUEST_TOO_LARGE');assert.deepEqual(doc.error.requestTooLarge,numbers);
  x=await run(['--output-format','stream-json','--protocol','v2']);assert.equal(x.code,70);
  rows=x.out.stdout.trim().split('\n').map((line:string)=>JSON.parse(line));failed=rows.find((row:any)=>row.type==='run.failed');
  assert.equal(failed.data.error.envelope.code,'REQUEST_TOO_LARGE');assert.deepEqual(failed.data.error.requestTooLarge,numbers);
  assert.equal(x.out.stderr,'');
});
