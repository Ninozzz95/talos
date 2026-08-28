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

import {
  avviaSessione as avviaSessioneReale,
  compattaSessione as compattaSessioneReale,
  eseguiComandoDiretto as eseguiComandoDirettoReale,
} from './agent-service.mjs';
import { CustomTaskError, preparaEsecuzioneLibera as preparaEsecuzioneLiberaReale } from './custom-task.mjs';
import { TaskCatalogError, preparaEsecuzione as preparaEsecuzioneReale } from './task-catalog.mjs';
import { leggiAlberoWorkspace as leggiAlberoWorkspaceReale, WorkspaceTreeError } from './workspace-tree.mjs';
import {
  eliminaFile as eliminaFileReale,
  leggiContenutoFile as leggiContenutoFileReale,
  rinominaFile as rinominaFileReale,
  rivelaInEsploraFile as rivelaInEsploraFileReale,
  WorkspaceFileError,
} from './workspace-files.mjs';

export const EXPORT_SCHEMA = 'talos.harness-ui.session-export.v1';

export function createSessionRegistry({
  avviaSessioneFn = avviaSessioneReale,
  preparaEsecuzioneFn = preparaEsecuzioneReale,
  preparaEsecuzioneLiberaFn = preparaEsecuzioneLiberaReale,
  compattaSessioneFn = compattaSessioneReale,
  eseguiComandoDirettoFn = eseguiComandoDirettoReale,
  leggiAlberoWorkspaceFn = leggiAlberoWorkspaceReale,
  leggiContenutoFileFn = leggiContenutoFileReale,
  rinominaFileFn = rinominaFileReale,
  eliminaFileFn = eliminaFileReale,
  rivelaInEsploraFileFn = rivelaInEsploraFileReale,
  modello,
  chiave,
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
  strumentiEstesi = ['web_search', 'artifact_create', 'document_create', 'time_now'],
  ricercaWeb,
} = {}) {
  const sessioni = new Map();

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
  function broadcast(voce, evento) {
    evento._sequenza = (voce.prossimaSequenza = (voce.prossimaSequenza ?? 0) + 1);
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
    forkDa = null, voceEsistente = null, modelloRichiesta = null, reasoningRichiesto = null, mobile = false,
  }) {
    if (typeof chiave !== 'string' || chiave.length === 0) {
      return { erroreAvvio: 'Chiave API non configurata sul server (OPENROUTER_API_KEY)', code: 'CONFIG_INVALID' };
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
    const modelloEffettivo = modelloRichiesta || voceEsistente?.modello || modello;
    /*
     * ⭐ 27/8, R1 — stessa disciplina di `modelloEffettivo`: un fork/resume
     * eredita il `reasoning` della voce originale (mai perso in silenzio a
     * metà conversazione), un avvio nuovo usa quello richiesto o nessuno.
     */
    const reasoningEffettivo = reasoningRichiesto ?? voceEsistente?.reasoning ?? null;
    /*
     * ⛔ `mobile` entra nella voce SOLO quando se ne crea una nuova — un
     * resume (`voceEsistente` presente) la riusa com'era, mai sovrascritta:
     * la "mobilità" di una sessione si decide una volta sola, all'avvio
     * (piano `procedi-col-generare-un-snoopy-neumann.md`, Fase 3).
     */
    const voce = voceEsistente ?? {
      eventi: [], ascoltatori: new Set(), taskId, cartella, task, comandoProva, forkDa,
      avviataAlle: clock().toISOString(), messaggiFinali: null, modello: modelloEffettivo,
      reasoning: reasoningEffettivo, mobile,
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
      cartella, task, modello: modelloEffettivo, chiave, comandoProva, messaggiIniziali,
      reasoning: reasoningEffettivo ?? undefined,
      segnaleStop: controller.signal,
      mobile: voce.mobile,
      strumentiEstesi, ricercaWeb,
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
    avvia(taskId, { modelloScelto = null, reasoningScelto = null, mobile = false } = {}) {
      let preparato;
      try {
        preparato = preparaEsecuzioneFn(taskId);
      } catch (errore) {
        if (errore instanceof TaskCatalogError) return { erroreAvvio: errore.message, code: errore.code };
        throw errore;
      }
      return avviaESegui({
        taskId, cartella: preparato.cartella, task: preparato.task, comandoProva: preparato.comandoProva,
        modelloRichiesta: modelloScelto, reasoningRichiesto: reasoningScelto, mobile,
      });
    },

    /**
     * ⭐⭐⭐ 27/8, owner: "per adesso un allowlist per testare... come se
     * fosse Claude Code". Stesso schema di `avvia()`, ma su una cartella
     * dell'allowlist (`config.cartelleProgetto`) invece di un id del
     * corpus benchmark — scrive DIRETTAMENTE sul progetto vero, nessuna
     * copia usa-e-getta (vedi la doc di `custom-task.mjs` sul perché).
     */
    avviaLibero({ cartellaId, consegna, comandoProva, modello: modelloScelto = null, reasoning: reasoningScelto = null, mobile = false }) {
      let preparato;
      try {
        preparato = preparaEsecuzioneLiberaFn(cartelleProgetto, { cartellaId, consegna, comandoProva });
      } catch (errore) {
        if (errore instanceof CustomTaskError) return { erroreAvvio: errore.message, code: errore.code };
        throw errore;
      }
      return avviaESegui({
        taskId: `libero:${cartellaId}`, cartella: preparato.cartella, task: preparato.task,
        comandoProva: preparato.comandoProva, modelloRichiesta: modelloScelto, reasoningRichiesto: reasoningScelto, mobile,
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
        forkDa: sessionIdOrigine, mobile: originale.mobile,
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
      if (!voce.messaggiFinali) {
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

    esiste(sessionId) {
      return sessioni.has(sessionId);
    },

    /**
     * ⭐ 27/8 — usata da http-app.mjs per sapere, SUBITO DOPO il replay di
     * `iscriviti()`, se aspettarsi ancora eventi (un giro dal vivo dietro)
     * o chiudere lo stream perché non arriverà mai più niente. `false` sia
     * per un id inesistente sia per uno concluso: stessa risposta, motivi
     * diversi, e chi chiama non ha bisogno di distinguerli qui.
     */
    inCorso(sessionId) {
      const voce = sessioni.get(sessionId);
      return !!voce && !voce.conclusa;
    },

    /**
     * Rimanda TUTTI gli eventi già accaduti (mai un buco per chi si collega
     * tardi), poi ogni evento NUOVO man mano che arriva. Torna una funzione
     * di disiscrizione — un no-op se la sessione non esiste o è già conclusa
     * (niente altro arriverà mai, niente da disiscrivere).
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
          modello: voce.modello ?? null,
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
        modello: voce.modello ?? null,
        eventi: voce.eventi,
      };
    },
  });
}
