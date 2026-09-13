import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  ENDPOINT_SENTINELLA_DUCKDUCKGO, HOST_SENTINELLA_SENZA_CHIAVE,
  analizzaHtmlDuckDuckGo, cercaDuckDuckGo, creaTrasportoSenzaChiave, sembraBloccoDuckDuckGo,
} from '../src/duckduckgo-search.mjs';

const fixture = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'duckduckgo-html-sample.html'), 'utf8');

/*
 * ⭐⭐⭐ 04/9 — R-03, ricerca web senza chiave. La fixture è un RITAGLIO della
 * risposta vera di html.duckduckgo.com del 04/09 (HTTP 200), non un HTML
 * scritto a memoria: se DuckDuckGo cambia il markup, questo test resta verde
 * ma il parser può smettere di trovare risultati — per questo il trasporto
 * dice «blocco» solo su segnali espliciti, e «zero risultati» resta zero.
 */

test('DDG-PARSE-01 — dal markup reale escono url decodificati dal redirect, titolo e snippet senza tag', () => {
  const risultati = analizzaHtmlDuckDuckGo(fixture, 10);
  assert.equal(risultati.length, 3);
  for (const r of risultati) {
    assert.match(r.url, /^https?:\/\//);
    assert.doesNotMatch(r.url, /duckduckgo\.com\/l\//, 'l\'URL deve essere quello vero (uddg), mai il redirect');
    assert.ok(r.title.length > 0);
    assert.doesNotMatch(r.title, /<|>/);
    assert.doesNotMatch(r.content, /<b>|<\/b>/);
  }
  assert.ok(risultati.some((r) => r.url.includes('github.com')), 'la fixture contiene un risultato github');
});

test('DDG-PARSE-02 — maxRisultati taglia; HTML vuoto o non HTML dà zero, mai un lancio', () => {
  assert.equal(analizzaHtmlDuckDuckGo(fixture, 1).length, 1);
  assert.deepEqual(analizzaHtmlDuckDuckGo('', 5), []);
  assert.deepEqual(analizzaHtmlDuckDuckGo(null, 5), []);
  assert.deepEqual(analizzaHtmlDuckDuckGo('<html>{"non":"html"}</html>', 5), []);
});

test('DDG-BLOCCO-03 — 403/429/202 o una pagina senza risultati che parla di anomalia/captcha sono un blocco; la pagina vera non lo è', () => {
  assert.equal(sembraBloccoDuckDuckGo(403, ''), true);
  assert.equal(sembraBloccoDuckDuckGo(429, ''), true);
  assert.equal(sembraBloccoDuckDuckGo(200, '<html>Our systems have detected unusual traffic. Please solve this captcha.</html>'), true);
  assert.equal(sembraBloccoDuckDuckGo(200, fixture), false);
});

test('DDG-CERCA-04 — cercaDuckDuckGo usa un fetch iniettato, manda solo la query verso un host FISSO, e traduce il blocco in un errore onesto', async () => {
  const chiamate = [];
  const fetchOk = async (url, opzioni) => { chiamate.push({ url: String(url), ua: opzioni.headers['user-agent'] }); return { ok: true, status: 200, text: async () => fixture }; };
  const risultati = await cercaDuckDuckGo('talos coding agent', 2, { fetchFn: fetchOk });
  assert.equal(risultati.length, 2);
  assert.equal(chiamate.length, 1);
  assert.match(chiamate[0].url, /^https:\/\/html\.duckduckgo\.com\/html\/\?q=talos\+coding\+agent$/);
  assert.match(chiamate[0].ua, /TALOS-Harness/);

  const fetchBlocco = async () => ({ ok: false, status: 403, text: async () => '' });
  await assert.rejects(() => cercaDuckDuckGo('x', 2, { fetchFn: fetchBlocco }), (e) => e.code === 'SEARCH_BLOCKED');
  const fetchRotto = async () => { throw new Error('ECONNRESET'); };
  await assert.rejects(() => cercaDuckDuckGo('x', 2, { fetchFn: fetchRotto }), (e) => e.code === 'SEARCH_UNREACHABLE');
  assert.deepEqual(await cercaDuckDuckGo('   ', 2, { fetchFn: fetchOk }), []);
});

test('DDG-TRASPORTO-05 — il trasporto iniettato risponde SOLO per l\'host sentinella nella forma { results } del kernel; AL CONTRARIO qualunque altro host è rifiutato', async () => {
  const trasporto = creaTrasportoSenzaChiave({ fetchFn: async () => ({ ok: true, status: 200, text: async () => fixture }) });
  const url = new URL(ENDPOINT_SENTINELLA_DUCKDUCKGO);
  url.searchParams.set('q', 'prova'); url.searchParams.set('count', '2');
  assert.equal(url.hostname, HOST_SENTINELLA_SENZA_CHIAVE);
  const risposta = await trasporto(url);
  assert.equal(risposta.stato, 200);
  const corpo = JSON.parse(risposta.corpo);
  assert.equal(corpo.results.length, 2);
  assert.ok(corpo.results.every((r) => r.url && r.title && 'content' in r));
  await assert.rejects(() => trasporto(new URL('https://api.tavily.com/search?q=x')), (e) => e.code === 'SEARCH_FAILED');
  await assert.rejects(() => trasporto(new URL('http://127.0.0.1:4174/api/v1/health?q=x')), (e) => e.code === 'SEARCH_FAILED');
});

/*
 * ⛔⛔ IL RITENTATIVO — 10/09/2026, e non nasce da un'impressione.
 *
 * Misurato: la ricerca dal 4174 è fallita TRE volte con «fetch failed» mentre, nello stesso momento,
 * tre chiamate identiche da un processo appena avviato davano 200 con risultati. Lo user-agent è
 * stato escluso per misura (quello del server dà 200, uno da browser dà 202 anti-bot). La differenza
 * era che il server gira da ore.
 *
 * Ricerca 10/09/2026 — nodejs/undici issue #5450 e #3141: undici riusa un socket del pool nello
 * stesso istante in cui il server lo chiude, e la richiesta muore come `TypeError: fetch failed`;
 * per una GET un solo ritentativo su connessione nuova è sicuro, perché la richiesta non è mai
 * arrivata all'applicazione.
 */
test('ricerca: un fetch fallito una volta viene ritentato, e la seconda riesce', async () => {
  let chiamate = 0;
  const fetchFn = async () => {
    chiamate += 1;
    if (chiamate === 1) throw new TypeError('fetch failed');
    /* ⛔ `ok: true` come gli altri finti di questo file: senza, il finto non imita il vero e il
       test misura il finto — è già successo tre volte in questo repo. */
    return { ok: true, status: 200, text: async () => '<a class="result__a" href="https://esempio.it/x">Titolo</a>' };
  };
  const esiti = await cercaDuckDuckGo('prova', 8, { fetchFn });
  assert.equal(chiamate, 2, 'una volta sola in più, non di più');
  assert.ok(Array.isArray(esiti));
});

/* ⛔ Due fallimenti sono un guasto vero: si dichiara, e si dice che si era già ritentato. */
test('ricerca: se fallisce due volte si dichiara, dicendo che aveva già ritentato', async () => {
  let chiamate = 0;
  const fetchFn = async () => { chiamate += 1; throw new TypeError('fetch failed'); };
  await assert.rejects(
    () => cercaDuckDuckGo('prova', 8, { fetchFn }),
    (e) => e.code === 'SEARCH_UNREACHABLE' && /già ritentato/.test(e.message),
  );
  assert.equal(chiamate, 2, 'due tentativi in tutto, mai tre');
});

/*
 * ⛔ AL CONTRARIO, ed è il caso che conta di più: su un abort NON si ritenta. Se il tempo è scaduto
 *   o la persona ha fermato il giro, insistere è esattamente ciò che non deve succedere.
 */
test('ricerca, AL CONTRARIO: su un abort non si ritenta affatto', async () => {
  let chiamate = 0;
  const fetchFn = async () => {
    chiamate += 1;
    throw Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });
  };
  await assert.rejects(
    () => cercaDuckDuckGo('prova', 8, { fetchFn }),
    (e) => e.code === 'SEARCH_UNREACHABLE' && /tempo scaduto/.test(e.message) && !/ritentato/.test(e.message),
  );
  assert.equal(chiamate, 1, '⛔ un solo tentativo: chi ha fermato il giro non va contraddetto');
});
