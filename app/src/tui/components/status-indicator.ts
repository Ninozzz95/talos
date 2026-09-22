import {frameIndex,stableElapsedLabel} from '../render-scheduler.ts';

export type BusyKind='starting'|'thinking'|'tool'|'compacting'|'connecting'|'updating'|'idle'|'error';
export function busyIndicatorText({kind,elapsedMs,frame,unicode,frames}:{kind:BusyKind;elapsedMs:number;frame:number;unicode:boolean;frames?:readonly string[]}){
  const spinnerFrames=frames?.length?frames:(unicode?['⠋','⠙','⠹','⠸']:['-','\\','|','/']);
  const glyph=kind==='idle'?' ':kind==='error'?'!':spinnerFrames[Math.abs(frame)%spinnerFrames.length]!;
  const verb=kind.padEnd(10,' ');
  const elapsed=kind==='idle'||kind==='error'?'     ':stableElapsedLabel(elapsedMs);
  return `${glyph} ${verb} ${elapsed}`;
}

export function createStatusIndicatorComponent(React:any,Ink:any){
  return function StatusIndicator({kind,startedAt,motion,unicode,frames,color}:{kind:BusyKind;startedAt:number;motion:boolean;unicode:boolean;frames?:readonly string[];color?:string}){
    const [now,setNow]=React.useState(()=>Date.now());
    React.useEffect(()=>{if(!motion||kind==='idle'||kind==='error')return;const timer=setInterval(()=>setNow(Date.now()),120);return()=>clearInterval(timer);},[kind,motion]);
    const elapsed=Math.max(0,now-startedAt);
    const frame=frameIndex(elapsed,120,4);
    return React.createElement(Ink.Text,{color},busyIndicatorText({kind,elapsedMs:elapsed,frame,unicode,...(frames?.length?{frames}: {})}));
  };
}
