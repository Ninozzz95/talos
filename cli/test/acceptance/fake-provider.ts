/**
 * Scripted fake model server for the rendered-frame acceptance layer.
 *
 * It listens on 127.0.0.1 on an ephemeral port (port 0) and speaks the two dialects TALOS uses for the
 * `ollama` provider: the OpenAI-compatible `POST /v1/chat/completions` (SSE when `stream` is true, with the
 * final `choices: []` usage chunk before `[DONE]`, gate E17) and the Ollama catalogue routes `GET /api/tags`,
 * `POST /api/show`, `GET /v1/models`. No real provider is ever contacted: the harness points TALOS at this
 * server through `OLLAMA_BASE_URL`.
 *
 * Behaviour is keyed by a keyword in the LAST user message:
 *   MD     a Markdown answer (heading, list, table with an alignment colon, code block, quote, numbered list)
 *   SLOW   a long answer streamed in small chunks (250 ms apart) so busy states can be observed
 *   THINK  reasoning in five slow pieces (400 ms apart), then `Thought it through.` (UI Phase 1 live preview)
 *   STALL  titled reasoning, `First part. `, 33 s of silence, `Second part after the silence.` (stage 4 activity line)
 *   TOOLS  three tool calls in turn (read README.md, shell `cmd /c dir /b`, write notes.txt), then a final answer
 *   ERR429 HTTP 429 with `Retry-After: 7`;  ERR500 HTTP 500;  ERR401 / ERR403 / ERR404 the client failures (R2 lane E)
 *   R5a (gate §16, Q-R5-6/10/11/17):
 *   RETRY    HTTP 429 with `Retry-After: 2` for the first two requests of the turn, then the answer `Recovered after retries.`
 *   HUGE     one shell command printing 3,000 lines (about 50,000 characters), then a final answer
 *   BIGREAD  one read of `big.txt` (the scenario puts 3,000 numbered lines there), then a final answer
 *   DENYRULE one shell command the policy refuses without asking (`cmd /c for /L …`, R5 gate finding 15), then an answer
 *   COMPACTME ten reads of c1.txt … c10.txt (about 9 KB each), then `Done: read ten files.`
 *   PLANWRITE:<tool> (s66) one call to `scrivi`, `shell` or `file_edit` even when the request does not offer it (plan mode),
 *            then `Tool said: <the result>`; with GENTLY, 4 s of reasoning come first so the mode can change mid-turn
 *   BGWAKE / BGHOLD (s68) one `shell` call whose command (a node one-liner, 3 s / 60 s) outlives its `timeout` of 1 s, then
 *            `Started: it goes on in the background.`
 *   ASKLATE (s69) one simple question; then `Went on without an answer: assumed SQLite.` when the tool result says nobody answered in time
 *   anything else: the answer `OK`
 * Every request is recorded in memory (`requests`) so a scenario can assert what TALOS actually sent.
 */
import http from 'node:http';
import type {AddressInfo} from 'node:net';

export const FAKE_MODEL='qwen3-coder-test';
export const FAKE_USAGE={prompt_tokens:1200,completion_tokens:340,total_tokens:1540};

export const MARKDOWN_ANSWER=`## Summary of the project

This repository contains **two files** and a small entry point.

- \`README.md\` — the project description
- \`src/index.js\` — prints a greeting

| File | Lines | Purpose |
|---|---:|---|
| README.md | 1 | docs |
| src/index.js | 1 | entry |

\`\`\`js
// src/index.js
console.log('hi');
\`\`\`

> Tip: run \`node src/index.js\` to try it.

1. First step
2. Second step with a very long line that should wrap nicely inside the transcript without breaking the layout of the terminal user interface at all
`;
export const SLOW_ANSWER='This answer streams slowly so the interface can be observed while it is still arriving. '.repeat(6);
export const WRITE_CONTENT='hello from the fake model\nsecond line\n';

/* R5a: `toolTexts` keeps, for each tool result of the current turn, its length, its last 800 characters and its text (up to
   60,000 characters: TALOS's marker may sit between the kept head and tail), so a scenario
   can read the marker TALOS appends for the model (Q-R5-10/11); `attempt` counts the requests of the same turn. */
export type ToolText={length:number;tail:string;text:string};
export type RecordedRequest={at:number;method:string;url:string;/** 0.6.11: what the request weighed (characters of its JSON body, and of its tools alone) */bodyChars?:number;toolsChars?:number;/** 0.6.11 s78: the system messages, up to 4,000 characters each (the kernel's «where you are» note) */systemTexts?:string[];lastUser?:string;tools?:string[];toolResults?:number;stream?:boolean;streamUsage?:boolean;toolTexts?:ToolText[];attempt?:number;/** s68: the raw last user message, up to 4,000 characters (a wake names the command) */rawUser?:string};
export type FakeProvider={url:string;port:number;requests:RecordedRequest[];chatRequests:()=>RecordedRequest[];close:()=>Promise<void>};

/* `pauseMs`: this row's own wait after it is sent, in place of the plan's `delayMs` (stage 4: a silence of the model). */
type Row={content?:string;reasoning?:string;toolCall?:{id:string;name:string;arguments:Record<string,unknown>};pauseMs?:number};
const sleep=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
const toolName=(tool:any):string=>String(tool?.function?.name??tool?.name??'');
/* 0.6.11 (deferred tools on by default): the tools used only on request are not in the request's list; the kernel's bridge
   (ponte-attrezzi.mjs) lists their names in the description of `tool_search`, one «- name: what it does» line each, and runs
   one through `tool_call` ({name, arguments}). */
const deferredNames=(tools:readonly any[]):string[]=>String(tools.find((t:any)=>toolName(t)==='tool_search')?.function?.description??'').split('\n').map(line=>/^- ([a-z_][a-z0-9_]*):/u.exec(line)?.[1]).filter((name):name is string=>Boolean(name));
/** A call to `name` as the model makes it: directly when the tool is in the list, through the bridge when it is deferred. */
const callOf=(tools:readonly any[],id:string,name:string,args:Record<string,unknown>):Row|null=>tools.some((t:any)=>toolName(t)===name)?{toolCall:{id,name,arguments:args}}:deferredNames(tools).includes(name)?{toolCall:{id,name:'tool_call',arguments:{name,arguments:args}}}:null;
/* Stage 3: the approved mockup's plan (golden frames step-04-permessi-e-piano-*). */
export const PLAN_TEXT=['1. Move the resize pipeline into src/export/worker.ts','2. Post jobs through a bounded queue (4 at a time)','3. Keep the sync path for files under 1 MB','4. Add a test that exports 50 images without blocking the event loop'].join('\n');
/* Stage 3: the approved mockup's questions (golden frames step-03-domande-del-modello-*), as the model sends them. */
export const ASK_QUESTIONS=[
 {id:'fix',header:'Fix',question:'How should the test wait for the session?',why:'This decides whether the test or the product changes.',options:[
  {label:'Wait for the cookie',description:'replace the sleep with waitForSession(); product unchanged',recommended:true,preview:'-  await page.waitForTimeout(500)\n+  await waitForSession(page)'},
  {label:'Shorten the retry',description:'cap the jitter in refreshSession(); faster, changes the product',preview:'-  const jitter = rand(0, 900)\n+  const jitter = rand(0, 300)'},
  {label:'Both',description:'robust test and a shorter worst case',preview:'+  await waitForSession(page)\n+  const jitter = rand(0, 300)'}]},
 {id:'scope',header:'Verify',question:'Which checks should TALOS run after the fix?',why:'More checks take longer but catch regressions elsewhere.',multiSelect:true,options:[
  {label:'Login e2e, 10 runs',description:'proves the flake is gone',recommended:true},{label:'All auth unit tests',description:'about 40 s'},{label:'Full e2e suite',description:'about 6 min'}]},
 {id:'note',header:'Commit',question:'Commit the change when the checks pass?',why:'TALOS never commits without your say.',options:[
  {label:'Commit locally',description:'one commit, message drafted by TALOS',recommended:true},{label:'Leave it uncommitted',description:'you review the diff first'}]}];
/* Stage 6b: the mockup's question from a sub-agent (scene at 6 s), one question with one choice: answered on the agents page. */
export const AGENT_QUESTION={id:'sandbox',header:'Sandbox',question:'Should the declined-payment test hit the real sandbox, or a local fake?',why:'It decides whether the test needs the network.',options:[
 {label:'Local fake (fast, no network)',description:'no calls leave the machine',recommended:true},{label:'Stripe test sandbox',description:'real calls to the test API'}]};
const toolProperties=(tool:any):Record<string,unknown>=>tool?.function?.parameters?.properties??tool?.parameters?.properties??{};
function textOf(content:unknown):string{
  if(typeof content==='string')return content;
  if(Array.isArray(content))return content.map((part:any)=>typeof part?.text==='string'?part.text:'').join('');
  return '';
}
function chunks(text:string,size:number):string[]{const out:string[]=[];for(let i=0;i<text.length;i+=size)out.push(text.slice(i,i+size));return out;}
/** Fill the tool's own argument names (TALOS's kernel uses `percorso`, `comando`, `contenuto` today; English names later). */
function argumentsFor(tool:any,wanted:Array<{pattern:RegExp;value:string}>):Record<string,unknown>{
  const names=Object.keys(toolProperties(tool));const out:Record<string,unknown>={};
  for(const {pattern,value} of wanted){const name=names.find(n=>pattern.test(n));if(name)out[name]=value;}
  return out;
}

type Plan={status:number;headers?:Record<string,string>;error?:string;rows:Row[];delayMs:number;finish?:string};
/** The scripted plan for one request. Exported so the self-test can check it without a socket. */
/*
 * r4 (kernel c722f55c9, «merge consecutive user messages only toward a local engine»): after a turn that FAILED there is no answer
 * between the person's two messages, and toward a local engine (this fake is one, `ollama:`) the kernel sends them as ONE user
 * message joined by a blank line, so a strict chat template still sees the roles alternate. The scripts here key on what the
 * person typed LAST: measured on 13/10/2026, `ERR404 please` then `ERR429 please` reached the fake as
 * "ERR404 please\n\nERR429 please" and was answered 404 again. `typedLast` gives back the part that is new: the text after
 * the longest earlier user text this fake has already been sent. A prompt with blank lines of its own is left whole.
 */
export function typedLast(raw:string,seen:readonly string[]):string{
  let prefix='';
  for(const earlier of seen)if(earlier.length>prefix.length&&raw.length>earlier.length+2&&raw.startsWith(`${earlier}\n\n`))prefix=earlier;
  if(prefix)return raw.slice(prefix.length+2);
  /* the same merge after /compact: the summary is a user message too, and the person's next message follows it in the same one
     (measured: "[conversation compacted at turn 8: …]\n\nOK\n\nContinua 60, grazie.") */
  if(raw.startsWith('[conversation compacted at turn ')&&raw.includes('\n\n'))return raw.slice(raw.lastIndexOf('\n\n')+2);
  return raw;
}
export function planResponse(body:any,{attempt=1,lastUser}:{attempt?:number;/** what the person typed last, when the caller worked it out (`typedLast`) */lastUser?:string}={}):Plan{
  /* Tool call ids are unique per turn, as a real provider's are: a script that runs twice in one session (TOOLS, then
     TOOLS again) must not hand TALOS the ids of the earlier turn's rows. */
  const turn=(Array.isArray(body?.messages)?body.messages:[]).filter((m:any)=>m?.role==='user').length;
  const plan=planFor(body,attempt,lastUser);
  return{...plan,rows:plan.rows.map(row=>row.toolCall?{...row,toolCall:{...row.toolCall,id:`${row.toolCall.id}_${turn}`}}:row)};
}
function planFor(body:any,attempt:number,typed?:string):Plan{
  const messages=Array.isArray(body?.messages)?body.messages:[];
  const lastUser=typed??textOf([...messages].reverse().find((m:any)=>m?.role==='user')?.content);
  const tools=Array.isArray(body?.tools)?body.tools:[];
  /* Tool results of THIS turn only (after the last user message): a scenario that runs several tool turns in one
     session would otherwise start each later plan past its end and answer at once without calling a tool. */
  const lastUserAt=messages.map((m:any)=>m?.role).lastIndexOf('user');
  const toolResults=messages.slice(lastUserAt+1).filter((m:any)=>m?.role==='tool').length;
  /* R5a Q-R5-4: the Context Engine's own summary request. Its last user message is a JSON task naming the records to
     summarise (`sourceIds`) and their text (`untrustedSource`: "<id> (<role>)\n<text>\n…"); the answer is a summary in the
     engine's format (context-engine contracts.mjs ContextSummaryV1) quoting the first record's first line. Any other text is
     refused as CTX_INVALID_SUMMARY/SOURCE, and the engine then retries at every request (measured in s22, ledger R5a). */
  let task:any=null;try{task=lastUser.trimStart().startsWith('{')?JSON.parse(lastUser):null;}catch{task=null;}
  if(task&&Array.isArray(task.sourceIds)&&typeof task.untrustedSource==='string'){
    const id=String(task.sourceIds[0]??'');
    const after=task.untrustedSource.split(`${id} (`)[1]??'';const quote=(after.split('\n')[1]??'').trim()||'the conversation';
    return{status:200,rows:[{content:JSON.stringify({schema:'talos.context.summary.v1',text:'Earlier turns summarised by the fake provider.',goal:'Continue the work.',decisions:[],constraints:[],completed:['the earlier turns'],pending:[],resources:[],sources:[{recordId:id,quote}]})}],delayMs:10};
  }
  if(lastUser.includes('ERR500'))return{status:500,error:'internal model error (fake)',rows:[],delayMs:0};
  /* P19: TOOLFAIL reads README.md, then answers the request that carries the result with HTTP 500: the turn fails AFTER
     a whole tool exchange reached the context archive (the session cad61a7e shape, without the compaction). */
  if(lastUser.includes('TOOLFAIL')){
    if(toolResults>0)return{status:500,error:'internal model error after the tools (fake)',rows:[],delayMs:0};
    const read=tools.find((t:any)=>/^(read|read_file|leggi)$/iu.test(toolName(t)));
    if(read)return{status:200,rows:[{toolCall:{id:'call_toolfail',name:toolName(read),arguments:argumentsFor(read,[{pattern:/^(path|percorso|file)/iu,value:'README.md'}])}}],delayMs:20};
  }
  /* R2 lane E (gate E7): the three client failures the review never exercised. Bodies shaped like OpenAI's error object. */
  if(lastUser.includes('ERR401'))return{status:401,error:'invalid api key (fake)',rows:[],delayMs:0};
  if(lastUser.includes('ERR403'))return{status:403,error:'model access denied (fake)',rows:[],delayMs:0};
  if(lastUser.includes('ERR404'))return{status:404,error:'model not found (fake)',rows:[],delayMs:0};
  if(lastUser.includes('ERR429'))return{status:429,headers:{'retry-after':'7'},error:'rate limit exceeded (fake)',rows:[],delayMs:0};
  /* R5a Q-R5-6: a rate limit that clears. `attempt` counts the requests of this turn (the same last user message and the
     same number of tool results), so the third request of the turn succeeds. */
  if(lastUser.includes('RETRY'))return attempt<=2?{status:429,headers:{'retry-after':'2'},error:'rate limit exceeded (fake)',rows:[],delayMs:0}:{status:200,rows:[{content:'Recovered after retries.'}],delayMs:10};
  /* UI Phase 1: THINK reasons slowly (400 ms per piece) before a short answer, so the one-line live preview is observable. */
  /* Stage 4 (s43): reasoning with a bold title (the activity line's header), the answer's first words, then 33 s of silence
     — past the 30 s stall threshold, under the kernel's 60 s minimum idle limit — and the rest of the answer. */
  if(lastUser.includes('STALL'))return{status:200,rows:[{reasoning:'**Reading the login flow**\n'},{reasoning:'I look at the session code '},{reasoning:'and at the tests '},{reasoning:'before answering.'},{content:'First part. ',pauseMs:33_000},{content:'Second part after the silence.'}],delayMs:700};
  if(lastUser.includes('THINK'))return{status:200,rows:[...['I read the question first. ','Then I look at the project files ','to see how they fit together. ','Now I am checking whether the tests ','cover the entry point.'].map(reasoning=>({reasoning})),{content:'Thought it through.'}],delayMs:400};
  if(lastUser.includes('MD'))return{status:200,rows:[{reasoning:'Looking at the files. '},{reasoning:'Composing a summary.'},...chunks(MARKDOWN_ANSWER,24).map(content=>({content}))],delayMs:40};
  /* P14: the parent delegates one sub-task; the child's own request carries the task, `SLOW child work`, and is answered
     slowly (the SLOW branch below), so the parent's status can be watched while it waits on its agent. */
  /* ASYNC (owner 01/10): the unified kernel wakes the parent with its agents' results (session-registry.mjs
     `testoRisultatoFiglio`, schema talos.subagent-result.v1). That turn's text names the child's task — `FAIL child work` —
     so it is answered here, before any keyword below could read it as a new script. */
  if(lastUser.includes('talos.subagent-result.v1'))return{status:200,rows:[{content:'Done: the agent reported back.'}],delayMs:20};
  /* Stage 6a: `DELEGATE:LONG` — a child that stays at work for ~45 s, so the agents panel can be driven while it works. */
  if(lastUser.includes('LONG child work'))return{status:200,rows:chunks(SLOW_ANSWER,12).map(content=>({content})),delayMs:1_000};
  if(lastUser.includes('DELEGATE')){
    const delegate=tools.find((t:any)=>toolName(t)==='delega_sottotask');
    if(!delegate)return{status:200,rows:[{content:'NO DELEGATION TOOL OFFERED'}],delayMs:10};
    /* `DELEGATE:<KEYWORD>` gives the child another script (P13: `DELEGATE:FAIL`, a child that runs a shell command). The
       unified kernel's delegations are read-only unless asked (`modalita: 'modifica'`): a child that must run a command
       is delegated to modify, so its shell really asks for approval. */
    const childKeyword=/DELEGATE:([A-Z]+)/u.exec(lastUser)?.[1]??'SLOW';
    const mode=childKeyword==='FAIL'?{modalita:'modifica'}:{};
    return toolResults===0?{status:200,rows:[{toolCall:{id:'call_delegate',name:'delega_sottotask',arguments:{task:`${childKeyword} child work`,...mode}}}],delayMs:20}:{status:200,rows:[{content:'Done: the agent finished.'}],delayMs:20};
  }
  /* F-ENG-3 (stress test 08/10/2026): KILLME reads README.md, then answers slowly, so the scenario can kill TALOS while the
     answer streams — after a whole tool exchange reached the context archive, before the turn was written to the end. */
  if(lastUser.includes('KILLME')){
    const read=tools.find((t:any)=>/^(read|read_file|leggi)$/iu.test(toolName(t)));
    if(read&&toolResults===0)return{status:200,rows:[{toolCall:{id:'call_killme',name:toolName(read),arguments:argumentsFor(read,[{pattern:/^(path|percorso|file)/iu,value:'README.md'}])}}],delayMs:20};
    return{status:200,rows:chunks(SLOW_ANSWER,12).map(content=>({content})),delayMs:1_000};
  }
  /* Owner 09/10/2026 («Sì, con la carta»): EXCLUDEME asks to exclude the downstream provider deepinfra, then repeats what the tool
     said; PROVIDERTOOLS names the provider_* tools the request offers (in -p only the list must be there). */
  /* Owner 09/10/2026 («Avvisa, poi chiede o ferma»): LOOPME reads README.md again and again, as the stress test's model read
     AGENTS.md; the kernel's guard must ask at the 5th. */
  if(lastUser.includes('LOOPME')){
    const read=tools.find((t:any)=>/^(read|read_file|leggi)$/iu.test(toolName(t)));
    return read?{status:200,rows:[{toolCall:{id:`call_loop_${toolResults}`,name:toolName(read),arguments:argumentsFor(read,[{pattern:/^(path|percorso|file)/iu,value:'README.md'}])}}],delayMs:10}:{status:200,rows:[{content:'NO READ TOOL'}],delayMs:10};
  }
  /* Owner 09/10/2026 («Segue il modo + si chiede»): NETME runs one command asking for the network, NETPLAIN the same without;
     then the model repeats what the tool said (the sandbox line says whether the network was allowed). */
  if(lastUser.includes('NETME')||lastUser.includes('NETPLAIN')){
    const shell=tools.find((t:any)=>/^(shell|bash|run_command|esegui)$/iu.test(toolName(t)));
    if(!shell)return{status:200,rows:[{content:'NO SHELL'}],delayMs:10};
    if(toolResults===0)return{status:200,rows:[{toolCall:{id:'call_net',name:toolName(shell),arguments:{...argumentsFor(shell,[{pattern:/^(command|comando|cmd)/iu,value:'cmd /c echo net-ok'}]),...(lastUser.includes('NETME')?{network:true}:{})}}}],delayMs:20};
    /* 0.6.13 gate (25/10/2026; s60 red from 80a0d077e, the desktop adapter): the adapter puts its 93-character line «[shell output:
       stdout and stderr combined in arrival order; stream identity is not preserved]» before `exit 0 [sandbox: …]`, whose measured
       facts take ~145 more, so 240 characters ended at «its processes end» and the command's own «net-ok» was never repeated.
       600 holds the notice, the longest sandbox line (every fact, AppContainer included) and the output. */
    return{status:200,rows:[{content:`Tool said: ${String(messages.filter((m:any)=>m?.role==='tool').at(-1)?.content??'').replace(/\s+/gu,' ').slice(0,600)}`}],delayMs:10};
  }
  if(lastUser.includes('PROVIDERTOOLS'))return{status:200,rows:[{content:`Offered: ${[...tools.map((t:any)=>toolName(t)),...deferredNames(tools)].filter((n:string)=>n.startsWith('provider_')).sort().join(',')||'none'}.`}],delayMs:10};
  if(lastUser.includes('EXCLUDEME')){
    const exclude=callOf(tools,'call_exclude','provider_exclude',{provider:'deepinfra'});
    if(!exclude)return{status:200,rows:[{content:'NO PROVIDER TOOL'}],delayMs:10};
    if(toolResults===0)return{status:200,rows:[exclude],delayMs:20};
    return{status:200,rows:[{content:`Tool said: ${String(messages.filter((m:any)=>m?.role==='tool').at(-1)?.content??'').slice(0,160)}`}],delayMs:10};
  }
  /* F-ENG-4 (stress test 08/10/2026): CUTOFF answers with a first half cut by the output cap; the kernel's continuation note
     (the last user message then) gets the second half, ended normally. */
  if(lastUser.includes('cut off by the output length limit'))return{status:200,rows:[{content:'and the second half.'}],delayMs:10};
  if(lastUser.includes('CUTOFF'))return{status:200,rows:[{content:'First half of the answer, '}],delayMs:10,finish:'length'};
  if(lastUser.includes('SLOW'))return{status:200,rows:chunks(SLOW_ANSWER,12).map(content=>({content})),delayMs:250};
  /* R3 (gate §8.2): one-tool scripts for the edit, search, failing-command and long-command frames. Same style as TOOLS:
     whole kernel names, arguments by the tool's own key names, then one final answer. */
  const byName=(pattern:RegExp)=>tools.find((t:any)=>pattern.test(toolName(t)));
  const scripted=(plan:Row[],final:string)=>{const next=plan[toolResults];return next?{status:200,rows:[next],delayMs:20}:{status:200,rows:[{content:final}],delayMs:20};};
  const shellCall=(id:string,command:string):Row[]=>{const shell=byName(/^(shell|bash|run_command|esegui)$/iu);return shell?[{toolCall:{id,name:toolName(shell),arguments:argumentsFor(shell,[{pattern:/^(command|comando|cmd)/iu,value:command}])}}]:[];};
  /* Mockup parity (owner 08/10/2026: «la parità col mockup non è stata raggiunta»): the approved mockup's step 02 turn — a thought, two reads and one
     search (one exploration group), then an edit and a command (one work group), then the answer. */
  if(lastUser.includes('MOCKUP')){
    const read=byName(/^(read|read_file|leggi)$/iu),search=byName(/^(cerca|search|grep)$/iu),edit=byName(/^(file_edit|edit|edit_file)$/iu);
    const plan:Row[]=[];
    if(read)plan.push({toolCall:{id:'call_m_read1',name:toolName(read),arguments:argumentsFor(read,[{pattern:/^(path|percorso|file)/iu,value:'README.md'}])}});
    if(read)plan.push({toolCall:{id:'call_m_read2',name:toolName(read),arguments:argumentsFor(read,[{pattern:/^(path|percorso|file)/iu,value:'src/index.js'}])}});
    if(search)plan.push({toolCall:{id:'call_m_search',name:toolName(search),arguments:argumentsFor(search,[{pattern:/^(testo|text|query|pattern)/iu,value:'console'}])}});
    if(edit)plan.push({toolCall:{id:'call_m_edit',name:toolName(edit),arguments:argumentsFor(edit,[{pattern:/^(path|percorso|file)/iu,value:'src/index.js'},{pattern:/^old/iu,value:'console.log(1)'},{pattern:/^new/iu,value:'console.log(2)'}])}});
    plan.push(...shellCall('call_m_shell','cmd /c echo ok'));
    if(toolResults===0)return{status:200,rows:[{reasoning:'The test waits 500 ms for the cookie. '},{reasoning:'The retry can take longer.'},plan[0]!],delayMs:40};
    return scripted(plan,'The fix is in src/index.js; nothing else changed.');
  }
  /* `WRITEAT:<absolute path>` (live blocked-folders check, 27/10/2026): one write of a small file at exactly that path, so a device's
     turn can be sent into a folder blocked for it */
  if(lastUser.includes('WRITEAT:')){
    const target=/WRITEAT:(\S+)/u.exec(lastUser)?.[1]??'';const write=byName(/^(write|write_file|scrivi)$/iu);
    const call:Row[]=write&&target?[{toolCall:{id:'call_writeat',name:toolName(write),arguments:argumentsFor(write,[{pattern:/^(path|percorso|file)/iu,value:target},{pattern:/^(content|contenuto|text)/iu,value:'blocked-folder check\n'}])}}]:[];
    return scripted(call,'Done: wrote the file.');
  }
  if(lastUser.includes('EDIT')){
    /* file_edit when offered (the CLI offers it: s18 on 2026-09-24 drew `tool id file_edit`); a profile without it gets
       a write that replaces the existing file (Q-R3-4: `+a −r`). */
    const edit=byName(/^(file_edit|edit|edit_file)$/iu),write=byName(/^(write|write_file|scrivi)$/iu);
    const call:Row[]=edit?[{toolCall:{id:'call_edit',name:toolName(edit),arguments:argumentsFor(edit,[{pattern:/^(path|percorso|file)/iu,value:'src/index.js'},{pattern:/^old/iu,value:'console.log(1)'},{pattern:/^new/iu,value:'console.log(2)'}])}}]
      :write?[{toolCall:{id:'call_edit',name:toolName(write),arguments:argumentsFor(write,[{pattern:/^(path|percorso|file)/iu,value:'src/index.js'},{pattern:/^(content|contenuto|text)/iu,value:'console.log(2)\n'}])}}]:[];
    return scripted(call,'Done: edited 1 file.');
  }
  if(lastUser.includes('SEARCH')){
    const search=byName(/^(cerca|search|grep)$/iu),list=byName(/^(elenca|list|ls)$/iu);const plan:Row[]=[];
    if(search)plan.push({toolCall:{id:'call_search',name:toolName(search),arguments:argumentsFor(search,[{pattern:/^(testo|text|query|pattern)/iu,value:'console'}])}});
    if(list)plan.push({toolCall:{id:'call_list',name:toolName(list),arguments:argumentsFor(list,[{pattern:/^(path|percorso|dir)/iu,value:'src'}])}});
    return scripted(plan,'Done: searched.');
  }
  /* Stage 3: the model asks the person (`ask_user_question`) the approved mockup's three questions (step «domande del
     modello»), then answers with what it was told. Offered only when a person is at the screen (piece 4). */
  /* Stage 3: in plan mode the model proposes the approved mockup's plan (step «permessi e piano») with `present_plan`, then
     answers. The tool exists only in plan mode (talosHarness.mjs), so outside it the script says there was nothing to call. */
  /* Stage 3, MCP elicitation (s42): the model calls the fake MCP server's create_pr, which asks the person for the details. */
  if(lastUser.includes('MCPPR')){
    const pr=byName(/^mcp__github__create_pr$/u);
    return scripted(pr?[{toolCall:{id:'call_pr',name:toolName(pr),arguments:{}}}]:[],pr?'Done: PR step finished.':'Done: no MCP tool.');
  }
  /* s95 (row 126, road A): SAMECALLS<n> <tag> calls the fake server's add_label n times in ONE answer (3 by default), each with its
     own label — the kernel groups them on one card (the tool is declared non-destructive) — then repeats what the tools said. */
  if(/SAMECALLS\d*/u.test(lastUser)){
    const add=byName(/^mcp__gh__add_label$/u);
    const count=Number(/SAMECALLS(\d+)/u.exec(lastUser)?.[1]??3);const tag=/SAMECALLS\d*\s+(\S+)/u.exec(lastUser)?.[1]??'x';
    const plan:Row[]=[];
    if(add)for(let i=1;i<=count;i++)plan.push({toolCall:{id:`call_label_${i}`,name:toolName(add),arguments:{label:`${tag} ${i}`}}});
    const said=messages.slice(lastUserAt+1).filter((m:any)=>m?.role==='tool').map((m:any)=>String(m?.content??'').replace(/\s+/gu,' ').slice(0,60)).join(' | ');
    /* every call in the first answer (parallel tool calls, index 0..n-1), never one per answer as `scripted` does */
    return toolResults===0&&plan.length?{status:200,rows:plan,delayMs:20}:{status:200,rows:[{content:add?`Tool said: ${said}`:'Done: no MCP tool.'}],delayMs:20};
  }
  /* A5j (s94): NOTOOL<n> calls the fake server's create_pr n times (3 by default), each with its own title — so the kernel's «same call»
     no does not cover the next one — then list_prs, another tool of the same server, then repeats what the tools said. */
  if(/NOTOOL\d*/u.test(lastUser)){
    const pr=byName(/^mcp__gh__create_pr$/u),list=byName(/^mcp__gh__list_prs$/u);
    const count=Number(/NOTOOL(\d+)/u.exec(lastUser)?.[1]??3);const tag=/NOTOOL\d*\s+(\S+)/u.exec(lastUser)?.[1]??'x';
    const plan:Row[]=[];
    if(pr)for(let i=1;i<=count;i++)plan.push({toolCall:{id:`call_pr_${i}`,name:toolName(pr),arguments:{title:`${tag} pr ${i}`}}});
    if(list)plan.push({toolCall:{id:'call_list_prs',name:toolName(list),arguments:{}}});
    const said=messages.slice(lastUserAt+1).filter((m:any)=>m?.role==='tool').map((m:any)=>String(m?.content??'').replace(/\s+/gu,' ').slice(0,60)).join(' | ');
    return scripted(plan,pr?`Tool said: ${said}`:'Done: no MCP tool.');
  }
  if(lastUser.includes('PLANWRITE')){
    const name=/PLANWRITE:([a-z_]+)/u.exec(lastUser)?.[1]??'scrivi';
    const args:Record<string,Record<string,unknown>>={scrivi:{percorso:'notes.txt',contenuto:WRITE_CONTENT},shell:{comando:'cmd /c echo hi > notes.txt'},file_edit:{percorso:'README.md',old_string:'# demo',new_string:'# changed'}};
    const slow:Row[]=lastUser.includes('GENTLY')&&toolResults===0?[{reasoning:'Thinking before the change. ',pauseMs:4_000}]:[];
    if(slow.length)return{status:200,rows:[...slow,{toolCall:{id:'call_planwrite',name,arguments:args[name]??{}}}],delayMs:20};
    return scripted([{toolCall:{id:'call_planwrite',name,arguments:args[name]??{}}}],`Tool said: ${String(messages.filter((m:any)=>m?.role==='tool').at(-1)?.content??'').replace(/\s+/gu,' ').slice(0,240)}`);
  }
  if(lastUser.includes('PLANME')){
    const present=byName(/^present_plan$/u);
    return scripted(present?[{toolCall:{id:'call_plan',name:toolName(present),arguments:{plan:PLAN_TEXT}}}]:[],present?'Done: planned.':'Done: no plan tool.');
  }
  /* Stage 6b: `DELEGATE:ASKONE` — a child that asks the person one simple question (only if the kernel offers it the tool, i.e.
     the host turned `domandeDeiFigli` on) and then says what it got. */
  if(lastUser.includes('ASKONE child work')){
    const ask=byName(/^ask_user_question$/u);
    if(!ask)return{status:200,rows:[{content:'Done: nobody to ask.'}],delayMs:20};
    if(toolResults===0)return{status:200,rows:[{toolCall:{id:'call_askone',name:toolName(ask),arguments:{questions:[AGENT_QUESTION]}}}],delayMs:20};
    const result=String(messages.filter((m:any)=>m?.role==='tool').at(-1)?.content??'');
    return{status:200,rows:[{content:`Done: the agent got ${result.includes('answered')?/"sandbox":"([^"]*)"/u.exec(result)?.[1]??'an answer':'no answer'}.`}],delayMs:20};
  }
  if(lastUser.includes('ASKME')){
    const ask=byName(/^ask_user_question$/u);
    return scripted(ask?[{toolCall:{id:'call_ask',name:toolName(ask),arguments:{questions:ASK_QUESTIONS}}}]:[],ask?'Done: answered.':'Done: nobody to ask.');
  }
  /* s68 (a464f3336): a command that outlives the call's time (`timeout`, ms) — it moves to the background, the turn ends, and its
     end wakes the conversation (the wake's request does not carry BGWAKE: it is answered `OK`). BGHOLD: one that runs a minute. */
  if(lastUser.includes('BGWAKE')||lastUser.includes('BGHOLD')){
    const shell=byName(/^(shell|bash|run_command|esegui)$/iu);
    /* BGHOLD leaves a file when it really starts (a first command may wait for the sandbox's check before it runs) */
    const command=lastUser.includes('BGHOLD')
      ?`node -e "require('fs').writeFileSync('bg-started.txt','1');setTimeout(function(){console.log('finished-bg')},60000)"`
      :`node -e "setTimeout(function(){console.log('finished-bg')},3000)"`;
    const call:Row[]=shell?[{toolCall:{id:'call_bg',name:toolName(shell),arguments:{...argumentsFor(shell,[{pattern:/^(command|comando|cmd)/iu,value:command}]),timeout:1000}}}]:[];
    return scripted(call,'Started: it goes on in the background.');
  }
  /* s69 (110714a01): one simple question nobody answers; then what the tool result said, so the scenario reads it on screen. */
  if(lastUser.includes('ASKLATE')){
    const ask=byName(/^ask_user_question$/u);
    const result=String(messages.filter((m:any)=>m?.role==='tool').at(-1)?.content??'');
    const question={id:'db',header:'Database',question:'Which database should the example use?',why:'It decides what the example needs installed.',options:[{label:'SQLite',description:'one file, nothing to install',recommended:true},{label:'Postgres',description:'a server'}]};
    return scripted(ask?[{toolCall:{id:'call_late',name:toolName(ask),arguments:{questions:[question]}}}]:[],/did not answer in time/u.test(result)?'Went on without an answer: assumed SQLite.':'Done: something else came back.');
  }
  if(lastUser.includes('FAIL'))return scripted(shellCall('call_fail','cmd /c exit 3'),'Done: the command failed.');
  /* About 3 s of output, one line every 300 ms: long enough to watch it run and to interrupt it. */
  if(lastUser.includes('LONG'))return scripted(shellCall('call_long','powershell -NoProfile -Command "1..10 | ForEach-Object { \'line \' + $_; Start-Sleep -Milliseconds 300 }"'),'Done: long command finished.');
  /* R5a Q-R5-10: an output far past any cut, printed at once. */
  if(lastUser.includes('HUGE'))return scripted(shellCall('call_huge','powershell -NoProfile -Command "1..3000 | ForEach-Object { \'output line \' + $_ }"'),'Done: printed the long output.');
  /* R5a Q-R5-11: a read far past the 8,000-character tool-result cut. */
  if(lastUser.includes('BIGREAD')){
    const read=byName(/^(read|read_file|leggi)$/iu);
    return scripted(read?[{toolCall:{id:'call_bigread',name:toolName(read),arguments:argumentsFor(read,[{pattern:/^(path|percorso|file)/iu,value:'big.txt'}])}}]:[],'Done: read the big file.');
  }
  /* R5a Q-R5-4: ten reads of about 9 KB each (the scenario writes c1.txt … c10.txt), enough to make either engine compact
     (lane R's trigger: the kernel's summary request comes around the 9th call with no window known; the Context Engine
     compacts at half of a small window the person set). After a compaction the count of this turn's results may restart;
     the kernel's own turn cap ends the turn either way. */
  if(lastUser.includes('COMPACTME')){
    const read=byName(/^(read|read_file|leggi)$/iu);const k=toolResults+1;
    return k<=10&&read?{status:200,rows:[{toolCall:{id:`call_c${k}`,name:toolName(read),arguments:argumentsFor(read,[{pattern:/^(path|percorso|file)/iu,value:`c${k}.txt`}])}}],delayMs:10}:{status:200,rows:[{content:'Done: read ten files.'}],delayMs:10};
  }
  /* R5a Q-R5-17: the policy refuses this composition without asking the person (R5 gate finding 15, m3a). */
  if(lastUser.includes('DENYRULE'))return scripted(shellCall('call_denyrule','cmd /c for /L %i in (1,1,3) do @echo rule line %i'),'Done: the command was refused.');
  if(lastUser.includes('TOOLS')){
    /* Whole names only: the kernel also offers `library_read`, `memory_write` and friends. */
    const read=tools.find((t:any)=>/^(read|read_file|leggi)$/iu.test(toolName(t)));
    const shell=tools.find((t:any)=>/^(shell|bash|run_command|esegui)$/iu.test(toolName(t)));
    const write=tools.find((t:any)=>/^(write|write_file|scrivi)$/iu.test(toolName(t)));
    const plan:Row[]=[];
    if(read)plan.push({toolCall:{id:'call_read',name:toolName(read),arguments:argumentsFor(read,[{pattern:/^(path|percorso|file)/iu,value:'README.md'}])}});
    if(shell)plan.push({toolCall:{id:'call_shell',name:toolName(shell),arguments:argumentsFor(shell,[{pattern:/^(command|comando|cmd)/iu,value:'cmd /c dir /b'}])}});
    if(write)plan.push({toolCall:{id:'call_write',name:toolName(write),arguments:argumentsFor(write,[{pattern:/^(path|percorso|file)/iu,value:'notes.txt'},{pattern:/^(content|contenuto|text)/iu,value:WRITE_CONTENT}])}});
    const next=plan[toolResults];
    if(next)return{status:200,rows:[next],delayMs:20};
    /* R2: the fake MODEL named the kernel's tools (`leggi, shell, scrivi`), the only Italian left on s07's end frame and not
       TALOS's words; s07 waits for /Done: used 3 tools/, which still matches. */
    return{status:200,rows:[{content:`Done: used ${plan.length} tools.`}],delayMs:20};
  }
  return{status:200,rows:[{content:'OK'}],delayMs:10};
}

async function readJson(req:http.IncomingMessage):Promise<any>{let raw='';for await(const chunk of req)raw+=chunk;try{return JSON.parse(raw||'{}');}catch{return {};}}
function json(res:http.ServerResponse,status:number,body:unknown,headers:Record<string,string>={}){res.writeHead(status,{'content-type':'application/json',...headers});res.end(JSON.stringify(body));}

async function chatCompletions(body:any,res:http.ServerResponse,isClosed:()=>boolean,attempt:number,lastUser?:string){
  const plan=planResponse(body,{attempt,...(lastUser!==undefined?{lastUser}:{})});
  if(plan.status!==200)return json(res,plan.status,{error:{message:plan.error,type:'fake_error',code:plan.status}},plan.headers);
  const id='chatcmpl-fake';const created=Math.floor(Date.now()/1000);
  const toolCalls=plan.rows.filter(r=>r.toolCall).map((r,index)=>({index,id:r.toolCall!.id,type:'function',function:{name:r.toolCall!.name,arguments:JSON.stringify(r.toolCall!.arguments)}}));
  const finish=plan.finish??(toolCalls.length?'tool_calls':'stop');
  if(!body?.stream){
    const content=plan.rows.map(r=>r.content??'').join('');const reasoning=plan.rows.map(r=>r.reasoning??'').join('');
    return json(res,200,{id,object:'chat.completion',created,model:FAKE_MODEL,choices:[{index:0,message:{role:'assistant',content,...(reasoning?{reasoning_content:reasoning}:{}),...(toolCalls.length?{tool_calls:toolCalls.map(({index:_,...rest})=>rest)}:{})},finish_reason:finish}],usage:FAKE_USAGE});
  }
  res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache'});
  const sse=(payload:unknown)=>{if(!isClosed())res.write(`data: ${JSON.stringify(payload)}\n\n`);};
  let toolIndex=0;
  for(const row of plan.rows){
    if(isClosed())return;
    const delta:Record<string,unknown>={};
    if(row.reasoning)delta.reasoning_content=row.reasoning;
    if(row.content)delta.content=row.content;
    if(row.toolCall)delta.tool_calls=[{index:toolIndex++,id:row.toolCall.id,type:'function',function:{name:row.toolCall.name,arguments:JSON.stringify(row.toolCall.arguments)}}];
    sse({id,object:'chat.completion.chunk',created,model:FAKE_MODEL,choices:[{index:0,delta,finish_reason:null}]});
    await sleep(row.pauseMs??plan.delayMs);
  }
  sse({id,object:'chat.completion.chunk',created,model:FAKE_MODEL,choices:[{index:0,delta:{},finish_reason:finish}]});
  if(body?.stream_options?.include_usage)sse({id,object:'chat.completion.chunk',created,model:FAKE_MODEL,choices:[],usage:FAKE_USAGE});
  if(!isClosed())res.end('data: [DONE]\n\n');
}

/** Start the fake on 127.0.0.1:0. The returned `url` is what `OLLAMA_BASE_URL` must carry. */
export async function startFakeProvider():Promise<FakeProvider>{
  const requests:RecordedRequest[]=[];
  const attempts=new Map<string,number>();
  const sockets=new Set<import('node:net').Socket>();
  /* every user text this fake was sent, to find what is new in a merged one (`typedLast`) */
  const userTexts:string[]=[];
  const server=http.createServer(async(req,res)=>{
    let closed=false;res.on('close',()=>{closed=true;});
    const record:RecordedRequest={at:Date.now(),method:req.method??'',url:req.url??''};requests.push(record);
    if(req.method==='GET'&&(req.url==='/api/tags'||req.url==='/api/ps'))return json(res,200,{models:[{name:FAKE_MODEL,model:FAKE_MODEL,size:1,digest:'fixture',details:{format:'gguf',parameter_size:'1B'}}]});
    if(req.method==='POST'&&req.url==='/api/show')return json(res,200,{capabilities:['completion','tools','thinking'],model_info:{'general.context_length':131072}});
    if(req.method==='GET'&&req.url==='/v1/models')return json(res,200,{object:'list',data:[{id:FAKE_MODEL,object:'model',owned_by:'fake'}]});
    if(req.method==='POST'&&req.url==='/v1/chat/completions'){
      const body=await readJson(req);
      const messages=Array.isArray(body?.messages)?body.messages:[];
      const rawUser=textOf([...messages].reverse().find((m:any)=>m?.role==='user')?.content);const typed=typedLast(rawUser,userTexts);
      if(!userTexts.includes(rawUser))userTexts.push(rawUser);
      record.lastUser=typed.slice(0,200);record.rawUser=rawUser.slice(-4_000);
      record.tools=(Array.isArray(body?.tools)?body.tools:[]).map(toolName);
      record.bodyChars=JSON.stringify(body??{}).length;record.toolsChars=JSON.stringify(body?.tools??[]).length;
      record.systemTexts=messages.filter((m:any)=>m?.role==='system').map((m:any)=>textOf(m?.content).slice(0,4_000));
      record.toolResults=messages.filter((m:any)=>m?.role==='tool').length;
      record.stream=body?.stream===true;record.streamUsage=body?.stream_options?.include_usage===true;
      const lastUserAt=messages.map((m:any)=>m?.role).lastIndexOf('user');
      const turnTools=messages.slice(lastUserAt+1).filter((m:any)=>m?.role==='tool');
      record.toolTexts=turnTools.map((m:any)=>{const text=textOf(m.content);return{length:text.length,tail:text.slice(-800),text:text.slice(0,60_000)};});
      const key=`${lastUserAt}|${record.lastUser}|${turnTools.length}`;
      record.attempt=(attempts.get(key)??0)+1;attempts.set(key,record.attempt);
      return chatCompletions(body,res,()=>closed,record.attempt,typed);
    }
    json(res,404,{error:'not found (fake provider)'});
  });
  server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));});
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>resolve());});
  const port=(server.address() as AddressInfo).port;
  return{
    url:`http://127.0.0.1:${port}`,port,requests,
    chatRequests:()=>requests.filter(r=>r.url==='/v1/chat/completions'),
    close:()=>new Promise<void>(resolve=>{for(const s of sockets)s.destroy();server.close(()=>resolve());}),
  };
}
