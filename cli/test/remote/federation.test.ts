/*
 * 0.6.15 T3b: the federated `chiama`, registry and event stream the host gives the kernel's remote module (federation.ts). Windows are
 * fakes behind real registration files (another pid, another start), so every route can be driven: by lease (same pid AND start), by
 * screen (`attached`), to this host (loaded from disk first); the merged list (owner's row wins, closed rows as the Mobile reads them,
 * a slow window left out); a window dying mid-operation (never resent: OPERATION_FAILED 503) and mid-stream (the stream goes on from
 * this host from the last sequence).
 */
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,rmSync,utimesSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {closedRow,createFederation,readLeaseHolder,type FederationLocal} from '../../src/remote/federation.ts';
import {windowsFolder,type WindowClient,type WindowRegistration} from '../../src/remote/window-channel.ts';

const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const START='2026-10-26T18:00:00.000Z';
function setup(){
  const dir=mkdtempSync(join(tmpdir(),'talos-fed-'));const sessionsRoot=join(dir,'sessions');mkdirSync(join(sessionsRoot,'.affitti'),{recursive:true});
  mkdirSync(windowsFolder(dir),{recursive:true});
  return{dir,sessionsRoot,done:()=>rmSync(dir,{recursive:true,force:true})};
}
function register(dir:string,id:string,pid:number,label='other'):WindowRegistration{
  const r={v:1,id,pid,startedAt:START,label,channel:`\\\\.\\pipe\\fake-${id}`,token:'t'};
  writeFileSync(join(windowsFolder(dir),`${id}.json`),JSON.stringify(r));return r;
}
type FakeWindow={rows:any[];attached:string[];calls:any[];emit:(e:any)=>void;end:(r:any)=>void;froms:number[];fail?:string;slow?:boolean;subs:number;kill:()=>void;folder?:string;folderAsks?:number};
function fakeWindows(){
  const windows=new Map<string,FakeWindow>();
  const connect=async(registration:WindowRegistration):Promise<WindowClient>=>{
    const w=windows.get(registration.id);if(!w)throw Object.assign(new Error('no'),{code:'WINDOW_UNREACHABLE'});
    let closed=false;const closeListeners:Array<()=>void>=[];const ends:Array<(r:any)=>void>=[];
    w.kill=()=>{closed=true;for(const end of ends)end({gone:true});for(const l of closeListeners)l();};
    return{
      identity:{id:registration.id,pid:registration.pid,startedAt:registration.startedAt,label:registration.label},
      async request(op:string,args?:any){
        if(closed)throw Object.assign(new Error('gone'),{code:'WINDOW_GONE'});
        if(w.slow)await sleep(10_000);
        if(op==='attached')return w.attached as any;
        if(op==='folderOf'){w.folderAsks=(w.folderAsks??0)+1;return(w.folder?{ok:true,cartella:w.folder}:null) as any;}
        w.calls.push(args);
        if(w.fail)throw Object.assign(new Error('gone'),{code:w.fail});
        if(args?.percorso==='/api/v1/sessions')return{stato:200,dati:{items:w.rows}} as any;
        return{stato:200,dati:{by:registration.id,percorso:args?.percorso}} as any;
      },
      subscribe(_sessionId:string,from:number,onEvent:(e:unknown)=>void,onEnd:(r:any)=>void){w.subs++;w.froms.push(from);w.emit=onEvent;w.end=onEnd;ends.push(onEnd);return()=>{};},
      onClose(l:()=>void){closeListeners.push(l);},
      close(){closed=true;},
      get closed(){return closed;},
    };
  };
  const add=(id:string)=>{const w:FakeWindow={rows:[],attached:[],calls:[],emit:()=>{},end:()=>{},froms:[],subs:0,kill:()=>{}};windows.set(id,w);return w;};
  return{connect,add};
}
function fakeLocal(sessionsRoot:string,over:Partial<FederationLocal>={}){
  const loaded=new Set<string>(['local-1']);const calls:any[]=[];const ensured:string[]=[];let localEmit:((e:any)=>void)|null=null;let localFrom=-1;
  const local:FederationLocal={
    sessionsRoot,
    registry:{esiste:(id:string)=>loaded.has(id),elenca:()=>[...loaded].map(sessionId=>({sessionId})),iscriviti:()=>()=>{},cartellePiuUsate:()=>['C:\\p']},
    call:async(request)=>{calls.push(request);if(request.percorso==='/api/v1/sessions')return{stato:200,dati:{items:[...loaded].map(sessionId=>({sessionId,nome:'local'}))}};return{stato:200,dati:{by:'host',percorso:request.percorso}};},
    subscribeWithReplay:({daSequenza,manda})=>{localFrom=daSequenza??0;localEmit=manda;return()=>{};},
    ensureLoaded:async(id)=>{ensured.push(id);loaded.add(id);return true;},
    listAll:async()=>[{id:'closed-1',sessionId:'closed-1',name:'Old one',project:'shop',startedAt:'2026-10-01T10:00:00.000Z',updatedAt:'2026-10-02T10:00:00.000Z',endedAt:null,outcome:'completed',depth:0,parentId:null,delegatedTask:null}],
    ...over,
  };
  return{local,calls,ensured,loaded,emitLocal:(e:any)=>localEmit?.(e),localFrom:()=>localFrom};
}
const noTimer=()=>0 as any;

test('route by screen: a conversation another window has attached goes there; one nobody has goes to this host, loaded from disk first',async()=>{
  const s=setup();const w=fakeWindows();const win=w.add('w1');win.attached=['s-attached'];
  register(s.dir,'w1',4242);const l=fakeLocal(s.sessionsRoot);
  const fed=createFederation({local:l.local,dataRoot:s.dir,selfId:'me',connect:w.connect,alive:()=>true,leaseHolder:()=>null,setInterval:noTimer,clearInterval:()=>{}});
  try{
    await fed.refresh();
    assert.deepEqual(await fed.chiama({metodo:'POST',percorso:'/api/v1/sessions/s-attached/resume',corpo:{testo:'hi'}}),{stato:200,dati:{by:'w1',percorso:'/api/v1/sessions/s-attached/resume'}});
    assert.deepEqual(await fed.chiama({metodo:'POST',percorso:'/api/v1/sessions/s-free/resume',corpo:{}}),{stato:200,dati:{by:'host',percorso:'/api/v1/sessions/s-free/resume'}});
    assert.deepEqual(l.ensured,['s-free'],'loaded into the host first');
    await fed.chiama({metodo:'GET',percorso:'/api/v1/doctor'});
    assert.equal(l.calls.at(-1).percorso,'/api/v1/doctor','not a conversation: this host');
  }finally{fed.close();s.done();}
});

test('route by lease: the holder\'s pid AND start must match a window; a reused pid (another start) or this process routes here',async()=>{
  const s=setup();const w=fakeWindows();const w1=w.add('w1');register(s.dir,'w1',4242);const l=fakeLocal(s.sessionsRoot);
  let holder:any={pid:4242,startedAt:'2026-10-26T18:00:00.500Z'};
  const fed=createFederation({local:l.local,dataRoot:s.dir,selfId:'me',connect:w.connect,alive:()=>true,leaseHolder:()=>holder,setInterval:noTimer,clearInterval:()=>{}});
  try{
    await fed.refresh();
    assert.equal((await fed.chiama({metodo:'POST',percorso:'/api/v1/sessions/s-run/approve',corpo:{}})).dati.by,'w1');
    holder={pid:4242,startedAt:'2026-10-25T09:00:00.000Z'};
    assert.equal((await fed.chiama({metodo:'POST',percorso:'/api/v1/sessions/s-run/approve',corpo:{}})).dati.by,'host','a reused pid never routes');
    holder={pid:process.pid,startedAt:START};
    assert.equal((await fed.chiama({metodo:'POST',percorso:'/api/v1/sessions/s-run/approve',corpo:{}})).dati.by,'host');
    /* the lease of this process wins over another window that has it on screen: one writer only */
    w1.attached=['s-run'];await fed.refresh();
    assert.equal((await fed.chiama({metodo:'POST',percorso:'/api/v1/sessions/s-run/approve',corpo:{}})).dati.by,'host','this process holds the lease');
  }finally{fed.close();s.done();}
});

test('a window that dies mid-operation: OPERATION_FAILED 503, never resent; a refusal of the window keeps its own code',async()=>{
  const s=setup();const w=fakeWindows();const win=w.add('w1');win.attached=['s-a'];register(s.dir,'w1',4242);const l=fakeLocal(s.sessionsRoot);
  const fed=createFederation({local:l.local,dataRoot:s.dir,selfId:'me',connect:w.connect,alive:()=>true,leaseHolder:()=>null,setInterval:noTimer,clearInterval:()=>{}});
  try{
    await fed.refresh();
    win.fail='WINDOW_GONE';
    await assert.rejects(fed.chiama({metodo:'POST',percorso:'/api/v1/sessions/s-a/resume',corpo:{}}),(e:any)=>e.code==='OPERATION_FAILED'&&e.stato===503);
    assert.equal(win.calls.filter(c=>c?.percorso==='/api/v1/sessions/s-a/resume').length,1,'sent once, never again');
    assert.equal(l.calls.filter(c=>c.percorso.includes('s-a')).length,0,'and never run here instead');
    win.fail='SESSION_LEASED';
    await assert.rejects(fed.chiama({metodo:'POST',percorso:'/api/v1/sessions/s-a/resume',corpo:{}}),{code:'SESSION_LEASED'});
  }finally{fed.close();s.done();}
});

test('the device\'s list: host + windows + closed; the owner\'s row wins; closed rows as the Mobile reads them; a slow window stays out',async()=>{
  const s=setup();const w=fakeWindows();
  const a=w.add('w1');a.rows=[{sessionId:'s-a',nome:'from w1',inAttesaApprovazione:true},{sessionId:'local-1',nome:'stale copy in w1'}];a.attached=['s-a'];
  const slow=w.add('w2');slow.rows=[{sessionId:'s-slow'}];
  const stale=w.add('w3');stale.rows=[{sessionId:'s-a',nome:'stale copy in w3'}];
  register(s.dir,'w1',4242);register(s.dir,'w2',4343);register(s.dir,'w3',4444);
  const l=fakeLocal(s.sessionsRoot);
  const fed=createFederation({local:l.local,dataRoot:s.dir,selfId:'me',connect:w.connect,alive:()=>true,leaseHolder:()=>null,setInterval:noTimer,clearInterval:()=>{}});
  try{
    await fed.refresh();slow.slow=true;
    const started=Date.now();
    const list=await fed.chiama({metodo:'GET',percorso:'/api/v1/sessions'});
    assert.ok(Date.now()-started<8_000,'within the phone\'s 10 s');
    const byId=new Map((list.dati.items as any[]).map(r=>[r.sessionId,r]));
    assert.equal(byId.get('s-a').nome,'from w1');assert.equal(byId.get('s-a').inAttesaApprovazione,true);
    assert.equal(byId.get('local-1').nome,'local','not attached anywhere: the host\'s own row');
    assert.deepEqual(byId.get('closed-1'),{sessionId:'closed-1',nome:'Old one',progetto:'shop',avviataAlle:'2026-10-01T10:00:00.000Z',ultimaRispostaAlle:'2026-10-02T10:00:00.000Z',conclusa:true,interrotta:false,ultimoEsito:'successo'});
    assert.ok(byId.has('s-slow'),'the slow window\'s last known rows (from the first refresh)');
  }finally{fed.close();s.done();}
});

test('the event stream: from a window, then — the window gone — from this host, from the last sequence; the registry\'s sync reads use the copies',async()=>{
  const s=setup();const w=fakeWindows();const win=w.add('w1');win.attached=['s-a'];win.rows=[{sessionId:'s-a'}];register(s.dir,'w1',4242);const l=fakeLocal(s.sessionsRoot);
  const fed=createFederation({local:l.local,dataRoot:s.dir,selfId:'me',connect:w.connect,alive:()=>true,leaseHolder:()=>null,setInterval:noTimer,clearInterval:()=>{}});
  try{
    await fed.refresh();
    /* review R3: a closed conversation exists because its journal does, not because a list read once said so */
    writeFileSync(join(s.sessionsRoot,'closed-1.jsonl'),'{}');
    assert.equal(fed.sessionRegistry.esiste('s-a'),true);assert.equal(fed.sessionRegistry.esiste('closed-1'),true);assert.equal(fed.sessionRegistry.esiste('nope'),false);
    assert.equal(fed.sessionRegistry.esiste('../outside'),false,'a path is never a session id');
    assert.deepEqual(fed.sessionRegistry.elenca().map((r:any)=>r.sessionId).sort(),['local-1','s-a']);
    assert.deepEqual((fed.sessionRegistry as any).cartellePiuUsate(),['C:\\p'],'not federated: the host\'s own');
    const got:any[]=[];
    const off=fed.iscriviConRigiocata({sessionRegistry:null,sessionId:'s-a',daSequenza:3,manda:e=>got.push(e)});
    for(let i=0;i<20&&!win.subs;i++)await sleep(5);
    win.emit({_sequenza:4,type:'A'});win.emit({_sequenza:5,type:'B'});
    win.kill();
    for(let i=0;i<40&&l.localFrom()<0;i++)await sleep(5);
    assert.equal(l.localFrom(),5,'the host goes on from the last sequence it delivered');
    assert.deepEqual(l.ensured,['s-a']);
    l.emitLocal({_sequenza:6,type:'C'});
    assert.deepEqual(got.map(e=>e._sequenza),[4,5,6]);
    off?.();
  }finally{fed.close();s.done();}
});

test('the lease file: holder read; expired by mtime, or by a dead pid on this host, is nobody',()=>{
  const s=setup();
  try{
    const file=join(s.sessionsRoot,'.affitti','s-1.json');
    writeFileSync(file,JSON.stringify({istanza:'i',pid:4242,host:'h',avviatoIl:START,presoIl:START,etichetta:'TALOS CLI (the screen)'}));
    assert.deepEqual(readLeaseHolder(s.sessionsRoot,'s-1',{host:'h',alive:()=>true}),{pid:4242,startedAt:START});
    assert.equal(readLeaseHolder(s.sessionsRoot,'s-1',{host:'h',alive:()=>false}),null,'a dead pid on this host');
    const old=(Date.now()-60_000)/1000;utimesSync(file,old,old);
    assert.equal(readLeaseHolder(s.sessionsRoot,'s-1',{host:'h',alive:()=>true}),null,'an mtime older than 30 s');
    assert.equal(readLeaseHolder(s.sessionsRoot,'missing'),null);
  }finally{s.done();}
});

test('closed rows: a child keeps its parent (the phone hides it), a failure says so, no id no row',()=>{
  assert.deepEqual(closedRow({id:'c',name:null,project:null,parentId:'p',depth:1,delegatedTask:'fix it',startedAt:null,updatedAt:null,endedAt:null,outcome:'failed'}),
    {sessionId:'c',nome:null,progetto:null,padreId:'p',profonditaDelega:1,taskDelega:'fix it',avviataAlle:null,ultimaRispostaAlle:null,conclusa:true,interrotta:false,ultimoEsito:'errore'});
  assert.equal(closedRow({}),null);
});

test('the event stream after a lag: subscribed again to the same window from the last sequence it delivered',async()=>{
  const s=setup();const w=fakeWindows();const win=w.add('w1');win.attached=['s-a'];register(s.dir,'w1',4242);const l=fakeLocal(s.sessionsRoot);
  const fed=createFederation({local:l.local,dataRoot:s.dir,selfId:'me',connect:w.connect,alive:()=>true,leaseHolder:()=>null,setInterval:(()=>0) as any,clearInterval:()=>{}});
  try{
    await fed.refresh();
    const got:any[]=[];
    fed.iscriviConRigiocata({sessionRegistry:null,sessionId:'s-a',daSequenza:2,manda:e=>got.push(e)});
    for(let i=0;i<20&&!win.subs;i++)await sleep(5);
    win.emit({_sequenza:3});win.emit({_sequenza:4});
    win.end({lag:4});
    for(let i=0;i<20&&win.subs<2;i++)await sleep(5);
    assert.deepEqual(win.froms,[2,4]);
    assert.equal(l.localFrom(),-1,'never from the host while the window is there');
  }finally{fed.close();s.done();}
});

/* Mutants that survived the T3b review (M5, M13, M17): a window that times out is «outcome unknown» too; this window's own
   registration is never a peer; a window whose registration went is dropped at the next look. */
test('M5: a window that does not answer in time — OPERATION_FAILED 503, not a hanging phone',async()=>{
  const s=setup();const w=fakeWindows();const win=w.add('w1');win.attached=['s-a'];register(s.dir,'w1',4242);const l=fakeLocal(s.sessionsRoot);
  const fed=createFederation({local:l.local,dataRoot:s.dir,selfId:'me',connect:w.connect,alive:()=>true,leaseHolder:()=>null,setInterval:noTimer,clearInterval:()=>{}});
  try{
    await fed.refresh();win.fail='WINDOW_TIMEOUT';
    await assert.rejects(fed.chiama({metodo:'POST',percorso:'/api/v1/sessions/s-a/resume',corpo:{}}),(e:any)=>e.code==='OPERATION_FAILED'&&e.stato===503);
  }finally{fed.close();s.done();}
});

test('M13 and M17: this window\'s own registration is never a peer; a window whose registration is gone is dropped',async()=>{
  const s=setup();const w=fakeWindows();w.add('me');w.add('w1');register(s.dir,'me',process.pid,'self');register(s.dir,'w1',4242);const l=fakeLocal(s.sessionsRoot);
  const fed=createFederation({local:l.local,dataRoot:s.dir,selfId:()=>'me',connect:w.connect,alive:()=>true,leaseHolder:()=>null,setInterval:noTimer,clearInterval:()=>{}});
  try{
    await fed.refresh();
    assert.deepEqual(fed.peers().map(p=>p.id),['w1']);
    rmSync(join(windowsFolder(s.dir),'w1.json'));
    await fed.refresh();
    assert.deepEqual(fed.peers(),[]);
  }finally{fed.close();s.done();}
});

/* Mutants that survived the review's cures (26/10/2026): what each one would have let through */
test('the folder of another window\'s conversation is asked to that window — never loaded into this host',async()=>{
  const s=setup();const w=fakeWindows();const win=w.add('w1');win.attached=['s-b'];win.folder='C:\\work\\b';register(s.dir,'w1',4242);const l=fakeLocal(s.sessionsRoot);
  const fed=createFederation({local:l.local,dataRoot:s.dir,selfId:'me',connect:w.connect,alive:()=>true,leaseHolder:()=>null,setInterval:noTimer,clearInterval:()=>{}});
  try{
    await fed.refresh();
    assert.deepEqual(await (fed.sessionRegistry as any).cartellaPerChatFile('s-b'),{ok:true,cartella:'C:\\work\\b'});
    assert.equal(win.folderAsks,1);
    assert.deepEqual(l.ensured,[],'B\'s conversation is not loaded into the host');
  }finally{fed.close();s.done();}
});

test('the stream follows the owner at the poll alone: the window drops the conversation, the stream moves to this host',async()=>{
  const s=setup();const w=fakeWindows();const win=w.add('w1');win.attached=['X'];register(s.dir,'w1',4242);const l=fakeLocal(s.sessionsRoot);
  const fed=createFederation({local:l.local,dataRoot:s.dir,selfId:'me',connect:w.connect,alive:()=>true,leaseHolder:()=>null,setInterval:noTimer,clearInterval:()=>{}});
  try{
    await fed.refresh();
    const off=fed.iscriviConRigiocata({sessionRegistry:null,sessionId:'X',daSequenza:0,manda:()=>{}});
    for(let i=0;i<20&&!win.subs;i++)await sleep(5);
    win.emit({_sequenza:7});
    win.attached=[];await fed.refresh();
    for(let i=0;i<20&&l.localFrom()<0;i++)await sleep(5);
    assert.equal(l.localFrom(),7,'moved by the poll, from the last sequence');
    off?.();
  }finally{fed.close();s.done();}
});

test('the stream follows an operation that moved the lease, at once (no poll in between)',async()=>{
  const s=setup();const w=fakeWindows();const win=w.add('w1');register(s.dir,'w1',4242);const l=fakeLocal(s.sessionsRoot);
  let holder:any=null;
  const fed=createFederation({local:l.local,dataRoot:s.dir,selfId:'me',connect:w.connect,alive:()=>true,leaseHolder:()=>holder,setInterval:noTimer,clearInterval:()=>{}});
  try{
    await fed.refresh();
    const off=fed.iscriviConRigiocata({sessionRegistry:null,sessionId:'Y',daSequenza:0,manda:()=>{}});
    for(let i=0;i<20&&l.localFrom()<0;i++)await sleep(5);
    holder={pid:4242,startedAt:START}; /* window w1 took the lease: the next operation goes there */
    const r=await fed.chiama({metodo:'POST',percorso:'/api/v1/sessions/Y/approve',corpo:{}});
    assert.equal(r.dati.by,'w1');
    for(let i=0;i<20&&!win.subs;i++)await sleep(5);
    assert.equal(win.subs,1,'the stream moved with the operation');
    off?.();
  }finally{fed.close();s.done();}
});

test('the wake-up sees the owner\'s row even when another window\'s stale copy is read first',async()=>{
  const s=setup();const w=fakeWindows();
  const stale=w.add('w1');stale.rows=[{sessionId:'X',inAttesaApprovazione:false}];
  const owner=w.add('w9');owner.rows=[{sessionId:'X',inAttesaApprovazione:true}];owner.attached=['X'];
  register(s.dir,'w1',4242);register(s.dir,'w9',4949);const l=fakeLocal(s.sessionsRoot);
  const fed=createFederation({local:l.local,dataRoot:s.dir,selfId:'me',connect:w.connect,alive:()=>true,leaseHolder:()=>null,setInterval:noTimer,clearInterval:()=>{}});
  try{
    await fed.refresh();
    assert.equal(fed.sessionRegistry.elenca().find((r:any)=>r.sessionId==='X').inAttesaApprovazione,true);
  }finally{fed.close();s.done();}
});
