/*
 * Owner, 03/10/2026 («Stato "non eseguito"»): nella chat una prova NON ESEGUITA — nessuna suite, oppure il comando è partito e
 * nessun test è stato eseguito (`NOT RUN:`) — era una riga rossa «non riuscito», mentre i Processi dicevano «Non eseguito».
 * Non è né un successo né un fallimento: pallino d'attenzione, «non eseguito», mai contata fra gli errori del gruppo.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { specieAttrezzo } from '../../src/components/nomi-attrezzi.js';
import { riassuntoVoci, testoDelSegmento } from '../../src/components/attivita-segmento.js';
import { impostaEsitoRiga } from '../../src/components/conversazione.js';
import { impostaLingua } from '../../src/components/lingua.js';

const attrezzo = (nome, argomenti, stato = 'riuscito', extra = {}) => ({ tipo: 'tool', nome, argomenti, stato, specie: specieAttrezzo(nome), esito: extra.esito ?? '', diff: null, ...extra });
const NON_ESEGUITA = 'NOT RUN: NO_TESTS_RAN — the test command ran and exited 0, but no tests ran: this is not a pass.';

test('PROVA-NON-ESEGUITA-01 — il gruppo la dice a parte: né fra i riusciti né fra gli errori', () => {
  impostaLingua('it');
  const r = riassuntoVoci([
    attrezzo('leggi', { percorso: 'package.json' }),
    attrezzo('prova', {}, 'non-eseguito', { esito: NON_ESEGUITA }),
  ]);
  assert.equal(r.nFalliti, 0, 'una prova non eseguita non è un errore');
  assert.deepEqual(r.erroriParti, []);
  assert.ok(r.parti.includes('1 prova non eseguita'), JSON.stringify(r.parti));
  assert.ok(!r.parti.some((p) => /test eseguit|test riuscit/u.test(p)), 'e nemmeno un successo');
  const due = riassuntoVoci([attrezzo('prova', {}, 'non-eseguito'), attrezzo('prova', {}, 'non-eseguito')]);
  assert.ok(due.parti.includes('2 prove non eseguite'), JSON.stringify(due.parti));
});

test('PROVA-NON-ESEGUITA-02 — il testo del segmento dice «non eseguito», in italiano e in inglese', () => {
  impostaLingua('it');
  assert.match(testoDelSegmento([attrezzo('prova', {}, 'non-eseguito')]), /\(non eseguito\)$/u);
  impostaLingua('en');
  try {
    assert.match(testoDelSegmento([attrezzo('prova', {}, 'non-eseguito')]), /\(not run\)$/u);
    assert.ok(riassuntoVoci([attrezzo('prova', {}, 'non-eseguito')]).parti.includes('1 test not run'));
  } finally { impostaLingua('it'); }
});

test('PROVA-NON-ESEGUITA-03 — la riga: pallino d\'attenzione e stato «not-run», mai il rosso dell\'errore', () => {
  /* una riga finta: `impostaEsitoRiga` legge solo il pallino e il dataset */
  const pallino = { className: 'talos-dot' };
  const riga = { querySelector: (s) => (s === '.talos-dot' ? pallino : null), dataset: {} };
  impostaEsitoRiga(riga, 'not-run');
  assert.equal(pallino.className, 'talos-dot talos-dot--warning');
  assert.equal(riga.dataset.toolState, 'not-run');
  impostaEsitoRiga(riga, 'error');
  assert.equal(pallino.className, 'talos-dot talos-dot--danger', 'AL CONTRARIO: un errore resta rosso');
});

test('R44-RIGA — una chiamata annullata dal kernel si conta a parte: né fra i riusciti, né fra gli errori, né come «prova»', () => {
  impostaLingua('it');
  const r = riassuntoVoci([attrezzo('scrivi', { percorso: 'a.txt' }, 'non-eseguito'), attrezzo('leggi', { percorso: 'b.txt' })]);
  assert.equal(r.nFalliti, 0);
  assert.ok(r.parti.includes('1 chiamata non eseguita'), JSON.stringify(r.parti));
  assert.ok(!r.parti.some((p) => /prova|scritt/u.test(p)), JSON.stringify(r.parti));
  assert.equal(r.bersagli.includes('a.txt'), false, 'la chiamata annullata non ha toccato il file');
  impostaLingua('en');
  try {
    assert.ok(riassuntoVoci([attrezzo('scrivi', {}, 'non-eseguito'), attrezzo('leggi', {}, 'non-eseguito')]).parti.includes('2 calls not run'));
  } finally { impostaLingua('it'); }
});

test('REV-B17-M3 — un invio annullato non conta fra gli invii; uno troppo grande sì, come deciso', () => {
  impostaLingua('it');
  const annullato = attrezzo('remote_device_send_file', {}, 'non-eseguito', {});
  annullato.annullata = true;
  assert.ok(riassuntoVoci([annullato]).parti.includes('1 chiamata non eseguita'));
  assert.equal(riassuntoVoci([attrezzo('remote_device_send_file', {}, 'non-eseguito')]).parti.includes('1 chiamata non eseguita'), false);
});
