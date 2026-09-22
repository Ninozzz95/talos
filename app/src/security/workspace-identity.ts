import {createHash} from 'node:crypto';
import {lstat,realpath} from 'node:fs/promises';
import path from 'node:path';
import {normalizeProjectRoot} from '../paths.ts';

export type WorkspaceIdentity={
  requestedRoot:string;
  canonicalRoot:string;
  gitRoot:string|null;
  /**
   * True only when at least two folders on the chain from the project folder up to the filesystem root, the project
   * folder included, have their own `.git` entry: the repository enclosing the project (`gitRoot`) sits inside another
   * repository. So a repository inside a repository is true, and so is a plain folder inside such a pair; a plain folder
   * inside a single repository is false. The walk never descends, so a project that CONTAINS a repository is false.
   */
  nestedRepository:boolean;
  identityHash:string;
};

/** A repository that lives strictly inside the project and holds at least one of its executable or instruction resources. */
export type NestedRepository={
  /** Posix-style path of the repository root, relative to the workspace canonical root. */
  relativePath:string;
  root:string;
  /** Posix-style relative paths of the project resources that fall inside it, sorted. */
  resources:string[];
};

async function exists(pathname:string):Promise<boolean>{
  try{await lstat(pathname);return true;}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return false;throw error;}
}

function inside(root:string,candidate:string):boolean{
  const relative=path.relative(root,candidate);
  return relative===''||(!relative.startsWith(`..${path.sep}`)&&relative!=='..'&&!path.isAbsolute(relative));
}

function strictlyInside(root:string,candidate:string):boolean{
  return candidate!==root&&inside(root,candidate);
}

function canonicalWorkspaceCandidate(workspace:WorkspaceIdentity,candidate:string):string{
  const resolved=path.resolve(candidate);
  if(!inside(workspace.requestedRoot,resolved))return resolved;
  const relative=path.relative(workspace.requestedRoot,resolved);
  return path.resolve(workspace.canonicalRoot,relative);
}

export function isPathInsideWorkspace(workspace:WorkspaceIdentity,candidate:string):boolean{
  return inside(workspace.canonicalRoot,canonicalWorkspaceCandidate(workspace,candidate));
}

/** Resolves an existing candidate through the filesystem and accepts it only when the real target stays inside the canonical workspace. */
export async function resolvePathInsideWorkspace(workspace:WorkspaceIdentity,candidate:string):Promise<string|null>{
  const resolved=path.resolve(candidate);
  if(!inside(workspace.requestedRoot,resolved)&&!inside(workspace.canonicalRoot,resolved))return null;
  let canonical:string;try{canonical=await realpath(resolved);}catch{return null;}
  return inside(workspace.canonicalRoot,canonical)?canonical:null;
}

/**
 * Innermost repository root strictly between the workspace root and the given resource, or null when the
 * resource is covered by the workspace's own repository. Every comparison happens on paths already rooted at
 * `canonicalRoot`, which `realpath` has collapsed, so short 8.3 names, the `\\?\` prefix, the UNC form and
 * case differences are all resolved before this walk starts.
 */
async function innerRepositoryRoot(canonicalRoot:string,resource:string):Promise<string|null>{
  let cursor=path.dirname(resource);
  while(strictlyInside(canonicalRoot,cursor)){
    if(await exists(path.join(cursor,'.git')))return cursor;
    const parent=path.dirname(cursor);
    if(parent===cursor)break;
    cursor=parent;
  }
  return null;
}

/**
 * Groups the project's resources by the repository boundary they sit behind. An empty result means every
 * resource belongs to the project's own repository, which is the common case and must stay indistinguishable
 * from the behaviour before this function existed.
 */
export async function findNestedRepositories(workspace:WorkspaceIdentity,resourcePaths:readonly string[]):Promise<NestedRepository[]>{
  const found=new Map<string,NestedRepository>();
  for(const relativePath of [...resourcePaths].sort()){
    const absolute=path.resolve(workspace.canonicalRoot,...relativePath.split('/'));
    if(!strictlyInside(workspace.canonicalRoot,absolute))continue;
    const root=await innerRepositoryRoot(workspace.canonicalRoot,absolute);
    if(root===null)continue;
    const key=path.relative(workspace.canonicalRoot,root).split(path.sep).join('/');
    const entry=found.get(key)??{relativePath:key,root,resources:[]};
    entry.resources.push(relativePath);
    found.set(key,entry);
  }
  return[...found.values()].sort((left,right)=>left.relativePath.localeCompare(right.relativePath));
}

export async function resolveWorkspaceIdentity({projectRoot}:{projectRoot:string}):Promise<WorkspaceIdentity>{
  const requestedRoot=path.resolve(projectRoot);
  const canonicalRoot=await realpath(requestedRoot);
  const repositoryRoots:string[]=[];
  let cursor=canonicalRoot;
  for(;;){
    if(await exists(path.join(cursor,'.git')))repositoryRoots.push(cursor);
    const parent=path.dirname(cursor);
    if(parent===cursor)break;
    cursor=parent;
  }
  const normalized=normalizeProjectRoot(canonicalRoot);
  const identityHash=createHash('sha256').update(`talos-workspace-v1\0${normalized}`).digest('hex');
  return{requestedRoot,canonicalRoot,gitRoot:repositoryRoots[0]??null,nestedRepository:repositoryRoots.length>1,identityHash};
}
