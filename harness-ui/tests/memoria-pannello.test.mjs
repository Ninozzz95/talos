import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = (file) => readFile(join(root, file), 'utf8');

/*
 * ⭐⭐⭐ 02/9 — pannello memoria (owner: «pulsanti che liberano la RAM dai
 * processi non critici»). La ricerca ha spostato il progetto rispetto alla
 * richiesta letterale, e questi test tengono fermo lo spostamento.
 */

test('MEMORIA-PANNELLO-01 — la memoria si MISURA prima di offrire di liberarla', async () => {
  // ⭐ Ricerca: «do not start by killing random processes. Start by
  // checking what is using memory».
  const app = await source('public/app.js');
  assert.match(app, /function aggiornaPannelloMemoria/);
  assert.match(app, /capacita\?\.memory\?\.totalBytes/);
  assert.match(app, /capacita\?\.memory\?\.freeBytes/);
});

test('MEMORIA-PANNELLO-02 — ⛔ NON si uccidono processi: nessuna chiamata di terminazione', async () => {
  /*
   * ⛔ Il cuore di questa fase. Le fonti sono esplicite: «do not
   * force-close processes with names you do not recognize», «if you cannot
   * explain what a process does, do not kill it», e terminare un processo
   * di sistema porta a un BSOD. Il progetto ha già pagato la lezione con la
   * sorveglianza che stava per uccidere la sessione VIVA dell'owner.
   * ⇒ Nessun kill, taskkill, /proc, o enumerazione di processi da chiudere.
   */
  const app = await source('public/app.js');
  const html = await source('public/index.html');
  for (const vietato of [/taskkill/i, /process\.kill/, /\bkillProcess\b/, /terminaProcesso/, /Get-Process/i]) {
    assert.doesNotMatch(app, vietato, `il frontend non deve terminare processi: ${vietato}`);
  }
  // ⭐ E la scelta è DICHIARATA a schermo, non solo nel codice.
  assert.match(html, /Non chiude processi di sistema o altre app/);
});

test('MEMORIA-PANNELLO-03 — libera solo ciò di cui siamo padroni: il modello caricato', async () => {
  // ⭐ È anche ciò che fanno i runtime affermati: Ollama `ollama stop` /
  // `keep_alive: 0`, LM Studio `lms unload --all` — scaricano il modello.
  const app = await source('public/app.js');
  assert.match(app, /apiPost\('\/api\/v1\/runtime\/unload'/);
  const httpApp = await source('src/http-app.mjs');
  assert.match(httpApp, /\/api\/v1\/runtime\/unload/, 'la rotta deve esistere lato server');
});

test('MEMORIA-PANNELLO-04 — AL CONTRARIO: senza un modello caricato il pulsante è disabilitato', async () => {
  /*
   * ⛔ Un pulsante «libera» che non ha niente da liberare mentirebbe: la
   * persona lo preme, non succede nulla, e non capisce perché. Verificato
   * dal vivo il 02/9 — con nessun modello caricato il pulsante è disabled e
   * la riga dice «TALOS non tiene nessun modello in memoria adesso».
   */
  const app = await source('public/app.js');
  assert.match(app, /if \(bottone\) bottone\.disabled = !modelloCaricato;/);
  assert.match(app, /non tiene nessun modello in memoria/);
});

test('MEMORIA-PANNELLO-05 — l’esito si dichiara coi BYTE VERI liberati, non con un «fatto»', async () => {
  /*
   * ⛔ Si rimisura dopo lo scarico e si dice quanto è tornato disponibile.
   * Se la misura di sistema non si è ancora aggiornata lo si dice, invece
   * di annunciare un guadagno che non si è visto.
   */
  const app = await source('public/app.js');
  assert.match(app, /const guadagno = /);
  assert.match(app, /può aggiornarsi con qualche secondo di ritardo/);
});

test('MEMORIA-PANNELLO-06 — la barra non è l’unico segnale', async () => {
  // ⛔ Percentuale e byte veri sono scritti per esteso: una barra che
  // diventa rossa non dice quanto manca.
  const app = await source('public/app.js');
  assert.match(app, /in uso su .* liberi/);
  const css = await source('public/styles.css');
  assert.match(css, /\.memoria-barra-usata\[data-memoria-livello="critico"\]/);
});
