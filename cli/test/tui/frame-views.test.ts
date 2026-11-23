/*
 * FE-048, A4 and A5 of MAPPA-RIDISEGNO-2026-11-01: the views, on the real app. The app starts in Essential; Zen has no header and no
 * box, one footer row, and the mode and the context never leave; Alt+L comes back to the view it left, also with a sheet open.
 */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {after,test} from 'node:test';
import {headerRow} from '../../src/tui/components/chrome-rows.ts';
import {budget,budgetRows} from '../../src/tui/regions/budget.ts';
import {displayWidth} from '../../src/tui/text-width.ts';
import {frameMemo,inHiddenBox} from '../../src/tui/hit-map.ts';
import {nextFrameView} from '../../src/tui/regions/frame-shape.ts';
import {KEY,mountApp,hermeticProfile,sleep} from './r1-layout-fixture.ts';

const env=hermeticProfile();after(()=>env.restore());
const size={cols:120,rows:30,root:env.root,paths:env.paths};
const ALT_L='\u001bl';

test('the budget of a Zen frame still adds up to the frame, with one row around the text',()=>{
  const base={rows:30,columns:120,frameRows:29,composerLines:1,composerHints:0,header:0,shortcut:0,roster:0,extras:0,footer:1,status:0};
  const zen=budget({...base,composerFrame:1});
  assert.equal(zen.composer,2);assert.equal(budgetRows(zen),29);
  assert.equal(budget(base).composer,3,'the default keeps the box');
});

test('out of Zen the view it left comes back',()=>{
  assert.equal(nextFrameView('essential','essential'),'zen');
  assert.equal(nextFrameView('zen','full'),'full');
  assert.equal(nextFrameView('zen','essential'),'essential');
});

test('the app starts in Essential; Alt+L opens Zen and closes it again',async()=>{
  const app=await mountApp(size as any);
  try{
    const first=await app.settle();
    assert.match(first.lines[0]!,/^ TALOS {2}\S/u);
    assert.ok(first.lines.some(line=>/^╭─/u.test(line)),'the box');
    app.press(ALT_L);
    const zen=await app.waitFor('Zen',x=>!x.lines.some(line=>/^ TALOS {2}/u.test(line)));
    assert.equal(zen.lines.some(line=>/^╭─/u.test(line)),false,'no box');
    assert.ok(zen.lines.some(line=>/^ ask before edits · ctx \?\s*$/u.test(line)),'the mode and the context stay');
    assert.ok(zen.lines.some(line=>/^ › /u.test(line)),'the prompt');
    app.press(ALT_L);
    await app.waitFor('back to Essential',x=>x.lines.some(line=>/^ TALOS {2}/u.test(line)));
  }finally{app.unmount();await sleep(50);}
});

test('Alt+L works with a sheet open and types nothing into it',async()=>{
  const app=await mountApp(size as any);
  try{
    await app.settle();
    app.press('/help');await sleep(60);app.press(KEY.enter);
    await app.waitFor('the sheet',x=>/Help|Commands/u.test(x.text));
    app.press(ALT_L);
    await app.waitFor('Zen behind the sheet',x=>!x.lines.some(line=>/^ TALOS {2}/u.test(line)));
  }finally{app.unmount();await sleep(50);}
});

test('the header: the name at the left, the tabs at the right (no To do: owner decision 3), and the click on Review is exact',()=>{
  const row=headerRow({workspace:'C:/work/shop-api',branch:'main',width:120,tabs:true});
  const text=row.map(segment=>segment.text).join('');
  assert.match(text,/^ TALOS {2}C:\/work\/shop-api · main\s+Chat {3}Review $/u);
  assert.doesNotMatch(text,/To do/u);
  assert.equal(displayWidth(text),120);
  assert.deepEqual(row.filter(segment=>segment.action).map(segment=>[segment.text,segment.action]),[['  C:/work/shop-api','open:projects'],[' Review ','centre:review']],'only what does something is a target: the folder opens Projects (C11b, bozzetto-cli-retro/index.html:723)');
});

test('the header gives way from the left and keeps the tabs at every width they fit, never To do',()=>{
  for(let width=40;width<=240;width+=1){
    const text=headerRow({workspace:'C:/a/very/long/path/of/a/project/somewhere/shop-api',branch:'feature/a-long-branch',width,tabs:true}).map(segment=>segment.text).join('');
    assert.ok(displayWidth(text)<=width,`${width}: ${text}`);
    assert.match(text,/^ TALOS/u);assert.doesNotMatch(text,/To do/u);
    if(width>=56)assert.match(text,/Review $/u,`${width}: ${text}`);
  }
});

test('without the tabs the header is the one of before',()=>{
  assert.equal(headerRow({workspace:'p',branch:'main',width:80}).map(segment=>segment.text).join(''),' TALOS  p · main');
});

const ALT_N='\u001bn';
test('Alt+N opens the bar with the focus on it, the chat narrows, and Alt+N closes it',async()=>{
  const app=await mountApp(size as any);
  try{
    await app.settle();
    app.press(ALT_N);
    const open=await app.waitFor('the bar',x=>x.lines.some(line=>/New session/u.test(line)));
    assert.ok(open.lines.some(line=>/^ › \+ New session/u.test(line)),'the focus is on the first voice');
    assert.ok(open.lines.some(line=>/▸ Workspaces/u.test(line)),'groups closed');
    assert.ok(open.lines.some(line=>/^ {3}\S.{22} {0,3}╭─/u.test(line)||/ {3}╭─/u.test(line)),'the composer stands beside the bar');
    app.press(KEY.esc);
    await app.waitFor('the focus left the bar',x=>x.lines.some(line=>/^ {3}\+ New session/u.test(line)));
    app.press(ALT_N);await app.waitFor('focus back',x=>x.lines.some(line=>/^ › \+ New session/u.test(line)));
    app.press(ALT_N);
    await app.waitFor('the bar closed',x=>!x.lines.some(line=>/New session/u.test(line)));
  }finally{app.unmount();await sleep(50);}
});

const ALT_D='\u001bd';
test('at 160 columns /full opens both columns with the chat between them; Alt+D takes the focus, then closes the panel',async()=>{
  const app=await mountApp({...size,cols:160,rows:45} as any);
  try{
    await app.settle();
    app.press('/full');await sleep(60);app.press(KEY.enter);
    const full=await app.waitFor('both columns',x=>x.lines.some(line=>/New session/u.test(line))&&x.lines.some(line=>/Session details/u.test(line)));
    assert.ok(full.lines.some(line=>/▾ Context/u.test(line)));
    app.press(ALT_D);
    await app.waitFor('the focus on the first card',x=>x.lines.some(line=>/› ▾ Context/u.test(line)));
    app.press(ALT_D);
    await app.waitFor('the panel closed',x=>!x.lines.some(line=>/Session details/u.test(line)));
  }finally{app.unmount();await sleep(50);}
});

test('at 120 columns only one column: the one asked for last',async()=>{
  const app=await mountApp(size as any);
  try{
    await app.settle();
    app.press('\u001bn');await app.waitFor('the bar',x=>x.lines.some(line=>/New session/u.test(line)));
    app.press(ALT_D);
    await app.waitFor('the panel takes its place',x=>x.lines.some(line=>/Session details/u.test(line))&&!x.lines.some(line=>/New session/u.test(line)));
  }finally{app.unmount();await sleep(50);}
});

test('the panel keys: ↓ moves between the cards, ← and → fold, a typed letter gives the focus back and reaches the composer',async()=>{
  const app=await mountApp({...size,cols:160,rows:45} as any);
  try{
    await app.settle();
    app.press(ALT_D);await app.waitFor('the focus',x=>x.lines.some(line=>/› ▾ Context/u.test(line)));
    app.press('[B');await app.waitFor('the second card',x=>x.lines.some(line=>/› [▾▸] Agents/u.test(line)));
    app.press('[A');await app.waitFor('back on the first',x=>x.lines.some(line=>/› ▾ Context/u.test(line)));
    app.press('\u001b[D');await app.waitFor('folded',x=>x.lines.some(line=>/› ▸ Context/u.test(line)));
    app.press('\u001b[C');await app.waitFor('open',x=>x.lines.some(line=>/› ▾ Context/u.test(line)));
    app.press('h');
    await app.waitFor('the letter in the composer, the focus gone',x=>x.lines.some(line=>/^│ › h/u.test(line.trimStart())||/│ › h/u.test(line))&&!x.lines.some(line=>/› ▾ Context/u.test(line)));
  }finally{app.unmount();await sleep(50);}
});

test('Alt+1 and Alt+2 open a folded card and take the focus',async()=>{
  const app=await mountApp({...size,cols:160,rows:45} as any);
  try{
    await app.settle();
    app.press(ALT_D);await app.waitFor('the focus',x=>x.lines.some(line=>/› ▾ Context/u.test(line)));
    app.press('\u001b[D');await app.waitFor('folded',x=>x.lines.some(line=>/› ▸ Context/u.test(line)));
    app.press(ALT_D);await app.waitFor('closed',x=>!x.lines.some(line=>/Session details/u.test(line)));
    app.press('\u001b1');
    await app.waitFor('open again, on that card',x=>x.lines.some(line=>/› ▾ Context/u.test(line)));
    app.press('\u001b2');
    await app.waitFor('the second card',x=>x.lines.some(line=>/› [▾▸] Agents/u.test(line)));
  }finally{app.unmount();await sleep(50);}
});

test('at 100 columns the bar and the panel take the whole page; Esc brings the chat back as it was',async()=>{
  const app=await mountApp({...size,cols:100,rows:30} as any);
  try{
    await app.settle();
    app.press('hello');await app.waitFor('the draft',x=>x.lines.some(line=>/│ › hello/u.test(line)));
    app.press('\u001bn');
    const bar=await app.waitFor('the whole bar',x=>x.lines.some(line=>/New session/u.test(line))&&!x.lines.some(line=>/│ › hello/u.test(line)));
    assert.ok(bar.lines.some(line=>/ · shift\+tab/u.test(line)),'the footer stays');
    app.press('\u001b');
    await app.waitFor('the chat again, with the draft',x=>x.lines.some(line=>/│ › hello/u.test(line))&&!x.lines.some(line=>/New session/u.test(line)));
    app.press(ALT_D);
    await app.waitFor('the whole panel',x=>x.lines.some(line=>/Session details/u.test(line))&&!x.lines.some(line=>/│ › hello/u.test(line)));
    app.press(ALT_D);
    await app.waitFor('the chat again',x=>x.lines.some(line=>/│ › hello/u.test(line))&&!x.lines.some(line=>/Session details/u.test(line)));
  }finally{app.unmount();await sleep(50);}
});

test('a block inside a hidden box takes no click: its own box or any box above it',()=>{
  const shown={style:{display:'flex'},parentNode:{style:{}}};
  assert.equal(inHiddenBox(shown),false);
  assert.equal(inHiddenBox({style:{},parentNode:{style:{},parentNode:{style:{display:'none'}}}}),true);
  assert.equal(inHiddenBox({style:{display:'none'}}),true);
  assert.equal(inHiddenBox(null),false);
});

test('the hover reads the targets once per frame',()=>{
  let reads=0;const memo=frameMemo(()=>{reads+=1;return reads;});
  assert.equal(memo.get(),1);assert.equal(memo.get(),1);assert.equal(reads,1);
  memo.clear();
  assert.equal(memo.get(),2,'a new frame reads again');
});

test('ui.startView opens the app in that view: Full with both columns, Zen without the header',async()=>{
  const full=await mountApp({...size,cols:160,rows:45,startView:'full'} as any);
  try{
    await full.settle();
    const screen=await full.waitFor('both columns',x=>x.lines.some(line=>/New session/u.test(line))&&x.lines.some(line=>/Session details/u.test(line)));
    assert.ok(screen.lines.length>0);
  }finally{full.unmount();await sleep(50);}
  const zen=await mountApp({...size,startView:'zen'} as any);
  try{
    await zen.settle();
    await zen.waitFor('no header',x=>!x.lines.some(line=>/^ TALOS {2}/u.test(line)));
  }finally{zen.unmount();await sleep(50);}
});

test('/sidebar, /panel and /panel agents do what the keys do, for a terminal that takes Alt',async()=>{
  const app=await mountApp({...size,cols:160,rows:45} as any);
  const run=async(command:string)=>{app.press(command);await sleep(60);app.press(KEY.enter);};
  try{
    await app.settle();
    await run('/sidebar');
    await app.waitFor('the bar',x=>x.lines.some(line=>/New session/u.test(line)));
    app.press('\u001b');await sleep(60);
    await run('/panel agents');
    await app.waitFor('the agents card with the focus',x=>x.lines.some(line=>/› [▾▸] Agents/u.test(line)));
  }finally{app.unmount();await sleep(50);}
});

test('under a card the frame sleeps: mode, model, context and columns take no click, the card does',async()=>{
  let pointer:any=null;
  const mouseSelection={subscribe:()=>()=>{},key(){},active:()=>false,copyAgain:async()=>false,onClick(handler:any){pointer=handler;}};
  const app=await mountApp({...size,cols:160,rows:45,startView:'full',mouseSelection} as any);
  const cellOf=(lines:string[],pattern:RegExp)=>{const row=lines.findIndex(line=>pattern.test(line));assert.ok(row>=0,String(pattern));return{row,col:lines[row]!.search(pattern)+1};};
  try{
    await app.settle();
    const before=await app.waitFor('both columns',x=>x.lines.some(line=>/New session/u.test(line)));await sleep(120);
    const mode=cellOf(before.lines,/ ask before edits/u),bar=cellOf(before.lines,/New session/u),panel=cellOf(before.lines,/▾ Context/u);
    assert.equal(pointer.target(mode),'frame:mode','premise: the mode acts');
    assert.ok(pointer.target(bar),'premise: the bar acts');assert.ok(pointer.target(panel),'premise: the panel acts');
    app.emit('run.started',{runId:'r1'});
    app.emit('approval.required',{requestId:'q1',azione:{tipo:'comando',comando:'npm test'}});
    const card=await app.waitFor('the card',x=>x.lines.some(line=>/\[1\] Allow once/u.test(line)));await sleep(120);
    assert.equal(pointer.target(cellOf(card.lines,/ ask before edits/u)),null,'the mode sleeps');
    assert.equal(pointer.target(bar),null,'the bar sleeps');assert.equal(pointer.target(panel),null,'the panel sleeps');
    assert.deepEqual(pointer.element(cellOf(card.lines,/ ask before edits/u)),[],'and it does not light up');
    assert.equal(pointer.target(cellOf(card.lines,/\[1\] Allow once/u)),'aopt:0','the card answers');
  }finally{app.unmount();await sleep(50);}
});

/* Row 8 of PIANO-CLI-0.7.0 (flaky under load, 23/11): past 100 ms `/diff` shows its LOADING page first (`panel/loading.ts`,
   LOADING_PAGE_MS), and that page carries the same «── Changes» title. Waiting for the title alone took the loading page for the
   page: Esc then closed the loading page, the next Alt+J ran while the first read was still going, and (traced on a copy, 2 runs in
   8 under a Git spawn storm) the page never came. The event to wait for is the page READ: the title, without «Loading changes». */
const reviewRead=(x:{lines:string[];text:string})=>x.lines.some(line=>/^── Changes/u.test(line))&&!/Loading changes/u.test(x.text);

test('Review takes the centre under the header, the footer stays, and Esc and Alt+J bring the chat back with its draft',async()=>{
  /* the hermetic project, made a repository of its own: /diff reads Git */
  execFileSync('git',['init','-q'],{cwd:env.root,windowsHide:true});
  const app=await mountApp({...size,cols:120,rows:30} as any);
  try{
    await app.settle();
    app.press('hello');await app.waitFor('the draft',x=>x.lines.some(line=>/│ › hello/u.test(line)));
    app.press('\u001bj');
    const page=await app.waitFor('the page, read',reviewRead);
    {
      assert.ok(!page.lines.some(line=>/│ › hello/u.test(line)),'the composer gives way');
      assert.ok(page.lines.some(line=>/ · shift\+tab/u.test(line)),'the footer stays');
      assert.match(page.lines[0]!,/^ TALOS/u,'the header stays');
      app.press('\u001b');
      await app.waitFor('the chat again, with the draft',x=>x.lines.some(line=>/│ › hello/u.test(line)));
      app.press('\u001bj');await app.waitFor('the page, read',reviewRead);
      app.press('\u001bj');
      await app.waitFor('Alt+J closes it',x=>x.lines.some(line=>/│ › hello/u.test(line)));
    }
  }finally{app.unmount();await sleep(50);}
});

test('owner 01/11: the bar and the panel close with their ✕, on the cells of the ✕, and it sleeps under a card',async()=>{
  let pointer:any=null;
  const mouseSelection={subscribe:()=>()=>{},key(){},active:()=>false,copyAgain:async()=>false,onClick(handler:any){pointer=handler;}};
  const app=await mountApp({...size,cols:160,rows:45,startView:'full',mouseSelection} as any);
  try{
    await app.settle();
    const open=await app.waitFor('both columns',x=>x.lines.some(line=>/New session/u.test(line))&&x.lines.some(line=>/Session details/u.test(line)));await sleep(120);
    const top=open.lines.findIndex(line=>/Session details/u.test(line));
    const line=open.lines[top]!,bar=line.indexOf('✕'),panel=line.lastIndexOf('✕');
    assert.ok(bar>=0&&panel>bar,line);
    assert.equal(pointer.target({row:top,col:bar}),'frame:close-bar');
    assert.equal(pointer.target({row:top,col:panel}),'frame:close-panel');
    assert.deepEqual(pointer.element({row:top,col:bar}).map((target:any)=>target.to-target.from+1),[3],'the button lights up alone');
    assert.notEqual(pointer.target({row:top,col:bar-4}),'frame:close-bar','next to it, nothing closes');
    app.emit('run.started',{runId:'r1'});
    app.emit('approval.required',{requestId:'q1',azione:{tipo:'comando',comando:'npm test'}});
    await app.waitFor('the card',x=>x.lines.some(line=>/\[1\] Allow once/u.test(line)));await sleep(120);
    assert.equal(pointer.target({row:top,col:bar}),null,'under a card it sleeps');
    app.emit('approval.resolved',{requestId:'q1',approved:false});
    app.press('\u001b');await sleep(200);
    pointer.run('frame:close-bar');
    await app.waitFor('the bar closed',x=>!x.lines.some(line=>/New session/u.test(line))&&x.lines.some(line=>/Session details/u.test(line)));
    pointer.run('frame:close-panel');
    await app.waitFor('the panel closed',x=>!x.lines.some(line=>/Session details/u.test(line)));
  }finally{app.unmount();await sleep(50);}
});

test('on a page a toast has its own row and is not said twice in the footer',async()=>{
  execFileSync('git',['init','-q'],{cwd:env.root,windowsHide:true});
  let tell:(info:unknown)=>void=()=>{};
  const mouseSelection={subscribe:(listener:(info:unknown)=>void)=>{tell=listener;return()=>{};},key(){},active:()=>false,copyAgain:async()=>false,onClick(){}};
  const app=await mountApp({...size,cols:120,rows:30,mouseSelection} as any);
  try{
    await app.settle();
    app.press('\u001bj');await app.waitFor('the page, read',reviewRead);
    tell({kind:'word',word:'hello',where:null});
    const shown=await app.waitFor('the toast',x=>x.lines.some(line=>/^ ✓ /u.test(line)));
    const said=shown.lines.filter(line=>/hello/u.test(line));
    assert.equal(said.length,1,said.join('\n'));
  }finally{app.unmount();await sleep(50);}
});
