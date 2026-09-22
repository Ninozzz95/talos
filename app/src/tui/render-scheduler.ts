export const COALESCE_WINDOW_MS=16;
export const MOTION_FRAME_MS=120;
export function frameIndex(elapsedMs:number,periodMs:number,frameCount:number){return frameCount<=1?0:Math.floor(Math.max(0,elapsedMs)/Math.max(1,periodMs))%frameCount;}
export function stableElapsedLabel(elapsedMs:number){return elapsedMs<1000?'     ':`${(elapsedMs/1000).toFixed(1).padStart(4,' ')}s`;}
