import {fileURLToPath} from 'node:url';
import {compareReleaseVersions} from './check.ts';
import {findPackageRoot} from '../runtime/package-root.ts';

/*
 * R7 (owner, 2026-09-25): an install made with `npm i -g talos-code` updates with npm. `talos update` asks the npm registry
 * which version is current and says the command to run; it downloads nothing and changes nothing. The Windows installer
 * keeps its own path (GitHub release manifest, verified download).
 *
 * How an npm install is recognised: npm puts the package at `<prefix>/node_modules/talos-code` (global) or
 * `<project>/node_modules/talos-code`, so the folder above the package is `node_modules`. The Windows installer puts it in
 * its own `app` folder, and a checkout runs from `cli/`.
 */
export const NPM_PACKAGE='talos-code';
export const NPM_DIST_TAGS_URL=`https://registry.npmjs.org/-/package/${NPM_PACKAGE}/dist-tags`;
const TAG={stable:'latest',preview:'next'} as const;

/** The package folder of this build, from the bundle (`dist/main.js`) or the sources (`src/update/npm.ts`): the nearest
    talos-code package.json up (runtime/package-root.ts); two levels down when there is none, as before the bundle. */
export function packageRootOf(moduleUrl:string=import.meta.url):string{return findPackageRoot(moduleUrl)??fileURLToPath(new URL('../../',moduleUrl));}
export function installedWithNpm(packageRoot:string=packageRootOf()):boolean{
  /* npm puts the package at `<prefix>/node_modules/talos-code`; the layouts arrive in both shapes (POSIX and Windows
     drive paths) and the check must parse both on every platform — on POSIX basename() cannot read a backslash path. */
  const parts=packageRoot.replace(/[\\/]+$/u,'').split(/[\\/]+/u);
  return parts[parts.length-2]?.toLowerCase()==='node_modules'&&parts[parts.length-1]===NPM_PACKAGE;
}
export function npmUpdateCommand(channel:'stable'|'preview'):string{return `npm i -g ${NPM_PACKAGE}@${TAG[channel]}`;}

export type NpmUpdateCheck={source:'npm';available:boolean;version:string;currentVersion:string;channel:'stable'|'preview';command:string};
export async function checkNpmRegistry({currentVersion,channel,fetchFn=fetch,url=NPM_DIST_TAGS_URL,timeoutMs=15_000}:{currentVersion:string;channel:'stable'|'preview';fetchFn?:typeof fetch;url?:string;timeoutMs?:number}):Promise<NpmUpdateCheck>{
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);
  let response:Response;
  try{response=await fetchFn(url,{headers:{Accept:'application/json'},signal:controller.signal});}
  catch(error){if(controller.signal.aborted)throw Object.assign(new Error('UPDATE_TIMEOUT'),{code:'UPDATE_TIMEOUT'});throw error;}
  finally{clearTimeout(timer);}
  if(!response.ok)throw Object.assign(new Error(`UPDATE_HTTP_${response.status}`),{code:'UPDATE_HTTP_ERROR',status:response.status});
  let tags:unknown;try{tags=await response.json();}catch{throw Object.assign(new Error('UPDATE_RELEASE_METADATA_INVALID'),{code:'UPDATE_RELEASE_METADATA_INVALID'});}
  const version=tags&&typeof tags==='object'?(tags as Record<string,unknown>)[TAG[channel]]:undefined;
  if(typeof version!=='string')throw Object.assign(new Error('UPDATE_RELEASE_NOT_FOUND'),{code:'UPDATE_RELEASE_NOT_FOUND'});
  return{source:'npm',available:compareReleaseVersions(version,currentVersion)>0,version,currentVersion,channel,command:npmUpdateCommand(channel)};
}
