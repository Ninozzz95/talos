import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const source=await fs.readFile(new URL('../probes/renderer-probe.js',import.meta.url),'utf8');
function fixture({supported=true,observeThrows=false}={}) {
  let mono=0,next=0,uid=0,observer;
  const callbacks=new Map(),listeners=new Map();
  class Observer {
    static supportedEntryTypes=supported?['longtask']:[];
    constructor(fn){this.fn=fn;this.records=[];this.disconnected=false;observer=this;}
    observe(){if(observeThrows)throw new Error('fixture observer error');}
    disconnect(){this.disconnected=true;}
    takeRecords(){const x=this.records;this.records=[];return x;}
    emit(values){this.fn({getEntries:()=>values.map(duration=>({duration}))});}
  }
  const document={visibilityState:'visible',addEventListener:(e,f)=>listeners.set(e,f),removeEventListener:(e,f)=>{if(listeners.get(e)===f)listeners.delete(e);}};
  const context=vm.createContext({crypto:{randomUUID:()=>`fixture-id-${++uid}`},performance:{now:()=>mono},document,
    PerformanceObserver:Observer,requestAnimationFrame:f=>{callbacks.set(++next,f);return next;},cancelAnimationFrame:id=>callbacks.delete(id)});
  vm.runInContext(source,context);
  return {api:context.TalosDesktopAudit,context,listeners,callbacks,get observer(){return observer;},
    tick(t){mono=t;const batch=[...callbacks.values()];callbacks.clear();for(const cb of batch)cb(t);},
    visible(value){document.visibilityState=value;listeners.get('visibilitychange')?.();}};
}
test('renderer probe has explicit start/stop lifecycle',()=>{const f=fixture();assert.throws(()=>f.api.snapshot());f.api.start();assert.throws(()=>f.api.start());assert.equal(f.api.stop().scope,'renderer_observer_not_whole_desktop');assert.throws(()=>f.api.stop());});
test('renderer capacity rejects invalid bounds',()=>{const f=fixture();for(const capacity of [0,15,100001,NaN,17.2])assert.throws(()=>f.api.start({capacity}));});
test('renderer records rAF callback gaps, not fabricated FPS',()=>{const f=fixture();f.api.start();f.tick(10);f.tick(26);f.tick(46);const x=f.api.stop();assert.equal(x.raf_callback_gaps_ms.n,2);assert.equal(x.raf_callback_gaps_ms.median,18);assert.equal(x.fps,undefined);});
test('renderer ring buffer bounds memory and declares overwritten samples',()=>{const f=fixture();f.api.start({capacity:16});for(let i=0;i<31;i++)f.tick(i*16);const x=f.api.stop().raf_callback_gaps_ms;assert.equal(x.n,16);assert.equal(x.total_observed,30);assert.equal(x.overwritten,14);});
test('renderer hidden intervals are not counted as visible jank',()=>{const f=fixture();f.api.start();f.tick(10);f.tick(26);f.visible('hidden');f.tick(1000);f.visible('visible');f.tick(10000);f.tick(10016);const x=f.api.stop().raf_callback_gaps_ms;assert.equal(x.n,2);assert.equal(x.max,16);});
test('renderer reports unsupported long tasks as null',()=>{const f=fixture({supported:false});f.api.start();assert.equal(f.api.stop().longtask_durations_ms,null);});
test('renderer observer failure does not leak lifecycle listeners',()=>{const f=fixture({observeThrows:true});f.api.start();assert.equal(f.api.stop().longtask_durations_ms,null);assert.equal(f.listeners.size,0);});
test('renderer collects pending long task entries before disconnect',()=>{const f=fixture();f.api.start();f.observer.emit([60,80]);f.observer.records=[{duration:100}];const x=f.api.stop();assert.equal(x.longtask_durations_ms.n,3);assert.equal(x.longtask_total_duration_ms,240);assert.equal(f.observer.disconnected,true);});
test('renderer stop removes listener and cancels frame callback',()=>{const f=fixture();f.api.start();f.tick(5);f.api.stop();assert.equal(f.listeners.size,0);assert.equal(f.callbacks.size,0);});
test('renderer unknown markers and invalid causal IDs are rejected',()=>{const f=fixture();f.api.start();assert.throws(()=>f.api.mark('invented'));assert.throws(()=>f.api.mark('tool_started'));assert.throws(()=>f.api.mark('provider_first_token'));assert.throws(()=>f.api.mark('task_verified',{verifier_exit_code:1}));f.api.stop();});
test('renderer tool outcome is required',()=>{const f=fixture();f.api.start();assert.throws(()=>f.api.mark('tool_finished',{tool_call_id:'t'}));assert.equal(f.api.mark('tool_finished',{tool_call_id:'t',outcome:'ok'}),true);f.api.stop();});
test('renderer manual markers are bounded and explicitly not automatic measurements',()=>{const f=fixture();f.api.start({capacity:16});for(let i=0;i<17;i++)f.api.mark('task_submitted');const x=f.api.stop();assert.equal(x.marks.length,16);assert.equal(x.dropped_marks,1);assert.ok(x.marks.every(m=>m.origin==='manual'));});
test('renderer does not copy arbitrary secret marker options',()=>{const f=fixture();f.api.start();f.api.mark('task_submitted',{secret:'SENSITIVE_FIXTURE'});assert.ok(!JSON.stringify(f.api.stop()).includes('SENSITIVE_FIXTURE'));});
test('renderer snapshot does not expose mutable internal marks',()=>{const f=fixture();f.api.start();f.api.mark('task_submitted');const x=f.api.snapshot();x.marks[0].event='mutated';assert.equal(f.api.stop().marks[0].event,'task_submitted');});
test('renderer reinjection does not replace or reset active probe',()=>{const f=fixture();const api=f.api;api.start();vm.runInContext(source,f.context);assert.equal(api,f.context.TalosDesktopAudit);api.stop();});

test('renderer can generate correlation IDs without secure-context randomUUID',()=>{const f=fixture();let n=0;f.context.crypto={getRandomValues:a=>{a.fill(++n);return a;}};const ids=f.api.start();assert.match(ids.run_id,/^[a-f0-9]{32}$/);assert.notEqual(ids.run_id,ids.clock_id);f.api.stop();});
