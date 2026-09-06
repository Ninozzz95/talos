#!/usr/bin/env node
/*
 * IL CANCELLO UNICO — un comando solo, che guarda la app viva e scrive la lista azionabile.
 *
 * ⛔ Perché esiste (contratto `.claude/CANCELLO-UNICO-METODI-2026-09-06.md`): il problema non
 * erano i 121 difetti della coda, era che NIENTE li guardava. I dodici simboli mai disegnati, il
 * `.sheet-option` senza regola di base, le sessioni morte che dicevano «in corso»: nessuno è stato
 * trovato da un test: li ha trovati un paio d'occhi su uno screenshot, giorni dopo.
 *
 * ── La divisione del lavoro, e perché è così ─────────────────────────────────────────────────
 * I cinque analizzatori accanto a questo file sono PURI: prendono dati e tornano righe, non aprono
 * niente. Questo file è l'unico che sporca — avvia un server, apre un browser, legge il disco — e
 * NON GIUDICA: raccoglie e chiama. È la ragione per cui i giudizi hanno 108 test che girano in un
 * secondo senza un browser, e questo pezzo si prova invece lanciandolo.
 *
 * ── Le trappole già pagate, che qui sono codice e non buoni propositi ────────────────────────
 * ⛔ MAI la porta 4174: è l'istanza viva dell'owner. Qui si sceglie una porta libera, e non basta:
 *    un residuo di un'altra sessione risponde su una porta qualunque con un aspetto sanissimo. La
 *    prova che il server sia il PROPRIO è che il suo store è vergine — «0 sessioni». È successo
 *    davvero il 06/9 ed è costato dieci minuti di misure fatte sul processo sbagliato.
 * ⛔ `TALOS_OWNER_RUNTIME_MODULE` va passata, o il kernel non è caricato e ogni giro reale
 *    fallisce mentre `/api/v1/health` continua a rispondere 200 — è il difetto che ha tenuto la
 *    app rotta per due giorni (02/9, `.claude/LEDGER-RUNTIME-OWNER-MODULE-2026-09-02.md`). Il
 *    server lo scrive nel suo log all'avvio: qui quel log si LEGGE, e se manca ci si ferma.
 * ⛔ Gli ascoltatori si chiedono al PROTOCOLLO, non alla pagina: `getEventListeners` esiste solo
 *    nella console di DevTools e nel CDP — `page.evaluate` non ha i permessi (Chrome for
 *    Developers, «Get and debug event listeners» · puppeteer#5319, letti il 06/09/2026). Si prende
 *    l'`objectId` del documento con `Runtime.evaluate`, poi `DOMDebugger.getEventListeners` con
 *    `depth:-1` (tutto il sottoalbero: il predefinito è 1) e `pierce:true` (attraversa shadow root
 *    e iframe).
 * ⛔ I nomi degli attrezzi arrivano da `/api/v1/tools`, e SETACCIATI: `cerca`, `leggi`, `scrivi`,
 *    `elenca`, `prova`, `naviga` sono parole italiane correnti — passarle come «nomi tecnici a
 *    schermo» accuserebbe mezza interfaccia («Cerca modello o autore…») al primo giro. Passano solo
 *    i nomi che PORTANO UN SEPARATORE (`web_search`, `document_create`): sono quelli che l'owner ha
 *    vietato a schermo, e nessuna frase italiana li contiene per caso.
 *
 * ── Cosa NON fa ──────────────────────────────────────────────────────────────────────────────
 * Non tocca un file del prodotto, non fa commit, non scrive niente fuori dal rapporto in
 * `.claude/`. Verso il server manda solo GET.
 *
 * Uso:  node scripts/cancello/cancello.mjs
 *       (dalla cartella `harness-ui/frontend`)
 * Uscita: 0 se non ci sono difetti di gravità ALTA, 1 se ce ne sono — così è un cancello vero.
 */

import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, appendFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import playwright from 'playwright';

import { analizzaRiferimentiMorti } from './riferimenti-morti.mjs';
import { esaminaInventario } from './controlli-morti.mjs';
import { statiBugiardi } from './stati-bugiardi.mjs';
import { testoGrezzo } from './testo-grezzo.mjs';
import { analizzaSuperfici } from './superfici-scollegate.mjs';

const { chromium } = playwright;

const QUI = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(QUI, '../..');            // harness-ui/frontend
const HARNESS = path.resolve(FRONTEND, '..');           // harness-ui
const REPO = path.resolve(HARNESS, '..');               // radice del repo

/** ⛔ NON NEGOZIABILE: la 4174 è l'istanza viva dell'owner. Non si sceglie, non si sonda, non si tocca. */
const PORTA_OWNER = 4174;

/** Il kernel dell'agente. Senza, `/api/v1/health` dice 200 e ogni giro reale fallisce in silenzio. */
const KERNEL_PREDEFINITO = path.resolve(REPO, '../AVM-harness/mobile/scripts/harness-talos/talosHarness.mjs');

/*
 * Le 17 schermate. `vaia` è il valore su cui la delega della regia discrimina: dove c'è, la
 * schermata si raggiunge PREMENDO davvero il comando che una persona premerebbe — che è anche il
 * modo in cui il giro prova la navigazione mentre la percorre.
 * ⛔ Le tre senza `vaia` non hanno (oggi) un comando che le apra: `vuota` è uno stato automatico
 *    senza sessione, `doctor` sta dentro il foglio «Controllo», e Model Lab ha un pulsante
 *    (`#apriLaboratorioDaModello`) che nella app non ha nessun ascoltatore — cioè è esso stesso un
 *    reperto della classe 2. Si aprono per via DOM, e il rapporto lo DICE: mostrare una schermata
 *    non è la stessa cosa che raggiungerla, e confondere le due sarebbe la bugia del cancello.
 */
const SCHERMATE = Object.freeze([
  { id: 'schermoChat', nome: 'Chat', vaia: 'chat', sessione: true },
  { id: 'schermoVuota', nome: 'Nessuna sessione', vaia: null, sessione: true, schermo: 'vuota' },
  { id: 'schermoTerminale', nome: 'Terminale', vaia: 'terminale', sessione: true },
  { id: 'schermoReview', nome: 'Review', vaia: 'review', sessione: true },
  { id: 'schermoBrowser', nome: 'Browser', vaia: 'browser', sessione: true },
  { id: 'schermoCapability', nome: 'Capability', vaia: 'capability' },
  { id: 'schermoBoard', nome: 'Board', vaia: 'board' },
  { id: 'schermoLibreria', nome: 'Libreria', vaia: 'libreria' },
  { id: 'schermoMemoria', nome: 'Memoria', vaia: 'memoria' },
  { id: 'schermoAttivita', nome: 'Attività', vaia: 'attivita' },
  { id: 'schermoNote', nome: 'Note', vaia: 'note' },
  { id: 'schermoRicerca', nome: 'Ricerca approfondita', vaia: 'ricerca' },
  { id: 'schermoOfficina', nome: 'Officina attrezzi', vaia: 'officina' },
  { id: 'schermoAutomazioni', nome: 'Automazioni', vaia: 'automazioni' },
  { id: 'schermoImpostazioni', nome: 'Impostazioni', vaia: 'impostazioni' },
  { id: 'schermoDoctor', nome: 'Doctor', vaia: null, schermo: 'doctor', via: 'foglio Controllo → Doctor' },
  { id: 'schermoModelLab', nome: 'Model Lab', vaia: null, schermo: 'modellab' },
]);

/*
 * ⛔ Le tre viewport DESKTOP, non le quattro del mobile: correzione dell'owner del 02/9 — «la
 * regola impone viewport tablet ma noi siamo su desktop». 1024×800 è quella dove le colonne si
 * stringono per prime, ed è la prima a rompersi.
 */
const VIEWPORT = Object.freeze([
  { nome: 'laptop 1024×800', width: 1024, height: 800 },
  { nome: 'desktop 1440×900', width: 1440, height: 900 },
  { nome: 'desktop 1920×1080', width: 1920, height: 1080 },
]);

/*
 * I due temi si chiedono al CONTESTO (`colorScheme`), non forzando un attributo: la app risolve
 * `colorMode: 'system'` con `matchMedia('(prefers-color-scheme: light)')`, quindi questa è la
 * stessa strada che percorre il computer di una persona. Scrivere `data-theme` a mano proverebbe
 * il foglio di stile e non la catena che lo accende.
 */
const TEMI = Object.freeze([{ nome: 'scuro', schema: 'dark' }, { nome: 'chiaro', schema: 'light' }]);

/*
 * ── Le deleghe di `document`, lette una per una in `legacy/app.js` ────────────────────────────
 * L'ordine è quello di registrazione, perché è l'ordine in cui i gestori vedono il clic; dentro
 * l'ultimo, l'ordine è quello dei controlli scritti nel corpo del gestore.
 *
 * ⛔ `su: '[data-cancello-radice]'` NON è un attributo della pagina: è il contrassegno che questo
 *    file mette sul nodo sintetico che rappresenta `document` nella catena degli antenati. La
 *    pagina non viene toccata — un cancello che modifica ciò che misura non misura più niente.
 */
const DELEGHE = Object.freeze([
  {
    nome: 'copia messaggio', su: '[data-cancello-radice]', evento: 'click',
    attributo: 'data-copy-message', valoriRiconosciuti: '*',
    // app.js: `const copyButton = event.target.closest('[data-copy-message]'); if (copyButton) {…; return;}`
    interrompeAncheSeIgnoto: true,
  },
  {
    nome: 'azioni della testata', su: '[data-cancello-radice]', evento: 'click',
    attributo: 'data-azione', valoriRiconosciuti: ['comandi', 'comprimi', 'dettagli'],
    /*
     * ⛔ Questa delega serve SOLO le copie dentro `.talos-topbar__actions` e solo quelle senza id e
     *    senza `data-open-panel` («serve le COPIE, mai ciò che è già cablato»). Qui non c'è un
     *    motore CSS con i combinatori, quindi la delega guarda ogni `[data-azione]`: gli originali
     *    hanno però un ascoltatore proprio, e un elemento con l'ascoltatore proprio è dichiarato
     *    vivo PRIMA che le deleghe vengano consultate — la sovrapposizione non produce accuse.
     */
    interrompeAncheSeIgnoto: false,
  },
  {
    nome: 'navigazione (data-vaia)', su: '[data-cancello-radice]', evento: 'click',
    attributo: 'data-vaia', valoriRiconosciuti: null, // riempito a runtime con le chiavi VERE di VISTA_PER_VAIA
    /*
     * ⭐ IL CUORE della classe 2, e il difetto vero del 06/9: `data-vaia="note"` con la delega viva
     *    sulla radice e `VISTA_PER_VAIA` senza la chiave `note`. Il clic arrivava e non produceva
     *    niente. `if (vaia && VISTA_PER_VAIA[vaia.dataset.vaia]) {…; return;}`: la mappa sta DENTRO
     *    la condizione, quindi con un valore ignoto il gestore prosegue — l'accusa resta sospesa.
     */
    interrompeAncheSeIgnoto: false,
  },
  {
    nome: 'apri velo', su: '[data-cancello-radice]', evento: 'click',
    attributo: 'data-apre-velo', valoriRiconosciuti: null, // gli id dei veli che esistono davvero
    // `if (apre) { apriVeloMockup(apre.dataset.apreVelo); return; }` — la sola PRESENZA consuma il
    // clic, e `apriVeloMockup` esce in silenzio se `#id` non c'è: un velo che non esiste è un
    // pulsante morto che sembra vivo.
    interrompeAncheSeIgnoto: true,
  },
  {
    nome: 'chiudi velo', su: '[data-cancello-radice]', evento: 'click',
    attributo: 'data-chiudi', valoriRiconosciuti: null,
    interrompeAncheSeIgnoto: true,
  },
  {
    nome: 'disclosure (aria-expanded + aria-controls)', su: '[data-cancello-radice]', evento: 'click',
    attributo: null, attributiRichiesti: ['aria-expanded', 'aria-controls'],
    /*
     * ⛔ Nessun valore da riconoscere: a questa delega basta la forma. Senza questa riga ogni
     *    disclusura sana della app cadeva nel ramo del «valore non riconosciuto» — falso positivo
     *    trovato dalla prova, non previsto.
     * ⭐ `esaustiva` sta QUI, sull'ultima, e vale per tutte: ho letto in `legacy/app.js` OGNI
     *    ascoltatore di clic registrato su `ROOT()`/`document` — sono quattro (menu allega,
     *    copia-messaggio, azioni della testata, regia del mockup) più i tre chiusori transitori
     *    `onDocumentClick`, che chiudono un menu e non attivano NIENTE. Le quattro che attivano
     *    qualcosa sono tutte dichiarate sopra. Senza questa asserzione ogni controllo servito da
     *    una delega finirebbe fra gli «ignoti» — cioè la classe 2 non direbbe mai niente.
     */
    esaustiva: true,
  },
  {
    nome: 'scorciatoie da tastiera della radice', su: '[data-cancello-radice]', evento: 'keydown',
    attributo: null, attributiRichiesti: [],
    /*
     * ⛔ Serve solo a dichiarare che i `keydown` su `document` sono conosciuti: sono le scorciatoie
     *    globali (palette, Esc, ⌘T) e non servono un controllo in particolare. Senza, ogni elemento
     *    con un antenato che ascolta `keydown` diventerebbe «ignoto» per un ascoltatore che so
     *    benissimo cosa fa.
     */
    esaustiva: true,
  },
]);

/*
 * ── Le superfici, per la classe 5 ────────────────────────────────────────────────────────────
 * `promette` = cosa la schermata dichiara di mostrare. `chiamate` si RIEMPIE COL TRAFFICO VERO
 * osservato mentre la schermata è aperta (la prova definitiva secondo il limite dichiarato dal
 * modulo: «Rotta mai chiamata è un sospetto statico; la prova è il traffico»), unito a ciò che è
 * dichiarato qui sotto per le superfici che si riempiono al PRIMO avvio e non più.
 * ⛔ Chi non dichiara né `statica` né `promette` esce dal giudizio con gravità bassa e il perché
 *    scritto: meglio una riga che dice «su questa non so» che un silenzio che sembra un via libera.
 */
/*
 * ⛔ `id` è il valore di `data-vaia`, NON l'id della schermata: è la chiave su cui i contatori della
 *    colonna dicono dove portano (`contatoriSenzaLuogo` confronta il `vaia` del contatore con gli
 *    id delle superfici). Con `schermoNote` al posto di `note` ogni contatore risulterebbe rivolto
 *    a un luogo inesistente — nove falsi positivi al primo giro, e un rapporto già morto.
 */
const SUPERFICI = Object.freeze([
  { id: 'chat', schermata: 'schermoChat', nome: 'Chat', promette: 'la conversazione della sessione aperta', eventi: ['sessions/:id/events'], perche: 'i messaggi arrivano dallo stream SSE, non da una rotta chiesta all\'apertura' },
  { id: 'vuota', schermata: 'schermoVuota', nome: 'Nessuna sessione', statica: true, perche: 'è lo stato vuoto: non promette dati, li chiede la creazione di una sessione' },
  { id: 'terminale', schermata: 'schermoTerminale', nome: 'Terminale', promette: 'le schede di shell della sessione', eventi: ['terminal/ws'], perche: 'il terminale vive su una WebSocket, non su una rotta HTTP interrogata all\'apertura' },
  { id: 'review', schermata: 'schermoReview', nome: 'Review', promette: 'le modifiche del progetto', chiamateDichiarate: ['GET /api/v1/sessions/:id/git/status'] },
  { id: 'browser', schermata: 'schermoBrowser', nome: 'Browser', promette: 'le pagine lette dall\'attrezzo naviga', chiamateDichiarate: ['GET /api/v1/browser/leggi'] },
  { id: 'capability', schermata: 'schermoCapability', nome: 'Capability', promette: 'gli attrezzi, le abilità e i permessi' },
  { id: 'board', schermata: 'schermoBoard', nome: 'Board', promette: 'le sessioni e i loro esiti' },
  { id: 'libreria', schermata: 'schermoLibreria', nome: 'Libreria', promette: 'i documenti del progetto', chiamateDichiarate: ['GET /api/v1/sessions/:id/library'] },
  { id: 'memoria', schermata: 'schermoMemoria', nome: 'Memoria', promette: 'le memorie scritte dall\'agente', chiamateDichiarate: ['GET /api/v1/sessions/:id/memory'] },
  { id: 'attivita', schermata: 'schermoAttivita', nome: 'Attività', promette: 'le attività dell\'owner', chiamateDichiarate: ['GET /api/v1/sessions/:id/tasks'] },
  { id: 'note', schermata: 'schermoNote', nome: 'Note', promette: 'le note scritte dall\'agente', chiamateDichiarate: ['GET /api/v1/sessions/:id/notes'], sinonimi: ['notes'] },
  { id: 'ricerca', schermata: 'schermoRicerca', nome: 'Ricerca approfondita', promette: 'le ricerche del progetto', chiamateDichiarate: ['GET /api/v1/sessions/:id/research'] },
  { id: 'officina', schermata: 'schermoOfficina', nome: 'Officina attrezzi', promette: 'gli attrezzi forgiati', chiamateDichiarate: ['GET /api/v1/sessions/:id/tool-forge'] },
  { id: 'automazioni', schermata: 'schermoAutomazioni', nome: 'Automazioni', promette: 'le automazioni programmate' },
  { id: 'impostazioni', schermata: 'schermoImpostazioni', nome: 'Impostazioni', promette: 'fornitori, runtime e modelli' },
  { id: 'doctor', schermata: 'schermoDoctor', nome: 'Doctor', promette: 'la diagnosi dell\'installazione', chiamateDichiarate: ['GET /api/v1/doctor'] },
  { id: 'modellab', schermata: 'schermoModelLab', nome: 'Model Lab', promette: 'i modelli sul computer e il catalogo' },
]);

/*
 * Le rotte escluse dal sospetto «mai chiamata», ognuna col suo perché — nessuna eccezione muta.
 */
const ECCEZIONI_ROTTE = Object.freeze([
  { percorso: '/api/v1/health', perche: 'la chiama chi tiene acceso il processo (l\'avvio, Electron, il doctor), non una schermata.' },
  { percorso: '/api/v1/sessions/:id/events', perche: 'è lo stream SSE: la apre EventSource, non un fetch, e l\'estrattore delle chiamate vede solo i fetch.' },
  { percorso: '/api/v1/browser/proxy', perche: 'la carica un iframe con un src, non il codice: nessun fetch la nomina per costruzione.' },
  { percorso: '/api/v1/huggingface/image', perche: 'finisce nell\'attributo src di una img: stessa ragione del proxy.' },
  { percorso: '/api/v1/artifacts/:id', perche: 'apre un artefatto in una finestra nuova (href), non lo legge con un fetch.' },
]);

/** Cosa questo cancello NON copre. Sta nel rapporto perché una lista verde senza limiti è una bugia. */
const LIMITI = Object.freeze([
  'Non giudica se una cosa è BELLA, se il testo è GIUSTO o se il flusso ha senso: quelle restano allo screenshot guardato da una persona. Il cancello toglie il lavoro meccanico, non l\'occhio.',
  'Guarda solo ciò che è VISIBILE nel momento in cui guarda: un controllo che compare dopo una risposta del modello, una barra che mente per due secondi dopo un invio, un elenco che si popola più tardi, non entrano in nessuna misura. Non c\'è nessuna nozione di tempo.',
  'Le rotte del server sono estratte a REGEX da `src/http-app.mjs` (`url.pathname === …` e i letterali `/^\\/api…$/`): una rotta scritta in una forma nuova non comparirebbe, e la sua assenza somiglia in tutto a «non c\'è». Il numero delle rotte trovate è scritto nel rapporto proprio per poterlo smentire.',
  'Le sessioni: lo store è VERGINE per costruzione (è la prova che il server è il proprio), quindi le regole della classe 3 che parlano di sessioni non esaminano nessuna coppia e risultano MUTE. Sono elencate: «nessuna bugia» con dieci regole mute non è una buona notizia.',
]);

// ───────────────────────────── utilità ────────────────────────────────────────────────────────

const oggi = () => new Date().toISOString().slice(0, 10);
const parla = (...p) => console.log('[cancello]', ...p);

function muori(motivo) {
  console.error(`\n⛔ FERMATA: ${motivo}\n`);
  process.exit(2);
}

/** Una porta libera, mai la 4174. Si chiede al sistema operativo invece di indovinare. */
function portaLibera() {
  return new Promise((risolvi, rifiuta) => {
    const s = createServer();
    s.on('error', rifiuta);
    s.listen(0, '127.0.0.1', () => {
      const porta = s.address().port;
      s.close(() => (porta === PORTA_OWNER ? portaLibera().then(risolvi, rifiuta) : risolvi(porta)));
    });
  });
}

const aspetta = (ms) => new Promise((r) => setTimeout(r, ms));

async function chiedi(base, percorso) {
  const risposta = await fetch(`${base}${percorso}`, { headers: { accept: 'application/json' } });
  if (!risposta.ok) throw new Error(`${percorso} → HTTP ${risposta.status}`);
  const corpo = await risposta.json();
  if (corpo?.ok !== true) throw new Error(`${percorso} → risposta non ok`);
  return corpo.data;
}

// ───────────────────────── 1 · il server proprio, e la prova che sia il proprio ────────────────

async function avviaServerProprio() {
  const kernel = process.env.TALOS_OWNER_RUNTIME_MODULE || KERNEL_PREDEFINITO;
  if (!existsSync(kernel)) {
    muori(`il kernel dell'agente non esiste: ${kernel}\n   Senza, /api/v1/health risponde 200 e ogni giro reale fallisce in silenzio.\n   Indica il percorso giusto in TALOS_OWNER_RUNTIME_MODULE.`);
  }
  const porta = await portaLibera();
  if (porta === PORTA_OWNER) muori('la porta scelta è la 4174, che è dell\'owner');
  const cartella = mkdtempSync(path.join(tmpdir(), 'cancello-store-'));
  const registro = path.join(cartella, 'server.log');
  parla(`porta ${porta} · store vergine in ${cartella}`);

  const figlio = spawn(process.execPath, ['server.mjs'], {
    cwd: HARNESS,
    env: {
      ...process.env,
      TALOS_HARNESS_UI_PORT: String(porta),
      TALOS_HARNESS_UI_SESSIONS_DIR: cartella,
      TALOS_OWNER_RUNTIME_MODULE: kernel,
      TALOS_INTRO: '0', // il primo avvio non deve rubare lo schermo al giro
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  const raccogli = (pezzo) => { log += pezzo; try { appendFileSync(registro, pezzo); } catch { /* il registro è un lusso, non un requisito */ } };
  figlio.stdout.on('data', (d) => raccogli(String(d)));
  figlio.stderr.on('data', (d) => raccogli(String(d)));
  figlio.on('exit', (codice) => { if (!figlio.fermatoDaNoi) parla(`⛔ il server è uscito da solo (codice ${codice})`); });

  const base = `http://127.0.0.1:${porta}`;
  let vivo = false;
  for (let i = 0; i < 60 && !vivo; i += 1) {
    await aspetta(500);
    try { await chiedi(base, '/api/v1/health'); vivo = true; } catch { /* non ancora */ }
  }
  if (!vivo) { figlio.kill(); muori(`il server non ha risposto su ${base}/api/v1/health in 30 s.\n   Log:\n${log.slice(-2000)}`); }

  /*
   * ⛔ Il log si LEGGE. `server.mjs` scrive `[doctor] ATTENZIONE all'avvio:
   * TALOS_OWNER_RUNTIME_MODULE non è impostata` quando il kernel non c'è — e senza kernel ogni
   * giro reale fallisce mentre la app sembra sana. La riga esiste dal 02/9 perché quel giorno
   * nessuno la leggeva.
   */
  await aspetta(1200);
  if (/TALOS_OWNER_RUNTIME_MODULE non è impostata/.test(log)) {
    figlio.fermatoDaNoi = true; figlio.kill();
    muori('il server dice che TALOS_OWNER_RUNTIME_MODULE non è impostata: il kernel non è caricato e ogni giro reale fallirebbe. Il cancello misurerebbe una app monca.');
  }

  /*
   * ⭐ LA PROVA DI PROPRIETÀ. Un residuo di un'altra sessione risponde su una porta qualunque con
   * l'aria di stare benissimo. Uno store vergine risponde «0 sessioni»: qualunque altro numero
   * vuol dire che stiamo parlando con un processo che non è il nostro.
   */
  const sessioni = await chiedi(base, '/api/v1/sessions');
  const quante = (sessioni?.items ?? []).length;
  if (quante !== 0) {
    figlio.fermatoDaNoi = true; figlio.kill();
    muori(`su ${base} ci sono ${quante} sessioni, e lo store appena creato è vuoto: quel server NON è il nostro. Non si misura, non si tocca.`);
  }
  parla(`prova di proprietà superata: 0 sessioni su ${base}`);
  return {
    base,
    porta,
    log: () => log,
    ferma: () => { figlio.fermatoDaNoi = true; try { figlio.kill(); } catch { /* già morto */ } },
  };
}

// ───────────────────────── 2 · la raccolta statica (dal disco) ─────────────────────────────────

/** I tre testi che la classe 1 incrocia: il markup servito, il foglio servito, il codice servito. */
function testiServiti() {
  const dentro = (nome) => path.join(HARNESS, 'public', nome);
  return {
    html: { 'public/index.html': readFileSync(dentro('index.html'), 'utf8') },
    css: { 'public/styles.css': readFileSync(dentro('styles.css'), 'utf8') },
    sorgenti: { 'public/app.js': readFileSync(dentro('app.js'), 'utf8') },
  };
}

/**
 * Le rotte che il server espone, lette dalle due forme che `http-app.mjs` usa davvero: il confronto
 * esatto (`url.pathname === '/x'`) e il letterale di espressione regolare (`/^\/api\/…$/`).
 * ⛔ È una estrazione statica e lo dice: una forma nuova non comparirebbe. Il rapporto stampa
 *    quante ne ha trovate proprio perché quel numero si possa smentire a colpo d'occhio.
 */
function rotteEsposte() {
  const file = path.join(HARNESS, 'src/http-app.mjs');
  const testo = readFileSync(file, 'utf8');
  const trovate = new Map();
  const RE_REGEX = /\/\^((?:\\\/|[^/\n])[^\n]*?)\$\//g;
  const RE_ESATTA = /url\.pathname\s*===\s*'([^']+)'/g;
  const RE_METODO = /method\s*===\s*'([A-Z]+)'/g;
  const righe = testo.split('\n');
  for (let i = 0; i < righe.length; i += 1) {
    const riga = righe[i];
    const metodo = [...riga.matchAll(RE_METODO)].map((m) => m[1])[0] || '*';
    const aggiungi = (percorso) => {
      if (!percorso.startsWith('/api/')) return;
      // ⛔ Un residuo di sintassi (gruppi opzionali, classi di caratteri) non è un percorso: si
      //    TACE invece di inventarne uno storto. Un percorso finto produrrebbe un «mai chiamata»
      //    che nessuno può chiudere, ed è così che un rapporto smette di essere letto.
      if (/[()?[\]{}|+*\\]/.test(percorso)) return;
      trovate.set(`${metodo} ${percorso}`, { metodo, percorso, file: 'src/http-app.mjs', riga: i + 1 });
    };
    for (const m of riga.matchAll(RE_ESATTA)) aggiungi(m[1]);
    for (const m of riga.matchAll(RE_REGEX)) {
      aggiungi(m[1]
        .replace(/\\\//g, '/')
        .replace(/\(\[\^\/\]\+\)/g, ':id')
        .replace(/\(\.\*\)/g, '*'));
    }
  }
  return [...trovate.values()];
}

/**
 * Le chiamate che il frontend scrive davvero, lette dal bundle servito. La stringa si prende
 * INTERA: un template con `${…}` dentro va letto bilanciando le graffe, o `?forza=1` la spezza e
 * il percorso arriva mutilato al confronto.
 */
function chiamateDelFrontend() {
  const nome = 'public/app.js';
  const testo = readFileSync(path.join(HARNESS, 'public/app.js'), 'utf8');
  const righeFino = (() => {
    const tagli = [0];
    for (let i = 0; i < testo.length; i += 1) if (testo[i] === '\n') tagli.push(i);
    return (indice) => { let a = 0; let b = tagli.length - 1; while (a < b) { const m = (a + b + 1) >> 1; if (tagli[m] <= indice) a = m; else b = m - 1; } return a + 1; };
  })();
  const stringaIntorno = (indice) => {
    let apertura = -1; let virgoletta = '';
    for (let i = indice; i >= 0 && indice - i < 500; i -= 1) {
      const c = testo[i];
      if ((c === "'" || c === '"' || c === '`') && testo[i - 1] !== '\\') { apertura = i; virgoletta = c; break; }
      if (c === '\n') break;
    }
    if (apertura === -1) return null;
    let fuori = '';
    for (let i = apertura + 1; i < testo.length; i += 1) {
      const c = testo[i];
      if (c === '\\') { fuori += testo[i + 1]; i += 1; continue; }
      if (c === virgoletta) return fuori;
      if (virgoletta === '`' && c === '$' && testo[i + 1] === '{') {
        let profondita = 1; let dentro = '${'; i += 2;
        while (i < testo.length && profondita > 0) {
          if (testo[i] === '{') profondita += 1; else if (testo[i] === '}') profondita -= 1;
          dentro += testo[i]; i += 1;
        }
        i -= 1; fuori += dentro; continue;
      }
      if (c === '\n') return null;
      fuori += c;
    }
    return null;
  };
  const trovate = new Map();
  for (const m of testo.matchAll(/\/api\/v\d\//g)) {
    const stringa = stringaIntorno(m.index);
    if (!stringa || !stringa.includes('/api/')) continue;
    const percorso = stringa.slice(stringa.indexOf('/api/'));
    if (!trovate.has(percorso)) trovate.set(percorso, { percorso, file: nome, riga: righeFino(m.index) });
  }
  return [...trovate.values()];
}

// ───────────────────────── 3 · la raccolta nel browser ─────────────────────────────────────────

/*
 * Ciò che gira DENTRO la pagina. Sta in una stringa e non in una funzione importata perché
 * `page.evaluate` serializza il codice: qui c'è la sola cosa che il browser sa fare meglio di noi —
 * dire cosa è visibile, e con quale testo.
 */
const RACCOLTA_NELLA_PAGINA = `() => {
  const visibile = (el) => (typeof el.checkVisibility === 'function'
    ? el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
    : !el.hidden && el.getClientRects().length > 0);

  const selettoreDi = (el) => {
    if (el.id) return '#' + el.id;
    const pezzi = [];
    let n = el;
    for (let salti = 0; n && n.nodeType === 1 && salti < 4; salti += 1, n = n.parentElement) {
      if (n.id) { pezzi.unshift('#' + n.id); break; }
      const classi = [...n.classList].filter((c) => !/^(is-|motion-|active$)/.test(c)).slice(0, 2);
      const fratelli = n.parentElement ? [...n.parentElement.children].filter((f) => f.tagName === n.tagName) : [n];
      const indice = fratelli.length > 1 ? ':nth-of-type(' + (fratelli.indexOf(n) + 1) + ')' : '';
      pezzi.unshift(n.tagName.toLowerCase() + classi.map((c) => '.' + c).join('') + indice);
    }
    return pezzi.join(' > ');
  };

  const attributiDi = (el) => {
    const fuori = {};
    for (const a of el.attributes) fuori[a.name] = a.value;
    return fuori;
  };

  const CANDIDATI = 'button, a, input, select, textarea, summary, label, option, [role], [tabindex], [onclick]';
  const marcati = new Map();
  let prossimo = 0;
  const marca = (el) => {
    if (marcati.has(el)) return marcati.get(el);
    const k = prossimo; prossimo += 1;
    marcati.set(el, k);
    el.setAttribute('data-cancello-nodo', String(k));
    return k;
  };

  // 1) i controlli visibili, e tutta la loro catena di antenati (che serve alle deleghe)
  const nodi = [];
  const registra = (el, controllo) => {
    const k = marca(el);
    if (nodi[k]) { if (controllo) nodi[k].controllo = true; return k; }
    nodi[k] = {
      k, controllo,
      tag: el.tagName.toLowerCase(),
      selettore: selettoreDi(el),
      attributi: attributiDi(el),
      testo: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 90),
      genitore: null,
    };
    return k;
  };
  for (const el of document.querySelectorAll(CANDIDATI)) {
    if (!visibile(el)) continue;
    let k = registra(el, true);
    for (let p = el.parentElement; p; p = p.parentElement) {
      const kp = registra(p, false);
      nodi[k].genitore = kp;
      k = kp;
      if (p === document.documentElement) break;
    }
  }

  // 2) il testo che una persona legge: elementi visibili con del testo PROPRIO
  const testi = [];
  for (const el of document.body.querySelectorAll('*')) {
    if (!visibile(el)) continue;
    let proprio = '';
    for (const n of el.childNodes) if (n.nodeType === 3) proprio += n.nodeValue;
    proprio = proprio.replace(/\\s+/g, ' ').trim();
    if (!proprio) continue;
    testi.push({
      selettore: selettoreDi(el),
      testo: proprio,
      dentroCodice: Boolean(el.closest('pre, code, kbd, samp, .talos-code, [data-mostra-codice]')),
    });
  }

  // 3) ciò che lo schermo DICE, per la classe 3
  const numero = (t) => {
    const m = String(t || '').replace(/\\./g, '').match(/-?\\d+(?:,\\d+)?/);
    return m ? Number(m[0].replace(',', '.')) : null;
  };
  const sessioni = [...document.querySelectorAll('#sessionList [data-real-session-id]')].map((r) => ({
    sessionId: r.dataset.realSessionId,
    etichetta: (r.querySelector('.talos-session-item__state')?.textContent || '').trim(),
    classiPallino: [...(r.querySelector('.talos-dot')?.classList || [])],
  }));
  const corrente = document.querySelector('#sessionList [aria-current="true"][data-real-session-id]');
  const usage = document.querySelector('[data-runtime-usage]');
  /*
   * ⛔ «41,2k token» è un numero ARROTONDATO, non il numero: leggerlo come 41,2 farebbe accusare di
   *    bugia una barra che dice il vero. Dove c'è la «k» il campo si lascia fuori — meglio una
   *    regola muta di una regola che confronta una cifra con la sua abbreviazione.
   */
  const testoUsage = usage ? usage.textContent.trim() : '';
  const tokenScritto = (testoUsage.match(/([\\d.,]+)(k?)\\s*token/) || []);
  const barra = corrente && testoUsage
    ? {
      sessionId: corrente.dataset.realSessionId,
      giri: numero((testoUsage.match(/([\\d.,]+)\\s*gir/) || [])[1]),
      token: tokenScritto[2] === 'k' ? null : numero(tokenScritto[1]),
    }
    : null;
  const contatori = [...document.querySelectorAll('.talos-nav-item')]
    .filter((v) => v.querySelector('.talos-nav-item__count'))
    .map((v) => ({
      nome: (v.querySelector('.talos-nav-item__label')?.textContent || '').trim(),
      luogo: v.dataset.conteggio || v.dataset.vaia || '',
      vaia: v.dataset.vaia || '',
      quanti: numero(v.querySelector('.talos-nav-item__count')?.textContent),
      /*
       * ⭐ La sola cosa che separa un contatore sano dal difetto delle «Note»: il luogo a cui manda
       *    esiste come vista MONTATA? Non basta che la mappa conosca la chiave — il 06/9 mancava
       *    proprio la riga che dà `data-view` a #schermoNote, e setView usciva subito.
       */
      vistaMontata: Boolean(v.dataset.vaia && document.querySelector('[data-view="' + ((window.__cancelloViste || {})[v.dataset.vaia] || '\\u0000') + '"]')),
    }));

  return { nodi: nodi.filter(Boolean), testi, schermo: { sessioni, barra, contatori } };
}`;

/** Toglie i contrassegni che la raccolta ha messo: la pagina torna com'era prima di guardarla. */
const PULISCI_NELLA_PAGINA = `() => { for (const el of document.querySelectorAll('[data-cancello-nodo]')) el.removeAttribute('data-cancello-nodo'); }`;

/**
 * Gli ascoltatori, dal protocollo. ⛔ `page.evaluate` non ha i permessi per `getEventListeners`:
 * quella funzione vive nella console di DevTools e nel CDP, e da dentro la pagina non esiste.
 * @returns {{perNodo: Map<number, string[]>, documento: string[]}}
 */
async function ascoltatoriDalProtocollo(cdp) {
  const doc = await cdp.send('Runtime.evaluate', { expression: 'document', returnByValue: false });
  const objectId = doc?.result?.objectId;
  if (!objectId) throw new Error('il protocollo non ha restituito il documento');
  const { listeners } = await cdp.send('DOMDebugger.getEventListeners', { objectId, depth: -1, pierce: true });
  await cdp.send('Runtime.releaseObject', { objectId }).catch(() => {});

  const perBackend = new Map();
  for (const l of listeners || []) {
    const id = l.backendNodeId;
    if (id === undefined) continue;
    if (!perBackend.has(id)) perBackend.set(id, []);
    perBackend.get(id).push(String(l.type).toLowerCase());
  }

  // L'albero del protocollo porta il `backendNodeId` di ogni nodo: è il ponte fra i contrassegni
  // messi dentro la pagina e le liste appena chieste.
  const albero = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
  const perNodo = new Map();
  let documento = [];
  (function cammina(n) {
    if (!n) return;
    if (n.nodeName === '#document') documento = documento.concat(perBackend.get(n.backendNodeId) || []);
    const attrs = n.attributes || [];
    for (let i = 0; i < attrs.length; i += 2) {
      if (attrs[i] !== 'data-cancello-nodo') continue;
      perNodo.set(Number(attrs[i + 1]), perBackend.get(n.backendNodeId) || []);
    }
    for (const c of n.children || []) cammina(c);
    for (const r of n.shadowRoots || []) cammina(r);
    if (n.contentDocument) cammina(n.contentDocument);
  })(albero.root);
  return { perNodo, documento };
}

/** Le voci che `esaminaInventario` vuole: ogni controllo con i suoi ascoltatori e i suoi antenati. */
function costruisciInventario(nodi, perNodo, ascoltatoriDocumento) {
  const perK = new Map(nodi.map((n) => [n.k, n]));
  /*
   * ⛔ Il nodo sintetico che rappresenta `document`: le deleghe della regia stanno LÌ (`ROOT()` è
   *    `document` sul desktop), e senza un antenato che le porti nessuna delega risulterebbe
   *    montata. Il contrassegno `data-cancello-radice` esiste solo qui dentro — la pagina non lo
   *    vede mai.
   */
  const radice = { tag: '#document', selettore: 'document', attributi: { 'data-cancello-radice': '' }, ascoltatori: ascoltatoriDocumento };
  const inventario = [];
  for (const n of nodi) {
    if (!n.controllo) continue;
    const antenati = [radice];
    for (let k = n.genitore; k !== null && k !== undefined; k = perK.get(k)?.genitore ?? null) {
      const a = perK.get(k);
      if (!a) break;
      antenati.push({ tag: a.tag, selettore: a.selettore, attributi: a.attributi, ascoltatori: perNodo.get(a.k) ?? null });
    }
    inventario.push({
      selettore: n.selettore,
      tag: n.tag,
      testo: n.testo,
      attributi: n.attributi,
      ascoltatori: perNodo.get(n.k) ?? null,
      antenati,
    });
  }
  return inventario;
}

/** Mostra una schermata premendo il comando vero; dove non ce n'è uno, lo dice invece di fingere. */
async function apriSchermata(pagina, schermata) {
  if (schermata.vaia) {
    const premuto = await pagina.evaluate((v) => {
      const els = [...document.querySelectorAll(`[data-vaia="${v}"]`)].filter((e) => (e.checkVisibility ? e.checkVisibility() : !e.hidden));
      if (!els.length) return false;
      els[0].click();
      return true;
    }, schermata.vaia);
    if (premuto) return `clic su [data-vaia="${schermata.vaia}"]`;
  }
  if (schermata.id === 'schermoDoctor') {
    const fatto = await pagina.evaluate(() => {
      document.querySelector('[data-open-sheet="control"]')?.click();
      return Boolean(document.querySelector('[data-open-sheet="control"]'));
    });
    if (fatto) {
      await aspetta(400);
      const ok = await pagina.evaluate(() => { const b = document.querySelector('[data-control-action="doctor"]'); if (!b) return false; b.click(); return true; });
      if (ok) return 'foglio «Controllo» → Doctor';
    }
  }
  /*
   * ⛔ L'ultima via, e va DICHIARATA: si mostra la schermata scrivendo gli stessi attributi che
   *    `setView` scrive (`hidden`, `data-vista`, `data-schermo`). Serve per le schermate che oggi
   *    nessun comando apre — e il fatto che serva è esso stesso un reperto, non un dettaglio
   *    tecnico da nascondere in fondo al rapporto.
   */
  await pagina.evaluate(({ id, schermo, sessione }) => {
    for (const el of document.querySelectorAll('[id^="schermo"]')) el.hidden = el.id !== id;
    document.documentElement.setAttribute('data-vista', sessione ? 'sessione' : 'pagina');
    document.documentElement.setAttribute('data-schermo', schermo);
  }, { id: schermata.id, schermo: schermata.schermo || schermata.vaia || '', sessione: Boolean(schermata.sessione) });
  return 'MOSTRATA per via DOM: nessun comando dell’interfaccia la apre';
}

// ───────────────────────── 4 · il giro ─────────────────────────────────────────────────────────

async function giro({ base, vistePerVaia, nomiTecnici, veliVivi }) {
  const deleghe = DELEGHE.map((d) => {
    if (d.attributo === 'data-vaia') return { ...d, valoriRiconosciuti: Object.keys(vistePerVaia) };
    if (d.attributo === 'data-apre-velo' || d.attributo === 'data-chiudi') return { ...d, valoriRiconosciuti: veliVivi };
    return d;
  });

  const browser = await chromium.launch({ channel: 'chrome' });
  const reperti = [];
  const trafficoPerSuperficie = new Map();
  const modiDiApertura = new Map();
  const copertura = [];
  let quadroStati = null;
  let cartellaScelta = null;

  try {
    for (const tema of TEMI) {
      for (const vp of VIEWPORT) {
        const contesto = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          colorScheme: tema.schema,
          locale: 'it-IT',
          reducedMotion: 'reduce',
        });
        const pagina = await contesto.newPage();
        let superficieCorrente = '(avvio)';
        pagina.on('request', (r) => {
          let u; try { u = new URL(r.url()); } catch { return; }
          if (!u.pathname.startsWith('/api/')) return;
          if (!trafficoPerSuperficie.has(superficieCorrente)) trafficoPerSuperficie.set(superficieCorrente, new Set());
          trafficoPerSuperficie.get(superficieCorrente).add(`${r.method()} ${u.pathname}`);
        });
        await pagina.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
        await pagina.waitForTimeout(2600);
        // La mappa vista→schermata serve alla raccolta dentro la pagina per sapere se un contatore
        // porta a un luogo che ESISTE: è il difetto delle «Note».
        await pagina.evaluate((m) => { window.__cancelloViste = m; }, vistePerVaia);
        // Il gruppo «Altro» della colonna è chiuso: senza aprirlo quattro voci non sono visibili, e
        // un controllo che non si vede non si giudica — sembrerebbe che non ci sia.
        await pagina.evaluate(() => { const b = document.querySelector('#altroLuoghi'); if (b?.getAttribute('aria-expanded') === 'false') b.click(); });
        await pagina.waitForTimeout(250);
        const cdp = await contesto.newCDPSession(pagina);

        for (const schermata of SCHERMATE) {
          superficieCorrente = schermata.id;
          const come = await apriSchermata(pagina, schermata);
          if (!modiDiApertura.has(schermata.id)) modiDiApertura.set(schermata.id, come);
          await pagina.waitForTimeout(700);

          const contesto1 = `${schermata.nome} · ${vp.nome} · ${tema.nome}`;
          const raccolto = await pagina.evaluate(RACCOLTA_NELLA_PAGINA);
          const { perNodo, documento } = await ascoltatoriDalProtocollo(cdp);
          await pagina.evaluate(PULISCI_NELLA_PAGINA);

          const inventario = costruisciInventario(raccolto.nodi, perNodo, documento);
          const quadro = esaminaInventario(inventario, { deleghe });
          copertura.push({ contesto: contesto1, schermata: schermata.id, esaminati: quadro.esaminati, vivi: quadro.vivi, morti: quadro.morti.length, ignoti: quadro.ignoti.length, testi: raccolto.testi.length });
          for (const m of quadro.morti) {
            reperti.push({
              classe: 'controlli morti', gravita: m.gravita, contesto: contesto1,
              dove: `${schermata.nome} · ${m.selettore}`,
              cosa: `${m.testo ? `«${m.testo}» ` : ''}${m.perche}`,
            });
          }

          for (const g of testoGrezzo(raccolto.testi, { nomiTecnici })) {
            reperti.push({
              classe: 'testo grezzo', gravita: g.gravita, contesto: contesto1,
              dove: `${schermata.nome} · ${g.selettore}`,
              cosa: `${g.cosa} — ${g.estratto}`,
            });
          }

          // Lo schermo per la classe 3 si legge una volta sola, dove i suoi elementi vivono: la
          // colonna delle sessioni e la barra non cambiano da una schermata all'altra.
          if (!quadroStati && (raccolto.schermo.sessioni.length || raccolto.schermo.contatori.length)) {
            quadroStati = { schermo: raccolto.schermo, contesto: contesto1 };
          }
        }

        // La cartella scelta sta nella modale «Nuova sessione»: è l'unico posto dove si legge, ed è
        // dove il ritratto ha mentito il 06/9 descrivendo `C:\` invece del progetto.
        if (!cartellaScelta) {
          superficieCorrente = 'veloNuova';
          cartellaScelta = await leggiCartellaScelta(pagina);
        }

        await cdp.detach().catch(() => {});
        await contesto.close();
        parla(`fatto: ${vp.nome} · tema ${tema.nome}`);
      }
    }
  } finally {
    await browser.close();
  }
  return { reperti, trafficoPerSuperficie, modiDiApertura, copertura, quadroStati };
}

/** Apre la modale «Nuova sessione» e legge cosa la carta DICE della cartella scelta. */
async function leggiCartellaScelta(pagina) {
  try {
    await pagina.evaluate(() => document.querySelector('#newSessionBtn')?.click());
    await aspetta(1400);
    const letto = await pagina.evaluate(() => {
      const carta = document.querySelector('[data-workspace-selected-path]');
      if (!carta) return null;
      return {
        percorsoScelto: (carta.textContent || '').trim(),
        percorsoDescritto: (carta.textContent || '').trim(),
        avviso: (document.querySelector('[data-workspace-avviso]')?.textContent || '').trim(),
        ritratto: (document.querySelector('[data-workspace-ritratto]')?.textContent || '').trim(),
      };
    });
    await pagina.keyboard.press('Escape');
    await aspetta(250);
    return letto && letto.percorsoScelto && !/nessuna cartella/i.test(letto.percorsoScelto) ? letto : null;
  } catch { return null; }
}

// ───────────────────────── 5 · il rapporto ─────────────────────────────────────────────────────

const ORDINE_GRAVITA = { alta: 0, media: 1, bassa: 2 };

function unisci(reperti) {
  const per = new Map();
  for (const r of reperti) {
    const chiave = `${r.classe}\u0000${r.dove}\u0000${r.cosa}`;
    if (!per.has(chiave)) per.set(chiave, { ...r, contesti: new Set() });
    if (r.contesto) per.get(chiave).contesti.add(r.contesto);
  }
  return [...per.values()].sort((a, b) => (ORDINE_GRAVITA[a.gravita] ?? 3) - (ORDINE_GRAVITA[b.gravita] ?? 3) || String(a.dove).localeCompare(String(b.dove)));
}

const scappa = (t) => String(t ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();

function tabella(righe) {
  if (!righe.length) return '_Nessun reperto._\n';
  const fuori = ['| dove | cosa manca | gravità | visto in |', '|---|---|---|---|'];
  for (const r of righe) {
    const dove = r.contesti && r.contesti.size ? (r.contesti.size >= 6 ? 'tutte le combinazioni' : `${r.contesti.size} combinazioni`) : '—';
    fuori.push(`| \`${scappa(r.dove)}\` | ${scappa(r.cosa)} | **${r.gravita}** | ${dove} |`);
  }
  return `${fuori.join('\n')}\n`;
}

function scriviRapporto(dati) {
  const { classi, totali, meta, copertura, modiDiApertura, stati, superfici } = dati;
  const righe = [];
  righe.push(`# Rapporto del cancello — ${meta.data}`);
  righe.push('');
  righe.push(`> Prodotto da \`harness-ui/frontend/scripts/cancello/cancello.mjs\`. Istanza propria sulla porta **${meta.porta}** (mai la 4174), store vergine, prova di proprietà superata: **0 sessioni**. Kernel: \`${meta.kernel}\`.`);
  righe.push(`> **${SCHERMATE.length} schermate** × **${VIEWPORT.length} viewport desktop** × **${TEMI.length} temi** = ${SCHERMATE.length * VIEWPORT.length * TEMI.length} giri. Rotte del server trovate: **${meta.rotte}**; chiamate del frontend trovate: **${meta.chiamate}**.`);
  righe.push('');
  righe.push('## Totali per classe');
  righe.push('');
  righe.push('| classe | alta | media | bassa | totale |');
  righe.push('|---|---:|---:|---:|---:|');
  for (const [nome, lista] of Object.entries(classi)) {
    const c = (g) => lista.filter((r) => r.gravita === g).length;
    righe.push(`| ${nome} | ${c('alta')} | ${c('media')} | ${c('bassa')} | ${lista.length} |`);
  }
  righe.push(`| **totale** | **${totali.alta}** | **${totali.media}** | **${totali.bassa}** | **${totali.tutti}** |`);
  righe.push('');

  let n = 0;
  for (const [nome, lista] of Object.entries(classi)) {
    n += 1;
    righe.push(`## ${n} · ${nome[0].toUpperCase()}${nome.slice(1)}`);
    righe.push('');
    righe.push(tabella(lista));
  }

  righe.push('## Copertura — cosa è stato guardato davvero');
  righe.push('');
  righe.push('| schermata | come è stata aperta | controlli esaminati | vivi | morti | non giudicabili |');
  righe.push('|---|---|---:|---:|---:|---:|');
  const perSchermata = new Map();
  for (const c of copertura) {
    if (!perSchermata.has(c.schermata)) perSchermata.set(c.schermata, { esaminati: 0, vivi: 0, morti: 0, ignoti: 0, giri: 0 });
    const a = perSchermata.get(c.schermata);
    a.esaminati += c.esaminati; a.vivi += c.vivi; a.morti += c.morti; a.ignoti += c.ignoti; a.giri += 1;
  }
  for (const s of SCHERMATE) {
    const a = perSchermata.get(s.id) || { esaminati: 0, vivi: 0, morti: 0, ignoti: 0, giri: 1 };
    righe.push(`| ${s.nome} | ${scappa(modiDiApertura.get(s.id) || '—')} | ${Math.round(a.esaminati / a.giri)} | ${Math.round(a.vivi / a.giri)} | ${Math.round(a.morti / a.giri)} | ${Math.round(a.ignoti / a.giri)} |`);
  }
  righe.push('');
  righe.push('> «Non giudicabili» non è un dettaglio: un rapporto che non sa dire **chi non ha guardato** può scrivere «zero morti» avendo esaminato niente.');
  righe.push('');

  righe.push('### Le regole della classe 3 che non hanno esaminato nessuna coppia');
  righe.push('');
  if (!stati) righe.push('_Nessun quadro dati↔schermo raccolto._');
  else if (!stati.mute.length) righe.push('_Nessuna: tutte le regole hanno esaminato almeno una coppia._');
  else righe.push(stati.mute.map((id) => `- \`${id}\``).join('\n'));
  if (stati?.rotte?.length) {
    righe.push('');
    righe.push(`⛔ **${stati.rotte.length} regole hanno lanciato**: il giro della classe 3 non vale finché non sono riparate.`);
  }
  if (stati?.formeImpossibili?.length) {
    righe.push('');
    righe.push(`⛔ **${stati.formeImpossibili.length} coppie hanno una forma che il server non produce mai**: un esito verde su quelle non prova niente.`);
  }
  righe.push('');

  righe.push('### Il traffico osservato, superficie per superficie');
  righe.push('');
  righe.push('| superficie | rotte chiamate mentre era aperta |');
  righe.push('|---|---|');
  for (const s of SCHERMATE) {
    const t = superfici.traffico.get(s.id);
    righe.push(`| ${s.nome} | ${t && t.size ? [...t].map((x) => `\`${x}\``).join(' · ') : '_nessuna_'} |`);
  }
  righe.push('');

  righe.push('## Cosa questo cancello NON copre');
  righe.push('');
  for (const l of LIMITI) righe.push(`- ${l}`);
  righe.push('');
  for (const l of superfici.limiti || []) righe.push(`- (classe 5) ${l}`);
  righe.push('');
  righe.push(`_Generato il ${meta.quando}._`);
  righe.push('');

  const cartella = path.join(REPO, '.claude');
  mkdirSync(cartella, { recursive: true });
  const file = path.join(cartella, `RAPPORTO-CANCELLO-${meta.data}.md`);
  writeFileSync(file, righe.join('\n'), 'utf8');
  return file;
}

// ───────────────────────── il comando ──────────────────────────────────────────────────────────

async function principale() {
  const server = await avviaServerProprio();
  let uscita = 0;
  try {
    parla('leggo i testi serviti e le rotte…');
    const testi = testiServiti();
    const rotte = rotteEsposte();
    const chiamate = chiamateDelFrontend();
    parla(`rotte del server: ${rotte.length} · chiamate del frontend: ${chiamate.length}`);

    /*
     * ⛔ I nomi tecnici arrivano dal server VIVO, non da una lista scritta qui: gli attrezzi del
     *    kernel nascono e muoiono. E si setacciano: passa solo chi porta un separatore, perché
     *    `cerca`/`leggi`/`scrivi` sono parole italiane e accuserebbero mezza interfaccia.
     */
    let nomiTecnici = [];
    try {
      const attrezzi = await chiedi(server.base, '/api/v1/tools');
      nomiTecnici = (attrezzi?.attrezzi ?? []).map((a) => String(a?.nome ?? '')).filter((n) => /[_-]/.test(n));
      parla(`nomi tecnici vietati a schermo: ${nomiTecnici.length} (su ${(attrezzi?.attrezzi ?? []).length} attrezzi)`);
    } catch (e) { parla(`⛔ elenco attrezzi non disponibile (${e.message}): la caccia ai nomi tecnici non gira`); }

    // Le chiavi VERE della mappa di navigazione e gli id dei veli VIVI: sono i valori su cui le
    // deleghe discriminano, e vanno presi dal codice servito, non ricopiati a mano qui.
    const mappa = testi.sorgenti['public/app.js'].match(/VISTA_PER_VAIA\s*=\s*(?:Object\.freeze\()?\{([^}]*)\}/);
    const vistePerVaia = {};
    for (const m of (mappa?.[1] ?? '').matchAll(/([a-zA-Z]+)\s*:\s*"([^"]+)"/g)) vistePerVaia[m[1]] = m[2];
    if (!Object.keys(vistePerVaia).length) muori('non ho saputo leggere VISTA_PER_VAIA dal bundle servito: senza i valori veri la classe 2 accuserebbe a caso');
    const veliVivi = [...testi.html['public/index.html'].matchAll(/id="(velo[A-Za-z]+)"/g)].map((m) => m[1]);
    parla(`viste per data-vaia: ${Object.keys(vistePerVaia).length} · veli vivi: ${veliVivi.length}`);

    parla('apro il browser…');
    const esito = await giro({ base: server.base, vistePerVaia, nomiTecnici, veliVivi });

    // ── classe 1, statica ──
    const rif = analizzaRiferimentiMorti(testi);
    const repertiRif = [
      ...rif.simboliMancanti.map((r) => ({ classe: 'riferimenti morti', gravita: 'alta', dove: `${r.dove} → ${r.cosa}`, cosa: r.perche })),
      ...rif.classiSenzaRegola.map((r) => ({ classe: 'riferimenti morti', gravita: 'alta', dove: `${r.dove} → ${r.cosa}`, cosa: r.perche })),
      ...rif.datiSenzaGestore.map((r) => ({ classe: 'riferimenti morti', gravita: 'media', dove: `${r.dove} → ${r.cosa}`, cosa: r.perche })),
      /*
       * ⛔ Gravità BASSA, e con un motivo: un foglio scritto come libreria di componenti ha per
       *    natura varianti non ancora usate. È debito da guardare, non una app rotta — e metterlo
       *    in «alta» farebbe fallire il cancello su una cosa che nessuno deve correre a riparare.
       */
      ...rif.regoleSenzaBersaglio.map((r) => ({ classe: 'riferimenti morti', gravita: 'bassa', dove: `${r.dove} → ${r.cosa}`, cosa: r.perche })),
    ];

    // ── classe 5, statica + traffico vero ──
    const superfici = SUPERFICI.map((s) => {
      if (s.statica || s.eventi) return s;
      const osservate = [...(esito.trafficoPerSuperficie.get(s.id) || [])];
      const dichiarate = s.chiamateDichiarate || [];
      return { ...s, chiamate: [...new Set([...osservate, ...dichiarate])] };
    });
    const contatori = (esito.quadroStati?.schermo?.contatori ?? []).map((c) => ({
      id: c.luogo || c.nome, etichetta: c.nome, vaia: c.vaia,
    }));
    const sup = analizzaSuperfici({ rotte, chiamate, superfici, contatori, eccezioni: ECCEZIONI_ROTTE });
    const repertiSup = [
      ...sup.scollegate, ...sup.rotteMorte, ...sup.chiamateOrfane, ...sup.contatori,
    ].map((r) => ({
      classe: 'superfici scollegate', gravita: r.gravita,
      dove: r.superficie || r.contatore || `${r.metodo || '*'} ${r.percorso || ''}`.trim(),
      cosa: `${r.cosa}${r.rottaCandidata ? ` (candidata: ${r.rottaCandidata})` : ''}`,
    }));

    // ── classe 3 ──
    let stati = null;
    const repertiStati = [];
    if (esito.quadroStati) {
      const schermo = esito.quadroStati.schermo;
      const datiApi = { sessioni: (await chiedi(server.base, '/api/v1/sessions').catch(() => ({ items: [] })))?.items ?? [] };
      /*
       * `luoghi` non è un dato di comodo: `esiste` è la sola cosa che separa il difetto delle
       * «Note» (un numero vivo su una pagina che non c'è) da un contatore sano. Si calcola dalla
       * mappa VERA delle viste, non da una lista scritta a mano.
       */
      datiApi.luoghi = {};
      for (const c of schermo.contatori) {
        const chiave = c.luogo || c.nome;
        datiApi.luoghi[chiave] = { esiste: Boolean(c.vaia && vistePerVaia[c.vaia]) };
      }
      if (esito.quadroStati.cartella) {
        const percorso = esito.quadroStati.cartella.percorsoScelto;
        const info = await chiedi(server.base, `/api/v1/workspace-info?path=${encodeURIComponent(percorso)}`).catch(() => null);
        if (info) {
          datiApi.cartella = { percorso, ritratto: info };
          schermo.cartella = { percorsoDescritto: esito.quadroStati.cartella.percorsoDescritto, avviso: esito.quadroStati.cartella.avviso };
        }
      }
      stati = statiBugiardi(datiApi, schermo);
      for (const b of stati.bugie) {
        repertiStati.push({ classe: 'stati che mentono', gravita: b.gravita, contesto: esito.quadroStati.contesto, dove: `${b.regola} · ${b.chiave}`, cosa: `${b.cosa} — ${b.perche}` });
      }
      for (const r of stati.rotte) {
        repertiStati.push({ classe: 'stati che mentono', gravita: 'alta', dove: `${r.regola} · ${r.chiave}`, cosa: `la regola ha LANCIATO (${r.perche}): il suo silenzio non è un via libera` });
      }
    }

    const classi = {
      'riferimenti morti': unisci(repertiRif),
      'controlli morti': unisci(esito.reperti.filter((r) => r.classe === 'controlli morti')),
      'stati che mentono': unisci(repertiStati),
      'testo grezzo': unisci(esito.reperti.filter((r) => r.classe === 'testo grezzo')),
      'superfici scollegate': unisci(repertiSup),
    };
    const tutti = Object.values(classi).flat();
    const totali = {
      alta: tutti.filter((r) => r.gravita === 'alta').length,
      media: tutti.filter((r) => r.gravita === 'media').length,
      bassa: tutti.filter((r) => r.gravita === 'bassa').length,
      tutti: tutti.length,
    };

    const file = scriviRapporto({
      classi, totali, copertura: esito.copertura, modiDiApertura: esito.modiDiApertura, stati,
      superfici: { traffico: esito.trafficoPerSuperficie, limiti: sup.limiti },
      meta: {
        data: oggi(), quando: new Date().toISOString(), porta: server.porta,
        kernel: process.env.TALOS_OWNER_RUNTIME_MODULE || KERNEL_PREDEFINITO,
        rotte: rotte.length, chiamate: chiamate.length,
      },
    });

    parla(`rapporto: ${file}`);
    parla(`alta ${totali.alta} · media ${totali.media} · bassa ${totali.bassa} · totale ${totali.tutti}`);
    uscita = totali.alta > 0 ? 1 : 0;
  } finally {
    server.ferma();
  }
  process.exit(uscita);
}

principale().catch((errore) => {
  console.error('[cancello] il giro non è arrivato in fondo:', errore?.stack || errore);
  process.exit(2);
});
