/*
 * ⭐ Owner 29/10/2026 notte (CONTRATTO-CONTROLLO-SPENTO, bozzetto approvato «Riga leggera»): il controllo delle scritture spento si dice
 *   con la riga della finestra allargata — una riga col file, «Details» che apre il motivo (scelto dal CODICE, mai dal testo inglese del
 *   server) e «Server text». Una riga per evento anche rigiocando la storia; un percorso assoluto non va a schermo.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { leggiControlloSpento, testiControlloSpento, aggiornaRigaControlloSpento, EVENTO_CONTROLLO_SPENTO } from '../../src/components/avviso-controllo-spento.js';
import { trascriviEventoInterno } from '../../src/components/trascrizione-eventi-interni.js';
import { impostaLingua } from '../../src/components/lingua.js';

const PERCHE = "the semantic guard could not run (Cannot find package 'typescript')";
const evento = (valore) => ({ type: 'CUSTOM', name: EVENTO_CONTROLLO_SPENTO, value: { schema: 'talos.controllo-spento.v1', threadId: 't', runId: 'r1', giro: 2, codice: 'compilatore-assente', perche: PERCHE, percorso: 'src/rotte/health.ts', ...valore } });

test('CSP-UI-01 lettura dell\'evento: codice chiuso, percorso solo se relativo, niente per gli altri eventi', () => {
  assert.equal(EVENTO_CONTROLLO_SPENTO, 'talos.controllo-spento');
  assert.deepEqual(leggiControlloSpento(evento()), { codice: 'compilatore-assente', perche: PERCHE, percorso: 'src/rotte/health.ts', chiave: 'r1|2|src/rotte/health.ts' });
  assert.equal(leggiControlloSpento(evento({ codice: 'inventato' })).codice, 'errore-interno');
  assert.equal(leggiControlloSpento(evento({ percorso: 'C:\\Users\\x\\a.ts' })).percorso, null);
  assert.equal(leggiControlloSpento(evento({ percorso: '/data/data/ai.talos.dev/a.ts' })).percorso, null);
  assert.equal(leggiControlloSpento({ type: 'CUSTOM', name: 'talos.mcp-avvio', value: {} }), null);
  assert.equal(leggiControlloSpento({ type: 'CUSTOM', name: EVENTO_CONTROLLO_SPENTO, value: null }), null);
});

test('CSP-UI-02 le parole: il motivo dal codice in inglese e in italiano; senza file la frase generica', () => {
  impostaLingua('en');
  const en = testiControlloSpento(leggiControlloSpento(evento()));
  assert.equal(en.riga, "The write check isn't available here: src/rotte/health.ts wasn't checked");
  assert.match(en.dettagli, /^This installation has no TypeScript compiler\. TALOS couldn't look for names/u);
  assert.doesNotMatch(en.dettagli, /semantic guard/u, 'il testo inglese del server non entra nella frase');
  assert.match(testiControlloSpento(leggiControlloSpento(evento({ codice: 'libreria-assente' }))).dettagli, /^TypeScript's base definitions can't be read\./u);
  assert.match(testiControlloSpento(leggiControlloSpento(evento({ codice: 'errore-interno' }))).dettagli, /^The check stopped on an internal error\./u);
  assert.equal(testiControlloSpento(leggiControlloSpento(evento({ percorso: undefined }))).riga, "The write check isn't available here: this write wasn't checked");
  impostaLingua('it');
  const it = testiControlloSpento(leggiControlloSpento(evento()));
  assert.equal(it.riga, 'Il controllo delle scritture non è disponibile qui: src/rotte/health.ts non è stato verificato');
  assert.match(it.dettagli, /^In questa installazione manca il compilatore TypeScript\./u);
  impostaLingua('en');
});

function documentoFinto() {
  const crea = (tag) => ({
    tagName: tag.toUpperCase(), className: '', dataset: {}, children: [], attributi: {}, ascoltatori: {}, hidden: false, textContent: '', id: '',
    setAttribute(k, v) { this.attributi[k] = String(v); }, getAttribute(k) { return this.attributi[k] ?? null; },
    addEventListener(tipo, f) { (this.ascoltatori[tipo] ??= []).push(f); }, click() { for (const f of this.ascoltatori.click ?? []) f(); },
    append(...figli) { this.children.push(...figli); },
    tutti() { return this.children.filter((c) => c.tagName).flatMap((c) => [c, ...c.tutti()]); },
    querySelectorAll(sel) { return this.tutti().filter((n) => corrisponde(n, sel)); },
    querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; },
  });
  const corrisponde = (n, sel) => {
    if (['button', 'details', 'summary', 'pre'].includes(sel)) return n.tagName === sel.toUpperCase();
    if (sel === '[data-controllo-spento]') return n.dataset.controlloSpento !== undefined;
    return sel.split('.').filter(Boolean).every((c) => n.className.split(' ').includes(c));
  };
  return { createElement: crea, createTextNode: (testo) => ({ testo }) };
}

test('CSP-UI-03 il DOM: la riga sorella della finestra allargata, «Details» apre motivo e testo del server; una riga per evento rigiocato', () => {
  const doc = documentoFinto();
  impostaLingua('en');
  const colonna = doc.createElement('div');
  const valore = leggiControlloSpento(evento());
  const gruppo = aggiornaRigaControlloSpento(colonna, valore, { sessionId: 's1', document: doc });
  assert.ok(gruppo.className.split(' ').includes('talos-window-note'), 'lo stesso contenitore della riga sorella');
  assert.ok(gruppo.querySelector('.talos-context-separator.talos-context-separator--window'));
  assert.equal(gruppo.dataset.codice, 'compilatore-assente');
  const button = gruppo.querySelector('button');
  const dettagli = gruppo.querySelector('.talos-window-note__details');
  assert.equal(dettagli.hidden, true, 'semplice a primo sguardo');
  assert.equal(button.getAttribute('aria-controls'), dettagli.id);
  button.click();
  assert.equal(dettagli.hidden, false);
  assert.equal(button.textContent, 'Hide');
  assert.match(dettagli.children[0].testo, /^This installation has no TypeScript compiler\./u);
  assert.equal(dettagli.querySelector('summary').textContent, 'Server text');
  assert.equal(dettagli.querySelector('pre').textContent, PERCHE);
  button.click();
  assert.equal(dettagli.hidden, true);
  aggiornaRigaControlloSpento(colonna, valore, { sessionId: 's1', document: doc });
  assert.equal(colonna.querySelectorAll('[data-controllo-spento]').length, 1, 'rigiocata: una riga');
  aggiornaRigaControlloSpento(colonna, leggiControlloSpento(evento({ runId: 'r2' })), { sessionId: 's1', document: doc });
  assert.equal(colonna.querySelectorAll('[data-controllo-spento]').length, 2, 'un altro evento: un\'altra riga');
  const senzaMotivo = aggiornaRigaControlloSpento(colonna, leggiControlloSpento(evento({ runId: 'r3', perche: '' })), { sessionId: 's1', document: doc });
  assert.equal(senzaMotivo.querySelector('details'), null, 'senza testo del server, niente dettaglio vuoto');
  assert.equal(aggiornaRigaControlloSpento(colonna, null, { sessionId: 's1', document: doc }), null);
});

test('CSP-UI-04 l\'esportazione della conversazione dice la stessa riga della chat', () => {
  impostaLingua('en');
  assert.deepEqual(trascriviEventoInterno(evento()), { testo: "The write check isn't available here: src/rotte/health.ts wasn't checked" });
});
