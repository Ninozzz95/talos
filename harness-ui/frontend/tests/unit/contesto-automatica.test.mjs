/*
 * Decisione 315 (owner 06/11/2026): le regole della compattazione automatica stanno in `components/contesto-automatica.js`, fuori da
 * `legacy/app.js` (decisione 304: il gigante non cresce). Qui il modulo si prova da solo; l'ultima prova controlla che app.js le chiami.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { automaticaDelMotore, compattaDaSola, avvisoDaRivalutare, pausaDopoEvento, seguiPausaContesto, MARGINE_FINE_PAUSA_MS, RITARDO_MASSIMO_TIMER_MS, campiSchedaAutomatica, sceltaModelloDalContesto } from '../../src/components/contesto-automatica.js';
import { EVENTO_APRI_SCELTA_DAL_CONTESTO } from '../../src/components/motivi-compattazione.js';

test('AUTO-1: the switch is on unless settings.auto is exactly false', () => {
  assert.equal(automaticaDelMotore({ settings: { auto: false } }), false);
  assert.equal(automaticaDelMotore({ settings: { auto: true } }), true);
  assert.equal(automaticaDelMotore({ settings: {} }), true);
  assert.equal(automaticaDelMotore({}), true);
  assert.equal(automaticaDelMotore(null), true);
  assert.equal(automaticaDelMotore({ settings: { auto: 0 } }), true);
});

test('AUTO-2: the threshold warning is re-evaluated only when the session, the switch or the trigger changes', () => {
  const base = { sessionId: 's1', settings: { auto: true }, budget: { triggerTokens: 150000 } };
  assert.equal(avvisoDaRivalutare(base, { ...base }), false);
  assert.equal(avvisoDaRivalutare(base, { ...base, budget: { triggerTokens: 150000, windowTokens: 200000 } }), false);
  assert.equal(avvisoDaRivalutare(base, { ...base, sessionId: 's2' }), true);
  assert.equal(avvisoDaRivalutare(base, { ...base, settings: { auto: false } }), true);
  assert.equal(avvisoDaRivalutare(base, { ...base, budget: { triggerTokens: 120000 } }), true);
  assert.equal(avvisoDaRivalutare({ ...base, budget: null }, base), true);
  assert.equal(avvisoDaRivalutare(null, base), true);
  assert.equal(avvisoDaRivalutare({ sessionId: 's1' }, { sessionId: 's1', settings: { auto: true } }), false);
});

test('AUTO-3: cooling opens the pause, committed and restored close it, anything else keeps it', () => {
  const cooling = { kind: 'context.compaction.cooling', payload: { code: 'summary_failed', attempts: 2, waitSeconds: 60, retryAfter: 1762440000000 } };
  const pausa = pausaDopoEvento(null, cooling);
  assert.deepEqual(pausa, { retryAfter: 1762440000000, attempts: 2, code: 'summary_failed' });
  assert.deepEqual(pausaDopoEvento(pausa, { kind: 'context.compaction.cooling' }), { retryAfter: null, attempts: null, code: null });
  assert.equal(pausaDopoEvento(pausa, { kind: 'context.version.committed' }), null);
  assert.equal(pausaDopoEvento(pausa, { kind: 'context.version.restored' }), null);
  assert.equal(pausaDopoEvento(pausa, { kind: 'context.usage.recorded' }), pausa);
  assert.equal(pausaDopoEvento(undefined, { kind: 'context.usage.recorded' }), null);
  assert.equal(pausaDopoEvento(pausa, null), pausa);
});

test('AUTO-4: the Context card fields: no engine snapshot (legacy, or not arrived yet) still compacts by itself, with no pause', () => {
  const ora = Date.parse('2026-11-06T16:00:00.000Z');
  const pausa = { retryAfter: '2026-11-06T16:01:00.000Z', attempts: 1, code: 'x' };
  assert.deepEqual(campiSchedaAutomatica(null, { pausaContesto: pausa }, ora), { automatica: true, pausa: null }, 'the legacy kernel compacts by itself (reviewer 06/11, point 2)');
  assert.deepEqual(campiSchedaAutomatica({ settings: { auto: false } }, { pausaContesto: pausa }, ora), { automatica: false, pausa });
  assert.deepEqual(campiSchedaAutomatica({ settings: {} }, { pausaContesto: pausa }, ora), { automatica: true, pausa });
  assert.deepEqual(campiSchedaAutomatica({ settings: {} }, {}, ora), { automatica: true, pausa: null });
});

test('AUTO-9: an expired pause leaves the card data, so the redraw at the retry time is not skipped as «same data» (reviewer 06/11, round 2)', () => {
  const pausa = { retryAfter: '2026-11-06T16:01:00.000Z', attempts: 1, code: 'x' };
  const quando = Date.parse(pausa.retryAfter);
  const conPausa = (p, ora) => campiSchedaAutomatica({ settings: {} }, { pausaContesto: p }, ora).pausa;
  assert.equal(conPausa(pausa, quando - 1), pausa, 'one millisecond before: still paused');
  assert.equal(conPausa(pausa, quando), null, 'at the retry time: no pause');
  assert.equal(conPausa(pausa, quando + 250), null);
  assert.equal(conPausa({ ...pausa, retryAfter: null }, quando - 60_000), null, 'no retry time, nothing to wait for');
  assert.equal(conPausa({ ...pausa, retryAfter: 'not a date' }, quando - 60_000), null);
  const firma = (ora) => JSON.stringify(campiSchedaAutomatica({ settings: {} }, { pausaContesto: pausa }, ora));
  assert.notEqual(firma(quando - 1), firma(quando + 250), 'the panel signature (JSON of its data) changes when the pause expires');
  const vero = Date.now;
  try {
    Date.now = () => quando - 1; assert.equal(conPausa(pausa), pausa, 'the default clock is Date.now');
    Date.now = () => quando + 250; assert.equal(conPausa(pausa), null);
  } finally { Date.now = vero; }
});

test('AUTO-5: choosing another model from the Context row asks for the model choice', () => {
  const inviati = [];
  class Evento { constructor(tipo, init) { this.type = tipo; this.detail = init?.detail; } }
  const doc = { defaultView: { CustomEvent: Evento }, dispatchEvent: (e) => inviati.push(e) };
  sceltaModelloDalContesto(doc);
  assert.equal(inviati.length, 1);
  assert.equal(inviati[0].type, EVENTO_APRI_SCELTA_DAL_CONTESTO);
  assert.deepEqual(inviati[0].detail, { scelta: 'modello' });
});

test('AUTO-6: legacy/app.js only calls the module, at every site', () => {
  const app = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
  assert.match(app, /from '\.\.\/components\/contesto-automatica\.js'/);
  assert.match(app, /return; seguiPausaContesto\(state\.realSession, value, aggiornaInspectorDaStato\);/, 'the pause is followed, with a redraw when it ends');
  assert.match(app, /onChoose: \(\) => sceltaModelloDalContesto\(document\)/);
  assert.match(app, /const rivaluta = avvisoDaRivalutare\(contextChatSnapshot, snapshot\); contextChatSnapshot = snapshot; if \(rivaluta\) void aggiornaAvvisoSogliaContesto\(\);/);
  assert.match(app, /\.\.\.campiSchedaAutomatica\(motore, s\)/);
  assert.match(app, /const valutazione = valutaSogliaContesto\(\{ \.\.\.numeri, automatica: compattaDaSola\(contextChatSnapshot, sessionId\) \}\);/, 'the notice asks the module, for every session');
  assert.match(app, /function azzeraSchedaContesto\(\) \{\r?\n[^\n]*fornitoriEvitati: \[\], pausaContesto: null,/, 'a chat switch clears the pause');
  assert.doesNotMatch(app, /settings\?\.auto !== false/);
});

test('AUTO-7: the threshold notice only when THIS session\'s engine says the person turned auto compaction off', () => {
  assert.equal(compattaDaSola({ sessionId: 's1', settings: { auto: false } }, 's1'), false, 'auto off: the notice may show');
  assert.equal(compattaDaSola({ sessionId: 's1', settings: { auto: true } }, 's1'), true);
  assert.equal(compattaDaSola({ sessionId: 's1', settings: {} }, 's1'), true, 'the engine default is on');
  assert.equal(compattaDaSola(null, 's1'), true, 'no snapshot yet (reload, switch, GET /context late or failed): nothing to show');
  assert.equal(compattaDaSola({ sessionId: 's0', settings: { auto: false } }, 's1'), true, 'a snapshot of the previous session says nothing about this one');
  assert.equal(compattaDaSola({ sessionId: 's1', settings: { auto: 0 } }, 's1'), true, 'only an explicit false turns it off');
});

test('AUTO-8: a pause redraws by itself at the retry time, once, and only if it is still the same pause', () => {
  const timer = [];
  let ora = 1_000_000;
  const orologio = { Date: { now: () => ora }, setTimeout: (fn, ms) => timer.push({ fn, ms }) };
  const s = { pausaContesto: null };
  let ridisegni = 0;
  const ridisegna = () => { ridisegni += 1; };
  const cooling = (dopoMs) => ({ kind: 'context.compaction.cooling', payload: { code: 'CTX_EMPTY_SUMMARY', attempts: 1, retryAfter: new Date(ora + dopoMs).toISOString() } });
  const p = seguiPausaContesto(s, cooling(60_000), ridisegna, orologio);
  assert.equal(s.pausaContesto, p);
  assert.equal(timer.length, 1);
  assert.equal(timer[0].ms, 60_000 + MARGINE_FINE_PAUSA_MS, 'at the retry time, just after it');
  assert.ok(MARGINE_FINE_PAUSA_MS > 0 && MARGINE_FINE_PAUSA_MS < 1000);
  seguiPausaContesto(s, { kind: 'context.usage.recorded' }, ridisegna, orologio);
  assert.equal(timer.length, 1, 'an unrelated event arms nothing new');
  ora += 60_000 + MARGINE_FINE_PAUSA_MS;
  timer[0].fn();
  assert.equal(ridisegni, 1, 'the panel redraws: the pause has expired');
  seguiPausaContesto(s, cooling(30_000), ridisegna, orologio);
  seguiPausaContesto(s, { kind: 'context.version.committed' }, ridisegna, orologio);
  assert.equal(s.pausaContesto, null);
  timer[1].fn();
  assert.equal(ridisegni, 1, 'a pause closed meanwhile does not redraw again');
  seguiPausaContesto(s, cooling(-5_000), ridisegna, orologio);
  assert.equal(timer.length, 2, 'a retry time already past arms no timer');
  seguiPausaContesto(s, { kind: 'context.compaction.cooling', payload: { attempts: 1 } }, ridisegna, orologio);
  assert.equal(timer.length, 2, 'no retry time, no timer');
});

test('AUTO-10: the system clock moved back during a pause: the timer re-arms for the time still missing, never leaves the pause on screen (reviewer 06/11, round 3)', () => {
  const timer = [];
  let ora = 1_000_000;
  const orologio = { Date: { now: () => ora }, setTimeout: (fn, ms) => timer.push({ fn, ms }) };
  const s = { pausaContesto: null };
  let ridisegni = 0;
  const ridisegna = () => { ridisegni += 1; };
  const cooling = (dopoMs) => ({ kind: 'context.compaction.cooling', payload: { code: 'CTX_EMPTY_SUMMARY', attempts: 1, retryAfter: new Date(ora + dopoMs).toISOString() } });
  seguiPausaContesto(s, cooling(5_000), ridisegna, orologio);
  assert.equal(timer[0].ms, 5_000 + MARGINE_FINE_PAUSA_MS);
  ora = 1_000_000 + 5_000 + MARGINE_FINE_PAUSA_MS - 20_000; // 5,25 s really passed, the wall clock went 20 s back
  timer[0].fn();
  assert.equal(ridisegni, 0, 'still before the retry time: no redraw yet');
  assert.equal(timer.length, 2, 're-armed');
  assert.equal(timer[1].ms, 20_000, 'for the time still missing, plus the margin');
  ora += 20_000;
  timer[1].fn();
  assert.equal(ridisegni, 1, 'at the retry time the pause leaves');
  assert.equal(timer.length, 2, 'once over, nothing re-arms');
  /* a pause closed while the clock was back re-arms nothing */
  seguiPausaContesto(s, cooling(5_000), ridisegna, orologio);
  ora -= 20_000;
  seguiPausaContesto(s, { kind: 'context.version.committed' }, ridisegna, orologio);
  timer[2].fn();
  assert.equal(ridisegni, 1);
  assert.equal(timer.length, 3, 'a closed pause re-arms nothing');
  /* re-armed, then replaced by a new pause: the old timer neither redraws nor re-arms */
  const s2 = { pausaContesto: null };
  seguiPausaContesto(s2, cooling(5_000), ridisegna, orologio);
  ora -= 10_000;
  timer[3].fn();
  assert.equal(timer.length, 5, 're-armed once');
  seguiPausaContesto(s2, cooling(30_000), ridisegna, orologio);
  assert.equal(timer.length, 6, 'the new pause arms its own timer');
  ora += 60_000;
  timer[4].fn();
  assert.equal(ridisegni, 1, 'the re-armed timer of a replaced pause does not redraw');
  assert.equal(timer.length, 6, 'and does not re-arm');
  /* reviewer 06/11, round 4 (U4, U7): a small jump back, 400 ms, leaves less than the margin before the retry time. Still a live
     pause: it re-arms for those 150 ms plus the margin and redraws only after them. */
  const s3 = { pausaContesto: null };
  seguiPausaContesto(s3, cooling(5_000), ridisegna, orologio);
  assert.equal(timer[6].ms, 5_000 + MARGINE_FINE_PAUSA_MS);
  ora += 5_000 + MARGINE_FINE_PAUSA_MS - 400;
  timer[6].fn();
  assert.equal(ridisegni, 1, '150 ms still missing: no redraw yet');
  assert.equal(timer.length, 8, 're-armed even with less than the margin missing');
  assert.equal(timer[7].ms, 150 + MARGINE_FINE_PAUSA_MS);
  ora += timer[7].ms;
  timer[7].fn();
  assert.equal(ridisegni, 2, 'then the pause leaves');
  assert.equal(timer.length, 8);
});

test('AUTO-11: a retry time more than ~24.8 days ahead of the page clock arms ONE timer within the setTimeout limit, never a busy loop (reviewer 06/11, round 4)', () => {
  /* setTimeout keeps its delay in 32 bits: past 2^31-1 ms Chromium fires at once and Node after 1 ms. A fake that does the same. */
  const MASSIMO = 2 ** 31 - 1;
  assert.equal(RITARDO_MASSIMO_TIMER_MS, MASSIMO);
  const coda = [];
  const armati = [];
  let ora = 1_000_000;
  const orologio = { Date: { now: () => ora }, setTimeout: (fn, ms) => { armati.push(ms); coda.push({ fn, ms: ms > MASSIMO ? 1 : ms }); } };
  const s = { pausaContesto: null };
  let ridisegni = 0;
  const ridisegna = () => { ridisegni += 1; };
  const trentaGiorni = 30 * 86_400_000;
  seguiPausaContesto(s, { kind: 'context.compaction.cooling', payload: { code: 'CTX_SUMMARY_REFUSED', attempts: 1, retryAfter: new Date(ora + trentaGiorni).toISOString() } }, ridisegna, orologio);
  for (let giri = 0; giri < 100 && coda.length && coda[0].ms === 1; giri += 1) { const t = coda.shift(); ora += t.ms; t.fn(); }
  assert.equal(armati.length, 1, 'armed once, not re-armed in a loop');
  assert.ok(armati[0] <= MASSIMO, `the delay fits setTimeout (got ${armati[0]})`);
  assert.equal(armati[0], MASSIMO, 'the longest wait setTimeout allows');
  assert.equal(ridisegni, 0);
  /* ~24.8 days later the timer finds the pause still alive and waits for the rest, then redraws once at the retry time */
  const primo = coda.shift();
  ora += primo.ms;
  primo.fn();
  assert.equal(ridisegni, 0);
  assert.equal(armati.length, 2);
  assert.equal(armati[1], trentaGiorni - MASSIMO + MARGINE_FINE_PAUSA_MS);
  const secondo = coda.shift();
  ora += secondo.ms;
  secondo.fn();
  assert.equal(ridisegni, 1, 'redraws at the retry time');
  assert.equal(armati.length, 2, 'and stops');
});
