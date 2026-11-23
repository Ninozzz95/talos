import assert from 'node:assert/strict';
import {mkdir,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path,{isAbsolute,join} from 'node:path';
import test from 'node:test';
import {createExecutionBroker,type ExecutionBackend,type ExecutionRequest} from '../../src/security/execution-broker.ts';

async function fixture(){const root=await mkdtemp(join(tmpdir(),'talos-broker-'));const workspace=join(root,'workspace');const sdk=join(root,'sdk');await mkdir(workspace);await mkdir(sdk);return{workspace,sdk};}
function request(workspace:string,sdk:string,requiredEnforcement:'windows-sandbox'|'restricted-process'='windows-sandbox'):ExecutionRequest{return{id:'run-1',executable:process.execPath,args:['--version'],cwd:workspace,readWritePaths:[workspace],readOnlyPaths:[sdk],network:'deny',requiredEnforcement};}
function backend(level:'windows-sandbox'|'restricted-process',available:boolean,calls:any[],override:Record<string,unknown>={}):ExecutionBackend{return{
  name:`test-${level}`,level,available:async()=>({available,reason:available?undefined:'not installed'}),
  execute:async input=>{calls.push(input);const windows=level==='windows-sandbox';return{exitCode:0,stdout:'ok',stderr:'',applied:{enforcement:level,appContainer:windows,filesystem:windows?'bfs':'restricted-token',network:windows?'deny':'not-enforced',processTree:'job-object-kill-on-close',...(windows?{sandboxSpecVersion:'0.1.0'}:{}),...override} as any};}
};}

test('required windows sandbox fails closed without running restricted fallback',async()=>{
  const f=await fixture();const calls:any[]=[];
  const broker=createExecutionBroker({platform:'win32',windowsSandbox:backend('windows-sandbox',false,calls),restrictedProcess:backend('restricted-process',true,calls)});
  await assert.rejects(()=>broker.execute(request(f.workspace,f.sdk)),(error:any)=>error?.code==='SANDBOX_REQUIRED_UNAVAILABLE'&&error?.component==='execution-broker');
  assert.equal(calls.length,0);
});

test('windows sandbox is preferred and receives canonical BFS policy',async()=>{
  const f=await fixture();const windowsCalls:any[]=[];const restrictedCalls:any[]=[];
  const broker=createExecutionBroker({platform:'win32',windowsSandbox:backend('windows-sandbox',true,windowsCalls),restrictedProcess:backend('restricted-process',true,restrictedCalls)});
  const result=await broker.execute(request(f.workspace,f.sdk,'restricted-process'));
  assert.equal(result.evidence.appliedEnforcement,'windows-sandbox');
  assert.equal(result.evidence.appContainer,true);
  assert.equal(result.evidence.filesystem,'bfs');
  assert.equal(result.evidence.network,'deny');
  assert.equal(result.evidence.processTree,'job-object-kill-on-close');
  assert.equal(result.evidence.sandboxSpecVersion,'0.1.0');
  assert.equal(restrictedCalls.length,0);
  const policy=windowsCalls[0].windowsSandboxPolicy;
  assert.equal(policy.version,'0.1.0');
  assert.equal(policy.appContainer,true);
  assert.ok(policy.fsReadWrite.every(isAbsolute));
  assert.ok(policy.fsReadOnly.every(isAbsolute));
  assert.deepEqual(policy.capabilities,[]);
});

test('restricted fallback is explicitly weaker and never claims AppContainer or network deny',async()=>{
  const f=await fixture();const calls:any[]=[];
  const broker=createExecutionBroker({platform:'win32',windowsSandbox:backend('windows-sandbox',false,[]),restrictedProcess:backend('restricted-process',true,calls)});
  const result=await broker.execute(request(f.workspace,f.sdk,'restricted-process'));
  assert.equal(result.evidence.appliedEnforcement,'restricted-process');
  assert.equal(result.evidence.appContainer,false);
  assert.equal(result.evidence.filesystem,'restricted-token');
  assert.equal(result.evidence.network,'not-enforced');
  assert.equal(result.evidence.sandboxSpecVersion,undefined);
  assert.equal(calls.length,1);
});

test('backend evidence mismatch is rejected instead of overstating enforcement',async()=>{
  const f=await fixture();
  /* F-021: an MXC base container is not an AppContainer, so the lie under test is the filesystem a sandbox claims */
  const lying=backend('windows-sandbox',true,[],{filesystem:'restricted-token'});
  const broker=createExecutionBroker({platform:'win32',windowsSandbox:lying});
  await assert.rejects(()=>broker.execute(request(f.workspace,f.sdk)),(error:any)=>error?.code==='SANDBOX_EVIDENCE_MISMATCH');
});

test('a granted volume root does not silently satisfy the working-directory grant',async()=>{
  const f=await fixture();
  const volumeRoot=path.parse(f.workspace).root;
  const broker=createExecutionBroker({platform:'win32',windowsSandbox:backend('windows-sandbox',true,[])});
  const bare:ExecutionRequest={...request(f.workspace,f.sdk),readWritePaths:[],readOnlyPaths:[volumeRoot]};
  await assert.rejects(()=>broker.execute(bare),(error:any)=>error?.code==='SANDBOX_CWD_NOT_GRANTED');
});

test('a granted volume root is still forwarded as a read-only grant once the cwd is granted on its own',async()=>{
  const f=await fixture();
  const volumeRoot=path.parse(f.workspace).root;
  const calls:any[]=[];
  const broker=createExecutionBroker({platform:'win32',windowsSandbox:backend('windows-sandbox',true,calls)});
  const withRoot:ExecutionRequest={...request(f.workspace,f.sdk),readWritePaths:[f.workspace],readOnlyPaths:[volumeRoot]};
  const result=await broker.execute(withRoot);
  assert.equal(result.evidence.appliedEnforcement,'windows-sandbox');
  assert.deepEqual(calls[0].windowsSandboxPolicy.fsReadOnly,[volumeRoot]);
});

test('a backend measurement of the process tree is carried into the execution evidence',async()=>{
  const f=await fixture();
  const measurement={schema:'talos.cli.process-tree-evidence.v1',scope:'createprocess-descendant',signals:{heartbeat:'gone',signalZero:'gone',enumeration:'gone'},executorPid:1,descendantPid:2,observedAtMs:3,durationMs:4,cleanup:{descendantKilled:false,executorKilled:true,directoryRemoved:true}} as const;
  const broker=createExecutionBroker({platform:'win32',windowsSandbox:backend('windows-sandbox',true,[],{processTreeEvidence:measurement})});
  const result=await broker.execute(request(f.workspace,f.sdk));
  assert.deepEqual(result.evidence.processTreeEvidence,measurement);
});

/*
 * ⭐ B1 slice 12, round 2 — «NO BACKEND» MUST SAY WHICH BACKEND AND WHY.
 * The default request level is `restricted-process`, and on that path the broker used to throw a
 * fixed sentence, discarding the reason the backend had just given. That sentence is what a person
 * reads in the enforcement line: it has to be the real one.
 */
test('an unavailable backend has its own reason carried into the error instead of a fixed sentence',async()=>{
  const f=await fixture();
  const unavailable:ExecutionBackend={name:'microsoft-mxc-0.8.0',level:'windows-sandbox',available:async()=>({available:false,reason:'PROCESS_TREE_PROBE_EXECUTOR_EXITED: exit status 3221225794 (0xC0000142 STATUS_DLL_INIT_FAILED)'}),execute:async()=>{throw new Error('must not run');}};
  const broker=createExecutionBroker({platform:'win32',windowsSandbox:unavailable});
  await assert.rejects(()=>broker.execute(request(f.workspace,f.sdk,'restricted-process')),(error:any)=>{
    assert.equal(error?.code,'EXECUTION_BACKEND_UNAVAILABLE');
    assert.equal(error?.hint,'microsoft-mxc-0.8.0: PROCESS_TREE_PROBE_EXECUTOR_EXITED: exit status 3221225794 (0xC0000142 STATUS_DLL_INIT_FAILED)');
    return true;
  });
});

test('every configured backend is named with its own reason, and an empty broker says it has none',async()=>{
  const f=await fixture();
  const offPlatform=createExecutionBroker({platform:'linux',windowsSandbox:backend('windows-sandbox',true,[]),restrictedProcess:backend('restricted-process',false,[])});
  await assert.rejects(()=>offPlatform.execute(request(f.workspace,f.sdk,'restricted-process')),(error:any)=>{
    assert.equal(error?.hint,'test-windows-sandbox: requires win32, this host is linux; test-restricted-process: not installed');
    return true;
  });
  const nothing=createExecutionBroker({platform:'win32'});
  await assert.rejects(()=>nothing.execute(request(f.workspace,f.sdk,'restricted-process')),(error:any)=>{
    assert.equal(error?.hint,'no execution backend is configured');
    return true;
  });
});
