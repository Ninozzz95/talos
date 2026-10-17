/*
 * Le prove di `revisione-cure-goal-bugfixer.test.mjs` che confrontano il server col Desktop (frontend/, desktop/, scripts/), separate il 15/10/2026 su
 * richiesta della CLI: il file originale prova solo src/ e gira anche nel ramo CLI, che non ha quelle cartelle. Stessa testa,
 * stesse prove, nessuna riga cambiata.
 */
/*
 * ⛔ REVISIONE AVVERSARIA di c5196ca8a «le cure degli undici difetti del /goal» (bugfixer, 14/10/2026, seconda passata).
 *
 * Prove ROSSE apposta sul codice di `feat/goal` (testa `c5196ca8a`): ognuna mostra un difetto che la cura ha lasciato o portato;
 * la cura non è qui. Le prove «AL CONTRARIO» sono verdi e restano verdi dopo la cura.
 * Rapporto: `handoff-talos-2026-09-27/bugfixer/RAPPORTO-REVISIONE-ZAI-E-CURE-GOAL-2026-10-14.md`.
 *
 * Gli esiti delle forme di shell sono MISURATI sulle shell vere di questa macchina (Windows 11, Git Bash 5, cmd, Windows
 * PowerShell 5.1, pwsh 7) prima di scrivere le prove: `bash -x -c "false || true"` → 0, `bash --norc -c` → 0, `bash <<< "false ||
 * true"` → 0, `cmd /d /c "dir nonexistent & exit 0"` → 0 (senza `& exit 0` → 1), `powershell -NoProfile -Command "cmd /c exit 1;
 * exit 0"` → 0, `powershell "cmd /c exit 1; exit 0"` → 0, `pwsh -nop -c …` → 0, `npx -c "… || …"` → 0, `bash -c 'time ! false'` → 0,
 * `bash -c '(! false)'` → 0.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { aggiungiCriteri, confrontaContratti, contrattoValido, esitoAttribuibile, nuovoContratto } from '../src/obiettivo/contratto.mjs';
import { propostaDallaRisposta } from '../src/obiettivo/proposta.mjs';
import { canonicalHash } from '../src/workflow/canonical-json.mjs';
import { toPublicProblem } from '../src/public-problem.mjs';
import { testoErroreServer } from '../frontend/src/components/errori.js';
import { impostaLingua } from '../frontend/src/components/lingua.js';






/** Un contratto scritto da una versione PIÙ NUOVA: un campo ignoto sul criterio e uno dentro la sua `verifica`, impronta giusta. */
function contrattoDelFuturo() {
  const { contratto } = nuovoContratto({ criteri: [{ testo: 'tests pass', verifica: { tipo: 'comando', comando: 'npm test' } }, { testo: 'reads well', verifica: { tipo: 'giudizio' } }] });
  const futuro = structuredClone(contratto);
  futuro.criteri[0].peso = 3;
  futuro.criteri[0].verifica.tempoMassimo = 120;
  // adattata 14/10 (sessione desktop): dopo REV2-GOAL-06 il contatore `prossimoId` sta nel sigillo
  futuro.impronta = canonicalHash({ schema: futuro.schema, criteri: futuro.criteri, prossimoId: futuro.prossimoId });
  return futuro;
}


test('REV2-GOAL-05 (S4) — REV-06: la copia «neutra» di SESSION_STORE_WRITE_FAILED manda a controllare il DISCO anche quando è il MODELLO ad aver dato un riassunto storto', () => {
  /* `summary-invalid-result` e `summary-invalid-history` (session-registry.mjs, compattazione) usano lo stesso codice: la frase del
     motivo arriva, ma il titolo («Save failed») e l'azione («Check the free space on the disk») sono quelli del codice. Prima
     dicevano «Try compacting again», che per questi due era giusto. */
  for (const [motivo, frase] of [
    ['summary-invalid-result', 'The summary did not return a valid result. The original history remains available.'],
    ['summary-invalid-history', 'The summary does not contain a valid history. The original history remains available.'],
  ]) {
    const errore = Object.assign(new Error(frase), { code: 'SESSION_STORE_WRITE_FAILED', reason: motivo });
    const problema = toPublicProblem(errore);
    const busta = { code: 'SESSION_STORE_WRITE_FAILED', message: problema.title, ...problema, reason: motivo };
    for (const lingua of ['en', 'it']) {
      impostaLingua(lingua);
      const detto = testoErroreServer(busta);
      assert.doesNotMatch(`${detto.title} · ${detto.action}`, /disk|disco|space|spazio|save failed|salvataggio non riuscito/iu, `${motivo} (${lingua}): «${detto.title} · ${detto.action}»`);
    }
  }
  impostaLingua('it');
});


