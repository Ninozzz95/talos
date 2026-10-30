// Owner 28/10/2026 (cache dei prompt, punto 2; contratto con la CLI): il giro dice quando la cache del fornitore riparte da capo, e perché.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { improntaDellaRichiesta, motivoDellaCacheRicominciata, talosLavora } from '../src/kernel/talosHarness.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const attrezzo = (name) => ({ type: 'function', function: { name, parameters: { type: 'object' } } });
const base = [{ role: 'system', content: 'You are a coding agent.' }, { role: 'user', content: 'ciao' }, { role: 'assistant', content: 'ciao!' }];
const imp = (o = {}) => improntaDellaRichiesta({ modello: 'm', messaggi: base, attrezzi: [attrezzo('leggi')], ...o });
const conCache = (i, extra = {}) => ({ ...i, tokenDaCache: 0, at: 1_000, durataMs: 300_000, ...extra });

test('CACHE-RICOMINCIATA-01 — i motivi, nell\'ordine del contratto: modello, attrezzi, attrezzi caricati in coda, sistema, compattazione', () => {
  const prima = conCache(imp());
  assert.equal(motivoDellaCacheRicominciata(prima, imp()), null, 'stessa impronta, nessuna rottura');
  assert.equal(motivoDellaCacheRicominciata(prima, imp({ modello: 'altro' })), 'modello');
  assert.equal(motivoDellaCacheRicominciata(prima, imp({ attrezzi: [attrezzo('scrivi')] })), 'attrezzi');
  assert.equal(motivoDellaCacheRicominciata(prima, imp({ attrezzi: [attrezzo('leggi'), attrezzo('cerca')] })), 'attrezzi-caricati', 'il ponte aggiunge in coda');
  assert.equal(motivoDellaCacheRicominciata(prima, imp({ attrezzi: [attrezzo('cerca'), attrezzo('leggi')] })), 'attrezzi', 'aggiunto davanti: non è un caricamento in coda');
  assert.equal(motivoDellaCacheRicominciata(prima, imp({ messaggi: [{ role: 'system', content: 'Other.' }, ...base.slice(1)] })), 'sistema');
  assert.equal(motivoDellaCacheRicominciata(prima, imp({ messaggi: [base[0], { role: 'user', content: '## Summary' }] })), 'compattazione', 'la storia di prima non è più un prefisso');
});

test('CACHE-RICOMINCIATA-02 — la storia che CRESCE e le note in coda alla richiesta non rompono niente', () => {
  const prima = conCache(imp({ messaggi: [...base, { role: 'system', content: "The person's last message is in Persian: reply in Persian." }] }));
  const dopo = imp({ messaggi: [...base, { role: 'user', content: 'ancora' }, { role: 'system', content: 'Plan mode is on.' }] });
  assert.equal(motivoDellaCacheRicominciata(prima, dopo), null);
});

test('CACHE-RICOMINCIATA-03 — stessa impronta e il fornitore rilegge 0 dopo averne riletti: «pausa» oltre la durata del marcatore, «sconosciuto» prima', () => {
  const prima = conCache(imp(), { tokenDaCache: 9_000, at: 0, durataMs: 300_000 });
  assert.equal(motivoDellaCacheRicominciata(prima, imp(), { tokenDaCache: 0, ora: 301_000 }), 'pausa');
  assert.equal(motivoDellaCacheRicominciata(prima, imp(), { tokenDaCache: 0, ora: 60_000 }), 'sconosciuto');
  assert.equal(motivoDellaCacheRicominciata(prima, imp(), { tokenDaCache: 8_000, ora: 60_000 }), null, 'riletti: niente da dire');
  assert.equal(motivoDellaCacheRicominciata(conCache(imp()), imp(), { tokenDaCache: 0, ora: 60_000 }), null, 'un fornitore che non ha mai riletto niente non «ricomincia»');
});

/** Un fornitore finto: la prima richiesta chiama un attrezzo, poi risponde; dichiara i token letti dalla cache scelti dalla prova. */
function fornitore(cache = []) {
  let n = 0;
  return async () => {
    n += 1;
    const messaggio = n === 1
      ? { role: 'assistant', content: null, tool_calls: [{ id: 'k1', type: 'function', function: { name: 'elenca', arguments: '{"percorso":"."}' } }] }
      : { role: 'assistant', content: 'fatto' };
    return Response.json({ choices: [{ message: messaggio, finish_reason: n === 1 ? 'tool_calls' : 'stop' }],
      usage: { prompt_tokens: 5_000, completion_tokens: 3, prompt_tokens_details: { cached_tokens: cache[n - 1] ?? 0 } } });
  };
}
async function giro(t, opzioni) {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-cache-ric-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const eventi = [];
  const esito = await talosLavora({ cartella, task: { consegna: 'elenca' }, modello: 'z-ai/glm-5.3-flash', chiave: 'k',
    onGiro: (e) => { if (e?.tipo === 'cache-ricominciata') eventi.push(e); }, ...opzioni });
  return { esito, eventi };
}

test('CACHE-RICOMINCIATA-04 — dal giro vero: niente evento quando la storia cresce; il giro restituisce lo stato per il giro dopo; un cambio di modello al giro dopo si dice', async (t) => {
  const primo = await giro(t, { fetchDiRete: fornitore([0, 4_000]) });
  assert.deepEqual(primo.eventi, [], 'la seconda richiesta allunga la prima: la cache regge');
  assert.ok(Array.isArray(primo.esito.statoCache?.messaggi) && primo.esito.statoCache.tokenDaCache === 4_000, 'lo stato della cache esce dal giro');
  const secondo = await giro(t, { fetchDiRete: fornitore([0, 0]), modello: 'z-ai/glm-5.3', statoCachePrecedente: primo.esito.statoCache,
    messaggiIniziali: [...primo.esito.messaggiFinali, { role: 'user', content: 'ancora' }] });
  assert.equal(secondo.eventi[0]?.motivo, 'modello');
  assert.equal(secondo.eventi[0]?.tokenDaRileggere, 5_000);
  assert.match(secondo.eventi[0]?.at ?? '', /^\d{4}-\d\d-\d\dT/u);
});

test('CACHE-RICOMINCIATA-05 — dal giro vero: la cache riletta e poi persa nello stesso giro, senza cambi, si dice «sconosciuto»', async (t) => {
  const r = await giro(t, { fetchDiRete: fornitore([3_000, 0]) });
  assert.deepEqual(r.eventi.map((e) => e.motivo), ['sconosciuto']);
});
