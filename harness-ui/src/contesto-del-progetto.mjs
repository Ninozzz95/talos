/*
 * ⛔⛔⛔ P-13 — IL CONTESTO STABILE DEL PROGETTO: l'elenco dei file che il modello riceve.
 *
 * IL PROBLEMA, misurato il 22/08 e non discutibile: l'attrezzo `elenca` del kernel arriva a
 * profondità 2; i 106 percorsi dei task del corpus `storia` stanno a profondità 4-6, **zero** a
 * profondità ≤2, e **35 consegne su 35 non nominano nessun file**. ⇒ TALOS non può risolverne
 * nessuno, e non per bravura del modello: non li **vede**. Pass-rate oggi: 0 su 35.
 *
 * PERCHÉ NON È «LA MAPPA DI AIDER», e la ricerca del 10/09/2026 lo dice leggendo il codice di tutti:
 *  · Aider è **l'unico** dei cinque con una mappa (tree-sitter + PageRank, budget 1.024 token —
 *    `repomap.py:49,56`), ed è anche l'unico fermo dal 22/05;
 *  · Claude Code non ha mappa: `Glob`/`Grep`/`Read` più un sotto-agente, e i simboli da un LSP che è
 *    un **plugin opzionale** (tetto dichiarato: LRU 50 documenti);
 *  · Codex non ha mappa: `AGENTS.md` e ricerca. Usa tree-sitter, ma per la sicurezza dei comandi;
 *  · Hermes non ha mappa: `ast-grep` come skill opzionale — e la mappa la **chiede**, issue #535
 *    aperta il 06/03/2026, senza risposta dei manutentori;
 *  · Pi ha quattro attrezzi in tutto (`bash`, `edit`, `read`, `write`): esplora col bash.
 * ⇒ Quattro su cinque non precalcolano niente. Qui si fa la cosa più piccola che risolve il difetto
 *   misurato: dire al modello **quali file esistono**. La mappa dei simboli resta per dopo, e solo
 *   se il banco dice che l'elenco non è bastato.
 *
 * PERCHÉ SI PUÒ PERMETTERE, e sono due numeri:
 *  1. la cache costa **un sesto** e prende **dalla terza chiamata** (22/08: tre chiamate sullo stesso
 *     prefisso da 16.811 token, la terza ne legge 16.768 dalla cache e costa 5,9 volte meno). Un
 *     elenco **stabile** si paga pieno una volta e poi quasi niente;
 *  2. la finestra dichiarata oggi dal pannello è 1.310.700 token: l'elenco di questo repo ne costa
 *     ~7.203 (misurato da `costo-elenco.mjs`, che dichiara la propria stima come tale), cioè lo 0,5%.
 *
 * ⛔ E PERCHÉ LA STABILITÀ NON È UN DETTAGLIO. Un elenco che cambia a ogni giro rompe il prefisso e
 *   fa pagare **sei volte tanto**. Per questo qui c'è una cache per cartella, e per questo si
 *   rigenera solo quando i file cambiano davvero — non a ogni giro «per sicurezza».
 */

import { costruisciElencoProfondo, testoElenco } from './elenco-profondo.mjs';
import { costoElenco } from './costo-elenco.mjs';

/**
 * Quanto a lungo un elenco resta buono senza che nessuno dica che i file sono cambiati.
 * ⛔ Non è pigrizia: è la difesa contro il caso in cui il segnale di cambiamento si perda (un file
 *   creato da un processo esterno, un `git checkout` fuori da TALOS). Cinque minuti è il compromesso
 *   fra «non ricostruire per niente» e «non mentire troppo a lungo» — dichiarato, non misurato.
 */
export const VALIDITA_MS = 5 * 60 * 1000;

/** La memoria degli elenchi già costruiti, per cartella. */
const cache = new Map();

/**
 * Costruisce (o riusa) il testo dell'elenco per una cartella.
 *
 * @param {object} input
 * @param {string} input.cartella
 * @param {(radice: string) => Promise<Function|null>} [input.creaFiltro] — il filtro `.gitignore`,
 *   iniettato: questo modulo non deve sapere come si leggono quelle regole.
 * @param {object} [input.contatore] — il contatore di token, se ce n'è uno vero
 * @param {number} [input.finestra] — la finestra del modello, per dire quanto pesa
 * @param {object} [input.deps] — `{fs, adesso}` per le prove
 * @returns {Promise<{testo:string, percorsi:number, troncato:boolean, costo:object, riusato:boolean}|null>}
 */
export async function contestoDelProgetto({ cartella, creaFiltro, contatore, finestra, deps = {} } = {}) {
  if (typeof cartella !== 'string' || cartella.trim() === '') return null;
  const adesso = deps.adesso ?? (() => Date.now());
  const ora = adesso();

  const voce = cache.get(cartella);
  if (voce && ora - voce.quando < VALIDITA_MS) {
    /* ⛔ `riusato` non è un dettaglio da registro: è la prova che la cache del FORNITORE riceverà lo
       stesso prefisso. Se questo valore fosse sempre `false`, la funzione starebbe costando sei
       volte tanto e nessuno se ne accorgerebbe. */
    return { ...voce.esito, riusato: true };
  }

  let filtro;
  if (typeof creaFiltro === 'function') {
    /* ⛔ Un `.gitignore` illeggibile non deve far sparire l'elenco: si procede senza filtro, e il
       modello vede QUALCHE file in più. Il contrario — nessun elenco per colpa di un file di regole
       — sarebbe rifare il difetto che stiamo curando. */
    /*
     * ⛔⛔ QUESTO CATCH HA GIÀ NASCOSTO UN BUG, il 10/09: il chiamante passava la stringa nuda a
     *   `creaFiltroGitignore`, che vuole `{radice}`; Node lanciava ERR_INVALID_ARG_TYPE e qui
     *   veniva scambiato per un file di regole illeggibile — elenco senza filtro, 1500 percorsi
     *   troncati e 25.163 token al posto di ~6.500, e nessun errore da nessuna parte.
     * ⇒ Un `.gitignore` illeggibile si degrada in silenzio (giusto: il modello vede qualche file
     *   in più). Un errore di CONTRATTO no: quello è un bug di chi chiama, e deve farsi sentire.
     */
    try {
      filtro = await creaFiltro(cartella);
    } catch (errore) {
      if (errore?.code === 'ERR_INVALID_ARG_TYPE' || errore instanceof TypeError) throw errore;
      filtro = undefined;
    }
    /*
     * L'ADATTATORE FRA I DUE CONTRATTI — e la sua storia, perché è istruttiva.
     *   Il camminatore chiama `filtro(percorso, { cartella })` — un OGGETTO (`elenco-profondo.mjs:212`).
     *   Il filtro delle regole si aspetta `(percorso, eDirectory)` — un BOOLEANO
     *   (`gitignore-elenco.mjs:281`). Un oggetto è sempre vero: senza questa conversione ogni file
     *   verrebbe giudicato come se fosse una cartella, e le regole non morderebbero.
     * ⛔ MISURATO: la conversione NON cambia il risultato (1.629 file in entrambi i casi). L'avevo
     *   scritta credendo fosse la causa di un elenco troncato, e la misura mi ha smentito — la causa
     *   vera era un'altra (il filtro non risaliva ai `.gitignore` dei genitori). Resta perché rende
     *   esplicito un contratto che oggi regge per caso: un oggetto è sempre vero, e il giorno in cui
     *   il camminatore passasse `{cartella:false}` per un file, senza questa riga ogni file verrebbe
     *   giudicato come una cartella. Una riga di difesa, non una cura: dirlo per quello che è.
     */
    if (typeof filtro === 'function') {
      const regole = filtro;
      filtro = (percorso, forma) => regole(percorso, typeof forma === 'object' && forma !== null ? Boolean(forma.cartella) : Boolean(forma));
    }
  }

  let elenco;
  try {
    elenco = await costruisciElencoProfondo({ radice: cartella, filtro, fs: deps.fs });
  } catch {
    /* La cartella non si legge (permessi, sparita fra una chiamata e l'altra): nessun contesto, e
       nessuna eccezione che faccia cadere l'avvio di una sessione per un elenco. */
    return null;
  }

  /*
   * ⛔ ZERO FILE NON È UN CONTESTO, È UNA BUGIA. Il camminatore non lancia quando una cartella non
   *   si legge: la salta con onestà e restituisce un elenco vuoto (scelta giusta lì, perché una
   *   cartella illeggibile in mezzo all'albero non deve far cadere tutto). Ma qui, se l'elenco
   *   INTERO è vuoto, mandare al modello «in questo progetto non ci sono file» sarebbe peggio che
   *   non mandargli niente: gli farebbe concludere che i file non esistono, che è esattamente la
   *   conclusione sbagliata che P-13 esiste per impedire.
   */
  if (elenco.percorsi.length === 0) return null;

  const testo = testoElenco(elenco.percorsi, {
    troncato: elenco.troncato,
    radice: cartella,
    fileEsclusi: elenco.fileEsclusi,
  });
  const costo = costoElenco(testo, { finestra, contatore });

  const esito = {
    testo,
    percorsi: elenco.percorsi.length,
    troncato: Boolean(elenco.troncato),
    costo,
    riusato: false,
  };
  cache.set(cartella, { quando: ora, esito });
  return esito;
}

/**
 * Dice che i file di una cartella sono cambiati: il prossimo giro ricostruirà l'elenco.
 * ⛔ Si chiama da `WorkspaceChanged`, cioè quando il disco cambia DAVVERO. Chiamarla a ogni evento
 *   annullerebbe la cache e con essa tutto il vantaggio: l'elenco tornerebbe a costare pieno ogni
 *   volta, che è esattamente la ragione per cui nel 22/08 questa strada era stata scartata.
 */
export function segnalaFileCambiati(cartella) {
  if (typeof cartella !== 'string') return false;
  return cache.delete(cartella);
}

/** Svuota tutto. Serve alle prove, e a un riavvio pulito. */
export function dimenticaTuttiGliElenchi() {
  const quanti = cache.size;
  cache.clear();
  return quanti;
}
