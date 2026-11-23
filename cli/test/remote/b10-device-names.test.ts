/*
 * Block 10 (the Desktop's review up to 0d7be1be0), cured:
 * - E-R1: a device's own name reaches no screen raw — the pairing code («Pair “<name>”?», where the person decides) and the
 *   `talos remote list` / `revoke` / `folders` rows too, besides the three places of block 9 H-R3;
 * - E-R2: ONE filter for a device's name (device-name.ts: \p{Cc}\p{Cf} and U+2028/2029), shared with the bubble's «from the device»;
 *   the administrator probe proves only with a refusal: another error, no answer in time, or a probe that throws prove nothing.
 */
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import test from 'node:test';
import {phoneRows,remoteRevoke} from '../../src/commands/remote-cli.ts';
import {cleanDeviceName,deviceNameText} from '../../src/remote/device-name.ts';
import {runPairingFlow,type RemoteCoordinator} from '../../src/remote/pairing-flow.ts';
import {probeChannelByConnect} from '../../src/remote/tui-remote.ts';
import {deviceOf} from '../../src/tui/event-adapter.ts';

const ch=(...codes:number[])=>String.fromCodePoint(...codes);
const ESC=ch(0x1b),NL=ch(0x0a),TAB=ch(0x09),RLO=ch(0x202e),ZWSP=ch(0x200b),WJ=ch(0x2060),SHY=ch(0xad),LS=ch(0x2028),PS=ch(0x2029),TAG=ch(0xe0001),MVS=ch(0x180e);
const NASTY=`Pad${NL}  ${ESC}]52;c;ZXZpbA==${ch(0x07)} ok${TAB}di${RLO}Nino${ZWSP}${WJ}${SHY}${LS}${PS}${TAG}${MVS}!`;
const SAFE=/^[^\p{Cc}\p{Cf}\u2028\u2029]*$/u;

test('E-R2: one filter — controls, format characters and the line/paragraph separators go; a pair is never cut in half',()=>{
  const clean=cleanDeviceName(NASTY);
  assert.match(clean,SAFE,JSON.stringify(clean));
  assert.equal(clean,'Pad ]52;c;ZXZpbA== ok di Nino !');
  assert.equal(cleanDeviceName(`${ZWSP}${RLO}${NL}`),'device','nothing printable: «device»');
  assert.equal(deviceNameText(`${ZWSP}`),'','or nothing, when the caller says so');
  const long='a'.repeat(63)+ch(0x1f600);
  assert.equal(Array.from(deviceNameText(long+'zzz')).length,64,'64 code points');
  assert.equal(deviceNameText(long+'zzz').slice(-2),ch(0x1f600),'the emoji is whole');
  /* the bubble «from the device X» uses the same filter */
  assert.equal(deviceOf({origin:{kind:'device',name:NASTY}}),clean);
});

test('E-R1: the pairing-code screen shows the device name cleaned — no fake line under the question, no ESC to the terminal',async()=>{
  let waiting:any[]=[];const drawn:any[]=[];const keys:any[]=[];const waiters:((k:any)=>void)[]=[];
  const push=(k:any)=>{const w=waiters.shift();if(w)w(k);else keys.push(k);};
  const remote:RemoteCoordinator={
    async stato(){return{disponibile:true,sceltaFatta:true,attese:waiting,accoppiamento:{sbagliati:0,bloccatoFinoA:null}};},
    async imposta(){return{};},
    async apriAccoppiamento(){return{gettone:'g1',qr:'talos-remote:1?t=g1',scadeAlle:Date.now()+300_000,moduli:{lato:1,righe:['1']}} as any;},
    chiudiAccoppiamento(){},
    async conferma(){waiting=[];},
    rifiuta(){waiting=[];return true;},
  };
  const out=await runPairingFlow(remote,{
    nextKey:()=>keys.length?Promise.resolve(keys.shift()):new Promise(r=>waiters.push(r)),
    sleep:(_ms:number,signal:AbortSignal)=>new Promise<void>(r=>{const t=setTimeout(r,1);signal.addEventListener('abort',()=>{clearTimeout(t);r();});}),
    now:()=>Date.now(),
    draw:(s:any)=>{drawn.push(s);if(s.screen==='qr'&&!waiting.length&&!drawn.some(d=>d.screen==='code')){waiting=[{id:'w1',nome:NASTY,codice:'482913'}];setTimeout(()=>push('enter'),5);}},
    copy:async()=>true,ensureComponent:async()=>{},
  } as any);
  const code=drawn.find(s=>s.screen==='code');
  assert.match(code.phone,SAFE);
  assert.equal(code.phone,cleanDeviceName(NASTY));
  assert.deepEqual(out,{result:'paired',phone:cleanDeviceName(NASTY)});
});

test('E-R1: `talos remote list` rows print the cleaned name',()=>{
  const rows=phoneRows([{id:'p1',nome:NASTY,collegatoAlle:Date.now()}]);
  assert.match(rows[0]!.name,SAFE);
  assert.equal(phoneRows([{id:'p2',nome:`${ZWSP}`,collegatoAlle:Date.now()}])[0]!.name,'device');
});

test('E-R4 (Desktop review block 11, MB11-7): `talos remote revoke` prints the cleaned name; it revokes the device asked',async()=>{
  const revoked:string[]=[];
  const out=await remoteRevoke({revoca:async(id:string)=>{revoked.push(id);}} as any,[{id:'p1',nome:NASTY,collegatoAlle:Date.now()}],'p1');
  assert.deepEqual(revoked,['p1']);
  const printed=out.rows.flat().map((segment:any)=>String(segment.text??'')).join('');
  assert.match(printed,SAFE,JSON.stringify(printed));
  assert.match(printed,/Pad \]52;c;ZXZpbA== ok di Nino !/u,'the name is there, cleaned');
});

/* a socket that answers as the test says (probeChannelByConnect's connect is injectable) */
function fakeSocket(behave:(s:EventEmitter)=>void){
  return()=>{const s:any=new EventEmitter();s.destroy=()=>{};s.setTimeout=(ms:number,fn:()=>void)=>{setTimeout(fn,ms);};setImmediate(()=>behave(s));return s;};
}
test('E-R2: only a refusal proves an administrator\'s pipe; another error, no answer in time, prove nothing',async()=>{
  const error=(code:string)=>fakeSocket(s=>s.emit('error',Object.assign(new Error(code),{code})));
  assert.equal(await probeChannelByConnect('p',1000,error('EPERM')),'denied');
  assert.equal(await probeChannelByConnect('p',1000,error('EACCES')),'denied');
  assert.equal(await probeChannelByConnect('p',1000,error('ECONNRESET')),'missing','a reset proves nothing');
  assert.equal(await probeChannelByConnect('p',1000,error('EBUSY')),'missing');
  assert.equal(await probeChannelByConnect('p',1000,error('ENOENT')),'missing');
  assert.equal(await probeChannelByConnect('p',30,fakeSocket(()=>{})),'missing','no answer in time proves nothing');
  assert.equal(await probeChannelByConnect('p',1000,fakeSocket(s=>s.emit('connect'))),'open');
});
