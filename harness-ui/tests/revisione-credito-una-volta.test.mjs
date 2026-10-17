/*
 * ⛔ REVISIONE AVVERSARIA della migrazione «una volta» del credito ereditato (bugfixer, 14/10/2026 sera) — ramo
 * `fix/credito-ereditato-una-volta`, commit `e41ed9bf6` + `734ea6b2e`.
 *
 * Prova ROSSA apposta: `setKey` ora rilegge l'indice del fornitore dal portachiavi prima di scegliere la strada
 * (`caricaDalPortachiavi`). Se la rilettura non riesce per un guasto PASSEGGERO di una sola voce (il portachiavi di sistema che
 * lancia una volta, un segreto non leggibile in quel momento), `caricaDalPortachiavi` ha già azzerato il pool e acceso `conIndice`:
 * `setKey` scrive allora un indice con la SOLA chiave nuova. Le altre chiavi del pool spariscono dall'indice per sempre (i loro
 * segreti restano orfani nel portachiavi). Prima della cura `setKey` usava il pool in memoria e le teneva.
 * Rapporto: `handoff-talos-2026-09-27/bugfixer/RAPPORTO-REVISIONE-GOAL-G3-2026-10-14.md`, sezione «Credito ereditato».
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createProviderCredentialStore } from '../src/provider-credential-store.mjs';

function fakeKeyring() {
  const values = new Map();
  let guastoUnaVoltaSu = null;
  return {
    values,
    guastaUnaVolta(parte) { guastoUnaVoltaSu = parte; },
    get(service, account) {
      if (guastoUnaVoltaSu && `${service}:${account}`.includes(guastoUnaVoltaSu)) { guastoUnaVoltaSu = null; throw new Error('keychain busy'); }
      return values.get(`${service}:${account}`) ?? null;
    },
    set(service, account, value) { values.set(`${service}:${account}`, value); },
    remove(service, account) { values.delete(`${service}:${account}`); },
  };
}

test('CREDITO-REV-01 (S3) — a TRANSIENT keychain error while setKey rereads the index drops the OTHER keys of the pool for good', () => {
  const keyring = fakeKeyring();
  const store = createProviderCredentialStore({ env: {}, keyring });
  store.aggiungiChiave('zai', 'rev-credito-chiave-uno-0123456789');
  store.aggiungiChiave('zai', 'rev-credito-chiave-due-0123456789');
  const [, seconda] = store.elencaPool('zai');
  assert.equal(store.elencaPool('zai').length, 2, 'premise: a pool of two keys');

  keyring.guastaUnaVolta(seconda.impronta); // il segreto della seconda chiave non si legge, UNA volta
  /* la persona risalva la chiave principale. Dopo la cura (coordinatore, 14/10 notte) un guasto nella rilettura RIFIUTA il
     salvataggio senza scrivere niente (`PROVIDER_STORE_UNAVAILABLE`, la persona riprova): va bene uguale — ciò che questa prova
     difende è che le altre chiavi del pool non spariscano */
  try { store.setKey('zai', 'rev-credito-chiave-nuova-0123456789'); } catch (errore) { assert.equal(errore?.code, 'PROVIDER_STORE_UNAVAILABLE'); }

  const ricaricato = createProviderCredentialStore({ env: {}, keyring });
  ricaricato.loadFromKeyring();
  const impronte = ricaricato.elencaPool('zai').map((v) => v.impronta);
  assert.ok(impronte.includes(seconda.impronta), `the second key of the pool is gone from the index after a single failed read (pool now: ${impronte.length} key)`);
});
