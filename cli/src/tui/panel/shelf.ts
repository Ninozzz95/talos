/*
 * FE-052 (owner 01/11: the Desktop has the sky, the CLI something retro; he tried the variants and chose the floppy disks): the shelf. A shelf
 * is a project, a disk a session, the bar on its label how full the context is, the dots its sub-agents, the dashed disk the automation
 * coming next. Three forms, as the mockup's `arte.js` and `retro.js`: the rich scene (full colour, from 92×20), the simple rows, and the
 * list (under 60×12). In the rich one every cell is two pixels; the wood, the metal and the paper are painted once and cached, because
 * rewriting them on every frame is the one thing that would cost. True text stays in plain cells, so it reads and copies.
 */
import {activityClock} from '../activity-line.ts';
import type {StyledSegment} from '../components/styled-rows.ts';
import {displayWidth,splitGraphemes,truncateDisplay,wrapReadable} from '../text-width.ts';
import {t,tn,type MessageId} from '../../i18n/index.ts';

export type ShelfState='working'|'waiting'|'stopped'|'done';
export type ShelfSession={id:string;title:string;state:ShelfState;context:number|null;agents:number;startedAtMs?:number|null};
export type ShelfProject={name:string;sessions:readonly ShelfSession[];path?:string|null};
export type ShelfView={projects:readonly ShelfProject[];selected:number;/* the disk chosen on the chosen shelf */disk?:number;/* `e`: the list, whatever fits */list?:boolean;now:number;glyph:string;automation?:{title:string;minutes:number}|null};
export type ShelfColors={accent:string;background:string;foreground:string;warning:string;success:string};
/* `plain`: the terminal session's plain mode, the mockup's «lettore di schermo» (index.html:86): the page is the list in words */
export type ShelfMode={color:boolean;unicode:boolean;plain?:boolean};
type Row=StyledSegment[];

/* rows of the scene, not of the terminal: a 20-row window leaves it 14. A shelf takes six, so a short window shows fewer shelves */
const RICH_COLUMNS=92,RICH_ROWS=14,SCENE_COLUMNS=60,SCENE_ROWS=12,DISKS_SHOWN=4;
export type ShelfForm='rich'|'simple'|'list';
export function shelfForm(columns:number,rows:number,mode:ShelfMode):ShelfForm{
  if(columns<SCENE_COLUMNS||rows<SCENE_ROWS)return'list';
  return mode.color&&mode.unicode&&columns>=RICH_COLUMNS&&rows>=RICH_ROWS?'rich':'simple';
}

const number=(hex:string)=>Number.parseInt(hex.slice(1),16);
const hex=(n:number)=>`#${n.toString(16).padStart(6,'0')}`;
const mix=(a:number,b:number,share:number)=>{const part=(shift:number)=>Math.round(((a>>shift)&255)*(1-share)+((b>>shift)&255)*share);return(part(16)<<16)|(part(8)<<8)|part(0);};
const light=(color:number,share:number)=>mix(color,0xffffff,share);
const dark=(color:number,share:number)=>mix(color,0,share);
const noise=(x:number,y:number)=>{let h=(Math.imul(x,374761393)+Math.imul(y,668265263))|0;h=Math.imul(h^(h>>>13),1274126177);return((h^(h>>>16))>>>0)/4294967295;};
const PLASTICS=[0x38557a,0x35695f,0x74393f];
const PAPER=0xece6d6,INK=0x17150f;

type CellText={col:number;row:number;text:string;fore:number;back:number|null;bold:boolean;action:string|undefined};
type Area={col:number;row:number;width:number;height:number;action:string};
/** A canvas of half-block pixels with true text over it (the mockup's `Px`). */
export class Pixels{
  readonly data:Int32Array;readonly texts:CellText[]=[];readonly areas:Area[]=[];
  readonly width:number;readonly height:number;
  constructor(width:number,height:number,data?:Int32Array){this.width=width;this.height=height;this.data=data?data.slice():new Int32Array(width*height).fill(-1);}
  copy(){return new Pixels(this.width,this.height,this.data);}
  at(x:number,y:number){return x>=0&&y>=0&&x<this.width&&y<this.height?this.data[y*this.width+x]!:-1;}
  set(x:number,y:number,color:number){const px=Math.round(x),py=Math.round(y);if(px>=0&&py>=0&&px<this.width&&py<this.height)this.data[py*this.width+px]=color;}
  fill(x:number,y:number,w:number,h:number,color:number){for(let j=0;j<h;j+=1)for(let i=0;i<w;i+=1)this.set(x+i,y+j,color);}
  fadeDown(x:number,y:number,w:number,h:number,from:number,to:number){for(let j=0;j<h;j+=1){const color=mix(from,to,h>1?j/(h-1):0);for(let i=0;i<w;i+=1)this.set(x+i,y+j,color);}}
  fadeAcross(x:number,y:number,w:number,h:number,from:number,to:number){for(let i=0;i<w;i+=1){const color=mix(from,to,w>1?i/(w-1):0);for(let j=0;j<h;j+=1)this.set(x+i,y+j,color);}}
  bevel(x:number,y:number,w:number,h:number,bright:number,shade:number){this.fill(x,y,w,1,bright);this.fill(x,y,1,h,bright);this.fill(x,y+h-1,w,1,shade);this.fill(x+w-1,y,1,h,shade);}
  text(col:number,row:number,text:string,fore:number,{back=null,bold=false,action}:{back?:number|null;bold?:boolean;action?:string}={}){this.texts.push({col,row,text,fore,back,bold,action});}
  area(col:number,row:number,width:number,height:number,action:string){this.areas.push({col,row,width,height,action});}
  rows():Row[]{
    const rows=Math.floor(this.height/2);
    const cells=Array.from({length:rows},()=>new Array<{ch:string;text:CellText}|null>(this.width).fill(null));
    for(const item of this.texts){let x=item.col;for(const ch of splitGraphemes(item.text)){if(item.row>=0&&item.row<rows&&x>=0&&x<this.width)cells[item.row]![x]={ch,text:item};x+=Math.max(1,displayWidth(ch));}}
    const actions=Array.from({length:rows},()=>new Array<string|undefined>(this.width).fill(undefined));
    for(const area of this.areas)for(let y=area.row;y<area.row+area.height;y+=1)for(let x=area.col;x<area.col+area.width;x+=1)if(y>=0&&y<rows&&x>=0&&x<this.width)actions[y]![x]=area.action;
    return cells.map((line,y)=>{
      const out:Row=[];let current:{text:string;roles:string[];action?:string;element?:string}|null=null;let key='';
      for(let x=0;x<this.width;x+=1){
        const top=this.at(x,y*2),bottom=this.at(x,y*2+1),cell=line[x];let ch:string,roles:string[];
        if(cell){
          const back=cell.text.back!==null?cell.text.back:top>=0&&bottom>=0?mix(top,bottom,.5):top>=0?top:bottom;
          ch=cell.ch;roles=[`f:${hex(cell.text.fore)}`,...(back>=0?[`g:${hex(back)}`]:[]),...(cell.text.bold?['b']:[])];
        }
        else if(top<0&&bottom<0){ch=' ';roles=[];}
        else if(top===bottom){ch='█';roles=[`f:${hex(top)}`];}
        else if(top<0){ch='▄';roles=[`f:${hex(bottom)}`];}
        else if(bottom<0){ch='▀';roles=[`f:${hex(top)}`];}
        else{ch='▀';roles=[`f:${hex(top)}`,`g:${hex(bottom)}`];}
        const action=cell?.text.action??actions[y]![x];const next=`${roles.join(' ')}|${action??''}`;
        if(current&&next===key)current.text+=ch;
        else{current={text:ch,roles,...(action?{action,element:action}:{})};key=next;out.push(current);}
      }
      return out;
    });
  }
}

/* the background is painted once for a size, a theme and a chosen shelf */
const backgrounds=new Map<string,Pixels>();
const BACKGROUNDS_KEPT=24;
function background(key:string,w:number,h:number,paint:(canvas:Pixels)=>void):Pixels{
  const id=`${key}|${w}x${h}`;let canvas=backgrounds.get(id);
  if(!canvas){canvas=new Pixels(w,h);paint(canvas);if(backgrounds.size>BACKGROUNDS_KEPT)backgrounds.clear();backgrounds.set(id,canvas);}
  return canvas.copy();
}
export const shelfBackgroundsCached=()=>backgrounds.size;

function paintShelves(canvas:Pixels,{shelfRows,shelves,rows,selected,accent,back}:{shelfRows:number;shelves:number;rows:number;selected:number;accent:number;back:number}){
  const W=canvas.width,H=rows*2,wall=mix(back,0x2a211a,.85);
  for(let y=0;y<H;y+=1)for(let x=0;x<W;x+=1)canvas.set(x,y,light(dark(wall,.08+.28*y/H),noise(x>>1,y>>1)*.05));
  /* the lamp on the chosen shelf */
  const lamp=(selected*shelfRows+shelfRows*.42)*2;
  for(let y=0;y<H;y+=1)for(let x=0;x<W;x+=1){const d=Math.hypot((x-W*.4)/(W*.62),(y-lamp)/(shelfRows*1.9));if(d<1)canvas.set(x,y,mix(canvas.at(x,y),light(accent,.3),Math.pow(1-d,1.6)*.5));}
  for(let shelf=0;shelf<shelves;shelf+=1){
    const y=(shelf+1)*shelfRows*2-3;
    for(let n=0;n<5;n+=1)for(let x=0;x<W;x+=1)if(y+3+n<H)canvas.set(x,y+3+n,dark(canvas.at(x,y+3+n),.55-n*.1));
    for(let j=0;j<3;j+=1)for(let x=0;x<W;x+=1){
      const grain=Math.sin((x+shelf*31)*.11+Math.sin(x*.027+shelf)*2.4+j*1.1)*.5+.5;const wood=mix(0x53331b,0x8c6038,grain*.75+noise(x,y+j)*.12);
      canvas.set(x,y+j,j===0?light(wood,.25):j===2?dark(wood,.35):wood);
    }
  }
}

const stateWord=(session:ShelfSession,view:ShelfView)=>session.state==='working'?`${view.glyph} ${activityClock(Math.max(0,view.now-(session.startedAtMs??view.now)))}`:session.state==='waiting'?t('screen.shelf.waiting'):session.state==='stopped'?t('screen.shelf.stopped'):t('screen.shelf.done');

function drawDisk(canvas:Pixels,col:number,row:number,width:number,session:ShelfSession,plastic:number,view:ShelfView,colors:ShelfColors,chosen=false){
  const y=row*2,h=10,action=`shelf:session:${session.id}`;
  const accent=number(colors.accent),warning=number(colors.warning),success=number(colors.success);
  const tone=session.state==='working'?accent:session.state==='waiting'?warning:session.state==='done'?success:0x737883;
  canvas.fill(col+1,y+h,width,1,0x07050a);canvas.fill(col+width,y+1,1,h,0x0d0a08);
  canvas.fadeDown(col,y,width,h,light(plastic,.22),dark(plastic,.22));canvas.bevel(col,y,width,h,chosen?light(accent,.45):light(plastic,.42),chosen?accent:dark(plastic,.5));
  canvas.set(col+width-1,y,canvas.at(col+width,y-1));canvas.set(col+width-2,y,dark(plastic,.2));
  /* the shutter */
  const shutter=Math.round(width*.5),sx=col+Math.round((width-shutter)/2)-1;
  canvas.fadeAcross(sx,y,shutter,3,0xeef0f4,0x8e95a2);canvas.fill(sx,y+3,shutter,1,0x4e5462);canvas.fill(sx+Math.round(shutter*.6),y,Math.max(2,Math.round(shutter*.22)),3,0x20232a);
  canvas.fill(col+2,y+1,2,2,dark(plastic,.55));canvas.fill(col+width-4,y+1,2,2,dark(plastic,.55));
  /* the label: paper, with a band in the colour of its state */
  const lx=col+2,lw=width-4,label=row+2;
  canvas.fill(lx,label*2,lw,6,PAPER);canvas.fill(lx,label*2-1,lw,1,tone);canvas.fill(lx,label*2-2,lw,1,dark(tone,.25));
  canvas.text(lx+1,label,truncateDisplay(session.title,lw-2),INK,{back:PAPER,bold:true,action});
  const percent=session.context===null?'  ?%':`${Math.round(session.context)}%`.padStart(4);
  const bar=lw-7,filled=Math.round((session.context??0)/100*bar);
  for(let i=0;i<bar;i+=1){const color=i<filled?(session.state==='working'?dark(accent,.2):session.state==='waiting'?dark(warning,.25):0x5b574d):0xcfc8b5;canvas.set(lx+1+i,(label+1)*2,color);canvas.set(lx+1+i,(label+1)*2+1,color);}
  canvas.text(lx+bar+2,label+1,percent,0x3a372f,{back:PAPER,action});
  canvas.text(lx+1,label+2,stateWord(session,view),session.state==='stopped'?0x5d5a50:dark(tone,.45),{back:PAPER,bold:true,action});
  if(session.agents)canvas.text(lx+lw-1-session.agents,label+2,'▪'.repeat(session.agents),dark(accent,.2),{back:PAPER,action});
  canvas.area(col,row,width,5,action);
}

/* the drive: it blinks while a conversation of the chosen shelf works */
function drawDrive(canvas:Pixels,x:number,row:number,width:number,busy:boolean,now:number){
  const y=row*2,h=11;
  canvas.fill(x+1,y+h,width,1,0x07050a);canvas.fadeDown(x,y,width,h,0xd4cdb8,0x958e79);canvas.bevel(x,y,width,h,0xf0ead9,0x5a5445);
  canvas.fill(x+2,y+2,width-4,4,0x17181d);canvas.fill(x+3,y+3,width-6,1,0);canvas.fill(x+2,y+6,width-4,1,0xf0ead9);
  canvas.fill(x+width-8,y+7,5,2,0xa9a28d);canvas.bevel(x+width-8,y+7,5,2,0xf0ead9,0x5a5445);
  canvas.fill(x+3,y+7,4,2,busy&&Math.floor(now/250)%3!==2?0xff5a3c:0x4a1a14);
}

/* the chosen disk in words: the drawing never carries a number alone */
function detailRow(view:ShelfView,w:number,mode:ShelfMode):Row{
  const session=view.projects[view.selected]?.sessions[view.disk??0];if(!session)return[S('','')];
  const words=[session.context===null?'?%':`${Math.round(session.context)}%`,...(session.agents?[tn('screen.shelf.agents',session.agents)]:[]),session.state==='working'?activityClock(Math.max(0,view.now-(session.startedAtMs??view.now))):stateWord(session,view).replace(/^\S+ /u,'')].join(' · ');
  const room=Math.max(8,w-displayWidth(words)-8);
  return[S(' ',''),S(`${mark(session,view,mode)} `,ROLE[session.state]),S(cut(session.title,Math.min(24,room)).padEnd(Math.min(24,room)+2),session.state==='stopped'?'dim':'b'),S(cut(words,Math.max(1,w-Math.min(24,room)-6)),'faint')];
}

function richRows(view:ShelfView,w:number,H:number,colors:ShelfColors,mode:ShelfMode):Row[]{
  const accent=number(colors.accent),rows=H-2,count=Math.max(1,Math.min(3,Math.floor(rows/6))),shelfRows=Math.min(8,Math.floor(rows/count)),labelWidth=w>=110?18:15;
  /* the chosen shelf stays in view, and so does the chosen disk */
  const first=Math.max(0,Math.min(view.selected,view.projects.length-count)),shelves=view.projects.slice(first,first+count),selected=view.selected-first,disk=view.disk??0;
  const canvas=background(`shelf${selected}|${count}|${colors.accent}|${colors.background}`,w,shelfRows*count*2,c=>paintShelves(c,{shelfRows,shelves:count,rows:shelfRows*count,selected,accent,back:number(colors.background)}));
  const diskWidth=Math.min(24,Math.floor((w-labelWidth-2)/4)-1);
  shelves.forEach((project,index)=>{
    const row=index*shelfRows+shelfRows-6,chosen=selected===index,action=`shelf:project:${first+index}`,brass=2,top=row+1,width=labelWidth-4;
    canvas.fadeDown(brass,top*2,width,6,0xb0914f,0x7a5f2f);canvas.bevel(brass,top*2,width,6,0xe6cd90,0x46351a);
    canvas.text(brass+1,top,`${chosen?'› ':''}${truncateDisplay(project.name,width-4)}`,0x1a1205,{bold:true,action});
    canvas.text(brass+1,top+1,tn('screen.shelf.disks',project.sessions.length),0x33260f,{action});
    canvas.area(brass,top,width,3,action);
    const start=chosen?Math.max(0,Math.min(disk-DISKS_SHOWN+1,project.sessions.length-DISKS_SHOWN)):0;
    project.sessions.slice(start,start+DISKS_SHOWN).forEach((session,slot)=>drawDisk(canvas,labelWidth+slot*(diskWidth+1),row,diskWidth,session,PLASTICS[(first+index)%PLASTICS.length]!,view,colors,chosen&&start+slot===disk));
  });
  const free=shelves.findIndex(project=>project.sessions.length<DISKS_SHOWN);
  if(view.automation&&free>=0){
    const row=free*shelfRows+shelfRows-6,x=labelWidth+shelves[free]!.sessions.length*(diskWidth+1),tone=light(number(colors.warning),.1),action='shelf:automation';
    canvas.text(x,row,`┌${'╌'.repeat(diskWidth-2)}┐`,tone,{action});
    for(let line=1;line<4;line+=1){canvas.text(x,row+line,'╎',tone,{action});canvas.text(x+diskWidth-1,row+line,'╎',tone,{action});}
    canvas.text(x,row+4,`└${'╌'.repeat(diskWidth-2)}┘`,tone,{action});
    canvas.text(x+2,row+1,truncateDisplay(view.automation.title,diskWidth-4),tone,{bold:true,action});
    canvas.text(x+2,row+2,tn('screen.shelf.inMinutes',view.automation.minutes),0xd8c79c,{action});
    canvas.area(x,row,diskWidth,5,action);
  }
  /* the drive stands on the emptiest shelf, if the shelf has room for it */
  const driveWidth=w>=128?28:w>=116?22:0,taken=(index:number)=>(shelves[index]?.sessions.length??0)+(index===free?1:0);
  const emptiest=[...Array(count).keys()].reduce((best,index)=>taken(index)<taken(best)?index:best,0);
  if(driveWidth&&labelWidth+Math.min(DISKS_SHOWN,taken(emptiest))*(diskWidth+1)<w-driveWidth-1)drawDrive(canvas,w-driveWidth-1,emptiest*shelfRows+shelfRows-6,driveWidth,Boolean(shelves[selected]?.sessions.some(session=>session.state==='working')),view.now);
  return[...canvas.rows(),detailRow(view,w,mode)];
}

const cut=truncateDisplay;
const S=(text:string,role:string,action?:string):StyledSegment=>({text,roles:role.split(' ').filter(Boolean),...(action?{action,element:action}:{})});
const mark=(session:ShelfSession,view:ShelfView,mode:ShelfMode)=>session.state==='working'?view.glyph:session.state==='waiting'?'?':session.state==='stopped'?(mode.unicode?'■':'#'):(mode.unicode?'✓':'v');
const ROLE:Record<ShelfState,string>={working:'acc',waiting:'warn',stopped:'faint',done:'ok'};

function simpleRows(view:ShelfView,w:number,H:number,mode:ShelfMode):Row[]{
  /* in ASCII the shortened name ends in a dot: the ellipsis is the one Unicode character the common cut would bring in */
  const truncateDisplay=(text:string,width:number)=>mode.unicode?cut(text,width):cut(text,width).replace('…','.');
  const rows:Row[]=[];const nameWidth=w>=90?14:11;
  view.projects.slice(0,Math.max(1,Math.floor((H-2)/2))).forEach((project,index)=>{
    const selected=view.selected===index,disk=view.disk??0,action=`shelf:project:${index}`,row:Row=[S(`${selected?(mode.unicode?' › ':' > '):'   '}${truncateDisplay(project.name,nameWidth-4).padEnd(nameWidth-3)}`,selected?'acc b':'dim',action)];
    const start=selected?Math.max(0,Math.min(disk-DISKS_SHOWN+1,project.sessions.length-DISKS_SHOWN)):0;
    const shown=project.sessions.slice(start,start+DISKS_SHOWN),width=Math.floor((w-nameWidth)/Math.max(2,shown.length||1));
    shown.forEach((session,slot)=>{
      const name=truncateDisplay(`${mark(session,view,mode)} ${session.title}`,width-6),target=`shelf:session:${session.id}`,chosen=selected&&start+slot===disk;
      row.push(S(name+' '.repeat(Math.max(1,width-5-displayWidth(name))),chosen?`${ROLE[session.state]} b u`:ROLE[session.state],target),S((session.context===null?'?':`${Math.round(session.context)}%`).padStart(4)+' ','faint',target));
    });
    rows.push(row,[S((mode.unicode?'▔':'=').repeat(w),selected?'dim':'faint')]);
  });
  if(view.automation)rows.push([S(` ${t('screen.shelf.coming',{title:view.automation.title})} ${tn('screen.shelf.inMinutes',view.automation.minutes)}`,'warn','shelf:automation')]);
  return rows;
}

function listRows(view:ShelfView,w:number,H:number,mode:ShelfMode):Row[]{
  const truncateDisplay=(text:string,width:number)=>mode.unicode?cut(text,width):cut(text,width).replace('…','.');
  const rows:Row[]=view.list?[]:[[S(` ${truncateDisplay(t('screen.shelf.listOnly'),Math.max(1,w-2))}`,'faint')]];
  view.projects.forEach((project,index)=>{
    const selected=view.selected===index,working=project.sessions.filter(session=>session.state==='working').length,action=`shelf:project:${index}`;
    rows.push([S(selected?(mode.unicode?' › ':' > '):'   ','acc',action),S(truncateDisplay(project.name,Math.max(4,w-24)),selected?'acc b':'',action),S(`  ${tn('screen.shelf.sessions',project.sessions.length)}${working?` · ${t('screen.shelf.working',{count:working})}`:''}`,'faint',action)]);
    if(selected&&view.list)project.sessions.forEach((session,slot)=>{
      const target=`shelf:session:${session.id}`,chosen=slot===(view.disk??0);
      rows.push([S(chosen?(mode.unicode?'   › ':'   > '):'     ','acc',target),S(`${mark(session,view,mode)} `,ROLE[session.state],target),S(truncateDisplay(session.title,Math.max(4,w-22)),chosen?'acc b':'',target),S(`  ${session.context===null?'?':`${Math.round(session.context)}%`}`,'faint',target)]);
    });
  });
  return rows.slice(0,Math.max(1,H));
}

export function shelfRows(view:ShelfView,w:number,H:number,{mode,colors}:{mode:ShelfMode;colors?:ShelfColors|null}):Row[]{
  const form=view.list?'list':colors?shelfForm(w,H,mode):shelfForm(w,H,{...mode,color:false});
  if(!view.projects.length||!view.projects.some(project=>project.sessions.length))return[[S(`  ${t('screen.shelf.empty')}`,'dim')]];
  /* plain mode: the words and nothing drawn, before any form (index.html:2520); a long sentence goes on below, never past the page */
  if(mode.plain)return shelfText(view).flatMap(line=>wrapReadable(line,Math.max(1,w)).map(part=>[S(part,'')]));
  if(form==='rich'&&colors)return richRows(view,w,H,colors,mode);
  return form==='simple'?simpleRows(view,w,H,mode):listRows(view,w,H,mode);
}

/** A row of the session list. The folder's own project names the shelf; a sub-agent is no disk: it is a dot on its parent's label. The home shelf comes first. */
export type ShelfRow={id:string;title:string;project:string|null;path?:string|null;parent:string|null;state:ShelfState;context:number|null;startedAtMs:number|null};
export function shelfProjects(rows:readonly ShelfRow[],home:string):ShelfProject[]{
  const shelves=new Map<string,ShelfSession[]>([[home,[]]]),paths=new Map<string,string>();
  for(const row of rows){
    if(row.parent)continue;
    const name=row.project||home;const agents=rows.filter(child=>child.parent===row.id&&child.state==='working').length;
    if(!shelves.has(name))shelves.set(name,[]);
    if(row.path&&!paths.has(name))paths.set(name,row.path);
    shelves.get(name)!.push({id:row.id,title:row.title,state:row.state,context:row.context,agents:Math.min(4,agents),startedAtMs:row.startedAtMs});
  }
  return[...shelves].filter(([name,sessions])=>sessions.length||name===home).map(([name,sessions])=>({name,sessions,...(paths.has(name)?{path:paths.get(name)!}:{})}));
}

/** The dashed disk: the next automation to run, in minutes, or none. One that is late says one minute, never a time gone. */
export function shelfAutomation(rows:readonly {name:string;active:boolean;nextRunAt:string|null}[],now:number):{title:string;minutes:number}|null{
  const coming=rows.flatMap(row=>{const at=row.active&&row.nextRunAt?Date.parse(row.nextRunAt):Number.NaN;return Number.isFinite(at)?[{title:row.name,at}]:[];}).sort((a,b)=>a.at-b.at)[0];
  return coming?{title:coming.title,minutes:Math.max(1,Math.ceil((coming.at-now)/60_000))}:null;
}

export type ShelfPick={selected:number;disk:number;list:boolean};
/** A key or a click on the page: the next choice, or the session to open. A click on a disk chooses it, a second one opens it, as a list row does.
 *  A click on the dashed disk says when its automation starts (mockup index.html:2532); one gone meanwhile says nothing. */
export function shelfPick(pick:ShelfPick,projects:readonly ShelfProject[],key:string,automation:ShelfView['automation']=null):{pick:ShelfPick;open?:string;notice?:string}{
  if(key==='shelf:automation')return automation?{pick,notice:tn('screen.shelf.startsIn',automation.minutes,{title:automation.title})}:{pick};
  const count=projects.length,disks=(selected:number)=>projects[selected]?.sessions.length??0;
  const shelf=(selected:number)=>({pick:{...pick,selected,disk:Math.min(pick.disk,Math.max(0,disks(selected)-1))}});
  if(key.startsWith('shelf:project:')){const selected=Number(key.slice(14));return selected>=0&&selected<count?{pick:{...pick,selected,disk:0}}:{pick};}
  if(key.startsWith('shelf:session:')){
    const id=key.slice(14);
    for(const [selected,project] of projects.entries()){
      const disk=project.sessions.findIndex(session=>session.id===id);if(disk<0)continue;
      return selected===pick.selected&&disk===pick.disk?{pick,open:id}:{pick:{...pick,selected,disk}};
    }
    return{pick};
  }
  if(key==='ArrowLeft'||key==='ArrowRight'){
    if(!count)return{pick};
    return shelf((pick.selected+(key==='ArrowRight'?1:count-1))%count);
  }
  if(key==='ArrowUp')return{pick:{...pick,disk:Math.max(0,pick.disk-1)}};
  if(key==='ArrowDown')return{pick:{...pick,disk:Math.min(Math.max(0,disks(pick.selected)-1),pick.disk+1)}};
  if(key==='e')return{pick:{...pick,list:!pick.list}};
  if(key==='Enter'||key==='enter'){const id=projects[pick.selected]?.sessions[pick.disk]?.id;return id?{pick,open:id}:{pick};}
  return{pick};
}

/* the state in words, as the mockup's `paroleStato` (index.html:2375): the time at work, never a glyph a reader would spell */
const stateInWords=(session:ShelfSession,view:ShelfView)=>session.state==='working'?activityClock(Math.max(0,view.now-(session.startedAtMs??view.now))):t(`screen.shelf.words.${session.state}` as MessageId);

/** What a screen reader gets, and `plain` output: the same facts in words (the mockup's `testoScena`, index.html:2403-2406). */
export function shelfText(view:ShelfView):string[]{
  const lines:string[]=[];
  for(const project of view.projects){
    lines.push(t('screen.shelf.textProject',{name:project.name}));
    for(const session of project.sessions)lines.push(t('screen.shelf.textSession',{title:session.title,context:session.context===null?'?':`${Math.round(session.context)}%`,state:`${stateInWords(session,view)}${session.agents?`, ${tn('screen.shelf.agents',session.agents)}`:''}`}));
  }
  if(view.automation)lines.push(tn('screen.shelf.textComing',view.automation.minutes,{title:view.automation.title}));
  return lines;
}
