/*
 * P18 Phase 0 (owner, 2026-09-26: "TALOS più veloce di tutti"; decision: a hermetic, zero-cost bench, TALOS against Pi,
 * Codex, OpenCode and Hermes on the same turns). No real provider is called: every harness talks to a scripted fake on
 * 127.0.0.1, which speaks the OpenAI chat-completions dialect (TALOS through its `ollama` provider, Pi, OpenCode) and the
 * Responses dialect (Codex speaks only that: codex-rs/model-provider-info/src/lib.rs `WireApi::Responses`). Every other
 * outbound request goes to the refusing sink, and every harness runs with a private, temporary profile.
 *
 * The same turns for everyone, keyed by a word in the user's message:
 *   BENCH_OK      no tool: the start-up and one round trip
 *   BENCH_READ6   one answer asking for six reads of f1.txt … f6.txt (read tool; Codex has only its shell)
 *   BENCH_GREP4   one answer asking for four searches over a tree of TREE_FILES files (search tool; Codex's shell `rg`)
 *   BENCH_SHELL3  one answer asking for three shell commands of SLEEP_MS each (`node sleep.cjs`)
 * then a final answer. The number that matters is measured AT THE FAKE: the time from the end of the answer that asked
 * for the tools to the arrival of the next request, i.e. what the harness spent running the tools and sending the results
 * back (`toolGapMs`); plus the whole run's wall time and how many results came back.
 *
 * Usage: node scripts/bench-harness.ts [--harness talos,pi,codex,opencode] [--scenario ok,read6,grep4,shell3] [--reps 3]
 *        [--tree <files>] [--git] [--schemas <file>] [--trace <hook.mjs> <out.txt>] [--json]
 * `--schemas` writes the tool schemas each harness sent (the fake picks tools and argument names from them).
 */
import {spawn,spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {sinkEnv,startRefusingSink} from '../test/acceptance/sink.ts';
import {startBenchFake} from './bench-fake.ts';
import {agent,makeWorkspace,type AgentName} from './bench-agents.ts';

const TREE_FILES=Number(process.argv[process.argv.indexOf("--tree")+1]??6_000)||(process.argv.includes("--tree")?0:6_000);
const args=process.argv.slice(2);
const opt=(name:string)=>{const i=args.indexOf(name);return i>=0?args[i+1]:undefined;};
const harnesses=(opt('--harness')??'talos,pi,codex,opencode').split(',');
const scenarios=(opt('--scenario')??'ok,read6,grep4,shell3').split(',');
const reps=Number(opt('--reps')??3);
const median=(v:number[])=>{const s=[...v].sort((a,b)=>a-b);return s.length?s[Math.floor(s.length/2)]!:NaN;};

/* ---------- the fake: scripts/bench-fake.ts (shared with scripts/ui-frames.ts) ---------- */

/* ---------- the workspace and the agents: scripts/bench-agents.ts (shared with scripts/ui-frames.ts) ---------- */
type Run={cmd:string;env:Record<string,string>;setup?:()=>void};
function harness(name:string,home:string,fakeUrl:string,sink:Record<string,string>,prompt:string):Run{
  const a=agent(name as AgentName,home,fakeUrl,sink);
  return{cmd:a.print(prompt),env:a.env,...(a.setup?{setup:()=>a.setup!(a.env.BENCH_CWD!)}:{})};
}

function runOnce(run:Run,cwd:string,timeoutMs=180_000){
  return new Promise<{code:number|null;ms:number;out:string;timedOut:boolean}>(done=>{
    const started=Date.now();let out='';let timedOut=false;
    const child=spawn(run.cmd,{cwd,env:run.env,shell:true,stdio:['ignore','pipe','pipe'],windowsHide:true});
    child.stdout.on('data',(c:Buffer)=>{out+=c.toString();});child.stderr.on('data',(c:Buffer)=>{out+=c.toString();});
    const timer=setTimeout(()=>{timedOut=true;if(child.pid)spawnSync('taskkill',['/PID',String(child.pid),'/T','/F']);},timeoutMs);
    child.on('close',code=>{clearTimeout(timer);done({code,ms:Date.now()-started,out,timedOut});});
  });
}

const fake=await startBenchFake({verbose:args.includes('--verbose')});const log=fake.log;const sinkServer=await startRefusingSink();const sink=sinkEnv(sinkServer);
const root=mkdtempSync(join(tmpdir(),'talos-bench-harness-'));
const rows:any[]=[];
try{
  const ws=join(root,'ws');makeWorkspace(ws,TREE_FILES);
  /* --git: the workspace is a repository with everything committed (the usual coding case); without it, a plain folder */
  if(args.includes('--git'))for(const a of [['init','-q'],['add','-A'],['-c','user.name=bench','-c','user.email=bench@localhost','commit','-q','-m','bench']]){const r=spawnSync('git',a,{cwd:ws,encoding:'utf8'});if(r.status!==0)throw new Error(`git ${a.join(' ')}: ${r.stderr}`);}
  for(const name of harnesses){
    const home=join(root,`home-${name}`);
    for(const scenario of scenarios){
      const gaps:number[]=[],walls:number[]=[],firsts:number[]=[],tails:number[]=[];let note='';let results=0,asked=0,requests=0;
      for(let r=0;r<reps;r++){
        fake.setCurrent(name);const from=log.length;
        const run=harness(name,home,fake.url,sink,`BENCH_${scenario.toUpperCase()} please`);
        /* PWD too: Git Bash exports it and OpenCode takes its project folder from it, not from the process cwd. */
        run.env.BENCH_CWD=ws;run.env.PWD=ws;if(r===0&&scenario===scenarios[0])run.setup?.();
        /* --trace <hook.mjs> <out.txt>: a preload that logs child processes and connections with their times (Node harnesses) */
        const trace=args.indexOf('--trace');if(trace>=0){run.env.NODE_OPTIONS=`--import=${pathToFileURL(args[trace+1]!).href}`;run.env.BENCH_TRACE=args[trace+2]!;}
        /* --env K=V (repeatable): an extra variable for the harness process, for A/B runs */
        args.forEach((a,i)=>{if(a==='--env'){const [k,...v]=args[i+1]!.split('=');run.env[k!]=v.join('=');}});
        /* --cpu-prof <dir>: a V8 CPU profile of each Node harness process, to see where start-up and tail go */
        const prof=args.indexOf('--cpu-prof');if(prof>=0)run.env.NODE_OPTIONS=`${run.env.NODE_OPTIONS??''} --cpu-prof --cpu-prof-dir=${args[prof+1]!}`.trim();
        const started=Date.now();
        const res=await runOnce(run,ws);
        const all=log.slice(from);requests=all.length;
        /* start-up = spawn to the first model request; tail = the last answer's end to the process exit */
        if(all.length){firsts.push(all[0]!.at-started);tails.push(started+res.ms-(all.at(-1)!.endAt??all.at(-1)!.at));}
        const mine=all.filter(x=>x.scenario===scenario);
        const ask=mine.find(x=>x.calls>0);const next=ask?mine.find(x=>x.at>=(ask.endAt??Infinity)&&x.results>0):undefined;
        if(ask&&next){gaps.push(next.at-ask.endAt!);results=next.results;asked=ask.calls;if(args.includes('--verbose'))console.error(`${name} ${scenario}: ${JSON.stringify(next.samples)}`);}
        walls.push(res.ms);
        if(res.code!==0||res.timedOut||(scenario!=='ok'&&!next))note=`${res.timedOut?'timeout ':''}exit ${res.code}; ${res.out.replace(/\s+/gu,' ').slice(-240)}`;
      }
      rows.push({harness:name,scenario,wallMs:median(walls),startMs:median(firsts),tailMs:median(tails),toolGapMs:gaps.length?median(gaps):null,calls:asked,results,requests,sinkHits:sinkServer.hits.length,note});
    }
  }
}finally{
  await fake.close();await sinkServer.close();
  const schemaFile=opt('--schemas');if(schemaFile)writeFileSync(schemaFile,JSON.stringify(fake.schemas,null,1));
  rmSync(root,{recursive:true,force:true,maxRetries:5});
}
if(args.includes('--json'))console.log(JSON.stringify(rows,null,1));else console.table(rows);
