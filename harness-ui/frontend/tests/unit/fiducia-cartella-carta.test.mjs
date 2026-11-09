/*
 * Decisioni 173, 189 e 196 (owner 04/11/2026), la domanda «Ti fidi di questa cartella?» sul PC, coi pezzi che esistono già
 *   (`components/fiducia-cartella.js`): la carta di permesso della chat senza «Per questa sessione», la riga fissa, la voce del velo.
 *   · CARTA-01: due pulsanti coi testi della CLI, il «No» spiegato nella nota; il «Sì» salva true e chiude la carta con l'esito;
 *   · CARTA-02: il «No» salva false; un salvataggio che fallisce lascia la carta aperta con l'errore e i pulsanti di nuovo attivi;
 *   · RIGA-01: la riga fissa solo con `cartellaNonFidata`; il testo dell'Accesso pieno solo con `pienoTrattenuto`;
 *   · VOCE-01: la voce del velo chiama `onFidati`; testi in inglese e in italiano.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { documento, clic } from './aiuto-dom-blocchi.mjs';
import { impostaLingua } from '../../src/components/lingua.js';
import { creaCartaFiducia, testiRigaFiducia, creaVoceFiducia } from '../../src/components/fiducia-cartella.js';

const pausa = () => new Promise((r) => { setTimeout(r, 0); });

test('CARTA-01: «Sì, mi fido di questa cartella» salva true, la carta chiude con l\'esito', async () => {
  impostaLingua('it');
  const doc = documento();
  const salvate = [];
  const { scheda, risposta } = creaCartaFiducia(doc, { cartella: 'progetto', salva: async (f) => { salvate.push(f); } });
  assert.equal(scheda.querySelector('.talos-badge').textContent, 'Ti fidi di questa cartella?');
  assert.equal(scheda.querySelector('.talos-approval__why').textContent, 'TALOS caricherà le istruzioni, i ganci automatici e gli strumenti collegati di questa cartella.');
  assert.match(scheda.querySelector('.talos-approval__motivo').textContent, /Se dici No, qui lavora come in Su richiesta/u);
  const pulsanti = scheda.querySelectorAll('button');
  assert.deepEqual(pulsanti.map((b) => b.textContent), ['Sì, mi fido di questa cartella', 'No'], 'niente «Per questa sessione»');
  assert.equal(scheda.querySelector('.talos-approval__foot-note').textContent, 'Apri senza le istruzioni di questa cartella');
  clic(scheda.querySelector('[data-fiducia-si]'));
  assert.equal(await risposta, true);
  assert.deepEqual(salvate, [true]);
  assert.equal(scheda.querySelector('.talos-approval__foot'), null, 'i pulsanti se ne vanno');
  assert.ok(scheda.querySelector('.talos-approval__esito'));
});

test('CARTA-02: il «No» salva false; un salvataggio fallito lascia la carta aperta e lo dice', async () => {
  impostaLingua('en');
  const doc = documento();
  let tentativi = 0;
  const { scheda, risposta } = creaCartaFiducia(doc, { cartella: 'progetto', salva: async (f) => { tentativi += 1; if (tentativi === 1) throw new Error('disk full'); assert.equal(f, false); } });
  assert.deepEqual(scheda.querySelectorAll('button').map((b) => b.textContent), ['Yes, trust this folder', 'No']);
  clic(scheda.querySelector('[data-fiducia-no]'));
  await pausa();
  assert.equal(scheda.querySelector('.talos-fiducia__errore').textContent, 'Trust was not saved: disk full');
  assert.equal(scheda.querySelector('[data-fiducia-no]').disabled, false, 'si può riprovare');
  clic(scheda.querySelector('[data-fiducia-no]'));
  assert.equal(await risposta, false);
  assert.equal(scheda.querySelector('.talos-fiducia__errore'), null, 'l\'errore vecchio se ne va');
});

test('RIGA-01: la riga fissa solo per una cartella non fidata, il testo dell\'Accesso pieno solo se trattenuto', () => {
  impostaLingua('en');
  assert.equal(testiRigaFiducia({}), null);
  assert.equal(testiRigaFiducia({ cartellaNonFidata: false, pienoTrattenuto: true }), null);
  assert.deepEqual(testiRigaFiducia({ cartellaNonFidata: true }), { frase: 'This folder isn’t trusted: its instructions are off.', nota: 'Trust it from the permissions menu.' });
  assert.deepEqual(testiRigaFiducia({ cartellaNonFidata: true, pienoTrattenuto: true }), { frase: 'Not trusted: instructions off, Full access asks before edits.', nota: 'Trust it from the permissions menu.' });
  impostaLingua('it');
  assert.equal(testiRigaFiducia({ cartellaNonFidata: true, pienoTrattenuto: true }).frase, 'Non fidata: istruzioni spente, l’Accesso pieno chiede prima di modificare.');
});

test('VOCE-01: «Fidati di questa cartella» nel velo chiama onFidati', () => {
  impostaLingua('it');
  const doc = documento();
  let chiamate = 0;
  const voce = creaVoceFiducia(doc, { onFidati: () => { chiamate += 1; } });
  assert.equal(voce.querySelector('.talos-list-row__title').textContent, 'Fidati di questa cartella');
  clic(voce.querySelector('[data-fiducia-voce]'));
  assert.equal(chiamate, 1);
});
