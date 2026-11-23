/*
 * The exit backstop (second review of 0.6.2, bugfixer, 13/10/2026). Twice in one day «the screen is gone and the process stays»
 * (acceptance s52, then «one TALOS at a time» at the next start) was a request nobody could stop: a key provider's check (31 s
 * measured on the built CLI with a provider that accepts and never answers), then the ChatGPT plan's list (until OpenAI answers).
 * Each has its own cure — the request ends with the screen (catalog-service.ts `stopProviderChecks`, chatgpt-plan.ts
 * `boundedPlanFetch`). This is the net under the whole class: a `/provider` test, a `/model` list, the external agent, whatever
 * is added next. Nothing like it existed (searched 13/10/2026: every `process.exit` of this CLI is a signal or a second Ctrl+C,
 * main.ts `forcedExit` and runtime/active-run.ts; `exitWhenFinished` speaks only of a command that never finished).
 *
 * The rule: once the command's work has FINISHED — `main` has returned — a handle left behind may hold the process for
 * `EXIT_BACKSTOP_MS` and no longer. What `main` has awaited by then, and nothing more (third review of 0.6.2, 13/10/2026: the first
 * wording said «the runtime closed with its journals and checkpoints», which nothing awaits):
 *   · the screen ended and its exit transcript written (tui/run.ts);
 *   · the sandbox checks still running, ended (`abortIsolationChecks`);
 *   · `runtime.close()`: the kernel loaded if it was still loading; the ChatGPT plan's token work on its way — a renewal, a
 *     sign-in's exchange, a sign-out — waited for, at most 15 s (provider/chatgpt-plan.ts `TOKEN_WORK_EXIT_LIMIT_MS`); the plan's
 *     reads stopped; the Context Engine closed; the supervisor's own journal released;
 *   · the run marker released and the development log closed.
 * NOT awaited, and therefore ended with the process when this fires: a turn or a tool still running, a background command, a
 * checkpoint still being taken, an MCP server or the external agent, any request but the plan's token work. A conversation's
 * journal is written by the kernel as its events happen, not at exit.
 *   · The timer is unref'd: it keeps nothing alive. A process with nothing left ends at once, as before, and the timer never fires.
 *   · It is armed by `exitWhenFinished` (runtime/unfinished-command.ts) in the `then` of the command's own promise, so it cannot
 *     cut a clean-up that is still awaited; a command that failed or never finished is not given it.
 *   · When it fires it says what was holding the process, by kind and count (`process.getActiveResourcesInfo()`, Node ≥ 17.3:
 *     «the types of the active resources that are currently keeping the event loop alive»), then exits with the code the run
 *     returned. Never a handle's content: a socket's address is not written anywhere.
 *   · Work that nobody awaits and that needs more than the delay after the clean-up is cut with the rest (the list above); what
 *     must survive the exit has to be awaited by `main`. One such was found by the third review — a ChatGPT token renewal whose
 *     refresh token OpenAI had already rotated — and is awaited now, in `runtime.close()`.
 * `-p` is not given the backstop: no headless hang is proven, and a script's exit is not changed on a suspicion (main.ts).
 */
export const EXIT_BACKSTOP_MS=2_000;

export type ExitBackstopRecord={held:Record<string,number>;afterMs:number;exitCode:number};
export type ExitBackstopInput={
  /** The code the run returned: the process ends with it. */
  code:number;
  delayMs?:number;
  /** What is told when it fires (the development log); a failure here never keeps the process. */
  log?:(record:ExitBackstopRecord)=>void;
  /** Tests: the exit and the reading of what holds the event loop. */
  exit?:(code:number)=>void;
  resources?:()=>readonly string[];
};

/** `['TCPSocketWrap','TCPSocketWrap','Timeout']` -> `{TCPSocketWrap:2,Timeout:1}`. */
export function summarizeHeldResources(kinds:readonly string[]|null|undefined):Record<string,number>{
  const held:Record<string,number>={};
  if(!Array.isArray(kinds))return held;
  for(const kind of kinds){if(typeof kind==='string'&&kind)held[kind]=(held[kind]??0)+1;}
  return held;
}

/** Arms the backstop and returns its disarm. Call it only when the command's work has finished (see above). */
export function armExitBackstop({code,delayMs=EXIT_BACKSTOP_MS,log,exit=value=>process.exit(value),resources=()=>(process as {getActiveResourcesInfo?:()=>string[]}).getActiveResourcesInfo?.()??[]}:ExitBackstopInput):()=>void{
  const timer=setTimeout(()=>{
    let held:Record<string,number>={};
    try{held=summarizeHeldResources(resources());}catch{held={};}
    try{log?.({held,afterMs:delayMs,exitCode:code});}catch{/* the log must never keep the process either */}
    exit(code);
  },delayMs);
  (timer as {unref?:()=>void}).unref?.();
  return()=>clearTimeout(timer);
}
