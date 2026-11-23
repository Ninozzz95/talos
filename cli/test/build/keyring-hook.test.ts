/*
 * «One line», step 3 (11/11/2026, judge v1499 point 1; brief point c). The terminal's test commands run under the desktop's keyring
 * trip wire, and the only thing let through is a FAKE `@napi-rs/keyring` inside the run's private temp folder.
 *
 * Every probe that could touch a keyring runs in a CHILD (a blocked load sets the exit code to 97, which would fail this file):
 * the child gets the trip wire and the exemption from this process by itself, through the launch (the test hands it `{}`).
 * ⛔ Nothing here can load the real module: the first test refuses to go on without the trip wire, and the real package is only
 *   ever ASKED for, so with the trip wire in place it is refused before its first line runs.
 */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {basename, dirname, join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import test, {after} from 'node:test';
import {ESENZIONE_FINTI, GANCIO_ATTACCATO, GANCIO_COPIA, GANCIO_DELLA_LINEA, IMPRONTE_DI_K, PREFISSO_CARTELLA_FINTI, RADICE_CLI, RADICE_LINEA, VARIABILE_FINTI, ambienteConGancio, gancioInUso, opzioniDelGancio} from '../../scripts/gancio/percorsi.mjs';

const SEGNO = Symbol.for('talos.prova.gancioPortachiavi');
const sha = (file:string)=>createHash('sha256').update(readFileSync(file)).digest('hex');
const created:string[]=[];
after(()=>{for(const dir of created)rmSync(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100});});
/* Judge v1534: while the wire is detached from the runners (GANCIO_ATTACCATO false), this process has none, and the probes below
   hand it to their child explicitly, so the copy and the exemption stay proven. Attached again, the child gets it by itself. */
const hooked=()=>{if(GANCIO_ATTACCATO&&!(globalThis as any)[SEGNO])assert.fail('no keyring trip wire in this test process: run it through scripts/run-tests.mjs (npm test)');};

test('KEYRING-HOOK-1 (judge v1534): detached, no test process carries the trip wire; attached, every one carries the line\'s and the run\'s fakes folder',()=>{
  if(!GANCIO_ATTACCATO){
    assert.equal((globalThis as any)[SEGNO],undefined,'the trip wire is detached (scripts/gancio/percorsi.mjs) yet this test process loaded it');
    assert.ok(!String(process.env.NODE_OPTIONS??'').includes(pathToFileURL(gancioInUso()).href),'detached, but NODE_OPTIONS still names the trip wire');
    assert.equal(process.env[VARIABILE_FINTI],undefined,'detached, but the fakes folder is still handed down');
    return;
  }
  hooked();
  assert.equal((globalThis as any)[SEGNO].url,pathToFileURL(gancioInUso()).href,'the trip wire loaded is not the one scripts/gancio/percorsi.mjs names');
  assert.ok(String(process.env.NODE_OPTIONS).includes(pathToFileURL(ESENZIONE_FINTI).href),'the fakes exemption is not in NODE_OPTIONS');
  const folder=process.env[VARIABILE_FINTI]??'';
  assert.ok(basename(folder).startsWith(PREFISSO_CARTELLA_FINTI),`the fakes folder is not a run's private temp: ${folder}`);
  assert.equal(realpathSync(folder),realpathSync(tmpdir()),'the fakes folder must be this run\'s private temp, nothing wider');
});

test('KEYRING-HOOK-2: the copy is byte-identical to branch k (a47b37a9b); once k is on the line, to the line\'s file',()=>{
  for(const [name,expected] of Object.entries(IMPRONTE_DI_K)){
    const copy=join(dirname(GANCIO_COPIA),name);
    assert.equal(sha(copy),expected,`${name}: the terminal's copy differs from k a47b37a9b; copy k's file again, never edit it here`);
    const onLine=join(dirname(GANCIO_DELLA_LINEA),name);
    if(existsSync(onLine))assert.equal(sha(copy),sha(onLine),`${name}: the line now has k's file and the copy differs from it`);
  }
  if(existsSync(GANCIO_DELLA_LINEA))assert.equal(gancioInUso(),GANCIO_DELLA_LINEA,'k is on the line: the test commands must load its file');
  else assert.equal(gancioInUso(),GANCIO_COPIA);
  const git=spawnSync('git',['-C',RADICE_LINEA,'cat-file','-e','a47b37a9b^{commit}'],{encoding:'utf8',windowsHide:true});
  if(git.status===0)for(const [name,expected] of Object.entries(IMPRONTE_DI_K)){
    const show=spawnSync('git',['-C',RADICE_LINEA,'show',`a47b37a9b:harness-ui/desktop/tests/${name}`],{windowsHide:true,maxBuffer:1<<24});
    assert.equal(createHash('sha256').update(show.stdout).digest('hex'),expected,`${name}: the pinned fingerprint is not k's`);
  }
});

function fake(nodeModules:string,body="exports.Entry=class Entry{};exports.who=__filename;"){
  const dir=join(nodeModules,'@napi-rs','keyring');
  mkdirSync(dir,{recursive:true});
  writeFileSync(join(dir,'package.json'),JSON.stringify({name:'@napi-rs/keyring',version:'1.3.0',main:'index.cjs'}));
  writeFileSync(join(dir,'index.cjs'),body);
  writeFileSync(join(dir,'keyring.win32-x64-msvc.node'),'not a dll');
  return realpathSync(join(dir,'index.cjs'));
}
function child(script:string){
  const dir=mkdtempSync(join(tmpdir(),'talos-keyring-hook-'));created.push(dir);
  const file=join(dir,'figlio.cjs');writeFileSync(file,script);
  /* attached: `{}` on purpose, the trip wire and the exemption must ride along by themselves; detached (v1534): handed explicitly */
  const base:Record<string,string>=process.env.SystemRoot?{SystemRoot:process.env.SystemRoot}:{};
  const env=GANCIO_ATTACCATO?base:{...base,NODE_OPTIONS:opzioniDelGancio({finti:true}).join(' '),[VARIABILE_FINTI]:tmpdir()};
  const run=spawnSync(process.execPath,[file],{cwd:dir,env,encoding:'utf8',windowsHide:true,timeout:60_000});
  return {status:run.status,out:JSON.parse(run.stdout||'{}'),err:String(run.stderr)};
}
const PROBE=`const {createRequire}=require('node:module');
const out={};
const tryIt=(name,f)=>{try{const m=f();out[name]=m&&m.who?'LOADED '+m.who:'LOADED';}catch(e){out[name]=(e.code||'')+' '+String(e.message).slice(0,160);}};
module.exports={out,tryIt,createRequire};`;

test('KEYRING-HOOK-3: a fake inside the run\'s private temp loads, by name and by path, also in a child with an empty env',()=>{
  hooked();
  const root=realpathSync.native(mkdtempSync(join(tmpdir(),'talos-keyring-inside-'))); /* the real path: a short TEMP (RUNNER~1) is reported long */created.push(root);
  mkdirSync(join(root,'repo','harness-ui'),{recursive:true});writeFileSync(join(root,'repo','harness-ui','package.json'),'{}');
  const location=fake(join(root,'repo','harness-ui','node_modules'));
  const r=child(`${PROBE}
const req=createRequire(${JSON.stringify(join(root,'repo','harness-ui','package.json'))});
tryIt('resolve',()=>({who:req.resolve('@napi-rs/keyring')}));
tryIt('byName',()=>req('@napi-rs/keyring'));
tryIt('byPath',()=>require(${JSON.stringify(location)}));
process.stdout.write(JSON.stringify(out));`);
  assert.deepEqual(r.out,{resolve:'LOADED '+location,byName:'LOADED '+location,byPath:'LOADED '+location},r.err);
  assert.equal(r.status,0,r.err);
});

test('KEYRING-HOOK-4: the real package, a .node file inside the folder and a fake outside the run\'s folder are refused by the trip wire',()=>{
  hooked();
  const inside=mkdtempSync(join(tmpdir(),'talos-keyring-node-'));created.push(inside);
  const insideFake=fake(join(inside,'node_modules'));
  /* outside: a sibling of the run's private temp, and one whose name only STARTS like it */
  const outer=mkdtempSync(join(dirname(tmpdir()),'talos-keyring-outside-'));created.push(outer);
  const outsideFake=fake(join(outer,'node_modules'));
  const prefixed=`${tmpdir()}-x`;mkdirSync(prefixed,{recursive:true});created.push(prefixed);
  const prefixedFake=fake(join(prefixed,'node_modules'));
  const realFrom=join(RADICE_CLI,'package.json');
  const r=child(`${PROBE}
tryIt('real',()=>createRequire(${JSON.stringify(realFrom)})('@napi-rs/keyring'));
tryIt('realResolve',()=>({who:createRequire(${JSON.stringify(realFrom)}).resolve('@napi-rs/keyring')}));
tryIt('dotNode',()=>require(${JSON.stringify(join(dirname(insideFake),'keyring.win32-x64-msvc.node'))}));
tryIt('outside',()=>require(${JSON.stringify(outsideFake)}));
tryIt('outsideByName',()=>createRequire(${JSON.stringify(join(outer,'x.js'))})('@napi-rs/keyring'));
tryIt('prefixed',()=>require(${JSON.stringify(prefixedFake)}));
out.realLoaded=Object.keys(require.cache).filter(k=>/[\\\\/]@napi-rs[\\\\/]keyring/i.test(k)).length;
process.stdout.write(JSON.stringify(out));`);
  const refused=(what:string)=>`TALOS_GANCIO_PORTACHIAVI TALOS-GANCIO-PORTACHIAVI: a test process tried to load the real Windows keyring (${what}`;
  for(const name of ['real','realResolve'])assert.ok(String(r.out[name]).startsWith(refused('resolve @napi-rs/keyring)')),`${name}: ${r.out[name]}`);
  for(const name of ['dotNode','outside','outsideByName','prefixed'])assert.ok(String(r.out[name]).startsWith('TALOS_GANCIO_PORTACHIAVI '),`${name}: ${r.out[name]}`);
  assert.equal(r.out.realLoaded,0,'a keyring module entered the child\'s module cache');
  assert.equal(r.status,97,'the trip wire ends the child with 97');
});

test('KEYRING-HOOK-5: both runners go through ambienteConGancio, the kernel gate without the fakes exemption; detached, it hands their env back untouched',()=>{
  const given={PATH:'x',NODE_OPTIONS:'--max-old-space-size=4096'};
  const out=ambienteConGancio(given,{finti:true,cartellaFinti:tmpdir()});
  if(!GANCIO_ATTACCATO)assert.deepEqual(out,given,'detached (judge v1534): the runners\' env must come back exactly as given');
  else assert.ok(String(out.NODE_OPTIONS).includes(pathToFileURL(gancioInUso()).href));
  assert.ok(String(ambienteConGancio(given,{finti:true,cartellaFinti:tmpdir(),attaccato:true}).NODE_OPTIONS).includes(pathToFileURL(gancioInUso()).href),'reattaching is the flag alone');
  const source=readFileSync(fileURLToPath(new URL('../../scripts/kernel-tests.mjs',import.meta.url)),'utf8');
  assert.match(source,/const env = ambienteConGancio\(\{\.\.\.process\.env, TEMP: privateTemp, TMP: privateTemp, TMPDIR: privateTemp\}\);/u);
  const runner=readFileSync(fileURLToPath(new URL('../../scripts/run-tests.mjs',import.meta.url)),'utf8');
  assert.match(runner,/ambienteConGancio\(env, \{finti: true, cartellaFinti: privateTemp\}\)/u);
  assert.match(runner,/\{stdio: 'inherit', env: hooked\}/u);
});
