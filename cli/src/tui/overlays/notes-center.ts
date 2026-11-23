import {en,t,type MessageId} from '../../i18n/index.ts';
import type {NotesSnapshot,NoteView} from '../../services/notes-facade.ts';
import {centerTones,listOverlay,type OverlayContent} from './scroll-window.ts';

export type NotesCenterModel={snapshot:NotesSnapshot;selected:number};
const UNSAFE=/[\\\x00-\x1f\x7f-\x9f\u2028\u2029\p{Bidi_Control}\p{Default_Ignorable_Code_Point}]/gu;
function inert(value:unknown){return String(value??'').replace(UNSAFE,ch=>{if(ch==='\\')return'\\\\';const cp=ch.codePointAt(0)??0;return cp<=0xffff?'\\u'+cp.toString(16).padStart(4,'0'):'\\u{'+cp.toString(16)+'}';});}
/* R2 (gate §1.5, E4): the kernel's `origine` value (modello|persona) is mapped by value, never printed raw. */
function writerLabel(value:unknown){const id=`screen.writer.${String(value)}`;return Object.hasOwn(en,id)?t(id as MessageId):inert(value);}
/* R2 (gate §1.5, E4): the kernel's note `formato` value (testo|markdown) is mapped by value, never printed raw. */
function formatLabel(value:unknown){const id=`screen.noteFormat.${String(value)}`;return Object.hasOwn(en,id)?t(id as MessageId):inert(value);}
function clamp(value:number,count:number){return count?Math.max(0,Math.min(count-1,value)):0;}
export function createNotesCenterModel(snapshot:NotesSnapshot,selected=0):NotesCenterModel{return{snapshot,selected:clamp(selected,snapshot.rows.length)};}
export function moveNotesCenterSelection(model:NotesCenterModel,delta:number):NotesCenterModel{return{...model,selected:clamp(model.selected+delta,model.snapshot.rows.length)};}
export function selectedNote(model:NotesCenterModel):NoteView|null{return model.snapshot.rows[model.selected]??null;}
export function renderNotesCenterLines(model:NotesCenterModel):string[]{
  const lines=[t('screen.notes.title')];
  if(model.snapshot.state==='invalid'){lines.push('Store: invalid · '+inert(model.snapshot.error?.code??'NOTES_STORE_INVALID')+' · '+inert(model.snapshot.error?.message??'unavailable'));lines.push(t('screen.center.closeRefresh'));return lines;}
  if(!model.snapshot.rows.length){lines.push(t('screen.notes.empty'));lines.push(t('screen.center.closeRefresh'));return lines;}
  lines.push(...model.snapshot.rows.map((row,index)=>(index===model.selected?'› ':'  ')+inert(row.id)+' · '+inert(row.title)+' · '+formatLabel(row.format)));
  const row=selectedNote(model);
  if(row){
    lines.push('ID: '+inert(row.id));
    lines.push('Format: '+formatLabel(row.format)+' ('+inert(row.formatEvidence)+')');
    lines.push('Writer: '+writerLabel(row.writer)+' ('+inert(row.writerEvidence)+')');
    lines.push('Created: '+inert(row.createdAt??'unavailable')+' · Updated: '+inert(row.updatedAt??'unavailable'));
    lines.push('Content: '+inert(row.content));
    if(row.relations.length){
      lines.push('Links:');
      for(const relation of row.relations)lines.push('- '+inert(relation.target.kind)+':'+inert(relation.target.id)+' · '+inert(relation.state)+(relation.label?' · '+inert(relation.label):''));
    }else lines.push('Links: none');
  }
  lines.push(t('screen.notes.keys'));
  lines.push(t('screen.notes.linkHelp'));
  lines.push(t('screen.notes.unlinkHelp'));
  return lines;
}
// R1 Q-R1-3: the same lines as a capped, scrolling overlay — the list keeps the selection visible, the detail scrolls.
// The /notes link|unlink reference lines follow the key hint: they scroll with the detail, the hint stays.
export function notesCenterOverlay(model:NotesCenterModel):OverlayContent{
  const lines=renderNotesCenterLines(model),list=model.snapshot.state==='invalid'?0:model.snapshot.rows.length;
  const reference=list?2:0,hint=lines.length-1-reference;
  return listOverlay([...lines.slice(0,hint),...lines.slice(hint+1),lines[hint]!],{head:1,list,selected:model.selected,foot:1,tones:centerTones});
}
