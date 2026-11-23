import {existsSync,readFileSync,realpathSync} from 'node:fs';
import {posix,win32} from 'node:path';
import {compareReleaseVersions} from './check.ts';
import {CLI_PACKAGE_NAME} from '../runtime/package-root.ts';

/*
 * B14 (owner's second machine, 09/10/2026): `npm i -g talos-code@0.5.1` put the new CLI in `%APPDATA%\npm`, while an older
 * talos in the portable Node folder came first in PATH, so `talos --version` kept saying 0.5.0-beta.6 and nothing said why.
 * Doctor now lists every talos in PATH, in PATH order (the first one is what `talos` runs), with its version, and reports a
 * problem when the first one is not this installation or a newer one is hidden behind it.
 * npm's global layout: Windows `<prefix>\talos.cmd` + `<prefix>\node_modules\talos-code`; POSIX `<prefix>/bin/talos`, a link
 * into `<prefix>/lib/node_modules/talos-code`. Rustup's `rustup which` and pnpm's `doctor` do the same kind of PATH reading.
 */
export type PathInstallation={dir:string;packageRoot:string;version:string|null;running:boolean};
type Fs={exists:(file:string)=>boolean;read:(file:string)=>string;realpath:(file:string)=>string};
const nodeFs:Fs={exists:existsSync,read:file=>readFileSync(file,'utf8'),realpath:realpathSync};

function sameFolder(a:string,b:string,platform:NodeJS.Platform){
  const norm=(p:string)=>p.replace(/[\\/]+$/u,'').replace(/\\/gu,'/');
  return platform==='win32'?norm(a).toLowerCase()===norm(b).toLowerCase():norm(a)===norm(b);
}
const pathOf=(platform:NodeJS.Platform)=>platform==='win32'?win32:posix;
function versionAt(root:string,fs:Fs,platform:NodeJS.Platform):string|null{
  try{const pkg=JSON.parse(fs.read(pathOf(platform).join(root,'package.json')));return pkg?.name===CLI_PACKAGE_NAME&&typeof pkg.version==='string'?pkg.version:null;}catch{return null;}
}
function rootFromShim(dir:string,platform:NodeJS.Platform,fs:Fs):string|null{
  const {join,dirname}=pathOf(platform);
  if(platform==='win32'){
    if(!['talos.cmd','talos.ps1','talos.exe'].some(name=>fs.exists(join(dir,name))))return null;
    const root=join(dir,'node_modules',CLI_PACKAGE_NAME);
    return versionAt(root,fs,platform)!==null?root:null;
  }
  const shim=join(dir,'talos');if(!fs.exists(shim))return null;
  let current:string;try{current=dirname(fs.realpath(shim));}catch{return null;}
  for(let depth=0;depth<8;depth++){if(versionAt(current,fs,platform)!==null)return current;const up=dirname(current);if(up===current)break;current=up;}
  return null;
}

/** Every talos installation reachable through PATH, first one first, each package once. */
export function talosInstallationsInPath({env=process.env,platform=process.platform,runningRoot,fs=nodeFs}:{env?:NodeJS.ProcessEnv;platform?:NodeJS.Platform;runningRoot:string;fs?:Fs}):PathInstallation[]{
  const raw=env.PATH??env.Path??env.path??'';
  const out:PathInstallation[]=[];
  for(const dir of raw.split(platform==='win32'?';':':').map(part=>part.trim().replace(/^"(.*)"$/u,'$1')).filter(Boolean)){
    const root=rootFromShim(dir,platform,fs);
    if(!root||out.some(row=>sameFolder(row.packageRoot,root,platform)))continue;
    out.push({dir,packageRoot:root,version:versionAt(root,fs,platform),running:sameFolder(root,runningRoot,platform)});
  }
  return out;
}

/** npm's --prefix for a PATH folder: the folder itself on Windows, the parent of `bin` elsewhere. */
function npmPrefixFor(dir:string,platform:NodeJS.Platform){return platform!=='win32'&&/[\\/]bin[\\/]?$/u.test(dir)?posix.dirname(dir.replace(/[\\/]+$/u,'')):dir;}

/** The doctor row: ok when the first talos in PATH is this one and no newer one hides behind it. */
export function pathInstallationsCheck(rows:readonly PathInstallation[],currentVersion:string,platform:NodeJS.Platform=process.platform):{id:'path';ok:boolean;detail?:string;installations:readonly PathInstallation[]}|null{
  if(rows.length===0)return null;
  const first=rows[0]!;
  const newest=[...rows].sort((a,b)=>compareReleaseVersions(b.version??'0.0.0',a.version??'0.0.0'))[0]!;
  const hidden=newest!==first&&compareReleaseVersions(newest.version??'0.0.0',first.version??'0.0.0')>0;
  const listed=rows.map(row=>`${row.version??'?'} in ${row.dir}`).join('; ');
  /* Only an installation that `talos` can reach is judged: run through npx, a direct path or a test prefix, this one is not in
     PATH, and a global talos there is the person's own choice — listed, not a problem. */
  const runningInPath=rows.some(row=>row.running);
  if(runningInPath&&(!first.running||hidden)){
    const target=hidden?newest:rows.find(row=>row.running)??newest;
    return{id:'path',ok:false,installations:rows,
      detail:`"talos" runs ${first.version??'?'} from ${first.dir}, but ${target.version??currentVersion} is in ${target.dir} (all: ${listed}). Put ${target.dir} before ${first.dir} in PATH, or install there too: npm i -g talos-code@${target.version??currentVersion} --prefix "${npmPrefixFor(first.dir,platform)}"`};
  }
  return rows.length>1?{id:'path',ok:true,installations:rows,detail:`first in PATH: ${first.version??'?'} in ${first.dir} (all: ${listed})`}:{id:'path',ok:true,installations:rows};
}
