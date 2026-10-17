/*
 * ⛔ REVISIONE AVVERSARIA del /goal G2 (bugfixer, 14/10/2026) — il CONTRATTO da solo: `src/obiettivo/contratto.mjs`.
 *
 * Queste prove sono ROSSE apposta sul codice di `feat/goal` (testa `c671bf3b1`): ognuna mostra un difetto, la cura non è qui
 * (i file del prodotto sono della sessione desktop). Rapporto: `handoff-talos-2026-09-27/bugfixer/RAPPORTO-REVISIONE-GOAL-2026-10-14.md`.
 *
 * REV-GOAL-01 e REV-GOAL-02 sono state provate sulle SHELL VERE di questa macchina il 14/10/2026 (bash di Git, Windows
 *   PowerShell 5.1, cmd.exe da un .cmd): ogni comando qui sotto esce 0 mentre `node -e "process.exit(1)"` dentro di lui esce 1.
 *   La prova resta pura (nessuna shell lanciata): dice soltanto che `esitoAttribuibile` li dichiara attribuibili.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { SCHEMA_CONTRATTO, contrattoValido, esitoAttribuibile, nuovoContratto } from '../src/obiettivo/contratto.mjs';
import { canonicalHash } from '../src/workflow/canonical-json.mjs';

const FALLISCE = 'node -e "process.exit(1)"';

test('REV-GOAL-01 (S2 con G3) — an ESCAPED quote outside quotes is not an opening quote: the scanner skips the operator that hides the exit', () => {
  /* Il lettore tratta ogni `"`/`'` fuori dalle virgolette come apertura. Ma in bash `\"`, in PowerShell `` `" `` e in cmd `^"` sono
     un carattere letterale: l'operatore che segue è VIVO per la shell e invisibile per il lettore. Misurato sulle shell vere:
       bash        node -e "process.exit(1)" \" || true \"          → 0
       PowerShell  node -e "process.exit(1)" `" ; exit 0 # `"      → 0   (il `#` fa del secondo `" un commento)
       cmd         node -e "process.exit(1)" ^" & exit /b 0 ^"     → 0 */
  const casi = [
    [`${FALLISCE} \\" || true \\"`, 'bash'],
    [`${FALLISCE} \`" ; exit 0 # \`"`, 'PowerShell'],
    [`${FALLISCE} ^" & exit /b 0 ^"`, 'cmd'],
    [`${FALLISCE} \\' || true \\'`, 'bash, single quote'],
  ];
  const accettati = casi.filter(([comando]) => esitoAttribuibile(comando).ok === true).map(([, shell]) => shell);
  assert.deepEqual(accettati, [], `always-green commands declared attributable for: ${accettati.join(', ')}`);
  // e quindi diventano criteri di un contratto: il sistema li dirà «provati» qualunque cosa faccia l'agente
  const contratto = nuovoContratto({ criteri: [{ testo: 'The tests pass', verifica: { tipo: 'comando', comando: casi[0][0] } }] });
  assert.equal(contratto.ok, false, 'a criterion green by construction entered the contract');
});

test('REV-GOAL-01b (S3) — in cmd «&>» is a SEPARATOR followed by a redirection, not a redirection: the command after it decides the exit', () => {
  /* `dopo === '>'` fa passare `&>` come ridirezione (vero in bash). In cmd `&` separa e `>nul` ridirige il comando dopo:
       cmd   node -e "process.exit(1)" &>nul exit /b 0   → 0   (bash, la stessa riga: 1) */
  assert.equal(esitoAttribuibile(`${FALLISCE} &>nul exit /b 0`).ok, false);
});

test('REV-GOAL-02 (S3) — a command run INSIDE another (a shell with its string, a command substitution) hides its exit just like «|| true»', () => {
  /* Il lettore guarda gli operatori FUORI dalle virgolette; ma dentro la stringa di `bash -c`, `cmd /c`, `powershell -Command` la
     shell figlia li esegue tutti, e `$(…)`/backtick in bash buttano via l'esito del comando interno. Misurato (bash di Git):
       bash -c "node -e \"process.exit(1)\" || true"   → 0
       echo $(node -e "process.exit(1)")               → 0 */
  const casi = [
    'bash -c "npm test || true"',
    'sh -c \'npm test; exit 0\'',
    'cmd /c "npm test & exit 0"',
    'powershell -Command "npm test; exit 0"',
    'echo $(npm test)',
    'echo `npm test`',
    'test -n "$(npm test || true)"',
  ];
  const accettati = casi.filter((comando) => esitoAttribuibile(comando).ok === true);
  assert.deepEqual(accettati, [], 'each of these is green whatever the tests do');
});

test('REV-GOAL-03 (S4) — a contract written by a NEWER version (one field more on a criterion) makes the whole goal unreadable for this one', () => {
  /* `obiettivoValido` promette: «I campi in più (una versione più nuova) non la rendono invalida»; `contrattoValido` dice di
     guardare «la forma dei campi noti». Ma confronta `JSON.stringify` dei criteri RIFATTI con quelli letti: un campo in più su un
     criterio (con l'impronta calcolata da chi l'ha scritto, sugli stessi dati) e il contratto non vale ⇒ l'obiettivo intero è
     «illeggibile» ⇒ dopo un riavvio la conversazione torna SENZA obiettivo. Il 4174 e l'app installata leggono lo stesso archivio. */
  const base = nuovoContratto({ criteri: [{ testo: 'The tests pass', verifica: { tipo: 'comando', comando: 'npm test' } }] });
  assert.equal(base.ok, true);
  const criteri = base.contratto.criteri.map((criterio) => ({ ...criterio, peso: 2 })); // il campo di una versione di domani
  const diDomani = { schema: SCHEMA_CONTRATTO, criteri, impronta: canonicalHash({ schema: SCHEMA_CONTRATTO, criteri }) };
  assert.equal(contrattoValido(diDomani), true, 'one unknown field on a criterion: the whole contract, and the goal with it, is rejected');
});
