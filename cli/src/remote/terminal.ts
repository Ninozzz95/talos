/*
 * 0.6.15: `talos remote` in the person's own terminal, not the alternate screen — the mockup draws it after the shell prompt and
 * leaves the result there («PS C:\…> talos remote … ✓ paired …», then the prompt again). So the rows are painted inline and a new
 * frame replaces the previous one in place (cursor up over the lines drawn, erase below), as `npm` and Codex draw their prompts.
 * Colours are the TUI theme's palette (the same tokens as the mockup's terminal: accent, dim, faint, ok, warn, bad); without colour
 * the words stay and only the QR keeps its two colours, because a QR without its light ground cannot be scanned.
 * Keys: raw mode, arrows, Enter, Esc, Backspace, printable characters; Ctrl+C ends the input (the flow treats it as Esc).
 */
import type {TuiTheme} from '../tui/theme.ts';
import type {PairingKey} from './pairing-flow.ts';
import type {RemoteRow,RemoteStyle} from './pairing-view.ts';

/* the mockup's QR ground and modules (`--qr-light` #f3efe6, `--qr-dark` #0b0c0e) */
export const QR_LIGHT='#f3efe6';
export const QR_DARK='#0b0c0e';

const ESC='\u001b[';
function rgb(hex:string|undefined):[number,number,number]|null{
  const m=/^#([0-9a-f]{6})$/iu.exec(hex??'');
  if(!m)return null;
  const n=parseInt(m[1]!,16);return[(n>>16)&255,(n>>8)&255,n&255];
}
const fg=(hex:string|undefined)=>{const c=rgb(hex);return c?`${ESC}38;2;${c[0]};${c[1]};${c[2]}m`:'';};
const bg=(hex:string|undefined)=>{const c=rgb(hex);return c?`${ESC}48;2;${c[0]};${c[1]};${c[2]}m`:'';};
const RESET=`${ESC}0m`;
const BOLD=`${ESC}1m`;

/** One row as terminal text: the theme's colours for each style, or plain words when `colors` is empty (no colour). */
export function paintRow(row:RemoteRow,colors:TuiTheme['colors']):string{
  const color=Boolean(colors.accent);
  const styleOf:Record<RemoteStyle,string>={
    plain:'',dim:fg(colors.muted),faint:fg(colors.faint),accent:fg(colors.accent),accentBold:`${BOLD}${fg(colors.accent)}`,
    bold:BOLD,ok:fg(colors.success),warn:fg(colors.warning),bad:fg(colors.danger),sas:`${BOLD}${fg(colors.accent)}`,
    qr:`${fg(QR_DARK)}${bg(QR_LIGHT)}`,
  };
  let out='';
  for(const segment of row){
    const style=segment.style==='qr'?styleOf.qr:color?styleOf[segment.style]:'';
    /* the code keeps its «482 913» form: the mockup's letter-spacing (.14em) is less than a terminal cell */
    out+=style?`${style}${segment.text}${RESET}`:segment.text;
  }
  return out;
}

/** Draws frames in place: each new frame goes up over the lines of the previous one and erases below before writing. */
export function createInlineScreen(write:(text:string)=>void){
  let drawn=0;
  return{
    draw(lines:readonly string[]){
      const up=drawn>0?`${ESC}${drawn}F`:'';
      write(`${up}${ESC}0J${lines.join('\n')}\n`);
      drawn=lines.length;
    },
    /** the last frame stays in the terminal (the mockup leaves the result above the next prompt) */
    keep(){drawn=0;},
    hideCursor(){write(`${ESC}?25l`);},
    showCursor(){write(`${ESC}?25h`);},
  };
}

/**
 * The keys of a raw-mode stdin, in order. An Esc alone is Esc; Esc followed by «[A»/«[B» in the same chunk is an arrow
 * (Windows Terminal and conhost send each key sequence in one read). Returns a reader and a function that restores the terminal.
 */
export function readTerminalKeys(stdin:NodeJS.ReadStream):{next():Promise<PairingKey|null>;close():void}{
  const queue:(PairingKey|null)[]=[];
  const waiting:((key:PairingKey|null)=>void)[]=[];
  let ended=false;
  const emit=(key:PairingKey|null)=>{const w=waiting.shift();if(w)w(key);else queue.push(key);};
  const onData=(chunk:Buffer|string)=>{
    const text=typeof chunk==='string'?chunk:chunk.toString('utf8');
    for(let i=0;i<text.length;){
      const rest=text.slice(i);
      if(rest.startsWith('\u001b[A')||rest.startsWith('\u001bOA')){emit('up');i+=3;continue;}
      if(rest.startsWith('\u001b[B')||rest.startsWith('\u001bOB')){emit('down');i+=3;continue;}
      if(rest.startsWith('\u001b[C')||rest.startsWith('\u001bOC')){emit('right');i+=3;continue;}
      if(rest.startsWith('\u001b[D')||rest.startsWith('\u001bOD')){emit('left');i+=3;continue;}
      if(rest.startsWith('\u001b[')){/* another sequence (right, left, F-keys…): skipped whole */const m=/^\u001b\[[0-9;]*[A-Za-z~]/u.exec(rest);i+=m?m[0].length:2;continue;}
      const ch=rest[0]!;
      if(ch==='\u0003'||ch==='\u0004'){ended=true;emit(null);i+=1;continue;}
      if(ch==='\u001b'){emit('esc');i+=1;continue;}
      if(ch==='\r'||ch==='\n'){emit('enter');i+=1;if(ch==='\r'&&rest[1]==='\n')i+=1;continue;}
      if(ch==='\u007f'||ch==='\b'){emit('backspace');i+=1;continue;}
      if(ch==='\t'){emit('tab');i+=1;continue;}
      const cp=rest.codePointAt(0)!;const char=String.fromCodePoint(cp);
      if(cp>=0x20)emit({char});
      i+=char.length;
    }
  };
  const wasRaw=Boolean(stdin.isRaw);
  stdin.setRawMode?.(true);
  stdin.resume();
  stdin.on('data',onData);
  const onEnd=()=>{ended=true;emit(null);};
  stdin.on('end',onEnd);
  return{
    next(){if(queue.length)return Promise.resolve(queue.shift()!);if(ended)return Promise.resolve(null);return new Promise(resolve=>waiting.push(resolve));},
    close(){stdin.off('data',onData);stdin.off('end',onEnd);stdin.setRawMode?.(wasRaw);stdin.pause();},
  };
}
