import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,readFile,readdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {closeDevelopmentLogging,developmentLog,developmentLogError,developmentLogPath,initializeDevelopmentLogging} from '../../src/diagnostics/development-log.ts';

async function jsonl(root:string){
  const names=(await readdir(root)).filter(name=>name.endsWith('.jsonl')).sort();
  const text=(await Promise.all(names.map(name=>readFile(join(root,name),'utf8')))).join('');
  return{text,rows:text.trim().split('\n').filter(Boolean).map(line=>JSON.parse(line))};
}

test('development log records technical process/error evidence while redacting secrets and prompt content',async()=>{
  const root=await mkdtemp(join(tmpdir(),'talos-devlog-'));const secret='sk-talos-devlog-secret';const previous=process.env.OPENROUTER_API_KEY;process.env.OPENROUTER_API_KEY=secret;
  try{
    const file=initializeDevelopmentLogging({logDir:root,projectRoot:'/tmp/project',argv:['--model','openrouter:test'],component:'test'});
    assert.ok(file);
    developmentLog('ui.submit',{prompt:'private prompt text',authorization:'Bearer '+secret,provider:'openrouter'});
    const cause=Object.assign(new Error('provider failed '+secret),{code:'PROVIDER_REQUEST_ERROR',details:{token:secret,provider:'openrouter'}});
    developmentLogError('runtime.failure',new Error('outer failure',{cause}),{model:'openrouter:test'});
    process.emitWarning('warning '+secret,{code:'TEST_WARNING'});
    await new Promise(resolve=>setTimeout(resolve,10));closeDevelopmentLogging({exitCode:1});
    const pathname=developmentLogPath();assert.equal(pathname,file);const {text,rows}=await jsonl(root);
    assert.ok(rows.every(row=>row.schema==='talos.cli.development-log.v1'&&typeof row.correlationId==='string'));
    assert.ok(rows.some(row=>row.event==='process.warning'));
    assert.ok(rows.some(row=>row.event==='runtime.failure'&&row.data.error.cause.code==='PROVIDER_REQUEST_ERROR'));
    assert.match(text,/promptEvidence/u);assert.doesNotMatch(text,/private prompt text/u);assert.doesNotMatch(text,new RegExp(secret,'u'));
  }finally{if(previous===undefined)delete process.env.OPENROUTER_API_KEY;else process.env.OPENROUTER_API_KEY=previous;}
});

test('fatal and unhandled process hooks are verified in an isolated child process',async()=>{
  const root=await mkdtemp(join(tmpdir(),'talos-devlog-child-'));const secret='sk-child-process-secret';
  const loggerUrl=new URL('../../src/diagnostics/development-log.ts',import.meta.url).href;
  const script=`
    import {initializeDevelopmentLogging} from ${JSON.stringify(loggerUrl)};
    initializeDevelopmentLogging({logDir:process.env.TALOS_CLI_DEV_LOG_DIR,component:'child-test'});
    process.emitWarning('child warning '+process.env.CHILD_SECRET,{code:'CHILD_WARNING'});
    Promise.reject(new Error('child rejection '+process.env.CHILD_SECRET));
    setTimeout(()=>{throw new Error('child fatal '+process.env.CHILD_SECRET);},20);
    setTimeout(()=>{},100);
  `;
  const child=spawnSync(process.execPath,['--experimental-strip-types','--input-type=module','--eval',script],{
    env:{...process.env,TALOS_CLI_DEV_LOG_DIR:root,OPENROUTER_API_KEY:secret,CHILD_SECRET:secret},encoding:'utf8',timeout:5000,
  });
  assert.notEqual(child.status,0,'the monitor must not convert an uncaught exception into continued execution');
  const {text,rows}=await jsonl(root);
  assert.ok(rows.some(row=>row.event==='process.warning'));
  assert.ok(rows.some(row=>row.event==='process.unhandledRejection'));
  assert.ok(rows.some(row=>row.event==='process.uncaughtExceptionMonitor'));
  assert.doesNotMatch(text,new RegExp(secret,'u'));
});

test('CLI early exits close the development log and parse failures are structured',async()=>{
  const entry=fileURLToPath(new URL('../../src/main.ts',import.meta.url));
  for(const row of [
    {name:'version',args:['--version'],status:0,event:null},
    {name:'parse-failure',args:['--definitely-invalid'],status:2,event:'cli.args.failure'},
  ] as const){
    const root=await mkdtemp(join(tmpdir(),`talos-devlog-main-${row.name}-`));
    const child=spawnSync(process.execPath,['--experimental-strip-types',entry,...row.args],{env:{...process.env,TALOS_CLI_DEV_LOG_DIR:root},encoding:'utf8',timeout:5000});
    assert.equal(child.status,row.status,row.name);
    const {rows}=await jsonl(root);assert.ok(rows.some(item=>item.event==='process.start'),row.name);assert.ok(rows.some(item=>item.event==='process.stop'),row.name);
    if(row.event)assert.ok(rows.some(item=>item.event===row.event),row.name);
  }
});

test('development logger I/O setup failure never throws or blocks TALOS',async()=>{
  const root=await mkdtemp(join(tmpdir(),'talos-devlog-io-'));const blocker=join(root,'file');await writeFile(blocker,'x','utf8');
  assert.doesNotThrow(()=>initializeDevelopmentLogging({logDir:join(blocker,'child'),component:'test'}));
});
