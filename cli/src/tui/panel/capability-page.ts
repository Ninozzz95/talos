/*
 * C8 of the redesign (the mockup's Capability, the PC's words): tools, skills and connectors in one page. Tools are those the last request sent to
 * the model really carried (the kernel keeps that request in memory), each with its schema estimated as the PC estimates it: UTF-8 bytes / 3.5,
 * rounded up (`richiesta-del-giro.mjs`), so the two give the same number. Connectors, plugins and hooks are the facades of the centers they replace,
 * with the same actions. Nothing here is offered that does not act: a tool's permission is not changed from this page.
 */
import type {HookView} from '../../services/hook-facade.ts';
import type {McpServerView} from '../../services/mcp-facade.ts';
import type {PluginView} from '../../services/plugin-facade.ts';
import {t,tn,type MessageId} from '../../i18n/index.ts';
import {S,wrap,type PanelItem,type SegRow} from './sheet.ts';

export type CapabilityTool={name:string;description:string;tokens:number;mcp:boolean};
export type CapabilitySkill={id:string;name:string;description:string|null;where:string};
export type CapabilityData={tools:readonly CapabilityTool[]|null;skills:readonly CapabilitySkill[];connectors:readonly McpServerView[];plugins:readonly PluginView[];hooks:readonly HookView[]};
export const CAPABILITY_TABS=['tools','skills','connectors','plugins','hooks'] as const;
export type CapabilityTab=(typeof CAPABILITY_TABS)[number];

/** The PC's estimate of a tool's schema, the same arithmetic (richiesta-del-giro.mjs `stima`). */
export const toolTokens=(tool:unknown)=>{try{return Math.ceil(Buffer.byteLength(JSON.stringify(tool),'utf8')/3.5);}catch{return 0;}};
export function capabilityTools(tools:readonly unknown[]):CapabilityTool[]{
  return tools.flatMap(tool=>{
    const value=tool as {name?:unknown;description?:unknown;function?:{name?:unknown;description?:unknown}};
    const name=typeof value?.function?.name==='string'?value.function.name:typeof value?.name==='string'?value.name:null;
    if(!name)return[];
    const description=typeof value.function?.description==='string'?value.function.description:typeof value.description==='string'?value.description:'';
    return[{name,description,tokens:toolTokens(tool),mcp:name.startsWith('mcp__')}];
  });
}
const firstLine=(text:string)=>text.split('\n').find(line=>line.trim())?.trim()??'';
const badge=(word:MessageId,roles:readonly string[])=>({badge:t(word),badgeRoles:[...roles,'band']});
const trustBadge=(trusted:boolean,quarantined=false)=>quarantined?badge('panel.capability.quarantined',['err']):trusted?badge('panel.capability.trusted',['ok']):badge('panel.capability.toTrust',['warn']);
const HEALTH:Record<string,MessageId>={'not-probed':'panel.capability.health.notProbed',healthy:'panel.capability.health.healthy',degraded:'panel.capability.health.degraded',failed:'panel.capability.health.failed'};

export function capabilityItems(data:CapabilityData,tab:CapabilityTab):PanelItem[]{
  if(tab==='tools')return(data.tools??[]).map(tool=>({id:tool.name,label:tool.name,meta:t('panel.capability.tokens',{tokens:tool.tokens}),desc:firstLine(tool.description),...(tool.mcp?badge('panel.capability.mcp',['dim']):{})}));
  if(tab==='skills')return data.skills.map(skill=>({id:skill.id,label:skill.name,desc:skill.description??'',meta:skill.where}));
  if(tab==='connectors')return data.connectors.map(row=>({id:row.id,label:row.id,desc:[t(HEALTH[row.health.state]??'panel.capability.health.notProbed'),row.health.latencyMs!==null?`${row.health.latencyMs} ms`:'',row.health.message??''].filter(Boolean).join(' · '),...trustBadge(row.trust.trusted)}));
  if(tab==='plugins')return data.plugins.map(row=>({id:row.id,label:row.name??row.id,desc:row.description??'',...trustBadge(row.trust.effectiveTrusted,row.quarantine.active)}));
  return data.hooks.map(row=>({id:row.id,label:row.id,desc:row.events.join(' · '),meta:row.launch.command,...trustBadge(row.trust.trusted,row.quarantine.active)}));
}

/** Over the Tools: how many and how heavy, said as an estimate; an empty list says why. */
export function capabilityToolsTop(data:CapabilityData,width:number):SegRow[]{
  if(!data.tools)return[];
  const total=data.tools.reduce((sum,tool)=>sum+tool.tokens,0);
  return[...wrap(` ${tn('panel.capability.toolsCount',data.tools.length,{tokens:total})}`,width).map(line=>[S(line,'faint')] as SegRow),[S('')]];
}

export function capabilityDetail(data:CapabilityData,tab:CapabilityTab,id:string|undefined,width:number):SegRow[]{
  const pair=(label:MessageId,value:string,roles=''):SegRow=>[S(t(label).padEnd(18),'faint'),S(value,roles)];
  const text=(value:string)=>wrap(value,width).map(line=>[S(line,'dim')] as SegRow);
  if(tab==='tools'){const tool=data.tools?.find(row=>row.name===id);if(!tool)return[];const total=data.tools!.reduce((sum,row)=>sum+row.tokens,0);
    return[[S(tool.name,'b')],...text(tool.description),[S('')],pair('panel.capability.offered',t('panel.capability.offeredYes'),'ok'),pair('panel.capability.schema',t('panel.capability.tokens',{tokens:tool.tokens})),pair('panel.capability.weight',`${Math.round(tool.tokens/(total||1)*100)}%`),[S('')],[S(t('panel.capability.permissionWhere'),'faint')]];}
  if(tab==='skills'){const skill=data.skills.find(row=>row.id===id);if(!skill)return[];return[[S(skill.name,'b')],...text(skill.description??''),[S('')],pair('panel.capability.where',skill.where)];}
  if(tab==='connectors'){const row=data.connectors.find(value=>value.id===id);if(!row)return[];
    return[[S(row.id,'b')],pair('panel.capability.health',t(HEALTH[row.health.state]??'panel.capability.health.notProbed')),...(row.health.message?text(row.health.message):[]),pair('panel.capability.server',row.server?`${row.server.name}${row.server.version?` ${row.server.version}`:''}`:t('panel.capability.notProbed')),
      pair('panel.capability.trust',t(row.trust.trusted?'panel.capability.trusted':'panel.capability.toTrust'),row.trust.trusted?'ok':'warn'),...(row.trust.changed?[[S(t('panel.capability.changed'),'warn')] as SegRow]:[]),
      pair('panel.capability.allowed',row.permission.effectiveTools.length?row.permission.effectiveTools.join(', '):t('panel.capability.noneMeasured'))];}
  if(tab==='plugins'){const row=data.plugins.find(value=>value.id===id);if(!row)return[];
    return[[S(row.name??row.id,'b')],...text(row.description??''),[S('')],pair('panel.capability.trust',t(row.trust.effectiveTrusted?'panel.capability.trusted':'panel.capability.toTrust'),row.trust.effectiveTrusted?'ok':'warn'),
      ...(row.quarantine.active?[pair('panel.capability.quarantine',row.quarantine.reason??t('panel.capability.quarantined'),'err')]:[]),...(row.guardError?text(row.guardError):[])];}
  const row=data.hooks.find(value=>value.id===id);if(!row)return[];
  const run=row.lastDryRun as {outcome?:unknown;decision?:unknown}|null;
  return[[S(row.id,'b')],pair('panel.capability.events',row.events.join(', ')),pair('panel.capability.command',row.launch.command),pair('panel.capability.trust',t(row.trust.trusted?'panel.capability.trusted':'panel.capability.toTrust'),row.trust.trusted?'ok':'warn'),
    ...(row.quarantine.active?[pair('panel.capability.quarantine',row.quarantine.reason??t('panel.capability.quarantined'),'err')]:[]),
    ...(run?[[S('')] as SegRow,pair('panel.capability.dryRun',String(run.decision??run.outcome??t('panel.capability.done')))]:[])];
}
