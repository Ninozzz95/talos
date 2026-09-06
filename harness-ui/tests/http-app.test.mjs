import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { API_SCHEMA, createHttpApp } from '../src/http-app.mjs';
import { createStaticHandler } from '../src/static-files.mjs';

const testDir = dirname(fileURLToPath(import.meta.url));
// ⭐ 26/8, DEC-053 — il bundle canonico è mobile/public/harness-ui/, non più
// harness-ui/public/ (mai riconciliata con l'integrazione mobile, non
// portata in questo worktree). Stessa relazione che config.mjs calcola.
const publicDir = join(testDir, '..', 'public');

function realApp() {
  return createHttpApp({ staticHandler: createStaticHandler(publicDir) });
}

async function listen(t, app = realApp()) {
  const server = createServer(app);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();
  return { server, base: `http://127.0.0.1:${port}` };
}

test('server binds to configured loopback only', () => {
  const source = readFileSync(join(testDir, '..', 'server.mjs'), 'utf8');
  // ⭐ 03/9, R-01 — il legame ora passa da trovaPortaLibera() (config.mjs:
  // porta occupata e non esplicita ⇒ prova la successiva), quindi la porta
  // letterale non è più `config.port` in questo punto ma una variabile
  // locale che parte da lì. Il fatto che questo test protegge davvero — il
  // secondo host non è mai un indirizzo diverso da quello validato — non è
  // cambiato: si continua a controllare che `server.listen(...)` riceva
  // sempre e solo `config.host` come secondo argomento, mai un valore scritto
  // a mano come 0.0.0.0.
  assert.match(source, /\.listen\([^,]+,\s*config\.host\)/);
  assert.doesNotMatch(source, /listen\([^\n]*0\.0\.0\.0/);
});

test('GET /api/v1/health torna la busta standard, HEAD combacia, una rotta ignota è 404', async (t) => {
  const { base } = await listen(t);
  const response = await fetch(`${base}/api/v1/health`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.meta.schema, API_SCHEMA);
  const head = await fetch(`${base}/api/v1/health`, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  assert.equal((await fetch(`${base}/api/v1/nope`)).status, 404);
});

test('GET /api/v1/runtime/bootstrap non inventa un elenco quando il runtime non è configurato', async (t) => {
  const { base } = await listen(t);
  const response = await fetch(`${base}/api/v1/runtime/bootstrap`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.runtime.status, 'unavailable');
  assert.equal(body.data.runtime.items, null);
  assert.equal(body.data.runtime.consulted, false);
});

test('GET /api/v1/runtime/bootstrap valida il contratto backend e distingue elenco vuoto', async (t) => {
  const { base } = await listen(t, createHttpApp({
    staticHandler: createStaticHandler(publicDir),
    runtimeBootstrapFn: async () => ({
      schema: 'talos.harness-ui.runtime-bootstrap.v1',
      authoritative: 'backend',
      runtime: {
        schema: 'talos.harness-ui.resource.v1', status: 'available', items: [], consulted: true,
        observedAt: '2026-08-31T12:00:00.000Z', reason: null,
      },
      observedAt: '2026-08-31T12:00:00.000Z',
    }),
  }));
  const response = await fetch(`${base}/api/v1/runtime/bootstrap`);
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data.runtime.items, []);
});

test('gli errori HTTP espongono una spiegazione naturale e un riferimento Doctor senza dettagli interni', async (t) => {
  const { base } = await listen(t);
  const response = await fetch(`${base}/api/v1/runtime/load`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ runtimeId: 'missing', modelId: 'missing' }) });
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.error.code, 'QUERY_INVALID');
  assert.match(body.error.title, /Configurazione|Operazione|richiesta/i);
  assert.match(body.error.doctorReference, /^doctor-/);
  assert.doesNotMatch(JSON.stringify(body), /node_modules|TALOS_HARNESS_UI_PROJECT_DIRS|stack/i);
});

test('api rejects POST PUT PATCH DELETE with 405 and no CORS when Origin is absent', async (t) => {
  const { base } = await listen(t);
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    const response = await fetch(`${base}/api/v1/health`, { method });
    assert.equal(response.status, 405, method);
    assert.equal(response.headers.has('access-control-allow-origin'), false);
    assert.equal((await response.json()).error.code, 'METHOD_NOT_ALLOWED');
  }
});

/**
 * ⛔ Piano `procedi-col-generare-un-snoopy-neumann.md`, Fase 3: `OPTIONS`
 * era prima nel gruppo "rifiutato con 405" sopra — ora è un preflight CORS
 * vero, perché il mobile (`app.js` montato nel documento TALOS, origine
 * Capacitor) è cross-origin per davvero verso questo server via
 * `adb reverse`. Desktop resta invariato: senza `Origin` nessuna
 * intestazione CORS compare, stesso comportamento di sempre.
 */
test('OPTIONS answers a CORS preflight, and Access-Control-Allow-Origin reflects Origin only when present', async (t) => {
  const { base } = await listen(t);

  const preflight = await fetch(`${base}/api/v1/sessions`, {
    method: 'OPTIONS',
    headers: { Origin: 'http://localhost', 'Access-Control-Request-Method': 'POST' },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'http://localhost');
  assert.equal(preflight.headers.get('access-control-allow-methods'), 'GET, HEAD, POST');
  assert.equal(preflight.headers.get('access-control-allow-headers'), 'Content-Type');
  assert.equal(await preflight.text(), '');

  const withOrigin = await fetch(`${base}/api/v1/health`, { headers: { Origin: 'http://localhost' } });
  assert.equal(withOrigin.headers.get('access-control-allow-origin'), 'http://localhost');
  assert.equal(withOrigin.headers.get('vary'), 'Origin');

  const withoutOrigin = await fetch(`${base}/api/v1/health`);
  assert.equal(withoutOrigin.headers.has('access-control-allow-origin'), false);

  // ⛔ Verso contrario: OPTIONS senza Origin resta un preflight valido (204),
  // non un errore — un client che non manda Origin non deve mai vedere un
  // 405 dove prima lo vedeva un'altra rotta valida.
  const optionsNoOrigin = await fetch(`${base}/api/v1/health`, { method: 'OPTIONS' });
  assert.equal(optionsNoOrigin.status, 204);
  assert.equal(optionsNoOrigin.headers.has('access-control-allow-origin'), false);
});

/*
 * ⭐⭐⭐ 28/8 — owner, coda: "directory più usate (tipo desktop
 * downloads)". Stessa forma minima delle prove sopra: nessuna
 * dipendenza da tests/fixtures/banco/, un `cartelleFrequentiFn` finto
 * al posto del vero (che legge il disco davvero — già provato per
 * conto suo in frequent-dirs.test.mjs).
 */
test('GET /api/v1/frequent-dirs torna gli item di cartelleFrequentiFn, avvolti nella busta standard', async (t) => {
  const { base } = await listen(t, createHttpApp({
    staticHandler: createStaticHandler(publicDir),
    cartelleFrequentiFn: () => [{ etichetta: 'Desktop', percorso: 'C:/Users/prova/Desktop' }],
  }));

  const risposta = await fetch(`${base}/api/v1/frequent-dirs`);
  assert.equal(risposta.status, 200);
  const busta = await risposta.json();
  assert.equal(busta.ok, true);
  assert.deepEqual(busta.data.items, [{ etichetta: 'Desktop', percorso: 'C:/Users/prova/Desktop' }]);
});

test('⛔ AL CONTRARIO — senza cartelleFrequentiFn iniettata, la rotta usa il default REALE (os.homedir()) e torna comunque 200, mai un crash', async (t) => {
  const { base } = await listen(t);
  const risposta = await fetch(`${base}/api/v1/frequent-dirs`);
  assert.equal(risposta.status, 200);
  assert.equal((await risposta.json()).ok, true);
});

test('static handler serves only the mapped assets (HTML/CSS/JS + real fonts + real logo) and has no directory listing', async (t) => {
  const { base } = await listen(t);
  const fontRoutes = [
    'instrument-sans-latin-ext-400-normal.woff2', 'instrument-sans-latin-400-normal.woff2',
    'instrument-sans-latin-ext-500-normal.woff2', 'instrument-sans-latin-500-normal.woff2',
    'instrument-sans-latin-ext-600-normal.woff2', 'instrument-sans-latin-600-normal.woff2',
    'jetbrains-mono-latin-ext-400-normal.woff2', 'jetbrains-mono-latin-400-normal.woff2',
    'jetbrains-mono-latin-ext-500-normal.woff2', 'jetbrains-mono-latin-500-normal.woff2',
  ].map((name) => `/fonts/${name}`);
  for (const route of ['/', '/index.html', '/styles.css', '/app.js', '/talos/brand/logo-short.svg', ...fontRoutes]) {
    const response = await fetch(base + route);
    assert.equal(response.status, 200, route);
    if (route.endsWith('.woff2')) assert.equal(response.headers.get('content-type'), 'font/woff2', route);
    if (route.endsWith('.svg')) assert.equal(response.headers.get('content-type'), 'image/svg+xml', route);
  }
  const disallowed = [
    '/fonts/', '/fonts/../server.mjs', '/fonts/does-not-exist.woff2',
    '/talos/brand/', '/talos/brand/../../server.mjs', '/talos/brand/does-not-exist.svg',
    '/public/', '/mockup-originale/', '/PROVENANCE.md', '/../server.mjs', '/favicon.ico',
  ];
  for (const route of disallowed) {
    assert.equal((await fetch(base + route)).status, 404, route);
  }
});

test('static index accepts only the six canonical qa states and rejects every other query', async (t) => {
  const { base } = await listen(t);
  for (const state of ['desktop', 'laptop', 'tablet', 'mobile', 'mobile-narrow', 'capabilities']) {
    assert.equal((await fetch(`${base}/?qa=${state}`)).status, 200, state);
    assert.equal((await fetch(`${base}/index.html?qa=${state}`, { method: 'HEAD' })).status, 200, `HEAD ${state}`);
  }
  for (const query of ['qa=unknown', 'qa=desktop&extra=1', 'extra=desktop', 'qa=desktop&qa=laptop']) {
    assert.equal((await fetch(`${base}/?${query}`)).status, 400, query);
  }
  assert.equal((await fetch(`${base}/app.js?qa=desktop`)).status, 400);
});

test('response headers apply CSP, nosniff, frame denial and no-store to data', async (t) => {
  const { base } = await listen(t);
  const response = await fetch(`${base}/api/v1/health`);
  assert.match(response.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

/*
 * ⛔ 30/8 — riscritta dopo la rimozione delle rotte campagne (piano
 * "Board — da campagne TALOS-BANCO a cruscotto sessioni"): la proprietà
 * VERA da provare (un errore lanciato da una dipendenza iniettata non
 * espone mai percorsi/stack al client) non era mai stata specifica alle
 * campagne — usava solo `campaignService` come veicolo comodo. Stesso
 * principio, `catalogoModelliFn` come nuovo veicolo (iniettabile, su
 * `/api/v1/models`).
 */
test('errors never expose absolute paths, stack or row evidence', async (t) => {
  const catalogoModelliFn = async () => {
    throw new Error('C:\\secret\\banco\\alpha.jsonl detto-segreto\n    at private-stack');
  };
  const { base } = await listen(t, createHttpApp({
    staticHandler: createStaticHandler(publicDir),
    catalogoModelliFn,
  }));
  const response = await fetch(`${base}/api/v1/models`);
  const text = await response.text();
  assert.equal(response.status, 500);
  assert.doesNotMatch(text, /secret|banco|alpha\.jsonl|private-stack|detto/i);
  assert.equal(JSON.parse(text).error.code, 'INTERNAL_ERROR');
});

/*
 * ⛔ 30/8 — stessa riscrittura di sopra: la proprietà provata (un errore
 * con `code: 'PAYLOAD_LIMIT'` da una dipendenza iniettata torna 413, non
 * un 500 generico) non era specifica alle campagne — `catalogoModelliFn`
 * come veicolo, stesso principio.
 */
test('a dependency throwing PAYLOAD_LIMIT returns a bounded 413, not a generic 500', async (t) => {
  const catalogoModelliFn = async () => { throw Object.assign(new Error('private'), { code: 'PAYLOAD_LIMIT' }); };
  const { base } = await listen(t, createHttpApp({ staticHandler: createStaticHandler(publicDir), catalogoModelliFn }));
  const response = await fetch(`${base}/api/v1/models`);
  assert.equal(response.status, 413);
  assert.equal((await response.json()).error.code, 'PAYLOAD_LIMIT');
});

/*
 * ⛔ 30/8 — stessa riscrittura: `catalogoModelliFn` lento/abortibile al
 * posto di `campaignService.listCampaigns`, stessa proprietà provata
 * (un client che abortisce non impedisce al lavoro server-side in corso
 * di concludersi in modo pulito).
 */
test('client abort closes work cleanly', async (t) => {
  let resolved = false;
  let markStarted;
  const started = new Promise((resolve) => { markStarted = resolve; });
  const catalogoModelliFn = async () => {
    markStarted();
    await new Promise((resolve) => setTimeout(resolve, 25));
    resolved = true;
    return { items: [] };
  };
  const { base } = await listen(t, createHttpApp({ staticHandler: createStaticHandler(publicDir), catalogoModelliFn }));
  const controller = new AbortController();
  const request = fetch(`${base}/api/v1/models`, { signal: controller.signal });
  await started;
  controller.abort();
  await assert.rejects(request, /abort/i);
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(resolved, true);
});

/*
 * ⭐⭐⭐ 28/8 — GET /api/v1/artifacts/:id, la rotta che risolve il difetto
 * srcdoc-eredita-la-CSP (vedi la doc in artifact-store.mjs): risposta HTTP
 * VERA con la SUA propria intestazione, mai quella globale SECURITY_HEADERS
 * (che vieterebbe lo script inline del modello).
 */
test('⭐⭐⭐ GET /api/v1/artifacts/:id: HTML intero, CON la sua CSP permissiva — MAI quella globale script-src \'self\'', async (t) => {
  const { base } = await listen(t, createHttpApp({
    staticHandler: createStaticHandler(publicDir),
    leggiArtefattoFn: (id) => (id === 'a1' ? '<!doctype html><html><body>ciao</body></html>' : null),
  }));
  const response = await fetch(`${base}/api/v1/artifacts/a1`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'text/html; charset=utf-8');
  const csp = response.headers.get('content-security-policy');
  assert.match(csp, /script-src 'unsafe-inline'/, 'permissiva per lo script del modello, qui e SOLO qui');
  assert.doesNotMatch(csp, /script-src 'self'/, 'MAI l\'intestazione globale del resto di Harness UI');
  assert.equal(response.headers.get('x-frame-options'), 'SAMEORIGIN', 'diverso da DENY: la NOSTRA pagina deve poterlo incorporare');
  /*
   * ⛔⛔⛔ 06/9, caccia ai bug CB-01, provato dal vivo: «Apri» portava questo HTML — scritto dal
   * MODELLO — sull'origine della app, e da lì uno script leggeva il localStorage di TALOS e ne
   * portava fuori il contenuto con una navigazione top-level (la CSP fermava fetch, non location).
   * La direttiva `sandbox` mette il documento in un'origine opaca (niente localStorage, niente
   * cookie) e, non concedendo `allow-top-navigation`, toglie anche la via d'uscita.
   */
  assert.match(csp, /^sandbox allow-scripts;/, "origine opaca: l'HTML del modello non tocca i dati della app");
  assert.doesNotMatch(csp, /allow-same-origin/, 'con allow-same-origin la sandbox non servirebbe a niente');
  assert.doesNotMatch(csp, /allow-top-navigation/, "la navigazione top-level era la via d'uscita dei dati");
  assert.equal(await response.text(), '<!doctype html><html><body>ciao</body></html>');
});

test('⛔ GET /api/v1/artifacts/:id con un id ignoto: 404 onesto, non un 200 vuoto', async (t) => {
  const { base } = await listen(t, createHttpApp({
    staticHandler: createStaticHandler(publicDir),
    leggiArtefattoFn: () => null,
  }));
  const response = await fetch(`${base}/api/v1/artifacts/non-esiste`);
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error.code, 'NOT_FOUND');
});

test('⛔⛔ AL CONTRARIO: senza leggiArtefattoFn iniettato (il default reale), un id mai salvato resta 404 — nessuna scorciatoia nei test che nasconda un bug', async (t) => {
  const { base } = await listen(t); // realApp(): usa il vero leggiArtefatto, store vuoto per costruzione in questo processo di test
  const response = await fetch(`${base}/api/v1/artifacts/${crypto.randomUUID()}`);
  assert.equal(response.status, 404);
});
