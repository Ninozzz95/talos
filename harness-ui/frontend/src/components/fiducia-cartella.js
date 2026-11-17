/*
 * Decisioni 173, 189 e 196 (owner 04/11/2026) sul PC — «Ti fidi di questa cartella?», con i pezzi che ESISTONO già (regola «mai
 *   inventare UI»; forma `FORMA-PERMESSI-2-E-173-2026-11-04.md` §6 e §6 bis):
 *   1. la DOMANDA: la carta di permesso della chat (`creaApprovazione`, la stessa delle carte del giro e della carta «accendi» della
 *      persona, `telefoni-chat.js:431`), senza «Per questa sessione», coi due pulsanti «Sì, mi fido di questa cartella» / «No» e, nella
 *      nota del piede, cosa fa il «No». Risponde alla finestra, non al nucleo: il clic della persona scrive la fiducia (`salva`).
 *   2. la RIGA FISSA col «No»: i testi della fascia sotto la conversazione (`talos-fascia-modo`, la stessa del Piano richiesto);
 *   3. la VOCE della pillola dei permessi: una riga di elenco (`talos-list-row`) nel velo dei permessi, solo quando la cartella non è
 *      fidata.
 *   Testi uguali alla CLI (`firstrun.trust.*`, `screen.trust.fixedLine*`), con il gesto del PC al posto di «/trust».
 * Codex fa la stessa domanda prima di lavorare in una cartella mai vista e la ricorda per progetto (`set_project_trust_level`,
 *   `thread_processor.rs:1479-1505`); Claude Code la fa all'avvio («Do you trust the files in this folder?»).
 */
import { t } from './lingua.js';
import { creaApprovazione, segnaEsitoApprovazione } from './conversazione.js';

const SVG = 'http://www.w3.org/2000/svg';

function nodo(doc, tag, classe, testo) {
  const n = doc.createElement(tag);
  if (classe) n.className = classe;
  if (testo !== undefined && testo !== null) n.textContent = String(testo);
  return n;
}

/**
 * La carta della domanda. `salva(fidata)` scrive la fiducia (la rotta `/api/v1/folder-trust`) e torna una promessa: se fallisce, l'errore
 * resta nella carta e i pulsanti si riaccendono (la conversazione non parte in Accesso pieno su una risposta non salvata).
 * @returns {{ scheda: HTMLElement, risposta: Promise<boolean> }} `risposta`: true col «Sì», false col «No», dopo il salvataggio.
 */
/**
 * I testi della carta. Giro 2 (giudice v1461, D6): a conversazione GIÀ aperta (`aMetaSessione`) non le frasi della nascita («TALOS caricherà…»,
 * «Apri senza…»): le istruzioni sono già caricate e la chat è già aperta. Il modo del «No» si chiama come nella pillola («Chiede prima»).
 */
export function testiCartaFiducia({ aMetaSessione = false, accessoPieno = true, soloQui = false } = {}) {
  return {
    /* giro 3-bis (owner 11/11 16:35): su un disco intero o sulla cartella utente la carta dice che qui la fiducia non si salva */
    perche: t(soloQui ? 'chat.trust.plainWide' : aMetaSessione ? 'chat.trust.plainOpen' : 'chat.trust.plain'),
    si: t(soloQui ? 'chat.trust.yesThisChat' : 'chat.trust.yes'),
    motivo: accessoPieno ? t('chat.trust.fullAccess') : '',
    nota: t(aMetaSessione ? 'chat.trust.noHintOpen' : 'chat.trust.noHint'),
  };
}

export function creaCartaFiducia(doc, { cartella = '', accessoPieno = true, aMetaSessione = false, soloQui = false, salva } = {}) {
  const testi = testiCartaFiducia({ aMetaSessione, accessoPieno, soloQui });
  const { scheda, pulsanti } = creaApprovazione({
    badge: t('chat.trust.title'), bersaglio: cartella, perche: testi.perche, motivo: testi.motivo, nota: testi.nota,
  }, { document: doc });
  scheda.dataset.fiduciaCartella = '';
  const { unaVolta: si, sessione, nega: no } = pulsanti;
  sessione.remove();
  si.textContent = testi.si; si.dataset.fiduciaSi = '';
  if (soloQui) scheda.dataset.fiduciaSoloQui = '';
  no.textContent = t('chat.trust.no'); no.dataset.fiduciaNo = '';
  let errore = null;
  let finita = false;
  let chiudiDaFuori = () => {};
  const risposta = new Promise((risolvi) => {
    /* controllore 11/11 (a): la carta chiusa da fuori (risposta in un'altra finestra, o dal menu) perde i pulsanti; un clic che arriva
       dopo non scrive niente. La risposta `null`: la decisione l'ha presa un altro. */
    chiudiDaFuori = (fidata) => {
      if (finita) return;
      finita = true;
      segnaEsitoApprovazione(scheda, { approvato: fidata === true, altrove: true }, { document: doc });
      risolvi(null);
    };
    const rispondi = async (fidata) => {
      if (finita) return;
      si.disabled = true; no.disabled = true;
      errore?.remove(); errore = null;
      let detta = fidata;
      try {
        const esito = await salva?.(fidata);
        if (typeof esito?.fidata === 'boolean') detta = esito.fidata; // il server dice la decisione vera (un'altra finestra prima di questa)
      } catch (e) {
        errore = nodo(doc, 'p', 'talos-approval__motivo talos-fiducia__errore', t('chat.trust.saveFailed', { errore: e?.messaggio ?? e?.message ?? '' }));
        errore.setAttribute('role', 'alert');
        scheda.append(errore);
        si.disabled = false; no.disabled = false;
        return;
      }
      if (finita) return;
      finita = true;
      segnaEsitoApprovazione(scheda, { approvato: detta, altrove: detta !== fidata }, { document: doc });
      risolvi(detta);
    };
    si.addEventListener('click', () => { void rispondi(true); });
    no.addEventListener('click', () => { void rispondi(false); });
  });
  return { scheda, risposta, chiudi: (fidata) => chiudiDaFuori(fidata) };
}

/**
 * Giro 3 (giudice v1483, aggiunta 1): il nome della cartella nella carta, l'ultimo pezzo del percorso; una RADICE (`C:\`, `/`, `\\server\quota\`)
 * si nomina intera, come Claude Code (`CHANGELOG.md:4615`, «name the repository root the grant covers»): prima restava «C:» o niente.
 */
export function nomeDellaCartella(cartella) {
  const s = typeof cartella === 'string' ? cartella : '';
  const pezzi = s.split(/[\\/]/u).filter(Boolean);
  const radice = /^[A-Za-z]:[\\/]*$/u.test(s) || /^[\\/]+$/u.test(s) || /^[\\/]{2}[^\\/]+[\\/][^\\/]+[\\/]*$/u.test(s);
  return radice ? s : (pezzi.pop() ?? '');
}

/**
 * Controllore 11/11 (b, C7): lo stato della fiducia di una conversazione, dall'istantanea o dalla riga dell'elenco: una forma sola, con
 * il segnale «da chiedere».
 */
export function fiduciaDa(sessionId, fonte) {
  return { sessionId, cartellaNonFidata: fonte?.cartellaNonFidata === true, pienoTrattenuto: fonte?.pienoTrattenuto === true, fiduciaDaChiedere: fonte?.fiduciaDaChiedere === true,
    ...(fonte?.fiduciaSoloConversazione === true ? { soloConversazione: true } : {}) }; // giro 3-bis: disco intero o cartella utente
}

/**
 * I testi della riga fissa, dall'istantanea delle impostazioni o dalla riga dell'elenco (`cartellaNonFidata`, `pienoTrattenuto`):
 * `null` quando la cartella è fidata (la riga non c'è).
 */
export function testiRigaFiducia(impostazioni, { cartaAperta = false } = {}) {
  if (impostazioni?.fiduciaDaChiedere === true && impostazioni.cartellaNonFidata !== true) {
    if (cartaAperta) return null; // controllore 11/11 (c): la carta fa già la domanda, una sola sullo schermo
    return { frase: t('chat.trust.fixedLineAsk'), nota: t('chat.trust.fixedLineGesture') };
  }
  if (impostazioni?.cartellaNonFidata !== true) return null;
  return { frase: t(impostazioni.pienoTrattenuto === true ? 'chat.trust.fixedLineFullAccess' : 'chat.trust.fixedLine'), nota: t('chat.trust.fixedLineGesture') };
}

/**
 * Falla della revisione del 10/11 (reperto 1): la domanda per una conversazione GIÀ aperta, quando il server trattiene l'Accesso pieno su
 * una cartella mai chiesta (`fiduciaDaChiedere`, da qualunque via ci si arrivi). Una carta per conversazione, mai due di fila; mai sul
 * telefono collegato (la sua rotta risponde «non disponibile»: lì resta la riga fissa).
 */
export function serveLaDomanda(fiducia, { sessioneAperta = null, cartaAperta = null, telefono = false } = {}) {
  return !telefono && Boolean(sessioneAperta) && fiducia?.sessionId === sessioneAperta && fiducia.fiduciaDaChiedere === true
    && fiducia.cartellaNonFidata !== true && cartaAperta !== sessioneAperta;
}

/**
 * Controllore 11/11 (a, b): la domanda di una conversazione GIÀ aperta, fuori da app.js perché si possa provare. Una carta per
 *   conversazione (prenotata prima della lettura: C3), mai durante il rigioco della storia (C4, anche se comincia mentre si legge), mai sul
 *   telefono collegato. `aggiorna(fiducia)` riceve ogni fotografia nuova: se la conversazione della carta non aspetta più (risposta in
 *   un'altra finestra, o dal menu) la carta si chiude senza pulsanti. La risposta va a `dopoLaRisposta(sessionId, si)` (C9: la pillola).
 *   `salva(sessionId, si, { soloSeMaiChiesta: true })`: il server non lascia che un «No» tardivo rovesci un «Sì» già dato.
 */
export function creaDomandaFiducia({ document: doc, leggi, salva, metti, dopoLaRisposta } = {}) {
  let aperta = null; // { sessionId, carta: null (prenotata) | { scheda, chiudi } }
  const viva = () => Boolean(aperta) && (aperta.carta === null || aperta.carta.scheda.isConnected);
  const apertaPer = (sessionId) => viva() && aperta.carta !== null && aperta.sessionId === sessionId; // una carta sullo schermo, non solo prenotata
  return {
    apertaPer,
    async chiedi({ sessionId, fiducia, inRigiocata = () => false, telefono = false, ancoraLei = () => true } = {}) {
      if (inRigiocata()) return false; // la storia prima: alla fine del rigioco la fascia si ridisegna e la carta va in fondo
      if (!serveLaDomanda(fiducia, { sessioneAperta: sessionId, cartaAperta: viva() ? aperta.sessionId : null, telefono })) return false;
      const mia = { sessionId, carta: null }; // prenotata: due fotografie di fila non fanno due carte
      aperta = mia;
      let letta = null;
      try { letta = await leggi(sessionId); } catch { /* la riga fissa resta: la voce del velo risponde */ }
      if (aperta !== mia) return false;
      if (letta?.fidata !== null || !ancoraLei(sessionId) || inRigiocata()) { aperta = null; return false; }
      const { scheda, risposta, chiudi } = creaCartaFiducia(doc, { cartella: nomeDellaCartella(String(letta.cartella ?? '')),
        accessoPieno: true, aMetaSessione: true, soloQui: letta.soloPerLaConversazione === true,
        salva: (si) => salva(sessionId, si, { soloSeMaiChiesta: true, ...(letta.soloPerLaConversazione === true ? { soloPerLaConversazione: true } : {}) }) });
      mia.carta = { scheda, chiudi };
      metti(scheda);
      void risposta.then((si) => {
        if (aperta === mia) aperta = null;
        if (si !== null) dopoLaRisposta?.(sessionId, si);
      });
      return true;
    },
    aggiorna(fiducia) {
      if (!viva() || !aperta.carta || fiducia?.sessionId !== aperta.sessionId) return;
      if (fiducia.fiduciaDaChiedere === true && fiducia.cartellaNonFidata !== true) return;
      const { chiudi } = aperta.carta;
      aperta = null;
      chiudi(fiducia.cartellaNonFidata !== true);
    },
  };
}

/** La voce «Fidati di questa cartella» del velo dei permessi: una riga d'elenco, `onFidati()` al clic. */
export function creaVoceFiducia(doc, { onFidati, soloQui = false } = {}) {
  const scheda = nodo(doc, 'div', 'talos-card talos-list');
  scheda.dataset.c = 'FolderTrustItem';
  scheda.id = 'veloPermessiFiducia';
  const riga = nodo(doc, 'button', 'talos-list-row');
  riga.type = 'button';
  riga.dataset.fiduciaVoce = '';
  const icona = nodo(doc, 'span', 'talos-list-row__icon');
  const svg = doc.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'i'); svg.setAttribute('aria-hidden', 'true');
  const uso = doc.createElementNS(SVG, 'use');
  uso.setAttribute('href', '#i-shield');
  svg.append(uso);
  icona.append(svg);
  const testo = nodo(doc, 'span', 'talos-list-row__text');
  testo.append(nodo(doc, 'span', 'talos-list-row__title', t(soloQui ? 'chat.trust.yesThisChat' : 'chat.trust.menuItem')),
    nodo(doc, 'span', 'talos-list-row__sub', t(soloQui ? 'chat.trust.plainWide' : 'chat.trust.plain')));
  riga.append(icona, testo);
  riga.addEventListener('click', () => { void onFidati?.(riga); });
  scheda.append(riga);
  return scheda;
}
