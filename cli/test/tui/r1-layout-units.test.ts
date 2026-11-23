/**
 * R1 lane L — the pure pieces behind the screen structure: the height budget (E1/E3/E13, Q-R1-3/8), the frame height
 * switch (Q-R1-6), the width function (E4), the composer's own line breaks (E3), the row-based transcript window and
 * the announcement row (Q-R1-2/9, E9).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import stringWidth from 'string-width';
import {budget,budgetRows,composerRowsCap,MIN_COLUMNS,MIN_ROWS,PANEL_FULL_SCREEN_BELOW,TOO_SMALL_TEXT,type BudgetInput} from '../../src/tui/regions/budget.ts';
import {frameRowsFor,terminalFrameProps} from '../../src/tui/components/terminal-shell.ts';
import {displayWidth,truncateDisplay,truncateMiddle,wrapDisplay} from '../../src/tui/text-width.ts';
import {composerLayout,composerRows} from '../../src/tui/components/composer.ts';
import {createEditorState,composerSegments} from '../../src/tui/editor.ts';
import {estimateTranscriptItemRows,planTranscriptRows,textRows,transcriptAnnouncement} from '../../src/tui/components/transcript-virtualizer.ts';

const WIDTHS=[40,41,60,80,100,120,160,200,240];
const HEIGHTS=[12,13,15,20,24,30,40,60,80];
const base=(rows:number,columns:number,over:Partial<BudgetInput>={}):BudgetInput=>({rows,columns,frameRows:frameRowsFor(rows,'win32'),composerLines:1,composerHints:0,header:1,shortcut:1,roster:1,extras:0,footer:1,...over});

test('E1: at every grid size and content the regions add up to exactly the frame, and none is negative',()=>{
  const contents:Partial<BudgetInput>[]=[
    {},{composerLines:80,composerHints:2},{overlay:Infinity},{overlay:5},{menu:15},{diff:Infinity,overlay:Infinity,aux:4},
    {roster:4,extras:2},{composerLines:30,overlay:Infinity,menu:15,diff:9,aux:3,roster:5,extras:2},
  ];
  let checked=0;
  for(const columns of WIDTHS)for(const rows of HEIGHTS)for(const content of contents)for(const platform of ['win32','linux']){
    const b=budget(base(rows,columns,{frameRows:frameRowsFor(rows,platform),...content}));
    assert.equal(b.tooSmall,false);
    assert.equal(budgetRows(b),b.frameRows,`${columns}×${rows} ${JSON.stringify(content)}: ${JSON.stringify(b)}`);
    for(const [key,value] of Object.entries(b))if(typeof value==='number')assert.ok(value>=0,`${key} negative`);
    assert.ok(b.composer<=composerRowsCap(rows),'the composer never exceeds its cap');
    checked++;
  }
  assert.equal(checked,WIDTHS.length*HEIGHTS.length*8*2);
});

test('E3: the composer is capped at min(10, ⌊rows/3⌋) rows, hints give way first, the text keeps a row',()=>{
  assert.equal(composerRowsCap(12),4);assert.equal(composerRowsCap(30),10);assert.equal(composerRowsCap(80),10);assert.equal(composerRowsCap(20),6);
  const b=budget(base(30,100,{composerLines:60,composerHints:2}));
  assert.equal(b.composer,10);assert.equal(b.composerContent,6);assert.equal(b.composerHints,2);
  const small=budget(base(12,40,{composerLines:60,composerHints:2}));
  assert.equal(small.composer,4);assert.equal(small.composerHints,1);assert.equal(small.composerContent,1);
});

test('Q-R1-3: an overlay gets at most frame − composer − 1 status row; a smaller one leaves the rest to chrome and transcript',()=>{
  const b=budget(base(30,100,{overlay:Infinity}));
  assert.equal(b.overlayMaxRows,b.frameRows-b.composer-1);
  assert.equal(b.overlay,b.overlayMaxRows);assert.equal(b.transcript,0);
  const short=budget(base(30,100,{overlay:6}));
  assert.equal(short.overlay,6);assert.ok(short.transcript>0);assert.equal(short.footer,1);assert.equal(short.header,1);
});

test('Q-R1-3: a panel whose budget falls under six rows takes the whole frame',()=>{
  const b=budget(base(30,100,{frameRows:9,composerLines:3,overlay:20}));
  assert.ok(b.frameRows-b.composer-1<PANEL_FULL_SCREEN_BELOW||b.fullScreenPanel);
  assert.equal(b.fullScreenPanel,true);assert.equal(b.overlay,9);assert.equal(budgetRows(b),9);
  assert.equal(budget(base(12,40,{overlay:Infinity})).fullScreenPanel,false,'unreachable at the 40×12 minimum with the composer cap');
});

test('E13: chrome is dropped roster first, then the shortcut strip, then the header, the footer last; the transcript keeps a row',()=>{
  /* 12 rows, frame 11, a 4-row composer, status 1 → 6 rows for chrome + transcript. */
  const at=(roster:number)=>budget(base(12,40,{composerLines:9,roster}));
  const full=at(1);assert.deepEqual([full.footer,full.header,full.shortcut,full.roster,full.transcript],[1,1,1,1,2]);
  const tight=at(3);assert.deepEqual([tight.footer,tight.header,tight.shortcut,tight.roster,tight.transcript],[1,1,1,0,3],'the 3-line roster no longer fits: it goes first');
  const squeezed=budget(base(12,40,{composerLines:9,overlay:5}));
  assert.deepEqual([squeezed.footer,squeezed.header,squeezed.shortcut,squeezed.roster],[1,0,0,0],'with a 5-row panel only the footer still fits');
});

test('Q-R1-8: below 40×12 the budget says "too small", with the exact line to show',()=>{
  assert.equal(budget(base(12,39)).tooSmall,true);assert.equal(budget(base(11,40)).tooSmall,true);assert.equal(budget(base(12,40)).tooSmall,false);
  assert.equal(MIN_COLUMNS,40);assert.equal(MIN_ROWS,12);assert.equal(TOO_SMALL_TEXT,'Terminal too small — need 40×12');
});

test('Q-R1-6: the frame height switch — win32 keeps one row free, other platforms fill the terminal',()=>{
  assert.equal(frameRowsFor(30,'win32'),29);assert.equal(frameRowsFor(30,'linux'),30);assert.equal(frameRowsFor(30,'win32','rows'),30);
  const frame=terminalFrameProps({session:{mode:'mono',alternateScreen:true,paintBackground:false,fallbackReason:null},rows:20,columns:80,platform:'win32'});
  assert.deepEqual(frame,{flexDirection:'column',width:80,height:19});
});

test('E4: displayWidth is exactly the width Ink lays text out with (string-width 8.2.2) on CJK, emoji ZWJ, combining marks, SGR and controls',()=>{
  const fixtures=['hello','漢字テスト','한국어','👍','👍🏽','👨‍👩‍👧‍👦','🏳️‍🌈','🇮🇹','e\u0301','a\u0300\u0301','\u001b[31mred\u001b[0m','\u001b[1;38;5;208mbold\u001b[22m','\t','x\u200by','１２３','ｱｲｳ','☺','☺️','⚠','⚠️','©','™','✔','▶','ℹ','…','─','│','•','›','\u00ad','\u0000','\u0085','\u200e','ก่','नमस्ते','مرحبا','\u{1F9D1}\u{1F3FD}\u200D\u{1F4BB}'];
  for(const text of fixtures)assert.equal(displayWidth(text),stringWidth(text),JSON.stringify(text));
  assert.equal(truncateDisplay('ab界cd',5),'ab界…');
  const path='C:\\Users\\person\\projects\\very-long-folder-name\\repo';
  const cut=truncateMiddle(path,20);assert.ok(displayWidth(cut)<=20&&cut.startsWith('C:\\')&&cut.endsWith('repo')&&cut.includes('…'),cut);
  assert.deepEqual(wrapDisplay('abcdef',4),['abcd','ef']);assert.deepEqual(wrapDisplay('a\nb',4),['a','b']);assert.deepEqual(wrapDisplay('界界界',4),['界界','界']);
});

test('E3/E4: the composer breaks its own rows at the content width, and a long text scrolls to the cursor',()=>{
  const text=Array.from({length:30},(_,i)=>`line ${i+1}`).join('\n');
  const atEnd=createEditorState(text);
  const layout=composerLayout(composerSegments(atEnd),{contentWidth:36,maxRows:4});
  assert.equal(layout.total,30);assert.equal(layout.rows.length,4);assert.equal(layout.hiddenAbove,26);assert.equal(layout.hiddenBelow,0);
  assert.ok(layout.rows.at(-1)!.some(piece=>piece.kind==='cursor'),'the cursor row is visible');
  const atStart={...atEnd,cursor:0};
  const top=composerLayout(composerSegments(atStart),{contentWidth:36,maxRows:4});
  assert.equal(top.start,0);assert.equal(top.hiddenBelow,26);
  /* A wide row breaks by display width; every row fits the width. */
  const {rows}=composerRows(composerSegments(createEditorState('界'.repeat(25))),20);
  assert.equal(rows.length,3);for(const row of rows)assert.ok(row.reduce((sum,piece)=>sum+displayWidth(piece.text),0)<=20);
});

test('Q-R1-2/E9: the row window reaches the top of an item taller than the view, clips below and counts what is above',()=>{
  const items=[{id:'a',h:3},{id:'b',h:2},{id:'c',h:20},{id:'d',h:2}];
  const at=(scrollRows:number,revealIndex?:number)=>planTranscriptRows({items,rowBudget:5,scrollRows,heightOf:item=>item.h,...(revealIndex!==undefined?{revealIndex}:{})});
  const tail=at(0);
  assert.deepEqual(tail.rows.map(item=>item.id),['c','d']);assert.equal(tail.clipBelow,0);assert.equal(tail.hiddenAbove,2);assert.equal(tail.totalRows,27);assert.equal(tail.maxScroll,22);
  const inside=at(10);
  assert.deepEqual(inside.rows.map(item=>item.id),['c']);assert.equal(inside.clipBelow,8,'the rows of c below the view');
  const top=at(1000);
  assert.equal(top.scrollRows,22);assert.deepEqual(top.rows.map(item=>item.id),['a','b']);assert.equal(top.hiddenAbove,0);
  const reveal=at(0,0);assert.deepEqual(reveal.rows.map(item=>item.id),['a','b'],'a reveal scrolls the target into view');
  assert.equal(tail.firstRowFromBottom(2),21);assert.equal(tail.rowsBelow(2),2);
});

test('E4: an item never measured is counted with the render width, not 75 % of it',()=>{
  const text='x'.repeat(100);
  assert.equal(textRows(text,50),2);assert.equal(textRows(text,40),3);
  assert.equal(estimateTranscriptItemRows({id:'m',kind:'message',role:'assistant',text} as any,50),4,'the blank row, then the answer under its two-cell indent: 100 cells at 48 are three rows (the mockup)');
  assert.equal(estimateTranscriptItemRows({id:'w',kind:'warning',text:'short'} as any,50),1);
});

test('Q-R1-9: the announcement names the latest prompt above the view and counts the messages above it',()=>{
  assert.equal(transcriptAnnouncement({hiddenAbove:0,hiddenMessagesAbove:0,latestPrompt:'hi',promptAboveView:false,width:80}),null);
  assert.equal(transcriptAnnouncement({hiddenAbove:3,hiddenMessagesAbove:2,latestPrompt:'fix the tests',promptAboveView:true,width:80}),'↑ 2 earlier messages above · You: fix the tests');
  assert.equal(transcriptAnnouncement({hiddenAbove:0,hiddenMessagesAbove:0,latestPrompt:'fix\nthe  tests',promptAboveView:true,width:80}),'↑ You: fix the tests');
  assert.equal(transcriptAnnouncement({hiddenAbove:1,hiddenMessagesAbove:1,latestPrompt:null,promptAboveView:false,width:80}),'↑ 1 earlier message above');
  assert.equal(transcriptAnnouncement({hiddenAbove:2,hiddenMessagesAbove:0,latestPrompt:null,promptAboveView:false,width:80}),'↑ 2 earlier items above');
  const long=transcriptAnnouncement({hiddenAbove:5,hiddenMessagesAbove:5,latestPrompt:'x'.repeat(200),promptAboveView:true,width:40})!;
  assert.ok(displayWidth(long)<=40&&long.endsWith('…'));
});
