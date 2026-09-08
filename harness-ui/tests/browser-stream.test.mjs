import test from 'node:test';
import assert from 'node:assert/strict';
import {
  avviaTrasmissione, fermaTrasmissione, coordinateVerso, mandaClic, mandaTasto, mandaRotella,
  ridimensiona, opzioniTrasmissione, numeroDelFotogramma, bitModificatori, sessioneAltrui,
  QUALITA_MASSIMA, LARGHEZZA_MASSIMA, ALTEZZA_MASSIMA, FOTOGRAMMI_AL_SECONDO_MASSIMI, FOTOGRAMMI_IN_VOLO,
} from '../src/browser-stream.mjs';

// M2 (07/09) — lo schermo del Chromium di sistema dentro TALOS, e i gesti che tornano indietro.
// Ogni prova ha la sua metà AL CONTRARIO: non basta che la conferma parta, deve anche NON partire
// dove non c'è niente da confermare.

/** Un client CDP finto della forma che dà M1: `invia(metodo, parametri, sessionId)` e `su(evento, cb)`. */
function cdpFinto({ rompiSu = null, restituisciSgancio = true } = {}) {
  const invii = [];
  const ascolti = new Map();
  return {
    invii,
    async invia(metodo, parametri = {}, sessione) {
      invii.push({ metodo, parametri, sessione });
      if (rompiSu && rompiSu(metodo)) throw new Error(`CDP giù su ${metodo}`);
      return {};
    },
    su(evento, cb) {
      const lista = ascolti.get(evento) || [];
      lista.push(cb);
      ascolti.set(evento, lista);
      if (!restituisciSgancio) return undefined; // ci sono client che non danno niente indietro
      return () => ascolti.set(evento, (ascolti.get(evento) || []).filter((f) => f !== cb));
    },
    /** Consegna un evento e ASPETTA il gestore: così la prova vede la conferma già partita. */
    async emetti(evento, parametri, sessione) {
      for (const cb of [...(ascolti.get(evento) || [])]) await cb(parametri, sessione);
    },
    di(metodo) { return invii.filter((i) => i.metodo === metodo); },
    ascoltatori(evento) { return (ascolti.get(evento) || []).length; },
  };
}

const fotogramma = (numero, extra = {}) => ({ data: `immagine-${numero}`, sessionId: numero, metadata: { offsetTop: 0, pageScaleFactor: 1, deviceWidth: 1280, deviceHeight: 800, scrollOffsetX: 0, scrollOffsetY: 0, timestamp: 1 }, ...extra });

test('STREAM-AVVIO: Page.enable e l\'ascolto vengono PRIMA di startScreencast, e le opzioni stanno dentro i tetti', async () => {
  const cdp = cdpFinto();
  let ascoltatoriAllAvvio = -1;
  const originale = cdp.invia.bind(cdp);
  cdp.invia = async (metodo, parametri, sessione) => {
    if (metodo === 'Page.startScreencast') ascoltatoriAllAvvio = cdp.ascoltatori('Page.screencastFrame');
    return originale(metodo, parametri, sessione);
  };
  const trasmissione = await avviaTrasmissione(cdp, 'SESSIONE-1', { qualita: 400, larghezzaMax: 99_999, ogniNFrame: 0, fotogrammiAlSecondo: 1_000 }, () => {});

  assert.deepEqual(cdp.invii.map((i) => i.metodo), ['Page.enable', 'Page.startScreencast']);
  assert.equal(ascoltatoriAllAvvio, 1, 'un fotogramma fra enable e startScreencast si perderebbe: l\'ascolto va registrato prima');
  const avvio = cdp.di('Page.startScreencast')[0];
  assert.equal(avvio.sessione, 'SESSIONE-1');
  assert.deepEqual(avvio.parametri, { format: 'jpeg', quality: QUALITA_MASSIMA, maxWidth: LARGHEZZA_MASSIMA, maxHeight: ALTEZZA_MASSIMA, everyNthFrame: 1, maxFramesInFlight: FOTOGRAMMI_IN_VOLO });
  /* ⛔ 08/9: il tetto era 30 e il default 15. Misurato sul trasporto vero (C35-bis): ~100
     fotogrammi al secondo su 127.0.0.1, identici con la finestra davanti, coperta e headless.
     Il tetto sale a 90 e il default a 60 — quanto uno schermo mostra davvero. */
  assert.equal(trasmissione.opzioni.fotogrammiAlSecondo, FOTOGRAMMI_AL_SECONDO_MASSIMI);
  // AL CONTRARIO: valori sensati non vengono toccati
  assert.deepEqual(opzioniTrasmissione({ qualita: 55, larghezzaMax: 1024, altezzaMax: 640, ogniNFrame: 2, fotogrammiAlSecondo: 10 }), { qualita: 55, larghezzaMax: 1024, altezzaMax: 640, ogniNFrame: 2, fotogrammiAlSecondo: 10, intervalloMinimoMs: 100 });
});

test('STREAM-ACK: ogni fotogramma è confermato — anche quello su cui il consumatore LANCIA', async () => {
  const cdp = cdpFinto();
  let quando = 0;
  const visti = [];
  const trasmissione = await avviaTrasmissione(cdp, 'S', { fotogrammiAlSecondo: 30, orologio: () => quando }, (f) => {
    visti.push(f.numeroFrame);
    if (f.numeroFrame === 8) throw new Error('il consumatore è esploso');
  });
  for (const numero of [7, 8, 9]) { quando += 1_000; await cdp.emetti('Page.screencastFrame', fotogramma(numero), 'S'); }

  assert.deepEqual(visti, [7, 8, 9]);
  assert.deepEqual(cdp.di('Page.screencastFrameAck').map((i) => i.parametri.sessionId), [7, 8, 9], 'senza la conferma dell\'8 lo stream si sarebbe fermato lì');
  assert.deepEqual(cdp.di('Page.screencastFrameAck').map((i) => i.sessione), ['S', 'S', 'S']);
  assert.equal(trasmissione.conteggi.confermati, 3);
  assert.equal(trasmissione.conteggi.errori, 1, 'l\'errore del consumatore si conta, non si propaga');
});

test('STREAM-ACK-AL-CONTRARIO: nessuna conferma se il fotogramma non è arrivato, o se è di un\'altra scheda', async () => {
  const cdp = cdpFinto();
  let consegnati = 0;
  const trasmissione = await avviaTrasmissione(cdp, 'MIA', { fotogrammiAlSecondo: 30, orologio: () => Date.now() }, () => { consegnati += 1; });

  await cdp.emetti('Page.screencastFrame', { metadata: {} }, 'MIA');                       // niente numero, niente immagine
  await cdp.emetti('Page.screencastFrame', { sessionId: 3 }, 'MIA');                        // numero senza immagine
  await cdp.emetti('Page.screencastFrame', { data: '', sessionId: 4 }, 'MIA');              // immagine vuota
  await cdp.emetti('Page.screencastFrame', { data: 'x', sessionId: 'cinque' }, 'MIA');      // numero che non è un numero
  await cdp.emetti('Page.screencastFrame', fotogramma(6), 'ALTRA-SCHEDA');                  // sessione altrui, forma «stringa nuda»
  await cdp.emetti('Page.screencastFrame', fotogramma(6), { sessionId: 'ALTRA-SCHEDA', metodo: 'Page.screencastFrame' }); // forma di M1: un oggetto
  assert.deepEqual(cdp.di('Page.screencastFrameAck'), []);
  assert.equal(consegnati, 0);
  assert.equal(trasmissione.conteggi.ignorati, 4);
  assert.equal(trasmissione.conteggi.arrivati, 0);

  // e dopo lo sgancio il gestore è inerte anche se il client continua a chiamarlo
  trasmissione.sgancia();
  await cdp.emetti('Page.screencastFrame', fotogramma(7), 'MIA');
  assert.deepEqual(cdp.di('Page.screencastFrameAck'), []);

  assert.equal(numeroDelFotogramma({ data: 'x', sessionId: 2.5 }), null, 'il protocollo vuole un intero');
  assert.equal(numeroDelFotogramma(fotogramma(11)), 11);

  // AL CONTRARIO del filtro: quando la sessione dell'evento è la nostra — o non si sa — NON si scarta niente
  assert.equal(sessioneAltrui({ sessionId: 'MIA', metodo: 'Page.screencastFrame' }, 'MIA'), false);
  assert.equal(sessioneAltrui('MIA', 'MIA'), false);
  assert.equal(sessioneAltrui(undefined, 'MIA'), false, 'un client che non dice la sessione non deve far congelare il flusso');
  assert.equal(sessioneAltrui({ sessionId: null }, 'MIA'), false);
  assert.equal(sessioneAltrui({ sessionId: 'ALTRA' }, 'MIA'), true);
});

test('STREAM-TETTO: oltre i fotogrammi al secondo l\'immagine si butta, la conferma NO', async () => {
  const cdp = cdpFinto();
  let quando = 0;
  const consegnati = [];
  const trasmissione = await avviaTrasmissione(cdp, 'S', { fotogrammiAlSecondo: 10, orologio: () => quando }, (f) => consegnati.push(f.numeroFrame));
  // dieci al secondo = uno ogni 100 ms; questi arrivano ogni 20 ms
  for (let n = 1; n <= 6; n += 1) { await cdp.emetti('Page.screencastFrame', fotogramma(n), 'S'); quando += 20; }
  quando += 200;
  await cdp.emetti('Page.screencastFrame', fotogramma(7), 'S');

  assert.deepEqual(consegnati, [1, 6, 7], 'il primo passa, poi si aspetta la finestra dei 100 ms');
  assert.equal(trasmissione.conteggi.saltati, 4);
  assert.deepEqual(cdp.di('Page.screencastFrameAck').map((i) => i.parametri.sessionId), [1, 2, 3, 4, 5, 6, 7], 'anche i saltati vanno confermati, o Chrome smette di mandare');
});

test('STREAM-FERMA: stopScreencast, e una scheda già morta non fa lanciare nessuno', async () => {
  const cdp = cdpFinto();
  const trasmissione = await avviaTrasmissione(cdp, 'S', { orologio: () => 0 }, () => {});
  assert.deepEqual(await trasmissione.ferma(), { fermata: true, motivo: null });
  assert.equal(cdp.di('Page.stopScreencast').length, 1);
  // AL CONTRARIO: il client lancia, e la risposta è un esito, non un'eccezione
  const rotto = cdpFinto({ rompiSu: (m) => m === 'Page.stopScreencast' });
  const esito = await fermaTrasmissione(rotto, 'S');
  assert.equal(esito.fermata, false);
  assert.match(esito.motivo, /Page\.stopScreencast/);
});

test('STREAM-COORD: la formula di DevTools — si divide per lo zoom, POI si toglie offsetTop', () => {
  const metadatiFrame = { offsetTop: 0, pageScaleFactor: 1, deviceWidth: 1280, deviceHeight: 800, scrollOffsetX: 0, scrollOffsetY: 0 };
  // 1:1 — il punto resta dov'è
  assert.deepEqual(coordinateVerso({ x: 400, y: 300 }, { larghezzaCanvas: 1280, altezzaCanvas: 800, metadatiFrame }), { x: 400, y: 300, documentoX: 400, documentoY: 300, scala: 1, fuoriBordo: false });
  // canvas a metà: un punto sul canvas vale il doppio nella pagina
  const meta = coordinateVerso({ x: 320, y: 200 }, { larghezzaCanvas: 640, altezzaCanvas: 400, metadatiFrame });
  assert.deepEqual([meta.x, meta.y, meta.scala], [640, 400, 0.5]);
  // con la fascia in alto: 300/0,5 = 600, meno i 60 DIP di offsetTop = 540
  const conFascia = coordinateVerso({ x: 320, y: 300 }, { larghezzaCanvas: 640, altezzaCanvas: 400, metadatiFrame: { ...metadatiFrame, offsetTop: 60 } });
  assert.deepEqual([conFascia.x, conFascia.y], [640, 540]);
  // lo scorrimento NON sposta il clic (lo applica Chrome), ma dice dov'è il punto nel documento
  const scorso = coordinateVerso({ x: 100, y: 100 }, { larghezzaCanvas: 1280, altezzaCanvas: 800, metadatiFrame: { ...metadatiFrame, scrollOffsetY: 2_000, scrollOffsetX: 15 } });
  assert.deepEqual([scorso.x, scorso.y, scorso.documentoX, scorso.documentoY], [100, 100, 115, 2_100]);
  // con la pagina ingrandita (pinch) il punto nel documento si divide per il fattore
  const ingrandita = coordinateVerso({ x: 200, y: 400 }, { larghezzaCanvas: 1280, altezzaCanvas: 800, metadatiFrame: { ...metadatiFrame, pageScaleFactor: 2 } });
  assert.deepEqual([ingrandita.x, ingrandita.documentoX, ingrandita.documentoY], [200, 100, 200]);
});

test('STREAM-COORD-AL-CONTRARIO: con metadati assurdi il punto resta DENTRO i bordi', () => {
  const dentroIBordi = (p, l, a) => p.x >= 0 && p.y >= 0 && p.x <= l && p.y <= a && Number.isFinite(p.x) && Number.isFinite(p.y);
  const assurdi = [
    { deviceWidth: 0, deviceHeight: 0 },
    { deviceWidth: -1280, deviceHeight: -800 },
    { deviceWidth: NaN, deviceHeight: 'ottocento' },
    { deviceWidth: 1280, deviceHeight: 800, offsetTop: 5_000 },
    { deviceWidth: 1280, deviceHeight: 800, pageScaleFactor: 0 },
    {},
  ];
  for (const metadatiFrame of assurdi) {
    for (const punto of [{ x: -900, y: -900 }, { x: 99_999, y: 99_999 }, { x: NaN, y: undefined }]) {
      const esito = coordinateVerso(punto, { larghezzaCanvas: 640, altezzaCanvas: 400, metadatiFrame });
      assert.ok(dentroIBordi(esito, 1_280, 800), `fuori dai bordi con ${JSON.stringify(metadatiFrame)} e ${JSON.stringify(punto)}: ${JSON.stringify(esito)}`);
      assert.ok(Number.isFinite(esito.documentoX) && Number.isFinite(esito.documentoY));
    }
  }
  // offsetTop più alto dello schermo: non c'è pagina visibile, quindi y=0, e il punto è dichiarato fuori bordo
  const schiacciato = coordinateVerso({ x: 10, y: 300 }, { larghezzaCanvas: 1280, altezzaCanvas: 800, metadatiFrame: { deviceWidth: 1280, deviceHeight: 800, offsetTop: 5_000 } });
  assert.deepEqual([schiacciato.y, schiacciato.fuoriBordo], [0, true]);
  // e un punto dentro l'immagine NON è fuori bordo: il cancello deve anche assolvere
  assert.equal(coordinateVerso({ x: 10, y: 10 }, { larghezzaCanvas: 1280, altezzaCanvas: 800, metadatiFrame: { deviceWidth: 1280, deviceHeight: 800 } }).fuoriBordo, false);
});

test('STREAM-CLIC: una coppia premuto/rilasciato per il singolo, DUE coppie per il doppio', async () => {
  const cdp = cdpFinto();
  await mandaClic(cdp, 'S', { x: 12.4, y: 30.6 });
  const singolo = cdp.di('Input.dispatchMouseEvent').map((i) => i.parametri);
  assert.deepEqual(singolo.map((p) => p.type), ['mouseMoved', 'mousePressed', 'mouseReleased']);
  assert.deepEqual([singolo[1].x, singolo[1].y], [12, 31], 'le coordinate vanno intere');
  assert.deepEqual([singolo[1].button, singolo[1].buttons, singolo[1].clickCount], ['left', 1, 1]);
  assert.equal(singolo[2].buttons, 0, 'rilasciando non c\'è più nessun tasto premuto');

  const doppio = cdpFinto();
  await mandaClic(doppio, 'S', { x: 5, y: 5, doppio: true });
  const eventi = doppio.di('Input.dispatchMouseEvent').map((i) => i.parametri);
  assert.deepEqual(eventi.map((p) => `${p.type}:${p.clickCount}`), ['mouseMoved:0', 'mousePressed:1', 'mouseReleased:1', 'mousePressed:2', 'mouseReleased:2'], 'è il clickCount 2 a far scattare il dblclick');

  const destro = cdpFinto();
  await mandaClic(destro, 'S', { x: 1, y: 1, tasto: 'destro', modificatori: { shift: true } });
  const premuto = destro.di('Input.dispatchMouseEvent')[1].parametri;
  assert.deepEqual([premuto.button, premuto.buttons, premuto.modifiers], ['right', 2, 8]);
  // AL CONTRARIO: un nome di tasto che non esiste non manda un clic strano, ripiega sul sinistro
  const ignoto = cdpFinto();
  await mandaClic(ignoto, 'S', { x: 1, y: 1, tasto: 'piede' });
  assert.equal(ignoto.di('Input.dispatchMouseEvent')[1].parametri.button, 'left');
});

test('STREAM-TASTO: keyDown → char → keyUp, e il testo sta SOLO nel char', async () => {
  const cdp = cdpFinto();
  const esito = await mandaTasto(cdp, 'S', { chiave: 'a' });
  const eventi = cdp.di('Input.dispatchKeyEvent').map((i) => i.parametri);
  assert.deepEqual(eventi.map((p) => p.type), ['keyDown', 'char', 'keyUp']);
  assert.equal(eventi[0].text, undefined, 'con il testo anche sul keyDown la lettera si scriverebbe DUE volte');
  assert.deepEqual([eventi[0].code, eventi[0].windowsVirtualKeyCode], ['KeyA', 65]);
  assert.deepEqual([eventi[1].text, eventi[1].unmodifiedText], ['a', 'a']);
  assert.deepEqual(esito, { eventi: 3, scritto: true });

  const invio = cdpFinto();
  await mandaTasto(invio, 'S', { chiave: 'Enter' });
  const suInvio = invio.di('Input.dispatchKeyEvent').map((i) => i.parametri);
  assert.deepEqual([suInvio[0].windowsVirtualKeyCode, suInvio[1].text], [13, '\r'], 'Invio scrive \\r, non \\n');
});

test('STREAM-TASTO-AL-CONTRARIO: le frecce e le scorciatoie NON scrivono niente', async () => {
  const freccia = cdpFinto();
  const esitoFreccia = await mandaTasto(freccia, 'S', { chiave: 'ArrowLeft' });
  assert.deepEqual(freccia.di('Input.dispatchKeyEvent').map((i) => i.parametri.type), ['keyDown', 'keyUp']);
  assert.deepEqual(esitoFreccia, { eventi: 2, scritto: false });

  const scorciatoia = cdpFinto();
  await mandaTasto(scorciatoia, 'S', { chiave: 'a', modificatori: { ctrl: true } });
  assert.deepEqual(scorciatoia.di('Input.dispatchKeyEvent').map((i) => i.parametri.type), ['keyDown', 'keyUp'], 'Ctrl+A seleziona tutto, non scrive una «a»');
  assert.equal(scorciatoia.di('Input.dispatchKeyEvent')[0].parametri.modifiers, 2);

  // ma Shift fa parte della lettera: la maiuscola si scrive eccome
  const maiuscola = cdpFinto();
  await mandaTasto(maiuscola, 'S', { chiave: 'A', modificatori: { shift: true } });
  const eventiMaiuscola = maiuscola.di('Input.dispatchKeyEvent').map((i) => i.parametri);
  assert.deepEqual(eventiMaiuscola.map((p) => p.type), ['keyDown', 'char', 'keyUp']);
  assert.equal(eventiMaiuscola[1].text, 'A');

  // e una chiamata senza tasto non manda niente
  const vuoto = cdpFinto();
  assert.deepEqual(await mandaTasto(vuoto, 'S', {}), { eventi: 0, scritto: false });
  assert.deepEqual(vuoto.invii, []);

  assert.equal(bitModificatori({ alt: true, ctrl: true, meta: true, shift: true }), 15);
  assert.equal(bitModificatori(2), 2);
  assert.equal(bitModificatori(undefined), 0);
});

test('STREAM-ROTELLA: mouseWheel coi delta nel punto del puntatore', async () => {
  const cdp = cdpFinto();
  await mandaRotella(cdp, 'S', { x: 100, y: 200, dx: 0, dy: -240 });
  const p = cdp.di('Input.dispatchMouseEvent')[0].parametri;
  assert.deepEqual([p.type, p.x, p.y, p.deltaX, p.deltaY, p.buttons], ['mouseWheel', 100, 200, 0, -240, 0]);
  // AL CONTRARIO: delta non numerici diventano zero, non NaN dentro il protocollo
  const strano = cdpFinto();
  await mandaRotella(strano, 'S', { x: 'qui', y: null, dx: 'giù', dy: undefined });
  const q = strano.di('Input.dispatchMouseEvent')[0].parametri;
  assert.deepEqual([q.x, q.y, q.deltaX, q.deltaY], [0, 0, 0, 0]);
});

test('STREAM-RIDIMENSIONA: la misura si impone dentro i tetti, e zero per zero la TOGLIE', async () => {
  const cdp = cdpFinto();
  const esito = await ridimensiona(cdp, 'S', { larghezza: 1024, altezza: 768, scala: 2 });
  assert.deepEqual(cdp.di('Emulation.setDeviceMetricsOverride')[0].parametri, { width: 1024, height: 768, deviceScaleFactor: 2, mobile: false });
  assert.equal(esito.azzerato, false);
  /* ⛔ 08/9, visto in una foto: cambiare il viewport non basta. Una pagina FERMA non ridisegna, e
     lo schermo resta con la forma vecchia (926x448 dentro un riquadro piu alto, banda nera sotto).
     Il flusso va svegliato, o il ridimensionamento si vede solo appena si scorre. */
  assert.equal(cdp.di('Page.startScreencast').length, 1, 'dopo il ridimensionamento il flusso si risveglia, o la forma nuova non arriva');

  const enorme = cdpFinto();
  await ridimensiona(enorme, 'S', { larghezza: 999_999, altezza: 999_999, scala: 99 });
  assert.deepEqual(enorme.di('Emulation.setDeviceMetricsOverride')[0].parametri, { width: LARGHEZZA_MASSIMA, height: ALTEZZA_MASSIMA, deviceScaleFactor: 3, mobile: false });

  // AL CONTRARIO: zero non deve finire nel protocollo come «larghezza 0», si dice quello che si intende
  const azzera = cdpFinto();
  const tolto = await ridimensiona(azzera, 'S', { larghezza: 0, altezza: 0 });
  assert.deepEqual(azzera.invii.map((i) => i.metodo), ['Emulation.clearDeviceMetricsOverride']);
  assert.equal(tolto.azzerato, true);
});

test('STREAM-SGANCIO: anche con un client che non restituisce niente da `su`, lo sgancio ferma il gestore', async () => {
  const cdp = cdpFinto({ restituisciSgancio: false });
  let consegnati = 0;
  const trasmissione = await avviaTrasmissione(cdp, 'S', { fotogrammiAlSecondo: 30, orologio: () => Date.now() }, () => { consegnati += 1; });
  await cdp.emetti('Page.screencastFrame', fotogramma(1), 'S');
  assert.equal(consegnati, 1);
  trasmissione.sgancia();
  await cdp.emetti('Page.screencastFrame', fotogramma(2), 'S');
  assert.equal(consegnati, 1, 'il client continua a chiamare: la guardia deve stare anche dentro il gestore');
  assert.deepEqual(cdp.di('Page.screencastFrameAck').map((i) => i.parametri.sessionId), [1]);
});
