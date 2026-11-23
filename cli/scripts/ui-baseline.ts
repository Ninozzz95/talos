/*
 * UI phase, step 0 (owner 01/10, approved plan: «misura di base» before anything is touched). What the person feels in a
 * long session, measured on the BUILT CLI in the synthetic terminal of the acceptance layer (node-pty + @xterm/headless; no
 * real window, no keys to the desktop), hermetic: private profile, the local fake model, the refusing sink.
 *
 * Measured, bucketed by turn number so a growth with the session length shows: the turn time (submit → idle composer), the
 * keystroke echo time after each turn (input → visible, the INP-like number), bytes and DEC 2026 frames the turn wrote, and
 * every N turns the TALOS process's working set, private memory and CPU time. Also the startup: launch → first paint →
 * idle composer, cold then warm. `--cores 1` pins TALOS to one core after launch, as a low-end PC.
 *
 * Sources (owner rule 01/10, 3 competitors + 3 docs + 3 best practices of the last month):
 * - competitors: Claude Code fullscreen docs (memory flat in long conversations, only visible messages rendered); Gemini
 *   CLI PR #23843 (high CPU and sluggish TUI resuming long sessions); Codex TUI snapshot tests (frames as evidence);
 * - docs: Ink 7.1.1 README (maxFps, incrementalRendering); node-pty (ConPTY spawn, pid); @xterm/headless (parsed screen);
 * - best practices: RAIL (web.dev: visible response within 100 ms, frames within 16 ms); INP (report the worst
 *   interaction, p50 and p95, never the mean); gate UI-thread work load-invariantly (same load, same machine, compare).
 *
 * Usage: node scripts/ui-baseline.ts --out <dir> [--turns 300] [--size 120x40] [--cores 0] [--startup-runs 5] [--sample 25]
 */
import {mkdirSync,writeFileSync,appendFileSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {startFakeProvider} from '../test/acceptance/fake-provider.ts';
import {FAKE_MODEL_ID,exitTalos,toComposer,turn} from '../test/acceptance/harness.ts';
import {composerReady} from '../test/acceptance/checks.ts';
import {createProfile} from '../test/acceptance/profile.ts';
import {sinkEnv,startRefusingSink} from '../test/acceptance/sink.ts';
import {TerminalSession} from '../test/acceptance/terminal.ts';

const args=process.argv.slice(2);
const opt=(name:string,fallback?:string)=>{const i=args.indexOf(name);return i>=0?args[i+1]:fallback;};
const OUT=opt('--out');if(!OUT)throw new Error('--out <dir> is required');
const TURNS=Number(opt('--turns','300'));
const [COLS,ROWS]=(opt('--size','120x40')!).split('x').map(Number) as [number,number];
const CORES=Number(opt('--cores','0'));
const STARTUP_RUNS=Number(opt('--startup-runs','5'));
const SAMPLE_EVERY=Number(opt('--sample','25'));
mkdirSync(OUT,{recursive:true});
const rows=join(OUT,'turns.jsonl');writeFileSync(rows,'');

const percentile=(values:number[],p:number)=>{if(!values.length)return null;const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.min(sorted.length-1,Math.ceil(p/100*sorted.length)-1)]!;};
const stats=(values:number[])=>({n:values.length,p50:percentile(values,50),p95:percentile(values,95),max:values.length?Math.max(...values):null});

/** The TALOS process's memory and CPU, read by the OS (the process is the pty's own child under ConPTY). */
function processSample(pid:number){
  const script=`$p=Get-Process -Id ${pid} -ErrorAction SilentlyContinue; if($p){[pscustomobject]@{ws=$p.WorkingSet64;priv=$p.PrivateMemorySize64;cpu=$p.TotalProcessorTime.TotalMilliseconds}|ConvertTo-Json -Compress}`;
  const run=spawnSync('powershell',['-NoProfile','-Command',script],{encoding:'utf8',windowsHide:true});
  try{const value=JSON.parse(run.stdout.trim());return{workingSetMb:Math.round(value.ws/1048576),privateMb:Math.round(value.priv/1048576),cpuMs:Math.round(value.cpu)};}catch{return null;}
}
function pinToCores(pid:number,cores:number){
  const mask=(1<<cores)-1;
  spawnSync('powershell',['-NoProfile','-Command',`(Get-Process -Id ${pid}).ProcessorAffinity=${mask}`],{windowsHide:true});
}
const pidOf=(t:TerminalSession)=>Number((t as unknown as {pty:{pid:number}}).pty.pid);

const fake=await startFakeProvider();
const sink=await startRefusingSink();
const profile=createProfile({name:'ui-baseline',files:{'README.md':'# demo\n','src/index.js':'console.log(1)\n','src/util.js':'export const util=1;\n'},providerUrl:fake.url,extraEnv:sinkEnv(sink)});
try{
  for(const step of [['model','use',FAKE_MODEL_ID,'--scope','user'],['project','trust','--include-nested']]){
    const r=await profile.talos(step);if(r.status!==0)throw new Error(`${step.join(' ')} failed (${r.status}): ${r.stdout}${r.stderr}`);
  }

  /* ---- startup: launch → first paint → idle composer, the first run cold ---- */
  /* `skipBoot:false` is what a person gets: nobody presses a key to skip the boot animation they have never seen. */
  const startup:Array<{run:number;skipBoot:boolean;firstPaintMs:number;composerMs:number}>=[];
  for(let run=0;run<STARTUP_RUNS;run++){
    for(const skipBoot of [false,true]){
      const began=Date.now();
      const t=TerminalSession.launch(profile,[],{cols:COLS,rows:ROWS});
      await t.waitFor('first paint',s=>s.text.trim()!=='',{timeout:60_000});
      const firstPaintMs=Date.now()-began;
      await toComposer(t,{skipBoot});
      startup.push({run,skipBoot,firstPaintMs,composerMs:Date.now()-began});
      await exitTalos(t);await t.close();
    }
  }

  /* ---- the long session ---- */
  const t=TerminalSession.launch(profile,[],{cols:COLS,rows:ROWS});
  await toComposer(t);
  const pid=pidOf(t);
  if(CORES>0)pinToCores(pid,CORES);
  const prompts=['MD summary','SEARCH console','THINK step'];
  const samples:Array<{turn:number;workingSetMb:number;privateMb:number;cpuMs:number}>=[];
  const first=processSample(pid);if(first)samples.push({turn:0,...first});
  for(let index=1;index<=TURNS;index++){
    const prompt=`${prompts[index%prompts.length]} ${index}`;
    const meter=t.meter();const began=Date.now();
    await turn(t,fake,prompt,{timeout:120_000});
    const turnMs=Date.now()-began;const out=meter.stop();
    /* keystroke echo: one character typed into the idle composer until it is visible, then erased */
    const typed=Date.now();t.send('x');
    await t.waitFor('keystroke echo',s=>s.lines.some(line=>/^\s*│?>\s*x\s*│?\s*$/u.test(line.trimEnd())),{timeout:30_000});
    const echoMs=Date.now()-typed;
    t.press('backspace');await t.waitFor('composer empty',s=>composerReady(s),{timeout:30_000});
    appendFileSync(rows,JSON.stringify({turn:index,prompt,turnMs,echoMs,bytes:out.bytes,frames:out.esu,eraseDisplay:out.eraseDisplay})+'\n');
    if(index%SAMPLE_EVERY===0){const sample=processSample(pid);if(sample)samples.push({turn:index,...sample});}
  }
  await exitTalos(t);await t.close();

  /* ---- summary, bucketed so growth with the session shows ---- */
  const all=(await import('node:fs')).readFileSync(rows,'utf8').trim().split('\n').map(line=>JSON.parse(line) as {turn:number;turnMs:number;echoMs:number;bytes:number;frames:number});
  const buckets:Record<string,unknown>={};
  for(let from=1;from<=TURNS;from+=SAMPLE_EVERY){
    const slice=all.filter(row=>row.turn>=from&&row.turn<from+SAMPLE_EVERY);
    buckets[`${from}-${from+SAMPLE_EVERY-1}`]={turnMs:stats(slice.map(r=>r.turnMs)),echoMs:stats(slice.map(r=>r.echoMs)),bytes:stats(slice.map(r=>r.bytes)),frames:stats(slice.map(r=>r.frames))};
  }
  const cpuPerTurn=samples.slice(1).map((s,i)=>({turn:s.turn,cpuMsPerTurn:Math.round((s.cpuMs-samples[i]!.cpuMs)/Math.max(1,s.turn-samples[i]!.turn))}));
  const summary={schema:'talos.cli.ui-baseline.v1',at:new Date().toISOString(),size:`${COLS}x${ROWS}`,cores:CORES||'all',turns:TURNS,startup,buckets,samples,cpuPerTurn};
  writeFileSync(join(OUT,'summary.json'),JSON.stringify(summary,null,2)+'\n');
  console.log(JSON.stringify({startup,first:buckets[Object.keys(buckets)[0]!],last:buckets[Object.keys(buckets).at(-1)!],samples,cpuPerTurn},null,1));
}finally{
  await fake.close();await sink.close();profile.dispose();
}
