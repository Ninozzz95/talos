/*
 * Stress test 0.5.5, F-P-004 (S1): in bypassPermissions `-p`, `type .\.e*v` read `.env` and `type keys\id_*` read a private key — the
 * kernel's glob step takes `\` as bash's escape, while the CLI runs commands through cmd.exe where `\` separates the path. The CLI asks
 * the kernel again with cmd's reading and refuses, in every mode, what names a secret.
 */
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {createPermissionEngine} from '../../src/security/permission-engine.ts';
import {sessionSecretRecheck} from '../../src/headless/run.ts';

function project(t:{after:(fn:()=>void)=>void}){
  const root=mkdtempSync(path.join(tmpdir(),'talos-fp004-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  writeFileSync(path.join(root,'.env'),'TOKEN=CANARY\n');mkdirSync(path.join(root,'keys'));writeFileSync(path.join(root,'keys','id_ed25519'),'KEY\n');
  writeFileSync(path.join(root,'notes.txt'),'hello\n');
  return root;
}
const decide=(root:string,command:string,mode:'bypassPermissions'|'acceptEdits'='bypassPermissions')=>
  createPermissionEngine({projectRoot:root,rules:{allow:[],ask:[],deny:[]},mode,secretRecheck:sessionSecretRecheck(root)}).decide({tool:'Bash',command},{interactive:false,mode});

/* 0.6.8 (owner 16/10/2026, «Come il Desktop: non chiede»): Full access no longer asks for a secret, so the recheck now matters in the
   other modes: the cmd.exe reading still finds the secret, and acceptEdits with nobody in front refuses it */
test('the tester\'s two spellings are found as secrets: refused in acceptEdits -p, allowed in Full access',async t=>{
  const root=project(t);
  for(const command of ['type .\\.e*v','type keys\\id_*','cat .\\.e?v']){
    assert.notEqual((await decide(root,command,'acceptEdits')).kind,'allow',`${command} must not run in acceptEdits`);
    assert.equal((await decide(root,command)).kind,'allow',`${command} runs in Full access`);
  }
});

test('a backslash path with a wildcard that names no secret still runs, and a plain command is never rechecked',async t=>{
  const root=project(t);
  assert.equal((await decide(root,'type .\\note*.txt')).kind,'allow');
  assert.equal((await decide(root,'dir keys\\*.pub')).kind,'allow');
  assert.equal((await decide(root,'npm test')).kind,'allow');
});
