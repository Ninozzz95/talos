import test from 'node:test';
import assert from 'node:assert/strict';
import { applicaCollocazioneToast } from '../../src/components/toast.js';

/*
 * 24/09/2026 — decisione owner del 23/09 notte (commit `f5990ac42`): la pila dei toast siede in fondo alla
 * barra destra, larga quanto lei meno 12 px per lato; barra chiusa ⇒ angolo in basso a destra.
 * La collocazione la MISURA `misuraPilaToast` in `legacy/app.js` (la prova di quella è nel browser:
 * `tests/browser/toast-non-copre-i-comandi.spec.mjs`); qui si prova solo chi la SCRIVE sulla regione.
 * ⛔ Le prove TOAST-COLLOCA-01…05, 07 e 08 provavano `collocaPilaToast` (la regola «accanto al composer» della
 *   sera del 23/09), uscita dal codice perché senza chiamante: sono uscite con lei.
 */

function regioneFinta() {
  const scritte = new Map();
  return {
    scritte,
    dataset: {},
    style: { setProperty: (k, v) => scritte.set(k, v), removeProperty: (k) => scritte.delete(k) },
  };
}

test('TOAST-COLLOCA-06 — la collocazione si scrive sulla regione, mai sulla radice, e «fondo» la ripulisce', () => {
  const regione = regioneFinta();
  applicaCollocazioneToast(regione, { modo: 'barra-destra', left: 1112, width: 316, bottom: 12, maxHeight: 876 });
  assert.equal(regione.dataset.posizione, 'barra-destra');
  assert.deepEqual(Object.fromEntries(regione.scritte), { '--toast-left': '1112px', '--toast-width': '316px', '--toast-bottom': '12px', '--toast-max-h': '876px' });
  applicaCollocazioneToast(regione, { modo: 'fondo' });
  assert.equal(regione.dataset.posizione, undefined);
  assert.equal(regione.scritte.size, 0);
});

test('TOAST-COLLOCA-09 — una collocazione nuova toglie le variabili che non porta più (nessun resto della precedente)', () => {
  const regione = regioneFinta();
  regione.style.setProperty('--toast-right', '430px'); // un resto di una collocazione ancorata a destra
  applicaCollocazioneToast(regione, { modo: 'barra-destra', left: 696, width: 316, bottom: 12, maxHeight: 776 });
  assert.equal(regione.scritte.has('--toast-right'), false, 'con `left` scritto, un `right` rimasto tirerebbe la regione da due lati');
  applicaCollocazioneToast(regione, { modo: 'barra-destra', left: 696, width: 316, bottom: 12 });
  assert.equal(regione.scritte.has('--toast-max-h'), false, 'un tetto non misurato non si eredita dalla misura prima');
});

test('TOAST-COLLOCA-10 — numeri non finiti non si scrivono, e senza collocazione o senza regione non si inventa niente', () => {
  const regione = regioneFinta();
  applicaCollocazioneToast(regione, { modo: 'barra-destra', left: Number.NaN, width: Infinity, bottom: 12 });
  assert.deepEqual(Object.fromEntries(regione.scritte), { '--toast-bottom': '12px' });
  applicaCollocazioneToast(regione, null);
  assert.equal(regione.dataset.posizione, undefined);
  assert.equal(regione.scritte.size, 0);
  assert.doesNotThrow(() => applicaCollocazioneToast(null, { modo: 'barra-destra', left: 1 }));
});
