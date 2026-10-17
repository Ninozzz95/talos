/*
 * ⛔ RIVERIFICA BREVE delle cure della G3 (bugfixer, 14/10/2026 sera) — commit `33f8e914c` su `feat/goal`.
 *
 * Prova ROSSA apposta: la cura di G3-REV-03 ferma le prove quando parte un giro di QUESTA conversazione, ma i passi che scrivono
 * nella stessa cartella possono essere di un'ALTRA sessione — una figlia delegata viva — e la madre risulta ferma.
 * Rapporto: `handoff-talos-2026-09-27/bugfixer/RAPPORTO-REVISIONE-GOAL-G3-2026-10-14.md`, sezione «Riverifica delle cure».
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { esitoAttribuibile } from '../src/obiettivo/contratto.mjs';
import { programmaTrovato, verificaCriterio } from '../src/obiettivo/verifica.mjs';
import { conStore, passo, registroAGiri } from './aiuto/banco-obiettivo.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const sempreSi = async () => ({ consentito: true });

test('G3-REV-05 (S3) — a DELEGATED sub-agent still writing in the same folder does not stop the checks: the mother is «stopped», the checks run and the result is saved', async (t) => conStore(t, async (cartellaStore) => {
  /* `verificaObiettivo` guarda solo `voce.conclusa/interrotta` della madre. Con la delega il giro della madre finisce e la figlia
     continua a lavorare nella STESSA cartella (la madre riparte da sola quando le figlie finiscono, C3): le prove leggono file a
     metà, e l'esito si salva coi suoi tentativi. Il registro lo sa già: `sessioneFermaQui` (l'affitto) conta una madre con figlie
     vive come IN USO (`subagentOrchestrator.contaFigliAttivi`). */
  const cartella = mkdtempSync(join(tmpdir(), 'talos-g3-cura-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const chiamate = [];
  const b = registroAGiri(cartellaStore, {
    preparaEsecuzioneFn: () => ({ cartella, comandoProva: 'npm test', task: { id: 'task-vero', consegna: 'c' } }),
    permessoDelMotoreFn: sempreSi,
    programmaTrovatoFn: async () => true,
    eseguiComandoDellaProvaFn: async (riga) => { chiamate.push(riga); return { codice: 0 }; },
  });
  const { sessionId } = b.registro.avvia('task-vero', { permessi: 'Full access' });
  const madre = b.giri.at(-1);
  const delega = await madre.input.onDelega('fix the login loop', cartella, { modalita: 'modifica' });
  assert.equal(delega?.esito, 'avviato', `premise: a sub-agent is started (${JSON.stringify(delega)})`);
  assert.equal(b.giri.length, 2, 'premise: the sub-agent turn is running (and keeps running)');
  madre.concludi([{ role: 'system', content: 's' }, { role: 'user', content: 'c' }, { role: 'assistant', content: 'delegated' }]);
  await passo();
  const figlia = b.giri[1];

  await b.registro.impostaObiettivo(sessionId, 'goal', { criteri: [{ testo: 'tests pass', verifica: { tipo: 'comando', comando: 'npm test' } }] });
  const esito = await b.registro.verificaObiettivo(sessionId);
  figlia.concludi([{ role: 'assistant', content: 'child done' }]); // la figlia finisce DOPO
  await passo();
  assert.notEqual(esito.ok, true, `the checks ran (${chiamate.length} command) and were saved while a sub-agent was writing in the same folder`);
}));

test('G3-REV-06 (S2) — «start» in cmd launches and returns at once: «start /b npm test» exits 0 whatever the tests do, and the contract calls it attributable', () => {
  /* Misurato il 14/10/2026 dall'esecutore VERO del kernel (`eseguiComandoSandboxato`, dove: 'windows'):
       node -e "process.exit(1)"                 → 1
       start /b node -e "process.exit(1)"        → 0
       start /wait /b node -e "process.exit(1)"  → 0
     `esitoAttribuibile` dice `{ok:true}` a tutte e tre, e `programmaTrovato` dice «c'è» (`start` è un interno di cmd): con la G3
     il sistema dichiara VERDE un criterio che non ha provato niente. È lo stesso caso del `&` in coda (in sottofondo), detto con
     una parola. */
  for (const comando of ['start /b npm test', 'start /wait /b npm test', 'start "" npm test']) {
    assert.equal(esitoAttribuibile(comando).ok, false, `${comando}: green by construction on Windows`);
  }
});

test('G3-REV-07 (S4) — after the REV-02 cure, a PATH folder that cannot be reached (an offline network share) makes EVERY program «present»: REV-01 comes back', { skip: process.platform !== 'win32' }, async (t) => {
  /* `eUnFile` ora conta come «c'è» ogni errore diverso da ENOENT/ENOTDIR. Misurato: `stat` su `\\server-che-non-esiste\share\x.exe`
     dà UNKNOWN. Un PATH con una condivisione di rete spenta (comune in ufficio) ⇒ `programmaTrovato` dice `true` per un programma
     che non c'è ⇒ con `uscita: 1` il criterio torna VERDE (REV-01). Anche lento: ogni candidato aspetta la rete. */
  const cartella = mkdtempSync(join(tmpdir(), 'talos-g3-unc-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const env = { PATH: '\\\\server-che-non-esiste-xyz\\share', PATHEXT: '.EXE' };
  const trovato = await programmaTrovato('grep-che-non-esiste-xyz -q TODO x.js', { cartella, env });
  const v = await verificaCriterio({ id: 'c1', verifica: { tipo: 'comando', comando: 'grep-che-non-esiste-xyz -q TODO x.js', uscita: 1 } }, {
    cartella, permessoComando: sempreSi, permessoLettura: sempreSi,
    eseguiComando: async () => ({ codice: 1, ambiente: 'windows' }),
    programmaTrovato: (c) => programmaTrovato(c, { cartella, env }),
  });
  assert.notEqual(v.esito, 'verde', `a program that does not exist is «present» (${trovato}) because a PATH folder is offline, and the criterion is ${v.esito}`);
});
