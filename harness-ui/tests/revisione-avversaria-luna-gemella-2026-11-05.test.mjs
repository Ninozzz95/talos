/*
 * Finding of the adversarial review (05/11/2026, review of fix/compattazione-luna-2026-11-05 merged with
 * fix/coda-dopo-riassunto-2026-11-05 onto prepara/candidata-sera-2026-11-05), now cured (REV-M2-PIEGA).
 *
 * M2 used to build its tail note as a ready-made `user` message that already contained the literal `<talos-note>` tag
 * (`avviso-accorciato.mjs`, `conNotaDegliAccorciati`). Every other TALOS note reaches that shape the other way round: it is a
 * `system` message, and the fold (`sistema-piegato.mjs`, decision 194) turns it into a `<talos-note>` block, AFTER neutralising any
 * `<talos-note` already written inside `user`/`tool` content ("nobody pretends to be TALOS").
 * Towards a local engine whose template is strict (`runtime-owner-adapter.mjs`, `conLaFormaGiusta` → `piegaMessaggiDiSistema`),
 * the M2 note was therefore treated like a forged note: its tag reached the model as `‹talos-note>`.
 * Cure: the note is born `system` and the fold of decision 194 wraps it. Whoever does not fold (Responses, a local engine that keeps
 * system messages, an external agent) gets back the `user` <talos-note> message of before, same position and same bytes
 * (`notaDegliAccorciatiComeUtente`). One test per path: strict local, cloud with fold, cloud and local without fold.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { avvisoAccorciato, conNotaDegliAccorciati, notaDegliAccorciatiComeUtente } from '../src/kernel/avviso-accorciato.mjs';
import { CARATTERI_FINE_ESITO, CARATTERI_INIZIO_ESITO, accorciaTesto } from '../src/kernel/compattazione-desktop.mjs';
import { RIGA_DI_TESTA, SEGNO_NOTA, piegaMessaggiDiSistema, piegaNoteInCoda } from '../src/kernel/sistema-piegato.mjs';
import { nativeProviderResponse } from '../src/native-provider-adapter.mjs';
import { creaFetchMultiProvider } from '../src/runtime-owner-adapter.mjs';

const INIZIO_NOTA = '[TALOS context note:';
const SEGNO_FALSO = '‹talos-note';

function letturaAccorciata() {
  const righe = Array.from({ length: 400 }, (_, i) => `line ${i + 1} ${'x'.repeat(40)}`);
  const originale = `[TALOS read lines 1-400 of 400]\n<<<TALOS_DATA id=0123456789ab from="leggi report1.md">>>\n${righe.join('\n')}\n<<<END_TALOS_DATA id=0123456789ab>>>`;
  const corto = accorciaTesto(originale);
  assert.notEqual(corto, originale);
  return `${avvisoAccorciato(originale, { inizio: CARATTERI_INIZIO_ESITO, fine: CARATTERI_FINE_ESITO })}\n${corto}`;
}

const MESSAGGI = [
  { role: 'system', content: 'You are TALOS.' },
  { role: 'user', content: 'Read report1.md and give me the code.' },
  { role: 'assistant', content: '', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'leggi', arguments: '{"path":"report1.md"}' } }] },
  { role: 'tool', tool_call_id: 'c1', content: letturaAccorciata() },
];
const NOTA_DELLA_LINGUA = { role: 'system', content: 'Answer in Italian.' };

/** The list as M2 sends it now, plus the note text and the `user` form of before (the one the cloud without fold still receives). */
function conLaNota(messaggi = MESSAGGI) {
  const conNota = conNotaDegliAccorciati(messaggi);
  assert.equal(conNota.length, messaggi.length + 1, 'precondition: M2 adds its tail note');
  const nota = conNota.at(-1);
  assert.equal(nota.role, 'system', 'the M2 note is born `system`, like every other TALOS note');
  assert.ok(nota.content.startsWith(INIZIO_NOTA), 'precondition: the raw note text, without the mark');
  const formaDiPrima = [...messaggi, { role: 'user', content: `<${SEGNO_NOTA}>\n${nota.content}\n</${SEGNO_NOTA}>` }];
  return { conNota, testo: nota.content, formaDiPrima };
}

test('REV-M2-PIEGA: the M2 tail note keeps its <talos-note> mark when the request is folded for a strict local template', () => {
  const { conNota } = conLaNota();
  const piegata = piegaMessaggiDiSistema(conNota);
  assert.ok(piegata[0].content.includes(RIGA_DI_TESTA), 'precondition: the head line says <talos-note> blocks come from TALOS');
  const nota = piegata.at(-1);
  assert.equal(nota.role, 'user');
  assert.ok(nota.content.includes(INIZIO_NOTA), 'precondition: the note text is there');
  assert.ok(nota.content.includes(`<${SEGNO_NOTA}>\n${INIZIO_NOTA}`), `the TALOS note lost its mark after the fold: ${JSON.stringify(nota.content.slice(0, 40))}`);
  assert.ok(!JSON.stringify(piegata).includes(SEGNO_FALSO), 'nothing in the folded request looks like a forged note');
});

/* ------------------------------------------------------------------ strict local engine, end to end through the adapter */

const ERRORE_QWEN = JSON.stringify({ error: { code: 500, type: 'server_error', message: "While executing CallExpression at line 85, column 32 in source:\n...raise_exception('System message must be at the beginning.')" } });
const SEVERO = { rifiuta: (msgs) => msgs.some((m, i) => i > 0 && m.role === 'system') };
const TOLLERANTE = { rifiuta: () => false };

/* the same fake engine as `sistema-piegato.test.mjs` (PIEGA-10): `/apply-template` is the probe, the rest answers the completion */
function motore(comportamento) {
  const chiamate = [];
  const rispondi = (percorso, corpo) => {
    if (comportamento.rifiuta(corpo.messages)) return new Response(ERRORE_QWEN, { status: 500, headers: { 'content-type': 'application/json' } });
    if (percorso === '/apply-template') return Response.json({ prompt: corpo.messages.map((m) => (typeof m.content === 'string' ? m.content : '')).join('\n') });
    return Response.json({ choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }] });
  };
  return {
    chiamate,
    dipendenze: {
      leggiChiave: () => null, leggiRuntime: () => ({}), localePronto: () => true,
      chiamaLocale: async (percorso, opzioni) => { const corpo = JSON.parse(opzioni.body); chiamate.push({ percorso, corpo }); return rispondi(percorso, corpo); },
      applicaTemplateLocale: async (opzioni) => { const corpo = JSON.parse(opzioni.body); chiamate.push({ percorso: '/apply-template', corpo }); return rispondi('/apply-template', corpo); },
    },
  };
}
const completamenti = (m) => m.chiamate.filter((c) => c.percorso === '/v1/chat/completions');
async function chiediInLocale(m, modello, messages) {
  const instradata = creaFetchMultiProvider(fetch, { dipendenze: m.dipendenze });
  return instradata('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST', headers: { Authorization: 'Bearer x' }, body: JSON.stringify({ model: `local:${modello}`, messages }),
  });
}

test('REV-M2-LOCALE-SEVERO: a strict local template receives the M2 note folded, with its <talos-note> mark intact', async () => {
  const { conNota, testo } = conLaNota();
  const m = motore(SEVERO);
  const r = await chiediInLocale(m, 'qwen-severo-rev-m2', conNota);
  assert.equal(r.status, 200, 'the folded request is accepted by the strict template');
  const [chiamata] = completamenti(m);
  assert.ok(chiamata, 'precondition: the completion reached the engine');
  const messaggi = chiamata.corpo.messages;
  assert.equal(messaggi.filter((x) => x.role === 'system').length, 1, 'only the head stays `system`');
  assert.ok(messaggi[0].content.includes(RIGA_DI_TESTA));
  const ultimo = messaggi.at(-1);
  assert.equal(ultimo.role, 'user');
  assert.ok(ultimo.content.includes(`<${SEGNO_NOTA}>\n${testo}\n</${SEGNO_NOTA}>`), `mark lost: ${JSON.stringify(ultimo.content.slice(0, 60))}`);
  assert.ok(!JSON.stringify(messaggi).includes(SEGNO_FALSO));
});

/* ------------------------------------------------------------------ cloud with fold (decision 194, `piegaNoteInCoda`) */

function controllaPiegaCloud(messaggi, testo, { conLingua }) {
  assert.equal(messaggi[0].role, 'system', 'the head stays where it is');
  assert.ok(messaggi.slice(1).every((x) => x.role !== 'system'), 'no scattered `system` after the head');
  const coda = JSON.stringify(messaggi.slice(1));
  assert.ok(coda.includes(JSON.stringify(`<${SEGNO_NOTA}>\n${testo}\n</${SEGNO_NOTA}>`).slice(1, -1)), 'the M2 note is a <talos-note> block with its mark intact');
  assert.ok(!coda.includes(SEGNO_FALSO), 'nothing looks like a forged note');
  if (conLingua) {
    assert.ok(coda.includes(JSON.stringify(`<${SEGNO_NOTA}>\n${NOTA_DELLA_LINGUA.content}\n</${SEGNO_NOTA}>`).slice(1, -1)), 'the language note is folded too, mark intact');
    assert.ok(coda.indexOf(NOTA_DELLA_LINGUA.content) < coda.indexOf(INIZIO_NOTA), 'order kept: the language note, then M2');
  }
}

test('REV-M2-CLOUD: `piegaNoteInCoda` folds the M2 note alone and right after a `system` language note, mark intact in both', () => {
  const { conNota, testo } = conLaNota();
  controllaPiegaCloud(piegaNoteInCoda(conNota), testo, { conLingua: false });
  const conLingua = [...MESSAGGI, NOTA_DELLA_LINGUA];
  const { conNota: conNotaELingua, testo: testo2 } = conLaNota(conLingua);
  assert.deepEqual(conNotaELingua.slice(-2).map((x) => x.role), ['system', 'system'], 'precondition: language note right before M2');
  controllaPiegaCloud(piegaNoteInCoda(conNotaELingua), testo2, { conLingua: true });
});

const URL_CHAT = 'https://openrouter.ai/api/v1/chat/completions';
const CHAT = () => new Response('data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
function bancoCondiviso() {
  const fuori = [];
  const dipendenze = {
    leggiChiave: () => 'k', leggiRuntime: () => ({ endpoint: 'https://openrouter.ai/api/v1' }), localePronto: () => true, ospitePronto: () => true,
    chiamaLocale: async () => CHAT(), chiamaLocaleOspite: async () => CHAT(),
  };
  const f = creaFetchMultiProvider(async (url, init) => { fuori.push({ url: String(url), corpo: JSON.parse(init.body) }); return CHAT(); }, { dipendenze });
  return { f, fuori };
}
const manda = async (b, model, messages) => (await b.f(URL_CHAT, { method: 'POST', headers: {}, body: JSON.stringify({ model, stream: true, messages }) })).text();

test('REV-M2-OPENROUTER: through the shared fetch towards OpenRouter, the M2 note (alone, and after a language note) leaves folded with its mark', async () => {
  const b = bancoCondiviso();
  const { conNota, testo } = conLaNota();
  const { conNota: conNotaELingua, testo: testo2 } = conLaNota([...MESSAGGI, NOTA_DELLA_LINGUA]);
  await manda(b, 'z-ai/glm-5.3-flash', conNota);
  await manda(b, 'z-ai/glm-5.3-flash', conNotaELingua);
  assert.equal(b.fuori.length, 2);
  controllaPiegaCloud(b.fuori[0].corpo.messages, testo, { conLingua: false });
  controllaPiegaCloud(b.fuori[1].corpo.messages, testo2, { conLingua: true });
});

/* ------------------------------------------------------------------ without fold: the behaviour of today stays the same */

async function corpoInviato(provider, model, messages) {
  let preso = null;
  const fetchFn = async (url, init) => { preso = JSON.parse(init.body); throw Object.assign(new Error('misura: fermo qui'), { name: 'MisuraFerma' }); };
  try { await nativeProviderResponse({ provider, model, apiKey: 'fixture', body: { model, messages, stream: false }, fetchFn }); } catch (e) { if (!preso) throw e; }
  return preso;
}

test('REV-M2-SENZA-PIEGA: the conversion gives back exactly the `user` <talos-note> message of before, same position and bytes', () => {
  const { conNota, formaDiPrima } = conLaNota();
  assert.deepEqual(notaDegliAccorciatiComeUtente(conNota), formaDiPrima);
  assert.equal(notaDegliAccorciatiComeUtente(MESSAGGI), MESSAGGI, 'no note: the same list');
  const altra = [...MESSAGGI, { role: 'system', content: 'Answer in Italian.' }];
  assert.equal(notaDegliAccorciatiComeUtente(altra), altra, 'another `system` note is not touched');
});

test('REV-M2-RESPONSES: ChatGPT (Responses wire) receives the same request body as before the cure', async () => {
  const { conNota, formaDiPrima, testo } = conLaNota();
  const ora = await corpoInviato('openai', 'gpt-5-mini', conNota);
  const prima = await corpoInviato('openai', 'gpt-5-mini', formaDiPrima);
  assert.deepEqual(ora, prima, 'same body, byte for byte');
  const ultimo = ora.input.at(-1);
  assert.equal(ultimo.role, 'user');
  assert.ok(JSON.stringify(ultimo).includes(JSON.stringify(`<${SEGNO_NOTA}>\n${testo}\n</${SEGNO_NOTA}>`).slice(1, -1)));
});

/* Mutant run on the cure (05/11/2026): skipping `piegaNoteInCoda` in `native-provider-adapter.mjs` survived every test above, because
   REV-M2-CLOUD calls the fold directly and REV-M2-OPENROUTER goes through the shared fetch. This one goes through the native SDK path. */
test('REV-M2-ANTHROPIC: the native Anthropic path folds the M2 note (alone, and after a language note) into the conversation, mark intact, never into `system`', async () => {
  for (const [messaggi, conLingua] of [[MESSAGGI, false], [[...MESSAGGI, NOTA_DELLA_LINGUA], true]]) {
    const { conNota, testo } = conLaNota(messaggi);
    const corpo = await corpoInviato('anthropic', 'claude-haiku-4-5', conNota);
    assert.ok(corpo && Array.isArray(corpo.messages), 'precondition: the request body reached the network');
    const sistema = JSON.stringify(corpo.system ?? '');
    assert.ok(sistema.includes('You are TALOS.'), 'the head stays in `system`');
    assert.ok(!sistema.includes(INIZIO_NOTA), 'the M2 note never lands in the `system` head');
    const filo = JSON.stringify(corpo.messages);
    assert.ok(filo.includes(JSON.stringify(`<${SEGNO_NOTA}>\n${testo}\n</${SEGNO_NOTA}>`).slice(1, -1)), 'the M2 note is a <talos-note> block, mark intact');
    assert.ok(!filo.includes(SEGNO_FALSO), 'nothing looks like a forged note');
    if (conLingua) {
      assert.ok(!sistema.includes(NOTA_DELLA_LINGUA.content), 'the language note does not go to the head either');
      assert.ok(filo.indexOf(NOTA_DELLA_LINGUA.content) < filo.indexOf(INIZIO_NOTA), 'order kept: the language note, then M2');
    }
  }
});

test('REV-M2-LOCALE-TOLLERANTE: a local engine that keeps `system` messages (Ollama; a probed tolerant template) receives the form of before', async () => {
  const { conNota, formaDiPrima } = conLaNota();
  const b = bancoCondiviso();
  await manda(b, 'ollama:m', conNota);
  await manda(b, 'ollama:m', formaDiPrima);
  assert.equal(b.fuori.length, 2, 'premise: Ollama goes through the network fetch');
  assert.deepEqual(b.fuori[0].corpo, b.fuori[1].corpo);
  assert.equal(b.fuori[0].corpo.messages.at(-1).role, 'user');

  const m = motore(TOLLERANTE);
  assert.equal((await chiediInLocale(m, 'glm-tollerante-rev-m2', conNota)).status, 200);
  assert.equal((await chiediInLocale(m, 'glm-tollerante-rev-m2', formaDiPrima)).status, 200);
  const [ora, prima] = completamenti(m);
  assert.ok(ora && prima, 'precondition: both completions reached the engine');
  assert.deepEqual(ora.corpo, prima.corpo);
  assert.equal(ora.corpo.messages.at(-1).role, 'user');
});
