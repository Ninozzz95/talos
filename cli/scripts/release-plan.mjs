/*
 * The release pipeline's decisions, out of the workflow so they are tested (owner 09/10/2026: «Pipeline sul tag, come
 * Codex»; «Dal pubblico, col bollino»). `.github/workflows/cli-release.yml` calls it:
 *   node cli/scripts/release-plan.mjs notes <version> <CHANGELOG.md> <out.md>   the release notes: the version's CHANGELOG section
 *   node cli/scripts/release-plan.mjs publish <version> <folder of .tgz>        npm publish, platforms first, main last
 *
 * Publishing order and tags follow Codex (rust-release.yml publish-npm, read 09/10/2026): every platform package is a
 * version of the same name (`talos-code@<ver>-win32-x64`) the main package aliases, so each goes first under its own
 * dist-tag (`latest` must not move to it) and the main package last, when everything it names exists (agnostic-ai #942:
 * partial publication); serially, because npm answers 409 to concurrent updates of one packument; a version already on
 * the registry is skipped, so a rerun after a half-failed publish finishes the job. A prerelease (`0.5.1-beta.1`) goes to
 * `next` and its platforms to `next-win32-x64`, so `latest` and the stable platform tags never point at a beta.
 * Credentials: none here. On GitHub Actions npm signs in by OIDC (trusted publishing, npm >= 11.5.1,
 * docs.npmjs.com/trusted-publishers) and, from a public repository, attaches provenance; `--provenance` makes a publish
 * that could not attach it fail instead of going out without it.
 */
import {execFileSync} from 'node:child_process';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {PACKAGE_NAME,PLATFORMS} from './pack-platforms.mjs';

const VERSION=/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;
export const MIN_NPM='11.5.1';

export function isPrerelease(version){return version.includes('-');}

/** The CHANGELOG section of one version (`## talos-cli-v<version>` up to the next `## `), without its heading. */
export function releaseNotes(changelog,version){
  if(!VERSION.test(version))throw new Error(`invalid CLI version: ${version}`);
  const lines=changelog.split(/\r?\n/u);
  const heading=`## talos-cli-v${version}`;
  const start=lines.findIndex(line=>line===heading||line.startsWith(`${heading} `));
  if(start<0)throw new Error(`CHANGELOG.md has no section "${heading}"`);
  const end=lines.findIndex((line,index)=>index>start&&line.startsWith('## '));
  const body=lines.slice(start+1,end<0?undefined:end).join('\n').trim();
  if(!body)throw new Error(`the CHANGELOG.md section "${heading}" is empty`);
  return`${body}\n`;
}

/** What `npm publish` runs, in order: each platform under its own tag, then the main package. */
export function publishPlan(version){
  if(!VERSION.test(version))throw new Error(`invalid CLI version: ${version}`);
  const prefix=isPrerelease(version)?'next-':'';
  const platforms=Object.keys(PLATFORMS).sort().map(platform=>({file:`${PACKAGE_NAME}-${version}-${platform}.tgz`,tag:`${prefix}${platform}`}));
  return[...platforms,{file:`${PACKAGE_NAME}-${version}.tgz`,tag:isPrerelease(version)?'next':'latest'}];
}

function atLeast(actual,minimum){
  const a=actual.trim().split(/[.-]/u).slice(0,3).map(Number),b=minimum.split('.').map(Number);
  for(let i=0;i<3;i+=1){if((a[i]??0)!==b[i])return(a[i]??0)>b[i];}
  return true;
}
const ALREADY=/previously published|cannot publish over|version already exists/iu;

/** Runs the plan. `npm(args)` returns `{status, output}`; injected by the tests. */
export function publishAll({version,folder,npm,provenance=true}){
  const npmVersion=npm(['--version']);
  if(npmVersion.status!==0||!atLeast(npmVersion.output,MIN_NPM))throw new Error(`npm ${MIN_NPM} or newer is required for trusted publishing (found ${npmVersion.output.trim()||'none'})`);
  const plan=publishPlan(version);
  // Always an absolute path, as Codex passes "${GITHUB_WORKSPACE}/${tarball}": npm reads a spec as a file only when it begins
  // with «.», «~/», «/» or a drive letter (npm-package-arg isFileSpec), and takes «release-files/x.tgz» for the GitHub repository
  // release-files/x.tgz first. That stopped the first real publish at `git ls-remote ssh://git@github.com/release-files/...`.
  const tarball=step=>resolve(folder,step.file);
  for(const step of plan)if(!existsSync(tarball(step)))throw new Error(`missing npm tarball: ${step.file}`);
  const done=[];
  for(const step of plan){
    const result=npm(['publish',tarball(step),'--tag',step.tag,...(provenance?['--provenance']:[])]);
    if(result.status===0){done.push({...step,outcome:'published'});continue;}
    if(ALREADY.test(result.output)){done.push({...step,outcome:'already-published'});continue;}
    throw new Error(`npm publish ${step.file} --tag ${step.tag} failed:\n${result.output}`);
  }
  return done;
}

function realNpm(args){
  try{return{status:0,output:execFileSync(process.platform==='win32'?'npm.cmd':'npm',args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],shell:process.platform==='win32'})};}
  catch(error){return{status:error.status??1,output:`${error.stdout??''}${error.stderr??''}`};}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const [command,version,input,out]=process.argv.slice(2);
  if(command==='notes'&&version&&input&&out){writeFileSync(out,releaseNotes(readFileSync(input,'utf8'),version));}
  else if(command==='publish'&&version&&input){
    for(const step of publishAll({version,folder:input,npm:realNpm,/* no provenance from a private repository: cli-release.yml */provenance:process.env.TALOS_NPM_PROVENANCE!=='false'}))process.stdout.write(`${step.outcome}: ${step.file} (tag ${step.tag})\n`);
  }else{process.stderr.write('usage: release-plan.mjs notes <version> <CHANGELOG.md> <out.md> | publish <version> <folder>\n');process.exitCode=2;}
}
