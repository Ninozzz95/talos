/*
 * A1 + B1 (owner 21/10/2026 sera; contratto `Downloads/handoff-talos-2026-09-27/CONTRATTO-RIGA-VIVA-E-TETTO-RIASSUNTO-2026-10-21.md`):
 * il riassunto che il giro ASPETTA ha un tetto totale e un orologio d'inattività che parte dal primo token; allo scadere, o allo Skip della
 * persona, il giro prosegue col riassunto senza modello (`ripiego`, `ragione`). Lo Stop resta uno Stop. Adapter desktop VERO, rete finta.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

process.env.TALOS_COMPACTION_TOKEN_CAP = '4000';
const { talosLavora, creaOrologioRiassunto } = await import('../src/kernel/talosHarness.desktop-hotfix.mjs');
const { stimaTokenConversazione: stima } = await import('../src/kernel/talosHarness.mjs');
const { rimuoviCartellaDiProva } = await import('./aiuto/rimuovi-cartella-di-prova.mjs');

const storia = (coppie, lunghezza = 420) => Array.from({ length: coppie }, (_, i) => [
  { role: 'user', content: `Domanda ${i}: ${'parola '.repeat(lunghezza / 7)}` },
  { role: 'assistant', content: `Risposta ${i}: ${'parola '.repeat(lunghezza / 7)}` },
]).flat();
const coppiePer = (token) => { let c = 10; while (stima(storia(c + 1)) < token) c += 1; return c; };
const abortito = (segnale) => new Promise((_, rifiuta) => {
  const via = () => rifiuta(Object.assign(new Error('aborted'), { name: 'AbortError' }));
  if (segnale?.aborted) via(); else segnale?.addEventListener('abort', via, { once: true });
});
const sse = (righe) => `${righe.map((r) => `data: ${JSON.stringify(r)}\n\n`).join('')}`;

/** Rete finta: il giro risponde «fatto»; il riassunto (corpo senza attrezzi) lo decide `riassunto(corpo, segnale)`. */
function rete(riassunto) {
  const conti = { modello: 0, riassunti: 0 };
  const fn = async (_u, o) => {
    const corpo = JSON.parse(o.body);
    if (!corpo.tools?.length) { conti.riassunti += 1; return riassunto(corpo, o.signal); }
    conti.modello += 1;
    const usage = { prompt_tokens: stima(corpo.messages), completion_tokens: 1 };
    if (corpo.stream) return new Response(sse([{ choices: [{ index: 0, delta: { role: 'assistant', content: 'fatto' } }] }, { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage }]) + 'data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } });
    return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'fatto' }, finish_reason: 'stop' }], usage });
  };
  return { fn, conti };
}
const RIASSUNTO_BUONO = () => Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: `## Riassunto\n${'Dettaglio. '.repeat(20)}` }, finish_reason: 'stop' }], usage: { prompt_tokens: 1000, completion_tokens: 100 } });

async function giro(t, { riassunto, opzioni = {}, prima = null }) {
  const cartella = mkdtempSync(join(tmpdir(), 'orologi-riassunto-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  writeFileSync(join(cartella, 'a.txt'), 'x\n');
  const r = rete(riassunto);
  const eventi = [];
  const inizio = Date.now();
  let esito = null; let errore = null;
  try {
    esito = await talosLavora({ cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'Rispondi.' },
      messaggiIniziali: [...storia(coppiePer(4600)), { role: 'user', content: 'Continua.' }], contestoDelProgetto: 'Project files:\n',
      fetchDiRete: r.fn, permessi: 'Full access', ...opzioni,
      onGiro: (e) => { if (/^compattazione-/u.test(e?.tipo ?? '')) { eventi.push(e); prima?.(e); } } });
  } catch (e) { errore = e; }
  return { esito, errore, eventi, conti: r.conti, durataMs: Date.now() - inizio };
}
const fine = (eventi) => eventi.filter((e) => e.tipo === 'compattazione-fine').at(-1);

test('ORO-01 tetto totale: un riassunto che non risponde mai si abbandona allo scadere, e il giro prosegue col riassunto senza modello', async (t) => {
  const r = await giro(t, { riassunto: (_c, segnale) => abortito(segnale), opzioni: { riassuntoTettoMs: 300 } });
  assert.equal(r.errore, null, String(r.errore?.stack ?? ''));
  const f = fine(r.eventi);
  assert.equal(f?.compattato, true, JSON.stringify(r.eventi.map((e) => [e.tipo, e.motivo, e.ragione])));
  assert.equal(f.ripiego, true);
  assert.equal(f.ragione, 'tempo');
  assert.equal(r.conti.riassunti, 1, 'niente secondo tentativo dopo il tetto');
  assert.ok(r.durataMs < 20_000, `durata ${r.durataMs} ms`);
});

test('ORO-02 inattività dal primo token: un riassunto che manda un pezzo e poi tace si abbandona', async (t) => {
  const riassunto = (_c, segnale) => {
    const enc = new TextEncoder(); let mandato = false;
    return new Response(new ReadableStream({
      pull(c) {
        if (!mandato) { mandato = true; c.enqueue(enc.encode(sse([{ choices: [{ index: 0, delta: { role: 'assistant', content: '## Riass' } }] }]))); return undefined; }
        return abortito(segnale).catch((e) => c.error(e));
      },
    }), { headers: { 'content-type': 'text/event-stream' } });
  };
  const r = await giro(t, { riassunto, opzioni: { progressoCompattazione: true, riassuntoInattivitaMs: 200, riassuntoTettoMs: 30_000 } });
  assert.equal(r.errore, null, String(r.errore?.stack ?? ''));
  assert.equal(fine(r.eventi)?.ragione, 'tempo', JSON.stringify(r.eventi.map((e) => [e.tipo, e.motivo, e.ragione])));
  assert.ok(r.durataMs < 15_000, `durata ${r.durataMs} ms`);
});

test('ORO-03 verso contrario: una lettura lenta PRIMA del primo token non è inattività; il riassunto del modello arriva e si usa', async (t) => {
  const riassunto = async (_c, segnale) => {
    await Promise.race([new Promise((r) => { setTimeout(r, 600); }), abortito(segnale)]);
    const enc = new TextEncoder();
    return new Response(new ReadableStream({ start(c) {
      c.enqueue(enc.encode(sse([{ choices: [{ index: 0, delta: { role: 'assistant', content: `## Riassunto\n${'Dettaglio. '.repeat(20)}` } }] }, { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 1000, completion_tokens: 100 } }]) + 'data: [DONE]\n\n'));
      c.close();
    } }), { headers: { 'content-type': 'text/event-stream' } });
  };
  const r = await giro(t, { riassunto, opzioni: { progressoCompattazione: true, riassuntoInattivitaMs: 150, riassuntoTettoMs: 30_000 } });
  assert.equal(r.errore, null, String(r.errore?.stack ?? ''));
  const f = fine(r.eventi);
  assert.equal(f?.compattato, true, JSON.stringify(r.eventi.map((e) => [e.tipo, e.motivo, e.ragione])));
  assert.notEqual(f.ripiego, true, 'il riassunto del modello, non il ripiego');
});

test('ORO-04 Skip della persona: il riassunto atteso si annulla, il giro prosegue senza modello con ragione «saltato»', async (t) => {
  const salta = new AbortController();
  const r = await giro(t, { riassunto: (_c, segnale) => abortito(segnale), opzioni: { segnaleSaltaRiassunto: salta.signal, riassuntoTettoMs: 30_000 },
    prima: (e) => { if (e.tipo === 'compattazione-inizio') setTimeout(() => salta.abort(), 50); } });
  assert.equal(r.errore, null, String(r.errore?.stack ?? ''));
  const f = fine(r.eventi);
  assert.equal(f?.ripiego, true, JSON.stringify(r.eventi.map((e) => [e.tipo, e.motivo, e.ragione])));
  assert.equal(f.ragione, 'saltato');
  assert.ok(r.durataMs < 15_000);
});

test('ORO-05 verso contrario: lo Stop durante il riassunto resta uno Stop (niente ripiego, niente «tempo»)', async (t) => {
  const stop = new AbortController();
  const r = await giro(t, { riassunto: (_c, segnale) => abortito(segnale), opzioni: { segnaleStop: stop.signal, riassuntoTettoMs: 30_000 },
    prima: (e) => { if (e.tipo === 'compattazione-inizio') setTimeout(() => stop.abort(), 50); } });
  assert.ok(r.durataMs < 15_000);
  assert.equal(r.eventi.some((e) => e.ripiego === true), false, JSON.stringify(r.eventi.map((e) => [e.tipo, e.motivo, e.ragione])));
});

test('ORO-06 l\'orologio: Skip già scattato vale subito; chiudi() spegne i timer; l\'inattività non parte senza vita()', async () => {
  const s = new AbortController(); s.abort();
  const o1 = creaOrologioRiassunto({ segnaleSalta: s.signal, tettoMs: 10_000 });
  assert.equal(o1.ragione, 'saltato'); assert.equal(o1.segnale.aborted, true); o1.chiudi();
  const o2 = creaOrologioRiassunto({ inattivitaMs: 20, tettoMs: 10_000 });
  await new Promise((r) => { setTimeout(r, 80); });
  assert.equal(o2.ragione, null, 'senza un primo pezzo, nessuna inattività'); o2.vita();
  await new Promise((r) => { setTimeout(r, 80); });
  assert.equal(o2.ragione, 'tempo'); o2.chiudi();
});

/* La strada del motore del contesto: un motore finto che fallisce come il motore vero (codice), e la compattazione semplice di quella
   richiesta che NON richiama il modello. Verso contrario: un errore qualsiasi del motore ripiega come prima, col modello. */
const motoreCheFallisce = (code) => ({ prepare: async () => { throw Object.assign(new Error(`engine says ${code}`), { code }); }, captureProviderResponse: async () => undefined });

for (const [code, ragione] of [['CTX_COMPACTION_TIMEOUT', 'tempo'], ['CTX_INVALID_SUMMARY', 'rifiutato']]) {
  test(`ENG-02 ${code} dal motore del contesto: la compattazione semplice va senza modello (ragione «${ragione}»), nessuna richiesta di riassunto`, async (t) => {
    const r = await giro(t, { riassunto: () => RIASSUNTO_BUONO(), opzioni: { contextHooks: motoreCheFallisce(code) } });
    assert.equal(r.errore, null, String(r.errore?.stack ?? ''));
    assert.equal(r.conti.riassunti, 0, 'il modello lento o rifiutato non si richiama');
    const f = r.eventi.filter((e) => e.tipo === 'compattazione-fine' && e.compattato === true).at(-1);
    assert.equal(f?.ripiego, true, JSON.stringify(r.eventi.map((e) => [e.tipo, e.motivo, e.codice, e.ragione])));
    assert.equal(f.ragione, ragione);
  });
}

test('ENG-03 verso contrario: un altro errore del motore (archivio) ripiega come prima, e la compattazione semplice chiama il modello', async (t) => {
  const r = await giro(t, { riassunto: () => RIASSUNTO_BUONO(), opzioni: { contextHooks: motoreCheFallisce('CTX_HISTORY_DIVERGED') } });
  assert.equal(r.errore, null, String(r.errore?.stack ?? ''));
  assert.ok(r.conti.riassunti >= 1, 'qui il riassunto del modello si chiede');
  assert.equal(r.eventi.some((e) => e.ripiego === true && e.compattato === true), false);
});

test('ENG-04 Skip mentre il motore del contesto riassume: il motore riceve l\'annullo nel segnale, e il giro prosegue senza modello («saltato»), non come uno Stop', async (t) => {
  const salta = new AbortController();
  let segnaleVisto = null;
  const motore = { captureProviderResponse: async () => undefined, prepare: async ({ signal }) => {
    segnaleVisto = signal;
    setTimeout(() => salta.abort(), 30);
    await new Promise((_, rifiuta) => { signal.addEventListener('abort', () => rifiuta(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true }); });
  } };
  const r = await giro(t, { riassunto: () => RIASSUNTO_BUONO(), opzioni: { contextHooks: motore, segnaleSaltaRiassunto: salta.signal } });
  assert.equal(r.errore, null, String(r.errore?.stack ?? ''));
  assert.equal(segnaleVisto?.aborted, true, 'il motore ha ricevuto l\'annullo');
  assert.equal(r.conti.riassunti, 0);
  const f = r.eventi.filter((e) => e.tipo === 'compattazione-fine' && e.compattato === true).at(-1);
  assert.equal(f?.ragione, 'saltato', JSON.stringify(r.eventi.map((e) => [e.tipo, e.motivo, e.codice, e.ragione])));
});
