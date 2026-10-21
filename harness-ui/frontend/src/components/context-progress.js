import { TESTI } from '../i18n/testi/index.js';
import { descriviContextCompactor } from './context-compactor.js';
import { t, tn, interpola, linguaCorrenteDiT } from './lingua.js';

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
function traduciStima(chiave, english, parametri) {
  return english ? interpola(TESTI.en[chiave], parametri) : t(chiave, parametri);
}

export function descriviStimaResiduo(stima, { english = false } = {}) {
  if (!stima?.noto) return traduciStima('chat.context.progress.timeUnknown', english);
  const ms = stima.msResidui;
  if (ms < SOGLIA_NUMERO_MS) return traduciStima('chat.context.progress.fewSeconds', english);
  const secondi = Math.round(ms / PASSO_SECONDI_MS) * (PASSO_SECONDI_MS / 1000);
  if (secondi < 60) return traduciStima('chat.context.progress.aboutSeconds', english, { n: secondi });
  const minuti = Math.max(1, Math.round(ms / MINUTO_MS));
  return traduciStima(minuti === 1 ? 'chat.context.progress.aboutMinuteOne' : 'chat.context.progress.aboutMinutesMany', english, { n: minuti });
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
    /* B1 (owner 21/10/2026): non più un riquadro alto ma UNA riga nello stile della riga viva (`compattazione-legacy.css`), col filo
       da 2 px in fondo e «Context Manager» come pulsante testuale. Il markup (stato, stima, pulsante, `<progress>`) resta lo stesso. */
    row?.remove(); row = doc.createElement('section'); row.className = 'talos-riga-viva talos-riga-viva--contesto';
    row.dataset.contextChatProgress = ''; row.dataset.contextSession = snapshot.sessionId;
    // lo stato e la stima stanno dentro lo stesso `span`: si accorcia lui, mai i pulsanti
    const testo = doc.createElement('span'); testo.dataset.contextChatText = '';
    const status = doc.createElement('span'); status.dataset.contextChatStatus = ''; status.setAttribute('role', 'status');
    // ⛔ La stima sta FUORI dal `role="status"`: quella è una live region (role=status implica
    //   aria-live="polite") e un numero che cambia ogni 1.200 ms la farebbe urlare. Il precedente
    //   normativo è `role="timer"`, che ha `aria-live` implicito `off` proprio per questo (MDN,
    //   23/06/2025); qui lo si dichiara esplicito perché l'intenzione si legga nel markup.
    //   Chi usa lo schermo la trova comunque: sfogliando la riga, e dentro `aria-valuetext`.
    const stima = doc.createElement('span'); stima.dataset.contextChatEta = ''; stima.setAttribute('aria-live', 'off');
    testo.append(status, stima);
    const bar = doc.createElement('progress'); bar.className = 'talos-riga-viva__barra';
    const button = doc.createElement('button'); button.type = 'button'; button.className = 'talos-riga-viva__azione talos-riga-viva__azione--sola'; button.dataset.contextChatOpen = ''; button.addEventListener('click', () => onOpen?.());
    row.append(testo, button, bar); container.append(row);
  }
  // il nome del pulsante si riscrive a ogni aggiornamento: dopo un cambio di lingua la riga si ridice al giro dopo del monitor
  scriviSeCambia(row.querySelector('[data-context-chat-open]'), t('chat.context.manager'));
  row.dataset.contextJob = view.job.id; row.dataset.contextState = view.job.state;
  const bar = row.querySelector('progress'); bar.hidden = !view.active;
  const text = stale ? (t('chat.context.progress.reconnecting')) : view.label;
  // ⛔ una live region si riscrive solo se la frase CAMBIA: riscrivere lo stesso testo a ogni giro del monitor la rifarebbe parlare
  scriviSeCambia(row.querySelector('[data-context-chat-status]'), text);
  bar.setAttribute('aria-label', t('chat.context.progress.barLabel'));
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
    const conteggio = t('chat.context.progress.segments', { n: view.value, totale: view.max });
    bar.setAttribute('aria-valuetext', view.stima.noto ? `${conteggio} · ${testoStima}` : conteggio);
  } else { bar.removeAttribute('value'); bar.removeAttribute('aria-valuetext'); }
  return row;
}


/** Riscrive un testo solo se cambia: una live region riscritta con le stesse parole parlerebbe di nuovo. */
function scriviSeCambia(nodo, testo) {
  if (nodo && nodo.textContent !== testo) nodo.textContent = testo;
}

/*
 * ⭐ B1 (owner 21/10/2026, mockup approvato alla terza versione: «troppo alto, quasi un wall of text» la prima) — LA RIGA VIVA DEL
 *   RIASSUNTO. Prende il posto della barra legacy del 24/09 (F5, onda 2), con gli stessi attributi (`data-compattazione-barra`, la
 *   sessione, il motivo: `app.js` li legge per spegnerla a fine giro) e la stessa barra indeterminata quando non c'è niente da contare.
 *   UNA riga alta 30 px, senza riquadro: «Riassumo il contesto» poi «62% · ~1 min», a destra «Salta» e «Ferma», in fondo un filo da 2 px.
 *   I numeri vengono SOLO da `talos.compattazione-progresso` (contratto §2): un campo che il motore non dà resta fuori dalla frase —
 *   niente percento senza `letti`/`totale`, niente tempo senza `stimaRestanteSec` (la stessa disciplina della stima qui sopra).
 *
 * Ricerca del passo, letta il 21/10/2026:
 *  · MDN role `status` (23/06/2025, già citato sopra): live region `polite` ⇒ dentro va solo la frase che cambia di rado (lo stato); il
 *    percento e il tempo cambiano a ogni passo e stanno FUORI, con `aria-live="off"` come la stima del trial (precedente: role `timer`).
 *  · MDN `<progress>` (28/08/2026): senza `value` la barra è indeterminata; con `value` porta `aria-valuetext` («62% · ~1 min»). Il
 *    filo a DUE tratti (in cache / letti davvero) non è una barra sola: lo si disegna a parte, `aria-hidden`, e l'`<progress>` resta
 *    sotto, trasparente, per chi usa lo schermo.
 *  · MDN CSP `style-src` (ultima modifica 15/12/2025): «styles properties that are set directly on the element's style property will
 *    not be blocked» ⇒ le larghezze dei due tratti passano da `style.setProperty` su due variabili CSS, come `range-scia.js`; mai un
 *    attributo `style` (la CSP del server, `http-app.mjs:1050`, lo scarterebbe).
 *  · MDN `color-mix()` (ultima modifica 28/09/2026, Baseline «widely available» da maggio 2023): binario e tratto tenue sono
 *    `color-mix(in srgb, <token> N%, transparent)`, la forma del suo esempio «Adding transparency».
 *  · WCAG 2.2 (W3C Recommendation, edizione del 12/12/2024), 2.5.3 «Label in Name»: il nome accessibile dei pulsanti CONTIENE la parola visibile («Skip the summary…» per «Skip»).
 */
const MINUTO_S = 60;
/** I secondi rimasti in breve, come il mockup («~1 min», «~40 s»): passi di 5 s, mai «~0 s» e mai «~60 s». */
export function stimaBreveRigaViva(secondi) {
  if (!Number.isSafeInteger(secondi) || secondi < 1) return '';
  const arrotondati = Math.max(5, Math.round(secondi / 5) * 5);
  if (arrotondati < MINUTO_S) return t('chat.context.live.etaSeconds', { n: arrotondati });
  return t('chat.context.live.etaMinutes', { n: Math.max(1, Math.round(secondi / MINUTO_S)) });
}
/** Il tempo trascorso in breve («3m 12s», in italiano «3 min 12 s»). */
export function durataBreveRigaViva(ms) {
  if (!Number.isSafeInteger(ms) || ms < 0) return '';
  const tutti = Math.floor(ms / 1000);
  if (tutti < MINUTO_S) return t('chat.context.live.durationSeconds', { s: tutti });
  return t('chat.context.live.durationMinutes', { m: Math.floor(tutti / MINUTO_S), s: tutti % MINUTO_S });
}
const interoPositivo = (v) => Number.isSafeInteger(v) && v >= 0;
const numeroLocale = (n) => new Intl.NumberFormat(linguaCorrenteDiT() === 'en' ? 'en-US' : 'it-IT').format(n);
const MOTIVO_NEL_TITOLO = Object.freeze({ overflow: 'chat.context.progress.overflow', emergenza: 'chat.context.progress.emergency' });

/**
 * Che cosa dice la riga, senza il DOM. `stato` è un passo di `talos.compattazione-progresso` già letto
 * (`interpretaEventoCompattazione`, tipo `progresso`) o l'inizio `{ fase:'inizio', motivo }`. Pura: si prova nei due versi.
 */
export function descriviRigaViva(stato) {
  const s = stato && typeof stato === 'object' ? stato : {};
  const totale = interoPositivo(s.totale) && s.totale > 0 ? s.totale : null;
  const letti = totale !== null && interoPositivo(s.letti) ? Math.min(s.letti, totale) : null;
  const determinato = letti !== null;
  // la cache è una parte di ciò che è letto (llama.cpp `prompt_progress`: `cache` ≤ `processed`): un numero incoerente non sfora
  const inCache = determinato && interoPositivo(s.inCache) ? Math.min(s.inCache, letti) : 0;
  const percento = determinato ? Math.floor((letti * 100) / totale) : null;
  const stima = stimaBreveRigaViva(s.stimaRestanteSec);

  const dettaglio = [];
  if (s.fase === 'riassunto') {
    dettaglio.push(interoPositivo(s.tokenScritti)
      ? tn('chat.context.live.writingOne', 'chat.context.live.writingMany', s.tokenScritti, { n: numeroLocale(s.tokenScritti) })
      : t('chat.context.live.writingPlain'));
  } else if (determinato) dettaglio.push(t('chat.context.live.percent', { n: percento }));
  if (stima) dettaglio.push(stima);

  const titolo = [];
  if (Object.hasOwn(MOTIVO_NEL_TITOLO, s.motivo)) titolo.push(t(MOTIVO_NEL_TITOLO[s.motivo]));
  if (totale !== null) {
    // il plurale segue il numero (cancello LINGUA-7-04); la cache è un pezzo a parte, dopo una virgola
    const daLeggere = tn('chat.context.live.tipToReadOne', 'chat.context.live.tipToReadMany', totale, { n: numeroLocale(totale) });
    titolo.push(inCache > 0 ? `${daLeggere}, ${t('chat.context.live.tipCached', { c: numeroLocale(inCache) })}` : daLeggere);
  }
  const trascorso = durataBreveRigaViva(s.trascorsoMs);
  if (trascorso) titolo.push(t('chat.context.live.tipElapsed', { t: trascorso }));
  if (interoPositivo(s.tentativo) && s.tentativo > 0) {
    titolo.push(interoPositivo(s.tentativi) && s.tentativi >= s.tentativo
      ? t('chat.context.live.tipAttemptOf', { n: s.tentativo, m: s.tentativi })
      : t('chat.context.live.tipAttempt', { n: s.tentativo }));
  }

  return {
    etichetta: t('chat.context.live.summarizing'),
    dettaglio: dettaglio.join(' · '),
    titolo: titolo.join(' · '),
    determinato,
    letti, totale,
    // le due larghezze del filo, in percento della riga: la cache tenue, poi ciò che è stato letto davvero
    tratti: determinato ? { cache: (inCache * 100) / totale, letto: ((letti - inCache) * 100) / totale } : null,
    valoreTesto: determinato ? [t('chat.context.live.percent', { n: percento }), stima].filter(Boolean).join(' · ') : '',
  };
}

const percentoCss = (x) => `${Math.round(Math.min(100, Math.max(0, x)) * 100) / 100}%`;

/** Disegna lo stato nella riga già montata. Separata dal montaggio: la usa anche il ridisegno al cambio di lingua. */
function disegnaRigaViva(row, stato) {
  const vista = descriviRigaViva(stato);
  const opzioni = row._rigaViva ?? {};
  row.dataset.contextState = 'summarizing';
  if (typeof stato?.motivo === 'string') row.dataset.compattazioneMotivo = stato.motivo;
  else if (row.dataset.compattazioneMotivo === undefined) row.dataset.compattazioneMotivo = '';
  if (typeof stato?.fase === 'string' && stato.fase) row.dataset.compattazioneFase = stato.fase;
  scriviSeCambia(row.querySelector('[data-context-chat-status]'), vista.etichetta);
  scriviSeCambia(row.querySelector('[data-context-chat-eta]'), vista.dettaglio);
  if (vista.titolo) { if (row.title !== vista.titolo) row.title = vista.titolo; } else row.removeAttribute('title');

  const salta = row.querySelector('[data-riga-viva="salta"]'), ferma = row.querySelector('[data-riga-viva="ferma"]');
  scriviSeCambia(salta, t('chat.context.live.skip')); salta.setAttribute('aria-label', t('chat.context.live.skipLabel'));
  scriviSeCambia(ferma, t('chat.context.live.stop')); ferma.setAttribute('aria-label', t('chat.context.live.stopLabel'));
  salta.hidden = typeof opzioni.onSalta !== 'function';
  ferma.hidden = typeof opzioni.onFerma !== 'function';
  row.querySelector('[data-riga-viva-azioni]').hidden = salta.hidden && ferma.hidden;

  const bar = row.querySelector('progress'), filo = row.querySelector('[data-riga-viva-filo]');
  bar.hidden = false;
  bar.setAttribute('aria-label', t('chat.context.summaryInProgress'));
  if (vista.determinato) {
    bar.setAttribute('max', String(vista.totale)); bar.setAttribute('value', String(vista.letti));
    bar.setAttribute('aria-valuetext', vista.valoreTesto);
    row.dataset.rigaVivaTratti = '';
    filo.hidden = false;
    filo.style.setProperty('--talos-riga-viva-cache', percentoCss(vista.tratti.cache));
    filo.style.setProperty('--talos-riga-viva-letto', percentoCss(vista.tratti.letto));
  } else {
    // indeterminata (MDN `<progress>`: senza `value`), e il filo a due tratti non si mostra: niente da dividere
    bar.removeAttribute('value'); bar.removeAttribute('max'); bar.removeAttribute('aria-valuetext');
    delete row.dataset.rigaVivaTratti;
    filo.hidden = true;
  }
}

/**
 * La riga viva del riassunto atteso. `stato` nullo la toglie (a `fase:'fine'`, o a fine giro). `onSalta()` (torna una promessa con
 * `{ saltato }`) e `onFerma()` accendono i due pulsanti: senza, la riga resta senza azioni (la compattazione chiesta a mano, fuori da
 * un giro, non ha un giro da fermare). Ogni passo SOSTITUISCE il precedente: i campi assenti tornano assenti, non restano vecchi.
 */
export function aggiornaAvanzamentoLegacy(container, stato, { sessionId, inserisci = null, onSalta = null, onFerma = null, document: doc = container?.ownerDocument ?? globalThis.document } = {}) {
  if (!container || !sessionId) return null;
  // ⛔ Attributo SUO, non `data-context-chat-progress`: `aggiornaAvanzamentoContesto` qui sopra cerca quell'attributo e lo RIMUOVE
  //   quando il trial non ha niente da mostrare — cioè a ogni `CTX_NOT_ENABLED` del monitor (24/09: barra sparita in 2 corse su 3).
  let row = container.querySelector('[data-compattazione-barra]');
  if (!stato) { row?.remove(); return null; }
  if (!row || row.dataset.contextSession !== sessionId) {
    row?.remove();
    row = doc.createElement('section'); row.className = 'talos-riga-viva talos-riga-viva--riassunto';
    row.dataset.compattazioneBarra = ''; row.dataset.compattazioneLegacy = ''; row.dataset.contextSession = sessionId;
    const testo = doc.createElement('span'); testo.dataset.contextChatText = '';
    const status = doc.createElement('span'); status.dataset.contextChatStatus = ''; status.setAttribute('role', 'status');
    const dettaglio = doc.createElement('span'); dettaglio.dataset.contextChatEta = ''; dettaglio.setAttribute('aria-live', 'off');
    testo.append(status, dettaglio);
    const azioni = doc.createElement('span'); azioni.className = 'talos-riga-viva__azioni'; azioni.dataset.rigaVivaAzioni = '';
    const salta = doc.createElement('button'); salta.type = 'button'; salta.className = 'talos-riga-viva__azione talos-riga-viva__azione--forte'; salta.dataset.rigaViva = 'salta';
    const ferma = doc.createElement('button'); ferma.type = 'button'; ferma.className = 'talos-riga-viva__azione'; ferma.dataset.rigaViva = 'ferma';
    azioni.append(salta, ferma);
    salta.addEventListener('click', () => {
      const chiama = row._rigaViva?.onSalta;
      if (typeof chiama !== 'function' || salta.disabled) return;
      // una POST sola anche a clic ravvicinati; se il server dice che non c'era niente da saltare, il pulsante torna
      salta.disabled = true;
      Promise.resolve().then(() => chiama()).then((esito) => { if (esito?.saltato !== true) salta.disabled = false; }, () => { salta.disabled = false; });
    });
    ferma.addEventListener('click', () => { const chiama = row._rigaViva?.onFerma; if (typeof chiama === 'function') chiama(); });
    const bar = doc.createElement('progress'); bar.className = 'talos-riga-viva__barra';
    const filo = doc.createElement('span'); filo.className = 'talos-riga-viva__filo'; filo.dataset.rigaVivaFilo = ''; filo.setAttribute('aria-hidden', 'true');
    const cache = doc.createElement('span'); cache.dataset.tratto = 'cache';
    const letto = doc.createElement('span'); letto.dataset.tratto = 'letto';
    filo.append(cache, letto);
    row.append(testo, azioni, bar, filo);
    // `inserisci` decide dove va (dentro il turno aperto, o in coda): una riga appesa alla colonna a metà turno spezza il turno TALOS
    if (typeof inserisci === 'function') inserisci(row); else container.append(row);
  }
  row._rigaViva = { stato, onSalta: typeof onSalta === 'function' ? onSalta : null, onFerma: typeof onFerma === 'function' ? onFerma : null };
  disegnaRigaViva(row, stato);
  return row;
}

/** Al cambio di lingua: la riga viva (se c'è) si ridice con l'ultimo passo che ha ricevuto, senza aspettare il passo dopo. */
export function ridisegnaRigaVivaNellaLingua(container) {
  const row = container?.querySelector?.('[data-compattazione-barra]');
  if (!row?._rigaViva?.stato) return false;
  disegnaRigaViva(row, row._rigaViva.stato);
  return true;
}
