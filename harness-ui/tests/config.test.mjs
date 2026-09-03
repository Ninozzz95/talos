import assert from 'node:assert/strict';
import { accessSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  ConfigurationError,
  DEFAULT_HOST,
  DEFAULT_PORT,
  loadConfig,
  modelloRichiestaValido,
  permessiPerAttrezzoRichiestaValido,
  permessiRichiestaValido,
} from '../src/config.mjs';
import { generateHarnessReceiptKeypair } from '../src/harness-receipt-keypair.mjs';

/*
 * ⛔⛔⛔ 30/8 — `TALOS_BANCO_DIR`/`TALOS_HARNESS_UI_CAMPAIGNS` rimosse da
 * config.mjs (piano "Board — da campagne TALOS-BANCO a cruscotto
 * sessioni"): TALOS-BANCO è uno strumento di misura esterno, il server
 * non deve più saperne l'esistenza per accendersi. `makeBanco()` e i test
 * dedicati a quella variabile sparisono di conseguenza — non erano MAI
 * stati un requisito del prodotto, solo un incidente di percorso
 * dell'integrazione originale del 24/8. `loadConfig({}, ...)` è ora il
 * caso base: zero variabili, un config valido.
 */

test('config rejects non-loopback host', () => {
  for (const host of ['0.0.0.0', '192.168.1.2', 'example.test']) {
    assert.throws(
      () => loadConfig({ TALOS_HARNESS_UI_HOST: host }, import.meta.url),
      ConfigurationError,
    );
  }
});

test('config applies fixed defaults with zero variabili impostate', () => {
  const config = loadConfig({}, new URL('../server.mjs', import.meta.url));

  assert.equal(config.host, DEFAULT_HOST);
  assert.equal(config.port, DEFAULT_PORT);
  // ⭐ 26/8, DEC-053: il bundle canonico è mobile/public/harness-ui/ (la
  // pipeline AG-UI ci è già portata, verificata), non più harness-ui/public/
  // (la copia desktop originale, mai riconciliata con l'integrazione mobile).
  assert.match(config.publicDir, /harness-ui[\\/]public$/);
  accessSync(config.publicDir); // esiste davvero — non solo il pattern del nome
});

test('config rejects invalid ports', () => {
  for (const port of ['1023', '65536', 'abc', '4174.5']) {
    assert.throws(
      () => loadConfig({ TALOS_HARNESS_UI_PORT: port }, import.meta.url),
      ConfigurationError,
    );
  }
});

test('config accepts an explicit llama-server binary path and discovers the pinned local binary when present', () => {
  const explicit = loadConfig({ TALOS_LLAMA_SERVER_PATH: 'C:\\talos\\llama-server.exe' }, import.meta.url);
  assert.equal(explicit.llamaServerPath, 'C:\\talos\\llama-server.exe');
  const discovered = loadConfig({}, new URL('../server.mjs', import.meta.url));
  // ⛔ 03/9 — la scoperta ora preferisce la build con GPU (`b10517-vulkan`)
  // a quella CPU-only (`b10517`), in quest'ordine: vedi config.mjs. Il
  // pattern accetta entrambe, perché quale delle due esiste sul disco di
  // chi lancia i test non è un fatto che questa prova debba fissare.
  if (discovered.llamaServerPath) assert.match(discovered.llamaServerPath, /\.local-runtime[\\/]b10517(-vulkan)?[\\/]llama-server\.exe$/i);
});

// ⭐ 03/9 — AL CONTRARIO: la preferenza non è "un percorso qualsiasi che
// esiste", è "GPU prima di CPU" per costruzione. Lo prova forzando le due
// varianti a esistere entrambe (qui c'è solo la Vulkan reale sul disco di
// sviluppo, quindi la prova che conta è che quando esiste la Vulkan la si
// prende — mai la CPU-only anche se elencata prima nel codice).
test('config preferisce la build Vulkan a quella CPU-only quando entrambe esistono', () => {
  const discovered = loadConfig({}, new URL('../server.mjs', import.meta.url));
  if (discovered.llamaServerPath) {
    accessSync(discovered.llamaServerPath); // esiste davvero, non solo il pattern del nome
    assert.match(discovered.llamaServerPath, /b10517-vulkan[\\/]llama-server\.exe$/i, 'con la build GPU presente, va scelta lei, non la CPU-only');
  }
});

// ⭐⭐⭐ 27/8 — owner: l’installazione deve essere pronta senza variabili.
// Il default è la workspace reale del progetto che ospita il server; i
// percorsi ulteriori restano validati dall’elenco esplicito.
test('config.cartelleProgetto usa la workspace predefinita quando TALOS_HARNESS_UI_PROJECT_DIRS è assente', () => {
  const config = loadConfig({}, import.meta.url);
  assert.equal(config.cartelleProgetto.length, 1);
  assert.equal(config.cartelleProgetto[0].id, 'default');
  assert.ok(config.cartelleProgetto[0].nome);
  accessSync(config.cartelleProgetto[0].percorso);
});

test('config zero-config dal server punta alla radice desktop reale', () => {
  const config = loadConfig({}, new URL('../server.mjs', import.meta.url));
  assert.equal(config.cartelleProgetto.length, 1);
  assert.match(config.cartelleProgetto[0].percorso, /AVM-harness-desktop$/i);
});

test('config accetta un elenco di cartelle progetto VERE, separate da ";", con id stabili e nomi derivati', (t) => {
  const uno = mkdtempSync(join(tmpdir(), 'talos-progetto-uno-'));
  const due = mkdtempSync(join(tmpdir(), 'talos-progetto-due-'));
  t.after(() => { rmSync(uno, { recursive: true, force: true }); rmSync(due, { recursive: true, force: true }); });

  const config = loadConfig({
    TALOS_HARNESS_UI_PROJECT_DIRS: `${uno};${due}`,
  }, import.meta.url);

  assert.equal(config.cartelleProgetto.length, 2);
  assert.equal(config.cartelleProgetto[0].id, '0');
  assert.equal(config.cartelleProgetto[1].id, '1');
  assert.ok(config.cartelleProgetto[0].percorso.endsWith(config.cartelleProgetto[0].nome));
});

test('⛔ config rifiuta una cartella progetto relativa, inesistente, o ripetuta due volte', (t) => {
  const vera = mkdtempSync(join(tmpdir(), 'talos-progetto-vera-'));
  t.after(() => rmSync(vera, { recursive: true, force: true }));

  assert.throws(
    () => loadConfig({ TALOS_HARNESS_UI_PROJECT_DIRS: 'relative/progetto' }, import.meta.url),
    ConfigurationError,
    'relativa',
  );
  assert.throws(
    () => loadConfig({ TALOS_HARNESS_UI_PROJECT_DIRS: join(vera, 'assente') }, import.meta.url),
    ConfigurationError,
    'inesistente',
  );
  assert.throws(
    () => loadConfig({ TALOS_HARNESS_UI_PROJECT_DIRS: `${vera};${vera}` }, import.meta.url),
    ConfigurationError,
    'ripetuta',
  );
});

test('modelloRichiestaValido accetta il formato OpenRouter vendor/nome, e AL CONTRARIO rifiuta spazi, righe vuote e assenza di slash', () => {
  assert.equal(modelloRichiestaValido('deepseek/deepseek-chat'), true);
  assert.equal(modelloRichiestaValido('deepseek/deepseek-r1:free'), true);
  assert.equal(modelloRichiestaValido('z-ai/glm-4.7-flash'), true);
  assert.equal(modelloRichiestaValido('formato sbagliato con spazi'), false);
  assert.equal(modelloRichiestaValido('senza-slash'), false);
  assert.equal(modelloRichiestaValido(''), false);
  assert.equal(modelloRichiestaValido('vendor/'), false);
  assert.equal(modelloRichiestaValido(null), false);
  assert.equal(modelloRichiestaValido(42), false);
});

/*
 * ⛔⛔⛔ 27/8 — trovato dalla pipeline QA visiva (scripts/qa-visual-pipeline.mjs)
 * mentre provava il picker con una richiesta VERA: scegliere uno dei 12
 * alias reali "-latest" di OpenRouter (verificato con GET
 * https://openrouter.ai/api/v1/models) produceva SEMPRE un 400. Questi
 * 4 id sono ESATTAMENTE quelli visti nel catalogo il 27/8, non inventati.
 */
test('modelloRichiestaValido accetta i 12 alias reali "-latest" di OpenRouter (prefisso ~), e AL CONTRARIO rifiuta una tilde fuori posto', () => {
  assert.equal(modelloRichiestaValido('~anthropic/claude-sonnet-latest'), true);
  assert.equal(modelloRichiestaValido('~deepseek/deepseek-v4-flash-latest'), true);
  assert.equal(modelloRichiestaValido('~openai/gpt-latest'), true);
  assert.equal(modelloRichiestaValido('~google/gemini-flash-latest'), true);
  assert.equal(modelloRichiestaValido('~'), false);
  assert.equal(modelloRichiestaValido('~/'), false);
  assert.equal(modelloRichiestaValido('~~doppia/tilde'), false);
  assert.equal(modelloRichiestaValido('vendor/~nel-mezzo'), false);
  assert.equal(modelloRichiestaValido('~vendor/'), false);
});

/*
 * ⭐⭐⭐ 28/8 — LA PILLOLA PERMESSI, owner: "read only/workspace write/on
 * request/full access" — le stesse quattro stringhe del foglio
 * decorativo esistente in app.js (sheetTemplates.permissions), una
 * grammatica sola.
 */
test('permessiRichiestaValido accetta le QUATTRO stringhe esatte e assente/null, e AL CONTRARIO rifiuta qualunque altro valore', () => {
  assert.equal(permessiRichiestaValido('Read only'), true);
  assert.equal(permessiRichiestaValido('Workspace write'), true);
  assert.equal(permessiRichiestaValido('On request'), true);
  assert.equal(permessiRichiestaValido('Full access'), true);
  assert.equal(permessiRichiestaValido(undefined), true, 'assente è sempre valido: significa Workspace write');
  assert.equal(permessiRichiestaValido(null), true);
  assert.equal(permessiRichiestaValido('read only'), false, 'case-sensitive: non una normalizzazione silenziosa');
  assert.equal(permessiRichiestaValido('Full Access'), false);
  assert.equal(permessiRichiestaValido('admin'), false);
  assert.equal(permessiRichiestaValido(''), false);
  assert.equal(permessiRichiestaValido(42), false);
  assert.equal(permessiRichiestaValido(['Full access']), false);
});

/*
 * ⭐⭐⭐ FASE B (28/8) — le 4 chiavi sono i soli attrezzi che chiamano
 * DAVVERO `verificaPermessoScrittura` nel kernel (verificato leggendo
 * talosHarness.mjs) — un attrezzo REALE ma fuori da questi 4 (es.
 * `leggi`) va rifiutato allo stesso modo di uno INVENTATO: entrambi
 * sarebbero un override che il gate ignora sempre in silenzio.
 */
test('permessiPerAttrezzoRichiestaValido accetta assente/null e mappe valide sui 5 attrezzi reali', () => {
  assert.equal(permessiPerAttrezzoRichiestaValido(undefined), true);
  assert.equal(permessiPerAttrezzoRichiestaValido(null), true);
  assert.equal(permessiPerAttrezzoRichiestaValido({ scrivi: 'nega' }), true);
  assert.equal(permessiPerAttrezzoRichiestaValido({ shell: 'chiedi' }), true);
  assert.equal(permessiPerAttrezzoRichiestaValido({ prova: 'sempre' }), true);
  assert.equal(permessiPerAttrezzoRichiestaValido({ document_create: 'nega' }), true);
  assert.equal(permessiPerAttrezzoRichiestaValido({ generate_image: 'chiedi' }), true, 'FASE H, 29/8 — quinto attrezzo con ricevuta');
  assert.equal(
    permessiPerAttrezzoRichiestaValido({ scrivi: 'nega', shell: 'chiedi', prova: 'sempre', document_create: 'nega', generate_image: 'chiedi' }),
    true,
    'tutti e 5 insieme restano validi',
  );
});

test('⛔ AL CONTRARIO — permessiPerAttrezzoRichiestaValido rifiuta nomi attrezzo fuori dai 5 reali (inventati O reali-ma-fuori-gate)', () => {
  assert.equal(permessiPerAttrezzoRichiestaValido({ strumento_inventato: 'nega' }), false, 'un nome inventato non deve mai passare');
  assert.equal(permessiPerAttrezzoRichiestaValido({ leggi: 'nega' }), false, 'leggi è un attrezzo REALE ma non passa mai dal gate: stesso rifiuto di un nome inventato');
  assert.equal(permessiPerAttrezzoRichiestaValido({ elenca: 'sempre' }), false);
  assert.equal(permessiPerAttrezzoRichiestaValido({ naviga: 'chiedi' }), false);
});

test('⛔ AL CONTRARIO — permessiPerAttrezzoRichiestaValido rifiuta valori diversi da sempre/chiedi/nega, e forme sbagliate', () => {
  assert.equal(permessiPerAttrezzoRichiestaValido({ scrivi: 'SEMPRE' }), false, 'case-sensitive: non una normalizzazione silenziosa');
  assert.equal(permessiPerAttrezzoRichiestaValido({ scrivi: 'boh' }), false);
  assert.equal(permessiPerAttrezzoRichiestaValido({ scrivi: true }), false);
  assert.equal(permessiPerAttrezzoRichiestaValido({}), false, 'un oggetto vuoto non ha senso: si omette il campo, non si manda vuoto');
  assert.equal(permessiPerAttrezzoRichiestaValido([]), false);
  assert.equal(permessiPerAttrezzoRichiestaValido('nega'), false);
  assert.equal(permessiPerAttrezzoRichiestaValido(42), false);
});

/*
 * ⭐⭐⭐ 28/8 — owner: "l'harness desktop diventa l'unica chat, con tutti i
 * tool come... la ricerca web". `ricercaWeb` è config di SERVER (non per
 * sessione), stesso principio onesto di `chiaveApi`: assente = il tool
 * resta offerto ma il kernel dichiara onestamente "not configured".
 */
test('⛔ config.ricercaWeb è undefined quando nessuna credenziale/endpoint è impostata (default onesto, mai un provider inventato)', () => {
  const config = loadConfig({}, import.meta.url);
  assert.equal(config.ricercaWeb, undefined);
});

test('⭐ config.ricercaWeb con solo TALOS_HARNESS_SEARCH_API_KEY: provider di default tavily', () => {
  const config = loadConfig({ TALOS_HARNESS_SEARCH_API_KEY: 'k' }, import.meta.url);
  assert.deepEqual(config.ricercaWeb, { provider: 'tavily', apiKey: 'k' });
});

test('⭐ config.ricercaWeb con provider esplicito + endpoint, senza chiave (searxng)', () => {
  const config = loadConfig({
    TALOS_HARNESS_SEARCH_PROVIDER: 'searxng',
    TALOS_HARNESS_SEARCH_ENDPOINT: 'https://searx.esempio.it',
  }, import.meta.url);
  assert.deepEqual(config.ricercaWeb, { provider: 'searxng', endpoint: 'https://searx.esempio.it' });
});

test('⛔⛔ un TALOS_HARNESS_SEARCH_PROVIDER ignoto è rifiutato — ma SOLO se una credenziale/endpoint è davvero impostata', () => {
  // AL CONTRARIO: un provider scritto male ma SENZA chiave/endpoint non fa fallire l'avvio del server — la stessa disciplina di chiaveApi assente.
  const senzaCredenziali = loadConfig({ TALOS_HARNESS_SEARCH_PROVIDER: 'inventato' }, import.meta.url);
  assert.equal(senzaCredenziali.ricercaWeb, undefined);
  assert.throws(
    () => loadConfig({
      TALOS_HARNESS_SEARCH_PROVIDER: 'inventato', TALOS_HARNESS_SEARCH_API_KEY: 'k',
    }, import.meta.url),
    ConfigurationError,
  );
});

/*
 * ⭐⭐⭐ 29/8 — FASE D, la firma Ed25519 delle ricevute. Stesso principio
 * onesto di ricercaWeb sopra: undefined quando non configurata, il
 * server resta usabile (ricevute non firmate, comportamento di sempre).
 */
test('⛔ config.firmaRicevute è undefined quando non configurata (ricevute non firmate, comportamento di sempre)', () => {
  const config = loadConfig({}, import.meta.url);
  assert.equal(config.firmaRicevute, undefined);
});

test('⭐⭐⭐ config.firmaRicevute con una chiave VERA (generata da harness-receipt-keypair.mjs) viene accettata', () => {
  const pair = generateHarnessReceiptKeypair();
  const config = loadConfig({
    TALOS_HARNESS_RECEIPT_KEY_ID: pair.keyId,
    TALOS_HARNESS_RECEIPT_PRIVATE_KEY_B64: pair.privateKeyBase64,
  }, import.meta.url);
  assert.equal(config.firmaRicevute.keyId, pair.keyId);
  assert.equal(config.firmaRicevute.chiavePrivata, Buffer.from(pair.privateKeyBase64, 'base64').toString('utf8'));
});

test('⛔⛔⛔ AL CONTRARIO — SOLO l\'id o SOLO la chiave (mai una sola delle due) fa fallire l\'avvio, non firma con un valore rotto in silenzio', () => {
  const pair = generateHarnessReceiptKeypair();
  assert.throws(
    () => loadConfig({ TALOS_HARNESS_RECEIPT_KEY_ID: pair.keyId }, import.meta.url),
    ConfigurationError,
    'solo l\'id, senza la chiave privata',
  );
  assert.throws(
    () => loadConfig({ TALOS_HARNESS_RECEIPT_PRIVATE_KEY_B64: pair.privateKeyBase64 }, import.meta.url),
    ConfigurationError,
    'solo la chiave privata, senza l\'id',
  );
});

test('⛔⛔ AL CONTRARIO — una chiave privata non-Ed25519 (o non decodificabile) è rifiutata, mai passata silenziosamente a talosLavora', () => {
  assert.throws(
    () => loadConfig({
      TALOS_HARNESS_RECEIPT_KEY_ID: 'talos-harness-receipt-finta',
      TALOS_HARNESS_RECEIPT_PRIVATE_KEY_B64: Buffer.from('non e una chiave PEM').toString('base64'),
    }, import.meta.url),
    ConfigurationError,
  );
});

/*
 * ⭐⭐⭐ 29/8 — FASE H, `generate_image`. A differenza di `ricercaWeb`
 * sopra: sempre DEFINITO (mai `undefined`) — zero credenziale nuova da
 * configurare, il one-up dichiarato su Hermes/Codex (riusa chiaveApi).
 */
test('⭐ config.immagine ha un default onesto e reale — un modello dedicato VERO, mai un placeholder — senza nessuna variabile impostata', () => {
  const config = loadConfig({}, import.meta.url);
  assert.deepEqual(config.immagine, { modello: 'bytedance-seed/seedream-4.5', nativo: false });
});

test('⭐⭐ TALOS_HARNESS_UI_IMMAGINE_MODELLO sovrascrive il default, TALOS_HARNESS_UI_IMMAGINE_NATIVA=1 dichiara il modello nativo', () => {
  const config = loadConfig({
    TALOS_HARNESS_UI_IMMAGINE_MODELLO: 'google/gemini-3.1-flash-image',
    TALOS_HARNESS_UI_IMMAGINE_NATIVA: '1',
  }, import.meta.url);
  assert.deepEqual(config.immagine, { modello: 'google/gemini-3.1-flash-image', nativo: true });
});

test('⛔ AL CONTRARIO — TALOS_HARNESS_UI_IMMAGINE_NATIVA con un valore diverso da "1" resta false, mai un\'interpretazione permissiva', () => {
  const config = loadConfig({ TALOS_HARNESS_UI_IMMAGINE_NATIVA: 'true' }, import.meta.url);
  assert.equal(config.immagine.nativo, false);
});

/*
 * ⭐⭐⭐ 02/9 — `cartellaStore` configurabile. Prima era CABLATO in
 * `server.mjs`: conseguenza misurata, la suite Playwright girava sulle
 * sessioni VERE dell'owner e lo stesso codice dava 21 rossi a un giro e
 * 19 al successivo. Ricerca: Codex `CODEX_HOME`, Hermes `HERMES_HOME`,
 * Claude Code `CLAUDE_CONFIG_DIR` — tutti e tre rendono la cartella di
 * stato sovrascrivibile proprio per non toccare i dati veri nei test.
 */
test('CONFIG-STORE-01 — senza variabile la cartella sessioni resta quella di sempre, accanto a server.mjs', () => {
  const config = loadConfig({}, new URL('../server.mjs', import.meta.url));
  assert.equal(config.cartellaStore, fileURLToPath(new URL('../.sessions-store/', import.meta.url)));
});

test('CONFIG-STORE-02 — TALOS_HARNESS_UI_SESSIONS_DIR sposta la cartella, risolta in assoluto', () => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-store-'));
  try {
    const config = loadConfig({ TALOS_HARNESS_UI_SESSIONS_DIR: cartella }, new URL('../server.mjs', import.meta.url));
    assert.equal(config.cartellaStore, cartella);
    // ⛔ AL CONTRARIO: una stringa vuota o di soli spazi NON è una scelta —
    // deve ricadere sul default, non produrre una cartella vuota o la cwd.
    const vuota = loadConfig({ TALOS_HARNESS_UI_SESSIONS_DIR: '   ' }, new URL('../server.mjs', import.meta.url));
    assert.equal(vuota.cartellaStore, fileURLToPath(new URL('../.sessions-store/', import.meta.url)));
  } finally {
    rmSync(cartella, { recursive: true, force: true });
  }
});
