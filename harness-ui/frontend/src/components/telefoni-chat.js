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
import { creaApprovazione } from './conversazione.js';
import { svgDelQr, dettaglioTelefono, mmss, rigaCartellaInCarta, codiceInGruppi } from './remoto.js';

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
/* R5.13 corsa 2 (24/10/2026, bozzetto 3b): `titolo` per un blocco che non è una revoca («Inviato senza chiedere: …»), e `onApri: null`
   per un blocco senza «Apri Dispositivi collegati» (l'invio di un file non ha niente da gestire lì). */
export function segnaRevocaSenzaCarta({ riga, corpo = null, nome, onApri, frase = null, titolo = null }, opzioni = {}) {
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
  blocco.append(nodo(doc, 'b', '', titolo ?? t('sezioni.automations.v2.unasked.title')), nodo(doc, 'p', '', frase ?? t('remoto.chat.unaskedBody', { name: nome || t('remoto.confirm.unnamed') })));
  if (typeof onApri === 'function') blocco.append(apriSchermata(doc, onApri));
  corpo.prepend(blocco);
}

/** Il nome del telefono dall'esito della revoca («Disconnected "Pixel" (id …)»), per il blocco dell'Accesso pieno. */
export function nomeDallEsitoRevoca(testo) {
  const m = /^Disconnected ("(?:[^"\\]|\\.)*")/u.exec(String(testo ?? ''));
  if (!m) return '';
  try { return JSON.parse(m[1]); } catch { return ''; }
}

/*
 * 6 — R5.12 (owner 23/10/2026): le CARTELLE dei dispositivi dalla chat. Consentire chiede sempre (anche in Accesso pieno), togliere
 *   chiede tranne in Accesso pieno (come la revoca del dispositivo). La carta è la stessa delle altre: il dispositivo come nell'elenco
 *   (`rigaTelefonoInChat`) e la cartella come nella carta del consenso (`rigaCartellaInCarta`), così chi ha già visto la carta sotto
 *   l'icona «Dispositivi collegati» riconosce questa.
 */
export function creaBloccoCartaCartella(doc, azione) {
  const blocco = nodo(doc, 'div', 'talos-approval__automazione talos-telefoni-chat');
  blocco.dataset.telefoniCartella = azione?.tipo === 'remote_phone_folder_revoke' ? 'togli' : azione?.tipo === 'remote_phone_folder_unblock' ? 'sblocca' : 'consenti';
  const v = azione?.telefono ?? {};
  blocco.append(
    rigaTelefonoInChat(doc, { id: v.idCorto, nome: v.nome, inLinea: v.inLinea, ultimaVoltaAlle: v.ultimaVoltaAlle }),
    rigaCartellaInCarta(doc, azione?.cartella),
  );
  return blocco;
}

export function testiCartaCartella(azione) {
  const togli = azione?.tipo === 'remote_phone_folder_revoke';
  const name = azione?.telefono?.nome || t('remoto.confirm.unnamed');
  const folder = azione?.cartella?.nome || '';
  /* owner 27/10/2026: sbloccare dalla chat (contratto cartelle bloccate, giro 2, B4) — la carta c'è sempre */
  if (azione?.tipo === 'remote_phone_folder_unblock') {
    return {
      badge: t('remoto.chat.folderUnblockCard.badge'),
      bersaglio: t('remoto.chat.folderUnblockCard.target', { name, folder }),
      perche: t('remoto.chat.folderUnblockCard.why'),
      motivo: '',
      nota: t('remoto.chat.folderUnblockCard.note'),
    };
  }
  return {
    badge: t(togli ? 'remoto.chat.folderRevokeCard.badge' : 'remoto.consent.badge'),
    bersaglio: t(togli ? 'remoto.chat.folderRevokeCard.target' : 'remoto.chat.folderAllowCard.target', { name, folder }),
    perche: t(togli ? 'remoto.chat.folderRevokeCard.why' : 'remoto.chat.folderAllowCard.why'),
    motivo: '',
    nota: t(togli ? 'remoto.chat.folderRevokeCard.note' : 'remoto.chat.folderAllowCard.note'),
  };
}

/** Dispositivo e cartella dall'esito di `remote_phone_folder_revoke` («"Pixel" (id …) can no longer work in "progetto" (…)»), per il
 *  blocco dell'Accesso pieno. */
export function nomiDallEsitoRevocaCartella(testo) {
  const m = /^("(?:[^"\\]|\\.)*") \(id [^)]*\) can no longer work in ("(?:[^"\\]|\\.)*")/u.exec(String(testo ?? ''));
  if (!m) return { nome: '', cartella: '' };
  try { return { nome: JSON.parse(m[1]), cartella: JSON.parse(m[2]) }; } catch { return { nome: '', cartella: '' }; }
}

/*
 * 7 — R5.14 (owner 23/10/2026 sera, bozzetti approvati `mockup-r514-*`): COLLEGARE UN DISPOSITIVO DALLA CHAT. Remoto spento ⇒ la
 *   carta lo accende col clic della persona, con la scelta del ponte (le stesse righe di «Solo la prima volta», `remoto.js`); il
 *   modello può chiederlo con `remote_control`, e la carta c'è sempre, anche in Accesso pieno. ⛔ L'indirizzo di un server proprio
 *   porta un gettone: lo scrive la persona qui e va dritto alla rotta della schermata, mai al kernel.
 */
/** Il blocco «accendi»: perché, la domanda del ponte con le due righe, e il rimando alle Impostazioni. `azione.tipo`:
 *  `remote_phone_pair` (accendere per collegare) o `remote_control` (accendere e basta). */
export function creaBloccoAccendiRemoto(doc, azione = {}) {
  const blocco = nodo(doc, 'div', 'talos-approval__automazione talos-telefoni-chat');
  blocco.dataset.telefoniAccendi = azione.tipo === 'remote_control' ? 'remoto' : 'collega';
  const attuale = azione.ponte === 'proprio' || azione.ponte === 'n0' ? azione.ponte : '';
  blocco.dataset.ponteAttuale = attuale;
  let scelta = azione.ponteProposto === 'proprio' || azione.ponteProposto === 'n0' ? azione.ponteProposto : (attuale || 'n0');
  const domanda = nodo(doc, 'p', 'talos-telefoni-chat__domanda', t('remoto.first.title'));
  domanda.id = `ponte-${Math.random().toString(36).slice(2, 8)}`;
  const gruppo = nodo(doc, 'div', 'talos-remoto-scelte');
  gruppo.setAttribute('role', 'radiogroup');
  gruppo.setAttribute('aria-labelledby', domanda.id);
  const url = nodo(doc, 'input', 'talos-input talos-remoto-scelte__url');
  url.type = 'url'; url.dataset.remotoUrl = '';
  url.placeholder = attuale === 'proprio' ? t('remoto.chat.onCard.ownKept') : t('remoto.first.ownPlaceholder');
  url.setAttribute('aria-label', t('remoto.first.own'));
  const opzione = (valore, titolo, aiuto) => {
    const b = nodo(doc, 'button', 'talos-remoto-scelta');
    b.type = 'button'; b.setAttribute('role', 'radio'); b.dataset.remotoScelta = valore;
    b.append(nodo(doc, 'span', 'talos-remoto-scelta__pallino'), nodo(doc, 'span', 'talos-remoto-scelta__titolo', titolo), nodo(doc, 'span', 'talos-remoto-scelta__aiuto td-subtle', aiuto));
    b.addEventListener('click', () => { scelta = valore; aggiorna(); if (valore === 'proprio') url.focus(); });
    return b;
  };
  const n0 = opzione('n0', t('remoto.first.n0'), t('remoto.first.n0Help'));
  const proprio = opzione('proprio', t('remoto.first.own'), t('remoto.first.ownHelp'));
  /* frecce fra le due righe, come un gruppo di radio (WAI-ARIA APG «Radio Group») */
  gruppo.addEventListener('keydown', (e) => {
    if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key) || e.target === url) return;
    e.preventDefault();
    scelta = scelta === 'n0' ? 'proprio' : 'n0';
    aggiorna();
    (scelta === 'n0' ? n0 : proprio).focus();
  });
  const errore = nodo(doc, 'p', 'td-subtle talos-remoto__errore'); errore.setAttribute('role', 'alert'); errore.hidden = true;
  errore.dataset.telefoniErrore = '';
  const aggiorna = () => {
    for (const b of [n0, proprio]) { const si = b.dataset.remotoScelta === scelta; b.setAttribute('aria-checked', String(si)); b.tabIndex = si ? 0 : -1; }
    url.hidden = scelta !== 'proprio';
    blocco.dataset.ponteScelto = scelta;
    errore.hidden = true;
  };
  gruppo.append(n0, proprio, url);
  aggiorna();
  /* ⛔ Revisione a blocco 4 (24/10/2026, REV4-COL-1, S3): dopo «Il collegamento è stato cambiato altrove» la carta si allinea al ponte
     di ADESSO (`ponteCambiatoDallaCarta` aggiorna `ponteAttuale` e poi avvisa qui). Prima cambiava solo il dato nascosto: il radio
     restava sulla scelta della nascita — n0, che la persona non aveva mai scelto — e il secondo «Accendi» la scriveva, cancellando il
     server proprio. Come Hermes davanti a un file cambiato sul disco (`preview-file.tsx:1100-1118`: «Discard and reload» oppure
     «Overwrite», mai una sovrascrittura senza una scelta esplicita): qui la carta ricarica, e sovrascrivere vuole un clic sull'altra
     riga. Il campo dell'indirizzo si svuota: un server proprio già impostato si tiene lasciandolo vuoto (il segnaposto lo dice). */
  blocco.addEventListener('talos:ponte-attuale', () => {
    const ora = blocco.dataset.ponteAttuale;
    scelta = ora === 'proprio' ? 'proprio' : 'n0';
    url.value = '';
    url.placeholder = ora === 'proprio' ? t('remoto.chat.onCard.ownKept') : t('remoto.first.ownPlaceholder');
    aggiorna();
  });
  const perche = nodo(doc, 'p', 'td-prose', t(azione.tipo === 'remote_control' ? 'remoto.chat.onCard.whyOn' : 'remoto.chat.onCard.whyPair'));
  blocco.append(perche, domanda, gruppo, nodo(doc, 'p', 'td-subtle', t('remoto.first.later')), errore);
  return blocco;
}

/** Che cosa scrivere alla rotta della schermata prima del «sì»: `{relay}` se il ponte cambia, `{relay:null}` se resta quello, o
 *  `{errore}` (un server proprio scelto senza indirizzo, e nessuno già impostato). */
export function sceltaDelPonte(blocco) {
  const scelta = blocco?.dataset?.ponteScelto === 'proprio' ? 'proprio' : 'n0';
  const attuale = blocco?.dataset?.ponteAttuale ?? '';
  if (scelta === 'n0') return { relay: attuale === 'n0' ? null : { modo: 'n0' } };
  const url = String(blocco.querySelector('[data-remoto-url]')?.value ?? '').trim();
  if (url) return { relay: { modo: 'proprio', url } };
  if (attuale === 'proprio') return { relay: null };
  return { errore: t('remoto.chat.onCard.ownMissing') };
}

/**
 * ⛔ Revisione a blocco 3 (24/10/2026, D-C2, S3): il ponte della carta è una FOTOGRAFIA della sua nascita; se intanto la persona l'ha
 * cambiato altrove (la schermata, un'altra carta), scrivere la scelta di questa carta lo cancellerebbe — anche l'indirizzo col gettone
 * del server proprio (misurato: tre strade). Dato lo stato di ADESSO: `true` se il ponte non è più quello della carta (e la carta si
 * aggiorna, così il secondo clic, fatto dopo aver guardato, scrive davvero).
 */
export function ponteCambiatoDallaCarta(blocco, statoOra) {
  const modo = statoOra?.relay?.modo === 'proprio' || statoOra?.relay?.modo === 'n0' ? statoOra.relay.modo : '';
  if (!blocco?.dataset || modo === (blocco.dataset.ponteAttuale ?? '')) return false;
  blocco.dataset.ponteAttuale = modo;
  /* REV4-COL-1 (24/10/2026): anche la scelta VISIBILE si sposta sul ponte di adesso (`creaBloccoAccendiRemoto` ascolta), così «controlla
     la scelta qui sopra» mostra la verità e il secondo clic, senza altri tocchi, non scrive niente */
  const Evento = blocco.ownerDocument?.defaultView?.Event ?? globalThis.Event;
  if (typeof blocco.dispatchEvent === 'function' && Evento) blocco.dispatchEvent(new Evento('talos:ponte-attuale'));
  return true;
}

/** Un errore detto nel blocco (la rotta ha rifiutato l'indirizzo, o manca): resta la carta, la persona corregge. */
export function mostraErroreNelBlocco(blocco, testo) {
  const p = blocco?.querySelector('[data-telefoni-errore]');
  if (!p) return;
  p.textContent = String(testo ?? '');
  p.hidden = !testo;
}

export function testiCartaAccendi(azione = {}) {
  return {
    badge: t('remoto.chat.onCard.badge'),
    bersaglio: t('remoto.chat.onCard.target'),
    perche: '',
    motivo: '',
    nota: t('remoto.chat.onCard.note'),
  };
}

/** Il blocco «spegni»: che cosa succede, e chi è in linea adesso (verrà staccato). */
export function creaBloccoSpegniRemoto(doc, azione = {}) {
  const blocco = nodo(doc, 'div', 'talos-approval__automazione talos-telefoni-chat');
  blocco.dataset.telefoniSpegni = '';
  blocco.append(nodo(doc, 'p', 'td-prose', t('remoto.chat.offCard.why')));
  const n = Number.isSafeInteger(azione.inLinea) ? azione.inLinea : 0;
  if (n > 0) blocco.append(nodo(doc, 'p', 'td-subtle', tn('remoto.chat.offCard.onlineOne', 'remoto.chat.offCard.onlineMany', n, { n })));
  return blocco;
}

export function testiCartaSpegni() {
  return {
    badge: t('remoto.chat.offCard.badge'),
    bersaglio: t('remoto.chat.onCard.target'),
    perche: '',
    motivo: '',
    nota: t('remoto.chat.onCard.note'),
  };
}

/**
 * La conferma delle 6 cifre DENTRO la chat (bozzetto 5), al posto della finestra «Collegare questo dispositivo?»: il dispositivo, il
 *   codice, la frase, «Collega» / «Rifiuta». ⛔ Il fuoco NON va su «Collega» da solo (come la carta del consenso): un Invio battuto
 *   nel compositore non deve poter collegare un dispositivo. `conferma(id)` e `rifiuta(id)` sono le rotte della schermata; `onFine
 *   ({esito, nome, restano})` aggiorna la riga. Torna il blocco.
 */
export function creaBloccoConfermaInChat(doc, attesa, { conferma, rifiuta, stato = null, onFine = null } = {}) {
  const nome = attesa?.nome || t('remoto.confirm.unnamed');
  const { scheda, perche, piede, pulsanti } = creaApprovazione({ badge: t('remoto.chat.pairCard.badge'), bersaglio: nome, perche: '', nota: '' }, { document: doc });
  scheda.dataset.telefoniConferma = '';
  scheda.setAttribute('role', 'group');
  scheda.setAttribute('aria-label', `${t('remoto.confirm.title')} ${nome}`);
  const telefono = nodo(doc, 'div', 'talos-remoto-telefono');
  const icona = nodo(doc, 'span', 'talos-remoto-telefono__icona');
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'i'); svg.setAttribute('aria-hidden', 'true');
  const uso = doc.createElementNS('http://www.w3.org/2000/svg', 'use'); uso.setAttribute('href', '#i-phone'); svg.append(uso); icona.append(svg);
  telefono.append(icona, nodo(doc, 'strong', 'talos-remoto-telefono__nome', nome));
  if (attesa?.piattaforma) telefono.append(nodo(doc, 'span', 'talos-remoto-telefono__piattaforma td-subtle', attesa.piattaforma));
  const codice = nodo(doc, 'p', 'talos-remoto-codice', codiceInGruppi(attesa?.codice ?? ''));
  codice.dataset.remotoCodice = '';
  const corpo = nodo(doc, 'div', 'talos-approval__automazione talos-telefoni-chat__conferma');
  corpo.append(telefono, codice, nodo(doc, 'p', 'td-prose talos-remoto__centro', t('remoto.confirm.body')));
  perche.replaceWith(corpo);
  const { unaVolta: collega, sessione, nega: no } = pulsanti;
  sessione.remove();
  piede.querySelector('.talos-approval__foot-note')?.remove();
  collega.textContent = t('remoto.confirm.connect'); collega.dataset.remotoCollega = '';
  no.textContent = t('remoto.confirm.reject'); no.dataset.remotoRifiuta = '';
  const chiudi = (frase) => {
    scheda.dataset.telefoniConferma = 'chiusa';
    piede.remove();
    corpo.replaceChildren(nodo(doc, 'p', 'td-prose', frase));
  };
  collega.addEventListener('click', async () => {
    collega.disabled = true; no.disabled = true;
    try {
      const r = await conferma(attesa.id);
      const chi = r?.telefono?.nome ?? nome;
      chiudi(t('remoto.done.body', { name: chi }));
      onFine?.({ esito: 'collegato', nome: chi });
    } catch (e) {
      chiudi(e?.messaggio ?? e?.message ?? t('remoto.pair.expiredBody'));
      onFine?.({ esito: 'scaduto' });
    }
  });
  no.addEventListener('click', async () => {
    collega.disabled = true; no.disabled = true;
    try { await rifiuta(attesa.id); } catch { /* sotto si rilegge lo stato */ }
    let s = null;
    try { s = await stato?.(); } catch { s = null; }
    const restano = Math.max(0, 5 - (s?.accoppiamento?.sbagliati ?? 0));
    chiudi(tn('remoto.rejected.bodyOne', 'remoto.rejected.bodyMany', restano, { count: restano }));
    onFine?.({ esito: 'rifiutato', restano });
  });
  return scheda;
}

/**
 * La carta «accendi» della PORTA DELLA PERSONA (menu «+» e `/connect`, bozzetto 3): la stessa carta d'approvazione, ma risponde alla
 *   finestra, non al kernel — il clic della persona è già la richiesta. `onAccendi(relay)` scrive il ponte (se cambia) e accende, e
 *   torna una promessa: se fallisce, l'errore resta nella carta. `onNonOra()` chiude.
 */
export function creaCartaAccendiDellaPersona(doc, azione, { onAccendi, onNonOra } = {}) {
  const testi = testiCartaAccendi(azione);
  const { scheda, perche, piede, pulsanti } = creaApprovazione({ badge: testi.badge, bersaglio: testi.bersaglio, perche: '', nota: testi.nota }, { document: doc });
  scheda.dataset.telefoniAccendiPersona = '';
  const blocco = creaBloccoAccendiRemoto(doc, azione);
  perche.replaceWith(blocco);
  const { unaVolta: accendi, sessione, nega: nonOra } = pulsanti;
  sessione.remove();
  accendi.textContent = t('remoto.chat.onCard.approvePair'); accendi.dataset.approvaUnaVolta = '';
  nonOra.textContent = t('remoto.chat.onCard.deny'); nonOra.dataset.nega = '';
  accendi.addEventListener('click', async () => {
    const { relay, errore } = sceltaDelPonte(blocco);
    if (errore) { mostraErroreNelBlocco(blocco, errore); return; }
    accendi.disabled = true; nonOra.disabled = true;
    try { await onAccendi?.(relay, blocco); } // D-C2: il blocco va a chi accende, che confronta il ponte con lo stato di adesso
    catch (e) { mostraErroreNelBlocco(blocco, e?.messaggio ?? e?.message ?? ''); accendi.disabled = false; nonOra.disabled = false; return; }
    piede.remove();
  });
  nonOra.addEventListener('click', () => { piede.remove(); blocco.replaceChildren(nodo(doc, 'p', 'td-subtle', t('remoto.chat.connect.notNow'))); onNonOra?.(); });
  return scheda;
}
