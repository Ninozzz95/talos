/*
 * ⭐ 27/10/2026 — LA DOMANDA RESTA IN CIMA MENTRE SI LEGGE LA SUA RISPOSTA (owner, con la foto di Hermes: «di default renderle
 *   sticky al top come fa hermes, quest'ultima senza impostazione per tutti, evita di non spaccare nulla»).
 *
 * Hermes, letto nel codice (clone `hermes-agent-2026-10-22`, `apps/desktop/src/components/assistant-ui/thread/`):
 *   · `list.tsx:279-281` — «Group each user message with the assistant turn(s) that follow it so the human bubble can
 *     `position: sticky` against the scroller across its whole turn»: la domanda e la sua risposta stanno in UN contenitore
 *     (`aui_message-group`), che è il blocco contenitore della posizione appiccicata. Il passaggio di consegne fra due turni
 *     viene gratis: finito il gruppo, la domanda se ne va con lui.
 *   · `user-message.tsx:48-51` — il contenitore della bolla è un FRAMMENTO, non un involucro: «a wrapping element becomes the
 *     sticky's containing block (it'd stick within its own height = never)».
 *   · `use-sticky-prompt-clip.ts:14` — «Clip covered content instead of painting a solid rectangle over the glass»: la loro bolla
 *     è semitrasparente, e per non far vedere il testo sotto ritagliano a ogni scorrimento (rAF + `getBoundingClientRect`,
 *     `:51-139`, ascoltatore di `scroll` a `:206`) i fratelli coperti.
 *
 * ⛔ Qui il DOM è un altro, e non si cambia: il turno della persona e quello di TALOS sono FRATELLI dentro `#conversation`
 *   (`app.js`, `nellaChat`: «'utente' apre un turno; tutto il resto entra nel messaggio TALOS del turno corrente»), e una
 *   ventina di punti contano su questa forma (`lastElementChild`, i figli della colonna nella finestra di replay, la spina, la
 *   cronologia). Raggrupparli per avere il blocco contenitore di Hermes vorrebbe dire toccare tutti quei punti.
 *   ⇒ Il blocco contenitore di ogni turno della persona è la COLONNA intera: se fossero tutti appiccicati resterebbero tutti in
 *     cima, uno sopra l'altro, e una domanda corta lascerebbe vedere sotto di sé la coda di quella lunga di prima.
 *   ⇒ Allora UNO SOLO alla volta è appiccicato: la domanda dell'ultimo turno arrivato in cima (`data-domanda-corrente`). La
 *     domanda seguente scorre SOPRA di lei (`data-domanda-successiva`, stesso z-index e dopo nel DOM) e, arrivata in cima, prende
 *     il posto: mai due impilate.
 *
 * ⛔ Il costo, misurato e limitato (il brief: «niente ascoltatori di scroll che leggono la geometria a ogni fotogramma»):
 *   · NESSUN ascoltatore di `scroll`. Un `IntersectionObserver` guarda DUE elementi soltanto — la domanda corrente e la
 *     successiva — contro una radice che è la riga in cima allo scorrevole: si sveglia solo quando una delle due attraversa la
 *     riga, cioè a ogni cambio di turno, non a ogni fotogramma;
 *   · al risveglio (e quando cambiano i FIGLI DIRETTI della colonna: un turno nuovo, la finestra di replay che ne stacca uno)
 *     si cerca la domanda giusta con una ricerca binaria sui soli turni della persona: O(log n) letture di riquadri esterni,
 *     mai dentro i turni (che `content-visibility:auto` salta: `streaming-fluido.css:93-95`; Hermes `use-sticky-prompt-clip.ts:
 *     187-188`, «Measure only outer boxes here»);
 *   · la misura della fascia (quanto è alta la domanda tagliata) la dà un `ResizeObserver` sulla sola domanda corrente.
 * ⛔ Lo stato «ferma in cima» non lo decide lo script: lo dice il browser con la query di stato dello scorrimento
 *   (`@container scroll-state(stuck: top)`, Chrome 133+, developer.chrome.com «CSS scroll-state queries», letto il
 *   27/10/2026). Così la domanda che sta al suo posto nel flusso resta intera, e solo quella spostata dalla posizione appiccicata
 *   si taglia: niente cambia nell'impaginazione, cambia solo la pittura (vedi `domanda-appiccicata.css`).
 */
import { t } from './lingua.js';
import { scorrevoleConversazione } from '../bridge/conversazione-dom.js';

/** Hermes `styles.css:1892-1896`: la bolla appiccicata si ferma a QUATTRO righe (`max-height: calc(4 * …)`). */
export const RIGHE_DOMANDA_FERMA = 4;
/** La riga in cima: un turno la cui testa è sopra questa riga è «arrivato in cima» (px dal bordo alto dello scorrevole). */
const RIGA_IN_CIMA = 2;
/** Il respiro sotto la bolla tagliata, dentro la fascia (px): come il padding basso di `.talos-message` (`index.css:634`). */
const RESPIRO_SOTTO = 8;
/** Owner 28/10/2026 (BOLLE-REV-03): nello scorrimento veloce al più un ricalcolo ogni tanti ms, più uno a scorrimento finito. */
export const RICALCOLO_MINIMO_MS = 100;

const eDomanda = (nodo) => Boolean(nodo && nodo.nodeType === 1 && nodo.classList?.contains('talos-turn') && nodo.dataset?.turno === 'utente');

/** Il primo turno della persona DOPO `turno` fra i fratelli (salta le note e le risposte), o null. */
export function domandaSuccessiva(turno) {
  for (let n = turno?.nextElementSibling; n; n = n.nextElementSibling) if (eDomanda(n)) return n;
  return null;
}

/**
 * La domanda corrente: l'ULTIMA, fra i turni della persona (in ordine di documento), la cui testa è arrivata sopra la riga.
 * Le teste crescono in ordine di documento anche con una domanda appiccicata (lei sta ferma alla soglia, le precedenti sono più
 * su, le seguenti più giù): la sequenza è monotona e la ricerca binaria vale. `testa(i)` legge un solo riquadro.
 * @param {number} quante quanti turni della persona
 * @param {(i: number) => number} testa la coordinata alta del turno i
 * @param {number} riga la riga in cima
 * @returns {number} l'indice, o -1
 */
export function indiceDomandaCorrente(quante, testa, riga) {
  let basso = 0; let alto = quante - 1; let trovato = -1;
  while (basso <= alto) {
    const mezzo = (basso + alto) >> 1;
    if (testa(mezzo) <= riga) { trovato = mezzo; basso = mezzo + 1; } else alto = mezzo - 1;
  }
  return trovato;
}

/**
 * Quanto è alta la fascia di una domanda ferma in cima: dalla testa del turno fino a QUATTRO righe di bolla (o alla bolla intera,
 * se è più corta), più il respiro. `lunga` dice se la bolla è tagliata.
 * ⛔ Tagliata, la bolla si ferma SUBITO dopo la quarta riga (niente padding basso): col padding si vedeva spuntare la testa della
 *   quinta, mezza tagliata (foto del 27/10, `_esplora`). La quarta sfuma (`domanda-appiccicata.css`).
 * @returns {{ vista: number, corpo: number, lunga: boolean }}
 */
export function misuraFascia({ altoTurno, altoCorpo, altezzaCorpo, rigaPx, bordoAlto = 0, bordoBasso = 0, paddingAlto = 0, paddingBasso = 0, righe = RIGHE_DOMANDA_FERMA, respiro = RESPIRO_SOTTO }) {
  const intera = paddingAlto + bordoAlto + righe * rigaPx + paddingBasso + bordoBasso;
  const lunga = altezzaCorpo > intera + 1;
  const corpo = Math.ceil(lunga ? paddingAlto + bordoAlto + righe * rigaPx : altezzaCorpo);
  return { vista: Math.ceil(altoCorpo - altoTurno) + corpo + respiro, corpo, lunga };
}

/**
 * Collega la domanda appiccicata alla colonna della conversazione. Idempotente.
 * @param {HTMLElement} colonna `#conversation`
 * @returns {{ scollega: () => void, ricalcola: () => void, corrente: () => (HTMLElement|null), conteggi: () => object }}
 */
export function collegaDomandaAppiccicata(colonna, opzioni = {}) {
  const nulla = { scollega() {}, ricalcola() {}, corrente: () => null, conteggi: () => ({}) };
  if (!colonna || colonna.dataset.domandaCollegata === 'si') return nulla;
  const documentObj = colonna.ownerDocument;
  const finestra = documentObj.defaultView || globalThis;
  const scorrevole = scorrevoleConversazione(colonna);
  if (!scorrevole || typeof finestra.IntersectionObserver !== 'function') return nulla;
  colonna.dataset.domandaCollegata = 'si';
  const conteggi = { ricalcoli: 0, cambi: 0, misure: 0 };
  let corrente = null;
  let successiva = null;
  let collegata = true;
  let fotogramma = 0;
  let osservatore = null;
  let altezzaRadice = -1;
  let daOsservare = false;

  /* il pulsante «Domanda intera»: UNO solo, spostato nella domanda corrente quando è tagliata. Assoluto: non prende una cella
     della griglia del turno (`index.css:618`, `.talos-turn{display:grid}`), quindi non sposta niente. */
  const pulsante = documentObj.createElement('button');
  pulsante.type = 'button';
  pulsante.className = 'talos-button talos-button--secondary talos-button--sm talos-domanda-intera';
  pulsante.setAttribute('data-t-attr', '[aria-label]chat.message.wholeQuestionLabel;[title]chat.message.wholeQuestionLabel');
  pulsante.setAttribute('aria-label', t('chat.message.wholeQuestionLabel'));
  pulsante.title = t('chat.message.wholeQuestionLabel');
  const etichetta = documentObj.createElement('span');
  etichetta.setAttribute('data-t', 'chat.message.wholeQuestion');
  etichetta.textContent = t('chat.message.wholeQuestion');
  const icona = documentObj.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icona.setAttribute('class', 'i i--sm'); icona.setAttribute('aria-hidden', 'true');
  const uso = documentObj.createElementNS('http://www.w3.org/2000/svg', 'use'); uso.setAttribute('href', '#i-chev'); icona.append(uso);
  pulsante.append(etichetta, icona);
  pulsante.addEventListener('click', (evento) => { evento.preventDefault(); if (corrente) vaiAllaDomanda(corrente); });

  /** Porta la domanda al suo posto nel flusso, in cima: lì non è più spostata dalla posizione appiccicata, e si legge intera. */
  function vaiAllaDomanda(turno) {
    /* il posto nel FLUSSO, non quello appiccicato: per una lettura si spegne la posizione (due impaginazioni, su un clic) */
    const destinazione = () => {
      const prima = turno.style.position;
      turno.style.position = 'static';
      const alto = turno.getBoundingClientRect().top;
      turno.style.position = prima;
      return Math.max(0, scorrevole.scrollTop + alto - scorrevole.getBoundingClientRect().top);
    };
    const ridotto = finestra.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches || documentObj.body?.classList.contains('reduce-motion');
    scorrevole.scrollTo({ top: destinazione(), behavior: ridotto ? 'instant' : 'smooth' });
    /* ⛔ Durante il viaggio i turni sopra entrano in vista e si impaginano per davvero (`content-visibility:auto` sui turni chiusi,
       `streaming-fluido.css:93-95`): la loro altezza vera sposta la meta di qualche decina di pixel (misurato da BOLLE-04: 11 px
       oltre, abbastanza da lasciarla ferma e tagliata). A viaggio finito (`scrollend`, Chrome 114+) si corregge, al più due volte. */
    let correzioni = 0;
    const correggi = () => {
      const meta = destinazione();
      if (Math.abs(meta - scorrevole.scrollTop) > 1 && correzioni < 2 && turno.isConnected) { correzioni += 1; scorrevole.scrollTo({ top: meta, behavior: 'instant' }); finestra.requestAnimationFrame(correggi); }
    };
    if (ridotto) finestra.requestAnimationFrame(correggi);
    else scorrevole.addEventListener('scrollend', correggi, { once: true });
  }

  const misuratore = typeof finestra.ResizeObserver === 'function' ? new finestra.ResizeObserver(() => misura()) : null;

  function misura() {
    const turno = corrente;
    if (!turno?.isConnected) return;
    conteggi.misure += 1;
    const messaggio = turno.querySelector(':scope > .talos-message--user');
    const bolla = messaggio?.querySelector(':scope > .talos-message__body');
    /* una domanda di sole immagini nasconde la bolla (`disegnaChipAllegati`): la fascia prende la galleria, tagliata uguale */
    const corpo = (bolla && !bolla.hidden) ? bolla : (turno.querySelector('.talos-image-gallery, .talos-allegati-chip') || bolla);
    if (!corpo) return;
    const rTurno = turno.getBoundingClientRect();
    const rCorpo = corpo.getBoundingClientRect();
    const stile = finestra.getComputedStyle(corpo);
    const riga = corpo.querySelector('p, pre') || corpo;
    const stileRiga = finestra.getComputedStyle(riga);
    const rigaPx = parseFloat(stileRiga.lineHeight) || 1.6 * (parseFloat(stileRiga.fontSize) || 16);
    const n = (v) => parseFloat(v) || 0;
    const { vista, corpo: altoCorpo, lunga } = misuraFascia({
      altoTurno: rTurno.top, altoCorpo: rCorpo.top, altezzaCorpo: rCorpo.height, rigaPx,
      bordoAlto: n(stile.borderTopWidth), bordoBasso: n(stile.borderBottomWidth), paddingAlto: n(stile.paddingTop), paddingBasso: n(stile.paddingBottom),
    });
    turno.style.setProperty('--talos-domanda-vista', `${vista}px`);
    segnaRisposta(turno, vista);
    /*
     * WCAG 2.2 SC 2.4.11 «Focus Not Obscured» e i salti nella chat (cronologia, «scrollIntoView»): lo scorrevole riserva in alto
     *   l'altezza della fascia (`scroll-padding-top`), così il browser porta SOTTO la domanda ferma ciò che riceve il fuoco o viene
     *   portato in vista (OUTPUT20-NARROW a 390 px: la tendina dell'uscita restava sotto la fascia).
     * ⛔ `index.css:1045-1048` (23/10) aveva escluso `scroll-padding-top` perché la barra ferma del codice cadeva DENTRO la fascia
     *   riservata e il suo fuoco faceva saltare la chat: qui la barra si ferma sotto la fascia (`segnaRisposta`), cioè sul bordo della
     *   riserva, e BLOCCHI-BARRA-01 lo prova (nessuno scorrimento al fuoco su «⋯» e «Copia»). La proprietà VERA e non una
     *   variabile: non si eredita (una variabile sullo scorrevole ricalcolava lo stile di tutta la chat, BOLLE-12).
     * Esiste solo mentre c'è una domanda corrente; senza, lo scorrevole è com'era.
     */
    scorrevole.style.scrollPaddingTop = `${Math.max(0, vista + spostamentoFermo())}px`;
    osservaSopra(Math.max(0, vista + spostamentoFermo()));
    turno.style.setProperty('--talos-domanda-corpo', `${altoCorpo}px`);
    if (messaggio) {
      const rMessaggio = messaggio.getBoundingClientRect();
      turno.style.setProperty('--talos-domanda-larghezza', `${Math.round(rMessaggio.width)}px`);
      /* dove va «Domanda intera» quando la domanda si legge intera (foto della candidata sul 4174, 28/10/2026: restava sulla quarta
         riga e copriva due parole): il bordo sinistro della bolla e il centro della riga delle azioni, misurati nel messaggio. Lo
         stile li usa solo col taglio alzato (`domanda-appiccicata.css`) */
      turno.style.setProperty('--talos-domanda-bolla-sinistra', `${Math.max(0, Math.round(rCorpo.left - rMessaggio.left))}px`);
      const azioni = messaggio.querySelector(':scope > .talos-message__actions');
      const rAzioni = azioni?.getBoundingClientRect();
      if (rAzioni && rAzioni.height > 0) turno.style.setProperty('--talos-domanda-azioni-centro', `${Math.round(rAzioni.top - rMessaggio.top + rAzioni.height / 2)}px`);
      else turno.style.removeProperty('--talos-domanda-azioni-centro');
    }
    corpo.classList.add('talos-domanda-corpo');
    if (lunga) turno.dataset.domandaLunga = 'si'; else delete turno.dataset.domandaLunga;
    /* nel messaggio, ancorato al bordo destro della bolla (che è il bordo destro del messaggio: `index.css:662`, `margin-left:auto`) */
    if (lunga && messaggio && pulsante.parentElement !== messaggio) {
      /* staccato, il pulsante non riceve il ridisegno al cambio lingua (`applicaLingua` passa solo ciò che è nel documento):
         le parole si rileggono qui, a ogni aggancio */
      etichetta.textContent = t('chat.message.wholeQuestion');
      pulsante.setAttribute('aria-label', t('chat.message.wholeQuestionLabel')); pulsante.title = t('chat.message.wholeQuestionLabel');
      messaggio.append(pulsante);
    }
    if (!lunga && pulsante.parentElement) pulsante.remove();
  }

  /*
   * ⛔ Le barre ferme dei blocchi di codice (`index.css:1300-1309`, `position:sticky; top:-8px`, owner 23/10 «come ChatGPT e
   *   Claude») si fermavano in cima alla chat, cioè DIETRO la fascia della domanda: «Copia» e «⋯» spariti, e il fuoco col Tab sul
   *   «⋯» faceva scorrere la chat (BLOCCHI-BARRA-01, misurato: 6194 → 162). Si fermano SOTTO la fascia: la sua altezza va nella
   *   variabile `--talos-domanda-fascia` dei soli turni della risposta (i fratelli fino alla domanda dopo — una variabile sullo
   *   scorrevole si erediterebbe da tutta la conversazione, il costo misurato da BOLLE-12).
   */
  let segnati = [];
  function segnaRisposta(turno, vista) {
    const valore = `${Math.max(0, vista + spostamentoFermo())}px`;
    const nuovi = [];
    for (let n = turno?.nextElementSibling; n && !eDomanda(n); n = n.nextElementSibling) nuovi.push(n);
    for (const n of segnati) if (!nuovi.includes(n)) n.style.removeProperty('--talos-domanda-fascia');
    for (const n of nuovi) if (n.style.getPropertyValue('--talos-domanda-fascia') !== valore) n.style.setProperty('--talos-domanda-fascia', valore);
    segnati = nuovi;
  }
  /** Di quanto la testa della domanda ferma sta sopra il bordo alto dello scorrevole: padding alto + `--talos-domanda-cima` (−12 px). */
  let spostamento = null;
  function spostamentoFermo() {
    if (spostamento === null) {
      const cima = parseFloat(finestra.getComputedStyle(colonna).getPropertyValue('--talos-domanda-cima')) || 0;
      spostamento = (parseFloat(finestra.getComputedStyle(scorrevole).paddingTop) || 0) + cima;
    }
    return spostamento;
  }

  /*
   * Owner 28/10/2026 (revisione del blocco 12, BOLLE-REV-01, «Fondo solo quando serve»): la domanda SUCCESSIVA aveva sempre il fondo
   *   pieno del tema, largo quanto la colonna (768 px dietro una bolla di 345), e con la scena animata accesa la tagliava in un
   *   rettangolo anche mentre scorreva al suo posto senza coprire niente. Il fondo serve solo nel passaggio di consegne, quando la sua
   *   testa entra nella fascia della domanda ferma («TU · ora» stampato sopra il testo di quella): `data-domanda-sopra`.
   *   Un terzo osservatore, sulla sola successiva, con la radice ridotta alla fascia: si sveglia quando entra o esce, mai a ogni
   *   fotogramma, come gli altri due.
   */
  let osservatoreSopra = null;
  let fasciaSopra = -1;
  let altezzaSopra = -1;
  function osservaSopra(fascia) {
    if (!corrente || !successiva || fascia <= 0) {
      osservatoreSopra?.disconnect();
      if (successiva) delete successiva.dataset.domandaSopra;
      return;
    }
    const intera = Math.round(fascia);
    if (!osservatoreSopra || intera !== fasciaSopra || scorrevole.clientHeight !== altezzaSopra) {
      osservatoreSopra?.disconnect();
      fasciaSopra = intera; altezzaSopra = scorrevole.clientHeight;
      osservatoreSopra = new finestra.IntersectionObserver((voci) => {
        for (const voce of voci) {
          if (voce.target !== successiva) continue;
          if (voce.isIntersecting) successiva.dataset.domandaSopra = 'si'; else delete successiva.dataset.domandaSopra;
        }
      }, { root: scorrevole, rootMargin: `0px 0px ${-Math.max(0, altezzaSopra - fasciaSopra)}px 0px`, threshold: 0 });
    } else osservatoreSopra.disconnect();
    osservatoreSopra.observe(successiva);
  }

  function lascia(turno) {
    if (!turno) return;
    for (const n of segnati) n.style.removeProperty('--talos-domanda-fascia');
    segnati = [];
    scorrevole.style.removeProperty('scroll-padding-top');
    delete turno.dataset.domandaCorrente; delete turno.dataset.domandaLunga;
    turno.style.removeProperty('--talos-domanda-vista'); turno.style.removeProperty('--talos-domanda-corpo'); turno.style.removeProperty('--talos-domanda-larghezza');
    turno.style.removeProperty('--talos-domanda-bolla-sinistra'); turno.style.removeProperty('--talos-domanda-azioni-centro');
    for (const c of turno.querySelectorAll('.talos-domanda-corpo')) c.classList.remove('talos-domanda-corpo');
    misuratore?.unobserve(turno);
  }

  function imposta(nuova) {
    const nuovaSuccessiva = nuova ? domandaSuccessiva(nuova) : null;
    if (nuova === corrente && nuovaSuccessiva === successiva) return;
    if (nuova !== corrente) {
      conteggi.cambi += 1;
      lascia(corrente);
      if (pulsante.parentElement) pulsante.remove();
      corrente = nuova;
      if (corrente) { corrente.dataset.domandaCorrente = 'si'; misuratore?.observe(corrente); if (!misuratore) misura(); }
    }
    if (successiva && successiva !== nuovaSuccessiva) { delete successiva.dataset.domandaSuccessiva; delete successiva.dataset.domandaSopra; }
    successiva = nuovaSuccessiva;
    if (successiva) successiva.dataset.domandaSuccessiva = 'si';
    if (fasciaSopra > 0 || !successiva) osservaSopra(corrente ? fasciaSopra : 0);
    osserva();
  }

  /** La radice dell'osservatore è la riga in cima: sopra di lei un margine enorme, sotto tutta l'altezza tolta. */
  function creaOsservatore() {
    osservatore?.disconnect();
    altezzaRadice = scorrevole.clientHeight;
    const sotto = Math.max(0, altezzaRadice - RIGA_IN_CIMA);
    osservatore = new finestra.IntersectionObserver(() => { if (collegata) programma(); }, { root: scorrevole, rootMargin: `100000px 0px ${-sotto}px 0px`, threshold: 0 });
  }

  function osserva() {
    daOsservare = false;
    if (!osservatore) return;
    osservatore.disconnect();
    if (corrente?.isConnected) osservatore.observe(corrente);
    if (successiva?.isConnected) osservatore.observe(successiva);
    if (!corrente) { const prima = [...colonna.children].find(eDomanda); if (prima) osservatore.observe(prima); }
  }

  function ricalcola() {
    fotogramma = 0;
    if (!collegata) return;
    ultimoRicalcolo = finestra.performance.now();
    /* la cronologia che si costruisce nascosta (`#conversation.is-restoring`, index.css:512) non si misura: si aspetta la fine */
    if (colonna.classList.contains('is-restoring')) return;
    /* l'altezza della vista è cambiata (finestra, compositore, pannelli): la radice dell'osservatore si rifà, e va RI-OSSERVATA —
       un osservatore nuovo non guarda niente, e senza questa riga la domanda corrente restava ferma per sempre (BOLLE-02) */
    if (scorrevole.clientHeight !== altezzaRadice) { creaOsservatore(); daOsservare = true; }
    conteggi.ricalcoli += 1;
    const domande = [];
    for (const figlio of colonna.children) if (eDomanda(figlio)) domande.push(figlio);
    const riga = scorrevole.getBoundingClientRect().top + RIGA_IN_CIMA;
    /* Il riquadro DIPINTO basta anche per la domanda appiccicata: per un elemento fermo in alto `top = max(flusso, soglia)`, e la
       soglia (`--talos-domanda-cima`, sopra il bordo) sta sopra la riga ⇒ «testa ≤ riga» vale per il riquadro esattamente quando
       vale per il flusso. (Una lettura «dal flusso» provata con la mutazione M4: nessuna prova cambia esito — era un mutante
       equivalente, dimostrato qui, e la funzione è stata tolta.) */
    let i = indiceDomandaCorrente(domande.length, (k) => domande[k].getBoundingClientRect().top, riga);
    /*
     * ⛔ Gli allegati (galleria delle immagini, chip dei file) sono figli del turno della persona, sotto la bolla: ferma la domanda,
     *   si fermerebbero con lei sopra la risposta, e la fascia li nasconde. Ma appena la domanda sale di qualche pixel il loro posto
     *   nel FLUSSO è ancora a schermo: l'immagine appena mandata spariva sotto gli occhi (IMAGE-08: «element is not visible»). Hermes
     *   li tiene FUORI dal contenitore appiccicato (`user-message.tsx:478-483`), qui sono dentro. ⇒ Una domanda con allegati diventa
     *   corrente solo quando il loro fondo è passato sopra la riga: fino ad allora resta al suo posto e scorre come oggi.
     */
    const codaPendente = i >= 0 && domande[i] !== corrente ? codaAllegati(domande[i]) : null;
    attesaCoda(codaPendente && codaPendente.getBoundingClientRect().bottom > riga ? codaPendente : null);
    if (codaPendente && codaPendente.getBoundingClientRect().bottom > riga) i -= 1;
    imposta(i >= 0 ? domande[i] : null);
    if (daOsservare) osserva();
  }

  /** L'ultimo allegato visibile del turno della persona (figli diretti: `disegnaChipAllegati` li appende al turno). */
  function codaAllegati(turno) {
    const allegati = [...turno.children].filter((f) => !f.hidden && (f.classList.contains('talos-image-gallery') || f.classList.contains('talos-allegati-chip')));
    return allegati.at(-1) || null;
  }
  /* un secondo osservatore, con la radice SOTTO la riga: dice quando il fondo degli allegati la passa (un elemento solo) */
  let osservatoreCoda = null;
  let codaOsservata = null;
  function attesaCoda(coda) {
    if (coda === codaOsservata) return;
    osservatoreCoda?.disconnect();
    codaOsservata = coda;
    if (!coda) return;
    osservatoreCoda ??= new finestra.IntersectionObserver(() => { if (collegata) programma(); }, { root: scorrevole, rootMargin: `${-RIGA_IN_CIMA}px 0px 100000px 0px`, threshold: 0 });
    osservatoreCoda.observe(coda);
  }

  /*
   * Owner 28/10/2026 (revisione del blocco 12, BOLLE-REV-03, «Accetta con la cura»): a 1000 turni nello scorrimento veloce si
   *   attraversa una domanda quasi a ogni fotogramma (722 cambi su 1500), e ogni ricalcolo legge i riquadri dei turni: +15% di
   *   fotogramma in mediana, +21% al 95°. ⇒ Al più un ricalcolo ogni `RICALCOLO_MINIMO_MS`, più uno a scorrimento finito
   *   (`scrollend`): durante una corsa veloce la domanda ferma può restare quella di un attimo prima, poi si rimette.
   */
  let ultimoRicalcolo = 0;
  let rinvio = 0;
  function programma() {
    if (fotogramma || rinvio || !collegata) return;
    const attesa = RICALCOLO_MINIMO_MS - (finestra.performance.now() - ultimoRicalcolo);
    if (attesa <= 0) { fotogramma = finestra.requestAnimationFrame(ricalcola); return; }
    rinvio = finestra.setTimeout(() => { rinvio = 0; if (collegata && !fotogramma) fotogramma = finestra.requestAnimationFrame(ricalcola); }, attesa);
  }
  const allaFine = () => {
    if (!collegata) return;
    if (rinvio) { finestra.clearTimeout(rinvio); rinvio = 0; }
    if (!fotogramma) fotogramma = finestra.requestAnimationFrame(ricalcola);
  };
  scorrevole.addEventListener('scrollend', allaFine);


  const mutazioni = new finestra.MutationObserver((lotto) => {
    if (!collegata) return;
    for (const m of lotto) {
      /* ⛔ figli nuovi o tolti: i due bersagli dell'osservatore si riscelgono SEMPRE al ricalcolo. Senza, dopo una ricostruzione
         (cambio lingua, cambio chat, chat pronta rimessa) la corrente e la successiva erano già nulle, `imposta` non cambiava niente
         e l'osservatore restava su nodi STACCATI: nessuna domanda si fermava più (BOLLE-14, misurato). */
      if (m.type === 'childList') daOsservare = true;
      for (const nodo of m.removedNodes || []) {
        if (nodo === corrente) { lascia(corrente); corrente = null; if (pulsante.parentElement) pulsante.remove(); }
        if (nodo === successiva) { delete successiva.dataset.domandaSuccessiva; successiva = null; }
      }
    }
    programma();
  });
  mutazioni.observe(colonna, { childList: true, attributes: true, attributeFilter: ['class'] });
  const dimensioni = typeof finestra.ResizeObserver === 'function' ? new finestra.ResizeObserver(() => programma()) : null;
  dimensioni?.observe(scorrevole);
  creaOsservatore();
  programma();

  return {
    scollega() {
      if (!collegata) return;
      collegata = false;
      finestra.cancelAnimationFrame(fotogramma);
      if (rinvio) { finestra.clearTimeout(rinvio); rinvio = 0; }
      scorrevole.removeEventListener('scrollend', allaFine);
      osservatore?.disconnect(); osservatoreCoda?.disconnect(); osservatoreSopra?.disconnect(); mutazioni.disconnect(); dimensioni?.disconnect(); misuratore?.disconnect();
      lascia(corrente); if (successiva) { delete successiva.dataset.domandaSuccessiva; delete successiva.dataset.domandaSopra; }
      corrente = null; successiva = null; pulsante.remove();
      delete colonna.dataset.domandaCollegata;
    },
    ricalcola,
    corrente: () => corrente,
    conteggi: () => ({ ...conteggi }),
    vaiAllaDomanda,
  };
}
