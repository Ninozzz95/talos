/*
 * BUG-25, la «migrazione una tantum» — revisione della CLI (Nino2, 14/10/2026): girava a OGNI `loadFromKeyring`, non una volta.
 * Una panchina-credito con la scadenza DICHIARATA dal fornitore, su un pool a chiave unica, tornava «disponibile» ogni volta che
 * un processo ricostruiva lo store (la CLI lo ricostruisce quando cambiano consensi, indirizzi o stato) ⇒ una richiesta in più
 * rifiutata dal fornitore. Cura: l'indice elenca le panchine dichiarate (`dichiarate`), campo in più che i lettori di prima
 * ignorano. Le prove della CLI che diventano verdi con questa cura: `test/runtime/review-064c-saved-credit-bench.test.ts`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createProviderCredentialStore } from '../src/provider-credential-store.mjs';

const INDICE = 'talos-harness-provider-pool-index';
const CHIAVE = 'b25-una-volta-chiave-zai-0123456789';

function fakeKeyring(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    get(service, account) { return values.get(`${service}:${account}`) ?? null; },
    set(service, account, value) { values.set(`${service}:${account}`, value); },
    remove(service, account) { values.delete(`${service}:${account}`); },
  };
}
const indiceDi = (keyring, provider = 'zai') => JSON.parse(keyring.values.get(`${INDICE}:${provider}:indice`));

test('B25-UNA-VOLTA-01 — una panchina-credito DICHIARATA sopravvive al ricaricamento dello store (prima tornava disponibile)', () => {
  const keyring = fakeKeyring();
  const primo = createProviderCredentialStore({ env: {}, keyring });
  primo.aggiungiChiave('zai', CHIAVE);
  const [voce] = primo.elencaPool('zai');
  const fino = Date.now() + 3_600_000;
  const dopo = primo.mettiInPanchina('zai', voce.impronta, { classe: 'credito', resetAt: fino });
  assert.equal(dopo.stato, 'in-panchina', JSON.stringify(dopo));
  const indice = indiceDi(keyring);
  assert.deepEqual(indice.dichiarate, [voce.impronta]);
  // ⛔ la forma che legge un processo di prima: versione 1, righe di quattro elementi
  assert.equal(indice.version, 1);
  assert.ok(indice.chiavi.every((r) => Array.isArray(r) && r.length === 4));
  for (let i = 0; i < 3; i += 1) {
    const ricostruito = createProviderCredentialStore({ env: {}, keyring });
    ricostruito.loadFromKeyring();
    const [letta] = ricostruito.elencaPool('zai');
    assert.equal(letta.stato, 'in-panchina', `ricaricamento ${i + 1}: la panchina dichiarata resta`);
    assert.equal(letta.causa, 'credito');
  }
  // ⛔ mutante sopravvissuto (14/10): uno store ricaricato che poi SALVA il pool (qui: una chiave aggiunta e tolta) deve tenere la
  //   panchina fra le dichiarate, o il ricaricamento dopo la scambia di nuovo per ereditata
  const terzo = createProviderCredentialStore({ env: {}, keyring });
  terzo.loadFromKeyring();
  terzo.aggiungiChiave('zai', `${CHIAVE}-tmp`);
  terzo.rimuoviChiave('zai', terzo.elencaPool('zai').find((v) => v.impronta !== voce.impronta).impronta);
  assert.deepEqual(indiceDi(keyring).dichiarate, [voce.impronta]);
  const quarto = createProviderCredentialStore({ env: {}, keyring });
  quarto.loadFromKeyring();
  assert.equal(quarto.elencaPool('zai')[0].stato, 'in-panchina');
});

test('B25-UNA-VOLTA-02 — AL CONTRARIO: una panchina-credito EREDITATA (indice senza `dichiarate`, codice di prima) si libera ancora', () => {
  const keyring = fakeKeyring();
  const primo = createProviderCredentialStore({ env: {}, keyring });
  primo.aggiungiChiave('zai', CHIAVE);
  const [voce] = primo.elencaPool('zai');
  // l'indice come lo scriveva il codice di prima di BUG-25: panchina-credito a stima, nessuna lista
  keyring.set(INDICE, 'zai:indice', JSON.stringify({ version: 1, chiavi: [[voce.impronta, 0, Date.now() + 3_600_000, 'credito']] }));
  const ricostruito = createProviderCredentialStore({ env: {}, keyring });
  ricostruito.loadFromKeyring();
  assert.equal(ricostruito.elencaPool('zai')[0].stato, 'disponibile');
  // e la lista nominata per un'ALTRA chiave non protegge questa
  keyring.set(INDICE, 'zai:indice', JSON.stringify({ version: 1, chiavi: [[voce.impronta, 0, Date.now() + 3_600_000, 'credito']], dichiarate: ['f'.repeat(64)] }));
  const terzo = createProviderCredentialStore({ env: {}, keyring });
  terzo.loadFromKeyring();
  assert.equal(terzo.elencaPool('zai')[0].stato, 'disponibile');
  // una lista storta (non un elenco) si ignora: niente lancia, la regola di prima vale
  keyring.set(INDICE, 'zai:indice', JSON.stringify({ version: 1, chiavi: [[voce.impronta, 0, Date.now() + 3_600_000, 'credito']], dichiarate: 'tutte' }));
  const quarto = createProviderCredentialStore({ env: {}, keyring });
  quarto.loadFromKeyring();
  assert.equal(quarto.elencaPool('zai')[0].stato, 'disponibile');
});

test('B25-UNA-VOLTA-03 — una panchina a STIMA (traffico) non entra nella lista; una chiave tolta dal pool esce dalla lista', () => {
  const keyring = fakeKeyring();
  const store = createProviderCredentialStore({ env: {}, keyring });
  store.aggiungiChiave('zai', CHIAVE);
  store.aggiungiChiave('zai', `${CHIAVE}-due`);
  const [prima, seconda] = store.elencaPool('zai');
  store.mettiInPanchina('zai', prima.impronta, { classe: 'traffico' });
  assert.equal(indiceDi(keyring).dichiarate, undefined, 'una stima non è una dichiarazione');
  store.mettiInPanchina('zai', seconda.impronta, { classe: 'credito', resetAt: Date.now() + 600_000 });
  assert.deepEqual(indiceDi(keyring).dichiarate, [seconda.impronta]);
  store.rimuoviChiave('zai', seconda.impronta);
  assert.equal(indiceDi(keyring).dichiarate, undefined);
});

test('B25-UNA-VOLTA-04 — risalvare la chiave toglie la panchina messa da un ALTRO processo, anche se questo store non aveva ancora l\'indice (Nino2)', () => {
  const keyring = fakeKeyring();
  // uno store nato PRIMA che esistesse l'indice: per lui la chiave non c'è, e nessun indice
  const vecchio = createProviderCredentialStore({ env: {}, keyring });
  vecchio.loadFromKeyring();
  // un altro processo crea il pool e mette una panchina dichiarata
  const altro = createProviderCredentialStore({ env: {}, keyring });
  altro.aggiungiChiave('zai', CHIAVE);
  const [voce] = altro.elencaPool('zai');
  altro.mettiInPanchina('zai', voce.impronta, { classe: 'credito', resetAt: Date.now() + 3_600_000 });
  assert.deepEqual(indiceDi(keyring).dichiarate, [voce.impronta]);
  // la persona risalva la chiave dallo store vecchio
  vecchio.setKey('zai', CHIAVE);
  const indice = indiceDi(keyring);
  assert.equal(indice.dichiarate, undefined, 'la panchina dell\'altro processo è tolta');
  assert.deepEqual(indice.chiavi.map((r) => [r[2], r[3]]), [[null, null]]);
  const nuovo = createProviderCredentialStore({ env: {}, keyring });
  nuovo.loadFromKeyring();
  assert.equal(nuovo.elencaPool('zai')[0].stato, 'disponibile');
  // AL CONTRARIO: senza nessun indice nel portachiavi, setKey resta sulla strada di sempre (una voce sola, niente indice)
  const vuoto = fakeKeyring();
  const solo = createProviderCredentialStore({ env: {}, keyring: vuoto });
  solo.setKey('zai', CHIAVE);
  assert.equal(vuoto.values.has(`${INDICE}:zai:indice`), false);
  // e un indice danneggiato si rimpiazza con uno pulito
  const rotto = fakeKeyring({ [`${INDICE}:zai:indice`]: '{non json' });
  const riparatore = createProviderCredentialStore({ env: {}, keyring: rotto });
  riparatore.setKey('zai', CHIAVE);
  assert.equal(indiceDi(rotto).version, 1);
});
