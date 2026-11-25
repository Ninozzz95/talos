/*
 * 11/11/2026 — le due scritte della decisione dell'owner delle 14:10 (`giudice/DECISIONE-OWNER-2026-11-11-1410-COMPUTER-USE-STRUMENTI-E-TALOS-P.md`,
 * punti 2 e 8; registro delle richieste, righe 75 e 80). Nate ROSSE sulla testa `ea437f67b`.
 * 1. Il registro delle versioni del PC non promette più che il computer use «guarda più da vicino i siti e le app sensibili».
 * 2. La descrizione di `offset` dell'attrezzo `cerca` dice «(default 0)», non «(default0)».
 *    L'aiuto generato (`aiuto/index.json`, da `scripts/costruisci-aiuto.mjs` sul sito) NON si tocca qui: si rigenera dal sito.
 * 3. 22/11/2026 (registro, riga 80; giudice v2525): la riga di `aiuto/index.json` si corregge a mano nella 0.2.5, perché i dati del sito
 *    (`src/data/reference/desktop.json:15555`) portano ancora «default0»; si rigenerano con le pagine d'aiuto della 0.2.5 (fase G7).
 *    Nata ROSSA sulla candidata `1675a84bc`.
 * Fonti: Claude Code `CHANGELOG.md:1423` (la voce dice ciò che fa, offset compreso); Hermes `tools/browser_cdp_tool.py:482`
 *   («Timeout in seconds (default 30, max 300).»: il valore di serie con lo spazio).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const leggi = (relativo) => readFileSync(new URL(`../${relativo}`, import.meta.url), 'utf8');

test('SC1410-01 (punto 2 delle 14:10): il registro delle versioni del PC non dice più «watches more closely on sensitive sites and apps»', () => {
  const testo = leggi('desktop/CHANGELOG.md');
  assert.equal(/watches more closely/iu.test(testo), false);
  assert.equal(/sensitive sites and apps/iu.test(testo), false);
  assert.equal(/siti e (?:le )?app sensibili/iu.test(testo), false, 'nemmeno una gemella italiana');
  // al contrario: la frase intorno resta
  assert.match(testo, /that change things and remembers the places you allow\. See Known limits\./u);
});

test('SC1410-02 (punto 8 delle 14:10): `cerca` scrive «(default 0)» con lo spazio; nessun «default0» nel nucleo', async () => {
  const sorgente = leggi('src/kernel/talosHarness.mjs');
  assert.equal(sorgente.includes('default0'), false);
  assert.match(sorgente, /description: 'Skip this many matching files \(default 0\); use nextOffset with unchanged filters\./u);
});

test('SC1410-03 (riga 80): l’aiuto che viaggia col PC (`aiuto/index.json`) non contiene «default0» e dice «(default 0)» per `cerca`', () => {
  const testo = leggi('aiuto/index.json');
  assert.equal(testo.includes('default0'), false);
  // al contrario: la riga corretta c'è, una volta sola, e il file resta una guida valida
  assert.equal(testo.split('Skip this many matching files (default 0); use nextOffset with unchanged filters.').length - 1, 1);
  const indice = JSON.parse(testo);
  assert.equal(indice.versione, 1);
  assert.ok(indice.pagine.length > 0);
});
