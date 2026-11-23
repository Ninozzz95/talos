/*
 * Owner 14/10/2026 («nuovo boot logo approvato, implementalo»; mockup avvio-talos-cli.html): what the new boot promises.
 * Owner 14/10/2026 evening («APPROVATA», mockup avvio-medaglia.html, 0.6.6): the mark is a two-layer hexagonal medal.
 * - the medal is 30×17 cells from 100 columns, 26×15 from 72, 20×11 below; its metal is each cell's background, its details
 *   are Braille dots; built up rim → plate → inner layer → mark, complete only at the end (the cell-by-cell equality with the
 *   mockup's renderer was checked every 40 ms at widths 44-120 before the fixtures of boot-smooth were taken);
 * - the gold is continuous (the ramp #2a220c → #fff4c2), not five steps;
 * - the metal is drawn only over a background TALOS paints (on an unknown one a bronze slab would be a stain);
 * - without Unicode no Braille or box character reaches the terminal;
 * - the stages, the counter and the 5.2 s length the acceptance scenarios read (BOOT nnn%, SIGNAL ACQUISITION …).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {goldAt,MEDAL_SIZES,metalOver,renderCinematicBoot,rowsToSegments,TALOS_BOOT_DURATION_MS} from '../../src/tui/boot/cinematic.ts';
import {createBootSequenceComponent,createBootState} from '../../src/tui/boot/boot-sequence.ts';

const isDot=(ch:string)=>ch>'⠀'&&ch<='⣿';
const braille=(lines:string[])=>lines.join('').split('').filter(isDot).length;
/* the box of the medal's metal: the rows and columns that carry metal */
const medalBox=(frame:{metal:number[][]})=>{const ys=frame.metal.flatMap((row,y)=>row.some(v=>v>0)?[y]:[]);const xs=frame.metal.flatMap(row=>row.flatMap((v,x)=>v>0?[x]:[]));return{rows:ys.length,cols:xs.length?Math.max(...xs)-Math.min(...xs)+1:0,top:ys[0]??-1};};

test('the medal: 30×17 from 100 columns, 26×15 from 72, 20×11 below, a pointy-top hexagon of metal and details',()=>{
  assert.deepEqual(MEDAL_SIZES,[{cols:30,rows:17},{cols:26,rows:15},{cols:20,rows:11}]);
  for(const [width,size] of [[120,0],[100,0],[99,1],[80,1],[72,1],[71,2],[60,2],[40,2]] as const){
    const box=medalBox(renderCinematicBoot(0,width,true,true));const want:{cols:number;rows:number}=MEDAL_SIZES[size]!;
    assert.equal(box.rows,want.rows,`${width}: rows`);assert.ok(box.cols<=want.cols&&box.cols>=want.cols-2,`${width}: ${box.cols} columns of metal`);
  }
  const final=renderCinematicBoot(0,120,true,true);const box=medalBox(final);
  const widthOf=(y:number)=>final.metal[y]!.filter(v=>v>0).length;
  assert.ok(widthOf(box.top)<widthOf(box.top+8)/2&&widthOf(box.top+16)<widthOf(box.top+8)/2,'a point at the top and at the bottom');
  const details=braille(final.lines.slice(box.top,box.top+17));
  assert.ok(details>150,`${details} cells of detail (outline, ticks, rings, rivets, mark)`);
});

test('the small medal keeps only what reads at that size: no milled ticks, no guilloché rings',()=>{
  const density=(width:number)=>{const f=renderCinematicBoot(0,width,true,true);const box=medalBox(f);return braille(f.lines.slice(box.top,box.top+box.rows))/(box.rows*box.cols);};
  assert.ok(density(60)<density(80),`sparser details on the small medal (${density(60).toFixed(2)}) than on the medium one (${density(80).toFixed(2)})`);
});

test('the block letters stay while they fit (46 columns), the thin form only below',()=>{
  for(const width of [120,80,60,48])assert.match(renderCinematicBoot(0,width,true,true).lines.join('\n'),/████████╗/u,`${width} columns`);
  assert.match(renderCinematicBoot(0,47,true,true).lines.join('\n'),/╔╦╗╔═╗╦/u,'47 columns leave the picture 45: the thin form');
  assert.match(renderCinematicBoot(0,40,true,true).lines.join('\n'),/╔╦╗╔═╗╦/u);
});

test('the medal builds up: the rim traces from the top both ways, then the plate, the inner layer, the mark',()=>{
  const at=(ms:number)=>renderCinematicBoot(ms,120,true,false);
  const metalCells=(ms:number)=>at(ms).metal.flat().filter(v=>v>0).length;
  /* at 0 ms the rim's starting point (the top vertex) is the only thing drawn, as in the mockup */
  assert.ok(braille(at(0).lines)<=1,'nothing but the starting point before the rim runs');assert.equal(metalCells(0),0);
  const box=medalBox(renderCinematicBoot(0,120,true,true)),rim=at(650);
  assert.ok(braille(rim.lines.slice(box.top,box.top+4))>0&&braille(rim.lines.slice(box.top+13,box.top+17))===0,'the outline starts from the top');
  /* (the nodes grow with a small overshoot, so a count mid-way can pass the final one by a cell) */
  const rimOnly=braille(at(1100).lines),inner=braille(at(2000).lines),mark=braille(at(2700).lines),done=braille(at(TALOS_BOOT_DURATION_MS).lines);
  const metalSum=(ms:number)=>at(ms).metal.flat().reduce((a,b)=>a+b,0);assert.ok(metalSum(1100)<metalSum(1500)&&metalSum(1500)<metalSum(2200),'the plate, then the inner layer, fill after the rim');
  assert.ok(rimOnly<inner&&inner<mark&&rimOnly<done,`rim ${rimOnly} < inner ${inner} < mark ${mark}, final ${done}`);
  assert.equal(done,braille(renderCinematicBoot(0,120,true,true).lines),'the last frame of the reveal is the final frame');
});

test('the gold is continuous: the ramp of the mockup, and many shades on screen at once',()=>{
  assert.equal(goldAt(0),'#2a220c');assert.equal(goldAt(1),'#fff4c2');
  const rgb=(hex:string)=>[1,3,5].map(k=>parseInt(hex.slice(k,k+2),16));
  const near=(a:string,b:string)=>rgb(a).every((v,j)=>Math.abs(v-rgb(b)[j]!)<=8);
  assert.ok(near(goldAt(.62),'#d4af37')&&near(goldAt(.82),'#f7d774')&&near(goldAt(.4),'#9d7f24'),'the stops of the ramp');
  const light=(hex:string)=>rgb(hex).reduce((a,b)=>a+b,0);
  for(let k=1;k<=32;k++)assert.ok(light(goldAt(k/32))>light(goldAt((k-1)/32)),`brighter at ${k}/32`);
  const colours=new Set(rowsToSegments(renderCinematicBoot(4000,120,true,false)).flat().map(s=>s.color).filter(Boolean));
  assert.ok(colours.size>8,`${colours.size} shades during the shimmer (the old boot had five)`);
});

test('the metal needs a painted background, and is the mockup\'s bronze ramp laid over it',()=>{
  const frame=renderCinematicBoot(0,120,true,true);
  assert.ok(rowsToSegments(frame).flat().every(s=>s.background===undefined),'no painted background, no metal');
  const metal=rowsToSegments(frame,{glowBase:'#080b11'}).flat().filter(s=>s.background);
  assert.ok(metal.length>100,`${metal.length} runs of metal over the painted background`);
  assert.ok(metal.every(s=>/^[ ⠀-⣿]+$/u.test(s.text)),'only the medal has metal');
  /* a blank cell inside the medal still carries its metal: the row is not cut short before it */
  assert.ok(metal.some(s=>s.text.trim()===''),'blank cells of metal are drawn');
  for(const width of [120,80,60])for(let ms=0;ms<=TALOS_BOOT_DURATION_MS;ms+=40){const f=renderCinematicBoot(ms,width,true,false);
    for(const [y,row] of f.metal.entries()){const last=row.reduce((a,v,x)=>v>0?x:a,-1);assert.ok(Array.from(f.lines[y]!).length>last,`${width} at ${ms} ms: row ${y} reaches its last cell of metal`);}}
  assert.equal(metalOver(0,'#080b11'),undefined);assert.equal(metalOver(0.01,'#080b11'),undefined);
  assert.equal(metalOver(1,'#000000'),'#7c601e');assert.equal(metalOver(.35,'#000000'),'#261d09');assert.equal(metalOver(.7,'#123456'),'#4e3c12');
  assert.equal(metalOver(.175,'#080b11'),'#17140d','half-way between the painted background and the first bronze');
  assert.equal(metalOver(.5,'not a colour'),undefined);
});

test('the sequence passes the metal only when it is given a painted background',()=>{
  const FakeReact:any={useState:(init:any)=>[typeof init==='function'?init():init,()=>{}],useEffect:()=>{},createElement:(type:any,props:any,...children:any[])=>({type,props:props??{},children})};
  const BootSequence=createBootSequenceComponent(FakeReact,{Box:'Box',Text:'Text'});
  const backgrounds=(tree:any):string[]=>[...(tree?.props?.backgroundColor?[tree.props.backgroundColor]:[]),...(tree?.children??[]).flatMap(backgrounds)];
  const state=createBootState(Date.now()-TALOS_BOOT_DURATION_MS);
  assert.equal(backgrounds(BootSequence({state,motion:true,unicode:true,width:120})).length,0);
  assert.ok(backgrounds(BootSequence({state,motion:true,unicode:true,width:120,glowBase:'#080b11'})).length>0);
});

test('without Unicode only ASCII reaches the terminal, and the medal keeps its shape',()=>{
  for(const ms of [0,1800,3300,4200])for(const width of [120,80,60,40]){
    const frame=renderCinematicBoot(ms,width,false,false);
    assert.ok(frame.lines.every(line=>/^[\x20-\x7e]*$/u.test(line)),`${width} at ${ms} ms: ${frame.lines.find(line=>!/^[\x20-\x7e]*$/u.test(line))}`);
  }
  const ascii=renderCinematicBoot(0,120,false,true).lines,unicode=renderCinematicBoot(0,120,true,true).lines;
  assert.deepEqual(ascii.map(line=>line.length),unicode.map(line=>Array.from(line).length),'one ASCII character for every cell');
  /* the details keep their weight: thin lines light, the nodes dense (a cell of 1-2 dots is «.», of 7-8 «#») */
  const markAscii=ascii.slice(3,3+17).join('');
  assert.ok(['.',':','+','#'].every(ch=>markAscii.includes(ch)),`the ASCII medal has light and dense cells: ${JSON.stringify(markAscii.replace(/\s+/gu,''))}`);
});

test('the stages in order, the counter from 000% to 100%, in 5.2 s',()=>{
  assert.equal(TALOS_BOOT_DURATION_MS,5200);
  const stages:string[]=[];for(let ms=0;ms<=TALOS_BOOT_DURATION_MS;ms+=50){const s=renderCinematicBoot(ms,100,true,false).stage;if(stages.at(-1)!==s)stages.push(s);}
  assert.deepEqual(stages,['SIGNAL ACQUISITION','NETWORK CONVERGENCE','CORE IGNITION','SYNCHRONIZATION BUS','TALOS ASSEMBLY','ENERGY SHIMMER','SYSTEM ONLINE']);
  assert.match(renderCinematicBoot(0,100,true,false).lines[0]!,/BOOT 000%$/u);
  assert.match(renderCinematicBoot(TALOS_BOOT_DURATION_MS,100,true,false).lines[0]!,/BOOT 100%$/u);
  assert.match(renderCinematicBoot(0,100,true,true).lines.join('\n'),/\[SYSTEM ONLINE\].*CORE ●   BUS ●   READY ●/u);
});

test('every row of the frame keeps its line on screen, empty or not (the picture never jumps)',()=>{
  const FakeReact:any={useState:(init:any)=>[typeof init==='function'?init():init,()=>{}],useEffect:()=>{},createElement:(type:any,props:any,...children:any[])=>({type,props:props??{},children})};
  const BootSequence=createBootSequenceComponent(FakeReact,{Box:'Box',Text:'Text'});
  const text=(node:any):string=>typeof node==='string'?node:(node?.children??[]).map(text).join('');
  for(const ago of [300,1700,3300]){
    const tree=BootSequence({state:createBootState(Date.now()-ago),motion:true,unicode:true,width:120,hint:''});
    const frame=renderCinematicBoot(ago,120,true,false);
    assert.equal(tree.children.length,frame.lines.length,`${ago} ms: one line per row`);
    assert.ok(frame.lines.some(line=>line==='')&&tree.children.every((row:any)=>text(row).length>0),`${ago} ms: an empty row is drawn as a space, not dropped`);
  }
});

test('a short terminal keeps the whole picture: a smaller medal, then blank rows, always the same ones (80×24 leaves it 20 rows)',()=>{
  const WORD=/████████╗|╔╦╗╔═╗╦/u,LAST_WORD=/╚═╝   ╚═╝|╩ ╩ ╩╩═╝/u,STATUS=/\[[A-Z /]+\]/u/* micro: [ TALOS // READY ] */;
  for(const [width,rows] of [[80,20],[120,20],[60,18],[40,15]] as const){
    const statusAt=new Set<number>(),wordAt=new Set<number>();
    for(const ms of [0,900,1800,2600,3400,4300,5000]){
      const frame=renderCinematicBoot(ms,width,true,false,{rows});
      assert.equal(frame.lines.length,rows,`${width}×${rows} at ${ms} ms`);
      for(const part of [frame.intensities,frame.levels,frame.metal])assert.equal(part.length,rows);
      statusAt.add(frame.lines.findIndex(line=>STATUS.test(line)));const word=frame.lines.findIndex(line=>WORD.test(line));if(word>=0)wordAt.add(word);
      if(ms>=4300){const text=frame.lines.join('\n');assert.match(text,WORD);assert.match(text,LAST_WORD,'the last row of the word');assert.match(text,STATUS,'the status line');}
    }
    assert.equal(statusAt.size,1,`${width}×${rows}: the status line never moves (${[...statusAt]})`);assert.equal(wordAt.size,1,`${width}×${rows}: the word never moves (${[...wordAt]})`);
  }
  /* the medal that fits: 80×24 takes the 20×11, 100×30 keeps the 30×17, 120×24 the 20×11; 60 columns too short: the thin word */
  for(const [width,rows,size] of [[80,20,2],[100,26,0],[120,20,2],[80,30,1],[60,26,2]] as const)assert.equal(medalBox(renderCinematicBoot(0,width,true,true,{rows})).rows,MEDAL_SIZES[size]!.rows,`${width}×${rows}`);
  for(const [width,rows] of [[80,20],[100,26],[120,20],[60,26]] as const)assert.match(renderCinematicBoot(0,width,true,true,{rows}).lines.join('\n'),/████████╗/u,`${width}×${rows}: a smaller medal keeps the block letters`);
  assert.match(renderCinematicBoot(0,60,true,true,{rows:18}).lines.join('\n'),/╔╦╗╔═╗╦/u,'60 columns too short for them: the thin word');
  const tall=renderCinematicBoot(3000,80,true,false,{rows:40}),grid=renderCinematicBoot(3000,80,true,false);
  assert.deepEqual(tall,grid,'with room to spare the picture is the mockup\'s grid');
  const oneLess=renderCinematicBoot(3000,80,true,false,{rows:grid.lines.length-1});
  assert.deepEqual(oneLess.lines,grid.lines.slice(0,-1),'the first row to go is the blank one under the status line');
});

test('the sequence hands the renderer the rows the screen leaves it',()=>{
  const FakeReact:any={useState:(init:any)=>[typeof init==='function'?init():init,()=>{}],useEffect:()=>{},createElement:(type:any,props:any,...children:any[])=>({type,props:props??{},children})};
  const BootSequence=createBootSequenceComponent(FakeReact,{Box:'Box',Text:'Text'});
  const tree=BootSequence({state:createBootState(Date.now()-3000),motion:true,unicode:true,width:80,rows:20,hint:''});
  assert.equal(tree.children.length,20,'80×24 leaves the picture 20 rows');
});
