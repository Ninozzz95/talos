import { ContextEngineError, ContextEventV1, ContextJobV1, ContextVersionV1, TokenMeasurementV1, parseContextRecord, parseContextSettings } from './contracts.mjs';
import { computeContextBudget, planCompaction, selectClosedPrefix } from './compaction-planner.mjs';
import { validateContextProfile } from './profiles.mjs';
import { clearOldToolOutputs, clearTailThrough, shortenRecentLargeOutputs, tailClearingBoundary, DEFAULT_CLEARED_POINTER } from './tool-output-clearing.mjs';
/** Review Y2 (10/10): la quota dura del giro in sospeso, come Hermes `TAIL_MAX_CONTEXT_FRACTION = 0.20` (`context_compressor.py:949`). */
const PENDING_ROUND_WINDOW_SHARE = 0.20;
import { buildSummaryRequest, validateSummary, composeActiveContext, personRequestBudget, personRequestsKept } from './summary.mjs';
import { chunkContextRecords, rankContextSources, selectContextEvidence } from './retrieval.mjs';

const terminal = new Set(['committed', 'cancelled', 'failed']);
const fail = (code, message) => { throw new ContextEngineError(message, code); };
const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)))), byte => byte.toString(16).padStart(2, '0')).join('');
const identity = profile => ({ provider: profile.provider, model: profile.model });
const sameModel = (a, b) => a?.provider === b?.provider && a?.model === b?.model;
const plainText = content => typeof content === 'string' ? content : Array.isArray(content) ? content.filter(p => ['text', 'input_text', 'output_text'].includes(p?.type) && typeof p.text === 'string').map(p => p.text).join('\n') : '';
const activeStates = new Set(['queued', 'preparing', 'summarizing', 'validating', 'ready']);

/*
 * 25/09/2026 — ticket della CLI «riassunto rifiutato richiesto a ogni passo»
 * (`docs/talos-cli/2026-09-25-ticket-desktop-ce-summary-retries.md`; la CLI l'ha riprodotto: 5 riassunti pagati in UN giro,
 * nessuno pubblicato, niente a schermo). Causa, in `prepareForRequest`: un lavoro fallito è terminale e la chiave
 * `auto-${revision}` cambia a ogni passo del giro ⇒ ogni richiesta ne apriva uno nuovo.
 * Decisione owner 25/09 «pausa che cresce + segnale»: dopo un fallimento la compattazione AUTOMATICA aspetta 60 s, poi
 * 300, poi 900 — la scala di Hermes (`agent/context_compressor.py:768-772`, clone `65ad529` del 23/09/2026: «Timeouts
 * escalate 60s -> 300s -> 900s … a flat 30s cooldown let every async-completion turn re-issue the same capped request»),
 * con un contatore PER CLASSE d'errore (:776-783) che solo un riassunto riuscito azzera (:2473-2480). La «Compatta» della
 * persona non aspetta (Hermes :2887, «Manual /compress passes force=True»). Lo stato si RICAVA dai lavori già su disco
 * (ultimo `committed` = nessuna pausa): sopravvive a un riavvio senza una riga nuova nello schema.
 */
export const RAFFREDDAMENTO_DOPO_RIFIUTO_MS = Object.freeze([60_000, 300_000, 900_000]);
// Conta l'ultimo ESITO, non l'ultima creazione: un lavoro in pausa (`paused` non blocca un lavoro nuovo) può fallire DOPO
// una «Compatta» riuscita creata più tardi. `updatedAt` di un lavoro terminale è l'istante dell'esito (per `committed`
// è `version.createdAt`, `sqlite-worker.mjs::commitContextVersion`).
const piuRecente = (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || b.baseRevision - a.baseRevision || Date.parse(b.createdAt) - Date.parse(a.createdAt);
/*
 * Contano per la pausa SOLO i fallimenti del RIASSUNTO (e del fornitore che lo scrive) — la decisione owner era «pausa dopo un
 * riassunto rifiutato», e Hermes raffredda sui fallimenti del riassunto: vuoto, troncato, sovraccarico, tempo scaduto
 * (`agent/context_compressor.py:740-783`). ⛔ Il 25/09 contavano TUTTI i lavori falliti: la CLI ha misurato un riassunto VALIDO
 * perso per `CTX_STALE_REVISION` (lo stato è cambiato durante la compattazione), poi 60 s di pausa e il giro morto per contesto
 * pieno — 2-4 volte su 6 (`r5a-coord-ce-compaction`). Una corsa interna del motore (revisione o modello cambiati a metà, un
 * annullamento, niente da compattare) non costa un riassunto sbagliato, e ritentare subito è ciò che deve succedere.
 * `CTX_COMPACTION_FAILED` è l'errore NON del motore (rete, 5xx, tempo scaduto del fornitore): conta, come in Hermes.
 * D5 (revisione di fine fase, 01/11/2026): contano anche i tre codici di una risposta ARRIVATA e inservibile (illeggibile, con attrezzi, rifiutata dal modello):
 * è pagata, e prima se ne pagava una a ogni passo del giro (6 su 6 passi misurati), lo stesso ticket del 25/09 sulla porta vera. `CTX_SUMMARY_HTTP` resta fuori
 * (Performance, 01/11): un 4xx o 5xx non è una risposta pagata, e la catena del riassunto ricorda già il blocco.
 */
/* Contratto «niente da compattare» (31/10/2026): il guadagno minimo di un riassunto CHIESTO (regola owner 02/10, «Almeno il 30%»).
   `createContextEngine({ guadagnoMinimoChiesto })` lo cambia SOLO per le prove che usano conversazioni minuscole per provare altro:
   il desktop e la CLI non lo passano, quindi la regola resta una sola. */
export const GUADAGNO_MINIMO_CHIESTO = 0.30;
/* Un byte del blocco firmato, in byte di testo: 3,5 byte di testo a token contro 12 del cifrato, misurato sul piano il 31/10/2026 (`strumenti/misura-peso-cifrato.mjs`). */
export const PESO_DEL_BLOCCO_FIRMATO = 3.5 / 12;
const FALLIMENTI_DEL_RIASSUNTO = new Set(['CTX_INVALID_SUMMARY', 'CTX_EMPTY_SUMMARY', 'CTX_TRUNCATED_SUMMARY', 'CTX_INVALID_SOURCE',
  'CTX_NO_REDUCTION', 'CTX_SEGMENT_TOO_LARGE', 'CTX_CONTEXT_TOO_SMALL', 'CTX_COMPACTION_FAILED',
  'CTX_SUMMARY_RESPONSE_INVALID', 'CTX_SUMMARY_TOOLS', 'CTX_SUMMARY_REFUSED']);
export function raffreddamentoCompattazione(jobs, adesso) {
  let ultimo = null; let tentativi = 0;
  for (const job of [...jobs].sort(piuRecente)) {
    if (job.state === 'committed') break;
    // annullati, in pausa e le corse interne del motore non pagano un rifiuto: non aprono e non chiudono la pausa
    if (job.state !== 'failed' || !FALLIMENTI_DEL_RIASSUNTO.has(job.error?.code)) continue;
    /* Contratto «niente da compattare» (31/10/2026, OK di Performance, Mobile e CLI): una compattazione CHIESTA dalla persona (/compact,
       «Compatta ora», «Rigenera»: chiave scelta da chi chiama — le chiavi `auto-` sono riservate al motore) che ha passato il controllo
       prima di pagare ma non ha liberato spazio non è un motivo per ritentare da sola: niente pausa e niente nuovo tentativo, la persona
       decide. I lavori automatici restano come prima. (Hermes tratta il «niente da comprimere» come esito, non come fallimento:
       `agent/conversation_compression_manual.py:107-109`, clone 22/10.) */
    if (job.error?.code === 'CTX_NO_REDUCTION' && typeof job.idempotencyKey === 'string' && !job.idempotencyKey.startsWith('auto-')) continue;
    ultimo ??= job;
    if (job.error?.code === ultimo.error?.code) tentativi++;
  }
  if (!ultimo) return null;
  const attesaMs = RAFFREDDAMENTO_DOPO_RIFIUTO_MS[Math.min(tentativi, RAFFREDDAMENTO_DOPO_RIFIUTO_MS.length) - 1];
  const fino = Date.parse(ultimo.updatedAt) + attesaMs;
  if (!(Date.parse(adesso) < fino)) return null;
  return { jobId: ultimo.id, code: ultimo.error?.code ?? 'CTX_COMPACTION_FAILED', attempts: tentativi, waitSeconds: attesaMs / 1000, failedAt: ultimo.updatedAt, retryAfter: new Date(fino).toISOString() };
}

/*
 * 24/09/2026 — F4: ARCHIVIO ≠ PROIEZIONE. La proiezione è la storia che l'adapter desktop ha CORRETTO (esiti
 * degli attrezzi riscritti prima della richiesta, `talosHarness.desktop-hotfix.mjs::correggiMessaggiDesktop`):
 * il modello e il riassuntore vedono QUELLA; l'archivio, `sourceHash` e le citazioni della versione restano
 * sugli originali grezzi. Prima di oggi il motore compilava solo dai record (`prepareForRequest`), e il
 * servizio desktop, per far vedere il testo corretto, archiviava la proiezione: alla richiesta dopo l'archivio
 * non combaciava più (`CTX_HISTORY_DIVERGED`, T1/T2 della ricognizione del 24/09). Allineamento 1:1 per
 * sequenza — stessa lunghezza, stessi ruoli — altrimenti si RIFIUTA, non si indovina. È la forma di Hermes:
 * le righe originali restano in tabella e ciò che va al modello è un insieme distinto
 * (`hermes_state_messages.py:735-741`, clone `65ad529` del 23/09/2026: «soft-archive the active rows
 * (active=0, compacted=1: summarized away, still searchable) and insert compacted_messages as fresh active rows»).
 */
function checkProjection(records, projection) {
  if (projection === undefined) return;
  if (!Array.isArray(projection) || projection.length !== records.length || projection.some((message, index) => !message || typeof message !== 'object' || message.role !== records[index].message.role)) fail('CTX_PROJECTION_MISALIGNED', 'La proiezione della richiesta non è allineata all’archivio (lunghezza o ruoli diversi).');
}
const overlay = (records, projection) => projection === undefined ? records : records.map(record => {
  const message = projection[record.sequence - 1];
  if (message === undefined) return record; // record arrivato dopo la richiesta che ha aperto il job: resta grezzo
  if (message?.role !== record.message.role) fail('CTX_PROJECTION_MISALIGNED', 'La proiezione della richiesta non è allineata all’archivio (lunghezza o ruoli diversi).');
  return { ...record, message };
});
/*
 * Le citazioni della sintesi sono state verificate sulla proiezione (è il testo che il riassuntore ha letto);
 * la versione però vive nell'archivio e il verificatore del commit (`node/context-export.mjs:44-62`) le
 * pretende ALLA LETTERA negli originali grezzi. Quelle che stanno solo nel testo corretto passano in
 * `unverifiedSources` (mai spacciate per verificate); se non ne resta nessuna, la versione NON si pubblica.
 */
function ricitaSugliOriginali(summary, records) {
  const byId = new Map(records.map(record => [record.id, record]));
  const verified = []; const dropped = [...(summary.unverifiedSources ?? [])];
  for (const source of summary.sources) {
    const record = byId.get(source.recordId);
    const text = record ? plainText(record.message.content) : '';
    const start = record ? text.indexOf(source.quote) : -1;
    if (start < 0) { dropped.push({ recordId: source.recordId, quote: source.quote, reason: record ? 'not-found' : 'unknown-record' }); continue; }
    verified.push({ recordId: source.recordId, quote: source.quote, start, end: start + source.quote.length });
  }
  if (records.length && !verified.length) fail('CTX_INVALID_SOURCE', 'Le citazioni della sintesi stanno solo nel testo corretto della richiesta, non negli originali archiviati. La versione precedente rimane valida.');
  return { ...summary, sources: verified, ...(dropped.length ? { unverifiedSources: dropped } : {}) };
}

/** The injected store owns durability; this controller owns candidate validity.
 * Inference never receives a context which failed its final measurement. */
/*
 * A1 (owner 21/10/2026 sera; contratto riga viva §4): il riassunto che il GIRO aspetta (`waitForCompaction` dentro `prepareForRequest`)
 *   ha un tetto. Dal vivo sul Pad un lavoro è durato 22 minuti (16 + 6, poi rifiutato) con la chat su «Elaborazione». Hermes abbandona
 *   la compattazione a 600 s (`agent/conversation_compression.py:668`). Allo scadere il lavoro si annulla e il giro riceve
 *   `CTX_COMPACTION_TIMEOUT`: chi lo ospita prosegue con un riassunto senza modello. Il riassunto in sottofondo non ha tetto (non ferma
 *   nessuno). `inTurnSummaryCeilingMs` per il motore, `summaryCeilingMs` per una chiamata.
 */
export const IN_TURN_SUMMARY_CEILING_MS = 600_000;

export function createContextEngine({ store, model, tokenCounter, retrieval, embedding, toolCatalog, assets, usagePolicy, recoveryHint = null, anchorIndex = null, isPersonRequest = null, pesoDelBloccoFirmato = PESO_DEL_BLOCCO_FIRMATO, clearedToolPointer = DEFAULT_CLEARED_POINTER, clock = () => new Date().toISOString(), idFactory = () => crypto.randomUUID(), inTurnSummaryCeilingMs = IN_TURN_SUMMARY_CEILING_MS, guadagnoMinimoChiesto = GUADAGNO_MINIMO_CHIESTO }) {
  if (!store || !model?.resolveModel || !model?.summarize || !tokenCounter?.countPreparedContext) fail('CTX_PORT_MISSING', 'Archivio, modello e contatore sono necessari.');
  const running = new Map();
  const key = (sessionId, jobId) => JSON.stringify([sessionId, jobId]);
  /* Spesa di servizio, parte 2 B (30/10/2026; CLI, Mobile, Performance): chi ASPETTA un lavoro, per lavoro — attese in corso e attese
     totali. Una chiamata del riassunto è «in primo piano» se qualcuno lo aspettava quando è partita, se un'attesa è cominciata mentre
     andava, o se ce n'è una alla fine (CLI: col solo contatore il /compact, che aspetta fin dall'inizio, risulterebbe in sottofondo).
     Solo in memoria: è un'etichetta della riga di spesa, non uno stato del lavoro. */
  const attese = new Map();
  const iniziaAttesa = (sessionId, jobId) => {
    const k = key(sessionId, jobId);
    const a = attese.get(k) ?? { inCorso: 0, totale: 0 };
    a.inCorso += 1; a.totale += 1; attese.set(k, a);
    let chiusa = false;
    /* la voce si toglie solo a lavoro FINITO (nessuna chiamata può più guardarla): toglierla prima perderebbe un'attesa cominciata e
       finita tutta dentro una chiamata. E la mappa non cresce coi lavori finiti, che `running` invece tiene. */
    return () => { if (chiusa) return; chiusa = true; a.inCorso -= 1; if (a.inCorso === 0 && running.get(k)?.finito === true && attese.get(k) === a) attese.delete(k); };
  };
  const letturaAttese = (sessionId, jobId) => () => { const a = attese.get(key(sessionId, jobId)); return { inCorso: a?.inCorso ?? 0, totale: a?.totale ?? 0 }; };
  const state = async sessionId => {
    const snapshot = await store.readContextSnapshot({ sessionId });
    if (!snapshot) fail('CTX_SESSION_NOT_FOUND', 'Conversazione non presente nell’archivio del contesto.');
    return snapshot;
  };
  const originals = async (sessionId, throughSequence) => {
    const result = []; let afterSequence = 0;
    for (;;) {
      const page = await store.readOriginals({ sessionId, afterSequence, throughSequence, limit: 1000 });
      result.push(...page);
      if (page.length < 1000) return result;
      afterSequence = page.at(-1).sequence;
    }
  };
  const measure = async (messages, tools, profile, signal) => {
    signal?.throwIfAborted();
    const measurement = TokenMeasurementV1.parse(await tokenCounter.countPreparedContext({ messages, tools, model: profile, signal }));
    signal?.throwIfAborted();
    if (!sameModel(measurement, profile) || measurement.windowTokens !== profile.windowTokens || measurement.responseReserve !== profile.responseReserve) fail('CTX_MEASUREMENT_MISMATCH', 'Il conteggio non corrisponde al modello e alla riserva della richiesta.');
    return measurement;
  };
  const budgetFor = (measurement, settings) => computeContextBudget({ ...measurement, settings });
  /*
   * Contratto «niente da compattare» (31/10/2026, OK di Performance, Mobile e CLI; reperto dal vivo: un /compact su ~16,6k token
   *   ha pagato 11.514 + 1.167 token per finire CTX_NO_REDUCTION). Prima di pagare un riassunto CHIESTO, si misura la richiesta
   *   con un riassunto VUOTO al posto della parte da compattare: è il massimo che un riassunto può liberare. Se nemmeno così si
   *   guadagna almeno il 30%, non c'è niente da compattare e il modello non si chiama.
   * ⛔ Metodo e soglia sono quelli della Chat del telefono, che sono già una regola dell'owner per lo stesso gesto (02/10, «Almeno
   *   il 30%», `chatCompattazione.ts:103-106`, `GUADAGNO_MINIMO`): una regola sola per «/compact» e «Compatta ora».
   * ⛔ Performance: la misura è LOCALE (la stessa stima a byte che `prepareForRequest` usa già, byte / 3,5), una sola al clic, nessuna richiesta prima
   *   dell'esito — il contatore del modello locale interroga llama.cpp, e qui non serve un numero esatto: si confrontano due conteggi
   *   fatti nello stesso modo. Hermes controlla solo che un pezzo di mezzo esista (`context_compressor.py:5104-5108`); qui si
   *   guarda anche quanto renderebbe. Codex chiama sempre il modello (`compact.rs:264`).
   */
  const RIASSUNTO_VUOTO = Object.freeze({ schema: 'talos.context.summary.v1', text: '.', goal: '.', decisions: [], constraints: [], completed: [], pending: [], resources: [], sources: [] });
  function guadagnaAbbastanza(snapshot, records, coveredThrough, sessionModel, tools) {
    const peso = valore => new TextEncoder().encode(JSON.stringify(valore)).length;
    const attrezzi = peso(tools ?? []);
    const intera = peso(compiled(snapshot, records, { targetModel: sessionModel })) + attrezzi;
    const conVuoto = peso(compiled(snapshot, records, { summary: RIASSUNTO_VUOTO, coveredThrough, tailClearedThrough: 0, targetModel: sessionModel })) + attrezzi;
    return intera > 0 && (intera - conVuoto) / intera >= guadagnoMinimoChiesto;
  }
  /*
   * B4 (cura della compattazione per Luna 6, 05/11/2026; OK di CLI, Performance e Mobile, `FORMA-CURA-COMPATTAZIONE-LUNA-2026-11-05.md` §8):
   *   un lavoro AUTOMATICO parte solo se il guadagno stimato, tolto il costo minimo di un riassunto, è > 0. Reperto del banco del 04/11:
   *   in cinque sessioni un lavoro a metà del primo giro copriva solo i messaggi di sistema, la richiesta e l'elenco dei file
   *   (`covered=6`), pagava una chiamata, finiva CTX_NO_REDUCTION e apriva 60 secondi di pausa. Stessa misura LOCALE di
   *   `guadagnaAbbastanza` (byte, nessuna chiamata, prima di pagare: condizione del Mobile), con un riassunto MINIMO al posto di quello
   *   vuoto. Il minimo è MISURATO: sui 117 riassunti veri del banco del 04/11 (Luna 6 e gli altri) il testo più corto è di 178 caratteri
   *   e le fonti chieste sono almeno 2; le citazioni sono di almeno 20 caratteri (la richiesta, `summary.mjs`). Qui: testo di 150,
   *   2 fonti da 20 — sotto ogni riassunto visto, quindi la stima sbaglia verso «parte». Sul lavoro A9 (`covered=6`) il riassunto
   *   vuoto avrebbe liberato 147 byte su 31.469, meno di qualsiasi riassunto vero (il suo, scritto e scartato, pesava 1.170 byte).
   *   Soglia «> 0» e non il 30% dei lavori chiesti: un riassunto utile in sottofondo non si toglie (Performance, CLI e Mobile, 05/11).
   *   Hermes salta prima del modello un passo «strutturalmente vuoto» senza contarlo come guasto (`agent/context_compressor.py:5192-5197`,
   *   clone 01/11, `_structural_no_op_result`); il pacchetto `hermes-jev-compact` (PyPI, 2026) ripiega se il risultato non scende del 25%.
   */
  const TESTO_MINIMO = 'x'.repeat(150);
  const FONTE_MINIMA = 'x'.repeat(20);
  function guadagnaQualcosa(snapshot, records, coveredThrough, sessionModel) {
    const peso = valore => new TextEncoder().encode(JSON.stringify(valore)).length;
    const fonte = records.find(r => r.sequence <= coveredThrough && !['system', 'developer'].includes(r.message.role))?.id ?? 'record';
    const citazione = { recordId: fonte, quote: FONTE_MINIMA, start: 0, end: FONTE_MINIMA.length };
    const minimo = { ...RIASSUNTO_VUOTO, text: TESTO_MINIMO, sources: [citazione, citazione] };
    const intera = peso(compiled(snapshot, records, { targetModel: sessionModel }));
    const conMinimo = peso(compiled(snapshot, records, { summary: minimo, coveredThrough, targetModel: sessionModel }));
    return intera - conMinimo > 0;
  }
  /* C1 (09/10/2026, banco A/B + Hermes «anchor index»): l'indice meccanico della parte riassunta — percorsi, impronte, errori —
     calcolato dalla funzione di chi crea il motore sui messaggi COPERTI; il prefisso coperto è immutabile, quindi si ricorda per
     (sessione, punto coperto, numero dei messaggi). Un errore dell'indice non ferma mai la richiesta: niente indice. */
  const anchorsMemo = new Map();
  /* Review del bugfixer su 59cdfdcba (Y1): un messaggio `user` non è sempre della persona — chi crea il motore dice quali lo
     sono (il desktop esclude le buste dei sotto-agenti, dei Workflow e del dialogo fra agenti). Un predicato che lancia vale
     «non della persona»: nel registro entra solo ciò che è certamente suo. */
  const personRequest = message => { if (typeof isPersonRequest !== 'function') return true; try { return isPersonRequest(message) === true; } catch { return false; } };
  /* Dove comincia la richiesta in corso (revisione del blocco 14, 31/10/2026): un messaggio della persona dopo un turno chiuso. Una nota del kernel non lo è, e nemmeno un messaggio
     in coda arrivato fra un attrezzo e l'altro: le uscite prima di lui servono ancora. Senza nessuno, dopo un riassunto dentro il giro, la richiesta è tutta la coda. */
  const inizioDellaRichiesta = coda => {
    for (let i = coda.length - 1; i > 0; i--) if (coda[i].role === 'user' && personRequest(coda[i]) && coda[i - 1].role !== 'tool') return i;
    return 0;
  };
  const anchorsFor = (snapshot, records, coveredThrough) => {
    if (typeof anchorIndex !== 'function' || !coveredThrough) return null;
    const covered = records.filter(r => r.sequence <= coveredThrough && !['system', 'developer'].includes(r.message.role)).map(r => r.message);
    const key = `${snapshot.sessionId}:${coveredThrough}:${covered.length}`;
    if (!anchorsMemo.has(key)) {
      let text = null;
      try { const out = anchorIndex(covered); text = typeof out === 'string' && out.trim() ? out : null; } catch { text = null; }
      if (anchorsMemo.size > 64) anchorsMemo.clear();
      anchorsMemo.set(key, text);
    }
    return anchorsMemo.get(key);
  };
  function compiled(snapshot, records, { summary = snapshot.activeVersion?.summary, coveredThrough = snapshot.activeVersion?.coveredThrough ?? 0, tailClearedThrough = snapshot.activeVersion?.tailClearedThrough ?? 0, evidence = [], targetModel, clear = null, conta = null, retained = null } = {}) {
    /* ⛔ Cache del piano (CLI + desktop, 15/10/2026): in testa va solo il blocco di sistema INIZIALE (quelli prima del primo messaggio
       non di sistema) e i system già coperti dal riassunto, che il riassunto riscrive comunque. Un system arrivato DOPO — il «Project
       context update» dell'agent-service, la frase F-027 del kernel — resta al suo posto nella coda: prima risaliva in testa, prima
       del primo messaggio della persona, e il prefisso (con la chiave della cache del piano) cambiava a ogni giro con la cartella
       cambiata. Come Hermes (`context_compressor.py:4633`: si protegge solo il system iniziale); OpenAI «Prompt caching» (15/10/2026):
       la cache vale solo per un prefisso esatto, lo stabile in testa e il variabile in fondo. */
    const diSistema = r => ['system', 'developer'].includes(r.message.role);
    const primoNonDiSistema = records.find(r => !diSistema(r))?.sequence ?? Infinity;
    const inTesta = r => diSistema(r) && (r.sequence < primoNonDiSistema || r.sequence <= coveredThrough);
    const systemMessages = records.filter(inTesta).map(r => r.message);
    const codaRegistro = records.filter(r => r.sequence > coveredThrough && !inTesta(r));
    const verbatimTail = codaRegistro.map(r => r.message);
    /* La coda dopo il riassunto (owner 05/11/2026, registro 224): le uscite vecchie fino al punto salvato nella versione si mostrano col
       segnaposto (`tool-output-clearing.mjs`, `tailClearingBoundary`). Il punto è fermo per tutta la vita della versione: stesso prefisso,
       cache intera. Le regole sotto lavorano sulla coda così; il conto delle uscite accorciate si fa sempre sulla coda intera. */
    const codaVista = tailClearedThrough > coveredThrough ? clearTailThrough(codaRegistro, tailClearedThrough, { pointer: clearedToolPointer }) : verbatimTail;
    // C1 level 1: `clear` = a `{ cleared }` box; the old tool outputs of the verbatim part are cleared BEFORE the provider shapes it
    /* Chiusura della compattazione (31/10/2026, dal vivo: 2 dati su 6 in 5 corse su 6, e il giro «riuscito»): le uscite della richiesta in corso accorciate senza un riassunto
       sono dati che il modello non vede più, e non li rilegge. Hermes dopo la potatura riassume sempre (`context_compressor.py:5487`); noi non aspettiamo il riassunto, quindi
       finché la richiesta entra quelle uscite restano intere, e nel frattempo il riassunto in sottofondo lavora. `proteggiRichiesta` lo decide chi conosce la misura. */
    const inizioRichiesta = clear?.proteggiRichiesta ? inizioDellaRichiesta(verbatimTail) : -1;
    const accorciabili = inizioRichiesta >= 0 ? codaVista.slice(0, inizioRichiesta) : codaVista;
    const richiestaInCorso = inizioRichiesta >= 0 ? codaVista.slice(inizioRichiesta) : [];
    /* D3 (revisione di fine fase, 01/11/2026): se il ragionamento vecchio si toglie o si accorcia lo dice la porta del modello, che conosce il fornitore */
    const lighter = clear ? clearOldToolOutputs(accorciabili, { pointer: clearedToolPointer, accorciaRagionamento: model.accorciaIlRagionamento?.(targetModel) === true }) : null;
    if (clear) clear.cleared = lighter.cleared;
    // C1 (09/10, «Tutti e due»): `clear.pressure` = anche le uscite grandi recenti, inizio e fine più un rimando (l'ultima intera)
    const pressed = clear?.pressure ? shortenRecentLargeOutputs(lighter.messages, { pointer: clearedToolPointer, removeChars: clear.removeChars, spareLimitChars: clear.spareLimitChars }) : null;
    if (pressed) clear.shortened = pressed.shortened;
    const tailMessages = pressed ? [...pressed.messages, ...richiestaInCorso] : lighter ? [...lighter.messages, ...richiestaInCorso] : codaVista;
    /* Riga dei risultati accorciati (owner 01/11/2026, FE-049; Performance): quante uscite DELLA RICHIESTA IN CORSO il modello non vede intere, contando gli oggetti cambiati e non
       i caratteri, comprese quelle finite in un riassunto. Le uscite delle richieste vecchie non contano: la risposta di adesso non poggia su di loro. */
    if (clear || conta) {
      const inizioInCoda = inizioDellaRichiesta(verbatimTail);
      const cambiate = verbatimTail.slice(inizioInCoda).filter((m, i) => m.role === 'tool' && tailMessages[inizioInCoda + i] !== m).length;
      const inizioNelRegistro = inizioDellaRichiesta(records.map(r => r.message));
      /* Blocco 20, revisione (R4): `conta` è la strada piena, dove nessuna regola accorcia ma le uscite della richiesta finite in un riassunto restano fuori */
      (clear ?? conta).accorciateRichiesta = cambiate + records.slice(inizioNelRegistro).filter(r => r.sequence <= coveredThrough && r.message.role === 'tool').length;
    }
    /* G02 (01/10): a summary that ends INSIDE a turn (compaction-planner.mjs, a long first turn) covers that turn's person's
       message too; it is shown verbatim before the summary, like Hermes protect_first_n, so the task is never paraphrased. */
    const pinnedMessages = summary && tailMessages.length && tailMessages[0].role !== 'user'
      ? records.filter(r => r.sequence <= coveredThrough && r.message.role === 'user').slice(-1).map(r => r.message)
      : [];
    /* C1 (10/10): le parti del registro e dell'indice, calcolate UNA volta: vanno nel testo e, se chi chiama dà la scatola
       `retained`, nei campi della versione (`personRequestsKept` è la stessa lista che `personRequestRegister` scrive). */
    const memoryParts = summary ? { recoveryHint, anchors: anchorsFor(snapshot, records, coveredThrough), personRequests: records.filter(r => r.sequence <= coveredThrough && r.message.role === 'user' && !pinnedMessages.includes(r.message) && personRequest(r.message)).map(r => plainText(r.message.content)), personRequestsBudget: personRequestBudget(targetModel?.windowTokens) } : null;
    if (retained && memoryParts) {
      retained.personRequests = personRequestsKept(memoryParts.personRequests, { budget: memoryParts.personRequestsBudget });
      retained.anchorIndex = typeof memoryParts.anchors === 'string' && memoryParts.anchors.trim() ? memoryParts.anchors : null;
    }
    const messages = !summary && !snapshot.facts.some(f => f.status !== 'removed') && !evidence.length
      ? structuredClone([...systemMessages, ...tailMessages])
      : composeActiveContext({ systemMessages, pinnedMessages, summary: summary ?? null, facts: snapshot.facts, tailMessages, evidence, ...(summary ? memoryParts : {}) });
    if (!model.prepareContext || !targetModel) return messages;
    const prepared = model.prepareContext({ messages, model: targetModel, reset: Boolean(summary) });
    if (!Array.isArray(prepared?.messages)) fail('CTX_PROVIDER_CONTEXT_INVALID', 'Il modello non ha preparato un contesto valido.');
    return prepared.messages;
  }
  async function save(job, patch) {
    const next = ContextJobV1.parse({ ...job, ...patch, updatedAt: clock() });
    return store.saveJobProgress({ sessionId: job.sessionId, job: next });
  }
  async function assertCurrent(job, signal) {
    signal?.throwIfAborted();
    const snapshot = await state(job.sessionId);
    if (snapshot.stateRevision !== job.baseStateRevision) fail('CTX_STALE_REVISION', 'Il contesto è cambiato durante la preparazione.');
    const current = await store.readContextJob({ sessionId: job.sessionId, jobId: job.id });
    if (current?.state === 'cancelled') fail('CTX_JOB_CANCELLED', 'Compattazione annullata.');
    return snapshot;
  }
  async function account(job, operationId, usage) {
    if (usage === undefined) return;
    await store.recordUsage({ sessionId: job.sessionId, jobId: job.id, operationId, usage });
    // The common session service deduplicates this same operation identity.
    await usagePolicy?.record?.({ sessionId: job.sessionId, jobId: job.id, operationId, usage });
  }
  /* 25/09 — l'AVVISO della pausa dopo un rifiuto: uno per lavoro fallito (id deterministico, lo store ignora il doppione),
     così un giro di K passi lo mostra una volta sola. Contenuto fisso per lavoro: la consegna al desktop rifiuta un id già
     visto con un contenuto diverso (`session-registry.mjs::pubblicaEventoContesto`). */
  async function avvisaPausa(sessionId, jobs) {
    const pausa = raffreddamentoCompattazione(jobs ?? (await state(sessionId)).jobs, clock());
    if (!pausa) return null;
    const { jobId, code, attempts, waitSeconds, failedAt, retryAfter } = pausa;
    await store.recordContextNotice({ sessionId, event: ContextEventV1.parse({ schema: 'talos.context.event.v1', id: `cooling-${jobId}`, sessionId, jobId, kind: 'context.compaction.cooling', state: 'failed', createdAt: failedAt, payload: { code, attempts, waitSeconds, retryAfter } }) });
    return pausa;
  }
  async function execute(initial, { sessionModel, tools = [], signal, projection }) {
    let job = initial;
    /* FE-053: chi ha scritto il riassunto quando non è lo scelto. Si pubblica col salvataggio. RIP-4 (ripassata del Blocco 21, 01/11/2026): la firma è dell'autore del testo
       salvato, cioè dell'ultimo pezzo valido, e `null` se è lo scelto: da due pezzi in su l'ultima chiamata è la fusione finale, e i pezzi prima li riassume lei. Come Hermes,
       che tiene il modello della chiamata più recente (`_last_aux_resolved_model`, `agent/context_compressor.py:3837`, clone del 22/10). Un lavoro ripreso a un pezzo solo non
       chiama nessuno: quel pezzo viene da `completedSegments`, che non porta la firma. */
    let provenienza = null;
    try {
      const snapshot = await assertCurrent(job, signal);
      /* C6 (28/10/2026; trovato dalla CLI): un lavoro finisce col modello con cui è PARTITO (`pinned`). Prima si rileggeva la scelta di
         adesso, e se la persona l'aveva cambiata dalle Impostazioni il lavoro moriva «Il modello di sintesi è cambiato» — un fallimento per
         un cambio voluto. La scelta nuova vale dal lavoro dopo. Il controllo resta: chi risolve non può sostituire il modello del lavoro. */
      const profile = await model.resolveModel({ sessionModel, settings: snapshot.settings, pinned: job.model });
      if (!sameModel(profile, job.model)) fail('CTX_MODEL_MISMATCH', 'Il modello di sintesi è cambiato.');
      // 24/09 — il riassuntore legge la proiezione (testo corretto), quando la richiesta ne ha portata una.
      const records = overlay(await originals(job.sessionId, job.coveredThrough), projection);
      job = await save(job, { state: 'preparing' });
      // Plan only the immutable covered prefix; the final request reattaches the latest suffix.
      const planning = planCompaction(records, { ...profile, settings: snapshot.settings, retainRecentTurns: 0 });
      const segments = planning.segments;
      if (!segments.length) fail('CTX_NOTHING_TO_COMPACT', 'Non ci sono scambi completi da compattare.');
      job = await save(job, { state: 'summarizing', progress: { completed: job.completedSegments.length, total: Math.max(segments.length, job.completedSegments.length), phase: 'summarizing' } });
      /*
       * 09/09 — `build(compact)` al posto della richiesta già costruita: una sintesi TRONCATA (`length`) si
       * ritenta UNA volta con l'istruzione compatta, mai di più. Trovato dal giro vero: senza limite
       * dichiarato il modello scriveva 2.048 token e la compattazione — e il giro — morivano lì.
       */
      const invoke = async (build, sourceRecords, label) => {
        const once = async (compact) => {
          const request = build(compact);
          await assertCurrent(job, signal);
          const measured = await measure(request.messages, [], profile, signal);
          if (!budgetFor(measured, snapshot.settings).fits) fail('CTX_SEGMENT_TOO_LARGE', 'Il segmento supera lo spazio del modello di sintesi.');
          const operationId = `${job.id}:${idFactory()}`;
          if (usagePolicy?.authorize && await usagePolicy.authorize({ sessionId: job.sessionId, model: profile, operationId, maxOutputTokens: profile.responseReserve, signal }) !== true) fail('CTX_USAGE_DENIED', 'Il servizio della sessione non autorizza questa sintesi.');
          let response;
          /* C6-bis (OK di CLI e Mobile 30/10/2026): la conversazione, SOLO per instradare la memoria dei modelli dei riassunti e l'avviso
             alla chat giusta — mai nel testo per il modello né in una riga per la persona */
          try { response = await model.summarize({ model: profile, messages: request.messages, maxOutputTokens: profile.responseReserve, signal, operationId, sessionId: job.sessionId, jobId: job.id, attese: letturaAttese(job.sessionId, job.id) }); }
          catch (error) { await account(job, operationId, error.usage); throw error; }
          await account(job, operationId, response.usage);
          signal?.throwIfAborted();
          const valido = validateSummary(response, { records: sourceRecords });
          provenienza = response?.provenienza ?? null; // solo un pezzo valido firma: un salvataggio passa sempre da un'ultima chiamata valida, e un tentativo scartato non la cambia
          return valido;
        };
        try { return await once(false); }
        catch (error) {
          if (error?.code === 'CTX_TRUNCATED_SUMMARY') return once(true);
          // C1 (09/10/2026): il formato sbagliato si riprova UNA volta, con l'istruzione sul formato (mai la stessa richiesta)
          if (error?.code === 'CTX_INVALID_SUMMARY') return once('format');
          /* B2 (05/11/2026, OK di CLI, Performance e Mobile; B2-bis no): solo nella FUSIONE, una citazione che non sta negli originali si
             riprova UNA volta, con la frase che dice cosa era sbagliato. Un segmento vede gli originali: lì non si ritenta. */
          if (error?.code === 'CTX_INVALID_SOURCE' && label.startsWith('merge-')) return once('sources');
          throw error;
        }
      };
      const summaries = [];
      for (let index = 0; index < segments.length; index++) {
        const segment = segments[index];
        const fingerprint = await hash({ segment, profile, focus: snapshot.settings.focus });
        const prior = job.completedSegments.find(entry => entry.fingerprint === fingerprint);
        if (prior) { summaries.push(validateSummary({ text: JSON.stringify(prior.summary), finishReason: 'stop' }, { records })); continue; }
        const build = mode => buildSummaryRequest({ segment, focus: snapshot.settings.focus, maxOutputTokens: profile.responseReserve, compact: mode === true, formatRetry: mode === 'format' });
        const request = build(false);
        const measured = await measure(request.messages, [], profile, signal);
        if (!budgetFor(measured, snapshot.settings).fits) {
          if (segment.text.length < 512) fail('CTX_CONTEXT_TOO_SMALL', 'Istruzioni e segmento minimo non entrano nella finestra.');
          let midpoint = Math.floor(segment.text.length / 2);
          if (/[\uD800-\uDBFF]/u.test(segment.text[midpoint - 1])) midpoint--;
          segments.splice(index, 1, { ...segment, id: `${segment.id}.a`, text: segment.text.slice(0, midpoint) }, { ...segment, id: `${segment.id}.b`, text: segment.text.slice(midpoint) });
          index--; continue;
        }
        const summary = await invoke(build, records.filter(record => segment.sourceIds.includes(record.id)), segment.id);
        summaries.push(summary);
        job = await save(job, { completedSegments: [...job.completedSegments, { fingerprint, segmentId: segment.id, summary }], progress: { completed: job.completedSegments.length + 1, total: Math.max(segments.length, job.completedSegments.length + 1), phase: 'summarizing' } });
      }
      // Hierarchical reduction is measured at every level; no oversized merge is sent.
      let level = summaries;
      for (let depth = 0; level.length > 1; depth++) {
        if (depth >= 12) fail('CTX_NO_REDUCTION', 'La sintesi non riduce il contesto dopo i passaggi consentiti.');
        const next = [];
        for (let index = 0; index < level.length; index += 2) {
          if (index + 1 === level.length) { next.push(level[index]); continue; }
          const pair = level.slice(index, index + 2);
          const merged = await invoke(mode => buildSummaryRequest({ summaries: pair, focus: snapshot.settings.focus, maxOutputTokens: profile.responseReserve, compact: mode === true, formatRetry: mode === 'format', sourcesRetry: mode === 'sources' }), records, `merge-${depth}-${index}`);
          if (JSON.stringify(merged).length >= JSON.stringify(pair).length) fail('CTX_NO_REDUCTION', 'La fusione non libera spazio.');
          next.push(merged);
        }
        level = next;
      }
      job = await save(job, { state: 'validating', progress: { ...job.progress, phase: 'validating' } });
      const latest = await assertCurrent(job, signal);
      const grezzi = await originals(job.sessionId);
      const all = overlay(grezzi, projection);
      if (selectClosedPrefix(all, { retainRecentTurns: 0 }).pendingCalls.length) fail('CTX_PENDING_TOOLS', 'Attendere i risultati degli strumenti prima della pubblicazione.');
      // 24/09 — la versione è un fatto d'ARCHIVIO: prefisso, `sourceHash` e citazioni sugli originali grezzi.
      const prefix = grezzi.filter(record => record.sequence <= job.coveredThrough);
      const summary = projection === undefined ? level[0] : ricitaSugliOriginali(level[0], prefix);
      let tailClearedThrough = 0;
      let active = compiled(latest, all, { summary, coveredThrough: job.coveredThrough, tailClearedThrough, targetModel: sessionModel });
      const before = await measure(compiled(latest, all, { targetModel: sessionModel }), tools, sessionModel, signal);
      let measurement = await measure(active, tools, sessionModel, signal);
      /* La coda dopo il riassunto (owner 05/11/2026, registro 224; fonti in `tool-output-clearing.mjs`, `tailClearingBoundary`): se riassunto
         più coda supera l'obiettivo, le uscite vecchie della coda diventano segnaposto, dalla più vecchia, finché ci sta. Quanto togliere si
         stima coi caratteri per token di questa misura; si rimisura, al più tre volte. Il punto si salva nella versione (`tailClearedThrough`).
         Ogni giro parte da quanto il confine ha GIÀ tolto davvero (le uscite si tolgono intere, quindi spesso più della stima) e aggiunge
         la stima nuova: sommando solo le stime, la seconda restava sotto il già tolto e il confine non si muoveva (mutanti 05/11, CODA-06). */
      const coda = all.filter(record => record.sequence > job.coveredThrough);
      /* ⛔ Forma della CLI (05/11/2026): mai dentro la richiesta in corso (senza un messaggio della persona nella coda, è tutta la coda) */
      const inizioRichiesta = inizioDellaRichiesta(coda.map(record => record.message));
      let giaTolti = 0;
      for (let giro = 0; giro < 3; giro++) {
        const soglie = budgetFor(measurement, latest.settings);
        if (measurement.inputTokens <= soglie.targetTokens) break;
        const stima = Math.ceil((measurement.inputTokens - soglie.targetTokens) * JSON.stringify(active).length / measurement.inputTokens);
        const confine = tailClearingBoundary(coda, { removeChars: giaTolti + stima, pointer: clearedToolPointer, protectFrom: inizioRichiesta });
        if (confine.through <= tailClearedThrough) break;
        giaTolti = confine.removedChars;
        tailClearedThrough = confine.through;
        active = compiled(latest, all, { summary, coveredThrough: job.coveredThrough, tailClearedThrough, targetModel: sessionModel });
        measurement = await measure(active, tools, sessionModel, signal);
      }
      /* C1 (owner 09/10/2026 sera, «Tutti e due»): un riassunto che RIDUCE si pubblica sempre, anche se non basta per un contesto
         cresciuto mentre lavorava (dal vivo: partito al giro 3 per il giro 1, buttato al giro 4) — chi chiede ne fa partire un
         secondo fino ad adesso (`prepareForRequest`). Si rifiuta solo un riassunto che non riduce niente. */
      if (measurement.inputTokens >= before.inputTokens) fail('CTX_NO_REDUCTION', 'La sintesi non libera spazio sufficiente. La versione precedente rimane valida.');
      job = await save(job, { state: 'ready', progress: { ...job.progress, phase: 'ready' } });
      await assertCurrent(job, signal);
      const retained = {};
      const activeMessages = compiled(latest, prefix, { summary, coveredThrough: job.coveredThrough, targetModel: sessionModel, retained });
      const version = ContextVersionV1.parse({ schema: 'talos.context.version.v1', id: idFactory(), sessionId: job.sessionId, coveredThrough: job.coveredThrough, sourceIds: prefix.map(r => r.id), sourceHash: await hash(prefix.map(({ id, sha256 }) => ({ id, sha256 }))), summary, activeMessages, model: job.model, measurement, createdAt: clock(), ...(retained.personRequests ? { retained: { personRequests: retained.personRequests, anchorIndex: retained.anchorIndex ?? null } } : {}), ...(tailClearedThrough ? { tailClearedThrough } : {}) });
      signal?.throwIfAborted();
      await store.commitContextVersion({ sessionId: job.sessionId, expectedRevision: latest.revision, expectedStateRevision: latest.stateRevision, jobId: job.id, version, ...(provenienza ? { provenienza } : {}) });
      return store.readContextJob({ sessionId: job.sessionId, jobId: job.id });
    } catch (error) {
      const current = await store.readContextJob({ sessionId: job.sessionId, jobId: job.id });
      if (current && terminal.has(current.state)) return current;
      const cancelled = signal?.aborted || error.code === 'CTX_JOB_CANCELLED';
      const paused = ['CTX_PENDING_TOOLS', 'CTX_USAGE_DENIED', 'CTX_RESOURCE_BUSY'].includes(error.code);
      const finale = await save(current ?? job, { state: cancelled ? 'cancelled' : paused ? 'paused' : 'failed', error: { code: cancelled ? 'CTX_JOB_CANCELLED' : error.code?.startsWith('CTX_') ? error.code : 'CTX_COMPACTION_FAILED', message: cancelled ? 'Compattazione annullata.' : error.code?.startsWith('CTX_') ? error.message : 'Preparazione del contesto non riuscita.' } });
      // 25/09 — l'avviso della pausa nasce QUI, quando il lavoro fallisce: anche l'ultimo passo di un giro lo lascia, e
      // una richiesta che arriva a pausa già scaduta non lo perde. Nessun catch: un archivio che non scrive è un guasto vero.
      if (finale.state === 'failed') await avvisaPausa(job.sessionId);
      return finale;
    }
  }
  function launch(job, options) {
    const jobKey = key(job.sessionId, job.id);
    if (running.has(jobKey) || terminal.has(job.state)) return;
    const controller = new AbortController();
    const abort = () => controller.abort(options.signal.reason);
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) abort();
    const entry = { controller, promise: null, error: null };
    // Keep a handled result even when the persistence worker dies during failure reporting.
    entry.promise = Promise.resolve().then(() => execute(job, { ...options, signal: controller.signal })).catch(error => { entry.error = error; return null; }).finally(() => {
      options.signal?.removeEventListener('abort', abort);
      entry.finito = true; // spesa di servizio, parte 2 B: nessuna chiamata guarda più le attese di questo lavoro
      if ((attese.get(jobKey)?.inCorso ?? 0) === 0) attese.delete(jobKey);
    });
    running.set(jobKey, entry);
  }
  /*
   * 24/09/2026 — F4, CTX-RESTART-ACTIVE-JOB-RECOVERY (nominato nel dossier Codex del 23/09, mai esistito).
   * Un job `queued/preparing/summarizing/validating/ready` che NON sta in `running` non ha un processo dietro:
   * la mappa `running` muore col processo, la riga SQLite no. Prima di oggi restava «in corso» per sempre —
   * `waitForCompaction` lo ritornava com'era, `prepareForRequest` moriva `CTX_COMPACTION_REQUIRED` a ogni
   * richiesta e il worker rifiutava ogni job nuovo (`sqlite-worker.mjs:146`, `CTX_JOB_ACTIVE`). Qui diventa
   * `paused` con motivo `CTX_JOB_INTERRUPTED`: la stessa semantica della pausa già esistente (si riprende in
   * automatico con i segmenti già pagati, e un job nuovo può partire). Nessuna versione è mai stata scritta
   * da un job non `committed` (`commitContextVersion` è una transazione sola). Come Hermes, che recupera la
   * lease di un pid morto (`hermes_state_compression.py:455-472`, «Reclaimed stale compression lock») e
   * BullMQ («stalled jobs»): un job senza processo si dichiara, non si aspetta.
   * ⛔ In questo processo un job attivo è SEMPRE in `running`: `startCompaction` e `resumeCompaction` lanciano
   * nella stessa continuazione della `claimContextJob`, senza un `await` in mezzo.
   */
  async function recoverInterrupted(sessionId, snapshot) {
    const orfani = snapshot.jobs.filter(job => activeStates.has(job.state) && !running.has(key(sessionId, job.id)));
    if (!orfani.length) return snapshot;
    for (const job of orfani) {
      await store.saveJobProgress({ sessionId, job: ContextJobV1.parse({ ...job, state: 'paused', updatedAt: clock(), error: { code: 'CTX_JOB_INTERRUPTED', message: 'Compattazione interrotta: il processo che la eseguiva non c’è più (riavvio del server). Nessuna versione è stata pubblicata; la compattazione può ripartire.' } }) });
    }
    return state(sessionId);
  }
  const api = {
    async recoverInterruptedJobs({ sessionId }) { return recoverInterrupted(sessionId, await state(sessionId)); },
    async appendOriginal({ sessionId, record }) {
      const parsed = parseContextRecord(record);
      await store.initSession({ sessionId, settings: parseContextSettings({}) });
      for (const id of parsed.assetRefs) if (!await store.readBlob({ sessionId, id })) fail('CTX_ASSET_MISSING', 'Conservare l’allegato prima di archiviare il messaggio.');
      return store.appendOriginalBatch({ sessionId, records: [parsed] });
    },
    async startCompaction({ sessionId, idempotencyKey, sessionModel, kind = 'compact', tools = [], signal, projection, withinTurn = false, retainRecentTurns }) {
      signal?.throwIfAborted();
      const snapshot = await recoverInterrupted(sessionId, await state(sessionId));
      /* C6 (28/10/2026; trovato dalla CLI): una chiave AUTOMATICA porta anche il modello del riassunto. Dopo un riassunto fallito con A, la
         persona sceglie B proprio per quello: la stessa versione della storia deve poter ripartire con B, non ritrovare il lavoro di A
         (CTX_IDEMPOTENCY_CONFLICT). Una chiave scelta da chi chiama (/compact) resta com'è, e severa come prima. */
      /* Il modello si risolve SOLO se un lavoro di questa richiesta c'è già: senza, prima si guarda se c'è qualcosa da compattare
         (CTX-SMALL-AUTO-NOOP: una richiesta che entra non interroga chi risolve). Un lavoro ATTIVO con una chiave di prima di oggi non passa
         di qui: `prepareForRequest` lo ritrova dallo stato prima di chiederne uno nuovo. */
      const automatica = idempotencyKey.startsWith('auto-');
      const resto = idempotencyKey.slice('auto-'.length);
      const chiaveCol = async (profilo) => `auto-m${(await hash(identity(profilo))).slice(0, 16)}-${resto}`;
      const stessaRichiesta = (job) => job.idempotencyKey.length === 23 + resto.length
        && /^auto-m[0-9a-f]{16}-$/u.test(job.idempotencyKey.slice(0, 23)) && job.idempotencyKey.slice(23) === resto;
      let profiloAuto = null;
      let existing;
      if (!automatica) existing = snapshot.jobs.find(job => job.idempotencyKey === idempotencyKey);
      else if (snapshot.jobs.some(stessaRichiesta)) {
        profiloAuto = await model.resolveModel({ sessionModel, settings: snapshot.settings });
        const chiave = await chiaveCol(profiloAuto);
        existing = snapshot.jobs.find(job => job.idempotencyKey === chiave);
      }
      if (existing) {
        const profile = profiloAuto ?? await model.resolveModel({ sessionModel, settings: snapshot.settings });
        if (!sameModel(existing.model, profile) || existing.kind !== kind) fail('CTX_IDEMPOTENCY_CONFLICT', 'Questa chiave identifica una richiesta diversa.');
        return existing;
      }
      const records = await originals(sessionId);
      // C1 (09/10): il secondo riassunto «fino ad adesso» tiene intero solo il giro corrente (`retainRecentTurns: 1`, vedi prepareForRequest)
      const selection = selectClosedPrefix(records, { retainRecentTurns: Number.isSafeInteger(retainRecentTurns) ? Math.min(retainRecentTurns, snapshot.settings.retainRecentTurns) : snapshot.settings.retainRecentTurns, force: true, withinTurn });
      if (selection.pendingCalls.length) fail('CTX_PENDING_TOOLS', 'Attendere i risultati degli strumenti.');
      if (!selection.prefix.length) fail('CTX_NOTHING_TO_COMPACT', 'Non ci sono scambi precedenti da compattare mantenendo intero l’ultimo scambio. Nessun messaggio è stato modificato.');
      /* solo «Compatta» (Mobile, revisione del diff 31/10): «Rigenera» riscrive una conversazione GIÀ compattata, che per definizione non
         guadagna il 30% — fermarla qui le toglierebbe il testo nuovo che la persona ha chiesto */
      if (!automatica && kind === 'compact' && guadagnoMinimoChiesto > 0 && !guadagnaAbbastanza(snapshot, overlay(records, projection), selection.coveredThrough, sessionModel, tools)) {
        fail('CTX_NOTHING_TO_COMPACT', 'Niente da compattare: la conversazione è già corta. Nessun messaggio è stato modificato.');
      }
      /* B4: prima di pagare, un lavoro automatico che non può liberare niente non nasce — nessuna chiamata, nessun lavoro fallito, nessuna
         pausa. Il codice è quello che chi chiama già ingoia (`prepareForRequest`, `giroInSottofondo`): nessuna riga nuova per la CLI. */
      if (automatica && !guadagnaQualcosa(snapshot, overlay(records, projection), selection.coveredThrough, sessionModel)) {
        fail('CTX_NOTHING_TO_COMPACT', 'Niente da compattare: un riassunto di questa parte non libererebbe spazio. Nessun messaggio è stato modificato.');
      }
      const profile = profiloAuto ?? await model.resolveModel({ sessionModel, settings: snapshot.settings });
      if (automatica) idempotencyKey = await chiaveCol(profile);
      const fingerprint = await hash({ sessionId, revision: snapshot.revision, settings: snapshot.settings, profile, kind, tools });
      const job = ContextJobV1.parse({ schema: 'talos.context.job.v1', id: idFactory(), sessionId, idempotencyKey, requestFingerprint: fingerprint, kind, state: 'queued', baseRevision: snapshot.revision, baseStateRevision: snapshot.stateRevision, coveredThrough: selection.coveredThrough, model: identity(profile), createdAt: clock(), updatedAt: clock(), completedSegments: [], progress: { completed: 0, total: 0, phase: 'queued' } });
      const claimed = await store.claimContextJob({ sessionId, job });
      launch(claimed, { sessionModel, tools, signal, projection });
      return claimed;
    },
    /* `contaComeAttesa`: chi aspetta è la persona (il /compact; la CLI anche all'uscita, `talos-composition.ts:491`). Di serie no: lo
       spegnimento del server desktop non ha nessuno davanti. */
    /* `signal` (Performance, revisione del pezzo B, 30/10): chi aspetta può SMETTERE di aspettare (lo Skip, lo Stop) senza annullare il
       lavoro — un lavoro nato in sottofondo da una richiesta di prima non è suo da annullare. Senza, l'attesa restava aperta fino alla fine
       del lavoro: le sue chiamate risultavano «in primo piano» con nessuno davanti, e l'ora di fine dell'attesa era quella del lavoro. */
    async waitForCompaction({ sessionId, jobId, contaComeAttesa = false, signal = null }) {
      const entry = running.get(key(sessionId, jobId));
      signal?.throwIfAborted?.();
      const fine = contaComeAttesa === true && entry ? iniziaAttesa(sessionId, jobId) : null;
      let smetti = null;
      try {
        if (entry) {
          /* Performance (30/10, misurato): se il lavoro è DELLA richiesta, lo stesso segnale lo sta annullando (il suo ascoltatore è
             registrato al lancio, prima di questo) ⇒ niente rifiuto: si aspetta che si chiuda, esito «cancelled» e la strada di prima.
             Si smette di aspettare solo un lavoro che NON è della richiesta (nato in sottofondo prima) ⇒ «abandoned». */
          const lascia = signal ? new Promise((_, no) => { smetti = () => { if (entry.controller.signal.aborted) return; no(signal.reason ?? new ContextEngineError('Attesa interrotta.', 'CTX_WAIT_ABORTED')); }; signal.addEventListener('abort', smetti, { once: true }); }) : null;
          await (lascia ? Promise.race([entry.promise, lascia]) : entry.promise);
          if (entry.error) throw entry.error;
        }
      } finally { if (smetti) signal.removeEventListener('abort', smetti); fine?.(); }
      const job = await store.readContextJob({ sessionId, jobId });
      if (!job) fail('CTX_JOB_NOT_FOUND', 'Compattazione non trovata.');
      return job;
    },
    async cancelCompaction({ sessionId, jobId }) {
      const job = await store.readContextJob({ sessionId, jobId });
      if (!job) fail('CTX_JOB_NOT_FOUND', 'Compattazione non trovata.');
      if (terminal.has(job.state)) return job;
      try { return await save(job, { state: 'cancelled' }); }
      finally { running.get(key(sessionId, jobId))?.controller.abort(new ContextEngineError('Compattazione annullata.', 'CTX_JOB_CANCELLED')); }
    },
    async resumeCompaction({ sessionId, jobId, sessionModel, tools = [], signal, projection }) {
      let job = await store.readContextJob({ sessionId, jobId });
      if (!job) fail('CTX_JOB_NOT_FOUND', 'Compattazione non trovata.');
      if (terminal.has(job.state)) return job;
      const entry = running.get(key(sessionId, jobId));
      if (entry) { await entry.promise; running.delete(key(sessionId, jobId)); }
      job = await store.readContextJob({ sessionId, jobId });
      if (terminal.has(job.state)) return job;
      await assertCurrent(job, signal);
      if (job.state !== 'paused') job = await save(job, { state: 'paused' });
      const { error: previousError, ...resumable } = job;
      job = await store.claimContextJob({ sessionId, job: { ...resumable, state: 'queued', updatedAt: clock() } });
      launch(job, { sessionModel, tools, signal, projection });
      return job;
    },
    /** `projection`: la storia corretta, allineata 1:1 ai record (vedi `checkProjection`); `messages` resta il controllo d'archivio di prima. */
    async prepareForRequest({ sessionId, messages, projection, tools = [], sessionModel, signal, waitForInFlight = false, summaryCeilingMs, onInTurnWait, growWindow }) {
      /* A1: il riassunto atteso nel giro gara col suo tetto; allo scadere si annulla e il giro riceve CTX_COMPACTION_TIMEOUT */
      const tettoNelGiro = Number.isSafeInteger(summaryCeilingMs) && summaryCeilingMs > 0 ? summaryCeilingMs : inTurnSummaryCeilingMs;
      /*
       * C4 del contratto «la chat non aspetta mai il riassunto» (owner 27/10/2026 notte, «Sì, mai aspettare»; con la CLI:
       * `CONTRATTO-RIASSUNTO-MAI-ASPETTARE-2026-10-27.md`). `summaryCeilingMs: 0` = non aspettare: quando la richiesta non entra e il
       * riassunto non è pronto il motore risponde subito `CTX_SUMMARY_NOT_READY` (chi lo ospita manda la richiesta con un riassunto
       * senza modello) e NON annulla il lavoro: finisce in sottofondo e la richiesta dopo lo usa. Nel file dell'owner il giro aspettava
       * un riassunto fermo 30 minuti sul limite del piano.
       * ⛔ Il motore a posto unico non aspetta e non lascia un lavoro in volo: il lavoro occuperebbe il motore mentre la richiesta del giro
       *   è in volo (409 LOCAL_ENGINE_BUSY, misurato sul Pad il 21/10). Owner 28/10/2026, «Rapido subito, il modello dopo»: lì il «non
       *   pronto» non avvia nessun lavoro (`aFineGiro`, più sotto) e il riassunto lo avvia chi ospita a giro finito.
       */
      const nonAspettare = summaryCeilingMs === 0 && sessionModel?.singleSlot !== true;
      /* B1 (21/10/2026, revisione del Mobile): chi ospita il motore sa QUANDO il giro aspetta un riassunto — `waiting` all'inizio
         dell'attesa, `done` alla fine comunque sia andata (pubblicato, fallito, scaduto, annullato). Senza, la riga viva con «Skip»
         non compariva mai sulla strada del motore, che per le conversazioni nuove è quella di serie. Un ascoltatore che lancia non
         tocca il giro. */
      const segnalaAttesa = (evento) => { if (typeof onInTurnWait === 'function') { try { onInTurnWait(evento); } catch { /* solo un avviso */ } } };
      const attendiNelGiro = async (jobId) => {
        segnalaAttesa({ state: 'waiting', jobId, ceilingMs: tettoNelGiro });
        let esitoAttesa = 'failed';
        /* Skip o Stop della richiesta: il giro smette di aspettare (il lavoro va avanti per conto suo) ⇒ «abandoned» */
        try {
          let scaduto = false; let timer = null;
          const scadenza = new Promise((risolvi) => { timer = setTimeout(() => { scaduto = true; risolvi(null); }, tettoNelGiro); });
          try {
            let esito;
            try { esito = await Promise.race([api.waitForCompaction({ sessionId, jobId, contaComeAttesa: true, signal }), scadenza]); }
            catch (errore) { if (signal?.aborted) esitoAttesa = 'abandoned'; throw errore; }
            if (!scaduto) { esitoAttesa = typeof esito?.state === 'string' ? esito.state : 'failed'; return esito; }
          } finally { clearTimeout(timer); }
          esitoAttesa = 'timeout';
          try { await api.cancelCompaction({ sessionId, jobId }); } catch { /* già concluso o sparito: il tetto vale lo stesso */ }
          fail('CTX_COMPACTION_TIMEOUT', `The summary took longer than ${Math.round(tettoNelGiro / 1000)} s: the turn continues without waiting for it.`);
        } finally { segnalaAttesa({ state: 'done', jobId, outcome: esitoAttesa }); }
      };
      let snapshot = await recoverInterrupted(sessionId, await state(sessionId));
      const records = await originals(sessionId);
      if (messages && JSON.stringify(messages) !== JSON.stringify(records.map(r => r.message))) fail('CTX_UNARCHIVED_CONTEXT', 'Archiviare i nuovi messaggi prima di preparare la richiesta.');
      checkProjection(records, projection);
      /* C1, livello 1 (owner 09/10/2026 sera, «prima le regole, poi il riassunto»): over the trigger, the old tool outputs
         become signature + pointer (`tool-output-clearing.mjs`) and are measured again; the summary (level 2) starts only
         if that is not enough. No model call; the cut moves by whole blocks, so the prompt cache breaks only there. */
      let toolOutputsCleared = 0;
      let level1 = null; // C1 (10/10): quante uscite le regole hanno tolto e quante accorciate in QUESTA richiesta (la scheda Contesto)
      /* Y1 (review del bugfixer, 09/10): l'àncora del contatore si registra coi messaggi SPEDITI, cioè i leggeri — contare la
         storia piena a ogni richiesta voleva dire un conteggio vero (HTTP per anthropic/openai/gemini) su una storia che cresce
         senza limite, e un suo errore faceva cadere una richiesta che leggera entrava. Quindi: una stima locale decide se
         serve alleggerire (byte/3,5, la stessa euristica del contatore, col margine largo dell'euristica); sopra la soglia la
         piena si STIMA dalla misura leggera più i byte tolti, mai si conta; sotto, si misura la piena come sempre. */
      /* Performance, 31/10/2026 (forma coi tre, `PROPOSTA-STIMA-SENZA-CIFRATO`): il blocco firmato del fornitore è ragionamento cifrato più il doppione di testo e chiamate, e non si
         toglie mai. Contato come testo la stima cresceva da sola: su Luna la pulitura scattava a 60 mila token veri su 272 mila. Si conta al suo peso misurato. */
      const bytes = messages => {
        let firmati = 0;
        const chiari = messages.map(({ talos_provider_state: blocco, ...resto }) => { if (blocco) firmati += JSON.stringify(blocco).length; return resto; });
        return new TextEncoder().encode(JSON.stringify(chiari)).length + Math.ceil(firmati * pesoDelBloccoFirmato);
      };
      /*
       * ⛔ Owner 16/10/2026 sera («In sottofondo, con una guardia»), misurato dal vivo prima (tetto 60.000, glm-5.3-flash): in un
       *   giro lungo — un messaggio della persona e molti attrezzi — alla soglia morbida il riassunto in sottofondo trovava «niente di
       *   chiuso» (si tengono interi gli ultimi due giri, e il giro è uno) e il rifiuto si inghiottiva: il motore riassumeva solo
       *   quando la richiesta non entrava più, e il giro aspettava ~17 s (tre chiamate al modello). La regola G02 del 01/10 (CLI)
       *   vietava di riassumere il giro in corso alla soglia morbida perché un giro i cui attrezzi riempiono quasi tutta la soglia
       *   verrebbe riassunto a ogni passo. ⇒ Alla soglia, quando non c'è niente di chiuso, il giro in corso si riassume IN SOTTOFONDO
       *   (il giro non aspetta: lo scambio avviene alla richiesta dopo, quando il lavoro è pubblicato), ma solo se ciò che resta
       *   dopo il riassunto sta sotto l'OBIETTIVO. Sopra l'obiettivo il riassunto non darebbe spazio, e non parte (niente riassunto
       *   a ogni passo). Se non entra più, resta il percorso di sempre: il riassunto DENTRO il giro, atteso.
       * ⛔ Revisione ROSSA del bugfixer (16/10, SOTT-REV-01/02): la prima guardia sottraeva i byte del prefisso, che parte dal record
       *   0 — il prompt di sistema e il messaggio della persona, che il riassunto rimette per intero, e dopo il primo riassunto i
       *   record già coperti, che nella misura non c'erano più: la stima andava sotto zero e partiva un riassunto a ogni passo (5 su
       *   6). ⇒ Ciò che resta si stima sulla COMPOSIZIONE VERA dopo il riassunto (`compiled` con un riassunto segnaposto lungo metà
       *   della riserva di risposta: sistema, messaggio della persona ripetuto, memoria e coda), a byte/3,5, più ciò che la misura
       *   conta fuori dai messaggi (gli attrezzi): la misura di adesso meno i byte/3,5 dei messaggi che ha misurato davvero. La coda
       *   si stima intera, senza il livello 1: se sbaglia, sbaglia verso una guardia più severa.
       */
      const giroInSottofondo = async ({ records: tutti, measurement: misura, prepared: misurati, budget: soglie, snapshot: stato }) => {
        const scelta = selectClosedPrefix(tutti, { retainRecentTurns: stato.settings.retainRecentTurns, force: true, withinTurn: true });
        if (!scelta.prefix.length || scelta.pendingCalls.length) return undefined;
        /* Riverifica del bugfixer (16/10, SOTT-REV-03): un riassunto vero arriva fino alla riserva INTERA (`maxOutputTokens`), e con
           soglia e obiettivo vicini lo scarto dal segnaposto faceva ripartire un riassunto a ogni passo (11 in 11). Isteresi misurata:
           il segnaposto è lungo almeno quanto l'ULTIMO riassunto vero di questa sessione — dopo uno più lungo del previsto la stima
           si corregge da sola, e al più se ne spreca uno. */
        const ultimo = stato.activeVersion?.summary ? new TextEncoder().encode(JSON.stringify(stato.activeVersion.summary)).length : 0;
        const segnaposto = 'x'.repeat(Math.max(Math.ceil((sessionModel.responseReserve / 2) * 3.5), ultimo));
        const composizione = compiled(stato, overlay(tutti, projection), { summary: segnaposto, coveredThrough: scelta.coveredThrough, tailClearedThrough: 0, targetModel: sessionModel });
        const fuoriDaiMessaggi = Math.max(0, misura.inputTokens - Math.ceil(bytes(misurati) / 3.5));
        const dopo = fuoriDaiMessaggi + Math.ceil(bytes(composizione) / 3.5);
        if (dopo >= soglie.targetTokens) return undefined;
        try { return await api.startCompaction({ sessionId, idempotencyKey: `auto-${stato.revision}-${await hash(identity(sessionModel))}-turn-bg`, sessionModel, tools, signal, projection, withinTurn: true }); }
        catch (error) { if (error.code === 'CTX_NOTHING_TO_COMPACT' || error.code === 'CTX_PENDING_TOOLS') return undefined; throw error; }
      };
      let protetta = false;
      const proietta = async (current, list, { proteggi = true } = {}) => {
        protetta = false;
        const contaPiena = {};
        const full = compiled(current, list, { targetModel: sessionModel, conta: contaPiena });
        const measureFull = async () => ({ prepared: full, measurement: await measure(full, tools, sessionModel, signal), cleared: 0, ...(contaPiena.accorciateRichiesta > 0 ? { level1: { cleared: 0, shortened: 0, accorciateRichiesta: contaPiena.accorciateRichiesta } } : {}) });
        if (!current.settings.auto) return measureFull();
        const fullBytes = bytes(full); // una volta sola: su una storia da decine di MB pesa (nota del bugfixer, 09/10)
        /* 174 (04/11/2026, forma C, OK di Performance, CLI e Mobile): se il contatore ha un'àncora del fornitore che combacia con la
           richiesta piena, la stima rapida è l'àncora più la sola parte stimata, e il margine si misura su quella (`profiles.mjs`). Prima la
           stima tutta locale al 15% della finestra puliva le uscite a 145.999 mentre la misura del fornitore diceva 165.999, e la pulitura
           rompeva l'àncora: il tetto saltava. Senza àncora (o senza la porta: la CLI) come prima. Nessun conteggio in più. */
        let ancorata = null;
        try { ancorata = typeof tokenCounter.anchoredEstimate === 'function' ? tokenCounter.anchoredEstimate({ messages: full, tools, model: sessionModel }) : null; } catch { ancorata = null; }
        const stimaRapida = { windowTokens: sessionModel.windowTokens, responseReserve: sessionModel.responseReserve, method: 'heuristic', inputTokens: Math.ceil(fullBytes / 3.5),
          ...(ancorata && Number.isSafeInteger(ancorata.inputTokens) ? { inputTokens: ancorata.inputTokens, anchorTokens: ancorata.anchorTokens, estimatedDeltaTokens: ancorata.estimatedDeltaTokens } : {}) };
        const quick = budgetFor(stimaRapida, current.settings);
        if (!quick.shouldPrepare) return measureFull();
        /* sul posto unico il riassunto in sottofondo non parte finché la richiesta entra (qui sotto, 21/10): si resta come prima, finché non è misurato (Mobile, 31/10) */
        /* si decide sul conto vero, non sulla stima (banco del 31/10 sera: la stima, più pessimista, spegneva la protezione a richiesta che entrava): se poi non entra, `project` riproietta senza */
        const proteggiRichiesta = proteggi && sessionModel?.singleSlot !== true;
        protetta = proteggiRichiesta;
        const box = { cleared: 0, proteggiRichiesta };
        const light = compiled(current, list, { targetModel: sessionModel, clear: box });
        let lighter = box.cleared ? { prepared: light, measurement: await measure(light, tools, sessionModel, signal), cleared: box.cleared, level1: { cleared: box.cleared, shortened: 0, accorciateRichiesta: box.accorciateRichiesta } } : null;
        /* C1 (owner 09/10/2026 sera, «Tutti e due»): se le regole non bastano (o non toccano niente), SOTTO PRESSIONE si accorciano
           anche le uscite grandi della parte recente — inizio e fine più un rimando, l'ultima intera — prima del riassunto. */
        if (!lighter || budgetFor(lighter.measurement, current.settings).shouldPrepare) {
          /* Review Y2 (10/10): quanto togliere per tornare sotto la soglia (dalla misura leggera, o dalla stima della piena) e la
             quota dura del giro in sospeso, il 20% della finestra come Hermes — tutto in caratteri, con l'euristica byte/3,5. */
          const sopra = budgetFor(lighter ? lighter.measurement : stimaRapida, current.settings);
          const pressure = { cleared: 0, shortened: 0, pressure: true, proteggiRichiesta, removeChars: Math.ceil((sopra.inputTokens - sopra.triggerTokens + 1) * 3.5), spareLimitChars: Math.floor(sessionModel.windowTokens * PENDING_ROUND_WINDOW_SHARE * 3.5) };
          const pressed = compiled(current, list, { targetModel: sessionModel, clear: pressure });
          if (pressure.cleared + pressure.shortened > 0) {
            const pressedMeasurement = await measure(pressed, tools, sessionModel, signal);
            if (!lighter || pressedMeasurement.inputTokens < lighter.measurement.inputTokens) lighter = { prepared: pressed, measurement: pressedMeasurement, cleared: pressure.cleared + pressure.shortened, level1: { cleared: pressure.cleared, shortened: pressure.shortened, accorciateRichiesta: pressure.accorciateRichiesta } };
          }
        }
        if (!lighter) return measureFull();
        const lightMeasurement = lighter.measurement;
        const fullEstimate = lightMeasurement.inputTokens + Math.ceil(Math.max(0, fullBytes - bytes(lighter.prepared)) / 3.5);
        if (budgetFor({ ...lightMeasurement, inputTokens: fullEstimate }, current.settings).shouldPrepare) return lighter;
        // the estimate says the full history is under the trigger: measure it, and never lose the request on its count
        try {
          const exact = await measureFull();
          return budgetFor(exact.measurement, current.settings).shouldPrepare ? lighter : exact;
        } catch (error) { if (signal?.aborted) throw error; return lighter; }
      };
      /* la protezione si prova sempre: se il conto vero dice che così non entra, si proietta senza. Costa un conteggio in più, solo in quel caso */
      const project = async (current, list) => {
        const scelta = await proietta(current, list);
        if (!protetta || budgetFor(scelta.measurement, current.settings).fits) return scelta;
        const senza = await proietta(current, list, { proteggi: false });
        return senza.measurement.inputTokens < scelta.measurement.inputTokens ? senza : scelta;
      };
      let { prepared, measurement, cleared: firstCleared, level1: firstLevel1 } = await project(snapshot, overlay(records, projection));
      toolOutputsCleared = firstCleared;
      level1 = firstLevel1 ?? null;
      /* 09/09 — si salva SUBITO, prima di qualunque automazione: se la compattazione automatica fallisce
         (CTX_NO_REDUCTION su un solo messaggio enorme, per esempio) la misura che ha fatto scattare tutto
         è comunque un fatto vero, ed è quello che la modale deve poter mostrare. */
      /* 174 (CLI, 04/11/2026): la misura salvata porta il margine con cui il motore decide, così `snapshot.measurement.tokens.marginTokens`
         è lo stesso numero (la CLI lo prende da qui invece di ricalcolarlo). Un profilo che non si valida: la misura com'è, come prima. */
      const conMargine = m => { try { return { ...m, marginTokens: validateContextProfile(m).safetyMarginTokens }; } catch { return m; } };
      const record = m => store.recordMeasurement({ sessionId, revision: snapshot.revision, measuredAt: clock(), measurement: conMargine(m) });
      await record(measurement);
      let budget = budgetFor(measurement, snapshot.settings);
      /*
       * L1 1.3 (owner 26/10/2026 notte, «col motore del contesto acceso si allarga anche lì prima di riassumere, provato col motore vero»;
       * revisione del blocco 6, A-R1..A-R3): al CANCELLO della compressione chi ospita può allargare la finestra del motore locale PRIMA del
       * riassunto, come Hermes (`agent/turn_preflight.py:96-112`: sulla pressione della richiesta che partirebbe, «grow the context window
       * before compressing», poi ricalibra e non comprime). La pressione è la NOSTRA proiezione misurata — col riassunto già pubblicato e
       * le uscite già tolte — mai la storia grezza dell'ospite: la prima cura la misurava lì, e dopo un riassunto chiedeva di crescere (o la
       * carta) per una conversazione che qui ne pesava un ventesimo. Il cancello è quello del riassunto DENTRO il giro: la richiesta non
       * entra (su un motore a posto unico, il solo in cui il motore riassume).
       * `growWindow({ inputTokens, windowTokens, inputLimit })` risponde:
       *   · `{ grown: true, sessionModel }` ⇒ il profilo con la finestra nuova: si rimisura e si decide di nuovo;
       *   · `{ sendAsIs: true }` ⇒ «Chiedimi»: niente riassunto senza la persona. La richiesta parte com'è e il rifiuto del motore porta la
       *     carta coi numeri di QUESTA proiezione (la stessa regola della compattazione semplice);
       *   · altro ⇒ come prima (il riassunto).
       * Assente (la CLI, i modelli in cloud) ⇒ byte per byte com'era.
       */
      if (typeof growWindow === 'function' && snapshot.settings.auto && !budget.fits) {
        const crescita = await growWindow({ inputTokens: measurement.inputTokens, windowTokens: budget.windowTokens, inputLimit: budget.inputLimit });
        signal?.throwIfAborted();
        if (crescita?.sendAsIs === true) {
          return { messages: prepared, measurement, versionId: snapshot.activeVersion?.id ?? null, ...(toolOutputsCleared ? { toolOutputsCleared } : {}), ...(level1 ? { level1 } : {}), overWindow: true, waiting: false };
        }
        if (crescita?.grown === true && crescita.sessionModel) {
          sessionModel = crescita.sessionModel;
          ({ prepared, measurement, cleared: toolOutputsCleared, level1 = null } = await project(snapshot, overlay(records, projection)));
          await record(measurement);
          budget = budgetFor(measurement, snapshot.settings);
        }
      }
      let job; let compactionCooling = null; let senzaAttesa = false;
      /* 21/10/2026: su un motore a posto unico (`sessionModel.singleSlot`) il riassunto di sottofondo occuperebbe il motore mentre il giro
         ha una richiesta in volo (dal vivo sul Pad: 409 LOCAL_ENGINE_BUSY e giro in errore). Lì si compatta solo quando la richiesta non
         entra più, dentro il giro e aspettando (`withinTurn`), mai in parallelo. */
      if (snapshot.settings.auto && budget.shouldPrepare && !(sessionModel?.singleSlot === true && budget.fits)) {
        /* D4 (revisione di fine fase, 01/11/2026): un lavoro in pausa (un riavvio a metà riassunto) la cui base è stantia non può più pubblicare: riprenderlo dava
           `CTX_STALE_REVISION` a ogni richiesta e restava in pausa per sempre, e il motore non compattava più quella conversazione. Si annulla e ne parte uno nuovo. */
        const stantii = new Set(snapshot.jobs.filter(entry => entry.state === 'paused' && entry.baseStateRevision !== snapshot.stateRevision).map(entry => entry.id));
        for (const jobId of stantii) { try { await api.cancelCompaction({ sessionId, jobId }); } catch { /* già concluso o sparito: non si riprende, e la richiesta non cade per questo */ } }
        job = snapshot.jobs.find(entry => !terminal.has(entry.state) && !stantii.has(entry.id));
        const inVoloPrima = Boolean(job);
        // 25/09 — in pausa dopo un rifiuto: niente lavoro nuovo (l'avviso si riscrive con lo stesso id: copre i lavori
        // falliti prima di questa versione)
        if (!job) compactionCooling = await avvisaPausa(sessionId, snapshot.jobs);
        if (!job && !compactionCooling) {
          /* G02: inside the current turn only when the context does not fit (compaction-planner.mjs `withinTurn`) */
          const withinTurn = !budget.fits;
          /* Owner 28/10/2026, «Rapido subito, il modello dopo» (contratto P4 con la CLI): col «non aspettare» anche il posto unico risponde
             SUBITO «non pronto» — ma SENZA avviare un lavoro, che occuperebbe l'unico posto mentre la richiesta del giro (col riassunto
             rapido) è in volo. Il riassunto lo avvia chi ospita a giro finito (`aFineGiro`), e il jobId lo conosce lui. */
          if (withinTurn && summaryCeilingMs === 0 && sessionModel?.singleSlot === true) {
            throw new ContextEngineError('The summary is written after this turn: this request goes with a quick summary.', 'CTX_SUMMARY_NOT_READY', { jobId: null, aFineGiro: true });
          }
          try { job = await api.startCompaction({ sessionId, idempotencyKey: `auto-${snapshot.revision}-${await hash(identity(sessionModel))}${withinTurn ? '-turn' : ''}`, sessionModel, tools, signal, projection, withinTurn }); }
          catch (error) {
            if (error.code !== 'CTX_NOTHING_TO_COMPACT') throw error;
            if (!withinTurn) job = await giroInSottofondo({ records, measurement, prepared, budget, snapshot });
          }
        }
        /*
         * ⛔ Owner 16/10/2026 sera («Non aspettare se entra»), dopo la misura dal vivo (tetto 60.000, glm-5.3-flash, 12 file in
         *   catena): il riassunto in sottofondo partiva 2-3 passi prima del limite e durava 26 s, e il giro lo aspettava lo stesso
         *   (22 s; 20 s senza la cura). Claude Code, Codex e Hermes riassumono dentro il giro e aspettano. ⇒ Al limite, se un
         *   riassunto è GIÀ in corso e la richiesta entra ancora nella finestra vera — finestra meno la riserva della risposta, senza
         *   il margine di sicurezza della stima — la si manda subito: il riassunto si usa alla richiesta dopo, quando è pubblicato. Si
         *   aspetta solo quando non entra davvero, o quando il riassunto è in pausa (va ripreso), o quando nessuno era in corso (quello
         *   nuovo, dentro il giro, si aspetta come sempre).
         */
        // `waitForInFlight`: il ritentativo di chi ha mandato senza aspettare e si è visto rispondere «contesto pieno» (guscio, K8)
        senzaAttesa = !waitForInFlight && !budget.fits && inVoloPrima && job?.state !== 'paused' && measurement.inputTokens <= budget.windowTokens - budget.responseReserve;
        if (!budget.fits && job && !senzaAttesa) {
          if (job.state === 'paused') job = await api.resumeCompaction({ sessionId, jobId: job.id, sessionModel, tools, signal, projection });
          /* C4: il lavoro (appena partito, ripreso o già in volo) va avanti da solo; questa richiesta non lo aspetta */
          /* contratto con la CLI (28/10/2026): il «non pronto» dice QUALE lavoro scrive il riassunto (`details.jobId`): chi ospita lega a lui
             la riga del rapido, e solo la versione pubblicata da QUEL lavoro la migliora (un /compact della persona, o un lavoro dopo uno
             fallito, no) */
          if (nonAspettare) throw new ContextEngineError('The summary is still being written: this request goes with a quick summary, and the next one uses it.', 'CTX_SUMMARY_NOT_READY', { jobId: job.id });
          const result = await attendiNelGiro(job.id);
          if (result.state !== 'committed') fail(result.error?.code ?? 'CTX_COMPACTION_REQUIRED', result.error?.message ?? 'Il contesto richiede una compattazione completata.');
          snapshot = await state(sessionId);
          ({ prepared, measurement, cleared: toolOutputsCleared, level1 = null } = await project(snapshot, overlay(await originals(sessionId), projection)));
          await record(measurement); // dopo una compattazione riuscita la misura nuova sostituisce quella vecchia
          /* C1 (owner 09/10/2026 sera, «Tutti e due»): se il riassunto pubblicato non basta (copriva fin dove era la storia quando è
             partito), ne parte SUBITO un secondo fino ad adesso — al massimo uno in più; se anche quello non basta, il rifiuto è
             l'overflow di sempre, qui sotto. */
          if (!budgetFor(measurement, snapshot.settings).fits) {
            let ancora = null;
            try { ancora = await api.startCompaction({ sessionId, idempotencyKey: `auto-${snapshot.revision}-${await hash(identity(sessionModel))}-more`, sessionModel, tools, signal, projection, withinTurn: true, retainRecentTurns: 1 }); }
            catch (error) { if (error.code !== 'CTX_NOTHING_TO_COMPACT') throw error; }
            if (ancora) {
              const secondo = await attendiNelGiro(ancora.id);
              if (secondo.state === 'committed') {
                job = secondo;
                snapshot = await state(sessionId);
                ({ prepared, measurement, cleared: toolOutputsCleared, level1 = null } = await project(snapshot, overlay(await originals(sessionId), projection)));
                await record(measurement);
              }
            }
          }
        }
      }
      if (!senzaAttesa && !budgetFor(measurement, snapshot.settings).fits) {
        // il tempo che RESTA, non la durata del gradino: a pausa quasi scaduta «per 15 min» mentirebbe
        if (compactionCooling) fail('CTX_CONTEXT_OVERFLOW', `Il contesto supera la finestra e la compattazione automatica è in pausa ancora per circa ${Math.max(1, Math.ceil((Date.parse(compactionCooling.retryAfter) - Date.parse(clock())) / 60_000))} min dopo un riassunto non riuscito (${compactionCooling.code}). Usa «Compatta» per riprovare subito, o modifica le informazioni protette.`);
        fail('CTX_CONTEXT_OVERFLOW', 'Il contesto supera la finestra. Compattare o modificare le informazioni protette.');
      }
      return { messages: prepared, measurement, versionId: snapshot.activeVersion?.id ?? null, ...(toolOutputsCleared ? { toolOutputsCleared } : {}), ...(level1 ? { level1 } : {}), ...(job ? { job } : {}), ...(compactionCooling ? { compactionCooling } : {}), ...(senzaAttesa ? { sentWithoutWaiting: true } : {}), waiting: false };
    },
    getContextState: async ({ sessionId }) => recoverInterrupted(sessionId, await state(sessionId)),
    async updateContextSettings({ sessionId, patch, expectedRevision }) {
      const snapshot = await state(sessionId);
      const settings = parseContextSettings({ ...snapshot.settings, ...patch });
      return store.updateSessionSettings({ sessionId, settings, expectedRevision });
    },
    listContextVersions: options => store.listContextVersions(options),
    restoreContextVersion: options => store.restoreContextVersion({ ...options, newVersionId: idFactory(), createdAt: clock() }),
    async upsertProtectedFact({ sessionId, fact, expectedRevision, actor }) {
      if (!['owner', 'model'].includes(actor)) fail('CTX_FACT_ACTOR_INVALID', 'Indicare l’origine della modifica.');
      const snapshot = await state(sessionId);
      const prior = snapshot.facts.find(entry => entry.id === fact.id);
      const updated = actor === 'model' && prior && prior.status !== 'removed' && prior.text !== fact.text
        ? { ...prior, revision: prior.revision + 1, status: 'conflict', conflict: { proposedText: fact.text, sources: fact.sources ?? [] } }
        : { id: fact.id, text: fact.text, sources: fact.sources ?? [], status: 'active', revision: (prior?.revision ?? 0) + 1 };
      return store.upsertProtectedFact({ sessionId, fact: updated, expectedRevision });
    },
    removeProtectedFact: options => store.removeProtectedFact(options),
    async resolveFactConflict({ sessionId, factId, accept, expectedRevision }) {
      if (typeof accept !== 'boolean') fail('CTX_INVALID_INPUT', 'Confermare o rifiutare la proposta.');
      const prior = (await state(sessionId)).facts.find(f => f.id === factId);
      if (!prior || prior.status !== 'conflict') fail('CTX_FACT_CONFLICT_NOT_FOUND', 'Nessun conflitto aperto.');
      return api.upsertProtectedFact({ sessionId, expectedRevision, actor: 'owner', fact: { id: factId, text: accept ? prior.conflict.proposedText : prior.text, sources: accept ? prior.conflict.sources : prior.sources } });
    },
    async searchContext({ sessionId, query }) {
      await state(sessionId);
      if (retrieval?.searchContext) return retrieval.searchContext({ sessionId, query });
      const records = await originals(sessionId);
      await store.replaceSearchChunks({ sessionId, chunks: chunkContextRecords(records) });
      const lexical = await store.searchLexical({ sessionId, query });
      return selectContextEvidence(rankContextSources({ lexical }));
    },
    async readContextSource({ sessionId, sourceId }) {
      const [record] = await store.readOriginals({ sessionId, ids: [sourceId], limit: 1 });
      if (!record) fail('CTX_SOURCE_NOT_FOUND', 'Fonte non presente in questa conversazione.');
      return record;
    },
    exportContext: options => store.exportSession(options),
    importContext: options => store.importSession(options),
  };
  return Object.freeze(api);
}
