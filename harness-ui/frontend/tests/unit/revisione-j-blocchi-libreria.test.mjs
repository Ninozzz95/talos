/*
 * Revisione J (04/11/2026) di «Salva in Libreria» dei blocchi vivi (decisione 142, commit 4d2c96c7c): le prove del PC e le cure
 * dell'agente L con le scelte del Desktop:
 *   - D4: in sola lettura (il blocco riaperto in Libreria) niente frase che promette un clic;
 *   - D7: il tasto ricorda «In Libreria · vN» per `sessione:impronta#id` (come `creaMemoriaAzioni` dell'aggancio) e, dopo una
 *     ricarica, lo chiede al server (`GET /sessions/:id/blocks/:idBlocco/library`, sola lettura), UNA volta per blocco;
 *   - nota: «Apri» dall'avviso con un filtro o una ricerca attivi nella Libreria: il filtro si toglie, la voce si vede;
 *   - mutante M5: il cablaggio di `app.js` si legge dal sorgente, come VISTE-11.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { documento, clic, voceDelMenu, orologio, spento } from './aiuto-dom-blocchi.mjs';
import { leggi } from '../../../src/blocchi/lettore.mjs';
import { impronta } from '../../../src/blocchi/impronta.mjs';
import { impostaLingua, t } from '../../src/components/lingua.js';
import { disegnaBlocco } from '../../src/components/blocchi/guscio.js';
import { bloccoPerIlLettore, creaAggancioBlocchi } from '../../src/components/blocchi/aggancio.js';
import { creaApriVoceDellaLibreria, creaSalvaInLibreria } from '../../src/components/blocchi/in-libreria.js';

impostaLingua('it');
const FIXTURE = new URL('../../../tests/fixtures/blocchi/', import.meta.url);
const corpo = (nome) => readFileSync(new URL(`${nome}.txt`, FIXTURE), 'utf8');
const aspetta = () => new Promise((r) => setImmediate(r));
const tastoLib = (nodo) => voceDelMenu(nodo, 'libreria');

test('REV-J-PC-01 (D4) — in Libreria, sotto le scelte spente, niente frase che promette «un clic manda la tua scelta come messaggio»', () => {
  const doc = documento();
  const scelte = bloccoPerIlLettore({ document: doc }).disegna(corpo('03-scelte'));
  assert.ok(scelte.querySelectorAll('button[data-scelta]').every(spento), 'premessa: spente');
  assert.ok(!scelte.textContent.includes(t('blocchi.choices.note')), 'la frase a schermo dice una cosa falsa in sola lettura');
  /* AL CONTRARIO: in chat la frase resta */
  const inChat = disegnaBlocco(leggi(corpo('03-scelte')), { document: doc, testo: corpo('03-scelte') });
  assert.ok(inChat.textContent.includes(t('blocchi.choices.note')));
});

test('REV-J-PC-02 (D4) — in Libreria il modulo spento non dice «Un clic, un messaggio solo»', () => {
  const doc = documento();
  const modulo = bloccoPerIlLettore({ document: doc }).disegna(corpo('04-modulo'));
  assert.ok(!modulo.textContent.includes(t('blocchi.form.note')), 'la frase a schermo dice una cosa falsa in sola lettura');
  const inChat = disegnaBlocco(leggi(corpo('04-modulo')), { document: doc, testo: corpo('04-modulo') });
  assert.ok(inChat.textContent.includes(t('blocchi.form.note')), 'in chat la frase resta');
});

test('REV-J-PC-03 (D7) — lo stesso blocco ridisegnato (ricarica, cambio di sessione, gesto dal giornale) ricorda che è già in Libreria', async () => {
  const doc = documento();
  const salva = creaSalvaInLibreria({
    post: async () => ({ data: { id: 'lib-1', versione: 1, totale: 1, nome: 'Vendite per mese.txt', nuova: true } }),
    sessione: () => 's1', avvisa: () => {}, apri: () => {},
  });
  const testo = corpo('01-tabella');
  const primo = disegnaBlocco(leggi(testo), { document: doc, testo, azioni: { libreria: salva } });
  doc.body.append(primo);
  clic(tastoLib(primo));
  await aspetta();
  assert.equal(tastoLib(primo).textContent, 'In Libreria · v1');
  const ridisegnato = disegnaBlocco(leggi(testo), { document: doc, testo, azioni: { libreria: salva } });
  assert.equal(tastoLib(ridisegnato).textContent, 'In Libreria · v1', 'dopo un nuovo disegno il tasto torna «Salva in Libreria»');
  /* AL CONTRARIO: lo stesso id con un testo diverso non è salvato; un'altra conversazione nemmeno */
  const cambiato = testo.replace('["Marzo"]', '["Marzo", 1500]');
  assert.equal(tastoLib(disegnaBlocco(leggi(cambiato), { document: doc, testo: cambiato, azioni: { libreria: salva } })).textContent, 'Salva in Libreria');
  const altraChat = creaSalvaInLibreria({ post: async () => null, sessione: () => 's2', avvisa: () => {}, apri: () => {} });
  assert.equal(tastoLib(disegnaBlocco(leggi(testo), { document: doc, testo, azioni: { libreria: altraChat } })).textContent, 'Salva in Libreria');
});

test('REV-J-PC-04 (M2) — durante la richiesta il tasto è spento: un doppio clic non manda due richieste', async () => {
  const doc = documento();
  let chiamate = 0;
  let rispondi;
  const salva = creaSalvaInLibreria({
    post: () => { chiamate += 1; return new Promise((ok) => { rispondi = ok; }); },
    sessione: () => 's1', avvisa: () => {}, apri: () => {},
  });
  const testo = corpo('01-tabella');
  const nodo = disegnaBlocco(leggi(testo), { document: doc, testo, azioni: { libreria: salva } });
  doc.body.append(nodo);
  const tasto = () => tastoLib(nodo);
  clic(tasto());
  assert.equal(tasto().disabled, true, 'in volo il tasto è spento');
  clic(tasto());
  rispondi({ data: { id: 'lib-1', versione: 1, totale: 1, nome: 'a.txt', nuova: true } });
  await aspetta();
  assert.equal(chiamate, 1);
  assert.equal(tasto().disabled, false);
});

test('REV-J-PC-05 (D7) — dopo una ricarica il tasto lo chiede al server, UNA volta per blocco, e dice la versione che ha quel testo', async () => {
  const doc = documento();
  const testo = corpo('01-tabella');
  const v2 = testo.replace('["Marzo"]', '["Marzo", 1500]');
  const lette = [];
  const salva = creaSalvaInLibreria({
    post: async () => null, sessione: () => 's 1', avvisa: () => {}, apri: () => {},
    leggi: async (percorso) => {
      lette.push(percorso);
      /* il server calcola l'impronta sul sorgente salvato, senza spazi in coda (`sorgenteDelBlocco`) */
      return { voce: { id: 'lib-1', nome: 'Vendite per mese.txt', totale: 2, versioni: [{ n: 1, impronta: impronta(testo.trimEnd()) }, { n: 2, impronta: impronta(v2.trimEnd()) }] } };
    },
  });
  const a = disegnaBlocco(leggi(testo), { document: doc, testo, azioni: { libreria: salva } });
  const b = disegnaBlocco(leggi(v2), { document: doc, testo: v2, azioni: { libreria: salva } });
  const altro = testo.replace('980.5', '981');
  const c = disegnaBlocco(leggi(altro), { document: doc, testo: altro, azioni: { libreria: salva } });
  assert.equal(tastoLib(a).textContent, 'Salva in Libreria', 'prima della risposta, il tasto di sempre');
  await aspetta();
  await aspetta();
  assert.deepEqual(lette, ['/api/v1/sessions/s%201/blocks/vendite/library'], 'una domanda sola per i tre disegni dello stesso blocco');
  assert.equal(tastoLib(a).textContent, 'In Libreria · v1');
  assert.equal(tastoLib(b).textContent, 'In Libreria · v2');
  assert.equal(tastoLib(c).textContent, 'Salva in Libreria', 'un testo mai salvato resta da salvare');
  /* il disegno dopo la risposta è subito giusto, senza un'altra domanda */
  const d = disegnaBlocco(leggi(testo), { document: doc, testo, azioni: { libreria: salva } });
  assert.equal(tastoLib(d).textContent, 'In Libreria · v1');
  assert.equal(lette.length, 1);
});

test('REV-J-PC-06 (D7, al contrario) — voce assente, server giù o senza sessione: il tasto resta «Salva in Libreria»; un guasto si richiede al disegno dopo', async () => {
  const doc = documento();
  const testo = corpo('01-tabella');
  let volte = 0;
  let sessione = null;
  const salva = creaSalvaInLibreria({
    post: async () => null, sessione: () => sessione, avvisa: () => {}, apri: () => {},
    leggi: async () => { volte += 1; if (volte === 1) throw new Error('giù'); return { data: { voce: null } }; },
  });
  const disegna = () => disegnaBlocco(leggi(testo), { document: doc, testo, azioni: { libreria: salva } });
  disegna();
  await aspetta();
  assert.equal(volte, 0, 'senza sessione non si chiede niente');
  sessione = 's1';
  const uno = disegna();
  await aspetta();
  assert.equal(volte, 1);
  assert.equal(tastoLib(uno).textContent, 'Salva in Libreria');
  const due = disegna();
  await aspetta();
  assert.equal(volte, 2, 'il guasto non resta in memoria');
  assert.equal(tastoLib(due).textContent, 'Salva in Libreria');
  disegna();
  await aspetta();
  assert.equal(volte, 2, 'la risposta «non c\'è» sì');
});

test('REV-J-PC-07 (D7) — la risposta del server arriva mentre il salvataggio è in volo, o dopo: non copre il numero vero', async () => {
  const doc = documento();
  const testo = corpo('01-tabella');
  let rispondiLettura;
  const salva = creaSalvaInLibreria({
    post: async () => ({ data: { id: 'lib-1', versione: 3, totale: 3, nome: 'a.txt', nuova: true } }),
    sessione: () => 's1', avvisa: () => {}, apri: () => {},
    leggi: () => new Promise((ok) => { rispondiLettura = ok; }),
  });
  const nodo = disegnaBlocco(leggi(testo), { document: doc, testo, azioni: { libreria: salva } });
  doc.body.append(nodo);
  clic(tastoLib(nodo));
  await aspetta();
  assert.equal(tastoLib(nodo).textContent, 'In Libreria · v3');
  rispondiLettura({ voce: { id: 'lib-1', nome: 'a.txt', totale: 1, versioni: [{ n: 1, impronta: impronta(testo.trimEnd()) }] } });
  await aspetta();
  assert.equal(tastoLib(nodo).textContent, 'In Libreria · v3', 'la risposta vecchia non torna indietro');
  assert.equal(tastoLib(disegnaBlocco(leggi(testo), { document: doc, testo, azioni: { libreria: salva } })).textContent, 'In Libreria · v3', 'nemmeno nella memoria');
});

test('REV-J-PC-07b (D7) — la risposta del server arriva mentre il clic è in volo: il tasto spento non cambia sotto la persona', async () => {
  const doc = documento();
  const testo = corpo('01-tabella');
  let rispondiLettura;
  let rispondiSalva;
  const salva = creaSalvaInLibreria({
    post: () => new Promise((ok) => { rispondiSalva = ok; }),
    sessione: () => 's1', avvisa: () => {}, apri: () => {},
    leggi: () => new Promise((ok) => { rispondiLettura = ok; }),
  });
  const nodo = disegnaBlocco(leggi(testo), { document: doc, testo, azioni: { libreria: salva } });
  doc.body.append(nodo);
  clic(tastoLib(nodo));
  await aspetta();
  rispondiLettura({ voce: { id: 'lib-1', nome: 'a.txt', totale: 1, versioni: [{ n: 1, impronta: impronta(testo.trimEnd()) }] } });
  await aspetta();
  assert.equal(tastoLib(nodo).textContent, 'Salva in Libreria', 'in volo il tasto non cambia');
  rispondiSalva({ data: { id: 'lib-1', versione: 1, totale: 1, nome: 'a.txt', nuova: false } });
  await aspetta();
  assert.equal(tastoLib(nodo).textContent, 'In Libreria · v1');
});

test('REV-J-PC-08 (D7) — il blocco spento dal giornale (aggancio, `spegni`) resta «In Libreria · vN»', async () => {
  const document = documento();
  const salva = creaSalvaInLibreria({
    post: async () => ({ data: { id: 'lib-7', versione: 2, totale: 2, nome: 'prossimo.txt', nuova: true } }),
    sessione: () => 's1', avvisa: () => {}, apri: () => {},
  });
  const a = creaAggancioBlocchi({ document, sessione: () => 's1', consegna: () => {}, timer: orologio().timer, azioni: { libreria: salva } });
  const SCELTE = corpo('03-scelte').trim();
  const nodo = a.blocco(SCELTE, true);
  document.body.append(nodo);
  clic(tastoLib(nodo));
  await aspetta();
  assert.equal(tastoLib(nodo).textContent, 'In Libreria · v2');
  a.spegni(`s1:${impronta(SCELTE)}#prossimo`, { tipo: 'scelte', valore: 'Continua' });
  /* il menu «⋯» vive nel corpo della pagina (scena 8): il blocco è l'ultimo figlio che non è il menu */
  const nuovo = document.body.children.filter((n) => n.id !== 'menuDelBlocco').at(-1);
  assert.notEqual(nuovo, nodo, 'premessa: ridisegnato');
  assert.equal(tastoLib(nuovo).textContent, 'In Libreria · v2');
});

test('REV-J-PC-09 (nota) — «Apri» dall\'avviso con un filtro o una ricerca attivi: il filtro si toglie e la voce si vede', () => {
  const schermo = { id: 'schermoLibreria' };
  const cerca = { value: 'vecchio' };
  const stato = { selezione: null, query: 'vecchio', filtro: 'immagini', config: { filtri: [{ id: 'tutte' }, { id: 'immagini' }] }, nodi: { cerca } };
  const v = creaApriVoceDellaLibreria({ schermo: () => schermo, statoSezione: () => stato, mostraPagina: () => {} });
  v.apri('lib-9');
  assert.equal(v.prendiVoceInAttesa([{ id: 'lib-9' }]), true);
  assert.deepEqual({ selezione: stato.selezione, query: stato.query, filtro: stato.filtro, cerca: cerca.value }, { selezione: 'lib-9', query: '', filtro: 'tutte', cerca: '' });
  /* AL CONTRARIO: la scelta dopo della persona (un filtro nuovo) non si tocca più */
  stato.filtro = 'immagini';
  assert.equal(v.prendiVoceInAttesa([{ id: 'lib-9' }]), false);
  assert.equal(stato.filtro, 'immagini');
});

test('REV-J-PC-09b (nota) — il filtro torna al PRIMO della sezione, anche quando non si chiama «tutte» (Note e Attività: «tutti»)', () => {
  const schermo = { id: 'schermo' };
  const stato = { selezione: null, query: '', filtro: 'fatte', config: { filtri: [{ id: 'tutti' }, { id: 'fatte' }] }, nodi: {} };
  const v = creaApriVoceDellaLibreria({ schermo: () => schermo, statoSezione: () => stato, mostraPagina: () => {} });
  v.apri('lib-3');
  assert.equal(v.prendiVoceInAttesa([{ id: 'lib-3' }]), true);
  assert.deepEqual({ selezione: stato.selezione, filtro: stato.filtro }, { selezione: 'lib-3', filtro: 'tutti' });
});

test('REV-J-PC-10 (M5) — app.js: «Apri» seleziona solo a elenco arrivato, e il tasto chiede la versione col GET di sempre', () => {
  const app = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
  assert.match(app, /if \(!caricamento && voceDellaLibreria\.prendiVoceInAttesa\(voci\)\) aggiornaPaginaLibreria\(mount, voci, opzioniPagina\);/u);
  assert.match(app, /creaSalvaInLibreria\(\{ post: \(percorso, corpo\) => apiPost\(percorso, corpo\), leggi: \(percorso\) => apiGet\(percorso\), sessione: \(\) => state\.realSession\.id,/u);
});
