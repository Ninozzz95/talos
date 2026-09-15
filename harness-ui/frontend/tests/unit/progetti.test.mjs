import test from 'node:test';
import assert from 'node:assert/strict';
import { frasiProgetto, oraCorta, progettiConSessioni, progettoDiSessione, sommarioProgetti, ultimeSessioni, QUANTE_RECENTI } from '../../src/components/progetti.js';

const sessione = (id, progetto, quando, giri = 0, dentro = 0, fuori = 0) => ({
  sessionId: id,
  taskId: progetto === null ? 'corpus:qualcosa' : `libero:${progetto}`,
  nome: `sessione ${id}`,
  avviataAlle: quando,
  usageSessione: { giri, prompt_tokens: dentro, completion_tokens: fuori },
});

test('il progetto di una sessione vive nel taskId, e un task del corpus non ne ha uno', () => {
  assert.equal(progettoDiSessione({ taskId: 'libero:default' }), 'default');
  assert.equal(progettoDiSessione({ taskId: 'libero:AVM-harness-desktop' }), 'AVM-harness-desktop');
  // ⛔ un task del corpus non appartiene a nessun progetto: si dice null invece di inventare
  assert.equal(progettoDiSessione({ taskId: 'corpus:storia' }), null);
  assert.equal(progettoDiSessione({ taskId: 'libero:' }), null, 'un id vuoto non è un progetto');
  assert.equal(progettoDiSessione({}), null);
});

test('⭐ l’ordine è per RECENCY, come in Hermes — non alfabetico', () => {
  /*
   * Letto nel codice di Hermes il 06/09/2026 (sidebar/projects/model.ts, `sessionRecency`): il
   * progetto su cui hai appena lavorato sta in cima. Ordinare per nome sembra più «pulito» ed è
   * esattamente ciò che rende inutile un elenco di progetti.
   */
  const progetti = progettiConSessioni(
    [{ id: 'alfa', nome: 'Alfa' }, { id: 'zeta', nome: 'Zeta' }],
    [sessione('s1', 'alfa', '2026-09-01T10:00:00Z'), sessione('s2', 'zeta', '2026-09-06T10:00:00Z')],
  );
  assert.deepEqual(progetti.map((p) => p.id), ['zeta', 'alfa'], 'chi ha la sessione più recente sta in cima');
});

test('somma giri e token del progetto — il nostro +1 su Hermes, che mostra solo le sessioni', () => {
  const [p] = progettiConSessioni(
    [{ id: 'uno', nome: 'Uno' }],
    [sessione('a', 'uno', '2026-09-06T10:00:00Z', 3, 1000, 200), sessione('b', 'uno', '2026-09-05T10:00:00Z', 2, 500, 100)],
  );
  assert.equal(p.quante, 2);
  assert.equal(p.giri, 5);
  assert.equal(p.token, 1800);
  assert.match(frasiProgetto(p), /2 sessioni · 5 giri · 1,8k token/u);
});

test('⛔ un progetto senza sessioni lo dice, e non mostra uno zero che sembra una misura', () => {
  const [p] = progettiConSessioni([{ id: 'nuovo', nome: 'Nuovo' }], []);
  assert.equal(p.quante, 0);
  assert.equal(frasiProgetto(p), 'nessuna sessione ancora');
  // e i numeri che non ci sono NON si scrivono
  const [q] = progettiConSessioni([{ id: 'x', nome: 'X' }], [sessione('a', 'x', '2026-09-06T10:00:00Z', 0, 0, 0)]);
  assert.equal(frasiProgetto(q), '1 sessione', 'niente «0 giri», niente «0 token»');
});

test('le sessioni di un progetto sono ordinate dalla più recente, e se ne mostrano tre', () => {
  const [p] = progettiConSessioni(
    [{ id: 'uno', nome: 'Uno' }],
    ['2026-09-01', '2026-09-06', '2026-09-03', '2026-09-05', '2026-09-02'].map((g, i) => sessione(`s${i}`, 'uno', `${g}T10:00:00Z`)),
  );
  assert.equal(QUANTE_RECENTI, 3, 'lo stesso numero di Hermes (PROJECT_PREVIEW_COUNT)');
  const recenti = ultimeSessioni(p);
  assert.equal(recenti.length, 3);
  assert.equal(recenti[0].avviataAlle.slice(0, 10), '2026-09-06', 'la più recente per prima');
  assert.equal(p.quante, 5, 'ma il totale resta vero: sotto si dice quante ne restano');
});

test('⛔ AL CONTRARIO — una sessione di un progetto SCONOSCIUTO non entra da nessuna parte', () => {
  const progetti = progettiConSessioni(
    [{ id: 'noto', nome: 'Noto' }],
    [sessione('a', 'noto', '2026-09-06T10:00:00Z'), sessione('b', 'fantasma', '2026-09-06T11:00:00Z')],
  );
  assert.equal(progetti.length, 1);
  assert.equal(progetti[0].quante, 1, 'la sessione del progetto fantasma non viene attribuita a quello noto');
});

test('il plurale italiano non si fa con una s', () => {
  assert.equal(sommarioProgetti(0), 'nessun progetto');
  assert.equal(sommarioProgetti(1), '1 progetto');
  assert.equal(sommarioProgetti(6), '6 progetti');
});

test('oraCorta: oggi l’ora, ieri «ieri», poi i giorni, poi la data', () => {
  const adesso = new Date('2026-09-06T18:30:00');
  assert.equal(oraCorta('2026-09-06T18:09:00', adesso), '18:09');
  assert.equal(oraCorta('2026-09-05T23:59:00', adesso), 'ieri');
  assert.equal(oraCorta('2026-09-04T08:00:00', adesso), '2 g');
  assert.equal(oraCorta('2026-08-20T08:00:00', adesso), '20/08');
  assert.equal(oraCorta('non-una-data', adesso), '');
});
