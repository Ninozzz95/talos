/*
 * ⭐ CREDITO-REV-01 (revisione del bugfixer, 14/10/2026 notte): `setKey` rilegge l'indice del fornitore prima di scrivere. Nei due
 * versi:
 *   · un GUASTO del portachiavi nella rilettura (l'indice o una voce del pool che in quel momento non si leggono) ⇒ rifiuto
 *     `PROVIDER_STORE_UNAVAILABLE`, niente scritto, lo stato in memoria com'era, e alla prova dopo il salvataggio riesce tenendo
 *     tutte le chiavi;
 *   · un indice ROVINATO (JSON non valido) resta quello che era: la scrittura ne fa uno nuovo e pulito, come prima.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createProviderCredentialStore } from '../src/provider-credential-store.mjs';

function portachiavi() {
  const valori = new Map();
  let guasto = null;
  return {
    valori,
    guastaUnaVolta(parte) { guasto = parte; },
    get(s, a) { if (guasto && `${s}:${a}`.includes(guasto)) { guasto = null; throw Object.assign(new Error('keychain busy'), { code: 'GenericFailure' }); } return valori.get(`${s}:${a}`) ?? null; },
    set(s, a, v) { valori.set(`${s}:${a}`, v); },
    remove(s, a) { valori.delete(`${s}:${a}`); },
  };
}

test('CREDITO-CURA-01 — un guasto nella rilettura (indice o voce del pool) rifiuta senza scrivere; riprovando riesce e tiene tutte le chiavi', () => {
  for (const dove of ['indice', 'voce']) {
    const k = portachiavi();
    const store = createProviderCredentialStore({ env: {}, keyring: k });
    store.aggiungiChiave('zai', 'credito-cura-chiave-uno-0123456789');
    store.aggiungiChiave('zai', 'credito-cura-chiave-due-0123456789');
    const [, seconda] = store.elencaPool('zai');
    const fotografia = new Map(k.valori);
    k.guastaUnaVolta(dove === 'indice' ? 'zai:indice' : seconda.impronta);
    assert.throws(() => store.setKey('zai', 'credito-cura-chiave-nuova-0123456789'), (e) => e?.code === 'PROVIDER_STORE_UNAVAILABLE', dove);
    assert.deepEqual(k.valori, fotografia, `${dove}: niente scritto nel portachiavi`);
    assert.equal(store.elencaPool('zai').length, 2, `${dove}: lo stato in memoria è quello di prima`);
    // AL CONTRARIO: il guasto è passato ⇒ il salvataggio riesce e le altre chiavi restano
    store.setKey('zai', 'credito-cura-chiave-nuova-0123456789');
    const ricaricato = createProviderCredentialStore({ env: {}, keyring: k });
    ricaricato.loadFromKeyring();
    assert.ok(ricaricato.elencaPool('zai').some((v) => v.impronta === seconda.impronta), `${dove}: la seconda chiave resta`);
  }
});

test('CREDITO-CURA-02 — un indice ROVINATO non è un guasto: il salvataggio riesce e scrive un indice nuovo e pulito', () => {
  const k = portachiavi();
  const store = createProviderCredentialStore({ env: {}, keyring: k });
  store.aggiungiChiave('zai', 'credito-cura-chiave-uno-0123456789');
  const chiaveIndice = [...k.valori.keys()].find((c) => c.endsWith('zai:indice'));
  k.valori.set(chiaveIndice, '{non è json');
  assert.doesNotThrow(() => store.setKey('zai', 'credito-cura-chiave-nuova-0123456789'));
  const ricaricato = createProviderCredentialStore({ env: {}, keyring: k });
  ricaricato.loadFromKeyring();
  assert.equal(ricaricato.elencaPool('zai').length, 1);
});
