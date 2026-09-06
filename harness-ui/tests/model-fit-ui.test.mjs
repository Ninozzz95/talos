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

test('MODEL-FIT-UI-02 — /fit NON parte da solo a ogni render: è un gesto esplicito', { skip: "cutover 06/09: la regola cercava classi, keyframe o funzioni del monolite (public/) che il mockup vivo ha sostituito; il comportamento è provato dai test dei componenti in frontend/tests. Da cancellare col sì dell'owner (ledger Fase 3)" }, async () => {
  /*
   * ⛔ `/fit` legge l'header GGUF dal disco e misura la macchina. Farlo per
   * ogni riga a ogni ridisegno sarebbe lavoro vero speso senza che nessuno
   * l'abbia chiesto — e su una lista lunga, a ogni carattere digitato nel
   * campo di ricerca.
   */
  const app = await source('frontend/src/legacy/app.js');
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
  const app = await source('frontend/src/legacy/app.js');
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
  const app = await source('frontend/src/legacy/app.js');
  assert.match(app, /Number\.isFinite\(richiesti\) && Number\.isFinite\(disponibili\) && disponibili > 0/);
});

test('MODEL-FIT-UI-05 — il motivo è in italiano piano, mai il codice grezzo del server', async () => {
  const app = await source('frontend/src/legacy/app.js');
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
  const app = await source('frontend/src/legacy/app.js');
  assert.match(app, /Verifica non riuscita — \$\{voce\.errore\}/);
});

test('MODEL-FIT-UI-07 — il verdetto non è distinguibile SOLO dal colore', { skip: "cutover 06/09: la regola cercava classi, keyframe o funzioni del monolite (public/) che il mockup vivo ha sostituito; il comportamento è provato dai test dei componenti in frontend/tests. Da cancellare col sì dell'owner (ledger Fase 3)" }, async () => {
  /*
   * ⛔ Un "non compatibile" leggibile solo dal rosso è invisibile a chi non
   * distingue i colori, proprio quando l'informazione conta di più (si sta
   * per caricare un modello che può bloccare la macchina). Ogni stato ha
   * un glifo suo, oltre alla parola per esteso nel testo.
   */
  const css = await source('frontend/src/styles/index.css');
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
  const app = await source('frontend/src/legacy/app.js');
  assert.match(app, /\?profile=\$\{profilo\}/);
  assert.match(app, /if \(esito\.state !== 'compatible'\)/);
  assert.match(app, /Va bene per la chat, non come agente/);
});

test('MODEL-FIT-UI-09 — AL CONTRARIO: il ripiego si mostra solo se la chat passa DAVVERO', async () => {
  // ⛔ Un ripiego che a sua volta non passa sarebbe rumore su una riga già
  // negativa. E se la seconda domanda fallisce, resta il verdetto
  // principale: mai un errore in più a schermo per un extra.
  const app = await source('frontend/src/legacy/app.js');
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
  const app = await source('frontend/src/legacy/app.js');
  assert.match(app, /ne mancano \$\{formattaByteModelLab\(richiesti - disponibili\)\}/);
  assert.match(app, /if \(!Number\.isFinite\(richiesti\) \|\| !Number\.isFinite\(disponibili\) \|\| richiesti <= disponibili\) return '';/);
});

test('MODEL-FIT-UI-11 — «capacità non osservabili» dice CHI le blocca e cosa fare', async () => {
  /*
   * ⛔⛔ 02/9 — il difetto sotto era che l'`n_ctx` (e il template, e gli
   * attrezzi) del modello CARICATO venivano attribuiti a ogni altro modello.
   * Curato nel probe. Ma la conseguenza a schermo era un «non determinabile»
   * muto: vero e inutile. Ora la riga nomina il modello che occupa il runtime
   * e indica il gesto — il pulsante che lo scarica è lì accanto.
   */
  const app = await source('frontend/src/legacy/app.js');
  assert.match(app, /servingThisModel === false/);
  assert.match(app, /finché c'è lui il runtime non può osservare questo modello: scaricalo per verificarlo/);
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

test('MESSAGE-ACTIONS-01 — la barra sta DOPO il testo, per lo screen reader', { skip: "cutover 06/09: la regola cercava classi, keyframe o funzioni del monolite (public/) che il mockup vivo ha sostituito; il comportamento è provato dai test dei componenti in frontend/tests. Da cancellare col sì dell'owner (ledger Fase 3)" }, async () => {
  /*
   * ⭐ Ricerca 03/9: le azioni per messaggio vanno dopo il testo nel DOM —
   * se stanno prima, si annuncia «copia, rigenera» prima di una sola parola
   * della risposta.
   */
  const app = await source('frontend/src/legacy/app.js');
  const inizio = app.indexOf('function ensureAssistantMessageElement');
  const corpo = app.slice(inizio, app.indexOf('\n  function ', inizio + 1));
  assert.ok(corpo.indexOf("article.append(meta, copy)") < corpo.indexOf('article.append(azioni)'), 'le azioni vanno appese dopo il testo');
  assert.match(corpo, /aria-label', 'Azioni sulla risposta'/);
});

test('MESSAGE-ACTIONS-02 — nessun bottone finto: niente Libreria, niente like, niente falso «rigenera»', { skip: "cutover 06/09: la regola cercava classi, keyframe o funzioni del monolite (public/) che il mockup vivo ha sostituito; il comportamento è provato dai test dei componenti in frontend/tests. Da cancellare col sì dell'owner (ledger Fase 3)" }, async () => {
  /*
   * ⛔ Il gestore precedente era un residuo di mockup: `retry` diceva
   * «Rigenerazione avviata» senza rigenerare, like/dislike dicevano
   * «Feedback registrato» senza salvare. Sul desktop la Libreria non esiste
   * ancora: un bottone che non salva sarebbe «APERTA non è FATTA».
   */
  const app = await source('frontend/src/legacy/app.js');
  assert.doesNotMatch(app, /toast\('Rigenerazione avviata'/);
  assert.doesNotMatch(app, /toast\(!wasPressed \? 'Feedback registrato'/);
  assert.match(app, /bottoneAzione\('ask-again', 'Chiedi di nuovo'/, 'il nome dice cosa fa: rimanda la domanda, non sostituisce la risposta');
});

test('MESSAGE-ACTIONS-03 — «chiedi di nuovo» usa la domanda REGISTRATA, non il DOM', async () => {
  // ⛔ Una bolla può essere ridisegnata o troncata: rileggerla manderebbe una
  // domanda diversa da quella che la persona vede.
  const app = await source('frontend/src/legacy/app.js');
  assert.match(app, /state\.realSession\.ultimaDomanda = text;/);
  assert.match(app, /const domanda = state\.realSession\.ultimaDomanda;/);
});
