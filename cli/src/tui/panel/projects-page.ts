/*
 * C11b of the redesign (MAPPA-RIDISEGNO-2026-11-01 §3 «Projects: Now, group sessions by `project`»): the workspaces with the sessions
 * linked to them, as the approved CLI mockup draws its Projects section (bozzetto-cli-retro/index.html:1152-1159). Nothing new is read:
 * the session list's own `project` and `path` (runtime/types.ts CliSessionSummary), the folders already trusted, and this folder. A
 * project is born when a session opens on a folder (index.html:1158); a trusted folder with no session yet stands last, «Never opened».
 */
import {t,tn} from '../../i18n/index.ts';
import {sessionMark,type SessionState} from '../session-state.ts';
import {compactTokens} from '../status-bar.ts';
import {truncateDisplay} from '../text-width.ts';
import {S,type PanelItem,type SegRow} from './sheet.ts';
import {panelDay,panelWhen} from './when.ts';

export type ProjectSession={id:string;title:string;project:string|null;path:string|null;parent:string|null;state:SessionState;
  /* when it last moved */at:string|null;/* the kernel's `giri`: one per request to the model */requests:number|null;tokens:number|null};
export type ProjectRow={name:string;path:string|null;sessions:readonly ProjectSession[];last:string|null;requests:number|null;tokens:number|null};

const lastOf=(folder:string)=>folder.split(/[\\/]/u).filter(Boolean).at(-1)??folder;
const same=(a:string,b:string)=>a.replace(/[\\/]+$/u,'').replace(/\\/gu,'/').toLowerCase()===b.replace(/[\\/]+$/u,'').replace(/\\/gu,'/').toLowerCase();
const time=(at:string|null)=>{const ms=at?Date.parse(at):Number.NaN;return Number.isFinite(ms)?ms:Number.NEGATIVE_INFINITY;};
/** A sum of what is known: null when no session says it (a number nobody measured is never drawn). */
const sum=(values:readonly (number|null)[])=>values.some(value=>value!==null)?values.reduce<number>((total,value)=>total+(value??0),0):null;

/** The projects: one per `project` of the top-level sessions, the most recent first, then the trusted folders and this one with none yet. */
export function projectsOf(sessions:readonly ProjectSession[],{current,here,folders=[]}:{current:string;here:string;folders?:readonly string[]}):ProjectRow[]{
  const groups=new Map<string,ProjectSession[]>(),paths=new Map<string,string>();
  for(const session of sessions){
    if(session.parent)continue;
    const name=session.project||(session.path?lastOf(session.path):current);
    if(!groups.has(name))groups.set(name,[]);
    groups.get(name)!.push(session);
    if(session.path&&!paths.has(name))paths.set(name,session.path);
  }
  const rows:ProjectRow[]=[...groups].map(([name,list])=>{
    const ordered=[...list].sort((a,b)=>time(b.at)-time(a.at));
    return{name,path:paths.get(name)??(name===current&&here?here:null),sessions:ordered,last:ordered[0]?.at??null,requests:sum(ordered.map(row=>row.requests)),tokens:sum(ordered.map(row=>row.tokens))};
  }).sort((a,b)=>time(b.last)-time(a.last));
  const known=(folder:string)=>rows.some(row=>row.path?same(row.path,folder):row.name===lastOf(folder));
  for(const folder of [...(here?[here]:[]),...folders]){
    if(known(folder))continue;
    rows.push({name:lastOf(folder),path:folder,sessions:[],last:null,requests:null,tokens:null});
  }
  return rows;
}

/** «Last time today», «Last time yesterday», «Last time Sep 4», «Never opened» (index.html:1152). */
export function projectLastTime(at:string|null,now=Date.now()):string{
  if(!at||!Number.isFinite(Date.parse(at)))return t('panel.projects.never');
  const day=panelDay(at,{now});
  const word=day===t('panel.when.today')?day:panelWhen(at,{now})===t('panel.when.yesterday')?t('panel.when.yesterday'):day;
  return t('panel.projects.lastTime',{when:word});
}

/** One row of the list: the name, when it was last opened, and its sessions with their requests and tokens (index.html:1155). */
export function projectItems(rows:readonly ProjectRow[],now=Date.now()):PanelItem[]{
  return rows.map(row=>{
    const count=row.sessions.length;
    const desc=count?[tn('panel.projects.sessions',count),...(row.requests!==null?[tn('panel.projects.requests',row.requests)]:[]),...(row.tokens!==null?[t('panel.projects.tokens',{tokens:compactTokens(row.tokens)})]:[])].join(' · '):t('panel.projects.noSessions');
    return{id:row.path??row.name,label:row.name,meta:projectLastTime(row.last,now),desc,search:row.path??row.name};
  });
}

/** The detail: «Project», its name and folder, then up to six recent sessions with their state (index.html:1157). */
export function projectDetail(row:ProjectRow|undefined,width:number,{now=Date.now(),unicode=true}:{now?:number;unicode?:boolean}={}):SegRow[]{
  if(!row)return[];
  const out:SegRow[]=[[S(t('panel.projects.project'),'faint')],[S(truncateDisplay(row.name,width),'b')],...(row.path?[[S(truncateDisplay(row.path,width),'dim')] as SegRow]:[]),[S('')]];
  if(!row.sessions.length)return[...out,[S(t('panel.projects.noSessionsHere'),'dim')]];
  out.push([S(t('panel.projects.recent'),'faint')]);
  for(const session of row.sessions.slice(0,6)){
    const [mark,role]=sessionMark(session.state,{unicode});const when=session.at?panelWhen(session.at,{now}):'';
    out.push([S(`${mark} `,role),S(truncateDisplay(session.title,Math.max(4,width-10))),...(when?[S(`  ${when}`,'faint')]:[])]);
  }
  return out;
}
