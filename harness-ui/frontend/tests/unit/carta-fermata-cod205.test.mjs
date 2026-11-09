/*
 * COD-205 (2)-(3) dello stress del telefono 0.1.47 (Mobile 30/10/2026): fermata una delega mentre aspettava un permesso, la carta
 * diceva «Negato da un'altra finestra». Il server ora chiude la richiesta con `motivo: 'fermato'` (anche nello snapshot verso il
 * padre); la carta lo dice per quello che è.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const doc = { createElement: (tag) => ({ tag, attributes: {}, className: '', textContent: '', setAttribute(k, v) { this.attributes[k] = v; } }) };
const scheda = (dataset = {}) => ({ dataset, figli: [], querySelector: () => null, append(n) { this.figli.push(n); } });

test('CARTA-FERMATA-01: chiusa da uno Stop ⇒ «Fermata prima della risposta», mai «da un\'altra finestra»', async () => {
  const { segnaEsitoApprovazione } = await import('../../src/components/conversazione.js');
  const riga = segnaEsitoApprovazione(scheda(), { approvato: false, altrove: true, motivo: 'fermato' }, { document: doc });
  assert.match(riga.textContent, /Fermata prima della risposta/u);
  assert.doesNotMatch(riga.textContent, /Negato|altra finestra/u);
});

test('CARTA-FERMATA-02 AL CONTRARIO: un no dato altrove resta un no della persona, «Hai detto di no da un\'altra finestra» (decisione 89)', async () => {
  const { segnaEsitoApprovazione } = await import('../../src/components/conversazione.js');
  const riga = segnaEsitoApprovazione(scheda(), { approvato: false, altrove: true }, { document: doc });
  assert.match(riga.textContent, /Hai detto di no/u);
  assert.match(riga.textContent, /altra finestra/u);
});
