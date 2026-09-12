/**
 * agent-service.mjs — espone `talosLavora` (AVM-harness) come servizio per
 * Harness UI. Piano `elegant-spinning-dongarra.md`, FASE 1, §1.2.
 *
 * ⛔⛔⛔ 02/09 — CORRETTO, questo commento era rimasto FALSO per due giorni.
 * Descriveva un import relativo diretto verso `talosHarness.mjs` come
 * cartella sorella — dal commit `16677c48` (31/8) quell'import non esiste
 * più: `talosLavora` (riga 104 sotto) passa per `createOwnerRuntimeAdapter()`
 * (`runtime-owner-adapter.mjs`), che carica il kernel SOLO se
 * `TALOS_OWNER_RUNTIME_MODULE` è impostata a un percorso assoluto —
 * altrimenti lancia `OwnerRuntimeUnavailableError` su OGNI giro, nuovo o
 * ripreso. La cartella sorella (`AVM-harness/mobile/scripts/harness-talos/
 * talosHarness.mjs`, verificata il 24/8 e ancora vera oggi) resta il valore
 * giusto da passare in quella variabile — ma va DICHIARATA a chi avvia il
 * server, non più assunta dal codice. Il server è rimasto acceso per due
 * giorni con la copia PRECEDENTE (senza questo requisito) finché un riavvio
 * il 02/09 non ha esposto il buco: ogni sessione, nuova o ripresa,
 * rispondeva "Il runtime agente non è configurato per questa
 * installazione." Vedi `.claude/LEDGER-RUNTIME-OWNER-MODULE-2026-09-02.md`.
 *
 * ⛔ `talosLavora` non sa niente di AG-UI: riporta dati grezzi (`onGiro`,
 * `onScrittura`) tramite i quattro parametri opzionali aggiunti in
 * AVM-harness (piano §1.2, stesso giorno). Questo file è il SOLO punto dove
 * quei dati grezzi diventano eventi AG-UI (agui-events.mjs) — la separazione
 * è deliberata: talosLavora resta provabile senza sapere di HTTP/SSE, e
 * agui-events.mjs resta provabile senza sapere di talosLavora.
 */
import { createHash, randomUUID } from 'node:crypto';
import { join as joinPercorso, relative as percorsoRelativo, sep as separatorePercorso } from 'node:path';

import { createOwnerRuntimeAdapter } from './runtime-owner-adapter.mjs';
import { salvaArtefatto as salvaArtefattoReale } from './artifact-store.mjs';
import { salvaVoce as salvaVoceLibreriaReale } from './library-store.mjs'; // 06/9: un artefatto e' lavoro, e il lavoro si ritrova
import { generateTalosDocument as generateTalosDocumentReale, TALOS_SOURCE_TEXT_FORMATS, verifyTalosDocument as verifyTalosDocumentReale } from './document-generator.mjs';
import { generaImmagineOpenRouter as generaImmagineOpenRouterReale } from './image-generator.mjs';
import { leggiContestoWorkspace as leggiContestoWorkspaceReale } from './workspace-context.mjs';
import { contestoDelProgetto as contestoDelProgettoReale, aggiornamentoInCoda as aggiornamentoInCodaReale } from './contesto-del-progetto.mjs'; // BC-07 (11/09): il preambolo a 4 blocchi, e l'aggiornamento che si APPENDE invece di riscrivere il prefisso
import { creaFiltroGitignore as creaFiltroGitignoreReale } from './gitignore-elenco.mjs'; // P-13: le regole che decidono cosa NON elencare
import { creaFileWorkspace as creaFileWorkspaceReale, WorkspaceFileError } from './workspace-files.mjs';
import { preparaToolMcpPerSessione as preparaToolMcpPerSessioneReale } from './mcp-session.mjs';
import { caricaSkill as caricaSkillReale } from './skill-registry.mjs';
import { schemaIngressoAttrezzo } from './tool-schema-normalize.mjs';
import {
  cercaVoci as cercaVociLibreria,
  creaCursoriLibreria,
  elencaVoci as elencaVociReale,
  elencaVociConTesto as elencaVociConTestoReale,
  eliminaVoce as eliminaVoceReale,
  impaginaVoci as impaginaVociLibreria,
  leggiVoce as leggiVoceReale,
  origineVoce as origineVoceReale,
  rinominaVoce as rinominaVoceReale,
  trovaVoce as trovaVoceLibreria,
} from './library-store.mjs';
import {
  aggiornaNota as aggiornaNotaReale,
  creaNota as creaNotaReale,
  elencaNote as elencaNoteReale,
  eliminaNota as eliminaNotaReale,
  leggiNota as leggiNotaReale,
} from './notes-store.mjs';
import {
  aggiornaAttivita as aggiornaAttivitaReale,
  completaAttivita as completaAttivitaReale,
  creaAttivita as creaAttivitaReale,
  elencaAttivita as elencaAttivitaReale,
  eliminaAttivita as eliminaAttivitaReale,
  leggiAttivita as leggiAttivitaReale,
} from './tasks-store.mjs';
import {
  aggiornaMemoria as aggiornaMemoriaReale,
  cercaMemorie,
  creaMemoria as creaMemoriaReale,
  elencaMemorie as elencaMemorieReale,
  eliminaMemoria as eliminaMemoriaReale,
  leggiMemoria as leggiMemoriaReale,
} from './memory-store.mjs';
import {
  elencaToolForgiati as elencaToolForgiatiReale,
  installaToolForgiato as installaToolForgiatoReale,
  ToolForgeStoreError,
} from './tool-forge-store.mjs';
import {
  MODALITA_SUPPORTATE as MODALITA_SUPPORTATE_LIBRERIA,
  creaRicevutaPolitica as creaRicevutaPoliticaLibreria,
  creaRicevutePolitica as creaRicevutePoliticaLibreria,
  leggiPolitica as leggiPoliticaReale,
  ricordaRicevutaPolitica as ricordaRicevutaPoliticaLibreria,
  scriviPolitica as scriviPoliticaReale,
} from './library-policy-store.mjs';
import { preparaToolPluginPerSessione as preparaToolPluginPerSessioneReale } from './plugin-session.mjs';
import { eseguiHook as eseguiHookReale } from './hook-registry.mjs';
import {
  artifactCreated,
  eventiPerRisposta,
  comandoUtenteFinito, comandoUtenteIniziato, eventoPerEsitoTool, toolCallOutput,
  eventoPerScrittura,
  eventoPerUsage,
  hookInvoked,
  reasoningMessageContent,
  reasoningMessageEnd,
  reasoningMessageStart,
  runError,
  runFinished,
  runStarted,
  textMessageContent,
  textMessageEnd,
  textMessageStart,
  toolCallArgs,
  toolCallStart,
} from './agui-events.mjs';

const OWNER_RUNTIME = createOwnerRuntimeAdapter();
const chiamaConRitenta = (options) => OWNER_RUNTIME.chiamaConRitenta(options);

/*
 * ⛔⛔⛔ 06/9, owner: «il modello deve avere gli occhi sulla sezione Browser anche se sono io a
 * navigarci dentro». La pagina la legge il SERVER, con la stessa funzione dell'attrezzo `naviga`
 * (validazione degli indirizzi già scritta e provata): dal browser non si può, il confine di
 * origine lo vieta. Esportata qui perché la rotta HTTP la usi senza conoscere l'adattatore.
 */
export function leggiPaginaPerLaVista(url) {
  return OWNER_RUNTIME.leggiPagina(url);
}
const compattaConversazioneReale = (messaggi, chiamaModello) => OWNER_RUNTIME.compattaConversazione(messaggi, chiamaModello);
const eseguiComandoSandboxatoReale = (...args) => OWNER_RUNTIME.eseguiComandoSandboxato(...args);
const eseguiFlowForge = (...args) => OWNER_RUNTIME.eseguiFlowForge(...args);
const FORGE_PREFISSO_NOME_TOOL = OWNER_RUNTIME.forgeToolPrefix;
const talosLavoraReale = (input) => OWNER_RUNTIME.talosLavora(input);
const validaManifestForge = (manifest) => OWNER_RUNTIME.validaManifestForge(manifest);

/**
 * ⭐⭐⭐ 28/8 — un artefatto molto grande sarebbe un evento SSE molto grande
 * (l'html non passa dal tetto di 8.000 caratteri che il kernel applica al
 * TESTO tornato al modello — quel tetto riguarda `esito`, non l'html grezzo
 * inoltrato qui via `onArtefatto`, side-channel separato, stesso principio
 * di `onScrittura`). Rifiutato PRIMA di costruire l'evento, mai troncato in
 * silenzio: un HTML troncato a metà tag è peggio di un rifiuto dichiarato.
 */
const ARTEFATTO_MAX_BYTE = 400_000; // stesso tetto di artifactTools.ts mobile

/** ⭐ 29/8 — FASE H: i `media_type`/mime VERI che i due percorsi di image-generator.mjs possono tornare (png sempre, jpeg/webp se il fornitore li dichiara) — mai un'estensione inventata per un formato ignoto, ricade su 'png' onestamente. */
const ESTENSIONE_PER_MEDIA_TYPE = Object.freeze({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' });

/**
 * ⛔ 'giri-esauriti' e 'fermato' sono ENTRAMBI RunError, non solo il primo:
 * nessuno dei due è un successo, e trattarli diversamente costringerebbe
 * ogni chiamante a conoscere il vocabolario interno di talosLavora invece di
 * leggere lo standard AG-UI. `code` porta la stringa originale — chi vuole
 * distinguerli può farlo senza che questo file decida per lui.
 */
function esitoInEventoFinale({ threadId, runId, esito }) {
  if (esito.comeFinita === 'concluso') {
    return runFinished({
      threadId,
      runId,
      outcome: { type: 'success' },
      /*
       * ⭐⭐⭐ Piano procedi-col-generare-un-snoopy-neumann.md, Fase 3 —
       * `esito.usage` esisteva già in `talosHarness.mjs` (accumulato per
       * TALOS-BANCO) ma veniva scartato qui: mai tradotto in nessun
       * evento, quindi mai visibile a chi guarda una sessione HTTP. `null`
       * quando nessun giro l'ha mai riportato — inoltrato com'è, mai
       * inventato.
       */
      result: { detto: esito.detto, compattazioni: esito.compattazioni, premesseNegate: esito.premesseNegate, usage: esito.usage ?? null },
    });
  }
  return runError({ message: esito.detto, code: esito.comeFinita });
}

/**
 * Avvia un task vero attraverso `talosLavora` e traduce ogni evento in AG-UI,
 * consegnandolo a `onEvento` man mano che accade (mai in un batch finale: chi
 * guarda una sessione dal vivo deve vedere i tool-call mentre succedono, non
 * dopo).
 *
 * @param {object} input
 * @param {string} input.cartella
 * @param {{consegna:string}} input.task
 * @param {string} input.modello
 * @param {string} input.chiave
 * @param {string} [input.comandoProva]
 * @param {(evento:object)=>void} input.onEvento
 * @param {AbortSignal} [input.segnaleStop]
 * @param {Array<object>} [input.messaggiIniziali] — per resume/fork (§1.4)
 * @param {{effort?:string, summary?:string}} [input.reasoning] — ⭐ 27/8, R1:
 *   passato così com'è a talosLavora/OpenRouter. Assente: nessun ragionamento
 *   richiesto, nessun evento Reasoning*, comportamento di prima.
 * @param {boolean} [input.mobile] — piano `procedi-col-generare-un-snoopy-neumann.md`,
 *   Fase 3: sessione avviata da un client mobile. Solo l'attrezzo `shell`
 *   se ne accorge (vedi talosHarness.mjs, `eseguiComandoSandboxato`) — ogni
 *   altro attrezzo si comporta identico, `false` è il default di sempre.
 * @param {()=>string|null|undefined} [input.codaMessaggiFn] — FASE D (28/8),
 *   coda messaggi. Stesso principio di `hookFn`/`onDelega`: inoltrato SENZA
 *   logica propria, la coda vera (FIFO, per-sessione) vive in
 *   `session-registry.mjs`. Il kernel la chiama SOLO quando un giro conclude
 *   senza tool-call — vedi `talosHarness.mjs`, LEDGER-FASE-D-CODA.md.
 * @param {typeof talosLavoraReale} [input.talosLavoraFn] — SOLO per test: la
 *   funzione reale è il default, iniettarne una finta evita di dover far
 *   girare un vero ciclo (già provato per conto suo in AVM-harness) solo per
 *   provare la traduzione degli eventi.
 * @returns {Promise<{threadId:string, runId:string, ok:boolean, esito:object|null, erroreInterno:string|null}>}
 *   Non lancia MAI: un fallimento interno (talosLavora che getta invece di
 *   tornare un esito) emette comunque un RunError su `onEvento` prima di
 *   tornare — un chiamante HTTP/SSE non deve gestire due canali di errore
 *   diversi (eccezione E RunError) per la stessa cosa.
 */
export async function avviaSessione({
  cartella, task, modello, chiave, comandoProva,
  /*
   * ⛔⛔⛔ 11/09/2026 — DOVE FINISCE UN FILE *GENERATO*, che non è dove il modello LEGGE.
   *
   * Difetto misurato sulla sessione `91ae0634` dell'owner: `document_create` rispondeva
   * `EPERM: operation not permitted, open 'C:\Qwen 3.8 ….pdf'`. Il PDF era corretto; falliva solo
   * la scrittura, e sempre alla RADICE DEL DISCO. La catena, per intero:
   *  1. la sessione nasce su `C:\Users\…\AVM-harness-desktop` con permesso «Read only»;
   *  2. l'owner alza il permesso a «Full access» (riga 2242 del suo `.jsonl`);
   *  3. `session-registry.mjs` ricalcola la cartella effettiva con `cartellaEffettivaPerPermessi`,
   *     che per «Full access» ritorna `parse(base).root` — cioè `C:\` (è VOLUTO: al kernel non si
   *     insegna un permesso nuovo, gli si consegna una cartella più larga);
   *  4. `creaFileWorkspace` scrive «alla radice del workspace» ⇒ `C:\<nome>.pdf`;
   *  5. Windows rifiuta. E non è un caso: la radice del volume di sistema è protetta da ACL che
   *     lasciano al gruppo Users creare CARTELLE ma non FILE (WinTips.org, «FIX: Write Access
   *     Denied on Drive C:\», e Microsoft Learn «Access Control: Understanding Windows File And
   *     Registry Permissions», letti l'11/09/2026) ⇒ nessun nome diverso può mai riuscire.
   *
   * ⛔ La cura NON è restringere «Full access» (allargare è la funzione, e il modello deve poter
   *   leggere tutto il disco). È separare le due domande, che finora erano una sola:
   *   **da dove si legge** (il workspace, largo quanto il permesso dice) e **dove si DEPOSITA un
   *   file appena generato** (la cartella da cui la sessione è partita, che l'owner ha scelto e
   *   che ha i suoi permessi). `cartellaCreazioni` è la seconda. Assente ⇒ è la prima, cioè
   *   esattamente il comportamento di prima per ogni chiamante che non la passa (tutti i test).
   *
   * ⭐ È anche la regola del minimo privilegio applicata al verso giusto: «un agente che deve solo
   *   leggere una cartella non ha bisogno di scrivere nella radice del filesystem» (Firecrawl,
   *   «AI Agent Sandbox: How to Safely Run Autonomous Agents in 2026», 11/09/2026).
   */
  cartellaCreazioni = null,
  onEvento, segnaleStop, messaggiIniziali, reasoning, contextHooks, mobile = false,
  fallbackProviders = [], onCambioFornitore: depositaCambioFornitore,
  /*
   * ⛔⛔⛔ 02/09 — LEDGER-STREAMING-SCROLL-TERMINALE-2026-09-02.md, §6/§7.
   * L'etichetta del permesso della sessione ("Read only"/"Workspace
   * write"/"On request"/"Full access") — SOLO per dichiararla in
   * RunStarted.contesto, accanto a `modello` e `reasoning`. Nessuna
   * logica: la regola vive in `livelloAccesso`/`chiediApprovazioneFn`
   * (kernel). Perché: la sessione dell'owner è stata messa in "Read only"
   * da un altro client fra un giro e l'altro, l'attrezzo scrivi ha
   * rifiutato per "sola lettura" e la UI diceva ancora "Full access" —
   * nessun evento portava il permesso VERO del giro. Ora ogni giro lo
   * dichiara, e la cronologia lo mostra sotto la bolla utente.
   */
  permessi = null,
  strumentiEstesi, ricercaWeb,
  // ⭐ 04/9, R-03 — trasporto iniettato per la ricerca SENZA chiave (DuckDuckGo, `duckduckgo-search.mjs`): inoltrato al kernel com'è (parametro `richiediRicercaFn` di talosLavora), undefined per le fonti con chiave.
  richiediRicercaFn,
  /*
   * ⭐⭐⭐ 29/8 — FASE K, R2 planner costoso + editor economico. Stesso
   * principio di `ricercaWeb`/`reasoning`: inoltrato SENZA logica
   * propria — il pre-loop, il gate `livelloAccesso:'lettura'`, il
   * filtro read-safe degli attrezzi vivono TUTTI dentro
   * `talosHarness.mjs` (questo file non li duplica). `undefined` per
   * default (owner, 29/8: "Configurabile, nessun default forzato") —
   * PARITÀ, il loop resta quello di sempre, un modello solo.
   */
  modelloPlanner,
  /*
   * ⭐⭐⭐ 29/8 — FASE H, `generate_image`. A differenza di `ricercaWeb`:
   * SEMPRE definito (config.mjs, `parseImmagine` — un default onesto e
   * reale, mai `undefined`), perché `generate_image` non ha una
   * credenziale propria da mancare — riusa `chiave`, la stessa già
   * richiesta per far girare il modello di chat (senza quella la
   * sessione non parte affatto, vedi session-registry.avvia()). Questo
   * È il one-up dichiarato: zero secondo sistema di
   * configurazione provider.
   */
  immagine,
  generaImmagineFn = generaImmagineOpenRouterReale,
  persistGeneratedImageFn,
  removeGeneratedImageFn,
  /*
   * ⭐⭐⭐ 29/8 — FASE D, firma Ed25519 delle ricevute. Stesso principio di
   * `ricercaWeb` appena sopra: inoltrato SENZA logica propria a
   * `talosLavoraFn` — la decisione (dove vive la chiave) vive tutta in
   * `config.mjs`/`harness-receipt-keypair.mjs`.
   */
  firma,
  /*
   * ⭐⭐⭐ 28/8 — pillola permessi: entrambi opzionali, inoltrati SENZA
   * logica propria a talosLavoraFn (la decisione COSA rifiutare vive
   * tutta nel kernel, `verificaPermessoScrittura` — vedi la sua doc).
   * Questo file resta un adattatore, non un secondo posto dove la
   * regola potrebbe divergere in silenzio.
   */
  livelloAccesso, chiediApprovazioneFn,
  /*
   * ⭐⭐⭐ FASE B (28/8) — stesso principio di `livelloAccesso`/
   * `chiediApprovazioneFn`: inoltrato senza logica propria, la semantica
   * di ogni valore vive nel kernel (`verificaPermessoScrittura`).
   */
  permessiPerAttrezzo,
  /*
   * ⭐⭐⭐ 28/8 — FASE A (hook), piano `elegant-spinning-dongarra.md`.
   * Stesso principio di `livelloAccesso`/`chiediApprovazioneFn` appena
   * sopra: inoltrato SENZA logica propria, la decisione (quale hook
   * fidato blocca cosa) vive tutta in `costruisciHookFn`
   * (`session-registry.mjs`) e nel kernel (`talosHarness.mjs`). Prima
   * di questo commit `hookFn` veniva costruito da `session-registry.mjs`
   * ma MAI arrivava qui — silenziosamente ignorato, nessun errore:
   * il gap dichiarato in `LEDGER-FASE-A-HOOKS.md`, chiuso ora.
   */
  hookFn,
  /*
   * ⭐⭐⭐ FASE C (28/8) — sub-agenti, stesso principio di `hookFn` appena
   * sopra: inoltrato SENZA logica propria, la decisione (limiti di
   * concorrenza/profondità, isolamento) vive tutta in
   * `subagent-orchestrator.mjs` (session-registry.mjs) e nel kernel
   * (`talosHarness.mjs`). Lo stesso gap di `hookFn` prima di FASE A —
   * un parametro costruito dal chiamante ma mai arrivato fin qui — non
   * si ripete: aggiunto nello stesso commit del resto della fase.
   */
  onDelega,
  /*
   * ⭐⭐⭐ FASE D (28/8) — coda messaggi su una sessione IN CORSO. Stesso
   * principio di `hookFn`/`onDelega`: inoltrato SENZA logica propria, la
   * coda vera (FIFO, `voce.codaMessaggi`) vive in `session-registry.mjs`.
   * Stesso gap da non ripetere: un parametro costruito dal chiamante ma
   * mai arrivato fin qui — aggiunto nello stesso commit del resto della
   * fase, non un secondo giro.
   */
  codaMessaggiFn,
  /*
   * ⭐⭐⭐ FASE N, ottavo sistema (30/8) — Deep Research, "fetta onesta".
   * Stesso principio ESATTO di `hookFn`/`onDelega`/`codaMessaggiFn`
   * sopra: inoltrati SENZA logica propria — gli 8 thin delegate verso
   * `research-orchestrator.mjs` vivono tutti in `session-registry.mjs`
   * (avviaESegui), questo file li passa soltanto fino a `talosLavoraFn`.
   * Stesso gap da non ripetere: aggiunti nello stesso commit del resto
   * della fase, non un secondo giro.
   */
  onRicercaLista, onRicercaAvvia, onRicercaLeggi, onRicercaRinomina,
  onRicercaPausa, onRicercaRiprendi, onRicercaAnnulla, onRicercaElimina,
  /*
   * ⭐⭐⭐⭐ L8 (12/09/2026) — il compositore del record del rapporto della ricerca
   * approfondita. Inoltrato SENZA logica propria, come tutto il resto in questo file: lo
   * costruisce `research-orchestrator.componiRapportoRicerca` (che usa `src/research/report.mjs`)
   * e lo usa il kernel dentro `research_deposit`. Assente ⇒ il deposito scrive il testo così
   * com'è, cioè il comportamento di prima di oggi.
   */
  componiRapportoRicercaFn,
  /*
   * ⭐⭐⭐⭐ L9 (12/09/2026) — la ricerca approfondita: la cache della corsa e la finestra di
   * pagina. Inoltrati SENZA logica propria, come `componiRapportoRicercaFn` qui sopra: chi li
   * costruisce è `research-orchestrator.mjs`, chi li usa è il kernel dentro `web_search` e
   * `naviga`. Assenti (ogni sessione che non è una ricerca, il banco, i test) ⇒ comportamento
   * bit-per-bit di ieri.
   */
  cacheWeb,
  onPaginaLetta,
  /*
   * ⭐⭐⭐ 29/8 — FASE E, seconda meta'. Stesso principio di
   * `hookFn`/`onDelega`/`codaMessaggiFn` sopra: inoltrato SENZA logica
   * propria — la scoperta/trust/connessione vive tutta in
   * `mcp-session.mjs`/`mcp-registry.mjs`.
   *
   * ⛔⛔⛔ A differenza di quei tre, PERO', qui c'e' un vero lavoro da
   * fare in QUESTO file (non solo un pass-through): connettersi a un
   * server MCP e' I/O asincrono, e i tool MCP devono essere pronti
   * PRIMA della prima chiamata al modello (dentro talosLavoraFn) — ma
   * DOPO RunStarted (riga 199, gia' sincrono prima di questo). Questo
   * e' esattamente il punto giusto: gia' dentro il corpo async di
   * avviaSessione, gia' dopo RunStarted, gia' prima di talosLavoraFn.
   * Non serve toccare session-registry.mjs (avvia()/avviaLibero()
   * restano sincrone) ne' i 110 punti che chiamano quelle due funzioni
   * nei test — investigato PRIMA di scrivere, non assunto (vedi
   * elegant-spinning-dongarra.md, FASE E).
   *
   * `cartellaTrustMcp` ASSENTE (ogni test esistente, e — finche'
   * session-registry.mjs non lo passa — ogni sessione reale di oggi)
   * ⇒ ZERO lavoro nuovo: nessuna I/O, toolMcp/chiamaToolMcpFn restano
   * `undefined`, comportamento bit-per-bit quello di oggi. Stessa
   * garanzia gia' data per ogni altro parametro di questa lista.
   */
  cartellaTrustMcp,
  preparaToolMcpPerSessioneFn = preparaToolMcpPerSessioneReale,
  /*
   * ⭐⭐⭐ 29/8 — FASE F (Skills). Piu' semplice di toolMcp sopra: una
   * skill e' testo, nessuna connessione da preparare, nessun trust da
   * verificare (mai un hash-gate qui — vedi la doc in
   * skill-registry.mjs sul perche'). Chiamata SEMPRE (non dietro un
   * flag come cartellaTrustMcp): caricaSkill({cartella}) e' gia'
   * economica sul percorso comune ("nessuna .harness-ui-skills/") —
   * un solo tentativo di lettura cartella che fallisce con ENOENT,
   * stesso costo di leggiContestoWorkspaceFn poco sotto. Iniettabile
   * per i test (mai una vera lettura disco nella suite unitaria).
   */
  caricaSkillDisponibiliFn = caricaSkillReale,
  /*
   * ⭐⭐⭐ 29/8 — FASE G (Plugin system). Stesso gate esplicito di
   * `cartellaTrustMcp` sopra (a differenza di `caricaSkillDisponibiliFn`,
   * sempre chiamata): un tool di plugin ESEGUE un comando locale, e un
   * hook di plugin intercetta il ciclo dell'agente — entrambi la
   * stessa categoria di rischio di un server MCP o di un hook
   * standalone, mai testo inerte come una skill. Assente (ogni test
   * esistente, e — finché session-registry.mjs non lo passa — ogni
   * sessione reale di oggi) ⇒ ZERO lavoro nuovo, stessa garanzia già
   * data per `cartellaTrustMcp`.
   *
   * ⛔ A differenza di MCP: nessun `chiudiPlugin()` nel `finally` sotto
   * — un tool di plugin non apre una connessione persistente, spawna
   * ON DEMAND ad ogni chiamata (vedi `plugin-session.mjs`), zero
   * risorsa da rilasciare a fine run.
   */
  cartellaTrustPlugin,
  preparaToolPluginPerSessioneFn = preparaToolPluginPerSessioneReale,
  eseguiHookFn = eseguiHookReale,
  talosLavoraFn = talosLavoraReale,
  leggiContestoWorkspaceFn = leggiContestoWorkspaceReale,
  // ⭐ P-13 (10/09) — iniettabili per le prove, come ogni altro *Fn qui: nessun test deve
  // camminare un albero vero per provare l'ordine degli eventi.
  contestoDelProgettoFn = contestoDelProgettoReale,
  aggiornamentoInCodaFn = aggiornamentoInCodaReale,
  creaFiltroGitignoreFn = creaFiltroGitignoreReale,
  salvaArtefattoFn = salvaArtefattoReale,
  /*
   * ⛔⛔⛔ 06/9, owner: «con i modelli a chiave API gli artefatti vengono creati, ma non salvati
   * nella libreria». Vero, e peggio di così: non erano salvati DA NESSUNA PARTE. `artifact-store.mjs`
   * li tiene in una Map in memoria — dichiarato nella sua doc, «non sopravvive a un riavvio del
   * server» — quindi un artefatto spariva al primo riavvio e non compariva mai in Libreria.
   * Un artefatto è lavoro prodotto per la persona, non un'anteprima: si salva dove lo ritrova.
   * La Map resta com'è (serve a servire la rotta senza toccare il disco a ogni apertura); qui si
   * aggiunge la copia durevole, nella Libreria del progetto.
   */
  salvaVoceLibreriaFn = salvaVoceLibreriaReale,
  generateTalosDocumentFn = generateTalosDocumentReale,
  verifyTalosDocumentFn = verifyTalosDocumentReale,
  creaFileWorkspaceFn = creaFileWorkspaceReale,
  /*
   * ⭐⭐⭐ 29/8 — FASE N (Libreria), prima fetta. Stesso principio di
   * `caricaSkillDisponibiliFn`: SOLO i quattro punti di contatto I/O
   * con `library-store.mjs` sono iniettabili (per i test — mai un vero
   * filesystem mockato altrove, il modulo stesso è già testato per
   * conto suo). `impaginaVoci`/`cercaVoci`/`creaCursoriLibreria` sono
   * PURE — usate direttamente, mai iniettate: non c'è I/O da fingere.
   * Nessun gate/trust (stesso motivo di `caricaSkillDisponibiliFn`:
   * una voce di Libreria è un file locale come un altro, non un
   * comando o una connessione — vedi la doc in library-store.mjs).
   */
  elencaVociFn = elencaVociReale,
  elencaVociConTestoFn = elencaVociConTestoReale,
  leggiVoceFn = leggiVoceReale,
  origineVoceFn = origineVoceReale,
  /*
   * ⭐⭐⭐ 29/8 — FASE N, seconda fetta (mutazioni). Stesso principio
   * appena sopra: solo i punti di contatto I/O sono iniettabili
   * (`rinominaVoceFn`/`eliminaVoceFn`); `trovaVoceLibreria` è PURA,
   * usata direttamente. `library_export` non ha un suo I/O dedicato —
   * compone `leggiVoceFn` (già iniettabile sopra) con
   * `creaFileWorkspaceFn` (già iniettabile per onDocumento/onImmagine,
   * riuso diretto, nessuna funzione nuova per "scrivi un file nel
   * workspace").
   */
  rinominaVoceFn = rinominaVoceReale,
  eliminaVoceFn = eliminaVoceReale,
  /*
   * ⭐⭐⭐ 29/8 — FASE N, terza fetta (library_context_policy_update).
   * Stesso principio dei punti I/O sopra: solo leggiPoliticaFn/
   * scriviPoliticaFn iniettabili — creaRicevutaPolitica/
   * ricordaRicevutaPolitica sono PURE (nessuna I/O da fingere).
   */
  leggiPoliticaFn = leggiPoliticaReale,
  scriviPoliticaFn = scriviPoliticaReale,
  /*
   * ⭐⭐⭐ FASE N, quarto sistema (30/8) — Notes. `cartellaNote`: GLOBALE,
   * non `cartella` (il workspace di QUESTA sessione) — una nota non è
   * un artefatto di un progetto, vedi la doc in notes-store.mjs. Stesso
   * pattern di threading di `cartellaTrustHook`/`cartellaTrustMcp`/
   * `cartellaTrustPlugin`: nessun default QUI, il default reale vive in
   * session-registry.mjs. Nessun gate di fiducia (come le skill/Libreria
   * di lettura): una nota è un file locale dell'owner, non un comando o
   * una connessione.
   */
  cartellaNote,
  elencaNoteFn = elencaNoteReale,
  creaNotaFn = creaNotaReale,
  aggiornaNotaFn = aggiornaNotaReale,
  eliminaNotaFn = eliminaNotaReale,
  leggiNotaFn = leggiNotaReale,
  /*
   * ⭐⭐⭐ FASE N, quinto sistema (30/8) — Tasks. Stesso pattern ESATTO di
   * cartellaNote/elencaNoteFn appena sopra: GLOBALE, nessun default
   * QUI (il default reale vive in session-registry.mjs).
   */
  cartellaAttivita,
  elencaAttivitaFn = elencaAttivitaReale,
  creaAttivitaFn = creaAttivitaReale,
  completaAttivitaFn = completaAttivitaReale,
  aggiornaAttivitaFn = aggiornaAttivitaReale,
  eliminaAttivitaFn = eliminaAttivitaReale,
  leggiAttivitaFn = leggiAttivitaReale,
  /*
   * ⭐⭐⭐ FASE N, sesto sistema (30/8) — Memory. Stesso pattern ESATTO
   * di cartellaAttivita/elencaAttivitaFn appena sopra: GLOBALE, nessun
   * default QUI. `cercaMemorieFn` è PURA (mai iniettata: non c'è I/O
   * da fingere), stesso trattamento di `impaginaVociLibreria`.
   */
  cartellaMemoria,
  elencaMemorieFn = elencaMemorieReale,
  creaMemoriaFn = creaMemoriaReale,
  aggiornaMemoriaFn = aggiornaMemoriaReale,
  eliminaMemoriaFn = eliminaMemoriaReale,
  leggiMemoriaFn = leggiMemoriaReale,
  /*
   * ⭐⭐⭐⭐ FASE N, nono e ultimo sistema (30/8) — Tool Forge. Stesso
   * pattern ESATTO di cartellaMemoria/elencaMemorieFn appena sopra:
   * GLOBALE (nessun default QUI, il default reale vive in
   * session-registry.mjs — vedi la doc in tool-forge-store.mjs sul
   * perché GLOBALE come Notes/Tasks/Memory).
   */
  cartellaForge,
  elencaToolForgiatiFn = elencaToolForgiatiReale,
  installaToolForgiatoFn = installaToolForgiatoReale,
}) {
  const threadId = randomUUID();
  const runId = randomUUID();

  /*
   * ⭐ Il pannello "Ambiente" del Context Rail — prima statico/demo (§1.3 del
   * piano). `branch` è onestamente `null` per ogni task di progetti/ (nessuno
   * è un repository git, vedi workspace-context.mjs) — non un difetto qui.
   * ⛔ Letto PRIMA di RunStarted apposta: un fallimento di `git` (comando
   * assente, permessi) non deve mai impedire l'avvio della sessione — per
   * questo leggiContestoWorkspace non lancia mai, anche se questo file non
   * lo intercetta con un try/catch: la garanzia vive nella funzione stessa.
   */
  /*
   * ⭐ La cartella dove si DEPOSITA un file generato — vedi la doc di `cartellaCreazioni` in testa
   *   a questa funzione. Senza il parametro è `cartella`: il comportamento di prima, invariato.
   */
  const cartellaPerCreare = cartellaCreazioni || cartella;
  /*
   * ⛔ Il pannello File e la scheda Review mostrano un percorso RELATIVO AL WORKSPACE: se il file
   *   è stato depositato altrove (cioè `cartellaPerCreare !== cartella`), il solo nome sarebbe una
   *   bugia — punterebbe alla radice del workspace, dove il file non c'è. Si ricalcola davvero.
   *   Quando il deposito è FUORI dal workspace `relative` produce un percorso con `..`: la si
   *   lascia passare com'è (è onesta) invece di inventare un percorso interno che non esiste.
   */
  const percorsoNellAlbero = (nome) => (
    cartellaPerCreare === cartella
      ? nome
      : percorsoRelativo(cartella, joinPercorso(cartellaPerCreare, nome)).split(separatorePercorso).join('/')
  );
  const contestoWorkspace = leggiContestoWorkspaceFn({ cartella, progetto: task?.progetto ?? null });
  const contesto = {
    ...contestoWorkspace,
    modello,
    reasoning: reasoning ?? null,
    permessi: permessi ?? null,
  };

  onEvento(runStarted({ threadId, runId, input: task, contesto }));

  /*
   * ⛔⛔⛔ P-13 (10/09) — L'ELENCO DEI FILE, e perché sta ESATTAMENTE qui.
   *
   * IL DIFETTO, misurato il 22/08: l'attrezzo `elenca` arriva a profondità 2; i 106 percorsi dei
   * task del corpus `storia` stanno a profondità 4-6, ZERO a profondità ≤2; e 35 consegne su 35
   * non nominano nessun file. Il modello non può risolverli — non per bravura: non li VEDE.
   *
   * ⛔ IL PUNTO NON È UNA PREFERENZA, È UNA MISURA. Il primo tentativo agganciava questo in
   *   `session-registry.mjs`, dentro `avviaESegui`: un solo tick di ritardo lì fa cadere 148
   *   test su 2084, perché `avviaSessione` emette RunStarted come sua PRIMA riga e chi chiama
   *   conta su quell'evento già nel buffer al ritorno (la riga 2245 di quel file lo dice a
   *   chiare lettere). Qui invece siamo DOPO RunStarted e PRIMA di talosLavoraFn — lo stesso
   *   posto, e per la stessa ragione, dove già vivono MCP (sotto), Skills e Plugin.
   * ⛔ E SE FALLISCE NON SI FERMA NIENTE: stesso principio delle Skills poche righe sotto —
   *   una sessione che non parte perché non si sono potuti elencare i file sarebbe una cura
   *   molto peggiore della malattia.
   * ⭐ Al kernel arriva una STRINGA già pronta: `contesto-del-progetto.mjs` tiene la cache per
   *   cartella (39 ms la prima volta su questo repo, 2 ms dopo — misurato), e la stabilità di
   *   quella stringa è ciò che fa prendere la cache del fornitore: costa un sesto e prende
   *   dalla terza chiamata (22/08, 16.768 token su 16.811 letti dalla cache).
   */
  let testoContestoProgetto;
  try {
    /*
     * ⛔ I DUE CONTRATTI, e non è pignoleria: `contestoDelProgetto` chiama `creaFiltro(radice)`
     *   con una STRINGA; `creaFiltroGitignore` vuole `{radice}`. Passata la stringa nuda, Node
     *   lancia ERR_INVALID_ARG_TYPE, il catch là dentro lo scambia per un .gitignore illeggibile
     *   e l'elenco esce SENZA FILTRO. Trovato dal vivo il 10/09 sulla cartella vera: 1500
     *   percorsi troncati e 25.163 token invece di ~6.500, con dentro i file di log. Non un
     *   errore visibile: un elenco che sembra funzionare e costa quattro volte tanto.
     */
    const preambolo = await contestoDelProgettoFn({
      cartella,
      creaFiltro: (radice) => creaFiltroGitignoreFn({ radice }),
      /*
       * ⭐ BC-07 — I TRE VALORI CHE ENTRANO NEL PREAMBOLO e che possono cambiare senza che il
       *   disco cambi: cartella, permesso del giro, modello. Sono anche la chiave della cache in
       *   `contesto-del-progetto.mjs`, e per questo il prefisso resta byte-identico fra due
       *   messaggi consecutivi e cambia SOLO quando uno dei tre cambia davvero.
       * ⛔ `permessi` e' l'ETICHETTA gia' calcolata per RunStarted.contesto (02/09): la stessa
       *   che la persona vede nella pillola. Due nomi diversi per lo stesso permesso — uno a
       *   schermo e uno nel prompt — sarebbero due verita' da tenere allineate a mano.
       */
      permesso: permessi ?? null,
      modello: modello ?? null,
      piattaforma: process.platform,
    });
    testoContestoProgetto = preambolo?.testo;

    /*
     * ⛔⛔⛔ IL CONTESTO SI APPENDE, NON SI RISCRIVE — e qui sta la differenza fra le due cose.
     *
     * Su una sessione FRESCA il kernel mette il preambolo in testa (subito dopo le istruzioni) e
     * non lo tocca piu'. Su un SEGUITO (`messaggiIniziali` pieno) il kernel lo IGNORA del tutto:
     * il prefisso e' gia' dentro la conversazione salvata, e riscriverlo la' significherebbe
     * invalidare tutto cio' che sta dopo — la lookup della cache lavora sul prefisso INTERO fino
     * al breakpoint, non sul singolo blocco (Claude Platform Docs, «Prompt caching», letto
     * 11/09/2026: «Cache hits require 100% identical prompt segments»).
     * ⇒ Se nel frattempo e' cambiato qualcosa (un `WorkspaceChanged` ha invalidato la mappa, un
     *   `AGENTS.md` e' stato salvato, il permesso del giro e' cambiato), il preambolo nuovo si
     *   APPENDE IN CODA dichiarando che sostituisce. Se non e' cambiato niente, non si appende
     *   niente: zero token.
     * ⛔ Il confronto non tiene nessuno stato in memoria: legge dalla conversazione stessa che
     *   cosa il modello ha davvero davanti (`preamboloVistoDa`). Una mappa in memoria mentirebbe
     *   dopo un riavvio del server, e la conversazione salvata no.
     */
    if (Array.isArray(messaggiIniziali) && messaggiIniziali.length > 0 && testoContestoProgetto) {
      const coda = aggiornamentoInCodaFn({ storia: messaggiIniziali, testo: testoContestoProgetto });
      if (coda) messaggiIniziali = [...messaggiIniziali, { role: 'system', content: coda }];
    }
  } catch {
    // ⭐ nessun preambolo: si parte esattamente come prima di BC-07, zero differenza per la sessione.
  }

  /*
   * ⭐⭐⭐ 29/8 — FASE E: DOPO RunStarted (sincrono, sopra), PRIMA di
   * talosLavoraFn (sotto) — vedi la doc sul parametro `cartellaTrustMcp`.
   */
  let toolMcp;
  let chiamaToolMcpFn;
  let chiudiMcp = async () => {};
  if (cartellaTrustMcp) {
    const preparato = await preparaToolMcpPerSessioneFn({ cartella, cartellaTrust: cartellaTrustMcp });
    toolMcp = preparato.toolMcp;
    chiamaToolMcpFn = preparato.chiamaToolMcpFn;
    chiudiMcp = preparato.chiudiTutti;
  }

  /*
   * ⭐⭐⭐ 29/8 — FASE F (Skills). Nessun gate (a differenza di MCP
   * sopra): caricaSkill() e' gia' economica sul percorso comune, vedi
   * la doc su caricaSkillDisponibiliFn. Un .harness-ui-skills/
   * malformato non deve MAI impedire alla sessione di partire —
   * degrada a "nessuna skill", stesso principio di costruisciHookFn
   * in session-registry.mjs (try/catch a vuoto, mai un blocco).
   */
  let skillsDisponibili;
  let caricaSkillFn;
  try {
    const { skills } = await caricaSkillDisponibiliFn({ cartella });
    if (skills.length > 0) {
      skillsDisponibili = skills.map((s) => ({ name: s.name, description: s.description }));
      caricaSkillFn = async (nome) => {
        const skill = skills.find((s) => s.name === nome);
        if (!skill) throw new Error(`skill "${nome}" scomparsa fra l'offerta al modello e la chiamata`);
        return skill.corpo;
      };
    }
  } catch {
    // ⭐ un .harness-ui-skills/ malformato non deve mai bloccare l'avvio: skillsDisponibili resta undefined, zero tool nuovo offerto.
  }

  /*
   * ⭐⭐⭐ 29/8 — FASE G (Plugin system). Stesso gate esplicito di MCP
   * sopra (`cartellaTrustPlugin`), stesso punto (dopo RunStarted,
   * prima di talosLavoraFn) — vedi la doc sul parametro.
   * `preparaToolPluginPerSessioneFn` già filtra ai soli plugin FIDATI
   * (hash sull'intero manifesto, `plugin-session.mjs`): un plugin mai
   * fidato non contribuisce né un tool né un hook, qui come là.
   */
  let toolPlugin;
  let eseguiToolPluginFn;
  let hookPlugin = [];
  if (cartellaTrustPlugin) {
    const preparato = await preparaToolPluginPerSessioneFn({ cartella, cartellaTrust: cartellaTrustPlugin });
    toolPlugin = preparato.toolPlugin;
    eseguiToolPluginFn = preparato.eseguiToolPluginFn;
    hookPlugin = preparato.hookPlugin;
  }

  /*
   * ⭐⭐⭐⭐ FASE N, nono e ultimo sistema (30/8) — Tool Forge. Nessun
   * gate di fiducia (come le Skills sopra — a differenza di MCP/Plugin:
   * un manifest forgiato è già validato ALL'INSTALLAZIONE da
   * validaManifestForge, non da un click di fiducia dell'owner qui).
   * `eseguiCapacitaForge` compone le funzioni Notes/Tasks/Memory GIÀ
   * iniettate sopra — zero nuova primitiva di dominio, solo un nuovo
   * modo di comporle (porto diretto di createLocalCapabilities in
   * talosIntegration.ts mobile). `toolForge`/`eseguiToolForgeFn` sono
   * costruiti SEMPRE (un .tool-forge-store/ malformato degrada a
   * "nessun tool forgiato", mai un blocco dell'avvio — stesso
   * principio di caricaSkillDisponibiliFn sopra).
   */
  async function eseguiCapacitaForge(capacita, input) {
    switch (capacita) {
      case 'tasks.list':
        return elencaAttivitaFn({ cartella: cartellaAttivita });
      case 'tasks.create':
        return creaAttivitaFn({ cartella: cartellaAttivita, title: String(input?.title ?? ''), description: input?.description ?? null, priority: input?.priority ?? 'normal' });
      case 'tasks.setStatus':
        return completaAttivitaFn({ cartella: cartellaAttivita, id: String(input?.id ?? ''), status: input?.status ?? 'done' });
      case 'notes.list':
        return elencaNoteFn({ cartella: cartellaNote });
      case 'notes.create':
        return creaNotaFn({ cartella: cartellaNote, title: String(input?.title ?? ''), content: String(input?.content ?? '') });
      case 'notes.update':
        // ⛔ porto diretto di talosIntegration.ts mobile: title/content passati SOLO se presenti (spread condizionale), mai `title: undefined` esplicito — aggiornaNotaFn tratterebbe comunque undefined come "non toccare", ma questa è la forma VERA del mobile, non solo equivalente.
        return aggiornaNotaFn({
          cartella: cartellaNote, id: String(input?.id ?? ''),
          ...(input?.title !== undefined ? { title: input.title } : {}),
          ...(input?.content !== undefined ? { content: input.content } : {}),
        });
      case 'memory.search': {
        const tutte = await elencaMemorieFn({ cartella: cartellaMemoria });
        return cercaMemorie(tutte, { query: String(input?.query ?? ''), limit: input?.limit });
      }
      case 'memory.create': {
        const { voce } = await creaMemoriaFn({ cartella: cartellaMemoria, title: String(input?.title ?? ''), content: String(input?.content ?? ''), kind: input?.kind ?? 'procedure' });
        return voce;
      }
      default:
        throw new Error(`TALOS_FORGE_CAPABILITY_UNAVAILABLE:${capacita}`);
    }
  }

  let toolForge;
  let eseguiToolForgeFn;
  try {
    const installati = await elencaToolForgiatiFn({ cartella: cartellaForge });
    const abilitati = installati.filter((t) => t.abilitato);
    if (abilitati.length > 0) {
      const manifestPerNome = new Map(abilitati.map((t) => [`${FORGE_PREFISSO_NOME_TOOL}${t.id}`, t.manifest]));
      toolForge = abilitati.map((t) => ({
        name: `${FORGE_PREFISSO_NOME_TOOL}${t.id}`,
        description: t.manifest.description,
        /*
         * ⛔⛔⛔ 03/9 — QUI passava lo schema del manifest COSI' COM'E'.
         *
         * Un manifest Forge scrive le proprietà in forma abbreviata
         * (`nome_contatto: 'string'` invece di `{ type: 'string' }`), che è
         * comoda e NON è JSON Schema. OpenRouter non se ne accorge perché non
         * costruisce grammatiche; llama.cpp deve farlo e si ferma:
         * «JSON schema conversion failed: Unrecognized schema: "string"»,
         * due volte — esattamente le due proprietà di quel manifest.
         * ⇒ Il difetto era nostro e vecchio: l'ha scoperto il primo motore
         * abbastanza severo da leggere quello schema davvero.
         */
        inputSchema: schemaIngressoAttrezzo(t.manifest.inputSchema),
      }));
      eseguiToolForgeFn = async (nome, argomenti) => {
        const manifest = manifestPerNome.get(nome);
        if (!manifest) throw new Error(`unknown forged tool: ${nome}`);
        return eseguiFlowForge(manifest, argomenti, { capacitaFn: eseguiCapacitaForge });
      };
    }
  } catch {
    // ⭐ un .tool-forge-store/ malformato non deve mai bloccare l'avvio: toolForge resta undefined, zero tool nuovo offerto.
  }

  /**
   * ⭐⭐⭐⭐ Il tool_create dispatch — valida via validaManifestForge
   * (kernel) PRIMA di scrivere, mai un tentativo di installazione con
   * un manifest sospetto. Porto diretto dei messaggi mobile
   * (`forgeCreateTool.ts`): "That tool could not be created: ...",
   * "Created "X" — it stays off until the user enables it in Tool
   * Forge." — verbatim, non riformulati.
   */
  const onForgeCrea = async (argomenti) => {
    const manifestoGrezzo = {
      id: argomenti?.id, title: argomenti?.title, description: argomenti?.description,
      inputSchema: argomenti?.input_schema, flow: argomenti?.flow,
    };
    const validazione = validaManifestForge(manifestoGrezzo);
    if (!validazione.ok) {
      return { ok: false, esito: `That tool could not be created: ${validazione.diagnostica.join('; ') || 'the manifest is invalid'}.` };
    }
    try {
      await installaToolForgiatoFn({
        cartella: cartellaForge, manifest: manifestoGrezzo,
        capacita: validazione.capacita, azioni: validazione.azioni, rischio: validazione.rischio,
      });
    } catch (errore) {
      if (errore instanceof ToolForgeStoreError) return { ok: false, esito: `That tool could not be created: ${errore.message}.` };
      throw errore;
    }
    return { ok: true, esito: `Created "${manifestoGrezzo.title}" — it stays off until the user enables it in Tool Forge.` };
  };

  /*
   * ⭐⭐⭐ 29/8 — FASE G: gli hook di un plugin fidato NON passano dal
   * trust hash-vincolato di hook-registry.mjs (namespace diverso, per
   * costruzione: uno standalone è fidato per hash del SUO comando, uno
   * di plugin per hash dell'INTERO manifesto — vedi la doc in
   * plugin-session.mjs sul perché mischiare i due sarebbe un bug di
   * sicurezza) — sono GIÀ fidati qui, il plugin intero lo è.
   *
   * Si fondono in QUESTO file, non dentro `costruisciHookFn`
   * (session-registry.mjs): quella funzione è costruita PRIMA di
   * questo prep asincrono (l'ordine lo fissa già FASE A — hookFn
   * sincrono, passato com'è), e conosce solo `.harness-ui-hooks.json`.
   * Questo è il solo punto dove un evento hook incontra ENTRAMBE le
   * fonti. `hookFn` (il parametro ricevuto, gli hook standalone) resta
   * la prima parola: se rifiuta, gli hook di plugin non girano nemmeno
   * — stessa semantica AND ("il primo che rifiuta vince") già in uso
   * dentro il ciclo di `costruisciHookFn` per gli hook standalone fra
   * loro, estesa qui a una seconda fonte.
   *
   * PARITÀ: hookPlugin vuoto (ogni sessione senza plugin fidati con
   * hook, cioè ogni sessione oggi) ⇒ hookFnConPlugin === hookFn,
   * stesso riferimento, zero wrapping — comportamento bit-per-bit
   * quello di prima di FASE G.
   */
  const hookFnConPlugin = hookPlugin.length === 0
    ? hookFn
    : async (evento) => {
      if (hookFn) {
        const esitoBase = await hookFn(evento);
        if (esitoBase?.consentito === false) return esitoBase;
      }
      const pertinenti = hookPlugin.filter((h) => h.eventi.includes(evento.tipo));
      for (const hook of pertinenti) {
        let esito;
        try {
          esito = await eseguiHookFn({ hook, evento, cartella });
        } catch {
          esito = { consentito: false, motivo: `l'hook di plugin "${hook.id}" è fallito nell'esecuzione.` };
        }
        onEvento(hookInvoked({ hookId: hook.id, tipo: evento.tipo, azione: evento.azione, esito }));
        if (esito?.consentito === false) return esito;
      }
      return { consentito: true };
    };

  /*
   * ⭐⭐⭐ 27/8, R1 — un messageId per il testo e uno per il ragionamento,
   * PER GIRO (una Map, non due variabili: `talosLavora` numera i giri da
   * 0, e un giro può ripassare da qui più volte in task lunghi). Aperto
   * al PRIMO delta di quel tipo per quel giro, chiuso quando `onGiro`
   * segnala che il giro è concluso — mai aperto due volte per lo stesso
   * giro (altrimenti TextMessageStart/ReasoningMessageStart duplicati,
   * stesso difetto già chiuso stanotte per i bubble duplicati via
   * `_sequenza`/replay SSE, causa diversa stessa famiglia).
   */
  const messaggiTestoPerGiro = new Map();
  const messaggiRagionamentoPerGiro = new Map();
  /*
   * ⭐⭐⭐ Piano procedi-col-generare-un-snoopy-neumann.md, Fase 4 — un
   * `Set` di toolCallId PER GIRO (non una Map messageId-per-giro come
   * sopra: una tool-call non ha un "messaggio", ha un `toolCallId` già
   * suo — vedi `talosHarness.mjs`, `tipo:'tool-inizio'`/`'tool-args'`).
   * Popolato al primo `tool-inizio` di un id, letto (e svuotato) quando
   * `onGiro` segnala la fine del giro — stesso ciclo di vita delle due
   * Map sopra, stessa ragione: mai un ToolCallStart/Args duplicato
   * quando `eventiPerRisposta` traduce la risposta finale.
   */
  const toolCallIdStreamatiPerGiro = new Map();
  /*
   * ⭐ SEMPRE passato (non condizionato da `reasoning`): chiedere lo
   * streaming del TESTO è a costo zero — stessi token, consegnati a
   * pezzi invece che in un colpo solo — mentre `reasoning` da solo
   * cambia comportamento/costo del modello ed è per questo opzionale.
   * Le due cose sono indipendenti in chiamaConRitenta (vedi la sua doc).
   */
  const onDelta = (evento) => {
    if (evento.tipo === 'tool-inizio' || evento.tipo === 'tool-args') {
      /*
       * ⭐⭐⭐ Piano procedi-col-generare-un-snoopy-neumann.md, Fase 4 —
       * argomenti di tool-call a pezzi, il canale che mancava (prima
       * d'ora `ToolCallArgs` arrivava tutto insieme, a fine giro — vedi
       * `eventiPerRisposta`). `app.js` gestisce già oggi argomenti
       * parziali con ri-parse tollerante: zero modifiche frontend.
       */
      let streamati = toolCallIdStreamatiPerGiro.get(evento.giro);
      if (!streamati) { streamati = new Set(); toolCallIdStreamatiPerGiro.set(evento.giro, streamati); }
      if (evento.tipo === 'tool-inizio') {
        streamati.add(evento.toolCallId);
        onEvento(toolCallStart({ toolCallId: evento.toolCallId, toolCallName: evento.nome }));
        return;
      }
      onEvento(toolCallArgs({ toolCallId: evento.toolCallId, delta: evento.delta }));
      return;
    }
    /*
     * ⛔⛔⛔ 11/09/2026, owner: «se la UI è avvisata di N attrezzi partiti, deve
     * vedere finire N». Il kernel annuncia un `tool-inizio` appena una chiamata
     * comincia, ma DUE strade la lasciano senza esito — la valanga di copie
     * identiche del modello locale (misurato: 4 annunciate, 2 sopravvissute) e
     * lo stop premuto a metà risposta (2 annunciate, 2 orfane). In entrambi i
     * casi restavano indicatori che giravano per sempre.
     *
     * ⭐ Si chiude con un `ToolCallResult`, cioè un evento che il frontend
     * DISEGNA GIÀ: nessuna riga di UI cambia. È la forma che la spec AG-UI
     * prescrive (`messageId` + `toolCallId` + `content`, `role` opzionale —
     * `docs/concepts/messages.mdx`, letto via ctx7 l'11/09/2026) e la cura che
     * ag-ui#1168 descrive per lo stesso guasto: «a fresh message ID is used so
     * the client creates a proper standalone ToolMessage and closes the spinner
     * correctly».
     *
     * ⛔ E il `content` PORTA IL MOTIVO, non è un segnaposto vuoto: openclaw
     * #42112 («persisted orphaned toolCall poisons session replay») vale anche
     * per noi, perché `session-registry.mjs` persiste questi eventi — chi
     * rilegge la sessione domani deve trovare scritto perché quell'attrezzo non
     * è mai partito, non un buco.
     */
    if (evento.tipo === 'tool-annullato') {
      onEvento(eventoPerEsitoTool({ messageId: randomUUID(), toolCallId: evento.toolCallId, content: evento.motivo }));
      return;
    }
    /*
     * ⛔⛔ E QUI SOTTO C'ERA UNA TRAPPOLA: la riga successiva manda al ramo
     * «ragionamento» QUALUNQUE tipo che non sia 'testo' — cioè un tipo nuovo,
     * aggiunto un giorno nel kernel da chi non legge questo file, sarebbe
     * comparso a schermo come un ragionamento del modello, inventato di sana
     * pianta. È esattamente il motivo per cui `tool-annullato` non poteva
     * essere emesso dal solo kernel. Adesso i tipi sconosciuti si IGNORANO:
     * non sapere e mentire non sono la stessa cosa.
     */
    if (evento.tipo !== 'testo' && evento.tipo !== 'ragionamento') return;
    const mappa = evento.tipo === 'testo' ? messaggiTestoPerGiro : messaggiRagionamentoPerGiro;
    let messageId = mappa.get(evento.giro);
    if (!messageId) {
      messageId = randomUUID();
      mappa.set(evento.giro, messageId);
      onEvento(evento.tipo === 'testo'
        ? textMessageStart({ messageId })
        : reasoningMessageStart({ messageId }));
    }
    onEvento(evento.tipo === 'testo'
      ? textMessageContent({ messageId, delta: evento.delta })
      : reasoningMessageContent({ messageId, delta: evento.delta }));
  };

  const onGiro = (evento) => {
    if (evento.tipo === 'risposta') {
      /*
       * ⛔ Chiude PRIMA di tradurre la risposta finale: un consumer che
       * legge gli eventi in ordine deve vedere End prima del prossimo
       * Start (di un giro successivo), mai i due mescolati.
       */
      const messageIdTesto = messaggiTestoPerGiro.get(evento.giro);
      if (messageIdTesto) { onEvento(textMessageEnd({ messageId: messageIdTesto })); messaggiTestoPerGiro.delete(evento.giro); }
      const messageIdRagionamento = messaggiRagionamentoPerGiro.get(evento.giro);
      if (messageIdRagionamento) { onEvento(reasoningMessageEnd({ messageId: messageIdRagionamento })); messaggiRagionamentoPerGiro.delete(evento.giro); }
      /*
       * ⭐⭐⭐ Piano procedi-col-generare-un-snoopy-neumann.md, Fase 4 —
       * stesso principio delle due righe sopra, applicato alle
       * tool-call: `toolCallsGiaStreamate` dice a `eventiPerRisposta`
       * quali id non ri-emettere (già mandati a pezzi da onDelta sopra).
       * Letto QUI, poi tolto — un giro successivo riparte da un Set
       * vuoto, mai quello del giro precedente.
       */
      const toolCallsGiaStreamate = toolCallIdStreamatiPerGiro.get(evento.giro);
      if (toolCallsGiaStreamate) toolCallIdStreamatiPerGiro.delete(evento.giro);

      const messageId = randomUUID();
      for (const e of eventiPerRisposta(evento.risposta, { messageId, testoGiaStreamato: Boolean(messageIdTesto), toolCallsGiaStreamate })) onEvento(e);
      /*
       * ⭐⭐⭐ Piano procedi-col-generare-un-snoopy-neumann.md, Fase 3 —
       * `evento.totali`, quando presente (talosHarness.mjs lo omette
       * finché nessun giro ha mai riportato `usage`), è già la somma
       * cumulativa fino a questo giro: inoltrato com'è, dopo gli eventi
       * della risposta (un consumer vede prima il testo/tool-call del
       * giro, poi il totale aggiornato — mai il contrario).
       */
      if (evento.totali) onEvento(eventoPerUsage(evento.totali));
      return;
    }
    /*
     * ⛔ D-10B — l'uscita mentre esce. Sta PRIMA di `tool-esito` perche' e' cio' che arriva prima:
     *   chi legge gli eventi in ordine vede l'avanzamento e poi il risultato, mai il contrario.
     */
    if (evento.tipo === 'tool-uscita') {
      onEvento(toolCallOutput({ toolCallId: evento.toolCallId, delta: evento.delta }));
      return;
    }
    if (evento.tipo === 'tool-esito') {
      onEvento(eventoPerEsitoTool({ messageId: randomUUID(), toolCallId: evento.toolCallId, content: evento.content }));
    }
  };

  /*
   * ⭐ 27/8 — `esisteva` ora arriva DIRETTAMENTE da `talosHarness.mjs`
   * (`premessaDellaScrittura`, che lo calcola comunque leggendo `prima`
   * per il cancello semantico): dice se il file era già sul disco PRIMA
   * di questa scrittura. Prima di questa riga era una approssimazione
   * per sessione (un `Set` di percorsi già scritti IN QUESTA sessione),
   * che etichettava "nuovo" ogni file toccato per la prima volta nel
   * run anche se esisteva da sempre su disco — bug del pannello Review.
   *
   * ⭐⭐⭐ 27/8 (secondo giro) — `contenutoPrima`, quarto argomento:
   * stessa storia di `esisteva`, un livello più in la. `talosHarness.mjs`
   * ora tiene (invece di buttare) il testo che legge comunque dal disco
   * per calcolare `esisteva` — questo file lo inoltra cosi' com'e', zero
   * logica qui: la traduzione in un formato di evento vive tutta in
   * `agui-events.mjs`, come per `esisteva`.
   */
  const onScrittura = (percorso, contenuto, esisteva, contenutoPrima) => {
    onEvento(eventoPerScrittura({ percorso, contenuto, esisteva, contenutoPrima }));
  };

  /*
   * ⭐⭐⭐ 28/8 — side-channel dell'attrezzo `artifact_create` (talosHarness.mjs),
   * STESSO principio di `onScrittura`: il tool torna al modello una riga di
   * testo ("created: ..."), l'HTML vero arriva qui, separato, per diventare
   * un evento AG-UI che il frontend può renderizzare (iframe sandboxato —
   * vedi app.js). Se assente (nessun `talosLavora` la offre mai a
   * TALOS-BANCO), il kernel usa un id locale deterministico: qui SEMPRE
   * presente, quindi SEMPRE questo id vince, mai quello di fallback.
   */
  const onArtefatto = async (titolo, html) => {
    if (Buffer.byteLength(html, 'utf8') > ARTEFATTO_MAX_BYTE) {
      // ⛔ Nessun evento, niente salvato: il tool torna comunque un id (il modello non deve credere che nulla sia successo), ma la UI non riceve mai un artefatto troncato/enorme.
      return { id: `artefatto-rifiutato-troppo-grande-${randomUUID()}` };
    }
    const id = randomUUID();
    salvaArtefattoFn(id, html);
    onEvento(artifactCreated({ messageId: randomUUID(), id, titolo }));
    /*
     * La copia durevole, in Libreria. ⛔ Non blocca e non fa fallire il giro: se la Libreria non è
     * scrivibile l'artefatto resta comunque a schermo e apribile — meglio un artefatto senza copia
     * che un giro rotto per una scrittura. Il motivo si vede nel log del server, mai in silenzio.
     */
    try {
      await salvaVoceLibreriaFn({
        cartella,
        nome: `${(titolo || 'artefatto').replace(/[\\/:*?"<>|]/g, '-').slice(0, 80)}.html`,
        mediaType: 'text/html',
        origine: 'generated',
        /* ⭐ BC-38 (12/09/2026) — «da chi è stato creato» a schermo: `salvaVoce` tiene
           `modello` solo per le voci generate, e questa lo è. Senza, il dettaglio poteva dire
           soltanto «il modello» — misurato: 14 voci su 14 sul disco dell'owner erano senza. */
        modello,
        testo: html,
      });
    } catch (errore) {
      console.error('[artefatti] copia in Libreria non riuscita:', errore instanceof Error ? errore.message : errore);
    }
    return { id };
  };

  /*
   * ⭐⭐⭐ 28/8 — side-channel dell'attrezzo `document_create`
   * (talosHarness.mjs), stesso principio di `onArtefatto`/`onScrittura`:
   * il kernel resta a zero dipendenze, la generazione vera (7 librerie
   * npm — owner 28/8, "sì, aggiungile", SOLO qui) vive interamente in
   * questo backend. Pipeline identica al mobile
   * (documentTools.ts/documentGenerator.ts, letti per intero prima di
   * scrivere): generate → verify → salva — MAI il passo dopo se quello
   * prima è fallito, e ogni fallimento porta la RAGIONE vera, non un
   * "errore tecnico" generico.
   *
   * ⛔⛔ 07/9, O-37 — owner: «con i modelli a chiave API gli artefatti vengono creati ma non
   * salvati nella Libreria». RIPRODOTTO con un giro vero (GLM 5.3 Flash, istanza di prova 4311):
   * il `.docx` finiva nel workspace, e in Libreria non arrivava niente. La causa era QUI, e non era
   * un guasto: era un commento rimasto indietro. Diceva «qui non c'è una Libreria (il desktop non ne
   * ha una)» — vero fino al 28/8, falso dal 29/8, quando è nata la FASE N. `onArtefatto` (gli
   * artefatti HTML) la copia c'era già; `onDocumento` no, e il modello usa proprio questo.
   * ⇒ Il file finisce nel WORKSPACE vero, stesso
   * trattamento di `scrivi`: un evento StateDelta con `op:'add'` (mai
   * 'replace' — creaFileWorkspaceFn rifiuta un nome già esistente,
   * quindi ogni successo qui È per costruzione un file nuovo) fa scattare
   * lo stesso refresh dell'albero già provato per `scrivi`
   * (`segnalaScritturaNellAlbero`, app.js) — nessun meccanismo nuovo sul
   * frontend. Il `value` è il testo VERO per i formati testuali (si
   * vede nella scheda Review, come un file scritto normale); per i
   * formati binari (docx/xlsx/pptx/pdf) è una riga onesta — mai i byte
   * grezzi dentro un evento SSE/JSON, che li corromperebbe comunque
   * (non sono UTF-8 valido).
   */
  /*
   * ⛔⛔⛔ BC-11 (11/09/2026) — «MODE» LO SCRIVE IL MODELLO, E LO SCRIVE COME GLI PARE.
   *
   * Il kernel consegna `argomenti` VERBATIM a questo callback (talosHarness.mjs:6175,
   * `onDocumento(argomenti)`; il commento alla riga 5069 lo dichiara: «`argomenti` passa SEMPRE
   * verbatim»), quindi una chiave che lo schema non nomina arriva qui intatta. È l'unico posto in
   * cui la modalità può essere letta senza toccare il kernel.
   *
   * ⛔ Perché tre nomi e non uno: misurato sulle due sessioni di BC-11, il modello ha sbagliato il
   *   nome dell'argomento **46 volte su 308 chiamate** — `shell.command` invece di `comando` 39
   *   volte (30 nella sessione `8dde6bff`, 9 nella `37e10d21`), `scrivi.path` 2, `scrivi.content`
   *   1, `scrivi.contuto` 1 (un refuso suo). Ogni volta il campo arrivava `undefined` e il giro era
   *   perso. Non è un difetto del nostro modello: anthropics/claude-quickstarts#348 (letto
   *   11/09/2026) documenta la stessa cosa sull'implementazione di riferimento del fornitore — «the
   *   class expects `new_str`… but Claude actually outputs `insert_text`. This causes insert
   *   commands to fail». ⇒ Si accettano gli alias, in UN posto solo. Stessa scelta di hermes-agent
   *   v0.21, che sul suo `patch` accetta entrambe le forme e ne pubblicizza una sola
   *   (`tools/file_tools.py:2747`, PATCH_SCHEMA: «The handler accepts BOTH shapes from any model
   *   regardless»).
   * ⛔ E `append:true` come booleano è la terza forma perché è quella che un modello scrive quando
   *   l'idea gliel'ha data la frase «call it again to append», non un nome di enum.
   */
  const MODALITA_DOCUMENTO = { append: 'accoda', accoda: 'accoda', add: 'accoda', new: 'nuovo', nuovo: 'nuovo', create: 'nuovo', replace: 'nuovo' };
  const modalitaDelDocumento = (argomenti) => {
    if (argomenti?.append === true) return 'accoda';
    const grezza = argomenti?.mode ?? argomenti?.modalita ?? argomenti?.modality;
    if (grezza === undefined || grezza === null || grezza === '') return 'nuovo';
    return MODALITA_DOCUMENTO[String(grezza).trim().toLowerCase()] ?? null; // null = detto male: si risponde a parole, non si indovina
  };
  /*
   * ⛔ I formati BINARI non si accodano, e non è una prudenza: un `.docx`/`.xlsx`/`.pptx` è uno zip
   *   e un `.pdf` ha un trailer con la tavola degli offset in fondo — concatenare due file di
   *   questi tipi produce un file che si APRE come corrotto, cioè il peggiore degli esiti: una
   *   scrittura «riuscita» che ha distrutto il lavoro dei giri precedenti. L'insieme è lo stesso
   *   `testuale` già usato più sotto per decidere cosa mostrare in chat: una definizione sola.
   */
  /*
   * ⛔⛔ E `html` NON è accodabile, contro ogni aspettativa — l'ho verificato nel generatore prima
   *   di scriverlo, non dedotto: `document-generator.mjs:234-245` non scrive `body` così com'è, lo
   *   AVVOLGE (`<!doctype html>`, `<html><head>…`, un `<h1>` col titolo, ogni blocco separato da
   *   riga vuota dentro un `<p>`, poi `</body></html>`) e lo passa da `escapeHtml`. Accodare un
   *   secondo documento completo a uno che finisce con `</body></html>` produce un file con due
   *   doctype: una scrittura «riuscita» che rompe il risultato. I formati sorgente
   *   (`TALOS_SOURCE_TEXT_FORMATS`) passano invece VERBATIM (`document-generator.mjs:223-225`), e
   *   `md`/`csv` sono testo piatto — quelli sì.
   * ⛔ Che `format:'html'` non sappia scrivere una pagina scritta a mano è un difetto a parte, più
   *   grande di questo, e sta nel rapporto: NON è questa funzione a poterlo curare.
   */
  const formatoAccodabile = (formato) => TALOS_SOURCE_TEXT_FORMATS.includes(formato) || ['md', 'csv'].includes(formato);

  const onDocumento = async (argomenti) => {
    const modalita = modalitaDelDocumento(argomenti);
    if (modalita === null) {
      return {
        ok: false,
        esito: `"${argomenti?.mode ?? argomenti?.modalita}" is not a mode. Use mode:"append" to add to the end of an existing file, or leave mode out to create a new one.`,
      };
    }
    let documento;
    try {
      documento = await generateTalosDocumentFn(argomenti);
    } catch (errore) {
      const dettaglio = errore instanceof Error ? errore.message : String(errore);
      return { ok: false, esito: `The document was not created: ${dettaglio}` };
    }
    if (modalita === 'accoda' && !formatoAccodabile(documento.format)) {
      return {
        ok: false,
        esito: `A .${documento.format} file cannot be appended to: it is a binary container, and joining two of them produces a corrupt file. `
          /* ⛔ 11/9 — `html` era in questo elenco e NON è accodabile: `formatoAccodabile` (sei righe
             sopra) ammette `TALOS_SOURCE_TEXT_FORMATS` più `md` e `csv`, e `html` non è in nessuno
             dei due. Il commento sopra lo diceva già, questa riga no: il suggerimento mandava il
             modello dritto sull'errore che stava rifiutando. */
          + 'Send the whole document in one call, or use a text format (md, csv, txt, or a source format) if you need to build it in pieces.',
      };
    }

    const controllo = await verifyTalosDocumentFn(documento);
    if (!controllo.ok) {
      return {
        ok: false,
        esito: `The file was written but failed its check (${controllo.detail}), so it was discarded. Tell the user, and try a simpler structure.`,
      };
    }

    let salvato;
    try {
      salvato = await creaFileWorkspaceFn({ cartella: cartellaPerCreare, nome: documento.fileName, bytes: documento.bytes, modalita });
    } catch (errore) {
      const dettaglio = errore instanceof WorkspaceFileError ? errore.message : (errore instanceof Error ? errore.message : String(errore));
      /*
       * ⛔⛔⛔ BC-11 — ERA QUESTO MESSAGGIO A INSEGNARE `_p2.html`.
       *
       * Fino all'11/09/2026 un nome già preso rispondeva «Do not silently retry with the same name
       * — offer a different title, or ask»: cioè l'harness stesso diceva al modello di inventarsi un
       * NOME DIVERSO. Nelle due sessioni di BC-11 il modello ha fatto esattamente questo di sua
       * iniziativa — `_p2.html`, `_p3.html`, `_p4.html`, `_p5.html`, `_p6core.js` e poi un passo di
       * «assemblaggio» che non è mai arrivato in fondo.
       * ⇒ Un rifiuto deve nominare la STRADA GIUSTA, non solo vietarne una. È la forma che usa
       *   cline nell'errore del suo `insert_line` (`sdk-diff-edit-coordinator.ts:401`, letto
       *   11/09/2026): non dice solo che il valore è fuori intervallo, dice «Use N to append at
       *   EOF» — il messaggio porta la mossa successiva.
       * ⛔ Il ramo `FILE_EXISTS` è distinto dagli altri perché è l'unico con una strada giusta da
       *   nominare: un tetto superato o un contenuto mancante vogliono altro, e il loro messaggio
       *   (scritto in `workspace-files.mjs`) lo dice già.
       */
      if (errore instanceof WorkspaceFileError && errore.code === 'FILE_EXISTS') {
        return {
          ok: false,
          esito: `"${documento.fileName}" already exists. To ADD to it, call document_create again with the same title and mode:"append" — the new body goes at the end of that same file. `
            + 'To make a separate file instead, use a different title. Do not invent numbered variants of the same name.',
        };
      }
      return {
        ok: false,
        esito: `"${documento.fileName}" was created and checked, but it could not be saved to the workspace: ${dettaglio}`,
      };
    }

    const testuale = TALOS_SOURCE_TEXT_FORMATS.includes(documento.format) || ['md', 'csv', 'html'].includes(documento.format);
    const valore = testuale ? new TextDecoder('utf-8').decode(documento.bytes) : `[binary ${documento.format} file, ${documento.bytes.byteLength} bytes]`;
    /*
     * ⛔ PO-05 — `[binary docx file, 7714 bytes]` è una riga onesta e inservibile: dice che il file
     *   esiste e non dà modo di averlo. L'allegato viaggia accanto al valore (mai al posto suo: chi
     *   legge la chat come testo continua a vedere la stessa riga di prima) e porta il minimo per
     *   costruire il collegamento — nome, formato, byte. I BYTE no: quelli stanno dietro la rotta.
     * ⛔ Vale per TUTTI i formati, non solo i binari: anche un `.md` generato si scarica con un clic,
     *   ed è la differenza fra «te lo mostro» e «te lo do».
     */
    /*
     * ⛔ BC-11 — `esisteva` era scritto `false` a mano, e la ragione stava nel commento sopra
     *   («creaFileWorkspaceFn rifiuta un nome già esistente, quindi ogni successo qui È per
     *   costruzione un file nuovo»). Con `mode:"append"` quella costruzione non vale più: un
     *   successo può ora atterrare su un file che c'era. Si legge dall'esito VERO della scrittura
     *   (`salvato.accodato`), mai da una costanza che non è più vera — un pannello Review che dice
     *   «nuovo» su un file cresciuto è la stessa classe di bugia che questo file rifiuta altrove.
     */
    onEvento(eventoPerScrittura({
      percorso: percorsoNellAlbero(salvato.percorso),
      contenuto: valore,
      esisteva: salvato.accodato === true,
      allegato: { nome: documento.fileName, formato: documento.format, byte: documento.bytes.byteLength },
    }));

    /*
     * La copia durevole in Libreria, come per gli artefatti HTML. ⛔ Non blocca e non fa fallire il
     * giro: se la Libreria non è scrivibile il documento resta comunque nel workspace, dove il
     * modello l'ha messo — meglio un documento senza copia che un giro rotto per una scrittura. Il
     * motivo si vede nel log del server, mai in silenzio.
     * ⛔ I binari viaggiano in base64 (`salvaVoce` lo prevede): un `docx` dentro un campo di testo
     *   non è UTF-8 valido e si corromperebbe.
     */
    /*
     * ⛔ BC-11 — una AGGIUNTA non è una voce nuova di Libreria. Copiare in Libreria anche i pezzi
     *   accodati produrrebbe N voci con lo stesso nome per UN file (e `salvaVoce` le terrebbe
     *   tutte): la Libreria custodisce documenti, non frammenti. Il file intero resta nel
     *   workspace, che è dove il modello e la persona lo vedono; la copia durevole si fa quando il
     *   documento NASCE. ⇒ Se un giorno servirà la copia del file completo, vorrà rileggere il
     *   file dal disco — non concatenare i pezzi qui, che sarebbe un secondo stato da tenere
     *   allineato.
     */
    if (salvato.accodato !== true) {
      try {
        await salvaVoceLibreriaFn({
          cartella,
          nome: documento.fileName,
          mediaType: documento.mediaType,
          origine: 'generated',
          modello, // ⭐ BC-38: chi ha scritto il documento, letto dal meta e mai dedotto dal nome
          ...(testuale
            ? { testo: new TextDecoder('utf-8').decode(documento.bytes) }
            : { base64: Buffer.from(documento.bytes).toString('base64') }),
        });
      } catch (errore) {
        console.error('[documenti] copia in Libreria non riuscita:', errore instanceof Error ? errore.message : errore);
      }
    }

    const dimensione = Math.max(1, Math.round(documento.bytes.byteLength / 1024));
    /*
     * ⛔⛔ BC-11 — L'ESITO DICE LA MOSSA SUCCESSIVA, ed è la parte che fa risparmiare i giri.
     *   Lo schema di `document_create` vive nel kernel e non nomina `mode` (fuori dalla mia lane:
     *   vedi il rapporto), quindi l'UNICO canale per far sapere al modello che l'aggiunta esiste è
     *   il risultato dell'attrezzo — che il modello legge per intero, a ogni giro. È la stessa
     *   scelta di hermes-agent v0.21 (`tools/file_tools.py:2729`), che nella risposta di
     *   `write_file` mette «The result's verified:true means the on-disk content hash was
     *   confirmed — do NOT re-read the file to check the write landed»: una riga nell'esito che
     *   toglie un giro di verifica a ogni scrittura.
     * ⛔ Solo per i formati accodabili: suggerire l'aggiunta su un `.docx` sarebbe un consiglio che
     *   porta a un file corrotto.
     */
    const comeContinuare = formatoAccodabile(documento.format)
      ? ' To make it longer, call document_create again with the same title and mode:"append" instead of writing a second file.'
      : '';
    if (salvato.accodato === true) {
      const totale = Math.max(1, Math.round((salvato.byteTotali ?? documento.bytes.byteLength) / 1024));
      return {
        ok: true,
        esito: `Appended ${dimensione} KB to "${documento.fileName}" — it is now ${totale} KB. Checked by reopening it: ${controllo.detail}.${comeContinuare}`,
      };
    }
    return {
      ok: true,
      esito: `Created "${documento.fileName}" (${dimensione} KB) in the workspace. Checked by reopening it: ${controllo.detail}.${comeContinuare}`,
    };
  };

  /*
   * ⭐⭐⭐ 29/8 — side-channel dell'attrezzo `generate_image`
   * (talosHarness.mjs), STESSO principio di `onDocumento` appena
   * sopra: il kernel resta a zero dipendenze, la chiamata vera vive
   * qui (`image-generator.mjs`). A differenza di `onDocumento` non
   * c'è un passo "verify" separato — `generaImmagineFn` stessa lancia
   * se la risposta è malformata (vedi la sua doc, `TALOS_IMAGE_*`),
   * quindi il primo `try` copre GENERAZIONE, non solo la chiamata di
   * rete grezza.
   */
  const onImmagine = async (argomenti) => {
    // ⛔ difesa in profondità: `immagine` è SEMPRE presente quando session-registry.mjs offre questo attrezzo (config.mjs, parseImmagine non torna mai undefined) — ma un chiamante diverso di agent-service.mjs che offra 'generate_image' senza wireare `immagine` non deve MAI vedere un crash, stesso principio onesto di web_search senza provider.
    if (!immagine) {
      return { ok: false, esito: 'image generation is not configured on this harness: no model was set.' };
    }
    let immagineGenerata;
    const prompt = String(argomenti?.prompt ?? '');
    try {
      immagineGenerata = await generaImmagineFn({
        prompt, shape: argomenti?.shape, modello: immagine.modello, nativo: immagine.nativo, chiave,
      });
    } catch (errore) {
      const dettaglio = errore instanceof Error ? errore.message : String(errore);
      return { ok: false, esito: `The image was not generated: ${dettaglio}` };
    }

    const estensione = ESTENSIONE_PER_MEDIA_TYPE[immagineGenerata.mediaType] ?? 'png';
    let persistito = null;
    if (typeof persistGeneratedImageFn === 'function') {
      try {
        persistito = await persistGeneratedImageFn({
          bytes: immagineGenerata.bytes,
          mimeType: immagineGenerata.mediaType,
          source: `openrouter/${immagine.modello}`,
          promptHash: createHash('sha256').update(prompt).digest('hex'),
        });
      } catch (errore) {
        const dettaglio = errore instanceof Error ? errore.message : String(errore);
        return {
          ok: false,
          esito: `The image was generated but could not be saved safely: ${dettaglio}. Check local storage in Doctor before trying again.`,
        };
      }
    }
    let salvato;
    try {
      salvato = await creaFileWorkspaceFn({ cartella: cartellaPerCreare, nome: `${immagineGenerata.fileStem}.${estensione}`, bytes: immagineGenerata.bytes });
    } catch (errore) {
      if (persistito?.id && typeof removeGeneratedImageFn === 'function') await removeGeneratedImageFn(persistito.id).catch(() => {});
      const dettaglio = errore instanceof WorkspaceFileError ? errore.message : (errore instanceof Error ? errore.message : String(errore));
      return {
        ok: false,
        esito: `The image was generated but could not be saved to the workspace: ${dettaglio}. Do not silently retry with the same prompt — offer a different title, or ask.`,
      };
    }

    // ⛔ mai i byte grezzi dentro un evento SSE/JSON (non sono UTF-8 valido) — stessa disciplina già in uso per un documento binario in onDocumento.
    /*
     * ⛔⛔ 10/09, owner: «OGNI artefatto va salvato in libreria». Misurato in questo file prima di
     *   toccarlo: `salvaVoceLibreriaFn` era chiamata DUE volte — per l'artefatto HTML e per il
     *   documento — e l'immagine generata non era nessuna delle due. Finiva solo nel workspace, e chi
     *   riapriva la sessione domani non la ritrovava fra le cose prodotte.
     * ⛔ Come per l'artefatto e il documento, questa scrittura NON blocca e non fa fallire il giro: se
     *   la Libreria non è scrivibile l'immagine resta comunque nel workspace, dove il modello l'ha
     *   messa. Meglio un'immagine senza copia che un giro rotto per una copia.
     * ⛔ I byte viaggiano in base64 (`salvaVoce` lo prevede): un PNG dentro un campo di testo non è
     *   UTF-8 valido e si corromperebbe — lo stesso motivo per cui il documento binario fa così.
     */
    try {
      await salvaVoceLibreriaFn({
        cartella,
        nome: `${immagineGenerata.fileStem}.${estensione}`,
        mediaType: immagineGenerata.mediaType,
        origine: 'generated',
        /* ⭐ BC-38: qui l'autore è il modello di IMMAGINE, non quello della conversazione — sono
           due cose diverse (`immagine.modello`, riga 1303) e scriverne uno per l'altro sarebbe una
           provenienza falsa. Ripiego sul modello della sessione solo se il primo manca. */
        modello: immagine?.modello || modello,
        base64: Buffer.from(immagineGenerata.bytes).toString('base64'),
      });
    } catch (errore) {
      console.error('[immagini] copia in Libreria non riuscita:', errore instanceof Error ? errore.message : errore);
    }
    /*
     * ⛔ PO-05, stessa cura del documento: `[image image/png, 51234 bytes]` è una riga onesta e
     *   inservibile. Con l'allegato accanto, la chat costruisce la scheda con nome, formato,
     *   dimensione misurata e il collegamento che scarica i byte veri.
     */
    onEvento(eventoPerScrittura({
      percorso: percorsoNellAlbero(salvato.percorso),
      contenuto: `[image ${immagineGenerata.mediaType}, ${immagineGenerata.bytes.byteLength} bytes]`,
      esisteva: false,
      allegato: { nome: `${immagineGenerata.fileStem}.${estensione}`, formato: estensione, byte: immagineGenerata.bytes.byteLength },
    }));

    const dimensioneKb = Math.max(1, Math.round(immagineGenerata.bytes.byteLength / 1024));
    return {
      ok: true,
      esito: `Generated and saved "${salvato.percorso}" (${dimensioneKb} KB) with ${immagine.modello}.`,
    };
  };

  /*
   * ⭐⭐⭐ 29/8 — FASE N (Libreria), prima fetta. `argomenti` è quello che
   * il modello ha scritto (i nomi di campo inglesi dello schema JSON —
   * `origin`/`file_type`/`page_size`/`page_token`, ecc., mai tradotti
   * qui): la traduzione verso i nomi italiani di library-store.mjs vive
   * SOLO in questi quattro punti, che il kernel non vede.
   *
   * `cursoriLibreria` — una Map per QUESTO run (stessa vita di
   * `libraryListCursors` mobile, un'istanza per chat): un `page_token`
   * sopravvive fra i giri dello STESSO run, non fra due run diversi —
   * un resume/follow-up ricostruisce agent-service da capo, quindi un
   * token vecchio torna onestamente CURSOR_INVALID (il contratto del
   * tool lo prevede già, mai un crash).
   */
  const cursoriLibreria = creaCursoriLibreria();
  const onLibreriaLista = async (argomenti) => {
    const voci = await elencaVociFn({ cartella });
    return impaginaVociLibreria(voci, {
      origine: argomenti?.origin ?? 'all',
      fileType: argomenti?.file_type ?? 'all',
      pageSize: argomenti?.page_size ?? 10,
      pageToken: argomenti?.page_token,
    }, cursoriLibreria);
  };
  const onLibreriaCerca = async (argomenti) => {
    const voci = await elencaVociConTestoFn({ cartella });
    return cercaVociLibreria(voci, { query: argomenti?.query ?? '', limit: argomenti?.limit ?? 5, offset: argomenti?.offset ?? 0 });
  };
  const onLibreriaLeggi = async (argomenti) => leggiVoceFn({ cartella, id: argomenti?.id ?? '' });
  const onLibreriaOrigine = async (argomenti) => origineVoceFn({ cartella, id: argomenti?.id ?? '' });

  /*
   * ⭐⭐⭐ 29/8 — FASE N, seconda fetta (mutazioni). Stesso contratto
   * ESATTO di onDocumento/onImmagine sopra: `(spec) => {ok, esito}` —
   * il kernel passa `argomenti` (i nomi di campo inglesi dello schema
   * JSON: id/name/reference) verbatim; questi tre scrivono il
   * messaggio finale PER INTERO (a differenza dei 4 callback di
   * lettura sopra, che tornano dati grezzi per un formattatore del
   * kernel — qui l'esito è un singolo messaggio, non una pagina).
   */
  const onLibreriaRinomina = async (argomenti) => {
    const risultato = await rinominaVoceFn({ cartella, id: argomenti?.id ?? '', nome: argomenti?.name ?? '' });
    if (!risultato) {
      return { ok: false, esito: `No Library file has the id "${argomenti?.id}". Use library_list or library_search to find it.` };
    }
    return { ok: true, esito: `Renamed «${risultato.nomePrima}» to «${risultato.nomeDopo}».` };
  };

  const onLibreriaElimina = async (argomenti) => {
    const risultato = await eliminaVoceFn({ cartella, id: argomenti?.id ?? '' });
    if (!risultato) {
      return { ok: false, esito: `No Library file has the id "${argomenti?.id}". It may already be gone.` };
    }
    return { ok: true, esito: `«${risultato.nome}» has been removed from the Library.` };
  };

  /*
   * ⭐⭐⭐ 29/8 — FASE N, library_export. A differenza di onDocumento/
   * onImmagine (generano contenuto NUOVO): qui il contenuto esiste già
   * nella Libreria — "esportare" sul desktop vuol dire materializzarlo
   * come file vero DENTRO il workspace stesso, riusando
   * `creaFileWorkspaceFn` (già iniettato per onDocumento/onImmagine,
   * nessuna funzione nuova). Nessun picker di sistema: quel confine
   * (Libreria privata → storage condiviso) esiste solo su Android —
   * vedi la doc nel kernel. Un nome già occupato nel workspace
   * rifiuta onestamente (`creaFileWorkspaceFn` lancia `FILE_EXISTS`),
   * mai una sovrascrittura silenziosa.
   */
  const onLibreriaEsporta = async (argomenti) => {
    const voci = await elencaVociFn({ cartella });
    const trovata = trovaVoceLibreria(voci, argomenti?.reference ?? '');
    if (!trovata) {
      return { ok: false, esito: `No available Library file exactly matches "${argomenti?.reference}". Ask for the exact filename or Library id.` };
    }
    if (trovata.ambiguo) {
      return { ok: false, esito: `More than one Library file is named "${argomenti?.reference}". Ask the user which one; do not choose for them.` };
    }
    const letta = await leggiVoceFn({ cartella, id: trovata.id });
    if (!letta) {
      return { ok: false, esito: `"${trovata.nome}" is no longer available. No copy was saved.` };
    }
    const bytes = letta.immagineBase64 ? Buffer.from(letta.immagineBase64, 'base64') : Buffer.from(letta.testo ?? '', 'utf8');
    let salvato;
    try {
      salvato = await creaFileWorkspaceFn({ cartella: cartellaPerCreare, nome: letta.nome, bytes });
    } catch (errore) {
      const dettaglio = errore instanceof WorkspaceFileError ? errore.message : (errore instanceof Error ? errore.message : String(errore));
      return { ok: false, esito: `"${letta.nome}" could not be saved into the workspace: ${dettaglio}. Do not silently retry with the same name — offer a different name, or ask.` };
    }
    // ⛔ mai i byte grezzi dentro un evento SSE/JSON — stessa disciplina già in uso per un documento/immagine binari in onDocumento/onImmagine.
    onEvento(eventoPerScrittura({ percorso: percorsoNellAlbero(salvato.percorso), contenuto: letta.immagineBase64 ? `[image, ${bytes.byteLength} bytes]` : (letta.testo ?? ''), esisteva: false }));
    return { ok: true, esito: `Exported "${letta.nome}" into the workspace (${bytes.byteLength} bytes).` };
  };

  /*
   * ⭐⭐⭐ 29/8 — FASE N, terza fetta (library_context_policy_update).
   * `ricevutePolitica` — una Map per QUESTO run (stessa vita di
   * `cursoriLibreria` sopra): un `receipt_id` non sopravvive a un
   * resume — `undo` con un id di un run precedente torna onestamente
   * "non trovato" (mobile stesso lo prevede come esito normale).
   *
   * La validazione per-azione ("mode è richiesto solo per set_mode",
   * porto di `libraryContextPolicyTools.ts`, il `.superRefine` Zod
   * vive QUI perché il kernel passa `argomenti` verbatim, senza
   * saperne il significato) vive PRIMA della lettura della politica:
   * un input incompleto non deve costare un giro di I/O.
   */
  const ricevutePolitica = creaRicevutePoliticaLibreria();
  const onLibreriaPolitica = async (argomenti) => {
    const azione = argomenti?.action;
    const campoMancante = (campo) => ({ ok: false, esito: `${campo} is required when action is ${azione}. Nothing was changed.` });
    if (azione === 'set_mode' && typeof argomenti?.mode !== 'string') return campoMancante('mode');
    if (azione === 'set_enabled' && typeof argomenti?.enabled !== 'boolean') return campoMancante('enabled');
    if ((azione === 'include_files' || azione === 'exclude_files') && !Array.isArray(argomenti?.file_ids)) return campoMancante('file_ids');
    if (azione === 'undo' && typeof argomenti?.receipt_id !== 'string') return campoMancante('receipt_id');

    let attuale;
    try {
      attuale = await leggiPoliticaFn({ cartella });
    } catch (errore) {
      return { ok: false, esito: `The current Library policy could not be read. Nothing was changed. (${errore instanceof Error ? errore.message : String(errore)})` };
    }
    if (attuale.revision !== argomenti?.expected_revision) {
      return { ok: false, esito: `Library policy changed before this update (expected revision ${argomenti?.expected_revision}, current revision ${attuale.revision}). Read the current policy and ask again; nothing was changed.` };
    }

    if (azione === 'undo') {
      /*
       * ⭐⭐⭐ 29/8 — porto diretto di `receiptLookupIds` mobile
       * (`libraryContextPolicyTools.ts` righe 268-274): il messaggio
       * di successo finisce la frase con un punto subito dopo l'id
       * ("Undo receipt: libpol-xxx."), e un modello che lo rilegge e
       * lo cita può includere quel punto per errore — provato dal
       * vivo dalla mia stessa suite di test, non solo temuto: un
       * `\S+` naive nel MIO test ha catturato il punto, riproducendo
       * esattamente lo scenario che mobile aveva già previsto.
       */
      const idEsatto = String(argomenti.receipt_id).trim();
      const idSenzaPunteggiatura = idEsatto.replace(/[.,;:!?]+$/u, '');
      const ricevuta = ricevutePolitica.get(idEsatto) ?? (idSenzaPunteggiatura !== idEsatto ? ricevutePolitica.get(idSenzaPunteggiatura) : undefined);
      if (!ricevuta || ricevuta.revisioneDopo !== attuale.revision) {
        return { ok: false, esito: 'That Library policy undo receipt is missing, expired, already used, or belongs to another scope. Nothing was changed.' };
      }
      let ripristinata;
      try {
        ripristinata = await scriviPoliticaFn({ cartella, valore: ricevuta.prima, revisioneAttesa: attuale.revision });
      } catch (errore) {
        return { ok: false, esito: `The Library policy could not be restored: ${errore instanceof Error ? errore.message : String(errore)}` };
      }
      ricevutePolitica.delete(ricevuta.receiptId);
      return { ok: true, esito: `Restored the previous Library policy at revision ${ripristinata.revision}.` };
    }

    let prossima = { enabled: attuale.enabled, mode: attuale.mode, includedFileIds: attuale.includedFileIds, excludedFileIds: attuale.excludedFileIds };
    if (azione === 'set_mode') {
      if (!MODALITA_SUPPORTATE_LIBRERIA.includes(argomenti.mode)) {
        return { ok: false, esito: `This harness only supports the "${MODALITA_SUPPORTATE_LIBRERIA[0]}" mode today; "${argomenti.mode}" is not implemented. Nothing was changed.` };
      }
      prossima.mode = argomenti.mode;
    } else if (azione === 'set_enabled') {
      prossima.enabled = argomenti.enabled;
    } else if (azione === 'include_files') {
      const aggiunte = new Set(argomenti.file_ids);
      prossima.includedFileIds = [...new Set([...attuale.includedFileIds, ...argomenti.file_ids])];
      prossima.excludedFileIds = attuale.excludedFileIds.filter((id) => !aggiunte.has(id));
    } else if (azione === 'exclude_files') {
      const aggiunte = new Set(argomenti.file_ids);
      prossima.excludedFileIds = [...new Set([...attuale.excludedFileIds, ...argomenti.file_ids])];
      prossima.includedFileIds = attuale.includedFileIds.filter((id) => !aggiunte.has(id));
    } else if (azione === 'clear_overrides') {
      prossima = { enabled: true, mode: MODALITA_SUPPORTATE_LIBRERIA[0], includedFileIds: [], excludedFileIds: [] };
    } else {
      return { ok: false, esito: `Unknown action "${azione}". Nothing was changed.` };
    }

    let aggiornata;
    try {
      aggiornata = await scriviPoliticaFn({ cartella, valore: prossima, revisioneAttesa: attuale.revision });
    } catch (errore) {
      return { ok: false, esito: `The Library policy could not be updated: ${errore instanceof Error ? errore.message : String(errore)}` };
    }
    const ricevuta = creaRicevutaPoliticaLibreria({ azione, prima: attuale, revisionePrima: attuale.revision, revisioneDopo: aggiornata.revision });
    ricordaRicevutaPoliticaLibreria(ricevutePolitica, ricevuta);
    return { ok: true, esito: `Updated the Library policy to revision ${aggiornata.revision}. Undo receipt: ${ricevuta.receiptId}.` };
  };

  /*
   * ⭐⭐⭐ FASE N, quarto sistema (30/8) — Notes. `cartellaNote` è GLOBALE
   * (non `cartella`, il workspace di questa sessione — vedi la doc in
   * notes-store.mjs) — stesso contratto "questo file non sa DOVE/COME"
   * dei callback Libreria sopra: `argomenti` verbatim, la traduzione
   * verso i nomi italiani dello store vive SOLO qui.
   */
  const onNoteLista = async (argomenti) => {
    const note = await elencaNoteFn({ cartella: cartellaNote });
    /*
     * ⛔ NON `Number(argomenti?.limit) || 20` — trovato da un test
     * proprio, non ipotizzato: `||` tratta `0` come assente e lo
     * riporterebbe al default 20 invece che al minimo 1. `limit:0` è
     * un valore VALIDO (fuori range, va clampato), non un'assenza.
     */
    const richiesto = Number(argomenti?.limit);
    const limite = Number.isFinite(richiesto) ? Math.min(Math.max(richiesto, 1), 50) : 20;
    return { note: note.slice(0, limite), totale: note.length };
  };

  const onNoteCrea = async (argomenti) => {
    try {
      const creata = await creaNotaFn({ cartella: cartellaNote, title: argomenti?.title, content: argomenti?.content });
      return { ok: true, esito: `Saved the note «${creata.titolo}» (id ${creata.id}).` };
    } catch (errore) {
      return { ok: false, esito: errore instanceof Error ? errore.message : String(errore) };
    }
  };

  const onNoteAggiorna = async (argomenti) => {
    // ⛔ Rifiutato QUI, non nello store: una patch vuota non è un errore di validazione del campo, è "niente da fare" — stesso principio del tool mobile (verbatim, notesWriteTools.ts).
    if (argomenti?.title === undefined && argomenti?.content === undefined) {
      return { ok: false, esito: 'Nothing to change: pass a new title, a new body, or both.' };
    }
    try {
      const aggiornata = await aggiornaNotaFn({ cartella: cartellaNote, id: argomenti?.id, title: argomenti?.title, content: argomenti?.content });
      return { ok: true, esito: `Updated the note «${aggiornata.titolo}».` };
    } catch (errore) {
      if (errore?.code === 'NOTE_NOT_FOUND') {
        return { ok: false, esito: 'There is no note with that id. Call notes_list to see the current ones.' };
      }
      return { ok: false, esito: errore instanceof Error ? errore.message : String(errore) };
    }
  };

  const onNoteElimina = async (argomenti) => {
    const id = argomenti?.id ?? '';
    // ⛔ Verificato PRIMA di cancellare (eliminaNotaFn è idempotente, mai un throw su un id già assente): stesso messaggio a due facce del tool mobile — "cancellata ora" contro "già assente, niente da fare".
    const esisteva = await leggiNotaFn({ cartella: cartellaNote, id });
    await eliminaNotaFn({ cartella: cartellaNote, id });
    return esisteva
      ? { ok: true, esito: 'That note has been deleted.' }
      : { ok: true, esito: 'There was no note with that id — nothing to delete.' };
  };

  /*
   * ⭐⭐⭐ FASE N, quinto sistema (30/8) — Tasks. `cartellaAttivita` è
   * GLOBALE (stesso principio di cartellaNote sopra). Stesso contratto
   * "questo file non sa DOVE/COME" dei callback Notes.
   */
  const onAttivitaLista = async (argomenti) => {
    const tutte = await elencaAttivitaFn({ cartella: cartellaAttivita });
    const stato = argomenti?.status ?? 'all';
    const filtrate = stato === 'all' ? tutte : tutte.filter((a) => (stato === 'done' ? a.stato === 'done' : a.stato !== 'done'));
    const richiesto = Number(argomenti?.limit);
    const limite = Number.isFinite(richiesto) ? Math.min(Math.max(richiesto, 1), 50) : 20;
    return { attivita: filtrate.slice(0, limite), totale: filtrate.length };
  };

  const onAttivitaCrea = async (argomenti) => {
    try {
      const creata = await creaAttivitaFn({ cartella: cartellaAttivita, title: argomenti?.title, description: argomenti?.description, priority: argomenti?.priority ?? 'normal' });
      return { ok: true, esito: `Added the task «${creata.titolo}» (id ${creata.id}).` };
    } catch (errore) {
      return { ok: false, esito: errore instanceof Error ? errore.message : String(errore) };
    }
  };

  const onAttivitaCompleta = async (argomenti) => {
    try {
      const stato = argomenti?.status ?? 'done';
      const aggiornata = await completaAttivitaFn({ cartella: cartellaAttivita, id: argomenti?.id, status: stato });
      return { ok: true, esito: stato === 'done' ? `Marked «${aggiornata.titolo}» as done.` : `Moved «${aggiornata.titolo}» to ${stato}.` };
    } catch (errore) {
      if (errore?.code === 'TASK_NOT_FOUND') {
        return { ok: false, esito: 'There is no task with that id. Call tasks_list to see the current ones.' };
      }
      return { ok: false, esito: errore instanceof Error ? errore.message : String(errore) };
    }
  };

  const onAttivitaAggiorna = async (argomenti) => {
    // ⛔ Rifiutato QUI, non nello store: una patch vuota non è un errore di validazione del campo, è "niente da fare" — stesso principio del tool mobile. Per marcare fatto/iniziato c'è tasks_complete, mai qui.
    if (argomenti?.title === undefined && argomenti?.description === undefined && argomenti?.priority === undefined) {
      return { ok: false, esito: 'Nothing to change: send at least a title, a description or a priority. To mark a task done, use tasks_complete.' };
    }
    try {
      const aggiornata = await aggiornaAttivitaFn({ cartella: cartellaAttivita, id: argomenti?.id, title: argomenti?.title, description: argomenti?.description, priority: argomenti?.priority });
      return { ok: true, esito: `Updated the task «${aggiornata.titolo}».` };
    } catch (errore) {
      if (errore?.code === 'TASK_NOT_FOUND') {
        return { ok: false, esito: 'There is no task with that id. Call tasks_list to see the current ones.' };
      }
      return { ok: false, esito: errore instanceof Error ? errore.message : String(errore) };
    }
  };

  const onAttivitaElimina = async (argomenti) => {
    const id = argomenti?.id ?? '';
    // ⛔ Stesso principio di onNoteElimina: verificato PRIMA di cancellare, per distinguere "cancellata ora" da "già assente".
    const esisteva = await leggiAttivitaFn({ cartella: cartellaAttivita, id });
    await eliminaAttivitaFn({ cartella: cartellaAttivita, id });
    return esisteva
      ? { ok: true, esito: 'That task has been deleted.' }
      : { ok: true, esito: 'There was no task with that id — nothing to delete.' };
  };

  /*
   * ⭐⭐⭐ FASE N, sesto sistema (30/8) — Memory. `cartellaMemoria` è
   * GLOBALE (stesso principio di cartellaNote/cartellaAttivita sopra).
   */
  const onMemoriaCerca = async (argomenti) => {
    const tutte = await elencaMemorieFn({ cartella: cartellaMemoria });
    const richiesto = Number(argomenti?.limit);
    const limite = Number.isFinite(richiesto) ? Math.min(Math.max(richiesto, 1), 20) : 5;
    return cercaMemorie(tutte, { query: argomenti?.query ?? '', limit: limite });
  };

  const onMemoriaScrivi = async (argomenti) => {
    try {
      const { voce, duplicato } = await creaMemoriaFn({ cartella: cartellaMemoria, title: argomenti?.title, content: argomenti?.content, kind: argomenti?.kind ?? 'preference' });
      // ⛔ Porto diretto del ramo dedup mobile (memoryWriteTools.ts): un doppione NON è un fallimento, e' la postcondizione "c'e' gia' una memoria con questo titolo" gia' vera.
      return duplicato
        ? { ok: true, esito: `Already remembered as «${voce.titolo}» (id ${voce.id}). Nothing new was written. Use memory_update if the fact has changed.` }
        : { ok: true, esito: `Remembered as «${voce.titolo}» (id ${voce.id}): ${voce.contenuto}` };
    } catch (errore) {
      return { ok: false, esito: errore instanceof Error ? errore.message : String(errore) };
    }
  };

  const onMemoriaAggiorna = async (argomenti) => {
    if (argomenti?.title === undefined && argomenti?.content === undefined && argomenti?.kind === undefined) {
      return { ok: false, esito: 'Nothing to change: send at least one of title, content or kind. To remove the memory entirely, use memory_delete.' };
    }
    try {
      const aggiornata = await aggiornaMemoriaFn({ cartella: cartellaMemoria, id: argomenti?.id, title: argomenti?.title, content: argomenti?.content, kind: argomenti?.kind });
      return { ok: true, esito: `Memory «${aggiornata.titolo}» updated.` };
    } catch (errore) {
      if (errore?.code === 'MEMORY_NOT_FOUND') {
        return { ok: false, esito: `No memory has the id "${argomenti?.id}". Use memory_search to find the right one.` };
      }
      return { ok: false, esito: errore instanceof Error ? errore.message : String(errore) };
    }
  };

  const onMemoriaElimina = async (argomenti) => {
    const id = argomenti?.id ?? '';
    // ⛔ Stesso principio di onNoteElimina/onAttivitaElimina: verificato PRIMA di cancellare.
    const esisteva = await leggiMemoriaFn({ cartella: cartellaMemoria, id });
    await eliminaMemoriaFn({ cartella: cartellaMemoria, id });
    return esisteva
      ? { ok: true, esito: 'That memory has been removed from this device.' }
      : { ok: true, esito: `No memory has the id "${id}". It may already be gone.` };
  };

  try {
    const esito = await talosLavoraFn({
      cartella, task, modello, chiave, comandoProva, segnaleStop, messaggiIniziali, mobile,
      // ⭐ P-13 — il kernel lo mette in testa al prompt, subito dopo le istruzioni e PRIMA della
      // consegna: un contenuto stabile messo DOPO uno variabile non viene mai riusato dalla cache.
      contestoDelProgetto: testoContestoProgetto,
      onGiro, onScrittura, onDelta, reasoning, contextHooks,
      fallbackProviders,
      onAvviso: async messaggio => {
        const messageId = randomUUID();
        await onEvento(textMessageStart({ messageId, role: 'assistant' }), { durable: true });
        await onEvento(textMessageContent({ messageId, delta: messaggio }), { durable: true });
        await onEvento(textMessageEnd({ messageId }), { durable: true });
      },
      onCambioFornitore: async evento => {
        if (typeof depositaCambioFornitore !== 'function') throw new Error('Il cambio non è collegato alla sessione.');
        for (const messageId of messaggiTestoPerGiro.values()) await onEvento(textMessageEnd({ messageId }), { durable: true });
        for (const messageId of messaggiRagionamentoPerGiro.values()) await onEvento(reasoningMessageEnd({ messageId }), { durable: true });
        for (const ids of toolCallIdStreamatiPerGiro.values()) for (const toolCallId of ids) await onEvento(eventoPerEsitoTool({ messageId: randomUUID(), toolCallId, content: 'Richiesta interrotta prima dell’esecuzione.' }), { durable: true });
        messaggiTestoPerGiro.clear(); messaggiRagionamentoPerGiro.clear(); toolCallIdStreamatiPerGiro.clear();
        const messageId = randomUUID();
        await onEvento(textMessageStart({ messageId, role: 'assistant' }), { durable: true });
        await onEvento(textMessageContent({ messageId, delta: evento.messaggio }), { durable: true });
        await onEvento(textMessageEnd({ messageId }), { durable: true });
        await onEvento({ type: 'CUSTOM', name: 'cambio-fornitore', value: evento }, { durable: true });
        await depositaCambioFornitore(evento);
      },
      onConsumoFornitore: async evento => onEvento({ type: 'CUSTOM', name: 'consumo-fornitore', value: evento }, { durable: true }),
      strumentiEstesi, ricercaWeb, richiediRicercaFn, onArtefatto, onDocumento, onImmagine, modelloPlanner,
      // ⭐ L9 (12/09/2026) — inoltrati SENZA logica propria, come tutto il resto in questo file:
      // la cache della corsa e la finestra della pagina le costruisce `research-orchestrator.mjs`
      // («raccolta viva»). Assenti ⇒ il kernel si comporta esattamente come ieri.
      cacheWeb, onPaginaLetta,
      livelloAccesso, chiediApprovazioneFn, hookFn: hookFnConPlugin, permessiPerAttrezzo, onDelega, codaMessaggiFn,
      firma, toolMcp, chiamaToolMcpFn, skillsDisponibili, caricaSkillFn, toolPlugin, eseguiToolPluginFn,
      onLibreriaLista, onLibreriaCerca, onLibreriaLeggi, onLibreriaOrigine,
      onLibreriaRinomina, onLibreriaElimina, onLibreriaEsporta, onLibreriaPolitica,
      onNoteLista, onNoteCrea, onNoteAggiorna, onNoteElimina,
      onAttivitaLista, onAttivitaCrea, onAttivitaCompleta, onAttivitaAggiorna, onAttivitaElimina,
      onMemoriaCerca, onMemoriaScrivi, onMemoriaAggiorna, onMemoriaElimina,
      onRicercaLista, onRicercaAvvia, onRicercaLeggi, onRicercaRinomina,
      onRicercaPausa, onRicercaRiprendi, onRicercaAnnulla, onRicercaElimina,
      componiRapportoRicercaFn,
      onForgeCrea, toolForge, eseguiToolForgeFn,
    });
    onEvento(esitoInEventoFinale({ threadId, runId, esito }));
    return { threadId, runId, ok: esito.comeFinita === 'concluso', esito, erroreInterno: null };
  } catch (errore) {
    /*
     * ⛔ talosLavora oggi non lancia per un esito del TASK (giri esauriti,
     * fermato, premesse negate sono tutti valori di ritorno, non eccezioni)
     * — un throw qui è un guasto del SERVIZIO (rete giù senza che
     * chiamaConRitenta l'abbia già assorbito, un bug), non del task. Va
     * dichiarato come tale: RunError con un code dedicato, mai confuso con
     * 'giri-esauriti'/'fermato'.
     */
    const messaggio = errore instanceof Error ? errore.message : String(errore);
    /*
     * ⛔ 09/09 — il `code` era FISSO a 'internal-error', e con esso spariva l'unica cosa che la chat
     * poteva usare per riconoscere l'errore: una `ContextEngineError` arriva qui con il suo
     * `CTX_TRUNCATED_SUMMARY` / `CTX_INVALID_SOURCE` / `CTX_SUMMARY_RESPONSE_INVALID` addosso, e
     * questa riga lo buttava. Misurato in tre giri veri con glm-5.3-flash: il messaggio (italiano)
     * sopravviveva, il codice no, e la chat doveva indovinare dalla frase.
     * ⛔ Resta vero ciò che dice il commento sopra: un throw è un guasto del SERVIZIO. Per questo il
     *   codice si prende solo se è una stringa in forma di codice (nessuno spazio, non vuota) e MAI
     *   uno di quelli che descrivono un esito del task — un errore interno non deve poter fingersi
     *   'fermato' o 'giri-esauriti' passando per il `.code` di un'eccezione qualunque.
     */
    const ESITI_DEL_TASK = new Set(['fermato', 'giri-esauriti', 'premesse-negate', 'concluso']);
    const codiceGrezzo = typeof errore?.code === 'string' ? errore.code.trim() : '';
    const code = codiceGrezzo && !/\s/.test(codiceGrezzo) && !ESITI_DEL_TASK.has(codiceGrezzo)
      ? codiceGrezzo
      : 'internal-error';
    onEvento(runError({ message: messaggio, code }));
    /*
     * ⭐⭐⭐ BC-44 (12/09/2026) — IL CODICE VIAGGIAVA SOLO NELL'EVENTO, e chi conclude legge il
     * VALORE DI RITORNO. Questo ramo tornava `erroreInterno` (la frase) e buttava `code`: chi
     * riceve la conclusione (`onConclusioneFn` — la ricerca approfondita, la delega) vedeva un
     * guasto senza nome, e per distinguere «la rete è caduta» da «il codice ha un bug» doveva
     * andarsi a rileggere il `.jsonl` della sessione. Due file, nessun ponte: la ricerca
     * `dec896c0` è finita `failed` con la causa scritta solo nel registro degli eventi.
     * ⛔ ADDITIVO, e la riga sopra non cambia: l'evento `RunError` porta esattamente quello che
     *   portava, stesso `message` e stesso `code`. Qui si aggiunge un campo al ritorno, e chi
     *   non lo legge non se ne accorge.
     */
    return { threadId, runId, ok: false, esito: null, erroreInterno: messaggio, codiceErrore: code };
  } finally {
    /*
     * ⭐⭐⭐ 29/8 — FASE E: un server MCP è un processo figlio VERO
     * (a differenza di ogni altra risorsa di questo file) — lasciarlo
     * aperto oltre la vita di QUESTO run sarebbe il primo leak di
     * processo mai introdotto in questo file. `chiudiMcp` è sempre
     * definita (no-op se `cartellaTrustMcp` era assente, sopra) — un
     * `finally` gira sia sul ritorno riuscito sia su quello d'errore,
     * mai un percorso che lascia una connessione aperta.
     */
    await chiudiMcp();
  }
}

/**
 * "Compatta ora" (piano §1.4) — chiede al modello un riassunto della
 * conversazione FINALE di una sessione già conclusa. Riusa
 * `compattaConversazione` di talosHarness.mjs, la STESSA funzione che Stadio A
 * chiama dentro il ciclo di `talosLavora` (mai duplicata: un secondo
 * riassuntore divergerebbe in silenzio, stesso motivo per cui questo intero
 * file importa il kernel invece di copiarlo) — qui semplicemente invocata
 * FUORI dal ciclo, su richiesta esplicita invece che al checkpoint automatico.
 *
 * ⛔ Costa una vera chiamata al modello — dichiarato nella doc di
 * compattaConversazione stessa, non un'operazione gratuita solo perché è un
 * pulsante nella UI.
 *
 * ⛔ Non lancia mai: compattaConversazione stessa intercetta un fallimento di
 * chiamaModello (rete giù, 429 oltre i ritentativi) e torna
 * `compattato:false` invece di propagare — qui basta restituire quel valore,
 * nessun try/catch in più da aggiungere.
 *
 * @param {object} input
 * @param {Array<object>} input.messaggiFinali — la conversazione da compattare
 * @param {string} input.modello
 * @param {string} input.chiave
 * @param {typeof fetch} [input.fetchDiRete] — SOLO per test
 * @param {typeof compattaConversazioneReale} [input.compattaConversazioneFn] — SOLO per test
 * @returns {Promise<{compattato:boolean, messaggi:Array<object>, usage:object|null}>}
 */
export async function compattaSessione({
  messaggiFinali, modello, chiave, fetchDiRete = fetch,
  compattaConversazioneFn = compattaConversazioneReale,
}) {
  const chiamaModello = (richiesta) => chiamaConRitenta({
    modello, chiave, messaggi: richiesta, attrezzi: [], fetchDiRete,
  });
  return compattaConversazioneFn(messaggiFinali, chiamaModello);
}

/**
 * ⭐⭐⭐⭐ L9 (12/09/2026) — UNA DOMANDA SOLA A UN MODELLO, senza attrezzi e senza giro.
 *
 * ⛔⛔ A che cosa serve, e perché non poteva vivere altrove: il GIUDICE della ricerca
 *   approfondita. `verification.mjs` chiede una funzione `ask(affermazione, passaggio) =>
 *   Promise<string>` e non sa niente di fornitori, chiavi o ritentativi — è puro apposta. Chi
 *   quelle cose le sa è questo file, che le sa già per `compattaSessione` qui sopra.
 *
 * ⛔ Nessuna seconda implementazione del trasporto: `chiamaConRitenta` è LA STESSA funzione del
 *   kernel che ogni giro usa — stesso backoff, stesso rispetto del segnale di stop, stesso
 *   `fetchDiRete` iniettabile per provare senza rete. Scriverne una qui accanto vorrebbe dire
 *   due politiche di ritentativo che divergono al primo 429.
 *
 * ⛔ `attrezzi: []` non è un dettaglio: un giudice che potesse chiamare attrezzi potrebbe
 *   andare a CERCARE conferme, e il suo compito è l'opposto — dire se quel passaggio, DA SOLO,
 *   sostiene l'affermazione. È la riga portante di `talosResearchJudgePrompt` («non usare altro:
 *   né quello che sai, né quello che ti sembra probabile»), e qui è resa impossibile da violare.
 *
 * ⛔ Torna una STRINGA, vuota quando il modello non ha detto niente: chi la interpreta è
 *   `talosResearchParseVerdict`, che su una risposta illeggibile risponde `unchecked` col motivo.
 *   Un lancio qui diventerebbe «il giudice non ha risposto» sull'affermazione, che è comunque
 *   onesto — ma una stringa vuota è più vicina al fatto.
 *
 * @param {object} input
 * @param {string} input.modello
 * @param {string} input.chiave
 * @param {string} input.prompt
 * @param {AbortSignal} [input.segnaleStop]
 * @param {typeof fetch} [input.fetchDiRete] — SOLO per test
 * @returns {Promise<string>}
 */
export async function chiediAlModelloUnaVolta({ modello, chiave, prompt, segnaleStop, fetchDiRete = fetch }) {
  const { scelta } = await chiamaConRitenta({
    modello, chiave, messaggi: [{ role: 'user', content: String(prompt ?? '') }], attrezzi: [],
    fetchDiRete, ...(segnaleStop ? { segnaleStop } : {}),
  });
  return String(scelta?.content ?? '').trim();
}

/**
 * Il comando diretto (`!comando` nel composer, piano §1.3-BIS.T seconda
 * metà) — esegue UN comando nella cartella di una sessione, FUORI dal ciclo
 * di `talosLavora`: nessun modello coinvolto, l'owner sceglie il comando,
 * non un attrezzo che il modello sceglie di chiamare.
 *
 * ⛔ Riusa `eseguiComandoSandboxato` (talosHarness.mjs) — STESSA funzione
 * che l'attrezzo `shell` chiama dentro il ciclo, stessi livelli onesti
 * (`wsl2`/`adb-shell-on-device`/`none`), mai una seconda implementazione
 * che diverge in silenzio.
 *
 * ⛔ Emette un RunStarted/RunFinished che avvolge un SOLO ToolCallStart/
 * Args/Result — non un vero "run" nel senso di talosLavora, ma lo stesso
 * vocabolario di eventi: chi ascolta (handleRealEvent in app.js) non ha
 * bisogno di un ramo nuovo, funziona già per come è scritto oggi.
 */
export async function eseguiComandoDiretto({
  cartella, comando, onEvento, mobile = false,
  /* ⛔ D-10F — dove gira questo comando: 'wsl2', 'windows', o null = «come prima» (il ripiego
     automatico). E' una scelta della SESSIONE, non una conseguenza di quale programma hai scritto. */
  dove = null,
  eseguiComandoSandboxatoFn = eseguiComandoSandboxatoReale,
}) {
  /*
   * ⛔⛔⛔ D-10D — questo NON è più un giro del modello: ha il suo vocabolario.
   *   Vedi `comandoUtenteIniziato` in agui-events.mjs per il perché e per la fonte (AWS Bedrock
   *   AgentCore: due operazioni distinte sulla stessa sessione, eseguibili insieme).
   *   Il `toolCallId` resta, perché la resa in chat della riga «comando» è già quella e non cambia.
   */
  const comandoId = randomUUID();
  const toolCallId = randomUUID();
  onEvento(comandoUtenteIniziato({ comandoId, comando }));
  onEvento(toolCallStart({ toolCallId, toolCallName: 'shell' }));
  onEvento(toolCallArgs({ toolCallId, delta: JSON.stringify({ comando }) }));
  /*
   * ⛔⛔⛔ D-10B — È QUI CHE IL DEBITO FA PIÙ MALE: questo è il comando scritto DALLA PERSONA col
   *   `!` del composer. Misurato prima della cura: 2.091 ms di schermo fermo su un comando da
   *   2.091 ms — un `await` dell'intero comando e poi un solo `ToolCallResult`. Chi lancia
   *   `!npm test` guarda un riquadro vuoto finché non finisce, e non sa nemmeno se è partito.
   *
   * ⛔ L'accorpamento è lo stesso dell'attrezzo shell del modello (kernel, `talosLavora`): ogni
   *   120 ms oppure appena il pezzo supera i 2 KB, con un tetto. Un evento per ogni `data` di un
   *   `npm test` inonderebbe l'SSE con eventi da pochi byte.
   * ⛔ Il testo definitivo resta quello del `ToolCallResult` qui sotto, tagliato da `uscitaUtile`:
   *   questi pezzi sono avanzamento, non storia — `session-registry` non li persiste (sono
   *   effimeri come `WorkspaceChanged`, stessa lezione: 1,9 MB rigiocati a ogni apertura).
   * Ricerca 10/09/2026: AG-UI, «a vocabulary of typed events that agents emit to frontends», dove
   * l'avanzamento è distinto dal messaggio finale; Vercel Academy, «Streaming and Tool Rendering».
   */
  let accumulato = '';
  let ultimoInvio = 0;
  let mandati = 0;
  const TETTO_USCITA_IN_CORSO = 40_000;
  const svuota = () => {
    if (!accumulato || mandati >= TETTO_USCITA_IN_CORSO) return;
    const delta = accumulato.slice(0, TETTO_USCITA_IN_CORSO - mandati);
    accumulato = '';
    mandati += delta.length;
    onEvento(toolCallOutput({ toolCallId, delta }));
  };
  const risultato = await eseguiComandoSandboxatoFn(comando, cartella, {
    mobile,
    /* ⛔ D-10D-bis: si chiede al kernel di dire DOVE si e' fermato il comando, cosi' il prossimo
       riparte da li'. Chi non lo chiede non vede nessuna differenza. */
    tracciaCartella: true,
    dove,
    onPezzo: ({ testo }) => {
      accumulato += testo;
      const ora = Date.now();
      if (accumulato.length >= 2_048 || ora - ultimoInvio >= 120) { ultimoInvio = ora; svuota(); }
    },
  });
  svuota(); // ⛔ l'ultimo pezzo non resta in mano: sarebbe il difetto di prima, in piccolo
  const content = `exit ${risultato.codice} [sandbox: ${risultato.enforcement}]\n${risultato.testo}`;
  onEvento(eventoPerEsitoTool({ messageId: randomUUID(), toolCallId, content }));
  onEvento(comandoUtenteFinito({ comandoId, codice: risultato.codice, enforcement: risultato.enforcement }));
  /*
   * ⭐⭐⭐ D-10S (11/09) — `comando` e `testo` TORNANO al chiamante, e non è una comodità.
   *   Finora l'uscita di un comando `!` viveva solo negli eventi: la persona la vedeva, il modello
   *   no. Chi poi chiedeva «e allora?» parlava di una cosa che per il modello non era mai successa.
   *   Per cucire il comando nella cronologia della sessione (session-registry, `shell()`) servono
   *   qui: il testo della domanda e il testo della risposta.
   * ⛔ Sono campi IN PIÙ: chi legge `ok`/`codice`/`enforcement`/`cartellaFinale` non vede differenza.
   * ⛔ `risultato.testo` è già passato da `uscitaUtile`, cioè è già tagliato: la cucitura non deve
   *   ritagliare di nuovo con un'altra regola, o la persona e il modello leggerebbero due cose
   *   diverse sotto lo stesso nome.
   */
  return {
    ok: true,
    codice: risultato.codice,
    enforcement: risultato.enforcement,
    cartellaFinale: risultato.cartellaFinale ?? null,
    comando,
    testo: risultato.testo ?? '',
  };
}
