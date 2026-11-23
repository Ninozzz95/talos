/**
 * 0.6.15 T4, the plan's own proof (DISEGNO-T4-REMOTE-TUI.md «Prove: Due processi»): ONE remote coordinator per profile, with two
 * real processes — a TALOS window in a pseudo console that hosts remote control, and `talos remote` commands run beside it.
 * By design this scenario has a second TALOS process open while the window runs (a command, one at a time); the TUI stays one.
 * - The profile is hermetic (profile.ts: private APPDATA/LOCALAPPDATA, TALOS_TEST_PROFILE, credentials in memory — the remote's key
 *   never reaches the system keyring) and remote control is on with a paired device written in its files.
 * - No network: the iroh component is not downloaded in the profile, so the transport does not start; the coordinator does, and
 *   that is what T4 is about.
 * What it proves:
 * - the window takes the host lease as a window and opens its channel;
 * - `talos remote list --json` answers through the window (the lease stays the window's: the command never builds its own);
 * - T5 `talos remote folders --allow` and `--revoke` go through the window too: the host writes consents.json, the lease stays its;
 * - `talos remote revoke` goes through the window too: the device is revoked by the host itself (one writer of phones.json), and the
 *   next list no longer shows it;
 * - closed the window, `talos remote list` takes the lease as a command, still sees the revoke, and gives the lease back.
 */
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,mkdtempSync,readdirSync,readFileSync,realpathSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {exitTalos,stage,toComposer} from './harness.ts';

const DEVICE={id:'abcd1234efgh5678',endpointId:'e'.repeat(64),nome:'Pad di prova',piattaforma:'Android',collegatoAlle:Date.parse('2026-10-26T20:00:00Z')};
const s=stage({name:'remote-two-processes'});
const remoteDir=()=>join(s.profile.env.LOCALAPPDATA!,'TALOS-CLI','remote');
const lease=()=>{try{return JSON.parse(readFileSync(join(remoteDir(),'host.json'),'utf8'));}catch{return null;}};
const consentsOnDisk=()=>{try{return JSON.parse(readFileSync(join(remoteDir(),'consents.json'),'utf8')).dispositivi?.[DEVICE.id]??[];}catch{return[];}};
const phonesOnDisk=()=>JSON.parse(readFileSync(join(remoteDir(),'phones.json'),'utf8')).dispositivi as any[];
const listJson=async()=>{
  const r=await s.profile.talos(['remote','list','--json']);
  assert.equal(r.status,0,`talos remote list failed (${r.status}): ${r.stdout}${r.stderr}`);
  return JSON.parse(r.stdout);
};
const waitUntil=async(label:string,check:()=>boolean,ms=30_000)=>{
  const until=Date.now()+ms;while(Date.now()<until){if(check())return;await new Promise(r=>setTimeout(r,100));}
  throw new Error(`timed out waiting for ${label}`);
};

test('T4: a window hosts remote control; talos remote list and revoke go through it; closed, the command holds the lease alone',async()=>{
  mkdirSync(remoteDir(),{recursive:true});
  writeFileSync(join(remoteDir(),'settings.json'),JSON.stringify({acceso:true,relay:{modo:'n0'}}));
  writeFileSync(join(remoteDir(),'phones.json'),JSON.stringify({v:1,dispositivi:[DEVICE]}));
  const t=s.launch([],{cols:120,rows:32});
  try{
    await toComposer(t);
    await waitUntil('the window to host remote control',()=>lease()?.kind==='window'&&existsSync(join(remoteDir(),'windows'))&&readdirSync(join(remoteDir(),'windows')).some(n=>n.endsWith('.json')));
    const held=lease();
    /* the list, from another process, through the window */
    const listed=await listJson();
    assert.deepEqual(listed.phones.map((p:any)=>[p.name,p.state]),[['Pad di prova','offline']]);
    assert.equal(lease()?.token,held.token,'the lease is still the window\'s: the command did not take it');
    /* T5: a folder allowed, listed and revoked from another process, through the window: the host writes consents.json */
    const project=mkdtempSync(join(tmpdir(),'talos-t5-live-'));
    try{
      const real=realpathSync.native(project).toLowerCase();
      const allowed=await s.profile.talos(['remote','folders','Pad di prova','--allow',project,'--json']);
      assert.equal(allowed.status,0,`talos remote folders --allow failed (${allowed.status}): ${allowed.stdout}${allowed.stderr}`);
      const folder=JSON.parse(allowed.stdout).allowed?.folder;
      assert.equal(String(folder?.path).toLowerCase(),real,'the real path of the folder');
      assert.equal(lease()?.token,held.token,'allowed through the window: still its lease');
      assert.deepEqual(consentsOnDisk().map((c:any)=>[String(c.percorso).toLowerCase(),c.da]),[[real,'anticipo']],'the host wrote it');
      const folders=await s.profile.talos(['remote','folders','--json']);
      assert.equal(folders.status,0,`talos remote folders failed: ${folders.stdout}${folders.stderr}`);
      assert.deepEqual(JSON.parse(folders.stdout).devices.map((d:any)=>[d.name,d.folders.map((f:any)=>[f.id,f.from,f.exists])]),[['Pad di prova',[[folder.id,'in-advance',true]]]]);
      const revokedFolder=await s.profile.talos(['remote','folders','Pad di prova','--revoke',folder.id,'--json']);
      assert.equal(revokedFolder.status,0,`talos remote folders --revoke failed: ${revokedFolder.stdout}${revokedFolder.stderr}`);
      assert.equal(JSON.parse(revokedFolder.stdout).revoked?.folder?.id,folder.id);
      assert.deepEqual(consentsOnDisk(),[],'the host took it back');
      assert.equal(lease()?.token,held.token,'still the window\'s lease');
    }finally{rmSync(project,{recursive:true,force:true});}
    /* the revoke, from another process, through the window: the host writes phones.json */
    const revoked=await s.profile.talos(['remote','revoke','Pad di prova','--json']);
    assert.equal(revoked.status,0,`talos remote revoke failed: ${revoked.stdout}${revoked.stderr}`);
    assert.equal(JSON.parse(revoked.stdout).revoked?.id,DEVICE.id);
    assert.equal(lease()?.token,held.token,'still the window\'s lease');
    const onDisk=phonesOnDisk().find(p=>p.id===DEVICE.id);
    assert.ok(Number.isFinite(onDisk?.revocatoAlle),'the host wrote the revoke');
    assert.equal(onDisk.revocatoDa,'pc');
    assert.deepEqual((await listJson()).phones,[],'revoked here: it leaves the list');
  }finally{await exitTalos(t);}
  /* the window closed: it gave the lease back; the command now takes it as a command, sees the revoke, and gives it back */
  await waitUntil('the window to release the lease',()=>lease()===null,15_000);
  assert.deepEqual((await listJson()).phones,[],'the revoke survived the window');
  assert.equal(lease(),null,'the command gave the lease back at the end');
});
