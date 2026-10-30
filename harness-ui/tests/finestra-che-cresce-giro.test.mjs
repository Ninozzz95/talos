/*
 * ⭐ L1 1.3, revisione blocco 4 (26/10/2026) — la finestra che cresce lungo il GIRO INTERO: kernel desktop (`talosLavora`) + adattatore vero
 *   (`creaFetchMultiProvider`) + un motore locale finto che conta i token come llama-server e si allarga davvero. Il banco è quello delle
 *   prove rosse del revisore (`revisione-blocco-4-prove-2026-10-26/A1-giro-intero.test.mjs`), con in più la finestra viva che il registro
 *   passa al giro (`finestraLocale`: attuale / puoCrescere / cresci).
 *   - A-3 (owner A1-1, «Tutte e due, visibili»): alla soglia del 75% la finestra si allarga PRIMA di riassumere;
 *   - A-4: allargata a metà giro, le soglie seguono la finestra nuova e il passo dopo non riassume;
 *   - «Chiedimi»: niente riassunto senza la persona;
 *   - AL CONTRARIO: non si può crescere ⇒ il riassunto di sempre; senza `finestraLocale` (la CLI, i modelli in cloud) ⇒ com'era.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { talosLavora } from '../src/kernel/talosHarness.desktop-hotfix.mjs';
import { stimaTokenConversazione as stima } from '../src/kernel/talosHarness.mjs';
import { creaFetchMultiProvider } from '../src/runtime-owner-adapter.mjs';
import { prossimoGradino } from '../src/finestra-che-cresce.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const MASSIMO = 131_072;
const storia = (coppie, lunghezza = 1600) => Array.from({ length: coppie }, (_, i) => [
  { role: 'user', content: `Domanda ${i}: ${'parola '.repeat(lunghezza / 7)}` },
  { role: 'assistant', content: `Risposta ${i}: ${'parola '.repeat(lunghezza / 7)}` },
]).flat();

function motoreFinto({ nCtx = 16_384, fattore = 1, passiAttrezzo = 0, crescita = 'sale' } = {}) {
  const stato = { nCtx, chiamate: [], riassunti: 0, allargamenti: [], crescite: [] };
  const conta = (corpo) => Math.ceil(stima(corpo.messages) * fattore);
  const chiamaLocale = async (_percorso, opzioni) => {
    const corpo = JSON.parse(opzioni.body);
    const n = conta(corpo);
    const eRiassunto = !corpo.tools?.length;
    stato.chiamate.push({ n, nCtx: stato.nCtx, riassunto: eRiassunto });
    if (n > stato.nCtx) {
      return new Response(JSON.stringify({ error: { code: 400, message: 'the request exceeds the available context size, try increasing it', type: 'exceed_context_size_error', n_prompt_tokens: n, n_ctx: stato.nCtx } }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    if (eRiassunto) {
      stato.riassunti += 1;
      return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: '## Riassunto\nIn breve: parole.' }, finish_reason: 'stop' }], usage: { prompt_tokens: n, completion_tokens: 10 } });
    }
    const passiFatti = stato.chiamate.filter((c) => !c.riassunto && c.n <= c.nCtx).length;
    if (passiFatti <= passiAttrezzo) {
      return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: null, tool_calls: [{ id: `c${passiFatti}`, type: 'function', function: { name: 'leggi', arguments: '{"percorso":"grande.txt"}' } }] }, finish_reason: 'tool_calls' }], usage: { prompt_tokens: n, completion_tokens: 5 } });
    }
    return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'fatto' }, finish_reason: 'stop' }], usage: { prompt_tokens: n, completion_tokens: 1 } });
  };
  const dipendenze = {
    leggiChiave: () => null, leggiRuntime: () => ({}), localePronto: () => true, chiamaLocale,
    /* il soccorso sul rifiuto (la prima tappa): quanto serve × 1,5, come `finestraDaAprire` */
    allargaFinestraLocale: async ({ servono }) => {
      stato.allargamenti.push(servono);
      const prima = stato.nCtx;
      stato.nCtx = Math.max(Math.ceil((servono * 1.5) / 4096) * 4096, prima + 4096);
      return { ok: true, prima, dopo: stato.nCtx, massimo: MASSIMO, memoriaInPiu: null, nome: 'finto' };
    },
  };
  /* la finestra viva come la costruisce il registro (`finestraLocaleDelGiro`) col modulo vero della scala */
  const finestraLocale = {
    attuale: () => stato.nCtx,
    puoCrescere: async () => crescita !== 'massimo' && crescita !== 'riassumi' && prossimoGradino({ prima: stato.nCtx, massimo: MASSIMO }) !== null,
    cresci: async ({ servono }) => {
      stato.crescite.push(servono);
      if (crescita === 'chiedi') return { ok: false, motivo: 'chiedi', prima: stato.nCtx, dopo: prossimoGradino({ prima: stato.nCtx, massimo: MASSIMO }) };
      if (crescita !== 'sale') return { ok: false, motivo: crescita === 'massimo' ? 'gia-al-massimo' : 'scelta' };
      const prima = stato.nCtx;
      stato.nCtx = prossimoGradino({ prima, massimo: MASSIMO });
      return { ok: true, prima, dopo: stato.nCtx, proattiva: true };
    },
  };
  return { stato, finestraLocale, fetchDiRete: creaFetchMultiProvider(fetch, { dipendenze }) };
}

async function giro(t, { messaggi, motore, conFinestraLocale = true, istantanea = false }) {
  const cartella = mkdtempSync(join(tmpdir(), 'fc-giro-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  writeFileSync(join(cartella, 'grande.txt'), 'riga del file grande da leggere.\n'.repeat(200));
  const eventi = [];
  let errore = null;
  try {
    await talosLavora({ cartella, modello: 'local:m1', chiave: 'finta', task: { consegna: 'x' }, messaggiIniziali: messaggi, scartoMisurato: 0,
      contestoDelProgetto: 'Project files:\n', fetchDiRete: motore.fetchDiRete, permessi: 'Full access', finestraToken: motore.stato.nCtx,
      ...(conFinestraLocale ? { finestraLocale: motore.finestraLocale } : {}), ...(istantanea ? { compattazioneIstantanea: true } : {}),
      onGiro: (e) => { if (String(e?.tipo).startsWith('compattazione-') && e.tipo !== 'compattazione-progresso') eventi.push(`${e.tipo}:${e.motivo ?? e.fase ?? ''}`); } });
  } catch (e) { errore = e; }
  return { errore, eventi };
}

/* ~13.000 token stimati su 16.384: sopra la soglia del 75% (12.288), sotto la finestra */
const sopraLaSoglia = () => [...storia(16), { role: 'user', content: 'Continua.' }];

test('FC-GIRO-01 (A-3) alla soglia si ALLARGA, non si riassume: un gradino, e la richiesta parte intera', async (t) => {
  const messaggi = sopraLaSoglia();
  const s = stima(messaggi);
  assert.ok(s > 12_288 && s < 16_384, `premessa: stima ${s} fra la soglia e la finestra`);
  const motore = motoreFinto();
  const r = await giro(t, { messaggi, motore });
  assert.equal(r.errore, null, r.errore?.message);
  assert.equal(motore.stato.riassunti, 0, `riassunto partito (eventi ${JSON.stringify(r.eventi)})`);
  assert.equal(motore.stato.crescite.length, 1, 'una crescita sola');
  assert.equal(motore.stato.nCtx, 24_576, 'sotto 64K: ×1,5');
  assert.equal(motore.stato.chiamate.length, 1, 'la richiesta è partita una volta, intera, sulla finestra nuova');
});

test('FC-GIRO-02 (A-4) allargata sul rifiuto a metà giro, il passo dopo dello STESSO giro non riassume con la finestra vecchia', async (t) => {
  const messaggi = [...storia(15), { role: 'user', content: 'Continua.' }];
  const motore = motoreFinto({ fattore: 1.4, passiAttrezzo: 1 });
  const r = await giro(t, { messaggi, motore });
  assert.equal(r.errore, null, r.errore?.message);
  assert.equal(motore.stato.allargamenti.length, 1, `premessa: allargata una volta sul rifiuto (${JSON.stringify(motore.stato.chiamate)})`);
  assert.equal(motore.stato.riassunti, 0, `il passo dopo ha riassunto (eventi ${JSON.stringify(r.eventi)}, chiamate ${JSON.stringify(motore.stato.chiamate)})`);
  /* e nemmeno una seconda crescita: con le soglie che seguono la finestra il passo dopo sta sotto la soglia nuova (mutante M6) */
  assert.equal(motore.stato.crescite.length, 0, `una seconda riapertura per niente: ${JSON.stringify(motore.stato.crescite)}`);
});

test('FC-GIRO-03 «Chiedimi» alla soglia: nessun riassunto senza la persona, la richiesta parte (ci sta ancora)', async (t) => {
  const motore = motoreFinto({ crescita: 'chiedi' });
  const r = await giro(t, { messaggi: sopraLaSoglia(), motore });
  assert.equal(r.errore, null, r.errore?.message);
  assert.equal(motore.stato.riassunti, 0, JSON.stringify(r.eventi));
  assert.equal(motore.stato.nCtx, 16_384, 'niente riaperto da solo');
});

test('FC-GIRO-04 AL CONTRARIO: la finestra non può crescere (già al massimo) ⇒ il riassunto di sempre', async (t) => {
  const motore = motoreFinto({ crescita: 'massimo' });
  const r = await giro(t, { messaggi: sopraLaSoglia(), motore });
  assert.equal(r.errore, null, r.errore?.message);
  assert.ok(motore.stato.riassunti >= 1, `doveva riassumere (eventi ${JSON.stringify(r.eventi)})`);
});

test('FC-GIRO-05 AL CONTRARIO: senza la finestra viva (la CLI, un modello in cloud) il giro è com\'era — riassume alla soglia', async (t) => {
  const motore = motoreFinto();
  const r = await giro(t, { messaggi: sopraLaSoglia(), motore, conFinestraLocale: false });
  assert.equal(r.errore, null, r.errore?.message);
  assert.ok(motore.stato.riassunti >= 1, JSON.stringify(r.eventi));
  assert.equal(motore.stato.crescite.length, 0);
});

/* Nota: il riassunto preparato in sottofondo (l'istantanea) non c'è sui modelli `local:` — `motoreAPostoUnico` la spegne
   (talosHarness.desktop-hotfix.mjs, `istantanea:`) — quindi non può contendere il motore alla crescita. */
