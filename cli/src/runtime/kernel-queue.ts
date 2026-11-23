import type {CliKernelQueue,CliKernelQueueItem,CliKernelQueueOrigin} from './types.ts';

/* F-Q1 (owner 03/10, «Come Claude Code, completo»): the kernel's queue as the CLI reads it — `statoCodaDi` in
   session-registry.mjs, carried by CUSTOM talos.coda and by `accodaMessaggio`/`statoCoda`. Unknown shapes read as empty. */
/* The kernel's `origine`, in English: no origin is the person; an origin the CLI does not know reads as a dialogue message (the
   screen shows no text for it, and v2 never carries the model-facing note). */
const ORIGINS:Readonly<Record<string,CliKernelQueueOrigin>>={delega:'delegation',sfondo:'background',workflow:'workflow'};
const ENGLISH=new Set<string>(['person','delegation','dialogue','background','workflow']);
export function queueOriginOf(value:unknown,dialogueKind?:unknown):CliKernelQueueOrigin{
  if(typeof value==='string'&&Object.hasOwn(ORIGINS,value))return ORIGINS[value]!;
  if(typeof dialogueKind==='string'&&dialogueKind)return'dialogue';
  return typeof value==='string'&&value?'dialogue':'person';
}
export const isQueueOrigin=(value:unknown):value is CliKernelQueueOrigin=>typeof value==='string'&&ENGLISH.has(value);
export function kernelQueueOf(raw:unknown):CliKernelQueue{
  const value=raw&&typeof raw==='object'?raw as Record<string,unknown>:{};
  const rows=Array.isArray(value.voci)?value.voci:Array.isArray(value.items)?value.items:[];
  const items:CliKernelQueueItem[]=[];
  for(const row of rows){
    if(!row||typeof row!=='object')continue;
    const r=row as Record<string,unknown>;
    const id=typeof r.id==='string'?r.id:'';const text=typeof r.testo==='string'?r.testo:typeof r.text==='string'?r.text:'';
    if(!id||!text)continue;
    const images=Number.isSafeInteger(r.immagini)?Number(r.immagini):Number.isSafeInteger(r.images)?Number(r.images):0;
    const origin=isQueueOrigin(r.origin)?r.origin:queueOriginOf(r.origine,r.dialogueKind);
    const childId=typeof r.childId==='string'&&r.childId?r.childId:undefined;
    items.push({id,text,images,origin,...(childId?{childId}:{})});
  }
  return{items,paused:(value.inPausa===true||value.paused===true)&&items.length>0};
}
