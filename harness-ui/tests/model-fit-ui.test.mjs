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
  const app = await source('frontend/src/legacy/app.js');
  assert.match(app, /Verifica compatibilità/);
  assert.match(app, /\/api\/v1\/local-models\/\$\{encodeURIComponent\(modelId\)\}\/fit/);
  assert.match(app, /class="model-lab-fit"|'model-lab-fit'/);
});

test('MODEL-FIT-UI-12 — AL CONTRARIO: la frase non compare se il runtime serve PROPRIO questo modello', async () => {
  // ⛔ Tre condizioni, tutte necessarie: runtime raggiungibile, NON su questo
  // modello, e con un id vero da nominare. Senza la seconda, la riga
  // accuserebbe un modello di bloccare se stesso.
  const app = await source('frontend/src/legacy/app.js');
  assert.match(app, /runtimeDi\?\.reachable === true/);
  assert.match(app, /typeof runtimeDi\?\.servingModelId === 'string' && runtimeDi\.servingModelId !== ''/);
});

test('MODEL-FIT-UI-13 — «non come agente» solo quando lo SAPPIAMO, mai su unknown', async () => {
  /*
   * ⛔⛔ 03/9 — trovato guardando uno screenshot, non il codice: col verdetto
   * agente `unknown` (capacità non osservabili perché il runtime serve un
   * altro modello) la riga affermava «non come agente», trasformando un «non
   * l'ho potuto controllare» in un «no». `unknown` non è `blocked`: è la
   * distinzione su cui è costruito tutto questo pannello.
   */
  const app = await source('frontend/src/legacy/app.js');
  assert.match(app, /voce\.esito\?\.state === 'unknown'\s*\?\s*'Va bene per la chat; come agente non verificabile ora'/);
  assert.match(app, /:\s*'Va bene per la chat, non come agente'/);
});

/* ═══ 03/9 — i quattro fix del Laboratorio modelli + le azioni sui messaggi ═══ */

test('MODEL-LAB-HF-01 — la scheda Hugging Face carica il catalogo APRENDOSI, senza cercare', async () => {
  /*
   * ⛔ Owner: «nella tab huggingface i modelli non spuntano subito, devo
   * prima cercare qualcosa». Il server rispondeva già con query vuota
   * (misurato: 5 su 5, il primo con 12,7 milioni di download): era «il
   * codice giusto che nessuno chiama».
   */
  const app = await source('frontend/src/legacy/app.js');
  assert.match(app, /section === 'huggingface' && !state\.modelLab\.hfCatalogoIniziale/);
  assert.match(app, /state\.modelLab\.hfCatalogoIniziale = true;/);
});

test('MODEL-LAB-HF-02 — AL CONTRARIO: il catalogo non sovrascrive una ricerca già fatta', async () => {
  const app = await source('frontend/src/legacy/app.js');
  assert.match(app, /if \(state\.modelLab\.hfResults\.length === 0 && !state\.modelLab\.hfError\) void cercaHuggingFaceModelLab\(\);/);
});

test('MODEL-LAB-HF-03 — il dettaglio ha tre schede e le QUANTIZZAZIONI per prime', async () => {
  // ⛔ Come il mobile (TalosMobileLocalRepoDetail.vue), che ha risolto per primo.
  const app = await source('frontend/src/legacy/app.js');
  const schede = app.match(/\{ id: '(quantizzazioni|scheda|file)', etichetta: '[^']+'/gu) || [];
  assert.deepEqual(schede.map((s) => s.match(/id: '([a-z]+)'/u)[1]), ['quantizzazioni', 'scheda', 'file']);
  assert.match(app, /hfDetailTab: 'quantizzazioni'/);
});

test('MODEL-LAB-HF-04 — la stima dichiara SEMPRE di cosa è fatta', async () => {
  /*
   * ⛔ Copre i pesi e basta: senza il file non si legge l'header, quindi la
   * cache del contesto non è calcolabile. È una soglia inferiore, e va detto
   * — è il punto in cui una persona scarica 15 GB per scoprire dopo che non
   * parte.
   */
  const app = await source('frontend/src/legacy/app.js');
  assert.match(app, /se già i pesi non ci stanno, non ci sta/);
  assert.match(app, /fit-estimate\?bytes=/);
});

test('MODEL-LAB-HF-05 — la stima porta l\'ORA della misura, non solo il verdetto', async () => {
  // ⛔ La memoria libera cambia mentre si lavora: un badge senza data diventa
  // una bugia silenziosa dopo un minuto.
  const app = await source('frontend/src/legacy/app.js');
  assert.match(app, /misurato alle \$\{stima\.misurataAlle\.toLocaleTimeString\('it-IT'\)\}/);
  assert.match(app, /state\.modelLab\.hfStima = null;/, 'cambiando repository la stima va azzerata');
});

test('MODEL-PICKER-01 — il selettore ha le FONTI come schede, e i locali si distinguono', async () => {
  /*
   * ⛔ Misurato: `provider` in quel catalogo è l'AUTORE (51 gruppi su 424
   * modelli), non la via d'accesso — tutti passano da OpenRouter. E il
   * kernel della chat chiama SEMPRE OpenRouter, quindi un modello locale
   * selezionabile qui sarebbe un pulsante che non fa quel che promette.
   */
  const app = await source('frontend/src/legacy/app.js');
  assert.match(app, /class="model-picker-sources"|'model-picker-sources'/);
  /*
   * ⛔ 03/9, secondo passaggio: qui si pretendeva la nota «la chat parla solo
   * con OpenRouter… non ancora qui». Con l'instradamento multi-provider non è
   * più vero, e la nota è stata sostituita — vedi MODEL-PICKER-03, che
   * presidia quella nuova e vieta il ritorno di quella vecchia.
   */
  assert.match(app, /Girano su questo computer, senza rete e senza costo\./);
});

test('MODEL-PICKER-02 — i modelli locali SI SCELGONO, col prefisso di fonte', async () => {
  /*
   * ⛔⛔ QUESTA PROVA DICEVA IL CONTRARIO STAMATTINA, ed era giusta allora:
   * pretendeva che le righe locali NON fossero bottoni, perché la chat
   * parlava solo con OpenRouter e un elenco che sembra cliccabile senza
   * esserlo mente col gesto.
   *
   * ⇒ Con l'instradamento multi-provider (`model-destination.mjs`) quel
   * vincolo è caduto nel giro di un'ora: i modelli locali girano davvero, e
   * tenerli spenti sarebbe l'errore opposto. La prova non si cancella, si
   * riscrive dicendo cosa presidia ADESSO — e resta scritto che cosa
   * presidiava prima, perché il motivo di allora era buono.
   */
  const app = await source('frontend/src/legacy/app.js');
  const inizio = app.indexOf('function renderListaLocali()');
  const corpo = app.slice(inizio, app.indexOf('\n    function ', inizio + 1));
  assert.ok(inizio > 0);
  assert.match(corpo, /const valore = `local:\$\{modello\.id\}`;/u, 'il valore scelto deve portare il prefisso di fonte concordato');
  assert.match(corpo, /createElement\('button'\)/u, 'la riga locale è un bottone come le altre');
});

test('MODEL-PICKER-03 — AL CONTRARIO: la nota non promette un\'attesa che il codice non impone più', async () => {
  /*
   * ⛔⛔ QUESTA PROVA PRETENDEVA IL CONTRARIO STAMATTINA (03/9), ed era
   * giusta allora: a quell'ora un modello locale andava davvero acceso a
   * mano dal Laboratorio modelli prima di poterlo usare in chat, e tacerlo
   * sarebbe stata la bugia peggiore — scoprirlo a metà di una risposta.
   *
   * ⇒ Nel giro di poche ore quel vincolo è caduto: `runtime-owner-adapter.mjs`
   * (creaFetchMultiProvider) ora intercetta LOCAL_RUNTIME_NOT_READY e chiama
   * avviaLocale() da solo, un solo colpo, prima di ritentare — verificato dal
   * vivo attraverso il server reale (non solo un mock): un modello MAI
   * caricato, selezionato A META' di una chat già iniziata, risponde entro
   * pochi secondi senza alcun intervento manuale. La nota vecchia prometteva
   * un passo che non serve più: tenerla sarebbe esattamente la trappola che
   * il commento originale di questa prova nominava — «una spiegazione
   * corretta che invecchia convince a non riprovare» — solo che ora
   * invecchia subito, non col tempo. Non si cancella la prova, si riscrive
   * dicendo cosa presidia ADESSO, stessa disciplina di MODEL-PICKER-02 poco
   * sopra nello stesso file.
   */
  const app = await source('frontend/src/legacy/app.js');
  assert.doesNotMatch(app, /Il motore va acceso dal Laboratorio modelli prima di usarli\./u);
  assert.match(app, /Si accendono da soli alla prima richiesta\./u);
  assert.doesNotMatch(app, /La chat parla solo con OpenRouter/u);
});

test('MODEL-PICKER-04 — scegliere un modello locale a META\' CHAT lo scrive sul server, non solo sullo schermo', async () => {
  /*
   * ⛔⛔⛔ 03/9 — BUG REALE trovato dal vivo facendo esattamente la verifica
   * richiesta dall'owner («assicurati... anche a metà strada in una chat già
   * iniziata»): il ramo remoto del selettore (renderLista, sopra) chiama
   * sincronizzaImpostazioniSessione PRIMA di applicare la scelta; il ramo
   * locale (renderListaLocali) no — aggiornava solo `state.model` in
   * memoria, senza mai scrivere sul registro sessione (server.mjs, endpoint
   * /sessions/:id/settings). Misurato con Playwright sul server vivo (porta
   * 4174): click sul modello locale, la pillola del composer restava sul
   * remoto, e al Send il server eseguiva ANCORA col modello vecchio —
   * RunStarted.contesto.modello confermava il remoto, mai il locale scelto.
   * L'unica traccia era la nota "Impostazioni cambiate fuori da questa
   * scheda", onesta ma fuorviante: non era un'altra scheda, era questo
   * stesso click mai arrivato al server.
   *
   * ⇒ Riparato rendendo il ramo locale simmetrico al remoto: stesso guard
   * (aggiornaModelloPrincipale && sincronizzaSessione && state.realSession.id),
   * stessa attesa prima di applicare la scelta, stesso ripristino su errore.
   * Ri-verificato dal vivo dopo il fix: la pillola mostra il modello locale
   * scelto, e RunStarted.contesto.modello lo conferma — nessun "impostazioni
   * cambiate fuori da questa scheda" spurio.
   */
  const app = await source('frontend/src/legacy/app.js');
  const inizio = app.indexOf('function renderListaLocali()');
  const fine = app.indexOf('\n    function ', inizio + 1);
  const corpo = app.slice(inizio, fine);
  assert.ok(inizio > 0);
  assert.match(corpo, /await sincronizzaImpostazioniSessione\(\{ modello: valore \}\)/u, 'il click locale deve scrivere sul registro sessione, non solo su state.model');
  assert.match(corpo, /aggiornaModelloPrincipale && sincronizzaSessione && state\.realSession\.id/u, 'stesso guard del ramo remoto: niente sync su un picker che non ne ha bisogno (es. Laboratorio modelli)');
  assert.match(corpo, /aggiornaPillolaModello\(\)/u, 'la pillola del composer deve aggiornarsi, non solo il trigger dentro il foglio');
});

