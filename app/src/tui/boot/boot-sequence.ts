import {DESKTOP_LOGO_SOURCE,TALOS_ASCII_FRAMES} from './desktop-logo.ts';
import {renderCinematicBoot,rowsToSegments,TALOS_BOOT_DURATION_MS,TALOS_GOLD_PALETTE} from './cinematic.ts';
import type {TerminalCapabilities} from '../terminal-capabilities.ts';

export type BootState={phase:'revealing'|'waiting'|'ready'|'error';startedAt:number;skipped:boolean;runtimeReady:boolean};
export function createBootState(startedAt:number):BootState{return{phase:'revealing',startedAt,skipped:false,runtimeReady:false};}
export function markBootReady(state:BootState,now:number):BootState{if(state.phase==='error')return state;const elapsed=Math.max(0,now-state.startedAt);const ready=state.skipped||elapsed>=TALOS_BOOT_DURATION_MS;return{...state,runtimeReady:true,phase:ready?'ready':state.phase};}
export function markBootError(state:BootState):BootState{return{...state,phase:'error'};}
export function skipBoot(state:BootState):BootState{return{...state,skipped:true,phase:state.runtimeReady?'ready':state.phase};}
export function completeBoot(state:BootState,now:number):BootState{if(state.phase==='error'||state.phase==='ready')return state;const elapsed=Math.max(0,now-state.startedAt);if(state.runtimeReady&&(state.skipped||elapsed>=TALOS_BOOT_DURATION_MS))return{...state,phase:'ready'};if(state.skipped||elapsed>=TALOS_BOOT_DURATION_MS)return{...state,phase:'waiting'};return state;}
export function bootPhaseAt(state:BootState,now:number):BootState['phase']{if(state.phase==='ready'||state.phase==='error')return state.phase;const elapsed=Math.max(0,now-state.startedAt);if(state.runtimeReady&&(state.skipped||elapsed>=TALOS_BOOT_DURATION_MS))return'ready';if(state.skipped||elapsed>=TALOS_BOOT_DURATION_MS)return'waiting';return'revealing';}
export function bootFrameAt(state:BootState,now:number,motion:boolean):number{const last=TALOS_ASCII_FRAMES.length-1;if(!motion||state.skipped||state.phase==='ready'||state.phase==='error')return last;const elapsed=Math.max(0,now-state.startedAt);return Math.min(last,Math.floor(elapsed/TALOS_BOOT_DURATION_MS*Math.max(1,last)));}
export function bootLinesAt(state:BootState,now:number,{motion,unicode,width=100}:{motion:boolean;unicode:boolean;width?:number}){const final=!motion||state.skipped||state.phase==='ready'||state.phase==='error';return renderCinematicBoot(Math.max(0,now-state.startedAt),width,unicode,final).lines;}

export function shouldRenderBootLogo(capabilities:TerminalCapabilities){return capabilities.interactive&&capabilities.color;}

export function createBootSequenceComponent(React:any,Ink:any){
  // `logo:false` draws the plain "starting" line and keeps only the timer that ends the boot: without it, a terminal
  // that gets no logo (no colour) had nothing to call `completeBoot`, and a runtime ready early waited for a key.
  return function BootSequence({state,logo=true,motion,unicode,width=100,accentColor,mutedColor,onComplete}:{state:BootState;logo?:boolean;motion:boolean;unicode:boolean;width?:number;accentColor?:string;mutedColor?:string;onComplete?:()=>void}){
    const [now,setNow]=React.useState(()=>Date.now());
    // B1 slice 20: the animation stops with its last frame. Past the reveal every tick redrew an identical logo, 30
    // times a second, for as long as the runtime kept the boot on screen — an idle render loop.
    React.useEffect(()=>{if(!logo||!motion||state.phase==='ready'||state.phase==='error'||state.skipped)return;const timer=setInterval(()=>{const at=Date.now();setNow(at);if(at-state.startedAt>=TALOS_BOOT_DURATION_MS)clearInterval(timer);},33);return()=>clearInterval(timer);},[logo,motion,state.startedAt,state.phase,state.skipped]);
    /*
     * B1 slice 20. The logo leaves when this timer says the reveal is over, so the timer must agree with the clock
     * `completeBoot` reads. Node runs timers on its own loop clock and promises no exact timing: seen through
     * Date.now() a 7,115 ms timer fired after 7,114, `completeBoot` found the reveal unfinished and returned the same
     * state, React skipped the render, nothing re-armed, and the logo waited for a key. ⇒ Re-read Date.now() when
     * the timer fires and re-arm for whatever is left.
     * ⛔ Only while `revealing`: in `waiting` the end is already signalled, and signalling again made a new state
     * object, a new `onComplete`, this effect again — a render loop for as long as the runtime was not ready.
     */
    React.useEffect(()=>{if(state.phase!=='revealing'||state.skipped)return;let timer:ReturnType<typeof setTimeout>|undefined;const settle=()=>{timer=undefined;const remaining=TALOS_BOOT_DURATION_MS-Math.max(0,Date.now()-state.startedAt);if(remaining>0){timer=setTimeout(settle,remaining);return;}onComplete?.();};settle();return()=>{if(timer!==undefined)clearTimeout(timer);};},[state.startedAt,state.phase,state.skipped,onComplete]);
    if(!logo)return React.createElement(Ink.Text,{color:accentColor},'starting');
    const phase=bootPhaseAt(state,now);const final=!motion||state.skipped||state.phase==='ready'||state.phase==='error';const frame=renderCinematicBoot(Math.max(0,now-state.startedAt),width,unicode,final);const rows=rowsToSegments(frame);
    return React.createElement(Ink.Box,{flexDirection:'column'},
      ...rows.map((segments,rowIndex)=>React.createElement(Ink.Text,{key:rowIndex,color:accentColor},...segments.map((segment,index)=>React.createElement(Ink.Text,{key:index,color:segment.level<0?undefined:(TALOS_GOLD_PALETTE[segment.level as 0|1|2|3|4]??accentColor)},segment.text)))),
      React.createElement(Ink.Text,{dimColor:true,color:mutedColor},phase==='error'?'startup failed':phase==='waiting'?'runtime synchronization…':frame.stage)
    );
  };
}
