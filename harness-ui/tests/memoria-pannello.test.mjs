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
  /*
   * ⛔ La prima stesura di questo test fissava il NOME di una variabile
   * (`modelloCaricato`) invece del fatto: e quel nome apparteneva a due
   * campi INVENTATI (`modelloCaricato`/`loadedModel`) che nella risposta
   * del server non esistono — il pulsante sarebbe restato disabilitato per
   * sempre. Il test proteggeva l'implementazione rotta.
   * ⇒ Ora si lega al fatto OSSERVATO: `runtimeState === 'ready'`, l'unico
   * segnale che il server dichiara davvero.
   */
  const app = await source('public/app.js');
  assert.match(app, /runtimeLocale\?\.runtimeState === 'ready'/, 'lo stato deve venire dal campo vero del server');
  assert.match(app, /bottone\.disabled = !runtimeCarico/);
  assert.match(app, /non tiene nessun modello in memoria/);
  /*
   * ⛔ Qui avevo aggiunto `doesNotMatch(/modelloCaricato|loadedModel/)` per
   * impedire il ritorno dei nomi inventati — e falliva sul COMMENTO che
   * quei nomi li cita per spiegare il difetto. Una regola che vieta una
   * parola nell'intero file colpisce anche la documentazione del difetto:
   * la forma giusta è vietarne l'USO, cioè l'accesso come proprietà del
   * runtime, non la menzione.
   */
  assert.doesNotMatch(app, /runtimeLocale\?\.(modelloCaricato|loadedModel)/, 'nessun campo inventato letto dal runtime');
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

test('MEMORIA-PANNELLO-07 — il pannello si rinfresca quando cambia lo stato dei runtime, non solo all’avvio', async () => {
  /*
   * ⛔⛔⛔ 02/9 — terzo difetto dello stesso pannello, trovato premendo il
   * pulsante per davvero con un modello CARICATO: il pannello leggeva
   * `state.modelLab.runtimes` ma veniva ridisegnato solo da
   * `caricaCapacitaMacchina()`, che gira una volta all'avvio. Caricare un
   * modello dopo non cambiava nulla a schermo — riga ferma su «non tiene
   * nessun modello», pulsante disabilitato, funzione morta.
   */
  const app = await source('public/app.js');
  const inizio = app.indexOf('function renderizzaRuntimeModelLab');
  const fine = app.indexOf('\n  async function', inizio);
  assert.ok(inizio >= 0 && fine > inizio);
  assert.match(app.slice(inizio, fine), /aggiornaPannelloMemoria\(\);/, 'il render dei runtime deve rinfrescare il pannello memoria');
});

test('MEMORIA-PANNELLO-08 — il corpo della richiesta di scarico è quello che la rotta accetta', async () => {
  /*
   * ⛔⛔⛔ 02/9 — il pulsante mandava `{}` e la rotta risponde
   * QUERY_INVALID senza `runtimeId`: non avrebbe MAI funzionato. Invisibile
   * nella prova dal vivo perché era disabilitato per un altro difetto.
   * ⛔ `modelId` NON si manda: il server non espone quale modello sia
   * caricato e l'implementazione lo ignora (rotta corretta di conseguenza).
   */
  const app = await source('public/app.js');
  assert.match(app, /apiPost\('\/api\/v1\/runtime\/unload', \{ runtimeId: 'llama\.cpp' \}\)/);
});
