/*
 * FE-066: la bolla del computer use, la pagina dentro la finestra del guscio (`bozzetto-computer-use-pc`, sezione «La bolla», barra del telefono `TalosBarraRoot.vue`). La pagina non sa
 * di stare in una finestra speciale: aperta e chiusa sono il fuoco, la misura la legge il guscio. Riposo: il campo. Al lavoro: la frase, i secondi, «Ferma», che resta sempre.
 * ⛔ Mancano di proposito `+`, microfono, Copia e Leggi: senza un comando dietro sarebbero funzioni finte. Arrivano col loro percorso.
 * «Consenti sempre» c'è (owner 03/11): la carta risponde 'sempre' e il valore va così sul canale.
 */
import { linguaDaIndirizzo, risolviLingua, t } from '../lingua.js';
import { INDIRIZZO_PORTA_DAVANTI, leggiMessaggio, riduciBolla, riprendiMotivoSegno, riprendiSegnoAssente, segnoDaSalvare, STATO_INIZIALE_BOLLA } from './bolla-protocollo.js';
import { cartaCassa, cartaConferme, cartaDelCompito, cartaFine, cartaMano } from './carte.js';
import { fraseDiFine } from './parole.js';

const pezzo = (doc, tag, classe, testo) => {
  const n = doc.createElement(tag);
  if (classe) n.className = classe;
  if (testo !== undefined && testo !== null) n.textContent = String(testo);
  return n;
};

/** Le impostazioni della pagina principale: la bolla è della stessa origine e legge lo stesso archivio. */
export const CHIAVE_IMPOSTAZIONI = 'talos.harness.desktop.settings.v1';
export const CHIAVE_SEGNO_ASSENTE = 'talos.bolla.segnoAssente';

/**
 * La lingua della bolla, scelta come la sceglie la pagina principale: la pseudo-lingua dall'àncora, poi `uiLanguage` salvata, poi la lingua del browser, poi l'inglese.
 * `salvate` è il testo grezzo dell'archivio: illeggibile vale come non salvato.
 */
export function linguaDellaBolla({ salvate = null, lingueBrowser = [], ancora = '' } = {}) {
  let preferenza;
  try { preferenza = JSON.parse(salvate ?? 'null')?.uiLanguage; } catch { preferenza = undefined; } // una lingua sconosciuta la scarta `risolviLingua`
  return linguaDaIndirizzo(ancora) ?? risolviLingua(preferenza, lingueBrowser);
}

/**
 * `memoria` (FE-074) tiene lo stato dell'avviso «segno assente» oltre un ricarico della pagina: `leggi()` e `scrivi(v)` sull'archivio della sessione. Senza, o se lancia,
 * l'avviso vale per la vita della pagina come prima.
 * @param {{ document: Document, finestra: Window, canale: { postMessage: Function, onmessage: Function|null }, timer?: object, adesso?: () => number,
 *   memoria?: { leggi: () => unknown, scrivi: (v: string) => void } }} o
 * @returns {{ nodo: HTMLElement, chiudi: () => void }}
 */
export function creaBolla({ document: doc, finestra, canale, timer = globalThis, adesso = () => Date.now(), memoria = null }) {
  let salvato = null;
  try { salvato = memoria?.leggi() ?? null; } catch { salvato = null; }
  let stato = { ...STATO_INIZIALE_BOLLA, segnoAssente: riprendiSegnoAssente(salvato), motivoSegno: riprendiMotivoSegno(salvato) };
  let inizio = null;
  let contati = 0;
  let orologio = null;
  // Contratto del segno, riga 36 (forma del Desktop 05/11/2026 17:45): ogni messaggio in uscita porta la sessione che
  // usa il computer, così chi riceve risponde a QUELLA e mai alla chat visibile. Sessione ignota: niente campo
  // (decisione (a) del Desktop: un messaggio senza compito in corso apre una chat nuova).
  const manda = (m) => canale.postMessage(stato.sessionId ? { ...m, sessionId: stato.sessionId } : m);

  const nodo = pezzo(doc, 'main', 'scena cu-bolla');
  nodo.dataset.aperta = 'false';
  const posto = pezzo(doc, 'div', 'cu-bolla__carta');
  const forma = pezzo(doc, 'form', 'pillola');
  const orlo = pezzo(doc, 'span', 'orlo');
  const campo = pezzo(doc, 'textarea', 'campo');
  campo.rows = 1;
  campo.setAttribute('placeholder', t('computer.bubble.write'));
  campo.setAttribute('aria-label', t('computer.bubble.write'));
  const invia = pezzo(doc, 'button', 'azione', '↑');
  invia.type = 'submit';
  invia.setAttribute('aria-label', t('computer.bubble.send'));
  const fase = pezzo(doc, 'span', 'fase');
  const sec = pezzo(doc, 'span', 'cu-bolla__sec');
  sec.setAttribute('aria-hidden', 'true');
  const ferma = pezzo(doc, 'button', 'azione azione--ferma', '■');
  ferma.type = 'button';
  ferma.dataset.ferma = '';
  ferma.setAttribute('aria-label', t('computer.common.stop'));
  ferma.addEventListener('click', () => manda({ tipo: 'ferma' }));

  function spedisci() {
    const testo = campo.value.trim();
    if (!testo) return;
    manda({ tipo: 'messaggio', testo });
    campo.value = '';
  }
  forma.addEventListener('submit', (e) => { e.preventDefault(); spedisci(); });
  campo.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    e.preventDefault();
    spedisci();
  });

  const rispondi = (id) => (valore) => {
    manda({ tipo: 'risposta', id, valore });
    aggiorna({ tipo: 'chiudi-domanda', id });
  };

  function cartaDellaDomanda({ id, porta, dati }) {
    const alRisposta = rispondi(id);
    if (porta === 'consenso') return cartaDelCompito(dati, { document: doc, alRisposta, alCambiaPosso: (valore) => manda({ tipo: 'posso', id, valore }) });
    if (porta === 'conferme') return cartaConferme({ voci: Array.isArray(dati.voci) ? dati.voci : [] }, { document: doc, alRisposta });
    if (porta === 'mano') return cartaMano(dati, { document: doc, alRisposta });
    if (dati.protezione === 'pagamento') return cartaCassa(dati, { document: doc, alRisposta });
    return cartaConferme({ voci: [{ id: 0, protezione: dati.protezione, prova: dati.prova }] }, { document: doc, alRisposta });
  }

  /* la carta nel suo guscio: `.carta` del bozzetto col piede «Apri in TALOS»; il consenso ha il suo, `.cs` */
  function vestita(...dentro) {
    const carta = pezzo(doc, 'article', 'carta');
    carta.setAttribute('aria-label', 'TALOS');
    const corpo = pezzo(doc, 'div', 'corpo');
    corpo.append(...dentro.filter(Boolean));
    const piede = pezzo(doc, 'footer', 'piede');
    const apri = pezzo(doc, 'button', 'apri', t('computer.bubble.openInTalos'));
    apri.type = 'button';
    apri.addEventListener('click', () => { manda({ tipo: 'apri', sessionId: stato.sessionId }); finestra.open(INDIRIZZO_PORTA_DAVANTI); });
    piede.append(apri);
    carta.append(corpo, piede);
    return carta;
  }

  function disegnaCarta() {
    if (stato.domanda) {
      const c = cartaDellaDomanda(stato.domanda);
      posto.replaceChildren(stato.domanda.porta === 'consenso' ? c : vestita(c));
    } else if (stato.fine) {
      posto.replaceChildren(vestita(pezzo(doc, 'p', 'testo', fraseDiFine(stato.fine)), cartaFine(stato.fine, { document: doc })));
    } else posto.replaceChildren();
    /* Decisione 274 (owner 05/11 23:12): mentre TALOS lavora, senza domanda e senza fine, solo la pillola e nessuna carta,
       come nel bozzetto (`index.html:1077` `lavoro` → `solo(pillola(...))`); «Apri in TALOS» resta sulle carte (`:1029`). */
  }

  function segnaSecondi() {
    if (inizio === null || stato.pillola.fermo) return;
    sec.textContent = `${contati + Math.floor((adesso() - inizio) / 1000)} s`;
  }
  function disegnaPillola() {
    const { lavora, fermo } = stato.pillola;
    orlo.dataset.stato = lavora && !fermo ? 'pensa' : 'fermo';
    const avviso = stato.segnoAssente === 'mostrato' && !fermo;
    /* Decisione 273 (owner 05/11 22:17): la frase della protezione non si taglia mai; tutte le altre restano a due righe (`bolla.css`, `.fase--intera`). */
    const protezione = stato.motivoSegno === 'protezione';
    fase.className = avviso ? (protezione ? 'fase fase--avviso fase--intera' : 'fase fase--avviso') : 'fase';
    fase.textContent = avviso ? t(protezione ? 'computer.pill.noCursorProtection' : 'computer.pill.noCursorOldWindows') : stato.pillola.fase;
    forma.replaceChildren(...(lavora ? [orlo, fase, sec, ferma] : [orlo, campo, invia]));
    if (lavora && !fermo && inizio === null) {
      inizio = adesso();
      orologio ??= timer.setInterval(segnaSecondi, 1000);
    }
    if ((!lavora || fermo) && inizio !== null) {
      if (lavora) contati += Math.floor((adesso() - inizio) / 1000);
      inizio = null;
      timer.clearInterval(orologio);
      orologio = null;
    }
    if (!lavora) { contati = 0; sec.textContent = ''; }
    segnaSecondi();
  }

  function aggiorna(m) {
    const avviso = stato.segnoAssente;
    stato = riduciBolla(stato, m);
    if (stato.segnoAssente !== avviso && stato.segnoAssente !== null) {
      try { memoria?.scrivi(segnoDaSalvare(stato)); } catch { /* senza archivio l'avviso vale per questa pagina */ }
    }
    disegnaCarta();
    disegnaPillola();
  }

  canale.onmessage = (e) => {
    const m = leggiMessaggio(e?.data);
    if (m && m.tipo !== 'segno-assente') aggiorna(m);
  };
  /* FE-073: il guscio scrive con `postMessage` sulla finestra della bolla stessa; altre sorgenti, altre origini e altre forme si scartano. */
  const dalGuscio = (e) => {
    if (e?.source !== finestra || e.origin !== finestra.location?.origin) return;
    const m = leggiMessaggio(e.data);
    if (m?.tipo === 'segno-assente') aggiorna(m);
  };
  finestra.addEventListener('message', dalGuscio);
  const suFuoco = () => { nodo.dataset.aperta = 'true'; if (campo.isConnected) campo.focus(); };
  const suUscita = () => { nodo.dataset.aperta = 'false'; };
  finestra.addEventListener('focus', suFuoco);
  finestra.addEventListener('blur', suUscita);

  nodo.append(posto, forma);
  disegnaPillola();
  manda({ tipo: 'pronta' });

  return {
    nodo,
    chiudi() {
      canale.onmessage = null;
      finestra.removeEventListener('focus', suFuoco);
      finestra.removeEventListener('blur', suUscita);
      finestra.removeEventListener('message', dalGuscio);
      if (orologio !== null) timer.clearInterval(orologio);
    },
  };
}
