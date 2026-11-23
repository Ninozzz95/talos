/*
 * P-D (owner 07/10 night; registro 12 Voce 19): the journal keeps EVERY streamed delta as its own record, so a long session replays tens of
 * thousands of tiny events on the way to the screen (the owner's real 12.3 MB session: 30,574 records, 25,897 of them text or reasoning
 * deltas; each one is cloned, redacted, translated and reduced: 450 ms of a 2.1 s resume). On a FULL replay only, adjacent deltas of the
 * same message (or of the same tool call's arguments) are folded into one event: the text is the same, in the same order, and the folded
 * event carries the last sequence number so the supervisor's cursor stays monotonic.
 * Why this and not another place: Codex (rollout/src/policy.rs:94), Pi (agent-session.ts:925) and OpenCode (session.ts:877) persist
 * completed items and never deltas, so there is nothing for them to fold; TALOS persists deltas (crash-safe streaming, desktop contract), so
 * the fold belongs to the read side. AG-UI (docs.ag-ui.com/concepts/events): clients concatenate the deltas of a message in arrival order.
 * Not folded: any other event in between (it ends the run), a delta without a string `delta` or without an id, and every live event.
 * The kernel's stored events are never mutated: a folded event is a new object.
 * A folded event is a VIEW, not one of the kernel's records, and it says so (isFoldedReplayEvent): it carries the last sequence of the run it
 * replaces, which another subscriber of the same session may already hold as a raw delta, so the supervisor's buffer (which detects a
 * different event at a known sequence) must not take it in. Same shape as t3code's coalesceStoredThreadEvents (the survivor keeps its own
 * sequence, read side only) and Codex's remote-control stream (drop by sequence <= last seen, never by content).
 */
type Raw=Record<string,unknown>;
/*
 * C2 (owner 07/10 night, registro 12 Voce 22-25): a replay made for the SCREEN may cut a giant tool result to its head and its tail. The owner's real
 * 30.7 MB session holds six `ToolCallResult` events of 30.45 MB in all (the largest 5.16 M characters, only the field `content`); the transcript keeps
 * 8 KiB of each (MAX_TOOL_SUMMARY_CHARS) and the facts of the kernel's first line, but the replay cloned, fingerprinted (canonical copy, JSON, sha256),
 * redacted and translated every character: about 250 ms of a 1.1 s resume. The cut is a VIEW (a new object, marked like a fold) and only when the
 * subscriber asks for it (`options.giantResults`): headless, export and the agent view still get the whole event, and so does every live event.
 * Pi `truncate.ts` (2000 lines / 50 KB, tail), OpenCode `tool/truncate.ts` (2000 / 50 KB, the rest saved to a file) and Codex `TruncationPolicy`
 * limit the output before it enters the history; TALOS keeps the whole result in the journal (desktop contract), so the limit belongs to the read side.
 */
export type GiantResultLimits={over:number;head:number;tail:number};
/** What the TUI asks for: over 64 KiB a result is cut to its first 4 KiB (the kernel's `exit N` line and the data frame) and its last 32 KiB (the 8 KiB it draws, with room). */
export const SCREEN_RESULT_LIMITS:GiantResultLimits=Object.freeze({over:64*1024,head:4*1024,tail:32*1024});
export type ReplayOptions={giantResults?:GiantResultLimits};
const FOLDABLE:Readonly<Record<string,string>>={TextMessageContent:'messageId',ReasoningMessageContent:'messageId',ToolCallArgs:'toolCallId'};

const folded=new WeakSet<object>();
/** True for an event this module built by folding two or more deltas; false for everything else, including a lone delta passed through. */
export const isFoldedReplayEvent=(event:unknown):boolean=>typeof event==='object'&&event!==null&&folded.has(event);
/** True for any view this module built, a fold or a cut result: not one of the kernel's own records, so the supervisor's buffer does not take it in. */
export const isReplayView=isFoldedReplayEvent;
const isHighSurrogate=(code:number)=>code>=0xD800&&code<=0xDBFF;
const isLowSurrogate=(code:number)=>code>=0xDC00&&code<=0xDFFF;
/** A `ToolCallResult` over the limit as its view; any other event, or a result within the limit, is returned as it is. */
function giantResultView(event:unknown,limits:GiantResultLimits):unknown{
  if(!event||typeof event!=='object')return event;
  const raw=event as Raw;
  if(raw.type!=='ToolCallResult'||typeof raw.content!=='string'||raw.content.length<=limits.over)return event;
  const content=raw.content;
  let head=limits.head,tail=content.length-limits.tail;
  if(head>0&&isHighSurrogate(content.charCodeAt(head-1)))head-=1;
  if(tail<content.length&&isLowSurrogate(content.charCodeAt(tail)))tail+=1;
  const view={...raw,content:`${content.slice(0,head)}\n[… ${tail-head} characters of this result are not loaded in this view …]\n${content.slice(tail)}`};
  folded.add(view);
  return view;
}

function foldKey(event:unknown):string|null{
  if(!event||typeof event!=='object')return null;
  const raw=event as Raw;const idField=FOLDABLE[String(raw.type)];
  if(idField===undefined)return null;
  const id=raw[idField];
  if(typeof id!=='string'||id===''||typeof raw.delta!=='string')return null;
  return `${String(raw.type)}\u0000${id}`;
}

/** Wraps `listener` for one subscription: deltas pushed before `end()` are folded; after `end()` every event passes straight through. */
export function createReplayCoalescer(listener:(event:unknown)=>void,options:ReplayOptions={}){
  let replaying=true;
  let first:Raw|null=null;let key:string|null=null;let pieces:string[]=[];let lastSequence:unknown;
  function flush(){
    if(first===null)return;
    const event=pieces.length===1?first:{...first,delta:pieces.join(''),...(lastSequence!==undefined?{_sequenza:lastSequence}:{})};
    if(pieces.length>1)folded.add(event);
    first=null;key=null;pieces=[];lastSequence=undefined;
    listener(event);
  }
  return{
    push(event:unknown){
      if(!replaying){listener(event);return;}
      const next=foldKey(event);
      if(next===null){flush();listener(options.giantResults?giantResultView(event,options.giantResults):event);return;}
      const raw=event as Raw;
      if(first!==null&&key===next){pieces.push(raw.delta as string);if(raw._sequenza!==undefined)lastSequence=raw._sequenza;return;}
      flush();
      first=raw;key=next;pieces=[raw.delta as string];lastSequence=raw._sequenza;
    },
    end(){flush();replaying=false;}
  };
}
