import {lstat,readdir,readFile} from 'node:fs/promises';
import {realpathTolerant as realpath} from './real-path.ts';
import path from 'node:path';
import {fingerprintExecutableResource,fingerprintExecutableResourceContent,type ExecutableResourceIdentity} from './project-trust.ts';
import {isPathInsideWorkspace,type WorkspaceIdentity} from './workspace-identity.ts';
import {PROJECT_CONFIG_FILES} from './project-config-positions.ts';
import {findTalosRepoRoot,importTalosModule} from '../runtime/repo.ts';

// A plugin package contributes EVERY file it carries, not just its manifest: a manifest only
// inventory lets the code an approval covered be replaced underneath that approval. Deciding which
// extensions are "really" executable would be a judgement about safety, which this inventory does
// not make - it only decides what trust must be able to NOTICE.
// The walk is bounded so a package carrying node_modules cannot turn a trust check into a stall,
// and the bound fails CLOSED: truncating the walk would reopen the same hole somewhere deeper.
// Measured on Windows 11 / Node 24.18, warm cache: 10 000 files = ~98 ms walk + ~370 ms fingerprint
// at concurrency 32. Fingerprinting the same set with an unbounded Promise.all dies with EMFILE.
export const PLUGIN_PACKAGE_MAX_FILES=10_000;
const FINGERPRINT_CONCURRENCY=32;
/** The kernel's background-command logs (talosHarness.mjs `SFONDO_DIR`): runtime state inside `.talos/`, not a project resource. */
export const RUNTIME_STATE_PREFIX='.talos/processi-sfondo/';

type Kind=ExecutableResourceIdentity['kind'];
type Candidate={kind:Kind;id:string;path:string;semanticContent?:string;legacyFingerprint?:string;beforeScriptsContent?:string};
async function entryKind(pathname:string):Promise<'file'|'directory'|'symlink'|null>{try{const value=await lstat(pathname);if(value.isSymbolicLink())return'symlink';if(value.isFile())return'file';if(value.isDirectory())return'directory';return null;}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw error;}}
function fail(code:string):never{throw Object.assign(new Error(code),{code});}
function relativeId(root:string,pathname:string){return path.relative(root,pathname).split(path.sep).join('/');}
async function walkFiles(root:string,accept:(pathname:string)=>boolean):Promise<string[]>{
  const rootKind=await entryKind(root);if(rootKind===null)return[];if(rootKind==='symlink')fail('RESOURCE_DIRECTORY_SYMLINK_UNSUPPORTED');if(rootKind!=='directory')return[];
  const files:string[]=[];
  async function walk(directory:string){for(const entry of await readdir(directory,{withFileTypes:true})){const pathname=path.join(directory,entry.name);if(entry.isSymbolicLink()){if(accept(pathname))files.push(pathname);else fail('RESOURCE_DIRECTORY_SYMLINK_UNSUPPORTED');}else if(entry.isDirectory())await walk(pathname);else if(entry.isFile()&&accept(pathname))files.push(pathname);}}
  await walk(root);return files.sort();
}
// Every link is refused rather than followed or skipped: following one lets the walk leave the
// package, skipping one lets a file the package can load stay outside the fingerprint. Both
// directions are the same hole, so neither is tolerated.
async function walkPackageFiles(packageRoot:string,limit:number):Promise<string[]>{
  const files:string[]=[];
  async function walk(directory:string){for(const entry of await readdir(directory,{withFileTypes:true})){const pathname=path.join(directory,entry.name);if(entry.isSymbolicLink())fail('RESOURCE_DIRECTORY_SYMLINK_UNSUPPORTED');else if(entry.isDirectory())await walk(pathname);else if(entry.isFile()){if(files.length>=limit)fail('RESOURCE_PACKAGE_TOO_LARGE');files.push(pathname);}}}
  await walk(packageRoot);return files.sort();
}
async function mapBounded<T,R>(items:readonly T[],limit:number,handler:(item:T)=>Promise<R>):Promise<R[]>{
  const results=new Array<R>(items.length);let cursor=0;
  await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{for(;;){const index=cursor++;if(index>=items.length)return;results[index]=await handler(items[index]!);}}));
  return results;
}
async function fixedFile(root:string,relative:string,kind:Kind,candidates:Candidate[]){const pathname=path.join(root,relative);const value=await entryKind(pathname);if(value==='file'||value==='symlink')candidates.push({kind,id:relative,path:pathname});}
async function safeConfigText(workspace:WorkspaceIdentity,pathname:string){
  const canonical=await realpath(pathname);if(!isPathInsideWorkspace(workspace,canonical))fail('RESOURCE_OUTSIDE_WORKSPACE');return readFile(canonical,'utf8');
}
function uniqueId(value:unknown,seen:Set<string>){if(typeof value!=='string'||value.length===0)fail('RESOURCE_CONFIG_MALFORMED');if(seen.has(value))fail('RESOURCE_ID_DUPLICATE');seen.add(value);return value;}
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
/* ⛔ 20/10/2026 (owner 17/10/2026 «Curare come gli hook, insieme alla CLI» and «Stessa regola, una nuova fiducia»): the rule above
   lives in ONE place, the shared kernel module harness-ui/src/script-del-progetto.mjs, which the desktop ported line by line from this
   file's 0.6.9 copy, so the CLI and the desktop can never pin different scripts again. The fingerprints are the ones this file computed,
   except the owner's choice 1 of 17/10 (module header): a file reached through a junction or link that points OUTSIDE the project is
   pinned under the name the command line uses, and a `main` of such a folder that climbs back into the project pins that project file.
   test/security/shared-script-rule.test.ts proves both against the old copy, byte for byte. The CLI never imports harness-ui statically
   (scripts/bundle.mjs: the kernel stays outside), so the module is loaded by path once per process; the CLI hands it its sandbox-tolerant
   realpath (real-path.ts) and its WorkspaceIdentity, and keeps the module's process hash memory, which changes how often a file is read,
   never a fingerprint. */
export const MAX_SCRIPT_FOLDER_FILES=10_000;
type ScriptRow={path:string;sha256:string};
type RuleOptions={maxFolderFiles?:number;realpath?:(pathname:string)=>Promise<string>};
type SharedScriptRule={
  MAX_SCRIPT_FOLDER_FILES:number;
  referencedScripts(workspace:WorkspaceIdentity,tokens:readonly string[],options?:RuleOptions):Promise<ScriptRow[]>;
  hookSemanticContent(workspace:WorkspaceIdentity,row:{eventi:readonly string[];comando:string},options?:RuleOptions):Promise<SemanticContent>;
  mcpSemanticContent(workspace:WorkspaceIdentity,row:{comando:string;argomenti:readonly string[];allowlist:readonly string[]},options?:RuleOptions):Promise<SemanticContent>;
};
let sharedRule:Promise<SharedScriptRule>|null=null;
/* a failed load is not remembered: the next trust check tries again instead of failing for the rest of the process */
function scriptRule():Promise<SharedScriptRule>{return sharedRule??=(importTalosModule(findTalosRepoRoot(),'script-del-progetto.mjs') as Promise<SharedScriptRule>).catch(error=>{sharedRule=null;throw error;});}
/** process-policy.mjs parseProcessCommand, as the kernel reads a hook's command (a command it would refuse names nothing).
    It stays here only because it is synchronous and the kernel module loads asynchronously; the content pinned for a hook is the
    shared module's own reading (hookSemanticContent below), and shared-script-rule.test.ts holds the two readings equal. */
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
/** Every project file a command line runs, by its digest (the shared rule, see the comments above). */
export async function referencedScripts(workspace:WorkspaceIdentity,tokens:readonly string[],{maxFolderFiles=MAX_SCRIPT_FOLDER_FILES}:{maxFolderFiles?:number}={}):Promise<{path:string;sha256:string}[]>{
  return(await scriptRule()).referencedScripts(workspace,tokens,{maxFolderFiles,realpath});
}
/* 0.6.9 (stress test of 0.6.8, F-C-001, S2): the ONE place where what a hook or an MCP server runs is turned into the content that
   is pinned. The project inventory and the `talos mcp trust/test` and `hook trust/dry-run` facades both read it: before, the facades
   pinned the declaration alone while the inventory pinned it with the project scripts it runs, so trusting a resource that runs a
   project script always failed (MCP_TRUST_INVALIDATED / HOOK_TRUST_INVALIDATED). Since 20/10/2026 the desktop reads the same module. */
export type SemanticContent={content:string;beforeScriptsContent?:string};
export async function hookSemanticContent(workspace:WorkspaceIdentity,row:{eventi:readonly string[];comando:string}):Promise<SemanticContent>{
  return(await scriptRule()).hookSemanticContent(workspace,{eventi:row.eventi,comando:row.comando},{realpath});
}
export async function mcpSemanticContent(workspace:WorkspaceIdentity,row:{comando:string;argomenti?:readonly string[];allowlist:readonly string[]}):Promise<SemanticContent>{
  return(await scriptRule()).mcpSemanticContent(workspace,{comando:row.comando,argomenti:row.argomenti??[],allowlist:row.allowlist},{realpath});
}
/* F-H-001: every place the kernel reads (PROJECT_CONFIG_FILES, in its order); an id already found in an earlier file is the
   kernel's, so a later file's entry with that id is not a resource. Ids stay unique inside one file, as before. */
async function hookCandidates(workspace:WorkspaceIdentity,candidates:Candidate[]){
  const taken=new Set<string>();
  for(const relative of PROJECT_CONFIG_FILES.hooks){
    const pathname=path.join(workspace.canonicalRoot,relative);const kind=await entryKind(pathname);if(kind===null)continue;if(kind!=='file'&&kind!=='symlink')fail('RESOURCE_CONFIG_MALFORMED');
    let data:any;try{data=JSON.parse(await safeConfigText(workspace,pathname));}catch(error){if((error as any)?.code==='RESOURCE_OUTSIDE_WORKSPACE')throw error;fail('RESOURCE_CONFIG_MALFORMED');}
    if(!data||!Array.isArray(data.hooks))fail('RESOURCE_CONFIG_MALFORMED');const seen=new Set<string>();const legacyFingerprint=(await fingerprintExecutableResource({workspace,kind:'hook',id:relative,path:pathname})).fingerprint;
    for(const row of data.hooks){const id=uniqueId(row?.id,seen);if(typeof row?.comando!=='string'||!row.comando||!Array.isArray(row?.eventi)||!row.eventi.length||!row.eventi.every((event:unknown)=>typeof event==='string'))fail('RESOURCE_CONFIG_MALFORMED');if(taken.has(id))continue;taken.add(id);const semantic=await hookSemanticContent(workspace,row);candidates.push({kind:'hook',id,path:pathname,semanticContent:semantic.content,legacyFingerprint,...(semantic.beforeScriptsContent!==undefined?{beforeScriptsContent:semantic.beforeScriptsContent}:{})});}
  }
}
async function mcpCandidates(workspace:WorkspaceIdentity,candidates:Candidate[]){
  const taken=new Set<string>();
  for(const relative of PROJECT_CONFIG_FILES.mcp){
    const pathname=path.join(workspace.canonicalRoot,relative);const kind=await entryKind(pathname);if(kind===null)continue;if(kind!=='file'&&kind!=='symlink')fail('RESOURCE_CONFIG_MALFORMED');
    let data:any;try{data=JSON.parse(await safeConfigText(workspace,pathname));}catch(error){if((error as any)?.code==='RESOURCE_OUTSIDE_WORKSPACE')throw error;fail('RESOURCE_CONFIG_MALFORMED');}
    if(!data||!Array.isArray(data.server))fail('RESOURCE_CONFIG_MALFORMED');const seen=new Set<string>();const legacyFingerprint=(await fingerprintExecutableResource({workspace,kind:'mcp',id:relative,path:pathname})).fingerprint;
    for(const row of data.server){const id=uniqueId(row?.id,seen);const args=row?.argomenti??[];if(typeof row?.comando!=='string'||!row.comando||!Array.isArray(args)||!args.every((arg:unknown)=>typeof arg==='string')||!Array.isArray(row?.allowlist)||!row.allowlist.length||!row.allowlist.every((tool:unknown)=>typeof tool==='string'&&tool.length>0))fail('RESOURCE_CONFIG_MALFORMED');if(taken.has(id))continue;taken.add(id);const semantic=await mcpSemanticContent(workspace,{comando:row.comando,argomenti:args,allowlist:row.allowlist});candidates.push({kind:'mcp',id,path:pathname,semanticContent:semantic.content,legacyFingerprint,...(semantic.beforeScriptsContent!==undefined?{beforeScriptsContent:semantic.beforeScriptsContent}:{})});}
  }
}

export async function inventoryProjectResources(workspace:WorkspaceIdentity,options?:{maxPackageFiles?:number}):Promise<ExecutableResourceIdentity[]>{
  const packageLimit=Math.max(1,Math.min(options?.maxPackageFiles??PLUGIN_PACKAGE_MAX_FILES,PLUGIN_PACKAGE_MAX_FILES));
  const root=workspace.canonicalRoot;const candidates:Candidate[]=[];
  for(const relative of ['.talos-cli/config.json','AGENTS.md','CLAUDE.md','TALOS.md'])await fixedFile(root,relative,'context',candidates);
  await hookCandidates(workspace,candidates);await mcpCandidates(workspace,candidates);
  const talosPath=path.join(root,'.talos');const talosKind=await entryKind(talosPath);
  if(talosKind==='file'||talosKind==='symlink')candidates.push({kind:'context',id:'.talos',path:talosPath});
  /* F-ENG-1 (08/10/2026): `.talos/processi-sfondo/` holds the logs the kernel itself writes for background commands (talosHarness.mjs SFONDO_DIR); runtime
     state, never read as configuration. Counting it made TALOS's own log drop the project's trust (PROJECT_TRUST_INVALIDATED on every later resume). */
  else if(talosKind==='directory')for(const pathname of await walkFiles(talosPath,()=>true)){const id=relativeId(root,pathname);if(id.startsWith(RUNTIME_STATE_PREFIX))continue;candidates.push({kind:'context',id,path:pathname});}
  for(const pathname of await walkFiles(path.join(root,'.talos-cli','commands'),value=>value.toLowerCase().endsWith('.md')))candidates.push({kind:'command',id:relativeId(root,pathname),path:pathname});
  const pluginRoot=path.join(root,'.harness-ui-plugins');const pluginKind=await entryKind(pluginRoot);if(pluginKind==='symlink')fail('RESOURCE_DIRECTORY_SYMLINK_UNSUPPORTED');
  if(pluginKind==='directory')for(const entry of await readdir(pluginRoot,{withFileTypes:true})){if(entry.isSymbolicLink())fail('RESOURCE_DIRECTORY_SYMLINK_UNSUPPORTED');if(!entry.isDirectory())continue;for(const pathname of await walkPackageFiles(path.join(pluginRoot,entry.name),packageLimit))candidates.push({kind:'plugin',id:relativeId(root,pathname),path:pathname});}
  const resources=await mapBounded(candidates,FINGERPRINT_CONCURRENCY,candidate=>candidate.semanticContent!==undefined?fingerprintExecutableResourceContent({workspace,kind:candidate.kind,id:candidate.id,path:candidate.path,content:candidate.semanticContent,...(candidate.legacyFingerprint?{legacyFingerprint:candidate.legacyFingerprint}:{}),...(candidate.beforeScriptsContent!==undefined?{beforeScriptsContent:candidate.beforeScriptsContent}:{})}):fingerprintExecutableResource({workspace,kind:candidate.kind,id:candidate.id,path:candidate.path}));
  return resources.sort((left,right)=>left.relativePath.localeCompare(right.relativePath)||left.kind.localeCompare(right.kind)||left.id.localeCompare(right.id));
}
