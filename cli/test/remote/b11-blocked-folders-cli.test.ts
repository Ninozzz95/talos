/*
 * Blocked folders step B in the CLI (Desktop block 11 7321786af; owner 27/10/2026 «il nega vince», «Dal PC, con la sua carta»):
 * - the kernel's unblock tool, in a conversation of a window that does not host, reaches the host's folders through the channel
 *   (`cartelle.sblocca`, a change: never without the lease's token);
 * - `talos remote folders`: a block is listed as blocked, never as allowed; a revoke that leaves the folder reachable says it is now
 *   blocked and through which folder; `--unblock` takes only the block away; `--allow` inside a blocked folder says why.
 * The kernel's own tests prove what a block refuses; these prove the CLI shows it and reaches it.
 */
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,realpathSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import test from 'node:test';
import {remoteFolders,runRemoteCommand} from '../../src/commands/remote-cli.ts';
import {t} from '../../src/i18n/index.ts';
import {checkedArgs,createCoordinatorService,createPairingGuard,type DeviceFolders,type FullCoordinator} from '../../src/remote/coordinator-service.ts';
import {connectHostWindow,proxyCoordinator} from '../../src/remote/coordinator-proxy.ts';
import {folderListRows,rowsText} from '../../src/remote/pairing-view.ts';
import {openWindowChannel} from '../../src/remote/window-channel.ts';
import {REPO_ROOT} from '../provider/first-run-fixture.ts';

const ID='abcd1234efgh5678';
const PAD={id:'p1',nome:'Pad di Nino',inLinea:true};
const kernelError=(code:string,extra:object={})=>Object.assign(new Error(code),{code},extra);
const kernel=(file:string)=>import(pathToFileURL(join(REPO_ROOT,'harness-ui','src',file)).href);
const folder=(prefix:string)=>{const dir=realpathSync.native(mkdtempSync(join(tmpdir(),prefix)));return{dir,done:()=>rmSync(dir,{recursive:true,force:true})};};

function fakeFolders(over:Partial<DeviceFolders>={}){
  const calls:Array<[string,...unknown[]]>=[];
  const rows=[
    {cartellaId:'c1',nome:'progetto',percorso:'C:\\progetto',consentitaAlle:'2026-10-27T12:00:00.000Z',da:'anticipo',esiste:true},
    {cartellaId:'b1',nome:'sub',percorso:'C:\\progetto\\sub',bloccataAlle:'2026-10-27T12:05:00.000Z',bloccata:true,esiste:true},
  ];
  const folders:DeviceFolders={
    consensiDi:async(id)=>{calls.push(['consensiDi',id]);return rows;},
    verifica:async(percorso,id)=>{calls.push(['verifica',percorso,id]);return{esito:'ok',cartellaId:'cX',nome:'x',percorso,consentita:false};},
    consentiInAnticipo:async(id,percorso,options)=>{calls.push(['consentiInAnticipo',id,percorso,options]);return{cartellaId:'cX',nome:'x'};},
    consensoDi:async(id,x)=>{calls.push(['consensoDi',id,x]);return x==='c2'?{cartellaId:'c2',nome:'sub',percorso:'C:\\progetto\\sub'}:null;},
    revoca:async(id,cartellaId)=>{calls.push(['revoca',id,cartellaId]);return{revocata:true};},
    sblocca:async(id,cartellaId)=>{calls.push(['sblocca',id,cartellaId]);return{sbloccata:true};},
    ...over,
  };
  return{folders,calls};
}
const coordinatorWith=(folders:DeviceFolders):FullCoordinator=>({
  stato:async()=>({disponibile:true,sceltaFatta:true,telefoni:[PAD],attese:[],inLinea:['p1']}) as any,
  imposta:async()=>({ok:true}) as any,apriAccoppiamento:async()=>{throw new Error('not here');},chiudiAccoppiamento:()=>{},
  conferma:async()=>({}) as any,rifiuta:()=>true as any,revoca:async()=>({}),cartelle:folders,
});

test('the channel: cartelle.sblocca crosses with two ids, nothing else',()=>{
  assert.deepEqual(checkedArgs('cartelle.sblocca',[ID,'f1']),[ID,'f1']);
  for(const args of [[ID],[ID,''],[ID,'f1','x'],[ID,{}]])
    assert.throws(()=>checkedArgs('cartelle.sblocca',args),{code:'REMOTE_BAD_ARGUMENTS'},JSON.stringify(args));
});

test('end to end: the kernel\'s unblock tool in a window that does not host reaches the host\'s block through the channel',async()=>{
  const f=folder('talos-b11-e2e-');
  const {creaRemoto}=await kernel('remoto/index.mjs');
  const {createSessionRegistry}=await kernel('session-registry.mjs');
  const {creaAdattatorePortachiaviInMemoria}=await kernel('adattatore-keyring.mjs');
  const progetto=join(f.dir,'progetto');const sub=join(progetto,'sub');mkdirSync(sub,{recursive:true});
  const dati=join(f.dir,'remoto');mkdirSync(dati);
  writeFileSync(join(dati,'telefoni.json'),JSON.stringify({v:1,dispositivi:[{id:ID,endpointId:'ENDPOINT',nome:'Pixel',piattaforma:'Android'}]}));
  const real=creaRemoto({keyring:creaAdattatorePortachiaviInMemoria(),fileImpostazioni:join(dati,'impostazioni.json'),fileTelefoni:join(dati,'telefoni.json'),
    fileConsensi:join(dati,'consensi.json'),fileSegretoCartelle:join(dati,'segreto-cartelle'),cartelleEscluse:[dati],
    chiama:async()=>({dati:null}),sessionRegistry:{esiste:()=>false,cartellePiuUsate:()=>[]},iscriviConRigiocata:()=>()=>{},caricaIroh:async()=>null,nomePc:'PC'});
  const serve=createCoordinatorService({coordinator:()=>real as FullCoordinator,owns:t=>t==='LEASE',guard:createPairingGuard()});
  const channel=await openWindowChannel({dataRoot:f.dir,label:'host',handlers:{attached:()=>[],call:async()=>({stato:200,dati:null}),subscribe:()=>()=>{},coordinator:serve}});
  const client=await connectHostWindow(f.dir,{pid:process.pid,token:'LEASE',role:'serve',startedAt:'',beatAt:''});
  assert.ok(client);
  const giri:any[]=[];
  const registro=createSessionRegistry({
    avviaSessioneFn:async(input:any)=>{let risolvi:any;const fine=new Promise(ok=>{risolvi=ok;});giri.push({input,risolvi});input.onEvento({type:'RunStarted',threadId:'t1',runId:`r${giri.length}`});return fine;},
    modello:'m',chiave:'k',preparaEsecuzioneFn:(taskId:string)=>({cartella:f.dir,comandoProva:'npm test',task:{id:taskId,consegna:'c'}}),
    remotoFn:()=>proxyCoordinator(client!,'LEASE'),
  });
  registro.avvia('task-vero',{});
  const ospite=giri[0].input.onTelefoniFn;
  try{
    /* «project» and «project\sub» allowed, then «sub» revoked: still reachable through «project», so the kernel blocks it */
    await real.cartelle.consentiInAnticipo(ID,progetto,{da:'anticipo'});
    await real.cartelle.consentiInAnticipo(ID,sub,{da:'anticipo'});
    const sotto=await real.cartelle.consensoDi(ID,sub);
    assert.equal((await real.cartelle.revoca(ID,sotto.cartellaId)).bloccata,true);
    const blocked=async()=>(await real.cartelle.consensiDi(ID)).filter((c:any)=>c.bloccata).map((c:any)=>c.percorso);
    assert.deepEqual(await blocked(),[sub],'blocked');
    const card=await ospite('remote_phone_folder_unblock',{phone:'abcd',folder:sub},{fase:'anteprima',toolCallId:'call-b11'});
    assert.equal(card.carta,true,'unblocking widens a device\'s reach: a card');
    const done=await ospite('remote_phone_folder_unblock',{phone:'abcd',folder:sub},{fase:'esegui',toolCallId:'call-b11'});
    assert.equal(done.ok,true,JSON.stringify(done));
    assert.match(done.testo,/^Unblocked /u);
    assert.deepEqual(await blocked(),[],'the block is gone (the folder is reachable again through «project», not allowed by itself)');
  }finally{
    giri.forEach((g,k)=>{g.input.onEvento({type:'RunFinished',threadId:'t1',runId:`r${k+1}`});g.risolvi({ok:true});});
    client!.close();await channel.close();await (real as any).ferma?.().catch(()=>{});
    await new Promise(r=>setTimeout(r,50));f.done();
  }
});

test('the list: a block reads «blocked», in warning colour, never «allowed»; JSON says blocked with its time',async()=>{
  const {folders}=fakeFolders();
  const out=await remoteFolders(coordinatorWith(folders),'p1',null);
  const text=rowsText(out.rows);
  assert.match(text[1]!,/^ {4}progetto +C:\\progetto +allowed /u);
  assert.match(text[2]!,/^ {4}sub +C:\\progetto\\sub +blocked .+ · not even through the folders it is allowed$/u);
  assert.equal(text[2]!.includes('allowed '),false);
  assert.equal(out.rows[2]!.at(-1)!.style,'warn');
  assert.deepEqual((out.json as any).devices[0].folders,[
    {id:'c1',name:'progetto',path:'C:\\progetto',allowedAt:'2026-10-27T12:00:00.000Z',from:'in-advance',exists:true,blocked:false},
    {id:'b1',name:'sub',path:'C:\\progetto\\sub',blocked:true,blockedAt:'2026-10-27T12:05:00.000Z',exists:true},
  ]);
  const gone=folderListRows([{name:'Pad',folders:[{name:'sub',path:'X:\\sub',allowedAt:'-',from:'domanda',exists:false,blocked:true}]}]);
  assert.match(rowsText(gone)[1]!,/blocked - · .+ · missing on disk$/u);
});

test('--revoke that leaves the folder reachable: it says it is blocked now, through which folder, and how to undo it',async()=>{
  /* the kernel's list gains the block only after the revoke: its own id goes in the hint (b9 here, not the revoked c2) */
  let revoked=false;
  const allowedRow={cartellaId:'c1',nome:'progetto',percorso:'C:\progetto',consentitaAlle:null,da:'anticipo',esiste:true};
  const oldBlock={cartellaId:'b1',nome:'old',percorso:'C:\progetto\old',bloccata:true,esiste:true};
  const newBlock={cartellaId:'b9',nome:'sub',percorso:'C:\progetto\sub',bloccata:true,esiste:true};
  const {folders}=fakeFolders({consensiDi:async()=>revoked?[allowedRow,oldBlock,newBlock]:[allowedRow,oldBlock],
    revoca:async()=>{revoked=true;return{revocata:true,bloccata:true,tramite:{cartellaId:'c1',nome:'progetto'},stessaCartella:false};}});
  const out=await remoteFolders(coordinatorWith(folders),'p1',{revoke:'c2'});
  assert.deepEqual(rowsText(out.rows),[
    '  ✓ “Pad di Nino” can no longer work in C:\\progetto\\sub.',
    '  It stays reachable through “progetto”, which the device keeps, so it is now blocked for “Pad di Nino”. Undo the block with talos remote folders p1 --unblock b9',
  ]);
  assert.equal(out.rows[1]![0]!.style,'warn');
  assert.deepEqual(out.json,{ok:true,revoked:{device:{id:'p1',name:'Pad di Nino'},folder:{id:'c2',path:'C:\\progetto\\sub'},blocked:true,through:{id:'c1',name:'progetto'},sameFolder:false,block:{id:'b9'}}});
  /* through a link to a folder the device keeps: that very folder is blocked, and said so */
  const same=fakeFolders({revoca:async()=>({revocata:true,bloccata:true,tramite:{cartellaId:'c1',nome:'progetto'},stessaCartella:true})});
  const linked=await remoteFolders(coordinatorWith(same.folders),'p1',{revoke:'c2'});
  assert.match(rowsText(linked.rows)[1]!,/^ {2}It leads to “progetto”, which the device keeps, so that folder is now blocked for “Pad di Nino” too\. Undo the block from the list: talos remote folders p1$/u,'no new block in the list: no id is guessed');
  /* the plain revoke keeps its old shape */
  const plain=await remoteFolders(coordinatorWith(fakeFolders().folders),'p1',{revoke:'c2'});
  assert.deepEqual(plain.json,{ok:true,revoked:{device:{id:'p1',name:'Pad di Nino'},folder:{id:'c2',path:'C:\\progetto\\sub'}}});
});

/* review D: a device chooses its own name, and between double quotes a pasted $( ) runs in bash and in PowerShell */
test('the command to copy names the device by its id, so what the device calls itself is never run',async()=>{
  let revoked=false;
  const block={cartellaId:'b9',nome:'sub',percorso:'C:\\progetto\\sub',bloccata:true,esiste:true};
  const {folders}=fakeFolders({consensiDi:async()=>revoked?[block]:[],consensoDi:async()=>({cartellaId:'c2',percorso:'C:\\progetto\\sub'}),
    revoca:async()=>{revoked=true;return{revocata:true,bloccata:true,tramite:{cartellaId:'c1',nome:'progetto'},stessaCartella:false};}});
  const remote=coordinatorWith(folders);
  const stato=await remote.stato();
  const hostile={...remote,stato:async()=>({...stato,telefoni:stato.telefoni!.map((p:any)=>({...p,nome:'Pad $(Start-Process calc)'}))})};
  const line=rowsText((await remoteFolders(hostile as any,'p1',{revoke:'c2'})).rows)[1]!;
  const command=line.slice(line.indexOf('Undo the block'));
  assert.equal(command,'Undo the block with talos remote folders p1 --unblock b9');
});

test('the way out of a refused consent can be run as written: it never names --unblock on its own',()=>{
  const line=t('remote.consent.insideBlocked',{folder:'proj'});
  assert.doesNotMatch(line,/--unblock first/u);
  assert.match(line,/See it with talos remote folders; --unblock with the device and that folder undoes it\./u);
});

test('a device id that starts with one dash (base64url) reaches the command; an unknown option is still refused',async()=>{
  const ctx={paths:{dataRoot:'Z:\\never-opened'},io:{stdinIsTTY:false,stdoutIsTTY:false},invocation:{}} as any;
  await assert.rejects(runRemoteCommand(ctx,['folders','--wrong','--unblock','b1']),/--wrong/u);
  await assert.rejects(runRemoteCommand(ctx,['folders','-Ab_c','extra','--unblock','b1']),{code:'REMOTE_EXTRA_ARGUMENT'},'-Ab_c was taken as the device: only the extra word is left');
});

test('--unblock: by the id or the full path of a BLOCKED folder; an allowed or unknown one, a race, an older kernel each say so',async()=>{
  const byId=fakeFolders();
  const out=await remoteFolders(coordinatorWith(byId.folders),'p1',{unblock:'b1'});
  assert.deepEqual(byId.calls,[['consensiDi','p1'],['sblocca','p1','b1']]);
  assert.deepEqual(rowsText(out.rows),['  ✓ C:\\progetto\\sub is no longer blocked for “Pad di Nino”: it can reach it again through the folders it is allowed. It is not allowed by itself.']);
  assert.deepEqual(out.json,{ok:true,unblocked:{device:{id:'p1',name:'Pad di Nino'},folder:{id:'b1',path:'C:\\progetto\\sub'}}});
  if(process.platform==='win32'){
    const byPath=fakeFolders();
    await remoteFolders(coordinatorWith(byPath.folders),'p1',{unblock:'c:\\PROGETTO\\Sub'});
    assert.deepEqual(byPath.calls.at(-1),['sblocca','p1','b1'],'the full path, case apart on Windows');
  }
  for(const which of ['c1','C:\\progetto','zzz']){
    const none=fakeFolders();
    await assert.rejects(remoteFolders(coordinatorWith(none.folders),'p1',{unblock:which}),{code:'REMOTE_FOLDER_NOT_BLOCKED'},which);
    assert.equal(none.calls.some(c=>c[0]==='sblocca'),false,`${which}: an allowed folder is never «unblocked»`);
  }
  const raced=fakeFolders({sblocca:async()=>{throw kernelError('NOT_FOUND');}});
  await assert.rejects(remoteFolders(coordinatorWith(raced.folders),'p1',{unblock:'b1'}),{code:'REMOTE_FOLDER_NOT_BLOCKED'});
  const older=fakeFolders();delete (older.folders as any).sblocca;
  await assert.rejects(remoteFolders(coordinatorWith(older.folders),'p1',{unblock:'b1'}),{code:'REMOTE_METHOD_UNAVAILABLE'});
});

test('--allow inside a blocked folder: refused with the way out, nothing else renamed',async()=>{
  const {folders}=fakeFolders({consentiInAnticipo:async()=>{throw kernelError('FOLDER_BLOCKED',{cartellaBloccata:{cartellaId:'b1',nome:'sub'}});}});
  await assert.rejects(remoteFolders(coordinatorWith(folders),'p1',{allow:'C:\\progetto\\sub\\x'}),{code:'REMOTE_FOLDER_INSIDE_BLOCKED'});
});

test('the command line: --unblock with another change, or without a device, is refused before anything is opened',async()=>{
  const ctx={paths:{dataRoot:'Z:\\never-opened'},io:{stdinIsTTY:false,stdoutIsTTY:false},invocation:{}} as any;
  await assert.rejects(runRemoteCommand(ctx,['folders','Pad','--unblock','b1','--revoke','c1']),{code:'REMOTE_FOLDER_ONE_CHANGE'});
  await assert.rejects(runRemoteCommand(ctx,['folders','Pad','--unblock','b1','--allow','.']),{code:'REMOTE_FOLDER_ONE_CHANGE'});
  await assert.rejects(runRemoteCommand(ctx,['folders','--unblock','b1']),{code:'REMOTE_PHONE_REQUIRED'});
  await assert.rejects(runRemoteCommand(ctx,['folders','Pad','--unblock']),/--unblock requires a value/u);
});
