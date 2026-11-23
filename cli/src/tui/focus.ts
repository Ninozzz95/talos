/* DEC 1004 (xterm). Filter before Ink 7.1.1 parses keys; bracketed paste belongs to Ink. */
import {StringDecoder} from 'node:string_decoder';
import {PARTIAL_SEQUENCE_HOLD_MS} from './input-timing.ts';
const ESC='\u001b',IN=`${ESC}[I`,OUT=`${ESC}[O`,PASTE_IN=`${ESC}[200~`,PASTE_OUT=`${ESC}[201~`;
export function createFocusFilter(onFocus:(focused:boolean)=>void){
  let carry='',pasting=false,armed=0,escAt=0,ghost=false;
  return{
    take(text:string):string{
      let input=carry+text;carry='';
      const fresh=Date.now();
      /* REV-ESC-PTY (07/10): a lone ESC is never held (see mouse.ts) — it passes through and this
         filter is armed for 60 ms, so a focus/paste sequence split right after its first byte is
         still reassembled and taken out. While Ink still holds that ESC pending (<20 ms) a rebuilt
         marker reaches it WITHOUT its ESC (ghost); past 20 ms every ESC is real again. */
      const continuing=armed&&fresh-armed<=60&&input.startsWith('[')&&!input.startsWith(ESC);
      if(continuing){input=ESC+input;ghost=fresh-escAt<20;}
      else if(!input.startsWith(ESC))ghost=false;
      armed=0;
      let output='',at=0;
      while(at<input.length){
        const escape=input.indexOf(ESC,at);
        if(escape<0){output+=input.slice(at);break;}
        output+=input.slice(at,escape);at=escape;
        const tail=input.slice(at),tokens=pasting?[PASTE_OUT]:[IN,OUT,PASTE_IN];
        const token=tokens.find(value=>tail.startsWith(value));
        if(token){
          if(token===IN||token===OUT)onFocus(token===IN);
          else{pasting=token===PASTE_IN;output+=ghost&&at===0?token.slice(1):token;}
          ghost=false;at+=token.length;
        }else if(tail.length>1&&tokens.some(value=>value.startsWith(tail))){if(at>0)ghost=false;carry=tail;break;}
        else{
          /* Unknown sequence: the ghost ESC is Ink's own pending one — do NOT send it again. */
          if(!(ghost&&at===0))output+=ESC;
          ghost=false;at++;
          if(at===input.length){armed=Date.now();escAt=Date.now();ghost=false;}
        }
      }
      return output;
    },
    pending:()=>carry.length>0,
    flush(){const text=carry;carry='';return text;},
  };
}

/** Ambiguous ESC prefixes wait at most PARTIAL_SEQUENCE_HOLD_MS (input-timing.ts); a lone Esc still reaches Ink as a key. */
export function installFocusFilter(stdin:{read:(...args:any[])=>any;emit?:(name:string)=>unknown},onFocus:(focused:boolean)=>void):()=>void{
  const filter=createFocusFilter(onFocus),original=stdin.read;
  const decoder=new StringDecoder('utf8');
  let timer:ReturnType<typeof setTimeout>|undefined,ready='',buffer=false;
  const clear=()=>{if(timer){clearTimeout(timer);timer=undefined;}};
  stdin.read=function(this:any,...args:any[]){
    if(ready){const text=ready;ready='';return buffer?Buffer.from(text,'utf8'):text;}
    const chunk=original.apply(this,args);if(chunk===null||chunk===undefined)return chunk;
    clear();buffer=Buffer.isBuffer(chunk);
    const kept=filter.take(buffer?decoder.write(chunk):String(chunk));
    if(filter.pending())timer=setTimeout(()=>{timer=undefined;ready=filter.flush();stdin.emit?.('readable');},PARTIAL_SEQUENCE_HOLD_MS);
    return buffer?Buffer.from(kept,'utf8'):kept;
  };
  return()=>{clear();ready='';filter.flush();stdin.read=original;};
}
