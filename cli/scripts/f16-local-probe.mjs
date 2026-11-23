import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createCliExecutionBroker} from '../src/security/execution-backends.ts';

function fail(code,detail=''){
  const message=detail ? code+': '+detail : code;
  throw Object.assign(new Error(message),{code});
}
function parse(argv){
  const out={};
  for(let i=0;i<argv.length;i+=2){
    const key=argv[i],value=argv[i+1];
    if(!key?.startsWith('--')||value===undefined)fail('F16_LOCAL_PROBE_ARGS_INVALID');
    out[key.slice(2)]=value;
  }
  return out;
}
function assertEvidence(evidence){
  const enforcementOk=evidence?.appliedEnforcement==='windows-sandbox';
  const appContainerOk=evidence?.appContainer===true;
  const filesystemOk=evidence?.filesystem==='bfs';
  const networkOk=evidence?.network==='deny';
  const processTreeOk=evidence?.processTree==='job-object-kill-on-close';
  if(!enforcementOk)fail('F16_LOCAL_PROBE_ENFORCEMENT',String(evidence?.appliedEnforcement));
  if(!appContainerOk)fail('F16_LOCAL_PROBE_APPCONTAINER',String(evidence?.appContainer));
  if(!filesystemOk)fail('F16_LOCAL_PROBE_FILESYSTEM',String(evidence?.filesystem));
  if(!networkOk)fail('F16_LOCAL_PROBE_NETWORK',String(evidence?.network));
  if(!processTreeOk)fail('F16_LOCAL_PROBE_PROCESS_TREE',String(evidence?.processTree));
}

const args=parse(process.argv.slice(2));
if(process.platform!=='win32')fail('F16_LOCAL_PROBE_WINDOWS_REQUIRED',process.platform);
if(process.arch!=='x64')fail('F16_LOCAL_PROBE_X64_REQUIRED',process.arch);

const here=path.dirname(fileURLToPath(import.meta.url));
const repoRoot=path.resolve(args['repo-root']??path.resolve(here,'../..'));
const cacheRoot=path.resolve(args['cache-root']??path.join(repoRoot,'.tools','talos-local-gate','f16-probe-cache'));
const outFile=args.out?path.resolve(args.out):null;
await mkdir(cacheRoot,{recursive:true});

const broker=createCliExecutionBroker({paths:{cacheRoot}});
const sentinel='TALOS_F16_LOCAL_PROBE_OK';
const request={
  id:randomUUID(),
  executable:process.env.ComSpec??'cmd.exe',
  args:['/d','/s','/c','echo '+sentinel],
  cwd:repoRoot,
  readWritePaths:[repoRoot],
  readOnlyPaths:[path.parse(repoRoot).root],
  network:'deny',
  requiredEnforcement:'windows-sandbox',
  timeoutMs:120_000,
};
const result=await broker.execute(request);
if(result.exitCode!==0)fail('F16_LOCAL_PROBE_EXIT',String(result.exitCode));
if(!String(result.stdout??'').includes(sentinel))fail('F16_LOCAL_PROBE_OUTPUT','sentinel missing');
assertEvidence(result.evidence);

const report={
  schema:'talos.cli.f16-local-probe.v1',
  ok:true,
  platform:process.platform,
  arch:process.arch,
  request:{
    network:request.network,
    requiredEnforcement:request.requiredEnforcement,
    cwd:repoRoot,
  },
  evidence:result.evidence,
  exitCode:result.exitCode,
  sentinelObserved:true,
};
const json=JSON.stringify(report,null,2)+'\n';
if(outFile){
  await mkdir(path.dirname(outFile),{recursive:true});
  await writeFile(outFile,json,'utf8');
}
process.stdout.write(json);
