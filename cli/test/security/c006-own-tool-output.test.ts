/*
 * Ticket C-006 (benchmark lane, 01/10; owner: «cartella propria leggibile»). TALOS saves a long output under
 * `<dataRoot>/tool-output/<sessionId>/` and tells the model to read that file (output-store.ts); on Linux the data root is a
 * hidden folder outside the project (`~/.local/state/…`), so the read asked and, in `talos -p`, ended the run (4 trials).
 * Now the session that asks may READ its own folder in every mode — never write or delete there, never read another
 * session's folder. OpenCode is the precedent: its truncation folder is always an allowed external directory
 * (packages/opencode/src/agent/agent.ts:296-308).
 */
import assert from 'node:assert/strict';import test from 'node:test';
import {mkdtempSync,mkdirSync,symlinkSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPermissionEngine} from '../../src/security/permission-engine.ts';
import {collectHeadlessRun} from '../../src/headless/run.ts';
import type {PermissionAction,PermissionMode} from '../../src/security/types.ts';

function layout(){
  const base=mkdtempSync(join(tmpdir(),'talos-c006-'));
  const project=join(base,'project');mkdirSync(project);
  const root=join(base,'.local','state','talos-cli','tool-output');
  for(const session of ['s1','s2']){mkdirSync(join(root,session),{recursive:true});writeFileSync(join(root,session,'1-a.txt'),'full output\n');}
  return{project,root,file:(session:string)=>join(root,session,'1-a.txt')};
}
const engineFor=(project:string,root:string|undefined)=>createPermissionEngine({projectRoot:project,rules:{allow:[],ask:[],deny:[]},...(root?{toolOutputRoot:root}:{})});
const decide=(project:string,root:string|undefined,action:PermissionAction,sessionId:string|undefined,mode:PermissionMode='default')=>engineFor(project,root).decide(action,{interactive:false,mode,...(sessionId?{sessionId}:{})});

test('C-006: the asking session reads its own saved outputs in every mode, with Read and with a read-only command',async()=>{
  const {project,root,file}=layout();
  for(const mode of ['default','dontAsk','plan','acceptEdits'] as const){
    assert.equal((await decide(project,root,{tool:'Read',resource:file('s1'),sensitive:'outside-hidden'},'s1',mode)).kind,'allow',`Read, ${mode}`);
    assert.equal((await decide(project,root,{tool:'Bash',command:`cat "${file('s1')}" | sed -n '1,200p'`,sensitive:'outside-hidden'},'s1',mode)).kind,'allow',`cat, ${mode}`);
    assert.equal((await decide(project,root,{tool:'Bash',command:`grep -o full ${join(root,'s1')}/*.txt | head -5`,sensitive:'outside-hidden'},'s1',mode)).kind,'allow',`grep glob, ${mode}`);
  }
});

test('C-006: never another session\'s folder, never a write or a delete, never without a session or a root',async()=>{
  const {project,root,file}=layout();
  const refused=async(action:PermissionAction,sessionId:string|undefined,withRoot=true)=>assert.equal((await decide(project,withRoot?root:undefined,action,sessionId)).kind,'deny',JSON.stringify({action,sessionId,withRoot}));
  await refused({tool:'Read',resource:file('s2')},'s1');
  await refused({tool:'Bash',command:`cat "${file('s2')}"`},'s1');
  await refused({tool:'Bash',command:`cat "${join(root,'s1','..','s2','1-a.txt')}"`},'s1');
  await refused({tool:'Bash',command:`cat ${join(root,'s1')}/../s2/1-a.txt`},'s1');
  await refused({tool:'Bash',command:`rm -r "${join(root,'s1')}"`},'s1');
  await refused({tool:'Write',resource:file('s1')},'s1');
  await refused({tool:'Read',resource:file('s1')},undefined);
  await refused({tool:'Read',resource:file('s1')},'s1',false);
  await refused({tool:'Read',resource:file('s1')},'../s1');
  /* An id that climbs out of its own folder is not a session: s1/../s2 would name the other session's folder. */
  await refused({tool:'Read',resource:file('s2')},'s1/../s2');
  await refused({tool:'Read',resource:file('s2')},['s1','..','s2'].join(String.fromCharCode(92)));
  /* One outside operand next to the saved file still decides the whole command. */
  await refused({tool:'Bash',command:`cat "${file('s1')}" /etc/hosts`},'s1');
});

test('C-006: a link inside the own folder that leads to another session is judged where it leads',async()=>{
  const {project,root}=layout();
  symlinkSync(join(root,'s2'),join(root,'s1','elsewhere'),'junction');
  assert.equal((await decide(project,root,{tool:'Read',resource:join(root,'s1','elsewhere','1-a.txt')},'s1')).kind,'deny');
  assert.equal((await decide(project,root,{tool:'Bash',command:`cat "${join(root,'s1','elsewhere','1-a.txt')}"`},'s1')).kind,'deny');
});

for(const protocolVersion of ['v1','v2'] as const)test(`C-006 headless ${protocolVersion}: reading the spilled file is answered yes, without a denial`,async()=>{
  const {project,root,file}=layout();
  let sink:((event:unknown)=>void)|null=null;const answered:unknown[][]=[];
  const runtime:any={
    start:async()=>'s1',restore:async()=>({restored:0,total:0}),resume:async(x:string)=>x,fork:async()=>'',export:()=>null,close:async()=>{},cancel:async()=>{},
    subscribe(_id:string,next:(event:unknown)=>void){sink=next;queueMicrotask(()=>next({type:'ApprovalRequested',requestId:'r1',azione:{tipo:'shell',comando:`cat "${file('s1')}"`,segreto:{classe:'fuori-workspace-nascosto',percorso:file('s1'),frase:'…'}}}));return()=>{};},
    answerApproval:async(...args:unknown[])=>{answered.push(args);queueMicrotask(()=>sink?.({type:'RunFinished'}));},
  };
  const x:any=await collectHeadlessRun(runtime,{projectRoot:project,prompt:'x',model:'m',permissionMode:'default',permissionRules:{allow:[],ask:[],deny:[]},timeoutSeconds:20,toolOutputRoot:root,protocolVersion} as any);
  assert.deepEqual(answered[0]?.slice(0,3),['s1','r1',true]);
  assert.equal(x.result.ok,true);
  assert.equal('permissionDenials' in x.result,false);
});

test('C-006: sed counts as a read only when it prints lines (sed -n N[,M]p), as in Codex',async()=>{
  const {isReadOnlyShellCommand}=await import('../../src/security/rule-parser.ts');
  for(const command of ["sed -n '1,200p'",'sed -n 5p notes.txt','cat a.txt | sed -n 10,20p'])assert.equal(isReadOnlyShellCommand(command),true,command);
  for(const command of ["sed -i 's/a/b/' notes.txt","sed -n '1,5w out.txt' notes.txt","sed 's/a/b/' notes.txt",'sed -n 5p -i notes.txt','sed -n p notes.txt','sed 5p notes.txt','sed -e 5p notes.txt'])assert.equal(isReadOnlyShellCommand(command),false,command);
});

test('C-006 screen: the approval coordinator names the asking session, so its own saved output opens without a dialog',async()=>{
  const {createApprovalCoordinator}=await import('../../src/tui/approval.ts');
  const {project,root,file}=layout();
  const answered:unknown[][]=[];
  const coordinator=createApprovalCoordinator({engine:engineFor(project,root),answer:async(...args:unknown[])=>{answered.push(args);},interactive:true,mode:'default'});
  const own=await coordinator.request('s1','r1',{tool:'Read',resource:file('s1'),sensitive:'outside-hidden'});
  assert.deepEqual([own.pending,own.allowed],[false,true]);
  assert.deepEqual(answered[0],['s1','r1',true,{motivo:'regola'}]);
  const other=await coordinator.request('s1','r2',{tool:'Read',resource:file('s2'),sensitive:'outside-hidden'});
  assert.equal(other.pending,true,'another session\'s output is still the person\'s decision');
});
