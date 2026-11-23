/*
 * 0.6.15 T6 (owner «come nel desktop»): the model's remote_* tools in the CLI.
 * - The interactive composition gives the kernel registry `remotoFn` (late, `setRemoteTools`); `-p` never does, and never offers
 *   the tools (their cards need someone in front).
 * - The window's tool coordinator (tui-remote.ts `toolCoordinator`): this window's own when it hosts, the hosting window's by proxy,
 *   on demand when nobody hosts, REMOTE_BUSY_COMMAND when `talos remote` holds the lease.
 * - End to end, as the kernel's TCA-I-01 (harness-ui/tests/telefoni-cartelle-attrezzi.test.mjs): a REAL `creaRemoto` with its
 *   consents file hosted by one window, the kernel's own tool host (`ospiteTelefoni`) in ANOTHER window's registry, reaching it
 *   through the real channel: allow a folder from the chat, list it, revoke it.
 */
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,realpathSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import test from 'node:test';
import {checkedArgs,createCoordinatorService,createPairingGuard,type FullCoordinator} from '../../src/remote/coordinator-service.ts';
import {connectHostWindow,proxyCoordinator} from '../../src/remote/coordinator-proxy.ts';
import {openWindowChannel} from '../../src/remote/window-channel.ts';
import {createHostLease} from '../../src/automations/host-lease.ts';
import {createTuiRemote,REMOTE_HOST_LEASE} from '../../src/remote/tui-remote.ts';
import {remotePaths} from '../../src/remote/host.ts';
import {REPO_ROOT} from '../provider/first-run-fixture.ts';

const kernel=(file:string)=>import(pathToFileURL(join(REPO_ROOT,'harness-ui','src',file)).href);
const folder=(prefix:string)=>{const dir=realpathSync.native(mkdtempSync(join(tmpdir(),prefix)));return{dir,done:()=>rmSync(dir,{recursive:true,force:true})};};
const ID='abcd1234efgh5678';

test('the nested methods: the tools\' shapes pass, anything else is refused before the kernel',()=>{
  assert.deepEqual(checkedArgs('cartelle.consensiDi',[ID]),[ID]);
  assert.deepEqual(checkedArgs('cartelle.verifica',['C:\\work',ID]),['C:\\work',ID]);
  assert.deepEqual(checkedArgs('cartelle.verifica',['C:\\work']),['C:\\work']);
  assert.deepEqual(checkedArgs('cartelle.consentiInAnticipo',[ID,'C:\\work',{da:'chat',attesa:'f1'}]),[ID,'C:\\work',{da:'chat',attesa:'f1'}]);
  assert.deepEqual(checkedArgs('file.registraOfferta',[{sessionId:'s1',dispositivoId:ID,percorso:'a.txt'}]),[{sessionId:'s1',dispositivoId:ID,percorso:'a.txt',versioneAttesa:null}]);
  const bad=(method:string,args:unknown[])=>assert.throws(()=>checkedArgs(method,args),{code:'REMOTE_BAD_ARGUMENTS'},`${method} ${JSON.stringify(args)}`);
  bad('cartelle.consentiInAnticipo',[ID,'C:\\work',{da:'pc'}]);/* only the chat or in advance: never «from the device» through a window */
  bad('cartelle.consentiInAnticipo',[ID,'C:\\work',{da:'chat',extra:1}]);
  bad('cartelle.consensoDi',[ID]);bad('cartelle.revoca',[ID,'']);bad('cartelle.verifica',['x'.repeat(4097)]);
  bad('file.esaminaOfferta',[{sessionId:'s1',percorso:'a',dispositivoId:ID}]);
  bad('file.registraOfferta',[{sessionId:'s1',dispositivoId:ID,percorso:'a',versioneAttesa:7}]);
  for(const method of ['cartelle.consentita','cartelle.ascolta','cartelle.rispondi','file.offerte','cartelle.__proto__','file.constructor'])
    assert.throws(()=>checkedArgs(method,[]),{code:'REMOTE_METHOD_REFUSED'},method);
});

test('the interactive composition hands the registry remotoFn, set late by the window; -p never does',async()=>{
  const {composeTalosRuntime,loadModules}=await import('../../src/runtime/talos-composition.ts');
  const {fakeKeyring,hermetic,settle,writeProviderRuntime}=await import('../provider/first-run-fixture.ts');
  for(const askPerson of [true,false]){
    await hermetic(async h=>{
      writeProviderRuntime(h.paths,{});
      const real:any=await loadModules(REPO_ROOT);let seen:any=null;
      const context:any=await composeTalosRuntime({repoRoot:REPO_ROOT,projectRoot:h.project,paths:h.paths,model:'openai:gpt-5-mini',env:{...process.env},environmentKeys:'consent',keyring:fakeKeyring(),askPerson,
        modules:{...real,createSessionRegistry:(options:any)=>{seen=options;return real.createSessionRegistry(options);}}} as any);
      try{
        if(!askPerson){
          assert.equal(seen.remotoFn,undefined,'-p: no device host');
          assert.equal(seen.strumentiEstesi.some((name:string)=>name.startsWith('remote_')),false,'-p: no device tool offered');
          return;
        }
        assert.equal(typeof seen.remotoFn,'function');
        assert.equal(seen.remotoFn(),null,'before the window sets it: «not available»');
        const coordinator={stato:async()=>({})};
        context.setRemoteTools(()=>coordinator);
        assert.equal(seen.remotoFn(),coordinator);
      }finally{await context.runtime?.close?.();await settle(h.root);}
    });
  }
});

test('the window\'s tool coordinator: its own when it hosts, by proxy when another window does, on demand when nobody does, refused while talos remote holds it',async()=>{
  const f=folder('talos-t6-');
  try{
    mkdirSync(remotePaths(f.dir).dir,{recursive:true});
    const own:any={stato:async()=>({who:'own'}),cartelle:{consensiDi:async()=>['own-folder']},file:null};
    let created=0;
    const asked:string[]=[];
    const client:any={closed:false,request:async(_op:string,args:any)=>{asked.push(`${args.method}:${args.token}`);return{who:'window'};},close(){client.closed=true;}};
    const remote=createTuiRemote({dataRoot:f.dir,label:'mine',turnedOn:()=>false,createHost:async()=>{created++;return{remote:{...own,riprendi:async()=>{}},call:async()=>({}),stop:async()=>{}} as any;},
      setInterval:()=>({}),clearInterval:()=>{},connectHost:async()=>client});
    const tools=remote.toolCoordinator();
    /* another window holds the lease: by proxy, with its token */
    const other=createHostLease({dir:remotePaths(f.dir).dir,role:'serve',fileName:REMOTE_HOST_LEASE,label:'site',kind:'window'});
    assert.equal(other.tryAcquire().ok,true);
    assert.deepEqual(await tools.stato(),{who:'window'});
    assert.deepEqual(asked,[`stato:${other.token()}`]);
    assert.equal(created,0);
    other.release();
    /* talos remote holds it: the tool says so */
    const command=createHostLease({dir:remotePaths(f.dir).dir,role:'run',fileName:REMOTE_HOST_LEASE,label:'talos remote',kind:'command'});
    assert.equal(command.tryAcquire().ok,true);
    await assert.rejects(tools.stato(),{code:'REMOTE_BUSY_COMMAND'});
    command.release();
    /* nobody: this window hosts on demand, and from then on answers with its own */
    assert.deepEqual(await tools.stato(),{who:'own'});
    assert.equal(created,1);
    assert.deepEqual(await tools.cartelle.consensiDi(ID),['own-folder']);
    await assert.rejects(tools.file.esaminaOfferta({sessionId:'s',percorso:'a'}),{code:'REMOTE_METHOD_UNAVAILABLE'});
    await remote.stop();
  }finally{f.done();}
});

test('end to end: the kernel\'s own tool host in another window allows, lists and revokes a device folder through the channel',async()=>{
  const f=folder('talos-t6-e2e-');
  const {creaRemoto}=await kernel('remoto/index.mjs');
  const {createSessionRegistry}=await kernel('session-registry.mjs');
  const {creaAdattatorePortachiaviInMemoria}=await kernel('adattatore-keyring.mjs');
  const progetto=join(f.dir,'progetto-D');mkdirSync(progetto);
  const dati=join(f.dir,'remoto');mkdirSync(dati);
  writeFileSync(join(dati,'telefoni.json'),JSON.stringify({v:1,dispositivi:[{id:ID,endpointId:'ENDPOINT-SEGRETO',nome:'Pixel',piattaforma:'Android'}]}));
  /* the hosting window: the real coordinator, served on its channel */
  const real=creaRemoto({keyring:creaAdattatorePortachiaviInMemoria(),fileImpostazioni:join(dati,'impostazioni.json'),fileTelefoni:join(dati,'telefoni.json'),
    fileConsensi:join(dati,'consensi.json'),fileSegretoCartelle:join(dati,'segreto-cartelle'),cartelleEscluse:[dati],
    chiama:async()=>({dati:null}),sessionRegistry:{esiste:()=>false,cartellePiuUsate:()=>[]},iscriviConRigiocata:()=>()=>{},caricaIroh:async()=>null,nomePc:'PC'});
  const serve=createCoordinatorService({coordinator:()=>real as FullCoordinator,owns:t=>t==='LEASE',guard:createPairingGuard()});
  const channel=await openWindowChannel({dataRoot:f.dir,label:'host',handlers:{attached:()=>[],call:async()=>({stato:200,dati:null}),subscribe:()=>()=>{},coordinator:serve}});
  /* the other window: the kernel registry with its tool host, remotoFn = the proxy */
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
    assert.equal(typeof ospite,'function','the kernel gives the conversation its device host');
    const card=await ospite('remote_phone_folder_allow',{phone:'abcd',path:progetto},{fase:'anteprima',toolCallId:'call-t6'});
    assert.equal(card.carta,true);
    assert.match((await ospite('remote_phone_folder_allow',{phone:'abcd',path:progetto},{fase:'esegui',toolCallId:'call-t6'})).testo,/^Allowed "Pixel" \(id abcd1234\) to work in "progetto-D"/u);
    assert.equal(await real.cartelle.consentita(ID,progetto),true,'the host\'s consents file has it');
    const elenco=(await ospite('remote_phone_folders',{},{fase:'esegui'})).testo;
    assert.match(elenco,/\n {2}- "progetto-D" · folder [A-Za-z0-9_-]{32} · .+progetto-D · allowed .+ \(allowed from the chat\)$/u);
    assert.equal(elenco.includes('ENDPOINT-SEGRETO'),false);
    const id=/folder ([A-Za-z0-9_-]{32})/u.exec(elenco)![1];
    assert.match((await ospite('remote_phone_folder_revoke',{phone:'abcd',folder:id},{fase:'esegui'})).testo,/^"Pixel" \(id abcd1234\) can no longer work in "progetto-D"/u);
    assert.equal(await real.cartelle.consentita(ID,progetto),false);
  }finally{
    giri.forEach((g,k)=>{g.input.onEvento({type:'RunFinished',threadId:'t1',runId:`r${k+1}`});g.risolvi({ok:true});});
    client!.close();await channel.close();await (real as any).ferma?.().catch(()=>{});
    await new Promise(r=>setTimeout(r,50));f.done();
  }
});

test('the window wires it: windowRemote hands the composed context its tool coordinator (tui-remote-main.ts)',async()=>{
  const f=folder('talos-t6-main-');
  try{
    const {windowRemote}=await import('../../src/remote/tui-remote-main.ts');
    let handed:(()=>unknown)|null=null;
    const remote=windowRemote({dataRoot:f.dir,projectRoot:join(f.dir,'site'),repoRoot:REPO_ROOT,composed:Promise.resolve({setRemoteTools:(fn:()=>unknown)=>{handed=fn;}})});
    for(let i=0;i<40&&!handed;i++)await new Promise(r=>setTimeout(r,10));
    assert.equal(typeof handed,'function','the window set the registry\'s remote tools');
    assert.equal(handed!(),remote.toolCoordinator(),'the same coordinator the window resolves at each call');
    await remote.stop();
  }finally{f.done();}
});

test('the file offers cross the channel to the host\'s own file module (send a file to a device), errors with their codes',async()=>{
  const f=folder('talos-t6-file-');
  const asked:string[]=[];
  const host:any={stato:async()=>({}),
    cartelle:{consensiDi:async()=>{asked.push('cartelle');return[];}},
    file:{
      esaminaOfferta:async(input:any)=>{asked.push(`esamina:${input.sessionId}:${input.percorso}`);return{percorso:'C:\p\a.txt',nome:'a.txt',dimensione:3,versione:'v1'};},
      registraOfferta:async(input:any)=>{asked.push(`registra:${input.dispositivoId}:${input.versioneAttesa}`);throw Object.assign(new Error('changed'),{code:'FILE_CHANGED'});},
    }};
  const serve=createCoordinatorService({coordinator:()=>host,owns:t=>t==='L',guard:createPairingGuard()});
  const channel=await openWindowChannel({dataRoot:f.dir,label:'host',handlers:{attached:()=>[],call:async()=>({stato:200,dati:null}),subscribe:()=>()=>{},coordinator:serve}});
  const client=await connectHostWindow(f.dir,{pid:process.pid,token:'L',role:'serve',startedAt:'',beatAt:''});
  try{
    const proxy=proxyCoordinator(client!,'L');
    assert.deepEqual(await proxy.file!.esaminaOfferta({sessionId:'s1',percorso:'a.txt'}),{percorso:'C:\p\a.txt',nome:'a.txt',dimensione:3,versione:'v1'});
    await assert.rejects(proxy.file!.registraOfferta({sessionId:'s1',dispositivoId:ID,percorso:'a.txt',versioneAttesa:'v1'}),{code:'FILE_CHANGED'});
    assert.deepEqual(asked,['esamina:s1:a.txt',`registra:${ID}:v1`],'the file module, never the folders');
  }finally{client!.close();await channel.close();f.done();}
});

/* T6: the cards say which device, folder, file — never a blind «Allow a folder to a device» (session-registry.mjs `ospiteTelefoni` cards) */
test('the device tools\' cards name the device, the folder and the file, in the kernel\'s shape and in the v2\'s, never a control character',async()=>{
  const {deviceToolSummary}=await import('../../src/tui/overlays/approval-dialog.ts');
  const {createV2EventBridge}=await import('../../src/protocol/v2/events.ts');
  const telefono={idCorto:'abcd1234',nome:'Pixel di Nino\u202e\u0007 · x',piattaforma:'Android',inLinea:true,ultimaVoltaAlle:null};
  const cards:Record<string,any>={
    remote_phone_folder_allow:{tipo:'remote_phone_folder_allow',telefono,cartella:{cartellaId:'F1',nome:'progetto-D',percorso:'C:/lavori/progetto-D'}},
    remote_phone_folder_revoke:{tipo:'remote_phone_folder_revoke',telefono,cartella:{cartellaId:'F1',nome:'progetto-D',percorso:'C:/lavori/progetto-D'}},
    remote_phone_revoke:{tipo:'remote_phone_revoke',telefono},
    remote_device_send_file:{tipo:'remote_device_send_file',file:{nome:'report.pdf',dimensione:2_621_440,percorso:'C:/lavori/report.pdf'},telefono,dispositivi:1},
    remote_control_on:{tipo:'remote_control',acceso:true,ponte:'n0',telefoni:2,inLinea:0},
    remote_control_off:{tipo:'remote_control',acceso:false,ponte:'proprio',telefoni:2,inLinea:1},
  };
  const expected:Record<string,RegExp>={
    remote_phone_folder_allow:/^Allow “Pixel di Nino x” \(id abcd1234\) to work in C:\/lavori\/progetto-D · from the device it can read, write and run commands there/u,
    remote_phone_folder_revoke:/^Stop “Pixel di Nino x” \(id abcd1234\) working in C:\/lavori\/progetto-D/u,
    remote_phone_revoke:/^Revoke “Pixel di Nino x” \(id abcd1234\) · it is disconnected now/u,
    remote_device_send_file:/^Send report\.pdf \(2\.5 MB\) to “Pixel di Nino x” \(id abcd1234\) · C:\/lavori\/report\.pdf$/u,
    remote_control_on:/^Turn remote control on · through the free servers \(n0\) · paired devices: 2$/u,
    remote_control_off:/^Turn remote control off · connected devices disconnect: 1 of 2$/u,
  };
  for(const [key,card] of Object.entries(cards)){
    const kernelShape=deviceToolSummary(card.tipo,card);
    assert.match(String(kernelShape),expected[key]!,`${key}, the kernel's shape`);
    assert.doesNotMatch(String(kernelShape),/[\u0000-\u001f\u202e]/u,key);
    /* the same card through the v2 bridge: English keys only, and the same words */
    const v2=createV2EventBridge('s-1',()=>'2026-10-27T00:00:00.000Z').translate({type:'ApprovalRequested',_sequenza:1,requestId:'q1',azione:card})?.data as any;
    const keys=JSON.stringify(v2.action);
    for(const italian of ['telefono','cartella','idCorto','nome','percorso','dimensione','acceso','ponte','telefoni','inLinea','dispositivi','cartellaId','piattaforma','ultimaVoltaAlle'])
      assert.equal(keys.includes(`"${italian}"`),false,`${key}: ${italian} in the v2`);
    assert.equal(deviceToolSummary(card.tipo,v2.action),kernelShape,`${key}, the v2's shape reads the same`);
  }
  assert.equal(deviceToolSummary('remote_phones',{}),null,'the list asks no card');
  assert.equal(deviceToolSummary('write',{}),null);
});
