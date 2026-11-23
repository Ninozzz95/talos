/*
 * UI plan, Phase 3 introduced mouse reports for the wheel. REV-NATIVE-SELECTION (28/09): keep native terminal text
 * selection by default; ui.mouse:true explicitly enables the wheel reports when the person wants them.
 * Scope of this pass: the wheel scrolls the conversation. Clicks are not handled yet; their reports are dropped so that
 * none ever reaches the composer as text.
 *
 * How: in the alternate screen TALOS asks the terminal for button reports (DEC 1000) in SGR form (DEC 1006:
 * `ESC[<b;x;yM` / `…m`), the form Claude Code, Codex and OpenCode use. Ink 7 has no mouse API and reads its input with
 * `stdin.read()` in `handleReadable` (ink/build/components/App.js:175-199), so the reports are taken out right there, on
 * `stdin.read`, before Ink's parser sees them. Holding Shift keeps the terminal's own text selection (the terminal skips
 * the reports then). The reports are switched off before TALOS leaves, and on any exit of the process.
 */
import {StringDecoder} from 'node:string_decoder';
import {PARTIAL_SEQUENCE_HOLD_MS} from './input-timing.ts';
/* Stage 6c (owner 02/10): DEC 1002 too — the motion while a button is held, which a drag selection needs (xterm ctlseqs). */
export const MOUSE_ON='\u001b[?1000h\u001b[?1002h\u001b[?1006h';
export const MOUSE_OFF='\u001b[?1006l\u001b[?1002l\u001b[?1000l';
/** Stage 6c: a button report, 0-based cells; `drag` is the motion with a button held (DEC 1002). */
export type PointerEvent={kind:'press'|'drag'|'release';button:number;col:number;row:number;shift:boolean;alt:boolean;ctrl:boolean};

const ESC='\u001b',PASTE_IN=ESC+'[200~',PASTE_OUT=ESC+'[201~';
const REPORT=/^\u001b\[<(\d+);(\d+);(\d+)([Mm])/u;
const PARTIAL=/^\u001b(?:\[(?:<[\d;]*)?)?$/u;

/** Wheel: -1 = up (towards older rows), +1 = down. Buttons 64/65, with Shift/Meta/Ctrl bits (4/8/16) ignored. */
export function createMouseFilter(onWheel:(delta:-1|1)=>void,onPointer?:(event:PointerEvent)=>void){
  let carry='',pasting=false,armed=0,escAt=0,ghost=false;
  return{take(text:string):string{
    let input=carry+text;carry='';
    const fresh=Date.now();
    /* REV-ESC-PTY (07/10): a lone ESC is never held — held, it died in the give-back dance
       (Esc mute, Voce 13bis). It goes straight through and the filter is armed for 60 ms: a chunk
       that opens with '[' is re-prepended with the SAME ESC, so a report or paste marker split
       right after its first byte is still reassembled and taken out (the old guarantees) while the
       Esc key itself reaches Ink at once. While Ink still holds that ESC pending (<20 ms) the
       rebuilt marker must reach it WITHOUT its ESC ("ghost" — sending it again would duplicate
       it); past 20 ms Ink has flushed the ESC as a key and every ESC is real again. */
    const continuing=armed&&fresh-armed<=60&&input.startsWith('[')&&!input.startsWith(ESC);
    if(continuing){input=ESC+input;ghost=fresh-escAt<20;}
    else if(!input.startsWith(ESC))ghost=false;
    /* else: the head ESC comes from a carried partial — ghost keeps its previous truth. */
    armed=0;
    let output='',at=0;
    while(at<input.length){
      const escape=input.indexOf(ESC,at);
      if(escape<0){output+=input.slice(at);break;}
      output+=input.slice(at,escape);at=escape;
      const tail=input.slice(at),pasteToken=pasting?PASTE_OUT:PASTE_IN;
      if(tail.startsWith(pasteToken)){
        pasting=!pasting;
        output+=ghost&&at===0?pasteToken.slice(1):pasteToken;
        ghost=false;at+=pasteToken.length;continue;
      }
      const report=pasting?null:REPORT.exec(tail);
      if(report){
        const raw=Number(report[1]),code=raw&~(4|8|16);
        if(code===64)onWheel(-1);else if(code===65)onWheel(1);
        /* stage 6c: SGR `M` is a press or (+32) a motion with a button held, `m` a release; Shift +4, Meta +8, Ctrl +16 */
        else if(code<64)onPointer?.({kind:report[4]==='m'?'release':code&32?'drag':'press',button:code&3,col:Number(report[2])-1,row:Number(report[3])-1,shift:Boolean(raw&4),alt:Boolean(raw&8),ctrl:Boolean(raw&16)});
        at+=report[0].length;ghost=false;continue;
      }
      /* A lone ESC is NEVER held. Held, it rode two 30 ms give-backs (mouse filter → focus filter)
         and could be cancelled or merged with the next chunk at Ink's `clearPendingInputFlush` —
         the Esc key died and the next key became an Alt chord (measured: sonda-palette-esc, theme
         panel open, Esc mute). Only REAL multi-byte partials wait here. */
      const partialEsc=tail.length>1&&(pasteToken.startsWith(tail)||(!pasting&&tail.length<=128&&PARTIAL.test(tail)));
      if(partialEsc){if(at>0)ghost=false;carry=tail;break;}
      /* Unknown sequence: the ghost ESC is Ink's own pending one — do NOT send it again. */
      if(!(ghost&&at===0))output+=ESC;
      ghost=false;at++;
      if(at===input.length){armed=Date.now();escAt=Date.now();ghost=false;}
    }
    return output;
  },pending:()=>carry.length>0,flush(){const text=carry;carry='';return text;}};
}

/** Wraps `stdin.read` so every chunk Ink reads has the reports taken out; returns the undo. */
export function installMouseFilter(stdin:{read:(...args:any[])=>any;emit?:(name:string)=>unknown},onWheel:(delta:-1|1)=>void,onPointer?:(event:PointerEvent)=>void):()=>void{
  const filter=createMouseFilter(onWheel,onPointer);const original=stdin.read,decoder=new StringDecoder('utf8');
  let timer:ReturnType<typeof setTimeout>|undefined,ready='',buffer=false,generation=0;
  const clear=()=>{if(timer){clearTimeout(timer);timer=undefined;}};
  /* Startup stage 1 (02/10, REV-INPUT-E2E): after the event loop was busy (the kernel loading under the screen), Node runs
     the overdue timer BEFORE it polls for input, so the rest of a split report that had already arrived was still unread
     and the held prefix went to the composer as text. The timer now gives one input poll first: setImmediate runs after
     the poll phase (Node «The event loop»: timers → poll → check), and a chunk read meanwhile starts a new generation. */
  const giveBack=(armed:number)=>{timer=undefined;setImmediate(()=>{if(armed!==generation||!filter.pending())return;ready=filter.flush();stdin.emit?.('readable');});};
  stdin.read=function(this:any,...args:any[]){
    if(ready){const text=ready;ready='';return buffer?Buffer.from(text,'utf8'):text;}
    const chunk=original.apply(this,args);
    if(chunk===null||chunk===undefined)return chunk;
    clear();generation++;buffer=Buffer.isBuffer(chunk);
    const text=buffer?decoder.write(chunk):String(chunk);
    const kept=filter.take(text);
    if(filter.pending()){const armed=generation;timer=setTimeout(()=>giveBack(armed),PARTIAL_SEQUENCE_HOLD_MS);}
    return buffer?Buffer.from(kept,'utf8'):kept;
  };
  return()=>{clear();ready='';filter.flush();stdin.read=original;};
}

/** Stage 6c (owner 02/10, «mouse acceso»): on by default in a full-screen interactive session; `ui.mouse:false` leaves the
 *  selection to the terminal (mockup /config «Off: your terminal selects as before»). It replaces REV-NATIVE-SELECTION (28/09). */
export function mouseWanted({alternateScreen,interactive,setting}:{alternateScreen:boolean;interactive:boolean;setting:boolean|undefined}):boolean{
  return alternateScreen&&interactive&&setting!==false;
}
