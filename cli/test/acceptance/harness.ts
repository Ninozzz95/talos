/**
 * One scenario = one hermetic profile + one fake provider + one TALOS in a pseudo console, opened and closed in
 * strict sequence (owner rule: at most one CLI instance and one pty at a time; every child and server is closed at the
 * end of the scenario, pass or fail).
 */
import {tmpdir} from 'node:os';
import {after,before} from 'node:test';
import {startFakeProvider,type FakeProvider} from './fake-provider.ts';
import {assertFreshBuild,childEnvironment,createProfile,type Profile} from './profile.ts';
import {TerminalSession,type OutputCount,type Screen} from './terminal.ts';
import {composerReady,idleFooter} from './checks.ts';
/* third review of 0.6.2 (S4): a TALOS the exit backstop had to end fails its scenario (exit-backstop-check.ts) */
import {assertNoExitBackstop} from './exit-backstop-check.ts';

export const FAKE_MODEL_ID='ollama:qwen3-coder-test';
export type Stage={fake:FakeProvider;profile:Profile;sessions:TerminalSession[];launch:(args?:string[],size?:{cols?:number;rows?:number})=>TerminalSession};

/** Register the scenario's setup and teardown. `useModel` pre-selects the fake model with `talos model use`. */
/* R4 (lane A): `model` picks the model `talos model use` sets (a key-requiring one for the no-key frames); `extraEnv` adds
   variables to TALOS's environment (the refusing sink of sink.ts, gate E14). */
/* R4 Q-R4-1: every new folder is asked whether to trust it, so a scenario that is not about trust starts in a folder
   trusted with `talos project trust` (`trusted:false` for the first-run and trust scenarios). */
export function stage({name,files={},useModel=true,model=FAKE_MODEL_ID,extraEnv={},trusted=true}:{name:string;files?:Record<string,string>;useModel?:boolean;model?:string;extraEnv?:Record<string,string>;trusted?:boolean}):Stage{
  const box:Partial<Stage>&{sessions:TerminalSession[]}={sessions:[]};
  before(async()=>{
    assertFreshBuild();
    box.fake=await startFakeProvider();
    box.profile=createProfile({name,files,providerUrl:box.fake.url,extraEnv});
    if(useModel){const r=await box.profile.talos(['model','use',model,'--scope','user']);if(r.status!==0)throw new Error(`model use failed (${r.status}): ${r.stdout}${r.stderr}`);}
    if(trusted){const r=await box.profile.talos(['project','trust','--include-nested']);if(r.status!==0)throw new Error(`project trust failed (${r.status}): ${r.stdout}${r.stderr}`);}
    box.launch=(args=[],size={})=>{
      const open=box.sessions.find(s=>!s.exit);if(open)throw new Error('one TALOS at a time: close the previous session first');
      const session=TerminalSession.launch(box.profile!,args,size);box.sessions.push(session);return session;
    };
  });
  after(async()=>{
    for(const session of box.sessions)await session.close();
    /* S4: also a TALOS that left by another way than `exitTalos` (`/exit`, a command that ends it); read before the profile is removed */
    try{if(box.profile)assertNoExitBackstop(box.profile.home,`the end of ${name}`);}
    finally{await box.fake?.close();box.profile?.dispose();}
  });
  return box as Stage;
}

/* A5d (CLI 0.7.0, 19/11/2026; measured with a probe on s02, TALOS's own writes and the pty's chunks side by side): ConPTY does not keep a
   large frame whole. TALOS writes the frame as ONE synchronized write with the footer in it (frame-batcher.ts); ConPTY re-emits it as its
   own DEC 2026 block and lets the last rows out AFTER the block's end (BSU, 5970 chars, ESU, then the footer's 235 chars 9 ms later). The
   Home made the first frame large (the medal, mockup index.html:955), so a screen judged at the block's end has the composer and not yet
   the footer. Hermes names the same class for tmux: «BSU/ESU pass through to the outer terminal but tmux has already broken atomicity by
   chunking» (hermes-ink terminal.ts:71-73). A frame is whole once the pty has then been quiet for PAINT_GAP_MS (five times the gap measured);
   the predicate is judged again on that screen, so nothing is looser: a frame that stays without its footer is still the one returned. */
export const PAINT_GAP_MS=50;
export async function wholeFrame(t:TerminalSession,label:string,predicate:(s:Screen)=>boolean,{timeout=30_000}:{timeout?:number}={}):Promise<Screen>{
  const deadline=Date.now()+timeout;
  for(;;){
    await t.waitFor(label,predicate,{timeout:Math.max(1,deadline-Date.now())});
    await t.quiet(PAINT_GAP_MS,{timeout:Math.max(1,deadline-Date.now())});await t.settled();
    const screen=t.screen();
    if(screen.text.trim()!==''&&predicate(screen))return screen;
    if(Date.now()>=deadline)throw new Error(`${label}: timed out after ${timeout} ms waiting for a whole frame\n${t.dump(label)}`);
  }
}

/** First paint, then skip the boot animation with a key (it is consumed), then wait for the idle composer. `whole` judges only a
 *  whole frame (wholeFrame above): for a scenario that checks the footer of the first screen. */
export async function toComposer(t:TerminalSession,{skipBoot=true,whole=false}={}){
  const first=await t.waitFor('first paint',s=>s.text.trim()!=='',{timeout:30_000});
  /* Only while the boot is on screen: after it the key would land in the composer. */
  if(skipBoot&&/BOOT\s+\d+%/u.test(first.text))t.press('space');
  const ready=(s:Screen)=>composerReady(s)&&idleFooter(s);
  return whole?wholeFrame(t,'the composer is ready',ready,{timeout:30_000}):t.waitFor('the composer is ready',ready,{timeout:30_000});
}

/**
 * The synthetic terminal reports window focus (DEC 1004: ESC [ I / ESC [ O) the way a real one does: only once the mode is on. TALOS asks
 * for the reports before its first frame (R4-G, 07/10), but the pseudo console still needs a moment to apply the app's `?1004h` to its
 * input side, and drops a report that comes earlier. Measured 07/10 on the fixed build (`scratchpad/pd/focus-matrix.ts`, composer seen
 * -> report): 0 ms lost 2 of 24; 40, 80, 150 and 300 ms lost 0 of 40 each. Before the fix, 10 of 14 sent at 0 ms were lost.
 */
export const FOCUS_SETTLE_MS=150;
export async function focusReport(t:TerminalSession,focused:boolean){await t.observe(FOCUS_SETTLE_MS);t.send(focused?'\u001b[I':'\u001b[O');}

/** Send a prompt and wait until the fake has received it and the session is idle again. */
export async function turn(t:TerminalSession,fake:FakeProvider,prompt:string,{timeout=40_000}={}){
  const before=fake.chatRequests().length;
  await t.submit(prompt);
  /* R3 close (2026-09-24): the provider can receive the request before TALOS has redrawn, so a stale frame (the prompt
     still in the composer, the previous turn's `done` in the footer) looked like the end of this turn (s11 MD). The turn
     has ended when the composer is empty again, the prompt is in the transcript and the footer is idle. */
  await t.waitFor(`the turn "${prompt}" reached the provider and ended`,s=>fake.chatRequests().slice(before).some(r=>r.lastUser?.includes(prompt))&&idleFooter(s)&&composerReady(s)&&s.text.includes(prompt.slice(0,40)),{timeout});
  return t.screen();
}

/* A5d (CLI 0.7.0, 19/11/2026): a scroll key has landed when the screen shows it, not when the pty has been quiet. The 0.6.16 kit's s37 red
   («back to the end: the screen differed from a full repaint at row 1», the screen before Ctrl+L still scrolled up, the one after at the end)
   is a TALOS that handled PgDn PgDn Ctrl+End after the 300 ms + 400 ms of quiet a loaded machine allows: reproduced 3 of 3 with the keys
   sent 900 ms late. The pill «↓ Jump to bottom» (transcript-virtualizer.ts, transcriptJumpPillRow) is on screen exactly while the view
   is scrolled up. */
const JUMP_PILL=/↓ Jump to bottom/u;
export const scrolledUp=(t:TerminalSession)=>t.waitFor('the transcript scrolled up',s=>JUMP_PILL.test(s.text),{timeout:15_000});
/** A further PgUp moved the view, or the view was already at its top (`atTop`, the scenario's first row). */
export const scrolledFurther=(t:TerminalSession,previous:Screen,atTop:(s:Screen)=>boolean)=>t.waitFor('the transcript scrolled further up, or it was at its top',s=>JUMP_PILL.test(s.text)&&(s.text!==previous.text||atTop(s)),{timeout:15_000});
export const atTheEnd=(t:TerminalSession)=>t.waitFor('the transcript is back at its end',s=>!JUMP_PILL.test(s.text)&&composerReady(s),{timeout:15_000});

/** Run a slash command: type it and press Enter once. R4 Q-R4-5: Enter runs the highlighted command (review D-10 is
 * closed); a second Enter would land in the surface the command opened (it confirmed the resume picker twice). */
export async function runCommand(t:TerminalSession,command:string,opened:(s:import('./terminal.ts').Screen)=>boolean,{timeout=15_000}={}){
  await t.submit(command);
  return t.waitFor(`${command} opened`,opened,{timeout});
}

/** Empty the composer with Backspace (one key per character; Ctrl+U only clears the current line today, review D-11). */
export async function clearComposer(t:TerminalSession){
  const {composerReady}=await import('./checks.ts');
  for(let i=0;i<400&&!composerReady(t.screen());i++){t.press('backspace');if(i%20===19)await t.settled();}
  return t.waitFor('the composer is empty',composerReady,{timeout:5_000});
}

/** Gate E6: the idle window is 5 s. */
/* Owner decision Q-R3-16 (2026-09-24): for 300 ms after an approval dialog appears, keys still go to the composer, so a key
   typed ahead never answers it. A scenario answers at a person's pace, after that grace. */
export const APPROVAL_ANSWER_DELAY_MS=450;
export async function answerApproval(t:TerminalSession,key:string){await new Promise(resolve=>setTimeout(resolve,APPROVAL_ANSWER_DELAY_MS));t.send(key);}
export const IDLE_WINDOW_MS=5_000;
/**
 * Gate E6 baseline: what ConPTY writes ON ITS OWN for an idle trivial Node child of the same size, over the same window.
 * The child writes nothing; its start-up bytes (ConPTY's own init) are let pass until the pty has been quiet for 1 s.
 * Call it while no TALOS is open (one pty at a time); the child is closed before this resolves.
 */
export async function idleBaseline(size:{cols:number;rows:number},ms=IDLE_WINDOW_MS):Promise<OutputCount&{startup:OutputCount}>{
  const child=new TerminalSession(process.execPath,['-e','setInterval(()=>{},1e9)'],{...size,cwd:tmpdir(),env:childEnvironment()});
  try{await child.quiet(1_000);const startup=child.output.read();return{...(await child.observe(ms)),startup};}
  finally{await child.close();}
}

/** Exit with Ctrl+C, pressed twice within 400 ms when one press does not exit (the documented `Ctrl+C Ctrl+C`, review
 * D-12; a double-press window is shorter than a pause of seconds), and wait for the process to end. */
export async function exitTalos(t:TerminalSession){
  t.press('ctrl+c');
  if(!await t.waitForExit(400))t.press('ctrl+c');
  const exited=await t.waitForExit(10_000);await t.settled();
  /* 01/10: s38 failed here twice, only inside the full acceptance run (never alone or after s37). When TALOS does not
     exit, the screen it was showing is the evidence: print it, so the failing run says why. */
  if(!exited)console.error(`exitTalos: TALOS did not exit 10 s after Ctrl+C Ctrl+C. Screen:\n${t.screen().text}`);
  /* S4 (third review of 0.6.2): it exited — by itself, or because the exit backstop cut it two seconds after the screen? The
     second is the failure this function existed to catch before the backstop hid it: the scenario fails, naming what held it. */
  if(exited&&t.profileHome)assertNoExitBackstop(t.profileHome,'exitTalos',{requireLog:true});
  return exited;
}
