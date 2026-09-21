import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASSI_STATO_BOARD, statoBoard } from '../../src/components/board.js';

/*
 * ⛔ 11/09 sera — «undefined is not iterable» sul Board: `statoSessione` aveva due classi (`fermata`,
 * `pendente`) che la mappa del Board non conosceva, e la pagina cadeva intera. Qui si passa per il
 * Board OGNI forma di sessione che la sorgente sa produrre; una classe nuova senza riga deve far
 * diventare rosso QUESTO test, non la pagina dell'owner.
 */
const FORME = [
  { nome: 'attesa', sessione: { inAttesaApprovazione: true, conclusa: false } },
  { nome: 'interrotto', sessione: { interrotta: true, conclusa: false } },
  { nome: 'vivo', sessione: { conclusa: false } },
  { nome: 'fermata', sessione: { conclusa: true, ultimoEsito: 'errore', motivoChiusura: 'fermata' } },
  { nome: 'errore', sessione: { conclusa: true, ultimoEsito: 'errore', motivoChiusura: 'errore' } },
  { nome: 'successo', sessione: { conclusa: true, ultimoEsito: 'successo', motivoChiusura: 'fine-lavoro' } },
  { nome: 'ignoto', sessione: { conclusa: true, ultimoEsito: null } },
];

for (const forma of FORME) {
  test(`BOARD-STATI · ${forma.nome}: ha una riga nella mappa e un testo umano`, () => {
    const s = statoBoard(forma.sessione);
    assert.ok(CLASSI_STATO_BOARD.includes(s.chiave), `classe «${s.chiave}» senza riga nel Board`);
    assert.equal(typeof s.testo, 'string');
    assert.ok(s.testo.length > 0);
  });
}

test('BOARD-STATI · pendente è nella mappa (la «Nuova» in attesa del primo messaggio)', () => {
  assert.ok(CLASSI_STATO_BOARD.includes('pendente'));
});

test('BOARD-STATI · verso contrario: una classe sconosciuta non fa cadere la pagina, la dichiara', () => {
  // statoSessione non può produrla oggi: si simula il ripiego chiamando la mappa con una sessione che
  // la sorgente classifica «ignoto» e verificando che il ripiego esista per costruzione.
  const s = statoBoard({ conclusa: true, ultimoEsito: 'qualcosa-di-nuovo' });
  assert.equal(typeof s.testo, 'string');
});
