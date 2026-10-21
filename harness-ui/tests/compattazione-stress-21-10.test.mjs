/*
 * Owner, 21/10/2026: «fai in modo che sta maledetta compattazione non dia più problemi sia con modelli locali che api key».
 * Banco di stress DETERMINISTICO della compattazione (ledger `LEDGER-COMPATTAZIONE-ROBUSTA-2026-10-21.md` §3, cura 3): il riassuntore
 * finto riproduce i guasti veri visti nei giornali e negli inventari di CLI e Mobile, per ogni motivo (soglia, overflow) e con la
 * finestra nota o ignota. Invarianti, per OGNI caso:
 *   I1 il giro CONCLUDE (owner 12/10: un errore di compattazione non ferma MAI la chat);
 *   I2 ogni compattazione tentata chiude con un evento `compattazione-fine` (mai muta);
 *   I3 un riassunto scartato non diventa la storia: se `compattato: true` senza `ripiego`, il riassunto è quello buono.
 * Ermetico: nessuna rete, nessuna porta.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { talosLavora } from '../src/kernel/talosHarness.desktop-hotfix.mjs';
import { VARIABILE_TETTO_TOKEN } from '../src/kernel/compattazione-desktop.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const CONSEGNA = 'CONSEGNA-STRESS: leggi grande.txt più volte e riferisci.';
const PREAMBOLO = 'PREAMBOLO-PROGETTO ' + 'x'.repeat(12_000);
const BUONO = 'RIASSUNTO-BUONO: letto grande.txt più volte; nessun errore.';
const eRiassunto = (body) => String(body.messages.at(-1)?.content ?? '').includes('CONTEXT COMPACTION');

/* I guasti del riassuntore: `n` è il numero del tentativo di riassunto (1, 2, …). */
const RIASSUNTORI = {
  'buono': () => ({ json: { choices: [{ message: { role: 'assistant', content: BUONO }, finish_reason: 'stop' }] } }),
  'vuoto': () => ({ json: { choices: [{ message: { role: 'assistant', content: '' }, finish_reason: 'stop' }] } }),
  'troncato-una-volta': (n) => (n === 1
    ? { json: { choices: [{ message: { role: 'assistant', content: 'RIASSUNTO A ME' }, finish_reason: 'length' }] } }
    : { json: { choices: [{ message: { role: 'assistant', content: BUONO }, finish_reason: 'stop' }] } }),
  'troncato-sempre': () => ({ json: { choices: [{ message: { role: 'assistant', content: 'RIASSUNTO A ME' }, finish_reason: 'length' }] } }),
  'rifiuto': () => ({ json: { choices: [{ message: { role: 'assistant', content: "I'm sorry, but I can't help with summarizing this conversation." }, finish_reason: 'stop' }] } }),
  'attrezzo': () => ({ json: { choices: [{ message: { role: 'assistant', content: '', tool_calls: [{ id: 'x', type: 'function', function: { name: 'leggi', arguments: '{}' } }] }, finish_reason: 'tool_calls' }] } }),
  '429': () => ({ status: 429, json: { error: { message: 'Rate limit exceeded, retry later' } } }),
  '500': () => ({ status: 500, json: { error: { message: 'internal server error' } } }),
  'rete': () => ({ lancia: true }),
};

function cartellaDiProva(t) {
  const dir = mkdtempSync(join(tmpdir(), 'talos-comp-stress-'));
  writeFileSync(join(dir, 'grande.txt'), `${'g'.repeat(79)}\n`.repeat(50));
  t.after(() => rimuoviCartellaDiProva(dir));
  return dir;
}
function conTetto(t, valore) {
  const prima = process.env[VARIABILE_TETTO_TOKEN];
  process.env[VARIABILE_TETTO_TOKEN] = String(valore);
  t.after(() => { if (prima === undefined) delete process.env[VARIABILE_TETTO_TOKEN]; else process.env[VARIABILE_TETTO_TOKEN] = prima; });
}
function fornitore(riassuntore, { overflowAl = null } = {}) {
  let lavoro = 0; let riassunti = 0; const storie = [];
  const fetchDiRete = async (_url, init) => {
    const body = JSON.parse(init.body);
    const usage = { prompt_tokens: Math.ceil(JSON.stringify(body.messages).length / 4), completion_tokens: 5 };
    if (eRiassunto(body)) {
      riassunti += 1;
      const r = riassuntore(riassunti);
      if (r.lancia) throw new TypeError('fetch failed');
      return Response.json(r.status ? r.json : { ...r.json, usage }, { status: r.status ?? 200 });
    }
    lavoro += 1;
    storie.push(body.messages);
    if (overflowAl !== null && lavoro === overflowAl) {
      return Response.json({ error: { message: "This model's maximum context length is 32768 tokens. However, your messages resulted in 40000 tokens.", code: 'context_length_exceeded' } }, { status: 400 });
    }
    if (lavoro <= 8) {
      return Response.json({ choices: [{ message: { role: 'assistant', content: '', tool_calls: [{ id: `c${lavoro}`, type: 'function', function: { name: 'leggi', arguments: '{"percorso":"grande.txt"}' } }] }, finish_reason: 'tool_calls' }], usage });
    }
    return Response.json({ choices: [{ message: { role: 'assistant', content: 'Fatto.' }, finish_reason: 'stop' }], usage });
  };
  return { fetchDiRete, riassunti: () => riassunti, storie };
}

const SCENARI = [
  { nome: 'soglia, finestra ignota', tetto: 8_000, finestraToken: undefined, overflowAl: null },
  { nome: 'soglia, finestra 32K', tetto: 8_000, finestraToken: 32_768, overflowAl: null },
  { nome: 'overflow, finestra ignota', tetto: 200_000, finestraToken: undefined, overflowAl: 4 },
  { nome: 'overflow, finestra 32K', tetto: 200_000, finestraToken: 32_768, overflowAl: 4 },
];

for (const scenario of SCENARI) {
  for (const [guasto, riassuntore] of Object.entries(RIASSUNTORI)) {
    test(`COMP-STRESS ${scenario.nome} · riassuntore «${guasto}»: il giro conclude, ogni compattazione chiude con un evento onesto`, async (t) => {
      conTetto(t, scenario.tetto);
      const f = fornitore(riassuntore, { overflowAl: scenario.overflowAl });
      const eventi = [];
      const esito = await talosLavora({ cartella: cartellaDiProva(t), task: { consegna: CONSEGNA }, modello: 'z-ai/glm-5.3-flash', chiave: 'fixture',
        fetchDiRete: f.fetchDiRete, contestoDelProgetto: PREAMBOLO, comandoProva: 'node -e 0', onGiro: (e) => eventi.push(e),
        ...(scenario.finestraToken ? { finestraToken: scenario.finestraToken } : {}) });
      const tipi = eventi.map((e) => e.tipo).filter((x) => /^compattazione-(inizio|fine)$/u.test(x));
      // I1
      assert.equal(esito.comeFinita, 'concluso', `I1: ${esito.comeFinita} — ${JSON.stringify(tipi)}`);
      // I2: ogni inizio ha la sua fine
      assert.equal(tipi.filter((x) => x === 'compattazione-inizio').length <= tipi.filter((x) => x === 'compattazione-fine').length, true, `I2: ${JSON.stringify(tipi)}`);
      // I3: un riassunto finito nella storia come «buono» è quello buono (mai il troncato, il vuoto, il rifiuto)
      const usate = eventi.filter((e) => e.tipo === 'compattazione-fine' && e.compattato === true && e.ripiego !== true);
      for (const e of usate) {
        const testo = (e.record?.riassunto ?? []).map((m) => String(m?.content ?? '')).join('\n');
        if (testo) assert.doesNotMatch(testo, /RIASSUNTO A ME|I'm sorry, but I can't/u, `I3: un riassunto scartabile è diventato la storia (${guasto})`);
      }
    });
  }
}
