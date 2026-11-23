/*
 * C9 of the redesign: Research as a page, the center of today with the same acts. The runs with their state and progress, filters by state;
 * the detail says the phase, the progress, how the claims stood up and the summary; the Evidence tab lists the claims of the chosen run with
 * their verdict, source and passage. Everything is the research store's (research-facade.ts); a run whose detail was not read says so.
 */
import type {ResearchDetail,ResearchListRow,ResearchVerification} from '../../services/research-facade.ts';
import {t,type MessageId} from '../../i18n/index.ts';
import {S,wrap,type PanelItem,type SegRow} from './sheet.ts';

export type ResearchData={state:'ready'|'invalid';rows:readonly ResearchListRow[];error:{code:string;message:string}|null;details:ReadonlyMap<string,ResearchDetail>};
export const RESEARCH_FILTERS=['all','running','paused','done','stopped'] as const;
export type ResearchFilter=(typeof RESEARCH_FILTERS)[number];

const STOPPED=new Set(['cancelled','failed','bloccata-dal-permesso','giri-esauriti','senza-rapporto']);
/** Which filter a run's state stands under: the kernel's words, grouped. */
export function researchGroup(status:string):Exclude<ResearchFilter,'all'>{return status==='done'?'done':status==='paused'?'paused':STOPPED.has(status)?'stopped':'running';}
const STATUS_WORDS:Record<string,MessageId>={planning:'panel.research.state.planning',collecting:'panel.research.state.collecting',paused:'panel.research.state.paused',done:'panel.research.state.done',
  cancelled:'panel.research.state.cancelled',failed:'panel.research.state.failed','bloccata-dal-permesso':'panel.research.state.blocked','giri-esauriti':'panel.research.state.outOfTurns','senza-rapporto':'panel.research.state.noReport'};
export const researchStateWords=(status:string)=>STATUS_WORDS[status]?t(STATUS_WORDS[status]!):status;
const ROLES:Record<Exclude<ResearchFilter,'all'>,string>={running:'acc',paused:'warn',done:'ok',stopped:'err'};

export function researchItems(data:ResearchData):PanelItem[]{
  return data.rows.map(row=>{const detail=data.details.get(row.id);const group=researchGroup(row.status);
    const progress=detail?.progress&&detail.progress.total>0?` · ${detail.progress.done}/${detail.progress.total}`:'';
    return{id:row.id,label:row.question??row.name??row.id,desc:`${researchStateWords(row.status)}${progress}${row.startedAt?` · ${row.startedAt.slice(0,16).replace('T',' ')}`:''}`,
      badge:t(`panel.research.group.${group}` as MessageId),badgeRoles:[ROLES[group],'band']};});
}
export const researchMatch=(filter:ResearchFilter)=>(row:ResearchListRow|undefined)=>filter==='all'||Boolean(row&&researchGroup(row.status)===filter);

const bar=(done:number,total:number,width:number)=>{const n=Math.max(0,Math.min(width,Math.round(done/(total||1)*width)));return'█'.repeat(n)+'░'.repeat(width-n);};
export function researchDetail(data:ResearchData,id:string|undefined,width:number):SegRow[]{
  const row=data.rows.find(value=>value.id===id);if(!row)return[];const d=data.details.get(row.id);
  const pair=(label:MessageId,value:string,roles=''):SegRow=>[S(t(label).padEnd(12),'faint'),S(value,roles)];
  const out:SegRow[]=[...wrap(row.question??row.name??row.id,width).map(line=>[S(line,'b')] as SegRow),[S('')],pair('panel.research.stateLabel',researchStateWords(row.status),ROLES[researchGroup(row.status)])];
  if(!d)return[...out,[S('')],[S(t('panel.research.notRead'),'faint')]];
  if(d.progress&&d.progress.total>0)out.push(pair('panel.research.progress',`${bar(d.progress.done,d.progress.total,Math.max(6,Math.min(20,width-20)))} ${d.progress.done}/${d.progress.total}`));
  if(d.verification){const v=d.verification;
    out.push([S(t('panel.research.claims').padEnd(12),'faint'),S(t('panel.research.supported',{count:v.supported}),'ok'),S(' · '),S(t('panel.research.partial',{count:v.partial}),'warn'),S(' · '),S(t('panel.research.unsupported',{count:v.unsupported}),'err'),
      ...(v.contested?[S(' · '),S(t('panel.research.contested',{count:v.contested}),'warn')]:[]),...(v.unchecked?[S(' · '),S(t('panel.research.unchecked',{count:v.unchecked}),'dim')]:[])]);}
  if(d.sources)out.push(pair('panel.research.sources',String(d.sources.length)));
  if(d.summary)out.push([S('')],...wrap(d.summary,width).map(line=>[S(line)] as SegRow));
  if(d.claims?.length)out.push([S('')],[S(t('panel.research.evidenceHint'),'faint')]);
  return out;
}

const VERDICT:Record<ResearchVerification,[MessageId,string]>={yes:['panel.research.verdict.yes','ok'],partial:['panel.research.verdict.partial','warn'],no:['panel.research.verdict.no','err'],
  contested:['panel.research.verdict.contested','warn'],unchecked:['panel.research.verdict.unchecked','dim']};
/** The Evidence tab: the claims of one run, each with its verdict as a badge. */
export function evidenceItems(detail:ResearchDetail|undefined):PanelItem[]{
  return(detail?.claims??[]).map(claim=>{const [word,role]=VERDICT[claim.verification??'unchecked'];
    return{id:String(claim.number),label:claim.text,desc:claim.source?`[${claim.source.number}] ${claim.source.title||claim.source.url}`:t('panel.research.noSource'),badge:t(word),badgeRoles:[role,'band']};});
}
export function evidenceDetail(detail:ResearchDetail|undefined,number:string|undefined,width:number):SegRow[]{
  const claim=detail?.claims?.find(value=>String(value.number)===number);if(!claim)return[];
  const out:SegRow[]=[...wrap(claim.text,width).map(line=>[S(line,'b')] as SegRow),[S('')]];
  if(claim.source)out.push([S(`[${claim.source.number}] `,'faint'),S(claim.source.title||claim.source.url)],...(claim.source.title?[[S(claim.source.url,'dim')] as SegRow]:[]));
  if(claim.passage)out.push([S('')],[S(t('panel.research.passage'),'faint')],...wrap(`“${claim.passage}”`,width).map(line=>[S(line,'dim')] as SegRow));
  if(claim.reason)out.push([S('')],[S(t('panel.research.reason'),'faint')],...wrap(claim.reason,width).map(line=>[S(line)] as SegRow));
  return out;
}
