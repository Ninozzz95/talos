/*
 * The Context Manager's «Request sent» (owner 01/11, the PC's «Richiesta inviata»): the last request this chat sent to the model, as the
 * kernel keeps it in memory (`leggiUltimaRichiesta`, `copiaDellaRichiesta`: the images are already left out, each one a marker, and the tools
 * are counted, not shown: they are in /capability). Each message is a row with who sent it and its first line; the detail is its text as sent.
 * Pure: the record in, rows out. Nothing is read from the disk: before the first turn, or after a restart, there is nothing to show and it says so.
 */
import {t,tn,type MessageId} from '../../i18n/index.ts';
import {S,wrap,type PanelItem,type SegRow} from './sheet.ts';

export type RequestSent={at:string|null;model:string|null;messages:readonly unknown[];tools:number};
type Shown={role:string;text:string;images:number;calls:readonly string[]};
const ROLE:Record<string,MessageId>={system:'panel.context.sent.role.system',developer:'panel.context.sent.role.system',user:'panel.context.sent.role.user',assistant:'panel.context.sent.role.assistant',tool:'panel.context.sent.role.tool'};
/** The text a message carried and how many images were left out of it; the tools it asked for by name. */
export function shownMessage(raw:unknown):Shown{
  const m=(raw&&typeof raw==='object'?raw:{}) as {role?:unknown;content?:unknown;tool_calls?:unknown};
  let text='',images=0;
  if(typeof m.content==='string')text=m.content;
  else if(Array.isArray(m.content))for(const part of m.content){const p=part as {type?:unknown;text?:unknown;omitted?:unknown};
    if(typeof p?.text==='string')text+=(text?'\n':'')+p.text;else if(p?.omitted===true||p?.type!=='text')images+=1;}
  const calls=Array.isArray(m.tool_calls)?m.tool_calls.map(call=>String((call as any)?.function?.name??(call as any)?.name??'')).filter(Boolean):[];
  return{role:typeof m.role==='string'?m.role:'unknown',text,images,calls};
}
const roleWord=(role:string)=>ROLE[role]?t(ROLE[role]!):role;
const firstLine=(text:string)=>text.split('\n').find(line=>line.trim())?.trim()??'';

/** Over the list: when it was sent, to which model, what it carried, and how many images are not shown. */
export function requestSentTop(sent:RequestSent|null,width:number):SegRow[]{
  if(!sent)return[];
  const images=sent.messages.reduce((sum:number,raw)=>sum+shownMessage(raw).images,0);
  const at=sent.at?new Date(sent.at):null;const when=at&&Number.isFinite(at.getTime())?`${String(at.getHours()).padStart(2,'0')}:${String(at.getMinutes()).padStart(2,'0')}`:null;
  const words=[when?t('panel.context.sent.at',{when}):null,sent.model,t('panel.context.sent.counts',{messages:sent.messages.length,tools:sent.tools}),images?tn('panel.context.sent.images',images):null].filter(Boolean).join(' · ');
  return[...wrap(` ${words}`,width).map(line=>[S(line,'faint')] as SegRow),[S('')]];
}
export function requestSentItems(sent:RequestSent|null):PanelItem[]{
  const shown=(sent?.messages??[]).map(shownMessage);const total=new Map<string,number>();for(const m of shown)total.set(m.role,(total.get(m.role)??0)+1);
  const seen=new Map<string,number>();
  return shown.map((m,index)=>{const n=(seen.get(m.role)??0)+1;seen.set(m.role,n);
    const label=m.role==='system'&&(total.get('system')??0)>1?t('panel.context.sent.part',{role:roleWord(m.role),n,count:total.get('system')!}):roleWord(m.role);
    const desc=firstLine(m.text)||(m.calls.length?t('panel.context.sent.calls',{names:m.calls.join(', ')}):t('panel.context.sent.noText'));
    return{id:String(index),label,desc,...(m.images?{badge:tn('panel.context.sent.imagesShort',m.images),badgeRoles:['dim','band']}:{})};});
}
/** The message as it was sent, at most 400 rows of it (the rest is said, never cut silently). */
export function requestSentDetail(sent:RequestSent|null,id:string|undefined,width:number):SegRow[]{
  const raw=sent?.messages[Number(id)];if(raw===undefined)return[];const m=shownMessage(raw);
  const text=m.text||t('panel.context.sent.noText');const cap=400*Math.max(20,width);
  const rows=wrap(text.length>cap?text.slice(0,cap):text,width);const shown=rows.slice(0,400);
  const left=text.length>cap?Math.max(1,Math.ceil((text.length-cap)/Math.max(20,width))):0;
  return[[S(roleWord(m.role),'b'),S(`  ${t('panel.context.sent.chars',{count:m.text.length})}`,'faint')],...(m.calls.length?[[S(t('panel.context.sent.calls',{names:m.calls.join(', ')}),'faint')] as SegRow]:[]),
    ...(m.images?[[S(tn('panel.context.sent.images',m.images),'faint')] as SegRow]:[]),[S('')],...shown.map(line=>[S(line)] as SegRow),
    ...(rows.length>shown.length||left?[[S(t('panel.context.sent.more',{count:rows.length-shown.length+left}),'faint')] as SegRow]:[])];
}
