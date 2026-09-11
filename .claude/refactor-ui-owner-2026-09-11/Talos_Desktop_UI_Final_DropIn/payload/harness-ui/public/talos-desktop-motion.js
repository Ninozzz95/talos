/** TALOS Desktop Final UI — drop-in Canvas motion bundle. */
/**
 * TALOS Desktop — scene Canvas portate dal mobile.
 *
 * Provenienza: mockup desktop approvato, a sua volta trasposto dalle 14 scene
 * `mobile/src/motion-v6/scenes/complex/*` del commit pubblico 355dc8e.
 * Il calcolo delle scene e i ruoli semantici della palette restano invariati;
 * cambia soltanto il confine modulo/browser.
 */
(function(){'use strict';
/* Canvas substrate adapted from TALOS mobile 355dc8e, sceneTools.ts.
 * Only the module/type boundary changes. Scene arithmetic and colour roles are retained. */
const TAU=Math.PI*2,PHI=(1+Math.sqrt(5))/2,GOLDEN_ANGLE=TAU*(1-1/PHI);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const mix=(a,b,t)=>a+(b-a)*t;
const invLerp=(a,b,v)=>clamp((v-a)/Math.max(1e-9,b-a),0,1);
function smoothstep(a,b,v){const t=invLerp(a,b,v);return t*t*(3-2*t);}
function smootherstep(a,b,v){const t=invLerp(a,b,v);return t*t*t*(t*(t*6-15)+10);}
const fract=v=>v-Math.floor(v);
function wrap(v,m){const r=v%m;return r<0?r+m:r;}
function sceneHash(id){let h=0x811c9dc5;for(const c of id){h^=c.charCodeAt(0);h=Math.imul(h,0x01000193);}return h>>>0;}
function random(seed){let value=seed>>>0;return()=>{value+=0x6d2b79f5;let r=value;r=Math.imul(r^(r>>>15),r|1);r^=r+Math.imul(r^(r>>>7),r|61);return((r^(r>>>14))>>>0)/4294967296;};}
const rngFor=(id,seed,salt=0)=>random((seed^sceneHash(id)^Math.imul(salt+1,0x9e3779b9))>>>0);
function hash01(a,b,c=0){let v=(Math.imul(a|0,0x45d9f3b)^Math.imul(b|0,0x119de1f3)^Math.imul(c|0,0x344b1d))>>>0;v=Math.imul(v^(v>>>16),0x45d9f3b);v=Math.imul(v^(v>>>16),0x45d9f3b);return((v^(v>>>16))>>>0)/4294967296;}
function noise1(v,seed=0){const i=Math.floor(v),f=fract(v);return mix(hash01(i,seed),hash01(i+1,seed),f*f*(3-2*f));}
function noise2(x,y,seed=0){const ix=Math.floor(x),iy=Math.floor(y),fx=fract(x),fy=fract(y),sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy);return mix(mix(hash01(ix,iy,seed),hash01(ix+1,iy,seed),sx),mix(hash01(ix,iy+1,seed),hash01(ix+1,iy+1,seed),sx),sy);}
function fbm2(x,y,seed=0,octaves=4){let s=0,a=.5,f=1,t=0;for(let o=0;o<octaves;o++){s+=noise2(x*f,y*f,seed+o*101)*a;t+=a;f*=2.03;a*=.5;}return t>0?s/t:0;}
function makePaletteGeometry(id,seed,input){const a=input.palette[input.colorMode];return Object.freeze({id,width:input.viewport.width,height:input.viewport.height,mobile:input.viewport.width<600,accent:a.accent,secondary:a.secondary,border:a.border_strong,surface:a.surface_elevated,background:a.background,focus:a.focus,info:a.info,success:a.success,warning:a.warning,danger:a.danger,parameters:Object.freeze({...input.parameters}),quality:input.effectiveQuality.tier,densityScale:input.effectiveQuality.densityScale,seed});}
const alpha=(g,b)=>clamp(b*(.32+g.parameters.intensity/100*.8)*(.7+g.parameters.contrast/100*.46),.006,.94);
function qCount(g,lo,bal,hi){const b=g.quality==='high'?hi:g.quality==='low'?lo:bal;return Math.max(2,Math.round(b*(g.mobile?.78:1)*clamp(g.densityScale*(.72+g.parameters.density/360),.48,1.38)));}
const primitiveCount=(i,lo,bal,hi)=>i.effectiveQuality.tier==='high'?hi:i.effectiveQuality.tier==='low'?lo:bal;
const seconds=ms=>clamp(ms/1000,0,.05);
function linearGradient(c,g,x0,y0,x1,y1,colors=[g.accent,g.secondary]){const grad=c.createLinearGradient(x0,y0,x1,y1);grad.addColorStop(0,'transparent');colors.forEach((v,i)=>grad.addColorStop((i+1)/(colors.length+1),v));grad.addColorStop(1,'transparent');return grad;}
function radialGradient(c,x,y,r,inner,middle){const g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,inner);g.addColorStop(.38,middle);g.addColorStop(1,'transparent');return g;}
function strokeLine(c,x0,y0,x1,y1){c.beginPath();c.moveTo(x0,y0);c.lineTo(x1,y1);c.stroke();}
function polyline(c,p,close=false){if(!p.length)return;c.beginPath();c.moveTo(p[0].x,p[0].y);for(let i=1;i<p.length;i++)c.lineTo(p[i].x,p[i].y);if(close)c.closePath();}
const polygon=(c,p)=>polyline(c,p,true);
function drawDiamond(c,x,y,r){c.beginPath();c.moveTo(x,y-r);c.lineTo(x+r,y);c.lineTo(x,y+r);c.lineTo(x-r,y);c.closePath();}
const ringPoints=(cx,cy,r,count,phase=0,warp=0)=>Array.from({length:count},(_,i)=>{const a=phase+i/count*TAU,rr=r*(1+warp*Math.sin(a*3+phase*.7));return{x:cx+Math.cos(a)*rr,y:cy+Math.sin(a)*rr};});
const defineScene=d=>Object.freeze(d);

/* Port: mobile scenes/complex/forge.ts — source blob effce24be11c267b2b3a8c1f2b1e47e53a757b42. */

const forgeComplexScene=defineScene({id:'forge',createState:seed=>({seed,time:0,cycle:0,impulse:0}),prepare:({state,input})=>{
const base=makePaletteGeometry('forge',state.seed,input),rng=rngFor('forge',state.seed,101),rankCount=qCount(base,4,5,6),nodes=[],edges=[];
for(let rank=0;rank<rankCount;rank++){const inRank=rank===0||rank===rankCount-1?2:Math.round(2+rng()*2);for(let local=0;local<inRank;local++)nodes.push(Object.freeze({x:base.width*(.1+.8*rank/Math.max(1,rankCount-1))+(rng()-.5)*base.width*.035,y:base.height*(.18+.64*(local+1)/(inRank+1))+(rng()-.5)*base.height*.05,rank,heat:rng(),size:4+rng()*7}));}
for(let i=0;i<nodes.length;i++){const from=nodes[i],candidates=nodes.map((node,j)=>({node,i:j})).filter(({node})=>node.rank===from.rank+1);candidates.slice(0,1+i%2).forEach(({i:j},lane)=>edges.push(Object.freeze({from:i,to:j,bow:(rng()-.5)*base.height*.16,lane})));}
const gears=Object.freeze(Array.from({length:qCount(base,2,3,4)},(_,i)=>Object.freeze({x:base.width*(.16+i*.24+rng()*.08),y:base.height*(.78-i%2*.46),radius:18+rng()*28,teeth:8+Math.round(rng()*7),direction:i%2===0?1:-1,phase:rng()*TAU}))),rails=Object.freeze(Array.from({length:qCount(base,3,5,7)},(_,i)=>base.height*(.13+.74*(i+1)/(qCount(base,3,5,7)+1))));return{geometry:Object.freeze({...base,nodes:Object.freeze(nodes),edges:Object.freeze(edges),gears,rails}),primitiveCount:primitiveCount(input,230,310,390)};},update:({state,input,stepMs})=>{const dt=seconds(stepMs)*input.parameters.speed/100;state.time+=dt;state.cycle=(state.cycle+dt*.22)%1;state.impulse=(state.impulse+dt*.84)%1;},draw:({context:c,state:s,geometry:g})=>{
c.save();c.clearRect(0,0,g.width,g.height);c.lineJoin='bevel';c.lineCap='square';c.strokeStyle=g.border;c.lineWidth=.7;c.globalAlpha=alpha(g,.14);
for(let i=0;i<g.rails.length;i++){const y=g.rails[i]+Math.sin(s.time*2.1+i)*.65;strokeLine(c,g.width*.04,y,g.width*.96,y);for(let n=0;n<14;n++){const x=g.width*(.06+.88*n/13);strokeLine(c,x,y-3-n%3,x,y+3+n%3);}}
const px=g.width*.5,pt=g.height*.12,pb=g.height*.88,pw=g.width*.12;c.strokeStyle=g.border;c.lineWidth=1.1;c.globalAlpha=alpha(g,.22);strokeLine(c,px-pw,pt,px-pw,pb);strokeLine(c,px+pw,pt,px+pw,pb);strokeLine(c,px-pw,pt,px+pw,pt);strokeLine(c,px-pw*1.25,pb,px+pw*1.25,pb);
const ram=g.height*(.26+.24*(.5+.5*Math.sin(s.time*.46)));c.fillStyle=g.accent;c.globalAlpha=alpha(g,.16);c.fillRect(px-pw*.32,pt,pw*.64,ram-pt);c.fillStyle=g.warning;c.globalAlpha=alpha(g,.34);c.fillRect(px-pw*.52,ram,pw*1.04,4);c.strokeStyle=g.secondary;c.globalAlpha=alpha(g,.16);for(let r=0;r<5;r++){const x=px-pw*.8+r*pw*.4;strokeLine(c,x,pt+10,x,ram-8);}
for(const gear of g.gears){c.save();c.translate(gear.x,gear.y);c.rotate(gear.phase+s.time*.18*gear.direction);c.strokeStyle=g.border;c.fillStyle=g.surface;c.lineWidth=1;c.globalAlpha=alpha(g,.18);c.beginPath();c.arc(0,0,gear.radius*.68,0,TAU);c.fill();c.stroke();for(let t=0;t<gear.teeth;t++){const a=t/gear.teeth*TAU;c.lineWidth=t%2===0?2.2:1;strokeLine(c,Math.cos(a)*gear.radius*.72,Math.sin(a)*gear.radius*.72,Math.cos(a)*gear.radius,Math.sin(a)*gear.radius);}c.strokeStyle=g.accent;c.globalAlpha=alpha(g,.42);c.lineWidth=1.3;c.beginPath();c.arc(0,0,gear.radius*.18,0,TAU);c.stroke();c.restore();}
const pe=Math.floor(s.cycle*Math.max(1,g.edges.length));g.edges.forEach((e,i)=>{const f=g.nodes[e.from],t=g.nodes[e.to],hot=i===pe||i===(pe+1)%Math.max(1,g.edges.length);c.beginPath();c.moveTo(f.x,f.y);c.bezierCurveTo(f.x+(t.x-f.x)*.34,f.y+e.bow,t.x-(t.x-f.x)*.2,t.y-e.bow*.45,t.x,t.y);c.strokeStyle=hot?linearGradient(c,g,f.x,f.y,t.x,t.y,[g.warning,g.accent,g.secondary]):g.border;c.globalAlpha=alpha(g,hot?.74:.2);c.lineWidth=hot?2.3:.9;c.shadowBlur=hot?12:0;c.shadowColor=g.accent;c.stroke();});
g.nodes.forEach((n,i)=>{const beat=.5+.5*Math.sin(s.time*1.8+i*.7),active=Math.abs(s.cycle-n.rank/Math.max(1,g.nodes.length))<.11;c.fillStyle=active?g.warning:n.heat>.58?g.accent:g.secondary;c.strokeStyle=g.border;c.globalAlpha=alpha(g,.45+beat*.18);c.shadowBlur=active?14:4;c.shadowColor=g.accent;drawDiamond(c,n.x,n.y,n.size*(.8+beat*.22));c.fill();c.stroke();c.shadowBlur=0;});
const wx=g.width*(.09+.82*s.impulse),wy=g.height*(.46+Math.sin(s.time*1.7)*.08);c.fillStyle=radialGradient(c,wx,wy,48,g.focus,g.warning);c.globalAlpha=alpha(g,.35);c.beginPath();c.arc(wx,wy,34,0,TAU);c.fill();c.strokeStyle=g.warning;c.globalAlpha=alpha(g,.38);for(let sp=0;sp<7;sp++){const a=hash01(sp,Math.floor(s.time*4),g.seed)*TAU,l=8+hash01(sp,g.seed,9)*26;strokeLine(c,wx,wy,wx+Math.cos(a)*l,wy+Math.sin(a)*l);}c.restore();}});

/* Port: mobile scenes/complex/paper.ts — source blob 7faac04607786126fe53e775ab284086796bd6fe. */

const paperComplexScene=defineScene({id:'paper',createState:seed=>({seed,time:0,reading:0,breath:0}),prepare:({state,input})=>{const b=makePaletteGeometry('paper',state.seed,input),rng=rngFor('paper',state.seed,211),pageW=b.width*(b.mobile?.84:.68),pageH=b.height*.84,pageX=(b.width-pageW)*.5,pageY=b.height*.075,paragraphs=Array.from({length:qCount(b,4,6,8)},(_,i)=>({x:pageX+pageW*(.13+i%2*.03),y:pageY+pageH*(.12+i*.105),width:pageW*(.55+rng()*.22),lines:3+Math.floor(rng()*4),rhythm:.72+rng()*.25,emphasis:rng()})),notes=Array.from({length:qCount(b,3,4,6)},(_,i)=>({side:i%2===0?-1:1,y:pageY+pageH*(.18+i*.13+rng()*.035),length:pageW*(.055+rng()*.055),curl:(rng()-.5)*22,phase:rng()*TAU})),fibers=Array.from({length:qCount(b,36,58,80)},()=>({x:pageX+rng()*pageW,y:pageY+rng()*pageH,length:4+rng()*16,angle:(rng()-.5)*.6,alpha:.02+rng()*.04}));return{geometry:{...b,pageX,pageY,pageW,pageH,paragraphs,notes,fibers},primitiveCount:primitiveCount(input,150,220,310)};},update:({state:s,input:i,stepMs})=>{const dt=seconds(stepMs)*i.parameters.speed/100;s.time+=dt;s.reading=(s.reading+dt*.055)%1;s.breath+=dt*.18;},draw:({context:c,state:s,geometry:g})=>{c.save();c.clearRect(0,0,g.width,g.height);const lift=Math.sin(s.breath)*1.5;c.fillStyle=g.surface;c.globalAlpha=alpha(g,.12);c.shadowBlur=20;c.shadowColor=g.border;c.fillRect(g.pageX,g.pageY+lift,g.pageW,g.pageH);c.shadowBlur=0;c.strokeStyle=g.border;c.lineWidth=.8;c.globalAlpha=alpha(g,.26);c.strokeRect(g.pageX,g.pageY+lift,g.pageW,g.pageH);
c.fillStyle=g.accent;c.globalAlpha=alpha(g,.16);c.fillRect(g.pageX+g.pageW*.08,g.pageY+g.pageH*.09,3,g.pageH*.22);c.fillStyle=g.secondary;c.globalAlpha=alpha(g,.06);c.fillRect(g.pageX+g.pageW*.68,g.pageY+g.pageH*.1,g.pageW*.18,g.pageH*.09);c.strokeStyle=g.accent;c.lineWidth=1;c.globalAlpha=alpha(g,.24);const rx=g.pageX+g.pageW*.82,ry=g.pageY+g.pageH*.17;c.beginPath();c.arc(rx,ry,14,0,TAU);c.stroke();strokeLine(c,rx-21,ry,rx+21,ry);strokeLine(c,rx,ry-21,rx,ry+21);c.strokeStyle=g.border;c.globalAlpha=alpha(g,.11);c.beginPath();c.moveTo(g.pageX+g.pageW*.72,g.pageY+g.pageH*.88);c.quadraticCurveTo(g.pageX+g.pageW*.82,g.pageY+g.pageH*.81,g.pageX+g.pageW*.9,g.pageY+g.pageH*.9);c.stroke();
c.strokeStyle=g.border;c.lineWidth=.5;for(const f of g.fibers){c.globalAlpha=alpha(g,f.alpha);strokeLine(c,f.x,f.y+lift,f.x+Math.cos(f.angle)*f.length,f.y+lift+Math.sin(f.angle)*f.length);}
const left=g.pageX+g.pageW*.12;c.strokeStyle=g.secondary;c.globalAlpha=alpha(g,.28);c.lineWidth=1;strokeLine(c,left-14,g.pageY+g.pageH*.08,left-14,g.pageY+g.pageH*.91);for(let t=0;t<18;t++){const y=g.pageY+g.pageH*(.1+t*.044);c.globalAlpha=alpha(g,t%4===0?.18:.07);strokeLine(c,left,y,g.pageX+g.pageW*.9,y);}
g.paragraphs.forEach((p,i)=>{const active=Math.abs(s.reading-i/Math.max(1,g.paragraphs.length))<.08;for(let l=0;l<p.lines;l++){const y=p.y+lift+l*8.5,w=p.width*(l===p.lines-1?.58+p.emphasis*.25:.93+Math.sin(l+i)*.04);c.fillStyle=active&&l===0?g.accent:g.border;c.globalAlpha=alpha(g,active?.5:.24);c.fillRect(p.x,y,w*p.rhythm,l===0&&p.emphasis>.65?2.4:1.15);}});
c.strokeStyle=g.accent;c.lineWidth=1.2;g.notes.forEach((n,i)=>{const x=n.side<0?g.pageX+g.pageW*.055:g.pageX+g.pageW*.945,inside=n.side<0?1:-1,sway=Math.sin(s.time*.22+n.phase)*2;c.globalAlpha=alpha(g,.32+i%2*.08);c.beginPath();c.moveTo(x,n.y+sway);c.quadraticCurveTo(x+inside*n.length*.48,n.y-7+n.curl*.25,x+inside*n.length,n.y+2+n.curl*.08);c.stroke();c.beginPath();c.arc(x+inside*n.length*1.08,n.y+2,2.2+i%2,0,TAU);c.stroke();});
const y=g.pageY+g.pageH*(.11+s.reading*.78);c.fillStyle=radialGradient(c,g.pageX+g.pageW*.52,y,g.pageW*.34,g.accent,g.secondary);c.globalAlpha=alpha(g,.025);c.beginPath();c.arc(g.pageX+g.pageW*.52,y,g.pageW*.31,0,TAU);c.fill();c.strokeStyle=g.accent;c.globalAlpha=alpha(g,.36);c.lineWidth=1;const x=g.pageX+g.pageW*.86,cy=g.pageY+g.pageH*.095;strokeLine(c,x-8,cy,x+8,cy);strokeLine(c,x,cy-8,x,cy+8);c.beginPath();c.arc(x,cy,3.2,0,TAU);c.stroke();c.restore();}});

/* Port: terminal.ts, blob 6121815d6c14018808fb3b84606b1613e519b706. */

const GLYPHS='ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜ0123456789ZXCVBNM∆◇┼⌁⌗<>:;*+';
function proceduralGlyph(c,x,y,size,code,slant){const u=Math.max(.8,size*.075),h=size*.34;c.save();c.translate(x,y);c.rotate(slant);const b=(Math.imul(code,1103515245)+12345)>>>0;if(b&1)c.fillRect(-size*.24,-h,u,h*1.75);if(b&2)c.fillRect(size*.13,-h*.86,u,h*1.55);if(b&4)c.fillRect(-size*.22,-h*.08,size*.42,u);if(b&8)c.fillRect(-size*.16,-h*.72,size*.31,u);if(b&16)c.fillRect(-size*.1,h*.5,size*.26,u);if(b&32){c.beginPath();c.moveTo(-size*.2,h*.45);c.lineTo(size*.2,-h*.65);c.stroke();}c.restore();}
const terminalComplexScene=defineScene({id:'terminal',createState:seed=>({seed,time:0,mutation:0,blackout:0}),prepare:({state,input})=>{const b=makePaletteGeometry('terminal',state.seed,input),rng=rngFor('terminal',state.seed,313),count=qCount(b,14,21,29),cell=clamp(b.width/count,12,b.mobile?23:29),rows=Math.ceil(b.height/cell)+3,streams=Array.from({length:count},(_,i)=>({x:(i+.5)*b.width/count+(rng()-.5)*cell*.4,speed:3+rng()*9,offset:rng()*rows,length:Math.round(5+rng()*14),phase:rng()*TAU,bend:(rng()-.5)*cell*1.5,cadence:.45+rng()*1.6,glyphSeed:Math.floor(rng()*1000000)})),scars=Array.from({length:qCount(b,2,3,5)},()=>({y:rng()*b.height,width:.18+rng()*.6,phase:rng()*TAU}));return{geometry:{...b,streams,scars,cell,rows},primitiveCount:primitiveCount(input,300,365,398)};},update:({state:s,input:i,stepMs})=>{const dt=seconds(stepMs)*i.parameters.speed/100;s.time+=dt;s.mutation=(s.mutation+dt*6.8)%100000;s.blackout=(s.blackout+dt*.11)%1;},draw:({context:c,state:s,geometry:g})=>{c.save();c.clearRect(0,0,g.width,g.height);c.lineCap='square';c.strokeStyle=g.accent;c.lineWidth=.35;c.globalAlpha=alpha(g,.025);for(let y=0;y<g.height;y+=Math.max(5,g.cell*.42))strokeLine(c,0,y,g.width,y);const frame=Math.floor(s.mutation),canText=typeof c.fillText==='function';if(canText){c.font=`${Math.floor(g.cell*.72)}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;c.textAlign='center';c.textBaseline='middle';}
g.streams.forEach((st,i)=>{const cad=Math.floor(s.time*st.cadence+st.phase)%13,sp=cad===0?.05:cad===1?.28:cad===8?1.7:1,head=fract((st.offset+s.time*st.speed*sp)/g.rows)*g.rows,tail=Math.max(5,Math.round(st.length*(.7+g.parameters.trails/150)));for(let t=0;t<tail;t++){let row=Math.floor(head-t);while(row<0)row+=g.rows;row%=g.rows;const y=row*g.cell-g.cell*.2,decay=1-t/tail,bend=Math.sin(y/Math.max(1,g.height)*4.2+s.time*.55+st.phase)*st.bend*(.2+decay*.8),x=st.x+bend,gap=hash01(i*31+row,frame>>2,g.seed);if(gap<.1&&t>1)continue;const glyph=GLYPHS[Math.floor(hash01(st.glyphSeed+row,frame>>(t===0?1:3),t)*GLYPHS.length)]??'0',flash=t===0,fresh=t<3;c.globalAlpha=alpha(g,flash?.92:.05+decay*decay*(fresh?.58:.4));c.fillStyle=flash?g.focus:fresh?g.secondary:g.accent;c.strokeStyle=c.fillStyle;c.shadowBlur=flash?13:fresh?4:0;c.shadowColor=g.accent;if(canText&&hash01(i,row,g.seed)>.36)c.fillText(glyph,x,y);else proceduralGlyph(c,x,y,g.cell*.76,glyph.charCodeAt(0)+frame+t*17,(hash01(row,i)-.5)*.18);if(fresh&&i%5===2&&t===2){c.globalAlpha=alpha(g,.16);strokeLine(c,x-g.cell*.32,y+g.cell*.16,x+g.cell*.42,y-g.cell*.08);}}});
g.scars.forEach((scar,i)=>{const p=.5+.5*Math.sin(s.time*(.7+i*.17)+scar.phase),x=g.width*(.5-scar.width/2);c.fillStyle=g.background;c.globalAlpha=alpha(g,.025+p*.055);c.fillRect(x,scar.y,g.width*scar.width,2+p*9);c.strokeStyle=i%2===0?g.secondary:g.accent;c.globalAlpha=alpha(g,.08+p*.12);strokeLine(c,x,scar.y,x+g.width*scar.width,scar.y);});const by=fract(s.time*.027+.17)*g.height,glow=c.createRadialGradient(g.width*.44,by,0,g.width*.44,by,g.width*.35);glow.addColorStop(0,g.accent);glow.addColorStop(.28,g.secondary);glow.addColorStop(1,'transparent');c.fillStyle=glow;c.globalAlpha=alpha(g,.018);c.beginPath();c.arc(g.width*.44,by,g.width*.34,0,TAU);c.fill();c.restore();}});

/* Port: aurora.ts, blob 4f35fb2f182c10121cd5783a7f069eb9c057e3c8. */

const auroraComplexScene=defineScene({id:'aurora',createState:seed=>({seed,time:0,magnetic:0}),prepare:({state,input})=>{const b=makePaletteGeometry('aurora',state.seed,input),rng=rngFor('aurora',state.seed,419),curtains=Array.from({length:qCount(b,5,7,10)},(_,i)=>({anchor:b.width*(.05+.9*i/Math.max(1,qCount(b,5,7,10)-1)),width:b.width*(.055+rng()*.07),reach:b.height*(.42+rng()*.33),phase:rng()*TAU,curl:(rng()-.5)*b.width*.12,brightness:.5+rng()*.5})),stars=Array.from({length:qCount(b,16,28,44)},()=>({x:rng()*b.width,y:rng()*b.height*.58,size:.5+rng()*1.4,phase:rng()*TAU}));return{geometry:{...b,curtains,stars,horizon:b.height*.72},primitiveCount:primitiveCount(input,170,255,350)};},update:({state:s,input:i,stepMs})=>{const dt=seconds(stepMs)*i.parameters.speed/100;s.time+=dt;s.magnetic+=dt*.14;},draw:({context:c,state:s,geometry:g})=>{c.save();c.clearRect(0,0,g.width,g.height);c.globalCompositeOperation='lighter';c.fillStyle=g.focus;g.stars.forEach((star,i)=>{c.globalAlpha=alpha(g,.05+.08*(.5+.5*Math.sin(s.time*.3+star.phase)));c.fillRect(star.x,star.y,star.size,star.size);if(i%9===0)c.fillRect(star.x-star.size*2,star.y,star.size*5,.45);});g.curtains.forEach((cu,ci)=>{const rayCount=g.mobile?8:g.quality==='high'?18:13;for(let r=0;r<rayCount;r++){const u=r/Math.max(1,rayCount-1),cent=u-.5,fold=Math.sin(s.magnetic*1.8+cu.phase+cent*4.5)*cu.width*.36,xt=cu.anchor+cent*cu.width+fold,xb=xt+cu.curl*Math.sin(s.magnetic+cu.phase+u*2.6),yt=g.height*(.05+.04*Math.sin(cu.phase+u*2)),yb=Math.min(g.horizon,yt+cu.reach*(.82+.18*Math.sin(s.time*.17+r))),nw=(fbm2(u*2.4,s.time*.03+ci,g.seed,3)-.5)*cu.width*.55,grad=c.createLinearGradient(xt,yt,xb,yb);grad.addColorStop(0,'transparent');grad.addColorStop(.16,r%3===0?g.secondary:g.accent);grad.addColorStop(.5,r%4===0?g.focus:g.accent);grad.addColorStop(1,'transparent');c.strokeStyle=grad;c.lineWidth=mix(.55,2.6,cu.brightness*(1-Math.abs(cent)));c.globalAlpha=alpha(g,.08+cu.brightness*.1);c.shadowBlur=6+g.parameters.trails*.08;c.shadowColor=g.accent;c.beginPath();c.moveTo(xt+nw*.2,yt);c.bezierCurveTo(xt+fold*.4+nw,yt+cu.reach*.28,xb-fold*.2-nw*.4,yt+cu.reach*.72,xb,yb);c.stroke();}});c.globalCompositeOperation='source-over';c.shadowBlur=0;const h=c.createLinearGradient(0,g.horizon-60,0,g.horizon+35);h.addColorStop(0,'transparent');h.addColorStop(.55,g.secondary);h.addColorStop(1,'transparent');c.fillStyle=h;c.globalAlpha=alpha(g,.035);c.fillRect(0,g.horizon-60,g.width,95);c.restore();}});

/* Port: glacier.ts, blob 4eb1a81cc1e33024ba7371ffa63297ca35e707a5. */

const glacierComplexScene=defineScene({id:'glacier',createState:seed=>({seed,time:0,strain:0,refraction:0}),prepare:({state,input})=>{const b=makePaletteGeometry('glacier',state.seed,input),rng=rngFor('glacier',state.seed,521),flowAngle=-.42+rng()*.84,fissures=Array.from({length:qCount(b,5,8,11)},()=>({x:b.width*(.08+rng()*.84),y:b.height*(.1+rng()*.78),length:b.height*(.12+rng()*.26),angle:flowAngle+Math.PI/2+(rng()-.5)*.55,branches:Array.from({length:2+Math.floor(rng()*3)},()=>(rng()-.5)*.85),phase:rng()*TAU})),facets=Array.from({length:qCount(b,7,11,16)},(_,i)=>({cx:b.width*(.08+rng()*.84),cy:b.height*(.08+rng()*.84),radius:24+rng()*(b.mobile?55:92),sides:3+i%3,tilt:rng()*TAU,phase:rng()*TAU}));return{geometry:{...b,fissures,facets,flowAngle},primitiveCount:primitiveCount(input,180,270,360)};},update:({state:s,input:i,stepMs})=>{const dt=seconds(stepMs)*i.parameters.speed/100;s.time+=dt;s.strain+=dt*.075;s.refraction+=dt*.11;},draw:({context:c,state:s,geometry:g})=>{c.save();c.clearRect(0,0,g.width,g.height);g.facets.forEach((f,i)=>{const sh=Math.sin(s.refraction+f.phase)*.035,p=Array.from({length:f.sides},(_,side)=>{const a=f.tilt+side/f.sides*TAU,st=side%2===0?1.15:.78;return{x:f.cx+Math.cos(a)*f.radius*st+Math.cos(g.flowAngle)*sh*f.radius,y:f.cy+Math.sin(a)*f.radius+Math.sin(g.flowAngle)*sh*f.radius};});c.beginPath();c.moveTo(p[0].x,p[0].y);p.slice(1).forEach(pt=>c.lineTo(pt.x,pt.y));c.closePath();c.fillStyle=i%3===0?g.surface:linearGradient(c,g,f.cx-f.radius,f.cy,f.cx+f.radius,f.cy,[g.info,g.accent]);c.strokeStyle=i%2===0?g.accent:g.border;c.globalAlpha=alpha(g,.035+i%4*.017);c.lineWidth=.75;c.fill();c.stroke();});c.strokeStyle=g.border;c.lineWidth=.6;c.globalAlpha=alpha(g,.09);for(let lane=-4;lane<=4;lane++){const nx=Math.cos(g.flowAngle+Math.PI/2),ny=Math.sin(g.flowAngle+Math.PI/2),cx=g.width*.5+nx*lane*g.width*.09,cy=g.height*.5+ny*lane*g.height*.09,dx=Math.cos(g.flowAngle)*g.width*.65,dy=Math.sin(g.flowAngle)*g.width*.65;strokeLine(c,cx-dx,cy-dy,cx+dx,cy+dy);}
g.fissures.forEach((f,i)=>{const opening=.65+.35*Math.sin(s.strain+f.phase);c.strokeStyle=i%3===0?g.secondary:g.accent;c.lineWidth=1+opening*1.1;c.globalAlpha=alpha(g,.38+opening*.15);c.shadowBlur=5;c.shadowColor=g.accent;c.beginPath();c.moveTo(f.x,f.y);for(let seg=1;seg<=7;seg++){const jit=Math.sin(seg*2.17+f.phase)*f.length*.035;c.lineTo(f.x+Math.cos(f.angle)*f.length*seg/7+Math.cos(f.angle+Math.PI/2)*jit,f.y+Math.sin(f.angle)*f.length*seg/7+Math.sin(f.angle+Math.PI/2)*jit);}c.stroke();c.shadowBlur=0;f.branches.forEach((b,j)=>{const t=.28+j*.17,bx=f.x+Math.cos(f.angle)*f.length*t,by=f.y+Math.sin(f.angle)*f.length*t,ba=f.angle+b;c.globalAlpha=alpha(g,.18+opening*.08);c.lineWidth=.7;strokeLine(c,bx,by,bx+Math.cos(ba)*f.length*.24,by+Math.sin(ba)*f.length*.24);});});c.restore();}});

/* Port: ember.ts, blob 69ccfebc70f4d55dbe42f7705530cb46ebd1f7ff. */

const emberComplexScene=defineScene({id:'ember',createState:seed=>({seed,time:0,buoyancy:0,alarm:0}),prepare:({state,input})=>{const b=makePaletteGeometry('ember',state.seed,input),rng=rngFor('ember',state.seed,617),plumes=Array.from({length:qCount(b,4,6,9)},(_,i)=>({x:b.width*(.1+.8*(i+.5)/qCount(b,4,6,9)),base:b.height*(.78+rng()*.13),width:b.width*(.04+rng()*.08),height:b.height*(.28+rng()*.46),phase:rng()*TAU,lean:(rng()-.5)*b.width*.12,heat:rng()})),sparks=Array.from({length:qCount(b,22,36,54)},()=>({x:rng()*b.width,y:rng()*b.height,speed:.25+rng()*1.2,drift:(rng()-.5)*34,size:.8+rng()*2.4,phase:rng()*TAU}));return{geometry:{...b,plumes,sparks,alarmX:b.width*.82,alarmY:b.height*.2},primitiveCount:primitiveCount(input,190,285,380)};},update:({state:s,input:i,stepMs})=>{const dt=seconds(stepMs)*i.parameters.speed/100;s.time+=dt;s.buoyancy+=dt*.22;s.alarm=(s.alarm+dt*.28)%1;},draw:({context:c,state:s,geometry:g})=>{c.save();c.clearRect(0,0,g.width,g.height);c.globalCompositeOperation='lighter';g.plumes.forEach(p=>{const layers=g.mobile?3:g.quality==='high'?6:4;for(let l=0;l<layers;l++){const spread=l/Math.max(1,layers-1)-.5,rise=Math.sin(s.buoyancy*(1.3+p.heat)+p.phase+l)*p.width*.25,x0=p.x+spread*p.width,y0=p.base,x1=p.x+p.lean+spread*p.width*.55+rise,y1=p.base-p.height,grad=c.createLinearGradient(x0,y0,x1,y1);grad.addColorStop(0,g.warning);grad.addColorStop(.34,g.danger);grad.addColorStop(.72,g.accent);grad.addColorStop(1,'transparent');c.strokeStyle=grad;c.lineWidth=1.2+l*1.15;c.globalAlpha=alpha(g,.075+p.heat*.075);c.shadowBlur=8+l*2;c.shadowColor=g.danger;c.beginPath();c.moveTo(x0,y0);c.bezierCurveTo(x0-p.lean*.2+Math.sin(s.time*.7+p.phase)*p.width,p.base-p.height*.28,x1+Math.cos(s.time*.43+p.phase+l)*p.width*.8,p.base-p.height*.72,x1,y1);c.stroke();}});c.shadowBlur=4;c.shadowColor=g.warning;g.sparks.forEach((sp,i)=>{const life=fract(sp.phase/TAU+s.time*.055*sp.speed),y=g.height-life*g.height*1.08,x=sp.x+Math.sin(s.time*sp.speed+sp.phase)*sp.drift+Math.sin(life*TAU*1.7)*8,hot=hash01(i,Math.floor(s.time*3),g.seed)>.72;c.fillStyle=hot?g.focus:i%3===0?g.warning:g.danger;c.globalAlpha=alpha(g,(1-life)*.42+.08);c.fillRect(x,y,sp.size*(hot?1.6:1),sp.size*(2+sp.speed));});c.shadowBlur=0;g.plumes.slice(0,3).forEach((p,i)=>{const y=p.base-p.height*(.32+.16*Math.sin(s.time*.18+i));c.fillStyle=radialGradient(c,p.x,y,p.width*2.8,g.warning,g.danger);c.globalAlpha=alpha(g,.022);c.beginPath();c.arc(p.x,y,p.width*2.6,0,TAU);c.fill();});c.strokeStyle=g.warning;c.lineWidth=1.4;c.globalAlpha=alpha(g,.36);for(let r=0;r<3;r++){const rad=12+r*13+Math.sin(s.alarm*TAU+r)*2;c.beginPath();c.arc(g.alarmX,g.alarmY,rad,-Math.PI/2,-Math.PI/2+TAU*(.45+.5*s.alarm));c.stroke();}c.restore();}});

/* Port: atlas.ts, blob a6b94b7dca6e0eca06720f03aac34e40dd8d696a. */

const atlasComplexScene=defineScene({id:'atlas',createState:seed=>({seed,time:0,survey:0,route:0}),prepare:({state,input})=>{const b=makePaletteGeometry('atlas',state.seed,input),rng=rngFor('atlas',state.seed,719),peaks=Array.from({length:qCount(b,3,4,6)},()=>({x:b.width*(.12+rng()*.76),y:b.height*(.14+rng()*.7),radius:Math.min(b.width,b.height)*(.08+rng()*.16),elevation:.4+rng()*.6,phase:rng()*TAU})),route=Array.from({length:qCount(b,5,7,9)},(_,rank)=>({x:b.width*(.08+.84*rank/Math.max(1,qCount(b,5,7,9)-1)),y:b.height*(.18+rng()*.64),rank}));return{geometry:{...b,peaks,route,meridians:qCount(b,5,8,11),parallels:qCount(b,4,7,9)},primitiveCount:primitiveCount(input,220,320,395)};},update:({state:s,input:i,stepMs})=>{const dt=seconds(stepMs)*i.parameters.speed/100;s.time+=dt;s.survey+=dt*.045;s.route=(s.route+dt*.09)%1;},draw:({context:c,state:s,geometry:g})=>{c.save();c.clearRect(0,0,g.width,g.height);c.strokeStyle=g.border;c.lineWidth=.55;c.globalAlpha=alpha(g,.11);for(let m=0;m<g.meridians;m++){const x=g.width*(m+1)/(g.meridians+1);c.beginPath();c.moveTo(x,g.height*.05);c.bezierCurveTo(x-g.width*.025,g.height*.3,x+g.width*.025,g.height*.68,x,g.height*.95);c.stroke();}for(let p=0;p<g.parallels;p++){const y=g.height*(p+1)/(g.parallels+1);c.beginPath();c.moveTo(g.width*.04,y);c.quadraticCurveTo(g.width*.5,y+Math.sin(p)*g.height*.025,g.width*.96,y);c.stroke();}
g.peaks.forEach((p,pi)=>{const levels=g.mobile?5:g.quality==='high'?10:7;for(let l=1;l<=levels;l++){const r=p.radius*l/levels;c.beginPath();for(let pt=0;pt<=28;pt++){const a=pt/28*TAU,t=.82+(fbm2(Math.cos(a)*1.8+pi*2,Math.sin(a)*1.8+l*.31,g.seed,3)-.5)*.42,br=1+Math.sin(s.survey+p.phase+l*.6)*.008,x=p.x+Math.cos(a)*r*t*br,y=p.y+Math.sin(a)*r*t*.72*br;pt===0?c.moveTo(x,y):c.lineTo(x,y);}c.closePath();c.strokeStyle=l===levels?g.accent:l%3===0?g.secondary:g.border;c.lineWidth=l===levels?1.25:l%3===0?.9:.6;c.globalAlpha=alpha(g,.14+p.elevation*.12);c.stroke();}});c.strokeStyle=g.border;c.lineWidth=.8;c.globalAlpha=alpha(g,.18);c.strokeRect(g.width*.055,g.height*.065,g.width*.89,g.height*.87);for(let t=0;t<12;t++){const x=g.width*(.08+t*.075);strokeLine(c,x,g.height*.065,x,g.height*(t%3===0?.083:.075));}
const grad=c.createLinearGradient(g.width*.08,0,g.width*.92,0);grad.addColorStop(0,g.accent);grad.addColorStop(.52,g.secondary);grad.addColorStop(1,g.accent);c.strokeStyle=grad;c.lineWidth=1.35;c.globalAlpha=alpha(g,.4);c.setLineDash([7,6]);c.beginPath();g.route.forEach((p,i)=>{if(i===0)c.moveTo(p.x,p.y);else{const prev=g.route[i-1];c.quadraticCurveTo((prev.x+p.x)*.5,Math.min(prev.y,p.y)-g.height*.04,p.x,p.y);}});c.stroke();c.setLineDash([]);g.route.forEach((p,i)=>{c.fillStyle=i%2===0?g.accent:g.secondary;c.globalAlpha=alpha(g,.46);c.beginPath();c.arc(p.x,p.y,2.5+i%3,0,TAU);c.fill();});const ri=s.route*Math.max(1,g.route.length-1),ix=Math.min(g.route.length-2,Math.floor(ri)),t=ri-ix,a=g.route[ix],b=g.route[ix+1],px=mix(a.x,b.x,t),py=mix(a.y,b.y,t)-Math.sin(t*Math.PI)*g.height*.04;c.fillStyle=g.focus;c.shadowBlur=10;c.shadowColor=g.accent;c.globalAlpha=alpha(g,.72);c.beginPath();c.arc(px,py,3.5,0,TAU);c.fill();c.shadowBlur=0;const sx=g.width*(.1+.8*((Math.sin(s.time*.08)+1)/2));c.strokeStyle=g.secondary;c.globalAlpha=alpha(g,.15);c.lineWidth=.8;strokeLine(c,sx,g.height*.07,sx,g.height*.93);c.restore();}});

/* Port: noir.ts, blob ea138ca8671bc236573a35943779cc9bfd681849. */

const noirComplexScene=defineScene({id:'noir',createState:seed=>({seed,time:0,iris:0,shutter:0}),prepare:({state,input})=>{const b=makePaletteGeometry('noir',state.seed,input),rng=rngFor('noir',state.seed,811),blinds=Array.from({length:qCount(b,9,13,18)},(_,i)=>({y:b.height*i/qCount(b,9,13,18),height:b.height/qCount(b,9,13,18)*(.55+rng()*.5),tilt:(rng()-.5)*.08,phase:rng()*TAU})),bc=qCount(b,6,8,10),blades=Array.from({length:bc},(_,i)=>({phase:i/bc*TAU,length:.92+rng()*.12,width:.42+rng()*.16}));return{geometry:{...b,blinds,blades,cx:b.width*.64,cy:b.height*.46,radius:Math.min(b.width,b.height)*.26},primitiveCount:primitiveCount(input,130,190,270)};},update:({state:s,input:i,stepMs})=>{const dt=seconds(stepMs)*i.parameters.speed/100;s.time+=dt;s.iris+=dt*.075;s.shutter+=dt*.14;},draw:({context:c,state:s,geometry:g})=>{c.save();c.clearRect(0,0,g.width,g.height);g.blinds.forEach((b,i)=>{const off=Math.sin(s.shutter+b.phase)*g.height*.012;c.save();c.translate(g.width*.5,b.y+off);c.rotate(b.tilt+Math.sin(s.time*.11+b.phase)*.01);c.fillStyle=i%5===0?g.secondary:g.surface;c.globalAlpha=alpha(g,i%5===0?.055:.13);c.fillRect(-g.width*.58,-b.height/2,g.width*1.16,b.height);c.restore();});c.save();c.translate(g.cx,g.cy);c.rotate(s.iris);g.blades.forEach((b,i)=>{c.save();c.rotate(b.phase);c.beginPath();c.moveTo(g.radius*.16,-g.radius*.08);c.lineTo(g.radius*b.length,-g.radius*b.width);c.lineTo(g.radius*b.length*.82,g.radius*b.width*.55);c.lineTo(g.radius*.2,g.radius*.12);c.closePath();c.fillStyle=i%2===0?g.surface:g.background;c.strokeStyle=g.accent;c.lineWidth=.8;c.globalAlpha=alpha(g,.19+i%2*.05);c.fill();c.stroke();c.restore();});const ap=g.radius*(.18+.035*Math.sin(s.time*.4));c.strokeStyle=g.focus;c.globalAlpha=alpha(g,.52);c.lineWidth=1.25;c.beginPath();c.arc(0,0,ap,0,TAU);c.stroke();c.restore();c.strokeStyle=g.accent;c.lineWidth=.75;const lines=g.mobile?12:g.quality==='high'?28:20;for(let l=0;l<lines;l++){const x=g.width*(.08+l/Math.max(1,lines-1)*.34);c.globalAlpha=alpha(g,.12+l%3*.018);c.beginPath();c.moveTo(x,g.height*.12);const bend=Math.sin(s.time*.2+l*.42)*g.width*.018;c.bezierCurveTo(x+bend,g.height*.35,x-bend,g.height*.68,x,g.height*.88);c.stroke();}c.strokeStyle=g.secondary;c.lineWidth=1.8;c.globalAlpha=alpha(g,.5);const sl=Math.sin(s.time*.17)*g.width*.025;strokeLine(c,g.width*.09+sl,g.height*.8,g.width*.42+sl,g.height*.2);c.restore();}});

/* Port: signal.ts, blob 8a070288462fdba2e03c213d3d7a1ef878c21d99. */

const signalComplexScene=defineScene({id:'signal',createState:seed=>({seed,time:0,sync:0,burst:0}),prepare:({state,input})=>{const b=makePaletteGeometry('signal',state.seed,input),rng=rngFor('signal',state.seed,907),cc=qCount(b,3,4,5),channels=Array.from({length:cc},(_,i)=>({y:b.height*(.19+i*.14),frequency:1.7+rng()*3.7,amplitude:b.height*(.018+rng()*.04),phase:rng()*TAU,jitter:.2+rng()*.8,colorRole:i%3})),dropouts=Array.from({length:qCount(b,4,6,9)},()=>({x:rng()*b.width,width:b.width*(.025+rng()*.1),y:rng()*b.height,height:2+rng()*18,phase:rng()*TAU}));return{geometry:{...b,channels,dropouts,radarX:b.width*.78,radarY:b.height*.73,radarR:Math.min(b.width,b.height)*.14},primitiveCount:primitiveCount(input,180,260,350)};},update:({state:s,input:i,stepMs})=>{const dt=seconds(stepMs)*i.parameters.speed/100;s.time+=dt;s.sync=(s.sync+dt*.31)%1;s.burst+=dt*.9;},draw:({context:c,state:s,geometry:g})=>{c.save();c.clearRect(0,0,g.width,g.height);c.strokeStyle=g.border;c.lineWidth=.55;c.globalAlpha=alpha(g,.09);const div=g.mobile?8:12;for(let d=0;d<=div;d++){const x=g.width*(.05+.9*d/div);strokeLine(c,x,g.height*.08,x,g.height*.62);}g.channels.forEach((ch,ci)=>{c.strokeStyle=ch.colorRole===0?g.accent:ch.colorRole===1?g.secondary:g.info;c.lineWidth=1+ci*.3;c.globalAlpha=alpha(g,.35-ci*.035);c.beginPath();c.moveTo(g.width*.04,ch.y);const steps=g.mobile?42:g.quality==='high'?110:72;for(let st=1;st<=steps;st++){const u=st/steps,x=g.width*(.04+.92*u),car=Math.sin(u*TAU*ch.frequency+s.time*1.9+ch.phase),env=.34+.66*Math.sin(Math.PI*u),mod=Math.sin(u*TAU*(ch.frequency*.37+.7)-s.time*.7)*.35,n=(hash01(st,ci,Math.floor(s.burst*3))-.5)*ch.jitter,sp=hash01(st*13,ci,g.seed)>.965?(st%2===0?2.6:-2.6):0;c.lineTo(x,ch.y+ch.amplitude*env*(car+mod+n*.45+sp));}c.stroke();});g.dropouts.forEach((d,i)=>{const live=.5+.5*Math.sin(s.time*(.7+i*.09)+d.phase);c.fillStyle=i%2===0?g.background:g.surface;c.globalAlpha=alpha(g,.035+live*.09);c.fillRect(d.x,d.y,d.width,d.height*live);if(live>.72){c.strokeStyle=g.secondary;c.globalAlpha=alpha(g,.18);strokeLine(c,d.x-8,d.y,d.x+d.width+8,d.y);}});c.strokeStyle=g.border;c.lineWidth=.7;c.globalAlpha=alpha(g,.16);for(let r=1;r<=4;r++){c.beginPath();c.arc(g.radarX,g.radarY,g.radarR*r/4,0,TAU);c.stroke();}strokeLine(c,g.radarX-g.radarR,g.radarY,g.radarX+g.radarR,g.radarY);strokeLine(c,g.radarX,g.radarY-g.radarR,g.radarX,g.radarY+g.radarR);const sw=s.time*.78;c.strokeStyle=g.accent;c.lineWidth=1.6;c.globalAlpha=alpha(g,.55);strokeLine(c,g.radarX,g.radarY,g.radarX+Math.cos(sw)*g.radarR,g.radarY+Math.sin(sw)*g.radarR);for(let b=0;b<4;b++){const a=hash01(b,g.seed)*TAU,r=g.radarR*(.2+hash01(b,9,g.seed)*.72),it=.5+.5*Math.sin(s.time*2+b);c.fillStyle=g.secondary;c.globalAlpha=alpha(g,.16+it*.32);c.beginPath();c.arc(g.radarX+Math.cos(a)*r,g.radarY+Math.sin(a)*r,1.5+it*1.4,0,TAU);c.fill();}const sx=g.width*(.04+.92*s.sync);c.strokeStyle=g.focus;c.globalAlpha=alpha(g,.22);c.lineWidth=.9;strokeLine(c,sx,g.height*.08,sx,g.height*.62);c.restore();}});

/* Port: violet.ts, blob 1988d71c088ab2627c63a0c82bb23c2ca3a98bbf. */

const violetComplexScene=defineScene({id:'violet',createState:seed=>({seed,time:0,phaseA:0,phaseB:0}),prepare:({state,input})=>{const b=makePaletteGeometry('violet',state.seed,input),rng=rngFor('violet',state.seed,1009),nodes=Array.from({length:qCount(b,8,13,20)},(_,i)=>({a:1.1+rng()*2.7,b:1.4+rng()*3.4,radius:.18+rng()*.78,weight:.3+rng()*.7,phase:rng()*TAU+i*.17}));return{geometry:{...b,nodes,cx:b.width*.5,cy:b.height*.5,scaleX:b.width*.37,scaleY:b.height*.34,lobes:3+Math.floor(rng()*4)},primitiveCount:primitiveCount(input,160,240,330)};},update:({state:s,input:i,stepMs})=>{const dt=seconds(stepMs)*i.parameters.speed/100;s.time+=dt;s.phaseA+=dt*.12;s.phaseB-=dt*.073;},draw:({context:c,state:s,geometry:g})=>{c.save();c.clearRect(0,0,g.width,g.height);c.globalCompositeOperation='lighter';const samples=g.mobile?80:g.quality==='high'?220:150;c.beginPath();for(let sm=0;sm<=samples;sm++){const t=sm/samples*TAU,r=.72+.15*Math.sin(g.lobes*t+s.phaseB*3)+.08*Math.cos((g.lobes+2)*t-s.phaseA*5),x=g.cx+Math.sin(t*2.03+s.phaseA)*g.scaleX*r+Math.sin(t*5.2)*g.scaleX*.06,y=g.cy+Math.sin(t*3.01+s.phaseB)*g.scaleY*r+Math.cos(t*4.1)*g.scaleY*.05;sm===0?c.moveTo(x,y):c.lineTo(x,y);}c.strokeStyle=g.accent;c.lineWidth=1.25;c.globalAlpha=alpha(g,.34);c.shadowBlur=10;c.shadowColor=g.accent;c.stroke();c.shadowBlur=0;c.beginPath();for(let sm=0;sm<=Math.round(samples*.72);sm++){const t=sm/Math.max(1,Math.round(samples*.72))*TAU,x=g.cx+Math.cos(t*3.17-s.phaseB)*g.scaleX*.56+Math.sin(t*7.1)*g.scaleX*.08,y=g.cy+Math.sin(t*2.11+s.phaseA)*g.scaleY*.6;sm===0?c.moveTo(x,y):c.lineTo(x,y);}c.strokeStyle=g.secondary;c.lineWidth=.9;c.globalAlpha=alpha(g,.24);c.stroke();g.nodes.forEach((n,i)=>{const t=n.phase+s.phaseA*n.a+s.phaseB*n.b,x=g.cx+Math.sin(t*2.03)*g.scaleX*n.radius,y=g.cy+Math.sin(t*3.01+n.phase*.3)*g.scaleY*n.radius,p=.5+.5*Math.sin(s.time*(.35+n.weight*.4)+n.phase);c.fillStyle=i%3===0?g.secondary:g.accent;c.globalAlpha=alpha(g,.15+p*.28);c.beginPath();c.arc(x,y,1.5+n.weight*3.2,0,TAU);c.fill();if(i%4===0){c.strokeStyle=g.focus;c.lineWidth=.7;c.globalAlpha=alpha(g,.15);c.beginPath();c.arc(x,y,7+n.weight*9+p*2,0,TAU);c.stroke();}});c.strokeStyle=g.info;c.lineWidth=.55;c.globalAlpha=alpha(g,.11);for(let l=0;l<Math.min(7,g.nodes.length-1);l++){const a=g.nodes[l],b=g.nodes[(l*3+5)%g.nodes.length],ta=a.phase+s.phaseA*a.a,tb=b.phase+s.phaseB*b.b,ax=g.cx+Math.sin(ta*2.03)*g.scaleX*a.radius,ay=g.cy+Math.sin(ta*3.01)*g.scaleY*a.radius,bx=g.cx+Math.sin(tb*2.03)*g.scaleX*b.radius,by=g.cy+Math.sin(tb*3.01)*g.scaleY*b.radius;c.beginPath();c.moveTo(ax,ay);c.quadraticCurveTo(g.cx+(hash01(l,g.seed)-.5)*g.scaleX*.3,g.cy+(hash01(l,7,g.seed)-.5)*g.scaleY*.3,bx,by);c.stroke();}c.restore();}});

/* Port: claudius.ts, blob f2bb38b9a71924b5884353d441b45d38837aee60. */

const claudiusComplexScene=defineScene({id:'claudius',createState:seed=>({seed,time:0,thought:0,proof:0}),prepare:({state,input})=>{const b=makePaletteGeometry('claudius',state.seed,input),rng=rngFor('claudius',state.seed,1103),columnW=b.width*(b.mobile?.74:.56),columnX=(b.width-columnW)*.5,blocks=Array.from({length:qCount(b,5,7,9)},(_,i)=>({x:columnX+columnW*(.02+rng()*.04),y:b.height*(.1+i*.095+rng()*.015),width:columnW*(.58+rng()*.36),lines:2+Math.floor(rng()*4),lead:7+rng()*3,voice:rng()})),threads=Array.from({length:qCount(b,4,6,8)},(_,i)=>({fromY:b.height*(.15+i*.1),toY:b.height*(.23+i*.1+rng()*.08),side:i%2===0?-1:1,phase:rng()*TAU,weight:.45+rng()*.55}));return{geometry:{...b,blocks,threads,columnX,columnW},primitiveCount:primitiveCount(input,145,210,290)};},update:({state:s,input:i,stepMs})=>{const dt=seconds(stepMs)*i.parameters.speed/100;s.time+=dt;s.thought+=dt*.075;s.proof=(s.proof+dt*.04)%1;},draw:({context:c,state:s,geometry:g})=>{c.save();c.clearRect(0,0,g.width,g.height);c.fillStyle=g.surface;c.globalAlpha=alpha(g,.13);c.fillRect(g.columnX-g.columnW*.08,g.height*.055,g.columnW*1.16,g.height*.88);c.strokeStyle=g.border;c.lineWidth=.65;c.globalAlpha=alpha(g,.14);strokeLine(c,g.columnX,g.height*.07,g.columnX,g.height*.92);c.strokeStyle=g.accent;c.lineWidth=1.25;c.globalAlpha=alpha(g,.28);const qx=g.columnX-g.columnW*.08,qy=g.height*.16;c.beginPath();c.arc(qx,qy,12,Math.PI*.55,Math.PI*1.45);c.stroke();c.beginPath();c.arc(qx+18,qy+2,8,Math.PI*.55,Math.PI*1.45);c.stroke();const rx=g.columnX+g.columnW*1.08,ry=g.height*.76;c.beginPath();c.arc(rx,ry,12,-Math.PI*.45,Math.PI*.45);c.stroke();c.beginPath();c.arc(rx-18,ry-2,8,-Math.PI*.45,Math.PI*.45);c.stroke();g.blocks.forEach((b,bi)=>{const em=.5+.5*Math.sin(s.thought+b.voice*TAU);for(let l=0;l<b.lines;l++){const w=b.width*(l===b.lines-1?.55+b.voice*.24:.9+Math.sin(bi+l)*.04);c.fillStyle=b.voice>.7&&l===0?g.accent:g.border;c.globalAlpha=alpha(g,.22+em*.11);c.fillRect(b.x,b.y+l*b.lead,w,l===0&&b.voice>.72?2.1:1.1);}if(b.voice>.78){c.strokeStyle=g.secondary;c.globalAlpha=alpha(g,.22);c.beginPath();c.arc(b.x-9,b.y+4,3.5,Math.PI*.6,Math.PI*1.4);c.stroke();}});g.threads.forEach((t,i)=>{const sx=t.side<0?g.columnX-g.columnW*.13:g.columnX+g.columnW*1.13,ix=t.side<0?g.columnX+g.columnW*.04:g.columnX+g.columnW*.96,sw=Math.sin(s.time*.18+t.phase)*g.columnW*.018;c.strokeStyle=i%2===0?g.accent:g.secondary;c.lineWidth=.8+t.weight*.5;c.globalAlpha=alpha(g,.18+t.weight*.14);c.beginPath();c.moveTo(sx,t.fromY);c.bezierCurveTo(sx+sw,(t.fromY+t.toY)*.48,ix-sw,(t.fromY+t.toY)*.58,ix,t.toY);c.stroke();c.beginPath();c.arc(sx,t.fromY,2+t.weight*2.2,0,TAU);c.stroke();});const py=g.height*(.1+s.proof*.78),x0=g.columnX+g.columnW*.83;c.strokeStyle=g.accent;c.lineWidth=1.4;c.globalAlpha=alpha(g,.32);strokeLine(c,x0,py-5,x0+7,py);strokeLine(c,x0+7,py,x0,py+5);c.strokeStyle=g.border;c.lineWidth=.55;c.globalAlpha=alpha(g,.12);strokeLine(c,g.columnX+g.columnW*.36,g.height*.89,g.columnX+g.columnW*.64,g.height*.89);c.restore();}});

/* Port: basicus.ts, blob ec5b401a471b6d5ea1f9929517e4b2e44e867c1a. */

const basicusComplexScene=defineScene({id:'basicus',createState:seed=>({seed,time:0,elevation:0,ripple:0}),prepare:({state,input})=>{const b=makePaletteGeometry('basicus',state.seed,input),rng=rngFor('basicus',state.seed,1201),columns=b.mobile?3:5,rows=b.mobile?5:4,gap=b.width*(b.mobile?.025:.018),cw=(b.width*.82-gap*(columns-1))/columns,ch=(b.height*.58-gap*(rows-1))/rows,modules=[];for(let r=0;r<rows;r++)for(let col=0;col<columns;col++){const ix=r*columns+col;modules.push({x:b.width*.09+col*(cw+gap),y:b.height*.14+r*(ch+gap),w:cw,h:ch,depth:.25+rng()*.75,phase:rng()*TAU,kind:ix%4});}return{geometry:{...b,modules,rippleX:b.width*.76,rippleY:b.height*.83},primitiveCount:primitiveCount(input,130,200,280)};},update:({state:s,input:i,stepMs})=>{const dt=seconds(stepMs)*i.parameters.speed/100;s.time+=dt;s.elevation+=dt*.28;s.ripple=(s.ripple+dt*.17)%1;},draw:({context:c,state:s,geometry:g})=>{c.save();c.clearRect(0,0,g.width,g.height);g.modules.forEach(m=>{const lift=Math.sin(s.elevation+m.phase)*4*m.depth,scale=1+Math.sin(s.time*.12+m.phase)*.015*m.depth,w=m.w*scale,h=m.h*scale,x=m.x-(w-m.w)/2,y=m.y+lift-(h-m.h)/2;c.shadowBlur=4+m.depth*10;c.shadowColor=g.border;c.fillStyle=m.kind===0?g.surface:m.kind===1?g.accent:m.kind===2?g.secondary:g.background;c.globalAlpha=alpha(g,m.kind===0||m.kind===3?.11:.055+m.depth*.05);c.fillRect(x,y,w,h);c.shadowBlur=0;c.strokeStyle=m.kind===1?g.accent:g.border;c.lineWidth=m.kind===1?1.2:.7;c.globalAlpha=alpha(g,.16+m.depth*.08);c.strokeRect(x,y,w,h);c.globalAlpha=alpha(g,.2);c.strokeStyle=m.kind%2===0?g.secondary:g.accent;if(m.kind===0){for(let b=0;b<3;b++)c.fillRect(x+w*.14,y+h*(.25+b*.2),w*(.35+.12*b),1);}else if(m.kind===1){c.beginPath();c.arc(x+w*.5,y+h*.5,Math.min(w,h)*.2,0,TAU*(.55+m.depth*.35));c.stroke();}else if(m.kind===2){c.fillRect(x+w*.18,y+h*.62,w*.16,-h*.28);c.fillRect(x+w*.42,y+h*.62,w*.16,-h*.42);c.fillRect(x+w*.66,y+h*.62,w*.16,-h*.2);}else{c.beginPath();c.moveTo(x+w*.2,y+h*.62);c.lineTo(x+w*.46,y+h*.34);c.lineTo(x+w*.8,y+h*.55);c.stroke();}});c.strokeStyle=g.secondary;c.lineWidth=1;c.globalAlpha=alpha(g,.22);for(let r=0;r<4;r++){const p=(s.ripple+r*.21)%1,rad=p*Math.min(g.width,g.height)*.22;c.globalAlpha=alpha(g,(1-p)*.2);c.beginPath();c.arc(g.rippleX,g.rippleY,rad,0,TAU);c.stroke();}c.restore();}});

/* Port: telemetry.ts, blob 01662670b320d9824d540d4dbb157dca2f674c4a. */

const telemetryComplexScene=defineScene({id:'telemetry',createState:seed=>({seed,time:0,acquisition:0,sweep:0}),prepare:({state,input})=>{const b=makePaletteGeometry('telemetry',state.seed,input),rng=rngFor('telemetry',state.seed,1301),gauges=Array.from({length:qCount(b,2,3,4)},(_,i)=>({x:b.width*(.18+i*.2),y:b.height*.28,radius:Math.min(b.width,b.height)*(.055+rng()*.035),minAngle:Math.PI*.72,maxAngle:Math.PI*2.28,phase:rng()*TAU,value:.2+rng()*.7})),strips=Array.from({length:qCount(b,2,3,4)},(_,i)=>({y:b.height*(.56+i*.1),amplitude:b.height*(.012+rng()*.02),frequency:1.4+rng()*3.2,phase:rng()*TAU}));return{geometry:{...b,gauges,strips,rulerY:b.height*.82},primitiveCount:primitiveCount(input,210,310,395)};},update:({state:s,input:i,stepMs})=>{const dt=seconds(stepMs)*i.parameters.speed/100;s.time+=dt;s.acquisition=(s.acquisition+dt*.095)%1;s.sweep+=dt*.28;},draw:({context:c,state:s,geometry:g})=>{c.save();c.clearRect(0,0,g.width,g.height);c.strokeStyle=g.accent;c.lineWidth=.8;c.globalAlpha=alpha(g,.26);strokeLine(c,g.width*.05,g.height*.09,g.width*.95,g.height*.09);for(let cell=0;cell<10;cell++){const x=g.width*(.055+cell*.087);c.fillStyle=cell%3===0?g.secondary:g.border;c.globalAlpha=alpha(g,cell%3===0?.28:.13);c.fillRect(x,g.height*.115,g.width*.055,2+cell%2*2);}g.gauges.forEach((ga,i)=>{c.strokeStyle=g.border;c.lineWidth=.8;c.globalAlpha=alpha(g,.3);c.beginPath();c.arc(ga.x,ga.y,ga.radius,ga.minAngle,ga.maxAngle);c.stroke();for(let t=0;t<=14;t++){const a=ga.minAngle+(ga.maxAngle-ga.minAngle)*t/14,long=t%4===0,r0=ga.radius*(long?.78:.86),r1=ga.radius;c.globalAlpha=alpha(g,long?.28:.13);strokeLine(c,ga.x+Math.cos(a)*r0,ga.y+Math.sin(a)*r0,ga.x+Math.cos(a)*r1,ga.y+Math.sin(a)*r1);}const v=.5+.5*Math.sin(s.time*(.35+i*.12)+ga.phase)*.32+(ga.value-.5)*.68,a=ga.minAngle+(ga.maxAngle-ga.minAngle)*Math.max(.04,Math.min(.96,v));c.strokeStyle=i%2===0?g.accent:g.secondary;c.lineWidth=1.5;c.globalAlpha=alpha(g,.54);strokeLine(c,ga.x,ga.y,ga.x+Math.cos(a)*ga.radius*.72,ga.y+Math.sin(a)*ga.radius*.72);c.fillStyle=g.focus;c.beginPath();c.arc(ga.x,ga.y,2.2,0,TAU);c.fill();});g.strips.forEach((st,si)=>{c.strokeStyle=si%2===0?g.accent:g.secondary;c.lineWidth=.9;c.globalAlpha=alpha(g,.4);c.beginPath();c.moveTo(g.width*.05,st.y);const samples=g.mobile?38:g.quality==='high'?92:64;for(let sm=1;sm<=samples;sm++){const u=sm/samples,x=g.width*(.05+.9*u),p=Math.sin((u*st.frequency+s.time*.11)*TAU+st.phase),sp=Math.sin((u*9+si)*Math.PI)>.92?1.9:0;c.lineTo(x,st.y+st.amplitude*(p*.65+sp));}c.stroke();c.strokeStyle=g.border;c.globalAlpha=alpha(g,.1);strokeLine(c,g.width*.05,st.y,g.width*.95,st.y);});c.strokeStyle=g.border;c.lineWidth=.65;c.globalAlpha=alpha(g,.32);strokeLine(c,g.width*.05,g.rulerY,g.width*.95,g.rulerY);const ticks=g.mobile?30:54;for(let t=0;t<=ticks;t++){const x=g.width*(.05+.9*t/ticks);strokeLine(c,x,g.rulerY,x,g.rulerY-(t%5===0?13:6));}const x=g.width*(.05+.9*s.acquisition);c.strokeStyle=g.accent;c.lineWidth=1;c.globalAlpha=alpha(g,.44);strokeLine(c,x,g.height*.48,x,g.rulerY+5);c.fillStyle=g.accent;c.fillRect(x-2,g.rulerY+7,4,4);for(let m=0;m<5;m++){const on=fract(s.sweep+m*.17)<.45;c.fillStyle=on?g.success:g.border;c.globalAlpha=alpha(g,on?.42:.08);c.fillRect(g.width*.91,g.height*(.12+m*.055),g.width*.035,2);}c.restore();}});

/* Port: calm.ts, blob 9ebd093cb0fe0be74e11a113949a42ff7783c044. */

const calmComplexScene=defineScene({id:'calm',createState:seed=>({seed,time:0,breath:0,drift:0}),prepare:({state,input})=>{const b=makePaletteGeometry('calm',state.seed,input),rng=rngFor('calm',state.seed,1409),dust=Array.from({length:b.mobile?9:input.effectiveQuality.tier==='high'?22:15},()=>({x:b.width*(.08+rng()*.84),y:b.height*(.15+rng()*.7),size:.4+rng()*1.1,phase:rng()*TAU}));return{geometry:{...b,dust,horizon:b.height*.68,filamentY:b.height*.38},primitiveCount:primitiveCount(input,72,96,124)};},update:({state:s,input:i,stepMs})=>{const dt=seconds(stepMs)*i.parameters.speed/100;s.time+=dt;s.breath+=dt*.07;s.drift+=dt*.025;},draw:({context:c,state:s,geometry:g})=>{c.save();c.clearRect(0,0,g.width,g.height);const cx=g.width*(.5+Math.sin(s.drift)*.015),cy=g.height*(.5+Math.cos(s.drift*.7)*.012),r=Math.max(g.width,g.height)*(.42+Math.sin(s.breath)*.018),glow=c.createRadialGradient(cx,cy,0,cx,cy,r);glow.addColorStop(0,g.surface);glow.addColorStop(.46,g.accent);glow.addColorStop(1,'transparent');c.fillStyle=glow;c.globalAlpha=alpha(g,.018);c.beginPath();c.arc(cx,cy,r,0,TAU);c.fill();const h=g.horizon+Math.sin(s.breath*1.3)*g.height*.012;c.strokeStyle=g.border;c.lineWidth=.65;c.globalAlpha=alpha(g,.16);strokeLine(c,g.width*.12,h,g.width*.88,h);c.strokeStyle=g.accent;c.globalAlpha=alpha(g,.16);strokeLine(c,g.width*.42,h,g.width*.58,h);const fy=g.filamentY+Math.sin(s.time*.031)*g.height*.018;c.strokeStyle=g.accent;c.lineWidth=.75;c.globalAlpha=alpha(g,.11);c.beginPath();c.moveTo(g.width*.22,fy);c.bezierCurveTo(g.width*.39,fy-g.height*.025,g.width*.61,fy+g.height*.025,g.width*.78,fy);c.stroke();c.fillStyle=g.accent;g.dust.forEach((d,i)=>{const f=.5+.5*Math.sin(s.time*(.07+i*.002)+d.phase);c.globalAlpha=alpha(g,.018+f*.035);c.beginPath();c.arc(d.x,d.y,d.size*.55,0,TAU);c.fill();});c.strokeStyle=g.border;c.lineWidth=.45;c.globalAlpha=alpha(g,.035);for(let h=0;h<4;h++){const y=g.height*(.2+h*.17)+Math.sin(s.time*.017+h)*1.5;strokeLine(c,g.width*(.18+h*.015),y,g.width*(.82-h*.015),y);}c.strokeStyle=g.secondary;c.lineWidth=.7;c.globalAlpha=alpha(g,.12);c.beginPath();c.arc(g.width*.82,g.height*.22,8+Math.sin(s.breath*.9)*1.2,0,TAU);c.stroke();c.restore();}});

window.TalosMobileScenes=Object.freeze([forgeComplexScene,paperComplexScene,terminalComplexScene,auroraComplexScene,glacierComplexScene,emberComplexScene,atlasComplexScene,noirComplexScene,signalComplexScene,violetComplexScene,claudiusComplexScene,basicusComplexScene,telemetryComplexScene,calmComplexScene]);})();

/**
 * TALOS Desktop — runtime dello sfondo Canvas.
 *
 * Contratto: non possiede il layout della Chat. Monta un solo canvas decorativo
 * dentro #schermoChat e una piccola anteprima nella pagina Aspetto. Le classi,
 * i dataset e i token già prodotti da legacy/app.js restano la fonte di verità.
 * In presenza di messaggi la scena resta visibile ma ferma, come sul mobile.
 */
const TALOS_DESKTOP_SCENES = window.TalosMobileScenes;

const SCENES = new Map(TALOS_DESKTOP_SCENES.map((scene) => [scene.id, scene]));
const DEFAULT_SCENE = 'calm';
const TARGET_FPS = 30;
const MAX_PIXELS = 2_600_000;
const MAX_DPR = 1.5;
const SLOW_FRAME_MS = 18;
const SLOW_FRAME_LIMIT = 12;
const SEED = 730913;

const stages = new Set();
let raf = 0;
let lastFrame = 0;
let mutationObserver = null;
let rootObserver = null;
let mediaQuery = null;
let destroyed = false;
let colorProbe = null;
let metrics = { frames: 0, p95: 0, errors: [], costs: [] };

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const cssNumber = (style, name, fallback, multiplier = 1) => {
  const raw = Number.parseFloat(style.getPropertyValue(name));
  return Number.isFinite(raw) ? raw * multiplier : fallback;
};

function reducedMotion() {
  return document.documentElement.classList.contains('reduce-motion')
    || document.body?.classList.contains('reduce-motion')
    || Boolean(mediaQuery?.matches);
}

function resolveColor(raw, fallback = '#888888') {
  if (!colorProbe) {
    colorProbe = document.createElement('span');
    colorProbe.setAttribute('aria-hidden', 'true');
    colorProbe.style.cssText = 'position:fixed;left:-10000px;top:-10000px;visibility:hidden;pointer-events:none;';
    document.body.append(colorProbe);
  }
  colorProbe.style.color = '';
  colorProbe.style.color = raw || fallback;
  return getComputedStyle(colorProbe).color || fallback;
}

function palette() {
  const rootStyle = getComputedStyle(document.documentElement);
  const bodyStyle = document.body ? getComputedStyle(document.body) : rootStyle;
  const read = (name, fallback) => {
    const value = rootStyle.getPropertyValue(name).trim() || bodyStyle.getPropertyValue(name).trim();
    return resolveColor(value, fallback);
  };
  return {
    accent: read('--talos-accent', '#c08b3c'),
    secondary: read('--talos-secondary', '#8e9095'),
    border_strong: read('--talos-border-strong', '#4a4b50'),
    surface_elevated: read('--talos-window-bg', '#34353a'),
    background: read('--talos-background', '#1e1f22'),
    focus: read('--talos-ring', '#d8a650'),
    info: read('--talos-info', '#7f9fc4'),
    success: read('--talos-success', '#77a884'),
    warning: read('--talos-warning', '#d8a650'),
    danger: read('--talos-danger', '#d87d72'),
  };
}

function currentConfig() {
  const root = document.documentElement;
  const host = document.body;
  const style = getComputedStyle(root);
  const theme = root.dataset.talosTheme || 'calm';
  const scene = SCENES.has(root.dataset.talosScene) ? root.dataset.talosScene : (SCENES.has(theme) ? theme : DEFAULT_SCENE);
  const mode = root.dataset.talosMotionMode || 'adaptive';
  const quality = root.dataset.talosMotionQuality || 'balanced';
  const off = mode === 'off' || host?.classList.contains('background-motion-off');
  const running = !off && host?.classList.contains('background-motion-active') && !host?.classList.contains('background-motion-paused');
  const params = {
    speed: clamp(cssNumber(style, '--talos-motion-speed', 1, 100), 10, 240),
    intensity: clamp(cssNumber(style, '--talos-motion-intensity', .2, 100), 0, 100),
    glow: clamp(cssNumber(style, '--talos-motion-glow', .1, 100), 0, 100),
    density: clamp(cssNumber(style, '--talos-motion-density', 1, 100), 25, 150),
    depth: clamp(cssNumber(style, '--talos-motion-depth', .92, 100), 0, 100),
    trails: clamp(cssNumber(style, '--talos-motion-trails', .5, 100), 0, 100),
    contrast: clamp(cssNumber(style, '--talos-motion-contrast', .8, 100), 0, 100),
    parallax: clamp(cssNumber(style, '--talos-motion-parallax', 0, 100), 0, 100),
  };
  return { scene, theme, mode, quality, off, running, parameters: params };
}

function tierFor(config, stage) {
  if (stage.forcedLow || config.mode === 'simple' || config.quality === 'low') return 'low';
  if (config.quality === 'high') return 'high';
  return 'balanced';
}

function makeInput(stage, config) {
  const p = palette();
  return {
    viewport: { width: stage.width, height: stage.height },
    palette: { dark: p, light: p },
    colorMode: document.documentElement.dataset.theme === 'light' ? 'light' : 'dark',
    parameters: config.parameters,
    effectiveQuality: {
      tier: tierFor(config, stage),
      densityScale: tierFor(config, stage) === 'low' ? .8 : 1,
    },
  };
}

function chatHasMessages() {
  const column = document.querySelector('#schermoChat .talos-conversation__column');
  if (!column) return false;
  return Boolean(column.querySelector('.talos-turn, [data-c="Turn"], .message, [data-message-id]'));
}

function stageVisible(stage) {
  if (document.hidden || !stage.canvas.isConnected) return false;
  const rect = stage.canvas.getBoundingClientRect();
  return rect.width > 1 && rect.height > 1 && !stage.canvas.closest('[hidden]');
}

function stageShouldAnimate(stage, config) {
  if (!stageVisible(stage) || config.off || reducedMotion() || stage.manualPaused || stage.budgetStatic) return false;
  if (stage.preview) return config.mode !== 'off' && config.mode !== 'static';
  if (chatHasMessages()) return false;
  return config.running && config.mode !== 'static';
}

function recordCost(cost) {
  metrics.costs.push(cost);
  if (metrics.costs.length > 120) metrics.costs.shift();
  const sorted = [...metrics.costs].sort((a, b) => a - b);
  metrics.p95 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * .95))] : 0;
}

function draw(stage, dt, config) {
  if (config.off) {
    stage.context.clearRect(0, 0, stage.width, stage.height);
    stage.canvas.dataset.sceneStatus = 'off';
    return;
  }
  const start = performance.now();
  try {
    if (dt > 0) stage.definition.update({ state: stage.state, input: stage.input, stepMs: dt });
    stage.context.setTransform(stage.dpr, 0, 0, stage.dpr, 0, 0);
    stage.definition.draw({ context: stage.context, state: stage.state, geometry: stage.geometry });
    stage.draws += 1;
    stage.canvas.dataset.scene = stage.scene;
    stage.canvas.dataset.sceneStatus = stage.budgetStatic ? 'budget-static' : reducedMotion() ? 'reduced' : stageShouldAnimate(stage, config) ? 'animating' : 'static';
  } catch (error) {
    const message = String(error?.message || error);
    if (!metrics.errors.includes(message)) metrics.errors.push(message);
    stage.budgetStatic = true;
    stage.canvas.dataset.sceneStatus = 'error';
    stage.context.clearRect(0, 0, stage.width, stage.height);
    return;
  }
  const cost = performance.now() - start;
  stage.lastCost = cost;
  if (dt > 0) {
    metrics.frames += 1;
    recordCost(cost);
    stage.slowCount = cost > SLOW_FRAME_MS ? stage.slowCount + 1 : Math.max(0, stage.slowCount - 1);
    if (stage.slowCount >= SLOW_FRAME_LIMIT) {
      if (!stage.forcedLow) {
        stage.forcedLow = true;
        stage.slowCount = 0;
        prepare(stage, true);
      } else {
        stage.budgetStatic = true;
        stage.canvas.dataset.sceneStatus = 'budget-static';
      }
    }
  }
}

function prepare(stage, reset = false) {
  if (!stage.canvas.isConnected) return;
  const rect = stage.parent.getBoundingClientRect();
  stage.width = Math.max(1, rect.width);
  stage.height = Math.max(1, rect.height);
  let dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR, Math.sqrt(MAX_PIXELS / Math.max(1, stage.width * stage.height)));
  dpr = Math.max(.5, dpr);
  const pixelWidth = Math.max(1, Math.round(stage.width * dpr));
  const pixelHeight = Math.max(1, Math.round(stage.height * dpr));
  if (stage.canvas.width !== pixelWidth) stage.canvas.width = pixelWidth;
  if (stage.canvas.height !== pixelHeight) stage.canvas.height = pixelHeight;
  stage.dpr = dpr;
  const config = currentConfig();
  const definition = SCENES.get(config.scene) || SCENES.get(DEFAULT_SCENE);
  const changed = stage.definition !== definition || stage.scene !== definition.id;
  stage.definition = definition;
  stage.scene = definition.id;
  if (reset || changed || !stage.state) {
    stage.state = definition.createState(SEED);
    stage.slowCount = 0;
    stage.budgetStatic = false;
  }
  stage.input = makeInput(stage, config);
  stage.geometry = definition.prepare({ state: stage.state, input: stage.input }).geometry;
  stage.context.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw(stage, 0, config);
}

function frame(now) {
  raf = 0;
  if (destroyed) return;
  const config = currentConfig();
  const active = [...stages].filter((stage) => stageShouldAnimate(stage, config));
  if (!active.length) { lastFrame = 0; return; }
  const elapsed = lastFrame ? now - lastFrame : 1000 / TARGET_FPS;
  if (elapsed >= 1000 / TARGET_FPS - 1) {
    lastFrame = now;
    for (const stage of active) draw(stage, Math.min(50, elapsed), config);
  }
  raf = requestAnimationFrame(frame);
}

function schedule() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  lastFrame = 0;
  if (!destroyed && [...stages].some((stage) => stageShouldAnimate(stage, currentConfig()))) raf = requestAnimationFrame(frame);
}

function refreshAll({ reset = false } = {}) {
  for (const stage of stages) prepare(stage, reset);
  schedule();
}

function mountStage(parent, { preview = false } = {}) {
  if (!parent || parent.querySelector(':scope > canvas.talos-motion-canvas')) return null;
  const canvas = document.createElement('canvas');
  canvas.className = 'talos-motion-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.tabIndex = -1;
  parent.prepend(canvas);
  const context = canvas.getContext('2d', { alpha: true, desynchronized: true });
  if (!context) { canvas.remove(); return null; }
  const stage = { parent, canvas, context, preview, state: null, definition: null, scene: '', width: 1, height: 1, dpr: 1, draws: 0, lastCost: 0, slowCount: 0, forcedLow: false, budgetStatic: false, manualPaused: false };
  stages.add(stage);
  const resize = new ResizeObserver(() => requestAnimationFrame(() => { if (stages.has(stage)) prepare(stage, false); }));
  resize.observe(parent);
  stage.dispose = () => { resize.disconnect(); stages.delete(stage); canvas.remove(); schedule(); };
  prepare(stage, true);
  return stage;
}

function installPreview() {
  const appearance = document.querySelector('#setting-panel-appearance [data-settings-group="design"]');
  if (!appearance || appearance.querySelector('[data-talos-motion-preview]')) return;
  const panel = document.createElement('section');
  panel.className = 'talos-motion-preview';
  panel.dataset.talosMotionPreview = 'true';
  panel.innerHTML = '<div class="talos-motion-preview__copy"><span class="talos-eyebrow">Scena del tema</span><strong data-motion-preview-name></strong><small>Anteprima dal renderer Canvas mobile. La conversazione la ferma appena compare un messaggio.</small></div><div class="talos-motion-preview__stage" aria-hidden="true"></div><span class="talos-motion-preview__status" data-motion-preview-status></span>';
  const themeRow = appearance.querySelector('[data-setting-row="sceneOverrideSelect"]') || appearance.querySelector('[data-setting-row="themePresetSelect"]');
  if (themeRow) themeRow.insertAdjacentElement('afterend', panel); else appearance.prepend(panel);
  const stage = mountStage(panel.querySelector('.talos-motion-preview__stage'), { preview: true });
  const updateLabel = () => {
    const config = currentConfig();
    panel.querySelector('[data-motion-preview-name]').textContent = config.scene[0].toUpperCase() + config.scene.slice(1);
    panel.querySelector('[data-motion-preview-status]').textContent = stage?.canvas.dataset.sceneStatus || 'non disponibile';
  };
  updateLabel();
  const interval = window.setInterval(updateLabel, 650);
  panel._talosDispose = () => window.clearInterval(interval);
}

function reviewFrame(id, width = 640, height = 360, atSeconds = 0, overrides = {}) {
  const definition = SCENES.get(id);
  if (!definition) throw new Error(`Scena sconosciuta: ${id}`);
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d');
  const config = currentConfig();
  const stage = { width, height, forcedLow: true };
  const input = makeInput(stage, { ...config, scene: id, parameters: { ...config.parameters, ...overrides } });
  const state = definition.createState(SEED);
  const geometry = definition.prepare({ state, input }).geometry;
  for (let i = 0; i < Math.round(atSeconds * 20); i += 1) definition.update({ state, input, stepMs: 50 });
  definition.draw({ context, state, geometry });
  const pixels = context.getImageData(0, 0, width, height).data;
  let nonzero = 0; let hash = 2166136261;
  for (let p = 0; p < pixels.length; p += 4) {
    if (pixels[p + 3]) nonzero += 1;
    hash = Math.imul(hash ^ pixels[p], 16777619);
    hash = Math.imul(hash ^ pixels[p + 1], 16777619);
    hash = Math.imul(hash ^ pixels[p + 2], 16777619);
    hash = Math.imul(hash ^ pixels[p + 3], 16777619);
  }
  return { id, nonzero, hash: hash >>> 0 };
}

function initTalosDesktopBackground() {
  if (window.__talosDesktopMotion?.initialized) return window.__talosDesktopMotion;
  const chat = document.getElementById('schermoChat');
  if (!chat) return null;
  chat.dataset.talosCanvasMotion = 'true';
  document.documentElement.classList.add('talos-final-ui');
  const mainStage = mountStage(chat, { preview: false });
  installPreview();

  const watchTarget = document.documentElement;
  rootObserver = new MutationObserver((records) => {
    const relevant = records.some((record) => record.type === 'attributes' || record.type === 'childList');
    if (!relevant) return;
    installPreview();
    refreshAll({ reset: records.some((record) => record.attributeName?.startsWith('data-talos') || record.attributeName === 'data-theme') });
  });
  rootObserver.observe(watchTarget, { attributes: true, attributeFilter: ['class', 'data-theme', 'data-talos-theme', 'data-talos-scene', 'data-talos-motion-mode', 'data-talos-motion-quality', 'style'] });
  if (document.body) rootObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  const conversation = chat.querySelector('.talos-conversation__column');
  if (conversation) {
    mutationObserver = new MutationObserver(() => refreshAll({ reset: false }));
    mutationObserver.observe(conversation, { childList: true, subtree: false });
  }
  mediaQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const mediaHandler = () => refreshAll({ reset: false });
  mediaQuery.addEventListener?.('change', mediaHandler);
  document.addEventListener('visibilitychange', schedule);
  window.addEventListener('pageshow', schedule);
  window.addEventListener('pagehide', () => { if (raf) cancelAnimationFrame(raf); raf = 0; });

  const api = Object.freeze({
    initialized: true,
    ids: [...SCENES.keys()],
    refresh: () => refreshAll({ reset: true }),
    reviewFrame,
    status: () => ({
      scene: currentConfig().scene,
      running: Boolean(raf),
      reduced: reducedMotion(),
      chatHasMessages: chatHasMessages(),
      stages: [...stages].map((stage) => ({ preview: stage.preview, scene: stage.scene, status: stage.canvas.dataset.sceneStatus, draws: stage.draws, cost: Math.round(stage.lastCost * 100) / 100, tier: tierFor(currentConfig(), stage) })),
      frames: metrics.frames,
      p95: Math.round(metrics.p95 * 100) / 100,
      errors: [...metrics.errors],
    }),
    destroy: () => {
      destroyed = true;
      if (raf) cancelAnimationFrame(raf);
      rootObserver?.disconnect(); mutationObserver?.disconnect();
      for (const stage of [...stages]) stage.dispose?.();
      document.querySelector('[data-talos-motion-preview]')?._talosDispose?.();
      document.querySelector('[data-talos-motion-preview]')?.remove();
      chat.removeAttribute('data-talos-canvas-motion');
    },
  });
  window.__talosDesktopMotion = api;
  schedule();
  return api;
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => initTalosDesktopBackground(), { once:true }); else initTalosDesktopBackground();
