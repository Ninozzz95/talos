/*
 * Installation, platform packages (owner 02/10, registro 12): what gets published. Codex stages its packages at release
 * time (the main one gains `optionalDependencies` by alias, `npm:@openai/codex@<ver>-win32-x64`); doing it here keeps the
 * checkout's package.json free of versions that are not on the registry yet (npm would try to fetch them on every
 * `npm install`). Steps: build the CLI as `npm pack` would (prepack), copy exactly the files `npm pack` lists, add the
 * platform packages as exact optional dependencies, drop the build scripts (they must not run again, and they mean
 * nothing to whoever installs), pack that; then build and pack each platform package (scripts/pack-platforms.mjs).
 * No `tar`: Git's GNU tar on Windows reads `C:` in a path as a remote host.
 *
 * Publishing stays with the owner, in this order, so the main package never names a version that is not there yet
 * (agnostic-ai #942: partial publication): each platform first, under its own tag so `latest` does not move —
 *   npm publish talos-code-<ver>-win32-x64.tgz --tag win32-x64
 *   npm publish talos-code-<ver>-win32-arm64.tgz --tag win32-arm64
 * then the main package (`npm publish talos-code-<ver>.tgz`, with `--tag next` for a beta).
 */
import {execFileSync} from 'node:child_process';
import {copyFile,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {CLI_ROOT,PLATFORMS,packPlatform,platformDependencies} from './pack-platforms.mjs';

const npm=process.platform==='win32'?'npm.cmd':'npm';
function npmJson(cwd,args){
  const out=execFileSync(npm,args,{cwd,encoding:'utf8',shell:process.platform==='win32',maxBuffer:64*1024*1024,windowsHide:true});
  return JSON.parse(out.slice(out.indexOf('[')));
}
const pack=(cwd,destination)=>join(destination,npmJson(cwd,['pack','--pack-destination',destination,'--json'])[0].filename);

/* the published package.json: the platform packages as exact optional dependencies, no build scripts */
export function releaseManifest(pkg){
  const {scripts:_scripts,...kept}=pkg;
  return{...kept,optionalDependencies:{...(pkg.optionalDependencies??{}),...platformDependencies(pkg.version)}};
}

export async function stageRelease({cliRoot=CLI_ROOT,out}){
  await rm(out,{recursive:true,force:true});
  /* the build's own output goes to stderr: whoever calls this may read a report from stdout (prove-standalone, s36) */
  execFileSync(npm,['run','prepack'],{cwd:cliRoot,stdio:['ignore',2,2],shell:process.platform==='win32',windowsHide:true});
  const listed=npmJson(cliRoot,['pack','--dry-run','--json','--ignore-scripts'])[0].files.map(file=>file.path);
  const staged=join(out,'talos-code');
  for(const file of listed){await mkdir(dirname(join(staged,file)),{recursive:true});await copyFile(join(cliRoot,file),join(staged,file));}
  const pkg=JSON.parse(await readFile(join(staged,'package.json'),'utf8'));
  await writeFile(join(staged,'package.json'),`${JSON.stringify(releaseManifest(pkg),null,2)}\n`);
  const main=pack(staged,out);
  const platforms={};
  for(const platform of Object.keys(PLATFORMS)){
    const dir=await packPlatform({cliRoot,platform,out:join(out,'platforms'),version:pkg.version});
    platforms[platform]=pack(dir,out);
  }
  return{version:pkg.version,main,platforms};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const result=await stageRelease({out:resolve(process.argv[2]??join(CLI_ROOT,'release'))});
  process.stdout.write(`${JSON.stringify(result,null,2)}\n`);
}
