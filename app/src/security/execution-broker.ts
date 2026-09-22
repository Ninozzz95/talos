import {createHash} from 'node:crypto';
import {realpath,stat} from 'node:fs/promises';
import path from 'node:path';
import {TalosError} from '../errors.ts';
import type {ProcessTreeEvidence} from './process-tree-probe.ts';

export type EnforcementLevel='windows-sandbox'|'restricted-process';
export type ExecutionRequest={
  id:string;
  executable:string;
  args:string[];
  cwd:string;
  readWritePaths:string[];
  readOnlyPaths:string[];
  network:'deny'|'internet-client';
  requiredEnforcement:EnforcementLevel;
  environment?:Record<string,string>;
  timeoutMs?:number;
  signal?:AbortSignal;
};
export type WindowsSandboxPolicy={
  version:'0.1.0';
  identity:string;
  appContainer:true;
  disallowWin32kSystemCalls:true;
  fsReadWrite:string[];
  fsReadOnly:string[];
  capabilities:string[];
};
export type BackendAppliedEvidence={
  enforcement:EnforcementLevel;
  appContainer:boolean;
  filesystem:'bfs'|'restricted-token';
  network:'deny'|'internet-client'|'not-enforced';
  processTree:'job-object-kill-on-close';
  processTreeEvidence?:ProcessTreeEvidence;
  sandboxSpecVersion?:'0.1.0';
};
export type ExecutionEvidence={
  requestedEnforcement:EnforcementLevel;
  appliedEnforcement:EnforcementLevel;
  backend:string;
  appContainer:boolean;
  filesystem:BackendAppliedEvidence['filesystem'];
  network:BackendAppliedEvidence['network'];
  processTree:BackendAppliedEvidence['processTree'];
  processTreeEvidence?:ProcessTreeEvidence;
  sandboxSpecVersion?:'0.1.0';
};
export type BackendExecutionInput={request:ExecutionRequest;windowsSandboxPolicy?:WindowsSandboxPolicy};
export type BackendExecutionResult={exitCode:number;stdout:string;stderr:string;applied:BackendAppliedEvidence};
export type ExecutionBackend={name:string;level:EnforcementLevel;available():Promise<{available:boolean;reason?:string}>;execute(input:BackendExecutionInput):Promise<BackendExecutionResult>};
export type ExecutionBroker={execute(request:ExecutionRequest):Promise<{exitCode:number;stdout:string;stderr:string;evidence:ExecutionEvidence}>};

function error(code:string,request:ExecutionRequest,cause?:unknown,hint?:string){return new TalosError({code,component:'execution-broker',retryable:false,...(hint?{hint}:{}),docs:'https://learn.microsoft.com/windows/win32/secauthz/createprocessinsandbox',traceId:request.id},cause);}
async function canonicalDirectory(value:string,cwd:string,request:ExecutionRequest):Promise<string>{
  try{const canonical=await realpath(path.resolve(cwd,value));if(!(await stat(canonical)).isDirectory())throw new Error('path is not a directory');return canonical;}catch(cause){throw error('SANDBOX_PATH_INVALID',request,cause,`Create the sandbox path before execution: ${value}`);}
}
function contains(root:string,candidate:string){const relative=path.relative(root,candidate);return relative===''||(!relative.startsWith(`..${path.sep}`)&&relative!=='..'&&!path.isAbsolute(relative));}
/**
 * Upstream microsoft/mxc#1109 forces the volume root into the read-only grants before a
 * read-write grant on a user-profile directory is usable on a BaseContainer host. That grant makes
 * the containment check below trivially true for every request, so a volume root never satisfies
 * it on its own: the working directory must be covered by a grant that is narrower than the whole
 * volume. The volume root is still forwarded to the backend as a read-only grant.
 */
function isVolumeRoot(candidate:string){return path.parse(candidate).root===candidate;}
async function normalizeRequest(request:ExecutionRequest):Promise<ExecutionRequest>{
  const cwd=await canonicalDirectory(request.cwd,process.cwd(),request);
  const readWritePaths=[...new Set(await Promise.all(request.readWritePaths.map(value=>canonicalDirectory(value,cwd,request))))].sort();
  const readOnlyPaths=[...new Set(await Promise.all(request.readOnlyPaths.map(value=>canonicalDirectory(value,cwd,request))))].filter(value=>!readWritePaths.some(root=>contains(root,value))).sort();
  if(![...readWritePaths,...readOnlyPaths].filter(root=>!isVolumeRoot(root)).some(root=>contains(root,cwd)))throw error('SANDBOX_CWD_NOT_GRANTED',request,undefined,'Add cwd to readWritePaths or readOnlyPaths: a granted volume root does not cover it');
  return{...request,cwd,readWritePaths,readOnlyPaths};
}

export async function createWindowsSandboxPolicy(request:ExecutionRequest):Promise<WindowsSandboxPolicy>{
  const normalized=await normalizeRequest(request);
  const suffix=createHash('sha256').update(`${normalized.id}\0${normalized.cwd}`).digest('hex').slice(0,24);
  return{version:'0.1.0',identity:`TALOS_CLI_${suffix}`,appContainer:true,disallowWin32kSystemCalls:true,fsReadWrite:normalized.readWritePaths,fsReadOnly:normalized.readOnlyPaths,capabilities:normalized.network==='internet-client'?['internetClient']:[]};
}

function verifyEvidence(backend:ExecutionBackend,request:ExecutionRequest,applied:BackendAppliedEvidence):void{
  const mismatch=()=>{throw error('SANDBOX_EVIDENCE_MISMATCH',request,undefined,`Backend ${backend.name} did not apply its declared enforcement`);};
  if(applied.enforcement!==backend.level||applied.processTree!=='job-object-kill-on-close')mismatch();
  if(backend.level==='windows-sandbox'){
    if(!applied.appContainer||applied.filesystem!=='bfs'||applied.network!==request.network||applied.sandboxSpecVersion!=='0.1.0')mismatch();
  }else if(applied.appContainer||applied.filesystem!=='restricted-token'||applied.network!=='not-enforced'||applied.sandboxSpecVersion!==undefined)mismatch();
}

export function createExecutionBroker({platform=process.platform,windowsSandbox,restrictedProcess}:{platform?:NodeJS.Platform;windowsSandbox?:ExecutionBackend;restrictedProcess?:ExecutionBackend}):ExecutionBroker{
  return{async execute(input){
    const request=await normalizeRequest(input);
    const windowsAvailability=platform==='win32'&&windowsSandbox?.level==='windows-sandbox'?await windowsSandbox.available():{available:false,reason:'Windows sandbox backend is unavailable'};
    let backend:ExecutionBackend|undefined;
    if(windowsAvailability.available)backend=windowsSandbox;
    else if(request.requiredEnforcement==='windows-sandbox')throw error('SANDBOX_REQUIRED_UNAVAILABLE',request,new Error(windowsAvailability.reason??'Windows sandbox backend is unavailable'),'Install a verified Windows sandbox backend or change the explicit policy');
    /*
     * ⛔ B1 slice 12, round 2 — the hint below is what a person reads in the enforcement line
     *   («no isolation backend on this host: <hint>»). It used to be one fixed sentence, discarding
     *   the reason each backend had just given; on this host that hid
     *   `PROCESS_TREE_PROBE_EXECUTOR_EXITED` behind «No execution backend satisfies the requested
     *   enforcement». Every CONFIGURED backend is now named with its own reason. A backend that is
     *   not configured is not a fact about the host, so it is not listed.
     */
    const declined:string[]=[];
    if(!backend&&windowsSandbox){
      if(platform!=='win32')declined.push(`${windowsSandbox.name}: requires win32, this host is ${platform}`);
      else if(windowsSandbox.level!=='windows-sandbox')declined.push(`${windowsSandbox.name}: declares level ${windowsSandbox.level}, not windows-sandbox`);
      else declined.push(`${windowsSandbox.name}: ${windowsAvailability.reason??'unavailable, and it gave no reason'}`);
    }
    if(!backend&&restrictedProcess){
      if(restrictedProcess.level!=='restricted-process')declined.push(`${restrictedProcess.name}: declares level ${restrictedProcess.level}, not restricted-process`);
      else{const restrictedAvailability=await restrictedProcess.available();if(restrictedAvailability.available)backend=restrictedProcess;else declined.push(`${restrictedProcess.name}: ${restrictedAvailability.reason??'unavailable, and it gave no reason'}`);}
    }
    if(!backend)throw error('EXECUTION_BACKEND_UNAVAILABLE',request,undefined,declined.length>0?declined.join('; '):'no execution backend is configured');
    try{
      const windowsSandboxPolicy=backend.level==='windows-sandbox'?await createWindowsSandboxPolicy(request):undefined;
      const result=await backend.execute(windowsSandboxPolicy?{request,windowsSandboxPolicy}:{request});
      verifyEvidence(backend,request,result.applied);
      const evidence:ExecutionEvidence={requestedEnforcement:request.requiredEnforcement,appliedEnforcement:result.applied.enforcement,backend:backend.name,appContainer:result.applied.appContainer,filesystem:result.applied.filesystem,network:result.applied.network,processTree:result.applied.processTree,...(result.applied.processTreeEvidence?{processTreeEvidence:result.applied.processTreeEvidence}:{}),...(result.applied.sandboxSpecVersion?{sandboxSpecVersion:result.applied.sandboxSpecVersion}:{})};
      return{exitCode:result.exitCode,stdout:result.stdout,stderr:result.stderr,evidence};
    }catch(cause){if(cause instanceof TalosError)throw cause;throw error('EXECUTION_BACKEND_FAILED',request,cause,'Inspect the backend health and enforcement evidence');}
  }};
}
