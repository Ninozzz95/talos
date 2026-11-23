/*
 * The hand pointer over what a click opens (owner 08/10/2026: «gli elementi cliccabili col puntatore dovrebbero avere cursore
 * pointer»; 09/10 «Solo dove funziona (Consigliata)»). OSC 22 sets the terminal's mouse pointer: `ESC ] 22 ; <shape> ESC \`
 * (kitty pointer-shapes, CSS names, since 0.31; Ghostty since 1.0.0, CSS names; foot since 1.12). xterm takes X11 cursor
 * names instead, and Windows Terminal does not implement it (no trace in microsoft/terminal, 09/10/2026), so TALOS asks for
 * the pointer only where it is known to work: it needs the motion with no button held (DEC 1003), a report on every move,
 * which no other terminal should pay for.
 */
export const HOVER_ON='\u001b[?1003h';
export const HOVER_OFF='\u001b[?1003l';
const shape=(name:string)=>`\u001b]22;${name}\u001b\\`;

/** kitty, Ghostty and foot, read from what they put in the environment. */
export function pointerShapeSupported(env:Record<string,string|undefined>=process.env):boolean{
  if(env.SSH_CONNECTION||env.SSH_CLIENT)return false;
  if(env.KITTY_WINDOW_ID||env.TERM==='xterm-kitty')return true;
  if((env.TERM_PROGRAM??'').toLowerCase()==='ghostty'||env.TERM==='xterm-ghostty')return true;
  return /^foot(?:-|$)/u.test(env.TERM??'');
}

/** Writes the shape only when it changes; `reset` gives the terminal its own pointer back. */
export function createPointerShape(write:(sequence:string)=>void){
  let hand=false;
  return{
    hover(over:boolean){if(over===hand)return;hand=over;write(shape(over?'pointer':'default'));},
    reset(){if(!hand)return;hand=false;write(shape('default'));},
  };
}
