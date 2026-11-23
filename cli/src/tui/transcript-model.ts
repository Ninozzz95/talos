import type {FileChange,ToolDecision,ToolFacts,ToolOrigin} from './tool-facts.ts';
import type {ToolOutcomeEvidence,ToolLifecycleStatus} from '../events/bridge.ts';
import type {TuiEvent} from './event-adapter.ts';
import {describeError,describeRefusal,errorViewLines,type StopPoint} from '../i18n/error-view.ts';
import {t,tn,type MessageId} from '../i18n/index.ts';
import {rendererKindFor,toolDisplay} from './tool-display.ts';
import type {ChangeSummary} from './tools/registry.ts';
import {toolRowView} from './components/tool-row.ts';
import {agentResultText,type TranscriptAgentItem} from './components/agent-result.ts';
import {answersText,type TranscriptAnswersItem} from './components/question-receipt.ts';
import {planReceiptText,planSteps,type TranscriptPlanItem} from './components/plan-receipt.ts';
import {dialogueText,type TranscriptDialogueItem} from './components/agent-dialogue.ts';
import {tabTitle} from './question-card.ts';
import {compactTokens} from './status-bar.ts';
import {lineCount,sanitizeDisplayText,truncatedMarker,visibleEscape,withoutKernelExitLine} from './tools/shared.ts';
import {isRequestTooLarge} from '../runtime/request-too-large.ts';
import {readHeadLength,readPageOf} from '../runtime/output-store.ts';
import {textForScreen} from './data-boundary.ts';

export const MAX_TRANSCRIPT_ITEMS=768;
const MAX_MESSAGE_CHARS=256*1024;
const MAX_TOOL_SUMMARY_CHARS=8*1024;
const MAX_WARNING_CHARS=2048;
/* A file change is kept whole (for the Ctrl+O diff) up to this size per side; beyond it only its summary is kept. */
const MAX_CHANGE_CHARS=512*1024;
const MAX_RUNS=64;
function tail(value:string,limit:number){if(value.length<=limit)return value;const marker=truncatedMarker()+'\n';return marker+value.slice(-(limit-marker.length));}

/* F-Q1 (owner 03/10): `queued` marks a message still waiting in a queue — drawn gray at the end of the conversation, with this
   header, until it is delivered (then it is an ordinary message where the kernel put it). Never stored in the model. */
/* 0.6.13 (contract with the Desktop, 22/10/2026): `notSent` marks the person's request the kernel kept as NOT SENT because it did
   not fit the model (`request.not_sent`, or the live `REQUEST_TOO_LARGE` failure of its turn): drawn with its mark, live and in a
   replay, and never as a message the model received. */
/* 0.6.15 T5: `device` — the person's message came from this device through remote control ('' when the device has no name) */
export type TranscriptMessageItem={kind:'message';id:string;role:'user'|'assistant';text:string;streaming:boolean;queued?:string;notSent?:true;device?:string};
/* R5a S8 (Q-R5-9): `startedAt`/`endedAt` time a live reasoning block for its collapsed line ("Thought for 2.8 s"); a
   replayed block has none (a duration measured while replaying a log is not a duration, R3 lane SP). */
export type TranscriptReasoningItem={kind:'reasoning';id:string;text:string;streaming:boolean;startedAt?:number|null;endedAt?:number|null};
/* R3 (gate E9, Q-R3-8): `denied` and `interrupted` are states of their own; a refusal or a person's stop is never `failed`. */
export type TranscriptToolStatus='queued'|'approval'|'running'|'streaming'|ToolLifecycleStatus|'denied'|'interrupted';
/* R5a S6/S7 (Q-R5-10/11): a long output kept in a private file, and the read tool's cut, from lane R's events. */
export type SavedOutput={path:string;keptChars:number;totalChars:number};
export type ReadCut={shownLines:number;totalLines:number|null;limitChars:number};
/** 0.6.13 gate: the lines a read gave the model, counted on the whole result (`finalOutput` keeps only its last 8 KB). */
export type ReadLines={shownLines:number;totalLines:number|null};
/* R5a S10: `askedPerson` — the approval dialog was opened for this call, so "you did not approve it" can be true. */
export type TranscriptToolItem={kind:'tool';id:string;name:string;status:TranscriptToolStatus;argsText:string;liveOutput:string;finalOutput:string;startedAt:number|null;endedAt:number|null;outcome:ToolOutcomeEvidence|null;origin?:ToolOrigin;decision?:ToolDecision|null;facts?:ToolFacts;change?:FileChange|null;changeSummary?:ChangeSummary|null;savedOutput?:SavedOutput|null;readCut?:ReadCut|null;readLines?:ReadLines|null;askedPerson?:boolean};
/* `detail` (R2 lane E, Q-R2-2): the untranslated original text, for the expanded/raw view and never for the default row.
   `outcome` (R3 Q-R3-8/9): the one line a turn leaves when it did not end normally — `Interrupted · <stop point>` or the
   three-part error — drawn as a dim notice (the Run rows are gone). */
/** `alert` (0.6.6): a failure the person must notice and act on (a plan's usage limit), drawn in the warning colour, not dim. */
export type TranscriptWarningItem={kind:'warning';id:string;text:string;detail?:string|null;outcome?:'interrupted'|'failed';alert?:true};
/* No longer produced (Q-R3-9: the `Run · …` rows are removed); kept in the union so app.ts, which still has a branch for
   it, type-checks until lane SP drops that branch. */
export type TranscriptRunItem={kind:'run';id:string;status:'running'|'completed'|'failed'|'cancelled'|'interrupted';sessionId:string|null;runId:string|null;message:string;detail?:string|null};
/* ASYNC phase step 2 (owner 01/10): a delegated agent's result, drawn when the kernel hands it to the main agent. */
export type {TranscriptAgentItem};
/* Stage 3: the person's answers to the model's questions (components/question-receipt.ts). */
export type {TranscriptAnswersItem};
/* Stage 3: the plan the person approved (components/plan-receipt.ts). */
export type {TranscriptPlanItem};
/* Stage 3: a parent↔child exchange (components/agent-dialogue.ts). */
export type {TranscriptDialogueItem};
/* Long chats, tappa D: the one row at the top of a conversation whose beginning waits off the list ("↑ 120 earlier messages"). Made by the screen from `earlier`, never stored in the model, like a queued message. */
export type TranscriptEarlierItem={kind:'earlier';id:string;items:number;messages:number};
export const EARLIER_ROW_ID='earlier:row';
export type TranscriptItem=TranscriptEarlierItem|TranscriptMessageItem|TranscriptReasoningItem|TranscriptToolItem|TranscriptWarningItem|TranscriptRunItem|TranscriptAgentItem|TranscriptAnswersItem|TranscriptPlanItem|TranscriptDialogueItem;
/* A run the transcript follows without drawing it: `anchor` is the last item when it started (its prompt, usually), so
   "since this run started" is "after the anchor"; `history` marks a run replayed from the kernel's log. */
/* R5b (R5a open 2): `summaryRequests` counts the Context Engine summaries this run asked for; `summaryAccepted` is set when
   the engine committed one. A run that asked and committed none ends with one line (summaryNotice). */
export type TranscriptRun={key:string;runId:string|null;status:'running'|'completed'|'failed'|'interrupted';history:boolean;anchor:string|null;summaryRequests?:number;summaryAccepted?:boolean};
/* R3 contract events that arrived before their tool's `tool.started` wait here (never a phantom row); R5a adds the cut facts. */
type PendingToolFacts={origin?:ToolOrigin;decision?:ToolDecision|null;facts?:ToolFacts;savedOutput?:SavedOutput;readCut?:ReadCut};
/* `lateEcho` (R1 lane R, D-04): the person's message rebuilt from a live RunStarted that no local echo had announced yet — the
   echo app.ts adds AFTER dispatching a queued prompt or a command-line prompt — waiting to absorb that one echo. */
/* `questionTitles` (stage 3): the titles of each open question request, by request id, so its receipt names them. */
export type TranscriptModel={items:TranscriptItem[];/* long chats, tappa D: what the cap or a window took off the list, oldest first, so the beginning of a long conversation stays reachable */earlier?:TranscriptItem[];/* the cap on `items`; a page the person loaded raises it by what it loaded */limit?:number;nextLocalId:number;pendingApproval:null|{requestId:string;toolCallId:string};questionTitles?:Record<string,Array<{id:string;title:string}>>;/* stage 3: the text of each open plan, by request id, so its approval keeps it */planTexts?:Record<string,string>;/* stage 3: each delegated agent's task, to name it in the dialogue */agentTasks?:Record<string,string>;/* stage 3: the server of each open MCP request, to name it in the notice */elicitServers?:Record<string,string>;/* stage 3: the question tool's calls, drawn as the card and the receipt instead of a row */hiddenTools?:Record<string,true>;lateEcho?:{id:string;text:string}|null;runs?:TranscriptRun[];pendingTools?:Record<string,PendingToolFacts>};

export function sanitizeTranscriptText(value:string):string{return sanitizeDisplayText(value);}
export function transcriptItemText(item:TranscriptItem):string{
  if(item.kind==='message')return sanitizeTranscriptText((item.role==='user'?'You':'TALOS')+'\n'+item.text+(item.device!==undefined?'\n'+(item.device?t('screen.message.fromDevice',{name:item.device}):t('screen.message.fromUnnamedDevice')):'')+(item.notSent?'\n'+t('screen.requestTooLarge.notSent'):''));
  if(item.kind==='reasoning')return sanitizeTranscriptText('Reasoning\n'+item.text);
  if(item.kind==='tool'){
    /* R3 gate E1: the header is the ONE row formatter's line (tools/row-format.ts), unfitted; the output follows whole for
       search and copy, without the kernel's `exit N [sandbox: …]` first line (gate E3). The raw item stays in
       `transcriptItemRaw`. */
    const output=withoutKernelExitLine(item.finalOutput||item.liveOutput);
    return sanitizeTranscriptText([toolRowView(item,Number.POSITIVE_INFINITY,false).line,output.trim()?'Output\n'+output:''].filter(Boolean).join('\n'));
  }
  if(item.kind==='warning')return sanitizeTranscriptText(item.outcome?item.text:'Warning\n'+item.text);
  if(item.kind==='agent')return sanitizeTranscriptText(agentResultText(item));
  if(item.kind==='answers')return sanitizeTranscriptText(answersText(item));
  if(item.kind==='plan')return sanitizeTranscriptText(planReceiptText(item));
  if(item.kind==='dialogue')return sanitizeTranscriptText(dialogueText(item));
  /* the row that offers the older messages is not part of the conversation: search and copy never see it */
  if(item.kind==='earlier')return'';
  return sanitizeTranscriptText('Run · '+item.status+(item.runId?' · '+item.runId:'')+(item.message?'\n'+item.message:''));
}
export function transcriptItemRaw(item:TranscriptItem):string{
  return JSON.stringify(item,null,2).replace(/[\x7f-\x9f\u2028\u2029\p{Bidi_Control}]/gu,visibleEscape);
}

export function createTranscriptModel():TranscriptModel{return{items:[],nextLocalId:1,pendingApproval:null};}
export function clearTranscript(model:TranscriptModel):TranscriptModel{return{items:[],nextLocalId:model.nextLocalId,pendingApproval:null,...(model.runs?{runs:model.runs}:{})};}
function activeTool(status:TranscriptToolStatus){return status==='queued'||status==='approval'||status==='running'||status==='streaming';}
function active(item:TranscriptItem){return(item.kind==='message'&&item.streaming)||(item.kind==='reasoning'&&item.streaming)||(item.kind==='tool'&&activeTool(item.status))||(item.kind==='run'&&item.status==='running');}
/* Long chats, tappa D (owner 07/10 night; Codex tui/src/app_server_session/history.rs:29-31 hydrates 5 turns and pages of 100 items): the cap used
   to drop the oldest items for good, so the beginning of a long session could not be reached. They wait in `earlier` instead (bounded, oldest first). */
export const MAX_EARLIER_ITEMS=20_000;
export const EARLIER_PAGE_ITEMS=100;
export const WINDOW_TURNS=5;
function addEarlier(model:TranscriptModel,dropped:TranscriptItem[]):TranscriptItem[]|undefined{
  if(!dropped.length)return model.earlier;
  const all=model.earlier?.length?[...model.earlier,...dropped]:dropped;
  return all.length>MAX_EARLIER_ITEMS?all.slice(all.length-MAX_EARLIER_ITEMS):all;
}
function trim(model:TranscriptModel):TranscriptModel{
  const limit=model.limit??MAX_TRANSCRIPT_ITEMS;
  if(model.items.length<=limit)return{...model,items:[...model.items]};
  const items=[...model.items];const dropped:TranscriptItem[]=[];
  while(items.length>limit){
    const index=items.findIndex(item=>!active(item));
    if(index<0)break;
    dropped.push(items.splice(index,1)[0]!);
  }
  const earlier=addEarlier(model,dropped);
  return{...model,items,...(earlier?{earlier}:{})};
}
const isPrompt=(item:TranscriptItem|undefined)=>item?.kind==='message'&&item.role==='user'&&!item.queued;
/** How much waits off the list: every item, and how many of them are messages (what the row says). */
export function earlierCount(model:TranscriptModel):number{return model.earlier?.length??0;}
export function summarizeEarlier(earlier:readonly TranscriptItem[]|undefined):{items:number;messages:number}{
  const list=earlier??[];return{items:list.length,messages:list.filter(item=>item.kind==='message').length};
}
export function earlierSummary(model:TranscriptModel):{items:number;messages:number}{return summarizeEarlier(model.earlier);}
/** The window of a conversation that was just replayed: the last `turns` turns stay on the list (a turn starts at the person's prompt), the older ones wait in `earlier`. A live item stops the window before it. */
export function windowTranscript(model:TranscriptModel,turns=WINDOW_TURNS):TranscriptModel{
  const prompts:number[]=[];model.items.forEach((item,index)=>{if(isPrompt(item))prompts.push(index);});
  if(prompts.length<=turns)return model;
  let cut=prompts[prompts.length-turns]!;
  const live=model.items.findIndex(active);if(live>=0&&live<cut)cut=live;
  if(cut<=0)return model;
  const earlier=addEarlier(model,model.items.slice(0,cut));
  return{...model,items:model.items.slice(cut),...(earlier?{earlier}:{})};
}
/** A page back: the last `count` waiting items, extended back to the prompt that opens their first turn (at most four pages of extension), put before the list. The cap grows by what was loaded, so the next event does not drop it again. */
export function revealEarlier(model:TranscriptModel,count=EARLIER_PAGE_ITEMS):TranscriptModel{
  const earlier=model.earlier;if(!earlier?.length)return model;
  let from=Number.isFinite(count)?Math.max(0,earlier.length-Math.max(1,Math.floor(count))):0;
  while(from>0&&!isPrompt(earlier[from])&&earlier.length-from<EARLIER_PAGE_ITEMS*4)from-=1;
  const loaded=earlier.slice(from);
  const kept=earlier.slice(0,from);
  const {earlier:_unused,...rest}=model;
  return{...rest,items:[...loaded,...model.items],limit:(model.limit??MAX_TRANSCRIPT_ITEMS)+loaded.length,...(kept.length?{earlier:kept}:{})};
}
function put(model:TranscriptModel,item:TranscriptItem):TranscriptModel{
  const index=model.items.findIndex(row=>row.id===item.id);
  if(index>=0){const items=model.items.slice();items[index]=item;return trim({...model,items});}
  return trim({...model,items:[...model.items,item]});
}
function localId(model:TranscriptModel,prefix:string){return{id:prefix+':local:'+model.nextLocalId,model:{...model,nextLocalId:model.nextLocalId+1}};}
function existing<T extends TranscriptItem['kind']>(model:TranscriptModel,id:string,kind:T):Extract<TranscriptItem,{kind:T}>|null{
  const item=model.items.find(row=>row.id===id);
  return item?.kind===kind?item as Extract<TranscriptItem,{kind:T}>:null;
}
function toolId(toolCallId:string){return'tool:'+toolCallId;}

/* ---- R3 contract events (tui/tool-facts.ts; produced by lane SP) ---- */
function definedFacts(facts:ToolFacts|undefined):ToolFacts{const out:Record<string,unknown>={};for(const [key,value] of Object.entries(facts??{}))if(value!==undefined)out[key]=value;return out as ToolFacts;}
function withFacts(item:TranscriptToolItem,pending:PendingToolFacts):TranscriptToolItem{
  const next={...item};
  if(pending.origin)next.origin=pending.origin;
  if(pending.decision!==undefined)next.decision=pending.decision;
  if(pending.facts)next.facts={...(item.facts??{}),...definedFacts(pending.facts)};
  if(pending.savedOutput)next.savedOutput=pending.savedOutput;
  if(pending.readCut)next.readCut=pending.readCut;
  return next;
}
const count=(value:unknown):number|null=>typeof value==='number'&&Number.isFinite(value)&&value>=0?Math.floor(value):null;
/* R5a S6/S7: the facts of lane R's cut events, kept only when they are whole numbers and a path (a malformed event is
   dropped, never drawn as a zero). */
function savedOutputOf(event:{path:unknown;keptChars:unknown;totalChars:unknown}):SavedOutput|null{
  const kept=count(event.keptChars),total=count(event.totalChars);
  return typeof event.path==='string'&&event.path.trim()&&kept!==null&&total!==null?{path:event.path,keptChars:kept,totalChars:total}:null;
}
function readCutOf(event:{shownLines:unknown;totalLines:unknown;limitChars:unknown}):ReadCut|null{
  const shown=count(event.shownLines),limit=count(event.limitChars);
  return shown!==null&&limit!==null&&limit>0?{shownLines:shown,totalLines:count(event.totalLines),limitChars:limit}:null;
}

/*
 * R5a S3 (owner decision Q-R5-4, gate E9): a compaction is named on the transcript when it happens — which engine, what
 * was summarized, the tokens before and after. The Context Engine compacts at half of a KNOWN window (owner, 2026-09-16:
 * "the threshold is stated to the user"), so its line states the 50 %; the kernel's own rule (since 0.6.13 the desktop adapter's:
 * 75 % of the window, or `context.compactAtTokens`) is the one that runs when the window is unknown or under 64k. An unknown count is
 * said to be unknown, never zero (E1). 0.6.13 (22/10/2026): a compaction the person asked for (/compact) is not described by the
 * automatic rule, which did not decide it.
 */
const WITHOUT_MODEL_REASONS:Readonly<Record<string,MessageId>>={target:'screen.compaction.withoutModel.target',brake:'screen.compaction.withoutModel.brake',
  time:'screen.compaction.withoutModel.time',skipped:'screen.compaction.withoutModel.skipped',exhausted:'screen.compaction.withoutModel.exhausted',refused:'screen.compaction.withoutModel.refused'};
export function compactionNoticeText(event:{engine:unknown;messagesSummarized:unknown;tokensBefore:unknown;tokensAfter:unknown;trigger?:unknown;method?:unknown;imagesReplaced?:unknown;fallbackReason?:unknown;afterRefusal?:unknown;emergency?:unknown;factsUnknown?:unknown}):string{
  /* review 14 R14-1 of 0.6.13: a compaction the run counted and no event described: neither its method nor its rule is known */
  if(event.factsUnknown===true)return t('screen.compaction.unknown');
  const messages=count(event.messagesSummarized),before=count(event.tokensBefore),after=count(event.tokensAfter);
  /* 0.6.13 review 9 F5: a free shortening of older tool results is said as that; nothing was summarized. Z F1: with the older images
     it replaced with a placeholder, counted */
  if(event.method==='tool-results'||event.method==='images'){
    const tokens=before!==null&&after!==null?t('screen.compaction.tokens',{before:compactTokens(before),after:compactTokens(after)}):t('screen.compaction.tokensUnknown');
    const images=count(event.imagesReplaced);
    if(images===null||images===0)return t('screen.compaction.toolResults',{tokens});
    return tn(event.method==='images'?'screen.compaction.images':'screen.compaction.toolResultsImages',images,{tokens});
  }
  /* Z piece C: a summary TALOS's own code wrote, no model, said as that with its reason (never «summarized» as if a model had) */
  if(event.method==='without-model'){
    const tokens=before!==null&&after!==null?t('screen.compaction.tokens',{before:compactTokens(before),after:compactTokens(after)}):t('screen.compaction.tokensUnknown');
    const why=typeof event.fallbackReason==='string'?WITHOUT_MODEL_REASONS[event.fallbackReason]:undefined;
    return why?t('screen.compaction.withoutModel',{why:t(why),tokens}):t('screen.compaction.withoutModel.noReason',{tokens});
  }
  const parts=[messages===null?t('screen.compaction.messagesUnknown'):tn('screen.compaction.messages',messages)];
  if(before!==null&&after!==null)parts.push(t('screen.compaction.tokens',{before:compactTokens(before),after:compactTokens(after)}));
  else if(before!==null)parts.push(t('screen.compaction.tokensBefore',{before:compactTokens(before)}));
  else if(after!==null)parts.push(t('screen.compaction.tokensAfter',{after:compactTokens(after)}));
  else parts.push(t('screen.compaction.tokensUnknown'));
  if(event.trigger==='manual')return t('screen.compaction.manual',{summary:parts.join(' · ')});
  /* review 10 R10-9: the provider's refusal started it, not the 75% rule */
  if(event.afterRefusal===true)return t('screen.compaction.afterRefusal',{summary:parts.join(' · ')});
  /* 0.6.14 (owner 25/10/2026, «Con il numero»): the emergency threshold started it, not the 75% rule */
  /* judge v1541, cured by judge v1579: at its emergency the kernel's `compattazione-inizio` `soglia` IS the emergency line
     (talosHarness.desktop-hotfix.mjs:2068, :2100), said as it is, never multiplied again and never «90% of the window»; an older
     journal without it names the line with no number */
  if(event.emergency===true&&event.engine!=='context-engine'){
    const threshold=count((event as any).emergencyThreshold);
    return threshold?t('screen.compaction.emergency',{line:compactTokens(threshold),summary:parts.join(' · ')}):t('screen.compaction.emergency.noNumbers',{summary:parts.join(' · ')});
  }
  /* judge v1597: the kernel's rows did not say why (provider-attempts.ts compactionCauseOf): no «75%», no number, no guessed reason */
  if((event as any).causeUnknown===true&&event.engine!=='context-engine')return t('screen.compaction.kernel.noCause',{summary:parts.join(' · ')});
  return t(event.engine==='context-engine'?'screen.compaction.contextEngine':'screen.compaction.kernel',{summary:parts.join(' · ')});
}
/*
 * The persisted pause has an absolute UTC deadline, so replay cannot suggest a future retry on the wrong day.
 */
export function compactionPausedText(event:{code:string;attempts:number|null;retryAfter:string}):string{
  const time=new Date(event.retryAfter).toISOString();
  return tn('screen.compaction.paused',event.attempts&&event.attempts>1?event.attempts:1,{code:event.code,time});
}
/** A new tool item, with whatever facts arrived before it (and those facts consumed). */
function newTool(model:TranscriptModel,toolCallId:string,row:Omit<TranscriptToolItem,'kind'|'id'>):TranscriptModel{
  const pending=model.pendingTools?.[toolCallId];
  let item:TranscriptToolItem={kind:'tool',id:toolId(toolCallId),...row};
  let base=model;
  if(pending){item=withFacts(item,pending);const rest={...model.pendingTools};delete rest[toolCallId];base={...model,pendingTools:rest};}
  return put(base,item);
}
function toolFacts(model:TranscriptModel,toolCallId:string,pending:PendingToolFacts):TranscriptModel{
  const current=existing(model,toolId(toolCallId),'tool');
  if(current)return put(model,withFacts(current,pending));
  const all={...(model.pendingTools??{})};
  all[toolCallId]={...all[toolCallId],...pending,...(pending.facts?{facts:{...(all[toolCallId]?.facts??{}),...definedFacts(pending.facts)}}:{})};
  const keys=Object.keys(all);if(keys.length>MAX_RUNS)delete all[keys[0]!];
  return{...model,pendingTools:all};
}
/* The path a write/edit row names, for matching a `file.changed` that carries no tool call id. */
const normalPath=(value:unknown)=>String(value??'').trim().replaceAll('\\','/').replace(/^\.\//u,'');
function changedPathOf(item:TranscriptToolItem){try{const args=JSON.parse(item.argsText||'{}');return normalPath(args?.percorso??args?.path??args?.file??args?.filename);}catch{return '';}}
function fileChanged(model:TranscriptModel,change:FileChange):TranscriptModel{
  let target:TranscriptToolItem|null=change.toolCallId?existing(model,toolId(change.toolCallId),'tool'):null;
  if(!target){
    const writers=model.items.filter((item):item is TranscriptToolItem=>item.kind==='tool'&&(rendererKindFor(item.name)==='write'||rendererKindFor(item.name)==='edit'));
    const path=normalPath(change.path);
    target=writers.findLast(item=>changedPathOf(item)===path)??writers.findLast(item=>activeTool(item.status))??null;
  }
  if(!target)return model;
  const small=(change.before??'').length<=MAX_CHANGE_CHARS&&change.after.length<=MAX_CHANGE_CHARS;
  return put(model,small?{...target,change,changeSummary:null}:{...target,change:null,changeSummary:{newFile:change.before===null,lines:lineCount(change.after),added:null,removed:null}});
}

/* R2 lane E (gate E2, E4): a refused tool's `content` is what the MODEL reads ("REFUSED. <Italian motivo> …") and is never
   rewritten; the row shows the English reason of the receipt's `via`, and the content stays in `outcome.content`.
   R3 (gate E9): a refusal is `denied`, not `failed`. */
function refused(outcome:ToolOutcomeEvidence|null){return Boolean(outcome&&(outcome.allowed===false||outcome.receiptStatus==='denied'));}
function readLinesOf(content:string):ReadLines|null{
  const page=readPageOf(content);if(page)return page;
  /* review 17 R17-2 and R17-4(b) of 0.6.13: the kernel's notices, a byte page's header and the data boundary are not lines of the file */
  return content.length>MAX_TOOL_SUMMARY_CHARS?{shownLines:lineCount(textForScreen(content.slice(readHeadLength(content)))),totalLines:null}:null;
}
function terminalTool(model:TranscriptModel,toolCallId:string,rawContent:string,outcome:ToolOutcomeEvidence|null):TranscriptModel{
  const id=toolId(toolCallId),current=existing(model,id,'tool');
  /* A5j cure (judge v2325): the person's no on the card (`approval.resolved` approved:false made the row `denied`) wins over the kernel's
     «failed»: a call refused on its card is never run (talosHarness.mjs:20801-20806), and «No to this tool» keeps REFUSED with the error */
  const status:TranscriptToolStatus=refused(outcome)||(current?.status==='denied'&&outcome?.status==='failed')?'denied':outcome?.status??(current?.status==='denied'?'denied':'completed');
  const content=refused(outcome)?describeRefusal({via:outcome!.permissionVia,allowed:outcome!.allowed}):status==='denied'&&current?current.finalOutput||rawContent:rawContent;
  /* 0.6.13 gate (s21/s22 R5A-READCUT, first red at 80a0d077e): since the desktop adapter a read reaches the model whole, so its row
     counted the last 8 KB kept below («304 lines» for a page of 2,000 of 3,000). The facts are taken here, on the whole result:
     the kernel's page header when there is one, else the line count of a result longer than what the screen keeps. */
  const readLines=status==='completed'&&current&&rendererKindFor(current.name)==='read'?readLinesOf(content):null;
  const next=current
    ?put(model,{...current,status,finalOutput:tail(content,MAX_TOOL_SUMMARY_CHARS),endedAt:Date.now(),outcome,...(readLines?{readLines}:{})})
    :newTool(model,toolCallId,{name:'tool',status,argsText:'',liveOutput:'',finalOutput:tail(content,MAX_TOOL_SUMMARY_CHARS),startedAt:null,endedAt:Date.now(),outcome});
  return next.pendingApproval?.toolCallId===toolCallId?{...next,pendingApproval:null}:next;
}

/* ---- Runs (R1 lane R; R3 Q-R3-8/9) ---- */
function runsOf(model:TranscriptModel){return model.runs??[];}
function setRun(model:TranscriptModel,run:TranscriptRun):TranscriptModel{
  const runs=runsOf(model);
  return{...model,runs:runs.some(row=>row.key===run.key)?runs.map(row=>row.key===run.key?run:row):[...runs,run].slice(-MAX_RUNS)};
}
function findRun(model:TranscriptModel,event:{runId?:string}):TranscriptRun|null{
  const runs=runsOf(model);
  if(event.runId){const run=runs.find(row=>row.runId===event.runId||row.key===event.runId);if(run)return run;}
  for(let i=runs.length-1;i>=0;i--)if(runs[i]!.status==='running')return runs[i]!;
  return null;
}
function anchorIndex(model:TranscriptModel,run:TranscriptRun|null|undefined){return run?.anchor?model.items.findIndex(item=>item.id===run.anchor):-1;}
/*
 * R1 lane R (D-04, gate E9): the person's message is rebuilt from its run's RunStarted and keyed by the run
 * (`message:user:<runId>`), so a replay from 0 is idempotent. At send time app.ts has already shown a local echo
 * (`message:local:<n>`): the RunStarted adopts the newest unclaimed echo of the same text sent since the last run, so the
 * message is never shown twice. When the RunStarted comes first (queued prompt, command-line prompt) the message is created
 * here and the late echo is absorbed once (`lateEcho`). A replayed history RunStarted (`history`, set by the controller) never
 * absorbs an echo: a new send with the same text as an old one must stay visible at once.
 * R3 (Q-R3-9): "since the last run" is "after the last run's anchor" — there is no Run row to stop at any more.
 */
function userMessageId(key:string){return'message:user:'+key;}
function isLocalEcho(item:TranscriptItem){return item.kind==='message'&&item.role==='user'&&item.id.startsWith('message:local:');}
function adoptOrAddPrompt(model:TranscriptModel,key:string,text:string,history:boolean,device?:string):TranscriptModel{
  const id=userMessageId(key);
  if(existing(model,id,'message'))return model;
  const from=device!==undefined?{device}:{};
  const stop=anchorIndex(model,runsOf(model).at(-1));
  for(let i=model.items.length-1;i>stop;i--){
    const row=model.items[i]!;
    if(row.kind==='run'||(row.kind==='message'&&row.role==='user'&&!isLocalEcho(row)))break;
    if(isLocalEcho(row)&&row.kind==='message'&&row.text===text){const items=model.items.slice();items[i]={...row,id,streaming:false,...from};return{...model,items,lateEcho:null};}
  }
  const next=put(model,{kind:'message',id,role:'user',text:tail(text,MAX_MESSAGE_CHARS),streaming:false,...from});
  return{...next,lateEcho:history?null:{id,text}};
}
/*
 * 0.6.13: the person's message of a turn whose request was not sent. The turn's own prompt (`message:user:<run key>`, the one
 * `adoptOrAddPrompt` made or adopted), else the newest prompt on the list: the kernel names the request by its raw-history
 * position (`indice`), which the screen does not hold, and the request is always the newest of its turn (contract (a)).
 */
function markNotSent(model:TranscriptModel,run:TranscriptRun|null):TranscriptModel{
  let index=run?model.items.findIndex(item=>item.kind==='message'&&item.id===userMessageId(run.key)):-1;
  if(index<0)for(let i=model.items.length-1;i>=0;i--)if(isPrompt(model.items[i])){index=i;break;}
  const item=index>=0?model.items[index]:undefined;
  if(!item||item.kind!=='message'||item.notSent)return model;
  const items=model.items.slice();items[index]={...item,notSent:true};return{...model,items};
}
/* R5a S8: the clock of a reasoning block — now for a live run, none while a history is replayed. */
function liveClock(model:TranscriptModel):number|null{const run=runsOf(model).at(-1);return run?.history&&run.status==='running'?null:Date.now();}
function endReasoning(item:TranscriptReasoningItem):TranscriptReasoningItem{
  return{...item,streaming:false,...(typeof item.startedAt==='number'&&typeof item.endedAt!=='number'?{endedAt:Date.now()}:{})};
}
/* A turn that ends closes the reasoning it left open (the kernel may end a run without a reasoning end event). */
function closeReasoning(model:TranscriptModel):TranscriptModel{
  if(!model.items.some(item=>item.kind==='reasoning'&&item.streaming))return model;
  return{...model,items:model.items.map(item=>item.kind==='reasoning'&&item.streaming?endReasoning(item):item)};
}
function closeInterrupted(model:TranscriptModel):TranscriptModel{
  const now=Date.now();
  const items=model.items.map(item=>{
    if(item.kind==='reasoning'&&item.streaming)return endReasoning(item);
    if(item.kind==='message'&&item.streaming)return{...item,streaming:false};
    /* Q-R3-8: a tool the stop cut is `interrupted`; one that was still waiting for approval never ran (no duration). */
    if(item.kind==='tool'&&activeTool(item.status))return{...item,status:'interrupted' as const,endedAt:item.endedAt??(item.status==='approval'?item.startedAt:now)};
    return item;
  });
  return{...model,items,pendingApproval:null};
}

export function appendTranscriptMessage(model:TranscriptModel,input:{id?:string;role:'user'|'assistant';text:string}):TranscriptModel{
  const late=model.lateEcho;
  if(late&&!input.id&&input.role==='user'&&late.text===input.text&&existing(model,late.id,'message'))return{...model,lateEcho:null};
  let base=model,id=input.id?'message:'+input.id:'';
  if(!id){const next=localId(model,'message');id=next.id;base=next.model;}
  const current=existing(base,id,'message');
  return put(base,current?{...current,role:input.role,text:tail(input.text,MAX_MESSAGE_CHARS),streaming:false}:{kind:'message',id,role:input.role,text:tail(input.text,MAX_MESSAGE_CHARS),streaming:false});
}
/* Stage 3, MCP elicitation: the form's receipt, added by the screen when it sends (the kernel never journals the content). */
export function appendTranscriptAnswers(model:TranscriptModel,id:string,pairs:Array<{title:string;answer:string}>,{valuesOnScreenOnly=false}:{valuesOnScreenOnly?:boolean}={}):TranscriptModel{
  return put(model,{kind:'answers',id,pairs,...(valuesOnScreenOnly?{valuesOnScreenOnly:true as const}:{})});
}
export function appendTranscriptWarning(model:TranscriptModel,text:string,id?:string,detail?:string):TranscriptModel{
  let base=model,itemId=id?'warning:'+id:'';
  if(!itemId){const next=localId(model,'warning');itemId=next.id;base=next.model;}
  return put(base,{kind:'warning',id:itemId,text:tail(text,MAX_WARNING_CHARS),...(detail?{detail:tail(detail,MAX_WARNING_CHARS)}:{})});
}
/*
 * R2 lane E (gate E15): where an interrupted run stopped, read from THIS transcript (the kernel's stop point is Italian free
 * text). The last row of the run decides: a tool waiting for approval, a tool still running, or the model's answer.
 */
function stopPoint(model:TranscriptModel,run:TranscriptRun|null):StopPoint{
  const start=anchorIndex(model,run);
  for(let i=model.items.length-1;i>start;i--){
    const item=model.items[i]!;
    if(item.kind==='tool'){
      const tool=toolDisplay(item.name).label;
      if(item.status==='approval'||model.pendingApproval?.toolCallId===item.id.slice(5))return{kind:'approval',tool};
      if(activeTool(item.status))return{kind:'tool',tool};
      return null;
    }
    if((item.kind==='message'&&item.role==='assistant')||item.kind==='reasoning')return{kind:'answering'};
    if(item.kind==='run'||(item.kind==='warning'&&item.outcome))return null;
  }
  return null;
}
function stopPhrase(point:NonNullable<StopPoint>){
  if(point.kind==='answering')return t('error.run.while.answering');
  return point.kind==='approval'?t('error.run.while.approval',{tool:point.tool}):t('error.run.while.tool',{tool:point.tool});
}

/*
 * Stage 3 (owner 01-02/10, mockup «answers»/«notice»): answered or skipped ⇒ «Your answers» with every question (a skipped
 * one says so); cancelled by the person ⇒ one dim notice; expired ⇒ one dim notice. A close the system made because of
 * another action (stop, new message, redirect, not saved) adds nothing: that action is what the person sees. One receipt
 * per request, also when a replayed history brings the close twice.
 */
function questionsClosed(model:TranscriptModel,event:Extract<TuiEvent,{type:'question.resolved'}>):TranscriptModel{
  const {[event.requestId]:asked,...open}=model.questionTitles??{};
  const base:TranscriptModel={...model,questionTitles:open};
  if(event.status==='answered'||event.status==='skipped'){
    const id='answers:'+event.requestId;if(existing(base,id,'answers'))return base;
    const answers=event.status==='answered'?event.answers??{}:{};
    const titles=asked??Object.keys(answers).map(qid=>({id:qid,title:tabTitle({id:qid,question:''})}));
    const pairs=titles.map(q=>{const value=answers[q.id];return{title:q.title,answer:value===undefined?t('screen.question.receipt.skipped'):Array.isArray(value)?value.join(', '):String(value)};});
    return put(base,{kind:'answers',id,pairs});
  }
  const id='questions:'+event.requestId;
  if(event.status==='cancelled'&&event.reason===undefined)return existing(base,'warning:'+id,'warning')?base:appendTranscriptWarning(base,t('screen.question.cancelled'),id);
  if(event.status==='expired')return existing(base,'warning:'+id,'warning')?base:appendTranscriptWarning(base,t('screen.question.expired'),id);
  return base;
}

/* Stage 3 (mockup «domande del modello»): the question tool has no row of its own — the card stands for it while it waits,
   the receipt or the notice after — so its kernel result (JSON) is never drawn. */
export const QUESTION_TOOL='ask_user_question';
/* Stage 3 (mockup): the plan tool has no row either — the plan card while it waits, the approved plan after. */
export const PLAN_TOOL='present_plan';
export function reduceTranscriptEvent(model:TranscriptModel,event:TuiEvent):TranscriptModel{
  if(event.type==='plan.required')return{...model,planTexts:{...model.planTexts,[event.requestId]:event.content}};
  /* Stage 3, MCP elicitation (mockup notices): a decline and a person's cancel say so; a system close says nothing */
  if(event.type==='elicitation.required')return{...model,elicitServers:{...model.elicitServers,[event.requestId]:event.server}};
  if(event.type==='elicitation.resolved'){
    const {[event.requestId]:server,...open}=model.elicitServers??{};const base={...model,elicitServers:open};
    const id='elicit-notice:'+event.requestId;
    if(existing(base,'warning:'+id,'warning'))return base;
    if(event.action==='decline')return appendTranscriptWarning(base,t('screen.elicit.declined',{server:server??'mcp'}),id);
    if(event.action==='cancel'&&event.by==='person')return appendTranscriptWarning(base,t('screen.elicit.cancelled'),id);
    return base;
  }
  /* Stage 3 (owner 02/10): the dialogue names a child by its task, learnt from the agent's own announcements */
  if(event.type==='agent.changed'&&event.task){const tasks={...model.agentTasks,[event.childId]:event.task};return{...model,agentTasks:tasks};}
  if(event.type==='agent.dialogue'){
    const id='dialogue:'+event.requestId,current=existing(model,id,'dialogue');
    const base:TranscriptDialogueItem=current??{kind:'dialogue',id,childId:event.childId,task:model.agentTasks?.[event.childId]??null,direction:event.direction,question:event.question};
    return put(model,{...base,...(base.task===null&&model.agentTasks?.[event.childId]?{task:model.agentTasks[event.childId]!}:{}),
      ...(event.status==='answered'&&event.answer!==undefined?{answer:event.answer}:{}),...(event.status==='cancelled'?{cancelled:event.reason??''}:{})});
  }
  if(event.type==='plan.resolved'){
    const {[event.requestId]:content,...open}=model.planTexts??{};const base={...model,planTexts:open};
    const id='plan:'+event.requestId;
    /* mockup: only an approval leaves the plan; «keep planning» and a cancel leave nothing */
    if(event.status!=='approved'||content===undefined)return base;/* put keeps one item per id: a replayed approval replaces, never doubles */
    return put(base,{kind:'plan',id,steps:planSteps(content),content});
  }
  if(event.type==='tool.started'&&(event.toolName===QUESTION_TOOL||event.toolName===PLAN_TOOL)){
    const id=toolId(event.toolCallId);
    return{...model,items:model.items.filter(item=>item.id!==id),hiddenTools:{...model.hiddenTools,[event.toolCallId]:true}};
  }
  if(event.type.startsWith('tool.')&&'toolCallId' in event&&model.hiddenTools?.[String(event.toolCallId)])return model;
  if(event.type==='message.started'){
    const id='message:'+event.messageId,current=existing(model,id,'message');
    return put(model,current?{...current,role:event.role}:{kind:'message',id,role:event.role,text:'',streaming:true});
  }
  if(event.type==='message.delta'){
    const id='message:'+event.messageId,current=existing(model,id,'message');
    return put(model,current?{...current,text:tail(current.text+event.delta,MAX_MESSAGE_CHARS),streaming:true}:{kind:'message',id,role:'assistant',text:tail(event.delta,MAX_MESSAGE_CHARS),streaming:true});
  }
  if(event.type==='message.end'){
    const id='message:'+event.messageId,current=existing(model,id,'message');
    return current?put(model,{...current,streaming:false}):model;
  }
  if(event.type==='reasoning.started'){
    const id='reasoning:'+event.messageId,current=existing(model,id,'reasoning');
    return current?model:put(model,{kind:'reasoning',id,text:'',streaming:true,startedAt:liveClock(model)});
  }
  if(event.type==='reasoning.delta'){
    const id='reasoning:'+event.messageId,current=existing(model,id,'reasoning');
    return put(model,current?{...current,text:tail(current.text+event.delta,MAX_MESSAGE_CHARS),streaming:true}:{kind:'reasoning',id,text:tail(event.delta,MAX_MESSAGE_CHARS),streaming:true,startedAt:liveClock(model)});
  }
  if(event.type==='reasoning.end'){
    const id='reasoning:'+event.messageId,current=existing(model,id,'reasoning');
    return current?put(model,endReasoning(current)):model;
  }
  if(event.type==='context.summary.requested'){const live=runsOf(model).filter(run=>run.status==='running').at(-1);return live?setRun(model,{...live,summaryRequests:(live.summaryRequests??0)+1}):model;}
  if(event.type==='context.compaction.paused')return appendTranscriptWarning(model,compactionPausedText(event),event.noticeId?`paused:${event.noticeId}`:event.eventId?`paused:${event.eventId}`:undefined);
  if(event.type==='context.compacted'){
    const live=event.engine==='context-engine'?runsOf(model).filter(run=>run.status==='running').at(-1):undefined;
    const base=live?setRun(model,{...live,summaryAccepted:true}):model;
    /* 0.6.13: keyed by the kernel record's `at` when known, so its annulment can find it */
    return appendTranscriptWarning(base,compactionNoticeText(event),event.at?`compaction-at:${event.at}`:event.eventId?`compaction:${event.eventId}`:undefined);
  }
  /* 0.6.13 (kernel a2739656d): a free summary named in a turn that then failed was annulled; its line is taken back, so the screen
     never says «shortened» next to «Nothing was summarized» */
  if(event.type==='context.compaction.undone')return{...model,items:model.items.filter(item=>item.id!==`warning:compaction-at:${event.at}`)};
  if(event.type==='tool.output.saved'){const saved=savedOutputOf(event);return saved?toolFacts(model,event.toolCallId,{savedOutput:saved}):model;}
  if(event.type==='tool.read.cut'){const cut=readCutOf(event);return cut?toolFacts(model,event.toolCallId,{readCut:cut}):model;}
  if(event.type==='tool.started'){
    const current=existing(model,toolId(event.toolCallId),'tool');
    /* A row made by an early `tool.args`/`tool.output` carries the placeholder name until its start names the tool. */
    /* A5j cure, second line: the same id started again after a no runs now (a provider may repeat an id), so it is no longer the refused row */
    if(current?.status==='denied')return put(model,{...current,status:'running',finalOutput:''});
    if(current)return current.name==='tool'&&event.toolName!=='tool'?put(model,{...current,name:event.toolName}):model;
    return newTool(model,event.toolCallId,{name:event.toolName,status:'queued',argsText:'',liveOutput:'',finalOutput:'',startedAt:Date.now(),endedAt:null,outcome:null});
  }
  if(event.type==='tool.args'){
    const current=existing(model,toolId(event.toolCallId),'tool');
    return current?put(model,{...current,argsText:tail(current.argsText+event.delta,MAX_TOOL_SUMMARY_CHARS)}):newTool(model,event.toolCallId,{name:'tool',status:'queued',argsText:tail(event.delta,MAX_TOOL_SUMMARY_CHARS),liveOutput:'',finalOutput:'',startedAt:Date.now(),endedAt:null,outcome:null});
  }
  if(event.type==='tool.output'){
    const current=existing(model,toolId(event.toolCallId),'tool');
    return current?put(model,{...current,status:'streaming',liveOutput:tail(current.liveOutput+event.delta,MAX_TOOL_SUMMARY_CHARS)}):newTool(model,event.toolCallId,{name:'tool',status:'streaming',argsText:'',liveOutput:tail(event.delta,MAX_TOOL_SUMMARY_CHARS),finalOutput:'',startedAt:Date.now(),endedAt:null,outcome:null});
  }
  if(event.type==='tool.completed')return terminalTool(model,event.toolCallId,event.content,event.outcome??null);
  if(event.type==='tool.origin')return toolFacts(model,event.toolCallId,{origin:event.origin});
  if(event.type==='tool.decision')return toolFacts(model,event.toolCallId,{decision:event.decision});
  if(event.type==='tool.facts')return toolFacts(model,event.toolCallId,{facts:event.facts});
  if(event.type==='file.changed')return'change' in event&&event.change?fileChanged(model,event.change):model;
  if(event.type==='approval.required'){
    if(!event.toolCallId)return model;
    const id=toolId(event.toolCallId),current=existing(model,id,'tool');
    const next=current?put(model,{...current,status:'approval',askedPerson:true}):model;
    return{...next,pendingApproval:{requestId:event.requestId,toolCallId:event.toolCallId}};
  }
  if(event.type==='question.required'){
    const titles=event.questions.filter(q=>typeof q?.id==='string').map(q=>({id:q.id,title:tabTitle(q)}));
    return{...model,questionTitles:{...model.questionTitles,[event.requestId]:titles}};
  }
  if(event.type==='question.resolved')return questionsClosed(model,event);
  if(event.type==='approval.resolved'){
    const pending=model.pendingApproval;
    if(!pending||pending.requestId!==event.requestId)return model;
    const id=toolId(pending.toolCallId),current=existing(model,id,'tool');
    let next=model;
    if(current){
      /* R3: an approved tool starts running now — its running clock does not count the time the person took to answer. */
      if(event.approved===true)next=put(model,{...current,status:'running',startedAt:Date.now()});
      /* R3 gate E9: the person's "no" is `denied` with its English reason until the receipt names the exact one. */
      else if(event.approved===false)next=put(model,{...current,status:'denied',endedAt:current.endedAt??Date.now(),finalOutput:current.finalOutput||t('error.refused.notApproved')});
    }
    return{...next,pendingApproval:null};
  }
  if(event.type==='warning')return appendTranscriptWarning(model,event.message,event.eventId,event.raw);
  /* F-Q1 (owner 03/10, «Come Claude Code, completo»): a queued item enters the conversation where the kernel delivered it — a
     person's message as their own message, a sub-agent's result as its agent row. While it waits it is not a transcript item. */
  if(event.type==='queue.delivered'){
    const key=event.id||event.eventId||'';if(!key)return model;
    if(event.origin==='person'&&event.text)return existing(model,`message:queue:${key}`,'message')?model:put(model,{kind:'message',id:`message:queue:${key}`,role:'user',text:tail(event.text,MAX_MESSAGE_CHARS),streaming:false,...(event.device!==undefined?{device:event.device}:{})});
    if(event.origin==='delegation'&&event.result&&event.childId){const id=`agent:queue:${key}:${event.childId}`;return existing(model,id,'agent')?model:put(model,{kind:'agent',id,childId:event.childId,status:event.result.status,task:event.result.task,summary:tail(event.result.summary??'',MAX_MESSAGE_CHARS)});}
    return model;
  }
  /* 0.6.13: the request of this turn was not sent (it did not fit the model): its message keeps the mark */
  if(event.type==='request.not_sent')return markNotSent(model,runsOf(model).at(-1)??null);
  if(event.type==='run.started'){
    let base=model,key=event.runId??event.eventId??'';
    if(!key){const next=localId(model,'run');key=next.id.slice(4);base=next.model;}
    if(event.prompt)base=adoptOrAddPrompt(base,key,event.prompt,event.history===true,event.device);
    /* ASYNC step 2: the turn the kernel started to hand the main agent its agents' results draws one row per child */
    for(const result of event.delegation??[])base=put(base,{kind:'agent',id:`agent:${key}:${result.childId}`,childId:result.childId,status:result.status,task:result.task,summary:tail(result.summary,MAX_MESSAGE_CHARS)});
    const known=runsOf(base).find(run=>run.key===key);
    return setRun(base,known?{...known,status:'running'}:{key,runId:event.runId??null,status:'running',history:event.history===true,anchor:base.items.at(-1)?.id??null});
  }
  if(event.type==='run.completed'||event.type==='run.failed'||event.type==='run.cancelled'){
    const run=findRun(model,event);
    let base=model,key=run?.key??event.runId??event.eventId??'';
    if(!key){const next=localId(model,'run');key=next.id.slice(4);base=next.model;}
    const noticeId='run:'+key;
    /* R5b: before the run's own ending line, the summaries it asked for and none accepted (each one billed). */
    const current=run?runsOf(model).find(entry=>entry.key===run.key)??run:null;
    if(current?.summaryRequests&&!current.summaryAccepted)base=appendTranscriptWarning(base,tn('screen.compaction.summaryNotAccepted',current.summaryRequests),`summary:${key}`);
    const settle=(next:TranscriptModel,status:TranscriptRun['status'])=>run?setRun(next,{...(current??run),status}):next;
    /* Q-R3-9: a turn that ended normally leaves no line; one that a stop had marked but then completed drops the mark. */
    if(event.type==='run.completed')return settle(closeReasoning({...base,items:base.items.filter(item=>!(item.id===noticeId&&item.kind==='warning'))}),'completed');
    if(event.type==='run.failed'){
      base=closeReasoning(base);
      /* R2 lane E: a failure is worded from its CODE with the stop point of this transcript; the kernel text is the detail. */
      const view=event.error?describeError(event.error,{stopPoint:stopPoint(base,run),screen:true}):null;
      /* 0.6.13: a request too large for the model was not sent; its message says so even before the kernel's durable mark */
      if(event.error&&isRequestTooLarge(event.error))base=markNotSent(base,run);
      const text=tail(view?errorViewLines(view).join('\n'):event.message,MAX_WARNING_CHARS);
      const detail=view?.raw??null;
      /* 0.6.6 (owner 14/10, the stress test: «dice failed, sembra un errore… è in grigio»): the plan's limit is an alert */
      const alert=view?.code==='CHATGPT_PLAN_LIMIT';
      return settle(put(base,{kind:'warning',id:noticeId,text,outcome:'failed',...(detail?{detail:tail(detail,MAX_WARNING_CHARS)}:{}),...(alert?{alert:true as const}:{})}),'failed');
    }
    /* Q-R3-8: an interrupt is one neutral line naming where it stopped. A replayed run the kernel reports cut off (TALOS
       closed mid-answer, R1 lane R D-08) says so; the stop closes whatever the run left streaming. */
    const point=stopPoint(base,run);
    const text=event.interrupted===true&&run?.history?t('tool.turn.closed'):point?t('tool.turn.interruptedWhile',{while:stopPhrase(point)}):t('tool.turn.interrupted');
    return settle(put(closeInterrupted(base),{kind:'warning',id:noticeId,text,outcome:'interrupted'}),'interrupted');
  }
  return model;
}
