import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {installWindowsAutomationRunner,uninstallWindowsAutomationRunner,TALOS_AUTOMATION_TASK_NAME} from '../../src/automations/windows-task.ts';

test('install-runner writes an auditable task definition and creates only the TALOS-owned task',async()=>{
  const root=await mkdtemp(join(tmpdir(),'talos-cli-task-'));
  const calls:Array<{file:string,args:string[]}>=[];
  const result=await installWindowsAutomationRunner({
    platform:'win32',
    cliRoot:'C:\\Users\\me\\AppData\\Local\\Programs\\TALOS CLI',
    definitionDir:root,
    username:'ME\\alice',
    spawnSyncImpl:(file:string,args:string[])=>{calls.push({file,args});return {status:0,stdout:'SUCCESS',stderr:''} as any;},
  });
  assert.equal(result.taskName,TALOS_AUTOMATION_TASK_NAME);
  assert.equal(calls.length,1);
  assert.equal(calls[0]?.file.toLowerCase().endsWith('schtasks.exe'),true);
  assert.deepEqual(calls[0]?.args.slice(0,4),['/Create','/F','/TN',TALOS_AUTOMATION_TASK_NAME]);
  assert.match(calls[0]?.args.join(' '),/automation serve/u);
  assert.match(calls[0]?.args.join(' '),/ONLOGON/u);
  const xml=await readFile(result.definitionFile,'utf8');
  assert.match(xml,/TALOS CLI Automation Runner/u);
  assert.match(xml,/automation serve/u);
  assert.match(xml,/ME\\alice/u);
});

test('uninstall-runner deletes exactly the TALOS-owned task name',()=>{
  const calls:Array<{file:string,args:string[]}>=[];
  uninstallWindowsAutomationRunner({platform:'win32',spawnSyncImpl:(file:string,args:string[])=>{calls.push({file,args});return {status:0,stdout:'',stderr:''} as any;}});
  assert.deepEqual(calls[0]?.args,['/Delete','/F','/TN',TALOS_AUTOMATION_TASK_NAME]);
});

test('runner installation refuses non-Windows platforms',async()=>{
  await assert.rejects(()=>installWindowsAutomationRunner({platform:'linux',cliRoot:'/tmp/talos',definitionDir:'/tmp',username:'user'} as any),/WINDOWS_REQUIRED/u);
});


test('M10-B RED — runner health is explicit healthy missing unhealthy or unsupported and never fabricates health',async()=>{
  const {probeWindowsAutomationRunner}=await import('../../src/automations/windows-task.ts');
  assert.deepEqual(await probeWindowsAutomationRunner({platform:'linux'} as any),{state:'unsupported',platform:'linux',taskName:TALOS_AUTOMATION_TASK_NAME});
  const healthy=await probeWindowsAutomationRunner({platform:'win32',spawnSyncImpl:()=>({status:0,stdout:'<Task><Arguments>automation serve</Arguments></Task>',stderr:''}) as any} as any);
  assert.equal(healthy.state,'healthy');
  const missing=await probeWindowsAutomationRunner({platform:'win32',spawnSyncImpl:()=>({status:1,stdout:'',stderr:''}) as any} as any);
  assert.equal(missing.state,'missing');
  const unhealthy=await probeWindowsAutomationRunner({platform:'win32',spawnSyncImpl:()=>({status:0,stdout:'<Task><Arguments>other</Arguments></Task>',stderr:''}) as any} as any);
  assert.equal(unhealthy.state,'unhealthy');
});
