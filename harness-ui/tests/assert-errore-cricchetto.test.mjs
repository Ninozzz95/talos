/*
 * ⛔ ASSERT-ERRORE (08/10/2026, bugfixer; osservazione della CLI) — IL CRICCHETTO. Una `assert.throws(fn)` / `assert.rejects(p)` senza
 *   il secondo argomento passa con qualunque errore, anche un `ReferenceError` (una funzione non importata): la prova è verde per la
 *   ragione sbagliata. Le 70 di oggi, in 39 file, sono il debito in `assert-errore-debito.json`; questa prova fallisce se un file ne
 *   ha PIÙ del suo debito (una nuova è entrata) o MENO (una è stata curata e il debito va abbassato: il cricchetto scende soltanto).
 * Per curarne una: il secondo argomento è il codice o la classe vera (`{ code: 'X' }`, `TypeError`, `/messaggio preciso/`), e la cura
 *   si prova rompendo l'import — la prova deve diventare rossa.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { assertSenzaErrorePerFile, mascheraStringheECommenti, virgoleDiPrimoLivello } from './aiuto/censimento-assert-errore.mjs';

const RADICE = join(import.meta.dirname, '..');
/* Ogni cartella con prove di questo pacchetto, più il motore del contesto accanto. R4 (review del collega, 08/10): la R3 guardava solo
   `tests` e `frontend/tests`, e ne restavano fuori 17 (11 in `desktop/tests`, 6 in `src/kernel/talosHarness.test.mjs`, la prova del kernel
   che la CLI porta con sé). */
export const CARTELLE = ['tests', 'frontend/tests', 'desktop/tests', 'src', '../context-engine/tests'];

test('ASSERT-ERRORE-01 — il censimento distingue un argomento da due, anche con virgole nelle stringhe, a capo e nei commenti', () => {
  const conta = (testo) => { const m = mascheraStringheECommenti(testo); return virgoleDiPrimoLivello(m, m.indexOf('(') + 1); };
  assert.equal(conta("assert.throws(() => f(/'/))"), 0, 'un apice dentro una regex non apre una stringa');
  assert.equal(conta('assert.throws(() => f(), /a, b/)'), 1, 'la virgola dentro la regex non conta, quella prima sì');
  assert.equal(conta('assert.throws(() => f(a / b, c))'), 0, 'una divisione non è una regex');
  /* il caso vero che aveva ingannato la prima maschera (workspace-foundations.test.mjs:90-91): una regex con ["'] PRIMA della chiamata */
  const file = "assert.doesNotMatch(text,/=[\"'](?:a)[\"']/);\nawait assert.rejects(access(x));\n";
  const m = mascheraStringheECommenti(file);
  const dove = m.indexOf('assert.rejects(');
  assert.ok(dove > 0, 'la chiamata dopo la regex resta visibile');
  assert.equal(virgoleDiPrimoLivello(m, dove + 'assert.rejects('.length), 0);
  assert.equal(conta('assert.throws(() => f(1, 2))'), 0, 'le virgole dentro la funzione non contano');
  assert.equal(conta("assert.throws(() => f('a, b'))"), 0, 'né quelle dentro una stringa');
  assert.equal(conta('assert.throws(() => f(`x, ${y}`))'), 0, 'né quelle dentro un template');
  assert.equal(conta('assert.throws(() => f() /* , TypeError */)'), 0, 'né quelle dentro un commento');
  assert.equal(conta('assert.throws(() => f(), TypeError)'), 1);
  assert.equal(conta('assert.rejects(\n  esegui({ a: 1, b: 2 }),\n  { code: "X" },\n)'), 2, 'una virgola finale dopo il secondo argomento conta, e il secondo c\'è');
  assert.equal(conta('assert.throws(() => f({ a: [1, 2] }), /impronta/)'), 1);
});

test('ASSERT-ERRORE-02 — cricchetto: nessuna assert.throws/rejects NUOVA senza l\'errore atteso, e il debito scende soltanto', () => {
  const debito = JSON.parse(readFileSync(join(RADICE, 'tests', 'assert-errore-debito.json'), 'utf8'));
  const oggi = assertSenzaErrorePerFile(RADICE, CARTELLE);
  const cresciuti = Object.entries(oggi).filter(([f, n]) => n > (debito[f] ?? 0)).map(([f, n]) => `${f}: ${n} (debito ${debito[f] ?? 0})`);
  assert.deepEqual(cresciuti, [], `assert.throws/rejects senza il secondo argomento (passano anche con un ReferenceError): ${cresciuti.join('; ')}`);
  const scesi = Object.entries(debito).filter(([f, n]) => (oggi[f] ?? 0) < n).map(([f, n]) => `${f}: ${oggi[f] ?? 0} (debito ${n})`);
  assert.deepEqual(scesi, [], `curate: abbassare il debito in assert-errore-debito.json: ${scesi.join('; ')}`);
});
