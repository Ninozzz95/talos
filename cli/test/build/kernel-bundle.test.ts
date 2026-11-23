/*
 * P-F (owner 08/10/2026, «Sì: bundle kernel + librerie, vendor solo sorgente di build»; registro 12 Voce 24): scripts/bundle-kernel.mjs turns the
 * vendored kernel into `kernel/`, the runtime the package ships, with the SAME layout as vendor/ and a handful of files instead of hundreds.
 * Measured on a quiet machine (9 alternated rounds after 2 priming, a fresh process each, the three entries the CLI loads first): 217 ms as loose
 * files, 129 ms as this bundle (-41%), 51 files loaded instead of 259.
 * What these tests pin, on a small fake kernel (hermetic) and on the real one:
 *   - the entries: the registry and the harness always, every module the CLI names, every code file the kernel starts BY PATH (a Worker), at their
 *     original place; assets read next to them are copied; the kernel's own tests are not runtime;
 *   - every output file loads (the vendored `const require = createRequire(...)` must not collide with the bundle's own);
 *   - `import.meta.url` of a vendored module is the URL it had in vendor/, wherever esbuild put its code (an entry or a shared chunk);
 *   - a Worker started by path, and a migration read next to a worker, work from the bundle;
 *   - inlined npm packages are listed with their licence text; external ones stay imports;
 *   - a folder it did not make is never emptied, and without the vendored copy it refuses.
 */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync,mkdirSync,mkdtempSync,readdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import test from 'node:test';
import {buildKernel,kernelEntries,KERNEL_EXTERNAL,pathReferencesOf} from '../../scripts/bundle-kernel.mjs';

const CLI_ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..','..');
const created:string[]=[];
test.after(()=>{for(const dir of created)rmSync(dir,{recursive:true,force:true});});

function put(root:string,path:string,text:string){const full=join(root,...path.split('/'));mkdirSync(dirname(full),{recursive:true});writeFileSync(full,text);}

/** A fake CLI root: sources that name kernel modules, a vendored kernel with a Worker, a migration, a createRequire user and two fake npm packages. */
function fakeRoot(){
  const root=mkdtempSync(join(tmpdir(),'talos-kernel-bundle-'));created.push(root);
  /* the CLI also names context-engine modules, in pieces: join(contextRoot,'engine.mjs'), join(contextRoot,'node','sqlite-store.mjs') (the R5A-WINDOW gate failure) */
  put(root,'src/facade.ts',"export const load=(r:string)=>importTalosModule(r,'notes-store.mjs');\nexport const other=(r:string)=>importTalosModule(r,'not-in-the-kernel.mjs');\nexport const engine=(c:string)=>[join(c,'engine.mjs'),join(c,'node','sqlite-store.mjs')];\n/* a CLI source may MENTION a kernel test by name (a comment, a message); that never makes it runtime */\nexport const mention='talosHarness.test.mjs';\n");
  put(root,'vendor/context-engine/src/engine.mjs',"export const engine='the context engine';\n");
  put(root,'node_modules/inlined-lib/package.json',JSON.stringify({name:'inlined-lib',version:'1.2.3',license:'MIT',main:'index.js'}));
  put(root,'node_modules/inlined-lib/index.js',"module.exports={answer:42};\n");
  put(root,'node_modules/inlined-lib/LICENSE','MIT License\nCopyright (c) inlined-lib authors\n');
  /* a scoped package whose licence file is called COPYING, as some are */
  put(root,'node_modules/@scope/copying-lib/package.json',JSON.stringify({name:'@scope/copying-lib',version:'0.9.0',license:'ISC',main:'index.js'}));
  put(root,'node_modules/@scope/copying-lib/index.js',"module.exports={copying:true};\n");
  put(root,'node_modules/@scope/copying-lib/COPYING','ISC licence text of copying-lib\n');
  put(root,'vendor/manifest.json',JSON.stringify({schema:'talos.cli.vendor.v1',sourceCommit:'abc1234567',files:9,sha256:{}}));
  put(root,'vendor/harness-ui/package.json','{"name":"talos-harness-ui"}');
  put(root,'vendor/context-engine/package.json','{"name":"context-engine"}');
  put(root,'vendor/harness-ui/src/helper.mjs',"export const helper=()=>'helper';\nexport const helperWhere=import.meta.url;\n");
  put(root,'vendor/harness-ui/src/session-registry.mjs',
    "import {helper} from './helper.mjs';\nimport lib from 'inlined-lib';\nimport copying from '@scope/copying-lib';\nimport {sqliteWhere,readMigration} from '../../context-engine/src/node/sqlite-store.mjs';\n"+
    "export {helper,lib,copying,sqliteWhere,readMigration};\nexport const where=import.meta.url;\nexport const workerUrl=new URL('./process-worker.mjs',import.meta.url).href;\n");
  /* the two document modules the installed-package proof imports by path */
  put(root,'vendor/harness-ui/src/document-generator.mjs',"export const generate=()=>'document';\n");
  put(root,'vendor/harness-ui/src/kernel/estrai-documento.mjs',"export const extract=()=>'text';\n");
  put(root,'vendor/harness-ui/src/notes-store.mjs',"import {helper,helperWhere} from './helper.mjs';\nexport {helper,helperWhere};\nexport const where=import.meta.url;\n");
  put(root,'vendor/harness-ui/src/kernel/talosHarness.mjs',
    "import {createRequire} from 'node:module';\nimport {readFileSync} from 'node:fs';\nconst require=createRequire(import.meta.url);\n"+
    "export const where=import.meta.url;\nexport const docLibFrom=()=>require.resolve('docs-lib');\n"+
    "export const readData=()=>readFileSync(new URL('./data.sql',import.meta.url),'utf8');\n");
  put(root,'vendor/harness-ui/src/kernel/data.sql','select 1;\n');
  put(root,'vendor/harness-ui/src/process-worker.mjs',"import {parentPort} from 'node:worker_threads';\nparentPort.postMessage('hello from the worker');\n");
  put(root,'vendor/harness-ui/src/kernel/talosHarness.test.mjs',"throw new Error('a kernel test is never runtime'); export const w=new URL('./only-for-tests.mjs',import.meta.url);\n");
  put(root,'vendor/harness-ui/src/kernel/only-for-tests.mjs',"export const never='only a kernel test starts me by path';\n");
  put(root,'vendor/harness-ui/src/not-named.mjs',"export const never='no CLI source names me and nothing starts me by path';\n");
  put(root,'vendor/context-engine/src/node/sqlite-store.mjs',"export const sqliteWhere=import.meta.url;\nexport const readMigration=()=>import('node:fs').then(fs=>fs.readFileSync(new URL('./migrations/001.sql',import.meta.url),'utf8'));\nexport const workerPath=new URL('./sqlite-worker.mjs',import.meta.url).href;\n");
  put(root,'vendor/context-engine/src/node/sqlite-worker.mjs',"import {readFileSync} from 'node:fs';\nimport {parentPort} from 'node:worker_threads';\nparentPort.postMessage(readFileSync(new URL('./migrations/001.sql',import.meta.url),'utf8'));\n");
  put(root,'vendor/context-engine/src/node/migrations/001.sql','create table t(x);\n');
  /* the document libraries as pack-documents leaves them */
  put(root,'vendor/node_modules/docs-lib/package.json','{"name":"docs-lib","main":"index.js"}');
  put(root,'vendor/node_modules/docs-lib/index.js','module.exports={};\n');
  return root;
}
async function build(root:string){return buildKernel({cliRoot:root,vendorRoot:join(root,'vendor'),outdir:join(root,'kernel')});}
const files=(dir:string):string[]=>readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(join(dir,entry.name)).map(f=>`${entry.name}/${f}`):[entry.name]);
const run=(root:string,code:string)=>spawnSync(process.execPath,['--input-type=module','-e',code],{cwd:root,encoding:'utf8',timeout:60_000});

test('K1 the entries: registry and harness always, what the CLI names, what the kernel starts by path - never a test, never what nothing uses',async()=>{
  const root=fakeRoot();
  const {entries,assets}=await kernelEntries({cliRoot:root,vendorRoot:join(root,'vendor')});
  assert.deepEqual(entries,[
    'context-engine/src/engine.mjs',
    'context-engine/src/node/sqlite-store.mjs',
    'context-engine/src/node/sqlite-worker.mjs',
    'harness-ui/src/document-generator.mjs',
    'harness-ui/src/kernel/estrai-documento.mjs',
    'harness-ui/src/kernel/talosHarness.mjs',
    'harness-ui/src/notes-store.mjs',
    'harness-ui/src/process-worker.mjs',
    'harness-ui/src/session-registry.mjs',
  ]);
  assert.deepEqual(assets,['context-engine/src/node/migrations/001.sql','harness-ui/src/kernel/data.sql']);
});

test('K2 the layout is the vendor layout: entries at their place as .mjs, shared chunks inside harness-ui/src, assets and package.json beside them',async()=>{
  const root=fakeRoot();const {manifest}=await build(root);
  const out=files(join(root,'kernel')).sort();
  for(const expected of ['harness-ui/src/session-registry.mjs','harness-ui/src/notes-store.mjs','harness-ui/src/kernel/talosHarness.mjs','harness-ui/src/process-worker.mjs','context-engine/src/node/sqlite-worker.mjs','context-engine/src/node/migrations/001.sql','harness-ui/src/kernel/data.sql','harness-ui/package.json','context-engine/package.json','manifest.json','THIRD_PARTY_LICENSES.txt','node_modules/docs-lib/index.js'])assert.ok(out.includes(expected),`${expected} in ${out.join(', ')}`);
  const chunks=out.filter(f=>/chunk-/u.test(f));
  assert.ok(chunks.length>0&&chunks.every(f=>f.startsWith('harness-ui/src/chunk-')),`shared chunks live in harness-ui/src: ${chunks.join(', ')}`);
  assert.ok(!out.some(f=>/\.test\.mjs$/u.test(f)),'no kernel test');
  assert.ok(!out.some(f=>f.endsWith('only-for-tests.mjs')),'what only a kernel test starts by path is not built');
  assert.ok(!out.some(f=>f.endsWith('not-named.mjs')),'a module nothing names or starts is not built');
  assert.equal(manifest.schema,'talos.cli.kernel.v1');assert.equal(manifest.vendorSourceCommit,'abc1234567');
  assert.ok(Object.keys(manifest.outputs).every(f=>out.includes(f)),'every output in the manifest exists');
});

test('K3 every output file loads in a fresh process (the vendored top-level `const require` does not collide with the bundle\'s)',async()=>{
  const root=fakeRoot();await build(root);
  const mjs=files(join(root,'kernel')).filter(f=>f.endsWith('.mjs')&&!f.includes('worker')).sort();
  assert.ok(mjs.length>=4);
  const code=`for (const f of ${JSON.stringify(mjs)}) await import(${JSON.stringify(pathToFileURL(join(root,'kernel')).href+'/')}+f); console.log('loaded', ${mjs.length});`;
  const result=run(root,code);
  assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/loaded \d+/u);
});

test('K4 `import.meta.url` of a vendored module is the URL it had in vendor/, wherever its code ended up',async()=>{
  const root=fakeRoot();await build(root);
  const base=pathToFileURL(join(root,'kernel')).href;
  const result=run(root,`
    const registry = await import(${JSON.stringify(base+'/harness-ui/src/session-registry.mjs')});
    const notes = await import(${JSON.stringify(base+'/harness-ui/src/notes-store.mjs')});
    const harness = await import(${JSON.stringify(base+'/harness-ui/src/kernel/talosHarness.mjs')});
    console.log(JSON.stringify({registry: registry.where, notes: notes.where, helper: notes.helperWhere, harness: harness.where, sqlite: registry.sqliteWhere}));`);
  assert.equal(result.status,0,result.stderr);
  const seen=JSON.parse(result.stdout.trim().split('\n').at(-1)!);
  const kernelUrl=(path:string)=>`${base}/${path}`;
  assert.equal(seen.registry,kernelUrl('harness-ui/src/session-registry.mjs'));
  assert.equal(seen.notes,kernelUrl('harness-ui/src/notes-store.mjs'));
  assert.equal(seen.helper,kernelUrl('harness-ui/src/helper.mjs'),'a module inlined into a shared chunk still says where it was');
  assert.equal(seen.harness,kernelUrl('harness-ui/src/kernel/talosHarness.mjs'));
  assert.equal(seen.sqlite,kernelUrl('context-engine/src/node/sqlite-store.mjs'),'a context-engine module keeps its place beside harness-ui');
});

test('K5 a Worker started by path, a migration read next to a worker, an asset, and createRequire all work from the bundle',async()=>{
  /* the child runs under `-e --input-type=module`; a Worker would inherit those flags and refuse a file, so the test gives it none */
  const root=fakeRoot();await build(root);
  const base=pathToFileURL(join(root,'kernel')).href;
  const result=run(root,`
    import {Worker} from 'node:worker_threads';
    const registry = await import(${JSON.stringify(base+'/harness-ui/src/session-registry.mjs')});
    const harness = await import(${JSON.stringify(base+'/harness-ui/src/kernel/talosHarness.mjs')});
    const ask = (url) => new Promise((resolve, reject) => { const w = new Worker(new URL(url), {execArgv: []}); w.once('message', resolve); w.once('error', reject); });
    console.log(JSON.stringify({
      worker: await ask(registry.workerUrl),
      migration: await registry.readMigration(),
      asset: harness.readData(),
      docs: harness.docLibFrom().replaceAll('\\\\', '/').split('/kernel/').at(-1),
    }));
    process.exit(0);`);
  assert.equal(result.status,0,result.stderr);
  const seen=JSON.parse(result.stdout.trim().split('\n').at(-1)!);
  assert.equal(seen.worker,'hello from the worker');
  assert.equal(seen.migration,'create table t(x);\n');
  assert.equal(seen.asset,'select 1;\n');
  assert.equal(seen.docs,'node_modules/docs-lib/index.js','createRequire(import.meta.url) looks where it looked in vendor/: kernel/node_modules');
  const sqliteWorker=run(root,`
    import {Worker} from 'node:worker_threads';
    const w = new Worker(new URL(${JSON.stringify(base+'/context-engine/src/node/sqlite-worker.mjs')}), {execArgv: []});
    w.once('message', (m) => { console.log(JSON.stringify(m)); process.exit(0); }); w.once('error', (e) => { console.error(e); process.exit(2); });`);
  assert.equal(sqliteWorker.status,0,sqliteWorker.stderr);
  assert.equal(JSON.parse(sqliteWorker.stdout.trim()),'create table t(x);\n','the context-engine worker reads its migration from beside itself');
});

test('K6 an inlined npm package is bundled with its licence text listed; an external one stays an import',async()=>{
  const root=fakeRoot();const {manifest}=await build(root);
  assert.deepEqual(manifest.inlinedPackages.map((p:any)=>p.name),['@scope/copying-lib','inlined-lib']);
  assert.ok(manifest.inlinedPackages.every((p:any)=>p.hasText===true),'both licence files were found, COPYING included');
  const licences=readFileSync(join(root,'kernel','THIRD_PARTY_LICENSES.txt'),'utf8');
  assert.match(licences,/^Third-party packages inlined into the TALOS kernel bundle \(2\)\./u,'the header counts the packages');
  assert.match(licences,/inlined-lib@1\.2\.3 {2}\(MIT\)/u);assert.match(licences,/Copyright \(c\) inlined-lib authors/u);
  assert.match(licences,/@scope\/copying-lib@0\.9\.0 {2}\(ISC\)/u);assert.match(licences,/ISC licence text of copying-lib/u);
  const text=files(join(root,'kernel')).filter(f=>f.endsWith('.mjs')).map(f=>readFileSync(join(root,'kernel',f),'utf8')).join('\n');
  assert.ok(!/from\s*["']inlined-lib["']/u.test(text),'the package is inlined, not imported at run time');
  for(const external of ['node-pty','@napi-rs/keyring','sqlite-vec','@vscode/ripgrep','node-notifier','@microsoft/mxc-sdk','typescript','docx','pdfmake','iconv-lite'])assert.ok(KERNEL_EXTERNAL.includes(external),`${external} stays external`);
  /* 03/11 (cli 0.7.0, 10b0d05d6 made the CLI reach guarda-immagine-ospite.mjs): `npm run build` failed, «No loader is configured
     for ".node" files: …/skia.win32-x64-msvc.node». The image resizer is optional — the kernel imports it on use and falls back
     to the attachment cap when it is missing (guarda-immagine-ospite.mjs:50-55) — so it is left outside, never bundled. */
  assert.ok(KERNEL_EXTERNAL.includes('@napi-rs/canvas'),'@napi-rs/canvas (a native binary, optional) stays external');
  assert.ok(!KERNEL_EXTERNAL.includes('@modelcontextprotocol/client'),'the MCP client is inlined (the CLI bundles its own copy, loaded on use): its 95 zod files no longer load with the kernel');
});

test('K7 it never empties a folder it did not make, and without the vendored copy it refuses',async()=>{
  const root=fakeRoot();
  put(root,'kernel/precious.txt','not ours');
  await assert.rejects(build(root),(error:any)=>error.code==='KERNEL_OUT_NOT_OURS');
  assert.equal(readFileSync(join(root,'kernel','precious.txt'),'utf8'),'not ours');
  const bare=mkdtempSync(join(tmpdir(),'talos-kernel-bare-'));created.push(bare);
  await assert.rejects(buildKernel({cliRoot:bare,vendorRoot:join(bare,'vendor'),outdir:join(bare,'kernel')}),(error:any)=>error.code==='KERNEL_VENDOR_MISSING');
});

test('K8 building again over its own output replaces it (no stale chunk survives)',async()=>{
  const root=fakeRoot();await build(root);
  put(root,'kernel/harness-ui/src/chunk-STALE.mjs','// from an earlier build\n');
  await build(root);
  assert.ok(!existsSync(join(root,'kernel','harness-ui','src','chunk-STALE.mjs')));
});

test('K9 the real kernel: every module the CLI names is built, the entries load in a fresh process, and the CLI imports resolve inside the bundle',{timeout:180_000,skip:!existsSync(join(CLI_ROOT,'vendor','manifest.json'))&&'cli/vendor is generated by `npm run build`'},async()=>{
  /* inside cli/ so that the external packages resolve from cli/node_modules, as they do when installed */
  const outdir=mkdtempSync(join(CLI_ROOT,'.kernel-bundle-test-'));created.push(outdir);
  const {manifest}=await buildKernel({cliRoot:CLI_ROOT,outdir});
  const {entries}=await kernelEntries({cliRoot:CLI_ROOT});
  for(const entry of [...entries,'harness-ui/src/session-registry.mjs','harness-ui/src/kernel/talosHarness.mjs'])assert.ok(existsSync(join(outdir,...entry.split('/'))),`${entry} was built`);
  assert.ok(entries.includes('harness-ui/src/session-store.mjs')&&entries.includes('harness-ui/src/notes-store.mjs'),'the modules the CLI facades import by name are entries');
  const base=pathToFileURL(outdir).href;
  const result=run(CLI_ROOT,`
    const names = ['harness-ui/src/session-registry.mjs', 'harness-ui/src/kernel/talosHarness.mjs', 'harness-ui/src/session-store.mjs', 'harness-ui/src/notes-store.mjs', 'harness-ui/src/mcp-client.mjs', 'harness-ui/src/provider-registry.mjs',
      'context-engine/src/engine.mjs', 'context-engine/src/node/sqlite-store.mjs', 'harness-ui/src/context-provider-adapter.mjs', 'harness-ui/src/context-desktop-service.mjs', 'harness-ui/src/context-token-counters.mjs'];
    for (const name of names) await import(${JSON.stringify(base+'/')}+name);
    console.log('loaded', names.length); process.exit(0);`);
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/loaded 11/u);
  /* the context bridge (talos-composition.ts) imports these five by path; one missing and the status line loses its context figures */
  for(const needed of ['context-engine/src/engine.mjs','context-engine/src/node/sqlite-store.mjs','harness-ui/src/context-provider-adapter.mjs','harness-ui/src/context-desktop-service.mjs','harness-ui/src/context-token-counters.mjs'])assert.ok(entries.includes(needed),`${needed} is an entry`);
  const codeFiles=Object.keys(manifest.outputs).filter(f=>f.endsWith('.mjs')).length;
  /* 119 files until the realignment to r4 de8f33317 (13/10/2026), 120 with it (the automation schedule and the ChatGPT plan modules);
     129 with r4 e1cbc26f4 (14/10/2026, the /goal modules), 131 when the CLI named chatgpt-limiti.mjs (0.6.6, the plan's reset time,
     one entry and the chunk it splits off): the bound is "not hundreds". 138 in 0.6.12, 140 in 0.6.13: the CLI runs the desktop's
     kernel adapter (talosHarness.desktop-hotfix.mjs), one entry more and the chunk shared with the bare kernel. 161 with r4 570af3201
     (26/10/2026, 0.6.15): the kernel's two new modules sistema-piegato.mjs and registro-tentativi.mjs, imported by talosHarness.
     174 with r4 707b93ccb (blocks 13-18). 190 with r4 e54787620 and the CLI reaching view_image and the guide (03/11, 0.7.0; first
     counted that evening: from 10b0d05d6 the build had stopped on @napi-rs/canvas before this line). What startup costs is
     measured against the previous release (scripts/startup-gate.ts). */
  assert.ok(codeFiles<210,`a handful of files, not hundreds: ${codeFiles}`);
});

test('K10 a kernel without the two document modules still builds: they are entries only when they are there',async()=>{
  const root=fakeRoot();
  rmSync(join(root,'vendor','harness-ui','src','document-generator.mjs'));rmSync(join(root,'vendor','harness-ui','src','kernel','estrai-documento.mjs'));
  const {manifest}=await build(root);
  assert.ok(!manifest.entries.includes('harness-ui/src/document-generator.mjs')&&!manifest.entries.includes('harness-ui/src/kernel/estrai-documento.mjs'));
  assert.ok(existsSync(join(root,'kernel','harness-ui','src','session-registry.mjs')));
});

/* After the review of 0.6.3 (bugfixer, 14/10/2026), item 2c. The desktop server's own modules (`kernel-di-serie-desktop*.mjs`) are not
   followed: what they name by path would become an unused entry of the published package. They were recognised by FILE NAME, so a
   kernel module of the same name anywhere else in the vendored tree would have its Worker or asset dropped from the bundle, silently.
   They are recognised by their path below the vendored root. */
test('K11 only the desktop server\'s own modules are not followed, by their path: a file of the same name elsewhere is',async()=>{
  const root=fakeRoot();
  put(root,'vendor/harness-ui/src/kernel-di-serie-desktop.mjs',"export const adapter=new URL('./kernel/desktop-adapter.mjs',import.meta.url);\n");
  put(root,'vendor/harness-ui/src/kernel-di-serie-desktop.avvio.mjs',"export const data=new URL('./desktop-only.json',import.meta.url);\n");
  put(root,'vendor/harness-ui/src/kernel/desktop-adapter.mjs',"export const desktop=true;\n");
  put(root,'vendor/harness-ui/src/desktop-only.json','{}\n');
  /* the same names, in another folder of the kernel: what they start by path is the kernel's */
  put(root,'vendor/harness-ui/src/research/kernel-di-serie-desktop.mjs',"export const worker=new URL('./research-worker.mjs',import.meta.url);\n");
  put(root,'vendor/harness-ui/src/research/research-worker.mjs',"export const research=true;\n");
  put(root,'vendor/context-engine/src/kernel-di-serie-desktop.avvio.mjs',"export const data=new URL('./engine-data.sql',import.meta.url);\n");
  put(root,'vendor/context-engine/src/engine-data.sql','select 2;\n');
  const {entries,assets}=await pathReferencesOf({vendorRoot:join(root,'vendor')});
  assert.ok(!entries.includes('harness-ui/src/kernel/desktop-adapter.mjs'),'what the desktop server\'s module names became an entry');
  assert.ok(!assets.includes('harness-ui/src/desktop-only.json'),'what the desktop server\'s start-up names became an asset');
  assert.ok(entries.includes('harness-ui/src/research/research-worker.mjs'),'a kernel module that shares the desktop module\'s file name lost its Worker');
  assert.ok(assets.includes('context-engine/src/engine-data.sql'),'a context-engine module that shares the file name lost its asset');
});
