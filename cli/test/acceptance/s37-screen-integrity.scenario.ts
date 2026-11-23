/**
 * s37 — UI phase stage 2, cure 2c: the TUI writes only the rows that changed (the TALOS row writer, row-writer.ts), so
 * nothing on the screen may be left over from an earlier frame. Claude Code's fullscreen docs warn that on Windows Terminal and other
 * ConPTY hosts positioned writes can leave fragments behind; this terminal is ConPTY too (node-pty on Windows), so it sees
 * what a person would see.
 *
 * The oracle: Ctrl+L repaints the whole frame through Ink's own write (app.ts `repaintScreen`). After every step of a long
 * session — streamed answers, tools, thinking, scrolling, a resize — the screen BEFORE the repaint must equal the screen
 * AFTER it, cell by cell: the same characters and the same colours and attributes. A leftover fragment makes them differ.
 */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {atTheEnd,scrolledFurther,scrolledUp,stage,toComposer,turn} from './harness.ts';
import type {Screen,TerminalSession} from './terminal.ts';

type Cells=string[];
/** Every cell as "char|fg|bg|attributes", row by row, from the parsed screen (xterm headless). */
function cells(t:TerminalSession):Cells{
  const buffer=(t as unknown as {term:{buffer:{active:any}}}).term.buffer.active;
  const rows:Cells=[];
  for(let y=0;y<buffer.length&&rows.length<400;y++){
    const line=buffer.getLine(y);if(!line)continue;
    if(y<buffer.viewportY)continue;
    const out:string[]=[];
    for(let x=0;x<line.length;x++){const c=line.getCell(x);if(!c)continue;
      out.push(`${c.getChars()||' '}|${c.getFgColorMode()}:${c.getFgColor()}|${c.getBgColorMode()}:${c.getBgColor()}|${c.isBold()}${c.isItalic()}${c.isUnderline()}${c.isInverse()}${c.isDim()}`);}
    rows.push(out.join(''));
  }
  return rows;
}
function firstDifference(a:Cells,b:Cells){for(let y=0;y<Math.max(a.length,b.length);y++)if(a[y]!==b[y])return y;return -1;}

/* An action first gets time to produce output: `quiet` alone is already satisfied when nothing arrived for a while BEFORE
   the action (measured 01/10: a resize was photographed 1 ms after it, 0 bytes, before TALOS redrew). */
async function steady(t:TerminalSession){await new Promise(resolve=>setTimeout(resolve,300));await t.settled();await t.quiet(400,{timeout:15_000});await t.settled();}
async function assertNoLeftovers(t:TerminalSession,step:string,meter?:ReturnType<TerminalSession['meter']>){
  await steady(t);
  const seen=meter?` (since the step: ${JSON.stringify((({bytes,esu,eraseDisplay,ms})=>({bytes,esu,eraseDisplay,ms}))(meter.stop()))})`:'';
  step+=seen;
  const before=cells(t);const beforeText=t.screen().text;
  t.press('ctrl+l');
  await new Promise(resolve=>setTimeout(resolve,150));await steady(t);
  const after=cells(t);
  const row=firstDifference(before,after);
  assert.equal(row,-1,`${step}: the screen differed from a full repaint at row ${row}; before:\n${beforeText}\nafter:\n${t.screen().text}`);
}

for(const [cols,rows] of [[120,40],[80,24]] as const){
  const s=stage({name:`s37-${cols}x${rows}`,files:{'README.md':'# demo\n','src/index.js':"console.log('hi')\n",'src/util.js':'export const util=1;\n'}});
  let t:TerminalSession;
  test(`s37 · ${cols}×${rows} · after start-up the screen equals a full repaint`,async()=>{
    t=s.launch([],{cols,rows});
    await toComposer(t);
    /* 0.6.2 (gate red 13/10/2026, row 38): the status row's provider badge lands a moment after the composer; a comparison taken
       across that moment sees the row before and after it. From 100 columns the row is on screen: wait for its answer. Narrower,
       a healthy provider writes nothing there. */
    if(cols>=100)await t.waitFor('the provider check landed',x=>/\bollama: verified(?=\s|$)/mu.test(x.text),{timeout:20_000});
    /* CLI 0.6.15 kit, 4th round (16/11/2026): the Home is the first screen, and while it reads the sessions it shows a moving
       «Loading sessions» row (components/home.ts:48, loadingRow) that turns into the list 0.5-0.7 s after the composer (measured
       on the probe of the first frames, 3 runs). A comparison taken across that moment sees the row before and after it, which
       is not a leftover: wait for the list. */
    await t.waitFor('the Home read the sessions',x=>!x.text.includes('Loading sessions'),{timeout:20_000});
    await assertNoLeftovers(t,'start-up');
  });
  test(`s37 · ${cols}×${rows} · after streamed answers, tools and thinking the screen equals a full repaint`,async()=>{
    const prompts=['MD summary','SEARCH console','THINK step','MD summary','SEARCH console','THINK step'];
    for(const [index,prompt] of prompts.entries()){await turn(t,s.fake,`${prompt} ${index}`,{timeout:60_000});await assertNoLeftovers(t,`turn ${index} (${prompt})`);}
  });
  /* A5d (CLI 0.7.0, 19/11/2026): each comparison waits until the scroll has landed (harness.ts, scrolledUp/atTheEnd): on a loaded machine
     the 0.6.16 kit photographed «back to the end» before TALOS had moved and blamed a leftover. The oracle is the same, cell by cell. */
  const atTop=(s:Screen)=>s.lines.slice(1,4).some(line=>line.trimEnd()===' › MD summary 0');
  test(`s37 · ${cols}×${rows} · after scrolling up and back down the screen equals a full repaint`,async()=>{
    t.press('pageup');await scrolledUp(t);await assertNoLeftovers(t,'PgUp');
    const once=t.screen();t.press('pageup');await scrolledFurther(t,once,atTop);await assertNoLeftovers(t,'PgUp twice');
    t.press('pagedown');t.press('pagedown');t.press('ctrl+end');await atTheEnd(t);await assertNoLeftovers(t,'back to the end');
  });
  /* The bytes a turn writes: Ink's own writer rewrote every row of every frame (median ≈93 KB per turn at 120×40, ≈55 KB at
     80×24, measured with TALOS_TUI_FULL_REPAINT=1); the TALOS row writer writes the changed rows only. The limit is 30 KB
     for 120×40, scaled by the screen's cells. */
  test(`s37 · ${cols}×${rows} · a turn writes only what changed (median of 6 turns under the limit)`,async()=>{
    const limit=Math.round(30_000*(cols*rows)/(120*40));const sizes:number[]=[];
    for(const [index,prompt] of ['MD summary','SEARCH console','THINK step','MD summary','SEARCH console','THINK step'].entries()){
      const meter=t.meter();await turn(t,s.fake,`${prompt} bytes ${index}`,{timeout:60_000});await steady(t);sizes.push(meter.stop().bytes);
    }
    const median=[...sizes].sort((a,b)=>a-b)[Math.floor(sizes.length/2)]!;
    assert.ok(median<=limit,`median ${median} bytes per turn over the limit ${limit} (each: ${sizes.join(', ')})`);
  });
  /* The resize is measured with a meter so a failure says whether TALOS wrote anything after it (01/10: an early version of
     this scenario photographed the screen 1 ms after the resize and blamed TALOS for a redraw it had not had time to do). */
  test(`s37 · ${cols}×${rows} · after a resize and back the screen equals a full repaint`,async()=>{
    let meter=t.meter();t.resize(cols-10,rows-4);await assertNoLeftovers(t,'smaller',meter);
    meter=t.meter();t.resize(cols,rows);await assertNoLeftovers(t,'original size',meter);
    await turn(t,s.fake,'MD summary after resize',{timeout:60_000});await assertNoLeftovers(t,'turn after resize');
  });
  /* stage() disposes the profile and the fake model; the session is closed here so the next size starts alone. */
  test(`s37 · ${cols}×${rows} · close`,async()=>{await t.close();});
}
