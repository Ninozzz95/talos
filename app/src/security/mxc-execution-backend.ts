import type {ChildProcess} from 'node:child_process';
import type {ContainerConfig,SandboxPolicy} from '@microsoft/mxc-sdk';
import type {BackendAppliedEvidence,BackendExecutionInput,BackendExecutionResult,ExecutionBackend} from './execution-broker.ts';
import type {ProcessTreeProbeResult} from './process-tree-probe.ts';

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

export async function loadMxcSdk():Promise<MxcSdk>{
  const sdk=await import('@microsoft/mxc-sdk');
  return{
    getPlatformSupport:()=>sdk.getPlatformSupport(),
    createConfigFromPolicy:(policy,containment,name)=>sdk.createConfigFromPolicy(policy,containment,name),
    spawnSandboxFromConfig:(config,options,workingDirectory,environment)=>sdk.spawnSandboxFromConfig(config,options,workingDirectory,environment)
  };
}

type Options={
  sdk?:MxcSdk;
  sdkLoader?:()=>Promise<MxcSdk>;
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
function commandLine(input:BackendExecutionInput):string{return windowsCommandLine([input.request.executable,...input.request.args]);}

function policyFor(input:BackendExecutionInput):SandboxPolicy{
  const policy=input.windowsSandboxPolicy;
  if(!policy)throw new Error('MXC_WINDOWS_SANDBOX_POLICY_REQUIRED');
  const networkDefault=input.request.network==='internet-client'?'allow':'deny';
  return{
    version:'0.8.0-alpha',
    filesystem:{readwritePaths:policy.fsReadWrite,readonlyPaths:policy.fsReadOnly,clearPolicyOnExit:true},
    network:{egress:{default:networkDefault},ingress:{default:'deny',hostLoopback:'deny'}},
    ui:{allowWindows:false,clipboard:'none',allowInputInjection:false},
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
    const finishReject=(error:Error)=>{if(settled)return;settled=true;cleanup();try{child.kill();}catch{}reject(error);};
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
    let sdk:MxcSdk;
    try{sdk=await getSdk();}catch(cause){return{available:false,reason:`MXC SDK failed to load: ${cause instanceof Error?cause.message:String(cause)}`};}
    const evidence=sdk.getPlatformSupport();
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
      const availability=await inspect();if(!availability.available)throw new Error(`MXC_BACKEND_UNAVAILABLE: ${availability.reason}`);
      const sdk=await getSdk();const sandboxPolicy=policyFor(input);const identity=input.windowsSandboxPolicy?.identity;
      const config=sdk.createConfigFromPolicy(sandboxPolicy,'process',identity);
      config.process={...(config.process??{commandLine:''}),commandLine:commandLine(input),cwd:input.request.cwd};
      const child=sdk.spawnSandboxFromConfig(config,{usePty:false,experimental:true},input.request.cwd,input.request.environment);
      const applied:BackendAppliedEvidence={enforcement:'windows-sandbox',appContainer:true,filesystem:'bfs',network:input.request.network,processTree:'job-object-kill-on-close',processTreeEvidence:availability.probe.evidence,sandboxSpecVersion:'0.1.0'};
      return collectChild(child,input,maxOutputBytes,applied);
    }
  };
}
