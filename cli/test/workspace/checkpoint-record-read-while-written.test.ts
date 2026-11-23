/*
 * Flaky «TUI direct shell binds the synchronous command id…» (turn-checkpoint.test.ts, «Timed out waiting for shell checkpoint
 * finalization», 2 to 5 failures in 24 parallel runs on 14/10/2026). Measured: not load — the finalize FAILED with
 * «CHECKPOINT_FINALIZE_FAILED: EPERM: operation not permitted, rename …records\.<id>.json.….tmp» and the checkpoint stayed open
 * for good. On Windows a rename over a file that someone is reading fails with EPERM (measured: an open read handle, or a
 * readFile in flight, on the target). The test polls `store.list()`, which reads the record while the finalize replaces it;
 * in the product the same happens when anything lists the checkpoints (another `talos checkpoint list`, the /rewind sheet)
 * as a command's checkpoint is finalized: its /undo is lost. The store's atomic write now retries that rename for a moment.
 */
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,open,readdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {createCheckpointStore} from '../../src/workspace/checkpoint-store.ts';

async function recordFile(dir:string,id:string):Promise<string>{
  for(const entry of await readdir(dir,{withFileTypes:true})){
    const full=join(dir,entry.name);
    if(entry.isDirectory()){const found=await recordFile(full,id).catch(()=>'');if(found)return found;}
    else if(entry.name===`${id}.json`)return full;
  }
  return '';
}

test('a checkpoint is finalized even while its record is being read (Windows refuses the rename for that moment)',async()=>{
  const root=await mkdtemp(join(tmpdir(),'talos-checkpoint-read-'));const projectRoot=join(root,'project');const checkpointsRoot=join(root,'state');
  await mkdir(projectRoot,{recursive:true});await writeFile(join(projectRoot,'a.txt'),'before','utf8');
  const store=createCheckpointStore({rootDir:checkpointsRoot,projectRoot});
  const handle=await store.begin({operation:'shell',sessionId:'s1'});
  const file=await recordFile(checkpointsRoot,handle.id);
  assert.ok(file,'the record file exists');
  await writeFile(join(projectRoot,'a.txt'),'after','utf8');
  const reader=await open(file,'r');
  const released=new Promise<void>(resolve=>setTimeout(()=>{void reader.close().then(()=>resolve());},150));
  try{await handle.finalize();}
  finally{await released;}
  assert.equal((await store.show(handle.id)).state,'complete');
});
