import { descriviContextCompactor } from './context-compactor.js';
import { linguaCorrenteDiT } from './lingua.js';

const ACTIVE = new Set(['queued', 'preparing', 'summarizing', 'validating', 'ready']);

/*
 * LA STIMA DEL TEMPO RESIDUO — perché esiste, e perché è fatta così.
 *
 * Quando il contesto si riempie la chat ASPETTA che la compattazione finisca prima di
 * rispondere: è la decisione presa e non si cambia. Ma l'attesa era muta. Misurato il 09/09
 * in un giro vero con `z-ai/glm-5.3-flash` (processo isolato, cronologia di 40 scambi,
 * finestra dichiarata 16.384): la compattazione ha impiegato ~16 secondi su 2 segmenti, e il
 * primo token della risposta è arrivato a 61,2 s dall'invio. Senza una stima quei secondi
 * sembrano un blocco.
 *
 * ⛔ La disciplina è la stessa di `descriviAvanzamentoContesto`, che non produce MAI una
 * percentuale senza segmenti misurati: qui non si produce MAI un tempo senza un campione.
 *
 * Ricerca 09/09/2026, letta alla fonte (citazioni verbatim):
 *  · Microsoft Win32 UX Guide «Progress Bars», ms.date 20/10/2020, updated_at 11/03/2025
 *    (learn.microsoft.com/en-us/windows/win32/uxguide/progress-bars):
 *      – «Provide a time remaining estimate if you can do so accurately… You may need to
 *        perform some processing before you can give accurate estimates. If so, don't display
 *        potentially inaccurate estimates during this initial period.»
 *        ⇒ nessun numero finché almeno un segmento non è finito.
 *      – «Always increase progress monotonically. However, you can have a time remaining
 *        estimate that increases (as well as decreases) because the rate of progress may
 *        vary.» ⇒ la BARRA non torna indietro, la STIMA sì può salire: un segmento lento
 *        allunga il numero invece di nasconderlo.
 *      – «Keep the estimate up-to-date. Update time remaining estimates at least every 5
 *        seconds.» + «Make estimates accurate, but don't give false precision.»
 *        ⇒ passo di 5 secondi, mai decimi.
 *      – «If the time remaining estimate is associated with a progress bar, don't have percent
 *        complete text because that information is conveyed by the progress bar itself.»
 *        ⇒ il testo visibile NON ripete «1 di 3»: lo mostra la barra.
 *      – «Be grammatically correct. Use singular units when the number is one.» + sentence-style
 *        capitalization, e i formati «m minutes, s seconds remaining» → «s seconds remaining».
 *      – «Don't combine indeterminate progress bars with percent complete or time remaining
 *        estimates.» ⇒ si stima SOLO nella fase determinata.
 *  · W3C ARIA APG, «Range Related Properties» (letto via ctx7 il 09/09/2026): «The aria-valuenow
 *    property needs to be set for a progressbar if its value is known (e.g. not indeterminate)»
 *    ⇒ il `value` si toglie quando la fase non ha segmenti, come già faceva questo file.
 *  · MDN `aria-valuetext` (12/05/2025): l'attributo è ereditato dal ruolo `progressbar`, e fra
 *    i suoi ruoli `status` NON c'è. Esempio ufficiale: «8% (34 minutes) remaining» — quantità
 *    più tempo residuo nello stesso valuetext è la forma documentata, non un'invenzione.
 *  · MDN role `timer` (23/06/2025): ha `aria-live` implicito `off` proprio perché un numero che
 *    cambia di continuo non si annuncia. È il precedente per tenere la stima fuori dal
 *    `role="status"`.
 *  · NN/g, Sherwin «Progress Indicators Make a Slow System Less Insufferable» (26/10/2014) e
 *    Nielsen «Response Times: The 3 Important Limits» (01/01/1993): oltre i 10 s serve un
 *    avanzamento determinato, e la stima temporale si aggiunge dai ~15 s in su. Sotto quella
 *    soglia un numero al secondo è precisione falsa ⇒ «ancora pochi secondi».
 *  · Raymond Chen, The Old New Thing (06/01/2004): «it can't predict the future, but it is
 *    forced to try» — all'inizio la storia è troppo poca. L'inaffidabilità è STRUTTURALE,
 *    quindi la cura è tacere, non lisciare il numero.
 *
 * ⛔ Nessuna media mobile: la ricerca non ha trovato NESSUNA fonte autorevole che la raccomandi
 *    per gli ETA (assente da Microsoft, Chen, NN/g e Harrison UIST '07), quindi non la si adotta
 *    spacciandola per pratica documentata. Il tasso è il rapporto misurato
 *    `trascorso / segmenti completati`, e basta.
 *
 * ⭐ I concorrenti, verificati il 09/09/2026. Claude Code durante `/compact` non mostra NIENTE:
 *    solo un messaggio «Conversation compacted» DOPO, e la sintesi «happens without appearing in
 *    your terminal» (docs ufficiali code.claude.com/docs/en/context-window). Hermes v0.21 (clone
 *    a commit 365e2835 del 02/09/2026) mostra una label FISSA «Summarizing thread», dichiarata
 *    nel codice «decoupled from backend status text», senza percentuale né tempo, con
 *    `compression.progress_notices` spento di default e `aria-valuetext` mai usato in tutto il
 *    repo. ⇒ il conteggio a segmenti PIÙ la stima è un +1 misurabile su entrambi.
 *
 * L'ISTANTE D'INIZIO. Non serve un cronometro in pagina: `ContextJobV1.createdAt` è un ISO con
 * offset, è PERSISTITO nel job e lo snapshot restituisce i job interi (`job_json`).
 * ⇒ la stima resta corretta se la modale si chiude e riapre, e resta corretta ANCHE dopo un
 * reload, perché l'inizio non è mai stato in memoria. Se quel campo non c'è (forma piatta,
 * fixture precedenti) non si finge di saperlo: nessun numero.
 * `createdAt` comprende la coda e la preparazione, quindi il tasso è per eccesso: la stima parte
 * prudente e si accorcia — la direzione buona, non quella che tradisce.
 */
const MINUTO_MS = 60_000;
/** Sotto questa soglia un numero sarebbe precisione falsa (NN/g: la stima si dà dai ~15 s). */
const SOGLIA_NUMERO_MS = 15_000;
/** Microsoft: aggiornare almeno ogni 5 s. Il passo evita anche che il testo cambi a ogni giro
 *  del monitor (1.200 ms), che accanto a una live region equivarrebbe a urlare. */
const PASSO_SECONDI_MS = 5_000;
/** Un lavoro ereditato con una data ferma (le fixture usano un `createdAt` fisso) darebbe
 *  «circa 12 ore»: oltre questo tetto la stima non è una stima, è un artefatto. */
const RESIDUO_ASSURDO_MS = 99 * MINUTO_MS;

const SENZA_STIMA = Object.freeze({ noto: false, msResidui: null, msPerSegmento: null, segmentiResidui: null });

/**
 * Il tempo che resta, ricavato SOLO da ciò che è misurato: i segmenti completati sul totale e il
 * tempo trascorso dall'inizio dichiarato dal job. Pura: `adesso` è iniettabile.
 */
export function stimaResiduoContesto(job, adesso = Date.now()) {
  // Solo `summarizing` ha segmenti; le altre fasi sono indeterminate e non hanno un tasso.
  if (job?.state !== 'summarizing') return SENZA_STIMA;
  const completed = job.progress?.completed, total = job.progress?.total;
  if (!Number.isSafeInteger(completed) || !Number.isSafeInteger(total)) return SENZA_STIMA;
  // `completed >= 1` è il campione minimo: con zero segmenti finiti non c'è niente da dividere.
  if (!(total > 0 && completed >= 1 && completed <= total)) return SENZA_STIMA;
  const inizio = Date.parse(job.createdAt ?? '');
  if (!Number.isFinite(inizio)) return SENZA_STIMA;
  const trascorso = adesso - inizio;
  // Un orologio incoerente non diventa un tempo negativo travestito da stima.
  if (!(trascorso > 0)) return SENZA_STIMA;
  const msPerSegmento = trascorso / completed;
  const segmentiResidui = total - completed;
  const msResidui = msPerSegmento * segmentiResidui;
  if (!Number.isFinite(msResidui) || msResidui > RESIDUO_ASSURDO_MS) return SENZA_STIMA;
  return { noto: true, msResidui, msPerSegmento, segmentiResidui };
}

/**
 * La frase accanto allo stato. Dice sempre che è una stima; arrotonda a secondi interi (passi di
 * 5) e passa ai minuti quando l'unità grande esiste, così non esce mai «circa 60 secondi».
 * Quando non c'è niente su cui basarsi non inventa: dichiara che il tempo non è stimabile.
 */
export function descriviStimaResiduo(stima, { english = false } = {}) {
  if (!stima?.noto) return english ? 'time not measurable yet' : 'tempo non ancora stimabile';
  const ms = stima.msResidui;
  if (ms < SOGLIA_NUMERO_MS) return english ? 'a few seconds left (estimate)' : 'ancora pochi secondi (stima)';
  const secondi = Math.round(ms / PASSO_SECONDI_MS) * (PASSO_SECONDI_MS / 1000);
  if (secondi < 60) return english ? `about ${secondi} seconds remaining (estimate)` : `circa ${secondi} secondi rimanenti (stima)`;
  const minuti = Math.max(1, Math.round(ms / MINUTO_MS));
  return english
    ? `about ${minuti} minute${minuti === 1 ? '' : 's'} remaining (estimate)`
    : `circa ${minuti} minut${minuti === 1 ? 'o' : 'i'} rimanent${minuti === 1 ? 'e' : 'i'} (stima)`;
}

export function descriviAvanzamentoContesto(snapshot, { adesso = Date.now() } = {}) {
  const view = descriviContextCompactor(snapshot);
  const job = view.job;
  const completed = job?.progress?.completed, total = job?.progress?.total;
  const determinate = job?.state === 'summarizing' && Number.isSafeInteger(completed) && Number.isSafeInteger(total) && total > 0 && completed >= 0 && completed <= total;
  return { job, label: view.jobLabel, visible: Boolean(job && job.state !== 'committed'), active: ACTIVE.has(job?.state), determinate, value: determinate ? completed : null, max: determinate ? total : null, stima: stimaResiduoContesto(job, adesso) };
}

/** Progress belongs to the persisted job; only a committed version adds a separator. */
export function aggiornaAvanzamentoContesto(container, snapshot, { onOpen, stale = false, adesso = Date.now() } = {}) {
  if (!container) return;
  const view = descriviAvanzamentoContesto(snapshot, { adesso });
  let row = container.querySelector('[data-context-chat-progress]');
  if (!view.visible) { row?.remove(); return; }
  const doc = container.ownerDocument, english = linguaCorrenteDiT() === 'en';
  if (!row || row.dataset.contextSession !== snapshot.sessionId) {
    row?.remove(); row = doc.createElement('section'); row.className = 'talos-context-chat-progress';
    row.dataset.contextChatProgress = ''; row.dataset.contextSession = snapshot.sessionId;
    // Un solo figlio nella prima colonna della griglia (`minmax(0,1fr) auto`): lo stato e la
    // stima stanno dentro lo stesso `span`, così il foglio di stile esistente resta intatto.
    const testo = doc.createElement('span'); testo.dataset.contextChatText = '';
    const status = doc.createElement('span'); status.dataset.contextChatStatus = ''; status.setAttribute('role', 'status');
    // ⛔ La stima sta FUORI dal `role="status"`: quella è una live region (role=status implica
    //   aria-live="polite") e un numero che cambia ogni 1.200 ms la farebbe urlare. Il precedente
    //   normativo è `role="timer"`, che ha `aria-live` implicito `off` proprio per questo (MDN,
    //   23/06/2025); qui lo si dichiara esplicito perché l'intenzione si legga nel markup.
    //   Chi usa lo schermo la trova comunque: sfogliando la riga, e dentro `aria-valuetext`.
    const stima = doc.createElement('span'); stima.dataset.contextChatEta = ''; stima.setAttribute('aria-live', 'off');
    testo.append(status, stima);
    const bar = doc.createElement('progress'); bar.className = 'talos-context__progress';
    const button = doc.createElement('button'); button.type = 'button'; button.className = 'talos-button talos-button--ghost talos-button--sm'; button.textContent = 'Context Manager'; button.addEventListener('click', () => onOpen?.());
    row.append(testo, button, bar); container.append(row);
  }
  row.dataset.contextJob = view.job.id; row.dataset.contextState = view.job.state;
  const bar = row.querySelector('progress'); bar.hidden = !view.active;
  const text = stale ? (english ? 'Progress unavailable. Reconnecting…' : 'Avanzamento non disponibile. Riconnessione…') : view.label;
  row.querySelector('[data-context-chat-status]').textContent = text;
  bar.setAttribute('aria-label', english ? 'Context compaction' : 'Compattazione del contesto');
  // La stima compare solo nella fase che HA segmenti: su «Preparazione» o «Pubblicazione» un
  // «tempo non ancora stimabile» sarebbe rumore, ed è il periodo iniziale che Microsoft dice di
  // lasciare senza stime. In riconnessione non sappiamo lo stato, quindi nemmeno il tempo.
  const testoStima = !stale && view.job.state === 'summarizing' ? descriviStimaResiduo(view.stima, { english }) : '';
  row.querySelector('[data-context-chat-eta]').textContent = testoStima ? ` · ${testoStima}` : '';
  if (view.determinate && !stale) {
    bar.max = view.max; bar.value = view.value;
    // Dentro `aria-valuetext` il conteggio SERVE (l'AT non «vede» la barra) e la forma
    // «quantità (tempo) remaining» è quella documentata da MDN (12/05/2025: «8% (34 minutes)
    // remaining»). Non è una live region: cambiarla non annuncia niente, quindi qui la stima è
    // sicura. ⛔ `aria-valuetext` sta sul `<progress>` (ruolo `progressbar`, che lo eredita), MAI
    // sullo `span` con `role="status"`: fra i ruoli di quell'attributo `status` non c'è.
    const conteggio = english ? `${view.value} of ${view.max} segments` : `${view.value} di ${view.max} segmenti`;
    bar.setAttribute('aria-valuetext', view.stima.noto ? `${conteggio} · ${testoStima}` : conteggio);
  } else { bar.removeAttribute('value'); bar.removeAttribute('aria-valuetext'); }
  return row;
}
