import {existsSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

/* `bundled`: this is the esbuild-bundled CLI (build-flags.d.ts), which ships the bundled kernel in kernel/ beside vendor/; the sources never prefer it */
type RepoRootDeps={exists?:(p:string)=>boolean;execPath?:string;moduleUrl?:string;env?:NodeJS.ProcessEnv;bundled?:boolean};

function isTalosRuntimeRoot(root:string,exists:(p:string)=>boolean){
  return exists(join(root,'harness-ui','src','session-registry.mjs'));
}

function firstRuntimeRoot(candidates:readonly string[],exists:(p:string)=>boolean):string|null{
  for(const candidate of candidates){
    const root=resolve(candidate);
    if(isTalosRuntimeRoot(root,exists))return root;
  }
  return null;
}

function findAncestorRuntimeRoot(start:string,exists:(p:string)=>boolean):string|null{
  let current=resolve(start);
  for(let i=0;i<16;i++){
    if(isTalosRuntimeRoot(current,exists))return current;
    const parent=dirname(current);
    if(parent===current)break;
    current=parent;
  }
  return null;
}

function moduleDirectory(moduleUrl:string):string|null{
  try{return dirname(fileURLToPath(moduleUrl));}
  catch{return null;}
}

/* P-F (owner 08/10/2026): the package ships the BUNDLED kernel in kernel/ (scripts/bundle-kernel.mjs: the vendor/ layout, a handful of files instead of
   hundreds, 217 -> 129 ms to load). The bundled CLI looks there first and falls back to the loose vendored files if the bundle is missing; the sources
   (unit tests, a checkout) read vendor/, the byte-for-byte copy of the kernel. */
function installedAppCandidates(appRoot:string,bundled:boolean):string[]{
  return bundled?[resolve(appRoot,'kernel'),resolve(appRoot,'vendor'),resolve(appRoot)]:[resolve(appRoot,'vendor'),resolve(appRoot)];
}

export function findTalosRepoRoot(start:string=process.cwd(),deps:RepoRootDeps={}){
  const exists=deps.exists??existsSync;
  const env=deps.env??process.env;
  const kernelBundle=deps.bundled??typeof TALOS_BUNDLED!=='undefined';

  // The running CLI module is the strongest anchor. In the packaged tree this file is
  // app/dist/runtime/repo.js, so ../.. is app and app/vendor is the shipped backend.
  // In a source/build checkout the ancestor walk from the module finds the repository
  // without consulting whatever project directory the user happens to be in.
  // Startup stage (01/10): the CLI now ships as one bundle, app/dist/main.js, ONE level under app; the sources and the
  // older build are two (src/runtime/repo.ts, dist/runtime/repo.js). Both depths are tried, the nearer first.
  const moduleDir=moduleDirectory(deps.moduleUrl??import.meta.url);
  if(moduleDir){
    for(const appRoot of [resolve(moduleDir,'..'),resolve(moduleDir,'..','..')]){
      const installed=firstRuntimeRoot(installedAppCandidates(appRoot,kernelBundle),exists);
      if(installed)return installed;
    }
    const source=findAncestorRuntimeRoot(moduleDir,exists);
    if(source)return source;
  }

  // The Windows launcher already sets this to the staged/installed root. It is an
  // internal launch contract, not a variable users must configure.
  const launcherRoot=env.TALOS_CLI_ROOT?.trim();
  if(launcherRoot){
    const installed=firstRuntimeRoot(installedAppCandidates(resolve(launcherRoot,'app'),kernelBundle),exists);
    if(installed)return installed;
  }

  // Compatibility with the bundled Node layout: <root>/runtime/node.exe beside <root>/app.
  const app=resolve(dirname(deps.execPath??process.execPath),'..','app');
  const bundled=firstRuntimeRoot(installedAppCandidates(app,kernelBundle),exists);
  if(bundled)return bundled;

  // Advanced developer override. A bad explicit override is an error; it never falls
  // through to an unrelated working-directory runtime.
  const configured=env.TALOS_CLI_RUNTIME_ROOT?.trim();
  if(configured){
    const root=resolve(configured);
    if(isTalosRuntimeRoot(root,exists))return root;
    throw new Error('TALOS_RUNTIME_ROOT_INVALID');
  }

  // Last-resort source/developer compatibility only. Installed launches have already
  // resolved above, so an arbitrary CWD cannot shadow the shipped runtime.
  const cwd=findAncestorRuntimeRoot(start,exists);
  if(cwd)return cwd;
  throw new Error('TALOS_RUNTIME_NOT_FOUND');
}

/* P18 phase 3 (owner 2026-09-26: ripgrep inside the npm package, no network): the kernel's `cerca` runs ripgrep from
   TALOS_RG_PATH. `@vscode/ripgrep` ships the binary for this platform as an optional dependency of the package (no
   install script, no download); a path already set, or a package without it, is left alone and `cerca` keeps its JS walk. */
let bundledRipgrep:Promise<void>|null=null;
export function provideBundledRipgrep(env:NodeJS.ProcessEnv=process.env):Promise<void>{
  if(env.TALOS_RG_PATH)return Promise.resolve();
  return bundledRipgrep??=import('@vscode/ripgrep').then((m:any)=>{if(typeof m?.rgPath==='string'&&existsSync(m.rgPath))env.TALOS_RG_PATH=m.rgPath;},()=>{});
}
export async function importTalosModule(repoRoot:string,relativeFromHarnessSrc:string){
  await provideBundledRipgrep();
  const file=join(repoRoot,'harness-ui','src',relativeFromHarnessSrc);
  return import(pathToFileURL(file).href);
}
