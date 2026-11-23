/*
 * P18 Phase 0 (owner, 2026-09-26: "TALOS più veloce di tutti", decisions the same day): the tool-speed bench, hermetic and
 * free. No provider is called. Two measurements that need no model at all:
 *
 *   capture  the Context Engine archive, with the REAL desktop context service and SQLite store in a temporary folder
 *            (as in test/runtime/p12-archive-prefix.test.ts): the cost of one kernel `capture` as the history grows, for
 *            a turn of N tool results, with the service's own hooks and with the CLI bridge (`withArchivableCapture`).
 *   search   the kernel's `cercaNelProgetto` on a real tree (this monorepo by default) against `rg --json` when an `rg`
 *            is given, same query.
 *
 * Usage: node scripts/bench-tools.ts [capture|search|all] [--turns <n>] [--root <dir>] [--rg <path>] [--json]
 * Prints a table; --json prints the raw numbers. Nothing is written outside the OS temp folder.
 */
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {withArchivableCapture} from '../src/runtime/context-archive.ts';

const REPO=fileURLToPath(new URL('../../',import.meta.url));
const mod=(path:string)=>import(pathToFileURL(join(REPO,path)).href);
const args=process.argv.slice(2);
const what=args.find(a=>!a.startsWith('--')&&!args[args.indexOf(a)-1]?.startsWith('--'))??'all';
const opt=(name:string)=>{const i=args.indexOf(name);return i>=0?args[i+1]:undefined;};
const asJson=args.includes('--json');
const ms=(start:bigint)=>Number(process.hrtime.bigint()-start)/1e6;
const median=(values:number[])=>{const s=[...values].sort((a,b)=>a-b);return s[Math.floor(s.length/2)]!;};

async function realService(){
  const dir=mkdtempSync(join(tmpdir(),'talos-bench-context-'));
  const [{createContextEngine},{createSqliteContextStore},{createDesktopContextService}]=await Promise.all([
    mod('context-engine/src/engine.mjs'),mod('context-engine/src/node/sqlite-store.mjs'),mod('harness-ui/src/context-desktop-service.mjs'),
  ]);
  const store=createSqliteContextStore({databasePath:join(dir,'context.sqlite')});
  const profile={provider:'ollama',model:'bench',windowTokens:1_000_000,responseReserve:4_096};
  const engine=createContextEngine({store,model:{resolveModel:()=>profile,summarize:async()=>{throw new Error('no summary in the bench');}},tokenCounter:{countPreparedContext:async()=>({inputTokens:10,method:'heuristic'})}});
  const service=createDesktopContextService({engine,store,readSession:async()=>({sessionId:'bench'}),isSessionEnabled:async()=>true,resolveSessionModel:async()=>profile});
  return{service,close:async()=>{try{await store.close?.();}catch{}rmSync(dir,{recursive:true,force:true,maxRetries:5});}};
}

/* One turn as the kernel captures it: 'response' (a call per tool, not run yet), then one 'tool-result' per result. */
async function captureTurn(hooks:any,history:any[],tools:number,resultBytes:number){
  const calls=Array.from({length:tools},(_,i)=>({id:`c${history.length}-${i}`,type:'function',function:{name:'leggi',arguments:'{}'}}));
  const assistant={role:'assistant',content:null,tool_calls:calls};
  const times:number[]=[];
  history.push(assistant);
  let t=process.hrtime.bigint();await hooks.capture({messages:[...history],reason:'response'});times.push(ms(t));
  for(const call of calls){
    history.push({role:'tool',tool_call_id:call.id,content:'x'.repeat(resultBytes)});
    t=process.hrtime.bigint();await hooks.capture({messages:[...history],reason:'tool-result'});times.push(ms(t));
  }
  history.push({role:'assistant',content:'done'});
  t=process.hrtime.bigint();await hooks.capture({messages:[...history],reason:'finished'});times.push(ms(t));
  return times;
}

async function benchCapture(){
  const rows:any[]=[];
  for(const bridge of ['service','cli-bridge'] as const){
    const {service,close}=await realService();
    try{
      const raw=await service.createKernelHooks({sessionId:'bench',runId:'r'});
      const hooks=bridge==='cli-bridge'?withArchivableCapture(raw):raw;
      const history:any[]=[{role:'system',content:'rules'},{role:'user',content:'go'}];
      const turns=Number(opt('--turns')??40);
      const marks=new Set([1,10,20,40,80,150,300].filter(n=>n<=turns));
      for(let turn=1;turn<=turns;turn++){
        const times=await captureTurn(hooks,history,6,4_000);
        if(marks.has(turn))rows.push({bridge,turn,messages:history.length,captures:times.length,totalMs:+times.reduce((a,b)=>a+b,0).toFixed(1),medianMs:+median(times).toFixed(2)});
        history.push({role:'user',content:`next ${turn}`});
      }
    }finally{await close();}
  }
  return rows;
}

async function benchSearch(){
  const root=resolve(opt('--root')??REPO);
  const rgPath=opt('--rg');
  const kernel:any=await mod('harness-ui/src/kernel/talosHarness.mjs');
  const disk=kernel.discoNode?.({radice:root});
  const rows:any[]=[];
  /* A warm-up pass first (the OS file cache), then the median of three: the first cold pass measures the disk, not the engine. */
  const rg=(testo:string)=>new Promise<number>((done,fail)=>{let n=0;const child=spawn(rgPath!,['--json','--line-number','--fixed-strings','--',testo,root],{stdio:['ignore','pipe','ignore']});child.stdout.on('data',(chunk:Buffer)=>{n+=chunk.toString().split('\n').filter((l:string)=>l.includes('"type":"match"')).length;});child.on('error',fail);child.on('close',()=>done(n));});
  const cerca=async(testo:string)=>String(await kernel.cercaNelProgetto(disk,{testo},{radice:root}));
  const absent=['definitely','not','present',Date.now().toString(36)].join('-');
  for(const testo of ['syncOriginals','withArchivableCapture',absent]){
    if(disk&&typeof kernel.cercaNelProgetto==='function'){
      await cerca(testo);const times:number[]=[];let out='';
      for(let i=0;i<3;i++){const t=process.hrtime.bigint();out=await cerca(testo);times.push(ms(t));}
      rows.push({engine:'kernel cerca',testo,ms:+median(times).toFixed(0),resultLines:out.split('\n').length,capped:out.includes('⚠')});
    }
    if(rgPath){
      await rg(testo);const times:number[]=[];let lines=0;
      for(let i=0;i<3;i++){const t=process.hrtime.bigint();lines=await rg(testo);times.push(ms(t));}
      rows.push({engine:'rg --json',testo,ms:+median(times).toFixed(0),resultLines:lines,capped:false});
    }
  }
  if(!disk)rows.push({engine:'kernel cerca',note:'no node disk factory exported by the kernel; see the kernel exports'});
  return rows;
}

const out:Record<string,any>={};
if(what==='capture'||what==='all')out.capture=await benchCapture();
if(what==='search'||what==='all')out.search=await benchSearch();
if(asJson)console.log(JSON.stringify(out,null,1));
else for(const [name,rows] of Object.entries(out)){console.log(`\n== ${name}`);console.table(rows);}
