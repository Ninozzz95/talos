/*
 * Stage 7.22 (mockup memory «TALOS.md · line 4 · learned Sep 27 · you · Sep 20»; owner 03/10: Project = the project's
 * instruction files line by line and the memories of kind fact, procedure or rule; You = the preferences): the rows of
 * /memory. A file's line is each item of a list in it — its first sentence above, the rest under it, and where it is; a
 * memory says who wrote it and when. The files come first, as the kernel reads them first.
 */
import {t} from '../i18n/index.ts';
import type {MemoryView} from '../services/memory-facade.ts';
import type {MemoryRow} from './panel/commands.ts';
import {panelDay} from './panel/when.ts';

export type InstructionFile={label:string;path:string;content:string};
const plain=(text:string)=>text.replace(/\*\*([^*]+)\*\*/gu,'$1').replace(/`([^`]+)`/gu,'$1').trim();
/** The first sentence, and the rest. */
function split(text:string):[string,string]{
  const at=text.search(/[.!?](\s|$)/u);
  if(at<0)return[text,''];
  return[text.slice(0,at).trim(),text.slice(at+1).trim()];
}
export function fileRows(files:readonly InstructionFile[]):MemoryRow[]{
  const rows:MemoryRow[]=[];
  for(const file of files){
    let inCode=false;
    file.content.split('\n').forEach((raw,i)=>{
      if(raw.trimStart().startsWith('```')){inCode=!inCode;return;}
      const item=inCode?null:/^[-*] +(.+)$/u.exec(raw);if(!item)return;
      const [label,desc]=split(plain(item[1]!));if(!label)return;
      rows.push({id:`file:${file.label}:${i+1}`,label,desc,meta:t('panel.memory.line',{file:file.label,line:i+1}),file:{path:file.path,line:i+1}});
    });
  }
  return rows;
}
export function memoryRows(memories:readonly MemoryView[],{now=Date.now(),offsetMinutes}:{now?:number;offsetMinutes?:number}={}):{project:MemoryRow[];you:MemoryRow[]}{
  const day=(at:string|null)=>panelDay(at,{now,...(offsetMinutes!==undefined?{offsetMinutes}:{})});
  const project:MemoryRow[]=[],you:MemoryRow[]=[];
  for(const memory of memories){
    const when=day(memory.updatedAt??memory.createdAt);
    const meta=memory.provenance.writer==='modello'?t('panel.memory.learned',{day:when}):t('panel.memory.yours',{day:when});
    const row={id:memory.id,label:memory.title,meta,desc:memory.content===memory.title?'':memory.content};
    (memory.kind==='preference'?you:project).push(row);
  }
  return{project,you};
}
