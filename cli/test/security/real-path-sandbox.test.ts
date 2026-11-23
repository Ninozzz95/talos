/*
 * Stress test 0.5.4, F-E-001 (S2): inside the shipped sandbox the native realpath answers EPERM for every path, while the JavaScript
 * one works. TALOS falls back to the JavaScript walk only for a refused answer, still follows links, and keeps refusing what it cannot
 * prove (a short 8.3 name it cannot expand, a missing path).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {mkdirSync,mkdtempSync,realpathSync,rmSync,symlinkSync,writeFileSync} from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import {tmpdir} from 'node:os';
import path from 'node:path';
import test,{mock} from 'node:test';
import {realpathNativeTolerant,realpathTolerant} from '../../src/security/real-path.ts';
import {compileRules,evaluateRules} from '../../src/security/evaluate.ts';
import {resolveWorkspaceIdentity} from '../../src/security/workspace-identity.ts';

const eperm=()=>Object.assign(new Error('EPERM: operation not permitted, realpath (test)'),{code:'EPERM'});
/* syncBuiltinESMExports: a module that imports `{realpath} from 'node:fs/promises'` sees the sandbox too, not only `fs.promises.realpath` */
function sandboxed(t:{after:(fn:()=>void)=>void}){
  const a=mock.method(fs.promises,'realpath',async()=>{throw eperm();});
  const b=mock.method(fs.realpathSync,'native',()=>{throw eperm();});
  syncBuiltinESMExports();
  t.after(()=>{a.mock.restore();b.mock.restore();syncBuiltinESMExports();});
}
function project(){
  const root=realpathSync.native(mkdtempSync(path.join(tmpdir(),'talos-realpath-')));
  mkdirSync(path.join(root,'inside'));writeFileSync(path.join(root,'inside','a.txt'),'a');
  return root;
}

test('a refused native realpath falls back to the JavaScript walk, async and sync',async t=>{
  const root=project();t.after(()=>rmSync(root,{recursive:true,force:true}));
  sandboxed(t);
  assert.equal(await realpathTolerant(path.join(root,'inside','a.txt')),path.join(root,'inside','a.txt'));
  assert.equal(realpathNativeTolerant(path.join(root,'inside')),path.join(root,'inside'));
});

test('the fallback still follows a link out of the folder',async t=>{
  const root=project();const outside=project();t.after(()=>{rmSync(root,{recursive:true,force:true});rmSync(outside,{recursive:true,force:true});});
  const link=path.join(root,'link');
  try{symlinkSync(outside,link,'junction');}catch{t.skip('links cannot be created here');return;}
  sandboxed(t);
  assert.equal(await realpathTolerant(link),outside);
  assert.equal(realpathNativeTolerant(path.join(link,'inside')),path.join(outside,'inside'));
});

test('a missing path says so (ENOENT), and an unexpanded short name keeps the refusal',async t=>{
  const root=project();t.after(()=>rmSync(root,{recursive:true,force:true}));
  sandboxed(t);
  await assert.rejects(realpathTolerant(path.join(root,'missing')),{code:'ENOENT'});
  assert.throws(()=>realpathNativeTolerant(path.join(root,'missing')),{code:'ENOENT'});
  /* 0.5.6 (F-E-001): a short name that exists is now expanded by file identity (short-name-expansion.test.ts); one that cannot be proven keeps the refusal */
  const short=mock.method(fs,'realpathSync',()=>'C:\\NOSUCH~1\\x');t.after(()=>short.mock.restore());
  await assert.rejects(realpathTolerant('C:\\NOSUCH~1\\x'),/EPERM/u);
  assert.throws(()=>realpathNativeTolerant('C:\\NOSUCH~1\\x'),/EPERM/u);
});

test('any other error is not swallowed',async t=>{
  const a=mock.method(fs.promises,'realpath',async()=>{throw Object.assign(new Error('ELOOP (test)'),{code:'ELOOP'});});t.after(()=>a.mock.restore());
  await assert.rejects(realpathTolerant(process.cwd()),/ELOOP/u);
});

test('in the sandbox a Write through a link out of the project is still refused',t=>{
  const root=project();const outside=project();t.after(()=>{rmSync(root,{recursive:true,force:true});rmSync(outside,{recursive:true,force:true});});
  try{symlinkSync(outside,path.join(root,'link'),'junction');}catch{t.skip('links cannot be created here');return;}
  sandboxed(t);
  const decision=evaluateRules(compileRules({allow:['Write(*)'],ask:[],deny:[]}),{tool:'Write',resource:'link/x.txt'},{projectRoot:root});
  assert.equal(decision.effect,'deny');
  assert.match(String(decision.reason),/goes through a link/u);
});

test('in the sandbox the project folder still resolves (provider list exited 70 on it)',async t=>{
  const root=project();t.after(()=>rmSync(root,{recursive:true,force:true}));
  sandboxed(t);
  const identity=await resolveWorkspaceIdentity({projectRoot:root});
  assert.equal(identity.canonicalRoot,root);
});

test('in the sandbox a Write inside the project is judged, not refused as unresolvable',t=>{
  const root=project();t.after(()=>rmSync(root,{recursive:true,force:true}));
  sandboxed(t);
  const decision=evaluateRules(compileRules({allow:['Write(*)'],ask:[],deny:[]}),{tool:'Write',resource:'inside/b.txt'},{projectRoot:root});
  assert.notEqual(decision.reason,'write path could not be resolved, so it is treated as outside the authorized project');
  assert.equal(decision.effect,'allow');
});
