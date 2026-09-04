import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { createHttpApp } from '../src/http-app.mjs';
import { createProviderCredentialStore } from '../src/provider-credential-store.mjs';
import { statoPrimoAvvio } from '../src/setup-stato.mjs';

/*
 * ⭐⭐⭐ 04/9 — R-02, intro al primo avvio. Lo stato del primo avvio è la
 * cosa che decide se l'intro si apre e da quale passo: deve dire la verità
 * (letta dal portachiavi, non da un flag) e non deve MAI far uscire una
 * chiave. Stesso stile di `http-routes-providers.test.mjs`.
 */

async function listen(t, deps) {
  const server = createServer(createHttpApp({ staticHandler: async () => null, ...deps }));
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test('SETUP-STATO-01 — con una chiave nel portachiavi il provider è pronto e la chiave NON compare', () => {
  const secret = 'sk-setup-never-returned';
  const store = createProviderCredentialStore({ env: { OPENROUTER_API_KEY: secret } });
  const stato = statoPrimoAvvio({ providerStore: store, cartelleProgetto: 1 });
  assert.equal(stato.provider.pronto, true);
  assert.deepEqual([...stato.provider.conChiave], ['openrouter']);
  assert.equal(stato.provider.localeConfigurato, false);
  assert.equal(stato.introDisattivato, false);
  assert.equal(stato.cartelleProgetto, 1);
  assert.doesNotMatch(JSON.stringify(stato), /sk-setup-never-returned/);
});

test('SETUP-STATO-02 — AL CONTRARIO: senza chiavi e senza motore locale, non pronto; il motore locale da solo basta', () => {
  const vuoto = statoPrimoAvvio({ providerStore: createProviderCredentialStore({ env: {} }) });
  assert.equal(vuoto.provider.pronto, false);
  assert.deepEqual([...vuoto.provider.conChiave], []);
  const locale = statoPrimoAvvio({ providerStore: createProviderCredentialStore({ env: {} }), localeConfigurato: true });
  assert.equal(locale.provider.pronto, true);
  assert.equal(locale.provider.localeConfigurato, true);
});

test('SETUP-STATO-03 — un portachiavi assente o rotto è «non pronto», mai un crash né un\'ipotesi', () => {
  assert.equal(statoPrimoAvvio({ providerStore: null }).provider.pronto, false);
  const rotto = { listPublic() { throw new Error('keyring esploso'); } };
  assert.equal(statoPrimoAvvio({ providerStore: rotto }).provider.pronto, false);
});

test('SETUP-STATO-04 — TALOS_INTRO=0 è dichiarato come introDisattivato', () => {
  assert.equal(statoPrimoAvvio({ introDisattivato: true }).introDisattivato, true);
  assert.equal(statoPrimoAvvio({ introDisattivato: '0' }).introDisattivato, false); // solo il booleano vero conta
});

test('SETUP-HTTP-01 — GET /api/v1/setup/stato torna la busta standard senza segreti; con query è rifiutata', async (t) => {
  const secret = 'sk-http-setup-secret';
  const store = createProviderCredentialStore({ env: { OPENAI_API_KEY: secret } });
  const base = await listen(t, { setupStatoFn: () => statoPrimoAvvio({ providerStore: store, cartelleProgetto: 2 }) });
  const risposta = await fetch(`${base}/api/v1/setup/stato`);
  assert.equal(risposta.status, 200);
  const corpo = await risposta.text();
  assert.doesNotMatch(corpo, /sk-http-setup-secret/);
  const { data } = JSON.parse(corpo);
  assert.equal(data.provider.pronto, true);
  assert.deepEqual(data.provider.conChiave, ['openai']);
  assert.equal(data.cartelleProgetto, 2);
  const conQuery = await fetch(`${base}/api/v1/setup/stato?x=1`);
  assert.notEqual(conQuery.status, 200);
});

test('SETUP-HTTP-02 — senza setupStatoFn la rotta dichiara REPORT_UNAVAILABLE, non un 200 vuoto', async (t) => {
  const base = await listen(t, {});
  const risposta = await fetch(`${base}/api/v1/setup/stato`);
  assert.notEqual(risposta.status, 200);
  const { error } = await risposta.json();
  assert.equal(error.code, 'REPORT_UNAVAILABLE');
});
