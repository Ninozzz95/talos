import {readdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';

export type WorkflowPromptStep={type:'prompt';template:string};
export type WorkflowSkillStep={type:'skill';name:string};
export type WorkflowCommandStep={type:'command';name:string;args:string[]};
export type WorkflowStep=WorkflowPromptStep|WorkflowSkillStep|WorkflowCommandStep;
export type ProjectCommand={
  name:string;description:string;arguments:string;body:string;file?:string;
  kind:'command'|'workflow';steps:WorkflowStep[];
};

const NAME=/^[a-z0-9][a-z0-9-]{0,63}$/u;
const MAX_FILE_BYTES=65_536;
export const WORKFLOW_MAX_STEPS=64;
export const WORKFLOW_MAX_TEXT_BYTES=16_384;

function fail(code:string,message=code):never{throw Object.assign(new Error(message),{code});}
function textBytes(value:string){return Buffer.byteLength(value,'utf8');}
function assertBoundedText(value:unknown,code:string,{allowEmpty=false}:{allowEmpty?:boolean}={}):string{
  if(typeof value!=='string'||(!allowEmpty&&!value.trim())||textBytes(value)>WORKFLOW_MAX_TEXT_BYTES)fail(code);
  return value;
}
function exactKeys(value:Record<string,unknown>,allowed:readonly string[],code:string){
  if(Object.keys(value).some(key=>!allowed.includes(key)))fail(code);
}
function workflowSteps(raw:string):WorkflowStep[]{
  let value:unknown;try{value=JSON.parse(raw);}catch{fail('WORKFLOW_STEPS_INVALID');}
  if(!Array.isArray(value)||value.length===0)fail('WORKFLOW_STEPS_INVALID');
  if(value.length>WORKFLOW_MAX_STEPS)fail('WORKFLOW_TOO_MANY_STEPS');
  const steps:WorkflowStep[]=[];
  for(const entry of value){
    if(!entry||typeof entry!=='object'||Array.isArray(entry))fail('WORKFLOW_STEP_INVALID');
    const row=entry as Record<string,unknown>;
    if(row.type==='prompt'){
      exactKeys(row,['type','template'],'WORKFLOW_STEP_UNKNOWN_KEY');
      steps.push({type:'prompt',template:assertBoundedText(row.template,'WORKFLOW_PROMPT_INVALID')});
      continue;
    }
    if(row.type==='skill'){
      exactKeys(row,['type','name'],'WORKFLOW_STEP_UNKNOWN_KEY');
      const name=assertBoundedText(row.name,'WORKFLOW_SKILL_INVALID');
      if(!NAME.test(name))fail('WORKFLOW_SKILL_INVALID');
      steps.push({type:'skill',name});
      continue;
    }
    if(row.type==='command'){
      exactKeys(row,['type','name','args'],'WORKFLOW_STEP_UNKNOWN_KEY');
      const name=assertBoundedText(row.name,'WORKFLOW_COMMAND_INVALID');
      if(!NAME.test(name))fail('WORKFLOW_COMMAND_INVALID');
      const args=row.args??[];
      if(!Array.isArray(args)||args.length>WORKFLOW_MAX_STEPS||!args.every(arg=>typeof arg==='string'&&textBytes(arg)<=WORKFLOW_MAX_TEXT_BYTES))fail('WORKFLOW_COMMAND_ARGS_INVALID');
      steps.push({type:'command',name,args:[...args] as string[]});
      continue;
    }
    fail('WORKFLOW_STEP_TYPE_INVALID');
  }
  return steps;
}

function parse(text:string,file:string):ProjectCommand{
  if(Buffer.byteLength(text)>MAX_FILE_BYTES)throw new Error('COMMAND_TOO_LARGE');
  const m=/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/u.exec(text);
  if(!m)throw new Error(`COMMAND_FRONT_MATTER_INVALID:${file}`);
  const meta:Record<string,string>={};
  for(const line of m[1]!.split(/\r?\n/u)){
    if(!line.trim())continue;
    const mm=/^([A-Za-z]+):\s*(.*)$/u.exec(line);
    if(!mm)throw new Error('COMMAND_FRONT_MATTER_INVALID');
    if(!['name','description','arguments','kind','steps'].includes(mm[1]!))throw new Error('COMMAND_FIELD_UNKNOWN');
    if(Object.hasOwn(meta,mm[1]!))throw new Error('COMMAND_FIELD_DUPLICATE');
    meta[mm[1]!]=mm[2]!.replace(/^['"]|['"]$/gu,'');
  }
  if(!meta.name||!NAME.test(meta.name)||!meta.description)throw new Error('COMMAND_FRONT_MATTER_INVALID');
  const kind=meta.kind??'command';
  if(kind!=='command'&&kind!=='workflow')fail('WORKFLOW_KIND_INVALID');
  const body=m[2]!.trim();
  if(kind==='command'){
    if(meta.steps!==undefined)fail('WORKFLOW_STEPS_FORBIDDEN');
    return{name:meta.name,description:meta.description,arguments:meta.arguments??'',body,file,kind:'command',steps:[]};
  }
  if(meta.steps===undefined)fail('WORKFLOW_STEPS_REQUIRED');
  if(body)fail('WORKFLOW_BODY_FORBIDDEN');
  return{name:meta.name,description:meta.description,arguments:meta.arguments??'',body:'',file,kind:'workflow',steps:workflowSteps(meta.steps)};
}

export async function loadCommandFile(file:string){return parse(await readFile(file,'utf8'),file);}
async function markdownFiles(root:string){
  const out:string[]=[];
  async function walk(dir:string){
    let entries:any[];try{entries=await readdir(dir,{withFileTypes:true});}catch(e:any){if(e?.code==='ENOENT')return;throw e;}
    for(const e of entries){
      const p=join(dir,e.name);
      if(e.isDirectory())await walk(p);
      else if(e.isFile()&&e.name.endsWith('.md'))out.push(p);
    }
  }
  await walk(root);return out.sort();
}
export async function loadProjectCommands(root:string):Promise<ProjectCommand[]>{
  const files=await markdownFiles(join(root,'.talos-cli','commands'));const out:ProjectCommand[]=[];const names=new Set<string>();
  for(const f of files){const c=await loadCommandFile(f);if(names.has(c.name))throw new Error('COMMAND_NAME_DUPLICATE');names.add(c.name);out.push(c);}
  return out;
}
export function expandCommand(c:ProjectCommand,vars:Record<string,string>):string{
  return c.body.replace(/\{\{([a-zA-Z0-9_-]+)\}\}/gu,(_m,n)=>{
    if(!Object.hasOwn(vars,n))throw new Error(`COMMAND_VARIABLE_UNKNOWN:${n}`);
    return vars[n]!;
  });
}
export const renderProjectCommand=expandCommand;
