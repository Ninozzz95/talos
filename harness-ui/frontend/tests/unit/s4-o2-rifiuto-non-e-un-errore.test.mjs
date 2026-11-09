import assert from 'node:assert/strict';
import test from 'node:test';

import { impostaLingua } from '../../src/components/lingua.js';
import { statoSessione } from '../../src/components/session-item.js';

/*
 * S4 O2 (03/11/2026, rapporto del Tester COLLAUDO-BOZZETTI-FE051-FE049, approvata da Mobile, CLI e Desktop): nella barra di sinistra
 *   una chat che il modello ha rifiutato si descriveva «L'ultimo giro si è fermato su un errore». Per il bozzetto del rifiuto (FE-051)
 *   è un'attenzione e l'unico rimedio è cambiare modello. Il server chiude ora con `motivoChiusura: 'rifiuto'`; la parola della riga
 *   resta «da riprendere», il titolo dice il rifiuto e il rimedio. La frase sta nel dizionario (processi.js), non nel codice.
 */
const rifiutata = { conclusa: true, interrotta: false, ultimoEsito: 'errore', motivoChiusura: 'rifiuto' };

test('S4-O2-BARRA — a refused chat is described as refused, with the model switch, in both languages; a real error keeps its words', () => {
  try {
    impostaLingua('it');
    const it = statoSessione(rifiutata);
    assert.deepEqual([it.classe, it.tono, it.testo], ['errore', 'warning', 'da riprendere']);
    assert.doesNotMatch(it.aiuto, /errore/u, 'a refusal is not called an error');
    assert.match(it.aiuto, /rifiutato/u);
    assert.match(it.aiuto, /[Cc]ambia modello/u);
    impostaLingua('en');
    const en = statoSessione(rifiutata);
    assert.match(en.aiuto, /refused/u);
    assert.match(en.aiuto, /[Ss]witch (to another|the) model|another model/u);
    impostaLingua('it');
    const guasto = statoSessione({ ...rifiutata, motivoChiusura: 'errore' });
    assert.match(guasto.aiuto, /errore/u, 'al contrario: a real error is still an error');
  } finally {
    impostaLingua('it');
  }
});
