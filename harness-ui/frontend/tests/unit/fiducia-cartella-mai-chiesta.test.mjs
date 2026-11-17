/*
 * Falla della fiducia della cartella (revisione 10/11/2026, reperto 1; owner 11/11 12:18): la domanda per una conversazione GIÀ aperta.
 *   Il server trattiene l'Accesso pieno su una cartella mai chiesta e lo dice (`fiduciaDaChiedere`); qui la finestra decide se fare la
 *   domanda (una sola carta per conversazione, mai sul telefono collegato) e cosa dice la riga fissa mentre aspetta.
 *   · DOMANDA-01: la carta solo per la conversazione aperta, solo con `fiduciaDaChiedere`, mai due volte, mai sul telefono;
 *   · RIGA-02: mentre aspetta, la riga dice che l'Accesso pieno aspetta la risposta, in inglese e in italiano.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { impostaLingua } from '../../src/components/lingua.js';
import { serveLaDomanda, testiRigaFiducia } from '../../src/components/fiducia-cartella.js';

test('DOMANDA-01: la carta per una conversazione aperta trattenuta, una volta sola, mai sul telefono', () => {
  const fiducia = { sessionId: 's1', fiduciaDaChiedere: true, pienoTrattenuto: true };
  assert.equal(serveLaDomanda(fiducia, { sessioneAperta: 's1' }), true);
  assert.equal(serveLaDomanda(fiducia, { sessioneAperta: 's1', cartaAperta: 's1' }), false, 'mai due carte di fila');
  assert.equal(serveLaDomanda(fiducia, { sessioneAperta: 's1', cartaAperta: 's0' }), true, 'la carta di un\'altra conversazione non conta');
  assert.equal(serveLaDomanda(fiducia, { sessioneAperta: 's2' }), false, 'la fiducia di un\'altra conversazione');
  assert.equal(serveLaDomanda(fiducia, { sessioneAperta: 's1', telefono: true }), false, 'il telefono collegato resta escluso');
  assert.equal(serveLaDomanda({ ...fiducia, fiduciaDaChiedere: false }, { sessioneAperta: 's1' }), false);
  assert.equal(serveLaDomanda({ sessionId: 's1', cartellaNonFidata: true, pienoTrattenuto: true }, { sessioneAperta: 's1' }), false, 'un «No» non si richiede');
  assert.equal(serveLaDomanda({ ...fiducia, cartellaNonFidata: true }, { sessioneAperta: 's1' }), false, 'un «No» vince su un «da chiedere» rimasto indietro');
  assert.equal(serveLaDomanda(null, { sessioneAperta: 's1' }), false);
});

test('RIGA-02: mentre aspetta la risposta, la riga fissa lo dice', () => {
  impostaLingua('en');
  assert.deepEqual(testiRigaFiducia({ fiduciaDaChiedere: true, pienoTrattenuto: true }),
    { frase: 'Full access is waiting for your answer: do you trust this folder?', nota: 'Trust it from the permissions menu.' });
  impostaLingua('it');
  assert.deepEqual(testiRigaFiducia({ fiduciaDaChiedere: true, pienoTrattenuto: true }),
    { frase: 'L’Accesso pieno aspetta la tua risposta: ti fidi di questa cartella?', nota: 'Dai fiducia dal menu dei permessi.' });
  assert.equal(testiRigaFiducia({ cartellaNonFidata: true, pienoTrattenuto: true }).frase, 'Non fidata: istruzioni spente, l’Accesso pieno chiede prima di modificare.', 'il «No» resta com\'era');
});
