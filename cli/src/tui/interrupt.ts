import {t,tn} from '../i18n/index.ts';
/*
 * Ctrl+C policy (review D-12, gate E10). The keymap documents exit as `Ctrl+D / Ctrl+C Ctrl+C`, so at idle the first
 * press only arms the exit and the caller shows EXIT_HINT (Claude Code prints "Press Ctrl-C again to exit",
 * CHANGELOG 2.1.248, npm 2026-08-27); a second press inside the window exits. During a run the first press cancels
 * and a quick second one forces the exit, as before. The idle window is 2 s, not Pi's 500 ms (interactive-mode.ts:
 * 4117-4125 @a328aa8 2026-09-23): the hint is on screen, and the s10 acceptance cadence presses again after 1.5 s.
 *
 * R4 (owner decision Q-R4-7, gate E7): ONE exit rule for Ctrl+C, Ctrl+D and Esc, decided here; app.ts only calls it and
 * carries out the answer. The composer and dialog state is read through the `context` callback the app injects, at the
 * moment of the key:
 * - an open picker or dialog is closed first, before any exit is armed (Claude Code 2.1.280/2.1.281, gate D.2/D.5);
 * - with a draft, Ctrl+C and Esc Esc (within ESC_CLEAR_WINDOW_MS) clear it — the app puts it in history first, so ↑ brings
 *   it back (Claude Code "Interactive mode" :21/:37, 2.1.275 → 2026-09-17, gate B.2; Hermes, Pi, Goose clear too);
 * - the two-press exit (2 s window and the status-row hint, R1) happens only on an empty composer;
 * - Ctrl+D with a draft deletes at the cursor; on an empty composer it is Ctrl+C (Claude Code :23, Codex `mod.rs:217-224`);
 *   one armed state, so either key confirms it, and the hint names the key that armed it.
 * During a run Ctrl+C still cancels first (R1) and Esc stops the run (the queue-preserving interrupt).
 */
export const EXIT_CONFIRM_WINDOW_MS=2000;
export const ESC_CLEAR_WINDOW_MS=500;
export type ExitKey='ctrl-c'|'ctrl-d';
/* ASYNC step 4 (owner 01/10): with delegated agents working the hint names the cost — they run in this process, so the
   exit stops them (Claude Code: «Press Ctrl-C again to exit · N agents will keep running», its agents live elsewhere). */
export function exitHintText(key:ExitKey='ctrl-c',agents=0):string{
  const hint=t('screen.exit.hint',{key:key==='ctrl-d'?'Ctrl+D':'Ctrl+C'});
  return agents>0?`${hint} · ${tn('screen.exit.agentsStopped',agents)}`:hint;
}
export const EXIT_HINT=exitHintText('ctrl-c');
export type InterruptAction='cancel'|'arm-exit'|'exit'|'force-exit';
/** What the app must do for the key: the R1 actions plus the R4 ones. */
export type InterruptDecision=InterruptAction|'close-dialog'|'clear-draft'|'delete-forward'|'close-completion'|'stop-run'|'esc';
/** The composer text is not empty · a picker/dialog is open · the `@` completion list is open. */
export type InterruptContext={draft:boolean;dialog:boolean;completion:boolean};
const NO_CONTEXT:InterruptContext={draft:false,dialog:false,completion:false};

export function createInterruptController({now=Date.now,windowMs=1000,exitWindowMs=EXIT_CONFIRM_WINDOW_MS,escWindowMs=ESC_CLEAR_WINDOW_MS,context=()=>NO_CONTEXT}:{now?:()=>number;windowMs?:number;exitWindowMs?:number;escWindowMs?:number;context?:()=>InterruptContext}={}){
  let lastCancelAt:number|null=null,armedAt:number|null=null,armedKey:ExitKey|null=null,lastEscAt:number|null=null;
  const armed=(at:number)=>armedAt!==null&&at-armedAt<=exitWindowMs;
  const disarm=()=>{armedAt=null;armedKey=null;};
  const read=():InterruptContext=>{try{return{...NO_CONTEXT,...context()};}catch{return NO_CONTEXT;}};
  /* The R1 two-press rule: idle arms then exits; during a run cancels then forces the exit. */
  const exitPress=(running:boolean,key:ExitKey):InterruptAction=>{
    const at=now();
    if(!running){lastCancelAt=null;if(armed(at)){disarm();return'exit';}armedAt=at;armedKey=key;return'arm-exit';}
    disarm();
    if(lastCancelAt!==null&&at-lastCancelAt<=windowMs){lastCancelAt=null;return'force-exit';}
    lastCancelAt=at;return'cancel';
  };
  const exitKey=(running:boolean,key:ExitKey):InterruptDecision=>{
    lastEscAt=null;
    const ctx=read();
    if(ctx.dialog){disarm();lastCancelAt=null;return'close-dialog';}
    if(key==='ctrl-d'&&ctx.draft)return'delete-forward';
    if(!running&&ctx.draft){disarm();lastCancelAt=null;return'clear-draft';}
    return exitPress(running,key);
  };
  return{
    /** Ctrl+C: close a dialog · cancel a run · clear a draft · arm or confirm the exit. */
    ctrlC(running:boolean):InterruptDecision{return exitKey(running,'ctrl-c');},
    /** Ctrl+D: close a dialog · delete at the cursor when there is a draft · otherwise exactly Ctrl+C. */
    ctrlD(running:boolean):InterruptDecision{return exitKey(running,'ctrl-d');},
    /** Esc: close a dialog or the `@` list · stop a run · the second of two quick presses clears a draft. */
    esc(running:boolean):InterruptDecision{
      const ctx=read(),at=now();
      if(ctx.dialog||ctx.completion||running){lastEscAt=null;return ctx.dialog?'close-dialog':ctx.completion?'close-completion':'stop-run';}
      if(ctx.draft&&lastEscAt!==null&&at-lastEscAt<=escWindowMs){lastEscAt=null;disarm();return'clear-draft';}
      lastEscAt=at;return'esc';
    },
    /** True while a second idle Ctrl+C/Ctrl+D would exit: the caller keeps the hint visible for exactly this long. */
    exitArmed():boolean{return armed(now());},
    /** The key that armed the exit (the hint names it), or null. */
    armedBy():ExitKey|null{return armed(now())?armedKey:null;},
    reset(){lastCancelAt=null;},
  };
}
