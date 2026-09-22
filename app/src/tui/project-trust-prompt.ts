import type {NestedRepository} from '../security/workspace-identity.ts';
import type {ProjectTrustAssessment} from '../security/project-trust-gate.ts';
import {detectTerminalCapabilities} from './terminal-capabilities.ts';
import {createTuiTheme} from './theme.ts';

export type ProjectTrustPromptChoice='cancel'|'trust';
export type ProjectTrustPromptInput={assessment:ProjectTrustAssessment;nestedRepositories:readonly NestedRepository[]};
export type ProjectTrustPromptModel={
  title:string;
  project:string;
  reason:string;
  resourceSummary:string;
  resources:string[];
  nestedRepositories:string[];
  defaultSelection:ProjectTrustPromptChoice;
};

const TERMINAL_UNSAFE=/[\\\x00-\x1f\x7f-\x9f\u2028\u2029\p{Bidi_Control}\p{Default_Ignorable_Code_Point}]/gu;
const BACKSLASH=String.fromCharCode(92);

export function inertProjectTrustText(value:string):string{
  return value.replace(TERMINAL_UNSAFE,character=>{
    if(character===BACKSLASH)return BACKSLASH+BACKSLASH;
    const code=character.codePointAt(0)!;
    return code>0xffff?`${BACKSLASH}u{${code.toString(16)}}`:`${BACKSLASH}u${code.toString(16).padStart(4,'0')}`;
  });
}

function reasonText(assessment:ProjectTrustAssessment):string{
  if(assessment.reason==='PROJECT_UNTRUSTED')return 'This folder contains project instructions or executable resources that TALOS has not trusted yet.';
  if(assessment.reason==='RESOURCE_FINGERPRINT_CHANGED')return 'A file in the previously trusted project snapshot changed on disk.';
  if(assessment.reason==='RESOURCE_SET_CHANGED')return 'The set of files in the previously trusted project snapshot changed on disk.';
  if(assessment.reason==='RESOURCE_IDENTITY_MISMATCH')return 'A project resource no longer matches the identity of this folder.';
  if(assessment.reason==='NESTED_REPOSITORY_BOUNDARY_CHANGED')return 'A nested repository boundary changed around project resources. Review the boundary explicitly before trusting it.';
  return `The previously trusted project snapshot changed (${assessment.reason}).`;
}

export function projectTrustPromptModel({assessment,nestedRepositories}:ProjectTrustPromptInput):ProjectTrustPromptModel{
  const counts=new Map<string,number>();
  for(const resource of assessment.resources)counts.set(resource.kind,(counts.get(resource.kind)??0)+1);
  const detail=[...counts.entries()].sort(([left],[right])=>left.localeCompare(right)).map(([kind,count])=>`${kind} ${count}`).join(', ');
  const resourceSummary=`${assessment.resources.length} project resource${assessment.resources.length===1?'':'s'}${detail?` (${detail})`:''}`;
  return{
    title:assessment.reason==='PROJECT_UNTRUSTED'?'Trust this folder?':'Trust the changed folder snapshot?',
    project:inertProjectTrustText(assessment.workspace.canonicalRoot),
    reason:reasonText(assessment),
    resourceSummary,
    resources:assessment.resources.map(resource=>`${resource.kind} · ${inertProjectTrustText(resource.id)} · ${inertProjectTrustText(resource.relativePath)}`),
    nestedRepositories:nestedRepositories.map(entry=>inertProjectTrustText(entry.relativePath)),
    defaultSelection:'cancel',
  };
}

export function nextProjectTrustSelection(current:ProjectTrustPromptChoice,direction:'previous'|'next'|'toggle'):ProjectTrustPromptChoice{
  if(direction==='toggle')return current==='cancel'?'trust':'cancel';
  return direction==='next'?'trust':'cancel';
}

export async function runProjectTrustPrompt(input:ProjectTrustPromptInput):Promise<ProjectTrustPromptChoice>{
  if(!process.stdin.isTTY||!process.stdout.isTTY)return'cancel';
  let React:any,Ink:any;
  try{React=await import('react');Ink=await import('ink');}catch{throw new Error('TUI_DEPENDENCY_UNAVAILABLE');}
  const capabilities=detectTerminalCapabilities({stdinIsTTY:true,stdoutIsTTY:true,color:true,env:process.env});
  const theme=createTuiTheme(capabilities);
  const model=projectTrustPromptModel(input);
  let settled=false;
  let settle:(choice:ProjectTrustPromptChoice)=>void=()=>{};
  const choicePromise=new Promise<ProjectTrustPromptChoice>(resolve=>{settle=choice=>{if(settled)return;settled=true;resolve(choice);};});

  function Prompt(){
    const [selected,setSelected]=React.useState(model.defaultSelection);
    const {exit}=Ink.useApp();
    const finish=(choice:ProjectTrustPromptChoice)=>{settle(choice);exit();};
    Ink.useInput((value:string,key:any)=>{
      if(key.escape||(key.ctrl&&value.toLowerCase()==='c')){finish('cancel');return;}
      if(key.leftArrow||key.upArrow){setSelected('cancel');return;}
      if(key.rightArrow||key.downArrow){setSelected('trust');return;}
      if(key.tab){setSelected((current:ProjectTrustPromptChoice)=>nextProjectTrustSelection(current,'toggle'));return;}
      if(value.toLowerCase()==='c'){setSelected('cancel');return;}
      if(value.toLowerCase()==='t'){setSelected('trust');return;}
      if(key.return)finish(selected);
    });
    const children:any[]=[
      React.createElement(Ink.Text,{key:'title',bold:true,color:theme.colors.warning},`TALOS · ${model.title}`),
      React.createElement(Ink.Text,{key:'project'},`Folder: ${model.project}`),
      React.createElement(Ink.Text,{key:'reason'},model.reason),
      React.createElement(Ink.Text,{key:'resources',dimColor:true},`Resources covered by this decision: ${model.resourceSummary}`),
    ];
    for(const [index,resource] of model.resources.slice(0,8).entries())children.push(React.createElement(Ink.Text,{key:`resource-${index}`,dimColor:true},`  - ${resource}`));
    if(model.resources.length>8)children.push(React.createElement(Ink.Text,{key:'resource-more',dimColor:true},`  - and ${model.resources.length-8} more`));
    if(model.nestedRepositories.length){
      children.push(React.createElement(Ink.Text,{key:'nested-head',color:theme.colors.warning},'Nested repository boundaries included in this snapshot:'));
      for(const [index,nested] of model.nestedRepositories.entries())children.push(React.createElement(Ink.Text,{key:`nested-${index}`},`  - ${nested}`));
    }
    children.push(
      React.createElement(Ink.Text,{key:'blank'},''),
      React.createElement(Ink.Text,{key:'cancel',bold:selected==='cancel',color:selected==='cancel'?theme.colors.accent:undefined},`${selected==='cancel'?'>':' '} Cancel`),
      React.createElement(Ink.Text,{key:'trust',bold:selected==='trust',color:selected==='trust'?theme.colors.accent:undefined},`${selected==='trust'?'>':' '} Trust this folder`),
      React.createElement(Ink.Text,{key:'keys',dimColor:true},'Arrows/Tab choose · Enter confirms · Esc/Ctrl+C cancels'),
    );
    return React.createElement(Ink.Box,{flexDirection:'column',borderStyle:'round',borderColor:theme.colors.warning,paddingX:1},...children);
  }

  const rendered=Ink.render(React.createElement(Prompt),{exitOnCtrlC:false});
  const exitPromise=rendered.waitUntilExit().then(()=>{if(!settled)settle('cancel');});
  const choice=await choicePromise;
  await exitPromise;
  return choice;
}
