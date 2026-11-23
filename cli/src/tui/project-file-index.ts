/*
 * R5b D6 (owner decision Q-R5-16): the project's files for `@`, from an own bounded walker (no new dependency; Pi calls
 * `fd`, Claude Code and Codex walk with ripgrep's ignore rules).
 * - `.gitignore` files are respected, the root's and every nested one, in git's order: later rules win, `!` re-includes,
 *   a trailing `/` is for folders only, a pattern with a slash is anchored to its file's folder, one without matches at any
 *   depth, `*` `?` `[...]` `**` as git reads them. A folder that is ignored is not walked (git cannot re-include inside it).
 *   Not read: `.git/info/exclude` and the global excludes file.
 * - `.git` and `node_modules` are never walked.
 * - A link or junction to a folder is never followed (the R4 guard, file-completion.ts); a linked file is kept only if its
 *   real path is inside the workspace. Names with control, line-separator or bidi characters are never drawn.
 * - At most `maxEntries` rows, breadth first; `capped` says the walk stopped, so the list can say so (plan Part III item 2).
 */
import {readFile,readdir,stat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {resolvePathInsideWorkspace,resolveWorkspaceIdentity} from '../security/workspace-identity.ts';

export const PROJECT_INDEX_MAX_ENTRIES=20_000;
const MAX_DEPTH=32;
const NEVER_WALKED=new Set(['.git','node_modules']);
const UNSAFE_NAME=/[\x00-\x1f\x7f\p{Zl}\p{Zp}\p{Bidi_Control}]/u;

export type ProjectFileEntry={path:string;directory:boolean};
export type ProjectFileIndex={root:string;entries:ProjectFileEntry[];capped:boolean;max:number;builtAt:number};
export type GitignoreRule={base:string;negate:boolean;directoryOnly:boolean;pattern:RegExp};

function escapeRegex(text:string){return text.replace(/[.*+?^${}()|[\]\\/]/gu,'\\$&');}
function globSource(glob:string):string{
  let out='';
  for(let i=0;i<glob.length;i++){
    const c=glob[i]!;
    if(c==='*'){
      if(glob[i+1]==='*'){
        const atStart=i===0||glob[i-1]==='/',slashAfter=glob[i+2]==='/',atEnd=i+2===glob.length;
        if(atStart&&slashAfter){out+='(?:.*/)?';i+=2;continue;}
        if(atStart&&atEnd){out+='.*';i+=1;continue;}
        out+='.*';i+=1;continue;
      }
      out+='[^/]*';continue;
    }
    if(c==='?'){out+='[^/]';continue;}
    if(c==='['){const end=glob.indexOf(']',i+2);if(end>i){let body=glob.slice(i+1,end);if(body.startsWith('!'))body='^'+body.slice(1);out+=`[${body.replace(/\\/gu,'\\\\')}]`;i=end;continue;}}
    if(c==='\\'&&i+1<glob.length){out+=escapeRegex(glob[i+1]!);i+=1;continue;}
    out+=escapeRegex(c);
  }
  return out;
}

/** The rules of one `.gitignore`; `base` is its folder relative to the project root ('' for the root). */
export function gitignoreRules(text:string,base:string):GitignoreRule[]{
  const rules:GitignoreRule[]=[];
  for(const raw of text.split(/\r?\n/u)){
    let line=raw.replace(/(?<!\\)\s+$/u,'');
    if(!line||line.startsWith('#'))continue;
    let negate=false;if(line.startsWith('!')){negate=true;line=line.slice(1);}
    if(line.startsWith('\\#')||line.startsWith('\\!'))line=line.slice(1);
    let directoryOnly=false;if(line.endsWith('/')){directoryOnly=true;line=line.slice(0,-1);}
    if(!line)continue;
    const anchored=line.includes('/');if(line.startsWith('/'))line=line.slice(1);
    const source=globSource(line);
    rules.push({base,negate,directoryOnly,pattern:new RegExp(anchored?`^${source}$`:`(?:^|/)${source}$`,'u')});
  }
  return rules;
}

/** Git's answer for one path (relative to the root, `/`-separated): the last rule that matches decides. */
export function isIgnored(rules:readonly GitignoreRule[],path:string,directory:boolean):boolean{
  let ignored=false;
  for(const rule of rules){
    if(rule.directoryOnly&&!directory)continue;
    const relative=rule.base?(path.startsWith(rule.base+'/')?path.slice(rule.base.length+1):null):path;
    if(relative===null)continue;
    if(rule.pattern.test(relative))ignored=!rule.negate;
  }
  return ignored;
}

export async function buildProjectFileIndex(projectRoot:string,{maxEntries=PROJECT_INDEX_MAX_ENTRIES}:{maxEntries?:number}={}):Promise<ProjectFileIndex>{
  const workspace=await resolveWorkspaceIdentity({projectRoot});const root=workspace.requestedRoot;
  const entries:ProjectFileEntry[]=[];let capped=false;
  const queue:Array<{path:string;depth:number;rules:GitignoreRule[]}>=[{path:'',depth:0,rules:[]}];
  while(queue.length&&!capped){
    const folder=queue.shift()!;const absolute=folder.path?join(root,...folder.path.split('/')):root;
    let rules=folder.rules;
    try{rules=[...rules,...gitignoreRules(await readFile(join(absolute,'.gitignore'),'utf8'),folder.path)];}catch{/* no .gitignore here */}
    let dirents;try{dirents=await readdir(absolute,{withFileTypes:true});}catch{continue;}
    dirents.sort((a,b)=>a.name.localeCompare(b.name));
    for(const dirent of dirents){
      if(UNSAFE_NAME.test(dirent.name)||NEVER_WALKED.has(dirent.name))continue;
      const path=folder.path?`${folder.path}/${dirent.name}`:dirent.name;
      let directory=dirent.isDirectory();
      if(dirent.isSymbolicLink()){
        /* A link or junction: a folder is never followed; a file is kept only when its real path stays inside. */
        const real=await resolvePathInsideWorkspace(workspace,resolve(absolute,dirent.name)).catch(()=>null);if(!real)continue;
        let info;try{info=await stat(real);}catch{continue;}
        if(!info.isFile())continue;directory=false;
      }else if(!directory&&!dirent.isFile())continue;
      if(isIgnored(rules,path,directory))continue;
      if(entries.length>=maxEntries){capped=true;break;}
      entries.push({path,directory});
      if(directory&&folder.depth+1<MAX_DEPTH)queue.push({path,depth:folder.depth+1,rules});
    }
  }
  return{root,entries,capped,max:maxEntries,builtAt:Date.now()};
}

/*
 * Ranking, best first (Claude Code 2.1.280: "a file whose name contains the query above folder-only matches"):
 * 0 the name starts with the query · 1 the name contains it · 2 the path contains it · 3 the query's letters appear in
 * order in the path (3 letters or more); inside a tier, files before folders, then shallower, then shorter, then by name.
 */
export function rankProjectFiles(index:ProjectFileIndex,query:string):ProjectFileEntry[]{
  const q=query.toLowerCase().replace(/\\/gu,'/');if(!q)return[];
  const scored:Array<{entry:ProjectFileEntry;tier:number}>=[];
  for(const entry of index.entries){
    const path=entry.path.toLowerCase(),name=path.slice(path.lastIndexOf('/')+1);
    let tier=-1;
    if(name.startsWith(q))tier=0;else if(name.includes(q))tier=1;else if(path.includes(q))tier=2;
    else if(q.length>=3){let at=0;for(const ch of path){if(ch===q[at])at+=1;if(at===q.length)break;}if(at===q.length)tier=3;}
    if(tier>=0)scored.push({entry,tier});
  }
  const depth=(path:string)=>path.split('/').length;
  return scored.sort((a,b)=>a.tier-b.tier||Number(a.entry.directory)-Number(b.entry.directory)||depth(a.entry.path)-depth(b.entry.path)||a.entry.path.length-b.entry.path.length||a.entry.path.localeCompare(b.entry.path)).map(row=>row.entry);
}

/** One index per project, rebuilt when older than `ttlMs`, so typing after `@` does not walk the tree at every key. */
export function createProjectFileIndexCache(projectRoot:string,{ttlMs=15_000}:{ttlMs?:number}={}){
  let pending:Promise<ProjectFileIndex>|null=null;
  return{get():Promise<ProjectFileIndex>{
    if(pending)return pending.then(index=>Date.now()-index.builtAt<=ttlMs?index:(pending=buildProjectFileIndex(projectRoot)));
    return(pending=buildProjectFileIndex(projectRoot).catch(error=>{pending=null;throw error;}));
  }};
}
