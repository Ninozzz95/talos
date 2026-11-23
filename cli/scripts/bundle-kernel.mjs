/*
 * P-F (owner 08/10/2026, «Sì: bundle kernel + librerie, vendor solo sorgente di build»; registro 12 Voce 24). The CLI loaded the kernel as
 * ~257 loose files of vendor/ plus the 15 npm packages they import (zod 828 files, ai 640, the AI-SDK providers…): measured on a quiet machine,
 * the entries `session-registry`, `kernel/talosHarness` and `session-store` take 219 ms to load as files and 117 ms as an esbuild bundle
 * (-47%, scratchpad perf/kernel-load/ab.mjs, 9 alternated rounds after 2 priming); the V8 compile cache made the files WORSE (271 ms), as it
 * did on 01/10 and 02/10. This script turns the vendored kernel (a byte-for-byte copy, pack-vendor.mjs, R6) into the runtime the package
 * ships: `cli/kernel/`, the SAME layout as `vendor/` (harness-ui/src/<module>.mjs, context-engine/src/…), so `runtime/repo.ts` and every
 * `join(repoRoot, 'harness-ui', 'src', …)` of the CLI work unchanged, with a handful of files instead of hundreds. `vendor/` stays what R6
 * made it: the source, compared with the monorepo by a test; `kernel/manifest.json` says which vendored files a bundle was built from.
 *
 * Competitors read in cloned code (08/10/2026): Pi scripts/build-coding-agent-bundle.mjs (esbuild ESM, an allowlist of externals, a require
 * banner, one lazily loaded package), OpenCode packages/opencode/script/build.ts (Bun.build with splitting; the worker file embedded as an
 * extra entry), Codex (one binary). Docs: esbuild (Context7 /evanw/esbuild): with format esm `import.meta.url` is kept verbatim and becomes
 * the URL of the OUTPUT file at run time; `entryNames`/`chunkNames` choose where outputs go; `legalComments`. Practice of the last month:
 * clanka PR #192 (19/09/2026, bundled CLI 0.54 -> 0.22 s, natives/WASM/MCP left external and loaded on use), cliscope #12 (26/09/2026).
 *
 * What a bundle changes, and what this does about it (each one has a test):
 *   - `import.meta.url` is the URL of whichever output file holds the code (an entry or a shared chunk — esbuild decides), so a path built from
 *     it (`new URL('./process-output-worker.mjs', import.meta.url)`, `createRequire(import.meta.url)`, a migration read next to a worker)
 *     would move. Every vendored module's `import.meta.url` becomes `__talosSrc('<its original path under harness-ui/src>')`, the URL the
 *     file had in vendor/, found from the output file's own location (`…/harness-ui/src/`), so those paths mean exactly what they meant.
 *   - Files the kernel starts BY PATH (a Worker, a child) are built as entries at their original place; assets it reads next to them are copied.
 *   - Shared chunks live inside harness-ui/src/ (chunkNames), so every output file can find that folder.
 *   - Natives, the document libraries, the Windows sandbox and TypeScript stay external, as in the CLI bundle (bundle.mjs EXTERNAL). The MCP client is
 *     inlined: left external it dragged 95 zod files into every kernel load; the CLI bundles its own copy for the probe (mcp-facade.ts) and hands its
 *     subclasses to the kernel, so the two never meet.
 *   - Inlined npm packages keep their licences: kernel/THIRD_PARTY_LICENSES.txt lists each with its licence text.
 */
import {createHash} from 'node:crypto';
import {cp,mkdir,readFile,readdir,rm,stat,writeFile} from 'node:fs/promises';
import {dirname,join,relative,resolve,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import * as esbuild from 'esbuild';
import {EXTERNAL} from './bundle.mjs';
import {inlinedPackageLicences,writeLicenceFile} from './licences.mjs';

const here=dirname(fileURLToPath(import.meta.url));
export const CLI_ROOT=resolve(here,'..');
export const KERNEL_SCHEMA='talos.cli.kernel.v1';

/** Not inlined: what bundle.mjs leaves out of the CLI (natives, document libraries, the Windows sandbox, TypeScript). */
export const KERNEL_EXTERNAL=Object.freeze([...EXTERNAL]);

const SRC='harness-ui/src';
const TEST_FILE=/\.test\.m?[jt]s$/u;
const CODE_EXT=/\.(?:mjs|cjs|js)$/u;
const BANNER=[
  "import{createRequire as __talosCreateRequire}from'node:module';",
  "const require=__talosCreateRequire(import.meta.url);",
  /* the URL a vendored module had, from the location of the output file that holds its code: every output file sits under `<kernel>/harness-ui/src/`
     or `<kernel>/context-engine/src/` (a context-engine worker is built in its own place), and the original paths are relative to harness-ui/src */
  "const __talosSrc=r=>{const u=import.meta.url,i=Math.max(u.lastIndexOf('/harness-ui/src/'),u.lastIndexOf('/context-engine/src/'));return new URL(r,u.slice(0,i)+'/harness-ui/src/').href;};",
].join('');

async function walk(dir,keep=()=>true){
  const out=[];
  for(const entry of await readdir(dir,{withFileTypes:true})){
    if(entry.name==='node_modules')continue;
    const full=join(dir,entry.name);
    if(entry.isDirectory())out.push(...await walk(full,keep));
    else if(entry.isFile()&&keep(full))out.push(full);
  }
  return out;
}
const posixRel=(from,to)=>relative(from,to).split(sep).join('/');
const sha256=text=>createHash('sha256').update(text).digest('hex');

/**
 * The vendored modules the CLI names in its sources. The CLI writes them in several ways — `importTalosModule(r, 'notes-store.mjs')`, `join(src, 'kernel', 'talosHarness.mjs')`,
 * `join(contextRoot, 'node', 'sqlite-store.mjs')` (a context-engine module: `harness-ui/src/` is not the only root), `join(src, 'research/run.mjs')` — so a
 * file is named when its path below its `src/` folder, or just its file name, is a `.mjs` string literal anywhere in cli/src. (The first version of this looked only
 * under harness-ui/src and for whole paths: the context bridge's `engine.mjs` and `node/sqlite-store.mjs` were missed and the acceptance gate caught it, R5A-WINDOW.)
 * Over-including a module that merely shares a file name costs one more entry, never a missing one.
 */
export async function modulesNamedByTheCli({cliRoot=CLI_ROOT,vendorRoot=join(cliRoot,'vendor')}={}){
  const literals=new Set();
  for(const file of await walk(join(cliRoot,'src'),f=>f.endsWith('.ts'))){
    const text=await readFile(file,'utf8');
    for(const match of text.matchAll(/['"`]((?:[\w.-]+\/)*[\w.-]+\.mjs)['"`]/gu)){literals.add(match[1]);literals.add(match[1].split('/').at(-1));}
  }
  const found=new Set();
  for(const treeSrc of [`${SRC}/`,'context-engine/src/']){
    const root=join(vendorRoot,...treeSrc.split('/').filter(Boolean));
    if(!(await stat(root).then(s=>s.isDirectory(),()=>false)))continue;
    for(const file of await walk(root,f=>f.endsWith('.mjs')&&!TEST_FILE.test(f))){
      const below=posixRel(root,file);
      if(literals.has(below)||literals.has(below.split('/').at(-1)))found.add(`${treeSrc}${below}`);
    }
  }
  return[...found].sort();
}

/**
 * What the kernel starts or reads BY PATH from its own location: `new URL('<relative>', import.meta.url)` in a vendored module. A code file there
 * is built as an entry at its place (a Worker, a sibling process); anything else that exists is an asset to copy beside it.
 */
/* 13/10/2026 (gate red on 09886331f, K9: 130 files; review of 0.6.3, S2): modules of the DESKTOP's own server, vendored with the
   kernel since r4 lot 3 and imported by nothing the CLI loads. `kernel-di-serie-desktop.mjs` names the desktop's kernel adapter by
   path, and that reference made the adapter an entry of the CLI's bundle: an unused file in the published package. What these
   files name is not followed. After the review of 0.6.3 (14/10/2026): by their path below the vendored root, not their file name —
   a kernel module of the same name elsewhere would have lost its Worker or asset from the bundle, silently (K11). */
const DESKTOP_SERVER_ONLY=new Set(['harness-ui/src/kernel-di-serie-desktop.mjs','harness-ui/src/kernel-di-serie-desktop.avvio.mjs']);
/* 18/11/2026 (0.6.16 on the core of desktop 0.2.3, bb6d3799a): the workflow program sandbox (`workflow/recinto.mjs`, its Worker
   `recinto-lavoratore.mjs` on quickjs-emscripten) is imported by nothing in harness-ui/src, context-engine/src or the desktop's
   server.mjs at bb6d3799a, only by its tests (through `workflow/esegui-programma.mjs`, itself imported by nobody). Followed, its
   `new URL` made the Worker an entry and `npm run build` stopped on «Could not resolve "quickjs-emscripten"». Not followed: the
   package stays without the sandbox, as 0.6.16 was before this core. When the kernel imports it, this line goes. */
const NOT_LOADED_BY_THE_KERNEL=new Set(['harness-ui/src/workflow/recinto.mjs']);
export async function pathReferencesOf({vendorRoot}){
  const entries=new Set(),assets=new Set();
  const roots=[join(vendorRoot,'harness-ui','src'),join(vendorRoot,'context-engine','src')];
  for(const root of roots){
    const stat0=await stat(root).catch(()=>null);if(!stat0)continue;
    for(const file of await walk(root,f=>CODE_EXT.test(f)&&!TEST_FILE.test(f))){
      if(DESKTOP_SERVER_ONLY.has(posixRel(vendorRoot,file))||NOT_LOADED_BY_THE_KERNEL.has(posixRel(vendorRoot,file)))continue;
      const text=await readFile(file,'utf8');
      for(const match of text.matchAll(/new URL\(\s*(['"])([^'"\n]+)\1\s*,\s*import\.meta\.url\s*\)/gu)){
        const relative_=match[2];if(relative_.endsWith('/'))continue;
        const target=resolve(dirname(file),relative_);
        if(!(await stat(target).then(s=>s.isFile(),()=>false)))continue;
        const rel=posixRel(vendorRoot,target);
        if(target===file)continue;
        (CODE_EXT.test(target)?entries:assets).add(rel);
      }
    }
  }
  return{entries:[...entries].sort(),assets:[...assets].sort()};
}

/** Always entries: the registry and the harness (root marker and runtime), and the two document modules the installed-package proof (scripts/prove-standalone.ts) imports by path. */
const ALWAYS=Object.freeze([`${SRC}/session-registry.mjs`,`${SRC}/kernel/talosHarness.mjs`]);
const ALWAYS_IF_PRESENT=Object.freeze([`${SRC}/document-generator.mjs`,`${SRC}/kernel/estrai-documento.mjs`]);

/** The entry points of the bundle: the always-entries, what the CLI names, and the files the kernel starts by path. */
export async function kernelEntries({cliRoot=CLI_ROOT,vendorRoot=join(cliRoot,'vendor')}={}){
  const named=await modulesNamedByTheCli({cliRoot,vendorRoot});
  const byPath=await pathReferencesOf({vendorRoot});
  const present=[];
  for(const entry of ALWAYS_IF_PRESENT)if(await stat(join(vendorRoot,...entry.split('/'))).then(s=>s.isFile(),()=>false))present.push(entry);
  const entries=new Set([...ALWAYS,...present,...named,...byPath.entries]);
  return{entries:[...entries].sort(),assets:byPath.assets,named,byPath:byPath.entries};
}

/** `import.meta.url` of a vendored module -> the URL it had in vendor/, found from the output file's own place (see BANNER). */
function importMetaPlugin(vendorRoot){
  const srcRoot=join(vendorRoot,'harness-ui','src');
  const inside=file=>file.startsWith(vendorRoot+sep)&&!file.split(sep).includes('node_modules');
  return{name:'talos-kernel-import-meta',setup(build){
    /* esbuild runs the filter as a Go regular expression: no `u` flag */
    build.onLoad({filter:/\.m?js$/},async args=>{
      if(!inside(args.path))return null;
      const text=await readFile(args.path,'utf8');
      if(!text.includes('import.meta.url'))return null;
      const original=posixRel(srcRoot,args.path);
      return{contents:text.replace(/\bimport\.meta\.url\b/gu,()=>`__talosSrc(${JSON.stringify(original)})`),loader:'js',resolveDir:dirname(args.path)};
    });
  }};
}

export async function buildKernel({cliRoot=CLI_ROOT,vendorRoot=join(cliRoot,'vendor'),outdir=join(cliRoot,'kernel'),minify=false}={}){
  cliRoot=resolve(cliRoot);vendorRoot=resolve(vendorRoot);outdir=resolve(outdir);
  const vendorManifest=await readFile(join(vendorRoot,'manifest.json'),'utf8').then(text=>JSON.parse(text),()=>null);
  if(vendorManifest?.schema!=='talos.cli.vendor.v1')throw Object.assign(new Error(`KERNEL_VENDOR_MISSING:${vendorRoot}`),{code:'KERNEL_VENDOR_MISSING'});
  /* never empty a folder this script did not make */
  const existing=await readdir(outdir).catch(()=>null);
  if(existing&&existing.length){
    const own=await readFile(join(outdir,'manifest.json'),'utf8').then(text=>JSON.parse(text)?.schema===KERNEL_SCHEMA,()=>false);
    if(!own)throw Object.assign(new Error(`KERNEL_OUT_NOT_OURS:${outdir}`),{code:'KERNEL_OUT_NOT_OURS'});
    await rm(outdir,{recursive:true,force:true});
  }
  await mkdir(outdir,{recursive:true});
  const {entries,assets}=await kernelEntries({cliRoot,vendorRoot});
  const entryPoints=Object.fromEntries(entries.map(entry=>[entry.replace(/\.m?js$/u,''),join(vendorRoot,...entry.split('/'))]));
  const result=await esbuild.build({
    absWorkingDir:cliRoot,
    entryPoints,
    outdir,outbase:vendorRoot,
    bundle:true,platform:'node',format:'esm',target:'node24',
    splitting:true,
    entryNames:'[dir]/[name]',chunkNames:`${SRC}/chunk-[hash]`,
    outExtension:{'.js':'.mjs'},
    external:[...KERNEL_EXTERNAL],
    banner:{js:BANNER},
    legalComments:'none',
    ...(minify?{minifyWhitespace:true,minifySyntax:true}:{}),
    metafile:true,
    logLevel:'warning',
    plugins:[importMetaPlugin(vendorRoot)],
  });
  /* assets next to the files that read them, at their original place */
  for(const asset of assets){await mkdir(dirname(join(outdir,asset)),{recursive:true});await cp(join(vendorRoot,asset),join(outdir,asset));}
  /* the package.json files (createRequire bases, versions) as vendor/ has them, and the document libraries where the kernel looks for them */
  for(const manifest of ['harness-ui/package.json','context-engine/package.json','harness-ui/aiuto/index.json']){
    if(await stat(join(vendorRoot,manifest)).then(s=>s.isFile(),()=>false)){await mkdir(dirname(join(outdir,manifest)),{recursive:true});await cp(join(vendorRoot,manifest),join(outdir,manifest));}
  }
  if(await stat(join(vendorRoot,'node_modules')).then(s=>s.isDirectory(),()=>false))await cp(join(vendorRoot,'node_modules'),join(outdir,'node_modules'),{recursive:true});
  const licences=await writeLicenceFile({title:'Third-party packages inlined into the TALOS kernel bundle',rows:await inlinedPackageLicences({inputs:Object.keys(result.metafile.inputs),absWorkingDir:cliRoot}),outdir});
  const outputs={};
  for(const out of Object.keys(result.metafile.outputs).sort()){
    const file=resolve(cliRoot,out);outputs[posixRel(outdir,file)]=sha256(await readFile(file));
  }
  const manifest={
    schema:KERNEL_SCHEMA,
    vendorSourceCommit:vendorManifest.sourceCommit??null,
    /* review 14 R14-4 of 0.6.13 (0.6.14): the kernel trees had uncommitted changes when they were copied */
    vendorSourceDirty:vendorManifest.sourceDirty??null,
    vendorManifestSha256:sha256(await readFile(join(vendorRoot,'manifest.json'))),
    vendorFiles:vendorManifest.files,
    esbuild:esbuild.version,
    entries,assets,
    external:[...KERNEL_EXTERNAL],
    inlinedPackages:licences,
    outputs,
  };
  await writeFile(join(outdir,'manifest.json'),JSON.stringify(manifest,null,1)+'\n');
  return{manifest,metafile:result.metafile,outdir};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const {manifest}=await buildKernel({minify:process.argv.includes('--minify')});
  const code=Object.keys(manifest.outputs).filter(file=>file.endsWith('.mjs'));
  process.stdout.write(`kernel: ${code.length} bundle files from ${manifest.vendorFiles} vendored files (commit ${manifest.vendorSourceCommit?.slice(0,9)??'unknown'}), ${manifest.inlinedPackages.length} npm packages inlined\n`);
}
