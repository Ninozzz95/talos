/*
 * R4 lane N — Q-R4-7 / gate E7: one exit rule, decided in interrupt.ts. With a draft, Ctrl+C and Esc Esc clear it (the app
 * puts it in history first); the double Ctrl+C exit (2 s, R1) only on an empty composer; Ctrl+D = Ctrl+C on an empty
 * composer (with a draft it deletes at the cursor); an open picker or dialog is closed by Ctrl+C / Ctrl+D before any exit
 * is armed. The controller reads the composer/dialog context through the `context` callback the app injects.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {ESC_CLEAR_WINDOW_MS,EXIT_CONFIRM_WINDOW_MS,EXIT_HINT,createInterruptController,exitHintText} from '../../src/tui/interrupt.ts';

type Context={draft:boolean;dialog:boolean;completion:boolean};
function controller(start:Partial<Context>={}){
  let now=1000;const ctx:Context={draft:false,dialog:false,completion:false,...start};
  const i=createInterruptController({now:()=>now,context:()=>ctx});
  return{i,ctx,advance(ms:number){now+=ms;}};
}

test('R4-N Ctrl+C with a draft clears it and never arms the exit',()=>{
  const {i,ctx,advance}=controller({draft:true});
  assert.equal(i.ctrlC(false),'clear-draft');
  assert.equal(i.exitArmed(),false);
  ctx.draft=false;advance(100);
  assert.equal(i.ctrlC(false),'arm-exit','the clear is not the first of the two exit presses');
  advance(500);
  assert.equal(i.ctrlC(false),'exit');
});

test('R4-N a draft typed after the exit was armed is cleared, not exited, and disarms',()=>{
  const {i,ctx,advance}=controller();
  assert.equal(i.ctrlC(false),'arm-exit');
  ctx.draft=true;advance(200);
  assert.equal(i.ctrlC(false),'clear-draft');
  assert.equal(i.exitArmed(),false);
  ctx.draft=false;advance(200);
  assert.equal(i.ctrlC(false),'arm-exit');
});

test('R4-N Ctrl+C closes an open picker or dialog before arming any exit',()=>{
  const {i,ctx,advance}=controller({dialog:true,draft:true});
  assert.equal(i.ctrlC(false),'close-dialog');
  assert.equal(i.exitArmed(),false);
  ctx.dialog=false;ctx.draft=false;advance(100);
  assert.equal(i.ctrlC(false),'arm-exit');
  /* armed, then a dialog opens: Ctrl+C closes it and the pending exit is dropped */
  ctx.dialog=true;advance(100);
  assert.equal(i.ctrlC(false),'close-dialog');
  ctx.dialog=false;advance(100);
  assert.equal(i.ctrlC(false),'arm-exit');
  /* a dialog open during a run is closed before the run is cancelled */
  ctx.dialog=true;advance(3000);
  assert.equal(i.ctrlC(true),'close-dialog');
});

test('R4-N during a run Ctrl+C still cancels (R1), with or without a draft',()=>{
  const {i,advance}=controller({draft:true});
  assert.equal(i.ctrlC(true),'cancel');
  advance(300);
  assert.equal(i.ctrlC(true),'force-exit');
});

test('R4-N Ctrl+D: delete at the cursor with a draft; on an empty composer the same two-press exit as Ctrl+C',()=>{
  const {i,ctx,advance}=controller({draft:true});
  assert.equal(i.ctrlD(false),'delete-forward');
  assert.equal(i.exitArmed(),false);
  ctx.draft=false;advance(100);
  assert.equal(i.ctrlD(false),'arm-exit','one Ctrl+D on an empty composer no longer exits');
  assert.equal(i.armedBy(),'ctrl-d');
  advance(EXIT_CONFIRM_WINDOW_MS-1);
  assert.equal(i.ctrlD(false),'exit');
  /* either key confirms the other: one armed state */
  advance(5000);
  assert.equal(i.ctrlD(false),'arm-exit');advance(100);
  assert.equal(i.ctrlC(false),'exit');
  advance(5000);
  ctx.dialog=true;
  assert.equal(i.ctrlD(false),'close-dialog');
  ctx.dialog=false;advance(100);
  assert.equal(i.ctrlD(true),'cancel','during a run Ctrl+D on an empty composer does what Ctrl+C does');
});

test('R4-N Esc Esc within the window clears a draft; a slower second Esc does not',()=>{
  const {i,ctx,advance}=controller({draft:true});
  assert.equal(ESC_CLEAR_WINDOW_MS,500);
  assert.equal(i.esc(false),'esc');
  advance(ESC_CLEAR_WINDOW_MS);
  assert.equal(i.esc(false),'clear-draft');
  assert.equal(i.esc(false),'esc','the clear consumed the pair');
  advance(ESC_CLEAR_WINDOW_MS+1);
  assert.equal(i.esc(false),'esc','too slow: this Esc starts a new pair');
  advance(10);
  assert.equal(i.esc(false),'clear-draft');
  /* empty composer: Esc Esc does nothing more than Esc */
  ctx.draft=false;advance(10);
  assert.equal(i.esc(false),'esc');advance(10);
  assert.equal(i.esc(false),'esc');
});

test('R4-N Esc stops a run, closes an @ list first, and a key in between breaks the pair',()=>{
  const {i,ctx,advance}=controller({draft:true,completion:true});
  assert.equal(i.esc(false),'close-completion');
  ctx.completion=false;advance(100);
  assert.equal(i.esc(false),'esc','closing the list is not the first Esc of a pair');
  advance(100);
  assert.equal(i.ctrlC(true),'cancel');
  advance(100);
  assert.equal(i.esc(false),'esc','a Ctrl+C in between breaks the pair');
  advance(100);
  assert.equal(i.esc(true),'stop-run');
  advance(100);
  assert.equal(i.esc(false),'esc','stopping a run is not the first Esc of a pair');
});

test('R4-N the exit hint names the key that armed it; the R1 constant is unchanged',()=>{
  assert.equal(EXIT_HINT,'Press Ctrl+C again to exit');
  assert.equal(exitHintText('ctrl-c'),'Press Ctrl+C again to exit');
  assert.equal(exitHintText('ctrl-d'),'Press Ctrl+D again to exit');
});

test('R4-N without an injected context the R1 behaviour is unchanged',()=>{
  let now=0;const i=createInterruptController({now:()=>now});
  assert.equal(i.ctrlC(false),'arm-exit');now+=1600;
  assert.equal(i.ctrlC(false),'exit');
});
