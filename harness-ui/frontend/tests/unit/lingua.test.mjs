import test from 'node:test';
import assert from 'node:assert/strict';
import { risolviLingua, etichettaLinguaRisolta, applicaLingua, DIZIONARIO, impostaLingua } from '../../src/components/lingua.js';

// 06/09 B8 — la lingua dei menu: preferenza e lingua risolta sono due cose (H21).

test('LINGUA-RISOLTA: la scelta esplicita vince; «sistema» segue il browser; sconosciuta → inglese', () => {
  assert.equal(risolviLingua('en', ['it-IT']), 'en');
  assert.equal(risolviLingua('sistema', ['it-IT', 'en']), 'it');
  assert.equal(risolviLingua('sistema', ['de-DE', 'fr']), 'en');
  assert.equal(risolviLingua('sistema', 'en-US'), 'en');
  assert.equal(risolviLingua(undefined, []), 'en');
  assert.equal(etichettaLinguaRisolta('sistema', 'it'), 'Segui il sistema (italiano)');
  assert.equal(etichettaLinguaRisolta('en', 'en'), 'English');
  // 03/10/2026: chiavi stabili (`impostazioni.language.*`); in inglese la frase e il nome dentro la frase sono inglesi
  impostaLingua('en');
  try {
    assert.equal(etichettaLinguaRisolta('sistema', 'it'), 'Follow the system (Italian)');
    assert.equal(etichettaLinguaRisolta('sistema', 'en'), 'Follow the system (English)');
  } finally { impostaLingua('it'); }
});

test('LINGUA-DIZIONARIO: le due lingue hanno le stesse chiavi', () => {
  assert.deepEqual(Object.keys(DIZIONARIO.en).sort(), Object.keys(DIZIONARIO.it).sort());
});

test('LINGUA-APPLICA: traduce solo il primo nodo di testo (il badge dentro la scheda resta) e i placeholder; lang sulla radice', () => {
  // un DOM minimo senza browser
  const figli = [];
  const testo = (data) => ({ nodeType: 3, data });
  const badge = { nodeType: 1, textContent: '2' };
  const tab = { childNodes: [testo('Terminale '), badge], getAttribute: () => 'terminale', textContent: 'Terminale 2' };
  const campo = { getAttribute: () => 'cerca', placeholder: 'Cerca chat…' };
  const radice = { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } };
  const root = { documentElement: radice, querySelectorAll: (sel) => (sel === '[data-t]' ? [tab] : [campo]) };
  const toccati = applicaLingua(root, 'en');
  assert.equal(toccati, 2);
  assert.equal(tab.childNodes[0].data, 'Terminal ');
  assert.equal(badge.textContent, '2');
  assert.equal(campo.placeholder, 'Search chats…');
  assert.equal(radice.attrs.lang, 'en');
  void figli;
});

/* 03/10/2026, corsia S1: un `data-t` con una CHIAVE STABILE si legge con t(); `data-t-attr` traduce gli attributi nominati
   (forma di jquery-i18next). AL CONTRARIO: una chiave che non esiste non scrive niente, e il primo testo resta l'unico toccato. */
test('LINGUA-APPLICA-CHIAVI: data-t con chiave stabile e data-t-attr per gli attributi', () => {
  const testo = (data) => ({ nodeType: 3, data });
  const etichetta = { childNodes: [testo('Riprendi il workspace all’avvio'), { nodeType: 1 }, testo(' dopo')], getAttribute: () => 'impostazioni.search.workspaceRestore.title' };
  const finta = { childNodes: [testo('Resta così')], getAttribute: () => 'impostazioni.chiave.inventata' };
  const attributi = {};
  const pulsante = {
    getAttribute: (n) => (n === 'data-t-attr' ? '[title]impostazioni.search.workspaceRestore.help; [aria-label]impostazioni.chiave.inventata;rotto' : null),
    setAttribute(n, v) { attributi[n] = v; },
  };
  const radice = { setAttribute() {} };
  const root = { documentElement: radice, querySelectorAll: (sel) => (sel === '[data-t]' ? [etichetta, finta] : sel === '[data-t-attr]' ? [pulsante] : []) };
  try {
    assert.equal(applicaLingua(root, 'en'), 2);
    assert.equal(etichetta.childNodes[0].data, 'Restore the workspace at startup');
    assert.equal(etichetta.childNodes[2].data, ' dopo', 'solo il primo testo');
    assert.equal(finta.childNodes[0].data, 'Resta così', 'una chiave inventata non scrive');
    assert.deepEqual(attributi, { title: 'Reopens the last available session without starting operations.' });
    applicaLingua(root, 'it');
    assert.equal(etichetta.childNodes[0].data, 'Riprendi il workspace all’avvio', 'in italiano torna la voce italiana, identica');
  } finally { impostaLingua('it'); }
});

/* Corsia S1 (03/10/2026): applicaLingua gira a ogni applicazione delle preferenze. Un testo o un attributo che il CODICE ha
   cambiato (uno stato vero) non si riporta alla frase del modello; uno che dice ancora la frase del modello, o ciò che ha scritto
   applicaLingua, si traduce. */
test('LINGUA-APPLICA-DINAMICI: un testo cambiato dal codice non si sovrascrive', () => {
  const nodo = (data) => ({ nodeType: 3, data });
  const stato = { childNodes: [nodo('Riprendi il workspace all’avvio')], getAttribute: () => 'impostazioni.search.workspaceRestore.title' };
  const attributi = { title: 'Riapre l’ultima sessione disponibile senza avviare operazioni.' };
  const pulsante = {
    getAttribute: (n) => (n === 'data-t-attr' ? '[title]impostazioni.search.workspaceRestore.help' : attributi[n] ?? null),
    setAttribute(n, v) { attributi[n] = v; },
  };
  const root = { documentElement: { setAttribute() {} }, querySelectorAll: (sel) => (sel === '[data-t]' ? [stato] : sel === '[data-t-attr]' ? [pulsante] : []) };
  try {
    applicaLingua(root, 'en');
    assert.equal(stato.childNodes[0].data, 'Restore the workspace at startup');
    assert.equal(attributi.title, 'Reopens the last available session without starting operations.');
    stato.childNodes[0].data = '3 sessioni riprese';
    attributi.title = 'Ultima ripresa alle 18:04';
    applicaLingua(root, 'it');
    assert.equal(stato.childNodes[0].data, '3 sessioni riprese', 'il testo scritto dal codice resta');
    assert.equal(attributi.title, 'Ultima ripresa alle 18:04', 'l’attributo scritto dal codice resta');
    stato.childNodes[0].data = 'Restore the workspace at startup';
    applicaLingua(root, 'it');
    assert.equal(stato.childNodes[0].data, 'Riprendi il workspace all’avvio', 'AL CONTRARIO: la frase del modello si traduce ancora');
  } finally { impostaLingua('it'); }
});
