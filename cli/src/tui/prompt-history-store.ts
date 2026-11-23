/*
 * R5b D5 (owner decision Q-R5-15): the prompts a person sends, kept across sessions. One file per project under the data
 * root (`<dataRoot>/history/<projectId>.jsonl`, never in the project), the last 1,000 (Hermes, the Node REPL); each line
 * `{v:1,text,collapsedPastes,at}`, the newest last. Before a prompt reaches the disk its secret-shaped values and the
 * environment's secret values are masked (diagnostics/redact.ts, the same masks as the logs), piece by piece so a collapsed
 * paste still covers its own text afterwards. `ui.history.persist: false` turns it off: nothing is read and nothing is
 * written. Before R5b the history lived in memory only (R4 E17).
 *
 * Writes: one `appendFile` per prompt of one short line (a prompt over 64 KiB stays in memory only: long interleaved appends
 * are how a jsonl file breaks, 2026-09-04), and a rewrite to the last 1,000 through a temporary file and a rename once the
 * file passes 1,200 lines. A line that does not parse is skipped, never fatal.
 */
import {randomUUID} from 'node:crypto';
import {appendFile,chmod,mkdir,readFile,rename,rm,writeFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {loadEffectiveConfig} from '../config/load.ts';
import {createRedactor} from '../diagnostics/redact.ts';
import {projectId,type CliPaths} from '../paths.ts';
import type {CollapsedPaste,EditorDraft} from './editor.ts';

export const PROMPT_HISTORY_LIMIT=1000;
const PRUNE_AT=1200;
const MAX_RECORD_CHARS=64*1024;

export type PromptHistoryStore={readonly file:string;load():Promise<EditorDraft[]>;append(draft:EditorDraft):Promise<void>};
type Redactor={text(input:string):string};

export function promptHistoryFile(paths:CliPaths,projectRoot:string):string{return join(paths.dataRoot,'history',`${projectId(projectRoot)}.jsonl`);}

/** The draft with its secrets masked; each paste block is masked on its own and its offsets follow the new text. */
export function maskDraft(draft:EditorDraft,redactor:Redactor):EditorDraft{
  const pastes=[...draft.collapsedPastes].sort((a,b)=>a.start-b.start);let text='',cursor=0;const kept:CollapsedPaste[]=[];
  for(const paste of pastes){
    if(paste.start<cursor||paste.end>draft.text.length||paste.end<=paste.start)continue;
    text+=redactor.text(draft.text.slice(cursor,paste.start));
    const inner=redactor.text(draft.text.slice(paste.start,paste.end)),start=text.length;
    text+=inner;kept.push({start,end:text.length,chars:inner.length,lines:paste.lines});cursor=paste.end;
  }
  text+=redactor.text(draft.text.slice(cursor));
  return{text,collapsedPastes:kept};
}

function parseLine(line:string):EditorDraft|null{
  try{
    const row=JSON.parse(line);if(row?.v!==1||typeof row.text!=='string')return null;
    const pastes=Array.isArray(row.collapsedPastes)?row.collapsedPastes.filter((p:any)=>[p?.start,p?.end,p?.chars,p?.lines].every(Number.isSafeInteger)&&p.start>=0&&p.end<=row.text.length&&p.start<p.end):[];
    return{text:row.text,collapsedPastes:pastes.map((p:any)=>({start:p.start,end:p.end,chars:p.chars,lines:p.lines})),...(typeof row.at==='string'&&Number.isFinite(Date.parse(row.at))?{at:row.at}:{})};
  }catch{return null;}
}

export function createPromptHistoryStore({paths,projectRoot,secrets}:{paths:CliPaths;projectRoot:string;secrets:Iterable<string>}):PromptHistoryStore{
  const file=promptHistoryFile(paths,projectRoot);const redactor=createRedactor(secrets);let lines:number|null=null;
  const readRows=async()=>{try{return (await readFile(file,'utf8')).split('\n').filter(Boolean);}catch(error:any){if(error?.code==='ENOENT')return[];throw error;}};
  const newestFirst=(raw:readonly string[])=>{
    const seen=new Set<string>(),rows:EditorDraft[]=[];
    for(let index=raw.length-1;index>=0&&rows.length<PROMPT_HISTORY_LIMIT;index-=1){const row=parseLine(raw[index]!);if(!row||seen.has(row.text))continue;seen.add(row.text);rows.push(row);}
    return rows;
  };
  return{
    file,
    async load(){const raw=await readRows();lines=raw.length;return newestFirst(raw);},
    async append(draft){
      if(!draft.text.trim()||draft.text.length>MAX_RECORD_CHARS)return;
      const masked=maskDraft(draft,redactor);
      await mkdir(dirname(file),{recursive:true,mode:0o700});
      await appendFile(file,`${JSON.stringify({v:1,text:masked.text,collapsedPastes:masked.collapsedPastes,at:new Date().toISOString()})}\n`,{encoding:'utf8',mode:0o600});
      if(lines===null)lines=(await readRows()).length;else lines+=1;
      if(lines>PRUNE_AT){
        /* stage 7.4: a row keeps the time it was sent (the compaction stamped every row «now») */
        const kept=newestFirst(await readRows()).reverse().map(row=>JSON.stringify({v:1,text:row.text,collapsedPastes:row.collapsedPastes,at:row.at??new Date().toISOString()}));
        const temp=`${file}.${process.pid}.${randomUUID()}.tmp`;
        try{await writeFile(temp,kept.map(line=>line+'\n').join(''),{encoding:'utf8',mode:0o600});await rename(temp,file);}
        catch(error){await rm(temp,{force:true}).catch(()=>{});throw error;}
        try{await chmod(file,0o600);}catch{/* Windows */}
        lines=kept.length;
      }
    },
  };
}

/** On unless `ui.history.persist` is false; a configuration that cannot be read keeps it off (nothing written by doubt). */
export async function promptHistoryEnabled({paths,projectRoot}:{paths:CliPaths;projectRoot:string}):Promise<boolean>{
  try{return (await loadEffectiveConfig({paths,projectRoot})).value.ui?.history?.persist!==false;}catch{return false;}
}
