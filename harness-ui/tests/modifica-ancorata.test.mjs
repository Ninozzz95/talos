import assert from 'node:assert/strict';
import test from 'node:test';

import { modificaAncorata, posizioneDi, ModificaError } from '../src/modifica-ancorata.mjs';

/*
 * ⛔⛔ PO-12 — l'attrezzo di modifica. Owner 09/09: «dare al modello un tool di edit esattamente come
 * Claude Code da CLI»; approvato il 10/09 al posto della prenotazione dei file di D3, perché una
 * modifica ancorata al testo rende impossibile la sovrascrittura cieca **senza chiedere niente al
 * modello** — mentre la prenotazione dipende dal fatto che se ne ricordi.
 *
 * Le tre scelte, e da dove vengono (letto il 10/09/2026):
 *  · unicità obbligatoria — Claude Code: un `old_string` ambiguo «could corrupt logic in the wrong
 *    function», quindi si rifiuta invece di indovinare;
 *  · il rifiuto dice DOVE — Hermes elenca le posizioni, così il modello sa come disambiguare;
 *  · mai la prima occorrenza in silenzio — è ciò che fa Codex (`seek_sequence`), ed è il
 *    comportamento che qui non si imita.
 */

/* ⛔ `assert.throws` non RESTITUISCE l'errore (Node): per guardarci dentro va catturato. */
function lanciato(fn) {
  try { fn(); } catch (e) { return e; }
  throw new Error('non ha lanciato: era il difetto che questa prova cerca');
}

const FILE = [
  'function saluta(nome) {',
  '  if (!nome) return null;',
  '  return `ciao ${nome}`;',
  '}',
  '',
  'function saluta2(nome) {',
  '  if (!nome) return null;',
  '  return `ciao ${nome}!`;',
  '}',
].join('\n');

test('PO-12: la sostituzione avviene dove il testo è unico, e il resto del file non si muove', () => {
  const esito = modificaAncorata(FILE, 'return `ciao ${nome}`;', 'return `salve ${nome}`;');
  assert.equal(esito.strategia, 'esatta');
  assert.equal(esito.occorrenze, 1);
  assert.equal(esito.riga, 3, 'dice a quale riga ha agito: senza, chi legge non può verificare');
  assert.ok(esito.contenuto.includes('return `salve ${nome}`;'));
  assert.ok(esito.contenuto.includes('return `ciao ${nome}!`;'), 'la seconda funzione non è stata toccata');
  assert.equal(esito.contenuto.split('\n').length, FILE.split('\n').length, 'nessuna riga aggiunta o persa');
});

/*
 * ⛔ IL CASO CHE GIUSTIFICA TUTTO IL PEZZO. `if (!nome) return null;` compare due volte, in due
 * funzioni diverse. Codex prenderebbe la prima e andrebbe avanti: il file resterebbe valido e la
 * logica cambiata nel posto sbagliato — il difetto peggiore, perché non fa rumore.
 */
test('PO-12: un testo che compare DUE volte non si sostituisce a caso — si rifiuta, dicendo dove', () => {
  const errore = lanciato(() => modificaAncorata(FILE, '  if (!nome) return null;', '  if (!nome) return "";'));
  assert.ok(errore instanceof ModificaError && errore.code === 'MODIFICA_AMBIGUA', errore.message);
  assert.deepEqual(errore.righe, [2, 7], 'le righe vere, non un conteggio: «2 occorrenze» non è azionabile');
  assert.match(errore.message, /compare 2 volte/);
  assert.match(errore.message, /riga 2, riga 7/);
  assert.match(errore.message, /aggiungi qualche riga intorno|sostituirle tutte/, 'il messaggio dice COSA FARE');
});

test('PO-12: con più contesto lo stesso punto diventa unico, e la sostituzione riesce', () => {
  const esito = modificaAncorata(
    FILE,
    'function saluta2(nome) {\n  if (!nome) return null;',
    'function saluta2(nome) {\n  if (!nome) return "";',
  );
  assert.equal(esito.riga, 6, 'ha agito nella SECONDA funzione, quella che il contesto identifica');
  assert.ok(esito.contenuto.includes('function saluta2(nome) {\n  if (!nome) return "";'));
  assert.ok(esito.contenuto.includes('function saluta(nome) {\n  if (!nome) return null;'), 'la prima è intatta');
});

test('PO-12: «tutte le occorrenze» si chiede, non si subisce — e vale solo sul testo esatto', () => {
  const esito = modificaAncorata(FILE, '  if (!nome) return null;', '  if (!nome) return "";', { tutte: true });
  assert.equal(esito.occorrenze, 2);
  assert.equal((esito.contenuto.match(/return "";/g) ?? []).length, 2);

  /* ⛔ Sostituire OVUNQUE basandosi su una somiglianza è il modo più veloce di rovinare un file in
     molti punti insieme: stessa guardia di Hermes («replace_all only applies to exact matches»). */
  assert.throws(
    () => modificaAncorata(FILE, '  if (!nome) return null;   ', 'x', { tutte: true }),
    (e) => e.code === 'MODIFICA_TUTTE_NON_ESATTA',
  );
});

test('PO-12: gli spazi non fanno indovinare — se la posizione è incerta si dice, non si tira a caso', () => {
  /* ⛔ Applicare un indice calcolato su un testo NORMALIZZATO a un testo che ha spazi diversi è la
     stessa trappola delle citazioni elise del Context Engine: sembra funzionare finché non sposta
     una sostituzione di qualche carattere e rovina il file. Qui, invece di indovinare, si chiede di
     rileggere. */
  const conSpazi = 'alfa\nbeta   \ngamma';
  const esatto = modificaAncorata(conSpazi, 'beta', 'BETA');
  assert.equal(esatto.strategia, 'esatta', 'qui il testo c’era davvero: nessuna tolleranza spesa');
  assert.equal(esatto.contenuto, 'alfa\nBETA   \ngamma');

  /* Il caso vero: il modello ha copiato la riga CON il rientro, il file ce l'ha senza. La strategia
     tollerante la ritroverebbe, ma normalizzando cambia la lunghezza del testo — e allora l'indice
     non vale più sull'originale. Invece di sostituire nel posto sbagliato, si chiede di rileggere. */
  const senzaRientro = 'alfa\nbeta   \ngamma';
  const e = lanciato(() => modificaAncorata(senzaRientro, '    beta', 'BETA'));
  assert.equal(e.code, 'MODIFICA_POSIZIONE_INCERTA', 'trovato con tolleranza, ma la posizione non è sicura');
  assert.match(e.message, /rileggilo e copia il punto com/i, 'e dice che cosa fare');
});

test('PO-12, AL CONTRARIO: i quattro casi in cui NON si tocca il file', () => {
  for (const [vecchio, nuovo, code] of [
    ['', 'x', 'MODIFICA_VUOTA'],
    ['uguale', 'uguale', 'MODIFICA_IDENTICA'],
    ['   ', 'x', 'MODIFICA_SOLO_SPAZI'],
    ['non c’è in questo file', 'x', 'MODIFICA_NON_TROVATA'],
  ]) {
    const e = lanciato(() => modificaAncorata(FILE, vecchio, nuovo));
    assert.ok(e instanceof ModificaError, `atteso un ModificaError per ${JSON.stringify(vecchio)}`);
    assert.equal(e.code, code, `atteso ${code} per ${JSON.stringify(vecchio)}`);
  }
});

test('PO-12: il messaggio del «non trovato» dice che cosa fare, non solo che è andata male', () => {
  const e = lanciato(() => modificaAncorata(FILE, 'zzz', 'x'));
  assert.equal(e.code, 'MODIFICA_NON_TROVATA');
  assert.match(e.message, /rileggilo e copia il punto esatto/,
    'la ricerca del 10/09 dice che un messaggio azionabile è ciò che ferma i cicli di ritentativo');
});

test('PO-12: riga e colonna si contano da 1, come le legge una persona', () => {
  const testo = 'prima\nseconda\nterza';
  assert.deepEqual(posizioneDi(testo, 0), { riga: 1, colonna: 1 });
  assert.deepEqual(posizioneDi(testo, 6), { riga: 2, colonna: 1 });
  assert.deepEqual(posizioneDi(testo, 8), { riga: 2, colonna: 3 });
});

/*
 * ⛔ Il caso che rende PO-12 anche una difesa per D3: due sotto-agenti sullo stesso file. Con
 * `scrivi` (riscrittura totale) il secondo cancella il primo senza accorgersene. Con la modifica
 * ancorata, il secondo fallisce da solo — perché il punto che aveva letto non c'è più.
 */
test('PO-12 e D3: la seconda modifica su un punto già cambiato FALLISCE invece di cancellare il lavoro', () => {
  const originale = 'riga uno\nriga due\nriga tre';
  const dopoLaPrima = modificaAncorata(originale, 'riga due', 'riga due, cambiata da A').contenuto;

  // B aveva letto il file PRIMA, e crede ancora che dica «riga due»
  const e = lanciato(() => modificaAncorata(dopoLaPrima, 'riga due\nriga tre', 'riga due, cambiata da B\nriga tre'));
  assert.ok(e instanceof ModificaError);
  assert.equal(e.code, 'MODIFICA_NON_TROVATA');
  assert.ok(dopoLaPrima.includes('cambiata da A'), '⛔ il lavoro di A è ancora lì: è tutto il punto');
});
