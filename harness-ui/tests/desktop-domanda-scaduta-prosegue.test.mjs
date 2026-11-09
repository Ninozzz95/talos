/*
 * Owner 14/10/2026 (anche per il desktop, confermato in sessione): una domanda SCADUTA non ferma il giro. L'interruttore è nel
 * registro (`domandaScadutaFerma`, di serie `true` per chi non lo chiede); il desktop lo spegne dove crea il suo registro, in
 * `server.mjs`. Questo cancello legge il sorgente come il cancello del dizionario: se la riga sparisce il desktop torna, in
 * silenzio, a fermare il giro. Il comportamento dell'interruttore lo provano `ask-ricevuta-e-riavvio.test.mjs` (ASK-EXPIRED-*).
 *
 * 04/11/2026 (ottava suite della candidata): la prova guardava una finestra FISSA di 6000 caratteri dopo `createSessionRegistry(`;
 * le opzioni sono cresciute (blocchi vivi, Passi) e la riga, ancora al suo posto, era finita a 6062. Ora le opzioni si leggono fino
 * alla parentesi che CHIUDE la chiamata, contata su un sorgente con stringhe e commenti mascherati (la stessa maschera del
 * cricchetto ASSERT-ERRORE): niente finestra da allargare a mano, e una riga fuori dalla chiamata non conta.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { mascheraStringheECommenti } from './aiuto/censimento-assert-errore.mjs';

const server = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');

/** Il testo VERO della prima chiamata `nome(...)`, fino alla parentesi che la chiude; `null` se manca o non chiude. */
function chiamataIntera(sorgente, nome) {
  const inizio = sorgente.indexOf(`${nome}(`);
  if (inizio < 0) return null;
  const mascherato = mascheraStringheECommenti(sorgente);
  let profondita = 0;
  for (let i = inizio + nome.length; i < mascherato.length; i += 1) {
    const c = mascherato[i];
    if (c === '(' || c === '[' || c === '{') profondita += 1;
    else if (c === ')' || c === ']' || c === '}') {
      profondita -= 1;
      if (profondita === 0) return sorgente.slice(inizio, i + 1);
    }
  }
  return null;
}

const RIGA = /\n\s*domandaScadutaFerma:\s*false,/u;

test('DESK-DOMANDA-SCADUTA-01 — il registro del desktop nasce con `domandaScadutaFerma: false`, dentro le opzioni di createSessionRegistry', () => {
  assert.ok(server.indexOf('createSessionRegistry(') > 0, 'la premessa: server.mjs crea il registro');
  const opzioni = chiamataIntera(server, 'createSessionRegistry');
  assert.ok(opzioni, 'la chiamata a createSessionRegistry si chiude');
  assert.match(opzioni, RIGA);
  // AL CONTRARIO: non c'è nessun'altra impostazione che la riaccenda dopo
  assert.equal((server.match(/domandaScadutaFerma/gu) ?? []).length, 1, 'una sola riga decide');
});

test('DESK-DOMANDA-SCADUTA-02 — AL CONTRARIO: le opzioni si leggono fino alla chiusura VERA della chiamata, non oltre', () => {
  const lunga = 'x'.repeat(7000);
  const dentro = `const r = createSessionRegistry(f({\n  a: '))', // ) in un commento\n  b: '${lunga}',\n  domandaScadutaFerma: false,\n}));\n`;
  assert.match(chiamataIntera(dentro, 'createSessionRegistry'), RIGA, 'dentro la chiamata: anche oltre 7000 caratteri e dopo parentesi in stringhe e commenti');
  const fuori = `const r = createSessionRegistry(f({\n  a: 1,\n}));\nconst altro = {\n  domandaScadutaFerma: false,\n};\n`;
  assert.doesNotMatch(chiamataIntera(fuori, 'createSessionRegistry'), RIGA, 'la stessa riga DOPO la chiusura non vale');
  assert.equal(chiamataIntera('createSessionRegistry({ a: 1 ', 'createSessionRegistry'), null, 'una chiamata che non chiude non si legge');
});
