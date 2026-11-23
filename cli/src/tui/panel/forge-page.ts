/*
 * C9 of the redesign: Forge, the tools made in the forge, as a page. Filters All, Enabled, Disabled; space turns one on or off, b goes back
 * to its previous version; the detail says what it can use, what it does and the risk it declared, from the forge store (forge-facade.ts).
 * Turning a tool on or off is the owner's act on a session: with no session open the page says so instead of acting.
 */
import type {ForgeRow} from '../../services/forge-facade.ts';
import {t} from '../../i18n/index.ts';
import {S,wrap,type PanelItem,type SegRow} from './sheet.ts';

export type ForgeDetail={id:string;title:string;description:string;enabled:boolean;ownerManaged:boolean;ownerRevision:number|null;risk:string;
  capabilities:readonly unknown[];actions:readonly unknown[];scan:{ok?:boolean}|null;versions:readonly any[]};
export type ForgeData={state:'ready'|'invalid';rows:readonly ForgeRow[];error:{code:string;message:string}|null;details:ReadonlyMap<string,ForgeDetail>};
export const FORGE_FILTERS=['all','enabled','disabled'] as const;

export function forgeItems(data:ForgeData):PanelItem[]{
  return data.rows.map(row=>{const detail=data.details.get(row.id);
    return{id:row.id,label:row.title,current:row.enabled,meta:t('panel.forge.risk',{risk:row.risk}),desc:detail?.description||row.id,
      ...(row.ownerRevision!==null?{badge:t('panel.forge.version',{revision:row.ownerRevision}),badgeRoles:['dim','band']}:{})};});
}
export const forgeMatch=(data:ForgeData,filter:(typeof FORGE_FILTERS)[number])=>(item:PanelItem)=>{const row=data.rows.find(value=>value.id===item.id);return filter==='enabled'?Boolean(row?.enabled):!row?.enabled;};

/** The version before the current one, the one b goes back to; null when there is none. */
export function previousRevision(detail:ForgeDetail|undefined):number|null{
  const current=detail?.ownerRevision??Number.MAX_SAFE_INTEGER;
  const earlier=(detail?.versions??[]).map(v=>Number(v?.revision??v?.ownerRevision)).filter(v=>Number.isSafeInteger(v)&&v<current).sort((a,b)=>b-a);
  return earlier[0]??null;
}

const named=(value:unknown)=>typeof value==='string'?value:String((value as {nome?:unknown;name?:unknown;id?:unknown})?.nome??(value as any)?.name??(value as any)?.id??'');
export function forgeDetail(data:ForgeData,id:string|undefined,width:number):SegRow[]{
  const row=data.rows.find(value=>value.id===id);if(!row)return[];const d=data.details.get(row.id);
  const pair=(label:Parameters<typeof t>[0],value:string,roles=''):SegRow=>[S(t(label).padEnd(12),'faint'),S(value,roles)];
  const list=(values:readonly unknown[])=>values.map(named).filter(Boolean).join(', ')||t('panel.forge.nothing');
  const out:SegRow[]=[[S(row.title,'b')],...(d?.description?wrap(d.description,width).map(line=>[S(line,'dim')] as SegRow):[]),[S('')],
    pair('panel.forge.status',t(row.enabled?'panel.forge.on':'panel.forge.off'),row.enabled?'ok':'dim'),pair('panel.forge.riskLabel',row.risk),
    pair('panel.forge.uses',list(d?.capabilities??[])),pair('panel.forge.does',list(d?.actions??[]))];
  if(d?.scan)out.push(pair('panel.forge.scan',t(d.scan.ok?'panel.forge.scanPass':'panel.forge.scanBlocked'),d.scan.ok?'ok':'err'));
  if(d?.versions.length)out.push(pair('panel.forge.versions',d.versions.map(v=>String(v?.revision??v?.ownerRevision??'?')).join(', ')));
  if(!row.ownerManaged)out.push([S('')],...wrap(t('panel.forge.modelMade'),width).map(line=>[S(line,'faint')] as SegRow));
  return out;
}
