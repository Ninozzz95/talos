/*
 * BLOCCHI-LIB-PC — decisione 142 dell'owner (04/11/2026): «Salva in Libreria» sotto un blocco vivo della chat del PC, l'avviso
 * «Salvato in Libreria» con «Apri», e il blocco riaperto dalla Libreria che torna VIVO (disegnato, non testo) e in sola lettura.
 * DOM finto (`aiuto-dom-blocchi.mjs`); la parte server sta in `harness-ui/tests/blocchi-in-libreria.test.mjs`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spento, documento, clic, voceDelMenu } from './aiuto-dom-blocchi.mjs';
import { leggi } from '../../../src/blocchi/lettore.mjs';
import { impostaLingua, t } from '../../src/components/lingua.js';
import { disegnaBlocco } from '../../src/components/blocchi/guscio.js';
import { bloccoPerIlLettore } from '../../src/components/blocchi/aggancio.js';
import { creaApriVoceDellaLibreria, creaSalvaInLibreria } from '../../src/components/blocchi/in-libreria.js';
import { creaLettore, etichettaTipo, iconaTipo, modiDelTipo } from '../../src/components/lettore/lettore.js';
import { TESTI } from '../../src/i18n/testi/index.js';

impostaLingua('it');
const FIXTURE = new URL('../../../tests/fixtures/blocchi/', import.meta.url);
const corpo = (nome) => readFileSync(new URL(`${nome}.txt`, FIXTURE), 'utf8');
const aspetta = () => new Promise((r) => setImmediate(r));

test('BLOCCHI-LIB-PC-01 il tasto «Salva in Libreria» manda il sorgente del blocco; poi dice la versione e l\'avviso apre la voce', async () => {
  const doc = documento();
  const chiamate = [];
  const avvisi = [];
  const aperte = [];
  const risposte = [
    { data: { id: 'lib-1', versione: 1, totale: 1, nome: 'Vendite per mese.txt', nuova: true } },
    { data: { id: 'lib-1', versione: 2, totale: 2, nome: 'Vendite per mese.txt', nuova: true } },
    { data: { id: 'lib-1', versione: 2, totale: 2, nome: 'Vendite per mese.txt', nuova: false } },
  ];
  const salva = creaSalvaInLibreria({
    post: async (percorso, corpoJson) => { chiamate.push([percorso, corpoJson]); return risposte[chiamate.length - 1]; },
    sessione: () => 'sess 1',
    avvisa: (titolo, messaggio, opzioni) => avvisi.push({ titolo, messaggio, opzioni }),
    apri: (id) => aperte.push(id),
  });
  const testo = corpo('01-tabella');
  const nodo = disegnaBlocco(leggi(testo), { document: doc, testo, azioni: { libreria: salva } });
  doc.body.append(nodo);
  const tasto = () => voceDelMenu(nodo, 'libreria');
  assert.equal(tasto().textContent, t('blocchi.actions.library'));
  clic(tasto());
  await aspetta();
  assert.deepEqual(chiamate[0], ['/api/v1/sessions/sess%201/blocks/library', { testo }]);
  assert.equal(tasto().textContent, 'In Libreria · v1', 'come il bozzetto approvato (pc.js:97)');
  assert.equal(tasto().disabled, false, 'si può salvare di nuovo: una versione nuova');
  assert.equal(avvisi[0].titolo, 'Salvato in Libreria');
  assert.equal(avvisi[0].opzioni.tono, 'riuscito');
  assert.equal(avvisi[0].opzioni.azione.etichetta, t('blocchi.library.open'));
  avvisi[0].opzioni.azione.esegui();
  assert.deepEqual(aperte, ['lib-1']);
  clic(tasto());
  await aspetta();
  assert.equal(tasto().textContent, 'In Libreria · v2');
  assert.match(avvisi[1].messaggio, /versione 2/u);
  clic(tasto());
  await aspetta();
  assert.equal(avvisi[2].messaggio, t('blocchi.library.savedSame', { name: 'Vendite per mese', n: 2 }), 'lo stesso testo: la versione non cambia, e lo si dice');
});

test('BLOCCHI-LIB-PC-02 AL CONTRARIO: senza conversazione niente rete; un errore del server diventa un avviso e il tasto resta com\'era', async () => {
  const doc = documento();
  const avvisi = [];
  let chiamate = 0;
  const senza = creaSalvaInLibreria({ post: async () => { chiamate += 1; }, sessione: () => '', avvisa: (...a) => avvisi.push(a), apri: () => {} });
  const testo = corpo('03-scelte');
  const nodo = disegnaBlocco(leggi(testo), { document: doc, testo, azioni: { libreria: senza } });
  doc.body.append(nodo); // R-10 (a876486c2, menu-del-blocco.js `esegui`): an entry of a shell off the page never acts
  clic(voceDelMenu(nodo, 'libreria'));
  await aspetta();
  assert.equal(chiamate, 0);
  const guasto = creaSalvaInLibreria({ post: async () => { throw Object.assign(new Error('boom'), { code: 'LIBRARY_INVALID' }); }, sessione: () => 's', avvisa: (...a) => avvisi.push(a), apri: () => {} });
  const n2 = disegnaBlocco(leggi(testo), { document: doc, testo, azioni: { libreria: guasto } });
  doc.body.append(n2);
  const tasto = () => voceDelMenu(n2, 'libreria');
  clic(tasto());
  await aspetta();
  assert.equal(tasto().textContent, t('blocchi.actions.library'));
  assert.equal(tasto().disabled, false);
  assert.equal(avvisi.at(-1)[0], t('blocchi.library.failed'));
  assert.equal(avvisi.at(-1)[2].tono, 'guasto');
});

test('BLOCCHI-LIB-PC-03 il blocco riaperto dalla Libreria è VIVO: disegnato, in sola lettura (nessun clic diventa un messaggio), senza «Salva in Libreria»', () => {
  const doc = documento();
  const lettore = bloccoPerIlLettore({ document: doc });
  assert.equal(lettore.riconosci(corpo('01-tabella')), true);
  assert.equal(lettore.riconosci('```talos-blocco\n' + corpo('03-scelte') + '\n```'), true);
  assert.equal(lettore.riconosci(corpo('26-rotto-sintassi')), false, 'un blocco rotto resta testo');
  assert.equal(lettore.riconosci('appunti della riunione'), false);
  const tabella = lettore.disegna(corpo('01-tabella'));
  assert.equal(tabella.dataset.stato, 'completo');
  assert.equal(tabella.dataset.tipo, 'tabella');
  assert.equal(tabella.querySelectorAll('tbody tr').length, 3, 'la tabella è disegnata, non testo');
  assert.equal(tabella.querySelectorAll('th button[data-ordina]').length, 2, 'e l\'ordine funziona: è viva');
  const scelte = lettore.disegna(corpo('03-scelte'));
  const tasti = scelte.querySelectorAll('button[data-scelta]');
  assert.equal(tasti.length, 2);
  assert.ok(tasti.every((b) => spento(b)), 'in Libreria un clic non ha una conversazione a cui andare');
  assert.equal(voceDelMenu(scelte, 'libreria'), null, 'in Libreria il blocco non si risalva');
  assert.equal(voceDelMenu(scelte, 'lato'), null);
  assert.ok(voceDelMenu(scelte, 'copia'), 'Copia resta');
  assert.equal(lettore.disegna('```talos-blocco\n' + corpo('01-tabella') + '\n```').dataset.stato, 'completo', 'col recinto si disegna lo stesso');
  /* AL CONTRARIO: lo stesso blocco in chat resta cliccabile */
  const inChat = disegnaBlocco(leggi(corpo('03-scelte')), { document: doc });
  assert.ok(inChat.querySelectorAll('button[data-scelta]').every((b) => !spento(b)));
});

test('BLOCCHI-LIB-PC-04 il lettore della Libreria ha il tipo «blocco»: resa e testo, etichetta e icona proprie', () => {
  assert.deepEqual(modiDelTipo('blocco'), ['resa', 'sorgente']);
  assert.equal(etichettaTipo('blocco'), t('varie.reader.kind.block'));
  assert.notEqual(etichettaTipo('blocco'), t('varie.reader.kind.file'));
  assert.notEqual(iconaTipo('blocco'), 'i-file');
});

test('BLOCCHI-LIB-PC-05 testi: inglese e italiano per ogni chiave nuova, senza trattini nelle chiavi', () => {
  const nuove = ['actions.inLibrary', 'library.saved', 'library.savedBody', 'library.savedSame', 'library.open', 'library.failed', 'library.failedBody'];
  for (const k of nuove) {
    assert.equal(typeof TESTI.en[`blocchi.${k}`], 'string', `en ${k}`);
    assert.equal(typeof TESTI.it[`blocchi.${k}`], 'string', `it ${k}`);
    assert.doesNotMatch(k, /-/u);
  }
  assert.equal(TESTI.en['blocchi.library.saved'], 'Saved to Library');
  assert.equal(TESTI.it['blocchi.library.saved'], 'Salvato in Libreria');
  assert.equal(typeof TESTI.en['varie.reader.kind.block'], 'string');
  assert.equal(typeof TESTI.it['varie.reader.kind.block'], 'string');
});

test('BLOCCHI-LIB-PC-06 il lettore della Libreria apre la voce del blocco VIVA (resa) col testo accanto; un .txt rotto o senza l\'innesto resta testo', async () => {
  const doc = documento();
  const apri = (nome, testo, opzioni) => creaLettore({ doc, finestra: globalThis, fonte: { nome, leggiByte: async () => new TextEncoder().encode(testo).buffer }, opzioni });
  const conBlocco = { blocco: bloccoPerIlLettore({ document: doc }) };
  const vivo = apri('prossimo.txt', corpo('03-scelte'), conBlocco);
  const rotto = apri('rotto.txt', corpo('26-rotto-sintassi'), conBlocco);
  const senza = apri('prossimo.txt', corpo('03-scelte'), {});
  const codice = apri('prossimo.js', corpo('03-scelte'), conBlocco);
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual([vivo.stato().tipo, vivo.stato().modo], ['blocco', 'resa']);
  assert.equal(vivo.elemento.querySelectorAll('button[data-scelta]').length, 2, 'disegnato, non testo');
  assert.ok(vivo.elemento.querySelectorAll('button[data-scelta]').every((b) => spento(b)));
  assert.deepEqual(vivo.elemento.querySelectorAll('[role="tab"]').map((b) => b.dataset.modo), ['resa', 'sorgente'], 'il «Testo» accanto, come per Markdown e HTML');
  assert.equal(rotto.stato().tipo, 'testo');
  assert.equal(senza.stato().tipo, 'testo');
  assert.equal(codice.stato().tipo, 'testo', 'solo i .txt: un sorgente .js resta codice');
});

test('BLOCCHI-LIB-PC-07 «Apri» dall\'avviso: mostra la Libreria e seleziona la voce quando arriva l\'elenco che la contiene, una volta sola', () => {
  const schermo = { id: 'schermoLibreria' };
  const stati = new Map();
  let pagine = 0;
  const v = creaApriVoceDellaLibreria({ schermo: () => schermo, statoSezione: (s) => stati.get(s) ?? null, mostraPagina: () => { pagine += 1; } });
  v.apri('lib-9');
  assert.equal(pagine, 1);
  assert.equal(v.prendiVoceInAttesa([{ id: 'lib-9' }]), false, 'la sezione non esiste ancora: aspetta');
  stati.set(schermo, { selezione: null });
  assert.equal(v.prendiVoceInAttesa([]), false, 'il disegno «caricamento» non la perde');
  assert.equal(v.prendiVoceInAttesa([{ id: 'lib-1' }]), false);
  assert.equal(stati.get(schermo).selezione, null);
  assert.equal(v.prendiVoceInAttesa([{ id: 'lib-1' }, { id: 'lib-9' }]), true);
  assert.equal(stati.get(schermo).selezione, 'lib-9');
  stati.get(schermo).selezione = 'lib-1';
  assert.equal(v.prendiVoceInAttesa([{ id: 'lib-9' }]), false, 'presa una volta: la scelta dopo della persona non si tocca');
  assert.equal(stati.get(schermo).selezione, 'lib-1');
});
