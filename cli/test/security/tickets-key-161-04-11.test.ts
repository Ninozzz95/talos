/*
 * Review of the permissions block (04/11/2026, finding A2, ALTO): in Full access the CLI read `~/.talos-biglietti/4174.chiave`
 * without a card, against the owner's decision 161 (this computer's credentials still ask in Full access). The key of the entry
 * tickets is a credential of this computer like ~/.ssh: whoever reads it walks into the session. The kernel lists the folder with
 * the others (harness-ui path-policy.mjs, «gettone sempre», 02/11/2026); the CLI's list did not.
 * Sources: Hermes agent/file_safety.py:211 (HOME_CREDENTIAL_DIRS, the list the CLI's follows); the kernel's path-policy.mjs:1573.
 */
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {isHomeCredential} from '../../src/security/home-credentials.ts';
import {createPermissionEngine} from '../../src/security/permission-engine.ts';

const home=mkdtempSync(path.join(tmpdir(),'talos-tickets-'));
const project=path.join(home,'work','project');mkdirSync(project,{recursive:true});
const key=path.join(home,'.talos-biglietti','4174.chiave');mkdirSync(path.dirname(key));writeFileSync(key,'x');

test('the tickets\' key is a credential of this computer, by path, with ~ and as a glob',()=>{
  assert.equal(isHomeCredential(key,{cwd:project,home}),true);
  assert.equal(isHomeCredential('~/.talos-biglietti/4174.chiave',{cwd:project,home}),true);
  assert.equal(isHomeCredential(path.join(home,'.talos-biglietti','*.chiave'),{cwd:project,home}),true,'the glob form');
  assert.equal(isHomeCredential(path.join(home,'notes.chiave'),{cwd:project,home}),false,'a file outside the folder is not');
});

test('Full access asks before reading it, and with nobody in front refuses',async()=>{
  const previous=process.env.USERPROFILE,previousHome=process.env.HOME;process.env.USERPROFILE=home;process.env.HOME=home;
  try{
    const e=createPermissionEngine({projectRoot:project,rules:{allow:[],ask:[],deny:[]},mode:'bypassPermissions'} as any);
    const read={tool:'Read',resource:key} as any;
    assert.equal((await e.decide(read,{interactive:true,mode:'bypassPermissions'} as any)).kind,'ask');
    assert.equal((await e.decide(read,{interactive:false,mode:'bypassPermissions'} as any)).kind,'deny');
    const ssh={tool:'Read',resource:path.join(home,'.ssh','id_ed25519')} as any;mkdirSync(path.join(home,'.ssh'),{recursive:true});writeFileSync(ssh.resource,'x');
    assert.equal((await e.decide(ssh,{interactive:true,mode:'bypassPermissions'} as any)).kind,'ask','on the contrary: ~/.ssh already asked');
  }finally{
    if(previous===undefined)delete process.env.USERPROFILE;else process.env.USERPROFILE=previous;
    if(previousHome===undefined)delete process.env.HOME;else process.env.HOME=previousHome;
  }
});
