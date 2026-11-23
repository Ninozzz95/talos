/*
 * Startup stage (01/10, registro 12): the CLI ships as an esbuild bundle (scripts/bundle.mjs). Measured on 01/10: 1,188
 * modules before the composer — 428 of them es-toolkit, pulled in by Ink — and a bundle of the same build opened the
 * composer in 686 ms instead of 923. Gemini CLI ships the same way (esbuild, ESM, code splitting, native modules external).
 * What the bundle must keep, checked on its output:
 *   - one entry the bin can run (dist/main.js) and the notification worker the CLI starts by path, next to it;
 *   - Ink's instance registry bundled ONCE: the row writer finds the running Ink through it, and a second copy (resolved
 *     from node_modules at run time, as the sources do) would be empty — the writer would silently not be installed;
 *   - React's production builds only (NODE_ENV fixed at build time), so React 19's Performance Tracks never run;
 *   - native and heavy modules left to node_modules, loaded only when used.
 */
import assert from 'node:assert/strict';
import {mkdtempSync,readdirSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {buildBundle} from '../../scripts/bundle.mjs';

let built:{outdir:string;files:string[];text:string;meta:any}|undefined;
async function bundle(){
  if(built)return built;
  const outdir=mkdtempSync(join(tmpdir(),'talos-bundle-'));
  const meta=await buildBundle({outdir});
  const files=readdirSync(outdir);
  const text=files.filter(f=>f.endsWith('.js')).map(f=>readFileSync(join(outdir,f),'utf8')).join('\n');
  built={outdir,files,text,meta};
  return built;
}
test.after(()=>{if(built)rmSync(built.outdir,{recursive:true,force:true});});

test('the bundle has the entry the bin runs and the workers started by path, next to it',async()=>{
  const {files}=await bundle();
  assert.ok(files.includes('main.js'),files.join(', '));
  assert.ok(files.includes('windows-notification-worker.js'),files.join(', '));
  /* startup stall (08/10): the sandbox check's measurement runs on a worker thread started by path (mxc-support-probe.ts) */
  assert.ok(files.includes('mxc-support-worker.js'),files.join(', '));
  assert.ok(files.every(f=>!f.includes('/')&&!f.includes('\\')),'every output sits in dist/ itself: the CLI resolves files next to its own module');
});

test('Ink\'s instance registry is bundled once, and the row writer reads that copy',async()=>{
  const {text}=await bundle();
  assert.equal(text.split('node_modules/ink/build/instances.js').length-1,1,'one bundled copy of ink/build/instances.js');
  assert.doesNotMatch(text,/import\.meta\.resolve\(["']ink["']\)/u,'no run-time lookup of a second Ink from node_modules');
});

test('React is bundled in its production builds only',async()=>{
  const {text}=await bundle();
  assert.doesNotMatch(text,/react-reconciler\.development|react\.development|scheduler\.development/u);
  assert.match(text,/react-reconciler\.production/u);
});

test('native and heavy modules stay in node_modules',async()=>{
  const {text}=await bundle();
  for(const name of ['node-pty','@microsoft/mxc-sdk','@napi-rs/keyring','sqlite-vec','@vscode/ripgrep'])
    assert.doesNotMatch(text,new RegExp(`node_modules/${name.replace('/','\\/')}/`,'u'),`${name} is not bundled`);
});

/* P-F (owner 08/10/2026): the CLI's MCP probe used to resolve the SDK from the kernel's package.json at run time (createRequire(harness-ui/package.json)), which needs
   the package installed beside the kernel. The kernel is bundled with its own copy now, so the CLI bundles the SDK itself, in a chunk loaded only on use. */
test('the MCP client SDK is bundled into the CLI (a lazy chunk), not left to be resolved from disk',async()=>{
  const {text}=await bundle();
  assert.ok(!/from\s*["']@modelcontextprotocol\/client(?:\/stdio)?["']/u.test(text),'no bare import of the SDK left in the bundle');
  assert.match(text,/class StdioClientTransport|StdioClientTransport\s*=/u,'the stdio transport is inside the bundle');
});

/* P-F (08/10): packages inlined into the bundle are no longer installed beside it, so their licences travel with it. */
test('the licences of the packages the CLI bundle inlines travel in dist/THIRD_PARTY_LICENSES.txt',async()=>{
  const {outdir,files}=await bundle();
  assert.ok(files.includes('THIRD_PARTY_LICENSES.txt'),files.join(', '));
  const text=readFileSync(join(outdir,'THIRD_PARTY_LICENSES.txt'),'utf8');
  const lines=text.split('\n');
  for(const name of ['ink','react','@modelcontextprotocol/client','zod'])assert.ok(lines.some(line=>line.startsWith(`${name}@`)),`${name} is listed with its version`);
  assert.match(text,/Permission is hereby granted, free of charge/u,'at least one MIT licence text is there');
  const listed=lines.filter(line=>/^[^\s=].*@[0-9].* {2}\(/u.test(line)).length;
  const without=lines.filter(line=>line.startsWith('(this package ships no licence file')).length;
  assert.ok(listed>=30&&without<listed/2,`most of the ${listed} packages carry their licence text (${without} do not)`);
});
