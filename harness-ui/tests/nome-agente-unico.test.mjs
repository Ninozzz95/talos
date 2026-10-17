/*
 * L3-17 (owner 16/10/2026, «un nome solo ovunque») — lato server: ogni agente porta il suo `nome` (quello della barra, dato alla
 *   nascita della delega), `children` non ripete `task` quando è identico a `taskCorto`, e il diagramma (`timelineAgenti`) porta lo
 *   stesso `nome`. Una famiglia scritta su disco e ripristinata, come bc03. Solo src/. Ogni controllo anche AL CONTRARIO.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const MADRE = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const CON_NOME = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
const DI_PRIMA = 'cccccccc-3333-4333-8333-cccccccccccc';
const SENZA_PREAMBOLO = 'dddddddd-4444-4444-8444-dddddddddddd';

function scrivi(cartellaStore, cartella, sessionId, { padreId = null, consegna, consegnaCorta, nome = null, avviataAlle }) {
  const righe = [
    { tipo: 'intestazione', schema: 1, sessionId, taskId: padreId ? `delega:${padreId}` : 'libero:l317', cartella,
      task: { consegna, ...(consegnaCorta !== undefined ? { consegnaCorta } : {}) }, comandoProva: null, forkDa: null, avviataAlle,
      modello: 'z-ai/glm-5.3-flash', modelloPlanner: null, reasoning: null, mobile: false, permessi: 'Full access', permessiPerAttrezzo: null,
      padreId, profonditaDelega: padreId ? 1 : 0, provider: 'cloud', runtimeId: null, modelId: 'z-ai/glm-5.3-flash', fallbackConsent: false, cartellaGiaScelta: true },
    ...(nome ? [{ tipo: 'nome-sessione', nome }] : []),
    { type: 'RunStarted', _sequenza: 1, threadId: sessionId, runId: 'r1' },
    { type: 'RunFinished', _sequenza: 2, threadId: sessionId, runId: 'r1', result: { detto: 'fatto' } },
  ];
  writeFileSync(join(cartellaStore, `${sessionId}.jsonl`), righe.map((r) => `${JSON.stringify(r)}\n`).join(''), 'utf8');
}

async function famiglia(t) {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'l317-store-'));
  const cartella = mkdtempSync(join(tmpdir(), 'l317-lavoro-'));
  t.after(() => { rimuoviCartellaDiProva(cartellaStore); rimuoviCartellaDiProva(cartella); });
  scrivi(cartellaStore, cartella, MADRE, { consegna: 'Prepara il rapporto', avviataAlle: '2026-10-16T09:00:00.000Z' });
  scrivi(cartellaStore, cartella, CON_NOME, { padreId: MADRE, consegna: 'Sei una sessione di lavoro autonoma.\nCompito: Controlla i test', consegnaCorta: 'Controlla i test', nome: 'Controlla i test-2', avviataAlle: '2026-10-16T09:01:00.000Z' });
  scrivi(cartellaStore, cartella, DI_PRIMA, { padreId: MADRE, consegna: 'Sei una sessione di lavoro autonoma.\nCompito: Leggi il registro', consegnaCorta: 'Leggi il registro', avviataAlle: '2026-10-16T09:02:00.000Z' });
  scrivi(cartellaStore, cartella, SENZA_PREAMBOLO, { padreId: MADRE, consegna: 'Riassumi il file', consegnaCorta: 'Riassumi il file', avviataAlle: '2026-10-16T09:03:00.000Z' });
  const registro = createSessionRegistry({ cartellaStore, guardaWorkspaceFn: () => () => {}, modello: 'm', chiave: 'k', avviaSessioneFn: async () => ({ ok: true }) });
  await registro.ripristina();
  t.after(() => registro.chiudi({ attesaMassimaMs: 1_000 }));
  return registro;
}

test('NOME-AGENTE-01 — `children` porta il nome della barra; null per una delega di prima; il nome scelto passa così com\'è', async (t) => {
  const registro = await famiglia(t);
  const figli = new Map(registro.elencaFigli(MADRE).figli.map((f) => [f.sessionId, f]));
  assert.equal(figli.get(CON_NOME).nome, 'Controlla i test-2');
  assert.equal(figli.get(DI_PRIMA).nome, null, 'una delega senza nome resta senza: il client ripiega sul compito');
  assert.equal(figli.get(CON_NOME).taskCorto, 'Controlla i test', 'taskCorto resta com\'era (la CLI lo legge)');
});

test('NOME-AGENTE-02 — `children` non ripete `task` quando è identico a `taskCorto`; AL CONTRARIO la consegna intera, diversa, resta', async (t) => {
  const registro = await famiglia(t);
  const figli = new Map(registro.elencaFigli(MADRE).figli.map((f) => [f.sessionId, f]));
  assert.equal('task' in figli.get(SENZA_PREAMBOLO), false, 'lo stesso testo due volte era un terzo dei ~14 KB di ogni agente');
  assert.equal(figli.get(CON_NOME).task, 'Sei una sessione di lavoro autonoma.\nCompito: Controlla i test');
});

test('NOME-AGENTE-03 — il diagramma porta lo stesso `nome` dell\'elenco (`nodoTimeline`: una famiglia ripristinata non ha storia finché non arriva un evento nuovo)', async () => {
  const { readFileSync } = await import('node:fs');
  const sorgente = readFileSync(new URL('../src/session-registry.mjs', import.meta.url), 'utf8');
  const nodo = sorgente.slice(sorgente.indexOf('function nodoTimeline('), sorgente.indexOf('function registraTimeline('));
  assert.match(nodo, /nome: typeof voce\.nome === 'string' && voce\.nome !== '' \? voce\.nome : null/u);
});
