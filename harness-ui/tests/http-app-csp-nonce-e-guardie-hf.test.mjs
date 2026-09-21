/*
 * Caccia ai bug 08/09/2026 — le tre cure di `src/http-app.mjs`, ognuna con la sua prova.
 *
 * ⛔ Ogni prova qui è stata lanciata PRIMA sul codice vecchio (git stash del solo http-app.mjs)
 * e verificata ROSSA: una prova che passa anche sul difetto non prova niente. I valori attesi
 * sono quelli che il codice vecchio NON produceva — 503 invece di 400, 500 invece di 400,
 * nessun nonce nell'intestazione.
 *
 * BH-06 — la CSP `style-src 'self'` faceva cadere ogni `<style>` che xterm.js crea a runtime.
 * BH-19 — `GET /huggingface/repo` senza `repo` rispondeva 503 (servizio giù) a un errore del chiamante.
 * BH-07 — `POST /huggingface/download` con corpo `{}` rispondeva 500 INTERNAL_ERROR.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { createHttpApp } from '../src/http-app.mjs';
import { createStaticHandler } from '../src/static-files.mjs';

const testDir = dirname(fileURLToPath(import.meta.url));
const publicDir = join(testDir, '..', 'public');

async function ascolta(t, extra = {}) {
  const server = createServer(createHttpApp({ staticHandler: createStaticHandler(publicDir), ...extra }));
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

/** Il nonce dichiarato nell'intestazione, così come lo leggerebbe il browser. */
function nonceDellaCsp(csp, direttiva) {
  const trovato = new RegExp(`${direttiva} [^;]*'nonce-([^']+)'`).exec(csp);
  return trovato ? trovato[1] : null;
}

// ─────────────────────────────── BH-06 ───────────────────────────────

test('BH-06 · il documento porta un nonce CSP, su script-src E su style-src, e mai unsafe-inline', async (t) => {
  const base = await ascolta(t);
  const risposta = await fetch(`${base}/`);
  assert.equal(risposta.status, 200);
  const csp = risposta.headers.get('content-security-policy');
  const nonceStile = nonceDellaCsp(csp, 'style-src');
  const nonceScript = nonceDellaCsp(csp, 'script-src');
  assert.ok(nonceStile, `style-src deve portare un nonce, altrimenti i <style> di xterm restano bloccati — letto: ${csp}`);
  assert.equal(nonceScript, nonceStile, 'un solo nonce per risposta: due valori diversi vorrebbero due timbri');
  // ⛔ 16 byte casuali in base64 = 24 caratteri: sotto i 128 bit un nonce è indovinabile.
  assert.ok(nonceStile.length >= 22, `nonce troppo corto (${nonceStile.length} caratteri)`);
  assert.doesNotMatch(csp, /unsafe-inline/, "la cura non deve essere l'apertura che stavamo evitando");
  assert.match(csp, /style-src 'self' 'nonce-/, "'self' resta: i fogli di stile serviti da noi devono continuare a passare");
});

test('BH-06 · il nonce è NUOVO a ogni risposta, e il documento non è mai messo in cache', async (t) => {
  const base = await ascolta(t);
  const nonce = [];
  for (let giro = 0; giro < 3; giro += 1) {
    const risposta = await fetch(`${base}/index.html`);
    assert.equal(risposta.headers.get('cache-control'), 'no-store', 'un documento con nonce messo in cache regala il nonce a chi lo rilegge');
    nonce.push(nonceDellaCsp(risposta.headers.get('content-security-policy'), 'style-src'));
  }
  assert.equal(new Set(nonce).size, 3, `tre risposte, tre nonce diversi — letti: ${nonce.join(', ')}`);
});

test('BH-06 · il timbro nel documento porta LO STESSO nonce dell intestazione, e sta dentro il head', async (t) => {
  const base = await ascolta(t);
  const risposta = await fetch(`${base}/`);
  const nonce = nonceDellaCsp(risposta.headers.get('content-security-policy'), 'style-src');
  const html = await risposta.text();
  assert.ok(html.includes(`<script nonce="${nonce}">`), 'lo script che timbra deve portare il nonce di QUESTA risposta, o non gira nemmeno');
  assert.ok(html.indexOf('<script nonce=') < html.indexOf('</head>'), 'deve essere installato prima di xterm, che sta in fondo al body');
  assert.ok(html.indexOf('vendor/xterm/xterm.js') > html.indexOf('<script nonce='), 'xterm carica DOPO il timbro');
});

/*
 * ⛔ La prova che morde davvero: il nonce nell'intestazione non serve a niente se non
 * arriva sugli elementi. Qui lo script iniettato viene ESEGUITO contro un finto DOM e si
 * controlla che un `<style>` creato dopo porti il nonce — è il passo che xterm non fa da
 * solo (zero occorrenze di `nonce` nel suo bundle, @xterm/xterm 6.0.0).
 */
test('BH-06 · lo script iniettato TIMBRA davvero i <style> creati dopo (eseguito, non solo letto)', async (t) => {
  const base = await ascolta(t);
  const risposta = await fetch(`${base}/`);
  const nonce = nonceDellaCsp(risposta.headers.get('content-security-policy'), 'style-src');
  const html = await risposta.text();
  const codice = /<script nonce="[^"]+">([\s\S]*?)<\/script>/.exec(html)[1];

  class FintoDocument {
    createElement(tag) { return { tagName: String(tag).toUpperCase(), nonce: undefined }; }
  }
  const documento = new FintoDocument();
  // eslint-disable-next-line no-new-func
  new Function('Document', codice)(FintoDocument);

  const stile = documento.createElement('style');
  assert.equal(stile.nonce, nonce, 'un <style> creato dopo il timbro deve portare il nonce: senza questo la CSP lo scarta e i colori del terminale spariscono');
  const stileMaiuscolo = documento.createElement('STYLE');
  assert.equal(stileMaiuscolo.nonce, nonce, 'anche scritto in maiuscolo: il tag name non è sensibile alle maiuscole');
  const div = documento.createElement('div');
  assert.equal(div.nonce, undefined, 'solo i <style>: il timbro non deve spargere il nonce su tutto il documento');
});

test('BH-06 · un asset che non è un documento resta con la CSP di sempre, senza nonce', async (t) => {
  const base = await ascolta(t);
  for (const percorso of ['/app.js', '/styles.css']) {
    const risposta = await fetch(base + percorso);
    assert.equal(risposta.status, 200, percorso);
    const csp = risposta.headers.get('content-security-policy');
    assert.equal(nonceDellaCsp(csp, 'style-src'), null, `${percorso} non ha nessun <style> da timbrare: un nonce qui sarebbe solo un valore in giro`);
    assert.match(csp, /style-src 'self'/, percorso);
  }
});

test('BH-06 · HEAD sul documento resta coerente: nessun corpo, Content-Length del corpo timbrato', async (t) => {
  const base = await ascolta(t);
  const testa = await fetch(`${base}/index.html`, { method: 'HEAD' });
  assert.equal(testa.status, 200);
  assert.equal(await testa.text(), '');
  const corpo = await (await fetch(`${base}/index.html`)).text();
  assert.equal(Number(testa.headers.get('content-length')), Buffer.byteLength(corpo, 'utf8'), 'la lunghezza dichiarata deve essere quella del documento SERVITO, timbro compreso');
});

// ─────────────────────────────── BH-19 ───────────────────────────────

const HUB_COMPLETO = {
  describeModel: async (repo) => ({ repo, revision: 'c'.repeat(40), readme: '# model' }),
  listGgufFiles: async () => [{ path: 'model.gguf', sizeBytes: 4, sha256: 'b'.repeat(64) }],
  pathsInfo: async (repo, revision, paths) => paths.map((path) => ({ path, sizeBytes: 4 })),
};

test('BH-19 · /huggingface/repo senza `repo` è un errore di CHI CHIAMA: 400, non 503', async (t) => {
  const base = await ascolta(t, { hfHubClient: HUB_COMPLETO });
  const risposta = await fetch(`${base}/api/v1/huggingface/repo`);
  assert.equal(risposta.status, 400, "l'hub è collegato: l'unica cosa che manca è il parametro, e 503 accuserebbe il server");
  const corpo = await risposta.json();
  assert.equal(corpo.ok, false);
  assert.equal(corpo.error.code, 'QUERY_INVALID');
  // Anche un `repo` presente ma vuoto è la stessa cosa: una richiesta che non nomina niente.
  assert.equal((await fetch(`${base}/api/v1/huggingface/repo?repo=`)).status, 400);
});

test('BH-19 · AL CONTRARIO — con `repo` e senza hub resta 503: la guardia sul servizio non è stata persa', async (t) => {
  const base = await ascolta(t, { hfHubClient: null });
  const risposta = await fetch(`${base}/api/v1/huggingface/repo?repo=${encodeURIComponent('org/model')}`);
  assert.equal(risposta.status, 503, 'qui il chiamante ha fatto tutto giusto: è il servizio a non esserci');
  assert.equal((await risposta.json()).error.code, 'RUNTIME_NOT_AVAILABLE');
});

test('BH-19 · e una richiesta completa continua a rispondere 200', async (t) => {
  const base = await ascolta(t, { hfHubClient: HUB_COMPLETO });
  const risposta = await fetch(`${base}/api/v1/huggingface/repo?repo=${encodeURIComponent('org/model')}&revision=${'c'.repeat(40)}`);
  assert.equal(risposta.status, 200);
  assert.equal((await risposta.json()).data.files.length, 1);
});

// ─────────────────────────────── BH-07 ───────────────────────────────

const MANIFEST_BUONO = {
  id: 'org-model', repo: 'org/model', revision: 'a'.repeat(40),
  files: [{ path: 'model.gguf', bytes: 4, sha256: 'b'.repeat(64) }],
  bytes: 4, sha256: 'b'.repeat(64), license: 'apache-2.0', path: 'org-model',
};

function trasferimentoFinto(avvio = async (manifest) => ({ id: manifest.id, state: 'running', progress: 0 })) {
  return { start: avvio, status: () => ({ id: 'org-model', state: 'running', progress: 0 }), pause: async () => true, resume: async () => true, cancel: async () => true };
}

async function postDownload(base, corpo) {
  return fetch(`${base}/api/v1/huggingface/download`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo),
  });
}

/*
 * ⛔ Il servizio VERO, quello che il server monta (`server.mjs` riga ~208): è l'unico modo di
 * riprodurre BH-07 com'è stato visto, cioè 500 INTERNAL_ERROR con corpo `{}`. Con un servizio
 * finto e permissivo il codice vecchio rispondeva addirittura 200 — che è il difetto sotto il
 * difetto: senza guardia alla porta, cosa succede a un corpo malformato lo decide chi sta
 * dietro, e ogni implementazione decide diverso.
 */
test('BH-07 · corpo vuoto contro il servizio VERO: 400 dalla porta, non 500 dal fondo', async (t) => {
  const { createHfDirectTransfer } = await import('../src/hf-direct-transfer.mjs');
  const base = await ascolta(t, {
    localModelTransfer: createHfDirectTransfer({
      rootDir: join(testDir, 'fixtures', 'modelli-inesistenti'),
      modelStore: { inspect: async () => null, register: async () => {}, setState: async () => {} },
      hubClient: { resolveDownload: async () => ({ url: 'https://huggingface.co/x' }) },
    }),
  });
  const risposta = await postDownload(base, {});
  assert.equal(risposta.status, 400, 'il corpo era vuoto: accusare il server («Errore interno») è una risposta falsa');
  const corpo = await risposta.json();
  assert.equal(corpo.error.code, 'QUERY_INVALID');
  assert.notEqual(corpo.error.code, 'INTERNAL_ERROR');
  assert.match(corpo.error.message ?? '', /.+/, 'il messaggio non può essere vuoto: è tutto quello che il chiamante ha per capire cosa manca');
});

test('BH-07 · con un servizio permissivo un corpo malformato veniva passato oltre: ora si ferma alla porta', async (t) => {
  const base = await ascolta(t, { localModelTransfer: trasferimentoFinto() });
  const risposta = await postDownload(base, {});
  assert.equal(risposta.status, 400, 'la porta decide, non chi sta dietro: prima questo corpo arrivava intatto al servizio');
  assert.equal((await risposta.json()).error.code, 'QUERY_INVALID');
});

test('BH-07 · ogni campo obbligatorio che manca o è malformato è 400, e il servizio non viene nemmeno chiamato', async (t) => {
  const chiamate = [];
  const base = await ascolta(t, { localModelTransfer: trasferimentoFinto(async (manifest) => { chiamate.push(manifest); return { id: manifest.id, state: 'running', progress: 0 }; }) });
  const guasti = {
    'niente id': { ...MANIFEST_BUONO, id: '' },
    'niente repo': { ...MANIFEST_BUONO, repo: '   ' },
    'revision non è un hash': { ...MANIFEST_BUONO, revision: 'main' },
    'files vuoto': { ...MANIFEST_BUONO, files: [] },
    'files non è una lista': { ...MANIFEST_BUONO, files: { path: 'model.gguf' } },
    'un file senza path': { ...MANIFEST_BUONO, files: [{ bytes: 4, sha256: 'b'.repeat(64) }] },
    'un file senza impronta': { ...MANIFEST_BUONO, files: [{ path: 'model.gguf', bytes: 4 }] },
    'impronta della lunghezza sbagliata': { ...MANIFEST_BUONO, files: [{ path: 'model.gguf', bytes: 4, sha256: 'b'.repeat(63) }] },
    'bytes a zero': { ...MANIFEST_BUONO, bytes: 0 },
    'bytes non intero': { ...MANIFEST_BUONO, bytes: 4.5 },
    'niente path': { ...MANIFEST_BUONO, path: '' },
    'corpo che è una lista': [MANIFEST_BUONO],
    'corpo che è un numero': 7,
  };
  for (const [nome, corpo] of Object.entries(guasti)) {
    const risposta = await postDownload(base, corpo);
    assert.equal(risposta.status, 400, nome);
    assert.equal((await risposta.json()).error.code, 'QUERY_INVALID', nome);
  }
  assert.deepEqual(chiamate, [], 'nessuna di queste richieste deve arrivare al servizio: la forma si ferma alla porta');
});

test('BH-07 · AL CONTRARIO — un manifest completo passa e risponde 200', async (t) => {
  const chiamate = [];
  const base = await ascolta(t, { localModelTransfer: trasferimentoFinto(async (manifest) => { chiamate.push(manifest); return { id: manifest.id, state: 'running', progress: 0 }; }) });
  const risposta = await postDownload(base, MANIFEST_BUONO);
  assert.equal(risposta.status, 200, 'la guardia nuova non deve essere più severa del servizio, o rifiuterebbe richieste legittime');
  assert.equal(chiamate.length, 1);
  assert.equal(chiamate[0].repo, 'org/model');
});

/*
 * ⛔ La seconda metà di BH-07: il codice `HF_TRANSFER_INVALID` non aveva una riga in
 * STATUS_BY_CODE, quindi `normalizeError` restituiva `statusCode: undefined`,
 * `res.writeHead(undefined)` lanciava e la rete di sicurezza rispondeva 500 INTERNAL_ERROR,
 * col codice vero perso. Qui il corpo supera la guardia di forma e viene rifiutato DENTRO il
 * servizio: è l'unico modo di attraversare quella strada.
 */
test('BH-07 · un rifiuto del servizio esce 422 col SUO codice, non 500 INTERNAL_ERROR', async (t) => {
  const base = await ascolta(t, {
    localModelTransfer: trasferimentoFinto(async () => {
      const errore = new Error('download manifest is invalid');
      errore.code = 'HF_TRANSFER_INVALID';
      throw errore;
    }),
  });
  const risposta = await postDownload(base, MANIFEST_BUONO);
  assert.equal(risposta.status, 422);
  assert.equal((await risposta.json()).error.code, 'HF_TRANSFER_INVALID', 'il codice vero deve arrivare al chiamante, non essere sostituito da INTERNAL_ERROR');
});

test('BH-07 · un codice noto senza stato dichiarato ripiega su 500 MA conserva il suo codice', async (t) => {
  const base = await ascolta(t, {
    localModelTransfer: trasferimentoFinto(async () => {
      const errore = new Error('checksum mismatch');
      errore.code = 'CHECKSUM_MISMATCH'; // uno dei quattordici ancora senza riga in STATUS_BY_CODE
      throw errore;
    }),
  });
  const risposta = await postDownload(base, MANIFEST_BUONO);
  assert.equal(risposta.status, 500, 'lo stato giusto non è ancora deciso — ma la risposta non deve schiantare');
  assert.equal((await risposta.json()).error.code, 'CHECKSUM_MISMATCH', 'prima usciva INTERNAL_ERROR: il motivo vero spariva proprio quando serviva');
});
