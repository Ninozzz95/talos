import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = (file) => readFile(join(root, file), 'utf8');

/*
 * ⭐⭐⭐ 02/9 — Fase 5, punto 4: la UI "prima di load". Il backend
 * (`/fit`, `/qualify`) rispondeva già; nessuno glielo chiedeva.
 *
 * ⭐ Ricerca 02/9 (aimultiple.com/self-hosted-llm, tech-insider.org/
 * lm-studio-vs-ollama-2026): la scala standard è Fits ≤90% · Tight
 * nell'ultimo 10% · Won't fit sopra, e c'è un buco dichiarato nei due
 * concorrenti — «neither currently implements a prominent "will not fit"
 * warning UI before model loading»: LM Studio può crashare senza avviso,
 * Ollama scivola in silenzio su CPU (fino a 30× più lento).
 */

test('MODEL-FIT-UI-01 — la lista Installati chiede /fit e mostra il verdetto', async () => {
  const app = await source('public/app.js');
  assert.match(app, /Verifica compatibilità/);
  assert.match(app, /\/api\/v1\/local-models\/\$\{encodeURIComponent\(modelId\)\}\/fit/);
  assert.match(app, /class="model-lab-fit"|'model-lab-fit'/);
});

test('MODEL-FIT-UI-02 — /fit NON parte da solo a ogni render: è un gesto esplicito', async () => {
  /*
   * ⛔ `/fit` legge l'header GGUF dal disco e misura la macchina. Farlo per
   * ogni riga a ogni ridisegno sarebbe lavoro vero speso senza che nessuno
   * l'abbia chiesto — e su una lista lunga, a ogni carattere digitato nel
   * campo di ricerca.
   */
  const app = await source('public/app.js');
  const inizio = app.indexOf('function renderizzaModelliLocaliModelLab');
  const fine = app.indexOf('\n  function ', inizio + 1);
  const corpo = app.slice(inizio, fine);
  assert.ok(inizio >= 0 && fine > inizio);
  /*
   * ⛔ La prima stesura di questo test vietava la stringa
   * `verificaCompatibilitaModello(model.id);` — ma quella forma compare
   * LEGITTIMAMENTE dentro il gestore del clic, quindi il test bocciava il
   * codice giusto. La domanda vera non è «compare?», è «da dove viene
   * chiamata?»: ogni chiamata deve stare su una riga che è un
   * `addEventListener('click'`, mai nel corpo del render.
   */
  const righeConChiamata = corpo.split('\n').filter((riga) => riga.includes('verificaCompatibilitaModello('));
  assert.ok(righeConChiamata.length > 0, 'la verifica deve essere raggiungibile dalla lista');
  for (const riga of righeConChiamata) {
    assert.match(riga, /addEventListener\('click'/, `chiamata fuori da un gestore di clic: ${riga.trim()}`);
  }
});

test('MODEL-FIT-UI-03 — "al limite" è DERIVATO da byte veri, con la soglia dichiarata', async () => {
  const app = await source('public/app.js');
  assert.match(app, /const SOGLIA_TIGHT = 0\.9;/);
  assert.match(app, /richiesti > disponibili \* SOGLIA_TIGHT/);
});

test('MODEL-FIT-UI-04 — AL CONTRARIO: con availableBytes assente non si inventa una percentuale', async () => {
  /*
   * ⛔ Il server restituisce `availableBytes: null` quando non ha potuto
   * misurare. Calcolare una percentuale su null darebbe NaN o, peggio, un
   * falso "al limite": la guardia richiede che ENTRAMBI i numeri siano
   * finiti prima di confrontarli. Verificato anche dal vivo il 02/9: un
   * caso con 7,9 GB richiesti e `availableBytes: null` resta `compatible`.
   */
  const app = await source('public/app.js');
  assert.match(app, /Number\.isFinite\(richiesti\) && Number\.isFinite\(disponibili\) && disponibili > 0/);
});

test('MODEL-FIT-UI-05 — il motivo è in italiano piano, mai il codice grezzo del server', async () => {
  const app = await source('public/app.js');
  for (const motivo of ['fits', 'storage', 'memory', 'context', 'capabilities', 'template', 'measurement']) {
    assert.match(app, new RegExp(`MOTIVI_FIT[\\s\\S]*${motivo}:`), `manca il motivo ${motivo}`);
  }
  for (const stato of ['compatible', 'tight', 'chat-only', 'blocked', 'unknown']) {
    assert.match(app, new RegExp(`VERDETTI_FIT[\\s\\S]*['"]?${stato}['"]?:`), `manca lo stato ${stato}`);
  }
});

test('MODEL-FIT-UI-06 — un errore di verifica NON diventa "non compatibile"', async () => {
  /*
   * ⛔ Non sapere se un modello gira è diverso dal sapere che non gira. Un
   * errore di rete o un MODEL_NOT_FOUND devono dire «verifica non
   * riuscita» col messaggio vero, mai un verdetto negativo inventato.
   */
  const app = await source('public/app.js');
  assert.match(app, /Verifica non riuscita — \$\{voce\.errore\}/);
});

test('MODEL-FIT-UI-07 — il verdetto non è distinguibile SOLO dal colore', async () => {
  /*
   * ⛔ Un "non compatibile" leggibile solo dal rosso è invisibile a chi non
   * distingue i colori, proprio quando l'informazione conta di più (si sta
   * per caricare un modello che può bloccare la macchina). Ogni stato ha
   * un glifo suo, oltre alla parola per esteso nel testo.
   */
  const css = await source('public/styles.css');
  for (const [stato, glifo] of [['ok', '✓'], ['warn', '!'], ['bad', '✕'], ['unknown', '?']]) {
    assert.match(css, new RegExp(`\\.model-lab-fit\\[data-fit-state="${stato}"\\]::before \\{ content: '\\${glifo}'|\\.model-lab-fit\\[data-fit-state="${stato}"\\]::before \\{ content: '${glifo}'`), `manca il glifo per ${stato}`);
  }
});

test('MODEL-FIT-UI-08 — se il profilo agente non passa si chiede ANCHE la chat', async () => {
  /*
   * ⭐⭐⭐ 02/9 — la verifica interrogava SOLO il profilo agente (65.536
   * token) e bollava «non compatibile» modelli che per chat vanno
   * benissimo. Misurato dal vivo sul Qwen3 0.6B: agente → `chat-only`
   * (contesto 40.960 contro 65.536 richiesti), chat → `compatible`.
   * ⭐ Ricerca: Ollama sceglie il contesto in base alla memoria (4K sotto
   * 24 GiB, 32K fra 24 e 48, 256K sopra) — il pattern affermato non è «ci
   * sta / non ci sta», è cosa può fare su QUESTA macchina.
   */
  const app = await source('public/app.js');
  assert.match(app, /\?profile=\$\{profilo\}/);
  assert.match(app, /if \(esito\.state !== 'compatible'\)/);
  assert.match(app, /Va bene per la chat, non come agente/);
});

test('MODEL-FIT-UI-09 — AL CONTRARIO: il ripiego si mostra solo se la chat passa DAVVERO', async () => {
  // ⛔ Un ripiego che a sua volta non passa sarebbe rumore su una riga già
  // negativa. E se la seconda domanda fallisce, resta il verdetto
  // principale: mai un errore in più a schermo per un extra.
  const app = await source('public/app.js');
  assert.match(app, /if \(chat\.state === 'compatible'\) ripiegoChat = chat;/);
  assert.match(app, /catch \{ \/\* ⛔ il ripiego è un extra/);
});

test('MODEL-FIT-UI-10 — quando manca memoria o spazio si dice QUANTO ne manca', async () => {
  /*
   * ⭐ Misurato: il 27B in chat chiede 16,18 GB contro 15,23 liberi —
   * bloccato per meno di 1 GB. «Non compatibile» e basta nasconderebbe che
   * basta liberarne un po', e il pannello memoria accanto fa proprio
   * quello. ⛔ Solo con entrambi i numeri veri.
   */
  const app = await source('public/app.js');
  assert.match(app, /ne mancano \$\{formattaByteModelLab\(richiesti - disponibili\)\}/);
  assert.match(app, /if \(!Number\.isFinite\(richiesti\) \|\| !Number\.isFinite\(disponibili\) \|\| richiesti <= disponibili\) return '';/);
});
