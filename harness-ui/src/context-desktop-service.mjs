import { createHash, randomUUID } from 'node:crypto';
import { parseContextSettings, ContextEngineError } from '../../context-engine/src/contracts.mjs';
import { importLegacySession } from '../../context-engine/src/node/legacy-import.mjs';
import { computeContextBudget } from '../../context-engine/src/compaction-planner.mjs';
import { classificaErroreFornitore } from './kernel/compattazione-desktop.mjs';

const fail = (code, message) => { throw new ContextEngineError(message, code); };
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const terminal = new Set(['committed', 'failed', 'cancelled']);
/** D9 (04/11/2026): da quanto il motore locale può restare «non pronto» prima che la chat torni a dirlo (condizione di Performance). */
export const NON_PRONTO_OLTRE_MS = 60_000;
const validId = value => typeof value === 'string' && value.length > 0 && value.length <= 256 && !value.includes('\0');

/** Desktop ownership and transport adaptation; archive paths and model credentials
 * never originate in the HTTP request. Every durable mutation has a receipt. */
/** C1 (10/10/2026): la risposta per una conversazione che NON usa il motore (legacy o nata prima). Col motore di serie non è più
 *  «trial»: è il caso normale di ogni conversazione vecchia. Esportata perché le prove la usano invece di copiarla. */
export const MOTORE_SPENTO_PER_LA_CONVERSAZIONE = 'The context engine is not active for this conversation.';

/** C1 (10/10/2026): il budget del motore per l'ultima misura, nella forma che la scheda Contesto e l'avviso leggono; `null` se non
 *  c'è una misura o il profilo non è valido (mai un numero inventato).
 *  ⛔ Review del bugfixer (10/10, punto 1): la misura porta la finestra del modello di QUANDO è stata presa. Dopo un cambio di modello
 *  il motore, alla richiesta dopo, misura col profilo NUOVO: se `profilo` (quello attuale della conversazione) è di un altro modello,
 *  finestra e riserva si prendono da lui, e i token restano quelli misurati. Stesso modello, o nessun profilo verificato: la misura. */
export function budgetDellaMisura(snapshot, profilo = null) {
  const misura = snapshot?.measurement?.tokens;
  if (!misura) return null;
  const altroModello = profilo && Number.isSafeInteger(profilo.windowTokens) && Number.isSafeInteger(profilo.responseReserve)
    && (profilo.model !== misura.model || profilo.provider !== misura.provider);
  /* 174 (04/11/2026, condizione della CLI): il margine salvato con la misura vale per la SUA finestra; con un altro modello si ricalcola */
  const { marginTokens: margineSalvato, ...senzaMargine } = misura;
  const tokens = altroModello ? { ...senzaMargine, provider: profilo.provider, model: profilo.model, windowTokens: profilo.windowTokens, responseReserve: profilo.responseReserve } : misura;
  try {
    const b = computeContextBudget({ ...tokens, settings: snapshot.settings ?? {} });
    const ancora = Number.isSafeInteger(b.anchorTokens) && Number.isSafeInteger(b.estimatedDeltaTokens) ? { anchorTokens: b.anchorTokens, estimatedDeltaTokens: b.estimatedDeltaTokens } : {};
    return { windowTokens: b.windowTokens, inputLimit: b.inputLimit, triggerTokens: b.triggerTokens, inputTokens: b.inputTokens, method: b.method, marginTokens: b.safetyMarginTokens, ...ancora };
  } catch { return null; }
}

/** Ogni quanto il /compact a mano sul motore dice a che punto è (Mobile 22/10: senza, ~18 minuti di riga ferma). */
export const AVANZAMENTO_DEL_COMPACT_MS = 2_000;
/*
 * R2 (revisione del Blocco 21, 01/11/2026): l'evento che dice «l'archivio è andato da parte». `setAsideSession` porta via lavori e versioni, quindi la scheda Contesto
 *   riparte da 0, mentre l'elenco delle sessioni conta `context.version.committed` dal giornale (`compattazioniInVigore`, `session-registry.mjs`): senza questa riga i due
 *   numeri si contraddicevano anche dopo un riavvio. Niente `versionId`: la chat non ci disegna un separatore (`identity`, `context-separator.js`).
 */
export const ARCHIVIO_MESSO_DA_PARTE = 'context.archive.set-aside';
/* gli stati di `activeStates` del motore: un lavoro in uno di questi ha il suo processo dietro (`recoverInterrupted` toglie gli orfani) */
const LAVORI_ATTIVI = new Set(['queued', 'preparing', 'summarizing', 'validating', 'ready']);

export function createDesktopContextService({ engine, store, loadLegacy, selectLegacyCheckpoint = null, resolveSessionModel, isSessionEnabled, readSession, onEvent, onPrepared, runInference, registraAncora, clock = () => new Date().toISOString() }) {
  if (!engine || !store || typeof readSession !== 'function' || typeof resolveSessionModel !== 'function' || typeof isSessionEnabled !== 'function') fail('CTX_PORT_MISSING', 'Incomplete desktop context services.');
  const queues = new Map();
  const deliveries = new Map();
  const ownedJobs = new Map();
  const sessioniToccate = new Set(); // F2 della CLI (16/10): le conversazioni di cui `close` deve fermare i riassunti automatici
  /* 24/09 — F4: l'ultima proiezione preparata per sessione (ciò che è andato al modello) è la base
     dell'ancora del fornitore: `captureProviderResponse` la sposa con `usage.prompt_tokens`. */
  const ultimeProiezioni = new Map();
  /* 24/09 — F4: le sessioni per cui questo processo ha già cercato job orfani (basta una volta: in
     questo processo un job attivo è sempre nella mappa `running` del motore). */
  const recuperate = new Set();
  /* P18: per sessione, le impronte dei record gia' verificati e la revisione dell'archivio che le ha prodotte. */
  const impronteVerificate = new Map();
  let closed = false;
  function serial(sessionId, task) {
    const previous = queues.get(sessionId) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(task);
    queues.set(sessionId, next);
    next.finally(() => { if (queues.get(sessionId) === next) queues.delete(sessionId); }).catch(() => {});
    return next;
  }
  async function ensure(sessionId) {
    if (closed) fail('CTX_SERVICE_CLOSED', 'The context service is closed.');
    if (!validId(sessionId) || !await readSession(sessionId)) fail('CTX_SESSION_NOT_FOUND', 'Conversation not found.');
    if (!await isSessionEnabled(sessionId)) fail('CTX_NOT_ENABLED', MOTORE_SPENTO_PER_LA_CONVERSAZIONE);
    sessioniToccate.add(sessionId);
    let snapshot = await store.readContextSnapshot({ sessionId });
    if (!snapshot) {
      const jsonl = await loadLegacy?.({ sessionId });
      /* C1, prova dal vivo del motore di serie (09/10/2026 sera, 4177): una conversazione NUOVA ha già il giornale (intestazione,
         RunStarted) ma non ancora una storia, e l'import la prendeva per un giornale rotto (CTX_LEGACY_NO_CHECKPOINT al primo giro,
         CTX_HISTORY_DIVERGED da lì in poi). Senza checkpoint non c'è niente da importare: l'archivio nasce vuoto e si riempie dai
         messaggi originali del kernel (`syncOriginals`), come per una conversazione senza giornale. Ogni altro errore dell'import
         resta un errore. */
      try {
        snapshot = jsonl ? await importLegacySession({ sessionId, jsonl, settings: parseContextSettings({}), metadata: {}, selectCheckpoint: selectLegacyCheckpoint }, { store }) : null;
      } catch (error) {
        if (error?.code !== 'CTX_LEGACY_NO_CHECKPOINT') throw error;
      }
      snapshot ??= await store.initSession({ sessionId, settings: parseContextSettings({}) });
    } else if (!recuperate.has(sessionId) && typeof engine.recoverInterruptedJobs === 'function') {
      /*
       * 24/09/2026 — F4, CTX-RESTART-ACTIVE-JOB-RECOVERY: al primo tocco della sessione in questo processo un job
       * lasciato «in corso» da un processo morto viene dichiarato interrotto (`paused` + `CTX_JOB_INTERRUPTED`,
       * vedi `engine.mjs::recoverInterrupted`), così il pannello non mostra un avanzamento che non avanza e la
       * sessione può compattare di nuovo. Prima di oggi `GET /` rileggeva la riga com'era, per sempre.
       */
      snapshot = await engine.recoverInterruptedJobs({ sessionId });
      recuperate.add(sessionId);
    }
    return snapshot;
  }
  /*
   * Owner 27/10/2026 notte («Si annulla, come Codex»): i lavori di compattazione ancora ATTIVI di una conversazione, annullati prima di
   *   riparare l'archivio (vedi `prepare`). Annullare un lavoro già concluso non fa niente. Si aspetta al più `ATTESA_ANNULLAMENTO_MS` che
   *   l'esecutore interrotto si fermi davvero: senza, potrebbe scrivere lo stato finale sotto la conversazione DOPO lo spostamento. Un
   *   errore qui non ferma niente: se un lavoro resta attivo, l'archivio rifiuta di mettere da parte e la richiesta ricade come prima.
   */
  const ATTESA_ANNULLAMENTO_MS = 2_000;
  /** Un lavoro annullato si aspetta al più `ATTESA_ANNULLAMENTO_MS`: l'esecutore che non si ferma subito non trattiene chi annulla. */
  async function aspettaAnnullato(options) {
    if (typeof engine.waitForCompaction !== 'function') return;
    let timer = null;
    const tetto = new Promise((risolvi) => { timer = setTimeout(risolvi, ATTESA_ANNULLAMENTO_MS); });
    try { await Promise.race([engine.waitForCompaction(options).catch(() => {}), tetto]); }
    finally { clearTimeout(timer); }
  }
  /*
   * P4 (owner 28/10/2026, «Rapido subito, il modello dopo»; contratto con la CLI): il riassunto di fine giro di un posto unico si annulla
   *   quando un giro prende il motore (P3). L'annullo è asincrono: la preparazione di una richiesta li ASPETTA (al più
   *   `ATTESA_ANNULLAMENTO_MS` ciascuno), altrimenti il motore vedrebbe il lavoro ancora in volo, lo aspetterebbe dentro il giro, lo troverebbe
   *   annullato e la chat direbbe un guasto che non c'è. Sono di tutto il servizio, non di una conversazione: il posto è del MOTORE.
   */
  const annullamentiInCorso = new Set();
  function annullaPerUnGiro(sessionId, jobId) {
    if (typeof engine.cancelCompaction !== 'function') return;
    const fatto = (async () => {
      try { await engine.cancelCompaction({ sessionId, jobId }); } catch { /* già concluso o sparito */ }
      await aspettaAnnullato({ sessionId, jobId });
    })();
    annullamentiInCorso.add(fatto);
    void fatto.finally(() => annullamentiInCorso.delete(fatto));
  }
  async function annullaLavoriVecchi(sessionId) {
    if (typeof engine.cancelCompaction !== 'function') return;
    const snapshot = await store.readContextSnapshot({ sessionId });
    const attivi = (Array.isArray(snapshot?.jobs) ? snapshot.jobs : []).filter((job) => job && !['committed', 'failed', 'cancelled', 'paused'].includes(job.state));
    for (const job of attivi) {
      try { await engine.cancelCompaction({ sessionId, jobId: job.id }); } catch { /* già concluso o sparito */ }
      await aspettaAnnullato({ sessionId, jobId: job.id });
    }
  }
  async function allRecords(sessionId) {
    const records = []; let afterSequence = 0;
    for (;;) {
      const page = await store.readOriginals({ sessionId, afterSequence, limit: 1000 });
      records.push(...page);
      if (page.length < 1000) return records;
      afterSequence = page.at(-1).sequence;
    }
  }
  function deliver(sessionId) {
    if (!onEvent) return Promise.resolve();
    if (deliveries.has(sessionId)) return deliveries.get(sessionId);
    const pending = (async () => {
      for (;;) {
        const events = await store.readContextOutbox({ sessionId });
        if (!events.length) return;
        for (const event of events) {
          await onEvent({ sessionId, event });
          await store.ackContextEvent({ sessionId, eventId: event.id });
        }
      }
    })();
    deliveries.set(sessionId, pending);
    pending.finally(() => { if (deliveries.get(sessionId) === pending) deliveries.delete(sessionId); }).catch(() => {});
    return pending;
  }
  /*
   * R2 e RIP-3 (ripassata del Blocco 21, 01/11/2026): l'annuncio entra nella coda degli eventi DENTRO la transazione di `setAsideSession`, in fondo a ciò che aspettava già:
   *   una versione consegnata dopo tornerebbe a contare. Prima andava sul giornale da qui, con un tentativo solo, e se il giornale non scriveva o il processo moriva fra le due
   *   scritture l'elenco teneva il numero vecchio per sempre: una riparazione dopo non arriva, a archivio riparato. Ora la coda lo riprova a ogni richiesta e a ogni apertura
   *   della scheda, anche dopo un riavvio, finché il giornale non lo prende. Fino ad allora l'elenco è indietro; una consegna ripetuta non conta due volte
   *   (`pubblicaEventoContesto` guarda l'id). Non ferma mai la richiesta: la riga `archivio-riallineato` del guscio esce solo se `prepare` riesce.
   */
  const annuncioArchivioDaParte = (sessionId, asideId) => ({ schema: 'talos.context.event.v1', id: `archive-set-aside-${randomUUID()}`, sessionId, kind: ARCHIVIO_MESSO_DA_PARTE, createdAt: clock(), payload: { asideId } });
  /*
   * D9, condizione di Performance (04/11/2026): «se il motore resta non pronto oltre l'apertura attesa (es. 2 giri o 60 s), la riga torna».
   *   Il guscio vive un giro solo; questo servizio vive quanto il server, quindi qui si ricorda da quando la conversazione trova il motore
   *   locale non pronto. Oltre `NON_PRONTO_OLTRE_MS` il segno si toglie e il guasto torna quello di sempre (stesso codice): un'apertura
   *   incastrata non diventa muta. Un profilo riuscito azzera il conto.
   */
  const nonProntoDal = new Map();
  async function modelFor(sessionId) {
    try {
      const profilo = await resolveSessionModel({ sessionId, session: await readSession(sessionId) });
      nonProntoDal.delete(sessionId);
      return profilo;
    } catch (errore) {
      if (errore?.details?.nonPronto !== true) throw errore;
      const adesso = Date.now();
      if (!nonProntoDal.has(sessionId)) nonProntoDal.set(sessionId, adesso);
      if (adesso - nonProntoDal.get(sessionId) <= NON_PRONTO_OLTRE_MS) throw errore;
      const { nonPronto: _tolto, ...altri } = errore.details;
      errore.details = Object.keys(altri).length ? altri : undefined;
      throw errore;
    }
  }
  /*
   * Revisione blocco 7, A-R7 (27/10/2026): subito dopo una crescita riuscita il motore può risultare per un attimo «in partenza» (un'altra
   * conversazione ha appena chiesto di riaprirlo) e il profilo non si rilegge: l'errore usciva da `prepareForRequest` e la chat scriveva la
   * riga del ripiego, come se il motore del contesto fosse caduto. Qualche tentativo breve prima di arrendersi; lo Stop interrompe l'attesa.
   */
  async function modelDopoLaCrescita(sessionId, signal, { tentativi = 6, attesaMs = 500 } = {}) {
    for (let i = 1; ; i += 1) {
      try { return await modelFor(sessionId); } catch (errore) {
        if (i >= tentativi || signal?.aborted) throw errore;
        await new Promise((risolvi) => setTimeout(risolvi, attesaMs));
        signal?.throwIfAborted?.();
      }
    }
  }
  function common(body, fields = []) {
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !['expectedRevision', 'idempotencyKey', ...fields].includes(k))) fail('CTX_INVALID_INPUT', 'Invalid context request.');
    if (!Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0 || !validId(body.idempotencyKey)) fail('CTX_INVALID_INPUT', 'The revision and the identity of the request are required.');
  }
  async function mutation(sessionId, method, path, body, operation, args) {
    const requestFingerprint = digest({ method, path, body });
    return store[operation]({ ...args, sessionId, idempotencyKey: body.idempotencyKey, requestFingerprint });
  }
  const api = {
    async createKernelHooks({ sessionId, runId }) {
      if (!await isSessionEnabled(sessionId)) return undefined;
      if (!validId(runId)) fail('CTX_INVALID_INPUT', 'Invalid turn identity.');
      await serial(sessionId, () => ensure(sessionId));
      /*
       * ⛔ Revisione del bugfixer di 0120d21e0 (16/10/2026, NON-ASPETTARE-REV-01) e richiesta della CLI («mettilo nel servizio, così
       *   vale per tutti e due»): «Non aspettare se entra» (owner 16/10 sera) manda la richiesta senza il margine di sicurezza della
       *   stima (`sentWithoutWaiting`). Se il fornitore risponde «contesto pieno», UNA volta: si rifà la preparazione chiedendo al
       *   motore di aspettare il riassunto in volo (`waitForInFlight`), la richiesta nuova va nello STESSO array che `prepare` ha
       *   restituito (il kernel lo rilegge a ogni invio, `talosHarness.mjs`: «l'overflow dell'adattatore rimpiazza la lista sul posto
       *   e richiama») e si riprova, con lo stesso `signal` del giro. Come K8 del legacy. Una richiesta mandata col margine di sempre
       *   ha un tentativo solo: riprovarla uguale darebbe lo stesso rifiuto. Il guscio desktop rifà lui la preparazione (corregge i
       *   messaggi e riattacca gli effimeri in un array suo) e qui lo spegne con `retryContextFull: false`.
       */
      let mandataSenzaAttesa = null;
      const esegui = (signal, operation) => (runInference ? runInference({ sessionId, priority: 'chat', signal }, operation) : operation(signal));
      return Object.freeze({
        capture: ({ messages }) => api.syncOriginals({ sessionId, messages }),
        /* 24/09 — F4, contratto con l'adapter (F1): `messages` = proiezione corretta, `originali` = grezzo. */
        prepare: async ({ messages, originali, tools, signal, waitForInFlight, summaryCeilingMs, onInTurnWait, growWindow }) => {
          /* A1 (21/10/2026): il tetto del riassunto atteso scelto dall'ospite arriva fino al motore (`summaryCeilingMs`); B1: e chi
             vuole sapere quando il giro aspetta un riassunto (`onInTurnWait`); L1 1.3 (revisione blocco 6): la crescita della finestra
             locale al cancello della compressione (`growWindow`, vedi `engine.mjs` prepareForRequest) */
          const result = await api.prepare({ sessionId, messages, originali, tools, signal, waitForInFlight, summaryCeilingMs, onInTurnWait, growWindow });
          mandataSenzaAttesa = result?.sentWithoutWaiting === true && Array.isArray(result.messages) ? { input: { messages, originali, tools }, result } : null;
          return result;
        },
        /* F6 della CLI (16/10/2026): un METODO, non una freccia — il kernel chiama `contextHooks.infer(...)` sull'oggetto dei ganci che
           l'ospite gli ha dato, e se l'ospite ha avvolto `prepare` (la CLI: `retryStale` per una revisione stantia) il ritentativo usa
           QUELLA (`this.prepare`), non la nostra saltandolo. Chiamata staccata dall'oggetto: la nostra. */
        async infer({ signal, retryContextFull = true } = {}, operation) {
          const daRiprovare = retryContextFull ? mandataSenzaAttesa : null;
          mandataSenzaAttesa = null;
          if (!daRiprovare) return esegui(signal, operation);
          try { return await esegui(signal, operation); }
          catch (errore) {
            if (signal?.aborted || classificaErroreFornitore(errore) !== 'contesto-pieno') throw errore;
            if (errore && typeof errore === 'object') errore.classificazione = 'contesto-pieno';
            /* se la seconda preparazione fallisce (il riassunto aspettato muore), passa il «contesto pieno» del fornitore, classificato,
               non l'errore del motore: è quello che è successo alla richiesta (riverifica del bugfixer, NON-ASPETTARE-REV-03) */
            let nuova;
            const prepara = typeof this?.prepare === 'function' ? (input) => this.prepare(input) : (input) => api.prepare({ sessionId, ...input });
            try { nuova = await prepara({ ...daRiprovare.input, signal, waitForInFlight: true }); }
            catch (secondo) { if (signal?.aborted || secondo?.name === 'AbortError') throw secondo; throw errore; }
            daRiprovare.result.messages.splice(0, daRiprovare.result.messages.length, ...nuova.messages);
            daRiprovare.result.retriedAfterContextFull = true; // per chi vuole dirlo a parole (la CLI)
            try { return await esegui(signal, operation); }
            catch (secondo) {
              if (secondo && typeof secondo === 'object' && classificaErroreFornitore(secondo) === 'contesto-pieno') secondo.classificazione = 'contesto-pieno';
              throw secondo;
            }
          }
        },
        captureProviderResponse: async ({ response, giro, usage }) => {
          if (!response || typeof response !== 'object' || !Number.isSafeInteger(giro) || giro < 0) fail('CTX_INVALID_INPUT', 'The model response cannot be archived.');
          /* D9, revisione R1 (04/11/2026): una risposta arrivata vuol dire che il modello era pronto ⇒ il conto dei 60 s si chiude qui,
             o un'apertura NUOVA minuti dopo erediterebbe quello vecchio. Come Hermes `agent/chat_completion_helpers.py:2687-2689`
             («Success clears the cross-turn breaker»). */
          nonProntoDal.delete(sessionId);
          const bytes = Buffer.from(JSON.stringify({ schema: 'talos.context.provider-response.v1', runId, giro, response }), 'utf8');
          return serial(sessionId, async () => {
            await ensure(sessionId);
            const receipt = await store.putBlob({ sessionId, id: `provider-response-${digest({ runId, giro })}`, bytes, mimeType: 'application/json' });
            /*
             * 24/09/2026 — F4, punto 5: il numero VERO del fornitore (`usage.prompt_tokens`) diventa l'ancora della
             * misura successiva, sposato alla proiezione appena inviata; il contatore separato (una chiamata in più,
             * e per OpenRouter una stima) si usa solo quando il prefisso non combacia. Come Hermes
             * `agent/usage_anchor.py:46-60`. ⛔ Il kernel oggi passa `{ response, giro }` senza `usage`
             * (`talosHarness.mjs:8281`): finché quella riga non porta `usage`, qui non arriva nulla e si conta come prima.
             */
            if (registraAncora && usage && typeof usage === 'object' && ultimeProiezioni.has(sessionId)) {
              const profile = await modelFor(sessionId);
              registraAncora({ provider: profile.provider, model: profile.model, messages: ultimeProiezioni.get(sessionId), usage });
            }
            return receipt;
          });
        },
      });
    },
    /* `attesaDellaPersona` (spesa di servizio, parte 2 B): chi chiama aspetta davanti allo schermo (il /compact); il riassunto di fine giro
       no. Le chiamate pagate di questo lavoro risultano allora «in primo piano». */
    async compact({ sessionId, messages, onProgresso = null, intervalloAvanzamentoMs = AVANZAMENTO_DEL_COMPACT_MS, onLavoro = null, segnale = null, attesaDellaPersona = false }) {
      if (!await isSessionEnabled(sessionId)) return undefined;
      const session = await readSession(sessionId);
      if (Array.isArray(messages) && session?.conclusa !== false) await api.syncOriginals({ sessionId, messages });
      const snapshot = await serial(sessionId, () => ensure(sessionId));
      /* Chiusura della compattazione (31/10/2026, dal vivo: 500 in 6 corse su 6): subito dopo un giro lavora ancora il riassunto di fine giro, e il worker rifiuta un lavoro
         nuovo (`CTX_JOB_ACTIVE`). Si aspetta quello: la persona ha chiesto un riassunto, e uno è già in corso. */
      const inCorso = snapshot.jobs.find((lavoro) => LAVORI_ATTIVI.has(lavoro.state));
      /* banco del 31/10/2026 sera: se non c'è davvero niente da compattare lo si dice, e la rotta non risponde 500. Il tentativo dentro il giro sta in `/jobs` */
      const avvia = (revision) => api.request({ sessionId, method: 'POST', path: '/jobs', body: { kind: 'compact', expectedRevision: revision, idempotencyKey: randomUUID() } })
        .catch((errore) => { if (errore?.code === 'CTX_NOTHING_TO_COMPACT') return null; throw errore; });
      const avviato = inCorso ? { job: inCorso } : await avvia(snapshot.revision);
      if (!avviato) return { ok: true, compattato: false, motivo: 'niente-da-compattare' };
      const esito = await seguiCompattazione({ sessionId, job: avviato.job, onProgresso, intervalloAvanzamentoMs, onLavoro, segnale, attesaDellaPersona });
      /*
       * B3 (05/11/2026, cura per Luna 6; forma §3, OK di CLI, Performance e Mobile §8). Al banco del 04/11 il /compact si agganciava al
       *   lavoro automatico, quello falliva dopo 2 secondi e la persona leggeva «non riuscita» senza che il SUO riassunto fosse partito.
       *   Se il lavoro agganciato non finisce `committed` (e nessuno ha annullato questo /compact), parte UNA volta il lavoro della
       *   persona, con la sua chiave, e si risponde col SUO esito, nella stessa forma: il telefono apre la riga viva prima della POST e la
       *   chiude alla risposta (condizione del Mobile), la CLI ci costruisce il testo (condizione 2 della CLI). Passa la stessa verifica
       *   del 30% dei lavori chiesti: niente da guadagnare ⇒ «niente-da-compattare», come sempre.
       */
      if (!inCorso || esito.compattato || esito.annullato || segnale?.aborted) return esito;
      const ora = await serial(sessionId, () => ensure(sessionId));
      const ancoraUno = ora.jobs.find((lavoro) => LAVORI_ATTIVI.has(lavoro.state));
      const ripartito = ancoraUno ? { job: ancoraUno } : await avvia(ora.revision);
      if (!ripartito) return { ok: true, compattato: false, motivo: 'niente-da-compattare' };
      return seguiCompattazione({ sessionId, job: ripartito.job, onProgresso, intervalloAvanzamentoMs, onLavoro, segnale, attesaDellaPersona });
      /* Il seguito di un lavoro del /compact: l'id a chi ascolta, i passi della riga viva, l'attesa, la consegna e l'esito (B3: si usa per il
       lavoro agganciato e, se quello non riesce, per quello ripartito). */
      async function seguiCompattazione({ sessionId, job, onProgresso, intervalloAvanzamentoMs, onLavoro, segnale, attesaDellaPersona }) {
      /* P4: l'id SUBITO, prima di aspettare — chi avvia il riassunto di fine giro lega a lui la riga del rapido, nel giornale prima del commit */
      if (typeof onLavoro === 'function') { try { onLavoro(job.id); } catch { /* chi ascolta non ferma il lavoro */ } }
      /* P3/P4: un giro che prende il posto unico annulla questo lavoro (il segnale di chi l'ha avviato) */
      let annullato = false;
      const annulla = () => { if (annullato) return; annullato = true; annullaPerUnGiro(sessionId, job.id); };
      if (segnale?.aborted) annulla(); else segnale?.addEventListener?.('abort', annulla, { once: true });
      /*
       * 22/10/2026 (Mobile, dal vivo): il lavoro del motore durava ~18 minuti (un modello locale che legge 24.331 token a 55,7 t/s, due
       *   tentativi) e la riga non riceveva NIENTE dopo la lettura: sembrava ferma. Il motore salva lo stato del lavoro a ogni passo
       *   (`engine.mjs`: summarizing, validating, ready); qui lo si legge a intervalli e lo si passa come passo del contratto della riga
       *   viva (`fase` ∈ riassunto · sostituzione, `trascorsoMs`). Solo letture: il lavoro non cambia, e un passo che non si legge
       *   non ferma niente.
       */
      /* ⛔ Revisione avversaria del 22/10: `clearInterval` ferma i colpi nuovi, non le letture già partite — con un archivio lento
         (SQLite occupato dal lavoro stesso) i passi arrivavano DOPO il ritorno del /compact, e potevano sovrapporsi e arrivare fuori
         ordine. ⇒ Una lettura alla volta, nessun passo dopo la fine, e l'orologio non tiene vivo il processo (`unref`). */
      /* ⛔ Quarta passata: una lettura che non torna MAI teneva `inLettura` per sempre, e la riga tornava muta — il sintomo di partenza.
         ⇒ una lettura più vecchia di tre intervalli non blocca più i colpi; il suo esito, se arriva dopo uno più nuovo, si scarta (numero
         di lettura), così l'ordine dei passi resta quello delle letture. */
      const inizio = Date.now();
      let finito = false;
      let letturaIniziata = 0;
      let ultimaLettura = 0;
      let ultimoConsegnato = 0;
      const leggiPasso = async () => {
        if (finito || (letturaIniziata && Date.now() - letturaIniziata < 3 * intervalloAvanzamentoMs)) return;
        const numero = ++ultimaLettura;
        letturaIniziata = Date.now();
        try {
          const corrente = await store.readContextJob({ sessionId, jobId: job.id });
          const fase = ['validating', 'ready', 'committing'].includes(corrente?.state) ? 'sostituzione' : 'riassunto';
          if (!finito && numero > ultimoConsegnato) {
            ultimoConsegnato = numero;
            onProgresso({ fase, trascorsoMs: Date.now() - inizio, origine: 'motore' });
          }
        } catch { /* un passo non letto non è un guasto del lavoro */ }
        finally { if (numero === ultimaLettura) letturaIniziata = 0; }
      };
      const orologio = typeof onProgresso === 'function' ? setInterval(() => { void leggiPasso(); }, intervalloAvanzamentoMs) : null;
      orologio?.unref?.();
      let finished;
      try { finished = await engine.waitForCompaction({ sessionId, jobId: job.id, contaComeAttesa: attesaDellaPersona === true }); }
      finally { finito = true; if (orologio) clearInterval(orologio); segnale?.removeEventListener?.('abort', annulla); }
      await deliver(sessionId);
      return { ok: true, compattato: finished.state === 'committed', jobId: job.id, ...(annullato || finished.state === 'cancelled' ? { annullato: true } : {}),
        ...(finished.error ? { error: finished.error } : {}) };
      }
    },
    async request({ sessionId, method, path = '/', body, signal }) {
      signal?.throwIfAborted();
      let snapshot = await serial(sessionId, () => ensure(sessionId));
      path = path.replace(/\/$/u, '') || '/';
      if (method === 'GET') {
        /* C1 (owner 10/10/2026, «il limite che agisce, un numero solo»): per una conversazione col motore la soglia vera è il BUDGET
           del motore (finestra del profilo, riserva, margine, `triggerRatio`), non la politica del legacy. Lo si calcola qui, con
           la stessa funzione che il motore usa per decidere (`computeContextBudget`), dall'ultima misura; senza misura, `null`. */
        if (path === '/') {
          await deliver(sessionId);
          let profilo = null;
          if (snapshot.measurement?.tokens) { try { profilo = await modelFor(sessionId); } catch { /* senza un profilo verificato vale la misura */ } }
          return { ...snapshot, usage: await store.readUsage({ sessionId }), semanticStatus: 'not-qualified', budget: budgetDellaMisura(snapshot, profilo) };
        }
        if (path === '/versions') return { versions: await engine.listContextVersions({ sessionId }) };
        if (path === '/facts') return { facts: snapshot.facts };
        if (path === '/export') return engine.exportContext({ sessionId });
        /* L3-3 (owner 13/10/2026, D2: «esportabile»): le copie da parte di QUESTA conversazione e l'export dell'ultima. La
           copia si sceglie dall'elenco dell'archivio, mai da un id dato da fuori. Sola lettura. */
        if (path === '/aside') return { copies: typeof store.listAsideSessions === 'function' ? await store.listAsideSessions({ sessionId }) : [] };
        if (path === '/aside/export') {
          const copie = typeof store.listAsideSessions === 'function' ? await store.listAsideSessions({ sessionId }) : [];
          if (!copie.length) fail('CTX_SESSION_NOT_FOUND', 'This conversation has no context archive set aside.');
          return store.exportSession({ sessionId: copie.at(-1).asideId });
        }
        let match = /^\/jobs\/([^/]+)$/u.exec(path);
        if (match) {
          const job = await store.readContextJob({ sessionId, jobId: match[1] });
          if (!job) fail('CTX_JOB_NOT_FOUND', 'Compaction not found.');
          await deliver(sessionId); return { job };
        }
        match = /^\/sources\/([^/]+)$/u.exec(path);
        if (match) return { source: await engine.readContextSource({ sessionId, sourceId: match[1] }) };
        fail('CTX_ROUTE_NOT_FOUND', 'Context operation not found.');
      }
      const fields = path === '/settings' ? ['patch'] : path === '/jobs' ? ['kind'] : path.endsWith('/resolve') ? ['accept'] : path.startsWith('/facts') ? ['fact'] : [];
      common(body, fields);
      const requestFingerprint = digest({ method, path, body });
      const receipt = await store.readContextMutation({ sessionId, idempotencyKey: body.idempotencyKey, requestFingerprint });
      const wrap = result => path.startsWith('/facts') ? { fact: result } : path.startsWith('/versions') ? { version: result } : path.startsWith('/jobs') ? { job: result } : result;
      if (receipt) return wrap(receipt.result);
      if (method === 'POST' && path === '/jobs') {
        const existing = snapshot.jobs.find(job => job.idempotencyKey === body.idempotencyKey);
        if (existing) return { job: await engine.startCompaction({ sessionId, idempotencyKey: body.idempotencyKey, kind: body.kind ?? 'compact', sessionModel: await modelFor(sessionId) }) };
      }
      /* Context Manager dal dispositivo (contratto, regola 2): fermare un lavoro non cambia il contesto, e con un riassunto in corso la revisione corre: non dipende da lei */
      const fermaUnLavoro = method === 'DELETE' && /^\/jobs\/[^/]+$/u.test(path);
      if (!fermaUnLavoro && snapshot.revision !== body.expectedRevision) fail('CTX_STALE_REVISION', 'The conversation has changed. Refresh the panel before changing the context.');
      signal?.throwIfAborted();
      if (method === 'PATCH' && path === '/settings') {
        const settings = parseContextSettings({ ...snapshot.settings, ...body.patch });
        return mutation(sessionId, method, path, body, 'updateSessionSettings', { settings, expectedRevision: body.expectedRevision });
      }
      if (method === 'POST' && path === '/jobs') {
        if (!['compact', 'regenerate'].includes(body.kind ?? 'compact')) fail('CTX_INVALID_INPUT', 'Invalid compaction type.');
        /* Banco del 31/10/2026 sera: dopo un solo giro, anche enorme, il motore tiene intero l'ultimo scambio. Chi preme «Compatta», dal /compact o dalla finestra, vuole lo spazio:
           si compatta dentro il giro, come fa il motore da solo quando il contesto non basta. «Rigenera» riscrive ciò che c'è e non cambia strada. */
        const avvia = async (withinTurn) => engine.startCompaction({ sessionId, idempotencyKey: body.idempotencyKey, kind: body.kind ?? 'compact', sessionModel: await modelFor(sessionId), ...(withinTurn ? { withinTurn } : {}) });
        const job = await avvia(false).catch((errore) => { if (errore?.code !== 'CTX_NOTHING_TO_COMPACT' || (body.kind ?? 'compact') !== 'compact') throw errore; return avvia(true); });
        ownedJobs.set(`${sessionId}:${job.id}`, { sessionId, jobId: job.id });
        return { job };
      }
      let match = /^\/jobs\/([^/]+)(\/resume)?$/u.exec(path);
      if (match && (method === 'DELETE' && !match[2] || method === 'POST' && match[2])) {
        const jobId = match[1];
        const job = method === 'DELETE' ? await engine.cancelCompaction({ sessionId, jobId }) : await engine.resumeCompaction({ sessionId, jobId, sessionModel: await modelFor(sessionId) });
        const result = await mutation(sessionId, method, path, body, 'saveJobProgress', { job });
        return { job: result };
      }
      match = /^\/versions\/([^/]+)\/restore$/u.exec(path);
      if (method === 'POST' && match) {
        const version = await mutation(sessionId, method, path, body, 'restoreContextVersion', { versionId: match[1], expectedRevision: body.expectedRevision, newVersionId: randomUUID(), createdAt: clock() });
        await deliver(sessionId); return { version };
      }
      match = /^\/facts(?:\/([^/]+))?(\/resolve)?$/u.exec(path);
      if (match) {
        const factId = match[1];
        if (method === 'DELETE' && factId && !match[2]) return { fact: await mutation(sessionId, method, path, body, 'removeProtectedFact', { factId, expectedRevision: body.expectedRevision }) };
        let input = body.fact;
        const prior = snapshot.facts.find(f => f.id === factId || f.id === input?.id);
        if (method === 'POST' && match[2]) {
          if (typeof body.accept !== 'boolean' || prior?.status !== 'conflict') fail('CTX_FACT_CONFLICT_NOT_FOUND', 'No conflict to resolve.');
          input = { id: factId, text: body.accept ? prior.conflict.proposedText : prior.text, sources: body.accept ? prior.conflict.sources : prior.sources };
        } else if (!(method === 'POST' && !factId || method === 'PATCH' && factId)) fail('CTX_ROUTE_NOT_FOUND', 'Context operation not found.');
        if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => !['id', 'text', 'sources'].includes(k)) || (factId && input.id && input.id !== factId)) fail('CTX_INVALID_INPUT', 'Invalid protected information.');
        const fact = { id: factId ?? input.id ?? randomUUID(), text: input.text, sources: input.sources ?? [], status: 'active', revision: (prior?.revision ?? 0) + 1 };
        return { fact: await mutation(sessionId, method, path, body, 'upsertProtectedFact', { fact, expectedRevision: body.expectedRevision }) };
      }
      fail('CTX_ROUTE_NOT_FOUND', 'Context operation not found.');
    },
    /*
     * P18 (26/09/2026, patch approvata dall'owner via la lane CLI): l'archivio non si RILEGGE a ogni capture. Le
     * impronte dei record gia' verificati restano in memoria, legate alla revisione dell'archivio che le ha prodotte;
     * se la revisione e' ancora quella (nessun altro ha scritto: una compattazione la cambia), si usano quelle invece
     * di `allRecords` (misurato: ~25 ms a capture a 1.351 messaggi, cresce con la storia). Il confronto con OGNI
     * messaggio resta: la divergenza si scopre come prima.
     */
    syncOriginals({ sessionId, messages }) {
      return serial(sessionId, async () => {
        const snapshot = await ensure(sessionId);
        if (!Array.isArray(messages)) fail('CTX_INVALID_INPUT', 'Invalid history.');
        const noto = impronteVerificate.get(sessionId);
        const salvate = noto && Number.isInteger(snapshot?.revision) && noto.revision === snapshot.revision ? noto.impronte : (await allRecords(sessionId)).map((record) => record.sha256);
        if (messages.length < salvate.length || salvate.some((impronta, index) => impronta !== digest(messages[index]))) {
          impronteVerificate.delete(sessionId);
          /* R-05 (12/10/2026): la divergenza dice DOVE. Dal vivo il codice arrivava nudo e la causa non si poteva leggere dal
             giornale: quale messaggio era cambiato, e se la storia attiva era più CORTA dell'archivio (una coda persa) o
             RISCRITTA (un messaggio vecchio modificato). Solo posizioni, conteggi e ruolo: mai il contenuto. */
          const primoDiverso = salvate.findIndex((impronta, index) => index >= messages.length || impronta !== digest(messages[index]));
          const errore = new ContextEngineError('The active history differs from the archive. The originals are kept; the full version must be recovered.', 'CTX_HISTORY_DIVERGED');
          errore.dettaglio = Object.freeze({
            archiviati: salvate.length, attivi: messages.length, primoDiverso,
            forma: messages.length < salvate.length && primoDiverso >= messages.length ? 'piu-corta' : 'riscritta',
            ruolo: typeof messages[primoDiverso]?.role === 'string' ? messages[primoDiverso].role : null,
          });
          errore.sessionId = sessionId; // COD-220 (Mobile 30/10): il registro del processo deve dire DI CHI è la divergenza
          throw errore;
        }
        const records = messages.slice(salvate.length).map((message, offset) => ({ id: `message-${salvate.length + offset + 1}`, message, createdAt: clock(), origin: 'desktop-kernel' }));
        if (records.length) await store.appendOriginalBatch({ sessionId, records, expectedRevision: snapshot.revision });
        const dopo = await store.readContextSnapshot({ sessionId });
        impronteVerificate.set(sessionId, { revision: dopo?.revision, impronte: [...salvate, ...records.map((record) => digest(record.message))] });
        return dopo;
      });
    },
    /*
     * 24/09/2026 — F4: ARCHIVIO ≠ PROIEZIONE (T1/T2 della ricognizione). L'adapter desktop corregge gli esiti
     * degli attrezzi PRIMA della richiesta; archiviare quella proiezione faceva divergere l'archivio (grezzo, da
     * `capture`) alla richiesta dopo: `CTX_HISTORY_DIVERGED` alla seconda richiesta, riprodotto dalla sonda T2.
     * Ora: si ARCHIVIA da `originali` quando c'è (ripiego: `messages`, come prima per chi non lo passa), si
     * PROIETTA e si RIASSUME da `messages`. Una proiezione non allineata (lunghezza o ruoli diversi) si rifiuta
     * prima di toccare l'archivio. Come Hermes (`hermes_state_messages.py:735-741`, clone `65ad529`) e Claude
     * Code (issue #26125, 16/02/2026: «The full transcript is preserved in transcript.jsonl on disk» mentre al
     * modello arrivano i «compacted summaries»): la trascrizione grezza e il contesto inviato sono due cose.
     */
    async prepare({ sessionId, messages, originali, tools, signal, waitForInFlight = false, summaryCeilingMs, onInTurnWait, growWindow }) {
      let projection;
      if (originali !== undefined) {
        if (!Array.isArray(originali) || !Array.isArray(messages) || messages.length !== originali.length || messages.some((message, index) => message?.role !== originali[index]?.role)) fail('CTX_INVALID_INPUT', 'The request projection is not aligned with the originals (different length or roles).');
        projection = messages;
      }
      /*
       * ⛔ 12/10/2026, decisione dell'owner («Si ripara da solo») — dal trascritto 36289618: dopo un cambio di modello la storia
       *   attiva non combaciava più con l'archivio e il motore ricadeva sulla compattazione semplice a OGNI giro, per sempre.
       *   Qui, e solo qui (la strada del giro): alla divergenza gli originali vecchi vanno DA PARTE sotto un altro id (niente si
       *   perde: `setAsideSession`), l'archivio riparte dalla storia attiva e la richiesta prosegue col motore. Chi chiama lo
       *   legge in `result.riallineato` e lo dice una volta. `syncOriginals` chiamato da solo resta severo: chi confronta
       *   vuole sapere, non riparare. Se non si può riparare (archivio senza l'operazione, lavoro in corso) l'errore resta
       *   quello di prima, e il giro ricade come prima.
       */
      let riallineato = null;
      const daArchiviare = originali === undefined ? messages : originali;
      try { await api.syncOriginals({ sessionId, messages: daArchiviare }); }
      catch (errore) {
        if (errore?.code !== 'CTX_HISTORY_DIVERGED' || typeof store.setAsideSession !== 'function') throw errore;
        /*
         * ⛔ Owner 27/10/2026 notte, «Si annulla, come Codex» — dal file dell'owner (sessione 9eea8edf, richieste 12 e 13): dopo uno
         *   Stop la storia non combaciava e la riparazione qui sotto era VIETATA, perché un riassunto in sottofondo era fermo da 30
         *   minuti sul limite del piano e l'archivio non mette da parte con un lavoro attivo (`setAsideSession` ⇒ CTX_JOB_ACTIVE).
         *   Le richieste morivano con CTX_HISTORY_DIVERGED (riprodotto: senza il lavoro attivo si ripara). Quel riassunto era su una
         *   storia ormai vecchia: si annulla, si aspetta al più `ATTESA_ANNULLAMENTO_MS` che il suo esecutore si fermi (riceve il segnale,
         *   `engine.mjs` summarize), poi si ripara. Come Codex: il tentativo in sottofondo è legato alla versione della storia e uno
         *   vecchio si scarta senza mai fermare la richiesta (`core/src/session/async_compaction.rs:24-30`, `:134`); i token già
         *   consumati restano pagati («Discarded requests still charge completed usage», `:2`).
         */
        await annullaLavoriVecchi(sessionId);
        const asideId = `${sessionId}.aside-${Date.parse(clock()) || 0}-${randomUUID().slice(0, 8)}`;
        try { await serial(sessionId, () => store.setAsideSession({ sessionId, asideId, event: annuncioArchivioDaParte(sessionId, asideId) })); }
        catch { throw errore; }
        impronteVerificate.delete(sessionId); ultimeProiezioni.delete(sessionId);
        await deliver(sessionId).catch(() => {}); // prima di tutto ciò che può ancora fallire: l'archivio a questo punto è già stato spostato
        await api.syncOriginals({ sessionId, messages: daArchiviare });
        /*
         * L3-3 (owner 13/10/2026, D1: «solo l'ULTIMA per conversazione»): ora che la copia nuova è scritta E l'archivio vivo è
         * ripartito, le copie da parte più vecchie si tolgono. L'archivio le cancella solo dopo aver riletto e verificato per
         * intero quella da tenere (`pruneAsideSessions`); se non ci riesce, o se l'archivio non ha l'operazione, restano tutte
         * e il giro prosegue: una pulizia non riuscita non è un motivo per fermare la richiesta.
         */
        if (typeof store.pruneAsideSessions === 'function') {
          try { await serial(sessionId, () => store.pruneAsideSessions({ sessionId, keep: asideId })); }
          catch { /* niente è stato tolto (una transazione sola): si riprova alla prossima riparazione */ }
        }
        riallineato = Object.freeze({ asideId, ...(errore.dettaglio && typeof errore.dettaglio === 'object' ? errore.dettaglio : {}) });
      }
      let result;
      /* P4: un riassunto di fine giro appena annullato per far posto a un giro si chiude prima che il motore prepari (vedi `annullaPerUnGiro`) */
      if (annullamentiInCorso.size) await Promise.allSettled([...annullamentiInCorso]);
      try { result = await engine.prepareForRequest({ sessionId, projection, tools, sessionModel: await modelFor(sessionId), signal, waitForInFlight: waitForInFlight === true,
        /* owner 27/10 notte, «mai aspettare» (C4): anche lo 0, che per il motore vuol dire «non aspettare il riassunto» */
        ...(Number.isSafeInteger(summaryCeilingMs) && summaryCeilingMs >= 0 ? { summaryCeilingMs } : {}),
        ...(typeof onInTurnWait === 'function' ? { onInTurnWait } : {}),
        /* cresciuta la finestra, il profilo si rilegge (`modelFor` ⇒ la finestra viva del motore): il motore rimisura su quella */
        ...(typeof growWindow === 'function' ? { growWindow: async (info) => {
          const esito = await growWindow(info);
          return esito?.grown === true ? { ...esito, sessionModel: await modelDopoLaCrescita(sessionId, signal) } : esito;
        } } : {}) }); }
      catch (error) {
        /* 25/09 — l'avviso «compattazione automatica in pausa» nasce anche quando la richiesta MUORE (contesto che non entra,
           riassunto rifiutato mentre si aspettava): senza questa consegna restava nella coda fino alla richiesta dopo. Una
           consegna fallita non copre l'errore vero della richiesta. */
        await deliver(sessionId).catch(() => {});
        /* Blocco 21 (reperto del Motore locale, 01/11/2026): qui gli originali sono GIÀ nell'archivio, e il guscio deve saperlo anche se la
           richiesta è morta dopo (profilo del modello che fallisce): altrimenti la toglie dalla cattura e la storia risulta più corta. */
        if (error && typeof error === 'object') error.originaliArchiviati = true;
        throw error;
      }
      if (Array.isArray(result?.messages)) ultimeProiezioni.set(sessionId, result.messages);
      /* C1 (owner 10/10/2026, «Sì, come campi»): quante uscite le regole hanno tolto o accorciato in QUESTA richiesta, e su quale
         versione, per la scheda Contesto. Facoltativo; un suo errore non tocca mai la richiesta. */
      if (typeof onPrepared === 'function') { try { onPrepared({ sessionId, level1: result?.level1 ?? null, versionId: result?.versionId ?? null }); } catch { /* solo per guardare */ } }
      /* D10 (revisione di fine fase, 01/11/2026): come nel ramo d'errore qui sopra. Una consegna fallita non butta una richiesta già preparata: l'evento non
         confermato resta in coda e parte alla consegna dopo. */
      await deliver(sessionId).catch(() => {});
      return riallineato && result && typeof result === 'object' ? { ...result, riallineato } : result;
    },
    async append({ sessionId, record }) { await serial(sessionId, () => ensure(sessionId)); return engine.appendOriginal({ sessionId, record }); },
    async close() {
      if (closed) return;
      closed = true;
      await Promise.allSettled([...queues.values()]);
      await Promise.allSettled([...deliveries.values()]);
      for (const options of ownedJobs.values()) {
        const job = await store.readContextJob(options);
        /* 27/10/2026 (prova ARCHIVIO-LAVORO-ATTIVO-01): un lavoro che non sta più sotto la conversazione è stato spostato con la copia
           messa da parte dalla riparazione dell'archivio (`setAsideSession` sposta TUTTI i lavori, anche quelli conclusi) — non c'è
           niente da fermare né da aspettare qui, e cercarlo faceva fallire la chiusura con «Compattazione non trovata». */
        if (!job) continue;
        if (!terminal.has(job.state)) await engine.cancelCompaction(options);
        /* C8 (contratto «mai aspettare», misura della CLI 28/10): annullato, si aspetta al più `ATTESA_ANNULLAMENTO_MS` — un esecutore che
           non si ferma subito (un fornitore appeso) teneva ferma la chiusura, e con lei il RunFinished di `talos -p` */
        await aspettaAnnullato(options);
      }
      ownedJobs.clear();
      /*
       * ⛔ F2 della CLI (prima revisione della 0.6.8, 16/10/2026, S2): si annullavano solo i lavori chiesti a mano (`/jobs`); i
       *   riassunti AUTOMATICI — il `…-turn-bg` che parte alla fine di ogni giro lungo — continuavano mentre si chiudeva l'archivio.
       *   `talos -p` restava vivo fino alla fine del riassunto (60 s misurati, fino al tempo massimo del riassunto con un fornitore
       *   fermo) e poi lo buttava (`paused CTX_JOB_INTERRUPTED`, pagato e mai usato). Chi chiude ferma OGNI lavoro non concluso delle
       *   conversazioni che ha toccato, e lo aspetta: una regola sola per tutti gli ospiti.
       */
      for (const sessionId of sessioniToccate) {
        let snapshot = null;
        try { snapshot = await store.readContextSnapshot({ sessionId }); } catch { continue; }
        for (const job of snapshot?.jobs ?? []) {
          if (terminal.has(job.state)) continue;
          try { await engine.cancelCompaction({ sessionId, jobId: job.id }); await aspettaAnnullato({ sessionId, jobId: job.id }); } // C8: col tetto
          catch { /* un lavoro che non si lascia fermare non trattiene la chiusura */ }
        }
      }
      sessioniToccate.clear();
    },
  };
  return Object.freeze(api);
}
