/*
 * Stage 6c «tutto cliccabile» (mockup `jumpprompt`: the «your last prompt» part of the row above the view; Claude Code
 * fullscreen: «While you're scrolled up, a dim header row … shows the most recent prompt … Click the row to jump to that
 * prompt»). The row says where its prompt part starts, so only that part is the target; without a prompt part, nothing is.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {transcriptAnnouncement,transcriptAnnouncementRow} from '../../src/tui/components/transcript-virtualizer.ts';
import {displayWidth} from '../../src/tui/text-width.ts';

test('the prompt part of the row is where the click lands',()=>{
  const row=transcriptAnnouncementRow({hiddenAbove:5,hiddenMessagesAbove:3,latestPrompt:'fix the   flaky\nlogin test',promptAboveView:true,width:120})!;
  assert.equal(row.text,'↑ 3 earlier messages above · You: fix the flaky login test');
  assert.equal(row.promptFrom,displayWidth('↑ 3 earlier messages above · '));
  assert.equal(transcriptAnnouncement({hiddenAbove:5,hiddenMessagesAbove:3,latestPrompt:'fix the flaky login test',promptAboveView:true,width:120}),row.text,'the text is the same as before');
});

test('the prompt alone starts after the arrow; no prompt part, no target; a cut row keeps the part that shows',()=>{
  assert.equal(transcriptAnnouncementRow({hiddenAbove:0,hiddenMessagesAbove:0,latestPrompt:'hello',promptAboveView:true,width:80})!.promptFrom,displayWidth('↑ '));
  assert.equal(transcriptAnnouncementRow({hiddenAbove:4,hiddenMessagesAbove:2,latestPrompt:'hello',promptAboveView:false,width:80})!.promptFrom,null);
  assert.equal(transcriptAnnouncementRow({hiddenAbove:0,hiddenMessagesAbove:0,latestPrompt:null,promptAboveView:false,width:80}),null);
  const narrow=transcriptAnnouncementRow({hiddenAbove:5,hiddenMessagesAbove:3,latestPrompt:'a long prompt',promptAboveView:true,width:20})!;
  assert.equal(narrow.promptFrom,null,'the prompt part was cut away: nothing to click');
});
