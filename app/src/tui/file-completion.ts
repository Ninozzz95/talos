import {readdir,stat} from 'node:fs/promises';
import {dirname,isAbsolute,resolve} from 'node:path';
import {isPathInsideWorkspace,resolvePathInsideWorkspace,resolveWorkspaceIdentity} from '../security/workspace-identity.ts';

function displayValue(path:string,directory:boolean){const value=path.replaceAll('\\','/')+(directory?'/':'');return /\s/u.test(value)?`@"${value}"`:`@${value}`;}
export async function completeProjectPath(projectRoot:string,token:string):Promise<Array<{value:string;directory:boolean}>>{
  const workspace=await resolveWorkspaceIdentity({projectRoot});let raw=token.startsWith('@')?token.slice(1):token;raw=raw.replace(/^['"]|['"]$/gu,'');
  if(isAbsolute(raw)||process.platform!=='win32'&&/^[A-Za-z]:[\\/]/u.test(raw))return[];
  const logicalTarget=resolve(workspace.requestedRoot,raw);if(!isPathInsideWorkspace(workspace,logicalTarget))return[];
  const parentRaw=raw.endsWith('/')?raw:dirname(raw)==='.'?'':dirname(raw);const prefix=raw.endsWith('/')?'':raw.slice(parentRaw?parentRaw.length+1:0);
  const logicalParent=resolve(workspace.requestedRoot,parentRaw||'.');if(!isPathInsideWorkspace(workspace,logicalParent))return[];
  const parent=await resolvePathInsideWorkspace(workspace,logicalParent);if(!parent)return[];
  let entries;try{entries=await readdir(parent,{withFileTypes:true});}catch{return[];}
  const rows:Array<{name:string;directory:boolean}>=[];
  for(const entry of entries){
    if(!entry.name.startsWith(prefix)||/[\0\r\n]/u.test(entry.name))continue;
    const canonical=await resolvePathInsideWorkspace(workspace,resolve(parent,entry.name));if(!canonical)continue;
    let info;try{info=await stat(canonical);}catch{continue;}
    if(!info.isDirectory()&&!info.isFile())continue;
    rows.push({name:entry.name,directory:info.isDirectory()});
  }
  return rows.sort((a,b)=>Number(b.directory)-Number(a.directory)||a.name.localeCompare(b.name)).map(entry=>({value:displayValue([parentRaw,entry.name].filter(Boolean).join('/'),entry.directory),directory:entry.directory}));
}
