import {TALOS_ASCII_FRAMES} from './boot/desktop-logo.ts';
export const BOOT_FRAMES=Object.freeze(TALOS_ASCII_FRAMES.map((_,index)=>String(index)));
export type BootPhase='loading'|'ready'|'error';
export function bootLabel(_frame:number,phase:BootPhase,detail=''){const mark=phase==='loading'?'…':phase==='ready'?'✓':'!';const status=phase==='loading'?'starting':phase;return `TALOS ${mark} ${status}${detail?` · ${detail}`:''}`;}
