/* Revisione K (04/11/2026): prove proposte per i mutanti K6 e K7 della riga «Blocchi vivi nelle risposte». Solo nella copia. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { documento } from './aiuto-dom-blocchi.mjs';
import { impostaLingua } from '../../src/components/lingua.js';

const MODULO = '../../src/components/blocchi-vivi-impostazione.js';
const attesa = () => new Promise((r) => setImmediate(r));

function finestra() {
  const doc = documento();
  const pannello = doc.createElement('div');
  pannello.setAttribute('data-settings-panel', 'chat');
  const gruppo = doc.createElement('section');
  gruppo.dataset.settingsChatControls = '';
  pannello.append(gruppo);
  doc.body.append(pannello);
  const clic = [];
  doc.addEventListener = (tipo, fn) => { if (tipo === 'click') clic.push(fn); };
  doc.removeEventListener = () => {};
  doc.documentElement = { addEventListener() {}, removeEventListener() {} };
  return { doc, gruppo, clic };
}

test('REVK-05 (K6) aprire la scheda «Chat» rilegge il server: un cambio fatto dal modello o dal telefono si vede', async () => {
  impostaLingua('it');
  const { montaBlocchiVivi } = await import(MODULO);
  const { doc, gruppo, clic } = finestra();
  let stato = { blocchiVivi: true }; let get = 0;
  const fetchFn = async (_url, o = {}) => { if ((o.method ?? 'GET') === 'GET') get += 1; return { ok: true, status: 200, json: async () => ({ ok: true, data: { ...stato } }) }; };
  montaBlocchiVivi({ documento: doc, fetchFn });
  await attesa();
  const interruttore = gruppo.querySelector('input.talos-switch');
  assert.equal(interruttore.checked, true);
  stato = { blocchiVivi: false }; // cambiata da app_settings
  const scheda = { closest: (s) => (s === '[data-settings-tab="chat"]' ? {} : null) };
  for (const fn of clic) fn({ target: scheda });
  await attesa(); await attesa();
  assert.equal(get, 2, 'una seconda lettura');
  assert.equal(interruttore.checked, false);
});

test('REVK-06 (K7) durante il salvataggio l\'interruttore non si può toccare (niente due POST in corsa)', async () => {
  impostaLingua('it');
  const { montaBlocchiVivi } = await import(MODULO);
  const { doc, gruppo } = finestra();
  let sblocca;
  const fetchFn = async (_url, o = {}) => {
    if (o.method === 'POST') await new Promise((r) => { sblocca = r; });
    return { ok: true, status: 200, json: async () => ({ ok: true, data: { blocchiVivi: o.body ? JSON.parse(o.body).blocchiVivi : true } }) };
  };
  montaBlocchiVivi({ documento: doc, fetchFn });
  await attesa();
  const interruttore = gruppo.querySelector('input.talos-switch');
  interruttore.checked = false;
  interruttore.dispatchEvent(new Event('change'));
  await attesa();
  assert.equal(interruttore.disabled, true, 'spento mentre il server risponde');
  sblocca();
  await attesa(); await attesa();
  assert.equal(interruttore.disabled, false);
  assert.equal(interruttore.checked, false);
});
