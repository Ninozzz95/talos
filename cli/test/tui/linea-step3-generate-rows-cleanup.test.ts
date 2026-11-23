/*
 * Judge v1610 point 3 (v1607): the kernel rows generator (`test/fixtures/kernel-compaction/generate-rows.mjs`) created its folders with
 * `mkdtempSync(join(tmpdir(),'talos-kernel-rows-'))` / `'talos-kernel-journal-'` and never removed them: one run with the real TEMP left
 * 51 of them in the owner's TEMP. This runs the generator in a child process, on its smallest scene, with a TEMP of its own, and counts
 * the folders left: none.
 * Precedent: Codex's test folders are `TempDir::new()`, removed when the test ends (codex-rs/core/tests/suite/compact.rs:6049); the
 * kernel's own `tests/aiuto/rimuovi-cartella-di-prova.mjs` removes with retries on EBUSY/EPERM.
 */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import test from 'node:test';

const REPO=path.resolve(import.meta.dirname,'..','..','..');
const GENERATOR=path.resolve(import.meta.dirname,'..','fixtures','kernel-compaction','generate-rows.mjs');

test('LINEA-3 v1610: the kernel rows generator leaves no folder of its own in TEMP',{timeout:240_000},t=>{
  const temp=mkdtempSync(path.join(tmpdir(),'linea3-generator-'));
  t.after(()=>rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:50}));
  const out=path.join(temp,'rows.json');
  const {NODE_TEST_CONTEXT:_context,...environment}=process.env;
  const child=spawnSync(process.execPath,[GENERATOR,REPO,out,'adopted-after-refusal-cap-8k'],{cwd:REPO,encoding:'utf8',timeout:200_000,
    env:{...environment,TEMP:temp,TMP:temp,TMPDIR:temp,TALOS_HARNESS_UI_KEYRING:'memoria'}});
  assert.equal(child.status,0,`the generator failed:\n${String(child.stderr).slice(-2000)}`);
  assert.match(String(child.stdout),/^adopted-after-refusal-cap-8k compattazione-fine:overflow:istantanea$/mu,'the scene really ran');
  const left=readdirSync(temp).filter(name=>name.startsWith('talos-kernel-'));
  assert.deepEqual(left,[],`folders the generator left in TEMP: ${left.length}`);
});
