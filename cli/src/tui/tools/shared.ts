import {t,tn,type MessageId} from '../../i18n/index.ts';
import {truncateDisplay} from '../text-width.ts';
import {argumentLabel,toolDisplay} from '../tool-display.ts';
import type {ToolRowModel} from './registry.ts';
import {ADAPTER_POWERSHELL_ZERO_WARNING,ADAPTER_SHELL_NOTICE} from '../../runtime/kernel-shell-headers.ts';
import {maskArgumentText,maskToolArguments} from './argument-masks.ts';

/*
 * What reaches a terminal from a tool (its arguments, its output, a file's lines) is data: control characters, line and
 * paragraph separators and bidi controls are shown escaped, never interpreted. The one implementation; transcript-model.ts
 * re-exports it as `sanitizeTranscriptText` (kept here so the tool rows need no import of the transcript model).
 */
const UNSAFE_DISPLAY=/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f\u2028\u2029\p{Bidi_Control}]/gu;
export function visibleEscape(character:string){const code=character.codePointAt(0)!;return code>0xffff?'\\u{'+code.toString(16)+'}':'\\u'+code.toString(16).padStart(4,'0');}
export function sanitizeDisplayText(value:string):string{return String(value).replace(/\r\n?/gu,'\n').replace(UNSAFE_DISPLAY,visibleEscape);}

/*
 * R2 lane T (review D-07): arguments arrive as JSON text, streamed. A JSON object that is still arriving is repaired for
 * display by closing its open string and braces; if that fails nothing is shown — partial JSON never reaches the screen.
 * Text that is not JSON at all is a value, and stays one (`raw`).
 */
/* Twin repair of 0.2.2, round 7: what this returns is what every renderer draws, so it is MASKED here, the preview while the arguments
   stream as well as the final row (argument-masks.ts: the card's masks, kernel + E11). */
/* Twin repair of 0.2.2, round 8 (reviewer 3 after round 7, RED 1; owner 14/11 23:49, judge v1917-v1920): closing the OPEN string showed
   half of a secret known by its FORM (the kernel's forms want the whole token: 34 of 40 characters of a GitHub token live at 80×24, the
   password of an address whole). A value still open now reads «…» until its closing quote arrives, then it passes the masks as before;
   a name still open goes away, and so does a name whose value has not started («"path":») and a comma at the end, so the values before
   them stay on the row (round 8 mutants: without this the whole preview went blank while a name arrived). One pass, linear: the page's
   `chiudiJsonParziale` (carta-dal-testo.js) reads it the same way, and the braces still open are closed from the same pass.
   Codex shows no half arguments at all (codex-rs/codex-api/src/sse/responses.rs:542, the argument deltas are not handled). */
const OPEN_VALUE='…';
const SPACE=/\s/u;
/** The arguments text with a value still open replaced by «…», a name still open or with no value removed, and the braces closed. */
function withoutOpenValue(text:string):string{
  const stack:string[]=[];let inString=false,escape=false,isName=false,start=-1,last='',closedStart=-1,closedEnd=-1;
  for(let i=0;i<text.length;i++){
    const c=text[i]!;
    if(inString){if(escape)escape=false;else if(c==='\\')escape=true;else if(c==='"'){inString=false;closedStart=start;closedEnd=i;last=c;}continue;}
    if(c==='"'){inString=true;start=i;isName=stack.at(-1)==='{'&&(last==='{'||last===',');}
    else if(c==='{'||c==='[')stack.push(c);
    else if(c==='}'||c===']')stack.pop();
    if(!SPACE.test(c))last=c;
  }
  let out:string;
  if(inString&&isName)out=text.slice(0,start);
  else if(inString)out=`${text.slice(0,start)}"${OPEN_VALUE}"`;
  else{
    out=text.trimEnd();
    if(out.endsWith(':')){let j=out.length-2;while(j>=0&&SPACE.test(out[j]!))j-=1;if(j===closedEnd)out=out.slice(0,closedStart);}
  }
  out=out.trimEnd();
  if(out.endsWith(','))out=out.slice(0,-1);
  return out+stack.reverse().map(p=>p==='{'?'}':']').join('');
}
export function parseArgs(row:ToolRowModel):Record<string,any>{
  const text=String(row.argsText||'').trim();
  if(!text)return{};
  if(text.startsWith('['))return{raw:maskArgumentText(withoutOpenValue(text))};// a list at the top is a value: never its open piece
  if(!text.startsWith('{'))return{raw:maskArgumentText(row.argsText)};
  const shown=withoutOpenValue(text);
  /* the braces are closed by the same pass (round 8): the old list of closers had nothing left to close */
  try{const value=JSON.parse(shown);if(value&&typeof value==='object'&&!Array.isArray(value))return maskToolArguments(value);}catch{}
  return{};
}
export function outputText(row:ToolRowModel){return row.finalOutput||row.liveOutput||'';}
export function detailWidth(width:number){return Math.max(16,Math.min(240,width-4));}
export function boundedLines(text:string,width:number,maxLines=8){const cap=detailWidth(width);const rows=String(text).split(/\r?\n/u).slice(0,maxLines).map(line=>truncateDisplay(sanitizeDisplayText(line),cap));if(String(text).split(/\r?\n/u).length>maxLines)rows.push('…');return rows.filter(Boolean);}
/** The English label of a row's tool (tool-display.ts), whatever renderer draws it. */
export function labelFor(row:ToolRowModel):string{return toolDisplay(row.name).label;}
export function textSize(text:string){return{bytes:Buffer.byteLength(text,'utf8'),lines:text?text.split(/\r?\n/u).length:0};}
/** Lines of a text as a person counts them: a final line break does not start a new line. */
export function lineCount(text:string){const value=String(text);if(value==='')return 0;const n=value.split('\n').length;return value.endsWith('\n')?n-1:n;}

/*
 * R3 gate E3: a command's result content starts with the kernel's own line `exit <n> [sandbox: <enforcement>]` (the model's
 * shell, talosHarness.mjs:8662; a `!` command, agent-service.mjs:2166) or `exit <n>` (`prova`, talosHarness.mjs:8554/8564).
 * The row states the exit code and the isolation from structured facts, so that exact first line is hidden on screen; the
 * model's content is untouched (it stays in `outcome.content`). The templates are pinned by r3-rd-tool-rows.test.ts.
 */
const KERNEL_EXIT_LINE=/^exit (?:-?\d+|null|undefined)(?: \[sandbox: [^\n]*\])?$/u;
/*
 * 0.6.13, release review S2-2 (22/10/2026): the desktop adapter in front of the kernel opens every EXECUTED shell result with its
 * own line for the model, `SHELL_COMBINED_NOTICE`, and a PowerShell command that exited 0 with an error diagnostic with a second
 * one before it, `POWERSHELL_ZERO_WARNING` (talosHarness.desktop-hotfix.mjs:55-57, added at :231-232 to the `tool-esito` this CLI
 * renders, and peeled off the same way by its `shellExecutionBase`, :182-186). The exit line was then the second line, so both
 * showed, and a failed row showed the headers instead of the error. Strings copied from the adapter, not guessed; pinned by
 * test/tui/shell-adapter-notice-row.test.ts with the adapter's own output. They are hidden only in the adapter's exact order and
 * only in front of the kernel's exit line: a line the command itself prints stays (data).
 * Research. Competitors: Codex sends the model `Exit code: … / Wall time: … / Output:` (core/src/tools/mod.rs:90-113) but its TUI
 * draws `aggregated_output` and the exit code from fields (tui/src/exec_cell/model.rs:23-24, render.rs:118-175); Gemini CLI builds
 * `llmContent` with `Output:/Error:/Exit Code:` and shows `returnDisplay`, the bare output (packages/core/src/tools/shell.ts:900-958);
 * opencode returns the output and appends its notices as separate parts, the exit code in metadata (core/src/tool/plugin/shell.ts:
 * 79-91); Hermes merges stderr into stdout (tools/environments/local.py:1071) and shows the human sentence instead of the
 * model-facing text, the exit code from its field (agent/display.py:1010-1023); Claude Code keeps stdout, stderr and `interrupted`
 * as fields (sdk-tools.d.ts:3240-3252). Docs: MCP 2025-06-18 tools (content annotations `audience: ["assistant"]` vs `["user"]`,
 * `isError` as a field); Gemini CLI docs/tools/mcp-server.md:789-791 (`llmContent` for the model, `returnDisplay` for the person)
 * and docs/tools/shell.md:41-46 (the exit code is its own return value). Best practices: model framing and person rendering are
 * two outputs of one result (all of the above); state the outcome from structured facts, never by parsing text; clig.dev
 * «the more irrelevant output you produce, the longer it's going to take the user to figure out what they did wrong», and «put
 * the most important information at the end» (the tail the shell row keeps).
 */
function withoutAdapterHeaders(value:string){let rest=value.startsWith(ADAPTER_POWERSHELL_ZERO_WARNING+'\n')?value.slice(ADAPTER_POWERSHELL_ZERO_WARNING.length+1):value;if(!rest.startsWith(ADAPTER_SHELL_NOTICE+'\n'))return value;rest=rest.slice(ADAPTER_SHELL_NOTICE.length+1);const cut=rest.indexOf('\n');return KERNEL_EXIT_LINE.test(cut<0?rest:rest.slice(0,cut))?rest:value;}
export function withoutKernelExitLine(text:string){const value=withoutAdapterHeaders(String(text));const cut=value.indexOf('\n');const first=cut<0?value:value.slice(0,cut);return KERNEL_EXIT_LINE.test(first)?(cut<0?'':value.slice(cut+1)):value;}

/* The transcript keeps the END of a long output behind this marker (transcript-model.ts `tail`). */
export function truncatedMarker(){return t('tool.transcript.truncated');}
/** The last `max` lines of an output and how many lines stand above them (`atLeast` when the model kept only the end). */
export function outputTail(text:string,max:number):{lines:string[];hidden:number;atLeast:boolean}{
  /* UI Phase 0 D12: a Windows command ends its lines with CRLF; split on the raw `\n` the `\r` stayed on each line and the
     per-line sanitizer turned it into a second line end (a blank line between every two). Line ends are made one first. */
  let value=String(text).replace(/\r\n?/gu,'\n').replace(/\n+$/u,'');
  const marker=truncatedMarker()+'\n',atLeast=value.startsWith(marker);
  if(atLeast)value=value.slice(marker.length);
  if(value==='')return{lines:[],hidden:0,atLeast:false};
  const all=value.split('\n');const lines=all.slice(-max);
  return{lines,hidden:all.length-lines.length,atLeast:atLeast&&all.length>lines.length};
}
/** `… +N earlier lines`, or `… N+ earlier lines` when the start of the output was dropped (a lower bound). */
export function moreLines(hidden:number,atLeast:boolean){return atLeast?t('tool.output.moreAtLeast',{count:hidden}):tn('tool.output.more',hidden);}

/** Q-R3-2 words: `0.1 s`, `4.2 s` under ten seconds, `12 s`, then `1 min 15 s`. */
export function formatDuration(ms:number):string{
  const value=Math.max(0,Number(ms)||0);
  if(value<10_000)return t('tool.duration.seconds',{seconds:(value/1000).toFixed(1)});
  const seconds=Math.round(value/1000);
  if(seconds<60)return t('tool.duration.seconds',{seconds});
  return t('tool.duration.minutes',{minutes:Math.floor(seconds/60),seconds:seconds%60});
}

/*
 * One argument as one line, `label: value`. A value is data and is shown as it is (strings, numbers, booleans); a text
 * of several lines is counted (`content: 7 bytes · 2 lines`); an array or object is counted, never printed as JSON
 * (review D-07: `args {"percorso":…}`).
 */
/* ASYNC step 2: the kernel's Italian enum values the screen names in English (the model's argument is untouched). */
const ENUM_VALUES:Readonly<Record<string,Readonly<Record<string,MessageId>>>>={modalita:{lettura:'tool.value.mode.readOnly',modifica:'tool.value.mode.edit'}};
export function argumentLine(key:string,value:unknown):string{
  const label=argumentLabel(key);
  const named=typeof value==='string'?ENUM_VALUES[key]?.[value]:undefined;
  if(named)return `${label}: ${t(named)}`;
  if(typeof value==='string'){if(value==='')return `${label}: ${t('tool.value.empty')}`;return /\r|\n/u.test(value)?`${label}: ${t('tool.value.bytes',textSize(value))}`:`${label}: ${value}`;}
  if(typeof value==='number'||typeof value==='boolean')return `${label}: ${String(value)}`;
  if(value===null||value===undefined)return `${label}: ${t('tool.value.empty')}`;
  if(Array.isArray(value))return `${label}: ${tn('common.item',value.length)}`;
  return `${label}: ${tn('tool.value.fields',Object.keys(value as object).length)}`;
}
