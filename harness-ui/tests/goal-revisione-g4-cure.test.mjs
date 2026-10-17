/*
 * ⛔ SECONDA REVISIONE della G4 del /goal (bugfixer, 14/10/2026 sera) — le cure `e6e00aa1c` su `feat/goal-g4`.
 *
 * Prove ROSSE apposta. Le cure di G4-REV-01…05 fanno ciò che dicono (le mie cinque prove sono verdi); restano:
 *   · falsi PROGRESSI rimasti nella coda: tolte date, ore e durate, ma un'uscita di prova porta anche altro che cambia a ogni
 *     esecuzione senza che sia cambiato niente — una cartella temporanea, una porta, un seme;
 *   · un RITENTATIVO del ciclo che sopravvive al cambio di obiettivo: riparte sull'obiettivo NUOVO, appena impostato dalla persona,
 *     e gli avvia un giro pagato che nessuno ha chiesto (impostare un obiettivo non avvia niente).
 * Rapporto: `handoff-talos-2026-09-27/bugfixer/RAPPORTO-REVISIONE-GOAL-G3-2026-10-14.md`, sezione «Seconda revisione della G4».
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { ceProgresso } from '../src/obiettivo/ciclo.mjs';
import { conStore, conversazioneFerma, registroAGiri } from './aiuto/banco-obiettivo.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
async function aspetta(condizione, cosa) {
  const fino = Date.now() + 10_000;
  while (Date.now() < fino) { if (condizione()) return; await dorme(5); }
  assert.fail(`never happened: ${cosa}`);
}

test('G4-REV-06 (S3) — false PROGRESS still left in the tail: a temporary folder, a port, a random seed change at every run and nothing else did', () => {
  /* Le uscite vere delle prove portano cose che cambiano a ogni esecuzione: la cartella temporanea di `mkdtemp` (le prove di questo
     stesso repo: `talos-g4-AbC123`), la porta di un `listen(0)`, il seme di vitest/jest («Seed: 1234»). Tolti i tempi, la coda resta
     diversa a ogni giro ⇒ sempre «progresso» ⇒ la pausa «nessun progresso» non arriva, come prima della cura. */
  const rosso = (cartella, porta, seme) => ({ verdetti: [{ id: 'c1', impronta: 'sha256:x', esito: 'rosso', motivo: { tipo: 'exit-code' },
    uscita: { codice: 1, coda: `[stdout]\n✖ the server answers (12.3ms)\n  Error: ENOENT: no such file or directory, open 'C:\\Users\\x\\AppData\\Local\\Temp\\talos-g4-${cartella}\\out.json'\n  server listening on http://127.0.0.1:${porta}\n Seed: ${seme}\nℹ tests 12\nℹ fail 1` } }] });
  assert.equal(ceProgresso(rosso('AbC123', 53412, 1844674), rosso('ZyX987', 61022, 9120033), { scritture: 0 }), false,
    'the same failure; only the temporary folder, the port and the seed changed');
});

test('G4-REV-07 (S3) — a pending RETRY of the loop survives a goal REPLACED by the person: it runs the checks of the new goal and starts a paid turn nobody asked for', async (t) => conStore(t, async (cartellaStore) => {
  /* Il ritentativo (G4-REV-03) rientra in `cicloObiettivo` e rilegge `prima = voce.obiettivo`: se nel frattempo la persona ha
     IMPOSTATO un obiettivo nuovo, il ciclo del vecchio giro lavora sul nuovo — prove, e ripartenza col messaggio dei rossi. Ma
     impostare un obiettivo non avvia niente (G1), e il giro di cui il ritentativo porta l'esito era del vecchio. */
  const cartella = mkdtempSync(join(tmpdir(), 'talos-g4-cura-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const diretti = [];
  const chiamate = [];
  const b = registroAGiri(cartellaStore, {
    preparaEsecuzioneFn: () => ({ cartella, comandoProva: 'npm test', task: { id: 'task-vero', consegna: 'c' } }),
    permessoDelMotoreFn: async () => ({ consentito: true }),
    programmaTrovatoFn: async () => true,
    eseguiComandoDellaProvaFn: async (riga) => { chiamate.push(riga); return { codice: 1, enforcement: 'none' }; },
    eseguiComandoDirettoFn: () => new Promise((fine) => { diretti.push(fine); }),
    ritentativiCicloObiettivo: { tentativi: 8, primaMs: 50 },
  });
  const sessionId = await conversazioneFerma(b);
  await b.registro.impostaObiettivo(sessionId, 'fix the login', { criteri: [{ testo: 'login tests pass', verifica: { tipo: 'comando', comando: 'npm test' } }] });
  b.registro.resume(sessionId, 'lavora');
  await aspetta(() => b.giri.length === 2, 'the person’s turn starts');
  assert.deepEqual(b.registro.shell(sessionId, 'npm run build'), { ok: true }); // un `!` vivo a fine giro: il ciclo riproverà
  b.giri.at(-1).concludi([{ role: 'user', content: 'c' }, { role: 'assistant', content: 'fatto' }]);
  await dorme(80); // il ciclo ha provato, ha trovato il `!`, e ha programmato un ritentativo
  assert.equal(chiamate.length, 0, 'premise: no check while the «!» works');

  // la persona cambia idea: un obiettivo NUOVO, che per G1 non avvia niente
  const nuovo = await b.registro.impostaObiettivo(sessionId, 'write the changelog', { criteri: [{ testo: 'lint passes', verifica: { tipo: 'comando', comando: 'npm run lint' } }] });
  assert.equal(nuovo.ok, true);
  const giriPrima = b.giri.length;
  diretti.shift()({ codice: 0, testo: '' }); // il `!` finisce
  await dorme(1500); // il ritentativo pendente scatta
  assert.equal(b.giri.length, giriPrima, `a turn started for the NEW goal, set a moment ago and never asked to run (checks run: ${JSON.stringify(chiamate)})`);
}));
