/*
 * C11c (CLI 0.7.0, block A2): the four filters of New session's «Where we work», as the approved mockup draws them
 * (bozzetto-cli-retro/index.html:1288 and :1300-1302, frame 31): Project, Recently used, Quick pick, Disk. The words are the PC's
 * (harness-ui/frontend/src/i18n/testi/app.js:3277-3280) and so are the sources, read here and not invented:
 *   - Recently used: the folders of the sessions, the latest first, at most six, only those that are still folders
 *     (harness-ui/src/frequent-dirs.mjs:113-126, `cartelleConsigliate`; Hermes orders its lanes the same way, by the most recent
 *     session, apps/desktop/src/app/chat/sidebar/projects/workspace-groups.ts:187-189).
 *   - Quick pick: Desktop, Documents and Downloads under the home folder, only those that exist (frequent-dirs.mjs:37-41, 70-76).
 *   - Disk: the drives that answer (workspace-browser.mjs:105-119, `elencaDischi`: A to Z in parallel, each with its own cap, the
 *     system drive first; «/» outside Windows), joined to the drives of the folders already known, so a slow probe never hides
 *     the drive TALOS stands on.
 * Only reads, only suggestions: opening one goes the way a typed path goes (`openFolder`, then the trust card of the new folder).
 * The page loads this file with import() when it opens (MAPPA-RIDISEGNO §4: new sections are lazy), so the start never pays for it.
 */
import {stat} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join,parse,win32} from 'node:path';

export type Place={name:string;path:string};
export type PlaceSession={path?:string|null;parent?:string|null;at?:string|null};
type Stat=(path:string)=>Promise<{isDirectory():boolean}>;

/* the PC's cap for a drive (workspace-browser.mjs:104): a slow network drive does not stop the others */
export const PLACE_CAP_MS=1500;
/* the PC suggests at most six recent folders (frequent-dirs.mjs:116) */
export const RECENT_LIMIT=6;
/* the mockup's order (index.html:1288): Desktop, Documents, Downloads */
const QUICK=[['Desktop','Desktop'],['Documents','Documents'],['Downloads','Downloads']] as const;

const keyOf=(path:string)=>path.replace(/\\/gu,'/').replace(/\/+$/u,'').toLowerCase();
const lastOf=(path:string)=>path.split(/[\\/]/u).filter(Boolean).at(-1)??path;
const capped=<T>(work:Promise<T>,ms:number,fallback:T)=>new Promise<T>(done=>{
  const timer=setTimeout(()=>done(fallback),ms);
  work.then(value=>{clearTimeout(timer);done(value);},()=>{clearTimeout(timer);done(fallback);});
});
const folderTest=(statFn:Stat,capMs:number)=>(path:string)=>capped(Promise.resolve().then(()=>statFn(path)).then(info=>info.isDirectory()),capMs,false);

/** The sessions' folders, the most recent first, once each, at most six, and only those that are still folders. */
export async function recentPlaces(sessions:readonly PlaceSession[],{statFn=stat as Stat,capMs=PLACE_CAP_MS,limit=RECENT_LIMIT}:{statFn?:Stat;capMs?:number;limit?:number}={}):Promise<Place[]>{
  const time=(session:PlaceSession)=>{const ms=session.at?Date.parse(session.at):Number.NaN;return Number.isFinite(ms)?ms:Number.NEGATIVE_INFINITY;};
  const ordered=sessions.map((session,index)=>({session,index})).filter(({session})=>!session.parent&&typeof session.path==='string'&&session.path.trim())
    .sort((a,b)=>time(b.session)-time(a.session)||a.index-b.index);
  const seen=new Set<string>(),paths:string[]=[];
  for(const {session} of ordered){const key=keyOf(session.path!);if(seen.has(key))continue;seen.add(key);paths.push(session.path!);}
  const isFolder=folderTest(statFn,capMs);
  const kept=(await Promise.all(paths.map(async path=>await isFolder(path)?path:null))).filter((path):path is string=>path!==null);
  return kept.slice(0,limit).map(path=>({name:lastOf(path),path}));
}

/** Desktop, Documents and Downloads under the home folder, those that exist. */
export async function quickPlaces({home=homedir(),statFn=stat as Stat,capMs=PLACE_CAP_MS}:{home?:string;statFn?:Stat;capMs?:number}={}):Promise<Place[]>{
  if(!home)return[];
  const isFolder=folderTest(statFn,capMs);
  const found=await Promise.all(QUICK.map(async([name,folder]):Promise<Place|null>=>{const path=join(home,folder);return await isFolder(path)?{name,path}:null;}));
  return found.filter((place):place is Place=>place!==null);
}

/** The drives that answer: on Windows A to Z, each capped, the system drive first; elsewhere «/». */
export async function listDisks({platform=process.platform,statFn=stat as Stat,system=win32.parse(process.env.SystemRoot||process.cwd()).root,capMs=PLACE_CAP_MS}:{platform?:string;statFn?:Stat;system?:string;capMs?:number}={}):Promise<string[]>{
  if(platform!=='win32')return['/'];
  const isFolder=folderTest(statFn,capMs);
  const found=(await Promise.all([...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map(async letter=>{const root=`${letter}:\\`;return await isFolder(root)?root:null;}))).filter((root):root is string=>root!==null);
  const first=found.find(root=>root.toUpperCase()===system.toUpperCase());
  return first?[first,...found.filter(root=>root!==first)]:found;
}

/** The drives as rows: those probed, then those of the folders already known, once each. A drive is named as the mockup names it, «C:». */
export function diskPlaces(probed:readonly string[],known:readonly string[],platform:string=process.platform):Place[]{
  const rootOf=(path:string)=>platform==='win32'?win32.parse(path).root:parse(path).root;
  const roots=[...probed,...known.map(rootOf).filter(Boolean)];
  const seen=new Set<string>(),out:Place[]=[];
  for(const root of roots){
    const path=platform==='win32'&&/^[a-z]:[\\/]?$/iu.test(root)?`${root.slice(0,2).toUpperCase()}\\`:root;
    const key=keyOf(path)||'/';if(seen.has(key))continue;seen.add(key);
    out.push({name:platform==='win32'&&/^[A-Z]:\\$/u.test(path)?path.slice(0,2):path,path});
  }
  return out;
}

/* one probe for the whole run: the first page waits a moment for it, a slow drive turns up the next time the page opens */
let probe:Promise<string[]>|null=null;
export function disksSoon(waitMs=150,list:()=>Promise<string[]>=listDisks):Promise<string[]>{
  probe??=list().catch(()=>[]);
  return capped(probe,waitMs,[]);
}
/** for the tests: forget the probe of the run */
export function forgetDiskProbe(){probe=null;}

/** What New session's «Where we work» shows beside the projects. */
export async function newSessionPlaces({sessions,known,home,waitMs=150}:{sessions:readonly PlaceSession[];/* the folders already known: this one, the trusted ones */known:readonly string[];home?:string;waitMs?:number}):Promise<{recent:Place[];quick:Place[];disks:Place[]}>{
  const [recent,quick,probed]=await Promise.all([recentPlaces(sessions),quickPlaces(home===undefined?{}:{home}),disksSoon(waitMs)]);
  return{recent,quick,disks:diskPlaces(probed,known)};
}
