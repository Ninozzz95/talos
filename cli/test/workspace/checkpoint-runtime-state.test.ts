/*
 * 0.6.6 — the LinkedIn capture of 0.6.5 showed «Checkpoint · 1 file: .talos/processi-sfondo/call_bg_1.log (added) · /undo goes
 * back»: the log the kernel writes for a background command (talosHarness.mjs SFONDO_DIR) was taken for the person's work, with
 * an Italian folder name on screen, and /undo would have removed the log of a command that may still be running.
 * Claude Code keeps its own state outside the project and its checkpoints track only the edits it made; here the kernel's log
 * folder is runtime state (as project-resource-inventory.ts already treats it for trust): in no snapshot, on no checkpoint row,
 * never touched by /undo. The person's own files under `.talos/` stay covered.
 */
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';

import {createCheckpointStore} from '../../src/workspace/checkpoint-store.ts';
import {undoCheckpoint} from '../../src/workspace/restore.ts';
import {rangeFiles} from '../../src/tui/overlays/checkpoint-picker.ts';

test('the kernel\'s background-command logs are not the person\'s work: not on the checkpoint, not removed by /undo',async()=>{
  const root=await mkdtemp(join(tmpdir(),'talos-checkpoint-runtime-'));
  const projectRoot=join(root,'project'),checkpointsRoot=join(root,'state');
  await mkdir(join(projectRoot,'.talos','processi-sfondo'),{recursive:true});
  await writeFile(join(projectRoot,'a.txt'),'before','utf8');
  await writeFile(join(projectRoot,'.talos','processi-sfondo','call_old.log'),'old run\n','utf8');
  const store=createCheckpointStore({rootDir:checkpointsRoot,projectRoot});
  const handle=await store.begin({operation:'start'});
  assert.equal(Object.keys((await store.show(handle.id)).pre.entries).some(key=>key.includes('processi-sfondo')),false,'not in the snapshot before');
  /* the turn: the person's file changes, a background command logs, and a note of the person's own goes under .talos */
  await writeFile(join(projectRoot,'a.txt'),'after','utf8');
  const log=join(projectRoot,'.talos','processi-sfondo','call_bg_1.log');
  await writeFile(log,'still running\n','utf8');
  await writeFile(join(projectRoot,'.talos','notes.md'),'mine\n','utf8');
  const completed=await handle.finalize();
  const files=rangeFiles([completed]).map(row=>row.path).sort();
  assert.deepEqual(files,['.talos/notes.md','a.txt'],'the checkpoint names the person\'s files, not the kernel\'s log');
  await undoCheckpoint({store,id:handle.id});
  assert.equal(await readFile(join(projectRoot,'a.txt'),'utf8'),'before');
  assert.equal(existsSync(join(projectRoot,'.talos','notes.md')),false,'the person\'s own file under .talos is undone');
  assert.equal(await readFile(log,'utf8'),'still running\n','/undo leaves the running command\'s log');
  assert.equal(await readFile(join(projectRoot,'.talos','processi-sfondo','call_old.log'),'utf8'),'old run\n');
});
