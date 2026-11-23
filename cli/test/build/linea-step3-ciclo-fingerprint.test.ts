/*
 * «One line», step 3 (11/11/2026, brief point d). The terminal ships the core it was built from: after `npm run build`, the bundled
 * kernel's manifest names the vendored tree by the sha256 of `vendor/manifest.json` (scripts/bundle-kernel.mjs:201), and the vendored
 * copy of the computer-use loop is the line's own file, byte for byte. The day the computer-use branch changes `ciclo.mjs` and
 * the terminal is not rebuilt, this is red.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

const CLI=fileURLToPath(new URL('../../',import.meta.url));
const VENDOR=`${CLI}vendor/manifest.json`;const KERNEL=`${CLI}kernel/manifest.json`;
const LINE_FILE=fileURLToPath(new URL('../../../harness-ui/src/computer-use/ciclo.mjs',import.meta.url));
const sha=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
const built=existsSync(VENDOR)&&existsSync(KERNEL);

test('LINEA-3 d: the bundled kernel names the vendored tree it was built from, and the vendored ciclo.mjs is the line\'s file',{skip:built?false:'not built: run npm run build first'},()=>{
  const vendorBytes=readFileSync(VENDOR);
  const kernel=JSON.parse(readFileSync(KERNEL,'utf8'));
  assert.equal(kernel.vendorManifestSha256,sha(vendorBytes),'kernel/manifest.json does not name this vendor/manifest.json');
  const vendor=JSON.parse(vendorBytes.toString('utf8'));
  const entry=vendor.sha256?.['harness-ui/src/computer-use/ciclo.mjs'];
  assert.equal(typeof entry,'string','the vendored tree has no computer-use loop');
  assert.equal(entry,sha(readFileSync(LINE_FILE)),'the vendored ciclo.mjs is not the line\'s file: rebuild the terminal (npm run build)');
});
