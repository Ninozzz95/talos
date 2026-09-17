import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { createHttpApp } from '../src/http-app.mjs';
import { createProviderCredentialStore } from '../src/provider-credential-store.mjs';
import { createSearchSourceStore } from '../src/search-source-store.mjs';
import { SCOPE_DESKTOP, SUFFISSO_DESKTOP, avvolgiAdattatoreKeyring, leggiScopePortachiavi } from '../src/adattatore-keyring.mjs';

test('KEYRING-SCOPE-01 — senza variabile (o vuota) il portachiavi è quello di sempre: lo sviluppo non cambia una virgola', () => {
  assert.equal(leggiScopePortachiavi({}), null);
  assert.equal(leggiScopePortachiavi({ ALTRO: 'valore' }), null);
  assert.equal(leggiScopePortachiavi({ TALOS_HARNESS_UI_KEYRING_SCOPE: '' }), null);
});

test('KEYRING-SCOPE-02 — «desktop» è l\'unico valore ammesso, anche con spazi attorno; tutto il resto è un errore d\'avvio, mai un default silenzioso', () => {
  assert.equal(leggiScopePortachiavi({ TALOS_HARNESS_UI_KEYRING_SCOPE: 'desktop' }), SCOPE_DESKTOP);
  assert.equal(leggiScopePortachiavi({ TALOS_HARNESS_UI_KEYRING_SCOPE: '  desktop  ' }), SCOPE_DESKTOP);
  for (const valore of ['prod', 'DESKTOP', 'desktop-dev', '0', 'true']) {
    assert.throws(() => leggiScopePortachiavi({ TALOS_HARNESS_UI_KEYRING_SCOPE: valore }),
      (e) => e instanceof Error && /TALOS_HARNESS_UI_KEYRING_SCOPE/.test(e.message) && /desktop/.test(e.message),
      `il valore "${valore}" non si indovina: l'avvio si ferma con il messaggio onesto`);
  }
});

test('KEYRING-SCOPE-03 — scope assente o adattatore mancante: l\'avvolgitore è la trasparente', () => {
  const adattatore = { get: () => 'x', set: () => {}, remove: () => {} };
  assert.equal(avvolgiAdattatoreKeyring(adattatore, null), adattatore);
  assert.equal(avvolgiAdattatoreKeyring(adattatore, undefined), adattatore);
  assert.equal(avvolgiAdattatoreKeyring(null, SCOPE_DESKTOP), null);
  assert.equal(avvolgiAdattatoreKeyring(undefined, SCOPE_DESKTOP), undefined);
});

test('KEYRING-SCOPE-04 — con scope desktop OGNI servizio riceve il suffisso `-desktop`, per qualunque nome: i negozi conoscono i loro nomi, l\'adattatore no', () => {
  const viste = [];
  const sottostante = {
    get: (servizio, account) => { viste.push(['get', servizio, account]); return `valore:${servizio}:${account}`; },
    set: (servizio, account, valore) => { viste.push(['set', servizio, account, valore]); return 'set-ok'; },
    remove: (servizio, account) => { viste.push(['remove', servizio, account]); return 'remove-ok'; },
  };
  const avvolto = avvolgiAdattatoreKeyring(sottostante, SCOPE_DESKTOP);
  assert.notEqual(avvolto, sottostante);
  assert.equal(avvolto.get('talos-harness-search', 'tavily'), 'valore:talos-harness-search-desktop:tavily');
  assert.equal(avvolto.set('talos-harness-provider-pool', 'openai:abc', 'segreto'), 'set-ok');
  assert.equal(avvolto.remove('talos-harness-provider', 'openrouter'), 'remove-ok');
  assert.deepEqual(viste, [
    ['get', `talos-harness-search${SUFFISSO_DESKTOP}`, 'tavily'],
    ['set', `talos-harness-provider-pool${SUFFISSO_DESKTOP}`, 'openai:abc', 'segreto'],
    ['remove', `talos-harness-provider${SUFFISSO_DESKTOP}`, 'openrouter'],
  ], 'ogni operazione arriva al portachiavi con il namespace dell\'app installata, mai con il nome del dev');
});

/*
 * ⛔ (16/09/2026) — IL FLUSSO INTERO, sulla composizione STESSA di `server.mjs` (scope letto,
 *   adattatore avvolto, flag ai due negozi), montata su HTTP vero: semina d'ambiente piena +
 *   scope `desktop` ⇒ nessuna scheda «collegata» in GET /api/v1/providers, la fonte resta
 *   DuckDuckGo, e ogni operazione che tocca il portachiavi lo fa SOLO coi nomi `-desktop`.
 *   Il contrasto alla fine: la STESSA ambiente senza scope semina come sempre — il dev è intatto.
 */
test('KEYRING-SCOPE-05 — flusso intero: scope desktop + semi nell\'ambiente ⇒ modale pulita su HTTP e portachiavi solo `-desktop`', async (t) => {
  const visti = new Set();
  const portachiaviNudo = {
    get: (servizio) => { visti.add(servizio); return null; },
    set: (servizio) => { visti.add(servizio); },
    remove: (servizio) => { visti.add(servizio); },
  };
  const env = {
    OPENROUTER_API_KEY: 'sk-flusso-never-shown',
    TALOS_HARNESS_SEARCH_PROVIDER: 'tavily', TALOS_HARNESS_SEARCH_API_KEY: 'tvly-flusso-never-shown',
    MOONSHOT_BASE_URL: 'https://moonshot.example.com/v1',
  };
  const scope = leggiScopePortachiavi({ TALOS_HARNESS_UI_KEYRING_SCOPE: 'desktop' });
  const keyring = avvolgiAdattatoreKeyring(portachiaviNudo, scope);
  const providerStore = createProviderCredentialStore({ env, keyring, ignoraSemiAmbiente: scope === 'desktop' });
  const searchSourceStore = createSearchSourceStore({ env, keyring, file: null, ignoraSemiAmbiente: scope === 'desktop' });
  const server = createServer(createHttpApp({ staticHandler: async () => null, providerStore, searchSourceStore }));
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;

  const testoProvider = await (await fetch(`${base}/api/v1/providers`)).text();
  const provider = JSON.parse(testoProvider).data.items;
  assert.equal(provider.some((row) => row.keyConfigured), false, 'nessuna scheda «collegata» nella modale dell\'app installata');
  assert.doesNotMatch(testoProvider, /sk-flusso-never-shown/);
  assert.ok(provider.some((row) => row.endpointConfigured && row.endpoint === 'https://moonshot.example.com/v1'), 'gli endpoint da ambiente restano configurazione anche nello scope desktop');
  const search = JSON.parse(await (await fetch(`${base}/api/v1/search-source`)).text());
  assert.equal(search.data.source, 'duckduckgo', 'la fonte d\'arrivo è quella da macchina pulita, non il seme');
  assert.doesNotMatch(JSON.stringify(search), /tvly-flusso-never-shown/);

  // una chiave salvata dalla UI arriva al portachiavi SOLO col namespace dell'app installata
  const salva = await fetch(`${base}/api/v1/providers/openai/key`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'chiave-dalla-ui' }) });
  assert.equal(salva.status, 200);
  assert.ok([...visti].length > 0);
  assert.ok([...visti].every((servizio) => servizio.endsWith(SUFFISSO_DESKTOP)), `il portachiavi vede solo nomi "-desktop", visto: ${[...visti].join(', ')}`);

  // il contrasto: la STESSA ambiente senza scope semina come sempre — il dev da sorgente è intatto
  const sviluppo = createProviderCredentialStore({ env, keyring: portachiaviNudo });
  assert.equal(sviluppo.getKey('openrouter'), 'sk-flusso-never-shown');
});
