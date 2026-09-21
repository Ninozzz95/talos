/*
 * La VISTA VIVA del Browser (M5, 07/09/2026) — lo schermo di un Chromium vero, trasmesso dentro la
 * pagina di TALOS e dipinto su un canvas.
 *
 * Perché esiste: la cornice `<iframe>` non regge i siti che la vietano (misurato: su github
 * X-Frame-Options lascia un rettangolo grigio, e il ripiego non scattava perché Chrome carica
 * DENTRO la cornice la propria pagina d'errore e spara un `load` regolare). Il ripiego approvato è
 * un Chromium di sistema con profilo separato, pilotato via CDP, che ci manda i suoi fotogrammi:
 * `Page.startScreencast` li emette dal compositor invece di serializzare il DOM a ogni scatto.
 *
 * ⛔ La pagina di terzi è SEMPRE contenuto non affidabile. Qui dentro non arriva mai HTML di quella
 * pagina: arrivano PIXEL (JPEG in base64) e NUMERI (i metadati del fotogramma). Un canvas non
 * esegue niente di ciò che disegna — è per questo che la vista viva è più sicura di una cornice.
 *
 * Questo modulo è AUTONOMO: non tocca `components/browser.js`, non conosce il trasporto (WebSocket,
 * SSE o altro) e non parla con il server. Riceve fotogrammi con `frame()`, restituisce gesti con
 * `onGesto`. Chi lo innesta decide come farli viaggiare — e, se il trasporto è CDP diretto, deve
 * anche rispondere `Page.screencastFrameAck` per ogni fotogramma, altrimenti lo stream si ferma
 * (chromedevtools.github.io/devtools-protocol/tot/Page — letto il 07/09/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * LA MISURA CHE HA DECISO COME SI DIPINGE (ricerca 07/09/2026, citata: non è una misura nostra)
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * Due strade per portare un JPEG in base64 sul canvas:
 *   (a) `new Image()` con `src = "data:image/jpeg;base64,…"`;
 *   (b) `createImageBitmap(new Blob([bytes]))`.
 * La (b) è la più economica delle due, per tre ragioni misurate da chi le ha confrontate:
 *   · con un Blob la decodifica va su un thread separato; con un HTMLImageElement «no separate
 *     process is spawned and decoding takes significantly longer» (m9dfukc/createImageBitmap-
 *     performance, letto il 07/09/2026);
 *   · il data URL obbliga a tenere il base64 (≈ +33% di byte) e a farlo interpretare al thread
 *     principale, mentre `createImageBitmap` non ha bisogno di passare per il base64
 *     (cornerstoneWADOImageLoader#343, letto il 07/09/2026);
 *   · numeri riportati sul campo: da **50 ms a 20 ms per immagine, −60%**, passando a ImageBitmap
 *     (lookscanned.io/en/blog/boost-performance-with-imagebitmap, letto il 07/09/2026).
 * ⛔ Quei 50→20 ms NON sono misurati da noi su questa app: sono la misura di un altro, citata. Il
 *    banco locale (stesso fotogramma, stesso schermo, i due percorsi a confronto) resta da fare.
 * ⇒ Si usa (b) quando il browser offre `createImageBitmap`, (a) come ripiego; e in entrambi i casi
 *   si chiama `close()` sul risultato, perché un ImageBitmap trattiene risorse grafiche finché non
 *   viene chiuso (MDN, ImageBitmap.close(), letto il 07/09/2026) — con 30-60 fotogrammi al secondo
 *   una perdita così si vede in pochi minuti.
 *
 * I FOTOGRAMMI ARRIVANO PIÙ IN FRETTA DI QUANTO LO SCHERMO LI MOSTRI. Non si accodano: si tiene
 * solo l'ULTIMO e si dipinge una volta per fotogramma di schermo (`requestAnimationFrame`). È la
 * stessa regola dei banchi di streaming seri — «the server holds only the newest frame … every
 * frame produced while an earlier one is still being written is skipped instead of queued»
 * (agent-browser.dev/streaming, letto il 07/09/2026). Quelli saltati si CONTANO (`misura().scartati`):
 * un fotogramma buttato in silenzio è una misura che non esiste.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * IL CSS CHE MI SERVE — lo porta nel mockup chi ha il mockup (io non lo tocco). Classi
 * `talos-vistaviva__*`, da incollare nel foglio insieme alle altre superfici del Browser:
 *
 *   .talos-vistaviva { position: relative; display: flex; flex-direction: column; min-height: 0;
 *     border-radius: 10px; overflow: hidden; background: var(--surface-3, #0b0d10); }
 *   .talos-vistaviva__schermo { display: block; margin: auto; width: auto; height: auto;
 *     max-width: 100%; max-height: 100%; background: var(--surface-3, #0b0d10); touch-action: none; }
 *   .talos-vistaviva__schermo:focus { outline: none; }
 *   .talos-vistaviva__schermo:focus-visible { outline: 2px solid var(--accent, #7aa2f7);
 *     outline-offset: -2px; }
 *   .talos-vistaviva--fuoco { box-shadow: inset 0 0 0 2px var(--accent, #7aa2f7); }
 *   .talos-vistaviva__velo { position: absolute; inset: 0; display: grid; place-items: center;
 *     padding: 16px; text-align: center; color: var(--text-2, #9aa4b2);
 *     background: color-mix(in srgb, var(--surface-2, #14161a) 82%, transparent);
 *     transition: opacity 180ms ease; }
 *   .talos-vistaviva__velo[hidden] { display: none; }
 *   .talos-vistaviva__stato { margin: 0; padding: 6px 10px; font-size: 12px;
 *     color: var(--text-2, #9aa4b2); }
 *   .talos-vistaviva__stato[data-stato="errore"] { color: var(--danger, #f7768e); }
 *   @media (prefers-reduced-motion: reduce) { .talos-vistaviva__velo { transition: none; } }
 *   .talos-vistaviva--senza-moto .talos-vistaviva__velo { transition: none; }
 *
 * L'ultima riga esiste perché la preferenza si rispetta anche quando la transizione la deciderebbe
 * il JavaScript: la classe la mettiamo noi leggendo `matchMedia('(prefers-reduced-motion: reduce)')`,
 * il `@media` copre il CSS. Due strade per la stessa promessa, nessuna delle due da sola basta.
 *
 * ⛔⛔ LA RIGA DEL CANVAS NON SI SEMPLIFICA, ed è aritmetica, non gusto. Con `width: auto` e
 * `height: auto` più i due massimi, un elemento sostituito si rimpicciolisce MANTENENDO le sue
 * proporzioni (CSS 2.1 §10.4, la tabella delle violazioni di vincolo — riletta il 07/09/2026),
 * quindi il riquadro del canvas È il riquadro dell'immagine disegnata: `getBoundingClientRect()`
 * misura pixel di pagina, e `gestoDaEvento` può ricavare lo zoom dalla sola larghezza.
 * ⛔ Con `width: 100%` + `max-height` l'immagine si SCHIACCIA; con `object-fit: contain` compaiono
 * due bande nere DENTRO il riquadro, e allora il riquadro non è più l'immagine: ogni clic
 * scivolerebbe di quanto misura la banda, in silenzio, e nessun test lo vedrebbe. Il letterbox lo
 * fa il contenitore (`margin: auto` dentro il flex), mai il canvas.
 */

import { t } from './lingua.js';

/** Gli unici stati che questa vista sa dire. Fuori da qui non si inventa niente. */
export const STATI = Object.freeze(['apro', 'carico', 'fermo', 'errore', 'pronto']);

export const CLASSE = 'talos-vistaviva';

/**
 * Il testo di uno stato, in italiano. Uno stato che non conosciamo NON diventa «pronto» né una
 * frase inventata: si dice che non lo sappiamo, che è l'unica cosa vera che si può dire.
 */
export function testoStato(nome) {
  switch (nome) {
    case 'apro': return t('Apro il browser…');
    case 'carico': return t('Carico la pagina…');
    case 'pronto': return t('Pagina viva');
    case 'fermo': return t('Trasmissione ferma');
    case 'errore': return t('Il browser non risponde');
    default: return t('Stato sconosciuto');
  }
}

const TIPI_GESTO = Object.freeze({
  pointerdown: 'giu', mousedown: 'giu',
  pointerup: 'su', mouseup: 'su',
  pointermove: 'muovi', mousemove: 'muovi',
  wheel: 'rotella',
  keydown: 'tastoGiu', keyup: 'tastoSu',
});

const PULSANTI = Object.freeze(['sinistro', 'centrale', 'destro']);

/**
 * Quali tasti si inoltrano alla pagina remota e quali no.
 *
 * ⛔ Escape e Tab NON si prendono mai: chi entra con la tastiera deve poter uscire con la tastiera
 * (WCAG 2.1.2 «No Keyboard Trap», livello A — riletto il 07/09/2026: «if keyboard focus can be
 * moved to a component … then focus can be moved away from that component using only a keyboard
 * interface»). Un canvas che si mangia il Tab è una trappola, per quanto comodo sembri.
 *
 * ⛔ E non si rubano le scorciatoie della app: qualunque combinazione con Ctrl o ⌘ passa oltre,
 * intatta, e la gestisce TALOS (il registro sta in `components/scorciatoie.js`). È un compromesso
 * dichiarato, non una svista: dentro la pagina remota Ctrl+C non arriverà. Il giorno in cui servirà
 * un'eccezione, l'eccezione va scritta QUI e in una riga sola, non sparsa fra i chiamanti.
 */
export function tastoInoltrabile(evento) {
  const tasto = evento?.key;
  if (typeof tasto !== 'string' || tasto === '') return false;
  if (tasto === 'Escape' || tasto === 'Tab') return false;
  if (evento.ctrlKey === true || evento.metaKey === true) return false;
  return true;
}

function modificatori(evento) {
  return {
    alt: evento?.altKey === true,
    ctrl: evento?.ctrlKey === true,
    meta: evento?.metaKey === true,
    shift: evento?.shiftKey === true,
  };
}

/** Il carattere che la pagina remota deve ricevere; per i tasti «di comando» non c'è testo. */
function testoDaTasto(evento) {
  const tasto = evento?.key;
  if (typeof tasto !== 'string') return '';
  return [...tasto].length === 1 ? tasto : '';
}

/**
 * Traduce un evento del mouse/della tastiera sul canvas in un GESTO per la pagina remota.
 *
 * ⛔ Non escono MAI coordinate del canvas: escono coordinate della pagina. Sono due paia, e servono
 * tutte e due, perché chi le riceve fa due cose diverse (Chrome DevTools, `ScreencastView.ts`,
 * letto il 07/09/2026 — è la sua stessa aritmetica):
 *   · `xVista`/`yVista` — CSS px rispetto al viewport visibile del frame principale: è ESATTAMENTE
 *     ciò che vuole `Input.dispatchMouseEvent` («X coordinate of the event relative to the main
 *     frame's viewport in CSS pixels», CDP dominio Input, letto il 07/09/2026);
 *   · `x`/`y` — coordinate nel DOCUMENTO, cioè con lo zoom della pagina sciolto e lo scorrimento
 *     rimesso: è ciò che vuole chi cerca un ELEMENTO (`DOM.getNodeForLocation`), e quindi il nostro
 *     overlay di annotazione.
 * L'aritmetica, nell'ordine: zoom = larghezza a schermo ÷ `deviceWidth` (il fotogramma è in DIP,
 * mai in pixel dell'immagine: il JPEG può arrivare rimpicciolito da `maxWidth` e i pixel del file
 * non sono un'unità di misura della pagina); poi `offsetTop` si sottrae, perché è lo spazio che
 * lasciamo sopra all'immagine quando la disegniamo; poi si divide per `pageScaleFactor` e si somma
 * lo scorrimento.
 *
 * ⛔ LA METÀ AL CONTRARIO: senza metadati non si inventa un gesto. Nessun fotogramma ancora
 * dipinto, `deviceWidth` a zero, o un canvas largo zero (scheda nascosta) ⇒ `null`, non un clic a
 * (0,0). Un clic inventato sulla pagina di qualcun altro è peggio di un clic perso.
 * I tasti fanno eccezione, e per una ragione precisa: non portano coordinate, quindi non c'è niente
 * da inventare.
 */
export function gestoDaEvento(evento, { rettangolo, metadatiUltimoFrame } = {}) {
  const tipo = TIPI_GESTO[evento?.type];
  if (!tipo) return null;
  const tasti = modificatori(evento);

  if (tipo === 'tastoGiu' || tipo === 'tastoSu') {
    if (!tastoInoltrabile(evento)) return null;
    return { tipo, tasto: evento.key, codice: typeof evento.code === 'string' ? evento.code : '', testo: testoDaTasto(evento), tasti };
  }

  const larghezzaVista = Number(rettangolo?.width) || 0;
  const dip = Number(metadatiUltimoFrame?.deviceWidth) || 0;
  if (larghezzaVista <= 0 || dip <= 0) return null;

  const zoom = larghezzaVista / dip;
  const scalaPagina = Number(metadatiUltimoFrame.pageScaleFactor) > 0 ? Number(metadatiUltimoFrame.pageScaleFactor) : 1;
  const alto = Number(metadatiUltimoFrame.offsetTop) || 0;
  const scorrimentoX = Number(metadatiUltimoFrame.scrollOffsetX) || 0;
  const scorrimentoY = Number(metadatiUltimoFrame.scrollOffsetY) || 0;
  const altezzaDip = Number(metadatiUltimoFrame.deviceHeight) || 0;

  const xVista = (Number(evento.clientX) || 0) - (Number(rettangolo.left) || 0);
  const yVista = (Number(evento.clientY) || 0) - (Number(rettangolo.top) || 0);
  const xSchermo = xVista / zoom;
  const ySchermo = yVista / zoom - alto;

  const gesto = {
    tipo,
    xVista: Math.round(xSchermo),
    yVista: Math.round(ySchermo),
    x: Math.round(xSchermo / scalaPagina + scorrimentoX),
    y: Math.round(ySchermo / scalaPagina + scorrimentoY),
    dentro: xSchermo >= 0 && ySchermo >= 0 && xSchermo <= dip && (altezzaDip <= 0 || ySchermo <= altezzaDip),
    pulsante: PULSANTI[Number(evento.button) || 0] || 'sinistro',
    clic: Number(evento.detail) > 0 ? Number(evento.detail) : 1,
    tasti,
  };
  if (tipo === 'rotella') {
    // I delta viaggiano com'erano: `Input.dispatchMouseEvent` di tipo mouseWheel li vuole in CSS px
    // della pagina, e la rotella non passa per lo zoom della vista.
    gesto.deltaX = Number(evento.deltaX) || 0;
    gesto.deltaY = Number(evento.deltaY) || 0;
  }
  return gesto;
}

/** I byte veri di un base64, senza passare per una stringa data: (serve al percorso Blob). */
function bytesDaBase64(base64, finestra) {
  const grezzo = finestra.atob(base64);
  const bytes = new Uint8Array(grezzo.length);
  for (let i = 0; i < grezzo.length; i += 1) bytes[i] = grezzo.charCodeAt(i);
  return bytes;
}

/**
 * Sceglie il decodificatore una volta sola, all'avvio, e dichiara quale ha scelto (`viaBitmap`):
 * uno strumento che non dice quale strada ha preso non si può misurare.
 */
export function creaDecodificatore(finestra, documento) {
  const haBitmap = typeof finestra?.createImageBitmap === 'function' && typeof finestra?.atob === 'function' && typeof finestra?.Blob === 'function';
  if (haBitmap) {
    return {
      viaBitmap: true,
      async decodifica(base64) {
        const blob = new finestra.Blob([bytesDaBase64(base64, finestra)], { type: 'image/jpeg' });
        return finestra.createImageBitmap(blob);
      },
    };
  }
  return {
    viaBitmap: false,
    decodifica(base64) {
      return new Promise((risolvi, rifiuta) => {
        const immagine = documento.createElement('img');
        immagine.decoding = 'async';
        immagine.onload = () => risolvi(immagine);
        immagine.onerror = () => rifiuta(new Error('fotogramma non decodificabile'));
        immagine.src = `data:image/jpeg;base64,${base64}`;
      });
    },
  };
}

/**
 * Monta la vista viva dentro `contenitore`.
 *
 * `finestra` e `documento` si iniettano per la stessa ragione per cui li iniettano gli altri
 * componenti di questa cartella: le prove unitarie di questo repo non caricano un DOM, e una vista
 * che si può montare su un documento finto è una vista che si può misurare.
 */
export function creaVistaViva(contenitore, { onGesto, onErrore, documento = globalThis.document, finestra = globalThis } = {}) {
  if (!contenitore) throw new Error('creaVistaViva: manca il contenitore');
  const doc = documento;
  const chiediFotogramma = typeof finestra?.requestAnimationFrame === 'function'
    ? (mano) => finestra.requestAnimationFrame(mano)
    : (mano) => setTimeout(mano, 16);
  const annullaFotogramma = typeof finestra?.cancelAnimationFrame === 'function'
    ? (id) => finestra.cancelAnimationFrame(id)
    : (id) => clearTimeout(id);
  const senzaMoto = finestra?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
  const { decodifica, viaBitmap } = creaDecodificatore(finestra, doc);

  const radice = doc.createElement('div');
  radice.className = senzaMoto ? `${CLASSE} ${CLASSE}--senza-moto` : CLASSE;
  radice.dataset.stato = 'apro';

  const tela = doc.createElement('canvas');
  tela.className = `${CLASSE}__schermo`;
  // ⛔ `tabindex="0"` da solo rende il canvas raggiungibile col Tab ma NON gli dà un nome né un
  // ruolo: senza role/aria-label un lettore di schermo annuncia un riquadro muto. `application`
  // è il ruolo dei terminali remoti (è la famiglia di noVNC e Guacamole): dice all'ausilio che i
  // tasti li gestisce la pagina. Il prezzo è che l'uscita deve restare garantita — e infatti
  // Escape e Tab non si prendono mai (vedi `tastoInoltrabile`).
  tela.setAttribute('tabindex', '0');
  tela.setAttribute('role', 'application');
  tela.setAttribute('aria-label', t('Pagina viva'));

  const velo = doc.createElement('div');
  velo.className = `${CLASSE}__velo`;

  const etichetta = doc.createElement('p');
  etichetta.className = `${CLASSE}__stato`;
  // role="status" implica già aria-live="polite": dichiararli tutti e due è rumore, non zelo.
  etichetta.setAttribute('role', 'status');

  radice.append(tela, velo, etichetta);
  contenitore.replaceChildren(radice);

  const ascolti = [];
  const ascolta = (nodo, tipo, mano, opzioni) => {
    nodo.addEventListener(tipo, mano, opzioni);
    ascolti.push([nodo, tipo, mano, opzioni]);
  };

  let corrente = 'apro';
  let attesa = null;          // l'ULTIMO fotogramma arrivato e non ancora dipinto
  let prenotato = null;       // l'id del requestAnimationFrame in volo
  let inCoda = false;
  let distrutto = false;
  let metadatiDipinti = null; // i metadati di ciò che si VEDE, non di ciò che è arrivato
  let ricevuti = 0;
  let dipinti = 0;
  let scartati = 0;

  function segnala(motivo, dettaglio) {
    try { onErrore?.({ motivo, dettaglio: dettaglio ? String(dettaglio.message || dettaglio) : '' }); } catch { /* chi ascolta non deve poter fermare la vista */ }
  }

  function applicaStato(nome, dettaglio = '') {
    if (!STATI.includes(nome)) return corrente;
    // ⛔ «pronto» non si dichiara prima di aver dipinto qualcosa: lo stato dice ciò che si VEDE.
    const vero = nome === 'pronto' && dipinti === 0 ? 'carico' : nome;
    corrente = vero;
    const testo = dettaglio ? `${testoStato(vero)} — ${dettaglio}` : testoStato(vero);
    radice.dataset.stato = vero;
    etichetta.dataset.stato = vero;
    etichetta.textContent = testo;
    velo.textContent = vero === 'pronto' ? '' : testo;
    velo.hidden = vero === 'pronto';
    tela.setAttribute('aria-label', `${t('Pagina viva')} — ${testo}`);
    return corrente;
  }

  function disegna(immagine, metadati) {
    const larghezza = Number(immagine?.naturalWidth) || Number(immagine?.width) || 0;
    const altezza = Number(immagine?.naturalHeight) || Number(immagine?.height) || 0;
    if (larghezza <= 0 || altezza <= 0) { segnala('fotogramma-senza-misura'); return false; }
    const dip = Number(metadati?.deviceWidth) > 0 ? Number(metadati.deviceWidth) : larghezza;
    const rapporto = dip > 0 ? larghezza / dip : 1; // pixel dell'immagine per ogni DIP della pagina
    const alto = Math.round(Math.max(0, Number(metadati?.offsetTop) || 0) * rapporto);
    // ⛔ Riassegnare width/height AZZERA il contesto 2D e ributta via la superficie: si tocca solo
    // quando cambia davvero, altrimenti a 60 fotogrammi al secondo si ricrea la tela 60 volte.
    if (tela.width !== larghezza) tela.width = larghezza;
    if (tela.height !== altezza + alto) tela.height = altezza + alto;
    const contesto = tela.getContext('2d');
    if (!contesto) { segnala('canvas-senza-contesto'); return false; }
    contesto.drawImage(immagine, 0, alto);
    dipinti += 1;
    metadatiDipinti = { ...(metadati || {}), larghezzaImmagine: larghezza, altezzaImmagine: altezza };
    if (corrente !== 'pronto') applicaStato('pronto');
    return true;
  }

  async function dipingi() {
    inCoda = false;
    prenotato = null;
    const fotogramma = attesa;
    attesa = null;
    if (!fotogramma || distrutto) return;
    let immagine = null;
    try {
      immagine = await decodifica(fotogramma.dati);
    } catch (errore) {
      applicaStato('errore', t('fotogramma illeggibile'));
      segnala('decodifica', errore);
      return;
    }
    if (distrutto) { immagine?.close?.(); return; }
    disegna(immagine, fotogramma.metadati);
    // ⛔ Un ImageBitmap tiene la sua memoria grafica finché non lo si chiude (MDN, 07/09/2026).
    immagine?.close?.();
  }

  /**
   * Un fotogramma arrivato. Non si dipinge subito: si tiene solo l'ultimo e si dipinge una volta
   * per fotogramma di schermo. Torna `true` se è stato preso in carico.
   */
  function frame(fotogramma) {
    if (distrutto) return false;
    const dati = fotogramma?.dati;
    if (typeof dati !== 'string' || dati.length === 0) { segnala('fotogramma-vuoto'); return false; }
    ricevuti += 1;
    if (attesa) scartati += 1; // quello di prima non si vedrà mai: si conta, non si nasconde
    attesa = { dati, metadati: fotogramma.metadati || null };
    if (!inCoda) { inCoda = true; prenotato = chiediFotogramma(dipingi); }
    return true;
  }

  /** Lo stato: senza argomento legge, con un nome noto scrive. Un nome ignoto non cambia niente. */
  function stato(nome, dettaglio) {
    if (nome === undefined) return corrente;
    return applicaStato(nome, dettaglio);
  }

  /**
   * La misura della vista: la geometria che serve a `gestoDaEvento` (si passa questo oggetto tale e
   * quale) e i contatori che dicono se lo stream regge.
   */
  function misura() {
    const rettangolo = tela.getBoundingClientRect?.() || null;
    const dip = Number(metadatiDipinti?.deviceWidth) || 0;
    return {
      rettangolo,
      metadatiUltimoFrame: metadatiDipinti,
      scala: rettangolo && dip > 0 ? (Number(rettangolo.width) || 0) / dip : 0,
      stato: corrente,
      ricevuti,
      dipinti,
      scartati,
      viaBitmap,
      senzaMoto,
    };
  }

  function suPuntatore(evento) {
    if (evento.type === 'pointerdown') tela.focus?.();
    const gesto = gestoDaEvento(evento, misura());
    if (!gesto) return;
    if (evento.type === 'wheel') evento.preventDefault?.();
    onGesto?.(gesto);
  }

  function suTasto(evento) {
    // ⛔ Escape restituisce il fuoco a TALOS e NON arriva alla pagina remota. Si ferma qui anche la
    // propagazione: il primo Escape esce dalla vista, un secondo (che la vista non ha più) arriva a
    // TALOS. Altrimenti uscire dalla vista chiuderebbe anche la scheda dietro, con un tasto solo.
    if (evento.key === 'Escape') {
      evento.stopPropagation?.();
      tela.blur?.();
      return;
    }
    const gesto = gestoDaEvento(evento, misura());
    if (!gesto) return; // Tab e le scorciatoie della app passano oltre intatte: non sono nostre
    evento.preventDefault?.();
    onGesto?.(gesto);
  }

  function suFuoco() { radice.classList?.add(`${CLASSE}--fuoco`); }
  function suPerditaFuoco() { radice.classList?.remove(`${CLASSE}--fuoco`); }

  for (const tipo of ['pointerdown', 'pointerup', 'pointermove']) ascolta(tela, tipo, suPuntatore);
  ascolta(tela, 'wheel', suPuntatore, { passive: false }); // serve preventDefault: passive no
  ascolta(tela, 'keydown', suTasto);
  ascolta(tela, 'keyup', suTasto);
  ascolta(tela, 'focus', suFuoco);
  ascolta(tela, 'blur', suPerditaFuoco);

  applicaStato('apro');

  function distruggi() {
    if (distrutto) return;
    distrutto = true;
    if (inCoda && prenotato !== null) annullaFotogramma(prenotato);
    inCoda = false;
    prenotato = null;
    attesa = null;
    for (const [nodo, tipo, mano, opzioni] of ascolti) nodo.removeEventListener?.(tipo, mano, opzioni);
    ascolti.length = 0;
    contenitore.replaceChildren?.();
  }

  return { frame, stato, misura, distruggi, radice, tela };
}
