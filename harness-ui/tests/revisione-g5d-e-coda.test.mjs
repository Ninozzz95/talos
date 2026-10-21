/*
 * ⛔ REVISIONE AVVERSARIA (bugfixer, 15/10/2026) — `feat/goal-g5d` (43de90d95, f634436f6) e `feat/coda-della-persona` (5a5b85eb4).
 *  - G5D-REV-01: i file scritti si ricordano SOLO quando il ciclo salva la sua decisione. Se un giro della persona finisce mentre il
 *    giudice pensa, il ciclo vecchio non salva (`cicloObiettivoDaRifare`, CONFUTA-REV-04) e quello nuovo prende i file dell'ULTIMO
 *    giro: il README del giro di prima sparisce, e il giudice non lo vede più. È il caso che «tutti i giri» doveva chiudere.
 *  - CODA-REV-01: una voce di coda `{ testo: '', dallaPersona: true }` (un record `coda` con testo vuoto letto dal disco) è un
 *    oggetto, quindi «vero»: il kernel la consegna come un turno della persona VUOTO. Una stringa vuota non passava mai
 *    (`talosHarness.test.mjs`, «codaMessaggiFn che torna stringa vuota/spazi conta come nessun messaggio»).
 * Rapporto: `handoff-talos-2026-09-27/bugfixer/RAPPORTO-REVISIONE-G5D-E-MOTORE-2026-10-15.md`.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { conStore, conversazioneFerma, passo, registroAGiri } from './aiuto/banco-obiettivo.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';
import { impronta } from '../src/obiettivo/giudice.mjs';
import { talosLavora } from '../src/kernel/talosHarness.mjs';

const fine = [{ role: 'user', content: 'c' }, { role: 'assistant', content: 'fatto' }];
const README = '# Install\nRun npm ci.\n';
const CONTRATTO = { criteri: [
  { testo: 'tests pass', verifica: { tipo: 'comando', comando: 'npm test' } },
  { testo: 'the README explains how to install', verifica: { tipo: 'giudizio' } },
] };
async function aspetta(condizione, cosa) {
  /* G5D-REV-01 (20/10/2026): 5 s fissi sono caduti sul runner della release 0.1.31, sotto carico. Il tetto pesa solo quando la prova fallisce: la condizione si guarda ogni 5 ms e si esce appena è vera. */
  const fino = Date.now() + 60_000;
  while (Date.now() < fino) { if (condizione()) return; await new Promise((r) => setTimeout(r, 5)); }
  assert.fail(`mai successo: ${cosa}`);
}
const riposa = async () => { for (let i = 0; i < 30; i += 1) { await passo(); await new Promise((r) => setTimeout(r, 10)); } };

test('G5D-REV-01 (S3) — a person turn that ends while the judge thinks: the README written by the judged turn is never remembered', async (t) => conStore(t, async (cartellaStore) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-g5d-rev-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const domande = [];
  const sospese = [];
  const b = registroAGiri(cartellaStore, {
    modello: 'z-ai/glm-5.3-flash',
    preparaEsecuzioneFn: () => ({ cartella, comandoProva: 'npm test', task: { id: 'task-vero', consegna: 'c' } }),
    permessoDelMotoreFn: async () => ({ consentito: true }),
    programmaTrovatoFn: async () => true,
    eseguiComandoDellaProvaFn: async () => ({ codice: 0, enforcement: 'none' }),
    chiediAlModelloUnaVoltaFn: ({ prompt }) => { domande.push(prompt); return new Promise((r) => { sospese.push(r); }); },
    ritentativiGiudiceObiettivo: { forma: 2, trasporto: 2, primaMs: 1 },
  });
  const sessionId = await conversazioneFerma(b);
  await b.registro.impostaObiettivo(sessionId, 'document the install', CONTRATTO);
  const giriPrima = b.giri.length;
  b.registro.resume(sessionId, 'lavora');
  await aspetta(() => b.giri.length === giriPrima + 1, 'il giro che scrive il README');
  writeFileSync(join(cartella, 'README.md'), README);
  const { onEvento } = b.giri.at(-1).input;
  onEvento({ type: 'ToolCallStart', toolCallId: 'w1', toolCallName: 'scrivi' });
  onEvento({ type: 'ToolCallArgs', toolCallId: 'w1', delta: JSON.stringify({ percorso: 'README.md', contenuto: README }) });
  onEvento({ type: 'ToolCallResult', toolCallId: 'w1', content: 'ok' });
  b.giri.at(-1).concludi(fine);
  await aspetta(() => domande.length === 1, 'premessa: il giudice del giro 1 pensa');
  assert.match(domande[0], new RegExp(impronta(README), 'u'), 'premessa: il giudice del giro 1 vede il README');
  b.registro.resume(sessionId, 'also check the badge');
  await aspetta(() => b.giri.length === giriPrima + 2, 'premessa: il giro della persona parte');
  b.giri.at(-1).concludi(fine); // finisce mentre il giudice pensa, senza scrivere niente
  await riposa();
  sospese[0](JSON.stringify({ verdicts: [{ id: 'c2', verdict: 'no', reason: 'add the npm ci line' }] }));
  await aspetta(() => domande.length === 2, 'premessa: il ciclo del giro 2 chiede al giudice');
  const secondo = domande[1];
  sospese[1](JSON.stringify({ verdicts: [{ id: 'c2', verdict: 'no', reason: 'x' }] }));
  await riposa();
  assert.match(secondo, new RegExp(impronta(README), 'u'), 'the judge of turn 2 no longer sees the README written in turn 1 (fileScritti lost on the redone cycle)');
}));

test('CODA-REV-01 (S5) — a queued object with an empty text is delivered as an empty person turn (a string would not be)', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-coda-rev-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const corpi = [];
  let coda = [{ testo: '', dallaPersona: true }];
  const sse = (pezzi) => new Response(`${pezzi.map((p) => `data: ${JSON.stringify(p)}\n\n`).join('')}data: [DONE]\n\n`, { status: 200, headers: { 'content-type': 'text/event-stream' } });
  const r = await talosLavora({ cartella, task: { consegna: 'ciao' }, modello: 'x', chiave: 'y', _giriMassimiInterno: 3, onDelta: () => {}, fileAdottatiDallaPersona: true,
    codaMessaggiFn: () => { const v = coda.shift() ?? null; return v; },
    fetchDiRete: async (_u, init) => { corpi.push(JSON.parse(init.body)); return sse([{ choices: [{ index: 0, delta: { content: 'ok' } }] }, { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } }]); } });
  coda = [];
  const vuoti = r.messaggiFinali.filter((m) => m.role === 'user' && typeof m.content === 'string' && m.content.trim() === '');
  assert.equal(vuoti.length, 0, `${vuoti.length} empty person turn(s) sent to the model (${corpi.length} requests)`);
});
