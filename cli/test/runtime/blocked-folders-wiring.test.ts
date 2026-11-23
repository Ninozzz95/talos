/*
 * Blocked folders, step B (contract round 2, revision 1; Desktop e33e35efe): every CLI window hands the kernel's session registry the
 * reader of the profile's blocks FILE (`bloccateDelDispositivoFn`), so a device's turn continued in a window that does not host remote
 * control (federation.ts) is held by the same blocks. The kernel's own tests prove what a block refuses; this proves the CLI wires it.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {fakeKeyring,hermetic,REPO_ROOT} from '../provider/first-run-fixture.ts';

test('every window\'s registry reads the blocks from the profile file, per device, and sees a change without a restart',async()=>{
  await hermetic(async h=>{
    const {composeTalosRuntime,loadModules}=await import('../../src/runtime/talos-composition.ts');
    const real:any=await loadModules(REPO_ROOT);
    let options:any=null;
    const context:any=await composeTalosRuntime({repoRoot:REPO_ROOT,projectRoot:h.project,paths:h.paths,model:'ollama:qwen3-coder-test',environmentKeys:'consent',keyring:fakeKeyring(),
      modules:{...real,createSessionRegistry:(o:any)=>{options=o;return real.createSessionRegistry(o);}}} as any);
    try{
      const read=options?.bloccateDelDispositivoFn;
      assert.equal(typeof read,'function','the registry got the reader');
      assert.deepEqual(await read('p1'),[],'no file: nothing blocked');
      const file=path.join(h.paths.dataRoot,'remote','cartelle-bloccate.json');
      const blocked=path.join(h.project,'secret');
      fs.mkdirSync(path.dirname(file),{recursive:true});
      fs.writeFileSync(file,JSON.stringify({v:1,dispositivi:{p1:[{percorso:blocked}]}}));
      /* the reader trusts a file's signature only once it is old enough: a fresh one is read again at each call */
      assert.deepEqual(await read('p1'),[blocked],'the device\'s block, from the file another process wrote');
      assert.deepEqual(await read('p2'),[],'per device');
      fs.writeFileSync(file,'{broken');
      await assert.rejects(read('p1'),{code:'REMOTE_CONSENTS_UNREADABLE'},'an unreadable file is never «nothing blocked»');
    }finally{await context?.runtime?.close?.().catch(()=>{});}
  });
});
