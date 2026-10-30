/*
 * CONTRATTO-R30-R31 (owner 30/10/2026 notte; OK di CLI, Mobile e Performance). Un taglio per il TETTO d'uscita senza niente di usabile
 * non si ripete identico: (a) solo ragionamento ⇒ prima il ragionamento più basso, poi il tetto più alto; (b) chiamata tagliata e mai
 * partita ⇒ prima il tetto, poi il ragionamento; sui motori LOCALI sempre prima il ragionamento; il tetto sale solo dentro lo spazio vero
 * della finestra. Al massimo due passi, ognuno detto (`provider-retry`, canale `tetto-uscita`), poi PROVIDER_OUTPUT_CAP_EXHAUSTED.
 * Casi veri della campagna di Performance (GLM-5.3-flash, ragionamento alto): M r3 (vuota ×4, `length`) e F r2 (`shell` tagliato).
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import {
  talosLavora, tagliatoDalTetto, ragionamentoPiuBasso, tettoPiuAlto, prossimoPassoDelTetto, spazioPerLaRisposta,
  CODICE_TETTO_USCITA_ESAURITO, CODICI_ERRORE_DEL_GIRO, TETTO_USCITA_DI_SERIE,
} from '../src/kernel/talosHarness.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const enc = new TextEncoder();
const flusso = (fotogrammi) => new Response(new ReadableStream({ start(c) {
  for (const f of fotogrammi) c.enqueue(enc.encode(`data: ${JSON.stringify(f)}\n\n`));
  c.enqueue(enc.encode('data: [DONE]\n\n')); c.close();
} }));
const ragiona = { choices: [{ delta: { reasoning: 'penso a lungo…' } }] };
const uso = (prompt, completion) => ({ choices: [], usage: { prompt_tokens: prompt, completion_tokens: completion, total_tokens: prompt + completion } });
const fine = (motivo) => ({ choices: [{ delta: {}, finish_reason: motivo }] });
const testo = (t) => ({ choices: [{ delta: { content: t } }] });
const chiamata = (id, argomenti) => ({ choices: [{ delta: { tool_calls: [{ index: 0, id, type: 'function', function: { name: 'scrivi', arguments: argomenti } }] } }] });
const erroreGlm = { error: { code: 502, message: 'Provider returned error' }, choices: [{ index: 0, delta: {}, finish_reason: 'error' }] };

/** (a) M r3: solo ragionamento, tetto pieno */
const soloRagionamento = (tetto) => () => flusso([ragiona, fine('length'), uso(1000, tetto)]);
/** (b) col fine normale: argomenti tagliati dal tetto */
const chiamataTagliata = (tetto, id = 'call_1') => () => flusso([ragiona, chiamata(id, '{"percorso":"a.txt","contenuto":"aaa'), fine('length'), uso(1000, tetto)]);
/** (b) F r2: GLM manda un ERRORE al tetto, i token usciti sono il tetto */
const chiamataTagliataGlm = (tetto, id = 'call_1') => () => flusso([ragiona, chiamata(id, '{"percorso":"a.txt","contenuto":"aaa'), erroreGlm, uso(1000, tetto)]);
const chiamataIntera = (id) => () => flusso([chiamata(id, JSON.stringify({ percorso: 'a.txt', contenuto: 'ciao\n' })), fine('tool_calls'), uso(1000, 50)]);
const risposta = (t) => () => flusso([testo(t), fine('stop'), uso(1000, 10)]);
const rifiuto402 = () => () => new Response(JSON.stringify({ error: { code: 402, message: 'This request requires more credits, or fewer max_tokens.' } }), { status: 402, headers: { 'content-type': 'application/json' } });

function rete(...risposte) {
  const corpi = [];
  return { corpi, fetch: async (_url, opzioni) => { corpi.push(JSON.parse(opzioni.body)); const r = risposte[Math.min(corpi.length - 1, risposte.length - 1)]; return r(); } };
}
/** il motore del contesto ridotto a ciò che serve: la riserva per la risposta (il tetto di serie) */
const conRiserva = (riserva) => ({ prepare: async ({ messages }) => ({ messages, measurement: { responseReserve: riserva } }) });

async function giro(t, { risposte, modello = 'z-ai/glm-5.3-flash', riserva = TETTO_USCITA_DI_SERIE, ...extra }) {
  const cartella = cartellaDiProva('talos-tetto-uscita-');
  t.after(() => rimuoviCartellaDiProva(cartella));
  const r = rete(...risposte);
  const diario = [];
  let errore = null; let esito = null;
  try {
    esito = await talosLavora({
      cartella, task: { consegna: 'scrivi a.txt' }, modello, chiave: 'k', fetchDiRete: r.fetch, reasoning: { effort: 'high' },
      contextHooks: conRiserva(riserva), attesaRitentaMassimaMs: 1,
      onDelta: (e) => { if (e?.tipo === 'tool-annullato') diario.push(['annullato', e.toolCallId]) },
      onGiro: (e) => {
        if (e?.tipo === 'provider-retry' && e.canale === 'tetto-uscita') diario.push(['tetto', e])
        if (e?.tipo === 'attrezzo' || e?.tipo === 'esito-attrezzo') diario.push(['attrezzo', e.nome ?? e.attrezzo ?? null])
      },
      ...extra,
    });
  } catch (e) { errore = e; }
  const passi = diario.filter(([k]) => k === 'tetto').map(([, e]) => e).filter((e) => e.fase === 'invio');
  return { corpi: r.corpi, diario, passi, errore, esito, cartella };
}
const tetti = (corpi) => corpi.map((c) => c.max_tokens);
const sforzi = (corpi) => corpi.map((c) => c.reasoning?.effort ?? null);

test('TU-01 (a) solo ragionamento ×4: prima il ragionamento più basso, poi il tetto, poi l\'errore chiaro — e i campi della CLI', async (t) => {
  const g = await giro(t, { risposte: [soloRagionamento(32_000), soloRagionamento(32_000), soloRagionamento(64_000)], finestraToken: 400_000 });
  assert.deepEqual(tetti(g.corpi), [32_000, 32_000, 64_000]);
  assert.deepEqual(sforzi(g.corpi), ['high', 'medium', 'medium']);
  assert.equal(g.errore?.code, CODICE_TETTO_USCITA_ESAURITO);
  assert.match(g.errore.message, /spent its whole answer limit on reasoning/u);
  assert.deepEqual(g.passi.map((e) => [e.tentativo, e.tentativiMassimi, e.motivo, e.tettoNuovo, e.ragionamento ?? null, e.costoDiNuovo]),
    [[1, 2, 'solo-ragionamento', 32_000, { da: 'high', a: 'medium' }, true], [2, 2, 'solo-ragionamento', 64_000, null, true]]);
  for (const e of g.passi) assert.equal(Object.hasOwn(e, 'httpStatus') || Object.hasOwn(e, 'attesaMs'), false, 'niente stato HTTP né attesa (CLI)');
});

test('TU-02 (b) chiamata tagliata col fine normale: non parte, prima il tetto più alto; ordine annullato(id1) → ritento → la nuova (id2) parte UNA volta', async (t) => {
  const g = await giro(t, { risposte: [chiamataTagliata(32_000, 'call_1'), chiamataIntera('call_2'), risposta('fatto')], finestraToken: 400_000 });
  assert.equal(g.errore, null, String(g.errore?.message));
  assert.deepEqual(tetti(g.corpi), [32_000, 64_000, 32_000], 'la risposta usabile chiude la scala: si torna al tetto di serie');
  assert.deepEqual(sforzi(g.corpi), ['high', 'high', 'high']);
  const ordine = g.diario.filter(([k]) => k !== 'attrezzo').map(([k, v]) => (k === 'tetto' ? `tetto-${v.fase}` : `${k}-${v}`));
  assert.deepEqual(ordine.slice(0, 2), ['annullato-call_1', 'tetto-invio'], 'la carta annullata PRIMA del ritento');
  assert.equal(g.passi[0].motivo, 'chiamata-tagliata');
  assert.equal(readFileSync(join(g.cartella, 'a.txt'), 'utf8'), 'ciao\n', 'scritto dalla chiamata intera');
  assert.ok(g.diario.some(([k, v]) => k === 'tetto' && v.fase === 'fine'), 'la riga del ritento si chiude');
});

test('TU-03 (b) F r2: GLM manda un errore al tetto (nessun «length»): lo dicono i token usciti — rinvio col tetto più alto, non «riprendi a mano»', async (t) => {
  const g = await giro(t, { risposte: [chiamataTagliataGlm(32_000), chiamataIntera('call_2'), risposta('fatto')], finestraToken: 400_000 });
  assert.equal(g.errore, null, String(g.errore?.message));
  assert.deepEqual(tetti(g.corpi).slice(0, 2), [32_000, 64_000]);
  assert.equal(g.diario[0][0], 'annullato');
  assert.ok(existsSync(join(g.cartella, 'a.txt')));
});

test('TU-04 (b) col tetto già al limite del modello: il passo del tetto si salta e scende il ragionamento', async (t) => {
  const g = await giro(t, { risposte: [chiamataTagliata(32_000), chiamataIntera('call_2'), risposta('fatto')], limiteUscitaDelModello: 32_000, finestraToken: 400_000 });
  assert.deepEqual(tetti(g.corpi).slice(0, 2), [32_000, 32_000]);
  assert.deepEqual(sforzi(g.corpi).slice(0, 2), ['high', 'medium']);
});

test('TU-05 motore LOCALE (owner, proposta del Mobile): anche la chiamata tagliata abbassa prima il ragionamento, e non dice «costa di nuovo»', async (t) => {
  const g = await giro(t, { modello: 'local:qwen3', riserva: 4_096, risposte: [chiamataTagliata(4_096), chiamataIntera('call_2'), risposta('fatto')], finestraToken: 32_768 });
  assert.deepEqual(sforzi(g.corpi).slice(0, 2), ['high', 'medium']);
  assert.deepEqual(tetti(g.corpi).slice(0, 2), [4_096, 4_096]);
  assert.equal(g.passi[0].costoDiNuovo, false);
});

test('TU-06 lo spazio vero della finestra: se il prompt la riempie, il tetto non sale (meno di +50%) e la scala va dritta al ragionamento o all\'errore', async (t) => {
  // finestra 34.000, prompt 1.000 ⇒ spazio 32.744: meno di 48.000 ⇒ niente passo del tetto
  const g = await giro(t, { risposte: [chiamataTagliata(32_000), chiamataTagliata(32_000)], finestraToken: 34_000 });
  assert.deepEqual(tetti(g.corpi), [32_000, 32_000]);
  assert.deepEqual(sforzi(g.corpi), ['high', 'medium']);
  assert.equal(g.errore?.code, CODICE_TETTO_USCITA_ESAURITO);
  assert.match(g.errore.message, /tool call was cut/u);
  assert.deepEqual(g.errore.passiDelTetto, ['ragionamento']);
});

test('TU-07 (CLI) un 402 subito dopo il tetto ALZATO torna una volta al tetto di prima; dopo un passo che ha solo abbassato il ragionamento, no', async (t) => {
  const g = await giro(t, { risposte: [chiamataTagliata(32_000), rifiuto402(), chiamataIntera('call_2'), risposta('fatto')], finestraToken: 400_000 });
  assert.equal(g.errore, null, String(g.errore?.message));
  assert.deepEqual(tetti(g.corpi).slice(0, 3), [32_000, 64_000, 32_000]);
  assert.ok(g.diario.some(([k, v]) => k === 'tetto' && v.motivo === 'credito'));
  const r = await giro(t, { risposte: [soloRagionamento(32_000), rifiuto402()], finestraToken: 400_000 });
  assert.notEqual(r.errore?.code, CODICE_TETTO_USCITA_ESAURITO);
  assert.match(String(r.errore?.message), /HTTP 402/u, 'il 402 dopo il solo ragionamento resta quello che è');
  assert.equal(r.corpi.length, 2);
});

test('TU-08 AL CONTRARIO: testo tagliato dal tetto continua come prima (F-ENG-4); vuota senza tetto resta la scala della risposta vuota', async (t) => {
  const conTesto = await giro(t, { risposte: [() => flusso([testo('prima metà'), fine('length'), uso(1000, 32_000)]), risposta(' fine')], finestraToken: 400_000 });
  assert.equal(conTesto.passi.length, 0);
  assert.deepEqual(tetti(conTesto.corpi), [32_000, 32_000]);
  const vuota = await giro(t, { risposte: [() => flusso([ragiona, fine('stop'), uso(1000, 7)]), risposta('ok')], finestraToken: 400_000 });
  assert.equal(vuota.passi.length, 0);
  assert.deepEqual(sforzi(vuota.corpi), ['high', 'high']);
});

test('TU-09 le funzioni pure: taglio, ragionamento, tetto, ordine, spazio, codici', () => {
  assert.equal(tagliatoDalTetto({ finishReason: 'length' }), true);
  assert.equal(tagliatoDalTetto({ nativeFinishReason: 'MAX_TOKENS' }), true);
  assert.equal(tagliatoDalTetto({ usage: { completion_tokens: 16_384 }, tettoInviato: 16_384 }), true);
  assert.equal(tagliatoDalTetto({ usage: { completion_tokens: 900 }, tettoInviato: 16_384 }), false);
  assert.equal(tagliatoDalTetto({ usage: { completion_tokens: 900 } }), false, 'senza tetto inviato i token non provano niente');
  assert.deepEqual(ragionamentoPiuBasso({ effort: 'xhigh', exclude: true }), { effort: 'high', exclude: true });
  assert.equal(ragionamentoPiuBasso({ effort: 'low' }), null);
  assert.equal(ragionamentoPiuBasso({ max_tokens: 2000 }), null);
  assert.equal(ragionamentoPiuBasso(null), null);
  assert.equal(tettoPiuAlto(16_384), 32_768);
  assert.equal(tettoPiuAlto(4_096), 32_000, 'almeno quello di serie');
  assert.equal(tettoPiuAlto(32_000, 40_000), 40_000);
  assert.equal(tettoPiuAlto(32_000, 32_000), null);
  assert.equal(prossimoPassoDelTetto({ caso: 'attrezzo', tettoInviato: 32_000, ragionamento: { effort: 'high' } }).tipo, 'tetto');
  assert.equal(prossimoPassoDelTetto({ caso: 'ragionamento', tettoInviato: 32_000, ragionamento: { effort: 'high' } }).tipo, 'ragionamento');
  assert.equal(prossimoPassoDelTetto({ caso: 'attrezzo', locale: true, tettoInviato: 4_096, ragionamento: { effort: 'high' } }).tipo, 'ragionamento');
  assert.equal(prossimoPassoDelTetto({ caso: 'attrezzo', fatti: ['tetto', 'ragionamento'], tettoInviato: 1 }), null, 'mai più di due passi');
  assert.equal(spazioPerLaRisposta(34_000, { prompt_tokens: 1_000 }), 32_744);
  assert.equal(spazioPerLaRisposta(null, { prompt_tokens: 1 }), null);
  assert.ok(CODICI_ERRORE_DEL_GIRO.includes(CODICE_TETTO_USCITA_ESAURITO) && Object.isFrozen(CODICI_ERRORE_DEL_GIRO));
});

test('TU-10 il ragionamento abbassato vale per quella richiesta sola: dopo una risposta usabile torna quello della sessione', async (t) => {
  const g = await giro(t, { risposte: [soloRagionamento(32_000), chiamataIntera('call_2'), risposta('fatto')], finestraToken: 400_000 });
  assert.equal(g.errore, null, String(g.errore?.message));
  assert.deepEqual(sforzi(g.corpi), ['high', 'medium', 'high']);
});

test('TU-11 (CLI) la sequenza intera del caso (b): inizio(id1) → annullata(id1) → ritento → inizio(id2) → esito(id2), e lo strumento gira UNA volta', async (t) => {
  const cartella = cartellaDiProva('talos-tetto-sequenza-');
  t.after(() => rimuoviCartellaDiProva(cartella));
  const r = rete(chiamataTagliata(32_000, 'call_1'), chiamataIntera('call_2'), risposta('fatto'));
  const seq = [];
  await talosLavora({ cartella, task: { consegna: 'scrivi a.txt' }, modello: 'z-ai/glm-5.3-flash', chiave: 'k', fetchDiRete: r.fetch, reasoning: { effort: 'high' },
    contextHooks: conRiserva(TETTO_USCITA_DI_SERIE), finestraToken: 400_000,
    onDelta: (e) => { if (e?.tipo === 'tool-inizio') seq.push(`inizio:${e.toolCallId}`); else if (e?.tipo === 'tool-annullato') seq.push(`annullata:${e.toolCallId}`); },
    onGiro: (e) => {
      if (e?.tipo === 'provider-retry' && e.canale === 'tetto-uscita' && e.fase === 'invio') seq.push('ritento');
      else if (e?.tipo === 'tool-esito') seq.push(`esito:${e.toolCallId}`);
    } });
  assert.deepEqual(seq, ['inizio:call_1', 'annullata:call_1', 'ritento', 'inizio:call_2', 'esito:call_2']);
  assert.equal(readFileSync(join(cartella, 'a.txt'), 'utf8'), 'ciao\n');
});
