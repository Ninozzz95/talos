import {summarize} from './statistics.mjs';
const requestNames = new Set(['provider_request_started','provider_first_token','renderer_first_token']);
const names = new Set(['task_submitted',...requestNames,'tool_started','tool_finished','task_verified',
  'task_failed','cancel_requested','task_quiescent']);
const terminalNames = new Set(['task_verified','task_failed']);
const needString = (v,key) => {
  if(typeof v!=='string' || !v.trim() || v.length>256) throw new TypeError(`Invalid ${key}`);
};
/** One task, multiple requests/tools, one monotonic observation clock. Not an execution engine. */
export function analyseTrace(trace) {
  if(!trace || trace.schema_version!==1) throw new TypeError('schema_version must be 1');
  const m=trace.metadata;
  if(!m || !['fixture','desktop','backend'].includes(m.scope)) throw new TypeError('Invalid scope');
  const fields=['run_id','clock_id','product','build_identity','task_identity','model_identity'];
  for(const k of fields) needString(m[k],k);
  if(!['instrumented','manual','fixture'].includes(m.event_origin)) throw new TypeError('Invalid event_origin');
  if((m.scope==='fixture')!==(m.event_origin==='fixture')) throw new TypeError('Fixture is not product evidence');
  if(!Array.isArray(trace.events)) throw new TypeError('events must be an array');
  const points=new Map(),starts=new Map(),ends=new Map(),requests=new Map();
  let previous=-Infinity,terminalCount=0,failedTools=0,cancelledTools=0;
  for(const e of trace.events) {
    if(!e || !names.has(e.event)) throw new TypeError('Unknown event');
    if(e.clock_id!==m.clock_id || e.run_id!==m.run_id) throw new Error('Mixed clocks or runs');
    if(e.origin!==undefined && e.origin!==m.event_origin) throw new Error('Mixed event origins');
    if(!Number.isFinite(e.mono_ms) || e.mono_ms<0 || e.mono_ms<previous) throw new Error('Invalid monotonic ordering');
    previous=e.mono_ms;
    if(e.event.startsWith('tool_')) {
      needString(e.tool_call_id,'tool_call_id');
      const map=e.event==='tool_started'?starts:ends;
      if(map.has(e.tool_call_id)) throw new Error('Duplicate tool event');
      if(e.event==='tool_finished') {
        if(!starts.has(e.tool_call_id)) throw new Error('Tool end without start');
        if(!['ok','failed','cancelled'].includes(e.outcome)) throw new Error('Tool outcome required');
        if(e.outcome==='failed') failedTools++;
        if(e.outcome==='cancelled') cancelledTools++;
      }
      map.set(e.tool_call_id,e.mono_ms);
    } else if(requestNames.has(e.event)) {
      needString(e.request_id,'request_id');
      if(!requests.has(e.request_id)) requests.set(e.request_id,new Map());
      const req=requests.get(e.request_id);
      if(req.has(e.event)) throw new Error('Duplicate request event');
      if(e.event!=='provider_request_started' && !req.has('provider_request_started')) throw new Error('Token event without request start');
      if(e.event==='renderer_first_token' && !req.has('provider_first_token')) throw new Error('Rendered token without ingest event on same clock');
      req.set(e.event,e.mono_ms);
    } else {
      if(points.has(e.event)) throw new Error('Duplicate singleton event');
      points.set(e.event,e);
      if(terminalNames.has(e.event)) terminalCount++;
      if(terminalCount>1) throw new Error('Multiple terminal outcomes');
      if(e.event==='task_verified' && e.verifier_exit_code!==0) throw new Error('Verified task needs verifier_exit_code=0');
    }
  }
  const delta=(a,b)=>{
    if(!points.has(a)||!points.has(b)) return null;
    const d=points.get(b).mono_ms-points.get(a).mono_ms;
    if(d<0) throw new Error(`Causal order violated: ${a}, ${b}`);
    return d;
  };
  const ttfts=[],renderDelays=[],renderTimes=[];
  for(const req of requests.values()) {
    if(req.has('provider_first_token')) ttfts.push(req.get('provider_first_token')-req.get('provider_request_started'));
    if(req.has('renderer_first_token')) {
      renderDelays.push(req.get('renderer_first_token')-req.get('provider_first_token'));
      renderTimes.push(req.get('renderer_first_token'));
    }
  }
  let firstRender=null;
  if(points.has('task_submitted') && renderTimes.length) {
    firstRender=Math.min(...renderTimes)-points.get('task_submitted').mono_ms;
    if(firstRender<0) throw new Error('Rendered before task submission');
  }
  const metrics={
    task_verified_wall_ms:delta('task_submitted','task_verified'),
    task_failed_wall_ms:delta('task_submitted','task_failed'),
    user_to_first_rendered_token_ms:firstRender,
    provider_ttft_ms:summarize(ttfts),first_token_ingest_to_render_ms:summarize(renderDelays),
    provider_requests_started:requests.size,requests_without_observed_first_token:requests.size-ttfts.length,
    cancel_to_quiescent_ms:delta('cancel_requested','task_quiescent'),
    complete_tool_durations_ms:summarize([...ends].map(([id,end])=>end-starts.get(id))),
    tool_calls_started:starts.size,tool_calls_completed:ends.size,tool_calls_incomplete:starts.size-ends.size,
    tool_calls_failed:failedTools,tool_calls_cancelled:cancelledTools,
    tokens_per_second:null,total_desktop_rss_bytes:null,quality_score:null,
  };
  return {schema_version:1,metadata:Object.fromEntries(['scope','event_origin',...fields].map(k=>[k,m[k]])),
    computation:'analysis_of_supplied_trace_not_independent_product_verification',
    status:points.has('task_verified')?'verifier_success_reported':points.has('task_failed')?'failure_reported':
      (points.has('cancel_requested')&&points.has('task_quiescent'))?'cancellation_quiescence_reported':'incomplete',
    metrics,warnings:[
      'Clock equality and ordering are checked; calibration and event semantics need external evidence.',
      'Task verification is an observer assertion; archive the independent verifier logs.',
      'Missing metrics remain null. No LLM tokens are inferred from bytes or stdout.',
      'Percentiles describe supplied samples; no ranking or statistical significance is inferred.',
    ]};
}
