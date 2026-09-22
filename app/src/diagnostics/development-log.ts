import {createHash,randomUUID} from 'node:crypto';
import {appendFileSync,existsSync,mkdirSync,readFileSync,statSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRedactor,secretValuesFromEnvironment} from './redact.ts';
import type {CliPaths} from '../paths.ts';
import {CLI_VERSION} from '../version.ts';

export type DevelopmentLogSeverity='debug'|'info'|'warning'|'error'|'fatal';
export type DevelopmentLogRecord={
  schema:'talos.cli.development-log.v1';ts:string;elapsedMs:number;pid:number;correlationId:string;
  severity:DevelopmentLogSeverity;component:string;event:string;data:unknown;
};
type Init={logDir?:string;paths?:CliPaths;projectRoot?:string;argv?:readonly string[];component?:string;extra?:Record<string,unknown>};
type State={dir:string;base:string;part:number;path:string;started:number;correlationId:string;redactor:ReturnType<typeof createRedactor>;component:string;closed:boolean};
const MAX_FILE_BYTES=8*1024*1024;
const MAX_STRING=16*1024;
const MAX_ARRAY=128;
const MAX_KEYS=128;
let state:State|null=null;
let hooksInstalled=false;

function sha256(value:string){return createHash('sha256').update(value).digest('hex');}
export function developmentTextEvidence(value:unknown){const text=String(value??'');return{length:text.length,bytes:Buffer.byteLength(text,'utf8'),sha256:sha256(text)};}
function truncate(value:string){if(value.length<=MAX_STRING)return value;return `${value.slice(0,MAX_STRING)}…[truncated:${value.length-MAX_STRING}]`;}
function safeValue(value:unknown,depth=0,seen=new WeakSet<object>()):unknown{
  if(depth>6)return'[DEPTH_LIMIT]';
  if(value===null||typeof value==='number'||typeof value==='boolean')return value;
  if(typeof value==='bigint')return value.toString();
  if(typeof value==='string')return truncate(value);
  if(typeof value==='function')return`[Function:${value.name||'anonymous'}]`;
  if(typeof value!=='object')return String(value);
  if(seen.has(value as object))return'[CIRCULAR]';seen.add(value as object);
  if(value instanceof Error)return serializeError(value,depth+1,seen);
  if(Array.isArray(value))return value.slice(0,MAX_ARRAY).map(item=>safeValue(item,depth+1,seen));
  const out:Record<string,unknown>={};
  for(const [key,item] of Object.entries(value as Record<string,unknown>).slice(0,MAX_KEYS)){
    if(/^(?:prompt|text|testo|consegna|consegnaCorta|content|delta|messages|input|output|command|comando)$/iu.test(key)&&typeof item==='string')out[key+'Evidence']=developmentTextEvidence(item);
    else out[key]=safeValue(item,depth+1,seen);
  }
  return out;
}
function serializeError(error:unknown,depth=0,seen=new WeakSet<object>()):Record<string,unknown>{
  if(!(error instanceof Error))return{value:safeValue(error,depth+1,seen)};
  if(seen.has(error))return{name:error.name,message:'[CIRCULAR_ERROR]'};seen.add(error);
  const row=error as Error&{code?:unknown;details?:unknown;retryable?:unknown;cause?:unknown};
  return{name:error.name,message:truncate(error.message),stack:truncate(error.stack??''),...(typeof row.code==='string'?{code:row.code}:{}),...(typeof row.retryable==='boolean'?{retryable:row.retryable}:{}),...(row.details!==undefined?{details:safeValue(row.details,depth+1,seen)}:{}),...(row.cause!==undefined?{cause:serializeError(row.cause,depth+1,seen)}:{})};
}
function dependencySnapshot(){
  try{
    const root=fileURLToPath(new URL('../../',import.meta.url));
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
function rotateIfNeeded(s:State){try{if(existsSync(s.path)&&statSync(s.path).size>=MAX_FILE_BYTES){s.part+=1;s.path=nextPath(s);}}catch{/* best effort */}}
function write(record:DevelopmentLogRecord){const s=state;if(!s||s.closed)return;try{rotateIfNeeded(s);const redacted=s.redactor.value(safeValue(record));appendFileSync(s.path,JSON.stringify(redacted)+'\n',{encoding:'utf8',mode:0o600});}catch{/* logging must never break TALOS */}}
function installProcessHooks(){if(hooksInstalled)return;hooksInstalled=true;
  process.on('warning',warning=>developmentLog('process.warning',{error:serializeError(warning)},'warning','process'));
  process.on('unhandledRejection',reason=>developmentLog('process.unhandledRejection',{error:serializeError(reason)},'error','process'));
  process.on('uncaughtExceptionMonitor',error=>developmentLog('process.uncaughtExceptionMonitor',{error:serializeError(error)},'fatal','process'));
}
export function initializeDevelopmentLogging(input:Init={}):string|null{
  if(state&&!state.closed){developmentLog('logger.context_update',{projectRoot:input.projectRoot,paths:input.paths,argv:input.argv?.map(developmentTextEvidence),extra:input.extra},'debug',input.component??state.component);return state.path;}
  const dir=resolve(input.logDir??process.env.TALOS_CLI_DEV_LOG_DIR??(input.paths?join(input.paths.logsRoot,'development'):''));
  if(!dir||dir===resolve('.'))return null;
  try{mkdirSync(dir,{recursive:true,mode:0o700});}catch{return null;}
  const started=performance.now(),correlationId=randomUUID(),stamp=new Date().toISOString().replace(/[:.]/gu,'-');
  const s:State={dir,base:`talos-dev-${stamp}-${process.pid}-${correlationId.slice(0,8)}`,part:1,path:'',started,correlationId,redactor:createRedactor(secretValuesFromEnvironment(process.env)),component:input.component??'cli',closed:false};s.path=nextPath(s);state=s;installProcessHooks();
  developmentLog('process.start',{cliVersion:CLI_VERSION,node:process.version,versions:process.versions,platform:process.platform,arch:process.arch,pid:process.pid,ppid:process.ppid,cwd:process.cwd(),execPath:process.execPath,argv:(input.argv??process.argv.slice(2)).map(developmentTextEvidence),projectRoot:input.projectRoot??null,terminal:{stdinTTY:Boolean(process.stdin.isTTY),stdoutTTY:Boolean(process.stdout.isTTY),columns:process.stdout.columns??null,rows:process.stdout.rows??null},paths:input.paths??null,environment:environmentSnapshot(),dependencies:dependencySnapshot(),extra:input.extra??null},'info','process');
  return s.path;
}
export function developmentLog(event:string,data:unknown={},severity:DevelopmentLogSeverity='info',component?:string){const s=state;if(!s||s.closed)return;write({schema:'talos.cli.development-log.v1',ts:new Date().toISOString(),elapsedMs:Math.round((performance.now()-s.started)*1000)/1000,pid:process.pid,correlationId:s.correlationId,severity,component:component??s.component,event,data});}
export function developmentLogError(event:string,error:unknown,data:Record<string,unknown>={},component?:string){developmentLog(event,{...data,error:serializeError(error)},'error',component);}
export function developmentLogPath(){return state?.path??null;}
export function closeDevelopmentLogging(extra:Record<string,unknown>={}){if(!state||state.closed)return;developmentLog('process.stop',extra,'info','process');state.closed=true;}
