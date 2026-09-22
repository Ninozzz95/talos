import type {LibraryDuplicateScan,LibraryPreview,LibrarySnapshot,LibraryView} from '../../services/library-facade.ts';

export type LibraryCenterModel={snapshot:LibrarySnapshot;selected:number;preview:LibraryPreview|null;duplicateScan:LibraryDuplicateScan|null};
const UNSAFE=/[\\\x00-\x1f\x7f-\x9f\u2028\u2029\p{Bidi_Control}\p{Default_Ignorable_Code_Point}]/gu;
function inert(value:unknown){return String(value??'').replace(UNSAFE,ch=>{if(ch==='\\')return'\\\\';const cp=ch.codePointAt(0)??0;return cp<=0xffff?'\\u'+cp.toString(16).padStart(4,'0'):'\\u{'+cp.toString(16)+'}';});}
function clamp(value:number,count:number){return count?Math.max(0,Math.min(count-1,value)):0;}
export function createLibraryCenterModel(snapshot:LibrarySnapshot,selected=0):LibraryCenterModel{return{snapshot,selected:clamp(selected,snapshot.rows.length),preview:null,duplicateScan:null};}
export function moveLibraryCenterSelection(model:LibraryCenterModel,delta:number):LibraryCenterModel{return{...model,selected:clamp(model.selected+delta,model.snapshot.rows.length),preview:null,duplicateScan:null};}
export function selectedLibraryEntry(model:LibraryCenterModel):LibraryView|null{return model.snapshot.rows[model.selected]??null;}
export function setLibraryCenterPreview(model:LibraryCenterModel,preview:LibraryPreview|null):LibraryCenterModel{return{...model,preview};}
export function setLibraryCenterDuplicateScan(model:LibraryCenterModel,duplicateScan:LibraryDuplicateScan|null):LibraryCenterModel{return{...model,duplicateScan};}
export function renderLibraryCenterLines(model:LibraryCenterModel):string[]{
  const lines=['Library Center'];
  if(model.snapshot.state==='invalid'){lines.push('Store: invalid · '+inert(model.snapshot.error?.code??'LIBRARY_STORE_INVALID')+' · '+inert(model.snapshot.error?.message??'unavailable'));lines.push('Esc/q close · r refresh');return lines;}
  if(!model.snapshot.rows.length){lines.push('(no Library entries)');lines.push('Esc/q close · r refresh');return lines;}
  lines.push(...model.snapshot.rows.map((row,index)=>(index===model.selected?'› ':'  ')+inert(row.name)+' · '+inert(row.mediaType)+' · '+inert(row.id)));
  const row=selectedLibraryEntry(model);
  if(row){
    lines.push('ID: '+inert(row.id)+' · '+inert(row.fileType)+' · origin '+inert(row.origin));
    lines.push('Creator: '+inert(row.creator.type)+(row.creator.model?' · '+inert(row.creator.model):'')+(row.creator.provider?' · '+inert(row.creator.provider):''));
    lines.push('Session: '+(row.session?inert(row.session.id)+(row.session.name?' · '+inert(row.session.name):''):'unavailable'));
    lines.push('Context policy: explicit visible reference · auto-attach no · auto-submit no · '+inert(row.context.persistence));
    lines.push('Context token: '+inert(row.context.token??'unavailable'));
    if(model.preview?.id===row.id){
      const preview=model.preview;
      lines.push('Preview: '+inert(preview.mode)+' · '+inert(preview.mediaType)+' · '+preview.size+' bytes'+(preview.reason?' · '+inert(preview.reason):''));
      if(preview.text!==null)lines.push('Preview text: '+inert(preview.text)+(preview.truncated?' …[truncated]':''));
    }
    if(model.duplicateScan?.id===row.id){
      const scan=model.duplicateScan;
      lines.push('Duplicates: '+inert(scan.state)+' · sha256 '+inert(scan.sha256??'unavailable')+' · verified unique '+(scan.verifiedUnique?'yes':'no'));
      lines.push('Exact duplicate IDs: '+(scan.duplicateIds.length?scan.duplicateIds.map(inert).join(', '):'none'));
      if(scan.unreadableIds.length)lines.push('Not compared: '+scan.unreadableIds.map(inert).join(', '));
    }
  }
  lines.push('↑/↓ select · p preview · u exact duplicates · a attach · d detach · r refresh · Esc/q close');
  return lines;
}
