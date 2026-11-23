import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {CLI_VERSION} from '../version.ts';

/*
 * Installation, platform packages (owner 02/10, «Stesso nome, come Codex», «Solo i 2 Windows»; registro 12). The Windows
 * sandbox and node-pty travel in one optional package per Windows architecture (scripts/pack-platforms.mjs), which the
 * main package installs by alias: `talos-code-win32-x64` → `talos-code@<ver>-win32-x64`. A module from there is looked up
 * from the package folder (Codex's launcher does `require.resolve('<alias>/package.json')`); in a checkout the build
 * dependency answers through `fallback`. npm may skip optional dependencies (`--omit=optional`, a failed download), and
 * then the error says which package is missing and how to bring it back, as Codex and Claude Code do.
 */
const PLATFORM_PACKAGES:Readonly<Record<string,string>>=Object.freeze({'win32-x64':'talos-code-win32-x64','win32-arm64':'talos-code-win32-arm64'});

export function platformPackageOf(platform:NodeJS.Platform|string=process.platform,arch:string=process.arch):string|null{
  return PLATFORM_PACKAGES[`${platform}-${arch}`]??null;
}

type Options={packageRoot:string|null;fallback:()=>Promise<unknown>;platform?:string;arch?:string;version?:string};

/* the module's entry inside the platform package: its `exports['.']` for import, else `main` */
function entryOf(moduleDir:string):string{
  const pkg=JSON.parse(readFileSync(join(moduleDir,'package.json'),'utf8'));
  const dot=typeof pkg.exports==='string'?pkg.exports:pkg.exports?.['.'];
  const entry=typeof dot==='string'?dot:dot?.import??dot?.default??pkg.main??'index.js';
  return join(moduleDir,entry);
}

export async function importFromPlatformPackage<T=unknown>(spec:string,options:Options):Promise<T>{
  const name=platformPackageOf(options.platform??process.platform,options.arch??process.arch);
  if(name===null)return await options.fallback() as T;
  let platformDir:string|null=null;
  if(options.packageRoot){
    try{platformDir=dirname(createRequire(join(options.packageRoot,'package.json')).resolve(`${name}/package.json`));}catch{/* not installed: a checkout, or npm skipped it */}
  }
  if(platformDir!==null)return await import(pathToFileURL(entryOf(join(platformDir,'vendor','node_modules',...spec.split('/')))).href) as T;
  try{return await options.fallback() as T;}
  catch(cause){
    const version=options.version??CLI_VERSION;
    throw Object.assign(new Error(`${spec} comes with the optional package ${name}, which npm did not install (for example with --omit=optional). Reinstall: npm install -g talos-code@${version}`),{code:'PLATFORM_PACKAGE_MISSING',cause});
  }
}
