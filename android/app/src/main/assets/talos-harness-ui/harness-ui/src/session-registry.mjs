/**
 * session-registry.mjs — le sessioni Harness UI vive in memoria: chi le ha
 * avviate, il buffer dei loro eventi AG-UI, e come fermarle. Piano
 * `elegant-spinning-dongarra.md`, FASE 1 (§1.2/§1.4).
 *
 * ⭐⭐⭐ 30/8 — porta canonico (3e03f9d3/1ca98143, FASE L): la persistenza
 * SU DISCO ora esiste — vedi `cartellaStore`/`session-store.mjs`/
 * `ripristina()` più sotto. Questo commento diceva "solo in memoria...
 * non ancora aperto" fin dalla prima riga del file: era la prova stessa,
 * letta alla lettera, che ha aperto la fase sul canonico (owner: "un
 * riavvio perde una sessione in corso, è mai capitato?"). ⛔ Resta vero
 * il limite dichiarato lì: solo lo stato catturato all'avvio di una
 * sessione sopravvive — rename, permessi cambiati a sessione già
 * avviata, e la coda messaggi NON sopravvivono a un riavvio (vedi la
 * doc di `ripristina()`). ⛔ ADATTATO, non verbatim: il watcher del
 * workspace (`guardaWorkspaceFn`/`workspaceChanged`, chokidar) che il
 * canonico ricollega dentro `ripristina()` NON è portato su questa copia
 * — dipendenza npm mai verificata sul runtime Node bundlato Android,
 * stesso confine già dichiarato altrove nel ledger. Una sessione
 * ripristinata qui non ha un watcher attivo: dichiarato, non nascosto.
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
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  avviaSessione as avviaSessioneReale,
  compattaSessione as compattaSessioneReale,
  eseguiComandoDiretto as eseguiComandoDirettoReale,
} from './agent-service.mjs';
import { CustomTaskError, preparaEsecuzioneLibera as preparaEsecuzioneLiberaReale } from './custom-task.mjs';
import { permessiRichiestaValido } from './config.mjs';
import {
  elencaSessioniPersistite as elencaSessioniPersistiteReale,
  leggiRegistro as leggiRegistroReale,
  registraRiga as registraRigaReale,
  registraRigaSync as registraRigaSyncReale,
} from './session-store.mjs';
import { approvalRequested, approvalResolved, dataProvided, dataRequested, hookInvoked, queuedMessageDelivered } from './agui-events.mjs';
import { creaSubagentOrchestrator } from './subagent-orchestrator.mjs';
import {
  caricaHooks as caricaHooksReale,
  eseguiHook as eseguiHookReale,
  fidaHook as fidaHookReale,
  HookRegistryError,
  verificaTrust as verificaTrustReale,
} from './hook-registry.mjs';
import { TaskCatalogError, preparaEsecuzione as preparaEsecuzioneReale } from './task-catalog.mjs';
import { leggiAlberoWorkspace as leggiAlberoWorkspaceReale, WorkspaceTreeError } from './workspace-tree.mjs';
import {
  copiaFile as copiaFileReale,
  creaVoceWorkspace as creaVoceWorkspaceReale,
  eliminaFile as eliminaFileReale,
  leggiContenutoFile as leggiContenutoFileReale,
  rinominaFile as rinominaFileReale,
  rivelaInEsploraFile as rivelaInEsploraFileReale,
  spostaFile as spostaFileReale,
  WorkspaceFileError,
} from './workspace-files.mjs';

export const EXPORT_SCHEMA = 'talos.harness-ui.session-export.v1';

/**
 * ⭐⭐⭐ 28/8, "procedi in ordine" punto 4 — forma di un ID modello
 * OpenRouter (`vendor/model`, es. `z-ai/glm-4.7-flash`,
 * `inclusionai/ling-3.0-flash-fin:free` — quest'ultimo con `:free` visto
 * nel dossier Stadio B del 22/8, non inventato). Ricerca 28/8
 * (openrouter.ai/docs/api_reference/overview e i problemi noti quando un
 * prefisso non torna quello atteso): la forma corretta È il vincolo — un
 * ID malformato viene rifiutato QUI, prima di uscire verso OpenRouter,
 * non lasciato all'errore remoto capirlo.
 *
 * ⛔ Questo NON è `MODELLI_AMMESSI` (config.mjs) — quell'allowlist resta
 * intatta e continua a governare SOLO il default letto da
 * `TALOS_HARNESS_UI_MODEL` (il banco automatico, mai un override per
 * richiesta: la regola dell'owner 20/8 "mai modelli di punta, sempre
 * flash" resta intatta per quel percorso). Qui la persona sceglie CON
 * LA PROPRIA chiave, in tempo reale, dal proprio catalogo — un rischio
 * diverso, deciso da chi lo prende, non un limite di forma da imporgli.
 */
const FORMA_MODELLO_OPENROUTER = /^[a-zA-Z0-9][a-zA-Z0-9._-]*\/[a-zA-Z0-9][a-zA-Z0-9._:-]*$/;
const LUNGHEZZA_MASSIMA_MODELLO = 128;

export function modelloRichiestoValido(modello) {
  return typeof modello === 'string'
    && modello.length > 0
    && modello.length <= LUNGHEZZA_MASSIMA_MODELLO
    && FORMA_MODELLO_OPENROUTER.test(modello);
}

/**
 * ⭐⭐⭐ 2/9 — piano §16.1 (owner: "stato vivo nella lista sessioni, come
 * Claude Code"). `messaggiFinali` è già la fonte di verità della
 * conversazione (resume()/compatta() la leggono allo stesso modo) —
 * questa funzione non aggiunge un secondo stato, legge quello che c'è
 * già. `null` per: nessun turno concluso ancora, l'ultimo messaggio
 * senza testo (un turno tutto tool-call), o una forma inattesa — mai
 * un errore, mai un'anteprima inventata.
 */
const ANTEPRIMA_MESSAGGIO_MASSIMA = 140;

function ultimoMessaggioTesto(messaggiFinali) {
  if (!Array.isArray(messaggiFinali) || messaggiFinali.length === 0) return null;
  const ultimo = messaggiFinali.at(-1);
  const testo = typeof ultimo?.content === 'string' ? ultimo.content.trim() : '';
  if (!testo) return null;
  const compatto = testo.replace(/\s+/g, ' ');
  return compatto.length > ANTEPRIMA_MESSAGGIO_MASSIMA
    ? `${compatto.slice(0, ANTEPRIMA_MESSAGGIO_MASSIMA)}…`
    : compatto;
}

/**
 * ⭐⭐⭐ 2/9 — porto canonico dal desktop (session-registry.mjs:420,
 * `ultimoEsitoDaEventi`), owner: "esattamente come fa desktop... metti
 * anche lo stato". STESSA funzione, non una riscritta: scansiona
 * `voce.eventi` all'indietro cercando l'ultimo RunError/RunFinished
 * prima di un RunStarted — funziona identica per una sessione VIVA e
 * una ricostruita dopo un riavvio, stessa disciplina già in uso per
 * `ultimoMessaggioTesto` sopra. Nessuna scrittura nuova su disco: è
 * derivata, non un flag mantenuto a parte che potrebbe disallinearsi.
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

export function createSessionRegistry({
  avviaSessioneFn = avviaSessioneReale,
  preparaEsecuzioneFn = preparaEsecuzioneReale,
  compattaSessioneFn = compattaSessioneReale,
  eseguiComandoDirettoFn = eseguiComandoDirettoReale,
  leggiAlberoWorkspaceFn = leggiAlberoWorkspaceReale,
  leggiContenutoFileFn = leggiContenutoFileReale,
  rinominaFileFn = rinominaFileReale,
  eliminaFileFn = eliminaFileReale,
  rivelaInEsploraFileFn = rivelaInEsploraFileReale,
  spostaFileFn = spostaFileReale,
  copiaFileFn = copiaFileReale,
  creaVoceWorkspaceFn = creaVoceWorkspaceReale,
  preparaEsecuzioneLiberaFn = preparaEsecuzioneLiberaReale,
  cartelleProgetto = [],
  /**
   * ⭐ 29/8 — porta canonico (LEDGER-MOBILE-PAREGGIO-DESKTOP-CODICE.md
   * §13): FUORI dal workspace di ogni progetto, stesso pattern di
   * `.automations/` — il trust è una decisione dell'owner su QUESTO
   * device, mai qualcosa che un progetto clonato può auto-concedersi.
   */
  caricaHooksFn = caricaHooksReale,
  verificaTrustFn = verificaTrustReale,
  // ⛔ 29/8 — mancava in questa copia (LEDGER-MOBILE-PAREGGIO-DESKTOP-CODICE.md
  // §18): costruisciHookFn chiama `eseguiHookFn(...)` più sotto, ma senza
  // questa riga il nome non è mai legato — ReferenceError a OGNI hook fidato,
  // inghiottito dal catch di costruisciHookFn come "è fallito nell'esecuzione".
  // Il canonico (AVM-harness-desktop/harness-ui/src/session-registry.mjs:79)
  // ce l'ha già: qui era stata persa nel porting, non un difetto upstream.
  eseguiHookFn = eseguiHookReale,
  fidaHookFn = fidaHookReale,
  cartellaTrustHook = fileURLToPath(new URL('../.hooks-trust/', import.meta.url)),
  /**
   * ⭐ 29/8 — porta canonico (ledger §17, FASE G.2/G.3). `document_create`/
   * `delega_sottotask` restano nell'elenco (come il canonico): il
   * kernel li offre al modello ma degrada onestamente ("not configured
   * on this harness") se chiamati, invece di crasharsi — verificato
   * leggendo il kernel PRIMA di scrivere questa riga, non assunto.
   * `ricercaWeb`/`firma`: di configurazione server (config.mjs),
   * iniettati da server.mjs, `undefined` di default = comportamento
   * invariato per chi non li configura.
   *
   * ⛔⛔⛔ 30/8, ledger §38 — bug reale trovato durante la ricerca per Fase C
   * (generate_image): QUESTO array, non `ATTREZZI_ESTESI` del kernel, è
   * ciò che decide cosa un modello VEDE in una sessione mobile reale —
   * `server.mjs` non lo sovrascrive mai (nessun campo `strumentiEstesi`
   * in `requireCustomTaskBody`), quindi resta SEMPRE questo default.
   * Fino a stanotte conteneva solo 6 nomi: le 16 scritture Note/Attività/
   * Memoria/Libreria (commit `c5ea7876`/`d27ed2b0`) e i 2 di Ricerca
   * (`a4b3039f`) erano collegate per intero — schema nel kernel,
   * dispatch, callback passate fino in fondo — ma MAI offerte a un
   * modello vero: la verifica di quelle fasi aveva chiamato
   * `window.__talosHarnessRichiediDato` DIRETTAMENTE via CDP (il ponte
   * dati), mai attraverso un giro reale dell'agente che ne provasse
   * l'OFFERTA. Corretto qui: tutti e 18 aggiunti.
   */
  strumentiEstesi = [
    'web_search', 'artifact_create', 'document_create', 'time_now', 'delega_sottotask',
    'notes_list', 'notes_create', 'notes_update', 'notes_delete',
    'tasks_list', 'tasks_create', 'tasks_complete', 'tasks_update', 'tasks_delete',
    'memory_search', 'memory_write', 'memory_update', 'memory_delete',
    'library_list', 'library_read', 'library_rename', 'library_delete',
    'library_search', 'library_file_origin',
    'research_list', 'research_read',
    // ⭐ 30/8, Fase C (2/7) — generate_image: nessuna credenziale propria da mancare (riusa chiave), sempre offerto come gli altri.
    'generate_image',
  ],
  ricercaWeb,
  firma,
  /**
   * ⭐⭐⭐ 30/8, Fase C (2/7) — porta canonico (desktop, FASE H): a
   * differenza di `ricercaWeb`/`firma` appena sopra, `immagine` NON ha
   * un default `undefined` — `server.mjs` lo passa SEMPRE
   * (`config.mjs`, `parseImmagine` non torna mai undefined), quindi
   * questo parametro esiste solo per i test che costruiscono un
   * registro senza passare per `server.mjs`.
   */
  immagine,
  modello,
  chiave,
  // ⭐⭐⭐ 03/9 — inoltrato SENZA logica propria fino ad avviaSessioneFn (agent-service.mjs), stesso principio di chiediApprovazioneFn/hookFn: la decisione COSA fare col modello vive in model-destination.mjs, non qui.
  dipendenzeMultiProvider = null,
  clock = () => new Date(),
  /**
   * ⭐ 28/8 — la cartella radice per le sessioni REALI (`avviaReale`, non
   * un task del banco): ogni sessione vive in un proprio sottocartella
   * PERSISTENTE (mai `mkdtemp`/usa-e-getta — è il progetto della persona,
   * non un banco di prova). Default: sotto la temp dell'OS, che sul
   * telefono (dove questo processo gira DENTRO al dominio `shell` via
   * `TalosPonteAdb`) risolve a un percorso scrivibile per costruzione —
   * stesso principio del default già scelto per `bancoDir`/`publicDir` in
   * config.mjs: iniettabile per i test, mai per uso normale.
   */
  radiceSessioniReali = join(tmpdir(), 'talos-harness-ui-sessioni'),
  /*
   * ⭐⭐⭐ 30/8 — porta canonico (3e03f9d3, FASE L) — owner: "ricerca web
   * competitor" sulla domanda "un riavvio perde una sessione in corso,
   * è mai capitato?". La ricerca ha trovato che questo file dichiara
   * "solo in memoria... non ancora aperto" fin dalla sua prima riga —
   * un gap più grande di quanto la domanda presumesse (OGNI sessione,
   * non solo quelle in corso).
   *
   * ⛔⛔⛔ `cartellaStore` NESSUN default reale — a differenza di
   * `cartellaTrustHook` sopra (che pure punta a un percorso reale di
   * default): quello è una lettura PIGRA, innescata solo da un'azione
   * esplicita (un fida). Questo scrive ad OGNI evento, per OGNI
   * sessione — un default reale avrebbe scritto file veri ad ogni test
   * di questo intero file che avvia una sessione finta, MAI notato
   * perché una scrittura riuscita non fa fallire nessun assert. Trovato
   * DAL VIVO sul canonico: 114 file scritti in `.sessions-store/` dopo
   * una sola corsa della suite — corretto qui fin dall'inizio, non solo
   * notato. `undefined` ⇒ ogni scrittura è saltata (guardia esplicita
   * ad ogni punto di chiamata) — SOLO `server.mjs` passa un valore vero.
   */
  cartellaStore,
  registraRigaFn = registraRigaReale,
  /*
   * ⭐⭐⭐ 30/8, trovato dalla verifica dal vivo sul canonico: un server
   * VERO, ucciso 6ms dopo aver creato una sessione — sul riavvio,
   * "114/115 ripristinate". La SOLA intestazione (vedi la doc in
   * session-store.mjs#registraRigaSync) usa questa versione SINCRONA,
   * non `registraRigaFn`: `avvia()` resta sincrona, ma il sessionId non
   * esce mai verso il chiamante prima che la sua intestazione sia già
   * durevole sul disco.
   */
  registraRigaSyncFn = registraRigaSyncReale,
  elencaSessioniPersistiteFn = elencaSessioniPersistiteReale,
  leggiRegistroFn = leggiRegistroReale,
} = {}) {
  const sessioni = new Map();
  // ⭐ 29/8 — porta canonico (ledger §18, FASE G.4): istanziato qui, `avviaESegui` è una function declaration (issata), riferibile prima della sua definizione testuale più sotto.
  const subagentOrchestrator = creaSubagentOrchestrator({ sessioni, avviaESeguiFn: avviaESegui });

  /*
   * ⭐ 29/8 — porta canonico (ledger §24, cherry-pick d2428712, owner:
   * "ricevo risposte duplicate"): `iscriviti()` rimanda SEMPRE tutto
   * `voce.eventi` a un nuovo ascoltatore, e QUALUNQUE nuova connessione
   * SSE sulla stessa sessione ne apre una — non solo un client che si
   * ricollega dopo una caduta di rete, ma anche `runDirectShell()`
   * (`!comando`), che apre una connessione FRESCA apposta. In entrambi
   * i casi il buffer intero riparte dall'evento 1: i bubble già a
   * schermo si duplicano. Ogni evento porta un `_sequenza` monotono,
   * unico per sessione, assegnato UNA sola volta qui — lo stesso
   * oggetto viene ri-servito ad ogni replay, quindi il numero resta
   * identico. Il frontend (handleRealEvent) lo usa per scartare un
   * evento già visto — stesso principio (numeri monotoni scartati
   * lato client) dello standard per la deduplica SSE, verificato:
   * websocket.org/guides/reconnection, qaskills.sh/blog/sse-testing-
   * reconnect-last-event-id.
   */
  function broadcast(voce, evento) {
    evento._sequenza = (voce.prossimaSequenza = (voce.prossimaSequenza ?? 0) + 1);
    voce.eventi.push(evento);
    for (const ascoltatore of voce.ascoltatori) ascoltatore(evento);
    if (evento.type === 'RunFinished' || evento.type === 'RunError') voce.conclusa = true;
    /*
     * ⭐⭐⭐ 30/8 — porta canonico (3e03f9d3, FASE L) — accoda anche su
     * disco, MAI in attesa (broadcast è sincrona da decine di punti di
     * chiamata in questo file, farla async romperebbe ogni chiamante).
     * Un fallimento di scrittura non deve MAI interrompere una
     * conversazione dal vivo: `.catch` che stampa, non rilancia — "mai
     * un buco silenzioso" per chi guarda il terminale del server, ma
     * nemmeno un crash per chi sta parlando col modello in questo
     * momento. `voce.sessionId` è assente per una voce senza
     * persistenza configurata o non ancora arrivata ad `avviaESegui`:
     * mai vero in pratica una volta lì, ma un guard esplicito costa una
     * riga.
     */
    if (cartellaStore && voce.sessionId) {
      registraRigaFn({ cartellaStore, sessionId: voce.sessionId, record: evento })
        .catch((errore) => { console.error(`[session-store] scrittura fallita per ${voce.sessionId}:`, errore instanceof Error ? errore.message : errore); });
    }
  }

  /**
   * ⭐ 29/8 — porta canonico verbatim (ledger §17, FASE G.3). Il gate
   * pre_tool_call/post_tool_call: `hooksCache` pigro (letto alla PRIMA
   * chiamata, non alla costruzione — un `.harness-ui-hooks.json`
   * aggiunto a metà sessione non viene visto finché la sessione non
   * riparte, ma il costo I/O si paga solo se serve davvero), un hook
   * non fidato è come se non esistesse (mai bloccante di suo), il
   * primo hook fidato che rifiuta vince.
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
        broadcast(voce, hookInvoked({ hookId: hook.id, tipo: evento.tipo, azione: evento.azione, esito }));
        if (esito?.consentito === false) return esito; // il primo hook fidato che rifiuta vince — AND logico sul verdetto
      }
      return { consentito: true };
    };
  }

  /**
   * ⭐⭐⭐ 30/8 — porta canonico (6c37f8d5): il `chiediApprovazioneFn` che
   * `talosHarness.mjs` chiama PRIMA di scrivi/shell/document_create sotto
   * il permesso "On request". Un SOLO slot di approvazione per voce
   * (`voce.approvazionePendente`) — `talosLavora` dispatcha le tool-call
   * di un giro UNA alla volta, in un `for` sequenziale con `await`: non
   * può mai esistere più di una richiesta in sospeso per la stessa
   * sessione nello stesso istante.
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
   * ⭐⭐⭐ 30/8 — il PONTE verso Note/Attività/Memoria/Libreria del
   * telefono. Owner, correggendo un mio errore: quei sistemi esistono
   * già, maturi e testati (`mobile/src/lib/tools/toolset.ts`) — non
   * vanno ricostruiti, vanno COLLEGATI. Questo processo (talosHarness.mjs
   * embedded) non ha MAI un accesso diretto all'SQLite privato dell'app
   * (spawnato via ADB shell, mai lo stesso UID) — stesso identico
   * problema già risolto per l'approvazione "On request", riusato QUI
   * per dati invece che per un sì/no: un evento AG-UI (`DataRequested`)
   * arriva al client REALE (app.js, nello stesso realm JS di
   * `HarnessSessionScreen.vue`, shadow DOM non iframe), che chiama
   * `window.__talosHarnessRichiediDato(...)` e POSTa la risposta.
   *
   * ⛔ Un SOLO slot pendente per voce, stesso principio di
   * `approvazionePendente`: `talosLavora` dispatcha le tool-call di un
   * giro una alla volta.
   *
   * ⛔ `reject`, non solo `resolve`: un errore di lettura reale (il
   * bridge non è disponibile — sessione non mobile, o una versione
   * dell'app senza questo codice) deve arrivare al modello come un
   * fallimento onesto del tool, mai un elenco vuoto che si legge come
   * "non hai note".
   */
  function richiediDato(voce, tipo, args) {
    return new Promise((resolve, reject) => {
      const requestId = randomUUID();
      voce.datoPendente = { requestId, tipo, resolve, reject };
      broadcast(voce, dataRequested({ requestId, tipo, args }));
    });
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
    forkDa = null, voceEsistente = null, mobile = false, modelloOverride = null,
    /**
     * ⭐⭐⭐ 2/9 — picker Planner (FASE K, sbloccata dalla decisione kernel
     * DECISIONE-KERNEL-DUE-COPIE-2026-09-02.md): `talosLavora` accetta GIÀ
     * `modelloEsecutore` (talosHarness.mjs, 6.1 — planner costoso + editor
     * economico, misurato dal banco il 28/8) — mai chiamato da nessun
     * livello server finché nessuna sessione reale lo passava. Stessa
     * disciplina di `modelloOverride`: assente/null = comportamento di
     * sempre (ogni giro usa `modello`), un valore vale dal PROSSIMO
     * resume/fork per una sessione esistente (mai a metà giro).
     */
    modelloEsecutoreOverride = null,
    /**
     * ⭐ 29/8 — porta canonico (ledger §17, FASE G.3). Stessa disciplina di
     * `modelloOverride` sopra: un fork/resume eredita il valore della
     * voce originale (mai perso a metà conversazione, mai un modo per
     * "salire" di livello passando semplicemente da resume), un avvio
     * nuovo usa quello richiesto o il default onesto di sempre.
     */
    reasoningRichiesto = null, permessiRichiesti = null, permessiPerAttrezzoRichiesti = null,
    /*
     * ⭐ 29/8 — porta canonico (ledger §18, FASE G.4): sub-agenti.
     * `padreId`/`profonditaDelega` identificano una sessione FIGLIA
     * creata da `subagentOrchestrator` (mai da un umano) —
     * assenti/`0` per ogni sessione normale, invariato.
     * `onConclusioneFn`, se presente, è chiamato dentro lo STESSO
     * `.then()`/`.catch()` che già aggiorna `voce.messaggiFinali` — è
     * così che `subagent-orchestrator.delegaSottoTask` sa quando la
     * figlia ha finito, senza un secondo meccanismo di attesa.
     */
    padreId = null, profonditaDelega = 0, onConclusioneFn,
  }) {
    if (typeof chiave !== 'string' || chiave.length === 0) {
      return { erroreAvvio: 'Chiave API non configurata sul server (OPENROUTER_API_KEY)', code: 'CONFIG_INVALID' };
    }
    /*
     * ⭐⭐⭐ 30/8 — porta canonico (6c37f8d5), ADATTATA: il canonico valida
     * `permessi` in http-app.mjs (che lì importa direttamente da
     * config.mjs); QUESTO http-app.mjs non importa nulla — resta
     * volutamente limitato a validazione di FORMA/tipo, la validazione di
     * VALORE vive nei metodi del registro (stesso principio già in uso
     * per `modelloRichiestoValido`, sotto, dentro avviaReale). Un solo
     * controllo qui protegge OGNI chiamante (avvia/avviaLibero/forka e
     * ogni futuro), non uno duplicato per endpoint HTTP.
     */
    if (!permessiRichiestaValido(permessiRichiesti)) {
      return { erroreAvvio: 'permessi deve essere uno fra "Read only", "Workspace write", "On request", "Full access"', code: 'QUERY_INVALID' };
    }

    const reasoningEffettivo = reasoningRichiesto ?? voceEsistente?.reasoning ?? null;
    const permessiEffettivi = permessiRichiesti ?? voceEsistente?.permessi ?? 'Workspace write';
    const permessiPerAttrezzoEffettivi = permessiPerAttrezzoRichiesti ?? voceEsistente?.permessiPerAttrezzo ?? null;

    const controller = new AbortController();
    /*
     * ⛔ `mobile` entra nella voce SOLO quando se ne crea una nuova — un
     * resume (`voceEsistente` presente) la riusa com'era, mai sovrascritta:
     * la "mobilità" di una sessione si decide una volta sola, all'avvio
     * (piano `procedi-col-generare-un-snoopy-neumann.md`, Fase 3).
     */
    const voce = voceEsistente ?? {
      eventi: [], ascoltatori: new Set(), taskId, cartella, task, comandoProva, forkDa,
      avviataAlle: clock().toISOString(), messaggiFinali: null, mobile,
      /*
       * ⭐⭐⭐ 2/9 — R2/R3 dalla review Fable: prima d'ora il modello non
       * viveva sulla voce, solo come parametro transitorio di avvio — un
       * resume tornava SEMPRE al default del server, mai al modello
       * scelto per questa sessione. Stesso principio già in uso per
       * reasoning/permessi due righe sotto.
       */
      modello: modelloOverride ?? modello,
      modelloEsecutore: modelloEsecutoreOverride,
      reasoning: reasoningEffettivo, permessi: permessiEffettivi, permessiPerAttrezzo: permessiPerAttrezzoEffettivi,
      // ⭐ 29/8 — porta canonico (ledger §18, FASE G.4): null/0 per ogni sessione avviata da un umano, valorizzati SOLO da subagentOrchestrator.delegaSottoTask. `esitoDelega` (per un futuro foglio "Albero sessione") si popola quando la sessione conclude, vedi sotto.
      padreId, profonditaDelega, esitoDelega: null,
      // ⭐ 29/8 — porta canonico (ledger §18, FASE G): coda messaggi, FIFO vera, vuota per ogni sessione. Sopravvive a un resume (STESSA voce): un messaggio accodato mentre la sessione era "in corso" resta in coda anche se il turno finisce e ne parte un altro tramite resume().
      codaMessaggi: [],
      // ⭐ 30/8 — porta canonico (6c37f8d5): lo slot di richiediApprovazione/rispondiApprovazione sopra/sotto — null finché nessuna scrittura sotto "On request" è in attesa di un sì/no dell'owner.
      approvazionePendente: null,
      // ⭐⭐⭐ 30/8 — lo slot di richiediDato/rispondiDato sopra/sotto — null finché nessuna richiesta verso Note/Attività/Memoria/Libreria è in sospeso.
      datoPendente: null,
    };
    // ⭐⭐⭐ 30/8 — porta canonico (3e03f9d3, FASE L): distingue "questa voce l'ho appena creata io" da "sto riusando quella di un resume" — solo la prima scrive un'intestazione su disco (un resume riusa la STESSA voce/intestazione già scritta all'avvio originale).
    const voceNuova = !voceEsistente;
    voce.controller = controller;
    voce.conclusa = false;
    /*
     * ⭐⭐⭐ 30/8 — porta canonico (3e03f9d3, FASE L): `sessionId` sulla
     * voce stessa (prima viveva solo come chiave della Map) — broadcast()
     * ne ha bisogno per sapere in quale file scrivere. L'intestazione va
     * su disco UNA sola volta, solo per una voce VERAMENTE nuova,
     * contiene tutto ciò che serve per RICOSTRUIRE la voce dopo un
     * riavvio, senza dover rileggere ogni evento per dedurlo.
     *
     * ⛔ Debito dichiarato, non nascosto (stesso limite del canonico):
     * `nome` (rinomina), `permessiPerAttrezzo`/`permessi` cambiati DOPO
     * l'avvio, e `codaMessaggi` non sopravvivono a un riavvio in questa
     * prima fetta — solo lo stato ALL'AVVIO viene catturato qui.
     */
    voce.sessionId = sessionId;
    if (cartellaStore && voceNuova) {
      try {
        registraRigaSyncFn({
          cartellaStore, sessionId,
          record: {
            tipo: 'intestazione', sessionId, taskId, cartella, task, comandoProva, forkDa,
            avviataAlle: voce.avviataAlle, mobile: voce.mobile, modello: voce.modello, reasoning: voce.reasoning,
            modelloEsecutore: voce.modelloEsecutore,
            permessi: voce.permessi, permessiPerAttrezzo: voce.permessiPerAttrezzo,
            padreId: voce.padreId, profonditaDelega: voce.profonditaDelega,
          },
        });
      } catch (errore) {
        // ⛔ Un disco pieno/non scrivibile non deve mai impedire una sessione di partire — stesso principio "mai bloccare il dispatch" del resto di questo file, solo loggato invece di silenzioso.
        console.error(`[session-store] intestazione non scritta per ${sessionId}:`, errore instanceof Error ? errore.message : errore);
      }
    }
    sessioni.set(sessionId, voce);

    /*
     * ⭐ 30/8 — porta canonico (6c37f8d5, chiudendo FASE G.5): LA PILLOLA
     * PERMESSI, tradotta dalle QUATTRO stringhe verso i DUE parametri che
     * il kernel capisce (talosHarness.mjs, verificaPermessoScrittura):
     * "Read only" → livelloAccesso:'lettura'; "On request" →
     * chiediApprovazioneFn vero (richiediApprovazione, sopra); "Workspace
     * write"/"Full access" → nessuno dei due (il kernel non sa e non deve
     * sapere QUALE cartella sta scrivendo, solo se può farlo — "Full
     * access" cambia QUALE cartella diventa `cartella` più in alto, in
     * avviaLibero, mai qui). La nota che stava qui ("On request NON
     * ancora tradotta... FASE G.5 non ancora portata") descriveva
     * esattamente il buco che `chiediApprovazioneFn`, due righe sotto,
     * ora chiude.
     */
    const livelloAccesso = voce.permessi === 'Read only' ? 'lettura' : undefined;
    const chiediApprovazioneFn = voce.permessi === 'On request'
      ? (azione) => richiediApprovazione(voce, azione)
      : undefined;
    const hookFn = costruisciHookFn(voce);
    /*
     * ⭐⭐⭐ 30/8 — sempre costruita (stesso principio di chiediApprovazioneFn
     * sopra): il vero collegamento verso Note/Attività/Memoria/Libreria
     * vive dentro `richiediDato`, che a sua volta dipende dal client
     * REALE (app.js) per rispondere — su una sessione avviata da un
     * processo senza client collegato (un test, il banco), la Promise
     * resta pendente finché nessuno risponde: onesto, mai un dato
     * inventato.
     */
    const elencaNoteFn = () => richiediDato(voce, 'notes_list', null);
    const creaNotaFn = (input) => richiediDato(voce, 'notes_create', input);
    const aggiornaNotaFn = (id, patch) => richiediDato(voce, 'notes_update', { id, patch });
    const eliminaNotaFn = (id) => richiediDato(voce, 'notes_delete', { id });
    const elencaTaskFn = () => richiediDato(voce, 'tasks_list', null);
    const creaTaskFn = (input) => richiediDato(voce, 'tasks_create', input);
    const completaTaskFn = (id, status) => richiediDato(voce, 'tasks_complete', { id, status });
    const aggiornaTaskFn = (id, patch) => richiediDato(voce, 'tasks_update', { id, patch });
    const eliminaTaskFn = (id) => richiediDato(voce, 'tasks_delete', { id });
    const cercaMemoriaFn = (query) => richiediDato(voce, 'memory_search', { query });
    const creaMemoriaFn = (input) => richiediDato(voce, 'memory_write', input);
    const aggiornaMemoriaFn = (title, patch) => richiediDato(voce, 'memory_update', { title, patch });
    const eliminaMemoriaFn = (title) => richiediDato(voce, 'memory_delete', { title });
    const elencaLibreriaFn = () => richiediDato(voce, 'library_list', null);
    const leggiLibreriaFn = (id) => richiediDato(voce, 'library_read', { id });
    const rinominaLibreriaFn = (id, name) => richiediDato(voce, 'library_rename', { id, name });
    const eliminaLibreriaFn = (id) => richiediDato(voce, 'library_delete', { id });
    // ⭐⭐⭐ 2/9 — chiude il gap contro lane/harness-mobile-bridge-kernel:
    // library_search/library_file_origin sono REALI sulla chat normale
    // (readTools.ts), semplicemente mai collegate qui. library_export
    // (apre un picker di sistema) e library_context_policy_update
    // (session-scoped, confirmation:'always') restano deliberatamente
    // fuori — vedi la nota in codiceDati.ts.
    const cercaLibreriaFn = (query, limit) => richiediDato(voce, 'library_search', { query, limit });
    const origineLibreriaFn = (id) => richiediDato(voce, 'library_file_origin', { id });
    const elencaRicercaFn = () => richiediDato(voce, 'research_list', null);
    const leggiRicercaFn = (id) => richiediDato(voce, 'research_read', { id });
    /*
     * ⭐ 29/8 — porta canonico (ledger §18, FASE G): sempre costruita
     * (stesso principio di hookFn/onDelega sotto): il vero contenuto
     * vive in voce.codaMessaggi, popolato da accodaMessaggio() più
     * sotto — shift() drena FIFO, ?? null non lascia mai passare
     * undefined al kernel. Quando un messaggio VIENE DAVVERO
     * consegnato (shift() torna qualcosa), broadcast di
     * QueuedMessageDelivered — è il SOLO momento in cui il frontend
     * può sapere con certezza che è successo.
     */
    const codaMessaggiFn = () => {
      const testo = voce.codaMessaggi.shift();
      if (testo == null) return null;
      broadcast(voce, queuedMessageDelivered({ testo }));
      return testo;
    };

    /*
     * ⛔ NON await: avviaSessione emette RunStarted come sua PRIMA riga,
     * prima di qualunque await — quindi al ritorno di QUESTA funzione
     * RunStarted è già nel buffer (run-to-first-await di JS, non una gara).
     */
    avviaSessioneFn({
      // ⭐⭐⭐ 2/9 — R2/R3: `voce.modello` (appena impostato/riusato sopra) prima del default del server — un resume onora un cambio fatto con aggiornaImpostazioni(), non solo un avvio nuovo.
      cartella, task, modello: modelloOverride ?? voce.modello ?? modello, chiave, comandoProva, messaggiIniziali,
      dipendenzeMultiProvider,
      // ⭐⭐⭐ 2/9 — picker Planner: `undefined` (non `null`) quando assente — talosLavora già distingue "nessun override" con `!modelloEsecutore`, e undefined è la forma che il resto del file usa per "non passato" (vedi `reasoning` due righe sotto).
      modelloEsecutore: voce.modelloEsecutore ?? undefined,
      reasoning: reasoningEffettivo ?? undefined,
      segnaleStop: controller.signal,
      mobile: voce.mobile,
      strumentiEstesi, ricercaWeb, firma, immagine,
      livelloAccesso, hookFn, chiediApprovazioneFn,
      elencaNoteFn, creaNotaFn, aggiornaNotaFn, eliminaNotaFn,
      elencaTaskFn, creaTaskFn, completaTaskFn, aggiornaTaskFn, eliminaTaskFn,
      cercaMemoriaFn, creaMemoriaFn, aggiornaMemoriaFn, eliminaMemoriaFn,
      elencaLibreriaFn, leggiLibreriaFn, rinominaLibreriaFn, eliminaLibreriaFn,
      cercaLibreriaFn, origineLibreriaFn,
      elencaRicercaFn, leggiRicercaFn,
      permessiPerAttrezzo: voce.permessiPerAttrezzo,
      // ⭐ 29/8 — porta canonico (ledger §18, FASE G.4): sempre costruito (stesso principio di hookFn), il vero lavoro (limiti, isolamento) vive tutto dentro subagentOrchestrator.delegaSottoTask.
      onDelega: (taskFiglio, cartellaFiglio) => subagentOrchestrator.delegaSottoTask({ sessionPadreId: sessionId, task: taskFiglio, cartella: cartellaFiglio }),
      codaMessaggiFn,
      onEvento: (evento) => broadcast(voce, evento),
    }).then((risultato) => {
      /*
       * ⭐ Catturato per un resume/fork FUTURO. Se talosLavora non ha
       * prodotto un esito (non dovrebbe succedere, ma non è un'eccezione da
       * gestire qui), resta null: riprendere questa sessione dirà
       * onestamente che non c'è niente da ereditare, invece di lanciare.
       */
      voce.messaggiFinali = risultato?.esito?.messaggiFinali ?? null;
      /*
       * ⭐⭐⭐ 30/8 — porta canonico (3e03f9d3, FASE L) — SOLO quando c'è
       * davvero qualcosa da salvare: senza questa riga su disco, un
       * ripristino dopo un riavvio troverebbe una sessione con la sua
       * storia (gli eventi) ma `messaggiFinali:null` — resume()/forka()
       * la rifiuterebbero onestamente (SESSION_NOT_READY, il loro gate
       * già esistente), mai un crash: lo stesso limite che Codex stesso
       * dichiara ("no resumable artefacts may be written" se il crash
       * arriva troppo presto).
       */
      if (cartellaStore && voce.messaggiFinali && voce.sessionId) {
        registraRigaFn({ cartellaStore, sessionId: voce.sessionId, record: { tipo: 'messaggi-finali', messaggiFinali: voce.messaggiFinali } })
          .catch((errore) => { console.error(`[session-store] messaggiFinali non scritti per ${voce.sessionId}:`, errore instanceof Error ? errore.message : errore); });
      }
      // ⭐ 29/8 — porta canonico (ledger §18, FASE G.4): lo stato reale di OGNI sessione che conclude, non solo delle figlie (inerte/ignorato per una sessione senza padre).
      voce.esitoDelega = risultato?.esito?.comeFinita ?? (risultato?.ok === false ? 'fallito' : null);
      // ⭐ 29/8 — se questa sessione è una figlia in delega, sblocca la Promise che il dispatcher del kernel del PADRE sta aspettando. Va DOPO gli aggiornamenti sopra: onConclusioneFn potrebbe (in una fase futura) leggere voce.esitoDelega.
      onConclusioneFn?.(risultato);
    }).catch((errore) => {
      /*
       * ⛔ Ripiego, non il percorso atteso: avviaSessione dichiara (e il suo
       * stesso test lo prova) di non lanciare mai. Se lo facesse comunque —
       * un bug futuro, una promise rifiutata prima del suo try/catch — la
       * sessione non deve restare silenziosamente a metà.
       */
      // ⛔ AL CONTRARIO: se questa sessione è una figlia, il padre non deve restare appeso in eterno anche quando QUESTO ramo raro (mai atteso) scatta.
      onConclusioneFn?.({ ok: false, esito: null, erroreInterno: errore instanceof Error ? errore.message : String(errore) });
      if (!voce.conclusa) {
        broadcast(voce, {
          type: 'RunError',
          message: errore instanceof Error ? errore.message : String(errore),
          code: 'internal-error',
        });
      }
    });

    return { sessionId };
  }

  return Object.freeze({
    /**
     * ⭐⭐⭐ 30/8 — porta canonico (3e03f9d3+1ca98143, FASE L) — chiamata
     * UNA volta da `server.mjs`, prima di accettare richieste: legge
     * `.sessions-store/`, ricostruisce una voce PER OGNI sessione
     * persistita che questo processo non ha ancora in memoria (un avvio
     * pulito non ne ha mai). Una sessione il cui ultimo evento non è
     * `RunFinished`/`RunError` è `interrotta:true` — onestamente: il
     * processo che la eseguiva è sparito, nessun turno può "riprendere
     * da dove stava" (lo stesso limite che Codex stesso dichiara: il
     * ripristino è una rilettura della trascrizione, mai la resurrezione
     * di uno stato in memoria). Una voce corrotta (JSON illeggibile
     * oltre l'ultima riga, vedi session-store.mjs) NON blocca le altre —
     * loggata e saltata.
     *
     * ⛔⛔⛔ `conclusa` NON guarda solo l'ultimo evento (bug trovato da un
     * test intermittente sul canonico, non da lettura, 1ca98143): la
     * riga RunFinished (broadcast()) e la riga messaggi-finali sono DUE
     * scritture fire-and-forget indipendenti, senza garanzia d'ordine
     * reciproca — su disco possono atterrare in QUALUNQUE ordine. La
     * presenza stessa di `messaggiFinaliRecord` È prova sufficiente
     * (quella riga si scrive SOLO dopo un run che ha prodotto
     * messaggiFinali veri, mai su un RunError senza contenuto — vedi il
     * call site in broadcast()/`.then()` sopra), quindi non può mai
     * attestare falsamente una conclusione che non c'è stata.
     *
     * ⛔ ADATTATO dal canonico: nessun `guardaWorkspaceFn`/watcher
     * ricollegato qui (chokidar, non portato su questa copia — vedi il
     * commento di testa del file) e nessun campo `modelloPlanner`
     * (FASE K, non portata) nell'intestazione ricostruita.
     *
     * @returns {Promise<{ripristinate:number, totali:number}>}
     */
    async ripristina() {
      if (!cartellaStore) return { ripristinate: 0, totali: 0 }; // nessuna persistenza configurata: mai un tentativo di leggere un percorso che non c'è
      const id = await elencaSessioniPersistiteFn({ cartellaStore });
      let ripristinate = 0;
      for (const sessionId of id) {
        if (sessioni.has(sessionId)) continue; // già viva in questo processo: mai sovrascrivere
        let record;
        try {
          record = await leggiRegistroFn({ cartellaStore, sessionId });
        } catch (errore) {
          console.error(`[session-store] sessione ${sessionId} non ripristinata:`, errore instanceof Error ? errore.message : errore);
          continue;
        }
        if (!record || record.length === 0) continue;
        const intestazione = record.find((r) => r.tipo === 'intestazione');
        if (!intestazione) continue; // senza intestazione non c'è abbastanza per una voce onesta
        // ⛔ `type` (AG-UI, PascalCase) contro `tipo` (i record di questo file, italiano): due nomi di campo DIVERSI apposta, mai un'ambiguità nel distinguerli nello stesso file.
        const eventi = record.filter((r) => typeof r.type === 'string');
        const messaggiFinaliRecord = record.find((r) => r.tipo === 'messaggi-finali');
        const ultimoEvento = eventi.at(-1);
        const conclusa = Boolean(messaggiFinaliRecord) || ultimoEvento?.type === 'RunFinished' || ultimoEvento?.type === 'RunError';
        /*
         * ⭐⭐⭐ 2/9 — R2/R3: chiude il debito dichiarato nel commento sopra
         * ("permessi/permessiPerAttrezzo cambiati DOPO l'avvio... non
         * sopravvivono a un riavvio"). aggiornaImpostazioni() scrive un
         * record 'impostazioni-sessione' per ogni cambio dal vivo — qui se
         * ne prende l'ULTIMO (.at(-1): un cambio più vecchio non deve
         * vincere su uno più recente), applicato sopra l'intestazione
         * originale, mai il contrario.
         */
        const ultimeImpostazioni = record.filter((r) => r.tipo === 'impostazioni-sessione').at(-1);
        const voce = {
          eventi, ascoltatori: new Set(), taskId: intestazione.taskId, cartella: intestazione.cartella, task: intestazione.task,
          comandoProva: intestazione.comandoProva, forkDa: intestazione.forkDa,
          avviataAlle: intestazione.avviataAlle, messaggiFinali: messaggiFinaliRecord?.messaggiFinali ?? null,
          modello: ultimeImpostazioni?.modello ?? intestazione.modello,
          modelloEsecutore: Object.hasOwn(ultimeImpostazioni ?? {}, 'modelloEsecutore') ? ultimeImpostazioni.modelloEsecutore : (intestazione.modelloEsecutore ?? null),
          reasoning: ultimeImpostazioni?.reasoning ?? intestazione.reasoning, mobile: intestazione.mobile,
          permessi: ultimeImpostazioni?.permessi ?? intestazione.permessi,
          permessiPerAttrezzo: ultimeImpostazioni?.permessiPerAttrezzo ?? intestazione.permessiPerAttrezzo,
          approvazionePendente: null, datoPendente: null, padreId: intestazione.padreId, profonditaDelega: intestazione.profonditaDelega,
          esitoDelega: null, codaMessaggi: [], sessionId, controller: new AbortController(),
          conclusa, ripristinata: true, interrotta: !conclusa,
          prossimaSequenza: ultimoEvento?._sequenza ?? 0,
        };
        sessioni.set(sessionId, voce);
        ripristinate += 1;
      }
      return { ripristinate, totali: id.length };
    },

    /**
     * @returns {Promise<{sessionId:string}|{erroreAvvio:string, code:string}>}
     *   — mai un throw: un id fuori allowlist o una chiave assente sono
     *   risposte attese di un endpoint HTTP, non un guasto del registro.
     *
     * ⛔ 28/8: asincrona da quando `preparaEsecuzioneFn` lo è (task-catalog.mjs
     * carica TALOS-BANCO con un `import()` dinamico, non più statico — così
     * l'intero modulo, e con lui questo registro, si carica anche dove quel
     * corpus non c'è, come su un telefono). `avviaESegui` resta sincrona
     * (il suo `.then()` interno non era mai stato l'attesa di questa
     * funzione): solo il PREPARARE la cartella del task è diventato async.
     */
    async avvia(taskId, { mobile = false, permessiScelto = null } = {}) {
      let preparato;
      try {
        preparato = await preparaEsecuzioneFn(taskId);
      } catch (errore) {
        if (errore instanceof TaskCatalogError) return { erroreAvvio: errore.message, code: errore.code };
        throw errore;
      }
      /*
       * ⭐ 30/8 — porta canonico (6c37f8d5): `permessiScelto:'Full access'`
       * qui è accettato ma INERTE — la cartella di un task del corpus è
       * SEMPRE la copia usa-e-getta di preparaEsecuzioneFn, mai scelta
       * dall'owner; "Full access" ha senso solo dove esiste un percorso a
       * piacere da scegliere (avviaLibero, sotto). Nessun errore: si
       * comporta come "Workspace write" (avviaESegui non distingue i due).
       */
      return avviaESegui({
        taskId, cartella: preparato.cartella, task: preparato.task, comandoProva: preparato.comandoProva, mobile,
        permessiRichiesti: permessiScelto,
      });
    },

    /**
     * ⭐⭐⭐ 28/8 — la sessione REALE: un messaggio vero della persona, su
     * una cartella VERA (persistente, non un task del banco che finisce
     * gettato). Trovata mancante ispezionando il codice esistente prima di
     * riusarlo (ledger FASE-5-EXECUTION-PLANE): `avvia()` qui sopra parte
     * SOLO da un taskId del corpus di benchmark — nessuna funzione, prima
     * di questa, sapeva avviare l'agente su "la tua cartella, il tuo
     * messaggio".
     *
     * ⛔ `mobile` qui NON significa "il ponte ADB verso un telefono": quel
     * significato (solo l'attrezzo `shell` se ne accorge, vedi
     * agent-service.mjs) resta per FASE 3 (un PC che pilota un telefono
     * come sandbox). Una sessione reale avviata DA un processo che gira
     * GIÀ sul telefono (FASE 5) non ha bisogno di quel ponte: `cartella` è
     * già locale a chi esegue `talosLavora`, `mobile: false` è corretto
     * anche quando il processo stesso è on-device.
     *
     * ⭐⭐⭐ 28/8, "procedi in ordine" punto 4 — `modello`, opzionale: la
     * persona sceglie DAL VIVO nel composer di Codice (catalogo reale
     * OpenRouter, la propria chiave, mai i due flash fissi del banco). Se
     * assente, resta il default del server (`modello` di chiusura, da
     * `config.mjs`) — comportamento invariato per chi non sceglie niente.
     *
     * @returns {{sessionId:string}|{erroreAvvio:string, code:string}}
     */
    avviaReale(messaggio, { modello: modelloRichiesto } = {}) {
      if (typeof messaggio !== 'string' || messaggio.trim().length === 0) {
        return { erroreAvvio: 'Messaggio vuoto', code: 'QUERY_INVALID' };
      }
      if (modelloRichiesto !== undefined && !modelloRichiestoValido(modelloRichiesto)) {
        return { erroreAvvio: 'Modello non valido', code: 'QUERY_INVALID' };
      }
      const sessionId = randomUUID();
      const cartella = join(radiceSessioniReali, sessionId);
      try {
        mkdirSync(cartella, { recursive: true });
      } catch (errore) {
        return {
          erroreAvvio: `Impossibile creare la cartella di lavoro: ${errore.message}`,
          code: 'INTERNAL_ERROR',
        };
      }
      return avviaESegui({
        sessionId, cartella, task: { consegna: messaggio.trim() }, mobile: false,
        modelloOverride: modelloRichiesto ?? null,
      });
    },

    /**
     * ⭐ 30/8 — porta canonico `avviaLibero` (6c37f8d5), ORA COMPLETA: la
     * nota che stava qui (29/8) diceva "i permessi non sono portati su
     * questo server standalone... da riallineare quando verranno
     * portati" — quel momento è arrivato con `avviaESegui` (sopra) che
     * ora accetta davvero `permessiRichiesti`. Il cancello canonico
     * "cartellaLibera richiede il permesso Full access" torna qui,
     * VERIFICATO ANCHE QUI (non solo in custom-task.mjs): il confine che
     * conta è "questa richiesta ha dichiarato Full access?", non solo
     * "il percorso è valido?" — un client HTTP diretto non passa dal
     * frontend, quindi non basta che il frontend non offra mai quella
     * combinazione.
     *
     * @returns {{sessionId:string}|{erroreAvvio:string, code:string}}
     */
    avviaLibero({
      cartellaId, cartellaLibera, consegna, comandoProva,
      modello: modelloScelto = null, mobile = false, permessi: permessiScelto = null,
      // ⭐⭐⭐ 2/9 — vedi il commento su requireCustomTaskBody (http-app.mjs): l'id NATIVO, se il client lo manda, diventa il vero sessionId invece di uno generato qui — un solo id per la conversazione, non due mai riconciliati.
      sessionId: sessionIdRichiesto = null,
      // ⭐⭐⭐ 2/9 — picker Planner: opzionale, mai richiesto per avviare una sessione.
      modelloEsecutore: modelloEsecutoreScelto = null,
    }) {
      if (cartellaLibera && permessiScelto !== 'Full access') {
        return { erroreAvvio: 'cartellaLibera richiede il permesso "Full access" per questa sessione', code: 'QUERY_INVALID' };
      }
      /*
       * ⭐ 2/9 — ricerca fatta prima di scrivere questa riga (pattern
       * "client-supplied resource id"): un id client va sempre
       * controllato contro una collisione prima dell'uso, mai assunto
       * unico solo perché generato da un UUID casuale. sessioni è la
       * Map vera (chiusura di questo intero file) — lo stesso posto che
       * resume()/aggiornaImpostazioni() già consultano.
       */
      if (sessionIdRichiesto && sessioni.has(sessionIdRichiesto)) {
        return { erroreAvvio: 'sessionId già in uso da un\'altra sessione', code: 'QUERY_INVALID' };
      }
      let preparato;
      try {
        preparato = preparaEsecuzioneLiberaFn(cartelleProgetto, { cartellaId, cartellaLibera, consegna, comandoProva });
      } catch (errore) {
        if (errore instanceof CustomTaskError) return { erroreAvvio: errore.message, code: errore.code };
        throw errore;
      }
      return avviaESegui({
        ...(sessionIdRichiesto ? { sessionId: sessionIdRichiesto } : {}),
        taskId: cartellaLibera ? 'libero:full-access' : `libero:${cartellaId}`, cartella: preparato.cartella, task: preparato.task,
        comandoProva: preparato.comandoProva, modelloOverride: modelloScelto, mobile,
        permessiRichiesti: permessiScelto, modelloEsecutoreOverride: modelloEsecutoreScelto,
      });
    },

    /**
     * ⭐ 29/8 — porta canonico verbatim (ledger §13). Elenca gli hook
     * dichiarati dal progetto di questa sessione col loro stato di
     * fiducia VERO. `null` se la sessione non esiste; un
     * `.harness-ui-hooks.json` malformato torna `{hooks:null, errore}`
     * (mai un array vuoto che si legge come "nessun hook dichiarato").
     *
     * ⛔ Solo LISTA+FIDA: il gate pre_tool_call/post_tool_call dentro
     * il loop dell'agente (costruisciHookFn/avviaESegui nel canonico)
     * NON è portato qui — toccherebbe agent-service.mjs, ancora molto
     * più piccolo del canonico su questa copia (224 vs 499 righe).
     * Dichiarato aperto nel ledger, non nascosto: un hook fidato da
     * questo pannello è visibile e fidato, ma non blocca ancora
     * nessun tool_call reale su questo server.
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
     * ⭐ 29/8 — porta canonico verbatim (ledger §13). L'owner FIDA un
     * hook dalla UI. Rilegge `.harness-ui-hooks.json` AL MOMENTO per
     * calcolare l'hash VERO del comando attuale — fidarsi di un hash
     * passato dal client aprirebbe la finestra che il trust
     * content-hash-bound esiste per chiudere.
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
     * ⭐ 29/8 — porta canonico (ledger §18, FASE G.4): i figli VERI di
     * una sessione (delega_sottotask), non un elenco finto.
     * @returns {{ok:true, figli:Array}|{erroreAvvio:string, code:string}}
     */
    elencaFigli(sessionId) {
      if (!sessioni.get(sessionId)) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      return { ok: true, figli: subagentOrchestrator.elencaFigli(sessionId) };
    },

    /**
     * ⭐ 29/8 — porta canonico (ledger §18, FASE G): coda messaggi. Un
     * messaggio mentre la sessione è ANCORA IN CORSO non viene
     * rifiutato: entra in `voce.codaMessaggi` (FIFO), consegnato dal
     * kernel al punto giusto (codaMessaggiFn sopra). Una sessione GIÀ
     * CONCLUSA rifiuta — lì il percorso giusto è `resume()`, due
     * meccanismi per due stati diversi, mai sovrapposti.
     * @returns {{ok:true, posizione:number}|{erroreAvvio:string, code:string}}
     */
    accodaMessaggio(sessionId, testo) {
      const voce = sessioni.get(sessionId);
      if (!voce) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      /*
       * ⭐⭐⭐ 30/8 — porta canonico (1ca98143, FASE L): senza questo
       * controllo, una sessione `interrotta` (processo morto,
       * conclusa:false) accoderebbe SILENZIOSAMENTE un messaggio che
       * nessuno consumerà mai — nessun talosLavora vivo lo leggerà, mai
       * un errore, mai una consegna. Non "inventa un dato", ma promette
       * un effetto che non arriverà mai: stessa famiglia di guasto,
       * rifiutato onestamente invece che accettato a vuoto.
       */
      if (voce.interrotta) {
        return { erroreAvvio: 'Questa sessione è stata interrotta da un riavvio del server: un messaggio in coda qui non verrebbe mai consegnato. Avvia una sessione nuova.', code: 'SESSION_NOT_READY' };
      }
      if (voce.conclusa) return { erroreAvvio: 'La sessione è già conclusa: usa resume(), non la coda', code: 'SESSION_NOT_READY' };
      if (typeof testo !== 'string' || testo.trim() === '') return { erroreAvvio: 'Il messaggio in coda non può essere vuoto', code: 'QUERY_INVALID' };
      voce.codaMessaggi.push(testo);
      return { ok: true, posizione: voce.codaMessaggi.length };
    },

    /**
     * Toglie l'ULTIMO messaggio accodato (non tutta la coda: coerente con
     * un "Annulla" accanto al messaggio appena scritto, mai un
     * azzeramento che cancellerebbe messaggi più vecchi già in attesa).
     * @returns {{ok:true, rimosso:boolean}|{erroreAvvio:string, code:string}}
     */
    svuotaCoda(sessionId) {
      const voce = sessioni.get(sessionId);
      if (!voce) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      const rimosso = voce.codaMessaggi.length > 0;
      if (rimosso) voce.codaMessaggi.pop();
      return { ok: true, rimosso };
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
        // ⭐⭐⭐ 30/8 — porta canonico (1ca98143, FASE L): "ancora in corso" e "interrotta da un riavvio" non sono lo stesso stato sotto originale.conclusa===false — stessa distinzione onesta di resume().
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
        taskId: originale.taskId, cartella: originale.cartella, task: originale.task,
        comandoProva: originale.comandoProva, messaggiIniziali: originale.messaggiFinali,
        forkDa: sessionIdOrigine, mobile: originale.mobile,
        /*
         * ⛔⛔⛔ 30/8 — porta canonico (6c37f8d5), trovato da un test sul
         * canonico, non da lettura: un fork crea una VOCE NUOVA (mai
         * voceEsistente, a differenza di resume), quindi senza questa riga
         * permessiEffettivi in avviaESegui ricadeva sul default "Workspace
         * write" — un fork di una sessione "Read only" avrebbe
         * silenziosamente riacquistato la scrittura. Stesso principio già
         * in uso per `mobile` sulla riga sopra, solo dimenticato la prima
         * volta (anche sul canonico, la prima volta che l'ha scritto).
         */
        permessiRichiesti: originale.permessi,
      });
    },

    /**
     * ⭐ 30/8 — porta canonico (6c37f8d5): risolve la Promise che
     * `richiediApprovazione` (sopra) ha appeso, sbloccando il kernel che
     * sta aspettando dentro `verificaPermessoScrittura`.
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
      if (!pendente || pendente.requestId !== requestId) {
        return { erroreAvvio: 'Nessuna approvazione in attesa con questo id', code: 'QUERY_INVALID' };
      }
      voce.approvazionePendente = null;
      pendente.resolve(Boolean(approvato));
      broadcast(voce, approvalResolved({ requestId, approvato: Boolean(approvato) }));
      return { ok: true };
    },

    /**
     * ⭐⭐⭐ 30/8 — risolve la Promise che `richiediDato` (sopra) ha
     * appeso, sbloccando il tool-call del kernel (es. `notes_list`) che
     * sta aspettando il vero dato dal client. Stesso principio di
     * `rispondiApprovazione`: `requestId` deve combaciare, mai
     * risolvere alla cieca l'ultima richiesta pendente.
     *
     * `dati` viaggia SOLO dentro la Promise risolta, MAI nel broadcast
     * (`dataProvided` porta solo `errore`, mai il contenuto) — lo
     * stesso contenuto arriva al modello (e quindi al buffer/al disco
     * persistito, FASE L) SOLO tramite il normale `ToolCallResult` del
     * tool che ha chiamato `richiediDato`, non due volte.
     *
     * @returns {{ok:true}|{erroreAvvio:string, code:string}}
     */
    rispondiDato(sessionId, requestId, { dati, errore } = {}) {
      const voce = sessioni.get(sessionId);
      if (!voce) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      const pendente = voce.datoPendente;
      if (!pendente || pendente.requestId !== requestId) {
        return { erroreAvvio: 'Nessuna richiesta dati in attesa con questo id', code: 'QUERY_INVALID' };
      }
      voce.datoPendente = null;
      broadcast(voce, dataProvided({ requestId, tipo: pendente.tipo, errore: errore ?? null }));
      if (errore) pendente.reject(new Error(errore));
      else pendente.resolve(dati);
      return { ok: true };
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
     * ⛔⛔⛔ 29/8, porta canonico (3626c9bd), owner: "non riesco ad avere una
     * conversazione base col modello" — senza `nuovoMessaggioUtente`, un
     * resume rilanciava `talosLavora` sugli STESSI `messaggiFinali` che
     * avevano già prodotto "concluso": il modello si ritrovava la propria
     * ultima risposta come ultimo messaggio, senza una domanda nuova a cui
     * rispondere — non è MAI stato un vero "continua la conversazione",
     * solo bookkeeping per riprendere un giro interrotto.
     * `nuovoMessaggioUtente`, se presente, si appende a `messaggiFinali`
     * PRIMA di ripartire: è quello che rende un resume anche il
     * meccanismo di un secondo turno di chat reale (vedi submitPrompt in
     * app.js) — stesso `avviaESegui`, zero duplicazione.
     *
     * @param {string} [nuovoMessaggioUtente]
     * @returns {{sessionId:string}|{erroreAvvio:string, code:string}}
     */
    resume(sessionId, nuovoMessaggioUtente = null) {
      const voce = sessioni.get(sessionId);
      if (!voce) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      if (!voce.messaggiFinali) {
        /*
         * ⭐⭐⭐ 30/8 — porta canonico (3e03f9d3, FASE L): `voce.conclusa===false`
         * copriva DUE stati diversi sotto lo stesso messaggio: una
         * sessione VIVA che finirà a breve ("aspetta che concluda") e
         * una ricostruita da `ripristina()` il cui processo non esiste
         * più — per QUELLA, "aspetta" è una bugia: non concluderà mai
         * da sola.
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
      const messaggiIniziali = nuovoMessaggioUtente
        ? [...voce.messaggiFinali, { role: 'user', content: nuovoMessaggioUtente }]
        : voce.messaggiFinali;
      /*
       * ⛔⛔⛔ 29/8, porta canonico (0d312192), owner: "verifica che i
       * messaggi... persistano dopo il refresh" — riprodotto: il
       * RunStarted di un resume annunciava SEMPRE il `task` ORIGINALE
       * (`voce.task`), mai il nuovo messaggio. Dal vivo non si vedeva —
       * app.js mostra il follow-up in modo ottimista, PRIMA che questo
       * evento arrivi — ma un F5, che ricostruisce la chat SOLO dai
       * RunStarted replayati, mostrava il primo messaggio 3 volte e
       * perdeva i due follow-up per sempre: non esisteva NESSUN evento
       * che li rappresentasse. `talosLavora` non legge `task` quando
       * `messaggiIniziali` è già pieno (lo ignora del tutto) — cambiarlo
       * qui è sicuro, serve SOLO all'annuncio. `seguito:true` distingue
       * "questo è un secondo turno" per app.js.
       */
      const taskAnnunciato = nuovoMessaggioUtente
        ? { consegna: nuovoMessaggioUtente, progetto: voce.task?.progetto, seguito: true }
        : voce.task;
      return avviaESegui({
        sessionId, taskId: voce.taskId, cartella: voce.cartella, task: taskAnnunciato,
        comandoProva: voce.comandoProva, messaggiIniziali,
        forkDa: voce.forkDa, voceEsistente: voce,
      });
    },

    /**
     * ⭐⭐⭐ 2/9 — R2/R3 dalla review Fable: porta canonico (desktop,
     * session-registry.mjs `aggiornaImpostazioni`), ADATTATA — questa
     * voce non ha `modelloPlanner` (il piano l'aveva già escluso: "nessun
     * campo modelloPlanner" su mobile). Prima d'oggi nessuna chiamata
     * poteva cambiare permessi/modello/reasoning di una sessione già
     * avviata: il foglio Modello/Permessi cambiava solo `state.*` lato
     * client (piano §14.2.2/§14.2.3 — "cosmetico", il toast mentiva).
     *
     * Non tocca il giro IN CORSO (talosLavora legge `livelloAccesso` una
     * volta sola all'avvio, non si interrompe a metà) — vale dal
     * PROSSIMO resume/fork, stessa disciplina già dichiarata per
     * l'effort picker in app.js. La scrittura su disco precede la
     * mutazione in memoria (stesso ordine di sicurezza di FASE L): se il
     * disco fallisce, l'HTTP risponde errore e `voce` non è toccata —
     * mai uno stato in memoria che un riavvio perderebbe.
     *
     * @returns {Promise<{ok:true}|{erroreAvvio:string, code:string}>}
     */
    async aggiornaImpostazioni(sessionId, patch) {
      const voce = sessioni.get(sessionId);
      if (!voce) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      const chiaviAmmesse = new Set(['modello', 'modelloEsecutore', 'reasoning', 'permessi', 'permessiPerAttrezzo']);
      const chiavi = patch && typeof patch === 'object' && !Array.isArray(patch) ? Object.keys(patch) : [];
      if (chiavi.length === 0 || chiavi.some((chiave) => !chiaviAmmesse.has(chiave))) {
        return { erroreAvvio: 'Nessuna impostazione valida da aggiornare', code: 'QUERY_INVALID' };
      }
      if (Object.hasOwn(patch, 'modello') && patch.modello !== null && !modelloRichiestoValido(patch.modello)) {
        return { erroreAvvio: 'modello non riconosciuto', code: 'QUERY_INVALID' };
      }
      /*
       * ⭐⭐⭐ 2/9 — picker Planner: `null` è un valore VALIDO qui (torna
       * all'automatico, "ogni giro usa modello" — mai un errore), a
       * differenza di `modello` sopra che non ha un equivalente
       * "automatico". Stessa forma di validazione, stesso attrezzo.
       */
      if (Object.hasOwn(patch, 'modelloEsecutore') && patch.modelloEsecutore !== null && !modelloRichiestoValido(patch.modelloEsecutore)) {
        return { erroreAvvio: 'modelloEsecutore non riconosciuto', code: 'QUERY_INVALID' };
      }
      if (Object.hasOwn(patch, 'permessi') && !permessiRichiestaValido(patch.permessi)) {
        return { erroreAvvio: 'permessi deve essere uno fra "Read only", "Workspace write", "On request", "Full access"', code: 'QUERY_INVALID' };
      }
      const prossimo = {
        modello: Object.hasOwn(patch, 'modello') ? patch.modello : voce.modello,
        modelloEsecutore: Object.hasOwn(patch, 'modelloEsecutore') ? patch.modelloEsecutore : voce.modelloEsecutore,
        reasoning: Object.hasOwn(patch, 'reasoning') ? patch.reasoning : voce.reasoning,
        permessi: Object.hasOwn(patch, 'permessi') ? patch.permessi : voce.permessi,
        permessiPerAttrezzo: Object.hasOwn(patch, 'permessiPerAttrezzo') ? patch.permessiPerAttrezzo : voce.permessiPerAttrezzo,
      };
      if (cartellaStore) {
        try {
          await registraRigaFn({ cartellaStore, sessionId, record: { tipo: 'impostazioni-sessione', ...prossimo } });
        } catch {
          return { erroreAvvio: 'Impostazione non scritta su disco, riprova', code: 'CONFIG_INVALID' };
        }
      }
      voce.modello = prossimo.modello;
      voce.modelloEsecutore = prossimo.modelloEsecutore;
      voce.reasoning = prossimo.reasoning;
      voce.permessi = prossimo.permessi;
      voce.permessiPerAttrezzo = prossimo.permessiPerAttrezzo;
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
      if (!voce.messaggiFinali) {
        // ⭐⭐⭐ 30/8 — porta canonico (1ca98143, FASE L): stessa distinzione onesta di resume()/forka() — "ancora in corso" e "interrotta da un riavvio" non sono lo stesso stato.
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
      const risultato = await compattaSessioneFn({ messaggiFinali: voce.messaggiFinali, modello, chiave });
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
     * @returns {{ok:true}|{erroreAvvio:string, code:string}}
     */
    shell(sessionId, comando) {
      const voce = sessioni.get(sessionId);
      if (!voce) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      if (!voce.conclusa) {
        // ⭐⭐⭐ 30/8 — porta canonico (1ca98143, FASE L): stessa distinzione onesta di resume()/forka()/compatta() — "ancora in corso" e "interrotta da un riavvio" non sono lo stesso stato.
        if (voce.interrotta) {
          return { erroreAvvio: 'Questa sessione è stata interrotta da un riavvio del server: un comando diretto qui richiederebbe scrivere sopra una cronologia che non concluderà mai. Avvia una sessione nuova.', code: 'SESSION_NOT_READY' };
        }
        return { erroreAvvio: 'La sessione è ancora in corso: aspetta che concluda prima di un comando diretto', code: 'SESSION_NOT_READY' };
      }
      voce.conclusa = false;
      eseguiComandoDirettoFn({
        cartella: voce.cartella, comando, mobile: voce.mobile, onEvento: (evento) => broadcast(voce, evento),
      }).catch((errore) => {
        if (!voce.conclusa) {
          broadcast(voce, { type: 'RunError', message: errore instanceof Error ? errore.message : String(errore), code: 'internal-error' });
        }
      });
      return { ok: true };
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
     * ⭐⭐⭐ 29/8 — porta canonico (ea623891, ledger §27-bis), owner: "non
     * ha nessun'opzione per rinominare i file, per aprire i file, per
     * aprirli nel visualizza file explorer di Windows. Non ha opzioni
     * per eliminarlo" — quattro azioni sul singolo file dell'albero,
     * stesso schema di `albero()` sopra: risolve `sessionId` a
     * `voce.cartella` qui, la validazione del PERCORSO vive tutta in
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
     * ⭐⭐⭐ 29/8 — porta canonico (46940ae4, ledger §27-bis), owner:
     * "nella lista files devo poter draggare i file... non esiste il
     * comando copia... e comandi crud in generale" — stesso schema
     * delle quattro azioni sopra: risolve sessionId a voce.cartella, la
     * validazione vive tutta in workspace-files.mjs.
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
     * ⛔⛔⛔ 29/8, porta canonico (3626c9bd), owner: "ricevo risposte
     * duplicate", poi ricerca web (SSE reconnection best practice): la
     * prima cura (`_sequenza` nel payload, dedup lato client) FUNZIONA ma
     * è un doppione fatto in casa di un meccanismo che SSE ha già —
     * `Last-Event-ID`. Senza, ogni riconnessione (frequente su mobile:
     * schermo spento, handoff wifi↔dati) ritrasmetteva l'INTERO buffer via
     * rete, sprecando banda esattamente dove è più preziosa — solo il
     * rendering veniva scartato, non il traffico. `daSequenza`, se
     * presente, salta ogni evento con `_sequenza <= daSequenza`: replay
     * più corto, stessa correttezza. `_sequenza` lato client resta — un
     * client che non manda `Last-Event-ID` (fetch manuale, un test) è
     * comunque protetto.
     *
     * ⛔⛔⛔ 30/8, porta canonico (432eec09) — bug reale, trovato dal vivo sul
     * desktop (non da un test — misurato con un client Node.js grezzo,
     * tenuto aperto, per escludere Chrome/EventSource): questa funzione non
     * registrava mai `ascoltatore` in `voce.ascoltatori` per una sessione
     * già `conclusa` — corretto quando fu scritta, perché ALLORA
     * `http-app.mjs` chiudeva comunque lo stream subito dopo per lo stesso
     * motivo. Rimosso quel chiudi-da-solo (vedi la doc sulla rotta
     * `/events`): un client connesso a una sessione già finita riceveva il
     * replay e poi MAI PIÙ NIENTE, silenziosamente — la connessione restava
     * aperta ma `ascoltatori` non la conteneva mai. Ora si iscrive SEMPRE:
     * `conclusa` dice se il GIRO è finito, non se la SESSIONE ha smesso di
     * generare eventi (una coda accodata dopo la fine, un fork successivo,
     * o — su mobile — la stessa istanza di pagina che riapre una sessione
     * storica con `riprendiSessioneDalHost()` restano casi reali).
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
      return () => voce.ascoltatori.delete(ascoltatore);
    },

    ferma(sessionId) {
      const voce = sessioni.get(sessionId);
      if (!voce) return false;
      voce.controller.abort();
      return true;
    },

    /**
     * ⭐ Piano §1.3 — un nome scelto dall'owner, persistito, cosa che il
     * mockup NON faceva: rinominava solo `state.session` nel browser, un
     * valore che qualunque ricostruzione della sidebar (nuova sessione,
     * resume, un giro di aggiornaElencoSessioniReali) sovrascriveva in
     * silenzio con `taskId`. Qui vive sulla VOCE del registro: sopravvive a
     * ogni ricostruzione, finché il server resta acceso.
     *
     * @returns {{ok:true}|{erroreAvvio:string, code:string}}
     */
    rinomina(sessionId, nome) {
      const voce = sessioni.get(sessionId);
      if (!voce) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      const pulito = typeof nome === 'string' ? nome.trim() : '';
      if (pulito.length === 0 || pulito.length > 80) {
        return { erroreAvvio: 'Nome non valido: serve 1-80 caratteri', code: 'QUERY_INVALID' };
      }
      voce.nome = pulito;
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
          conclusa: voce.conclusa,
          forkDa: voce.forkDa,
          // ⭐⭐⭐ 30/8 — porta canonico (3e03f9d3, FASE L): true SOLO per una voce ricostruita dopo un riavvio il cui ultimo evento non era RunFinished/RunError — il processo che la eseguiva è sparito, mai un turno "ancora in corso" travestito da tale.
          interrotta: voce.interrotta ?? false,
          // ⭐⭐⭐ 2/9 — piano §16.1 (owner: "stato vivo nella lista sessioni,
          // come Claude Code"). `messaggiFinali` è la conversazione
          // STRUTTURATA (§K, riusata anche da resume()/compatta()) — la
          // stessa fonte già fidata altrove in questo file, non una nuova.
          // `null` finché il PRIMO giro non è concluso (mai un'anteprima
          // per un turno ancora in corso: lo spinner lato client copre
          // quel caso, un'anteprima vecchia lì sarebbe disonesta).
          ultimoMessaggio: ultimoMessaggioTesto(voce.messaggiFinali),
          // ⭐⭐⭐ 2/9 — stessi due campi del desktop (session-registry.mjs:2504),
          // stessa fonte (`voce.approvazionePendente`/`voce.eventi` esistono
          // già qui, non aggiunti per l'occasione).
          inAttesaApprovazione: Boolean(voce.approvazionePendente),
          ultimoEsito: ultimoEsitoDaEventi(voce.eventi),
        }))
        .sort((a, b) => b.avviataAlle.localeCompare(a.avviataAlle));
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
        forkDa: voce.forkDa,
        eventi: voce.eventi,
      };
    },
  });
}
