/**
 * browser-stream.mjs — M2 (07/09/2026). Trasmette lo schermo di un Chromium di
 * sistema dentro la nostra pagina, e riporta indietro i gesti della persona.
 *
 * È il ripiego B della vista Browser: quando la pagina vieta la cornice
 * (`X-Frame-Options`, `frame-ancestors`) non c'è niente da riscrivere, si
 * guarda il browser vero. Lo schermo esce dal compositor già compresso
 * (`Page.startScreencast`) invece di serializzare il DOM a ogni scatto: è la
 * stessa strada di Browserbase, Steel e Cloudflare Browser Rendering, e la
 * stessa che il pannello «Screencast» di DevTools usa da sempre.
 *
 * ⛔ La pagina di terzi è SEMPRE contenuto non affidabile: qui dentro non c'è
 * nessuna nostra API, solo byte di immagine in uscita e coordinate in entrata.
 * Il client CDP arriva come parametro (`cdp`), non lo costruisce questo modulo:
 * chi apre il browser (M1) decide profilo, porta e filtro degli indirizzi.
 *
 * FONTI, lette il 07/09/2026:
 * - CDP «Page» (chromedevtools.github.io/devtools-protocol/tot/Page/):
 *   `Page.startScreencast{format,quality,maxWidth,maxHeight,everyNthFrame,maxFramesInFlight}`;
 *   `maxFramesInFlight` vale 3 di default — è il numero di fotogrammi che
 *   Chrome manda PRIMA di pretendere una conferma, quindi senza
 *   `Page.screencastFrameAck` il flusso si ferma dopo pochi fotogrammi.
 *   `ScreencastFrameMetadata{offsetTop,pageScaleFactor,deviceWidth,deviceHeight,scrollOffsetX,scrollOffsetY,timestamp}`:
 *   le prime quattro in pixel indipendenti dal dispositivo (DIP), lo scorrimento
 *   in pixel CSS.
 * - CDP «Input»: `dispatchMouseEvent{type,x,y,button,buttons,clickCount,deltaX,deltaY,modifiers,pointerType}`
 *   con x/y «relative to the main frame's viewport in CSS pixels»; bit dei
 *   modificatori Alt=1, Ctrl=2, Meta=4, Shift=8; `buttons` sinistro=1, destro=2,
 *   centrale=4.
 * - CDP «Emulation»: `setDeviceMetricsOverride{width,height,deviceScaleFactor,mobile,scale}`,
 *   width/height fra 0 e 10.000.000 dove 0 disattiva l'override;
 *   `clearDeviceMetricsOverride` non prende parametri.
 * - devtools-frontend `panels/screencast/ScreencastView.ts` e `InputModel.ts`:
 *   la conversione VERA delle coordinate è
 *   `x = round(offsetX / screenZoom)`, `y = round(offsetY / screenZoom - screenOffsetTop)`
 *   con `screenZoom = larghezzaDisegnata / metadata.deviceWidth`. Nessuna
 *   proporzione inventata: lo scorrimento e `pageScaleFactor` NON entrano nel
 *   clic (li applica Chrome), servono a dire dov'è il punto nel documento.
 * - chrome-debugging-protocol, thread «Dispatch key events to fill an input
 *   field» (Ophir Back): per scrivere un carattere servono `keyDown` → `char` →
 *   `keyUp`, e il campo `text` va riempito SOLO nell'evento `char` — se lo si
 *   mette anche su `keyDown` il carattere si scrive due volte.
 * - puppeteer `USKeyboardLayout.ts`: codici Windows dei tasti non stampabili, e
 *   il testo di Invio che è `\r` (non `\n`).
 * - chrome-remote-interface #241: `Page.screencastFrameAck` vuole un INTERO;
 *   il numero del fotogramma arriva nell'evento come `sessionId`, che NON è la
 *   sessione CDP della scheda — due cose diverse con lo stesso nome.
 */

/* ─────────────────────────── i tetti ───────────────────────────
 * Lo stream passa DENTRO il nostro server prima di arrivare alla pagina: un
 * fotogramma non compresso a 60 al secondo lo affogherebbe. I tetti stanno qui,
 * non nelle opzioni di chi chiama, così nessuna chiamata può alzarli.
 */
export const QUALITA_PREDEFINITA = 60;
export const QUALITA_MASSIMA = 85;
export const QUALITA_MINIMA = 10;
export const LARGHEZZA_PREDEFINITA = 1280;
export const ALTEZZA_PREDEFINITA = 800;
export const LARGHEZZA_MASSIMA = 1920;
export const ALTEZZA_MASSIMA = 1200;
export const FOTOGRAMMI_AL_SECONDO_PREDEFINITI = 15;
export const FOTOGRAMMI_AL_SECONDO_MASSIMI = 30;
/** Quanti fotogrammi Chrome può mandare prima di pretendere una conferma. Il default del protocollo è 3; 2 tiene la latenza più bassa a parità di banda. */
export const FOTOGRAMMI_IN_VOLO = 2;

const TASTI_MOUSE = new Map([
  ['sinistro', { nome: 'left', bit: 1 }],
  ['left', { nome: 'left', bit: 1 }],
  ['destro', { nome: 'right', bit: 2 }],
  ['right', { nome: 'right', bit: 2 }],
  ['centrale', { nome: 'middle', bit: 4 }],
  ['middle', { nome: 'middle', bit: 4 }],
]);

/**
 * I tasti non stampabili, coi codici virtuali Windows di `USKeyboardLayout.ts`
 * (puppeteer). `testo` c'è solo dove il tasto scrive davvero qualcosa: Invio
 * scrive `\r`, le frecce non scrivono niente.
 */
export const TASTI_SPECIALI = new Map([
  ['Enter', { codice: 13, testo: '\r' }],
  ['Backspace', { codice: 8, testo: '' }],
  ['Tab', { codice: 9, testo: '' }],
  ['Escape', { codice: 27, testo: '' }],
  ['ArrowLeft', { codice: 37, testo: '' }],
  ['ArrowUp', { codice: 38, testo: '' }],
  ['ArrowRight', { codice: 39, testo: '' }],
  ['ArrowDown', { codice: 40, testo: '' }],
  ['Delete', { codice: 46, testo: '' }],
  ['Home', { codice: 36, testo: '' }],
  ['End', { codice: 35, testo: '' }],
  ['PageUp', { codice: 33, testo: '' }],
  ['PageDown', { codice: 34, testo: '' }],
  [' ', { codice: 32, testo: ' ' }],
]);

const numeroFinito = (valore, ripiego = 0) => (Number.isFinite(Number(valore)) ? Number(valore) : ripiego);
const dentro = (valore, minimo, massimo) => Math.min(massimo, Math.max(minimo, valore));
const positivo = (valore) => {
  const n = Number(valore);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * Porta le opzioni di chi chiama dentro i tetti. Esportata perché è il punto in
 * cui si legge, senza avviare niente, quanto costerà lo stream.
 * @param {{qualita?:number, larghezzaMax?:number, altezzaMax?:number, ogniNFrame?:number, fotogrammiAlSecondo?:number}} [opzioni]
 */
export function opzioniTrasmissione(opzioni = {}) {
  const o = opzioni && typeof opzioni === 'object' ? opzioni : {};
  const qualita = Math.round(dentro(numeroFinito(o.qualita, QUALITA_PREDEFINITA), QUALITA_MINIMA, QUALITA_MASSIMA));
  const larghezzaMax = Math.round(dentro(numeroFinito(o.larghezzaMax, LARGHEZZA_PREDEFINITA), 64, LARGHEZZA_MASSIMA));
  const altezzaMax = Math.round(dentro(numeroFinito(o.altezzaMax, ALTEZZA_PREDEFINITA), 64, ALTEZZA_MASSIMA));
  const ogniNFrame = Math.round(dentro(numeroFinito(o.ogniNFrame, 1), 1, 10));
  const fotogrammiAlSecondo = dentro(numeroFinito(o.fotogrammiAlSecondo, FOTOGRAMMI_AL_SECONDO_PREDEFINITI), 1, FOTOGRAMMI_AL_SECONDO_MASSIMI);
  return { qualita, larghezzaMax, altezzaMax, ogniNFrame, fotogrammiAlSecondo, intervalloMinimoMs: 1000 / fotogrammiAlSecondo };
}

/**
 * Il numero del fotogramma da confermare, o `null` se questo evento non è un
 * fotogramma. ⛔ È il campo `sessionId` dell'evento, e non ha NIENTE a che
 * vedere con la sessione CDP della scheda: `Page.screencastFrameAck` vuole
 * questo intero (chrome-remote-interface #241).
 */
export function numeroDelFotogramma(evento) {
  if (!evento || typeof evento !== 'object') return null;
  const n = Number(evento.sessionId);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  if (typeof evento.data !== 'string' || evento.data.length === 0) return null;
  return n;
}

/**
 * Accende la trasmissione e resta ad ascoltare i fotogrammi.
 *
 * ⛔ La conferma parte SEMPRE, per ogni fotogramma davvero arrivato: anche se
 * `onFrame` lancia, anche se il fotogramma viene saltato dal tetto sui
 * fotogrammi al secondo. Saltare una conferma significa fermare lo stream dopo
 * `maxFramesInFlight` fotogrammi, cioè uno schermo che si congela senza un
 * errore da nessuna parte.
 *
 * @param {{invia:Function, su:Function}} cdp client CDP (lo dà M1)
 * @param {string|undefined} sessionId la sessione CDP della scheda
 * @param {object} opzioni vedi `opzioniTrasmissione`; `orologio` solo per le prove
 * @param {(fotogramma:{dati:string, formato:string, numeroFrame:number, metadati:object, quando:number})=>void} onFrame
 */
export async function avviaTrasmissione(cdp, sessionId, opzioni = {}, onFrame = () => {}) {
  const scelte = opzioniTrasmissione(opzioni);
  const orologio = typeof opzioni?.orologio === 'function' ? opzioni.orologio : () => Date.now();
  const conteggi = { arrivati: 0, consegnati: 0, saltati: 0, confermati: 0, ignorati: 0, errori: 0 };
  let viva = true;
  let ultimoConsegnato = -Infinity;

  const gestore = async (evento, contesto) => {
    if (!viva) return;
    /* Un client CDP «flat» tiene TUTTE le schede su una connessione sola e passa
     * la sessione dell'evento come secondo argomento: i fotogrammi di un'altra
     * scheda non sono nostri e non si confermano — confermarli ruberebbe il
     * credito a chi li aspetta e lascerebbe l'altro flusso fermo.
     * ⛔ La forma del secondo argomento cambia da client a client: M1
     * (`browser-vivo.mjs`, `creaClientCdp`) passa `{ sessionId, metodo }`, altri
     * passano la stringa nuda. Si accettano tutt'e due, e quando non c'è non si
     * filtra niente. */
    if (sessioneAltrui(contesto, sessionId)) return;
    const numeroFrame = numeroDelFotogramma(evento);
    if (numeroFrame === null) { conteggi.ignorati += 1; return; } // niente conferma per ciò che non è un fotogramma
    conteggi.arrivati += 1;
    try {
      const adesso = numeroFinito(orologio(), 0);
      if (adesso - ultimoConsegnato >= scelte.intervalloMinimoMs) {
        ultimoConsegnato = adesso;
        conteggi.consegnati += 1;
        onFrame({ dati: evento.data, formato: 'jpeg', numeroFrame, metadati: evento.metadata || {}, quando: adesso });
      } else {
        conteggi.saltati += 1; // il tetto sui fotogrammi al secondo: si butta l'immagine, MAI la conferma
      }
    } catch (errore) {
      conteggi.errori += 1; // un consumatore che lancia non deve poter fermare lo stream
    } finally {
      try {
        await cdp.invia('Page.screencastFrameAck', { sessionId: numeroFrame }, sessionId);
        conteggi.confermati += 1;
      } catch {
        conteggi.errori += 1; // la scheda può essere già chiusa: non è un motivo per lanciare qui
      }
    }
  };

  /* Gli eventi del dominio Page arrivano solo dopo `Page.enable`, e l'ascolto si
   * registra PRIMA di `startScreencast`: fra le due chiamate Chrome manda già
   * fotogrammi, e uno perso è un fotogramma non confermato. */
  await cdp.invia('Page.enable', {}, sessionId);
  const sgancia = cdp.su('Page.screencastFrame', gestore);
  await cdp.invia('Page.startScreencast', {
    format: 'jpeg',
    quality: scelte.qualita,
    maxWidth: scelte.larghezzaMax,
    maxHeight: scelte.altezzaMax,
    everyNthFrame: scelte.ogniNFrame,
    maxFramesInFlight: FOTOGRAMMI_IN_VOLO,
  }, sessionId);

  return {
    opzioni: scelte,
    conteggi,
    /** Stacca l'ascolto senza toccare il browser (per una riconnessione). */
    sgancia() {
      viva = false; // ⛔ vale anche se `su` non restituisce niente: da qui il gestore è inerte
      if (typeof sgancia === 'function') { try { sgancia(); } catch { /* già staccato */ } }
    },
    async ferma() {
      this.sgancia();
      return fermaTrasmissione(cdp, sessionId);
    },
  };
}

/**
 * Spegne la trasmissione. Non lancia: si chiama anche quando la scheda è già
 * morta, e in quel caso «fermata» è comunque il risultato che si voleva.
 */
export async function fermaTrasmissione(cdp, sessionId) {
  try {
    await cdp.invia('Page.stopScreencast', {}, sessionId);
    return { fermata: true, motivo: null };
  } catch (errore) {
    return { fermata: false, motivo: String(errore?.message || errore) };
  }
}

/**
 * Dal punto toccato sul NOSTRO canvas al punto vero nella pagina.
 *
 * La formula è quella di DevTools (`ScreencastView.convertIntoScreenSpace`):
 * si divide per lo zoom e POI si toglie `offsetTop`, perché `offsetTop` è già
 * espresso in DIP dello schermo emulato (la fascia sopra la pagina), non in
 * pixel del canvas. Lo zoom è il rapporto fra ciò che abbiamo disegnato e
 * `deviceWidth`; si prende il minimo fra i due assi perché l'immagine si adatta
 * dentro il canvas mantenendo le proporzioni, e ciò che avanza è bordo nero.
 *
 * ⛔ `scrollOffsetX/Y` e `pageScaleFactor` NON entrano nel clic: `Input.dispatchMouseEvent`
 * vuole coordinate «relative to the main frame's viewport», e lo scorrimento lo
 * applica Chrome. Servono a dire dove sta il punto nel DOCUMENTO, che è ciò che
 * serve per appuntarci sopra una nota.
 *
 * @param {{x:number,y:number}} punto sul canvas
 * @param {{larghezzaCanvas:number, altezzaCanvas:number, metadatiFrame:object}} vista
 * @returns {{x:number,y:number,documentoX:number,documentoY:number,scala:number,fuoriBordo:boolean}}
 */
export function coordinateVerso(punto, vista = {}) {
  const m = vista.metadatiFrame && typeof vista.metadatiFrame === 'object' ? vista.metadatiFrame : {};
  const larghezzaCanvas = positivo(vista.larghezzaCanvas) ?? 1;
  const altezzaCanvas = positivo(vista.altezzaCanvas) ?? 1;
  /* Metadati assurdi (zero, negativi, NaN, assenti) non devono produrre un clic
   * fuori pagina: si ripiega sulla misura del canvas, cioè zoom 1. */
  const larghezzaSchermo = positivo(m.deviceWidth) ?? larghezzaCanvas;
  const altezzaSchermo = positivo(m.deviceHeight) ?? altezzaCanvas;
  const offsetTop = dentro(numeroFinito(m.offsetTop, 0), 0, altezzaSchermo);
  const altezzaUtile = Math.max(0, altezzaSchermo - offsetTop);

  let scala = Math.min(larghezzaCanvas / larghezzaSchermo, altezzaCanvas / altezzaSchermo);
  if (!Number.isFinite(scala) || scala <= 0) scala = 1;

  const xCanvas = numeroFinito(punto?.x, 0);
  const yCanvas = numeroFinito(punto?.y, 0);
  const xGrezza = xCanvas / scala;
  const yGrezza = yCanvas / scala - offsetTop;
  const x = Math.round(dentro(xGrezza, 0, larghezzaSchermo));
  const y = Math.round(dentro(yGrezza, 0, altezzaUtile));
  /* Fuori dall'immagine disegnata (il bordo del «contain», o un tocco oltre il
   * canvas): il chiamante può ignorare il gesto invece di cliccare sul bordo. */
  const fuoriBordo = xGrezza < 0 || yGrezza < 0 || xGrezza > larghezzaSchermo || yGrezza > altezzaUtile;

  const fattorePagina = positivo(m.pageScaleFactor) ?? 1;
  const documentoX = Math.round(numeroFinito(m.scrollOffsetX, 0) + x / fattorePagina);
  const documentoY = Math.round(numeroFinito(m.scrollOffsetY, 0) + y / fattorePagina);
  return { x, y, documentoX, documentoY, scala, fuoriBordo };
}

/**
 * L'evento è di un'ALTRA scheda? Il secondo argomento di `su` è la stringa della
 * sessione in certi client e `{ sessionId }` in altri (M1 dà l'oggetto).
 * Se non si sa dire di chi è, non si scarta: meglio confermare un fotogramma in
 * più che congelare il proprio flusso.
 */
export function sessioneAltrui(contesto, sessionId) {
  if (typeof sessionId !== 'string' || !sessionId) return false;
  const dellEvento = typeof contesto === 'string' ? contesto : (contesto && typeof contesto === 'object' ? contesto.sessionId : null);
  if (typeof dellEvento !== 'string' || !dellEvento) return false;
  return dellEvento !== sessionId;
}

/** I bit dei modificatori: Alt=1, Ctrl=2, Meta=4, Shift=8 (dominio Input). */
export function bitModificatori(modificatori) {
  if (typeof modificatori === 'number' && Number.isFinite(modificatori)) return modificatori & 0b1111;
  const m = modificatori && typeof modificatori === 'object' ? modificatori : {};
  return (m.alt ? 1 : 0) | (m.ctrl || m.control ? 2 : 0) | (m.meta ? 4 : 0) | (m.shift ? 8 : 0);
}

/**
 * Un clic vero è una COPPIA di eventi, non un evento solo: premuto e rilasciato
 * con lo stesso `clickCount`. Il doppio clic sono due coppie con `clickCount`
 * 1 e poi 2 — è il secondo numero che fa scattare il `dblclick` nella pagina.
 * Prima si manda un `mouseMoved`, come fa puppeteer, altrimenti gli stati
 * `:hover` che aprono i menù non si accendono mai.
 */
export async function mandaClic(cdp, sessionId, { x, y, tasto = 'sinistro', doppio = false, modificatori = 0 } = {}) {
  const scelto = TASTI_MOUSE.get(String(tasto).toLowerCase()) || TASTI_MOUSE.get('sinistro');
  const modifiers = bitModificatori(modificatori);
  const posizione = { x: Math.round(numeroFinito(x, 0)), y: Math.round(numeroFinito(y, 0)) };
  const comune = { ...posizione, modifiers, pointerType: 'mouse' };
  await cdp.invia('Input.dispatchMouseEvent', { ...comune, type: 'mouseMoved', button: 'none', buttons: 0, clickCount: 0 }, sessionId);
  const conteggi = doppio ? [1, 2] : [1];
  for (const clickCount of conteggi) {
    await cdp.invia('Input.dispatchMouseEvent', { ...comune, type: 'mousePressed', button: scelto.nome, buttons: scelto.bit, clickCount }, sessionId);
    await cdp.invia('Input.dispatchMouseEvent', { ...comune, type: 'mouseReleased', button: scelto.nome, buttons: 0, clickCount }, sessionId);
  }
  return { coppie: conteggi.length, tasto: scelto.nome };
}

/**
 * Un tasto stampabile vuole `keyDown` → `char` → `keyUp`, e il testo va SOLO
 * nell'evento `char`: metterlo anche su `keyDown` scrive il carattere due volte
 * (Chrome genera lui il `char` quando `text` è pieno).
 *
 * ⛔ Con Ctrl, Alt o Meta premuti NON si manda il `char`: quella è una
 * scorciatoia (Ctrl+A seleziona tutto), non una lettera da scrivere. Shift no:
 * shift fa parte della lettera.
 */
export async function mandaTasto(cdp, sessionId, { chiave, testo, modificatori = 0 } = {}) {
  const key = String(chiave ?? '');
  if (!key) return { eventi: 0, scritto: false };
  const modifiers = bitModificatori(modificatori);
  const speciale = TASTI_SPECIALI.get(key);
  const testoScritto = testo !== undefined ? String(testo) : (speciale ? speciale.testo : (Array.from(key).length === 1 ? key : ''));
  const codice = speciale ? speciale.codice : (Array.from(key).length === 1 ? key.toUpperCase().codePointAt(0) : 0);
  const scorciatoia = (modifiers & 0b0111) !== 0; // Alt|Ctrl|Meta, ma non Shift
  const scrive = testoScritto.length > 0 && !scorciatoia;
  const identita = { key, code: codiceFisico(key, speciale), windowsVirtualKeyCode: codice, nativeVirtualKeyCode: codice, modifiers };

  await cdp.invia('Input.dispatchKeyEvent', { ...identita, type: 'keyDown', autoRepeat: false, isKeypad: false, location: 0 }, sessionId);
  if (scrive) {
    await cdp.invia('Input.dispatchKeyEvent', { type: 'char', key, text: testoScritto, unmodifiedText: testoScritto.toLowerCase(), modifiers }, sessionId);
  }
  await cdp.invia('Input.dispatchKeyEvent', { ...identita, type: 'keyUp', location: 0 }, sessionId);
  return { eventi: scrive ? 3 : 2, scritto: scrive };
}

/** Il nome del tasto FISICO: per le lettere è `KeyA`, per le cifre `Digit1`, per gli altri il nome stesso. */
function codiceFisico(key, speciale) {
  if (speciale) return key === ' ' ? 'Space' : key;
  if (/^[a-zA-Z]$/.test(key)) return `Key${key.toUpperCase()}`;
  if (/^[0-9]$/.test(key)) return `Digit${key}`;
  return '';
}

/**
 * La rotella è un `mouseWheel` con i delta in pixel CSS, nel punto in cui sta il
 * puntatore: la pagina scorre l'elemento sotto quel punto, non sempre il
 * documento.
 */
export async function mandaRotella(cdp, sessionId, { x, y, dx = 0, dy = 0, modificatori = 0 } = {}) {
  await cdp.invia('Input.dispatchMouseEvent', {
    type: 'mouseWheel',
    x: Math.round(numeroFinito(x, 0)),
    y: Math.round(numeroFinito(y, 0)),
    deltaX: numeroFinito(dx, 0),
    deltaY: numeroFinito(dy, 0),
    modifiers: bitModificatori(modificatori),
    button: 'none',
    buttons: 0,
    clickCount: 0,
    pointerType: 'mouse',
  }, sessionId);
  return { dx: numeroFinito(dx, 0), dy: numeroFinito(dy, 0) };
}

/**
 * La misura della finestra vista dalla pagina. `width`/`height` a 0 tolgono
 * l'override (lo dice il protocollo), quindi «zero per zero» qui significa
 * «torna com'eri»: si chiama `clearDeviceMetricsOverride`, che è la stessa cosa
 * detta senza ambiguità.
 */
export async function ridimensiona(cdp, sessionId, { larghezza, altezza, scala = 1 } = {}) {
  const l = Math.round(numeroFinito(larghezza, 0));
  const a = Math.round(numeroFinito(altezza, 0));
  if (l <= 0 && a <= 0) {
    await cdp.invia('Emulation.clearDeviceMetricsOverride', {}, sessionId);
    return { azzerato: true, larghezza: 0, altezza: 0, scala: 1 };
  }
  const misura = {
    width: dentro(l, 1, LARGHEZZA_MASSIMA),
    height: dentro(a, 1, ALTEZZA_MASSIMA),
    deviceScaleFactor: dentro(numeroFinito(scala, 1), 0.5, 3),
    mobile: false,
  };
  await cdp.invia('Emulation.setDeviceMetricsOverride', misura, sessionId);
  return { azzerato: false, larghezza: misura.width, altezza: misura.height, scala: misura.deviceScaleFactor };
}
