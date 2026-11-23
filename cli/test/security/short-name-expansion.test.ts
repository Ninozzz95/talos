/*
 * Stress test 0.5.5, F-E-001 (S1): a -p run whose folder was reached by an 8.3 short name (C:\Users\me\DOWNLO~1\…) died inside the
 * sandbox with 0xC0000409 and left the written file empty: libuv aborts the process when fs.watch watches a short-name folder
 * (src/win/fs-event.c:72, libuv #5010), and inside the sandbox the native realpath that would give the long name is refused. The long
 * name is found without the native call: the entry of the parent folder that is the SAME file (device and file index) as the short one.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {mkdirSync,mkdtempSync,realpathSync,rmSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {homedir,tmpdir} from 'node:os';
import path from 'node:path';
import test,{mock} from 'node:test';
import {expandShortNames,longPathForm,realpathNativeTolerant,realpathTolerant} from '../../src/security/real-path.ts';

const eperm=()=>Object.assign(new Error('EPERM: operation not permitted, realpath (test)'),{code:'EPERM'});
function sandboxed(t:{after:(fn:()=>void)=>void}){
  const a=mock.method(fs.promises,'realpath',async()=>{throw eperm();});
  const b=mock.method(fs.realpathSync,'native',()=>{throw eperm();});
  syncBuiltinESMExports();
  t.after(()=>{a.mock.restore();b.mock.restore();syncBuiltinESMExports();});
}
/* verbatim: Node would otherwise escape the inner quotes for a C runtime, and cmd would read them literally */
const shortOf=(long:string)=>spawnSync('cmd.exe',['/d','/s','/c',`"for %I in ("${long}") do @echo %~sI"`],{encoding:'utf8',windowsVerbatimArguments:true}).stdout.trim();
/**
 * A folder with a long name, the short name Windows gave it (cmd's %~s) and a file inside it. A fresh folder first; volumes that no
 * longer make 8.3 names (this one, measured 12/10/2026) still carry them on old folders, so the next candidates are folders that
 * exist on every Windows host, read only. Null where none has a short name.
 */
function longAndShort(t:{after:(fn:()=>void)=>void}):{long:string;short:string;child:string}|null{
  if(process.platform!=='win32')return null;
  const root=realpathSync.native(mkdtempSync(path.join(tmpdir(),'talos-short-')));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const fresh=path.join(root,'a folder with a long name');mkdirSync(path.join(fresh,'inside'),{recursive:true});writeFileSync(path.join(fresh,'inside','a.txt'),'a');
  for(const long of [fresh,process.env.ProgramFiles??'C:\\Program Files',path.join(homedir(),'Downloads'),path.join(homedir(),'Documents')]){
    let short:string;try{short=shortOf(long);}catch{continue;}
    if(!/~\d/u.test(path.basename(short)))continue;
    const child=long===fresh?path.join('inside','a.txt'):fs.readdirSync(long).find(name=>{try{fs.statSync(path.join(long,name));return true;}catch{return false;}});
    if(child)return {long:realpathSync.native(long),short,child};
  }
  return null;
}

test('F-E-001: a short-name segment is expanded to the long name by the file identity, without the native realpath',t=>{
  const f=longAndShort(t);if(!f){t.skip('no 8.3 names on this volume');return;}
  sandboxed(t);
  assert.equal(expandShortNames(f.short),f.long);
  assert.equal(expandShortNames(path.join(f.short,f.child)),path.join(f.long,f.child));
  assert.equal(longPathForm(path.join(f.short,f.child)),path.join(f.long,f.child));
  assert.equal(longPathForm(path.join(f.short,f.child),'linux'),path.join(f.short,f.child),'other platforms keep the path as given');
});

test('F-E-001: inside the sandbox the realpath fallback answers the long name instead of refusing a short one',async t=>{
  const f=longAndShort(t);if(!f){t.skip('no 8.3 names on this volume');return;}
  sandboxed(t);
  assert.equal(realpathNativeTolerant(f.short),f.long);
  assert.equal(await realpathTolerant(path.join(f.short,f.child)),path.join(f.long,f.child));
});

test('F-E-001 the other way: a file system that gives no file index (0) proves nothing, even with a single candidate',t=>{
  const r=mock.method(fs,'readdirSync',()=>['only']);
  const l=mock.method(fs,'lstatSync',()=>({ino:0n,dev:1n}));
  t.after(()=>{r.mock.restore();l.mock.restore();});
  assert.equal(expandShortNames('C:\\data\\ONLY~1'),null);
});

test('F-E-001 the other way: a name that only looks short, a path without short names and an unprovable one',t=>{
  if(process.platform!=='win32'){t.skip('Windows names');return;}
  const root=realpathSync.native(mkdtempSync(path.join(tmpdir(),'talos-short-')));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const lookalike=path.join(root,'notes~1');mkdirSync(lookalike);
  assert.equal(expandShortNames(lookalike),lookalike,'a real entry called notes~1 is its own long name');
  assert.equal(expandShortNames(root),root,'nothing to expand');
  assert.equal(expandShortNames(path.join(root,'NOSUCH~1','x')),null,'a short name that is not there cannot be proven');
  assert.equal(longPathForm(path.join(root,'NOSUCH~1')),path.join(root,'NOSUCH~1'),'what cannot be proven is left as it was');
});
