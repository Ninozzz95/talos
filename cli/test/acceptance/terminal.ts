/**
 * Rendered-frame driver: runs TALOS inside a pseudo console and reads the screen a person would see.
 *
 * node-pty (ConPTY on Windows) → raw bytes → @xterm/headless → `buffer.active` rows (gate E13). Every write to the
 * emulator is chained and awaited before the screen is read, and the emulator's replies (`onData`: cursor reports,
 * device attributes) are forwarded back to the pty. Waits are predicates evaluated only on COMPLETE frames: Ink wraps
 * each frame in DEC 2026 synchronized output (`CSI ? 2026 h` … `CSI ? 2026 l`), and a predicate is never evaluated
 * while such an update is open, so a torn repaint can neither satisfy nor fail it (gate E14). There are no fixed
 * sleeps; a wait that times out throws with a dump of the screen.
 *
 * Why there is no "frame height" metric: ConPTY re-renders the console and emits its own cursor addressing, so
 * neither the program's newlines nor a scroll of the alternate screen are visible in the stream (measured: a help
 * overlay taller than the screen produced 0 line feeds on the last row and 0 `CSI S`). Ink composes an oversized
 * frame inside its own fixed-height grid, where later rows overwrite earlier ones. Height defects are therefore
 * judged on the rendered screen (see `checks.ts`), which is what a person sees.
 */
import {createRequire} from 'node:module';
import type {Profile} from './profile.ts';
import {MAIN_JS} from './profile.ts';

const require=createRequire(import.meta.url);
const {Terminal}=require('@xterm/headless') as typeof import('@xterm/headless');

export const ESC='\u001B';
const BSU=`${ESC}[?2026h`;const ESU=`${ESC}[?2026l`;
export const KEYS:Record<string,string>={
  enter:'\r',esc:ESC,tab:'\t','shift+tab':`${ESC}[Z`,backspace:'\x7f',up:`${ESC}[A`,down:`${ESC}[B`,right:`${ESC}[C`,left:`${ESC}[D`,
  pageup:`${ESC}[5~`,pagedown:`${ESC}[6~`,space:' ','ctrl+c':'\x03','ctrl+d':'\x04','ctrl+j':'\n','ctrl+k':'\x0b','ctrl+l':'\x0c','ctrl+o':'\x0f',
  'ctrl+r':'\x12','ctrl+u':'\x15','ctrl+a':'\x01','ctrl+e':'\x05','shift+enter':`${ESC}[13;2u`,
  'ctrl+home':`${ESC}[1;5H`,'ctrl+end':`${ESC}[1;5F`,
  /* R5a: Ctrl+T shows or hides the thinking (Q-R5-9); Alt+S steers (Q-R5-7), sent as ESC s like a terminal's meta key. */
  'ctrl+t':'\x14','alt+s':`${ESC}s`,
  /* P13: Alt+A opens the agent tree. */
  'alt+a':`${ESC}a`,
};

/** The minimum a pty needs to offer; an injected fake lets the self-test check the wiring without a process. */
export type PtyLike={onData:(cb:(data:string)=>void)=>unknown;onExit:(cb:(e:{exitCode:number;signal?:number})=>void)=>unknown;write:(data:string)=>void;resize:(cols:number,rows:number)=>void;kill:()=>void;pid?:number};
export type SpawnPty=(file:string,args:string[],options:{cols:number;rows:number;cwd:string;env:Record<string,string>})=>PtyLike;
export type Frame={at:number};
export type Screen={lines:string[];text:string;buffer:'normal'|'alternate';cols:number;rows:number};

export const realPty:SpawnPty=(file,args,options)=>{
  const pty=require('node-pty') as typeof import('node-pty');
  return pty.spawn(file,args,{name:'xterm-256color',cols:options.cols,rows:options.rows,cwd:options.cwd,env:options.env,useConpty:true}) as unknown as PtyLike;
};

type Waiter={check:()=>boolean;resolve:()=>void};

/**
 * Counts what the pty wrote over a window (gate E6): bytes, DEC 2026 frames (BSU/ESU), `ESC[2J` (erase display),
 * `ESC[3J` (erase scrollback) and any DECSET that turns on mouse reporting (Q-R1-7 forbids them). The bytes are those
 * ConPTY re-emits, not the program's own, which is why the idle check compares against a baseline child under the same
 * ConPTY. Sequences split across two chunks are counted once: a match counts only when it ends in the new chunk.
 */
export const MOUSE_MODES=new Set([1000,1001,1002,1003,1005,1006,1015,1016]);
export type OutputCount={ms:number;bytes:number;chunks:number;bsu:number;esu:number;eraseDisplay:number;eraseScrollback:number;mouseEnables:string[];mouseDisables:string[];frameAt:number[];focusEnables:number;focusDisables:number;progress:number[];bells:number;sample:string;chunkAt:number[];pointerShapes:string[];backgrounds:string[]};
/** How many escaped characters of the first bytes a report keeps (CAND033-S11-HELP-8B). */
export const SAMPLE_CHARS=160;
export class OutputMeter{
  private inOsc=false;private escape=false;
  private readonly began=Date.now();private carry='';private stoppedAt:number|null=null;
  private count:Omit<OutputCount,'ms'>={bytes:0,chunks:0,bsu:0,esu:0,eraseDisplay:0,eraseScrollback:0,mouseEnables:[],mouseDisables:[],frameAt:[],focusEnables:0,focusDisables:0,progress:[],bells:0,sample:'',chunkAt:[],pointerShapes:[],backgrounds:[]};
  feed(data:string){
    if(this.stoppedAt!==null)return;
    const c=this.count;const previous=this.carry.length;const scan=this.carry+data;const at=Date.now()-this.began;
    c.bytes+=Buffer.byteLength(data);c.chunks+=1;if(c.chunkAt.length<64)c.chunkAt.push(at);
    /* CAND033-S11-HELP-8B: the first bytes, escaped and bounded, so an unexpected write names itself in the report. */
    if(c.sample.length<SAMPLE_CHARS)c.sample=(c.sample+JSON.stringify(data).slice(1,-1)).slice(0,SAMPLE_CHARS);
    const ends=(re:RegExp,each:(m:RegExpExecArray)=>void)=>{for(const m of scan.matchAll(re))if(m.index+m[0].length>previous)each(m);};
    ends(/\u001B\[\?2026h/gu,()=>{c.bsu+=1;});
    ends(/\u001B\[\?2026l/gu,()=>{c.esu+=1;c.frameAt.push(at);});
    ends(/\u001B\[2J/gu,()=>{c.eraseDisplay+=1;});
    ends(/\u001B\[3J/gu,()=>{c.eraseScrollback+=1;});
    ends(/\u001B\[\?1004h/gu,()=>{c.focusEnables++;});
    ends(/\u001B\[\?1004l/gu,()=>{c.focusDisables++;});
    ends(/\u001B\]9;4;([0-4]);\d+(?:\u0007|\u001B\\)/gu,m=>{c.progress.push(Number(m[1]));});
    /* the hand pointer over what a click opens (OSC 22, pointer-shape.ts) */
    ends(/\u001B\]22;([a-z-]*)\u001B\\/gu,m=>{c.pointerShapes.push(m[1]!);});
    /* 0.6.11: the terminal's default background (OSC 11 sets it, OSC 111 gives it back; terminal-background.ts) */
    ends(/\u001B\](111|11;([^\u0007\u001B]*))(?:\u0007|\u001B\\)/gu,m=>{c.backgrounds.push(m[1]==='111'?'reset':m[2]!);});
    /* OSC terminators are not audible BELs. Keep framing state across arbitrary PTY chunks. */
    for(const char of data){
      if(this.inOsc){if(char==='\u0007'||(this.escape&&char==='\\'))this.inOsc=false;this.escape=char==='\u001b';}
      else if(this.escape&&char===']'){this.inOsc=true;this.escape=false;}
      else{if(char==='\u0007')c.bells++;this.escape=char==='\u001b';}
    }
    ends(/\u001B\[\?([\d;]{1,32})h/gu,m=>{if(m[1]!.split(';').some(p=>MOUSE_MODES.has(Number(p))))c.mouseEnables.push(JSON.stringify(m[0]));});
    /* UI Phase 3: the switches back off, so a scenario can prove TALOS leaves no mouse reporting behind */
    ends(/\u001B\[\?([\d;]{1,32})l/gu,m=>{if(m[1]!.split(';').some(p=>MOUSE_MODES.has(Number(p))))c.mouseDisables.push(JSON.stringify(m[0]));});
    this.carry=scan.slice(-40);
  }
  /** Freeze the counts (later bytes are ignored) and return them. */
  stop():OutputCount{if(this.stoppedAt===null)this.stoppedAt=Date.now()-this.began;return this.read();}
  read():OutputCount{return{ms:(this.stoppedAt??Date.now()-this.began),...structuredClone(this.count)};}
}
/** One line for a report: what a window of output held. */
export const describeOutput=(c:OutputCount)=>`${c.bytes} bytes in ${c.chunks} chunks over ${c.ms} ms · ${c.esu} frames (BSU ${c.bsu}/ESU ${c.esu}) · ESC[2J ${c.eraseDisplay} · ESC[3J ${c.eraseScrollback}${c.mouseEnables.length?` · mouse ${c.mouseEnables.join(' ')}`:''}${c.frameAt.length?` · frames at ${c.frameAt.slice(0,12).join(',')}${c.frameAt.length>12?',…':''} ms`:''}${c.bytes&&c.sample?` · first bytes "${c.sample}"`:''}`;

/* The text in the composer box (fullscreen «│ › …» and its continuation rows until the bottom border, or the classic «> …»
   line), joined; null when no composer is on screen. */
export function composerText(lines:readonly string[]):string|null{
  /* the approved mockup's composer (07/10 composerRows): `│ › ` on the first row, `│   ` after it; empty, a faint placeholder */
  const start=lines.findIndex(line=>/^│ ›/u.test(line));
  if(start>=0){
    const rows:string[]=[];
    for(let i=start;i<lines.length;i++){const line=lines[i]!.trimEnd();if(i>start&&!/^│/u.test(line))break;rows.push(line.replace(/^│ (?:›[↑ ]?| {2})?/u,'').replace(/│$/u,'').trimEnd());}
    const text=rows.join('');
    return /^(?:Ask TALOS,[^│]*|Type to [^│]*)$/u.test(text)?'':text;
  }
  const classic=lines.findIndex(line=>/^\s*>\s/u.test(line));
  return classic>=0?lines[classic]!.replace(/^\s*>\s/u,'').trimEnd():null;
}

export class TerminalSession{
  readonly started=Date.now();
  readonly frames:Frame[]=[];
  exit:{code:number;at:number}|null=null;
  /** The home of the profile this TALOS was launched with (`launch`): where its development log is (harness.ts reads it at exit). */
  profileHome:string|null=null;
  bytes=0;
  /** Everything the pty wrote since launch, counted (Q-R1-7: no mouse-mode DECSET, ever). */
  readonly output=new OutputMeter();
  private meters=new Set<OutputMeter>();private lastByteAt=Date.now();
  private term:InstanceType<typeof Terminal>;
  private pty:PtyLike;
  private pending:Promise<void>=Promise.resolve();
  private syncOpen=false;private renderedOpen=false;private carry='';
  private waiters=new Set<Waiter>();

  constructor(file:string,args:string[],{cols=100,rows=30,cwd,env,spawn=realPty}:{cols?:number;rows?:number;cwd:string;env:Record<string,string>;spawn?:SpawnPty}){
    this.term=new Terminal({cols,rows,allowProposedApi:true,scrollback:5000});
    this.pty=spawn(file,args,{cols,rows,cwd,env});
    /* Replies the emulator produces (DSR cursor reports, DA) go back to the program, as a real terminal would. */
    this.term.onData(reply=>{if(!this.exit)this.pty.write(reply);});
    this.pty.onData(data=>this.receive(data));
    this.pty.onExit(({exitCode})=>{this.pending.then(()=>{this.exit={code:exitCode,at:Date.now()-this.started};this.notify();});});
  }

  static launch(profile:Profile,args:string[]=[],size:{cols?:number;rows?:number}={}):TerminalSession{
    const session=new TerminalSession(process.execPath,[MAIN_JS,...args],{...size,cwd:profile.project,env:profile.env});
    session.profileHome=profile.home;return session;
  }

  private receive(data:string){
    this.bytes+=Buffer.byteLength(data);this.lastByteAt=Date.now();
    this.output.feed(data);for(const m of this.meters)m.feed(data);
    /* Track the synchronized-update state across chunk boundaries (a sequence can be split between two chunks). */
    const previous=this.carry;const scan=previous+data;const lastOpen=scan.lastIndexOf(BSU);const lastClose=scan.lastIndexOf(ESU);
    const openAfter=lastOpen>lastClose?true:lastClose>lastOpen?false:this.syncOpen;
    this.carry=scan.slice(-8);this.syncOpen=openAfter;
    /* A frame ends at each ESU that finishes inside this chunk (one that ended inside the carried tail was counted before). */
    for(let at=scan.indexOf(ESU);at>=0;at=scan.indexOf(ESU,at+1))if(at+ESU.length>previous.length)this.frames.push({at:Date.now()-this.started});
    this.pending=this.pending.then(()=>new Promise<void>(resolve=>this.term.write(data,()=>{this.renderedOpen=openAfter;if(!openAfter)this.notify();resolve();})));
  }

  private notify(){for(const w of [...this.waiters])if(w.check()){this.waiters.delete(w);w.resolve();}}

  /** Resolves once every byte received so far has been parsed by the emulator. */
  async settled(){let before:Promise<void>;do{before=this.pending;await before;}while(before!==this.pending);}

  screen():Screen{
    const b=this.term.buffer.active;const lines:string[]=[];
    for(let y=0;y<this.term.rows;y++)lines.push(b.getLine(b.viewportY+y)?.translateToString(true)??'');
    return{lines,text:lines.join('\n'),buffer:b.type as 'normal'|'alternate',cols:this.term.cols,rows:this.term.rows};
  }
  /** Everything the normal buffer holds, scrollback included (what stays in the terminal after exit). */
  scrollback():string{const b=this.term.buffer.normal;const out:string[]=[];for(let y=0;y<b.length;y++)out.push(b.getLine(y)?.translateToString(true)??'');return out.join('\n');}

  dump(label=''):string{
    const s=this.screen();const ruler=`+${'-'.repeat(s.cols)}+`;
    const head=`--- screen ${label} t=${Date.now()-this.started}ms ${s.cols}x${s.rows} buffer=${s.buffer} frames=${this.frames.length} bytes=${this.bytes}${this.exit?` EXITED code=${this.exit.code}`:''}`;
    return [head,ruler,...s.lines.map(l=>`|${l.padEnd(s.cols,' ')}|`),ruler].join('\n');
  }

  /** Wait until `predicate(screen)` holds on a complete frame (or the process has exited). Throws with a dump on timeout. */
  async waitFor(label:string,predicate:(s:Screen)=>boolean,{timeout=20_000}:{timeout?:number}={}):Promise<Screen>{
    await this.settled();
    /* A blank screen is never a frame to judge: on Windows the clear of a repaint can arrive in its own synchronized
       block, a moment before the content (measured: a negative predicate matched such a blank frame). */
    const check=()=>{if(this.renderedOpen)return false;const s=this.screen();return s.text.trim()!==''&&predicate(s);};
    if(check())return this.screen();
    /* CAND033-S12-WAITFOR-BLANK (30/09): the waiter matched, then the recheck after `settled()` found the blank of a repaint
       and reported «the process exited» though it was alive. The recheck is the same complete, non-blank check; a live
       process that fails it is waited for again until the deadline; «exited» is said only when it did. */
    const deadline=Date.now()+timeout;
    for(;;){
      const remaining=deadline-Date.now();
      if(remaining<=0)throw new Error(`${label}: timed out after ${timeout} ms\n${this.dump(label)}`);
      let timer:NodeJS.Timeout|undefined;const waiter:Waiter={check:()=>check()||this.exit!==null,resolve:()=>{}};
      await new Promise<void>((resolve,reject)=>{
        waiter.resolve=resolve;this.waiters.add(waiter);
        timer=setTimeout(()=>{this.waiters.delete(waiter);reject(new Error(`${label}: timed out after ${timeout} ms\n${this.dump(label)}`));},remaining);
      }).finally(()=>clearTimeout(timer));
      await this.settled();
      if(check())return this.screen();
      if(this.exit)throw new Error(`${label}: the process exited (code ${this.exit.code}) before the screen matched\n${this.dump(label)}`);
    }
  }
  waitForText(text:string|RegExp,options:{timeout?:number;label?:string}={}){
    const test=typeof text==='string'?(s:Screen)=>s.text.includes(text):(s:Screen)=>text.test(s.text);
    return this.waitFor(options.label??`waiting for ${String(text)}`,test,options);
  }
  /** Wait for the process to exit; resolves `false` when it is still alive after `timeout` (a bounded observation, not an error). */
  async waitForExit(timeout:number):Promise<boolean>{
    if(this.exit)return true;
    let timer:NodeJS.Timeout|undefined;
    return new Promise<boolean>(resolve=>{
      const waiter:Waiter={check:()=>this.exit!==null,resolve:()=>{clearTimeout(timer);resolve(true);}};
      this.waiters.add(waiter);
      timer=setTimeout(()=>{this.waiters.delete(waiter);resolve(false);},timeout);
    });
  }
  /** Start counting output from now (gate E6); `stop()` freezes the window. */
  meter():OutputMeter{const m=new OutputMeter();this.meters.add(m);return m;}
  /** Count the output of the next `ms` milliseconds. The fixed duration IS the measurement (E6: a 5 s idle window). */
  async observe(ms:number):Promise<OutputCount>{
    const m=this.meter();await new Promise(r=>setTimeout(r,ms));await this.settled();this.meters.delete(m);return m.stop();
  }
  /** Resolves once the pty has written nothing for `quietMs` (used to let a trivial child's start-up bytes pass). */
  async quiet(quietMs:number,{timeout=10_000}={}):Promise<boolean>{
    const until=Date.now()+timeout;
    for(;;){const idle=Date.now()-this.lastByteAt;if(idle>=quietMs)return true;if(Date.now()>=until)return false;await new Promise(r=>setTimeout(r,Math.min(quietMs-idle,until-Date.now())+5));}
  }
  /** The normal buffer (scrollback + screen) as logical lines: rows the terminal soft-wrapped are joined back. */
  normalLines():string[]{
    const b=this.term.buffer.normal;const out:string[]=[];
    for(let y=0;y<b.length;y++){const line=b.getLine(y);if(!line)continue;const text=line.translateToString(true);if(line.isWrapped&&out.length)out[out.length-1]+=text;else out.push(text);}
    return out;
  }
  send(data:string){if(!this.exit)this.pty.write(data);}
  press(key:string){const seq=KEYS[key];if(seq===undefined)throw new Error(`unknown key ${key}`);this.send(seq);}
  /** Type like a person (one character at a time) so paste detection is not triggered (gate E16). */
  async type(text:string,gapMs=8){for(const ch of text){this.send(ch);await new Promise(r=>setTimeout(r,gapMs));}}
  /** Type, wait until the composer echoes the text, then press Enter after a short pause (Enter within ~30 ms of typing reads as a paste). */
  /* s33 after the desktop merge (02/10, registro 12): the echo is looked for IN THE COMPOSER. The command menu shows
     «› /config» as soon as «/conf» is typed, so a check on the whole screen pressed Enter before the composer had the last
     letters — a person sees their own text before Enter, not a menu row. */
  async submit(text:string){
    await this.type(text);
    const tail=text.slice(-30);
    await this.waitFor(`composer echo of ${JSON.stringify(text)}`,screen=>{const typed=composerText(screen.lines);return typed===null?screen.text.includes(tail):typed.includes(tail);});
    await new Promise(r=>setTimeout(r,60));this.press('enter');
  }
  paste(text:string){this.send(`${ESC}[200~${text}${ESC}[201~`);}
  resize(cols:number,rows:number){this.pty.resize(cols,rows);this.term.resize(cols,rows);}

  async close(){
    if(!this.exit){try{this.pty.kill();}catch{/* already gone */}await this.waitForExit(5_000);}
    /* Also after a natural exit: on Windows node-pty keeps its ConPTY output worker (a MessagePort) and pipe open until
       `kill()` disposes them, and the test process would never end (measured). */
    try{this.pty.kill();}catch{/* the agent may already be disposed */}
    for(const w of this.waiters)w.resolve();this.waiters.clear();
    await this.settled();this.term.dispose();
  }
}
