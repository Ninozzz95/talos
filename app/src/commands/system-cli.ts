import {access,mkdir,open,readdir,readFile,stat,writeFile} from 'node:fs/promises';import {constants} from 'node:fs';import {join,resolve} from 'node:path';import {homedir} from 'node:os';import {spawn,spawnSync} from 'node:child_process';
import type {CommandContext} from './context.ts';import {assertNoUnknownOptions,takeFlag,takeOption,writeValue} from './context.ts';import {runDoctor} from '../diagnostics/doctor.ts';import {createPathPseudonymizer,redactObject,secretValuesFromEnvironment} from '../diagnostics/redact.ts';import {writeStoredZip} from '../diagnostics/zip.ts';import {loadEffectiveConfig} from '../config/load.ts';import {CLI_VERSION} from '../version.ts';import {performUpdateCheck,downloadVerifiedUpdate,discoverGitHubReleaseManifest} from '../update/run.ts';import {describeKeyringProbeFailure,describeKeyringProblem,diagnoseKeyringProbe,loadTalosSystemKeyring,systemKeyringAdapter,type KeyringLoaderDeps} from '../provider/system-keyring.ts';import {hasActiveRuns} from '../runtime/active-run.ts';import {importTalosModule} from '../runtime/repo.ts';import {detectTerminalCapabilities} from '../tui/terminal-capabilities.ts';import {createTerminalSessionPlan} from '../tui/terminal-session.ts';import {shellDimensions} from '../tui/shell-layout.ts';import {currentProcessPerformanceSnapshot} from '../tui/metrics.ts';import {createTrustAuthority} from '../security/trust-authority.ts';import {createProcessTreeEvidenceStore} from '../security/process-tree-evidence-store.ts';import * as updateCheck from '../update/check.ts';

export async function pathAccessible(p:string,{writable=true,accessImpl=access}:{writable?:boolean;accessImpl?:typeof access}={}){try{await accessImpl(p,writable?constants.R_OK|constants.W_OK:constants.R_OK);return true;}catch{return false;}}
/** Injectable for tests only: the keyring loader never reaches the real module from a test layout. */
export type SystemCommandDeps={keyring?:KeyringLoaderDeps};
/** B1 slice 19: a failing keyring check THROWS its reason, and `runDoctor` prints it as the check's detail — never a bare `ERR keyring`. */
async function keyringAvailable(repoRoot:string,deps:KeyringLoaderDeps={}){const loaded=loadTalosSystemKeyring(repoRoot,deps);if(!loaded.ok)throw new Error(describeKeyringProblem(loaded));const outcome=await diagnoseKeyringProbe(systemKeyringAdapter(loaded.Entry));if(!outcome.ok)throw new Error(describeKeyringProbeFailure(outcome));return true;}
function platformId(){return `${process.platform}-${process.arch}`;}
function providerView(row:any){return{id:String(row?.id??''),label:String(row?.label??row?.id??''),auth:{required:row?.auth?.required===true,source:String(row?.auth?.source??'missing'),configured:row?.auth?.configured===true,usable:row?.auth?.usable===true},endpoint:{host:typeof row?.endpoint?.host==='string'?row.endpoint.host:null,configured:row?.endpoint?.configured===true,valid:row?.endpoint?.valid===true},runtimeConfigured:row?.runtimeConfigured!==false,local:row?.local===true,cooldown:{active:row?.cooldown?.active===true,cause:typeof row?.cooldown?.cause==='string'?row.cooldown.cause:null,until:Number.isFinite(row?.cooldown?.until)?Number(row.cooldown.until):null},lastHealth:{state:String(row?.lastHealth?.state??'unknown'),latencyMs:Number.isFinite(row?.lastHealth?.latencyMs)?Number(row.lastHealth.latencyMs):null,observedAt:Number.isFinite(row?.lastHealth?.observedAt)?Number(row.lastHealth.observedAt):null,httpStatus:Number.isFinite(row?.lastHealth?.httpStatus)?Number(row.lastHealth.httpStatus):null},ready:row?.ready===true};}
async function doctorData(ctx:CommandContext,deps:SystemCommandDeps={},options:{profile?:boolean}={}){
  const profile=options.profile===true;
  const base=await runDoctor({
    paths:ctx.paths,
    fsAccess:(p:string)=>pathAccessible(p,{writable:true}),
    gitProbe:async()=>spawnSync('git',['--version'],{stdio:'ignore'}).status===0,
    keyringProbe:()=>keyringAvailable(ctx.repoRoot,deps.keyring),
    profile,
    terminalProbe:async()=>{
      const color=typeof (process.stdout as any).hasColors==='function'?Boolean((process.stdout as any).hasColors()):ctx.io.stdoutIsTTY;
      const capabilities=detectTerminalCapabilities({stdinIsTTY:ctx.io.stdinIsTTY,stdoutIsTTY:ctx.io.stdoutIsTTY,color,env:process.env});
      const session=createTerminalSessionPlan({capabilities,env:process.env,supportsAlternateScreen:true});
      const terminalRows=Number((process.stdout as any).rows??30),terminalColumns=Number((process.stdout as any).columns??100);
      return{state:'healthy',capabilities,session,layout:shellDimensions(terminalRows,terminalColumns),terminal:{rows:terminalRows,columns:terminalColumns,term:process.env.TERM??null}};
    },
    runtimeProbe:async()=>{
      const runtimeFile=join(ctx.repoRoot,'harness-ui','src','session-registry.mjs');
      const layout={runtimeReadable:await pathAccessible(runtimeFile,{writable:false}),projectWritable:await pathAccessible(ctx.projectRoot,{writable:true}),sessionsRoot:await pathAccessible(ctx.paths.sessionsRoot,{writable:true}),configRoot:await pathAccessible(ctx.paths.configRoot,{writable:true}),cacheRoot:await pathAccessible(ctx.paths.cacheRoot,{writable:true})};
      return{state:Object.values(layout).every(Boolean)?'healthy':'degraded',layout,roots:{project:ctx.projectRoot,repo:ctx.repoRoot,sessions:ctx.paths.sessionsRoot,config:ctx.paths.configRoot,cache:ctx.paths.cacheRoot}};
    },
    trustProbe:async()=>{
      try{const snapshot:any=await createTrustAuthority({projectRoot:ctx.projectRoot,trustRoot:ctx.paths.trust.projects}).inspect();return{state:snapshot.trusted?'healthy':'degraded',trusted:snapshot.trusted===true,reason:String(snapshot.reason??'UNKNOWN'),storeSchema:snapshot.storeSchema??null,resources:Array.isArray(snapshot.resources)?snapshot.resources.length:0,nestedRepositories:Array.isArray(snapshot.nestedRepositories)?snapshot.nestedRepositories.length:0,rollbackAvailable:snapshot.rollbackAvailable===true};}
      catch(error){return{state:'unavailable',trusted:false,reason:error instanceof Error?error.message:String(error)};}
    },
    providerProbe:async({active}:{active:boolean})=>{
      let runtimeContext:any=null;
      try{
        runtimeContext=await ctx.createRuntimeContext({projectRoot:ctx.projectRoot,paths:ctx.paths,repoRoot:ctx.repoRoot,model:ctx.invocation.model??'openai:gpt-5-mini',environmentKeys:'consent'});
        const control=runtimeContext?.providerControlPlane;if(!control||typeof control.list!=='function')return{state:'unavailable',profiles:[]};
        const rows:any[]=control.list().slice(0,16);const profiles:any[]=[];let activeCount=0;
        for(const row of rows){
          let current=row;const eligible=row?.runtimeConfigured!==false&&(row?.auth?.required!==true||row?.auth?.usable===true);
          if(active&&eligible&&activeCount<8&&typeof control.probe==='function'){activeCount++;try{current=await control.probe(String(row.id));}catch(error){current={...row,lastHealth:{state:'error',detail:error instanceof Error?error.message:String(error),latencyMs:null,observedAt:Date.now(),httpStatus:null}};}}
          profiles.push(providerView(current));
        }
        return{state:active?'healthy':'unknown',active,profiles};
      }catch(error){return{state:'unavailable',active,profiles:[],detail:error instanceof Error?error.message:String(error)};}
      finally{try{await runtimeContext?.runtime?.close?.();}catch{}}
    },
    brokerProbe:async()=>{
      const result:any=await createProcessTreeEvidenceStore({cacheRoot:ctx.paths.cacheRoot}).read();
      if(!result)return{state:'absent',processTree:{verified:false,source:'none'}};
      return{state:result.verified?'verified':'unverified',processTree:{verified:result.verified===true,source:'cached-host-bound',reason:typeof result.reason==='string'?result.reason:null,scope:result.evidence?.scope??null,observedAtMs:Number.isFinite(result.evidence?.observedAtMs)?Number(result.evidence.observedAtMs):null,durationMs:Number.isFinite(result.evidence?.durationMs)?Number(result.evidence.durationMs):null,signals:result.evidence?.signals??null}};
    },
    contextProbe:async()=>{
      const database=join(ctx.paths.dataRoot,'context','context.sqlite');
      try{const info=await stat(database);if(!info.isFile())return{state:'degraded',database:'not-file',format:'unknown',bytes:info.size};const handle=await open(database,'r');const header=Buffer.alloc(16);let bytesRead=0;try{({bytesRead}=await handle.read(header,0,16,0));}finally{await handle.close();}const sqlite=bytesRead===16&&header.toString('utf8')==='SQLite format 3\u0000';return{state:sqlite?'healthy':'degraded',database:'present',format:sqlite?'sqlite3':'unknown',bytes:info.size};}catch(error:any){if(error?.code==='ENOENT')return{state:'absent',database:'absent',format:null,bytes:0};return{state:'unavailable',database:'unreadable',format:null,bytes:null,detail:error instanceof Error?error.message:String(error)};}
    },
    sessionProbe:async()=>{
      const mod:any=await importTalosModule(ctx.repoRoot,'session-store.mjs');const ids:any[]=await mod.elencaSessioniPersistite({cartellaStore:ctx.paths.sessionsRoot});const limit=64,maxFileBytes=2*1024*1024,maxTotalBytes=8*1024*1024;
      let readable=0,corrupt=0,skipped=0,totalBytes=0;
      for(const id of ids.slice(0,limit)){const file=join(ctx.paths.sessionsRoot,String(id)+'.jsonl');let info;try{info=await stat(file);}catch{skipped++;continue;}if(!info.isFile()||info.size>maxFileBytes||totalBytes+info.size>maxTotalBytes){skipped++;continue;}totalBytes+=info.size;try{const row=await mod.leggiRegistro({cartellaStore:ctx.paths.sessionsRoot,sessionId:id});if(row===null)skipped++;else readable++;}catch{corrupt++;}}
      skipped+=Math.max(0,ids.length-limit);return{state:corrupt?'degraded':'healthy',persisted:ids.length,readable,corrupt,skipped,capped:ids.length>limit||skipped>0,inspectedBytes:totalBytes};
    },
    updateProbe:async()=>({state:typeof (updateCheck as any).verifyReleaseManifestSignature==='function'?'unknown':'degraded',manifestSchema:'talos.cli.release.v1',checksum:typeof (updateCheck as any).verifyDownloadedAsset==='function'?'sha256':'unavailable',signature:typeof (updateCheck as any).verifyReleaseManifestSignature==='function'?'available':'unavailable'}),
    performanceProbe:async()=>currentProcessPerformanceSnapshot(),
  });
  const extra:any[]=[];
  for(const [id,file] of [['talos-runtime',join(ctx.repoRoot,'harness-ui','src','session-registry.mjs')],['project',ctx.projectRoot]] as const){extra.push({id,ok:await pathAccessible(file,{writable:id==='project'})});}
  for(const [id,file] of [['mcp',join(ctx.projectRoot,'.harness-ui-mcp.json')],['hooks',join(ctx.projectRoot,'.harness-ui-hooks.json')]] as const){try{await stat(file);JSON.parse(await readFile(file,'utf8'));extra.push({id,ok:true});}catch(e:any){extra.push({id,ok:e?.code==='ENOENT',detail:e?.code==='ENOENT'?'not configured':'invalid JSON'});}}
  const checks=[...base.checks,...extra];return{...base,ok:checks.every((x:any)=>x.ok),checks,version:CLI_VERSION,platform:platformId(),telemetry:false};
}
const MAX_LOG_FILES=8,MAX_LOG_TAIL_BYTES=32*1024,MAX_LOG_LINE_CHARS=4096;
function boundedLine(value:string){return value.length<=MAX_LOG_LINE_CHARS?value:value.slice(0,MAX_LOG_LINE_CHARS-1)+'…';}
async function readLogs(root:string,tail:number,bounded=false){
  let files:string[]=[];try{files=(await readdir(root)).filter(f=>f.endsWith('.log')).sort();}catch{return[];}
  if(bounded)files=files.slice(-MAX_LOG_FILES);
  const rows=[];
  for(const file of files){
    const target=join(root,file);
    try{
      if(!bounded){const text=await readFile(target,'utf8');const lines=text.split(/\r?\n/u).filter(Boolean).slice(-tail);rows.push({file,lines});continue;}
      const info=await stat(target);if(!info.isFile())continue;
      const bytes=Math.min(info.size,MAX_LOG_TAIL_BYTES),start=Math.max(0,info.size-bytes),buffer=Buffer.alloc(bytes),handle=await open(target,'r');
      try{await handle.read(buffer,0,bytes,start);}finally{await handle.close();}
      let text=buffer.toString('utf8');if(start>0){const cut=text.indexOf('\n');text=cut>=0?text.slice(cut+1):'';}
      const lines=text.split(/\r?\n/u).filter(Boolean).slice(-tail).map(boundedLine);
      rows.push({file,lines,truncated:start>0});
    }catch{continue;}
  }
  return rows;
}
async function diagnosticBundle(ctx:CommandContext,args:string[],deps:SystemCommandDeps={}){
  const out=takeOption(args,'--out');if(!out)throw new Error('DIAGNOSTIC_OUT_REQUIRED');
  if(takeFlag(args,'--include-content'))throw new Error('DIAGNOSTIC_CONTENT_EXPORT_DISABLED');assertNoUnknownOptions(args);
  const doctor=await doctorData(ctx,deps,{profile:false});const config=await loadEffectiveConfig({paths:ctx.paths,projectRoot:ctx.projectRoot});const logs=await readLogs(ctx.paths.logsRoot,200,true);
  const secrets=secretValuesFromEnvironment(process.env);
  const pseudonymizer=createPathPseudonymizer([homedir(),process.cwd(),ctx.projectRoot,ctx.repoRoot,ctx.paths.configRoot,ctx.paths.dataRoot,ctx.paths.cacheRoot,ctx.paths.sessionsRoot,ctx.paths.logsRoot]);
  const safe=(value:unknown)=>pseudonymizer.value(redactObject(value,secrets));
  const entries=[
    {name:'manifest.json',data:JSON.stringify({schema:'talos.cli.diagnostic.v1',createdAt:new Date().toISOString(),version:CLI_VERSION,platform:platformId(),includesContent:false,pathPseudonymized:true,logLimits:{files:MAX_LOG_FILES,tailBytesPerFile:MAX_LOG_TAIL_BYTES,lineChars:MAX_LOG_LINE_CHARS}},null,2)},
    {name:'doctor.json',data:JSON.stringify(safe(doctor),null,2)},
    {name:'config.json',data:JSON.stringify(safe(config.value),null,2)},
    {name:'logs.json',data:JSON.stringify(safe(logs),null,2)},
  ];
  await mkdir(resolve(out,'..'),{recursive:true});await writeStoredZip(resolve(out),entries);
  writeValue(ctx,{ok:true,file:resolve(out),includeContent:false},`Diagnostic bundle: ${resolve(out)}\n`);return 0;
}
async function updateCommand(ctx:CommandContext,args:string[]){if(await hasActiveRuns(ctx.paths))throw Object.assign(new Error('UPDATE_ACTIVE_RUN'),{code:'UPDATE_ACTIVE_RUN'});const checkOnly=takeFlag(args,'--check');const channel=(takeOption(args,'--channel')??process.env.TALOS_CLI_UPDATE_CHANNEL??'stable') as 'stable'|'preview';if(channel!=='stable'&&channel!=='preview')throw new Error('UPDATE_CHANNEL_INVALID');assertNoUnknownOptions(args);const url=process.env.TALOS_CLI_UPDATE_MANIFEST_URL??await discoverGitHubReleaseManifest({channel});const result=await performUpdateCheck({currentVersion:CLI_VERSION,channel,platform:platformId(),manifestUrl:url});if(checkOnly||!result.available){writeValue(ctx,{...result,manifest:undefined},result.available?`Update ${result.version} available\n`:'TALOS CLI is up to date\n');return 0;}if(!result.asset)throw new Error('UPDATE_ASSET_NOT_FOUND');const file=await downloadVerifiedUpdate({asset:result.asset,cacheDir:join(ctx.paths.cacheRoot,'updates')});if(process.platform==='win32'&&result.asset.kind==='installer'){const child=spawn(file,['/S','/UPDATE=1'],{detached:true,stdio:'ignore',windowsHide:true});child.unref();writeValue(ctx,{ok:true,version:result.version,installer:file,launched:true},`Launching TALOS CLI ${result.version} installer\n`);return 0;}writeValue(ctx,{ok:true,version:result.version,file,launched:false},`Verified update downloaded to ${file}; install it manually on this platform\n`);return 0;}
async function initProject(ctx:CommandContext,args:string[]){assertNoUnknownOptions(args);const dir=join(ctx.projectRoot,'.talos-cli');await mkdir(join(dir,'commands'),{recursive:true});await mkdir(join(dir,'extensions'),{recursive:true});const file=join(dir,'config.json');try{await stat(file);}catch{await writeFile(file,'{}\n',{encoding:'utf8',mode:0o600});}writeValue(ctx,{ok:true,directory:dir},`Initialized ${dir}\n`);return 0;}
export async function runSystemCommand(ctx:CommandContext,family:string,args0:string[],deps:SystemCommandDeps={}){const args=[...args0];if(family==='doctor'){const json=takeFlag(args,'--json'),profile=takeFlag(args,'--profile');assertNoUnknownOptions(args);const r=await doctorData(ctx,deps,{profile});if(json||ctx.invocation.outputFormat==='json')ctx.io.writeOut(`${JSON.stringify(r)}\n`);else{ctx.io.writeOut(`TALOS doctor: ${r.ok?'ok':'issues'}${profile?' · profiled':''}\n`);for(const c of r.checks)ctx.io.writeOut(`${c.ok?'OK ':'ERR'} ${c.id}${c.detail?`: ${c.detail}`:''}\n`);for(const [name,section] of Object.entries(r.sections as Record<string,any>))ctx.io.writeOut(`INFO ${name}: ${String(section?.state??'unknown')}\n`);if(r.performance)ctx.io.writeOut(`INFO performance: rss=${r.performance.rssBytes} bytes\n`);}return r.ok?0:70;}if(family==='logs'){const tailRaw=takeOption(args,'--tail')??'100';assertNoUnknownOptions(args);const tail=Number(tailRaw);if(!Number.isSafeInteger(tail)||tail<1||tail>10000)throw new Error('LOG_TAIL_INVALID');const rows=await readLogs(ctx.paths.logsRoot,tail);writeValue(ctx,rows,rows.flatMap(r=>[`== ${r.file} ==`,...r.lines]).join('\n')+(rows.length?'\n':''));return 0;}if(family==='diagnostic'){const op=args.shift();if(op!=='bundle')throw new Error('DIAGNOSTIC_OPERATION_REQUIRED');return diagnosticBundle(ctx,args,deps);}if(family==='update')return updateCommand(ctx,args);if(family==='init')return initProject(ctx,args);throw new Error(`Unsupported system command: ${family}`);}
