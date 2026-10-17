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

test('REV2-GOAL-01 (S2) — una shell che esegue una stringa sfugge appena fra il nome e `-c` c’è un’ALTRA opzione (o la stringa arriva per un’altra porta)', () => {
  /* `shellAnnidata` guarda solo il pezzo SUBITO dopo il nome della shell. Le forme più comuni nei progetti veri hanno un'opzione in
     mezzo (`pwsh -NoProfile -Command`, `cmd /d /s /c`), e tutte nascondono l'esito come `bash -c "…|| true"`. */
  const sfuggono = [
    'pwsh -NoProfile -Command "npm test; exit 0"',
    'powershell -nop -c "npm test; exit 0"',
    'bash -x -c "npm test || true"',
    'bash --norc -c "npm test || true"',
    'bash -o pipefail -c "npm test || true"',
    'cmd /d /c "npm test & exit 0"',
    'cmd /s /c "npm test & exit 0"',
    'cmd /v:on /c "npm test & exit 0"',
    'cmd /c"npm test & exit 0"', // cmd accetta la stringa attaccata all'opzione
    'powershell "npm test; exit 0"', // Windows PowerShell: il primo argomento libero È -Command
    'bash <<< "npm test || true"', // la stringa entra dall'ingresso
    'npx -c "npm test || true"', // npx -c la esegue in una shell
    'npm exec -c "npm test || true"',
    '$SHELL -c "npm test || true"', // la shell per variabile
    '%ComSpec% /c "npm test & exit 0"',
  ];
  const ammesse = sfuggono.filter((comando) => esitoAttribuibile(comando).ok);
  assert.deepEqual(ammesse, [], 'each one hides the exit status of `npm test` (measured: 0 on this machine)');
});

test('REV2-GOAL-01b AL CONTRARIO — uno script per nome e un comando normale restano ammessi', () => {
  for (const comando of ['npm test', 'bash ./prova.sh', 'pwsh -File x.ps1', 'pwsh -NoProfile -File x.ps1', 'git diff --exit-code', 'node --test tests/a.test.mjs']) {
    assert.equal(esitoAttribuibile(comando).ok, true, comando);
  }
});

test('REV2-GOAL-02 (S3) — REV-10: un comando che INVERTE l’esito passa la proposta se il `!` non è il primo carattere', () => {
  /* `verifica.comando.startsWith('!')`: ma `time ! npm test` e `(! npm test)` invertono l'esito in bash (misurato: 0 con un comando
     che fallisce). Passano per qualunque errore, che è esattamente ciò che REV-10 voleva scartare. */
  /* G3-REV-08 (14/10): una parentesi in posizione di comando ora si nega prima ancora di guardare l'inversione — scartato lo
     stesso, col motivo della parentesi */
  for (const [comando, motivo] of [['time ! npm test', 'criterion-expects-failure'], ['(! npm test)', 'criterion-command-not-attributable']]) {
    const esito = propostaDallaRisposta(JSON.stringify({ criteria: [{ type: 'command', text: 'tests', command: comando }] }));
    assert.deepEqual(esito.scartati.map((s) => s.motivo), [motivo], `${comando}: ${JSON.stringify(esito)}`);
  }
});

test('REV2-GOAL-03 (S4) — REV-09: un `<think>` o `</think>` DENTRO una stringa del JSON butta via la risposta intera', () => {
  /* I tag si tolgono sul testo grezzo prima di leggere il JSON: `lastIndexOf('</think>')` trova quello dentro `search` e taglia via
     l'inizio dell'oggetto; `<think>` dentro una stringa taglia via la fine. Un obiettivo come «togli i tag </think> dalle risposte»
     (questo progetto ne ha) finisce sul pavimento «proposal-unreadable». */
  for (const tag of ['</think>', '<think>']) {
    const risposta = JSON.stringify({ criteria: [{ type: 'file', text: 'no stray reasoning tag', path: 'src/a.js', fact: 'not_contains', search: tag }] });
    const esito = propostaDallaRisposta(risposta);
    assert.equal(esito.pavimento, false, `${tag}: ${JSON.stringify(esito)}`);
    assert.equal(esito.criteri[0]?.verifica.testo, tag);
  }
});

test('REV2-GOAL-03b AL CONTRARIO — un blocco di ragionamento VERO (anche maiuscolo) con una bozza si toglie ancora', () => {
  const esito = propostaDallaRisposta('<THINK>draft {"criteria":[{"type":"judgement","text":"draft"}]}</THINK>{"criteria":[{"type":"judgement","text":"final"}]}');
  assert.deepEqual(esito.criteri.map((c) => c.testo), ['final']);
});

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

test('REV2-GOAL-04 (S3) — REV-03: aggiungere un criterio a un contratto con un campo ignoto DENTRO `verifica` lo perde, e dice «cambiato» a chi non ha cambiato niente', () => {
  /* `nuovoContratto({prima})` tiene l'oggetto di prima solo se `canonicalHash(noti(vecchio)) === canonicalHash(nuovo)`; ma `noti`
     tiene `verifica` com'è (coi campi ignoti) e `nuovo.verifica` è ridotta ai noti ⇒ mai uguali ⇒ il criterio torna «nuovo»: via
     `tempoMassimo` E `peso`. E `confrontaContratti` confronta `noti()` con la `verifica` intera ⇒ c1 «cambiato» ⇒ un'AGGIUNTA
     (libera per contratto) chiede una conferma che la porta delle aggiunte non può dare. Decisione owner: «campi ignoti portati
     avanti». */
  const futuro = contrattoDelFuturo();
  assert.equal(contrattoValido(futuro), true, 'premise: the newer contract is readable here');
  const esito = aggiungiCriteri(futuro, [{ testo: 'docs updated', verifica: { tipo: 'giudizio' } }]);
  assert.equal(esito.ok, true);
  assert.deepEqual(esito.contratto.criteri[0], futuro.criteri[0], 'c1 is carried forward as it was, unknown fields included');
  assert.deepEqual(confrontaContratti(futuro, esito.contratto), { aggiunti: ['c3'], tolti: [], cambiati: [], serveConferma: false, uguale: false });
});


test('REV2-GOAL-05b AL CONTRARIO — per un obiettivo non salvato la frase vera arriva, e il disco si nomina', () => {
  const errore = Object.assign(new Error('The goal was not saved: nothing changed. Try again after checking the disk.'), { code: 'SESSION_STORE_WRITE_FAILED', reason: 'goal-not-saved' });
  assert.equal(toPublicProblem(errore).explanation, 'The goal was not saved: nothing changed. Try again after checking the disk.');
});

test('REV2-GOAL-06 (S5) — REV-04: un `prossimoId` manomesso (1000) è «valido», e poi ogni aggiunta dice «troppi criteri» a un contratto di due', () => {
  const { contratto } = nuovoContratto({ criteri: [{ testo: 'a', verifica: { tipo: 'giudizio' } }, { testo: 'b', verifica: { tipo: 'giudizio' } }] });
  const manomesso = { ...contratto, prossimoId: 1000 };
  const esito = aggiungiCriteri(manomesso, [{ testo: 'c', verifica: { tipo: 'giudizio' } }]);
  assert.ok(!(contrattoValido(manomesso) && esito.motivo === 'contract-too-many-criteria'),
    'either the counter is sealed/limited so that a valid contract can always grow, or the refusal names the real cause');
});
