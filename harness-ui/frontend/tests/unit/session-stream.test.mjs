import assert from 'node:assert/strict';
import test from 'node:test';

import { createSessionStreamFactory } from '../../src/contracts/session-stream.js';

class FakeEventSource {
  static instances = [];
  constructor(url) { this.url = url; this.closed = false; FakeEventSource.instances.push(this); }
  close() { this.closed = true; }
}

test('PHASE1-STREAM-CLOSE-01 distingue fine attesa e interruzione', () => {
  const states = []; const errors = []; const events = [];
  const stream = createSessionStreamFactory({ EventSourceImpl: FakeEventSource, endpoint: (id) => `/api/v1/sessions/${id}/events` });
  const first = stream.open({ sessionId: 's-1', onEvent: (event) => events.push(event), onState: (state) => states.push(state), onError: (error) => errors.push(error) });
  const source = FakeEventSource.instances.at(-1);
  source.onmessage({ data: JSON.stringify({ type: 'RunFinished' }) });
  source.onerror(new Error('native close'));
  assert.equal(errors.length, 0);
  assert.equal(states.at(-1), 'finished');
  first.close(); first.close();
  assert.equal(source.closed, true);

  stream.open({ sessionId: 's-2', onEvent: () => {}, onState: (state) => states.push(state), onError: (error) => errors.push(error) });
  FakeEventSource.instances.at(-1).onerror(new Error('offline'));
  assert.equal(errors.at(-1).code, 'SESSION_STREAM_INTERRUPTED');
});
