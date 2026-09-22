import {displayWidth,truncateDisplay} from '../text-width.ts';

export type FooterField={
  id:'workspace'|'session'|'model'|'mode'|'context'|'run'|'unseen'|'queue';
  text:string;
  priority:number;
};

export function sanitizeStatus(text:string){
  return String(text).replace(/[\r\n\t]+/gu,' ').replace(/\s{2,}/gu,' ').trim();
}

export function layoutFooter(fields:FooterField[],width:number){
  const limit=Math.max(0,Math.floor(width));
  if(limit===0)return'';
  const kept=[...fields]
    .filter(field=>sanitizeStatus(field.text).length>0)
    .sort((a,b)=>b.priority-a.priority);
  const render=()=>kept.map(field=>sanitizeStatus(field.text)).join(' · ');
  while(kept.length&&displayWidth(render())>limit){
    let lowest=0;
    for(let index=1;index<kept.length;index++)if(kept[index]!.priority<kept[lowest]!.priority)lowest=index;
    kept.splice(lowest,1);
  }
  return truncateDisplay(render(),limit);
}

export function contextUsageLabel(usage:unknown,_contextWindow:number|null){
  if(!usage||typeof usage!=='object')return null;
  const row=usage as Record<string,unknown>;
  if(row.schema==='talos.cli.context-status.v1'){
    const measured=row.measurement&&typeof row.measurement==='object'?row.measurement as Record<string,unknown>:null;
    const input=finiteNumber(measured?.inputTokens),window=finiteNumber(measured?.windowTokens),percent=finiteNumber(measured?.percentOfWindow);
    if(input===null||window===null||window<=0||percent===null)return null;
    return`context ${compactCount(input)}/${compactCount(window)} · ${percent}%${measured?.stale===true?' stale':''}`;
  }
  const prompt=finiteNumber(row.prompt_tokens??row.promptTokens??row.input_tokens??row.inputTokens);
  const completion=finiteNumber(row.completion_tokens??row.completionTokens??row.output_tokens??row.outputTokens);
  if(prompt===null&&completion===null)return null;
  return`usage ${compactCount((prompt??0)+(completion??0))}`;
}

function finiteNumber(value:unknown){return typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null;}
function compactCount(value:number){
  if(value<1000)return String(Math.round(value));
  if(value<1_000_000)return`${trimDecimal(value/1000)}k`;
  return`${trimDecimal(value/1_000_000)}m`;
}
function trimDecimal(value:number){return value.toFixed(1).replace(/\.0$/u,'');}
