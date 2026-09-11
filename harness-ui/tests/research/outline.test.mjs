import test from 'node:test';
import assert from 'node:assert/strict';
import { caricaOppureSalta } from './_dipendenza-in-corso.mjs';

/*
 * TRADOTTO da AVM/mobile/tests/unit/research/researchOutline.test.ts (vitest → node:test).
 * Stessi casi, stesso ordine, stesse attese.
 *
 * ⛔ `outline.mjs` importa `run.mjs`, che porta l'altra sessione di L3: finché
 * non è sul disco questi test si dichiarano saltati col motivo, invece di
 * esplodere con un rosso che non parla del codice che devono provare.
 *
 * Il documento prima che esista. La ricerca visiva del 2026-08-03 chiedeva che
 * cosa si disegna nel primo mezzo secondo, e ha trovato che nessuno dei cinque
 * prodotti documenta quel momento. La risposta qui è che la forma la sappiamo
 * già: il piano è stato approvato prima che si spendesse un centesimo, e i suoi
 * rami sono le sezioni del rapporto.
 */

const { modulo, motivo: salta } = await caricaOppureSalta('../../src/research/outline.mjs');
const { talosResearchDuration, talosResearchElapsedSeconds, talosResearchOutline } = modulo ?? {};

function step(over) {
  return {
    id: 'b1:search',
    branchId: 'b1',
    kind: 'search',
    state: 'done',
    attempts: 1,
    startedAt: '2026-08-03T10:00:00.000Z',
    finishedAt: '2026-08-03T10:01:00.000Z',
    spend: { tokens: 0, searches: 0, pages: 0 },
    resultRef: null,
    error: null,
    ...over,
  };
}

function run(patch = {}) {
  return {
    id: 'run-1',
    sessionId: 'chat-1',
    question: 'chi ha inventato la moka',
    depth: 'quick',
    engine: 'device',
    status: 'collecting',
    title: null,
    plan: [
      { id: 'b1', question: 'chi la brevettò', estimate: { tokens: 1, searches: 1, pages: 1 } },
      { id: 'b2', question: 'in che anno', estimate: { tokens: 1, searches: 1, pages: 1 } },
    ],
    steps: [],
    startedAt: '2026-08-03T10:00:00.000Z',
    updatedAt: '2026-08-03T10:00:00.000Z',
    ...patch,
  };
}

test('OUTLINE-01 è il piano, nell’ordine del piano, dal primo fotogramma', { skip: salta }, () => {
  // Non è girato niente. C'è ancora un documento da disegnare, e non gli serve
  // né disco né rete — che è il motivo per cui il primo fotogramma non può
  // essere in ritardo.
  assert.deepEqual(talosResearchOutline(run()), [
    { id: 'b1', question: 'chi la brevettò', state: 'pending' },
    { id: 'b2', question: 'in che anno', state: 'pending' },
  ]);
});

test('OUTLINE-02 tiene una sezione non ancora partita, invece di nasconderla', { skip: salta }, () => {
  // Nasconderle farebbe sembrare che il documento cresca dal nulla, e toglierebbe
  // l'unica cosa che il lettore può giudicare presto: l'ampiezza.
  const parziale = talosResearchOutline(run({
    steps: [step({ id: 'b1:search', branchId: 'b1', state: 'running' })],
  }));
  assert.deepEqual(parziale.map((sezione) => sezione.state), ['running', 'pending']);
});

test('OUTLINE-03 mostra una sezione fallita come fallita, non come mancante', { skip: salta }, () => {
  const rotta = talosResearchOutline(run({
    steps: [step({ id: 'b1:search', branchId: 'b1', state: 'failed', error: 'rete assente' })],
  }));
  assert.equal(rotta[0].state, 'failed');
});

test('OUTLINE-04 misura dalla corsa, mai da quando si è aperta una schermata', { skip: salta }, () => {
  // Una ricerca la si guarda da più posti e sopravvive a tutti. Una durata
  // posseduta da un componente riparte ogni volta che qualcuno guarda.
  const viva = run({ startedAt: '2026-08-03T10:00:00.000Z' });
  assert.equal(talosResearchElapsedSeconds(viva, '2026-08-03T10:04:08.000Z'), 248);
});

test('OUTLINE-05 si ferma quando la corsa si è fermata, e non continua a contare', { skip: salta }, () => {
  const finita = run({
    status: 'done',
    startedAt: '2026-08-03T10:00:00.000Z',
    updatedAt: '2026-08-03T10:02:00.000Z',
    steps: [step({ finishedAt: '2026-08-03T10:02:00.000Z' })],
  });
  // Due ore dopo legge ancora due minuti.
  assert.equal(talosResearchElapsedSeconds(finita, '2026-08-03T12:00:00.000Z'), 120);
});

test('OUTLINE-06 misura fino all’ultimo passo, non all’ultima volta che si è scritto qualcosa', { skip: salta }, () => {
  // `updatedAt` viene timbrato da ogni evento che il giornale accetta, e una
  // rinomina è uno di quelli. Una ricerca conclusa in due minuti ieri e
  // ribattezzata oggi leggerebbe come se avesse pensato per un giorno.
  const rinominata = run({
    status: 'done',
    title: 'La moka',
    startedAt: '2026-08-03T10:00:00.000Z',
    steps: [
      step({ finishedAt: '2026-08-03T10:01:00.000Z' }),
      step({ id: 'b2:search', branchId: 'b2', finishedAt: '2026-08-03T10:02:00.000Z' }),
    ],
    updatedAt: '2026-08-04T18:30:00.000Z',
  });
  assert.equal(talosResearchElapsedSeconds(rinominata, '2026-08-04T19:00:00.000Z'), 120);
});

test('OUTLINE-07 ripiega sul giornale quando non è mai finito niente', { skip: salta }, () => {
  // Annullata prima che il primo passo riportasse: non c'è risposta migliore, e
  // zero sarebbe una bugia su una corsa che la macchina l'ha occupata davvero.
  const nataMorta = run({
    status: 'cancelled',
    startedAt: '2026-08-03T10:00:00.000Z',
    updatedAt: '2026-08-03T10:00:30.000Z',
    steps: [step({ state: 'failed', finishedAt: null })],
  });
  assert.equal(talosResearchElapsedSeconds(nataMorta, '2026-08-03T12:00:00.000Z'), 30);
});

test('OUTLINE-08 sopravvive a una data che non sa leggere', { skip: salta }, () => {
  // Un giornale si legge da disco; una riga rotta non deve mettere NaN a schermo.
  assert.equal(talosResearchElapsedSeconds(run({ startedAt: 'boh' }), '2026-08-03T10:01:00.000Z'), 0);
});

test('OUTLINE-09 scrive una durata che una persona legge a colpo d’occhio', { skip: salta }, () => {
  assert.equal(talosResearchDuration(38), '38 s');
  assert.equal(talosResearchDuration(60), '1 min 00 s');
  // Con lo zero davanti, così la colonna non balla mentre i secondi scorrono.
  assert.equal(talosResearchDuration(248), '4 min 08 s');
});
