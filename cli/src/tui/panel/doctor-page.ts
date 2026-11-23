/*
 * C9 of the redesign: Doctor as a page. Two lines say whether a turn can run and how many checks pass; under them every check and every
 * section of `talos doctor --json` (the same data, the same verdict), each with what it found and, when it failed, what to do. r checks
 * again, x writes the JSON to a file. Nothing here probes a provider on the network: that stays behind `talos doctor --profile`.
 */
import {t,type MessageId} from '../../i18n/index.ts';
import {S,wrap,type PanelItem,type SegRow} from './sheet.ts';

export type DoctorReport={ok:boolean;ready?:boolean;status?:string;reasons?:readonly {code:string;message:string}[];checks:readonly {id:string;ok:boolean;detail?:string}[];
  sections?:Record<string,any>;version?:string;platform?:string};

const CHECK_WORDS:Record<string,MessageId>={'config-path':'panel.doctor.check.config','data-path':'panel.doctor.check.data','cache-path':'panel.doctor.check.cache',git:'panel.doctor.check.git',keyring:'panel.doctor.check.keyring',
  'talos-runtime':'panel.doctor.check.runtime',project:'panel.doctor.check.project',mcp:'panel.doctor.check.mcp',hooks:'panel.doctor.check.hooks'};
const FIX_WORDS:Record<string,MessageId>={'config-path':'panel.doctor.fix.folder','data-path':'panel.doctor.fix.folder','cache-path':'panel.doctor.fix.folder',git:'panel.doctor.fix.git',
  project:'panel.doctor.fix.project',mcp:'panel.doctor.fix.json',hooks:'panel.doctor.fix.json','talos-runtime':'panel.doctor.fix.reinstall'};
const SECTION_WORDS:Record<string,MessageId>={terminal:'panel.doctor.section.terminal',runtime:'panel.doctor.section.runtime',trust:'panel.doctor.section.trust',providers:'panel.doctor.section.providers',
  broker:'panel.doctor.section.broker',context:'panel.doctor.section.context',sessions:'panel.doctor.section.sessions',update:'panel.doctor.section.update',credentials:'panel.doctor.section.credentials',catalog:'panel.doctor.section.catalog'};
const GOOD=new Set(['healthy','verified','available','ready','ok']);const BAD=new Set(['unavailable','failed']);const WARN=new Set(['degraded']);
/* Frontend 01/11: a state that is not plainly good says what it means here, from what the probe really does (system-cli.ts doctorData) */
const SECTION_NOTES:Record<string,MessageId>={'update:degraded':'panel.doctor.note.updateDegraded','catalog:off':'panel.doctor.note.catalogOff','providers:unknown':'panel.doctor.note.providersUnknown','context:absent':'panel.doctor.note.contextAbsent'};

const checkName=(id:string)=>CHECK_WORDS[id]?t(CHECK_WORDS[id]!):id;
const sectionName=(id:string)=>SECTION_WORDS[id]?t(SECTION_WORDS[id]!):id;
const sectionRole=(state:string)=>GOOD.has(state)?'ok':BAD.has(state)?'err':WARN.has(state)?'warn':'dim';
/** What is to look at: what failed, and what works only in part. */
const toLook=(item:PanelItem)=>item.badgeRoles?.[0]==='err'||item.badgeRoles?.[0]==='warn';
/* the update section's technical rows (Frontend 01/11): in the JSON export, not on the page */
const TECHNICAL=/manifestSchema|checksum|signature/iu;

/** The two lines over the list: the verdict a person reads first, then how many checks pass and on what. */
export function doctorHead(report:DoctorReport|null,width:number):SegRow[]{
  if(!report)return[[S(` ${t('panel.doctor.noReport')}`,'err')]];
  const ready=report.ok&&report.ready===true;const passed=report.checks.filter(check=>check.ok).length;
  const first=report.reasons?.[0]?.message??(report.checks.find(check=>!check.ok)?t('panel.doctor.checkFailed',{check:checkName(report.checks.find(check=>!check.ok)!.id)}):null);
  /* Frontend 01/11: the cursor starts on what is not good, so the head says how many there are, even when a turn can run */
  const look=doctorItems(report).filter(toLook).length;
  return[...wrap(ready?t('panel.doctor.ready'):t('panel.doctor.attention',{reason:first??t('panel.doctor.unknown')}),width-2).map((line,index)=>[S(` ${index?' ':ready?'✓':'!'} `,ready?'ok':'warn'),S(line,index?'':'b')] as SegRow),
    [S(`   ${t('panel.doctor.summary',{passed,total:report.checks.length,version:report.version??'?',platform:report.platform??'?',look:look?t('panel.doctor.toLook',{count:look}):''})}`,'faint')],[S('')]];
}

export function doctorItems(report:DoctorReport|null):PanelItem[]{
  if(!report)return[];
  const checks:PanelItem[]=report.checks.map(check=>({id:`check:${check.id}`,group:t('panel.doctor.group.checks'),label:checkName(check.id),desc:check.detail??'',
    badge:t(check.ok?'panel.doctor.ok':'panel.doctor.failed'),badgeRoles:[check.ok?'ok':'err','band']}));
  const sections:PanelItem[]=Object.entries(report.sections??{}).map(([id,section])=>{const state=String(section?.state??'unknown');
    return{id:`section:${id}`,group:t('panel.doctor.group.sections'),label:sectionName(id),desc:typeof section?.detail==='string'?section.detail:'',badge:state,badgeRoles:[sectionRole(state),'band']};});
  return[...checks,...sections];
}

const flatValues=(value:unknown,prefix='',out:[string,string][]=[]):[string,string][]=>{
  if(value===null||typeof value!=='object'){out.push([prefix,String(value)]);return out;}
  for(const [key,inner] of Object.entries(value as Record<string,unknown>)){if(key==='state'||key==='detail')continue;const name=prefix?`${prefix}.${key}`:key;
    if(inner&&typeof inner==='object'&&!Array.isArray(inner))flatValues(inner,name,out);else out.push([name,Array.isArray(inner)?`${inner.length}`:String(inner)]);}
  return out;
};
export function doctorDetail(report:DoctorReport|null,id:string|undefined,width:number):SegRow[]{
  if(!report||!id)return[];
  if(id.startsWith('check:')){const check=report.checks.find(row=>`check:${row.id}`===id);if(!check)return[];
    const out:SegRow[]=[[S(checkName(check.id),'b')],[S(check.ok?t('panel.doctor.ok'):t('panel.doctor.failed'),check.ok?'ok':'err')]];
    if(check.detail)out.push([S('')],...wrap(check.detail,width).map(line=>[S(line,'dim')] as SegRow));
    if(!check.ok)out.push([S('')],[S(t('panel.doctor.whatToDo'),'faint')],...wrap(t(FIX_WORDS[check.id]??'panel.doctor.fix.none'),width).map(line=>[S(line)] as SegRow));
    return out;}
  const name=id.slice('section:'.length);const section=report.sections?.[name];if(section===undefined)return[];const state=String(section?.state??'unknown');
  const rows=flatValues(section).filter(([key])=>name!=='update'||!TECHNICAL.test(key)).slice(0,40);
  const note=SECTION_NOTES[`${name}:${state}`];
  return[[S(sectionName(name),'b')],[S(state,sectionRole(state))],...(note?wrap(t(note),width).map(line=>[S(line)] as SegRow):[]),...(typeof section?.detail==='string'?wrap(section.detail,width).map(line=>[S(line,'dim')] as SegRow):[]),[S('')],
    ...rows.map(([key,value])=>[S(key.padEnd(Math.min(24,Math.max(...rows.map(([k])=>k.length))+2)),'faint'),S(value.length>width-26?value.slice(0,Math.max(8,width-27))+'…':value)] as SegRow)];
}
