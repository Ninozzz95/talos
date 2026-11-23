import type {ChildProcess} from 'node:child_process';
import type {ContainerConfig,SandboxPolicy} from '@microsoft/mxc-sdk';
import type {BackendAppliedEvidence,BackendExecutionInput,BackendExecutionResult,ExecutionBackend} from './execution-broker.ts';
import type {ProcessTreeProbeResult} from './process-tree-probe.ts';
import {findPackageRoot} from '../runtime/package-root.ts';
import {importFromPlatformPackage} from '../runtime/platform-package.ts';

export type MxcPlatformEvidence={
  isSupported:boolean;
  reason?:string;
  availableMethods:string[];
  isolationTier?:'base-container'|'appcontainer-bfs'|'appcontainer-dacl';
  isolationWarnings?:string[];
};

export type MxcSdk={
  getPlatformSupport():MxcPlatformEvidence;
  createConfigFromPolicy(policy:SandboxPolicy,containment?:'process',containerName?:string):ContainerConfig;
  spawnSandboxFromConfig(config:ContainerConfig,options:{usePty:false;experimental?:boolean},workingDirectory?:string,environment?:NodeJS.ProcessEnv):ChildProcess;
};

/*
 * ⭐⭐⭐ R0 lane S — THE CONTAINER'S ENVIRONMENT IS ONE ALLOWLIST, FOR THE PROBE AND FOR EVERY COMMAND.
 *
 * Measured 2026-09-23 on this host (Windows 11 26200.9457, Node 24.18.0, SDK 0.8.0, the policy below):
 *  · SDK 0.8.0 uses a supplied environment VERBATIM (microsoft/mxc docs/schema.md, 2026-09-21) and serialises it into
 *    `--config-base64` on the `wxc-exec.exe` command line, which process auditing records (B1 slice 19). So it is an
 *    allowlist of system paths: never `process.env`, never a denylist of it.
 *  · Without LOCALAPPDATA every sandboxed process dies before it starts: `CreateProcessW(PROC_THREAD_ATTRIBUTE_SECURITY_
 *    ENVIRONMENT) failed: WIN32_ERROR(203)` (microsoft/mxc#1130, closed 2026-09-14, "SystemRoot + LOCALAPPDATA").
 *    Without SystemRoot node, npm and powershell fail; without PATH npm, git, powershell and pwsh are not found
 *    (microsoft/mxc#1102: no PATH floor). Without APPDATA npm's prefix becomes `<cwd>\${APPDATA}\npm`; without
 *    USERPROFILE git finds no global configuration. windir, SystemDrive, TEMP, TMP, PATHEXT and ComSpec are not needed
 *    by those six workloads but are the gate E1 floor (Gemini CLI's win32 list; the container overrides TEMP with its
 *    own AppContainer folder). NUMBER_OF_PROCESSORS and PROCESSOR_ARCHITECTURE stay from B1 slice 19.
 *  · A command given NO environment gets the backend default, which is the user's profile block: 56 variables here,
 *    three of them secret-shaped names from the persistent user environment. So a command always gets this list.
 * ⛔ A name is added only when a measurement in the real container shows a workload needs it, and only if neither its
 *   name nor its value can hold a credential.
 */
/* 0.6.8 (stress test of 0.6.7, F-E-001, S0): NoDefaultCurrentDirectoryInExePath too — without it a bare `node …` inside the sandbox
   ran a `node.cmd` planted in the project folder (cmd.exe honours the variable; security/exe-search-defence.ts sets it at start) */
export const MXC_CHILD_ENVIRONMENT_NAMES:readonly string[]=Object.freeze(['SystemRoot','windir','SystemDrive','LOCALAPPDATA','APPDATA','USERPROFILE','TEMP','TMP','PATH','PATHEXT','ComSpec','NUMBER_OF_PROCESSORS','PROCESSOR_ARCHITECTURE','NoDefaultCurrentDirectoryInExePath']);

function lookup(source:Record<string,string|undefined>,name:string):string|undefined{
  if(source[name]!==undefined)return source[name];
  const upper=name.toUpperCase();
  for(const [key,value] of Object.entries(source))if(key.toUpperCase()===upper&&value!==undefined)return value;
  return undefined;
}
function systemRootOf(source:Record<string,string|undefined>):string{return lookup(source,'SystemRoot')??lookup(source,'windir')??'C:\\Windows';}

/**
 * The host PATH with the Windows system folders first. ⛔ A relative entry (`.`, `bin`) resolves against whatever the
 * working directory is — a planting vector — and is dropped, as are empty entries and duplicates (case-insensitive,
 * trailing separator ignored). Git's `usr/bin` before System32 is what made the SDK's `whoami` print GNU usage.
 */
export function systemFirstPath(source:Record<string,string|undefined>=process.env):string{
  const root=systemRootOf(source).replace(/[\\/]+$/u,'');
  const front=[`${root}\\System32`,root,`${root}\\System32\\Wbem`,`${root}\\System32\\WindowsPowerShell\\v1.0\\`];
  const seen=new Set<string>();
  return[...front,...String(lookup(source,'PATH')??'').split(';')].filter(entry=>{
    if(!entry||!/^(?:[A-Za-z]:[\\/]|\\\\)/u.test(entry))return false;
    const key=entry.replace(/[\\/]+$/u,'').toLowerCase();
    if(seen.has(key))return false;seen.add(key);return true;
  }).join(';');
}

/** Only the allowlisted names this host defines, PATH always (System32 at least). A fresh object, never `process.env`. */
export function mxcChildEnvironment(source:Record<string,string|undefined>=process.env):Record<string,string>{
  const environment:Record<string,string>={};
  for(const name of MXC_CHILD_ENVIRONMENT_NAMES){
    if(name==='PATH'){environment.PATH=systemFirstPath(source);continue;}
    const value=lookup(source,name);if(value!==undefined)environment[name]=value;
  }
  return environment;
}

/*
 * R0 lane S, decision 4 (owner, 2026-09-23; gate E2): Win32k is allowed. `allowWindows:false` becomes
 * `DisallowWin32kSystemCalls`, and measured here node.exe and powershell.exe then exit 0xC0000142
 * (STATUS_DLL_INIT_FAILED) before their first instruction; Codex keeps `ui.disable:false` because "PowerShell needs
 * Win32k and desktop handles during DLL startup" (codex-rs/mxc-sandbox policy.rs, 2026-09-22). Clipboard and input
 * injection stay blocked; filesystem and network grants are unchanged.
 */
export const MXC_UI_POLICY=Object.freeze({allowWindows:true,clipboard:'none',allowInputInjection:false} as const);

/*
 * ⭐⭐ R0 lane S — S4, the SDK's import-time `whoami` (review E-08, gate E5).
 * `@microsoft/mxc-sdk@0.8.0` `dist/diagnostic.js` runs `execSync('whoami /user /fo csv /nh')` WHEN THE MODULE LOADS,
 * through cmd, the inherited PATH and the current directory, with stderr inherited. Measured: with Git's `usr/bin`
 * before System32 every load printed `whoami: extra operand '/user'` on TALOS's stderr; with a `whoami.bat` in the
 * working directory and NoDefaultCurrentDirectoryInExePath unset (the Windows default) that batch file RAN on the
 * host. So the SDK is loaded once per process, only when a sandbox is asked for, with PATH System32-first and the
 * current-directory search off for the length of the import; both are put back exactly afterwards, and only if nobody
 * else changed them meanwhile.
 */
let sdkModule:Promise<typeof import('@microsoft/mxc-sdk')>|undefined;
/* Installation (owner 02/10, registro 12): from this machine's platform package (talos-code-win32-x64), else the build
   dependency in a checkout (runtime/platform-package.ts) */
const importSdk=()=>importFromPlatformPackage<typeof import('@microsoft/mxc-sdk')>('@microsoft/mxc-sdk',{packageRoot:findPackageRoot(import.meta.url),fallback:()=>import('@microsoft/mxc-sdk')});
async function importSdkWithSystemSearch():Promise<typeof import('@microsoft/mxc-sdk')>{
  if(process.platform!=='win32')return importSdk();
  const FLAG='NoDefaultCurrentDirectoryInExePath';
  const previousPath=process.env.PATH;const previousFlag=process.env[FLAG];
  const guardedPath=systemFirstPath(process.env);
  process.env.PATH=guardedPath;process.env[FLAG]='1';
  try{return await importSdk();}
  finally{
    if(process.env.PATH===guardedPath){if(previousPath===undefined)delete process.env.PATH;else process.env.PATH=previousPath;}
    if(process.env[FLAG]==='1'){if(previousFlag===undefined)delete process.env[FLAG];else process.env[FLAG]=previousFlag;}
  }
}

export async function loadMxcSdk():Promise<MxcSdk>{
  const sdk=await (sdkModule??=importSdkWithSystemSearch().catch(error=>{sdkModule=undefined;throw error;}));
  return{
    getPlatformSupport:()=>sdk.getPlatformSupport(),
    createConfigFromPolicy:(policy,containment,name)=>sdk.createConfigFromPolicy(policy,containment,name),
    spawnSandboxFromConfig:(config,options,workingDirectory,environment)=>sdk.spawnSandboxFromConfig(config,options,workingDirectory,environment)
  };
}

type Options={
  sdk?:MxcSdk;
  sdkLoader?:()=>Promise<MxcSdk>;
  /** The host's platform evidence from somewhere that does not block this thread (a worker: mxc-support-probe.ts). Without it the sdk is loaded here and asked. */
  supportProbe?:()=>Promise<MxcPlatformEvidence>;
  platform?:NodeJS.Platform;
  maxOutputBytes?:number;
  verifyProcessTreeKillOnClose?:(evidence:MxcPlatformEvidence)=>ProcessTreeProbeResult|Promise<ProcessTreeProbeResult>;
};

function quoteWindowsArgument(value:string):string{
  if(value.length>0&&!/[\s"]/u.test(value))return value;
  let quoted='"';let slashes=0;
  for(const character of value){
    if(character==='\\'){slashes++;continue;}
    if(character==='"'){quoted+='\\'.repeat(slashes*2+1)+'"';slashes=0;continue;}
    quoted+='\\'.repeat(slashes)+character;slashes=0;
  }
  return quoted+'\\'.repeat(slashes*2)+'"';
}

/** Shared so the probe's sandboxed executor is quoted by the same rule as a brokered command. */
export function windowsCommandLine(parts:readonly string[]):string{return parts.map(quoteWindowsArgument).join(' ');}
/*
 * ⛔⛔ R0 lane S — cmd.exe does NOT parse MSVCRT quoting. Measured 2026-09-23 on the host, no sandbox involved:
 *   `windowsCommandLine(['/d','/s','/c','node -e "console.log(1)"'])` gives `/d /s /c "node -e \"console.log(1)\""`,
 *   cmd strips the outer quotes and hands node `\"console.log(1)\"` — node evaluates a string literal, prints nothing,
 *   exits 0. Every brokered command with a double quote in it (a `git commit -m "…"`) ran CHANGED. Node's own
 *   `spawn(cmd,{shell:true})` on Windows builds `<ComSpec> /d /s /c "<command>"` verbatim (lib/child_process.js),
 *   and with `/s` cmd removes exactly the first and the last quote (`cmd /?`). That is the form used here for the
 *   brokered shell invocation, and only for it: the request keeps its argv shape.
 */
function isCmdInvocation(input:BackendExecutionInput):boolean{
  const {executable,args}=input.request;
  return /(?:^|[\\/])cmd(?:\.exe)?$/iu.test(executable)&&args.length===4&&args[0]==='/d'&&args[1]==='/s'&&args[2]==='/c';
}
function commandLine(input:BackendExecutionInput):string{
  if(isCmdInvocation(input))return `${windowsCommandLine([input.request.executable])} /d /s /c "${input.request.args[3]}"`;
  return windowsCommandLine([input.request.executable,...input.request.args]);
}

function policyFor(input:BackendExecutionInput):SandboxPolicy{
  const policy=input.windowsSandboxPolicy;
  if(!policy)throw new Error('MXC_WINDOWS_SANDBOX_POLICY_REQUIRED');
  const networkDefault=input.request.network==='internet-client'?'allow':'deny';
  return{
    version:'0.8.0-alpha',
    filesystem:{readwritePaths:policy.fsReadWrite,readonlyPaths:policy.fsReadOnly,clearPolicyOnExit:true},
    /* 0.6.15 (owner 26/10/2026, «Aprirla quando si chiede la rete»; 0.6.14 stress run): a shell that asked for the network said
       «network allowed» and still could not reach this PC's own services (a dev server on localhost). MXC 0.8.0's `hostLoopback` is
       the bidirectional host-loopback action (types.d.ts NetworkIngressConfig): it follows the request. Inbound from the LAN stays
       denied. Without the network, both stay closed, as before. */
    network:{egress:{default:networkDefault},ingress:{default:'deny',hostLoopback:networkDefault}},
    ui:{...MXC_UI_POLICY},
    ...(input.request.timeoutMs===undefined?{}:{timeoutMs:input.request.timeoutMs})
  };
}

function collectChild(child:ChildProcess,input:BackendExecutionInput,maxOutputBytes:number,applied:BackendAppliedEvidence):Promise<BackendExecutionResult>{
  return new Promise((resolve,reject)=>{
    let stdout=Buffer.alloc(0);let stderr=Buffer.alloc(0);let outputBytes=0;let settled=false;
    const signal=input.request.signal;
    const cleanup=()=>{
      if(timer)clearTimeout(timer);
      signal?.removeEventListener('abort',onAbort);
      child.stdout?.off('data',onStdout);child.stderr?.off('data',onStderr);
      child.off('error',onError);child.off('close',onClose);
    };
    /* review of 0.6.4 (S3): what the command wrote before it was stopped travels with the error (a command in the background keeps
       its output file: brokered-executor.ts appends it there) */
    const finishReject=(error:Error)=>{if(settled)return;settled=true;cleanup();try{child.kill();}catch{}reject(Object.assign(error,{stdout:stdout.toString('utf8'),stderr:stderr.toString('utf8')}));};
    const append=(target:'stdout'|'stderr',chunk:unknown)=>{
      const buffer=Buffer.isBuffer(chunk)?chunk:Buffer.from(String(chunk));
      if(outputBytes+buffer.length>maxOutputBytes){finishReject(new Error('MXC_OUTPUT_LIMIT_EXCEEDED'));return;}
      outputBytes+=buffer.length;if(target==='stdout')stdout=Buffer.concat([stdout,buffer]);else stderr=Buffer.concat([stderr,buffer]);
    };
    const onStdout=(chunk:unknown)=>append('stdout',chunk);
    const onStderr=(chunk:unknown)=>append('stderr',chunk);
    const onError=(cause:Error)=>finishReject(cause);
    const onClose=(code:number|null)=>{if(settled)return;settled=true;cleanup();resolve({exitCode:code??-1,stdout:stdout.toString('utf8'),stderr:stderr.toString('utf8'),applied});};
    const onAbort=()=>finishReject(new Error('MXC_EXECUTION_CANCELLED'));
    const timer=input.request.timeoutMs===undefined?undefined:setTimeout(()=>finishReject(new Error('MXC_EXECUTION_TIMEOUT')),input.request.timeoutMs);
    timer?.unref();
    child.stdout?.on('data',onStdout);child.stderr?.on('data',onStderr);child.once('error',onError);child.once('close',onClose);
    if(signal?.aborted)onAbort();else signal?.addEventListener('abort',onAbort,{once:true});
  });
}

export function createMxcExecutionBackend(options:Options={}):ExecutionBackend{
  const platform=options.platform??process.platform;
  const maxOutputBytes=options.maxOutputBytes??8*1024*1024;
  if(!Number.isSafeInteger(maxOutputBytes)||maxOutputBytes<1)throw new Error('MXC_OUTPUT_LIMIT_INVALID');
  let sdkPromise:Promise<MxcSdk>|undefined;
  // inspect() runs for both available() and execute(); without this memo every command would spawn a probe tree.
  let probePromise:Promise<ProcessTreeProbeResult>|undefined;
  const getSdk=()=>sdkPromise??=options.sdk?Promise.resolve(options.sdk):(options.sdkLoader??loadMxcSdk)();
  const inspect=async():Promise<{available:false;reason:string}|{available:true;probe:ProcessTreeProbeResult}>=>{
    if(platform!=='win32')return{available:false,reason:'MXC BaseContainer enforcement requires Windows'};
    let evidence:MxcPlatformEvidence;
    if(options.supportProbe){
      /* startup stall (08/10): the evidence is measured on another thread, so asking does not load the sdk here; the same words for the same failures */
      try{evidence=await options.supportProbe();}
      catch(cause){
        if((cause as {stage?:unknown}|null)?.stage!=='load')throw cause;/* a measurement that failed, or an abort: not a load failure */
        return{available:false,reason:`MXC SDK failed to load: ${cause instanceof Error?cause.message:String(cause)}`};
      }
    }else{
      let sdk:MxcSdk;
      try{sdk=await getSdk();}catch(cause){return{available:false,reason:`MXC SDK failed to load: ${cause instanceof Error?cause.message:String(cause)}`};}
      evidence=sdk.getPlatformSupport();
    }
    if(!evidence.isSupported)return{available:false,reason:evidence.reason??'MXC is unsupported on this host'};
    if(!evidence.availableMethods.includes('processcontainer'))return{available:false,reason:'MXC ProcessContainer is unavailable'};
    if(evidence.isolationTier!=='base-container')return{available:false,reason:`MXC isolation tier ${evidence.isolationTier??'unknown'} does not prove Experimental_CreateProcessInSandbox`};
    if(!options.verifyProcessTreeKillOnClose)return{available:false,reason:'MXC process-tree kill-on-close has not been verified on this host'};
    const verify=options.verifyProcessTreeKillOnClose;
    let probe:ProcessTreeProbeResult;
    try{probe=await (probePromise??=Promise.resolve(verify(evidence)));}catch(cause){return{available:false,reason:`MXC process-tree probe failed: ${cause instanceof Error?cause.message:String(cause)}`};}
    if(typeof probe!=='object'||probe===null||typeof probe.verified!=='boolean'||typeof probe.evidence!=='object'||probe.evidence===null)return{available:false,reason:'MXC process-tree probe returned an unrecognized result: the seam is a measurement, not a boolean'};
    if(!probe.verified)return{available:false,reason:probe.reason??'MXC process-tree kill-on-close probe failed'};
    return{available:true,probe};
  };
  return{
    name:'microsoft-mxc-0.8.0',level:'windows-sandbox',available:inspect,
    async execute(input){
      const availability=await inspect();if(!availability.available)throw Object.assign(new Error(availability.reason),{code:'MXC_BACKEND_UNAVAILABLE'});/* R2 (gate E6): code on error.code, printed once */
      const sdk=await getSdk();const sandboxPolicy=policyFor(input);const identity=input.windowsSandboxPolicy?.identity;
      const config=sdk.createConfigFromPolicy(sandboxPolicy,'process',identity);
      config.process={...(config.process??{commandLine:''}),commandLine:commandLine(input),cwd:input.request.cwd};
      /* ⛔ R0 lane S: never the backend default (the user profile block, secret-shaped names included, measured): the allowlist. */
      const child=sdk.spawnSandboxFromConfig(config,{usePty:false,experimental:true},input.request.cwd,input.request.environment??mxcChildEnvironment());
      /* F-021 (owner 03/10, «Banner solo misurato»): `appContainer` was the constant `true`; it is now what the boundary probe measured in
         the token (an MXC base container carries no S-1-15-2 SID), and the boundary rides along for the line under the command. */
      const boundary=availability.probe.evidence.boundary;
      const applied:BackendAppliedEvidence={enforcement:'windows-sandbox',appContainer:boundary?.appContainer===true,filesystem:'bfs',network:input.request.network,processTree:'job-object-kill-on-close',processTreeEvidence:availability.probe.evidence,sandboxSpecVersion:'0.1.0',...(boundary?{boundary}:{})};
      return collectChild(child,input,maxOutputBytes,applied);
    }
  };
}
