import assert from 'node:assert/strict';import test from 'node:test';
import {checkRelease,verifyDownloadedAsset} from '../../src/update/check.ts';
test('release check selects newer compatible stable version',async()=>{const m={schema:'talos.cli.release.v1',version:'1.2.0',channel:'stable',assets:[{platform:'win32-x64',kind:'zip',url:'https://example.invalid/a.zip',sha256:'00'.repeat(32),size:3}]};const r=await checkRelease({currentVersion:'1.0.0',channel:'stable',platform:'win32-x64',fetchManifest:async()=>m as never});assert.equal(r.available,true);assert.equal(r.version,'1.2.0');});
test('checksum mismatch is refused',async()=>{await assert.rejects(()=>verifyDownloadedAsset(Buffer.from('abc'),{sha256:'00'.repeat(32),size:3}),/UPDATE_CHECKSUM_MISMATCH/);});
