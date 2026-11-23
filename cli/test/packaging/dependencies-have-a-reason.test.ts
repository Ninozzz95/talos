/*
 * Installation (owner 02/10, «Passo all'installazione»): the installed talos-code was 12,730 files / 252 MB. Since the CLI
 * ships as an esbuild bundle (scripts/bundle.mjs), a package the bundle carries inside dist/ is not needed at run time,
 * and installing it costs files and seconds: Ink alone brought es-toolkit's 4,255 files. Gemini CLI and Qwen Code publish
 * with no runtime dependencies at all; clanka PR #192 keeps as dependencies only what the bundle leaves out.
 * So every runtime dependency must have a reason: a bundle leaves it outside on purpose (EXTERNAL: native, documents, sandbox, …).
 * Anything else belongs in devDependencies.
 * P-F (owner 08/10/2026, «bundle kernel + librerie, vendor solo sorgente di build»): the kernel is a bundle too now (kernel/,
 * scripts/bundle-kernel.mjs), so "the kernel imports it" is no longer a reason: ai, the AI-SDK providers, zod, the MCP client,
 * canonicalize, eventsource-parser and unicode-segmenter travel inside kernel/ and dist/ (with their licences) and are not installed.
 */
import assert from 'node:assert/strict';
import {readdirSync,readFileSync,statSync} from 'node:fs';
import {join} from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {EXTERNAL} from '../../scripts/bundle.mjs';
import {KERNEL_EXTERNAL} from '../../scripts/bundle-kernel.mjs';

const CLI=fileURLToPath(new URL('../../',import.meta.url));
const REPO=join(CLI,'..');

function kernelImports():Set<string>{
  const names=new Set<string>();
  const walk=(dir:string)=>{for(const entry of readdirSync(dir)){const full=join(dir,entry);if(entry==='node_modules')continue;
    if(statSync(full).isDirectory()){walk(full);continue;}
    if(!/\.(mjs|js)$/u.test(entry)||/\.test\./u.test(entry))continue;
    for(const match of readFileSync(full,'utf8').matchAll(/(?:from\s*|import\(\s*|require(?:\.resolve)?\(\s*)['"]([^'"./][^'"]*)['"]/gu)){
      const spec=match[1]!;if(spec.startsWith('node:'))continue;
      names.add(spec.startsWith('@')?spec.split('/').slice(0,2).join('/'):spec.split('/')[0]!);
    }}};
  walk(join(REPO,'harness-ui','src'));walk(join(REPO,'context-engine','src'));
  return names;
}

test('every runtime dependency is left outside a bundle on purpose (the CLI\'s or the kernel\'s)',()=>{
  const pkg=JSON.parse(readFileSync(join(CLI,'package.json'),'utf8'));
  const external=new Set<string>([...EXTERNAL,...KERNEL_EXTERNAL]);
  const reasonless=Object.keys(pkg.dependencies??{}).filter(name=>!external.has(name));
  assert.deepEqual(reasonless,[],`bundled into dist/ or kernel/, so devDependencies: ${reasonless.join(', ')}`);
});

test('what the kernel bundle inlines is not installed, yet the kernel still imports it (so it is a build dependency)',()=>{
  const pkg=JSON.parse(readFileSync(join(CLI,'package.json'),'utf8'));
  const kernel=kernelImports();
  for(const name of ['ai','zod','@ai-sdk/openai','@ai-sdk/anthropic','@ai-sdk/google','@modelcontextprotocol/client','canonicalize','eventsource-parser']){
    assert.ok(kernel.has(name),`${name} is imported by the kernel`);
    assert.ok(!pkg.dependencies?.[name],`${name} is inlined into kernel/, not installed`);
    assert.ok(pkg.devDependencies?.[name],`${name} stays installable to build the bundle`);
  }
  for(const name of ['typescript','sqlite-vec','iconv-lite','@napi-rs/keyring','@vscode/ripgrep','node-notifier'])assert.ok(pkg.dependencies?.[name],`${name} is left outside on purpose, so it is installed`);
});

test('the package ships the bundled kernel and not the loose vendored files',()=>{
  const pkg=JSON.parse(readFileSync(join(CLI,'package.json'),'utf8'));
  assert.ok(pkg.files.includes('kernel/'));assert.ok(pkg.files.includes('dist/'));
  assert.ok(!pkg.files.includes('vendor/'),'vendor/ is the source of the bundle, not part of the package');
});

test('what the bundle carries is still available to build it (devDependencies)',()=>{
  const pkg=JSON.parse(readFileSync(join(CLI,'package.json'),'utf8'));
  for(const name of ['ink','react','string-width','diff'])assert.ok(pkg.devDependencies?.[name]||pkg.dependencies?.[name],`${name} must stay installable for the build`);
});

/* documents (owner 02/10): the libraries built into vendor/node_modules (scripts/pack-documents.mjs) are found there by the
   kernel, so installing them again would bring back ~60 MB and ~2,000 files; they stay as build dependencies */
test('the document libraries travel built inside the package, not as installed dependencies',async()=>{
  const {DOCUMENT_LIBRARIES}=await import('../../scripts/pack-documents.mjs');
  const pkg=JSON.parse(readFileSync(join(CLI,'package.json'),'utf8'));
  const installed=DOCUMENT_LIBRARIES.filter((name:string)=>pkg.dependencies?.[name]);
  assert.deepEqual(installed,[],`installed although built into vendor/node_modules: ${installed.join(', ')}`);
  for(const name of DOCUMENT_LIBRARIES)assert.ok(pkg.devDependencies?.[name],`${name} stays a build dependency`);
});
