/*
 * ⭐⭐⭐ /goal, fase G1 (owner 14/10/2026: «Sì, parti dal server») — LA MACCHINA A STATI DELL'OBIETTIVO, da sola.
 *
 * `src/obiettivo/stato.mjs` è pura: niente disco, niente orologio. Queste prove la tengono ferma nei due versi — ogni gesto
 * che deve riuscire riesce, e ogni gesto che non deve è un rifiuto col suo motivo, mai un sì per approssimazione.
 * Da dove vengono le regole (letto nel codice e alla fonte il 12-14/10/2026): Codex `thread.rs:799-830` (uno per conversazione,
 * «bloccato» distinto dalla pausa, riprende solo la persona), Hermes `goals.py:419` (`paused_reason`), Claude Code `docs/en/goal`
 * (4.000 caratteri). Il passo in più è nostro: dopo un riavvio l'attivo torna in pausa e lo dice.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DETTAGLIO_MASSIMO, SCHEMA_OBIETTIVO, STATI_OBIETTIVO, TESTO_MASSIMO,
  alRipristino, mettiInPausa, nuovoObiettivo, obiettivoDalGiornale, obiettivoValido, rigaObiettivo, riprendi,
} from '../src/obiettivo/stato.mjs';

const T0 = '2026-10-14T10:00:00.000Z';
const T1 = '2026-10-14T10:05:00.000Z';
const ID = 'ob-11111111-2222-4333-8444-555555555555';
const ID2 = 'ob-99999999-2222-4333-8444-555555555555';
const nuovo = (testo = 'all tests in tests/auth pass and lint is clean', id = ID) => nuovoObiettivo({ testo, id, adesso: T0 }).obiettivo;
/** Uno stato a cui in G1 non porta nessun gesto (lo scriverà il ciclo): costruito a mano, nella forma valida. */
const fermo = (stato, motivo) => ({ ...nuovo(), stato, motivo: motivo ?? null, revisione: 4, aggiornatoAlle: T0 });

test('GOAL-STATE-01 — a new goal is active, at revision 1, with the text trimmed and no reason', () => {
  const esito = nuovoObiettivo({ testo: '  make the suite green  ', id: ID, adesso: T0 });
  assert.equal(esito.ok, true);
  assert.deepEqual(esito.obiettivo, {
    schema: SCHEMA_OBIETTIVO, id: ID, testo: 'make the suite green', stato: 'attivo', motivo: null,
    creatoAlle: T0, aggiornatoAlle: T0, revisione: 1,
  });
  assert.equal(obiettivoValido(esito.obiettivo), true);
});

test('GOAL-STATE-02 — AL CONTRARIO: an empty text or one over the limit is refused with its reason; the limit counts characters, not UTF-16 units', () => {
  for (const testo of ['', '   ', '\n\t', null, undefined, 42, {}]) {
    assert.deepEqual(nuovoObiettivo({ testo, id: ID, adesso: T0 }), { ok: false, motivo: 'goal-text-empty' }, JSON.stringify(testo));
  }
  assert.equal(nuovoObiettivo({ testo: 'a'.repeat(TESTO_MASSIMO), id: ID, adesso: T0 }).ok, true, 'exactly the limit is allowed');
  assert.deepEqual(nuovoObiettivo({ testo: 'a'.repeat(TESTO_MASSIMO + 1), id: ID, adesso: T0 }), { ok: false, motivo: 'goal-text-too-long' });
  // un carattere fuori dal piano di base occupa due unità UTF-16: 4.000 di loro sono 4.000 caratteri, non 8.000
  assert.equal('😀'.length, 2);
  assert.equal(nuovoObiettivo({ testo: '😀'.repeat(TESTO_MASSIMO), id: ID, adesso: T0 }).ok, true);
  assert.equal(nuovoObiettivo({ testo: '😀'.repeat(TESTO_MASSIMO + 1), id: ID, adesso: T0 }).motivo, 'goal-text-too-long');
  // gli spazi ai bordi non contano: si tolgono prima di misurare
  assert.equal(nuovoObiettivo({ testo: `  ${'a'.repeat(TESTO_MASSIMO)}  `, id: ID, adesso: T0 }).ok, true);
});

test('GOAL-STATE-03 — pausing an active goal: paused, with who paused it, one revision later, and the goal passed in is not touched', () => {
  const prima = nuovo();
  const copia = structuredClone(prima);
  const esito = mettiInPausa(prima, { tipo: 'persona', adesso: T1 });
  assert.equal(esito.ok, true);
  assert.equal(esito.invariato, undefined);
  assert.deepEqual(esito.obiettivo, { ...prima, stato: 'in-pausa', motivo: { tipo: 'persona' }, aggiornatoAlle: T1, revisione: 2 });
  assert.equal(esito.obiettivo.creatoAlle, T0, 'the creation time never moves');
  assert.deepEqual(prima, copia, 'the machine never mutates its input');
  assert.equal(obiettivoValido(esito.obiettivo), true);
});

test('GOAL-STATE-04 — pausing twice changes nothing (the first reason stays); AL CONTRARIO: nothing but an active goal can be paused', () => {
  const dalRiavvio = alRipristino(nuovo(), { adesso: T1 });
  const secondo = mettiInPausa(dalRiavvio, { tipo: 'persona', adesso: '2026-10-14T11:00:00.000Z' });
  assert.equal(secondo.ok, true);
  assert.equal(secondo.invariato, true);
  assert.equal(secondo.obiettivo, dalRiavvio, 'the very same object: no new revision, no new time');
  assert.deepEqual(secondo.obiettivo.motivo, { tipo: 'riavvio' }, 'a later Pause does not rewrite why it was paused');

  assert.deepEqual(mettiInPausa(null, { adesso: T1 }), { ok: false, motivo: 'goal-not-set' });
  for (const [stato, motivo] of [['bloccato', { tipo: 'stesso-blocco' }], ['tetto', { tipo: 'giri' }], ['fatto', null]]) {
    assert.deepEqual(mettiInPausa(fermo(stato, motivo), { adesso: T1 }), { ok: false, motivo: 'goal-not-active' }, stato);
  }
});

test('GOAL-STATE-05 — resuming: from paused and from blocked the goal is active again and the reason is gone; AL CONTRARIO: not from the limit, not from done, not without a goal', () => {
  const inPausa = mettiInPausa(nuovo(), { adesso: T0 }).obiettivo;
  const ripreso = riprendi(inPausa, { adesso: T1 });
  assert.deepEqual(ripreso, { ok: true, obiettivo: { ...inPausa, stato: 'attivo', motivo: null, aggiornatoAlle: T1, revisione: 3 } });

  const bloccato = fermo('bloccato', { tipo: 'stesso-blocco', dettaglio: 'the key is missing' });
  const sbloccato = riprendi(bloccato, { adesso: T1 });
  assert.equal(sbloccato.obiettivo.stato, 'attivo');
  assert.equal(sbloccato.obiettivo.motivo, null);
  assert.equal(sbloccato.obiettivo.revisione, 5);

  const attivo = nuovo();
  const gia = riprendi(attivo, { adesso: T1 });
  assert.equal(gia.invariato, true);
  assert.equal(gia.obiettivo, attivo);

  assert.deepEqual(riprendi(fermo('tetto', { tipo: 'giri' }), { adesso: T1 }), { ok: false, motivo: 'goal-cap-reached' });
  assert.deepEqual(riprendi(fermo('fatto'), { adesso: T1 }), { ok: false, motivo: 'goal-already-done' });
  assert.deepEqual(riprendi(null, { adesso: T1 }), { ok: false, motivo: 'goal-not-set' });
});

test('GOAL-STATE-06 — after a restart the ACTIVE goal comes back paused and says so; AL CONTRARIO: every other state comes back exactly as it was', () => {
  const attivo = nuovo();
  assert.deepEqual(alRipristino(attivo, { adesso: T1 }), { ...attivo, stato: 'in-pausa', motivo: { tipo: 'riavvio' }, aggiornatoAlle: T1, revisione: 2 });
  const altri = [
    mettiInPausa(nuovo(), { adesso: T0 }).obiettivo,
    fermo('bloccato', { tipo: 'stesso-blocco' }), fermo('tetto', { tipo: 'token' }), fermo('fatto'),
  ];
  assert.deepEqual(altri.map((o) => o.stato), STATI_OBIETTIVO.filter((s) => s !== 'attivo'), 'premise: every state but the active one is covered');
  for (const obiettivo of altri) assert.equal(alRipristino(obiettivo, { adesso: T1 }), obiettivo, `${obiettivo.stato} is returned untouched`);
  assert.equal(alRipristino(null, { adesso: T1 }), null);
  assert.equal(alRipristino(undefined, { adesso: T1 }), null);
});

test('GOAL-STATE-07 — on the journal the LAST goal row decides: a newer goal replaces the old one, a removal removes it, other rows do not count', () => {
  const a = nuovo('first goal');
  const aInPausa = mettiInPausa(a, { adesso: T1 }).obiettivo;
  const b = nuovo('second goal', ID2);
  const altre = [{ tipo: 'intestazione' }, { type: 'RunStarted' }, { tipo: 'coda', voci: [] }, null, 'x'];
  assert.deepEqual(obiettivoDalGiornale([]), { obiettivo: null, illeggibile: false });
  assert.deepEqual(obiettivoDalGiornale(altre), { obiettivo: null, illeggibile: false });
  assert.deepEqual(obiettivoDalGiornale([...altre, rigaObiettivo(a)]).obiettivo, a);
  assert.deepEqual(obiettivoDalGiornale([rigaObiettivo(a), ...altre, rigaObiettivo(aInPausa)]).obiettivo, aInPausa);
  assert.deepEqual(obiettivoDalGiornale([rigaObiettivo(a), rigaObiettivo(aInPausa), rigaObiettivo(b), ...altre]).obiettivo, b);
  assert.deepEqual(obiettivoDalGiornale([rigaObiettivo(a), rigaObiettivo(null)]), { obiettivo: null, illeggibile: false });
  assert.deepEqual(obiettivoDalGiornale([rigaObiettivo(a), rigaObiettivo(null), rigaObiettivo(b)]).obiettivo, b);
  assert.deepEqual(obiettivoDalGiornale(undefined), { obiettivo: null, illeggibile: false });
});

test('GOAL-STATE-08 — AL CONTRARIO: when the last row cannot be read there is NO goal — an older one never comes back to life', () => {
  const buono = nuovo();
  const rotti = [
    {}, 'attivo', 7, [],
    { ...buono, schema: 'talos.obiettivo.v2' },
    { ...buono, stato: 'sospeso' },
    { ...buono, motivo: { tipo: 'persona' } }, // attivo con un motivo vecchio
    { ...buono, stato: 'in-pausa', motivo: null }, // fermo senza dire perché
    { ...buono, stato: 'bloccato' },
    { ...buono, stato: 'in-pausa', motivo: { tipo: 'Persona' } },
    { ...buono, stato: 'in-pausa', motivo: { tipo: 'persona', dettaglio: 'x'.repeat(DETTAGLIO_MASSIMO + 1) } },
    { ...buono, revisione: 0 }, { ...buono, revisione: 1.5 },
    { ...buono, testo: '' }, { ...buono, testo: 'a'.repeat(TESTO_MASSIMO + 1) },
    { ...buono, id: 'x' }, { ...buono, creatoAlle: 'ieri' }, { ...buono, aggiornatoAlle: undefined },
  ];
  for (const rotto of rotti) {
    assert.equal(obiettivoValido(rotto), false, JSON.stringify(rotto).slice(0, 80));
    assert.deepEqual(obiettivoDalGiornale([rigaObiettivo(buono), { tipo: 'obiettivo', obiettivo: rotto }]), { obiettivo: null, illeggibile: true },
      `the valid goal before a broken row must not win: ${JSON.stringify(rotto).slice(0, 60)}`);
  }
  // una riga `obiettivo` senza il campo: non è «tolto» (che è `null`), è illeggibile
  assert.deepEqual(obiettivoDalGiornale([rigaObiettivo(buono), { tipo: 'obiettivo' }]), { obiettivo: null, illeggibile: true });
});

test('GOAL-STATE-09 — fields this version does not know are carried along: read from the journal and through every step (two versions read the same archive)', () => {
  // `verdetti` e `giri` oggi non esistono: li scriverà il ciclo. (Il `contratto` invece è noto dalla G2 e ha le sue prove.)
  const diDomani = { ...nuovo(), verdetti: { criteri: [{ id: 'c1', esito: 'provato' }] }, giri: 3 };
  assert.equal(obiettivoValido(diDomani), true, 'extra fields do not make a goal invalid');
  const riga = { tipo: 'obiettivo', obiettivo: diDomani };
  const letto = obiettivoDalGiornale([riga]).obiettivo;
  assert.deepEqual(letto, diDomani);
  assert.notEqual(letto, diDomani, 'a copy: memory and the row do not share an object');
  letto.verdetti.criteri.push('x');
  assert.equal(riga.obiettivo.verdetti.criteri.length, 1, 'a deep copy: changing memory does not change the row');
  const inPausa = mettiInPausa(obiettivoDalGiornale([riga]).obiettivo, { adesso: T1 }).obiettivo;
  assert.deepEqual(inPausa.verdetti, diDomani.verdetti);
  assert.equal(inPausa.giri, 3);
  assert.deepEqual(riprendi(inPausa, { adesso: T1 }).obiettivo.verdetti, diDomani.verdetti);
  assert.equal(alRipristino(diDomani, { adesso: T1 }).giri, 3);
});

test('GOAL-STATE-10 — the journal row: a valid goal or «removed»; AL CONTRARIO: an invalid goal is never written', () => {
  const buono = nuovo();
  assert.deepEqual(rigaObiettivo(buono), { tipo: 'obiettivo', obiettivo: buono });
  assert.deepEqual(rigaObiettivo(null), { tipo: 'obiettivo', obiettivo: null });
  for (const rotto of [undefined, {}, { ...buono, stato: 'sospeso' }, { ...buono, revisione: 0 }]) {
    assert.throws(() => rigaObiettivo(rotto), TypeError);
  }
});

test('GOAL-STATE-11 — the reason of a pause: its detail is trimmed and capped, an empty one is dropped; AL CONTRARIO: a malformed kind is a programming error', () => {
  const conDettaglio = mettiInPausa(nuovo(), { tipo: 'persona', dettaglio: `  ${'d'.repeat(DETTAGLIO_MASSIMO + 50)}  `, adesso: T1 }).obiettivo;
  assert.equal([...conDettaglio.motivo.dettaglio].length, DETTAGLIO_MASSIMO);
  assert.equal(obiettivoValido(conDettaglio), true);
  assert.deepEqual(mettiInPausa(nuovo(), { tipo: 'persona', dettaglio: '   ', adesso: T1 }).obiettivo.motivo, { tipo: 'persona' });
  assert.deepEqual(mettiInPausa(nuovo(), { adesso: T1 }).obiettivo.motivo, { tipo: 'persona' }, 'the person is the default');
  for (const tipo of ['', 'Persona', 'due parole', '-x', 'x'.repeat(41), 7]) {
    assert.throws(() => mettiInPausa(nuovo(), { tipo, adesso: T1 }), TypeError, String(tipo));
  }
  assert.throws(() => nuovoObiettivo({ testo: 'x', id: 'non-un-id', adesso: T0 }), TypeError);
  assert.throws(() => nuovoObiettivo({ testo: 'x', id: ID, adesso: 'mai' }), TypeError);
});
