/*
 * 0.6.15 T5: `talos remote folders` — the folders a device may work in, from the terminal (plan «Cartelle consentite»).
 * - The list: every paired device (or one), each folder with its full path, when and how it was allowed, and whether it is still on
 *   the disk; JSON with the same facts in English words.
 * - `--allow <folder>`: the person typing is the consent (the desktop's «allow in advance»); a relative path is read from where the
 *   command runs; the kernel's own check (`verifica`) first, then the write naming the folder it checked (`attesa`, so a junction
 *   swapped in between writes nothing).
 * - `--revoke <folder id|path>`: by the id the JSON shows, the full path, or a path relative to where the command runs.
 * - Both are changes: this command's own coordinator asks the host lease before each (never two coordinators writing).
 * The kernel's folders are a fake that records its calls; the paths are real temporary folders.
 */
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {openCoordinator,remoteFolders,runRemoteCommand} from '../../src/commands/remote-cli.ts';
import type {DeviceFolders,FullCoordinator} from '../../src/remote/coordinator-service.ts';
import {folderListRows,rowsText} from '../../src/remote/pairing-view.ts';

const PAD={id:'p1',nome:'Pad di Nino',inLinea:true};
const PIXEL={id:'p2',nome:'Pixel ufficio',inLinea:false};
const GONE={id:'p3',nome:'Vecchio',revocatoAlle:Date.parse('2026-10-20T10:00:00Z'),revocatoDa:'pc'};

function fakeFolders(over:Partial<DeviceFolders>={}){
  const calls:Array<[string,...unknown[]]>=[];
  const consents:Record<string,any[]>={
    p1:[{cartellaId:'c1',nome:'talos',percorso:'C:\\progetti\\talos',consentitaAlle:'2026-10-26T20:15:00.000Z',da:'anticipo',esiste:true},
      {cartellaId:'c2',nome:'appunti',percorso:'C:\\appunti',consentitaAlle:'2026-10-25T09:05:00.000Z',da:'chat',esiste:true},
      {cartellaId:'c3',nome:'vecchia',percorso:'D:\\vecchia',consentitaAlle:null,da:'domanda',esiste:false}],
    p2:[],
  };
  const folders:DeviceFolders={
    consensiDi:async(id)=>{calls.push(['consensiDi',id]);return consents[id]??[];},
    verifica:async(percorso,id)=>{calls.push(['verifica',percorso,id]);return{esito:'ok',cartellaId:'cX',nome:'progetto',percorso,consentita:false};},
    consentiInAnticipo:async(id,percorso,options)=>{calls.push(['consentiInAnticipo',id,percorso,options]);return{cartellaId:'cX',nome:'progetto'};},
    consensoDi:async(id,cartellaOPercorso)=>{calls.push(['consensoDi',id,cartellaOPercorso]);
      const v=(consents[id]??[]).find(c=>c.cartellaId===cartellaOPercorso||c.percorso===cartellaOPercorso);return v?{cartellaId:v.cartellaId,nome:v.nome,percorso:v.percorso}:null;},
    revoca:async(id,cartellaId)=>{calls.push(['revoca',id,cartellaId]);return{revocata:true};},
    ...over,
  };
  return{folders,calls};
}
function coordinatorWith(folders:DeviceFolders|null,telefoni:any[]=[PAD,PIXEL,GONE]):FullCoordinator{
  return{
    stato:async()=>({disponibile:true,sceltaFatta:true,telefoni,attese:[],inLinea:['p1']}) as any,
    imposta:async()=>({ok:true}) as any,apriAccoppiamento:async()=>{throw new Error('not here');},chiudiAccoppiamento:()=>{},
    conferma:async()=>({}) as any,rifiuta:()=>true as any,revoca:async()=>({}),
    cartelle:folders,
  };
}
const dir=()=>{const d=mkdtempSync(join(tmpdir(),'talos-t5-'));return{d,done:()=>rmSync(d,{recursive:true,force:true})};};
const kernelError=(code:string)=>Object.assign(new Error(code),{code});

test('the rows: per device its folders with the full path, when and how they were allowed, «missing on disk»; a device with none says so',()=>{
  assert.deepEqual(rowsText(folderListRows([
    {name:'Pad di Nino',folders:[
      {name:'talos',path:'C:\\progetti\\talos',allowedAt:'26/10 22:15',from:'anticipo',exists:true},
      {name:'appunti',path:'C:\\appunti',allowedAt:'25/10 11:05',from:'chat',exists:true},
      {name:'vecchia',path:'D:\\vecchia',allowedAt:'-',from:'domanda',exists:false}]},
    {name:'Pixel ufficio',folders:[]},
  ])),[
    '  Pad di Nino',
    '    talos     C:\\progetti\\talos   allowed 26/10 22:15 · in advance on this computer',
    '    appunti   C:\\appunti   allowed 25/10 11:05 · from the chat',
    '    vecchia   D:\\vecchia   allowed - · asked from the device · missing on disk',
    '  Pixel ufficio',
    '    No folders allowed.',
  ]);
  assert.match(rowsText(folderListRows([]))[0]!,/No devices are paired/u);
  const missing=folderListRows([{name:'Pad',folders:[{name:'x',path:'X:\\x',allowedAt:'-',from:'chat',exists:false}]}])[1]!;
  assert.equal(missing.at(-1)!.style,'warn','a folder gone from the disk is a warning, not a dim note');
});

test('the list: every paired device (not the revoked ones), or one by name; JSON in English words with ISO times',async()=>{
  const {folders,calls}=fakeFolders();
  const all=await remoteFolders(coordinatorWith(folders),undefined,null);
  assert.deepEqual(calls.map(c=>c.slice(0,2)),[['consensiDi','p1'],['consensiDi','p2']],'the revoked device is not asked');
  const json=all.json as any;
  assert.deepEqual(json.devices.map((d:any)=>[d.name,d.folders.map((f:any)=>[f.id,f.path,f.allowedAt,f.from,f.exists])]),[
    ['Pad di Nino',[['c1','C:\\progetti\\talos','2026-10-26T20:15:00.000Z','in-advance',true],['c2','C:\\appunti','2026-10-25T09:05:00.000Z','chat',true],['c3','D:\\vecchia',null,'device',false]]],
    ['Pixel ufficio',[]],
  ]);
  assert.equal(rowsText(all.rows)[0],'  Pad di Nino');
  const one=await remoteFolders(coordinatorWith(fakeFolders().folders),'pixel ufficio',null);
  assert.deepEqual((one.json as any).devices.map((d:any)=>d.id),['p2'],'a name, case apart');
  await assert.rejects(remoteFolders(coordinatorWith(fakeFolders().folders),'Vecchio',null),{code:'REMOTE_PHONE_NOT_FOUND'},'a revoked device is not found');
});

test('--allow: a relative path is read from where the command runs; the kernel checks it, then writes naming the folder it checked',async()=>{
  const f=dir();
  try{
    const {folders,calls}=fakeFolders();
    const out=await remoteFolders(coordinatorWith(folders),'Pad di Nino',{allow:'progetto'},f.d);
    const path=join(f.d,'progetto');
    assert.deepEqual(calls,[['verifica',path,'p1'],['consentiInAnticipo','p1',path,{da:'anticipo',attesa:'cX'}]]);
    assert.deepEqual(rowsText(out.rows),[`  ✓ “Pad di Nino” can now work in ${path}: from the device it can read, write and run commands there until you revoke it.`]);
    assert.deepEqual(out.json,{ok:true,allowed:{device:{id:'p1',name:'Pad di Nino'},folder:{id:'cX',path}}});
    /* already allowed: nothing is written */
    const again=fakeFolders({verifica:async(percorso)=>({esito:'ok',cartellaId:'c1',nome:'talos',percorso,consentita:true})});
    const already=await remoteFolders(coordinatorWith(again.folders),'p1',{allow:'C:\\progetti\\talos'},f.d);
    assert.equal(again.calls.some(c=>c[0]==='consentiInAnticipo'),false);
    assert.equal((already.json as any).already,true);
    assert.match(rowsText(already.rows)[0]!,/can already work in/u);
  }finally{f.done();}
});

test('--allow refused: no folder there, a TALOS folder, a folder that changed before the write — each says why and allows nothing',async()=>{
  const cases:Array<[Partial<DeviceFolders>,string]>=[
    [{verifica:async()=>({esito:'inesistente'})},'REMOTE_FOLDER_MISSING'],
    [{verifica:async()=>({esito:'esclusa'})},'REMOTE_FOLDER_TALOS'],
    [{consentiInAnticipo:async()=>{throw kernelError('FOLDER_CHANGED');}},'REMOTE_FOLDER_CHANGED'],
    [{consentiInAnticipo:async()=>{throw kernelError('FOLDER_INVALID');}},'REMOTE_FOLDER_MISSING'],
    [{consentiInAnticipo:async()=>{throw kernelError('FOLDER_NOT_ALLOWED');}},'REMOTE_FOLDER_TALOS'],
  ];
  for(const [over,code] of cases){
    const {folders,calls}=fakeFolders(over);
    await assert.rejects(remoteFolders(coordinatorWith(folders),'p1',{allow:'C:\\x'}),{code},code);
    if(over.verifica)assert.equal(calls.some(c=>c[0]==='consentiInAnticipo'),false,`${code}: nothing written`);
  }
  /* any other kernel failure is not renamed */
  const other=fakeFolders({consentiInAnticipo:async()=>{throw kernelError('EACCES');}});
  await assert.rejects(remoteFolders(coordinatorWith(other.folders),'p1',{allow:'C:\\x'}),{code:'EACCES'});
});

test('--revoke: by the folder id, by the full path, or by a path relative to where the command runs; not allowed says so',async()=>{
  const f=dir();
  try{
    const byId=fakeFolders();
    const out=await remoteFolders(coordinatorWith(byId.folders),'Pad di Nino',{revoke:'c2'},f.d);
    /* blocked folders step B: the blocks are read before the revoke, to name a block it makes by its own id */
    assert.deepEqual(byId.calls,[['consensoDi','p1','c2'],['consensiDi','p1'],['revoca','p1','c2']]);
    assert.deepEqual(rowsText(out.rows),['  ✓ “Pad di Nino” can no longer work in C:\\appunti.']);
    assert.deepEqual(out.json,{ok:true,revoked:{device:{id:'p1',name:'Pad di Nino'},folder:{id:'c2',path:'C:\\appunti'}}});
    const relative=fakeFolders({consensoDi:async(_id,x)=>x===join(f.d,'progetto')?{cartellaId:'c9',nome:'progetto',percorso:x}:null});
    await remoteFolders(coordinatorWith(relative.folders),'p1',{revoke:'progetto'},f.d);
    assert.deepEqual(relative.calls,[['consensiDi','p1'],['revoca','p1','c9']],'the relative path, read from where the command runs');
    const none=fakeFolders();
    await assert.rejects(remoteFolders(coordinatorWith(none.folders),'p1',{revoke:'zzz'},f.d),{code:'REMOTE_FOLDER_NOT_GIVEN'});
    assert.equal(none.calls.some(c=>c[0]==='revoca'),false);
    /* revoked meanwhile (from the device or another window): the kernel's NOT_FOUND is «not allowed» */
    const raced=fakeFolders({revoca:async()=>{throw kernelError('NOT_FOUND');}});
    await assert.rejects(remoteFolders(coordinatorWith(raced.folders),'p1',{revoke:'c1'}),{code:'REMOTE_FOLDER_NOT_GIVEN'});
  }finally{f.done();}
});

test('a change needs a device; a host without device folders says so',async()=>{
  await assert.rejects(remoteFolders(coordinatorWith(fakeFolders().folders),undefined,{allow:'.'}),{code:'REMOTE_PHONE_REQUIRED'});
  await assert.rejects(remoteFolders(coordinatorWith(null),undefined,null),{code:'REMOTE_METHOD_UNAVAILABLE'});
});

test('the command line: --allow and --revoke together, or a change without a device, are refused before anything is opened',async()=>{
  const ctx={paths:{dataRoot:'Z:\\never-opened'},io:{stdinIsTTY:false,stdoutIsTTY:false},invocation:{}} as any;
  await assert.rejects(runRemoteCommand(ctx,['folders','Pad','--allow','.','--revoke','c1']),{code:'REMOTE_FOLDER_ONE_CHANGE'});
  await assert.rejects(runRemoteCommand(ctx,['folders','--allow','.']),{code:'REMOTE_PHONE_REQUIRED'});
  await assert.rejects(runRemoteCommand(ctx,['folders','Pad','extra']),{code:'REMOTE_EXTRA_ARGUMENT'});
  await assert.rejects(runRemoteCommand(ctx,['folders','Pad','--allow']),/--allow requires a value/u);
});

test('this command hosting alone: allowing and revoking a folder ask the lease first (a window took it: nothing is written)',async()=>{
  const f=dir();
  try{
    const {folders,calls}=fakeFolders();
    let owns=true;
    const lease={tryAcquire:()=>({ok:true}),beat:()=>true,owns:()=>owns,release:()=>{}} as any;
    const got=await openCoordinator({paths:{dataRoot:f.d}} as any,{lease,openOwn:async()=>({remote:coordinatorWith(folders),stop:async()=>{}}),setInterval:()=>1,clearInterval:()=>{}});
    await got.remote.cartelle!.consentiInAnticipo('p1','C:\\x',{da:'anticipo',attesa:'cX'});
    await got.remote.cartelle!.revoca('p1','c1');
    assert.deepEqual(calls.map(c=>c[0]),['consentiInAnticipo','revoca'],'while it holds the lease');
    owns=false;
    await assert.rejects(got.remote.cartelle!.consentiInAnticipo('p1','C:\\y',{da:'anticipo',attesa:'cY'}),{code:'REMOTE_LEASE_LOST'});
    await assert.rejects(got.remote.cartelle!.revoca('p1','c2'),{code:'REMOTE_LEASE_LOST'});
    assert.deepEqual(calls.map(c=>c[0]),['consentiInAnticipo','revoca'],'nothing written after the lease moved');
    await got.close();
  }finally{f.done();}
});
