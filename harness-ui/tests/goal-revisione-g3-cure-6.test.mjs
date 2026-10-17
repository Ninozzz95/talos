/*
 * ⛔ SESTA RIVERIFICA delle cure della G3 (bugfixer, 14/10/2026 sera) — commit `e58cb5b30` su `feat/goal`.
 *
 * Prova ROSSA apposta. Le cure di REV-16/17 fanno ciò che dicono; resta un verde FALSO misurato dall'esecutore VERO del kernel
 * (`eseguiComandoSandboxato`, dove: 'windows') col `programmaTrovato` vero, il 14/10/2026:
 *   "C:\Windows\System32\cmd.exe"/c "node -e process.exit(1) || exit 0"   atteso 0 → VERDE (codice 0)
 * La shell col suo PERCORSO fra virgolette e l'opzione attaccata: il pezzo è `C:\Windows\System32\cmd.exe/c`; `nome` è l'ultimo
 * pezzo dopo `/` (`c`), `primo` è la parte prima della `/` col percorso intero (`c:\windows\system32\cmd`), e nessuno dei due è `cmd`.
 * (Senza virgolette lo stesso comando NON parte — cmd lo legge come un programma che non c'è, «non verificabile».)
 * Rapporto: `handoff-talos-2026-09-27/bugfixer/RAPPORTO-REVISIONE-GOAL-G3-2026-10-14.md`, sezione «Sesta riverifica».
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { esitoAttribuibile } from '../src/obiettivo/contratto.mjs';

/* ⛔ LIMITE DICHIARATO, non un difetto da curare — owner 14/10/2026 notte, «Fiducia come Hermes»: il sì della persona al
   contratto basta; i controlli delle forme restano come aiuto, e le forme rimaste si DICHIARANO invece di inseguirle (questa era la
   sesta di fila). Hermes esegue i cancelli così come sono (`hermes_cli/goals.py:396`). La prova resta, come `todo`: dice la forma
   che passa, e diventerà verde da sola se un giorno la si cura. */
test('G3-REV-18 (S2) — the shell by its QUOTED full path with the switch glued («"C:\\…\\cmd.exe"/c "…"») exits 0 and is attributable', { todo: 'declared limit, owner decision 14/10/2026: trust the confirmed contract, as Hermes' }, () => {
  for (const comando of [
    '"C:\\Windows\\System32\\cmd.exe"/c "npm test || exit 0"',
    '"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"/c "npm test; exit 0"',
    '"C:\\Windows\\System32\\cmd.exe",/c "npm test || exit 0"',
  ]) {
    assert.equal(esitoAttribuibile(comando).ok, false, `${comando}: the inner command is hidden from the reader`);
  }
});
