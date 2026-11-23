export type TuiRenderReason='event'|'input'|'approval'|'motion'|'resize'|'idle';
export type TuiMetricName='tui.render.committed'|'tui.render.idle'|'tui.render.coalesce_ms'|'tui.event_to_visible_ms'|'tui.output.bytes'|'tui.output.frame'|'tui.output.clear'|'tui.ink.render_ms';
export type TuiMetric={name:TuiMetricName;value:number;unit:'count'|'milliseconds';tags?:Readonly<Record<string,string>>};
export type TuiMetricsSink={record(metric:TuiMetric):void};

export const NOOP_TUI_METRICS_SINK:Readonly<TuiMetricsSink>=Object.freeze({record(_metric:TuiMetric):void{}});

export function createTuiMetricsCollector(){
  const metrics:TuiMetric[]=[];
  return{
    sink:{record(metric:TuiMetric){metrics.push(structuredClone(metric));}} satisfies TuiMetricsSink,
    snapshot:()=>structuredClone(metrics),
    reset:()=>{metrics.length=0;}
  };
}

/* UI phase stage 2, cure 2a (heap probe 2, 01/10): render metrics exist only when asked for with TALOS_TUI_RENDER_METRICS=1;
   otherwise the sink is the null one and no sample is kept (it was ~1.5 MB per 200 short turns, read by nobody). */
export function createTuiRenderMetrics(env:Readonly<Record<string,string|undefined>>){
  if(env.TALOS_TUI_RENDER_METRICS!=='1')return{enabled:false as const,sink:NOOP_TUI_METRICS_SINK,summary:():ReturnType<typeof summarizeTuiMetrics>|null=>null};
  const collector=createTuiMetricsCollector();
  return{enabled:true as const,sink:collector.sink as TuiMetricsSink,summary:():ReturnType<typeof summarizeTuiMetrics>|null=>summarizeTuiMetrics(collector.snapshot())};
}

export function createTuiMetricsProfiler(options:{sink?:TuiMetricsSink;clock?:()=>number}={}){
  const sink=options.sink??NOOP_TUI_METRICS_SINK;
  const clock=options.clock??(()=>performance.now());
  const receivedAt=new Map<string,number>();
  return{
    eventReceived(eventId:string){receivedAt.set(eventId,clock());},
    renderCoalesced(waitMs:number){sink.record({name:'tui.render.coalesce_ms',value:Math.max(0,waitMs),unit:'milliseconds'});},
    renderCommitted({eventIds=[],reason}:{eventIds?:readonly string[];reason:TuiRenderReason}){
      sink.record({name:'tui.render.committed',value:1,unit:'count',tags:{reason}});
      const visibleAt=clock();
      for(const eventId of eventIds){
        const received=receivedAt.get(eventId);
        if(received===undefined)continue;
        sink.record({name:'tui.event_to_visible_ms',value:Math.max(0,visibleAt-received),unit:'milliseconds'});
        receivedAt.delete(eventId);
      }
      if(reason==='idle')sink.record({name:'tui.render.idle',value:1,unit:'count'});
    }
  };
}

function percentile(values:readonly number[],fraction:number):number{
  if(values.length===0)return 0;
  const sorted=[...values].sort((a,b)=>a-b);
  const rank=Math.max(1,Math.ceil(sorted.length*fraction));
  return sorted[Math.min(sorted.length-1,rank-1)]!;
}
export function summarizeTuiMetrics(metrics:readonly TuiMetric[]){
  const visible=metrics.filter(row=>row.name==='tui.event_to_visible_ms').map(row=>row.value);
  const coalesced=metrics.filter(row=>row.name==='tui.render.coalesce_ms').map(row=>row.value);
  const renders=metrics.filter(row=>row.name==='tui.ink.render_ms').map(row=>row.value);
  const total=(name:TuiMetricName,kind?:string)=>metrics.reduce((sum,row)=>row.name===name&&(kind===undefined||row.tags?.kind===kind)?sum+row.value:sum,0);
  return{
    committed:metrics.filter(row=>row.name==='tui.render.committed').length,
    idle:metrics.filter(row=>row.name==='tui.render.idle').length,
    coalesceMaxMs:coalesced.length?Math.max(...coalesced):0,
    eventToVisible:{
      count:visible.length,
      p50:percentile(visible,0.50),
      p95:percentile(visible,0.95),
      max:visible.length?Math.max(...visible):0,
    },
    /* Gate E6: what TALOS itself wrote (before ConPTY), and how often Ink rendered. Zero while idle is the target (E5). */
    inkRenders:{count:renders.length,maxMs:renders.length?Math.max(...renders):0},
    frames:total('tui.output.frame'),
    bytes:total('tui.output.bytes'),
    clears:{display:total('tui.output.clear','display'),scrollback:total('tui.output.clear','scrollback')},
  };
}

/**
 * Gate E6, in-process: counts what TALOS writes to the terminal — bytes, DEC 2026 frames (one BSU per Ink frame) and
 * the full clears `ESC[2J` / `ESC[3J` that Ink 7.1.1 writes on win32 for every commit of a frame at least as tall as the
 * terminal (`ink/build/ink.js:83-112, 748-772`). A sequence split across two writes counts once: a match counts only
 * when it ends in the newest chunk.
 */
const OUTPUT_SEQUENCES:ReadonlyArray<readonly [string,TuiMetricName,Readonly<Record<string,string>>|undefined]>=[
  ['\u001B[?2026h','tui.output.frame',undefined],
  ['\u001B[2J','tui.output.clear',{kind:'display'}],
  ['\u001B[3J','tui.output.clear',{kind:'scrollback'}],
];
export function createTerminalOutputMeter(sink:TuiMetricsSink){
  let carry='';
  return{observe(chunk:unknown){
    const text=typeof chunk==='string'?chunk:chunk instanceof Uint8Array?Buffer.from(chunk.buffer,chunk.byteOffset,chunk.byteLength).toString('latin1'):'';
    const bytes=typeof chunk==='string'?Buffer.byteLength(chunk):chunk instanceof Uint8Array?chunk.byteLength:0;
    if(bytes===0)return;
    sink.record({name:'tui.output.bytes',value:bytes,unit:'count'});
    const scan=carry+text;
    for(const [sequence,name,tags] of OUTPUT_SEQUENCES){
      let found=0;for(let at=scan.indexOf(sequence);at>=0;at=scan.indexOf(sequence,at+1))if(at+sequence.length>carry.length)found++;
      if(found)sink.record({name,value:found,unit:'count',...(tags?{tags}:{})});
    }
    carry=scan.slice(-7);
  }};
}

/**
 * Wires the E6 counters for `TALOS_TUI_RENDER_METRICS=1`: wraps `stdout.write` (every chunk still reaches the terminal)
 * and gives the `onRender` option of Ink's `render()` (Ink 7.1.1 calls it once per rendered frame, after throttling;
 * `ink/build/ink.js:349`), so Ink renders are counted in-process. `dispose()` restores the original `write`.
 */
export function createTuiRenderMetricsTap({stdout,sink}:{stdout:{write:(...args:any[])=>boolean};sink:TuiMetricsSink}){
  const meter=createTerminalOutputMeter(sink);
  const original=stdout.write;
  const tapped=function(this:unknown,...args:any[]){meter.observe(args[0]);return original.apply(this??stdout,args);};
  stdout.write=tapped;
  return{
    inkOptions:{onRender({renderTime}:{renderTime:number}){sink.record({name:'tui.ink.render_ms',value:Math.max(0,renderTime),unit:'milliseconds'});}},
    dispose(){if(stdout.write===tapped)stdout.write=original;},
  };
}


export function currentProcessPerformanceSnapshot(){
  const memory=process.memoryUsage();const usage=process.resourceUsage();
  let eventLoopUtilization:number|null=null;
  try{const p:any=performance as any;const row=typeof p.eventLoopUtilization==='function'?p.eventLoopUtilization():null;eventLoopUtilization=typeof row?.utilization==='number'&&Number.isFinite(row.utilization)?row.utilization:null;}catch{}
  return{
    rssBytes:memory.rss,heapUsedBytes:memory.heapUsed,externalBytes:memory.external,
    userCPUTimeMicros:usage.userCPUTime,systemCPUTimeMicros:usage.systemCPUTime,
    maxRSSKiB:usage.maxRSS,eventLoopUtilization,
  };
}
