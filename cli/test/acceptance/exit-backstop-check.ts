/**
 * Third review of 0.6.2 (13/10/2026, S4). Since the exit backstop (src/runtime/exit-backstop.ts: two seconds after `main` returned
 * the process ends whatever still holds it) every scenario's `exitTalos` passes even when a handle is stuck: the whole class «the
 * screen is gone and the process stays» — what s52 caught on 13/10 — became invisible to the gate. What tells a clean exit from a
 * cut one is the record the backstop writes when it fires, `cli.exit.backstop` in the development log, with the KINDS of what was
 * holding the process (never a handle's content). The harness reads every development log of the scenario's profile and fails
 * the scenario that left one (harness.ts: `exitTalos`, and the end of every `stage`); s64 was the only reader before.
 *
 * The logs are found by what they are — `*.jsonl` lines of the development log's schema — anywhere under the profile's home but
 * its project: `<data>/logs/development` wherever the platform puts the data folder, and a folder a scenario pointed
 * `TALOS_CLI_DEV_LOG_DIR` at (s64). A record is reported once, so the scenario that made it is the one that fails.
 */
import {readdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';

export type ExitBackstopFound={file:string;ts:string|null;pid:number|null;held:Record<string,number>;afterMs:number|null;exitCode:number|null};
const LOG_SCHEMA='talos.cli.development-log.v1';
const EVENT='cli.exit.backstop';
const reported=new Set<string>();

function logFiles(dir:string,skip:ReadonlySet<string>,depth=0):string[]{
  if(depth>8)return[];
  let entries:import('node:fs').Dirent[];
  try{entries=readdirSync(dir,{withFileTypes:true});}catch{return[];}
  return entries.flatMap(entry=>{
    const full=join(dir,entry.name);
    if(entry.isSymbolicLink())return[];
    if(entry.isDirectory())return depth===0&&skip.has(entry.name)?[]:logFiles(full,skip,depth+1);
    return entry.name.endsWith('.jsonl')?[full]:[];
  });
}

/** Every `cli.exit.backstop` record in the development logs under `home` (the profile's folder; its `project` is not read). */
export function exitBackstopRecords(home:string):ExitBackstopFound[]{
  const found:ExitBackstopFound[]=[];
  for(const file of logFiles(home,new Set(['project']))){
    let text:string;try{text=readFileSync(file,'utf8');}catch{continue;}
    if(!text.includes(EVENT))continue;
    for(const line of text.split('\n')){
      if(!line.includes(EVENT))continue;
      let row:any=null;try{row=JSON.parse(line);}catch{row=null;}
      if(row?.schema!==LOG_SCHEMA||row.event!==EVENT)continue;
      const held:Record<string,number>={};
      for(const [kind,count] of Object.entries(row.data?.held??{}))if(typeof count==='number')held[kind]=count;
      found.push({file,ts:typeof row.ts==='string'?row.ts:null,pid:Number.isInteger(row.pid)?row.pid:null,held,
        afterMs:Number.isFinite(row.data?.afterMs)?Number(row.data.afterMs):null,exitCode:Number.isInteger(row.data?.exitCode)?row.data.exitCode:null});
    }
  }
  return found;
}

/** Whether a TALOS of this profile wrote a development log at all: without one, «no backstop record» proves nothing. The record
 *  looked for is the log's own first one, `process.start` — `cli.main.enter` is written before the profile's log folder is known,
 *  so it is there only when `TALOS_CLI_DEV_LOG_DIR` is set (measured 13/10/2026 on the built CLI: a scenario's log has none). */
export function developmentLogFound(home:string):boolean{
  const entered=(line:string)=>{if(!line.includes('process.start'))return false;try{const row=JSON.parse(line);return row?.schema===LOG_SCHEMA&&row.event==='process.start';}catch{return false;}};
  return logFiles(home,new Set(['project'])).some(file=>{try{return readFileSync(file,'utf8').split('\n').some(entered);}catch{return false;}});
}

/** Throws when a TALOS of this profile was ended by the exit backstop since the last look, saying what held it. With `requireLog`
 *  it also throws when no development log is found: a guard that cannot look must not pass. */
export function assertNoExitBackstop(home:string,where:string,{requireLog=false}:{requireLog?:boolean}={}):void{
  if(requireLog&&!developmentLogFound(home))throw new Error(`EXIT_BACKSTOP_UNREADABLE (${where}): no development log of TALOS was found under ${home}, so whether the exit backstop ended it cannot be told.`);
  const fresh=exitBackstopRecords(home).filter(record=>{const key=`${record.file}|${record.ts}|${record.pid}`;if(reported.has(key))return false;reported.add(key);return true;});
  if(fresh.length===0)return;
  const said=fresh.map(record=>`pid ${record.pid??'?'} at ${record.ts??'?'}: held ${JSON.stringify(record.held)} for ${record.afterMs??'?'} ms after the clean-up (exit code ${record.exitCode??'?'}) — ${record.file}`).join('\n  ');
  throw new Error(`EXIT_BACKSTOP_FIRED (${where}): the screen had ended and something still kept TALOS alive, so the exit backstop ended it. A healthy exit leaves nothing behind; find what holds the event loop (the kinds are below) and end it with the screen.\n  ${said}`);
}
