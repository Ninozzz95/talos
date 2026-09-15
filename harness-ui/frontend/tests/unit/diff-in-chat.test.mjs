import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { creaDiffInChat } from '../../src/components/conversazione.js';
import { raggruppaInHunk } from '../../src/components/diff-hunk.js';

/*
 * ⛔⛔ PO-11 — la RESA del diff in chat.
 *
 * Owner 09/09: «quando un file viene modificato non c'è il diff direttamente nella chat». Prima,
 * aprendo la riga della scrittura, si leggeva il testo grezzo dell'argomento dell'attrezzo:
 * `percorso: … / contenuto: … / Esito: written: …`.
 *
 * ⛔ Il finto qui sotto imita il vero anche in `createTextNode`: `creaDiffInChat` lo usa per il testo
 *   della riga (non `textContent`, che cancellerebbe i due span di numero e segno). Un finto che non
 *   lo avesse misurerebbe il finto — è già successo tre volte in questo repo.
 */
function nodoFinto(tag) {
  const attributi = new Map();
  const nodo = {
    tag, figli: [], classi: new Set(), ascolti: [], testoProprio: null, open: false,
    get className() { return [...nodo.classi].join(' '); },
    set className(v) { nodo.classi = new Set(String(v).split(/\s+/).filter(Boolean)); },
    get textContent() { return nodo.testoProprio !== null ? nodo.testoProprio : nodo.figli.map((f) => f.textContent ?? '').join(''); },
    set textContent(v) { nodo.testoProprio = String(v); nodo.figli = []; },
    setAttribute: (k, v) => attributi.set(k, String(v)),
    getAttribute: (k) => (attributi.has(k) ? attributi.get(k) : null),
    append: (...x) => nodo.figli.push(...x),
    addEventListener: (t, m) => nodo.ascolti.push({ t, m }),
    tutti(classe, dentro = []) {
      if (nodo.classi.has(classe)) dentro.push(nodo);
      for (const f of nodo.figli) f.tutti?.(classe, dentro);
      return dentro;
    },
    trovaTag(t) { return nodo.tag === t ? nodo : nodo.figli.map((f) => f.trovaTag?.(t)).find(Boolean) || null; },
  };
  return nodo;
}

const documentoFinto = () => ({
  createElement: (tag) => nodoFinto(tag),
  createTextNode: (testo) => ({ tag: '#text', textContent: String(testo), figli: [], tutti: () => [], trovaTag: () => null }),
});

/** Un LCS minimo, solo per costruire l'ingresso della resa: il calcolo vero vive in app.js. */
function daTesti(prima, dopo) {
  const a = prima.split('\n');
  const b = dopo.split('\n');
  const righe = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { righe.push(['ctx', a[i]]); i += 1; j += 1; }
    else if (j < b.length && !a.includes(b[j])) { righe.push(['add', b[j]]); j += 1; }
    else if (i < a.length) { righe.push(['del', a[i]]); i += 1; }
    else { righe.push(['add', b[j]]); j += 1; }
  }
  return righe;
}

test('PO-11: il diff compare, con le righe aggiunte e tolte distinte', () => {
  const righe = daTesti('uno\ndue\ntre', 'uno\nDUE\ntre');
  const blocco = creaDiffInChat(raggruppaInHunk(righe), { percorso: 'src/conti.mjs', document: documentoFinto() });
  assert.ok(blocco, 'il blocco esiste');
  assert.equal(blocco.getAttribute('data-c'), 'DiffInChat');
  assert.equal(blocco.tutti('talos-diff__line--add').length, 1);
  assert.equal(blocco.tutti('talos-diff__line--del').length, 1);
  assert.ok(blocco.textContent.includes('DUE'), 'il testo nuovo si legge');
  assert.ok(blocco.textContent.includes('src/conti.mjs'), 'e si sa quale file');
});

/* ⛔ Numero e segno stanno in due span che non si selezionano: copiando si prende il codice. */
test('PO-11: ogni riga ha il suo numero e il suo segno, separati dal testo', () => {
  const blocco = creaDiffInChat(raggruppaInHunk(daTesti('a\nb', 'a\nB')), { document: documentoFinto() });
  const numeri = blocco.tutti('talos-diff-chat__num');
  const segni = blocco.tutti('talos-diff-chat__segno');
  assert.ok(numeri.length >= 2);
  assert.equal(numeri.length, segni.length, 'un numero e un segno per riga');
  assert.ok(segni.some((s) => s.textContent === '+'));
  assert.ok(segni.some((s) => s.textContent === '−'));
  assert.ok(numeri.some((n) => n.textContent === ''), 'la riga tolta non ha numero: non esiste più in quel file');
});

test('PO-11: un diff corto nasce APERTO, uno lungo chiuso', () => {
  const corto = creaDiffInChat(raggruppaInHunk(daTesti('a\nb', 'a\nB')), { document: documentoFinto() });
  assert.equal(corto.trovaTag('details').open, true, 'tre righe chiuse costringono a un clic per niente');
  const righeLunghe = Array.from({ length: 120 }, (_, i) => ['add', `riga ${i}`]);
  const lungo = creaDiffInChat(raggruppaInHunk(righeLunghe), { document: documentoFinto() });
  assert.equal(lungo.trovaTag('details').open, false, 'centoventi righe aperte sommergono la conversazione');
});

test('PO-11: l’intestazione del pezzo dice le righe a PAROLE, non in sintassi git', () => {
  const righe = Array.from({ length: 40 }, (_, i) => (i === 20 ? ['add', 'nuova'] : ['ctx', `riga ${i}`]));
  const blocco = creaDiffInChat(raggruppaInHunk(righe), { document: documentoFinto() });
  const testa = blocco.tutti('talos-diff-chat__righe')[0];
  assert.match(testa.textContent, /^righe \d+-\d+$/, `atteso «righe N-M», trovato: ${testa.textContent}`);
  assert.ok(!blocco.textContent.includes('@@'), '⛔ «@@ -20,7 +20,8 @@» è sintassi di git, non lingua di questa interfaccia');
});

/* ⛔ AL CONTRARIO: senza cambiamenti non si disegna niente. Meglio nessun diff che un diff finto. */
test('PO-11, AL CONTRARIO: nessun cambiamento, nessun blocco', () => {
  assert.equal(creaDiffInChat(raggruppaInHunk([['ctx', 'a'], ['ctx', 'b']]), { document: documentoFinto() }), null);
  assert.equal(creaDiffInChat(null, { document: documentoFinto() }), null);
  assert.equal(creaDiffInChat({ pezzi: [] }, { document: documentoFinto() }), null);
});

test('PO-11: quando si taglia, si dice quanto resta fuori E il totale resta vero', () => {
  const righe = [];
  for (let i = 0; i < 600; i += 1) righe.push(i % 20 === 0 ? ['add', `nuova ${i}`] : ['ctx', `riga ${i}`]);
  const gruppi = raggruppaInHunk(righe, { tetto: 30 });
  const blocco = creaDiffInChat(gruppi, { document: documentoFinto() });
  const resto = blocco.tutti('talos-diff-chat__resto')[0];
  assert.ok(resto, 'il taglio si dichiara');
  assert.match(resto.textContent, /non sono mostrati/);
  assert.ok(resto.textContent.includes(`+${gruppi.aggiunte}`), '⛔ il totale conta TUTTE le modifiche, anche quelle non mostrate');
});

/* Una classe senza regola è una riga invisibile; un foglio non importato è un foglio che non esiste. */
test('PO-11: le classi nuove hanno una regola, e il foglio è importato', () => {
  const qui = path.dirname(fileURLToPath(import.meta.url));
  const css = readFileSync(path.join(qui, '../../src/styles/diff-in-chat.css'), 'utf8');
  for (const classe of ['talos-diff-chat', 'talos-diff-chat__pezzo', 'talos-diff-chat__num', 'talos-diff-chat__segno', 'talos-diff-chat__resto']) {
    assert.ok(css.includes(`.${classe}`), `manca la regola per .${classe}`);
  }
  const main = readFileSync(path.join(qui, '../../src/styles/main.css'), 'utf8');
  assert.ok(main.includes("@import './diff-in-chat.css'"), '⛔ un foglio non importato è un foglio che non esiste');
  assert.ok(css.includes('prefers-reduced-motion'), 'chi ha chiesto meno movimento non deve vedere il segno ruotare');
});
