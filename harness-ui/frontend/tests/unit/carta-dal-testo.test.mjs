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

/* Cura gemella della 0.2.2, giro 5 (revisore 1, ROSSO 3 e GIALLO; owner 14/11 14:15 scelta A). ROSSO 3: se la cima degli argomenti è una
   lista, un testo o un numero, il nucleo la porta sulla carta (`argomentiPerLaCarta`) ma la pagina la azzerava (`argomentiDi`): il plugin
   partiva con `["--delete-all","/"]` dopo una carta senza righe. Ora è UNA riga, il suo JSON, come sul terminale. GIALLO: i caratteri di
   direzione e quelli a larghezza zero arrivavano crudi («invoice\u202efdp.exe», due righe che si leggono «path»); ora si vedono come li scrive il
   terminale (`inertText` di `cli/src/tui/overlays/approval-dialog.ts`): `\u202e`, `\u200b`, e la barra rovesciata raddoppiata. */
const valori = (blocco) => blocco.figli.map((riga) => riga.figli.at(-1).textContent);
test('DAL-TESTO-G5-01 — una cima che non è un oggetto (lista, testo, numero) è UNA riga della carta, il suo JSON, mai una carta vuota', () => {
  for (const [cima, atteso] of [[['--delete-all', '/'], '["--delete-all","/"]'], ['rm -rf /', '"rm -rf /"'], [42, '42'], [false, 'false'], ['', '""']]) {
    const righe = righeDegliArgomenti({ argomenti: cima }, { tutti: true });
    assert.deepEqual(righe, [{ k: '', v: atteso }], JSON.stringify(cima));
    const blocco = bloccoDegliArgomenti(docFinto, { argomenti: cima }, { tutti: true });
    assert.ok(blocco, `${JSON.stringify(cima)}: il blocco c'è`);
    assert.deepEqual(valori(blocco), [atteso]);
    /* giro 7 (owner 19:57, variante A del bozzetto): la riga senza nome ha la voce «valore» nella colonna dei nomi */
    assert.equal(blocco.figli[0].figli.length, 2, 'una riga senza nome: la voce «valore» e il valore');
    assert.equal(blocco.figli[0].figli[0].textContent, 'valore');
    assert.equal(blocco.figli[0].figli[0].className, 'talos-kv__k talos-kv__k--generico');
  }
  // anche sulla carta «chiamata scritta come testo»; il bersaglio e il comando restano dagli oggetti
  assert.deepEqual(righeDegliArgomenti({ argomenti: ['a', 'b'] }), [{ k: '', v: '["a","b"]' }]);
  assert.equal(bersaglioDalTesto({ argomenti: ['percorso'] }, 'Scrittura'), 'Scrittura');
  // ⛔ al contrario: argomenti assenti, nulli o un oggetto vuoto non fanno righe
  for (const nulla of [undefined, null, {}]) assert.deepEqual(righeDegliArgomenti({ argomenti: nulla }, { tutti: true }), [], String(nulla));
});

test('DAL-TESTO-G5-02 — la cima non oggetto passa ancora dalla maschera dei segreti', () => {
  const [riga] = righeDegliArgomenti({ argomenti: [`token=${CHIAVE}`] }, { tutti: true });
  assert.ok(!riga.v.includes(CHIAVE), riga.v);
});

test('DAL-TESTO-G5-03 — caratteri di direzione e a larghezza zero si vedono come sul terminale, nel valore e nel nome', () => {
  const azione = { argomenti: { file: 'invoice\u202efdp.exe', path: '/safe', ['pa\u200bth']: '/etc/passwd', ['\u200b']: 'rm -rf /', nota: 'a\u2066b\u2069c\ufeff', bidi: '\u061c\u200e\u200f' } };
  const righe = righeDegliArgomenti(azione, { tutti: true });
  assert.deepEqual(righe.map((r) => r.v), ['invoice\\u202efdp.exe', '/safe', '/etc/passwd', 'rm -rf /', 'a\\u2066b\\u2069c\\ufeff', '\\u061c\\u200e\\u200f']);
  const blocco = bloccoDegliArgomenti(docFinto, azione, { tutti: true });
  assert.deepEqual(etichette(blocco).slice(2, 4), ['pa\\u200bth', '\\u200b'], 'the invisible character of a name is seen, in either language');
  // due righe che prima si leggevano entrambe «path» ora si distinguono
  assert.notEqual(etichette(blocco)[1], etichette(blocco)[2]);
});

test('DAL-TESTO-G5-04 — la stessa forma del terminale: la barra rovesciata raddoppia nel testo, resta com è nel JSON; a capo e tab restano', () => {
  const righe = righeDegliArgomenti({ argomenti: { testo: 'scritto \\u202e a mano', vero: '\u202e', esc: '\u001b[2K', dati: { a: 'x\u200by' }, righe: 'uno\ndue\tfine' } }, { tutti: true });
  assert.deepEqual(righe.map((r) => r.v), ['scritto \\\\u202e a mano', '\\u202e', '\\u001b[2K', '{\n  "a": "x\\u200by"\n}', 'uno\ndue\tfine']);
  // ⛔ al contrario: un valore normale non cambia
  assert.deepEqual(righeDegliArgomenti({ argomenti: { percorso: 'src/app.js', titolo: 'Città è già' } }, { tutti: true }).map((r) => r.v), ['src/app.js', 'Città è già']);
});
