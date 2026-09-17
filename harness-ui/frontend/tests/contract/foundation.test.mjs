import test from 'node:test';
import assert from 'node:assert/strict';
import { createApplicationState, STATE_OWNERS } from '../../src/app/state.ts';
import { createLifetime } from '../../src/infrastructure/lifecycle.ts';
import { createRequestCoordinator } from '../../src/domain/resource-state.ts';
import { createApiClient, TalosApiError } from '../../src/infrastructure/api/client.ts';
import { createHostBridge } from '../../src/infrastructure/host/bridge.ts';
import { createPreferences } from '../../src/infrastructure/persistence/preferences.ts';
import { decodeSessionEvent, SESSION_EVENT_NAMES } from '../../src/domain/session-events.ts';
import { createSessionStreamFactory } from '../../src/infrastructure/events/session-stream.ts';

const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
const success=data=>response({ok:true,data});
const endpoint=path=>`http://127.0.0.1:5000${path}`;
function memory(){const values=new Map();return {values,getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};}

test('F04: legacy facade and domain have one authoritative value',()=>{
  const map=new Map([['x',1]]);const session={id:'one',map};const store=createApplicationState({view:'chat',realSession:session});
  assert.equal(store.snapshot('session').realSession,session);assert.equal(store.legacy.realSession.map,map);
  store.legacy.view='review';assert.equal(store.snapshot('ui').view,'review');assert.equal(Object.isFrozen(store.snapshot('ui')),true);
  map.set('y',2);assert.equal(store.legacy.realSession.map.get('y'),2);
});
test('F04: domain subscriptions do not receive unrelated state',()=>{
  const store=createApplicationState({view:'chat',model:''});const events=[];const dispose=store.subscribe('ui',s=>events.push(s.view));
  store.legacy.model='provider/model';store.legacy.view='chat';store.legacy.view='browser';dispose();store.legacy.view='chat';
  assert.deepEqual(events,['browser']);
});
test('F04: unknown state has no hidden fallback bucket',()=>{
  assert.throws(()=>createApplicationState({future:1}),/no owner/);
  assert.throws(()=>createApplicationState({constructor:1}),/no owner/);
  const s=createApplicationState({view:'chat'});assert.throws(()=>{s.legacy.future=1;},TypeError);
});
test('F04: nested invalidation is explicit until feature migration',()=>{
  const s=createApplicationState({realSession:{id:'a'}});let n=0;s.subscribe('session',()=>n++);
  s.legacy.realSession.id='b';assert.equal(n,0);s.notify('session');assert.equal(n,1);
  s.dispose();s.legacy.realSession={id:'c'};s.notify('session');assert.equal(n,1);assert.equal(s.legacy.realSession.id,'b');
});
test('F04: resource generation discards a late response and aborts previous I/O',async()=>{
  const c=createRequestCoordinator();const a=deferred();let signal;
  const first=c.run({workspaceId:'w',sessionId:'a'},s=>{signal=s;return a.promise});
  const second=await c.run({workspaceId:'w',sessionId:'b'},async()=>2);
  assert.equal(signal.aborted,true);a.resolve(1);assert.equal((await first).kind,'superseded');assert.equal(second.value,2);
});
test('F04: late errors cannot replace another resource state',async()=>{
  const c=createRequestCoordinator();const a=deferred();const run=c.run({workspaceId:null,sessionId:'a'},()=>a.promise);
  c.invalidate();a.reject(new Error('old failure'));assert.equal((await run).kind,'superseded');
});
test('F04: a current failure remains an error, never success',async()=>{
  const c=createRequestCoordinator();await assert.rejects(c.run({workspaceId:null,sessionId:'a'},async()=>{throw new Error('network');}),/network/);
});
test('F04: dispose stops reads without issuing an agent cancellation',async()=>{
  const c=createRequestCoordinator();const a=deferred();let signal;
  const run=c.run({workspaceId:null,sessionId:'a'},s=>{signal=s;return a.promise});c.dispose();c.dispose();
  assert.equal(signal.aborted,true);a.resolve('old');assert.equal((await run).kind,'superseded');
  await assert.rejects(c.run({workspaceId:null,sessionId:'a'},async()=>1),/disposed/);
});
test('F04: lifetime releases resources exactly once in reverse order',()=>{
  const events=[];const lifetime=createLifetime();lifetime.own(()=>events.push('a'));const release=lifetime.own(()=>events.push('b'));
  release();release();lifetime.own(()=>events.push('c'));lifetime.dispose();lifetime.dispose();lifetime.own(()=>events.push('d'));
  assert.deepEqual(events,['b','c','a','d']);assert.equal(lifetime.signal.aborted,true);
});
test('F04: listeners are removed and remaining cleanup survives a failure',()=>{
  const target=new EventTarget();let called=0;const errors=[];const l=createLifetime(e=>errors.push(e.message));
  l.listen(target,'tick',()=>called++);target.dispatchEvent(new Event('tick'));l.own(()=>{throw new Error('cleanup')});l.dispose();
  target.dispatchEvent(new Event('tick'));assert.equal(called,1);assert.deepEqual(errors,['cleanup']);
});

test('K01: GET uses real envelope, no-store and preserves base URL',async()=>{
  let call;const api=createApiClient({endpoint,fetchImpl:async(...args)=>{call=args;return success({value:42});}});
  assert.deepEqual(await api.get('/api/v1/models?forza=1'),{value:42});assert.equal(call[0],'http://127.0.0.1:5000/api/v1/models?forza=1');
  assert.equal(call[1].cache,'no-store');assert.equal(call[1].headers.Accept,'application/json');assert.equal('body' in call[1],false);
});
for(const method of ['POST','PATCH','PUT','DELETE'])test(`K01: ${method} is sent once and retains its body`,async()=>{
  let calls=0;let init;const api=createApiClient({endpoint,fetchImpl:async(_,v)=>{calls++;init=v;return success({changed:true});}});
  await api.request(method,'/api/v1/sessions/a/notes',{body:{text:'hello'}});
  assert.equal(calls,1);assert.equal(init.method,method);assert.equal(init.body,JSON.stringify({text:'hello'}));
});
for(const status of [400,401,403,409,429,500,503])test(`K01: ${status} preserves the public problem and never retries`,async()=>{
  let calls=0;const problem={code:'EXACT_CODE',message:'Explanation',title:'Title',action:'Manual action',doctorReference:'doctor-123',details:{field:'name'}};
  const api=createApiClient({endpoint,fetchImpl:async()=>{calls++;return response({ok:false,error:problem},status);}});
  await assert.rejects(api.post('/api/v1/sessions',{}),e=>e instanceof TalosApiError&&e.status===status&&e.code==='EXACT_CODE'&&e.problem.doctorReference==='doctor-123'&&e.details.field==='name');
  assert.equal(calls,1);
});
for(const invalid of [null,[],{ok:true},{ok:'yes',data:1}])test(`K01: malformed envelope ${JSON.stringify(invalid)} is rejected`,async()=>{
  const api=createApiClient({endpoint,fetchImpl:async()=>response(invalid)});await assert.rejects(api.get('/api/v1/health'),TalosApiError);
});
test('K01: an empty response is only successful when HTTP says 204',async()=>{
  const api=createApiClient({endpoint,fetchImpl:async()=>new Response(null,{status:204})});assert.equal(await api.delete('/api/v1/items/a'),null);
  const broken=createApiClient({endpoint,fetchImpl:async()=>new Response('not json')});await assert.rejects(broken.get('/api/v1/health'),/non valida/);
});
test('K01: an aborted local request does not become a malformed JSON error',async()=>{
  const c=new AbortController();const api=createApiClient({endpoint,signal:c.signal,fetchImpl:async()=>({ok:true,status:200,json:async()=>{c.abort();throw c.signal.reason}})});
  await assert.rejects(api.get('/api/v1/health'),e=>e.name==='AbortError');
});
test('K01: request and application signals both cancel I/O',async()=>{
  for(const which of ['request','application']){
    const a=new AbortController(),b=new AbortController();let combined;
    const api=createApiClient({endpoint,signal:a.signal,fetchImpl:async(_,init)=>{combined=init.signal;return success(1);}});
    await api.get('/api/v1/health',{signal:b.signal});(which==='request'?b:a).abort();assert.equal(combined.aborted,true);
  }
});
test('K01: forbidden path and pre-abort make zero network requests',async()=>{
  let calls=0;const api=createApiClient({endpoint,fetchImpl:async()=>{calls++;return success(1)}});
  for(const path of ['https://example.org','/other','/api/v1/../../private'])await assert.rejects(api.get(path),TypeError);
  const c=new AbortController();c.abort();await assert.rejects(api.get('/api/v1/models',{signal:c.signal}));assert.equal(calls,0);
});
test('K01: a feature decoder validates rather than casts payload',async()=>{
  const api=createApiClient({endpoint,fetchImpl:async()=>success('invalid')});
  await assert.rejects(api.get('/api/v1/models',{decode:v=>{if(!Array.isArray(v))throw new TypeError('models array');return v}}),/models array/);
});

test('K02: injected root, host and endpoint are resolved at use time',()=>{
  const doc={documentElement:{classList:{contains:()=>false}}};const win={document:doc};const bridge=createHostBridge(win);
  assert.equal(bridge.root(),doc);assert.equal(bridge.embedded(),false);
  const shadow={};win.__talosHarnessRoot=shadow;win.__talosHarnessApiBase='http://127.0.0.1:6000';win.__talosHarnessHost={classList:{contains:()=>true}};
  assert.equal(bridge.root(),shadow);assert.equal(bridge.embedded(),true);assert.equal(bridge.apiUrl('/api/v1/health'),'http://127.0.0.1:6000/api/v1/health');
});
test('K02: host callbacks preserve their arguments without owning navigation',()=>{
  const calls=[];const win={__talosHarnessHostViewChange:x=>calls.push(x),__talosHarnessHostPermissionChange:x=>calls.push(x),__talosHarnessHostBack:()=>calls.push('back')};
  const bridge=createHostBridge(win);bridge.changeView('chat');bridge.changePermission('Read only');bridge.back();assert.deepEqual(calls,['chat','Read only','back']);
});

test('K03: persistence getter denied remains unavailable, not a thrown boot error',()=>{
  const p=createPreferences({storage:()=>{throw new Error('SecurityError')},allowedKeys:['settings']});
  assert.equal(p.read('settings').kind,'unavailable');assert.equal(p.write('settings',{}).kind,'unavailable');
});
test('K03: missing and corrupt data stay distinct; reading does not erase either',()=>{
  const m=memory(),p=createPreferences({storage:()=>m,allowedKeys:['settings']});assert.equal(p.read('settings').kind,'missing');
  m.setItem('settings','broken');assert.equal(p.read('settings').kind,'invalid');assert.equal(m.getItem('settings'),'broken');
});
test('K03: writes preserve existing shape, reject unserializable values and unknown keys',()=>{
  const m=memory(),p=createPreferences({storage:()=>m,allowedKeys:['settings']});const data={version:1,appearance:{theme:'calm'},chat:{autonomiaScelta:false}};
  assert.equal(p.write('settings',data).kind,'saved');assert.deepEqual(p.read('settings').value,data);
  const cyclic={};cyclic.self=cyclic;assert.equal(p.write('settings',cyclic).kind,'invalid');assert.deepEqual(p.read('settings').value,data);
  assert.throws(()=>p.read('provider-key'),TypeError);assert.equal(p.remove('settings').kind,'saved');assert.equal(p.read('settings').kind,'missing');
});
test('K05: actual CUSTOM replay marker and command events are known without inventing an outcome',()=>{
  for(const type of SESSION_EVENT_NAMES){const event={type,_sequenza:1,...(type==='CUSTOM'?{name:'talos.fine-rigiocata'}:{})};const decoded=decodeSessionEvent(event);
    assert.equal(decoded.kind,'known',type);assert.equal(decoded.event._sequenza,1);assert.equal(decoded.event.sequence,1);assert.equal(Object.isFrozen(decoded.event),true);}
});
for(const event of [null,[],{}, {type:'RunStarted',_sequenza:-1},{type:'RunStarted',_sequenza:0.1},{type:'CUSTOM'}])test(`K05: malformed event ${JSON.stringify(event)} is rejected`,()=>{
  assert.equal(decodeSessionEvent(event).kind,'invalid');
});
test('K05: an unknown event type is not translated into success or failure',()=>assert.equal(decodeSessionEvent({type:'FutureEvent'}).kind,'unsupported'));

function streams(){
  const sources=[];class FakeSource{
    readyState=0;onopen=null;onmessage=null;onerror=null;closed=0;
    constructor(url){this.url=url;sources.push(this);}close(){this.closed++;this.readyState=2;}
    open(){this.readyState=1;this.onopen?.({});}event(e){this.onmessage?.({data:JSON.stringify(e)});}error(){this.readyState=0;this.onerror?.({});}
  }
  return {sources,factory:createSessionStreamFactory({endpoint:id=>`/api/v1/sessions/${id}/events`,EventSourceImpl:FakeSource})};
}
test('K06: multiple historical terminal events do not cut off replay or live stream',()=>{
  const {factory,sources}=streams();const received=[];const states=[];factory.open({sessionId:'one',onEvent:e=>received.push(e.type),onState:s=>states.push(s)});const s=sources[0];s.open();
  for(const type of ['RunStarted','RunFinished','RunStarted','RunError','CUSTOM'])s.event({type,...(type==='CUSTOM'?{name:'talos.fine-rigiocata'}:{})});
  assert.equal(received.length,5);assert.equal(s.closed,0);assert.deepEqual(states,['connecting','open']);factory.dispose();assert.equal(s.closed,1);
});
test('K06: caller controls expected EOF and native reconnection remains available',()=>{
  const {factory,sources}=streams();const states=[];let seen;
  const handle=factory.open({sessionId:'one',onEvent:()=>{},onState:s=>states.push(s),onChannelError:r=>{seen=r}});
  sources[0].open();sources[0].error();assert.equal(seen,0);assert.equal(sources[0].closed,0);assert.equal(states.at(-1),'reconnecting');
  handle.close();handle.close();assert.equal(sources[0].closed,1);assert.equal(handle.readyState,2);
});
test('K06: stale generations deliver neither events nor errors to a new session',()=>{
  const {factory,sources}=streams();let current=true,received=0;
  factory.open({sessionId:'one',isCurrent:()=>current,onEvent:()=>received++,onChannelError:()=>received++});current=false;
  sources[0].event({type:'RunStarted'});sources[0].error();assert.equal(received,0);assert.equal(sources[0].closed,1);
});
test('K06: malformed JSON and unknown tags are reported without passing payloads',()=>{
  const {factory,sources}=streams();const errors=[],unknown=[];let events=0;
  factory.open({sessionId:'one',onEvent:()=>events++,onError:e=>errors.push(e.message),onUnsupported:t=>unknown.push(t)});
  sources[0].onmessage({data:'{' });sources[0].event({type:'NewType'});assert.equal(events,0);assert.equal(errors.length,1);assert.deepEqual(unknown,['NewType']);factory.dispose();
});
test('K06: application dispose closes main and child streams without new callbacks',()=>{
  const {factory,sources}=streams();let events=0;factory.open({sessionId:'main',onEvent:()=>events++});factory.open({sessionId:'child',onEvent:()=>events++});
  factory.dispose();factory.dispose();sources[0].event({type:'RunStarted'});assert.deepEqual(sources.map(s=>s.closed),[1,1]);assert.equal(events,0);
  assert.throws(()=>factory.open({sessionId:'new',onEvent:()=>{}}),/disposed/);
});
