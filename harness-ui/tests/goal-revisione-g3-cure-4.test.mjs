/*
 * ⛔ QUARTA RIVERIFICA delle cure della G3 (bugfixer, 14/10/2026 sera) — commit `963fb00f4` su `feat/goal`.
 *
 * Prove ROSSE apposta. Le cure di REV-12/13 fanno ciò che dicono; restano:
 *   · cmd separa un interno dal resto anche con la VIRGOLA e l'UGUALE (non solo con lo spazio e la `/`): misurato dall'esecutore VERO
 *     del kernel (`eseguiComandoSandboxato`, dove: 'windows') con `programmaTrovato` vero, il 14/10/2026:
 *       start,/b node -e "process.exit(1)"        atteso 0 → VERDE (codice 0)
 *       start=/b node -e "process.exit(1)"        atteso 0 → VERDE
 *       start, /b node -e "process.exit(1)"       atteso 0 → VERDE
 *       call,start /b node -e "process.exit(1)"   atteso 0 → VERDE
 *   · «la stessa cartella» è l'UGUAGLIANZA dei percorsi: una conversazione che lavora in una SOTTOCARTELLA del progetto (un pacchetto
 *     di un monorepo) scrive nei file che le prove guardano, e non le ferma.
 * Rapporto: `handoff-talos-2026-09-27/bugfixer/RAPPORTO-REVISIONE-GOAL-G3-2026-10-14.md`, sezione «Quarta riverifica».
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { esitoAttribuibile } from '../src/obiettivo/contratto.mjs';
import { conStore, passo, registroAGiri } from './aiuto/banco-obiettivo.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const sempreSi = async () => ({ consentito: true });
async function aspetta(condizione, cosa) {
  const fino = Date.now() + 20_000;
  while (Date.now() < fino) { if (condizione()) return; await new Promise((r) => setTimeout(r, 5)); }
  assert.fail(`never happened: ${cosa}`);
}

test('G3-REV-14 (S2) — cmd also separates an internal command with a COMMA or an EQUALS sign: «start,/b», «start=/b», «call,start» exit 0 and are attributable', () => {
  for (const comando of ['start,/b npm test', 'start=/b npm test', 'start, /b npm test', 'call,start /b npm test', 'npm --version&&start,/b npm test']) {
    assert.equal(esitoAttribuibile(comando).ok, false, `${comando}: measured exit 0 whatever the command inside does`);
  }
});

test('G3-REV-15 (S3) — a conversation working in a SUBFOLDER of the project (one package of a monorepo) starts a turn during the checks: they are not stopped, and the result is saved', async (t) => conStore(t, async (cartellaStore) => {
  const progetto = mkdtempSync(join(tmpdir(), 'talos-g3-cura4-'));
  t.after(() => rimuoviCartellaDiProva(progetto));
  const pacchetto = join(progetto, 'packages', 'api');
  mkdirSync(pacchetto, { recursive: true });
  const cartelle = [progetto, pacchetto];
  const appesi = [];
  const b = registroAGiri(cartellaStore, {
    preparaEsecuzioneFn: () => ({ cartella: cartelle.shift() ?? progetto, comandoProva: 'npm test', task: { id: 'task-vero', consegna: 'c' } }),
    permessoDelMotoreFn: sempreSi,
    programmaTrovatoFn: async () => true,
    eseguiComandoDellaProvaFn: (riga, dove, o) => new Promise((r) => {
      appesi.push(r);
      o.segnaleStop?.addEventListener('abort', () => r({ codice: 130, fermatoSuRichiesta: true }));
    }),
  });
  const fine = [{ role: 'system', content: 's' }, { role: 'user', content: 'c' }, { role: 'assistant', content: 'r1' }];
  const { sessionId: radice } = b.registro.avvia('task-vero');
  b.giri.at(-1).concludi(fine);
  const { sessionId: delPacchetto } = b.registro.avvia('task-vero');
  b.giri.at(-1).concludi(fine);
  await passo();
  assert.equal(b.registro.contestoPropostaObiettivo(delPacchetto, 'x').cartella, pacchetto, 'premise: the second conversation works inside the first one\'s folder');

  await b.registro.impostaObiettivo(radice, 'goal', { criteri: [{ testo: 'tests pass', verifica: { tipo: 'comando', comando: 'npm test' } }] });
  let finita = null;
  const inCorso = b.registro.verificaObiettivo(radice).then((e) => { finita = e; return e; });
  await aspetta(() => appesi.length > 0 || finita !== null, 'the check starts');
  assert.equal(finita, null, `premise: the checks start (${JSON.stringify(finita?.reason)})`);
  const giriPrima = b.giri.length;
  const ripresa = b.registro.resume(delPacchetto, 'refactor the api package');
  await aspetta(() => ripresa?.erroreAvvio !== undefined || b.giri.length > giriPrima, 'the package conversation starts a turn, or is refused');
  const partito = ripresa?.erroreAvvio === undefined && b.giri.length > giriPrima;
  appesi.shift()?.({ codice: 0 });
  const esito = await inCorso;
  if (b.giri.length > giriPrima) b.giri.at(-1).concludi([{ role: 'assistant', content: 'r2' }]);
  await passo();
  assert.ok(!(partito && esito.ok === true), `a conversation in a subfolder started a turn during the checks (${partito}) AND the result was saved (${esito.ok === true})`);
}));
