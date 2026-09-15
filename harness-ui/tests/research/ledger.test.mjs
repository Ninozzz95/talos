import test from 'node:test';
import assert from 'node:assert/strict';
import { caricaOppureSalta } from './_dipendenza-in-corso.mjs';

/*
 * TRADOTTO da AVM/mobile/tests/unit/research/researchLedger.test.ts (vitest → node:test).
 * Stessi casi, stesso ordine, stesse attese.
 *
 * ⛔ `ledger.mjs` importa `talosResearchDuration` da `outline.mjs`, che a sua
 * volta importa `run.mjs` (altra sessione di L3): finché quello manca, questi
 * test si dichiarano saltati col motivo.
 *
 * ⛔⛔ REGISTRO-01 — «Come è stato costruito», la sezione che manca.
 *
 * Una ricerca approfondita dura minuti e costa crediti. Alla fine la persona
 * legge un rapporto e una percentuale e deve decidere se fidarsi SENZA aver
 * visto niente di quello che è successo in mezzo. Il numero dei passi e la loro
 * durata sono l'unica cosa che distingue una ricerca che ha davvero letto le
 * pagine da una che ha guardato quattro estratti.
 */

const { modulo, motivo: salta } = await caricaOppureSalta('../../src/research/ledger.mjs');
const { talosResearchLedger } = modulo ?? {};

const T0 = '2026-08-20T10:00:00.000Z';

function passo(over = {}) {
  return {
    id: 's1',
    branchId: 'b1',
    kind: 'search',
    state: 'done',
    attempts: 1,
    startedAt: T0,
    finishedAt: '2026-08-20T10:00:03.000Z',
    spend: {},
    resultRef: null,
    error: null,
    ...over,
  };
}

/*
 * ⛔⛔ LE PROVE, non i tipi di passo — e questo test è nato da un errore di chi
 * ha scritto il modulo.
 *
 * La prima versione contava `kind === 'read'` e `kind === 'verify'`, e sul Pad
 * il 2026-08-20 ha scritto «3 passi · 2 ricerche · 0 pagine lette · 0 verifiche»
 * sotto un rapporto al 100% verificato da un giudice. MISURATO subito dopo: il
 * runtime emette SOLO `search` e `synthesise`; lettura e verifica avvengono
 * DENTRO quei due passi.
 */
test('REGISTRO-01 conta le ricerche dai passi, e le letture dalle FONTI', { skip: salta }, () => {
  const registro = talosResearchLedger(
    [
      passo({ kind: 'search' }),
      passo({ id: 's2', kind: 'synthesise' }),
    ],
    {
      sources: [{ obtained: 'page' }, { obtained: 'page' }, { obtained: 'snippet' }],
      claims: [{ checks: { judge: 'local:qwen3' } }, { checks: { judge: null } }],
    },
  );

  assert.equal(registro.summary.search, 1);
  assert.equal(registro.summary.synthesise, 1);
  // Due pagine aperte davvero; il terzo è un estratto e non conta.
  assert.equal(registro.summary.read, 2);
  // Una affermazione guardata da un giudice, una no.
  assert.equal(registro.summary.verify, 1);
});

test('REGISTRO-02 ⛔ e senza prove non inventa: zero, non il numero dei passi', { skip: salta }, () => {
  const registro = talosResearchLedger([
    passo({ kind: 'search' }),
    passo({ id: 's2', kind: 'search' }),
  ]);

  assert.equal(registro.summary.read, 0);
  assert.equal(registro.summary.verify, 0);
  assert.equal(registro.summary.search, 2);
});

test('REGISTRO-03 ⛔ i passi FALLITI si contano a parte: un lavoro incompleto va detto', { skip: salta }, () => {
  const registro = talosResearchLedger([
    passo(),
    passo({ id: 's2', state: 'failed', error: 'timeout' }),
    passo({ id: 's3', state: 'interrupted' }),
  ]);

  assert.equal(registro.summary.failed, 1);
  assert.equal(registro.summary.interrupted, 1);
  assert.equal(registro.summary.total, 3);
});

test('REGISTRO-04 somma il tempo davvero speso, non quello dall’inizio alla fine', { skip: salta }, () => {
  // ⛔ Due passi da 3 s partiti insieme fanno 6 s di lavoro, non 3 di orologio:
  // la persona vuole sapere quanto è costato, non quanto ha aspettato — quello
  // lo sa già.
  const registro = talosResearchLedger([
    passo({ startedAt: T0, finishedAt: '2026-08-20T10:00:03.000Z' }),
    passo({ id: 's2', startedAt: T0, finishedAt: '2026-08-20T10:00:03.000Z' }),
  ]);

  assert.equal(registro.summary.workedSeconds, 6);
});

test('REGISTRO-05 ogni riga porta il tipo, l’esito e la durata leggibile', { skip: salta }, () => {
  const [riga] = talosResearchLedger([
    passo({ kind: 'read', startedAt: T0, finishedAt: '2026-08-20T10:01:07.000Z' }),
  ]).entries;

  assert.equal(riga.kind, 'read');
  assert.equal(riga.state, 'done');
  assert.equal(riga.duration, '1 min 07 s');
});

test('REGISTRO-06 ⛔ un passo ancora in corso non inventa una durata', { skip: salta }, () => {
  const [riga] = talosResearchLedger([
    passo({ state: 'running', finishedAt: null }),
  ]).entries;

  assert.equal(riga.duration, null);
});

test('REGISTRO-07 ⛔ un passo RIPETUTO lo dichiara: due tentativi non sono un tentativo', { skip: salta }, () => {
  const [riga] = talosResearchLedger([passo({ attempts: 3 })]).entries;
  assert.equal(riga.attempts, 3);
});

test('REGISTRO-08 il motivo di un fallimento arriva alla riga, non resta nel registro', { skip: salta }, () => {
  const [riga] = talosResearchLedger([
    passo({ state: 'failed', error: 'la pagina ha risposto 403' }),
  ]).entries;

  assert.equal(riga.error, 'la pagina ha risposto 403');
});

test('REGISTRO-09 ⛔ e al contrario: nessun passo fa un registro VUOTO, non uno finto', { skip: salta }, () => {
  const registro = talosResearchLedger([]);
  assert.equal(registro.entries.length, 0);
  assert.equal(registro.summary.total, 0);
  assert.equal(registro.summary.workedSeconds, 0);
});

test('REGISTRO-10 l’ordine è quello in cui sono avvenuti, non quello degli identificativi', { skip: salta }, () => {
  const registro = talosResearchLedger([
    passo({ id: 'z', startedAt: '2026-08-20T10:00:10.000Z', finishedAt: '2026-08-20T10:00:11.000Z' }),
    passo({ id: 'a', startedAt: T0, finishedAt: '2026-08-20T10:00:01.000Z' }),
  ]);

  assert.deepEqual(registro.entries.map((entry) => entry.id), ['a', 'z']);
});
