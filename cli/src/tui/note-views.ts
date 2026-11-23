/*
 * Stage 7.20 (mockup notes; owner 03/10: the mockup's sheet in front, what the notes have more beside it): the project's notes
 * as the /notes sheet shows them. The right column is the day the note last changed («today» or the date); the line under the
 * title is the mockup's — «4 items» for a note that is a list, otherwise its first words, «empty» when it has none — and each
 * link says what it points at (a link whose target is gone keeps its id).
 */
import {t} from '../i18n/index.ts';
import type {NoteView} from '../services/notes-facade.ts';
import type {NoteRow} from './panel/commands.ts';
import {panelDay} from './panel/when.ts';

const plain=(line:string)=>line.replace(/\*\*([^*]+)\*\*/gu,'$1').replace(/`([^`]+)`/gu,'$1').trim();
function summary(markdown:string):string{
  const lines=markdown.split('\n').map(line=>line.trim()).filter(line=>line&&!line.startsWith('```'));
  const body=lines.filter(line=>!/^#{1,6} /u.test(line));
  if(!body.length)return t('panel.notes.emptyNote');
  if(body.every(line=>/^[-*] /u.test(line)))return t(body.length===1?'panel.notes.items.one':'panel.notes.items.other',{count:body.length});
  const first=plain(body[0]!.replace(/^[-*] /u,''));
  return first.split(/(?<=[.!?])\s/u)[0]!.replace(/[.!?]$/u,'');
}
export function noteViews(rows:readonly NoteView[],{now=Date.now(),offsetMinutes}:{now?:number;offsetMinutes?:number}={}):NoteRow[]{
  return rows.map(row=>({
    id:row.id,title:row.title,markdown:row.content,
    meta:panelDay(row.updatedAt??row.createdAt,{now,...(offsetMinutes!==undefined?{offsetMinutes}:{})}),
    desc:summary(row.content),
    links:row.relations.map(link=>t(`panel.notes.link.${link.target.kind}`,{label:link.state==='available'&&link.label?link.label:link.target.id})),
  }));
}
