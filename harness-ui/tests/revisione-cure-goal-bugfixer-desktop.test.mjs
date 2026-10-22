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


test('REV2-GOAL-05 (S4) — 22/10/2026: i due motivi del riassunto storto (`summary-invalid-result`, `summary-invalid-history`) sono spariti col /compact che scrive un record (S2-A): né il registro, né la copia pubblica, né il dizionario li dicono più', async () => {
  const { readFileSync } = await import('node:fs');
  const testi = ['../src/session-registry.mjs', '../src/public-problem.mjs', '../frontend/src/i18n/testi/errori.js']
    .map((f) => readFileSync(new URL(f, import.meta.url), 'utf8'));
  for (const motivo of ['summary-invalid-result', 'summary-invalid-history', 'summary_invalid_result', 'summary_invalid_history']) {
    for (const testo of testi) assert.equal(testo.includes(`'${motivo}'`) || testo.includes(`.${motivo}'`), false, motivo);
  }
  /* e il codice resta quello del disco: la sua copia neutra non ha più eccezioni per motivo */
  const problema = toPublicProblem(Object.assign(new Error('x'), { code: 'SESSION_STORE_WRITE_FAILED', reason: 'summary-not-saved' }));
  assert.equal(typeof problema.title, 'string');
});


