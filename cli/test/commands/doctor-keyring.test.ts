import assert from 'node:assert/strict';
import {realpathSync} from 'node:fs';
import {mkdir,mkdtemp,rm,symlink,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {join,relative,isAbsolute} from 'node:path';
import test,{after} from 'node:test';
import {resolveCliPaths} from '../../src/paths.ts';
import * as systemCli from '../../src/commands/system-cli.ts';
import * as keyring from '../../src/provider/system-keyring.ts';

/*
 * B1 slice 19 — `doctor` NAMES THE KEYRING REASON, NEVER A BARE FAILURE.
 *
 * Measured at 805c89a0 on this host: `ERR keyring` and nothing else, while the module resolved through
 * the drive-root junction `C:\node_modules` into another checkout and the guard refused it.
 *
 * ⛔ Nothing here may reach the real keyring. Every module is a fake in a temporary layout, and the
 *   loader handed to doctor refuses to load any file outside that layout: even with the guard broken
 *   by a mutation, the real `@napi-rs/keyring` behind `C:\node_modules` cannot be loaded or written.
 * ⛔ Hermetic: credential-shaped variables are removed for each test and restored, and APPDATA /
 *   LOCALAPPDATA point into the temporary layout.
 */
const layouts:string[]=[];
after(async()=>{for(const dir of layouts)await rm(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100});});
const HOST_SECRET_SHAPE=/KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|AUTH|PRIVATE/iu;

async function hermetic<T>(body:(root:string)=>Promise<T>):Promise<T>{
  const saved=new Map<string,string>();
  for(const name of Object.keys(process.env)){if(HOST_SECRET_SHAPE.test(name)){saved.set(name,process.env[name]!);delete process.env[name];}}
  const profile={APPDATA:process.env.APPDATA,LOCALAPPDATA:process.env.LOCALAPPDATA};
  const root=await mkdtemp(join(tmpdir(),'talos-doctor-19-'));layouts.push(root);
  process.env.APPDATA=join(root,'appdata');process.env.LOCALAPPDATA=join(root,'localappdata');
  try{return await body(root);}
  finally{
    for(const [name,value] of saved)process.env[name]=value;
    for(const [name,value] of Object.entries(profile)){if(value===undefined)delete process.env[name];else process.env[name]=value;}
  }
}
async function talosCheckout(dir:string){
  await mkdir(join(dir,'harness-ui','src'),{recursive:true});
  await writeFile(join(dir,'harness-ui','package.json'),'{}');
  await writeFile(join(dir,'harness-ui','src','session-registry.mjs'),'export {};\n');
}
async function fakeKeyring(nodeModules:string,body:string){
  const dir=join(nodeModules,'@napi-rs','keyring');
  await mkdir(dir,{recursive:true});
  await writeFile(join(dir,'package.json'),JSON.stringify({name:'@napi-rs/keyring',version:'1.3.0',main:'index.cjs'}));
  await writeFile(join(dir,'index.cjs'),body);
  return realpathSync(join(dir,'index.cjs'));
}
const MEMORY_ENTRY="const values=new Map();exports.Entry=class Entry{constructor(s,a){this.k=s+':'+a}getPassword(){return values.get(this.k)||null}setPassword(v){values.set(this.k,v)}deletePassword(){values.delete(this.k)}};";
function fenced(root:string){
  const fence=realpathSync(root);
  const requireHere=createRequire(import.meta.url);
  return(file:string)=>{
    const rel=relative(fence,realpathSync(file));
    if(rel.startsWith('..')||isAbsolute(rel))throw new Error('TEST FENCE: refused to load a module outside the temporary layout');
    return requireHere(file);
  };
}
async function doctor(root:string,repoRoot:string,deps:Record<string,unknown>,format:'text'|'json'='text'){
  const home=join(root,'home');
  const paths=resolveCliPaths({XDG_CONFIG_HOME:join(home,'c'),XDG_STATE_HOME:join(home,'s'),XDG_CACHE_HOME:join(home,'x')},'linux',home);
  for(const p of [paths.configRoot,paths.dataRoot,paths.cacheRoot,paths.logsRoot])await mkdir(p,{recursive:true});
  const out:string[]=[];
  const ctx={invocation:{outputFormat:format},io:{writeOut:(s:string)=>out.push(s),writeErr:()=>{},stdinIsTTY:false,stdoutIsTTY:false,readStdin:async()=>''},projectRoot:repoRoot,repoRoot,paths,createRuntimeContext:async()=>({})} as any;
  const code=await (systemCli.runSystemCommand as any)(ctx,'doctor',[],deps);
  const text=out.join('');
  return{code,text,keyringLine:text.split('\n').find(line=>/^(OK |ERR) keyring\b/u.test(line))};
}

test('RED doctor names a module that is not installed',()=>hermetic(async root=>{
  const repo=join(root,'repo');await talosCheckout(repo);
  let notFound:unknown;
  try{createRequire(join(repo,'harness-ui','package.json')).resolve('@talos-slice19/absent-module');}catch(error){notFound=error;}
  const deps={resolve:()=>{throw notFound;},load:fenced(root)};
  const {keyringLine,code}=await doctor(root,repo,{keyring:deps});
  const expected=keyring.describeKeyringProblem(keyring.loadTalosSystemKeyring(repo,deps) as any);
  assert.equal(keyringLine,`ERR keyring: ${expected}`);
  assert.ok(expected.includes('not installed')&&expected.includes(join(repo,'harness-ui','node_modules')),expected);
  assert.equal(code,70);
}));

test('RED doctor names a module resolved outside the approved roots, and where',()=>hermetic(async root=>{
  const repo=join(root,'workspace','repo');await talosCheckout(repo);
  const other=join(root,'other-checkout');await talosCheckout(other);
  const location=await fakeKeyring(join(other,'harness-ui','node_modules'),MEMORY_ENTRY);
  await symlink(join(other,'harness-ui','node_modules'),join(root,'workspace','node_modules'),'junction');
  assert.equal(createRequire(join(repo,'harness-ui','package.json')).resolve('@napi-rs/keyring'),location,'oracle: where Node resolves it');
  const {keyringLine}=await doctor(root,repo,{keyring:{load:fenced(root)}});
  assert.ok(keyringLine?.startsWith('ERR keyring: '),keyringLine);
  assert.ok(keyringLine.includes('outside the approved roots'),keyringLine);
  assert.ok(keyringLine.includes(location),keyringLine);
  assert.ok(keyringLine.includes(join(repo,'harness-ui','node_modules')),keyringLine);
}));

test('RED doctor names a module that failed to load',()=>hermetic(async root=>{
  const repo=join(root,'repo');await talosCheckout(repo);
  const location=await fakeKeyring(join(repo,'harness-ui','node_modules'),"throw new Error('Cannot find native binding (slice19 fake)');");
  const {keyringLine}=await doctor(root,repo,{keyring:{load:fenced(root)}});
  assert.equal(keyringLine,`ERR keyring: ${keyring.describeKeyringProblem({ok:false,reason:'load-failed',location,detail:'Cannot find native binding (slice19 fake)'})}`);
  assert.ok(keyringLine.includes(location)&&keyringLine.includes('Cannot find native binding (slice19 fake)'),keyringLine);
}));

test('RED doctor names a probe write that failed, in text and in JSON',()=>hermetic(async root=>{
  const repo=join(root,'repo');await talosCheckout(repo);
  await fakeKeyring(join(repo,'harness-ui','node_modules'),"exports.Entry=class Entry{getPassword(){return null}setPassword(){throw new Error('Platform secure storage failure: access denied (slice19 fake)')}deletePassword(){}};");
  const deps={keyring:{load:fenced(root)}};
  const expected=keyring.describeKeyringProbeFailure({ok:false,stage:'write',detail:'Platform secure storage failure: access denied (slice19 fake)'});
  assert.ok(expected.includes('probe write failed'),expected);
  const text=await doctor(root,repo,deps);
  assert.equal(text.keyringLine,`ERR keyring: ${expected}`);
  const json=await doctor(root,repo,deps,'json');
  const check=JSON.parse(json.text).checks.find((c:any)=>c.id==='keyring');
  assert.deepEqual(check,{id:'keyring',ok:false,detail:expected});
}));

test('RED doctor names a probe that read back something else',()=>hermetic(async root=>{
  const repo=join(root,'repo');await talosCheckout(repo);
  await fakeKeyring(join(repo,'harness-ui','node_modules'),"exports.Entry=class Entry{getPassword(){return 'not what was written'}setPassword(){}deletePassword(){}};");
  const {keyringLine}=await doctor(root,repo,{keyring:{load:fenced(root)}});
  assert.equal(keyringLine,`ERR keyring: ${keyring.describeKeyringProbeFailure({ok:false,stage:'mismatch'})}`);
}));

test('a working keyring still reads OK with no detail',()=>hermetic(async root=>{
  const repo=join(root,'repo');await talosCheckout(repo);
  await fakeKeyring(join(repo,'harness-ui','node_modules'),MEMORY_ENTRY);
  const {keyringLine}=await doctor(root,repo,{keyring:{load:fenced(root)}});
  assert.equal(keyringLine,'OK  keyring');
}));

test('doctor names a module without an Entry export',()=>hermetic(async root=>{
  const repo=join(root,'repo');await talosCheckout(repo);
  const location=await fakeKeyring(join(repo,'harness-ui','node_modules'),'exports.notEntry=1;');
  const {keyringLine}=await doctor(root,repo,{keyring:{load:fenced(root)}});
  assert.equal(keyringLine,`ERR keyring: ${keyring.describeKeyringProblem({ok:false,reason:'invalid-module',location})}`);
  assert.ok(keyringLine.includes(location)&&keyringLine.includes('does not export Entry'),keyringLine);
}));
