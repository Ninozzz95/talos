import {sanitizeTranscriptText} from '../transcript-model.ts';
import type {TuiEvent} from '../event-adapter.ts';
export type TranscriptViewport={offset:number;pageSize:number;unseen:number;followingTail:boolean};

export function reduceViewport(view:TranscriptViewport,event:'page-up'|'page-down'|'new-content'|'jump-tail',total:number):TranscriptViewport{
  if(event==='jump-tail')return{...view,offset:0,unseen:0,followingTail:true};
  if(event==='new-content')return view.followingTail?{...view,offset:0}:{...view,unseen:view.unseen+1};
  if(event==='page-up'){const max=Math.max(0,total-view.pageSize);const offset=Math.min(max,view.offset+view.pageSize);return{...view,offset,followingTail:false};}
  const offset=Math.max(0,view.offset-view.pageSize);return{...view,offset,followingTail:offset===0,unseen:offset===0?0:view.unseen};
}

export function transcriptWindow<T>(rows:readonly T[],view:TranscriptViewport):T[]{
  const end=Math.max(0,rows.length-Math.max(0,view.offset));const start=Math.max(0,end-Math.max(1,view.pageSize));return rows.slice(start,end);
}

export function transcriptEventAddsItem(event:TuiEvent):boolean{return event.type==='run.started'||event.type==='message.started'||event.type==='reasoning.started'||event.type==='tool.started'||event.type==='warning';}

export const TRANSCRIPT_COPY_MAX_BYTES=1024*1024;
export class TranscriptCopyError extends Error{code:string;constructor(code:string,message=code){super(message);this.name='TranscriptCopyError';this.code=code;}}
export function transcriptViewportForIndex(view:TranscriptViewport,total:number,index:number):TranscriptViewport{
  const count=Math.max(0,Math.trunc(total)),pageSize=Math.max(1,Math.trunc(view.pageSize));
  if(count===0)return{...view,offset:0,unseen:0,followingTail:true};
  const target=Math.max(0,Math.min(count-1,Math.trunc(index)));
  const maxOffset=Math.max(0,count-pageSize);
  const offset=Math.min(maxOffset,Math.max(0,count-1-target));
  return{...view,offset,followingTail:offset===0,unseen:offset===0?0:view.unseen};
}
export function osc52CopySequence(text:string):string{
  const safe=sanitizeTranscriptText(String(text));
  const bytes=Buffer.byteLength(safe,'utf8');
  if(bytes>TRANSCRIPT_COPY_MAX_BYTES)throw new TranscriptCopyError('TRANSCRIPT_COPY_LIMIT','Selected transcript text exceeds the explicit copy byte limit.');
  return '\u001b]52;c;'+Buffer.from(safe,'utf8').toString('base64')+'\u0007';
}
