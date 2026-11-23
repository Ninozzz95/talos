import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,readFile,readdir,stat,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,relative} from 'node:path';
import {createStoredZip} from '../../src/diagnostics/zip.ts';
import {stageWindows} from '../../scripts/stage-windows.mjs';

async function write(root:string,path:string,data:string|Buffer){const p=join(root,path);await mkdir(join(p,'..'),{recursive:true});await writeFile(p,data);}
async function walk(root:string,dir=root):Promise<string[]>{const rows:string[]=[];for(const name of await readdir(dir)){const p=join(dir,name);const s=await stat(p);if(s.isDirectory())rows.push(...await walk(root,p));else rows.push(relative(root,p).replaceAll('\\','/'));}return rows.sort();}

async function fixture(){
  const root=await mkdtemp(join(tmpdir(),'talos-stage-src-'));
  const out=await mkdtemp(join(tmpdir(),'talos-stage-out-'));
  await write(root,'cli/dist/main.js','console.log("1.0.0")\n');
  await write(root,'cli/package.json',JSON.stringify({name:'talos-cli',version:'1.0.0',dependencies:{react:'19.3.0'}}));
  await write(root,'cli/package-lock.json',JSON.stringify({name:'talos-cli',version:'1.0.0',lockfileVersion:3,requires:true,packages:{}}));
  await write(root,'cli/node_modules/react/package.json',JSON.stringify({name:'react',version:'19.3.0'}));
  await write(root,'harness-ui/src/session-registry.mjs','export const marker=true;\n');
  await write(root,'harness-ui/tests/should-not-copy.test.mjs','throw new Error("no")');
  await write(root,'harness-ui/desktop/main.mjs','throw new Error("desktop")');
  await write(root,'harness-ui/package.json',JSON.stringify({name:'talos-harness-ui-backend',dependencies:{shared:'1.0.0'}}));
  await write(root,'harness-ui/node_modules/shared/package.json',JSON.stringify({name:'shared',version:'1.0.0'}));
  await write(root,'context-engine/src/engine.mjs','export const engine=true;\n');
  await write(root,'context-engine/package.json',JSON.stringify({name:'talos-context-engine',dependencies:{shared:'2.0.0'}}));
  await write(root,'context-engine/node_modules/shared/package.json',JSON.stringify({name:'shared',version:'2.0.0'}));
  await write(root,'LICENSE','AGPL');
  await write(root,'THIRD_PARTY_NOTICES.md','notices');
  await write(root,'cli/THIRD_PARTY_NOTICES.md','cli notices');
  await write(root,'harness-ui/THIRD_PARTY_NOTICES.md','desktop notices');
  await write(root,'context-engine/THIRD_PARTY_NOTICES.md','context notices');
  const bytes=createStoredZip([{name:'node-v24.18.0-win-x64/node.exe',data:Buffer.from('fake-node')},{name:'node-v24.18.0-win-x64/LICENSE',data:'node license'}]);
  const archive=join(root,'node.zip');await writeFile(archive,bytes);
  return{root,out,archive,sha:createHash('sha256').update(bytes).digest('hex')};
}

test('windows stage is standalone allowlisted and manifest-hashed',async()=>{
  const f=await fixture();
  await stageWindows({repoRoot:f.root,out:f.out,nodeArchive:f.archive,nodeSha256:f.sha,runtimeSpecPath:new URL('../../packaging/runtime-files.json',import.meta.url)});
  const files=await walk(f.out);
  assert.ok(files.includes('runtime/node.exe'));
  assert.ok(files.includes('app/dist/main.js'));
  assert.ok(files.includes('app/vendor/harness-ui/src/session-registry.mjs'));
  assert.ok(files.includes('app/vendor/context-engine/src/engine.mjs'));
  assert.equal(JSON.parse(await readFile(join(f.out,'app','node_modules','react','package.json'),'utf8')).version,'19.3.0');
  assert.equal(JSON.parse(await readFile(join(f.out,'app','vendor','harness-ui','node_modules','shared','package.json'),'utf8')).version,'1.0.0');
  assert.equal(JSON.parse(await readFile(join(f.out,'app','vendor','context-engine','node_modules','shared','package.json'),'utf8')).version,'2.0.0');
  assert.ok(files.includes('bin/talos.cmd'));
  assert.ok(files.includes('talos.cmd'));
  assert.ok(files.includes('Start TALOS CLI.cmd'));
  assert.ok(files.includes('THIRD_PARTY_NOTICES-CLI.txt'));
  assert.ok(files.includes('Start TALOS CLI.cmd'));
  const launcher=await readFile(join(f.out,'Start TALOS CLI.cmd'),'utf8');
  assert.match(launcher,/bin\\talos\.cmd/u);
  assert.match(launcher,/title TALOS CLI/u);
  assert.ok(files.includes('MANIFEST.json'));
  assert.equal(files.some(x=>x.includes('/tests/')),false);
  assert.equal(files.some(x=>x.includes('/desktop/main.mjs')),false);
  const manifest=JSON.parse(await readFile(join(f.out,'MANIFEST.json'),'utf8'));
  assert.equal(manifest.schema,'talos.cli.manifest.v1');
  assert.equal(manifest.version,'1.0.0');
  assert.equal(manifest.talosCommit,'0c432153a288f64237e98403869d02d20d8fabc7');
  assert.equal(manifest.node,'24.18.0');
  assert.equal(manifest.platform,'win32-x64');
  assert.ok(manifest.files.some((x:any)=>x.path==='app/dist/main.js'&&/^[a-f0-9]{64}$/u.test(x.sha256)));
});

test('windows stage refuses node archive checksum mismatch',async()=>{
  const f=await fixture();
  await assert.rejects(()=>stageWindows({repoRoot:f.root,out:f.out,nodeArchive:f.archive,nodeSha256:'00'.repeat(32),runtimeSpecPath:new URL('../../packaging/runtime-files.json',import.meta.url)}),/NODE_ARCHIVE_CHECKSUM_MISMATCH/);
});
