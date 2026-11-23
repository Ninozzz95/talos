/*
 * Stage 5, cure 3 (key echo; measured in registro 12). Ink throttles frames (120 a second since cure 1, run.ts); a key that
 * lands right after a frame of a streaming answer waited for the window's end — p95 up to 19.6 ms while the rest stayed
 * under 16. As laborer's `requestImmediateRender()` (PR #648) and kiso (PR #79) do, a frame caused by input is painted at
 * once: whenever stdin has input TALOS asks Ink, on the next tick — after React's synchronous commit — to flush its pending
 * throttled frame and that frame's write. It is the `flush` Ink's own `settleThrottle` calls (`ink.js:125-137`); with
 * nothing pending it does nothing, so no frame is ever added. A burst in one tick asks once.
 */
type Flushable={flush?:()=>unknown};
export type InkThrottles={throttledOnRender?:Flushable;throttledLog?:Flushable};
type Input={on(event:'readable',listener:()=>void):unknown;off?(event:'readable',listener:()=>void):unknown;removeListener?(event:'readable',listener:()=>void):unknown};

export function installInputPaint({stdin,ink}:{stdin:Input;ink:InkThrottles}):()=>void{
  let asked=false;
  const paint=()=>{asked=false;ink.throttledOnRender?.flush?.();ink.throttledLog?.flush?.();};
  const onData=()=>{if(asked)return;asked=true;setImmediate(paint);};
  stdin.on('readable',onData);
  return()=>{(stdin.off??stdin.removeListener)?.call(stdin,'readable',onData);};
}
