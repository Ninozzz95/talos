import {displayWidth} from '../text-width.ts';
import {transcriptItemRaw,type TranscriptItem} from '../transcript-model.ts';

export type TranscriptMeasurementSnapshot={version:number};
export type TranscriptMeasurementStore={
  getSnapshot:()=>TranscriptMeasurementSnapshot;
  subscribe:(listener:()=>void)=>(()=>void);
  height:(key:string)=>(number|null);
  measure:(key:string,height:number)=>boolean;
};

const MAX_TRANSCRIPT_MEASUREMENTS=4096;

export function transcriptMeasurementKey(itemId:string,width:number,variant:string):string{
  const normalizedWidth=Math.max(1,Math.floor(Number.isFinite(width)?width:1));
  return JSON.stringify([String(itemId),normalizedWidth,String(variant)]);
}

export function createTranscriptMeasurementStore():TranscriptMeasurementStore{
  let snapshot:TranscriptMeasurementSnapshot={version:0};
  const heights=new Map<string,number>();
  const listeners=new Set<()=>void>();
  const publish=()=>{snapshot={version:snapshot.version+1};for(const listener of [...listeners])listener();};
  return{
    getSnapshot:()=>snapshot,
    subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},
    height(key){return heights.get(String(key))??null;},
    measure(key,height){
      const id=String(key);
      if(!id||!Number.isFinite(height)||height<=0)return false;
      const normalized=Math.max(1,Math.ceil(height));
      if(heights.get(id)===normalized)return false;
      if(!heights.has(id)&&heights.size>=MAX_TRANSCRIPT_MEASUREMENTS){
        const oldest=heights.keys().next().value;
        if(typeof oldest==='string')heights.delete(oldest);
      }
      heights.set(id,normalized);
      publish();
      return true;
    },
  };
}

export type TranscriptVirtualWindow<T>={
  start:number;
  end:number;
  rows:T[];
  estimatedRows:number;
};

export function planTranscriptVirtualWindow<T>(input:{
  items:readonly T[];
  offset:number;
  rowBudget:number;
  heightOf:(item:T,index:number)=>number;
  revealIndex?:number;
  legacyPageSize?:number;
}):TranscriptVirtualWindow<T>{
  const {items,heightOf}=input;
  const offset=Number.isFinite(input.offset)?Math.max(0,Math.floor(input.offset)):0;
  const end=Math.max(0,Math.min(items.length,items.length-offset));
  if(end===0)return{start:0,end:0,rows:[],estimatedRows:0};
  const budget=Number.isFinite(input.rowBudget)?Math.max(1,Math.floor(input.rowBudget)):1;
  let start=end;
  let used=0;
  while(start>0){
    const index=start-1;
    const raw=Number(heightOf(items[index]!,index));
    const height=Number.isFinite(raw)&&raw>0?Math.max(1,Math.ceil(raw)):1;
    if(start<end&&used+height>budget)break;
    start=index;
    used+=height;
    if(used>=budget)break;
  }

  const revealIndex=Number.isFinite(input.revealIndex)?Math.floor(input.revealIndex!):-1;
  const legacyPageSize=Number.isFinite(input.legacyPageSize)?Math.max(1,Math.floor(input.legacyPageSize!)):0;
  if(revealIndex>=0&&revealIndex<start&&revealIndex<end&&legacyPageSize>0){
    const legacyStart=Math.max(0,end-legacyPageSize);
    if(revealIndex>=legacyStart){
      let legacyRows=0;
      for(let index=legacyStart;index<end;index++){
        const raw=Number(heightOf(items[index]!,index));
        legacyRows+=Number.isFinite(raw)&&raw>0?Math.max(1,Math.ceil(raw)):1;
      }
      return{start:legacyStart,end,rows:items.slice(legacyStart,end),estimatedRows:legacyRows};
    }
  }
  return{start,end,rows:items.slice(start,end),estimatedRows:used};
}

function estimateWrappedRows(text:string,width:number):number{
  const effectiveWidth=Math.max(8,Math.floor(Math.max(8,width)*0.75));
  const lines=String(text).split(/\r?\n/u);
  let rows=0;
  for(const line of lines){
    const measured=Math.max(1,displayWidth(line));
    rows+=Math.max(1,Math.ceil(measured/effectiveWidth));
  }
  return Math.max(1,rows);
}

export function estimateTranscriptItemRows(
  item:TranscriptItem,
  width:number,
  options:{raw?:boolean;expandedTools?:boolean}={},
):number{
  const normalizedWidth=Math.max(8,Math.floor(Number.isFinite(width)?width:80));
  if(options.raw)return estimateWrappedRows(transcriptItemRaw(item),normalizedWidth);
  if(item.kind==='message')return 1+estimateWrappedRows(item.text,normalizedWidth);
  if(item.kind==='reasoning')return 3+estimateWrappedRows(item.text||' ',Math.max(8,normalizedWidth-2));
  if(item.kind==='tool')return options.expandedTools?24:7;
  if(item.kind==='warning')return estimateWrappedRows(item.text,normalizedWidth);
  return estimateWrappedRows('Run · '+item.status+(item.message?' · '+item.message:''),normalizedWidth);
}
