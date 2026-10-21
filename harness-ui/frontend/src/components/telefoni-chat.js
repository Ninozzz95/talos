/*
 * R5.12 — I TELEFONI COLLEGATI DALLA CHAT (owner 18/10/2026: «Elenca, apre il QR, revoca»; mockup approvato «Sì, costruiscilo
 * così», foto `mockup-telefoni-{1-elenco,2-qr,3-spento,4-revoca,5-accesso-pieno}`; «Carta sempre, anche in Accesso pieno» per il QR).
 * I blocchi che stanno sotto la riga dell'attrezzo del modello, coi pezzi del prodotto e nessuna veste nuova:
 *   1. l'elenco (`remote_phones`): le righe di «Telefoni collegati» (`talos-remoto-riga`, `dettaglioTelefono`), senza «Revoca» — in
 *      chat si guarda e basta — e «Apri Telefoni collegati»;
 *   2. il QR (`remote_phone_pair`, dopo la carta): lo stesso riquadro della finestra d'accoppiamento (`svgDelQr`, le tre pillole,
 *      «Copia collegamento») e la nota che il codice di 6 cifre si conferma sul computer;
 *   3. remoto spento: l'avviso (`talos-callout talos-approval__avvisi`) con «Apri Telefoni collegati» — dalla chat non si accende;
 *   4. la carta della revoca: il blocco col telefono, «Revoca» / «Lascialo collegato»;
 *   5. Accesso pieno: il segno «Senza conferma» delle automazioni e il blocco col nome del telefono.
 * ⛔ Il gettone e il QR non passano mai dal modello: il QR lo chiede QUESTA finestra alla rotta della schermata con `soloSeAcceso`.
 */
import { t, tn } from './lingua.js';
import { svgDelQr, dettaglioTelefono, mmss } from './remoto.js';

function nodo(doc, tag, classe, testo) {
  const n = doc.createElement(tag);
  if (classe) n.className = classe;
  if (testo !== undefined && testo !== null) n.textContent = String(testo);
  return n;
}

function pulsante(doc, tipo, testo, dato) {
  const b = nodo(doc, 'button', `talos-button talos-button--${tipo} talos-button--sm talos-telefoni-chat__azione`, testo);
  b.type = 'button';
  if (dato) b.dataset[dato] = '';
  return b;
}

function apriSchermata(doc, onApri) {
  const b = pulsante(doc, 'secondary', t('remoto.chat.open'), 'telefoniApri');
  b.addEventListener('click', () => onApri?.());
  return b;
}

/** La riga di un telefono come in «Telefoni collegati», senza «Revoca». */
export function rigaTelefonoInChat(doc, v, { lingua = 'it', ora = Date.now() } = {}) {
  const riga = nodo(doc, 'div', 'talos-remoto-riga');
  riga.dataset.remotoTelefono = String(v.id ?? '');
  const testo = nodo(doc, 'div');
  testo.append(nodo(doc, 'strong', 'talos-remoto-riga__nome', v.nome || t('remoto.confirm.unnamed')), nodo(doc, 'span', 'talos-remoto-riga__dettaglio td-subtle', dettaglioTelefono(v, { lingua, ora })));
  const stato = nodo(doc, 'span', 'talos-remoto-riga__stato', t(v.inLinea ? 'remoto.list.online' : 'remoto.list.offline'));
  stato.dataset.inLinea = String(Boolean(v.inLinea));
  riga.append(testo, stato);
  return riga;
}

/** 1 — l'elenco, dallo stato vero del remoto (`GET /api/v1/remote`). Torna anche il dettaglio della riga («2 telefoni»). */
export function creaBloccoElencoTelefoni(doc, stato, { onApri, lingua = 'it', ora = Date.now() } = {}) {
  const blocco = nodo(doc, 'div', 'talos-approval__automazione talos-remoto-elenco talos-telefoni-chat');
  blocco.dataset.telefoniElenco = '';
  if (!stato || stato.disponibile === false) {
    blocco.append(nodo(doc, 'p', 'td-subtle', t('remoto.list.unavailable')));
    return { blocco, dettaglio: '' };
  }
  const vivi = (stato.telefoni ?? []).filter((v) => !v.revocatoAlle);
  if (!vivi.length) blocco.append(nodo(doc, 'p', 'td-subtle', t('remoto.list.empty')));
  for (const v of vivi) blocco.append(rigaTelefonoInChat(doc, v, { lingua, ora }));
  blocco.append(apriSchermata(doc, onApri));
  return { blocco, dettaglio: tn('remoto.chat.phonesOne', 'remoto.chat.phonesMany', vivi.length, { n: vivi.length }) };
}

/**
 * 2 — il QR in chat. `offerta`: `{gettone, qr, scadeAlle, moduli}` dalla rotta. `onScade()` quando il tempo finisce; `aggiornaDettaglio(testo)`
 * scrive «scade fra m:ss» anche sulla riga dell'attrezzo. Torna `{ blocco, ferma }`: `ferma()` spegne il conto alla rovescia.
 */
export function creaBloccoQrInChat(doc, offerta, { copia = null, orologio = () => Date.now(), timer = globalThis, onScade, aggiornaDettaglio } = {}) {
  const blocco = nodo(doc, 'div', 'talos-approval__automazione talos-telefoni-chat');
  blocco.dataset.telefoniQr = '';
  const riquadro = nodo(doc, 'div', 'talos-remoto-qr');
  const immagine = nodo(doc, 'div', 'talos-remoto-qr__immagine');
  immagine.append(svgDelQr(doc, offerta.moduli, t('remoto.pair.qrLabel')));
  const testo = nodo(doc, 'div', 'talos-remoto-qr__testo');
  const come = nodo(doc, 'p', 'td-prose');
  const [prima, dopo] = t('remoto.pair.how', { action: '\u0000' }).split('\u0000');
  come.append(doc.createTextNode(prima ?? ''), nodo(doc, 'strong', null, t('remoto.pair.howAction')), doc.createTextNode(dopo ?? ''));
  testo.append(come, nodo(doc, 'p', 'td-prose', t('remoto.pair.power')), nodo(doc, 'p', 'td-subtle', t('remoto.chat.confirmHere')));
  riquadro.append(immagine, testo);
  const chips = nodo(doc, 'div', 'talos-remoto-chips');
  const scade = nodo(doc, 'span', 'talos-remoto-chip talos-remoto-chip--accento');
  scade.dataset.remotoScade = '';
  chips.append(scade, nodo(doc, 'span', 'talos-remoto-chip', t('remoto.pair.once')), nodo(doc, 'span', 'talos-remoto-chip', t('remoto.pair.encrypted')));
  blocco.append(riquadro, chips);
  if (typeof copia === 'function') {
    const b = pulsante(doc, 'secondary', t('remoto.pair.copy'), 'remotoCopia');
    b.addEventListener('click', () => { copia(offerta.qr); b.textContent = t('remoto.pair.copied'); });
    blocco.append(b);
  }
  let conto = null;
  const ferma = () => { if (conto) timer.clearInterval(conto); conto = null; };
  const segna = () => {
    const resta = offerta.scadeAlle - orologio();
    const frase = resta > 0 ? t('remoto.pair.expiresIn', { time: mmss(resta) }) : t('remoto.pair.expired');
    scade.textContent = frase;
    aggiornaDettaglio?.(frase);
    if (resta <= 0) { ferma(); chiudiQr(doc, blocco, t('remoto.pair.expiredBody')); onScade?.(); }
  };
  segna();
  if (offerta.scadeAlle > orologio()) conto = timer.setInterval(segna, 1000);
  return { blocco, ferma };
}

/** Il QR non vale più (scaduto, usato, o chiuso): il riquadro lascia il posto a una riga che lo dice — un QR morto non resta a schermo. */
export function chiudiQr(doc, blocco, frase) {
  if (!blocco || blocco.dataset.telefoniQr === 'chiuso') return;
  blocco.dataset.telefoniQr = 'chiuso';
  blocco.replaceChildren(nodo(doc, 'p', 'td-subtle', frase));
}

/** 3 — il remoto è spento (o non c'è): l'avviso, e la porta verso la schermata. */
export function creaBloccoRemotoSpento(doc, { onApri, nonDisponibile = false } = {}) {
  const avviso = nodo(doc, 'div', 'talos-callout talos-approval__avvisi talos-telefoni-chat');
  avviso.dataset.telefoniSpento = '';
  const corpo = nodo(doc, 'div', 'talos-approval__avvisi-corpo');
  if (nonDisponibile) corpo.append(nodo(doc, 'p', '', t('remoto.list.unavailable')));
  else corpo.append(nodo(doc, 'b', '', t('remoto.chat.offTitle')), nodo(doc, 'p', '', t('remoto.chat.offBody')), apriSchermata(doc, onApri));
  avviso.append(corpo);
  return avviso;
}

/** 4 — la carta della revoca: il telefono, come una riga dell'elenco. */
export function creaBloccoCartaRevoca(doc, azione) {
  const blocco = nodo(doc, 'div', 'talos-approval__automazione talos-telefoni-chat');
  blocco.dataset.telefoniRevoca = '';
  const v = azione?.telefono ?? {};
  blocco.append(rigaTelefonoInChat(doc, { id: v.idCorto, nome: v.nome, inLinea: v.inLinea, ultimaVoltaAlle: v.ultimaVoltaAlle }));
  return blocco;
}

export function testiCartaRevoca(azione) {
  return {
    badge: t('remoto.chat.revokeCard.badge'),
    bersaglio: azione?.telefono?.nome || t('remoto.confirm.unnamed'),
    perche: t('remoto.chat.revokeCard.why'),
    motivo: '',
    nota: t('remoto.chat.revokeCard.note'),
  };
}

/** La carta del QR (owner 18/10: sempre, anche in Accesso pieno): niente blocco, la domanda dice tutto. */
export function creaBloccoCartaQr(doc) {
  const blocco = nodo(doc, 'div', 'talos-approval__automazione talos-telefoni-chat');
  blocco.dataset.telefoniCartaQr = '';
  blocco.append(nodo(doc, 'p', 'td-prose', t('remoto.pair.power')), nodo(doc, 'p', 'td-subtle', t('remoto.chat.pairCard.detail')));
  return blocco;
}

export function testiCartaQr() {
  return {
    badge: t('remoto.chat.pairCard.badge'),
    bersaglio: t('remoto.chat.pairCard.target'),
    perche: t('remoto.chat.pairCard.why'),
    motivo: '',
    nota: t('remoto.chat.pairCard.note'),
  };
}

/** 5 — Accesso pieno: la revoca fatta senza carta. Il segno sulla riga (quello delle automazioni) e il blocco col nome. */
export function segnaRevocaSenzaCarta({ riga, corpo = null, nome, onApri }, opzioni = {}) {
  if (!riga || riga.dataset.senzaCarta === 'si') return;
  const doc = opzioni.document || riga.ownerDocument || globalThis.document;
  riga.dataset.senzaCarta = 'si';
  const segno = nodo(doc, 'span', 'talos-badge talos-badge--warning talos-badge--sm talos-tool-row__senza-carta', t('sezioni.automations.v2.unasked.badge'));
  segno.title = t('sezioni.automations.v2.unasked.title');
  const prima = riga.querySelector(':scope > .talos-voce__meta') || riga.querySelector(':scope > .talos-dot');
  if (prima) prima.before(segno); else riga.append(segno);
  if (!corpo) return;
  const blocco = nodo(doc, 'div', 'talos-approval__automazione talos-tool-row__senza-carta-blocco talos-telefoni-chat');
  blocco.dataset.telefoniSenzaCarta = '';
  blocco.append(nodo(doc, 'b', '', t('sezioni.automations.v2.unasked.title')), nodo(doc, 'p', '', t('remoto.chat.unaskedBody', { name: nome || t('remoto.confirm.unnamed') })), apriSchermata(doc, onApri));
  corpo.prepend(blocco);
}

/** Il nome del telefono dall'esito della revoca («Disconnected "Pixel" (id …)»), per il blocco dell'Accesso pieno. */
export function nomeDallEsitoRevoca(testo) {
  const m = /^Disconnected ("(?:[^"\\]|\\.)*")/u.exec(String(testo ?? ''));
  if (!m) return '';
  try { return JSON.parse(m[1]); } catch { return ''; }
}
