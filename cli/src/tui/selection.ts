/*
 * Stage 6c (owner 02/10: «mouse acceso, selezione della CLI»; research in registro 12). The selection TALOS draws and copies
 * itself, as the approved mockup's `selectedText`/`dblclick`/`paintSelection` (MOCKUP-FASE-UI-2026-10-01.html:792-799, 1119):
 * read from the text of the last frame (Codex's mouse also works on the most recently painted layout), the first row from
 * the cell where the drag began, the rows between whole, the last row up to where it ended, trailing spaces dropped. Cells,
 * not characters: a wide character takes two cells, and a cell inside it takes the whole character. Pure.
 */
import {displayWidth,splitGraphemes} from './text-width.ts';

export type Cell={row:number;col:number};
/** Where a drag began (`a`) and where it is (`b`). */
export type Selection={a:Cell;b:Cell;column?:{from:number;to:number}};

/** The cells of row `row` inside the selection, inclusive, or null when the row is outside it. */
export function selectedCells({a,b,column}:Selection,row:number):[number,number]|null{
  const [p,q]=a.row<b.row||(a.row===b.row&&a.col<=b.col)?[a,b]:[b,a];
  if(row<p.row||row>q.row)return null;
  /* FE-048: a drag stays in the column it began in, so the chat is copied without the bar beside it */
  const from=Math.max(row===p.row?p.col:0,column?.from??0),to=Math.min(row===q.row?q.col:Number.MAX_SAFE_INTEGER,column?.to??Number.MAX_SAFE_INTEGER);
  return from<=to?[from,to]:null;
}

/** The graphemes of a plain row with the cell each one starts at. */
function cells(line:string):Array<{text:string;start:number;end:number}>{
  const out:Array<{text:string;start:number;end:number}>=[];let at=0;
  for(const g of splitGraphemes(line)){const w=Math.max(1,displayWidth(g));out.push({text:g,start:at,end:at+w-1});at+=w;}
  return out;
}
/** The part of a plain row from cell `from` to cell `to` (inclusive); a wide character touched by the range is taken whole. */
function sliceCells(line:string,from:number,to:number):string{
  return cells(line).filter(c=>c.end>=from&&c.start<=to).map(c=>c.text).join('');
}

/** The selected text between two cells of the last frame, in reading order whatever the direction of the drag. */
export function selectedText(lines:readonly string[],a:Cell,b:Cell,column?:Selection['column']):string{
  const [p,q]=a.row<b.row||(a.row===b.row&&a.col<=b.col)?[a,b]:[b,a];
  const out:string[]=[];
  for(let row=p.row;row<=q.row;row++){
    const line=lines[row];if(line===undefined)continue;
    const range=selectedCells({a,b,...(column?{column}:{})},row);if(!range)continue;
    out.push(sliceCells(line,range[0],range[1]).replace(/\s+$/u,''));
  }
  return out.join('\n');
}

/** The run of non-blank characters under a cell (a double click), or null on a blank cell. */
export function wordAt(line:string,col:number):{start:number;end:number;text:string}|null{
  const all=cells(line);const at=all.findIndex(c=>c.start<=col&&c.end>=col);
  if(at<0||!/\S/u.test(all[at]!.text))return null;
  let first=at,last=at;
  while(first>0&&/\S/u.test(all[first-1]!.text))first--;
  while(last<all.length-1&&/\S/u.test(all[last+1]!.text))last++;
  return{start:all[first]!.start,end:all[last]!.end,text:all.slice(first,last+1).map(c=>c.text).join('')};
}

/* A painted row: text and the control sequences between it (SGR colours). */
export const PAINT_SEQUENCE=/\u001b\[[0-9;:?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/gu;
const INVERSE_ON='\u001b[7m',INVERSE_OFF='\u001b[27m';

/** The colours the hover mixes (the mockup's `toward(bg, foreground, 0.16)`); without them it falls back to inverse. */
export type HoverTint={background:string;foreground:string};
const HOVER_SHARE=0.16;
const LIGHT_SHARE=0.22;
const hexRgb=(hex:string)=>[1,3,5].map(at=>Number.parseInt(hex.slice(at,at+2),16));
/** The background a row of SGR parameters leaves, from `current`. */
function backgroundAfter(params:string,current:readonly number[]|null):readonly number[]|null{
  const parts=params.split(';').map(part=>Number(part||0));let bg=current;
  for(let at=0;at<parts.length;at+=1){
    const code=parts[at];
    if(code===0||code===49)bg=null;
    else if(code===48&&parts[at+1]===2){bg=parts.slice(at+2,at+5);at+=4;}
    else if(code===48&&parts[at+1]===5){bg=null;at+=2;}
    else if(code===38&&parts[at+1]===2)at+=4;
    else if(code===38&&parts[at+1]===5)at+=2;
  }
  return bg;
}
/** The painted row with cells `from`..`to` on a background a little toward the text: a hover, not a selection. Each cell keeps its own
 *  background underneath, so a band and the chat take the same step, and colours around the range are kept. */
export function tintRow(row:string,from:number,to:number,colors:HoverTint):string{
  const base=hexRgb(colors.background),text=hexRgb(colors.foreground);
  let out='',col=0,inside=false,last=0;let bg:readonly number[]|null=null;
  const tinted=()=>`\u001b[48;2;${(bg??base).map((value,index)=>Math.round(value+(text[index]!-value)*HOVER_SHARE)).join(';')}m`;
  const plain=()=>bg?`\u001b[48;2;${bg.join(';')}m`:'\u001b[49m';
  const chunkOut=(chunk:string)=>{
    for(const g of splitGraphemes(chunk)){
      const w=Math.max(1,displayWidth(g));
      if(!inside&&col+w-1>=from&&col<=to){out+=tinted();inside=true;}
      if(inside&&col>to){out+=plain();inside=false;}
      out+=g;col+=w;
    }
  };
  for(const match of row.matchAll(PAINT_SEQUENCE)){
    chunkOut(row.slice(last,match.index));
    out+=match[0];last=match.index+match[0].length;
    const sgr=/^\u001b\[([0-9;]*)m$/u.exec(match[0]);
    if(sgr){bg=backgroundAfter(sgr[1]!,bg);if(inside)out+=tinted();}
  }
  chunkOut(row.slice(last));
  if(inside)out+=plain();
  return out;
}

const foregroundAfter=(params:string,current:readonly number[]|null)=>{
  const parts=params.split(';').map(part=>Number(part||0));let fg=current;
  for(let at=0;at<parts.length;at+=1){
    const code=parts[at];
    if(code===0||code===39)fg=null;
    else if(code===38&&parts[at+1]===2){fg=parts.slice(at+2,at+5);at+=4;}
    else if(code===38&&parts[at+1]===5){fg=null;at+=2;}
    else if(code===48&&parts[at+1]===2)at+=4;
    else if(code===48&&parts[at+1]===5)at+=2;
  }
  return fg;
};
/** FE-052: the hover of pixel art. `▀` paints half a cell with the text colour and a label is near the text colour already, so a step of the
 *  background alone does not show: both colours go toward white, and the piece under the pointer brightens, as the mockup has it. */
export function lightRow(row:string,from:number,to:number,colors:HoverTint):string{
  const base=hexRgb(colors.background);
  let out='',col=0,inside=false,last=0;let bg:readonly number[]|null=null,fg:readonly number[]|null=null;
  const up=(color:readonly number[])=>color.map(value=>Math.round(value+(255-value)*LIGHT_SHARE)).join(';');
  const on=()=>`${fg?`\u001b[38;2;${up(fg)}m`:''}\u001b[48;2;${up(bg??base)}m`;
  const off=()=>`${fg?`\u001b[38;2;${fg.join(';')}m`:'\u001b[39m'}${bg?`\u001b[48;2;${bg.join(';')}m`:'\u001b[49m'}`;
  const chunkOut=(chunk:string)=>{
    for(const g of splitGraphemes(chunk)){
      const w=Math.max(1,displayWidth(g));
      if(!inside&&col+w-1>=from&&col<=to){out+=on();inside=true;}
      if(inside&&col>to){out+=off();inside=false;}
      out+=g;col+=w;
    }
  };
  for(const match of row.matchAll(PAINT_SEQUENCE)){
    chunkOut(row.slice(last,match.index));
    out+=match[0];last=match.index+match[0].length;
    const sgr=/^\u001b\[([0-9;]*)m$/u.exec(match[0]);
    if(sgr){bg=backgroundAfter(sgr[1]!,bg);fg=foregroundAfter(sgr[1]!,fg);if(inside)out+=on();}
  }
  chunkOut(row.slice(last));
  if(inside)out+=off();
  return out;
}

/** The painted row with cells `from`..`to` inverse (the mockup's `selbox`); colours around the range are kept, and a colour
 *  change inside it does not end the highlight. */
export function highlightRow(row:string,from:number,to:number):string{
  let out='',col=0,inside=false,last=0;
  const text=(chunk:string)=>{
    for(const g of splitGraphemes(chunk)){
      const w=Math.max(1,displayWidth(g));
      if(!inside&&col+w-1>=from&&col<=to){out+=INVERSE_ON;inside=true;}
      if(inside&&col>to){out+=INVERSE_OFF;inside=false;}
      out+=g;col+=w;
    }
  };
  for(const match of row.matchAll(PAINT_SEQUENCE)){
    text(row.slice(last,match.index));
    out+=match[0];if(inside&&match[0].endsWith('m'))out+=INVERSE_ON;
    last=match.index+match[0].length;
  }
  text(row.slice(last));
  if(inside)out+=INVERSE_OFF;
  return out;
}
