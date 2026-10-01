import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,appendFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {eseguiComandoSandboxato,talosLavora} from '../src/kernel/talosHarness.mjs';
import {rimuoviCartellaDiProva} from './aiuto/rimuovi-cartella-di-prova.mjs';

// Characterization of upstream metadata, not permission to repair a user's repository.
const options={skip:process.platform!=='win32'?'Windows/WSL integration gate':false};
const wslPath=p=>'/mnt/'+p[0].toLowerCase()+p.slice(2).replaceAll('\\','/');
function fixture(t,{relativePaths=false}={}){
  const root=mkdtempSync(join(tmpdir(),'talos-worktree-cross-')),repo=join(root,'repo'),work=join(root,'lavoro città'),other=join(root,'altro');mkdirSync(repo);
  t.after(()=>{const sub=relative(resolve(tmpdir()),resolve(root));assert.ok(sub&&!sub.startsWith('..')&&!isAbsolute(sub));rimuoviCartellaDiProva(root);});
  const config=join(root,'global-config');writeFileSync(config,'');
  const env={...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:config,GIT_TERMINAL_PROMPT:'0',GIT_OPTIONAL_LOCKS:'0'};
  for(const k of Object.keys(env))if(/^GIT_(DIR|WORK_TREE|COMMON_DIR|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|CONFIG_COUNT|CONFIG_KEY_|CONFIG_VALUE_)/.test(k))delete env[k];
  const git=(args,cwd=repo)=>{
    const r=spawnSync('git',['-c','core.autocrlf=false','-c','core.hooksPath='+join(root,'no-hooks'),'-c','core.fsmonitor=false',...args],{cwd,env,encoding:'utf8',windowsHide:true,timeout:15000});
    assert.equal(r.status,0,r.stderr);return r.stdout.trim();
  };
  const linux=(args,expected=0)=>{
    const r=spawnSync('wsl.exe',['--exec','env','GIT_CONFIG_NOSYSTEM=1','GIT_CONFIG_GLOBAL=/dev/null','GIT_OPTIONAL_LOCKS=0','git','-C',wslPath(work),'-c','core.autocrlf=false','-c','core.filemode=false','-c','core.fsmonitor=false',...args],{cwd:repo,env,encoding:'utf8',windowsHide:true,timeout:15000});
    assert.equal(r.status,expected,r.stderr);return r.stdout.trim();
  };
  git(['init','--initial-branch=main']);writeFileSync(join(repo,'tracked.txt'),'base\n');git(['add','--','tracked.txt']);
  git(['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','-m','fixture']);
  const head=git(['rev-parse','HEAD']);
  git(['worktree','add',relativePaths?'--relative-paths':'--no-relative-paths','-b','fixture-work',work]);
  git(['worktree','add','--no-relative-paths','-b','fixture-other',other]);
  appendFileSync(join(work,'tracked.txt'),'modificato città\n');writeFileSync(join(work,'staged.txt'),'staged\n');git(['add','--','staged.txt'],work);writeFileSync(join(work,'untracked.txt'),'non tracciato\n');
  const gitdir=git(['rev-parse','--absolute-git-dir'],work),hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
  const snapshot=()=>Object.fromEntries(['tracked.txt','staged.txt','untracked.txt'].map(p=>[p,hash(join(work,p))]).concat([['index',hash(join(gitdir,'index'))],['HEAD',hash(join(gitdir,'HEAD'))]]));
  return{root,repo,work,other,git,linux,head,snapshot};
}

test('WF08-ABSOLUTE: native Windows metadata fails in Linux Git; the selected agent environment succeeds',options,async t=>{
  const f=fixture(t),before=f.snapshot(),metadata=readFileSync(join(f.work,'.git'),'utf8');assert.match(metadata,/gitdir: [A-Z]:\//i);
  assert.equal(f.git(['rev-parse','HEAD'],f.work),f.head);f.linux(['rev-parse','HEAD'],128);
  let calls=0;const events=[];
  const result=await talosLavora({cartella:f.work,task:{consegna:'Leggi il commit corrente senza modificare file.'},modello:'fixture',chiave:'fixture',livelloAccesso:'completo',_giriMassimiInterno:3,
    ambienteComandiFn:()=>({dove:'windows',revisione:0}),
    fetchDiRete:async()=>Response.json({choices:[{message:++calls===1?{role:'assistant',content:'',tool_calls:[{id:'git-head',type:'function',function:{name:'shell',arguments:JSON.stringify({comando:'git -c core.fsmonitor=false --no-optional-locks rev-parse HEAD'})}}]}:{role:'assistant',content:'Letto.'},finish_reason:calls===1?'tool_calls':'stop'}]}),
    onGiro:e=>events.push(e),
  });
  assert.equal(result.comeFinita,'concluso');const output=events.find(e=>e.tipo==='tool-esito');assert.equal(output.isError,false);assert.ok(output.content.includes(f.head));
  assert.equal(readFileSync(join(f.work,'.git'),'utf8'),metadata);assert.deepEqual(f.snapshot(),before);
});

test('WF08-RELATIVE: upstream repair preserves data and makes both layers agree, but also changes shared metadata',options,async t=>{
  const f=fixture(t),before=f.snapshot(),otherBefore=readFileSync(join(f.other,'.git'),'utf8'),absolute=readFileSync(join(f.work,'.git'),'utf8');
  const status=f.git(['status','--porcelain=v1','-z'],f.work);f.linux(['rev-parse','HEAD'],128);
  f.git(['worktree','repair','--relative-paths',f.work]);
  const relativeGitfile=readFileSync(join(f.work,'.git'),'utf8');assert.match(relativeGitfile,/gitdir: \.\./);
  for(const [args,expected]of [[['rev-parse','HEAD'],f.head],[['status','--porcelain=v1','-z'],status],[['branch','--show-current'],'fixture-work']]){
    assert.equal(f.git(args,f.work),expected);assert.equal(f.linux(args),expected);
  }
  const kernel=await eseguiComandoSandboxato('git -c core.fsmonitor=false --no-optional-locks rev-parse HEAD',f.work,{dove:'wsl2'});
  assert.equal(kernel.codice,0);assert.equal(kernel.testo,f.head);assert.equal(kernel.enforcement,'wsl2');
  assert.deepEqual(f.snapshot(),before);
  assert.notEqual(readFileSync(join(f.other,'.git'),'utf8'),otherBefore,'repair from main touches other worktrees too');
  assert.match(readFileSync(join(f.repo,'.git','config'),'utf8'),/relativeWorktrees = true/);
  f.git(['worktree','repair','--relative-paths',f.work]);assert.equal(readFileSync(join(f.work,'.git'),'utf8'),relativeGitfile);assert.deepEqual(f.snapshot(),before);
  f.git(['worktree','repair','--no-relative-paths',f.work]);assert.equal(readFileSync(join(f.work,'.git'),'utf8'),absolute);assert.deepEqual(f.snapshot(),before);
});

test('WF08-RELATIVE-NEW: upstream creation with relative paths is readable by both Git installations',options,t=>{
  const f=fixture(t,{relativePaths:true});assert.match(readFileSync(join(f.work,'.git'),'utf8'),/gitdir: \.\./);
  assert.equal(f.git(['rev-parse','HEAD'],f.work),f.head);assert.equal(f.linux(['rev-parse','HEAD']),f.head);
  assert.equal(f.linux(['status','--porcelain=v1','-z']),f.git(['status','--porcelain=v1','-z'],f.work));
});
