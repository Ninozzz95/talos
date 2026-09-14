import { validaFallbackProviders } from './model-destination.mjs';
import { cacheSessioneDaEventi, giriFermatiDaEventi } from './usage-cache.mjs';
import { contextUsageFromEvents } from '../../context-engine/src/usage.mjs';

/**
 * session-registry.mjs — le sessioni Harness UI vive in memoria: chi le ha
 * avviate, il buffer dei loro eventi AG-UI, e come fermarle. Piano
 * `elegant-spinning-dongarra.md`, FASE 1 (§1.2/§1.4).
 *
 * ⭐⭐⭐ FASE L (30/8): la persistenza SU DISCO ora esiste — vedi
 * `cartellaStore`/`session-store.mjs`/`ripristina()` più sotto. Questo
 * commento diceva "solo in memoria... non ancora aperto" fin dalla prima
 * riga del file: era la prova stessa, letta alla lettera, che ha aperto
 * la fase (owner: "un riavvio perde una sessione in corso, è mai
 * capitato?"). ⛔ Resta vero il limite dichiarato lì: solo lo stato
 * catturato all'avvio di una sessione sopravvive — rename, permessi
 * cambiati a sessione già avviata, e la coda messaggi NON sopravvivono a
 * un riavvio (vedi la doc di `ripristina()`).
 *
 * ⛔ Le cartelle usa-e-getta che `task-catalog.preparaEsecuzione` crea NON
 * vengono ripulite automaticamente da questo file: l'owner potrebbe voler
 * ispezionare cosa l'agente ha scritto dopo che la sessione finisce, quindi
 * una pulizia automatica cancellerebbe proprio il motivo per cui si guarda
 * una sessione dal vivo. La pulizia esplicita (un endpoint "chiudi" dedicato)
 * resta lavoro futuro, non dimenticato: `mkdtemp` garantisce nomi unici, quindi
 * l'accumulo è un costo di spazio disco, non un difetto di correttezza.
 */
import { randomUUID } from 'node:crypto';
import { parse as parsePath } from 'node:path';
import { fileURLToPath } from 'node:url';

import { segnalaFileCambiati } from './contesto-del-progetto.mjs'; // P-13 (10/09): l'elenco si rifà quando i file cambiano davvero
import {
  avviaSessione as avviaSessioneReale,
  compattaSessione as compattaSessioneReale,
  eseguiComandoDiretto as eseguiComandoDirettoReale,
  // ⭐ L5 (12/09): la lettura di una pagina per la ri-verifica nel tempo — la STESSA di `naviga`, mai una seconda.
  leggiPaginaPerLaVista,
  // ⭐ L9 (12/09): una domanda sola a un modello, senza attrezzi — è come si interpella il GIUDICE.
  chiediAlModelloUnaVolta as chiediAlModelloUnaVoltaReale,
} from './agent-service.mjs';
import {
  approvalRequested, approvalResolved, hookInvoked, queuedMessageDelivered, workspaceChanged, contextEngineEvent,
  runRedirectApplied, runRedirectCancelled, runRedirectFailed, runRedirectRequested,
  runStarted, runFinished, runError, textMessageStart, textMessageContent, textMessageEnd,
  reasoningMessageStart, reasoningMessageContent, reasoningMessageEnd, toolCallStart, toolCallArgs,
} from './agui-events.mjs';
import { CustomTaskError, preparaEsecuzioneLibera as preparaEsecuzioneLiberaReale } from './custom-task.mjs';
import { imageMessageContent } from './chat-image-attachments.mjs';
import { TaskCatalogError, preparaEsecuzione as preparaEsecuzioneReale } from './task-catalog.mjs';
import { leggiAlberoWorkspace as leggiAlberoWorkspaceReale, WorkspaceTreeError } from './workspace-tree.mjs';
import {
  copiaFile as copiaFileReale,
  creaVoceWorkspace as creaVoceWorkspaceReale,
  eliminaFile as eliminaFileReale,
  leggiContenutoFile as leggiContenutoFileReale,
  leggiFilePerScarico as leggiFilePerScaricoReale,
  rinominaFile as rinominaFileReale,
  rivelaInEsploraFile as rivelaInEsploraFileReale,
  apriFileConProgrammaPredefinito as apriFileConProgrammaPredefinitoReale,
  apriInEsploraFile as apriInEsploraFileReale,
  spostaFile as spostaFileReale,
  WorkspaceFileError,
} from './workspace-files.mjs';
import { guardaWorkspace as guardaWorkspaceReale } from './workspace-watcher.mjs';
import { analizzaEvidenzaDelega, compitoDaPromptDiDelega, creaSubagentOrchestrator, esisteCartella, esitoDelegaDaEventi } from './subagent-orchestrator.mjs';
import {
  caricaHooks as caricaHooksReale,
  eseguiHook as eseguiHookReale,
  fidaHook as fidaHookReale,
  HookRegistryError,
  verificaTrust as verificaTrustReale,
} from './hook-registry.mjs';
import {
  caricaServerMcp as caricaServerMcpReale,
  fidaServerMcp as fidaServerMcpReale,
  McpRegistryError,
  verificaTrustMcp as verificaTrustMcpReale,
} from './mcp-registry.mjs';
import { caricaSkill as caricaSkillReale, SkillRegistryError } from './skill-registry.mjs';
import { ATTREZZI_CON_PERMESSO_PER_ATTREZZO } from './config.mjs';
import { ePercorsoDiControllo } from './path-policy.mjs';
import {
  elencaVoci as elencaVociReale, leggiVoce as leggiVoceLibreriaReale, salvaVoce as salvaVoceLibreriaReale,
  eliminaVoce as eliminaVoceLibreriaReale, LibraryStoreError,
  /* ⭐⭐⭐⭐ 10/09/2026 — il CRUD della Libreria per la PERSONA (finora ce l'aveva solo il modello):
     i byte per lo scarico, la rinomina, la provenienza (per sapere se una voce esiste senza
     leggerne il contenuto) e il percorso del file dentro il progetto per «mostrala nella cartella». */
  leggiBytesVoce as leggiBytesVoceLibreriaReale, rinominaVoce as rinominaVoceLibreriaReale,
  origineVoce as origineVoceLibreriaReale, percorsoContenutoVoce,
} from './library-store.mjs';
import { elencaNote as elencaNoteReale, NoteStoreError } from './notes-store.mjs';
import { elencaAttivita as elencaAttivitaReale, TaskStoreError } from './tasks-store.mjs';
import { elencaMemorie as elencaMemorieReale, MemoryStoreError } from './memory-store.mjs';
import {
  creaRicerca as creaRicercaReale, leggiRicerca as leggiRicercaReale, aggiornaRicerca as aggiornaRicercaReale,
  eliminaRicerca as eliminaRicercaReale, elencaRicerche as elencaRicercheReale,
  // ⭐ L2 (11/09) — il lettore del rapporto depositato da `research_deposit`.
  leggiRapporto as leggiRapportoReale, ResearchStoreError,
  // ⭐ L4 (11/09) — il giornale su disco, il piano, le fonti tenute e l'istantanea della cache.
  accodaEvento as accodaEventoReale, leggiGiornale as leggiGiornaleReale,
  leggiPiano as leggiPianoReale, statRapporto as statRapportoReale,
  elencaFonti as elencaFontiReale,
  leggiIstantaneaCache as leggiIstantaneaCacheReale, scriviIstantaneaCache as scriviIstantaneaCacheReale,
  // ⭐ L9 (12/09) — il piano su disco, il testo TENUTO delle fonti e l'indice url → ref.
  scriviPiano as scriviPianoReale, scriviFonte as scriviFonteReale, leggiFonte as leggiFonteReale,
  scriviIndiceFonti as scriviIndiceFontiReale, leggiIndiceFonti as leggiIndiceFontiReale,
} from './research-store.mjs';
import { creaResearchOrchestrator } from './research-orchestrator.mjs';
import {
  elencaToolForgiati as elencaToolForgiatiReale, abilitaToolForgiato as abilitaToolForgiatoReale, ToolForgeStoreError,
} from './tool-forge-store.mjs';
import {
  caricaPlugin as caricaPluginReale,
  fidaPlugin as fidaPluginReale,
  PluginRegistryError,
  scansionaPatternSospetti,
  verificaTrustPlugin as verificaTrustPluginReale,
} from './plugin-registry.mjs';
import {
  elencaSessioniPersistite as elencaSessioniPersistiteReale,
  eliminaSessionePersistita as eliminaSessionePersistitaReale,
  leggiRegistro as leggiRegistroReale,
  registraRiga as registraRigaReale,
  registraRigaSync as registraRigaSyncReale,
} from './session-store.mjs';

export const EXPORT_SCHEMA = 'talos.harness-ui.session-export.v1';
/*
 * ⭐⭐⭐ 04/9 — W0-02 (D32): la versione di schema del registro JSONL,
 * scritta in ogni `intestazione` nuova. Si alza SOLO quando un record cambia
 * forma in modo non retrocompatibile; le migrazioni si scrivono in
 * `ripristina()`, per versione. Un'intestazione senza `schema` è la versione
 * 0 (i file di prima) e si ripristina come sempre; una con `schema` maggiore
 * di questo numero viene da un TALOS più nuovo e si scarta con motivo
 * `schema-futuro` — mai letta a metà fingendo di capirla.
 */
export const SCHEMA_SESSIONE = 1;

class LocalRuntimeSessionError extends Error {
  constructor(message, code = 'LOCAL_RUNTIME_FAILED') {
    super(message);
    this.name = 'LocalRuntimeSessionError';
    this.code = code;
  }
}

/* =====================================================================
 * ⭐⭐⭐ W1-02 (04/9) — PROCESS LEDGER + GUARDIA DI STALLO.
 *
 * Due funzioni PURE sopra gli eventi già persistiti, sorelle di
 * `usageDaEventi` (dentro `createSessionRegistry`): stessa disciplina —
 * ⛔ NESSUNA scrittura nuova sul disco. Tutto ciò che serve è già nella
 * storia della sessione (`ToolCallStart`/`Args`/`Result`, `RunStarted`,
 * `ApprovalRequested`/`Resolved`); un secondo registro mutabile
 * duplicherebbe una fonte di verità che esiste già.
 *
 * Sono esportate al livello del MODULO, non chiuse nella closure come
 * `usageDaEventi`, per una ragione sola: essere provabili da sole, senza
 * accendere un registro intero e una sessione finta.
 *
 * ## Ricerca del 04/09 (obbligo dell'owner: cercare PRIMA di decidere)
 *
 *  - Un watchdog basato solo sull'esistenza del processo, non sui pattern
 *    comportamentali, non basta da solo: segnalare quando lo stesso attrezzo
 *    con gli stessi argomenti compare «> N times in the last M calls
 *    (suggested N=10, M=20)», prima osservativo poi kill oltre il doppio
 *    della soglia.
 *  - N chiamate identiche di fila (e.g. 3-5) ⇒ iniettare un messaggio, mai
 *    abortire.
 *  - «doom loop» = 3 chiamate identiche consecutive; in CLI si chiede
 *    all'owner, non si uccide.
 *  - Documentazione di uno strumento simile (letta 04/09): la risposta di
 *    un attrezzo porta sempre `status` (success/error/timeout/interrupted),
 *    `duration_seconds` e, per un'uscita diversa da zero, `[exit 1]` in testa
 *    — l'esito si vede senza aspettare che il modello lo racconti.
 *  - **bitwarden/agent-access#139**: un prompt di approvazione senza TTL e
 *    senza ANZIANITÀ desincronizza tutta la coda ⇒ «show request age».
 *  - **gitkraken/vscode-gitlens#5230**: la risposta a un permesso si perde
 *    dopo ~15 minuti di attesa e l'agente resta fermo per sempre.
 *
 * ## Dove andiamo OLTRE, e con quale numero
 *
 * ⛔ N=10 su M=20 non potrebbe scattare MAI qui. Misurato il 04/09 sui file
 * di sessione veri di questo store: una sessione che esaurisce i giri fa
 * **33 chiamate in tutto** (8 le altre), e le ripetizioni identiche sono
 * **65 su 634 (10,3%)** — `elenca` 37%, `leggi` 18%, `cerca` 12%, `shell`
 * 1%. Con quella soglia il ciclo finirebbe i 24 giri prima che la guardia
 * apra bocca. ⇒ le nostre soglie sono **N=3 su M=10**, e sono PARAMETRI
 * (`SOGLIE_STALLO_PREDEFINITE`, sovrascrivibili per chiamata), non numeri
 * scritti dentro la logica.
 *
 * Secondo scarto dalla ricerca, deliberato: `giro-a-vuoto` richiede anche
 * che l'ESITO non sia cambiato (result-aware). Tre `prova` di fila che
 * tornano `3 falliti → 2 falliti → tutto verde` sono progresso, non stallo.
 *
 * ⛔⛔⛔ E la guardia è **osservativa**: `interviene:false`, sempre. Uccidere
 * un processo è una decisione dell'owner — regola nata da un incidente vero
 * (23/8: la sorveglianza gridava «3 ORFANI» e uno era una sessione di
 * sviluppo dell'owner, viva). Per lo stesso motivo ogni segnalazione porta **CHI**
 * (comando, toolCallId, requestId) e **da quanto**, mai solo un conteggio.
 * ===================================================================== */

/**
 * Le soglie della guardia. ⛔ Un default in UN posto solo, mai un numero
 * ripetuto dentro la logica: chi vuole tararle passa `soglie` alla chiamata.
 */
export const SOGLIE_STALLO_PREDEFINITE = Object.freeze({
  /*
   * 60 s. La ricerca del 04/09 riporta due riferimenti: uno stallo di stream
   * si riconosce con «30-60 secondi di silenzio totale», mentre il watchdog
   * di inattività degli stream OpenAI-compatibili sta a 300 s. Prendiamo il
   * valore basso PERCHÉ non uccidiamo niente: il costo di una segnalazione
   * di troppo è una riga in più, quello di un timeout di troppo sarebbe un
   * lavoro pagato buttato.
   */
  silenzioMs: 60_000,
  /** N — quante chiamate identiche fanno un giro a vuoto (soglia trovata in ricerca: 3). */
  ripetizioniPerAllarme: 3,
  /** M — la finestra scorrevole entro cui contarle (ricerca: una finestra, non «di fila»). */
  finestraChiamate: 10,
});

/**
 * Gli attrezzi che lanciano DAVVERO un processo del sistema operativo.
 * ⛔ Letto nel kernel, non indovinato: `shell` chiama `eseguiComandoSandboxato`
 * e `prova` chiama `eseguiProva` (talosHarness.mjs) — sono gli unici due.
 * `scrivi`, `leggi`, `elenca`, `cerca` non lanciano niente.
 */
export const ATTREZZI_CHE_LANCIANO_PROCESSI = Object.freeze(['shell', 'prova']);

/*
 * ⭐⭐⭐ D-10S (11/09) — QUANTO DI UN COMANDO `!` ENTRA NELLA CONVERSAZIONE.
 *
 * Un `!npm test` può stampare centinaia di KB. Il tetto non è un'opinione sullo stile: è ciò che
 * separa «il modello ha letto l'uscita» da «il prefisso di ogni giro successivo porta per sempre
 * mezzo megabyte». Il costo si paga a OGNI chiamata del giro, non una volta — il 93% della spesa
 * di un giro è rileggere il prefisso ([[la-cache-vale-sei-volte-e-non-la-contavamo]], 22/08).
 *
 * ⛔ 8.000 caratteri ≈ 2.000 token: la coda di un `npm test` (dove stanno i fallimenti) ci sta
 *   comoda, un log di build no. E quando si taglia LO SI DICE, col totale vero: un modello che
 *   legge un'uscita monca senza saperlo conclude sul niente — ed è il difetto peggiore che questo
 *   banco abbia misurato ([[un-modello-che-non-vede-non-tace-spiega]]).
 *
 * ⭐ Si tiene TESTA E CODA, elidendo il mezzo. Non è simmetria estetica: la testa di un log porta
 *   la configurazione (quale comando, quale cartella, quale versione) e la coda porta l'esito.
 *   Il mezzo di un `npm test` sono le righe verdi. Ricerca 11/09/2026: è il consenso dichiarato
 *   per gli harness del 2026 — Codex tronca «preserving the beginning and end of output while
 *   eliding the middle», e un tetto di ~8.000 caratteri per chiamata è la cifra citata come quella
 *   che «può risparmiare più token di ogni altra modifica messa insieme» (apidog, WaveSpeed,
 *   AgentPatterns «Unix CLI as the Native Tool Interface for AI Agents»).
 *
 * ⛔⛔ IL PREZZO, dichiarato perché è vero: Hermes Agent fa deliberatamente l'OPPOSTO — col suo `!`
 *   «nothing enters the conversation … so your context stays clean and the prompt cache is
 *   untouched» (docs Hermes, letti l'11/09). Ha ragione sul meccanismo: toccare la cronologia tocca
 *   la cache, e la cache vale SEI VOLTE ([[la-cache-vale-sei-volte-e-non-la-contavamo]]).
 *   ⇒ Per questo il racconto si APPENDE IN CODA e mai in mezzo: il prefisso già in cache resta
 *   identico, e si paga solo la parte nuova. Owner 11/09: «esattamente come Claude» — la scelta è
 *   sua e consapevole, non un effetto collaterale.
 */
export const TETTO_RACCONTO_COMANDO = 8_000;

/**
 * Il comando e la sua uscita, nella forma che il modello legge.
 *
 * I nomi dei tag sono quelli di Claude Code (`<bash-input>`, `<bash-stdout>`), verificati l'11/09
 * sui trascritti sul disco: sono la forma su cui i modelli sono già addestrati, e questo è un
 * contratto col modello, non testo da mostrare a una persona.
 */
export const TESTA_RACCONTO_COMANDO = 2_000;

export function raccontoDelComando({ comando, codice, testo }) {
  const uscita = String(testo ?? '');
  if (uscita.length === 0) {
    return `<bash-input>${String(comando ?? '')}</bash-input>\n`
      + '<bash-stdout>(nessuna uscita)</bash-stdout>\n'
      + `<bash-exit>${codice ?? '?'}</bash-exit>`;
  }
  let mostrata = uscita;
  if (uscita.length > TETTO_RACCONTO_COMANDO) {
    const coda = TETTO_RACCONTO_COMANDO - TESTA_RACCONTO_COMANDO;
    const tolti = uscita.length - TETTO_RACCONTO_COMANDO;
    mostrata = `${uscita.slice(0, TESTA_RACCONTO_COMANDO)}\n`
      + `\n[⛔ tolti ${tolti} caratteri dal MEZZO — l'uscita intera è ${uscita.length} caratteri]\n\n`
      + uscita.slice(uscita.length - coda);
  }
  return `<bash-input>${String(comando ?? '')}</bash-input>\n`
    + `<bash-stdout>${mostrata}</bash-stdout>\n`
    + `<bash-exit>${codice ?? '?'}</bash-exit>`;
}

const MOTIVO_SENZA_ISTANTI = 'nessun istante osservato: gli eventi persistiti non portano un orario, quindi il tempo si conosce solo per una sessione seguita dal vivo da questo processo';
const MOTIVO_ANCORA_IN_CORSO = 'il processo non ha ancora riportato un esito: la durata finale non esiste ancora';
const MOTIVO_FINE_NON_OSSERVATA = 'l\'esito è arrivato senza che il suo istante fosse osservato (sessione ripresa a metà)';
const MOTIVO_COMANDO_PROVA = 'l\'attrezzo `prova` esegue il comando di prova della sessione, che non viaggia negli argomenti della chiamata';
const MOTIVO_ARGOMENTI_ROTTI = 'gli argomenti della chiamata non si sono ricomposti in JSON valido';

/**
 * ⛔ L'ordine dell'array NON è l'ordine degli eventi. Sul disco succede
 * davvero: nel file `.sessions-store/ce764e5e…` le righe 28-30 portano
 * `_sequenza` 28, 27, 29 — la coda di append serializza le scritture ma non
 * l'ordine in cui arrivano. Unire i frammenti nell'ordine dell'array
 * produrrebbe un comando SBAGLIATO ma plausibile, il peggiore dei difetti.
 * Stessa guardia già usata da `ripristina()`: si riordina solo se OGNI
 * evento ha un `_sequenza` valido, altrimenti si tiene l'ordine dato.
 */
function eventiInOrdine(eventi) {
  if (!Array.isArray(eventi)) return [];
  return eventi.every((evento) => Number.isSafeInteger(evento?._sequenza))
    ? [...eventi].sort((a, b) => a._sequenza - b._sequenza)
    : eventi;
}

/** Legge un istante di arrivo da una Map (o da un oggetto semplice). `null` quando non c'è. */
function creaLettoreIstanti(istanti) {
  if (istanti instanceof Map) {
    return (sequenza) => {
      const valore = istanti.get(sequenza);
      return Number.isFinite(valore) ? valore : null;
    };
  }
  if (istanti && typeof istanti === 'object') {
    return (sequenza) => {
      const valore = istanti[sequenza];
      return Number.isFinite(valore) ? valore : null;
    };
  }
  return () => null;
}

/** Riscrive un valore con le chiavi degli oggetti in ordine: `{a,b}` e `{b,a}` sono gli STESSI argomenti. */
function stabile(valore) {
  if (Array.isArray(valore)) return valore.map(stabile);
  if (valore && typeof valore === 'object') {
    const fuori = {};
    for (const chiave of Object.keys(valore).sort()) fuori[chiave] = stabile(valore[chiave]);
    return fuori;
  }
  return valore;
}

/**
 * Ricompone le tool-call dagli eventi grezzi.
 *
 * ⛔⛔ I due casi che rendono questa funzione necessaria, entrambi VERI nei
 * file di sessione: (1) gli argomenti arrivano in più `ToolCallArgs` da
 * concatenare — e due chiamate dello stesso giro si INTRECCIANO, quindi la
 * concatenazione è per `toolCallId`, mai globale; (2) un `ToolCallArgs` può
 * comparire PRIMA del suo `ToolCallStart`, quindi il record si crea al primo
 * evento che nomina l'id, non solo allo Start.
 */
function chiamateDaEventi(eventi) {
  const ordinati = eventiInOrdine(eventi);
  const perId = new Map();
  let origineCorrente = 'agente';
  let visti = 0;

  const daiOCrea = (toolCallId) => {
    let chiamata = perId.get(toolCallId);
    if (!chiamata) {
      visti += 1;
      chiamata = {
        toolCallId,
        nome: null,
        frammenti: [],
        contenuto: null,
        sequenzaInizio: null,
        sequenzaFine: null,
        sequenzaUltimoEvento: null,
        origine: origineCorrente,
        ordine: visti,
        runConclusoDopo: null,
      };
      perId.set(toolCallId, chiamata);
    }
    return chiamata;
  };

  let runAperto = false;
  let ultimaSequenza = null;
  let ultimoTipo = null;
  const approvazioni = new Map();

  for (const evento of ordinati) {
    const tipo = evento?.type;
    if (Number.isSafeInteger(evento?._sequenza)) ultimaSequenza = evento._sequenza;
    if (typeof tipo === 'string') ultimoTipo = tipo;

    if (tipo === 'RunStarted') {
      // ⛔ `input.comandoDiretto` è il campo che `eseguiComandoDiretto` mette
      // nel RunStarted del `!comando` del composer (agent-service.mjs): è
      // l'UNICA differenza fra «l'agente ha scelto» e «l'owner ha digitato».
      origineCorrente = typeof evento.input?.comandoDiretto === 'string' ? 'comando-diretto' : 'agente';
      runAperto = true;
      continue;
    }
    if (tipo === 'RunFinished' || tipo === 'RunError') {
      runAperto = false;
      for (const chiamata of perId.values()) {
        if (chiamata.contenuto === null && chiamata.runConclusoDopo === null) chiamata.runConclusoDopo = tipo;
      }
      continue;
    }
    if (tipo === 'ApprovalRequested' && typeof evento.requestId === 'string') {
      approvazioni.set(evento.requestId, { requestId: evento.requestId, azione: evento.azione ?? null, sequenza: evento._sequenza ?? null });
      continue;
    }
    if (tipo === 'ApprovalResolved' && typeof evento.requestId === 'string') {
      approvazioni.delete(evento.requestId);
      continue;
    }

    if (typeof evento?.toolCallId !== 'string' || evento.toolCallId === '') continue;
    const chiamata = daiOCrea(evento.toolCallId);
    if (Number.isSafeInteger(evento._sequenza)) chiamata.sequenzaUltimoEvento = evento._sequenza;
    if (tipo === 'ToolCallStart') {
      if (typeof evento.toolCallName === 'string') chiamata.nome = evento.toolCallName;
      if (Number.isSafeInteger(evento._sequenza)) chiamata.sequenzaInizio = evento._sequenza;
      chiamata.origine = origineCorrente;
    } else if (tipo === 'ToolCallArgs') {
      if (typeof evento.delta === 'string') chiamata.frammenti.push(evento.delta);
    } else if (tipo === 'ToolCallResult') {
      chiamata.contenuto = typeof evento.content === 'string' ? evento.content : String(evento.content ?? '');
      if (Number.isSafeInteger(evento._sequenza)) chiamata.sequenzaFine = evento._sequenza;
    }
  }

  const chiamate = [...perId.values()].sort((a, b) => {
    const ca = a.sequenzaInizio ?? a.sequenzaUltimoEvento;
    const cb = b.sequenzaInizio ?? b.sequenzaUltimoEvento;
    if (Number.isSafeInteger(ca) && Number.isSafeInteger(cb) && ca !== cb) return ca - cb;
    return a.ordine - b.ordine;
  });

  for (const chiamata of chiamate) {
    chiamata.argomentiGrezzi = chiamata.frammenti.join('');
    const testo = chiamata.argomentiGrezzi.trim();
    if (testo === '') {
      chiamata.argomenti = null;
      chiamata.argomentiRicomposti = true; // niente da ricomporre non è un fallimento
    } else {
      try {
        chiamata.argomenti = JSON.parse(testo);
        chiamata.argomentiRicomposti = true;
      } catch {
        chiamata.argomenti = null;
        chiamata.argomentiRicomposti = false;
      }
    }
    chiamata.impronta = `${chiamata.nome ?? '?'}\u0000${chiamata.argomentiRicomposti && chiamata.argomenti !== null ? JSON.stringify(stabile(chiamata.argomenti)) : testo}`;
  }

  return { ordinati, chiamate, runAperto, ultimaSequenza, ultimoTipo, approvazioniPendenti: [...approvazioni.values()] };
}

/** Il comando che una chiamata sta eseguendo, e — se non c'è — PERCHÉ non c'è. */
function comandoDellaChiamata(chiamata) {
  if (chiamata.nome === 'prova') return { comando: null, motivo: MOTIVO_COMANDO_PROVA };
  if (!chiamata.argomentiRicomposti) return { comando: null, motivo: MOTIVO_ARGOMENTI_ROTTI };
  const comando = chiamata.argomenti?.comando;
  if (typeof comando === 'string' && comando !== '') return { comando, motivo: null };
  return { comando: null, motivo: `la chiamata a \`${chiamata.nome ?? '?'}\` non porta un campo \`comando\`` };
}

/**
 * L'esito di un processo, letto dalla stringa che il kernel già costruisce:
 * `exit <codice> [sandbox: <livello>]\n<testo>` per `shell`, `exit <codice>\n…`
 * per `prova`, `REFUSED. …` quando il cancello dei permessi ha detto no.
 * ⛔ Un rifiuto NON ha un codice d'uscita: `null`, mai uno zero inventato.
 */
function esitoDelProcesso(chiamata) {
  if (chiamata.contenuto === null) {
    if (chiamata.runConclusoDopo === 'RunError') return { esito: 'interrotto', codiceUscita: null, sandbox: null };
    if (chiamata.runConclusoDopo === 'RunFinished') return { esito: 'senza-esito', codiceUscita: null, sandbox: null };
    return { esito: 'in-corso', codiceUscita: null, sandbox: null };
  }
  if (chiamata.contenuto.startsWith('REFUSED.')) return { esito: 'rifiutato', codiceUscita: null, sandbox: null };
  const trovato = /^exit (-?\d+)(?: \[sandbox: ([^\]]*)\])?/.exec(chiamata.contenuto);
  if (trovato) return { esito: 'concluso', codiceUscita: Number(trovato[1]), sandbox: trovato[2] ?? null };
  return { esito: 'concluso', codiceUscita: null, sandbox: null };
}

/**
 * ⭐⭐⭐ IL PROCESS LEDGER — l'elenco dei processi che questa sessione ha
 * lanciato, ricostruito dai SOLI eventi già persistiti.
 *
 * `istanti` è una mappa `_sequenza → epoch ms` tenuta IN MEMORIA da
 * `broadcast` (mai su disco: vedi il commento lì). Senza di essa — cioè per
 * una sessione ripristinata dopo un riavvio — inizio e durata sono `null` e
 * il perché è DETTO in `motivoTempoAssente`: ⛔ mai uno zero al posto di un
 * dato che non c'è.
 *
 * @returns {{registrato:boolean, processi:Array<object>|null, motivo:string|null}}
 *   `registrato:false` + `processi:null` quando non c'è NIENTE da leggere —
 *   che è un fatto diverso da «nessun processo» (`registrato:true`, `[]`).
 */
/**
 * Il nome corto di una delega: la prima riga non vuota, al massimo 80 caratteri.
 * ⛔ Stessa regola con cui il ripristino ricava il `nome` di un compito libero — una sola forma per
 *   «come si chiama a schermo un compito», invece di due che divergono.
 */
/*
 * ⛔⛔⛔ D3 — DUE FIGLIE CHE SCRIVONO LO STESSO FILE, E NESSUNO LO DICE. Owner 09/09/2026: via A
 * approvata, via C (un worktree per figlia) approvata per più avanti.
 *
 * Il fatto, misurato in questo codice: `LIMITE_FIGLI_CONCORRENTI = 10` figlie possono lavorare insieme
 * NELLA STESSA CARTELLA della madre (la cura `cartellaGiaScelta`, provata dal vivo l'08/09), e non
 * esiste nessun lucchetto sui file. Se due toccano lo stesso percorso, l'ultima che salva vince e il
 * lavoro dell'altra sparisce: non è un conflitto git, non è un errore, ed entrambe riferiscono «fatto».
 *
 * COME FANNO I TRE, letto nel loro codice il 10/09/2026 (cloni a commit fissato):
 *  · Hermes Agent v0.21 — `tools/file_state.py`, docstring: «Cross-agent file state coordination.
 *    Prevents mangled edits when concurrent subagents (same process, same filesystem) touch the same
 *    file»: un `threading.Lock` PER PERCORSO attorno al read→modify→write, preso in ordine
 *    deterministico per non incastrarsi su patch multi-file; più uno scheduler che serializza i tool
 *    di scrittura con percorsi sovrapposti, e un promemoria al padre — «[NOTE: subagent modified files
 *    the parent previously read — re-read before editing: …]». Il worktree per figlia esiste ma è
 *    opt-in, default `false`.
 *  · Claude Code — nessun lucchetto per file (cercato: file lock, same file, concurrent write, lease,
 *    mutex: zero). La difesa è spaziale (`isolation: "worktree"`, un checkout per sotto-agente) più
 *    l'ancoraggio testuale di `Edit`, che fallisce se il punto è già cambiato. Tetto: 20 concorrenti.
 *  · Codex — nessun lucchetto sui file di lavoro; `apply_patch` prende il write lock esclusivo del
 *    turno, ma è per-processo. Tetto: 4 agenti per sessione.
 *
 * ⇒ QUI, OGGI: il lucchetto vero andrebbe messo PRIMA della scrittura, e quel cancello vive nel
 *   kernel (`talosHarness.mjs`), che in questo repo è una COPIA: la fonte è nel worktree dell'owner e
 *   portarla è un suo gesto (`scripts/kernel-controlla.mjs`). Ciò che è nostro è il momento DOPO: qui
 *   passa ogni evento di ogni sessione, e la voce sa chi è figlia di chi.
 *   Non possiamo ancora impedire la collisione; possiamo togliere il SILENZIO, che è il danno vero.
 *   Chi legge la scheda «Agenti» vede che due deleghe hanno scritto lo stesso file, e in che ordine.
 */
const PERCORSO_SCRITTURA = /^\/file\/(.+)$/;

/** Il percorso scritto da un evento, o `null` se l'evento non è una scrittura. Puro. */
export function percorsoScrittoDaEvento(evento) {
  if (evento?.type !== 'StateDelta' || !Array.isArray(evento.delta)) return null;
  for (const d of evento.delta) {
    const m = PERCORSO_SCRITTURA.exec(String(d?.path ?? ''));
    if (m) return m[1];
  }
  return null;
}

/**
 * Le scritture che DUE figlie diverse della stessa madre hanno fatto sullo stesso percorso.
 * `scrittePerMadre`: Map madreId → Map percorso → [{ figliaId, quando }].
 * @returns {{percorso:string, prima:string, poi:string}|null} la collisione appena avvenuta, se c'è
 */
export function registraScritturaDiFiglia(scrittePerMadre, { madreId, figliaId, percorso, quando }) {
  if (!madreId || !figliaId || !percorso) return null;
  if (!scrittePerMadre.has(madreId)) scrittePerMadre.set(madreId, new Map());
  const perPercorso = scrittePerMadre.get(madreId);
  const gia = perPercorso.get(percorso) ?? [];
  /*
   * ⛔ Una figlia che riscrive un file suo NON è una collisione: è il lavoro normale (leggi, cambia,
   *   riscrivi, magari tre volte). La collisione è fra figlie DIVERSE, ed è l'unica cosa che si dice —
   *   un allarme che scatta anche quando va tutto bene insegna a ignorarlo.
   */
  const altra = gia.find((v) => v.figliaId !== figliaId);
  perPercorso.set(percorso, [...gia, { figliaId, quando }]);
  return altra ? { percorso, prima: altra.figliaId, poi: figliaId } : null;
}

/**
 * ⛔⛔⛔ BC-03 (11/09/2026) — LA COLLISIONE NON SOPRAVVIVEVA A UN RIAVVIO, e la scheda «Agenti»
 * taceva proprio quando serviva di più: riaprendo la sessione il giorno dopo.
 *
 * Misurato prima della cura, su uno store isolato con due figlie che scrivono ENTRAMBE
 * `condiviso.md`: a server appena riavviato `GET /api/v1/sessions/<madre>/children` rispondeva
 * `"collisioni":[]` per tutte e due. La cura del 10/09 (D3) registra la collisione dentro
 * `broadcast()`, cioè MENTRE l'evento passa: dopo un riavvio nessun evento passa più — gli eventi
 * sono già sul disco — e la mappa `scrittureDelleFiglie` riparte vuota.
 * ⇒ Un avviso che c'è solo finché il processo è vivo non è un avviso: è un caso fortunato.
 *
 * Qui le scritture persistite delle figlie RIPRISTINATE si rigiocano nella stessa mappa che usa
 * `broadcast()`, così valgono due cose insieme: le collisioni di ieri tornano nella scheda, e una
 * scrittura fatta DOPO il riavvio collide con una fatta PRIMA.
 *
 * ⛔ L'ordine non è inventato: gli eventi AG-UI persistiti non portano un istante (verificato in
 *   `agui-events.mjs`: solo l'evento di contesto ha `timestamp`), e `_sequenza` è per sessione, non
 *   globale. Si ordina per `avviataAlle` della figlia e poi per `_sequenza` — cioè «ha cominciato
 *   prima» — e si dichiara: è un ordine fra SORELLE, non un orologio. Chi legge la scheda vede
 *   comunque il nome del file, che è la cosa azionabile.
 * ⛔ Solo le figlie `ripristinata:true`: una sessione viva ha già passato le sue scritture da
 *   `broadcast()`, e rigiocarle qui significherebbe contare due volte la stessa collisione.
 *
 * @returns {number} quante collisioni sono state ricostruite (0 è il caso normale).
 */
export function ricostruisciCollisioniDiScrittura(sessioni, scrittePerMadre) {
  const scritture = [];
  for (const [figliaId, voce] of sessioni.entries()) {
    if (!voce?.padreId || voce.ripristinata !== true || voce.collisioniRicostruite === true) continue;
    if (!sessioni.has(voce.padreId)) continue; // senza la madre non c'è nessuna sorella con cui collidere
    voce.collisioniRicostruite = true;
    for (const evento of Array.isArray(voce.eventi) ? voce.eventi : []) {
      const percorso = percorsoScrittoDaEvento(evento);
      if (!percorso) continue;
      scritture.push({
        madreId: voce.padreId, figliaId, percorso,
        quando: voce.avviataAlle ?? null,
        ordine: Number.isSafeInteger(evento._sequenza) ? evento._sequenza : 0,
      });
    }
  }
  scritture.sort((a, b) => String(a.quando ?? '').localeCompare(String(b.quando ?? '')) || a.ordine - b.ordine);
  let ricostruite = 0;
  for (const scrittura of scritture) {
    const collisione = registraScritturaDiFiglia(scrittePerMadre, scrittura);
    if (!collisione) continue;
    const madre = sessioni.get(scrittura.madreId);
    if (!madre) continue;
    (madre.collisioniDiScrittura ??= []).push(collisione);
    ricostruite += 1;
  }
  return ricostruite;
}

export function nomeCortoDaConsegna(consegna) {
  const riga = String(consegna || '').split(String.fromCharCode(10)).map((r) => r.trim()).find((r) => r.length > 0);
  if (!riga) return null;
  const pulita = riga.replace(/\s+/g, ' ');
  return pulita.length > 80 ? `${pulita.slice(0, 79)}…` : pulita;
}

export function processiDaEventi(eventi, { istanti = null, adesso = null } = {}) {
  if (!Array.isArray(eventi) || eventi.length === 0) {
    return { registrato: false, processi: null, motivo: 'non-registrato' };
  }
  const leggiIstante = creaLettoreIstanti(istanti);
  const adessoNoto = Number.isFinite(adesso);
  const { chiamate } = chiamateDaEventi(eventi);

  const processi = chiamate
    .filter((chiamata) => ATTREZZI_CHE_LANCIANO_PROCESSI.includes(chiamata.nome))
    .map((chiamata) => {
      const { esito, codiceUscita, sandbox } = esitoDelProcesso(chiamata);
      const { comando, motivo: motivoComandoAssente } = comandoDellaChiamata(chiamata);
      const inizioMs = chiamata.sequenzaInizio === null ? null : leggiIstante(chiamata.sequenzaInizio);
      const fineMs = chiamata.sequenzaFine === null ? null : leggiIstante(chiamata.sequenzaFine);

      let durataMs = null;
      let motivoTempoAssente = null;
      if (inizioMs === null) motivoTempoAssente = MOTIVO_SENZA_ISTANTI;
      else if (fineMs !== null) durataMs = fineMs - inizioMs;
      else motivoTempoAssente = esito === 'in-corso' ? MOTIVO_ANCORA_IN_CORSO : MOTIVO_FINE_NON_OSSERVATA;

      return {
        toolCallId: chiamata.toolCallId,
        attrezzo: chiamata.nome,
        origine: chiamata.origine,
        comando,
        motivoComandoAssente,
        descrizione: typeof chiamata.argomenti?.descrizione === 'string' ? chiamata.argomenti.descrizione : null,
        argomentiGrezzi: chiamata.argomentiGrezzi,
        sequenzaInizio: chiamata.sequenzaInizio,
        sequenzaFine: chiamata.sequenzaFine,
        inizio: inizioMs === null ? null : new Date(inizioMs).toISOString(),
        durataMs,
        inCorsoDaMs: esito === 'in-corso' && inizioMs !== null && adessoNoto ? adesso - inizioMs : null,
        motivoTempoAssente,
        esito,
        codiceUscita,
        sandbox,
      };
    });

  return { registrato: true, processi, motivo: null };
}

function secondi(ms) {
  return Math.round(ms / 1000);
}

/** Il più lungo tratto di indici consecutivi dentro un gruppo (`[3,4,5,9]` → 3). */
function piuLungaSequenzaConsecutiva(indici) {
  let massimo = 1;
  let corrente = 1;
  for (let i = 1; i < indici.length; i += 1) {
    corrente = indici[i] === indici[i - 1] + 1 ? corrente + 1 : 1;
    if (corrente > massimo) massimo = corrente;
  }
  return massimo;
}

/** Quante volte al massimo il gruppo cade dentro una finestra scorrevole di `finestra` chiamate. */
function massimoNellaFinestra(indici, finestra) {
  let massimo = 1;
  for (let i = 0; i < indici.length; i += 1) {
    let conto = 0;
    for (let j = i; j < indici.length && indici[j] - indici[i] <= finestra - 1; j += 1) conto += 1;
    if (conto > massimo) massimo = conto;
  }
  return massimo;
}

/**
 * ⭐⭐⭐ LA GUARDIA DI STALLO — riconosce due stalli diversi e li dice con
 * parole diverse:
 *
 *  - **silenzio**: un processo, un giro o un cancello di permesso senza un
 *    solo evento da più di `silenzioMs`. Il terzo caso è quello che ci
 *    riguarda per davvero: l'agente è VIVO ma fermo davanti a
 *    un'approvazione che nessuno darà (gitlens#5230, agent-access#139).
 *  - **giro a vuoto**: lo stesso attrezzo con gli STESSI argomenti almeno
 *    `ripetizioniPerAllarme` volte dentro `finestraChiamate`, **e** sempre
 *    con lo stesso esito. Se l'esito cambia, qualcosa si muove: non è stallo.
 *
 * ⛔⛔⛔ OSSERVATIVA. `interviene:false` è nel contratto e provato da un test:
 * questa funzione non ferma, non uccide, non riscrive niente — segnala, e
 * decide l'owner. Ogni segnalazione porta CHI (comando, `toolCallId`,
 * `requestId`) e DA QUANTO, mai un conteggio anonimo.
 *
 * ⛔ Il silenzio si misura solo se c'è un orologio (`adesso`) E gli istanti
 * di arrivo: senza, `silenzioValutabile:false` e il motivo è detto — il
 * giro a vuoto invece si legge dai soli eventi, e resta visibile.
 */
export function guardiaDiStallo(eventi, { istanti = null, adesso = null, soglie = null } = {}) {
  const soglieEffettive = { ...SOGLIE_STALLO_PREDEFINITE, ...(soglie ?? {}) };
  if (!Array.isArray(eventi) || eventi.length === 0) {
    return {
      osservata: false,
      motivo: 'non-registrato',
      interviene: false,
      soglie: soglieEffettive,
      silenzioValutabile: false,
      motivoSilenzioNonValutabile: 'nessun evento registrato per questa sessione',
      segnalazioni: null,
    };
  }

  const leggiIstante = creaLettoreIstanti(istanti);
  const adessoNoto = Number.isFinite(adesso);
  const { chiamate, runAperto, ultimaSequenza, ultimoTipo, approvazioniPendenti } = chiamateDaEventi(eventi);
  const istanteUltimoEvento = ultimaSequenza === null ? null : leggiIstante(ultimaSequenza);
  const silenzioValutabile = adessoNoto && istanteUltimoEvento !== null;
  const motivoSilenzioNonValutabile = silenzioValutabile
    ? null
    : (adessoNoto ? MOTIVO_SENZA_ISTANTI : 'nessun orologio passato alla guardia: «tace da N secondi» non si può dire senza sapere che ora è adesso');

  const segnalazioni = [];
  const sogliaS = secondi(soglieEffettive.silenzioMs);

  if (silenzioValutabile) {
    // 1) Il cancello di permesso. Va per primo ed ESCLUDE gli altri due: è la
    //    causa specifica di quel silenzio, e dirla «il giro tace» sarebbe
    //    vera e inutile.
    for (const approvazione of approvazioniPendenti) {
      const istante = approvazione.sequenza === null ? null : leggiIstante(approvazione.sequenza);
      if (istante === null) continue;
      const fermoDaMs = adesso - istante;
      if (fermoDaMs < soglieEffettive.silenzioMs) continue;
      const comando = typeof approvazione.azione?.comando === 'string' ? approvazione.azione.comando : null;
      const percorso = typeof approvazione.azione?.percorso === 'string' ? approvazione.azione.percorso : null;
      const soggettoDetto = [approvazione.azione?.tipo, comando ?? percorso].filter(Boolean).join(' ') || 'azione non dichiarata';
      segnalazioni.push({
        tipo: 'silenzio',
        soggetto: 'approvazione',
        requestId: approvazione.requestId,
        toolCallId: null,
        attrezzo: approvazione.azione?.tipo ?? null,
        comando,
        percorso,
        fermoDaMs,
        sogliaMs: soglieEffettive.silenzioMs,
        descrizione: `Approvazione «${soggettoDetto}» (${approvazione.requestId}) in attesa da ${secondi(fermoDaMs)} s, soglia ${sogliaS} s: il giro è vivo ma non andrà avanti finché nessuno risponde.`,
      });
    }

    if (approvazioniPendenti.length === 0) {
      // 2) I processi ancora aperti: ognuno con il SUO comando e il SUO id.
      const inCorso = chiamate.filter((chiamata) => ATTREZZI_CHE_LANCIANO_PROCESSI.includes(chiamata.nome) && chiamata.contenuto === null && chiamata.runConclusoDopo === null);
      for (const chiamata of inCorso) {
        const istante = chiamata.sequenzaUltimoEvento === null ? null : leggiIstante(chiamata.sequenzaUltimoEvento);
        if (istante === null) continue;
        const fermoDaMs = adesso - istante;
        if (fermoDaMs < soglieEffettive.silenzioMs) continue;
        const { comando } = comandoDellaChiamata(chiamata);
        segnalazioni.push({
          tipo: 'silenzio',
          soggetto: 'processo',
          requestId: null,
          toolCallId: chiamata.toolCallId,
          attrezzo: chiamata.nome,
          comando,
          percorso: null,
          fermoDaMs,
          sogliaMs: soglieEffettive.silenzioMs,
          descrizione: `${chiamata.nome} «${comando ?? '(comando non dichiarato negli argomenti)'}» (${chiamata.toolCallId}) non produce output da ${secondi(fermoDaMs)} s, soglia ${sogliaS} s. La guardia segnala: fermarlo è una decisione dell'owner.`,
        });
      }

      // 3) Il giro aperto senza nessun processo aperto: tace il ciclo stesso.
      if (runAperto && inCorso.length === 0) {
        const fermoDaMs = adesso - istanteUltimoEvento;
        if (fermoDaMs >= soglieEffettive.silenzioMs) {
          segnalazioni.push({
            tipo: 'silenzio',
            soggetto: 'giro',
            requestId: null,
            toolCallId: null,
            attrezzo: null,
            comando: null,
            percorso: null,
            fermoDaMs,
            sogliaMs: soglieEffettive.silenzioMs,
            ultimoEvento: ultimoTipo,
            descrizione: `Il giro è ancora aperto e non arriva nessun evento da ${secondi(fermoDaMs)} s, soglia ${sogliaS} s (ultimo evento: ${ultimoTipo ?? 'ignoto'}).`,
          });
        }
      }
    }
  }

  // 4) Il giro a vuoto — si legge dai soli eventi, anche senza orologio.
  const perImpronta = new Map();
  chiamate.forEach((chiamata, indice) => {
    if (typeof chiamata.nome !== 'string') return;
    if (!perImpronta.has(chiamata.impronta)) perImpronta.set(chiamata.impronta, []);
    perImpronta.get(chiamata.impronta).push(indice);
  });

  for (const indici of perImpronta.values()) {
    if (indici.length < soglieEffettive.ripetizioniPerAllarme) continue;
    const ripetizioni = massimoNellaFinestra(indici, soglieEffettive.finestraChiamate);
    if (ripetizioni < soglieEffettive.ripetizioniPerAllarme) continue;
    const gruppo = indici.map((indice) => chiamate[indice]);
    const esiti = new Set(gruppo.map((chiamata) => chiamata.contenuto).filter((valore) => typeof valore === 'string'));
    // ⛔ Result-aware: «senza che cambi niente». Esiti diversi = progresso.
    if (esiti.size > 1) continue;
    const prima = gruppo[0];
    const { comando } = comandoDellaChiamata(prima);
    const istantePrima = prima.sequenzaInizio === null ? null : leggiIstante(prima.sequenzaInizio);
    const consecutive = piuLungaSequenzaConsecutiva(indici);
    const idsTutti = gruppo.map((chiamata) => chiamata.toolCallId);
    // ⛔ La descrizione è una riga da leggere, non un elenco: gli id per intero
    // stanno in `toolCallIds`, qui i primi cinque e quanti restano — «CHI» resta
    // dicibile anche quando i CHI sono quattordici.
    const idsDetti = idsTutti.length > 5 ? `${idsTutti.slice(0, 5).join(', ')} e altri ${idsTutti.length - 5}` : idsTutti.join(', ');
    segnalazioni.push({
      tipo: 'giro-a-vuoto',
      soggetto: 'attrezzo',
      attrezzo: prima.nome,
      comando,
      argomenti: prima.argomentiGrezzi,
      toolCallIds: idsTutti,
      posizioni: indici,
      ripetizioni,
      occorrenzeTotali: indici.length,
      consecutive,
      esitiDistinti: esiti.size,
      soglia: soglieEffettive.ripetizioniPerAllarme,
      finestra: soglieEffettive.finestraChiamate,
      attuale: indici.at(-1) >= chiamate.length - soglieEffettive.finestraChiamate,
      ripetutoDaMs: istantePrima !== null && adessoNoto ? adesso - istantePrima : null,
      descrizione: `${prima.nome} chiamato ${ripetizioni} volte con gli stessi identici argomenti ${prima.argomentiGrezzi || '(nessuno)'} entro ${soglieEffettive.finestraChiamate} chiamate — ${indici.length} in tutta la sessione, ${consecutive} di fila — sempre con lo stesso esito: ${idsDetti}.`,
    });
  }

  return {
    osservata: true,
    motivo: null,
    interviene: false,
    soglie: soglieEffettive,
    silenzioValutabile,
    motivoSilenzioNonValutabile,
    segnalazioni,
  };
}

/* =====================================================================
 * ⭐⭐⭐ W1-03 (04/9) — LE TRE METRICHE DI SESSIONE, per la Board del
 * redesign (decisione G3-G4): tasso di cache · tempo al primo token ·
 * motivo di chiusura del giro.
 *
 * ⛔⛔ NESSUNA SCRITTURA NUOVA SUL DISCO. Tutte e tre si DERIVANO dagli
 * eventi già persistiti, esattamente come `usageDaEventi` e come il
 * process ledger qui sopra: la storia di ogni sessione passa già intera
 * da `broadcast` (che scrive su `.sessions-store/`), quindi un campo
 * nuovo sarebbe una seconda fonte di verità accanto a una che c'è già.
 *
 * ⭐ MISURATO sui 73 file di sessione VERI in `.sessions-store/`
 * (60.437 eventi, sonda del 04/09) — non deciso a tavolino:
 *  - `_sequenza` c'è su TUTTI i 60.437 eventi, ma l'ordine SUL DISCO è
 *    diverso dall'ordine di `_sequenza` in 71 file su 73 ⇒ `eventiInOrdine`
 *    è obbligatorio, non una precauzione;
 *  - NESSUN evento persistito porta un orario (zero campi ts/timestamp/at):
 *    il tempo esiste solo nella mappa `istanti` tenuta IN MEMORIA da
 *    `broadcast` ⇒ per una sessione RIPRISTINATA il tempo al primo token
 *    è `null` con il motivo DETTO, mai uno zero inventato;
 *  - il primo pezzo che arriva dopo `RunStarted` è un evento di
 *    RAGIONAMENTO in 55 sessioni su 71, di TESTO in 16, mai un
 *    `TextMessageContent` prima del suo `TextMessageStart`;
 *  - `RunError.code` sul disco vale `giri-esauriti` (8), `internal-error`
 *    (5), `fermato` (2) — i tre codici sono letti, non inventati;
 *  - come CHIUSURA finale: `fine-lavoro` 65, `giri-finiti` 6, `errore` 2;
 *  - 71 sessioni su 73 portano `/usage`; il tasso di cache va da 0,0% a
 *    99,2% (mediana 85,4%) e 5 sessioni hanno `cached_tokens` a ZERO con
 *    `prompt_tokens` ben oltre le 1.024 ⇒ lo zero è MISURATO, e le 2
 *    sessioni senza `/usage` sono NON MISURATE: due fatti diversi, due
 *    parole diverse.
 *
 * ⭐ RICERCA WEB del 04/09, fatta PRIMA di scrivere (obbligo owner) — i
 * VINCOLI che ha aggiunto, non la soluzione:
 *  - OpenTelemetry, semantic conventions GenAI (`gen-ai-metrics.md`, main,
 *    e opentelemetry.io/blog/2026/genai-observability): la metrica
 *    standard è `gen_ai.client.operation.time_to_first_chunk` — "time to
 *    receive the FIRST CHUNK", qualunque cosa contenga, non "il primo
 *    token di testo"; e `gen_ai.server.time_to_first_token` è definita
 *    "for SUCCESSFUL responses" ⇒ il tempo va sempre letto accanto
 *    all'esito, mai da solo.
 *  - Stessa spec, `gen_ai.usage`: esistono SOLO i tipi `input` e `output`
 *    — NON esiste un tipo `cache_read` ⇒ un tasso di cache è una nostra
 *    estensione dichiarata e deve portare con sé il proprio DENOMINATORE,
 *    altrimenti non è confrontabile con niente.
 *  - vLLM (docs.vllm.ai/en/stable/design/metrics/) e ClickHouse
 *    "LLM inference latency: TTFT": per i modelli che ragionano si
 *    misurano DUE tempi diversi — TTFT (primo chunk) e TTFV, "time to
 *    first VISIBLE token", dopo la fase di pensiero — e "diverge by tens
 *    of seconds"; la latenza percepita è la seconda. ⇒ Con 55 sessioni su
 *    71 in cui il primo chunk è ragionamento, riportare un numero solo
 *    sarebbe una media di due cose diverse: qui se ne riportano DUE.
 *  - OpenAI, guida al prompt caching (developers.openai.com): `prompt_tokens`
 *    COMPRENDE già i token letti dalla cache ⇒ il denominatore giusto è
 *    `prompt_tokens` e il rapporto sta in [0,1]; il caching parte solo da
 *    1.024 token e a scatti di 128 ⇒ uno 0% su un prompt corto è un fatto
 *    normale, non un guasto.
 *  - LiteLLM, issue aperte sulla normalizzazione di `finish_reason`, e le
 *    tabelle Anthropic (`end_turn`/`max_tokens`/`max_turns`/…) contro
 *    OpenAI (`stop`/`length`/`tool_calls`/…): i vocabolari "are similar but
 *    not identical" e la mappatura "cannot be defaulted" ⇒ il codice
 *    GREZZO viaggia sempre accanto al motivo normalizzato, e un codice mai
 *    visto cade in `errore` DICENDO quale era, mai buttato via.
 * ===================================================================== */

const MOTIVO_USAGE_ASSENTE = 'nessun evento di consumo (StateDelta su /usage) in questa storia: il tasso di cache non è MISURATO, che è cosa diversa da uno zero misurato';
const MOTIVO_PROMPT_ZERO = 'il consumo registrato non porta un prompt_tokens maggiore di zero: senza denominatore il tasso non esiste, e uno 0% sarebbe una risposta inventata';
const MOTIVO_CACHED_ASSENTE = 'il consumo registrato non porta cached_tokens: il fornitore non ha dichiarato quanti token venissero dalla cache, e «non dichiarato» non è «nessuno»';
const MOTIVO_CACHE_INCOERENTE = 'i token letti dalla cache risultano PIÙ del prompt intero: prompt_tokens comprende già quelli in cache (guida OpenAI al prompt caching), quindi questa contabilità è rotta e non si riporta un tasso oltre il 100%';
const MOTIVO_PRIMO_TOKEN_SENZA_GIRO = 'nessun RunStarted in questa storia: senza l\'istante di partenza non c\'è un tempo al primo token da misurare';
const MOTIVO_PRIMO_TOKEN_MAI_ARRIVATO = 'il giro è partito ma non è ancora arrivato un solo pezzo di risposta dal modello';
const MOTIVO_PRIMO_VISIBILE_MAI_ARRIVATO = 'il giro non ha ancora prodotto testo visibile: finora solo ragionamento o chiamate ad attrezzi';
const MOTIVO_CHIUSURA_APERTA = 'il giro è ancora in corso: non ha ancora un motivo di chiusura, e dirne uno adesso sarebbe una previsione';
/* ⛔ 07/9 — l'altra metà della verità: un giro senza motivo di chiusura perché il processo è morto in un riavvio, non perché sta ancora lavorando. */
const MOTIVO_CHIUSURA_INTERROTTA = 'il giro non ha un motivo di chiusura perché è stato interrotto da un riavvio del server: il processo che lo eseguiva non esiste più';

/**
 * Gli eventi che valgono come «primo pezzo di risposta» del modello.
 * ⭐ `ReasoningMessage*` è dentro perché nei dati veri è ciò che arriva per
 * primo in 55 sessioni su 71: escluderlo misurerebbe la fine del ragionamento
 * spacciandola per l'inizio della risposta.
 * ⭐ `ToolCallStart` è dentro perché un giro può cominciare direttamente con
 * una chiamata ad attrezzo (1 caso su 73): è output del modello a tutti gli
 * effetti, ed è il "first chunk" della convenzione OpenTelemetry.
 */
const EVENTI_PRIMO_TOKEN = Object.freeze(['ReasoningMessageStart', 'ReasoningMessageContent', 'TextMessageStart', 'TextMessageContent', 'ToolCallStart']);
/** Gli eventi che valgono come «primo token VISIBILE» (TTFV): solo il testo che la persona legge. */
const EVENTI_PRIMO_TOKEN_VISIBILE = Object.freeze(['TextMessageStart', 'TextMessageContent']);

/** Da un tipo di evento alla famiglia detta a parole: mai il nome tecnico fuori da qui. */
function famigliaDelPrimoToken(tipo) {
  if (tipo === 'ReasoningMessageStart' || tipo === 'ReasoningMessageContent') return 'ragionamento';
  if (tipo === 'TextMessageStart' || tipo === 'TextMessageContent') return 'testo';
  if (tipo === 'ToolCallStart') return 'attrezzo';
  return null;
}

/**
 * ⛔ Il MOTIVO DI CHIUSURA, normalizzato — e il codice GREZZO accanto.
 * `null` significa «ancora in corso», mai «non lo so»: si smette di cercare al
 * `RunStarted` (stessa disciplina di `ultimoEsitoDaEventi`), perché un
 * `RunFinished` di un giro PRECEDENTE non chiude quello di adesso.
 */
function chiusuraDaEventi(ordinati) {
  for (let i = ordinati.length - 1; i >= 0; i -= 1) {
    const evento = ordinati[i];
    if (evento?.type === 'RunError') {
      const codice = typeof evento.code === 'string' ? evento.code : null;
      if (codice === 'giri-esauriti') return { motivo: 'giri-finiti', codice };
      if (codice === 'fermato') return { motivo: 'fermata', codice };
      // ⛔ Un codice mai visto NON diventa un motivo nuovo inventato qui: cade
      //    in `errore` e si porta dietro il proprio nome, così chi legge sa
      //    cosa è successo (LiteLLM: la mappatura «cannot be defaulted»).
      return { motivo: 'errore', codice };
    }
    if (evento?.type === 'RunFinished') return { motivo: 'fine-lavoro', codice: null };
    if (evento?.type === 'RunStarted') return { motivo: null, codice: null };
  }
  return { motivo: null, codice: null };
}

/* =====================================================================
 * ⛔⛔⛔ 06/9 — CB-04: «il consumo mostrato è quello dell'ULTIMO INVIO,
 * non della sessione».
 *
 * MISURATO prima di scrivere (sonda `.gravi/sonde/01-consumo.mjs`, tre
 * invii veri con `z-ai/glm-5.3-flash`, sessione
 * 53ea52d1-4ead-4bcd-9eef-837d37e3d534): in storia ci sono TRE eventi
 * `/usage`, uno per invio — {7669, 68, cache 7616, giri 1} · {7675, 28,
 * cache 0, giri 1} · {7716, 25, cache 7616, giri 1}. Il totale VERO della
 * sessione è {23.060, 121, cache 15.232, 3 giri}; la app ne dichiarava
 * {7.716, 25, cache 7.616, 1 giro} — il solo ultimo invio, cioè un terzo
 * del consumo, e una cache al 99% invece del 66%.
 *
 * CAUSA, alla fonte: `conto` è dichiarato DENTRO il ciclo di una singola
 * esecuzione del kernel (`talosHarness.mjs:4560`, `const conto = {…}`) e
 * riparte da zero a ogni invio. `/usage` è quindi cumulativo DENTRO
 * un'esecuzione e NON fra esecuzioni: leggerne l'ultimo dà il totale di
 * quell'invio, mai quello della sessione. Il commento storico più sotto
 * («l'ULTIMO che compare nella storia è il totale finale») era vero finché
 * una sessione era fatta di un invio solo.
 *
 * RICERCA WEB 06/09/2026, fatta PRIMA di scrivere — i VINCOLI, non la cura:
 *  - OpenAI, «Counting tokens» (developers.openai.com/api/docs/guides/
 *    token-counting) + Help Center «What are tokens»: `usage` è riportato
 *    PER RICHIESTA e per un totale su più turni «you would need to manually
 *    sum up the values from each individual API response yourself» ⇒ la
 *    somma è compito di chi chiama, nessun campo la porta già fatta.
 *  - OpenRouter, «Prompt Caching» (openrouter.ai/docs/guides/best-practices/
 *    prompt-caching): il tasso di cache di una sessione si calcola «sum all
 *    cached_tokens / sum total prompt_tokens» — PESATO sui token, non come
 *    media delle percentuali dei singoli invii (numero diverso e senza
 *    significato).
 *  - LangSmith, «Cost tracking» (docs.langchain.com/langsmith/cost-tracking):
 *    «A trace covers one turn. A session covers a whole conversation», e
 *    senza il legame di thread «token counts and costs from those runs won't
 *    be included in thread-level aggregations». È esattamente questo guasto:
 *    un numero di TURNO mostrato dove è promesso un totale di SESSIONE.
 *
 * ⇒ Il confine fra due esecuzioni è `RunStarted`: di ogni esecuzione si
 *   tiene l'ULTIMO `/usage` (il suo totale) e li si somma. I due fatti
 *   restano distinti e leggibili entrambi: `ultimaEsecuzione` (il tetto dei
 *   giri parla di quella) e la somma (token e cache della sessione).
 * ===================================================================== */

/**
 * I totali di consumo, UNO PER ESECUZIONE, in ordine.
 * @returns {Array<object>} l'ultimo `/usage` di ogni esecuzione (mai gli intermedi)
 */
function usagePerEsecuzione(ordinati) {
  const finali = [];
  let corrente = null;
  for (const evento of ordinati) {
    if (evento?.type === 'RunStarted') {
      if (corrente) finali.push(corrente);
      corrente = null;
      continue;
    }
    if (evento?.type !== 'StateDelta') continue;
    const voce = evento.delta?.find((d) => d?.path === '/usage');
    if (voce && voce.value && typeof voce.value === 'object') corrente = voce.value;
  }
  if (corrente) finali.push(corrente);
  return finali;
}

/**
 * ⭐⭐⭐ Il consumo dell'INTERA sessione: la somma dei totali per esecuzione.
 * ⛔ `null` quando nessuna esecuzione ha mai riportato consumo — «non
 * misurato» non è «zero», la stessa disciplina di `cacheDaEventi`.
 * `esecuzioni` dice su quanti invii è fatta la somma; `ultimaEsecuzione`
 * conserva il dato di TURNO, perché il tetto dei giri parla di quello.
 */
export function usageSessioneDaEventi(eventi) {
  const finali = usagePerEsecuzione(eventiInOrdine(eventi));
  const compattazione = contextUsageFromEvents(eventi);
  if (finali.length === 0 && !compattazione) return null;
  const numero = (valore) => (Number.isFinite(valore) ? valore : 0);
  const somma = finali.reduce((acc, u) => ({
    prompt_tokens: acc.prompt_tokens + numero(u.prompt_tokens),
    completion_tokens: acc.completion_tokens + numero(u.completion_tokens),
    cached_tokens: acc.cached_tokens + numero(u.cached_tokens),
    giri: acc.giri + numero(u.giri),
  }), { prompt_tokens: 0, completion_tokens: 0, cached_tokens: 0, giri: 0 });
  // ⛔ Nessuna esecuzione ha dichiarato `cached_tokens` ⇒ `null`, mai lo zero
  //    che verrebbe fuori dalla somma: «non dichiarato» non è «nessuno».
  const conCache = finali.filter((u) => Number.isFinite(u.cached_tokens));
  const risultato = {
    ...somma,
    cached_tokens: conCache.length === 0 ? null : somma.cached_tokens,
    esecuzioni: finali.length,
    esecuzioniConCache: conCache.length,
    ultimaEsecuzione: finali.at(-1) ?? null,
  };
  if (compattazione) {
    for (const key of ['prompt_tokens', 'completion_tokens', 'cached_tokens']) {
      const chat = finali.some(u => Number.isFinite(u[key])) ? risultato[key] : null;
      const context = compattazione[key];
      risultato[key] = chat === null && context === null ? null : (chat ?? 0) + (context ?? 0);
    }
    risultato.compattazione = compattazione;
    risultato.prompt_tokens_con_cache = conCache.reduce((n, u) => n + (Number.isFinite(u.prompt_tokens) && u.prompt_tokens > 0 ? u.prompt_tokens : 0), 0) + (compattazione.prompt_tokens_con_cache ?? 0);
  }
  return risultato;
}

/**
 * Il tasso di cache dell'INTERA sessione: somma dei `cached_tokens` sulla
 * somma dei `prompt_tokens`, esecuzione per esecuzione (OpenRouter, guida al
 * prompt caching). ⛔ `null` non è `0`.
 */
function cacheDaEventi(ordinati) {
  const finali = usagePerEsecuzione(ordinati);
  const compattazione = contextUsageFromEvents(ordinati);
  const vuoto = { frazione: null, percentuale: null, promptTokens: null, cachedTokens: null, denominatore: 'prompt_tokens', esecuzioni: 0 };
  if (finali.length === 0 && !compattazione) return { ...vuoto, motivoAssente: MOTIVO_USAGE_ASSENTE };

  /*
   * ⛔ Numeratore e denominatore vengono dalle STESSE esecuzioni: un invio che
   *    non dichiara `cached_tokens` non entra né con uno zero (sarebbe una
   *    cache inventata) né col solo `prompt_tokens` (gonfierebbe il
   *    denominatore e schiaccerebbe il tasso).
   */
  const conPrompt = finali.filter((u) => Number.isFinite(u.prompt_tokens) && u.prompt_tokens > 0);
  const conCache = conPrompt.filter((u) => Number.isFinite(u.cached_tokens));
  const prompt = conPrompt.length === 0 && compattazione?.prompt_tokens == null ? null : conPrompt.reduce((n, u) => n + u.prompt_tokens, 0) + (compattazione?.prompt_tokens ?? 0);
  const cached = conCache.length === 0 && compattazione?.cached_tokens == null ? null : conCache.reduce((n, u) => n + u.cached_tokens, 0) + (compattazione?.cached_tokens ?? 0);
  const base = { ...vuoto, esecuzioni: finali.length, promptTokens: prompt, cachedTokens: cached };
  if (prompt === null || prompt <= 0) return { ...base, motivoAssente: MOTIVO_PROMPT_ZERO };
  if (cached === null || cached < 0) return { ...base, motivoAssente: MOTIVO_CACHED_ASSENTE };
  // Il denominatore del TASSO è quello delle sole esecuzioni che hanno dichiarato la cache.
  const promptConCache = conCache.reduce((n, u) => n + u.prompt_tokens, 0) + (compattazione?.prompt_tokens_con_cache ?? 0);
  if (cached > promptConCache) return { ...base, motivoAssente: MOTIVO_CACHE_INCOERENTE };

  const frazione = cached / promptConCache;
  return { ...base, promptTokens: promptConCache, frazione, percentuale: Math.round(frazione * 100), motivoAssente: null };
}

/**
 * ⭐⭐ 13/09 sera — QUANTO HA RAGIONATO IL MODELLO, per ogni ragionamento. «Fare meglio di Hermes».
 *
 * Hermes desktop perde la durata a ogni ricarica, e lo dichiara nel suo codice
 * (`apps/desktop/src/components/chat/activity-timer.ts`: «the persisted turn records the text the model
 * thought, never how long it spent thinking it»): una conversazione riaperta dice solo «Thought».
 * Qui gli istanti di ogni evento stanno già in memoria mentre il giro passa (`voce.istantiEvento`): la
 * durata si calcola da lì e finisce nel record `tempi-giro` — una riga per giro, nessun campo sugli
 * eventi, la stessa regola di BC-07 (vedi `persistiTempiDelGiro`).
 *
 * ⛔ Solo coppie inizio/fine con ENTRAMBI gli istanti: un ragionamento fermato a metà non ha una durata,
 *   e una sessione ripresa da disco non ha istanti. «Non misurato» non diventa mai uno zero.
 * ⛔ `soloUltimoGiro`: il record è per giro, e riscriverci le durate di tutta la sessione a ogni giro le
 *   duplicherebbe.
 * @returns {Record<string, number>} messageId → millisecondi
 */
export function durateRagionamentoDaEventi(eventi, { istanti = null, soloUltimoGiro = false } = {}) {
  const ordinati = eventiInOrdine(eventi);
  const leggiIstante = creaLettoreIstanti(istanti);
  let da = 0;
  if (soloUltimoGiro) {
    for (let i = ordinati.length - 1; i >= 0; i -= 1) if (ordinati[i]?.type === 'RunStarted') { da = i; break; }
  }
  const inizi = new Map();
  const durate = {};
  for (const evento of ordinati.slice(da)) {
    /*
     * ⛔⛔ 13/09 notte, GIRO VERO (glm-5.3-flash, banco 5471): un reindirizzamento chiude il giro mentre il
     *   modello RAGIONA, e `ReasoningMessageEnd` non arriva mai — nello store: Start, 688 pezzi, poi
     *   `RunError fermato`. Dal vivo la riga diceva «Ha ragionato per 8 s» (il browser chiude i ragionamenti
     *   aperti alla fine del giro); riaperta, diceva solo «Ha ragionato». Due racconti dello stesso fatto.
     * ⇒ La fine del GIRO chiude i ragionamenti rimasti aperti, come fa lo schermo. Senza un evento di fine
     *   giro (giro ancora vivo) resta vero quello di prima: nessuna durata.
     */
    /*
     * ⛔⛔ 13/09 notte, stesso GIRO VERO, letto nello store: `ReasoningMessageEnd` arriva DOPO `TextMessageEnd`
     *   (Start, 41.426 pezzi di ragionamento, TextMessageStart, 2.204 pezzi di risposta, TextMessageEnd, e solo lì
     *   ReasoningMessageEnd). Dopo il primo testo non arriva più un solo pezzo di ragionamento: il modello ha smesso
     *   di ragionare lì, e la fine viene solo annunciata tardi. Contata fino all'End, la durata comprendeva la
     *   risposta intera. ⇒ Il ragionamento finisce quando il modello PASSA OLTRE — primo testo o primo attrezzo —
     *   «a plain collapsed row once the model moves on» (assistant-ui, Reasoning).
     */
    if ((evento?.type === 'TextMessageStart' || evento?.type === 'ToolCallStart' || evento?.type === 'RunFinished' || evento?.type === 'RunError') && Number.isSafeInteger(evento._sequenza) && inizi.size) {
      const fine = leggiIstante(evento._sequenza);
      for (const [messageId, inizio] of inizi) {
        const ms = fine === null ? null : fine - inizio;
        if (Number.isFinite(ms) && ms >= 0) durate[messageId] = ms;
      }
      inizi.clear();
      continue;
    }
    if (typeof evento?.messageId !== 'string' || !Number.isSafeInteger(evento._sequenza)) continue;
    if (evento.type === 'ReasoningMessageStart') {
      const istante = leggiIstante(evento._sequenza);
      if (istante !== null) inizi.set(evento.messageId, istante);
    } else if (evento.type === 'ReasoningMessageEnd' && inizi.has(evento.messageId)) {
      const fine = leggiIstante(evento._sequenza);
      const ms = fine === null ? null : fine - inizi.get(evento.messageId);
      if (Number.isFinite(ms) && ms >= 0) durate[evento.messageId] = ms;
      inizi.delete(evento.messageId); // ⛔ chiuso dalla sua fine: la fine del giro non lo deve richiudere più tardi
    }
  }
  return durate;
}

/**
 * ⭐⭐ 13/09 notte — I RAGIONAMENTI ANCORA APERTI, e da quanto. Trovato col GIRO VERO (glm-5.3-flash, banco
 * 5471): riaperta a metà giro, la riga diceva «Sta ragionando… 35 s» su un ragionamento partito TREDICI minuti
 * prima (852.858 ms, poi scritti nel record). Il browser non ha l'istante d'inizio: gli eventi non portano un
 * orario. Il registro sì, in memoria.
 * ⛔ Un giro finito chiude tutto ciò che era aperto (stessa regola di `durateRagionamentoDaEventi`); senza
 *   istanti — una sessione ripresa da disco — non si dice niente, mai uno zero.
 * @returns {Record<string, number>} messageId → millisecondi trascorsi dall'inizio
 */
export function ragionamentiInCorsoDaEventi(eventi, { istanti = null, adesso = null } = {}) {
  if (!Number.isFinite(adesso)) return {};
  const leggiIstante = creaLettoreIstanti(istanti);
  const aperti = new Map();
  for (const evento of eventiInOrdine(eventi)) {
    /* ⛔ Stessa regola delle durate: primo testo o primo attrezzo, e il ragionamento non è più «in corso». */
    if (['TextMessageStart', 'ToolCallStart', 'RunFinished', 'RunError'].includes(evento?.type)) { aperti.clear(); continue; }
    if (typeof evento?.messageId !== 'string' || !Number.isSafeInteger(evento._sequenza)) continue;
    if (evento.type === 'ReasoningMessageStart') {
      const inizio = leggiIstante(evento._sequenza);
      if (inizio !== null) aperti.set(evento.messageId, inizio);
    } else if (evento.type === 'ReasoningMessageEnd') {
      aperti.delete(evento.messageId);
    }
  }
  const trascorsi = {};
  for (const [messageId, inizio] of aperti) {
    const ms = adesso - inizio;
    if (Number.isFinite(ms) && ms >= 0) trascorsi[messageId] = ms;
  }
  return trascorsi;
}

/** Le durate già scritte nei record `tempi-giro` di una sessione: servono a una sessione ripresa da disco. */
export function durateRagionamentoDaRecord(record) {
  const durate = {};
  for (const riga of Array.isArray(record) ? record : []) {
    if (riga?.tipo !== 'tempi-giro' || !riga.ragionamentiMs || typeof riga.ragionamentiMs !== 'object') continue;
    for (const [messageId, ms] of Object.entries(riga.ragionamentiMs)) {
      if (Number.isFinite(ms) && ms >= 0) durate[messageId] = ms;
    }
  }
  return durate;
}

/**
 * ⭐⭐⭐ LE METRICHE DI UNA SESSIONE, derivate dai SOLI eventi persistiti.
 *
 * Stessa firma e stesso contratto di `processiDaEventi` qui sopra:
 * `{registrato:false, motivo:'non-registrato'}` quando non c'è niente da
 * leggere — che è un fatto diverso da «misurato e vale zero».
 *
 * ⛔ Il giro misurato è l'ULTIMO (`giri` dice quanti ce ne sono in tutto:
 * 11 sessioni su 73 ne hanno più di uno, quindi la scelta non è accademica).
 * Chiusura e tempo al primo token parlano perciò dello stesso giro, quello
 * di adesso — mai una media fra giri diversi.
 *
 * @returns {{registrato:boolean, motivo:string|null, giri:number|null,
 *   cache:object|null, primoToken:object|null, chiusura:object|null}}
 */
export function metricheDaEventi(eventi, { istanti = null, adesso = null } = {}) {
  if (!Array.isArray(eventi) || eventi.length === 0) {
    return { registrato: false, motivo: 'non-registrato', giri: null, cache: null, primoToken: null, chiusura: null };
  }
  const ordinati = eventiInOrdine(eventi);
  const leggiIstante = creaLettoreIstanti(istanti);
  const adessoNoto = Number.isFinite(adesso);

  const giri = ordinati.filter((evento) => evento?.type === 'RunStarted').length;
  let inizioGiro = -1;
  for (let i = ordinati.length - 1; i >= 0; i -= 1) if (ordinati[i]?.type === 'RunStarted') { inizioGiro = i; break; }

  const chiusuraNormalizzata = chiusuraDaEventi(ordinati);
  const chiusura = {
    motivo: chiusuraNormalizzata.motivo,
    codice: chiusuraNormalizzata.codice,
    motivoAssente: chiusuraNormalizzata.motivo === null ? MOTIVO_CHIUSURA_APERTA : null,
  };

  const primoToken = {
    ms: null, tipo: null, msPrimoVisibile: null, inCorsoDaMs: null, motivoAssente: null, motivoVisibileAssente: null,
  };
  if (inizioGiro === -1) {
    primoToken.motivoAssente = MOTIVO_PRIMO_TOKEN_SENZA_GIRO;
    primoToken.motivoVisibileAssente = MOTIVO_PRIMO_TOKEN_SENZA_GIRO;
  } else {
    const sequenzaInizio = ordinati[inizioGiro]?._sequenza;
    const istanteInizio = Number.isSafeInteger(sequenzaInizio) ? leggiIstante(sequenzaInizio) : null;
    const dopo = ordinati.slice(inizioGiro + 1);
    const primo = dopo.find((evento) => EVENTI_PRIMO_TOKEN.includes(evento?.type)) ?? null;
    const primoVisibile = dopo.find((evento) => EVENTI_PRIMO_TOKEN_VISIBILE.includes(evento?.type)) ?? null;
    primoToken.tipo = primo ? famigliaDelPrimoToken(primo.type) : null;

    const distanza = (evento) => {
      if (istanteInizio === null || !evento) return null;
      const istante = Number.isSafeInteger(evento._sequenza) ? leggiIstante(evento._sequenza) : null;
      return istante === null ? null : istante - istanteInizio;
    };
    primoToken.ms = distanza(primo);
    primoToken.msPrimoVisibile = distanza(primoVisibile);

    if (istanteInizio === null) {
      // ⛔ Il caso NORMALE per una sessione ripresa da disco: nessun evento
      //    persistito porta un orario, e il perché si DICE.
      primoToken.motivoAssente = MOTIVO_SENZA_ISTANTI;
      primoToken.motivoVisibileAssente = MOTIVO_SENZA_ISTANTI;
    } else {
      if (primo === null) primoToken.motivoAssente = MOTIVO_PRIMO_TOKEN_MAI_ARRIVATO;
      else if (primoToken.ms === null) primoToken.motivoAssente = MOTIVO_SENZA_ISTANTI;
      if (primoVisibile === null) primoToken.motivoVisibileAssente = MOTIVO_PRIMO_VISIBILE_MAI_ARRIVATO;
      else if (primoToken.msPrimoVisibile === null) primoToken.motivoVisibileAssente = MOTIVO_SENZA_ISTANTI;
      if (chiusura.motivo === null && adessoNoto) primoToken.inCorsoDaMs = adesso - istanteInizio;
    }
  }

  return { registrato: true, motivo: null, giri, cache: cacheDaEventi(ordinati), primoToken, chiusura };
}

export function createSessionRegistry({
  avviaSessioneFn = avviaSessioneReale,
  /*
   * P-13 (10/09): qui resta SOLO l'invalidazione. L'elenco lo costruisce `agent-service.mjs`, fra
   * RunStarted e talosLavora — dentro `avviaESegui` non si può, e non è un'opinione: un tick di
   * ritardo lì fa cadere 148 test, perché chi chiama conta su RunStarted già nel buffer.
   */
  segnalaFileCambiatiFn = segnalaFileCambiati,
  // 06/9: la delega rifiuta una cartella che non esiste (il percorso in forma WSL che il modello
  // inventava per aggirare il vecchio divieto). Iniettabile: le prove costruiscono cartelle finte.
  cartellaEsisteFn = esisteCartella,
  preparaEsecuzioneFn,
  taskCatalogProvider = null,
  preparaEsecuzioneLiberaFn = preparaEsecuzioneLiberaReale,
  resolveWorkspaceLaunchFn = null,
  consumeWorkspaceLaunchFn = null,
  compattaSessioneFn = compattaSessioneReale,
  contextHooksFn,
  contextCompactFn,
  eseguiComandoDirettoFn = eseguiComandoDirettoReale,
  leggiAlberoWorkspaceFn = leggiAlberoWorkspaceReale,
  leggiContenutoFileFn = leggiContenutoFileReale,
  leggiFilePerScaricoFn = leggiFilePerScaricoReale,
  rinominaFileFn = rinominaFileReale,
  eliminaFileFn = eliminaFileReale,
  rivelaInEsploraFileFn = rivelaInEsploraFileReale,
  apriFileConProgrammaPredefinitoFn = apriFileConProgrammaPredefinitoReale,
  apriInEsploraFileFn = apriInEsploraFileReale,
  spostaFileFn = spostaFileReale,
  copiaFileFn = copiaFileReale,
  creaVoceWorkspaceFn = creaVoceWorkspaceReale,
  guardaWorkspaceFn = guardaWorkspaceReale,
  /*
   * ⭐⭐⭐ FASE L (30/8) — owner: "ricerca web competitor" sulla domanda
   * "un riavvio perde una sessione in corso, è mai capitato?". La
   * ricerca ha trovato che questo file dichiara "solo in memoria...
   * non ancora aperto" fin dalla sua prima riga — un gap più grande di
   * quanto la domanda presumesse (OGNI sessione, non solo quelle in
   * corso).
   *
   * ⛔⛔⛔ `cartellaStore` NESSUN default reale — a differenza di
   * `cartellaTrustHook`/`cartellaTrustMcp`/`cartellaTrustPlugin` sotto
   * (che pure puntano a un percorso reale di default): quelli sono
   * letture PIGRE, innescate solo da un'azione esplicita (una
   * tool-call, un fida). Questo scrive ad OGNI evento, per OGNI
   * sessione — un default reale avrebbe scritto file veri ad ogni test
   * di questo intero file che avvia una sessione finta, MAI notato
   * perché una scrittura riuscita non fa fallire nessun assert (a
   * differenza di `avviaSessioneFn`, il cui default reale fallirebbe
   * rumorosamente su una chiave finta). Trovato DAL VIVO: 114 file
   * scritti in `.sessions-store/` dopo una sola corsa della suite —
   * corretto qui, non solo notato. `undefined` ⇒ ogni scrittura è
   * saltata (guardia esplicita ad ogni punto di chiamata) — SOLO
   * `server.mjs` passa un valore vero.
   */
  cartellaStore,
  registraRigaFn = registraRigaReale,
  /*
   * ⭐⭐⭐ FASE L, trovato dalla verifica dal vivo (30/8): un server VERO,
   * ucciso 6ms dopo aver creato una sessione — sul riavvio, "114/115
   * ripristinate". La SOLA intestazione (vedi la doc in
   * session-store.mjs#registraRigaSync) usa questa versione SINCRONA,
   * non `registraRigaFn`: `avvia()` resta sincrona (nessun rischio di
   * toccare i ~110 call-site di test che presumono un ritorno
   * immediato), ma il sessionId non esce mai verso il chiamante prima
   * che la sua intestazione sia già durevole sul disco.
   */
  registraRigaSyncFn = registraRigaSyncReale,
  elencaSessioniPersistiteFn = elencaSessioniPersistiteReale,
  leggiRegistroFn = leggiRegistroReale,
  // ⭐⭐⭐ 30/8, QA visiva (Task 14) — stesso pattern iniettabile degli altri, per lo stesso motivo (mai una vera cancellazione su disco nei test unitari di questo file).
  eliminaSessionePersistitaFn = eliminaSessionePersistitaReale,
  /*
   * ⭐⭐⭐ 28/8 — piano `elegant-spinning-dongarra.md`, FASE A (hook).
   * `cartellaTrustHook`: FUORI dal workspace di ogni progetto, stesso
   * pattern REALE già in uso per `.automations/` (verificato in
   * server.mjs: `fileURLToPath(new URL('.automations/', import.meta.url))`)
   * — il default qui è relativo a QUESTO file (`src/`), un livello
   * sopra per arrivare accanto a `server.mjs`.
   */
  cartellaTrustHook = fileURLToPath(new URL('../.hooks-trust/', import.meta.url)),
  caricaHooksFn = caricaHooksReale,
  verificaTrustFn = verificaTrustReale,
  eseguiHookFn = eseguiHookReale,
  /*
   * ⭐⭐⭐ 29/8 — FASE E, seconda metà. Stesso pattern REALE di
   * `cartellaTrustHook` appena sopra — un default relativo a QUESTO
   * file, fuori dal workspace di ogni progetto (il trust di un server
   * MCP è una decisione dell'OWNER su questa macchina, mai qualcosa
   * che un progetto clonato può auto-concedersi scrivendo un file —
   * vedi mcp-registry.mjs).
   */
  cartellaTrustMcp = fileURLToPath(new URL('../.mcp-trust/', import.meta.url)),
  fidaHookFn = fidaHookReale,
  /*
   * ⭐⭐⭐ 29/8 — FASE E, il pannello Capability hub: stesso pattern
   * iniettabile di caricaHooksFn/verificaTrustFn/fidaHookFn appena
   * sopra, per lo stesso motivo (mai una vera lettura disco/scrittura
   * trust nei test unitari di questo file).
   */
  caricaServerMcpFn = caricaServerMcpReale,
  verificaTrustMcpFn = verificaTrustMcpReale,
  fidaServerMcpFn = fidaServerMcpReale,
  /*
   * ⭐⭐⭐ 29/8 — FASE F, il pannello Capability hub: stesso pattern
   * iniettabile di caricaServerMcpFn sopra. Nessun verificaTrust/fida
   * qui — le skill non hanno un gate di fiducia, vedi skill-registry.mjs.
   * ⛔ Nome `caricaSkillRegistroFn`, non `caricaSkillFn`: quel nome è
   * già preso in agent-service.mjs per un ruolo diverso (il callback
   * nome→corpo passato al kernel) — due cose distinte, mai lo stesso
   * nome per evitare confusione a chi legge.
   */
  caricaSkillRegistroFn = caricaSkillReale,
  /*
   * ⭐⭐⭐ 29/8 — FASE N, il pannello Capability hub: stesso pattern
   * iniettabile di caricaSkillRegistroFn appena sopra, stesso motivo —
   * nessun gate di fiducia, una voce di Libreria è un file locale come
   * un altro (vedi library-store.mjs). Nome `elencaVociRegistroFn`,
   * non `elencaVociFn`: quel nome è già preso in agent-service.mjs per
   * il punto di contatto I/O dei 4 callback del modello — stessa
   * distinzione di caricaSkillRegistroFn/caricaSkillFn appena sopra.
   */
  elencaVociRegistroFn = elencaVociReale,
  /*
   * ⭐⭐⭐ FASE N, quarto sistema (30/8), il pannello Capability hub:
   * stesso ruolo di elencaVociRegistroFn appena sopra — a differenza
   * di quello, però, chiama `elencaNoteRegistroFn({cartella:
   * cartellaNote})`, MAI `voce.cartella` (le note sono GLOBALI, non
   * di questa sessione — vedi la doc in notes-store.mjs).
   */
  elencaNoteRegistroFn = elencaNoteReale,
  /*
   * ⭐⭐⭐ FASE N, quinto sistema (30/8), il pannello Capability hub:
   * stesso ruolo di elencaNoteRegistroFn appena sopra. Chiama
   * `elencaAttivitaRegistroFn({cartella: cartellaAttivita})`, MAI
   * `voce.cartella`.
   */
  elencaAttivitaRegistroFn = elencaAttivitaReale,
  /*
   * ⭐⭐⭐ FASE N, sesto sistema (30/8), il pannello Capability hub:
   * stesso ruolo di elencaAttivitaRegistroFn appena sopra.
   */
  elencaMemorieRegistroFn = elencaMemorieReale,
  /*
   * ⭐⭐⭐ 29/8 — FASE G, esecuzione. Stesso pattern REALE di
   * `cartellaTrustMcp`/`cartellaTrustHook` sopra — un default relativo
   * a QUESTO file, fuori dal workspace di ogni progetto (il trust di
   * un plugin è una decisione dell'OWNER su questa macchina, mai
   * qualcosa che un progetto clonato può auto-concedersi scrivendo un
   * file — vedi plugin-registry.mjs, stesso principio di mcp-registry.mjs).
   * `preparaToolPluginPerSessioneFn` (dentro agent-service.mjs) usa lo
   * STESSO `caricaPluginFn`/`verificaTrustPluginFn` di produzione — qui
   * sono iniettabili solo per il pannello Capability hub di sola
   * lettura (elencaPlugin/fidaPlugin sotto), stesso confine già preso
   * per caricaServerMcpFn/verificaTrustMcpFn.
   */
  cartellaTrustPlugin = fileURLToPath(new URL('../.plugin-trust/', import.meta.url)),
  caricaPluginFn = caricaPluginReale,
  verificaTrustPluginFn = verificaTrustPluginReale,
  fidaPluginFn = fidaPluginReale,
  /*
   * ⭐⭐⭐ FASE N, quarto sistema (30/8) — Notes, GLOBALE non per-progetto
   * (vedi la doc in notes-store.mjs). Stesso pattern REALE di
   * `cartellaTrustHook`/`cartellaTrustMcp`/`cartellaTrustPlugin` sopra —
   * un default relativo a QUESTO file, fuori dal workspace di ogni
   * progetto. A differenza di `cartellaStore` (FASE L): un default
   * reale QUI è sicuro perché le scritture sono rare e gated
   * (`strumentiEstesi` deve nominare `notes_create`/`notes_update` E il
   * modello deve scegliere di chiamarli — mai "ad ogni evento" come il
   * broadcast di sessione).
   */
  cartellaNote = fileURLToPath(new URL('../.notes-store/', import.meta.url)),
  /*
   * ⭐⭐⭐ FASE N, quinto sistema (30/8) — Tasks, GLOBALE come Notes
   * (vedi la doc in tasks-store.mjs). Stesso pattern reale.
   */
  cartellaAttivita = fileURLToPath(new URL('../.tasks-store/', import.meta.url)),
  /*
   * ⭐⭐⭐ FASE N, sesto sistema (30/8) — Memory, GLOBALE come Notes/Tasks
   * (vedi la doc in memory-store.mjs).
   */
  cartellaMemoria = fileURLToPath(new URL('../.memory-store/', import.meta.url)),
  /*
   * ⭐⭐⭐ FASE N, ottavo sistema (30/8) — Deep Research, "fetta onesta".
   * A DIFFERENZA di Notes/Tasks/Memory (cartelle GLOBALI qui sopra):
   * Deep Research è PER-PROGETTO, come Libreria — nessun default reale
   * qui, la cartella di una ricerca è SEMPRE quella della sessione che
   * l'ha avviata (thread attraverso `avviaESegui`, mai un parametro di
   * questo costruttore). Solo le FUNZIONI di store sono iniettabili
   * (stesso principio DI di ogni altro store in questo file), non una
   * cartella. `randomUUIDFn` è l'id generator della ricerca (== il
   * sessionId della sessione che la esegue, vedi research-orchestrator.mjs
   * sul perché) — stesso `randomUUID` già importato per `avviaESegui`
   * stesso, iniettabile qui separatamente per i test.
   */
  creaRicercaFn = creaRicercaReale, leggiRicercaFn = leggiRicercaReale, aggiornaRicercaFn = aggiornaRicercaReale,
  eliminaRicercaFn = eliminaRicercaReale, elencaRicercheFn = elencaRicercheReale,
  /*
   * ⭐ L2 (11/09/2026) — il LETTORE del rapporto depositato, iniettabile come gli altri cinque.
   * ⛔ Non è un vezzo di simmetria: da oggi il rapporto è un file su disco
   *   (`.harness-ui-research/<id>/rapporto.md`), quindi senza questa porta un test del registro
   *   andrebbe a leggere il filesystem VERO della macchina che lo esegue — cioè misurerebbe
   *   l'ambiente invece dell'oggetto. Il default resta la lettura vera.
   */
  leggiRapportoFn = leggiRapportoReale,
  /*
   * ⭐⭐⭐ L4 (11/09/2026) — LE SEI PORTE DEL GIORNALE, iniettabili per lo STESSO motivo di
   * `leggiRapportoFn` qui sopra, e stavolta il motivo si è fatto vedere invece di restare
   * teorico: con i default reali, i test dell'orchestratore hanno creato `C:\p` e `C:\progetto`
   * sul disco della macchina — cioè hanno misurato l'ambiente invece dell'oggetto, la lezione
   * del 10/09. Da qui in giù, un test del registro non tocca un filesystem vero.
   *
   * ⛔ Il default resta la scrittura vera: il prodotto scrive davvero il giornale.
   */
  accodaEventoFn = accodaEventoReale,
  leggiGiornaleFn = leggiGiornaleReale,
  leggiPianoFn = leggiPianoReale,
  statRapportoFn = statRapportoReale,
  elencaFontiFn = elencaFontiReale,
  leggiIstantaneaCacheFn = leggiIstantaneaCacheReale,
  scriviIstantaneaCacheFn = scriviIstantaneaCacheReale,
  /*
   * ⭐⭐⭐ L5 (12/09/2026) — IL LETTORE DI PAGINE della ri-verifica nel tempo, iniettabile per lo
   * stesso motivo di tutte le altre: senza, una prova di `riverificaRicerca` uscirebbe **in
   * rete** dalla macchina che esegue la suite. Il default è quello vero, lo stesso che usa
   * l'attrezzo `naviga` (validazione contro gli indirizzi interni già scritta e provata).
   */
  leggiPaginaFn = leggiPaginaPerLaVista,
  /*
   * ⭐⭐⭐⭐ L9 (12/09/2026) — LE CINQUE PORTE DEL DISCO E LE DUE DEL MODELLO.
   *
   * Le cinque del disco (piano, fonte, indice) per la ragione già pagata di L4: con i default
   * reali un test scriverebbe nel filesystem VERO della macchina che lo esegue.
   *
   * ⛔⛔ Le due del modello sono il GIUDICE della ricerca approfondita, e vanno lette insieme:
   *   `chiediAlModelloFn`  — una domanda sola, senza attrezzi (`agent-service`), con la chiave
   *                          LETTA AL MOMENTO (`chiaveFn`) come ogni altra chiamata;
   *   `modelliGiudiceFn`   — CHI potrebbe giudicare. La scelta la fa `talosResearchPickJudge`
   *                          («chiunque tranne l'autore»), mai questa funzione.
   * ⛔ Il default di `modelliGiudiceFn` guarda `modello` — il modello predefinito del server —
   *   e basta: è l'unico che questo registro conosce senza inventarsi un catalogo. Se la ricerca
   *   gira su quel modello, `talosResearchPickJudge` non trova nessun altro e risponde `null`:
   *   allora il rapporto esce con `judge: null` e lo DICE. ⛔ Mai il ripiego opposto — l'autore
   *   che timbra sé stesso — misurato da Panickssery/Bowman/Feng (arXiv:2404.13076): gli LLM
   *   riconoscono i propri testi e li premiano.
   * ⛔ DEBITO DICHIARATO, non nascosto: finché la persona non può scegliere un modello giudice
   *   dalle Impostazioni, una ricerca avviata sul modello predefinito non avrà mai un giudice.
   *   È un lotto di UI, non di motore, e il motore è già pronto a riceverlo.
   */
  scriviPianoFn = scriviPianoReale,
  scriviFonteFn = scriviFonteReale,
  leggiFonteFn = leggiFonteReale,
  scriviIndiceFontiFn = scriviIndiceFontiReale,
  leggiIndiceFontiFn = leggiIndiceFontiReale,
  chiediAlModelloUnaVoltaFn = chiediAlModelloUnaVoltaReale,
  modelliGiudiceFn = null,
  salvaVoceLibreriaFn = salvaVoceLibreriaReale, leggiVoceLibreriaFn = leggiVoceLibreriaReale, eliminaVoceLibreriaFn = eliminaVoceLibreriaReale,
  /* ⭐⭐⭐⭐ 10/09/2026 — le tre porte nuove del CRUD Libreria lato persona (vedi i metodi
     `scaricaVoceLibreria`/`rinominaVoceLibreria`/`rivelaVoceLibreria`). `eliminaVoceLibreriaFn`
     qui sopra c'era già e si riusa com'è: è la STESSA cancellazione che chiama il modello. */
  leggiBytesVoceLibreriaFn = leggiBytesVoceLibreriaReale, rinominaVoceLibreriaFn = rinominaVoceLibreriaReale,
  origineVoceLibreriaFn = origineVoceLibreriaReale,
  randomUUIDFn = randomUUID,
  /*
   * ⭐⭐⭐⭐ FASE N, nono e ultimo sistema (30/8) — Tool Forge. GLOBALE
   * come Notes/Tasks/Memory (vedi la doc in tool-forge-store.mjs sul
   * perché) — stesso pattern REALE di cartellaMemoria: un default vero
   * qui è sicuro perché le scritture sono rare e gated (`tool_create`
   * deve essere nominato in strumentiEstesi E il modello deve
   * scegliere di chiamarlo). `elencaToolForgiatiFn`/`abilitaToolForgiatoFn`
   * servono al pannello Capability hub — `abilitaToolForgiato` è
   * l'UNICA mutazione owner-facing di tutta FASE N (vedi la doc in
   * tool-forge-store.mjs: enable/disable non è mai un tool del
   * modello, nemmeno sul mobile).
   */
  cartellaForge = fileURLToPath(new URL('../.tool-forge-store/', import.meta.url)),
  elencaToolForgiatiFn = elencaToolForgiatiReale,
  abilitaToolForgiatoFn = abilitaToolForgiatoReale,
  modello,
  chiave,
  /** Getter opzionale: consente a Provider settings di aggiornare OpenRouter senza riavviare il server. */
  chiaveFn = null,
  cartelleProgetto = [],
  clock = () => new Date(),
  /*
   * ⭐⭐⭐ 04/9 — W1-02: le soglie della guardia di stallo. Sono un PARAMETRO
   * del registro, non numeri dentro la logica: il default vive in un posto
   * solo (`SOGLIE_STALLO_PREDEFINITE`) ed è tarato sui nostri numeri veri
   * (04/9: 65 ripetizioni identiche su 634 chiamate, e 33 chiamate al massimo
   * in una sessione che esaurisce i giri — vedi il commento del blocco sopra).
   */
  soglieStallo = SOGLIE_STALLO_PREDEFINITE,
  /*
   * ⭐⭐⭐ 28/8, owner: "l'harness desktop diventa l'unica chat, con tutti i
   * tool come la generazione di artefatti oppure la ricerca web" — sempre
   * offerti, non una scelta per sessione (a differenza di `modello`): è
   * la superficie stessa che cambia, non un'opzione dentro la superficie
   * di sempre. `ricercaWeb` invece resta di configurazione server (§config.mjs,
   * `undefined` se non impostata — il tool resta offerto ma dichiara
   * onestamente "not configured", mai un tentativo senza credenziali).
   */
  // ⭐ 28/8 — quarto, stesso principio: document_create è ATTREZZI_ESTESI[2] nel kernel (time_now è il terzo), offerto sempre come gli altri.
  // ⭐ FASE C (28/8) — quinto: delega_sottotask è ATTREZZI_ESTESI[4] nel kernel, stesso principio.
  // ⭐ FASE H (29/8) — sesto: generate_image è ATTREZZI_ESTESI[5] nel kernel, stesso principio.
  // ⭐ FASE N (29/8) — settimo-decimo: i 4 tool di lettura Libreria (ATTREZZI_ESTESI[6..9] nel kernel), stesso principio — nessun gate, sempre offerti come gli altri sei.
  // ⭐ FASE N (29/8), seconda fetta — undicesimo-tredicesimo: le 3 mutazioni Libreria (ATTREZZI_ESTESI[10..12] nel kernel). MUTANO davvero (passano dal gate di permesso nel kernel stesso), ma il loro OFFRIRLE al modello segue lo stesso principio "schema fisso, sempre in lista" di document_create/generate_image — è verificaPermessoScrittura dentro talosHarness.mjs, non questa lista, a decidere se una chiamata passa.
  // ⭐ FASE N (29/8), terza fetta — quattordicesimo: library_context_policy_update (ATTREZZI_ESTESI[13]). Stesso principio "sempre in lista" — il kernel lo rifiuta comunque senza un canale di approvazione presente (ATTREZZI_SEMPRE_DA_CONFERMARE, nessuna eccezione nemmeno con permessiPerAttrezzo:'sempre').
  // ⭐ FASE N, quarto sistema (30/8) — quindicesimo-diciottesimo: i 4 tool Notes (ATTREZZI_ESTESI[14..17] nel kernel). Le 3 mutazioni MUTANO davvero (gate nel kernel stesso) ma seguono lo stesso principio "sempre in lista" di document_create/library_rename.
  // ⭐ FASE N, quinto sistema (30/8) — diciannovesimo-ventitreesimo: i 5 tool Tasks (ATTREZZI_ESTESI[18..22] nel kernel). Le 4 mutazioni MUTANO davvero, stesso principio.
  // ⭐ FASE N, sesto sistema (30/8) — ventiquattresimo-ventisettesimo: i 4 tool Memory (ATTREZZI_ESTESI[23..26] nel kernel). Le 3 mutazioni MUTANO davvero, stesso principio.
  // ⭐ FASE N, ottavo sistema (30/8) — ventottesimo-trentacinquesimo: gli 8 tool Deep Research (ATTREZZI_ESTESI[27..34] nel kernel). Le 6 mutazioni MUTANO davvero, stesso principio.
  strumentiEstesi = [
    'web_search', 'artifact_create', 'document_create', 'time_now', 'delega_sottotask', 'generate_image',
    'library_list', 'library_search', 'library_read', 'library_file_origin',
    'library_rename', 'library_delete', 'library_export',
    'library_context_policy_update',
    'notes_list', 'notes_create', 'notes_update', 'notes_delete',
    'tasks_list', 'tasks_create', 'tasks_complete', 'tasks_update', 'tasks_delete',
    'memory_search', 'memory_write', 'memory_update', 'memory_delete',
    'research_list', 'research_start', 'research_read', 'research_rename',
    'research_pause', 'research_resume', 'research_cancel', 'research_delete',
    /*
     * ⭐⭐⭐ L1 (11/09/2026) — `research_deposit`, il nono di Deep Research. Sta in lista come
     * tutti gli altri, MA il kernel non lo offre mai a una sessione che non è una ricerca: è
     * `attrezziNegatiDalLivello` (talosHarness.mjs) a filtrare la lista sul LIVELLO, non
     * questo elenco. ⛔ Nelle chat normali (`Workspace write`/`Full access`) resta quindi
     * offerto e innocuo — depositerebbe in una cartella di ricerca che non esiste, e lo dice:
     * «this session is not one». Toglierlo anche lì vorrebbe un filtro per NOME oltre che per
     * livello, cioè la seconda lista che diverge.
     */
    'research_deposit',
    'tool_create',
    /*
     * ⭐⭐⭐ PO-12 (13/09/2026) — `file_edit`. Senza questo nome l'attrezzo
     * esiste nel kernel, e' provato, ed e' invisibile: `ATTREZZI_ESTESI`
     * dichiara, questa lista ACCENDE. La corsia PO-12 non e' consegnata
     * finche' non e' qui.
     */
    'file_edit',
  ],
  ricercaWeb,
  // ⭐ 04/9, R-03 — se presente vince su `ricercaWeb`: letta a OGNI giro (come `chiaveFn`), così una fonte cambiata dalle Impostazioni vale dal giro successivo senza riavvio. Restituisce { ricercaWeb, richiediRicercaFn }.
  ricercaWebFn = null,
  /*
   * ⭐⭐⭐ 29/8 — FASE H, generate_image. A differenza di `ricercaWeb` sopra:
   * inoltrata SENZA logica propria — la decisione (quale endpoint
   * OpenRouter, quale modello) vive tutta in `agent-service.mjs`/
   * `image-generator.mjs`. `undefined` qui rompe l'attrezzo con un
   * messaggio onesto (vedi `onImmagine` in agent-service.mjs) — non
   * dovrebbe mai succedere in produzione (config.mjs non torna mai
   * `undefined`), ma nessun test di questo file lo presume.
   */
  immagine,
  persistGeneratedImageFn,
  removeGeneratedImageFn,
  /*
   * ⭐⭐⭐ 29/8 — FASE D, firma Ed25519 delle ricevute. Stesso principio di
   * `ricercaWeb` appena sopra: configurazione di SERVER (§config.mjs,
   * `undefined` se non impostata), non per sessione — inoltrata SENZA
   * logica propria, la decisione (dove vive la chiave, chi la ruota) vive
   * tutta in `config.mjs`/`harness-receipt-keypair.mjs`.
   */
  firma,
  localRuntimes = {},
  /*
   * ⭐⭐⭐ O-01 (04/9) — L'ELENCO VERO DEGLI ATTREZZI, per il Capability hub.
   * Torna `{base, estesi}` letti dal kernel (runtime-owner-adapter.mjs,
   * `attrezziKernel()`), MAI una copia dei nomi tenuta qui: il foglio del
   * pulsante «+» mostrava sette nomi scritti a mano mentre `strumentiEstesi`
   * qui sopra ne offre altri 36. ⛔ `null` = nessun kernel collegato: il
   * pannello dice «non osservato», non elenca zero attrezzi.
   */
  attrezziKernelFn = null,
} = {}) {
  const preparaTask = preparaEsecuzioneFn ?? ((taskId) => preparaEsecuzioneReale(taskId, taskCatalogProvider));
  const sessioni = new Map();
  const contextDeliveries = new WeakMap();
  let ultimoRipristino = { ripristinate: 0, totali: 0 };
  let sessioniCorrotte = [];
  let sessioniScartate = []; // ⭐ 04/9, W0-01 — [{ sessionId, motivo, dettaglio? }]
  // ⭐⭐⭐ FASE C (28/8) — istanziato qui: `avviaESegui` è una function declaration (issata), riferibile prima della sua definizione testuale più sotto.
  const subagentOrchestrator = creaSubagentOrchestrator({ sessioni, avviaESeguiFn: avviaESegui, cartellaEsisteFn });
  /*
   * ⭐⭐⭐ FASE N, ottavo sistema (30/8) — Deep Research. Stesso principio
   * di subagentOrchestrator appena sopra: `avviaESegui` issata, `sessioni`
   * la STESSA Map — nessun secondo registro nascosto.
   */
  const researchOrchestrator = creaResearchOrchestrator({
    sessioni, avviaESeguiFn: avviaESegui,
    creaRicercaFn, leggiRicercaFn, aggiornaRicercaFn, eliminaRicercaFn, elencaRicercheFn, leggiRapportoFn,
    // ⭐ L4 — il giornale, il piano, le fonti e l'istantanea della cache: stessa disciplina DI.
    accodaEventoFn, leggiGiornaleFn, leggiPianoFn, statRapportoFn, elencaFontiFn,
    leggiIstantaneaCacheFn, scriviIstantaneaCacheFn, leggiPaginaFn,
    /*
     * ⭐⭐⭐⭐ L9 (12/09/2026) — il piano, le fonti tenute, l'indice, e il GIUDICE.
     *
     * ⛔ `chiediAlModelloFn` porta la chiave LETTA AL MOMENTO (`chiaveFn`), come ogni altra
     *   chiamata di questo registro: una chiave cambiata dalle Impostazioni vale dal giro dopo,
     *   senza riavvio. Senza chiave la chiamata fallirebbe, e `talosResearchVerify` scrive
     *   «leggiudice non ha risposto» sull'affermazione — onesto, e diverso da «non ce n'era uno».
     */
    scriviPianoFn, scriviFonteFn, leggiFonteFn, scriviIndiceFontiFn, leggiIndiceFontiFn,
    chiediAlModelloFn: ({ modello: modelloGiudice, prompt }) => chiediAlModelloUnaVoltaFn({
      modello: modelloGiudice,
      chiave: typeof chiaveFn === 'function' ? chiaveFn() : chiave,
      prompt,
    }),
    /*
     * ⛔ Il default è «il modello predefinito del server, e nient'altro»: l'unico che questo
     *   registro conosce di sicuro. `talosResearchPickJudge` lo scarta da solo quando è anche
     *   l'autore, e allora non c'è giudice — detto, mai aggirato.
     */
    modelliGiudiceFn: typeof modelliGiudiceFn === 'function'
      ? modelliGiudiceFn
      : () => (typeof modello === 'string' && modello
        ? [{ id: modello, provider: 'openrouter', model: modello }]
        : []),
    salvaVoceLibreriaFn, leggiVoceLibreriaFn, eliminaVoceLibreriaFn, randomUUIDFn,
  });

  /**
   * ⭐⭐⭐ L5 (12/09/2026) — LA FORMA COMUNE di pausa e ripresa, scritta una volta.
   *
   * Le due azioni differiscono per una riga (quale funzione dell'orchestratore chiamare) e per
   * tutto il resto sono identiche: sessione viva? ricerca sul disco? poi l'esito.
   *
   * ⛔ Il `presente` letto qui NON è una seconda lettura sprecata: è ciò che separa «questa
   *   ricerca non esiste» (404) da «esiste, ma non è nello stato per questo» (409, «a request
   *   conflict with the current state of the target resource» — MDN, letta il 12/09/2026, il
   *   cui esempio è esattamente un lavoro che non si può avviare perché già in corso). Senza,
   *   ogni rifiuto dell'orchestratore sarebbe indistinguibile da un id sbagliato.
   * ⛔ Il testo dell'orchestratore è in inglese perché è scritto per il MODELLO (è la risposta
   *   degli attrezzi `research_pause`/`research_resume`) e non si tocca: qui viaggia in
   *   `motivo`, che la rotta mette nel registro diagnostico, non a schermo. Alla persona la
   *   frase italiana la dà lo `stato` riletto — `motivoDelloStato` la scrive già, in un posto solo.
   */
  async function azioneSuRicerca(sessionId, ricercaId, azione) {
    const voce = sessioni.get(sessionId);
    if (!voce) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
    let presente;
    try {
      presente = await leggiRicercaFn({ cartella: voce.cartella, id: ricercaId });
    } catch (errore) {
      if (errore instanceof ResearchStoreError) return { ok: false, ricerca: null, motivo: errore.message };
      throw errore;
    }
    if (!presente) return { ok: true, ricerca: null, motivo: null };
    const esito = await azione(voce.cartella, ricercaId);
    if (!esito?.ok) return { ok: false, ricerca: undefined, motivo: esito?.esito ?? 'azione non riuscita' };
    return { ok: true, ricerca: undefined, esito: esito.esito, motivo: null };
  }

  /*
   * ⛔⛔⛔ 27/8, owner: "ricevo risposte duplicate" — riprodotto e trovato.
   * `iscriviti()` (sotto) rimanda SEMPRE tutto `voce.eventi` a un nuovo
   * ascoltatore, e QUALUNQUE nuova connessione SSE sulla stessa sessione ne
   * apre una — non solo un client che si ricollega dopo una caduta di rete
   * (l'EventSource nativo lo fa DA SOLO, senza che app.js lo richieda), ma
   * anche `runDirectShell()` (`!comando`), che apre una connessione FRESCA
   * apposta. In entrambi i casi il buffer intero riparte dall'evento 1: i
   * bubble di tool/stato già a schermo (mai idempotenti — vedi
   * appendToolNote/appendStatusNote) si duplicano, e il testo già scritto in
   * un bubble esistente (`ensureAssistantMessageElement`, che INVECE trova
   * lo stesso messageId) si RADDOPPIA dentro lo stesso bubble.
   * ⇒ Ogni evento porta un `_sequenza` monotono, unico per sessione,
   * assegnato UNA sola volta qui — lo stesso oggetto viene ri-servito ad
   * ogni replay, quindi il numero resta identico. Il frontend
   * (handleRealEvent) lo usa per scartare un evento già visto, invece di
   * provare a rendere idempotente ogni singolo handler separatamente.
   */
  /**
   * ⭐⭐⭐ 30/8 — piano "Board — da campagne TALOS-BANCO a cruscotto
   * sessioni": il costo/consumo per una sessione, per la Board ridisegnata.
   * ⛔ Deliberatamente NESSUNA scrittura nuova sul disco: `evento.totali`
   * (talosHarness.mjs, `conto` — `{prompt_tokens, completion_tokens,
   * cached_tokens, giri}`) arriva già dentro un evento `StateDelta` reale
   * su `path:'/usage'` (agui-events.mjs, `eventoPerUsage`), REPLACE sempre
   * perché è già una somma cumulativa DENTRO UNA SOLA ESECUZIONE — l'ULTIMO
   * che compare è il totale di QUELL'INVIO, non della sessione (il kernel
   * dichiara `conto` dentro il ciclo e lo azzera a ogni invio:
   * `talosHarness.mjs:4560`). ⛔ 06/9, CB-04: il totale della conversazione
   * lo dà `usageSessioneDaEventi`, che somma i finali di ogni esecuzione;
   * questa funzione resta perché il tetto dei giri parla dell'invio in corso
   * e di nient'altro. Quella storia è GIÀ persistita per
   * intero (ogni evento passa da `broadcast`, che scrive su
   * `.sessions-store/`) — un secondo campo mutabile scritto a parte
   * duplicherebbe una fonte di verità già esistente, stessa disciplina di
   * `conclusa`/`messaggiFinali` derivati da `ripristina()` sopra, non
   * salvati come flag a sé. Funziona identica per una sessione VIVA
   * (`voce.eventi` popolato da `broadcast`) e una RIPRISTINATA
   * (`voce.eventi` popolato da `ripristina()` dallo stesso JSONL).
   * @returns {{prompt_tokens:number,completion_tokens:number,cached_tokens:number,giri:number}|null}
   */
  function ultimoEsitoDaEventi(eventi) {
    for (let i = eventi.length - 1; i >= 0; i -= 1) {
      const tipo = eventi[i]?.type;
      if (tipo === 'RunError') return 'errore';
      if (tipo === 'RunFinished') return 'successo';
      if (tipo === 'RunStarted') return null;
    }
    return null;
  }

  /*
   * ⛔⛔ 07/9, misurato dal vivo: premi «ferma», il giro si chiude come chiedevi, e la riga
   * della sidebar dice **«errore»**. Fermare non e sbagliare. Il registro il motivo ce l'ha gia
   * (`chiusuraDaEventi`: «fermata», «giri-finiti», «errore»), ma viveva solo nella rotta
   * `/metrics`, una sessione alla volta: l'ELENCO — cioe la sidebar, il posto dove lo stato si
   * legge davvero — riceveva soltanto `ultimoEsito: 'errore'` e non poteva fare di meglio.
   *
   * Ricerca 07/09/2026 (letta oggi): un annullamento chiesto dalla
   * persona non va riportato ne come fine pulita (`end_turn`: «fa sembrare completamento cio che
   * era uno stop») ne come guasto dell'agente (`agent_error` su `MessageAbortedError`: «fa sembrare
   * un guasto un gesto intenzionale»); lo stato dell'arte lo tiene come terzo esito, «cancelled».
   *
   * Qui il terzo esito ha gia un nome nostro: si porta fuori, non se ne inventa uno.
   */
  function motivoChiusuraDaEventi(eventi) {
    const ordinati = Array.isArray(eventi) ? eventi : [];
    for (let i = ordinati.length - 1; i >= 0; i -= 1) {
      const evento = ordinati[i];
      if (evento?.type === 'RunError') {
        const codice = typeof evento.code === 'string' ? evento.code : null;
        if (codice === 'giri-esauriti') return 'giri-finiti';
        if (codice === 'fermato') return 'fermata';
        return 'errore';
      }
      if (evento?.type === 'RunFinished') return 'fine-lavoro';
      if (evento?.type === 'RunStarted') return null;
    }
    return null;
  }

  function usageDaEventi(eventi) {
    for (let indice = eventi.length - 1; indice >= 0; indice -= 1) {
      const evento = eventi[indice];
      if (evento?.type !== 'StateDelta') continue;
      const voceUsage = evento.delta?.find((d) => d.path === '/usage');
      if (voceUsage) return voceUsage.value;
    }
    return null;
  }

  /**
   * SESSION-RESTORE-LAZY-WATCHER-24 — una cronologia ripristinata è stato
   * passivo, non un workspace aperto. Il watcher ricorsivo si attiva soltanto
   * quando parte davvero un giro e resta uno solo per la vita della voce.
   * `guardaWorkspaceFn` conserva inoltre la propria deduplica per cartella,
   * quindi sessioni vive sullo stesso progetto condividono l'handle fisico.
   */
  function attivaWatcherSessione(voce, cartella) {
    if (typeof voce.fermaWatcher === 'function') return;
    if (typeof cartella !== 'string' || cartella.length === 0) return;
    try {
      voce.fermaWatcher = guardaWorkspaceFn(cartella, (percorsi) => broadcast(voce, workspaceChanged({ percorsi })));
    } catch {
      // Il refresh automatico è accessorio: un watcher indisponibile non deve
      // impedire né il boot né la ripresa della conversazione.
      voce.fermaWatcher = null;
    }
  }

  function fermaWatcherSessione(voce) {
    const fermaWatcher = voce?.fermaWatcher;
    voce.fermaWatcher = null;
    if (typeof fermaWatcher !== 'function') return;
    try { fermaWatcher(); } catch { /* il watcher è accessorio e la chiusura deve restare idempotente */ }
  }

  function rilasciaWatcherSessioneSeInattiva(voce) {
    if (!(voce.conclusa || voce.interrotta)) return;
    if (voce.ascoltatori.size > 0) return;
    fermaWatcherSessione(voce);
  }

  /**
   * Ricostruisce soltanto il transcript conversazionale che gli eventi
   * persistiti provano davvero. Serve quando un turno termina con RunError
   * prima che il runtime restituisca `messaggiFinali`: la chat resta
   * riprendibile sullo stesso id senza promuovere reasoning, tool parziali o
   * testo assistant mai chiuso a messaggi canonici.
   */
  function messaggiRipristinabiliDaEventi(voce) {
    let messaggi = [];
    const testiAssistant = new Map();
    const aggiungi = (role, content) => {
      if ((role !== 'user' && role !== 'assistant') || !(typeof content === 'string' ? content.trim() !== '' : Array.isArray(content) && content.length > 0)) return;
      const messaggio = { role, content };
      const ultimo = messaggi.at(-1);
      if (ultimo?.role === messaggio.role && JSON.stringify(ultimo.content) === JSON.stringify(messaggio.content)) return;
      messaggi.push(messaggio);
    };
    // Gli eventi legacy di test/primi build non portavano ancora `input` nel
    // RunStarted: l'intestazione conserva comunque il prompt originale e
    // deve precedere qualunque risposta assistant completa.
    aggiungi('user', imageMessageContent(voce.task?.consegna ?? voce.task?.consegnaCorta, voce.task?.immagini));
    for (const evento of voce.eventi ?? []) {
      if (evento?.type === 'RunStarted') {
        if (Array.isArray(evento.input)) {
          const canonici = evento.input
            .filter((item) => item && (item.role === 'user' || item.role === 'assistant') && (typeof item.content === 'string' ? item.content.trim() !== '' : Array.isArray(item.content) && item.content.length > 0))
            .map((item) => ({ role: item.role, content: item.content }));
          if (canonici.length > 0) messaggi = canonici;
        } else {
          aggiungi('user', imageMessageContent(evento.input?.consegna ?? evento.input?.consegnaCorta, evento.input?.immagini));
        }
        continue;
      }
      if (evento?.type === 'TextMessageStart' && evento.role === 'assistant' && typeof evento.messageId === 'string') {
        testiAssistant.set(evento.messageId, '');
        continue;
      }
      if (evento?.type === 'TextMessageContent' && testiAssistant.has(evento.messageId) && typeof evento.delta === 'string') {
        testiAssistant.set(evento.messageId, testiAssistant.get(evento.messageId) + evento.delta);
        continue;
      }
      if (evento?.type === 'TextMessageEnd' && testiAssistant.has(evento.messageId)) {
        aggiungi('assistant', testiAssistant.get(evento.messageId));
        testiAssistant.delete(evento.messageId);
      }
    }
    return messaggi;
  }

  function persistiMessaggiFinali(voce, versioneGiro) {
    if (!cartellaStore || !Array.isArray(voce.messaggiFinali) || !voce.sessionId) return;
    try {
      registraRigaSyncFn({
        cartellaStore,
        sessionId: voce.sessionId,
        record: { tipo: 'messaggi-finali', versioneGiro, messaggiFinali: voce.messaggiFinali },
      });
    } catch (errore) {
      console.error(`[session-store] messaggiFinali non scritti per ${voce.sessionId}:`, errore instanceof Error ? errore.message : errore);
    }
  }

  /*
   * ⭐⭐⭐ BC-07 (11/09/2026) — I TEMPI DI UN GIRO, SU DISCO. Una riga per giro, non un campo per evento.
   *
   * Owner: «dobbiamo indagare perché ci sta così tanto a rispondere usando i modelli api». La prima
   * indagine è stata possibile solo sui TOKEN, perché il tempo non esisteva: `metricheDaEventi`
   * calcola già il tempo al primo token, ma dagli istanti in `voce.istantiEvento`, che vivono SOLO
   * IN MEMORIA — la doc di `broadcast` lo dichiara apertamente, e la conseguenza è che di latenza
   * si può parlare solo per aneddoti: nessuna sessione passata è misurabile, e ogni indagine va
   * rifatta a mano su una sessione ancora viva.
   *
   * ⛔ L'obiezione che aveva tenuto i tempi fuori dal disco è SERIA e resta valida: un campo in più
   *   sull'oggetto evento finirebbe in OGNI riga di OGNI sessione (22.095 righe, nella sessione che
   *   ha aperto questo debito) e sarebbe una seconda fonte di verità dentro gli eventi AG-UI.
   * ⇒ Qui non si tocca nessun evento: si scrive UN record `tipo:'tempi-giro'` alla fine del giro,
   *   accanto a `messaggi-finali` e `impostazioni-sessione` che già vivono lì. Nella stessa
   *   sessione: **una riga per giro invece di un campo su 22.095**.
   *
   * ⭐ COSA ci va dentro, e perché non solo il TTFT. Ricerca 11/09/2026 — ClickHouse «LLM inference
   *   latency: TTFT, tokens per second, and what to measure», Braintrust «LLM call observability»,
   *   groundcover «AI Agent Observability»:
   *    · il TTFT da solo non basta: serve anche la DURATA TOTALE e i token in uscita, perché sono
   *      due fenomeni diversi (quanto ci mette a partire, quanto ci mette a scrivere);
   *    · e soprattutto i TOKEN IN INGRESSO di quel giro, perché — parole loro — «una regressione
   *      del TTFT spesso si scopre essere un prompt che è cresciuto». È esattamente il nostro caso
   *      (~17k token di elenco file): senza il denominatore, il tempo non è interpretabile.
   *    · le distribuzioni si leggono a p50/p95/p99, mai a media — ma quello è un lavoro del
   *      lettore, non di chi scrive: qui si registrano i fatti grezzi di un giro solo.
   *
   * ⛔ Non lancia mai e non blocca niente: un giro non si rompe perché una misura non si è scritta.
   *   Stessa disciplina della copia in Libreria e di `persistiMessaggiFinali` qui sopra.
   */
  /*
   * ⭐⭐ 14/09/2026 — LA CODA È DELLA SESSIONE, NON DELLA FINESTRA CHE L'HA SCRITTA. Owner: «i competitor lo fanno, lo
   *   facciamo anche noi». Trovato col giro vero del 13/09: un messaggio accodato non si vedeva in un'altra finestra né dopo
   *   una ricarica, e dopo uno stop il banner prometteva «parte alla fine di questo giro» su un giro già fermo.
   * Letto nei cloni il 14/09/2026:
   *   · Codex tiene la coda sul server, nel `ThreadStore`, con elenco, aggiunta, modifica, cancellazione e avvio
   *     (`app-server-protocol/src/protocol/common.rs:596-627`, `thread/queue/*`; `thread_queue_processor.rs`): ogni
   *     client la vede, e sopravvive a un riavvio.
   *   · Hermes desktop mette la coda IN PAUSA allo Stop (`app/chat/composer/index.tsx`, `haltRun`): «an explicit halt must
   *     not roll straight into the next queued prompt (that read as Stop not working; the queued text also seemed to
   *     vanish)»; a schermo «N Queued — paused», «Paused by Stop — resume sending the queued turns» (`i18n/en.ts`).
   *   · Da noi il kernel consegna un messaggio in coda SOLO quando il modello si ferma da solo (`talosHarness.mjs`, zero
   *     chiamate): dopo uno stop la coda restava viva e partiva in silenzio alla fine della risposta SUCCESSIVA.
   * ⇒ Ogni voce ha un id; lo stop mette in pausa; ogni cambio si annuncia a chi guarda con un `CUSTOM talos.coda` di
   *   SOLO TRASPORTO (effimero come WorkspaceChanged: niente `_sequenza`, mai in `voce.eventi`, BC-07) e si scrive in un
   *   record `coda` — l'ultimo vince al ripristino, come `impostazioni-sessione`.
   */
  function voceDiCoda(item) {
    if (typeof item === 'string') return { id: null, testo: item, immagini: [] };
    return { id: typeof item?.id === 'string' ? item.id : null, testo: String(item?.testo ?? ''), immagini: Array.isArray(item?.immagini) ? item.immagini : [] };
  }

  /** Quello che si mostra: niente riferimenti alle immagini, solo quante sono. */
  function statoCodaDi(voce) {
    const voci = (voce?.codaMessaggi ?? []).map(voceDiCoda).map(({ id, testo, immagini }) => ({ id, testo, immagini: immagini.length }));
    return { voci, inPausa: Boolean(voce?.codaInPausa) && voci.length > 0 };
  }

  function annunciaCoda(voce) {
    const value = statoCodaDi(voce);
    broadcast(voce, { type: 'CUSTOM', name: 'talos.coda', value });
    if (!cartellaStore || !voce?.sessionId) return;
    try {
      const voci = voce.codaMessaggi.map(voceDiCoda).map(({ id, testo, immagini }) => ({ id: id ?? randomUUID(), testo, ...(immagini.length ? { immagini } : {}) }));
      registraRigaSyncFn({ cartellaStore, sessionId: voce.sessionId, record: { tipo: 'coda', voci, inPausa: value.inPausa } });
    } catch (errore) {
      // ⛔ Stessa disciplina di `persistiTempiDelGiro`: una coda non scritta non rompe il giro, ma si DICE.
      console.error(`[session-store] coda non salvata per ${voce.sessionId}:`, errore instanceof Error ? errore.message : errore);
    }
  }

  function persistiTempiDelGiro(voce, versioneGiro) {
    if (!cartellaStore || !voce?.sessionId) return;
    try {
      const metriche = metricheDaEventi(voce.eventi, { istanti: voce.istantiEvento ?? null, adesso: clock().getTime() });
      /*
       * ⛔ L'usage si LEGGE DAGLI EVENTI (`usageDaEventi`), non da un campo sulla voce: è la
       *   stessa disciplina già dichiarata in cima al file — si legge ciò che è persistito, non si
       *   tiene una seconda copia. La prima stesura leggeva `voce.usage`, che non esiste: il test
       *   l'ha trovato subito (tokenDentro `null` invece di 29.148).
       */
      const usage = usageDaEventi(voce.eventi);
      /*
       * ⛔ Se non c'è NIENTE da dire non si scrive una riga di zeri: «non misurato» e «misurato e
       *   vale zero» sono fatti diversi, ed è la stessa disciplina di `usage` e del ledger.
       */
      if (!metriche?.registrato || metriche.primoToken?.ms === null) return;
      const durateRagionamento = durateRagionamentoDaEventi(voce.eventi, { istanti: voce.istantiEvento ?? null, soloUltimoGiro: true });
      registraRigaSyncFn({
        cartellaStore,
        sessionId: voce.sessionId,
        record: {
          tipo: 'tempi-giro',
          versioneGiro,
          modello: voce.modelId ?? voce.modello ?? null,
          primoTokenMs: metriche.primoToken.ms,
          primoVisibileMs: metriche.primoToken.msPrimoVisibile ?? null,
          tipoPrimoToken: metriche.primoToken.tipo ?? null,
          giriDelGiro: usage?.giri ?? null,
          tokenDentro: usage?.prompt_tokens ?? null,
          tokenFuori: usage?.completion_tokens ?? null,
          tokenDaCache: usage?.cached_tokens ?? null,
          // ⭐ 13/09 sera: quanto ha ragionato, per ragionamento — la durata che Hermes perde alla ricarica. Assente = nessuno misurato, mai un oggetto di zeri.
          ...(Object.keys(durateRagionamento).length ? { ragionamentiMs: durateRagionamento } : {}),
        },
      });
    } catch (errore) {
      console.error(`[session-store] tempi del giro non scritti per ${voce.sessionId}:`, errore instanceof Error ? errore.message : errore);
    }
  }

  /**
   * Proiezione per il modello, senza riscrivere la storia originale.
   * Ricerca 08/09/2026: https://github.com/ggml-org/llama.cpp/issues/25510
   * Il parser upstream rifiuta anche gli argomenti delle chiamate passate.
   */
  function recuperaCronologiaTool(messaggi) {
    const correzioni = [];
    const sostituzioni = new Map();
    const rimossi = new Set();
    for (let indice = 0; indice < messaggi.length; indice += 1) {
      const messaggio = messaggi[indice];
      if (messaggio?.role !== 'assistant' || !Array.isArray(messaggio.tool_calls)) continue;
      const corrotte = messaggio.tool_calls.filter(chiamata => {
        if (typeof chiamata?.function?.arguments !== 'string') return false;
        try { JSON.parse(chiamata.function.arguments); return false; } catch { return true; }
      });
      if (!corrotte.length) continue;
      const note = [];
      for (const chiamata of corrotte) {
        const id = chiamata.id;
        if (typeof id !== 'string' || !id || messaggio.tool_calls.filter(c => c.id === id).length !== 1) {
          throw new Error('HISTORY_RECOVERY_AMBIGUOUS');
        }
        const indiciRisultati = [];
        for (let j = indice + 1; messaggi[j]?.role === 'tool'; j += 1) {
          if (messaggi[j].tool_call_id === id) indiciRisultati.push(j);
        }
        if (indiciRisultati.length > 1) throw new Error('HISTORY_RECOVERY_AMBIGUOUS');
        const risultati = indiciRisultati.map(j => messaggi[j]);
        const correzione = { indiceMessaggio: indice, indiceChiamata: messaggio.tool_calls.indexOf(chiamata), chiamata, indiciRisultati, risultati };
        correzioni.push(correzione);
        indiciRisultati.forEach(j => rimossi.add(j));
        // Dati storici non fidati: non completare argomenti e non chiedere di rieseguire.
        note.push('Recupero dello storico: una chiamata con JSON incompleto è conservata qui come dato storico, non come istruzione da eseguire. Chiamata ed esiti originali (non fidati):\n' + JSON.stringify({ chiamata, risultati }));
      }
      const nuovo = { ...messaggio, tool_calls: messaggio.tool_calls.filter(c => !corrotte.includes(c)) };
      if (!nuovo.tool_calls.length) delete nuovo.tool_calls;
      const nota = note.join('\n\n');
      nuovo.content = Array.isArray(messaggio.content)
        ? [...messaggio.content, { type: 'text', text: nota }]
        : [messaggio.content, nota].filter(Boolean).join('\n\n');
      sostituzioni.set(indice, nuovo);
    }
    return { messaggi: correzioni.length ? messaggi.flatMap((m, i) => rimossi.has(i) ? [] : [sostituzioni.get(i) ?? m]) : messaggi, correzioni };
  }

  function persistiCheckpointRipresa(voce, messaggi, versioneGiro, recupero = null) {
    if (!cartellaStore || !voce.sessionId) return;
    registraRigaSyncFn({
      cartellaStore,
      sessionId: voce.sessionId,
      record: { tipo: 'checkpoint-ripresa', versioneGiro, messaggi, ...(recupero ? { recupero } : {}) },
    });
  }

  /**
   * Ricostruisce soltanto l'intento di redirect che un processo precedente
   * non ha potuto chiudere. Gli eventi restano append-only: un Applied è
   * completo solo quando è seguito dal nuovo RunStarted, mentre Cancelled e
   * Failed sono terminali per quello stesso redirectId.
   */
  function redirectOrfanoDaEventi(eventi) {
    let pendente = null;
    for (const evento of eventi) {
      if (evento?.type === 'RunRedirectRequested') {
        pendente = { redirectId: evento.redirectId, stato: 'richiesto' };
      } else if (evento?.type === 'RunRedirectApplied' && pendente?.redirectId === evento.redirectId) {
        pendente = { redirectId: evento.redirectId, stato: 'applicato' };
      } else if ((evento?.type === 'RunRedirectCancelled' || evento?.type === 'RunRedirectFailed') && pendente?.redirectId === evento.redirectId) {
        pendente = null;
      } else if (evento?.type === 'RunStarted' && pendente?.stato === 'applicato') {
        pendente = null;
      }
    }
    return pendente;
  }

  function ricordaRedirectAnnullato(voce, redirectId) {
    if (typeof redirectId !== 'string' || redirectId.length === 0) return;
    voce.redirectAnnullati ??= new Set();
    voce.redirectAnnullati.add(redirectId);
    while (voce.redirectAnnullati.size > 32) {
      voce.redirectAnnullati.delete(voce.redirectAnnullati.values().next().value);
    }
  }

  /* D3 — chi ha scritto cosa, per madre: Map madreId → Map percorso → [{figliaId, quando}].
     Vive quanto il processo, come il resto del registro vivo: serve a dire una collisione mentre
     succede, non a tenerne la storia (quella è negli eventi, già persistiti). */
  const scrittureDelleFiglie = new Map();

  /* ⛔ Merge del 10/09 — due aggiunte indipendenti nello stesso punto: la Map qui sopra (D3,
     collisioni fra figlie) e il parametro `durable` del Context Manager. Tenerne una sola
     avrebbe spento una funzione intera senza che nessun test lo dicesse. */
  function broadcast(voce, evento, { durable = false } = {}) {
    /*
     * ⭐⭐⭐ QUANDO IL MODELLO HA PARLATO L'ULTIMA VOLTA. Owner, 11/09: nella barra laterale le
     *   sessioni in corso salgono in cima, e «se ne ho tre e quelle più in basso mandano un
     *   messaggio, dopo un attimo sale in cima e viene segnalato».
     *
     * ⛔ L'istante si prende QUI e non dagli eventi persistiti: quelli non portano un orario
     *   (vedi `MOTIVO_SENZA_ISTANTI` in questo file), quindi il tempo si conosce solo mentre passa.
     * ⛔ Si segna su `TextMessageEnd`, cioè quando il modello ha FINITO di dire una cosa: usare
     *   ogni pezzo dello streaming farebbe risalire una riga a ogni token, e la barra diventerebbe
     *   un tabellone che si rimescola sotto le dita.
     */
    if (evento?.type === 'TextMessageEnd') voce.ultimaRispostaAlle = new Date().toISOString();
    /*
     * ⛔⛔⛔ 02/09 — review complessiva. WorkspaceChanged è STATO del
     * filesystem, non storia della sessione: la sessione e572474a (workspace
     * = Desktop intero) ne aveva 490 su 756 eventi, 355 DOPO la fine del
     * giro, 1,9 MB di log di cui il 79% percorsi di altre lane e test,
     * rigiocati per intero (1,6 MB) a ogni apertura. Ricerca 02/09: nessuno
     * strumento dello stesso tipo persiste gli eventi del watcher
     * nella storia. Qui: consegnato a chi è connesso ADESSO (il tree si
     * aggiorna dal vivo, contratto invariato), MAI in voce.eventi né su disco
     * — il client svuota comunque la cache dell'albero a ogni nuova
     * generazione, quindi un WorkspaceChanged storico non aveva niente da
     * dire. La notifica effimera non ha id SSE: il cursore di ripresa deve
     * poter essere recuperato dal disco anche dopo il riavvio del server.
     */
    const workspaceCambiato = evento.type === 'WorkspaceChanged';
    /*
     * ⛔⛔ D-10B — `ToolCallOutput` è effimero per la STESSA ragione di WorkspaceChanged, e la
     *   lezione è già pagata: 490 eventi su 756, 1,9 MB rigiocati a ogni apertura. L'uscita di un
     *   comando mentre esce è avanzamento — si mostra a chi è connesso ADESSO e si dimentica. Il
     *   testo definitivo è già nel `ToolCallResult`, tagliato da `uscitaUtile`: persistere anche i
     *   pezzi vorrebbe dire scrivere due volte la stessa cosa, la seconda senza tetto, e
     *   rigiocarla a ogni riapertura della sessione.
     */
    /* ⭐ 14/09 — e così l'annuncio della coda: è STATO, non storia. Chi si collega dopo lo riceve dalla rotta degli eventi. */
    const effimero = workspaceCambiato || evento.type === 'ToolCallOutput' || (evento.type === 'CUSTOM' && evento.name === 'talos.coda');
    /* ⛔ P-13 — i file sono cambiati davvero: il prossimo giro ricostruirà l'elenco. Si chiama
       SOLO da qui, cioè quando il disco cambia: farlo a ogni evento annullerebbe la cache e con
       essa tutto il vantaggio, riportando l'elenco a costare pieno ogni volta. */
    if (workspaceCambiato && voce.cartella) segnalaFileCambiatiFn(voce.cartella);
    if (!effimero) evento._sequenza = (voce.prossimaSequenza = (voce.prossimaSequenza ?? 0) + 1);
    if (!effimero) voce.eventi.push(evento);
    /*
     * ⛔ D3 — due figlie della stessa madre che scrivono lo stesso file. Non possiamo ancora
     *   impedirlo (il cancello di `scrivi` vive nel kernel, che qui è una copia dell'owner), ma
     *   il danno vero è il SILENZIO: qui la collisione viene registrata sulla voce della madre, e
     *   da lì esce nella scheda «Agenti». ⛔ Non tocca l'evento e non ne aggiunge: la storia
     *   persistita resta byte per byte quella di prima.
     */
    if (voce.padreId) {
      const percorso = percorsoScrittoDaEvento(evento);
      if (percorso) {
        const collisione = registraScritturaDiFiglia(scrittureDelleFiglie, {
          madreId: voce.padreId, figliaId: voce.sessionId, percorso, quando: new Date().toISOString(),
        });
        if (collisione) {
          const madre = sessioni.get(voce.padreId);
          if (madre) (madre.collisioniDiScrittura ??= []).push(collisione);
        }
      }
    }
    /*
     * ⭐⭐⭐ 04/9 — W1-02, l'istante in cui questo evento è arrivato. Serve al
     * process ledger per dire "quanto è durato" e alla guardia per dire "tace
     * da quanto".
     *
     * ⛔⛔ IN MEMORIA, mai su disco. `registraRigaFn` serializza `evento` per
     * intero (`JSON.stringify(record)`, session-store.mjs): un campo in più
     * sull'oggetto finirebbe in OGNI riga JSONL di OGNI sessione — una
     * scrittura nuova che nessuno ha chiesto, e una seconda fonte di verità
     * accanto a quella che c'è già. Stessa disciplina dichiarata da
     * `usageDaEventi`: si legge ciò che è persistito, non si aggiunge.
     *
     * ⇒ Conseguenza DICHIARATA, non nascosta: una sessione ripristinata dopo
     * un riavvio non ha istanti, e il ledger lo dice (`motivoTempoAssente`)
     * invece di inventare uno zero. La mappa è proporzionale a `voce.eventi`,
     * che è già interamente in memoria: un numero per evento, non un oggetto.
     */
    if (!effimero) (voce.istantiEvento ??= new Map()).set(evento._sequenza, clock().getTime());
    for (const ascoltatore of voce.ascoltatori) {
      if (!durable) ascoltatore(evento);
      else {
        try { ascoltatore(evento); } catch { /* La riconnessione rilegge l'evento persistito. */ }
      }
    }
    if (evento.type === 'RunFinished' || evento.type === 'RunError') {
      voce.conclusa = true;
      rilasciaWatcherSessioneSeInattiva(voce);
    }
    /*
     * ⭐⭐⭐ FASE L (30/8) — accoda anche su disco, MAI in attesa (broadcast
     * è sincrona da >100 punti di chiamata in questo file, farla async
     * romperebbe ogni chiamante — stessa scelta già presa per MCP in
     * FASE E, "investigato PRIMA di scrivere"). Un fallimento di
     * scrittura non deve MAI interrompere una conversazione dal vivo:
     * `.catch` che stampa, non rilancia — "mai un buco silenzioso" per
     * chi guarda il terminale del server, ma nemmeno un crash per chi
     * sta parlando col modello in questo momento. `voce.sessionId` è
     * assente per una voce ricostruita PRIMA di questo commit (nessuna
     * — il registro nasce vuoto ad ogni avvio, oggi) o per una voce
     * appena creata senza passare da qui: mai vero in pratica, ma un
     * guard esplicito costa una riga.
     */
    if (!effimero && cartellaStore && voce.sessionId) {
      if (durable) return registraRigaFn({ cartellaStore, sessionId: voce.sessionId, record: evento, durable: true });
      registraRigaFn({ cartellaStore, sessionId: voce.sessionId, record: evento })
        .catch((errore) => { console.error(`[session-store] scrittura fallita per ${voce.sessionId}:`, errore instanceof Error ? errore.message : errore); });
    }
  }

  /**
   * ⭐⭐⭐ 28/8 — LA PILLOLA PERMESSI, livello "On request": il `chiediApprovazioneFn`
   * che `talosHarness.mjs` chiama PRIMA di scrivi/shell/document_create.
   * Un SOLO slot di approvazione per voce (`voce.approvazionePendente`) —
   * `talosLavora` dispatcha le tool-call di un giro UNA alla volta, in un
   * `for` sequenziale con `await`: non può mai esistere più di una
   * richiesta in sospeso per la stessa sessione nello stesso istante.
   *
   * ⛔ Mai un timeout automatico: un rifiuto silenzioso dopo N secondi
   * sarebbe un "nega" travestito da "l'owner ha deciso" — se l'owner non
   * risponde, la sessione resta onestamente in pausa finché non lo fa (o
   * finché non la ferma con `ferma()`, che chiude comunque il giro).
   */
  function richiediApprovazione(voce, azione) {
    return new Promise((resolve) => {
      const requestId = randomUUID();
      voce.approvazionePendente = { requestId, resolve };
      broadcast(voce, approvalRequested({ requestId, azione }));
    });
  }

  /**
   * Stop e Reindirizza rendono obsoleta qualunque domanda di consenso del
   * giro corrente. Risolverla con `false` prima dell'abort evita una Promise
   * sospesa che impedirebbe al kernel di raggiungere il confine sicuro.
   */
  function negaApprovazionePendente(voce) {
    const pendente = voce.approvazionePendente;
    if (!pendente) return false;
    voce.approvazionePendente = null;
    pendente.resolve(false);
    broadcast(voce, approvalResolved({ requestId: pendente.requestId, approvato: false }));
    return true;
  }

  /*
   * ⭐⭐⭐ 28/8 — FASE A (hook). SINCRONA nella costruzione — `avviaESegui`
   * sotto NON è async per disegno (torna `{sessionId}` subito, il
   * lavoro vero prosegue in `.then()`, commento "NON await" più sotto:
   * un cambio a async avrebbe toccato ogni chiamante fino a http-app.mjs).
   * `.harness-ui-hooks.json` si legge quindi PIGRAMENTE, alla PRIMA
   * tool-call della sessione (mai al momento dell'avvio) — memoizzato
   * per le chiamate successive: un hook aggiunto a metà sessione
   * richiede un nuovo avvio per essere visto, limite dichiarato non
   * silenzioso. Un `.harness-ui-hooks.json` malformato o assente (il
   * caso comune, incluso ogni progetto di TALOS-BANCO — che comunque
   * non passa mai da questo registro) non impedisce MAI alla sessione
   * di partire, degrada a "nessun hook", mai un blocco silenzioso.
   */
  function costruisciHookFn(voce) {
    let hooksCache = null; // null = non ancora caricati
    return async (evento) => {
      if (hooksCache === null) {
        try {
          ({ hooks: hooksCache } = await caricaHooksFn({ cartella: voce.cartella }));
        } catch {
          hooksCache = [];
        }
      }
      if (hooksCache.length === 0) return { consentito: true };
      const pertinenti = hooksCache.filter((h) => h.eventi.includes(evento.tipo));
      for (const hook of pertinenti) {
        let fidato = false;
        try {
          fidato = await verificaTrustFn({ cartellaTrust: cartellaTrustHook, hookId: hook.id, hash: hook.hash });
        } catch {
          fidato = false; // un registro di trust che non si legge non autorizza in silenzio
        }
        if (!fidato) continue; // un hook non fidato è come se non esistesse — mai bloccante di suo
        let esito;
        try {
          esito = await eseguiHookFn({ hook, evento, cartella: voce.cartella });
        } catch {
          esito = { consentito: false, motivo: `l'hook "${hook.id}" è fallito nell'esecuzione.` };
        }
        // ⭐ 28/8 — solo QUI, dopo un'esecuzione vera di un hook fidato: mai per un hook non fidato (saltato sopra), mai per una sessione senza hook (ramo veloce sopra la funzione).
        broadcast(voce, hookInvoked({ hookId: hook.id, tipo: evento.tipo, azione: evento.azione, esito }));
        if (esito?.consentito === false) return esito; // il primo hook fidato che rifiuta vince — AND logico sul verdetto
      }
      return { consentito: true };
    };
  }

  /**
   * ⭐⭐⭐ 04/9 — W1-13. I FILE DI CONTROLLO (`path-policy.mjs`,
   * `FILE_DI_CONTROLLO`: hook, MCP, plugin, registro di fiducia, runtime
   * del provider, istruzioni, skill, memoria) sono protetti da una
   * scrittura del modello ANCHE in Full access e ANCHE con un permesso
   * per-attrezzo `scrivi:'sempre'` esplicito.
   *
   * ⛔ Fatto misurato leggendo talosHarness.mjs PRIMA di scrivere questo:
   * `verificaPermessoScrittura` non chiama MAI `chiediApprovazioneFn`
   * quando il livello è pieno (`vaChiesto` resta `false`, ramo
   * "nessun-vincolo"), e un override `'sempre'` esce ancora prima
   * (`haOverride && override==='sempre' && !trifectaChiude`) — quel
   * cancello non può proteggere questi file, per costruzione. Questo
   * NON può vivere lì.
   *
   * ⇒ Vive qui, su `pre_tool_call`: il kernel lo chiama per OGNI
   * attrezzo, indipendentemente da `livelloAccesso`/`permessiPerAttrezzo`
   * (vedi la doc di `AZIONI_MUTANTI_PER_HOOK` nel kernel) — un `pre_tool_call`
   * è l'UNICO punto che il desktop controlla per intero, prima che
   * `verificaPermessoScrittura` veda la chiamata.
   *
   * ⛔⛔⛔ REVIEW PO-12, 13/09/2026 — QUESTA RIGA ERA UNA PORTA DI SERVIZIO.
   * Fino a oggi diceva «blocca SOLO 'scrivi' (l'unico attrezzo mutante con
   * un `argomenti.percorso` verificabile)»: era vero quando fu scritta, ed
   * è diventato FALSO nel momento in cui `file_edit` è nato con lo stesso
   * campo `percorso` e lo stesso potere di riscrivere un file. Misurato,
   * non dedotto: `scrivi` su `CLAUDE.md` tornava REFUSED col file intatto,
   * `file_edit` sullo stesso file rispondeva «edited:» e lo riscriveva —
   * nessuna card di approvazione, in Full access.
   * ⇒ Il cancello non si tiene per NOME di un attrezzo, ma per l'insieme
   *   degli attrezzi mutanti che portano un `percorso` verificabile: chi
   *   aggiunge il prossimo lo aggiunge QUI, e la prova qui sotto
   *   («ogni attrezzo che scrive per percorso passa da questo cancello»)
   *   diventa rossa se se ne dimentica.
   * ⛔ Restano fuori `shell`/`document_create`, che un percorso non lo
   *   hanno: buco dichiarato, non silenzioso (resoconto W1-13).
   *
   * ⛔ Fallisce chiuso, mai un bypass silenzioso: un percorso che
   * `ePercorsoDiControllo` non riesce a risolvere torna già `true` (sua
   * doc), e un canale di approvazione che lancia o non decide MAI (nessun
   * client capace di rispondere) lascia la richiesta onestamente in
   * sospeso — mai un `consentito:true` per assenza di risposta, stessa
   * disciplina di `richiediApprovazione` per "On request".
   *
   * ⛔ Passa SEMPRE da `richiediApprovazione` (la stessa funzione di "On
   * request" sopra), non da `chiediApprovazioneFn`: quella può essere
   * `undefined` proprio nei due casi che questo cancello deve coprire
   * (Full access, per-attrezzo 'sempre') — un secondo canale,
   * indipendente dalla policy scelta per il resto della sessione, non un
   * uso più aggressivo dello stesso.
   */
  /**
   * ⛔ Gli attrezzi che MUTANO un file indicandolo per percorso. `scrivi`
   * riscrive tutto, `file_edit` (PO-12, 13/09) ne cambia un pezzo: per un
   * file di controllo la differenza non esiste — una regola riscritta a
   * meta' e' riscritta. Chi aggiunge un attrezzo con un `percorso` che
   * muta lo aggiunge qui.
   */
  const ATTREZZI_CHE_SCRIVONO_PER_PERCORSO = Object.freeze(['scrivi', 'file_edit']);

  function costruisciCancelloFileDiControllo(voce) {
    return async (evento) => {
      if (evento?.tipo !== 'pre_tool_call' || !ATTREZZI_CHE_SCRIVONO_PER_PERCORSO.includes(evento.azione)) return { consentito: true };
      const percorso = evento.argomenti?.percorso;
      if (typeof percorso !== 'string' || percorso.length === 0) return { consentito: true };
      let controllo;
      try {
        controllo = ePercorsoDiControllo(voce.cartella, percorso);
      } catch {
        controllo = true; // un controllo che lancia fallisce chiuso, non un bypass silenzioso
      }
      if (!controllo) return { consentito: true };
      /*
       * ⛔⛔⛔ 04/9, REVIEW della riga: `richiediApprovazione` non ha timeout —
       * se NESSUNO è iscritto alla sessione, quella Promise non si risolve mai
       * e la tool-call resta appesa PER SEMPRE (riprodotto: 2 s di attesa e
       * ancora nulla, in `tests/session-registry.test.mjs`). Succede in ogni
       * corsa senza un client attaccato: TALOS-BANCO, una sessione avviata via
       * HTTP prima che il browser apra lo stream, un client caduto.
       * ⇒ Stessa disciplina del kernel quando `chiediApprovazioneFn` manca:
       * si RIFIUTA dicendo perché. Un rifiuto il modello lo legge e lo
       * riferisce; un'attesa infinita blocca il giro e non lo dice a nessuno.
       */
      if (voce.ascoltatori.size === 0) {
        return {
          consentito: false,
          motivo: `"${percorso}" è un file di controllo di TALOS e la scrittura richiede un'approvazione esplicita, ma su questa sessione non c'è nessun canale di approvazione attivo (nessun client in ascolto). Apri la sessione nell'app e riprova.`,
        };
      }
      let approvato = false;
      try {
        // ⛔ `evento.azione`, non 'scrivi' scritto a mano: una card che nomina l'attrezzo sbagliato chiede il consenso per un'altra cosa.
        approvato = await richiediApprovazione(voce, { tipo: evento.azione, percorso, fileDiControllo: true });
      } catch {
        approvato = false; // un cancello che lancia non autorizza in silenzio — stessa disciplina di chiediApprovazioneFn/hookFn
      }
      if (approvato) return { consentito: true };
      return {
        consentito: false,
        motivo: `"${percorso}" è un file di controllo di TALOS (regole dell'agente, non un file del progetto): la scrittura richiede un'approvazione esplicita, negata o non concessa.`,
      };
    };
  }

  async function eseguiRuntimeLocale({ voce, task, messaggiIniziali, runtimeId, modelId, reasoning, sessionId }) {
    const runtime = localRuntimes?.[runtimeId];
    if (!runtime || typeof runtime.generateStream !== 'function') {
      throw new LocalRuntimeSessionError(`runtime locale non disponibile: ${runtimeId}`, 'RUNTIME_NOT_AVAILABLE');
    }
    const runId = randomUUID();
    const messages = Array.isArray(messaggiIniziali) && messaggiIniziali.length > 0
      ? messaggiIniziali
      : [{ role: 'user', content: typeof task?.consegna === 'string' ? task.consegna : String(task ?? '') }];
    const emit = (event) => broadcast(voce, { ...event, provider: 'local', runtimeId, modelId, backend: runtimeId, at: clock().toISOString() });
    emit(runStarted({ threadId: sessionId, runId, input: messages }));
    let textId = null;
    let reasoningId = null;
    let text = '';
    const messaggiCanonici = () => [...messages, ...(text ? [{ role: 'assistant', content: text }] : [])];
    let done = false;
    try {
      for await (const event of runtime.generateStream({
        provider: runtimeId, runId, turnId: runId, modelId, messages, reasoning,
        signal: voce.controller.signal, requestId: sessionId,
      })) {
        if (event?.type === 'text' && typeof event.value === 'string' && event.value !== '') {
          if (!textId) { textId = randomUUID(); emit(textMessageStart({ messageId: textId })); }
          text += event.value;
          emit(textMessageContent({ messageId: textId, delta: event.value }));
        } else if (event?.type === 'reasoning' && typeof event.value === 'string' && event.value !== '') {
          if (!reasoningId) { reasoningId = randomUUID(); emit(reasoningMessageStart({ messageId: reasoningId })); }
          emit(reasoningMessageContent({ messageId: reasoningId, delta: event.value }));
        } else if (event?.type === 'tool_call') {
          const toolCallId = event.id || randomUUID();
          emit(toolCallStart({ toolCallId, toolCallName: event.name || 'unknown' }));
          const args = typeof event.arguments === 'string' ? event.arguments : JSON.stringify(event.arguments ?? {});
          emit(toolCallArgs({ toolCallId, delta: args }));
        } else if (event?.type === 'error') {
          throw new LocalRuntimeSessionError(event.message || 'runtime locale fallito', event.code || 'LOCAL_RUNTIME_FAILED');
        } else if (event?.type === 'done') {
          done = true;
        }
      }
    } catch (error) {
      if (voce.controller.signal.aborted) {
        if (textId) emit(textMessageEnd({ messageId: textId }));
        if (reasoningId) emit(reasoningMessageEnd({ messageId: reasoningId }));
        emit(runFinished({ threadId: sessionId, runId, outcome: 'fermato' }));
        return { ok: false, esito: { comeFinita: 'fermato', messaggiFinali: messaggiCanonici() } };
      }
      throw error instanceof LocalRuntimeSessionError
        ? error
        : new LocalRuntimeSessionError(error?.message || 'runtime locale fallito', error?.code || 'LOCAL_RUNTIME_FAILED');
    }
    if (textId) emit(textMessageEnd({ messageId: textId }));
    if (reasoningId) emit(reasoningMessageEnd({ messageId: reasoningId }));
    if (voce.controller.signal.aborted) {
      emit(runFinished({ threadId: sessionId, runId, outcome: 'fermato' }));
      return { ok: false, esito: { comeFinita: 'fermato', messaggiFinali: messaggiCanonici() } };
    }
    if (!done) throw new LocalRuntimeSessionError('runtime locale non ha chiuso lo stream', 'LOCAL_RUNTIME_INCOMPLETE');
    emit(runFinished({ threadId: sessionId, runId, outcome: 'concluso' }));
    return { ok: true, esito: { comeFinita: 'concluso', messaggiFinali: messaggiCanonici() } };
  }

  /**
   * ⭐⭐⭐ 03/9 — Full access: owner, parole esatte — *"se ho abilitato full
   * access... il modello deve potere accedere a qualunque e fare operazioni
   * a qualunque file e cartella"*, ANCHE se la sessione è partita in una
   * cartella precisa, ANCHE se il permesso è stato acceso DOPO l'avvio.
   *
   * ⛔ Il kernel (talosHarness.mjs) non ha un concetto di "full access": gli
   * arriva un solo parametro `cartella` e verifica il contenimento relativo
   * a QUELLO — confermato leggendo runtime-owner-adapter.mjs/agent-service.mjs,
   * mai modificato qui (territorio mobile). ⇒ "Full access" non è una regola
   * nuova da insegnare al kernel: è QUALE cartella gli viene consegnata.
   * Larga quanto l'intero disco (stesso `parse(x).root` già usato da
   * `workspaceBrowser` in server.mjs per lo stesso motivo) quando il
   * permesso è "Full access", altrimenti la cartella di partenza invariata.
   *
   * ⭐ `cartellaBase` (nuovo campo su `voce`, mai mutato dopo la creazione)
   * è cosa serve per poter TORNARE INDIETRO se il permesso viene abbassato
   * di nuovo: senza di lei, una volta allargata la cartella non c'è più modo
   * di sapere qual era quella di partenza.
   *
   * ⛔⛔⛔ 03/9 — BUG REALE trovato dal vivo, owner: "usa come radice" su una
   * cartella FUORI sessione (es. C:\.cache) produceva una sessione con
   * `cartella:"C:\\"`, non `C:\.cache` — l'allargamento scattava ANCHE
   * quando la cartella non è "quella di partenza che si allarga", ma è già
   * la scelta ESATTA, deliberata della persona (avviaLibero con
   * cartellaLibera/workspaceLaunchId — "Imposta come radice", il selettore
   * "Nuova sessione" su un percorso a piacere). Le due situazioni sono
   * OPPOSTE: (a) parto in una cartella dell'allowlist, Full access la
   * allarga — quello che l'owner ha chiesto in origine; (b) scelgo IO
   * esattamente questa cartella (già passa da "Full access" come cancello
   * obbligato, vedi avviaLibero) — allargarla ANCORA di più rompe la scelta
   * appena fatta. `cartellaGiaScelta:true` disattiva l'allargamento: la
   * cartella scelta a piacere resta ESATTA, sempre, indipendentemente dal
   * permesso — mai un secondo allargamento sopra una scelta già precisa.
   *
   * ⛔⛔⛔ 04/9 — W0-08, TERZA situazione trovata dal vivo, distinta dalle
   * due sopra: `avvia()` (un task del CATALOGO) non passava MAI
   * `cartellaGiaScelta`, quindi ricadeva sul ramo (a) — "parto stretto, mi
   * allargo" — anche se non c'è NESSUNO stretto da cui allargarsi: la
   * cartella di un task del corpus è sempre la copia usa-e-getta di
   * `task-catalog.mjs`, non una sotto-cartella di un progetto più ampio
   * scelto dall'owner. Il permesso decideva quindi il workspace anche lì
   * dove non ha senso — misurato, non teorico: la corruzione del 31/8 e il
   * lag del 2/9 avevano entrambi una sessione con l'intero albero di C:\
   * dentro. `avvia()` ora passa `cartellaGiaScelta:true` sempre: stesso
   * effetto del caso (b) ma per un motivo diverso ("non c'è niente da
   * allargare", non "la persona ha scelto esattamente questo") — un solo
   * flag, due ragioni, vedi la doc di `avvia()` per il dettaglio. Il caso
   * (a) resta l'UNICO che allarga davvero: `avviaLibero({cartellaId})`,
   * l'allowlist.
   */
  function cartellaEffettivaPerPermessi(cartellaBase, permessi, cartellaGiaScelta = false) {
    if (cartellaGiaScelta) return cartellaBase;
    return permessi === 'Full access' ? parsePath(cartellaBase).root : cartellaBase;
  }

  /**
   * Il nucleo comune ad `avvia()`, `forka()` e `resume()`: chiama
   * avviaSessioneFn per un giro nuovo, cattura la conversazione finale per
   * un resume/fork FUTURO. Mai un throw — un errore di configurazione è una
   * risposta HTTP attesa, non un guasto del registro.
   *
   * `voceEsistente` distingue le tre chiamanti: assente per `avvia`/`forka`
   * (una VOCE NUOVA, un sessionId nuovo — due sessioni indipendenti anche se
   * `forka` eredita la storia), presente per `resume` (STESSA voce, STESSO
   * sessionId, un giro IN PIÙ appeso allo stesso buffer — vedi resume() per
   * il perché questo è "riprendere" e non "un fork travestito").
   */
  function avviaESegui({
    sessionId = randomUUID(), taskId, cartella, task, comandoProva, messaggiIniziali,
    forkDa = null, voceEsistente = null, modelloRichiesta = null, reasoningRichiesto = null, mobile = false,
    /*
     * ⭐⭐⭐ D-11 (10/09) — DA DOVE È ARRIVATA LA RICHIESTA.
     *
     * Il 10/09 sono comparse sul 4174 quattro sessioni con un modello fuori regola, e non c'è
     * stato modo di sapere chi le avesse create: cinque piste seguite, due sessioni interrogate,
     * una corrispondenza testuale esatta, e nessuna risposta possibile — perché il dato non
     * veniva registrato da nessuno. L'intestazione dichiarava cartella, task, modello, permessi
     * e padre; l'origine no.
     *
     * ⛔ È DIAGNOSTICA, NON SICUREZZA, e la distinzione non è una formalità: un'intestazione
     *   HTTP la scrive il chiamante, quindi si può falsificare (ricerca 10/09/2026: InfoSec
     *   Writeups «Header Manipulation», Microsoft Learn «Add data to audit logs by using custom
     *   headers» — utili per il contesto, mai come controllo d'accesso). Questo campo serve a
     *   rispondere a «chi è stato» quando la risposta è uno strumento di casa; non decide nulla,
     *   non nega nulla, e nessun codice deve MAI leggerlo per autorizzare qualcosa.
     */
    origineRichiesta = null,
    permessiRichiesti = null, permessiPerAttrezzoRichiesti = null,
    /*
     * ⭐⭐⭐ 03/9 — vedi la doc di cartellaEffettivaPerPermessi: `true` per
     * avviaLibero con cartellaLibera/workspaceLaunchId (la persona ha
     * scelto ESATTAMENTE questa cartella) — mai per l'allowlist
     * (cartellaId), dove "Full access" resta un allargamento legittimo
     * oltre la cartella di partenza (owner, 03/9: "parto stretto, mi
     * allargo" — l'UNICO caso rimasto che allarga).
     *
     * ⛔⛔⛔ 04/9 — W0-08: ANCHE `true` per `avvia()` (task del catalogo).
     * Prima di questo commit non lo era MAI — bug reale, non teorico: un
     * `permessiScelto:'Full access'` su un task del corpus (o alzato a
     * metà chat via `aggiornaImpostazioni`) allargava la cartella alla
     * radice del disco, e `POST /api/v1/sessions` non aveva nessuna
     * validazione che lo impedisse. Un task del catalogo non ha MAI un
     * percorso "stretto" da cui allargarsi — la sua cartella è sempre la
     * copia usa-e-getta di `task-catalog.mjs` — quindi qui il flag non
     * significa "la persona ha scelto questo percorso" ma "non esiste
     * niente da allargare": stesso effetto finale (`cartellaEffettivaPerPermessi`
     * ritorna la cartella invariata), due motivi distinti — vedi la doc
     * di `avvia()` più sotto.
     */
    cartellaGiaScelta = false,
    provider = 'cloud', runtimeId = null, modelId = null, fallbackConsent = false, fallbackProviders,
    /*
     * ⭐⭐⭐ 29/8 — FASE K, R2 planner costoso + editor economico. Stessa
     * disciplina esatta di `modelloRichiesta` una riga sopra: un
     * fork/resume eredita il planner della voce originale (mai perso
     * a metà conversazione), un avvio nuovo usa quello richiesto o
     * nessuno — owner, "Configurabile, nessun default forzato".
     */
    modelloPlannerRichiesta = null,
    /*
     * ⭐⭐⭐ FASE C (28/8) — sub-agenti. `padreId`/`profonditaDelega`
     * identificano una sessione FIGLIA creata da `subagentOrchestrator`
     * (mai da un umano) — assenti/`0` per ogni sessione normale,
     * invariato. `onConclusioneFn`, se presente, è chiamato dentro lo
     * STESSO `.then()`/`.catch()` che già aggiorna `voce.messaggiFinali`
     * — è così che `subagent-orchestrator.delegaSottoTask` sa quando la
     * figlia ha finito, senza un secondo meccanismo di attesa.
     */
    padreId = null, profonditaDelega = 0, onConclusioneFn, versioneGiroRichiesta = null,
  }) {
    const providerEffettivo = voceEsistente?.provider ?? provider;
    const runtimeIdEffettivo = voceEsistente?.runtimeId ?? runtimeId;
    const modelIdEffettivo = voceEsistente?.modelId ?? modelId;
    const fallbackConsentEffettivo = voceEsistente?.fallbackConsent ?? fallbackConsent;
    const chiaveEffettiva = typeof chiaveFn === 'function' ? chiaveFn() : chiave;
    if (providerEffettivo !== 'local' && (typeof chiaveEffettiva !== 'string' || chiaveEffettiva.length === 0)) {
      return { erroreAvvio: 'Chiave API non configurata sul server (OPENROUTER_API_KEY)', code: 'CONFIG_INVALID' };
    }
    if (providerEffettivo === 'local' && (!runtimeIdEffettivo || !modelIdEffettivo || !localRuntimes?.[runtimeIdEffettivo])) {
      return { erroreAvvio: 'Runtime locale o modello non disponibile', code: 'RUNTIME_NOT_AVAILABLE' };
    }

    const controller = new AbortController();
    /*
     * ⭐ 27/8 — modello PER SESSIONE, owner: "poter scegliere almeno tutti i
     * modelli openrouter e deepseek... nessuna eccezione". `modelloRichiesta`
     * arriva già validato in FORMA da `http-app.mjs` (vedi
     * `modelloRichiestaValido`) — qui si sceglie solo se usarlo o ricadere
     * sul default del server. Un fork/resume (che non passa mai
     * `modelloRichiesta`) eredita sempre il modello della voce originale,
     * mai quello di chiusura silenziosamente: coerenza della sessione prima
     * di tutto.
     */
    const modelloEffettivo = modelIdEffettivo || modelloRichiesta || voceEsistente?.modello || modello;
    /*
     * ⭐⭐⭐ 29/8 — FASE K, stessa disciplina esatta di `modelloEffettivo`
     * appena sopra — MA senza un `|| modello` finale: un planner
     * assente resta assente (`null`), non ricade MAI sul modello
     * dell'editor (sarebbe un default forzato inventato qui, contro
     * la decisione esplicita dell'owner).
     */
    const modelloPlannerEffettivo = modelloPlannerRichiesta || voceEsistente?.modelloPlanner || null;
    /*
     * ⭐ 27/8, R1 — stessa disciplina di `modelloEffettivo`: un fork/resume
     * eredita il `reasoning` della voce originale (mai perso in silenzio a
     * metà conversazione), un avvio nuovo usa quello richiesto o nessuno.
     */
    const reasoningEffettivo = reasoningRichiesto ?? voceEsistente?.reasoning ?? null;
    /*
     * ⭐⭐⭐ 28/8 — LA PILLOLA PERMESSI: stessa disciplina di
     * `modelloEffettivo`/`reasoningEffettivo` sopra — un fork/resume
     * eredita il permesso della voce originale (mai perso a metà
     * conversazione, e mai un modo per "salire" di livello a metà
     * sessione passando semplicemente da resume), un avvio nuovo usa
     * quello richiesto o il default onesto di sempre.
     */
    const permessiEffettivi = permessiRichiesti ?? voceEsistente?.permessi ?? 'Workspace write';
    /*
     * ⭐⭐⭐ FASE B (28/8) — stessa disciplina di `permessiEffettivi` appena
     * sopra: un fork/resume eredita l'override per-attrezzo della voce
     * originale, un avvio nuovo usa quello richiesto o nessuno (`null` =
     * comportamento di oggi, invariato — vedi verificaPermessoScrittura).
     */
    const permessiPerAttrezzoEffettivi = permessiPerAttrezzoRichiesti ?? voceEsistente?.permessiPerAttrezzo ?? null;
    /*
     * ⛔ `mobile` entra nella voce SOLO quando se ne crea una nuova — un
     * resume (`voceEsistente` presente) la riusa com'era, mai sovrascritta:
     * la "mobilità" di una sessione si decide una volta sola, all'avvio
     * (piano `procedi-col-generare-un-snoopy-neumann.md`, Fase 3).
     */
    const voceNuova = !voceEsistente;
    const voce = voceEsistente ?? {
      eventi: [], ascoltatori: new Set(), taskId,
      // ⭐ 03/9 — Full access: `cartella` è quella EFFETTIVA (allargata se il
      // permesso è già "Full access" all'avvio E la cartella non era già
      // una scelta esatta — vedi cartellaGiaScelta/cartellaEffettivaPerPermessi);
      // `cartellaBase` è quella di PARTENZA, mai mutata — serve a tornare
      // indietro se il permesso viene abbassato più tardi.
      cartella: cartellaEffettivaPerPermessi(cartella, permessiEffettivi, cartellaGiaScelta), cartellaBase: cartella,
      cartellaGiaScelta,
      // ⭐ D-11: chi ha creato questa sessione. Diagnostica, mai un controllo d'accesso.
      origineRichiesta,
      task, comandoProva, forkDa,
      avviataAlle: clock().toISOString(), messaggiFinali: null, modello: modelloEffettivo,
      modelloPlanner: modelloPlannerEffettivo,
      reasoning: reasoningEffettivo, mobile, permessi: permessiEffettivi,
      fallbackProviders: validaFallbackProviders(fallbackProviders ?? voceEsistente?.fallbackProviders ?? [], { usaAttrezzi: true }),
      permessiPerAttrezzo: permessiPerAttrezzoEffettivi, approvazionePendente: null,
        reindirizzamentoPendente: null,
        redirectAnnullati: new Set(),
        messaggiPendente: null,
        versioneGiro: 0,
      provider: providerEffettivo, runtimeId: runtimeIdEffettivo, modelId: modelIdEffettivo || modelloEffettivo, fallbackConsent: fallbackConsentEffettivo === true,
      // ⭐⭐⭐ FASE C (28/8) — sub-agenti: null/0 per ogni sessione avviata da un umano, valorizzati SOLO da subagentOrchestrator.delegaSottoTask. `esitoDelega` (per il foglio "Albero sessione") si popola quando la sessione conclude, vedi sotto.
      padreId, profonditaDelega, esitoDelega: null, evidenzaDelega: null,
      // ⭐⭐⭐ FASE D (28/8) — coda messaggi: FIFO vera, vuota per ogni sessione. Sopravvive a un resume (STESSA voce): un messaggio accodato mentre la sessione era "in corso" resta in coda anche se il turno finisce e ne parte un altro tramite resume().
      codaMessaggi: [],
      codaInPausa: false, // ⭐ 14/09 — vero dopo uno stop con messaggi in coda: vedi `annunciaCoda`
    };
    /*
     * Il punto sicuro può arrivare anche dopo un timeout/abort avvenuto prima
     * del primo token. In quel caso il runtime non restituisce una nuova
     * `messaggiFinali`, ma il contesto con cui QUESTO giro è partito resta una
     * fonte canonica e non va cancellato. Per il primissimo giro non esiste
     * ancora una cronologia: il fallback ricostruisce invece il task sotto,
     * così è il runtime a rigenerare il proprio system prompt.
     */
    const versioneGiro = Number.isSafeInteger(versioneGiroRichiesta) && versioneGiroRichiesta > (voce.versioneGiro ?? 0)
      ? versioneGiroRichiesta
      : (voce.versioneGiro ?? 0) + 1;
    voce.versioneGiro = versioneGiro;
    /*
     * ⭐⭐⭐ D-10S (11/09) — I COMANDI `!` ENTRANO NELLA CONVERSAZIONE, come fa Claude Code.
     *
     * Prima: `shell()` eseguiva e trasmetteva eventi, e l'uscita era dichiarata EFFIMERA. La
     * persona la vedeva sullo schermo, il modello no — così «e allora perché fallisce?» subito
     * dopo un `!npm test` parlava di una cosa che per lui non era mai successa.
     *
     * Ricerca 11/09/2026 — Claude Code mette comando e uscita NELLA conversazione, in tag
     * `<bash-input>`/`<bash-stdout>`/`<bash-stderr>` (verificato sul disco in 8 trascritti, non
     * riferito); LibraBit «Stop Copy-Pasting Output Into Claude Code» e BSWEN «the ! prefix
     * explained» descrivono lo stesso comportamento — «adds the command and its full output to the
     * conversation context» — e avvertono del rovescio: un `!env` ci finirebbe dentro coi segreti.
     * Teniamo i loro nomi di tag apposta: sono quelli su cui i modelli sono già addestrati.
     *
     * ⛔ La cucitura avviene QUI, sincrona, e solo all'avvio di un giro. Non durante il comando:
     *   `voce.messaggiFinali` viene riscritto alla fine di ogni giro (vedi `.then` più sotto), e
     *   scrivere lì mentre il modello lavora perderebbe il racconto o lo duplicherebbe.
     * ⛔ E niente `await` in questa catena: `avviaSessione` emette `RunStarted` come sua prima riga
     *   e chi chiama conta su quell'evento già nel buffer al ritorno sincrono — un solo tick di
     *   ritardo qui fa cadere 148 test (misurato il 10/09).
     *
     * Due strade, perché la cronologia canonica può non esistere ancora:
     *  · c'è una cronologia ⇒ i racconti diventano messaggi utente in coda, uno per comando;
     *  · non c'è (primissimo giro) ⇒ vanno in testa al TASK. Passare `messaggiIniziali` al primo
     *    giro impedirebbe al runtime di rigenerare il proprio system prompt (vedi il commento qui
     *    sopra), e quello è un prezzo che non vale un `ls`.
     */
    const raccontiInSospeso = Array.isArray(voce.comandiDaRaccontare) ? voce.comandiDaRaccontare : [];
    const cronologiaDiPartenza = Array.isArray(messaggiIniziali)
      ? messaggiIniziali
      : (Array.isArray(voce.messaggiFinali) ? voce.messaggiFinali : null);
    let taskEffettivo = task;
    let messaggiInizialiEffettivi = messaggiIniziali;
    if (raccontiInSospeso.length > 0) {
      const comeMessaggi = raccontiInSospeso.map((testo) => ({ role: 'user', content: testo }));
      if (Array.isArray(cronologiaDiPartenza)) {
        /*
         * ⛔⛔ L'ORDINE È QUELLO DEI FATTI, non quello comodo. Trovato da un test che pretendeva il
         *   racconto subito dopo la cronologia e l'ha trovato in fondo: `resume()` costruisce
         *   `[...storia, nuovoMessaggioUtente]` PRIMA di arrivare qui, quindi accodare in fondo
         *   metteva il comando DOPO la domanda che lo riguarda — «e allora?» prima del `npm test`
         *   a cui si riferisce.
         * ⇒ Se l'ultimo messaggio è della persona (cioè è la domanda appena scritta), i racconti
         *   entrano PRIMA di lui. Il prefisso in cache non si tocca lo stesso: quell'ultimo
         *   messaggio è nuovo, in cache non c'è mai stato.
         */
        const ultimo = cronologiaDiPartenza[cronologiaDiPartenza.length - 1];
        messaggiInizialiEffettivi = ultimo?.role === 'user'
          ? [...cronologiaDiPartenza.slice(0, -1), ...comeMessaggi, ultimo]
          : [...cronologiaDiPartenza, ...comeMessaggi];
      } else {
        taskEffettivo = `${raccontiInSospeso.join('\n\n')}\n\n${task ?? ''}`;
      }
      /* ⛔ Si svuota SOLO dopo averli usati: un racconto consegnato due volte è peggio di uno perso. */
      voce.comandiDaRaccontare = [];
    }
    const messaggiPrimaDelGiro = Array.isArray(messaggiInizialiEffettivi)
      ? messaggiInizialiEffettivi
      : cronologiaDiPartenza;
      voce.controller = controller;
      voce.conclusa = false;
      voce.interrotta = false;
    /*
     * ⭐⭐⭐ FASE L (30/8) — `sessionId` sulla voce stessa (prima viveva
     * solo come chiave della Map): `broadcast()` ne ha bisogno per
     * sapere in quale file scrivere. L'intestazione va su disco UNA
     * sola volta, solo per una voce VERAMENTE nuova (un resume/fork
     * riusa la STESSA voce, `voceNuova` è già falso) — contiene tutto
     * ciò che serve per RICOSTRUIRE la voce dopo un riavvio, senza
     * dover rileggere ogni evento per dedurlo.
     *
     * ⛔ Debito dichiarato, non nascosto: `nome` (rinomina),
     * `permessiPerAttrezzo`/`permessi` cambiati DOPO l'avvio,
     * `codaMessaggi` non sopravvivono a un riavvio in questa prima
     * fetta — solo lo stato ALL'AVVIO viene catturato qui. Una
     * rinomina/cambio-permesso post-avvio che precede un crash torna
     * al valore originale dopo un ripristino: limite onesto, non un
     * bug silenzioso.
     */
    voce.sessionId = sessionId;
    if (cartellaStore && voceNuova) {
      try {
        registraRigaSyncFn({
          cartellaStore, sessionId,
          record: {
            tipo: 'intestazione', schema: SCHEMA_SESSIONE, sessionId, taskId, cartella, task, comandoProva, forkDa,
            avviataAlle: voce.avviataAlle, modello: voce.modello, modelloPlanner: voce.modelloPlanner,
            reasoning: voce.reasoning, mobile: voce.mobile, permessi: voce.permessi,
            fallbackProviders: voce.fallbackProviders,
            permessiPerAttrezzo: voce.permessiPerAttrezzo, padreId: voce.padreId, profonditaDelega: voce.profonditaDelega,
            provider: voce.provider, runtimeId: voce.runtimeId, modelId: voce.modelId, fallbackConsent: voce.fallbackConsent,
            // ⭐⭐⭐ 03/9 — persistita: senza questa, un ripristino dopo un riavvio perderebbe la distinzione e allargherebbe una cartella già scelta esattamente (stesso bug appena corretto, ma dopo un riavvio invece che subito).
            cartellaGiaScelta: voce.cartellaGiaScelta,
            // ⭐ D-11: sopravvive al riavvio, perché è qui e non nei log — che il riavvio riazzera.
            ...(voce.origineRichiesta ? { origine: voce.origineRichiesta } : {}),
          },
        });
      } catch (errore) {
        // ⛔ Un disco pieno/non scrivibile non deve mai impedire una sessione di partire — stesso principio "mai bloccare il dispatch" del resto di questo file, solo loggato invece di silenzioso.
        console.error(`[session-store] intestazione non scritta per ${sessionId}:`, errore instanceof Error ? errore.message : errore);
      }
    }
    /*
     * ⭐⭐⭐ 28/8 — workspace-watcher.mjs, owner 27/8: "se muovo i file il
     * work tree non si aggiorna automaticamente". UNA sola volta per
     * voce ATTIVA. Un resume riusa la stessa voce ma può riaprire il
     * watcher se era stato rilasciato al termine del giro precedente.
     * Dopo il profilo P0 del 1/9 il possesso è esplicito: un run vivo o
     * almeno un client SSE lo tengono aperto; nessuno dei due lo chiude.
     */
    /*
     * ⭐ 03/9 — `voce.cartella`, non il parametro `cartella`: per una
     * sessione nata già con "Full access" i due divergono (voce.cartella è
     * allargata a radice disco, vedi cartellaEffettivaPerPermessi più
     * sopra). Stessa fonte già usata da resume() due chiamate più sotto —
     * un solo punto di verità, mai due percorsi che possono disallinearsi.
     * ⛔ Un volume intero non fa comunque partire un watcher ricorsivo
     * (guardaWorkspace lo rifiuta da solo, vedi workspace-watcher.mjs e
     * tests/full-access-root-e2e.test.mjs) — nessun rischio nuovo.
     */
    attivaWatcherSessione(voce, voce.cartella);
    sessioni.set(sessionId, voce);

    /*
     * ⛔ NON await: avviaSessione emette RunStarted come sua PRIMA riga,
     * prima di qualunque await — quindi al ritorno di QUESTA funzione
     * RunStarted è già nel buffer (run-to-first-await di JS, non una gara).
     */
    /*
     * ⭐⭐⭐ 28/8 — LA PILLOLA PERMESSI, tradotta dalle QUATTRO stringhe
     * verso i DUE parametri che il kernel capisce (talosHarness.mjs,
     * verificaPermessoScrittura): "Read only" → livelloAccesso:'lettura';
     * "On request" → chiediApprovazioneFn vero; "Workspace write"/"Full
     * access" → nessuno dei due (il kernel non sa e non deve sapere QUALE
     * cartella sta scrivendo, solo se può farlo — "Full access" cambia
     * QUALE cartella diventa `cartella` più in alto, in avviaLibero,
     * mai qui).
     */
    /*
     * ⭐⭐⭐ 06/9 — la cura definitiva, autorizzata dall'owner: la politica si dichiara al kernel come
     * LIVELLO, non come effetto collaterale dell'esistenza di un canale. «Su richiesta» ora è
     * `livelloAccesso:'su-richiesta'`, che il kernel riconosce da sempre (`richiestoDalLivello`);
     * insieme alla clausola tolta là dentro, questo fa sì che «Per questa sessione» funzioni davvero:
     * un attrezzo passato a «sempre» smette di chiedere anche se un ALTRO attrezzo resta su «chiedi».
     */
    /*
     * ⭐⭐⭐ L1 §6.3 (11/09/2026) — la QUINTA parola: `'Research'` → `livelloAccesso:'ricerca'`.
     *
     * ⛔ È una parola INTERNA, non una quinta voce della pillola dei permessi: non la sceglie
     *   nessuno a mano, la scrive solo `research-orchestrator.avvia()`. In UI la sessione di
     *   una ricerca mostra «Ricerca approfondita» — mai «Research», mai «ricerca» (niente nomi
     *   tecnici a schermo, regola owner 04/09).
     * ⛔ Perché esiste: `'Read only'` vieta ANCHE la consegna, e una ricerca che non può
     *   consegnare finisce come la `d2a453a8` dell'11/09 — 484.171 token spesi e, come
     *   rapporto permanente, la frase con cui il modello si scusava di non poterlo scrivere.
     */
    const livelloAccesso = voce.permessi === 'Read only'
      ? 'lettura'
      : voce.permessi === 'Research' ? 'ricerca'
        : voce.permessi === 'On request' ? 'su-richiesta'
          : voce.permessi === 'Full access' ? 'accesso-pieno' : undefined;
    /*
     * ⛔⛔⛔ FASE B (28/8) — RIPIEGO TEMPORANEO, non la cura finale.
     *
     * Trovato dal vivo (screenshot, non un'ipotesi): costruire
     * `chiediApprovazioneFn` ogni volta che ALMENO UN attrezzo vuole
     * 'chiedi' (anche sotto "Workspace write") produceva la card giusta
     * per `shell` — ma FA TRAPELARE l'approvazione anche su `scrivi`
     * (nessun override), perché il kernel di OGGI usa "chiediApprovazioneFn
     * presente" come segnale implicito di "la sessione, alla base, chiede
     * SEMPRE" — un contratto pre-esistente (testato, documentato) che FASE
     * B non può cambiare da sola senza rompere quel contratto per chi lo
     * usa così.
     *
     * ⛔⛔⛔ Bloccato da coordinamento, non da un dubbio tecnico: mentre
     * questa scoperta veniva fatta, un'ALTRA sessione (avm-75, commit
     * `51deba87`/`242caf75`, non ancora committati fino in fondo — 111
     * righe in lavorazione nello stesso file condiviso) ha ESTESO
     * `livelloAccesso` a un vocabolario a 4 valori con un valore ESPLICITO
     * `'su-richiesta'` — esattamente l'assenza che serve per distinguere
     * "la SESSIONE chiede sempre" da "SOLO questo attrezzo chiede" senza
     * fare leva sulla presenza nuda di `chiediApprovazioneFn`. La cura
     * corretta è aspettare quel lavoro e mappare "On request" su
     * `livelloAccesso:'su-richiesta'` qui — non un secondo tentativo
     * scritto in fretta sopra un file che un'altra sessione ha ancora
     * aperto, non committato.
     *
     * ⇒ Ripiego SICURO nel frattempo: `chiediApprovazioneFn` torna a
     * costruirsi SOLO per "On request" (comportamento pre-FASE-B,
     * invariato). Un override per-attrezzo `'chiedi'` sotto un'altra
     * policy FALLISCE CHIUSO (REFUSED, "nessun canale di approvazione
     * attivo") invece di mostrare la card — onesto, mai un bypass
     * silenzioso, mai una perdita verso altri attrezzi. `'sempre'`/`'nega'`
     * restano pienamente funzionanti sotto qualunque policy: non toccati
     * da questo limite.
     */
    /*
     * ⭐⭐⭐ 06/9 — il ripiego di FASE B finiva per NEGARE invece di chiedere. Misurato dal vivo
     * (prova T03): con «Accesso pieno» e il permesso per attrezzo «scrittura → chiedi», il modello
     * riceve REFUSED e scrive a schermo «il tool di scrittura è stato rifiutato: richiede
     * un'approvazione non disponibile in questa sessione», poi ci riprova con la shell e viene
     * rifiutato pure lì. Chi ha chiesto di essere avvisato non viene avvisato: gli viene detto di no.
     *
     * ⇒ Il canale si costruisce anche quando ALMENO UN attrezzo dice «chiedi», sotto qualunque
     * politica. Il costo, dichiarato e non nascosto: il kernel di oggi tratta «canale presente» come
     * «questa sessione chiede sempre» (`vaChiesto` include `!haOverride && Boolean(chiediApprovazioneFn)`
     * in `verificaPermessoScrittura`), quindi verranno chieste anche le azioni SENZA override. Meglio
     * chiedere più del necessario che negare in silenzio ciò che l'owner ha chiesto di poter approvare.
     * Il foglio dei permessi lo scrive in chiaro. La cura definitiva sta nel kernel (fuori dalla mia
     * lane): togliere quella clausola e usare `livelloAccesso: 'su-richiesta'`, che il kernel già
     * riconosce (`talosHarness.mjs`, tipo `LivelloAccessoHarness`).
     */
    const qualcheAttrezzoChiede = Object.values(voce.permessiPerAttrezzo || {}).some((v) => v === 'chiedi');
    const chiediApprovazioneFn = voce.permessi === 'On request' || qualcheAttrezzoChiede
      ? (azione) => richiediApprovazione(voce, azione)
      : undefined;
    // ⭐⭐⭐ FASE A (hook) — sempre costruito, sincrono: costruisciHookFn
    // rimanda il vero lavoro (I/O) alla prima tool-call, vedi la sua doc.
    const hookFnUtente = costruisciHookFn(voce);
    /*
     * ⭐⭐⭐ 04/9 — W1-13: il cancello sui file di controllo corre PRIMA di
     * ogni hook utente — stesso principio "il primo che rifiuta vince"
     * già in uso dentro costruisciHookFn per gli hook fra loro. Un hook
     * `.harness-ui-hooks.json` (che il modello potrebbe aver scritto lui
     * stesso, se questo cancello non lo fermasse) non può mai
     * "approvare" una scrittura che questo cancello ha già rifiutato.
     */
    const cancelloFileDiControllo = costruisciCancelloFileDiControllo(voce);
    const hookFn = async (evento) => {
      const esitoCancello = await cancelloFileDiControllo(evento);
      if (esitoCancello?.consentito === false) return esitoCancello;
      return hookFnUtente(evento);
    };
    /*
     * ⭐⭐⭐ FASE D (28/8) — sempre costruita (stesso principio di
     * hookFn/onDelega): il vero contenuto vive in voce.codaMessaggi,
     * popolato da accodaMessaggio() più sotto — shift() drena FIFO,
     * ?? null non lascia mai passare undefined al kernel. Quando un
     * messaggio VIENE DAVVERO consegnato (shift() torna qualcosa),
     * broadcast di QueuedMessageDelivered — è il SOLO momento in cui il
     * frontend può sapere con certezza che è successo (vedi la doc
     * dell'evento in agui-events.mjs sul perché un'euristica lato
     * client non basterebbe).
     */
    const codaMessaggiFn = () => {
      // Un input prioritario è già stato accettato: la FIFO resta intatta
      // per il giro successivo, mai consumata dal giro che stiamo fermando.
      if (voce.reindirizzamentoPendente) return null;
      // ⭐ 14/09 — una coda in pausa (stop) aspetta la persona: non scivola nel giro dopo. Vedi `annunciaCoda`.
      if (voce.codaInPausa) return null;
      const item = voce.codaMessaggi.shift();
      if (item == null) return null;
      const testo = typeof item === 'string' ? item : item.testo;
      const immagini = typeof item === 'string' ? [] : item.immagini;
      broadcast(voce, { ...queuedMessageDelivered({ testo }), ...(immagini?.length ? { immagini } : {}) });
      annunciaCoda(voce); // ⭐ 14/09: chi guarda da un'altra finestra vede la coda accorciarsi
      return imageMessageContent(testo, immagini);
    };

    /*
     * ⭐⭐⭐ FASE N, ottavo sistema (30/8) — Deep Research: 8 thin delegate
     * verso researchOrchestrator, stesso principio di onDelega verso
     * subagentOrchestrator.delegaSottoTask un blocco sopra. `cartella`
     * qui è quella di QUESTA sessione (il padre che avvia/gestisce la
     * ricerca) — la ricerca gira nella STESSA cartella, mai un
     * workspace dedicato (vedi la doc di research-orchestrator.mjs).
     *
     * ⭐⭐⭐ 03/9 — `voce.cartella`, non il parametro: stesso bug e stessa
     * cura di cloudOptions.cartella poco sopra in questo file — un avvio
     * nuovo con Full access già scelto in partenza deve vedere SUBITO la
     * cartella allargata, non solo dal resume successivo.
     */
    const onRicercaLista = (argomenti) => researchOrchestrator.elenca({ cartella: voce.cartella, ...argomenti });
    /*
     * ⭐ §6.6 (11/09) — `padreId: sessionId`: la ricerca nasce AGGANCIATA alla chat che l'ha
     * ordinata. Prima era `null` e nell'albero sessione non compariva sotto nessuno — per
     * l'owner era «una sessione nuova», e lo era davvero anche nel registro.
     * ⛔ `sessionId` e non `voce.sessionId`: sono lo stesso valore (`voce.sessionId = sessionId`
     *   più sopra in avviaESegui), ma `sessionId` è il parametro chiuso in chiusura, cioè
     *   quello che non può essere stato riscritto da nessuno nel frattempo.
     */
    /*
     * ⭐⭐⭐⭐ L8 (12/09/2026) — LA FIGLIA EREDITA IL MODELLO DELLA MADRE.
     *
     * Il 12/09 la chat `c8e9b07b` girava con `z-ai/glm-5.3-flash`, ha chiamato `research_start`,
     * e la ricerca `3029dea2` è partita con `z-ai/glm-4.7-flash` — il modello di serie del
     * server. Le due intestazioni nello store lo dicono alla lettera. Conseguenze misurate:
     * 265.670 token di ingresso con `cached_tokens: 0` (OpenRouter, «Prompt Caching», letto
     * 12/09/2026: «Sticky routing is tracked at the account level, **per model**, and per
     * conversation» — un altro modello è un'altra chiave di cache), e la regola dell'owner
     * «giri reali solo con glm-5.3-flash» violata dal PRODOTTO, non da chi lo usa.
     *
     * ⛔ `voce.modello` e non il parametro chiuso in chiusura: il modello di una sessione si
     *   cambia dalla barra a sessione viva (`aggiornaImpostazioni`, più sotto, scrive
     *   `voce.modello`). Va letto ADESSO, quando la ricerca parte — stessa disciplina già
     *   documentata per `voce.cartella` due righe sopra.
     *
     * ⛔⛔ E NON si eredita da una madre su runtime LOCALE: lì `voce.modello` è l'id di un GGUF
     *   sul disco, mentre la figlia parte comunque `provider:'cloud'` (l'orchestratore non passa
     *   né `provider` né `runtimeId`). Passarglielo sarebbe un guasto garantito alla prima
     *   chiamata: `null` ⇒ la figlia usa il default del server, cioè esattamente ciò che
     *   succedeva prima di questa riga. L'eredità vale dove ha senso, e dove non ne ha tace.
     */
    const onRicercaAvvia = (argomenti) => researchOrchestrator.avvia({
      cartella: voce.cartella,
      question: argomenti?.question,
      depth: argomenti?.depth,
      padreId: sessionId,
      modello: voce.provider === 'local' ? null : (voce.modello ?? null),
      reasoning: voce.provider === 'local' ? null : (voce.reasoning ?? null),
    });
    const onRicercaLeggi = (argomenti) => researchOrchestrator.leggi({ cartella: voce.cartella, id: argomenti?.id });
    const onRicercaRinomina = (argomenti) => researchOrchestrator.rinomina({ cartella: voce.cartella, id: argomenti?.id, title: argomenti?.title ?? null });
    const onRicercaPausa = (argomenti) => researchOrchestrator.mettiInPausa({ id: argomenti?.id });
    const onRicercaRiprendi = (argomenti) => researchOrchestrator.riprendi({ id: argomenti?.id });
    const onRicercaAnnulla = (argomenti) => researchOrchestrator.annulla({ id: argomenti?.id });
    const onRicercaElimina = (argomenti) => researchOrchestrator.elimina({ cartella: voce.cartella, id: argomenti?.id });

    const cloudOptions = {
      /*
       * ⭐⭐⭐ 03/9 — `voce.cartella`, non il parametro `cartella`: stessa
       * disciplina "letto ADESSO" già documentata due righe sotto per
       * `permessi` — trovato dal vivo (Full access da avviaLibero, il
       * PRIMO giro usava ancora la cartella non allargata, perché questo
       * punto leggeva il parametro chiuso in chiusura invece della voce).
       * Per un resume i due combaciano sempre (resume() passa già
       * `cartella: voce.cartella`); per un avvio nuovo con Full access già
       * scelto in partenza NO — `voce.cartella` è quella allargata da
       * cartellaEffettivaPerPermessi, il parametro è ancora quella scelta.
       */
      /* ⛔ D-10S: `taskEffettivo`/`messaggiInizialiEffettivi`, non i parametri nudi — portano i
         comandi `!` lanciati dalla persona da quando il modello ha parlato l'ultima volta. Senza
         racconti in sospeso sono identici ai parametri, bit per bit. */
      cartella: voce.cartella, task: taskEffettivo, modello: modelloEffettivo, chiave: chiaveEffettiva, comandoProva, messaggiIniziali: messaggiInizialiEffettivi,
      /*
       * ⛔⛔⛔ 11/09/2026 — DOVE SI DEPOSITA UN FILE GENERATO: `cartellaBase`, non `cartella`.
       *
       * `voce.cartella` è la cartella EFFETTIVA, cioè quella che «Full access» allarga alla radice
       * del disco (`cartellaEffettivaPerPermessi`, più sopra in questo file). Leggere da lì è il
       * senso stesso del permesso; SCRIVERCI un file nuovo no: su Windows la radice del volume di
       * sistema accetta cartelle ma non file (ACL di default del gruppo Users), quindi ogni
       * `document_create` in una sessione «Full access» falliva con EPERM — misurato sulla sessione
       * `91ae0634` dell'owner, e nessun nome diverso avrebbe potuto riuscire.
       * ⛔ `cartellaBase` è immutabile e sopravvive al riavvio (`ripristina()` la rideriva
       *   dall'intestazione): è la cartella che la persona ha scelto, cioè l'unico posto in cui un
       *   file generato ha senso e in cui i permessi ci sono davvero. Il `??` copre le voci nate
       *   prima che questo campo esistesse — lì il comportamento resta identico a prima.
       */
      cartellaCreazioni: voce.cartellaBase ?? voce.cartella,
      reasoning: reasoningEffettivo ?? undefined,
      fallbackProviders: voce.fallbackProviders,
      onCambioFornitore: async evento => {
        if (!cartellaStore) throw new Error('La registrazione della conversazione non è disponibile.');
        const modelloSuccessivo = evento.effettivo.provider + ':' + evento.effettivo.model;
        const posizione = voce.fallbackProviders.findIndex(v => v.provider === evento.effettivo.provider && v.model === evento.effettivo.model);
        if (posizione < 0) throw new Error('Il fornitore non appartiene alle riserve della sessione.');
        const rimanenti = voce.fallbackProviders.slice(posizione + 1);
        await registraRigaFn({ cartellaStore, sessionId, durable: true, record: {
          tipo: 'impostazioni-sessione',
          modello: modelloSuccessivo,
          modelloPlanner: voce.modelloPlanner, reasoning: voce.reasoning, permessi: voce.permessi,
          permessiPerAttrezzo: voce.permessiPerAttrezzo, fallbackProviders: rimanenti,
        } });
        voce.modello = modelloSuccessivo; voce.fallbackProviders = rimanenti;
      },
      // ⭐ 02/09 — l'etichetta del permesso, dichiarata in RunStarted.contesto (vedi agent-service.mjs): è `voce.permessi` letto ADESSO, cioè anche un cambio arrivato da un altro client via POST /settings fra un giro e l'altro.
      permessi: voce.permessi ?? null,
      segnaleStop: controller.signal,
      mobile: voce.mobile,
      strumentiEstesi, ...(typeof ricercaWebFn === 'function' ? ricercaWebFn() : { ricercaWeb }), firma, immagine, persistGeneratedImageFn, removeGeneratedImageFn,
      // ⭐⭐⭐ FASE K (29/8) — `?? undefined`: `voce.modelloPlanner` è `null` per una sessione senza planner (mai passato a talosLavoraFn come `null`, che il kernel tratterebbe diversamente da "assente" in un controllo `typeof`).
      modelloPlanner: voce.modelloPlanner ?? undefined,
      livelloAccesso, chiediApprovazioneFn, hookFn,
      /*
       * ⛔ 06/9: sempre un OGGETTO, mai `null` — se il kernel ricevesse `null` non ci sarebbe
       * niente da mutare, e un permesso cambiato a metà giro non lo raggiungerebbe (vedi
       * aggiornaImpostazioni). La voce tiene lo stesso oggetto che il kernel ha in mano.
       */
      permessiPerAttrezzo: (voce.permessiPerAttrezzo ||= {}),
      // ⭐⭐⭐ FASE C (28/8) — sub-agenti: sempre costruito (stesso principio di hookFn), il vero lavoro (limiti, isolamento) vive tutto dentro subagentOrchestrator.delegaSottoTask.
      onDelega: (taskFiglio, cartellaFiglio) => subagentOrchestrator.delegaSottoTask({ sessionPadreId: sessionId, task: taskFiglio, cartella: cartellaFiglio }),
      codaMessaggiFn,
      // ⭐⭐⭐ FASE E (29/8) — sempre passata (stesso principio di cartellaTrustHook per gli hook): agent-service.mjs legge .harness-ui-mcp.json SOLO se il workspace lo dichiara, zero I/O altrimenti (vedi la sua doc su cartellaTrustMcp).
      cartellaTrustMcp,
      // ⭐⭐⭐ FASE G (29/8) — stesso principio di cartellaTrustMcp appena sopra: agent-service.mjs legge .harness-ui-plugins/ SOLO se il workspace lo dichiara, zero I/O altrimenti.
      cartellaTrustPlugin,
      // ⭐⭐⭐ FASE N, quarto sistema (30/8) — sempre passata: GLOBALE, non legata al workspace di questa sessione (vedi la doc in notes-store.mjs).
      cartellaNote,
      // ⭐⭐⭐ FASE N, quinto sistema (30/8) — stesso principio esatto di cartellaNote.
      cartellaAttivita,
      // ⭐⭐⭐ FASE N, sesto sistema (30/8) — stesso principio esatto di cartellaNote/cartellaAttivita.
      cartellaMemoria,
      // ⭐⭐⭐ FASE N, ottavo sistema (30/8) — Deep Research, gli 8 thin delegate costruiti appena sopra.
      onRicercaLista, onRicercaAvvia, onRicercaLeggi, onRicercaRinomina,
      onRicercaPausa, onRicercaRiprendi, onRicercaAnnulla, onRicercaElimina,
      /*
       * ⭐⭐⭐⭐ L8 (12/09/2026) — il compositore del record del rapporto. Non è un callback di
       * sessione (è puro): si passa sempre, ed è il kernel a usarlo solo dentro
       * `research_deposit`. Sta qui e non fra gli `onRicerca*` perché non delega niente
       * all'orchestratore di QUESTA sessione — scrive il documento e basta.
       */
      /*
       * ⭐⭐⭐⭐ L9 (12/09/2026) — NON PIÙ LA FUNZIONE PURA: il metodo dell'orchestratore.
       *
       * ⛔ La funzione pura (`componiRapportoRicerca`) resta esportata e invariata — compone il
       *   record e basta. Ma comporre non è più tutto ciò che deve succedere prima che il file
       *   esista: fra il «il modello ha chiamato research_deposit» e il «il rapporto è sul disco»
       *   ci va la VERIFICA — il passaggio ritrovato nel testo tenuto, il giudice che non è
       *   l'autore, la contraria cercata apposta. Quella ha bisogno del disco della ricerca e di
       *   una chiamata al modello, cioè di cose che una funzione pura non può avere.
       * ⛔ `cartella` la mette il registro (è la sessione a saperla), `id` lo mette il KERNEL da
       *   `task.ricercaId` — un dato del server che il modello non vede mai. Nessuno dei due
       *   arriva dagli argomenti dell'attrezzo, ed è la stessa difesa del percorso di deposito.
       */
      componiRapportoRicercaFn: (arg) => researchOrchestrator.componiRapporto({ ...arg, cartella: voce.cartella }),
      /*
       * ⭐⭐⭐⭐ L9 — LA RACCOLTA DI QUESTA CORSA, se questa sessione È una ricerca.
       *
       * ⛔⛔ `null` per OGNI altra sessione, ed è la riga che tiene il rischio a zero: senza
       *   questi due il kernel si comporta bit-per-bit come ieri (`talosHarness.mjs`, doc di
       *   `cacheWeb`). TALOS-BANCO non passa di qui e non può vedere un byte diverso.
       * ⛔ Si chiede AL MOMENTO del giro e non si tiene in una variabile: una ricerca RIPRESA
       *   rimonta la sua raccolta dentro `riprendi()`, e una copia catturata prima punterebbe
       *   all'oggetto di una vita precedente.
       */
      cacheWeb: researchOrchestrator.raccoltaDellaRicerca(sessionId) ?? undefined,
      onPaginaLetta: researchOrchestrator.raccoltaDellaRicerca(sessionId)
        ? ((url, corpo) => researchOrchestrator.raccoltaDellaRicerca(sessionId)?.paginaLetta(url, corpo) ?? null)
        : undefined,
      // ⭐⭐⭐⭐ FASE N, nono e ultimo sistema (30/8) — Tool Forge, GLOBALE come cartellaMemoria: agent-service.mjs costruisce onForgeCrea/toolForge/eseguiToolForgeFn da qui.
      cartellaForge,
      /*
       * ⭐⭐⭐ BC-38 (12/09/2026) — DA QUALE SESSIONE nasce un file di Libreria.
       *
       * ⛔ Misurato prima di scriverlo, non presunto: `avviaSessione` non riceve NESSUNA identità
       *   di sessione (nessun `sessionId`, nessun `nome`, nessun `taskId` fra i suoi parametri —
       *   `agent-service.mjs:209`), quindi i tre punti che salvano in Libreria da dentro il giro
       *   (artefatto, `document_create`, `generate_image`) non potevano scriverlo nemmeno
       *   volendo. Qui invece `sessionId` e `voce` sono in ambito: il legame si aggiunge nel solo
       *   posto che lo conosce, avvolgendo la funzione che il kernel già riceve.
       * ⛔ `...voceLib` DOPO i due campi: se un chiamante passasse un suo `sessionId` vince il suo.
       *   E il nome viaggia com'è ADESSO, congelato nel meta: una sessione rinominata domani non
       *   riscrive la storia dei file che ha prodotto ieri.
       */
      salvaVoceLibreriaFn: (voceLib, depsLib) => salvaVoceLibreriaFn(
        { sessionId, sessionNome: voce.nome ?? null, ...voceLib },
        depsLib,
      ),
      onEvento: (evento, opzioni) => broadcast(voce, evento, opzioni),
    };
    const esecuzione = providerEffettivo === 'local'
      ? eseguiRuntimeLocale({ voce, task, messaggiIniziali, runtimeId: runtimeIdEffettivo, modelId: voce.modelId, reasoning: reasoningEffettivo, sessionId })
        .catch((errore) => {
          if (voce.controller.signal.aborted || fallbackConsentEffettivo !== true || typeof chiaveEffettiva !== 'string' || chiaveEffettiva.length === 0) throw errore;
          voce.fallbackProvider = 'openrouter';
          broadcast(voce, { type: 'RuntimeFallback', from: 'local', to: 'openrouter', reason: errore?.code || 'LOCAL_RUNTIME_FAILED', provider: 'local', runtimeId: runtimeIdEffettivo, modelId: voce.modelId, backend: runtimeIdEffettivo, at: clock().toISOString() });
          return avviaSessioneFn(cloudOptions);
        })
      : typeof contextHooksFn === 'function'
        ? Promise.resolve().then(async () => {
          const contextHooks = await contextHooksFn({ sessionId, runId: `${sessionId}:${versioneGiro}`, signal: controller.signal });
          controller.signal.throwIfAborted();
          return avviaSessioneFn({ ...cloudOptions, ...(contextHooks ? { contextHooks } : {}) });
        })
        : avviaSessioneFn(cloudOptions);
    esecuzione.then((risultato) => {
      /*
       * ⭐ Catturato per un resume/fork FUTURO. Se talosLavora non ha
       * prodotto un esito (non dovrebbe succedere, ma non è un'eccezione da
       * gestire qui), resta null: riprendere questa sessione dirà
       * onestamente che non c'è niente da ereditare, invece di lanciare.
       */
      const messaggiRestituiti = risultato?.esito?.messaggiFinali;
      if (Array.isArray(messaggiRestituiti)) {
        voce.messaggiFinali = messaggiRestituiti;
      } else if (Array.isArray(messaggiPrimaDelGiro)) {
        voce.messaggiFinali = messaggiPrimaDelGiro;
      }
      voce.messaggiPendente = null;
      /*
       * ⭐⭐⭐ FASE L (30/8) — SOLO quando c'è davvero qualcosa da salvare:
       * senza questa riga su disco, un ripristino dopo un riavvio
       * troverebbe una sessione con la sua storia (gli eventi) ma
       * `messaggiFinali:null` — resume()/forka() la rifiuterebbero
       * onestamente (SESSION_NOT_READY, il loro gate già esistente),
       * mai un crash: lo stesso limite dichiarato altrove nel settore
       * (un crash abbastanza precoce può non lasciare alcun artefatto
       * ripristinabile) — qui capita solo se il turno NON è mai arrivato
       * a questo punto, prima che questo file venisse scritto su disco.
       */
      persistiMessaggiFinali(voce, versioneGiro);
      /* ⭐ BC-07 (11/09) — e i TEMPI di questo giro, una riga sola: vedi `persistiTempiDelGiro`. */
      persistiTempiDelGiro(voce, versioneGiro);
      // ⭐⭐⭐ FASE C (28/8) — per il foglio "Albero sessione": lo stato reale di OGNI sessione che conclude, non solo delle figlie (inerte/ignorato per una sessione senza padre).
      voce.esitoDelega = risultato?.esito?.comeFinita ?? (risultato?.ok === false ? 'fallito' : null);
      const redirect = voce.reindirizzamentoPendente;
      if (redirect) {
        voce.reindirizzamentoPendente = null;
        const haCronologiaCanonica = Array.isArray(voce.messaggiFinali);
        const messaggiInizialiRedirect = haCronologiaCanonica
          ? [...voce.messaggiFinali, { role: 'user', content: imageMessageContent(redirect.testo, redirect.immagini) }]
          : undefined;
        const consegnaOriginale = task?.consegna || task?.consegnaCorta || '';
        const consegnaRedirect = haCronologiaCanonica
          ? redirect.testo
          : [consegnaOriginale, `Correzione dell’utente: ${redirect.testo}`].filter(Boolean).join('\n\n');
        const versioneGiroRedirect = (voce.versioneGiro ?? 0) + 1;
        if (haCronologiaCanonica) {
          try {
            persistiCheckpointRipresa(voce, messaggiInizialiRedirect, versioneGiroRedirect);
          } catch {
            broadcast(voce, runRedirectFailed({
              redirectId: redirect.redirectId,
              message: 'Non è stato possibile salvare la correzione. Riprova senza chiudere la sessione.',
              code: 'SESSION_STORE_WRITE_FAILED',
            }));
            onConclusioneFn?.(risultato);
            return;
          }
          voce.messaggiPendente = messaggiInizialiRedirect;
        }
        broadcast(voce, runRedirectApplied({ redirectId: redirect.redirectId, testo: redirect.testo, immagini: redirect.immagini }));
        const ripartenza = avviaESegui({
          sessionId,
          taskId: voce.taskId,
          cartella: voce.cartella,
          task: {
            consegna: consegnaRedirect,
            ...(redirect.immagini?.length ? { immagini: redirect.immagini } : {}),
            progetto: task?.progetto ?? voce.task?.progetto,
            seguito: true,
            reindirizzato: true,
          },
          comandoProva: voce.comandoProva,
          messaggiIniziali: messaggiInizialiRedirect,
          forkDa: voce.forkDa,
          voceEsistente: voce,
          onConclusioneFn,
          versioneGiroRichiesta: versioneGiroRedirect,
        });
        if ('erroreAvvio' in ripartenza) {
          broadcast(voce, runRedirectFailed({
            redirectId: redirect.redirectId,
            message: ripartenza.erroreAvvio,
            code: ripartenza.code,
          }));
          onConclusioneFn?.(risultato);
        }
        return;
      }
      // ⭐⭐⭐ FASE C (28/8) — una delega si considera conclusa solo quando
      // non esiste un reindirizzamento che continua la STESSA sessione.
      onConclusioneFn?.(risultato);
    }).catch((errore) => {
      /*
       * ⛔ Ripiego, non il percorso atteso: avviaSessione dichiara (e il suo
       * stesso test lo prova) di non lanciare mai. Se lo facesse comunque —
       * un bug futuro, una promise rifiutata prima del suo try/catch — la
       * sessione non deve restare silenziosamente a metà.
       */
      // ⛔⛔⛔ FASE C — AL CONTRARIO: se questa sessione è una figlia, il padre non deve restare appeso in eterno anche quando QUESTO ramo raro (mai atteso) scatta.
      // ⭐ BC-44 (12/09) — `codiceErrore` anche su questo ramo raro, per la stessa ragione dell'altro (agent-service.mjs): chi conclude deve poter dire PERCHÉ, e la stessa forma in tutti e due i punti evita che uno dei due diventi il caso speciale che nessuno ricorda.
      onConclusioneFn?.({ ok: false, esito: null, erroreInterno: errore instanceof Error ? errore.message : String(errore), codiceErrore: typeof errore?.code === 'string' ? errore.code : 'internal-error' });
      if (!voce.conclusa) {
        broadcast(voce, {
          type: 'RunError',
          message: errore instanceof Error ? errore.message : String(errore),
          code: errore?.code || 'internal-error',
        });
      }
      if (voce.reindirizzamentoPendente) {
        const { redirectId } = voce.reindirizzamentoPendente;
        voce.reindirizzamentoPendente = null;
        broadcast(voce, runRedirectFailed({
          redirectId,
          message: errore instanceof Error ? errore.message : String(errore),
          code: errore?.code || 'internal-error',
        }));
      }
    });

    return { sessionId };
  }

  /**
   * ⭐ O-01 (04/9) — la dipendenza esterna di `web_search`, LETTA (mai
   * dedotta): `ricercaWebFn()` è la stessa funzione che il kernel riceve a
   * ogni giro, quindi ciò che il pannello mostra è esattamente ciò con cui
   * l'attrezzo girerebbe adesso. ⛔ Si legge SOLO `provider`: la chiave sta
   * nel portachiavi e non esce di lì, nemmeno per un pannello di sola lettura.
   */
  function dipendenzaRicercaWeb() {
    let conf = null;
    try { conf = ricercaWebFn ? ricercaWebFn() : { ricercaWeb, richiediRicercaFn: undefined }; } catch { conf = null; }
    const scelta = conf?.ricercaWeb;
    if (!scelta) return { stato: 'non-configurata', dettaglio: 'Nessuna fonte di ricerca pronta: sceglila in Impostazioni → Ricerca web.' };
    if (conf?.richiediRicercaFn) return { stato: 'pronta', dettaglio: 'Fonte: DuckDuckGo, senza chiave' };
    return { stato: 'pronta', dettaglio: `Fonte: ${scelta.provider}` };
  }

  /**
   * ⭐ O-01 (04/9) — il corpo condiviso da `elencaAttrezzi` (per sessione) e
   * `elencaAttrezziPredefiniti` (senza sessione): l'unica differenza fra i
   * due è chi ha scelto i permessi per-attrezzo.
   */
  async function costruisciElencoAttrezzi(permessiPerAttrezzo) {
    if (typeof attrezziKernelFn !== 'function') {
      return { ok: true, attrezzi: null, errore: 'Il runtime agente non è configurato per questa installazione: gli attrezzi offerti non sono osservabili.' };
    }
    let dalKernel;
    try {
      dalKernel = await attrezziKernelFn();
    } catch (errore) {
      return { ok: true, attrezzi: null, errore: errore?.message ?? 'Il runtime agente non ha risposto.' };
    }
    const offerti = new Set(strumentiEstesi);
    const scelte = permessiPerAttrezzo && typeof permessiPerAttrezzo === 'object' ? permessiPerAttrezzo : {};
    const riga = (a, categoria) => ({
      nome: a.nome,
      descrizione: a.descrizione,
      categoria,
      permessoConfigurabile: ATTREZZI_CON_PERMESSO_PER_ATTREZZO.has(a.nome),
      // ⛔ `null` = «come la policy di sessione», che NON è «consentito»: due stati diversi, mai appiattiti.
      permesso: ATTREZZI_CON_PERMESSO_PER_ATTREZZO.has(a.nome) ? (scelte[a.nome] ?? null) : null,
      dipendenza: a.nome === 'web_search' ? dipendenzaRicercaWeb() : null,
      tokenSchemaStimati: a.tokenSchemaStimati,
    });
    const attrezzi = [
      ...dalKernel.base.map((a) => riga(a, 'base')),
      // ⛔ Solo quelli davvero passati al kernel: `ATTREZZI_ESTESI_OPENAI` ne dichiara di più di quanti `strumentiEstesi` ne accenda.
      ...dalKernel.estesi.filter((a) => offerti.has(a.nome)).map((a) => riga(a, 'esteso')),
    ];
    return { ok: true, attrezzi, errore: null };
  }

  return Object.freeze({
    async pubblicaEventoContesto({ sessionId, event }) {
      const voce = sessioni.get(sessionId);
      if (!voce || !cartellaStore) throw Object.assign(new Error('Registro persistente della conversazione non disponibile.'), { code: 'CTX_SESSION_NOT_FOUND' });
      const wire = contextEngineEvent(event);
      if (wire.value.sessionId !== sessionId) throw Object.assign(new Error('Evento di un altra conversazione.'), { code: 'CTX_SESSION_MISMATCH' });
      const existing = voce.eventi.find(item => item.type === 'CUSTOM' && item.name === 'talos.context' && item.value?.id === event.id);
      if (existing && JSON.stringify(existing.value) !== JSON.stringify(wire.value)) throw Object.assign(new Error('Identita evento gia usata con un contenuto diverso.'), { code: 'CTX_EVENT_CONFLICT' });
      let deliveries = contextDeliveries.get(voce);
      if (!deliveries) { deliveries = new Map(); contextDeliveries.set(voce, deliveries); }
      let receipt = deliveries.get(event.id);
      if (receipt && JSON.stringify(receipt.wire.value) !== JSON.stringify(wire.value)) throw Object.assign(new Error('Identita evento gia in consegna con un contenuto diverso.'), { code: 'CTX_EVENT_CONFLICT' });
      // Un evento ricostruito dal registro e gia persistito. Le ricevute in
      // memoria distinguono invece il tentativo corrente da uno fallito.
      if (existing && !receipt) return structuredClone(existing);
      if (receipt?.committed) return structuredClone(receipt.wire);
      if (!receipt) { receipt = { wire, committed: false, pending: null }; deliveries.set(event.id, receipt); }
      if (!receipt.pending) {
        const current = receipt;
        current.pending = Promise.resolve().then(() => existing
          ? registraRigaFn({ cartellaStore, sessionId, record: current.wire, durable: true })
          : broadcast(voce, current.wire, { durable: true }))
          .then(() => { current.committed = true; return current.wire; })
          .finally(() => { current.pending = null; });
      }
      return structuredClone(await receipt.pending);
    },
    /** Backend-only model identity; no credentials or mutable session object. */
    leggiSessioneContesto(sessionId) {
      const voce = sessioni.get(sessionId);
      return voce ? structuredClone({ sessionId, modello: voce.modello, provider: voce.provider, runtimeId: voce.runtimeId, modelId: voce.modelId, reasoning: voce.reasoning, conclusa: voce.conclusa, interrotta: voce.interrotta === true }) : null;
    },
    /**
     * ⭐⭐⭐ FASE L (30/8) — chiamata UNA volta da `server.mjs`, prima di
     * accettare richieste: legge `.sessions-store/`, ricostruisce una
     * voce PER OGNI sessione persistita che questo processo non ha
     * ancora in memoria (un avvio pulito non ne ha mai). Una sessione
     * il cui ultimo evento non è `RunFinished`/`RunError` è
     * `interrotta:true` — onestamente: il processo che la eseguiva è
     * sparito, nessun turno può "riprendere da dove stava" (lo stesso
     * limite dichiarato altrove nel settore: il ripristino è una rilettura
     * della trascrizione, mai la resurrezione di uno stato in memoria).
     * Una voce corrotta (JSON illeggibile oltre l'ultima riga, vedi
     * `session-store.mjs`) NON blocca le altre — loggata e saltata.
     * @returns {Promise<{ripristinate:number, totali:number}>}
     */
    async ripristina() {
      if (!cartellaStore) {
        ultimoRipristino = { ripristinate: 0, totali: 0 };
        sessioniCorrotte = [];
        sessioniScartate = [];
        return ultimoRipristino;
      } // nessuna persistenza configurata: mai un tentativo di leggere un percorso che non c'è
      const id = await elencaSessioniPersistiteFn({ cartellaStore });
      let ripristinate = 0;
      const corrotte = [];
      /*
       * ⭐⭐⭐ 04/9 — W0-01, RESTORE ACCOUNTING. Ogni uscita di questo ciclo
       * lascia un motivo: `vuota`, `senza-intestazione`, `corrotta`,
       * `lettura-fallita`. Prima tre di queste erano `continue` muti e il
       * Doctor diceva «N su M» senza poter dire dov'era finita la differenza
       * (il 02/09: 1/17 ripristinate, 15 scartate in silenzio).
       * Il conto torna per costruzione: ripristinate + scartate = totali
       * (le sessioni già vive nel processo non sono né l'una né l'altra e
       * non stanno nei totali del ripristino).
       */
      const scartate = [];
      for (const sessionId of id) {
        if (sessioni.has(sessionId)) continue; // già viva in questo processo: mai sovrascrivere
        let record;
        try {
          record = await leggiRegistroFn({ cartellaStore, sessionId });
        } catch (errore) {
          console.error(`[session-store] sessione ${sessionId} non ripristinata:`, errore instanceof Error ? errore.message : errore);
          if (errore?.code === 'SESSION_STORE_CORRUPT') { corrotte.push(sessionId); scartate.push({ sessionId, motivo: 'corrotta', dettaglio: errore.message }); }
          else scartate.push({ sessionId, motivo: 'lettura-fallita', dettaglio: errore instanceof Error ? errore.message : String(errore) });
          continue;
        }
        if (!record || record.length === 0) { scartate.push({ sessionId, motivo: 'vuota' }); continue; }
        const intestazione = record.find((r) => r.tipo === 'intestazione');
        if (!intestazione) { scartate.push({ sessionId, motivo: 'senza-intestazione', dettaglio: `${record.length} record, nessuna intestazione` }); continue; } // senza intestazione non c'è abbastanza per una voce onesta
        // ⭐ 04/9, W0-02 — assente = 0 (file di prima), uguale o minore = si legge, maggiore = scritto da un TALOS più nuovo: scarto onesto, mai una lettura a metà.
        const schemaFile = Number.isSafeInteger(intestazione.schema) ? intestazione.schema : 0;
        if (schemaFile > SCHEMA_SESSIONE) { scartate.push({ sessionId, motivo: 'schema-futuro', dettaglio: `schema ${schemaFile}, questo TALOS legge fino a ${SCHEMA_SESSIONE}` }); continue; }
        // ⛔ `type` (AG-UI, PascalCase) contro `tipo` (i record di questo file, italiano): due nomi di campo DIVERSI apposta, mai un'ambiguità nel distinguerli nello stesso file.
        // ⛔ 02/09 — i file scritti PRIMA di oggi contengono WorkspaceChanged (vedi broadcast()): stato del filesystem, non storia — si scartano al ripristino, così anche i log vecchi tornano leggeri senza riscriverli.
        const contextReplay = new Set();
        const eventiFisici = record.filter((r) => typeof r.type === 'string' && r.type !== 'WorkspaceChanged').filter(evento => {
          if (evento.type !== 'CUSTOM' || evento.name !== 'talos.context' || !evento.value?.id) return true;
          // Append riuscito ma ack interrotto: il log puo contenere lo stesso
          // evento due volte. Solo le copie identiche sono deduplicate.
          const identity = JSON.stringify(evento.value);
          if (contextReplay.has(identity)) return false;
          contextReplay.add(identity); return true;
        });
        const eventi = eventiFisici.every((evento) => Number.isSafeInteger(evento._sequenza))
          ? [...eventiFisici].sort((a, b) => a._sequenza - b._sequenza)
          : eventiFisici;
        const ultimaSequenza = eventi.reduce(
          (massimo, evento) => Number.isSafeInteger(evento._sequenza) ? Math.max(massimo, evento._sequenza) : massimo,
          0,
        );
        const finali = record.map((r, indice) => ({ record: r, indice })).filter((voceRecord) => voceRecord.record.tipo === 'messaggi-finali');
        const checkpoint = record.map((r, indice) => ({ record: r, indice })).filter((voceRecord) => voceRecord.record.tipo === 'checkpoint-ripresa');
        const piuRecente = (voci) => voci.reduce((corrente, candidato) => {
          if (!corrente) return candidato;
          const versioneCorrente = Number.isSafeInteger(corrente.record.versioneGiro) ? corrente.record.versioneGiro : -1;
          const versioneCandidato = Number.isSafeInteger(candidato.record.versioneGiro) ? candidato.record.versioneGiro : -1;
          if (versioneCandidato !== versioneCorrente) return versioneCandidato > versioneCorrente ? candidato : corrente;
          return candidato.indice > corrente.indice ? candidato : corrente;
        }, null);
        const finalePiuRecente = piuRecente(finali);
        const checkpointPiuRecente = piuRecente(checkpoint);
        const impostazioniRecord = record.filter((r) => r.tipo === 'impostazioni-sessione').at(-1) ?? null;
        // ⭐ 02/09 — il nome scelto (o dato dal primo messaggio) sopravvive al riavvio: l'ULTIMA riga nome-sessione vince, come per le impostazioni.
        const nomeRecord = record.filter((r) => r.tipo === 'nome-sessione' && typeof r.nome === 'string' && r.nome.trim().length > 0).at(-1) ?? null;
        /* ⭐ 14/09 — la coda sopravvive al riavvio, come in Codex (ThreadStore). Il processo che l'avrebbe consegnata non c'è
           più: torna IN PAUSA, e parte solo quando la persona la invia. L'ultimo record vince. */
        const codaRecord = record.filter((r) => r.tipo === 'coda' && Array.isArray(r.voci)).at(-1) ?? null;
        const codaRipristinata = (codaRecord?.voci ?? [])
          .filter((v) => v && typeof v.id === 'string' && typeof v.testo === 'string' && v.testo.trim() !== '')
          .map((v) => ({ id: v.id, testo: v.testo, ...(Array.isArray(v.immagini) && v.immagini.length ? { immagini: v.immagini } : {}) }));
        const impostazioni = impostazioniRecord ? { ...intestazione, ...impostazioniRecord } : intestazione;
        const ultimoEventoEsecuzione = [...eventi].reverse().find((evento) => (
          evento?.type === 'RunStarted' || evento?.type === 'RunFinished' || evento?.type === 'RunError'
        ));
        const versioneFinale = Number.isSafeInteger(finalePiuRecente?.record.versioneGiro) ? finalePiuRecente.record.versioneGiro : null;
        const versioneCheckpoint = Number.isSafeInteger(checkpointPiuRecente?.record.versioneGiro) ? checkpointPiuRecente.record.versioneGiro : null;
        const numeroGiriOsservati = eventi.filter((evento) => evento?.type === 'RunStarted').length;
        const versioneGiro = Math.max(numeroGiriOsservati, versioneFinale ?? 0, versioneCheckpoint ?? 0);
        const checkpointSuccessivoAlFinale = Boolean(checkpointPiuRecente) && (
          versioneCheckpoint !== null && versioneFinale !== null
            ? versioneCheckpoint > versioneFinale
            : ultimoEventoEsecuzione?.type === 'RunStarted' || checkpointPiuRecente.indice > (finalePiuRecente?.indice ?? -1)
        );
        const messaggiFinaliRecord = finalePiuRecente?.record ?? null;
        const checkpointRecord = checkpointSuccessivoAlFinale ? checkpointPiuRecente?.record ?? null : null;
        /*
         * ⭐⭐⭐ FASE L, trovato da un test intermittente (30/8), non da
         * lettura: la riga RunFinished (broadcast()) e la riga
         * messaggi-finali sono DUE scritture fire-and-forget indipendenti,
         * innescate quasi nello stesso istante ma senza alcuna garanzia
         * d'ordine reciproca — su disco possono atterrare in QUALUNQUE
         * ordine. Basarsi solo sull'ULTIMO evento per `conclusa` significa
         * che, se messaggi-finali vince la gara, una sessione DAVVERO
         * conclusa (con una conversazione vera già scritta) viene
         * classificata `interrotta` per un dettaglio di timing del
         * filesystem, non per la sua storia reale. Un WorkspaceChanged dopo
         * RunError non riapre il giro: si guarda l'ultimo evento del LIFECYCLE
         * agente. Una vecchia riga finale, però, non conclude un RunStarted
         * successivo: deve essere fisicamente posteriore al RunStarted più
         * recente. Il checkpoint di input è separato e non vale mai come
         * prova di output concluso.
         */
        const finaleConfermaIlGiroCorrente = versioneFinale !== null && versioneFinale === versioneGiro && !checkpointSuccessivoAlFinale;
        const terminaleConfermaIlGiroCorrente = numeroGiriOsservati === versioneGiro && (
          ultimoEventoEsecuzione?.type === 'RunFinished' || ultimoEventoEsecuzione?.type === 'RunError'
        );
        const conclusa = terminaleConfermaIlGiroCorrente || finaleConfermaIlGiroCorrente;
        /*
         * ⭐⭐⭐ 03/9 — Full access sopravvive a un riavvio del server:
         * `intestazione.cartella` è sempre quella di PARTENZA (scritta
         * PRIMA di un eventuale allargamento, vedi il commento su
         * cartellaEffettivaPerPermessi più sopra in questo file) — la si
         * ricalcola con l'ULTIMO permesso restaurato (`impostazioni.permessi`,
         * non `intestazione.permessi`: un cambio-permesso post-avvio vince,
         * stessa fonte già usata due righe sotto per modello/reasoning).
         * Senza questo, una sessione con Full access acceso PRIMA di un
         * riavvio tornerebbe castrata alla cartella di partenza dopo il
         * riavvio — un downgrade silenzioso di un permesso già concesso.
         */
        const cartellaRipristinata = cartellaEffettivaPerPermessi(intestazione.cartella, impostazioni.permessi, intestazione.cartellaGiaScelta);
        const voce = {
          eventi, ascoltatori: new Set(), taskId: intestazione.taskId,
          cartella: cartellaRipristinata, cartellaBase: intestazione.cartella, cartellaGiaScelta: intestazione.cartellaGiaScelta,
          task: intestazione.task,
          comandoProva: intestazione.comandoProva, forkDa: intestazione.forkDa,
          avviataAlle: intestazione.avviataAlle, messaggiFinali: messaggiFinaliRecord?.messaggiFinali ?? null,
          messaggiPendente: Array.isArray(checkpointRecord?.messaggi) ? checkpointRecord.messaggi : null,
          modello: impostazioni.modello, modelloPlanner: impostazioni.modelloPlanner, reasoning: impostazioni.reasoning,
          fallbackProviders: validaFallbackProviders(impostazioni.fallbackProviders ?? [], { usaAttrezzi: true }),
          // Sessioni nate PRIMA della riga nome-sessione (o mai rinominate): per un compito libero il client ha sempre usato il primo messaggio come titolo (titoloDalPrimoMessaggio, 80 caratteri) — stesso valore, ricavato dall'intestazione invece che perso. Un task del corpus resta col suo taskId, come prima.
          nome: nomeRecord?.nome ?? (typeof intestazione.taskId === 'string' && intestazione.taskId.startsWith('libero:') && typeof intestazione.task?.consegnaCorta === 'string' && intestazione.task.consegnaCorta.trim() ? intestazione.task.consegnaCorta.replace(/\s+/g, ' ').trim().slice(0, 80) : null),
          mobile: intestazione.mobile, permessi: impostazioni.permessi, permessiPerAttrezzo: impostazioni.permessiPerAttrezzo,
          provider: intestazione.provider ?? 'cloud', runtimeId: intestazione.runtimeId ?? null,
          modelId: impostazioni.modelId ?? impostazioni.modello ?? null, fallbackConsent: intestazione.fallbackConsent === true,
          approvazionePendente: null, reindirizzamentoPendente: null, redirectAnnullati: new Set(), padreId: intestazione.padreId, profonditaDelega: intestazione.profonditaDelega,
          esitoDelega: intestazione.padreId ? esitoDelegaDaEventi(eventi, { task: intestazione.task }) : null,
          evidenzaDelega: intestazione.padreId ? analizzaEvidenzaDelega(eventi) : null,
          codaMessaggi: codaRipristinata, codaInPausa: codaRipristinata.length > 0, sessionId, controller: new AbortController(),
          conclusa, ripristinata: true, interrotta: !conclusa,
          prossimaSequenza: ultimaSequenza, versioneGiro,
          durateRagionamentoSalvate: durateRagionamentoDaRecord(record), // ⭐ 13/09 sera: la durata del ragionamento sopravvive al riavvio
        };
        // SESSION-RESTORE-LAZY-WATCHER-24 — nessun watcher durante il boot:
        // la cronologia resta leggibile e il primo vero resume lo attiverà.
        voce.fermaWatcher = null;
        sessioni.set(sessionId, voce);
        const redirectOrfano = redirectOrfanoDaEventi(eventi);
        if (redirectOrfano) {
          broadcast(voce, runRedirectFailed({
            redirectId: redirectOrfano.redirectId,
            code: 'SESSION_INTERRUPTED',
            message: 'Il server è stato riavviato prima che il reindirizzamento potesse concludersi.',
          }));
        }
        ripristinate += 1;
      }
      /*
       * ⛔ BC-03 — DOPO il ciclo, non dentro: una figlia può essere letta prima della sua madre
       *   (l'ordine dei file sul disco non è quello della famiglia), e la collisione si giudica
       *   solo quando tutte le sorelle sono nella Map. Vedi `ricostruisciCollisioniDiScrittura`.
       */
      ricostruisciCollisioniDiScrittura(sessioni, scrittureDelleFiglie);
      ultimoRipristino = { ripristinate, totali: id.length };
      sessioniCorrotte = corrotte;
      sessioniScartate = scartate;
      return ultimoRipristino;
    },

    /** Stato di sola lettura dell'ultimo ripristino: non modifica né elimina i registri danneggiati. `scartate` (W0-01) porta il motivo di ogni file non ripristinato. */
    statoPersistenza() {
      return { corrotte: [...sessioniCorrotte], scartate: sessioniScartate.map((s) => ({ ...s })), ultimaLettura: { ...ultimoRipristino } };
    },

    /**
     * ⭐⭐⭐ FASE C (28/8) — sub-agenti. Per il foglio "Albero sessione":
     * i figli VERI di una sessione, non le due righe finte del mockup.
     * @returns {{ok:true, figli:Array}|{erroreAvvio:string, code:string}}
     */
    elencaFigli(sessionId) {
      if (!sessioni.get(sessionId)) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      return { ok: true, figli: subagentOrchestrator.elencaFigli(sessionId) };
    },
    /**
     * ⭐⭐⭐ FASE D (28/8) — coda messaggi. Un messaggio mentre la sessione
     * è ANCORA IN CORSO non viene rifiutato: entra in `voce.codaMessaggi`
     * (FIFO), consegnato dal kernel al punto giusto (vedi
     * LEDGER-FASE-D-CODA.md, D.1). Una sessione GIÀ CONCLUSA rifiuta —
     * lì il percorso giusto è `resume()`, due meccanismi per due stati
     * diversi, mai sovrapposti.
     * @returns {{ok:true, posizione:number}|{erroreAvvio:string, code:string}}
     */
    accodaMessaggio(sessionId, testo, immagini = []) {
      const voce = sessioni.get(sessionId);
      if (!voce) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      if (voce.conclusa) return { erroreAvvio: 'La sessione è già conclusa: usa resume(), non la coda', code: 'SESSION_NOT_READY' };
      /*
       * ⭐⭐⭐ FASE L (30/8) — trovato leggendo questo gate con lo stesso
       * occhio già applicato a resume()/forka()/compatta()/shell(): senza
       * questo controllo, una sessione `interrotta` (processo morto,
       * conclusa:false) accoderebbe SILENZIOSAMENTE un messaggio che
       * nessuno consumerà mai — nessun talosLavora vivo lo leggerà, mai
       * un errore, mai una consegna. Non "inventa un dato", ma promette
       * un effetto che non arriverà mai: stessa famiglia di guasto,
       * rifiutato onestamente invece che accettato a vuoto.
       */
      if (voce.interrotta) {
        return { erroreAvvio: 'Questa sessione è stata interrotta da un riavvio del server: un messaggio in coda qui non verrebbe mai consegnato. Avvia una sessione nuova.', code: 'SESSION_NOT_READY' };
      }
      if (typeof testo !== 'string' || testo.trim() === '') return { erroreAvvio: 'Il messaggio in coda non può essere vuoto', code: 'QUERY_INVALID' };
      voce.codaMessaggi.push({ id: randomUUID(), testo, ...(immagini.length ? { immagini } : {}) });
      // ⭐ 14/09 — accodare di nuovo scioglie una pausa di prima, come in Hermes (`store/composer-queue.ts`): la persona ha ripreso a parlare.
      voce.codaInPausa = false;
      annunciaCoda(voce);
      return { ok: true, posizione: voce.codaMessaggi.length, coda: statoCodaDi(voce) };
    },
    /**
     * Toglie UN messaggio dalla coda. ⭐ 14/09: con `id` quello che la persona vede nel banner; senza, l'ULTIMO accodato
     * (il comportamento di prima, per chi non manda l'id). Mai un azzeramento di messaggi più vecchi già in attesa.
     * @returns {{ok:true, rimosso:boolean, coda:object}|{erroreAvvio:string, code:string}}
     */
    svuotaCoda(sessionId, { id = null } = {}) {
      const voce = sessioni.get(sessionId);
      if (!voce) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      let rimosso = false;
      if (id === null) {
        rimosso = voce.codaMessaggi.length > 0;
        if (rimosso) voce.codaMessaggi.pop();
      } else {
        const indice = voce.codaMessaggi.findIndex((item) => voceDiCoda(item).id === id);
        rimosso = indice >= 0;
        if (rimosso) voce.codaMessaggi.splice(indice, 1);
      }
      if (voce.codaMessaggi.length === 0) voce.codaInPausa = false;
      if (rimosso) annunciaCoda(voce);
      return { ok: true, rimosso, coda: statoCodaDi(voce) };
    },

    /** ⭐ 14/09 — la coda com'è adesso, per chi apre la sessione dopo (Codex: `thread/queue/list`). */
    statoCoda(sessionId) {
      const voce = sessioni.get(sessionId);
      if (!voce) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      return { ok: true, ...statoCodaDi(voce) };
    },

    /**
     * ⭐ 14/09 — «Invia ora» un messaggio in coda. A giro VIVO entra come correzione (`reindirizza`, lo stesso gesto di
     * «Indirizza ora»); a giro FERMO riprende la sessione con quel messaggio (`resume`). Codex ha la stessa porta,
     * `thread/queue/start` («resume the thread before starting a queued message»); Hermes l'invio dalla riga del pannello.
     * ⛔ Se la porta rifiuta, il messaggio torna al suo posto: una parola della persona non si perde per un errore.
     * @returns {Promise<{ok:true, modo:'reindirizzato'|'ripreso', coda:object, redirectId?:string}|{erroreAvvio:string, code:string}>}
     */
    async inviaDallaCoda(sessionId, id) {
      const voce = sessioni.get(sessionId);
      if (!voce) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      const indice = voce.codaMessaggi.findIndex((item) => voceDiCoda(item).id === id);
      if (indice < 0) return { erroreAvvio: 'Questo messaggio non è più in coda', code: 'NOT_FOUND' };
      const [item] = voce.codaMessaggi.splice(indice, 1);
      const { testo, immagini } = voceDiCoda(item);
      const inCorso = !voce.conclusa && !voce.interrotta;
      let esito;
      try {
        esito = inCorso
          ? this.reindirizza(sessionId, testo, immagini.length ? { immagini } : {})
          : await this.resume(sessionId, testo, immagini);
      } catch (errore) {
        voce.codaMessaggi.splice(indice, 0, item);
        throw errore;
      }
      if (esito && typeof esito === 'object' && 'erroreAvvio' in esito) {
        voce.codaMessaggi.splice(indice, 0, item);
        return esito;
      }
      if (voce.codaMessaggi.length === 0) voce.codaInPausa = false;
      annunciaCoda(voce);
      return { ok: true, modo: inCorso ? 'reindirizzato' : 'ripreso', coda: statoCodaDi(voce), ...(esito?.redirectId ? { redirectId: esito.redirectId } : {}) };
    },
    /**
     * @returns {{sessionId:string}|{erroreAvvio:string, code:string}} — mai
     * un throw: un id fuori allowlist o una chiave assente sono risposte
     * attese di un endpoint HTTP, non un guasto del registro.
     *
     * ⛔⛔⛔ 04/9 — W0-08: fino a questo commit questa era un'AFFERMAZIONE
     * FALSA — diceva "INERTE" ma il codice non passava mai
     * `cartellaGiaScelta:true` ad `avviaESegui`, quindi `permessiScelto:
     * 'Full access'` allargava DAVVERO alla radice del disco (misurato
     * leggendo `cartellaEffettivaPerPermessi`: senza quel flag,
     * `permessi==='Full access'` basta da sola). Non teorico: la
     * corruzione del 31/8 (riparata il 4/9) e il lag del 2/9 avevano
     * entrambi una sessione con l'intero albero di C:\ dentro. Ricerca
     * 4/9: lo stato dell'arte separa l'asse "quanto posso fare"
     * (read-only/workspace-write/danger-full-access) da "dove posso
     * farlo"; un'estensione esplicita della cartella non è mai automatica,
     * e una revisione recente ha chiuso sei casi in cui qualcosa DENTRO
     * il confine approvato raggiungeva fuori — stesso pattern di qui;
     * FINOS Agent Authority Least Privilege Framework: il confine di
     * risorsa è un asse separato
     * da quello operativo) — conferma che "quanto posso fare" e "dove
     * posso farlo" non devono mai dipendere l'uno dall'altro.
     *
     * ⇒ Ora è vero per davvero: `cartellaGiaScelta:true` qui sotto rende
     * "Full access" INERTE sulla cartella per un task del catalogo, la
     * cui cartella è SEMPRE la copia usa-e-getta di `task-catalog.mjs`,
     * mai scelta dall'owner — "Full access" allarga solo dove esiste un
     * percorso a piacere da cui allargarsi (`avviaLibero`, sotto, SOLO
     * per l'allowlist `cartellaId`). Nessun errore verso il client HTTP
     * (incluso `POST /api/v1/sessions`, che non ha altra validazione su
     * questa combinazione): la richiesta resta accettata, il permesso
     * "Full access" resta quello scelto e si comporta come "Workspace
     * write" SOLO riguardo a quale cartella — il resto (nessuna
     * approvazione richiesta) è identico fra i due, vedi il test
     * "'Workspace write'/'Full access' restano entrambi senza
     * livelloAccesso/chiediApprovazioneFn".
     */
    avvia(taskId, {
      modelloScelto = null, modelloPlannerScelto = null, reasoningScelto = null, mobile = false,
      permessiScelto = null, permessiPerAttrezzoScelto = null,
      provider = 'cloud', runtimeId = null, modelId = null, fallbackConsent = false, fallbackProviders,
    } = {},
    /*
     * ⭐ D-11 — ARGOMENTO A PARTE, e non per stile: l'origine non è una scelta di chi avvia la
     *   sessione (come il modello o i permessi), è un fatto sulla RICHIESTA. Tenerla fuori
     *   dall'oggetto delle opzioni lascia quel contratto identico — tre test che lo asseriscono
     *   con `deepEqual` se ne sono accorti subito, ed è giusto che siano rimasti severi.
     */
    origineRichiesta = null) {
      let preparato;
      try {
        preparato = preparaTask(taskId);
      } catch (errore) {
        if (errore instanceof TaskCatalogError) return { erroreAvvio: errore.message, code: errore.code };
        throw errore;
      }
      return avviaESegui({
        taskId, cartella: preparato.cartella, task: preparato.task, comandoProva: preparato.comandoProva,
        modelloRichiesta: modelloScelto, modelloPlannerRichiesta: modelloPlannerScelto, reasoningRichiesto: reasoningScelto, mobile,
        permessiRichiesti: permessiScelto, permessiPerAttrezzoRichiesti: permessiPerAttrezzoScelto,
        // ⭐⭐⭐ 04/9 — W0-08: la cartella di un task del catalogo non è MAI un punto di partenza "stretto" da cui allargarsi — è sempre la copia usa-e-getta preparata da task-catalog.mjs. Vedi la doc qui sopra.
        cartellaGiaScelta: true,
        provider, runtimeId, modelId, fallbackConsent, fallbackProviders,
        origineRichiesta, // ⭐ D-11
      });
    },

    /**
     * ⭐⭐⭐ 27/8, owner: "per adesso un allowlist per testare... come se
     * fosse un vero coding agent". Stesso schema di `avvia()`, ma su una cartella
     * dell'allowlist (`config.cartelleProgetto`) invece di un id del
     * corpus benchmark — scrive DIRETTAMENTE sul progetto vero, nessuna
     * copia usa-e-getta (vedi la doc di `custom-task.mjs` sul perché).
     *
     * ⭐⭐⭐ 28/8 — `cartellaLibera` (piano elegant-spinning-dongarra.md)
     * sostituisce `cartellaId` — MUTUAMENTE ESCLUSIVI, verificato QUI e
     * non solo in `custom-task.mjs`.
     *
     * ⛔⛔⛔ 12/09 — BC-14, owner: "il pulsante dice serve accesso pieno".
     * Fino a oggi qui c'era un SECONDO cancello: `cartellaLibera` con un
     * permesso diverso da "Full access" veniva rifiutata (QUERY_INVALID).
     * Nasceva il 28/8 (commit 6c37f8d5) non da un requisito di sicurezza
     * ma dalla FORMA di allora della UI: il campo "percorso a piacere"
     * compariva SOLO scegliendo "Full access", quindi il permesso era il
     * modo con cui la richiesta dichiarava "so che sto uscendo
     * dall'allowlist". Da lì la frase del commento originale ("il confine
     * che conta è: questa richiesta ha dichiarato Full access?").
     *
     * ⛔ Quel cancello NON restringeva niente — allargava. L'ambito vero
     * di una `cartellaLibera` non dipende dal permesso: è `cartellaGiaScelta:true`
     * (vedi `cartellaEffettivaPerPermessi` più sopra) a tenerlo inchiodato
     * ALLA CARTELLA SCELTA, "Full access" compreso. Quindi l'unico effetto
     * del cancello era: chi voleva lavorare in una cartella scelta a mano
     * era OBBLIGATO al livello di accesso più alto — cioè al permesso che
     * toglie ogni approvazione e ogni limite di scrittura dentro quella
     * cartella. Un cancello che, per proteggere, imponeva il massimo dei
     * poteri.
     *
     * ⭐ Ricerca prima di scrivere (12/09/2026, fonti nel rapporto
     * `.claude/RAPPORTO-BC14-CARTELLA-LIBERA-2026-09-12.md`): lo stato
     * dell'arte tiene i DUE ASSI SEPARATI — "di questa cartella mi fido"
     * (VS Code Workspace Trust; il trust dialog di Claude Code, che
     * `--add-dir` richiede per cartella) e "quanto può fare l'agente"
     * (permission mode di Claude Code; `sandbox_mode` di Codex, dove
     * `workspace-write` si applica alla cwd QUALUNQUE essa sia, scelta con
     * `--cd`, senza obbligare a `danger-full-access`). `custom-task.mjs`
     * dichiarava già Workspace Trust come suo modello: qui non era
     * applicato fino in fondo.
     *
     * ⇒ La scelta esplicita resta, e resta provata: il campo
     * `cartellaLibera` è già di per sé una dichiarazione ("questo percorso
     * esatto"), `custom-task.mjs` lo valida a runtime (assoluto, esiste, è
     * una cartella, leggibile e scrivibile) e `cartellaGiaScelta` gli
     * impedisce di crescere. Il permesso torna a essere quello che dice il
     * suo nome: cosa TALOS può fare DENTRO quella cartella — "Read only"
     * non scrive, "On request" chiede, "Workspace write" scrive solo lì,
     * "Full access" come prima. Nessun percorso nuovo diventa
     * raggiungibile: la stessa cartella, con meno poteri.
     */
    avviaLibero({
      cartellaId, cartellaLibera, workspaceLaunchId, consegna, comandoProva, immagini = [],
      modello: modelloScelto = null, modelloPlanner: modelloPlannerScelto = null, reasoning: reasoningScelto = null, mobile = false, fallbackProviders = [],
      permessi: permessiScelto = null, permessiPerAttrezzo: permessiPerAttrezzoScelto = null,
    },
    origineRichiesta = null) { // ⭐ D-11, argomento a parte: vedi la doc su `avvia`
      const scelteWorkspace = [cartellaId, cartellaLibera, workspaceLaunchId].filter((value) => typeof value === 'string' && value.length > 0);
      if (scelteWorkspace.length !== 1) {
        return { erroreAvvio: 'Serve una sola cartella per questa sessione', code: 'QUERY_INVALID' };
      }
      // ⛔ 12/09 — BC-14: qui NON c'è più il cancello "cartellaLibera richiede Full access".
      // Il perché, con le fonti, è nella doc di questo metodo: l'ambito lo tiene
      // `cartellaGiaScelta`, non il permesso. Se un giorno tornasse un cancello, deve
      // restringere qualcosa di misurabile — non imporre il livello di accesso più alto.
      let cartellaRisolta = cartellaLibera;
      if (workspaceLaunchId) {
        if (typeof resolveWorkspaceLaunchFn !== 'function') {
          return { erroreAvvio: 'Il collegamento alla cartella non è disponibile', code: 'WORKSPACE_LAUNCH_NOT_AVAILABLE' };
        }
        try {
          cartellaRisolta = resolveWorkspaceLaunchFn(workspaceLaunchId).percorso;
        } catch (errore) {
          return {
            erroreAvvio: errore?.message || 'Il collegamento alla cartella non è disponibile',
            code: errore?.code === 'WORKSPACE_NOT_AVAILABLE' ? 'WORKSPACE_NOT_AVAILABLE' : 'WORKSPACE_LAUNCH_NOT_AVAILABLE',
          };
        }
      }
      let preparato;
      try {
        preparato = preparaEsecuzioneLiberaFn(cartelleProgetto, { cartellaId, cartellaLibera: cartellaRisolta, consegna, comandoProva });
      } catch (errore) {
        if (errore instanceof CustomTaskError) return { erroreAvvio: errore.message, code: errore.code };
        throw errore;
      }
      if (immagini.length) preparato.task = { ...preparato.task, immagini };
      const risultato = avviaESegui({
        // ⛔ 12/09 — `libero:full-access` è un NOME STORICO, non un permesso: dal 12/09 una
        // cartella scelta a mano parte con qualunque permesso (vedi la doc di questo metodo).
        // Non si rinomina perché è scritto nei .jsonl già su disco e la mappa dei nomi umani
        // lo traduce già in «Compito libero · cartella scelta a mano» (componenti-sidebar).
        taskId: workspaceLaunchId ? 'libero:workspace-launch' : (cartellaLibera ? 'libero:full-access' : `libero:${cartellaId}`), cartella: preparato.cartella, task: preparato.task,
        comandoProva: preparato.comandoProva, modelloRichiesta: modelloScelto, modelloPlannerRichiesta: modelloPlannerScelto, reasoningRichiesto: reasoningScelto, mobile, fallbackProviders,
        permessiRichiesti: permessiScelto, permessiPerAttrezzoRichiesti: permessiPerAttrezzoScelto,
        // ⭐⭐⭐ 03/9 — cartellaLibera/workspaceLaunchId: la persona ha scelto ESATTAMENTE questa cartella, mai un invito ad allargarla oltre — cartellaId (allowlist) resta l'unico caso che allarga.
        // ⭐ 12/09 (BC-14): questa riga è ORA l'unico confine dell'ambito, e vale per tutti e quattro i permessi — prima la frase qui sopra diceva «"Full access" è il cancello obbligato per poterla scegliere», cancello che non esiste più.
        cartellaGiaScelta: Boolean(cartellaLibera) || Boolean(workspaceLaunchId),
        origineRichiesta, // ⭐ D-11
      });
      if (workspaceLaunchId && risultato.sessionId && typeof consumeWorkspaceLaunchFn === 'function') {
        try { consumeWorkspaceLaunchFn(workspaceLaunchId); } catch { /* la sessione è già partita: mai trasformare un successo in errore */ }
      }
      return risultato;
    },

    /**
     * ⭐ Un fork: NUOVA sessione, STESSA cartella/task/comandoProva della
     * sessione origine (niente nuovo checkout — il fork continua a
     * lavorare sugli stessi file, il "contesto ereditato" che il mockup
     * promette), `messaggiIniziali` seminati dalla conversazione FINALE
     * della sessione origine.
     *
     * ⛔ Scope dichiarato: funziona SOLO su una sessione già CONCLUSA (in
     * qualunque modo — successo, fallimento, stop). Un fork mentre la
     * sessione origine è ancora in corso richiederebbe leggere i `messaggi`
     * di un `talosLavora` che sta ancora girando, e quell'array vive dentro
     * la sua chiusura, irraggiungibile da fuori — lo stesso limite che vale
     * per "compatta ora" su una sessione dal vivo. Non è questo il compito
     * di oggi: dichiarato, non nascosto.
     *
     * @returns {{sessionId:string}|{erroreAvvio:string, code:string}}
     */
    forka(sessionIdOrigine) {
      const originale = sessioni.get(sessionIdOrigine);
      if (!originale) return { erroreAvvio: 'Sessione origine non trovata', code: 'NOT_FOUND' };
      if (!originale.messaggiFinali) {
        // ⭐⭐⭐ FASE L (30/8) — stessa distinzione onesta appena aggiunta a resume(): "ancora in corso" e "interrotta da un riavvio" sono due stati diversi sotto lo stesso originale.conclusa===false, mai lo stesso messaggio.
        if (originale.interrotta) {
          return {
            erroreAvvio: 'La sessione origine è stata interrotta da un riavvio del server e non ha una conversazione da ereditare: avvia una sessione nuova.',
            code: 'SESSION_NOT_READY',
          };
        }
        return {
          erroreAvvio: originale.conclusa
            ? 'La sessione origine non ha una conversazione da ereditare'
            : 'La sessione origine è ancora in corso: aspetta che concluda prima di forkarla',
          code: 'SESSION_NOT_READY',
        };
      }
      return avviaESegui({
        taskId: originale.taskId,
        /*
         * ⛔⛔⛔ 08/09/2026 — TERZA cosa che `forka` dimenticava di ripassare, per lo STESSO
         * motivo delle due già raccontate qui sotto (i permessi, e `permessiPerAttrezzo`): un fork
         * crea una VOCE NUOVA, quindi tutto ciò che la voce DERIVA va ripassato per nome.
         * Passando `originale.cartella` (già effettiva) senza la bandiera, `avviaESegui`
         * ricostruiva la voce e ripassava da `cartellaEffettivaPerPermessi` con
         * `cartellaGiaScelta` a `false`: una sessione avviata su una cartella SCELTA A MANO — che
         * passa obbligatoriamente da «Full access», vedi il cancello in `avviaLibero` — vedeva il
         * suo fork allargato alla RADICE DEL DISCO. Misurato: `actual: 'C:'`, lo stesso danno
         * curato la mattina stessa per la delega (`subagent-orchestrator.mjs`, `da8df6f1`).
         *
         * ⇒ Si ripassano ENTRAMBI i pezzi da cui la cartella si deriva — quella di PARTENZA e la
         *   bandiera — non il risultato: così il fork riproduce l'originale anche PIÙ TARDI, se il
         *   permesso viene alzato a metà conversazione (`aggiornaImpostazioni` rifa lo stesso
         *   calcolo su `cartellaBase` + `cartellaGiaScelta`).
         *
         * Ricerca 08/09/2026: lo stato dell'arte tratta la cartella di un fork come una cosa che
         * non deve andare alla deriva — Claude Code issue #60272 («decouple new sessions from the
         * working directory of prior sessions»), e le note di GitKraken Desktop sui fork, che
         * «keep their own captured path or fall back cleanly to the project root rather than
         * drifting». Qui la deriva non era nemmeno verso la radice del progetto: verso quella del
         * disco.
         */
        cartella: originale.cartellaBase ?? originale.cartella,
        cartellaGiaScelta: originale.cartellaGiaScelta === true,
        task: originale.task,
        comandoProva: originale.comandoProva, messaggiIniziali: originale.messaggiFinali,
        forkDa: sessionIdOrigine, mobile: originale.mobile,
        /*
         * ⛔⛔⛔ 28/8 — trovato da un test, non da lettura: un fork crea
         * una VOCE NUOVA (mai `voceEsistente`, a differenza di resume),
         * quindi senza questa riga `permessiEffettivi` in `avviaESegui`
         * ricadeva sul default "Workspace write" — un fork di una
         * sessione "Read only" avrebbe silenziosamente riacquistato la
         * scrittura. Stesso principio già in uso per `mobile` sulla riga
         * sopra, solo dimenticato qui la prima volta.
         *
         * ⭐⭐⭐ FASE B (28/8) — stesso principio, applicato PROATTIVAMENTE
         * questa volta (non trovato da un bug: imparato dal precedente
         * riga sopra): un fork crea una voce nuova, quindi anche
         * `permessiPerAttrezzo` va passato esplicitamente qui, mai dato
         * per scontato che `voceEsistente` lo erediti da solo.
         */
        permessiRichiesti: originale.permessi,
        permessiPerAttrezzoRichiesti: originale.permessiPerAttrezzo,
      });
    },

    /**
     * ⭐ Un resume: STESSO sessionId, STESSA voce, un giro IN PIÙ appeso allo
     * STESSO buffer di eventi — non una sessione indipendente come `forka`.
     * Chi era iscritto PRIMA della conclusione ha già visto lo stream
     * chiudersi (http-app.mjs chiude la SSE su RunFinished/RunError): un
     * client che vuole vedere il giro ripreso deve ri-iscriversi allo stesso
     * `GET .../events` DOPO aver chiamato questo, non prima — la storia
     * intera (giro vecchio + nuovo) gli arriva comunque, mai un buco.
     *
     * ⛔ Stesso scope dichiarato di `forka`: solo su una sessione già
     * CONCLUSA, per lo stesso motivo (i `messaggi` di un giro ancora in
     * corso non sono raggiungibili da fuori la sua chiusura).
     *
     * ⛔⛔⛔ 27/8, owner: "non riesco ad avere una conversazione base col
     * modello" — senza `nuovoMessaggioUtente`, un resume rilanciava
     * `talosLavora` sugli STESSI `messaggiFinali` che avevano già prodotto
     * "concluso": il modello si ritrovava la propria ultima risposta come
     * ultimo messaggio, senza una domanda nuova a cui rispondere — non è
     * MAI stato un vero "continua la conversazione", solo bookkeeping per
     * riprendere un giro interrotto. `nuovoMessaggioUtente`, se presente,
     * si appende a `messaggiFinali` PRIMA di ripartire: è quello che rende
     * un resume anche il meccanismo di un secondo turno di chat reale (vedi
     * submitPrompt in app.js) — stesso `avviaESegui`, zero duplicazione.
     *
     * @param {string} [nuovoMessaggioUtente]
     * @returns {{sessionId:string}|{erroreAvvio:string, code:string}}
     */
    resume(sessionId, nuovoMessaggioUtente = null, immagini = []) {
      const voce = sessioni.get(sessionId);
      if (!voce) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      if (!voce.conclusa && !voce.interrotta) {
        return {
          erroreAvvio: 'La sessione è ancora in corso: aspetta che concluda prima di riprenderla',
          code: 'SESSION_NOT_READY',
        };
      }
      const haNuovoMessaggio = typeof nuovoMessaggioUtente === 'string' && nuovoMessaggioUtente.trim() !== '';
      if (voce.interrotta && !haNuovoMessaggio) {
        return {
          erroreAvvio: 'Questa sessione è stata interrotta: scrivi un nuovo messaggio per riprenderla in sicurezza.',
          code: 'SESSION_NOT_READY',
        };
      }
      let storiaRiprendibile = Array.isArray(voce.messaggiPendente)
        ? voce.messaggiPendente
        : (Array.isArray(voce.messaggiFinali) ? voce.messaggiFinali : null);
      if (!storiaRiprendibile && (voce.conclusa || voce.interrotta) && typeof nuovoMessaggioUtente === 'string' && nuovoMessaggioUtente.trim() !== '') {
        storiaRiprendibile = messaggiRipristinabiliDaEventi(voce);
      }
      if (!storiaRiprendibile || storiaRiprendibile.length === 0) {
        /*
         * ⭐⭐⭐ FASE L (30/8) — `voce.conclusa===false` copriva DUE stati
         * diversi sotto lo stesso messaggio: una sessione VIVA che finirà
         * a breve ("aspetta che concluda") e una ricostruita da
         * `ripristina()` il cui processo non esiste più. Quest'ultima può
         * ripartire solo con un NUOVO messaggio, attraverso il transcript
         * sicuro ricostruito sopra; senza nuovo input non fingiamo di poter
         * riprendere il frame esatto di una tool-call persa.
         */
        if (voce.interrotta) {
          return {
            erroreAvvio: 'Questa sessione è stata interrotta da un riavvio del server e non può essere ripresa: avvia una sessione nuova.',
            code: 'SESSION_NOT_READY',
          };
        }
        return {
          erroreAvvio: voce.conclusa
            ? 'Questa sessione non ha una conversazione da riprendere'
            : 'La sessione è ancora in corso: aspetta che concluda prima di riprenderla',
          code: 'SESSION_NOT_READY',
        };
      }
      let recupero = null;
      try {
        const proiezione = recuperaCronologiaTool(storiaRiprendibile);
        storiaRiprendibile = proiezione.messaggi;
        if (proiezione.correzioni.length) recupero = { schema: 'talos.history-recovery.v1', correzioni: proiezione.correzioni };
      } catch {
        return { erroreAvvio: 'Lo storico contiene una chiamata danneggiata che non può essere associata con certezza al suo risultato. Nessun dato è stato modificato.', code: 'HISTORY_RECOVERY_AMBIGUOUS' };
      }
      const messaggiIniziali = nuovoMessaggioUtente
        ? [...storiaRiprendibile, { role: 'user', content: imageMessageContent(nuovoMessaggioUtente, immagini) }]
        : storiaRiprendibile;
      const prossimaVersioneGiro = (voce.versioneGiro ?? 0) + 1;
      if (recupero) recupero.versioneGiro = prossimaVersioneGiro;
      if (haNuovoMessaggio || recupero) {
        try {
          persistiCheckpointRipresa(voce, messaggiIniziali, prossimaVersioneGiro, recupero);
        } catch {
          return {
            erroreAvvio: 'Non è stato possibile salvare il nuovo messaggio. Riprova senza chiudere la sessione.',
            code: 'SESSION_STORE_WRITE_FAILED',
          };
        }
        voce.messaggiPendente = messaggiIniziali;
      }
      /*
       * ⛔⛔⛔ 27/8, owner: "verifica che i messaggi... persistano dopo il
       * refresh" — riprodotto: il RunStarted di un resume annunciava
       * SEMPRE il `task` ORIGINALE (`voce.task`), mai il nuovo messaggio.
       * Dal vivo non si vedeva — app.js mostra il follow-up in modo
       * ottimista, PRIMA che questo evento arrivi — ma un F5, che
       * ricostruisce la chat SOLO dai RunStarted replayati, mostrava il
       * primo messaggio 3 volte e perdeva i due follow-up per sempre: non
       * esisteva NESSUN evento che li rappresentasse. `talosLavora` non
       * legge `task` quando `messaggiIniziali` è già pieno (lo ignora del
       * tutto) — cambiarlo qui è sicuro, serve SOLO all'annuncio.
       * `seguito:true` distingue "questo è un secondo turno" per app.js.
       */
      const taskAnnunciato = nuovoMessaggioUtente
        ? { consegna: nuovoMessaggioUtente, progetto: voce.task?.progetto, seguito: true, ...(immagini.length ? { immagini } : {}) }
        : voce.task;
      const ripresa = avviaESegui({
        sessionId, taskId: voce.taskId, cartella: voce.cartella, task: taskAnnunciato,
        comandoProva: voce.comandoProva, messaggiIniziali,
        forkDa: voce.forkDa, voceEsistente: voce,
        versioneGiroRichiesta: prossimaVersioneGiro,
      });
      if (recupero && !ripresa.erroreAvvio) broadcast(voce, { type: 'StateDelta', delta: [{ op: 'add', path: '/recuperoCronologia', value: { versioneGiro: prossimaVersioneGiro, chiamate: recupero.correzioni.length } }] });
      return ripresa;
    },

    /**
     * Aggiorna il contratto durevole di una sessione già esistente. La
     * scrittura append-only precede la mutazione in memoria: se il disco
     * fallisce, il processo non espone uno stato che un reload perderebbe.
     */
    async aggiornaImpostazioni(sessionId, patch) {
      const voce = sessioni.get(sessionId);
      if (!voce) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      const chiaviAmmesse = new Set(['modello', 'modelloPlanner', 'reasoning', 'permessi', 'permessiPerAttrezzo', 'fallbackProviders']);
      const chiavi = patch && typeof patch === 'object' && !Array.isArray(patch) ? Object.keys(patch) : [];
      if (chiavi.length === 0 || chiavi.some((chiave) => !chiaviAmmesse.has(chiave))) {
        return { erroreAvvio: 'Nessuna impostazione valida da aggiornare', code: 'QUERY_INVALID' };
      }

      const prossimo = {
        fallbackProviders: validaFallbackProviders(patch.fallbackProviders ?? voce.fallbackProviders ?? [], { usaAttrezzi: true }),
        modello: Object.hasOwn(patch, 'modello') ? patch.modello : voce.modello,
        modelloPlanner: Object.hasOwn(patch, 'modelloPlanner') ? patch.modelloPlanner : voce.modelloPlanner,
        reasoning: Object.hasOwn(patch, 'reasoning') ? patch.reasoning : voce.reasoning,
        permessi: Object.hasOwn(patch, 'permessi') ? patch.permessi : voce.permessi,
        permessiPerAttrezzo: Object.hasOwn(patch, 'permessiPerAttrezzo') ? patch.permessiPerAttrezzo : voce.permessiPerAttrezzo,
      };
      const modelId = voce.provider === 'cloud' && Object.hasOwn(patch, 'modello')
        ? prossimo.modello
        : voce.modelId;
      /*
       * ⭐⭐⭐ 03/9 — Full access A META' CHAT: owner, "anche dopo aver
       * abilitato full access e essere partito con... readonly... il
       * modello deve potere accedere a qualunque file e cartella". Questo è
       * il momento in cui una sessione GIÀ IN CORSO cambia permesso — la
       * cartella EFFETTIVA si ricalcola qui, sulla stessa `cartellaBase`
       * immutabile fissata alla creazione. Calcolata PRIMA della scrittura
       * durevole (sta nel `record`, così un `ripristina()` dopo un riavvio
       * la rideriva da `cartellaBase`+`permessi` invece di perderla), ma
       * ASSEGNATA a `voce.cartella` solo dopo — stessa disciplina "disco
       * prima della memoria" di ogni altro campo qui sotto, non un'eccezione
       * per questo. Da questo punto in poi ogni lettura di `voce.cartella`
       * (il giro successivo via resume(), il pannello Files, le azioni file
       * dell'owner più sotto in questo stesso file) vede la cartella nuova —
       * nessuna di quelle chiama questa funzione, leggono tutte
       * `voce.cartella` fresca al momento dell'uso, verificato sopra il
       * file intero.
       *
       * ⛔ Se il permesso TORNA indietro (Full access → qualunque altro),
       * `cartellaEffettivaPerPermessi` ritorna `voce.cartellaBase` intatta:
       * mai una cartella allargata che resta allargata per sbaglio dopo che
       * l'owner ha abbassato il permesso.
       */
      const cartellaProssima = cartellaEffettivaPerPermessi(voce.cartellaBase, prossimo.permessi, voce.cartellaGiaScelta);
      const record = {
        tipo: 'impostazioni-sessione',
        modello: prossimo.modello,
        modelloPlanner: prossimo.modelloPlanner,
        reasoning: prossimo.reasoning,
        permessi: prossimo.permessi,
        permessiPerAttrezzo: prossimo.permessiPerAttrezzo,
        modelId,
      };
      if (cartellaStore) await registraRigaFn({ cartellaStore, sessionId, record });

      voce.modello = prossimo.modello;
      voce.fallbackProviders = prossimo.fallbackProviders;
      voce.modelloPlanner = prossimo.modelloPlanner;
      voce.reasoning = prossimo.reasoning;
      voce.permessi = prossimo.permessi;
      /*
       * ⛔⛔⛔ 06/9, owner: «se clicco “Per questa sessione” continua a chiedermi permesso».
       * Misurato: il permesso ARRIVAVA (la sessione finiva con `{shell:'sempre'}`) e la carta
       * tornava lo stesso, 47 volte per lo stesso comando. Causa: il kernel riceve la mappa dei
       * permessi per RIFERIMENTO all'avvio del giro, e qui la si SOSTITUIVA con un oggetto nuovo —
       * il giro in corso continuava a leggere quella vecchia, dove l'attrezzo diceva ancora
       * «chiedi». Un cambio a metà giro non arrivava mai a chi doveva riceverlo.
       * ⇒ La mappa si MUTA in luogo: stesso oggetto, contenuto nuovo. Chi la tiene in mano
       * (il kernel, dentro `verificaPermessoScrittura`) vede il cambio al prossimo controllo.
       */
      if (voce.permessiPerAttrezzo && prossimo.permessiPerAttrezzo && voce.permessiPerAttrezzo !== prossimo.permessiPerAttrezzo) {
        for (const chiave of Object.keys(voce.permessiPerAttrezzo)) delete voce.permessiPerAttrezzo[chiave];
        Object.assign(voce.permessiPerAttrezzo, prossimo.permessiPerAttrezzo);
      } else {
        voce.permessiPerAttrezzo = prossimo.permessiPerAttrezzo;
      }
      voce.modelId = modelId;
      voce.cartella = cartellaProssima;
      return { ok: true };
    },

    /**
     * ⭐ "Compatta ora" (piano §1.4) — chiede al modello un riassunto della
     * conversazione FINALE e lo mette al posto di `messaggiFinali`, così un
     * resume/fork SUCCESSIVO riparte dal riassunto invece che dalla storia
     * intera. Muta la voce sul posto, non crea una sessione nuova (diverso
     * da `forka`): stesso sessionId, stessa cronologia SSE già mostrata —
     * solo ciò che verrà passato al PROSSIMO giro cambia.
     *
     * ⛔ Nessun broadcast: `iscriviti()` accetta ascoltatori solo su una
     * sessione NON conclusa, e questa azione richiede l'opposto (stesso
     * guard di `forka`/`resume`) — per costruzione non può esistere nessuno
     * in ascolto quando questo gira, quindi non c'è nessuno a cui annunciare
     * il cambiamento in tempo reale.
     *
     * ⛔ Stesso scope dichiarato di `forka`/`resume`: solo su una sessione
     * già CONCLUSA — compattare un giro ancora in corso richiederebbe gli
     * stessi `messaggi` irraggiungibili da fuori la chiusura di talosLavora.
     *
     * @returns {Promise<{ok:true, compattato:boolean}|{erroreAvvio:string, code:string}>}
     */
    async compatta(sessionId) {
      const voce = sessioni.get(sessionId);
      if (!voce) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      if (typeof contextCompactFn === 'function') {
        const result = await contextCompactFn({ sessionId, messages: voce.messaggiFinali });
        if (result !== undefined) return result;
      }
      if (!voce.messaggiFinali) {
        // ⭐⭐⭐ FASE L (30/8) — stessa distinzione onesta di resume()/forka(): "ancora in corso" e "interrotta da un riavvio" non sono lo stesso stato.
        if (voce.interrotta) {
          return {
            erroreAvvio: 'Questa sessione è stata interrotta da un riavvio del server e non ha una conversazione da compattare: avvia una sessione nuova.',
            code: 'SESSION_NOT_READY',
          };
        }
        return {
          erroreAvvio: voce.conclusa
            ? 'Questa sessione non ha una conversazione da compattare'
            : 'La sessione è ancora in corso: aspetta che concluda prima di compattarla',
          code: 'SESSION_NOT_READY',
        };
      }
      const risultato = await compattaSessioneFn({ messaggiFinali: voce.messaggiFinali, modello, chiave: typeof chiaveFn === 'function' ? chiaveFn() : chiave });
      if (risultato.compattato) voce.messaggiFinali = risultato.messaggi;
      return { ok: true, compattato: risultato.compattato };
    },

    /**
     * ⭐ Il comando diretto (`!comando` nel composer, piano §1.3-BIS.T
     * seconda metà) — esegue UN comando nella cartella della sessione,
     * FUORI dal ciclo di `talosLavora`. Stesso scope dichiarato di
     * `forka`/`resume`/`compatta`: solo su una sessione già CONCLUSA, per
     * non correre contro un `talosLavora` ancora in corso sulla STESSA
     * cartella (nessun nuovo checkout: stessi file, stesso principio del
     * fork).
     *
     * ⛔ `voce.conclusa = false` PRIMA di eseguire — stesso motivo di
     * `avviaESegui`: senza, un client che si riconnette (l'EventSource
     * del browser lo fa DA SOLO ogni volta che il server chiude lo stream
     * su RunFinished, vedi app.js) troverebbe la sessione già "conclusa" e
     * `iscriviti()` gli darebbe solo il replay, mai un ascolto dal vivo —
     * gli eventi di QUESTO comando arriverebbero al buffer ma a nessuno.
     *
     * ⛔ NON await sull'esecuzione intera — stesso motivo di `avviaESegui`:
     * un comando può girare fino a 120 s (stesso tetto di `prova`), e una
     * POST che resta appesa fino ad allora è un client che sembra bloccato.
     * RunStarted è già nel buffer al ritorno (run-to-first-await di JS,
     * documentato sopra `avviaESegui`), il resto arriva via SSE.
     *
     * ⭐ 28/8, terminale reale (LEDGER-TERMINALE-REALE.md): la PTY vera
     * ha bisogno della cartella di una sessione per il suo cwd iniziale,
     * ma senza dare al chiamante l'intera `voce` interna (mai esporre
     * lo stato mutabile del registro fuori da questo modulo). `null` se
     * la sessione non esiste — un fallback a un progetto di default è
     * responsabilità del chiamante (`terminal-ws.mjs`), non di qui.
     */
    cartellaDi(sessionId) {
      return sessioni.get(sessionId)?.cartella ?? null;
    },

    /**
     * ⭐⭐⭐ 28/8 — FASE A (hook). Elenca gli hook dichiarati dal progetto
     * di questa sessione con il loro stato di fiducia VERO — il pannello
     * Control-plane usa questo per decidere se mostrare "Fida" o
     * "Attivo" per riga. `null` se la sessione non esiste; un
     * `.harness-ui-hooks.json` malformato torna `{hooks:null, errore}`
     * (mai un array vuoto che si legge come "nessun hook dichiarato" —
     * due fatti diversi, stesso principio "gli stati sono tre" già in
     * uso altrove in questo prodotto).
     */
    async elencaHooks(sessionId) {
      const voce = sessioni.get(sessionId);
      if (!voce) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      let hooks;
      try {
        ({ hooks } = await caricaHooksFn({ cartella: voce.cartella }));
      } catch (errore) {
        if (errore instanceof HookRegistryError) return { ok: true, hooks: null, errore: errore.message };
        throw errore;
      }
      const conFiducia = await Promise.all(hooks.map(async (hook) => {
        let fidato = false;
        try {
          fidato = await verificaTrustFn({ cartellaTrust: cartellaTrustHook, hookId: hook.id, hash: hook.hash });
        } catch {
          fidato = false;
        }
        return { id: hook.id, eventi: hook.eventi, fidato };
      }));
      return { ok: true, hooks: conFiducia, errore: null };
    },

    /**
     * ⭐⭐⭐ 28/8 — FASE A (hook). L'owner FIDA un hook dalla UI — l'UNICA
     * strada che lo rende eseguibile (`verificaTrust` dentro
     * `costruisciHookFn` torna sempre `false` finché questo non è stato
     * chiamato, fail-closed per costruzione). Rilegge `.harness-ui-hooks.json`
     * AL MOMENTO per calcolare l'hash VERO del comando attuale — fidarsi
     * di un hash passato dal client aprirebbe esattamente la finestra
     * che il trust content-hash-bound esiste per chiudere (un comando
     * modificato dopo la fiducia deve ridiventare non fidato da solo).
     * @returns {{ok:true}|{erroreAvvio:string, code:string}}
     */
    async fidaHook(sessionId, hookId) {
      const voce = sessioni.get(sessionId);
      if (!voce) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      let hooks;
      try {
        ({ hooks } = await caricaHooksFn({ cartella: voce.cartella }));
      } catch (errore) {
        if (errore instanceof HookRegistryError) return { erroreAvvio: errore.message, code: 'HOOK_INVALID' };
        throw errore;
      }
      const hook = hooks.find((h) => h.id === hookId);
      if (!hook) return { erroreAvvio: `Hook "${hookId}" non trovato in .harness-ui-hooks.json`, code: 'NOT_FOUND' };
      await fidaHookFn({ cartellaTrust: cartellaTrustHook, hookId: hook.id, hash: hook.hash });
      return { ok: true };
    },

    /**
     * ⭐⭐⭐ 29/8 — FASE E. Stesso ruolo di elencaHooks per il pannello
     * Capability hub: i server MCP dichiarati dal progetto di questa
     * sessione, col loro stato di fiducia VERO — mai una connessione
     * reale solo per mostrare l'elenco (quella parte in
     * mcp-session.mjs, usata da agent-service.mjs quando la sessione
     * lavora per davvero, non da questo pannello di sola lettura).
     * `null` se la sessione non esiste; un `.harness-ui-mcp.json`
     * malformato torna `{server:null, errore}`, stesso principio "gli
     * stati sono tre" di elencaHooks.
     */
    /**
     * ⭐⭐⭐ O-01 (04/9) — GLI ATTREZZI OFFERTI, per il Capability hub («+»
     * del composer). Fino a qui il foglio elencava SETTE nomi scritti in una
     * stringa di template sotto l'etichetta «sempre offerti al modello»,
     * mentre `strumentiEstesi` (qui sopra, il default di questo file) ne
     * aggiunge altri 36 che il modello riceve DAVVERO a ogni giro:
     * `web_search`, `document_create`, `generate_image`, `delega_sottotask`,
     * Libreria, Notes, Tasks, Memory, Deep Research, Tool Forge. Un
     * inventario incompleto presentato come completo è uno stato inventato.
     *
     * Per ogni attrezzo si dichiarano TRE fatti diversi, mai confusi in uno:
     *  - è offerto al modello (essere in questa lista);
     *  - una sua chiamata passa dal cancello per-attrezzo
     *    (`ATTREZZI_CON_PERMESSO_PER_ATTREZZO`, config.mjs — l'asse del
     *    foglio Permessi) e con quale scelta per QUESTA sessione;
     *  - la sua dipendenza esterna è pronta (`web_search` senza una fonte
     *    configurata è offerto ma non funziona: si dice, non si tace).
     *
     * ⛔ `attrezzi:null` + `errore` quando il kernel non è collegato — mai
     * `attrezzi:[]`, che significherebbe «nessun attrezzo», un fatto diverso.
     */
    async elencaAttrezzi(sessionId) {
      const voce = sessioni.get(sessionId);
      if (!voce) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      return costruisciElencoAttrezzi(voce.permessiPerAttrezzo ?? null);
    },

    /**
     * ⭐⭐⭐ O-01 (04/9) — lo stesso elenco PRIMA che una sessione esista.
     * ⛔ Nato da un rilievo preciso: l'owner apre spesso il foglio senza aver
     * ancora avviato niente, ed è lì che lo vede la prima volta — se ogni
     * sezione dicesse «nessuna sessione attiva» il foglio non direbbe più
     * nulla di vero su cosa TALOS sa fare. Qui i permessi per-attrezzo sono
     * `null` (non esiste ancora una sessione che li possa avere scelti): il
     * pannello lo dichiara come «quello che riceverà la prossima sessione»,
     * mai come lo stato di una sessione che non c'è.
     */
    async elencaAttrezziPredefiniti() {
      return costruisciElencoAttrezzi(null);
    },

    /**
     * ⭐⭐⭐ W1-02 (04/9) — IL PROCESS LEDGER di UNA sessione, più la guardia
     * di stallo su quella stessa storia. Stessa forma di ritorno delle altre
     * `elenca*` qui sopra: `{erroreAvvio, code}` per una sessione che non
     * esiste, `{ok:true, …}` altrimenti.
     *
     * ⛔ `registrato:false` + `processi:null` quando la sessione esiste ma
     * non ha ancora un solo evento: «non registrato» e «nessun processo» sono
     * due fatti diversi e non si dicono con la stessa parola.
     *
     * ⛔⛔⛔ Nessuna azione, mai: `guardia.interviene` è `false` per contratto.
     * Questo metodo LEGGE. Fermare un processo resta `ferma(sessionId)`, cioè
     * una decisione dell'owner — 23/8, la sorveglianza gridava «3 ORFANI» e
     * uno era una sessione di sviluppo dell'owner, viva.
     */
    elencaProcessi(sessionId, { soglie = null } = {}) {
      const voce = sessioni.get(sessionId);
      if (!voce) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      const istanti = voce.istantiEvento ?? null;
      const adesso = clock().getTime();
      const ledger = processiDaEventi(voce.eventi, { istanti, adesso });
      const guardia = guardiaDiStallo(voce.eventi, { istanti, adesso, soglie: { ...soglieStallo, ...(soglie ?? {}) } });
      /*
       * ⛔⛔ 07/9 — la guardia di stallo grida «silenzio» anche su una sessione RIPRESA da un
       * riavvio: lì il silenzio non è uno stallo, è un processo MORTO, e la differenza cambia
       * cosa deve fare chi legge (fermare qualcosa che sta lavorando, o accettare che non
       * lavora più nessuno). Il registro lo sa — `interrotta: !conclusa` al ripristino — e
       * finché non lo diceva qui l'interfaccia non aveva NIENTE con cui dire il vero. Stesso
       * difetto già trovato e curato in `elencaFigli` (subagent-orchestrator, 06/9).
       */
      return { ok: true, registrato: ledger.registrato, processi: ledger.processi, motivo: ledger.motivo, guardia, interrotta: voce.interrotta === true };
    },

    /**
     * ⭐⭐⭐ W1-03 (04/9) — LE TRE METRICHE di UNA sessione, per la Board
     * ridisegnata (decisione G3-G4): tasso di cache, tempo al primo token,
     * motivo di chiusura del giro. Stessa forma di ritorno di
     * `elencaProcessi` qui sopra: `{erroreAvvio, code}` per una sessione che
     * non esiste, `{ok:true, …}` altrimenti.
     *
     * ⛔ `registrato:false` quando la sessione esiste ma non ha ancora un
     * solo evento: «non registrato» non è «misurato e vale zero».
     *
     * ⛔⛔ Sola lettura, zero scritture nuove: gli istanti arrivano dalla
     * mappa IN MEMORIA (`voce.istantiEvento`), tutto il resto dagli eventi
     * già persistiti — un campo in più sul disco duplicherebbe una fonte di
     * verità che c'è già.
     *
     * ⭐ La ricerca del 04/09 (DeepSeek Harness) mostra che le stesse tre
     * colonne, là, esistono solo montando SigNoz e un plugin OpenTelemetry
     * di terze parti, perché il loro nucleo non esporta niente. Qui sono
     * dentro l'app, senza un collettore e senza un byte in più sul disco.
     */
    elencaMetriche(sessionId) {
      const voce = sessioni.get(sessionId);
      if (!voce) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      const metriche = metricheDaEventi(voce.eventi, { istanti: voce.istantiEvento ?? null, adesso: clock().getTime() });
      /*
       * ⛔⛔ 07/9 — su una sessione ripresa da un riavvio il motivo di chiusura manca, e
       * `metricheDaEventi` (che vede gli eventi e non lo stato del registro) spiegava
       * l'assenza con «il giro è ancora in corso». Non è vero: il processo che lo eseguiva
       * non c'è più, e un giro morto non è un giro che sta ancora lavorando. La correzione
       * sta QUI, dove lo stato si conosce, e non dentro la funzione pura, che resta la
       * stessa per tutti gli altri chiamanti.
       */
      const interrotta = voce.interrotta === true;
      const chiusura = interrotta && metriche.chiusura && metriche.chiusura.motivo === null
        ? { ...metriche.chiusura, motivoAssente: MOTIVO_CHIUSURA_INTERROTTA }
        : metriche.chiusura;
      /* ⭐ 13/09 sera: le durate salvate (sessione ripresa) si completano con quelle vive di questo processo. */
      const ragionamentiMs = { ...(voce.durateRagionamentoSalvate ?? {}), ...durateRagionamentoDaEventi(voce.eventi, { istanti: voce.istantiEvento ?? null }) };
      /* ⭐ 13/09 notte: e quelli ancora aperti, da quanto — per chi riapre la chat a metà ragionamento. */
      const ragionamentiInCorsoDaMs = interrotta ? {} : ragionamentiInCorsoDaEventi(voce.eventi, { istanti: voce.istantiEvento ?? null, adesso: clock().getTime() });
      return { ok: true, ...metriche, chiusura, interrotta, cacheSessione: cacheSessioneDaEventi(voce.eventi), ragionamentiMs, ragionamentiInCorsoDaMs };
    },

    async elencaServerMcp(sessionId) {
      const voce = sessioni.get(sessionId);
      if (!voce) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      let server;
      try {
        ({ server } = await caricaServerMcpFn({ cartella: voce.cartella }));
      } catch (errore) {
        if (errore instanceof McpRegistryError) return { ok: true, server: null, errore: errore.message };
        throw errore;
      }
      const conFiducia = await Promise.all(server.map(async (s) => {
        let fidato = false;
        try {
          fidato = await verificaTrustMcpFn({ cartellaTrust: cartellaTrustMcp, serverId: s.id, hash: s.hash });
        } catch {
          fidato = false;
        }
        return { id: s.id, comando: s.comando, argomenti: s.argomenti, allowlist: s.allowlist, fidato };
      }));
      return { ok: true, server: conFiducia, errore: null };
    },

    /**
     * ⭐⭐⭐ 29/8 — FASE E. L'owner FIDA un server MCP dalla UI — stessa
     * disciplina di fidaHook: rilegge `.harness-ui-mcp.json` AL MOMENTO
     * per calcolare l'hash VERO della dichiarazione attuale, mai un
     * hash passato dal client (un comando/allowlist modificati dopo la
     * fiducia devono ridiventare non fidati da soli).
     * @returns {{ok:true}|{erroreAvvio:string, code:string}}
     */
    async fidaServerMcp(sessionId, serverId) {
      const voce = sessioni.get(sessionId);
      if (!voce) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      let server;
      try {
        ({ server } = await caricaServerMcpFn({ cartella: voce.cartella }));
      } catch (errore) {
        if (errore instanceof McpRegistryError) return { erroreAvvio: errore.message, code: 'MCP_INVALID' };
        throw errore;
      }
      const s = server.find((x) => x.id === serverId);
      if (!s) return { erroreAvvio: `Server MCP "${serverId}" non trovato in .harness-ui-mcp.json`, code: 'NOT_FOUND' };
      await fidaServerMcpFn({ cartellaTrust: cartellaTrustMcp, serverId: s.id, hash: s.hash });
      return { ok: true };
    },

    /**
     * ⭐⭐⭐ 29/8 — FASE F. Stesso ruolo di elencaServerMcp per il
     * pannello Capability hub — le skill dichiarate dal progetto di
     * questa sessione. Più semplice: nessun `fidato` da calcolare,
     * le skill non hanno un gate di fiducia (vedi skill-registry.mjs).
     * `null` se la sessione non esiste; una skill malformata torna
     * `{skills:null, errore}`, stesso principio "gli stati sono tre"
     * di elencaHooks/elencaServerMcp.
     */
    async elencaSkill(sessionId) {
      const voce = sessioni.get(sessionId);
      if (!voce) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      let skills;
      try {
        ({ skills } = await caricaSkillRegistroFn({ cartella: voce.cartella }));
      } catch (errore) {
        if (errore instanceof SkillRegistryError) return { ok: true, skills: null, errore: errore.message };
        throw errore;
      }
      return { ok: true, skills: skills.map((s) => ({ id: s.id, name: s.name, description: s.description })), errore: null };
    },

    /**
     * ⭐⭐⭐ 29/8 — FASE N, il pannello Capability hub: stesso ruolo di
     * elencaSkill appena sopra — nessun `fidato` da calcolare, una
     * voce di Libreria non ha un gate di fiducia (vedi
     * library-store.mjs). `null` se la sessione non esiste; una
     * `.harness-ui-library/` malformata (un `meta.json` rotto) torna
     * `{voci:null, errore}`, stesso principio "gli stati sono tre" di
     * elencaSkill/elencaServerMcp — MAI la lista vuota di una Libreria
     * VUOTA scambiata per l'errore di una Libreria ROTTA.
     */
    async elencaLibreria(sessionId) {
      const voce = sessioni.get(sessionId);
      if (!voce) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      let voci;
      try {
        voci = await elencaVociRegistroFn({ cartella: voce.cartella, conProvenienza: true });
      } catch (errore) {
        if (errore instanceof LibraryStoreError) return { ok: true, voci: null, errore: errore.message };
        throw errore;
      }
      return {
        ok: true,
        /*
         * ⭐⭐⭐ BC-38 (12/09/2026), owner: «mettere il percorso dei file nella Libreria… nel
         *   dettaglio anche da chi sono stati creati e da quale sessione».
         * ⛔ ADDITIVO: i cinque campi di ieri escono identici, nello stesso ordine. I quattro nuovi
         *   arrivano da `conProvenienza` (library-store.mjs) e sono per la PERSONA soltanto —
         *   l'attrezzo `library_list` del modello NON passa di qui e non vede un byte diverso.
         * ⛔ `?? null` su tutti e quattro: un magazzino iniettato dai test che torna le voci di
         *   ieri non deve far uscire `undefined` (che sparirebbe dal JSON), ma un «non registrato»
         *   esplicito che chi disegna sa leggere.
         */
        voci: voci.map((v) => ({
          id: v.id, nome: v.nome, fileType: v.fileType, origine: v.origine, aggiornatoIl: v.aggiornatoIl,
          cartella: v.cartella ?? null, percorso: v.percorso ?? null,
          creatoDa: v.creatoDa ?? null, sessione: v.sessione ?? null,
        })),
        errore: null,
      };
    },

    /*
     * ⭐⭐⭐⭐ 10/09/2026, owner: «ogni artefatto va salvato in libreria, con CRUD COMPLETO e azioni
     * Windows». Misurato prima di scrivere, non presunto: gli artefatti in Libreria ci arrivano
     * davvero (byte veri + `meta.json`) e il MODELLO ha già tutto il giro (elenca, leggi, rinomina,
     * elimina, esporta, cerca) — ma la PERSONA aveva UNA rotta sola, l'elenco, e nient'altro:
     * niente scarico, niente rinomina, niente eliminazione, nessuna azione di Windows. Questi
     * quattro metodi sono quella metà mancante, e sono l'unica porta che il pannello ha per
     * arrivarci: la disposizione della cartella resta tutta dentro `library-store.mjs`.
     *
     * ⛔ Stessa forma esatta delle sorelle sull'albero dei file (`scaricaFile`, `rinominaFile`,
     *   `eliminaFile`, `rivelaFile`, più sotto in questo stesso file): `{ok:true, ...}` oppure
     *   `{erroreAvvio, code}`, mai un'eccezione che scappa. E come loro nessun guard su `conclusa`:
     *   sono azioni dell'OWNER sui suoi file, non sul ciclo dell'agente — un artefatto di una
     *   sessione chiusa la settimana scorsa si scarica e si rinomina come quello di adesso.
     * ⛔ `null` dal magazzino NON è un guasto: è «quella voce non c'è», l'esito onesto sia per un
     *   id sconosciuto sia per un id fuori grammatica (vedi `idVoceLibreriaValido`). Diventa un 404
     *   col SUO codice, `LIBRARY_NOT_FOUND`, distinto dal `NOT_FOUND` della sessione inesistente:
     *   sono due 404 che dicono due cose diverse, e chi legge la risposta deve poterle distinguere.
     */
    async scaricaVoceLibreria(sessionId, voceId) {
      const voce = sessioni.get(sessionId);
      if (!voce) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      try {
        const esito = await leggiBytesVoceLibreriaFn({ cartella: voce.cartella, id: voceId });
        if (!esito) return { erroreAvvio: 'Questa voce della Libreria non esiste', code: 'LIBRARY_NOT_FOUND' };
        return { ok: true, ...esito };
      } catch (errore) {
        if (errore instanceof LibraryStoreError) return { erroreAvvio: errore.message, code: errore.code };
        throw errore;
      }
    },

    /*
     * ⛔ Rinominare cambia SOLO l'etichetta dentro `meta.json`: il file sul disco continua a
     *   chiamarsi come si chiamava, e la cartella della voce ha per nome l'id, non il titolo. È la
     *   stessa distinzione che fa `rinominaFile` sull'albero — «un NOME, non un percorso» — solo
     *   portata fino in fondo: qui il nome non tocca affatto il filesystem, quindi una barra o un
     *   `..` non possono diventare una cartella. La sanificazione vive comunque nel magazzino
     *   (`sanificaNomeLibreria`), perché quel nome finisce in un file VERO quando si esporta.
     */
    async rinominaVoceLibreria(sessionId, voceId, nome) {
      const voce = sessioni.get(sessionId);
      if (!voce) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      try {
        const esito = await rinominaVoceLibreriaFn({ cartella: voce.cartella, id: voceId, nome });
        if (!esito) return { erroreAvvio: 'Questa voce della Libreria non esiste', code: 'LIBRARY_NOT_FOUND' };
        return { ok: true, ...esito };
      } catch (errore) {
        if (errore instanceof LibraryStoreError) return { erroreAvvio: errore.message, code: errore.code };
        throw errore;
      }
    },

    /*
     * ⛔⛔ DISTRUTTIVA, e senza cestino: la cartella della voce sparisce dal disco per intero.
     *   Ricerca 10/09/2026 prima di scrivere (saasui.design, «SaaS Destructive Actions &
     *   Confirmation UX Patterns», 2026; Pajamas/GitLab, «Destructive actions»): la frizione si
     *   misura sul RAGGIO del danno, e la conferma è un dialogo VERO davanti alla persona — non
     *   una domanda del server, che non ha nessuno a cui chiederla. Qui quindi si esegue e basta,
     *   esattamente come `eliminaFile` sull'albero; il cancello che chiede «sei sicuro?» sta nel
     *   pannello, ed è l'altra metà di questo lavoro.
     * ⛔ Elimina UNA voce, mai due: la cartella cancellata è `<progetto>/.harness-ui-library/<id>/`,
     *   e le sorelle non sono dentro di lei — il test «cancellarne una NON tocca le altre» esiste
     *   apposta per impedire che un domani questo diventi una cancellazione ricorsiva più in alto.
     */
    async eliminaVoceLibreria(sessionId, voceId) {
      const voce = sessioni.get(sessionId);
      if (!voce) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      try {
        const esito = await eliminaVoceLibreriaFn({ cartella: voce.cartella, id: voceId });
        if (!esito) return { erroreAvvio: 'Questa voce della Libreria non esiste', code: 'LIBRARY_NOT_FOUND' };
        return { ok: true, ...esito };
      } catch (errore) {
        if (errore instanceof LibraryStoreError) return { erroreAvvio: errore.message, code: errore.code };
        throw errore;
      }
    },

    /*
     * ⛔ «Mostrala nella cartella» — la stessa `rivelaInEsploraFile` dell'albero, non una seconda
     *   copia: un solo argomento argv `/select,<percorso>`, nessuna shell di mezzo, e un codice di
     *   uscita diverso da zero che NON è un fallimento (comportamento noto di explorer.exe).
     * ⛔ Si chiede PRIMA al magazzino se la voce esiste: senza, un id inventato uscirebbe come
     *   «file non trovato» del workspace — vero, e muto su che cosa manchi davvero. Il percorso
     *   dentro il progetto lo compone `percorsoContenutoVoce`, mai questo file: la disposizione
     *   della cartella di Libreria ha un solo proprietario.
     */
    /*
     * ⛔ 10/09 — «Apri»: il file si apre col programma che Windows gli associa (Word per un .docx).
     *   Non passa dalla rotta dei byte, che manda `attachment`: quella è uno SCARICO, e agganciarci
     *   «Apri» farebbe scaricare il file una seconda volta invece di aprirlo.
     *   Gemella di `rivelaVoceLibreria` qui sotto, stessa forma di errore: due azioni Windows
     *   diverse — una apre il file, l'altra lo mostra nella cartella.
     */
    async apriVoceLibreria(sessionId, voceId) {
      const voce = sessioni.get(sessionId);
      if (!voce) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      const percorso = percorsoContenutoVoce(voceId);
      try {
        const origine = percorso ? await origineVoceLibreriaFn({ cartella: voce.cartella, id: voceId }) : null;
        if (!origine) return { erroreAvvio: 'Questa voce della Libreria non esiste', code: 'LIBRARY_NOT_FOUND' };
        return { ok: true, ...(await apriFileConProgrammaPredefinitoFn({ cartella: voce.cartella, percorso })) };
      } catch (errore) {
        if (errore instanceof WorkspaceFileError || errore instanceof LibraryStoreError) {
          return { erroreAvvio: errore.message, code: errore.code };
        }
        throw errore;
      }
    },

    async rivelaVoceLibreria(sessionId, voceId) {
      const voce = sessioni.get(sessionId);
      if (!voce) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      const percorso = percorsoContenutoVoce(voceId);
      try {
        const origine = percorso ? await origineVoceLibreriaFn({ cartella: voce.cartella, id: voceId }) : null;
        if (!origine) return { erroreAvvio: 'Questa voce della Libreria non esiste', code: 'LIBRARY_NOT_FOUND' };
        return { ok: true, ...(await rivelaInEsploraFileFn({ cartella: voce.cartella, percorso })) };
      } catch (errore) {
        if (errore instanceof WorkspaceFileError || errore instanceof LibraryStoreError) {
          return { erroreAvvio: errore.message, code: errore.code };
        }
        throw errore;
      }
    },

    /**
     * ⭐⭐⭐ FASE N, quarto sistema (30/8), il pannello Capability hub:
     * stesso ruolo di elencaLibreria appena sopra. ⛔ `cartellaNote`
     * (GLOBALE, il parametro del costruttore), MAI `voce.cartella` — le
     * note dell'owner non appartengono al workspace di questa sessione.
     * Il solo scopo di `sessionId` qui è verificare che la sessione
     * esista, stesso principio di elencaSkill/elencaLibreria.
     */
    async elencaNote(sessionId) {
      const voce = sessioni.get(sessionId);
      if (!voce) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      let note;
      try {
        note = await elencaNoteRegistroFn({ cartella: cartellaNote });
      } catch (errore) {
        if (errore instanceof NoteStoreError) return { ok: true, note: null, errore: errore.message };
        throw errore;
      }
      return {
        ok: true,
        note: note.map((n) => ({ id: n.id, titolo: n.titolo, contenuto: n.contenuto, aggiornataAlle: n.aggiornataAlle })),
        errore: null,
      };
    },

    /**
     * ⭐⭐⭐ FASE N, quinto sistema (30/8), il pannello Capability hub:
     * stesso ruolo di elencaNote appena sopra. ⛔ `cartellaAttivita`
     * (GLOBALE), MAI `voce.cartella`.
     */
    async elencaAttivita(sessionId) {
      const voce = sessioni.get(sessionId);
      if (!voce) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      let attivita;
      try {
        attivita = await elencaAttivitaRegistroFn({ cartella: cartellaAttivita });
      } catch (errore) {
        if (errore instanceof TaskStoreError) return { ok: true, attivita: null, errore: errore.message };
        throw errore;
      }
      return {
        ok: true,
        attivita: attivita.map((a) => ({ id: a.id, titolo: a.titolo, descrizione: a.descrizione, priorita: a.priorita, stato: a.stato, aggiornataAlle: a.aggiornataAlle })),
        errore: null,
      };
    },

    /**
     * ⭐⭐⭐ FASE N, sesto sistema (30/8), il pannello Capability hub:
     * stesso ruolo di elencaAttivita appena sopra. ⛔ `cartellaMemoria`
     * (GLOBALE), MAI `voce.cartella`.
     */
    async elencaMemorie(sessionId) {
      const voce = sessioni.get(sessionId);
      if (!voce) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      let memorie;
      try {
        memorie = await elencaMemorieRegistroFn({ cartella: cartellaMemoria });
      } catch (errore) {
        if (errore instanceof MemoryStoreError) return { ok: true, memorie: null, errore: errore.message };
        throw errore;
      }
      return {
        ok: true,
        memorie: memorie.map((m) => ({ id: m.id, titolo: m.titolo, contenuto: m.contenuto, genere: m.genere, aggiornataAlle: m.aggiornataAlle })),
        errore: null,
      };
    },
    /**
     * ⭐⭐⭐ FASE N, ottavo sistema (30/8) — Deep Research, il pannello
     * Capability hub. A DIFFERENZA di elencaMemorie appena sopra: la
     * cartella è quella DELLA SESSIONE (`voce.cartella`, PER-PROGETTO
     * come Libreria — mai una cartella globale), e lo stato di ogni
     * riga (`stato`) è quello VIVO — riusa researchOrchestrator.elenca,
     * la STESSA funzione che il tool research_list usa, mai una
     * seconda logica di derivazione duplicata qui.
     * @returns {Promise<{ok:true, ricerche:Array|null, errore:string|null}|{erroreAvvio:string, code:string}>}
     */
    async elencaRicerche(sessionId) {
      const voce = sessioni.get(sessionId);
      if (!voce) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      let esito;
      try {
        esito = await researchOrchestrator.elenca({ cartella: voce.cartella, page_size: 50 });
      } catch (errore) {
        if (errore instanceof ResearchStoreError) return { ok: true, ricerche: null, errore: errore.message };
        throw errore;
      }
      /*
       * ⭐ L5 (12/09) — `totale` ESCE. Prima la rotta mandava la sola pagina, e la pagina è
       * tagliata a **20** da `clampNumero(pageSize, 1, 20, 10)` dentro l'orchestratore (è il
       * tetto del contratto verso il modello, e non lo cambio da qui): con 34 ricerche sul
       * disco la sezione ne mostrava 20 e **niente diceva che ne mancavano 14**. È la lezione
       * «il banco non vede CHI MANCA» applicata a una lista: chi costruisce una vista
       * costruisce anche la riga che dice chi non c'è.
       */
      return { ok: true, ricerche: esito.ricerche, totale: esito.totale, errore: null };
    },
    /**
     * ⭐⭐⭐⭐ L5 (12/09/2026) — LA SINGOLA RICERCA, per la sezione.
     *
     * Le cinque funzioni qui sotto (`leggiRicerca`, `pausaRicerca`, `riprendiRicerca`,
     * `riverificaRicerca`, `eliminaRicerca`) sono **passacarte**: guardano che la sessione
     * esista, prendono la sua cartella, e chiamano la STESSA funzione dell'orchestratore che
     * chiama l'attrezzo del modello. ⛔ Nessuna logica nuova qui dentro, e il motivo è misurato
     * in questo repo: due lettori dello stesso file sono due verità, e a schermo si
     * contraddicono (l'elenco che diceva «Conclusa» e il dettaglio «bloccata dal permesso»).
     *
     * ⛔ TRE esiti diversi, e vanno tenuti distinti fino alla rotta:
     *   `erroreAvvio` + `NOT_FOUND`   la SESSIONE non c'è;
     *   `ricerca: null`               la sessione c'è, la RICERCA no (404 suo, `RESEARCH_NOT_FOUND`);
     *   `ok:false` + `motivo`         esistono entrambe, ma lo stato non permette l'azione (409).
     *   Una risposta che non li distingue manda a cercare nel posto sbagliato — è la stessa
     *   scelta, e lo stesso commento, delle rotte di Libreria e di Note/Attività/Memoria.
     * @returns {Promise<{ok:true, ricerca:object|null, errore:string|null}|{erroreAvvio:string, code:string}>}
     */
    async leggiRicerca(sessionId, ricercaId) {
      const voce = sessioni.get(sessionId);
      if (!voce) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      let esito;
      try {
        esito = await researchOrchestrator.leggi({ cartella: voce.cartella, id: ricercaId });
      } catch (errore) {
        if (errore instanceof ResearchStoreError) return { ok: true, ricerca: null, errore: errore.message };
        throw errore;
      }
      if (!esito.trovata) return { ok: true, ricerca: null, errore: null };
      const { trovata, ...ricerca } = esito;
      return { ok: true, ricerca, errore: null };
    },
    /**
     * ⭐⭐⭐ L5 — PAUSA. ⛔ Il 404 lo decide il DISCO, non la mappa delle sessioni vive:
     * `mettiInPausa` risponde «there is no research with that id» anche a una ricerca che esiste
     * benissimo su disco ma non sta girando (dopo un riavvio nessuna lo fa). Quella frase è
     * giusta per il modello — che sta cercando qualcosa da fermare — e sarebbe **falsa** per la
     * persona, che ha quella riga sotto gli occhi. ⇒ si guarda prima il disco: assente ⇒ 404,
     * presente ⇒ l'esito dell'orchestratore, e un «no» diventa un conflitto di stato (409).
     * @returns {Promise<{ok:boolean, ricerca?:object|null, motivo?:string}|{erroreAvvio:string, code:string}>}
     */
    async pausaRicerca(sessionId, ricercaId) {
      return azioneSuRicerca(sessionId, ricercaId, (cartella, id) => researchOrchestrator.mettiInPausa({ cartella, id }));
    },
    /** ⭐⭐⭐ L5 §6.6 — RIPRESA. Riparte dal giornale anche dopo un riavvio del server: è `riprendi()` di L4, non una seconda via. */
    async riprendiRicerca(sessionId, ricercaId) {
      return azioneSuRicerca(sessionId, ricercaId, (cartella, id) => researchOrchestrator.riprendi({ cartella, id }));
    },
    /**
     * ⭐⭐⭐⭐ L5 §6.8 «+1.1» — «Controlla se le fonti dicono ancora questo».
     * ⛔ A differenza delle altre quattro, questa **esce in rete**: apre le pagine citate, una
     *   alla volta, con il lettore validato del kernel. Per questo il suo «non si può» non è un
     *   errore ma un esito dichiarato, con il motivo (vedi `riverifica` nell'orchestratore).
     */
    async riverificaRicerca(sessionId, ricercaId) {
      const voce = sessioni.get(sessionId);
      if (!voce) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      let esito;
      try {
        esito = await researchOrchestrator.riverifica({ cartella: voce.cartella, id: ricercaId });
      } catch (errore) {
        if (errore instanceof ResearchStoreError) return { ok: false, ricerca: null, motivo: errore.message };
        throw errore;
      }
      if (!esito.trovata) return { ok: true, ricerca: null, motivo: null };
      if (!esito.ok) return { ok: false, ricerca: undefined, motivo: esito.motivo };
      return { ok: true, ricerca: undefined, riverifica: esito.riverifica, motivo: null };
    },
    /**
     * ⭐⭐⭐ L5 — ELIMINAZIONE. Toglie la cartella intera della ricerca **e** la sua voce di
     * Libreria: è `elimina()` di L4, la stessa che chiama il modello. ⛔ Il record pagato non si
     * riscrive mai — qui non si riscrive niente, si cancella, e la conferma (con la conseguenza
     * scritta: «si cancella anche il rapporto in Libreria») è del frontend, prima di bussare.
     */
    async eliminaRicerca(sessionId, ricercaId) {
      const voce = sessioni.get(sessionId);
      if (!voce) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      let presente;
      try {
        presente = await leggiRicercaFn({ cartella: voce.cartella, id: ricercaId });
      } catch (errore) {
        if (errore instanceof ResearchStoreError) return { ok: false, ricerca: null, motivo: errore.message };
        throw errore;
      }
      /*
       * ⛔ `elimina()` dell'orchestratore è IDEMPOTENTE per contratto col modello («There was no
       *   research with that id — nothing to delete»), e quella proprietà non si tocca. Ma la
       *   PERSONA sta guardando un elenco che dice che quella ricerca c'è: rispondere «fatto» a
       *   un id sparito le confermerebbe uno schermo vecchio. Due contratti per due chiamanti,
       *   nessuno dei due piegato — identico alla DELETE di Note/Attività/Memoria.
       */
      if (!presente) return { ok: true, ricerca: null, motivo: null };
      await researchOrchestrator.elimina({ cartella: voce.cartella, id: ricercaId });
      return { ok: true, eliminata: { id: ricercaId, titolo: presente.titolo || presente.domanda || null }, motivo: null };
    },
    /**
     * ⭐⭐⭐⭐ FASE N, nono e ultimo sistema (30/8) — Tool Forge, il
     * pannello Capability hub. GLOBALE come elencaMemorie (cartellaForge,
     * mai voce.cartella).
     * @returns {Promise<{ok:true, strumenti:Array|null, errore:string|null}|{erroreAvvio:string, code:string}>}
     */
    async elencaToolForgiati(sessionId) {
      const voce = sessioni.get(sessionId);
      if (!voce) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      let installati;
      try {
        installati = await elencaToolForgiatiFn({ cartella: cartellaForge });
      } catch (errore) {
        if (errore instanceof ToolForgeStoreError) return { ok: true, strumenti: null, errore: errore.message };
        throw errore;
      }
      return {
        ok: true,
        strumenti: installati.map((t) => ({ id: t.id, titolo: t.manifest.title, descrizione: t.manifest.description, capacita: t.capacita, rischio: t.rischio, abilitato: t.abilitato, installatoAlle: t.installatoAlle })),
        errore: null,
      };
    },
    /**
     * ⭐⭐⭐⭐⭐ L'UNICA mutazione owner-facing di tutta FASE N — vedi la
     * doc in tool-forge-store.mjs sul perché: abilitare/disabilitare un
     * tool forgiato non è MAI un tool del modello, nemmeno sul mobile
     * (station-only su entrambe le piattaforme). Stesso stile di
     * fidaServerMcp/fidaPlugin (una mutazione diretta dal pannello, non
     * dal kernel/gate di permesso — quei due gate esistono per azioni
     * del MODELLO, questa è dell'OWNER).
     * @returns {Promise<{ok:true}|{erroreAvvio:string, code:string}>}
     */
    async abilitaToolForgiato(sessionId, id, abilitato) {
      const voce = sessioni.get(sessionId);
      if (!voce) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      let esito;
      try {
        esito = await abilitaToolForgiatoFn({ cartella: cartellaForge, id, abilitato });
      } catch (errore) {
        if (errore instanceof ToolForgeStoreError) return { erroreAvvio: errore.message, code: 'FORGE_INVALID' };
        throw errore;
      }
      if (!esito) return { erroreAvvio: `Tool forgiato "${id}" non trovato in .tool-forge-store/`, code: 'NOT_FOUND' };
      return { ok: true };
    },

    /**
     * ⭐⭐⭐ 29/8 — FASE G, il pannello Capability hub: stesso ruolo di
     * elencaServerMcp, stesso schema {id,fidato,...} — a differenza
     * delle skill (nessun gate) ma come MCP, un plugin ESEGUE
     * (tool locali, hook), quindi porta un `fidato` da mostrare prima
     * del bottone "Fida". `null` se la sessione non esiste; un
     * `.harness-ui-plugins/` malformato torna `{plugin:null, errore}`,
     * stesso principio "gli stati sono tre" di elencaServerMcp/elencaHooks.
     */
    async elencaPlugin(sessionId) {
      const voce = sessioni.get(sessionId);
      if (!voce) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      let plugin;
      try {
        ({ plugin } = await caricaPluginFn({ cartella: voce.cartella }));
      } catch (errore) {
        if (errore instanceof PluginRegistryError) return { ok: true, plugin: null, errore: errore.message };
        throw errore;
      }
      const conFiducia = await Promise.all(plugin.map(async (p) => {
        let fidato = false;
        try {
          fidato = await verificaTrustPluginFn({ cartellaTrust: cartellaTrustPlugin, pluginId: p.id, hash: p.hash });
        } catch {
          fidato = false;
        }
        /*
         * ⭐⭐⭐ 29/8 — FASE G, Ledger tecnico: gli AVVISI dello scanner
         * mostrati PRIMA del click "Fida" — mai un blocco, solo
         * informazione (vedi la doc in plugin-registry.mjs sul perché
         * un pattern scanner non è un confine di sicurezza vero).
         * Scansiona OGNI comando dichiarato (tool +
         * hook), con l'origine per farsi capire da chi legge — un
         * plugin già fidato non ha bisogno di riproporli ad ogni giro,
         * ma li calcoliamo comunque qui (economico, puro) invece di un
         * secondo ramo condizionale.
         */
        const avvisi = [
          ...p.tools.flatMap((t) => scansionaPatternSospetti(t.comando).map((avviso) => ({ origine: `tool:${t.nome}`, avviso }))),
          ...p.hooks.flatMap((h) => scansionaPatternSospetti(h.comando).map((avviso) => ({ origine: `hook:${h.id}`, avviso }))),
        ];
        return { id: p.id, nome: p.nome, descrizione: p.descrizione, hooks: p.hooks, tools: p.tools, fidato, avvisi };
      }));
      return { ok: true, plugin: conFiducia, errore: null };
    },

    /**
     * ⭐⭐⭐ 29/8 — FASE G. L'owner FIDA un plugin dalla UI — stessa
     * disciplina di fidaServerMcp: rilegge `.harness-ui-plugins/` AL
     * MOMENTO per calcolare l'hash VERO del manifesto attuale, mai un
     * hash passato dal client (un manifesto modificato dopo la fiducia
     * deve ridiventare non fidato da solo — hash sull'INTERO manifesto,
     * non per componente, vedi plugin-registry.mjs).
     * @returns {{ok:true}|{erroreAvvio:string, code:string}}
     */
    async fidaPlugin(sessionId, pluginId) {
      const voce = sessioni.get(sessionId);
      if (!voce) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      let plugin;
      try {
        ({ plugin } = await caricaPluginFn({ cartella: voce.cartella }));
      } catch (errore) {
        if (errore instanceof PluginRegistryError) return { erroreAvvio: errore.message, code: 'PLUGIN_INVALID' };
        throw errore;
      }
      const p = plugin.find((x) => x.id === pluginId);
      if (!p) return { erroreAvvio: `Plugin "${pluginId}" non trovato in .harness-ui-plugins/`, code: 'NOT_FOUND' };
      await fidaPluginFn({ cartellaTrust: cartellaTrustPlugin, pluginId: p.id, hash: p.hash });
      return { ok: true };
    },

    /**
     * @returns {{ok:true}|{erroreAvvio:string, code:string}}
     */
    /**
     * ⭐⭐⭐ D-10D — UN COMANDO DELLA PERSONA MENTRE IL MODELLO LAVORA.
     *
     * ⛔ Prima qui c'erano due righe che facevano il danno: un rifiuto se la sessione non era
     *   conclusa, e `voce.conclusa = false` per la durata del comando. Cioè il comando si
     *   TRAVESTIVA da giro del modello — e da lì **sette lettori del registro credevano a una
     *   bugia**: il watcher del workspace si spegneva a metà scrittura, `resume`/`fork`/`compatta`
     *   diventavano leciti su una sessione viva, `reindirizza` rifiutava, la barra la dava per
     *   finita. E chi scriveva `!` mentre il modello lavorava si sentiva dire di aspettare.
     *
     * ⇒ Due operazioni distinte sulla stessa sessione, ognuna col suo vocabolario
     *   (`ComandoUtenteIniziato`/`ComandoUtenteFinito`, vedi agui-events.mjs) e il suo stato.
     *   `conclusa` torna a voler dire una cosa sola: il GIRO DEL MODELLO è finito.
     *
     * Ricerca 10/09/2026, due fonti che dicono la stessa cosa:
     * · AWS Bedrock AgentCore («Execute shell commands in AgentCore Runtime sessions»):
     *   `InvokeAgentRuntime` e `InvokeAgentRuntimeCommand` sono operazioni distinte sulla stessa
     *   sessione, e «command execution doesn't block agent invocations, and you can invoke the
     *   agent and run commands concurrently on the same session»;
     * · Hermes v0.21 (`acp_adapter/session.py:179`), il concorrente che l'owner ha messo per primo:
     *   lo stato «sta girando» è un campo SUO (`is_running`, accanto a `cancel_event`), non dedotto
     *   da un altro; e i canali sono separati per attore (`agent_message_chunk` contro
     *   `user_message_chunk`). È esattamente ciò che qui mancava.
     *
     * ⛔ Resta un rifiuto, e uno solo: una sessione interrotta da un riavvio. Lì non c'è una
     *   cronologia viva a cui appendere niente, ed è un fatto diverso da «sta lavorando».
     */
    /**
     * ⭐ D-10F — dove girano i comandi di QUESTA sessione.
     * @param {'wsl2'|'windows'|null} dove `null` = ripiego automatico, il comportamento di sempre
     */
    doveGiranoIComandi(sessionId, dove) {
      const voce = sessioni.get(sessionId);
      if (!voce) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      if (dove !== null && dove !== 'wsl2' && dove !== 'windows') {
        return { erroreAvvio: 'Scelta non valida: attesi "wsl2", "windows" o null.', code: 'DOVE_NON_VALIDO' };
      }
      voce.doveGiranoIComandi = dove;
      /* ⛔ La cartella di lavoro NON sopravvive al cambio: `/mnt/c/…` e `C:…` sono due modi di
         dire la stessa cosa che le due shell non si scambiano. Si riparte dalla cartella della
         sessione, che e' vera in tutt'e due. */
      voce.cartellaComandi = null;
      return { ok: true, dove };
    },

    /**
     * ⭐ D-10S — i comandi `!` di QUESTA sessione entrano nella conversazione del modello?
     *
     * Owner 11/09: «facciamo entrambi con switch scelto da utente, default off». Spento = il
     * comportamento di sempre e quello di Hermes (niente in cronologia, cache del prompt intatta);
     * acceso = quello di Claude Code (il modello legge comando e uscita al giro successivo).
     *
     * @param {boolean} acceso
     */
    comandiNellaConversazione(sessionId, acceso) {
      const voce = sessioni.get(sessionId);
      if (!voce) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      if (typeof acceso !== 'boolean') {
        return { erroreAvvio: 'Scelta non valida: atteso true o false.', code: 'SCELTA_NON_VALIDA' };
      }
      voce.comandiNellaConversazione = acceso;
      /* ⛔ Spegnendolo si butta anche ciò che era già in attesa: chi spegne non vuole che il giro
         successivo si porti dietro l'ultimo comando raccontato mentre era ancora acceso. */
      if (!acceso) voce.comandiDaRaccontare = [];
      return { ok: true, acceso };
    },

    /**
     * ⭐⭐⭐ D-10T (11/09) — LE DUE SCELTE SUI COMANDI, LETTE DAL SERVER.
     *
     * Prima non esisteva nessuna lettura: `doveGiranoIComandi` e `comandiNellaConversazione`
     * vivevano nella voce e il frontend le scriveva solo al click. Dopo un refresh i due menu
     * tornavano al default **mentre il server teneva ancora la scelta vera** — cioè l'interfaccia
     * diceva «Solo tu» mentre il modello stava leggendo i comandi. È il difetto peggiore di tutti:
     * non una funzione che manca, una che MENTE, e proprio nella finestra della sicurezza.
     *
     * Ricerca 11/09/2026: è lo stesso difetto che openclaw ha chiuso da poco («Quick Settings
     * reads stale exec security config instead of the active source of truth», issue #79247) — il
     * server resta l'autorità e il pannello rilegge quando si apre, invece di fidarsi di ciò che
     * ha in mano.
     */
    impostazioniComandi(sessionId) {
      const voce = sessioni.get(sessionId);
      if (!voce) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      return {
        ok: true,
        dove: voce.doveGiranoIComandi ?? null,
        comandiNellaConversazione: voce.comandiNellaConversazione === true,
      };
    },

    shell(sessionId, comando) {
      const voce = sessioni.get(sessionId);
      if (!voce) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      if (!voce.conclusa && voce.interrotta) {
        // ⭐⭐⭐ FASE L (30/8) — "ancora in corso" e "interrotta da un riavvio" non sono lo stesso stato.
        return { erroreAvvio: 'Questa sessione è stata interrotta da un riavvio del server: un comando diretto qui richiederebbe scrivere sopra una cronologia che non concluderà mai. Avvia una sessione nuova.', code: 'SESSION_NOT_READY' };
      }
      /* ⛔ Il conteggio dei comandi vivi è SUO: non tocca `conclusa`, che parla del giro del modello. */
      voce.comandiUtenteInCorso = (voce.comandiUtenteInCorso ?? 0) + 1;
      /*
       * ⛔⛔⛔ 10/09 — LA CARTELLA DI LAVORO E' DELLA SESSIONE, non del singolo comando.
       *   Owner, con la sua schermata: `ls` mostrava il Desktop, `cd Games` non faceva niente, e un
       *   `ls` dopo mostrava ancora il Desktop. Ogni comando ripartiva dalla cartella della
       *   sessione, perche' `cd` e' interno alla shell e muore con lei.
       * ⇒ Qui la cartella si TIENE: il kernel dice dove il comando si e' fermato, e il prossimo
       *   riparte da li'. E' la stessa cosa che fa un terminale, ottenuta senza tenerne uno aperto.
       * ⛔ Si torna alla cartella della sessione se il comando non ha saputo dirlo (niente
       *   marcatore, un ramo che non lo supporta): meglio ripartire da un posto noto che da uno
       *   inventato.
       */
      eseguiComandoDirettoFn({
        cartella: voce.cartellaComandi || voce.cartella, comando, mobile: voce.mobile, onEvento: (evento) => broadcast(voce, evento),
        /* ⛔ D-10F — la scelta della sessione, se c'e'. Assente = ripiego automatico, come prima. */
        dove: voce.doveGiranoIComandi ?? null,
      })
        .then((esito) => {
          if (esito?.cartellaFinale) voce.cartellaComandi = esito.cartellaFinale;
          /*
           * ⭐⭐⭐ D-10S — l'interruttore, e perché il suo default è SPENTO (owner 11/09: «facciamo
           *   entrambi con switch scelto da utente, default off»).
           *
           * I due comportamenti esistono entrambi nel settore e sono opposti per una ragione vera:
           *  · Claude Code mette comando e uscita nella conversazione — il modello li legge;
           *  · Hermes Agent NON li mette, apposta: «the prompt cache is untouched».
           * Spento di default perché è il comportamento di oggi (nessuna sorpresa per chi aggiorna),
           * perché non spende token a insaputa di nessuno, e perché un `!env` acceso finirebbe nel
           * contesto coi segreti dentro — il rovescio che la documentazione di Claude Code segnala.
           *
           * ⛔ Lo switch vale al MOMENTO DEL COMANDO, non al momento del giro: accenderlo dopo non
           *   fa comparire a ritroso comandi lanciati mentre era spento. Chi lo accende sa da quando.
           */
          if (voce.comandiNellaConversazione === true) {
            (voce.comandiDaRaccontare ??= []).push(raccontoDelComando({
              comando, codice: esito?.codice, testo: esito?.testo,
            }));
          }
        }).catch((errore) => {
        /* ⛔ Un comando fallito non è un giro fallito: dirlo con `RunError` spegnerebbe la sessione
           del modello, che magari sta ancora lavorando. Lo dice il suo evento. */
        broadcast(voce, { type: 'ComandoUtenteFinito', comandoId: null, errore: errore instanceof Error ? errore.message : String(errore) });
      }).finally(() => {
        voce.comandiUtenteInCorso = Math.max(0, (voce.comandiUtenteInCorso ?? 1) - 1);
      });
      return { ok: true };
    },

    /**
     * ⭐⭐⭐ 28/8 — LA PILLOLA PERMESSI, livello "On request": risolve la
     * Promise che `richiediApprovazione` sopra ha appeso, sbloccando il
     * kernel che sta aspettando dentro `verificaPermessoScrittura`.
     *
     * ⛔ `requestId` deve combaciare — mai risolvere alla cieca l'ULTIMA
     * richiesta pendente: un client con un `requestId` vecchio/duplicato
     * (un doppio click, una risposta arrivata in ritardo dopo che il
     * giro è già avanzato a una richiesta successiva) non deve MAI
     * risolvere quella nuova al posto suo — sarebbe un consenso dato
     * alla domanda sbagliata.
     *
     * @returns {{ok:true}|{erroreAvvio:string, code:string}}
     */
    rispondiApprovazione(sessionId, requestId, approvato) {
      const voce = sessioni.get(sessionId);
      if (!voce) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      const pendente = voce.approvazionePendente;
      /*
       * ⛔⛔⛔ 07/9, O-49 — qui usciva `QUERY_INVALID`, e la app scriveva a schermo
       * «Risposta non riuscita · Query non valida» a chi aveva solo premuto Approva su una
       * scheda del permesso. Era una bugia sul colpevole: il corpo della richiesta è
       * perfetto, è lo STATO che è cambiato sotto — `negaApprovazionePendente` l’ha chiusa
       * (stop o reindirizzamento), oppure la scheda è stata ridisegnata dopo un riavvio del
       * server, che di `approvazionePendente` non conserva niente perché vive in memoria.
       * Riprodotto con una curl sul server vivo il 07/09/2026 prima di toccare il codice.
       * ⭐ Ricerca 07/09/2026: MDN «409 Conflict» (conflitto con lo stato attuale della
       * risorsa) e openai/codex #29627 — una richiesta di consenso decaduta va detta
       * decaduta, mai fatta passare per un rifiuto o per un errore di chi chiama.
       */
      if (!pendente || pendente.requestId !== requestId) {
        return { erroreAvvio: 'Questa richiesta di permesso non è più in attesa', code: 'APPROVAL_NOT_PENDING' };
      }
      voce.approvazionePendente = null;
      pendente.resolve(Boolean(approvato));
      broadcast(voce, approvalResolved({ requestId, approvato: Boolean(approvato) }));
      return { ok: true };
    },

    /**
     * Richiede un cambio di direzione prioritario durante un giro attivo.
     * Non tocca la FIFO: ferma al primo confine sicuro, poi `avviaESegui`
     * riparte sullo stesso sessionId con la storia realmente restituita dal
     * kernel e il nuovo input utente.
     */
    reindirizza(sessionId, testo, { redirectId: redirectIdRichiesto = null, immagini = [] } = {}) {
      const voce = sessioni.get(sessionId);
      if (!voce) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      const redirectId = typeof redirectIdRichiesto === 'string' && redirectIdRichiesto.length > 0
        ? redirectIdRichiesto
        : randomUUID();
      if (voce.redirectAnnullati?.has(redirectId) || voce.controller.signal.aborted) {
        return { erroreAvvio: 'Il reindirizzamento è stato annullato dallo stop', code: 'SESSION_NOT_READY' };
      }
      if (voce.conclusa || voce.interrotta) {
        return { erroreAvvio: 'La sessione non è in corso e non può essere reindirizzata', code: 'SESSION_NOT_READY' };
      }
      const pulito = typeof testo === 'string' ? testo.trim() : '';
      if (!pulito) return { erroreAvvio: 'Il reindirizzamento non può essere vuoto', code: 'QUERY_INVALID' };
      if (voce.reindirizzamentoPendente) {
        return { erroreAvvio: 'Un reindirizzamento è già in attesa del prossimo confine sicuro', code: 'SESSION_NOT_READY' };
      }
      voce.reindirizzamentoPendente = { redirectId, testo: pulito, ...(immagini.length ? { immagini } : {}) };
      broadcast(voce, runRedirectRequested({ redirectId, testo: pulito }));
      negaApprovazionePendente(voce);
      voce.controller.abort();
      return { ok: true, redirectId };
    },

    /** Preview read-only del tree prima che esista una sessione: l'id viene risolto solo nell'allowlist server-side. */
    async anteprimaAlbero(projectId, percorso = '') {
      const progetto = cartelleProgetto.find((voce) => voce.id === projectId);
      if (!progetto) return { erroreAvvio: 'Progetto non trovato', code: 'NOT_FOUND' };
      try {
        const voci = await leggiAlberoWorkspaceFn({ cartella: progetto.percorso, percorso });
        return { ok: true, voci };
      } catch (errore) {
        if (errore instanceof WorkspaceTreeError) return { erroreAvvio: errore.message, code: errore.code };
        throw errore;
      }
    },

    /**
     * ⭐ L'albero file REALE (piano §1.3, riga "Contesto workspace") — UN
     * livello di `voce.cartella`, mai la conversazione o gli eventi: la
     * cartella non lascia mai questo file, il chiamante HTTP vede solo il
     * risultato di leggiAlberoWorkspaceFn. A differenza di compatta/forka/
     * resume, NESSUN guard su `conclusa`: leggere il disco funziona anche a
     * sessione ancora in corso — anzi è più utile lì, vedere i file comparire
     * mentre l'agente scrive.
     *
     * @returns {Promise<{ok:true, voci:Array<{nome:string,cartella:boolean}>}|{erroreAvvio:string, code:string}>}
     */
    async albero(sessionId, percorso = '') {
      const voce = sessioni.get(sessionId);
      if (!voce) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      try {
        const voci = await leggiAlberoWorkspaceFn({ cartella: voce.cartella, percorso });
        return { ok: true, voci };
      } catch (errore) {
        if (errore instanceof WorkspaceTreeError) return { erroreAvvio: errore.message, code: errore.code };
        throw errore;
      }
    },

    /*
     * ⭐⭐⭐ 27/8, owner: "non ha nessun'opzione per rinominare i file, per
     * aprire i file, per aprirli nel visualizza file explorer di Windows.
     * Non ha opzioni per eliminarlo" — quattro azioni sul singolo file
     * dell'albero, stesso schema di `albero()` sopra: risolve `sessionId`
     * a `voce.cartella` qui, la validazione del PERCORSO vive tutta in
     * workspace-files.mjs (mai duplicata). Nessun guard su `conclusa`:
     * queste sono azioni dell'OWNER sul workspace, non sul ciclo
     * dell'agente — hanno senso anche a sessione ancora in corso o già
     * chiusa da tempo.
     */
    async apriFile(sessionId, percorso) {
      const voce = sessioni.get(sessionId);
      if (!voce) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      try {
        return { ok: true, ...(await leggiContenutoFileFn({ cartella: voce.cartella, percorso })) };
      } catch (errore) {
        if (errore instanceof WorkspaceFileError) return { erroreAvvio: errore.message, code: errore.code };
        throw errore;
      }
    },

    /*
     * ⛔ PO-05 — il file per essere SCARICATO: byte, non testo. Sorella di `apriFile`, con la stessa
     *   forma di errore; la difesa sul percorso vive dove vive per le altre (`workspace-files.mjs`),
     *   e qui non si aggiunge nessun controllo nuovo che un domani possa divergere dal suo.
     */
    async scaricaFile(sessionId, percorso) {
      const voce = sessioni.get(sessionId);
      if (!voce) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      try {
        return { ok: true, ...(await leggiFilePerScaricoFn({ cartella: voce.cartella, percorso })) };
      } catch (errore) {
        if (errore instanceof WorkspaceFileError) return { erroreAvvio: errore.message, code: errore.code };
        throw errore;
      }
    },

    async rinominaFile(sessionId, percorso, nuovoNome) {
      const voce = sessioni.get(sessionId);
      if (!voce) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      try {
        return { ok: true, ...(await rinominaFileFn({ cartella: voce.cartella, percorso, nuovoNome })) };
      } catch (errore) {
        if (errore instanceof WorkspaceFileError) return { erroreAvvio: errore.message, code: errore.code };
        throw errore;
      }
    },

    async eliminaFile(sessionId, percorso) {
      const voce = sessioni.get(sessionId);
      if (!voce) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      try {
        return { ok: true, ...(await eliminaFileFn({ cartella: voce.cartella, percorso })) };
      } catch (errore) {
        if (errore instanceof WorkspaceFileError) return { erroreAvvio: errore.message, code: errore.code };
        throw errore;
      }
    },

    async rivelaFile(sessionId, percorso) {
      const voce = sessioni.get(sessionId);
      if (!voce) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      try {
        return { ok: true, ...(await rivelaInEsploraFileFn({ cartella: voce.cartella, percorso })) };
      } catch (errore) {
        if (errore instanceof WorkspaceFileError) return { erroreAvvio: errore.message, code: errore.code };
        throw errore;
      }
    },

    /*
     * ⛔ 11/09/2026 — «Apri in Esplora file», gemella esatta di `rivelaFile` qui sopra: stessa forma
     *   di ritorno, stesso modo di risolvere `sessionId` → `voce.cartella`, e la validazione del
     *   PERCORSO che resta tutta in `workspace-files.mjs` (mai duplicata qui). L'unica differenza è
     *   quale delle due porte di Explorer si apre — e che questa accetta anche `percorso: ''`, cioè
     *   la RADICE della sessione: è l'azione che l'owner ha chiesto sul tasto destro della root.
     */
    async apriInEsploraFile(sessionId, percorso) {
      const voce = sessioni.get(sessionId);
      if (!voce) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      try {
        return { ok: true, ...(await apriInEsploraFileFn({ cartella: voce.cartella, percorso })) };
      } catch (errore) {
        if (errore instanceof WorkspaceFileError) return { erroreAvvio: errore.message, code: errore.code };
        throw errore;
      }
    },

    /*
     * ⭐⭐⭐ 28/8, owner: "nella lista files devo poter draggare i file...
     * non esiste il comando copia... e comandi crud in generale" — stesso
     * schema delle quattro azioni sopra: risolve sessionId a voce.cartella,
     * la validazione vive tutta in workspace-files.mjs.
     */
    async spostaFile(sessionId, percorso, cartellaDestinazione) {
      const voce = sessioni.get(sessionId);
      if (!voce) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      try {
        return { ok: true, ...(await spostaFileFn({ cartella: voce.cartella, percorso, cartellaDestinazione })) };
      } catch (errore) {
        if (errore instanceof WorkspaceFileError) return { erroreAvvio: errore.message, code: errore.code };
        throw errore;
      }
    },

    async copiaFile(sessionId, percorso) {
      const voce = sessioni.get(sessionId);
      if (!voce) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      try {
        return { ok: true, ...(await copiaFileFn({ cartella: voce.cartella, percorso })) };
      } catch (errore) {
        if (errore instanceof WorkspaceFileError) return { erroreAvvio: errore.message, code: errore.code };
        throw errore;
      }
    },

    async creaVoceWorkspace(sessionId, percorsoBase, nome, tipo) {
      const voce = sessioni.get(sessionId);
      if (!voce) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      try {
        return { ok: true, ...(await creaVoceWorkspaceFn({ cartella: voce.cartella, percorsoBase, nome, tipo })) };
      } catch (errore) {
        if (errore instanceof WorkspaceFileError) return { erroreAvvio: errore.message, code: errore.code };
        throw errore;
      }
    },

    esiste(sessionId) {
      return sessioni.has(sessionId);
    },

    /**
     * Rimanda TUTTI gli eventi già accaduti (mai un buco per chi si collega
     * tardi), poi ogni evento NUOVO man mano che arriva.
     *
     * ⛔⛔⛔ 27/8, owner: "ricevo risposte duplicate", poi ricerca web (SSE
     * reconnection best practice, 27/8): la prima cura (`_sequenza` nel
     * payload, dedup lato client) FUNZIONA ma è un doppione fatto in casa
     * di un meccanismo che SSE ha già — `Last-Event-ID`. Senza, ogni
     * riconnessione (frequente su mobile: schermo spento, handoff wifi↔dati)
     * ritrasmetteva l'INTERO buffer via rete, sprecando banda esattamente
     * dove è più preziosa — solo il rendering veniva scartato, non il
     * traffico. `daSequenza`, se presente, salta ogni evento con
     * `_sequenza <= daSequenza`: replay più corto, stessa correttezza.
     * `_sequenza` lato client resta — un client che non manda
     * `Last-Event-ID` (fetch manuale, un test) è comunque protetto.
     *
     * ⛔⛔⛔ 28/8, bug reale trovato dal vivo (non da un test — misurato con
     * un client Node.js grezzo, tenuto aperto, per escludere Chrome/
     * EventSource): questa funzione NON registrava mai `ascoltatore` in
     * `voce.ascoltatori` per una sessione già `conclusa` — corretto quando
     * fu scritto, perché ALLORA `http-app.mjs` chiudeva comunque lo stream
     * subito dopo per lo stesso motivo (vedi la sua doc, "lo stream non si
     * chiude più da solo qui"). Da quando quella chiusura è stata rimossa
     * (WorkspaceChanged può arrivare ben dopo la fine di un giro), questo
     * era rimasto l'UNICO punto che ancora presumeva "sessione conclusa =
     * niente arriverà più": un client connesso a una sessione già finita
     * riceveva il replay e poi MAI PIÙ NIENTE, silenziosamente — la
     * connessione restava aperta (nessun errore, nessuna chiusura) ma
     * `ascoltatori` non la conteneva mai. Ora si iscrive SEMPRE: `conclusa`
     * dice se il GIRO è finito, non se la SESSIONE ha smesso di generare
     * eventi (il watcher del workspace non guarda `conclusa` per niente).
     *
     * @param {number} [daSequenza] — id dell'ultimo evento già ricevuto dal
     *   client (da `Last-Event-ID`); assente = replay completo, come prima.
     */
    iscriviti(sessionId, ascoltatore, daSequenza = 0) {
      const voce = sessioni.get(sessionId);
      if (!voce) return () => {};
      for (const evento of voce.eventi) {
        if (typeof evento._sequenza === 'number' && evento._sequenza <= daSequenza) continue;
        ascoltatore(evento);
      }
      voce.ascoltatori.add(ascoltatore);
      attivaWatcherSessione(voce, voce.cartella);
      let attiva = true;
      return () => {
        if (!attiva) return;
        attiva = false;
        voce.ascoltatori.delete(ascoltatore);
        rilasciaWatcherSessioneSeInattiva(voce);
      };
    },

    ferma(sessionId, { redirectId: redirectIdInVolo = null } = {}) {
      const voce = sessioni.get(sessionId);
      if (!voce) return false;
      ricordaRedirectAnnullato(voce, redirectIdInVolo);
      if (voce.reindirizzamentoPendente) {
        const { redirectId } = voce.reindirizzamentoPendente;
        ricordaRedirectAnnullato(voce, redirectId);
        voce.reindirizzamentoPendente = null;
        broadcast(voce, runRedirectCancelled({ redirectId }));
      }
      negaApprovazionePendente(voce);
      voce.controller.abort();
      /* ⭐ 14/09 — Hermes, `haltRun`: uno stop esplicito non deve scivolare nel prossimo messaggio in coda. La coda resta a
         vista, IN PAUSA, finché la persona non la invia, la toglie o accoda altro. */
      if (voce.codaMessaggi.length > 0 && !voce.codaInPausa) {
        voce.codaInPausa = true;
        annunciaCoda(voce);
      }
      return true;
    },

    /**
     * ⭐ Piano §1.3 — un nome scelto dall'owner, persistito, cosa che il
     * mockup NON faceva: rinominava solo `state.session` nel browser, un
     * valore che qualunque ricostruzione della sidebar (nuova sessione,
     * resume, un giro di aggiornaElencoSessioniReali) sovrascriveva in
     * silenzio con `taskId`. Qui vive sulla VOCE del registro: sopravvive a
     * ogni ricostruzione.
     *
     * ⛔⛔ 02/09 — "finché il server resta acceso" NON bastava più: il
     * client rinomina OGNI sessione col primo messaggio
     * (titoloDalPrimoMessaggio, owner 28/8), quindi dopo un riavvio del
     * server TUTTA la sidebar tornava "libero:full-access" — visto dal
     * vivo il 02/09 riavviando 4174 per TALOS_OWNER_RUNTIME_MODULE. Ora il
     * nome è una riga `nome-sessione` nel registro su disco (stessa
     * disciplina di `impostazioni-sessione`) e ripristina() la rilegge.
     *
     * @returns {Promise<{ok:true}|{erroreAvvio:string, code:string}>}
     */
    async rinomina(sessionId, nome) {
      const voce = sessioni.get(sessionId);
      if (!voce) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      const pulito = typeof nome === 'string' ? nome.trim() : '';
      if (pulito.length === 0 || pulito.length > 80) {
        return { erroreAvvio: 'Nome non valido: serve 1-80 caratteri', code: 'QUERY_INVALID' };
      }
      if (cartellaStore) await registraRigaFn({ cartellaStore, sessionId, record: { tipo: 'nome-sessione', nome: pulito } });
      voce.nome = pulito;
      return { ok: true };
    },

    /**
     * ⭐⭐⭐ 30/8, QA visiva (Task 14) — trovato dal vivo: nessun modo di
     * eliminare una sessione, né qui né lato client, né lato server —
     * 144+ sessioni accumulate in un solo giro di QA senza pulizia
     * possibile. Rifiuta una sessione ANCORA VIVA (né conclusa né
     * interrotta — un controller attivo potrebbe davvero star
     * lavorando): eliminare è un'azione di pulizia su qualcosa di
     * FINITO, mai un modo indiretto di uccidere un run in corso — se
     * l'owner vuole quello, esiste già `ferma()`, esplicito.
     * @returns {{ok:true}|{erroreAvvio:string, code:string}}
     */
    async elimina(sessionId) {
      const voce = sessioni.get(sessionId);
      if (!voce) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      const dalVivo = !voce.conclusa && !voce.interrotta;
      if (dalVivo) {
        return { erroreAvvio: 'Sessione ancora in corso — fermala prima di eliminarla', code: 'SESSION_STILL_RUNNING' };
      }
      fermaWatcherSessione(voce);
      sessioni.delete(sessionId);
      if (cartellaStore) await eliminaSessionePersistitaFn({ cartellaStore, sessionId });
      return { ok: true };
    },

    /**
     * ⭐ Piano §1.3 — la "cronologia" della sidebar: un riepilogo LEGGERO di
     * ogni sessione conosciuta (mai gli eventi interi — quelli restano
     * dietro `esporta()`), più recente prima. Vuoto finché nessuna sessione
     * reale è mai partita: niente da mostrare, non un errore.
     */
    elenca() {
      return [...sessioni.entries()]
        .map(([sessionId, voce]) => ({
          sessionId,
          taskId: voce.taskId,
          nome: voce.nome ?? null,
          avviataAlle: voce.avviataAlle,
          /* ⭐ 11/09 — l'ultima volta che il modello ha parlato in questa sessione: è ciò che
             decide chi sta in cima fra le sessioni vive. `null` finché non ha mai risposto. */
          ultimaRispostaAlle: voce.ultimaRispostaAlle ?? null,
          conclusa: voce.conclusa,
          forkDa: voce.forkDa,
          modello: voce.modello ?? null,
          modelloPlanner: voce.modelloPlanner ?? null,
          reasoning: voce.reasoning ?? null,
          permessi: voce.permessi ?? 'Workspace write',
          permessiPerAttrezzo: voce.permessiPerAttrezzo ?? null,
          provider: voce.provider ?? 'cloud', runtimeId: voce.runtimeId ?? null, modelId: voce.modelId ?? voce.modello ?? null,
          fallbackProvider: voce.fallbackProvider ?? null,
          fallbackProviders: voce.fallbackProviders ?? [], // P-H (12/09): le riserve ancora da usare; i consumi per fornitore stanno negli eventi CUSTOM della sessione, non qui (l'elenco si legge a ogni giro)
          /*
           * ⛔⛔⛔ 08/09/2026 — senza questi due campi la barra a sinistra NON PUÒ sapere che una
           * sessione è una figlia: mostra le deleghe sciolte accanto alla madre, come tre lavori
           * indipendenti (visto dal vivo dall'owner). Non era un difetto di disegno del frontend —
           * lì la parola `padreId` non compariva nemmeno una volta: il dato non usciva di qui.
           * `forkDa` c'era già e non basta: un fork è una sessione PARI, una figlia è subordinata.
           *
           * ⭐ È anche la causa vera di quello che sembrava un difetto della scheda «Agenti»: quella
           *   dipende dalla sessione attiva, e con le figlie in mezzo alle madri è facilissimo
           *   trovarsi su quella sbagliata.
           *
           * Ricerca 08/09/2026 — lo stato dell'arte dice cosa farne, e cosa NON fare:
           * `nesquena/hermes-webui` #1004 (le figlie «should be displayed as a delegation tree
           * rather than collapsed… should remain visible as a tree» ⇒ non si nascondono), OpenClaw
           * Control UI (riga madre espandibile, figlie annidate con stato e durata, e aprirne una
           * «preserva la gerarchia»), Zed #57481 (l'unica domanda aperta è quanto indentare prima di
           * appiattire, «for MAX_SUBAGENT_DEPTH > 2» — da noi non si pone, il limite è 2).
           * ⛔ E il modo di sbagliare, documentato tre volte: OpenClaw #89249 (il selettore diventa
           * inusabile, «1 / 177», tutto il resto sono figlie), opencode #14053 (la Web UI mostra le
           * figlie che la TUI filtra) e la segnalazione su Codex («flood the desktop app sidebar with
           * no way to scope them»). È esattamente dove eravamo.
           *
           * ⇒ Qui esce il DATO, e nient'altro: `null`/`0` per ogni sessione avviata da una persona,
           *   mai un legame inventato. Come presentarlo lo decide la barra.
           */
          padreId: voce.padreId ?? null,
          profonditaDelega: voce.profonditaDelega ?? 0,
          /*
           * ⛔ 08/09, visto nella foto della barra dopo aver annidato le figlie: si chiamavano
           *   entrambe «Delega · e02f5d85-b610-4e3b-…» — l'id della MADRE, identico per tutte, e per
           *   giunta un identificatore grezzo a schermo (vietato dalla regola sui nomi tecnici).
           *   Due righe indistinguibili: per sapere quale è quale bisognava aprirle. È lo stesso
           *   difetto trovato oggi sulle schede del browser, in un altro punto dello schermo.
           * ⇒ La figlia porta il SUO compito. `elencaFigli` lo esponeva già (per il foglio «Albero
           *   sessione»): qui esce anche nell'elenco, che è ciò che la barra legge.
           *   `null` per una sessione che un compito non ce l'ha: mai una stringa inventata.
           */
          /*
           * ⛔ La forma CORTA, e non è un dettaglio: la prima versione passava la consegna intera e
           *   la colonna destra la stampava per venti righe, spingendo le schede
           *   «Contesto/File/Agenti/Processi» fuori dalla vista. Visto nella foto della pagina
           *   intera, non dai numeri — la barra e la testata tagliano da sole con l'ellissi, il
           *   pannello destro no. Un nome si accorcia dove NASCE, o ogni superficie deve ricordarsi
           *   di farlo. 80 caratteri e la prima riga: la stessa regola già usata dal ripristino per
           *   il `nome` di un compito libero.
           */
          /* ⛔ 09/09: anche qui, non solo nell'orchestratore. Una figlia RIPRISTINATA dal disco non ha
             `consegnaCorta` (le sessioni nate prima di questa cura), e senza il taglio tornerebbe a
             chiamarsi col preambolo di sistema del kernel: la storia si legge bene senza riscriverla. */
          taskDelega: voce.padreId ? nomeCortoDaConsegna(voce.task?.consegnaCorta || compitoDaPromptDiDelega(voce.task?.consegna)) : null,
          // ⭐⭐⭐ FASE L (30/8) — true SOLO per una voce ricostruita dopo un riavvio il cui ultimo evento non era RunFinished/RunError: il processo che la eseguiva è sparito, mai un turno "ancora in corso" travestito da tale.
          interrotta: voce.interrotta ?? false,
          // ⭐⭐⭐ 02/09 — la campanella del desktop: una sessione ferma su un'approvazione è la notifica più urgente, e solo l'elenco la può dire a chi guarda un'ALTRA sessione.
          inAttesaApprovazione: Boolean(voce.approvazionePendente),
          // ⭐ 02/09 — la Board diceva "Conclusa" anche a una sessione morta su RunError: l'ultimo evento del ciclo agente decide.
          ultimoEsito: ultimoEsitoDaEventi(voce.eventi),
          // ⛔ 07/9 — il TERZO esito: «fermata» non e ne un errore ne una fine pulita (vedi
          //    `motivoChiusuraDaEventi`). `null` finche il giro e in corso: mai un motivo inventato.
          motivoChiusura: motivoChiusuraDaEventi(voce.eventi),
          // ⭐⭐⭐ 30/8 — piano "Board — da campagne TALOS-BANCO a cruscotto
          // sessioni": il costo/consumo per la nuova Board, MAI un numero
          // inventato. Nessuna scrittura nuova sul disco (vedi usageDaEventi
          // sotto sul perché) — una sessione registrata PRIMA di questo
          // cambiamento (o senza mai un giro con `usage`, es. un errore
          // immediato) torna onestamente `null`, mai uno zero fabbricato.
          usage: usageDaEventi(voce.eventi),
          /*
           * ⛔⛔⛔ 06/9 — CB-04. `usage` qui sopra è il consumo dell'ULTIMO
           * INVIO (il kernel azzera `conto` a ogni esecuzione): resta perché
           * il tetto dei giri («9 su 24») parla di quello e di nient'altro.
           * `usageSessione` è il totale della CONVERSAZIONE — la somma dei
           * totali di ogni invio — ed è il numero che la Board e il piede
           * della chat promettono. Due fatti diversi, due campi diversi:
           * misurato su tre invii veri, 23.060 token contro i 7.716 che si
           * vedevano. Vedi il blocco di testa di `usageSessioneDaEventi`.
           */
          usageSessione: usageSessioneDaEventi(voce.eventi),
          cacheSessione: cacheSessioneDaEventi(voce.eventi),
          giriFermati: giriFermatiDaEventi(voce.eventi), // ⛔ 14/09: chiamate partite e fermate — giri senza consumo dichiarato
        }))
        .sort((a, b) => b.avviataAlle.localeCompare(a.avviataAlle));
    },

    /**
     * ⭐⭐⭐ 30/8 — owner dal vivo: "come mai non ho le cartelle più
     * usate?" — `frequent-dirs.mjs` esisteva già (owner, 28/8: "directory
     * più usate, tipo desktop downloads") ma proponeva SEMPRE le stesse
     * tre cartelle standard di Windows (Desktop/Downloads/Documenti),
     * calcolate da `os.homedir()`, MAI dalla cronologia reale — non è
     * "più usate", è "esistono per ogni installazione Windows". Questo
     * metodo aggrega `voce.cartella` per DAVVERO usata (in memoria: sia
     * le sessioni vive, sia quelle ripristinate da `.sessions-store/` al
     * boot — stessa fonte già in uso per `elenca()`, nessuna lettura
     * nuova dal disco). Solo AGGREGATO (percorso + conteggio + ultima
     * volta): mai la mappa sessione→cartella, stesso principio di
     * privacy già dichiarato sopra `elenca()` (`voce.cartella` non lascia
     * mai questo file legato a un sessionId specifico).
     * ⛔ Se una cartella esiste ancora sul disco (una copia usa-e-getta
     * del corpus benchmark, cancellata dopo) è compito di CHI CHIAMA
     * (`frequent-dirs.mjs`) verificarlo — stesso principio già in uso lì
     * per le cartelle Windows standard: "mai una scorciatoia verso il
     * nulla".
     * @returns {Array<{percorso:string, conteggio:number, ultimaVolta:string}>} — più usata prima, poi più recente; MAI troncato qui (chi chiama decide quante mostrarne).
     */
    cartellePiuUsate() {
      const perCartella = new Map();
      for (const voce of sessioni.values()) {
        const percorso = voce.cartella;
        if (typeof percorso !== 'string' || percorso.trim().length === 0) continue;
        const esistente = perCartella.get(percorso);
        if (esistente) {
          esistente.conteggio += 1;
          if (voce.avviataAlle > esistente.ultimaVolta) esistente.ultimaVolta = voce.avviataAlle;
        } else {
          perCartella.set(percorso, { percorso, conteggio: 1, ultimaVolta: voce.avviataAlle });
        }
      }
      return [...perCartella.values()].sort((a, b) => b.conteggio - a.conteggio || b.ultimaVolta.localeCompare(a.ultimaVolta));
    },

    /**
     * L'intera storia di una sessione, pronta per essere scaricata — `null`
     * se non esiste. ⛔ Non richiede che sia conclusa: esportare una
     * sessione ancora in corso mostra tutto ciò che è successo FIN QUI,
     * onestamente — non finge un finale che non c'è ancora.
     */
    esporta(sessionId) {
      const voce = sessioni.get(sessionId);
      if (!voce) return null;
      return {
        schema: EXPORT_SCHEMA,
        sessionId,
        taskId: voce.taskId,
        nome: voce.nome ?? null,
        avviataAlle: voce.avviataAlle,
        conclusa: voce.conclusa,
        /*
         * ⛔ 07/9 — l'esportazione diceva `conclusa:false` su una sessione ripresa dopo un
         * riavvio, e chi legge il file (o la Board, che lo usa per i costi) non poteva
         * distinguerla da una VIVA. Lo stesso campo che l'elenco dichiara dal 30/8.
         */
        interrotta: voce.interrotta ?? false,
        forkDa: voce.forkDa,
        modello: voce.modello ?? null,
        fallbackProviders: voce.fallbackProviders ?? [],
        cacheSessione: cacheSessioneDaEventi(voce.eventi),
        eventi: voce.eventi,
      };
    },
  });
}
