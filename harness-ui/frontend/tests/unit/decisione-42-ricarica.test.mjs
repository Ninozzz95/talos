/*
 * Decisione 42 dell'owner (02/11/2026, reperti D12 e D31 del Tester): la ricarica riapre la chat aperta, quella giusta.
 * Due cause trovate nel codice:
 *   1. `lastSession` la scriveva solo `passaASessione`: una chat nata col primo invio, un ramo, una ripresa passano da
 *      `collegaEventiSessione` e non la scrivevano. La ricarica riapriva la chat aperta PRIMA dall'elenco («How do I make…»), o Home.
 *   2. `lastSession` sta in `localStorage`, comune a tutte le finestre: l'ultima che apre una chat decide anche per le altre.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWorkspacePreferences, rememberOpenSession, sessionToRestore, TAB_SESSION_KEY } from '../../src/services/workspace-preferences.ts';

const deposito = () => { const data = new Map(); return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) }; };

test('D42-01: due finestre sullo stesso PC: ognuna riapre la sua chat, non quella dell ultima che ha aperto', () => {
  const comune = deposito();
  const [schedaA, schedaB] = [deposito(), deposito()];
  const [a, b] = [createWorkspacePreferences(() => comune), createWorkspacePreferences(() => comune)];
  rememberOpenSession(a, 'chat-a', () => schedaA);
  rememberOpenSession(b, 'chat-b', () => schedaB);
  assert.equal(a.read().lastSession, 'chat-a', 'premessa: la copia in memoria di A non vede B');
  assert.equal(sessionToRestore(createWorkspacePreferences(() => comune), () => schedaA), 'chat-a');
  assert.equal(sessionToRestore(createWorkspacePreferences(() => comune), () => schedaB), 'chat-b');
});

test('D42-02: una finestra nuova, o il programma riaperto, prende l ultima chat aperta su questo PC', () => {
  const comune = deposito();
  rememberOpenSession(createWorkspacePreferences(() => comune), 'chat-ultima', () => deposito());
  assert.equal(sessionToRestore(createWorkspacePreferences(() => comune), () => deposito()), 'chat-ultima');
});

test('D42-03: al contrario, senza il deposito della scheda, o con dentro un valore rotto, resta la strada di prima', () => {
  const comune = deposito();
  const p = createWorkspacePreferences(() => comune);
  const rotto = () => { throw new Error('bloccato'); };
  rememberOpenSession(p, 'chat-x', rotto);
  assert.equal(p.read().lastSession, 'chat-x', 'la scrittura comune non dipende da quella della scheda');
  assert.equal(sessionToRestore(p, rotto), 'chat-x');
  const scheda = deposito();
  scheda.setItem(TAB_SESSION_KEY, '__proto__');
  assert.equal(sessionToRestore(p, () => scheda), 'chat-x');
  assert.equal(sessionToRestore(p, () => undefined), 'chat-x');
});

test('D42-04: il punto che rende aperta una chat è anche l unico che la ricorda, e l avvio legge da lì', () => {
  const sorgente = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
  const collega = sorgente.indexOf('function collegaEventiSessione(sessionId, generation');
  const riga = sorgente.slice(collega, sorgente.indexOf('\n', sorgente.indexOf('state.realSession.id = sessionId;', collega) + 40));
  assert.match(riga, /state\.realSession\.id = sessionId;\s+rememberOpenSession\(workspacePreferences, sessionId\);/u);
  assert.equal(sorgente.match(/rememberOpenSession\(/gu).length, 1, 'un solo punto che scrive');
  assert.doesNotMatch(sorgente, /update\(\{ lastSession/u, 'nessun altro scrive lastSession');
  // 03/11 treno F: `preferences` lì è l'oggetto LETTO, che non ha `read()`; passarlo rompeva l'avvio (206 rosse nel browser).
  // sessionToRestore vuole il negozio, quello che sa leggere.
  assert.match(sorgente, /preferences\.restoreWorkspace \? sessionToRestore\(workspacePreferences\) : null/u);
});
