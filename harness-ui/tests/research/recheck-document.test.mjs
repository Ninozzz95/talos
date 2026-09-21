/*
 * ⛔ TEST SCRITTI DA ME — `researchRecheckDocument.ts` è l'unico file della mia
 * metà che nel mobile NON ha un `*.test.ts` (cercato: `tests/unit/research/`
 * ne ha venti, e quel nome non c'è). I casi qui sotto vengono dai tre impegni
 * che i commenti del sorgente dichiarano, uno per uno:
 *
 *   1. «la frase che nessun concorrente può scrivere» — la pagina è sparita E
 *      il testo è ancora qui. Compare SOLO quando c'è almeno una irraggiungibile.
 *   2. «un controllo che non lascia traccia … non si può confrontare con quello
 *      di prima» ⇒ in coda c'è il blocco recintato, e si rilegge esatto.
 *   3. «la prosa qui sopra è per una persona, e ricavarne i numeri ripassando
 *      l'italiano stampato è il modo in cui una misura diventa un'invenzione»
 *      ⇒ i numeri della prosa e quelli del blocco devono coincidere.
 *
 * Più il caso limite che il commento sul `filter` nomina: «la riga bianca prima
 * del blocco va dentro la stringa, se no prosa e recinto si toccano».
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { talosResearchRecheckDocument } from '../../src/research/recheck-document.mjs';
import { talosResearchParseRecheckBlock } from '../../src/research/recheck-history.mjs';

/**
 * @param {Partial<import('../../src/research/recheck.mjs').TalosResearchSourceRecheck>} over
 * @returns {import('../../src/research/recheck.mjs').TalosResearchSourceRecheck}
 */
function fonte(over) {
  return {
    url: 'https://a.example',
    title: 'A',
    state: 'intact',
    survived: 1,
    reason: null,
    passagesStanding: 2,
    passagesLost: 0,
    ...over,
  };
}

/** @type {import('../../src/research/recheck.mjs').TalosResearchRecheck} */
const TUTTO_BENE = {
  at: '2027-01-01T00:00:00.000Z',
  sources: [fonte({}), fonte({ url: 'https://b.example', title: 'B' })],
};

/** @type {import('../../src/research/recheck.mjs').TalosResearchRecheck} */
const MISTO = {
  at: '2027-01-01T00:00:00.000Z',
  sources: [
    fonte({}),
    fonte({ url: 'https://b.example', title: 'B', state: 'changed', survived: 0.6, passagesStanding: 1, passagesLost: 1 }),
    fonte({ url: 'https://c.example', title: 'C', state: 'unreachable', survived: null, reason: '403', passagesStanding: 0, passagesLost: 0 }),
  ],
};

test('la prosa dice i conti, e li dice giusti', () => {
  const documento = talosResearchRecheckDocument('quanto è alto il Monte Bianco', MISTO, 'run-9');

  assert.ok(documento.startsWith('# Ricontrollo — quanto è alto il Monte Bianco'));
  assert.ok(documento.includes('Data del ricontrollo: 2027-01-01T00:00:00.000Z'));
  assert.ok(documento.includes('Fonti ricontrollate: 3'));
  assert.ok(documento.includes('- intatte: 1'));
  assert.ok(documento.includes('- cambiate dal giorno della ricerca: 1'));
  assert.ok(documento.includes('- non rispondono più: 1'));
  // Il motivo dell'irraggiungibile arriva fino alla riga della fonte: senza,
  // «non risponde più» non dice se è un 403, un timeout o una pagina sparita.
  assert.ok(documento.includes('non risponde più (403)'));
  // La percentuale è quella tenuta, arrotondata — non un numero vicino.
  assert.ok(documento.includes('cambiata (60% del testo di allora è ancora lì)'));
});

test('⛔ la frase sulle fonti sparite esce SOLO quando ce n\'è una', () => {
  // «La pagina è sparita E il testo è ancora qui»: è la frase che nessun
  // concorrente può scrivere, e stamparla su un ricontrollo dove tutto risponde
  // sarebbe vantarsi di un salvataggio che non è servito a nessuno.
  assert.ok(talosResearchRecheckDocument('q', MISTO, 'r').includes('restano leggibili qui'));
  assert.ok(!talosResearchRecheckDocument('q', TUTTO_BENE, 'r').includes('restano leggibili qui'));
});

test('⛔ e AL CONTRARIO: i passaggi persi si dichiarano in grassetto, o si dichiara che non ce ne sono', () => {
  // Il silenzio non è un esito: un ricontrollo che non dice niente sui passaggi
  // si legge come uno che non li ha guardati.
  assert.ok(talosResearchRecheckDocument('q', MISTO, 'r').includes('**1 passaggi citati non sono più nella loro fonte.**'));
  assert.ok(talosResearchRecheckDocument('q', TUTTO_BENE, 'r').includes('Tutti i passaggi citati sono ancora nelle loro fonti.'));
});

test('in coda c\'è il blocco, e i suoi numeri sono quelli della prosa', () => {
  const documento = talosResearchRecheckDocument('q', MISTO, 'run-9');

  const letto = talosResearchParseRecheckBlock(documento);
  assert.notEqual(letto, null);
  assert.equal(letto.runId, 'run-9');
  assert.equal(letto.at, '2027-01-01T00:00:00.000Z');
  assert.equal(letto.total, 3);
  assert.equal(letto.intact, 1);
  assert.equal(letto.changed, 1);
  assert.equal(letto.unreachable, 1);
  // 2 (intatta) + 1 (cambiata) reggono, 1 perso ⇒ 3 su 4.
  assert.equal(letto.passagesStanding, 3);
  assert.equal(letto.passagesLost, 1);
  assert.ok(Math.abs(letto.tenuta - 0.75) < 1e-5);
});

test('⛔ prosa e recinto non si toccano: prima del blocco c\'è una riga bianca', () => {
  // Il commento del sorgente lo dichiara come il motivo per cui la riga vuota
  // sta DENTRO la stringa invece che essere una voce dell'elenco: il `filter`
  // toglierebbe una voce vuota, e il recinto finirebbe attaccato all'ultima
  // riga della prosa — dove un lettore Markdown lo tratta come testo.
  const righe = talosResearchRecheckDocument('q', MISTO, 'r').split('\n');
  const apre = righe.indexOf('```talos-research-recheck');

  assert.ok(apre > 0);
  assert.equal(righe[apre - 1], '');
});

test('⛔ un ricontrollo senza fonti resta un documento, non una pagina vuota', () => {
  const documento = talosResearchRecheckDocument('q', { at: '2027-01-01T00:00:00.000Z', sources: [] }, 'r');

  assert.ok(documento.includes('Fonti ricontrollate: 0'));
  assert.ok(documento.includes('## Fonte per fonte'));
  // E il blocco c'è lo stesso, con la tenuta IGNOTA: zero passaggi controllati
  // non è «non regge più niente».
  assert.equal(talosResearchParseRecheckBlock(documento)?.tenuta, null);
});
