/*
 * Owner 27/10/2026 («Misura vera»): the installed-package proof no longer counts the bundled kernel's files (the cap of 150 was a
 * proxy for startup, and 168 files cost 16 ms: 292 against 0.6.14's 276, medians of 6). It measures what the cap stood for: the
 * warm start to a ready composer of THIS package against the PREVIOUS release, on the same machine in the same run, and fails
 * when this one's median is more than 10 % slower.
 * Practice (research 27/10/2026): one machine, the two programs interleaved (cross-machine noise on hosted runners is 0.6–1.5×,
 * Quansight; a same-runner A/B gate at 110 %, timezonefinder's methodology), warm-up runs thrown away and at least 10 measured
 * (hyperfine's `--warmup`/`--min-runs` practice), the median compared (one slow outlier does not decide).
 */
import {execFile,spawnSync} from 'node:child_process';
import {existsSync,mkdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';

export const STARTUP_LIMIT=1.10;
export const STARTUP_WARMUP=2;
export const STARTUP_RUNS=10;

export const median=(values:readonly number[])=>{const sorted=[...values].sort((a,b)=>a-b);const middle=Math.floor(sorted.length/2);
  return sorted.length%2?sorted[middle]!:(sorted[middle-1]!+sorted[middle]!)/2;};

/** The verdict on two series of warm starts (warm-ups already removed). A start that never reached the composer is -1: it fails. */
export function startupVerdict(now:readonly number[],before:readonly number[],limit=STARTUP_LIMIT){
  const failedNow=now.filter(ms=>ms<0).length,failedBefore=before.filter(ms=>ms<0).length;
  if(!now.length||!before.length||failedNow||failedBefore)return{ok:false,reason:'a start did not reach the composer' as const,failedNow,failedBefore,now:[...now],before:[...before]};
  const medianNow=median(now),medianBefore=median(before),ratio=Math.round(medianNow/medianBefore*1000)/1000;
  return{ok:ratio<=limit,reason:ratio<=limit?'within the limit' as const:'slower than the previous release' as const,medianNow,medianBefore,ratio,limit,now:[...now],before:[...before]};
}

/** npm as a program to start. On Windows it is a .cmd, which only a shell runs, and with shell:true Node joins the arguments as they
    are (DEP0190), so a folder with a space fell in two: the line is built and quoted here. */
export function npmCommand(args:readonly string[],platform:string=process.platform){
  if(platform!=='win32')return{file:'npm',args:[...args],shell:false};
  return{file:['npm.cmd',...args.map(arg=>/^[\w@./:=-]+$/u.test(arg)?arg:`"${arg}"`)].join(' '),args:[] as string[],shell:true};
}
const npmSync=(args:readonly string[])=>{const c=npmCommand(args);return spawnSync(c.file,c.args,{encoding:'utf8',shell:c.shell,timeout:60_000});};
/** The last line npm printed, when it is a whole version; else ''. */
export function releaseVersion(printed:string){
  const line=printed.trim().split('\n').pop()?.trim()??'';
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(line)?line:'';
}
/** a.b.c before x.y.z, with pre-releases in semver's order: before their release, field by field, numbers before words, fewer fields first */
export function olderThan(a:string,b:string){
  const parse=(v:string)=>{const dash=v.indexOf('-');return{n:(dash<0?v:v.slice(0,dash)).split('.').map(Number),pre:dash<0?null:v.slice(dash+1).split('.')};};
  const x=parse(a),y=parse(b);
  for(let i=0;i<3;i+=1){const d=(x.n[i]??0)-(y.n[i]??0);if(d)return d<0;}
  if(!x.pre||!y.pre)return x.pre!==null&&y.pre===null;
  for(let i=0;i<Math.min(x.pre.length,y.pre.length);i+=1){
    const p=x.pre[i]!,q=y.pre[i]!;if(p===q)continue;
    const pn=/^\d+$/u.test(p),qn=/^\d+$/u.test(q);
    if(pn&&qn)return Number(p)<Number(q);
    if(pn!==qn)return pn;
    return p<q;
  }
  return x.pre.length<y.pre.length;
}
const installedVersion=(pkg:string)=>{try{return String(JSON.parse(readFileSync(join(pkg,'package.json'),'utf8')).version);}catch{return null;}};
/** The two files hold the same bytes: the same build, whatever its version says. */
export function sameBuild(a:string,b:string){try{return readFileSync(a).equals(readFileSync(b));}catch{return false;}}

/**
 * The previous release's `dist/main.js`: TALOS_STARTUP_BASELINE_MAIN when set; else the release npm calls latest, taken from the
 * global install when that is the one (no download on a machine that already has it), else installed into `home`. Null when there
 * is none (the check then fails: no comparison is not a pass).
 */
export async function previousReleaseMain({name,currentVersion,currentMain,home,env=process.env}:{name:string;currentVersion:string;currentMain:string;home:string;env?:NodeJS.ProcessEnv}):Promise<{main:string;version:string|null;source:string}|null>{
  const forced=env.TALOS_STARTUP_BASELINE_MAIN;
  if(forced)return existsSync(forced)?{main:forced,version:null,source:'TALOS_STARTUP_BASELINE_MAIN'}:null;
  /* a release not newer than this one (the same number until the version is raised at release), already installed globally, is
     the reference with no request to the registry (the owner's machine); this very build, installed to try it, is not */
  const root=npmSync(['root','-g']);
  const global=root.status===0?join(root.stdout.trim(),name):null;
  const globalVersion=global?installedVersion(global):null;
  if(global&&globalVersion&&!olderThan(currentVersion,globalVersion)&&existsSync(join(global,'dist','main.js'))&&!sameBuild(currentMain,join(global,'dist','main.js')))return{main:join(global,'dist','main.js'),version:globalVersion,source:'global install'};
  const view=npmSync(['view',name,'version']);
  const latest=view.status===0?releaseVersion(view.stdout):'';
  if(!latest||olderThan(currentVersion,latest))return null;
  const prefix=join(home,'baseline-prefix');mkdirSync(prefix,{recursive:true});
  const install=npmCommand(['install','-g','--prefix',prefix,`${name}@${latest}`,'--no-audit','--no-fund']);
  const installed=await new Promise<number>(done=>execFile(install.file,install.args,{shell:install.shell,maxBuffer:64*1024*1024},error=>done(error?1:0)));
  const pkg=process.platform==='win32'?join(prefix,'node_modules',name):join(prefix,'lib','node_modules',name);
  return installed===0&&existsSync(join(pkg,'dist','main.js'))?{main:join(pkg,'dist','main.js'),version:latest,source:'installed from npm'}:null;
}
