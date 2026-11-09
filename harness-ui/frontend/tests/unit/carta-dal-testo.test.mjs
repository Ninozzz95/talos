/*
 * R-34 parte 2 — i pezzi puri della carta «chiamata scritta come testo» (bozzetto G0 approvato dall'owner il 30/10/2026 notte):
 * bersaglio, comando nel blocco del codice, argomenti in righe voce/valore, segreti oscurati.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { bersaglioDalTesto, bloccoDegliArgomenti, comandoDalTesto, righeDegliArgomenti, valoreLeggibile } from '../../src/components/carta-dal-testo.js';
import { impostaLingua } from '../../src/components/lingua.js';

const CHIAVE = 'sk-or-v1-0123456789abcdef0123456789abcdef0123456789abcdef';

test('DAL-TESTO-01 — il bersaglio viene dagli argomenti (percorso, comando, indirizzo); senza, il nome umano dato dalla pagina', () => {
  assert.equal(bersaglioDalTesto({ argomenti: { percorso: 'note/riassunto.md', contenuto: 'x' } }, 'Scrittura'), 'note/riassunto.md');
  assert.equal(bersaglioDalTesto({ argomenti: { url: 'https://example.com' } }, 'Naviga'), 'https://example.com');
  assert.equal(bersaglioDalTesto({ argomenti: { contenuto: 'solo testo' } }, 'Scrittura'), 'Scrittura');
  // ⛔ al contrario: argomenti mancanti o non oggetto non rompono la carta
  assert.equal(bersaglioDalTesto({ argomenti: null }, 'Scrittura'), 'Scrittura');
  assert.equal(bersaglioDalTesto({ argomenti: ['percorso'] }, 'Scrittura'), 'Scrittura');
});

test('DAL-TESTO-02 — il comando va nel blocco del codice e non si ripete nelle righe', () => {
  const azione = { argomenti: { comando: 'npm test', descrizione: 'Prove' } };
  assert.equal(comandoDalTesto(azione), 'npm test');
  assert.deepEqual(righeDegliArgomenti(azione), [{ k: 'descrizione', v: 'Prove' }]);
  assert.equal(comandoDalTesto({ argomenti: { percorso: 'a.txt' } }), '');
});

test('DAL-TESTO-03 — le righe tengono l\'ordine del modello; un valore non testuale si legge in JSON, mai «[object Object]»', () => {
  const righe = righeDegliArgomenti({ argomenti: { percorso: 'a.json', dati: { b: 1 }, righe: [1, 2] } });
  assert.deepEqual(righe.map((r) => r.k), ['percorso', 'dati', 'righe']);
  assert.equal(righe[1].v, JSON.stringify({ b: 1 }, null, 2));
  assert.ok(!righe.some((r) => r.v.includes('[object Object]')));
});

test('DAL-TESTO-04 — i segreti si oscurano: per forma (dentro il comando e nei valori) e per nome del campo', () => {
  const azione = { argomenti: { comando: `curl -H "Authorization: Bearer ${CHIAVE}" https://x`, api_key: 'qualunque-valore', note: `chiave ${CHIAVE}` } };
  assert.ok(!comandoDalTesto(azione).includes(CHIAVE));
  assert.match(comandoDalTesto(azione), /\[redacted\]/u);
  const righe = righeDegliArgomenti(azione);
  assert.equal(righe.find((r) => r.k === 'api_key').v, '[redacted]');
  assert.ok(!JSON.stringify(righe).includes(CHIAVE));
  // ⛔ al contrario: un valore normale resta com'è
  assert.equal(valoreLeggibile('percorso', 'src/app.js'), 'src/app.js');
  assert.equal(bersaglioDalTesto({ argomenti: { comando: `echo ${CHIAVE}` } }, 'Comando').includes(CHIAVE), false);
});

/* Revisione E1 del 04/11/2026: nelle carte inglesi le etichette erano i nomi grezzi («percorso», «contenuto»). Le etichette usano le voci
   `app.activity.arg.*` del corpo dell'attività (`etichettaArgomento`, 27/10); un campo senza voce resta grezzo; il segreto si riconosce
   sulla chiave grezza, non sull'etichetta. */
const nodoFinto = () => {
  const n = { className: '', dataset: {}, textContent: '', attributi: {}, figli: [] };
  n.setAttribute = (k, v) => { n.attributi[k] = v; };
  n.append = (...xs) => { n.figli.push(...xs); };
  return n;
};
const docFinto = { createElement: () => nodoFinto() };
const etichette = (blocco) => blocco.figli.map((riga) => riga.figli[0].textContent);

test('DAL-TESTO-05 — le etichette degli argomenti si leggono nella lingua dell interfaccia; un campo ignoto resta grezzo', (t) => {
  t.after(() => impostaLingua('it'));
  impostaLingua('en');
  const azione = { argomenti: { percorso: 'note/riassunto.md', contenuto: '# Riassunto', campo_ignoto_mcp: 'x', api_key: CHIAVE } };
  const blocco = bloccoDegliArgomenti(docFinto, azione);
  assert.deepEqual(etichette(blocco), ['path', 'content', 'campo_ignoto_mcp', 'api_key']);
  assert.ok(!JSON.stringify(blocco.figli.map((r) => r.figli[1].textContent)).includes(CHIAVE), 'il segreto resta oscurato');
  impostaLingua('it');
  assert.deepEqual(etichette(bloccoDegliArgomenti(docFinto, azione)).slice(0, 2), ['percorso', 'contenuto']);
  // ⛔ al contrario: le righe pure restano sulla chiave grezza (servono al segreto e alle prove di prima)
  assert.deepEqual(righeDegliArgomenti(azione).map((r) => r.k), ['percorso', 'contenuto', 'campo_ignoto_mcp', 'api_key']);
});
