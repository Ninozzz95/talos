/*
 * 12/11/2026 (giro piccolo del censimento delle 95 prove, giudice v1624-v1625) — una prova che non apre il browser per colpa
 * dell'ambiente deve FALLIRE dicendo il perché, MAI essere saltata (una saltata sparisce dal verde). Oggi, lanciate a mano senza il
 * runner e col profilo finto nudo, le 95 prove cadono mute: «browser has been closed» o «Executable doesn't exist», senza la causa.
 * L'aiuto comune `tests/aiuto/lancia-browser-delle-prove.mjs` controlla l'ambiente e traduce gli errori in una causa con il rimando
 * al lanciatore (`npm run test:unit`, che prepara l'ambiente: `scripts/argomenti-prove-node.mjs`).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lanciaBrowserDelleProve, FILE_CHE_APRONO_UN_BROWSER } from '../aiuto/lancia-browser-delle-prove.mjs';

test('BROWSER-AIUTO-01 — senza ambiente la prova FALLISCE con la causa e il rimando al lanciatore; con l ambiente lancia; mai saltata', async () => {
  const FINTO = join('C:', 'T', 'finto-prova');
  const lanci = [];
  const lanciaFinto = (esito) => async (opzioni) => { lanci.push(opzioni); if (esito instanceof Error) throw esito; return esito; };
  const nudo = { USERPROFILE: join(FINTO, 'home') };
  const base = { piattaforma: 'win32', esiste: () => false };

  // Chrome installato con un USERPROFILE senza AppData\Local: fallisce PRIMA di lanciare, con la causa.
  await assert.rejects(
    lanciaBrowserDelleProve({ channel: 'chrome', headless: true }, { ...base, env: nudo, lancia: lanciaFinto({}) }),
    (e) => /AppData\\Local/u.test(e.message) && /npm run test:unit/u.test(e.message) && /DevTools/u.test(e.message),
  );
  assert.equal(lanci.length, 0, 'non lancia un Chrome che rifiuterà il canale');

  // I binari mancanti: l'errore muto di Playwright diventa la causa, con l'originale dentro.
  await assert.rejects(
    lanciaBrowserDelleProve({ headless: true }, { ...base, env: nudo, lancia: lanciaFinto(new Error("browserType.launch: Executable doesn't exist at C:\\x\\shell.exe")) }),
    (e) => /PLAYWRIGHT_BROWSERS_PATH/u.test(e.message) && /npm run test:unit/u.test(e.message) && /Executable doesn't exist at C:\\x\\shell\.exe/u.test(e.message),
  );
  // Il rifiuto di Chrome arrivato lo stesso (p. es. altra causa della cartella di serie): anche lui con la causa.
  await assert.rejects(
    lanciaBrowserDelleProve({ channel: 'chrome' }, { ...base, esiste: () => true, env: nudo,
      lancia: lanciaFinto(new Error('browserType.launch: Target page, context or browser has been closed\n[err] DevTools remote debugging requires a non-default data directory.')) }),
    (e) => /AppData\\Local/u.test(e.message) && /npm run test:unit/u.test(e.message),
  );
  // AL CONTRARIO: un errore che non è dell'ambiente passa com'è.
  const altro = new Error('qualcos altro');
  await assert.rejects(lanciaBrowserDelleProve({}, { ...base, env: nudo, lancia: lanciaFinto(altro) }), (e) => e === altro);
  // AL CONTRARIO: con l'ambiente giusto lancia con le stesse opzioni e rende il browser; fuori da Windows non guarda AppData.
  const browser = { finto: true };
  lanci.length = 0;
  assert.equal(await lanciaBrowserDelleProve({ channel: 'chrome', headless: true }, { ...base, esiste: () => true, env: nudo, lancia: lanciaFinto(browser) }), browser);
  assert.equal(await lanciaBrowserDelleProve({ channel: 'chrome' }, { ...base, piattaforma: 'linux', env: nudo, lancia: lanciaFinto(browser) }), browser);
  assert.deepEqual(lanci, [{ channel: 'chrome', headless: true }, { channel: 'chrome' }]);

  // I 15 file che aprono un browser passano tutti dall'aiuto, e nessuno lo lancia da sé né salta.
  assert.equal(FILE_CHE_APRONO_UN_BROWSER.length, 15);
  for (const nome of FILE_CHE_APRONO_UN_BROWSER) {
    const sorgente = readFileSync(new URL(`./${nome}.test.mjs`, import.meta.url), 'utf8');
    assert.match(sorgente, /await lanciaBrowserDelleProve\(/u, `${nome} usa l aiuto`);
    assert.doesNotMatch(sorgente, /chromium\.launch\(/u, `${nome} non lancia da sé`);
  }
  const aiuto = readFileSync(new URL('../aiuto/lancia-browser-delle-prove.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(aiuto, /\.skip\b|\btodo\b/u, 'l aiuto non salta mai');
});
