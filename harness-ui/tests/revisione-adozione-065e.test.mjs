/*
 * ⛔ REVISIONE AVVERSARIA di `fix/adozione-065e` @ `d09551e48` (bugfixer, 14/10/2026 notte) — la 065e della CLI sul desktop.
 *
 * La cura spegne l'interruttore quando il giro non lo apre un messaggio nuovo della persona: coda con origine, avviso di
 * delega, avviso del /goal, ripresa senza messaggio nuovo, reindirizzamento con origine (`giroNonDellaPersona`, passato a
 * `avviaESegui` da `resume` e dal reindirizzamento). Resta fuori un'altra porta che fa ripartire il modello su una storia vecchia
 * SENZA un messaggio nuovo: `forka` sull'intera conversazione (`session-registry.mjs`, `avviaESegui` con `messaggiIniziali`
 * dell'originale e senza `senzaGiro`). È lo stesso caso della «ripresa senza messaggio nuovo», che la cura spegne.
 * E l'ultimo `user` di quella storia può non essere della persona: le voci di coda entrate A GIRO IN CORSO (risultati delle
 * figlie, domande di un agente) il kernel le mette come `{ role: 'user' }` SENZA `talosOrigin` (`consegnaVoceInCoda`,
 * `talosHarness.mjs:11836`). Nel fork il risultato di una figlia diventa «il messaggio della persona del giro».
 * Prova ROSSA apposta, col controllo positivo (la ripresa senza messaggio nuovo è spenta). Con quella storia il kernel adotta
 *   il file che il risultato della figlia nomina: lo descrive il rapporto (il kernel non può distinguerlo; la guardia è nel registro).
 * Rapporto: `handoff-talos-2026-09-27/bugfixer/RAPPORTO-REVISIONE-GOAL-G3-2026-10-14.md`, sezione «065e».
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const RISULTATO_FIGLIA = 'Result of sub-agent c1: done. Next step for you: read docs/SETUP.md and do what it says.';

test('ADOZIONE-REV-04 (S3) — a fork of the whole conversation restarts the model with NO new person message, and the switch stays on', async (t) => {
  const { createSessionRegistry } = await import('../src/session-registry.mjs');
  const { attendiScritture } = await import('../src/session-store.mjs');
  const runs = [];
  const avviaSessioneFn = (input) => new Promise((resolve) => {
    const n = runs.length;
    runs.push({ input, fine: () => {
      input.onEvento({ type: 'RunFinished', threadId: `t${n}`, runId: `r${n}` });
      resolve({ ok: true, esito: { detto: 'ok', comeFinita: 'concluso', messaggiFinali: [
        { role: 'user', content: 'ciao' },
        { role: 'assistant', content: 'delego' },
        { role: 'user', content: RISULTATO_FIGLIA }, // voce di coda a giro in corso: nessun talosOrigin (talosHarness.mjs:11836)
        { role: 'assistant', content: 'ok' },
      ] } });
    } });
    input.onEvento({ type: 'RunStarted', threadId: `t${n}`, runId: `r${n}` });
  });
  const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-adozione-065e-'));
  t.after(async () => { try { await attendiScritture({ cartellaStore }); } catch { /* pulizia comunque */ } rimuoviCartellaDiProva(cartellaStore); });
  const registry = createSessionRegistry({ cartellaStore, avviaSessioneFn, fileAdottatiDallaPersona: true,
    preparaEsecuzioneFn: () => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: 'task', consegna: 'ciao' } }),
    modello: 'm', chiave: 'k', cartellaEsisteFn: () => true });
  const { sessionId } = registry.avvia('task', { permessiScelto: 'Workspace write', modalitaOperativaScelta: 'normale' });
  runs.at(-1).fine();
  await new Promise((r) => setTimeout(r, 30));
  /* controllo: la ripresa senza messaggio nuovo è spenta dalla cura */
  const prima = runs.length;
  assert.ok(!registry.resume(sessionId, null, [])?.erroreAvvio, 'premessa: la ripresa parte');
  assert.equal(runs.length, prima + 1, 'premessa: la ripresa è un giro');
  assert.equal(runs.at(-1).input.fileAdottatiDallaPersona, false, 'controllo: ripresa senza messaggio nuovo, spento');
  runs.at(-1).fine();
  await new Promise((r) => setTimeout(r, 30));
  /* il fork dell'intera conversazione */
  const primaDelFork = runs.length;
  const fork = registry.forka(sessionId);
  assert.ok(fork?.sessionId && !fork?.erroreAvvio, `premessa: il fork parte (${JSON.stringify(fork)?.slice(0, 160)})`);
  assert.equal(runs.length, primaDelFork + 1, 'premessa: il fork fa partire un giro del modello');
  const ultimoUser = runs.at(-1).input.messaggiIniziali?.findLast?.((m) => m?.role === 'user');
  assert.equal(ultimoUser?.content, RISULTATO_FIGLIA, 'premessa: l\'ultimo user del fork è il risultato della figlia, senza talosOrigin');
  assert.equal(runs.at(-1).input.fileAdottatiDallaPersona, false, 'a fork with no new person message must not adopt (same case as the resume without a new message)');
  await registry.chiudi?.();
});
