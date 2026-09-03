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

import { createOwnerRuntimeAdapter } from './runtime-owner-adapter.mjs';
import { salvaArtefatto as salvaArtefattoReale } from './artifact-store.mjs';
import { generateTalosDocument as generateTalosDocumentReale, TALOS_SOURCE_TEXT_FORMATS, verifyTalosDocument as verifyTalosDocumentReale } from './document-generator.mjs';
import { generaImmagineOpenRouter as generaImmagineOpenRouterReale } from './image-generator.mjs';
import { leggiContestoWorkspace as leggiContestoWorkspaceReale } from './workspace-context.mjs';
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
  eventoPerEsitoTool,
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
  onEvento, segnaleStop, messaggiIniziali, reasoning, mobile = false,
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
   * È il one-up dichiarato su Hermes/Codex: zero secondo sistema di
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
  salvaArtefattoFn = salvaArtefattoReale,
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
  const contestoWorkspace = leggiContestoWorkspaceFn({ cartella, progetto: task?.progetto ?? null });
  const contesto = {
    ...contestoWorkspace,
    modello,
    reasoning: reasoning ?? null,
    permessi: permessi ?? null,
  };

  onEvento(runStarted({ threadId, runId, input: task, contesto }));

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
   * ⛔ Diverso dal mobile in UNA cosa: qui non c'è una "Libreria" (il
   * desktop non ne ha una) — il file finisce nel WORKSPACE vero, stesso
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
  const onDocumento = async (argomenti) => {
    let documento;
    try {
      documento = await generateTalosDocumentFn(argomenti);
    } catch (errore) {
      const dettaglio = errore instanceof Error ? errore.message : String(errore);
      return { ok: false, esito: `The document was not created: ${dettaglio}` };
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
      salvato = await creaFileWorkspaceFn({ cartella, nome: documento.fileName, bytes: documento.bytes });
    } catch (errore) {
      const dettaglio = errore instanceof WorkspaceFileError ? errore.message : (errore instanceof Error ? errore.message : String(errore));
      return {
        ok: false,
        esito: `"${documento.fileName}" was created and checked, but it could not be saved to the workspace: ${dettaglio}. Do not silently retry with the same name — offer a different title, or ask.`,
      };
    }

    const testuale = TALOS_SOURCE_TEXT_FORMATS.includes(documento.format) || ['md', 'csv', 'html'].includes(documento.format);
    const valore = testuale ? new TextDecoder('utf-8').decode(documento.bytes) : `[binary ${documento.format} file, ${documento.bytes.byteLength} bytes]`;
    onEvento(eventoPerScrittura({ percorso: salvato.percorso, contenuto: valore, esisteva: false }));

    const dimensione = Math.max(1, Math.round(documento.bytes.byteLength / 1024));
    return {
      ok: true,
      esito: `Created "${documento.fileName}" (${dimensione} KB) in the workspace. Checked by reopening it: ${controllo.detail}.`,
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
      salvato = await creaFileWorkspaceFn({ cartella, nome: `${immagineGenerata.fileStem}.${estensione}`, bytes: immagineGenerata.bytes });
    } catch (errore) {
      if (persistito?.id && typeof removeGeneratedImageFn === 'function') await removeGeneratedImageFn(persistito.id).catch(() => {});
      const dettaglio = errore instanceof WorkspaceFileError ? errore.message : (errore instanceof Error ? errore.message : String(errore));
      return {
        ok: false,
        esito: `The image was generated but could not be saved to the workspace: ${dettaglio}. Do not silently retry with the same prompt — offer a different title, or ask.`,
      };
    }

    // ⛔ mai i byte grezzi dentro un evento SSE/JSON (non sono UTF-8 valido) — stessa disciplina già in uso per un documento binario in onDocumento.
    onEvento(eventoPerScrittura({ percorso: salvato.percorso, contenuto: `[image ${immagineGenerata.mediaType}, ${immagineGenerata.bytes.byteLength} bytes]`, esisteva: false }));

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
      salvato = await creaFileWorkspaceFn({ cartella, nome: letta.nome, bytes });
    } catch (errore) {
      const dettaglio = errore instanceof WorkspaceFileError ? errore.message : (errore instanceof Error ? errore.message : String(errore));
      return { ok: false, esito: `"${letta.nome}" could not be saved into the workspace: ${dettaglio}. Do not silently retry with the same name — offer a different name, or ask.` };
    }
    // ⛔ mai i byte grezzi dentro un evento SSE/JSON — stessa disciplina già in uso per un documento/immagine binari in onDocumento/onImmagine.
    onEvento(eventoPerScrittura({ percorso: salvato.percorso, contenuto: letta.immagineBase64 ? `[image, ${bytes.byteLength} bytes]` : (letta.testo ?? ''), esisteva: false }));
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
      onGiro, onScrittura, onDelta, reasoning,
      strumentiEstesi, ricercaWeb, onArtefatto, onDocumento, onImmagine, modelloPlanner,
      livelloAccesso, chiediApprovazioneFn, hookFn: hookFnConPlugin, permessiPerAttrezzo, onDelega, codaMessaggiFn,
      firma, toolMcp, chiamaToolMcpFn, skillsDisponibili, caricaSkillFn, toolPlugin, eseguiToolPluginFn,
      onLibreriaLista, onLibreriaCerca, onLibreriaLeggi, onLibreriaOrigine,
      onLibreriaRinomina, onLibreriaElimina, onLibreriaEsporta, onLibreriaPolitica,
      onNoteLista, onNoteCrea, onNoteAggiorna, onNoteElimina,
      onAttivitaLista, onAttivitaCrea, onAttivitaCompleta, onAttivitaAggiorna, onAttivitaElimina,
      onMemoriaCerca, onMemoriaScrivi, onMemoriaAggiorna, onMemoriaElimina,
      onRicercaLista, onRicercaAvvia, onRicercaLeggi, onRicercaRinomina,
      onRicercaPausa, onRicercaRiprendi, onRicercaAnnulla, onRicercaElimina,
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
    onEvento(runError({ message: messaggio, code: 'internal-error' }));
    return { threadId, runId, ok: false, esito: null, erroreInterno: messaggio };
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
  eseguiComandoSandboxatoFn = eseguiComandoSandboxatoReale,
}) {
  const threadId = randomUUID();
  const runId = randomUUID();
  const toolCallId = randomUUID();
  onEvento(runStarted({ threadId, runId, input: { comandoDiretto: comando } }));
  onEvento(toolCallStart({ toolCallId, toolCallName: 'shell' }));
  onEvento(toolCallArgs({ toolCallId, delta: JSON.stringify({ comando }) }));
  const risultato = await eseguiComandoSandboxatoFn(comando, cartella, { mobile });
  const content = `exit ${risultato.codice} [sandbox: ${risultato.enforcement}]\n${risultato.testo}`;
  onEvento(eventoPerEsitoTool({ messageId: randomUUID(), toolCallId, content }));
  onEvento(runFinished({ threadId, runId, outcome: { type: 'success' }, result: { detto: content } }));
  return { ok: true, codice: risultato.codice, enforcement: risultato.enforcement };
}
