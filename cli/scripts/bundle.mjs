/*
 * Startup stage (owner 01/10, phase 1 «pacchetto snello»; registro 12): the CLI ships as an esbuild bundle instead of the
 * ~250 files tsc wrote. Measured on 01/10: 1,188 modules loaded before the composer (428 of them es-toolkit, pulled in by
 * Ink); the bundle of the same build opened the composer in 686 ms instead of 923 (5 alternated warm launches).
 * Same shape as Gemini CLI's esbuild.config.js (ESM, platform node, code splitting, a `require` banner, natives external)
 * and clanka PR #192 (19/09/2026: bundled CLI 0.54 -> 0.22 s, native/WASM/MCP left out and loaded on use).
 *
 *   - Entries: src/main.ts -> dist/main.js (the bin), and the Windows notification worker, which the CLI starts BY PATH
 *     next to its own module (tui/windows-notifications.ts). Every output sits in dist/ itself: the CLI finds its package,
 *     its vendor and that worker from its own location (runtime/package-root.ts, runtime/repo.ts).
 *   - The kernel stays outside: the CLI imports it by path from vendor/ at run time (runtime/repo.ts), and the kernel
 *     resolves its own packages (ai, zod, MCP) from node_modules.
 *   - External: native modules, the document libraries and the Windows sandbox, loaded only when used.
 *   - NODE_ENV is fixed to production: React, react-reconciler and scheduler keep only their production builds (the leak
 *     of React 19's Performance Tracks, tui/react-runtime.ts). TALOS_BUNDLED marks the code paths that differ in a bundle.
 *   - `ink/build/instances.js` is not in Ink's exports; the row writer imports it so the bundle keeps ONE Ink (the
 *     plugin below resolves it to the file). The sources resolve it from node_modules at run time instead.
 */
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import * as esbuild from 'esbuild';
import {inlinedPackageLicences,writeLicenceFile} from './licences.mjs';

const here=dirname(fileURLToPath(import.meta.url));
export const CLI_ROOT=resolve(here,'..');

export const EXTERNAL=Object.freeze([
  /* native or a native binary */
  'node-pty','@napi-rs/keyring','sqlite-vec','@vscode/ripgrep','node-notifier',
  /* the Windows sandbox SDK: started after the first frame (R3 Q-R3-13) and on use */
  '@microsoft/mxc-sdk',
  /* document tools, loaded when a document is made */
  'docx','pdf-lib','pdfmake','pptxgenjs','xlsx','jszip','iconv-lite',
  /* the language of a message and the text of a notification, loaded by the kernel on first use (scripts/pack-documents.mjs) */
  'eld','markdown-it',
  /* the TypeScript compiler, used by a tool on demand */
  'typescript',
  /* Ink imports it only under DEV=true, when it is installed */
  'react-devtools-core',
  /* 03/11 (0.7.0): the kernel's image resizer for view_image, a native binary and OPTIONAL. guarda-immagine-ospite.mjs:50-55 imports
     it on use and, when it is missing, falls back to the attachment cap; the package does not install it (pack-documents.mjs:73).
     Bundled, esbuild stops on its .node file and `npm run build` fails. Hermes does the same with Pillow (agent/image_routing.py:
     442-450, `except ImportError: … return None`); esbuild docs, «external»: the import is preserved and resolved at run time. */
  '@napi-rs/canvas',
]);

/* 0.6.8 (second review of 0.6.8, finding 6): main.ts's first import (security/exe-search-defence.ts) ran AFTER the ~20 chunks
   dist/main.js imports, since ESM evaluates imports before the body. The defence rides in the banner of EVERY chunk, so whichever
   chunk is evaluated first sets it before any code of TALOS runs: Windows must never take a program from the working folder. */
/* 0.6.9 (stress test of 0.6.8, F-C-001-bis, S2): through `globalThis`, never the bare name. A chunk that declares its own top-level
   `function process(…)` (zod v4's, in the MCP client chunk) shadows the global for the whole module, the declaration being hoisted
   above the banner: `process.env` was undefined there, the chunk never loaded, and `talos mcp test` failed for every server. */
const EXE_SEARCH_DEFENCE_BANNER="if(!globalThis.process.env.NoDefaultCurrentDirectoryInExePath)globalThis.process.env.NoDefaultCurrentDirectoryInExePath='1';";
const REQUIRE_BANNER="import{createRequire as __talosCreateRequire}from'node:module';const require=__talosCreateRequire(import.meta.url);"+EXE_SEARCH_DEFENCE_BANNER;

/** Resolves Ink's private instance registry to its file, past Ink's package exports, so it is bundled with Ink. */
function inkInstancesPlugin(cliRoot){
  return{name:'talos-ink-instances',setup(build){
    /* esbuild runs the filter as a Go regular expression: no `u` flag */
    build.onResolve({filter:/^ink\/build\/instances\.js$/},()=>{
      const inkEntry=createRequire(join(cliRoot,'package.json')).resolve('ink');
      return{path:join(dirname(inkEntry),'instances.js')};
    });
  }};
}

export async function buildBundle({cliRoot=CLI_ROOT,outdir=join(cliRoot,'dist')}={}){
  const result=await esbuild.build({
    absWorkingDir:cliRoot,
    entryPoints:{main:'src/main.ts','windows-notification-worker':'src/tui/windows-notification-worker.ts','mxc-support-worker':'src/security/mxc-support-worker.ts'},
    outdir,
    bundle:true,platform:'node',format:'esm',target:'node24',
    splitting:true,chunkNames:'chunk-[hash]',
    external:[...EXTERNAL],
    define:{'process.env.NODE_ENV':'"production"',TALOS_BUNDLED:'true'},
    banner:{js:REQUIRE_BANNER},
    minifySyntax:true,
    legalComments:'eof',
    metafile:true,
    logLevel:'warning',
    plugins:[inkInstancesPlugin(cliRoot)],
  });
  /* P-F (08/10): the packages inlined here are not installed beside the bundle, so their licences travel with it (scripts/licences.mjs) */
  await writeLicenceFile({title:'Third-party packages inlined into the TALOS CLI bundle',rows:await inlinedPackageLicences({inputs:Object.keys(result.metafile.inputs),absWorkingDir:cliRoot}),outdir});
  return result.metafile;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const meta=await buildBundle();
  const outputs=Object.keys(meta.outputs).filter(file=>file.endsWith('.js'));
  const bytes=outputs.reduce((sum,file)=>sum+meta.outputs[file].bytes,0);
  const version=JSON.parse(await readFile(join(CLI_ROOT,'package.json'),'utf8')).version;
  process.stdout.write(`talos-code ${version}: ${outputs.length} bundle files, ${(bytes/1024/1024).toFixed(1)} MB\n`);
}
