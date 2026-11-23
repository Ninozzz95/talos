/*
 * R7 (2026-09-25): `tsc` never removes what it no longer emits, so `cli/dist` still held 148 files of removed code — the
 * old gateway, Hermes's `tui2` bundle with its LICENSE, the `hermes-ink` fork — and `npm publish --dry-run` listed them in
 * talos-code 0.1.0. `prepack` now starts from an empty `dist/`, then builds.
 *
 * Guard (never delete blindly): the target is always `<cli>/dist`, and nothing is removed when git tracks any file under it:
 * `dist/` is build output, ignored by `.gitignore`; a tracked file there means someone put something that is not.
 */
import {execFileSync} from 'node:child_process';
import {rm,stat} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const here=dirname(fileURLToPath(import.meta.url));
function gitTracked(cliRoot){
  try{return execFileSync('git',['ls-files','--','dist'],{cwd:cliRoot,encoding:'utf8'}).split(/\r?\n/u).filter(Boolean);}
  catch{throw Object.assign(new Error('DIST_TRACKING_UNKNOWN: git could not say which files under dist/ are tracked'),{code:'DIST_TRACKING_UNKNOWN'});}
}
export async function cleanDist({cliRoot=resolve(here,'..'),tracked=gitTracked}={}){
  const target=join(resolve(cliRoot),'dist');
  const exists=await stat(target).then(s=>s.isDirectory(),()=>false);
  if(!exists)return{target,removed:false};
  const kept=tracked(resolve(cliRoot));
  if(kept.length)throw Object.assign(new Error(`DIST_HAS_TRACKED_FILES: ${kept.slice(0,5).join(', ')}`),{code:'DIST_HAS_TRACKED_FILES'});
  await rm(target,{recursive:true,force:true});
  return{target,removed:true};
}
if(import.meta.url===pathToFileURL(process.argv[1]??'').href){
  const result=await cleanDist();
  process.stdout.write(`${result.removed?'removed':'nothing to remove at'} ${result.target}\n`);
}
