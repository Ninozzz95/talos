/*
 * Installation, Linux proof in WSL (02/10, registro 12): `talos --version` printed NOTHING and exited 0. npm installs the
 * bin on Linux and macOS as a SYMLINK (`bin/talos -> ../lib/node_modules/talos-code/dist/main.js`); Node runs the real
 * file, so `import.meta.url` is the real path while `process.argv[1]` is the link, and the entry check in main.ts
 * (`import.meta.url === pathToFileURL(process.argv[1]).href`) decided TALOS had been imported, not run. On Windows npm
 * writes a `.cmd` launcher with the real path, which is why no Windows test saw it. Reproduced here on every system with
 * a link to the built bundle (a junction on Windows: no administrator rights needed). Node 24's `import.meta.main`
 * (added in 24.2.0) answers the question itself; Codex, Claude Code and Gemini CLI avoid it with a bin that always runs.
 */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {buildBundle} from '../../scripts/bundle.mjs';
import {CLI_VERSION} from '../../src/version.ts';

test('the bundle runs when started through a link to it, as npm installs the bin on Linux and macOS',async t=>{
  const base=mkdtempSync(join(tmpdir(),'talos-entry-link-'));t.after(()=>rmSync(base,{recursive:true,force:true}));
  const outdir=join(base,'dist');await buildBundle({outdir});
  const link=join(base,'linked');symlinkSync(outdir,link,process.platform==='win32'?'junction':'dir');
  const direct=spawnSync(process.execPath,[join(outdir,'main.js'),'--version'],{encoding:'utf8',timeout:60_000});
  assert.equal(direct.stdout.trim(),CLI_VERSION,`direct run: ${direct.stderr}`);
  const linked=spawnSync(process.execPath,[join(link,'main.js'),'--version'],{encoding:'utf8',timeout:60_000});
  assert.equal(linked.stdout.trim(),CLI_VERSION,`through the link TALOS must still run (exit ${linked.status}): ${linked.stderr}`);
});

test('imported, never run: the entry check is false for a module that imports main',async()=>{
  /* `--version` in the arguments: if importing main started TALOS, the version would be printed (mutation «always started») */
  const main=new URL('../../src/main.ts',import.meta.url).href;
  const run=spawnSync(process.execPath,['--input-type=module','-e',`await import(${JSON.stringify(main)});await new Promise(r=>setTimeout(r,500));console.log("imported")`,'importer','--version'],{encoding:'utf8',timeout:60_000,env:{...process.env,NODE_OPTIONS:''}});
  assert.equal(run.stdout.trim(),'imported',run.stderr);
});
