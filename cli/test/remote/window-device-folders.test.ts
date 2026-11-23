/*
 * Blocked folders step B, defence in depth (Desktop 2874ea11e): a window that does not host hands its http-app the kernel's device
 * folders coordinator built from the profile's files and the host's rules, so a device's write forwarded to it is still gated. Never
 * before the host has made the folder-id secret: until then every device write is refused (closed, not open).
 */
import assert from 'node:assert/strict';
import {join} from 'node:path';
import test from 'node:test';
import {createWindowDeviceFolders,deviceFolderExclusions,remotePaths} from '../../src/remote/host.ts';

test('a window\'s device folders: refused until the host made the secret; then the kernel coordinator with the host\'s files and rules, built once',async()=>{
  const made:any[]=[];let secret=false;
  const module={creaCartelleDeiDispositivi:(config:any)=>{made.push(config);return{consentita:async()=>true,config};}};
  const fn=createWindowDeviceFolders({repoRoot:'R',dataRoot:'D',registry:{tag:'registry'},importModule:async(file:string)=>{assert.equal(file,'remoto/cartelle-dispositivi.mjs');return module;},exists:()=>secret});
  await fn.ready;
  const before=fn();
  assert.equal(await before.consentita('p1','C:\\x'),false,'no secret yet: refused');
  assert.equal(made.length,0,'and no coordinator that could write a new secret');
  secret=true;
  const after=fn();
  assert.equal(await after.consentita('p1','C:\\x'),true);
  const paths=remotePaths('D');
  assert.deepEqual(made[0],{fileConsensi:paths.consents,fileSegreto:paths.folderSecret,sessionRegistry:{tag:'registry'},cartelleAmmesse:[],cartelleEscluse:deviceFolderExclusions('R','D'),cartellaChat:paths.chatFolder});
  assert.equal(fn(),after,'built once');
  assert.equal(made.length,1);
});

test('an older kernel without the module: every device write in that window is refused',async()=>{
  const fn=createWindowDeviceFolders({repoRoot:'R',dataRoot:'D',registry:{},importModule:async()=>{throw new Error('ENOENT');},exists:()=>true});
  await fn.ready;
  assert.equal(await fn().consentita('p1',join('C:','x')),false);
});
