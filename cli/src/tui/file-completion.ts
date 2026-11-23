import {readdir,stat} from 'node:fs/promises';
import {isAbsolute,resolve} from 'node:path';
import {t} from '../i18n/index.ts';
import {isPathInsideWorkspace,resolvePathInsideWorkspace,resolveWorkspaceIdentity} from '../security/workspace-identity.ts';
import {pickerSection,type OverlayContent,type OverlayLine} from './overlays/scroll-window.ts';
import {buildProjectFileIndex,rankProjectFiles,type ProjectFileIndex} from './project-file-index.ts';

/*
 * R4 lane N — `@` completion (owner decision Q-R4-8, gate E8/E13). One folder at a time, by prefix (the engine TALOS had;
 * fuzzy project-wide search is R5). Measured before R4 (gate §0.8): `@src/` + Tab offered `@src//util/`, `@src\` offered
 * nothing. Now:
 * - `\` is read as `/` on input and repeated slashes collapse, so what is shown is always `/`-separated and never `//`
 *   (Claude Code "Use forward slashes on Windows too", interactive-mode.md :342, gate B.2; Pi `toDisplayPath`, gate §6.2);
 * - folders end in `/`; files come before folders (Claude Code 2.1.280, 2026-09-22: "@ file suggestions rank a file whose
 *   name contains the query above folder-only matches", gate D.7), each group by name;
 * - only entries whose real path stays inside the workspace are offered (`resolvePathInsideWorkspace`: a junction or a
 *   symbolic link that leaves the project is dropped), and names with control or bidi characters are never drawn.
 */
export type ProjectPathRow={value:string;directory:boolean};
/** The most rows the list takes, border and title included (E13: inside the R1 budget, which may give it fewer). */
export const FILE_COMPLETION_MAX_ROWS=10;
const UNSAFE_NAME=/[\x00-\x1f\x7f\p{Zl}\p{Zp}\p{Bidi_Control}]/u;

/** The typed path after `@`: quotes removed, `\` read as `/`, repeated slashes collapsed; `folder` keeps its final `/`. */
export function projectPathQuery(token:string):{path:string;folder:string;prefix:string}{
  const raw=(token.startsWith('@')?token.slice(1):token).replace(/^['"]|['"]$/gu,'').replace(/\\/gu,'/').replace(/\/{2,}/gu,'/');
  const slash=raw.lastIndexOf('/');
  return{path:raw,folder:slash>=0?raw.slice(0,slash+1):'',prefix:raw.slice(slash+1)};
}

function displayValue(path:string,directory:boolean){const value=path+(directory?'/':'');return /\s/u.test(value)?`@"${value}"`:`@${value}`;}

export async function completeProjectPath(projectRoot:string,token:string):Promise<ProjectPathRow[]>{
  const workspace=await resolveWorkspaceIdentity({projectRoot});
  const {path:raw,folder,prefix}=projectPathQuery(token);
  if(isAbsolute(raw)||/^[A-Za-z]:/u.test(raw))return[];
  const logicalParent=resolve(workspace.requestedRoot,folder||'.');if(!isPathInsideWorkspace(workspace,logicalParent))return[];
  const parent=await resolvePathInsideWorkspace(workspace,logicalParent);if(!parent)return[];
  let entries;try{entries=await readdir(parent,{withFileTypes:true});}catch{return[];}
  const rows:Array<{name:string;directory:boolean}>=[];
  for(const entry of entries){
    if(!entry.name.startsWith(prefix)||UNSAFE_NAME.test(entry.name))continue;
    const canonical=await resolvePathInsideWorkspace(workspace,resolve(parent,entry.name));if(!canonical)continue;
    let info;try{info=await stat(canonical);}catch{continue;}
    if(!info.isDirectory()&&!info.isFile())continue;
    rows.push({name:entry.name,directory:info.isDirectory()});
  }
  return rows.sort((a,b)=>Number(a.directory)-Number(b.directory)||a.name.localeCompare(b.name)).map(entry=>({value:displayValue(folder+entry.name,entry.directory),directory:entry.directory}));
}

/*
 * R5b D6 (Q-R5-16; plan Part III items 2 and 5): `@` with part of a name searches the whole project (project-file-index.ts);
 * `@` alone and `@folder/` still browse one folder (R4). The list says where its rows come from and how many it found, and
 * shows at most PROJECT_COMPLETION_SHOWN of them, saying so when there are more.
 */
export const PROJECT_COMPLETION_SHOWN=50;
export type CompletionSource={kind:'folder';folder:string}|{kind:'project';found:number;shown:number;capped:boolean;max:number};
export async function completeProjectFiles(projectRoot:string,token:string,{index}:{index?:()=>Promise<ProjectFileIndex>}={}):Promise<{rows:ProjectPathRow[];source:CompletionSource}>{
  const query=projectPathQuery(token);
  if(!query.path||query.path.endsWith('/'))return{rows:await completeProjectPath(projectRoot,token),source:{kind:'folder',folder:query.folder}};
  if(isAbsolute(query.path)||/^[A-Za-z]:/u.test(query.path)||query.path.split('/').includes('..'))return{rows:[],source:{kind:'project',found:0,shown:0,capped:false,max:0}};
  const built=await (index?index():buildProjectFileIndex(projectRoot));
  const ranked=rankProjectFiles(built,query.path);const shown=ranked.slice(0,PROJECT_COMPLETION_SHOWN);
  return{rows:shown.map(entry=>({value:displayValue(entry.path,entry.directory),directory:entry.directory})),source:{kind:'project',found:ranked.length,shown:shown.length,capped:built.capped,max:built.max}};
}
function sourceLine(source:CompletionSource):OverlayLine{
  if(source.kind==='folder')return{text:t('screen.completion.sourceFolder',{folder:source.folder||t('screen.completion.thisFolder')}),tone:'dim'};
  const base=source.shown<source.found?t('screen.completion.sourceProjectMore',{shown:source.shown,found:source.found}):t('screen.completion.sourceProject',{found:source.found});
  return{text:base+(source.capped?t('screen.completion.sourceCapped',{max:source.max.toLocaleString('en-US')}):''),tone:'dim'};
}

/* The list as app.ts draws it (single border, like the command menu), fitted by overlays/scroll-window.ts to at most
   FILE_COMPLETION_MAX_ROWS and the R1 budget, the highlight kept in view; with nothing to offer, one dim line says so
   (Q-R4-13: `No files match src/x`, gate §5). */
export function fileCompletionOverlay({token,rows,selected,source}:{token:string;rows:readonly ProjectPathRow[];selected:number;source?:CompletionSource|undefined}):OverlayContent{
  const head:OverlayLine[]=[{text:t('screen.completion.title'),tone:'strong'},...(source?[sourceLine(source)]:[])];
  if(!rows.length){
    const query=projectPathQuery(token);
    const text=query.prefix?t('screen.completion.none',{path:query.path}):t('screen.completion.emptyFolder',{folder:query.folder||t('screen.completion.thisFolder')});
    return{head,sections:[{lines:[{text,tone:'dim'}]}],borderStyle:'single'};
  }
  /* stage 6c (Claude Code: «Click a suggestion in the / command or @ file list to accept it»): a click inserts the path as Tab */
  return{head,sections:[pickerSection(rows,selected,row=>row.value,(_row,index)=>`file:${index}`)],borderStyle:'single'};
}
