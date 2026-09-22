import {lstat,readdir,readFile,realpath} from 'node:fs/promises';
import path from 'node:path';
import {fingerprintExecutableResource,fingerprintExecutableResourceContent,type ExecutableResourceIdentity} from './project-trust.ts';
import {isPathInsideWorkspace,type WorkspaceIdentity} from './workspace-identity.ts';

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

type Kind=ExecutableResourceIdentity['kind'];
type Candidate={kind:Kind;id:string;path:string;semanticContent?:string;legacyFingerprint?:string};
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
async function hookCandidates(workspace:WorkspaceIdentity,candidates:Candidate[]){
  const pathname=path.join(workspace.canonicalRoot,'.harness-ui-hooks.json');const kind=await entryKind(pathname);if(kind===null)return;if(kind!=='file'&&kind!=='symlink')fail('RESOURCE_CONFIG_MALFORMED');
  let data:any;try{data=JSON.parse(await safeConfigText(workspace,pathname));}catch(error){if((error as any)?.code==='RESOURCE_OUTSIDE_WORKSPACE')throw error;fail('RESOURCE_CONFIG_MALFORMED');}
  if(!data||!Array.isArray(data.hooks))fail('RESOURCE_CONFIG_MALFORMED');const seen=new Set<string>();const legacyFingerprint=(await fingerprintExecutableResource({workspace,kind:'hook',id:'.harness-ui-hooks.json',path:pathname})).fingerprint;
  for(const row of data.hooks){const id=uniqueId(row?.id,seen);if(typeof row?.comando!=='string'||!row.comando||!Array.isArray(row?.eventi)||!row.eventi.length||!row.eventi.every((event:unknown)=>typeof event==='string'))fail('RESOURCE_CONFIG_MALFORMED');candidates.push({kind:'hook',id,path:pathname,semanticContent:JSON.stringify({eventi:row.eventi,comando:row.comando}),legacyFingerprint});}
}
async function mcpCandidates(workspace:WorkspaceIdentity,candidates:Candidate[]){
  const pathname=path.join(workspace.canonicalRoot,'.harness-ui-mcp.json');const kind=await entryKind(pathname);if(kind===null)return;if(kind!=='file'&&kind!=='symlink')fail('RESOURCE_CONFIG_MALFORMED');
  let data:any;try{data=JSON.parse(await safeConfigText(workspace,pathname));}catch(error){if((error as any)?.code==='RESOURCE_OUTSIDE_WORKSPACE')throw error;fail('RESOURCE_CONFIG_MALFORMED');}
  if(!data||!Array.isArray(data.server))fail('RESOURCE_CONFIG_MALFORMED');const seen=new Set<string>();const legacyFingerprint=(await fingerprintExecutableResource({workspace,kind:'mcp',id:'.harness-ui-mcp.json',path:pathname})).fingerprint;
  for(const row of data.server){const id=uniqueId(row?.id,seen);const args=row?.argomenti??[];if(typeof row?.comando!=='string'||!row.comando||!Array.isArray(args)||!args.every((arg:unknown)=>typeof arg==='string')||!Array.isArray(row?.allowlist)||!row.allowlist.length||!row.allowlist.every((tool:unknown)=>typeof tool==='string'&&tool.length>0))fail('RESOURCE_CONFIG_MALFORMED');candidates.push({kind:'mcp',id,path:pathname,semanticContent:JSON.stringify({comando:row.comando,argomenti:args,allowlist:row.allowlist}),legacyFingerprint});}
}

export async function inventoryProjectResources(workspace:WorkspaceIdentity,options?:{maxPackageFiles?:number}):Promise<ExecutableResourceIdentity[]>{
  const packageLimit=Math.max(1,Math.min(options?.maxPackageFiles??PLUGIN_PACKAGE_MAX_FILES,PLUGIN_PACKAGE_MAX_FILES));
  const root=workspace.canonicalRoot;const candidates:Candidate[]=[];
  for(const relative of ['.talos-cli/config.json','AGENTS.md','CLAUDE.md','TALOS.md'])await fixedFile(root,relative,'context',candidates);
  await hookCandidates(workspace,candidates);await mcpCandidates(workspace,candidates);
  const talosPath=path.join(root,'.talos');const talosKind=await entryKind(talosPath);
  if(talosKind==='file'||talosKind==='symlink')candidates.push({kind:'context',id:'.talos',path:talosPath});
  else if(talosKind==='directory')for(const pathname of await walkFiles(talosPath,()=>true))candidates.push({kind:'context',id:relativeId(root,pathname),path:pathname});
  for(const pathname of await walkFiles(path.join(root,'.talos-cli','commands'),value=>value.toLowerCase().endsWith('.md')))candidates.push({kind:'command',id:relativeId(root,pathname),path:pathname});
  const pluginRoot=path.join(root,'.harness-ui-plugins');const pluginKind=await entryKind(pluginRoot);if(pluginKind==='symlink')fail('RESOURCE_DIRECTORY_SYMLINK_UNSUPPORTED');
  if(pluginKind==='directory')for(const entry of await readdir(pluginRoot,{withFileTypes:true})){if(entry.isSymbolicLink())fail('RESOURCE_DIRECTORY_SYMLINK_UNSUPPORTED');if(!entry.isDirectory())continue;for(const pathname of await walkPackageFiles(path.join(pluginRoot,entry.name),packageLimit))candidates.push({kind:'plugin',id:relativeId(root,pathname),path:pathname});}
  const resources=await mapBounded(candidates,FINGERPRINT_CONCURRENCY,candidate=>candidate.semanticContent!==undefined?fingerprintExecutableResourceContent({workspace,kind:candidate.kind,id:candidate.id,path:candidate.path,content:candidate.semanticContent,...(candidate.legacyFingerprint?{legacyFingerprint:candidate.legacyFingerprint}:{})}):fingerprintExecutableResource({workspace,kind:candidate.kind,id:candidate.id,path:candidate.path}));
  return resources.sort((left,right)=>left.relativePath.localeCompare(right.relativePath)||left.kind.localeCompare(right.kind)||left.id.localeCompare(right.id));
}
