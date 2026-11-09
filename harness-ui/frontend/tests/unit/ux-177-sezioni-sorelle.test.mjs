import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { documento } from './aiuto-dom-blocchi.mjs';

/*
 * Decisione 177 dell'owner (04/11/2026, reperti N9 e N3b della revisione UX 1-27): tre incoerenze fra sezioni sorelle si
 * allineano alla sorella giusta, senza inventare niente.
 *   (a) la riga «Seleziona visibili» ha la stessa cornice in Note, Automazioni e Libreria che in Attività e Memoria;
 *   (b) la card dell'Attività ha UNA casella quadrata (la selezione, in alto a destra, come Memoria e Note): il segno «fatta»
 *       a sinistra è tondo, come il segno a sinistra della card di Memoria;
 *   (c) Libreria e Ricerca senza sessione non mostrano ricerca, ordine, viste e «Aggiorna» su un elenco che non c'è.
 * Scritta rossa sulla candidata c45b49fbb, prima della cura. Il browser (`cure-ux-21-27.spec.mjs`, UX177-*) misura lo stile
 * calcolato; qui le regole e il disegno della barra, in pochi millisecondi.
 */
const css = readFileSync(new URL('../../src/styles/mockup-td.css', import.meta.url), 'utf8');

/* Le regole che nominano `selettore` (senza i commenti), col loro corpo. */
function regole(selettore) {
  const senzaCommenti = css.replace(/\/\*[\s\S]*?\*\//gu, '');
  const trovate = [];
  for (const m of senzaCommenti.matchAll(/([^{}]+)\{([^{}]*)\}/gu)) {
    if (m[1].includes(selettore)) trovate.push({ selettore: m[1].trim(), corpo: m[2] });
  }
  return trovate;
}

test('UX177-A — nessuna sezione sorella toglie la cornice alla riga della selezione', () => {
  const base = regole('.td-bulk').find((r) => r.selettore === '.td-bulk');
  assert.ok(base, 'la regola di base `.td-bulk` c’è');
  assert.match(base.corpo, /border:\s*1px solid var\(--talos-border\)/u, 'la cornice di Attività e Memoria');
  const tolgono = regole('.td-bulk')
    .filter((r) => r.selettore !== '.td-bulk' && /\bborder:\s*0\b|\bpadding:\s*0\b|background:\s*transparent/u.test(r.corpo))
    .map((r) => r.selettore);
  assert.deepEqual(tolgono, [], 'Note, Automazioni e Libreria non la tolgono più');
  // verso contrario: lo stato nascosto resta (con l'elenco vuoto la riga non c'è)
  assert.ok(regole('.td-bulk[hidden]').some((r) => /display:\s*none/u.test(r.corpo)));
});

test('UX177-B — il segno «fatta» dell’Attività è tondo: la sola casella quadrata della card è la selezione', () => {
  const segno = regole('.td-task-toggle').find((r) => r.selettore === '.td-task-toggle');
  assert.ok(segno, 'la regola `.td-task-toggle` c’è');
  const raggio = /border-radius:\s*([^;]+);/u.exec(segno.corpo)?.[1]?.trim();
  assert.ok(raggio === '999px' || raggio === '50%', `tondo, non una casella (raggio «${raggio}»)`);
  // la selezione resta una casella vera, la stessa di Memoria e Note
  const adattatori = readFileSync(new URL('../../src/components/sezioni-adattatori.js', import.meta.url), 'utf8');
  assert.match(adattatori, /nodo\(doc, 'button', 'td-task-toggle'\)/u, 'il segno è un pulsante, non una seconda casella');
});

/* Un DOM finto basta: la sezione si monta con le voci, uno stato e i filtri, come la monta `legacy/app.js`. */
async function monta({ voci = [], stato = {} } = {}) {
  const { montaSezione } = await import(`../../src/components/sezione-elenco-dettaglio.js?ux177=${Math.random()}`);
  const doc = documento();
  /* quel che il DOM finto dei blocchi non ha e la sezione usa: le proprietà di stile e gli ascolti della finestra */
  for (const crea of ['createElement', 'createElementNS']) {
    const originale = doc[crea];
    doc[crea] = (...a) => {
      const n = originale(...a);
      n.style.setProperty = (k, v) => { n.style[k] = v; };
      n.style.removeProperty = (k) => { delete n.style[k]; };
      return n;
    };
  }
  const schermo = doc.createElement('section');
  doc.body?.append?.(schermo);
  montaSezione(schermo, {
    chiave: 'ux177', nome: 'Libreria', sostantivo: 'file', voci, stato,
    filtri: [{ id: 'tutte', etichetta: 'Tutte' }, { id: 'pdf', etichetta: 'PDF', quando: () => true }],
    titoloDi: (v) => v.titolo, quandoDi: () => null, cercaIn: (v) => v.titolo, idDi: (v) => v.id,
    vuoto: { titolo: 'Niente', testo: 'Niente da mostrare.' },
    scheda: () => ({}),
  });
  return { barra: schermo.querySelector('.td-toolbar') }; // dal DOM, non dallo stato: la candidata non la teneva fra i nodi
}

test('UX177-C — senza sessione (avviso) la barra non c’è; con le voci, o senza avviso, resta', async () => {
  const nodi = await monta({ stato: { avviso: 'Apri una sessione per leggere la Libreria del progetto.' } });
  assert.equal(nodi.barra.hidden, true, 'ricerca, ordine, viste e «Aggiorna» su un elenco che non c’è: via');
  const vuota = await monta({ stato: {} });
  assert.equal(vuota.barra.hidden, false, 'verso contrario: elenco vuoto con la sessione, la barra resta (si può aggiornare)');
  const piena = await monta({ voci: [{ id: 'a', titolo: 'A' }], stato: { avviso: 'qualcosa' } });
  assert.equal(piena.barra.hidden, false, 'verso contrario: con le voci la barra serve');
});
