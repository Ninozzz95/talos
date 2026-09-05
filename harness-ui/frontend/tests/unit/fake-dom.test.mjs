import assert from 'node:assert/strict';
import test from 'node:test';

import { fakeDocument, testoDi } from './fake-dom.mjs';

/*
 * Il DOM finto è diventato infrastruttura: lo usano tutte le prove delle
 * primitive e delle superfici. Un finto sbagliato non fa fallire una prova —
 * ne fa passare una che nel browser fallirebbe. Quindi si prova anche lui, e
 * soprattutto si prova che ADMETTA DI NON SAPERE invece di rispondere `null`.
 */
const doc = () => fakeDocument();

test('FINTO-01 ⭐ dataset e attributi data-* sono LO STESSO deposito, come nel browser', () => {
  const d = doc();
  const el = d.createElement('button');
  el.dataset.tabId = 'processi';
  assert.equal(el.getAttribute('data-tab-id'), 'processi');
  el.setAttribute('data-altro-nome', 'x');
  assert.equal(el.dataset.altroNome, 'x');
  // ⛔ È il caso vero: `tabs.js` scrive `dataset.tabId` e poi cerca
  // `[data-tab-id="..."]`. Con due depositi separati la ricerca era cieca.
  const padre = d.createElement('div');
  padre.append(el);
  assert.equal(padre.querySelector('[data-tab-id="processi"]'), el);
});

test('FINTO-02 querySelector trova per attributo, classe e tag, anche in profondità', () => {
  const d = doc();
  const radice = d.createElement('div');
  const mezzo = d.createElement('section');
  const bottone = d.createElement('button');
  bottone.setAttribute('role', 'tab');
  bottone.className = 'talos-tabs__tab attivo';
  mezzo.append(bottone);
  radice.append(mezzo);
  assert.equal(radice.querySelector('[role="tab"]'), bottone);
  assert.equal(radice.querySelector('.talos-tabs__tab'), bottone);
  assert.equal(radice.querySelector('button'), bottone);
  assert.equal(radice.querySelector('[role="tabpanel"]'), null);
});

test('FINTO-03 :not e le liste con la virgola', () => {
  const d = doc();
  const radice = d.createElement('div');
  const acceso = d.createElement('div');
  acceso.setAttribute('role', 'menuitem');
  const spento = d.createElement('div');
  spento.setAttribute('role', 'menuitem');
  spento.setAttribute('aria-disabled', 'true');
  radice.append(spento, acceso);
  const voci = radice.querySelectorAll('[role="menuitem"]:not([aria-disabled="true"])');
  assert.deepEqual(voci, [acceso], 'la voce disabilitata non deve essere raggiungibile con le frecce');

  const campo = d.createElement('input');
  radice.append(campo);
  assert.equal(radice.querySelector('input, select, button'), campo);
});

test('FINTO-04 ⭐⭐ un selettore che non capisce LANCIA, non risponde null', () => {
  const d = doc();
  const radice = d.createElement('div');
  // Rispondere `null` farebbe passare una prova mentre nel browser l'elemento
  // c'è: il finto mentirebbe per omissione. Meglio un errore rumoroso.
  assert.throws(() => radice.querySelector('div > span'), /combinatori non supportati/);
  assert.throws(() => radice.querySelector('li:nth-child(2)'), /non supportato/);
  // ⛔ Il discendente veniva mangiato: `[data-x="1"] input` diventava «un
  // elemento che è insieme l'uno e l'altro», cioè nessuno. Ora lo dice.
  assert.throws(() => radice.querySelector('[data-testid="x"] input'), /combinatore discendente non supportato/);
  assert.throws(() => radice.querySelector(''), /selettore mancante/);
});

test('FINTO-05 closest parte da SE STESSO e risale, come nel DOM', () => {
  const d = doc();
  const tab = d.createElement('button');
  tab.setAttribute('role', 'tab');
  const dentro = d.createElement('span');
  tab.append(dentro);
  const lista = d.createElement('div');
  lista.append(tab);
  assert.equal(dentro.closest('[role="tab"]'), tab);
  assert.equal(tab.closest('[role="tab"]'), tab, 'closest include il nodo di partenza');
  assert.equal(lista.closest('[role="tab"]'), null);
});

test('FINTO-06 activeElement segue chi ha ricevuto focus', () => {
  const d = doc();
  const a = d.createElement('button');
  const b = d.createElement('button');
  assert.equal(d.activeElement, null);
  a.focus();
  assert.equal(d.activeElement, a);
  b.focus();
  assert.equal(d.activeElement, b);
});

test('FINTO-07 ⭐ assegnare textContent cancella i figli, come nel browser', () => {
  const d = doc();
  const padre = d.createElement('div');
  const figlio = d.createElement('span');
  figlio.textContent = 'dentro';
  padre.append(figlio);
  assert.equal(testoDi(padre), 'dentro');
  padre.textContent = 'nuovo';
  assert.equal(padre.children.length, 0);
  assert.equal(figlio.parentNode, null, 'un figlio cancellato non ha più un genitore');
});

test('FINTO-08 ⭐ remove e replaceChildren azzerano il genitore dei nodi staccati', () => {
  const d = doc();
  const padre = d.createElement('div');
  const a = d.createElement('span');
  const b = d.createElement('span');
  padre.append(a, b);
  assert.equal(a.parentNode, padre);
  a.remove();
  assert.equal(a.parentNode, null);
  padre.replaceChildren(a);
  assert.equal(a.parentNode, padre);
  assert.equal(b.parentNode, null, 'sostituire i figli stacca quelli che non ci sono più');
});

test('FINTO-09 ⭐ le scritture di testo si CONTANO, anche quelle identiche', () => {
  const d = doc();
  const el = d.createElement('span');
  el.textContent = 'ciao';
  el.textContent = 'ciao';
  assert.equal(el.scrittureTesto, 2, 'riscrivere la stessa stringa è comunque una mutazione');
});
