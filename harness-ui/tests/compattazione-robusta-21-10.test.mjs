/*
 * Owner, 21/10/2026: «fai in modo che sta maledetta compattazione non dia più problemi sia con modelli locali che api key».
 * Ledger: AVM-harness-desktop/.claude/LEDGER-COMPATTAZIONE-ROBUSTA-2026-10-21.md. Tre cure, coi concorrenti alla fonte:
 *   1. il tetto d'uscita del riassunto è lo spazio che RESTA nella finestra, non il budget (Hermes `context_compressor.py:853`, opencode
 *      `compaction.ts:931-947`); finestra ignota ⇒ nessun tetto;
 *   2. un riassunto troncato si richiede UNA volta più breve (Hermes `:768`, opencode NUDGE) — provato in IST2-REV-01/01c;
 *   3. in OVERFLOW (il fornitore ha già detto «non entra») il ripiego senza modello scatta subito, invece di rimandare la richiesta
 *      identica e morire con «contesto pieno».
 * Ermetico: modello finto, nessuna rete.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { talosLavora } from '../src/kernel/talosHarness.desktop-hotfix.mjs';
import { GIRI_PRIMA_DI_COMPATTARE, compattaConversazione, talosLavora as talosLavoraBase } from '../src/kernel/talosHarness.mjs';
import { TETTO_USCITA_RIASSUNTO, VARIABILE_TETTO_TOKEN, eRifiutoDelTettoUscita, tettoUscitaRiassunto } from '../src/kernel/compattazione-desktop.mjs';
import { createCompactionWindowSource } from '../src/compaction-window-source.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const CONSEGNA = 'CONSEGNA-COMP-R: leggi grande.txt più volte e riferisci.';
const PREAMBOLO = 'PREAMBOLO-PROGETTO ' + 'x'.repeat(12_000);
const eRiassunto = (body) => String(body.messages.at(-1)?.content ?? '').includes('CONTEXT COMPACTION');

function cartellaDiProva(t) {
  const dir = mkdtempSync(join(tmpdir(), 'talos-comp-robusta-'));
  writeFileSync(join(dir, 'grande.txt'), `${'g'.repeat(79)}\n`.repeat(50));
  t.after(() => rimuoviCartellaDiProva(dir));
  return dir;
}
function conTetto(t, valore) {
  const prima = process.env[VARIABILE_TETTO_TOKEN];
  process.env[VARIABILE_TETTO_TOKEN] = String(valore);
  t.after(() => { if (prima === undefined) delete process.env[VARIABILE_TETTO_TOKEN]; else process.env[VARIABILE_TETTO_TOKEN] = prima; });
}
/** `pieno(n)`: la n-esima chiamata di lavoro risponde «contesto pieno» (400) invece di lavorare. */
function fornitore({ chiamateTool = 10, riassunto, pieno = () => false } = {}) {
  const corpi = []; let lavoro = 0;
  const fetchDiRete = async (_url, init) => {
    const body = JSON.parse(init.body);
    corpi.push(body);
    const usage = { prompt_tokens: Math.ceil(JSON.stringify(body.messages).length / 4), completion_tokens: 5 };
    if (eRiassunto(body)) {
      const scelta = riassunto?.() ?? { role: 'assistant', content: `RIASSUNTO: ${corpi.length}` };
      return Response.json({ choices: [{ message: scelta, finish_reason: 'stop' }], usage });
    }
    lavoro += 1;
    if (pieno(lavoro)) {
      return Response.json({ error: { message: "This model's maximum context length is 32768 tokens. However, your messages resulted in 40000 tokens.", code: 'context_length_exceeded' } }, { status: 400 });
    }
    if (lavoro <= chiamateTool) {
      return Response.json({ choices: [{ message: { role: 'assistant', content: '', tool_calls: [{ id: `call_${lavoro}`, type: 'function', function: { name: 'leggi', arguments: '{"percorso":"grande.txt"}' } }] }, finish_reason: 'tool_calls' }], usage });
    }
    return Response.json({ choices: [{ message: { role: 'assistant', content: 'Fatto.' }, finish_reason: 'stop' }], usage });
  };
  return { fetchDiRete, corpi, riassunti: () => corpi.filter(eRiassunto) };
}

test('COMP-R-01 il tetto d’uscita è quello di opencode: il minimo fra limite del modello, 32.000 e spazio nella finestra', () => {
  const richiesta = [{ role: 'user', content: 'x'.repeat(20_000) }];
  assert.equal(tettoUscitaRiassunto(richiesta, {}), TETTO_USCITA_RIASSUNTO, 'tutto ignoto: 32.000 (mai «nessun tetto»)');
  assert.equal(tettoUscitaRiassunto(richiesta, { limiteUscita: 16_384 }), 16_384, 'il limite del modello vince');
  // 32.768 − 20.000/2 − 1.024 = 21.744: la finestra stringe sotto i 32.000
  assert.equal(tettoUscitaRiassunto(richiesta, { finestraToken: 32_768 }), 21_744);
  assert.equal(tettoUscitaRiassunto(richiesta, { finestraToken: 32_768, limiteUscita: 8_192 }), 8_192);
  // ⛔ revisione S2: una finestra grande NON alza il tetto oltre i 32.000 (era 116.651 su 131.072)
  assert.equal(tettoUscitaRiassunto(richiesta, { finestraToken: 131_072 }), TETTO_USCITA_RIASSUNTO);
  assert.equal(tettoUscitaRiassunto([{ role: 'user', content: 'x'.repeat(100_000) }], { finestraToken: 4_096 }), 1_024, 'mai sotto 1.024');
});

test('COMP-R-02 sul filo: il riassunto porta il tetto di opencode — 32.000 senza dati, il limite del modello quando arriva dal registro', async (t) => {
  conTetto(t, 8_000);
  const f = fornitore({ chiamateTool: 10 });
  await talosLavora({ cartella: cartellaDiProva(t), task: { consegna: CONSEGNA }, modello: 'z-ai/glm-5.3-flash', chiave: 'fixture',
    fetchDiRete: f.fetchDiRete, contestoDelProgetto: PREAMBOLO, comandoProva: 'node -e 0' });
  const r = f.riassunti();
  assert.ok(r.length >= 1, 'premessa: almeno una compattazione');
  assert.deepEqual([...new Set(r.map((b) => b.max_tokens ?? b.max_completion_tokens))], [TETTO_USCITA_RIASSUNTO]);

  const g = fornitore({ chiamateTool: 10 });
  await talosLavora({ cartella: cartellaDiProva(t), task: { consegna: CONSEGNA }, modello: 'z-ai/glm-5.3-flash', chiave: 'fixture',
    fetchDiRete: g.fetchDiRete, contestoDelProgetto: PREAMBOLO, comandoProva: 'node -e 0', finestraToken: 131_072, limiteUscitaToken: 16_384 });
  const s = g.riassunti();
  assert.ok(s.length >= 1, 'premessa: almeno una compattazione col limite noto');
  assert.ok(s.every((b) => (b.max_tokens ?? b.max_completion_tokens) === 16_384), JSON.stringify(s.map((b) => b.max_tokens)));
});

test('COMP-R-03 OVERFLOW con il riassuntore che fallisce: il ripiego senza modello scatta SUBITO e il giro conclude', async (t) => {
  conTetto(t, 200_000); // la soglia non scatta: la compattazione la chiede solo il «contesto pieno» del fornitore
  const f = fornitore({ chiamateTool: 6, riassunto: () => ({ role: 'assistant', content: '' }), pieno: (n) => n === 4 });
  const eventi = [];
  const esito = await talosLavora({ cartella: cartellaDiProva(t), task: { consegna: CONSEGNA }, modello: 'z-ai/glm-5.3-flash', chiave: 'fixture',
    fetchDiRete: f.fetchDiRete, contestoDelProgetto: PREAMBOLO, comandoProva: 'node -e 0', onGiro: (e) => eventi.push(e) });
  const fini = eventi.filter((e) => e.tipo === 'compattazione-fine');
  assert.ok(fini.length >= 1, `premessa: il contesto pieno ha chiesto una compattazione: ${JSON.stringify(eventi.map((e) => e.tipo))}`);
  const prima = fini[0];
  assert.equal(prima.compattato, true, `⛔ in overflow non si lascia la conversazione com’è: ${JSON.stringify(prima)}`);
  assert.equal(prima.ripiego, true, JSON.stringify(prima));
  assert.equal(esito.comeFinita, 'concluso', JSON.stringify(esito.comeFinita));
  assert.ok(f.riassunti().length <= 2, `al più i due tentativi di quella compattazione: ${f.riassunti().length}`);
});

test('COMP-R-04 (CLI D5) ogni «compattato: false» del kernel dice PERCHÉ: niente da compattare, errore col codice, troncato, vuoto', async () => {
  const storia = [{ role: 'system', content: 'S' }, { role: 'user', content: 'compito' }, { role: 'assistant', content: 'fatto' }];
  assert.equal((await compattaConversazione([{ role: 'system', content: 'S' }], async () => ({}))).motivo, 'niente-da-compattare');
  const errore = await compattaConversazione(storia, async () => { throw Object.assign(new Error('nessuna chiave'), { code: 'PROVIDER_KEY_MISSING' }); });
  assert.deepEqual([errore.compattato, errore.motivo, errore.codice], [false, 'errore', 'PROVIDER_KEY_MISSING']);
  assert.equal((await compattaConversazione(storia, async () => { throw new Error('senza codice'); })).codice, null);
  assert.equal((await compattaConversazione(storia, async () => ({ scelta: { content: 'mezzo' }, finishReason: 'length' }))).motivo, 'troncato');
  assert.equal((await compattaConversazione(storia, async () => ({ scelta: { content: '  ' }, finishReason: 'stop' }))).motivo, 'vuoto');
  // AL CONTRARIO: riuscita, nessun motivo
  const ok = await compattaConversazione(storia, async () => ({ scelta: { content: 'RIASSUNTO' }, finishReason: 'stop' }));
  assert.equal(ok.compattato, true);
  assert.equal(ok.motivo, undefined);
});

test('COMP-R-05 (CLI D4) nel ciclo di BASE una compattazione fallita dice perché con l’evento del desktop; riuscita, nessun evento di fallimento', async (t) => {
  const corri = async (riassuntoRotto) => {
    const eventi = []; let lavoro = 0;
    const fetchDiRete = async (_url, init) => {
      const body = JSON.parse(init.body);
      const usage = { prompt_tokens: 100, completion_tokens: 5 };
      if (String(body.messages.at(-1)?.content ?? '').startsWith('Before continuing, summarize your progress')) {
        if (riassuntoRotto) return Response.json({ error: { message: 'boom' } }, { status: 400 });
        return Response.json({ choices: [{ message: { role: 'assistant', content: 'RIASSUNTO' }, finish_reason: 'stop' }], usage });
      }
      lavoro += 1;
      if (lavoro <= GIRI_PRIMA_DI_COMPATTARE + 1) {
        return Response.json({ choices: [{ message: { role: 'assistant', content: '', tool_calls: [{ id: `c${lavoro}`, type: 'function', function: { name: 'leggi', arguments: '{"percorso":"grande.txt"}' } }] }, finish_reason: 'tool_calls' }], usage });
      }
      return Response.json({ choices: [{ message: { role: 'assistant', content: 'Fatto.' }, finish_reason: 'stop' }], usage });
    };
    await talosLavoraBase({ cartella: cartellaDiProva(t), task: { consegna: CONSEGNA }, modello: 'z-ai/glm-5.3-flash', chiave: 'fixture', fetchDiRete,
      onGiro: (e) => { if (e?.tipo === 'compattazione-fine') eventi.push(e); } });
    return eventi;
  };
  const rotto = await corri(true);
  assert.ok(rotto.length >= 1, 'premessa: il ciclo di base ha tentato una compattazione');
  assert.deepEqual([rotto[0].compattato, rotto[0].motivo], [false, 'errore'], JSON.stringify(rotto[0]));
  assert.ok(Number.isSafeInteger(rotto[0].giro), JSON.stringify(rotto[0]));
  // AL CONTRARIO: riuscita ⇒ nessun «compattazione-fine» falso
  assert.deepEqual((await corri(false)).filter((e) => e.compattato === false), []);
});

/* Riproduzione del revisore (21/10, ROSSO S2 su 349a3f9a4): un fornitore col SUO limite d'uscita (16.384, come gpt-4o) e la sua risposta 400. */
function fornitoreConLimite(limite) {
  const corpi = []; let lavoro = 0; const rifiuti = [];
  const fetchDiRete = async (_url, init) => {
    const body = JSON.parse(init.body); corpi.push(body);
    const usage = { prompt_tokens: Math.ceil(JSON.stringify(body.messages).length / 4), completion_tokens: 5 };
    if (eRiassunto(body)) {
      const mt = body.max_tokens ?? body.max_completion_tokens;
      if (mt !== undefined && mt > limite) { rifiuti.push(mt); return Response.json({ error: { message: `max_tokens is too large: ${mt}. This model supports at most ${limite} completion tokens, whereas you provided ${mt}.`, type: 'invalid_request_error', param: 'max_tokens', code: 'invalid_value' } }, { status: 400 }); }
      return Response.json({ choices: [{ message: { role: 'assistant', content: 'RIASSUNTO VERO' }, finish_reason: 'stop' }], usage });
    }
    lavoro += 1;
    if (lavoro <= 10) return Response.json({ choices: [{ message: { role: 'assistant', content: '', tool_calls: [{ id: `call_${lavoro}`, type: 'function', function: { name: 'leggi', arguments: '{"percorso":"grande.txt"}' } }] }, finish_reason: 'tool_calls' }], usage });
    return Response.json({ choices: [{ message: { role: 'assistant', content: 'Fatto.' }, finish_reason: 'stop' }], usage });
  };
  return { fetchDiRete, corpi, rifiuti };
}
test('COMP-R-06 (revisione S2) gpt-4o, limite 16.384: ignoto ⇒ il 400 sul tetto si ritenta col budget e la compattazione RIESCE; noto ⇒ nessun rifiuto', async (t) => {
  conTetto(t, 8_000);
  const compattazioni = async (extra) => {
    const f = fornitoreConLimite(16_384); const eventi = [];
    await talosLavora({ cartella: cartellaDiProva(t), task: { consegna: CONSEGNA }, modello: 'openai/gpt-4o', chiave: 'fixture', fetchDiRete: f.fetchDiRete,
      contestoDelProgetto: PREAMBOLO, comandoProva: 'node -e 0', finestraToken: 131_072, onGiro: (e) => eventi.push(e), ...extra });
    return { f, riuscite: eventi.filter((e) => e.tipo === 'compattazione-fine' && e.compattato === true && e.ripiego !== true).length };
  };
  const ignoto = await compattazioni({});
  assert.ok(ignoto.riuscite >= 1, `⛔ con le chiavi API la compattazione deve riuscire: ${JSON.stringify({ rifiuti: ignoto.f.rifiuti, riuscite: ignoto.riuscite })}`);
  assert.ok(ignoto.f.rifiuti.length >= 1, 'premessa: il fornitore ha rifiutato il tetto di 32.000');
  const noto = await compattazioni({ limiteUscitaToken: 16_384 });
  assert.ok(noto.riuscite >= 1);
  assert.equal(noto.f.rifiuti.length, 0, 'col limite noto nessuna richiesta sprecata');
});

test('COMP-R-07 la cintura riconosce il rifiuto del TETTO d’uscita (OpenAI, Anthropic) e NON il contesto pieno', () => {
  const e = (status, message) => Object.assign(new Error(message), { status });
  assert.equal(eRifiutoDelTettoUscita(e(400, 'max_tokens is too large: 32000. This model supports at most 16384 completion tokens, whereas you provided 32000.')), true);
  assert.equal(eRifiutoDelTettoUscita(e(400, 'max_tokens: 32000 > 8192, which is the maximum allowed number of output tokens for claude-3-haiku')), true);
  assert.equal(eRifiutoDelTettoUscita(e(400, "Unsupported value: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.")), true);
  // AL CONTRARIO: il contesto pieno, un 429, un 400 qualunque
  assert.equal(eRifiutoDelTettoUscita(e(400, "This model's maximum context length is 32768 tokens. However, your messages resulted in 40000 tokens.")), false);
  assert.equal(eRifiutoDelTettoUscita(e(429, 'max_tokens rate limit')), false);
  assert.equal(eRifiutoDelTettoUscita(e(400, 'invalid tool schema')), false);
});

test('COMP-R-08 la sorgente della finestra legge anche il limite d’uscita degli endpoint OpenRouter (il minimo); uno senza ⇒ ignoto', async () => {
  const conEndpoint = (endpoints) => createCompactionWindowSource({ fetchFn: async () => Response.json({ data: { id: 'openai/gpt-4o', endpoints } }) });
  const a = conEndpoint([{ model_id: 'openai/gpt-4o', context_length: 128_000, max_completion_tokens: 16_384 }, { model_id: 'openai/gpt-4o', context_length: 131_072, max_completion_tokens: 32_768 }]);
  await a.refresh('openai/gpt-4o');
  assert.deepEqual([a.get('openai/gpt-4o'), a.getUscita('openai/gpt-4o')], [128_000, 16_384]);
  const b = conEndpoint([{ model_id: 'openai/gpt-4o', context_length: 128_000, max_completion_tokens: 16_384 }, { model_id: 'openai/gpt-4o', context_length: 131_072 }]);
  await b.refresh('openai/gpt-4o');
  assert.equal(b.getUscita('openai/gpt-4o'), null);
  assert.equal(b.getUscita('local:qualcosa'), null);
});
