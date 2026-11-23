import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

const mod=await import(pathToFileURL(join(process.cwd(),'scripts','create-release-manifest.mjs')).href);

test('release manifest is deterministic and hashes the actual assets',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'talos-release-'));
  const installer=join(dir,'TALOS-CLI-Setup-1.2.3.exe');
  const zip=join(dir,'TALOS-CLI-1.2.3-win.zip');
  await writeFile(installer,Buffer.from('installer-bytes'));
  await writeFile(zip,Buffer.from('zip-bytes'));
  const manifest=await mod.createReleaseManifest({
    version:'1.2.3',channel:'stable',baseUrl:'https://github.com/Ninozzz95/talos/releases/download/cli-v1.2.3/',
    assets:[
      {platform:'win32-x64',kind:'zip',path:zip},
      {platform:'win32-x64',kind:'installer',path:installer}
    ]
  });
  assert.equal(manifest.schema,'talos.cli.release.v1');
  assert.equal(manifest.version,'1.2.3');
  assert.equal(manifest.channel,'stable');
  assert.deepEqual(manifest.assets.map((a:any)=>a.kind),['installer','zip']);
  const first=manifest.assets[0];
  assert.equal(first.url,'https://github.com/Ninozzz95/talos/releases/download/cli-v1.2.3/TALOS-CLI-Setup-1.2.3.exe');
  assert.equal(first.size,Buffer.byteLength('installer-bytes'));
  assert.equal(first.sha256,createHash('sha256').update('installer-bytes').digest('hex'));
  const again=await mod.createReleaseManifest({
    version:'1.2.3',channel:'stable',baseUrl:'https://github.com/Ninozzz95/talos/releases/download/cli-v1.2.3',
    assets:[{platform:'win32-x64',kind:'installer',path:installer},{platform:'win32-x64',kind:'zip',path:zip}]
  });
  assert.deepEqual(again,manifest);
});

test('release manifest rejects unsupported versions channels and asset kinds',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'talos-release-invalid-'));
  const asset=join(dir,'x.bin');
  await writeFile(asset,'x');
  await assert.rejects(()=>mod.createReleaseManifest({version:'1.2',channel:'stable',baseUrl:'https://example.test/',assets:[{platform:'win32-x64',kind:'zip',path:asset}]}),/RELEASE_VERSION_INVALID/);
  await assert.rejects(()=>mod.createReleaseManifest({version:'1.2.3',channel:'nightly',baseUrl:'https://example.test/',assets:[{platform:'win32-x64',kind:'zip',path:asset}]}),/RELEASE_CHANNEL_INVALID/);
  await assert.rejects(()=>mod.createReleaseManifest({version:'1.2.3',channel:'stable',baseUrl:'https://example.test/',assets:[{platform:'win32-x64',kind:'tar',path:asset}]}),/RELEASE_ASSET_INVALID/);
});
