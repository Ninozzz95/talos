import {mkdir,readdir,readFile,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import type {CliPaths} from '../paths.ts';

type ActiveRunInfo={projectRoot?:string;sessionId?:string};
type ActiveRunRecord=ActiveRunInfo&{pid:number;startedAt:string};

function dir(paths:CliPaths){return join(paths.dataRoot,'active-runs');}
function marker(paths:CliPaths,pid=process.pid){return join(dir(paths),`${pid}.json`);}
function alive(pid:number){try{process.kill(pid,0);return true;}catch(error:any){return error?.code==='EPERM';}}

export async function registerActiveRun(paths:CliPaths,info:ActiveRunInfo={}){
  const root=dir(paths);await mkdir(root,{recursive:true,mode:0o700});
  const file=marker(paths);const record:ActiveRunRecord={pid:process.pid,startedAt:new Date().toISOString(),...info};
  await writeFile(file,`${JSON.stringify(record)}\n`,{encoding:'utf8',mode:0o600});
  let released=false;
  return async()=>{if(released)return;released=true;await rm(file,{force:true});};
}

export async function hasActiveRuns(paths:CliPaths,deps:{isProcessAlive?:(pid:number)=>boolean}={}){
  const isProcessAlive=deps.isProcessAlive??alive;let names:string[];
  try{names=await readdir(dir(paths));}catch(error:any){if(error?.code==='ENOENT')return false;throw error;}
  let any=false;
  for(const name of names){if(!/^\d+\.json$/u.test(name))continue;const file=join(dir(paths),name);let pid=0;
    try{const data=JSON.parse(await readFile(file,'utf8'));pid=Number(data?.pid);}catch{await rm(file,{force:true});continue;}
    if(!Number.isSafeInteger(pid)||pid<=0||!isProcessAlive(pid)){await rm(file,{force:true});continue;}
    any=true;
  }
  return any;
}
