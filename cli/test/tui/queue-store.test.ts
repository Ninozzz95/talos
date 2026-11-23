import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,readdir,readFile,rm,stat,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {resolveCliPaths} from '../../src/paths.ts';
import {createQueueStore,QUEUE_SCHEMA,type QueueStoreEntry} from '../../src/tui/queue-store.ts';

test('M3-D queue path is product-local and queue files never use raw session ids',async(t)=>{
  const paths=resolveCliPaths({XDG_STATE_HOME:'/state',XDG_CACHE_HOME:'/cache',XDG_CONFIG_HOME:'/config'},'linux','/home/u');
  assert.equal(paths.queueRoot,'/state/queues');

  const root=await mkdtemp(join(tmpdir(),'talos-queue-store-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const store=createQueueStore({rootDir:root});
  const sessionId='../unsafe/session';
  const entry:QueueStoreEntry={id:'11111111-1111-4111-8111-111111111111',kind:'prompt',text:'next',status:'pending'};
  await store.save(sessionId,[entry]);
  const file=store.fileForSession(sessionId);
  assert.equal(file.startsWith(root),true);assert.equal(file.includes('unsafe'),false);assert.equal(file.includes('session'),false);
  const disk=JSON.parse(await readFile(file,'utf8'));assert.equal(disk.schema,QUEUE_SCHEMA);assert.equal(disk.sessionId,sessionId);
  assert.deepEqual(await store.load(sessionId),[entry]);
  assert.equal((await readdir(root)).some(name=>name.endsWith('.tmp')),false);
  if(process.platform!=='win32')assert.equal((await stat(file)).mode&0o077,0);
});

test('M3-D queue store round-trips attachment snapshots and rejects malformed/cross-session state',async(t)=>{
  const root=await mkdtemp(join(tmpdir(),'talos-queue-validate-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const store=createQueueStore({rootDir:root});
  const entry:QueueStoreEntry={
    id:'22222222-2222-4222-8222-222222222222',kind:'prompt',text:'review @a.txt',status:'dispatching',
    attachments:[{kind:'text',path:'a.txt',mimeType:'text/plain',bytes:5,text:'hello'}],
  };
  await store.save('s1',[entry]);assert.deepEqual(await store.load('s1'),[entry]);
  const file=store.fileForSession('s1');
  await writeFile(file,JSON.stringify({schema:QUEUE_SCHEMA,sessionId:'other',entries:[entry]}),'utf8');
  await assert.rejects(()=>store.load('s1'),(error:any)=>error?.code==='QUEUE_STORE_INVALID');
  await writeFile(file,'{"schema":','utf8');
  await assert.rejects(()=>store.load('s1'),(error:any)=>error?.code==='QUEUE_STORE_INVALID');
});

/* review 9 F7 of 0.6.13: a prompt queued by «Send as attachment» keeps `attachIfTooLarge:true` across a save; on a command, or
   with any other value, the stored state is malformed */
test('the attachment option round-trips on a prompt and is refused anywhere else',async(t)=>{
  const root=await mkdtemp(join(tmpdir(),'talos-queue-attach-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const store=createQueueStore({rootDir:root});
  const entry:QueueStoreEntry={id:'33333333-3333-4333-8333-333333333333',kind:'prompt',text:'long paste',status:'pending',attachIfTooLarge:true};
  await store.save('s1',[entry]);assert.deepEqual(await store.load('s1'),[entry]);
  const file=store.fileForSession('s1');
  for(const bad of [{...entry,kind:'command'},{...entry,attachIfTooLarge:false},{...entry,attachIfTooLarge:'yes'}]){
    await writeFile(file,JSON.stringify({schema:QUEUE_SCHEMA,sessionId:'s1',entries:[bad]}),'utf8');
    await assert.rejects(()=>store.load('s1'),(error:any)=>error?.code==='QUEUE_STORE_INVALID',JSON.stringify(bad));
  }
});
