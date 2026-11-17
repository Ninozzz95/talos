/*
 * 12/11/2026 (censimento delle 95 prove di unità che aprono un browser, giudice v1614-v1615) — col profilo finto le 95 prove non
 * aprivano nessun browser, e quindi non provavano niente. Due cause misurate, tutte e due dell'ambiente delle prove:
 *   - 31 prove (headless shell di Playwright): Playwright cerca i binari sotto `%LOCALAPPDATA%\ms-playwright`, cioè sotto il profilo
 *     finto, dove non ci sono → «Executable doesn't exist».
 *   - 64 prove (`channel: 'chrome'`, il Chrome installato): con un USERPROFILE finto che non ha `AppData\Local`, Chrome non risolve la
 *     sua cartella dati di serie e rifiuta il canale dei DevTools («DevTools remote debugging requires a non-default data directory»)
 *     → «browser has been closed». Con la cartella presente le stesse 64 sono verdi (misurato nei due versi).
 * ⇒ Il runner (`scripts/run-node-tests.mjs`) prepara di serie l'ambiente: i binari di Playwright della cartella vera (SOLO la cartella
 *   dei binari `ms-playwright`, mai il profilo), e la `AppData\Local` dentro un USERPROFILE che non ce l'ha.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ambienteDelleProve, casaDelSistema } from '../../scripts/argomenti-prove-node.mjs';

test('RUNNER-04 — col profilo finto il runner dà ai browser delle prove i binari veri e la AppData\\Local; col profilo vero non cambia niente', () => {
  const VERA = join('C:', 'Users', 'utente');
  const FINTO = join('C:', 'T', 'finto-prova');
  const binariVeri = join(VERA, 'AppData', 'Local', 'ms-playwright');
  const finto = { LOCALAPPDATA: join(FINTO, 'AppData', 'Local'), USERPROFILE: join(FINTO, 'home'), ALTRO: 'x' };
  const conIBinariVeri = (p) => p === binariVeri;
  const opzioni = { cartellaUtenteVera: VERA, esiste: conIBinariVeri, piattaforma: 'win32' };

  const r = ambienteDelleProve(finto, opzioni);
  assert.equal(r.ambiente.PLAYWRIGHT_BROWSERS_PATH, binariVeri, 'i binari di Playwright della cartella vera, non quelli (assenti) sotto il profilo finto');
  assert.ok(r.ambiente.PLAYWRIGHT_BROWSERS_PATH.endsWith('ms-playwright'), 'solo la cartella dei binari, mai il profilo vero');
  assert.deepEqual(r.cartelleDaCreare, [join(FINTO, 'home', 'AppData', 'Local')], 'la AppData\\Local che manca al USERPROFILE finto');
  assert.equal(r.ambiente.ALTRO, 'x', 'il resto dell ambiente passa uguale');
  assert.equal(finto.PLAYWRIGHT_BROWSERS_PATH, undefined, 'l ambiente di chi chiama non si tocca');

  // AL CONTRARIO: chi passa il suo percorso lo tiene; i binari già sotto il LOCALAPPDATA dato non si spostano; senza binari veri niente.
  assert.equal(ambienteDelleProve({ ...finto, PLAYWRIGHT_BROWSERS_PATH: 'D:/miei' }, opzioni).ambiente.PLAYWRIGHT_BROWSERS_PATH, 'D:/miei');
  const sottoIlDato = join(FINTO, 'AppData', 'Local', 'ms-playwright');
  assert.equal(ambienteDelleProve(finto, { ...opzioni, esiste: (p) => p === sottoIlDato || p === binariVeri }).ambiente.PLAYWRIGHT_BROWSERS_PATH, undefined);
  assert.equal(ambienteDelleProve(finto, { ...opzioni, esiste: () => false }).ambiente.PLAYWRIGHT_BROWSERS_PATH, undefined);

  // AL CONTRARIO: col profilo vero (tutto c'è) l'ambiente resta com'è e non si crea niente.
  const vero = { LOCALAPPDATA: join(VERA, 'AppData', 'Local'), USERPROFILE: VERA };
  const tuttoCe = (p) => p === binariVeri || p === join(VERA, 'AppData', 'Local');
  const rv = ambienteDelleProve(vero, { ...opzioni, esiste: tuttoCe });
  assert.deepEqual(rv.ambiente, vero);
  assert.deepEqual(rv.cartelleDaCreare, []);

  // AL CONTRARIO: dove il sistema non sa dire la cartella dell'utente (`os.userInfo()` lancia, p. es. un contenitore con un uid
  // senza voce) il runner non cade: niente cartella vera, niente percorso dei binari.
  assert.equal(casaDelSistema(() => { throw new Error('uv_os_get_passwd ENOENT'); }), '');
  assert.match(readFileSync(new URL('../../scripts/argomenti-prove-node.mjs', import.meta.url), 'utf8'), /cartellaUtenteVera = casaDelSistema\(\),/u,
    'di serie la cartella vera passa da casaDelSistema, che non lancia');
  const fuoriDalFinto = (p) => !p.startsWith(FINTO);
  assert.equal(ambienteDelleProve(finto, { ...opzioni, cartellaUtenteVera: '', esiste: fuoriDalFinto }).ambiente.PLAYWRIGHT_BROWSERS_PATH, undefined);

  // Il runner vero la usa (una funzione giusta che nessuno chiama non cura niente).
  const sorgente = readFileSync(new URL('../../scripts/run-node-tests.mjs', import.meta.url), 'utf8');
  assert.match(sorgente, /ambienteDelleProve\(process\.env\)/u);
  assert.match(sorgente, /for \(const cartella of cartelleDaCreare\) mkdirSync\(cartella, \{ recursive: true \}\)/u);
  assert.match(sorgente, /env: ambiente/u);
});
