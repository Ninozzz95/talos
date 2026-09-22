import type {ForgeSnapshot} from '../../services/forge-facade.ts';
export type ForgeCenterModel={snapshot:ForgeSnapshot;selected:number;detail:any|null};
const UNSAFE=/[\\\x00-\x1f\x7f-\x9f\u2028\u2029\p{Bidi_Control}\p{Default_Ignorable_Code_Point}]/gu;
function inert(value:unknown){return String(value??'').replace(UNSAFE,ch=>{if(ch==='\\')return'\\\\';const cp=ch.codePointAt(0)??0;return cp<=0xffff?'\\u'+cp.toString(16).padStart(4,'0'):'\\u{'+cp.toString(16)+'}';});}
function clip(value:unknown,max=700){const text=inert(value);return text.length<=max?text:text.slice(0,max-1)+'…';}
function clamp(n:number,count:number){return count?Math.max(0,Math.min(count-1,n)):0;}
export function createForgeCenterModel(snapshot:ForgeSnapshot,selected=0):ForgeCenterModel{return{snapshot,selected:clamp(selected,snapshot.rows.length),detail:null};}
export function moveForgeCenterSelection(model:ForgeCenterModel,delta:number):ForgeCenterModel{return{...model,selected:clamp(model.selected+delta,model.snapshot.rows.length),detail:null};}
export function selectedForgeTool(model:ForgeCenterModel){return model.snapshot.rows[model.selected]??null;}
export function setForgeCenterDetail(model:ForgeCenterModel,detail:any|null):ForgeCenterModel{return{...model,detail};}
export function renderForgeCenterLines(model:ForgeCenterModel):string[]{
  const lines=['Forge Center'];if(model.snapshot.state==='invalid'){lines.push('Store: invalid · '+clip(model.snapshot.error?.message));return lines;}
  if(!model.snapshot.rows.length){lines.push('(no forged tools)');lines.push('Esc/q close · r refresh');return lines;}
  lines.push(...model.snapshot.rows.map((row,index)=>(index===model.selected?'› ':'  ')+clip(row.title)+' · '+clip(row.id)+' · '+(row.enabled?'enabled':'disabled')+' · '+(row.ownerRevision===null?'legacy':'revision '+row.ownerRevision)));
  const row=selectedForgeTool(model),detail=model.detail?.id===row?.id?model.detail:null;
  if(row){
    lines.push('ID: '+clip(row.id)+' · '+(row.enabled?'enabled':'disabled')+' · '+(row.ownerRevision===null?'legacy/model-created':'revision '+row.ownerRevision)+' · risk '+clip(row.risk));
    if(detail){
      const scan=detail.scan??detail.evidence?.scan;if(scan){lines.push('Scan: '+(scan.ok?'pass':'BLOCKED')+' · capabilities '+(scan.capabilities?.length?scan.capabilities.map((value:any)=>clip(value)).join(', '):'none')+' · actions '+(scan.actions?.length?scan.actions.map((value:any)=>clip(value)).join(', '):'none'));}
      if(detail.evidence){lines.push('Evidence: '+clip(detail.evidence.packageDigest??'unavailable')+' · sideEffects '+String(detail.evidence.sideEffects===true)+' · sandbox '+clip(detail.evidence.sandbox?.kind??'unavailable'));}
      if(Array.isArray(detail.versions)&&detail.versions.length)lines.push('Versions: '+detail.versions.map((v:any)=>'revision '+String(v.revision??v.ownerRevision??'?')).join(', '));
    }
  }
  lines.push('↑/↓ select · e enable/disable · b rollback previous revision · r refresh · Esc/q close');
  return lines.map(line=>line.length<=799?line:line.slice(0,798)+'…');
}
