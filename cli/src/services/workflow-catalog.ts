import {readdir} from 'node:fs/promises';
import {basename,join,relative} from 'node:path';
import type {CliPaths} from '../paths.ts';
import {findTalosRepoRoot,importTalosModule} from '../runtime/repo.ts';
import {createTrustAuthority,type TrustAuthority,type TrustAuthoritySnapshot} from '../security/trust-authority.ts';
import {loadCommandFile,renderProjectCommand,type ProjectCommand,type WorkflowStep} from '../commands/project-commands.ts';

export type WorkflowCatalogKind='command'|'workflow'|'skill';
export type WorkflowCatalogProvenance={scope:'project-command'|'user-command'|'project-skill';path:string};
export type WorkflowCatalogValidation={valid:boolean;code:string|null;message:string|null};
export type WorkflowCatalogTrust={
  required:boolean;trusted:boolean;
  state:'trusted'|'changed'|'added'|'removed'|'untracked'|'user-controlled'|'inert-text';
  currentFingerprint:string|null;trustedFingerprint:string|null;
};
export type WorkflowCatalogReference={type:'command'|'skill';name:string;id:string|null};
export type WorkflowCatalogRow={
  id:string;kind:WorkflowCatalogKind;name:string;description:string|null;arguments:string;
  provenance:WorkflowCatalogProvenance;validation:WorkflowCatalogValidation;trust:WorkflowCatalogTrust;
  executableSteps:number;references:WorkflowCatalogReference[];
};
export type WorkflowRunStep={type:'prompt'|'skill'|'command';name:string|null;id:string|null;text:string};
export type WorkflowRunResult={id:string;kind:'command'|'workflow';prompt:string;steps:WorkflowRunStep[]};

type SkillRow={id:string;name:string;description:string;corpo:string};
type Source={row:WorkflowCatalogRow;command?:ProjectCommand;skill?:SkillRow;steps?:WorkflowStep[]};
type Build={rows:WorkflowCatalogRow[];sources:Map<string,Source>};
export type WorkflowCatalogInput={projectRoot:string;repoRoot?:string;paths:CliPaths};
export type WorkflowCatalogDependencies={authority?:TrustAuthority;loadSkills?:()=>Promise<{skills:SkillRow[]}>};

function fail(code:string,message=code):never{throw Object.assign(new Error(message),{code});}
function errorCode(error:unknown,fallback:string){
  const code=(error as any)?.code;if(typeof code==='string'&&code)return code;
  const message=error instanceof Error?error.message:String(error);
  const match=/^([A-Z][A-Z0-9_]+)/u.exec(message);return match?.[1]??fallback;
}
function errorMessage(error:unknown){return error instanceof Error?error.message:String(error);}
function slash(value:string){return value.split('\\').join('/');}
function stripMd(value:string){return value.toLowerCase().endsWith('.md')?value.slice(0,-3):value;}
async function markdownFiles(root:string){
  const out:string[]=[];
  async function walk(dir:string){
    let entries:any[];try{entries=await readdir(dir,{withFileTypes:true});}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return;throw error;}
    for(const entry of entries){const file=join(dir,entry.name);if(entry.isDirectory())await walk(file);else if(entry.isFile()&&entry.name.toLowerCase().endsWith('.md'))out.push(file);}
  }
  await walk(root);return out.sort();
}
function stableId(scope:'project'|'user',root:string,file:string){return scope+':'+stripMd(slash(relative(root,file)));}
function projectPath(root:string,file:string){return '.talos-cli/commands/'+slash(relative(root,file));}
function invalidName(file:string){return stripMd(basename(file));}
function vars(args:readonly string[]){return Object.fromEntries(args.map((value,index)=>['arg'+(index+1),value]));}
function expandText(template:string,values:Record<string,string>){
  return template.replace(/\{\{([a-zA-Z0-9_-]+)\}\}/gu,(_match,name)=>{
    if(!Object.hasOwn(values,name))throw Object.assign(new Error('COMMAND_VARIABLE_UNKNOWN:'+name),{code:'COMMAND_VARIABLE_UNKNOWN'});
    return values[name]!;
  });
}
function resourceTrust(snapshot:TrustAuthoritySnapshot,path:string):WorkflowCatalogTrust{
  const resource=snapshot.resources.find(row=>row.kind==='command'&&row.relativePath===path);
  if(!resource)return{required:true,trusted:false,state:'untracked',currentFingerprint:null,trustedFingerprint:null};
  return{required:true,trusted:resource.state==='trusted',state:resource.state,currentFingerprint:resource.currentFingerprint??null,trustedFingerprint:resource.trustedFingerprint??null};
}
function userTrust():WorkflowCatalogTrust{return{required:false,trusted:true,state:'user-controlled',currentFingerprint:null,trustedFingerprint:null};}
function skillTrust():WorkflowCatalogTrust{return{required:false,trusted:true,state:'inert-text',currentFingerprint:null,trustedFingerprint:null};}
function validation(valid:boolean,code:string|null=null,message:string|null=null):WorkflowCatalogValidation{return{valid,code,message};}

export function createWorkflowCatalog(input:WorkflowCatalogInput,deps:WorkflowCatalogDependencies={}){
  const authority=deps.authority??createTrustAuthority({projectRoot:input.projectRoot,trustRoot:input.paths.trust.projects});
  const repoRoot=()=>input.repoRoot??findTalosRepoRoot(input.projectRoot);
  const loadSkills=deps.loadSkills??(async()=>{
    const mod:any=await importTalosModule(repoRoot(),'skill-registry.mjs');
    const loaded=await mod.caricaSkill({cartella:input.projectRoot});
    if(!loaded||!Array.isArray(loaded.skills))fail('SKILL_REGISTRY_INVALID');
    return{skills:loaded.skills};
  });

  async function build():Promise<Build>{
    const projectRoot=join(input.projectRoot,'.talos-cli','commands');
    const userRoot=join(input.paths.configRoot,'commands');
    const [projectFiles,userFiles,snapshot]=await Promise.all([markdownFiles(projectRoot),markdownFiles(userRoot),authority.inspect()]);
    const sources=new Map<string,Source>();

    async function addCommand(scope:'project'|'user',root:string,file:string){
      const id=stableId(scope,root,file);
      const provenance:WorkflowCatalogProvenance=scope==='project'
        ?{scope:'project-command',path:projectPath(projectRoot,file)}
        :{scope:'user-command',path:'commands/'+slash(relative(userRoot,file))};
      const trust=scope==='project'?resourceTrust(snapshot,provenance.path):userTrust();
      try{
        const command=await loadCommandFile(file);
        const row:WorkflowCatalogRow={
          id,kind:command.kind,name:command.name,description:command.description,arguments:command.arguments,
          provenance,validation:validation(true),trust,
          executableSteps:command.kind==='workflow'?command.steps.filter(step=>step.type==='command').length:1,
          references:[]
        };
        sources.set(id,{row,command,steps:command.steps});
      }catch(error){
        const code=errorCode(error,'COMMAND_INVALID');
        const row:WorkflowCatalogRow={
          id,kind:'command',name:invalidName(file),description:null,arguments:'',provenance,
          validation:validation(false,code,errorMessage(error)),trust,executableSteps:0,references:[]
        };
        sources.set(id,{row});
      }
    }
    for(const file of projectFiles)await addCommand('project',projectRoot,file);
    for(const file of userFiles)await addCommand('user',userRoot,file);

    try{
      const loaded=await loadSkills();
      for(const skill of loaded.skills){
        if(!skill||typeof skill.id!=='string'||typeof skill.name!=='string'||typeof skill.description!=='string'||typeof skill.corpo!=='string'){
          fail('SKILL_REGISTRY_INVALID');
        }
        const id='skill:'+skill.id;
        const row:WorkflowCatalogRow={
          id,kind:'skill',name:skill.name,description:skill.description,arguments:'',
          provenance:{scope:'project-skill',path:'.harness-ui-skills/'+skill.id+'/SKILL.md'},
          validation:validation(true),trust:skillTrust(),executableSteps:0,references:[]
        };
        sources.set(id,{row,skill});
      }
    }catch(error){
      const code=errorCode(error,'SKILL_REGISTRY_INVALID');
      const row:WorkflowCatalogRow={
        id:'skill:registry-error',kind:'skill',name:'registry-error',description:null,arguments:'',
        provenance:{scope:'project-skill',path:'.harness-ui-skills'},
        validation:validation(false,code,errorMessage(error)),trust:skillTrust(),executableSteps:0,references:[]
      };
      sources.set(row.id,{row});
    }

    const commandByName=(name:string)=>[...sources.values()].filter(source=>source.row.kind==='command'&&source.row.name===name);
    const skillByName=(name:string)=>[...sources.values()].filter(source=>source.row.kind==='skill'&&source.row.validation.valid&&source.row.name===name);

    for(const source of sources.values()){
      if(source.row.kind!=='workflow'||!source.row.validation.valid||!source.steps)continue;
      const refs:WorkflowCatalogReference[]=[];
      let invalid:WorkflowCatalogValidation|null=null;
      for(const step of source.steps){
        if(step.type==='prompt')continue;
        if(step.type==='skill'){
          const matches=skillByName(step.name);
          const id=matches.length===1?matches[0]!.row.id:null;refs.push({type:'skill',name:step.name,id});
          if(matches.length===0)invalid=validation(false,'WORKFLOW_SKILL_NOT_FOUND','Workflow skill not found: '+step.name);
          else if(matches.length>1)invalid=validation(false,'WORKFLOW_SKILL_AMBIGUOUS','Workflow skill reference is ambiguous: '+step.name);
          if(invalid)break;continue;
        }
        const matches=commandByName(step.name);
        const id=matches.length===1?matches[0]!.row.id:null;refs.push({type:'command',name:step.name,id});
        if(matches.length===0)invalid=validation(false,'WORKFLOW_COMMAND_NOT_FOUND','Workflow command not found: '+step.name);
        else if(matches.length>1)invalid=validation(false,'WORKFLOW_COMMAND_AMBIGUOUS','Workflow command reference is ambiguous: '+step.name);
        else if(!matches[0]!.row.validation.valid)invalid=validation(false,'WORKFLOW_COMMAND_INVALID','Workflow command target is invalid: '+step.name);
        if(invalid)break;
      }
      source.row.references=refs;
      if(invalid)source.row.validation=invalid;
    }

    const rows=[...sources.values()].map(source=>source.row).sort((a,b)=>a.id.localeCompare(b.id));
    return{rows,sources};
  }

  function resolve(build:Build,selector:string,{runnable=false}:{runnable?:boolean}={}){
    const direct=build.sources.get(selector);if(direct){if(runnable&&direct.row.kind==='skill')fail('WORKFLOW_ENTRY_NOT_RUNNABLE');return direct;}
    const matches=[...build.sources.values()].filter(source=>source.row.name===selector&&(!runnable||source.row.kind!=='skill'));
    if(matches.length===0)fail('WORKFLOW_ENTRY_NOT_FOUND');
    if(matches.length>1)fail('WORKFLOW_ENTRY_AMBIGUOUS');
    return matches[0]!;
  }
  function assertValid(source:Source){if(!source.row.validation.valid)fail(source.row.validation.code??'WORKFLOW_ENTRY_INVALID',source.row.validation.message??source.row.validation.code??'WORKFLOW_ENTRY_INVALID');}
  function assertRunnableTrust(source:Source,step=false){
    if(source.row.trust.required&&!source.row.trust.trusted)fail(step?'WORKFLOW_STEP_TRUST_REQUIRED':'WORKFLOW_TRUST_REQUIRED');
  }

  return{
    async list():Promise<WorkflowCatalogRow[]>{return (await build()).rows;},
    async show(selector:string):Promise<WorkflowCatalogRow>{const built=await build();return resolve(built,selector).row;},
    async run(selector:string,args:readonly string[]=[]):Promise<WorkflowRunResult>{
      const built=await build();const source=resolve(built,selector,{runnable:true});assertValid(source);assertRunnableTrust(source);
      if(!source.command)fail('WORKFLOW_ENTRY_INVALID');
      const values=vars(args);
      if(source.row.kind==='command'){
        const prompt=renderProjectCommand(source.command,values);
        return{id:source.row.id,kind:'command',prompt,steps:[]};
      }
      const rendered:WorkflowRunStep[]=[];const chunks:string[]=[];
      for(const step of source.steps??[]){
        if(step.type==='prompt'){const text=expandText(step.template,values);chunks.push(text);rendered.push({type:'prompt',name:null,id:null,text});continue;}
        if(step.type==='skill'){
          const matches=[...built.sources.values()].filter(candidate=>candidate.row.kind==='skill'&&candidate.row.validation.valid&&candidate.row.name===step.name);
          if(matches.length===0)fail('WORKFLOW_SKILL_NOT_FOUND');if(matches.length>1)fail('WORKFLOW_SKILL_AMBIGUOUS');
          const target=matches[0]!;if(!target.skill)fail('WORKFLOW_SKILL_INVALID');
          const text=target.skill.corpo;chunks.push(text);rendered.push({type:'skill',name:step.name,id:target.row.id,text});continue;
        }
        const matches=[...built.sources.values()].filter(candidate=>candidate.row.kind==='command'&&candidate.row.name===step.name);
        if(matches.length===0)fail('WORKFLOW_COMMAND_NOT_FOUND');if(matches.length>1)fail('WORKFLOW_COMMAND_AMBIGUOUS');
        const target=matches[0]!;assertValid(target);assertRunnableTrust(target,true);if(!target.command)fail('WORKFLOW_COMMAND_INVALID');
        const expandedArgs=step.args.map(value=>expandText(value,values));
        const text=renderProjectCommand(target.command,vars(expandedArgs));chunks.push(text);rendered.push({type:'command',name:step.name,id:target.row.id,text});
      }
      return{id:source.row.id,kind:'workflow',prompt:chunks.join('\n\n'),steps:rendered};
    }
  };
}
