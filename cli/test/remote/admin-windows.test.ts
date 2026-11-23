/*
 * 0.6.15, administrator windows (owner 27/10/2026: «Ammetterla con avviso», then «Quella da amministratore»).
 * - Whether this process runs as administrator: the token's mandatory label (High or System), read by SID from `whoami.exe` by its
 *   full path; root elsewhere; an error is «no».
 * - The host lease and the window registration say `elevated`.
 * - An administrator window is the bridge whenever it is open: a normal window does not take a free lease, a normal host hands it
 *   over at its beat — never in the middle of a pairing — and a dead administrator window does not count.
 * - A normal window or terminal asked for remote control while an administrator window has it says REMOTE_HOST_ELEVATED (Windows
 *   would not let it open that window's channel) instead of failing to connect.
 * - The fixed warning in an administrator window's footer, right after the mode; the QR and the code say what the device gets.
 */
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {createHostLease} from '../../src/automations/host-lease.ts';
import {openCoordinator} from '../../src/commands/remote-cli.ts';
import {detectElevation,runFile} from '../../src/remote/elevation.ts';
import {remotePaths} from '../../src/remote/host.ts';
import {pairingRows,rowsText} from '../../src/remote/pairing-view.ts';
import {REMOTE_HOST_LEASE,createTuiRemote} from '../../src/remote/tui-remote.ts';
import {openWindowChannel,readRegistrations,type WindowRegistration} from '../../src/remote/window-channel.ts';
import {footerModeRow} from '../../src/tui/components/chrome-rows.ts';

const folder=()=>{const d=mkdtempSync(join(tmpdir(),'talos-admin-'));return{d,done:()=>rmSync(d,{recursive:true,force:true})};};
const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const leaseFile=(data:string)=>join(remotePaths(data).dir,REMOTE_HOST_LEASE);
const leaseOnDisk=(data:string)=>{try{return JSON.parse(readFileSync(leaseFile(data),'utf8'));}catch{return null;}};
const ADMIN:WindowRegistration={v:1,id:'admin-window',pid:4242,startedAt:'2026-10-27T00:00:00.000Z',label:'ops',channel:'\\\\.\\pipe\\x',token:'t',elevated:true};

function fakeHost(log:string[],name:string){
  let n=0;
  return{
    remote:{
      riprendi:async()=>{log.push(`${name}:on`);},
      stato:async()=>({inLinea:[],telefoni:[],consensi:[],attese:[]}),
      ascoltaStato:()=>()=>{},
      apriAccoppiamento:async()=>{n++;return{gettone:`g${n}`,qr:'q',scadeAlle:Date.now()+300_000,moduli:{lato:1,righe:['1']}};},
      chiudiAccoppiamento:()=>{},
      cartelle:{ascolta:()=>()=>{}},
    },
    call:async()=>({stato:200,dati:{}}),
    stop:async()=>{log.push(`${name}:off`);},
  } as any;
}
/* a window by hand: its beat is called by the test */
function windowOf(data:string,opts:{pid:number;label:string;elevated:boolean;registrations?:()=>WindowRegistration[];alive?:(pid:number)=>boolean;log:string[];probe?:(channel:string)=>Promise<any>;graceMs?:number;ownChannel?:(channel:string)=>boolean;createHost?:()=>Promise<any>}){
  let beat!:()=>void;
  const r=createTuiRemote({dataRoot:data,label:opts.label,
    lease:createHostLease({dir:remotePaths(data).dir,role:'serve',fileName:REMOTE_HOST_LEASE,label:opts.label,kind:'window',pid:opts.pid,isAlive:()=>true,elevated:()=>opts.elevated}),
    createHost:opts.createHost??(async()=>fakeHost(opts.log,opts.label)),turnedOn:()=>true,elevated:async()=>opts.elevated,
    registrations:opts.registrations??(()=>[]),alive:opts.alive??(()=>true),probeChannel:opts.probe??(async()=>'denied'),ownChannel:opts.ownChannel??(()=>true),...(opts.graceMs!==undefined?{adminGraceMs:opts.graceMs}:{}),
    setInterval:(fn)=>{beat=fn;return{unref(){}};},clearInterval:()=>{}});
  return{r,beat:async()=>{beat();await pause(30);}};
}

test('elevation: the mandatory label by SID from whoami.exe by its full path — High and System are administrator, Medium is not, an error is not; root elsewhere',async()=>{
  const asked:string[]=[];
  const csv=(label:string)=>`"DOMAIN\\\\Users","Alias","S-1-5-32-545","Mandatory group"\r\n"Etichetta obbligatoria\\\\Livello obbligatorio alto","Label"," ${label}",""\r\n`.replace(` ${label}`,label);
  const run=(label:string)=>async(file:string,args:string[])=>{asked.push(`${file} ${args.join(' ')}`);return csv(label);};
  assert.equal(await detectElevation({platform:'win32',systemRoot:'C:\\Windows',run:run('S-1-16-12288')}),true);
  assert.equal(await detectElevation({platform:'win32',systemRoot:'C:\\Windows',run:run('S-1-16-16384')}),true,'System');
  assert.equal(await detectElevation({platform:'win32',systemRoot:'C:\\Windows',run:run('S-1-16-8192')}),false,'Medium: an administrator account in a normal window');
  assert.equal(await detectElevation({platform:'win32',systemRoot:'C:\\Windows',run:async()=>{throw new Error('ENOENT');}}),false);
  assert.match(asked[0]!,/^C:\\Windows[\\/]System32[\\/]whoami\.exe \/groups \/fo csv \/nh$/u,'by its full path: Git for Windows has another whoami');
  assert.equal(await detectElevation({platform:'linux',getuid:()=>0}),true);
  assert.equal(await detectElevation({platform:'linux',getuid:()=>1000}),false);
});

test('Desktop review e7b73d6d0: an empty or relative SystemRoot never looks for whoami in the current folder; a getuid that throws says «no»; whoami gets only SystemRoot',async()=>{
  const asked:string[]=[];const envs:Record<string,string>[]=[];
  const csv='"Mandatory Label\\Medium Mandatory Level","Label","S-1-16-8192",""\r\n';
  const run=async(file:string,_args:string[],env:Record<string,string>)=>{asked.push(file);envs.push(env);return csv;};
  for(const systemRoot of ['','Windows','C:Windows',null])await detectElevation({platform:'win32',systemRoot,run});
  assert.deepEqual(asked,Array(4).fill('C:\\Windows\\System32\\whoami.exe'),'always an absolute path');
  assert.equal(await detectElevation({platform:'linux',getuid:()=>{throw new Error('EPERM');}}),false);
  assert.equal(await detectElevation({platform:'darwin',getuid:undefined}),false);
  envs.length=0;
  await detectElevation({platform:'win32',systemRoot:'D:\\Win',run});
  assert.deepEqual(envs,[{SystemRoot:'D:\\Win'}],'never this process\'s environment');
  /* the real launcher: the child sees only what it is given, not a key in this process's environment */
  process.env.TALOS_ELEVATION_CANARY='secret';
  try{
    const seen=JSON.parse(await runFile(process.execPath,['-e','process.stdout.write(JSON.stringify(Object.keys(process.env)))'],{SystemRoot:'C:\\Windows'}));
    assert.equal(seen.includes('TALOS_ELEVATION_CANARY'),false,'the canary leaked into the child');
    assert.ok(seen.some((k:string)=>k.toLowerCase()==='systemroot'));
  }finally{delete process.env.TALOS_ELEVATION_CANARY;}
});

test('the lease and the registration say elevated; a normal one says nothing',async()=>{
  const f=folder();
  try{
    const dir=remotePaths(f.d).dir;
    const a=createHostLease({dir,role:'serve',fileName:'a.json',elevated:()=>true});a.tryAcquire();
    const b=createHostLease({dir,role:'serve',fileName:'b.json',elevated:()=>false});b.tryAcquire();
    assert.equal(JSON.parse(readFileSync(join(dir,'a.json'),'utf8')).elevated,true);
    assert.equal('elevated' in JSON.parse(readFileSync(join(dir,'b.json'),'utf8')),false);
    const handlers={attached:()=>[],call:async()=>({stato:200,dati:{}}),subscribe:()=>()=>{}};
    const admin=await openWindowChannel({dataRoot:f.d,label:'ops',elevated:true,handlers});
    const plain=await openWindowChannel({dataRoot:f.d,label:'site',handlers});
    try{
      const seen=readRegistrations(f.d);
      assert.equal(seen.find(r=>r.label==='ops')?.elevated,true);
      assert.equal(seen.find(r=>r.label==='site')?.elevated,undefined);
    }finally{await admin.close();await plain.close();}
  }finally{f.done();}
});

test('an administrator window open: a normal window leaves the free lease to it and says «via the administrator window»',async()=>{
  const f=folder();const log:string[]=[];
  try{
    const w=windowOf(f.d,{pid:101,label:'site',elevated:false,registrations:()=>[ADMIN],log});
    await w.r.start();
    assert.deepEqual([w.r.getSnapshot().state,w.r.getSnapshot().elsewhere,w.r.getSnapshot().elsewhereElevated],['elsewhere','ops',true]);
    assert.equal(leaseOnDisk(f.d),null,'the lease stays free for the administrator window');
    assert.deepEqual(log,[],'no host started here');
    await assert.rejects(w.r.toolCoordinator().stato(),{code:'REMOTE_HOST_ELEVATED'},'the model\'s tools say why, not «unreachable»');
    await w.r.stop();
  }finally{f.done();}
});

test('a dead administrator window does not count: the normal window hosts',async()=>{
  const f=folder();const log:string[]=[];
  try{
    const w=windowOf(f.d,{pid:101,label:'site',elevated:false,registrations:()=>[ADMIN],alive:pid=>pid!==ADMIN.pid,log});
    await w.r.start();
    assert.equal(w.r.getSnapshot().state,'host');
    await w.r.stop();
  }finally{f.done();}
});

test('a normal host hands the bridge to an administrator window at its beat — not in the middle of a pairing',async()=>{
  const f=folder();const log:string[]=[];let admins:WindowRegistration[]=[];
  try{
    const w=windowOf(f.d,{pid:101,label:'site',elevated:false,registrations:()=>admins,log});
    await w.r.start();
    assert.equal(w.r.getSnapshot().state,'host');
    /* a pairing opened from this window, then the administrator window opens */
    const pairing=await w.r.pairingTarget('window');
    const offer=await pairing.apriAccoppiamento();
    admins=[ADMIN];
    await w.beat();
    assert.equal(w.r.getSnapshot().state,'host','not in the middle of a pairing');
    assert.ok(leaseOnDisk(f.d),'still its lease');
    pairing.chiudiAccoppiamento(offer.gettone);await w.r.pairingEnded('window');
    await w.beat();
    assert.deepEqual([w.r.getSnapshot().state,w.r.getSnapshot().elsewhere,w.r.getSnapshot().elsewhereElevated],['elsewhere','ops',true]);
    assert.equal(leaseOnDisk(f.d),null,'released for the administrator window');
    assert.deepEqual(log,['site:on','site:off']);
    /* the next beats do not take it back while the administrator window lives */
    await w.beat();
    assert.equal(leaseOnDisk(f.d),null);
    await w.r.stop();
  }finally{f.done();}
});

test('the administrator window takes the lease marked elevated; the other windows then say who has it, and a normal one cannot reach it',async()=>{
  const f=folder();const log:string[]=[];
  try{
    const admin=windowOf(f.d,{pid:4242,label:'ops',elevated:true,registrations:()=>[ADMIN],log});
    await admin.r.start();
    assert.equal(admin.r.getSnapshot().state,'host');
    assert.equal(admin.r.getSnapshot().elevated,true);
    assert.equal(admin.r.servesAsAdministrator(),true);
    assert.equal(leaseOnDisk(f.d)?.elevated,true);
    const normal=windowOf(f.d,{pid:101,label:'site',elevated:false,log});
    await normal.r.start();
    assert.deepEqual([normal.r.getSnapshot().state,normal.r.getSnapshot().elsewhere,normal.r.getSnapshot().elsewhereElevated],['elsewhere','ops',true]);
    assert.equal(normal.r.servesAsAdministrator(),true,'through it, the devices act as administrator');
    await assert.rejects(normal.r.pairingTarget(),{code:'REMOTE_HOST_ELEVATED'});
    await normal.r.stop();await admin.r.stop();
  }finally{f.done();}
});

test('the window\'s own lease (not one a test passes) is marked elevated once the window knows it runs as administrator',async()=>{
  const f=folder();
  try{
    const r=createTuiRemote({dataRoot:f.d,label:'ops',createHost:async()=>fakeHost([],'ops'),turnedOn:()=>true,elevated:async()=>true,
      registrations:()=>[],setInterval:()=>({unref(){}}),clearInterval:()=>{}});
    await r.start();
    assert.equal(r.getSnapshot().state,'host');
    assert.equal(leaseOnDisk(f.d)?.elevated,true);
    await r.stop();
  }finally{f.done();}
});

test('talos remote: a normal terminal says REMOTE_HOST_ELEVATED without trying the channel; an administrator one goes through, and says so at pairing',async()=>{
  const f=folder();
  try{
    mkdirSync(remotePaths(f.d).dir,{recursive:true});
    writeFileSync(leaseFile(f.d),JSON.stringify({pid:process.pid,token:'HELD',role:'serve',startedAt:new Date().toISOString(),beatAt:new Date().toISOString(),kind:'window',label:'ops',elevated:true}));
    let tries=0;
    const client:any={request:async()=>({ok:true}),close(){}};
    await assert.rejects(openCoordinator({paths:{dataRoot:f.d}} as any,{elevated:async()=>false,connect:async()=>{tries++;return client;},sleep:async()=>{}}),{code:'REMOTE_HOST_ELEVATED'});
    assert.equal(tries,0,'never three failed connects to a channel Windows would refuse');
    const got=await openCoordinator({paths:{dataRoot:f.d}} as any,{elevated:async()=>true,connect:async()=>{tries++;return client;}});
    assert.deepEqual([got.via,got.administrator],['window',true]);
    await got.close();
    rmSync(leaseFile(f.d));
    /* nobody hosts: an administrator terminal hosts itself, marked so */
    const own=await openCoordinator({paths:{dataRoot:f.d}} as any,{elevated:async()=>true,openOwn:async()=>({remote:fakeHost([],'cmd').remote,stop:async()=>{}}),setInterval:()=>1,clearInterval:()=>{}});
    assert.deepEqual([own.via,own.administrator],['own',true]);
    assert.equal(leaseOnDisk(f.d)?.elevated,true);
    await own.close();
    assert.equal(existsSync(leaseFile(f.d)),false);
  }finally{f.done();}
});

test('the footer: the fixed warning right after the mode, kept at 80 columns; a normal window names the administrator window',()=>{
  const base={mode:'default',noSandbox:false,queueCount:0,model:'m',snapshot:null,workspace:'w',branch:null};
  const text=(row:{text:string}[])=>row.map(s=>s.text).join('');
  const admin=footerModeRow({...base,width:80,remote:{phones:['Pad di Nino'],elsewhere:null,administrator:true}} as any);
  assert.match(text(admin),/^ ask before edits · ctx \S+ · ⚠ administrator: devices act here as administrator/u);
  assert.equal(admin.find(s=>s.text.includes('administrator'))?.roles?.includes('warn'),true);
  assert.match(text(footerModeRow({...base,width:120,remote:{phones:[],elsewhere:'ops',elsewhereAdministrator:true}} as any)),/⌁ via the administrator window “ops”/u);
  assert.match(text(footerModeRow({...base,width:120,remote:{phones:[],elsewhere:'site'}} as any)),/⌁ via the window “site”/u);
  assert.doesNotMatch(text(footerModeRow({...base,width:120,remote:{phones:['Pad'],elsewhere:null}} as any)),/administrator/u);
});

test('pairing through an administrator window: the QR and the code say the device gets administrator rights; otherwise nothing',()=>{
  const qr={screen:'qr' as const,qr:{lato:1,righe:['1']},secondsLeft:299};
  const admin=rowsText(pairingRows(qr,{width:120,administrator:true})).join('\n');
  assert.match(admin,/Administrator window: the device/u);assert.match(admin,/gets administrator rights here\./u);
  assert.doesNotMatch(rowsText(pairingRows(qr,{width:120})).join('\n'),/dministrator/u);
  const code={screen:'code' as const,phone:'Pad',code:'645739',attemptsLeft:3};
  assert.match(rowsText(pairingRows(code,{administrator:true})).join('\n'),/This window runs as administrator: the device gets administrator rights here\./u);
  assert.doesNotMatch(rowsText(pairingRows(code)).join('\n'),/dministrator/u);
  for(const line of ['Administrator window: the device','gets administrator rights here.'])assert.ok(line.length<=34,'the side column of the mockup is 34 wide');
});

/* Block 8 E-R2: the CLI's three hunt points on 431b02e0a, confirmed by the reviewer (E-cli-b8.test.ts REV-B8-E1..E3), cured. */
test('block 8 C-R2/C-R3 (mirrored from the kernel 1abc52393): only a drive-letter root; only the SID column counts, never a group name',async()=>{
  const asked:string[]=[];
  const medium='"Mandatory Label\\Medium Mandatory Level","Label","S-1-16-8192",""\r\n';
  const run=async(file:string)=>{asked.push(file);return medium;};
  for(const systemRoot of [String.raw`\Windows`,String.raw`\\srv\share`,'/Windows'])await detectElevation({platform:'win32',systemRoot,run});
  assert.deepEqual(asked,Array(3).fill(String.raw`C:\Windows\System32\whoami.exe`),'no drive-less or network root');
  const spoof='"DOM\\""S-1-16-12288""","Group","S-1-5-21-1-2-3-1111",""\r\n'+medium;
  assert.equal(await detectElevation({platform:'win32',systemRoot:String.raw`C:\Windows`,run:async()=>spoof}),false,'a group NAME holding a High SID does not make a Medium token High');
  assert.equal(await detectElevation({platform:'win32',systemRoot:String.raw`C:\Windows`,run:async()=>'"x","Label","S-1-16-12288",""'}),true);
});

test('block 8 REV-B8-E1: the QR expired but a device waits for its code to be confirmed — the normal host does not hand the bridge over',async()=>{
  const f=folder();const log:string[]=[];let admins:WindowRegistration[]=[];let waiting=false;
  try{
    const host=fakeHost(log,'site');
    host.remote.stato=async()=>({inLinea:[],telefoni:[],consensi:[],attese:waiting?[{id:'tel-1',nome:'Pad'}]:[]});
    host.remote.apriAccoppiamento=async()=>({gettone:'g1',qr:'q',scadeAlle:Date.now()+100,moduli:{lato:1,righe:['1']}});
    const w=windowOf(f.d,{pid:101,label:'site',elevated:false,registrations:()=>admins,log,createHost:async()=>host});
    await w.r.start();
    const pairing=await w.r.pairingTarget('window');
    await pairing.apriAccoppiamento();
    waiting=true;await pause(150);
    admins=[ADMIN];await w.beat();
    assert.deepEqual(log,['site:on'],'still the host while the code is being compared');
    waiting=false;pairing.chiudiAccoppiamento('g1');await w.r.pairingEnded('window');await w.beat();
    assert.deepEqual(log,['site:on','site:off'],'confirmed or gone: then the bridge goes to the administrator window');
    await w.r.stop();
  }finally{f.done();}
});

test('block 8 REV-B8-E2: an administrator window that never takes the free bridge is passed over after the grace — a normal window hosts, and keeps it',async()=>{
  const f=folder();const log:string[]=[];
  try{
    const w=windowOf(f.d,{pid:101,label:'site',elevated:false,registrations:()=>[ADMIN],log,graceMs:60});
    await w.r.start();
    assert.equal(w.r.getSnapshot().state,'elsewhere','first it leaves the bridge to the administrator window');
    await pause(80);await w.beat();await w.beat();
    assert.equal(w.r.getSnapshot().state,'host','the administrator window did not take it in time: this one hosts');
    assert.equal(leaseOnDisk(f.d)?.label,'site');
    await w.beat();await w.beat();
    assert.deepEqual(log,['site:on'],'and keeps it: no hand-over back and forth to the window that failed');
    await w.r.stop();
  }finally{f.done();}
});

test('block 8 REV-B8-E3: a registration whose channel is missing (a fallen window, a reused pid) or opens to a normal window is no administrator window',async()=>{
  for(const answer of ['missing','open'] as const){
    const f=folder();const log:string[]=[];const probed:string[]=[];
    try{
      const w=windowOf(f.d,{pid:101,label:'site',elevated:false,registrations:()=>[ADMIN],log,probe:async(channel:string)=>{probed.push(channel);return answer;}});
      await w.r.start();
      assert.equal(w.r.getSnapshot().state,'host',answer);
      assert.deepEqual(probed,[ADMIN.channel],'its channel was asked');
      assert.equal(w.r.servesAsAdministrator(),false);
      await w.beat();
      assert.equal(probed.length,1,'a refuted registration is not asked again at every beat');
      await w.r.stop();
    }finally{f.done();}
  }
});

test('block 8 E-R2: the real probe — a pipe that does not exist is «missing», a pipe a normal process can open is «open»',async()=>{
  const {createServer}=await import('node:net');
  const {probeChannelByConnect}=await import('../../src/remote/tui-remote.ts');
  const name=String.raw`\\.\pipe\talos-admin-probe-`+`${process.pid}-${Date.now()}`;
  assert.equal(await probeChannelByConnect(name),'missing');
  const server=createServer(socket=>socket.destroy());
  await new Promise<void>(resolve=>server.listen(name,resolve));
  try{assert.equal(await probeChannelByConnect(name),'open');}
  finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
