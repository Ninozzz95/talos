/*
 * Riverifica avversaria del blocco 14 (28/10/2026) — prove del revisore su fd0603ddb. ROSSE sulla candidata: ognuna dice un difetto.
 * Ermetico: modello finto, nessuna rete, TEMP privata (come `cache-riassunto-sicuro-28-10.test.mjs`).
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { talosLavora } from '../src/kernel/talosHarness.desktop-hotfix.mjs';
import { VARIABILE_TETTO_TOKEN, richiestaDiRiassuntoSicuraPerCache } from '../src/kernel/compattazione-desktop.mjs';
import { senzaMarcatoriDiCache, marcatoreDiCachePer } from '../src/kernel/talosHarness.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { TaskCatalogError } from '../src/task-catalog.mjs';
import { cartellaDiProva as cartellaStoreDiProva } from './aiuto/cartelle-di-prova.mjs';

const CONSEGNA = 'CONSEGNA-ORIGINALE-MARKER: leggi grande.txt più volte e riferisci.';
const PREAMBOLO = 'PREAMBOLO-PROGETTO ' + 'x'.repeat(12_000);
function cartellaDiProva(t) {
  const dir = mkdtempSync(join(tmpdir(), 'talos-riv14b-'));
  writeFileSync(join(dir, 'grande.txt'), `${'g'.repeat(79)}\n`.repeat(50));
  t.after(() => rimuoviCartellaDiProva(dir));
  return dir;
}
function conTetto(t, valore) {
  const prima = process.env[VARIABILE_TETTO_TOKEN];
  process.env[VARIABILE_TETTO_TOKEN] = String(valore);
  t.after(() => { if (prima === undefined) delete process.env[VARIABILE_TETTO_TOKEN]; else process.env[VARIABILE_TETTO_TOKEN] = prima; });
}
const testoDi = (m) => (typeof m?.content === 'string' ? m.content
  : Array.isArray(m?.content) ? m.content.map((p) => (typeof p?.text === 'string' ? p.text : '')).join('') : '');
const eRiassunto = (body) => testoDi(body.messages.at(-1)).includes('CONTEXT COMPACTION');
function fornitore({ chiamateTool = 14 } = {}) {
  const corpi = [];
  let lavoro = 0;
  const fetchDiRete = async (_url, init) => {
    const body = JSON.parse(init.body);
    corpi.push(body);
    const usage = { prompt_tokens: Math.ceil(JSON.stringify(body.messages).length / 4), completion_tokens: 5 };
    if (eRiassunto(body)) return Response.json({ choices: [{ message: { role: 'assistant', content: '## Goal\nRIASSUNTO: ho letto grande.txt.' }, finish_reason: 'stop' }], usage });
    lavoro += 1;
    if (lavoro <= chiamateTool) {
      return Response.json({ choices: [{ message: { role: 'assistant', content: '', tool_calls: [{ id: `call_${lavoro}`, type: 'function', function: { name: 'leggi', arguments: '{"percorso":"grande.txt"}' } }] }, finish_reason: 'tool_calls' }], usage });
    }
    return Response.json({ choices: [{ message: { role: 'assistant', content: 'Fatto.' }, finish_reason: 'stop' }], usage });
  };
  return { fetchDiRete, corpi, riassunti: () => corpi.filter(eRiassunto) };
}
async function giro(t, f, resto = {}) {
  conTetto(t, 12_000);
  return talosLavora({
    cartella: cartellaDiProva(t), task: { consegna: CONSEGNA }, modello: 'z-ai/glm-5.3-flash', chiave: 'fixture',
    fetchDiRete: f.fetchDiRete, contestoDelProgetto: PREAMBOLO, comandoProva: 'node -e 0', riassuntoSicuroPerCache: true, ...resto,
  });
}
const lavoroPrimaDelRiassunto = (corpi) => corpi.slice(0, corpi.findIndex(eRiassunto)).filter((b) => !eRiassunto(b)).at(-1);
/** Fin dove la richiesta sicura è un prefisso (oggetto per oggetto, marcatori tolti) dell'ultima richiesta di lavoro. */
function primoMessaggioDiverso(riassunto, prima) {
  const corpo = riassunto.messages.slice(0, -1).map(senzaMarcatoriDiCache);
  const davanti = prima.messages.map(senzaMarcatoriDiCache);
  for (let i = 0; i < corpo.length; i += 1) if (JSON.stringify(corpo[i]) !== JSON.stringify(davanti[i])) return i;
  return -1;
}

/* RIV14B-C1 — una nota di sistema a METÀ storia (aggiornamento del contesto del progetto, «dove sei», lingua…) esce dal tratto
   (`separaNoteDiSistema`): la richiesta «sicura» smette di essere un prefisso della conversazione proprio lì. */
test('RIV14B-C1 — con una nota di sistema a metà storia la richiesta sicura resta un prefisso della conversazione', async (t) => {
  const f = fornitore();
  const storia = [
    { role: 'system', content: 'You are a coding agent. ' + 'r'.repeat(2_000) },
    { role: 'user', content: 'Prima richiesta: guarda il progetto' },
    { role: 'assistant', content: 'Ho guardato: ' + 'a'.repeat(3_000) },
    { role: 'system', content: 'Project context update: the folder map changed. ' + 'm'.repeat(1_000) },
    { role: 'user', content: 'Seconda richiesta: continua' },
    { role: 'assistant', content: 'Continuo: ' + 'b'.repeat(3_000) },
  ];
  await giro(t, f, { messaggiIniziali: storia });
  const riassunto = f.riassunti()[0];
  assert.ok(riassunto?.tools?.length > 0, 'premessa: è partita la forma sicura');
  const i = primoMessaggioDiverso(riassunto, lavoroPrimaDelRiassunto(f.corpi));
  assert.equal(i, -1, `la richiesta sicura diverge dalla conversazione al messaggio ${i}: ${String(JSON.stringify(riassunto.messages.at(i)) ?? "").slice(0, 80)}`);
});

/* RIV14B-C2 — il ragionamento: la conversazione va a `high`, il riassunto «sicuro» a `low` (`reasoningPerRiassunto`). Per Anthropic
   cambiare il ragionamento invalida i blocchi dei MESSAGGI (platform.claude.com «Prompt caching», tabella dell'invalidazione, righe
   «Thinking parameters» ed «Effort setting», letta il 28/10/2026): si rilegge al più attrezzi + sistema e si RISCRIVE la storia a 2×. */
test('RIV14B-C2 — la forma sicura manda lo stesso ragionamento della conversazione (Claude, sforzo alto)', async (t) => {
  const f = fornitore();
  await giro(t, f, { modello: 'anthropic/claude-sonnet-4.6', reasoning: { effort: 'high' } });
  const riassunto = f.riassunti()[0];
  assert.ok(riassunto?.tools?.length > 0, 'premessa: è partita la forma sicura');
  const prima = lavoroPrimaDelRiassunto(f.corpi);
  assert.deepEqual(prima.reasoning, { effort: 'high' }, 'premessa: la conversazione ragiona ad alto');
  assert.deepEqual(riassunto.reasoning, prima.reasoning, 'un ragionamento diverso invalida la cache dei messaggi su Anthropic');
});

/* RIV14B-C3 — `view_image`: al filo la conversazione manda, dopo il suo esito, un messaggio d'immagine che la strada del riassunto non
   ricostruisce ⇒ con un esito di view_image (il campo `talos_immagini`, immagine-da-guardare.mjs:98) nel prefisso la forma sicura non
   parte. Qui la sola funzione pura: questo ramo nasce prima di view_image; la prova col giro vero è quella del revisore, nella candidata. */
test('RIV14B-C3 — con un esito di view_image nel prefisso la forma sicura non parte; AL CONTRARIO senza, parte', () => {
  const attrezzi = [{ type: 'function', function: { name: 'leggi', parameters: { type: 'object' } } }];
  const testa = [{ role: 'system', content: 'S' }];
  const mezzo = (conImmagine) => [{ role: 'user', content: 'guarda il logo' },
    { role: 'assistant', content: '', tool_calls: [{ id: 'v1', type: 'function', function: { name: 'view_image', arguments: '{"percorso":"logo.png"}' } }] },
    { role: 'tool', tool_call_id: 'v1', content: 'Image logo.png viewed.', ...(conImmagine ? { talos_immagini: [{ riferimento: 'a'.repeat(64) }] } : {}) },
    { role: 'assistant', content: 'È un logo blu.' }];
  assert.equal(richiestaDiRiassuntoSicuraPerCache({ testa, mezzo: mezzo(true), attrezzi, finestraToken: 128_000, maxOutputTokens: 2_000 }), null);
  assert.ok(Array.isArray(richiestaDiRiassuntoSicuraPerCache({ testa, mezzo: mezzo(false), attrezzi, finestraToken: 128_000, maxOutputTokens: 2_000 })));
});

/* RIV14B-C4 — la strada del registro sceglie il marcatore da `statoCache.durataMs`, che dopo RIV14-4 non è più «il marcatore mandato»:
   per un modello che non onora i punti sui messaggi (DeepSeek, GLM, Gemini, GPT…) la conversazione manda `ttl:'1h'` sui sistemi e
   `durataMs` vale 5 minuti ⇒ il riassunto sicuro del registro manda un marcatore DIVERSO sul sistema: i byte del prefisso cambiano. Filo
   intero: nucleo vero (DeepSeek) → `statoCache` → registro vero → `riassumiPerCompattazioneFn`. */
const DS = 'deepseek/deepseek-v4';
test('RIV14B-C4 — il riassunto sicuro del registro rimanda il marcatore che la conversazione ha mandato (DeepSeek, persona davanti)', async (t) => {
  const f = fornitore({ chiamateTool: 2 });
  const esito = await giro(t, f, { modello: DS, riassuntoSicuroPerCache: false });
  const sistemi = JSON.stringify(f.corpi.at(-1).messages.filter((m) => m.role === 'system'));
  assert.ok(sistemi.includes('"ttl":"1h"'), 'premessa: la conversazione ha mandato un marcatore da un ora sul sistema');
  const prima = process.env[VARIABILE_TETTO_TOKEN];
  process.env[VARIABILE_TETTO_TOKEN] = '2000';
  const cartellaStore = cartellaStoreDiProva('talos-riv14b-reg-');
  const chiamate = [];
  const giri = [];
  const registro = createSessionRegistry({ guardaWorkspaceFn: () => () => {}, cartellaStore, modello: DS, chiave: 'k', riassuntoSicuroPerCache: true,
    riassumiPerCompattazioneFn: async (input) => { chiamate.push(input); return { scelta: { role: 'assistant', content: '## R ok' }, finishReason: 'stop', usage: null }; },
    preparaEsecuzioneFn: (taskId) => { if (taskId !== 'task-vero') throw new TaskCatalogError(taskId); return { cartella: '/tmp/x', comandoProva: 'npm test', task: { id: taskId, consegna: 'c' } }; },
    avviaSessioneFn: async (input) => { let r; const p = new Promise((x) => { r = x; }); giri.push({ input, concludi(storia, extra) { input.onEvento({ type: 'RunFinished' }); r({ ok: true, esito: { comeFinita: 'concluso', messaggiFinali: storia, recordDiCompattazione: [], scartoMisurato: 0, ...extra } }); } }); input.onEvento({ type: 'RunStarted', threadId: 't', runId: 'r1' }); return p; } });
  t.after(async () => { if (prima === undefined) delete process.env[VARIABILE_TETTO_TOKEN]; else process.env[VARIABILE_TETTO_TOKEN] = prima; await attendiScritture({ cartellaStore }); rimuoviCartellaDiProva(cartellaStore); });
  registro.avvia('task-vero', { modelloScelto: DS });
  const storia = [{ role: 'system', content: 'You are a coding agent' }, { role: 'user', content: 'Consegna: analizza tutto' }];
  for (let i = 0; i < 6; i += 1) {
    storia.push({ role: 'assistant', content: '', tool_calls: [{ id: `c${i}`, type: 'function', function: { name: 'leggi', arguments: '{}' } }] }, { role: 'tool', tool_call_id: `c${i}`, content: 'x'.repeat(3_000) });
  }
  storia.push({ role: 'user', content: 'Seconda richiesta' }, { role: 'assistant', content: 'Fatto.' });
  giri[0].concludi(storia, { statoCache: esito.statoCache });
  for (let i = 0; i < 400 && chiamate.length === 0; i += 1) await new Promise((r) => setTimeout(r, 10));
  assert.ok(chiamate[0]?.attrezzi?.length > 0, 'premessa: forma sicura');
  assert.deepEqual(chiamate[0].marcatoreDiCache, marcatoreDiCachePer({ modello: DS }), 'il marcatore del riassunto sicuro è quello che il fornitore ha in cache');
});
