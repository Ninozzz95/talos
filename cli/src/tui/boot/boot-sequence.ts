import {t} from '../../i18n/index.ts';
import type {BootMode} from '../launch-state.ts';
import {DESKTOP_LOGO_SOURCE,TALOS_ASCII_FRAMES} from './desktop-logo.ts';
import {renderCinematicBoot,rowsToSegments,TALOS_BOOT_DURATION_MS} from './cinematic.ts';
import type {TerminalCapabilities} from '../terminal-capabilities.ts';

/*
 * R4 Q-R4-4 (owner, 2026-09-24): how long the boot holds the screen when nobody presses a key.
 * - full, with motion: the whole cinematic reveal (5.2 s since 0.6.5, owner 14/10; 7.2 s before), on the first launch and after an update only;
 * - full, without motion (reduced motion, or no colour and so no logo): a static frame for at most 1 s — before R4 these
 *   terminals waited the whole reveal (7.2 s then) for an animation they never showed (measured 8,440 ms and 8,600 ms to the composer);
 * - short (every other launch): NO hold (P-A, owner 07/10 sera, «Compositore subito»). It was the final frame for 600 ms
 *   (Q-R4-4; owner 01/10 removed it for an instant start, 02/10 put it back so the logo did not flash by); measured 07/10
 *   those 600 ms were 70% of the 845 ms a warm start took to reach the composer, against ~100-250 ms for Codex and Claude Code.
 *   A launch with nothing to load (`initialBootState`: a plain start) opens straight on the composer; a launch that has a
 *   session to load keeps the boot screen only while it loads (registro 12 Voce 16).
 * The sequence that draws the boot owns this length: it signals the end with `onComplete`, and the state functions below
 * follow that signal instead of re-reading the reveal constant, so lane N passes only `mode` (the R4 contract).
 */
/** Owner 02/10: the animation ticks 60 times a second (Pi's 16 ms render floor; Ink's own limit is 120 since stage 5). */
export const BOOT_FRAME_MS=16;
export const SHORT_BOOT_MS=0;export const STATIC_BOOT_MS=1000;
export function bootRevealMs({mode,motion}:{mode:BootMode;motion:boolean}):number{return mode==='short'?SHORT_BOOT_MS:motion?TALOS_BOOT_DURATION_MS:STATIC_BOOT_MS;}
export type BootState={phase:'revealing'|'waiting'|'ready'|'error';startedAt:number;skipped:boolean;runtimeReady:boolean};
export function createBootState(startedAt:number):BootState{return{phase:'revealing',startedAt,skipped:false,runtimeReady:false};}
/* P-A: where the screen starts. A short boot with nothing to load (no resume, fork or prompt: `controller.initialize`
   returns at once for it) is already `ready`, so the first frame is the composer and the welcome. Anything with something to load,
   and every full boot, starts as before. Pi focuses its editor and accepts text while startup completes; Codex keeps the first
   composer editable while startup work continues (`startup_draft.rs`). */
export function initialBootState({mode,plainStart,now}:{mode:BootMode;plainStart:boolean;now:number}):BootState{return mode==='short'&&plainStart?{phase:'ready',startedAt:now,skipped:false,runtimeReady:true}:createBootState(now);}
/* R4: a runtime that becomes ready after the reveal ended (`waiting`, whatever its length) opens the composer at once. */
export function markBootReady(state:BootState,now:number):BootState{if(state.phase==='error')return state;const elapsed=Math.max(0,now-state.startedAt);const ready=state.skipped||state.phase==='waiting'||elapsed>=TALOS_BOOT_DURATION_MS;return{...state,runtimeReady:true,phase:ready?'ready':state.phase};}
export function markBootError(state:BootState):BootState{return{...state,phase:'error'};}
export function skipBoot(state:BootState):BootState{return{...state,skipped:true,phase:state.runtimeReady?'ready':state.phase};}
/* R4: `completeBoot` is the sequence's own signal that its reveal is over (BootSequence calls it only when its clock says so,
   re-reading Date.now(), B1 slice 20); the reveal can be 0, 1 s or the full 5.2 s, so the full length is no longer re-checked here. */
export function completeBoot(state:BootState,_now:number):BootState{if(state.phase==='error'||state.phase==='ready')return state;return{...state,phase:state.runtimeReady?'ready':'waiting'};}
export function bootPhaseAt(state:BootState,now:number):BootState['phase']{if(state.phase==='ready'||state.phase==='error'||state.phase==='waiting')return state.phase;const elapsed=Math.max(0,now-state.startedAt);if(state.runtimeReady&&(state.skipped||elapsed>=TALOS_BOOT_DURATION_MS))return'ready';if(state.skipped||elapsed>=TALOS_BOOT_DURATION_MS)return'waiting';return'revealing';}
export function bootFrameAt(state:BootState,now:number,motion:boolean):number{const last=TALOS_ASCII_FRAMES.length-1;if(!motion||state.skipped||state.phase==='ready'||state.phase==='error')return last;const elapsed=Math.max(0,now-state.startedAt);return Math.min(last,Math.floor(elapsed/TALOS_BOOT_DURATION_MS*Math.max(1,last)));}
export function bootLinesAt(state:BootState,now:number,{motion,unicode,width=100,rows}:{motion:boolean;unicode:boolean;width?:number;rows?:number}){const final=!motion||state.skipped||state.phase==='ready'||state.phase==='error';return renderCinematicBoot(Math.max(0,now-state.startedAt),width,unicode,final,rows===undefined?{}:{rows}).lines;}

export function shouldRenderBootLogo(capabilities:TerminalCapabilities){return capabilities.interactive&&capabilities.color;}

export function createBootSequenceComponent(React:any,Ink:any){
  // `logo:false` draws the plain "starting" line and keeps only the timer that ends the boot: without it, a terminal
  // that gets no logo (no colour) had nothing to call `completeBoot`, and a runtime ready early waited for a key.
  /* R4 CONTRACT (owner: lane F; lane N passes them from app.ts): `mode` from launch-state.ts bootPlan (Q-R4-4, full or
     short), `hint` the skip line to draw (dictionary id firstrun.boot.skipHint).
     R4 lane F: the hint defaults to the dictionary line, so the boot says a key skips it (s01 D-09) whether or not the caller
     passes it; an empty string draws no hint. It takes the place of the dim stage label, which repeated the stage name the
     frame already shows (`[SIGNAL ACQUISITION]` twice, gate §2.1). The short boot is the final frame without the counter. */
  /* Owner 14/10 (new boot): `glowBase` is the painted background, passed only when TALOS paints it. 0.6.6 (the medal): the
     medal's metal is mixed over it as each cell's background; with no known background there is no metal, only the gold dots
     (a dark bronze slab on a light terminal would be a stain). */
  return function BootSequence({state,logo=true,motion,unicode,width=100,rows,accentColor,mutedColor,glowBase,onComplete,mode='full',hint=t('firstrun.boot.skipHint')}:{state:BootState;logo?:boolean;motion:boolean;unicode:boolean;width?:number;rows?:number;accentColor?:string;mutedColor?:string;glowBase?:string;onComplete?:()=>void;mode?:BootMode;hint?:string}){
    const [now,setNow]=React.useState(()=>Date.now());
    // B1 slice 20: the animation stops with its last frame. Past the reveal every tick redrew an identical logo, 30
    // times a second, for as long as the runtime kept the boot on screen — an idle render loop.
    const animated=logo&&motion&&mode==='full';const revealMs=bootRevealMs({mode,motion:animated});
    React.useEffect(()=>{if(!animated||state.phase==='ready'||state.phase==='error'||state.skipped)return;const timer=setInterval(()=>{const at=Date.now();setNow(at);if(at-state.startedAt>=TALOS_BOOT_DURATION_MS)clearInterval(timer);},BOOT_FRAME_MS);return()=>clearInterval(timer);},[animated,state.startedAt,state.phase,state.skipped]);
    /*
     * B1 slice 20. The logo leaves when this timer says the reveal is over, so the timer must agree with the clock
     * `completeBoot` reads. Node runs timers on its own loop clock and promises no exact timing: seen through
     * Date.now() a 7,115 ms timer fired after 7,114, `completeBoot` found the reveal unfinished and returned the same
     * state, React skipped the render, nothing re-armed, and the logo waited for a key. ⇒ Re-read Date.now() when
     * the timer fires and re-arm for whatever is left.
     * ⛔ Only while `revealing`: in `waiting` the end is already signalled, and signalling again made a new state
     * object, a new `onComplete`, this effect again — a render loop for as long as the runtime was not ready.
     */
    React.useEffect(()=>{if(state.phase!=='revealing'||state.skipped)return;let timer:ReturnType<typeof setTimeout>|undefined;const settle=()=>{timer=undefined;const remaining=revealMs-Math.max(0,Date.now()-state.startedAt);if(remaining>0){timer=setTimeout(settle,remaining);return;}onComplete?.();};settle();return()=>{if(timer!==undefined)clearTimeout(timer);};},[state.startedAt,state.phase,state.skipped,onComplete,revealMs]);
    const phase=bootPhaseAt(state,now);
    const label=phase==='error'?t('firstrun.boot.failed'):phase==='waiting'?t('firstrun.boot.waiting'):hint;
    const labelText=label?React.createElement(Ink.Text,{dimColor:true,color:mutedColor},label):null;
    if(!logo)return labelText?React.createElement(Ink.Box,{flexDirection:'column'},React.createElement(Ink.Text,{color:accentColor},'starting'),labelText):React.createElement(Ink.Text,{color:accentColor},'starting');
    const final=!animated||state.skipped||state.phase==='ready'||state.phase==='error';const frame=renderCinematicBoot(Math.max(0,now-state.startedAt),width,unicode,final,{counter:mode==='full',...(rows===undefined?{}:{rows})});const painted=rowsToSegments(frame,glowBase?{glowBase}:{});
    /* Owner 14/10 (new boot), seen in the synthetic terminal: an empty Ink.Text takes no row, so a row the particles had just
       left collapsed and the whole picture jumped up a line. The mockup is a fixed grid: an empty row is one space. */
    return React.createElement(Ink.Box,{flexDirection:'column'},
      ...painted.map((segments,rowIndex)=>segments.length===0?React.createElement(Ink.Text,{key:rowIndex},' '):React.createElement(Ink.Text,{key:rowIndex,color:accentColor},...segments.map((segment,index)=>React.createElement(Ink.Text,{key:index,...(segment.color?{color:segment.color}:{}),...(segment.background?{backgroundColor:segment.background}:{})},segment.text)))),
      ...(labelText?[labelText]:[])
    );
  };
}
