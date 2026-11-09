/*
 * Revisione del blocco del 03/11 pomeriggio, R1: la bozza non inviata nella scheda (`components/bozze-salvate.js`). Il percorso intero, con
 *   la caduta del renderer, sta nel browser (`chat-files-workspace.spec.mjs`, CHAT-FILES-BOZZA-*); qui le regole della fotografia.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CHIAVE_BOZZE_SALVATE, fotografiaBozze, leggiBozze, scriviBozze } from '../../src/components/bozze-salvate.js';

const ID = 'b'.repeat(24);
const PC = 'C:\\Users\\Mario'; // un percorso del PC col nome utente
const FILE = { tipo: 'file', nome: 'n1.txt', bytes: 6, byte: 6, allegatoId: ID, percorso: `attachments/${ID}/n1.txt` };
function schedaFinta({ piena = false } = {}) {
  const dati = new Map();
  return {
    dati,
    getItem: (k) => (dati.has(k) ? dati.get(k) : null),
    setItem: (k, v) => { if (piena) throw Object.assign(new Error('quota'), { name: 'QuotaExceededError' }); dati.set(k, String(v)); },
    removeItem: (k) => { dati.delete(k); },
  };
}

test('R1B-01 la fotografia è le bozze parcheggiate più il campo della chat aperta, senza toccare quelle in memoria', () => {
  const bozze = new Map([['sessione:b', { testo: 'di B', allegati: [] }]]);
  const f = fotografiaBozze(bozze, { chiave: 'sessione:a', testo: 'ciao', allegati: [FILE] });
  assert.deepEqual(f.voci.map(([k, b]) => [k, b.testo, b.allegati.length]), [['sessione:b', 'di B', 0], ['sessione:a', 'ciao', 1]]);
  assert.deepEqual([...bozze.keys()], ['sessione:b'], 'la memoria resta com\'era');
  assert.equal(fotografiaBozze(new Map(), { chiave: 'sessione:a', testo: '  ', allegati: [] }), null, 'un campo vuoto non è una bozza');
  assert.equal(fotografiaBozze(new Map([['sessione:c', { testo: ' ', allegati: [{ nome: 'a metà' }] }]]), null), null, 'nemmeno una bozza rimasta senza niente da rimettere');
  assert.equal(fotografiaBozze(new Map([['sessione:a', { testo: 'x', allegati: [] }]]), null, 2).voci.length, 1);
});

test('R1B-02 inviata, riscritta, non torna: la fotografia senza la bozza toglie la voce dalla scheda', () => {
  const scheda = schedaFinta();
  assert.equal(scriviBozze(scheda, fotografiaBozze(new Map(), { chiave: 'sessione:a', testo: 'ciao', allegati: [FILE] })), true);
  assert.equal(leggiBozze(scheda).length, 1);
  assert.equal(scriviBozze(scheda, fotografiaBozze(new Map(), { chiave: 'sessione:a', testo: '', allegati: [] })), true);
  assert.equal(scheda.getItem(CHIAVE_BOZZE_SALVATE), null);
  assert.deepEqual(leggiBozze(scheda), []);
});

test('R1B-03 una voce rovinata cade da sola, e una scheda che non c\'è non rompe niente', () => {
  const scheda = schedaFinta();
  scheda.setItem(CHIAVE_BOZZE_SALVATE, '{rotto');
  assert.deepEqual(leggiBozze(scheda), []);
  assert.deepEqual(leggiBozze(null), []);
  assert.equal(scriviBozze(null, null), false);
});

/* R1a: con lo spazio della scheda pieno `setItem` lancia. Prima restava la fotografia VECCHIA, e una bozza già inviata tornava alla ricarica. */
test('R1A-01 una scrittura che non riesce toglie la fotografia vecchia: meglio nessuna bozza che una bozza falsa', () => {
  const scheda = schedaFinta();
  scriviBozze(scheda, fotografiaBozze(new Map(), { chiave: 'sessione:a', testo: 'ciao già inviato', allegati: [] }));
  assert.equal(leggiBozze(scheda).length, 1, 'premessa: la fotografia vecchia c\'è');
  const piena = { ...scheda, setItem: () => { throw Object.assign(new Error('quota'), { name: 'QuotaExceededError' }); } };
  assert.equal(scriviBozze(piena, fotografiaBozze(new Map(), { chiave: 'sessione:b', testo: 'pagina enorme', allegati: [] })), true, 'la scheda ora dice il vero');
  assert.deepEqual(leggiBozze(scheda), [], '«ciao già inviato» non torna');
  /* AL CONTRARIO: una scheda che non si lascia nemmeno pulire dice di no, e non lancia */
  const rotta = { getItem: () => null, setItem: () => { throw new Error('x'); }, removeItem: () => { throw new Error('y'); } };
  assert.equal(scriviBozze(rotta, { version: 1, voci: [] }), false);
});

/* R1c: nella scheda finivano il testo intero dei file e delle pagine, e i percorsi col nome utente (anche nella chiave di una cartella libera).
   Electron tiene lo sessionStorage anche sul disco. Ora si salva solo ciò che serve a rimettere l'allegato. */
test('R1C-01 nella scheda niente testo dei file, niente percorsi del PC: solo i campi che rimettono l\'allegato', async () => {
  const { allegatoDaSalvare } = await import('../../src/components/bozze-salvate.js');
  const conTesto = { ...FILE, contenuto: 'SEGRETO-DEL-FILE', caratteri: 16, costoIgnoto: false, assoluto: `${PC}\\AppData\\Roaming\\TALOS\\x\\n1.txt` };
  const s = allegatoDaSalvare(conTesto);
  assert.equal(s.contenuto, undefined);
  assert.equal(s.assoluto, undefined);
  assert.deepEqual([s.allegatoId, s.percorso, s.nome, s.caratteri, s.costoIgnoto], [ID, `attachments/${ID}/n1.txt`, 'n1.txt', 16, true], 'senza il testo il costo non è più quello misurato');
  assert.equal(allegatoDaSalvare({ tipo: 'file', nome: 'x', percorso: `${PC}\\x` }), null, 'un percorso del PC senza riferimento non si rimette');
  assert.equal(allegatoDaSalvare({ ...FILE, percorso: `${PC}\\x` }).percorso, undefined, 'il riferimento sì, il percorso del PC no');
  const immagine = allegatoDaSalvare({ id: 'c'.repeat(64), tipo: 'immagine', nome: 'g.png', url: `/api/v1/chat-images/${'c'.repeat(64)}`, byte: 9, larghezza: 2, altezza: 3, dataUrl: 'data:image/png;base64,AAAA' });
  assert.deepEqual(immagine, { id: 'c'.repeat(64), tipo: 'immagine', nome: 'g.png', byte: 9, larghezza: 2, altezza: 3, url: `/api/v1/chat-images/${'c'.repeat(64)}` });
  const pagina = allegatoDaSalvare({ tipo: 'testo', nome: 'Pagina aperta: x', percorso: 'https://esempio.it/a', caratteri: 900, contenuto: 'TESTO-DELLA-PAGINA', daBrowser: true });
  assert.deepEqual(pagina, { tipo: 'testo', nome: 'Pagina aperta: x', caratteri: 900, daBrowser: true, percorso: 'https://esempio.it/a' }, 'la pagina per indirizzo: il testo si rilegge dal server');
  const scheda = schedaFinta();
  scriviBozze(scheda, fotografiaBozze(new Map(), { chiave: 'sessione:a', testo: 'x', allegati: [conTesto] }));
  const scritto = scheda.getItem(CHIAVE_BOZZE_SALVATE);
  assert.doesNotMatch(scritto, /SEGRETO-DEL-FILE|Mario|C:\\/u);
});

test('R1C-02 la chiave di una cartella libera non porta il percorso, ed è la stessa per la stessa cartella', async () => {
  const { chiaveDiCartella } = await import('../../src/components/bozze-salvate.js');
  const k = chiaveDiCartella(`${PC}\\Desktop\\progetto`);
  assert.match(k, /^cartella:[0-9a-z]+$/u);
  assert.doesNotMatch(k, /Mario|Desktop/u);
  assert.equal(chiaveDiCartella(`${PC}\\Desktop\\progetto`), k);
  assert.notEqual(chiaveDiCartella(`${PC}\\Desktop\\altro`), k);
  assert.notEqual(chiaveDiCartella(`${PC}\\Desktop\\progetta`), k, 'stessa lunghezza, cartella diversa');
});

test('R1C-03 la fotografia di prima (col testo dei file e i percorsi) si toglie alla prima lettura, e non si rilegge', async () => {
  const { CHIAVI_BOZZE_VECCHIE } = await import('../../src/components/bozze-salvate.js');
  const scheda = schedaFinta();
  scheda.setItem(CHIAVI_BOZZE_VECCHIE[0], JSON.stringify({ version: 1, voci: [[`cartella:${PC}\\p`, { testo: 'x', allegati: [{ ...FILE, contenuto: 'SEGRETO' }] }]] }));
  assert.deepEqual(leggiBozze(scheda), []);
  assert.equal(scheda.getItem(CHIAVI_BOZZE_VECCHIE[0]), null);
  /* AL CONTRARIO: la fotografia nuova si rilegge, coi suoi campi */
  scriviBozze(scheda, fotografiaBozze(new Map(), { chiave: 'sessione:a', testo: 'ciao', allegati: [FILE] }));
  assert.deepEqual(leggiBozze(scheda).map(([k, b]) => [k, b.testo, b.allegati[0].allegatoId]), [['sessione:a', 'ciao', ID]]);
  /* e anche una voce nuova scritta da altri con campi in più si rilegge solo nella sua forma */
  scheda.setItem(CHIAVE_BOZZE_SALVATE, JSON.stringify({ version: 2, voci: [['sessione:a', { testo: 'x', allegati: [{ ...FILE, contenuto: 'SEGRETO' }] }]] }));
  assert.equal(leggiBozze(scheda)[0][1].allegati[0].contenuto, undefined);
});
