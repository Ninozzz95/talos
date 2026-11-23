import {access,mkdir,open,readdir,readFile,stat,writeFile} from 'node:fs/promises';import {constants} from 'node:fs';import {join,resolve} from 'node:path';import {homedir} from 'node:os';import {spawn,spawnSync} from 'node:child_process';
import {PROJECT_CONFIG_FILES} from '../security/project-config-positions.ts';import type {CommandContext} from './context.ts';import {projectSettingsReadable,runtimeContextInAnyFolder} from './any-folder.ts';import {assertNoUnknownOptions,takeFlag,takeOption,writeValue} from './context.ts';import {doctorVerdict,runDoctor,turnReadiness} from '../diagnostics/doctor.ts';import {createPathPseudonymizer,redactObject,secretValuesFromEnvironment} from '../diagnostics/redact.ts';import {writeStoredZip} from '../diagnostics/zip.ts';import {loadEffectiveConfig} from '../config/load.ts';import {CLI_VERSION} from '../version.ts';import {performUpdateCheck,downloadVerifiedUpdate,discoverGitHubReleaseManifest} from '../update/run.ts';import {checkNpmRegistry,installedWithNpm,packageRootOf} from '../update/npm.ts';import {pathInstallationsCheck,talosInstallationsInPath} from '../update/path-installations.ts';import {describeKeyringProbeFailure,describeKeyringProblem,diagnoseKeyringProbe,systemKeyringModuleLoads,type KeyringLoaderDeps} from '../provider/system-keyring.ts';import {credentialStoreName,credentialStoreSourceText,isTestProfile,openCredentialStore,type OpenedCredentialStore} from '../provider/store.ts';import {MODELS_DEV_CACHE_HOURS,MODELS_DEV_URL,modelsDevSwitch} from '../runtime/model-profile.ts';import {providerOfModel} from '../provider/environment-keys.ts';import {t} from '../i18n/index.ts';import {hasActiveRuns} from '../runtime/active-run.ts';import {importTalosModule} from '../runtime/repo.ts';import {detectTerminalCapabilities} from '../tui/terminal-capabilities.ts';import {createTerminalSessionPlan} from '../tui/terminal-session.ts';import {shellDimensions} from '../tui/shell-layout.ts';import {currentProcessPerformanceSnapshot} from '../tui/metrics.ts';import {createTrustAuthority} from '../security/trust-authority.ts';import {createProcessTreeEvidenceStore} from '../security/process-tree-evidence-store.ts';import * as updateCheck from '../update/check.ts';import {sandboxRealpathPreloadPath} from '../security/sandbox-node-realpath.ts';

export async function pathAccessible(p:string,{writable=true,accessImpl=access}:{writable?:boolean;accessImpl?:typeof access}={}){try{await accessImpl(p,writable?constants.R_OK|constants.W_OK:constants.R_OK);return true;}catch{return false;}}
/** Injectable for tests only: the keyring loader never reaches the real module from a test layout. */
export type SystemCommandDeps={keyring?:KeyringLoaderDeps;
  /* R7: `talos update` of an npm install asks the registry (update/npm.ts); tests pass the package folder and a fake fetch. */
  update?:{packageRoot?:string;fetchFn?:typeof fetch}};
/**
 * B1 slice 19: a failing keyring check THROWS its reason, and `runDoctor` prints it as the check's detail — never a bare `ERR keyring`.
 * R2 (gate E13): the store is the one the resolver chose (`provider/store.ts`), the same the composition opens; a memory store is
 * probed in memory and the native module is never touched, and a test profile's refusal is the check's reason.
 */
type DoctorStore={opened:OpenedCredentialStore|null;refusal:unknown};
function doctorStore(ctx:CommandContext,config:any,deps:KeyringLoaderDeps|undefined):DoctorStore{
  try{return{opened:openCredentialStore({repoRoot:ctx.repoRoot,scope:ctx.paths.dataRoot,env:process.env,config,...(deps?{loader:deps}:{})}),refusal:null};}
  catch(error){return{opened:null,refusal:error};}
}
async function keyringAvailable(store:DoctorStore){
  if(!store.opened)throw store.refusal;
  if(store.opened.problem)throw new Error(describeKeyringProblem(store.opened.problem));
  const outcome=await diagnoseKeyringProbe(store.opened.keyring!);if(!outcome.ok)throw new Error(describeKeyringProbeFailure(outcome));return true;
}
/** R2 (gate E13, Q-R2-9: wording only, `ok` stays R4's): which store is active, and whether this doctor run loaded the native module. */
function credentialsSection(store:DoctorStore,loadsBefore:number){
  const nativeModuleLoaded=systemKeyringModuleLoads()>loadsBefore;
  if(!store.opened){const error:any=store.refusal;return{state:'unavailable',store:error?.details?.store??null,source:error?.details?.source??null,nativeModuleLoaded,code:String(error?.code??'CREDENTIAL_STORE_UNAVAILABLE'),detail:error instanceof Error?error.message:String(error)};}
  const {kind,source,problem}=store.opened;
  return problem?{state:'unavailable',store:kind,source,nativeModuleLoaded,detail:describeKeyringProblem(problem)}:{state:'healthy',store:kind,source,nativeModuleLoaded};
}
/* R4 Q-R4-15 (a): the system store is one per operating-system user, so every TALOS of that user reads the same keys; the line
   says so. The JSON section is unchanged (R2 E13 pins it). */
/* R5b: whether models.dev is used, why not, and how to change it (the one outbound request for sizes and prices, gate E7). */
export function catalogLine(section:any):string{
  if(section?.state==='on')return t('firstrun.doctor.catalogOn',{source:String(section.source??''),hours:Number(section.cacheHours??0)});
  return t(section?.reason==='environment'?'firstrun.doctor.catalogOffEnvironment':section?.reason==='test'?'firstrun.doctor.catalogOffTest':'firstrun.doctor.catalogOffConfig');
}
export function credentialsLine(section:any,platform:NodeJS.Platform=process.platform):string{
  if(section?.state!=='healthy'&&section?.detail)return t('store.refused.line',{message:String(section.detail)});
  const memory=section?.store==='memory';
  const line=t('store.line',{store:credentialStoreName(memory?'memory':'system',platform),source:credentialStoreSourceText({source:section?.source})});
  return memory?line:`${line} — ${t(platform==='win32'?'store.shared.win32':platform==='darwin'?'store.shared.darwin':'store.shared.other')}`;
}
/** The readiness of the provider of the model a run would use: the one sentence a person acts on (E8 for a missing key). */
function activeModelReadiness(control:any,model:string|null){
  const provider=model?providerOfModel(model):null;if(!provider||typeof control?.readiness!=='function')return null;
  try{const decision=control.readiness(provider);return{model,provider,ready:decision?.ready===true,code:decision?.ready?null:String(decision?.code??''),message:decision?.ready?null:String(decision?.message??'')};}
  catch{return null;}
}
function platformId(){return `${process.platform}-${process.arch}`;}
function providerView(row:any){return{id:String(row?.id??''),label:String(row?.label??row?.id??''),auth:{required:row?.auth?.required===true,source:String(row?.auth?.source??'missing'),configured:row?.auth?.configured===true,usable:row?.auth?.usable===true},endpoint:{host:typeof row?.endpoint?.host==='string'?row.endpoint.host:null,configured:row?.endpoint?.configured===true,valid:row?.endpoint?.valid===true},runtimeConfigured:row?.runtimeConfigured!==false,local:row?.local===true,cooldown:{active:row?.cooldown?.active===true,cause:typeof row?.cooldown?.cause==='string'?row.cooldown.cause:null,until:Number.isFinite(row?.cooldown?.until)?Number(row.cooldown.until):null},lastHealth:{state:String(row?.lastHealth?.state??'unknown'),latencyMs:Number.isFinite(row?.lastHealth?.latencyMs)?Number(row.lastHealth.latencyMs):null,observedAt:Number.isFinite(row?.lastHealth?.observedAt)?Number(row.lastHealth.observedAt):null,httpStatus:Number.isFinite(row?.lastHealth?.httpStatus)?Number(row.lastHealth.httpStatus):null},ready:row?.ready===true};}
async function doctorData(ctx:CommandContext,deps:SystemCommandDeps={},options:{profile?:boolean}={}){
  const profile=options.profile===true;const loadsBefore=systemKeyringModuleLoads();
  /* judge v1579 point 3: a folder that is not trusted now gives doctor none of its settings (any-folder.ts projectSettingsReadable) */
  const projectTrusted=await projectSettingsReadable(ctx);
  let config:any=null;try{config=(await loadEffectiveConfig({paths:ctx.paths,projectRoot:ctx.projectRoot,projectTrusted})).value;}catch{config=null;}
  const store=doctorStore(ctx,config,deps.keyring);
  const activeModel=ctx.invocation.model??(typeof config?.model==='string'?config.model:null);
  const base=await runDoctor({
    paths:ctx.paths,
    fsAccess:(p:string)=>pathAccessible(p,{writable:true}),
    gitProbe:async()=>spawnSync('git',['--version'],{stdio:'ignore'}).status===0,
    keyringProbe:()=>keyringAvailable(store),
    credentialsProbe:async()=>credentialsSection(store,loadsBefore),
    catalogProbe:async()=>{const decided=modelsDevSwitch({env:process.env,config,testProfile:isTestProfile(process.env)});return{state:decided.enabled?'on':'off',reason:decided.reason,source:MODELS_DEV_URL,cacheHours:MODELS_DEV_CACHE_HOURS};},
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
        /* judge v1534 point 2: doctor reads; in a folder nobody decided it leaves the project settings out and says so (any-folder.ts) */runtimeContext=await runtimeContextInAnyFolder(ctx,{projectRoot:ctx.projectRoot,paths:ctx.paths,repoRoot:ctx.repoRoot,model:ctx.invocation.model??'openai:gpt-5-mini',environmentKeys:'consent'});
        const control=runtimeContext?.providerControlPlane;
        /* R4 Q-R4-14: whether a turn could run now, asked the way a send asks it; the chosen local engine must answer. */
        const turn=await turnReadiness({catalog:runtimeContext?.tuiCatalog,control,model:activeModel});
        if(!control||typeof control.list!=='function')return{state:'unavailable',profiles:[],turn};
        const rows:any[]=control.list().slice(0,16);const profiles:any[]=[];let activeCount=0;
        for(const row of rows){
          let current=row;const eligible=row?.runtimeConfigured!==false&&(row?.auth?.required!==true||row?.auth?.usable===true);
          if(active&&eligible&&activeCount<8&&typeof control.probe==='function'){activeCount++;try{current=await control.probe(String(row.id));}catch(error){current={...row,lastHealth:{state:'error',detail:error instanceof Error?error.message:String(error),latencyMs:null,observedAt:Date.now(),httpStatus:null}};}}
          profiles.push(providerView(current));
        }
        const readiness=activeModelReadiness(control,activeModel);
        return{state:active?'healthy':'unknown',active,profiles,...(readiness?{activeModel:readiness}:{}),turn};
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
  /* F-H-001: both places the kernel reads (`.talos/…` first, then the older name); one row per kind, as before. */
  for(const [id,files] of [['mcp',PROJECT_CONFIG_FILES.mcp],['hooks',PROJECT_CONFIG_FILES.hooks]] as const){
   let found=0,invalid:string|null=null;
   for(const relative of files){const file=join(ctx.projectRoot,relative);try{await stat(file);found+=1;JSON.parse(await readFile(file,'utf8'));}catch(e:any){if(e?.code!=='ENOENT'&&!invalid)invalid=relative;}}
   extra.push(invalid?{id,ok:false,detail:`invalid JSON (${invalid})`}:found?{id,ok:true}:{id,ok:true,detail:'not configured'});
  }
  /* B14 (owner's second machine, 09/10/2026): an older talos first in PATH, or a newer one hidden behind it, is said here. */
  try{const runningRoot=deps.update?.packageRoot??packageRootOf();/* an npm install only: a checkout or the Windows installer is not what npm puts in PATH */if(installedWithNpm(runningRoot)){const row=pathInstallationsCheck(talosInstallationsInPath({runningRoot}),CLI_VERSION);if(row)extra.push(row);}}catch{/* PATH unreadable: no row */}
  const checks=[...base.checks,...extra];const ok=checks.every((x:any)=>x.ok);
  /* R4 Q-R4-14 (a): `ok` keeps its meaning; `ready`, `status` and `reasons` are added. */
  const turn=(base.sections as any)?.providers?.turn??{ready:false,reasons:[{code:'RUNTIME_NOT_AVAILABLE',message:t('firstrun.doctor.unknown')}]};
  const verdict=doctorVerdict({ok,checks,turn});
  return{...base,ok,ready:verdict.ready,status:verdict.status,reasons:verdict.reasons,checks,version:CLI_VERSION,platform:platformId(),telemetry:false};
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
async function sessionBundleEntry(ctx:CommandContext,reference:string,secrets:readonly string[],pseudonymizer:{value:(input:unknown)=>unknown}){
  const {readSessionPayloadForBundle}=await import('./session-cli.ts');const {buildSessionBundleEntry}=await import('../diagnostics/session-bundle.ts');
  const {sessionId,payload}=await readSessionPayloadForBundle(ctx,reference);
  return buildSessionBundleEntry({sessionId,payload,secrets,pseudonymize:input=>pseudonymizer.value(input)});
}
/* What the person is told, in plain words, about what is in the file and what is NOT masked (Hermes' debug share warns the same way: secrets are masked, personal data is not). */
function sessionBundleNotice(summary:{sessionId:string;kept:number;events:number;truncated:boolean;omitted:number}):string{
  return [t('common.diagnostic.sessionIncluded',{session:summary.sessionId,kept:summary.kept,events:summary.events}),...(summary.truncated?[t('common.diagnostic.sessionOmitted',{omitted:summary.omitted})]:[]),t('common.diagnostic.sessionMasked')].join(' ')+'\n';
}
async function diagnosticBundle(ctx:CommandContext,args:string[],deps:SystemCommandDeps={}){
  const out=takeOption(args,'--out');if(!out)throw new Error('DIAGNOSTIC_OUT_REQUIRED');
  if(takeFlag(args,'--include-content'))throw new Error('DIAGNOSTIC_CONTENT_EXPORT_DISABLED');const sessionReference=takeOption(args,'--session');assertNoUnknownOptions(args);
  const doctor=await doctorData(ctx,deps,{profile:false});const config=await loadEffectiveConfig({paths:ctx.paths,projectRoot:ctx.projectRoot,projectTrusted:await projectSettingsReadable(ctx)});const logs=await readLogs(ctx.paths.logsRoot,200,true);
  const secrets=secretValuesFromEnvironment(process.env);
  const pseudonymizer=createPathPseudonymizer([homedir(),process.cwd(),ctx.projectRoot,ctx.repoRoot,ctx.paths.configRoot,ctx.paths.dataRoot,ctx.paths.cacheRoot,ctx.paths.sessionsRoot,ctx.paths.logsRoot]);
  const safe=(value:unknown)=>pseudonymizer.value(redactObject(value,secrets));
  /* Opt-in (owner 08/10/2026): ONE session's conversation, redacted and bounded, or nothing. A redaction that cannot be proved aborts before any file is written. */
  const session=sessionReference?await sessionBundleEntry(ctx,sessionReference,secrets,pseudonymizer):null;
  const entries=[
    {name:'manifest.json',data:JSON.stringify({schema:'talos.cli.diagnostic.v1',createdAt:new Date().toISOString(),version:CLI_VERSION,platform:platformId(),includesContent:session!==null,pathPseudonymized:true,...(session?{sessions:[session.summary],redaction:{failClosed:true,environmentSecretValues:secrets.length,paths:'pseudonymized'}}:{}),logLimits:{files:MAX_LOG_FILES,tailBytesPerFile:MAX_LOG_TAIL_BYTES,lineChars:MAX_LOG_LINE_CHARS}},null,2)},
    {name:'doctor.json',data:JSON.stringify(safe(doctor),null,2)},
    {name:'config.json',data:JSON.stringify(safe(config.value),null,2)},
    {name:'logs.json',data:JSON.stringify(safe(logs),null,2)},
    ...(session?[{name:session.name,data:session.data}]:[]),
  ];
  await mkdir(resolve(out,'..'),{recursive:true});await writeStoredZip(resolve(out),entries);
  writeValue(ctx,{ok:true,file:resolve(out),includeContent:session!==null,...(session?{session:session.summary}:{})},`Diagnostic bundle: ${resolve(out)}\n${session?sessionBundleNotice(session.summary):''}`);return 0;
}
async function updateCommand(ctx:CommandContext,args:string[],deps:SystemCommandDeps={}){if(await hasActiveRuns(ctx.paths))throw Object.assign(new Error('UPDATE_ACTIVE_RUN'),{code:'UPDATE_ACTIVE_RUN'});const checkOnly=takeFlag(args,'--check');const channel=(takeOption(args,'--channel')??process.env.TALOS_CLI_UPDATE_CHANNEL??'stable') as 'stable'|'preview';if(channel!=='stable'&&channel!=='preview')throw new Error('UPDATE_CHANNEL_INVALID');assertNoUnknownOptions(args);
  /* R7 (owner 2026-09-25): an npm install asks the registry and says the npm command; nothing is downloaded or changed. */
  if(installedWithNpm(deps.update?.packageRoot)){const npm=await checkNpmRegistry({currentVersion:CLI_VERSION,channel,...(deps.update?.fetchFn?{fetchFn:deps.update.fetchFn}:{})});writeValue(ctx,npm,`${npm.available?t('common.update.npmAvailable',{version:npm.version,current:npm.currentVersion,command:npm.command}):t('common.update.upToDate')}\n`);return 0;}
  const url=process.env.TALOS_CLI_UPDATE_MANIFEST_URL??await discoverGitHubReleaseManifest({channel});const result=await performUpdateCheck({currentVersion:CLI_VERSION,channel,platform:platformId(),manifestUrl:url});if(checkOnly||!result.available){writeValue(ctx,{...result,manifest:undefined},result.available?`Update ${result.version} available\n`:'TALOS CLI is up to date\n');return 0;}if(!result.asset)throw new Error('UPDATE_ASSET_NOT_FOUND');const file=await downloadVerifiedUpdate({asset:result.asset,cacheDir:join(ctx.paths.cacheRoot,'updates')});if(process.platform==='win32'&&result.asset.kind==='installer'){const child=spawn(file,['/S','/UPDATE=1'],{detached:true,stdio:'ignore',windowsHide:true});child.unref();writeValue(ctx,{ok:true,version:result.version,installer:file,launched:true},`Launching TALOS CLI ${result.version} installer\n`);return 0;}writeValue(ctx,{ok:true,version:result.version,file,launched:false},`Verified update downloaded to ${file}; install it manually on this platform\n`);return 0;}
async function initProject(ctx:CommandContext,args:string[]){assertNoUnknownOptions(args);const dir=join(ctx.projectRoot,'.talos-cli');await mkdir(join(dir,'commands'),{recursive:true});await mkdir(join(dir,'extensions'),{recursive:true});const file=join(dir,'config.json');try{await stat(file);}catch{await writeFile(file,'{}\n',{encoding:'utf8',mode:0o600});}writeValue(ctx,{ok:true,directory:dir},`Initialized ${dir}\n`);return 0;}
export async function runSystemCommand(ctx:CommandContext,family:string,args0:string[],deps:SystemCommandDeps={}){const args=[...args0];if(family==='doctor'){const json=takeFlag(args,'--json'),profile=takeFlag(args,'--profile');assertNoUnknownOptions(args);const r=await doctorData(ctx,deps,{profile});if(json||ctx.invocation.outputFormat==='json')ctx.io.writeOut(`${JSON.stringify(r)}\n`);else{const verdict=doctorVerdict({ok:r.ok,checks:r.checks,turn:{ready:r.ready,reasons:r.reasons}});ctx.io.writeOut(`${verdict.headline}${profile?' · profiled':''}\n`);for(const c of r.checks)ctx.io.writeOut(`${c.ok?'OK ':'ERR'} ${c.id}${c.detail?`: ${c.detail}`:''}\n`);for(const [name,section] of Object.entries(r.sections as Record<string,any>))ctx.io.writeOut(`INFO ${name}: ${name==='credentials'?credentialsLine(section):name==='catalog'?catalogLine(section):String(section?.state??'unknown')}\n`);const readiness=(r.sections as any).providers?.activeModel;if(readiness&&!readiness.ready&&readiness.message)ctx.io.writeOut(`INFO provider: ${readiness.message}\n`);if(r.performance)ctx.io.writeOut(`INFO performance: rss=${r.performance.rssBytes} bytes\n`);/* F-E-001 (owner 11/10/2026): the realpath fallback given to Node programs in the sandbox is declared */if(process.platform==='win32')ctx.io.writeOut(`INFO ${t('screen.doctor.sandboxNode',{file:sandboxRealpathPreloadPath(ctx.paths.cacheRoot)})}\n`);}return doctorVerdict({ok:r.ok,checks:r.checks,turn:{ready:r.ready,reasons:r.reasons}}).exitCode;}if(family==='logs'){const tailRaw=takeOption(args,'--tail')??'100';assertNoUnknownOptions(args);const tail=Number(tailRaw);if(!Number.isSafeInteger(tail)||tail<1||tail>10000)throw new Error('LOG_TAIL_INVALID');const rows=await readLogs(ctx.paths.logsRoot,tail);writeValue(ctx,rows,rows.flatMap(r=>[`== ${r.file} ==`,...r.lines]).join('\n')+(rows.length?'\n':''));return 0;}if(family==='diagnostic'){const op=args.shift();if(op!=='bundle')throw new Error('DIAGNOSTIC_OPERATION_REQUIRED');return diagnosticBundle(ctx,args,deps);}if(family==='update')return updateCommand(ctx,args,deps);if(family==='init')return initProject(ctx,args);throw new Error(`Unsupported system command: ${family}`);}
