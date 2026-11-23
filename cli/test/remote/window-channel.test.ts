/*
 * 0.6.15 T3b: the local channel between two TALOS CLI windows (window-frame.ts, window-auth.ts, window-channel.ts), on a REAL named
 * pipe (a Unix socket elsewhere) in a temporary data folder. What the research of 26/10 asked: frames capped before allocation, a
 * mutual proof that never sends the token, nothing written to a client that has not written, a wrong token or a wrong window
 * refused, the event stream ending with `lag` past its backlog, a window that dies failing its requests with WINDOW_GONE.
 */
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,readdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {createConnection} from 'node:net';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {clientProof,newNonce,newWindowToken,sameProof,validNonce,windowProof} from '../../src/remote/window-auth.ts';
import {connectWindow,openWindowChannel,readRegistrations,removeStaleRegistration,windowsFolder,type WindowHandlers} from '../../src/remote/window-channel.ts';
import {createFrameReader,encodeFrame,FRAME_CAP_AFTER_AUTH,FRAME_CAP_BEFORE_AUTH} from '../../src/remote/window-frame.ts';

const folder=()=>{const dir=mkdtempSync(join(tmpdir(),'talos-window-'));return{dir,done:()=>rmSync(dir,{recursive:true,force:true})};};
const handlers=(over:Partial<WindowHandlers>={}):WindowHandlers=>({
  attached:()=>['s-1'],
  call:async(request)=>({stato:200,dati:{echo:request.percorso}}),
  subscribe:(_id,_from,_on)=>()=>{},
  ...over,
});
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

test('frames: a whole frame back, split anywhere; a length over the cap refused before the body arrives; zero refused',()=>{
  const bytes=encodeFrame({t:'req',id:'1',op:'identify'});
  const reader=createFrameReader(FRAME_CAP_BEFORE_AUTH);
  assert.deepEqual(reader.push(bytes.subarray(0,3)),[]);
  assert.deepEqual(reader.push(bytes.subarray(3)),[{v:1,t:'req',id:'1',op:'identify'}]);
  const head=Buffer.alloc(4);head.writeUInt32BE(FRAME_CAP_BEFORE_AUTH+1,0);
  assert.throws(()=>createFrameReader(FRAME_CAP_BEFORE_AUTH).push(head),{code:'WINDOW_FRAME_TOO_LARGE'});
  assert.throws(()=>createFrameReader().push(Buffer.alloc(4)),{code:'WINDOW_FRAME_EMPTY'});
  const whole=encodeFrame({t:'x',e:'y'.repeat(2000)},FRAME_CAP_AFTER_AUTH);
  assert.throws(()=>createFrameReader(FRAME_CAP_BEFORE_AUTH).push(whole),{code:'WINDOW_FRAME_TOO_LARGE'},'over the cap even when it arrives whole');
  const raised=createFrameReader(FRAME_CAP_BEFORE_AUTH);raised.raiseCap(FRAME_CAP_AFTER_AUTH);
  const big=encodeFrame({t:'evt',e:'x'.repeat(5000)});
  assert.equal(raised.push(big).length,1,'after the handshake a larger frame passes');
  assert.throws(()=>encodeFrame({t:'x',e:'y'.repeat(2000)},FRAME_CAP_BEFORE_AUTH),{code:'WINDOW_FRAME_TOO_LARGE'});
  const other=Buffer.from(JSON.stringify({v:2,t:'x'}));const h2=Buffer.alloc(4);h2.writeUInt32BE(other.length,0);
  assert.throws(()=>createFrameReader().push(Buffer.concat([h2,other])),{code:'WINDOW_FRAME_VERSION'});
});

test('proofs: each side proves the token without sending it; a reflected or wrong proof never passes',()=>{
  const token=newWindowToken(),nc=newNonce(),ns=newNonce();
  assert.ok(validNonce(nc)&&validNonce(ns));assert.equal(validNonce('short'),false);assert.equal(validNonce(42),false);
  const ms=windowProof(token,nc,ns),mc=clientProof(token,ns,nc);
  assert.ok(sameProof(windowProof(token,nc,ns),ms));
  assert.ok(sameProof(clientProof(token,ns,nc),mc));
  assert.equal(sameProof(clientProof(token,ns,nc),ms),false,'the window\'s proof reflected back is not the client\'s');
  assert.equal(sameProof(windowProof(newWindowToken(),nc,ns),ms),false,'another token');
  assert.equal(sameProof(ms,'x'.repeat(100)),false);assert.equal(sameProof(ms,null),false);
  assert.ok(!ms.includes(token)&&!mc.includes(token));
});

test('channel: registered, the host connects, identify names the same window, a call and attached answer, close removes the registration',{timeout:20_000},async()=>{
  const f=folder();
  const window=await openWindowChannel({dataRoot:f.dir,label:'shop-api',handlers:handlers()});
  try{
    const [registration]=readRegistrations(f.dir);
    assert.equal(registration?.id,window.identity.id);assert.equal(registration?.pid,process.pid);assert.equal(registration?.label,'shop-api');
    assert.equal(readRegistrations(f.dir,window.identity.id).length,0,'a window does not list itself');
    const client=await connectWindow(registration!);
    assert.deepEqual(await client.request('attached'),['s-1']);
    assert.deepEqual(await client.request('call',{metodo:'GET',percorso:'/api/v1/sessions'}),{stato:200,dati:{echo:'/api/v1/sessions'}});
    client.close();
  }finally{await window.close();}
  assert.deepEqual(readdirSync(windowsFolder(f.dir)).filter(n=>n.endsWith('.json')),[]);
  f.done();
});

test('channel: a wrong token is refused, and a client that only connects gets nothing written (no banner, no error)',{timeout:20_000},async()=>{
  const f=folder();
  const window=await openWindowChannel({dataRoot:f.dir,label:'p',handlers:handlers()});
  try{
    const [registration]=readRegistrations(f.dir);
    await assert.rejects(connectWindow({...registration!,token:newWindowToken()},{timeoutMs:800}),{code:'WINDOW_HANDSHAKE'});
    const silent=createConnection(registration!.channel);let received=0;
    silent.on('data',(chunk:Buffer)=>{received+=chunk.length;});
    const closed=new Promise<void>(resolve=>silent.on('close',()=>resolve()));silent.on('error',()=>{});
    await closed; /* the window closes it after its handshake time */
    assert.equal(received,0,'nothing reaches a client that never wrote');
  }finally{await window.close();f.done();}
});

test('channel: another window answering on the same channel (a registration that lies about its id) is refused',{timeout:20_000},async()=>{
  const f=folder();
  const window=await openWindowChannel({dataRoot:f.dir,label:'p',handlers:handlers()});
  try{
    const [registration]=readRegistrations(f.dir);
    await assert.rejects(connectWindow({...registration!,id:'someone-else'}),{code:'WINDOW_MISMATCH'});
    await assert.rejects(connectWindow({...registration!,startedAt:'2020-01-01T00:00:00.000Z'}),{code:'WINDOW_MISMATCH'},'a reused pid has another start');
  }finally{await window.close();f.done();}
});

test('channel: a call that fails keeps its code and status; the window dying fails what is in flight with WINDOW_GONE',{timeout:20_000},async()=>{
  const f=folder();let release:()=>void=()=>{};
  const window=await openWindowChannel({dataRoot:f.dir,label:'p',handlers:handlers({call:async(r)=>{
    if(r.percorso==='/fail')throw Object.assign(new Error('nope'),{code:'SESSION_LEASED',stato:409});
    await new Promise<void>(resolve=>{release=resolve;});return{stato:200,dati:null};
  }})});
  const [registration]=readRegistrations(f.dir);
  const client=await connectWindow(registration!);
  await assert.rejects(client.request('call',{metodo:'POST',percorso:'/fail'}),(e:any)=>e.code==='SESSION_LEASED'&&e.stato===409);
  const inFlight=client.request('call',{metodo:'POST',percorso:'/slow'});
  await sleep(50);
  await window.close();release();
  await assert.rejects(inFlight,{code:'WINDOW_GONE'});
  assert.equal(client.closed,true);
  f.done();
});

test('channel: a kernel refusal keeps its reason, params and precise explanation through another window, bounded',{timeout:20_000},async()=>{
  const f=folder();
  const window=await openWindowChannel({dataRoot:f.dir,label:'p',handlers:handlers({call:async(r)=>{
    if(r.percorso==='/refused')throw Object.assign(new Error('Refused.'),{code:'PERMISSION_DENIED',stato:403,reason:'folder-blocked',params:{cartella:'sub'},explanation:'The folder sub is blocked for this device.'});
    if(r.percorso==='/huge')throw Object.assign(new Error('Refused.'),{code:'PERMISSION_DENIED',stato:403,reason:42,params:{big:'x'.repeat(3000)},explanation:'y'.repeat(5000)});
    return{stato:200,dati:null};
  }})});
  const [registration]=readRegistrations(f.dir);
  const client=await connectWindow(registration!);
  try{
    /* Desktop block 11 (r4 6a4fc5e2b): the kernel's reason, params and precise explanation reach the device through another window */
    await assert.rejects(client.request('call',{metodo:'POST',percorso:'/refused'}),(e:any)=>{
      assert.deepEqual([e.code,e.stato,e.reason,e.params,e.explanation],['PERMISSION_DENIED',403,'folder-blocked',{cartella:'sub'},'The folder sub is blocked for this device.']);
      return true;
    });
    await assert.rejects(client.request('call',{metodo:'POST',percorso:'/huge'}),(e:any)=>{
      assert.equal(e.params,undefined,'params over 2 KB are not carried');assert.equal(e.explanation.length,1000);assert.equal(e.reason,undefined,'a reason that is not text is not carried');
      return true;
    });
  }finally{client.close();await window.close();f.done();}
});

test('channel: events stream in order from a sequence; unsubscribe stops them; past the backlog the stream ends with lag and its last sequence',{timeout:20_000},async()=>{
  const f=folder();let emit:((e:unknown)=>void)|null=null;let unsubscribed=0;let fromSeen=-1;
  const window=await openWindowChannel({dataRoot:f.dir,label:'p',handlers:handlers({subscribe:(_id,from,on)=>{fromSeen=from;emit=on;return()=>{unsubscribed++;};}})});
  try{
    const [registration]=readRegistrations(f.dir);
    const client=await connectWindow(registration!);
    const got:unknown[]=[];let ended:any=null;
    const off=client.subscribe('s-1',7,e=>got.push(e),r=>{ended=r;});
    for(let i=0;i<40&&!emit;i++)await sleep(10);
    assert.equal(fromSeen,7);
    emit!({_sequenza:8,type:'A'});emit!({_sequenza:9,type:'B'});
    for(let i=0;i<40&&got.length<2;i++)await sleep(10);
    assert.deepEqual(got,[{_sequenza:8,type:'A'},{_sequenza:9,type:'B'}]);
    off();for(let i=0;i<40&&!unsubscribed;i++)await sleep(10);
    assert.equal(unsubscribed,1);
    client.close();
  }finally{await window.close();f.done();}
});

test('channel: a host that stops reading — past the backlog the window ends the subscription with lag and its last sequence, and stops holding events',{timeout:20_000},async()=>{
  const f=folder();let emit:((e:unknown)=>void)|null=null;let unsubscribed=0;
  const window=await openWindowChannel({dataRoot:f.dir,label:'p',backlogBytes:64*1024,handlers:handlers({subscribe:(_id,_from,on)=>{emit=on;return()=>{unsubscribed++;};}})});
  try{
    const [registration]=readRegistrations(f.dir);
    /* a raw client: the handshake by hand, then it stops reading */
    const socket=createConnection(registration!.channel);socket.on('error',()=>{});
    const reader=createFrameReader(FRAME_CAP_BEFORE_AUTH);const frames:any[]=[];
    socket.on('data',(chunk:Buffer)=>{for(const frame of reader.push(chunk))frames.push(frame);});
    await new Promise<void>(resolve=>socket.once('connect',()=>resolve()));
    const nc=newNonce();socket.write(encodeFrame({t:'hello',nc}));
    for(let i=0;i<100&&!frames.some(x=>x.t==='challenge');i++)await sleep(5);
    const challenge=frames.find(x=>x.t==='challenge');
    assert.ok(sameProof(windowProof(registration!.token,nc,challenge.ns),challenge.ms),'the window proved itself');
    socket.write(encodeFrame({t:'proof',mc:clientProof(registration!.token,challenge.ns,nc)}));
    for(let i=0;i<100&&!frames.some(x=>x.t==='ready');i++)await sleep(5);
    reader.raiseCap(FRAME_CAP_AFTER_AUTH);
    socket.write(encodeFrame({t:'sub',id:'s',sessionId:'s-1',from:0}));
    for(let i=0;i<100&&!emit;i++)await sleep(5);
    socket.pause();
    const big='z'.repeat(32*1024);let seq=0;
    for(let i=0;i<200&&!unsubscribed;i++)emit!({_sequenza:++seq,big});
    assert.equal(unsubscribed,1,'the window let go of the subscription');
    const sentBefore=seq;emit!({_sequenza:++seq,big});
    socket.resume();
    for(let i=0;i<300&&!frames.some(x=>x.t==='lag');i++)await sleep(10);
    const lag=frames.find(x=>x.t==='lag');
    assert.ok(lag,'a lag frame arrived');
    assert.equal(lag.last,sentBefore,'the last sequence that was written');
    assert.equal(frames.filter(x=>x.t==='evt').at(-1)?.e?._sequenza,sentBefore,'nothing after the lag');
    socket.destroy();
  }finally{await window.close();f.done();}
});

test('registrations: a broken file is skipped; a stale one is removed only when its pid is gone',()=>{
  const f=folder();
  try{
    const dir=windowsFolder(f.dir);
    readRegistrations(f.dir);
    mkdirSync(dir,{recursive:true});
    writeFileSync(join(dir,'broken.json'),'{');
    const reg={v:1,id:'old',pid:999999,startedAt:'x',label:'p',channel:'\\\\.\\pipe\\none',token:newWindowToken()};
    writeFileSync(join(dir,'old.json'),JSON.stringify(reg));
    assert.deepEqual(readRegistrations(f.dir).map(r=>r.id),['old']);
    assert.equal(removeStaleRegistration(f.dir,reg,()=>true),false,'alive: kept');
    assert.equal(removeStaleRegistration(f.dir,reg,()=>false),true);
    assert.deepEqual(readRegistrations(f.dir),[]);
    assert.ok(readFileSync(join(dir,'broken.json'),'utf8')==='{','a broken file is skipped, not removed');
  }finally{f.done();}
});

test('channel: a client that answers the challenge with a wrong proof gets no ready, and the window closes it',{timeout:20_000},async()=>{
  const f=folder();
  const window=await openWindowChannel({dataRoot:f.dir,label:'p',handlers:handlers()});
  try{
    const [registration]=readRegistrations(f.dir);
    const socket=createConnection(registration!.channel);socket.on('error',()=>{});
    const reader=createFrameReader(FRAME_CAP_BEFORE_AUTH);const frames:any[]=[];
    socket.on('data',(chunk:Buffer)=>{for(const frame of reader.push(chunk))frames.push(frame);});
    const closed=new Promise<void>(resolve=>socket.on('close',()=>resolve()));
    await new Promise<void>(resolve=>socket.once('connect',()=>resolve()));
    const nc=newNonce();socket.write(encodeFrame({t:'hello',nc}));
    for(let i=0;i<100&&!frames.some(x=>x.t==='challenge');i++)await sleep(5);
    const challenge=frames.find(x=>x.t==='challenge');
    socket.write(encodeFrame({t:'proof',mc:clientProof(newWindowToken(),challenge.ns,nc)}));
    /* bounded: a window that accepted the wrong proof would keep the connection open and say ready */
    const outcome=await Promise.race([closed.then(()=>'closed'),sleep(3_000).then(()=>'still open')]);
    assert.equal(frames.some(x=>x.t==='ready'),false,'a wrong proof got ready');
    assert.equal(outcome,'closed');
    socket.destroy();
  }finally{await window.close();f.done();}
});
