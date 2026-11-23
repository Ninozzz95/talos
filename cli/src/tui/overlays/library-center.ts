import {en,t,type MessageId} from '../../i18n/index.ts';
import type {LibraryDuplicateScan,LibraryPreview,LibrarySnapshot,LibraryView} from '../../services/library-facade.ts';
import {centerTones,listOverlay,type OverlayContent} from './scroll-window.ts';

export type LibraryCenterModel={snapshot:LibrarySnapshot;selected:number;preview:LibraryPreview|null;duplicateScan:LibraryDuplicateScan|null};
const UNSAFE=/[\\\x00-\x1f\x7f-\x9f\u2028\u2029\p{Bidi_Control}\p{Default_Ignorable_Code_Point}]/gu;
function inert(value:unknown){return String(value??'').replace(UNSAFE,ch=>{if(ch==='\\')return'\\\\';const cp=ch.codePointAt(0)??0;return cp<=0xffff?'\\u'+cp.toString(16).padStart(4,'0'):'\\u{'+cp.toString(16)+'}';});}
/* R2 (gate §1.5, E4): the kernel's `origine` value (modello|persona) is mapped by value, never printed raw. */
function writerLabel(value:unknown){const id=`screen.writer.${String(value)}`;return Object.hasOwn(en,id)?t(id as MessageId):inert(value);}
function clamp(value:number,count:number){return count?Math.max(0,Math.min(count-1,value)):0;}
export function createLibraryCenterModel(snapshot:LibrarySnapshot,selected=0):LibraryCenterModel{return{snapshot,selected:clamp(selected,snapshot.rows.length),preview:null,duplicateScan:null};}
export function moveLibraryCenterSelection(model:LibraryCenterModel,delta:number):LibraryCenterModel{return{...model,selected:clamp(model.selected+delta,model.snapshot.rows.length),preview:null,duplicateScan:null};}
export function selectedLibraryEntry(model:LibraryCenterModel):LibraryView|null{return model.snapshot.rows[model.selected]??null;}
export function setLibraryCenterPreview(model:LibraryCenterModel,preview:LibraryPreview|null):LibraryCenterModel{return{...model,preview};}
export function setLibraryCenterDuplicateScan(model:LibraryCenterModel,duplicateScan:LibraryDuplicateScan|null):LibraryCenterModel{return{...model,duplicateScan};}
export function renderLibraryCenterLines(model:LibraryCenterModel):string[]{
  const lines=[t('screen.library.title')];
  if(model.snapshot.state==='invalid'){lines.push('Store: invalid · '+inert(model.snapshot.error?.code??'LIBRARY_STORE_INVALID')+' · '+inert(model.snapshot.error?.message??'unavailable'));lines.push(t('screen.center.closeRefresh'));return lines;}
  if(!model.snapshot.rows.length){lines.push(t('screen.library.empty'));lines.push(t('screen.center.closeRefresh'));return lines;}
  lines.push(...model.snapshot.rows.map((row,index)=>(index===model.selected?'› ':'  ')+inert(row.name)+' · '+inert(row.mediaType)+' · '+inert(row.id)));
  const row=selectedLibraryEntry(model);
  if(row){
    lines.push('ID: '+inert(row.id)+' · '+inert(row.fileType)+' · origin '+inert(row.origin));
    lines.push('Creator: '+writerLabel(row.creator.type)+(row.creator.model?' · '+inert(row.creator.model):'')+(row.creator.provider?' · '+inert(row.creator.provider):''));
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
  lines.push(t('screen.library.keys'));
  return lines;
}
// R1 Q-R1-3: the same lines as a capped, scrolling overlay — the list keeps the selection visible, the detail scrolls.
export function libraryCenterOverlay(model:LibraryCenterModel):OverlayContent{
  const list=model.snapshot.state==='invalid'?0:model.snapshot.rows.length;
  return listOverlay(renderLibraryCenterLines(model),{head:1,list,selected:model.selected,foot:1,tones:centerTones});
}
