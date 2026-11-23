/*
 * UI plan, Phase 1 (owner 27/09, "one-line preview"): while the model thinks with reasoning collapsed, one dim line shows
 * the last sentence so far, 160 characters at most (Hermes `truncated`, THINKING_COT_MAX=160); at the end it becomes
 * "Thought for N s · Ctrl+T shows". With reduced motion the line does not move: no live preview.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {thinkingPreview,thoughtClock,thoughtGlyph,thoughtHint,thoughtLine,thoughtLivePreview,visibleTranscriptItems} from '../../src/tui/components/thinking-row.ts';
import type {TranscriptItem} from '../../src/tui/transcript-model.ts';

const reasoning=(text:string,streaming:boolean):TranscriptItem=>({kind:'reasoning',id:'r1',text,streaming,startedAt:1_000,endedAt:streaming?null:3_800} as any);

test('P1 thinking: the preview is the last sentence so far, on one line', () => {
  assert.equal(thinkingPreview('I read the file. Now I check\nthe tests  carefully'),'Now I check the tests carefully');
  assert.equal(thinkingPreview('Done? Yes!'),'Yes!');
  assert.equal(thinkingPreview('   '),'');
});

test('P1 thinking: a sentence longer than 160 characters keeps its END (what the model is thinking now)', () => {
  const long='a'.repeat(100)+' '+'b'.repeat(100);
  const shown=thinkingPreview(long);
  assert.equal([...shown].length,160);assert.ok(shown.startsWith('…'));assert.ok(shown.endsWith('b'.repeat(100)));
});

/* The approved mockup (07/10, kind 'thought'; owner 08/10 «Tutta la conversazione»): `▸ Thinking…` while it streams, then
   `▸ Thought for 4s  click to read`, the duration as the mockup's `clock` (`4s`, `1m 05s`); open, `▾` and no hint. */
test('mockup thinking: «Thinking…» while it streams; once ended «Thought for 2s» and the faint «  click to read»', () => {
  assert.equal(thoughtLine(reasoning('First. Second thought',true) as any),'Thinking…');
  assert.equal(thoughtLine(reasoning('First. Second thought',false) as any),'Thought for 2s');
  assert.equal(thoughtLine({startedAt:0,endedAt:65_400} as any),'Thought for 1m 05s');
  assert.equal(thoughtLine({startedAt:null,endedAt:null} as any),'Thought','a replayed block has no number');
  assert.equal(thoughtHint({streaming:false},false),'  click to read');
  assert.equal(thoughtHint({streaming:true},false),'','nothing to read yet');
  assert.equal(thoughtHint({streaming:false},true),'','open: the text is there');
  assert.equal(thoughtGlyph(false),'▸ ');assert.equal(thoughtGlyph(true),'▾ ');
  assert.equal(thoughtClock(4_900),'4s');assert.equal(thoughtClock(59_999),'59s');assert.equal(thoughtClock(60_000),'1m 00s');
  assert.equal(thoughtLivePreview(reasoning('First. Second thought',true) as any),'Second thought','the sentence stays for the indicator');
});

test('P1 thinking: the streaming block is drawn with reasoning collapsed, unless motion is reduced', () => {
  const items=[reasoning('Working on it',true)];
  assert.equal(visibleTranscriptItems(items,false).length,1,'live preview on');
  assert.equal(visibleTranscriptItems(items,false,{livePreview:false}).length,0,'reduced motion: no moving line');
});
