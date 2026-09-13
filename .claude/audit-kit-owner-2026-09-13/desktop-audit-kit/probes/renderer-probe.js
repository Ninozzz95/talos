/* Paste in the desktop renderer DevTools ONLY if already permitted by the application.
   No remote-debugging port, Node integration, cookies, DOM contents or network access. */
(() => {
  'use strict';
  if (Object.prototype.hasOwnProperty.call(globalThis, 'TalosDesktopAudit')) return;
  const summary = values => {
    const a = [...values].sort((x,y)=>x-y), n = a.length;
    const q = p => {const i=(n-1)*p, l=Math.floor(i), h=Math.ceil(i); return a[l]+(a[h]-a[l])*(i-l);};
    return n ? {n, min:a[0], median:q(.5), p95:q(.95), max:a[n-1]} : {n:0,min:null,median:null,p95:null,max:null};
  };
  const allowed = new Set(['task_submitted','provider_request_started','provider_first_token',
    'renderer_first_token','tool_started','tool_finished','task_verified','task_failed','cancel_requested','task_quiescent']);
  const identifier = () => {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    // Correlation identifier, not an authentication token. Supports trusted blank fixture contexts.
    return Array.from(crypto.getRandomValues(new Uint8Array(16)), b=>b.toString(16).padStart(2,'0')).join('');
  };
  let current = null;
  function start({capacity = 6000} = {}) {
    if (current) throw new Error('Probe is already running');
    if (!Number.isSafeInteger(capacity) || capacity < 16 || capacity > 100000) throw new RangeError('capacity must be 16..100000');
    const state = {clock_id:identifier(),run_id:identifier(), start:performance.now(), stop:null,
      capacity, frames:[], longs:[], frameTotal:0, longTotal:0, longMs:0, marks:[], droppedMarks:0,
      raf:0, last:null, observer:null, longtask_supported:false};
    const ring = (arr,v,index) => {if (arr.length < capacity) arr.push(v); else arr[index % capacity] = v;};
    const collectLongs = list => {
      for (const e of list) {ring(state.longs,e.duration,state.longTotal); state.longTotal++; state.longMs+=e.duration;}
    };
    const frame = t => {
      if (document.visibilityState === 'visible') {
        if (state.last !== null) {ring(state.frames,t-state.last,state.frameTotal); state.frameTotal++;}
        state.last = t;
      } else state.last = null;
      state.raf = requestAnimationFrame(frame);
    };
    state.onVisibility = () => {state.last = null;};
    document.addEventListener('visibilitychange', state.onVisibility);
    if (globalThis.PerformanceObserver?.supportedEntryTypes?.includes('longtask')) {
      state.observer = new PerformanceObserver(list => collectLongs(list.getEntries()));
      try {state.observer.observe({type:'longtask', buffered:false}); state.longtask_supported=true;}
      catch {state.observer.disconnect();state.observer=null;}
    }
    state.collectLongs = collectLongs;
    current = state; state.raf = requestAnimationFrame(frame);
    return {run_id:state.run_id, clock_id:state.clock_id};
  }
  function snapshot() {
    if (!current) throw new Error('Probe is not running');
    const s = current;
    return {schema_version:1, scope:'renderer_observer_not_whole_desktop', run_id:s.run_id,clock_id:s.clock_id,
      start_mono_ms:s.start,end_mono_ms:s.stop ?? performance.now(),capacity:s.capacity,
      raf_callback_gaps_ms:snapshotSummary(s.frames,s.frameTotal),
      longtask_durations_ms:s.longtask_supported ? snapshotSummary(s.longs,s.longTotal) : null,
      longtask_total_duration_ms:s.longtask_supported?s.longMs:null,
      marks:s.marks.map(m=>({...m})),dropped_marks:s.droppedMarks,
      notes:['rAF callback gaps are not a direct FPS or dropped-frame measurement.',
        'Percentiles cover the last capacity observations, not the complete session.',
        'Marks are manually supplied; no automatic first-token or task-completion detection.']};
  }
  function snapshotSummary(a,total) {return {...summary(a),total_observed:total,overwritten:Math.max(0,total-a.length)};}
  function mark(event, {tool_call_id,request_id,verifier_exit_code,outcome} = {}) {
    if (!current) throw new Error('Probe is not running');
    if (!allowed.has(event)) throw new Error('Unknown marker');
    if (event.startsWith('tool_') && (typeof tool_call_id!=='string' || !tool_call_id || tool_call_id.length>128)) throw new Error('Tool call ID required');
    if (['provider_request_started','provider_first_token','renderer_first_token'].includes(event) && (typeof request_id!=='string' || !request_id || request_id.length>128)) throw new Error('Request ID required');
    if (event==='tool_finished' && !['ok','failed','cancelled'].includes(outcome)) throw new Error('Tool outcome required');
    if (event==='task_verified' && verifier_exit_code!==0) throw new Error('Independent verifier success is required');
    if (current.marks.length>=current.capacity) {current.droppedMarks++;return false;}
    const m = {event,run_id:current.run_id,clock_id:current.clock_id,mono_ms:performance.now(),origin:'manual'};
    if (event.startsWith('tool_')) m.tool_call_id = tool_call_id;
    if (['provider_request_started','provider_first_token','renderer_first_token'].includes(event)) m.request_id=request_id;
    if (event==='tool_finished') m.outcome=outcome;
    if (event==='task_verified') m.verifier_exit_code=0;
    current.marks.push(m);return true;
  }
  function stop() {
    if (!current) throw new Error('Probe is not running');
    const s=current; cancelAnimationFrame(s.raf); document.removeEventListener('visibilitychange',s.onVisibility);
    if (s.observer) {s.collectLongs(s.observer.takeRecords());s.observer.disconnect();}
    s.stop=performance.now(); const value=snapshot(); current=null;return value;
  }
  Object.defineProperty(globalThis,'TalosDesktopAudit',{value:Object.freeze({start,mark,snapshot,stop}),configurable:true});
})();
