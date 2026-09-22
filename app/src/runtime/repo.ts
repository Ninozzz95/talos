import {existsSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

type RepoRootDeps={exists?:(p:string)=>boolean;execPath?:string;moduleUrl?:string;env?:NodeJS.ProcessEnv};

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

function installedAppCandidates(appRoot:string):string[]{
  return[resolve(appRoot,'vendor'),resolve(appRoot)];
}

export function findTalosRepoRoot(start:string=process.cwd(),deps:RepoRootDeps={}){
  const exists=deps.exists??existsSync;
  const env=deps.env??process.env;

  // The running CLI module is the strongest anchor. In the packaged tree this file is
  // app/dist/runtime/repo.js, so ../.. is app and app/vendor is the shipped backend.
  // In a source/build checkout the ancestor walk from the module finds the repository
  // without consulting whatever project directory the user happens to be in.
  const moduleDir=moduleDirectory(deps.moduleUrl??import.meta.url);
  if(moduleDir){
    const appRoot=resolve(moduleDir,'..','..');
    const installed=firstRuntimeRoot(installedAppCandidates(appRoot),exists);
    if(installed)return installed;
    const source=findAncestorRuntimeRoot(moduleDir,exists);
    if(source)return source;
  }

  // The Windows launcher already sets this to the staged/installed root. It is an
  // internal launch contract, not a variable users must configure.
  const launcherRoot=env.TALOS_CLI_ROOT?.trim();
  if(launcherRoot){
    const installed=firstRuntimeRoot(installedAppCandidates(resolve(launcherRoot,'app')),exists);
    if(installed)return installed;
  }

  // Compatibility with the bundled Node layout: <root>/runtime/node.exe beside <root>/app.
  const app=resolve(dirname(deps.execPath??process.execPath),'..','app');
  const bundled=firstRuntimeRoot(installedAppCandidates(app),exists);
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

export async function importTalosModule(repoRoot:string,relativeFromHarnessSrc:string){
  const file=join(repoRoot,'harness-ui','src',relativeFromHarnessSrc);
  return import(pathToFileURL(file).href);
}
