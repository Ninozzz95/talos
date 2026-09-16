import assert from 'node:assert/strict';
import test from 'node:test';

import { MARCATORE_CARTELLA, staccaCartellaFinale } from '../src/kernel/talosHarness.mjs';

/*
 * ⛔ 16/09 — il tracciamento della cartella dopo un comando NON funzionava sul ramo Windows, e funzionava su POSIX.
 *   Segnalato dalla sessione «talos cli», riprodotto qui PRIMA della cura: POSIX → '/home/x', Windows → null con CRLF
 *   e null anche con un solo LF. La causa non è il fine riga: è che `echo.` va a capo dopo il marcatore e `printf` no.
 *   ⇒ Vive in un file suo, fuori da `talosHarness.test.mjs`, perché quel file è in lavorazione in un'altra corsia.
 */
const M = MARCATORE_CARTELLA;

test('CWD-WIN-01 — la coda Windows (`echo.` che va a capo, CRLF) restituisce la cartella stampata da `cd`', () => {
  assert.equal(staccaCartellaFinale(`out\r\n${M}\r\nC:\\Users\\x\r\n`).cartella, 'C:\\Users\\x');
});

test('CWD-WIN-02 — anche con un solo LF dopo il marcatore: la controprova che non era il \\r', () => {
  assert.equal(staccaCartellaFinale(`out\n${M}\nC:\\Users\\x\n`).cartella, 'C:\\Users\\x');
});

test('CWD-POSIX-01 — la coda POSIX (`printf` senza a-capo, percorso sulla stessa riga) continua a funzionare', () => {
  assert.equal(staccaCartellaFinale(`out\n${M}/home/x\n`).cartella, '/home/x');
});

test('CWD-TESTO-01 — il testo restituito è l\'uscita del comando SENZA la coda, nei due rami', () => {
  assert.equal(staccaCartellaFinale(`riga 1\r\nriga 2\r\n${M}\r\nC:\\x\r\n`).testo, 'riga 1\r\nriga 2');
  assert.equal(staccaCartellaFinale(`riga 1\nriga 2\n${M}/x\n`).testo, 'riga 1\nriga 2');
});

test('⛔ AL CONTRARIO — senza marcatore, o con il marcatore e NIENTE dopo (un `cd` fallito), la cartella è null', () => {
  assert.equal(staccaCartellaFinale('solo uscita\n').cartella, null);
  assert.equal(staccaCartellaFinale(`out\r\n${M}\r\n\r\n`).cartella, null);
  assert.equal(staccaCartellaFinale(`out\n${M}`).cartella, null);
});
