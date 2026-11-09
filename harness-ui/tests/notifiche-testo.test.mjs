/*
 * Il testo pulito delle notifiche (contratto «notifiche», 31/10/2026): markdown-it 14.3.0 pigro, tabelle e codice saltati, ripiego
 * semplice se la libreria manca. La libreria vera si cerca dove c'è (il pacchetto del server, poi quello del telefono nel repo, poi
 * `TALOS_MARKDOWN_IT_DIR`); se non c'è da nessuna parte, le prove che la vogliono si saltano DICENDOLO.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { creaPulitoreMarkdown } from '../src/notifiche-testo.mjs';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
function trovaMarkdownIt() {
  const candidati = [join(REPO, 'harness-ui', 'package.json'), join(REPO, 'mobile', 'package.json'),
    ...(process.env.TALOS_MARKDOWN_IT_DIR ? [join(process.env.TALOS_MARKDOWN_IT_DIR, 'package.json')] : [])];
  for (const da of candidati) {
    try {
      if (!existsSync(da)) continue;
      const percorso = createRequire(da).resolve('markdown-it');
      const versione = createRequire(da)('markdown-it/package.json').version;
      return { carica: () => import(pathToFileURL(percorso).href), versione };
    } catch { /* il prossimo */ }
  }
  return null;
}
const vera = trovaMarkdownIt();
const MOTIVO = vera ? false : 'markdown-it is not installed anywhere reachable (server package, mobile package, TALOS_MARKDOWN_IT_DIR)';

const TESTO = [
  '## Rassegna del mattino',
  '',
  'Ho trovato **tre** notizie e una [fonte](https://esempio.it) con `npm audit`.',
  '',
  '| colonna | valore |',
  '|---|---|',
  '| a | 1 |',
  '',
  '```js',
  'const segreto = 1;',
  '```',
  '',
  '- primo punto',
  '- secondo punto <b>grassetto</b>',
].join('\n');

test('NOTIF-TESTO-01 with the real markdown-it 14.3.0: headings and lists become words, tables and code blocks are skipped', { skip: MOTIVO }, async () => {
  assert.equal(vera.versione, '14.3.0', 'the same version as the phone, exact');
  const pulisci = creaPulitoreMarkdown({ carica: vera.carica, avvisa: () => assert.fail('no warning expected') });
  assert.equal(await pulisci(TESTO), 'Rassegna del mattino Ho trovato tre notizie e una fonte con npm audit. primo punto secondo punto grassetto');
});

test('NOTIF-TESTO-02 lazy: a text without Markdown signs never loads the library; the library loads once', async () => {
  let caricamenti = 0;
  const pulisci = creaPulitoreMarkdown({ carica: async () => { caricamenti += 1; throw new Error('not here'); }, avvisa: () => {} });
  assert.equal(await pulisci('Il giro è finito   senza\nnovità'), 'Il giro è finito senza novità');
  assert.equal(caricamenti, 0);
  await pulisci('**uno**'); await pulisci('**due**');
  assert.equal(caricamenti, 1);
});

test('NOTIF-TESTO-03 AL CONTRARIO: without the library the register does not stop, the fallback still drops code and tables, and says so once', async () => {
  const avvisi = [];
  const pulisci = creaPulitoreMarkdown({ carica: async () => { throw new Error('Cannot find package'); }, avvisa: (m) => avvisi.push(m) });
  const pulito = await pulisci(TESTO);
  assert.ok(!pulito.includes('segreto'), 'a code block never reaches the notification');
  assert.ok(!pulito.includes('colonna'), 'a table never reaches the notification');
  assert.ok(pulito.includes('Ho trovato tre notizie e una fonte con npm audit.'));
  await pulisci('# altro');
  assert.equal(avvisi.length, 1);
  assert.equal(await pulisci(''), '');
});
