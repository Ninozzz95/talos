/*
 * Decisione dell'owner 163 (04/11/2026, variante A di `variante-13-budget-ram.html`, riga 13 della revisione d'uso della candidata):
 * la banda del Laboratorio modelli diceva «Budget RAM · scenario demo 18,6 GiB su 31,6 GiB» — una soglia FISSA del catalogo, ferma
 * mentre la RAM libera vera saliva e scendeva. Ora dice la RAM libera MISURATA, con l'ora della misura, nel formato del telefono
 * (`mobile/src/lib/models/presentation.ts:95`, `talosFormatBytes`: unità binarie scritte KB/MB/GB, una cifra sotto 10, nessuna da 10
 * in su; MB sotto 1 GB). La scheda della memoria sotto usa lo stesso formato, e il numero grande ha la sua etichetta «liberi».
 * Ogni prova anche al contrario: niente più soglia, niente più «GiB».
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { impostaLingua } from '../../src/components/lingua.js';
import { misuraLeggibile, testoMisura } from '../../src/components/misura-memoria.js';
import { aggiornaBandaLaboratorio } from '../../src/components/lab-cornice-v3.js';
import { documento } from './aiuto-dom-blocchi.mjs';
import { AREE } from '../../src/i18n/testi/index.js';

const GIB = 1024 ** 3;

test('UXD163-01 — il formato è quello del telefono: unità binarie scritte MB/GB, una cifra sotto 10, nessuna da 10 in su', () => {
  try {
    impostaLingua('it');
    assert.deepEqual(misuraLeggibile(7.5 * GIB), { numero: '7,5', unita: 'GB' });
    assert.deepEqual(misuraLeggibile(31.6 * GIB), { numero: '32', unita: 'GB' });
    assert.deepEqual(misuraLeggibile(512 * 1024 ** 2), { numero: '512', unita: 'MB' }, 'sotto 1 GB, MB');
    assert.deepEqual(misuraLeggibile(GIB), { numero: '1', unita: 'GB' });
    assert.deepEqual(misuraLeggibile(9.96 * GIB), { numero: '10', unita: 'GB' });
    assert.equal(testoMisura(1536 * 1024 ** 3), '1,5 TB');
    assert.equal(testoMisura(500), '500 B');
    impostaLingua('en');
    assert.equal(testoMisura(7.5 * GIB), '7.5 GB', 'in inglese il punto, come il telefono');
  } finally { impostaLingua('it'); }
});

/* la banda come la costruisce `lab-cornice-v3.js`, coi suoi ganci, e la scheda della memoria coi dati della misura */
function bandaFinta({ libera = null, totale = null, misuratoIl = null } = {}) {
  const doc = documento();
  const card = doc.createElement('div');
  const banda = doc.createElement('div'); banda.dataset.labBanda = ''; banda.setAttribute('data-lab-banda', '');
  const nodo = (tag, attr) => { const n = doc.createElement(tag); n.setAttribute(attr, ''); return n; };
  const sopra = nodo('span', 'data-lab-banda-sopra-ram');
  const valore = nodo('span', 'data-lab-banda-valore');
  const unita = nodo('span', 'data-lab-banda-unita');
  const frazione = nodo('small', 'data-lab-banda-frazione');
  const barra = nodo('div', 'data-lab-banda-track'); barra.hidden = true;
  const fill = nodo('span', 'data-lab-banda-fill');
  barra.append(fill);
  banda.append(sopra, valore, unita, frazione, barra);
  const memoria = nodo('section', 'data-memory-meter');
  if (libera !== null) memoria.setAttribute('data-memory-libera-byte', String(libera));
  if (totale !== null) memoria.setAttribute('data-memory-totale-byte', String(totale));
  if (misuratoIl) memoria.setAttribute('data-memory-misurato-il', misuratoIl);
  card.append(banda, memoria);
  doc.body.append(card);
  return { card, sopra, valore, unita, frazione, barra, fill };
}

test('UXD163-02 — la banda dice la RAM libera misurata, con l ora, su quanta ce n è; la barra è la RAM in uso', () => {
  impostaLingua('it');
  const b = bandaFinta({ libera: 7.5 * GIB, totale: 31.6 * GIB, misuratoIl: '2026-11-04T15:37:56.000Z' });
  // l'ora è quella italiana anche su una macchina in un altro fuso (qui si finge UTC): come il badge della card
  const fuso = process.env.TZ;
  process.env.TZ = 'UTC';
  try { aggiornaBandaLaboratorio(b.card); } finally { if (fuso === undefined) delete process.env.TZ; else process.env.TZ = fuso; }
  assert.equal(b.sopra.textContent, 'RAM libera · misurata alle 16:37:56', 'l ora in Europe/Rome');
  assert.equal(b.valore.textContent, '7,5');
  assert.equal(b.unita.textContent, 'GB');
  assert.equal(b.frazione.textContent, 'su 32 GB');
  assert.equal(b.barra.hidden, false);
  assert.equal(Number.parseFloat(b.fill.style.width).toFixed(1), (100 * (31.6 - 7.5) / 31.6).toFixed(1));
  assert.equal(b.barra.getAttribute('data-livello'), 'alto', 'oltre il 75 % in uso la barra si scalda, come nel bozzetto');
  // la misura dopo: un modello chiuso libera memoria, e la banda la segue
  b.card.querySelector('[data-memory-meter]').setAttribute('data-memory-libera-byte', String(20 * GIB));
  aggiornaBandaLaboratorio(b.card);
  assert.equal(b.valore.textContent, '20');
  assert.equal(b.barra.getAttribute('data-livello'), 'normale');
  // AL CONTRARIO: niente soglia del catalogo, niente GiB
  assert.doesNotMatch(`${b.sopra.textContent} ${b.valore.textContent} ${b.unita.textContent} ${b.frazione.textContent}`, /18,6|GiB|budget|demo/iu);
});

test('UXD163-03 — senza misura la banda non inventa: «RAM libera», nessun numero, nessuna frazione, nessuna barra', () => {
  impostaLingua('it');
  const b = bandaFinta();
  aggiornaBandaLaboratorio(b.card);
  assert.equal(b.sopra.textContent, 'RAM libera');
  assert.equal(b.valore.textContent, '—');
  assert.equal(b.unita.textContent, '');
  assert.equal(b.frazione.textContent, '');
  assert.equal(b.barra.hidden, true);
  impostaLingua('en');
  try {
    const e = bandaFinta({ libera: 3 * GIB, totale: 16 * GIB, misuratoIl: '2026-11-04T15:37:56.000Z' });
    aggiornaBandaLaboratorio(e.card);
    assert.match(e.sopra.textContent, /^Free RAM · measured at /u);
    assert.equal(e.frazione.textContent, 'out of 16 GB');
  } finally { impostaLingua('it'); }
});

test('UXD163-04 — AL CONTRARIO nel sorgente e nel dizionario: la soglia «scenario demo» e l unità «GiB» sono uscite dalla banda e dalla scheda', () => {
  const banda = readFileSync(new URL('../../src/components/lab-cornice-v3.js', import.meta.url), 'utf8');
  assert.doesNotMatch(banda, /export const BUDGET_DEMO_GIB/u);
  const memoria = readFileSync(new URL('../../src/components/misura-memoria.js', import.meta.url), 'utf8');
  assert.doesNotMatch(memoria, /' GiB'/u);
  for (const lingua of ['it', 'en']) {
    assert.equal(AREE.modelli[lingua]['lab.demoRamBudget'], undefined, lingua);
    assert.equal(AREE.modelli[lingua]['lab.gibUnit'], undefined, lingua);
    assert.doesNotMatch(AREE.modelli[lingua]['memory.notice'], /GiB/u, lingua);
  }
  assert.equal(AREE.modelli.it['memory.freeLabel'], 'liberi');
  assert.equal(AREE.modelli.en['memory.freeLabel'], 'free');
});

test('UXD163-05 — i bordi del formato: 1 KB esatto, niente separatore delle migliaia, come il telefono', () => {
  impostaLingua('it');
  assert.equal(testoMisura(1023), '1023 B');
  assert.equal(testoMisura(1024), '1 KB', 'da 1024 byte in su si sale di unità, come `talosFormatBytes`');
  assert.equal(testoMisura(1000 * 1024 ** 2), '1000 MB', 'useGrouping:false — «1.000 MB» sarebbe un numero diverso da quello del telefono');
  assert.equal(testoMisura(1023.96 * 1024 ** 2), '1024 MB');
});

test('UXD163-06 — una misura incoerente (più libera che totale) non diventa un rapporto', () => {
  impostaLingua('it');
  const b = bandaFinta({ libera: 64 * GIB, totale: 32 * GIB, misuratoIl: '2026-11-04T15:37:56.000Z' });
  aggiornaBandaLaboratorio(b.card);
  assert.equal(b.valore.textContent, '—');
  assert.equal(b.frazione.textContent, '');
  assert.equal(b.barra.hidden, true);
});

test('UXD163-07 — la card della memoria: i byte misurati sui suoi dati, e la parola «liberi» solo quando c è una misura', async () => {
  const prima = globalThis.document;
  globalThis.document = documento();
  try {
    impostaLingua('it');
    const { creaMisuraMemoria, aggiornaMisuraMemoria } = await import('../../src/components/misura-memoria.js');
    const card = creaMisuraMemoria();
    const parola = card.querySelector('[data-memory-free-label]');
    assert.ok(parola, 'la parola «liberi» ha il suo nodo');
    assert.equal(parola.hidden, true, 'senza misura la parola non si vede');
    const capacita = { schema: 'talos.model-lab.capacity/1', measuredAt: '2026-11-04T15:37:56.000Z', memory: { totalBytes: 32 * GIB, freeBytes: 7.5 * GIB }, storage: { availableBytes: 100 * GIB, reserveBytes: GIB, allocatableBytes: 99 * GIB } };
    aggiornaMisuraMemoria(card, { capacita });
    assert.equal(parola.hidden, false);
    assert.equal(parola.textContent, 'liberi');
    assert.equal(card.dataset.memoryLiberaByte, String(7.5 * GIB));
    assert.equal(card.dataset.memoryTotaleByte, String(32 * GIB));
    aggiornaMisuraMemoria(card, {});
    assert.equal(parola.hidden, true, 'la misura se ne va, e la parola con lei');
    assert.equal(card.dataset.memoryLiberaByte, undefined);
    assert.equal(card.dataset.memoryTotaleByte, undefined);
  } finally { globalThis.document = prima; }
});
