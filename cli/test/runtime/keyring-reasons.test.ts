import assert from 'node:assert/strict';
import {realpathSync} from 'node:fs';
import {mkdir,mkdtemp,rm,symlink,unlink,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {join,parse,relative} from 'node:path';
import test,{after} from 'node:test';
import * as keyring from '../../src/provider/system-keyring.ts';

/*
 * B1 slice 19 — THE KEYRING WORKS OR SAYS WHY, AND THE APPROVED-ROOTS GUARD IS NOT WEAKENED.
 *
 * Every layout is temporary and every module is a FAKE with an in-memory Entry, placed so that Node's
 * resolution finds it before anything on the host (on this host `C:\node_modules` is a junction into
 * another checkout that holds the real `@napi-rs/keyring`). Nothing here can reach the real keyring.
 */
const layouts:string[]=[];
after(async()=>{for(const dir of layouts)await rm(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100});});
async function scratch(){const dir=await mkdtemp(join(tmpdir(),'talos-keyring-19-'));layouts.push(dir);return dir;}
async function talosCheckout(dir:string){
  await mkdir(join(dir,'harness-ui','src'),{recursive:true});
  await writeFile(join(dir,'harness-ui','package.json'),'{}');
  await writeFile(join(dir,'harness-ui','src','session-registry.mjs'),'export {};\n');
}
const MEMORY_ENTRY="const values=new Map();exports.Entry=class Entry{constructor(s,a){this.k=s+':'+a}getPassword(){return values.get(this.k)||null}setPassword(v){values.set(this.k,v)}deletePassword(){values.delete(this.k)}};";
async function fakeKeyring(nodeModules:string,body=MEMORY_ENTRY){
  const dir=join(nodeModules,'@napi-rs','keyring');
  await mkdir(dir,{recursive:true});
  await writeFile(join(dir,'package.json'),JSON.stringify({name:'@napi-rs/keyring',version:'1.3.0',main:'index.cjs'}));
  await writeFile(join(dir,'index.cjs'),body);
  return join(dir,'index.cjs');
}
/** Node's own answer for where TALOS's harness package would resolve the module: the oracle for `location`. */
function nodeResolves(repoRoot:string){return createRequire(join(repoRoot,'harness-ui','package.json')).resolve('@napi-rs/keyring');}

test('RED a junction placed AT an approved root is followed: that dependency folder is TALOS\'s own, wherever its bytes live',async()=>{
  const root=await scratch();
  const repo=join(root,'repo');await talosCheckout(repo);
  const installed=join(root,'installed-tree','node_modules');
  const index=await fakeKeyring(installed);
  await symlink(installed,join(repo,'harness-ui','node_modules'),'junction');
  assert.equal(nodeResolves(repo),realpathSync(index),'Node reports the real path behind the junction');
  const loaded=keyring.loadTalosSystemKeyring(repo);
  assert.equal(loaded.ok,true);
  assert.equal((loaded as {location:string}).location,realpathSync(index));
  assert.equal(keyring.keyringModuleAvailable(repo),true);
  const adapter=keyring.createTalosSystemKeyring(repo);
  assert.ok(adapter);
  await adapter.set('talos-cli-provider','openai','dummy-slice19');
  assert.equal(await adapter.get('talos-cli-provider','openai'),'dummy-slice19');
});

test('RED an ancestor junction into another TALOS checkout is still refused, and the refusal says where the module resolved',async()=>{
  const root=await scratch();
  const repo=join(root,'workspace','repo');await talosCheckout(repo);
  /* The host's shape: a `node_modules` ABOVE the checkout, junctioned into another checkout's own dependency folder. */
  const other=join(root,'other-checkout');await talosCheckout(other);
  const index=await fakeKeyring(join(other,'harness-ui','node_modules'));
  await symlink(join(other,'harness-ui','node_modules'),join(root,'workspace','node_modules'),'junction');
  const measured=nodeResolves(repo);
  assert.equal(measured,realpathSync(index),'Node would load the other checkout\'s module');
  const loaded=keyring.loadTalosSystemKeyring(repo) as any;
  assert.equal(loaded.ok,false);
  assert.equal(loaded.reason,'outside-approved-roots');
  assert.equal(loaded.location,measured);
  assert.ok(loaded.approvedRoots.includes(join(repo,'harness-ui','node_modules')));
  assert.ok(loaded.approvedRoots.includes(join(repo,'node_modules')));
  assert.equal(keyring.keyringModuleAvailable(repo),false);
  assert.equal(keyring.createTalosSystemKeyring(repo),null);
  const text=keyring.describeKeyringProblem(loaded);
  assert.ok(text.includes('outside the approved roots'),text);
  assert.ok(text.includes(measured),text);
});

test('RED a module Node cannot find anywhere is named as missing, never as outside the roots',async()=>{
  const root=await scratch();
  const repo=join(root,'repo');await talosCheckout(repo);
  let notFound:unknown;
  try{createRequire(join(repo,'harness-ui','package.json')).resolve('@talos-slice19/absent-module');}catch(error){notFound=error;}
  assert.equal((notFound as {code?:string})?.code,'MODULE_NOT_FOUND','oracle: the error Node really throws for an absent module');
  const loaded=keyring.loadTalosSystemKeyring(repo,{resolve:()=>{throw notFound;},load:()=>{throw new Error('must not load');}}) as any;
  assert.equal(loaded.ok,false);
  assert.equal(loaded.reason,'module-missing');
  const text=keyring.describeKeyringProblem(loaded);
  assert.ok(text.includes('not installed'),text);
  assert.ok(text.includes(join(repo,'harness-ui','node_modules')),text);
});

test('RED a module inside the roots that throws while loading is a load failure carrying its first line only',async()=>{
  const root=await scratch();
  const repo=join(root,'repo');await talosCheckout(repo);
  const index=await fakeKeyring(join(repo,'harness-ui','node_modules'),"throw new Error('Cannot find native binding (slice19 fake)\\nsecond line that must not reach doctor');");
  const loaded=keyring.loadTalosSystemKeyring(repo) as any;
  assert.equal(loaded.ok,false);
  assert.equal(loaded.reason,'load-failed');
  assert.equal(loaded.location,realpathSync(index));
  assert.equal(loaded.detail,'Cannot find native binding (slice19 fake)');
});

test('RED a module inside the roots without an Entry export is reported as invalid',async()=>{
  const root=await scratch();
  const repo=join(root,'repo');await talosCheckout(repo);
  const index=await fakeKeyring(join(repo,'harness-ui','node_modules'),'exports.notEntry=1;');
  const loaded=keyring.loadTalosSystemKeyring(repo) as any;
  assert.deepEqual({ok:loaded.ok,reason:loaded.reason,location:loaded.location},{ok:false,reason:'invalid-module',location:realpathSync(index)});
});

test('RED the probe names the stage that failed and always cleans up',async()=>{
  const removed:string[]=[];
  const failingWrite={set(){throw new Error('Platform secure storage failure (slice19 fake)\nstack line');},get(){return null;},remove(_s:string,a:string){removed.push(a);}};
  assert.deepEqual(await keyring.diagnoseKeyringProbe(failingWrite as any,'w'),{ok:false,stage:'write',detail:'Platform secure storage failure (slice19 fake)'});
  const failingRead={set(){},get(){throw new Error('read refused (slice19 fake)');},remove(_s:string,a:string){removed.push(a);}};
  assert.deepEqual(await keyring.diagnoseKeyringProbe(failingRead as any,'r'),{ok:false,stage:'read',detail:'read refused (slice19 fake)'});
  const wrongValue={set(){},get(){return 'another value';},remove(_s:string,a:string){removed.push(a);}};
  assert.deepEqual(await keyring.diagnoseKeyringProbe(wrongValue as any,'m'),{ok:false,stage:'mismatch'});
  const values=new Map<string,string>();
  const working={set(s:string,a:string,v:string){values.set(`${s}:${a}`,v);},get(s:string,a:string){return values.get(`${s}:${a}`)??null;},remove(s:string,a:string){removed.push(a);values.delete(`${s}:${a}`);}};
  assert.deepEqual(await keyring.diagnoseKeyringProbe(working as any,'ok'),{ok:true});
  assert.deepEqual(removed,['w','r','m','ok']);
  assert.equal(values.size,0);
});

test('a resolution that fails for another reason than absence is a load failure without an invented location',()=>{
  const broken=Object.assign(new Error('Invalid package config (slice19 fake)\nmore'),{code:'ERR_INVALID_PACKAGE_CONFIG'});
  const loaded=keyring.loadTalosSystemKeyring(join(tmpdir(),'talos-slice19-never-created'),{resolve:()=>{throw broken;},load:()=>{throw new Error('must not load');}}) as any;
  assert.deepEqual(loaded,{ok:false,reason:'load-failed',detail:'Invalid package config (slice19 fake)'});
  assert.equal(keyring.describeKeyringProblem(loaded),'@napi-rs/keyring could not be resolved: Invalid package config (slice19 fake)');
});

/*
 * ⛔⛔ Round 2, after adversarial review — THE REAL PATH OF AN APPROVED ROOT IS APPROVED ONLY WHEN
 * NOBODY ELSE CAN MOVE IT. Round 1 approved whatever a link at an approved root resolved to, and the
 * reviewer loaded an attacker module through it five ways. The rule decided by the coordinator: the
 * approved root is at most ONE link; its target is not a link and not below one, not a drive root, not
 * an ancestor of the checkout (nor a node_modules folder that Node's own lookup reaches from the
 * checkout); and the module lies under <target>\@napi-rs\keyring\.
 * Every verdict below is taken with a SPY loader: a refused module is never loaded, not even a fake.
 */
/** Node caches resolutions inside a process, so a re-pointed link is measured the way the reviewer did: in a fresh one. */
function freshNodeResolves(repoRoot:string){return execFileSync(process.execPath,['-e',"process.stdout.write(require('node:module').createRequire(process.argv[1]).resolve('@napi-rs/keyring'))",join(repoRoot,'harness-ui','package.json')],{encoding:'utf8',env:process.env.SystemRoot?{SystemRoot:process.env.SystemRoot}:{},windowsHide:true});}
function spyLoad(){const calls:string[]=[];return{calls,fn:(file:string)=>{calls.push(file);return{Entry:class Entry{getPassword(){return null;}setPassword(){}deletePassword(){}}};}};}
function verdictOf(loaded:any){return{ok:loaded.ok,reason:loaded.reason};}
const REFUSED={ok:false,reason:'outside-approved-roots'};

test('RED A2 a junction at an approved root that points at a second link is refused, before and after that link is re-pointed',async()=>{
  const root=await scratch();
  const repo=join(root,'repo');await talosCheckout(repo);
  const benign=join(root,'installed','node_modules');await fakeKeyring(benign);
  const attacker=join(root,'attacker','node_modules');await fakeKeyring(attacker);
  const hop=join(root,'shared-hop');
  await symlink(benign,hop,'junction');
  await symlink(hop,join(repo,'harness-ui','node_modules'),'junction');
  const load=spyLoad();
  assert.deepEqual(verdictOf(keyring.loadTalosSystemKeyring(repo,{load:load.fn})),REFUSED,'a second hop can be re-pointed by whoever owns it');
  await unlink(hop);await symlink(attacker,hop,'junction');
  const moved=freshNodeResolves(repo);
  assert.equal(moved,realpathSync(join(attacker,'@napi-rs','keyring','index.cjs')),'oracle: re-pointing only the second hop moves what a fresh Node process would load');
  assert.deepEqual(verdictOf(keyring.loadTalosSystemKeyring(repo,{resolve:()=>moved,load:load.fn})),REFUSED);
  assert.deepEqual(load.calls,[]);
});

test('RED A2 a junction at an approved root whose target lies below another link is refused',async()=>{
  const root=await scratch();
  const repo=join(root,'repo');await talosCheckout(repo);
  await fakeKeyring(join(root,'attacker','node_modules'));
  await symlink(join(root,'attacker'),join(root,'shared'),'junction');
  await symlink(join(root,'shared','node_modules'),join(repo,'harness-ui','node_modules'),'junction');
  const load=spyLoad();
  assert.deepEqual(verdictOf(keyring.loadTalosSystemKeyring(repo,{load:load.fn})),REFUSED);
  assert.deepEqual(load.calls,[]);
});

test('RED A3 a junction at an approved root into the node_modules folder of an ancestor is refused, whether that folder is a link or a plain directory',async()=>{
  for(const shape of ['a junction into another checkout, as C:\\node_modules is on this host','a plain directory anyone could have created']){
    const root=await scratch();
    const workspace=join(root,'workspace');const repo=join(workspace,'repo');await talosCheckout(repo);
    if(shape.startsWith('a junction')){
      const other=join(root,'other-checkout','harness-ui','node_modules');await fakeKeyring(other);
      await symlink(other,join(workspace,'node_modules'),'junction');
    }else await fakeKeyring(join(workspace,'node_modules'));
    await symlink(join(workspace,'node_modules'),join(repo,'harness-ui','node_modules'),'junction');
    const load=spyLoad();
    assert.deepEqual(verdictOf(keyring.loadTalosSystemKeyring(repo,{load:load.fn})),REFUSED,shape);
    assert.deepEqual(load.calls,[],shape);
  }
});

test('RED E a junction at an approved root to an ancestor of the checkout is refused',async()=>{
  const root=await scratch();
  const workspace=join(root,'workspace');const repo=join(workspace,'repo');await talosCheckout(repo);
  await fakeKeyring(workspace);
  await symlink(workspace,join(repo,'harness-ui','node_modules'),'junction');
  assert.equal(nodeResolves(repo),realpathSync(join(workspace,'@napi-rs','keyring','index.cjs')),'oracle: Node finds the ancestor copy through the junction');
  const load=spyLoad();
  assert.deepEqual(verdictOf(keyring.loadTalosSystemKeyring(repo,{load:load.fn})),REFUSED);
  assert.deepEqual(load.calls,[]);
});

/*
 * E2 with an INJECTED filesystem, on purpose: a real junction to the drive root inside a test layout
 * would fall through to the real C:\node_modules on this host and put the whole drive in reach of any
 * recursive cleanup. The fake answers lstat, readlink and realpath the way they were measured for a
 * junction on this host (lstat: a link and not a directory; readlink: the plain absolute target).
 */
function fakeFilesystem(links:Record<string,string>,directories:string[]){
  const same=(a:string,b:string)=>relative(a,b)==='';
  const link=(p:string)=>Object.keys(links).find(k=>same(k,p));
  const missing=(p:string)=>Object.assign(new Error('ENOENT: '+p),{code:'ENOENT'});
  return{
    lstat:(p:string)=>{if(link(p)!==undefined)return{isSymbolicLink:()=>true,isDirectory:()=>false};if(directories.some(d=>same(d,p)))return{isSymbolicLink:()=>false,isDirectory:()=>true};throw missing(p);},
    readlink:(p:string)=>{const k=link(p);if(k===undefined)throw Object.assign(new Error('EINVAL: '+p),{code:'EINVAL'});return links[k]!;},
    realpath:(p:string)=>{const k=link(p);if(k!==undefined)return links[k]!;if(directories.some(d=>same(d,p)))return p;throw missing(p);},
  };
}
test('RED E2 a junction at an approved root to a drive root is refused, on the checkout drive or another one',async()=>{
  const root=await scratch();
  const repo=join(root,'repo');await talosCheckout(repo);
  const ownDrive=parse(repo).root;
  const otherDrive=ownDrive.toUpperCase().startsWith('Z')?'Y:\\':'Z:\\';
  const drives=process.platform==='win32'?[ownDrive,otherDrive]:[ownDrive];
  for(const drive of drives){
    const load=spyLoad();
    const deps={...fakeFilesystem({[join(repo,'harness-ui','node_modules')]:drive},[drive]),resolve:()=>join(drive,'@napi-rs','keyring','index.js'),load:load.fn};
    assert.deepEqual(verdictOf(keyring.loadTalosSystemKeyring(repo,deps)),REFUSED,drive);
    assert.deepEqual(load.calls,[],drive);
  }
});

test('RED a package link inside the linked root does not carry the module out of the keyring folder',async()=>{
  const root=await scratch();
  const repo=join(root,'repo');await talosCheckout(repo);
  const installed=join(root,'installed','node_modules');
  const elsewhere=join(installed,'elsewhere');
  await mkdir(elsewhere,{recursive:true});
  await writeFile(join(elsewhere,'package.json'),JSON.stringify({name:'@napi-rs/keyring',version:'1.3.0',main:'index.cjs'}));
  await writeFile(join(elsewhere,'index.cjs'),MEMORY_ENTRY);
  await mkdir(join(installed,'@napi-rs'),{recursive:true});
  await symlink(elsewhere,join(installed,'@napi-rs','keyring'),'junction');
  await symlink(installed,join(repo,'harness-ui','node_modules'),'junction');
  assert.equal(nodeResolves(repo),realpathSync(join(elsewhere,'index.cjs')));
  const load=spyLoad();
  assert.deepEqual(verdictOf(keyring.loadTalosSystemKeyring(repo,{load:load.fn})),REFUSED);
  assert.deepEqual(load.calls,[]);
});

test('G3 a module resolved outside the approved roots is never loaded, not even to be refused afterwards',async()=>{
  const root=await scratch();
  const workspace=join(root,'workspace');const repo=join(workspace,'repo');await talosCheckout(repo);
  const index=await fakeKeyring(join(workspace,'node_modules'));
  assert.equal(nodeResolves(repo),realpathSync(index),'oracle: Node would load the ancestor module');
  const load=spyLoad();
  assert.deepEqual(verdictOf(keyring.loadTalosSystemKeyring(repo,{load:load.fn})),REFUSED);
  assert.deepEqual(load.calls,[],'the guard decides before any code of the module runs');
});

/*
 * Round 3, coordinator review — two gaps no test covered.
 * S3: rule 4 must look at EVERY ancestor's node_modules, not only the nearest one. The host shape is a
 *   checkout several levels below the drive root and a plain `C:\node_modules` any signed-in account can
 *   create. Built on an injected filesystem: the real drive root is never touched.
 * S4: containment is path containment, not a string prefix: `…\node_modules-evil` is a sibling of
 *   `…\node_modules`, not inside it.
 */
test('the drive-root node_modules is refused as a link target from a checkout several levels deep',()=>{
  const driveRoot=parse(tmpdir()).root;
  const repo=join(driveRoot,'talos-slice19-never-created','level-1','level-2','level-3','repo');
  const rootNodeModules=join(driveRoot,'node_modules');
  let depth=0;for(let folder=join(repo,'..');relative(folder,driveRoot)!=='';folder=join(folder,'..'))depth++;
  assert.ok(depth>=3,'the checkout sits at least three folders below the drive root, so the nearest ancestor is not the drive root');
  const load=spyLoad();
  const deps={...fakeFilesystem({[join(repo,'harness-ui','node_modules')]:rootNodeModules},[rootNodeModules]),resolve:()=>join(rootNodeModules,'@napi-rs','keyring','index.js'),load:load.fn};
  assert.deepEqual(verdictOf(keyring.loadTalosSystemKeyring(repo,deps)),REFUSED);
  assert.deepEqual(load.calls,[]);
});

test('a module resolved into a sibling-prefixed folder of an approved root is refused',async()=>{
  const root=await scratch();
  const repo=join(root,'repo');await talosCheckout(repo);
  const approved=join(repo,'harness-ui','node_modules');
  const sibling=join(repo,'harness-ui','node_modules-evil');
  const index=await fakeKeyring(sibling);
  await mkdir(join(approved,'@napi-rs'),{recursive:true});
  await symlink(join(sibling,'@napi-rs','keyring'),join(approved,'@napi-rs','keyring'),'junction');
  const measured=nodeResolves(repo);
  assert.equal(measured,realpathSync(index),'oracle: a package-level junction inside the approved root carries Node into the sibling folder');
  assert.ok(measured.toLowerCase().startsWith(approved.toLowerCase()),'the location shares the approved root as a string prefix');
  const load=spyLoad();
  assert.deepEqual(verdictOf(keyring.loadTalosSystemKeyring(repo,{load:load.fn})),REFUSED);
  assert.deepEqual(load.calls,[]);
});
