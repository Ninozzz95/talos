import test from 'node:test';
import assert from 'node:assert/strict';
import { creaVistaViva, gestoDaEvento, tastoInoltrabile, testoStato, STATI } from '../../src/components/browser-vivo.js';

/*
 * M5, 07/09/2026 — la vista viva del Browser: lo schermo di un Chromium vero dipinto su un canvas.
 *
 * Le unit di questo repo non caricano un DOM: qui sotto c'è un documento finto che sa fare SOLO le
 * cose che il componente tocca davvero. È lo stesso stile di `tooltip.test.mjs` e `scorciatoie.test.mjs`.
 *
 * Ogni prova ha la sua metà al contrario, perché un controllo che non ha mai respinto niente non è
 * un controllo: il gesto senza metadati, lo stato «pronto» prima di aver dipinto, il tasto che non
 * ci appartiene, il fotogramma che arriva dopo la distruzione.
 */

/* ── il documento finto ──────────────────────────────────────────────────────────────────────── */

function nodoFinto(tag) {
  const attributi = new Map();
  const nodo = {
    tag,
    className: '',
    textContent: '',
    hidden: false,
    width: 0,
    height: 0,
    dataset: {},
    figli: [],
    ascolti: [],
    disegni: [],
    fuoco: false,
    rettangolo: { left: 0, top: 0, width: 0, height: 0 },
    classi: new Set(),
    classList: {
      add: (...c) => c.forEach((x) => nodo.classi.add(x)),
      remove: (...c) => c.forEach((x) => nodo.classi.delete(x)),
      contains: (c) => nodo.classi.has(c),
    },
    setAttribute: (k, v) => attributi.set(k, String(v)),
    getAttribute: (k) => (attributi.has(k) ? attributi.get(k) : null),
    append: (...x) => nodo.figli.push(...x),
    replaceChildren: (...x) => { nodo.figli = x; },
    addEventListener: (t, m, o) => nodo.ascolti.push({ t, m, o }),
    removeEventListener: (t, m) => {
      const i = nodo.ascolti.findIndex((a) => a.t === t && a.m === m);
      if (i >= 0) nodo.ascolti.splice(i, 1);
    },
    focus: () => { nodo.fuoco = true; nodo.lancia('focus', {}); },
    blur: () => { nodo.fuoco = false; nodo.lancia('blur', {}); },
    getBoundingClientRect: () => nodo.rettangolo,
    getContext: () => nodo.contesto,
    contesto: { drawImage: (...a) => nodo.disegni.push(a) },
    lancia: (t, evento) => nodo.ascolti.filter((a) => a.t === t).forEach((a) => a.m({ type: t, ...evento })),
  };
  if (tag === 'img') {
    // L'immagine finta: assegnare `src` fa scattare `onload`, come farebbe un data URL già in memoria.
    nodo.naturalWidth = 800;
    nodo.naturalHeight = 600;
    let sorgente = '';
    Object.defineProperty(nodo, 'src', {
      get: () => sorgente,
      set: (v) => { sorgente = v; queueMicrotask(() => nodo.onload?.()); },
    });
  }
  return nodo;
}

function documentoFinto() {
  const creati = [];
  return { creati, createElement: (tag) => { const n = nodoFinto(tag); creati.push(n); return n; } };
}

/** Una finestra finta col suo requestAnimationFrame a mano: i fotogrammi di schermo li do io. */
function finestraFinta(extra = {}) {
  const coda = [];
  return {
    coda,
    requestAnimationFrame: (mano) => coda.push(mano) - 1,
    cancelAnimationFrame: (id) => { coda[id] = null; },
    /** Un fotogramma di schermo: esegue ciò che era in coda in quel momento. */
    scorri() { const ora = coda.splice(0, coda.length); ora.forEach((m) => m?.()); },
    ...extra,
  };
}

const attendi = () => new Promise((r) => setTimeout(r, 0));

function monta(opzioni = {}) {
  const doc = documentoFinto();
  const finestra = finestraFinta(opzioni.finestra);
  const contenitore = nodoFinto('div');
  const gesti = [];
  const errori = [];
  const vista = creaVistaViva(contenitore, {
    documento: doc,
    finestra,
    onGesto: (g) => gesti.push(g),
    onErrore: (e) => errori.push(e),
  });
  vista.tela.rettangolo = { left: 0, top: 0, width: 1200, height: 800, ...(opzioni.rettangolo || {}) };
  return { doc, finestra, contenitore, vista, gesti, errori };
}

const METADATI = { deviceWidth: 1200, deviceHeight: 800, pageScaleFactor: 1, offsetTop: 0, scrollOffsetX: 0, scrollOffsetY: 0 };

/* ── i fotogrammi ────────────────────────────────────────────────────────────────────────────── */

test('VISTAVIVA-COALESCENZA: tre fotogrammi in un fotogramma di schermo si dipingono UNA volta sola, e vince l’ultimo', async () => {
  const { finestra, vista } = monta();
  assert.equal(vista.frame({ dati: 'AAAA', metadati: { ...METADATI, scrollOffsetY: 1 } }), true);
  assert.equal(vista.frame({ dati: 'BBBB', metadati: { ...METADATI, scrollOffsetY: 2 } }), true);
  assert.equal(vista.frame({ dati: 'CCCC', metadati: { ...METADATI, scrollOffsetY: 3 } }), true);
  // ⛔ una sola prenotazione, non tre: altrimenti a 60 fotogrammi al secondo si decodifica tre volte
  assert.equal(finestra.coda.length, 1);
  finestra.scorri();
  await attendi();

  assert.equal(vista.tela.disegni.length, 1, 'tre fotogrammi, un solo drawImage');
  const m = vista.misura();
  assert.equal(m.ricevuti, 3);
  assert.equal(m.dipinti, 1);
  assert.equal(m.scartati, 2, 'i due saltati si contano: un fotogramma buttato in silenzio è una misura che non esiste');
  assert.equal(m.metadatiUltimoFrame.scrollOffsetY, 3, 'si vede l’ULTIMO arrivato, non il primo');
  // la tela prende la misura dell’immagine, non quella del CSS
  assert.equal(vista.tela.width, 800);
  assert.equal(vista.tela.height, 600);
  // e la scala è quella vera: 1200 px a schermo per 1200 DIP di pagina
  assert.equal(m.scala, 1);
});

test('VISTAVIVA-DECODIFICA: col Blob si passa da createImageBitmap e il bitmap si CHIUDE; senza, si ripiega sul data URL', async () => {
  let chiusi = 0;
  let blobRicevuti = 0;
  const conBitmap = monta({
    finestra: {
      atob: globalThis.atob,
      Blob: globalThis.Blob,
      createImageBitmap: async (blob) => { blobRicevuti += blob.size; return { width: 640, height: 480, close: () => { chiusi += 1; } }; },
    },
  });
  assert.equal(conBitmap.vista.misura().viaBitmap, true);
  conBitmap.vista.frame({ dati: 'AAAA', metadati: METADATI });
  conBitmap.finestra.scorri();
  await attendi();
  assert.equal(conBitmap.vista.tela.disegni.length, 1);
  assert.ok(blobRicevuti > 0, 'i byte veri, non la stringa base64');
  assert.equal(chiusi, 1, '⛔ un ImageBitmap tiene memoria grafica finché non si chiude');

  // AL CONTRARIO: una finestra senza createImageBitmap non si blocca, ripiega sull’immagine + data URL
  const senza = monta();
  assert.equal(senza.vista.misura().viaBitmap, false);
  senza.vista.frame({ dati: 'AAAA', metadati: METADATI });
  senza.finestra.scorri();
  await attendi();
  assert.equal(senza.vista.tela.disegni.length, 1);
  const immagine = senza.doc.creati.find((n) => n.tag === 'img');
  assert.equal(immagine.src, 'data:image/jpeg;base64,AAAA');
});

test('VISTAVIVA-OFFSET: `offsetTop` è spazio lasciato SOPRA l’immagine, e la tela cresce di conseguenza', async () => {
  const { finestra, vista } = monta();
  // 1200 DIP di pagina per 800 px di immagine ⇒ 0,666 px per DIP; 30 DIP di offset ⇒ 20 px
  vista.frame({ dati: 'AAAA', metadati: { ...METADATI, offsetTop: 30 } });
  finestra.scorri();
  await attendi();
  assert.deepEqual(vista.tela.disegni[0].slice(1), [0, 20]);
  assert.equal(vista.tela.height, 620);
});

test('⛔ AL CONTRARIO — un fotogramma vuoto non si dipinge, e chi ascolta lo viene a sapere', async () => {
  const { finestra, vista, errori } = monta();
  assert.equal(vista.frame({ dati: '' }), false);
  assert.equal(vista.frame(null), false);
  assert.equal(vista.frame({ metadati: METADATI }), false);
  assert.equal(finestra.coda.length, 0, 'niente da dipingere: niente prenotazione');
  assert.equal(vista.misura().ricevuti, 0);
  assert.deepEqual(errori.map((e) => e.motivo), ['fotogramma-vuoto', 'fotogramma-vuoto', 'fotogramma-vuoto']);
});

/* ── i gesti ─────────────────────────────────────────────────────────────────────────────────── */

test('VISTAVIVA-GESTO: 1:1, in scala, e con zoom + scorrimento — mai coordinate del canvas', () => {
  const rettangolo = { left: 100, top: 50, width: 1200, height: 800 };
  const uno = gestoDaEvento({ type: 'pointerdown', clientX: 400, clientY: 250, button: 0 }, { rettangolo, metadatiUltimoFrame: METADATI });
  assert.equal(uno.tipo, 'giu');
  assert.deepEqual([uno.xVista, uno.yVista], [300, 200], 'tolto l’angolo del canvas');
  assert.deepEqual([uno.x, uno.y], [300, 200], 'senza zoom né scorrimento le due coppie coincidono');
  assert.equal(uno.pulsante, 'sinistro');
  assert.equal(uno.dentro, true);

  // la vista rimpicciolita a metà: 600 px a schermo per 1200 DIP di pagina
  const meta = gestoDaEvento({ type: 'pointerup', clientX: 400, clientY: 250 }, { rettangolo: { ...rettangolo, width: 600 }, metadatiUltimoFrame: METADATI });
  assert.deepEqual([meta.tipo, meta.xVista, meta.yVista], ['su', 600, 400]);

  // zoom della pagina 2×, 30 DIP di offset in alto, pagina scorsa di 30/500
  const zoom = gestoDaEvento(
    { type: 'pointermove', clientX: 500, clientY: 250 },
    { rettangolo, metadatiUltimoFrame: { ...METADATI, pageScaleFactor: 2, offsetTop: 24, scrollOffsetX: 30, scrollOffsetY: 500 } },
  );
  assert.deepEqual([zoom.xVista, zoom.yVista], [400, 176], 'il viewport visibile: è ciò che vuole Input.dispatchMouseEvent');
  assert.deepEqual([zoom.x, zoom.y], [230, 588], 'il documento: è ciò che vuole chi cerca un elemento');

  // fuori dal bordo destro: si traduce lo stesso (un trascinamento esce), ma si DICE che è fuori
  const fuori = gestoDaEvento({ type: 'pointermove', clientX: 1400, clientY: 250 }, { rettangolo, metadatiUltimoFrame: METADATI });
  assert.equal(fuori.dentro, false);

  const rotella = gestoDaEvento({ type: 'wheel', clientX: 400, clientY: 250, deltaX: 0, deltaY: -120 }, { rettangolo, metadatiUltimoFrame: METADATI });
  assert.deepEqual([rotella.tipo, rotella.deltaY], ['rotella', -120]);
});

test('⛔ AL CONTRARIO — senza metadati non si inventa un gesto', () => {
  const rettangolo = { left: 0, top: 0, width: 1200, height: 800 };
  const clic = { type: 'pointerdown', clientX: 10, clientY: 10 };
  // nessun fotogramma ancora dipinto: un clic a (0,0) sulla pagina di qualcun altro è peggio di un clic perso
  assert.equal(gestoDaEvento(clic, { rettangolo, metadatiUltimoFrame: null }), null);
  assert.equal(gestoDaEvento(clic, { rettangolo }), null);
  assert.equal(gestoDaEvento(clic, {}), null);
  assert.equal(gestoDaEvento(clic), null);
  // metadati che ci sono ma non dicono la larghezza: non basta esistere
  assert.equal(gestoDaEvento(clic, { rettangolo, metadatiUltimoFrame: { pageScaleFactor: 1 } }), null);
  assert.equal(gestoDaEvento(clic, { rettangolo, metadatiUltimoFrame: { ...METADATI, deviceWidth: 0 } }), null);
  // scheda nascosta: il canvas è largo zero e ogni divisione mentirebbe
  assert.equal(gestoDaEvento(clic, { rettangolo: { left: 0, top: 0, width: 0, height: 0 }, metadatiUltimoFrame: METADATI }), null);
  // un evento che non sappiamo tradurre resta null, non diventa un clic
  assert.equal(gestoDaEvento({ type: 'dragstart', clientX: 1, clientY: 1 }, { rettangolo, metadatiUltimoFrame: METADATI }), null);

  // ⇒ L’ECCEZIONE, e il suo perché: un tasto non porta coordinate, quindi senza metadati non c’è
  // niente da inventare. Vietarlo qui vorrebbe dire perdere ciò che si scrive fra due fotogrammi.
  const tasto = gestoDaEvento({ type: 'keydown', key: 'a', code: 'KeyA' }, {});
  assert.deepEqual([tasto.tipo, tasto.tasto, tasto.testo], ['tastoGiu', 'a', 'a']);
});

test('VISTAVIVA-TASTI: si inoltra ciò che è della pagina, non ciò che è della app', () => {
  assert.equal(tastoInoltrabile({ key: 'a' }), true);
  assert.equal(tastoInoltrabile({ key: 'Enter' }), true);
  assert.equal(tastoInoltrabile({ key: 'ArrowDown' }), true);
  assert.equal(tastoInoltrabile({ key: 'a', altKey: true }), true, 'Alt non è un modificatore della app');
  // AL CONTRARIO: Escape e Tab garantiscono l’uscita (WCAG 2.1.2), Ctrl/⌘ sono di TALOS
  assert.equal(tastoInoltrabile({ key: 'Tab' }), false);
  assert.equal(tastoInoltrabile({ key: 'Escape' }), false);
  assert.equal(tastoInoltrabile({ key: 'k', ctrlKey: true }), false);
  assert.equal(tastoInoltrabile({ key: 'k', metaKey: true }), false);
  assert.equal(tastoInoltrabile({}), false);
  // e un tasto di comando non porta testo da scrivere
  assert.equal(gestoDaEvento({ type: 'keyup', key: 'ArrowLeft' }, {}).testo, '');
});

test('VISTAVIVA-TASTIERA MONTATA: il fuoco si vede, Escape torna a TALOS, le scorciatoie passano oltre', () => {
  const { vista, gesti } = monta();
  const anello = 'talos-vistaviva--fuoco';

  // il fuoco arriva col clic e si VEDE (l’anello lo mette la classe, il CSS lo disegna)
  vista.tela.lancia('pointerdown', { clientX: 10, clientY: 10 });
  assert.equal(vista.tela.fuoco, true);
  assert.equal(vista.radice.classList.contains(anello), true);
  assert.equal(gesti.length, 0, 'nessun fotogramma dipinto: niente coordinate, niente gesto');

  vista.frame({ dati: 'AAAA', metadati: METADATI });
  vista.tela.disegni.push(['finto']); // il disegno vero lo provano gli altri test: qui serve solo la geometria
  const conta = () => gesti.length;

  // una lettera arriva alla pagina, e le si toglie l’effetto locale
  let impedito = 0;
  vista.tela.lancia('keydown', { key: 'a', code: 'KeyA', preventDefault: () => { impedito += 1; } });
  assert.equal(conta(), 1);
  assert.equal(gesti[0].tipo, 'tastoGiu');
  assert.equal(impedito, 1);

  // ⛔ Ctrl+K NON si ruba: nessun gesto e nessun preventDefault, così arriva a TALOS intatto
  let impeditoScorciatoia = 0;
  vista.tela.lancia('keydown', { key: 'k', ctrlKey: true, preventDefault: () => { impeditoScorciatoia += 1; } });
  assert.equal(conta(), 1);
  assert.equal(impeditoScorciatoia, 0);

  // ⛔ Tab nemmeno: chi entra con la tastiera deve poter uscire con la tastiera
  vista.tela.lancia('keydown', { key: 'Tab', preventDefault: () => { impeditoScorciatoia += 1; } });
  assert.equal(conta(), 1);
  assert.equal(impeditoScorciatoia, 0);

  // Escape restituisce il fuoco a TALOS: niente gesto, niente anello, e si ferma qui
  let fermato = 0;
  vista.tela.lancia('keydown', { key: 'Escape', stopPropagation: () => { fermato += 1; } });
  assert.equal(conta(), 1);
  assert.equal(vista.tela.fuoco, false);
  assert.equal(fermato, 1);
  assert.equal(vista.radice.classList.contains(anello), false);
});

/* ── gli stati ───────────────────────────────────────────────────────────────────────────────── */

test('VISTAVIVA-STATI: ognuno dei cinque dice qualcosa, e nessuno dice quello di un altro', () => {
  const detti = STATI.map((s) => testoStato(s));
  assert.deepEqual(detti, ['Apro il browser…', 'Carico la pagina…', 'Trasmissione ferma', 'Il browser non risponde', 'Pagina viva']);
  assert.equal(new Set(detti).size, STATI.length, 'due stati con la stessa frase sarebbero uno stato solo');
  // AL CONTRARIO: un nome che non conosciamo non prende in prestito la frase di un altro
  assert.equal(testoStato('marziano'), 'Stato sconosciuto');
  assert.equal(testoStato(undefined), 'Stato sconosciuto');
  assert.ok(!detti.includes(testoStato('marziano')));
});

test('VISTAVIVA-STATO VERO: «pronto» non si dichiara prima di aver dipinto, e un nome ignoto non cambia niente', async () => {
  const { finestra, vista } = monta();
  assert.equal(vista.stato(), 'apro');
  assert.equal(vista.radice.dataset.stato, 'apro');
  assert.equal(vista.tela.getAttribute('aria-label'), 'Pagina viva — Apro il browser…');

  // ⛔ la metà al contrario: chiedere «pronto» a schermo vuoto NON lo rende vero
  assert.equal(vista.stato('pronto'), 'carico');
  assert.equal(vista.radice.dataset.stato, 'carico');

  // un nome che non esiste non sposta niente
  assert.equal(vista.stato('marziano'), 'carico');
  assert.equal(vista.stato(), 'carico');

  // il velo copre finché non c’è niente da vedere, e porta scritto il perché
  assert.equal(vista.radice.figli[1].hidden, false);
  assert.equal(vista.radice.figli[1].textContent, 'Carico la pagina…');

  // dipinto un fotogramma, «pronto» diventa vero da solo
  vista.frame({ dati: 'AAAA', metadati: METADATI });
  finestra.scorri();
  await attendi();
  assert.equal(vista.stato(), 'pronto');
  assert.equal(vista.radice.figli[1].hidden, true, 'il velo si toglie solo quando c’è qualcosa sotto');

  // un errore lo dice, col dettaglio attaccato una volta sola
  assert.equal(vista.stato('errore', 'connessione caduta'), 'errore');
  assert.equal(vista.radice.figli[2].textContent, 'Il browser non risponde — connessione caduta');
  assert.equal(vista.stato('fermo'), 'fermo');
  assert.equal(vista.radice.figli[2].textContent, 'Trasmissione ferma', 'senza dettaglio niente trattino appeso');
});

test('VISTAVIVA-DECODIFICA ROTTA: si dice all’ascoltatore e si passa a «errore», non si resta a mentire «pronto»', async () => {
  const rotta = monta({ finestra: { atob: globalThis.atob, Blob: globalThis.Blob, createImageBitmap: async () => { throw new Error('jpeg troncato'); } } });
  rotta.vista.frame({ dati: 'AAAA', metadati: METADATI });
  rotta.finestra.scorri();
  await attendi();
  assert.equal(rotta.vista.tela.disegni.length, 0);
  assert.equal(rotta.vista.stato(), 'errore');
  assert.deepEqual(rotta.errori.map((e) => e.motivo), ['decodifica']);
  assert.equal(rotta.errori[0].dettaglio, 'jpeg troncato');
});

/* ── la fine ─────────────────────────────────────────────────────────────────────────────────── */

test('VISTAVIVA-DISTRUGGI: il fotogramma prenotato non arriva mai, gli ascolti se ne vanno, e ciò che arriva dopo si rifiuta', async () => {
  const { contenitore, finestra, vista } = monta();
  vista.frame({ dati: 'AAAA', metadati: METADATI });
  assert.equal(finestra.coda.filter(Boolean).length, 1);

  vista.distruggi();
  assert.equal(finestra.coda.filter(Boolean).length, 0, 'la prenotazione si annulla: non si dipinge su una vista morta');
  assert.equal(vista.tela.ascolti.length, 0, 'niente ascoltatori orfani su un canvas che non c’è più');
  assert.equal(contenitore.figli.length, 0);

  // AL CONTRARIO: un fotogramma in ritardo (il trasporto non sa ancora che abbiamo chiuso) si rifiuta
  assert.equal(vista.frame({ dati: 'BBBB', metadati: METADATI }), false);
  finestra.scorri();
  await attendi();
  assert.equal(vista.tela.disegni.length, 0);
  assert.equal(vista.misura().dipinti, 0);

  // e distruggere due volte non è un errore
  vista.distruggi();
});

test('VISTAVIVA-MOTO RIDOTTO: la preferenza di sistema si legge e si dichiara nella classe', () => {
  const con = monta({ finestra: { matchMedia: (q) => ({ matches: q === '(prefers-reduced-motion: reduce)' }) } });
  assert.equal(con.vista.misura().senzaMoto, true);
  assert.match(con.vista.radice.className, /talos-vistaviva--senza-moto/);
  // AL CONTRARIO: senza la preferenza la classe non compare (e una finestra senza matchMedia non esplode)
  const senza = monta();
  assert.equal(senza.vista.misura().senzaMoto, false);
  assert.equal(senza.vista.radice.className, 'talos-vistaviva');
});
