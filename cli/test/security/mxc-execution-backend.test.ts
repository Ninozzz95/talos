import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PassThrough} from 'node:stream';
import test from 'node:test';
import {createWindowsSandboxPolicy,type ExecutionRequest} from '../../src/security/execution-broker.ts';
import {createMxcExecutionBackend,type MxcSdk} from '../../src/security/mxc-execution-backend.ts';
import type {ProcessTreeProbeResult} from '../../src/security/process-tree-probe.ts';

/**
 * The seam is a measurement, not a boolean. `async()=>true` no longer compiles here on purpose:
 * a stub that can only answer yes measures nothing.
 */
function probe(verified=true):ProcessTreeProbeResult{
  return{
    verified,
    ...(verified?{}:{reason:'PROCESS_TREE_PROBE_DESCENDANT_SURVIVED'}),
    evidence:{
      schema:'talos.cli.process-tree-evidence.v1',
      scope:'createprocess-descendant',
      signals:verified?{heartbeat:'gone',signalZero:'gone',enumeration:'gone'}:{heartbeat:'alive',signalZero:'alive',enumeration:'alive'},
      executorPid:9001,descendantPid:9002,observedAtMs:1,durationMs:2,
      cleanup:{descendantKilled:!verified,executorKilled:true,directoryRemoved:true}
    }
  };
}

type FakeChild=EventEmitter&{stdout:PassThrough;stderr:PassThrough;killCalls:number;kill():boolean};

function child(run:(child:FakeChild)=>void):FakeChild{
  const value=new EventEmitter() as FakeChild;
  value.stdout=new PassThrough();value.stderr=new PassThrough();value.killCalls=0;
  value.kill=()=>{value.killCalls++;return true;};
  queueMicrotask(()=>run(value));
  return value;
}

function supportedSdk(spawn:(config:any,options:any,cwd?:string,environment?:NodeJS.ProcessEnv)=>FakeChild){
  const calls:{policy?:any;containment?:string;name?:string;config?:any;options?:any;cwd?:string;environment?:NodeJS.ProcessEnv}={};
  const sdk={
    getPlatformSupport:()=>({isSupported:true,availableMethods:['processcontainer'],isolationTier:'base-container' as const}),
    createConfigFromPolicy:(policy:any,containment?:string,name?:string)=>{calls.policy=policy;calls.containment=containment;calls.name=name;return{version:policy.version,process:{commandLine:''}};},
    spawnSandboxFromConfig:(config:any,options:any,cwd?:string,environment?:NodeJS.ProcessEnv)=>{Object.assign(calls,{config,options,cwd,environment});return spawn(config,options,cwd,environment);}
  } as MxcSdk;
  return{sdk,calls};
}

async function input(timeoutMs=5000){
  const root=await mkdtemp(join(tmpdir(),'talos-mxc-'));const workspace=join(root,'workspace');const sdkRoot=join(root,'sdk');await mkdir(workspace);await mkdir(sdkRoot);
  const request:ExecutionRequest={id:'run-mxc',executable:'C:\\Program Files\\Node JS\\node.exe',args:['-e','console.log("a b")','trailing\\'],cwd:workspace,readWritePaths:[workspace],readOnlyPaths:[sdkRoot],network:'deny',requiredEnforcement:'windows-sandbox',timeoutMs,environment:{TALOS_TEST:'yes'}};
  return{request,windowsSandboxPolicy:await createWindowsSandboxPolicy(request)};
}

test('MXC dependency is exact-pinned with the reviewed registry integrity',async()=>{
  const packageJson=JSON.parse(await readFile(new URL('../../package.json',import.meta.url),'utf8'));
  const lock=JSON.parse(await readFile(new URL('../../package-lock.json',import.meta.url),'utf8'));
  /* Installation (owner 02/10): a build dependency now, copied into the Windows platform packages (scripts/pack-platforms.mjs);
     the decision is the reviewed version and integrity, not the section */
  assert.equal(packageJson.devDependencies['@microsoft/mxc-sdk'],'0.8.0');assert.equal(packageJson.dependencies['@microsoft/mxc-sdk'],undefined);
  assert.equal(lock.packages['node_modules/@microsoft/mxc-sdk'].version,'0.8.0');
  assert.equal(lock.packages['node_modules/@microsoft/mxc-sdk'].integrity,'sha512-pnf5QsASwp+qtRi5uth2GDjwuyG0rHWRpxCf3RbAjQ4wDTNfBX/9l0A+RVZspU2agpF3/11uWB1JisIS7WrNYg==');
});

test('unsupported or unverified hosts remain unavailable',async()=>{
  const unsupported={getPlatformSupport:()=>({isSupported:false,availableMethods:[],reason:'unsupported'}),createConfigFromPolicy:()=>({}),spawnSandboxFromConfig:()=>{throw new Error('must not spawn');}} as unknown as MxcSdk;
  assert.equal((await createMxcExecutionBackend({sdk:unsupported,platform:'win32',verifyProcessTreeKillOnClose:async()=>probe()}).available()).available,false);
  const {sdk}=supportedSdk(()=>child(()=>{}));
  assert.equal((await createMxcExecutionBackend({sdk,platform:'win32'}).available()).available,false);
  assert.equal((await createMxcExecutionBackend({sdk,platform:'linux',verifyProcessTreeKillOnClose:async()=>probe()}).available()).available,false);
});

test('base-container adapter emits schema 0.8 policy, canonical grants, deny network, and pipe mode',async()=>{
  const {sdk,calls}=supportedSdk(()=>child(value=>{value.stdout.end('ok');value.stderr.end('note');value.emit('close',0,null);}));
  const backend=createMxcExecutionBackend({sdk,platform:'win32',verifyProcessTreeKillOnClose:async()=>probe()});
  const executionInput=await input();
  const result=await backend.execute(executionInput);
  assert.equal(calls.policy.version,'0.8.0-alpha');
  assert.deepEqual(calls.policy.filesystem.readwritePaths,executionInput.windowsSandboxPolicy.fsReadWrite);
  assert.deepEqual(calls.policy.filesystem.readonlyPaths,executionInput.windowsSandboxPolicy.fsReadOnly);
  assert.deepEqual(calls.policy.network,{egress:{default:'deny'},ingress:{default:'deny',hostLoopback:'deny'}});
  assert.equal(calls.containment,'process');
  assert.equal(calls.options.usePty,false);
  assert.equal(calls.options.experimental,true);
  assert.equal(calls.cwd,executionInput.request.cwd);
  assert.equal(calls.environment?.TALOS_TEST,'yes');
  assert.equal(calls.config.process.commandLine,'"C:\\Program Files\\Node JS\\node.exe" -e "console.log(\\"a b\\")" trailing\\');
  /* F-021 (owner 03/10, «Banner solo misurato»): no boundary measured ⇒ no AppContainer claim (it was the constant `true`) */
  assert.deepEqual(result,{exitCode:0,stdout:'ok',stderr:'note',applied:{enforcement:'windows-sandbox',appContainer:false,filesystem:'bfs',network:'deny',processTree:'job-object-kill-on-close',processTreeEvidence:probe().evidence,sandboxSpecVersion:'0.1.0'}});
});

test('F-021: the applied evidence carries the measured boundary, and AppContainer only when the token had its SID',async()=>{
  for(const appContainer of [false,true]){
    const boundary={appContainer,integrity:'low' as const,writesOutside:'blocked' as const,network:'blocked' as const};
    const {sdk}=supportedSdk(()=>child(value=>{value.stdout.end('ok');value.stderr.end('');value.emit('close',0,null);}));
    const measured=probe();
    const backend=createMxcExecutionBackend({sdk,platform:'win32',verifyProcessTreeKillOnClose:async()=>({...measured,evidence:{...measured.evidence,boundary}})});
    const result=await backend.execute(await input());
    assert.equal(result.applied.appContainer,appContainer);
    assert.deepEqual(result.applied.boundary,boundary);
  }
});

/* 0.6.15 (owner 26/10/2026, «Aprirla quando si chiede la rete»): a shell that asked for the network also reaches this PC's own
   services on loopback (a `npm run dev` and a call to localhost); inbound from the LAN stays denied. Without the network, as before. */
test('internet-client policy allows egress and the host loopback; inbound from the LAN stays denied',async()=>{
  const {sdk,calls}=supportedSdk(()=>child(value=>{value.emit('close',0,null);}));
  const backend=createMxcExecutionBackend({sdk,platform:'win32',verifyProcessTreeKillOnClose:async()=>probe()});
  const executionInput=await input();executionInput.request.network='internet-client';
  await backend.execute(executionInput);
  assert.deepEqual(calls.policy.network,{egress:{default:'allow'},ingress:{default:'deny',hostLoopback:'allow'}});
});

test('timeout and cancellation kill the MXC executor',async()=>{
  const timedChild=child(()=>{});const timed=supportedSdk(()=>timedChild);
  const timedBackend=createMxcExecutionBackend({sdk:timed.sdk,platform:'win32',verifyProcessTreeKillOnClose:async()=>probe()});
  const timedInput=await input(5);
  await assert.rejects(()=>timedBackend.execute(timedInput),/MXC_EXECUTION_TIMEOUT/);
  assert.equal(timedChild.killCalls,1);

  const cancelledChild=child(()=>{});const cancelled=supportedSdk(()=>cancelledChild);const controller=new AbortController();
  const cancelledInput=await input();cancelledInput.request.signal=controller.signal;
  const pending=createMxcExecutionBackend({sdk:cancelled.sdk,platform:'win32',verifyProcessTreeKillOnClose:async()=>probe()}).execute(cancelledInput);
  controller.abort();
  await assert.rejects(()=>pending,/MXC_EXECUTION_CANCELLED/);
  assert.equal(cancelledChild.killCalls,1);
});

test('output beyond the configured byte budget is bounded and kills execution',async()=>{
  const spawned=child(value=>{value.stdout.write('123456789');});
  const {sdk}=supportedSdk(()=>spawned);
  const backend=createMxcExecutionBackend({sdk,platform:'win32',maxOutputBytes:8,verifyProcessTreeKillOnClose:async()=>probe()});
  const executionInput=await input();
  await assert.rejects(()=>backend.execute(executionInput),/MXC_OUTPUT_LIMIT_EXCEEDED/);
  assert.equal(spawned.killCalls,1);
});

test('review of 0.6.4 (S3): what the command wrote before the limit travels with the error',async()=>{
  const spawned=child(value=>{value.stderr.write('warn');setTimeout(()=>{value.stdout.write('abc');setTimeout(()=>value.stdout.write('123456789'),5);},5);});
  const {sdk}=supportedSdk(()=>spawned);
  const backend=createMxcExecutionBackend({sdk,platform:'win32',maxOutputBytes:8,verifyProcessTreeKillOnClose:async()=>probe()});
  const failure:any=await backend.execute(await input()).then(()=>null,(error:unknown)=>error);
  assert.match(String(failure?.message),/MXC_OUTPUT_LIMIT_EXCEEDED/u);
  assert.equal(failure.stdout,'abc');assert.equal(failure.stderr,'warn');
});

test('a boolean stub no longer satisfies the process-tree seam',async()=>{
  const {sdk}=supportedSdk(()=>child(()=>{}));
  const backend=createMxcExecutionBackend({sdk,platform:'win32',verifyProcessTreeKillOnClose:(async()=>true) as unknown as ()=>Promise<ProcessTreeProbeResult>});
  const availability=await backend.available();
  assert.equal(availability.available,false);
  assert.match(String(availability.reason),/unrecognized result/u);
});

test('an unverified probe leaves the backend unavailable and execute refuses with the probe reason verbatim',async()=>{
  const {sdk}=supportedSdk(()=>{throw new Error('must not spawn');});
  const backend=createMxcExecutionBackend({sdk,platform:'win32',verifyProcessTreeKillOnClose:async()=>probe(false)});
  const availability=await backend.available();
  assert.equal(availability.available,false);
  assert.equal(availability.reason,'PROCESS_TREE_PROBE_DESCENDANT_SURVIVED');
  const executionInput=await input();
  // R2 lane E realignment (gate E6): the code is on error.code, the message is the probe reason verbatim.
  await assert.rejects(()=>backend.execute(executionInput),{code:'MXC_BACKEND_UNAVAILABLE',message:'PROCESS_TREE_PROBE_DESCENDANT_SURVIVED'});
});

test('the process-tree probe runs once per backend instance',async()=>{
  let calls=0;
  const {sdk}=supportedSdk(()=>child(value=>{value.emit('close',0,null);}));
  const backend=createMxcExecutionBackend({sdk,platform:'win32',verifyProcessTreeKillOnClose:async()=>{calls++;return probe();}});
  await backend.available();
  await backend.execute(await input());
  await backend.available();
  assert.equal(calls,1);
});

test('applied evidence carries the measurement that justifies the process-tree claim',async()=>{
  const {sdk}=supportedSdk(()=>child(value=>{value.emit('close',0,null);}));
  const measurement=probe();
  const backend=createMxcExecutionBackend({sdk,platform:'win32',verifyProcessTreeKillOnClose:async()=>measurement});
  const result=await backend.execute(await input());
  assert.equal(result.applied.processTree,'job-object-kill-on-close');
  assert.deepEqual(result.applied.processTreeEvidence,measurement.evidence);
  assert.equal(result.applied.processTreeEvidence?.scope,'createprocess-descendant');
});

/*
 * ⭐⭐⭐ R0 lane S — the brokered command's environment and policy (S1/S2 on the command path).
 * Measured 2026-09-23 with the real SDK: a command given NO environment gets the backend default, which is the
 * user's profile block (56 variables here, 3 of them secret-shaped names from the persistent user environment),
 * not an allowlist. Supplying the allowlist keeps secrets out of the container; its values are system paths, which
 * is all that may ride on the `wxc-exec.exe --config-base64` command line (B1 slice 19).
 */
test('a brokered command without its own environment receives the MXC allowlist, never the process environment',async()=>{
  const {sdk,calls}=supportedSdk(()=>child(value=>{value.emit('close',0,null);}));
  const backend=createMxcExecutionBackend({sdk,platform:'win32',verifyProcessTreeKillOnClose:async()=>probe()});
  const executionInput=await input();delete executionInput.request.environment;
  process.env.TALOS_LANE_S_CANARY='canary-not-secret';
  try{await backend.execute(executionInput);}finally{delete process.env.TALOS_LANE_S_CANARY;}
  assert.ok(calls.environment,'an explicit environment is supplied, so the backend default (the user profile block) is never used');
  assert.equal(Object.keys(calls.environment!).some(name=>/CANARY|KEY|TOKEN|SECRET|PASSW|CRED|AUTH|PRIVATE/iu.test(name)),false);
  if(process.env.LOCALAPPDATA!==undefined)assert.equal(calls.environment!.LOCALAPPDATA,process.env.LOCALAPPDATA);
  assert.match(String(calls.environment!.PATH??''),/^[A-Za-z]:\\[^;]*\\System32(;|$)/iu,'System32 first');
});

test('S2 — a brokered command runs with Win32k allowed and clipboard and input injection blocked',async()=>{
  const {sdk,calls}=supportedSdk(()=>child(value=>{value.emit('close',0,null);}));
  const backend=createMxcExecutionBackend({sdk,platform:'win32',verifyProcessTreeKillOnClose:async()=>probe()});
  const executionInput=await input();
  await backend.execute(executionInput);
  assert.deepEqual(calls.policy.ui,{allowWindows:true,clipboard:'none',allowInputInjection:false});
  assert.equal(executionInput.windowsSandboxPolicy.disallowWin32kSystemCalls,false,'the policy record must not claim Win32k is disabled when it is not');
});

/*
 * ⭐⭐⭐ R0 lane S — S4. `@microsoft/mxc-sdk@0.8.0` `dist/diagnostic.js` runs `execSync('whoami /user /fo csv /nh')`
 * at MODULE LOAD through cmd, the inherited PATH and the current directory. Measured on this host: with Git's
 * `usr/bin` before System32 every run that loads the SDK printed `whoami: extra operand '/user'`; and with a
 * `whoami.bat` in the working directory (and NoDefaultCurrentDirectoryInExePath unset, the Windows default) that
 * batch file RAN on the host. Gate E5; review E-08.
 */
const CLI_ROOT=fileURLToPath(new URL('../../',import.meta.url));
async function loadInChild(options:{plantPath?:boolean;plantCwd?:boolean;construct?:boolean}){
  const root=await mkdtemp(join(tmpdir(),'talos-s4-'));
  const planted=join(root,'planted-path');const cwd=join(root,'cwd');await mkdir(planted);await mkdir(cwd);
  if(options.plantPath)await writeFile(join(planted,'whoami.cmd'),'@echo TALOS_FAKE_WHOAMI extra operand 1>&2\r\n@exit /b 1\r\n');
  if(options.plantCwd)await writeFile(join(cwd,'whoami.bat'),'@echo ran> "%~dp0planted.ran"\r\n@echo TALOS_FAKE_WHOAMI from cwd 1>&2\r\n@exit /b 1\r\n');
  const script=join(root,'load.mjs');
  const backends=pathToFileURL(join(CLI_ROOT,'src','security','execution-backends.ts')).href;
  const mxc=pathToFileURL(join(CLI_ROOT,'src','security','mxc-execution-backend.ts')).href;
  await writeFile(script,[
    `const {createCliExecutionBroker}=await import(${JSON.stringify(backends)});`,
    `const {loadMxcSdk}=await import(${JSON.stringify(mxc)});`,
    `createCliExecutionBroker({paths:{cacheRoot:${JSON.stringify(join(root,'cache'))}}});`,
    `const {existsSync}=await import('node:fs');`,
    `const afterConstruct=existsSync('planted.ran');`,
    options.construct?'':`const sdk=await loadMxcSdk();if(typeof sdk.getPlatformSupport!=='function')throw new Error('no sdk');`,
    `console.log(JSON.stringify({afterConstruct,pathAfter:process.env.PATH,flagAfter:process.env.NoDefaultCurrentDirectoryInExePath??null}));`,
  ].join('\n'));
  const env:NodeJS.ProcessEnv={};
  for(const [name,value] of Object.entries(process.env))if(!/KEY|TOKEN|SECRET|PASSW|CRED|AUTH|PRIVATE/iu.test(name)&&!/^NoDefaultCurrentDirectoryInExePath$/iu.test(name))env[name]=value;
  env.PATH=`${planted};${process.env.PATH??''}`;
  const result=spawnSync(process.execPath,['--experimental-strip-types','--no-warnings',script],{cwd,env,encoding:'utf8',timeout:60_000,windowsHide:true});
  const ran=existsSync(join(cwd,'planted.ran'));
  await rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:100});
  return{status:result.status,stdout:String(result.stdout),stderr:String(result.stderr),ran,parentPath:env.PATH};
}
const WIN32_ONLY=process.platform!=='win32'&&'the SDK calls whoami only on win32';

test('S4 — loading the SDK never lets a PATH-planted whoami write to TALOS\'s stderr',{skip:WIN32_ONLY},async()=>{
  const outcome=await loadInChild({plantPath:true});
  assert.equal(outcome.status,0,outcome.stderr);
  assert.equal(outcome.stderr.includes('TALOS_FAKE_WHOAMI'),false,`the SDK's whoami resolved through the inherited PATH: ${outcome.stderr}`);
  const report=JSON.parse(outcome.stdout.trim().split('\n').at(-1)!);
  assert.equal(report.pathAfter,outcome.parentPath,'PATH is restored exactly after the import');
  assert.equal(report.flagAfter,null,'the no-current-directory flag is removed again after the import');
});

test('S4 — loading the SDK never runs a whoami planted in the working directory',{skip:WIN32_ONLY},async()=>{
  const outcome=await loadInChild({plantCwd:true});
  assert.equal(outcome.status,0,outcome.stderr);
  assert.equal(outcome.ran,false,'a whoami.bat in the working directory ran on the host at SDK import');
  assert.equal(outcome.stderr.includes('TALOS_FAKE_WHOAMI'),false);
});

test('S4 — building the CLI broker does not load the SDK: nothing runs until a sandbox is asked for',{skip:WIN32_ONLY},async()=>{
  const outcome=await loadInChild({plantPath:true,plantCwd:true,construct:true});
  assert.equal(outcome.status,0,outcome.stderr);
  assert.equal(outcome.ran,false);
  assert.equal(outcome.stderr.includes('TALOS_FAKE_WHOAMI'),false);
});

/*
 * ⭐⭐ R0 lane S — found by the real proof: a brokered `node -e "console.log(1)"` exited 0 and printed NOTHING.
 * cmd.exe does not parse MSVCRT `\"`; the brokered shell line now has Node's own `shell:true` form.
 */
test('a brokered cmd invocation reaches cmd in Node\'s shell form, so embedded quotes survive',async()=>{
  const {sdk,calls}=supportedSdk(()=>child(value=>{value.emit('close',0,null);}));
  const backend=createMxcExecutionBackend({sdk,platform:'win32',verifyProcessTreeKillOnClose:async()=>probe()});
  const executionInput=await input();
  executionInput.request.executable='C:\\Windows\\system32\\cmd.exe';
  executionInput.request.args=['/d','/s','/c','node -e "console.log(1)" & git commit -m "a b"'];
  await backend.execute(executionInput);
  assert.equal(calls.config.process.commandLine,'C:\\Windows\\system32\\cmd.exe /d /s /c "node -e "console.log(1)" & git commit -m "a b""');
});

test('the brokered cmd line, run by the real cmd.exe on the host, gives node the command as written',{skip:WIN32_ONLY},async()=>{
  const {sdk,calls}=supportedSdk(()=>child(value=>{value.emit('close',0,null);}));
  const backend=createMxcExecutionBackend({sdk,platform:'win32',verifyProcessTreeKillOnClose:async()=>probe()});
  const executionInput=await input();
  executionInput.request.executable=process.env.ComSpec??'cmd.exe';
  executionInput.request.args=['/d','/s','/c',`"${process.execPath}" -e "console.log('quoted '+(1+1))"`];
  await backend.execute(executionInput);
  const line=String(calls.config.process.commandLine);
  const tail=line.slice(line.indexOf(' /d /s /c ')+1);
  const result=spawnSync(executionInput.request.executable,[tail],{windowsVerbatimArguments:true,encoding:'utf8',windowsHide:true});
  assert.equal(result.status,0,String(result.stderr));
  assert.equal(String(result.stdout).trim(),'quoted 2');
});

/* Startup stall (08/10/2026, mxc-support-probe.test.ts): the host's evidence can come from a support probe (a worker thread), so asking whether the sandbox is
   available does not load the sdk on the calling thread. Executing a command still does. */
test('S12 availability from a support probe never loads the sdk nor asks it for the platform support',async()=>{
  let sdkLoads=0;
  const backend=createMxcExecutionBackend({
    platform:'win32',
    sdkLoader:async()=>{sdkLoads+=1;throw new Error('the sdk must not be loaded to answer availability');},
    supportProbe:async()=>({isSupported:true,availableMethods:['processcontainer'],isolationTier:'base-container'}),
    verifyProcessTreeKillOnClose:async()=>probe(),
  });
  assert.equal((await backend.available()).available,true);
  assert.equal(sdkLoads,0);
});

test('S12b the probe\'s evidence is judged exactly like the sdk\'s: unsupported, no processcontainer, or another tier is unavailable',async()=>{
  const ask=async(evidence:any)=>createMxcExecutionBackend({platform:'win32',supportProbe:async()=>evidence,verifyProcessTreeKillOnClose:async()=>probe()}).available();
  assert.deepEqual(await ask({isSupported:false,availableMethods:[],reason:'unsupported host'}),{available:false,reason:'unsupported host'});
  assert.match(String((await ask({isSupported:true,availableMethods:['other']}) as any).reason),/ProcessContainer is unavailable/u);
  assert.match(String((await ask({isSupported:true,availableMethods:['processcontainer'],isolationTier:'appcontainer-dacl'}) as any).reason),/isolation tier appcontainer-dacl/u);
});

test('S12c a probe that could not load the sdk reads as before; one that failed measuring throws; an abort stays an abort',async()=>{
  const backendWith=(supportProbe:()=>Promise<any>)=>createMxcExecutionBackend({platform:'win32',supportProbe,verifyProcessTreeKillOnClose:async()=>probe()});
  const loadFailure=Object.assign(new Error('Cannot find package mxc-sdk'),{stage:'load'});
  assert.deepEqual(await backendWith(()=>Promise.reject(loadFailure)).available(),{available:false,reason:'MXC SDK failed to load: Cannot find package mxc-sdk'});
  const supportFailure=Object.assign(new Error('dism failed'),{stage:'support'});
  await assert.rejects(backendWith(()=>Promise.reject(supportFailure)).available(),/dism failed/u);
  const abort=Object.assign(new Error('PROCESS_TREE_PROBE_ABORTED'),{name:'AbortError',code:'ABORT_ERR'});
  await assert.rejects(backendWith(()=>Promise.reject(abort)).available(),(error:any)=>error.code==='ABORT_ERR');
});
