/*
 * Revisione del blocco del 03/11 pomeriggio, D1 (S2): il no della PERSONA arriva dal nucleo come `DECLINED. …` (decisione 44, Tester R2-R4),
 *   ma l'interfaccia conosceva solo REFUSED: la riga diventava VERDE e diceva «1 file scritto», il riassunto «1 file modificato», i Processi
 *   «Non riuscito». La forma chiedeva «Non consentito», nel colore neutro. Un punto solo lo riconosce (`esitoDettoNo`), e ogni vista lo usa:
 *   riga, riassunto dell'attività, pannello della figlia (la riga e i Processi di `app.js` hanno la loro prova nel browser).
 *   Il telefono ha già la stessa forma: DECLINED è «non eseguita», mai rosso né verde (Talos-Mobile `esitoAttrezzoR4.ts`, `nonEseguita`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { esitoDettoNo, esitoDichiaraFallimento } from '../../src/components/esito-comando.js';
import { specieAttrezzo } from '../../src/components/nomi-attrezzi.js';
import { riassuntoVoci, testoDelSegmento } from '../../src/components/attivita-segmento.js';
import { impostaEsitoRiga } from '../../src/components/conversazione.js';
import { esitoDaContenuto, riduciEventiFiglia } from '../../src/components/conversazione-figlia.js';
import { impostaLingua } from '../../src/components/lingua.js';

/* il testo vero del nucleo (`TESTO_DEL_NO`, talosHarness.mjs) con la coda di `scrivi` */
const DETTO_NO = 'DECLINED. The person said no to this. Do not ask again for it, by a card or a question, unless the person brings it up. Go on without it, or say in one line what you can do instead. Nothing was written.';
const RIFIUTO = 'REFUSED. "x" is inside a folder the person blocked. Nothing was written.';
const attrezzo = (nome, argomenti, stato = 'riuscito', extra = {}) => ({ tipo: 'tool', nome, argomenti, stato, specie: specieAttrezzo(nome), esito: extra.esito ?? '', diff: null, ...extra });

test('D1-01 un punto solo riconosce il no della persona; REFUSED e i testi qualunque no', () => {
  assert.equal(esitoDettoNo(DETTO_NO), true);
  assert.equal(esitoDettoNo(`  ${DETTO_NO}`), true);
  assert.equal(esitoDettoNo(RIFIUTO), false);
  assert.equal(esitoDettoNo('Il file dice DECLINED. dentro'), false, 'solo in testa');
  assert.equal(esitoDettoNo(null), false);
  assert.equal(esitoDichiaraFallimento('scrivi', DETTO_NO), false, 'non è un guasto');
  assert.equal(esitoDichiaraFallimento('scrivi', RIFIUTO), true, 'AL CONTRARIO: REFUSED resta un fallimento');
});

test('D1-02 la riga: pallino neutro e stato «declined», mai il verde né il rosso', () => {
  const pallino = { className: 'talos-dot' };
  const riga = { querySelector: (s) => (s === '.talos-dot' ? pallino : null), dataset: {} };
  impostaEsitoRiga(riga, 'declined');
  assert.equal(pallino.className, 'talos-dot', 'nessun tono');
  assert.equal(riga.dataset.toolState, 'declined');
  impostaEsitoRiga(riga, 'error');
  assert.equal(pallino.className, 'talos-dot talos-dot--danger', 'AL CONTRARIO: un errore resta rosso');
});

test('D1-03 il riassunto dell\'attività: «non consentito» a parte, mai «1 file scritto» né fra gli errori', () => {
  impostaLingua('it');
  try {
    const r = riassuntoVoci([attrezzo('scrivi', { percorso: 'a.txt' }, 'non-consentito', { esito: DETTO_NO }), attrezzo('leggi', { percorso: 'b.txt' })]);
    assert.equal(r.nFalliti, 0);
    assert.deepEqual(r.erroriParti, []);
    assert.ok(r.parti.includes('1 passo non consentito'), JSON.stringify(r.parti));
    assert.ok(!r.parti.some((p) => /scritt|modificat/u.test(p)), JSON.stringify(r.parti));
    assert.equal(r.bersagli.includes('a.txt'), false, 'il file non è stato toccato');
    assert.match(testoDelSegmento([attrezzo('scrivi', { percorso: 'a.txt' }, 'non-consentito')]), /\(non consentito\)$/u);
    impostaLingua('en');
    const due = riassuntoVoci([attrezzo('scrivi', {}, 'non-consentito'), attrezzo('shell', {}, 'non-consentito')]);
    assert.ok(due.parti.includes('2 steps not allowed'), JSON.stringify(due.parti));
    assert.match(testoDelSegmento([attrezzo('scrivi', {}, 'non-consentito')]), /\(not allowed\)$/u);
  } finally { impostaLingua('it'); }
});

test('D1-04 il pannello della figlia: la stessa riga neutra; AL CONTRARIO REFUSED resta rossa', () => {
  assert.equal(esitoDaContenuto('scrivi', DETTO_NO), 'declined');
  assert.equal(esitoDaContenuto('shell', DETTO_NO), 'declined');
  assert.equal(esitoDaContenuto('scrivi', RIFIUTO), 'error');
  const turno = (contenuto, extra = {}) => riduciEventiFiglia([
    { type: 'RunStarted' },
    { type: 'ToolCallStart', toolCallId: 't1', toolCallName: 'scrivi' },
    { type: 'ToolCallResult', toolCallId: 't1', content: contenuto, ...extra },
  ]);
  const blocchi = (r) => r.turni.flatMap((t) => t.blocchi).filter((b) => b.tipo === 'attrezzo');
  assert.equal(blocchi(turno(DETTO_NO))[0].esito, 'declined');
  assert.equal(blocchi(turno(DETTO_NO, { errore: true }))[0].esito, 'declined', 'anche se un ospite vecchio lo segna errore');
  assert.equal(blocchi(turno(RIFIUTO))[0].esito, 'error');
});
