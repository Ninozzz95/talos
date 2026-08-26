/**
 * session-registry.mjs — le sessioni Harness UI vive in memoria: chi le ha
 * avviate, il buffer dei loro eventi AG-UI, e come fermarle. Piano
 * `elegant-spinning-dongarra.md`, FASE 1 (§1.2/§1.4).
 *
 * ⛔ Solo in memoria, deliberato: la persistenza SU DISCO (sopravvivere a un
 * riavvio del server) è un pezzo separato, non ancora aperto — accettabile
 * per uno strumento locale owner-only, dichiarato qui perché non diventi
 * un'assunzione silenziosa.
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

import { avviaSessione as avviaSessioneReale, compattaSessione as compattaSessioneReale } from './agent-service.mjs';
import { TaskCatalogError, preparaEsecuzione as preparaEsecuzioneReale } from './task-catalog.mjs';
import { leggiAlberoWorkspace as leggiAlberoWorkspaceReale, WorkspaceTreeError } from './workspace-tree.mjs';

export const EXPORT_SCHEMA = 'talos.harness-ui.session-export.v1';

export function createSessionRegistry({
  avviaSessioneFn = avviaSessioneReale,
  preparaEsecuzioneFn = preparaEsecuzioneReale,
  compattaSessioneFn = compattaSessioneReale,
  leggiAlberoWorkspaceFn = leggiAlberoWorkspaceReale,
  modello,
  chiave,
  clock = () => new Date(),
} = {}) {
  const sessioni = new Map();

  function broadcast(voce, evento) {
    voce.eventi.push(evento);
    for (const ascoltatore of voce.ascoltatori) ascoltatore(evento);
    if (evento.type === 'RunFinished' || evento.type === 'RunError') voce.conclusa = true;
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
    forkDa = null, voceEsistente = null,
  }) {
    if (typeof chiave !== 'string' || chiave.length === 0) {
      return { erroreAvvio: 'Chiave API non configurata sul server (OPENROUTER_API_KEY)', code: 'CONFIG_INVALID' };
    }

    const controller = new AbortController();
    const voce = voceEsistente ?? {
      eventi: [], ascoltatori: new Set(), taskId, cartella, task, comandoProva, forkDa,
      avviataAlle: clock().toISOString(), messaggiFinali: null,
    };
    voce.controller = controller;
    voce.conclusa = false;
    sessioni.set(sessionId, voce);

    /*
     * ⛔ NON await: avviaSessione emette RunStarted come sua PRIMA riga,
     * prima di qualunque await — quindi al ritorno di QUESTA funzione
     * RunStarted è già nel buffer (run-to-first-await di JS, non una gara).
     */
    avviaSessioneFn({
      cartella, task, modello, chiave, comandoProva, messaggiIniziali,
      segnaleStop: controller.signal,
      onEvento: (evento) => broadcast(voce, evento),
    }).then((risultato) => {
      /*
       * ⭐ Catturato per un resume/fork FUTURO. Se talosLavora non ha
       * prodotto un esito (non dovrebbe succedere, ma non è un'eccezione da
       * gestire qui), resta null: riprendere questa sessione dirà
       * onestamente che non c'è niente da ereditare, invece di lanciare.
       */
      voce.messaggiFinali = risultato?.esito?.messaggiFinali ?? null;
    }).catch((errore) => {
      /*
       * ⛔ Ripiego, non il percorso atteso: avviaSessione dichiara (e il suo
       * stesso test lo prova) di non lanciare mai. Se lo facesse comunque —
       * un bug futuro, una promise rifiutata prima del suo try/catch — la
       * sessione non deve restare silenziosamente a metà.
       */
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
     * @returns {{sessionId:string}|{erroreAvvio:string, code:string}} — mai
     * un throw: un id fuori allowlist o una chiave assente sono risposte
     * attese di un endpoint HTTP, non un guasto del registro.
     */
    avvia(taskId) {
      let preparato;
      try {
        preparato = preparaEsecuzioneFn(taskId);
      } catch (errore) {
        if (errore instanceof TaskCatalogError) return { erroreAvvio: errore.message, code: errore.code };
        throw errore;
      }
      return avviaESegui({
        taskId, cartella: preparato.cartella, task: preparato.task, comandoProva: preparato.comandoProva,
      });
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
        forkDa: sessionIdOrigine,
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
     * @returns {{sessionId:string}|{erroreAvvio:string, code:string}}
     */
    resume(sessionId) {
      const voce = sessioni.get(sessionId);
      if (!voce) return { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' };
      if (!voce.messaggiFinali) {
        return {
          erroreAvvio: voce.conclusa
            ? 'Questa sessione non ha una conversazione da riprendere'
            : 'La sessione è ancora in corso: aspetta che concluda prima di riprenderla',
          code: 'SESSION_NOT_READY',
        };
      }
      return avviaESegui({
        sessionId, taskId: voce.taskId, cartella: voce.cartella, task: voce.task,
        comandoProva: voce.comandoProva, messaggiIniziali: voce.messaggiFinali,
        forkDa: voce.forkDa, voceEsistente: voce,
      });
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

    esiste(sessionId) {
      return sessioni.has(sessionId);
    },

    /**
     * Rimanda TUTTI gli eventi già accaduti (mai un buco per chi si collega
     * tardi), poi ogni evento NUOVO man mano che arriva. Torna una funzione
     * di disiscrizione — un no-op se la sessione non esiste o è già conclusa
     * (niente altro arriverà mai, niente da disiscrivere).
     */
    iscriviti(sessionId, ascoltatore) {
      const voce = sessioni.get(sessionId);
      if (!voce) return () => {};
      for (const evento of voce.eventi) ascoltatore(evento);
      if (voce.conclusa) return () => {};
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
