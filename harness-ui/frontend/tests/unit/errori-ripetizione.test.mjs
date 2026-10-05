/*
 * BUG-E (owner 04/10/2026, sessione `3eb5e436…`): la carta d'errore del rifiuto di RIPETIZIONE
 * cadeva nel ramo «sconosciuto» («Questa forma di errore non è ancora tradotta») perché nessuna
 * regola riconosceva la frase del kernel. Qui si prova la regola `ripetizione-identica` su
 * ENTRAMBE le forme: l'inglese attuale (K3, `talosHarness.mjs:14192`) e l'italiano delle storie
 * salvate prima di K3 (le copie in `desktop/.prove/` la mostrano parola per parola).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spiegaErrore } from '../../src/components/errori.js';

const INGLESE = '⛔ the model asked 3 times for the very same thing'
  + ' in the same answer ("shell" with the same arguments),'
  + ' and kept going: the answer was closed there. The first copies were run,'
  + ' the others were not. This is not a limit on the number of tools — DIFFERENT requests in the same'
  + ' round all go through. It happens with local models when the decoder falls into repetition'
  + ' (llama.cpp/ik_llama.cpp, a known defect): with another model, or another quantization,'
  + ' it usually does not come back.';

const ITALIANO = '⛔ il modello ha chiesto 3 volte la stessa identica cosa'
  + ' nella stessa risposta ("shell" con gli stessi argomenti),'
  + ' e continuava: la risposta è stata chiusa lì. Le prime copie sono state eseguite, le altre no.'
  + ' Non è un limite sul numero di attrezzi — richieste DIVERSE nello stesso giro passano tutte.';

test('BUG-E: la ripetizione del kernel NON cade più nel sacco sconosciuto (forma inglese attuale)', () => {
  const s = spiegaErrore(INGLESE, 'fermato');
  assert.equal(s.riconosciuto, true, 'la regola deve riconoscere la frase del kernel');
  assert.equal(s.id, 'ripetizione-identica');
  assert.ok(!/non è ancora tradotta/u.test(s.perche), 'niente più «non è ancora tradotta»');
  assert.match(s.perche, /3/u, 'il numero di volte arriva nella frase tradotta');
  assert.match(s.perche, /shell/u, 'il nome dell’attrezzo arriva nella frase tradotta');
});

test('BUG-E: anche la forma ITALIANA delle storie salvate viene riconosciuta', () => {
  const s = spiegaErrore(ITALIANO, 'fermato');
  assert.equal(s.riconosciuto, true);
  assert.equal(s.id, 'ripetizione-identica');
  assert.match(s.perche, /shell/u);
});
