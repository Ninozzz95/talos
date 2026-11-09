/*
 * La riserva dei riassunti sulla strada del MOTORE, con l'errore VERO della porta `callContextModel` (banco del 01/11/2026).
 * Le prove di C6-bis fingevano un errore col campo `stato`, mentre la porta vera lanciava solo `code` e `message`: la catena lo leggeva come
 * «non so che errore sia» e rilanciava, senza riserva e senza avviso. 12 corse C del banco su 12 senza l'avviso.
 * Qui la catena riceve quello che lancia davvero la porta, da una risposta HTTP finta del fornitore.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createContextModelAdapter } from '../src/context-provider-adapter.mjs';
import { createOwnerRuntimeAdapter } from '../src/runtime-owner-adapter.mjs';
import { catenaDelRiassunto, classificaErroreDelRiassunto } from '../src/kernel/catena-del-riassunto.mjs';
import { createImpostazioniContesto } from '../src/impostazioni-contesto.mjs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs';

const SCELTO = { provider: 'openrouter', model: 'z-ai/glm-4.7-flash', windowTokens: 128_000, responseReserve: 4_096 };
const RISERVA = { provider: 'openrouter', model: 'qwen/qwen3.7-flash', windowTokens: 200_000, responseReserve: 4_096 };
const messaggi = [{ role: 'user', content: 'riassumi' }];
const buona = () => Response.json({ choices: [{ message: { content: 'RIASSUNTO' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } });

function porta({ chiave = 'k' } = {}) {
  return createOwnerRuntimeAdapter({ destinazioneModelloDeps: { leggiChiave: () => chiave, leggiRuntime: () => ({ endpoint: 'https://openrouter.ai/api/v1' }), localePronto: () => false, chiamaLocale: async () => { throw new Error('no'); } } });
}
async function erroreDi(risposta, { provider = 'openrouter', model = SCELTO.model, ...opzioni } = {}) {
  try {
    await porta(opzioni).callContextModel({ provider, model, messages: messaggi, maxOutputTokens: 512, fetchDiRete: async () => risposta() });
  } catch (e) { return e; }
  assert.fail('la porta doveva rifiutare');
}

test('RISERVA-VERA-01: la catena riconosce il rifiuto vero della porta (401, 404, 429, 500) e il codice resta quello di prima', async () => {
  const attesi = { 401: ['inutilizzabile', 'accesso-negato'], 404: ['inutilizzabile', 'non-trovato'], 429: ['bloccato', 'limite'], 500: ['bloccato', 'limite'] };
  for (const [stato, [giudizio, motivo]] of Object.entries(attesi)) {
    const e = await erroreDi(() => new Response('no', { status: Number(stato) }));
    assert.equal(e.code, 'CTX_SUMMARY_HTTP', `codice su ${stato}`);
    const g = classificaErroreDelRiassunto(e);
    assert.equal(g?.stato, giudizio, `giudizio su ${stato}`);
    assert.equal(g?.motivo, motivo, `motivo su ${stato}`);
  }
});

test('RISERVA-VERA-02: un 429 con Retry-After dice fino a quando, e il limite del piano si riconosce come limite di account', async () => {
  const ora = Date.now();
  const conAttesa = await erroreDi(() => new Response('no', { status: 429, headers: { 'Retry-After': '120' } }));
  const g = classificaErroreDelRiassunto(conAttesa, { ora });
  assert.ok(g.finoAlle >= ora + 100_000 && g.finoAlle <= ora + 140_000, `finoAlle ${g.finoAlle}`);
  const piano = await erroreDi(() => Response.json({ error: { code: 'subscription_sharing_usage_limit_exceeded' } }, { status: 429 }));
  assert.equal(classificaErroreDelRiassunto(piano).diAccount, true);
  assert.equal(piano.message, 'The summary model answered with HTTP 429.', 'il nome tecnico del limite non va nel testo, che finisce a schermo');
});

test('RISERVA-VERA-05: il 400 vero di OpenRouter per un modello che non esiste è «non-trovato»; un altro 400 no', async () => {
  /* il corpo copiato dalla sonda sul servizio vero (01/11/2026), senza il campo dell'utente */
  const e = await erroreDi(() => Response.json({ error: { message: 'nessuno/modello-che-non-esiste-1 is not a valid model ID', code: 400 } }, { status: 400 }));
  assert.equal(classificaErroreDelRiassunto(e)?.motivo, 'non-trovato');
  assert.equal(e.message, 'The summary model answered with HTTP 400.');
  const altro = await erroreDi(() => Response.json({ error: { message: 'max_tokens is too large', code: 400 } }, { status: 400 }));
  assert.equal(classificaErroreDelRiassunto(altro), null, 'una richiesta sbagliata non è un modello che manca');
  /* D9 (revisione di fine fase, 01/11/2026): senza «ID» la regola prendeva anche un parametro rifiutato */
  const parametro = await erroreDi(() => Response.json({ error: { message: 'temperature is not a valid model parameter', code: 400 } }, { status: 400 }));
  assert.equal(classificaErroreDelRiassunto(parametro), null, 'un parametro rifiutato non è un modello che manca');
});

/* D6 (revisione di fine fase, 01/11/2026): sulla strada del motore il 402 non si leggeva: col credito finito niente riserva. Le forme sono quelle che
   `classificaLimiteOpenRouter` legge sulla strada della chat (`metadata.limit_source`, `metadata.reason`). */
const rifiuto402 = (metadata, message = 'Insufficient credits') => () => Response.json({ error: { code: 402, message, metadata } }, { status: 402 });
const CREDITO = { limit_source: 'openrouter_credits', reason: 'insufficient_credits' };
const BUDGET_OCCUPATO = { limit_source: 'openrouter_in_flight_budget', reason: 'in_flight_budget_exhausted' };

test('RISERVA-VERA-09: il 402 di OpenRouter si legge con la tabella della chat, anche oltre i 2.000 byte, e dice se è del conto', async () => {
  for (const [nome, risposta, classe, diAccount] of [
    ['credito', rifiuto402(CREDITO), 'credito', true],
    ['tetto della chiave', rifiuto402({ limit_source: 'openrouter_key_limit' }), 'limite-chiave', true],
    ['richiesta costosa', rifiuto402({ limit_source: 'openrouter_credits', reason: 'weight_exceeds_budget' }), 'richiesta-costosa', undefined],
    ['budget occupato', rifiuto402(BUDGET_OCCUPATO), 'budget-occupato', undefined],
    ['budget occupato, corpo lungo', rifiuto402(BUDGET_OCCUPATO, 'x'.repeat(3_000)), 'budget-occupato', undefined],
    ['corpo che non si legge', () => new Response('no', { status: 402 }), 'limite-credito', true],
  ]) {
    const e = await erroreDi(risposta);
    assert.equal(e.code, 'CTX_SUMMARY_HTTP', nome);
    assert.equal(e.classe, classe, nome);
    assert.equal(e.message, 'The summary model answered with HTTP 402.', `${nome}: il corpo del fornitore non va nel testo`);
    assert.deepEqual(classificaErroreDelRiassunto(e), { stato: 'bloccato', motivo: 'limite', finoAlle: null, ...(diAccount ? { diAccount } : {}) }, nome);
  }
});

test('RISERVA-VERA-10: AL CONTRARIO: il 402 di un fornitore diretto non passa dalla tabella di OpenRouter', async () => {
  const e = await erroreDi(rifiuto402(CREDITO), { provider: 'deepseek', model: 'deepseek-flash' });
  assert.equal(e.code, 'CTX_SUMMARY_HTTP');
  assert.equal(e.classe, undefined);
});

function catenaSullaPorta({ chiave = 'k', riserva, rispostaDelloScelto }) {
  const owner = porta({ chiave });
  const chiesti = []; const avvisi = [];
  const a = createContextModelAdapter({
    resolveModel: async ({ selected }) => ({ ...selected, windowTokens: SCELTO.windowTokens, responseReserve: SCELTO.responseReserve }),
    callModel: (r) => owner.callContextModel({ provider: r.provider, model: r.model, messages: r.messages, maxOutputTokens: r.maxOutputTokens, signal: r.signal,
      fetchDiRete: async () => { chiesti.push(r.model); return r.model === SCELTO.model ? rispostaDelloScelto() : buona(); } }),
    sceltaDellaPersona: () => ({ provider: SCELTO.provider, model: SCELTO.model }),
    memoriaRiassunto: () => new Map(), riservaDelRiassunto: async () => riserva, onModelloInutilizzabile: (v) => avvisi.push(v),
  });
  return { a, chiesti, avvisi };
}
const riassumi = async (a, modello = SCELTO) => {
  await a.resolveModel({ sessionModel: { provider: 'openrouter', model: 'z-ai/glm-5.3-flash' }, settings: {} });
  return a.summarize({ model: modello, messages: messaggi, maxOutputTokens: 512, operationId: 'op', sessionId: 'chat' });
};

test('RISERVA-VERA-11: credito finito sullo scelto: la riserva su un altro fornitore scrive, quella sullo stesso conto non si chiama', async () => {
  const altra = catenaSullaPorta({ riserva: { ...RISERVA, provider: 'deepseek', model: 'deepseek-flash' }, rispostaDelloScelto: rifiuto402(CREDITO) });
  assert.equal((await riassumi(altra.a)).text, 'RIASSUNTO');
  assert.deepEqual(altra.chiesti, [SCELTO.model, 'deepseek-flash']);
  const stesso = catenaSullaPorta({ riserva: RISERVA, rispostaDelloScelto: rifiuto402(CREDITO) });
  await assert.rejects(riassumi(stesso.a), (e) => { assert.equal(e.classe, 'credito'); return true; });
  assert.deepEqual(stesso.chiesti, [SCELTO.model], 'lo stesso conto: chiamata sprecata');
});

/* D7 (revisione di fine fase, 01/11/2026): dalla porta vera, senza finzioni sull'errore */
test('RISERVA-VERA-12: senza accesso, per ogni via: «senza-chiave» dove manca la chiave o il collegamento, «motore-non-pronto» sul motore locale', async () => {
  for (const [provider, model, code, giudizio] of [
    ['deepseek', 'deepseek-flash', 'PROVIDER_KEY_MISSING', { stato: 'inutilizzabile', motivo: 'senza-chiave' }],
    ['chatgpt', 'gpt-6-luna', 'CHATGPT_NON_COLLEGATO', { stato: 'inutilizzabile', motivo: 'senza-chiave' }],
    ['local', 'qwen3.5-9b', 'LOCAL_RUNTIME_NOT_READY', { stato: 'bloccato', motivo: 'motore-non-pronto', finoAlle: null }],
    ['locale-ospite', 'lfm2.5', 'LOCAL_RUNTIME_NOT_READY', { stato: 'bloccato', motivo: 'motore-non-pronto', finoAlle: null }],
  ]) {
    const e = await erroreDi(buona, { provider, model, chiave: null });
    assert.equal(e.code, code, provider);
    assert.deepEqual(classificaErroreDelRiassunto(e), giudizio, provider);
  }
});

/* Corpo copiato dalla risposta vera di `anthropic/claude-haiku-5.5` del 01/11/2026 (`/compact` fallito 9 volte su 15). Non è un errore HTTP: una risposta
   normale senza testo. La documentazione: si riprova su un altro modello (platform.claude.com/docs/en/build-with-claude/refusals-and-fallback). */
const RIFIUTO = () => Response.json({ id: 'gen', object: 'chat.completion', provider: 'Anthropic', choices: [{ index: 0, finish_reason: 'content_filter', native_finish_reason: 'refusal',
  message: { role: 'assistant', content: null, refusal: 'API integrators: you can reduce refusals for your users by configuring a fallback model', reasoning: null } }] });

test('RISERVA-VERA-07: il rifiuto del modello ha un codice suo e la frase dice che cosa è successo; fa passare alla riserva senza fermare lo scelto', async () => {
  const e = await erroreDi(RIFIUTO);
  assert.equal(e.code, 'CTX_SUMMARY_REFUSED');
  assert.equal(e.message, 'The summary model declined this conversation.', 'il testo del fornitore parla agli integratori, non va a schermo');
  const g = classificaErroreDelRiassunto(e);
  assert.equal(g?.stato, 'bloccato');
  assert.equal(g?.finoAlle, null, 'riguarda questa conversazione, non il modello: nessuna ora di fermo');
  const owner = porta(); const chiesti = []; const avvisi = [];
  const a = createContextModelAdapter({
    resolveModel: async ({ selected }) => ({ ...selected, windowTokens: SCELTO.windowTokens, responseReserve: SCELTO.responseReserve }),
    callModel: (r) => owner.callContextModel({ provider: r.provider, model: r.model, messages: r.messages, maxOutputTokens: r.maxOutputTokens, signal: r.signal,
      fetchDiRete: async () => { chiesti.push(r.model); return r.model === SCELTO.model ? RIFIUTO() : buona(); } }),
    sceltaDellaPersona: () => ({ provider: SCELTO.provider, model: SCELTO.model }), memoriaRiassunto: () => new Map(), riservaDelRiassunto: async () => RISERVA,
    onModelloInutilizzabile: (v) => avvisi.push(v),
  });
  await a.resolveModel({ sessionModel: { provider: 'openrouter', model: 'z-ai/glm-5.3-flash' }, settings: {} });
  assert.equal((await a.summarize({ model: SCELTO, messages: messaggi, maxOutputTokens: 512, operationId: 'op', sessionId: 'chat' })).text, 'RIASSUNTO');
  assert.deepEqual(chiesti, [SCELTO.model, RISERVA.model]);
  assert.equal(avvisi.length, 0, 'il modello non è inutilizzabile: niente avviso');
});

test('RISERVA-VERA-08: un rifiuto dichiarato vince anche se c’è del testo; AL CONTRARIO un campo vuoto non è un rifiuto', async () => {
  const conTesto = await erroreDi(() => Response.json({ choices: [{ finish_reason: 'stop', message: { content: 'I cannot help.', refusal: 'no' } }] }));
  assert.equal(conTesto.code, 'CTX_SUMMARY_REFUSED');
  const soloFiltro = await erroreDi(() => Response.json({ choices: [{ finish_reason: 'content_filter', message: { content: null } }] }));
  assert.equal(soloFiltro.code, 'CTX_SUMMARY_REFUSED', 'il filtro basta, anche senza il campo');
  for (const refusal of [null, '', '   ']) {
    const r = await porta().callContextModel({ provider: 'openrouter', model: SCELTO.model, messages: messaggi, maxOutputTokens: 512,
      fetchDiRete: async () => Response.json({ choices: [{ finish_reason: 'stop', message: { content: 'RIASSUNTO', refusal } }] }) });
    assert.equal(r.text, 'RIASSUNTO', `refusal ${JSON.stringify(refusal)}`);
  }
});

test('RISERVA-VERA-03: senza la chiave del fornitore il giudizio è «senza-chiave», non un errore sconosciuto', async () => {
  const e = await erroreDi(buona, { chiave: null });
  assert.equal(e.code, 'CTX_TOKEN_AUTH');
  assert.equal(classificaErroreDelRiassunto(e)?.motivo, 'senza-chiave');
});

test('RISERVA-VERA-06: la riserva salvata dalle impostazioni, che è un id, arriva alla catena (banco del 01/11: una stringa non la leggeva nessuno)', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'riserva-vera-'));
  t.after(() => rimuoviCartellaDiProvaAttesa(dir));
  const impostazioni = createImpostazioniContesto({ file: join(dir, 'impostazioni-contesto.json') });
  const catena = () => catenaDelRiassunto({ scelto: 'z-ai/glm-4.7-flash', riserva: impostazioni.riassuntoPerUnGiro().riservaDelRiassunto, modelloConversazione: 'anthropic/claude-x' });
  assert.deepEqual(catena().map((a) => a.ruolo), ['scelto', 'senza-modello'], 'di serie nessuna riserva');
  await impostazioni.scrivi({ riservaDelRiassunto: 'qwen/qwen3.7-flash' });
  assert.deepEqual(catena().map((a) => [a.ruolo, a.modello]).slice(0, 2), [['scelto', 'z-ai/glm-4.7-flash'], ['riserva', 'qwen/qwen3.7-flash']]);
  await impostazioni.scrivi({ riservaDelRiassunto: 'chatgpt:gpt-6-luna' });
  assert.equal(catena()[1].modello, 'chatgpt:gpt-6-luna', 'la via diretta resta nell’id');
  await impostazioni.scrivi({ riservaDelRiassunto: 'conversazione' });
  assert.equal(catena()[1].modello, 'anthropic/claude-x', 'la parola «conversazione» non è un modello');
});

test('RISERVA-VERA-04: dalla porta vera alla catena: lo scelto risponde 401, avviso una volta, la riserva scrive', async () => {
  const owner = porta();
  const chiesti = []; const avvisi = []; const scritti = [];
  const a = createContextModelAdapter({
    resolveModel: async ({ selected }) => ({ ...selected, windowTokens: SCELTO.windowTokens, responseReserve: SCELTO.responseReserve }),
    callModel: (r) => owner.callContextModel({ provider: r.provider, model: r.model, messages: r.messages, maxOutputTokens: r.maxOutputTokens, signal: r.signal,
      fetchDiRete: async () => { chiesti.push(r.model); return r.model === SCELTO.model ? new Response('no', { status: 401 }) : buona(); } }),
    sceltaDellaPersona: () => ({ provider: SCELTO.provider, model: SCELTO.model }),
    memoriaRiassunto: () => new Map(),
    riservaDelRiassunto: async () => RISERVA,
    onModelloInutilizzabile: (v) => avvisi.push(v),
    onRiassuntoScritto: (v) => scritti.push(v),
  });
  await a.resolveModel({ sessionModel: { provider: 'openrouter', model: 'z-ai/glm-5.3-flash' }, settings: {} });
  const r = await a.summarize({ model: SCELTO, messages: messaggi, maxOutputTokens: 512, operationId: 'op', sessionId: 'chat' });
  assert.equal(r.text, 'RIASSUNTO');
  assert.deepEqual(chiesti, [SCELTO.model, RISERVA.model]);
  assert.equal(avvisi.length, 1);
  assert.equal(avvisi[0].motivo, 'accesso-negato');
  assert.equal(scritti.length, 1);
});
