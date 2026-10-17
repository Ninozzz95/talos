/*
 * ⛔ TERZA RIVERIFICA delle cure della G3 (bugfixer, 14/10/2026 sera) — commit `4949b4975` + `1ba2a1dd7` su `feat/goal`.
 *
 * Prove ROSSE apposta. Le cure di REV-08…11 fanno ciò che dicono; restano:
 *   · due verdi FALSI su Windows misurati dall'esecutore VERO del kernel (`eseguiComandoSandboxato`, dove: 'windows') con
 *     `programmaTrovato` vero, il 14/10/2026:
 *       start/b node -e "process.exit(1)"                          atteso 0 → VERDE (codice 0)
 *       npm --version&&start/b node -e "process.exit(1)"           atteso 0 → VERDE
 *       conhost.exe --headless node -e "process.exit(1)"           atteso 0 → VERDE
 *     cmd accetta un interno con l'opzione attaccata (`start/b`, come `dir/w`), e `conhost.exe` lancia e torna;
 *   · un writer della STESSA cartella che non è nella catena: un'altra conversazione sullo stesso progetto.
 * Rapporto: `handoff-talos-2026-09-27/bugfixer/RAPPORTO-REVISIONE-GOAL-G3-2026-10-14.md`, sezione «Terza riverifica».
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { esitoAttribuibile } from '../src/obiettivo/contratto.mjs';
import { conStore, passo, registroAGiri } from './aiuto/banco-obiettivo.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const sempreSi = async () => ({ consentito: true });
async function aspetta(condizione, cosa) {
  for (let i = 0; i < 4000; i += 1) { if (condizione()) return; await passo(); }
  assert.fail(`never happened: ${cosa}`);
}

test('G3-REV-12 (S2) — «start» with its switch glued (start/b, as cmd allows dir/w) and «conhost» launch and return 0: still attributable', () => {
  for (const comando of ['start/b npm test', 'npm --version&&start/b npm test', 'conhost.exe --headless npm test', 'conhost npm test']) {
    assert.equal(esitoAttribuibile(comando).ok, false, `${comando}: measured exit 0 whatever the command inside does`);
  }
});

test('G3-REV-13 (S3) — ANOTHER conversation on the same project folder starts a turn during the checks: they are not stopped, and the result is saved', async (t) => conStore(t, async (cartellaStore) => {
  /* `fermaLeProveDellaCatena` risale `padreId` e `radiceDelWorkflow`: la catena di chi lavora. Ma chi scrive nella cartella può
     essere una conversazione senza legami — la persona che apre due chat sullo stesso progetto (o un'automazione che lavora lì):
     il suo giro parte con `avviaESegui` sulla SUA voce, e le prove dell'altra non lo sanno. */
  const cartella = mkdtempSync(join(tmpdir(), 'talos-g3-cura3-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const appesi = [];
  const b = registroAGiri(cartellaStore, {
    preparaEsecuzioneFn: () => ({ cartella, comandoProva: 'npm test', task: { id: 'task-vero', consegna: 'c' } }),
    permessoDelMotoreFn: sempreSi,
    programmaTrovatoFn: async () => true,
    eseguiComandoDellaProvaFn: (riga, dove, o) => new Promise((r) => {
      appesi.push(r);
      o.segnaleStop?.addEventListener('abort', () => r({ codice: 130, fermatoSuRichiesta: true }));
    }),
  });
  const fine = [{ role: 'system', content: 's' }, { role: 'user', content: 'c' }, { role: 'assistant', content: 'r1' }];
  const { sessionId: prima } = b.registro.avvia('task-vero');
  b.giri.at(-1).concludi(fine);
  const { sessionId: seconda } = b.registro.avvia('task-vero');
  b.giri.at(-1).concludi(fine);
  await passo();
  assert.equal(b.registro.contestoPropostaObiettivo(prima, 'x').cartella, b.registro.contestoPropostaObiettivo(seconda, 'x').cartella, 'premise: the two conversations work in the same folder');

  await b.registro.impostaObiettivo(prima, 'goal', { criteri: [{ testo: 'tests pass', verifica: { tipo: 'comando', comando: 'npm test' } }] });
  const inCorso = b.registro.verificaObiettivo(prima);
  await aspetta(() => appesi.length > 0, 'the check command starts');
  const giriPrima = b.giri.length;
  const ripresa = b.registro.resume(seconda, 'refactor the login module');
  await aspetta(() => ripresa?.erroreAvvio !== undefined || b.giri.length > giriPrima, 'the other conversation starts a turn, or is refused');
  const partito = ripresa?.erroreAvvio === undefined && b.giri.length > giriPrima;
  appesi.shift()({ codice: 0 });
  const esito = await inCorso;
  if (b.giri.length > giriPrima) b.giri.at(-1).concludi([{ role: 'assistant', content: 'r2' }]);
  await passo();
  assert.ok(!(partito && esito.ok === true), `another conversation in the same folder started a turn during the checks (${partito}) AND the result was saved (${esito.ok === true})`);
}));
