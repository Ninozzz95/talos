/*
 * Owner 14/10/2026 (anche per il desktop, confermato in sessione): una domanda SCADUTA non ferma il giro. L'interruttore è nel
 * registro (`domandaScadutaFerma`, di serie `true` per chi non lo chiede); il desktop lo spegne dove crea il suo registro, in
 * `server.mjs`. Questo cancello legge il sorgente come il cancello del dizionario: se la riga sparisce il desktop torna, in
 * silenzio, a fermare il giro. Il comportamento dell'interruttore lo provano `ask-ricevuta-e-riavvio.test.mjs` (ASK-EXPIRED-*).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const server = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');

test('DESK-DOMANDA-SCADUTA-01 — il registro del desktop nasce con `domandaScadutaFerma: false`, dentro le opzioni di createSessionRegistry', () => {
  const inizio = server.indexOf('createSessionRegistry(');
  assert.ok(inizio > 0, 'la premessa: server.mjs crea il registro');
  // le opzioni del registro: dalla chiamata alla prima opzione di un altro oggetto noto (la chiusura della chiamata è lontana)
  const opzioni = server.slice(inizio, inizio + 6000);
  assert.match(opzioni, /\n\s*domandaScadutaFerma:\s*false,/u);
  // AL CONTRARIO: non c'è nessun'altra impostazione che la riaccenda dopo
  assert.equal((server.match(/domandaScadutaFerma/gu) ?? []).length, 1, 'una sola riga decide');
});
