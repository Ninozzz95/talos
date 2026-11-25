import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { impostaLingua } from '../../src/components/lingua.js';
import * as nota from '../../src/components/nota-riga-in-attesa.js';
import { documento as documentoDeiBlocchi } from './aiuto-dom-blocchi.mjs';
import testiServer from '../../src/i18n/testi/server.js';

/*
 * 21/11/2026 — OTTAVO GIRO DEL SALVATAGGIO DELLE CHAT, la pagina (candidata PC 0.2.5).
 *   · Difetto 3 (revisore 2 del giro 7, forma cw): la chat va fra le pronte mentre la riga aspetta, la riga si salva, la chat torna con
 *     `?after=` e il server non rimanda niente per quella riga ⇒ la nota diceva ancora «aspetta di essere salvata» con la riga già
 *     salvata (30 su 30). Ora, quando una chat pronta torna, le sue note «aspetta» se ne vanno; quelle delle righe che aspettano ancora le
 *     rimanda il server all'iscrizione (`iscriviti`), le altre restano via. Una nota «salvata» resta.
 *   · Difetto 1: la stessa nota «aspetta» cambia frase sul posto quando il disco prende la riga (prima «il disco non l'ha presa»,
 *     poi «resta su questo computer»). Nessuna nota nuova, nessuna carta: la nota del salvataggio che la conversazione ha già.
 */
function documento() {
  const doc = documentoDeiBlocchi();
  const proto = Object.getPrototypeOf(doc.body);
  if (!('lastElementChild' in proto)) Object.defineProperty(proto, 'lastElementChild', { get() { return this.children.at(-1) ?? null; } });
  return doc;
}
const EN = testiServer.en;
const attesa = (id, chiave = 'lateLineWaiting') => ({ id, stato: 'in-attesa', message: EN[`sessionPersistence.${chiave}`], messageChiave: `server.sessionPersistence.${chiave}` });
const salvata = (id, sequenza = 9) => ({ id, stato: 'adottata', sequenza, message: EN['sessionPersistence.lateLineAdded'], messageChiave: 'server.sessionPersistence.lateLineAdded' });

test('G8-UI-01 (RED before) the waiting note changes its sentence in place when the disk takes the line: «not on the disk» → «kept on this computer»; a saved note is never taken back', () => {
  try {
    impostaLingua('en');
    const doc = documento();
    const colonna = doc.createElement('div');
    const n = nota.aggiornaNotaRigaInAttesa(colonna, attesa('d-1', 'lateLineWaitingNotOnDisk'), { document: doc });
    assert.ok(n.textContent.includes(EN['sessionPersistence.lateLineWaitingNotOnDisk']), n.textContent);
    assert.equal(nota.aggiornaNotaRigaInAttesa(colonna, attesa('d-1'), { document: doc }), n, 'the same note');
    assert.equal(colonna.children.length, 1);
    assert.ok(n.textContent.includes(EN['sessionPersistence.lateLineWaiting']), `now it is on the disk: ${n.textContent}`);
    assert.ok(!n.textContent.includes(EN['sessionPersistence.lateLineWaitingNotOnDisk']), 'and no longer that it is not');
    nota.aggiornaNotaRigaInAttesa(colonna, salvata('d-1'), { document: doc });
    nota.aggiornaNotaRigaInAttesa(colonna, attesa('d-1', 'lateLineWaitingNotOnDisk'), { document: doc });
    assert.equal(n.dataset.statoRiga, 'adottata', 'a late waiting note does not take the saved one back');
    assert.ok(n.textContent.includes(EN['sessionPersistence.lateLineAdded']));
  } finally { impostaLingua('it'); }
});

test('G8-UI-01b the Italian page says the «not on the disk» sentence in Italian', () => {
  try {
    impostaLingua('it');
    const doc = documento();
    const colonna = doc.createElement('div');
    const n = nota.aggiornaNotaRigaInAttesa(colonna, attesa('d-2', 'lateLineWaitingNotOnDisk'), { document: doc });
    assert.ok(n.textContent.includes(testiServer.it['sessionPersistence.lateLineWaitingNotOnDisk']), n.textContent);
  } finally { impostaLingua('it'); }
});

test('G8-UI-02 (RED before) [rev-aff7-2 cw] 30 returns of a ready chat whose line was saved while it was parked: 0 notes still saying «waiting»', () => {
  try {
    impostaLingua('en');
    const doc = documento();
    let false_ = 0;
    for (let k = 0; k < 30; k += 1) {
      const colonna = doc.createElement('div');
      nota.aggiornaNotaRigaInAttesa(colonna, attesa(`c-${k}`), { document: doc }); // la riga aspetta, la nota è a schermo
      const frammento = doc.createElement('div'); // la chat va fra le pronte: la sua colonna si porta via com'è
      frammento.append(...colonna.children);
      // … la riga si salva mentre la chat è parcheggiata: nessuno ascolta, e il ritorno con `?after=` non rimanda niente per lei
      const tornata = doc.createElement('div');
      tornata.append(...frammento.children);
      nota.togliNoteInAttesa(tornata); // ciò che fa `rimettiChatPronta`
      if ([...tornata.querySelectorAll('[data-riga-in-attesa]')].some((n) => n.dataset.statoRiga === 'in-attesa')) false_ += 1;
    }
    assert.equal(false_, 0, `notes still saying «waiting» after the return: ${false_} of 30`);
  } finally { impostaLingua('it'); }
});

test('G8-UI-02b leaving the notes that the server sends again: a line that still waits gets its note back once, a saved note stays', () => {
  try {
    impostaLingua('en');
    const doc = documento();
    const colonna = doc.createElement('div');
    nota.aggiornaNotaRigaInAttesa(colonna, attesa('w-1'), { document: doc });
    nota.aggiornaNotaRigaInAttesa(colonna, attesa('w-2'), { document: doc });
    nota.aggiornaNotaRigaInAttesa(colonna, salvata('w-2'), { document: doc });
    const altra = doc.createElement('p'); colonna.append(altra); // il resto della chat non si tocca
    assert.equal(nota.togliNoteInAttesa(colonna), 1, 'one waiting note removed');
    assert.deepEqual([...colonna.querySelectorAll('[data-riga-in-attesa]')].map((n) => `${n.dataset.rigaInAttesa}:${n.dataset.statoRiga}`), ['w-2:adottata'], 'the saved note stays');
    assert.ok(altra.parentNode === colonna, 'nothing else removed');
    nota.aggiornaNotaRigaInAttesa(colonna, attesa('w-1'), { document: doc }); // `iscriviti` la rimanda: la riga aspetta ancora
    assert.equal(colonna.querySelectorAll('[data-riga-in-attesa]').length, 2, 'back once');
  } finally { impostaLingua('it'); }
});

test('G8-UI-03 (RED before) the page does it: `rimettiChatPronta` takes the waiting notes away right after it puts the parked column back', () => {
  const sorgente = readFileSync(fileURLToPath(new URL('../../src/legacy/app.js', import.meta.url)), 'utf8');
  const inizio = sorgente.indexOf('  function rimettiChatPronta(voce) {');
  assert.ok(inizio > 0, 'premise: the function is in app.js');
  const corpo = sorgente.slice(inizio, sorgente.indexOf('\n  }\n', inizio));
  const rimessa = corpo.indexOf('colonna.replaceChildren(voce.frammento);');
  const tolte = corpo.indexOf('togliNoteInAttesa(colonna)');
  assert.ok(rimessa > 0 && tolte > rimessa, 'after the column is back');
  assert.match(sorgente, /import \{[^}]*togliNoteInAttesa[^}]*\} from '\.\.\/components\/nota-riga-in-attesa\.js'/u, 'imported from the note module');
});

test('G8-UI-04 (RED before) the saved note never promises a place, in English and in Italian', () => {
  assert.doesNotMatch(EN['sessionPersistence.lateLineAdded'], /\bend\b/iu);
  assert.doesNotMatch(testiServer.it['sessionPersistence.lateLineAdded'], /in fondo/iu);
});
