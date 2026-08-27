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
import { leggiContestoWorkspace as leggiContestoWorkspaceReale } from './workspace-context.mjs';
import {
  eventiPerRisposta,
  eventoPerEsitoTool,
  eventoPerScrittura,
  runError,
  runFinished,
  runStarted,
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
      result: { detto: esito.detto, compattazioni: esito.compattazioni, premesseNegate: esito.premesseNegate },
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
  onEvento, segnaleStop, messaggiIniziali,
  talosLavoraFn = talosLavoraReale,
  leggiContestoWorkspaceFn = leggiContestoWorkspaceReale,
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

  const onGiro = (evento) => {
    if (evento.tipo === 'risposta') {
      const messageId = randomUUID();
      for (const e of eventiPerRisposta(evento.risposta, { messageId })) onEvento(e);
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

  try {
    const esito = await talosLavoraFn({
      cartella, task, modello, chiave, comandoProva, segnaleStop, messaggiIniziali,
      onGiro, onScrittura,
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
 * che l'attrezzo `shell` chiama dentro il ciclo, stessi due livelli onesti
 * (`wsl2`/`none`), mai una seconda implementazione che diverge in silenzio.
 *
 * ⛔ Emette un RunStarted/RunFinished che avvolge un SOLO ToolCallStart/
 * Args/Result — non un vero "run" nel senso di talosLavora, ma lo stesso
 * vocabolario di eventi: chi ascolta (handleRealEvent in app.js) non ha
 * bisogno di un ramo nuovo, funziona già per come è scritto oggi.
 */
export async function eseguiComandoDiretto({
  cartella, comando, onEvento,
  eseguiComandoSandboxatoFn = eseguiComandoSandboxatoReale,
}) {
  const threadId = randomUUID();
  const runId = randomUUID();
  const toolCallId = randomUUID();
  onEvento(runStarted({ threadId, runId, input: { comandoDiretto: comando } }));
  onEvento(toolCallStart({ toolCallId, toolCallName: 'shell' }));
  onEvento(toolCallArgs({ toolCallId, delta: JSON.stringify({ comando }) }));
  const risultato = await eseguiComandoSandboxatoFn(comando, cartella);
  const content = `exit ${risultato.codice} [sandbox: ${risultato.enforcement}]\n${risultato.testo}`;
  onEvento(eventoPerEsitoTool({ messageId: randomUUID(), toolCallId, content }));
  onEvento(runFinished({ threadId, runId, outcome: { type: 'success' }, result: { detto: content } }));
  return { ok: true, codice: risultato.codice, enforcement: risultato.enforcement };
}
