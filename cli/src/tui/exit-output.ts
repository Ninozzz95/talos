import {sanitizeTranscriptText,type TranscriptItem} from './transcript-model.ts';
import {toolRowView} from './components/tool-row.ts';
import {agentResultHeader} from './components/agent-result.ts';
import {answersExitText} from './components/question-receipt.ts';
import {planReceiptText} from './components/plan-receipt.ts';
import {dialogueText} from './components/agent-dialogue.ts';

/*
 * R1 E10 / Q-R1-4. What TALOS leaves in the scrollback after it has left the alternate screen: the conversation as
 * plain text ("transcript", Pi's default `fullscreenExitOutput`, interactive-mode.ts:835-842 + :4172-4175 @a328aa8
 * 2026-09-23), or only the resume line ("resume"). Pure: run.ts decides when and where to write it.
 */
export type ExitOutputMode='transcript'|'resume';
export type TuiExitSnapshot={sessionId:string|null;items:readonly TranscriptItem[]};

/* The resume line is pasted into a shell, so the id must be one shell word: the pattern `talos session import`
   already enforces for archive ids (session-cli.ts), no leading dash, no `..`. */
const SESSION_ID=/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const TOOL_ARGS_MAX=72;
/* R3 gate E1: a tool row is the ONE row formatter's line, fitted to this width (the target is cut in the middle first). */
export const EXIT_TOOL_WIDTH=120;
const hasText=(item:TranscriptItem)=>item.kind==='message'&&item.text.trim().length>0;

/** The id worth printing as `talos --resume <id>`: valid, and only for a session that holds a message (Qwen gating,
 *  startInteractiveUI.tsx:421-449 @2026-09-15, gate C10). */
export function resumableSessionId(snapshot:TuiExitSnapshot|null):string|null{
  const id=snapshot?.sessionId;
  if(!id||!SESSION_ID.test(id)||id.includes('..'))return null;
  return snapshot.items.some(hasText)?id:null;
}

const oneLine=(value:string,max:number)=>{const text=sanitizeTranscriptText(value).replace(/\s+/gu,' ').trim();return text.length>max?text.slice(0,max-1)+'…':text;};

export function formatExitOutput(snapshot:TuiExitSnapshot|null,{mode='transcript',color=false}:{mode?:ExitOutputMode;color?:boolean}={}):string{
  if(!snapshot||!snapshot.items.some(hasText))return '';
  const bold=(text:string)=>color?`\u001b[1m${text}\u001b[22m`:text;
  const dim=(text:string)=>color?`\u001b[2m${text}\u001b[22m`:text;
  const id=resumableSessionId(snapshot);
  const resume=id?`${dim('To resume this session:')} talos --resume ${id}\n`:'';
  if(mode==='resume')return resume;
  /* Blocks are separated by one blank line; consecutive one-line rows (tools, run outcomes) stay together. Reasoning
     and local notices (help, /status, warnings) are screen chrome, not the conversation, so they are left out. */
  const blocks:string[][]=[];let rows:string[]|null=null;
  const row=(text:string)=>{if(!rows){rows=[];blocks.push(rows);}rows.push(dim(text));};
  for(const item of snapshot.items){
    if(item.kind==='message'){
      if(!hasText(item))continue;
      rows=null;blocks.push([bold(item.role==='user'?'You':'TALOS'),...sanitizeTranscriptText(item.text).replace(/\s+$/u,'').split('\n')]);
    }else if(item.kind==='tool'){
      /* R3 gate E1 (R2 Q-R2-3 kept): the same header row as the screen — English label, primary argument, facts; never the
         kernel name, raw JSON or the enum. The detail lines stay on the screen. */
      row(toolRowView(item,EXIT_TOOL_WIDTH,false).line);
    }else if(item.kind==='agent'){
      /* ASYNC step 2: a delegated agent's result is part of the conversation — its header row, like a tool's */
      row(oneLine(agentResultHeader(item),EXIT_TOOL_WIDTH));
    }else if(item.kind==='dialogue'){
      /* Stage 3: the agents' exchange is part of the conversation — its rows, as data */
      for(const line of dialogueText(item).split('\n'))row(oneLine(line,EXIT_TOOL_WIDTH));
    }else if(item.kind==='plan'){
      /* Stage 3: the approved plan is part of the conversation — its header and steps */
      for(const line of planReceiptText(item).split('\n'))row(oneLine(line,EXIT_TOOL_WIDTH));
    }else if(item.kind==='answers'){
      /* Stage 3: the person's answers are part of the conversation — the receipt's rows */
      for(const line of answersExitText(item).split('\n'))row(oneLine(line,EXIT_TOOL_WIDTH));
    }else if(item.kind==='warning'&&item.outcome){
      /* R3 Q-R3-8/9: a turn that did not end normally leaves its one line (its first line: the headline). */
      row(oneLine(item.text.split(/\r?\n/u)[0]??'',EXIT_TOOL_WIDTH));
    }else if(item.kind==='run'&&(item.status==='failed'||item.status==='cancelled')){
      const message=oneLine(item.message.split(/\r?\n/u)[0]??'',TOOL_ARGS_MAX);
      row(`Run ${item.status}${message?` · ${message}`:''}`);
    }
  }
  return blocks.map(block=>block.join('\n')+'\n').join('\n')+(resume?`\n${resume}`:'');
}
