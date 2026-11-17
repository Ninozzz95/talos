/*
 * Reperto 4 della revisione COMPUTER USE (giudice v1470, correzione 6 della v1472): l'aiutante partiva con `['mcp']` (`aiutante-mcp.mjs`), e cua accende
 * di serie il SUO cursore (`cursor-overlay/src/lib.rs:97` `enabled: true`; «Pass `--no-overlay` to disable», `:86`). Il bozzetto del computer use del PC
 * vuole «MAI il cursore dell'aiutante»: sullo schermo si vede solo il cursore di TALOS. Hermes fa la scelta opposta su Windows (cursore di cua acceso di
 * serie, `tools/computer_use/cua_backend.py:45-50`): è una scelta nostra, scritta qui. `mcp --no-overlay` è accettato da cua (`cua-driver/src/cli.rs:782-794`,
 * le bandiere del cursore si tolgono prima del sottocomando; non è fra quelle riservate a `serve`). L'aiutante è finto: nessuna prova tocca lo schermo.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { creaAiutanteMcp } from '../src/computer-use/aiutante-mcp.mjs';

const QUI = dirname(fileURLToPath(import.meta.url));
const FINTO = join(QUI, 'fixtures', 'aiutante-mcp-finto.mjs');
const IMPRONTA_FINTA = createHash('sha256').update(readFileSync(FINTO)).digest('hex');

/* Giudice v1790 (13/11): il cursore dell'aiutante si spegne SOLO col segno di TALOS davvero acceso, che il guscio dice al server con `TALOS_SEGNO_ACCESO=1`
   (`computer-use-segno-dal-guscio.test.mjs` prova il caso spento, la CLI e il filo intero). */
test('AIUT-NC1: col segno di TALOS acceso l\'aiutante parte col suo cursore spento (`mcp --no-overlay`): sullo schermo solo il cursore di TALOS', async (t) => {
  const chiamate = [];
  const avvia = (exe, args, opzioni) => { chiamate.push(args); return spawn(process.execPath, [exe, ...args], opzioni); };
  const a = creaAiutanteMcp({ exe: FINTO, improntaAttesa: IMPRONTA_FINTA, avvia, ambiente: { ...process.env, TALOS_SEGNO_ACCESO: '1' } });
  t.after(() => a.chiudi());
  assert.deepEqual(await a.apri(), { ok: true }, 'l\'aiutante parte e risponde con la bandiera');
  assert.deepEqual(chiamate, [['mcp', '--no-overlay']]);
});
