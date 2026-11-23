import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readdir,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {main} from '../src/main.ts';
import {resolveCliPaths} from '../src/paths.ts';

function fakeIo(){const out:string[]=[];const err:string[]=[];return{out,err,io:{writeOut:(s:string)=>out.push(s),writeErr:(s:string)=>err.push(s),stdinIsTTY:false,stdoutIsTTY:false,readStdin:async()=>''}};}

function stubRuntime(){return{
  async restore(){return{restored:2,total:2};},
  async listSessions(){return[{sessionId:'old',avviataAlle:'2026-01-01'},{sessionId:'new',avviataAlle:'2026-02-01'}];},
  export(){return{eventi:[]};},
  async resume(id:string){return id;},
  subscribe(_id:string,fn:(e:any)=>void){queueMicrotask(()=>{fn({type:'RunStarted',runId:'r'});fn({type:'TextMessageContent',messageId:'m',delta:'ok'});fn({type:'RunFinished',runId:'r'});});return()=>{};},
  async answerApproval(){},async cancel(){},async close(){},async fork(){return'child';},async start(){return'new';}
};}

test('resume last selects the newest restored session',async()=>{
  const f=fakeIo();
  const resumed:string[]=[];
  const runtime:any=stubRuntime();
  runtime.resume=async(id:string)=>{resumed.push(id);return id;};
  const code=await main(['--resume','last','-p','continue','--json'],{io:f.io as any,createRuntime:async()=>runtime});
  assert.equal(code,0);
  assert.deepEqual(resumed,['new']);
});

/* F-022 RESERVE-V (M5-M7): the real wiring. main.ts:113 sweeps stale markers before registering this process
   (TALOS_ACTIVE_RUN_RECONCILE=0 disables it), :114 registers the own marker, and the finally (:129) releases it. */
test('F-022 M5: boot reconcile sweeps a dead marker, the kill-switch spares it, the finally releases the own marker',async()=>{
  const home=await mkdtemp(join(tmpdir(),'talos-main-active-'));
  /* win32 resolves dataRoot from %LOCALAPPDATA%, and the full-suite runner shares ONE profile dir across every
     concurrently running file: without this override a boot from another test file sweeps the dead marker mid-test
     (seen live in the full Windows run of 05/10). APPDATA is overridden too: configRoot=%APPDATA%\TALOS-CLI. */
  const keys=['XDG_CONFIG_HOME','XDG_STATE_HOME','XDG_CACHE_HOME','APPDATA','LOCALAPPDATA','TALOS_ACTIVE_RUN_RECONCILE'];
  const saved=new Map<string,string|undefined>(keys.map((k)=>[k,process.env[k]]));
  Object.assign(process.env,{XDG_CONFIG_HOME:join(home,'c'),XDG_STATE_HOME:join(home,'s'),XDG_CACHE_HOME:join(home,'x'),APPDATA:join(home,'appdata'),LOCALAPPDATA:join(home,'localappdata')});
  delete process.env.TALOS_ACTIVE_RUN_RECONCILE;
  try{
    const paths=resolveCliPaths(process.env,process.platform,home);
    const dir=join(paths.dataRoot,'active-runs');
    const deadMarker=()=>writeFile(join(dir,'999999.json'),JSON.stringify({pid:999999,projectRoot:'/gone',startedAt:new Date().toISOString()}));
    const boot=async()=>{
      const f=fakeIo();
      const code=await main(['-p','hi','--json'],{io:f.io as any,createRuntime:async()=>stubRuntime()});
      assert.equal(code,0);
    };
    await mkdir(dir,{recursive:true});
    await deadMarker();
    await boot();
    await assert.rejects(()=>readFile(join(dir,'999999.json')),'the dead marker is swept at boot');
    await assert.rejects(()=>readFile(join(dir,`${process.pid}.json`)),'the own marker is released by the finally');
    process.env.TALOS_ACTIVE_RUN_RECONCILE='0';
    await deadMarker();
    await boot();
    await readFile(join(dir,'999999.json'),'utf8'); /* the kill-switch left it alone */
  }finally{for(const[k,v]of saved){if(v===undefined)delete (process.env as Record<string,string|undefined>)[k];else process.env[k]=v;}}
});
