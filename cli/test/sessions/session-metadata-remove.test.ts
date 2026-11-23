/*
 * Stage 7.5 (mockup /resume «d delete»): a deleted conversation takes what the CLI kept about it (its name, its first message)
 * with it.
 */
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test,{after} from 'node:test';
import {createSessionMetadataStore} from '../../src/sessions/metadata-store.ts';

const root=mkdtempSync(join(tmpdir(),'talos-meta-remove-'));after(()=>rmSync(root,{recursive:true,force:true}));

test('a deleted conversation takes its metadata with it',async()=>{
  const store=createSessionMetadataStore({rootDir:join(root,'meta')});
  await store.setName('gone','Flaky login test');await store.setFirstMessage('gone','fix the login test');
  assert.equal(await store.remove('gone'),true);
  assert.equal(await store.get('gone'),null);
  assert.equal(await store.remove('gone'),false,'nothing left to remove');
});

test('a metadata file written with a branch (stage 7.5 before the kernel\'s branch was used) still reads',async()=>{
  const store=createSessionMetadataStore({rootDir:join(root,'meta')});
  const {writeFileSync}=await import('node:fs');const at=new Date().toISOString();
  writeFileSync(store.fileForSession('old'),JSON.stringify({schema:'talos.cli.session-metadata.v1',sessionId:'old',tags:[],pinned:false,name:'Old',branch:'main',createdAt:at,updatedAt:at}));
  assert.equal((await store.get('old'))?.name,'Old');
});
