/*
 * F-021 (second CLI stress test, 03/10/2026; owner: «Banner solo misurato»). The line under a sandboxed command said «isolation
 * verified: AppContainer on…» from a constant. Measured on this host with the real SDK: low integrity, no AppContainer SID. These
 * tests pin the reading of the token, the three measurements of the boundary probe, and that the line says only measured facts.
 */
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {EXECUTION_TEXT} from '../../src/runtime/brokered-executor.ts';
import {createSandboxBoundaryProbe,readTokenGroups,type SandboxBoundaryEvidence} from '../../src/security/sandbox-boundary-probe.ts';
import {recordAnswersForDefaultProbe} from '../../src/security/execution-backends.ts';
import type {SandboxedSpawn} from '../../src/security/process-tree-probe.ts';

const LOW_NO_APPCONTAINER='"Group Name","Type","SID","Attributes"\r\n"Everyone","Well-known group","S-1-1-0","Mandatory group"\r\n"Mandatory Label\\Low Mandatory Level","Label","S-1-16-4096",""\r\n';
const APPCONTAINER='"Group Name","Type","SID","Attributes"\r\n"APPLICATION PACKAGE AUTHORITY\\ALL APPLICATION PACKAGES","Well-known group","S-1-15-2-1","Mandatory group"\r\n"","Unknown SID type","S-1-15-2-123-456","Mandatory group"\r\n"Mandatory Label\\Low Mandatory Level","Label","S-1-16-4096",""\r\n';

test('F-021: the token is read from the SIDs — AppContainer only with an S-1-15-2 SID, the integrity from S-1-16-…',()=>{
  assert.deepEqual(readTokenGroups(LOW_NO_APPCONTAINER),{appContainer:false,integrity:'low'});
  assert.deepEqual(readTokenGroups(APPCONTAINER),{appContainer:true,integrity:'low'});
  assert.deepEqual(readTokenGroups(LOW_NO_APPCONTAINER.replace('S-1-16-4096','S-1-16-8192')),{appContainer:false,integrity:'medium'});
  assert.deepEqual(readTokenGroups(''),{appContainer:null,integrity:null},'nothing read is not «no AppContainer»');
  assert.deepEqual(readTokenGroups('access denied'),{appContainer:null,integrity:null});
});

/* A spawn that does what the commands would do, in the folder it is given: the probe reads the disk, as it does for real. */
function fakeSpawn({groups=LOW_NO_APPCONTAINER,writeOutside=false,network='blocked' as 'blocked'|'open'}={}):SandboxedSpawn{
  return async request=>{
    const line=request.args.join(' ');
    if(line.includes('whoami'))await writeFile(path.join(request.cwd,'groups.csv'),groups);
    else if(line.includes('inside.txt')){
      await writeFile(path.join(request.cwd,'inside.txt'),'x');
      if(writeOutside){const target=/"([^"]+written\.txt)"/u.exec(line)?.[1];if(target)await writeFile(target,'x');}
    }else if(line.includes('net.txt'))await writeFile(path.join(request.cwd,'net.txt'),network);
    return{pid:1,kill:()=>{},exited:Promise.resolve({exitCode:0,signal:null})};
  };
}

test('F-021: the boundary probe measures the token, a write outside the granted folder, and the network',async()=>{
  const measured=await createSandboxBoundaryProbe({platform:'win32',spawn:fakeSpawn(),hostReachesNetwork:async()=>true})();
  assert.deepEqual(measured,{appContainer:false,integrity:'low',writesOutside:'blocked',network:'blocked'});
  const open=await createSandboxBoundaryProbe({platform:'win32',spawn:fakeSpawn({groups:APPCONTAINER,writeOutside:true,network:'open'}),hostReachesNetwork:async()=>true})();
  assert.deepEqual(open,{appContainer:true,integrity:'low',writesOutside:'allowed',network:'open'});
});

test('F-021: what was not measured stays «not measured» — offline host, a command that never ran, another platform',async()=>{
  const offline=await createSandboxBoundaryProbe({platform:'win32',spawn:fakeSpawn(),hostReachesNetwork:async()=>false})();
  assert.equal(offline.network,'not measured','a host without network cannot tell the sandbox blocked it');
  const broken=await createSandboxBoundaryProbe({platform:'win32',spawn:async()=>{throw new Error('spawn failed');},hostReachesNetwork:async()=>true})();
  assert.deepEqual(broken,{appContainer:null,integrity:null,writesOutside:'not measured',network:'not measured'});
  const linux=await createSandboxBoundaryProbe({platform:'linux',spawn:fakeSpawn()})();
  assert.deepEqual(linux,{appContainer:null,integrity:null,writesOutside:'not measured',network:'not measured'});
});

test('F-021: a write outside that did not happen only counts as blocked when the same command wrote inside',async()=>{
  const silent:SandboxedSpawn=async request=>{if(request.args.join(' ').includes('whoami'))await writeFile(path.join(request.cwd,'groups.csv'),LOW_NO_APPCONTAINER);return{pid:1,kill:()=>{},exited:Promise.resolve({exitCode:1,signal:null})};};
  const measured=await createSandboxBoundaryProbe({platform:'win32',spawn:silent,hostReachesNetwork:async()=>false})();
  assert.equal(measured.writesOutside,'not measured');
});

test('F-021: a cached verified record from before the boundary probe is measured again; an unverified one is kept',()=>{
  const evidence={schema:'talos.cli.process-tree-evidence.v1',scope:'createprocess-descendant',signals:{heartbeat:'gone',signalZero:'gone',enumeration:'gone'},executorPid:1,descendantPid:2,observedAtMs:1,durationMs:1,cleanup:{descendantKilled:false,executorKilled:true,directoryRemoved:true},workloads:{cmd:'ok',node:'ok',powershell:'ok',pwsh:'ok',gitBash:'unsupported'}} as any;
  assert.equal(recordAnswersForDefaultProbe({verified:true,evidence}),false,'verified, no boundary: measure again');
  assert.equal(recordAnswersForDefaultProbe({verified:true,evidence:{...evidence,boundary:{appContainer:false,integrity:'low',writesOutside:'blocked',network:'blocked'}}}),true);
  assert.equal(recordAnswersForDefaultProbe({verified:false,reason:'x',evidence}),true,'a broken sandbox is not probed again at every start');
  const {workloads:_w,...withoutWorkloads}=evidence;
  assert.equal(recordAnswersForDefaultProbe({verified:true,evidence:withoutWorkloads}),false);
});

const boundary=(over:Partial<SandboxBoundaryEvidence>={}):SandboxBoundaryEvidence=>({appContainer:false,integrity:'low',writesOutside:'blocked',network:'blocked',...over});

test('F-021: the line under a command says only measured facts, and never «AppContainer» or «verified» without the SID',()=>{
  assert.equal(EXECUTION_TEXT.reason.verified({network:'deny',boundary:boundary()}),'measured: writes only in the project, network blocked, reads the whole disk, its processes end with it');
  assert.equal(EXECUTION_TEXT.reason.verified({network:'deny'}),'isolation not measured on this computer yet');
  assert.equal(EXECUTION_TEXT.reason.verified({network:'deny',boundary:boundary({writesOutside:'not measured',network:'not measured'})}),'measured: reads the whole disk, its processes end with it');
  assert.match(EXECUTION_TEXT.reason.verified({network:'deny',boundary:boundary({writesOutside:'allowed',network:'open'})}),/can write outside the project, network reachable/u);
  assert.match(EXECUTION_TEXT.reason.verified({network:'internet-client',boundary:boundary()}),/network allowed/u);
  assert.match(EXECUTION_TEXT.reason.verified({network:'deny',boundary:boundary({appContainer:true})}),/AppContainer$/u);
  for(const evidence of [{network:'deny'},{network:'deny',boundary:boundary()}]){
    const line=EXECUTION_TEXT.reason.verified(evidence);
    assert.doesNotMatch(line,/AppContainer|verified/u,line);
  }
  assert.equal(existsSync(path.join('src','security','sandbox-boundary-probe.ts')),true);
});
