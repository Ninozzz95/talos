/*
 * FE-001, decisione dell'owner del 02/11/2026: la stella per fissare una sessione nella barra, al passaggio del puntatore e nel menu
 * «⋯», riga a riposo invariata.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fissatePrima, invertiFissata, leggiFissate, scriviFissate, CHIAVE_FISSATE } from '../../src/components/sessioni-fissate.js';

const memoria = (iniziale) => { const m = new Map(iniziale ? [[CHIAVE_FISSATE, iniziale]] : []); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), m }; };
const righe = ['a', 'b', 'c', 'd'].map((id) => ({ sessione: { sessionId: id } }));

test('FISSA-01 le fissate vanno in cima nell’ordine dell’elenco, le altre restano in ordine', () => {
  const { fissate, altre } = fissatePrima(righe, new Set(['c', 'b']));
  assert.deepEqual(fissate.map((r) => r.sessione.sessionId), ['b', 'c']);
  assert.deepEqual(altre.map((r) => r.sessione.sessionId), ['a', 'd']);
});

test('FISSA-02 senza fissate l’elenco non cambia', () => {
  const { fissate, altre } = fissatePrima(righe, new Set());
  assert.deepEqual(fissate, []);
  assert.deepEqual(altre, righe);
});

test('FISSA-03 una fissata di una sessione sparita non si inventa una riga', () => {
  assert.deepEqual(fissatePrima(righe, new Set(['z'])).fissate, []);
});

test('FISSA-04 fissare e togliere, sopravvive alla rilettura', () => {
  const s = memoria();
  const una = invertiFissata(leggiFissate(s), 'a');
  scriviFissate(s, una);
  assert.deepEqual([...leggiFissate(s)], ['a']);
  scriviFissate(s, invertiFissata(leggiFissate(s), 'a'));
  assert.deepEqual([...leggiFissate(s)], []);
});

test('FISSA-05 un valore rotto o una memoria che rifiuta non rompono la barra', () => {
  assert.deepEqual([...leggiFissate(memoria('{non json'))], []);
  assert.deepEqual([...leggiFissate(memoria('"testo"'))], []);
  assert.deepEqual([...leggiFissate(memoria('[1,"b",null]'))], ['b']);
  assert.deepEqual([...leggiFissate({ getItem() { throw new Error('negata'); } })], []);
  assert.doesNotThrow(() => scriviFissate({ setItem() { throw new Error('piena'); } }, new Set(['a'])));
});

test('FISSA-06 invertire non tocca l’insieme di partenza', () => {
  const prima = new Set(['a']);
  invertiFissata(prima, 'b');
  assert.deepEqual([...prima], ['a']);
});

test('FISSA-07 la riga a riposo non cambia: la stella si vede solo al passaggio o col fuoco', () => {
  const css = readFileSync(new URL('../../src/styles/mockup-sidebar.css', import.meta.url), 'utf8');
  assert.match(css, /\.td-session-star \{[^}]*opacity: 0/);
  assert.match(css, /\.td-session-row:hover > \.td-session-star/);
  assert.match(css, /\.td-session-star:focus-visible/);
});

test('FISSA-08 il menu «⋯» e la stella fanno la stessa cosa, nelle due lingue', async () => {
  const app = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
  assert.match(app, /icona: 'i-star', azione: \(\) => cambiaFissata\(/);
  const { TESTI } = await import('../../src/i18n/testi/index.js');
  for (const l of ['it', 'en']) for (const k of ['app.sessions.menu.pin', 'app.sessions.menu.unpin']) assert.ok(TESTI[l][k], `${l} ${k}`);
});
