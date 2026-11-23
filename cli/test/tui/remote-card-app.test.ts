/*
 * 0.6.15 T4: `/remote` inside the TUI on the real TuiApp (the consent fixture's mount, a fake coordinator behind the window's remote
 * bridge). The approved plan: «la stessa sequenza in un riquadro, con la storia della sessione che resta» — the QR in a card,
 * `c` copies, Esc closes the QR (its token closed in the host), the code and Enter pair, a line stays in the conversation; a window
 * too small says so; and T6's `remote_phone_pair`, after the person's yes, opens the QR with `soloSeAcceso`.
 */
import assert from 'node:assert/strict';
import {after,test} from 'node:test';
import {ESC,fakeRemote,mountApp,sleep} from './consent-order-fixture.ts';
import {hermeticProfile} from './r1-layout-fixture.ts';

const env=hermeticProfile();after(()=>env.restore());
const modules=(lato:number)=>({lato,righe:Array.from({length:lato},(_,r)=>Array.from({length:lato},(_,c)=>(r*7+c*3)%5<2?'1':'0').join(''))});
const OK={status:'completed',receipt:{status:null,allowed:null,via:null,reason:null,risk:null},enforcement:null};
function pairingRemote({lato=21,waiting=null as null|{id:string;nome:string;codice:string}}={}){
  const calls:Array<[string,...unknown[]]>=[];let ended=0;
  let attese:any[]=[];
  const coordinator={
    stato:async()=>{calls.push(['stato']);return{disponibile:true,sceltaFatta:true,acceso:true,attese,accoppiamento:{sbagliati:0}};},
    imposta:async(i:any)=>{calls.push(['imposta',i]);return{};},
    apriAccoppiamento:async(o?:any)=>{calls.push(['apriAccoppiamento',o??null]);if(waiting)setTimeout(()=>{attese=[waiting];},300);return{gettone:'g1',qr:'talos-remote:1?pc=x',scadeAlle:Date.now()+300_000,moduli:modules(lato)};},
    chiudiAccoppiamento:(g:string)=>{calls.push(['chiudiAccoppiamento',g]);},
    conferma:async(id:string)=>{calls.push(['conferma',id]);return{};},
    rifiuta:async(id:string)=>{calls.push(['rifiuta',id]);return true;},
    revoca:async()=>({}),
  };
  const remote:any={...fakeRemote(),pairingTarget:async()=>coordinator,pairingEnded:async()=>{ended++;}};
  return{remote,calls,ended:()=>ended};
}
const CARD=/Pair a device · Esc closes/u;

test('/remote: the QR in a card over the conversation; Esc closes it, its token closed in the host, and the composer types again',async()=>{
  const {remote,calls,ended}=pairingRemote();
  const app=await mountApp({cols:120,rows:40,root:env.root,paths:env.paths,clock:()=>Date.now(),remote});
  try{
    app.press('/remote');await sleep(150);app.press('\r');
    const shown=await app.waitFor('the card with the QR',s=>CARD.test(s.text)&&/[▀▄█]/u.test(s.text)&&/Scan with the TALOS app on/u.test(s.text));
    assert.match(shown.text,/expires \d:\d\d {2}· {2}works once/u);
    app.press(ESC);
    await app.waitFor('the card closed',s=>!CARD.test(s.text));
    assert.deepEqual(calls.filter(c=>c[0]!=='stato'),[['apriAccoppiamento',null],['chiudiAccoppiamento','g1']]);
    for(let i=0;i<40&&ended()===0;i++)await sleep(25);
    assert.equal(ended(),1,'the window\'s pairing ended (the host may stop hosting if remote control is still off)');
    app.press('x');
    await app.waitFor('the composer types',s=>s.lines.some(line=>/^│ › x/u.test(line)));
  }finally{app.unmount();}
});

test('/remote: a device waiting shows its code; Enter pairs it and a line stays in the conversation',async()=>{
  const {remote,calls}=pairingRemote({waiting:{id:'w1',nome:'Pad di Nino',codice:'645739'}});
  const app=await mountApp({cols:120,rows:40,root:env.root,paths:env.paths,clock:()=>Date.now(),remote});
  try{
    app.press('/remote');await sleep(150);app.press('\r');
    await app.waitFor('the code',s=>/645 739/u.test(s.text)&&/Pad di Nino/u.test(s.text));
    app.press('\r');
    const after=await app.waitFor('the paired line',s=>/✓ “Pad di Nino” is paired until you revoke it\./u.test(s.text)&&!CARD.test(s.text));
    assert.ok(after);
    assert.ok(calls.some(c=>c[0]==='conferma'&&c[1]==='w1'));
  }finally{app.unmount();}
});

test('/remote in an 80×24 window: the n0-sized QR does not fit — the card says so and offers the link',async()=>{
  const {remote}=pairingRemote({lato:57});
  const app=await mountApp({cols:80,rows:24,root:env.root,paths:env.paths,clock:()=>Date.now(),remote});
  try{
    app.press('/remote');await sleep(150);app.press('\r');
    const s=await app.waitFor('the too-small card',x=>/too small for the QR/u.test(x.text));
    assert.equal(/[▀▄█]/u.test(s.text),false,'no cut QR');
    assert.match(s.text,/c copy link/u);
    app.press(ESC);await app.waitFor('closed',x=>!CARD.test(x.text));
  }finally{app.unmount();}
});

test('T6: the model\'s remote_phone_pair, after the person\'s yes, opens the QR here with soloSeAcceso; a failed one or a replay does not',async()=>{
  const {remote,calls}=pairingRemote();
  const app=await mountApp({cols:120,rows:40,root:env.root,paths:env.paths,clock:()=>Date.now(),remote});
  try{
    app.emit('run.started',{runId:'r1',input:{prompt:'pair my phone'}});
    app.emit('tool.started',{toolCallId:'p0',toolName:'remote_phone_pair'});
    app.emit('tool.completed',{toolCallId:'p0',content:'Remote control was turned off',...OK,status:'failed'});
    await sleep(300);
    assert.equal(calls.some(c=>c[0]==='apriAccoppiamento'),false,'a failed call opens nothing');
    app.emit('tool.started',{toolCallId:'p1',toolName:'remote_phone_pair'});
    app.emit('tool.completed',{toolCallId:'p1',content:'The pairing QR code is now on the person\'s screen',...OK});
    await app.waitFor('the card with the QR',s=>CARD.test(s.text)&&/[▀▄█]/u.test(s.text));
    assert.deepEqual(calls.find(c=>c[0]==='apriAccoppiamento'),['apriAccoppiamento',{soloSeAcceso:true}]);
    app.press(ESC);await app.waitFor('closed',s=>!CARD.test(s.text));
  }finally{app.unmount();}
});

test('the QR keeps dark modules on a light ground whatever the theme, colour or none (a camera reads the modules)',async()=>{
  const {roleStyle}=await import('../../src/tui/components/styled-rows.ts');
  const {QR_DARK,QR_LIGHT}=await import('../../src/remote/terminal.ts');
  for(const colors of [{} as any,{accent:'#c98b32',background:'#080b11',foreground:'#e6e6e6'} as any])
    assert.deepEqual(roleStyle(['qr'],colors),{color:QR_DARK,backgroundColor:QR_LIGHT});
});

test('/remote at 120×30 (the Windows Terminal default): a 41-module QR takes the frame and fits whole; the header comes back after',async()=>{
  const {remote}=pairingRemote({lato:41});
  const app=await mountApp({cols:120,rows:30,root:env.root,paths:env.paths,clock:()=>Date.now(),remote});
  try{
    app.press('/remote');await sleep(150);app.press('\r');
    const s=await app.waitFor('the QR',x=>/works once/u.test(x.text));
    assert.equal(/too small/u.test(s.text),false,'it fits');
    assert.equal(s.lines.filter(line=>/[▀▄█]/u.test(line)).length,21,'every QR row with a dark module is on screen');
    app.press(ESC);
    await app.waitFor('the header back',x=>/^ TALOS /mu.test(x.text)&&!CARD.test(x.text));
  }finally{app.unmount();}
});
