/*
 * ⛔ REVISIONE AVVERSARIA della G4 del /goal (bugfixer, 14/10/2026 sera) — il ciclo dopo ogni giro. Ramo `feat/goal-g4`, testa
 * `9c74e0147` (G4 `fb9e10e63` + le cure G3).
 *
 * Prove ROSSE apposta: ognuna mostra un difetto; la cura non è qui.
 * Rapporto: `handoff-talos-2026-09-27/bugfixer/RAPPORTO-REVISIONE-GOAL-G3-2026-10-14.md`, sezione «G4».
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { ceProgresso, decidiDopoIlGiro } from '../src/obiettivo/ciclo.mjs';
import { conStore, conversazioneFerma, registroAGiri } from './aiuto/banco-obiettivo.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const comando = (riga) => ({ testo: `runs ${riga}`, verifica: { tipo: 'comando', comando: riga } });
const fine = [{ role: 'user', content: 'c' }, { role: 'assistant', content: 'fatto' }];
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
function progetto(t) {
  const radice = mkdtempSync(join(tmpdir(), 'talos-g4-rev-'));
  t.after(() => rimuoviCartellaDiProva(radice));
  return radice;
}
async function aspetta(condizione, cosa) {
  const fino = Date.now() + 10_000;
  while (Date.now() < fino) { if (condizione()) return; await dorme(5); }
  assert.fail(`never happened: ${cosa}`);
}
const stato = (b, id) => b.registro.statoObiettivo(id).obiettivo;

test('G4-REV-01 (S3) — the «no progress» pause never comes with real test output: a red check that prints its DURATION is «progress» at every turn', () => {
  /* `ceProgresso` confronta l'impronta di esito + CODA dei rossi. Ogni runner di prove stampa i tempi (node --test `duration_ms`,
     jest `Time:`, pytest `in 0.12s`): la coda cambia a ogni giro anche se non è cambiato niente, quindi è sempre progresso, e la
     pausa dopo 3 giri senza progresso non arriva mai — il ciclo spende fino al tetto di 20 giri. */
  const rosso = (durata) => ({ verdetti: [{ id: 'c1', impronta: 'sha256:x', esito: 'rosso', motivo: { tipo: 'exit-code' },
    uscita: { codice: 1, coda: `[stdout]\n✖ login keeps the session (3.1ms)\nℹ tests 12\nℹ pass 11\nℹ fail 1\nℹ duration_ms ${durata}` } }] });
  assert.equal(ceProgresso(rosso('212.4473'), rosso('208.9015'), { scritture: 0 }), false, 'the same failing test, only the duration changed: that is not progress');
});

test('G4-REV-02 (S3, decide the owner) — a contract with ONLY judgement criteria is «done» after the first turn, with nothing proved', () => {
  /* «Tutte le prove verdi» è vero a vuoto quando non c'è nessuna prova: `daProvare` è vuoto e `every` dice sì. Un obiettivo i cui
     criteri sono tutti a giudizio (comune per un obiettivo non di codice, ed è ciò che la proposta G2c fa quando non trova comandi)
     diventa «fatto con N da guardare» al primo giro, qualunque cosa abbia fatto l'agente. */
  const obiettivo = { stato: 'attivo' };
  const verifica = { verdetti: [{ id: 'c1', esito: 'da-giudicare' }, { id: 'c2', esito: 'da-giudicare' }] };
  const decisione = decidiDopoIlGiro({ obiettivo, verifica, ciclo: { giri: 1, token: 0, senzaProgresso: 0 } });
  assert.notEqual(decisione.azione, 'fatto', `nothing was checked, and the goal is ${JSON.stringify(decisione)}`);
});

function banco(cartellaStore, cartella, esegui, opzioni = {}) {
  return registroAGiri(cartellaStore, {
    preparaEsecuzioneFn: () => ({ cartella, comandoProva: 'npm test', task: { id: 'task-vero', consegna: 'c' } }),
    permessoDelMotoreFn: async () => ({ consentito: true }),
    programmaTrovatoFn: async () => true,
    eseguiComandoDellaProvaFn: esegui,
    ...opzioni,
  });
}

test('G4-REV-03 (S3) — the loop STOPS IN SILENCE when its check is refused (here: the person pressed «Check» a moment before): the goal stays «active» and no turn ever comes', async (t) => conStore(t, async (cartellaStore) => {
  /* `cicloObiettivo`: `if (!esito?.ok) return;` — «il prossimo giro ripasserà di qui». Ma con `goal-check-running` (una verifica
     manuale già in corso), `goal-changed-during-check` (il contratto cambiato a metà) o un `!` in corso (`goal-check-while-working`)
     non c'è nessun «prossimo giro»: l'obiettivo resta ATTIVO, nessuno lo porta avanti, nessuno lo dice. */
  const cartella = progetto(t);
  const appesi = [];
  const b = banco(cartellaStore, cartella, (riga, dove, o) => new Promise((r) => {
    appesi.push(r);
    o.segnaleStop?.addEventListener('abort', () => r({ codice: 130, fermatoSuRichiesta: true }));
  }));
  const sessionId = await conversazioneFerma(b);
  await b.registro.impostaObiettivo(sessionId, 'fix the tests', { criteri: [comando('npm test')] });
  b.registro.resume(sessionId, 'lavora');
  await aspetta(() => b.giri.length === 2, 'the person’s turn starts');
  b.giri.at(-1).concludi(fine);
  await aspetta(() => stato(b, sessionId) && b.registro.esporta(sessionId).conclusa === true, 'the turn is concluded');
  const manuale = b.registro.verificaObiettivo(sessionId); // la persona preme «Verifica» appena finito il giro
  await aspetta(() => appesi.length === 1, 'the manual check starts');
  await dorme(200); // il ciclo (25 ms) prova la sua verifica, e la trova già in corso
  appesi.shift()({ codice: 1, enforcement: 'none' }); // rossa
  assert.equal((await manuale).ok, true, 'premise: the manual check is saved');
  await dorme(300);
  const ora = stato(b, sessionId);
  assert.ok(b.giri.length > 2 || ora.stato !== 'attivo', `the goal is «${ora.stato}», with a red check, and no turn after it (${b.giri.length} turns): a silent stop`);
}));

test('G4-REV-04 (S4) — when NOTHING can be checked (the gate denies every command) the loop still restarts paid turns the model cannot help', async (t) => conStore(t, async (cartellaStore) => {
  /* Con tutte le prove «non verificabili» per un motivo che il modello non può cambiare (permesso negato, Piano, cartella non qui)
     la decisione è `continua`: il ciclo rimanda il modello a «sistemare» ciò che non può toccare, e la pausa arriva solo dopo tre
     giri senza progresso (pagati). */
  const cartella = progetto(t);
  const b = banco(cartellaStore, cartella, async () => ({ codice: 0, enforcement: 'none' }), {
    permessoDelMotoreFn: async () => ({ consentito: false, via: 'livello-lettura' }),
  });
  const sessionId = await conversazioneFerma(b);
  await b.registro.impostaObiettivo(sessionId, 'fix the tests', { criteri: [comando('npm test')] });
  b.registro.resume(sessionId, 'lavora');
  await aspetta(() => b.giri.length === 2, 'the person’s turn starts');
  b.giri.at(-1).concludi(fine);
  await aspetta(() => stato(b, sessionId).verifica?.verdetti?.length === 1, 'the loop checks');
  await dorme(300);
  const v = stato(b, sessionId).verifica.verdetti[0];
  assert.equal(v.esito, 'non-verificabile', `premise: the check cannot run (${JSON.stringify(v.motivo)})`);
  assert.equal(b.giri.length, 2, `the loop restarted the model ${b.giri.length - 2} time(s) for a check it cannot make runnable`);
}));

test('G4-REV-05 (S3) — «Resume» on a paused goal makes it «active» and nothing runs: the loop starts only at the end of a turn', async (t) => conStore(t, async (cartellaStore) => {
  /* Il ciclo parte solo da `concludiAssestamento`. La persona che riprende un obiettivo in pausa (persona, nessun progresso, errore)
     lo vede «attivo», ma nessun giro parte finché non scrive lei: «attivo» non vuol dire che qualcuno lo porta avanti. Codex e
     Hermes riprendono il ciclo alla ripresa. (Lo stesso vale per un obiettivo appena impostato col contratto.) */
  const cartella = progetto(t);
  const b = banco(cartellaStore, cartella, async () => ({ codice: 1, enforcement: 'none' }));
  const sessionId = await conversazioneFerma(b);
  await b.registro.impostaObiettivo(sessionId, 'fix the tests', { criteri: [comando('npm test')] });
  await b.registro.pausaObiettivo(sessionId);
  const giriPrima = b.giri.length;
  const ripreso = await b.registro.riprendiObiettivo(sessionId);
  assert.equal(ripreso.obiettivo.stato, 'attivo', 'premise: the goal is active again');
  await dorme(400);
  assert.ok(b.giri.length > giriPrima, 'the goal is «active» and no turn started: nobody is carrying it');
}));
