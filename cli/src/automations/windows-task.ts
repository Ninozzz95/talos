import {mkdir,writeFile} from 'node:fs/promises';
import {join,win32} from 'node:path';
import {spawnSync} from 'node:child_process';

export const TALOS_AUTOMATION_TASK_NAME='TALOS CLI Automation Runner';

type SpawnResult={status:number|null;stdout?:string|Buffer|null;stderr?:string|Buffer|null;error?:Error};
type SpawnSyncLike=(file:string,args:string[],options?:Record<string,unknown>)=>SpawnResult;

function requireWindows(platform:string){if(platform!=='win32')throw Object.assign(new Error('WINDOWS_REQUIRED'),{code:'WINDOWS_REQUIRED'});}
function xmlEscape(value:string){return value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');}
function output(value:unknown){if(Buffer.isBuffer(value))return value.toString('utf8');return typeof value==='string'?value:'';}
function schtasksPath(systemRoot:string|undefined){return systemRoot?win32.join(systemRoot,'System32','schtasks.exe'):'schtasks.exe';}
function ensureSuccess(result:SpawnResult,operation:string){if(result.error)throw Object.assign(new Error(`${operation}: ${result.error.message}`),{code:'AUTOMATION_TASK_FAILED'});if(result.status!==0)throw Object.assign(new Error(`${operation}: ${output(result.stderr)||output(result.stdout)||`exit ${result.status}`}`),{code:'AUTOMATION_TASK_FAILED'});}

export function windowsAutomationTaskDefinition(input:{launcher:string;username:string}){
  const command=`\"${input.launcher}\" automation serve`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">\n  <RegistrationInfo><Description>${TALOS_AUTOMATION_TASK_NAME}</Description></RegistrationInfo>\n  <Triggers><LogonTrigger><Enabled>true</Enabled><UserId>${xmlEscape(input.username)}</UserId></LogonTrigger></Triggers>\n  <Principals><Principal id="Author"><UserId>${xmlEscape(input.username)}</UserId><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>\n  <Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries><StopIfGoingOnBatteries>false</StopIfGoingOnBatteries><AllowHardTerminate>true</AllowHardTerminate><StartWhenAvailable>true</StartWhenAvailable><Enabled>true</Enabled><ExecutionTimeLimit>PT0S</ExecutionTimeLimit></Settings>\n  <Actions Context="Author"><Exec><Command>${xmlEscape(input.launcher)}</Command><Arguments>automation serve</Arguments></Exec></Actions>\n</Task>\n<!-- Equivalent action: ${xmlEscape(command)} -->\n`;
}

export async function installWindowsAutomationRunner(input:{
  platform?:string;cliRoot:string;definitionDir:string;username:string;systemRoot?:string;spawnSyncImpl?:SpawnSyncLike;
}){
  const platform=input.platform??process.platform;requireWindows(platform);
  if(!input.username.trim())throw Object.assign(new Error('AUTOMATION_USERNAME_REQUIRED'),{code:'AUTOMATION_USERNAME_REQUIRED'});
  const launcher=win32.join(input.cliRoot,'bin','talos.cmd');
  await mkdir(input.definitionDir,{recursive:true});
  const definitionFile=join(input.definitionDir,'windows-task.xml');
  await writeFile(definitionFile,windowsAutomationTaskDefinition({launcher,username:input.username}),'utf8');
  const action=`\"${launcher}\" automation serve`;
  const spawnImpl=input.spawnSyncImpl??spawnSync as unknown as SpawnSyncLike;
  const result=spawnImpl(schtasksPath(input.systemRoot??process.env.SystemRoot),['/Create','/F','/TN',TALOS_AUTOMATION_TASK_NAME,'/SC','ONLOGON','/RU',input.username,'/RL','LIMITED','/TR',action],{encoding:'utf8',windowsHide:true});
  ensureSuccess(result,'schtasks /Create');
  return {ok:true,taskName:TALOS_AUTOMATION_TASK_NAME,definitionFile,launcher};
}

export function uninstallWindowsAutomationRunner(input:{platform?:string;systemRoot?:string;spawnSyncImpl?:SpawnSyncLike}={}){
  requireWindows(input.platform??process.platform);
  const spawnImpl=input.spawnSyncImpl??spawnSync as unknown as SpawnSyncLike;
  const result=spawnImpl(schtasksPath(input.systemRoot??process.env.SystemRoot),['/Delete','/F','/TN',TALOS_AUTOMATION_TASK_NAME],{encoding:'utf8',windowsHide:true});
  ensureSuccess(result,'schtasks /Delete');
  return {ok:true,taskName:TALOS_AUTOMATION_TASK_NAME};
}

export async function probeWindowsAutomationRunner(input:{platform?:string;systemRoot?:string;spawnSyncImpl?:SpawnSyncLike}={}){
  const platform=input.platform??process.platform;
  if(platform!=='win32')return{state:'unsupported' as const,platform,taskName:TALOS_AUTOMATION_TASK_NAME};
  const spawnImpl=input.spawnSyncImpl??spawnSync as unknown as SpawnSyncLike;
  const result=spawnImpl(schtasksPath(input.systemRoot??process.env.SystemRoot),['/Query','/TN',TALOS_AUTOMATION_TASK_NAME,'/XML'],{encoding:'utf8',windowsHide:true});
  if(result.status===1&&!result.error)return{state:'missing' as const,platform,taskName:TALOS_AUTOMATION_TASK_NAME};
  if(result.error||result.status!==0)return{state:'unhealthy' as const,platform,taskName:TALOS_AUTOMATION_TASK_NAME,code:'AUTOMATION_TASK_QUERY_FAILED'};
  const xml=output(result.stdout);const healthy=/<Arguments>\s*automation serve\s*<\/Arguments>/u.test(xml);
  return healthy?{state:'healthy' as const,platform,taskName:TALOS_AUTOMATION_TASK_NAME}:{state:'unhealthy' as const,platform,taskName:TALOS_AUTOMATION_TASK_NAME,code:'AUTOMATION_TASK_DEFINITION_MISMATCH'};
}
