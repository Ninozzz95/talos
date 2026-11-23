import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {performUpdateCheck,downloadVerifiedUpdate} from '../../src/update/run.ts';

const bytes=Buffer.from('installer');
const sha=createHash('sha256').update(bytes).digest('hex');
const manifest={schema:'talos.cli.release.v1',version:'1.1.0',channel:'stable',assets:[{platform:'win32-x64',kind:'installer',url:'https://example.test/a.exe',sha256:sha,size:bytes.length}]} as any;

test('explicit update check fetches manifest and selects platform',async()=>{
  let calls=0;
  const r=await performUpdateCheck({
    currentVersion:'1.0.0',channel:'stable',platform:'win32-x64',manifestUrl:'https://example.test/m.json',
    fetchFn:async()=>{calls++;return new Response(JSON.stringify(manifest));}
  });
  assert.equal(calls,1);
  assert.equal(r.available,true);
  assert.equal(r.asset?.url,manifest.assets[0].url);
});

test('update check retries one transient 5xx response and then succeeds',async()=>{
  let calls=0;
  const r=await performUpdateCheck({
    currentVersion:'1.0.0',channel:'stable',platform:'win32-x64',manifestUrl:'https://example.test/m.json',
    retryDelayMs:0,
    fetchFn:async()=>{calls++;return calls===1?new Response('temporary',{status:503}):new Response(JSON.stringify(manifest));}
  });
  assert.equal(calls,2);
  assert.equal(r.available,true);
});

test('update check does not retry permanent 4xx responses',async()=>{
  let calls=0;
  await assert.rejects(
    performUpdateCheck({
      currentVersion:'1.0.0',channel:'stable',platform:'win32-x64',manifestUrl:'https://example.test/m.json',
      retryDelayMs:0,
      fetchFn:async()=>{calls++;return new Response('missing',{status:404});}
    }),
    (error:any)=>error?.code==='UPDATE_HTTP_ERROR'&&error?.status===404
  );
  assert.equal(calls,1);
});

test('update check aborts a stalled request and retries at most twice',async()=>{
  let calls=0;
  const stalledFetch:typeof fetch=async(_url,init)=>{
    calls++;
    return await new Promise<Response>((_resolve,reject)=>{
      const signal=init?.signal;
      if(signal?.aborted){reject(signal.reason);return;}
      signal?.addEventListener('abort',()=>reject(signal.reason),{once:true});
    });
  };
  await assert.rejects(
    performUpdateCheck({
      currentVersion:'1.0.0',channel:'stable',platform:'win32-x64',manifestUrl:'https://example.test/m.json',
      timeoutMs:5,retryDelayMs:0,fetchFn:stalledFetch
    }),
    (error:any)=>error?.code==='UPDATE_TIMEOUT'
  );
  assert.equal(calls,2);
});

test('download verifies bytes before writing cache file',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'talos-upd-'));
  const file=await downloadVerifiedUpdate({asset:manifest.assets[0],cacheDir:dir,fetchFn:async()=>new Response(bytes)});
  assert.deepEqual(await readFile(file),bytes);
});

import {discoverGitHubReleaseManifest} from '../../src/update/run.ts';

test('release discovery ignores mobile desktop and drafts and selects stable CLI release',async()=>{
  const releases=[
    {tag_name:'v9.0.0',draft:false,prerelease:false,assets:[{name:'talos-cli-release.json',browser_download_url:'https://bad/mobile.json'}]},
    {tag_name:'talos-cli-v1.3.0-preview.1',draft:false,prerelease:true,assets:[{name:'talos-cli-release.json',browser_download_url:'https://example.test/preview.json'}]},
    {tag_name:'talos-cli-v1.2.0',draft:false,prerelease:false,assets:[{name:'talos-cli-release.json',browser_download_url:'https://example.test/stable.json'}]},
    {tag_name:'talos-cli-v1.4.0',draft:true,prerelease:false,assets:[{name:'talos-cli-release.json',browser_download_url:'https://bad/draft.json'}]}
  ];
  const url=await discoverGitHubReleaseManifest({channel:'stable',fetchFn:async()=>new Response(JSON.stringify(releases))});
  assert.equal(url,'https://example.test/stable.json');
});

test('release discovery selects CLI prerelease for preview channel',async()=>{
  const releases=[
    {tag_name:'talos-cli-v1.2.0',draft:false,prerelease:false,assets:[{name:'talos-cli-release.json',browser_download_url:'https://example.test/stable.json'}]},
    {tag_name:'talos-cli-v1.3.0-preview.2',draft:false,prerelease:true,assets:[{name:'talos-cli-release.json',browser_download_url:'https://example.test/preview.json'}]}
  ];
  const url=await discoverGitHubReleaseManifest({channel:'preview',fetchFn:async()=>new Response(JSON.stringify(releases))});
  assert.equal(url,'https://example.test/preview.json');
});
