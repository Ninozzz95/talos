import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/*
 * ⛔⛔⛔ BC-42 (12/09/2026) — `GET …/tree?percorso=` PRENDEVA 400 A OGNI APERTURA DI SESSIONE, e il
 * 400 finiva in console («Failed to load resource … 400 (Bad Request)»): `RUNTIME-01` rosso su
 * qualunque banco.
 *
 * ⛔ LA DIAGNOSI CHE GIRAVA È SMENTITA, e la smentita è misurata. Sul banco (porta 4196, copia dello
 *   store, mai la 4174), con la cartella al suo posto:
 *       curl "…/tree?percorso="  → HTTP 200, 51 voci
 *       curl "…/tree"            → HTTP 200, 51 voci
 *   Il parametro vuoto non c'entra: `parseTreeQuery` (http-app.mjs:776) lo accetta e torna ''.
 *   Il 400 arriva quando la CARTELLA DELLA SESSIONE non esiste più: `workspace-tree.mjs:52` fa
 *   `realpathSync(cartella)`, ENOENT, e il `catch` di riga 59 traduce ogni guasto in
 *   `WorkspaceTreeError('Percorso non leggibile')`, il cui `code` è scritto a mano `QUERY_INVALID`
 *   (riga 33) ⇒ 400 «Query non valida». Sul disco dell'owner sono 3 sessioni su 27 (la cartella
 *   `…\Desktop\qwen 3.8 research`, cancellata). Riprodotto sul banco su `8dde6bff`: HTTP 400.
 *
 * ⇒ Server e rotta non si toccano. La cura è non mandare, a ogni apertura di sessione, la richiesta
 *   di un pannello che nessuno sta guardando: misurato PRIMA, la scheda File è `hidden` (a vista c'è
 *   «Contesto») e il replay chiedeva la radice DUE volte.
 */

const APP = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');

function corpoFunzione(sorgente, nome) {
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

/** `schedaFileAVista` estratta ed ESEGUITA: è una domanda sul DOM, si prova sul DOM. */
const corpoAVista = corpoFunzione(APP, 'schedaFileAVista');
const fabbricaAVista = (sezione) => new Function('$', `${corpoAVista}; return schedaFileAVista;`)(() => sezione);

test('BC-42/1 — «la scheda File è a vista?» risponde dal DOM, nei due casi', () => {
  assert.ok(corpoAVista, 'schedaFileAVista deve esistere');
  assert.equal(fabbricaAVista({ hidden: true })(), false, 'nascosta: nessuno la sta guardando');
  assert.equal(fabbricaAVista({ hidden: false })(), true, 'aperta: la richiesta ha un senso');
  assert.equal(fabbricaAVista(null)(), false, 'e una sezione che non c\'è non è «a vista»: mai una richiesta su un pannello inesistente');
});

test('BC-42/2 — a pannello chiuso NON si chiede niente, ma il debito si segna', () => {
  const corpo = corpoFunzione(APP, 'programmaRenderAlberoReale');
  assert.ok(corpo, 'programmaRenderAlberoReale deve esistere');
  assert.ok(/if \(!schedaFileAVista\(\)\) \{/.test(corpo), 'la prima domanda è se qualcuno sta guardando');
  assert.ok(/alberoDaRidisegnare = true;/.test(corpo), 'ciò che non si disegna adesso non si perde: si segna');
  assert.ok(corpo.indexOf('alberoDaRidisegnare = true;') < corpo.indexOf('renderizzaAlberoReale()'),
    'e si esce PRIMA di programmare il render: se il `return` mancasse, la richiesta partirebbe lo stesso');
});

test('BC-42/3 — aprendo la scheda il debito viene onorato, anche con la radice in cache', () => {
  const corpo = corpoFunzione(APP, 'setInspectorTab') || APP;
  assert.ok(/\(alberoDaRidisegnare \|\| !state\.realSession\.treeCache\.has\(''\)\)/.test(corpo),
    'senza il termine `alberoDaRidisegnare` la scheda si aprirebbe su un albero vecchio: la cura avrebbe SPOSTATO il difetto invece di toglierlo');
});

test('BC-42/4 — il debito si salda dove l\'albero si rilegge davvero, non altrove', () => {
  const corpo = corpoFunzione(APP, 'renderizzaAlberoReale');
  assert.ok(/alberoDaRidisegnare = false;/.test(corpo), 'azzerato all\'inizio del render vero');
  const quante = (APP.match(/(?<!let )alberoDaRidisegnare = false;/g) || []).length;
  assert.equal(quante, 1, 'un solo posto che lo azzera: due si scordano di essere due');
});

test('BC-42/5 — il messaggio dell\'albero rotto dice COSA è successo, non «query non valida»', () => {
  const corpo = corpoFunzione(APP, 'renderizzaAlberoRealeUnaVolta');
  assert.ok(/errore\?\.code === 'QUERY_INVALID'/.test(corpo), 'la cartella sparita si riconosce dal codice che il server manda davvero');
  assert.ok(/è stata spostata o cancellata/.test(corpo), 'si dice il fatto');
  assert.ok(/Apri una sessione nuova sulla cartella giusta/.test(corpo), 'e cosa farci: un errore senza via d\'uscita è solo uno spavento');
  assert.equal(/textElement\('li', 'ft-loading', 'Albero non disponibile\.'\)/.test(corpo), false, 'la frase muta di prima non torna a schermo');
  /* ⛔ Il gergo si cerca in ciò che FINISCE A SCHERMO, non nei commenti: il commento sopra la cura
     cita «Query non valida» apposta, per spiegare da dove viene il 400. */
  const aSchermo = [...corpo.matchAll(/'ft-loading',\s*([\s\S]*?)\)\);/g)].map((m) => m[1]).join(' ');
  assert.ok(aSchermo.length > 0, 'le due frasi mostrate devono essere trovabili');
  assert.equal(/Query|QUERY_INVALID|400/.test(aSchermo), false, 'mai il gergo del server a schermo (H22)');
});

test('BC-42, AL CONTRARIO — i cancelli RESPINGONO il sorgente com\'era prima della cura', () => {
  const guasto = `
    function programmaRenderAlberoReale() {
      const generation = state.realSession.generation;
      cancellaRenderAlberoDifferito();
      treeRenderTimer = window.setTimeout(() => { void renderizzaAlberoReale(); }, 60);
    }
    function renderizzaAlberoRealeUnaVolta() {
      try { voci = await caricaLivelloAlbero(''); } catch { ul.appendChild(textElement('li', 'ft-loading', 'Albero non disponibile.')); }
    }
  `;
  assert.equal(/if \(!schedaFileAVista\(\)\) \{/.test(corpoFunzione(guasto, 'programmaRenderAlberoReale')), false,
    'chiede l\'albero anche a pannello chiuso: è il difetto BC-42, va respinto');
  assert.equal(corpoFunzione(guasto, 'schedaFileAVista'), null, 'e la domanda non la fa nessuno');
  assert.ok(/Albero non disponibile\./.test(corpoFunzione(guasto, 'renderizzaAlberoRealeUnaVolta')), 'il messaggio muto è quello di prima');
});
