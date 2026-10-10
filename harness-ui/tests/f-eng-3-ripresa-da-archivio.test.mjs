/*
 * F-ENG-3 (stress test of 0.5.0, 08/10/2026, session e2eb11a1): a TALOS process killed in the middle of a turn could not be
 * resumed. RETRY07 rebuilds the killed turn as ONE recovery message («TALOS recovered untrusted historical data…»), while the
 * Context Engine had already archived the turn's real exchanges (506 messages there): the history was no longer an extension
 * of the archive, and every later turn stopped with CTX_HISTORY_DIVERGED. `storiaDaArchivioDopoInterruzione` resumes from the
 * archived exchanges and keeps the recovery message only for what the archive does not hold.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { leggiRecuperoMessaggio, messaggioDaRecupero, storiaDaArchivioDopoInterruzione } from '../src/session-tail-recovery.mjs';

const sys = { role: 'system', content: 'rules' };
const user = { role: 'user', content: 'read the readme then talk' };
const call = (id, content = '') => ({ role: 'assistant', content, tool_calls: [{ id, type: 'function', function: { name: 'leggi', arguments: '{"percorso":"README.md"}' } }] });
const result = id => ({ role: 'tool', tool_call_id: id, content: '# demo' });
const recovery = items => messaggioDaRecupero({ runId: 'run-1', items });
const toolItem = (toolCallId, outcome = 'result-recorded') => ({ type: 'tool', toolCallId, toolCallName: 'leggi', argumentsReceived: '{"percorso":"README.md"}', outcome, ...(outcome === 'result-recorded' ? { result: '# demo' } : {}) });
const textItem = (text, messageClosed = true) => ({ type: 'text', messageId: `m-${text.length}`, text, messageClosed });

test('F-ENG-3: the archived exchanges replace the recovery message, which keeps only what the archive lacks', () => {
  const archive = [sys, user, call('c1', 'Reading.'), result('c1'), call('c2'), result('c2')];
  const history = [sys, user, recovery([textItem('Reading.'), toolItem('c1'), toolItem('c2'), toolItem('c3', 'unknown'), textItem('This answer streams', false)])];
  const resumed = storiaDaArchivioDopoInterruzione({ storia: history, archiviati: archive });
  assert.deepEqual(resumed.slice(0, archive.length), archive, 'the history extends the archive');
  const kept = leggiRecuperoMessaggio(resumed.at(-1));
  assert.ok(kept, 'the rest is still a valid recovery message');
  assert.deepEqual(kept.items.map(item => item.toolCallId ?? item.text), ['c3', 'This answer streams'], 'only the unarchived call and text remain');
  assert.equal(resumed.length, archive.length + 1);
});

test('F-ENG-3: messages after the recovery message (the failed resume\'s own request) follow the archive', () => {
  const archive = [sys, user, call('c1'), result('c1')];
  const next = { role: 'user', content: 'continue' };
  const resumed = storiaDaArchivioDopoInterruzione({ storia: [sys, user, recovery([toolItem('c1')]), next], archiviati: archive });
  assert.deepEqual(resumed, [...archive, next], 'a recovery fully covered by the archive disappears');
});

test('F-ENG-3: anything that does not prove the archive is this history leaves it as it was', () => {
  const archive = [sys, user, call('c1'), result('c1')];
  const history = [sys, user, recovery([toolItem('c1')])];
  assert.equal(storiaDaArchivioDopoInterruzione({ storia: [sys, user, call('c1'), result('c1')], archiviati: archive }), null, 'no recovery message');
  assert.equal(storiaDaArchivioDopoInterruzione({ storia: history, archiviati: null }), null, 'no archive');
  assert.equal(storiaDaArchivioDopoInterruzione({ storia: history, archiviati: [sys, user] }), null, 'an archive that stops at the recovery');
  assert.equal(storiaDaArchivioDopoInterruzione({ storia: history, archiviati: [sys, { role: 'user', content: 'other' }, call('c1'), result('c1')] }), null, 'a different prefix');
  assert.equal(storiaDaArchivioDopoInterruzione({ storia: history, archiviati: [sys, user, call('c1')] }), null, 'an archive ending on an unanswered call');
  assert.equal(storiaDaArchivioDopoInterruzione({ storia: history, archiviati: [...archive, recovery([toolItem('c9')])] }), null, 'an archive that already holds a recovery');
});
