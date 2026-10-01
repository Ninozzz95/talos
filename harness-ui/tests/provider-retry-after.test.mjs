import assert from 'node:assert/strict';
import test from 'node:test';
import { chiamaConRitenta } from '../src/kernel/talosHarness.mjs';
import { leggiAttesaRetryAfter } from '../src/provider-retry.mjs';

async function run(header) {
  let requests = 0;
  const delays = [];
  let error;
  try {
    await chiamaConRitenta({ modello: 'fixture', chiave: 'fixture', messaggi: [], attrezzi: [],
      caso: () => 0, dormi: async ms => delays.push(ms),
      fetchDiRete: async () => ++requests === 1
        ? new Response('Service unavailable', { status: 503, headers: header == null ? {} : { 'Retry-After': header } })
        : Response.json({ choices: [{ message: { content: 'OK' } }] }),
    });
  } catch (e) { error = e; }
  return { requests, delays, error };
}

test('RETRY-AFTER-SECONDS: il ritardo del server è un minimo', async () => {
  assert.deepEqual((await run('2')).delays, [2000]);
  assert.deepEqual((await run('0')).delays, [500]);
});

test('RETRY-AFTER-DATE: data HTTP futura, nessun invio anticipato', async () => {
  const deadline = Math.ceil(Date.now() / 1000) * 1000 + 60_000;
  const before = Date.now();
  const r = await run(new Date(deadline).toUTCString());
  assert.equal(r.requests, 2);
  assert.equal(r.delays.length, 1);
  assert.ok(r.delays[0] >= deadline - Date.now());
  assert.ok(r.delays[0] <= deadline - before);
});

test('RETRY-AFTER-INVALID: assente, negativo, frazionario e testo usano il backoff', async () => {
  for (const value of [null, '', '-1', '1.5', 'tomorrow', 'test-secret-header']) {
    assert.deepEqual((await run(value)).delays, [500], String(value));
  }
  assert.deepEqual((await run('Thu, 01 Jan 1970 00:00:00 GMT')).delays, [500]);
});

test('RETRY-AFTER-OVERFLOW: non diventa il timer Node da 1 ms', async () => {
  for (const value of ['2147484', '9'.repeat(400)]) {
    const r = await run(value);
    assert.equal(r.requests, 1);
    assert.deepEqual(r.delays, []);
    assert.equal(r.error?.stato, 503);
  }
});

test('RETRY-AFTER-ASCTIME-UTC: stesso istante in tutti i fusi locali', () => {
  const previous = process.env.TZ;
  try {
    for (const zone of ['UTC', 'Europe/Rome', 'America/New_York']) {
      process.env.TZ = zone;
      const now = Date.UTC(1994, 10, 6, 8, 49, 0);
      assert.equal(leggiAttesaRetryAfter('Sun Nov  6 08:49:37 1994', now), 37_000, zone);
    }
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test('RETRY-AFTER-RFC850-YEAR: finestra di 50 anni, non pivot fisso di Date.parse', () => {
  const now = Date.UTC(2026, 0, 1);
  assert.equal(leggiAttesaRetryAfter('Wednesday, 01-Jan-70 00:00:00 GMT', now), Date.UTC(2070, 0, 1) - now);
  assert.equal(leggiAttesaRetryAfter('Saturday, 01-Jan-77 00:00:00 GMT', now), 0);
  assert.equal(leggiAttesaRetryAfter('Friday, 02-Jan-76 00:00:00 GMT', now), 0, 'oltre 50 anni anche nello stesso anno limite');
});
