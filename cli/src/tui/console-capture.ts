import {formatWithOptions} from 'node:util';

/*
 * Owner decision 02/10 («Nel registro + avviso discreto», registro 12). While the TUI is up, the console belongs to it:
 * the kernel runs in this process and writes to it (`console.error` on a failed save; pdf.js's three warnings when it loads
 * without @napi-rs/canvas, `legacy/build/pdf.mjs` `warn()`), and Ink's patchConsole would clear the frame, write the line
 * and redraw — in fullscreen the lines pile up over the TUI. So the five methods go to the development log (`talos logs`),
 * never onto the screen; real warnings and errors are counted for a small status segment. As Gemini CLI's ConsolePatcher
 * (`packages/cli/src/ui/utils/ConsolePatcher.ts`): log, info, warn, error and debug, all put back on exit — and a method
 * someone else replaced meanwhile is theirs, left alone.
 */
export type ConsoleLevel='log'|'info'|'warn'|'error'|'debug';
const LEVELS:readonly ConsoleLevel[]=['log','info','warn','error','debug'];
/* pdf.js in Node without its optional native canvas: expected, harmless for text extraction, logged but not counted */
const EXPECTED:readonly RegExp[]=[
  /^Warning: Cannot load "@napi-rs\/canvas" package/u,
  /^Warning: Cannot polyfill `(?:DOMMatrix|Path2D|ImageData)`/u,
];

type Target=Record<ConsoleLevel,(...args:unknown[])=>void>;
export type ConsoleCapture={count():number;restore():void};

export function installConsoleCapture({target=console as unknown as Target,record,onCount}:{target?:Target;record:(level:ConsoleLevel,text:string)=>void;onCount?:(count:number)=>void}):ConsoleCapture{
  const originals=new Map<ConsoleLevel,(...args:unknown[])=>void>();
  const installed=new Map<ConsoleLevel,(...args:unknown[])=>void>();
  let counted=0;
  for(const level of LEVELS){
    originals.set(level,target[level]);
    const replacement=(...args:unknown[])=>{
      const text=formatWithOptions({colors:false},...args);
      try{record(level,text);}catch{/* a broken log never breaks the caller */}
      if((level==='warn'||level==='error')&&!EXPECTED.some(pattern=>pattern.test(text))){
        counted+=1;
        try{onCount?.(counted);}catch{/* same */}
      }
    };
    installed.set(level,replacement);
    target[level]=replacement;
  }
  let restored=false;
  return{
    count:()=>counted,
    restore(){
      if(restored)return;restored=true;
      for(const level of LEVELS)if(target[level]===installed.get(level))target[level]=originals.get(level)!;
    },
  };
}
