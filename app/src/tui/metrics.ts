export type TuiRenderReason='event'|'input'|'approval'|'motion'|'resize'|'idle';
export type TuiMetricName='tui.render.committed'|'tui.render.idle'|'tui.render.coalesce_ms'|'tui.event_to_visible_ms';
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
