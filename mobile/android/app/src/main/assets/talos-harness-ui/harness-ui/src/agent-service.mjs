/**
 * agent-service.mjs — espone `talosLavora` (AVM-harness) come servizio per
 * Harness UI. Piano `elegant-spinning-dongarra.md`, FASE 1, §1.2.
 *
 * ⛔ Import relativo, non un pacchetto npm: `talosHarness.mjs` È il kernel
 * TALOS reale compilato (vedi la sua stessa doc in testa al file, "una copia
 * in .mjs divergerebbe in silenzio"), e Harness UI ha il vincolo dichiarato
 * "zero npm install" (README.md). AVM, AVM-harness, AVM-harness-ui sono tre
 * cartelle SORELLE — verificato il 24/8 con un elenco reale, non assunto.
 *
 * ⛔ `talosLavora` non sa niente di AG-UI: riporta dati grezzi (`onGiro`,
 * `onScrittura`) tramite i quattro parametri opzionali aggiunti in
 * AVM-harness (piano §1.2, stesso giorno). Questo file è il SOLO punto dove
 * quei dati grezzi diventano eventi AG-UI (agui-events.mjs) — la separazione
 * è deliberata: talosLavora resta provabile senza sapere di HTTP/SSE, e
 * agui-events.mjs resta provabile senza sapere di talosLavora.
 */
import { randomUUID } from 'node:crypto';

import {
  chiamaConRitenta,
  compattaConversazione as compattaConversazioneReale,
  eseguiComandoSandboxato as eseguiComandoSandboxatoReale,
  talosLavora as talosLavoraReale,
} from '../../../AVM-harness/mobile/scripts/harness-talos/talosHarness.mjs';
import { salvaArtefatto as salvaArtefattoReale } from './artifact-store.mjs';
import { leggiContestoWorkspace as leggiContestoWorkspaceReale } from './workspace-context.mjs';
// ⭐ 30/8, Fase C (2/7) — generate_image: porta canonico (desktop, FASE H), stesso principio di salvaArtefatto/leggiContestoWorkspace qui sopra.
import { generaImmagineOpenRouter as generaImmagineOpenRouterReale } from './image-generator.mjs';
import { creaFileWorkspace as creaFileWorkspaceReale, WorkspaceFileError } from './workspace-files.mjs';
// ⭐⭐⭐ 03/9 — collega i provider di rete già configurati (owner: "colleghiamo i 5, poi pensiamo ai locali"), vedi model-destination.mjs per il perché sta qui e non nel kernel.
import { creaFetchMultiProvider } from './model-destination.mjs';
import {
  compactionEnd,
  compactionStart,
  eventiPerRisposta,
  eventoPerEsitoTool,
  eventoPerScrittura,
  eventoPerUsage,
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
       * ⭐ 29/8 — porta canonico (ledger §17, FASE G.1): `esito.usage`
       * esisteva già in talosHarness.mjs (accumulato per TALOS-BANCO) ma
       * veniva scartato qui — mai tradotto in nessun evento, quindi mai
       * visibile a chi guarda una sessione HTTP. `null` quando nessun
       * giro l'ha mai riportato, inoltrato com'è, mai inventato.
       */
      result: { detto: esito.detto, compattazioni: esito.compattazioni, premesseNegate: esito.premesseNegate, usage: esito.usage ?? null },
    });
  }
  return runError({ message: esito.detto, code: esito.comeFinita });
}

/**
 * ⭐ 29/8 — porta canonico (ledger §17, FASE G.2): un artefatto molto
 * grande sarebbe un evento SSE molto grande — rifiutato PRIMA di
 * costruire l'evento, mai troncato in silenzio.
 */
const ARTEFATTO_MAX_BYTE = 400_000; // stesso tetto di artifactTools.ts mobile
/** ⭐ 30/8, Fase C (2/7) — i `media_type`/mime VERI che i due percorsi di image-generator.mjs possono tornare (png sempre, jpeg/webp se il fornitore li dichiara) — mai un'estensione inventata per un formato ignoto, ricade su 'png' onestamente. */
const ESTENSIONE_PER_MEDIA_TYPE = Object.freeze({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' });

/**
 * Avvia un task vero attraverso `talosLavora` e traduce ogni evento in AG-UI,
 * consegnandolo a `onEvento` man mano che accade (mai in un batch finale: chi
 * guarda una sessione dal vivo deve vedere i tool-call mentre succedono, non
 * dopo).
 *
 * ⭐ 29/8 — porta canonico (ledger §17, FASE G.1-G.4): `reasoning`,
 * `strumentiEstesi`/`ricercaWeb`/`onArtefatto` (attrezzi opzionali —
 * `document_create`/`onDocumento` deliberatamente ESCLUSO, richiede
 * document-generator.mjs e dipendenze npm non ancora verificate su
 * questo runtime, vedi il ledger), `livelloAccesso`/`chiediApprovazioneFn`/
 * `permessiPerAttrezzo` (permessi — inoltrati SENZA logica propria, la
 * decisione vive nel kernel), `hookFn` (gate pre/post tool-call),
 * `onDelega` (sub-agenti), `codaMessaggiFn` (coda follow-up), `firma`
 * (ricevute) — tutti opzionali, tutti già supportati dal kernel
 * imbarcato (verificato in `talos-harness-ui/kernel/talosHarness.mjs`
 * PRIMA di scrivere questa riga, non assunto), tutti inoltrati SENZA
 * logica propria: questo file resta un adattatore, mai un secondo posto
 * dove una regola potrebbe divergere in silenzio.
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
 * @param {{effort?:string, summary?:string}} [input.reasoning] — passato
 *   così com'è a talosLavora/OpenRouter. Assente: nessun ragionamento
 *   richiesto, nessun evento Reasoning*, comportamento di prima.
 * @param {boolean} [input.mobile] — piano `procedi-col-generare-un-snoopy-neumann.md`,
 *   Fase 3: sessione avviata da un client mobile. Solo l'attrezzo `shell`
 *   se ne accorge (vedi talosHarness.mjs, `eseguiComandoSandboxato`) — ogni
 *   altro attrezzo si comporta identico, `false` è il default di sempre.
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
  // ⭐⭐⭐ 2/9 — picker Planner (FASE K): puro pass-through verso talosLavoraFn, la stessa firma che il kernel accetta già (talosHarness.mjs, 6.1) — questo file non decide niente su QUANDO si usa, solo lo inoltra.
  modelloEsecutore,
  strumentiEstesi, ricercaWeb, firma,
  livelloAccesso, chiediApprovazioneFn, permessiPerAttrezzo,
  // ⭐⭐⭐ 30/8 — il ponte verso Note/Attività/Memoria/Libreria del telefono, stesso principio di chiediApprovazioneFn: inoltrato SENZA logica propria, la decisione COSA fare col dato vive nel kernel.
  elencaNoteFn, creaNotaFn, aggiornaNotaFn, eliminaNotaFn,
  elencaTaskFn, creaTaskFn, completaTaskFn, aggiornaTaskFn, eliminaTaskFn,
  cercaMemoriaFn, creaMemoriaFn, aggiornaMemoriaFn, eliminaMemoriaFn,
  elencaLibreriaFn, leggiLibreriaFn, rinominaLibreriaFn, eliminaLibreriaFn,
  cercaLibreriaFn, origineLibreriaFn,
  elencaRicercaFn, leggiRicercaFn,
  hookFn, onDelega, codaMessaggiFn,
  /*
   * ⭐⭐⭐ 30/8, Fase C (2/7) — generate_image. `immagine` SEMPRE definito
   * (config.mjs, `parseImmagine` non torna mai undefined — nessuna
   * credenziale propria da mancare, riusa `chiave`), stesso principio
   * di `strumentiEstesi` qui sopra.
   */
  immagine,
  talosLavoraFn = talosLavoraReale,
  leggiContestoWorkspaceFn = leggiContestoWorkspaceReale,
  salvaArtefattoFn = salvaArtefattoReale,
  generaImmagineFn = generaImmagineOpenRouterReale,
  creaFileWorkspaceFn = creaFileWorkspaceReale,
  /**
   * ⭐⭐⭐ 03/9 — da dove si leggono chiave/indirizzo per instradare un
   * modello non-OpenRouter (`model-destination.mjs`). ⛔ Assente = comportamento
   * di sempre, byte per byte: chi non le passa non cambia di una virgola —
   * `creaFetchMultiProvider` torna la `fetch` originale intatta quando
   * `dipendenze` è `null`.
   */
  dipendenzeMultiProvider = null,
  creaFetchMultiProviderFn = creaFetchMultiProvider,
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
  const contesto = leggiContestoWorkspaceFn({ cartella, progetto: task?.progetto ?? null });

  onEvento(runStarted({ threadId, runId, input: task, contesto }));

  /*
   * ⭐ 29/8 — porta canonico (ledger §17, FASE G.1): un messageId per il
   * testo e uno per il ragionamento, PER GIRO (una Map, non due
   * variabili: talosLavora numera i giri da 0, e un giro può ripassare
   * da qui più volte in task lunghi). Aperto al PRIMO delta di quel tipo
   * per quel giro, chiuso quando onGiro segnala che il giro è concluso.
   */
  const messaggiTestoPerGiro = new Map();
  const messaggiRagionamentoPerGiro = new Map();
  /*
   * ⭐ 29/8 — stesso principio, per le tool-call: un Set di toolCallId PER
   * GIRO (non una Map messageId: una tool-call ha già il suo id).
   * Popolato al primo 'tool-inizio', letto e svuotato quando onGiro
   * segnala la fine del giro — mai un ToolCallStart/Args duplicato
   * quando eventiPerRisposta traduce la risposta finale.
   */
  const toolCallIdStreamatiPerGiro = new Map();
  const onDelta = (evento) => {
    if (evento.tipo === 'tool-inizio' || evento.tipo === 'tool-args') {
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
      const messageIdTesto = messaggiTestoPerGiro.get(evento.giro);
      if (messageIdTesto) { onEvento(textMessageEnd({ messageId: messageIdTesto })); messaggiTestoPerGiro.delete(evento.giro); }
      const messageIdRagionamento = messaggiRagionamentoPerGiro.get(evento.giro);
      if (messageIdRagionamento) { onEvento(reasoningMessageEnd({ messageId: messageIdRagionamento })); messaggiRagionamentoPerGiro.delete(evento.giro); }
      const toolCallsGiaStreamate = toolCallIdStreamatiPerGiro.get(evento.giro);
      if (toolCallsGiaStreamate) toolCallIdStreamatiPerGiro.delete(evento.giro);

      const messageId = randomUUID();
      for (const e of eventiPerRisposta(evento.risposta, { messageId, testoGiaStreamato: Boolean(messageIdTesto), toolCallsGiaStreamate })) onEvento(e);
      if (evento.totali) onEvento(eventoPerUsage(evento.totali));
      return;
    }
    if (evento.tipo === 'tool-esito') {
      onEvento(eventoPerEsitoTool({ messageId: randomUUID(), toolCallId: evento.toolCallId, content: evento.content }));
      return;
    }
    /*
     * ⭐⭐⭐ 2/9 — Stadio A (talosHarness.mjs, 23/8) chiude qui il buco
     * dichiarato sopra la propria firma: il giro di compattazione ora
     * passa da onGiro come ogni altro, e diventa CompactionStart/
     * CompactionEnd (agui-events.mjs, nomi concordati con la lane
     * desktop in vista dell'unificazione dei kernel).
     */
    if (evento.tipo === 'compattazione-inizio') {
      onEvento(compactionStart({ giro: evento.giro }));
      return;
    }
    if (evento.tipo === 'compattazione-fine') {
      onEvento(compactionEnd({ giro: evento.giro, compattato: evento.compattato }));
    }
  };

  /*
   * ⛔ 28/8, ledger review-test-rischio §2.A: `esisteva` veniva ricostruita
   * qui con un Set locale alla sessione ("l'ho già vista IN QUESTA sessione")
   * invece di usare quella vera del kernel ("esisteva PRIMA di questo task",
   * calcolata da premessaDellaScrittura) — la stessa classe di difetto già
   * corretta altrove per il consumatore mobile (piano §1.2: "un file toccato
   * per la prima volta in sessione ma già presente sul disco veniva
   * etichettato 'nuovo', falso"), qui ancora presente. `talosLavora` chiama
   * `onScrittura(percorso, contenuto, esisteva, contenutoPrima)`: i due
   * argomenti in più erano già forniti dal kernel e ignorati da questa
   * funzione (JS scarta in silenzio gli argomenti non nominati).
   */
  const onScrittura = (percorso, contenuto, esisteva, contenutoPrima) => {
    onEvento(eventoPerScrittura({ percorso, contenuto, esisteva, contenutoPrima }));
  };

  /*
   * ⭐ 29/8 — porta canonico (ledger §17, FASE G.2): side-channel
   * dell'attrezzo artifact_create, stesso principio di onScrittura — il
   * tool torna al modello una riga di testo, l'HTML vero arriva qui,
   * separato, per diventare un evento AG-UI (iframe sandboxato lato
   * client, FASE H — non ancora portato: dichiarato, non nascosto).
   */
  const onArtefatto = async (titolo, html) => {
    if (Buffer.byteLength(html, 'utf8') > ARTEFATTO_MAX_BYTE) {
      return { id: `artefatto-rifiutato-troppo-grande-${randomUUID()}` };
    }
    const id = randomUUID();
    salvaArtefattoFn(id, html);
    onEvento(artifactCreated({ messageId: randomUUID(), id, titolo }));
    return { id };
  };

  /*
   * ⭐⭐⭐ 30/8, Fase C (2/7) — side-channel dell'attrezzo `generate_image`
   * (talosHarness.mjs), STESSO principio di `onArtefatto`/`onScrittura`
   * qui sopra: il kernel resta a zero dipendenze, la chiamata vera vive
   * qui (`image-generator.mjs`). Nessun passo "verify" separato —
   * `generaImmagineFn` stessa lancia se la risposta è malformata (vedi
   * la sua doc, `TALOS_IMAGE_*`), quindi il primo `try` copre
   * GENERAZIONE, non solo la chiamata di rete grezza.
   */
  const onImmagine = async (argomenti) => {
    // ⛔ difesa in profondità: `immagine` è SEMPRE presente quando session-registry.mjs offre questo attrezzo (config.mjs, parseImmagine non torna mai undefined) — ma un chiamante diverso di agent-service.mjs che offra 'generate_image' senza wireare `immagine` non deve MAI vedere un crash, stesso principio onesto di web_search senza provider.
    if (!immagine) {
      return { ok: false, esito: 'image generation is not configured on this harness: no model was set.' };
    }
    let immagineGenerata;
    try {
      immagineGenerata = await generaImmagineFn({
        prompt: String(argomenti?.prompt ?? ''), shape: argomenti?.shape, modello: immagine.modello, nativo: immagine.nativo, chiave,
      });
    } catch (errore) {
      const dettaglio = errore instanceof Error ? errore.message : String(errore);
      return { ok: false, esito: `The image was not generated: ${dettaglio}` };
    }

    const estensione = ESTENSIONE_PER_MEDIA_TYPE[immagineGenerata.mediaType] ?? 'png';
    let salvato;
    try {
      salvato = await creaFileWorkspaceFn({ cartella, nome: `${immagineGenerata.fileStem}.${estensione}`, bytes: immagineGenerata.bytes });
    } catch (errore) {
      const dettaglio = errore instanceof WorkspaceFileError ? errore.message : (errore instanceof Error ? errore.message : String(errore));
      return {
        ok: false,
        esito: `The image was generated but could not be saved to the workspace: ${dettaglio}. Do not silently retry with the same prompt — offer a different title, or ask.`,
      };
    }

    // ⛔ mai i byte grezzi dentro un evento SSE/JSON (non sono UTF-8 valido) — stessa disciplina già in uso per un documento binario in onDocumento (desktop) e per generaImmagine qui.
    onEvento(eventoPerScrittura({ percorso: salvato.percorso, contenuto: `[image ${immagineGenerata.mediaType}, ${immagineGenerata.bytes.byteLength} bytes]`, esisteva: false }));

    const dimensioneKb = Math.max(1, Math.round(immagineGenerata.bytes.byteLength / 1024));
    return {
      ok: true,
      esito: `Generated and saved "${salvato.percorso}" (${dimensioneKb} KB) with ${immagine.modello}.`,
    };
  };

  /*
   * ⭐⭐⭐ 03/9 — costruito UNA volta per sessione: `dipendenzeMultiProvider`
   * non cambia mentre la sessione è in corso, quindi non serve un
   * avvolgitore nuovo a ogni giro. ⛔ Chi legge/scrive dentro
   * `fetchMultiProvider` (`leggiChiave`/`leggiRuntime`, in `server.mjs`
   * una lettura sincrona da un oggetto già in memoria) resta comunque
   * chiamato una volta per OGNI completamento reale — costruire
   * l'avvolgitore una sola volta risparmia solo la chiusura in più, non
   * un accesso ripetuto.
   */
  const fetchInstradata = creaFetchMultiProviderFn(fetch, { dipendenze: dipendenzeMultiProvider });

  try {
    const esito = await talosLavoraFn({
      cartella, task, modello, chiave, comandoProva, segnaleStop, messaggiIniziali, mobile,
      modelloEsecutore, fetchDiRete: fetchInstradata,
      onGiro, onScrittura, onDelta, reasoning,
      strumentiEstesi, ricercaWeb, onArtefatto, onImmagine,
      livelloAccesso, chiediApprovazioneFn, hookFn, permessiPerAttrezzo, onDelega, codaMessaggiFn,
      elencaNoteFn, creaNotaFn, aggiornaNotaFn, eliminaNotaFn,
      elencaTaskFn, creaTaskFn, completaTaskFn, aggiornaTaskFn, eliminaTaskFn,
      cercaMemoriaFn, creaMemoriaFn, aggiornaMemoriaFn, eliminaMemoriaFn,
      elencaLibreriaFn, leggiLibreriaFn, rinominaLibreriaFn, eliminaLibreriaFn,
      cercaLibreriaFn, origineLibreriaFn,
      elencaRicercaFn, leggiRicercaFn,
      firma,
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
