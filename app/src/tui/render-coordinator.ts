import {createTuiMetricsProfiler,type TuiRenderReason} from './metrics.ts';
import {COALESCE_WINDOW_MS,MOTION_FRAME_MS} from './render-scheduler.ts';

export type RenderCoordinatorBatch={
  epoch:number;
  reason:Exclude<TuiRenderReason,'idle'>;
  eventIds:string[];
  coalescedMs:number;
};
export type RenderCoordinatorProfiler=ReturnType<typeof createTuiMetricsProfiler>;
export type RenderCoordinator={
  subscribe(listener:(batch:RenderCoordinatorBatch)=>void):()=>void;
  enqueueEvent(eventId:string,apply:()=>void):void;
  enqueueMotion(apply:()=>void):void;
  immediate(reason:'input'|'approval'|'resize',apply:()=>void):RenderCoordinatorBatch;
  startMotion(apply:()=>void):()=>void;
  markVisible(epoch:number):void;
  dispose():void;
};

type TimerApi={
  clock:()=>number;
  setTimer:(fn:()=>void,delayMs:number)=>unknown;
  clearTimer:(handle:unknown)=>void;
};
type Pending={reason:'event'|'motion'|'resize';apply:()=>void;eventId?:string};

function defaultTimers():TimerApi{return{
  clock:()=>performance.now(),
  setTimer:(fn,delayMs)=>setTimeout(fn,delayMs),
  clearTimer:handle=>clearTimeout(handle as ReturnType<typeof setTimeout>),
};}

export function createRenderCoordinator(options:{
  clock?:()=>number;
  setTimer?:(fn:()=>void,delayMs:number)=>unknown;
  clearTimer?:(handle:unknown)=>void;
  windowMs?:number;
  motionPeriodMs?:number;
  profiler?:RenderCoordinatorProfiler;
}={}):RenderCoordinator{
  const defaults=defaultTimers();
  const clock=options.clock??defaults.clock;
  const setTimer=options.setTimer??defaults.setTimer;
  const clearTimer=options.clearTimer??defaults.clearTimer;
  const windowMs=Math.max(1,Math.min(COALESCE_WINDOW_MS,options.windowMs??COALESCE_WINDOW_MS));
  const motionPeriodMs=Math.max(1,options.motionPeriodMs??MOTION_FRAME_MS);
  const profiler=options.profiler??createTuiMetricsProfiler({clock});
  const listeners=new Set<(batch:RenderCoordinatorBatch)=>void>();
  const awaitingVisible=new Map<number,RenderCoordinatorBatch>();
  const pending:Pending[]=[];
  let pendingSince:number|null=null;
  let flushTimer:unknown|null=null;
  let epoch=0;
  const motionTimers=new Set<unknown>();
  let disposed=false;

  function cancelFlushTimer(){
    if(flushTimer!==null){clearTimer(flushTimer);flushTimer=null;}
  }
  function scheduleFlush(){
    if(disposed||flushTimer!==null)return;
    flushTimer=setTimer(()=>{flushTimer=null;flushPending();},windowMs);
  }
  function flushPending(override?:RenderCoordinatorBatch['reason']):RenderCoordinatorBatch{
    if(disposed)throw new Error('RENDER_COORDINATOR_DISPOSED');
    cancelFlushTimer();
    const started=pendingSince??clock();
    const rows=pending.splice(0,pending.length);
    pendingSince=null;
    for(const row of rows)row.apply();
    epoch+=1;
    const batch:RenderCoordinatorBatch={
      epoch,
      reason:override??strongestReasonFrom(rows),
      eventIds:rows.flatMap(row=>row.eventId?[row.eventId]:[]),
      coalescedMs:Math.max(0,clock()-started),
    };
    profiler.renderCoalesced(batch.coalescedMs);
    awaitingVisible.set(epoch,batch);
    for(const listener of listeners)listener(batch);
    return batch;
  }
  function strongestReasonFrom(rows:readonly Pending[]):RenderCoordinatorBatch['reason']{
    if(rows.some(row=>row.reason==='event'))return'event';
    if(rows.some(row=>row.reason==='resize'))return'resize';
    return'motion';
  }
  function queue(row:Pending){
    if(disposed)throw new Error('RENDER_COORDINATOR_DISPOSED');
    if(pending.length===0)pendingSince=clock();
    pending.push(row);scheduleFlush();
  }

  const enqueueMotion=(apply:()=>void)=>queue({reason:'motion',apply});
  return{
    subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},
    enqueueEvent(eventId,apply){profiler.eventReceived(eventId);queue({reason:'event',apply,eventId});},
    enqueueMotion,
    immediate(reason,apply){
      if(disposed)throw new Error('RENDER_COORDINATOR_DISPOSED');
      if(pending.length===0)pendingSince=clock();
      pending.push({reason:reason==='resize'?'resize':'event',apply});
      return flushPending(reason);
    },
    startMotion(apply){
      if(disposed)throw new Error('RENDER_COORDINATOR_DISPOSED');
      let active=true;
      let handle:unknown|null=null;
      const tick=()=>{
        if(!active||disposed)return;
        motionTimers.delete(handle!);
        handle=null;
        enqueueMotion(apply);
        handle=setTimer(tick,motionPeriodMs);
        motionTimers.add(handle);
      };
      handle=setTimer(tick,motionPeriodMs);
      motionTimers.add(handle);
      return()=>{
        active=false;
        if(handle!==null){clearTimer(handle);motionTimers.delete(handle);handle=null;}
      };
    },
    markVisible(visibleEpoch){
      const visible=[...awaitingVisible.entries()]
        .filter(([candidate])=>candidate<=visibleEpoch)
        .sort((a,b)=>a[0]-b[0]);
      if(visible.length===0)return;
      for(const [candidate] of visible)awaitingVisible.delete(candidate);
      const batches=visible.map(([,batch])=>batch);
      const latest=batches.at(-1)!;
      profiler.renderCommitted({eventIds:batches.flatMap(batch=>batch.eventIds),reason:latest.reason});
    },
    dispose(){
      if(disposed)return;disposed=true;
      cancelFlushTimer();
      for(const timer of motionTimers)clearTimer(timer);
      motionTimers.clear();pending.length=0;pendingSince=null;listeners.clear();awaitingVisible.clear();
    },
  };
}
