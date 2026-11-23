/*
 * 0.6.8, third review of 0.6.8 (F1, measured on the built CLI) and owner 16/10/2026 «Chiedere sempre»: in Full access `-p` the model
 * read `~/.npmrc` and `~/.ssh/id_ed25519` and both reached the provider; 0.6.7 kept them. Full access still reads a PROJECT secret
 * without asking, but this computer's login credentials are asked to the person in every mode and refused with nobody in front.
 */
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {isHomeCredential} from '../../src/security/home-credentials.ts';
import {createPermissionEngine} from '../../src/security/permission-engine.ts';
import {permissionActionFromApproval} from '../../src/security/from-approval.ts';

const home=mkdtempSync(path.join(tmpdir(),'talos-home-cred-'));
const project=path.join(home,'work','project');mkdirSync(project,{recursive:true});mkdirSync(path.join(home,'.ssh'));
writeFileSync(path.join(home,'.npmrc'),'x');writeFileSync(path.join(home,'.ssh','id_ed25519'),'x');

test('the list is the kernel\'s: keys, tokens and cloud folders, not ~/.ssh/config, not a project file',()=>{
  for(const name of ['.npmrc','.netrc','_netrc','.git-credentials','.ssh/id_ed25519','.ssh/authorized_keys','.aws/credentials','.config/gcloud/x.json','.docker/config.json'])
    assert.equal(isHomeCredential(path.join(home,name),{cwd:project,home}),true,name);
  assert.equal(isHomeCredential(path.join(home,'.ssh','id_ed25519:stream'),{cwd:project,home}),true,'an NTFS stream names the same file');
  assert.equal(isHomeCredential('~/.npmrc',{cwd:project,home}),true,'~ is the home');
  /* fourth review of 0.6.8: other spellings of the same file */
  for(const spelled of ['%USERPROFILE%\\.npmrc','%userprofile%/.npmrc','$HOME/.npmrc','${HOME}/.npmrc','$env:USERPROFILE\\.npmrc'])
    assert.equal(isHomeCredential(spelled,{cwd:project,home}),true,spelled);
  if(process.platform==='win32')for(const spelled of [path.join(home,'.npmrc.'),path.join(home,'.npmrc '),path.join(home,'.ssh.','id_ed25519'),path.join(home,'.SSH','ID_ED25519')])
    assert.equal(isHomeCredential(spelled,{cwd:project,home}),true,'Windows opens the same file: '+JSON.stringify(spelled));
  assert.equal(isHomeCredential(path.join(home,'x','..','.npmrc'),{cwd:project,home}),true,'a dot segment');
  /* the desktop's owner decision: a project opened inside a credential folder reads its own files */
  const dockerProject=path.join(home,'.docker','my-project');mkdirSync(dockerProject,{recursive:true});writeFileSync(path.join(dockerProject,'main.go'),'x');
  assert.equal(isHomeCredential('main.go',{cwd:dockerProject,home}),false,'its own file');
  assert.equal(isHomeCredential(path.join(home,'.docker','config.json'),{cwd:dockerProject,home}),true,'the folder\'s credential outside the project still asks');
  for(const name of ['.ssh/config','notes.txt','.bashrc'])assert.equal(isHomeCredential(path.join(home,name),{cwd:project,home}),false,name);
  assert.equal(isHomeCredential(path.join(project,'.npmrc'),{cwd:project,home}),false,'a project .npmrc is a project secret, not the computer\'s');
});

/* fifth review of 0.6.8: what a shell expands, what stays unresolved, hard links, the words of a command */
test('every variable a shell expands, unresolved names failing closed, hard links, the words of a command',async()=>{
  const environment={...process.env,HOMEPATH:home.slice(2),HOMEDRIVE:home.slice(0,2),LOCALAPPDATA:path.join(home,'AppData','Local'),USERPROFILE:home};
  const o={cwd:project,home,environment};
  for(const spelled of ['%HOMEDRIVE%%HOMEPATH%\\.npmrc','%HOMEPATH%\\.npmrc','%LOCALAPPDATA%\\..\\..\\.npmrc','${env:USERPROFILE}\\.npmrc','${env:LOCALAPPDATA}\\..\\..\\.ssh\\id_ed25519','"'+path.join(home,'.npmrc')+'"'])
    assert.equal(isHomeCredential(spelled,o),true,spelled);
  for(const unresolved of ['%NOT_SET_ANYWHERE%\\.npmrc','$NOT_SET/.ssh/id_rsa','/.aws/credentials',path.join(path.dirname(home),'*','.npmrc'),path.join(path.dirname(home),'*','.ssh','id_*')])
    assert.equal(isHomeCredential(unresolved,o),true,'fails closed: '+unresolved);
  /* sixth review (F6-1): a glob in the home that could name a credential asks; a glob over the project's own .ssh does not */
  for(const glob of [path.join(home,'.ssh','*'),path.join(home,'.*rc'),path.join(home,'.ss?','id_*'),'~/.aws/*','~/.config/g*/hosts.yml'])
    assert.equal(isHomeCredential(glob,o),true,'a glob in the home: '+glob);
  mkdirSync(path.join(project,'.ssh'),{recursive:true});
  for(const glob of ['.ssh/*','.ssh/*.pub',path.join(project,'.ssh','*'),'*.npmrc','src/*.ts',path.join(home,'notes','*.txt'),path.join(home,'.ssh','config'),path.join(path.dirname(path.dirname(home)),'*','.npmrc')])
    assert.equal(isHomeCredential(glob,o),false,'not a home credential: '+glob);
  for(const plain of ['%NOT_SET_ANYWHERE%\\.env','$NOT_SET/.ssh/config','$NOT_SET/notes.txt'])
    assert.equal(isHomeCredential(plain,o),false,'not a credential\'s name: '+plain);
  const {linkSync}=await import('node:fs');
  linkSync(path.join(home,'.ssh','id_ed25519'),path.join(project,'innocent.txt'));
  writeFileSync(path.join(project,'ordinary.txt'),'x');
  assert.equal(isHomeCredential('innocent.txt',o),true,'a hard link to a credential, under an ordinary name');
  assert.equal(isHomeCredential('ordinary.txt',o),false);
  const {commandNamesHomeCredential}=await import('../../src/security/home-credentials.ts');
  assert.equal(commandNamesHomeCredential('type innocent.txt',o),true,'a command reading the hard link');
  assert.equal(commandNamesHomeCredential('powershell -c "Get-Content ${env:USERPROFILE}\\.ssh\\id_ed25519"',o),true);
  assert.equal(commandNamesHomeCredential('type "'+path.join(home,'.npmrc')+'"',o),true,'a quoted path with spaces');
  assert.equal(commandNamesHomeCredential('git status && npm test',o),false,'an ordinary command');
  const before=process.env.USERPROFILE;const beforeHome=process.env.HOME;process.env.USERPROFILE=home;process.env.HOME=home;
  try{
    const engine=createPermissionEngine({projectRoot:project,rules:{allow:[],ask:[],deny:[]}});
    for(const mode of ['default','acceptEdits','bypassPermissions','auto'] as const){
      const read=await engine.decide({tool:'Read',resource:'innocent.txt'},{interactive:false,mode});
      assert.equal(read.kind,'deny',mode+': the hard link is not read with nobody in front, in any mode');
    }
    assert.equal((await engine.decide({tool:'Read',resource:'ordinary.txt'},{interactive:false,mode:'default'})).kind,'allow','an ordinary project file is still read');
  }finally{process.env.USERPROFILE=before;process.env.HOME=beforeHome;}
});

test('Full access asks for this computer\'s credentials and refuses them with nobody in front; a project secret still runs',async(t)=>{
  const before=process.env.USERPROFILE;const beforeHome=process.env.HOME;process.env.USERPROFILE=home;process.env.HOME=home;
  t.after(()=>{process.env.USERPROFILE=before;process.env.HOME=beforeHome;});
  const engine=createPermissionEngine({projectRoot:project,rules:{allow:[],ask:[],deny:[]}});
  const fromKernel=(azione:Record<string,unknown>)=>permissionActionFromApproval({azione});
  const reads=[
    fromKernel({tipo:'leggi',percorso:path.join(home,'.npmrc'),segreto:{classe:'segreto',percorso:path.join(home,'.npmrc')}}),
    fromKernel({comando:'type %USERPROFILE%\\.ssh\\id_ed25519',segreto:{classe:'segreto',percorso:path.join(home,'.ssh','id_ed25519')}}),
    fromKernel({tipo:'leggi',percorso:path.join(home,'.ssh','id_ed25519'),segreto:{classe:'fuori-workspace-nascosto',percorso:path.join(home,'.ssh','id_ed25519')}}),
  ];
  for(const action of reads){
    assert.equal((await engine.decide(action,{interactive:true,mode:'bypassPermissions'})).kind,'ask',JSON.stringify(action));
    assert.equal((await engine.decide(action,{interactive:false,mode:'bypassPermissions'})).kind,'deny',JSON.stringify(action));
  }
  /* the kernel's own sign (desktop fix/hard-link-ai-segreti, owner «Sì, anche sul desktop») counts on its own */
  const signed=fromKernel({tipo:'leggi',percorso:'whatever.txt',segreto:{classe:'segreto',percorso:'whatever.txt',credenzialeDellaCasa:true}});
  assert.equal((await engine.decide(signed,{interactive:false,mode:'bypassPermissions'})).kind,'deny','credenzialeDellaCasa: refused with nobody in front');
  const projectSecret=fromKernel({tipo:'leggi',percorso:'.env',segreto:{classe:'segreto',percorso:'.env'}});
  assert.equal((await engine.decide(projectSecret,{interactive:false,mode:'bypassPermissions'})).kind,'allow','a project secret in Full access');
  const outsidePlain=fromKernel({tipo:'leggi',percorso:path.join(home,'notes.txt')});
  assert.equal((await engine.decide(outsidePlain,{interactive:false,mode:'bypassPermissions'})).kind,'allow','an ordinary file outside the project');
});
