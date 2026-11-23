/*
 * Stage 5, cure 2 (key echo; measured in registro 12). Ink 7.1.1 writes each frame as three writes: the DEC 2026 begin,
 * the frame, the DEC 2026 end (`ink.js:221-232`). ConPTY, given the begin in a piece of its own, waits ~8 ms for the rest:
 * on the synthetic terminal a key took 10.2 ms to show, and 3.2 ms with the same bytes in one write (FarShell #2 is the
 * same family: echo late through ConPTY under synchronized output). Codex flushes a frame from one buffer and pi-tui
 * writes a frame as one string; here the begin is held, the frame's writes are joined to it, and the end sends the whole
 * as ONE write. A begin without its end is never held past the current turn of the event loop (a microtask flushes it),
 * and a write that carries a callback is never held, so nothing waits on TALOS's side.
 */
export const BSU='\u001B[?2026h';
export const ESU='\u001B[?2026l';

type Writable={write:(chunk:any,...args:any[])=>unknown};

/** Batches synchronized frames on `stream` until the returned function puts the original `write` back (flushing). */
export function batchSynchronizedFrames(stream:Writable):()=>void{
  const original=stream.write;
  let held:string[]|null=null;
  /* Review 1 (Codex, verified): a frame whose drawing stopped halfway (an exception between the begin and the end) is
     flushed CLOSED — a synchronized block must never stay open, terminals only have a safety timeout for it. */
  const flush=()=>{if(held===null)return;if(held[held.length-1]!==ESU)held.push(ESU);const chunk=held.join('');held=null;original.call(stream,chunk);};
  stream.write=function(chunk:any,...args:any[]){
    if(typeof chunk==='string'&&args.length===0){
      if(held===null&&chunk===BSU){held=[chunk];queueMicrotask(flush);return true;}
      if(held!==null){held.push(chunk);if(chunk===ESU)flush();return true;}
    }
    flush();
    return original.call(stream,chunk,...args);
  };
  return()=>{flush();stream.write=original;};
}
