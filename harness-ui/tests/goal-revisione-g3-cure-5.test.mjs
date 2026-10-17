/*
 * ⛔ QUINTA RIVERIFICA delle cure della G3 (bugfixer, 14/10/2026 sera) — commit `482a5846e` su `feat/goal`.
 *
 * Prove ROSSE apposta. Le cure di REV-14/15 fanno ciò che dicono; restano due verdi FALSI misurati dall'esecutore VERO del kernel
 * (`eseguiComandoSandboxato`, dove: 'windows') con `programmaTrovato` vero, il 14/10/2026:
 *   @ start /b node -e "process.exit(1)"               atteso 0 → VERDE (codice 0): `@` staccato dalla parola con uno spazio
 *   cmd/c "node -e process.exit(1) || exit 0"          atteso 0 → VERDE (codice 0): l'opzione ATTACCATA alla shell stessa
 *     (`shellAnnidata` prende l'ultimo pezzo dopo `/` come nome del programma: `cmd/c` diventa `c`)
 * e una cartella raggiunta per un'altra strada (una giunzione) che non risulta «la stessa».
 * Rapporto: `handoff-talos-2026-09-27/bugfixer/RAPPORTO-REVISIONE-GOAL-G3-2026-10-14.md`, sezione «Quinta riverifica».
 */
import assert from 'node:assert/strict';
import { mkdtempSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { esitoAttribuibile } from '../src/obiettivo/contratto.mjs';
import { conStore, passo, registroAGiri } from './aiuto/banco-obiettivo.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

async function aspetta(condizione, cosa) {
  const fino = Date.now() + 20_000;
  while (Date.now() < fino) { if (condizione()) return; await new Promise((r) => setTimeout(r, 5)); }
  assert.fail(`never happened: ${cosa}`);
}

test('G3-REV-16 (S2) — «@ start» (the echo-off sign with a space) and «cmd/c» (the switch glued to the shell) still exit 0 and are attributable', () => {
  for (const comando of ['@ start /b npm test', '@  start /b npm test', 'cmd/c "npm test || exit 0"', 'cmd.exe/c "npm test || exit 0"', 'npm --version && cmd/c "npm test || exit 0"']) {
    assert.equal(esitoAttribuibile(comando).ok, false, `${comando}: measured exit 0 whatever the command inside does`);
  }
});

test('G3-REV-17 (S4) — the same folder reached through a JUNCTION is not «the same»: a conversation there starts a turn during the checks, and the result is saved', { skip: process.platform !== 'win32' }, async (t) => conStore(t, async (cartellaStore) => {
  /* `chiaveDellaCartella` risolve il percorso ma non lo legge sul disco (`realpath`): una giunzione (o `subst`, o un nome corto 8.3)
     porta agli stessi file per un'altra strada, e le due conversazioni non «si toccano». */
  const radice = mkdtempSync(join(tmpdir(), 'talos-g3-cura5-'));
  t.after(() => rimuoviCartellaDiProva(radice));
  const progetto = join(radice, 'progetto');
  const giunzione = join(radice, 'scorciatoia');
  (await import('node:fs')).mkdirSync(progetto);
  symlinkSync(progetto, giunzione, 'junction');
  const cartelle = [progetto, giunzione];
  const appesi = [];
  const b = registroAGiri(cartellaStore, {
    preparaEsecuzioneFn: () => ({ cartella: cartelle.shift() ?? progetto, comandoProva: 'npm test', task: { id: 'task-vero', consegna: 'c' } }),
    permessoDelMotoreFn: async () => ({ consentito: true }),
    programmaTrovatoFn: async () => true,
    eseguiComandoDellaProvaFn: (riga, dove, o) => new Promise((r) => {
      appesi.push(r);
      o.segnaleStop?.addEventListener('abort', () => r({ codice: 130, fermatoSuRichiesta: true }));
    }),
  });
  const fine = [{ role: 'system', content: 's' }, { role: 'user', content: 'c' }, { role: 'assistant', content: 'r1' }];
  const { sessionId: diretta } = b.registro.avvia('task-vero');
  b.giri.at(-1).concludi(fine);
  const { sessionId: perLaGiunzione } = b.registro.avvia('task-vero');
  b.giri.at(-1).concludi(fine);
  await passo();
  assert.equal(b.registro.contestoPropostaObiettivo(perLaGiunzione, 'x').cartella, giunzione, 'premise: the second conversation works through the junction');

  await b.registro.impostaObiettivo(diretta, 'goal', { criteri: [{ testo: 'tests pass', verifica: { tipo: 'comando', comando: 'npm test' } }] });
  let finita = null;
  const inCorso = b.registro.verificaObiettivo(diretta).then((e) => { finita = e; return e; });
  await aspetta(() => appesi.length > 0 || finita !== null, 'the check starts');
  assert.equal(finita, null, `premise: the checks start (${JSON.stringify(finita?.reason)})`);
  const giriPrima = b.giri.length;
  const ripresa = b.registro.resume(perLaGiunzione, 'refactor everything');
  await aspetta(() => ripresa?.erroreAvvio !== undefined || b.giri.length > giriPrima, 'the other conversation starts a turn, or is refused');
  const partito = ripresa?.erroreAvvio === undefined && b.giri.length > giriPrima;
  appesi.shift()?.({ codice: 0 });
  const esito = await inCorso;
  if (b.giri.length > giriPrima) b.giri.at(-1).concludi([{ role: 'assistant', content: 'r2' }]);
  await passo();
  assert.ok(!(partito && esito.ok === true), `a conversation on the same files through a junction started a turn during the checks (${partito}) AND the result was saved (${esito.ok === true})`);
}));
