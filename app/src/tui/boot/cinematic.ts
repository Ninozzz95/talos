export const TALOS_GOLD_PALETTE=['#604A12','#9D7F24','#D4AF37','#F7D774','#FFF4C2'] as const;
export const TALOS_BOOT_DURATION_MS=7200;

export type CinematicLayoutMode='full'|'medium'|'compact'|'micro';
export type CinematicCell={char:string;level:number};
export type CinematicFrame={lines:string[];levels:number[][];stage:string;mode:CinematicLayoutMode};

type Layout={mode:CinematicLayoutMode;width:number;height:number;cx:number;cy:number};
type Particle={x:number;y:number;vx:number;vy:number;phase:number;tier:number};
type Bounds={x:number;y:number;width:number;height:number};
type Stage={name:string;progress:number;id:number};

const LOGO_FULL=[
  '████████╗ █████╗ ██╗      ██████╗ ███████╗',
  '╚══██╔══╝██╔══██╗██║     ██╔═══██╗██╔════╝',
  '   ██║   ███████║██║     ██║   ██║███████╗',
  '   ██║   ██╔══██║██║     ██║   ██║╚════██║',
  '   ██║   ██║  ██║███████╗╚██████╔╝███████║',
  '   ╚═╝   ╚═╝  ╚═╝╚══════╝ ╚═════╝ ╚══════╝',
] as const;
const LOGO_COMPACT=['╔╦╗╔═╗╦  ╔═╗╔═╗',' ║ ╠═╣║  ║ ║╚═╗',' ╩ ╩ ╩╩═╝╚═╝╚═╝'] as const;
const ASCII_MAP:Record<string,string>={
  '█':'#','▓':'#','▒':'+','░':'.','╔':'+','╗':'+','╚':'+','╝':'+','╦':'+','╩':'+','╠':'+','╣':'+','═':'-','║':'|','╲':'\\','╱':'/','◇':'o','◆':'O','◈':'O','●':'o','•':'.','·':'.','━':'=','─':'-','│':'|',
};

function clamp(value:number,min:number,max:number){return Math.max(min,Math.min(max,value));}
function easeOutCubic(t:number){const v=clamp(t,0,1);return 1-Math.pow(1-v,3);}
function easeInOutSine(t:number){const v=clamp(t,0,1);return -(Math.cos(Math.PI*v)-1)/2;}
function triangleWave(t:number){let x=t%2;if(x<0)x+=2;return x<=1?x:2-x;}
function layoutForWidth(terminalWidth:number):Layout{
  const tw=Math.max(32,Math.trunc(terminalWidth||80));
  const mode:CinematicLayoutMode=tw<48?'micro':tw<72?'compact':tw<100?'medium':'full';
  const width=Math.min(112,Math.max(30,tw-2));
  const height=mode==='micro'?16:mode==='compact'?22:mode==='medium'?26:28;
  const cx=Math.floor(width/2);const cy=Math.floor(Math.min(height-8,height*0.36));
  return{mode,width,height,cx,cy};
}

function mulberry32(seed:number){let a=seed>>>0;return()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
const rand=mulberry32(1413565519);
const PARTICLES:Particle[]=Array.from({length:64},()=>({x:rand(),y:rand(),vx:(rand()-.5)*.055,vy:(rand()-.5)*.035,phase:rand()*Math.PI*2,tier:Math.floor(rand()*3)}));

function newCanvas(layout:Layout):CinematicCell[][]{return Array.from({length:layout.height},()=>Array.from({length:layout.width},()=>({char:' ',level:-1})));}
function setCell(canvas:CinematicCell[][],layout:Layout,x:number,y:number,char:string,level=2){if(x<0||y<0||x>=layout.width||y>=layout.height)return;const cell=canvas[y]![x]!;if(char===' '&&cell.char!==' ')return;if(level>=cell.level){cell.char=char;cell.level=level;}}
function putText(canvas:CinematicCell[][],layout:Layout,x:number,y:number,text:string,level=2){for(const [i,ch] of Array.from(text).entries())setCell(canvas,layout,x+i,y,ch,level);}
function putCentered(canvas:CinematicCell[][],layout:Layout,y:number,text:string,level=2){putText(canvas,layout,Math.floor((layout.width-Array.from(text).length)/2),y,text,level);}
function drawPartialLine(canvas:CinematicCell[][],layout:Layout,x0:number,y0:number,x1:number,y1:number,progress:number,char:string,level=1){const dx=x1-x0,dy=y1-y0,steps=Math.max(Math.abs(dx),Math.abs(dy));if(steps<=0){setCell(canvas,layout,x0,y0,char,level);return;}const count=Math.floor(steps*clamp(progress,0,1));for(let s=0;s<=count;s++){const t=s/steps;setCell(canvas,layout,Math.round(x0+dx*t),Math.round(y0+dy*t),char,level);}}
function stageInfo(elapsed:number):Stage{
  if(elapsed<1)return{name:'SIGNAL ACQUISITION',progress:elapsed,id:0};
  if(elapsed<2.2)return{name:'NETWORK CONVERGENCE',progress:(elapsed-1)/1.2,id:1};
  if(elapsed<3.4)return{name:'CORE IGNITION',progress:(elapsed-2.2)/1.2,id:2};
  if(elapsed<4.6)return{name:'SYNCHRONIZATION BUS',progress:(elapsed-3.4)/1.2,id:3};
  if(elapsed<5.8)return{name:'TALOS ASSEMBLY',progress:(elapsed-4.6)/1.2,id:4};
  if(elapsed<6.7)return{name:'ENERGY SHIMMER',progress:(elapsed-5.8)/.9,id:5};
  return{name:'SYSTEM ONLINE',progress:clamp((elapsed-6.7)/.5,0,1),id:6};
}
function drawParticles(canvas:CinematicCell[][],layout:Layout,elapsed:number,visibility:number){if(layout.mode==='micro')return;const limit=layout.mode==='compact'?26:layout.mode==='medium'?42:64;const glyphs=['·','•','+'];for(let i=0;i<limit;i++){const p=PARTICLES[i]!;let nx=(p.x+p.vx*elapsed)%1,ny=(p.y+p.vy*elapsed)%1;if(nx<0)nx+=1;if(ny<0)ny+=1;const pulse=.5+.5*Math.sin(elapsed*2.4+p.phase);if(pulse>1-visibility){const x=1+Math.floor(nx*Math.max(1,layout.width-2));const y=2+Math.floor(ny*Math.max(1,layout.height-6));setCell(canvas,layout,x,y,glyphs[Math.min(glyphs.length-1,p.tier)]!,p.tier);}}}
function drawNetwork(canvas:CinematicCell[][],layout:Layout,progress:number){if(layout.mode==='micro')return;const {width:w,height:h,cx,cy}=layout,p=easeOutCubic(progress);const points:Array<[number,number]>=[[2,3],[w-3,3],[2,Math.max(5,cy-1)],[w-3,Math.max(5,cy-1)],[4,Math.min(h-6,cy+5)],[w-5,Math.min(h-6,cy+5)]];if(layout.mode==='full'){points.push([Math.floor(w*.18),h-6],[Math.floor(w*.82),h-6]);}for(const [x,y] of points){drawPartialLine(canvas,layout,x,y,cx,cy,p,'·',0);setCell(canvas,layout,x,y,'◇',2);}if(p>.45){const inner=(p-.45)/.55;drawPartialLine(canvas,layout,cx-18,cy,cx+18,cy,inner,'─',1);drawPartialLine(canvas,layout,cx,cy-6,cx,cy+6,inner,'│',1);}}
function drawDiamond(canvas:CinematicCell[][],layout:Layout,rx:number,ry:number,level:number){const {cx,cy}=layout;drawPartialLine(canvas,layout,cx,cy-ry,cx+rx,cy,1,'╲',level);drawPartialLine(canvas,layout,cx+rx,cy,cx,cy+ry,1,'╱',level);drawPartialLine(canvas,layout,cx,cy+ry,cx-rx,cy,1,'╲',level);drawPartialLine(canvas,layout,cx-rx,cy,cx,cy-ry,1,'╱',level);}
function drawCore(canvas:CinematicCell[][],layout:Layout,progress:number,elapsed:number){const p=easeInOutSine(progress);const maxRx=layout.mode==='full'?15:layout.mode==='medium'?12:8;const maxRy=layout.mode==='full'?6:layout.mode==='medium'?5:4;const rx=Math.max(2,Math.round(maxRx*p)),ry=Math.max(1,Math.round(maxRy*p));if(p>.05)drawDiamond(canvas,layout,rx,ry,2);if(p>.28)drawDiamond(canvas,layout,Math.max(2,Math.floor(rx*.56)),Math.max(1,Math.floor(ry*.56)),3);const pulse=.5+.5*Math.sin(elapsed*8);setCell(canvas,layout,layout.cx,layout.cy,p<.33?'·':p<.66?'◇':pulse>.45?'◆':'◈',4);if(p>.55){setCell(canvas,layout,layout.cx-Math.floor(rx*.56),layout.cy,'●',3);setCell(canvas,layout,layout.cx+Math.floor(rx*.56),layout.cy,'●',3);setCell(canvas,layout,layout.cx,layout.cy-Math.floor(ry*.56),'●',3);setCell(canvas,layout,layout.cx,layout.cy+Math.floor(ry*.56),'●',3);}}
function drawScanner(canvas:CinematicCell[][],layout:Layout,elapsed:number,visibility:number){if(visibility<=0)return;const span=layout.mode==='full'?Math.min(44,layout.width-10):layout.mode==='medium'?Math.min(36,layout.width-8):Math.min(24,layout.width-6);const left=layout.cx-Math.floor(span/2),right=left+span-1,head=left+Math.round((span-1)*triangleWave(elapsed*.78+.12));for(let x=left;x<=right;x++){const dist=Math.abs(head-x);if(dist===0)setCell(canvas,layout,x,layout.cy,'◆',4);else if(dist===1)setCell(canvas,layout,x,layout.cy,'━',3);else if(dist<=3)setCell(canvas,layout,x,layout.cy,'═',2);else if(dist<=6)setCell(canvas,layout,x,layout.cy,'─',1);else if((x-left)%3===0)setCell(canvas,layout,x,layout.cy,'·',0);}}
function logoForMode(mode:CinematicLayoutMode){return mode==='full'||mode==='medium'?LOGO_FULL:LOGO_COMPACT;}
function drawLogoReveal(canvas:CinematicCell[][],layout:Layout,progress:number,final=false):Bounds{const logo=logoForMode(layout.mode),logoHeight=logo.length,logoWidth=Math.max(...logo.map(line=>Array.from(line).length));let startY=layout.mode==='micro'?Math.max(6,layout.height-logoHeight-4):Math.max(layout.cy+7,layout.height-logoHeight-4);if(startY+logoHeight>=layout.height)startY=Math.max(2,layout.height-logoHeight-3);const startX=Math.floor((layout.width-logoWidth)/2),p=final?1:easeOutCubic(progress),front=Math.round((logoWidth+8)*p)-4;for(let row=0;row<logoHeight;row++){const chars=Array.from(logo[row]!);const localFront=front-Math.round(row*1.35);for(let col=0;col<chars.length;col++){const ch=chars[col]!;if(ch===' ')continue;if(col<=localFront)setCell(canvas,layout,startX+col,startY+row,ch,2);else if(col-localFront<=2&&!final)setCell(canvas,layout,startX+col,startY+row,(col+row)%2===0?'▒':'░',(col+row)%2===0?1:0);}}return{x:startX,y:startY,width:logoWidth,height:logoHeight};}
function applyShimmer(canvas:CinematicCell[][],layout:Layout,bounds:Bounds,elapsed:number,final:boolean){const shimmerX=final?bounds.x+Math.floor(bounds.width*.58):bounds.x-7+Math.round((bounds.width+14)*clamp((elapsed-5.8)/.9,0,1));for(let y=bounds.y;y<bounds.y+bounds.height;y++){for(let x=bounds.x;x<bounds.x+bounds.width;x++){const cell=canvas[y]?.[x];if(!cell||cell.char===' ')continue;const d=Math.abs(x-shimmerX);if(d<=1)cell.level=4;else if(d<=3)cell.level=Math.max(cell.level,3);else if(d<=6)cell.level=Math.max(cell.level,2);}}}
function toAscii(char:string){return ASCII_MAP[char]??(/[\x00-\x7F]/u.test(char)?char:'#');}
function canvasToFrame(canvas:CinematicCell[][],layout:Layout,stage:Stage,unicode:boolean):CinematicFrame{const lines:string[]=[],levels:number[][]=[];for(const row of canvas){const chars:string[]=[],ls:number[]=[];for(const cell of row){chars.push(unicode?cell.char:toAscii(cell.char));ls.push(cell.level);}lines.push(chars.join('').replace(/\s+$/u,''));levels.push(ls);}return{lines,levels,stage:stage.name,mode:layout.mode};}

export function renderCinematicBoot(elapsedMs:number,terminalWidth:number,unicode=true,final=false):CinematicFrame{
  const layout=layoutForWidth(terminalWidth);const elapsed=final?TALOS_BOOT_DURATION_MS/1000:clamp(elapsedMs/1000,0,TALOS_BOOT_DURATION_MS/1000);const geometryElapsed=Math.floor(elapsed*15)/15,particleElapsed=Math.floor(elapsed*12)/12;let stage=stageInfo(geometryElapsed);let canvas=newCanvas(layout);let logoBounds:Bounds|undefined;
  if(layout.mode!=='micro'){putText(canvas,layout,2,0,'TALOS // AUTONOMOUS TERMINAL',2);const right=`BOOT ${String(Math.min(100,Math.floor(elapsed/7.2*100))).padStart(3,'0')}%`;putText(canvas,layout,Math.max(2,layout.width-Array.from(right).length-2),0,right,2);for(let x=2;x<layout.width-2;x++)if(x%7!==0)setCell(canvas,layout,x,1,'─',0);}
  if(stage.id===0)drawParticles(canvas,layout,particleElapsed,.25+.75*stage.progress);
  else if(stage.id===1){drawParticles(canvas,layout,particleElapsed,1-.35*stage.progress);drawNetwork(canvas,layout,stage.progress);}
  else if(stage.id===2){drawParticles(canvas,layout,particleElapsed,.45);drawNetwork(canvas,layout,1);drawCore(canvas,layout,stage.progress,geometryElapsed);}
  else if(stage.id===3){drawParticles(canvas,layout,particleElapsed,.24);drawNetwork(canvas,layout,1);drawCore(canvas,layout,1,geometryElapsed);drawScanner(canvas,layout,geometryElapsed,stage.progress);}
  else if(stage.id===4){drawNetwork(canvas,layout,1-.45*stage.progress);drawCore(canvas,layout,1,geometryElapsed);drawScanner(canvas,layout,geometryElapsed,1-.35*stage.progress);logoBounds=drawLogoReveal(canvas,layout,stage.progress);}
  else{drawCore(canvas,layout,1,geometryElapsed);logoBounds=drawLogoReveal(canvas,layout,1,true);}
  if(final){stage={name:'SYSTEM ONLINE',progress:1,id:6};canvas=newCanvas(layout);if(layout.mode!=='micro'){putText(canvas,layout,2,0,'TALOS // AUTONOMOUS TERMINAL',2);putText(canvas,layout,Math.max(2,layout.width-11),0,'BOOT 100%',2);for(let x=2;x<layout.width-2;x++)if(x%7!==0)setCell(canvas,layout,x,1,'─',0);}drawCore(canvas,layout,1,geometryElapsed);logoBounds=drawLogoReveal(canvas,layout,1,true);}
  if(logoBounds&&(stage.id>=5||final))applyShimmer(canvas,layout,logoBounds,elapsed,final);
  const statusY=layout.height-2;if(layout.mode==='micro')putCentered(canvas,layout,statusY,'[ TALOS // READY ]',3);else{putText(canvas,layout,2,statusY,`[${stage.name}]`,stage.id>=6?3:2);const right=stage.id>=6||final?'CORE ●   BUS ●   READY ●':'CORE ◇   BUS ◇   LINK ◇';putText(canvas,layout,Math.max(2,layout.width-Array.from(right).length-2),statusY,right,stage.id>=6?3:1);}
  if(stage.id>=6){const pulse=.5+.5*Math.sin(elapsed*4);if(pulse>.72)for(let y=layout.cy-1;y<=layout.cy+1;y++)for(let x=layout.cx-1;x<=layout.cx+1;x++){const cell=canvas[y]?.[x];if(cell&&cell.char!==' ')cell.level=4;}}
  return canvasToFrame(canvas,layout,stage,unicode);
}

export function rowsToSegments(frame:CinematicFrame):Array<Array<{text:string;level:number}>>{
  return frame.lines.map((line,rowIndex)=>{const chars=Array.from(line),levels=frame.levels[rowIndex]??[];const out:Array<{text:string;level:number}>=[];for(let i=0;i<chars.length;i++){const level=levels[i]??-1;const previous=out.at(-1);if(previous&&previous.level===level)previous.text+=chars[i];else out.push({text:chars[i]!,level});}return out;});
}
