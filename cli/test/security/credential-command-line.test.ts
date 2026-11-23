import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import {EventEmitter} from 'node:events';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import {syncBuiltinESMExports} from 'node:module';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {PassThrough} from 'node:stream';
import test from 'node:test';
import {PROBE_ENVIRONMENT_NAMES,createCliExecutionBroker,mxcSandboxedSpawn} from '../../src/security/execution-backends.ts';
import {loadMxcSdk} from '../../src/security/mxc-execution-backend.ts';
import {createBrokeredKernelExecutor} from '../../src/runtime/brokered-executor.ts';

/*
 * B1 slice 19 — KEYS NEVER REACH A COMMAND LINE.
 *
 * Measured at e5d197e7: the process-tree probe handed `process.env` to the MXC SDK, and SDK 0.8.0
 * serialises the whole configuration — every environment variable included — as `--config-base64` on
 * the `wxc-exec.exe` command line, which is what process auditing records.
 *
 * Round 2, after adversarial review: a NAME-SHAPE denylist does not keep secrets off a command line.
 * With the real SDK, 24 of 29 realistic secret-bearing names (DATABASE_URL, SENTRY_DSN, GH_PAT, …) have
 * no credential shape, and their values were decoded out of `--config-base64`; a 15,000-character
 * variable pushed a brokered command towards ENAMETOOLONG. So:
 *  · the probe carries an ALLOWLIST of system variables and nothing else;
 *  · a brokered command carries NO environment on its command line, as before this slice.
 *
 * ⛔ Hermetic by construction: every host variable whose name could hold a secret is removed for the
 *   length of each test and restored afterwards, and only DUMMY values plus a non-secret canary are
 *   planted. No assertion prints an environment: failures list planted NAMES only.
 */
const SHAPED:Record<string,string>={
  OPENROUTER_API_KEY:'dummy-openrouter-slice19',
  ANTHROPIC_API_KEY:'dummy-anthropic-slice19',
  OPENAI_API_KEY:'dummy-openai-slice19',
  GITHUB_TOKEN:'dummy-github-slice19',
  TALOS_HARNESS_UI_TOKEN:'dummy-ui-token-slice19',
  TALOS_HARNESS_RECEIPT_PRIVATE_KEY_B64:'dummy-receipt-slice19',
  AWS_SECRET_ACCESS_KEY:'dummy-aws-slice19',
};
/* The reviewer's list: secrets that carry no credential shape in their NAME. */
const UNSHAPED:Record<string,string>={
  DATABASE_URL:'postgres://dummyuser:dummy-db-pass-slice19@db.invalid/app',
  REDIS_URL:'redis://:dummy-redis-slice19@cache.invalid:6379',
  MONGODB_URI:'mongodb://dummy:dummy-mongo-slice19@mongo.invalid/db',
  CONNECTION_STRING:'Server=sql.invalid;Password=dummy-connection-slice19',
  AZURE_STORAGE_CONNECTION_STRING:'AccountKey=dummy-azure-slice19',
  SENTRY_DSN:'https://dummy-sentry-slice19@sentry.invalid/1',
  GH_PAT:'dummy-gh-pat-slice19',
  MYSQL_PWD:'dummy-mysql-slice19',
  DB_PASS:'dummy-db-pass2-slice19',
  SLACK_WEBHOOK_URL:'https://hooks.slack.invalid/services/dummy-slack-slice19',
  KUBECONFIG:'C:\\dummy\\kubeconfig-slice19',
  HTTPS_PROXY:'http://dummy:dummy-proxy-slice19@proxy.invalid:8080',
  CI_JOB_JWT:'dummy-jwt-slice19',
  GPG_PASSPHRASE:'dummy-gpg-slice19',
  STRIPE_SK:'dummy-stripe-slice19',
  SESSION_COOKIE:'dummy-cookie-slice19',
  GIT_CONFIG_PARAMETERS:"'http.extraheader=AUTHORIZATION: basic dummy-git-header-slice19'",
  TALOS_SLICE19_BIG_BLOB:`dummy-big-slice19-${'x'.repeat(15_000)}`,
};
const PLANTED:Record<string,string>={...SHAPED,...UNSHAPED};
const CANARY_NAME='TALOS_SLICE19_CANARY';
const CANARY_VALUE='canary-not-secret-slice19';
/* Deliberately broader than any product rule: the scrub must not depend on the code under test. */
const HOST_SECRET_SHAPE=/KEY|TOKEN|SECRET|PASSWORD|PASSWD|PASS|PWD|CREDENTIAL|AUTH|PRIVATE|URL|URI|DSN|PAT|JWT|COOKIE|CONNECTION|PROXY|KUBECONFIG|GIT_CONFIG/iu;

async function hermetic<T>(body:(scratch:string)=>Promise<T>):Promise<T>{
  const saved=new Map<string,string>();
  for(const name of Object.keys(process.env)){
    if(!HOST_SECRET_SHAPE.test(name))continue;
    saved.set(name,process.env[name]!);
    delete process.env[name];
  }
  const profile={APPDATA:process.env.APPDATA,LOCALAPPDATA:process.env.LOCALAPPDATA};
  const scratch=await mkdtemp(path.join(tmpdir(),'talos-slice19-cmdline-'));
  await mkdir(path.join(scratch,'appdata'));await mkdir(path.join(scratch,'localappdata'));await mkdir(path.join(scratch,'work'));
  process.env.APPDATA=path.join(scratch,'appdata');
  process.env.LOCALAPPDATA=path.join(scratch,'localappdata');
  Object.assign(process.env,PLANTED,{[CANARY_NAME]:CANARY_VALUE});
  try{return await body(path.join(scratch,'work'));}
  finally{
    for(const name of [...Object.keys(PLANTED),CANARY_NAME])delete process.env[name];
    for(const [name,value] of saved)process.env[name]=value;
    for(const [name,value] of Object.entries(profile)){if(value===undefined)delete process.env[name];else process.env[name]=value;}
    await rm(scratch,{recursive:true,force:true,maxRetries:10,retryDelay:100});
  }
}
const ALL_PLANTED={...PLANTED,[CANARY_NAME]:CANARY_VALUE};
function plantedNamesIn(names:readonly string[]):string[]{return Object.keys(ALL_PLANTED).filter(name=>names.some(candidate=>candidate.toUpperCase()===name.toUpperCase()));}
function plantedValuesIn(text:string):string[]{return Object.entries(ALL_PLANTED).filter(([,value])=>text.includes(value)).map(([name])=>name);}

function silentChild(){
  const child=new EventEmitter() as EventEmitter&{stdout:PassThrough;stderr:PassThrough;pid:number;kill():boolean};
  child.stdout=new PassThrough();child.stderr=new PassThrough();child.pid=4242;child.kill=()=>true;
  queueMicrotask(()=>{child.stdout.end('');child.stderr.end('');child.emit('close',0,null);});
  return child;
}

/*
 * The recording wrapper: the REAL SDK builds and serialises its configuration, and `child_process`
 * records what it would have launched instead of launching it. The SDK's host probes (`dism`,
 * `whoami`, `wxc-exec.exe --probe`) are refused inside the window, so no real process starts.
 */
type Recorded={file:string;args:string[];options:Record<string,unknown>|undefined};
async function recordSpawns(body:()=>Promise<void>):Promise<Recorded[]>{
  const cp=childProcess as unknown as Record<string,unknown>;
  const original={spawn:cp.spawn,execSync:cp.execSync,execFileSync:cp.execFileSync};
  const calls:Recorded[]=[];
  cp.spawn=(file:string,args:readonly string[],options?:Record<string,unknown>)=>{calls.push({file,args:[...args],options});return silentChild();};
  cp.execSync=()=>{throw new Error('host probe refused by the recording wrapper');};
  cp.execFileSync=()=>{throw new Error('host probe refused by the recording wrapper');};
  syncBuiltinESMExports();
  try{await body();}
  finally{Object.assign(cp,original);syncBuiltinESMExports();}
  return calls;
}
function decodeConfig(args:readonly string[]):any{
  const index=args.indexOf('--config-base64');
  assert.ok(index>=0&&index+1<args.length,'the SDK passes its configuration as --config-base64');
  return JSON.parse(Buffer.from(args[index+1]!,'base64').toString('utf8'));
}
function serialisedNames(config:any):string[]{return ((config?.process?.env??[]) as string[]).map(entry=>entry.slice(0,entry.indexOf('=')));}

const windowsOnly=process.platform!=='win32'&&'the MXC SDK resolves wxc-exec.exe only on Windows';
/*
 * The allowlist, as decided. B1 slice 19 decided the first seven; R0 lane S (2026-09-23) added LOCALAPPDATA (without it
 * every sandboxed process dies with WIN32_ERROR 203, microsoft/mxc#1130), PATH (System32 first), PATHEXT and ComSpec
 * (gate E1), APPDATA (npm's prefix becomes `<cwd>\${APPDATA}\npm` without it) and USERPROFILE (git finds no global
 * config without it), each measured in the real container. The expected names are those of it this host defines.
 */
/* 0.6.8 (stress test of 0.6.7, F-E-001): NoDefaultCurrentDirectoryInExePath joins the list (security/exe-search-defence.ts) */
const DECIDED_PROBE_NAMES=['SystemRoot','windir','SystemDrive','LOCALAPPDATA','APPDATA','USERPROFILE','TEMP','TMP','PATH','PATHEXT','ComSpec','NUMBER_OF_PROCESSORS','PROCESSOR_ARCHITECTURE','NoDefaultCurrentDirectoryInExePath'];
/* PATH is always supplied (System32 at least): the hermetic scrub below removes the host's, because `PAT` matches it. */
function definedProbeNames(){return DECIDED_PROBE_NAMES.filter(name=>name==='PATH'||process.env[name]!==undefined).sort();}
/** CreateProcess limits lpCommandLine to 32,767 characters: the documented ceiling, not a measured number. */
const CREATE_PROCESS_COMMAND_LINE_LIMIT=32_767;

test('RED the probe hands the sandbox spawner exactly the decided system variables: no planted secret of any shape, no canary',()=>hermetic(async work=>{
  const seen:Array<{environment:NodeJS.ProcessEnv|undefined}>=[];
  const sdk={
    getPlatformSupport:()=>({isSupported:true,availableMethods:['processcontainer'],isolationTier:'base-container' as const}),
    createConfigFromPolicy:()=>({version:'0.8.0-alpha',process:{commandLine:''}}),
    spawnSandboxFromConfig:(_config:unknown,_options:unknown,_cwd:unknown,environment?:NodeJS.ProcessEnv)=>{seen.push({environment});return silentChild();},
  };
  const handle=await mxcSandboxedSpawn(async()=>sdk as any)({executable:process.execPath,args:['-e','0'],cwd:work,probeDirectory:work});
  await handle.exited;
  assert.equal(seen.length,1);
  const environment=seen[0]!.environment;
  assert.ok(environment,'the probe passes an explicit environment: without one the SDK leaves the sandboxed child to inherit');
  assert.deepEqual(plantedNamesIn(Object.keys(environment)),[]);
  assert.deepEqual(plantedValuesIn(JSON.stringify(environment)),[]);
  assert.deepEqual(Object.keys(environment).sort(),definedProbeNames());
  /* PATH is the host's, reordered with System32 first and relative entries dropped: checked in execution-backends.test.ts. */
  for(const name of Object.keys(environment))if(name!=='PATH')assert.equal(environment[name],process.env[name],`${name} arrives intact`);
  assert.deepEqual([...PROBE_ENVIRONMENT_NAMES].sort(),[...DECIDED_PROBE_NAMES].sort());
}));

test('RED nothing the real SDK serialises onto the wxc-exec command line for the probe carries a planted variable or the canary',{skip:windowsOnly},()=>hermetic(async work=>{
  const calls=await recordSpawns(async()=>{
    const handle=await mxcSandboxedSpawn(loadMxcSdk)({executable:process.execPath,args:['-e','0'],cwd:work,probeDirectory:work});
    await handle.exited;
  });
  assert.equal(calls.length,1,'the probe launches exactly one executor');
  const call=calls[0]!;
  assert.equal(path.basename(call.file).toLowerCase(),'wxc-exec.exe');
  assert.deepEqual(plantedValuesIn(call.args.join(' ')),[]);
  const config=decodeConfig(call.args);
  assert.deepEqual(plantedValuesIn(JSON.stringify(config)),[],'no planted value inside the decoded --config-base64');
  assert.deepEqual(plantedNamesIn(serialisedNames(config)),[]);
  assert.deepEqual(serialisedNames(config).sort(),definedProbeNames());
}));

test('RED a brokered request carries no environment of its own',()=>hermetic(async work=>{
  const seen:any[]=[];
  const evidence={requestedEnforcement:'restricted-process',appliedEnforcement:'windows-sandbox',backend:'fake',appContainer:true,filesystem:'bfs',network:'deny',processTree:'job-object-kill-on-close',sandboxSpecVersion:'0.1.0'};
  const broker={async execute(request:any){seen.push(request);return{exitCode:0,stdout:'',stderr:'',evidence};}};
  const kernel=async()=>({uscitaUtile:(text:string)=>text,staccaCartellaFinale:(text:string)=>({testo:text,cartella:null}),codaCheStampaLaCartella:()=>'',eseguiComandoSandboxato:async()=>{throw new Error('the fallback must not run');}});
  const run=createBrokeredKernelExecutor({kernel:kernel as any,broker:broker as any,platform:'win32'});
  await run('echo hello',work,{dove:'windows'});
  assert.equal(seen.length,1);
  assert.equal(Object.hasOwn(seen[0],'environment'),false,'the environment stays off the brokered command line until TALOS spawns wxc-exec itself');
}));

test('RED a brokered command line through the real broker, MXC backend and SDK is bounded and independent of the environment',{skip:windowsOnly},async()=>{
  const real=await loadMxcSdk();
  const sdk={...real,getPlatformSupport:()=>({isSupported:true,availableMethods:['processcontainer'],isolationTier:'base-container' as const})};
  const verified={verified:true,evidence:{schema:'talos.cli.process-tree-evidence.v1',scope:'createprocess-descendant',signals:{heartbeat:'gone',signalZero:'gone',enumeration:'gone'},executorPid:1,descendantPid:2,observedAtMs:1,durationMs:1,cleanup:{descendantKilled:false,executorKilled:true,directoryRemoved:true}}};
  const kernel=async()=>({uscitaUtile:(text:string)=>text,staccaCartellaFinale:(text:string)=>({testo:text,cartella:null}),codaCheStampaLaCartella:()=>'',eseguiComandoSandboxato:async()=>{throw new Error('the fallback must not run');}});
  async function brokeredCommandLine(work:string){
    const broker=createCliExecutionBroker({paths:{cacheRoot:work},platform:'win32',sdk,store:{read:async()=>null,write:async()=>{}},probe:async()=>verified as any});
    const run=createBrokeredKernelExecutor({kernel:kernel as any,broker,platform:'win32',newId:()=>'slice19-fixed-id'});
    let enforcement='';
    const calls=await recordSpawns(async()=>{enforcement=(await run('echo hello',work,{dove:'windows'})).enforcement;});
    assert.match(enforcement,/^⛉ sandbox \(microsoft-mxc-0\.8\.0\)/u,'the command went through the sandbox branch, not the fallback');
    assert.equal(calls.length,1);
    return calls[0]!.args;
  }
  const root=await mkdtemp(path.join(tmpdir(),'talos-slice19-bound-'));
  try{
    const work=path.join(root,'work');await mkdir(work);
    /* The same command in the same folder, once with the planted variables and once without them. */
    /* The expected names are read INSIDE the same hermetic window: its scrub removes PATHEXT too (`PAT`). */
    let expectedNames:string[]=[];
    const planted=await hermetic(async()=>{expectedNames=definedProbeNames();return brokeredCommandLine(work);});
    const clean=await hermetic(async()=>{
      for(const name of [...Object.keys(PLANTED),CANARY_NAME])delete process.env[name];
      return brokeredCommandLine(work);
    });
    assert.deepEqual(plantedValuesIn(planted.join(' ')),[]);
    const config=decodeConfig(planted);
    assert.deepEqual(plantedValuesIn(JSON.stringify(config)),[]);
    assert.deepEqual(serialisedNames(config).sort(),expectedNames,'a brokered command carries the allowlist and nothing else: never the backend default, which is the user profile block with secret-shaped names in it (measured 2026-09-23)');
    assert.equal(planted.join(' ').length,clean.join(' ').length,'the environment has no influence on the command-line length');
    /* R0 lane S: the allowlisted profile folders now ride on the line, and each hermetic() call makes its own scratch
       profile; masking exactly those two values, nothing else in the environment influences the command line. */
    const masked=(args:string[])=>{const decoded=decodeConfig(args);decoded.process.env=decoded.process.env.map((entry:string)=>/^(LOCALAPPDATA|APPDATA)=/u.test(entry)?entry.slice(0,entry.indexOf('=')+1):entry);return[...args.slice(0,args.indexOf('--config-base64')+1),decoded,...args.slice(args.indexOf('--config-base64')+2)];};
    assert.deepEqual(masked(planted),masked(clean),'the environment has no influence on the command line beyond the allowlisted profile folders');
    assert.ok(planted.join(' ').length<CREATE_PROCESS_COMMAND_LINE_LIMIT);
  }finally{await rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
});
