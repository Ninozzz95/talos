/*
 * R5b D1 (owner decision Q-R5-12): `/export [md|json|jsonl] [file]` in the TUI. Markdown by default (the readable form of
 * sessions/export-format.ts: the person's messages, TALOS's answers, tools in English); JSON and JSONL are the kernel's own
 * rows. With no file, `talos-session-<first 8 of the id>-<YYYYMMDD-HHMM>.<ext>` in the project folder; a relative file is
 * taken from the project folder. Secrets are redacted in every format.
 */
import {mkdir,writeFile} from 'node:fs/promises';
import {dirname,isAbsolute,join,resolve} from 'node:path';
import {createRedactor} from '../diagnostics/redact.ts';
import {exportMarkdown} from '../sessions/export-format.ts';

export type ExportFormat='md'|'json'|'jsonl';
const FORMATS:readonly ExportFormat[]=['md','json','jsonl'];

/** `/export` arguments: a format word and/or a file, in any order; `format:null` for a word that is not a format or file. */
export function parseExportArgs(args:readonly string[]):{format:ExportFormat|null;file:string|null}{
  let format:ExportFormat|null=null,file:string|null=null;
  for(const arg of args){
    const word=arg.toLowerCase();
    if((FORMATS as readonly string[]).includes(word)&&format===null){format=word as ExportFormat;continue;}
    if(/[\\/.]/u.test(arg)&&file===null){file=arg;continue;}
    return{format:null,file:null};
  }
  if(format===null&&file){const ext=/\.(md|json|jsonl)$/iu.exec(file)?.[1]?.toLowerCase() as ExportFormat|undefined;format=ext??'md';}
  return{format:format??'md',file};
}

const pad=(n:number)=>String(n).padStart(2,'0');
function defaultName(sessionId:string,format:ExportFormat,now:Date){
  const stamp=`${now.getUTCFullYear()}${pad(now.getUTCMonth()+1)}${pad(now.getUTCDate())}-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}`;
  return `talos-session-${sessionId.slice(0,8)}-${stamp}.${format}`;
}

/* Stage 7.7 (mockup /export): the body of an export with the person's choices — what each tool returned and TALOS's thinking
   only when asked, in every format; without tool output a result keeps its place but not its content. Keys never written. */
export function exportBody(payload:any,{format,toolOutput,thinking,secrets}:{format:ExportFormat;toolOutput:boolean;thinking:boolean;secrets:readonly string[]}):string{
  if(format==='md')return exportMarkdown(payload,{secrets,toolOutput,thinking});
  const redactor=createRedactor(secrets);
  const events=(Array.isArray(payload?.eventi)?payload.eventi as any[]:[])
    .filter(event=>thinking||!/^Reasoning/u.test(String(event?.type??'')))
    .map(event=>{if(toolOutput||event?.type!=='ToolCallResult')return event;const {content:_content,...kept}=event;return kept;});
  if(format==='json')return `${JSON.stringify(redactor.value({...payload,eventi:events}),null,2)}\n`;
  return events.map(event=>JSON.stringify(redactor.value(event))).join('\n')+(events.length?'\n':'');
}
/* Stage 7.7: the sheet's file name, as the mockup writes it: `talos-<the conversation's name>-<date>.<format>` */
export function exportFileName(title:string,sessionId:string,format:ExportFormat,now=new Date()):string{
  /* «Ünïcode» → «unicode»: the accents go, the letters stay */
  const words=title.toLowerCase().normalize('NFKD').replace(/\p{M}+/gu,'').replace(/[^a-z0-9]+/gu,'-').replace(/^-+|-+$/gu,'');
  let slug='';for(const word of words.split('-')){if(!word)continue;const next=slug?`${slug}-${word}`:word;if(next.length>40)break;slug=next;}
  const date=`${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
  return `talos-${slug||`session-${sessionId.slice(0,8)}`}-${date}.${format}`;
}
/* Stage 7.7: save (or hand back for the clipboard) the conversation as the sheet chose; the size for the notice. */
export async function exportChosen({payload,projectRoot,choice,secrets}:{payload:any;projectRoot:string;choice:{to:'file'|'clipboard';format:ExportFormat;toolOutput:boolean;thinking:boolean;file:string};secrets:readonly string[]}):Promise<{body:string;path:string|null;bytes:number}>{
  if(!payload)throw Object.assign(new Error('SESSION_NOT_FOUND'),{code:'SESSION_NOT_FOUND'});
  const body=exportBody(payload,{format:choice.format,toolOutput:choice.toolOutput,thinking:choice.thinking,secrets});
  const bytes=Buffer.byteLength(body,'utf8');
  if(choice.to==='clipboard')return{body,path:null,bytes};
  const target=isAbsolute(choice.file)?choice.file:resolve(projectRoot,choice.file);
  await mkdir(dirname(target),{recursive:true});await writeFile(target,body,'utf8');
  return{body,path:target,bytes};
}
export async function exportSession({runtime,sessionId,projectRoot,args,now=new Date(),secrets}:{runtime:{export:(id:string)=>unknown};sessionId:string|null;projectRoot:string;args:readonly string[];now?:Date;secrets:readonly string[]}):Promise<{path:string;format:ExportFormat}>{
  const {format,file}=parseExportArgs(args);
  if(!format)throw Object.assign(new Error('EXPORT_USAGE'),{code:'EXPORT_USAGE'});
  const payload=sessionId?runtime.export(sessionId) as any:null;
  if(!sessionId||!payload)throw Object.assign(new Error('SESSION_NOT_FOUND'),{code:'SESSION_NOT_FOUND'});
  /* with arguments it stays as it was: Markdown readable without tool output or thinking, JSON and JSONL lossless */
  const body=exportBody(payload,{format,toolOutput:format!=='md',thinking:format!=='md',secrets});
  const target=file?(isAbsolute(file)?file:resolve(projectRoot,file)):join(projectRoot,defaultName(sessionId,format,now));
  await mkdir(dirname(target),{recursive:true});
  await writeFile(target,body,'utf8');
  return{path:target,format};
}
