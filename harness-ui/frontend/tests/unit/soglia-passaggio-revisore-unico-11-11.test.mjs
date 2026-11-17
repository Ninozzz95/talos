/*
 * 11/11/2026 — passaggio dopo il revisore unico della soglia (GIALLO, giudice v1541; brief `BRIEF-AGENTE-SOGLIA-200K-E-SCRITTA-245-2026-11-11.md`,
 * sezione «Passaggio dopo il revisore unico», punti 2, 3, 4 e 7). Nate ROSSE sulla testa `ea437f67b`.
 * Fonti: Codex `models-manager/src/model_info.rs:20-26` (la finestra efficace è il minimo, e si dice quella); Claude Code `CHANGELOG.md:1709`
 *   (la finestra dell'auto-compattazione salvata per modello: la scritta si dice scritta); Hermes `agent/model_metadata.py:2219` (la scritta vince).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { documento } from './aiuto-dom-blocchi.mjs';
import { limiteCheAgisce, percheDelLimite } from '../../src/components/contesto-scheda.js';
import { kilo } from '../../src/components/inspector.js';
import { impostaLingua } from '../../src/components/lingua.js';
import { piega } from '../../src/components/pannello/comune.js';
import { TESTI } from '../../src/i18n/testi/index.js';
import { montaCartaMemoriaModello } from '../../src/components/carta-memoria-modello.js';

test('SG3-FR-01 (punto 2): da un milione in su «1M», mai «1000k» né «1,000k», in italiano e in inglese', () => {
  try {
    impostaLingua('it');
    assert.equal(kilo(1_000_000), '1M');
    assert.equal(kilo(1_500_000), '1,5M');
    assert.equal(kilo(1_048_576), '1M');
    assert.equal(kilo(999_999), '1000k', 'sotto il milione resta in k (999.999 si arrotonda, come prima)');
    assert.equal(kilo(200_000), '200k');
    impostaLingua('en');
    assert.equal(kilo(1_000_000), '1M');
    assert.equal(kilo(1_500_000), '1.5M');
    assert.equal(kilo(163_840), '163.8k');
  } finally { impostaLingua('it'); }
});

test('SG3-FR-02 (punto 4): col tetto del motore che il server dice `explicit-cap` + `engineCeiling`, il PC scrive ancora «lo stesso tetto del motore»', () => {
  const politica = { triggerTokens: 200_000, warningTokens: 160_000, windowTokens: 1_000_000, source: 'explicit-cap', engineCeiling: true };
  const p = percheDelLimite(limiteCheAgisce({ politica }));
  assert.deepEqual(p, { chiave: 'processi.inspector.limitWhyCeiling', soglia: 200_000, finestra: 1_000_000 });
  // al contrario: un tetto scritto apposta (senza engineCeiling) resta il suo perché
  assert.equal(percheDelLimite(limiteCheAgisce({ politica: { ...politica, engineCeiling: undefined, triggerTokens: 150_000 } })).chiave, 'processi.inspector.limitWhyCap');
  // la memoria scritta sopra il catalogo si dice anche quando agisce il tetto del motore
  assert.equal(percheDelLimite(limiteCheAgisce({ politica: { ...politica, windowWrittenAboveCatalog: 163_840, windowWritten: true } })).chiave, 'processi.inspector.limitWhyWrittenAbove');
});

test('SG3-FR-03 (punto 3, foto 7): una memoria scritta SOTTO il catalogo dice che l\'ha scritta la persona, EN e IT', () => {
  const politica = { triggerTokens: 49_152, warningTokens: 39_321, windowTokens: 65_536, source: 'route-minimum', windowWritten: true };
  assert.deepEqual(percheDelLimite(limiteCheAgisce({ politica })), { chiave: 'processi.inspector.limitWhyWritten', soglia: 49_152, finestra: 65_536 });
  assert.match(TESTI.en['processi.inspector.limitWhyWritten'], /^Written by you \(\{finestra\}\): TALOS compacts above \{soglia\}\.$/u);
  assert.match(TESTI.it['processi.inspector.limitWhyWritten'], /^Scritta da te \(\{finestra\}\): TALOS compatta oltre \{soglia\}\.$/u);
  assert.equal(percheDelLimite(limiteCheAgisce({ politica: { ...politica, windowWritten: undefined } })).chiave, 'processi.inspector.limitWhyWindow', 'al contrario: letta, la riga di oggi');
});

test('SG3-FR-04 (punto 3, foto 1-3): la piega «Finestra del contesto» aperta non ripete sotto il titolo il perché che mostra intero', () => {
  const d = documento();
  const ui = { piegheAperte: new Set(['dettagli-finestra']), compatte: new Set(), ridisegna() {} };
  const contenuto = () => { const p = d.createElement('p'); p.textContent = 'IL PERCHÉ'; return p; };
  const aperta = piega(d, ui, { chiave: 'dettagli-finestra', titolo: 'Finestra', sotto: 'IL PERCHÉ', contenuto, sottoSoloDaChiusa: true });
  assert.equal(aperta.textContent.split('IL PERCHÉ').length - 1, 1, `una volta sola: ${aperta.textContent}`);
  const chiusa = piega(d, { ...ui, piegheAperte: new Set() }, { chiave: 'dettagli-finestra', titolo: 'Finestra', sotto: 'IL PERCHÉ', contenuto, sottoSoloDaChiusa: true });
  assert.equal(chiusa.textContent.split('IL PERCHÉ').length - 1, 1, 'chiusa: il perché sotto il titolo resta');
  const altra = piega(d, ui, { chiave: 'dettagli-finestra', titolo: 'Finestra', sotto: 'SOTTO', contenuto });
  assert.match(altra.textContent, /SOTTO/u, 'le altre pieghe restano come oggi');
});

/* ---------- la carta «Memoria del modello» con un DOM finto (come `rev22-dom-finto.test.mjs`) ---------- */
function elemento(nome) {
  const figli = new Map(); const ascoltatori = {}; const attributi = new Map();
  return {
    nome, dataset: {}, style: {}, hidden: false, disabled: false, textContent: '', value: '', innerHTML: '', placeholder: '', title: '', opzioni: [], isConnected: false, nextElementSibling: null,
    setAttribute(k, v) { attributi.set(k, String(v)); }, getAttribute(k) { return attributi.has(k) ? attributi.get(k) : null; },
    addEventListener(tipo, fn) { (ascoltatori[tipo] ??= []).push(fn); }, removeEventListener() {},
    emetti(tipo, evento) { for (const fn of ascoltatori[tipo] ?? []) fn(evento); },
    querySelector(sel) { if (!figli.has(sel)) figli.set(sel, elemento(sel)); return figli.get(sel); },
    replaceChildren(...voci) { this.opzioni = voci; }, append(n) { if (n) n.isConnected = true; }, after(n) { this.nextElementSibling = n; n.isConnected = true; },
    closest() { return null; },
  };
}
const ok = (data) => ({ ok: true, json: async () => ({ ok: true, data }) });
function bancoCarta({ inUso }) {
  const pannello = elemento('pannello');
  pannello.querySelector = () => null; // nessuna carta sorella: la carta si appende al pannello
  const documento = {
    createElement: (tag) => elemento(tag), getElementById: (id) => (id === 'setting-panel-memoria' ? pannello : null),
    addEventListener() {}, removeEventListener() {}, documentElement: elemento('radice'),
  };
  const fetchFn = async (url) => {
    const u = String(url);
    if (u.startsWith('/api/v1/context-settings/model-window')) return inUso(new URL(u, 'http://x').searchParams.get('model'));
    if (u === '/api/v1/context-settings') return ok({ finestreDeiModelli: { 'acme/a': 200_000 } });
    if (u === '/api/v1/sessions') return ok({ items: [{ modello: 'acme/a', avviataAlle: '2026-11-11T10:00:00Z' }, { modello: 'acme/b', avviataAlle: '2026-11-11T09:00:00Z' }] });
    return { ok: false, json: async () => null };
  };
  const carta = montaCartaMemoriaModello({ documento, fetchFn });
  return { carta, pannello };
}
const giri = async (n = 20) => { for (let i = 0; i < n; i += 1) await new Promise((r) => { setImmediate(r); }); };

test('SG3-FR-05 (punto 7, R4 del revisore): la carta tiene la risposta dell\'ULTIMO modello scelto, non quella arrivata per ultima', { timeout: 15_000 }, async () => {
  impostaLingua('en');
  const attese = new Map();
  const { carta, pannello } = bancoCarta({ inUso: (modello) => new Promise((r) => { attese.set(modello, () => r(ok({ modello, finestra: modello === 'acme/a' ? 200_000 : 65_536, fonte: 'persona', letta: { finestra: 128_000, fonte: 'prudente' } }))); }) });
  let scheda = null;
  pannello.append = (n) => { scheda = n; n.isConnected = true; };
  try {
    const lettura = carta.leggi(); // la prima lettura aspetta la memoria in uso del primo modello: si risponde qui sotto
    await giri();
    attese.get('acme/a')?.();
    await lettura; await giri();
    const select = scheda.querySelector('#setting-memoriaModello');
    select.emetti('change', { target: { value: 'acme/a' } }); // la domanda per «a» resta in volo…
    select.emetti('change', { target: { value: 'acme/b' } }); // …la persona sceglie «b»
    await giri();
    attese.get('acme/b')(); await giri();
    attese.get('acme/a')(); await giri(); // la risposta vecchia arriva DOPO
    const riga = scheda.querySelector('[data-memoria-modello-in-uso]');
    assert.equal(riga.hidden, false, 'la riga «in uso» resta quella di «b»');
    assert.match(riga.textContent, /65,536/u, riga.textContent);
  } finally { carta.distruggi(); impostaLingua('it'); }
});

test('SG3-FR-06 (punto 2): il campo e il suggerimento scrivono i numeri coi separatori della lingua; il menu ha il nome intero e lo spazio per mostrarlo', async () => {
  const { carta, pannello } = bancoCarta({ inUso: async (modello) => ok({ modello, finestra: 200_000, fonte: 'persona', letta: { finestra: 163_840, fonte: 'catalogo' } }) });
  let scheda = null;
  pannello.append = (n) => { scheda = n; n.isConnected = true; };
  try {
    impostaLingua('it');
    await carta.leggi(); await giri(40);
    const campo = scheda.querySelector('[data-memoria-modello-valore]');
    assert.equal(campo.value, '200.000');
    assert.equal(campo.placeholder, '200.000');
    impostaLingua('en'); carta.disegna(true);
    assert.equal(campo.value, '200,000');
    const select = scheda.querySelector('#setting-memoriaModello');
    assert.match(select.title, /^OpenRouter · acme\/a$/u, `il nome intero al passaggio del puntatore: ${select.title}`);
    /* le misure stanno nel foglio: un `style=` nella carta la CSP `style-src 'self'` (http-app.mjs:1194) lo spegne, e la foto 4 lo ha mostrato */
    assert.equal(/\sstyle=/u.test(scheda.innerHTML), false, 'nessun attributo style nella carta');
    const foglio = readFileSync(new URL('../../src/design-system/settings.css', import.meta.url), 'utf8');
    assert.match(foglio, /\[data-settings-card="memoria-modello"\] \.talos-setting > \.settings-field-control \{ max-width: min\(100%, 440px\); width: 55%; \}/u, 'la colonna del menu si allarga oltre i 230 px di settings.css:316');
    assert.match(foglio, /\[data-settings-card="memoria-modello"\] \[data-memoria-modello-in-uso\] \{ max-width: none; \}/u, 'la riga «in uso» non va a capo a 49ch');
  } finally { carta.distruggi(); impostaLingua('it'); }
});
