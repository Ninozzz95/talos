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
import { fileURLToPath } from 'node:url';

import {
  avviaSessione as avviaSessioneReale,
  compattaSessione as compattaSessioneReale,
  eseguiComandoDiretto as eseguiComandoDirettoReale,
} from './agent-service.mjs';
import {
  approvalRequested, approvalResolved, hookInvoked, queuedMessageDelivered, workspaceChanged,
  runRedirectApplied, runRedirectCancelled, runRedirectFailed, runRedirectRequested,
  runStarted, runFinished, runError, textMessageStart, textMessageContent, textMessageEnd,
  reasoningMessageStart, reasoningMessageContent, reasoningMessageEnd, toolCallStart, toolCallArgs,
} from './agui-events.mjs';
import { CustomTaskError, preparaEsecuzioneLibera as preparaEsecuzioneLiberaReale } from './custom-task.mjs';
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
import { guardaWorkspace as guardaWorkspaceReale } from './workspace-watcher.mjs';
import { analizzaEvidenzaDelega, creaSubagentOrchestrator, esitoDelegaDaEventi } from './subagent-orchestrator.mjs';
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
import {
  elencaVoci as elencaVociReale, leggiVoce as leggiVoceLibreriaReale, salvaVoce as salvaVoceLibreriaReale,
  eliminaVoce as eliminaVoceLibreriaReale, LibraryStoreError,
} from './library-store.mjs';
import { elencaNote as elencaNoteReale, NoteStoreError } from './notes-store.mjs';
import { elencaAttivita as elencaAttivitaReale, TaskStoreError } from './tasks-store.mjs';
import { elencaMemorie as elencaMemorieReale, MemoryStoreError } from './memory-store.mjs';
import {
  creaRicerca as creaRicercaReale, leggiRicerca as leggiRicercaReale, aggiornaRicerca as aggiornaRicercaReale,
  eliminaRicerca as eliminaRicercaReale, elencaRicerche as elencaRicercheReale, ResearchStoreError,
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

class LocalRuntimeSessionError extends Error {
  constructor(message, code = 'LOCAL_RUNTIME_FAILED') {
    super(message);
    this.name = 'LocalRuntimeSessionError';
    this.code = code;
  }
}

export function createSessionRegistry({
  avviaSessioneFn = avviaSessioneReale,
  preparaEsecuzioneFn,
  taskCatalogProvider = null,
  preparaEsecuzioneLiberaFn = preparaEsecuzioneLiberaReale,
  resolveWorkspaceLaunchFn = null,
  consumeWorkspaceLaunchFn = null,
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
  salvaVoceLibreriaFn = salvaVoceLibreriaReale, leggiVoceLibreriaFn = leggiVoceLibreriaReale, eliminaVoceLibreriaFn = eliminaVoceLibreriaReale,
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
    'tool_create',
  ],
  ricercaWeb,
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
} = {}) {
  const preparaTask = preparaEsecuzioneFn ?? ((taskId) => preparaEsecuzioneReale(taskId, taskCatalogProvider));
  const sessioni = new Map();
  let ultimoRipristino = { ripristinate: 0, totali: 0 };
  let sessioniCorrotte = [];
  // ⭐⭐⭐ FASE C (28/8) — istanziato qui: `avviaESegui` è una function declaration (issata), riferibile prima della sua definizione testuale più sotto.
  const subagentOrchestrator = creaSubagentOrchestrator({ sessioni, avviaESeguiFn: avviaESegui });
  /*
   * ⭐⭐⭐ FASE N, ottavo sistema (30/8) — Deep Research. Stesso principio
   * di subagentOrchestrator appena sopra: `avviaESegui` issata, `sessioni`
   * la STESSA Map — nessun secondo registro nascosto.
   */
  const researchOrchestrator = creaResearchOrchestrator({
    sessioni, avviaESeguiFn: avviaESegui,
    creaRicercaFn, leggiRicercaFn, aggiornaRicercaFn, eliminaRicercaFn, elencaRicercheFn,
    salvaVoceLibreriaFn, leggiVoceLibreriaFn, eliminaVoceLibreriaFn, randomUUIDFn,
  });

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
   * perché è già una somma cumulativa — l'ULTIMO che compare nella storia
   * di una sessione è il totale finale. Quella storia è GIÀ persistita per
   * intero (ogni evento passa da `broadcast`, che scrive su
   * `.sessions-store/`) — un secondo campo mutabile scritto a parte
   * duplicherebbe una fonte di verità già esistente, stessa disciplina di
   * `conclusa`/`messaggiFinali` derivati da `ripristina()` sopra, non
   * salvati come flag a sé. Funziona identica per una sessione VIVA
   * (`voce.eventi` popolato da `broadcast`) e una RIPRISTINATA
   * (`voce.eventi` popolato da `ripristina()` dallo stesso JSONL).
   * @returns {{prompt_tokens:number,completion_tokens:number,cached_tokens:number,giri:number}|null}
   */
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
      if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string' || content.trim() === '') return;
      const messaggio = { role, content };
      const ultimo = messaggi.at(-1);
      if (ultimo?.role === messaggio.role && ultimo.content === messaggio.content) return;
      messaggi.push(messaggio);
    };
    // Gli eventi legacy di test/primi build non portavano ancora `input` nel
    // RunStarted: l'intestazione conserva comunque il prompt originale e
    // deve precedere qualunque risposta assistant completa.
    aggiungi('user', voce.task?.consegna ?? voce.task?.consegnaCorta);
    for (const evento of voce.eventi ?? []) {
      if (evento?.type === 'RunStarted') {
        if (Array.isArray(evento.input)) {
          const canonici = evento.input
            .filter((item) => item && (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string' && item.content.trim() !== '')
            .map((item) => ({ role: item.role, content: item.content }));
          if (canonici.length > 0) messaggi = canonici;
        } else {
          aggiungi('user', evento.input?.consegna ?? evento.input?.consegnaCorta);
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

  /**
   * Il nuovo input utente è ammesso alla sessione PRIMA della chiamata al
   * modello. Ha quindi un record durevole proprio, distinto da
   * `messaggi-finali`: un crash dopo questa append non può perdere il testo,
   * ma non può neppure travestire un giro incompleto da output concluso.
   */
  function persistiCheckpointRipresa(voce, messaggi, versioneGiro) {
    if (!cartellaStore || !voce.sessionId) return;
    registraRigaSyncFn({
      cartellaStore,
      sessionId: voce.sessionId,
      record: { tipo: 'checkpoint-ripresa', versioneGiro, messaggi },
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

  function broadcast(voce, evento) {
    evento._sequenza = (voce.prossimaSequenza = (voce.prossimaSequenza ?? 0) + 1);
    /*
     * ⛔⛔⛔ 02/09 — review complessiva. WorkspaceChanged è STATO del
     * filesystem, non storia della sessione: la sessione e572474a (workspace
     * = Desktop intero) ne aveva 490 su 756 eventi, 355 DOPO la fine del
     * giro, 1,9 MB di log di cui il 79% percorsi di altre lane e test,
     * rigiocati per intero (1,6 MB) a ogni apertura. Ricerca 02/09 (Claude
     * Code, Hermes, Cline, VS Code): nessuno persiste gli eventi del watcher
     * nella storia. Qui: consegnato a chi è connesso ADESSO (il tree si
     * aggiorna dal vivo, contratto invariato), MAI in voce.eventi né su disco
     * — il client svuota comunque la cache dell'albero a ogni nuova
     * generazione, quindi un WorkspaceChanged storico non aveva niente da
     * dire. `_sequenza` avanza lo stesso: Last-Event-ID resta monotono.
     */
    const effimero = evento.type === 'WorkspaceChanged';
    if (!effimero) voce.eventi.push(evento);
    for (const ascoltatore of voce.ascoltatori) ascoltatore(evento);
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
    permessiRichiesti = null, permessiPerAttrezzoRichiesti = null,
    provider = 'cloud', runtimeId = null, modelId = null, fallbackConsent = false,
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
      eventi: [], ascoltatori: new Set(), taskId, cartella, task, comandoProva, forkDa,
      avviataAlle: clock().toISOString(), messaggiFinali: null, modello: modelloEffettivo,
      modelloPlanner: modelloPlannerEffettivo,
      reasoning: reasoningEffettivo, mobile, permessi: permessiEffettivi,
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
    const messaggiPrimaDelGiro = Array.isArray(messaggiIniziali)
      ? messaggiIniziali
      : (Array.isArray(voce.messaggiFinali) ? voce.messaggiFinali : null);
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
            tipo: 'intestazione', sessionId, taskId, cartella, task, comandoProva, forkDa,
            avviataAlle: voce.avviataAlle, modello: voce.modello, modelloPlanner: voce.modelloPlanner,
            reasoning: voce.reasoning, mobile: voce.mobile, permessi: voce.permessi,
            permessiPerAttrezzo: voce.permessiPerAttrezzo, padreId: voce.padreId, profonditaDelega: voce.profonditaDelega,
            provider: voce.provider, runtimeId: voce.runtimeId, modelId: voce.modelId, fallbackConsent: voce.fallbackConsent,
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
    attivaWatcherSessione(voce, cartella);
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
    const livelloAccesso = voce.permessi === 'Read only' ? 'lettura' : undefined;
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
    const chiediApprovazioneFn = voce.permessi === 'On request'
      ? (azione) => richiediApprovazione(voce, azione)
      : undefined;
    // ⭐⭐⭐ FASE A (hook) — sempre costruito, sincrono: costruisciHookFn
    // rimanda il vero lavoro (I/O) alla prima tool-call, vedi la sua doc.
    const hookFn = costruisciHookFn(voce);
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
      const testo = voce.codaMessaggi.shift();
      if (testo == null) return null;
      broadcast(voce, queuedMessageDelivered({ testo }));
      return testo;
    };

    /*
     * ⭐⭐⭐ FASE N, ottavo sistema (30/8) — Deep Research: 8 thin delegate
     * verso researchOrchestrator, stesso principio di onDelega verso
     * subagentOrchestrator.delegaSottoTask un blocco sopra. `cartella`
     * qui è quella di QUESTA sessione (il padre che avvia/gestisce la
     * ricerca) — la ricerca gira nella STESSA cartella, mai un
     * workspace dedicato (vedi la doc di research-orchestrator.mjs).
     */
    const onRicercaLista = (argomenti) => researchOrchestrator.elenca({ cartella, ...argomenti });
    const onRicercaAvvia = (argomenti) => researchOrchestrator.avvia({ cartella, question: argomenti?.question, depth: argomenti?.depth });
    const onRicercaLeggi = (argomenti) => researchOrchestrator.leggi({ cartella, id: argomenti?.id });
    const onRicercaRinomina = (argomenti) => researchOrchestrator.rinomina({ cartella, id: argomenti?.id, title: argomenti?.title ?? null });
    const onRicercaPausa = (argomenti) => researchOrchestrator.mettiInPausa({ id: argomenti?.id });
    const onRicercaRiprendi = (argomenti) => researchOrchestrator.riprendi({ id: argomenti?.id });
    const onRicercaAnnulla = (argomenti) => researchOrchestrator.annulla({ id: argomenti?.id });
    const onRicercaElimina = (argomenti) => researchOrchestrator.elimina({ cartella, id: argomenti?.id });

    const cloudOptions = {
      cartella, task, modello: modelloEffettivo, chiave: chiaveEffettiva, comandoProva, messaggiIniziali,
      reasoning: reasoningEffettivo ?? undefined,
      segnaleStop: controller.signal,
      mobile: voce.mobile,
      strumentiEstesi, ricercaWeb, firma, immagine, persistGeneratedImageFn, removeGeneratedImageFn,
      // ⭐⭐⭐ FASE K (29/8) — `?? undefined`: `voce.modelloPlanner` è `null` per una sessione senza planner (mai passato a talosLavoraFn come `null`, che il kernel tratterebbe diversamente da "assente" in un controllo `typeof`).
      modelloPlanner: voce.modelloPlanner ?? undefined,
      livelloAccesso, chiediApprovazioneFn, hookFn,
      permessiPerAttrezzo: voce.permessiPerAttrezzo,
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
      // ⭐⭐⭐⭐ FASE N, nono e ultimo sistema (30/8) — Tool Forge, GLOBALE come cartellaMemoria: agent-service.mjs costruisce onForgeCrea/toolForge/eseguiToolForgeFn da qui.
      cartellaForge,
      onEvento: (evento) => broadcast(voce, evento),
    };
    const esecuzione = providerEffettivo === 'local'
      ? eseguiRuntimeLocale({ voce, task, messaggiIniziali, runtimeId: runtimeIdEffettivo, modelId: voce.modelId, reasoning: reasoningEffettivo, sessionId })
        .catch((errore) => {
          if (voce.controller.signal.aborted || fallbackConsentEffettivo !== true || typeof chiaveEffettiva !== 'string' || chiaveEffettiva.length === 0) throw errore;
          voce.fallbackProvider = 'openrouter';
          broadcast(voce, { type: 'RuntimeFallback', from: 'local', to: 'openrouter', reason: errore?.code || 'LOCAL_RUNTIME_FAILED', provider: 'local', runtimeId: runtimeIdEffettivo, modelId: voce.modelId, backend: runtimeIdEffettivo, at: clock().toISOString() });
          return avviaSessioneFn(cloudOptions);
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
       * mai un crash: lo stesso limite che Codex stesso dichiara
       * ("no resumable artefacts may be written" se il crash arriva
       * troppo presto) — qui capita solo se il turno NON è mai arrivato
       * a questo punto, prima che questo file venisse scritto su disco.
       */
      persistiMessaggiFinali(voce, versioneGiro);
      // ⭐⭐⭐ FASE C (28/8) — per il foglio "Albero sessione": lo stato reale di OGNI sessione che conclude, non solo delle figlie (inerte/ignorato per una sessione senza padre).
      voce.esitoDelega = risultato?.esito?.comeFinita ?? (risultato?.ok === false ? 'fallito' : null);
      const redirect = voce.reindirizzamentoPendente;
      if (redirect) {
        voce.reindirizzamentoPendente = null;
        const haCronologiaCanonica = Array.isArray(voce.messaggiFinali);
        const messaggiInizialiRedirect = haCronologiaCanonica
          ? [...voce.messaggiFinali, { role: 'user', content: redirect.testo }]
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
        broadcast(voce, runRedirectApplied({ redirectId: redirect.redirectId, testo: redirect.testo }));
        const ripartenza = avviaESegui({
          sessionId,
          taskId: voce.taskId,
          cartella: voce.cartella,
          task: {
            consegna: consegnaRedirect,
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
      onConclusioneFn?.({ ok: false, esito: null, erroreInterno: errore instanceof Error ? errore.message : String(errore) });
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

  return Object.freeze({
    /**
     * ⭐⭐⭐ FASE L (30/8) — chiamata UNA volta da `server.mjs`, prima di
     * accettare richieste: legge `.sessions-store/`, ricostruisce una
     * voce PER OGNI sessione persistita che questo processo non ha
     * ancora in memoria (un avvio pulito non ne ha mai). Una sessione
     * il cui ultimo evento non è `RunFinished`/`RunError` è
     * `interrotta:true` — onestamente: il processo che la eseguiva è
     * sparito, nessun turno può "riprendere da dove stava" (lo stesso
     * limite che Codex stesso dichiara: il ripristino è una rilettura
     * della trascrizione, mai la resurrezione di uno stato in memoria).
     * Una voce corrotta (JSON illeggibile oltre l'ultima riga, vedi
     * `session-store.mjs`) NON blocca le altre — loggata e saltata.
     * @returns {Promise<{ripristinate:number, totali:number}>}
     */
    async ripristina() {
      if (!cartellaStore) {
        ultimoRipristino = { ripristinate: 0, totali: 0 };
        sessioniCorrotte = [];
        return ultimoRipristino;
      } // nessuna persistenza configurata: mai un tentativo di leggere un percorso che non c'è
      const id = await elencaSessioniPersistiteFn({ cartellaStore });
      let ripristinate = 0;
      const corrotte = [];
      for (const sessionId of id) {
        if (sessioni.has(sessionId)) continue; // già viva in questo processo: mai sovrascrivere
        let record;
        try {
          record = await leggiRegistroFn({ cartellaStore, sessionId });
        } catch (errore) {
          console.error(`[session-store] sessione ${sessionId} non ripristinata:`, errore instanceof Error ? errore.message : errore);
          if (errore?.code === 'SESSION_STORE_CORRUPT') corrotte.push(sessionId);
          continue;
        }
        if (!record || record.length === 0) continue;
        const intestazione = record.find((r) => r.tipo === 'intestazione');
        if (!intestazione) continue; // senza intestazione non c'è abbastanza per una voce onesta
        // ⛔ `type` (AG-UI, PascalCase) contro `tipo` (i record di questo file, italiano): due nomi di campo DIVERSI apposta, mai un'ambiguità nel distinguerli nello stesso file.
        // ⛔ 02/09 — i file scritti PRIMA di oggi contengono WorkspaceChanged (vedi broadcast()): stato del filesystem, non storia — si scartano al ripristino, così anche i log vecchi tornano leggeri senza riscriverli.
        const eventiFisici = record.filter((r) => typeof r.type === 'string' && r.type !== 'WorkspaceChanged');
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
        const voce = {
          eventi, ascoltatori: new Set(), taskId: intestazione.taskId, cartella: intestazione.cartella, task: intestazione.task,
          comandoProva: intestazione.comandoProva, forkDa: intestazione.forkDa,
          avviataAlle: intestazione.avviataAlle, messaggiFinali: messaggiFinaliRecord?.messaggiFinali ?? null,
          messaggiPendente: Array.isArray(checkpointRecord?.messaggi) ? checkpointRecord.messaggi : null,
          modello: impostazioni.modello, modelloPlanner: impostazioni.modelloPlanner, reasoning: impostazioni.reasoning,
          mobile: intestazione.mobile, permessi: impostazioni.permessi, permessiPerAttrezzo: impostazioni.permessiPerAttrezzo,
          provider: intestazione.provider ?? 'cloud', runtimeId: intestazione.runtimeId ?? null,
          modelId: impostazioni.modelId ?? impostazioni.modello ?? null, fallbackConsent: intestazione.fallbackConsent === true,
          approvazionePendente: null, reindirizzamentoPendente: null, redirectAnnullati: new Set(), padreId: intestazione.padreId, profonditaDelega: intestazione.profonditaDelega,
          esitoDelega: intestazione.padreId ? esitoDelegaDaEventi(eventi, { task: intestazione.task }) : null,
          evidenzaDelega: intestazione.padreId ? analizzaEvidenzaDelega(eventi) : null,
          codaMessaggi: [], sessionId, controller: new AbortController(),
          conclusa, ripristinata: true, interrotta: !conclusa,
          prossimaSequenza: ultimaSequenza, versioneGiro,
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
      ultimoRipristino = { ripristinate, totali: id.length };
      sessioniCorrotte = corrotte;
      return ultimoRipristino;
    },

    /** Stato di sola lettura dell'ultimo ripristino: non modifica né elimina i registri danneggiati. */
    statoPersistenza() {
      return { corrotte: [...sessioniCorrotte], ultimaLettura: { ...ultimoRipristino } };
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
    accodaMessaggio(sessionId, testo) {
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
     * @returns {{sessionId:string}|{erroreAvvio:string, code:string}} — mai
     * un throw: un id fuori allowlist o una chiave assente sono risposte
     * attese di un endpoint HTTP, non un guasto del registro.
     *
     * ⛔ `permessiScelto:'Full access'` qui è accettato ma INERTE: la
     * cartella di un task del corpus è SEMPRE la copia usa-e-getta di
     * `task-catalog.mjs`, mai scelta dall'owner — "Full access" ha senso
     * solo dove esiste un percorso a piacere da scegliere (`avviaLibero`,
     * sotto). Nessun errore: solo si comporta come "Workspace write".
     */
    avvia(taskId, {
      modelloScelto = null, modelloPlannerScelto = null, reasoningScelto = null, mobile = false,
      permessiScelto = null, permessiPerAttrezzoScelto = null,
      provider = 'cloud', runtimeId = null, modelId = null, fallbackConsent = false,
    } = {}) {
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
        provider, runtimeId, modelId, fallbackConsent,
      });
    },

    /**
     * ⭐⭐⭐ 27/8, owner: "per adesso un allowlist per testare... come se
     * fosse Claude Code". Stesso schema di `avvia()`, ma su una cartella
     * dell'allowlist (`config.cartelleProgetto`) invece di un id del
     * corpus benchmark — scrive DIRETTAMENTE sul progetto vero, nessuna
     * copia usa-e-getta (vedi la doc di `custom-task.mjs` sul perché).
     *
     * ⭐⭐⭐ 28/8 — `cartellaLibera` (piano elegant-spinning-dongarra.md,
     * permesso "Full access") sostituisce `cartellaId` — MUTUAMENTE
     * ESCLUSIVI, verificato QUI, non solo in `custom-task.mjs`, perché il
     * confine che conta è "questa richiesta HTTP ha dichiarato Full
     * access?", non "il percorso è valido?" (quello è già garantito da
     * `custom-task.mjs`, questo è un secondo cancello: mai un percorso
     * a piacere accettato con un permesso diverso da Full access, ANCHE
     * SE il frontend non dovesse mai offrire quella combinazione — un
     * client HTTP diretto non passa dal frontend).
     */
    avviaLibero({
      cartellaId, cartellaLibera, workspaceLaunchId, consegna, comandoProva,
      modello: modelloScelto = null, modelloPlanner: modelloPlannerScelto = null, reasoning: reasoningScelto = null, mobile = false,
      permessi: permessiScelto = null, permessiPerAttrezzo: permessiPerAttrezzoScelto = null,
    }) {
      const scelteWorkspace = [cartellaId, cartellaLibera, workspaceLaunchId].filter((value) => typeof value === 'string' && value.length > 0);
      if (scelteWorkspace.length !== 1) {
        return { erroreAvvio: 'Serve una sola cartella per questa sessione', code: 'QUERY_INVALID' };
      }
      if (cartellaLibera && permessiScelto !== 'Full access') {
        return { erroreAvvio: 'cartellaLibera richiede il permesso "Full access" per questa sessione', code: 'QUERY_INVALID' };
      }
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
      const risultato = avviaESegui({
        taskId: workspaceLaunchId ? 'libero:workspace-launch' : (cartellaLibera ? 'libero:full-access' : `libero:${cartellaId}`), cartella: preparato.cartella, task: preparato.task,
        comandoProva: preparato.comandoProva, modelloRichiesta: modelloScelto, modelloPlannerRichiesta: modelloPlannerScelto, reasoningRichiesto: reasoningScelto, mobile,
        permessiRichiesti: permessiScelto, permessiPerAttrezzoRichiesti: permessiPerAttrezzoScelto,
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
        taskId: originale.taskId, cartella: originale.cartella, task: originale.task,
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
    resume(sessionId, nuovoMessaggioUtente = null) {
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
      const messaggiIniziali = nuovoMessaggioUtente
        ? [...storiaRiprendibile, { role: 'user', content: nuovoMessaggioUtente }]
        : storiaRiprendibile;
      const prossimaVersioneGiro = (voce.versioneGiro ?? 0) + 1;
      if (haNuovoMessaggio) {
        try {
          persistiCheckpointRipresa(voce, messaggiIniziali, prossimaVersioneGiro);
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
        ? { consegna: nuovoMessaggioUtente, progetto: voce.task?.progetto, seguito: true }
        : voce.task;
      return avviaESegui({
        sessionId, taskId: voce.taskId, cartella: voce.cartella, task: taskAnnunciato,
        comandoProva: voce.comandoProva, messaggiIniziali,
        forkDa: voce.forkDa, voceEsistente: voce,
        versioneGiroRichiesta: prossimaVersioneGiro,
      });
    },

    /**
     * Aggiorna il contratto durevole di una sessione già esistente. La
     * scrittura append-only precede la mutazione in memoria: se il disco
     * fallisce, il processo non espone uno stato che un reload perderebbe.
     */
    async aggiornaImpostazioni(sessionId, patch) {
      const voce = sessioni.get(sessionId);
      if (!voce) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      const chiaviAmmesse = new Set(['modello', 'modelloPlanner', 'reasoning', 'permessi', 'permessiPerAttrezzo']);
      const chiavi = patch && typeof patch === 'object' && !Array.isArray(patch) ? Object.keys(patch) : [];
      if (chiavi.length === 0 || chiavi.some((chiave) => !chiaviAmmesse.has(chiave))) {
        return { erroreAvvio: 'Nessuna impostazione valida da aggiornare', code: 'QUERY_INVALID' };
      }

      const prossimo = {
        modello: Object.hasOwn(patch, 'modello') ? patch.modello : voce.modello,
        modelloPlanner: Object.hasOwn(patch, 'modelloPlanner') ? patch.modelloPlanner : voce.modelloPlanner,
        reasoning: Object.hasOwn(patch, 'reasoning') ? patch.reasoning : voce.reasoning,
        permessi: Object.hasOwn(patch, 'permessi') ? patch.permessi : voce.permessi,
        permessiPerAttrezzo: Object.hasOwn(patch, 'permessiPerAttrezzo') ? patch.permessiPerAttrezzo : voce.permessiPerAttrezzo,
      };
      const modelId = voce.provider === 'cloud' && Object.hasOwn(patch, 'modello')
        ? prossimo.modello
        : voce.modelId;
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
      voce.modelloPlanner = prossimo.modelloPlanner;
      voce.reasoning = prossimo.reasoning;
      voce.permessi = prossimo.permessi;
      voce.permessiPerAttrezzo = prossimo.permessiPerAttrezzo;
      voce.modelId = modelId;
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
        voci = await elencaVociRegistroFn({ cartella: voce.cartella });
      } catch (errore) {
        if (errore instanceof LibraryStoreError) return { ok: true, voci: null, errore: errore.message };
        throw errore;
      }
      return {
        ok: true,
        voci: voci.map((v) => ({ id: v.id, nome: v.nome, fileType: v.fileType, origine: v.origine, aggiornatoIl: v.aggiornatoIl })),
        errore: null,
      };
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
      return { ok: true, ricerche: esito.ricerche, errore: null };
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
         * un pattern scanner non è un confine di sicurezza vero, anche
         * per Hermes stesso). Scansiona OGNI comando dichiarato (tool +
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
    shell(sessionId, comando) {
      const voce = sessioni.get(sessionId);
      if (!voce) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      if (!voce.conclusa) {
        // ⭐⭐⭐ FASE L (30/8) — stessa distinzione onesta di resume()/forka()/compatta(): "ancora in corso" e "interrotta da un riavvio" non sono lo stesso stato.
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
      if (!pendente || pendente.requestId !== requestId) {
        return { erroreAvvio: 'Nessuna approvazione in attesa con questo id', code: 'QUERY_INVALID' };
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
    reindirizza(sessionId, testo, { redirectId: redirectIdRichiesto = null } = {}) {
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
      voce.reindirizzamentoPendente = { redirectId, testo: pulito };
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
          conclusa: voce.conclusa,
          forkDa: voce.forkDa,
          modello: voce.modello ?? null,
          modelloPlanner: voce.modelloPlanner ?? null,
          reasoning: voce.reasoning ?? null,
          permessi: voce.permessi ?? 'Workspace write',
          permessiPerAttrezzo: voce.permessiPerAttrezzo ?? null,
          provider: voce.provider ?? 'cloud', runtimeId: voce.runtimeId ?? null, modelId: voce.modelId ?? voce.modello ?? null,
          fallbackProvider: voce.fallbackProvider ?? null,
          // ⭐⭐⭐ FASE L (30/8) — true SOLO per una voce ricostruita dopo un riavvio il cui ultimo evento non era RunFinished/RunError: il processo che la eseguiva è sparito, mai un turno "ancora in corso" travestito da tale.
          interrotta: voce.interrotta ?? false,
          // ⭐⭐⭐ 02/09 — la campanella del desktop: una sessione ferma su un'approvazione è la notifica più urgente, e solo l'elenco la può dire a chi guarda un'ALTRA sessione.
          inAttesaApprovazione: Boolean(voce.approvazionePendente),
          // ⭐⭐⭐ 30/8 — piano "Board — da campagne TALOS-BANCO a cruscotto
          // sessioni": il costo/consumo per la nuova Board, MAI un numero
          // inventato. Nessuna scrittura nuova sul disco (vedi usageDaEventi
          // sotto sul perché) — una sessione registrata PRIMA di questo
          // cambiamento (o senza mai un giro con `usage`, es. un errore
          // immediato) torna onestamente `null`, mai uno zero fabbricato.
          usage: usageDaEventi(voce.eventi),
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
        forkDa: voce.forkDa,
        modello: voce.modello ?? null,
        eventi: voce.eventi,
      };
    },
  });
}
