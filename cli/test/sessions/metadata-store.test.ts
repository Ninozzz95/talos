import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,readdir,readFile,rm,stat,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {basename,join} from 'node:path';
import {createSessionMetadataStore,SESSION_METADATA_SCHEMA,sessionMetadataRoot} from '../../src/sessions/metadata-store.ts';

test('M6-B metadata store keeps normalized tags and pin state outside session history with private atomic files',async(t)=>{
  const base=await mkdtemp(join(tmpdir(),'talos-session-meta-'));t.after(()=>rm(base,{recursive:true,force:true}));
  const root=join(base,'metadata');const store=createSessionMetadataStore({rootDir:root});
  assert.equal(sessionMetadataRoot('/state'),join('/state','session-metadata'));
  await store.addTag('../session/private',' Release ');
  await store.addTag('../session/private','release');
  await store.setPinned('../session/private',true);
  const row=await store.get('../session/private');
  assert.ok(row);assert.equal(row.schema,SESSION_METADATA_SCHEMA);assert.equal(row.sessionId,'../session/private');
  assert.deepEqual(row.tags,['release']);assert.equal(row.pinned,true);
  assert.match(row.createdAt,/Z$/u);assert.match(row.updatedAt,/Z$/u);
  const file=store.fileForSession('../session/private');assert.equal(file.startsWith(root),true);
  assert.equal(basename(file).includes('session'),false);assert.equal(basename(file).includes('private'),false);
  const disk=JSON.parse(await readFile(file,'utf8'));assert.equal(disk.schema,SESSION_METADATA_SCHEMA);
  assert.equal((await readdir(root)).some(name=>name.endsWith('.tmp')),false);
  if(process.platform!=='win32'){assert.equal((await stat(root)).mode&0o077,0);assert.equal((await stat(file)).mode&0o077,0);}
});

test('M6-B metadata store removes tags, unpins and rejects malformed persisted state',async(t)=>{
  const base=await mkdtemp(join(tmpdir(),'talos-session-meta-invalid-'));t.after(()=>rm(base,{recursive:true,force:true}));
  const store=createSessionMetadataStore({rootDir:join(base,'metadata')});
  await store.addTag('s1','alpha');await store.addTag('s1','beta');await store.removeTag('s1','ALPHA');await store.setPinned('s1',true);await store.setPinned('s1',false);
  await assert.rejects(()=>store.addTag('s1','safe\u202eevil'),(error:any)=>error?.code==='SESSION_METADATA_INVALID');
  await assert.rejects(()=>store.addTag('s1','safe\u200bevil'),(error:any)=>error?.code==='SESSION_METADATA_INVALID');
  assert.deepEqual((await store.get('s1'))?.tags,['beta']);assert.equal((await store.get('s1'))?.pinned,false);
  await writeFile(store.fileForSession('s1'),JSON.stringify({schema:SESSION_METADATA_SCHEMA,sessionId:'s1',tags:['ok','ok'],pinned:false,createdAt:'x',updatedAt:'x'}),'utf8');
  await assert.rejects(()=>store.get('s1'),(error:any)=>error?.code==='SESSION_METADATA_INVALID');
});
