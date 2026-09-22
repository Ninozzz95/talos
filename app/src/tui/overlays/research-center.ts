import type {ResearchDetail,ResearchSnapshot} from '../../services/research-facade.ts';

export type ResearchCenterModel={snapshot:ResearchSnapshot;selected:number;detail:ResearchDetail|null};
const UNSAFE=/[\\\x00-\x1f\x7f-\x9f\u2028\u2029\p{Bidi_Control}\p{Default_Ignorable_Code_Point}]/gu;
function inert(value:unknown,max=360){const safe=String(value??'').replace(UNSAFE,ch=>{if(ch==='\\')return'\\\\';const cp=ch.codePointAt(0)??0;return cp<=0xffff?'\\u'+cp.toString(16).padStart(4,'0'):'\\u{'+cp.toString(16)+'}';});return safe.length>max?safe.slice(0,max-1)+'…':safe;}
function clamp(value:number,count:number){return count?Math.max(0,Math.min(count-1,value)):0;}
export function createResearchCenterModel(snapshot:ResearchSnapshot,selected=0):ResearchCenterModel{return{snapshot,selected:clamp(selected,snapshot.rows.length),detail:null};}
export function moveResearchCenterSelection(model:ResearchCenterModel,delta:number):ResearchCenterModel{return{...model,selected:clamp(model.selected+delta,model.snapshot.rows.length),detail:null};}
export function selectedResearch(model:ResearchCenterModel){return model.snapshot.rows[model.selected]??null;}
export function setResearchCenterDetail(model:ResearchCenterModel,detail:ResearchDetail|null):ResearchCenterModel{return{...model,detail};}
export function renderResearchCenterLines(model:ResearchCenterModel):string[]{
  const lines=['Research Center'];
  if(model.snapshot.state==='invalid'){lines.push('Store: invalid · '+inert(model.snapshot.error?.code??'RESEARCH_STORE_INVALID')+' · '+inert(model.snapshot.error?.message??'unavailable'));lines.push('Esc/q close · u refresh');return lines;}
  if(!model.snapshot.rows.length){lines.push('(no research)');lines.push('Esc/q close · u refresh');return lines;}
  lines.push(...model.snapshot.rows.map((row,index)=>(index===model.selected?'› ':'  ')+inert(row.status)+' · '+inert(row.question??row.name??'untitled')+' · '+inert(row.id)));
  const row=selectedResearch(model),detail=model.detail?.id===row?.id?model.detail:null;
  if(row){
    lines.push('ID: '+inert(row.id)+' · status '+inert(row.status));
    if(detail){
      lines.push('Phase: '+inert(detail.phase??'unavailable')+' · progress '+(detail.progress?detail.progress.done+'/'+detail.progress.total:'unmeasured'));
      lines.push('Journal: '+(detail.journal?detail.journal.events+' events · skipped '+detail.journal.skippedRows:'unavailable'));
      if(detail.verification)lines.push('Verification: total '+detail.verification.total+' · yes '+detail.verification.supported+' · partial '+detail.verification.partial+' · no '+detail.verification.unsupported+' · unchecked '+detail.verification.unchecked+' · contested '+detail.verification.contested);
      else lines.push('Verification: unmeasured');
      if(detail.summary)lines.push('Summary: '+inert(detail.summary));
      if(detail.claims?.length){
        lines.push('Claims / evidence:');
        for(const claim of detail.claims){
          lines.push('- Claim '+claim.number+' ['+inert(claim.verification??'unmeasured')+']: '+inert(claim.text));
          lines.push('  Source: '+(claim.source?claim.source.number+' · '+inert(claim.source.title)+' · '+inert(claim.source.url):'unavailable'));
          lines.push('  Passage: '+inert(claim.passage||'unavailable'));
          if(claim.reason)lines.push('  Reason: '+inert(claim.reason));
        }
      }else lines.push('Claims / evidence: unmeasured');
    }else lines.push('Detail: loading/unavailable');
  }
  lines.push('↑/↓ select · p pause · r resume · c cancel · e export Markdown · u refresh · Esc/q close');
  return lines;
}
