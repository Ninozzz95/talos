/*
 * Owner 14/10/2026 («nuovo boot logo approvato, implementalo», mockup avvio-talos-cli.html, 0.6.5): the same boot — header, BOOT
 * counter, seven stages, the block TALOS, the CORE/BUS/READY line — with the real mark, continuous gold, a bus that fills from the
 * centre, a soft front on the word, a diagonal shimmer and breathing nodes; 5.2 s.
 * Owner 14/10/2026 evening («come una medaglia a doppio strato, molto più dettagliata» → «APPROVATA», mockup avvio-medaglia.html,
 * copy in the handoff folder `attrezzi-2026-10-13/mockup-medaglia-approvato-2026-10-14/medaglia.js`, 0.6.6): the mark becomes a
 * MEDAL — a pointy-top hexagon in two layers: an outer rim bevelled in six facets lit from the top left, a milled band of radial
 * ticks, a dark groove, an inner raised layer with its own bevel and six rivets, a guilloché field of dotted concentric hexagons,
 * and the mark (the logo's nodes and strokes, without its hexagon: the medal is the hexagon) in relief with a cast shadow, its
 * nodes with a ring and a highlight. The cell's BACKGROUND is the metal (a surface shade, mixed over the painted background), the
 * Braille dots are the details. 30×17 cells from 100 columns, 26×15 from 72, 20×11 below (the small one without ticks and rings,
 * which would clot); a short terminal takes the next smaller medal before dropping blank rows. The block TALOS stays block
 * letters while it fits (46 columns): 0.6.5 turned it into the thin three-row form below 72 columns although it fitted.
 * Codex rasterizes its welcome mark into Braille the same way (codex-rs/tui/src/empty_state_animation/renderer.rs) and shades it
 * against the terminal's own colours (lighting.rs); chalk (via Ink) brings the hex colours down to 256 or 16 colours where needed.
 */
export const TALOS_GOLD_PALETTE=['#604A12','#9D7F24','#D4AF37','#F7D774','#FFF4C2'] as const;
/** The continuous gold ramp of the approved mockup: intensity → colour. */
export const TALOS_GOLD_STOPS:ReadonlyArray<readonly [number,readonly [number,number,number]]>=[[0,[0x2a,0x22,0x0c]],[.18,[0x60,0x4a,0x12]],[.4,[0x9d,0x7f,0x24]],[.62,[0xd4,0xaf,0x37]],[.82,[0xf7,0xd7,0x74]],[1,[0xff,0xf4,0xc2]]];
export const TALOS_BOOT_DURATION_MS=5200;

export type CinematicLayoutMode='full'|'medium'|'compact'|'micro';
/** `metal`: the medal's surface shade of each cell (0 = no metal), drawn as the cell's background over the painted one. */
export type CinematicFrame={lines:string[];levels:number[][];intensities:number[][];metal:number[][];stage:string;mode:CinematicLayoutMode};
export type CinematicSegment={text:string;level:number;color?:string;background?:string};

type Cell={ch:string;i:number;metal:number};
type MedalSize={cols:number;rows:number};
type Layout={mode:CinematicLayoutMode;width:number;height:number;cx:number;m:MedalSize;blocks:boolean};
type Point=readonly [number,number];

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
  '█':'#','▓':'#','▒':'+','░':'.','╔':'+','╗':'+','╚':'+','╝':'+','╦':'+','╩':'+','╠':'+','╣':'+','═':'-','║':'|','╲':'\\','╱':'/','◇':'o','◆':'O','◈':'O','●':'o','•':'.','·':'.','∙':'.','━':'=','─':'-','│':'|',
};

const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
const outCubic=(t:number)=>{const v=clamp(t,0,1);return 1-Math.pow(1-v,3);};
const inOutSine=(t:number)=>{const v=clamp(t,0,1);return -(Math.cos(Math.PI*v)-1)/2;};
const outBack=(t:number)=>{const v=clamp(t,0,1);const c1=1.25,c3=c1+1;return 1+c3*Math.pow(v-1,3)+c1*Math.pow(v-1,2);};
const win=(t:number,[a,b]:readonly [number,number])=>clamp((t-a)/(b-a),0,1);
const S3=Math.sqrt(3)/2;

/* Times (ms): the rim traces, the plate fills, the inner layer rises, the mark lights layer by layer (s1..s5, 170 ms apart). */
const T={particlesIn:[0,900],rim:[500,1350],plate:[1050,1800],inner:[1500,2150],core:1900,step:170,stepLen:380,bus:[2500,3150],letters:[2850,3800],particlesOut:[2700,3600],shimmer:[3750,4650],online:4750} as const;

/* The mark (logo-short.svg, viewBox 500): nodes and strokes, without the hexagon — the hexagon is the medal. */
const rot=(deg:number,d:number):Point=>{const a=deg*Math.PI/180;return[250-Math.sin(a)*d,225+Math.cos(a)*d];};
const NODES:Array<{c:Point;r:number;step:number}>=[{c:[250,105],r:22,step:0},{c:[250,225],r:18,step:2},{c:[250,338],r:14,step:4},{c:rot(45,118),r:14,step:4},{c:rot(-45,118),r:14,step:4}];
const EDGES:Array<{a:Point;b:Point;step:number}>=[{a:[250,140],b:[250,195],step:1},{a:[250,255],b:[250,315],step:3},{a:rot(45,32),b:rot(45,95),step:3},{a:rot(-45,32),b:rot(-45,95),step:3}];
/* Braille dot → bit (U+2800 block: dots 1-3 and 7 in the left column, 4-6 and 8 in the right). */
const BRAILLE_BITS:ReadonlyArray<readonly [number,number,number]>=[[0,0,1],[0,1,2],[0,2,4],[1,0,8],[1,1,16],[1,2,32],[0,3,64],[1,3,128]];

/* The shape: a pointy-top hexagon; hexd = 1 on its edge; the facet says where the sloped surface faces. */
function hexd(u:number,v:number){const a=Math.abs(u)/S3,b=(Math.abs(u)*0.5+Math.abs(v)*S3)/S3;return Math.max(a,b);}
function facetNormal(u:number,v:number):Point{const a=Math.abs(u)/S3,b=(Math.abs(u)*0.5+Math.abs(v)*S3)/S3;if(a>=b)return[Math.sign(u)||1,0];return[0.5*(Math.sign(u)||1),S3*(Math.sign(v)||1)];}
const LIGHT:Point=[-0.62,-0.78];
const lit=(n:Point)=>0.5+0.5*(n[0]*LIGHT[0]+n[1]*LIGHT[1]);

export const MEDAL_SIZES:ReadonlyArray<MedalSize>=[{cols:30,rows:17},{cols:26,rows:15},{cols:20,rows:11}];
function medalSizeFor(mode:CinematicLayoutMode):number{return mode==='full'?0:mode==='medium'?1:2;}

/* The field of dots: surf = metal (becomes the cell's background), det = detail (becomes a lit Braille dot). */
function medalField(t:number,final:boolean,mc:number,mr:number,shX:number|null){
  const DW=mc*2,DH=mr*4,cx=(DW-1)/2,cy=(DH-1)/2,R=Math.min(DH/2-0.6,(DW/2-0.6)/S3);
  const surf=new Float32Array(DW*DH),det=new Float32Array(DW*DH);
  const rimP=final?1:outCubic(win(t,T.rim)),plateP=final?1:outCubic(win(t,T.plate)),innerP=final?1:outCubic(win(t,T.inner));
  const breathe=(t>=T.online&&!final)?.5+.5*Math.sin((t-T.online)/1000*3.2):0;
  for(let y=0;y<DH;y++)for(let x=0;x<DW;x++){
    const u=(x-cx)/R,v=(y-cy)/R;const d=hexd(u,v);if(d>1.0)continue;const k=y*DW+x;
    const ang=(Math.atan2(v,u)+Math.PI*2.5)%(Math.PI*2);                     /* 0 at the top, clockwise */
    const angFrac=ang/(Math.PI*2);
    const n=facetNormal(u,v);
    /* the rim traces itself: a point of the outline exists once its angle has been reached (from the top, both ways) */
    const traced=Math.min(angFrac,1-angFrac)*2<=rimP;
    let s=0;
    if(d>0.94) s=traced&&plateP>0?0.5+0.5*lit(n):0;                           /* outer rim, bevelled in facets */
    else if(d>0.875) s=plateP*(0.4+0.22*lit(n));                              /* milled band */
    else if(d>0.835) s=plateP*0.06;                                           /* groove */
    else if(d>0.765) s=plateP*(0.28+innerP*(0.3+0.38*lit(n)));                /* bevel of the inner layer */
    else s=plateP*(0.2+innerP*(0.22-0.1*d));                                  /* field */
    surf[k]=s;
  }
  /* the details are TRACED along the hexagon (sharp lines, not bands): outline, inner edge, ticks, rings */
  const V=[0,1,2,3,4,5].map(i=>{const a=-Math.PI/2+i*Math.PI/3;return[Math.cos(a),Math.sin(a)] as Point;});
  const plot=(px:number,py:number,val:number)=>{const ix=Math.round(px),iy=Math.round(py);if(ix<0||iy<0||ix>=DW||iy>=DH)return;const k=iy*DW+ix;det[k]=Math.max(det[k]!,val);};
  /* walks the hexagon of radius rf: cb(x, y, normal, fraction of the perimeter from the top) */
  function walk(rf:number,step:number,cb:(px:number,py:number,n:Point,f:number)=>void){const per=6*rf*R;let acc=0;for(let i=0;i<6;i++){const a=V[i]!,b=V[(i+1)%6]!;const nrm:Point=[(a[0]+b[0])/2,(a[1]+b[1])/2];const ln=Math.hypot(nrm[0],nrm[1]);const n:Point=[nrm[0]/ln,nrm[1]/ln];const L=rf*R;const n2=Math.max(1,Math.round(L/step));for(let j=0;j<n2;j++){const q=j/n2;const ux=a[0]+(b[0]-a[0])*q,uy=a[1]+(b[1]-a[1])*q;cb(cx+ux*rf*R,cy+uy*rf*R*1.0,n,(acc+q*L)/per);}acc+=L;}}
  const tracedAt=(f:number)=>Math.min(f,1-f)*2<=rimP;
  walk(0.99,0.5,(px,py,n,f)=>{if(tracedAt(f))plot(px,py,0.45+0.5*lit(n));});                                        /* outer outline */
  const small=mc<=20; /* the small medal: no ticks nor rings, the details would clot */
  if(plateP>0&&!small){                                                                                                  /* the groove stays dark: the background makes it */
    walk(0.91,3.4,(px,py,n)=>{if(plateP<0.5)return;const a=0.3+0.35*lit(n);for(const rr of [0.895,0.925]){const sx=cx+(px-cx)*rr/0.91,sy=cy+(py-cy)*rr/0.91;plot(sx,sy,a*Math.min(1,(plateP-0.5)*2));}});} /* radial ticks */
  if(innerP>0){walk(0.8,0.5,(px,py,n)=>plot(px,py,innerP*(0.4+0.5*lit(n))));                                           /* edge of the inner layer */
    for(const rf of (small?[]:[0.62,0.46,0.3]))walk(rf,1.6,(px,py)=>plot(px,py,0.16+0.1*innerP));}                     /* guilloché: dotted rings */
  /* the shimmer: a diagonal band across metal and details */
  if(shX!==null)for(let y=0;y<DH;y++)for(let x=0;x<DW;x++){const k=y*DW+x;if(surf[k]!<=0)continue;const p=(x/DW)+(y/DH)*0.55;const g=Math.max(0,1-Math.abs(p-shX)/0.11);if(g<=0)continue;surf[k]=Math.min(1,surf[k]!+g*0.35);if(det[k]!>0)det[k]=Math.min(1,det[k]!+g*0.5);}
  /* six rivets at the corners of the inner layer */
  if(innerP>0.4){for(let i=0;i<6;i++){const a=-Math.PI/2+i*Math.PI/3,rx=cx+Math.cos(a)*R*0.715,ry=cy+Math.sin(a)*R*0.715;
    for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const px=Math.round(rx+dx),py=Math.round(ry+dy);if(px<0||py<0||px>=DW||py>=DH)continue;const q=Math.hypot(dx,dy);const k=py*DW+px;
      if(q<=1.1){det[k]=Math.max(det[k]!,(dx<=0&&dy<=0?1:0.75)*innerP+breathe*0.06);surf[k]=Math.max(surf[k]!,0.75*innerP);}else if(q<=2.2){surf[k]=surf[k]!*0.55;det[k]=0;}}}}
  /* the mark in relief: a shadow to the bottom right, then the light relief; the nodes with a ring and a highlight */
  const ey:Point=[83,352];const sc=(1.16*R)/(ey[1]-ey[0]);const toDot=([px,py]:Point):Point=>[cx+(px-250)*sc,cy+(py-(ey[0]+ey[1])/2)*sc];
  const stamp=(buf:Float32Array,x:number,y:number,val:number,rad:number)=>{for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const px=Math.round(x)+dx,py=Math.round(y)+dy;if(px<0||py<0||px>=DW||py>=DH)continue;if(Math.hypot(px-x,py-y)<=rad){const k=py*DW+px;buf[k]=Math.max(buf[k]!,val);}}};
  const shadow=new Float32Array(DW*DH),relief=new Float32Array(DW*DH);
  for(const e of EDGES){const st=T.core+e.step*T.step;const p=final?1:outCubic(win(t,[st,st+T.stepLen]));if(p<=0)continue;const [x0,y0]=toDot(e.a),[x1,y1]=toDot(e.b);const n=Math.ceil(Math.hypot(x1-x0,y1-y0)*3);for(let i=0;i<=Math.floor(n*p);i++){const q=i/n;const x=x0+(x1-x0)*q,y=y0+(y1-y0)*q;stamp(shadow,x+1.2,y+1.2,1,0.9);stamp(relief,x,y,0.8,0.75);}}
  for(const nd of NODES){const st=T.core+nd.step*T.step;const p=final?1:win(t,[st,st+T.stepLen]);if(p<=0)continue;const g=final?1:outBack(p);const [nx,ny]=toDot(nd.c);const r=nd.r*sc*g;const flash=final?0:Math.max(0,1-Math.abs(p-.55)/.45)*.25;
    for(let py=Math.floor(ny-r-2);py<=Math.ceil(ny+r+2);py++)for(let px=Math.floor(nx-r-2);px<=Math.ceil(nx+r+2);px++){if(px<0||py<0||px>=DW||py>=DH)continue;const q=Math.hypot(px-nx,py-ny);const k=py*DW+px;
      if(Math.hypot(px-nx-1.2,py-ny-1.2)<=r+0.3)shadow[k]=1;
      if(q<=r+0.35){const ring=q>r-1.1;const hl=Math.hypot(px-(nx-r*0.35),py-(ny-r*0.35))<=Math.max(0.8,r*0.32);relief[k]=Math.max(relief[k]!,clamp((ring?0.95:hl?1:0.7)+flash+breathe*0.08,0,1));}}}
  for(let k=0;k<DW*DH;k++){if(shadow[k]&&!relief[k]){surf[k]=surf[k]!*0.45;}if(relief[k]){det[k]=Math.max(det[k]!,relief[k]!);surf[k]=Math.max(surf[k]!,0.55*relief[k]!);}}
  return{surf,det,DW,DH};
}

/* Few slow particles that breathe instead of blinking; one fixed seed, so every launch draws the same sky. */
function mulberry32(seed:number){let a=seed>>>0;return()=>{a=(a+0x6D2B79F5)>>>0;let x=a;x=Math.imul(x^(x>>>15),x|1);x^=x+Math.imul(x^(x>>>7),x|61);return((x^(x>>>14))>>>0)/4294967296;};}
const rnd=mulberry32(1413565519);
const PARTICLES=Array.from({length:46},()=>({x:rnd(),y:rnd(),vx:(rnd()-.5)*.018,vy:(rnd()-.5)*.012,ph:rnd()*Math.PI*2,tier:rnd()}));

function layoutFor(terminalWidth:number,sizeIndex?:number,blocksIfWide=true):Layout{
  const tw=Math.max(32,Math.trunc(terminalWidth||80));
  const mode:CinematicLayoutMode=tw<48?'micro':tw<72?'compact':tw<100?'medium':'full';
  const width=Math.min(112,Math.max(30,tw-2));
  const m=MEDAL_SIZES[sizeIndex??medalSizeFor(mode)]!;
  const blocks=blocksIfWide&&width>=46; /* the block letters (42 columns) while they fit; below, the compact form */
  const height=3+m.rows+1+(mode==='micro'?0:2)+(blocks?6:3)+3;
  return{mode,width,height,cx:Math.floor(width/2),m,blocks};
}

function stageAt(t:number,final:boolean){if(final||t>=T.online)return'SYSTEM ONLINE';if(t>=T.shimmer[0])return'ENERGY SHIMMER';if(t>=T.letters[0])return'TALOS ASSEMBLY';if(t>=T.bus[0])return'SYNCHRONIZATION BUS';if(t>=T.core)return'CORE IGNITION';if(t>=T.rim[0])return'NETWORK CONVERGENCE';return'SIGNAL ACQUISITION';}

/** The five old steps, for whoever still reads a level: the nearest stop of the ramp. */
export function goldLevel(intensity:number):number{return intensity<.29?0:intensity<.51?1:intensity<.72?2:intensity<.91?3:4;}
const hex2=(v:number)=>Math.round(clamp(v,0,255)).toString(16).padStart(2,'0');
const rgbHex=([r,g,b]:readonly number[])=>`#${hex2(r!)}${hex2(g!)}${hex2(b!)}`;
const QUANT=32;
const GOLD_TABLE=Array.from({length:QUANT+1},(_,q)=>{const i=q/QUANT;for(let k=1;k<TALOS_GOLD_STOPS.length;k++){const [b,cb]=TALOS_GOLD_STOPS[k]!;if(i<=b){const [a,ca]=TALOS_GOLD_STOPS[k-1]!;const f=(i-a)/(b-a);return rgbHex(ca.map((v,j)=>v+(cb[j]!-v)*f));}}return'#fff4c2';});
/** The gold of an intensity, in 33 steps (enough for the eye, and neighbouring cells share a colour so a row stays a few runs). */
export function goldAt(intensity:number):string{return GOLD_TABLE[Math.round(clamp(intensity,0,1)*QUANT)]!;}
/* The metal: from the painted background to a dark golden bronze, never lighter than the dots (the approved mockup's ramp, whose
   first stop is the Forge background #080b11; here it is the background TALOS really paints). */
const METAL_STOPS:ReadonlyArray<readonly [number,readonly [number,number,number]]>=[[.35,[38,29,9]],[.7,[78,60,18]],[1,[124,96,30]]];
/** The exact metal colour of a surface shade over a background, as [r,g,b] (the mockup's `metal`). */
export function metalRgb(shade:number,base:readonly [number,number,number]):[number,number,number]{
  const s=clamp(shade,0,1);const stops:Array<readonly [number,readonly number[]]>=[[0,base],...METAL_STOPS];
  for(let k=1;k<stops.length;k++){const [b,cb]=stops[k]!;if(s<=b){const [a,ca]=stops[k-1]!;const f=(s-a)/(b-a);return ca.map((v,j)=>Math.round(v+(cb[j]!-v)*f)) as [number,number,number];}}
  return [...METAL_STOPS.at(-1)![1]] as [number,number,number];
}
/** The metal behind a cell over a painted background (#rrggbb), exactly the mockup's colour; none where there is no metal or no
    known base. Not quantized: the medal's neighbouring cells rarely share a shade anyway, and the approved picture is the measure. */
export function metalOver(shade:number,base:string):string|undefined{const m=/^#([0-9a-f]{6})$/iu.exec(base);if(!m||shade<=0.01)return undefined;const n=parseInt(m[1]!,16);return rgbHex(metalRgb(shade,[n>>16&255,n>>8&255,n&255]));}

function brailleToAscii(ch:string){const bits=ch.charCodeAt(0)-0x2800;let n=0;for(let b=bits;b;b>>=1)n+=b&1;return n<=2?'.':n<=4?':':n<=6?'+':'#';}
function toAscii(ch:string){const code=ch.charCodeAt(0);if(code>=0x2800&&code<=0x28ff)return brailleToAscii(ch);return ASCII_MAP[ch]??(/[\x00-\x7F]/u.test(ch)?ch:'#');}

/* Owner 14/10 (0.6.5), seen at 80×24 in the synthetic terminal: with `rows` (what the screen leaves the picture) the blank rows go
   first, always the same ones and in a fixed order — under the status line, after the word, above the medal, around the bus —
   then the rule under the header and the bus itself; nothing moves while it plays. Without `rows` the picture is the mockup's grid. */
function rowsToDrop(L:Layout):number[]{
  const top=L.mode==='micro'?1:3,busY=top+L.m.rows+1,ly=L.mode==='micro'?top+L.m.rows+1:busY+2,logoHeight=L.blocks?6:3;
  const statusY=L.height-2;
  const afterWord=Array.from({length:Math.max(0,statusY-(ly+logoHeight))},(_,k)=>statusY-1-k);
  if(L.mode==='micro')return[L.height-1,...afterWord,0,top+L.m.rows];
  return[L.height-1,...afterWord,2,busY+1,top+L.m.rows,1,busY];
}

/* R4 Q-R4-4: the short boot is the final frame without the `BOOT nnn%` counter (`counter:false`): a counter that says 100% on
   every launch is a progress bar with nothing in progress, and s09 recognises a replayed full boot by it. */
export function renderCinematicBoot(elapsedMs:number,terminalWidth:number,unicode=true,final=false,{counter=true,rows}:{counter?:boolean;rows?:number}={}):CinematicFrame{
  const t=final?TALOS_BOOT_DURATION_MS:clamp(elapsedMs,0,TALOS_BOOT_DURATION_MS);
  /* a short terminal takes the next smaller medal, and last the compact word, before it gives up rows it cannot spare: 80×24
     (20 rows) takes the 20×11 medal, 60×22 (18 rows) the compact word; with nothing smaller left, the smallest picture */
  let L=layoutFor(terminalWidth);
  if(rows!==undefined){const budget=Math.max(1,Math.trunc(rows));const fits=(C:Layout)=>C.height-rowsToDrop(C).length<=budget;
    const smaller=[...MEDAL_SIZES.keys()].filter(i=>i>medalSizeFor(L.mode)).map(i=>layoutFor(terminalWidth,i));if(L.blocks)smaller.push(layoutFor(terminalWidth,MEDAL_SIZES.length-1,false));
    for(const C of smaller){if(fits(L))break;L=C;}}
  const grid:Cell[][]=Array.from({length:L.height},()=>Array.from({length:L.width},()=>({ch:' ',i:0,metal:0})));
  const put=(x:number,y:number,ch:string,i:number)=>{if(x<0||y<0||x>=L.width||y>=L.height)return;const c=grid[y]![x]!;if(ch===' '&&c.ch!==' ')return;if(i>=c.i||c.ch===' '){c.ch=ch;c.i=i;}};
  const text=(x:number,y:number,s:string,i:number)=>{Array.from(s).forEach((ch,k)=>put(x+k,y,ch,i));};
  /* header: as before */
  if(L.mode!=='micro'){text(2,0,'TALOS // AUTONOMOUS TERMINAL',.55);if(counter){const r=`BOOT ${String(Math.min(100,Math.floor(t/TALOS_BOOT_DURATION_MS*100))).padStart(3,'0')}%`;text(L.width-r.length-2,0,r,.55);}for(let x=2;x<L.width-2;x++)if(x%7!==0)put(x,1,'─',.16);}
  /* particles */
  const pVis=final?0:outCubic(win(t,T.particlesIn))*(1-inOutSine(win(t,T.particlesOut)));
  if(pVis>0&&L.mode!=='micro'){for(const p of PARTICLES.slice(0,L.mode==='full'?46:L.mode==='medium'?34:20)){const s=t/1000;let nx=(p.x+p.vx*s)%1,ny=(p.y+p.vy*s)%1;if(nx<0)nx+=1;if(ny<0)ny+=1;const tw=.5+.5*Math.sin(s*1.6+p.ph);const a=pVis*(.25+.55*tw)*(p.tier<.6?.6:1);put(1+Math.floor(nx*(L.width-2)),3+Math.floor(ny*(L.height-7)),p.tier<.6?'·':p.tier<.9?'•':'∙',a*.6);}}
  /* the medal */
  const MC=L.m.cols,MR=L.m.rows;const top=L.mode==='micro'?1:3,left=L.cx-Math.floor(MC/2);
  const shX=(!final&&t>=T.shimmer[0]&&t<=T.shimmer[1])?-0.3+1.9*inOutSine(win(t,T.shimmer)):null;
  const {surf,det,DW}=medalField(t,final,MC,MR,shX);
  for(let r=0;r<MR;r++)for(let c=0;c<MC;c++){let bits=0,mx=0,sum=0;for(const [dx,dy,b] of BRAILLE_BITS){const k=(r*4+dy)*DW+(c*2+dx);sum+=surf[k]!;if(det[k]!>.06){bits|=b;mx=Math.max(mx,det[k]!);}}
    const x=left+c,y=top+r;const avg=sum/8;if(x<0||y<0||x>=L.width||y>=L.height)continue;const cell=grid[y]![x]!;
    if(avg>0.01)cell.metal=avg;if(bits){cell.ch=String.fromCharCode(0x2800+bits);cell.i=clamp(0.25+mx*0.75,0,1);}}
  /* the bus and the word, as in the approved boot */
  const busY=top+MR+1;const span=L.mode==='full'?40:L.mode==='medium'?32:20;const bp=final?1:outCubic(win(t,T.bus));
  if(bp>0&&L.mode!=='micro'){const half=Math.floor(span/2*bp);const head=final?null:L.cx-Math.floor(span/2)+span*inOutSine(win(t,[T.bus[0]+200,T.letters[1]]));for(let x=L.cx-half;x<=L.cx+half;x++){let i=.22;if(head!==null){const d=Math.abs(x-head);if(d<1)i=1;else if(d<3)i=.7;else if(d<6)i=.42;}put(x,busY,'─',i);}}
  const logo=L.blocks?LOGO_FULL:LOGO_COMPACT;const lw=Array.from(logo[0]).length;const lx=Math.floor((L.width-lw)/2);const ly=L.mode==='micro'?top+MR+1:busY+2;
  const lp=final?1:outCubic(win(t,T.letters));const front=(lw+16)*lp-5;const shL=shX===null?null:-8+(L.width+16)*clamp((shX+0.3)/1.9,0,1);
  logo.forEach((row,ri)=>Array.from(row).forEach((ch,ci)=>{if(ch===' ')return;const k=final?1:clamp((front-ci-ri*1.2)/4,0,1);if(k<=0)return;let i=.2+.42*k;const x=lx+ci,y=ly+ri;if(shL!==null){const d=Math.abs(x+ri*.6-shL);i=clamp(i+Math.max(0,1-d/5)*.5,0,1);}else if(final)i=.62;put(x,y,ch,i);}));
  /* status line */
  const statusY=L.height-2;const stage=stageAt(t,final);const online=stage==='SYSTEM ONLINE';
  if(L.mode==='micro')text(Math.floor((L.width-18)/2),statusY,'[ TALOS // READY ]',.8);
  else{text(2,statusY,`[${stage}]`,online?.8:.55);const right=online?'CORE ●   BUS ●   READY ●':'CORE ◇   BUS ◇   LINK ◇';text(L.width-Array.from(right).length-2,statusY,right,online?.8:.32);}
  const dropped=new Set<number>();if(rows!==undefined)for(const y of rowsToDrop(L)){if(L.height-dropped.size<=Math.max(1,Math.trunc(rows)))break;dropped.add(y);}
  const lines:string[]=[],levels:number[][]=[],intensities:number[][]=[],metal:number[][]=[];
  for(const [y,row] of grid.entries()){if(dropped.has(y))continue;
    /* a row ends at its last character OR its last cell of metal: a blank cell with metal behind it is part of the medal */
    let end=row.length;while(end>0&&row[end-1]!.ch===' '&&row[end-1]!.metal===0)end--;
    lines.push(row.slice(0,end).map(c=>unicode?c.ch:toAscii(c.ch)).join(''));levels.push(row.map(c=>c.ch===' '?-1:goldLevel(c.i)));intensities.push(row.map(c=>c.ch===' '?0:c.i));metal.push(row.map(c=>c.metal));}
  return{lines,levels,intensities,metal,stage,mode:L.mode};
}

/** The smallest medal at rest, worked out once: the Home shows it at every launch. Nothing of the boot's clock is in it. */
let resting:{base:string;rows:CinematicSegment[][]}|null=null;
export function restingMedal(base:string):CinematicSegment[][]{
  if(resting?.base===base)return resting.rows;
  const {cols,rows}=MEDAL_SIZES[MEDAL_SIZES.length-1]!;
  const {surf,det,DW}=medalField(TALOS_BOOT_DURATION_MS,true,cols,rows,null);
  const lines:string[]=[],levels:number[][]=[],intensities:number[][]=[],metal:number[][]=[];
  for(let r=0;r<rows;r+=1){
    let line='';const level:number[]=[],shine:number[]=[],back:number[]=[];
    for(let c=0;c<cols;c+=1){
      let bits=0,most=0,sum=0;
      for(const [dx,dy,b] of BRAILLE_BITS){const k=(r*4+dy)*DW+(c*2+dx);sum+=surf[k]!;if(det[k]!>.06){bits|=b;most=Math.max(most,det[k]!);}}
      const i=bits?clamp(0.25+most*0.75,0,1):0;
      line+=bits?String.fromCharCode(0x2800+bits):' ';level.push(bits?goldLevel(i):-1);shine.push(i);back.push(sum/8>0.01?sum/8:0);
    }
    lines.push(line);levels.push(level);intensities.push(shine);metal.push(back);
  }
  resting={base,rows:rowsToSegments({lines,levels,intensities,metal,stage:'',mode:'micro'},{glowBase:base})};
  return resting.rows;
}

/** One row → runs of cells that share a colour (and a metal background, when the background is painted and so known). */
export function rowsToSegments(frame:CinematicFrame,{glowBase}:{glowBase?:string}={}):CinematicSegment[][]{
  return frame.lines.map((line,y)=>{const chars=Array.from(line),levels=frame.levels[y]??[],ins=frame.intensities[y]??[],mt=frame.metal[y]??[];const out:CinematicSegment[]=[];
    for(let x=0;x<chars.length;x++){const level=levels[x]??-1;const color=level<0?undefined:goldAt(ins[x]??0);const background=glowBase?metalOver(mt[x]??0,glowBase):undefined;const previous=out.at(-1);
      if(previous&&previous.color===color&&previous.background===background)previous.text+=chars[x];else out.push({text:chars[x]!,level,...(color?{color}:{}),...(background?{background}:{})});}
    return out;});
}
