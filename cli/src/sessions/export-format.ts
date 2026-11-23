/*
 * R5b D1 (owner decision Q-R5-12, gate E16): a session as Markdown that a person can read — their own messages, TALOS's
 * answers and the tools in English with their target, in order. Before R5b `session-cli.ts` exportMarkdown wrote only the
 * model's text deltas and `> Tool: leggi`: the person's messages (kept by the kernel only as `RunStarted.input`, R1 lane R)
 * were lost. Secrets are redacted with the same redactor the rest of the CLI uses. Shared by `talos session export --format
 * md` and the TUI's `/export`. JSON and JSONL stay the kernel's own lossless rows.
 */
import {createRedactor} from '../diagnostics/redact.ts';
import {describeError,errorViewLines} from '../i18n/error-view.ts';
import {runPrompt} from '../tui/event-adapter.ts';
import {toolDisplay} from '../tui/tool-display.ts';

type Row=Record<string,any>;
const text=(value:unknown)=>typeof value==='string'?value:'';

/* Stage 7.7 (mockup /export «Tool output», «Thinking»; OpenCode «Include tool details», «Include thinking»): what each tool
   returned (in a fence longer than any it contains) and TALOS's thinking (as a quote), only when asked. */
const fenced=(body:string)=>{const longest=Math.max(2,...[...body.matchAll(/`+/gu)].map(match=>match[0].length));const fence='`'.repeat(longest+1);return `${fence}text\n${body.replace(/\s+$/u,'')}\n${fence}`;};
export function exportMarkdown(payload:{sessionId?:unknown;name?:unknown;eventi?:unknown},{secrets=[],toolOutput=false,thinking=false}:{secrets?:readonly string[];toolOutput?:boolean;thinking?:boolean}={}):string{
  const redactor=createRedactor(secrets);
  const title=text(payload?.name).trim();
  const out:string[]=[`# TALOS session ${text(payload?.sessionId)}${title?` · ${title}`:''}`];
  const events:Row[]=Array.isArray(payload?.eventi)?payload.eventi as Row[]:[];
  const answers=new Map<string,string>(),toolNames=new Map<string,string>(),toolArgs=new Map<string,string>(),thoughts=new Map<string,string>();
  let speaker:'you'|'talos'|null=null;
  const say=(who:'you'|'talos',body:string)=>{
    if(!body.trim())return;
    if(speaker!==who){out.push('',who==='you'?'## You':'## TALOS','');speaker=who;}
    out.push(body.trim());
  };
  const toolLine=(id:string)=>{
    const name=toolNames.get(id)??'tool';let args:Record<string,unknown>={};
    try{const parsed=JSON.parse(toolArgs.get(id)??'{}');if(parsed&&typeof parsed==='object')args=parsed;}catch{args={};}
    const shown=toolDisplay(name,args);
    return `- ${[shown.label,shown.primaryArg].filter(Boolean).join(' ')}`;
  };
  for(const event of events){
    const type=text(event?.type);
    if(type==='RunStarted'){const prompt=runPrompt(event.input);if(prompt)say('you',prompt);continue;}
    if(type==='TextMessageStart'){if(event.role==='user')continue;answers.set(text(event.messageId),'');continue;}
    if(type==='TextMessageContent'){const id=text(event.messageId);if(answers.has(id)||!id)answers.set(id,(answers.get(id)??'')+text(event.delta));continue;}
    if(type==='TextMessageEnd'){const id=text(event.messageId);say('talos',answers.get(id)??'');answers.delete(id);continue;}
    if(type==='ToolCallStart'){toolNames.set(text(event.toolCallId),text(event.toolCallName)||text(event.name));toolArgs.set(text(event.toolCallId),'');continue;}
    if(type==='ToolCallArgs'){const id=text(event.toolCallId);toolArgs.set(id,(toolArgs.get(id)??'')+text(event.delta));continue;}
    if(type==='ToolCallEnd'){const id=text(event.toolCallId);if(toolNames.has(id)){say('talos',toolLine(id));toolNames.delete(id);}continue;}
    if(type==='ReasoningMessageContent'){const id=text(event.messageId);thoughts.set(id,(thoughts.get(id)??'')+text(event.delta));continue;}
    if(type==='ReasoningMessageEnd'){const id=text(event.messageId);const body=thoughts.get(id)??'';thoughts.delete(id);if(thinking&&body.trim())say('talos',body.trim().split(/\r?\n/u).map(line=>`> ${line}`).join('\n'));continue;}
    if(type==='ToolCallResult'){if(toolOutput){const body=typeof event.content==='string'?event.content:JSON.stringify(event.content??'');if(body.trim())say('talos',fenced(body));}continue;}
    if(type==='RunError'){say('talos',`**${errorViewLines(describeError({code:event.code,message:event.message}))[0]??'The run failed.'}**`);continue;}
  }
  /* An answer still streaming when the log ended is kept, not dropped. */
  for(const body of answers.values())say('talos',body);
  for(const id of toolNames.keys())say('talos',toolLine(id));
  return redactor.text(`${out.join('\n')}\n`);
}
