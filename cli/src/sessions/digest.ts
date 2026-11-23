/*
 * Stage 7.5 (owner 03/10, «Tutto, lato CLI»; mockup PANELS.resume «48 messages · …» and «Last exchange»): how many messages a
 * conversation has and its last exchange, read from the session's events the way export-format.ts reads them — your messages
 * are `RunStarted.input`, TALOS's are the assistant text messages (an empty one is not a message; one cut off when the log
 * ended still is). Pure: the events are the kernel's, already in memory (`esporta`).
 */
import {runPrompt} from '../tui/event-adapter.ts';

/* `branch`: the kernel's own, from the last turn that says it (RunStarted.contesto.branch, agent-service.mjs: read from git's
   files by workspace-context.mjs); null for a detached HEAD or no checkout. */
export type SessionDigest={messages:number;you:string|null;answer:string|null;branch:string|null};
const text=(value:unknown)=>typeof value==='string'?value:'';

export function sessionDigest(events:unknown):SessionDigest{
  const rows:Array<Record<string,any>>=Array.isArray(events)?events:[];
  let messages=0,you:string|null=null,answer:string|null=null,branch:string|null=null;
  const open=new Map<string,string>();
  const said=(body:string)=>{const value=body.trim();if(!value)return;messages+=1;answer=value;};
  for(const event of rows){
    const type=text(event?.type);
    if(type==='RunStarted'){
      const said=event.contesto&&typeof event.contesto==='object'&&'branch' in event.contesto?event.contesto.branch:undefined;
      if(said!==undefined)branch=typeof said==='string'&&said.trim()?said.trim():null;
      const prompt=runPrompt(event.input)?.trim();if(prompt){messages+=1;you=prompt;answer=null;}continue;
    }
    if(type==='TextMessageStart'){if(event.role!=='user')open.set(text(event.messageId),'');continue;}
    if(type==='TextMessageContent'){const id=text(event.messageId);if(open.has(id))open.set(id,open.get(id)!+text(event.delta));continue;}
    if(type==='TextMessageEnd'){const id=text(event.messageId);if(open.has(id)){said(open.get(id)!);open.delete(id);}continue;}
  }
  for(const body of open.values())said(body);
  return{messages,you,answer,branch};
}

/* Stage 7.6 (mockup PANELS.fork «latest», «1 back»): your messages with the turn each one started, newest first — the point a
   fork can start from. A turn without a message (or without its id) is not one. */
export type SessionTurn={runId:string;text:string};
export function sessionTurns(events:unknown):SessionTurn[]{
  const rows:Array<Record<string,any>>=Array.isArray(events)?events:[];const out:SessionTurn[]=[];
  for(const event of rows){if(text(event?.type)!=='RunStarted')continue;const runId=text(event.runId);const prompt=runPrompt(event.input)?.trim();if(runId&&prompt)out.push({runId,text:prompt});}
  return out.reverse();
}
