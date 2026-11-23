/*
 * 20/10/2026, the «before» oracle of shared-script-rule.test.ts (owner 17/10/2026 «Stessa regola, una nuova fiducia»): lines 1-216 of
 * cli/src/security/project-resource-inventory.ts at 15842067f, the CLI's own copy of the script rule before it moved to the shared kernel
 * module (harness-ui/src/script-del-progetto.mjs). Kept verbatim, only the imports pointed at the sources and the inventory's own helpers
 * (package walk, config reading, ids) dropped: it is what the trusts the owner already saved were computed with, so it must never be edited.
 */
import {createHash} from 'node:crypto';
import {lstat,readdir,readFile,readlink} from 'node:fs/promises';
import {realpathTolerant as realpath} from '../../src/security/real-path.ts';
import path from 'node:path';

import {isPathInsideWorkspace,type WorkspaceIdentity} from '../../src/security/workspace-identity.ts';


const FINGERPRINT_CONCURRENCY=32;



async function entryKind(pathname:string):Promise<'file'|'directory'|'symlink'|null>{try{const value=await lstat(pathname);if(value.isSymbolicLink())return'symlink';if(value.isFile())return'file';if(value.isDirectory())return'directory';return null;}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw error;}}
function relativeId(root:string,pathname:string){return path.relative(root,pathname).split(path.sep).join('/');}
async function mapBounded<T,R>(items:readonly T[],limit:number,handler:(item:T)=>Promise<R>):Promise<R[]>{
  const results=new Array<R>(items.length);let cursor=0;
  await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{for(;;){const index=cursor++;if(index>=items.length)return;results[index]=await handler(items[index]!);}}));
  return results;
}
/*
 * ⛔ 0.6.8 (stress test of 0.6.7, F-E-002/F-E-003, S1, reproduced on the published 0.6.7; owner 16/10/2026 «Ricorda anche gli
 *   script»): a hook's or an MCP server's fingerprint covered its configuration row only, so the project script it runs could be
 *   edited after the trust — by anyone, or by the model itself with write permission — and the next session ran the new code
 *   without asking. A script inside .talos/ was covered as context; one at the project root was not. Claude Code does not pin
 *   these scripts either; here every file INSIDE the project that the command line names is part of the row's content, by its
 *   SHA-256, so a changed script asks for the trust again. Only files that exist inside the project count (a program on PATH, a
 *   flag or a URL is not a project file); a row naming none keeps its content as before, so no earlier trust drops without cause.
 */
/* Second review of 0.6.8 (finding 2) and owner 16/10/2026 «La cartella dello script»: the first pinning (entry file only, every
   argument split on spaces) was easy to get around. A hook's command is read as the kernel reads it (process-policy.mjs
   parseProcessCommand), an MCP argument is one token; a name resolves as Node and Python do (extensions, a folder's index or
   package.json main, `node .`, `python -m pkg`, `npm run x` with its pre/post scripts and `npm start`'s server.js default).
   A script in a folder of its own pins THAT WHOLE FOLDER; every pinned script's relative imports are followed in turn (a file, or
   a folder/package, which is then pinned whole), so `require('./lib')`, `from pkg import mod`, `../shared/x.js` and a chain of
   imports are all covered. A file over 64 MB is pinned by its size and time.
   Third review of 0.6.8 (F2, F3) and owner 16/10/2026 «Salta e segnala»: a project always opens. Installed libraries are skipped
   as node_modules is (a Python virtual environment, caches); a link is pinned by where it points, never followed; a folder given as
   a plain argument (data, not a program) is not walked; a script folder over 10,000 files pins the first 10,000 and a row that says
   the rest was not checked. What cannot be followed (a program on PATH, a package from node_modules) is not a project script. */
export const MAX_SCRIPT_FOLDER_FILES=10_000;
/** how many script files' imports are followed for one command line */
const MAX_FOLLOWED_SCRIPTS=2_000;
const MAX_HASHED_BYTES=64*1024*1024;
/* `.exe` and `.com`: Windows runs `bin/srv` as `bin/srv.exe` (PATHEXT) — third review of 0.6.8 */
const SCRIPT_EXTENSIONS=['.js','.cjs','.mjs','.ts','.cts','.mts','.jsx','.tsx','.py','.ps1','.cmd','.bat','.sh','.exe','.com'];
const FOLLOWED_EXTENSIONS=new Set(['.js','.cjs','.mjs','.ts','.cts','.mts','.jsx','.tsx','.py']);
const SKIPPED_FOLDERS=new Set(['node_modules','.git','.venv','venv','__pycache__','.tox','.nox','.mypy_cache','.pytest_cache','.ruff_cache','site-packages','.next','.turbo','.cache']);
/** process-policy.mjs parseProcessCommand, as the kernel reads a hook's command (a command it would refuse names nothing) */
export function hookCommandTokens(command:string):string[]{
  if(typeof command!=='string'||!command.trim()||command.includes('\0'))return[];
  const tokens:string[]=[];let token='',quoted=false,escaping=false;
  for(const char of command.trim()){
    if(escaping){token+=char;escaping=false;continue;}
    if(char==='\\'&&quoted){escaping=true;continue;}
    if(char==='"'){quoted=!quoted;continue;}
    if(!quoted&&/[&|;<>()]/u.test(char))return[];
    if(!quoted&&/\s/u.test(char)){if(token){tokens.push(token);token='';}continue;}
    token+=char;
  }
  if(escaping)token+='\\';if(quoted)return[];if(token)tokens.push(token);
  return tokens;
}
/** a package.json script's command line, split on the shell's operators (each part is a command of its own) */
function scriptLineTokens(line:string):string[]{return line.split(/&&|\|\||[;&|]/u).flatMap(part=>hookCommandTokens(part));}
/** the tokens of a command line that may name a project file: flag values unwrapped (`--x=./a`, `-r./a`), npm scripts followed */
async function nameCandidates(root:string,tokens:readonly string[]):Promise<string[]>{
  const names:string[]=[];
  for(const [index,raw] of tokens.entries()){
    const token=raw.replace(/^--?[A-Za-z][\w-]*=/u,'').replace(/^-(?:r|i)(?=[.\\/])/u,'');
    if(!token||token.length>4096||/^[A-Za-z][\w+.-]*:\/\//u.test(token))continue;
    names.push(token);
    /* npm, pnpm, yarn and bun run what package.json says: the file, the script with its pre and post scripts, and for `start`
       without a script npm's own default, `node server.js` */
    if(index===0&&/^(?:npm|pnpm|yarn|bun)(?:\.cmd)?$/iu.test(path.basename(token))){
      names.push('package.json');
      const script=tokens[1]==='run'||tokens[1]==='run-script'?tokens[2]:tokens[1];
      try{
        const pkg=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));const scripts=pkg?.scripts&&typeof pkg.scripts==='object'?pkg.scripts:{};
        if(typeof script==='string')for(const name of ['pre'+script,script,'post'+script]){const line=scripts[name];if(typeof line==='string')names.push(...scriptLineTokens(line));}
        if(script==='start'&&typeof scripts.start!=='string')names.push('server.js');
      }catch{/* no package.json: nothing more to follow */}
    }
  }
  return names;
}
async function existing(pathname:string):Promise<{canonical:string;kind:'file'|'directory'}|null>{
  let canonical:string;try{canonical=await realpath(pathname);}catch{return null;}
  const kind=await entryKind(canonical);return kind==='file'||kind==='directory'?{canonical,kind}:null;
}
async function resolveName(root:string,name:string):Promise<{canonical:string;kind:'file'|'directory'}|null>{
  const base=path.resolve(root,name);
  const direct=await existing(base);if(direct)return direct;
  for(const extension of SCRIPT_EXTENSIONS){const found=await existing(base+extension);if(found)return found;}
  const dotted=name.includes('.')&&!/[\\/]/u.test(name)?await existing(path.resolve(root,...name.split('.'))):null;/* python -m a.b */
  return dotted??(await existing(path.resolve(root,...name.split('.'))+'.py'));
}
/** the file `node <folder>` runs: package.json main, else index.*, else a Python package's __main__.py or __init__.py */
async function folderEntry(folder:string):Promise<string|null>{
  try{const main=JSON.parse(await readFile(path.join(folder,'package.json'),'utf8'))?.main;if(typeof main==='string'){const found=await resolveName(folder,main);if(found?.kind==='file')return found.canonical;}}catch{/* no package.json */}
  for(const name of [...SCRIPT_EXTENSIONS.map(extension=>'index'+extension),'__main__.py','__init__.py']){const found=await existing(path.join(folder,name));if(found?.kind==='file')return found.canonical;}
  return null;
}
async function fileDigest(pathname:string):Promise<string>{
  const value=await lstat(pathname);
  if(value.size>MAX_HASHED_BYTES)return'size:'+value.size+':mtime:'+Math.trunc(value.mtimeMs);
  return createHash('sha256').update(await readFile(pathname)).digest('hex');
}
/** the relative names a script imports (JavaScript/TypeScript require/import/export-from, Python imports) */
async function importNames(file:string):Promise<string[]>{
  if(!FOLLOWED_EXTENSIONS.has(path.extname(file).toLowerCase()))return[];
  let text:string;try{const size=(await lstat(file)).size;if(size>MAX_HASHED_BYTES)return[];text=await readFile(file,'utf8');}catch{return[];}
  const names=new Set<string>();
  for(const match of text.matchAll(/(?:require\s*\(\s*|import\s*\(\s*|\bfrom\s+|\bimport\s+)["'](\.{1,2}(?:\/[^"'\n]*)?)["']/gu))names.add(match[1]!);
  if(/\.py$/iu.test(file))for(const match of text.matchAll(/^[ \t]*(?:from[ \t]+(\.*[\w.]*)[ \t]+import|import[ \t]+([\w.]+))/gmu)){const module=(match[1]??match[2]??'').replace(/^\.+/u,'');if(module)names.add(module.split('.').join('/'));}
  return[...names].slice(0,256);
}
function isInside(root:string,canonical:string){const relative=path.relative(root,canonical);return relative!==''&&!relative.startsWith('..')&&!path.isAbsolute(relative);}
/** a Python virtual environment is a folder with pyvenv.cfg, whatever its name */
async function isVirtualEnvironment(folder:string){return(await entryKind(path.join(folder,'pyvenv.cfg')))==='file';}
type FolderWalk={files:string[];links:{path:string;target:string}[];truncated:boolean};
async function walkScriptFolder(folder:string,limit:number):Promise<FolderWalk>{
  const walked:FolderWalk={files:[],links:[],truncated:false};
  async function walk(directory:string){
    if(walked.truncated)return;
    for(const entry of await readdir(directory,{withFileTypes:true})){
      if(walked.truncated)return;
      const pathname=path.join(directory,entry.name);
      if(entry.isSymbolicLink()){let target='';try{target=await readlink(pathname);}catch{/* unreadable: its name still counts */}walked.links.push({path:pathname,target});continue;}
      if(entry.isDirectory()){if(!SKIPPED_FOLDERS.has(entry.name)&&!await isVirtualEnvironment(pathname))await walk(pathname);continue;}
      if(entry.isFile()){if(walked.files.length>=limit){walked.truncated=true;return;}walked.files.push(pathname);}
    }
  }
  await walk(folder);walked.files.sort();return walked;
}
/** Every project file a command line runs, by its digest (see the comment above). */
export async function referencedScripts(workspace:WorkspaceIdentity,tokens:readonly string[],{maxFolderFiles=MAX_SCRIPT_FOLDER_FILES}:{maxFolderFiles?:number}={}):Promise<{path:string;sha256:string}[]>{
  const root=workspace.canonicalRoot;
  /* a pinned path and, for a link or a truncated folder, what stands for its digest */
  const pinned=new Map<string,string|null>();const walkedFolders=new Set<string>();const queue:string[]=[];const followed=new Set<string>();
  const inside=(canonical:string)=>isInside(root,canonical)&&isPathInsideWorkspace(workspace,canonical);
  const pinScript=(file:string)=>{if(!pinned.has(file))pinned.set(file,null);if(!followed.has(file)){followed.add(file);queue.push(file);}};
  const pinFolder=async(folder:string)=>{
    if(walkedFolders.has(folder)||folder===root)return;walkedFolders.add(folder);
    const walk=await walkScriptFolder(folder,maxFolderFiles);
    for(const file of walk.files)pinScript(file);
    for(const link of walk.links)pinned.set(link.path,'link:'+link.target);
    if(walk.truncated)pinned.set(path.join(folder,'…'),'not-checked:more-than-'+maxFolderFiles+'-files');
  };
  const pinEntry=async(file:string)=>{if(path.dirname(file)!==root&&path.basename(file)!=='package.json')await pinFolder(path.dirname(file));pinScript(file);};
  const names=await nameCandidates(root,tokens);
  for(const name of names){
    const found=await resolveName(root,name);if(!found||!inside(found.canonical))continue;
    if(found.kind==='file'){await pinEntry(found.canonical);continue;}
    /* a folder runs only when it has an entry (`node tools/srv`, `python -m pkg`); otherwise it is data and is not walked */
    const entry=await folderEntry(found.canonical);if(entry&&inside(entry))await pinEntry(entry);
  }
  /* `node .` names the root itself */
  if(tokens.some(name=>name==='.'||name==='./')){const entry=await folderEntry(root);if(entry&&inside(entry))await pinEntry(entry);}
  /* every pinned script's relative imports, in turn: a file joins (with its folder's other files only if it is an entry of its own,
     never here), a folder or a package joins whole */
  while(queue.length&&followed.size<=MAX_FOLLOWED_SCRIPTS){
    const file=queue.shift()!;
    for(const name of await importNames(file)){
      const resolved=await resolveName(path.dirname(file),name);if(!resolved||!inside(resolved.canonical))continue;
      if(resolved.kind==='file')pinScript(resolved.canonical);else await pinFolder(resolved.canonical);
    }
  }
  /* fourth review of 0.6.8 (N1): the bound is said, as a truncated folder is — never a silent cut */
  if(queue.length)pinned.set(path.join(root,'…imports'),'not-checked:imports-past-'+MAX_FOLLOWED_SCRIPTS+'-scripts');
  const rows=await mapBounded([...pinned],FINGERPRINT_CONCURRENCY,async([file,stands])=>({path:relativeId(root,file),sha256:stands??await fileDigest(file)}));
  return rows.sort((a,b)=>a.path.localeCompare(b.path));
}
/* 0.6.9 (stress test of 0.6.8, F-C-001, S2): the ONE place where what a hook or an MCP server runs is turned into the content that
   is pinned. The project inventory and the `talos mcp trust/test` and `hook trust/dry-run` facades both read it: before, the facades
   pinned the declaration alone while the inventory pinned it with the project scripts it runs, so trusting a resource that runs a
   project script always failed (MCP_TRUST_INVALIDATED / HOOK_TRUST_INVALIDATED). The desktop aligns its registry to the same rule. */
export type SemanticContent={content:string;beforeScriptsContent?:string};
export async function hookSemanticContent(workspace:WorkspaceIdentity,row:{eventi:readonly string[];comando:string}):Promise<SemanticContent>{
  const scripts=await referencedScripts(workspace,hookCommandTokens(row.comando));const before=JSON.stringify({eventi:row.eventi,comando:row.comando});
  return scripts.length?{content:JSON.stringify({eventi:row.eventi,comando:row.comando,scripts}),beforeScriptsContent:before}:{content:before};
}
export async function mcpSemanticContent(workspace:WorkspaceIdentity,row:{comando:string;argomenti?:readonly string[];allowlist:readonly string[]}):Promise<SemanticContent>{
  const args=row.argomenti??[];const scripts=await referencedScripts(workspace,[row.comando,...args]);const before=JSON.stringify({comando:row.comando,argomenti:args,allowlist:row.allowlist});
  return scripts.length?{content:JSON.stringify({comando:row.comando,argomenti:args,allowlist:row.allowlist,scripts}),beforeScriptsContent:before}:{content:before};
}
