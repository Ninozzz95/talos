/*
 * R7 (2026-09-25): `tsc` leaves what it no longer emits in `dist/`, and the first `npm publish --dry-run` of talos-code
 * 0.1.0 listed 148 stale files (the old gateway, Hermes's tui2 bundle with its LICENSE, the hermes-ink fork). `prepack`
 * starts from an empty dist/; the cleaner removes only `<cli>/dist`, and nothing when git tracks a file under it.
 */
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {cleanDist} from '../../scripts/clean-dist.mjs';

const stage=()=>{const root=mkdtempSync(join(tmpdir(),'talos-clean-dist-'));mkdirSync(join(root,'dist','tui2'),{recursive:true});writeFileSync(join(root,'dist','tui2','LICENSE'),'old');writeFileSync(join(root,'dist','main.js'),'x');writeFileSync(join(root,'keep.txt'),'keep');return root;};

test('R7: prepack empties dist/ before building and copying the kernel',()=>{
  const pkg=JSON.parse(readFileSync(new URL('../../package.json',import.meta.url),'utf8'));
  /* installation, documents (02/10): the build copies the kernel and then builds the document libraries into vendor/node_modules;
     a second pack-vendor after it would empty vendor/ again and drop them, so prepack is clean + build */
  assert.match(pkg.scripts.prepack,/^node scripts\/clean-dist\.mjs && npm run build$/u);
  /* P-F (08/10): the last step bundles kernel/ from the vendored copy and the document libraries, so it comes after both */
  assert.match(pkg.scripts.build,/node scripts\/pack-vendor\.mjs && node scripts\/pack-documents\.mjs && node scripts\/bundle-kernel\.mjs$/u);
});

test('R7: the cleaner removes <cli>/dist and nothing else',async()=>{
  const root=stage();
  const result=await cleanDist({cliRoot:root,tracked:()=>[]});
  assert.equal(result.removed,true);
  assert.equal(existsSync(join(root,'dist')),false);
  assert.equal(readFileSync(join(root,'keep.txt'),'utf8'),'keep');
  assert.deepEqual(await cleanDist({cliRoot:root,tracked:()=>{throw new Error('not asked when there is no dist');}}),{target:join(root,'dist'),removed:false});
});

test('R7: a tracked file under dist/ stops the cleaner, and nothing is removed',async()=>{
  const root=stage();
  await assert.rejects(()=>cleanDist({cliRoot:root,tracked:()=>['dist/main.js']}),(e:any)=>e?.code==='DIST_HAS_TRACKED_FILES');
  assert.equal(existsSync(join(root,'dist','tui2','LICENSE')),true);
  await assert.rejects(()=>cleanDist({cliRoot:root,tracked:()=>{throw Object.assign(new Error('x'),{code:'DIST_TRACKING_UNKNOWN'});}}),(e:any)=>e?.code==='DIST_TRACKING_UNKNOWN');
  assert.equal(existsSync(join(root,'dist','main.js')),true);
});
