/*
 * ⛔ RIVERIFICA AVVERSARIA delle cure della G5a (bugfixer, 15/10/2026) — `feat/goal-g5` @ `780bbed4e`.
 * Sonde sui confini delle cure G5-REV-03/04: più «Verifica» di fila sotto il giudice, e un giro nuovo che FINISCE mentre il giudice
 * pensa (due cicli insieme). Rapporto: `handoff-talos-2026-09-27/bugfixer/RAPPORTO-REVISIONE-GOAL-G5-2026-10-15.md`.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { conStore, conversazioneFerma, passo, registroAGiri } from './aiuto/banco-obiettivo.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';
import { impronta } from '../src/obiettivo/giudice.mjs';

const fine = [{ role: 'user', content: 'c' }, { role: 'assistant', content: 'fatto' }];
const README = '# Install\nRun npm ci.\n';
const CONTRATTO = { criteri: [
  { testo: 'tests pass', verifica: { tipo: 'comando', comando: 'npm test' } },
  { testo: 'the README explains how to install', verifica: { tipo: 'giudizio' } },
] };
function progetto(t) {
  const radice = mkdtempSync(join(tmpdir(), 'talos-g5-cure-'));
  t.after(() => rimuoviCartellaDiProva(radice));
  return radice;
}
async function aspetta(condizione, cosa) {
  const fino = Date.now() + 5000;
  while (Date.now() < fino) { if (condizione()) return; await new Promise((r) => setTimeout(r, 5)); }
  assert.fail(`mai successo: ${cosa}`);
}
const riposa = async () => { for (let i = 0; i < 30; i += 1) { await passo(); await new Promise((r) => setTimeout(r, 10)); } };
/** Un giudice le cui risposte restano in sospeso finché la prova non le chiude, una per una. */
function giudiceAMano() {
  const sospese = [];
  let inVolo = 0;
  let massimoInVolo = 0;
  return {
    sospese,
    get massimoInVolo() { return massimoInVolo; },
    giudice: () => new Promise((rispondi) => {
      inVolo += 1; massimoInVolo = Math.max(massimoInVolo, inVolo);
      sospese.push((testo) => { inVolo -= 1; rispondi(testo); });
    }),
  };
}
function banco(cartellaStore, cartella, giudice) {
  const b = registroAGiri(cartellaStore, {
    modello: 'z-ai/glm-5.3-flash',
    preparaEsecuzioneFn: () => ({ cartella, comandoProva: 'npm test', task: { id: 'task-vero', consegna: 'c' } }),
    permessoDelMotoreFn: async () => ({ consentito: true }),
    programmaTrovatoFn: async () => true,
    eseguiComandoDellaProvaFn: async () => ({ codice: 0, enforcement: 'none' }),
    chiediAlModelloUnaVoltaFn: async () => giudice(),
    ritentativiGiudiceObiettivo: { forma: 2, trasporto: 2, primaMs: 1 },
  });
  return b;
}
const stato = (b, id) => b.registro.statoObiettivo(id).obiettivo;
async function giroCheScriveIlReadme(b, sessionId, cartella) {
  const prima = b.giri.length;
  b.registro.resume(sessionId, 'lavora');
  await aspetta(() => b.giri.length === prima + 1, 'il giro parte');
  writeFileSync(join(cartella, 'README.md'), README);
  const { onEvento } = b.giri.at(-1).input;
  onEvento({ type: 'ToolCallStart', toolCallId: 'w1', toolCallName: 'scrivi' });
  onEvento({ type: 'ToolCallArgs', toolCallId: 'w1', delta: JSON.stringify({ percorso: 'README.md', contenuto: README }) });
  onEvento({ type: 'ToolCallResult', toolCallId: 'w1', content: 'ok' });
  b.giri.at(-1).concludi(fine);
}
const si = JSON.stringify({ verdicts: [{ id: 'c2', verdict: 'yes', reason: 'install section', evidence: [{ path: 'README.md', sha256: impronta(README) }] }] });

test('G5-CURA-REV-01 (S4) — a fourth «Check» in a row under the judge: the loop stops in silence again, goal active and idle', async (t) => conStore(t, async (cartellaStore) => {
  const cartella = progetto(t);
  const g = giudiceAMano();
  const b = banco(cartellaStore, cartella, g.giudice);
  const sessionId = await conversazioneFerma(b);
  await b.registro.impostaObiettivo(sessionId, 'document the install', CONTRATTO);
  const giriPrima = b.giri.length;
  await giroCheScriveIlReadme(b, sessionId, cartella);
  for (let n = 1; n <= 4; n += 1) {
    await aspetta(() => g.sospese.length === n, `premessa: domanda ${n} al giudice`);
    assert.equal((await b.registro.verificaObiettivo(sessionId))?.ok, true, `premessa: Verifica ${n} della persona`);
    g.sospese[n - 1](si);
    await riposa();
  }
  const o = stato(b, sessionId);
  const fermoInSilenzio = o.stato === 'attivo' && b.giri.length === giriPrima + 1 && g.sospese.length === 4;
  assert.equal(fermoInSilenzio, false, `goal ${o.stato}, judge calls ${g.sospese.length}: after the third restart the loop returns without a pause or a reason`);
}));

test('G5-CURA-REV-02 (S4) — a new person turn that ENDS while the judge thinks: never two judges at once, and one goal notice at most', async (t) => conStore(t, async (cartellaStore) => {
  const cartella = progetto(t);
  const g = giudiceAMano();
  const b = banco(cartellaStore, cartella, g.giudice);
  const sessionId = await conversazioneFerma(b);
  await b.registro.impostaObiettivo(sessionId, 'document the install', CONTRATTO);
  const giriPrima = b.giri.length;
  await giroCheScriveIlReadme(b, sessionId, cartella);
  await aspetta(() => g.sospese.length === 1, 'premessa: il giudice del giro 1 pensa');
  b.registro.resume(sessionId, 'also add an uninstall section');
  await aspetta(() => b.giri.length === giriPrima + 2, 'premessa: il giro della persona parte');
  b.giri.at(-1).concludi(fine);
  await riposa();
  g.sospese[0](si);
  await riposa();
  for (let i = 1; i < g.sospese.length; i += 1) g.sospese[i](si);
  await riposa();
  const avvisi = b.giri.length - giriPrima - 2;
  const o = stato(b, sessionId);
  assert.ok(g.massimoInVolo <= 1 && avvisi <= 1, `${g.massimoInVolo} judge calls in flight at once, ${g.sospese.length} in all, ${avvisi} goal turns after the person's turn, goal ${o.stato} (${o.motivo?.tipo ?? '-'})`);
}));
