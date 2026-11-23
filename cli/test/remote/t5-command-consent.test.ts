/*
 * 0.6.15 T5 («Fuori dalla TUI la mostra `talos remote`»): `talos remote` hosting itself shows a device's folder request — the
 * window's card, the same words, «Not now» first, the approvals' grace — and the pairing waits under it; answered, expired or
 * answered on the device, the pairing's frame comes back. Ctrl+C still ends everything. The answer is a change: the command's own
 * coordinator asks the host lease first. The terminal reader gives ←, → and Tab for the card.
 */
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {openCoordinator} from '../../src/commands/remote-cli.ts';
import {createCommandConsent,type CommandConsentSource} from '../../src/remote/command-consent.ts';
import type {PairingKey} from '../../src/remote/pairing-flow.ts';
import {readTerminalKeys} from '../../src/remote/terminal.ts';
import type {TuiRemoteConsent} from '../../src/remote/tui-remote.ts';

const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
/* a key that never comes is a red at once, not a test hung until the runner gives up */
const within=<T,>(promise:Promise<T>,ms=1000)=>Promise.race([promise,pause(ms).then(()=>{throw new Error('timed out waiting for a key');})]);
const REQUEST:TuiRemoteConsent={richiestaId:'c1',device:'Pad di Nino',folder:'C:\\progetti\\talos',expiresAt:Date.now()+120_000};

function fakeKeys(){
  const queue:(PairingKey|null)[]=[];const waiting:((k:PairingKey|null)=>void)[]=[];
  return{
    press(...keys:(PairingKey|null)[]){for(const k of keys){const w=waiting.shift();if(w)w(k);else queue.push(k);}},
    next(){if(queue.length)return Promise.resolve(queue.shift()!);return new Promise<PairingKey|null>(resolve=>waiting.push(resolve));},
  };
}
function fakeSource(initial:TuiRemoteConsent[]=[]){
  let requests=[...initial];const listeners=new Set<()=>void>();const answers:[string,boolean][]=[];
  const source:CommandConsentSource={
    list:async()=>requests,
    listen:(fn)=>{listeners.add(fn);return()=>{listeners.delete(fn);};},
    answer:async(id,allow)=>{answers.push([id,allow]);requests=requests.filter(r=>r.richiestaId!==id);},
  };
  return{source,answers,set(next:TuiRemoteConsent[]){requests=next;for(const fn of listeners)fn();}};
}
function gateWith(source:CommandConsentSource,keys:ReturnType<typeof fakeKeys>,clock:{now:number}){
  const drawn:string[][]=[];
  const gate=createCommandConsent({source,keys,width:()=>100,now:()=>clock.now,graceMs:500,
    paint:rows=>rows.map(row=>row.map(s=>s.text).join('')),draw:lines=>{drawn.push(lines);},setInterval:()=>1,clearInterval:()=>{}});
  return{gate,drawn,last:()=>drawn.at(-1)!.join('\n')};
}

test('a request while pairing: the card replaces the frame, the pairing gets no keys; after the grace → and Enter allow; the QR comes back',async()=>{
  const clock={now:1_000_000};const keys=fakeKeys();const src=fakeSource();
  const {gate,last}=gateWith(src.source,keys,clock);
  await gate.start();
  gate.draw(['QR FRAME']);
  assert.equal(last(),'QR FRAME');
  src.set([REQUEST]);await pause(10);
  assert.match(last(),/Allow “Pad di Nino” to work in this folder\?/u);
  assert.match(last(),/C:\\progetti\\talos/u);
  gate.draw(['QR FRAME 2']);
  assert.match(last(),/Allow “Pad di Nino”/u,'the pairing redraws under the card, not over it');
  let reached:PairingKey|null|undefined;void gate.keys.next().then(k=>{reached=k;});
  keys.press('right','enter');await pause(10);
  assert.deepEqual(src.answers,[],'keys in the grace never answer (an Enter typed ahead)');
  clock.now+=600;keys.press('right','enter');await pause(20);
  assert.deepEqual(src.answers,[['c1',true]]);
  assert.equal(reached,undefined,'none of those keys reached the pairing');
  assert.equal(last(),'QR FRAME 2','the pairing\'s last frame is back');
  keys.press('c');await pause(5);
  assert.equal(reached,'c','afterwards the keys are the pairing\'s again');
  gate.stop();
});

test('Enter alone is «Not now»; Esc is «Not now»',async()=>{
  for(const key of ['enter','esc'] as const){
    const clock={now:2_000_000};const keys=fakeKeys();const src=fakeSource([REQUEST]);
    const {gate}=gateWith(src.source,keys,clock);
    await gate.start();
    clock.now+=600;keys.press(key);await pause(20);
    assert.deepEqual(src.answers,[['c1',false]],key);
    gate.stop();
  }
});

test('expired or answered on the device: the card goes, the frame comes back, nothing is answered here',async()=>{
  const clock={now:3_000_000};const keys=fakeKeys();const src=fakeSource();
  const {gate,last}=gateWith(src.source,keys,clock);
  await gate.start();gate.draw(['QR']);
  src.set([REQUEST]);await pause(10);
  assert.ok(gate.open());
  src.set([]);await pause(10);
  assert.equal(gate.open(),null);
  assert.equal(last(),'QR');
  assert.deepEqual(src.answers,[]);
  gate.stop();
});

test('Ctrl+C with the card open still ends the pairing; with no card the keys pass in order',async()=>{
  const clock={now:4_000_000};const keys=fakeKeys();const src=fakeSource();
  const {gate}=gateWith(src.source,keys,clock);
  await gate.start();
  keys.press('up','enter');
  assert.deepEqual([await within(gate.keys.next()),await within(gate.keys.next())],['up','enter']);
  src.set([REQUEST]);await pause(10);
  keys.press(null);
  assert.equal(await within(gate.keys.next()),null);
  assert.deepEqual(src.answers,[]);
  gate.stop();
});

test('the terminal reader gives ←, → and Tab',async()=>{
  const stdin=Object.assign(new EventEmitter(),{isRaw:false,setRawMode(){},resume(){},pause(){}}) as any;
  const reader=readTerminalKeys(stdin);
  stdin.emit('data','\u001b[C\u001b[D\t\u001bOC');
  assert.deepEqual([await within(reader.next()),await within(reader.next()),await within(reader.next()),await within(reader.next())],['right','left','tab','right']);
  reader.close();
});

test('the command hosting itself: the answer reaches the kernel\'s rispondi after the lease check; lease lost, nothing is answered',async()=>{
  const d=mkdtempSync(join(tmpdir(),'talos-t5-consent-'));
  try{
    const answered:[string,string][]=[];let owns=true;
    const lease={tryAcquire:()=>({ok:true}),beat:()=>true,owns:()=>owns,release:()=>{}} as any;
    const remote:any={stato:async()=>({consensi:[{richiestaId:'c1',nomeDispositivo:'Pad di Nino',percorso:'C:\\x',scadeAlle:new Date(Date.now()+60_000).toISOString()}]}),
      imposta:async()=>({}),apriAccoppiamento:async()=>({}),chiudiAccoppiamento:()=>{},conferma:async()=>({}),rifiuta:()=>true,revoca:async()=>({}),
      cartelle:{ascolta:()=>()=>{},rispondi:async(id:string,esito:string)=>{answered.push([id,esito]);}}};
    const got=await openCoordinator({paths:{dataRoot:d}} as any,{lease,elevated:async()=>false,openOwn:async()=>({remote,stop:async()=>{}}),setInterval:()=>1,clearInterval:()=>{}});
    assert.deepEqual((await got.consents!.list()).map(c=>[c.richiestaId,c.device,c.folder]),[['c1','Pad di Nino','C:\\x']]);
    await got.consents!.answer('c1',true);
    assert.deepEqual(answered,[['c1','consentita']]);
    owns=false;
    await assert.rejects(got.consents!.answer('c1',false),{code:'REMOTE_LEASE_LOST'});
    assert.deepEqual(answered,[['c1','consentita']]);
    await got.close();
    /* through a window there is no card here: that window shows its own */
    const viaWindow=await openCoordinator({paths:{dataRoot:d}} as any,{elevated:async()=>false,lease:{tryAcquire:()=>({ok:false,holder:{pid:1,token:'T',kind:'window'}})} as any,
      connect:async()=>({request:async()=>({}),close(){}}) as any});
    assert.equal(viaWindow.consents,undefined);
    await viaWindow.close();
  }finally{rmSync(d,{recursive:true,force:true});}
});
