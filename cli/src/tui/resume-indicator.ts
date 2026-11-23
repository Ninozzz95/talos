import {activityClock} from './activity-line.ts';
import {activityWord} from './components/status-indicator.ts';
import {MOTION_FRAME_MS,frameIndex} from './render-scheduler.ts';

/*
 * Owner request, 05/10 evening: while the boot holds the screen (first start or resume — the slow case measured 5-57 s in
 * RICERCA-5x5x5x5-OTTIMIZZAZIONE-CLI), the boot frames are followed by ONE loading line: glyph, phase word, elapsed clock.
 * Design from RICERCA-5x5x5x5-TUI-LOADING-RESUME-2026-10-05 (reviewed adversarially 06/10 — see the phase gate below):
 * - the line shows only in the boot's `waiting` phase, which exists ONLY when the boot's own choreography is over (600 ms
 *   short / 1 s static / 7.2 s full reveal) and the runtime is STILL not ready: a healthy boot never reaches that phase
 *   (`completeBoot` goes straight to `ready` when `runtimeReady` is already true), so it never shows the line — a stalled
 *   one does, and it never changes the layout again (one row, constant height, hermes ink.tsx:907). The 400 ms floor stays
 *   as belt and braces, not as the trigger (an earlier draft gated on elapsed only: healthy boots finishing just past the
 *   reveal flashed the line for a frame — review finding A3);
 * - motion: the theme's own spinner glyphs on the shared 120 ms frame (MOTION_FRAME_MS, the same cadence as the roster);
 *   reduced motion: a static bullet with the clock still moving (codex motion.rs keeps a static bullet), ticking at 1 Hz;
 * - the word is the existing `starting` of the BusyKind vocabulary, so start and resume say the same honest thing;
 * - the timer lives in this component's own state and dies with it: when the boot region unmounts (ready or error) the
 *   last tick is the last render — the B1 slice 20 lesson (no idle render loop after the boot).
 */

/** Belt-and-braces floor: even in `waiting` the line never shows before this much of the boot has elapsed. */
export const RESUME_INDICATOR_APPEAR_MS=400;
/** Reduced motion: no spinner to animate, but the clock must still move — one tick a second. */
export const RESUME_INDICATOR_TICK_MS_REDUCED=1000;

export function resumeIndicatorVisible(phase:'revealing'|'waiting'|'ready'|'error',elapsedMs:number):boolean{
  if(phase!=='waiting')return false;
  return elapsedMs>=RESUME_INDICATOR_APPEAR_MS;
}

export function resumeIndicatorText({elapsedMs,glyphs,motion}:{elapsedMs:number;glyphs:{spinner:readonly string[];bullet:string};motion:boolean}):string{
  const glyph=motion?glyphs.spinner[frameIndex(elapsedMs,MOTION_FRAME_MS,glyphs.spinner.length)]!:glyphs.bullet;
  return `${glyph} ${activityWord('starting')} · ${activityClock(elapsedMs)}`;
}

export function createResumeIndicatorComponent(React:any,Ink:any){
  return function ResumeIndicator({phase,startedAt,motion,glyphs,color}:{phase:'revealing'|'waiting'|'ready'|'error';startedAt:number;motion:boolean;glyphs:{spinner:readonly string[];bullet:string};color?:string}){
    /* Rules of hooks: the timer effect runs on EVERY render, before any early return — an earlier draft returned null
       before the effect, so an invisible indicator never armed its timer and the line could never appear on its own
       (caught by the component-level tests, review A follow-up 06/10). */
    const [now,setNow]=React.useState(()=>Date.now());
    const period=motion?MOTION_FRAME_MS:RESUME_INDICATOR_TICK_MS_REDUCED;
    React.useEffect(()=>{
      if(phase==='ready'||phase==='error')return; /* belt and braces: the boot region unmounts us on both */
      const timer=setInterval(()=>setNow(Date.now()),period);
      return()=>clearInterval(timer);
    },[period,phase]);
    const elapsed=Math.max(0,now-startedAt);
    if(!resumeIndicatorVisible(phase,elapsed))return null;
    return React.createElement(Ink.Text,{dimColor:true,color},resumeIndicatorText({elapsedMs:elapsed,glyphs,motion}));
  };
}
