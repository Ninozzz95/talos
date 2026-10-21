/*
 * A1, la «stima prima» (owner 21/10/2026 sera; contratto riga viva §4): con la velocità di lettura MISURATA dal motore locale
 * (`timings` nella forma di llama-server, `tools/server/server-common.cpp:139-150`), un riassunto che non starebbe nel tetto non si chiede:
 * il giro prosegue col riassunto senza modello (`ragione: 'stima'`). Velocità ignota (cloud) o motore veloce ⇒ tutto come prima.
 * Adapter desktop VERO, rete finta.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

process.env.TALOS_COMPACTION_TOKEN_CAP = '4000';
const { talosLavora } = await import('../src/kernel/talosHarness.desktop-hotfix.mjs');
const { stimaTokenConversazione: stima, leggiTempiDelMotore, consumaFlussoSSE } = await import('../src/kernel/talosHarness.mjs');
const { rimuoviCartellaDiProva } = await import('./aiuto/rimuovi-cartella-di-prova.mjs');

const storia = (coppie, lunghezza = 420) => Array.from({ length: coppie }, (_, i) => [
  { role: 'user', content: `Domanda ${i}: ${'parola '.repeat(lunghezza / 7)}` },
  { role: 'assistant', content: `Risposta ${i}: ${'parola '.repeat(lunghezza / 7)}` },
]).flat();
const coppiePer = (token) => { let c = 10; while (stima(storia(c + 1)) < token) c += 1; return c; };
const RIASSUNTO_BUONO = () => Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: `## Riassunto\n${'Dettaglio. '.repeat(20)}` }, finish_reason: 'stop' }], usage: { prompt_tokens: 1000, completion_tokens: 100 } });

/** Il giro legge 12 file uno alla volta (la storia cresce fino alla soglia); ogni risposta del modello porta `timings` se dati. */
function rete({ timings }) {
  const conti = { modello: 0, riassunti: 0, modelliDeiRiassunti: [] };
  let fatte = 0;
  const fn = async (_u, o) => {
    const corpo = JSON.parse(o.body);
    if (!corpo.tools?.length) { conti.riassunti += 1; conti.modelliDeiRiassunti.push(corpo.model); return RIASSUNTO_BUONO(); }
    conti.modello += 1;
    const usage = { prompt_tokens: stima(corpo.messages), completion_tokens: 1 };
    const nome = corpo.tools.map((t) => t.function?.name).find((n) => /^(leggi|read|read_file)$/u.test(n));
    const t = typeof timings === 'function' ? timings(fatte) : timings; // una funzione: i tempi del passo N
    const extra = t ? { timings: t } : {};
    if (fatte < 12) {
      fatte += 1;
      return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: null, tool_calls: [{ id: `c${fatte}`, type: 'function', function: { name: nome, arguments: JSON.stringify({ percorso: `f${fatte}.txt`, path: `f${fatte}.txt` }) } }] }, finish_reason: 'tool_calls' }], usage, ...extra });
    }
    return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'fatto' }, finish_reason: 'stop' }], usage, ...extra });
  };
  return { fn, conti };
}

async function giro(t, { timings, modello = 'local:qwen3-8b.gguf', extra = {} }) {
  const cartella = mkdtempSync(join(tmpdir(), 'stima-prima-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  for (let i = 1; i <= 12; i += 1) writeFileSync(join(cartella, `f${i}.txt`), `${'riga del file '.repeat(60)}\n`);
  const r = rete({ timings });
  const eventi = [];
  await talosLavora({ cartella, modello, chiave: 'finta', task: { consegna: 'Leggi.' }, messaggiIniziali: [...storia(coppiePer(2600)), { role: 'user', content: 'Leggi i file.' }],
    contestoDelProgetto: 'Project files:\n', fetchDiRete: r.fn, permessi: 'Full access', riassuntoTettoMs: 60_000, ...extra,
    onGiro: (e) => { if (/^compattazione-(inizio|fine)$/u.test(e?.tipo ?? '')) eventi.push(e); } });
  return { eventi, conti: r.conti };
}
const compattate = (eventi) => eventi.filter((e) => e.tipo === 'compattazione-fine' && e.compattato === true);

test('STIMA-01 motore lento misurato (10 token/s): la lettura non starebbe nel tetto ⇒ niente riassunto del modello, ragione «stima»', async (t) => {
  const r = await giro(t, { timings: { prompt_n: 1000, prompt_ms: 100_000, cache_n: 0 } });
  const fatte = compattate(r.eventi);
  assert.ok(fatte.length >= 1, JSON.stringify(r.eventi.map((e) => [e.tipo, e.motivo, e.ragione])));
  assert.ok(fatte.every((e) => e.ripiego === true && e.ragione === 'stima'), JSON.stringify(fatte.map((e) => [e.ripiego, e.ragione])));
  assert.equal(r.conti.riassunti, 0, 'il riassunto lento non si chiede nemmeno');
});

test('STIMA-02 verso contrario: motore veloce misurato (10.000 token/s) ⇒ il riassunto del modello si chiede come prima', async (t) => {
  const r = await giro(t, { timings: { prompt_n: 1000, prompt_ms: 100, cache_n: 0 } });
  assert.ok(compattate(r.eventi).length >= 1);
  assert.ok(r.conti.riassunti >= 1);
  assert.equal(compattate(r.eventi).some((e) => e.ragione === 'stima'), false);
});

test('STIMA-03 verso contrario: senza `timings` (un fornitore cloud) nessuna stima, il riassunto si chiede', async (t) => {
  const r = await giro(t, { timings: null, modello: 'z-ai/glm-5.3-flash' });
  assert.ok(r.conti.riassunti >= 1);
  assert.equal(compattate(r.eventi).some((e) => e.ragione === 'stima'), false);
});

test('STIMA-04 verso contrario: una lettura piccola (100 token) non conta come misura, anche se lentissima', async (t) => {
  const r = await giro(t, { timings: { prompt_n: 100, prompt_ms: 1_000_000, cache_n: 0 } });
  assert.ok(r.conti.riassunti >= 1);
});

test('STIMA-05 il kernel: `timings` dall\'ULTIMO pacchetto del flusso, solo numeri finiti', async () => {
  assert.deepEqual(leggiTempiDelMotore({ prompt_n: 10, prompt_ms: 5, cache_n: 2, predicted_n: 3, predicted_ms: 1, prompt_per_second: 2000 }),
    { prompt_n: 10, prompt_ms: 5, cache_n: 2, predicted_n: 3, predicted_ms: 1 });
  for (const rotto of [null, [], 'x', { prompt_n: '10', prompt_ms: 5 }, { prompt_n: 10 }, { prompt_n: -1, prompt_ms: 5 }, { prompt_n: 10, prompt_ms: Infinity }]) {
    assert.equal(leggiTempiDelMotore(rotto), null, JSON.stringify(rotto));
  }
  const enc = new TextEncoder();
  const pacchetti = [
    { choices: [{ index: 0, delta: { role: 'assistant', content: 'ciao' } }] },
    { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 12, completion_tokens: 1 }, timings: { prompt_n: 12, prompt_ms: 3, cache_n: 0 } },
  ];
  const corpo = new ReadableStream({ start(c) { for (const p of pacchetti) c.enqueue(enc.encode(`data: ${JSON.stringify(p)}\n\n`)); c.enqueue(enc.encode('data: [DONE]\n\n')); c.close(); } });
  const esito = await consumaFlussoSSE(new Response(corpo, { headers: { 'content-type': 'text/event-stream' } }), () => {});
  assert.equal(esito.timings?.prompt_n, 12);
  assert.equal(esito.timings?.prompt_ms, 3);
});

test('STIMA-06 col motore del contesto: le risposte si osservano anche lì, e quando il motore cade il ripiego usa la stima', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'stima-prima-motore-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  for (let i = 1; i <= 12; i += 1) writeFileSync(join(cartella, `f${i}.txt`), `${'riga del file '.repeat(60)}\n`);
  const r = rete({ timings: { prompt_n: 1000, prompt_ms: 100_000, cache_n: 0 } });
  const motore = { captureProviderResponse: async () => undefined, prepare: async ({ messages }) => {
    if (stima(messages) > 3_400) throw Object.assign(new Error('archive diverged'), { code: 'CTX_HISTORY_DIVERGED' });
    return { messages };
  } };
  const eventi = [];
  await talosLavora({ cartella, modello: 'local:qwen3-8b.gguf', chiave: 'finta', task: { consegna: 'Leggi.' }, messaggiIniziali: [...storia(coppiePer(2600)), { role: 'user', content: 'Leggi i file.' }],
    contestoDelProgetto: 'Project files:\n', fetchDiRete: r.fn, permessi: 'Full access', riassuntoTettoMs: 60_000, contextHooks: motore,
    onGiro: (e) => { if (/^compattazione-(inizio|fine)$/u.test(e?.tipo ?? '')) eventi.push(e); } });
  const fatte = compattate(eventi);
  assert.ok(fatte.length >= 1, JSON.stringify(eventi.map((e) => [e.tipo, e.motivo, e.codice, e.ragione])));
  assert.ok(fatte.every((e) => e.ragione === 'stima'), JSON.stringify(fatte.map((e) => e.ragione)));
  assert.equal(r.conti.riassunti, 0);
});

/* Fusione col modello dei riassunti della CLI (06b9ed101): la velocità misurata è quella del motore della CONVERSAZIONE. Un riassunto
   scritto da un altro modello (l'ausiliario a chiave) non si giudica con quella velocità, e i suoi tempi non la sporcano. */
test('STIMA-07 motore locale lento, riassunto su un altro modello: niente «stima», il riassunto si chiede all\'ausiliario', async (t) => {
  const r = await giro(t, { timings: { prompt_n: 1000, prompt_ms: 100_000, cache_n: 0 }, extra: { modelloRiassunto: 'z-ai/glm-4.7-flash', finestraRiassuntoToken: 32_768 } });
  assert.ok(r.conti.riassunti >= 1, 'il riassunto si chiede');
  assert.ok(r.conti.modelliDeiRiassunti.every((m) => m === 'z-ai/glm-4.7-flash'), JSON.stringify(r.conti.modelliDeiRiassunti));
  assert.equal(compattate(r.eventi).some((e) => e.ragione === 'stima'), false);
});

/* Mobile 21/10, misurato sul Pad (LFM2.5 sul motore dell'app, un giro di tre passi): 6.203 token letti a 123,7 t/s, poi 32 a 27,9 e
   182 a 49,9 — un passo piccolo paga il costo fisso del passo e «sembra» lento. Tenere l'ULTIMA lettura sottostima la velocità di 2-4×
   e farebbe saltare un riassunto che starebbe nel tetto. Vale la lettura più GRANDE del giro. */
test('STIMA-08 una lettura grande e veloce, poi letture piccole e lente: vale la grande, il riassunto si chiede', async (t) => {
  const r = await giro(t, { timings: (n) => (n === 0 ? { prompt_n: 6_000, prompt_ms: 600, cache_n: 0 } : { prompt_n: 300, prompt_ms: 30_000, cache_n: 6_000 }) });
  assert.ok(r.conti.riassunti >= 1, JSON.stringify(compattate(r.eventi).map((e) => e.ragione)));
  assert.equal(compattate(r.eventi).some((e) => e.ragione === 'stima'), false);
});

test('STIMA-09 verso contrario: la lettura più grande del giro è lenta ⇒ la stima vale ancora, anche se dopo arrivano letture piccole veloci', async (t) => {
  const r = await giro(t, { timings: (n) => (n === 0 ? { prompt_n: 6_000, prompt_ms: 600_000, cache_n: 0 } : { prompt_n: 300, prompt_ms: 3, cache_n: 6_000 }) });
  assert.equal(r.conti.riassunti, 0);
  assert.ok(compattate(r.eventi).every((e) => e.ragione === 'stima'));
});
