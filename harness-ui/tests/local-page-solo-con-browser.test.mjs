/*
 * Mobile 29/10/2026 (pin di r4 sul telefono, prova P4-c): il modello del telefono riceveva `local_page` fra i 76 attrezzi, ma lì non
 *   c'è un Chromium da pilotare e l'attrezzo non può funzionare. Il server offre `local_page` solo se `trovaChromium()` trova un browser
 *   (la stessa ricerca del Browser vivo); senza, non passa la funzione, e il registro non lo offre (session-registry: filtro su
 *   `apriPaginaLocaleFn`).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { apriPaginaLocaleSeCeIlBrowser } from '../src/pagina-locale-ospite.mjs';
import { trovaChromium } from '../src/browser-vivo.mjs';

const dipendenze = { registroFn: () => null, browserVivoFn: () => null, chatImageStore: null };

test('LPB-01 senza un Chromium da pilotare (il telefono) local_page non si offre: nessuna funzione', () => {
  assert.equal(apriPaginaLocaleSeCeIlBrowser(dipendenze, { trovaFn: () => null }), null);
  assert.equal(apriPaginaLocaleSeCeIlBrowser(dipendenze, { trovaFn: () => { throw new Error('disco illeggibile'); } }), null,
    'una ricerca che fallisce vale «nessun browser», non un attrezzo offerto');
});

test('LPB-02 AL CONTRARIO: con un browser trovato local_page si offre come prima', () => {
  const apri = apriPaginaLocaleSeCeIlBrowser(dipendenze, { trovaFn: () => ({ percorso: 'C:\\Edge\\msedge.exe', canale: 'edge' }) });
  assert.equal(typeof apri, 'function');
});

test('LPB-03 la ricerca vera, come la fa il telefono: Android senza nessun eseguibile sul disco ⇒ nessun browser', () => {
  assert.equal(trovaChromium({ piattaforma: 'android', ambiente: {}, esiste: () => false }), null);
  assert.equal(apriPaginaLocaleSeCeIlBrowser(dipendenze, { trovaFn: () => trovaChromium({ piattaforma: 'android', ambiente: {}, esiste: () => false }) }), null);
});
