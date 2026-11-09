/*
 * Decisione 324 (owner 06/11/2026 21:34, «Cura come Hermes ora»): in TALOS l'owner ha visto «The model answered with neither text
 * nor tools (4 times in a row; provider reason: stop)». Il modello RAGIONAVA e chiudeva con `stop` senza testo: spinta e due
 * ritentativi rifacevano la stessa domanda da capo, quattro volte pagate.
 * Forma: `in-corso/FORMA-VUOTA-SOLO-RAGIONAMENTO-2026-11-06.md`. Come Hermes (`agent/turn_empty_response.py:244-265`,
 * `_thinking_prefill_retries < 2`, clone hermes-agent-2026-11-01): prima della scala, fino a DUE «continuazioni sul ragionamento».
 * Decisione 326 (owner 06/11 ~22:20, «Secondo giro completo»): la continuazione è un assistant IN CODA col ragionamento (prefill),
 * MAI seguito da una nota `user` (con la nota i template di Qwen3/3.5, GLM-4.7 e DeepSeek V3.2 buttano il ragionamento: revisore 2,
 * render dei template veri); vive solo nella richiesta, mai nella storia (Hermes `_EPHEMERAL_SCAFFOLDING_FLAGS`,
 * `agent/session_persistence.py:33-43`); il tetto di due si riarma a ogni giro di attrezzi (`agent/turn_tool_round.py:295-302`).
 * Gli eventi del fornitore sono copiati dalla forma di `risposta-vuota.test.mjs` (SSE con `delta.reasoning`, `finish_reason: stop`,
 * uso in coda) e, per `reasoning_details`, dalle registrazioni vere di OpenRouter in opencode
 * (`opencode-2026-10-15/packages/ai/test/fixtures/recordings/openrouter-reasoning.json`).
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import * as kernel from '../src/kernel/talosHarness.mjs';
import { piegaNoteInCoda } from '../src/kernel/sistema-piegato.mjs';
import { nativeProviderResponse } from '../src/native-provider-adapter.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { preparaRichiestaCompatibile } from '../src/openai-compatible-runtime.mjs';
import { classificaErroreFornitore, numeriDelContestoPieno } from '../src/kernel/compattazione-desktop.mjs';

const { talosLavora, decidiRispostaVuota, storiaDelGiroFallito, SEGNAPOSTO_RISPOSTA_VUOTA, NOTA_RISPOSTA_VUOTA } = kernel;
const enc = new TextEncoder();

function flussoIntero(fotogrammi) {
  return new Response(new ReadableStream({
    start(c) {
      for (const f of fotogrammi) c.enqueue(enc.encode(`data: ${JSON.stringify(f)}\n\n`));
      c.enqueue(enc.encode('data: [DONE]\n\n'));
      c.close();
    },
  }));
}
const testo = (t) => ({ choices: [{ delta: { content: t } }] });
const ragionamento = (t) => ({ choices: [{ delta: { reasoning: t } }] });
const uso = (prompt, completion, extra = {}) => ({ choices: [], usage: { prompt_tokens: prompt, completion_tokens: completion, total_tokens: prompt + completion, ...extra } });
const fine = { choices: [{ delta: {}, finish_reason: 'stop' }] };
const shellVerde = `${JSON.stringify(process.execPath)} -e "process.exit(0)"`;
const chiamaShell = (id) => ({ choices: [{ delta: { tool_calls: [{ index: 0, id, type: 'function', function: { name: 'shell', arguments: JSON.stringify({ comando: shellVerde }) } }] } }] });
const fineAttrezzi = { choices: [{ delta: {}, finish_reason: 'tool_calls' }] };
const attrezzo = (id = 'call_a') => () => flussoIntero([chiamaShell(id), fineAttrezzi, uso(90, 5)]);
/** Il caso dell'owner: ragionamento, poi `stop` senza testo né attrezzi. */
const vuotaRagionata = (r = 'Devo ancora scrivere la risposta') => () => flussoIntero([ragionamento(r), fine, uso(100, 7)]);
/** Il vuoto muto: niente ragionamento, niente uscita. */
const vuotaMuta = () => flussoIntero([{ choices: [{ index: 0, delta: { content: '' }, finish_reason: 'stop' }] }, uso(100, 0)]);
const risposta = (t) => () => flussoIntero([testo(t), fine, uso(110, 4)]);
const DEEPSEEK = 'Riprendo dal punto 1 al prossimo giro: il contesto di questa sessione è agli ultimi token e non voglio lasciare modifiche a metà nell\'albero.';

function rete(...risposte) {
  const corpi = [];
  return {
    corpi,
    fetch: async (_url, opzioni) => {
      corpi.push(JSON.parse(opzioni.body));
      const r = risposte[corpi.length - 1];
      return typeof r === 'function' ? r() : r;
    },
  };
}
const lavora = (r, extra = {}) => {
  const eventi = [];
  const esito = talosLavora({ cartella: cartellaDiProva('talos-vuota-ragionamento-'), task: { consegna: 'correggi il difetto' }, modello: 'x', chiave: 'y',
    permessi: 'bypass', fetchDiRete: r.fetch, onDelta: () => {}, onGiro: (e) => eventi.push(e), ...extra });
  return { esito, eventi };
};
const rifiuta = (promessa) => promessa.then(() => { throw new Error('doveva rifiutare'); }, (e) => e);
const portaLaNota = (corpo, nota) => corpo.messages.some((m) => m.role === 'user' && m.content === nota);
/** La continuazione: la richiesta finisce su un assistant senza testo e senza attrezzi (il prefill), niente dopo di lui. */
const conPrefill = (corpo) => corpo.messages.at(-1)?.role === 'assistant' && !corpo.messages.at(-1).tool_calls?.length && corpo.messages.at(-1).content === '';
const impalcatura = (m) => m?.content === SEGNAPOSTO_RISPOSTA_VUOTA || (m?.role === 'assistant' && m.content === '' && !m.tool_calls?.length)
  || Object.hasOwn(m ?? {}, 'reasoning_details');

test('VSR-00: due continuazioni al massimo, e nessuna nota `user` della continuazione esiste più', () => {
  assert.equal(kernel.CONTINUAZIONI_SUL_RAGIONAMENTO_MASSIME, 2);
  assert.equal(kernel.NOTA_CONTINUA_RAGIONAMENTO, undefined, 'la nota dopo il ragionamento faceva buttare il ragionamento ai template (reperto A)');
});

test('VSR-01 (A, C): vuota con ragionamento ⇒ un assistant IN CODA col ragionamento, nessun user dopo; la storia non cresce; uso nella ricevuta', async () => {
  const r = rete(vuotaRagionata('Il difetto è nella riga 3'), risposta('Corretto: riga 3.'));
  const { esito } = lavora(r);
  const e = await esito;
  assert.equal(e.comeFinita, 'concluso');
  assert.equal(e.detto, 'Corretto: riga 3.');
  assert.equal(r.corpi.length, 2);
  const seconda = r.corpi[1].messages;
  assert.deepEqual(seconda.at(-1), { role: 'assistant', content: '', reasoning_content: 'Il difetto è nella riga 3' },
    'l\'ultimo messaggio è l\'assistant col suo ragionamento (prefill): niente user dopo, niente segnaposto da continuare');
  assert.deepEqual(seconda.slice(0, -1), r.corpi[0].messages, 'davanti al prefill la stessa richiesta di prima: niente impalcatura nella storia');
  /* giro 3 (VSR-01 misurava il tempo, < 450 ms: rosso falso sotto carico): la continuazione si riconosce dalla forma, il ritentativo (l'unico
     gradino che aspetta) rimanderebbe la stessa richiesta senza prefill, e qui sopra la seconda finisce sul prefill */
  assert.equal(e.usage.prompt_tokens, 210, 'la chiamata vuota è nel conto (100 + 110)');
  assert.equal(e.usage.completion_tokens, 11);
  assert.equal(e.messaggiFinali.some(impalcatura), false, 'dopo il successo nessuna impalcatura resta nella storia (reperto C)');
  assert.equal(e.messaggiFinali.at(-1).content, 'Corretto: riga 3.');
});

test('VSR-02: dopo gli attrezzi la continuazione viene PRIMA della spinta', async () => {
  const r = rete(attrezzo(), vuotaRagionata(), risposta('Fatto.'));
  const e = await lavora(r).esito;
  assert.equal(e.comeFinita, 'concluso');
  assert.equal(r.corpi.length, 3);
  assert.equal(conPrefill(r.corpi[2]), true);
  assert.equal(r.corpi[2].messages.at(-2).role, 'tool', 'il prefill segue subito l\'esito dell\'attrezzo');
  assert.equal(portaLaNota(r.corpi[2], NOTA_RISPOSTA_VUOTA), false, 'la spinta resta per dopo');
});

test('VSR-03: due continuazioni al massimo, poi la scala di oggi invariata (spinta, due ritentativi, errore onesto)', async () => {
  const r = rete(attrezzo(), vuotaRagionata('A'), vuotaRagionata('B'), vuotaRagionata('C'), vuotaRagionata(), vuotaRagionata(), vuotaRagionata(), risposta('mai'));
  const errore = await rifiuta(lavora(r).esito);
  assert.equal(r.corpi.length, 7, 'attrezzo, vuota, 2 continuazioni, spinta, 2 ritentativi');
  assert.equal(conPrefill(r.corpi[2]), true);
  assert.equal(r.corpi[2].messages.at(-1).reasoning_content, 'A');
  assert.equal(conPrefill(r.corpi[3]), true);
  assert.equal(r.corpi[3].messages.at(-1).reasoning_content, 'AB', 'la seconda continuazione prosegue la prima: il ragionamento si somma');
  assert.deepEqual(r.corpi[3].messages.slice(0, -1), r.corpi[1].messages, 'nessuna impalcatura fra una continuazione e l\'altra');
  assert.equal(portaLaNota(r.corpi[3], NOTA_RISPOSTA_VUOTA), false);
  assert.equal(conPrefill(r.corpi[4]), false, 'la terza vuota non porta una terza continuazione');
  assert.deepEqual(r.corpi[4].messages.at(-1), { role: 'user', content: NOTA_RISPOSTA_VUOTA }, 'la terza vuota prende la spinta');
  assert.equal(r.corpi[4].messages.at(-2).reasoning_content, 'C');
  assert.equal(r.corpi[4].messages.at(-3).role, 'tool', 'la spinta segue l\'esito dell\'attrezzo, come prima della decisione 324');
  assert.deepEqual(r.corpi[6].messages, r.corpi[5].messages, 'i ritentativi rifanno la stessa richiesta');
  assert.equal(errore.code, 'PROVIDER_EMPTY_RESPONSE');
  assert.equal(errore.classe, 'risposta-vuota');
  assert.match(errore.message, /6 times in a row/u, 'il conto onesto delle risposte vuote, continuazioni comprese');
  assert.equal(errore.messaggiDelGiro.some(impalcatura), false, 'l\'impalcatura non resta nella storia del giro fallito');
});

test('VSR-04 AL CONTRARIO: vuota SENZA ragionamento ⇒ la scala di oggi, nessuna continuazione', async () => {
  const r = rete(attrezzo(), vuotaMuta, risposta('Fatto.'));
  const e = await lavora(r).esito;
  assert.equal(e.comeFinita, 'concluso');
  assert.equal(r.corpi.length, 3);
  assert.equal(portaLaNota(r.corpi[2], NOTA_RISPOSTA_VUOTA), true);
  assert.equal(conPrefill(r.corpi[2]), false);
});

test('VSR-05 AL CONTRARIO: un rifiuto del modello col ragionamento esce subito, senza continuazioni', async () => {
  const rifiutoRagionato = () => flussoIntero([ragionamento('Non posso'), { choices: [{ index: 0, delta: { content: '' }, finish_reason: 'stop', native_finish_reason: 'refusal' }] }, uso(100, 3)]);
  const r = rete(rifiutoRagionato, risposta('mai'));
  const errore = await rifiuta(lavora(r).esito);
  assert.equal(errore.classe, 'rifiuto-del-modello');
  assert.equal(r.corpi.length, 1);
});

/* misurato sul codice di oggi (06/11/2026): quante richieste fa la scala del tetto prima della sua fine */
const RICHIESTE_DEL_TETTO = 2;
test('VSR-06 AL CONTRARIO: solo ragionamento TAGLIATO DAL TETTO ⇒ la scala del tetto, esatta, nessuna continuazione', async () => {
  const tagliata = () => flussoIntero([ragionamento('lungo'), { choices: [{ index: 0, delta: {}, finish_reason: 'length' }] }, uso(100, 16384)]);
  const r = rete(tagliata, tagliata, tagliata, tagliata, risposta('mai'));
  const errore = await rifiuta(lavora(r).esito);
  assert.equal(errore.code, kernel.erroreTettoUscitaEsaurito('ragionamento', []).code, 'la fine della scala del tetto, non la risposta vuota');
  assert.equal(r.corpi.length, RICHIESTE_DEL_TETTO);
  assert.equal(r.corpi.some(conPrefill), false);
  assert.equal(r.corpi.some((c) => portaLaNota(c, NOTA_RISPOSTA_VUOTA)), false);
});

test('VSR-07 (decisione 245, P3) AL CONTRARIO: dopo il richiamo per il contesto, una vuota col ragionamento non prende continuazioni', async () => {
  const r = rete(attrezzo(), risposta(DEEPSEEK), vuotaRagionata(), risposta('mai'));
  const e = await lavora(r).esito;
  assert.equal(r.corpi.length, 3, 'nessuna richiesta oltre il richiamo');
  assert.equal(e.comeFinita, 'concluso');
  assert.equal(e.messaggiFinali.at(-1)?.content, DEEPSEEK);
  // dopo il richiamo, attrezzi nuovi e poi una vuota ragionata: la spinta di R2, mai la continuazione
  const r2 = rete(attrezzo('call_a'), risposta(DEEPSEEK), attrezzo('call_b'), vuotaRagionata(), risposta('Fatto.'));
  const e2 = await lavora(r2).esito;
  assert.equal(e2.comeFinita, 'concluso');
  assert.equal(r2.corpi.length, 5);
  assert.equal(portaLaNota(r2.corpi[4], NOTA_RISPOSTA_VUOTA), true);
  assert.equal(conPrefill(r2.corpi[4]), false);
});

test('VSR-07b (decisione 245, P3): dopo il richiamo la spinta resta UNA nel giro anche con vuote ragionate ⇒ poi errore onesto', async () => {
  const r = rete(attrezzo('call_a'), risposta(DEEPSEEK), attrezzo('call_b'), vuotaRagionata(), attrezzo('call_c'), vuotaRagionata(), risposta('mai'));
  const errore = await rifiuta(lavora(r).esito);
  assert.equal(errore.code, 'PROVIDER_EMPTY_RESPONSE');
  assert.equal(r.corpi.length, 6, 'nessuna settima richiesta: niente seconda spinta, niente continuazioni');
  assert.equal(r.corpi.some(conPrefill), false);
});

test('VSR-08 (decisione 245, P3): una continuazione è una chiamata in più: dopo di lei la fermata per il contesto non si richiama', async () => {
  const r = rete(attrezzo(), vuotaRagionata(), risposta(DEEPSEEK), risposta('mai'));
  const { esito, eventi } = lavora(r);
  const e = await esito;
  assert.equal(r.corpi.length, 3);
  assert.equal(e.comeFinita, 'concluso');
  assert.equal(eventi.filter((x) => x.tipo === 'continuazione' && x.motivo === 'fermata-contesto').length, 0);
});

test('VSR-09 (D, F): la decisione pura: «dopo gli attrezzi» si decide alla PRIMA vuota; le continuazioni restano fuori dalla firma', () => {
  const vuota = { finishReason: 'stop', nativeFinishReason: null, erroreFornitore: null, ragionamento: true };
  const usage = { completion_tokens: 7 };
  const stato = { spintaFatta: false, ritentativi: 0, tentativi: [] };
  assert.equal(decidiRispostaVuota(stato, { vuota, usage, dopoAttrezzi: true }).azione, 'continua');
  // la finestra degli ultimi messaggi può non vedere più l'attrezzo: la decisione presa alla prima vuota resta
  assert.equal(decidiRispostaVuota(stato, { vuota, usage, dopoAttrezzi: false }).azione, 'continua');
  assert.equal(decidiRispostaVuota(stato, { vuota, usage, dopoAttrezzi: false }).azione, 'spinta');
  assert.equal(stato.tentativi.length, 1, 'le due continuazioni non entrano nella firma deterministica (Hermes `turn_empty_response.py:270-274`)');
  const dopo = { spintaFatta: false, ritentativi: 0, tentativi: [] };
  assert.equal(decidiRispostaVuota(dopo, { vuota, usage, dopoAttrezzi: true, dopoIlRichiamo: true }).azione, 'spinta');
  const muta = { spintaFatta: false, ritentativi: 0, tentativi: [] };
  assert.equal(decidiRispostaVuota(muta, { vuota: { ...vuota, ragionamento: false }, usage: { completion_tokens: 0 } }).azione, 'ritenta');
  const spente = { spintaFatta: false, ritentativi: 0, tentativi: [] };
  assert.equal(decidiRispostaVuota(spente, { vuota, usage, dopoAttrezzi: true, continuazioniSpente: true }).azione, 'spinta',
    'un fornitore che ha rifiutato il prefill torna alla scala di oggi');
});

test('VSR-10 (C): uno Stop durante la continuazione non lascia impalcatura nella storia', async () => {
  const controllo = new AbortController();
  const corpi = [];
  const fetch = async (_url, opzioni) => {
    corpi.push(JSON.parse(opzioni.body));
    if (corpi.length === 2) { controllo.abort(); throw Object.assign(new Error('aborted'), { name: 'AbortError' }); }
    return vuotaRagionata('Sto pensando')();
  };
  const e = await talosLavora({ cartella: cartellaDiProva('talos-vuota-ragionamento-'), task: { consegna: 'correggi il difetto' }, modello: 'x', chiave: 'y',
    permessi: 'bypass', fetchDiRete: fetch, onDelta: () => {}, onGiro: () => {}, segnaleStop: controllo.signal }).catch((x) => x);
  assert.equal(corpi.length, 2);
  assert.equal(conPrefill(corpi[1]), true);
  const storia = e.messaggiFinali ?? e.messaggiDelGiro;
  assert.ok(Array.isArray(storia), 'la storia del giro fermato c\'è');
  assert.equal(storia.some(impalcatura), false, 'né prefill né segnaposto nella storia dopo lo Stop');
});

test('VSR-11 (E): il tetto delle continuazioni si riarma a ogni giro di attrezzi, come Hermes', async () => {
  const r = rete(vuotaRagionata(), vuotaRagionata(), attrezzo(), vuotaRagionata(), vuotaRagionata(), vuotaRagionata(), risposta('Fatto.'));
  const e = await lavora(r).esito;
  assert.equal(e.comeFinita, 'concluso');
  assert.equal(r.corpi.length, 7);
  assert.deepEqual(r.corpi.map(conPrefill), [false, true, true, false, true, true, false]);
  assert.deepEqual(r.corpi[6].messages.at(-1), { role: 'user', content: NOTA_RISPOSTA_VUOTA }, 'dopo le due nuove continuazioni, la spinta');
});

test('VSR-12 (B): il ragionamento CIFRATO di OpenRouter (`reasoning_details`) fa scattare la continuazione e torna intatto; mai nella storia', async () => {
  const cifrato = { type: 'reasoning.encrypted', data: 'gAAAAABpCIFRATO', id: 'rs_0a1', format: 'openai-responses-v1', index: 0 };
  const vuotaCifrata = () => flussoIntero([{ choices: [{ delta: { reasoning_details: [cifrato] } }] }, fine,
    uso(100, 64, { completion_tokens_details: { reasoning_tokens: 64 } })]);
  const r = rete(vuotaCifrata, risposta('Fatto.'));
  const e = await lavora(r, { modello: 'openai/gpt-5.5' }).esito;
  assert.equal(e.detto, 'Fatto.');
  assert.equal(r.corpi.length, 2);
  assert.deepEqual(r.corpi[1].messages.at(-1), { role: 'assistant', content: '', reasoning_details: [cifrato] });
  assert.equal(e.messaggiFinali.some(impalcatura), false);
  // il testo arriva a pezzi e la firma alla fine (registrazione vera): un dettaglio solo, come opencode `mergeReasoningDetails`
  const pezzo = (d) => ({ choices: [{ delta: { reasoning: d.text ?? '', reasoning_details: [d] } }] });
  const vuotaFirmata = () => flussoIntero([
    pezzo({ type: 'reasoning.text', text: '173', format: 'anthropic-claude-v1', index: 0 }),
    pezzo({ type: 'reasoning.text', text: ' × 219', format: 'anthropic-claude-v1', index: 0 }),
    pezzo({ type: 'reasoning.text', signature: 'Ev8CFIRMA', format: 'anthropic-claude-v1', index: 0 }), fine, uso(100, 9)]);
  const r2 = rete(vuotaFirmata, risposta('37887'));
  await lavora(r2, { modello: 'anthropic/claude-sonnet-5' }).esito;
  assert.deepEqual(r2.corpi[1].messages.at(-1), { role: 'assistant', content: '', reasoning_content: '173 × 219',
    reasoning_details: [{ type: 'reasoning.text', text: '173 × 219', signature: 'Ev8CFIRMA', format: 'anthropic-claude-v1', index: 0 }] });
  // fuori da OpenRouter il campo non parte (Groq, Cerebras, Mistral rifiutano i campi che non conoscono)
  const r3 = rete(vuotaFirmata, risposta('37887'));
  await lavora(r3).esito;
  assert.equal(conPrefill(r3.corpi[1]), true);
  assert.equal(Object.hasOwn(r3.corpi[1].messages.at(-1), 'reasoning_details'), false);
});

test('VSR-13 (giro 3, a): token di ragionamento contati SOLO nell\'uso ⇒ niente da rimandare, quindi NESSUNA continuazione: la scala di oggi', async () => {
  /* revisori 1 e 3, giro 2: la «continuazione» senza niente da rimandare era la stessa domanda subito, una chiamata in più senza attesa.
     Hermes continua solo con qualcosa da rimettere in coda (`_has_structured`, `agent/turn_empty_response.py:246-250`: niente uso). */
  const vuotaNascosta = () => flussoIntero([{ choices: [{ index: 0, delta: { content: '' }, finish_reason: 'stop' }] },
    uso(100, 40, { completion_tokens_details: { reasoning_tokens: 40 } })]);
  const r = rete(attrezzo(), vuotaNascosta, risposta('Fatto.'));
  const e = await lavora(r).esito;
  assert.equal(e.detto, 'Fatto.');
  assert.equal(r.corpi.length, 3);
  assert.equal(conPrefill(r.corpi[2]), false);
  assert.deepEqual(r.corpi[2].messages.at(-1), { role: 'user', content: NOTA_RISPOSTA_VUOTA }, 'dopo gli attrezzi: la spinta di oggi');
  // senza attrezzi: i due ritentativi di oggi e l'errore onesto, mai due «continuazioni» identiche in più (erano 5 richieste)
  const r2 = rete(vuotaNascosta, vuotaNascosta, vuotaNascosta, vuotaNascosta, vuotaNascosta, risposta('mai'));
  const errore = await rifiuta(lavora(r2).esito);
  assert.equal(errore.code, 'PROVIDER_EMPTY_RESPONSE');
  assert.equal(r2.corpi.length, 3, 'la domanda, due ritentativi');
  assert.match(errore.message, /3 times in a row/u);
});

test('VSR-14 (giro 3, a): lo stato nativo del fornitore NON entra nel prefill (nessun filo lo riceverebbe); solo stato ⇒ la scala di oggi', async () => {
  /* Il filo chat toglie `talos_provider_state` (`stripNativeMetadata`, runtime-owner-adapter) e i fili nativi tolgono il prefill intero
     (VSR-19, Hermes `agent/turn_request_assembly.py:178-187`): lo stato nel prefill non arrivava a nessuno (R02 del revisore 3, R8 del 2). */
  const STATO = { version: 1, provider: 'openai', model: 'x', content: [{ type: 'reasoning', text: 'R', providerOptions: { openai: { reasoningEncryptedContent: 'CIFRATO' } } }] };
  const vuotaNativa = () => flussoIntero([{ choices: [{ delta: { reasoning_content: 'R' } }] }, { choices: [{ delta: { talos_provider_state: STATO } }] }, fine, uso(100, 7)]);
  const r = rete(vuotaNativa, risposta('ok'));
  const e = await lavora(r).esito;
  assert.equal(e.detto, 'ok');
  assert.deepEqual(r.corpi[1].messages.at(-1), { role: 'assistant', content: '', reasoning_content: 'R' }, 'il prefill porta il testo, mai lo stato');
  // solo stato, senza testo del ragionamento: niente che un filo riceva, quindi la scala di oggi (dopo gli attrezzi, la spinta)
  const soloStato = () => flussoIntero([{ choices: [{ delta: { talos_provider_state: STATO } }] }, fine, uso(100, 0)]);
  const r2 = rete(attrezzo(), soloStato, risposta('ok'));
  await lavora(r2).esito;
  assert.equal(conPrefill(r2.corpi[2]), false);
  assert.deepEqual(r2.corpi[2].messages.at(-1), { role: 'user', content: NOTA_RISPOSTA_VUOTA });
  // anche la seconda continuazione non eredita uno stato: il prefill precedente non ne ha
  assert.equal(Object.hasOwn(kernel.prefillDiContinuazione({ reasoning_content: 'B', talos_provider_state: STATO }, { role: 'assistant', content: '', reasoning_content: 'A', talos_provider_state: STATO }), 'talos_provider_state'), false);
});

test('VSR-15 (A): un fornitore che rifiuta l\'assistant in coda (400) ⇒ la stessa domanda senza, poi la scala di oggi; mai un errore nuovo', async () => {
  const rifiutoMistral = () => new Response(JSON.stringify({ object: 'error', message: 'Expected last role User or Tool (or Assistant with prefix True) for serving but got assistant', type: 'invalid_request_message_order', code: '3230' }), { status: 400, headers: { 'content-type': 'application/json' } });
  const r = rete(vuotaRagionata(), rifiutoMistral, risposta('Fatto.'));
  const e = await lavora(r).esito;
  assert.equal(e.detto, 'Fatto.');
  assert.equal(r.corpi.length, 3);
  assert.equal(conPrefill(r.corpi[1]), true);
  assert.deepEqual(r.corpi[2].messages, r.corpi[0].messages, 'la stessa domanda, senza il prefill');
  // rifiutato una volta, il giro non lo manda più: la vuota dopo prende la scala di oggi (dopo gli attrezzi: la spinta)
  const r2 = rete(attrezzo(), vuotaRagionata(), rifiutoMistral, vuotaRagionata(), risposta('Fatto.'));
  const e2 = await lavora(r2).esito;
  assert.equal(e2.detto, 'Fatto.');
  assert.equal(r2.corpi.length, 5);
  assert.equal(conPrefill(r2.corpi[4]), false);
  assert.deepEqual(r2.corpi[4].messages.at(-1), { role: 'user', content: NOTA_RISPOSTA_VUOTA });
});

test('VSR-16 (A): le note di TALOS in coda (Piano) stanno PRIMA del prefill; piegate restano davanti, l\'assistant resta ultimo', async () => {
  const r = rete(vuotaRagionata('R'), risposta('Piano pronto.'));
  await lavora(r, { modalitaOperativa: 'piano' }).esito;
  const seconda = r.corpi[1].messages;
  assert.equal(conPrefill(r.corpi[1]), true);
  assert.equal(seconda.at(-2).role, 'system');
  assert.match(String(seconda.at(-2).content), /Plan mode is on/u);
  const piegata = piegaNoteInCoda(seconda);
  assert.equal(piegata.at(-1).role, 'assistant', 'la piega dei fornitori in cloud non mette un user dopo il prefill');
  assert.equal(piegata.at(-2).role, 'user');
});

test('VSR-17 (F): vuota col ragionamento SENZA attrezzi fino all\'errore finale: 2 continuazioni, 2 ritentativi, errore onesto', async () => {
  const r = rete(vuotaRagionata(), vuotaRagionata(), vuotaRagionata(), vuotaRagionata(), vuotaRagionata(), risposta('mai'));
  const errore = await rifiuta(lavora(r).esito);
  assert.equal(r.corpi.length, 5);
  assert.deepEqual(r.corpi.map(conPrefill), [false, true, true, false, false]);
  assert.deepEqual(r.corpi[3].messages, r.corpi[0].messages, 'i ritentativi rifanno la domanda di partenza: niente impalcatura');
  assert.deepEqual(r.corpi[4].messages, r.corpi[0].messages);
  assert.equal(errore.code, 'PROVIDER_EMPTY_RESPONSE');
  assert.match(errore.message, /5 times in a row/u);
  assert.equal(errore.messaggiDelGiro.some(impalcatura), false);
});

test('VSR-18 (F): le continuazioni non fanno scattare la firma deterministica: con zero token in uscita, un ritentativo vero prima', async () => {
  const vuotaZero = () => flussoIntero([ragionamento('R'), fine, uso(100, 0)]);
  const r = rete(vuotaZero, vuotaZero, vuotaZero, vuotaZero, vuotaZero, risposta('mai'));
  const errore = await rifiuta(lavora(r).esito);
  assert.equal(r.corpi.length, 4, '2 continuazioni, poi un ritentativo, poi la firma uguale due volte: fine');
  assert.match(errore.message, /4 times in a row/u);
});

test('VSR-19 (A): sui fili nativi (Anthropic, Responses, Gemini) l\'assistant di solo ragionamento in coda non parte (Hermes `turn_request_assembly.py:179-187`)', async () => {
  const json = (b) => new Response(JSON.stringify(b), { headers: { 'content-type': 'application/json' } });
  const base = [{ role: 'system', content: 'Aiuta la persona.' }, { role: 'user', content: 'Quanto fa 173 × 219?' }];
  const prefill = (provider, model, parte) => ({ role: 'assistant', content: '', reasoning_content: 'R', talos_provider_state: { version: 1, provider, model, content: [parte] } });
  const rispostaAnthropic = { id: 'msg_t', type: 'message', role: 'assistant', model: 'claude-sonnet-5', content: [{ type: 'text', text: '37887' }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 17, output_tokens: 5 } };
  let filo;
  await nativeProviderResponse({ provider: 'anthropic', model: 'claude-sonnet-5', apiKey: 'test-only-key',
    body: { messages: [...base, prefill('anthropic', 'claude-sonnet-5', { type: 'reasoning', text: 'R', providerOptions: { anthropic: { signature: 'SIG' } } })] },
    fetchFn: async (_u, init) => { filo = JSON.parse(init.body); return json(rispostaAnthropic); } });
  assert.equal(filo.messages.at(-1).role, 'user', 'Anthropic rifiuta un blocco di ragionamento in coda');
  await nativeProviderResponse({ provider: 'openai', model: 'gpt-5.4-mini', apiKey: 'test-only-key',
    body: { messages: [...base, prefill('openai', 'gpt-5.4-mini', { type: 'reasoning', text: '', providerOptions: { openai: { itemId: 'rs_t', reasoningEncryptedContent: 'CIFRATO' } } })] },
    fetchFn: async (_u, init) => { filo = JSON.parse(init.body); return json({ id: 'resp_t', created_at: 1700000000, model: 'gpt-5.4-mini', status: 'completed', output: [{ type: 'message', id: 'msg_t', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: '37887', annotations: [] }] }], usage: { input_tokens: 30, output_tokens: 9, total_tokens: 39 }, error: null, incomplete_details: null }); } });
  assert.notEqual(filo.input.at(-1).type, 'reasoning', 'Responses rifiuta un ragionamento senza l\'elemento che lo segue');
  assert.equal(filo.input.at(-1).role, 'user');
  await nativeProviderResponse({ provider: 'gemini', model: 'gemini-3.8-flash', apiKey: 'test-only-key',
    body: { messages: [...base, { role: 'assistant', content: '', reasoning_content: 'R' }] },
    fetchFn: async (_u, init) => { filo = JSON.parse(init.body); return json({ candidates: [{ content: { role: 'model', parts: [{ text: '37887' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 7, totalTokenCount: 27 }, modelVersion: 'gemini-3.8-flash' }); } });
  assert.equal(filo.contents.at(-1).role, 'user');
  // AL CONTRARIO: un assistant con testo in coda (il prefill vero di Anthropic) non si tocca
  await nativeProviderResponse({ provider: 'anthropic', model: 'claude-sonnet-5', apiKey: 'test-only-key',
    body: { messages: [...base, { role: 'assistant', content: 'Il risultato è' }] },
    fetchFn: async (_u, init) => { filo = JSON.parse(init.body); return json(rispostaAnthropic); } });
  assert.equal(filo.messages.at(-1).role, 'assistant');
});

test('VSR-20: un giro fallito non lascia in coda il segnaposto della spinta', () => {
  const storia = storiaDelGiroFallito([
    { role: 'user', content: 'correggi' },
    { role: 'assistant', content: SEGNAPOSTO_RISPOSTA_VUOTA, reasoning_content: 'r' },
    { role: 'user', content: NOTA_RISPOSTA_VUOTA },
  ], 'stop');
  assert.deepEqual(storia, [{ role: 'user', content: 'correggi' }]);
});

/* ---- Giro 3 della cura 324 (decisione 330): il punto 6 della risposta del giudice delle 23:43 ------------------------------------ */

const json400 = (stato = 400) => () => new Response(JSON.stringify({ error: { message: 'Expected last role User or Tool', code: stato } }), { status: stato, headers: { 'content-type': 'application/json' } });

test('VSR-21 (giro 3, a): verso chi il prefill non arriva (fili nativi, Groq e Mistral senza il campo del ragionamento) nessuna continuazione: la scala di oggi', async () => {
  for (const modello of ['anthropic:claude-sonnet-5', 'openai:gpt-5.4-mini', 'chatgpt:gpt-5.5', 'gemini:gemini-3.8-flash', 'groq:openai/gpt-oss-20b', 'mistral:mistral-small-latest',
    // giro 7 (MEDIO del revisore 1): Ollama non prosegue il pensiero dell'assistant in coda (renderer e parser qwen35, glm47, deepseek3)
    'ollama:qwen3.5:9b', 'ollama-cloud:glm-4.7']) {
    const r = rete(attrezzo(), vuotaRagionata('R'), risposta('Fatto.'));
    const e = await lavora(r, { modello }).esito;
    assert.equal(e.detto, 'Fatto.', modello);
    assert.equal(r.corpi.length, 3, modello);
    assert.equal(conPrefill(r.corpi[2]), false, `${modello}: il filo toglierebbe il prefill, la continuazione sarebbe la stessa domanda`);
    assert.deepEqual(r.corpi[2].messages.at(-1), { role: 'user', content: NOTA_RISPOSTA_VUOTA }, `${modello}: la spinta di oggi`);
  }
});

test('VSR-22 (giro 3, a) AL CONTRARIO: chi prosegue l\'assistant in coda lo riceve (OpenRouter, Cerebras col suo campo, i motori di questo PC)', async () => {
  for (const modello of ['x', 'qwen/qwen3-coder:free', 'openrouter:z-ai/glm-5.3-flash', 'cerebras:gpt-oss-120b', 'local:qwen3-8b', 'lmstudio:qwen3-8b']) {
    const r = rete(attrezzo(), vuotaRagionata('R'), risposta('Fatto.'));
    const e = await lavora(r, { modello }).esito;
    assert.equal(e.detto, 'Fatto.', modello);
    assert.deepEqual(r.corpi[2].messages.at(-1), { role: 'assistant', content: '', reasoning_content: 'R' }, modello);
  }
  assert.equal(kernel.prefillDiContinuazione({ reasoning_content: 'R' }, null, { conTesto: false }), null, 'senza il testo e senza dettagli: niente da rimandare');
});

test('VSR-23 (giro 3, d, R05): il segnale della richiesta fermato mentre il fornitore rifiuta il prefill ⇒ esce il rifiuto vero, nessun ripiego', async () => {
  const fermo = new AbortController();
  const corpi = [];
  const fetch = async (_url, opzioni) => {
    corpi.push(JSON.parse(opzioni.body));
    if (corpi.length === 1) return vuotaRagionata('R')();
    fermo.abort();
    return json400()();
  };
  const contextHooks = { prepare: async ({ messages }) => ({ messages }), infer: async (_o, invia) => invia(fermo.signal) };
  const errore = await rifiuta(talosLavora({ cartella: cartellaDiProva('talos-vuota-ragionamento-'), task: { consegna: 'correggi il difetto' }, modello: 'x', chiave: 'y',
    permessi: 'bypass', fetchDiRete: fetch, onDelta: () => {}, onGiro: () => {}, contextHooks }));
  assert.equal(corpi.length, 2);
  assert.equal(conPrefill(corpi[1]), true);
  assert.equal(errore.stato, 400, `il 400 del fornitore, non un «fermato prima di chiamare» del ripiego: ${errore.message}`);
});

test('VSR-24 (giro 3, d, R06): solo 400 e 422 tolgono il prefill: un 404 o un 401 sulla richiesta col prefill escono com\'erano, senza ripiego', async () => {
  for (const stato of [404, 401]) {
    const r = rete(vuotaRagionata('R'), json400(stato), risposta('mai'));
    const errore = await rifiuta(lavora(r).esito);
    assert.equal(r.corpi.length, 2, `${stato}: nessuna richiesta senza il prefill`);
    assert.equal(conPrefill(r.corpi[1]), true);
    assert.equal(errore.stato, stato);
  }
});

test('VSR-25 (giro 3, R2): anche il 422 toglie il prefill, una volta, e la stessa domanda parte senza', async () => {
  const r = rete(vuotaRagionata('R'), json400(422), risposta('Fatto.'));
  const e = await lavora(r).esito;
  assert.equal(e.detto, 'Fatto.');
  assert.equal(r.corpi.length, 3);
  assert.equal(conPrefill(r.corpi[1]), true);
  assert.deepEqual(r.corpi[2].messages, r.corpi[0].messages);
});

test('VSR-26 (giro 3, e): l\'unione dei dettagli di OpenRouter (R08, R09 del revisore 3) e il testo del prefill precedente (R13)', () => {
  const { aggiungiDettagliDelRagionamento, prefillDiContinuazione } = kernel;
  const cifrato = (data) => ({ type: 'reasoning.encrypted', data, id: 'rs_1', format: 'openai-responses-v1', index: 0 });
  assert.deepEqual(aggiungiDettagliDelRagionamento([cifrato('A')], [cifrato('B')]), [cifrato('A'), cifrato('B')], 'R08: i cifrati non si uniscono mai');
  const firmato = (text, signature) => ({ type: 'reasoning.text', text, signature, format: 'anthropic-claude-v1', index: 0 });
  assert.deepEqual(aggiungiDettagliDelRagionamento([firmato('a', 'S1')], [firmato('b', 'S2')]), [firmato('a', 'S1'), firmato('b', 'S2')], 'R09: firme diverse, blocchi diversi');
  assert.deepEqual(aggiungiDettagliDelRagionamento([firmato('a', 'S1')], [{ type: 'reasoning.text', text: 'b', format: 'anthropic-claude-v1', index: 0 }]), [firmato('ab', 'S1')], 'al contrario: senza firma nuova si unisce');
  const soloDettagli = { reasoning_details: [cifrato('C')] };
  assert.deepEqual(prefillDiContinuazione(soloDettagli, { role: 'assistant', content: '', reasoning_content: 'AB', reasoning_details: [cifrato('A')] }, { conDettagli: true }),
    { role: 'assistant', content: '', reasoning_content: 'AB', reasoning_details: [cifrato('A'), cifrato('C')] }, 'R13: la seconda continuazione tiene il testo della prima anche se la nuova porta solo dettagli');
});

test('VSR-27 (giro 3, e): nel flusso, i dettagli di un messaggio intero restano (R10) e su una ripetizione tagliata si buttano (R11)', async () => {
  const { consumaFlussoSSE, DETTAGLI_DEL_RAGIONAMENTO } = kernel;
  const cifrato = { type: 'reasoning.encrypted', data: 'gAAAAABpCIFRATO', id: 'rs_0a1', format: 'openai-responses-v1', index: 0 };
  const intero = await consumaFlussoSSE(flussoIntero([{ choices: [{ index: 0, message: { role: 'assistant', content: '', reasoning_details: [cifrato] }, finish_reason: 'stop' }] }]), () => {});
  assert.deepEqual(intero.scelta[DETTAGLI_DEL_RAGIONAMENTO], [cifrato], 'R10: il messaggio intero porta i suoi dettagli');
  const stessa = (i) => ({ choices: [{ delta: { tool_calls: [{ index: i, id: `c${i}`, type: 'function', function: { name: 'leggi', arguments: '{"percorso":"a.txt"}' } }] } }] });
  const tagliata = await consumaFlussoSSE(flussoIntero([{ choices: [{ delta: { reasoning_details: [cifrato] } }] }, stessa(0), stessa(1), stessa(2), stessa(3), fineAttrezzi]), () => {});
  assert.ok(tagliata.ripetizione, 'premessa: la ripetizione è stata tagliata');
  assert.equal(tagliata.scelta[DETTAGLI_DEL_RAGIONAMENTO], undefined, 'R11: dettagli di una risposta tagliata non tornano mai');
});

test('VSR-28 (giro 3, M16): un flusso di soli `reasoning_details` è vivo per la guardia del silenzio', async () => {
  const { consumaFlussoSSE } = kernel;
  const cifrato = (i) => ({ type: 'reasoning.encrypted', data: `D${i}`, id: `rs_${i}`, format: 'openai-responses-v1', index: i });
  const lento = new Response(new ReadableStream({
    async start(c) {
      c.enqueue(enc.encode(`data: ${JSON.stringify(ragionamento('Comincio'))}\n\n`));
      for (let i = 0; i < 8; i++) {
        await new Promise((ok) => setTimeout(ok, 60));
        c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { reasoning_details: [cifrato(i)] } }] })}\n\n`));
      }
      c.enqueue(enc.encode(`data: ${JSON.stringify(fine)}\n\ndata: [DONE]\n\n`));
      c.close();
    },
  }));
  // 8 pezzi a 60 ms (~480 ms) contro una guardia di 300 ms: viva solo se i dettagli contano come dati
  const esito = await consumaFlussoSSE(lento, () => {}, { inattivitaDatiMs: 300 });
  assert.equal(esito.scelta.reasoning_content, 'Comincio');
});

test('VSR-29 (giro 3, R7): `reasoning_tokens: 0` (OpenAI e OpenRouter lo mandano sempre) non è ragionamento', async () => {
  assert.equal(kernel.portaRagionamento({ content: '' }, { completion_tokens_details: { reasoning_tokens: 0 } }), false);
  assert.equal(kernel.portaRagionamento({ content: '' }, { completion_tokens_details: { reasoning_tokens: 3 } }), true);
  // lungo il filo: senza `completion_tokens` la firma deterministica si regge sul «niente ragionamento visto»
  const mutaConZero = () => flussoIntero([{ choices: [{ index: 0, delta: { content: '' }, finish_reason: 'stop' }] },
    { choices: [], usage: { prompt_tokens: 100, completion_tokens_details: { reasoning_tokens: 0 } } }]);
  const r = rete(mutaConZero, mutaConZero, mutaConZero, risposta('mai'));
  const errore = await rifiuta(lavora(r).esito);
  assert.equal(r.corpi.length, 2, 'due vuote mute uguali: deterministico, nessun secondo ritentativo');
  assert.equal(errore.code, 'PROVIDER_EMPTY_RESPONSE');
});

test('VSR-30 (giro 3, R07 del revisore 3): sui fili nativi un assistant in coda CON attrezzi non si toglie', async () => {
  const { senzaPrefillDiSoloRagionamento } = await import('../src/native-provider-adapter.mjs');
  const conAttrezzi = [{ role: 'user', content: 'u' }, { role: 'assistant', content: '', reasoning_content: 'R', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'leggi', arguments: '{}' } }] }];
  assert.equal(senzaPrefillDiSoloRagionamento(conAttrezzi), conAttrezzi);
  const prefill = [{ role: 'user', content: 'u' }, { role: 'assistant', content: '', reasoning_content: 'R' }];
  assert.deepEqual(senzaPrefillDiSoloRagionamento(prefill), [{ role: 'user', content: 'u' }], 'al contrario: il prefill di solo ragionamento si toglie');
});

test('VSR-31 (giro 3, c): DeepSeek diretto non prosegue l\u2019assistant in coda ⇒ nessuna continuazione, la scala di oggi', async () => {
  const r = rete(attrezzo(), vuotaRagionata('R'), risposta('Fatto.'));
  const e = await lavora(r, { modello: 'deepseek:deepseek-flash' }).esito;
  assert.equal(e.detto, 'Fatto.');
  assert.equal(conPrefill(r.corpi[2]), false);
  assert.deepEqual(r.corpi[2].messages.at(-1), { role: 'user', content: NOTA_RISPOSTA_VUOTA });
  const { prefillInCodaArriva } = await import('../src/openai-compatible-runtime.mjs');
  assert.equal(prefillInCodaArriva('deepseek:deepseek-flash'), null);
  assert.deepEqual(prefillInCodaArriva('openrouter:z-ai/glm-5.3-flash'), { testo: true }, 'al contrario: OpenRouter lo riceve');
  assert.deepEqual(prefillInCodaArriva('groq:openai/gpt-oss-20b'), { testo: false }, 'Groq riceve l assistant ma non il testo');
});

test('VSR-33 (giro 4, M1 del revisore 1): dopo una continuazione, una vuota coi SOLI reasoning_tokens non rimanda la stessa richiesta', async () => {
  const nascosta = () => flussoIntero([{ choices: [{ index: 0, delta: { content: '' }, finish_reason: 'stop' }] }, uso(100, 40, { completion_tokens_details: { reasoning_tokens: 40 } })]);
  const r = rete(vuotaRagionata('A'), nascosta, risposta('Fatto.'), risposta('Fatto.'), risposta('Fatto.'));
  const e = await lavora(r, { attesaRitentaMassimaMs: 1 }).esito;
  assert.equal(e.detto, 'Fatto.');
  assert.equal(r.corpi.length, 3, 'giro 5 (L4 del revisore 2): esattamente la continuazione e UN gradino della scala');
  assert.equal(conPrefill(r.corpi[1]), true, 'la prima vuota col ragionamento scritto si continua');
  assert.notEqual(JSON.stringify(r.corpi[2]), JSON.stringify(r.corpi[1]),
    'la seconda vuota non ha ragionamento nuovo da rimandare: rimandare lo stesso prefill sarebbe la stessa richiesta, pagata di nuovo');
  assert.deepEqual(r.corpi[2].messages, r.corpi[0].messages, 'il gradino è il ritentativo della scala: la domanda di prima, senza prefill');
});

test('VSR-34 (giro 4, X4 del revisore 3): un 429 o un 500 sulla richiesta col prefill non lo tolgono: ogni richiesta dopo la prima lo porta', async (t) => {
  /* zero ritentativi del trasporto (come bc79-2): l'errore arriva subito al ripiego del prefill, senza le attese vere da 500 ms in su */
  const primaRitenti = process.env.TALOS_MAX_RETRIES; process.env.TALOS_MAX_RETRIES = '0';
  t.after(() => { if (primaRitenti === undefined) delete process.env.TALOS_MAX_RETRIES; else process.env.TALOS_MAX_RETRIES = primaRitenti; });
  for (const stato of [408, 429, 500, 503]) { // giro 5 (L3 del revisore 2): 408 e 503 sono ritentabili quanto 429 e 500 (`siRitenta`)
    const corpi = [];
    const fetch = async (_url, opzioni) => {
      corpi.push(JSON.parse(opzioni.body));
      if (corpi.length === 1) return vuotaRagionata('R')();
      if (corpi.length > 12) throw new Error('troppe richieste');
      return json400(stato)();
    };
    const errore = await rifiuta(lavora({ corpi, fetch }, { attesaRitentaMassimaMs: 1 }).esito);
    assert.ok(corpi.length >= 2, `${stato}: almeno la richiesta col prefill`);
    for (const [i, corpo] of corpi.slice(1).entries()) assert.equal(conPrefill(corpo), true, `${stato}: la richiesta ${i + 2} ha perso il prefill (ripiego solo su 400 e 422)`);
    assert.equal(errore.stato, stato);
  }
});

/* Giro 5 della cura 324: i tre MEDI del giro 4. Forme delle sonde dei revisori 1 e 2 (rev4-1-sonde S1-S3, sonda-rev4-2 S1 e S7),
   eventi copiati dalla forma del file (flusso SSE con `delta.reasoning`) e l'errore di trasporto dal sorgente (`provider-retry.mjs`). */
const nascostaG5 = () => flussoIntero([{ choices: [{ index: 0, delta: { content: '' }, finish_reason: 'stop' }] }, uso(100, 40, { completion_tokens_details: { reasoning_tokens: 40 } })]);
function flussoRotto(fotogrammi, errore) {
  let p = 0;
  return new Response(new ReadableStream({ pull(c) { if (p < fotogrammi.length) { c.enqueue(enc.encode(`data: ${JSON.stringify(fotogrammi[p])}\n\n`)); p += 1; return; } c.error(errore); } }));
}
const traffico = () => Object.assign(new Error('Troppo traffico presso il fornitore.'), { code: 'PROVIDER_REQUEST_ERROR', classe: 'traffico', transitorio: true });

test('VSR-35 (giro 5, M1 del revisore 1): dopo un gradino della scala il prefill riparte da capo: B nato senza A non si incolla ad A', async () => {
  const r = rete(vuotaRagionata('A'), nascostaG5, vuotaRagionata('B'), risposta('Fatto.'));
  const e = await lavora(r, { attesaRitentaMassimaMs: 1 }).esito;
  assert.equal(e.detto, 'Fatto.');
  assert.equal(r.corpi[1].messages.at(-1).reasoning_content, 'A');
  assert.equal(conPrefill(r.corpi[2]), false, 'il ritentativo della scala parte senza prefill');
  assert.equal(conPrefill(r.corpi[3]), true, 'B si continua');
  assert.equal(r.corpi[3].messages.at(-1).reasoning_content, 'B', 'B è nato da una richiesta SENZA A davanti');
});

test('VSR-36 (giro 5, M1 del revisore 1, S2): dopo gli attrezzi, A, la spinta, poi B: il prefill dopo la nota porta solo B', async () => {
  const r = rete(attrezzo(), vuotaRagionata('A'), nascostaG5, vuotaRagionata('B'), risposta('Fatto.'));
  const e = await lavora(r, { attesaRitentaMassimaMs: 1 }).esito;
  assert.equal(e.detto, 'Fatto.');
  const i = r.corpi.findIndex((c) => portaLaNota(c, NOTA_RISPOSTA_VUOTA) && conPrefill(c));
  assert.ok(i > 0, 'una continuazione dopo la spinta');
  assert.equal(r.corpi[i].messages.at(-1).reasoning_content, 'B', 'A era il ragionamento di prima della nota');
});

test('VSR-37 (giro 5, M2 del revisore 1 e L2 del revisore 2): un ragionamento di soli spazi non è ragionamento da rimandare', async () => {
  // dopo la continuazione A, una vuota col solo «\n»: niente seconda continuazione «A\n» (la stessa richiesta, pagata di nuovo)
  const r = rete(vuotaRagionata('A'), vuotaRagionata('\n'), risposta('Fatto.'), risposta('Fatto.'));
  const e = await lavora(r, { attesaRitentaMassimaMs: 1 }).esito;
  assert.equal(e.detto, 'Fatto.');
  assert.equal(r.corpi.length, 3);
  assert.equal(conPrefill(r.corpi[2]), false, 'il solo a capo non è ragionamento nuovo: la scala');
  assert.deepEqual(r.corpi[2].messages, r.corpi[0].messages);
  // alla prima vuota: «  » (il `<think>\n\n</think>` di Qwen3 senza pensiero) non apre una continuazione
  const r2 = rete(vuotaRagionata('  '), risposta('Fatto.'), risposta('Fatto.'));
  assert.equal((await lavora(r2, { attesaRitentaMassimaMs: 1 }).esito).detto, 'Fatto.');
  assert.equal(conPrefill(r2.corpi[1]), false, 'soli spazi alla prima vuota: la scala, mai una continuazione che il filo toglierebbe (RIG-14B)');
  // al contrario: un ragionamento vero con spazi attorno si continua, intero
  const r3 = rete(vuotaRagionata(' A \n'), risposta('Fatto.'));
  assert.equal((await lavora(r3, { attesaRitentaMassimaMs: 1 }).esito).detto, 'Fatto.');
  assert.equal(r3.corpi[1].messages.at(-1).reasoning_content, ' A \n');
});

test('VSR-38 (giro 5, M1 del revisore 2): i reinvii del giro (flusso rotto senza testo, nessuna prima risposta) portano ancora il prefill', async () => {
  const r = rete(vuotaRagionata('A'), () => flussoRotto([ragionamento('B')], traffico()), risposta('Fatto.'));
  assert.equal((await lavora(r, { attesaRitentaMassimaMs: 1 }).esito).detto, 'Fatto.');
  assert.equal(conPrefill(r.corpi[1]), true);
  assert.equal(conPrefill(r.corpi[2]), true, 'flusso rotto: il reinvio sicuro è la richiesta col prefill, non quella tornata vuota');
  assert.deepEqual(r.corpi[2].messages, r.corpi[1].messages);

  const { erroreEsitoProviderIncerto } = await import('../src/provider-retry.mjs');
  const corpi = [];
  const fetch = async (_url, opzioni) => {
    corpi.push(JSON.parse(opzioni.body));
    if (corpi.length === 1) return vuotaRagionata('A')();
    if (corpi.length === 2) throw erroreEsitoProviderIncerto({ classe: 'timeout-fornitore', transitorio: true, causaDiTrasporto: 'PROVIDER_FIRST_RESPONSE_TIMEOUT' });
    return risposta('Fatto.')();
  };
  assert.equal((await lavora({ corpi, fetch }, { attesaRitentaMassimaMs: 1 }).esito).detto, 'Fatto.');
  assert.equal(conPrefill(corpi[2]), true, 'nessuna prima risposta: il reinvio porta il prefill');

  // al contrario: rifiutato il prefill (400), il reinvio dopo un flusso rotto resta senza (la scala di oggi per il resto del giro)
  const r4 = rete(vuotaRagionata('A'), json400(400), () => flussoRotto([ragionamento('B')], traffico()), risposta('Fatto.'), risposta('Fatto.'));
  assert.equal((await lavora(r4, { attesaRitentaMassimaMs: 1 }).esito).detto, 'Fatto.');
  assert.equal(conPrefill(r4.corpi[1]), true);
  assert.equal(conPrefill(r4.corpi[2]), false, 'il ripiego del 400');
  assert.equal(conPrefill(r4.corpi[3]), false, 'dopo il rifiuto il reinvio non lo rimette');

  // al contrario, l'altro reinvio (mutante C4 del giro 5): dopo il 400 anche «nessuna prima risposta» si rimanda senza prefill
  const corpi4 = [];
  const fetch4 = async (_url, opzioni) => {
    corpi4.push(JSON.parse(opzioni.body));
    if (corpi4.length === 1) return vuotaRagionata('A')();
    if (corpi4.length === 2) return json400(400)();
    if (corpi4.length === 3) throw erroreEsitoProviderIncerto({ classe: 'timeout-fornitore', transitorio: true, causaDiTrasporto: 'PROVIDER_FIRST_RESPONSE_TIMEOUT' });
    return risposta('Fatto.')();
  };
  assert.equal((await lavora({ corpi: corpi4, fetch: fetch4 }, { attesaRitentaMassimaMs: 1 }).esito).detto, 'Fatto.');
  assert.equal(conPrefill(corpi4[1]), true);
  assert.equal(conPrefill(corpi4[2]), false, 'il ripiego del 400');
  assert.equal(conPrefill(corpi4[3]), false, 'dopo il rifiuto nemmeno il reinvio senza prima risposta lo rimette');
});

/* Giro 6 (i tre revisori del giro 5, stessa radice): il prefill ricordato è quello DAVVERO partito con l'ultima richiesta. I gradini che non
   passano dalla scala (passo del tetto, 402, ripresa dopo il silenzio, compattazione) mandano la richiesta senza prefill: il prossimo prefill
   non incolla il ragionamento vecchio, e i reinvii del giro rimandano la stessa richiesta, col prefill o senza, com'era partita. */
const tagliataDalTetto = (r) => () => flussoIntero([ragionamento(r), { choices: [{ index: 0, delta: {}, finish_reason: 'length' }] }, uso(100, 16384)]);
const rifiuto402 = () => () => new Response(JSON.stringify({ error: { code: 402, message: 'This request requires more credits, or fewer max_tokens.' } }), { status: 402, headers: { 'content-type': 'application/json' } });
const prefillDi = (corpo) => (conPrefill(corpo) ? corpo.messages.at(-1).reasoning_content : null);
const senzaPrimaRisposta = async () => {
  const { erroreEsitoProviderIncerto } = await import('../src/provider-retry.mjs');
  return erroreEsitoProviderIncerto({ classe: 'timeout-fornitore', transitorio: true, causaDiTrasporto: 'PROVIDER_FIRST_RESPONSE_TIMEOUT' });
};

test('VSR-39 (giro 6, S1): continuazione A, poi il passo del tetto (senza prefill), poi vuota C: il prefill è C, mai AC', async () => {
  const r = rete(vuotaRagionata('A'), tagliataDalTetto('B'), vuotaRagionata('C'), risposta('Fatto.'));
  assert.equal((await lavora(r, { attesaRitentaMassimaMs: 1 }).esito).detto, 'Fatto.');
  assert.deepEqual(r.corpi.map(prefillDi), [null, 'A', null, 'C'], 'C è nato da una richiesta senza A davanti');
  assert.ok((r.corpi[2].max_tokens ?? 0) > (r.corpi[1].max_tokens ?? 0), 'la richiesta 3 è davvero il passo del tetto');
});

test('VSR-40 (giro 6, S2): la richiesta del passo del tetto (senza prefill) si rompe senza testo: il reinvio è la STESSA richiesta', async () => {
  const r = rete(vuotaRagionata('A'), tagliataDalTetto('B'), () => flussoRotto([ragionamento('x')], traffico()), risposta('Fatto.'));
  assert.equal((await lavora(r, { attesaRitentaMassimaMs: 1 }).esito).detto, 'Fatto.');
  assert.deepEqual(r.corpi.map(prefillDi), [null, 'A', null, null]);
  assert.deepEqual(r.corpi[3].messages, r.corpi[2].messages, 'il reinvio non aggiunge il prefill A');

  // l'altro reinvio del giro (nessuna prima risposta) dopo il passo del tetto
  const errore = await senzaPrimaRisposta();
  const corpi = [];
  const fetch = async (_url, opzioni) => {
    corpi.push(JSON.parse(opzioni.body));
    if (corpi.length === 1) return vuotaRagionata('A')();
    if (corpi.length === 2) return tagliataDalTetto('B')();
    if (corpi.length === 3) throw errore;
    return risposta('Fatto.')();
  };
  assert.equal((await lavora({ corpi, fetch }, { attesaRitentaMassimaMs: 1 }).esito).detto, 'Fatto.');
  assert.deepEqual(corpi.map(prefillDi), [null, 'A', null, null]);
  assert.deepEqual(corpi[3].messages, corpi[2].messages);
});

test('VSR-41 (giro 6): un 402 sulla continuazione dopo il tetto alzato torna al tetto di prima SENZA prefill: la vuota dopo si continua da sola', async () => {
  // il tetto di prima si conosce solo con la riserva del motore del contesto (come TU-07 in tetto-uscita.test.mjs)
  const conRiserva = { prepare: async ({ messages }) => ({ messages, measurement: { responseReserve: 32_000 } }) };
  const tagliataAl = (r) => () => flussoIntero([ragionamento(r), { choices: [{ index: 0, delta: {}, finish_reason: 'length' }] }, uso(1000, 32_000)]);
  // la vuota B si mangia il tetto ⇒ il tetto sale (64.000, senza prefill); C si continua col tetto alzato, e quella richiesta torna 402
  const r = rete(tagliataAl('B'), vuotaRagionata('C'), rifiuto402(), vuotaRagionata('D'), risposta('Fatto.'));
  assert.equal((await lavora(r, { attesaRitentaMassimaMs: 1, contextHooks: conRiserva, finestraToken: 400_000 }).esito).detto, 'Fatto.');
  assert.deepEqual(r.corpi.map((c) => c.max_tokens), [32_000, 64_000, 64_000, 32_000, 32_000]);
  assert.deepEqual(r.corpi.map(prefillDi), [null, null, 'C', null, 'D'], 'D nato dalla richiesta del 402, partita senza prefill: mai CD');
});

test('VSR-44 (giro 6): continuazione A, poi una chiamata tagliata dal tetto con errore (GLM): il passo del tetto parte senza prefill, e la vuota dopo si continua da sola', async () => {
  const conRiserva = { prepare: async ({ messages }) => ({ messages, measurement: { responseReserve: 32_000 } }) };
  // la forma di `chiamataTagliataGlm` in tetto-uscita.test.mjs: la chiamata a metà, l'errore del fornitore, i token al tetto
  const erroreGlm = { error: { code: 502, message: 'Provider returned error' }, choices: [{ index: 0, delta: {}, finish_reason: 'error' }] };
  const chiamataTagliataGlm = () => () => flussoIntero([ragionamento('penso'), { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'scrivi', arguments: '{"percorso":"a.txt","contenuto":"aaa' } }] } }] }, erroreGlm, uso(1000, 32_000)]);
  const r = rete(vuotaRagionata('A'), chiamataTagliataGlm(), vuotaRagionata('C'), risposta('Fatto.'));
  assert.equal((await lavora(r, { attesaRitentaMassimaMs: 1, contextHooks: conRiserva, finestraToken: 400_000 }).esito).detto, 'Fatto.');
  assert.deepEqual(r.corpi.map((c) => c.max_tokens), [32_000, 32_000, 64_000, 64_000], 'la richiesta 3 è il passo del tetto sulla chiamata tagliata');
  assert.deepEqual(r.corpi.map(prefillDi), [null, 'A', null, 'C'], 'C nato da una richiesta senza A: mai AC');
});

test('VSR-45 (giro 6): continuazione A, poi una chiamata con gli argomenti tagliati dal tetto (fine «length»): il passo del tetto parte senza prefill, mai AC', async () => {
  const conRiserva = { prepare: async ({ messages }) => ({ messages, measurement: { responseReserve: 32_000 } }) };
  const chiamataTagliata = () => () => flussoIntero([ragionamento('penso'), { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'scrivi', arguments: '{"percorso":"a.txt","contenuto":"aaa' } }] } }] }, { choices: [{ index: 0, delta: {}, finish_reason: 'length' }] }, uso(1000, 32_000)]);
  const r = rete(vuotaRagionata('A'), chiamataTagliata(), vuotaRagionata('C'), risposta('Fatto.'));
  assert.equal((await lavora(r, { attesaRitentaMassimaMs: 1, contextHooks: conRiserva, finestraToken: 400_000 }).esito).detto, 'Fatto.');
  assert.deepEqual(r.corpi.map((c) => c.max_tokens), [32_000, 32_000, 64_000, 64_000], 'la richiesta 3 è il passo del tetto sulla chiamata tagliata');
  assert.deepEqual(r.corpi.map(prefillDi), [null, 'A', null, 'C'], 'C nato da una richiesta senza A: mai AC');
});

test('VSR-42 (giro 6, S3): continuazione A, testo poi silenzio (nota «continua»), poi nessuna prima risposta: il reinvio non porta A', async () => {
  const precedente = process.env.TALOS_STREAM_IDLE_MS;
  process.env.TALOS_STREAM_IDLE_MS = '300';
  try {
    const errore = await senzaPrimaRisposta();
    const datiPoiSoloCommenti = (fotogrammi) => {
      let timer = null;
      return new Response(new ReadableStream({
        start(c) { for (const f of fotogrammi) c.enqueue(enc.encode(`data: ${JSON.stringify(f)}\n\n`)); timer = setInterval(() => c.enqueue(enc.encode(': OPENROUTER PROCESSING\n\n')), 40); },
        cancel() { clearInterval(timer); },
      }));
    };
    const corpi = [];
    const fetch = async (_url, opzioni) => {
      corpi.push(JSON.parse(opzioni.body));
      if (corpi.length === 1) return vuotaRagionata('A')();
      if (corpi.length === 2) return datiPoiSoloCommenti([testo('Parte della risposta')]);
      if (corpi.length === 3) throw errore;
      if (corpi.length === 4) return vuotaRagionata('D')();
      return risposta(' fine.')();
    };
    await lavora({ corpi, fetch }, { attesaRitentaMassimaMs: 1 }).esito;
    assert.deepEqual(corpi.slice(0, 5).map(prefillDi), [null, 'A', null, null, 'D'], 'dopo il silenzio niente A, e D si continua da solo');
    assert.deepEqual(corpi[3].messages, corpi[2].messages, 'il reinvio è la stessa richiesta (la nota «continua» per ultima)');
  } finally {
    if (precedente === undefined) delete process.env.TALOS_STREAM_IDLE_MS; else process.env.TALOS_STREAM_IDLE_MS = precedente;
  }
});

test('VSR-43 (giro 6, come Hermes `_reset_retry_state_after_compaction`): dopo la compattazione del ciclo di base niente prefill vecchio, e le continuazioni ripartono', async () => {
  const { GIRI_PRIMA_DI_COMPATTARE: g } = kernel;
  const lungo = 'Il difetto sta nel file a.txt e va corretto con cura. '.repeat(200); // sopra TOKEN_MINIMI_PER_COMPATTARE
  const attrezzi = Array.from({ length: g - 2 }, (_, i) => attrezzo(`call_${i}`));
  // il riassunto passa da `chiamaConRitenta` senza flusso: una risposta JSON intera
  const riassunto = (t) => () => new Response(JSON.stringify({ choices: [{ index: 0, message: { role: 'assistant', content: t }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }), { status: 200, headers: { 'content-type': 'application/json' } });
  // giri 0..g-3 attrezzi, poi vuota A (continua), vuota B (seconda continuazione, prefill AB), al giro g il riassunto, poi vuota C
  const r = rete(...attrezzi, vuotaRagionata('A'), vuotaRagionata('B'), riassunto('Riassunto del lavoro fatto.'), vuotaRagionata('C'), risposta('Fatto.'));
  const e = await talosLavora({ cartella: cartellaDiProva('talos-vuota-compatta-'), task: { consegna: `correggi il difetto. ${lungo}` }, modello: 'x', chiave: 'y',
    permessi: 'bypass', fetchDiRete: r.fetch, onDelta: () => {}, onGiro: () => {}, attesaRitentaMassimaMs: 1 });
  assert.equal(e.detto, 'Fatto.');
  assert.equal(prefillDi(r.corpi[g - 1]), 'A', 'la prima continuazione; la seconda (AB) è pronta quando arriva il giro del riassunto');
  assert.equal(conPrefill(r.corpi[g]), false, 'il riassunto non porta il prefill');
  assert.ok(r.corpi[g + 1].messages.some((m) => m.role === 'user' && String(m.content).startsWith('[conversation compacted')), 'dopo il riassunto');
  assert.equal(prefillDi(r.corpi[g + 1]), null, 'la prima richiesta dopo il riassunto parte senza il prefill di prima');
  assert.equal(prefillDi(r.corpi[g + 2]), 'C', 'le continuazioni ripartono da zero, e C non si incolla ad AB');
  assert.equal(r.corpi.length, g + 3);
});

/* Giro 7 (i revisori del giro 6). */
test('VSR-46 (giro 7, BASSO del revisore 1): senza flusso il ragionamento arriva in `reasoning` (Ollama, Cerebras, OpenRouter): la continuazione lo prende', () => {
  assert.deepEqual(kernel.prefillDiContinuazione({ role: 'assistant', content: '', reasoning: 'X' }), { role: 'assistant', content: '', reasoning_content: 'X' });
  assert.deepEqual(kernel.prefillDiContinuazione({ reasoning: 'X' }, { role: 'assistant', content: '', reasoning_content: 'A' }), { role: 'assistant', content: '', reasoning_content: 'AX' }, 'si prosegue il precedente');
  // al contrario: reasoning_content, quando c'è, vince; un `reasoning` che non è testo non conta
  assert.equal(kernel.prefillDiContinuazione({ reasoning_content: 'Y', reasoning: 'X' }).reasoning_content, 'Y');
  assert.equal(kernel.prefillDiContinuazione({ reasoning_content: '', reasoning: 'X' })?.reasoning_content, 'X', 'un reasoning_content vuoto non nasconde `reasoning`');
  assert.equal(kernel.prefillDiContinuazione({ reasoning: { testo: 'X' } }), null);
  assert.equal(kernel.prefillDiContinuazione({ reasoning: 'X' }, null, { conTesto: false }), null, 'senza il testo sul filo: niente da rimandare');
});

/* Q1 e Q2 del revisore 2 del giro 6: `prepare` del motore del contesto lancia prima dell'invio (nessuna prima risposta). */
const preparaCheLanciaAl = (n, errore) => { let volte = 0; return { prepare: async ({ messages }) => { volte += 1; if (volte === n) throw errore; return { messages }; }, infer: async (_o, invia) => invia() }; };

test('VSR-47 (giro 7, Q1 del revisore 2): la continuazione A non parte perché `prepare` lancia: il reinvio porta A', async () => {
  const r = rete(vuotaRagionata('A'), risposta('Fatto.'));
  assert.equal((await lavora(r, { attesaRitentaMassimaMs: 1, contextHooks: preparaCheLanciaAl(2, await senzaPrimaRisposta()) }).esito).detto, 'Fatto.');
  assert.deepEqual(r.corpi.map(prefillDi), [null, 'A'], 'la continuazione non va persa');
});

test('VSR-48 (giro 7, Q2 del revisore 2): continuazione A, passo del tetto (senza prefill), `prepare` lancia: il reinvio non porta A', async () => {
  const r = rete(vuotaRagionata('A'), tagliataDalTetto('B'), risposta('Fatto.'));
  assert.equal((await lavora(r, { attesaRitentaMassimaMs: 1, contextHooks: preparaCheLanciaAl(3, await senzaPrimaRisposta()) }).esito).detto, 'Fatto.');
  assert.deepEqual(r.corpi.map(prefillDi), [null, 'A', null], 'il passo del tetto parte senza il prefill A');
  assert.ok((r.corpi[2].max_tokens ?? 0) > (r.corpi[1].max_tokens ?? 0), 'la richiesta 3 è davvero il passo del tetto');
});

/* Gemelle di VSR-43 (BASSO del revisore 3 del giro 6): dopo il riassunto riuscito ripartono ritentativi e firme, la spinta resta una per giro;
   col riassunto fallito il prefill pronto parte con la richiesta dopo. */
const compitoLungo = `correggi il difetto. ${'Il difetto sta nel file a.txt e va corretto con cura. '.repeat(200)}`;
const riassuntoJson = (t) => () => new Response(JSON.stringify({ choices: [{ index: 0, message: { role: 'assistant', content: t }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }), { status: 200, headers: { 'content-type': 'application/json' } });
/** Vuota senza ragionamento ma con token in uscita: due di fila non sono «deterministiche», la scala ritenta. */
const vuotaConUscita = () => () => flussoIntero([{ choices: [{ index: 0, delta: { content: '' }, finish_reason: 'stop' }] }, uso(100, 5)]);
const lavoraLungo = (r) => talosLavora({ cartella: cartellaDiProva('talos-vuota-compatta-'), task: { consegna: compitoLungo }, modello: 'x', chiave: 'y',
  permessi: 'bypass', fetchDiRete: r.fetch, onDelta: () => {}, onGiro: () => {}, attesaRitentaMassimaMs: 1 });
const conLaSpinta = (corpo) => corpo.messages.at(-1)?.role === 'user' && corpo.messages.at(-1).content === NOTA_RISPOSTA_VUOTA;
const compattato = (corpo) => corpo.messages.some((m) => m.role === 'user' && String(m.content).startsWith('[conversation compacted'));

test('VSR-49 (giro 7, gemella di VSR-43): spinta e ritentativo prima del riassunto; dopo, i ritentativi ripartono da zero e la spinta resta una', async () => {
  const { GIRI_PRIMA_DI_COMPATTARE: g, RITENTATIVI_RISPOSTA_VUOTA_MASSIMI: massimi } = kernel;
  assert.equal(massimi, 2);
  const attrezzi = Array.from({ length: g - 2 }, (_, i) => attrezzo(`call_${i}`));
  // giro g-2 vuota ⇒ spinta; g-1 vuota muta ⇒ ritenta (1); g riassunto; poi muta e con uscita: due ritentativi interi, poi la risposta
  const r = rete(...attrezzi, vuotaConUscita(), vuotaMuta, riassuntoJson('Riassunto del lavoro fatto.'), vuotaMuta, vuotaConUscita(), risposta('Fatto.'));
  const e = await lavoraLungo(r);
  assert.equal(e.detto, 'Fatto.', 'dopo il riassunto la scala ha di nuovo due ritentativi, e la firma muta di prima non conta');
  assert.equal(r.corpi.length, g + 4);
  assert.equal(conLaSpinta(r.corpi[g - 1]), true, 'la spinta prima del riassunto');
  assert.ok(compattato(r.corpi[g + 1]) && compattato(r.corpi[g + 3]), 'dopo il riassunto');
  assert.equal(r.corpi.filter(conLaSpinta).length, 1, 'una spinta sola');

  // la spinta resta una per giro anche dopo il riassunto: un giro di attrezzi dopo, poi una vuota ⇒ ritenta, mai una seconda spinta
  const r2 = rete(...attrezzi, vuotaConUscita(), attrezzo('call_x'), riassuntoJson('Riassunto del lavoro fatto.'), attrezzo('call_y'), vuotaConUscita(), risposta('Fatto.'));
  const e2 = await lavoraLungo(r2);
  assert.equal(e2.detto, 'Fatto.');
  assert.equal(r2.corpi.length, g + 4);
  assert.ok(compattato(r2.corpi[g + 2]), 'dopo il riassunto');
  assert.equal(r2.corpi.filter(conLaSpinta).length, 1, 'la spinta del giro è già stata fatta prima del riassunto');
  assert.deepEqual(r2.corpi[g + 3].messages, r2.corpi[g + 2].messages, 'dopo il riassunto la vuota si ritenta uguale');
});

test('VSR-50 (giro 7, variante di VSR-43): il riassunto FALLISCE subito dopo una continuazione: la richiesta dopo porta ancora il prefill', async () => {
  const { GIRI_PRIMA_DI_COMPATTARE: g } = kernel;
  const attrezzi = Array.from({ length: g - 2 }, (_, i) => attrezzo(`call_${i}`));
  const r = rete(...attrezzi, vuotaRagionata('A'), vuotaRagionata('B'), riassuntoJson(''), risposta('Fatto.'));
  const e = await lavoraLungo(r);
  assert.equal(e.detto, 'Fatto.');
  assert.equal(r.corpi.length, g + 2);
  assert.equal(conPrefill(r.corpi[g]), false, 'il riassunto (vuoto: fallito) non porta il prefill');
  assert.equal(compattato(r.corpi[g + 1]), false, 'la storia è invariata');
  assert.equal(prefillDi(r.corpi[g + 1]), 'AB', 'la seconda continuazione parte, col prefill pronto prima del riassunto');
});

/* Giro 8 (MEDIO del revisore dei fornitori del giro 7): dopo un cambio di fornitore la richiesta va alla RISERVA per il resto del giro
   (`runtime-owner-adapter.mjs`, `destinazione = effettivo ?? …`, e l'esito porta `fornitoreEffettivo` e `modelloEffettivo`). Il filo
   del prefill si decide dal fornitore che riceve, come Hermes (`agent/message_sanitization.py:718`, `route_reasoning_carriers(provider,
   base_url)`): verso Groq la continuazione sarebbe la stessa domanda subito (decisione 330), quindi parte la scala. */
const CIFRATO_OR = { type: 'reasoning.encrypted', data: 'gAAAAABpCIFRATO', id: 'rs_0a1', format: 'openai-responses-v1', index: 0 };
/** Vuota di OpenRouter: il testo del ragionamento e i suoi dettagli cifrati (forma di VSR-12). */
const vuotaOR = () => flussoIntero([ragionamento('Devo ancora scrivere'), { choices: [{ delta: { reasoning_details: [CIFRATO_OR] } }] }, fine, uso(100, 7)]);
async function conRiserva(modelloSessione, servito, risposte) {
  const corpi = [];
  const fili = [];
  const fonte = servito.split(':')[0];
  const remoto = servito.slice(fonte.length + 1);
  const fetchDiRete = async (_u, o) => {
    const corpo = JSON.parse(o.body);
    corpi.push(corpo);
    fili.push({ at: Date.now(), messaggi: JSON.stringify(preparaRichiestaCompatibile(fonte, { ...corpo, model: remoto }).corpo.messages) });
    return risposte[corpi.length - 1]();
  };
  /* come `fetchMultiProvider.eseguiConFallback` dopo il cambio: la chiamata va a `servito`, e l'esito lo dice (`runtime-owner-adapter.mjs:2377`) */
  fetchDiRete.eseguiConFallback = async (chiama) => ({ ...(await chiama({ modello: servito })), fornitoreEffettivo: fonte, modelloEffettivo: remoto });
  const esito = await talosLavora({ cartella: cartellaDiProva('talos-vuota-riserva-'), task: { consegna: 'correggi il difetto' }, modello: modelloSessione, chiave: 'y',
    permessi: 'bypass', fetchDiRete, onDelta: () => {}, onGiro: () => {} });
  return { corpi, fili, esito };
}

test('VSR-51 (giro 8): sessione su OpenRouter servita da Groq (riserva): niente continuazione, cioè niente stessa domanda subito; parte la scala', async () => {
  const { corpi, fili, esito } = await conRiserva('z-ai/glm-4.7', 'groq:openai/gpt-oss-120b', [vuotaOR, risposta('fatto')]);
  assert.equal(esito.detto, 'fatto');
  assert.equal(corpi.length, 2);
  assert.equal(conPrefill(corpi[1]), false, 'verso Groq il prefill non arriverebbe (né il testo né i dettagli): nessuna continuazione');
  assert.equal(fili[1].messaggi, fili[0].messaggi, 'sul filo di Groq è la stessa domanda…');
  assert.ok(fili[1].at - fili[0].at >= 400, `…quindi parte dopo l'attesa della scala, mai subito (${fili[1].at - fili[0].at} ms)`);
});

test('VSR-52 (giro 8, al contrario): senza cambio OpenRouter riceve il prefill; una sessione su Groq servita da OpenRouter continua; senza `fornitoreEffettivo` vale il modello della sessione', async () => {
  const a = await conRiserva('z-ai/glm-4.7', 'openrouter:z-ai/glm-4.7', [vuotaOR, risposta('fatto')]);
  assert.equal(a.esito.detto, 'fatto');
  assert.equal(prefillDi(a.corpi[1]), 'Devo ancora scrivere', 'OpenRouter riceve ancora il suo prefill');
  assert.deepEqual(a.corpi[1].messages.at(-1).reasoning_details, [CIFRATO_OR], 'coi dettagli cifrati');
  assert.notEqual(a.fili[1].messaggi, a.fili[0].messaggi);
  const b = await conRiserva('groq:openai/gpt-oss-120b', 'openrouter:z-ai/glm-4.7', [vuotaOR, risposta('fatto')]);
  assert.equal(prefillDi(b.corpi[1]), 'Devo ancora scrivere', 'decide il fornitore che riceve, non quello della sessione');
  assert.deepEqual(b.corpi[1].messages.at(-1).reasoning_details, [CIFRATO_OR], 'anche per i dettagli: il filo è OpenRouter');
  // il modello della riserva conta quanto il fornitore: un id di Groq senza «/» non è un modello di OpenRouter, quello servito sì
  const c = await conRiserva('groq:llama-3.3-70b-versatile', 'openrouter:z-ai/glm-4.7', [vuotaOR, risposta('fatto')]);
  assert.deepEqual(c.corpi[1].messages.at(-1).reasoning_details, [CIFRATO_OR], 'i dettagli si decidono dal modello che ha risposto');
  // nessun `fornitoreEffettivo` nell'esito (un ospite senza riserva): il modello della sessione, come prima
  const r = rete(vuotaOR, risposta('fatto'));
  assert.equal((await lavora(r, { modello: 'groq:openai/gpt-oss-120b' }).esito).detto, 'fatto');
  assert.equal(conPrefill(r.corpi[1]), false, 'sessione su Groq: la scala');
  const r2 = rete(vuotaOR, risposta('fatto'));
  assert.equal((await lavora(r2, { modello: 'z-ai/glm-4.7' }).esito).detto, 'fatto');
  assert.equal(prefillDi(r2.corpi[1]), 'Devo ancora scrivere', 'sessione su OpenRouter: la continuazione');
});

/* Giro 8 (BASSO del revisore del filo del giro 7): un 400 di FINESTRA PIENA sulla continuazione non è il fornitore che rifiuta il prefill.
   Il prefill si toglie (la richiesta si accorcia, come Hermes dopo una compattazione, `agent/turn_context_compaction.py:58-64`) e l'errore
   passa al guscio, che compatta: le continuazioni restano accese per il resto del giro. */
const finestraPiena = () => new Response(JSON.stringify({ error: { message: "This model's maximum context length is 8192 tokens. However, you requested 9000 tokens (8000 in the messages, 1000 in the completion).", type: 'invalid_request_error', code: 'context_length_exceeded' } }), { status: 400, headers: { 'content-type': 'application/json' } });
const rifiutoDelPrefill = () => new Response(JSON.stringify({ object: 'error', message: 'Expected last role User or Tool (or Assistant with prefix True) for serving but got assistant', type: 'invalid_request_message_order', code: '3230' }), { status: 400, headers: { 'content-type': 'application/json' } });
/** Il guscio come `context-desktop-service.mjs` `infer`: un «contesto pieno» classificato si riprova una volta, il resto passa. */
const guscioCheRiprova = (classi) => ({ prepare: async ({ messages }) => ({ messages }), infer: async (_o, invia) => {
  try { return await invia(); } catch (e) { classi.push(classificaErroreFornitore(e)); if (classificaErroreFornitore(e) !== 'contesto-pieno') throw e; return invia(); }
} });

/* Giro 9 (MEDIO del revisore del filo del giro 8): la richiesta SENZA prefill era appena entrata, quindi la finestra piena l'ha causata
   il prefill. Il kernel riparte UNA volta senza (come Hermes riprova una volta dopo un rifiuto, `agent/turn_recovery.py:301-307`), e
   solo se anche quella è piena l'errore va al guscio, che compatta: mai un riassunto pagato per una storia che senza prefill entra. */
/* Giro 10 (MEDIO del revisore del filo del giro 9): la finestra piena col prefill in volo chiude le continuazioni dello STALLO, non del
   giro: la vuota B dopo la ripartenza va alla scala (qui il ritentativo con attesa), mai una seconda continuazione lunga uguale che
   tornerebbe fuori finestra con un'altra copia della stessa richiesta subito dopo. */
test('VSR-53 (giro 9 e 10): un 400 di finestra piena sulla continuazione riparte una volta senza prefill nel kernel e chiude le continuazioni dello stallo', async () => {
  const classi = [];
  const r = rete(vuotaRagionata('A'), finestraPiena, vuotaRagionata('B'), risposta('Fatto.'));
  const e = await lavora(r, { attesaRitentaMassimaMs: 1, contextHooks: guscioCheRiprova(classi) }).esito;
  assert.equal(e.detto, 'Fatto.');
  assert.deepEqual(classi, [], 'il kernel assorbe la finestra piena causata dal prefill: il guscio non la vede');
  assert.deepEqual(r.corpi.map(prefillDi), [null, 'A', null, null], 'la ripartenza senza A; la vuota B va alla scala, niente prefill B');
  assert.deepEqual(r.corpi[3].messages, r.corpi[0].messages, 'il ritentativo della scala: la stessa domanda dopo l\'attesa');
  assert.deepEqual(r.corpi[2].messages, r.corpi[0].messages, 'la stessa domanda, senza il prefill');
});

test('VSR-55 (giro 9, gemella di VSR-53): piena anche SENZA prefill, l\'errore arriva ancora al guscio; una sola ripartenza nel kernel', async () => {
  const classi = [];
  const r = rete(vuotaRagionata('A'), finestraPiena, finestraPiena, risposta('Fatto.'));
  const e = await lavora(r, { attesaRitentaMassimaMs: 1, contextHooks: guscioCheRiprova(classi) }).esito;
  assert.equal(e.detto, 'Fatto.');
  assert.deepEqual(classi, ['contesto-pieno'], 'il guscio vede la finestra piena della richiesta senza prefill');
  assert.deepEqual(r.corpi.map(prefillDi), [null, 'A', null, null], 'il kernel riparte una volta, poi il reinvio del guscio');
  // senza guscio: la seconda finestra piena non torna nel kernel (nessun giro senza fine)
  const r2 = rete(vuotaRagionata('A'), finestraPiena, finestraPiena, risposta('Fatto.'));
  const errore = await rifiuta(lavora(r2, { attesaRitentaMassimaMs: 1 }).esito);
  assert.equal(classificaErroreFornitore(errore), 'contesto-pieno');
  assert.equal(r2.corpi.length, 3);
});

/* Giro 9 (BASSO del revisore del filo del giro 8): un 413 è sempre una finestra piena per `classificaErroreFornitore`, quindi segue la
   strada di VSR-53 anche se non è un 400: prima si classifica, poi si guarda lo stato. */
const troppoGrande = () => new Response(JSON.stringify({ error: { message: 'Request too large' } }), { status: 413, headers: { 'content-type': 'application/json' } });
test('VSR-56 (giro 9 e 10): un 413 sulla continuazione riparte senza prefill come la finestra piena in 400, e chiude le continuazioni dello stallo', async () => {
  const classi = [];
  const r = rete(vuotaRagionata('A'), troppoGrande, risposta('Fatto.'));
  assert.equal((await lavora(r, { attesaRitentaMassimaMs: 1, contextHooks: guscioCheRiprova(classi) }).esito).detto, 'Fatto.');
  assert.deepEqual(r.corpi.map(prefillDi), [null, 'A', null], 'mai di nuovo P:A dopo il 413');
  assert.deepEqual(classi, []);
  const r2 = rete(vuotaRagionata('A'), troppoGrande, vuotaRagionata('B'), risposta('Fatto.'));
  assert.equal((await lavora(r2, { attesaRitentaMassimaMs: 1, contextHooks: guscioCheRiprova([]) }).esito).detto, 'Fatto.');
  assert.deepEqual(r2.corpi.map(prefillDi), [null, 'A', null, null], 'giro 10: dopo il 413 la vuota B dello stesso stallo va alla scala');
  // il 413 non è un rifiuto del prefill: dopo una risposta che porta qualcosa (un giro di attrezzi), lo stallo nuovo si continua
  const r4 = rete(vuotaRagionata('A'), troppoGrande, attrezzo('call_413'), vuotaRagionata('B'), risposta('Fatto.'));
  assert.equal((await lavora(r4, { attesaRitentaMassimaMs: 1, contextHooks: guscioCheRiprova([]) }).esito).detto, 'Fatto.');
  assert.deepEqual(r4.corpi.map(prefillDi), [null, 'A', null, null, 'B'], 'lo stallo dopo gli attrezzi riceve di nuovo la continuazione');
  // al contrario: un 401 sulla continuazione non è né finestra piena né rifiuto del prefill: passa com'è, nessuna ripartenza nel kernel
  const classi3 = [];
  const negato = () => new Response(JSON.stringify({ error: { message: 'invalid api key' } }), { status: 401, headers: { 'content-type': 'application/json' } });
  const r3 = rete(vuotaRagionata('A'), negato, negato, negato);
  const e3 = await rifiuta(lavora(r3, { attesaRitentaMassimaMs: 1, contextHooks: guscioCheRiprova(classi3) }).esito);
  assert.ok(e3 instanceof Error);
  assert.deepEqual(r3.corpi.map(prefillDi), [null, 'A'], 'nessuna ripartenza senza prefill per un 401');
  assert.deepEqual(classi3, [null]);
});

/* Giro 9 (BASSO del revisore dei fornitori del giro 8): il rifiuto del prefill vale per il FILO che l'ha rifiutato, non per tutto il giro.
   Hermes lo ricorda per (fornitore, host, modello): `agent/message_sanitization.py:649` («dropped for that (provider, host, model)
   only») e `:986` `record_reasoning_field_rejection`. Sessione Z.AI che rifiuta, poi un 429 e il cambio verso OpenRouter (come
   `runtime-owner-adapter.mjs`: la riserva resta per il resto del giro, l'esito porta `fornitoreEffettivo` e `modelloEffettivo`). */
const vuotaORCon = (t) => () => flussoIntero([ragionamento(t), { choices: [{ delta: { reasoning_details: [CIFRATO_OR] } }] }, fine, uso(100, 7)]);
const rifiutoZai = () => new Response(JSON.stringify({ error: { message: 'Invalid messages: last message must be user or tool', type: 'invalid_request_error' } }), { status: 400, headers: { 'content-type': 'application/json' } });
const limite = () => new Response(JSON.stringify({ error: { message: 'rate limited' } }), { status: 429, headers: { 'content-type': 'application/json' } });
/* Giro 10: come `runtime-owner-adapter.mjs`, l'errore lanciato porta chi lo ha dato (`fornitoreEffettivo`, `modelloEffettivo`);
   `erroreColFilo: false` è un adattatore che non lo porta (il kernel ripiega su `filoDelPrefill`). Giro 11: `ritorno` è la catena vera
   che dopo un 429 della riserva torna al fornitore di partenza (`runtime-owner-adapter.mjs`, il ciclo su `catena` salta solo quello attivo). */
async function conCambioDopo429(modelloSessione, riserva, risposte, { erroreColFilo = true, ritorno = false } = {}) {
  const corpi = [];
  const verso = [];
  let effettivo = null;
  const fetchDiRete = async () => { throw new Error('mai direttamente'); };
  fetchDiRete.eseguiConFallback = async (chiama, opzioni) => {
    const i = opzioni.modello.indexOf(':');
    // un id senza prefisso è un modello di OpenRouter (`model-destination.mjs`)
    const partenza = i > 0 ? { provider: opzioni.modello.slice(0, i), model: opzioni.modello.slice(i + 1) } : { provider: 'openrouter', model: opzioni.modello };
    let dest = effettivo ?? partenza;
    for (;;) {
      const d = dest;
      try {
        const r = await chiama({ modello: `${d.provider}:${d.model}`, tentativiMassimi: 1, fetchDiRete: async (_u, o) => {
          corpi.push(JSON.parse(o.body)); verso.push(d.provider);
          return risposte[corpi.length - 1]();
        } });
        return { ...r, fornitoreEffettivo: d.provider, modelloEffettivo: d.model };
      } catch (e) {
        if ((e?.stato === 429 || /429/u.test(String(e?.message))) && d.provider !== riserva.provider) { dest = riserva; effettivo = riserva; continue; }
        if (ritorno && (e?.stato === 429 || /429/u.test(String(e?.message))) && d.provider === riserva.provider) { dest = partenza; effettivo = partenza; continue; }
        if (erroreColFilo === 'soloFornitore' && e && typeof e === 'object') Object.assign(e, { fornitoreEffettivo: d.provider });
        else if (erroreColFilo === 'soloModello' && e && typeof e === 'object') Object.assign(e, { modelloEffettivo: d.model });
        else if (erroreColFilo && e && typeof e === 'object') Object.assign(e, { fornitoreEffettivo: d.provider, modelloEffettivo: d.model });
        throw e;
      }
    }
  };
  const esito = await talosLavora({ cartella: cartellaDiProva('talos-vuota-cambio-'), task: { consegna: 'correggi il difetto' }, modello: modelloSessione, chiave: 'y',
    permessi: 'bypass', fetchDiRete, onDelta: () => {}, onGiro: () => {}, attesaRitentaMassimaMs: 1 });
  return { corpi, verso, esito };
}
test('VSR-57 (giro 9): Z.AI rifiuta il prefill, poi 429 e cambio verso OpenRouter: la vuota di OpenRouter SI continua', async () => {
  const { corpi, verso, esito } = await conCambioDopo429('zai:glm-4.7', { provider: 'openrouter', model: 'z-ai/glm-4.7' },
    [vuotaRagionata('A'), rifiutoZai, limite, vuotaORCon('B'), risposta('fatto')]);
  assert.equal(esito.detto, 'fatto');
  assert.deepEqual(verso, ['zai', 'zai', 'zai', 'openrouter', 'openrouter']);
  assert.deepEqual(corpi.map(prefillDi), [null, 'A', null, null, 'B'], 'il rifiuto di Z.AI non spegne la continuazione verso OpenRouter');
  assert.deepEqual(corpi[4].messages.at(-1).reasoning_details, [CIFRATO_OR]);
  // al contrario: senza cambio, Z.AI che ha rifiutato non riceve più continuazioni nel giro (la scala, come VSR-54)
  const b = await conCambioDopo429('zai:glm-4.7', { provider: 'openrouter', model: 'z-ai/glm-4.7' },
    [vuotaRagionata('A'), rifiutoZai, vuotaRagionata('B'), risposta('fatto')]);
  assert.equal(b.esito.detto, 'fatto');
  assert.deepEqual(b.corpi.map(prefillDi), [null, 'A', null, null], 'lo stesso filo resta spento');
  // il filo è quello del fornitore che ha risposto, anche quando il nome della sessione è diverso (un id di OpenRouter senza prefisso):
  // OpenRouter rifiuta, la vuota dopo viene ancora da OpenRouter, quindi niente continuazione
  const c = await conCambioDopo429('z-ai/glm-4.7', { provider: 'zai', model: 'glm-4.7' }, [vuotaORCon('A'), rifiutoZai, vuotaORCon('B'), risposta('fatto')]);
  assert.equal(c.esito.detto, 'fatto');
  assert.deepEqual(c.verso, ['openrouter', 'openrouter', 'openrouter', 'openrouter']);
  assert.deepEqual(c.corpi.map(prefillDi), [null, 'A', null, null], 'il rifiuto si ricorda sul filo di OpenRouter, quello che risponde');
});

/* Giro 9: il MEDIO del revisore del filo con il GUSCIO VERO del desktop (`talosHarness.desktop-hotfix.mjs`, che compatta o rifiuta con
   REQUEST_TOO_LARGE) e un fornitore finto che dà «prompt is too long» solo quando la richiesta supera 0,9 × la finestra. La sonda è
   quella del revisore (giro8/rev-filo8/guscio-vero.test.mjs), fatta prova. */
const guscioVero = await import('../src/kernel/talosHarness.desktop-hotfix.mjs');
const { corpoSenzaMarcatori } = await import('./aiuto/corpo-senza-marcatori.mjs');
const RAGIONAMENTO_LUNGO = 'Devo pensare ancora a lungo sul difetto. '.repeat(300);
const storiaLunga = (coppie, lunghezza = 420) => Array.from({ length: coppie }, (_, i) => [
  { role: 'user', content: `Domanda ${i}: ${'parola '.repeat(lunghezza / 7)}` },
  { role: 'assistant', content: `Risposta ${i}: ${'parola '.repeat(lunghezza / 7)}` },
]).flat();
async function colGuscioVero(iniziali, { pienoAncheSenza = false, vuoteSenza = 1 } = {}) {
  const stima = kernel.stimaTokenConversazione;
  const conti = { riassunti: 0, corpi: [] };
  const eventi = [];
  let massimo = null;
  let piene = 0;
  let senza = 0;
  const fetchDiRete = async (_u, o) => {
    const corpo = corpoSenzaMarcatori(o.body);
    if (!corpo.tools?.length) { conti.riassunti += 1; return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: '## Riassunto\nIn breve.' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10 } }); }
    conti.corpi.push(corpo);
    const s = stima(corpo.messages);
    if (conti.corpi.length === 1) { massimo = Math.ceil((s + 400) / 0.9); return flussoIntero([ragionamento(RAGIONAMENTO_LUNGO), fine, { choices: [], usage: { prompt_tokens: s, completion_tokens: 900 } }]); }
    const conP = conPrefill(corpo);
    // la gemella: la richiesta è piena anche senza il prefill finché il guscio non compatta (due volte al massimo)
    const sp = s + (conP || (pienoAncheSenza && piene < 2) ? Math.ceil(RAGIONAMENTO_LUNGO.length / 4) : 0);
    if (sp > Math.floor(0.9 * massimo)) { piene += 1; return new Response(JSON.stringify({ error: { message: `prompt is too long: ${sp} tokens > ${massimo} maximum` } }), { status: 400, headers: { 'content-type': 'application/json' } }); }
    // giro 10: altre vuote col solo ragionamento (nuovo, lungo uguale) sulle richieste senza prefill, poi la risposta
    if (!conP && ++senza < vuoteSenza) return flussoIntero([ragionamento(`Pensiero ${senza}: ${RAGIONAMENTO_LUNGO}`), fine, { choices: [], usage: { prompt_tokens: s, completion_tokens: 900 } }]);
    return flussoIntero([testo('fatto'), fine, { choices: [], usage: { prompt_tokens: s, completion_tokens: 2 } }]);
  };
  let esito = null;
  let errore = null;
  try {
    esito = await guscioVero.talosLavora({ scartoMisurato: 0, cartella: cartellaDiProva('talos-vuota-guscio-vero-'), modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'x' },
      messaggiIniziali: iniziali, contestoDelProgetto: 'Project files:\n', fetchDiRete, permessi: 'Full access', onDelta: () => {}, attesaRitentaMassimaMs: 1,
      onGiro: (e) => { if (String(e?.tipo).startsWith('compattazione-') && e.tipo !== 'compattazione-progresso') eventi.push([e.tipo, e.compattato ?? null]); } });
  } catch (e) { errore = e; }
  return { esito, errore, eventi, riassunti: conti.riassunti, corpi: conti.corpi, prefill: conti.corpi.map((c) => (conPrefill(c) ? 'P' : 'no')) };
}
test('VSR-58 (giro 9, guscio vero): storia lunga, finestra piena solo col prefill: no | P | no, concluso, nessun riassunto', async () => {
  const g = await colGuscioVero([...storiaLunga(40), { role: 'user', content: 'Continua.' }]);
  assert.equal(g.errore, null, `${g.errore?.code} ${g.errore?.message}`);
  assert.deepEqual(g.prefill, ['no', 'P', 'no']);
  assert.equal(g.riassunti, 0, 'nessun riassunto pagato: senza prefill la storia entrava');
  assert.ok(!g.eventi.some((e) => e[1] === true), 'nessuna compattazione');
  assert.equal(g.esito.detto, 'fatto');
});
test('VSR-59 (giro 9, guscio vero): un solo messaggio grande sotto 0,9 × la finestra: concluso, mai REQUEST_TOO_LARGE', async () => {
  const g = await colGuscioVero([{ role: 'user', content: `Leggi questo documento e correggi: ${'testo del documento allegato. '.repeat(1500)}` }]);
  assert.equal(g.errore, null, `${g.errore?.code} ${g.errore?.message}`);
  assert.deepEqual(g.prefill, ['no', 'P', 'no']);
  assert.equal(g.riassunti, 0);
  assert.equal(g.esito.detto, 'fatto');
});
test('VSR-60 (giro 9, gemella col guscio vero): piena anche senza prefill, l\'errore arriva al guscio e la compattazione parte', async () => {
  const g = await colGuscioVero([...storiaLunga(40), { role: 'user', content: 'Continua.' }], { pienoAncheSenza: true });
  assert.equal(g.errore, null, `${g.errore?.code} ${g.errore?.message}`);
  assert.deepEqual(g.prefill.slice(0, 3), ['no', 'P', 'no'], 'una sola ripartenza senza prefill nel kernel');
  assert.ok(g.riassunti >= 1, 'il guscio compatta');
  assert.ok(g.eventi.some((e) => e[1] === true), 'una compattazione riuscita');
  assert.equal(g.esito.detto, 'fatto');
});

/* Giro 10 (MEDIO del revisore del filo del giro 9, sonda giro9/rev-filo9/stallo.test.mjs): col guscio VERO, dopo la ripartenza senza
   prefill la richiesta torna di nuovo vuota col solo ragionamento. Sul giro 9 partiva una seconda continuazione lunga uguale, di nuovo
   fuori finestra: R0 | P | R0 | P | R0, cioè due copie identiche della richiesta quasi piena mandate subito. Il kernel a245c03d1 (prima
   della ripartenza) faceva R0 | P | R0 | R0 con l'attesa della scala: mai più richieste di lui per lo stesso copione. */
const copieSubito = (g) => g.corpi.filter((c, i) => i > 0 && !conPrefill(c) && conPrefill(g.corpi[i - 1]) && JSON.stringify(c.messages) === JSON.stringify(g.corpi[0].messages)).length;
test('VSR-61 (giro 10, guscio vero, S2): la ripartenza torna vuota di nuovo ⇒ la scala, mai una seconda continuazione fuori finestra', async () => {
  const g = await colGuscioVero([...storiaLunga(40), { role: 'user', content: 'Continua.' }], { vuoteSenza: 2 });
  assert.equal(g.errore, null, `${g.errore?.code} ${g.errore?.message}`);
  assert.deepEqual(g.prefill, ['no', 'P', 'no', 'no'], 'un solo prefill nello stallo; dopo la ripartenza il ritentativo della scala');
  assert.equal(copieSubito(g), 1, 'una sola copia della stessa richiesta subito dopo la finestra piena');
  assert.deepEqual(g.corpi[3].messages, g.corpi[0].messages, 'il ritentativo è la stessa domanda, dopo l\'attesa');
  assert.ok(g.corpi.length <= 4, 'non più richieste del kernel a245c03d1 (R0 | P | R0 | R0)');
  assert.equal(g.riassunti, 0);
  assert.equal(g.esito.detto, 'fatto');
});
test('VSR-62 (giro 10, guscio vero, S5): cinque vuote di fila senza prefill ⇒ un prefill, poi la scala fino all\'errore onesto', async () => {
  const g = await colGuscioVero([...storiaLunga(40), { role: 'user', content: 'Continua.' }], { vuoteSenza: 5 });
  assert.equal(g.errore?.code, 'PROVIDER_EMPTY_RESPONSE', `${g.errore?.code} ${g.errore?.message}`);
  assert.deepEqual(g.prefill, ['no', 'P', 'no', 'no', 'no'], 'mai un secondo prefill nello stallo');
  assert.equal(copieSubito(g), 1);
  assert.ok(g.corpi.length <= 5, 'non più richieste del kernel a245c03d1 (R0 | P | R0 | R0 | R0)');
  assert.equal(g.riassunti, 0);
});
test('VSR-63 (giro 10): la finestra piena chiude le continuazioni dello stallo; la compattazione del ciclo di base le riapre', async () => {
  const { GIRI_PRIMA_DI_COMPATTARE: g } = kernel;
  const attrezzi = Array.from({ length: g - 2 }, (_, i) => attrezzo(`call_${i}`));
  // giro g-2 vuota A (continua), giro g-1 P:A fuori finestra ⇒ ripartenza senza, vuota B ⇒ la scala (dopo gli attrezzi: la spinta);
  // giro g il riassunto, poi vuota C: dopo la compattazione la continuazione torna
  const r = rete(...attrezzi, vuotaRagionata('A'), finestraPiena, vuotaRagionata('B'), riassuntoJson('Riassunto del lavoro fatto.'), vuotaRagionata('C'), risposta('Fatto.'));
  const e = await lavoraLungo(r);
  assert.equal(e.detto, 'Fatto.');
  assert.deepEqual(r.corpi.slice(g - 2).map(prefillDi), [null, 'A', null, null, null, 'C']);
  assert.ok(compattato(r.corpi[g + 2]), 'dopo il riassunto');
  assert.ok(compattato(r.corpi[g + 3]));
});
test('VSR-64 (giro 10, BASSO dei revisori del filo e dei fornitori): il rifiuto si segna sul filo che lo ha DATO (la riserva dopo un 429 nella stessa chiamata)', async () => {
  // SONDA-RP9-a: prefill nato per Z.AI, 429, la riserva OpenRouter lo rifiuta: OpenRouter non riceve un secondo prefill
  const a = await conCambioDopo429('zai:glm-4.7', { provider: 'openrouter', model: 'z-ai/glm-4.7' },
    [vuotaRagionata('A'), limite, rifiutoZai, vuotaORCon('B'), vuotaORCon('C'), risposta('fatto'), risposta('fatto')]);
  assert.equal(a.esito.detto, 'fatto');
  assert.deepEqual(a.verso, ['zai', 'zai', 'openrouter', 'openrouter', 'openrouter', 'openrouter']);
  assert.deepEqual(a.corpi.map(prefillDi), [null, 'A', 'A', null, null, null], 'un solo rifiuto di OpenRouter, poi la scala');
  assert.deepEqual(a.corpi[3].messages, a.corpi[0].messages, 'la ripartenza senza prefill');
  // cambio-in-volo del revisore del filo: sessione OpenRouter, 429, Z.AI rifiuta: un rifiuto per filo, nessun secondo P verso Z.AI
  const b = await conCambioDopo429('z-ai/glm-4.7', { provider: 'zai', model: 'glm-4.7' },
    [vuotaORCon('A'), limite, rifiutoZai, vuotaRagionata('B'), vuotaRagionata('C'), risposta('fatto'), risposta('fatto')]);
  assert.equal(b.esito.detto, 'fatto');
  assert.deepEqual(b.verso, ['openrouter', 'openrouter', 'zai', 'zai', 'zai', 'zai']);
  assert.equal(b.corpi.filter((c, i) => i > 2 && b.verso[i] === 'zai' && conPrefill(c)).length, 0, 'Z.AI ha rifiutato: niente altro prefill verso di lui');
  // al contrario: un adattatore che non porta il filo sull'errore ⇒ il ripiego su `filoDelPrefill` (il giro 9): OpenRouter riceve ancora un prefill
  const c = await conCambioDopo429('zai:glm-4.7', { provider: 'openrouter', model: 'z-ai/glm-4.7' },
    [vuotaRagionata('A'), limite, rifiutoZai, vuotaORCon('B'), rifiutoZai, vuotaORCon('C'), risposta('fatto'), risposta('fatto')], { erroreColFilo: false });
  assert.equal(c.esito.detto, 'fatto');
  assert.equal(c.corpi.map(prefillDi).filter((p, i) => p !== null && c.verso[i] === 'openrouter').length, 2, 'senza il campo il rifiuto va al filo per cui il prefill era nato');
  // e un errore a metà (il fornitore senza il modello) non fa una chiave «openrouter:undefined» che non spegne nessun filo: vale il ripiego.
  // Il secondo rifiuto di OpenRouter va a filoDelPrefill (openrouter:z-ai/glm-4.7): dopo un giro di attrezzi (stallo nuovo) niente prefill
  const e = await conCambioDopo429('zai:glm-4.7', { provider: 'openrouter', model: 'z-ai/glm-4.7' },
    [vuotaRagionata('A'), limite, rifiutoZai, vuotaORCon('B'), rifiutoZai, attrezzo('call_e'), vuotaORCon('C'), risposta('fatto'), risposta('fatto')], { erroreColFilo: 'soloFornitore' });
  assert.equal(e.esito.detto, 'fatto');
  assert.deepEqual(e.corpi.map(prefillDi).slice(0, 5), [null, 'A', 'A', null, 'B'], 'un filo a metà vale come nessun filo: il ripiego');
  assert.deepEqual(e.corpi.map(prefillDi).slice(6).filter((p) => p !== null), [], 'OpenRouter ha rifiutato: lo stallo dopo gli attrezzi va alla scala');
  // giro 11 (mutante K8 rimasto vivo): l'altra metà, il modello senza il fornitore, non fa «undefined:z-ai/glm-4.7»: vale il ripiego
  const f = await conCambioDopo429('zai:glm-4.7', { provider: 'openrouter', model: 'z-ai/glm-4.7' },
    [vuotaRagionata('A'), limite, rifiutoZai, vuotaORCon('B'), rifiutoZai, attrezzo('call_f'), vuotaORCon('C'), risposta('fatto'), risposta('fatto')], { erroreColFilo: 'soloModello' });
  assert.equal(f.esito.detto, 'fatto');
  assert.deepEqual(f.corpi.map(prefillDi).slice(0, 5), [null, 'A', 'A', null, 'B'], 'un filo a metà vale come nessun filo: il ripiego');
  assert.deepEqual(f.corpi.map(prefillDi).slice(6).filter((p) => p !== null), [], 'OpenRouter ha rifiutato: lo stallo dopo gli attrezzi va alla scala');
  // giro 11 (mutante K12 rimasto vivo): il rifiuto della riserva NON spegne il filo per cui il prefill era nato. Dopo un 429 anche della
  // riserva la catena torna a Z.AI, che non ha mai rifiutato: la sua vuota ragionata si continua
  const g = await conCambioDopo429('zai:glm-4.7', { provider: 'openrouter', model: 'z-ai/glm-4.7' },
    [vuotaRagionata('A'), limite, rifiutoZai, limite, vuotaRagionata('B'), risposta('fatto')], { ritorno: true });
  assert.equal(g.esito.detto, 'fatto');
  assert.deepEqual(g.verso, ['zai', 'zai', 'openrouter', 'openrouter', 'zai', 'zai']);
  assert.deepEqual(g.corpi.map(prefillDi), [null, 'A', 'A', null, null, 'B'], 'Z.AI non ha rifiutato: la sua vuota si continua');
});
test('VSR-65 (giro 10, BASSO del revisore delle prove; SONDA-RP9-c): il rifiuto vale per il resto del giro: due vuote ragionate di fila dopo, nessun prefill', async () => {
  const c = await conCambioDopo429('zai:glm-4.7', { provider: 'openrouter', model: 'z-ai/glm-4.7' },
    [vuotaRagionata('A'), rifiutoZai, vuotaRagionata('B'), vuotaRagionata('C'), risposta('fatto'), risposta('fatto')]);
  assert.equal(c.esito.detto, 'fatto');
  assert.deepEqual(c.verso, ['zai', 'zai', 'zai', 'zai', 'zai']);
  assert.deepEqual(c.corpi.map(prefillDi), [null, 'A', null, null, null], 'dopo il rifiuto di Z.AI, B e C vanno alla scala (due ritentativi)');
  // e dopo un giro di attrezzi (stallo nuovo) il filo resta spento
  const d = await conCambioDopo429('zai:glm-4.7', { provider: 'openrouter', model: 'z-ai/glm-4.7' },
    [vuotaRagionata('A'), rifiutoZai, attrezzo('call_r'), vuotaRagionata('B'), vuotaRagionata('C'), risposta('fatto'), risposta('fatto')]);
  assert.equal(d.esito.detto, 'fatto');
  assert.deepEqual(d.corpi.map(prefillDi).slice(2).filter((p) => p !== null), [], 'il filo che ha rifiutato non riceve più prefill nel giro');
  // giro 11 (BASSO del revisore delle prove, mutante K13): il rifiuto sopravvive alla compattazione del ciclo di base. Rifiuto di A, la vuota B va
  // alla scala (la spinta), al giro g il riassunto, poi la vuota C: verso il filo che ha rifiutato nessun prefill, il ritentativo della scala
  const { GIRI_PRIMA_DI_COMPATTARE: g } = kernel;
  const attrezzi = Array.from({ length: g - 2 }, (_, i) => attrezzo(`call_${i}`));
  const r = rete(...attrezzi, vuotaRagionata('A'), rifiutoDelPrefill, vuotaRagionata('B'), riassuntoJson('Riassunto del lavoro fatto.'), vuotaRagionata('C'), risposta('Fatto.'));
  const e = await lavoraLungo(r);
  assert.equal(e.detto, 'Fatto.');
  assert.deepEqual(r.corpi.slice(g - 2).map(prefillDi), [null, 'A', null, null, null, null], 'dopo il riassunto C non si continua: il filo ha rifiutato');
  assert.ok(compattato(r.corpi[g + 2]), 'C arriva dopo il riassunto');
  assert.ok(compattato(r.corpi[g + 3]));
});

/* Giro 11 (MEDIO del revisore del filo del giro 10, sonda giro10/rf10/compatta-guscio.test.mjs): col guscio VERO la compattazione avviene
   DENTRO infer, mai nel ciclo di base. Piena col prefill, piena anche la ripartenza senza: il guscio riassume, la storia è corta e il prefill
   entra. La vuota col solo ragionamento dopo il riassunto si continua (987c327d8: no|P|no|no|P, concluso in 5); la testa del giro 10 la
   mandava alla scala fino a PROVIDER_EMPTY_RESPONSE in 6. Come Hermes, che dopo una compattazione azzera `_thinking_prefill_retries`
   (`agent/turn_context_compaction.py:58-64`). */
test('VSR-66 (giro 11, guscio vero, gemella di VSR-63): piena anche senza prefill, il guscio compatta in infer, poi la vuota col solo ragionamento si continua', async () => {
  const stima = kernel.stimaTokenConversazione;
  const corpi = [];
  let riassunti = 0;
  let massimo = null;
  let compattatoDalGuscio = false;
  const fetchDiRete = async (_u, o) => {
    const corpo = corpoSenzaMarcatori(o.body);
    if (!corpo.tools?.length) { riassunti += 1; compattatoDalGuscio = true; return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: '## Riassunto\nIn breve.' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10 } }); }
    corpi.push(corpo);
    const s = stima(corpo.messages);
    if (corpi.length === 1) { massimo = Math.ceil((s + 400) / 0.9); return flussoIntero([ragionamento(RAGIONAMENTO_LUNGO), fine, { choices: [], usage: { prompt_tokens: s, completion_tokens: 900 } }]); }
    const p = conPrefill(corpo);
    // prima del riassunto anche la richiesta senza prefill è piena; dopo, la storia corta fa entrare il prefill
    const sp = s + (p || !compattatoDalGuscio ? Math.ceil(RAGIONAMENTO_LUNGO.length / 4) : 0);
    if (sp > Math.floor(0.9 * massimo)) return new Response(JSON.stringify({ error: { message: `prompt is too long: ${sp} tokens > ${massimo} maximum` } }), { status: 400, headers: { 'content-type': 'application/json' } });
    // il modello torna vuoto col solo ragionamento finché non riceve indietro il suo ragionamento (un prefill)
    if (!p) return flussoIntero([ragionamento(`Dopo il riassunto ${corpi.length}: ${'penso. '.repeat(40)}`), fine, { choices: [], usage: { prompt_tokens: s, completion_tokens: 300 } }]);
    return flussoIntero([testo('fatto'), fine, { choices: [], usage: { prompt_tokens: s, completion_tokens: 2 } }]);
  };
  let esito = null;
  let errore = null;
  try {
    esito = await guscioVero.talosLavora({ scartoMisurato: 0, cartella: cartellaDiProva('talos-vuota-guscio-compatta-'), modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'x' },
      messaggiIniziali: [...storiaLunga(40), { role: 'user', content: 'Continua.' }], contestoDelProgetto: 'Project files:\n', fetchDiRete, permessi: 'Full access', onDelta: () => {}, attesaRitentaMassimaMs: 1, onGiro: () => {} });
  } catch (e) { errore = e; }
  assert.equal(errore, null, `${errore?.code} ${errore?.message}`);
  assert.equal(esito.detto, 'fatto');
  assert.equal(riassunti, 1, 'il guscio compatta una volta');
  assert.deepEqual(corpi.map((c) => (conPrefill(c) ? 'P' : 'no')), ['no', 'P', 'no', 'no', 'P'], 'dopo il riassunto del guscio lo stallo nuovo continua');
  assert.ok(stima(corpi[4].messages) < stima(corpi[1].messages), 'il secondo prefill parte sulla storia compattata');
});

/* Giro 11, al contrario di VSR-66: lo stallo si riapre SOLO se anche la ripartenza senza prefill è piena (la compatta chi la riceve). Un 413
   col prefill, poi la ripartenza si rompe senza testo (un reinvio della stessa domanda, nessuna compattazione): la vuota C dello stesso stallo
   va ancora alla scala, mai un prefill C che tornerebbe fuori finestra. */
test('VSR-69 (giro 11, gemella di VSR-56): un 413 col prefill e poi un flusso rotto senza testo: lo stallo resta chiuso', async () => {
  const r = rete(vuotaRagionata('A'), troppoGrande, () => flussoRotto([ragionamento('B')], traffico()), vuotaRagionata('C'), risposta('Fatto.'));
  assert.equal((await lavora(r, { attesaRitentaMassimaMs: 1, contextHooks: guscioCheRiprova([]) }).esito).detto, 'Fatto.');
  assert.deepEqual(r.corpi.map(prefillDi), [null, 'A', null, null, null], 'il reinvio dopo il flusso rotto e la vuota C: niente prefill');
  assert.deepEqual(r.corpi[3].messages, r.corpi[2].messages, 'il reinvio sicuro è la stessa domanda senza prefill');
});

/* Giro 11 (MEDIO del revisore dei fornitori del giro 10, sonda giro10/rev-forn10/vero10.test.mjs V8): OpenRouter manda i guasti a monte DENTRO
   il flusso, dopo il 200, «This includes provider errors that arrive before any token» (docs «Errors and debugging»), con `error.code` 400.
   Col prefill in volo è il rifiuto dell'assistant in coda: come quello HTTP (VSR-15), la stessa domanda riparte senza e il filo si segna.
   Senza prefill in volo, o con testo già arrivato, o con un codice che non è 400/422, tutto resta come oggi (esito incerto). Come Hermes, che
   tiene lo stato del pacchetto d'errore nel flusso (`agent/chat_completion_helpers.py:144-157` `_status_code_from_payload`, `:338-361`) e
   lo legge come un 400 (`agent/turn_recovery.py:272`, `:301-307`). La forma del pacchetto è quella della sonda V8 e di `tetto-uscita.test.mjs:30`. */
const pacchettoDErrore = (codice, messaggio = 'Provider returned error: last message must be user or tool') => ({ id: 'gen-1', object: 'chat.completion.chunk', error: { code: codice, message: messaggio }, choices: [{ index: 0, delta: { content: '' }, finish_reason: 'error' }] });
const erroreNelFlusso = (codice) => () => flussoIntero([pacchettoDErrore(codice)]);
test('VSR-67 (giro 11, gemella di VSR-15 e VSR-64): un 400 o un 422 detto DENTRO il flusso sulla continuazione è il rifiuto del prefill', async () => {
  for (const codice of [400, 422, '400']) {
    const r = rete(vuotaRagionata('A'), erroreNelFlusso(codice), vuotaRagionata('B'), vuotaRagionata('C'), risposta('fatto'));
    const e = await lavora(r, { attesaRitentaMassimaMs: 1 }).esito;
    assert.equal(e.detto, 'fatto', `codice ${codice}`);
    assert.deepEqual(r.corpi.map(prefillDi), [null, 'A', null, null, null], `codice ${codice}: la stessa domanda senza A, poi il filo resta spento (B e C alla scala)`);
    assert.deepEqual(r.corpi[2].messages, r.corpi[0].messages);
  }
  // al contrario: senza prefill in volo il pacchetto d'errore esce com'era (esito incerto), una richiesta sola
  const senza = rete(erroreNelFlusso(400), risposta('fatto'));
  const e1 = await rifiuta(lavora(senza, { attesaRitentaMassimaMs: 1 }).esito);
  assert.equal(e1.code, 'PROVIDER_OUTCOME_UNKNOWN');
  assert.equal(senza.corpi.length, 1);
  // al contrario: un 502 nel flusso col prefill in volo è un guasto, non un rifiuto: esito incerto come oggi, nessun reinvio
  const guasto = rete(vuotaRagionata('A'), erroreNelFlusso(502), risposta('fatto'));
  const e2 = await rifiuta(lavora(guasto, { attesaRitentaMassimaMs: 1 }).esito);
  assert.equal(e2.code, 'PROVIDER_OUTCOME_UNKNOWN');
  assert.equal(guasto.corpi.length, 2);
  // al contrario: testo già arrivato prima del pacchetto d'errore: non si sa che cosa ha fatto il fornitore, esito incerto col parziale
  const aMeta = rete(vuotaRagionata('A'), () => flussoIntero([testo('Ecco'), pacchettoDErrore(400)]), risposta('fatto'));
  const e3 = await rifiuta(lavora(aMeta, { attesaRitentaMassimaMs: 1 }).esito);
  assert.equal(e3.code, 'PROVIDER_OUTCOME_UNKNOWN');
  assert.equal(e3.parziale?.content, 'Ecco');
  assert.equal(aMeta.corpi.length, 2);
});
const { creaFetchMultiProvider } = await import('../src/runtime-owner-adapter.mjs');
const { createProviderCredentialStore } = await import('../src/provider-credential-store.mjs');
/** Il kernel VERO con l'adattatore VERO (`creaFetchMultiProvider`, catena di riserva), la rete finta sotto: come la sonda V8 del revisore. */
async function conAdattatoreVero(sessione, catena, risposte, extra = {}) {
  const corpi = [];
  const verso = [];
  const fetchFinto = async (url, o) => {
    corpi.push(JSON.parse(o.body));
    verso.push(new URL(String(url)).pathname.split('/')[1]);
    // giro 11: una funzione risponde secondo il fornitore e il corpo (i ritentativi del 429 non hanno un numero fisso)
    return typeof risposte === 'function' ? risposte(verso.at(-1), corpi.at(-1)) : risposte[corpi.length - 1]();
  };
  const valori = new Map();
  const store = createProviderCredentialStore({ env: { ZAI_API_KEY: 'finta', OPENROUTER_API_KEY: 'finta' }, keyring: { get: (s, p) => valori.get(s + p) ?? null, set: (s, p, v) => valori.set(s + p, v), remove: (s, p) => valori.delete(s + p) } });
  for (const p of ['zai', 'openrouter']) store.setRuntime(p, { endpoint: `http://127.0.0.1:9/${p}` });
  const fetchDiRete = creaFetchMultiProvider(fetchFinto, { providerStore: store, dipendenze: { leggiChiave: (p) => store.getKey(p), leggiRuntime: (p) => store.getRuntime(p) }, fallbackProviders: catena, modelloSessione: sessione, onCambioFornitore: () => {}, onConsumoFornitore: () => {}, onAvviso: () => {} });
  const esito = await talosLavora({ cartella: cartellaDiProva('talos-vuota-adattatore-'), task: { consegna: 'correggi' }, modello: sessione, chiave: 'finta', permessi: 'bypass', fetchDiRete, onDelta: () => {}, onGiro: () => {}, attesaRitentaMassimaMs: 1, ...extra })
    .catch((e) => ({ errore: e }));
  return { corpi, verso, esito };
}
test('VSR-68 (giro 11, adattatore vero, sonda V8): OpenRouter rifiuta il prefill dentro il flusso: la stessa domanda senza, il filo segnato, mai un esito incerto', async () => {
  const vuotaConDettagli = (t) => () => flussoIntero([ragionamento(t), { choices: [{ delta: { reasoning_details: [CIFRATO_OR] } }] }, fine, uso(100, 7)]);
  const a = await conAdattatoreVero('openrouter:z-ai/glm-4.7', [{ provider: 'zai', model: 'glm-4.7' }],
    [vuotaConDettagli('A'), erroreNelFlusso(400), vuotaConDettagli('B'), vuotaConDettagli('C'), risposta('fatto'), risposta('fatto')]);
  assert.equal(a.esito.errore, undefined, `${a.esito.errore?.code} ${a.esito.errore?.message}`);
  assert.equal(a.esito.detto, 'fatto');
  assert.deepEqual(a.verso, ['openrouter', 'openrouter', 'openrouter', 'openrouter', 'openrouter']);
  assert.deepEqual(a.corpi.map(prefillDi), [null, 'A', null, null, null], 'un solo prefill: dopo il rifiuto nel flusso OpenRouter va alla scala');
  // al contrario, la sonda V8b: senza prefill in volo il pacchetto d'errore resta l'esito incerto di oggi
  const b = await conAdattatoreVero('openrouter:z-ai/glm-4.7', [{ provider: 'zai', model: 'glm-4.7' }], [erroreNelFlusso(400), risposta('fatto')]);
  assert.equal(b.esito.errore?.code, 'PROVIDER_OUTCOME_UNKNOWN');
  assert.equal(b.corpi.length, 1);
  // giro 11 (mutante A4 rimasto vivo): prefill nato per OpenRouter, 429, la riserva Z.AI lo rifiuta DENTRO il flusso. L'errore incerto
  // porta anche lui il filo che lo ha dato: il rifiuto va a Z.AI, che non riceve un secondo prefill
  // un Retry-After oltre l'attesa massima del giro: il kernel non ritenta, l'adattatore passa subito alla riserva
  const limiteLungo = () => new Response(JSON.stringify({ error: { message: 'rate limited' } }), { status: 429, headers: { 'content-type': 'application/json', 'retry-after': '120' } });
  let senzaPrefillZai = 0;
  const c = await conAdattatoreVero('openrouter:z-ai/glm-4.7', [{ provider: 'zai', model: 'glm-4.7' }], (fornitore, corpo) => {
    if (fornitore === 'openrouter') return prefillDi(corpo) ? limiteLungo() : vuotaConDettagli('A')();
    if (prefillDi(corpo) === 'A') return erroreNelFlusso(400)();
    if (prefillDi(corpo)) return risposta('fatto')();
    return (senzaPrefillZai++ === 0 ? vuotaRagionata('B') : risposta('fatto'))();
  });
  assert.equal(c.esito.errore, undefined, `${c.esito.errore?.code} ${c.esito.errore?.message}`);
  assert.equal(c.esito.detto, 'fatto');
  assert.deepEqual(c.verso.slice(0, 3), ['openrouter', 'openrouter', 'zai'], 'il 429 ha portato alla riserva');
  assert.deepEqual(c.corpi.filter((x, i) => c.verso[i] === 'zai' && prefillDi(x) !== null).map(prefillDi), ['A'], 'Z.AI ha rifiutato: niente prefill B verso di lui');
});

test('VSR-54 (giro 8, gemella di VSR-53): un 400 che rifiuta davvero il prefill lo spegne ancora per il resto del giro, sotto lo stesso guscio', async () => {
  const classi = [];
  const r = rete(vuotaRagionata('A'), rifiutoDelPrefill, vuotaRagionata('B'), risposta('Fatto.'));
  const e = await lavora(r, { attesaRitentaMassimaMs: 1, contextHooks: guscioCheRiprova(classi) }).esito;
  assert.equal(e.detto, 'Fatto.');
  assert.deepEqual(classi, [], 'il ripiego del kernel lo assorbe: il guscio non vede errori');
  assert.deepEqual(r.corpi.map(prefillDi), [null, 'A', null, null], 'la stessa domanda senza A, poi la scala di oggi per B');
  assert.deepEqual(r.corpi[2].messages, r.corpi[0].messages);
});

/* Cura 324, giro 12 (MEDIO del revisore delle prove, sonda SONDA-P11, confermato dai fornitori come V15): OpenRouter dice la finestra piena
   anche DENTRO il flusso, col pacchetto documentato («Errors and debugging»): error { code: 400, message «This endpoint's maximum context
   length is N tokens…», metadata.error_type: context_length_exceeded }. Al giro 11 era un esito incerto senza il messaggio e con
   `statoNelFlusso` 400, cioè un rifiuto del prefill: il filo restava spento per tutto il giro. Ora vale ESATTAMENTE come lo stesso corpo in
   HTTP: stesse richieste, stesso filo, stessa bandiera, stessi numeri per chi compatta. Hermes porta messaggio e corpo sull'errore del flusso
   (`agent/chat_completion_helpers.py:120-131`, `:144-157`) e legge `context_length_exceeded` e `max_tokens_exceeded` come overflow
   (`agent/error_classifier.py:689`). */
const MSG_OR = "This endpoint's maximum context length is 8192 tokens. However, you requested about 9000 tokens (8000 of text input, 1000 in the output). Please reduce the length of either one, or use the \"middle-out\" transform to compress your prompt automatically.";
const CORPO_PIENO_OR = { code: 400, message: MSG_OR, metadata: { error_type: 'context_length_exceeded', provider_code: 'context_length_exceeded' } };
const CORPO_MAXT_OR = { code: 400, message: 'Generation stopped early.', metadata: { error_type: 'max_tokens_exceeded' } };
const pienoHttpOR = (corpo = CORPO_PIENO_OR) => () => new Response(JSON.stringify({ error: corpo }), { status: 400, headers: { 'content-type': 'application/json' } });
const pacchettoOR = (corpo) => ({ id: 'gen-1', object: 'chat.completion.chunk', error: corpo, choices: [{ index: 0, delta: { content: '' }, finish_reason: 'error' }] });
const pienoNelFlussoOR = (corpo = CORPO_PIENO_OR, prima = []) => () => flussoIntero([...prima, pacchettoOR(corpo)]);
/** La sequenza della sonda: vuota A, la continuazione A riceve l'errore, la ripartenza dà un attrezzo, poi lo stallo NUOVO con la vuota B. */
const dueStalli = (pieno) => rete(vuotaRagionata('A'), pieno, attrezzo('call_x'), vuotaRagionata('B'), risposta('fatto'), risposta('fatto'), risposta('fatto'));
/* Giro 13 (MEDIO del revisore delle prove del giro 12): ogni variante nel flusso si confronta col SUO gemello HTTP, lo stesso corpo in un
   400, non con la base di `context_length_exceeded`. `max_tokens_exceeded` è il tetto d'USCITA (OpenRouter, «Errors and debugging»:
   «max_tokens_exceeded … output limit reached»): ridurre l'ingresso non lo cura, e come Codex (`codex-rs/codex-api/src/sse/responses_error.rs:47-48`,
   solo `context_length_exceeded` ⇒ finestra piena) non è finestra piena su nessuno dei due fili: col prefill in volo è il 400 di oggi, il rifiuto. */
const PIENA_DUE_STALLI = [null, 'A', null, null, 'B'];
const RIFIUTO_DUE_STALLI = [null, 'A', null, null, null];
test('VSR-70 (giro 12, riscritta al giro 13): ogni pacchetto di OpenRouter nel flusso vale come il SUO gemello HTTP con lo stesso corpo', async () => {
  for (const [nome, corpo, attesi] of [
    ['pacchetto documentato', CORPO_PIENO_OR, PIENA_DUE_STALLI],
    ['solo il tipo', { code: 400, message: 'Provider returned error', metadata: { error_type: 'context_length_exceeded' } }, PIENA_DUE_STALLI],
    ['tipo max_tokens_exceeded', CORPO_MAXT_OR, RIFIUTO_DUE_STALLI],
    ['tipo token_limit_exceeded (tetto di spesa di OpenRouter)', { code: 400, message: 'Provider returned error', metadata: { error_type: 'token_limit_exceeded' } }, RIFIUTO_DUE_STALLI],
    ['tipo string_too_long (tetto di caratteri di un campo)', { code: 400, message: 'Provider returned error', metadata: { error_type: 'string_too_long' } }, RIFIUTO_DUE_STALLI],
    ['solo il messaggio', { code: 400, message: MSG_OR }, PIENA_DUE_STALLI],
    ['senza codice, solo il messaggio', { message: MSG_OR }, PIENA_DUE_STALLI],
  ]) {
    const http = dueStalli(pienoHttpOR(corpo));
    assert.equal((await lavora(http, { attesaRitentaMassimaMs: 1 }).esito).detto, 'fatto', `${nome}: HTTP`);
    assert.deepEqual(http.corpi.map(prefillDi), attesi, `${nome}: il gemello HTTP`);
    const r = dueStalli(pienoNelFlussoOR(corpo));
    assert.equal((await lavora(r, { attesaRitentaMassimaMs: 1 }).esito).detto, 'fatto', nome);
    assert.deepEqual(r.corpi.map(prefillDi), http.corpi.map(prefillDi), `${nome}: come il suo gemello HTTP`);
    assert.equal(r.corpi.length, http.corpi.length, `${nome}: le stesse richieste`);
    assert.deepEqual(r.corpi[2].messages, r.corpi[0].messages, `${nome}: la stessa domanda senza il prefill`);
  }
  // un codice CON NOME `max_tokens_exceeded` nel flusso non porta uno stato: né finestra piena né rifiuto, l'esito incerto di oggi
  const conNome = dueStalli(pienoNelFlussoOR({ code: 'max_tokens_exceeded', message: 'Generation stopped early.' }));
  const eNome = await rifiuta(lavora(conNome, { attesaRitentaMassimaMs: 1 }).esito);
  assert.equal(eNome.code, 'PROVIDER_OUTCOME_UNKNOWN', eNome.message);
  assert.equal(conNome.corpi.length, 2);
  // al contrario: un 429 nel flusso che dice «too many tokens» è traffico, mai finestra piena (come l'HTTP, CP-REV-01): esito incerto, nessun reinvio
  const traffico429 = rete(vuotaRagionata('A'), pienoNelFlussoOR({ code: 429, message: 'Too many tokens, please wait before trying again.' }), risposta('fatto'));
  const e429 = await rifiuta(lavora(traffico429, { attesaRitentaMassimaMs: 1 }).esito);
  assert.equal(e429.code, 'PROVIDER_OUTCOME_UNKNOWN');
  assert.equal(traffico429.corpi.length, 2);
  // giro 13: anche col tipo della finestra piena, un 429 resta traffico (il classificatore dell'HTTP non lo legge mai come piena)
  const conTipo429 = rete(vuotaRagionata('A'), pienoNelFlussoOR({ code: 429, message: 'Too many requests', metadata: { error_type: 'context_length_exceeded' } }), risposta('fatto'));
  assert.equal((await rifiuta(lavora(conTipo429, { attesaRitentaMassimaMs: 1 }).esito)).code, 'PROVIDER_OUTCOME_UNKNOWN');
  assert.equal(conTipo429.corpi.length, 2);
});

/* Giro 12: senza prefill in volo la finestra piena nel flusso arriva a chi compatta (il guscio) come quella HTTP: classificata, coi numeri
   del fornitore (`numeriDelContestoPieno`, il bersaglio del pezzo C), una richiesta in più sola, quella del guscio. */
test('VSR-71 (giro 12): la finestra piena nel flusso arriva al guscio coi numeri del fornitore, come quella HTTP', async () => {
  const numeri = [];
  const guscio = (classi) => ({ prepare: async ({ messages }) => ({ messages }), infer: async (_o, invia) => {
    try { return await invia(); } catch (e) { classi.push(classificaErroreFornitore(e)); numeri.push(numeriDelContestoPieno(e)); if (classificaErroreFornitore(e) !== 'contesto-pieno') throw e; return invia(); }
  } });
  // l'ultimo caso: senza flusso (nessun onDelta) la finestra piena arriva nel corpo JSON di un 200 (`erroreNelCorpo`)
  const rispostaJSON = () => Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'fatto' }, finish_reason: 'stop' }], usage: { prompt_tokens: 110, completion_tokens: 4 } });
  for (const [pieno, dopo, extra] of [[pienoHttpOR(), risposta('fatto'), {}], [pienoNelFlussoOR(), risposta('fatto'), {}],
    [pienoNelFlussoOR(CORPO_PIENO_OR, [ragionamento('penso')]), risposta('fatto'), {}], [() => Response.json({ error: CORPO_PIENO_OR }), rispostaJSON, { onDelta: undefined }]]) {
    const classi = [];
    const r = rete(pieno, dopo);
    assert.equal((await lavora(r, { attesaRitentaMassimaMs: 1, contextHooks: guscio(classi), ...extra }).esito).detto, 'fatto');
    assert.deepEqual(classi, ['contesto-pieno']);
    assert.equal(r.corpi.length, 2);
  }
  const attesi = { richiesti: 9000, massimo: 8192, uscita: null };
  assert.deepEqual(numeri, [attesi, attesi, attesi, attesi], 'gli stessi numeri del fornitore, HTTP, nel flusso o nel corpo');
  // e senza guscio l'errore finale (ricostruito dal ciclo) porta ancora i numeri del fornitore
  const sola = rete(pienoNelFlussoOR(), pienoNelFlussoOR(), pienoNelFlussoOR());
  const finale = await rifiuta(lavora(sola, { attesaRitentaMassimaMs: 1 }).esito);
  assert.equal(finale.classe, 'contesto', `${finale.code} ${finale.message}`);
  assert.deepEqual(numeriDelContestoPieno(finale), attesi, finale.message);
  // anche l'uscita che il fornitore ha messo nel conto resta (il pezzo C la usa come riserva)
  const MSG_U = "This endpoint's maximum context length is 8192 tokens. However, you requested about 9000 tokens (7000 of text input, 1000 of tool input, 1000 in the output). Please reduce the length.";
  const colUscita = rete(...[1, 2, 3].map(() => pienoNelFlussoOR({ code: 400, message: MSG_U })));
  const finaleU = await rifiuta(lavora(colUscita, { attesaRitentaMassimaMs: 1 }).esito);
  assert.deepEqual(numeriDelContestoPieno(finaleU), { richiesti: 8000, massimo: 8192, uscita: 1000 }, finaleU.message);
});

/* Giro 12, la sonda V15 del revisore dei fornitori fatta prova, col GUSCIO VERO del desktop e l'adattatore VERO dei fornitori: la finestra
   piena nel flusso sulla continuazione, la ripartenza dà un attrezzo, lo stallo nuovo si continua come col corpo HTTP. */
async function colGuscioEAdattatore(risposte) {
  const prefill = [];
  const verso = [];
  let riassunti = 0;
  const fetchFinto = async (url, o) => {
    const corpo = corpoSenzaMarcatori(o.body);
    if (!corpo.tools?.length) { riassunti += 1; return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: '## Riassunto\nIn breve.' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10 } }); }
    prefill.push(prefillDi(corpo));
    verso.push(new URL(String(url)).pathname.split('/')[1]);
    return risposte[prefill.length - 1]();
  };
  const valori = new Map();
  const store = createProviderCredentialStore({ env: { ZAI_API_KEY: 'finta', OPENROUTER_API_KEY: 'finta' }, keyring: { get: (s, p) => valori.get(s + p) ?? null, set: (s, p, v) => valori.set(s + p, v), remove: (s, p) => valori.delete(s + p) } });
  for (const p of ['zai', 'openrouter']) store.setRuntime(p, { endpoint: `http://127.0.0.1:9/${p}` });
  const fetchDiRete = creaFetchMultiProvider(fetchFinto, { providerStore: store, dipendenze: { leggiChiave: (p) => store.getKey(p), leggiRuntime: (p) => store.getRuntime(p) }, fallbackProviders: [{ provider: 'zai', model: 'glm-4.7' }], modelloSessione: 'openrouter:z-ai/glm-4.7', onCambioFornitore: () => {}, onConsumoFornitore: () => {}, onAvviso: () => {} });
  let esito = null;
  let errore = null;
  try {
    esito = await guscioVero.talosLavora({ scartoMisurato: 0, cartella: cartellaDiProva('talos-vuota-guscio-adattatore-'), modello: 'openrouter:z-ai/glm-4.7', chiave: 'finta', task: { consegna: 'correggi' },
      contestoDelProgetto: 'Project files:\n', fetchDiRete, permessi: 'Full access', onDelta: () => {}, onGiro: () => {}, attesaRitentaMassimaMs: 1 });
  } catch (e) { errore = e; }
  return { prefill, verso, riassunti, esito, errore };
}
test('VSR-72 (giro 12, sonda V15, guscio vero e adattatore vero): la finestra piena nel flusso sulla continuazione, poi lo stallo nuovo si continua come con l\'HTTP', async () => {
  const esiti = [];
  for (const pieno of [pienoHttpOR(), pienoNelFlussoOR()]) {
    const g = await colGuscioEAdattatore([vuotaORCon('A'), pieno, attrezzo('call_x'), vuotaORCon('B'), risposta('fatto'), risposta('fatto'), risposta('fatto')]);
    assert.equal(g.errore, null, `${g.errore?.code} ${g.errore?.message}`);
    esiti.push({ detto: g.esito.detto, prefill: g.prefill, verso: g.verso, riassunti: g.riassunti });
  }
  assert.deepEqual(esiti[0], { detto: 'fatto', prefill: [null, 'A', null, null, 'B'], verso: ['openrouter', 'openrouter', 'openrouter', 'openrouter', 'openrouter'], riassunti: 0 });
  assert.deepEqual(esiti[1], esiti[0], 'nel flusso come in HTTP: stesse richieste, stesso filo, nessun riassunto');
});

/* Giro 12 (BASSO del revisore del filo, N2, e SONDA-B delle prove): il pacchetto d'errore arriva DOPO un ragionamento già trasmesso sulla
   continuazione. Il fornitore il prefill lo aveva accettato: la ripartenza senza prefill resta (come Hermes, dove il ragionamento non
   accende `deltas_were_sent`, `agent/chat_completion_helpers.py:2822-2835`, sonda V11b dei fornitori), ma il filo NON si segna come uno che
   rifiuta, e il ragionamento di quel tentativo si chiude a schermo prima della ripartenza (come il ramo del parziale nel ciclo). */
/** La linea del tempo vista dallo schermo: Q = una richiesta parte, R = ragionamento trasmesso, C = la risposta che chiude il blocco. */
const lavoraConLinea = (r, extra = {}) => {
  const linea = [];
  const fetch = async (u, o) => { linea.push('Q'); return r.fetch(u, o); };
  const esito = talosLavora({ cartella: cartellaDiProva('talos-vuota-linea-'), task: { consegna: 'correggi il difetto' }, modello: 'x', chiave: 'y', permessi: 'bypass', fetchDiRete: fetch,
    onDelta: (d) => { if (d?.tipo === 'ragionamento' && linea.at(-1) !== 'R') linea.push('R'); },
    onGiro: (e) => { if (e?.tipo === 'risposta') linea.push('C'); }, attesaRitentaMassimaMs: 1, ...extra });
  return { esito, linea };
};
/** Ogni ragionamento trasmesso si chiude prima che parta la richiesta dopo. */
const ragionamentiChiusi = (linea) => linea.every((x, i) => x !== 'R' || (() => { const q = linea.indexOf('Q', i); const c = linea.indexOf('C', i); return c >= 0 && (q < 0 || c < q); })());
test('VSR-73 (giro 12, N2 e SONDA-B): ragionamento POI un 400 nel flusso sulla continuazione: una ripartenza, il filo resta acceso, il ragionamento si chiude', async () => {
  const dopoIlRagionamento = (codice) => () => flussoIntero([ragionamento('X dopo il prefill'), pacchettoDErrore(codice, 'Upstream error during generation')]);
  for (const codice of [400, 422]) {
    const r = rete(vuotaRagionata('A'), dopoIlRagionamento(codice), vuotaRagionata('B'), risposta('fatto'));
    const l = lavoraConLinea(r);
    assert.equal((await l.esito).detto, 'fatto', String(codice));
    assert.deepEqual(r.corpi.map(prefillDi), [null, 'A', null, 'B'], `${codice}: il prefill era stato accettato, la vuota B si continua`);
    assert.deepEqual(r.corpi[2].messages, r.corpi[0].messages, `${codice}: la ripartenza è la stessa domanda senza il prefill`);
    assert.ok(ragionamentiChiusi(l.linea), `${codice}: ${l.linea.join('')}`);
  }
  // solo i dettagli cifrati del ragionamento (OpenRouter), senza testo: è ragionamento lo stesso
  const soloDettagli = rete(vuotaRagionata('A'), () => flussoIntero([{ choices: [{ delta: { reasoning_details: [CIFRATO_OR] } }] }, pacchettoDErrore(400, 'Upstream error during generation')]), vuotaRagionata('B'), risposta('fatto'));
  assert.equal((await lavora(soloDettagli, { attesaRitentaMassimaMs: 1 }).esito).detto, 'fatto');
  assert.deepEqual(soloDettagli.corpi.map(prefillDi), [null, 'A', null, 'B'], 'solo dettagli cifrati: il filo resta acceso');
  // attraverso l'adattatore vero: il segno del ragionamento passa, il filo resta acceso
  const v = await conAdattatoreVero('openrouter:z-ai/glm-4.7', [{ provider: 'zai', model: 'glm-4.7' }], [vuotaORCon('A'), dopoIlRagionamento(400), vuotaORCon('B'), risposta('fatto'), risposta('fatto')]);
  assert.equal(v.esito.errore, undefined, `${v.esito.errore?.code} ${v.esito.errore?.message}`);
  assert.deepEqual(v.corpi.map(prefillDi), [null, 'A', null, 'B'], 'adattatore vero: la vuota B si continua');
  // al contrario: lo stesso 400 SENZA ragionamento prima è il rifiuto (VSR-67): il filo si spegne
  const s = rete(vuotaRagionata('A'), erroreNelFlusso(400), vuotaRagionata('B'), risposta('fatto'));
  const m = lavoraConLinea(s);
  assert.equal((await m.esito).detto, 'fatto');
  assert.deepEqual(s.corpi.map(prefillDi), [null, 'A', null, null]);
  assert.ok(ragionamentiChiusi(m.linea), m.linea.join(''));
  const q = m.linea.reduce((a, x, i) => (x === 'Q' ? [...a, i] : a), []);
  assert.ok(!m.linea.slice(q[1], q[2]).includes('C'), `niente ragionamento da chiudere, nessuna chiusura in più: ${m.linea.join('')}`);
  // la finestra piena tipizzata dopo il ragionamento (SONDA-B): come l'HTTP, e il ragionamento si chiude. Giro 13: `max_tokens_exceeded` non è
  // più finestra piena, è il 400 dopo un ragionamento (N2): la stessa sequenza, per l'altra strada
  for (const corpo of [CORPO_PIENO_OR, CORPO_MAXT_OR]) {
    const t = dueStalli(pienoNelFlussoOR(corpo, [ragionamento('continuo a pensare')]));
    const n = lavoraConLinea(t);
    assert.equal((await n.esito).detto, 'fatto', corpo.metadata.error_type);
    assert.deepEqual(t.corpi.map(prefillDi), [null, 'A', null, null, 'B'], corpo.metadata.error_type);
    assert.ok(ragionamentiChiusi(n.linea), `${corpo.metadata.error_type}: ${n.linea.join('')}`);
  }
  /* al contrario: testo o attrezzo DOPO il ragionamento non è «solo ragionamento». Giro 13 (MEDIO del revisore del filo): dopo un'uscita
     consegnata la finestra piena nel flusso NON si riconosce più (Hermes non ripete dopo una consegna, `agent/chat_completion_helpers.py:3596-3604`):
     è l'esito incerto di oggi, una richiesta sola col prefill, nessun reinvio; il testo si chiude col suo contenuto, mai con un vuoto */
  for (const [nome, dopo, chiuso] of [['testo', testo('parz'), 'parz'], ['attrezzo', chiamaShell('call_p'), '']]) {
    const t = rete(vuotaRagionata('A'), pienoNelFlussoOR(CORPO_PIENO_OR, [ragionamento('penso'), dopo]), risposta('fatto'), risposta('fatto'));
    const n = lavora(t, { attesaRitentaMassimaMs: 1 });
    const e = await rifiuta(n.esito);
    assert.equal(e.code, 'PROVIDER_OUTCOME_UNKNOWN', `${nome}: ${e.message}`);
    assert.equal(t.corpi.length, 2, `${nome}: nessun reinvio dopo un'uscita consegnata`);
    assert.equal(n.eventi.filter((x) => x?.tipo === 'risposta').at(-1)?.risposta?.content, chiuso, nome);
  }
});

/* Giro 12 (BASSO del revisore delle prove, mutante P10): col GUSCIO VERO un rifiuto del prefill, poi la ripartenza senza prefill piena, il
   guscio compatta DENTRO infer: il rifiuto resta (la sonda N3L del revisore del filo). Solo la bandiera dello stallo si riapre. */
test('VSR-74 (giro 12, guscio vero, mutante P10): un rifiuto nel flusso sopravvive alla compattazione del guscio', async () => {
  const stima = kernel.stimaTokenConversazione;
  const corpi = [];
  let riassunti = 0;
  let piene = 0;
  const fetchDiRete = async (_u, o) => {
    const corpo = corpoSenzaMarcatori(o.body);
    if (!corpo.tools?.length) { riassunti += 1; return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: '## Riassunto\nIn breve.' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10 } }); }
    corpi.push(corpo);
    if (corpi.length === 1) return vuotaRagionata('A1')();
    if (conPrefill(corpo)) return erroreNelFlusso(400)();
    if (riassunti === 0 && piene++ === 0) return new Response(JSON.stringify({ error: { message: `prompt is too long: ${stima(corpo.messages)} tokens > 9000 maximum` } }), { status: 400, headers: { 'content-type': 'application/json' } });
    return corpi.length <= 4 ? vuotaRagionata('B1')() : risposta('fatto')();
  };
  let esito = null;
  let errore = null;
  try {
    esito = await guscioVero.talosLavora({ scartoMisurato: 0, cartella: cartellaDiProva('talos-vuota-guscio-rifiuto-'), modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'x' },
      messaggiIniziali: [...storiaLunga(40), { role: 'user', content: 'Continua.' }], contestoDelProgetto: 'Project files:\n', fetchDiRete, permessi: 'Full access', onDelta: () => {}, attesaRitentaMassimaMs: 1, onGiro: () => {} });
  } catch (e) { errore = e; }
  assert.equal(errore, null, `${errore?.code} ${errore?.message}`);
  assert.equal(esito.detto, 'fatto');
  assert.equal(riassunti, 1, 'il guscio compatta una volta');
  assert.deepEqual(corpi.map((c) => (conPrefill(c) ? 'P' : 'no')), ['no', 'P', 'no', 'no', 'no'], 'dopo il riassunto la vuota B1 non si continua: il filo ha rifiutato');
});

/* Giro 12 (BASSO del revisore delle prove, mutante P4): un pacchetto d'errore SENZA codice col prefill in volo non dice che è un rifiuto:
   resta l'esito incerto di oggi, una richiesta sola in più mai. E l'errore porta, leggibili, il messaggio e il tipo del fornitore. */
test('VSR-75 (giro 12, mutante P4): un pacchetto d\'errore senza codice col prefill in volo resta incerto e porta messaggio e tipo del fornitore', async () => {
  const r = rete(vuotaRagionata('A'), pienoNelFlussoOR({ message: 'Provider returned error', metadata: { error_type: 'provider_error' } }), risposta('fatto'));
  // chi riceve l'errore della chiamata (il guscio, dentro infer) lo vede col messaggio e col tipo
  const visti = [];
  const guscio = { prepare: async ({ messages }) => ({ messages }), infer: async (_o, invia) => { try { return await invia(); } catch (x) { visti.push(x); throw x; } } };
  const finale = await rifiuta(lavora(r, { attesaRitentaMassimaMs: 1, contextHooks: guscio }).esito);
  assert.equal(finale.code, 'PROVIDER_OUTCOME_UNKNOWN');
  assert.equal(r.corpi.length, 2, 'nessuna ripartenza: senza codice non si sa se è un rifiuto');
  assert.equal(visti.length, 1);
  const [e] = visti;
  assert.equal(e.statoNelFlusso, undefined);
  assert.equal(e.messaggioDelFornitore, 'Provider returned error');
  assert.equal(e.tipoDelFornitore, 'provider_error');
  // e attraverso l'adattatore vero: il tipo resta leggibile per il guscio, il testo del fornitore no (R10-2: il suo corpo non esce dall'adattatore)
  const passati = [];
  const guscioA = { prepare: async ({ messages }) => ({ messages }), infer: async (_o, invia) => { try { return await invia(); } catch (x) { passati.push(x); throw x; } } };
  const b = await conAdattatoreVero('openrouter:z-ai/glm-4.7', [{ provider: 'zai', model: 'glm-4.7' }], [pienoNelFlussoOR({ code: 502, message: 'Upstream error', metadata: { error_type: 'provider_error' } }), risposta('fatto')], { contextHooks: guscioA });
  assert.equal(b.esito.errore?.code, 'PROVIDER_OUTCOME_UNKNOWN');
  assert.equal(passati.length, 1);
  assert.equal(passati[0].tipoDelFornitore, 'provider_error');
  assert.equal(passati[0].messaggioDelFornitore, undefined);
  assert.equal(passati[0].ragionamentoNelFlusso, undefined, 'niente ragionamento prima del pacchetto');
  // un tipo che non è un nome corto non passa
  const c = await conAdattatoreVero('openrouter:z-ai/glm-4.7', [{ provider: 'zai', model: 'glm-4.7' }], [pienoNelFlussoOR({ code: 502, message: 'x', metadata: { error_type: 'sk-or-v1 leaked key here' } }), risposta('fatto')], { contextHooks: guscioA });
  assert.equal(c.esito.errore?.code, 'PROVIDER_OUTCOME_UNKNOWN');
  assert.equal(passati.length, 2);
  assert.equal(passati[1].tipoDelFornitore, undefined);
});

/* Giro 12 (BASSO del revisore delle prove, mutante P16): finestra piena col prefill, la ripartenza senza dà un 413: anche lui è piena, la
   compatta chi la riceve, quindi lo stallo si riapre (come col 400 di VSR-66): la vuota B dopo il reinvio del guscio si continua. */
test('VSR-76 (giro 12, mutante P16): piena col prefill e poi un 413 senza: il guscio riprova e la vuota B si continua', async () => {
  const classi = [];
  const r = rete(vuotaRagionata('A'), finestraPiena, troppoGrande, vuotaRagionata('B'), risposta('Fatto.'));
  assert.equal((await lavora(r, { attesaRitentaMassimaMs: 1, contextHooks: guscioCheRiprova(classi) }).esito).detto, 'Fatto.');
  assert.deepEqual(classi, ['contesto-pieno'], 'il 413 arriva al guscio');
  assert.deepEqual(r.corpi.map(prefillDi), [null, 'A', null, null, 'B'], 'dopo il reinvio del guscio lo stallo è riaperto');
});

/* Cura 324, giro 13: il GUSCIO VERO del desktop (e, a richiesta, l'adattatore VERO dei fornitori) con la linea del tempo dello schermo.
   Q = una richiesta del giro (i riassunti del guscio si contano a parte), R = ragionamento, T = testo, C = la risposta che chiude il blocco. */
async function colGuscioLinea(risponde, { coppie = 4, adattatore = false } = {}) {
  const corpi = [];
  const linea = [];
  const chiusi = [];
  let riassunti = 0;
  const fetchFinto = async (_u, o) => {
    const corpo = corpoSenzaMarcatori(o.body);
    if (!corpo.tools?.length) { riassunti += 1; return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: '## Riassunto\nIn breve.' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10 } }); }
    corpi.push(corpo);
    linea.push('Q');
    return risponde(corpi.length, corpo, riassunti);
  };
  let fetchDiRete = fetchFinto;
  let modello = 'z-ai/glm-5.3-flash';
  if (adattatore) {
    const valori = new Map();
    const store = createProviderCredentialStore({ env: { ZAI_API_KEY: 'finta', OPENROUTER_API_KEY: 'finta' }, keyring: { get: (s, p) => valori.get(s + p) ?? null, set: (s, p, v) => valori.set(s + p, v), remove: (s, p) => valori.delete(s + p) } });
    for (const p of ['zai', 'openrouter']) store.setRuntime(p, { endpoint: `http://127.0.0.1:9/${p}` });
    fetchDiRete = creaFetchMultiProvider(fetchFinto, { providerStore: store, dipendenze: { leggiChiave: (p) => store.getKey(p), leggiRuntime: (p) => store.getRuntime(p) }, fallbackProviders: [{ provider: 'zai', model: 'glm-4.7' }], modelloSessione: 'openrouter:z-ai/glm-4.7', onCambioFornitore: () => {}, onConsumoFornitore: () => {}, onAvviso: () => {} });
    modello = 'openrouter:z-ai/glm-4.7';
  }
  let esito = null;
  let errore = null;
  try {
    esito = await guscioVero.talosLavora({ scartoMisurato: 0, cartella: cartellaDiProva('talos-vuota-guscio-linea-'), modello, chiave: 'finta', task: { consegna: 'x' },
      messaggiIniziali: [...storiaLunga(coppie), { role: 'user', content: 'Continua.' }], contestoDelProgetto: 'Project files:\n', fetchDiRete, permessi: 'Full access',
      onDelta: (e) => { if (e?.tipo === 'ragionamento' && linea.at(-1) !== 'R') linea.push('R'); if (e?.tipo === 'testo' && linea.at(-1) !== 'T') linea.push('T'); },
      onGiro: (e) => { if (e?.tipo === 'risposta') { linea.push('C'); chiusi.push(e.risposta?.content ?? null); } }, attesaRitentaMassimaMs: 1 });
  } catch (e) { errore = e; }
  return { prefill: corpi.map(prefillDi), riassunti, linea, chiusi, esito, errore };
}
/** Ogni blocco trasmesso (ragionamento o testo) si chiude prima che parta la richiesta dopo, e una volta sola. */
const blocchiChiusiUnaVolta = (linea) => linea.every((x, i) => {
  if (x !== 'R' && x !== 'T') return true;
  const q = linea.indexOf('Q', i);
  const tratto = linea.slice(i, q < 0 ? linea.length : q);
  return tratto.filter((y) => y === 'C').length === 1;
});

/* Giro 13, punto 1 (MEDIO del revisore del filo, sonde X5, X5b, X6, X6m): la finestra piena nel flusso si riconosce SOLO prima di ogni testo e
   di ogni attrezzo (come `statoNelFlusso`). Dopo un'uscita consegnata è l'esito incerto della base 16e549508: il parziale chiuso e tenuto in
   storia, `PROVIDER_OUTCOME_UNKNOWN`, nessun reinvio, nessun riassunto. Hermes non ripete dopo una consegna
   (`agent/chat_completion_helpers.py:3596-3604`) e conta ogni delta di testo, anche di soli spazi (`:2822-2831`, `_emit_text`). */
test('VSR-77 (giro 13): testo o attrezzo consegnati, poi la finestra piena nel flusso: esito incerto col parziale, nessun reinvio', async () => {
  for (const [nome, corpo, prima, chiuso] of [
    ['testo poi piena (X5b)', CORPO_PIENO_OR, [testo('parziale ')], 'parziale '],
    ['testo poi max_tokens_exceeded (X5)', CORPO_MAXT_OR, [testo('parziale ')], 'parziale '],
    ['solo spazi poi piena', CORPO_PIENO_OR, [testo('  ')], ''],
    ['attrezzo poi piena', CORPO_PIENO_OR, [chiamaShell('call_p')], ''],
    ['ragionamento, testo, poi piena', CORPO_PIENO_OR, [ragionamento('penso'), testo('parziale ')], 'parziale '],
  ]) {
    const classi = [];
    const r = rete(pienoNelFlussoOR(corpo, prima), risposta('fatto'), risposta('fatto'));
    const l = lavora(r, { attesaRitentaMassimaMs: 1, contextHooks: guscioCheRiprova(classi) });
    const e = await rifiuta(l.esito);
    assert.equal(e.code, 'PROVIDER_OUTCOME_UNKNOWN', `${nome}: ${e.message}`);
    assert.equal(r.corpi.length, 1, `${nome}: nessun reinvio`);
    assert.deepEqual(classi, [null], `${nome}: il guscio non la compatta`);
    assert.equal(l.eventi.filter((x) => x?.tipo === 'risposta').at(-1)?.risposta?.content, chiuso, `${nome}: il parziale si chiude col suo testo`);
  }
  // col prefill in volo (X6, X6m): la continuazione aveva consegnato testo, nessuna ripartenza senza prefill
  for (const corpo of [CORPO_PIENO_OR, CORPO_MAXT_OR]) {
    const r = rete(vuotaRagionata('A'), pienoNelFlussoOR(corpo, [testo('parziale ')]), risposta('fatto'), risposta('fatto'));
    const l = lavora(r, { attesaRitentaMassimaMs: 1 });
    const e = await rifiuta(l.esito);
    assert.equal(e.code, 'PROVIDER_OUTCOME_UNKNOWN', corpo.metadata.error_type);
    assert.deepEqual(r.corpi.map(prefillDi), [null, 'A'], `${corpo.metadata.error_type}: nessun reinvio`);
  }
  // senza flusso: un corpo 200 che porta testo E l'errore della finestra piena è lo stesso esito incerto
  // (anche un attrezzo senza testo: mutante N4b)
  const chiamata = { id: 'call_j', type: 'function', function: { name: 'shell', arguments: JSON.stringify({ comando: 'echo' }) } };
  for (const messaggio of [{ role: 'assistant', content: 'parziale ' }, { role: 'assistant', content: null, tool_calls: [chiamata] }]) {
    const conParziale = () => Response.json({ choices: [{ index: 0, message: messaggio, finish_reason: 'error', error: CORPO_PIENO_OR }], usage: { prompt_tokens: 110, completion_tokens: 4 } });
    const classi = [];
    const j = rete(conParziale, risposta('fatto'));
    const ej = await rifiuta(lavora(j, { attesaRitentaMassimaMs: 1, onDelta: undefined, contextHooks: guscioCheRiprova(classi) }).esito);
    assert.equal(ej.code, 'PROVIDER_OUTCOME_UNKNOWN', ej.message);
    assert.equal(j.corpi.length, 1);
    assert.deepEqual(classi, [null]);
  }
});

test('VSR-78 (giro 13, guscio vero, sonde X5, X5b, X6, X6m): dopo il testo consegnato la finestra piena nel flusso non paga un riassunto', async () => {
  for (const [nome, corpo, colPrefill] of [['X5', CORPO_MAXT_OR, false], ['X5b', CORPO_PIENO_OR, false], ['X6', CORPO_PIENO_OR, true], ['X6m', CORPO_MAXT_OR, true]]) {
    const g = await colGuscioLinea((n, corpoRichiesta) => {
      if (colPrefill && n === 1) return vuotaRagionata('A1')();
      if (colPrefill ? conPrefill(corpoRichiesta) : n === 1) return pienoNelFlussoOR(corpo, [testo('parziale ')])();
      return risposta('fatto')();
    }, { coppie: 40 });
    assert.equal(g.errore?.code, 'PROVIDER_OUTCOME_UNKNOWN', `${nome}: ${g.errore?.code} ${g.errore?.message} ${g.linea.join('')}`);
    assert.equal(g.riassunti, 0, `${nome}: nessun riassunto`);
    assert.deepEqual(g.prefill, colPrefill ? [null, 'A1'] : [null], `${nome}: nessun reinvio`);
    assert.equal(g.chiusi.at(-1), 'parziale ', `${nome}: il parziale si chiude col suo testo`);
    assert.ok(blocchiChiusiUnaVolta(g.linea), `${nome}: ${g.linea.join('')}`);
  }
});

/* Giro 13, punto 2 (MEDIO del revisore delle prove): `max_tokens_exceeded` sullo stesso corpo vale uguale nei due fili. Senza prefill: in HTTP il
   400 passa al guscio non classificato, una richiesta; nel flusso lo stesso. Col guscio vero e l'adattatore vero: nessun riassunto, mai la
   frase della finestra piena. La documentazione di OpenRouter (letta con ctx7 il 07/11): «max_tokens_exceeded … output limit reached». */
test('VSR-79 (giro 13): max_tokens_exceeded senza prefill: in HTTP e nel flusso il guscio non compatta', async () => {
  const visti = {};
  for (const [nome, pieno] of [['HTTP', pienoHttpOR(CORPO_MAXT_OR)], ['flusso', pienoNelFlussoOR(CORPO_MAXT_OR)]]) {
    const classi = [];
    const r = rete(pieno, risposta('fatto'), risposta('fatto'));
    const e = await rifiuta(lavora(r, { attesaRitentaMassimaMs: 1, contextHooks: guscioCheRiprova(classi) }).esito);
    assert.notEqual(e.classe, 'contesto', `${nome}: ${e.message}`);
    visti[nome] = { classi, richieste: r.corpi.length };
  }
  assert.deepEqual(visti.flusso, visti.HTTP, 'lo stesso corpo, lo stesso esito');
  assert.deepEqual(visti.HTTP, { classi: [null], richieste: 1 });
  for (const pieno of [pienoHttpOR(CORPO_MAXT_OR), pienoNelFlussoOR(CORPO_MAXT_OR)]) {
    const g = await colGuscioLinea(() => pieno(), { coppie: 40, adattatore: true });
    assert.ok(g.errore, 'il giro finisce con un errore');
    assert.equal(g.riassunti, 0, `nessun riassunto: ${g.errore?.message}`);
    assert.doesNotMatch(String(g.errore?.message), /context window/iu);
  }
});

/* Giro 13, punto 3 (MEDIO del revisore dei fornitori): OpenRouter avvolge l'errore del fornitore a valle in `metadata.raw` (stringa JSON, a volte
   oggetto). Si legge come Hermes (`agent/error_classifier.py:1424-1428`, `_openrouter_wrapped_message`: il messaggio interno di `raw`), con una
   lettura limitata che non lancia mai, ed esce uguale nel flusso e in HTTP: stesse richieste, stesso filo, stessi numeri. */
const MSG_OPENAI = "This model's maximum context length is 8192 tokens. However, you requested 9000 tokens (8000 in the messages, 1000 in the completion).";
const RAW_OPENAI = JSON.stringify({ error: { message: MSG_OPENAI, type: 'invalid_request_error', param: 'messages' } });
const MSG_XAI = "This model's maximum prompt length is 131072 but the request contains 200000 tokens.";
const RAW_XAI = JSON.stringify({ code: 'Client specified an invalid argument', error: MSG_XAI });
const avvolto = (raw, message = 'Provider returned error') => ({ code: 400, message, metadata: { raw, provider_name: 'DeepInfra' } });
const LUNGO = `Provider returned error. ${'The upstream provider sent a long explanation. '.repeat(10)}`;
test('VSR-80 (giro 13): metadata.raw di OpenRouter si legge uguale nel flusso e in HTTP, e non lancia mai', async () => {
  for (const [nome, corpo, attesi] of [
    ['raw stringa JSON', avvolto(RAW_OPENAI), PIENA_DUE_STALLI],
    ['raw oggetto', avvolto(JSON.parse(RAW_OPENAI)), PIENA_DUE_STALLI],
    ['raw xAI con error stringa', avvolto(RAW_XAI), PIENA_DUE_STALLI],
    ['raw testo semplice', avvolto('upstream: prompt is too long: 213462 tokens > 200000 maximum'), PIENA_DUE_STALLI],
    ['raw stringa JSON di una stringa', avvolto(JSON.stringify('upstream: prompt is too long: 213462 tokens > 200000 maximum')), PIENA_DUE_STALLI],
    ['raw col message in cima', avvolto({ message: MSG_OPENAI }), PIENA_DUE_STALLI],
    ['codice con nome, il marcatore solo nel raw (mutante N24)', { code: 'provider_error', message: 'Provider returned error', metadata: { raw: JSON.stringify({ error: { message: 'context_length_exceeded' } }) } }, PIENA_DUE_STALLI],
    ['messaggio lungo, raw oltre i primi 300 caratteri', avvolto(RAW_OPENAI, LUNGO), PIENA_DUE_STALLI],
    ['messaggio lungo, raw di Z.AI senza numeri', avvolto(JSON.stringify({ error: { code: '1261', message: 'Prompt exceeds max length' } }), LUNGO), PIENA_DUE_STALLI],
    ['raw numero', avvolto(42), RIFIUTO_DUE_STALLI],
    ['raw lista', avvolto([1, 2]), RIFIUTO_DUE_STALLI],
    ['raw JSON rotto', avvolto('{bad'), RIFIUTO_DUE_STALLI],
    ['raw troppo lungo', avvolto('{'.repeat(20_000)), RIFIUTO_DUE_STALLI],
    ['raw oltre 8 KiB col messaggio in fondo (non si analizza)', avvolto(JSON.stringify({ pad: 'x'.repeat(9000), error: { message: MSG_OPENAI } })), RIFIUTO_DUE_STALLI],
    ['raw con error numero', avvolto({ error: 5 }), RIFIUTO_DUE_STALLI],
    ['raw null', avvolto(null), RIFIUTO_DUE_STALLI],
  ]) {
    const http = dueStalli(pienoHttpOR(corpo));
    assert.equal((await lavora(http, { attesaRitentaMassimaMs: 1 }).esito).detto, 'fatto', `${nome}: HTTP`);
    assert.deepEqual(http.corpi.map(prefillDi), attesi, `${nome}: HTTP`);
    const r = dueStalli(pienoNelFlussoOR(corpo));
    assert.equal((await lavora(r, { attesaRitentaMassimaMs: 1 }).esito).detto, 'fatto', `${nome}: flusso`);
    assert.deepEqual(r.corpi.map(prefillDi), attesi, `${nome}: come il gemello HTTP`);
  }
  // i numeri del fornitore a valle arrivano a chi compatta uguali dai due fili
  // l'ultimo: la finestra piena si legge nei primi 300 caratteri, i numeri solo più in là, nel fornitore a valle
  for (const corpo of [avvolto(RAW_OPENAI), avvolto(RAW_OPENAI, LUNGO), avvolto(RAW_XAI), avvolto(RAW_OPENAI, `Context window exceeded. ${LUNGO}`)]) {
    const numeri = [];
    const rispostaJSON = () => Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'fatto' }, finish_reason: 'stop' }], usage: { prompt_tokens: 110, completion_tokens: 4 } });
    for (const [pieno, dopo, extra] of [[pienoHttpOR(corpo), risposta('fatto'), {}], [pienoNelFlussoOR(corpo), risposta('fatto'), {}], [() => Response.json({ error: corpo }), rispostaJSON, { onDelta: undefined }]]) {
      const guscio = { prepare: async ({ messages }) => ({ messages }), infer: async (_o, invia) => {
        try { return await invia(); } catch (e) { numeri.push(numeriDelContestoPieno(e)); if (classificaErroreFornitore(e) !== 'contesto-pieno') throw e; return invia(); }
      } };
      assert.equal((await lavora(rete(pieno, dopo), { attesaRitentaMassimaMs: 1, contextHooks: guscio, ...extra }).esito).detto, 'fatto');
    }
    assert.ok(numeri[0], `numeri dal corpo HTTP: ${corpo.message.slice(0, 40)}`);
    assert.deepEqual(numeri[1], numeri[0], 'gli stessi numeri nel flusso');
    assert.deepEqual(numeri[2], numeri[0], 'e nel corpo 200 senza flusso');
  }
  // il corpo HTTP si analizza solo fino a 64 KiB (limite voluto, solo del filo HTTP): oltre contano i suoi primi 300 caratteri, un rifiuto
  const enorme = dueStalli(pienoHttpOR({ extra: 'x'.repeat(70_000), ...avvolto(RAW_OPENAI) }));
  assert.equal((await lavora(enorme, { attesaRitentaMassimaMs: 1 }).esito).detto, 'fatto');
  assert.deepEqual(enorme.corpi.map(prefillDi), RIFIUTO_DUE_STALLI);
  // al contrario (mutante N11b): quando i primi 300 caratteri dicono già la finestra piena coi suoi numeri, il messaggio HTTP resta quello di prima
  let messaggio = null;
  const guscioM = { prepare: async ({ messages }) => ({ messages }), infer: async (_o, invia) => { try { return await invia(); } catch (e) { messaggio = e.message; return invia(); } } };
  assert.equal((await lavora(rete(pienoHttpOR(), risposta('fatto')), { attesaRitentaMassimaMs: 1, contextHooks: guscioM }).esito).detto, 'fatto');
  assert.match(String(messaggio), /maximum context length is 8192/u);
  assert.doesNotMatch(String(messaggio), /\(context_length_exceeded\)/u);
  // al contrario (mutante N12): un 429 HTTP che porta il tipo della finestra piena resta traffico, il messaggio non prende il marcatore
  const traffico = () => new Response(JSON.stringify({ error: { message: 'Rate limit exceeded', metadata: { error_type: 'context_length_exceeded' } } }), { status: 429, headers: { 'content-type': 'application/json' } });
  let visto = null;
  const guscio429 = { prepare: async ({ messages }) => ({ messages }), infer: async (_o, invia) => { try { return await invia(); } catch (e) { visto = e; throw e; } } };
  await rifiuta(lavora(rete(...Array.from({ length: 12 }, () => traffico)), { attesaRitentaMassimaMs: 1, contextHooks: guscio429 }).esito);
  assert.equal(visto?.stato, 429, String(visto?.message));
  assert.doesNotMatch(String(visto.message), /\(context_length_exceeded\)/u);
});

/* Giro 13, punto 4 (BASSO del revisore delle prove): senza prefill in volo, un ragionamento trasmesso prima della finestra piena nel flusso si
   chiude a schermo PRIMA che l'errore arrivi a chi compatta (il guscio riprova dentro infer: la linea era QRQC). Come la chiusura del ramo col
   prefill (giro 12) e del parziale senza testo nel ciclo. */
test('VSR-81 (giro 13): ragionamento poi finestra piena nel flusso senza prefill: il ragionamento si chiude una volta prima del reinvio', async () => {
  const classi = [];
  const r = rete(pienoNelFlussoOR(CORPO_PIENO_OR, [ragionamento('penso')]), risposta('fatto'));
  const l = lavoraConLinea(r, { contextHooks: guscioCheRiprova(classi) });
  assert.equal((await l.esito).detto, 'fatto');
  assert.deepEqual(classi, ['contesto-pieno']);
  assert.equal(l.linea.join(''), 'QRCQC', 'il ragionamento si chiude prima del reinvio del guscio');
  // al contrario: senza ragionamento niente da chiudere, nessuna chiusura in più
  const v = rete(pienoNelFlussoOR(), risposta('fatto'));
  const lv = lavoraConLinea(v, { contextHooks: guscioCheRiprova([]) });
  assert.equal((await lv.esito).detto, 'fatto');
  assert.equal(lv.linea.join(''), 'QQC');
  // al contrario: ragionamento poi un 502 nel flusso (non è finestra piena): lo chiude il ciclo, una volta sola
  const g502 = rete(pienoNelFlussoOR({ code: 502, message: 'Upstream error' }, [ragionamento('penso')]), risposta('fatto'), risposta('fatto'));
  const l502 = lavoraConLinea(g502);
  await l502.esito.catch(() => null);
  assert.equal(l502.linea.slice(0, 3).join(''), 'QRC', l502.linea.join(''));
  assert.ok(blocchiChiusiUnaVolta(l502.linea), l502.linea.join(''));
  // senza guscio l'errore esce dal ciclo: ogni ragionamento chiuso una volta sola
  const pienaConRagionamento = () => pienoNelFlussoOR(CORPO_PIENO_OR, [ragionamento('penso')]);
  const s = rete(pienaConRagionamento(), pienaConRagionamento(), pienaConRagionamento());
  const m = lavoraConLinea(s);
  const e = await rifiuta(m.esito);
  assert.equal(e.classe, 'contesto', e.message);
  assert.equal(m.linea.slice(0, 3).join(''), 'QRC', m.linea.join(''));
  assert.ok(blocchiChiusiUnaVolta(m.linea), m.linea.join(''));
  // la ripartenza senza prefill dopo un rifiuto, col ragionamento poi la finestra piena: chiusa anche lei, una volta
  const classi2 = [];
  const t = rete(vuotaRagionata('A'), erroreNelFlusso(400), pienoNelFlussoOR(CORPO_PIENO_OR, [ragionamento('penso')]), risposta('fatto'));
  const n = lavoraConLinea(t, { contextHooks: guscioCheRiprova(classi2) });
  assert.equal((await n.esito).detto, 'fatto');
  assert.deepEqual(classi2, ['contesto-pieno']);
  assert.deepEqual(t.corpi.map(prefillDi), [null, 'A', null, null]);
  assert.ok(blocchiChiusiUnaVolta(n.linea), n.linea.join(''));
  const u = rete(vuotaRagionata('A'), erroreNelFlusso(400), pienaConRagionamento(), pienaConRagionamento(), pienaConRagionamento());
  const o = lavoraConLinea(u);
  assert.equal((await rifiuta(o.esito)).classe, 'contesto');
  assert.ok(blocchiChiusiUnaVolta(o.linea), o.linea.join(''));
  // col guscio vero, con e senza l'adattatore vero (sonda X11d): un riassunto, ogni ragionamento chiuso una volta
  for (const adattatore of [false, true]) {
    const g = await colGuscioLinea((_n, _c, riassunti) => (riassunti === 0 ? pienoNelFlussoOR(CORPO_PIENO_OR, [ragionamento('pensa')])() : risposta('fatto')()), { coppie: 40, adattatore });
    assert.equal(g.errore, null, `${adattatore}: ${g.errore?.code} ${g.errore?.message}`);
    assert.equal(g.esito.detto, 'fatto');
    assert.equal(g.riassunti, 1, `adattatore ${adattatore}: il guscio compatta una volta`);
    assert.ok(blocchiChiusiUnaVolta(g.linea), `adattatore ${adattatore}: ${g.linea.join('')}`);
  }
});

/* Giro 13, punto 5 (BASSO del revisore dei fornitori): due forme vere della finestra piena che il classificatore non conosceva. Z.AI (GLM):
   `{ code: '1261', message: 'Prompt exceeds max length' }` (Hermes `agent/error_classifier.py:264`, prova `tests/agent/test_run_agent.py:4212`);
   xAI: «maximum prompt length is N but the request contains M» (pi `packages/ai/src/utils/overflow.ts:45`). Col prefill in volo si compattano,
   su tutti e due i fili. Al contrario i rifiuti VERI del prefill restano rifiuti: Mistral, Anthropic, DeepSeek, il 422 nel flusso. */
const httpCol = (corpo, stato = 400) => () => new Response(JSON.stringify(corpo), { status: stato, headers: { 'content-type': 'application/json' } });
const RIFIUTI_DEL_PREFILL = [
  ['Mistral', { code: 400, message: 'Expected last role User or Tool (or Assistant with prefix True) for serving but got assistant' }],
  ['Anthropic', { code: 400, message: 'This model does not support assistant message prefill. The conversation must end with a user message.' }],
  ['DeepSeek', { code: 400, message: 'The last message of deepseek-reasoner must be a user message, or an assistant message with prefix mode on (refer to https://api-docs.deepseek.com/guides/chat_prefix_completion).' }],
  ['422 nel flusso', { code: 422, message: 'Unprocessable Entity' }],
];
test('VSR-82 (giro 13): Z.AI 1261 e xAI «maximum prompt length» sono finestra piena sui due fili; i rifiuti veri del prefill restano rifiuti', async () => {
  assert.equal(classificaErroreFornitore({ message: 'Prompt exceeds max length', code: '1261' }), 'contesto-pieno');
  assert.equal(classificaErroreFornitore({ message: MSG_XAI, stato: 400 }), 'contesto-pieno');
  for (const [nome, corpo] of RIFIUTI_DEL_PREFILL) assert.equal(classificaErroreFornitore({ message: corpo.message, stato: corpo.code }), null, nome);
  for (const [nome, http, flusso] of [
    ['Z.AI 1261', httpCol({ error: { code: '1261', message: 'Prompt exceeds max length' } }), pienoNelFlussoOR({ code: '1261', message: 'Prompt exceeds max length' })],
    ['xAI', httpCol({ code: 'Client specified an invalid argument', error: MSG_XAI }), pienoNelFlussoOR({ code: 400, message: MSG_XAI })],
  ]) {
    for (const [filo, pieno] of [['HTTP', http], ['flusso', flusso]]) {
      const r = dueStalli(pieno);
      assert.equal((await lavora(r, { attesaRitentaMassimaMs: 1 }).esito).detto, 'fatto', `${nome} ${filo}`);
      assert.deepEqual(r.corpi.map(prefillDi), PIENA_DUE_STALLI, `${nome} ${filo}: si compatta, il filo resta acceso`);
    }
  }
  // i numeri di xAI dai due fili
  const numeri = [];
  for (const pieno of [httpCol({ code: 'Client specified an invalid argument', error: MSG_XAI }), pienoNelFlussoOR({ code: 400, message: MSG_XAI })]) {
    const guscio = { prepare: async ({ messages }) => ({ messages }), infer: async (_o, invia) => {
      try { return await invia(); } catch (e) { numeri.push(numeriDelContestoPieno(e)); return invia(); }
    } };
    await lavora(rete(pieno, risposta('fatto')), { attesaRitentaMassimaMs: 1, contextHooks: guscio }).esito;
  }
  assert.deepEqual(numeri, [{ richiesti: 200000, massimo: 131072, uscita: null }, { richiesti: 200000, massimo: 131072, uscita: null }]);
  // al contrario: i rifiuti veri del prefill, sui due fili, segnano il filo come oggi
  for (const [nome, corpo] of RIFIUTI_DEL_PREFILL) {
    for (const [filo, pieno] of [['HTTP', httpCol({ error: corpo }, corpo.code)], ['flusso', pienoNelFlussoOR(corpo)]]) {
      const r = dueStalli(pieno);
      assert.equal((await lavora(r, { attesaRitentaMassimaMs: 1 }).esito).detto, 'fatto', `${nome} ${filo}`);
      assert.deepEqual(r.corpi.map(prefillDi), RIFIUTO_DUE_STALLI, `${nome} ${filo}: resta un rifiuto`);
    }
  }
});

/* Giro 13, mutante V14 del revisore delle prove: un testo di soli spazi è un testo consegnato (Hermes `_emit_text`,
   `agent/chat_completion_helpers.py:2822-2831`): dopo di lui un 400 nel flusso non è un rifiuto del prefill. */
test('VSR-83 (giro 13, mutante V14): spazi consegnati sulla continuazione, poi un 400 nel flusso: esito incerto, nessuna ripartenza', async () => {
  const spazi = rete(vuotaRagionata('A'), pienoNelFlussoOR({ code: 400, message: 'Upstream error during generation' }, [testo('  ')]), risposta('fatto'));
  const e = await rifiuta(lavora(spazi, { attesaRitentaMassimaMs: 1 }).esito);
  assert.equal(e.code, 'PROVIDER_OUTCOME_UNKNOWN', e.message);
  assert.equal(spazi.corpi.length, 2, 'nessuna ripartenza dopo un testo consegnato');
  /* mutante V13 (ricostruito): un ragionamento seguito da soli spazi non è «solo ragionamento nel flusso», e il campo non si scrive */
  const ragionataPoiSpazi = rete(vuotaRagionata('A'), pienoNelFlussoOR({ code: 400, message: 'Upstream error during generation' }, [ragionamento('B'), testo('  ')]), risposta('fatto'));
  const e2 = await rifiuta(lavora(ragionataPoiSpazi, { attesaRitentaMassimaMs: 1 }).esito);
  assert.equal(e2.code, 'PROVIDER_OUTCOME_UNKNOWN', e2.message);
  assert.equal(e2.ragionamentoNelFlusso, undefined, 'spazi consegnati dopo il ragionamento: niente campo');
  assert.equal(ragionataPoiSpazi.corpi.length, 2, 'nessuna ripartenza');
});

/* ---- Giro 13, i mutanti rimasti vivi (cura 324): ogni prova qui sotto uccide un mutante della corsa completa ------------------------- */

/* Mutante N6b: `aValle` (il messaggio del fornitore a valle avvolto da OpenRouter in `metadata.raw`) si legge ma NON è enumerabile, così la
   forma di `erroreFornitore` che `consumaFlussoSSE` restituisce (esportata, letta dalla CLI e da `risposta-vuota.test.mjs:73`) resta di tre
   campi anche quando il pacchetto porta `metadata.raw`. Il revisore la diceva equivalente perché `chiama` lancia prima: vale per `chiama`,
   non per il lettore del flusso, che la restituisce (talosHarness.mjs:1409). */
test('VSR-84 (giro 13 vivi, mutante N6b): il pacchetto con metadata.raw lascia a erroreFornitore la forma di tre campi, e il messaggio a valle si legge', async () => {
  const raw = JSON.stringify({ error: { message: "This model's maximum context length is 8192 tokens", type: 'invalid_request_error' } });
  const esito = await kernel.consumaFlussoSSE(flussoIntero([{ id: 'gen-1', object: 'chat.completion.chunk',
    error: { code: 400, message: 'Provider returned error', metadata: { raw, error_type: 'provider_error' } },
    choices: [{ index: 0, delta: { content: '' }, finish_reason: 'error' }] }]), () => {});
  assert.deepEqual(esito.erroreFornitore, { messaggio: 'Provider returned error', codice: 400, tipo: 'provider_error' });
  assert.equal(JSON.stringify(esito.erroreFornitore), '{"messaggio":"Provider returned error","codice":400,"tipo":"provider_error"}');
  assert.equal(esito.erroreFornitore.aValle, "This model's maximum context length is 8192 tokens", 'il messaggio a valle resta leggibile');
});

/* Mutanti V13, G11b, G11c: `ragionamentoNelFlusso` vale SOLO per un flusso che ha trasmesso ragionamento e niente altro. Dentro `talosLavora`
   il campo si legge solo dietro la finestra piena o lo stato 400/422, che già chiedono «niente testo e niente attrezzi», e l'errore finale si
   ricostruisce: si vede sull'errore di `chiamaConRitenta` (esportata, la chiama anche la compattazione del ciclo, talosHarness.mjs:16057). */
const chiamaIlFlusso = (fotogrammi) => {
  let richieste = 0;
  const errore = rifiuta(kernel.chiamaConRitenta({ modello: 'x', chiave: 'y', messaggi: [{ role: 'user', content: 'correggi' }], attrezzi: [],
    fetchDiRete: async () => { richieste += 1; return flussoIntero(fotogrammi); }, onDelta: () => {}, dormi: async () => {}, caso: () => 0, attesaRitentaMassimaMs: 1 }));
  return errore.then((e) => ({ e, richieste }));
};
test('VSR-85 (giro 13 vivi, mutanti V13, G11b, G11c): ragionamento poi testo (anche di soli spazi) o un attrezzo, poi un 400 nel flusso: niente «solo ragionamento»', async () => {
  const errore400 = pacchettoDErrore(400, 'Upstream error during generation');
  for (const [nome, prima, parziale] of [
    ['ragionamento poi soli spazi (V13)', [ragionamento('B'), testo('  ')], '  '],
    ['ragionamento poi testo (G11b)', [ragionamento('B'), testo('parziale ')], 'parziale '],
    ['ragionamento poi attrezzo (G11c)', [ragionamento('B'), chiamaShell('call_r')], ''],
  ]) {
    const { e, richieste } = await chiamaIlFlusso([...prima, errore400]);
    assert.equal(e.code, 'PROVIDER_OUTCOME_UNKNOWN', `${nome}: ${e.message}`);
    assert.equal(e.parziale?.content, parziale, nome);
    assert.equal(e.ragionamentoNelFlusso, undefined, `${nome}: uscita consegnata dopo il ragionamento, il campo non si scrive`);
    assert.equal(e.statoNelFlusso, undefined, `${nome}: dopo un'uscita lo stato del pacchetto non vale`);
    assert.equal(richieste, 1, `${nome}: nessun reinvio`);
  }
  // al contrario: solo ragionamento, poi il pacchetto: il campo c'è
  const { e } = await chiamaIlFlusso([ragionamento('B'), errore400]);
  assert.equal(e.ragionamentoNelFlusso, true);
  assert.equal(e.statoNelFlusso, 400);
});

/* Mutante G3: un codice in sole cifre nel pacchetto è uno stato, e un 413 è sempre finestra piena per `classificaErroreFornitore`
   (compattazione-desktop.mjs:1369), anche senza parole di overflow nel messaggio. Gemella del 413 HTTP con lo stesso corpo (`troppoGrande`). */
test('VSR-86 (giro 13 vivi, mutante G3): un 413 detto DENTRO il flusso senza parole di overflow è la finestra piena, come il 413 HTTP', async () => {
  for (const [nome, prima] of [['413 nel flusso', () => flussoIntero([pacchettoDErrore(413, 'Request too large')])], ['413 HTTP (gemella)', troppoGrande]]) {
    const classi = [];
    const r = rete(prima, risposta('Fatto.'));
    const e = await lavora(r, { attesaRitentaMassimaMs: 1, contextHooks: guscioCheRiprova(classi) }).esito;
    assert.equal(e.detto, 'Fatto.', nome);
    assert.deepEqual(classi, ['contesto-pieno'], `${nome}: il guscio la riconosce e la compatta`);
    assert.equal(r.corpi.length, 2, nome);
  }
  // al contrario: lo stesso messaggio con un 502 nel flusso resta l'esito incerto, mai una compattazione
  const classi = [];
  const r = rete(() => flussoIntero([pacchettoDErrore(502, 'Request too large')]), risposta('Fatto.'));
  const e = await rifiuta(lavora(r, { attesaRitentaMassimaMs: 1, contextHooks: guscioCheRiprova(classi) }).esito);
  assert.equal(e.code, 'PROVIDER_OUTCOME_UNKNOWN');
  assert.deepEqual(classi, [null]);
});

/* Mutante V10: un rifiuto che l'SDK dice non ripetibile (`AI_StreamProviderError`, `isRetryable: false`, runtime-owner-adapter.mjs:1755) è un
   esito noto anche a flusso partito: esce come il rifiuto detto prima di ogni pezzo, mai come «risposta interrotta» (`PROVIDER_OUTCOME_UNKNOWN`). */
test('VSR-87 (giro 13 vivi, mutante V10): un rifiuto dichiarato nel flusso dopo un testo consegnato esce come lo stesso rifiuto prima del testo', async () => {
  const valori = new Map();
  const store = createProviderCredentialStore({ env: { OPENROUTER_API_KEY: 'finta' }, keyring: { get: (s, p) => valori.get(s + p) ?? null, set: (s, p, v) => valori.set(s + p, v), remove: (s, p) => valori.delete(s + p) } });
  store.setRuntime('openrouter', { endpoint: 'http://127.0.0.1:9/openrouter' });
  const f = creaFetchMultiProvider(async () => { throw new Error('niente rete in questa prova'); }, { providerStore: store,
    dipendenze: { leggiChiave: (p) => store.getKey(p), leggiRuntime: (p) => store.getRuntime(p) }, fallbackProviders: [], modelloSessione: 'openrouter:z-ai/glm-4.7',
    onCambioFornitore: () => {}, onConsumoFornitore: () => {}, onAvviso: () => {} });
  const corsa = (conTesto) => rifiuta(f.eseguiConFallback(async ({ onDelta }) => {
    if (conTesto) onDelta?.({ tipo: 'testo', testo: 'Ecco' });
    throw Object.assign(new Error('Invalid request: tool schema not accepted'), { name: 'AI_StreamProviderError', isRetryable: false });
  }, { modello: 'openrouter:z-ai/glm-4.7', onDelta: () => {} }));
  const prima = await corsa(false);
  const dopo = await corsa(true);
  assert.notEqual(dopo.code, 'PROVIDER_OUTCOME_UNKNOWN', dopo.message);
  assert.equal(dopo.code, prima.code);
  assert.equal(dopo.message, prima.message);
  assert.equal(dopo.dichiarato, true);
  assert.equal(dopo.transitorio, false);
});

/* BASSO del revisore delle prove su VSR-77: il parziale chiuso a schermo resta anche nella STORIA del giro fallito (`messaggiDelGiro`), come
   promette il commento di VSR-77: chi riprende il giro vede il testo già consegnato, mai una richiesta che lo ripete. */
test('VSR-88 (giro 13, BASSO di VSR-77): testo consegnato, poi la finestra piena nel flusso: il parziale resta nella storia del giro', async () => {
  const r = rete(pienoNelFlussoOR(CORPO_PIENO_OR, [testo('parziale ')]), risposta('fatto'));
  const e = await rifiuta(lavora(r, { attesaRitentaMassimaMs: 1 }).esito);
  assert.equal(e.code, 'PROVIDER_OUTCOME_UNKNOWN', e.message);
  const ultimo = e.messaggiDelGiro?.at(-1);
  assert.equal(ultimo?.role, 'assistant', JSON.stringify(e.messaggiDelGiro?.slice(-2)));
  assert.equal(ultimo?.content, 'parziale ');
  assert.equal(r.corpi.length, 1);
});

/* Giro 14 (revisore B del giro 13, sei buchi nelle prove, nessun difetto di prodotto): una prova per ogni mutante rimasto senza prova. Il primo
   è il più importante: il commit del giro 13 promette «whitespace counts as text… Same rule for a 200 JSON body». */
const corpo200ConErrore = (messaggio, errore = CORPO_PIENO_OR) => () => Response.json({ choices: [{ index: 0, message: messaggio, finish_reason: 'error', error: errore }], usage: { prompt_tokens: 110, completion_tokens: 4 } });
test('VSR-89 (giro 14, mutante M09): un corpo 200 senza flusso con testo di soli spazi e la finestra piena è esito incerto, una richiesta', async () => {
  const classi = [];
  const j = rete(corpo200ConErrore({ role: 'assistant', content: '  ' }), risposta('fatto'), risposta('fatto'));
  const e = await rifiuta(lavora(j, { attesaRitentaMassimaMs: 1, onDelta: undefined, contextHooks: guscioCheRiprova(classi) }).esito);
  assert.equal(e.code, 'PROVIDER_OUTCOME_UNKNOWN', e.message);
  assert.equal(j.corpi.length, 1, 'nessun reinvio');
  assert.deepEqual(classi, [null], 'il guscio non la compatta');
  // al contrario: lo stesso corpo con il testo vuoto è la finestra piena (il guscio la compatta e riprova)
  const classiVuota = [];
  const v = rete(corpo200ConErrore({ role: 'assistant', content: '' }), () => Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'fatto' }, finish_reason: 'stop' }], usage: { prompt_tokens: 110, completion_tokens: 4 } }));
  assert.equal((await lavora(v, { attesaRitentaMassimaMs: 1, onDelta: undefined, contextHooks: guscioCheRiprova(classiVuota) }).esito).detto, 'fatto');
  assert.deepEqual(classiVuota, ['contesto-pieno']);
});

test('VSR-90 (giro 14, mutante M01): un 429 scritto come stringa nel flusso, col tipo della finestra piena, resta traffico: esito incerto, due richieste', async () => {
  const r = rete(vuotaRagionata('A'), pienoNelFlussoOR({ code: '429', message: 'Too many requests', metadata: { error_type: 'context_length_exceeded' } }), risposta('fatto'), risposta('fatto'));
  const e = await rifiuta(lavora(r, { attesaRitentaMassimaMs: 1 }).esito);
  assert.equal(e.code, 'PROVIDER_OUTCOME_UNKNOWN', e.message);
  assert.equal(r.corpi.length, 2, 'nessuna ripartenza senza prefill');
});

/** Un `metadata.raw` oltre gli 8 KiB col messaggio della finestra piena IN TESTA: i suoi primi 300 caratteri lo portano. */
const RAW_GRANDE_IN_TESTA = JSON.stringify({ error: { message: MSG_OPENAI }, pad: 'x'.repeat(9000) });
test('VSR-91 (giro 14, mutante M03): metadata.raw oltre 8 KiB col messaggio in testa è la finestra piena sui due fili', async () => {
  assert.ok(RAW_GRANDE_IN_TESTA.length > 8_192 && RAW_GRANDE_IN_TESTA.slice(0, 300).includes('maximum context length'));
  for (const [nome, corpo] of [['messaggio corto', avvolto(RAW_GRANDE_IN_TESTA)], ['messaggio lungo, raw oltre i primi 300 caratteri del corpo', avvolto(RAW_GRANDE_IN_TESTA, LUNGO)]]) {
    for (const [filo, pieno] of [['HTTP', pienoHttpOR(corpo)], ['flusso', pienoNelFlussoOR(corpo)]]) {
      const r = dueStalli(pieno);
      assert.equal((await lavora(r, { attesaRitentaMassimaMs: 1 }).esito).detto, 'fatto', `${nome}, ${filo}`);
      assert.deepEqual(r.corpi.map(prefillDi), PIENA_DUE_STALLI, `${nome}, ${filo}`);
    }
  }
});

test('VSR-92 (giro 14, mutante M04): la frase della finestra divisa fra il messaggio e il raw si legge intera sui due fili', async () => {
  const corpo = { code: 400, message: 'Input too long for the context', metadata: { raw: 'window of 8192 tokens' } };
  for (const [filo, pieno] of [['HTTP', pienoHttpOR(corpo)], ['flusso', pienoNelFlussoOR(corpo)]]) {
    const r = dueStalli(pieno);
    assert.equal((await lavora(r, { attesaRitentaMassimaMs: 1 }).esito).detto, 'fatto', filo);
    assert.deepEqual(r.corpi.map(prefillDi), PIENA_DUE_STALLI, filo);
  }
});

test('VSR-93 (giro 14, mutante M06): i primi 300 caratteri del corpo HTTP tagliano i numeri prima dell\'uscita: il messaggio porta anche l\'uscita', async () => {
  const testa = '{"error":{"code":400,"message":"';
  const frase = ' (context_length_exceeded): 9000 input tokens requested, 8192 maximum';
  const messaggio = `${'Provider returned error. '.repeat(20).slice(0, 300 - testa.length - frase.length)}${frase}, 1000 output tokens`;
  const corpo = { code: 400, message: messaggio };
  const testo = JSON.stringify({ error: corpo });
  assert.ok(testo.slice(0, 300).endsWith('8192 maximum') && messaggio.length <= 300, testo.slice(280, 320));
  let visto = null;
  const guscio = { prepare: async ({ messages }) => ({ messages }), infer: async (_o, invia) => { try { return await invia(); } catch (e) { visto = e; if (classificaErroreFornitore(e) !== 'contesto-pieno') throw e; return invia(); } } };
  assert.equal((await lavora(rete(pienoHttpOR(corpo), risposta('fatto')), { attesaRitentaMassimaMs: 1, contextHooks: guscio }).esito).detto, 'fatto');
  assert.equal(classificaErroreFornitore(visto), 'contesto-pieno', String(visto?.message));
  assert.match(String(visto.message), /\(context_length_exceeded\): 9000 input tokens requested, 8192 maximum, 1000 output tokens\.?$/u);
});

test('VSR-94 (giro 14, mutante M13): la frase della finestra fra il carattere 100 e il 300 del messaggio nel raw si legge sui due fili', async () => {
  const dentro = `${'Upstream note '.repeat(9)}. ${MSG_OPENAI}`;
  const inizio = dentro.indexOf('maximum context length');
  assert.ok(inizio > 100 && inizio + 'maximum context length'.length < 300, String(inizio));
  const corpo = avvolto(JSON.stringify({ error: { message: dentro } }), LUNGO);
  for (const [filo, pieno] of [['HTTP', pienoHttpOR(corpo)], ['flusso', pienoNelFlussoOR(corpo)]]) {
    const r = dueStalli(pieno);
    assert.equal((await lavora(r, { attesaRitentaMassimaMs: 1 }).esito).detto, 'fatto', filo);
    assert.deepEqual(r.corpi.map(prefillDi), PIENA_DUE_STALLI, filo);
  }
});
