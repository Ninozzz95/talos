/*
 * 0.6.15 (owner 26/10/2026, «Scaricato al primo uso», «pacchetto npm a parte»): the iroh binding comes from the npm registry
 * the first time and is trusted only by the SHA-256 pinned in src/remote/iroh-component.ts. Every way in which a download can
 * be wrong (another file, a link, a path outside `package/`, a huge archive, no network, a status) ends in a named refusal and
 * nothing on disk; a right one is written once and never downloaded again; a file swapped afterwards is never loaded.
 * The real binding is 17 MB and is not in the repo: the tests pin a fake one by swapping the expected hash through the tar.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,mkdtempSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {gzipSync} from 'node:zlib';
import {IROH_COMPONENT,IROH_MAX_TARBALL_BYTES,ensureIrohComponent,fileFromTar,irohComponentFromTarball,irohComponentPath,irohComponentReady,irohComponentSupported,irohTarballUrl,loadIrohComponent} from '../../src/remote/iroh-component.ts';

function root(t:{after:(fn:()=>void)=>void}){const d=mkdtempSync(join(tmpdir(),'talos-iroh-component-'));t.after(()=>rmSync(d,{recursive:true,force:true}));return d;}

/* A minimal ustar archive, as `npm pack` writes it: one 512-byte header per entry, data padded to 512, two zero blocks. */
function tarEntry(name:string,data:Buffer,type='0',prefix=''):Buffer{
  const header=Buffer.alloc(512);
  header.write(name,0,100,'utf8');
  header.write('0000644\0',100,'latin1');header.write('0000000\0',108,'latin1');header.write('0000000\0',116,'latin1');
  header.write(data.length.toString(8).padStart(11,'0')+'\0',124,'latin1');
  header.write('00000000000\0',136,'latin1');
  header.write(type,156,'latin1');
  header.write('ustar\0',257,'latin1');header.write('00',263,'latin1');
  if(prefix)header.write(prefix,345,155,'utf8');
  header.fill(' ',148,156);
  let sum=0;for(const byte of header)sum+=byte;
  header.write(sum.toString(8).padStart(6,'0')+'\0 ',148,'latin1');
  return Buffer.concat([header,data,Buffer.alloc((512-data.length%512)%512)]);
}
function tarball(entries:Buffer[]):Buffer{return gzipSync(Buffer.concat([...entries,Buffer.alloc(1024)]));}
const realName=`package/${IROH_COMPONENT.file}`;

test('the pinned component: one package, one version, one file, one SHA-256, from the npm registry',()=>{
  assert.equal(IROH_COMPONENT.package,'talos-code-remote-win32-x64');
  assert.match(IROH_COMPONENT.sha256,/^[0-9a-f]{64}$/u);
  assert.equal(irohTarballUrl(),'https://registry.npmjs.org/talos-code-remote-win32-x64/-/talos-code-remote-win32-x64-1.1.0.tgz');
  assert.equal(irohTarballUrl('https://example.test/npm/'),'https://example.test/npm/talos-code-remote-win32-x64/-/talos-code-remote-win32-x64-1.1.0.tgz');
  assert.equal(irohComponentSupported('win32','x64'),true);
  for(const [platform,arch] of [['win32','arm64'],['linux','x64'],['darwin','arm64']])assert.equal(irohComponentSupported(platform,arch),false,`${platform}-${arch}`);
});

test('fileFromTar takes only a regular file at exactly package/<name>',()=>{
  const data=Buffer.from('binding bytes');
  const tar=(entries:Buffer[])=>Buffer.concat([...entries,Buffer.alloc(1024)]);
  assert.deepEqual(fileFromTar(tar([tarEntry('package/package.json',Buffer.from('{}')),tarEntry(realName,data)]),IROH_COMPONENT.file),data);
  /* the ustar prefix field joins the name, as tar writers do for long paths */
  assert.deepEqual(fileFromTar(tar([tarEntry(IROH_COMPONENT.file,data,'0','package')]),IROH_COMPONENT.file),data);
  assert.equal(fileFromTar(tar([tarEntry(realName,data,'2')]),IROH_COMPONENT.file),null,'a symbolic link is never the file');
  assert.equal(fileFromTar(tar([tarEntry(realName,data,'1')]),IROH_COMPONENT.file),null,'a hard link is never the file');
  assert.equal(fileFromTar(tar([tarEntry(realName,data,'5')]),IROH_COMPONENT.file),null,'a directory is never the file');
  assert.equal(fileFromTar(tar([tarEntry(`package/../${IROH_COMPONENT.file}`,data)]),IROH_COMPONENT.file),null);
  assert.equal(fileFromTar(tar([tarEntry(`other/${IROH_COMPONENT.file}`,data)]),IROH_COMPONENT.file),null);
  assert.equal(fileFromTar(tar([tarEntry(`package/sub/${IROH_COMPONENT.file}`,data)]),IROH_COMPONENT.file),null);
  /* a size that runs past the archive is a broken archive, not a short file */
  const cut=tar([tarEntry(realName,Buffer.alloc(2048,1))]).subarray(0,512+100);
  assert.equal(fileFromTar(cut,IROH_COMPONENT.file),null);
});

test('irohComponentFromTarball refuses a file whose hash is not the pinned one, and an archive that is not one',()=>{
  const wrong=tarball([tarEntry(realName,Buffer.from('not the binding'))]);
  assert.throws(()=>irohComponentFromTarball(wrong),(e:any)=>e.code==='REMOTE_COMPONENT_HASH_MISMATCH'&&e.detail.expected===IROH_COMPONENT.sha256&&e.detail.found===createHash('sha256').update('not the binding').digest('hex'));
  assert.throws(()=>irohComponentFromTarball(tarball([tarEntry('package/README.md',Buffer.from('x'))])),{code:'REMOTE_COMPONENT_NOT_IN_PACKAGE'});
  assert.throws(()=>irohComponentFromTarball(Buffer.from('<html>not a tarball</html>')),{code:'REMOTE_COMPONENT_DOWNLOAD_FAILED'});
  assert.throws(()=>irohComponentFromTarball(Buffer.alloc(IROH_MAX_TARBALL_BYTES+1)),{code:'REMOTE_COMPONENT_TOO_LARGE'});
  /* a gzip bomb: small on the wire, beyond the unpacked ceiling */
  assert.throws(()=>irohComponentFromTarball(gzipSync(Buffer.alloc(65*1024*1024))),{code:'REMOTE_COMPONENT_TOO_LARGE'});
});

function answer(body:Buffer,status=200,headers:Record<string,string>={}){
  return async()=>({ok:status>=200&&status<300,status,arrayBuffer:async()=>new Uint8Array(body).buffer as ArrayBuffer,headers:{get:(name:string)=>headers[name.toLowerCase()]??null}});
}

test('ensureIrohComponent: unsupported platform, no network, a status, a declared size too big, a wrong file — refused, nothing written',async t=>{
  const dataRoot=root(t);
  await assert.rejects(ensureIrohComponent({dataRoot,platform:'linux',arch:'x64',fetch:answer(Buffer.alloc(0))}),{code:'REMOTE_COMPONENT_UNSUPPORTED'});
  await assert.rejects(ensureIrohComponent({dataRoot,platform:'win32',arch:'x64',fetch:async()=>{throw new TypeError('fetch failed');}}),(e:any)=>e.code==='REMOTE_COMPONENT_DOWNLOAD_FAILED'&&/fetch failed/u.test(e.detail.reason));
  await assert.rejects(ensureIrohComponent({dataRoot,platform:'win32',arch:'x64',fetch:answer(Buffer.alloc(0),404)}),(e:any)=>e.code==='REMOTE_COMPONENT_DOWNLOAD_FAILED'&&e.detail.status===404);
  await assert.rejects(ensureIrohComponent({dataRoot,platform:'win32',arch:'x64',fetch:answer(Buffer.alloc(0),200,{'content-length':String(IROH_MAX_TARBALL_BYTES+1)})}),{code:'REMOTE_COMPONENT_TOO_LARGE'});
  await assert.rejects(ensureIrohComponent({dataRoot,platform:'win32',arch:'x64',fetch:answer(tarball([tarEntry(realName,Buffer.from('evil'))]))}),{code:'REMOTE_COMPONENT_HASH_MISMATCH'});
  assert.equal(existsSync(join(dataRoot,'remote')),false,'a refused download leaves nothing on disk');
});

/* The real pinned hash is the 17 MB binding's: the happy path runs with a stand-in spec, the same code with another pin. */
const fakeBinding=Buffer.from('a stand-in binding, pinned by its own hash');
const fakeSpec={package:'talos-code-remote-win32-x64',version:'1.1.0',file:IROH_COMPONENT.file,sha256:createHash('sha256').update(fakeBinding).digest('hex')};

test('ensureIrohComponent: the right file is written once, under its final name only, and never downloaded again',async t=>{
  const dataRoot=root(t);
  const urls:string[]=[];
  const fetch=async(url:string)=>{urls.push(url);return answer(tarball([tarEntry('package/package.json',Buffer.from('{}')),tarEntry(realName,fakeBinding)]))();};
  const path=await ensureIrohComponent({dataRoot,platform:'win32',arch:'x64',fetch,spec:fakeSpec});
  assert.equal(path,irohComponentPath(dataRoot,fakeSpec));
  assert.deepEqual(urls,[irohTarballUrl(undefined,fakeSpec)]);
  assert.equal(irohComponentReady(dataRoot,fakeSpec),true);
  assert.deepEqual(readdirSync(join(path,'..')),[IROH_COMPONENT.file],'no temporary file is left next to it');
  assert.equal(await ensureIrohComponent({dataRoot,platform:'win32',arch:'x64',fetch,spec:fakeSpec}),path);
  assert.equal(urls.length,1,'already in place: no second download');
  let loaded:string|null=null;
  assert.deepEqual(loadIrohComponent(dataRoot,file=>{loaded=file;return {binding:true};},fakeSpec),{binding:true});
  assert.equal(loaded,path);
});

test('ensureIrohComponent: a wrong file already on disk is not trusted — it is downloaded again and replaced',async t=>{
  const dataRoot=root(t);
  const target=irohComponentPath(dataRoot,fakeSpec);
  mkdirSync(join(target,'..'),{recursive:true});
  writeFileSync(target,'tampered');
  assert.equal(irohComponentReady(dataRoot,fakeSpec),false);
  let fetched=0;
  await ensureIrohComponent({dataRoot,platform:'win32',arch:'x64',spec:fakeSpec,fetch:async()=>{fetched+=1;return answer(tarball([tarEntry(realName,fakeBinding)]))();}});
  assert.equal(fetched,1);
  assert.equal(irohComponentReady(dataRoot,fakeSpec),true);
});

test('loadIrohComponent never loads a file that is not the pinned one, and loads nothing when there is none',t=>{
  const dataRoot=root(t);
  let loaded=0;
  const load=()=>{loaded+=1;return {};};
  assert.equal(loadIrohComponent(dataRoot,load),null);
  const target=irohComponentPath(dataRoot);
  mkdirSync(join(target,'..'),{recursive:true});
  writeFileSync(target,'swapped after the download');
  assert.equal(loadIrohComponent(dataRoot,load),null);
  /* the stand-in, checked right before loading: replaced after the download, it is not loaded */
  const fakeTarget=irohComponentPath(dataRoot,fakeSpec);
  writeFileSync(fakeTarget,fakeBinding);
  const verified=loadIrohComponent(dataRoot,load,fakeSpec);
  assert.deepEqual(verified,{});
  writeFileSync(fakeTarget,'swapped');
  /* T4 (§5.10): this process keeps the binding it verified — the swapped file is never loaded, and the 17 MB is not hashed again
     at every `stato()`; a loader that never loaded it (another process) refuses the swapped file */
  assert.equal(loadIrohComponent(dataRoot,load,fakeSpec),verified,'the binding already verified, not the swapped file');
  let other=0;
  assert.equal(loadIrohComponent(dataRoot,()=>{other+=1;return {};},fakeSpec),null);
  assert.equal(other,0);
  assert.equal(loaded,1,'only the right file was ever loaded');
  assert.deepEqual(readdirSync(join(target,'..')),[IROH_COMPONENT.file]);
});

/* T4 (§5.10): the hash runs until the binding loads, then never again in this process */
test('loadIrohComponent hashes the file once per process: later calls reuse the verified binding without reading the disk',t=>{
  const dataRoot=root(t);
  const target=irohComponentPath(dataRoot,fakeSpec);
  mkdirSync(join(target,'..'),{recursive:true});writeFileSync(target,fakeBinding);
  let loaded=0;const binding={b:1};const load=()=>{loaded+=1;return binding;};
  assert.equal(loadIrohComponent(dataRoot,load,fakeSpec),binding);
  rmSync(target);/* gone from the disk: a call that hashed again would answer null */
  for(let i=0;i<5;i++)assert.equal(loadIrohComponent(dataRoot,load,fakeSpec),binding);
  assert.equal(loaded,1);
});
