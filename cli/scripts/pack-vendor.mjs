/*
 * R6 (owner decisions 2026-09-25: the CLI package works on its own; the kernel is COPIED at build, generated, never
 * committed): copies the kernel the CLI loads — `harness-ui/src` and `context-engine/src` with their `package.json` — into
 * `cli/vendor/`, the layout `runtime/repo.ts` already looks for next to `dist/` (the Windows installer's `app/vendor/`,
 * packaging/runtime-files.json). Nothing of the desktop or mobile lane is edited: they are read and copied byte for byte.
 * `vendor/manifest.json` records the source commit and a SHA-256 per file, so a package says exactly which kernel it
 * carries, and a test can compare the copy with the monorepo. `node_modules` is never copied: npm installs the kernel's
 * dependencies as the package's own.
 */
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {cp,mkdir,readFile,readdir,rm,stat,writeFile} from 'node:fs/promises';
import {dirname,join,relative,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const here=dirname(fileURLToPath(import.meta.url));
export const VENDOR_TREES=Object.freeze([
  {source:'harness-ui/src',target:'harness-ui/src'},
  {source:'harness-ui/package.json',target:'harness-ui/package.json'},
  /* talos_help: the pages of the site this version ships (kernel/aiuto-talos.mjs); read at the first call, never at the start */
  {source:'harness-ui/aiuto/index.json',target:'harness-ui/aiuto/index.json'},
  {source:'context-engine/src',target:'context-engine/src'},
  {source:'context-engine/package.json',target:'context-engine/package.json'},
]);

/* R7 (2026-09-25): the kernel's own tests are not runtime; the first publish attempt listed talosHarness.test.mjs (451 kB). */
const TEST_FILE=/\.test\.m?[jt]s$/u;
async function files(dir){const out=[];for(const entry of await readdir(dir,{withFileTypes:true})){if(entry.name==='node_modules'||(entry.isFile()&&TEST_FILE.test(entry.name)))continue;const full=join(dir,entry.name);if(entry.isDirectory())out.push(...await files(full));else if(entry.isFile())out.push(full);}return out;}
const sha256=async(path)=>createHash('sha256').update(await readFile(path)).digest('hex');

export async function packVendor({repoRoot=resolve(here,'..','..'),out=resolve(here,'..','vendor')}={}){
  repoRoot=resolve(repoRoot);out=resolve(out);
  if(relative(resolve(repoRoot,'cli'),out).startsWith('..'))throw Object.assign(new Error('VENDOR_OUT_OUTSIDE_CLI'),{code:'VENDOR_OUT_OUTSIDE_CLI'});
  /* Never delete what this script did not make: an existing folder is emptied only when it is empty or holds this
     script's own manifest (2026-09-25: cli/vendor once held Hermes's Ink fork, B2, and the first draft emptied it blindly). */
  const existing=await readdir(out).catch(()=>null);
  if(existing&&existing.length){
    const own=await readFile(join(out,'manifest.json'),'utf8').then(text=>JSON.parse(text)?.schema==='talos.cli.vendor.v1').catch(()=>false);
    if(!own)throw Object.assign(new Error(`VENDOR_OUT_NOT_OURS:${out}`),{code:'VENDOR_OUT_NOT_OURS'});
    await rm(out,{recursive:true,force:true});
  }
  await mkdir(out,{recursive:true});
  const entries={};
  for(const tree of VENDOR_TREES){
    const source=resolve(repoRoot,tree.source),target=resolve(out,tree.target);
    const info=await stat(source).catch(()=>null);if(!info)throw Object.assign(new Error(`VENDOR_SOURCE_MISSING:${tree.source}`),{code:'VENDOR_SOURCE_MISSING'});
    if(info.isDirectory()){
      for(const file of await files(source)){const rel=relative(source,file).replaceAll('\\','/');const dest=join(target,...rel.split('/'));await mkdir(dirname(dest),{recursive:true});await cp(file,dest);entries[`${tree.target}/${rel}`]=await sha256(dest);}
    }else{await mkdir(dirname(target),{recursive:true});await cp(source,target);entries[tree.target]=await sha256(target);}
  }
  /* The AGPL licence travels with the package: the repository's LICENSE, copied beside package.json (gitignored). A
     different LICENSE already there is someone else's: refused, never overwritten. */
  const licence=await readFile(resolve(repoRoot,'LICENSE'));const licenceTarget=resolve(out,'..','LICENSE');
  const present=await readFile(licenceTarget).catch(()=>null);
  if(present&&!present.equals(licence))throw Object.assign(new Error(`VENDOR_LICENSE_DIFFERS:${licenceTarget}`),{code:'VENDOR_LICENSE_DIFFERS'});
  if(!present)await writeFile(licenceTarget,licence);
  let commit=null;try{commit=execFileSync('git',['rev-parse','HEAD'],{cwd:repoRoot,encoding:'utf8'}).trim();}catch{commit=null;}
  /* review 14 R14-4 of 0.6.13 (0.6.14): HEAD alone named a commit whose files a build made BEFORE that commit did not carry; whether the
     copied trees had uncommitted changes (tracked or new) is said beside it, null when git cannot tell */
  let dirty=null;try{dirty=execFileSync('git',['status','--porcelain','--',...VENDOR_TREES.map(tree=>tree.source)],{cwd:repoRoot,encoding:'utf8'}).trim().length>0;}catch{dirty=null;}
  const manifest={schema:'talos.cli.vendor.v1',sourceCommit:commit,sourceDirty:dirty,files:Object.keys(entries).length,sha256:Object.fromEntries(Object.entries(entries).sort(([a],[b])=>a.localeCompare(b)))};
  await writeFile(join(out,'manifest.json'),JSON.stringify(manifest,null,1)+'\n');
  return manifest;
}

if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
  packVendor().then(m=>console.log(`vendor: ${m.files} kernel files copied from ${m.sourceCommit?.slice(0,9)??'an unknown commit'}${m.sourceDirty?' with uncommitted changes':''}`)).catch(error=>{console.error(error?.code??error?.message??error);process.exitCode=1;});
}
