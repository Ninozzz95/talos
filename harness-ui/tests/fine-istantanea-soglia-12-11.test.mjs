/*
 * Giudice v1597 (c), 12/11/2026: la riga di fine ISTANTANEA all'emergenza porta anche la linea d'emergenza (`soglia`), campo nuovo e
 * facoltativo. Misura del revisore della linea (RAPPORTO-REVISORE-LINEA-PASSO-3, «Ripasso corto»): con un riassunto del modello già
 * pronto, all'emergenza il nucleo scrive SOLO `compattazione-fine` con `istantanea:true, motivo:'emergenza'` e nessun
 * `compattazione-inizio` (agent-service.mjs: «lo scambio istantaneo non ha un compattazione-inizio»), quindi la linea che ha agito
 * non la diceva nessuna riga e la CLI non poteva dirla. Ora la dice la riga stessa, dal vivo (`onGiro`) e nel giornale.
 * Precedenti: pi mette il motivo nella fine della compattazione stessa (`compaction_end` con `reason`,
 * pi-mono packages/coding-agent/src/core/agent-session.ts:213-219); Hermes dice la soglia su cui ha agito
 * (agent/context_compressor.py:3385-3391, «over the compression threshold (~%s of %s tokens)»).
 * AL CONTRARIO: alla soglia e sul rifiuto del fornitore la riga resta com'era (nessun `soglia`).
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';

import { avviaSessione } from '../src/agent-service.mjs';
import * as compattazione from '../src/kernel/compattazione-desktop.mjs';
import { talosLavora } from '../src/kernel/talosHarness.desktop-hotfix.mjs';
import { stimaTokenConversazione as stima } from '../src/kernel/talosHarness.mjs';

const { rimuoviCartellaDiProva } = await import('./aiuto/rimuovi-cartella-di-prova.mjs');
/* Giudice v1605: ogni cartella di prova si toglie alla fine del file (una corsa col TEMP vero ne aveva lasciate 75 nel TEMP dell'owner).
   A fine file e non a fine prova: la preparazione in sottofondo del giro 1 può ancora scrivere nella sua cartella. */
const cartelleDiProva = [];
const cartellaDiProva = (prefisso) => { const cartella = mkdtempSync(join(tmpdir(), prefisso)); cartelleDiProva.push(cartella); return cartella; };
after(() => { for (const cartella of cartelleDiProva.splice(0)) rimuoviCartellaDiProva(cartella); });

const coppia = (i, parole) => [{ role: 'user', content: `Domanda ${i}: ${'parola '.repeat(parole)}` }, { role: 'assistant', content: `Risposta ${i}: ${'parola '.repeat(parole)}` }];
const unita = stima(coppia(0, 120));
const storia = (token, da = 0) => Array.from({ length: Math.max(1, Math.round(token / unita)) }, (_, i) => coppia(da + i, 120)).flat();
const testo = (c) => Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: c }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10 } });
const fornitore = ({ rifiutaUnaVolta = false } = {}) => {
  let rifiutato = false;
  return async (_u, o) => {
    const corpo = JSON.parse(o.body);
    if (!corpo.tools?.length) return testo(`## Riassunto\n${'Dettaglio. '.repeat(20)}`);
    if (rifiutaUnaVolta && !rifiutato) {
      rifiutato = true;
      return Response.json({ error: { code: 'context_length_exceeded', message: "This endpoint's maximum context length is 8192 tokens." } }, { status: 400 });
    }
    return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'fatto' }, finish_reason: 'stop' }], usage: { prompt_tokens: stima(corpo.messages), completion_tokens: 1 } });
  };
};
const TETTO = 4000;
const comune = () => ({ cartella: cartellaDiProva('fine-istantanea-'), modello: 'z-ai/glm-5.3-flash', chiave: 'finta', contestoDelProgetto: 'Project files:\n',
  scartoMisurato: 0, tettoCompattazioneToken: TETTO });

/** Giro 1 prepara il riassunto del modello (a `frazione` della soglia, sopra l avviso dell 80%); giro 2 parte a `token` col riassunto già arrivato. Le righe di compattazione del giro 2. */
async function righeDelGiro2({ token = null, rifiutaUnaVolta = false, frazione = 0.95 }) {
  const variabile = process.env[compattazione.VARIABILE_TETTO_TOKEN];
  delete process.env[compattazione.VARIABILE_TETTO_TOKEN];
  try {
    const soglie = compattazione.calcolaSoglie({ tettoToken: TETTO });
    const uno = await talosLavora({ ...comune(), task: { consegna: 'Continua.' }, messaggiIniziali: storia(soglie.soglia * frazione), compattazioneIstantanea: true, fetchDiRete: fornitore() });
    const pronta = uno.compattazionePronta ?? await uno.compattazioneInPreparazione;
    assert.ok(pronta, 'il giro 1 ha preparato il riassunto');
    const firma = { coveredThrough: pronta.record.coveredThrough, impronta: pronta.impronta, base: pronta.base };
    const gia = stima(uno.messaggiFinali);
    const messaggi = [...uno.messaggiFinali, ...(token ? storia(Math.max(unita, token - gia), 1000) : []), { role: 'user', content: 'Vai avanti.' }];
    const righe = [];
    await talosLavora({ ...comune(), task: { consegna: 'x' }, messaggiIniziali: messaggi, fetchDiRete: fornitore({ rifiutaUnaVolta }),
      compattazioneInArrivo: Object.assign(Promise.resolve(pronta), { firma }),
      onGiro: (e) => { if (e?.tipo === 'compattazione-inizio' || e?.tipo === 'compattazione-fine') righe.push(e); } });
    return { soglie, righe };
  } finally { if (variabile !== undefined) process.env[compattazione.VARIABILE_TETTO_TOKEN] = variabile; }
}

test('FINE-ISTANTANEA-SOGLIA — all emergenza la fine istantanea dice la linea d emergenza del nucleo (`soglia`), senza nessun inizio', async () => {
  const { soglie, righe } = await righeDelGiro2({ token: compattazione.calcolaSoglie({ tettoToken: TETTO }).emergenza * 1.05 });
  assert.equal(righe.some((r) => r.tipo === 'compattazione-inizio'), false, 'lo scambio istantaneo non ha un inizio');
  const fine = righe.find((r) => r.tipo === 'compattazione-fine' && r.compattato === true);
  assert.equal(fine?.istantanea, true);
  assert.equal(fine?.motivo, 'emergenza');
  assert.equal(fine?.soglia, soglie.emergenza, `la linea che ha agito: ${JSON.stringify({ ...fine, record: undefined })}`);
  assert.equal(soglie.emergenza, 4800, 'tetto 4000 senza finestra: 1,2 × il tetto');
});

test('FINE-ISTANTANEA-SOGLIA AL CONTRARIO — alla soglia e sul rifiuto del fornitore la fine istantanea resta com era: nessun `soglia`', async () => {
  const s = compattazione.calcolaSoglie({ tettoToken: TETTO });
  const allaSoglia = (await righeDelGiro2({ token: (s.soglia + s.emergenza) / 2 })).righe.find((r) => r.tipo === 'compattazione-fine' && r.compattato === true);
  assert.equal(allaSoglia?.istantanea, true);
  assert.equal(allaSoglia?.motivo, 'soglia');
  assert.equal('soglia' in allaSoglia, false);
  const sulRifiuto = (await righeDelGiro2({ rifiutaUnaVolta: true, frazione: 0.85 })).righe.find((r) => r.tipo === 'compattazione-fine' && r.compattato === true);
  assert.equal(sulRifiuto?.istantanea, true);
  assert.equal(sulRifiuto?.motivo, 'overflow');
  assert.equal('soglia' in sulRifiuto, false);
});

test('FINE-ISTANTANEA-SOGLIA — il giornale tiene la `soglia` della fine istantanea all emergenza; solo un intero positivo, solo lì', async () => {
  const eventi = [];
  const record = compattazione.creaRecord({ coveredThrough: 5, riassunto: [{ role: 'user', content: 'R' }], tokenPrima: 5_160, tokenDopo: 2_580, misura: 'stimato', at: '2026-11-12T00:00:00.000Z', modello: 'z-ai/glm-5.3-flash' });
  await avviaSessione({
    cartella: cartellaDiProva('fine-istantanea-giornale-'), task: { consegna: 'prova' }, modello: 'm', chiave: 'k',
    onEvento: (e) => { eventi.push(e); },
    talosLavoraFn: async ({ onGiro }) => {
      onGiro({ giro: 1, tipo: 'compattazione-fine', compattato: true, record, istantanea: true, motivo: 'emergenza', soglia: 4_800 });
      onGiro({ giro: 2, tipo: 'compattazione-fine', compattato: true, record, istantanea: true, motivo: 'emergenza', soglia: '4800' });
      onGiro({ giro: 3, tipo: 'compattazione-fine', compattato: true, record, istantanea: true, motivo: 'emergenza', soglia: 0 });
      onGiro({ giro: 4, tipo: 'compattazione-fine', compattato: true, record, istantanea: true, motivo: 'soglia', soglia: 4_000 });
      onGiro({ giro: 5, tipo: 'compattazione-inizio', tokenMisurati: 5_160, soglia: 4_800, motivo: 'emergenza' });
      onGiro({ giro: 5, tipo: 'compattazione-fine', compattato: true, record, soglia: 4_800 });
      onGiro({ giro: 6, tipo: 'compattazione-fine', compattato: true, record, istantanea: true, motivo: 'emergenza' });
      return { comeFinita: 'concluso', detto: 'fatto', messaggiFinali: [], recordDiCompattazione: [record] };
    },
  });
  const fini = eventi.filter((e) => e.type === 'CUSTOM' && e.name === 'talos.compattazione' && e.value.fase === 'fine').map((e) => e.value);
  assert.equal(fini.length, 6);
  assert.equal(fini[0].soglia, 4_800, 'la linea d emergenza dello scambio istantaneo arriva al giornale');
  assert.equal('soglia' in fini[1], false, 'una stringa non è una linea');
  assert.equal('soglia' in fini[2], false, 'zero non è una linea');
  assert.equal('soglia' in fini[3], false, 'alla soglia la riga resta com era');
  assert.equal('soglia' in fini[4], false, 'una fine normale resta com era: la linea sta nel suo inizio');
  assert.equal('soglia' in fini[5], false, 'un nucleo che non la scrive: il giornale non la inventa');
  assert.equal(fini[0].motivo, 'emergenza');
});
