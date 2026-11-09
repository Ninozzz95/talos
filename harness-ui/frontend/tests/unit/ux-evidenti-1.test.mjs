import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { AREE } from '../../src/i18n/testi/index.js';
import { riassuntoVoci } from '../../src/components/attivita-segmento.js';
import { specieAttrezzo } from '../../src/components/nomi-attrezzi.js';
import { renderizzaMarkdown } from '../../src/components/markdown.js';

/*
 * Reperti «evidenti» 1, 2, 4 e 5 della revisione d'uso della candidata (Frontend, 04/11/2026,
 * `REVISIONE-UX-UI-CANDIDATA-2026-11-04.md`). Scritte rosse sulla candidata 16ef38f44, prima della cura.
 */

test('UXE-01 — «Mostra ragionamento»: la frase sotto l\'interruttore dice cosa cambia, giusta acceso e spento, nelle due lingue', () => {
  const it = AREE.app.it['reasoning.toggleHint'];
  const en = AREE.app.en['reasoning.toggleHint'];
  // rosso sulla 16ef38f44: «Spento, vedi solo…» si legge come lo stato, e l'interruttore è acceso
  assert.doesNotMatch(it, /^Spento\b/u, it);
  assert.match(it, /^Quando è spento\b/u, it);
  assert.match(en, /^When off\b/u, en);
});

test('UXE-02 — i quattro accenti: «si è», «già», «può», «è»', () => {
  assert.match(AREE.processi.it['session.helpStopped'], /il giro si è chiuso/u);
  assert.match(AREE.modello.it['permissions.filesAndNetworkWithout'], /Solo se sai già cosa/u);
  assert.match(AREE.errori.it['SESSION_NOT_READY.explanation'], /non può accettare/u);
  assert.match(AREE.errori.it['SESSION_NOT_READY.action'], /^Se è stata interrotta/u);
  // la stessa frase della modale Nuova sessione e del foglio Permessi
  assert.equal(AREE.modello.it['permissions.filesAndNetworkWithout'], AREE.varie.it['policy.fullAccess.description']);
});

test('UXE-02b — AL CONTRARIO: nessun testo italiano dice ancora una di queste quattro forme senza accento', () => {
  const sbagliate = /\b(?:si e chius|sai gia\b|non puo\b|Se e stata)/u;
  const trovate = [];
  for (const [area, lingue] of Object.entries(AREE)) {
    for (const [chiave, valore] of Object.entries(lingue.it || {})) if (typeof valore === 'string' && sbagliate.test(valore)) trovate.push(`${area}.${chiave}`);
  }
  assert.deepEqual(trovate, []);
  // il testo di riserva della pagina (prima che il dizionario si applichi) dice lo stesso
  const pagina = readFileSync(new URL('../../index.template.html', import.meta.url), 'utf8');
  assert.doesNotMatch(pagina, /sai gia cosa/u);
  assert.ok(sbagliate.test('Solo se sai gia cosa sta per fare'), 'il rilevatore vede la forma sbagliata');
});

const attrezzo = (nome, argomenti, stato, extra = {}) => ({ tipo: 'tool', nome, argomenti, stato, specie: specieAttrezzo(nome), esito: '', diff: null, ...extra });

test('UXE-04 — la testa del segmento: due chiamate che aspettano il consenso non sono «in corso», aspettano te', () => {
  const r = riassuntoVoci([
    { tipo: 'reasoning', testo: 'penso', durataMs: 1200, stato: 'concluso' },
    attrezzo('shell', { comando: 'node --version' }, 'in-corso', { inConsenso: true }),
    attrezzo('scrivi', { percorso: 'note-ux.txt' }, 'in-corso', { inConsenso: true }),
  ]);
  const riga = r.parti.join(' · ');
  assert.doesNotMatch(riga, /in corso/u, riga);
  assert.match(riga, /aspetta il tuo consenso/u, riga);
  assert.match(r.partiBrevi.join(' · '), /aspetta il tuo consenso/u);
  assert.equal(r.inConsenso, 2);
  assert.equal(r.inCorso, null, 'la frase viva non racconta una chiamata ferma alla carta');
});

test('UXE-04b — AL CONTRARIO: una chiamata in consenso e una che gira davvero — la frase viva racconta quella che gira, «aspetta» l\'altra', () => {
  const vera = attrezzo('shell', { comando: 'npm test' }, 'in-corso');
  const r = riassuntoVoci([
    attrezzo('shell', { comando: 'node --version' }, 'in-corso', { inConsenso: true }),
    vera,
  ]);
  const riga = r.parti.join(' · ');
  assert.doesNotMatch(riga, /2 in corso/u, riga); // una sola gira, e la racconta la frase viva (regola del 10/10)
  assert.match(riga, /aspetta il tuo consenso/u, riga);
  assert.equal(r.inCorso, vera);
  assert.equal(r.inConsenso, 1);
  const conAltra = riassuntoVoci([attrezzo('shell', { comando: 'ls' }, 'in-corso', { inConsenso: true }), vera, attrezzo('shell', { comando: 'pwd' }, 'in-corso')]);
  assert.match(conAltra.parti.join(' · '), /2 in corso · aspetta il tuo consenso/u);
  const senza = riassuntoVoci([attrezzo('shell', { comando: 'npm test' }, 'in-corso'), attrezzo('shell', { comando: 'ls' }, 'in-corso')]);
  assert.doesNotMatch(senza.parti.join(' · '), /consenso/u);
  assert.match(senza.parti.join(' · '), /2 in corso/u);
  assert.equal(senza.inConsenso, 0);
});

/* Il documento finto delle prove del markdown (`markdown-escape.test.mjs`). */
function documentoFinto() {
  const nodo = (tag) => {
    const n = { tag, figli: [], testoProprio: null, attributi: new Map(),
      get textContent() { return n.testoProprio !== null ? n.testoProprio : n.figli.map((f) => f.textContent).join(''); },
      set textContent(v) { n.testoProprio = String(v); n.figli = []; },
      set innerHTML(_v) {}, get innerHTML() { return ''; },
      appendChild: (f) => { n.figli.push(f); return f; }, append: (...f) => n.figli.push(...f),
      setAttribute: (k, v) => n.attributi.set(k, String(v)), getAttribute: (k) => n.attributi.get(k) ?? null,
      className: '', style: {} };
    return n;
  };
  return { createElement: nodo, createDocumentFragment: () => nodo('#fragment'),
    createTextNode: (t) => ({ tag: '#text', figli: [], testo: String(t), get textContent() { return this.testo; } }) };
}
const albero = (testo) => renderizzaMarkdown(testo, { document: documentoFinto() });
const trova = (nodo, tag, fuori = []) => { for (const f of nodo.figli || []) { if (f.tag === tag) fuori.push(f); trova(f, tag, fuori); } return fuori; };

test('UXE-05 — un grassetto attorno a un codice: codice in grassetto, mai gli apici inversi a schermo (CommonMark 0.31.2, es. 428 e 433)', () => {
  const radice = albero('Lancia **`node --version`** adesso');
  const forti = trova(radice, 'strong');
  assert.equal(forti.length, 1);
  assert.equal(forti[0].textContent, 'node --version');
  assert.deepEqual(trova(forti[0], 'code').map((c) => c.textContent), ['node --version']);
  assert.doesNotMatch(radice.textContent, /`/u);
});

test('UXE-05b — dentro il grassetto anche corsivo e codice; e AL CONTRARIO un grassetto semplice resta solo testo', () => {
  const radice = albero('**vedi _questo_ e `x`**');
  const forte = trova(radice, 'strong')[0];
  assert.deepEqual(trova(forte, 'em').map((n) => n.textContent), ['questo']);
  assert.deepEqual(trova(forte, 'code').map((n) => n.textContent), ['x']);
  assert.equal(forte.textContent, 'vedi questo e x');
  const semplice = trova(albero('**solo testo**'), 'strong')[0];
  assert.equal(semplice.textContent, 'solo testo');
  assert.deepEqual(trova(semplice, 'code'), []);
  assert.deepEqual(trova(semplice, 'em'), []);
  // l'escape dentro il grassetto vale ancora (MD-ESCAPE-04)
  assert.equal(trova(albero('**x\\_y**'), 'strong')[0].textContent, 'x_y');
});
