/*
 * Revisione UX della candidata, 04/11/2026 (agente Z), riga 37 — Home, riquadro «Il tuo agente»:
 * dalla Home «Scegli un modello» → DeepSeek → «Fatto», e il riquadro restava su «Nessun modello selezionato» mentre il piede della barra
 * diceva già «Tema Forge · DeepSeek». La Home si ridisegnava solo entrando nella vista o a fine lettura: il cambio di `state.model`
 * passava dal piede (`aggiornaPiedeSidebar`) e non arrivava mai al riquadro.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { documento, clic } from './aiuto-dom-blocchi.mjs';
import { createWorkspaceChrome } from '../../src/features/navigation/workspace-chrome.ts';

function banco(modello) {
  const doc = documento();
  const radice = doc.createElement('section');
  radice.setAttribute('id', 'schermoHome');
  doc.body.append(radice);
  doc.getElementById = (id) => (id === 'schermoHome' ? radice : null);
  doc.createDocumentFragment = () => doc.createElement('#fragment');
  doc.querySelector = () => null;
  doc.documentElement = doc.createElement('html');
  globalThis.CSS ??= { escape: (s) => String(s) };
  const stato = { modello };
  const ui = createWorkspaceChrome({
    document: doc, translate: (k) => k, apiGet: () => new Promise(() => {}), navigate() {},
    openProject() {}, openModel() {}, openProviders() {}, openSession() {}, describeSession: () => '',
    currentSession: () => null, currentWorkspace: () => null, currentModel: () => stato.modello,
    setInspectorVisible() {}, preferences: { read: () => ({ density: 'comfortable', restoreWorkspace: false }), subscribe: () => () => {} },
  });
  const testoModello = () => radice.querySelector('.workspace-model')?.textContent;
  return { ui, stato, radice, testoModello };
}

test('UX-37-01 scelto il modello, il riquadro della Home lo mostra subito', () => {
  const b = banco('');
  b.ui.update('home');
  assert.equal(b.testoModello(), 'home.noModelSelected');
  b.stato.modello = 'openrouter:deepseek/deepseek-v4.1-flash';
  b.ui.modelChanged();
  assert.ok(b.testoModello() && b.testoModello() !== 'home.noModelSelected', 'il riquadro restava su «Nessun modello selezionato»');
  assert.doesNotMatch(b.testoModello(), /^openrouter:/u, 'il nome a schermo è quello della barra, non il valore grezzo');
  // (il DOM finto legge il punto di «home.changeModel» come una classe: si cerca fra i bottoni)
  assert.ok(b.radice.querySelectorAll('button').some((x) => x.dataset.homeAction === 'home.changeModel'), 'il pulsante diventa «Cambia modello»');
  b.ui.dispose();
});

test('UX-37-02 fuori dalla Home, o con lo stesso modello, non si ridisegna niente', () => {
  const b = banco('chatgpt:gpt-6-luna');
  b.ui.update('home');
  const prima = b.radice.querySelector('.workspace-model');
  b.ui.modelChanged();
  assert.ok(b.radice.querySelector('.workspace-model') === prima, 'stesso modello: la Home non si ridisegna (niente sfarfallio a ogni ridisegno della barra)');
  b.ui.update('chat');
  const fuori = b.radice.querySelector('.workspace-model');
  b.stato.modello = 'openrouter:deepseek/deepseek-v4.1-flash';
  b.ui.modelChanged();
  assert.ok(b.radice.querySelector('.workspace-model') === fuori, 'fuori dalla Home un cambio di modello non ridisegna la Home nascosta (mutante M11)');
  b.ui.update('home');
  assert.doesNotMatch(b.testoModello(), /gpt-6-luna/u, 'tornati nella Home si legge il modello nuovo');
  b.ui.dispose();
});

test('UX-37-03 il piede della barra avvisa la Home a ogni cambio di modello', () => {
  const app = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
  const corpo = app.slice(app.indexOf('function aggiornaPiedeSidebar()'), app.indexOf('function aggiornaPiedeSidebar()') + 1200);
  assert.match(corpo, /workspaceUI\?\.modelChanged\(\)/u);
});
void clic;
