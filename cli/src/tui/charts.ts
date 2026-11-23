/*
 * B1 of MAPPA-RIDISEGNO (the mockup's `pezzi.js`): the charts of the pages, as pure rows of segments. A cell has one character, a text
 * colour and a background, which is what lets a bar end in an eighth and a stack change colour inside one cell. Every chart has a form
 * for each terminal: full colour, no colour (series told apart by density) and no Unicode (plain ASCII). The number goes beside the chart:
 * a chart never carries the figure alone.
 */
import {displayWidth} from './text-width.ts';
import type {StyledSegment} from './components/styled-rows.ts';

export type ChartMode={color:boolean;unicode:boolean};
export type ChartPart={value:number;color:string};
export type ChartRow=StyledSegment[];
export const CHART_FULL:ChartMode={color:true,unicode:true};

const EIGHTHS=['','▏','▎','▍','▌','▋','▊','▉'];
const RISE=['','▁','▂','▃','▄','▅','▆','▇','█'];
const SPARK='▁▂▃▄▅▆▇█',SPARK_ASCII='_.-=+*#@';
/* without colour the series are told apart by density, in the chart and in its legend */
const DENSITY:Record<string,string>={s1:'█',s2:'▒',s3:'▓',s4:'░',s5:'▓',s6:'░'};
const DENSITY_ASCII:Record<string,string>={s1:'#',s2:'=',s3:'+',s4:'-',s5:'+',s6:'-'};
const STACK_SEQUENCE='█▓▒░',STACK_ASCII='#=+-';

const S=(text:string,...roles:string[]):StyledSegment=>({text,roles:roles.filter(Boolean)});
const share=(value:number,max:number)=>Math.min(1,Math.max(0,value/(max||1)));
const span=(width:number)=>Math.max(0,Math.floor(width));

/** A bar in eighths of a cell: full cells, the last piece as a fraction, the track on the background. */
export function bar(value:number,max:number,width:number,{color='accent',track='border'}:{color?:string;track?:string}={},mode:ChartMode=CHART_FULL):ChartRow{
  const w=span(width);
  if(!mode.color||!mode.unicode){
    const filled=Math.round(w*share(value,max));
    return[S((mode.unicode?'█':'#').repeat(filled)),S((mode.unicode?'░':'-').repeat(w-filled),'faint')];
  }
  const units=Math.round(share(value,max)*w*8),full=Math.floor(units/8),rest=units%8;
  const row:ChartRow=[];
  if(full)row.push(S('█'.repeat(full),`f:${color}`,`g:${track}`));
  if(rest&&full<w)row.push(S(EIGHTHS[rest]!,`f:${color}`,`g:${track}`));
  const empty=w-full-(rest?1:0);
  if(empty>0)row.push(S(' '.repeat(empty),`g:${track}`));
  return row;
}

/** A stacked bar: at a border, two colours in one cell, text and background; only one on each side. */
export function stack(parts:readonly ChartPart[],width:number,{track='border',total}:{track?:string;total?:number}={},mode:ChartMode=CHART_FULL):ChartRow{
  const w=span(width);const whole=total||parts.reduce((sum,part)=>sum+part.value,0)||1;
  if(!mode.color||!mode.unicode){
    const sequence=mode.unicode?STACK_SEQUENCE:STACK_ASCII;const row:ChartRow=[];let used=0;
    parts.forEach((part,index)=>{const cells=Math.max(0,Math.min(Math.round(part.value*w/whole),w-used));if(cells)row.push(S(sequence[index%4]!.repeat(cells)));used+=cells;});
    if(used<w)row.push(S((mode.unicode?'·':'.').repeat(w-used),'faint'));
    return row;
  }
  const scale=(w*8)/whole;const cells:Array<Array<{color:string;eighths:number}>|null>=new Array(w).fill(null);let at=0;
  for(const part of parts){
    const from=at,to=at+part.value*scale;
    for(let cell=Math.floor(from/8);cell<w&&cell*8<to;cell+=1){
      const start=Math.max(from,cell*8),end=Math.min(to,(cell+1)*8);
      if(end>start)(cells[cell]??=[]).push({color:part.color,eighths:end-start});
    }
    at=to;
  }
  return cells.map(list=>{
    if(!list)return S(' ',`g:${track}`);
    if(list.length===1){const only=list[0]!,eighths=Math.round(only.eighths);return S(eighths>=8?'█':EIGHTHS[Math.max(1,eighths)]!,`f:${only.color}`,`g:${track}`);}
    const first=list[0]!,after=list[list.length-1]!;
    return S(EIGHTHS[Math.max(1,Math.min(7,Math.round(first.eighths)))]!,`f:${first.color}`,`g:${after.color}`);
  });
}

export function sparkline(values:readonly number[],{role='acc'}:{role?:string}={},mode:ChartMode=CHART_FULL):StyledSegment{
  const max=Math.max(1,...values);const steps=mode.unicode?SPARK:SPARK_ASCII;
  return S(values.map(value=>value<=0?steps[0]!:steps[Math.min(7,Math.round(value/max*7))]!).join(''),mode.color?role:'');
}

type ColumnsOptions={wide?:number;gap?:number;color?:string;labels?:readonly string[]|null;labelRole?:string;selected?:number;action?:string|null;base?:number};
const labelRow=(labels:readonly string[],count:number,wide:number,gap:number,selected:number,role:string):ChartRow=>Array.from({length:count},(_,index)=>{
  const text=labels[index]??'';
  return S(text+' '.repeat(Math.max(0,wide+gap-displayWidth(text))),...(index===selected?['acc','b']:[role]));
});
/** Columns over several rows: the top cell takes the fraction; `selected` marks the column under the cursor. */
export function columns(values:readonly number[],height:number,{wide=2,gap=1,color='accent',labels=null,labelRole='faint',selected=-1,action=null,base=0}:ColumnsOptions={},mode:ChartMode=CHART_FULL):ChartRow[]{
  const max=Math.max(1,...values);const rows:ChartRow[]=[];
  for(let y=height-1;y>=0;y-=1){
    const row:ChartRow=[];
    values.forEach((value,index)=>{
      const eighths=Math.max(0,Math.min(8,Math.round(value/max*height*8-y*8)));
      const ch=mode.color&&mode.unicode?RISE[eighths]||' ':eighths>=4?(mode.unicode?'█':'#'):' ';
      const tone=index===selected?'warn':color;
      row.push({...S(ch.repeat(wide),...(mode.color?[`f:${tone}`]:[])),...(action?{action:`${action}:${base+index}`}:{})});
      if(gap)row.push(S(' '.repeat(gap)));
    });
    rows.push(row);
  }
  if(labels)rows.push(labelRow(labels,values.length,wide,gap,selected,labelRole));
  return rows;
}

/** Stacked columns for each day: one cell, two colours at the border. */
export function stackedColumns(series:readonly (readonly ChartPart[])[],height:number,{wide=2,gap=1,action=null,base=0}:Pick<ColumnsOptions,'wide'|'gap'|'action'|'base'>={},mode:ChartMode=CHART_FULL):ChartRow[]{
  const max=Math.max(1,...series.map(day=>day.reduce((sum,part)=>sum+part.value,0)));const rows:ChartRow[]=[];
  for(let y=height-1;y>=0;y-=1){
    const row:ChartRow=[];
    series.forEach((day,index)=>{
      const bottom=y*8,top=(y+1)*8;let at=0;const pieces:Array<{color:string;from:number;to:number}>=[];
      for(const part of day){
        const size=part.value/max*height*8,from=Math.max(at,bottom),to=Math.min(at+size,top);
        if(to>from)pieces.push({color:part.color,from:from-bottom,to:to-bottom});
        at+=size;
      }
      let ch=' ',roles:string[]=[];
      const only=pieces.length===1?pieces[0]!:null,under=pieces[0],over=pieces[pieces.length-1];
      if(!mode.color||!mode.unicode){const map=mode.unicode?DENSITY:DENSITY_ASCII;ch=over?map[over.color]??(mode.unicode?'█':'#'):' ';}
      else if(only&&only.from<1){ch=RISE[Math.max(1,Math.min(8,Math.round(only.to)))]!;roles=[`f:${only.color}`];}
      else if(only){ch=RISE[Math.max(1,Math.min(7,Math.round(only.from)))]!;roles=['f:background',`g:${only.color}`];}
      else if(under&&over){ch=RISE[Math.max(1,Math.min(7,Math.round(under.to)))]!;roles=[`f:${under.color}`,`g:${over.color}`];}
      row.push({...S(ch.repeat(wide),...roles),...(action?{action:`${action}:${base+index}`}:{})});
      if(gap)row.push(S(' '.repeat(gap)));
    });
    rows.push(row);
  }
  return rows;
}

const BRAILLE=[[0x01,0x08],[0x02,0x10],[0x04,0x20],[0x40,0x80]] as const;
/** A line in braille dots: 2×4 for each cell, one colour for each cell, so one series only. Without Unicode, a line of stars. */
export function brailleLine(values:readonly number[],width:number,height:number,{role='acc',fill=true,marks=[]}:{role?:string;fill?:boolean;marks?:readonly number[]}={},mode:ChartMode=CHART_FULL):ChartRow[]{
  const w=span(width),h=span(height);if(!w||!h||!values.length)return[];
  const max=Math.max(1,...values),min=Math.min(0,...values);
  const valueAt=(position:number)=>{const at=position*(values.length-1),low=Math.floor(at),part=at-low;return values[low]!*(1-part)+(values[low+1]??values[low]!)*part;};
  const marked=marks.map(index=>Math.round(index/Math.max(1,values.length-1)*(w-1)));
  const tone=mode.color?role:'';
  if(!mode.unicode){
    const grid=Array.from({length:h},()=>new Array<string>(w).fill(' '));
    for(let x=0;x<w;x+=1){const y=h-1-Math.round((valueAt(x/Math.max(1,w-1))-min)/(max-min||1)*(h-1));grid[y]![x]='*';}
    return grid.map(row=>[S(row.join(''),tone)]);
  }
  const dotsX=w*2,dotsY=h*4;const grid=Array.from({length:h},()=>new Array<number>(w).fill(0));
  for(let x=0;x<dotsX;x+=1){
    const y=dotsY-1-Math.round((valueAt(x/Math.max(1,dotsX-1))-min)/(max-min||1)*(dotsY-1));
    for(let at=y;at<(fill?dotsY:y+1);at+=1)grid[Math.floor(at/4)]![Math.floor(x/2)]!|=BRAILLE[at%4]![x%2]!;
  }
  return grid.map(row=>{
    const out:ChartRow=[];let run='';
    row.forEach((dots,x)=>{
      const ch=String.fromCodePoint(0x2800+dots);
      if(!marked.includes(x)){run+=ch;return;}
      if(run){out.push(S(run,tone));run='';}
      out.push(S(ch,mode.color?'warn':''));
    });
    if(run)out.push(S(run,tone));
    return out;
  });
}

/** A grid of squares, the grammar of the context view: ■ taken, · free. */
export function squares(parts:readonly ChartPart[],total:number,{cols=20,rows=5}:{cols?:number;rows?:number}={},mode:ChartMode=CHART_FULL):ChartRow[]{
  const cells:string[]=[];const count=cols*rows;
  for(const part of parts){const taken=Math.round(part.value/(total||1)*count);for(let index=0;index<taken&&cells.length<count;index+=1)cells.push(part.color);}
  const on=mode.unicode?'■ ':'# ',off=mode.unicode?'· ':'. ';
  return Array.from({length:rows},(_,y)=>Array.from({length:cols},(_unused,x)=>{const color=cells[y*cols+x];return color?S(on,...(mode.color?[`f:${color}`]:[])):S(off,'faint');}));
}

const DAY_LETTERS=['M','','W','','F','','S'];
/** A calendar of cells: days by week, the intensity in the background. `heat` is the colour at a share from 0 to 1, from the theme. */
export function calendar(values:readonly number[],weeks=20,{dayLabels=true,heat,empty='band'}:{dayLabels?:boolean;heat?:(share:number)=>string;empty?:string}={},mode:ChartMode=CHART_FULL):ChartRow[]{
  const max=Math.max(1,...values);const rows:ChartRow[]=[];
  for(let day=0;day<7;day+=1){
    const row:ChartRow=dayLabels?[S((DAY_LETTERS[day]??'').padEnd(2),'faint')]:[];
    for(let week=0;week<weeks;week+=1){
      const value=values[week*7+day]??0,level=value/max;
      if(mode.color&&heat)row.push(S('  ',`g:${value===0?empty:heat(level)}`));
      else if(mode.unicode)row.push(S(level===0?'· ':level<.34?'░░':level<.67?'▒▒':'▓▓',level===0?'faint':''));
      else row.push(S(level===0?'. ':level<.34?'--':level<.67?'++':'##',level===0?'faint':''));
    }
    rows.push(row);
  }
  return rows;
}

/** A band on a time axis: its start and its end are measured in eighths. `start` and `end` are shares of the width. */
export function timeBand(start:number,end:number,width:number,{color='accent',track='band'}:{color?:string;track?:string}={},mode:ChartMode=CHART_FULL):ChartRow{
  const w=span(width),from=Math.round(start*w*8),to=Math.max(from+1,Math.round(end*w*8));const row:ChartRow=[];
  for(let cell=0;cell<w;cell+=1){
    const first=Math.max(from,cell*8),last=Math.min(to,(cell+1)*8),eighths=last-first;
    if(!mode.color||!mode.unicode){row.push(S(eighths>=4?(mode.unicode?'█':'#'):' '));continue;}
    if(eighths<=0)row.push(S(' ',`g:${track}`));
    else if(eighths>=8)row.push(S('█',`f:${color}`));
    else if(first===cell*8)row.push(S(EIGHTHS[eighths]!,`f:${color}`,`g:${track}`));
    else row.push(S(EIGHTHS[8-eighths]||'▏',`f:${track}`,`g:${color}`));
  }
  return row;
}

/** One row of a legend: the mark, the name, the value and the share, the number beside the chart. */
export function legendRow(color:string,name:string,value:string,percent:string,width=30,mode:ChartMode=CHART_FULL):ChartRow{
  const room=Math.max(6,width-15);
  const mark=mode.color?(mode.unicode?'■ ':'# '):`${(mode.unicode?DENSITY:DENSITY_ASCII)[color]??(mode.unicode?'█':'#')} `;
  const pad=(text:string,size:number)=>text+' '.repeat(Math.max(0,size-displayWidth(text)));
  return[S(mark,...(mode.color?[`f:${color}`]:[])),S(pad(name,room)),S(value.padStart(7),'dim'),S(percent.padStart(6),'faint')];
}
