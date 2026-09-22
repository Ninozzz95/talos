import type {NotesSnapshot,NoteView} from '../../services/notes-facade.ts';

export type NotesCenterModel={snapshot:NotesSnapshot;selected:number};
const UNSAFE=/[\\\x00-\x1f\x7f-\x9f\u2028\u2029\p{Bidi_Control}\p{Default_Ignorable_Code_Point}]/gu;
function inert(value:unknown){return String(value??'').replace(UNSAFE,ch=>{if(ch==='\\')return'\\\\';const cp=ch.codePointAt(0)??0;return cp<=0xffff?'\\u'+cp.toString(16).padStart(4,'0'):'\\u{'+cp.toString(16)+'}';});}
function clamp(value:number,count:number){return count?Math.max(0,Math.min(count-1,value)):0;}
export function createNotesCenterModel(snapshot:NotesSnapshot,selected=0):NotesCenterModel{return{snapshot,selected:clamp(selected,snapshot.rows.length)};}
export function moveNotesCenterSelection(model:NotesCenterModel,delta:number):NotesCenterModel{return{...model,selected:clamp(model.selected+delta,model.snapshot.rows.length)};}
export function selectedNote(model:NotesCenterModel):NoteView|null{return model.snapshot.rows[model.selected]??null;}
export function renderNotesCenterLines(model:NotesCenterModel):string[]{
  const lines=['Notes Center'];
  if(model.snapshot.state==='invalid'){lines.push('Store: invalid · '+inert(model.snapshot.error?.code??'NOTES_STORE_INVALID')+' · '+inert(model.snapshot.error?.message??'unavailable'));lines.push('Esc/q close · r refresh');return lines;}
  if(!model.snapshot.rows.length){lines.push('(no notes)');lines.push('Esc/q close · r refresh');return lines;}
  lines.push(...model.snapshot.rows.map((row,index)=>(index===model.selected?'› ':'  ')+inert(row.id)+' · '+inert(row.title)+' · '+inert(row.format)));
  const row=selectedNote(model);
  if(row){
    lines.push('ID: '+inert(row.id));
    lines.push('Format: '+inert(row.format)+' ('+inert(row.formatEvidence)+')');
    lines.push('Writer: '+inert(row.writer)+' ('+inert(row.writerEvidence)+')');
    lines.push('Created: '+inert(row.createdAt??'unavailable')+' · Updated: '+inert(row.updatedAt??'unavailable'));
    lines.push('Content: '+inert(row.content));
    if(row.relations.length){
      lines.push('Links:');
      for(const relation of row.relations)lines.push('- '+inert(relation.target.kind)+':'+inert(relation.target.id)+' · '+inert(relation.state)+(relation.label?' · '+inert(relation.label):''));
    }else lines.push('Links: none');
  }
  lines.push('↑/↓ select · c attach to composer · r refresh · Esc/q close');
  lines.push('Link: /notes link <note-id> <session|task|research> <target-id>');
  lines.push('Unlink: /notes unlink <note-id> <session|task|research> <target-id>');
  return lines;
}
