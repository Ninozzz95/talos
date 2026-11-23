/*
 * R3 lane SP — owner decision (R3 follow-up): keep TAB. A tab typed or pasted reaches the model unchanged (Gemini CLI's
 * `stripUnsafeCharacters` keeps 0x09 for the same reason: a pasted Makefile must stay valid). A multi-character chunk that
 * starts with a tab is text; only a lone tab is the Tab key. The composer draws a tab as spaces to the next tab stop,
 * for display only, so neither the cursor nor the wrap drifts (a raw tab is 0 cells to Ink's string-width and up to 8 to the
 * terminal). Before: R3-KEYS turned every tab into four spaces, and a chunk starting with a tab pressed Tab.
 */
import assert from 'node:assert/strict';
import {after,test} from 'node:test';
import {sanitizeInputText,splitInputChunk} from '../../src/tui/keybindings.ts';
import {composerDisplay,composerRows} from '../../src/tui/components/composer.ts';
import {createEditorState} from '../../src/tui/editor.ts';
import {displayWidth} from '../../src/tui/text-width.ts';
import {hermeticProfile} from './r1-layout-fixture.ts';
import {mountR3App,sleep} from './r3-sp-fixture.ts';

const env=hermeticProfile();
after(()=>env.restore());
const rowText=(row:{text:string}[])=>row.map(piece=>piece.text).join('');

test('R3-SP TAB: a tab survives the input rule; a chunk that starts with a tab is text, not the Tab key',()=>{
  assert.equal(sanitizeInputText('all:\n\tcc -o x x.c\r\n'),'all:\n\tcc -o x x.c\n');
  assert.equal(sanitizeInputText('a\u0007\tb'),'a\tb','other C0 characters still go');
  assert.deepEqual(splitInputChunk('\tfoo',{}),[{ch:'\tfoo',key:{}}]);
  assert.deepEqual(splitInputChunk('\u000f\tfoo',{}),[{ch:'o',key:{ctrl:true}},{ch:'\tfoo',key:{}}]);
  assert.deepEqual(splitInputChunk('\tfoo\u0007',{}),[{ch:'\tfoo',key:{}}],'a leading tab is text even when the chunk carries another control character');
});

test('R3-SP TAB: the composer draws a tab as spaces to the next stop, and the cursor after it sits where it is drawn',()=>{
  const editor={...createEditorState('a\tb'),cursor:2};
  const {rows}=composerRows(composerDisplay(editor),40);
  const drawn=rowText(rows[0]!);
  assert.equal(drawn.includes('\t'),false,`a raw tab reaches the terminal: ${JSON.stringify(drawn)}`);
  assert.equal(drawn,'a   b','the tab fills to column 4');
  const cursorColumn=displayWidth(rows[0]!.slice(0,rows[0]!.findIndex(piece=>piece.kind==='cursor')).map(piece=>piece.text).join(''));
  assert.equal(cursorColumn,4,'the cursor on "b" is drawn at column 4');
  const onTab={...createEditorState('a\tb'),cursor:1};
  const pieces=composerRows(composerDisplay(onTab),40).rows[0]!;
  assert.equal(rowText(pieces),'a   b');
  assert.equal(pieces.find(piece=>piece.kind==='cursor')?.text,' ','the cursor on a tab is one cell at its start');
});

test('R3-SP TAB: a tab never makes a row wider than the composer, whatever column it starts in',()=>{
  for(const width of [5,6,7,8,9]){
    const {rows}=composerRows(composerDisplay({...createEditorState('abcde\tX\t\tYZ'),cursor:0}),width);
    for(const row of rows)assert.ok(displayWidth(rowText(row))<=width,`width ${width}: ${JSON.stringify(rowText(row))}`);
    assert.equal(rows.map(rowText).join('').replace(/ /gu,''),'abcdeXYZ','nothing but the tab is turned into spaces');
  }
});

test('R3-SP TAB (app): a typed chunk that starts with a tab and a pasted tab both reach the model unchanged',async()=>{
  const app=await mountR3App({cols:100,rows:30,root:env.root,paths:env.paths});
  try{
    /* A prompt is trimmed at its edges when it is sent, so the chunk follows a typed character. */
    app.press('x');await sleep(60);app.press('\tfoo');await sleep(80);app.press('\r');
    for(let i=0;i<80&&app.prompts.length<1;i++)await sleep(25);
    assert.deepEqual(app.prompts,['x\tfoo'],'the chunk that starts with a tab is text, not the Tab key');
    app.press('\u001b[200~all:\n\tcc x.c\u001b[201~');await sleep(80);app.press('\r');
    for(let i=0;i<80&&app.prompts.length<2;i++)await sleep(25);
    assert.equal(app.prompts[1],'all:\n\tcc x.c');
  }finally{app.unmount();}
});
