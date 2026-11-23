/* R5a (coordinator, lane S hand-back §5d): a session-changing slash command queued during a turn (Q-R5-8) is listed in the
   queue editor as the command it is, not as a follow-up message to the model. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {t} from '../../src/i18n/index.ts';
import {queueEditorLines} from '../../src/tui/overlays/queue-editor.ts';

test('R5a Q-R5-8: a queued slash command reads as itself in the queue editor, a prompt still as a follow-up',()=>{
  const lines=queueEditorLines({entries:[{id:'a',kind:'slash',text:'/model openai:gpt-5-mini',status:'pending'},{id:'b',kind:'prompt',text:'hello',status:'pending'}],selected:0,paused:false,editing:false,draft:''});
  const followUp=t('screen.queueEditor.followUp');
  assert.ok(lines.includes('› 1. /model openai:gpt-5-mini'),`the slash row is not the bare command:\n${lines.join('\n')}`);
  assert.ok(lines.includes(`  2. ${followUp}hello`),`the prompt row lost its follow-up label:\n${lines.join('\n')}`);
});
