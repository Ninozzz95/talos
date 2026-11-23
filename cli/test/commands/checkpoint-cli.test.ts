import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,readdir,utimes,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';

import {parseCliArgs} from '../../src/args.ts';
import {createCheckpointStore} from '../../src/workspace/checkpoint-store.ts';
import {runSubcommand} from '../../src/subcommands.ts';

function paths(root:string){
  return{
    configRoot:join(root,'config'),dataRoot:join(root,'data'),cacheRoot:join(root,'cache'),
    sessionsRoot:join(root,'data','sessions'),logsRoot:join(root,'data','logs'),
    projectOverridesRoot:join(root,'config','projects'),queueRoot:join(root,'data','queue'),
    checkpointsRoot:join(root,'data','checkpoints'),
    trust:{projects:join(root,'data','trust','projects'),hooks:join(root,'data','trust','hooks'),mcp:join(root,'data','trust','mcp'),plugins:join(root,'data','trust','plugins')},
  } as any;
}
function io(){const out:string[]=[];const err:string[]=[];return{out,err,io:{writeOut:(s:string)=>out.push(s),writeErr:(s:string)=>err.push(s),stdinIsTTY:false,stdoutIsTTY:false,readStdin:async()=>''} as any};}

test('checkpoint is a first-class subcommand family',()=>{
  const inv=parseCliArgs(['checkpoint','list','--json']);
  assert.equal(inv.command,'subcommand');
  assert.equal(inv.outputFormat,'json');
  assert.deepEqual(inv.positionals,['checkpoint','list']);
});

test('checkpoint list is reachable through the normal subcommand dispatcher',async()=>{
  const root=await mkdtemp(join(tmpdir(),'talos-checkpoint-cli-'));
  const projectRoot=join(root,'project');await mkdir(projectRoot,{recursive:true});
  const p=paths(root),stream=io();
  const inv=parseCliArgs(['--project',projectRoot,'--json','checkpoint','list']);
  const exit=await runSubcommand(inv,{io:stream.io,paths:p,repoRoot:root});
  assert.equal(exit,0);
  assert.deepEqual(JSON.parse(stream.out.join('')),[]);
  assert.deepEqual(stream.err,[]);
  const trailing=io();
  const after=parseCliArgs(['--project',projectRoot,'checkpoint','list','--json']);
  assert.equal(await runSubcommand(after,{io:trailing.io,paths:p,repoRoot:root}),0);
  assert.deepEqual(JSON.parse(trailing.out.join('')),[]);
  assert.equal(trailing.out.join('').trim().split('\n').length,1);
  assert.deepEqual(trailing.err,[]);
});

test('checkpoint show/undo/redo expose journal state without bypassing restore preflight',async()=>{
  const root=await mkdtemp(join(tmpdir(),'talos-checkpoint-cli-state-'));
  const projectRoot=join(root,'project');await mkdir(projectRoot,{recursive:true});
  const p=paths(root);const file=join(projectRoot,'x.txt');await writeFile(file,'old','utf8');
  const store=createCheckpointStore({rootDir:p.checkpointsRoot,projectRoot});
  const handle=await store.begin({operation:'start',sessionId:'s1'});await writeFile(file,'new','utf8');await handle.finalize();

  for(const args of [['show',handle.id],['undo',handle.id],['redo',handle.id]]){
    const stream=io();const inv=parseCliArgs(['--project',projectRoot,'--json','checkpoint',...args]);
    assert.equal(await runSubcommand(inv,{io:stream.io,paths:p,repoRoot:root}),0,args.join(' '));
    assert.equal(JSON.parse(stream.out.join('')).id,handle.id);
  }
});


test('checkpoint undo refuses while another TALOS run is active and leaves workspace untouched',async()=>{
  const root=await mkdtemp(join(tmpdir(),'talos-checkpoint-cli-active-'));
  const projectRoot=join(root,'project');await mkdir(projectRoot,{recursive:true});
  const p=paths(root);const file=join(projectRoot,'x.txt');await writeFile(file,'old','utf8');
  const store=createCheckpointStore({rootDir:p.checkpointsRoot,projectRoot});
  const handle=await store.begin({operation:'start'});await writeFile(file,'new','utf8');await handle.finalize();
  const activeRoot=join(p.dataRoot,'active-runs');await mkdir(activeRoot,{recursive:true});
  await writeFile(join(activeRoot,`${process.pid}.json`),JSON.stringify({pid:process.pid,projectRoot,startedAt:new Date().toISOString()}),'utf8');

  const stream=io();const inv=parseCliArgs(['--project',projectRoot,'--json','checkpoint','undo',handle.id]);
  const exit=await runSubcommand(inv,{io:stream.io,paths:p,repoRoot:root});
  assert.notEqual(exit,0);
  assert.equal(await readFile(file,'utf8'),'new');
  assert.equal((await store.show(handle.id)).state,'complete');
});

/* R5b D3 (Q-R5-13; gate finding 10: "the list names an operation and a time, never the files"): the human list names them. */
test('R5b D3: checkpoint list, for a person, names the files each checkpoint changed',async()=>{
  const root=await mkdtemp(join(tmpdir(),'talos-checkpoint-cli-files-'));
  const projectRoot=join(root,'project');await mkdir(projectRoot,{recursive:true});
  const p=paths(root);await writeFile(join(projectRoot,'x.txt'),'old','utf8');
  const store=createCheckpointStore({rootDir:p.checkpointsRoot,projectRoot});
  const handle=await store.begin({operation:'resume',sessionId:'s1'});
  await writeFile(join(projectRoot,'x.txt'),'new','utf8');await writeFile(join(projectRoot,'y.txt'),'made','utf8');await handle.finalize();
  const quiet=await store.begin({operation:'shell',sessionId:'s1'});await quiet.finalize();
  const stream=io();
  assert.equal(await runSubcommand(parseCliArgs(['--project',projectRoot,'checkpoint','list']),{io:stream.io,paths:p,repoRoot:root}),0);
  const text=stream.out.join('');
  assert.match(text,new RegExp(`${handle.id}  complete  resume  `,'u'));
  assert.match(text,/  2 files: x\.txt \(modified\), y\.txt \(added\)/u);
  assert.match(text,/  no files changed/u);
  const json=io();
  await runSubcommand(parseCliArgs(['--project',projectRoot,'--json','checkpoint','list']),{io:json.io,paths:p,repoRoot:root});
  assert.deepEqual(JSON.parse(json.out.join('')).find((row:any)=>row.id===handle.id).files,[{path:'x.txt',change:'modified'},{path:'y.txt',change:'added'}]);
});

/* F-023 (audit 0.1.22): `checkpoint prune` is reachable through the normal dispatcher, reports what it freed, and
   refuses unknown flags like every other action. */
test('F-023: checkpoint prune runs through the dispatcher and collects what no kept record pins',async()=>{
  const root=await mkdtemp(join(tmpdir(),'talos-checkpoint-cli-prune-'));
  const projectRoot=join(root,'project');await mkdir(projectRoot,{recursive:true});
  const p=paths(root);const rootDir=p.checkpointsRoot;
  const recordsDir=join(rootDir,'workspaces','w','records');
  await mkdir(recordsDir,{recursive:true});await mkdir(join(rootDir,'blobs'),{recursive:true});
  const entry=(r:string)=>({kind:'file',source:'blob',ref:r,size:1,mode:438,executable:false});
  for(let index=0;index<3;index+=1){
    const r=`${String(index+1).padStart(3,'0')}${'b'.repeat(61)}`;
    const id=`100${index}-e6c3d4f5-1234-4321-8765-00000000000${index}`;
    await writeFile(join(recordsDir,`${id}.json`),JSON.stringify({schema:'talos.cli.checkpoint.v1',id,operation:'start',sessionId:null,commandId:null,state:'complete',createdAt:`2026-02-0${index+1}T00:00:00.000Z`,finalizedAt:null,workspaceIdentityHash:'w',canonicalRoot:'C:\\w',pre:{capturedAt:'',workspace:{canonicalRoot:'C:\\w',identityHash:'w',gitRoot:null},entries:{[`f${index}`]:entry(r)}},post:null,writeEvidence:[],reversible:true,nonReversibleReason:null,finalizationError:null,transitions:[]}),'utf8');
    await writeFile(join(rootDir,'blobs',r),'x'.repeat(64),'utf8');
    /* the 1 h grace window protects blobs written «now»: age them so the command may collect them */
    await utimes(join(rootDir,'blobs',r),new Date(Date.now()-2*60*60*1000),new Date(Date.now()-2*60*60*1000));
  }
  const stream=io();
  assert.equal(await runSubcommand(parseCliArgs(['--project',projectRoot,'--json','checkpoint','prune','--keep','1']),{io:stream.io,paths:p,repoRoot:root}),0);
  const report=JSON.parse(stream.out.join(''));
  assert.equal(report.recordsDeleted.length,2);
  assert.equal(report.blobsDeleted,2);
  assert.equal((await readdir(join(rootDir,'blobs'))).length,1);
  const bad=io();
  assert.notEqual(await runSubcommand(parseCliArgs(['--project',projectRoot,'checkpoint','prune','--bogus']),{io:bad.io,paths:p,repoRoot:root}),0);
});
