/*
 * Known issue (i) of the stress tests 0.5.3/0.5.4: the `-p` result always said `changedFiles: []` — it was built from `file.changed`
 * events the kernel never sends. The run's own checkpoints say exactly what it changed; only this session's, from this turn on.
 */
import assert from 'node:assert/strict';
import {mkdtempSync,realpathSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {createCheckpointStore} from '../../src/workspace/checkpoint-store.ts';
import {turnChangedFiles} from '../../src/headless/run.ts';

test('the files a turn changed come from its checkpoints: added and modified, this session only, from this turn on',async t=>{
  const base=realpathSync.native(mkdtempSync(path.join(tmpdir(),'talos-changed-')));t.after(()=>rmSync(base,{recursive:true,force:true}));
  const project=path.join(base,'project');const root=path.join(base,'checkpoints');
  const {mkdirSync}=await import('node:fs');mkdirSync(project);mkdirSync(root);
  writeFileSync(path.join(project,'kept.txt'),'same');writeFileSync(path.join(project,'edited.txt'),'before');
  const store=createCheckpointStore({rootDir:root,projectRoot:project});

  const older=await store.begin({operation:'start',sessionId:'s1'});
  writeFileSync(path.join(project,'old-turn.txt'),'x');await older.finalize();
  await new Promise(resolve=>setTimeout(resolve,15));
  const since=new Date().toISOString();
  /* another session working at the same time: after `since`, and still not this run's */
  const other=await store.begin({operation:'start',sessionId:'s2'});
  writeFileSync(path.join(project,'other-session.txt'),'x');await other.finalize();
  const turn=await store.begin({operation:'start',sessionId:'s1'});
  writeFileSync(path.join(project,'edited.txt'),'after');writeFileSync(path.join(project,'new.txt'),'new');
  await turn.finalize();

  assert.deepEqual(await turnChangedFiles({checkpointsRoot:root,projectRoot:project},'s1',since),['edited.txt','new.txt']);
});

test('no checkpoints folder, or a store that cannot be read, is an empty list and never an error',async()=>{
  assert.deepEqual(await turnChangedFiles({projectRoot:process.cwd()} as any,'s1','2026-01-01T00:00:00.000Z'),[]);
  assert.deepEqual(await turnChangedFiles({checkpointsRoot:path.join(tmpdir(),'talos-no-such-root-'+process.pid),projectRoot:path.join(tmpdir(),'talos-no-such-project-'+process.pid)},'s1','2026-01-01T00:00:00.000Z'),[]);
});
