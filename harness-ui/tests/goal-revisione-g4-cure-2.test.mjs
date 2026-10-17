/*
 * ⛔ TERZA REVISIONE della G4 del /goal (bugfixer, 14/10/2026 sera) — le cure `283a47e5e` su `feat/goal-g4`.
 *
 * Le cure di G4-REV-06/07 fanno ciò che dicono (le mie due prove sono verdi). Il coordinatore DICHIARA un limite: «altri valori
 * casuali (id, hash) restano “progresso”; il tetto dei 20 giri resta la rete sotto». Questa prova mostra perché, per me, il limite
 * va curato: il caso più comune non è un id raro, è l'INDIRIZZO di un oggetto che pytest stampa in ogni diff di un'asserzione
 * fallita (`<User object at 0x7f3b2c1d9e50>`), e un UUID di una richiesta. Con loro la pausa «nessun progresso» non arriva su
 * nessun progetto Python: si paga fino al tetto di 20 giri.
 * Rapporto: `handoff-talos-2026-09-27/bugfixer/RAPPORTO-REVISIONE-GOAL-G3-2026-10-14.md`, sezione «Terza revisione della G4».
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { ceProgresso } from '../src/obiettivo/ciclo.mjs';

test('G4-REV-08 (S4) — a Python object address (0x7f…) or a request UUID in the failure makes every turn «progress»', () => {
  const rosso = (indirizzo, uuid) => ({ verdetti: [{ id: 'c1', impronta: 'sha256:x', esito: 'rosso', motivo: { tipo: 'exit-code' },
    uscita: { codice: 1, coda: `[stdout]\nE       AssertionError: assert <User object at ${indirizzo}> == None\nE        +  where request_id = '${uuid}'\nFAILED tests/test_login.py::test_logout - AssertionError\n1 failed, 11 passed` } }] });
  assert.equal(ceProgresso(rosso('0x7f3b2c1d9e50', '3f2a9c1e-8b7d-4e6f-9a01-2c3d4e5f6a7b'), rosso('0x7fd41a03b2c0', 'a91e0b4c-1d2e-4f3a-8b5c-6d7e8f9a0b1c'), { scritture: 0 }), false,
    'the same failing test; only the object address and the request id changed');
});
