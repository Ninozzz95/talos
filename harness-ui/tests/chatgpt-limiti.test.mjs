/*
 * I limiti del piano ChatGPT letti dalle intestazioni (owner 12/10/2026, «come Codex»). I nomi e le regole sono quelli di
 * `codex-rs/codex-api/src/rate_limits.rs`; i casi di prova riprendono i suoi (`:281-330`).
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { attesaFinoAlRipristino, leggiLimitiDelPiano, limiteFinito, nomiVisti } from '../src/chatgpt-limiti.mjs';

const ADESSO = Date.parse('2026-10-12T17:19:00.000Z');
const fraMinuti = (m) => String(Math.round((ADESSO + m * 60_000) / 1000));
/** Il caso dell'owner del 12/10: 5 ore finite (torna fra 1 h 52 min), settimana al 20% usato. */
const casoOwner = () => new Headers({
  'x-codex-primary-used-percent': '100.0', 'x-codex-primary-window-minutes': '300', 'x-codex-primary-reset-at': fraMinuti(112),
  'x-codex-secondary-used-percent': '20', 'x-codex-secondary-window-minutes': '10080', 'x-codex-secondary-reset-at': fraMinuti(5 * 1440 + 17 * 60),
  'content-type': 'application/json', 'x-request-id': 'req_1',
});

test('LIMITI-01 — il caso dell’owner: è finito il limite delle 5 ore, non il settimanale, e si sa quando torna', () => {
  const limiti = leggiLimitiDelPiano(casoOwner());
  assert.deepEqual(limiti.primario, { usatoPercento: 100, finestraMinuti: 300, tornaAlle: ADESSO + 112 * 60_000 });
  assert.equal(limiti.secondario.usatoPercento, 20);
  assert.equal(limiti.secondario.finestraMinuti, 10080);
  assert.deepEqual(limiteFinito(limiti), { quale: 'primario', finestraMinuti: 300, tornaAlle: ADESSO + 112 * 60_000 });
  assert.equal(attesaFinoAlRipristino(limiti, ADESSO), 112 * 60_000);
});

test('LIMITI-02 — AL CONTRARIO: senza intestazioni dei limiti non si inventa niente', () => {
  assert.equal(leggiLimitiDelPiano(new Headers({ 'content-type': 'application/json', 'retry-after': '30' })), null);
  assert.equal(leggiLimitiDelPiano(null), null);
  assert.equal(limiteFinito(null), null);
  assert.equal(attesaFinoAlRipristino(null, ADESSO), null);
  // una finestra con percentuale 0, senza durata e senza ripristino non dice niente (Codex `parse_rate_limit_window`)
  assert.equal(leggiLimitiDelPiano(new Headers({ 'x-codex-primary-used-percent': '0' })), null);
  // percentuale illeggibile: la finestra non esiste
  assert.equal(leggiLimitiDelPiano(new Headers({ 'x-codex-primary-used-percent': 'molto', 'x-codex-primary-reset-at': fraMinuti(5) })), null);
});

test('LIMITI-03 — nessuna finestra al 100%: non si dice quale limite è finito; al 100% senza ora: si dice quale, non quando', () => {
  const sotto = leggiLimitiDelPiano(new Headers({ 'x-codex-primary-used-percent': '99.4', 'x-codex-primary-window-minutes': '300', 'x-codex-secondary-used-percent': '20' }));
  assert.equal(limiteFinito(sotto), null);
  assert.equal(attesaFinoAlRipristino(sotto, ADESSO), null);
  const senzaOra = leggiLimitiDelPiano(new Headers({ 'x-codex-secondary-used-percent': '100', 'x-codex-secondary-window-minutes': '10080' }));
  assert.deepEqual(limiteFinito(senzaOra), { quale: 'secondario', finestraMinuti: 10080, tornaAlle: null });
  assert.equal(attesaFinoAlRipristino(senzaOra, ADESSO), null);
});

test('LIMITI-04 — tutti e due finiti: conta quello che torna più tardi; un ripristino già passato aspetta il minimo', () => {
  const tutti = leggiLimitiDelPiano(new Headers({
    'x-codex-primary-used-percent': '100', 'x-codex-primary-window-minutes': '300', 'x-codex-primary-reset-at': fraMinuti(30),
    'x-codex-secondary-used-percent': '100', 'x-codex-secondary-window-minutes': '10080', 'x-codex-secondary-reset-at': fraMinuti(2000),
  }));
  assert.equal(limiteFinito(tutti).quale, 'secondario');
  assert.equal(attesaFinoAlRipristino(tutti, ADESSO), 2000 * 60_000);
  const passato = leggiLimitiDelPiano(new Headers({ 'x-codex-primary-used-percent': '100', 'x-codex-primary-reset-at': fraMinuti(-3) }));
  assert.equal(attesaFinoAlRipristino(passato, ADESSO), 1000);
});

test('LIMITI-05 — la misura: i NOMI delle intestazioni x-codex arrivate, e solo quelli; un oggetto semplice si legge come Headers', () => {
  assert.deepEqual(nomiVisti(casoOwner()), [
    'x-codex-primary-reset-at', 'x-codex-primary-used-percent', 'x-codex-primary-window-minutes',
    'x-codex-secondary-reset-at', 'x-codex-secondary-used-percent', 'x-codex-secondary-window-minutes',
  ]);
  assert.deepEqual(nomiVisti(new Headers({ 'x-request-id': 'a', authorization: 'Bearer x' })), []);
  const semplice = { 'x-codex-primary-used-percent': '100', 'x-codex-primary-reset-at': fraMinuti(10), 'X-Codex-Rate-Limit-Reached-Type': 'primary' };
  assert.equal(leggiLimitiDelPiano(semplice).primario.usatoPercento, 100);
  assert.deepEqual(nomiVisti(semplice), ['x-codex-primary-reset-at', 'x-codex-primary-used-percent', 'x-codex-rate-limit-reached-type']);
});
