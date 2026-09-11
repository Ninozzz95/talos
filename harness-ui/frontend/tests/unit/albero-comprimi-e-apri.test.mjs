import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/*
 * I DUE DIFETTI DELL'ALBERO DEI FILE (11/09/2026), owner dal vivo sulla foto dell'inspector:
 *   1. «se faccio tasto destro sulla ROOT deve poter spuntare "Apri", cioe' devo poterla aprire su
 *      Windows» — il menu della radice aveva solo «Nuovo file» e «Nuova cartella»;
 *   2. «nel file tree posso espandere ma non comprimere le cartelle» — e la causa NON era nella
 *      logica: `aria-expanded`, `ft-open` e `treeOpen` dicevano gia' la cosa giusta anche da chiusi.
 *      Mancava chi traduceva quello stato in pixel: le regole `.ft-node > ul{display:none}` /
 *      `.ft-node.ft-open > ul{display:block}` non sono arrivate nel foglio spedito dopo il cutover
 *      (zero occorrenze di `.ft-node` in `frontend/src/styles/`), e la `<ul>` dei figli restava a
 *      schermo per sempre. Misurato sul banco prima della cura: `aria-expanded="false"` con 3 figli
 *      ancora visibili, tre giri di apri/chiudi di fila.
 *
 * Perche' cancelli STATICI qui, oltre alla prova sul banco: la cura vive in tre righe minuscole
 * (`childUl.hidden`) sparse in tre funzioni diverse. Toglierne UNA rimette esattamente il difetto
 * dell'owner e non rende rosso niente altro — non un test, non un build, non un typecheck. Queste
 * prove sono l'unica cosa che se ne accorge.
 *
 * Ogni controllo ha la sua meta' AL CONTRARIO su un sorgente finto guasto: un cancello che non ha
 * mai respinto niente non e' un cancello (regola 5-bis).
 */
const APP = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');

/** Il corpo di una funzione dichiarata come `function nome(` o `async function nome(`, fino alla graffa che la chiude. */
export function corpoFunzione(sorgente, nome) {
  const inizio = sorgente.search(new RegExp(`(async )?function ${nome}\\s*\\(`));
  if (inizio === -1) return null;
  const apertura = sorgente.indexOf('{', inizio);
  let livello = 0;
  for (let i = apertura; i < sorgente.length; i += 1) {
    if (sorgente[i] === '{') livello += 1;
    else if (sorgente[i] === '}') {
      livello -= 1;
      if (livello === 0) return sorgente.slice(inizio, i + 1);
    }
  }
  return null;
}

/** Dice se una funzione porta la `<ul>` dei figli allo stato chiesto (`true` = chiusa, `false` = aperta). */
export function portaLaUlA(corpo, statoAtteso) {
  if (!corpo) return false;
  return new RegExp(`(childUl|ul)\\.hidden\\s*=\\s*${statoAtteso}\\b`).test(corpo);
}

test('COMPRIMI 1 — una cartella NASCE chiusa: la <ul> dei figli si crea con hidden, come dice il suo aria-expanded="false"', () => {
  const corpo = corpoFunzione(APP, 'costruisciNodoAlbero');
  assert.ok(corpo, 'costruisciNodoAlbero deve esistere');
  assert.ok(/aria-expanded', 'false'/.test(corpo), 'la cartella nasce dichiarata chiusa');
  assert.ok(portaLaUlA(corpo, 'true'), 'e la <ul> dei figli nasce nascosta: prima l\'attributo diceva una cosa e i pixel un\'altra');
});

test('COMPRIMI 2 — aprire SCOPRE la <ul>, chiudere la RINASCONDE', () => {
  assert.ok(portaLaUlA(corpoFunzione(APP, 'apriCartellaAlbero'), 'false'), 'apriCartellaAlbero deve scoprire i figli');
  assert.ok(portaLaUlA(corpoFunzione(APP, 'chiudiCartellaAlbero'), 'true'), 'chiudiCartellaAlbero deve rinascondere i figli: era ESATTAMENTE il difetto dell\'owner');
});

test('COMPRIMI 3 — chiudiCartellaAlbero si TROVA da sola la <ul>: un chiamante non puo\' dimenticarsela', () => {
  const corpo = corpoFunzione(APP, 'chiudiCartellaAlbero');
  assert.ok(/querySelector\(':scope > ul'\)/.test(corpo), 'la <ul> si ricava da `li`, non si riceve come parametro');
  const firma = /function chiudiCartellaAlbero\(([^)]*)\)/.exec(APP)[1];
  assert.equal(firma.includes('childUl'), false, 'se la <ul> fosse un parametro, un terzo chiamante domani la dimenticherebbe e la cartella tornerebbe «chiusa nello stato, aperta a schermo»');
});

test('COMPRIMI, AL CONTRARIO — il cancello RESPINGE un sorgente a cui manca una sola delle tre righe', () => {
  const guasto = `
    function costruisciNodoAlbero() { li.setAttribute('aria-expanded', 'false'); const childUl = document.createElement('ul'); li.appendChild(childUl); }
    async function apriCartellaAlbero() { li.classList.add('ft-open'); }
    function chiudiCartellaAlbero(li, iconEl) { li.classList.remove('ft-open'); }
  `;
  assert.equal(portaLaUlA(corpoFunzione(guasto, 'costruisciNodoAlbero'), 'true'), false, 'nasce senza hidden: va respinto');
  assert.equal(portaLaUlA(corpoFunzione(guasto, 'apriCartellaAlbero'), 'false'), false, 'non scopre niente: va respinto');
  assert.equal(portaLaUlA(corpoFunzione(guasto, 'chiudiCartellaAlbero'), 'true'), false, 'e QUESTO e\' il difetto dell\'11/09: va respinto');
  assert.equal(corpoFunzione(guasto, 'funzioneCheNonEsiste'), null, 'una funzione assente non e\' una funzione sana');
});

test('TASTIERA — freccia destra su un FILE non fa niente (WAI-ARIA APG, «When focus is on an end node, does nothing»)', () => {
  const blocco = /ArrowRight'\) \{([\s\S]*?)\} else if \(e\.key === 'ArrowLeft'/.exec(APP);
  assert.ok(blocco, 'il ramo della freccia destra deve esistere');
  assert.ok(/if \(!eCartella\) return;/.test(blocco[1]), 'su un nodo foglia si esce subito: prima la freccia destra scendeva alla riga dopo, cioe\' faceva il lavoro della freccia giu\'');
  assert.ok(/:scope > ul > \.ft-node > \.ft-row/.test(blocco[1]), 'su una cartella aperta il fuoco va al PRIMO FIGLIO, chiesto al sottoalbero e non dedotto dall\'ordine visivo');
});

test('APRI 1 — il menu della RADICE offre «Apri in Esplora File», e in testa', () => {
  const corpo = corpoFunzione(APP, 'apriMenuAzioniFile');
  assert.ok(corpo, 'apriMenuAzioniFile deve esistere');
  const soloCreazione = /const voci = soloCreazione \? \[([\s\S]*?)\] : cartella \? \[/.exec(corpo);
  assert.ok(soloCreazione, 'il ramo della radice deve esistere');
  const etichette = [...soloCreazione[1].matchAll(/etichetta: '([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(etichette, ['Apri in Esplora File', 'Nuovo file', 'Nuova cartella'], 'la voce chiesta dall\'owner c\'e\', ed e\' la prima: e\' l\'unica che non crea niente');
});

test('APRI 2 — anche le CARTELLE hanno «Apri», con l\'etichetta IDENTICA a quella della radice', () => {
  const corpo = corpoFunzione(APP, 'apriMenuAzioniFile');
  const cartelle = /\] : cartella \? \[([\s\S]*?)\] : \[/.exec(corpo);
  assert.ok(cartelle, 'il ramo delle cartelle deve esistere');
  const etichette = [...cartelle[1].matchAll(/etichetta: '([^']+)'/g)].map((m) => m[1]);
  assert.ok(etichette.includes('Apri in Esplora File'), 'una cartella si deve poter aprire come la radice');
  assert.ok(etichette.includes('Rivela in Esplora File'), '«apri» e «rivela» restano due voci: sono due cose diverse su Windows');
  assert.ok(etichette.indexOf('Apri in Esplora File') === etichette.indexOf('Rivela in Esplora File') - 1, 'le due azioni Windows stanno vicine, nell\'ordine apri → rivela');
});

test('APRI 3 — «Apri» parla con la rotta /tree/open, e solo con quella', () => {
  const corpo = corpoFunzione(APP, 'apriInEsploraFile');
  assert.ok(corpo, 'apriInEsploraFile deve esistere');
  assert.ok(/\/tree\/open/.test(corpo), 'la rotta e\' quella nuova');
  assert.equal(/\/tree\/reveal/.test(corpo), false, 'mai la rotta di «rivela»: /select aprirebbe il GENITORE del workspace');
  assert.ok(/percorso: percorsoCompleto/.test(corpo), 'il corpo e\' {percorso}, come tutte le sorelle di /tree/*');
});

test('APRI 4 — la radice ha anche il suo «···»: tre azioni non stanno in fila, e il tasto destro non basta da tastiera', () => {
  const corpo = corpoFunzione(APP, 'renderizzaAlberoRealeUnaVolta');
  assert.ok(corpo, 'renderizzaAlberoRealeUnaVolta deve esistere');
  assert.ok(/azioniRadice\.className = 'ft-actions-btn/.test(corpo), 'stesso bottone delle righe, non una seconda implementazione');
  assert.ok(/apriMenuAzioniFile\('', nomeRadiceAlberoReale\(\), \{ ancoraEl: azioniRadice \}, true, true\)/.test(corpo), 'e apre lo STESSO menu del tasto destro');
  assert.ok(/radice\.addEventListener\('contextmenu'/.test(corpo), 'il tasto destro resta: menu overflow PIU\' tasto destro, mai uno solo dei due');
});

test('ESC — l\'ascoltatore del menu dell\'albero sta in fase di CATTURA, o Esc chiude il menu E apre il velo «fermo il giro»', () => {
  const corpo = corpoFunzione(APP, 'apriMenuAzioniFile');
  assert.ok(/addEventListener\('keydown', onKeydown, true\)/.test(corpo), 'registrato in cattura: la catena di Esc della app gira prima, in bolla');
  assert.ok(/removeEventListener\('keydown', onKeydown, true\)/.test(corpo), 'stesso `true` in rimozione, o l\'ascoltatore non si stacca piu\'');
  assert.ok(/event\.stopPropagation\(\)/.test(corpo), 'e il tasto si ferma qui: si smonta lo strato piu\' interno, e solo quello');
});

test('ESC, AL CONTRARIO — il cancello RESPINGE la registrazione in bolla, che e\' la forma che aveva il difetto', () => {
  const guasto = "function apriMenuAzioniFile() { document.addEventListener('keydown', onKeydown); document.removeEventListener('keydown', onKeydown); }";
  const corpo = corpoFunzione(guasto, 'apriMenuAzioniFile');
  assert.equal(/addEventListener\('keydown', onKeydown, true\)/.test(corpo), false);
  assert.equal(/event\.stopPropagation\(\)/.test(corpo), false);
});
