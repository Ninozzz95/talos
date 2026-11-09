// S4 O2, revisione avversaria M del 04/11/2026 (D1, D1b, D2): il rifiuto COMPLETO del modello (risposta vuota, `PROVIDER_EMPTY_RESPONSE` con
// `classe: 'rifiuto-del-modello'`, kernel `erroreRifiutoDelModello`) si chiude «rifiuto» nelle metriche, nell'elenco letto dalla barra e in
// conversation_search, come il rifiuto dopo il testo. Una risposta vuota qualunque resta «errore».
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { avviaSessione } from '../src/agent-service.mjs';
import { talosLavora } from '../src/kernel/talosHarness.mjs';
import { createSessionRegistry, metricheDaEventi } from '../src/session-registry.mjs';
import * as conv from '../src/conversazioni-per-il-modello.mjs';

const enc = new TextEncoder();
const flusso = (fotogrammi) => new Response(new ReadableStream({ start(c) { for (const f of fotogrammi) c.enqueue(enc.encode(`data: ${JSON.stringify(f)}\n\n`)); c.enqueue(enc.encode('data: [DONE]\n\n')); c.close(); } }));
const uso = { choices: [], usage: { prompt_tokens: 100, completion_tokens: 3, total_tokens: 103 } };
/* copiate da tests/rifiuto-del-modello-nel-giro.test.mjs */
const rifiutoVero = () => flusso([{ choices: [{ index: 0, delta: { content: null }, finish_reason: 'content_filter', native_finish_reason: 'refusal' }] }, uso]);
const testoPoiFiltro = () => flusso([{ choices: [{ delta: { content: 'Prima parte della risposta' } }] }, { choices: [{ index: 0, delta: {}, finish_reason: 'content_filter', native_finish_reason: 'refusal' }] }, uso]);

async function eventiVeri(risposta) {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-s4rif-'));
  const eventi = [];
  await avviaSessione({ cartella, task: { consegna: 'prova' }, modello: 'm', chiave: 'k', onEvento: (e) => eventi.push(e),
    talosLavoraFn: (input) => talosLavora({ ...input, fetchDiRete: async () => risposta() }) });
  return eventi.map((e, i) => ({ ...e, _sequenza: i + 1 }));
}

async function motivoDallElenco(finale) {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-s4rif-reg-'));
  let chiudi;
  const registro = createSessionRegistry({
    avviaSessioneFn: (input) => { input.onEvento({ type: 'RunStarted', threadId: 't', runId: 'r' }); input.onEvento(finale); return Promise.resolve({ ok: false, esito: { detto: finale.message, comeFinita: 'errore' } }); },
    guardaWorkspaceFn: () => () => {},
    preparaEsecuzioneLiberaFn: (_c, { cartellaLibera, consegna }) => ({ cartella: cartellaLibera, comandoProva: 'npm test', task: { consegna, consegnaCorta: consegna } }),
    modello: 'z-ai/glm-5.3-flash', chiave: 'chiave-finta',
  });
  const { sessionId } = registro.avviaLibero({ cartellaLibera: cartella, consegna: 'ciao', permessi: 'Full access' });
  for (let i = 0; i < 20; i += 1) await new Promise((r) => setImmediate(r));
  return registro.elenca().find((s) => s.sessionId === sessionId);
}

test('S4-RIF-01: il rifiuto VERO (risposta vuota, il caso del primo bozzetto) chiude «rifiuto» nelle metriche', async () => {
  const ev = await eventiVeri(rifiutoVero);
  const finale = ev.filter((e) => e.type === 'RunError').at(-1);
  assert.equal(finale.code, 'PROVIDER_EMPTY_RESPONSE', 'forma vera del nucleo');
  assert.equal(finale.classe, 'rifiuto-del-modello', 'forma vera del nucleo');
  assert.equal(metricheDaEventi(ev).chiusura.motivo, 'rifiuto');
});

test('S4-RIF-02: il rifiuto VERO arriva nell elenco (la barra di sinistra) come «rifiuto»', async () => {
  const ev = await eventiVeri(rifiutoVero);
  const { _sequenza, ...finale } = ev.filter((e) => e.type === 'RunError').at(-1);
  const riga = await motivoDallElenco(finale);
  assert.equal(riga.ultimoEsito, 'errore');
  assert.equal(riga.motivoChiusura, 'rifiuto', JSON.stringify(finale));
});

test('S4-RIF-03: il rifiuto dopo il testo (caso curato dal ramo) chiude «rifiuto» nelle metriche e nell elenco', async () => {
  const ev = await eventiVeri(testoPoiFiltro);
  const { _sequenza, ...finale } = ev.filter((e) => e.type === 'RunError').at(-1);
  assert.equal(finale.code, 'rifiuto-del-modello');
  assert.equal(metricheDaEventi(ev).chiusura.motivo, 'rifiuto');
  assert.equal((await motivoDallElenco(finale)).motivoChiusura, 'rifiuto');
});

test('S4-RIF-04: una risposta vuota qualunque resta «errore» nell elenco', async () => {
  const riga = await motivoDallElenco({ type: 'RunError', code: 'PROVIDER_EMPTY_RESPONSE', classe: 'risposta-vuota', message: 'The model answered with neither text nor tools (3 times in a row).' });
  assert.equal(riga.motivoChiusura, 'errore');
});

test('S4-RIF-05: conversation_search dice ancora come si è chiusa una chat rifiutata (prima: «closed: error»)', async () => {
  const riga = (sessionId, extra) => ({ sessionId, taskId: 'workspace', nome: `Sessione ${sessionId}`, avviataAlle: '2026-09-20T10:00:00.000Z', ultimaRispostaAlle: null,
    conclusa: true, interrotta: false, ultimoEsito: 'errore', padreId: null, modello: 'z-ai/glm-5.3-flash', ...extra });
  const guasto = conv.sfogliaConversazioni([riga('g', { motivoChiusura: 'errore' })]);
  assert.match(guasto, /closed: error/u, 'controllo: un guasto dice come si è chiusa');
  const rifiutata = conv.sfogliaConversazioni([riga('r', { motivoChiusura: 'rifiuto' })]);
  assert.match(rifiutata, /closed: /u, `la riga di una chat rifiutata non dice più come si è chiusa: ${rifiutata}`);
});
