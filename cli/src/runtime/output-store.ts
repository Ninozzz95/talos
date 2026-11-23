/*
 * R5a lane R, S6 — owner decision Q-R5-10 (2026-09-24), gate E6: a long command output is never cut in silence.
 *
 * The CLI holds the whole output before it is cut (brokered-executor.ts), so it keeps it: a private file under the data root
 * (`<dataRoot>/tool-output/<sessionId>/<time>-<id>.txt`), never under the project; folder 0o700 and file 0o600 (on Windows the
 * data root is inside the person's profile, whose ACL already admits only its owner; the mode bits are what POSIX reads),
 * written once (`wx`), redacted with the existing secret patterns (`diagnostics/redact.ts`: the environment's secret values,
 * `KEY=value` assignments, vendor-prefixed tokens, Bearer credentials), and deleted with its session: `deleteSessionToolOutput`
 * for `talos session delete`, `pruneToolOutput` at start for a session whose record is gone.
 *
 * What the model reads is the same cut as before (a quarter kept from the head, three quarters from the tail, 4,000
 * characters: the kernel's `uscitaUtile`, talosHarness.mjs:1489-1506) with an ENGLISH marker in place of the kernel's Italian
 * `… [tolti N caratteri dal mezzo] …`: how much was cut, how much is shown, and the file that holds the rest (Pi, Claude
 * Code, Gemini and OpenCode name the full-output file; gate §8). The marker is model-facing text, not a screen word: it stays
 * English whatever the screen language, and the screen reads its numbers through `parseToolOutputMarker`.
 */
import {randomUUID} from 'node:crypto';
import {existsSync} from 'node:fs';
import {chmod,mkdir,readdir,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createRedactor} from '../diagnostics/redact.ts';

/** The kernel's own cut for a command's output: 4,000 characters, a quarter from the head (talosHarness.mjs:1489). */
export const TOOL_OUTPUT_LIMIT=4_000;
export const TOOL_OUTPUT_HEAD_SHARE=0.25;
/** A file keeps at most this many characters; beyond it the file says where it stopped. */
export const TOOL_OUTPUT_FILE_MAX=8_000_000;
const FOLDER='tool-output';
const SESSION_ID=/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
/**
 * The kernel's cut marker, whole (talosHarness.mjs `uscitaUtile`); pinned against the kernel source by r5a-r-output-store.test.ts.
 * G02: the unified kernel writes it in English (lane R `13fc05c60`, was `… [tolti N caratteri dal mezzo] …`) and puts it on
 * every tool result it cuts: a command's output at 4,000 characters, any other result at 8,000 (half head, half tail).
 * 0.6.13 (22/10/2026): the CLI runs the desktop adapter (80a0d077e), which always installs context hooks, so the 8,000 cut of any
 * other result (talosHarness.mjs `uscitaUtile(…, 8_000, 0.5)`, taken only without hooks) never runs: such a result arrives whole and
 * is shortened only under pressure, with the adapter's own marker (compattazione-desktop.mjs `accorciaTesto`, `MARCATORE_ACCORCIATO`:
 * «[… N characters trimmed by TALOS; the full text is kept in session history …]», neutral words since decision 245), not this one.
 * A tool's own 4,000 cut (a command's output) still writes this marker.
 * It differs from this module's own marker by what follows the count: `]` there, `;` here.
 */
export const KERNEL_CUT_MARKER=/\n\n… \[TALOS cut (?<removed>\d+) characters from the middle of this output\] …\n\n/u;
const MARKER=/… \[TALOS cut (?<removed>\d+) characters from the middle of this output; (?<kept>\d+) of (?<total>\d+) characters are shown\.(?: The full output is saved in "(?<path>[^"\r\n]+)"; read that file for the rest\.| The full output could not be saved\.)\] …/u;

export type SavedToolOutput={path:string};
export type ToolOutputStore={
  /** Keeps `text` for the session; `null` when it could not be written (the marker then says so). Never throws. */
  save(input:{sessionId:string;text:string}):Promise<SavedToolOutput|null>;
};

function validSessionId(sessionId:unknown):sessionId is string{return typeof sessionId==='string'&&SESSION_ID.test(sessionId)&&!sessionId.includes('..');}
export function toolOutputRoot(dataRoot:string){return join(dataRoot,FOLDER);}

export function createToolOutputStore({dataRoot,secretValues=[],now=()=>Date.now(),newId=()=>randomUUID()}:{dataRoot:string;secretValues?:readonly string[];now?:()=>number;newId?:()=>string}):ToolOutputStore{
  const redactor=createRedactor(secretValues);
  return{
    async save({sessionId,text}){
      if(!validSessionId(sessionId))return null;
      try{
        const folder=join(toolOutputRoot(dataRoot),sessionId);
        await mkdir(folder,{recursive:true,mode:0o700});
        const body=text.length>TOOL_OUTPUT_FILE_MAX?`${text.slice(0,TOOL_OUTPUT_FILE_MAX)}\n[TALOS stopped keeping this output after ${TOOL_OUTPUT_FILE_MAX} characters.]\n`:text;
        const file=join(folder,`${now()}-${newId().replace(/[^A-Za-z0-9-]/gu,'').slice(0,12)}.txt`);
        await writeFile(file,redactor.text(body),{encoding:'utf8',mode:0o600,flag:'wx'});
        try{await chmod(file,0o600);}catch{/* Windows: the profile's ACL is the boundary */}
        return{path:file};
      }catch{return null;}
    },
  };
}

/** Removes the one folder of one session's kept outputs (named, validated; never a pattern). */
export async function deleteSessionToolOutput(dataRoot:string,sessionId:string):Promise<boolean>{
  if(!validSessionId(sessionId))return false;
  const folder=join(toolOutputRoot(dataRoot),sessionId);
  if(!existsSync(folder))return false;
  await rm(folder,{recursive:true,force:true,maxRetries:3,retryDelay:50});
  return true;
}

/**
 * At start: the folders of sessions whose record no longer exists (`<sessionsRoot>/<id>.jsonl`, session-store.mjs:53-56) are
 * removed, one named folder at a time after that check. Returns the ids removed. Never throws.
 */
export async function pruneToolOutput({dataRoot,sessionsRoot}:{dataRoot:string;sessionsRoot:string}):Promise<string[]>{
  const removed:string[]=[];
  let entries:import('node:fs').Dirent[]=[];
  try{entries=await readdir(toolOutputRoot(dataRoot),{withFileTypes:true});}catch{return removed;}
  for(const entry of entries){
    if(!entry.isDirectory()||!validSessionId(entry.name))continue;
    if(existsSync(join(sessionsRoot,`${entry.name}.jsonl`)))continue;
    try{if(await deleteSessionToolOutput(dataRoot,entry.name))removed.push(entry.name);}catch{/* the next start tries again */}
  }
  return removed;
}

function markerText(removed:number,kept:number,total:number,saved:SavedToolOutput|null){
  const where=saved?` The full output is saved in "${saved.path}"; read that file for the rest.`:' The full output could not be saved.';
  return `… [TALOS cut ${removed} characters from the middle of this output; ${kept} of ${total} characters are shown.${where}] …`;
}

/** The kernel's head/tail cut with the English marker. The text is returned unchanged when it fits. */
export function cutToolOutput(full:string,saved:SavedToolOutput|null,{limit=TOOL_OUTPUT_LIMIT,headShare=TOOL_OUTPUT_HEAD_SHARE}:{limit?:number;headShare?:number}={}):string{
  if(full.length<=limit)return full;
  const head=Math.max(0,Math.round(limit*headShare));const tail=limit-head;
  return `${full.slice(0,head)}\n\n${markerText(full.length-limit,limit,full.length,saved)}\n\n${full.slice(full.length-tail)}`;
}

/** The kernel's own cut (fallback executor): its marker replaced by this module's, which names the file; the kept text untouched. */
export function replaceKernelCutMarker(text:string,saved:SavedToolOutput|null,{limit=TOOL_OUTPUT_LIMIT}:{limit?:number}={}):string{
  const match=KERNEL_CUT_MARKER.exec(text);if(!match)return text;
  const removed=Number(match.groups!.removed);
  return text.replace(KERNEL_CUT_MARKER,()=>`\n\n${markerText(removed,limit,limit+removed,saved)}\n\n`);
}
export function hasKernelCutMarker(text:string){return KERNEL_CUT_MARKER.test(text);}

/**
 * A tool result the kernel cut (Q-R5-11: the model is told in English, the row states it as a fact). G02: the unified kernel
 * cuts from the MIDDLE with `KERNEL_CUT_MARKER` (`uscitaUtile(esito, 8_000, 0.5)` when no context hooks prepare the turn: since
 * 0.6.13 never in the CLI, whose desktop adapter always installs them, so a `leggi` result no longer carries it; read still for
 * sessions saved before), and the R5a end marker with line counts (`toolResultCutMarker`)
 * is gone. What is known: the characters kept (the limit),
 * the characters removed, and the lines the model saw (both cut edges count as lines); the file's line total is not said.
 */
/** The header of a paged `leggi` result: `[TALOS read lines 1-2000 of 3000 in "x"; …]`; pinned against the kernel source. */
export const LEGGI_HEADER=/^\[TALOS read lines (?<from>\d+)-(?<to>\d+) of (?<total>\d+) in "[^"\n]*"; [^\n]*\]\n/u;
/*
 * 0.6.13 gate (25/10/2026, acceptance s21/s22 R5A-READCUT, first red at 80a0d077e): a `leggi` page reaches the model whole since the
 * CLI runs the desktop adapter, so its first line is the only place that says how many of the file's lines the model got. The
 * file lines of the page (its range), and the file's total (null when the kernel did not count it, a file over 64 MiB); null when
 * the result is not a paged read. Review 17 R17-2 of 0.6.13: the header is also found after the kernel's notices (below).
 */
export function readPageOf(text:string):{shownLines:number;totalLines:number|null}|null{
  const value=String(text??'');
  const header=READ_PAGE_HEADER.exec(value.slice(readNoticesLength(value)));if(!header)return null;
  const from=Number(header.groups!.from),to=Number(header.groups!.to);
  return{shownLines:Math.max(0,to-from+1),totalLines:header.groups!.total===undefined?null:Number(header.groups!.total)};
}
/*
 * review 17 R17-2 of 0.6.13: the kernel's notices that come BEFORE a read's own header (talosHarness.mjs esitoDellaLettura): one
 * `[TALOS extracted text …]`, `[TALOS could not extract …]`, `[TALOS decoded …]` or `[TALOS could not decode …]` line, then for an
 * extracted document the coverage warning (estrai-documento.mjs avvisoDiCopertura: a first line and at most 21 gap lines indented by
 * two spaces, the last one closing the bracket) and for a decoded one the replaced characters' line. Only these shapes, in this
 * order, at the very start: a header quoted further down is the file's text, never the kernel's page.
 */
const READ_NOTICE=/^\[TALOS (?:extracted text: |could not extract the text of |decoded |could not decode )[^\n]*\]\n/u;
/* review 18 R18-1 of 0.6.13 (0.6.14): the gap lines are the indented lines that do NOT close the bracket, then the one that does; a
   greedy run of indented lines ran into a document whose text starts indented, and the whole warning was dropped («1,503 lines») */
const READ_NOTICE_AFTER=/^(?:\[EXTRACTION COVERAGE WARNING: [^\n]*\n(?: {2}(?:[^\n]*[^\]\n])?\n){0,20} {2}[^\n]*\]\n|\[\d+ character\(s\) are not valid [^\n]*\]\n)/u;
/* review 17 R17-4(b) of 0.6.13: LEGGI_HEADER, also with the total of a file over 64 MiB, which the kernel does not count */
const READ_PAGE_HEADER=/^\[TALOS read lines (?<from>\d+)-(?<to>\d+) of (?:(?<total>\d+)|an uncounted total \(file larger than 64 MiB\)) in "[^"\n]*"; [^\n]*\]\n/u;
/* a byte page: part of one line (talosHarness.mjs esitoDellaLetturaDiTesto, `modo === 'byte'`) */
const READ_BYTES_HEADER=/^\[TALOS read bytes \[\d+, \d+\) inside (?:line \d+|an uncounted line \(beyond 64 MiB\)) of "[^"\n]*"[^\n]*\]\n/u;
function readNoticesLength(text:string){
  const notice=READ_NOTICE.exec(text);if(!notice)return 0;
  const after=READ_NOTICE_AFTER.exec(text.slice(notice[0].length));
  /* a coverage warning ends on the line that closes its bracket; one that does not is not the kernel's */
  return notice[0].length+(after&&after[0].endsWith(']\n')?after[0].length:0);
}
/**
 * review 17 R17-2 and R17-4(b) of 0.6.13: the characters at the start of a read result that are TALOS's and not the file's — the
 * kernel's notices and the read's own header (a line page, also of an uncounted total, or a byte page); 0 when there are none.
 */
export function readHeadLength(text:string):number{
  const value=String(text??''),notices=readNoticesLength(value),rest=value.slice(notices);
  const header=READ_PAGE_HEADER.exec(rest)??READ_BYTES_HEADER.exec(rest);
  return notices+(header?header[0].length:0);
}
export function parseToolResultCut(text:string):{limitChars:number;shownChars:number;totalChars:number;shownLines:number;totalLines:number|null}|null{
  const value=String(text??'');const match=KERNEL_CUT_MARKER.exec(value);if(!match)return null;
  const head=value.slice(0,match.index),tail=value.slice(match.index+match[0].length);
  const removed=Number(match.groups!.removed),kept=head.length+tail.length;
  /* head and tail apart: the marker separates the two cut edges, so the model sees them as two lines, not one */
  const lines=(part:string)=>part===''?0:part.split('\n').length-(part.endsWith('\n')?1:0);
  /* `leggi`'s own first line (talosHarness.mjs esitoDellaLettura, D1) names the file's line total; it is not a file line */
  const header=LEGGI_HEADER.exec(head);
  /* Kernel merge (F-027): the body sits inside the data boundary, and the cut keeps its opening line at the start of the head and its
     closing line at the end of the tail. They are TALOS scaffolding, not lines of the file: the characters are counted as the model
     received them (the frame took part of the 8,000), the lines are the file's only. */
  const headBody=head.replace(/^(\[TALOS[^\n]*\]\n)?<<<TALOS_DATA id=[0-9a-f]{12}[^\n]*>>>\n/u,'$1');
  const tailBody=tail.replace(/\n<<<END_TALOS_DATA id=[0-9a-f]{12}>>>$/u,'');
  return{limitChars:kept,shownChars:kept,totalChars:kept+removed,shownLines:lines(headBody)+lines(tailBody)-(header?1:0),totalLines:header?Number(header.groups!.total):null};
}

/** The marker's facts, for the screen (`tool.output.saved`); `path` is null when the output could not be saved. */
export function parseToolOutputMarker(text:string):{removedChars:number;keptChars:number;totalChars:number;path:string|null}|null{
  const match=MARKER.exec(String(text??''));if(!match)return null;
  const g=match.groups!;
  return{removedChars:Number(g.removed),keptChars:Number(g.kept),totalChars:Number(g.total),path:g.path??null};
}
