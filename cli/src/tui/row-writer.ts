/*
 * UI phase stage 2, cure 2c (registro 12, 01/10): the TALOS row writer, which takes the place of Ink's log-update while
 * the TUI owns the alternate screen.
 *
 * Why: Ink 7.1.1's standard log-update erases every row of the last frame and writes them all again (~2.9 KB per frame,
 * ~87 KB per turn at 120×40); its incrementalRendering met the byte budget but lost the composer row on a repaint (s37).
 * The frame here is the whole screen from row 1, so each row is drawn where it belongs:
 *   - only rows that differ from the last frame are written, each as `CSI row;1H` + `SGR 0` + `EL 2` + the row
 *     (Pi tui-alt-screen.ts; whole rows, not cell runs — Claude Code reports cell writes leaving fragments under ConPTY);
 *   - autowrap is off while it draws (`?7l`), so a row reaching the last column never scrolls the screen (Ink #969);
 *   - rows below the bottom of the screen are not written (a frame laid out for the old size can be taller for a moment);
 *   - when the terminal size differs from the last frame's, the screen is cleared (`ED 2`) and every row drawn again
 *     (Pi fullRedraw on a size change, Codex resets its previous buffer), since the terminal has re-wrapped the old rows.
 * The interface is log-update's (render, clear, done, reset, sync, willRender, setCursorPosition, isCursorDirty), so Ink's
 * own throttling, synchronized output (DEC 2026) and writeToStdout keep working around it. TALOS never shows Ink's
 * hardware cursor: it stays hidden while the writer owns the screen.
 */
import {highlightRow,PAINT_SEQUENCE,selectedCells,lightRow,tintRow,type HoverTint,type Selection} from './selection.ts';
const ESC='\u001B[';
const AUTOWRAP_OFF=`${ESC}?7l`,AUTOWRAP_ON=`${ESC}?7h`,CURSOR_HIDE=`${ESC}?25l`,CURSOR_SHOW=`${ESC}?25h`,CLEAR_SCREEN=`${ESC}2J`;
/* The hidden cursor goes back to the top-left after every write: a Windows console that shrinks keeps the cursor visible
   by shifting the screen up, which pushed the header off the top after a resize (s37, 01/10). */
const CURSOR_HOME=`${ESC}H`;
const placeRow=(index:number)=>`${ESC}${index+1};1H${ESC}0m${ESC}2K`;

export type RowWriterStream={write(chunk:string):unknown;columns?:number;rows?:number};
export type HoverArea={row:number;from:number;to:number;action?:string};
export type RowWriter=((frame:string)=>boolean)&{
  clear():void;done():void;reset():void;sync(frame:string):void;willRender(frame:string):boolean;
  setCursorPosition(position:unknown):void;isCursorDirty():boolean;
  /* stage 6c: the selection drawn over the frame, and the frame's plain rows */
  select(selection:Selection|null):void;lines():string[];
  /** The element under the pointer, painted over the frame like the selection (hover.ts); `onFrame` hears each frame that wrote. */
  hover(areas:readonly HoverArea[]):void;onFrame(listener:(()=>void)|null):void;
  /** Where colours are full: what the hover mixes; without it, inverse. */
  hoverTint(read:(()=>HoverTint|null)|null):void;
};

const rowsOf=(frame:string)=>{const rows=frame.split('\n');if(frame.endsWith('\n'))rows.pop();return rows;};

export function createRowWriter(stream:RowWriterStream):RowWriter{
  let previous:string[]|null=null;let previousFrame='';let drawnSize='';let owning=false;let clearPending=false;
  /* Stage 6c (owner 02/10, «selezione della CLI»): the selection drawn over the frame, and the rows as they were written. */
  let selection:Selection|null=null;let painted:string[]=[];
  let hoverAreas:readonly HoverArea[]=[];let frameListener:(()=>void)|null=null;let readTint:(()=>HoverTint|null)|null=null;
  const sizeOf=()=>`${stream.columns??0}x${stream.rows??0}`;
  const height=()=>{const rows=Number(stream.rows);return Number.isFinite(rows)&&rows>0?rows:Number.POSITIVE_INFINITY;};
  const paint=(index:number,raw:string)=>{
    const range=selection?selectedCells(selection,index):null;if(range)return highlightRow(raw,range[0],range[1]);
    const colors=hoverAreas.length?readTint?.()??null:null;
    return hoverAreas.reduce((row,area)=>area.row!==index?row:!colors?highlightRow(row,area.from,area.to):area.action?.startsWith('shelf:')?lightRow(row,area.from,area.to,colors):tintRow(row,area.from,area.to,colors),raw);
  };
  const render=((frame:string)=>{
    const size=sizeOf();
    const resized=clearPending||(previous!==null&&size!==drawnSize);clearPending=false;
    if(!resized&&previous!==null&&frame===previousFrame)return false;
    const rows=rowsOf(frame);const limit=height();const shown=rows.map((raw,index)=>paint(index,raw));
    let out=owning?'':`${AUTOWRAP_OFF}${CURSOR_HIDE}`;owning=true;
    if(resized)out+=CLEAR_SCREEN;
    const before=resized?null:previous;
    for(let index=0;index<rows.length&&index<limit;index++){
      if(before&&painted[index]===shown[index])continue;
      out+=placeRow(index)+shown[index];
    }
    if(before)for(let index=rows.length;index<before.length&&index<limit;index++)out+=placeRow(index);
    if(out)stream.write(out+CURSOR_HOME);
    previous=rows;previousFrame=frame;drawnSize=size;painted=shown;
    frameListener?.();
    return true;
  }) as RowWriter;
  /* Stage 6c: a drag moves the selection; only the rows it covers or covered are written again (no React render). */
  const repaint=()=>{
    if(!previous)return;
    let out='';
    for(let index=0;index<previous.length&&index<height();index++){
      const shown=paint(index,previous[index]!);
      if(shown===painted[index])continue;
      out+=placeRow(index)+shown;painted[index]=shown;
    }
    if(out)stream.write(out+CURSOR_HOME);
  };
  render.select=(next:Selection|null)=>{selection=next;repaint();};
  render.hover=(areas:readonly HoverArea[])=>{hoverAreas=areas;repaint();};
  render.onFrame=listener=>{frameListener=listener;};
  render.hoverTint=(read:(()=>HoverTint|null)|null)=>{readTint=read;};
  /** The plain text of the last frame's rows (the copy reads the selection from it, as the mockup's `selectedText`). */
  render.lines=()=>(previous??[]).map(row=>row.replace(PAINT_SEQUENCE,''));
  render.willRender=(frame:string)=>previous===null||frame!==previousFrame||sizeOf()!==drawnSize;
  /* Ink clears before redrawing when the terminal gets narrower (`resized`). After a size change the terminal has
     re-wrapped the old rows, so erasing them where they were drawn only blanks the screen until the next frame (s11,
     01/10): nothing is written, and the next frame clears the screen and draws every row. */
  render.clear=()=>{
    if(previous&&sizeOf()!==drawnSize){clearPending=true;previous=null;previousFrame='';return;}
    if(previous){let out='';for(let index=0;index<previous.length&&index<height();index++)out+=placeRow(index);if(out)stream.write(out+CURSOR_HOME);}
    previous=null;previousFrame='';painted=[];
  };
  render.reset=()=>{previous=null;previousFrame='';painted=[];};
  render.sync=(frame:string)=>{previous=rowsOf(frame);previousFrame=frame;drawnSize=sizeOf();painted=previous.map((raw,index)=>paint(index,raw));};
  render.done=()=>{if(owning)stream.write(`${ESC}0m${AUTOWRAP_ON}${CURSOR_SHOW}`);owning=false;previous=null;previousFrame='';painted=[];selection=null;};
  render.setCursorPosition=()=>{};
  render.isCursorDirty=()=>false;
  return render;
}

/**
 * The Ink instance drawing on `stdout` (stage 5: the row writer and the input paint both reach it), or null when it cannot
 * be found (another Ink version). Ink 7.1.1 keeps its instances in `build/instances.js`, a WeakMap by stdout.
 */
export async function inkInstanceFor(stdout:object):Promise<any>{
  let instances:WeakMap<object,any>;
  /* The bundle (scripts/bundle.mjs) imports the registry by name, so it is the copy bundled WITH Ink; resolving it from
     node_modules there would load a second, empty registry and the writer would silently stay out. The sources resolve
     it next to the Ink they import. (`as string` keeps the literal for esbuild and away from TypeScript's resolver.) */
  try{instances=(await (typeof TALOS_BUNDLED!=='undefined'
    ?import('ink/build/instances.js' as string)
    :import(new URL('./instances.js',import.meta.resolve('ink')).href))).default;}catch{return null;}
  return instances?.get?.(stdout)??null;
}

/**
 * Puts the row writer in place of the log-update of the Ink instance drawing on `stdout`, and draws the current frame in
 * full through it. Ink 7.1.1 keeps its instances in `build/instances.js` (a WeakMap by stdout) and calls `this.log` at use
 * (throttledLog, writeToStdout, resized, unmount), so replacing the property is enough. Returns false when the instance
 * cannot be found (another Ink version): the TUI then keeps Ink's own writer.
 */
/* Stage 6c: the writer drawing on a stream, so the pointer selection can draw over its frame and read its rows. */
const writers=new WeakMap<object,RowWriter>();
export function rowWriterFor(stdout:object):RowWriter|null{return writers.get(stdout)??null;}

export async function installRowWriter(stdout:RowWriterStream):Promise<boolean>{
  const ink=await inkInstanceFor(stdout);
  /* The bundle (scripts/bundle.mjs) imports the registry by name, so it is the copy bundled WITH Ink; resolving it from
     node_modules there would load a second, empty registry and the writer would silently stay out. The sources resolve
     it next to the Ink they import. (`as string` keeps the literal for esbuild and away from TypeScript's resolver.) */
  if(!ink||typeof ink.log!=='function')return false;
  const writer=createRowWriter(stdout);
  ink.log=writer;writers.set(stdout,writer);
  /*
   * A resize must reach the screen as ONE frame, through this writer (s11 R1-IDLE, 01/10). Traced in the TALOS process:
   * Ink's `resized` renders at once with the tree still laid out for the OLD size — on a smaller terminal a frame taller
   * than the screen — and on win32 any frame as tall as the screen takes Ink's own `clearTerminal` write (ED 2 + ED 3 +
   * the whole frame), which bypasses the writer; the frame React lays out for the new size follows through the same full
   * clear, because the last height still counts as "full screen". Claude Code diffs every frame against the screen it
   * wrote and sends only changed rows; pi-tui's destructive redraws during a resize flicker (Kimi Code #2324). So, after
   * a size change: a frame taller than the new screen is stale and not drawn (React's frame for the new size follows),
   * and the old height is forgotten, so the new frame comes here and is drawn once in full (ED 2, every row).
   */
  const renderFrame=ink.renderInteractiveFrame;
  if(typeof renderFrame==='function'){
    let framedFor=`${stdout.columns??0}x${stdout.rows??0}`;
    ink.renderInteractiveFrame=function(this:any,output:string,outputHeight:number,staticOutput:string){
      const size=`${stdout.columns??0}x${stdout.rows??0}`;const rows=Number(stdout.rows);
      if(size!==framedFor&&Number.isFinite(rows)&&rows>0){
        if(outputHeight>rows)return;
        if(this.lastOutputHeight>=rows)this.lastOutputHeight=0;
      }
      framedFor=size;
      return renderFrame.call(this,output,outputHeight,staticOutput);
    };
  }
  if(typeof ink.lastOutputToRender==='string'&&ink.lastOutputToRender)writer(ink.lastOutputToRender);
  return true;
}
