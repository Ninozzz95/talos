/*
 * ⭐ Le cure della quinta riverifica della G3 (bugfixer, 14/10/2026 notte; prove rosse in `goal-revisione-g3-cure-5.test.mjs`):
 *   · REV-16: un `@` staccato non è un comando; `cmd/c`, `powershell/c` sono shell con l'opzione attaccata; il nome di un comando
 *     di cmd si chiude anche a `.` e `(` (`start./b`, `start(/b` restavano appesi);
 *   · REV-17: la stessa cartella raggiunta per una giunzione è la stessa; due cartelle diverse restano diverse.
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { esitoAttribuibile } from '../src/obiettivo/contratto.mjs';
import { conStore, registroAGiri } from './aiuto/banco-obiettivo.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

async function aspetta(condizione, cosa) {
  const fino = Date.now() + 20000;
  while (Date.now() < fino) { if (condizione()) return; await new Promise((r) => setTimeout(r, 5)); }
  assert.fail(`never happened: ${cosa}`);
}

test('G3-CURA-16 — `@` staccato, shell con l\'opzione attaccata, nome di cmd chiuso a `.` e `(`; e i comandi legittimi passano', () => {
  for (const [comando, operatore] of [
    ['@ start /b npm test', 'start'], ['@@ call x', 'call'], ['npm -v && @ start x', 'start'],
    ['cmd/c "node x.js || exit 0"', 'cmd/c'], ['CMD.EXE/C x', 'CMD.EXE/C'], ['powershell/c "npm test; exit 0"', 'powershell/c'],
    ['start./b x', 'start'], ['start(/b x', 'start'], ['call.bat x', 'call'],
  ]) {
    assert.deepEqual(esitoAttribuibile(comando), { ok: false, operatore }, comando);
  }
  // AL CONTRARIO
  for (const comando of ['npm install @scope/pkg', 'node scripts/start.mjs', 'node ./bin/cmd.js', 'git log --format=for', 'format-check', 'iffy run', 'starter-kit test', 'npx vitest run']) {
    assert.deepEqual(esitoAttribuibile(comando), { ok: true }, comando);
  }
});

test('G3-CURA-17 — la stessa cartella per una GIUNZIONE ferma le prove; una cartella diversa no', { skip: process.platform !== 'win32' && 'giunzioni di Windows' }, async (t) => conStore(t, async (cartellaStore) => {
  const radice = mkdtempSync(join(tmpdir(), 'talos-g3-cura5-'));
  t.after(() => rimuoviCartellaDiProva(radice));
  const progetto = join(radice, 'progetto');
  const altrove = join(radice, 'altrove');
  for (const c of [progetto, altrove]) mkdirSync(c);
  const giunzione = join(radice, 'scorciatoia');
  symlinkSync(progetto, giunzione, 'junction');
  const appesi = [];
  const fermate = [];
  const cartelle = [progetto, giunzione, altrove];
  let n = 0;
  const b = registroAGiri(cartellaStore, {
    preparaEsecuzioneFn: () => ({ cartella: cartelle[n++], comandoProva: 'npm test', task: { id: 'task-vero', consegna: 'c' } }),
    permessoDelMotoreFn: async () => ({ consentito: true }),
    programmaTrovatoFn: async () => true,
    eseguiComandoDellaProvaFn: (riga, dove, o) => new Promise((r) => {
      appesi.push(r);
      o.segnaleStop?.addEventListener('abort', () => { fermate.push(o.segnaleStop.reason); r({ codice: 130, fermatoSuRichiesta: true }); });
    }),
  });
  const fine = [{ role: 'system', content: 's' }, { role: 'user', content: 'c' }, { role: 'assistant', content: 'r1' }];
  const ids = [];
  for (let i = 0; i < cartelle.length; i += 1) { ids.push(b.registro.avvia('task-vero').sessionId); b.giri.at(-1).concludi(fine); }
  await new Promise((r) => setTimeout(r, 30));
  const [madre, perLaGiunzione, diversa] = ids;
  await b.registro.impostaObiettivo(madre, 'goal', { criteri: [{ testo: 'tests pass', verifica: { tipo: 'comando', comando: 'npm test' } }] });
  for (const [chi, siFerma] of [[perLaGiunzione, true], [diversa, false]]) {
    appesi.length = 0; fermate.length = 0;
    const inCorso = b.registro.verificaObiettivo(madre);
    await aspetta(() => appesi.length > 0, 'the check starts');
    const prima = b.giri.length;
    b.registro.resume(chi, 'work');
    await aspetta(() => b.giri.length > prima, 'the other turn starts');
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(fermate.length > 0, siFerma, `${chi}: ${JSON.stringify(fermate)}`);
    if (!siFerma) appesi.shift()({ codice: 0 });
    assert.equal((await inCorso).ok === true, !siFerma);
    b.giri.at(-1).concludi([{ role: 'assistant', content: 'r' }]);
    await aspetta(() => b.registro.esporta(chi).conclusa === true, 'the other turn ends');
  }
}));
