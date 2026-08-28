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
import { generateTalosDocument as generateTalosDocumentReale, TALOS_SOURCE_TEXT_FORMATS, verifyTalosDocument as verifyTalosDocumentReale } from './document-generator.mjs';
import { leggiContestoWorkspace as leggiContestoWorkspaceReale } from './workspace-context.mjs';
import { creaFileWorkspace as creaFileWorkspaceReale, WorkspaceFileError } from './workspace-files.mjs';
import {
  artifactCreated,
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
 * ⭐⭐⭐ 28/8 — un artefatto molto grande sarebbe un evento SSE molto grande
 * (l'html non passa dal tetto di 8.000 caratteri che il kernel applica al
 * TESTO tornato al modello — quel tetto riguarda `esito`, non l'html grezzo
 * inoltrato qui via `onArtefatto`, side-channel separato, stesso principio
 * di `onScrittura`). Rifiutato PRIMA di costruire l'evento, mai troncato in
 * silenzio: un HTML troncato a metà tag è peggio di un rifiuto dichiarato.
 */
const ARTEFATTO_MAX_BYTE = 400_000; // stesso tetto di artifactTools.ts mobile

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
  strumentiEstesi, ricercaWeb,
  talosLavoraFn = talosLavoraReale,
  leggiContestoWorkspaceFn = leggiContestoWorkspaceReale,
  salvaArtefattoFn = salvaArtefattoReale,
  generateTalosDocumentFn = generateTalosDocumentReale,
  verifyTalosDocumentFn = verifyTalosDocumentReale,
  creaFileWorkspaceFn = creaFileWorkspaceReale,
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

  try {
    const esito = await talosLavoraFn({
      cartella, task, modello, chiave, comandoProva, segnaleStop, messaggiIniziali, mobile,
      onGiro, onScrittura, onDelta, reasoning,
      strumentiEstesi, ricercaWeb, onArtefatto, onDocumento,
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
