/**
 * subagent-orchestrator.mjs — FASE C (sub-agenti), piano
 * `elegant-spinning-dongarra.md`. Delega isolata verso una sessione
 * figlia — un differenziatore diretto rispetto allo stato dell'arte
 * (vincolo persistente dell'owner). Vedi `.claude/LEDGER-FASE-C-SUBAGENTI.md`
 * per il ledger completo, il confronto competitivo e le decisioni
 * prese in corso d'opera.
 *
 * ⛔ Zero registro proprio: opera sulla STESSA `Map` `sessioni` di
 * `session-registry.mjs`, iniettata — mai una seconda fonte di verità
 * su quali sessioni esistono.
 *
 * ⭐⭐⭐ I numeri sotto sono quelli VERI trovati in ricerca, letti da un
 * repository open source dello stesso spazio clonato il 28/8 — non
 * inventati, non presi da doc secondari (due correzioni fatte quel
 * giorno su claim sbagliati di doc secondari, vedi il ledger): un
 * tetto di 10 figli concorrenti di default, e una profondità massima
 * di delega di 2, con la nota nel codice sorgente "for parity with the
 * original MAX_DEPTH constant".
 */

/** Fonte: ricerca su un progetto open source dello stesso spazio, letto il 28/8. */
import { existsSync, statSync } from 'node:fs';

export const LIMITE_FIGLI_CONCORRENTI = 10;

/**
 * Fonte: la stessa ricerca sopra. A differenza dell'approccio trovato
 * (che non ha un tetto duro oltre il default, solo un avviso in log),
 * questa prima fetta applica un tetto DURO — scelta più prudente
 * finché non c'è una misura reale che dica se serve di più (stesso
 * principio "si aggiunge quando serve" già in uso per `GIRI_MASSIMI`
 * nel kernel).
 */
export const LIMITE_PROFONDITA_DELEGA = 2;

const TOOL_ERRORE_ESPLICITO = /^(?:\s*(?:error\b|exit\s+[1-9]\d*\b)|.*\b(?:ENOENT|no such file or directory|could not|unable to|failed to|not accessible|no file matches|non riesco|problema di configurazione)\b)/i;
const TASK_SCRITTURA_ESPLICITA = /\b(?:scriv\w*|modific\w*|aggiorn\w*|cre\w*|aggiung\w*|elimin\w*|rinomin\w*|implement\w*|write|modify|update|create|add|delete|rename|implement)\b/i;

/** Una richiesta esplicita di modifica richiede una prova di file/artefatto, non solo una risposta tool. */
export function taskRichiedeEvidenzaScrittura(task) {
  const testo = typeof task === 'string' ? task : task?.consegna ?? task?.consegnaCorta ?? '';
  return TASK_SCRITTURA_ESPLICITA.test(String(testo));
}

/**
 * Riassume soltanto i segnali operativi già emessi dal figlio. Il testo
 * finale del modello non è una prova di scrittura: una delega può dichiarare
 * "fatto" anche quando ogni terminale ha risposto con un errore.
 *
 * @param {Array<object>|undefined|null} eventi
 * @returns {{scritture:number, artefatti:number, toolCalls:number, toolCallsOk:number, toolCallsFalliti:number, verificabile:boolean}|null}
 */
export function analizzaEvidenzaDelega(eventi) {
  if (!Array.isArray(eventi)) return null;
  let scritture = 0;
  let artefatti = 0;
  let toolCalls = 0;
  let toolCallsOk = 0;
  let toolCallsFalliti = 0;
  for (const evento of eventi) {
    if (evento?.type === 'ArtifactCreated') artefatti += 1;
    if (evento?.type === 'StateDelta') {
      const delta = Array.isArray(evento.delta) ? evento.delta : [];
      scritture += delta.filter((voce) => typeof voce?.path === 'string' && voce.path.startsWith('/file/')).length;
    }
    if (evento?.type !== 'ToolCallResult') continue;
    toolCalls += 1;
    if (TOOL_ERRORE_ESPLICITO.test(String(evento.content ?? ''))) toolCallsFalliti += 1;
    else toolCallsOk += 1;
  }
  return {
    scritture,
    artefatti,
    toolCalls,
    toolCallsOk,
    toolCallsFalliti,
    verificabile: scritture > 0 || artefatti > 0 || toolCallsOk > 0,
  };
}

function motivoEvidenzaMancante(evidenza, richiestaScrittura = false) {
  const dettaglio = richiestaScrittura
    ? 'la richiesta prevedeva una modifica ma non risultano scritture o artefatti'
    : `${evidenza.toolCallsFalliti} tool su ${evidenza.toolCalls} hanno fallito e non risultano scritture o artefatti`;
  return `Il sotto-agente ha dichiarato successo, ma non ha lasciato evidenza verificabile: ${dettaglio}. Il lavoro non è considerato concluso.`;
}

/**
 * Traduce il risultato di `agent-service.avviaSessione` (il "risultato"
 * catturato dentro il `.then()`/`.catch()` di `avviaESegui`) nella
 * forma onesta che il kernel (`onDelega`) si aspetta — mai un successo
 * inventato quando la figlia non ha concluso per davvero.
 *
 * @param {{ok?: boolean, esito?: object|null, erroreInterno?: string|null}|null} risultato
 * @param {Array<object>|undefined|null} [eventi] eventi AG-UI persistiti dalla figlia
 * @param {{task?:string|object}} [contesto] richiesta originale, per distinguere una lettura da una modifica
 */
export function esitoDelegaDaRisultato(risultato, eventi, contesto = {}) {
  if (risultato?.ok) {
    const evidenza = analizzaEvidenzaDelega(eventi);
    const richiestaScrittura = taskRichiedeEvidenzaScrittura(contesto.task);
    // Se il figlio ha ricevuto una richiesta di modifica, una risposta tool
    // riuscita non dimostra che il file sia stato scritto: serve StateDelta o
    // ArtifactCreated. Per richieste puramente informative resta sufficiente
    // una tool-call riuscita; una delega senza tool conserva il contratto.
    if (evidenza && evidenza.toolCalls > 0 && ((!evidenza.verificabile) || (richiestaScrittura && evidenza.scritture === 0 && evidenza.artefatti === 0))) {
      return {
        riassunto: risultato.esito?.detto || '(il sotto-agente non ha lasciato un riassunto testuale)',
        esito: 'fallito',
        motivo: motivoEvidenzaMancante(evidenza, richiestaScrittura),
      };
    }
    return {
      riassunto: risultato.esito?.detto || '(il sotto-agente non ha lasciato un riassunto testuale)',
      esito: 'concluso',
    };
  }
  if (risultato?.esito) {
    // giri-esauriti / fermato: la figlia ha girato, non ha chiuso il task.
    return {
      riassunto: risultato.esito.detto || `Il sotto-task non si è concluso (${risultato.esito.comeFinita}).`,
      esito: 'fallito',
    };
  }
  // erroreInterno: avviaSessione dichiara di non lanciare mai, ma un ripiego onesto resta necessario (stesso principio già in uso nel .catch() di avviaESegui).
  return { riassunto: null, esito: 'fallito', motivo: risultato?.erroreInterno ?? 'errore sconosciuto nella sessione figlia' };
}

/** Ricostruisce il verdetto di una figlia dopo il riavvio del server. */
export function esitoDelegaDaEventi(eventi, contesto = {}) {
  if (!Array.isArray(eventi)) return null;
  const terminale = [...eventi].reverse().find((evento) => evento?.type === 'RunFinished' || evento?.type === 'RunError');
  if (!terminale) return null;
  if (terminale.type === 'RunError') return 'fallito';
  return esitoDelegaDaRisultato({ ok: true, esito: { detto: terminale.result?.detto ?? '', comeFinita: 'concluso' } }, eventi, contesto).esito;
}

/**
 * @param {Map<string, object>} sessioni — la STESSA Map di session-registry.mjs.
 * @param {Function} avviaESeguiFn — la funzione interna avviaESegui di session-registry.mjs, non una sua copia.
 */
/** L'unico controllo sul percorso che il kernel non può fare: esiste, ed è una cartella. */
export function esisteCartella(percorso, { esiste = existsSync, stato = statSync } = {}) {
  const p = String(percorso || '');
  if (!p.trim()) return false;
  try { return esiste(p) && stato(p).isDirectory(); } catch { return false; }
}

/*
 * `cartellaEsisteFn` si inietta: le prove costruiscono sessioni con cartelle che sul disco non
 * esistono, e il controllo vero (quello che ferma un percorso in forma WSL) resta acceso in produzione.
 */
/**
 * Il COMPITO dentro il prompt che il kernel costruisce per una figlia.
 * ⛔ `Compito:` è il marcatore del kernel dell'owner (`mobile/scripts/harness-talos`), che non è di questa
 *   lane: se un giorno cambia, il nome torna a essere il preambolo — brutto e visibile, mai un silenzio.
 *   Senza marcatore si restituisce la stringa intera: non si indovina dove finisce un preambolo che non c'è.
 */
export function compitoDaPromptDiDelega(prompt) {
  const testo = typeof prompt === 'string' ? prompt : prompt?.consegna ?? '';
  const marcatore = new RegExp(String.raw`(?:^|[.` + String.fromCharCode(10) + String.raw`])\s*Compito\s*:\s*`, 'u').exec(testo);
  if (!marcatore) return testo;
  const dopo = testo.slice(marcatore.index + marcatore[0].length).trim();
  return dopo || testo;
}

export function creaSubagentOrchestrator({ sessioni, avviaESeguiFn, cartellaEsisteFn = esisteCartella }) {
  function contaFigliAttivi(sessionPadreId) {
    let n = 0;
    for (const voce of sessioni.values()) {
      if (voce.padreId === sessionPadreId && !voce.conclusa) n += 1;
    }
    return n;
  }

  /** Per il foglio "Albero sessione" (C.3) — ordinati per avvio, il più vecchio prima. */
  function elencaFigli(sessionPadreId) {
    const figli = [];
    for (const [sessionId, voce] of sessioni.entries()) {
      if (voce.padreId === sessionPadreId) {
        figli.push({
          sessionId,
          task: voce.task?.consegna ?? null,
          /*
           * ⛔ 09/09, visto nella FOTO della scheda «Agenti» dopo il giro vero della delega (D2): le due
           * schede si chiamavano ENTRAMBE «Sei una sessione di lavoro autonoma; non hai altro …», cioè
           * il preambolo del kernel, che è identico per ogni figlia. La barra era già stata curata poche
           * ore prima; qui no, perché la scheda legge QUESTA funzione e non `elenca()`. Stesso difetto,
           * secondo consumatore — la cura non si copia, si espone il dato una volta sola.
           * ⛔ `task` resta la consegna INTERA: il foglio «Albero sessione» la mostra per esteso, e
           * togliere informazione a un consumatore per aggiustarne un altro è esattamente il modo di
           * rifare il giro fra un mese. Il nome corto viaggia accanto.
           */
          taskCorto: voce.task?.consegnaCorta ?? (voce.task?.consegna ? compitoDaPromptDiDelega(voce.task.consegna) : null),
          conclusa: voce.conclusa,
          /*
           * ⛔ 06/9, T05-D3 un piano più sotto: senza questo campo un sotto-agente ucciso dalla
           * morte del processo restava «In corso» per sempre nella scheda Agenti e nel foglio
           * dell'albero — e il frontend non aveva NIENTE con cui dire il vero, perché il dato
           * non usciva da qui. Il registro la conosce (`interrotta: !conclusa` al ripristino).
           */
          interrotta: voce.interrotta === true,
          esitoDelega: voce.esitoDelega ?? null,
          evidenzaDelega: voce.evidenzaDelega ?? null,
          avviataAlle: voce.avviataAlle ?? null,
        });
      }
    }
    figli.sort((a, b) => String(a.avviataAlle).localeCompare(String(b.avviataAlle)));
    return figli;
  }

  /**
   * @returns {Promise<{riassunto?: string, esito: 'concluso'|'fallito'|'rifiutato', motivo?: string}>}
   * Non lancia MAI — un rifiuto (cartella invalida, tetto raggiunto,
   * padre scomparso) è un `esito:'rifiutato'` con `motivo`, non
   * un'eccezione: il dispatcher del kernel lo traduce in un REFUSED
   * onesto per il modello, stessa disciplina di ogni altro cancello.
   */
  function delegaSottoTask({ sessionPadreId, task, cartella }) {
    return new Promise((resolve) => {
      const padre = sessioni.get(sessionPadreId);
      if (!padre) {
        resolve({ esito: 'rifiutato', motivo: 'la sessione padre non esiste più' });
        return;
      }
      /*
       * ⛔⛔⛔ 06/9 — questa guardia diceva «la cartella della delega deve essere diversa da quella
       * del padre», e insieme alla gemella nel kernel produceva il difetto misurato dal vivo: un
       * giro con UNA delega, quattro sessioni figlie, otto giri, 76,8k token, tutte fallite. Il
       * modello vedeva un rifiuto sul caso normale — delegare un pezzo dello STESSO progetto — e
       * aggirava riscrivendo il percorso in forma WSL (`/mnt/c/…`), che qui passava e su Windows
       * non esiste: il figlio partiva con una cartella inesistente e moriva.
       * Stato dell'arte (letto 06/09/2026): per difetto i
       * sotto-agenti CONDIVIDONO la cartella del padre; l'isolamento vero, quando serve, si fa con
       * un worktree, non con una cartella diversa a caso.
       * ⇒ Resta un solo controllo, quello che il kernel non può fare: la cartella deve ESISTERE.
       */
      const dove = typeof cartella === 'string' && cartella.trim() !== '' ? cartella : padre.cartella;
      if (!cartellaEsisteFn(dove)) {
        resolve({ esito: 'rifiutato', motivo: `la cartella ${dove} non esiste su questo computer: usa un percorso di Windows, non uno in forma WSL` });
        return;
      }
      const profonditaVoluta = (padre.profonditaDelega ?? 0) + 1;
      if (profonditaVoluta > LIMITE_PROFONDITA_DELEGA) {
        resolve({ esito: 'rifiutato', motivo: `profondità di delega massima raggiunta (limite ${LIMITE_PROFONDITA_DELEGA})` });
        return;
      }
      if (contaFigliAttivi(sessionPadreId) >= LIMITE_FIGLI_CONCORRENTI) {
        resolve({ esito: 'rifiutato', motivo: `limite di ${LIMITE_FIGLI_CONCORRENTI} figli concorrenti raggiunto` });
        return;
      }
      let figlioId = null;
      let conclusioneRicevuta = null;
      let conclusioneGestita = false;
      const completaConclusione = (risultatoSessione) => {
        if (conclusioneGestita) return;
        if (!figlioId) {
          conclusioneRicevuta = risultatoSessione;
          return;
        }
        conclusioneGestita = true;
        const voceFiglia = sessioni.get(figlioId);
        const eventi = voceFiglia?.eventi;
        const esito = esitoDelegaDaRisultato(risultatoSessione, eventi, { task });
        if (voceFiglia) {
          voceFiglia.esitoDelega = esito.esito;
          voceFiglia.evidenzaDelega = analizzaEvidenzaDelega(eventi);
        }
        resolve(esito);
      };
      /*
       * ⛔⛔⛔ 06/9, stessa misura: i figli partivano con `glm-4.7-flash` mentre la sessione madre
       * aveva scelto `glm-5.3-flash`, e nessuna riga a schermo lo diceva. Un sotto-agente eredita
       * gli strumenti del padre (stesso principio trovato in ricerca: i sotto-agenti ereditano
       * gli strumenti abilitati del padre); a
       * maggior ragione deve ereditare il MODELLO, altrimenti chi paga non sa cosa sta pagando.
       * Si eredita anche lo sforzo di ragionamento e i permessi: il figlio non è più libero del padre.
       */
      const risultatoAvvio = avviaESeguiFn({
        taskId: `delega:${sessionPadreId}`,
        cartella: dove,
        /*
         * ⛔⛔⛔ 08/09/2026 — SENZA QUESTA RIGA LA FIGLIA LAVORA IN `C:\`, LA RADICE DEL DISCO.
         *
         * Misurato sulla run vera dell'owner (tre sessioni in `.sessions-store/`): l'intestazione
         * della figlia porta la cartella giusta, e il `contesto` di `RunStarted` porta `C:\`. La
         * cartella corretta viene passata qui, scritta su disco, e allargata un istante dopo da
         * `cartellaEffettivaPerPermessi` (session-registry), che senza `cartellaGiaScelta` traduce
         * «Full access» in `parsePath(cartella).root`. La figlia eredita Full access dalla madre —
         * ed è giusto che lo erediti — quindi finiva nella radice.
         *
         * ⇒ Il difetto non è l'eredità dei permessi: è che una FIGLIA NON HA NIENTE DA CUI
         *   ALLARGARSI. La sua cartella è per definizione esattamente quella della madre, già
         *   scelta da una persona. È il caso (d) della famiglia documentata sopra
         *   `cartellaEffettivaPerPermessi` (a: allowlist — l'unico che deve allargare; b:
         *   avviaLibero, curato 03/9; c: avvia() dei task di catalogo, curato 04/9): la delega non
         *   era mai stata considerata.
         *
         * Il danno misurato prima della cura, su 37 chiamate delle due figlie: `scrivi` →
         * `EPERM mkdir 'C:\'`; `document_create` → sei tentativi tutti EPERM; `leggi package.json`
         * → `ENOENT 'C:\package.json'`. Zero file scritti nel workspace, e la delega ha consegnato
         * un artefatto al posto del documento chiesto senza che nessuno protestasse.
         *
         * Ricerca 08/09/2026 — dev.to «Giving an AI agent permission to spawn sub-agents (without
         * losing control)»: il wrapper della delega «resolves the workspace **against the parent's
         * root**», e l'eredità dev'essere «explicit and **downgraded by default**: parent can
         * delegate only permissions it actually has» — «if every subagent inherits the parent
         * token, it recreates sudo with better branding». Qui la cartella è la prima delega da
         * restringere.
         */
        cartellaGiaScelta: true,
        /*
         * ⛔ 09/09/2026 — trovato dal giro vero sul 4174: nella barra e nella scheda «Agenti» le due figlie
         *   si chiamavano entrambe «Sei una sessione di lavoro autonoma; non hai altro …». Il kernel non
         *   passa il compito nudo: passa il PROMPT INTERO della figlia (825 caratteri, letti dal JSONL),
         *   che comincia con un preambolo di sistema e mette il compito dopo «Compito:». Chi legge la barra
         *   vedeva due righe identiche e doveva aprirle per sapere quale fosse quale.
         * ⇒ La forma corta si costruisce QUI, dove si sa che quella stringa è il prompt di una delega:
         *   `session-registry` non può saperlo, e il kernel dell'owner non è mio.
         */
        task: { consegna: task, consegnaCorta: compitoDaPromptDiDelega(task) },
        padreId: sessionPadreId,
        profonditaDelega: profonditaVoluta,
        modelloRichiesta: padre.modello ?? null,
        reasoningRichiesto: padre.reasoning ?? null,
        permessiRichiesti: padre.permessi ?? null,
        permessiPerAttrezzoRichiesti: padre.permessiPerAttrezzo ?? null,
        onConclusioneFn: (risultatoSessione) => {
          completaConclusione(risultatoSessione);
        },
      });
      figlioId = risultatoAvvio?.sessionId ?? null;
      if (conclusioneRicevuta) completaConclusione(conclusioneRicevuta);
      // ⛔ AL CONTRARIO: avviaESeguiFn può rifiutare PRIMA di avviare (es. chiave API non configurata) — mai una Promise appesa in eterno se onConclusioneFn non scatterà mai.
      if (!conclusioneGestita && !conclusioneRicevuta && risultatoAvvio?.erroreAvvio) {
        resolve({ esito: 'rifiutato', motivo: risultatoAvvio.erroreAvvio });
      }
    });
  }

  return Object.freeze({ delegaSottoTask, contaFigliAttivi, elencaFigli });
}
