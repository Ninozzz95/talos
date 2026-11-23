/*
 * s33 after the desktop kernel merge (02/10, registro 12): with the composer up before the kernel, a person types while the
 * kernel loads; the busy loop hands the last letters and Enter to TALOS in ONE chunk («ig\r»), and the R3-KEYS rule made
 * every CR inside a chunk a line break, so `/config` + Enter became `/config` + a new line. Owner decision («Regola Gemini
 * + test»): TALOS turns bracketed paste on (Ink `usePaste`), so a paste arrives on its own channel and what reaches the
 * keys is TYPED — one line of text followed by a single Enter is text and Enter, as in Gemini CLI (PR #15932: fast Enter
 * is a line break only without bracketed paste). A chunk with more than one line stays all line breaks, as before and as
 * in Codex (paste_burst.rs), so a multi-line paste from a terminal without bracketed paste never sends itself (Pi #7321,
 * #2376; oh-my-pi #13315).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {splitInputChunk} from '../../src/tui/keybindings.ts';

test('one typed line and its Enter in one chunk: the text, then the Enter key',()=>{
  assert.deepEqual(splitInputChunk('ig\r',{}),[{ch:'ig',key:{}},{ch:'\r',key:{return:true}}]);
  assert.deepEqual(splitInputChunk('/config\r\n',{}),[{ch:'/config',key:{}},{ch:'\r',key:{return:true}}],'CRLF ends the line the same way');
  assert.deepEqual(splitInputChunk('caffè 中文\r',{}),[{ch:'caffè 中文',key:{}},{ch:'\r',key:{return:true}}]);
});

test('a control key, then one line and its Enter: each in order',()=>{
  assert.deepEqual(splitInputChunk('\u000fabc\r',{}),[{ch:'o',key:{ctrl:true}},{ch:'abc',key:{}},{ch:'\r',key:{return:true}}]);
});

test('more than one line in a chunk stays line breaks: a multi-line paste never sends itself',()=>{
  assert.deepEqual(splitInputChunk('first\rsecond\r',{}),[{ch:'first\nsecond\n',key:{}}]);
  assert.deepEqual(splitInputChunk('first\r\nsecond',{}),[{ch:'first\nsecond',key:{}}]);
  assert.deepEqual(splitInputChunk('a\u0007b\r\nc',{}),[{ch:'ab\nc',key:{}}],'R3-KEYS unchanged');
});

test('a line with another control character inside is not «one typed line»: unchanged rule',()=>{
  assert.deepEqual(splitInputChunk('ab\u0007c\r',{}),[{ch:'abc\n',key:{}}]);
});

test('through the real TUI: «/conf», then «ig» and Enter in one chunk, opens /config (not a new line)',async()=>{
  const {hermeticProfile,mountApp,composerRow}=await import('./r1-layout-fixture.ts');
  const env=hermeticProfile();
  const app=await mountApp({cols:100,rows:30,root:env.root,paths:env.paths});
  try{
    await app.waitFor('the composer',s=>composerRow(s)>=0);
    app.press('/conf');
    await app.waitFor('«/conf» in the composer',s=>s.lines.some(line=>/^│ › \/conf\b/u.test(line)));
    app.press('ig\r');
    const shown=await app.waitFor('the /config panel',s=>s.text.includes('Response width'),5_000);
    assert.equal(shown.lines.some(line=>/^│ › \/config/u.test(line)),false,'the command ran: it is not left in the composer');
  }finally{app.unmount();env.restore();}
});
