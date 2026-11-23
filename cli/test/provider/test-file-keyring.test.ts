/*
 * Owner 27/10/2026 (development mode: «non posso stare qui a babysittarti»): a test profile may keep its keys in a FILE, so the PC's
 * remote identity survives between two TALOS processes and a device paired in one reaches the next. Only in a test profile, only
 * through TALOS_CREDENTIAL_STORE=file (never the configuration), refused anywhere else; synchronous, as the kernel's remote keyring
 * requires; nothing copied in from the environment.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {existsSync,mkdtempSync,readdirSync,readFileSync,rmSync,statSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chooseCredentialStore,createFileKeyring,openCredentialStore,CREDENTIAL_STORE_VARIABLE,TEST_KEYRING_FILE,TEST_PROFILE_VARIABLE} from '../../src/provider/store.ts';
import {cliRemoteKeyring,KERNEL_REMOTE_SERVICE} from '../../src/remote/host.ts';

const folder=()=>{const d=mkdtempSync(join(tmpdir(),'talos-file-keyring-'));return{d,done:()=>rmSync(d,{recursive:true,force:true})};};

test('file: only in a test profile and only from the variable; anywhere else it is refused, never used',()=>{
  assert.deepEqual(chooseCredentialStore({env:{[TEST_PROFILE_VARIABLE]:'1',[CREDENTIAL_STORE_VARIABLE]:'file'}}),{kind:'file',source:'environment',testProfile:true});
  assert.throws(()=>chooseCredentialStore({env:{[CREDENTIAL_STORE_VARIABLE]:'file'}}),{code:'CREDENTIAL_STORE_FILE_OUTSIDE_TEST'});
  assert.throws(()=>chooseCredentialStore({env:{[TEST_PROFILE_VARIABLE]:'0',[CREDENTIAL_STORE_VARIABLE]:'FILE'}}),{code:'CREDENTIAL_STORE_FILE_OUTSIDE_TEST'});
  /* the configuration cannot choose it, not even in a test profile: it falls to the test profile's memory */
  assert.equal(chooseCredentialStore({env:{[TEST_PROFILE_VARIABLE]:'1'},config:{credentials:{store:'file' as any}}}).kind,'memory');
});

test('file: what one process saves the next one reads (the remote identity survives), synchronously, through the remote scope too',()=>{
  const f=folder();
  try{
    const env={[TEST_PROFILE_VARIABLE]:'1',[CREDENTIAL_STORE_VARIABLE]:'file',OPENAI_API_KEY:'sk-from-the-environment'};
    const first=openCredentialStore({repoRoot:f.d,scope:f.d,env});
    assert.equal(first.kind,'file');
    const remote=cliRemoteKeyring(first.keyring!);
    remote.set(KERNEL_REMOTE_SERVICE,'identita','secret-identity');
    /* a second process: a new store on the same profile */
    const second=cliRemoteKeyring(openCredentialStore({repoRoot:f.d,scope:f.d,env}).keyring!);
    assert.equal(second.get(KERNEL_REMOTE_SERVICE,'identita'),'secret-identity');
    const file=join(f.d,TEST_KEYRING_FILE);
    assert.ok(existsSync(file));
    assert.doesNotMatch(readFileSync(file,'utf8'),/sk-from-the-environment/u,'nothing is copied in from the environment');
    second.remove(KERNEL_REMOTE_SERVICE,'identita');
    assert.equal(cliRemoteKeyring(openCredentialStore({repoRoot:f.d,scope:f.d,env}).keyring!).get(KERNEL_REMOTE_SERVICE,'identita'),null);
  }finally{f.done();}
});

test('file: a missing or broken file reads as empty and is replaced whole on the next save; no temporary file is left',()=>{
  const f=folder();
  try{
    const file=join(f.d,'sub','k.json');
    const k=createFileKeyring(file);
    assert.equal(k.get('s','a'),null);
    k.set('s','a','1');k.set('s','b','2');
    assert.equal(k.get('s','b'),'2');
    writeFileSync(file,'{not json');
    assert.equal(k.get('s','a'),null);
    k.set('s','c','3');
    assert.deepEqual(JSON.parse(readFileSync(file,'utf8')),{'s\u0000c':'3'});
    assert.deepEqual(readdirSync(join(f.d,'sub')),['k.json']);
    assert.ok(statSync(file).isFile());
  }finally{f.done();}
});
