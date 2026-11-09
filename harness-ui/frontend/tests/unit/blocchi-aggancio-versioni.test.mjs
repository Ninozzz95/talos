/*
 * G-B3 (FE-081, scenes 1+4, 06/11/2026), UIG-1.15-1.18: the names and versions of the blocks in the PC chat. The v1 event binds the
 * name `bN` to the shell of its message (live and after a reload); a later version redraws that shell in place, its history rebuilt
 * only from the events; a version made on screen (view, back to v1) is saved with ONE call and no turn; if saving fails the version stays
 * on screen and one toast says so.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { documento, orologio, voceDelMenu } from './aiuto-dom-blocchi.mjs';
import { creaAggancioBlocchi, impronta, EVENTO_VERSIONE_DEL_BLOCCO } from '../../src/components/blocchi/aggancio.js';
import { impostaLingua, t } from '../../src/components/lingua.js';
import { leggi } from '../../../src/blocchi/lettore.mjs';
import { scriviSorgente } from '../../../src/blocchi/versioni.mjs';

impostaLingua('it');
const BARRE = readFileSync(new URL('../../../tests/fixtures/blocchi/02-grafico.txt', import.meta.url), 'utf8').trim().replace('"linee"', '"barre"');
const BARRE_V2 = BARRE.replace('y: 14', 'y: 16');

let seq = 0;
const evento = (value) => ({ type: 'CUSTOM', name: EVENTO_VERSIONE_DEL_BLOCCO, value, _sequenza: ++seq });
const v1 = (blocco, sorgente, extra = {}) => evento({ conversazione: 's1', messaggio: 'm1', posizione: 0, blocco, versione: 1, sorgente, impronta: impronta(sorgente), cosaECambiato: '', origine: 'modello', ...extra });
const v2 = (blocco, sorgente, extra = {}) => evento({ conversazione: 's1', messaggio: 'm1', blocco, versione: 2, sorgente, cosaECambiato: 'Marzo a 16', origine: 'modello', ...extra });

function scena(extra = {}) {
  const document = documento();
  const messaggi = new Map();
  const salvati = [];
  const avvisi = [];
  const a = creaAggancioBlocchi({
    document, sessione: () => 's1', consegna: () => {}, timer: orologio().timer,
    elementoDelMessaggio: (id) => messaggi.get(id) ?? null,
    salvaVersione: (valore) => { salvati.push(valore); return Promise.resolve({ ok: true }); },
    avvisa: (testo) => avvisi.push(testo),
    ...extra,
  });
  /* a message with its blocks, drawn as the chat draws them */
  const messaggio = (id, ...testi) => {
    const art = document.createElement('article');
    for (const testo of testi) art.append(a.blocco(testo, true));
    document.body.append(art);
    messaggi.set(id, art);
    return [...art.querySelectorAll('section')].filter((s) => s.classList.contains('gu'));
  };
  return { a, document, messaggio, salvati, avvisi };
}
const etichetta = (nodo) => nodo.querySelector('.gu__versione')?.textContent ?? '';
const attesa = () => new Promise((r) => setImmediate(r));

test('UIG-1.15 the v1 binds the name to the shell of its message: dataset.nome, and the same text twice gets two names', () => {
  const { a, messaggio } = scena();
  const [primo, secondo] = messaggio('m1', BARRE, BARRE);
  assert.equal(primo.dataset.nome, undefined, 'no name before the event');
  assert.equal(a.aggiornaVersione(v1('b1', BARRE, { posizione: 0 })), true);
  assert.equal(a.aggiornaVersione(v1('b2', BARRE, { posizione: 1 })), true);
  assert.equal(primo.dataset.nome, 'b1');
  assert.equal(secondo.dataset.nome, 'b2', 'same text, two fences, two names');
});

test('UIG-1.15 after a reload the events may come first: the name waits for its shell', () => {
  const { a, messaggio } = scena();
  a.aggiornaVersione(v1('b3', BARRE, { messaggio: 'm9' }));
  const [nodo] = messaggio('m-altro', BARRE);
  assert.equal(nodo.dataset.nome, 'b3');
});

test('UIG-1.15 the name stamped in the fence (`nome=b4`) reaches the shell live, closed or streaming; a later v1 binds the same shell', () => {
  const { a, document } = scena();
  const chiuso = a.blocco(BARRE, true, 'talos-blocco nome=b4');
  assert.equal(chiuso.dataset.nome, 'b4');
  const vivo = a.blocco(BARRE.slice(0, 20), false, 'talos-blocco nome=b5');
  const finito = a.blocco(BARRE, true, 'talos-blocco nome=b5');
  assert.equal(finito, vivo, 'same node while it streams');
  assert.equal(finito.dataset.nome, 'b5');
  for (const info of ['talos-blocco', 'talos-blocco nome=x1', 'talos-blocco nome=b0', 'talos-blocco nomeb3']) {
    assert.notEqual(a.blocco(BARRE, true, info).dataset.nome?.startsWith('b'), true, info);
  }
  const art = document.createElement('article');
  art.append(chiuso);
  a.aggiornaVersione(v1('b4', BARRE, { messaggio: 'nessuno' }));
  a.aggiornaVersione(v2('b4', BARRE_V2));
  assert.match(etichetta(chiuso), /v2/u, 'the v1 found the shell by its fence name');
});

test('UIG-1.16 a v2 from the model redraws the named shell in place, with the label and the Versions list; the same _sequenza does nothing', () => {
  const { a, messaggio } = scena();
  const [nodo] = messaggio('m1', BARRE);
  a.aggiornaVersione(v1('b1', BARRE));
  const ev = v2('b1', BARRE_V2);
  assert.equal(a.aggiornaVersione(ev), true);
  assert.equal(nodo.dataset.nome, 'b1', 'same shell');
  assert.match(etichetta(nodo), /v2/u);
  assert.match(etichetta(nodo), /Marzo a 16/u);
  assert.equal(nodo.__storico.voci.length, 2);
  assert.equal(leggi(nodo.__storico.voci[1].sorgente).stato, 'completo');
  assert.equal(a.aggiornaVersione(ev), false, 'duplicate _sequenza');
  assert.equal(a.aggiornaVersione({ ...ev, _sequenza: 999 }), false, 'same (name, version) twice');
  const v3 = { ...v2('b1', BARRE.replace('y: 14', 'y: 18')), _sequenza: ev._sequenza };
  v3.value = { ...v3.value, versione: 3 };
  assert.equal(a.aggiornaVersione(v3), false, 'a _sequenza already seen does nothing, whatever it carries');
  assert.equal(a.aggiornaVersione({ ...v3, _sequenza: 1000 }), true);
  assert.deepEqual(nodo.__storico.voci.map((x) => x.versione), [1, 2, 3], 'the duplicates left no trace in the history');
  assert.ok(voceDelMenu(nodo, 'versioni'), 'the Versions entry is there');
});

test('UIG-1.17 reload: the history is rebuilt from the events only (v1 + v2 replayed in order)', () => {
  const { a, messaggio } = scena();
  const [nodo] = messaggio('m1', BARRE);
  a.aggiornaVersione(v1('b1', BARRE));
  a.aggiornaVersione(v2('b1', BARRE_V2));
  a.azzera();
  const [rinato] = messaggio('m1', BARRE);
  a.aggiornaVersione(v1('b1', BARRE));
  a.aggiornaVersione(v2('b1', BARRE_V2));
  assert.equal(rinato.__storico.voci.length, 2);
  assert.match(etichetta(rinato), /v2/u);
  assert.notEqual(rinato, nodo);
});

test('UIG-1.18 «Barre ↔ Tabella» on a named block: one save call with origin vista, no toast; the echo does not redraw', async () => {
  const { a, messaggio, salvati, avvisi } = scena();
  const [nodo] = messaggio('m1', BARRE);
  a.aggiornaVersione(v1('b1', BARRE));
  const tasto = voceDelMenu(nodo, 'vista');
  assert.ok(tasto, 'bars have another view');
  tasto.dispatchEvent(new Event('click', { bubbles: true }));
  await attesa();
  assert.equal(salvati.length, 1);
  assert.equal(salvati[0].blocco, 'b1');
  assert.equal(salvati[0].versione, 2);
  assert.equal(salvati[0].origine, 'vista');
  assert.equal(salvati[0].messaggio, 'm1');
  assert.equal(nodo.dataset.tipo, 'tabella');
  assert.deepEqual(avvisi, []);
  /* the server echoes the saved event: nothing changes on screen */
  assert.equal(a.aggiornaVersione(evento(salvati[0])), false);
  assert.equal(nodo.dataset.tipo, 'tabella');
  /* back to v1 */
  voceDelMenu(nodo, 'torna').dispatchEvent(new Event('click', { bubbles: true }));
  await attesa();
  assert.equal(salvati.length, 2);
  assert.equal(salvati[1].origine, 'ritorno');
  assert.equal(salvati[1].aVersione, 1);
  assert.equal(nodo.dataset.tipo, 'grafico');
});

test('UIG-1.18 the save fails: the version stays on screen, one toast with the shared text', async () => {
  for (const salvaVersione of [() => Promise.resolve({ ok: false }), () => Promise.reject(new Error('rete')), () => { throw new Error('sync'); }]) {
    const { a, messaggio, avvisi } = scena({ salvaVersione });
    const [nodo] = messaggio('m1', BARRE);
    a.aggiornaVersione(v1('b1', BARRE));
    voceDelMenu(nodo, 'vista').dispatchEvent(new Event('click', { bubbles: true }));
    await attesa();
    assert.equal(nodo.dataset.tipo, 'tabella', 'the version stays');
    assert.deepEqual(avvisi, [t('blocchi.versions.saveFailed')]);
  }
});

test('UIG-1.18 an unnamed block (no v1 event, a local model) never calls the save', async () => {
  const { messaggio, salvati } = scena();
  const [nodo] = messaggio('m1', BARRE);
  voceDelMenu(nodo, 'vista').dispatchEvent(new Event('click', { bubbles: true }));
  await attesa();
  assert.equal(nodo.dataset.tipo, 'tabella');
  assert.equal(salvati.length, 0);
});

test('G-B3 a v1 that does not read, or an event of another name, does nothing and never throws', () => {
  const { a, messaggio } = scena();
  const [nodo] = messaggio('m1', BARRE);
  assert.equal(a.aggiornaVersione(v1('b1', 'root = Grafico(')), false);
  assert.equal(a.aggiornaVersione({ type: 'CUSTOM', name: 'altro', value: {} }), false);
  assert.equal(a.aggiornaVersione(v1('x1', BARRE)), false);
  assert.equal(a.aggiornaVersione(null), false);
  assert.equal(nodo.dataset.nome, undefined);
  assert.equal(typeof scriviSorgente, 'function');
});

// ---- G-B4 (06/11/2026): one number per version (UIG-1.20), the bounded sequence set (D), and the B3 survivors as tests ----

test('G-B4 UIG-1.20 a 409 with the next number: the client re-sends ONCE with it and relabels its local version, no toast', async () => {
  const risposte = [{ ok: false, prossima: 3 }, { ok: true }];
  const salvati = [];
  const { a, messaggio, avvisi } = scena({ salvaVersione: (valore) => { salvati.push(valore); return Promise.resolve(risposte.shift()); } });
  const [nodo] = messaggio('m1', BARRE);
  a.aggiornaVersione(v1('b1', BARRE));
  voceDelMenu(nodo, 'vista').dispatchEvent(new Event('click', { bubbles: true }));
  await attesa(); await attesa();
  assert.deepEqual(salvati.map((x) => x.versione), [2, 3], 'one re-send, with the number the server gave');
  assert.equal(salvati[1].sorgente, salvati[0].sorgente, 'the same version, only renumbered');
  assert.deepEqual(avvisi, []);
  assert.equal(nodo.dataset.tipo, 'tabella', 'the version stays on screen');
  assert.deepEqual(nodo.__storico.voci.map((x) => x.versione), [1, 3], 'relabelled: the screen says v3, as the journal will');
  assert.match(etichetta(nodo), /v3/u);
  /* the echo of the saved v3 changes nothing */
  assert.equal(a.aggiornaVersione(evento(salvati[1])), false);
  assert.equal(nodo.dataset.tipo, 'tabella');
});

test('G-B4 UIG-1.20 the re-send is ONE: a second 409, or a failure after it, gives one toast and no third call', async () => {
  for (const seconda of [{ ok: false, prossima: 4 }, { ok: false }]) {
    const risposte = [{ ok: false, prossima: 3 }, seconda];
    const salvati = [];
    const { a, messaggio, avvisi } = scena({ salvaVersione: (valore) => { salvati.push(valore); return Promise.resolve(risposte.shift() ?? { ok: true }); } });
    const [nodo] = messaggio('m1', BARRE);
    a.aggiornaVersione(v1('b1', BARRE));
    voceDelMenu(nodo, 'vista').dispatchEvent(new Event('click', { bubbles: true }));
    await attesa(); await attesa(); await attesa();
    assert.equal(salvati.length, 2, JSON.stringify(seconda));
    assert.deepEqual(avvisi, [t('blocchi.versions.saveFailed')]);
    assert.equal(nodo.dataset.tipo, 'tabella', 'the version stays');
  }
});

test('G-B4 UIG-1.20 live: the screen shows a local v2, a model v2 with ANOTHER source arrives — the screen shows the model one', async () => {
  const { a, messaggio } = scena({ salvaVersione: () => new Promise(() => {}) }); // the save is still in flight
  const [nodo] = messaggio('m1', BARRE);
  a.aggiornaVersione(v1('b1', BARRE));
  voceDelMenu(nodo, 'vista').dispatchEvent(new Event('click', { bubbles: true }));
  await attesa();
  assert.equal(nodo.dataset.tipo, 'tabella');
  assert.equal(a.aggiornaVersione(v2('b1', BARRE_V2)), true, 'same number, other source: it is not the one on screen');
  assert.equal(nodo.dataset.tipo, 'grafico');
  assert.match(etichetta(nodo), /Marzo a 16/u);
  assert.equal(nodo.__storico.voci.at(-1).sorgente, BARRE_V2);
});

test('G-B4 D the set of seen sequences is bounded: past 2000 the oldest goes out', () => {
  const { a, messaggio } = scena();
  messaggio('m1', BARRE);
  /* a v3 seen before its name exists: it does nothing, but its _sequenza is now seen */
  const presto = evento({ conversazione: 's1', messaggio: 'm1', blocco: 'b1', versione: 3, sorgente: BARRE.replace('y: 14', 'y: 18'), cosaECambiato: 'Marzo a 18', origine: 'modello' });
  assert.equal(a.aggiornaVersione(presto), false);
  a.aggiornaVersione(v1('b1', BARRE));
  a.aggiornaVersione(v2('b1', BARRE_V2));
  const vuoto = () => ({ type: 'CUSTOM', name: EVENTO_VERSIONE_DEL_BLOCCO, value: null, _sequenza: ++seq });
  for (let i = 0; i < 1997; i++) a.aggiornaVersione(vuoto()); // with v1 and v2: 1999 sequences after it, 2000 in the set
  assert.equal(a.aggiornaVersione(presto), false, '2000 seen: the oldest is still there');
  a.aggiornaVersione(vuoto());
  assert.equal(a.aggiornaVersione(presto), true, 'the 2001st pushed the oldest out');
});

test('G-B4 a10 the same text twice, the v1 of b2 arrives BEFORE the v1 of b1: each lands on its own shell by message + position', () => {
  const { a, messaggio } = scena();
  const [primo, secondo] = messaggio('m1', BARRE, BARRE);
  a.aggiornaVersione(v1('b2', BARRE, { posizione: 1 }));
  a.aggiornaVersione(v1('b1', BARRE, { posizione: 0 }));
  assert.equal(secondo.dataset.nome, 'b2');
  assert.equal(primo.dataset.nome, 'b1');
});

test('G-B4 a3 a shell whose fence carries nome=b2 does not take a waiting b1 with the same text', () => {
  const { a, document } = scena();
  a.aggiornaVersione(v1('b1', BARRE, { messaggio: 'nessuno' })); // waits for its shell
  const conNome = a.blocco(BARRE, true, 'talos-blocco nome=b2');
  document.body.append(conNome);
  const libero = a.blocco(BARRE, true);
  document.body.append(libero);
  a.aggiornaVersione(v2('b1', BARRE_V2));
  assert.match(etichetta(libero), /v2/u, 'b1 went to the shell with no name');
  assert.doesNotMatch(etichetta(conNome), /v2/u, 'the b2 shell kept its own name');
});

test('G-B4 a5 a shell with its own name does not bind to the only other name with that text', () => {
  const { a, messaggio, document } = scena();
  const [nodo] = messaggio('m1', BARRE);
  a.aggiornaVersione(v1('b1', BARRE));
  const conNome = a.blocco(BARRE, true, 'talos-blocco nome=b2');
  document.body.append(conNome);
  a.aggiornaVersione(v2('b1', BARRE_V2));
  assert.match(etichetta(nodo), /v2/u);
  assert.doesNotMatch(etichetta(conNome), /v2/u, 'b2 is not b1');
});

test('G-B4 a9 a fence nome=bN whose name is already known binds at once, with no v1 replayed', () => {
  const { a, messaggio, document } = scena();
  messaggio('m1', BARRE);
  a.aggiornaVersione(v1('b1', BARRE));
  a.aggiornaVersione(v2('b1', BARRE_V2));
  const ridisegnato = a.blocco(BARRE, true, 'talos-blocco nome=b1'); // the message redrawn: a new shell with the stamped name
  document.body.append(ridisegnato);
  assert.match(etichetta(ridisegnato), /v2/u, 'it shows the known history at once');
  assert.equal(ridisegnato.__storico.voci.length, 2);
});

test('G-B4 a11 a live block whose name comes only in the final info keeps it when it closes (two names wait with the same text)', () => {
  const { a } = scena();
  a.aggiornaVersione(v1('b5', BARRE, { messaggio: 'nessuno' }));
  a.aggiornaVersione(v1('b6', BARRE, { messaggio: 'nessuno' }));
  const vivo = a.blocco(BARRE.slice(0, 20), false, 'talos-blocco');
  const finito = a.blocco(BARRE, true, 'talos-blocco nome=b6');
  assert.equal(finito, vivo, 'same node');
  assert.equal(finito.dataset.nome, 'b6', 'the name of the final info, not the first one waiting with that text');
  a.aggiornaVersione(v2('b6', BARRE_V2));
  assert.match(etichetta(finito), /v2/u);
});

test('G-B4 a7 a model version redrawn on screen is never POSTed back', async () => {
  const { a, messaggio, salvati } = scena();
  const [nodo] = messaggio('m1', BARRE);
  a.aggiornaVersione(v1('b1', BARRE));
  a.aggiornaVersione(v2('b1', BARRE_V2));
  const v3 = v2('b1', BARRE.replace('y: 14', 'y: 18'));
  v3.value = { ...v3.value, versione: 3, origine: 'ritorno', aVersione: 1 };
  a.aggiornaVersione(v3);
  await attesa();
  assert.match(etichetta(nodo), /v3/u);
  assert.equal(salvati.length, 0, 'what came from the journal is not saved again');
});

/* G-BG2 (06/11/2026), UIG-1.25 (q4): the 409 of a save answers late, after the screen has already moved to another version. The re-send
   still goes (once), but the relabel is for the version it was about: it never renumbers the version the screen shows now. */
test('G-BG2 UIG-1.25 a late 409 for v2 never relabels the version the screen moved to (a local v3, or a model v2 with another source)', async () => {
  /* (1) the screen went back to v1 (a local v3 «ritorno») while the save of v2 was in flight */
  let rispondi;
  const salvati = [];
  const { a, messaggio, avvisi } = scena({ salvaVersione: (valore) => {
    salvati.push(valore);
    if (salvati.length === 1) return new Promise((r) => { rispondi = r; });
    return Promise.resolve({ ok: true });
  } });
  const [nodo] = messaggio('m1', BARRE);
  a.aggiornaVersione(v1('b1', BARRE));
  voceDelMenu(nodo, 'vista').dispatchEvent(new Event('click', { bubbles: true }));
  await attesa();
  voceDelMenu(nodo, 'torna').dispatchEvent(new Event('click', { bubbles: true }));
  await attesa();
  assert.deepEqual(nodo.__storico.voci.map((x) => x.versione), [1, 2, 3], 'premise: the screen is on a local v3');
  rispondi({ ok: false, prossima: 4 });
  await attesa(); await attesa(); await attesa();
  assert.deepEqual(salvati.map((x) => [x.versione, x.origine]), [[2, 'vista'], [3, 'ritorno'], [4, 'vista']], 'the late v2 is re-sent ONCE, as 4');
  assert.deepEqual(nodo.__storico.voci.map((x) => x.versione), [1, 2, 3], 'the v3 on screen keeps its number');
  assert.match(etichetta(nodo), /v3/u);
  assert.equal(nodo.dataset.tipo, 'grafico', 'and the screen stays on what it shows');
  assert.deepEqual(avvisi, []);

  /* (2) the same number, another source: a model v2 replaced the local v2 on screen while its save was in flight */
  let rispondi2;
  const salvati2 = [];
  const due = scena({ salvaVersione: (valore) => {
    salvati2.push(valore);
    if (salvati2.length === 1) return new Promise((r) => { rispondi2 = r; });
    return Promise.resolve({ ok: true });
  } });
  const [n2] = due.messaggio('m1', BARRE);
  due.a.aggiornaVersione(v1('b1', BARRE));
  voceDelMenu(n2, 'vista').dispatchEvent(new Event('click', { bubbles: true }));
  await attesa();
  assert.equal(due.a.aggiornaVersione(v2('b1', BARRE_V2)), true, 'premise: the model v2 is on screen');
  rispondi2({ ok: false, prossima: 3 });
  await attesa(); await attesa(); await attesa();
  assert.deepEqual(salvati2.map((x) => x.versione), [2, 3]);
  assert.deepEqual(n2.__storico.voci.map((x) => [x.versione, x.sorgente === BARRE_V2]), [[1, false], [2, true]], 'the model v2 is not renumbered');
  assert.match(etichetta(n2), /Marzo a 16/u);
});
