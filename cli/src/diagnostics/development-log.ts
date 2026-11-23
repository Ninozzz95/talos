import {createHash,randomUUID} from 'node:crypto';
import {appendFileSync,mkdirSync,readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRedactor,secretValuesFromEnvironment} from './redact.ts';
import {findPackageRoot} from '../runtime/package-root.ts';
import type {CliPaths} from '../paths.ts';
import {CLI_VERSION} from '../version.ts';

export type DevelopmentLogSeverity='debug'|'info'|'warning'|'error'|'fatal';
export type DevelopmentLogRecord={
  schema:'talos.cli.development-log.v1';ts:string;elapsedMs:number;pid:number;correlationId:string;
  severity:DevelopmentLogSeverity;component:string;event:string;data:unknown;
};
type Init={logDir?:string;paths?:CliPaths;projectRoot?:string;argv?:readonly string[];component?:string;extra?:Record<string,unknown>};
type State={dir:string;base:string;part:number;path:string;started:number;correlationId:string;redactor:ReturnType<typeof createRedactor>;component:string;closed:boolean;
  /* A1 (owner 07/10): buffered queue — records are pre-serialized+redacted lines; flush at threshold, on timer, on close, on exit */
  queue:string[];queuedBytes:number;fileBytes:number;fileStampMs:number;timer:NodeJS.Timeout|null;maxBytes:number;rotateMs:number;flushMs:number};
const MAX_FILE_BYTES=8*1024*1024;
const MAX_ROTATE_MS=24*60*60*1000;
const FLUSH_LINES=64;
const FLUSH_BYTES=512*1024;
const DEFAULT_FLUSH_MS=250;
const MAX_STRING=16*1024;
const MAX_ARRAY=128;
const MAX_KEYS=128;
let state:State|null=null;
let hooksInstalled=false;

function sha256(value:string){return createHash('sha256').update(value).digest('hex');}
export function developmentTextEvidence(value:unknown){const text=String(value??'');return{length:text.length,bytes:Buffer.byteLength(text,'utf8'),sha256:sha256(text)};}
function truncate(value:unknown):string{const text=typeof value==='string'?value:String(value);if(text.length<=MAX_STRING)return text;return `${text.slice(0,MAX_STRING)}…[truncated:${text.length-MAX_STRING}]`;}
/*
 * ⛔ R0 (forensics B row 4): logging is TOTAL — it never throws, whatever it is handed. `50601493c` put
 *   `developmentLogError` first in `main`'s catch; a thrown value with a throwing getter made `Object.entries` throw there, so the
 *   catch itself threw and no error envelope was written. Every read of a foreign value goes through `readField`, and a value that
 *   cannot be read at all is logged as `[UNREADABLE]` instead of breaking the caller.
 */
const UNREADABLE='[UNREADABLE]';
function readField(value:object,key:PropertyKey):unknown{try{return (value as any)[key];}catch{return UNREADABLE;}}
/* esportato per i banchi (a1-misura-devlog): la serializzazione è identica prima e dopo la cura, l'I/O no */
export function safeValue(value:unknown,depth=0,seen=new WeakSet<object>()):unknown{
  try{
    if(depth>6)return'[DEPTH_LIMIT]';
    if(value===null||typeof value==='number'||typeof value==='boolean')return value;
    if(typeof value==='bigint')return value.toString();
    if(typeof value==='string')return truncate(value);
    if(typeof value==='function')return`[Function:${readField(value,'name')||'anonymous'}]`;
    if(typeof value!=='object')return String(value);
    if(seen.has(value as object))return'[CIRCULAR]';seen.add(value as object);
    if(value instanceof Error)return serializeError(value,depth+1,seen);
    if(Array.isArray(value))return value.slice(0,MAX_ARRAY).map(item=>safeValue(item,depth+1,seen));
    const out:Record<string,unknown>={};
    for(const key of Object.keys(value as object).slice(0,MAX_KEYS)){
      const item=readField(value as object,key);
      if(/^(?:prompt|text|testo|consegna|consegnaCorta|content|delta|messages|input|output|command|comando)$/iu.test(key)&&typeof item==='string')out[key+'Evidence']=developmentTextEvidence(item);
      else out[key]=safeValue(item,depth+1,seen);
    }
    return out;
  }catch{return UNREADABLE;}
}
function serializeError(error:unknown,depth=0,seen=new WeakSet<object>()):Record<string,unknown>{
  try{
    if(!(error instanceof Error))return{value:safeValue(error,depth+1,seen)};
    const name=readField(error,'name');
    if(seen.has(error))return{name,message:'[CIRCULAR_ERROR]'};seen.add(error);
    const code=readField(error,'code'),retryable=readField(error,'retryable'),details=readField(error,'details'),cause=readField(error,'cause');
    return{name,message:truncate(readField(error,'message')),stack:truncate(readField(error,'stack')??''),...(typeof code==='string'?{code}:{}),...(typeof retryable==='boolean'?{retryable}:{}),...(details!==undefined?{details:safeValue(details,depth+1,seen)}:{}),...(cause!==undefined?{cause:serializeError(cause,depth+1,seen)}:{})};
  }catch{return{value:UNREADABLE};}
}
function dependencySnapshot(){
  try{
    /* the package folder from the bundle or the sources (runtime/package-root.ts); two levels down when there is none */
    const root=findPackageRoot(import.meta.url)??fileURLToPath(new URL('../../',import.meta.url));
    const pkg=JSON.parse(readFileSync(join(root,'package.json'),'utf8'));
    const lock=JSON.parse(readFileSync(join(root,'package-lock.json'),'utf8'));
    const packages=lock?.packages??{};
    const version=(name:string)=>packages[`node_modules/${name}`]?.version??pkg.dependencies?.[name]??pkg.devDependencies?.[name]??null;
    return{packageRoot:root,packageVersion:pkg.version??CLI_VERSION,typescript:version('typescript'),react:version('react'),ink:version('ink'),mxc:version('@microsoft/mxc-sdk')};
  }catch(error){return{unavailable:true,error:error instanceof Error?error.message:String(error)};}
}
function environmentSnapshot(){
  const names=['TERM','COLORTERM','CI','GITHUB_ACTIONS','WT_SESSION','TERM_PROGRAM','COMSPEC','PSModulePath','TALOS_CLI_INSPECTION_SNAPSHOT','TALOS_CLI_DEV_LOG_DIR','TALOS_REDUCED_MOTION'];
  return Object.fromEntries(names.filter(name=>process.env[name]!==undefined).map(name=>[name,process.env[name]]));
}
function nextPath(s:State){return join(s.dir,`${s.base}${s.part===1?'':`.part-${s.part}`}.jsonl`);}
/* A1 (owner 07/10): thresholds come env, seam legittimo per test e operazioni; 0/non-finito = fallback. */
function envPositive(name:string,fallback:number){const value=Number(process.env[name]);return Number.isFinite(value)&&value>0?value:fallback;}
function envNonNegative(name:string,fallback:number){const value=Number(process.env[name]);return Number.isFinite(value)&&value>=0?value:fallback;}
function stampName(s:State){return `talos-dev-${new Date(s.fileStampMs).toISOString().replace(/[:.]/gu,'-')}-${process.pid}-${s.correlationId.slice(0,8)}`;}
/*
 * A1 flush (owner 07/10, rimedi 1+2): DUE syscall di rotate (existsSync+statSync) e UNA di append PER RECORD sono
 * la catena che degrada il resume (A1 3,71-4,06 s contro 2 s; ~9.600 righe/4,9 MB per resume). Hermes non appende
 * per riga sincrono («loggers only do a non-blocking enqueue», hermes_logging.py:660-663) e nemmeno Claude Code
 * (buffer 100 righe/1 s, drainSync batched all'exit). Qui: coda pre-serializzata+redatta, flush a batch — una
 * appendFileSync per CHUNK, mai per record; rotazione per dimensione (contatore interno, zero stat per record)
 * e per tempo (nuovo stamp); stesso formato file e convenzione .part-N di prima.
 */
function flushDevelopmentLog(){const s=state;if(!s||!s.queue.length)return;const batch=s.queue;s.queue=[];s.queuedBytes=0;
  let chunk:string[]=[],chunkBytes=0;
  /* M2 (revisione A1): su append fallito (es. ENOSPC) fileBytes non cresce → il file reale può superare maxBytes; il chunk è scartato, mai ri-accodato (R0, memoria limitata): derapata accettata e dichiarata nel dossier */
  const emitChunk=()=>{if(!chunk.length)return;try{appendFileSync(s.path,chunk.join('\n')+'\n',{encoding:'utf8',mode:0o600});s.fileBytes+=chunkBytes;}catch{/* logging must never break TALOS */}chunk=[];chunkBytes=0;};
  for(const line of batch){
    const lineBytes=Buffer.byteLength(line,'utf8')+1;
    if(Date.now()-s.fileStampMs>=s.rotateMs&&s.fileBytes+chunkBytes>0){emitChunk();s.fileStampMs=Date.now();s.base=stampName(s);s.part=1;s.fileBytes=0;s.path=nextPath(s);}
    else if(s.fileBytes+chunkBytes+lineBytes>s.maxBytes&&s.fileBytes+chunkBytes>0){emitChunk();s.part+=1;s.path=nextPath(s);s.fileBytes=0;}
    chunk.push(line);chunkBytes+=lineBytes;
  }
  emitChunk();
}
function write(record:DevelopmentLogRecord){const s=state;if(!s||s.closed)return;try{
  const line=JSON.stringify(s.redactor.value(safeValue(record)));
  s.queue.push(line);s.queuedBytes+=Buffer.byteLength(line,'utf8')+1;
  /* 'fatal' write-through: l'evidenza di un crash non aspetta il flush (Hermes drain limitato, Claude drainSync) */
  if(record.severity==='fatal'||s.queue.length>=FLUSH_LINES||s.queuedBytes>=FLUSH_BYTES)flushDevelopmentLog();
}catch{/* logging must never break TALOS */}}
function installProcessHooks(){if(hooksInstalled)return;hooksInstalled=true;
  /* M1 (revisione A1): finestre di perdita dichiarate — un segnale arrivato PRIMA di installProcessHooks non ha handler (nessun evento 'exit'), e SIGKILL/SIGQUIT sono intrinseci: le righe in coda (≤64 righe / 512 KiB) vanno perse. Ogni altra via (uscita pulita, secondo Ctrl+C, segnali gestiti, crash, process.exit esterno) esce via closeDevelopmentLogging, exit-hook o monitor */
  process.on('exit',()=>{try{flushDevelopmentLog();}catch{/* best effort */}});
  process.on('warning',warning=>developmentLog('process.warning',{error:serializeError(warning)},'warning','process'));
  process.on('unhandledRejection',reason=>developmentLog('process.unhandledRejection',{error:serializeError(reason)},'error','process'));
  /* il monitor NON intercetta l'eccezione (R0) ma dopo il log 'fatal' svuota la coda: le righe bufferizzate sopravvivono al crash */
  process.on('uncaughtExceptionMonitor',error=>{developmentLog('process.uncaughtExceptionMonitor',{error:serializeError(error)},'fatal','process');try{flushDevelopmentLog();}catch{/* best effort */}});
}
export function initializeDevelopmentLogging(input:Init={}):string|null{
  if(state&&!state.closed){developmentLog('logger.context_update',{projectRoot:input.projectRoot,paths:input.paths,argv:input.argv?.map(developmentTextEvidence),extra:input.extra},'debug',input.component??state.component);return state.path;}
  const dir=resolve(input.logDir??process.env.TALOS_CLI_DEV_LOG_DIR??(input.paths?join(input.paths.logsRoot,'development'):''));
  if(!dir||dir===resolve('.'))return null;
  try{mkdirSync(dir,{recursive:true,mode:0o700});}catch{return null;}
  const started=performance.now(),correlationId=randomUUID(),fileStampMs=Date.now();
  const s:State={dir,base:'',part:1,path:'',started,correlationId,redactor:createRedactor(secretValuesFromEnvironment(process.env)),component:input.component??'cli',closed:false,queue:[],queuedBytes:0,fileBytes:0,fileStampMs,timer:null,maxBytes:envPositive('TALOS_CLI_DEV_LOG_MAX_BYTES',MAX_FILE_BYTES),rotateMs:envPositive('TALOS_CLI_DEV_LOG_ROTATE_MS',MAX_ROTATE_MS),flushMs:envNonNegative('TALOS_CLI_DEV_LOG_FLUSH_MS',DEFAULT_FLUSH_MS)};
  s.base=stampName(s);s.path=nextPath(s);state=s;installProcessHooks();
  if(s.flushMs>0){s.timer=setInterval(()=>{try{flushDevelopmentLog();}catch{/* logging must never break TALOS */}},s.flushMs);s.timer.unref?.();}
  developmentLog('process.start',{cliVersion:CLI_VERSION,node:process.version,versions:process.versions,platform:process.platform,arch:process.arch,pid:process.pid,ppid:process.ppid,cwd:process.cwd(),execPath:process.execPath,argv:(input.argv??process.argv.slice(2)).map(developmentTextEvidence),projectRoot:input.projectRoot??null,terminal:{stdinTTY:Boolean(process.stdin.isTTY),stdoutTTY:Boolean(process.stdout.isTTY),columns:process.stdout.columns??null,rows:process.stdout.rows??null},paths:input.paths??null,environment:environmentSnapshot(),dependencies:dependencySnapshot(),extra:input.extra??null},'info','process');
  return s.path;
}
export function developmentLog(event:string,data:unknown={},severity:DevelopmentLogSeverity='info',component?:string){const s=state;if(!s||s.closed)return;try{write({schema:'talos.cli.development-log.v1',ts:new Date().toISOString(),elapsedMs:Math.round((performance.now()-s.started)*1000)/1000,pid:process.pid,correlationId:s.correlationId,severity,component:component??s.component,event,data});}catch{/* logging must never break TALOS */}}
export function developmentLogError(event:string,error:unknown,data:Record<string,unknown>={},component?:string){if(!state||state.closed)return;try{developmentLog(event,{...data,error:serializeError(error)},'error',component);}catch{/* logging must never break TALOS */}}
export function developmentLogPath(){return state?.path??null;}
/** One record written straight to the file, also AFTER the log was closed: the exit backstop speaks after `process.stop` (runtime/exit-backstop.ts, 13/10/2026). Same record, same redaction; never a throw. */
export function developmentLogLate(event:string,data:unknown={},severity:DevelopmentLogSeverity='warning',component?:string){const s=state;if(!s)return;if(!s.closed){developmentLog(event,data,severity,component);developmentLogFlush();return;}try{appendFileSync(s.path,JSON.stringify(s.redactor.value(safeValue({schema:'talos.cli.development-log.v1',ts:new Date().toISOString(),elapsedMs:Math.round((performance.now()-s.started)*1000)/1000,pid:process.pid,correlationId:s.correlationId,severity,component:component??s.component,event,data})))+'\n',{encoding:'utf8',mode:0o600});}catch{/* logging must never break TALOS */}}
export function developmentLogFlush(){try{flushDevelopmentLog();}catch{/* logging must never break TALOS */}}
export function closeDevelopmentLogging(extra:Record<string,unknown>={}){const s=state;if(!s||s.closed)return;developmentLog('process.stop',extra,'info','process');s.closed=true;try{flushDevelopmentLog();}catch{/* best effort */}if(s.timer){clearInterval(s.timer);s.timer=null;}}
