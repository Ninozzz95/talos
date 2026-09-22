import {randomUUID} from 'node:crypto';
import {lstatSync,readlinkSync,realpathSync} from 'node:fs';
import {createRequire} from 'node:module';
import {basename,dirname,isAbsolute,join,parse,relative,resolve,sep} from 'node:path';
import type {KeyringAdapter} from './store.ts';

export type KeyringEntryConstructor=new(service:string,account:string)=>{getPassword():string|null;setPassword(value:string):unknown;deletePassword():unknown};

/*
 * ⛔⛔⛔ WHY THE APPROVED-ROOTS GUARD EXISTS — read for B1 slice 19. The file arrived whole with the gold
 * baseline (7e5b048b, "restore verified gold baseline"), and no commit records the reason, so it is read
 * from the code, from its test (a fake module in an ANCESTOR `node_modules` must be refused) and from
 * this host:
 *
 * - Node's resolution does not stop at TALOS's own folders. From `harness-ui/package.json` it walks every
 *   ancestor `node_modules` up to the drive root, then `~/.node_modules`, `~/.node_libraries` and
 *   `<prefix>/lib/node`.
 * - On Windows the drive root lets any signed-in account create a folder (`icacls C:\` on this host:
 *   `NT AUTHORITY\Authenticated Users:(AD)`, and Modify on what they create). Anyone with a local account
 *   can therefore create `C:\node_modules`.
 * - `@napi-rs/keyring` is native code that is handed every provider key TALOS stores. Loaded from such a
 *   folder, it would run with the owner's rights and could read or send the keys anywhere.
 *
 * On this host that is what happened, harmlessly: `C:\node_modules` is a junction into another
 * checkout's `harness-ui\node_modules`, and a worktree without `harness-ui\node_modules` resolved the
 * keyring there. The guard refused it, correctly; `doctor` just could not say so.
 *
 * ⛔ THE CURE: the module must be resolvable INSIDE the approved roots.
 * - Installed: `cli/scripts/stage-windows.mjs` copies the dependency trees to `app/node_modules` and
 *   `app/vendor/harness-ui/node_modules`, both approved (read in code, not staged).
 * - CI: `npm --prefix harness-ui ci`, inside the checkout.
 * - Development: a `harness-ui\node_modules` inside the checkout — a real install, or ONE junction like the
 *   `cli\node_modules` every worktree here already has. Node reports the REAL path behind a junction, so
 *   the lexical roots alone refuse even that.
 *
 * ⛔⛔ Round 2, after adversarial review: "the real path of an approved root is approved" was too wide. A
 * link at the root can be trusted as far as whoever placed it, but not further: the reviewer loaded an
 * attacker module through a second link someone else could re-point (A2), through a junction into the real
 * `C:\node_modules` (A3), into an ancestor folder (E), and into the drive root itself (E2). A real path is
 * approved now only when ALL of these hold:
 *  1. the approved root is at most a single link, and its target is not a link and not below one — checked
 *     as realpath(target) equal to the target, which fails for both;
 *  2. the target is not a drive root;
 *  3. the target is not an ancestor of the checkout;
 *  4. the target is not inside a `node_modules` folder of an ancestor of the checkout — the folders Node's
 *     own lookup reaches, and exactly what `C:\node_modules` is; without this, A3 passes 1-3 on any host
 *     where that folder is a plain directory instead of a junction;
 *  5. the module lies under `<target>\@napi-rs\keyring\`.
 * ⛔ The verdict is reached BEFORE anything is loaded: a refused module never runs a line of code.
 * ⛔ What this does NOT judge: who may write to the target. A junction to a folder other accounts can write
 *   into (a shared temporary folder, another drive's subfolder) passes when it satisfies 1-5. The guard
 *   reads no ACLs.
 * ⛔ REFUSED as a design: recognising a junction ABOVE the checkout because its target looks like a TALOS
 *   location. Whoever creates `C:\node_modules` chooses where it points.
 */
function inside(root:string,candidate:string){
  const rel=relative(resolve(root),resolve(candidate));
  return rel===''||(!rel.startsWith(`..${sep}`)&&rel!=='..'&&!isAbsolute(rel));
}
function strictlyInside(root:string,candidate:string){return inside(root,candidate)&&relative(resolve(root),resolve(candidate))!=='';}
function samePath(a:string,b:string){return relative(resolve(a),resolve(b))==='';}

function approvedModuleRoots(repoRoot:string){
  const roots=[join(repoRoot,'harness-ui','node_modules'),join(repoRoot,'node_modules')];
  if(basename(repoRoot).toLowerCase()==='vendor')roots.push(join(dirname(repoRoot),'node_modules'));
  return roots;
}

/** Every folder above the checkout, nearest first, up to the drive root. */
function ancestorsOf(path:string){
  const out:string[]=[];
  let current=dirname(resolve(path));
  for(;;){out.push(current);const next=dirname(current);if(next===current)break;current=next;}
  return out;
}

type LinkStat={isSymbolicLink():boolean;isDirectory():boolean};
/** Injectable for tests only: production uses Node's own resolution from TALOS's harness package and the real filesystem. */
export type KeyringLoaderDeps={
  resolve?:(request:string)=>string;
  load?:(file:string)=>unknown;
  realpath?:(path:string)=>string;
  lstat?:(path:string)=>LinkStat;
  readlink?:(path:string)=>string;
};
export type KeyringLoad=
  |{ok:true;Entry:KeyringEntryConstructor;location:string}
  |{ok:false;reason:'module-missing';approvedRoots:string[]}
  |{ok:false;reason:'outside-approved-roots';location:string;approvedRoots:string[]}
  |{ok:false;reason:'load-failed';location?:string;detail:string}
  |{ok:false;reason:'invalid-module';location:string};
export type KeyringProblem=Exclude<KeyringLoad,{ok:true}>;

/** One line, bounded: an error's later lines are stack frames, and doctor prints one line per check. */
function firstLine(error:unknown){
  const text=error instanceof Error?error.message:String(error);
  return (text.split(/\r?\n/u)[0]??'').slice(0,300);
}

/**
 * The keyring folder a single link at an approved root may stand for, or null. Rules 1-4 of the block
 * above; rule 5 is the caller's containment check against the folder returned here.
 */
function linkedKeyringFolder(root:string,repoRoot:string,fs:{lstat:(p:string)=>LinkStat;readlink:(p:string)=>string;realpath:(p:string)=>string}):string|null{
  try{
    if(!fs.lstat(root).isSymbolicLink())return null;
    const target=resolve(dirname(root),fs.readlink(root));
    if(!fs.lstat(target).isDirectory())return null;
    const real=fs.realpath(target);
    if(!samePath(real,target))return null;                                                /* 1 */
    if(samePath(parse(real).root,real))return null;                                       /* 2 */
    if(inside(real,repoRoot))return null;                                                 /* 3 */
    if(ancestorsOf(repoRoot).some(ancestor=>inside(join(ancestor,'node_modules'),real)))return null; /* 4 */
    return join(real,'@napi-rs','keyring');
  }catch{return null;}
}

export function loadTalosSystemKeyring(repoRoot:string,deps:KeyringLoaderDeps={}):KeyringLoad{
  /* Created on first use and inside the try below: a repoRoot Node refuses as an anchor is a reason, never a throw. */
  let requireFromTalos:NodeJS.Require|undefined;
  const talosRequire=()=>requireFromTalos??=createRequire(join(repoRoot,'harness-ui','package.json'));
  const resolveModule=deps.resolve??((request:string)=>talosRequire().resolve(request));
  const loadModule=deps.load??((file:string)=>talosRequire()(file));
  const fs={
    lstat:deps.lstat??((path:string)=>lstatSync(path)),
    readlink:deps.readlink??((path:string)=>readlinkSync(path)),
    realpath:deps.realpath??((path:string)=>realpathSync(path)),
  };
  const roots=approvedModuleRoots(repoRoot);
  let location:string;
  try{location=resolveModule('@napi-rs/keyring');}
  catch(error){
    if((error as {code?:unknown})?.code==='MODULE_NOT_FOUND')return{ok:false,reason:'module-missing',approvedRoots:roots};
    return{ok:false,reason:'load-failed',detail:firstLine(error)};
  }
  const lexical=roots.some(root=>inside(root,location));
  const linked=roots.map(root=>linkedKeyringFolder(root,repoRoot,fs)).filter((folder):folder is string=>folder!==null);
  if(!lexical&&!linked.some(folder=>strictlyInside(folder,location)))return{ok:false,reason:'outside-approved-roots',location,approvedRoots:roots}; /* 5 */
  let mod:{Entry?:unknown};
  try{mod=loadModule(location) as {Entry?:unknown};}
  catch(error){return{ok:false,reason:'load-failed',location,detail:firstLine(error)};}
  return typeof mod?.Entry==='function'?{ok:true,Entry:mod.Entry as KeyringEntryConstructor,location}:{ok:false,reason:'invalid-module',location};
}

export function keyringModuleAvailable(repoRoot:string,deps:KeyringLoaderDeps={}){return loadTalosSystemKeyring(repoRoot,deps).ok;}

export type KeyringProbeOutcome={ok:true}|{ok:false;stage:'write'|'read';detail:string}|{ok:false;stage:'mismatch'};

export async function diagnoseKeyringProbe(keyring:KeyringAdapter,account=randomUUID()):Promise<KeyringProbeOutcome>{
  const service='talos-cli-doctor';const value=`probe-${randomUUID()}`;
  try{
    try{await keyring.set(service,account,value);}
    catch(error){return{ok:false,stage:'write',detail:firstLine(error)};}
    let read:string|null;
    try{read=await keyring.get(service,account);}
    catch(error){return{ok:false,stage:'read',detail:firstLine(error)};}
    return read===value?{ok:true}:{ok:false,stage:'mismatch'};
  }
  finally{try{await keyring.remove(service,account);}catch{/* diagnostic cleanup is best effort */}}
}

export async function probeSystemKeyring(keyring:KeyringAdapter,account=randomUUID()):Promise<boolean>{return (await diagnoseKeyringProbe(keyring,account)).ok;}

/** ⛔ The only place these sentences are written: `doctor` prints them, and the next surface that needs the reason reuses them. */
export const KEYRING_TEXT={
  moduleMissing:(roots:readonly string[])=>`@napi-rs/keyring is not installed where TALOS loads it from (${roots.join('; ')})`,
  outsideApprovedRoots:(location:string,roots:readonly string[])=>`@napi-rs/keyring resolved outside the approved roots, at ${location}; TALOS loads it only from ${roots.join('; ')}`,
  loadFailed:(location:string|undefined,detail:string)=>location===undefined?`@napi-rs/keyring could not be resolved: ${detail}`:`@napi-rs/keyring at ${location} failed to load: ${detail}`,
  invalidModule:(location:string)=>`@napi-rs/keyring at ${location} does not export Entry`,
  probeWriteFailed:(detail:string)=>`the keyring probe write failed: ${detail}`,
  probeReadFailed:(detail:string)=>`the keyring probe read failed: ${detail}`,
  probeMismatch:'the keyring probe did not read back the value it wrote',
} as const;

export function describeKeyringProblem(problem:KeyringProblem):string{
  switch(problem.reason){
    case'module-missing':return KEYRING_TEXT.moduleMissing(problem.approvedRoots);
    case'outside-approved-roots':return KEYRING_TEXT.outsideApprovedRoots(problem.location,problem.approvedRoots);
    case'load-failed':return KEYRING_TEXT.loadFailed(problem.location,problem.detail);
    case'invalid-module':return KEYRING_TEXT.invalidModule(problem.location);
  }
}

export function describeKeyringProbeFailure(outcome:Exclude<KeyringProbeOutcome,{ok:true}>):string{
  if(outcome.stage==='mismatch')return KEYRING_TEXT.probeMismatch;
  return outcome.stage==='write'?KEYRING_TEXT.probeWriteFailed(outcome.detail):KEYRING_TEXT.probeReadFailed(outcome.detail);
}

export function systemKeyringAdapter(Entry:KeyringEntryConstructor):KeyringAdapter{
  return{
    get(service,account){try{return new Entry(service,account).getPassword()||null;}catch{return null;}},
    set(service,account,value){new Entry(service,account).setPassword(value);},
    remove(service,account){try{new Entry(service,account).deletePassword();}catch{/* idempotent removal */}},
  };
}

export function createTalosSystemKeyring(repoRoot:string,deps:KeyringLoaderDeps={}):KeyringAdapter|null{
  const loaded=loadTalosSystemKeyring(repoRoot,deps);
  return loaded.ok?systemKeyringAdapter(loaded.Entry):null;
}
