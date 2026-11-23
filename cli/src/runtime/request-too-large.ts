/*
 * 0.6.13, «a request too large for the model» (owner 22/10/2026, after a research on 12 competitors; contract agreed with the
 * Desktop the same day). When the person's newest message alone does not fit the model, the kernel stops the turn BEFORE any
 * paid call with a RunError `code:'REQUEST_TOO_LARGE'` and `{tokensRichiesta, tokensCornice, finestra, fonte:'stima'|'fornitore'}`:
 * nothing is summarised or paid, the text goes back to the composer and there is ONE action, «Send as attachment», which sends
 * the same text again with the run option `allegaSeTroppoGrande:true` (the kernel writes it to `<session>/incollati/<id>.txt`
 * and sends its head, its tail and a pointer the model can read).
 * Competitors: gemini-cli stops on `ContextWindowWillOverflow` before the call and gives the prompt back to the input
 * (packages/core/src/core/client.ts:726-745, packages/cli/src/ui/AppContainer.tsx:1348-1376); Claude Code says the single
 * exchange is too long and to start with less pasted text; Codex rejects an over-large input with a typed error
 * (codex-rs/protocol/src/user_input.rs:10, MAX_USER_INPUT_TEXT_CHARS). TALOS keeps the request in the journal as «not sent» and
 * offers the attachment, so nothing is lost and nothing is paid.
 * This module has no imports: the protocol, the error describer, the failure envelope and the screen all read the same facts.
 * The English names avoid the word «token»: the v1 bridge drops and the failure redactor masks any key that contains it.
 */
export const REQUEST_TOO_LARGE='REQUEST_TOO_LARGE';
/** In tokens: the newest request alone, the frame around it (system and tools), the model's window; `source` says who counted. */
/* `attachable` (review 9 F3 of 0.6.13): the kernel's `allegabile` — false when not even the attached form (start, end and the note)
   fits, or for images; absent when the kernel did not say. The one action is offered only when it is not false. */
/* `reserve` (review 13 of 0.6.13, the kernel's additive `riserva`): the room kept for the answer. Without it «11,005 + 11,628 over
   24,000» read as a sum that fits; with it the three parts add up to more than the window. Absent when the kernel did not say. */
export type RequestTooLarge={request:number;frame:number;window:number;source:'estimate'|'provider';attachable?:boolean;reserve?:number};
const flag=(value:unknown)=>typeof value==='boolean'?{attachable:value}:{};
function count(value:unknown):number|null{return typeof value==='number'&&Number.isFinite(value)&&value>=0?Math.round(value):null;}
function record(value:unknown):Record<string,unknown>|null{return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null;}
function fromKernel(row:Record<string,unknown>):RequestTooLarge|null{
  const request=count(row.tokensRichiesta),frame=count(row.tokensCornice),window=count(row.finestra);
  if(request===null||frame===null||window===null)return null;
  return{request,frame,window,source:row.fonte==='fornitore'?'provider':'estimate',...flag(row.allegabile)};
}
function fromEnglish(row:Record<string,unknown>):RequestTooLarge|null{
  const request=count(row.request),frame=count(row.frame),window=count(row.window);
  if(request===null||frame===null||window===null)return null;
  const reserve=count(row.reserve);
  return{request,frame,window,source:row.source==='provider'?'provider':'estimate',...flag(row.attachable),...(reserve!==null&&reserve>0?{reserve}:{})};
}
/**
 * The four numbers of a REQUEST_TOO_LARGE failure, wherever they travel: the CLI's own English field `requestTooLarge` (a v2
 * error, a failure envelope, a v1 event's data), or the kernel's Italian fields on the RunError itself or under its `dati`/`data`
 * (the contract names the fields, not where they sit: both are read). Null when a number is missing: nothing is invented.
 */
export function requestTooLargeOf(value:unknown):RequestTooLarge|null{
  try{
    const row=record(value);if(!row)return null;
    const english=record(row.requestTooLarge);if(english){const facts=fromEnglish(english);if(facts)return facts;}
    const candidates=[row,record(row.dati),record(row.data),record(row.messageParams)];
    /* the kernel's `allegabile` may sit beside the numbers or only under `dati` (RichiestaTroppoGrande keeps both): read wherever it is */
    const attachable=candidates.map(candidate=>candidate?.allegabile).find(value=>typeof value==='boolean');
    /* `riserva` the same way: wherever the kernel put it */
    const reserve=candidates.map(candidate=>count(candidate?.riserva)).find(value=>value!==null&&value>0);
    for(const candidate of candidates){if(!candidate)continue;const facts=fromKernel(candidate);if(facts)return{...facts,...(typeof attachable==='boolean'?{attachable}:{}),...(reserve!==undefined&&reserve!==null?{reserve}:{})};}
    return null;
  }catch{return null;}
}
/** Whether a failure (any shape: kernel RunError, v2 error, envelope, TUI event) is the REQUEST_TOO_LARGE one. */
export function isRequestTooLarge(value:unknown):boolean{
  try{
    const row=record(value);if(!row)return false;
    if(row.code===REQUEST_TOO_LARGE)return true;
    const envelope=record(row.envelope)??record(record(row.error)?.envelope);
    return envelope?.code===REQUEST_TOO_LARGE||record(row.error)?.code===REQUEST_TOO_LARGE;
  }catch{return false;}
}
