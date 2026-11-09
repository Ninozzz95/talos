/*
 * ⛔ N1 della seconda revisione del gettone (S1, 03/11/2026, `REVISIONE-GETTONE-2-2026-11-03.md`): due strade portavano una cornice DIRETTA su un server di
 *   loopback, cioè sullo stesso sito della finestra, col cookie Strict che parte:
 *   · la lettura di `naviga` nasceva con l'indirizzo scelto dal modello e la cornice lo caricava così com'era;
 *   · `proxata` si calcolava solo sull'indirizzo di PARTENZA: una pagina pubblica che rimanda a `127.0.0.1` finiva in cornice diretta.
 *   Ogni pagina di loopback passa dal proxy (l'altro nome, senza cookie), qualunque sia la scheda e qualunque sia stato il giro dei rimandi.
 *   La CSP del documento (GR-16, `harness-ui/tests/gettone-sempre.test.mjs`) è la difesa di fondo: questa è la strada giusta per arrivarci.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PROXY_BROWSER, sorgenteDellaCornice } from '../../src/components/browser.js';

const proxy = (u) => `${PROXY_BROWSER}${encodeURIComponent(u)}`;

test('CORNICE-N1-01 una lettura di loopback passa dal proxy, anche se nessuno l ha detta «proxata»', () => {
  for (const url of ['http://127.0.0.1:9999/', 'http://localhost:5173/about', 'http://[::1]:8080/', 'http://app.localhost:3000/', 'HTTP://LOCALHOST:5173/']) {
    assert.equal(sorgenteDellaCornice({ tipo: 'lettura', url }), proxy(url), url);
    assert.equal(sorgenteDellaCornice({ tipo: 'viva', url, proxata: false }), proxy(url), `viva ${url}`);
  }
  /* AL CONTRARIO: un sito pubblico resta in cornice diretta; una scheda proxata resta proxata */
  assert.equal(sorgenteDellaCornice({ tipo: 'lettura', url: 'https://example.org/' }), 'https://example.org/');
  assert.equal(sorgenteDellaCornice({ tipo: 'viva', url: 'https://example.org/x', proxata: true }), proxy('https://example.org/x'));
  assert.equal(sorgenteDellaCornice({ tipo: 'lettura', url: 'non un indirizzo' }), 'non un indirizzo');
});

test('CORNICE-N1-02 la scheda viva ricalcola «proxata» sull indirizzo FINALE dato dal server, e il pannello costruisce la cornice da lì', () => {
  const app = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
  assert.match(app, /voce\.url = esito\?\.url \|\| url;\s*\n\s*voce\.proxata = voce\.proxata \|\| localeAnnotabile\(voce\.url\);/u);
  const browser = readFileSync(new URL('../../src/components/browser.js', import.meta.url), 'utf8');
  assert.match(browser, /frame\.src = sorgenteDellaCornice\(s\);/u);
  assert.doesNotMatch(browser, /frame\.src = s\.proxata \?/u);
});

/* N15 della terza revisione del gettone (03/11/2026): la cornice di una pagina servita dal proxy non ha `allow-popups`; quella di una pagina pubblica sì */
test('N15 allow-popups solo sulle cornici in diretta, mai su quelle del proxy', () => {
  const src = readFileSync(new URL('../../src/components/browser.js', import.meta.url), 'utf8');
  assert.match(src, /frame\.setAttribute\('sandbox', sorgenteDellaCornice\(s\)\.startsWith\(PROXY_BROWSER\) \? 'allow-scripts allow-same-origin allow-forms' : 'allow-scripts allow-same-origin allow-forms allow-popups'\);/u);
  assert.ok(sorgenteDellaCornice({ url: 'http://127.0.0.1:5173/' }).startsWith(PROXY_BROWSER), 'il loopback passa dal proxy: niente finestre nuove');
  assert.equal(sorgenteDellaCornice({ url: 'https://example.com/' }), 'https://example.com/', 'una pagina pubblica resta in diretta');
});
