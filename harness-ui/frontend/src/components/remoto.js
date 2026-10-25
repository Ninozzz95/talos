/*
 * IL CONTROLLO REMOTO nella finestra del desktop (18/10/2026) — il mockup v5 approvato dall'owner il 17/10
 * (`MOCKUP-ACCOPPIAMENTO-TELEFONO-2026-10-17.html`, percorso «app desktop»), alla lettera, coi pezzi del prodotto:
 *   1. «Solo la prima volta»: come arriva il telefono al PC fuori casa (server gratuiti di n0, o il mio server);
 *   2. «Collega il tuo telefono»: il QR vero, «scade fra m:ss», «vale una volta», «cifrato da capo a capo», Copia collegamento,
 *      Annulla;
 *   3. «Collegare questo telefono?»: nome e piattaforma del telefono, il codice di 6 cifre, Rifiuta / Collega (Invio = Collega);
 *   4. «Collegamento rifiutato» coi tentativi rimasti, e «Nuovo QR».
 * ⛔ Pezzi esistenti, nessuna veste nuova: la modale è `apriModale` (`modale-td.js`), il testo `td-prose` / `td-subtle`, il piede
 *   `td-detail-footer`, i pulsanti `talos-button`. La scelta del relay NON è un controllo nativo: due opzioni `role="radio"`.
 * ⛔ Le rotte sono `/api/v1/remote…` (solo dalla finestra); il QR lo calcola il server (`moduli`), come per la CLI.
 */
import { t, tn } from './lingua.js';
import { apriModale, chiudiModale } from './modale-td.js';
import { apriMenuContestuale, creaMenuContestuale } from './schede.js';

const ATTESA_POLL_MS = 1000;

function nodo(doc, tag, classe, testo) {
  const n = doc.createElement(tag);
  if (classe) n.className = classe;
  if (testo !== undefined && testo !== null) n.textContent = String(testo);
  return n;
}

function pulsante(doc, tipo, testo, dato) {
  const b = nodo(doc, 'button', `talos-button talos-button--${tipo} talos-button--sm`, testo);
  b.type = 'button';
  if (dato) b.dataset[dato] = '';
  return b;
}

export function mmss(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Il codice di 6 cifre in due gruppi da tre, come nel mockup («482 913»). */
export function codiceInGruppi(codice) {
  const c = String(codice ?? '');
  return c.length === 6 ? `${c.slice(0, 3)} ${c.slice(3)}` : c;
}

/** Il QR come SVG dai moduli del server (`{ lato, righe: ['0101…'] }`), coi colori del tema e il margine di 4 moduli. */
export function svgDelQr(doc, moduli, etichetta) {
  const NS = 'http://www.w3.org/2000/svg';
  const lato = Number(moduli?.lato) || 0;
  const svg = doc.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `-4 -4 ${lato + 8} ${lato + 8}`);
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', etichetta);
  svg.setAttribute('class', 'talos-remoto-qr__svg');
  const fondo = doc.createElementNS(NS, 'rect');
  fondo.setAttribute('x', '-4'); fondo.setAttribute('y', '-4'); fondo.setAttribute('width', String(lato + 8)); fondo.setAttribute('height', String(lato + 8));
  fondo.setAttribute('class', 'talos-remoto-qr__fondo');
  let d = '';
  (moduli?.righe ?? []).forEach((riga, y) => { for (let x = 0; x < riga.length; x += 1) if (riga[x] === '1') d += `M${x} ${y}h1v1h-1z`; });
  const punti = doc.createElementNS(NS, 'path');
  punti.setAttribute('d', d);
  punti.setAttribute('class', 'talos-remoto-qr__punti');
  svg.append(fondo, punti);
  return svg;
}

const dataBreve = (ms, lingua) => new Intl.DateTimeFormat(lingua, { day: '2-digit', month: '2-digit' }).format(new Date(ms));
/* Il mockup: «visto ieri alle 18:20». Oggi, ieri, o la data. */
const vistoQuando = (ms, lingua, ora) => {
  const d = new Date(ms); const oggi = new Date(ora); const ieri = new Date(ora); ieri.setDate(ieri.getDate() - 1);
  const time = new Intl.DateTimeFormat(lingua, { hour: '2-digit', minute: '2-digit' }).format(d);
  if (d.toDateString() === oggi.toDateString()) return t('remoto.list.lastSeenToday', { time });
  if (d.toDateString() === ieri.toDateString()) return t('remoto.list.lastSeenYesterday', { time });
  return t('remoto.list.lastSeenDate', { date: dataBreve(ms, lingua), time });
};

/**
 * 24/10/2026 (contratto col Mobile, tavola 1 del bozzetto remoto) — il CODICE BREVE di un PC: i primi 4 caratteri del suo `pcId`, in
 * minuscolo. Lo stesso calcolo sul dispositivo e qui: la persona riconosce il computer giusto quando ce ne sono due con lo stesso nome.
 */
export function codiceBrevePc(pcId) {
  return typeof pcId === 'string' && pcId.length >= 4 ? pcId.slice(0, 4).toLowerCase() : '';
}

/** La riga di dettaglio di un telefono (mockup: «dal 17/10 · diretto, 38 ms», «dal 02/10 · visto ieri alle 18:20»). */
export function dettaglioTelefono(v, { lingua = 'it', ora = Date.now() } = {}) {
  const parti = [];
  if (Number.isFinite(v.collegatoAlle)) parti.push(t('remoto.list.since', { date: dataBreve(v.collegatoAlle, lingua) }));
  if (v.revocatoAlle) parti.push(t(v.revocatoDa === 'telefono' ? 'remoto.list.revokedPhone' : 'remoto.list.revokedPc'));
  else if (v.inLinea && v.percorso && Number.isFinite(v.percorso.rttMs)) parti.push(t(v.percorso.tipo === 'diretto' ? 'remoto.list.direct' : 'remoto.list.relay', { ms: v.percorso.rttMs }));
  else if (!v.inLinea && Number.isFinite(v.ultimaVoltaAlle)) parti.push(vistoQuando(v.ultimaVoltaAlle, lingua, ora));
  return parti.join(' · ');
}

/**
 * La sezione «Telefoni collegati» delle Impostazioni (mockup v5, «Gestire i telefoni»): l'elenco, «Revoca», «Collega un altro
 * telefono» e la scelta «Fuori casa» con «Cambia». `onRevoca(id)`, `onCollega()`, `onCambiaRelay()` li dà chi ospita.
 */
export function disegnaTelefoni(contenitore, stato, {
  onRevoca, onCollega, onCambiaRelay, lingua = 'it', ora = Date.now(), document: doc = globalThis.document,
  /* R5.12: `cartelleDi[id]` = le cartelle consentite del dispositivo (array), null se non si sono lette, assente se non ancora chieste */
  cartelleDi = null, onRevocaCartella = null, onAggiungiCartella = null,
} = {}) {
  if (!contenitore) return;
  /* Titolo e introduzione li dà già la testata della sezione (mockup: «Telefoni collegati» + la frase sulla revoca): qui niente doppioni. */
  if (!stato || stato.disponibile === false) {
    contenitore.replaceChildren(nodo(doc, 'p', 'td-subtle', t('remoto.list.unavailable')));
    return;
  }
  const vivi = (stato.telefoni ?? []).filter((v) => !v.revocatoAlle);
  const elenco = nodo(doc, 'div', 'talos-remoto-elenco');
  elenco.dataset.remotoElenco = '';
  if (!vivi.length) elenco.append(nodo(doc, 'p', 'td-subtle', t('remoto.list.empty')));
  for (const v of vivi) {
    const riga = nodo(doc, 'div', 'talos-remoto-riga');
    riga.dataset.remotoTelefono = v.id;
    const testo = nodo(doc, 'div');
    testo.append(nodo(doc, 'strong', 'talos-remoto-riga__nome', v.nome || t('remoto.confirm.unnamed')), nodo(doc, 'span', 'talos-remoto-riga__dettaglio td-subtle', dettaglioTelefono(v, { lingua, ora })));
    const statoRiga = nodo(doc, 'span', 'talos-remoto-riga__stato', t(v.inLinea ? 'remoto.list.online' : 'remoto.list.offline'));
    statoRiga.dataset.inLinea = String(Boolean(v.inLinea));
    const revoca = pulsante(doc, 'secondary', t('remoto.list.revoke'), 'remotoRevoca');
    revoca.classList.add('talos-remoto__rifiuta'); // mockup: bordo, testo rosso
    revoca.addEventListener('click', () => onRevoca?.(v.id));
    riga.append(testo, statoRiga, revoca);
    elenco.append(riga);
    if (cartelleDi && Object.hasOwn(cartelleDi, v.id)) {
      elenco.append(sezioneCartelle(doc, v, cartelleDi[v.id], { onRevocaCartella, onAggiungiCartella, lingua, ora, radiceMenu: contenitore.ownerDocument?.body ?? doc.body }));
    }
  }
  const collega = pulsante(doc, 'primary', t(vivi.length ? 'remoto.list.connectAnother' : 'remoto.list.connectFirst'), 'remotoCollegaAltro');
  collega.addEventListener('click', () => onCollega?.());
  const pezzi = [elenco, collega];
  if (stato.relay) {
    const relay = nodo(doc, 'div', 'talos-remoto-relay');
    relay.append(nodo(doc, 'span', 'td-subtle', t('remoto.list.relayLabel')), nodo(doc, 'span', null, stato.relay.modo === 'proprio' ? t('remoto.list.relayOwn', { url: stato.relay.url }) : t('remoto.list.relayN0')));
    const cambia = pulsante(doc, 'ghost', t('remoto.list.relayChange'), 'remotoCambiaRelay');
    cambia.addEventListener('click', () => onCambiaRelay?.());
    relay.append(cambia);
    pezzi.push(relay);
  }
  /* «Questo computer · <nome> · <codice>»: solo a remoto acceso (spento, il PC non ha ancora un'identità sul ponte) */
  if (codiceBrevePc(stato.pcId)) {
    const questo = nodo(doc, 'div', 'talos-remoto-relay');
    questo.dataset.remotoQuestoPc = '';
    questo.append(nodo(doc, 'span', 'td-subtle', t('remoto.list.thisComputer')),
      nodo(doc, 'span', 'talos-mono', t('remoto.list.thisComputerValue', { name: stato.nomePc || t('remoto.confirm.unnamed'), code: codiceBrevePc(stato.pcId) })));
    pezzi.push(questo);
  }
  contenitore.replaceChildren(...pezzi);
}

/**
 * `api`: `{ stato(), imposta(x), apri(), chiudi(gettone), conferma(id), rifiuta(id) }` → promesse (le chiamate HTTP le fa chi
 * ospita). `copia(testo)`: gli appunti. `orologio`: per le prove.
 */
export function creaRemotoUi({ api, copia = null, document: doc = globalThis.document, orologio = () => Date.now(), timer = globalThis } = {}) {
  let poll = null;
  let conto = null;
  const ferma = () => { if (poll) timer.clearInterval(poll); if (conto) timer.clearInterval(conto); poll = null; conto = null; };

  const sopratitolo = (chiave) => { const e = nodo(doc, 'p', 'talos-remoto__sopratitolo', t(chiave)); e.dataset.remotoSopratitolo = ''; return e; };

  /* 1 — Solo la prima volta */
  function primaVolta() {
    return new Promise((risolvi) => {
      let scelta = 'n0';
      const corpo = nodo(doc, 'p', 'td-prose', t('remoto.first.body'));
      const gruppo = nodo(doc, 'div', 'talos-remoto-scelte');
      gruppo.setAttribute('role', 'radiogroup');
      gruppo.setAttribute('aria-label', t('remoto.first.title'));
      const url = nodo(doc, 'input', 'talos-input talos-remoto-scelte__url');
      url.type = 'url'; url.placeholder = t('remoto.first.ownPlaceholder'); url.dataset.remotoUrl = ''; url.hidden = true;
      const opzione = (valore, titolo, aiuto) => {
        const b = nodo(doc, 'button', 'talos-remoto-scelta');
        b.type = 'button'; b.setAttribute('role', 'radio'); b.dataset.remotoScelta = valore;
        b.append(nodo(doc, 'span', 'talos-remoto-scelta__pallino'), nodo(doc, 'span', 'talos-remoto-scelta__titolo', titolo), nodo(doc, 'span', 'talos-remoto-scelta__aiuto td-subtle', aiuto));
        b.addEventListener('click', () => { scelta = valore; aggiorna(); if (valore === 'proprio') url.focus(); });
        return b;
      };
      const n0 = opzione('n0', t('remoto.first.n0'), t('remoto.first.n0Help'));
      const proprio = opzione('proprio', t('remoto.first.own'), t('remoto.first.ownHelp'));
      const aggiorna = () => {
        for (const b of [n0, proprio]) { const si = b.dataset.remotoScelta === scelta; b.setAttribute('aria-checked', String(si)); b.tabIndex = si ? 0 : -1; }
        url.hidden = scelta !== 'proprio';
      };
      gruppo.append(n0, proprio, url);
      aggiorna();
      const dopo = nodo(doc, 'p', 'td-subtle', t('remoto.first.later'));
      const errore = nodo(doc, 'p', 'td-subtle talos-remoto__errore'); errore.setAttribute('role', 'alert'); errore.hidden = true;
      const piede = nodo(doc, 'div', 'td-detail-footer talos-remoto__piede');
      const annulla = pulsante(doc, 'secondary', t('chat.common.cancel'));
      const continua = pulsante(doc, 'primary', t('remoto.first.continue'), 'remotoContinua');
      annulla.addEventListener('click', () => { chiudiModale(); });
      continua.addEventListener('click', async () => {
        const relay = scelta === 'n0' ? { modo: 'n0' } : { modo: 'proprio', url: url.value.trim() };
        continua.disabled = true;
        try { await api.imposta({ relay }); risolvi(true); }
        catch (e) { errore.textContent = e?.messaggio ?? e?.message ?? ''; errore.hidden = false; continua.disabled = false; }
      });
      piede.append(annulla, continua);
      apriModale(t('remoto.first.title'), [sopratitolo('remoto.eyebrowFirst'), corpo, gruppo, dopo, errore, piede], { document: doc, suChiusura: () => risolvi(false) });
    });
  }

  /* 3 — Collegare questo telefono? */
  function conferma(attesa) {
    ferma();
    const scheda = nodo(doc, 'div', 'talos-remoto-telefono');
    const icona = nodo(doc, 'span', 'talos-remoto-telefono__icona');
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'i'); svg.setAttribute('aria-hidden', 'true');
    const uso = doc.createElementNS('http://www.w3.org/2000/svg', 'use'); uso.setAttribute('href', '#i-phone'); svg.append(uso); icona.append(svg);
    scheda.append(icona, nodo(doc, 'strong', 'talos-remoto-telefono__nome', attesa.nome || t('remoto.confirm.unnamed')));
    if (attesa.piattaforma) scheda.append(nodo(doc, 'span', 'talos-remoto-telefono__piattaforma td-subtle', attesa.piattaforma));
    const codice = nodo(doc, 'p', 'talos-remoto-codice', codiceInGruppi(attesa.codice));
    codice.dataset.remotoCodice = '';
    const testo = nodo(doc, 'p', 'td-prose talos-remoto__centro', t('remoto.confirm.body'));
    const piede = nodo(doc, 'div', 'td-detail-footer talos-remoto__piede');
    const rifiuta = pulsante(doc, 'secondary', t('remoto.confirm.reject'), 'remotoRifiuta');
    rifiuta.classList.add('talos-remoto__rifiuta'); // mockup: bordo come «Annulla», testo rosso
    const collega = pulsante(doc, 'primary', t('remoto.confirm.connect'), 'remotoCollega');
    rifiuta.addEventListener('click', async () => {
      rifiuta.disabled = true; collega.disabled = true;
      try { await api.rifiuta(attesa.id); } catch { /* sotto si rilegge lo stato */ }
      const s = await api.stato().catch(() => null);
      rifiutato(s);
    });
    collega.addEventListener('click', async () => {
      rifiuta.disabled = true; collega.disabled = true;
      try { const r = await api.conferma(attesa.id); fatto(r?.telefono?.nome ?? attesa.nome); }
      catch (e) { scaduto(e?.messaggio ?? e?.message); }
    });
    piede.append(rifiuta, collega);
    apriModale(t('remoto.confirm.title'), [sopratitolo('remoto.eyebrow'), scheda, codice, testo, piede], { document: doc });
    /* Invio = «Collega» (mockup: «premi Invio») perché il fuoco parte da lì; Esc chiude come ogni modale. ⛔ Niente gestore di Invio
       sul dialogo: col fuoco su «Rifiuta» avrebbe COLLEGATO il telefono (trovato da un mutante sopravvissuto, 18/10). */
    collega.focus?.({ preventScroll: true });
  }

  function rifiutato(stato) {
    const restano = Math.max(0, 5 - (stato?.accoppiamento?.sbagliati ?? 0));
    const testo = nodo(doc, 'p', 'td-prose', tn('remoto.rejected.bodyOne', 'remoto.rejected.bodyMany', restano, { count: restano }));
    const piede = nodo(doc, 'div', 'td-detail-footer talos-remoto__piede');
    const chiudi = pulsante(doc, 'secondary', t('chat.common.close'));
    const nuovo = pulsante(doc, 'primary', t('remoto.pair.newCode'), 'remotoNuovoQr');
    chiudi.addEventListener('click', () => chiudiModale());
    nuovo.addEventListener('click', () => { avvia(); });
    piede.append(chiudi, nuovo);
    apriModale(t('remoto.rejected.title'), [testo, piede], { document: doc });
  }

  function fatto(nome) {
    const testo = nodo(doc, 'p', 'td-prose', t('remoto.done.body', { name: nome || t('remoto.confirm.unnamed') }));
    const piede = nodo(doc, 'div', 'td-detail-footer talos-remoto__piede');
    const ok = pulsante(doc, 'primary', t('chat.common.close'));
    ok.addEventListener('click', () => chiudiModale());
    piede.append(ok);
    apriModale(t('remoto.done.title'), [testo, piede], { document: doc });
  }

  function scaduto(messaggio) {
    const testo = nodo(doc, 'p', 'td-prose', messaggio || t('remoto.pair.expiredBody'));
    const piede = nodo(doc, 'div', 'td-detail-footer talos-remoto__piede');
    const chiudi = pulsante(doc, 'secondary', t('chat.common.close'));
    const nuovo = pulsante(doc, 'primary', t('remoto.pair.newCode'), 'remotoNuovoQr');
    chiudi.addEventListener('click', () => chiudiModale());
    nuovo.addEventListener('click', () => { avvia(); });
    piede.append(chiudi, nuovo);
    apriModale(t('remoto.pair.title'), [testo, piede], { document: doc });
  }

  /* 2 — Collega il tuo telefono */
  async function qr() {
    let offerta;
    try { offerta = await api.apri(); }
    catch (e) {
      if (e?.code === 'PAIR_LOCKED') return bloccato(e.retryAfterMs);
      return scaduto(e?.messaggio ?? e?.message);
    }
    const visti = new Set((await api.stato().catch(() => null))?.attese?.map((a) => a.id) ?? []);
    const riquadro = nodo(doc, 'div', 'talos-remoto-qr');
    const immagine = nodo(doc, 'div', 'talos-remoto-qr__immagine');
    immagine.append(svgDelQr(doc, offerta.moduli, t('remoto.pair.qrLabel')));
    const spiega = nodo(doc, 'div', 'talos-remoto-qr__testo');
    const come = nodo(doc, 'p', 'td-prose');
    const [prima, dopo] = t('remoto.pair.how', { action: '\u0000' }).split('\u0000');
    come.append(doc.createTextNode(prima ?? ''), nodo(doc, 'strong', null, t('remoto.pair.howAction')), doc.createTextNode(dopo ?? ''));
    spiega.append(come, nodo(doc, 'p', 'td-prose', t('remoto.pair.power')));
    riquadro.append(immagine, spiega);
    const chips = nodo(doc, 'div', 'talos-remoto-chips');
    const scade = nodo(doc, 'span', 'talos-remoto-chip talos-remoto-chip--accento');
    scade.dataset.remotoScade = '';
    chips.append(scade, nodo(doc, 'span', 'talos-remoto-chip', t('remoto.pair.once')), nodo(doc, 'span', 'talos-remoto-chip', t('remoto.pair.encrypted')));
    const piede = nodo(doc, 'div', 'td-detail-footer talos-remoto__piede');
    const copiaB = pulsante(doc, 'secondary', t('remoto.pair.copy'), 'remotoCopia');
    const annulla = pulsante(doc, 'secondary', t('chat.common.cancel'), 'remotoAnnulla');
    copiaB.addEventListener('click', () => { copia?.(offerta.qr); copiaB.textContent = t('remoto.pair.copied'); });
    annulla.addEventListener('click', () => chiudiModale());
    if (typeof copia === 'function') piede.append(copiaB);
    piede.append(annulla);
    let chiusoDaNoi = false;
    apriModale(t('remoto.pair.title'), [sopratitolo('remoto.eyebrow'), riquadro, chips, piede], {
      document: doc,
      suChiusura: () => { ferma(); if (!chiusoDaNoi) api.chiudi(offerta.gettone).catch?.(() => {}); },
    });
    const segna = () => {
      const resta = offerta.scadeAlle - orologio();
      scade.textContent = resta > 0 ? t('remoto.pair.expiresIn', { time: mmss(resta) }) : t('remoto.pair.expired');
      if (resta <= 0) { chiusoDaNoi = true; ferma(); scaduto(); }
    };
    segna();
    conto = timer.setInterval(segna, 1000);
    poll = timer.setInterval(async () => {
      const s = await api.stato().catch(() => null);
      const nuova = s?.attese?.find((a) => !visti.has(a.id));
      if (nuova) { chiusoDaNoi = true; ferma(); conferma(nuova); }
    }, ATTESA_POLL_MS);
    return null;
  }

  function bloccato(ms) {
    const testo = nodo(doc, 'p', 'td-prose', t('remoto.locked.body', { time: mmss(ms ?? 0) }));
    const piede = nodo(doc, 'div', 'td-detail-footer talos-remoto__piede');
    const chiudi = pulsante(doc, 'primary', t('chat.common.close'));
    chiudi.addEventListener('click', () => chiudiModale());
    piede.append(chiudi);
    apriModale(t('remoto.locked.title'), [testo, piede], { document: doc });
  }

  /** Il gesto dell'icona e di «Collega un telefono»: la prima volta chiede il relay, poi il QR. */
  async function avvia() {
    ferma();
    const s = await api.stato().catch(() => null);
    if (s && !s.sceltaFatta) {
      const scelto = await primaVolta();
      if (!scelto) return;
    }
    await qr();
  }

  return { avvia, primaVolta, conferma, ferma };
}

/*
 * R5.12 (owner 23/10/2026, bozzetto approvato) — LE CARTELLE DEI DISPOSITIVI SUL PC: scena 7, la carta «Consenti a … di lavorare
 *   in …?» agganciata all'icona «Dispositivi collegati»; scena 8, Impostazioni › Cartelle consentite sotto ogni dispositivo.
 * ⛔ Pezzi esistenti, nessuna veste nuova: la carta d'approvazione della chat (`talos-approval`), righe e chip del remoto, il menu
 *   condiviso con Terminale, Revisione e messaggi (`schede.js`). Le azioni di una cartella stanno nel «⋯» e nel tasto destro, mai in
 *   fila (regola del 10/09).
 * ⛔ La carta NON prende il fuoco da sola e il fuoco non va mai su «Consenti»: un Invio battuto nel compositore non deve poter dare
 *   una cartella a un dispositivo. Non modale (`role="dialog"` senza `aria-modal`, nome e descrizione collegati): dubbot.com,
 *   «Modals, dialogs and accessibility» (2026) e J. Avila su WebAIM (un non modale che non copre la pagina non intrappola il fuoco),
 *   letti il 23/10/2026. Ci si arriva col clic o con Invio sull'icona, che la riapre e ci porta il fuoco.
 */
function icona(doc, id, classe = 'i') {
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', classe);
  svg.setAttribute('aria-hidden', 'true');
  const uso = doc.createElementNS('http://www.w3.org/2000/svg', 'use');
  uso.setAttribute('href', `#${id}`);
  svg.append(uso);
  return svg;
}

/** La riga di dettaglio di una cartella consentita (bozzetto: «D:\Projects\AVM · consentita oggi», «… · consentita in anticipo»). */
export function dettaglioCartella(c, { lingua = 'it', ora = Date.now() } = {}) {
  const parti = [String(c?.percorso || c?.nome || '')];
  if (c?.da === 'anticipo') parti.push(t('remoto.folders.inAdvance'));
  else if (c?.da === 'chat') parti.push(t('remoto.folders.fromChat'));
  else {
    const ms = Date.parse(c?.consentitaAlle ?? '');
    if (Number.isFinite(ms)) {
      const ieri = new Date(ora); ieri.setDate(ieri.getDate() - 1);
      if (new Date(ms).toDateString() === new Date(ora).toDateString()) parti.push(t('remoto.folders.allowedToday'));
      else if (new Date(ms).toDateString() === ieri.toDateString()) parti.push(t('remoto.folders.allowedYesterday'));
      else parti.push(t('remoto.folders.allowedOn', { date: dataBreve(ms, lingua) }));
    }
  }
  if (c?.esiste === false) parti.push(t('remoto.folders.missing'));
  return parti.filter(Boolean).join(' · ');
}

const ID_MENU_CARTELLA = 'menuCartellaDispositivo';

/** Il «⋯» di una cartella: il menu condiviso, sotto il pulsante e allineato al suo bordo destro (come il menu dei messaggi). */
function apriMenuCartella(doc, radice, sorgente, titolo, voci) {
  const menu = creaMenuContestuale(radice, { id: ID_MENU_CARTELLA, etichetta: t('remoto.folders.menuLabel') });
  /* il nodo del menu nasce una volta: il nome si riscrive a ogni apertura, o dopo un cambio di lingua resta il vecchio */
  menu.setAttribute('aria-label', t('remoto.folders.menuLabel'));
  const chiudi = () => {
    menu.hidden = true;
    menu.replaceChildren();
    for (const b of radice.querySelectorAll('[data-remoto-cartella-altro][aria-expanded="true"]')) b.setAttribute('aria-expanded', 'false');
  };
  if (!menu.dataset.remotoChiusura) {
    menu.dataset.remotoChiusura = '1';
    radice.addEventListener('pointerdown', (e) => { if (!menu.hidden && !menu.contains(e.target) && !e.target?.closest?.('[data-remoto-cartella-altro]')) chiudi(); });
    radice.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || menu.hidden) return;
      const da = radice.querySelector('[data-remoto-cartella-altro][aria-expanded="true"]');
      chiudi();
      da?.focus();
      e.stopPropagation();
    }, true);
  }
  /* un secondo clic sullo stesso «⋯» lo chiude */
  if (!menu.hidden && sorgente.getAttribute('aria-expanded') === 'true') { chiudi(); return; }
  const finestra = doc.defaultView ?? globalThis;
  const prima = sorgente.getBoundingClientRect();
  apriMenuContestuale(menu, { titolo, voci: voci.map(([testo, fai]) => [testo, fai, true]), x: prima.left, y: prima.bottom + 4, chiudi, finestra });
  const elementi = menu.querySelectorAll('[role=menuitem]');
  voci.forEach(([, , tono], i) => { if (tono === 'pericolo') elementi[i]?.classList.add('talos-remoto__rifiuta'); });
  sorgente.setAttribute('aria-expanded', 'true');
  /* ⛔ misurato DOPO l'apertura: il fuoco sulla prima voce può far scorrere la pagina (lezione del menu dei messaggi, 17/09) */
  const dopo = sorgente.getBoundingClientRect();
  const larghezza = menu.offsetWidth || 220;
  menu.style.left = `${Math.max(8, Math.min(dopo.right - larghezza, (finestra.innerWidth ?? 0) - larghezza - 8))}px`;
  menu.style.top = `${Math.round(dopo.bottom + 4)}px`;
}

/** Scena 8: «Cartelle consentite» sotto il suo dispositivo. `cartelle`: l'elenco, o null se non si è potuto leggere. */
function sezioneCartelle(doc, v, cartelle, { onRevocaCartella, onAggiungiCartella, lingua, ora, radiceMenu }) {
  const sez = nodo(doc, 'section', 'talos-card talos-inspector-card talos-remoto-cartelle');
  sez.dataset.remotoCartelle = v.id;
  const testa = nodo(doc, 'div', 'talos-inspector-card__head');
  const titolo = nodo(doc, 'b', null, t('remoto.folders.title'));
  titolo.id = `remotoCartelle-${v.id}`;
  sez.setAttribute('aria-labelledby', titolo.id);
  testa.append(icona(doc, 'i-folder'), titolo);
  sez.append(testa);
  if (cartelle === null) sez.append(nodo(doc, 'p', 'td-subtle', t('remoto.folders.unreadable')));
  else if (!cartelle?.length) sez.append(nodo(doc, 'p', 'td-subtle', t('remoto.folders.empty')));
  for (const c of cartelle ?? []) {
    const riga = nodo(doc, 'div', 'talos-remoto-riga talos-remoto-cartella');
    riga.dataset.remotoCartella = c.cartellaId;
    const testo = nodo(doc, 'div');
    testo.append(nodo(doc, 'strong', 'talos-remoto-riga__nome', c.nome), nodo(doc, 'span', 'talos-remoto-riga__dettaglio talos-mono td-subtle', dettaglioCartella(c, { lingua, ora })));
    const altro = nodo(doc, 'button', 'talos-button talos-button--ghost talos-icon-button talos-button--sm');
    altro.type = 'button';
    altro.dataset.remotoCartellaAltro = '';
    altro.setAttribute('aria-label', t('remoto.folders.more', { name: c.nome }));
    altro.setAttribute('aria-haspopup', 'menu');
    altro.setAttribute('aria-expanded', 'false');
    altro.append(icona(doc, 'i-more'));
    const apri = () => apriMenuCartella(doc, radiceMenu, altro, c.nome, [[t('remoto.folders.revoke'), () => onRevocaCartella?.(v, c), 'pericolo']]);
    altro.addEventListener('click', apri);
    riga.addEventListener('contextmenu', (e) => { e.preventDefault(); if (altro.getAttribute('aria-expanded') !== 'true') apri(); });
    riga.append(testo, altro);
    sez.append(riga);
  }
  const aggiungi = pulsante(doc, 'secondary', t('remoto.folders.add'), 'remotoAggiungiCartella');
  aggiungi.prepend(icona(doc, 'i-plus', 'i i--sm'));
  aggiungi.addEventListener('click', () => onAggiungiCartella?.(v));
  sez.append(aggiungi);
  return sez;
}

/** La riga di una cartella dentro una carta (`{ nome, percorso }`): il nome con l'icona e il percorso intero. La stessa nella carta del
 *  consenso (scena 7) e nelle carte della chat (`telefoni-chat.js`): chi la vede in un posto la riconosce nell'altro. */
export function rigaCartellaInCarta(doc, cartella) {
  const riga = nodo(doc, 'div', 'talos-remoto-riga');
  const testo = nodo(doc, 'div');
  const nomeCartella = nodo(doc, 'strong', 'talos-remoto-riga__nome');
  nomeCartella.append(icona(doc, 'i-folder', 'i i--sm'), doc.createTextNode(String(cartella?.nome ?? '')));
  testo.append(nomeCartella, nodo(doc, 'span', 'talos-remoto-riga__dettaglio talos-mono td-subtle', String(cartella?.percorso ?? '')));
  riga.append(testo);
  return riga;
}

/**
 * Scena 7: la carta del consenso di UNA richiesta (`{ richiestaId, nomeDispositivo, nome, percorso, scadeAlle }`, da
 * `GET /api/v1/remote` → `consensi`). `onConsenti`/`onNonOra` rendono una promessa: se fallisce, l'errore resta nella carta.
 * Torna `{ elemento, aggiornaScadenza(ora) }`; `aggiornaScadenza` dice false quando la richiesta è scaduta.
 */
export function creaCartaConsenso(doc, r, { onConsenti, onNonOra, onPiuTardi = null, ora = Date.now(), armata = true } = {}) {
  const nome = r.nomeDispositivo || t('remoto.confirm.unnamed');
  const carta = nodo(doc, 'div', 'talos-approval real-approval-card talos-remoto-consenso');
  carta.dataset.c = 'ApprovalCard';
  carta.dataset.remotoConsenso = r.richiestaId;
  carta.setAttribute('role', 'dialog');
  carta.tabIndex = -1;
  const testa = nodo(doc, 'div', 'talos-approval__head');
  const badge = nodo(doc, 'span', 'talos-badge talos-badge--accent');
  badge.append(icona(doc, 'i-shield', 'i i--sm'), doc.createTextNode(t('remoto.consent.badge')));
  const bersaglio = nodo(doc, 'span', 'talos-mono talos-measure talos-grow talos-truncate', nome);
  badge.id = `remotoConsenso-${r.richiestaId}-a`;
  bersaglio.id = `remotoConsenso-${r.richiestaId}-b`;
  carta.setAttribute('aria-labelledby', `${badge.id} ${bersaglio.id}`);
  testa.append(badge, bersaglio);
  /* owner 24/10/2026: la carta sospesa copre «Nuova sessione» e la ricerca; «Più tardi» la nasconde come Esc (l'icona la riporta).
     Sta nella testata, non accanto a «Consenti»/«Non ora»: nel piede le azioni restano due. */
  if (typeof onPiuTardi === 'function') {
    const dopo = nodo(doc, 'button', 'talos-button talos-button--ghost talos-button--sm', t('remoto.consent.later'));
    dopo.type = 'button';
    dopo.dataset.remotoPiuTardi = '';
    dopo.title = t('remoto.consent.laterHelp');
    dopo.addEventListener('click', () => onPiuTardi());
    testa.append(dopo);
  }
  const perche = nodo(doc, 'p', 'talos-approval__why assistant-copy', t('remoto.consent.why', { name: nome }));
  perche.id = `remotoConsenso-${r.richiestaId}-c`;
  carta.setAttribute('aria-describedby', perche.id);
  const blocco = nodo(doc, 'div', 'talos-approval__automazione');
  const riga = rigaCartellaInCarta(doc, r);
  const scade = nodo(doc, 'span', 'talos-remoto-chip talos-remoto-chip--accento');
  scade.dataset.remotoConsensoScade = '';
  riga.append(scade);
  const errore = nodo(doc, 'p', 'talos-remoto__errore');
  errore.setAttribute('role', 'alert');
  errore.hidden = true;
  blocco.append(riga, errore);
  const piede = nodo(doc, 'div', 'talos-approval__foot sheet-actions');
  const si = nodo(doc, 'button', 'talos-button talos-button--primary talos-button--md', t('remoto.consent.allow'));
  si.type = 'button';
  si.dataset.remotoConsenti = '';
  /* ⛔ 24/10 (revisione avversaria F1-2): la carta arriva dal controllo periodico, senza un gesto della persona, e «Allow» può
     comparire proprio dove stava per cliccare. Come l'«input protector» di Chromium sui permessi e il ritardo di Firefox (il buco
     CVE-2024-2609 era proprio quel ritardo che scadeva): «Allow» non accetta clic né tasti finché la carta non è visibile da un
     po'. Chi ospita la arma con `arma()` e la disarma con `disarma()` (carta spostata, finestra tornata in primo piano). */
  let armato = armata;
  /* revisione 24/10 (D-C3): mentre si arma, «Allow» dice perché non risponde — a chi usa un lettore di schermo (aria-describedby) e
     a chi passa col mouse (title); armato, la spiegazione se ne va */
  const perchéInattivo = nodo(doc, 'span', 'sr-only', t('remoto.consent.arming'));
  perchéInattivo.id = `consenso-armamento-${Math.random().toString(36).slice(2, 8)}`;
  const segnaArmato = () => {
    si.toggleAttribute('data-in-armamento', !armato);
    if (armato) { si.removeAttribute('aria-disabled'); si.removeAttribute('aria-describedby'); si.removeAttribute('title'); }
    else { si.setAttribute('aria-disabled', 'true'); si.setAttribute('aria-describedby', perchéInattivo.id); si.title = t('remoto.consent.arming'); }
    /* revisione a blocco 3 (24/10/2026, S4): armato, la frase «Available in a moment…» non c'è più — prima restava nella carta e un
       lettore di schermo la leggeva in coda anche quando non era più vera */
    perchéInattivo.hidden = armato;
  };
  segnaArmato();
  const no = nodo(doc, 'button', 'talos-button talos-button--ghost', t('remoto.consent.notNow'));
  no.type = 'button';
  no.dataset.remotoNonOra = '';
  piede.append(si, no, nodo(doc, 'span', 'talos-grow'), nodo(doc, 'span', 'talos-approval__foot-note', t('remoto.consent.note')));
  carta.append(testa, perche, blocco, piede, perchéInattivo);

  const scadeAlle = Date.parse(r.scadeAlle ?? '');
  let scaduta = false;
  function aggiornaScadenza(adesso) {
    const resto = Number.isFinite(scadeAlle) ? scadeAlle - adesso : 0;
    scaduta = resto <= 0;
    scade.textContent = scaduta ? t('remoto.pair.expired') : t('remoto.pair.expiresIn', { time: mmss(resto) });
    if (scaduta) si.disabled = true;
    return !scaduta;
  }
  aggiornaScadenza(ora);
  const rispondi = async (fai) => {
    errore.hidden = true;
    si.disabled = true;
    no.disabled = true;
    try {
      await fai?.();
    } catch (e) {
      errore.textContent = e?.messaggio || e?.message || '';
      errore.hidden = !errore.textContent;
      si.disabled = scaduta;
      no.disabled = false;
    }
  };
  si.addEventListener('click', () => { if (!armato || scaduta) return; void rispondi(onConsenti); });
  no.addEventListener('click', () => rispondi(onNonOra));
  return {
    elemento: carta, aggiornaScadenza,
    arma: () => { armato = true; segnaArmato(); },
    disarma: () => { armato = false; segnaArmato(); },
  };
}

/** Quanto «Allow» resta inerte dopo che la carta del consenso è a schermo (Chromium usa un intervallo dello stesso ordine). */
export const RITARDO_ARMA_MS = 1000;
/** Quanto resta la riga di conferma dopo «Consenti» (owner 24/10/2026 notte: «per 4-5 s»). */
export const DURATA_CONFERMA_MS = 4500;

/**
 * ⭐ Decisione dell'owner del 24/10/2026 notte (proposta della revisione a blocco 5, la consigliata): dopo «Consenti» il PC non
 * mostrava niente. Al posto della carta, per 4-5 s, una riga di conferma che si annuncia (`role="status"`, `aria-live="polite"`):
 * «“Pad di Nino” ora può lavorare in AVM» con «Gestisci» (la riga di quel dispositivo in Dispositivi collegati); se il «Consenti» ha
 * avviato la sessione trattenuta (`sessionId` di `consent.closed`), «… ha aperto una conversazione in AVM» con «Apri». Nessun dato
 * nuovo dal server: nome e cartella sono quelli della carta, `sessionId` quello dell'evento (o della risposta, che è lo stesso esito).
 *
 */
export function creaRigaConferma(doc, r, { sessionId = null, onGestisci = null, onApri = null } = {}) {
  /* la stessa superficie della carta che sostituisce (`talos-approval`: fondo, bordo, raggio del tema), non una sua imitazione */
  const riga = nodo(doc, 'div', 'talos-approval talos-remoto-conferma');
  riga.dataset.remotoConferma = r.richiestaId;
  riga.setAttribute('role', 'status');
  riga.setAttribute('aria-live', 'polite');
  const testo = nodo(doc, 'span', 'talos-remoto-conferma__testo');
  const azione = nodo(doc, 'button', 'talos-button talos-button--ghost talos-button--sm');
  azione.type = 'button';
  function disegna(sid) {
    const chiave = sid ? 'remoto.consent.doneSession' : 'remoto.consent.done';
    /* la cartella in grassetto: il testo si compone a pezzi, mai come HTML (nome e cartella vengono da fuori) */
    const segnaposto = ' ';
    const [prima, dopo = ''] = t(chiave, { name: r.nomeDispositivo || t('remoto.confirm.unnamed'), folder: segnaposto }).split(segnaposto);
    testo.replaceChildren(icona(doc, 'i-check', 'i i--sm'), doc.createTextNode(prima), nodo(doc, 'strong', '', String(r.nome ?? '')), doc.createTextNode(dopo));
    azione.textContent = t(sid ? 'remoto.consent.open' : 'remoto.consent.manage');
    azione.dataset.remotoConfermaAzione = sid ? 'apri' : 'gestisci';
    riga.dataset.sessionId = sid ?? '';
  }
  azione.addEventListener('click', () => {
    const sid = riga.dataset.sessionId;
    if (sid) onApri?.(sid, r); else onGestisci?.(r.dispositivoId, r);
  });
  disegna(sessionId);
  riga.append(testo, azione);
  return { elemento: riga, conSessione: (sid) => { if (sid && !riga.dataset.sessionId) disegna(sid); } };
}

const richiestaValida = (r) => typeof r?.richiestaId === 'string' && /^[A-Za-z0-9_-]{8,64}$/u.test(r.richiestaId)
  && typeof r.nome === 'string' && typeof r.percorso === 'string';

/**
 * Chi tiene le carte del consenso: ne mostra UNA (la più vicina a scadere), sospesa sotto `ancora()`; le altre aspettano.
 * `api`: `{ consenti(id), nega(id) }` → promesse. `avvisa(r)`: una volta per richiesta nuova (la notifica di sistema, se la finestra
 * non si vede); `dopo(r, esito)`: dopo una risposta (chi ospita rilegge lo stato). `aggiorna(consensi)` dice se una carta è a schermo.
 */
export function creaConsensiUi({ ancora = () => null, api, avvisa = null, dopo = null, document: doc = globalThis.document, orologio = () => Date.now(), timer = globalThis, ritardoArmaMs = RITARDO_ARMA_MS,
  onGestisci = null, onApri = null, durataConfermaMs = DURATA_CONFERMA_MS } = {}) {
  let attuale = null;
  let conferma = null; // { richiestaId, elemento, conSessione, timer }
  const sessioniDegliEventi = new Map(); // richiestaId → sessionId da `consent.closed`, se l'evento arriva prima della risposta
  let conto = null;
  let armaTimer = null;
  let ultime = [];
  const nascoste = new Set();
  const risposte = new Set();
  const avvisate = new Set();
  const finestra = doc.defaultView ?? globalThis;

  /* «Allow» si arma `ritardoArmaMs` dopo che la carta è a schermo; ogni spostamento o ritorno della finestra riparte da capo */
  /* «visibile» = la persona può davvero vederla e premerla: finestra non nascosta e «Allow» non coperto (velo d'avvio, modale) */
  function visibileDavvero(el) {
    if (doc.visibilityState === 'hidden') return false;
    const b = el.querySelector?.('[data-remoto-consenti]');
    if (!b || typeof doc.elementFromPoint !== 'function') return true;
    const r = b.getBoundingClientRect();
    /* revisione a blocco 3 (24/10/2026, S4): si guarda il centro della parte di «Allow» che sta DENTRO la finestra — col centro del
       pulsante fuori (finestra alta meno di ~306 px: la carta è fissa, non scorre) prima non si armava mai, ora il pezzo visibile sì */
    const larga = finestra.innerWidth ?? doc.documentElement?.clientWidth ?? 0;
    const alta = finestra.innerHeight ?? doc.documentElement?.clientHeight ?? 0;
    const sinistra = Math.max(r.left, 0); const destra = Math.min(r.right, larga);
    const cima = Math.max(r.top, 0); const fondo = Math.min(r.bottom, alta);
    if (destra - sinistra < 1 || fondo - cima < 1) return false;
    const sopra = doc.elementFromPoint((sinistra + destra) / 2, (cima + fondo) / 2);
    return Boolean(sopra && b.contains(sopra));
  }
  function riarma() {
    if (!attuale) return;
    if (armaTimer) timer.clearTimeout(armaTimer);
    attuale.disarma();
    const corrente = attuale;
    let visibileDa = null;
    const controlla = () => {
      armaTimer = null;
      if (attuale !== corrente) return;
      const ora = orologio();
      if (!visibileDavvero(corrente.elemento)) visibileDa = null;
      else if (visibileDa === null) visibileDa = ora;
      if (visibileDa !== null && ora - visibileDa >= ritardoArmaMs) { corrente.arma(); return; }
      armaTimer = timer.setTimeout(controlla, 100);
    };
    armaTimer = timer.setTimeout(controlla, 0);
  }
  function togli() {
    if (conto) timer.clearInterval(conto);
    conto = null;
    if (armaTimer) timer.clearTimeout(armaTimer);
    armaTimer = null;
    attuale?.elemento.remove();
    attuale = null;
  }
  function posiziona() {
    if (!attuale) return;
    const larghezza = Math.max(280, Math.min(460, (finestra.innerWidth ?? 460) - 32));
    const r = ancora()?.getBoundingClientRect?.();
    const sinistra = r ? Math.max(16, Math.min(r.left, (finestra.innerWidth ?? 0) - larghezza - 16)) : 16;
    const prima = [attuale.elemento.style.left, attuale.elemento.style.top, attuale.elemento.style.width].join();
    attuale.elemento.style.left = `${Math.round(sinistra)}px`;
    attuale.elemento.style.top = `${Math.round(r ? r.bottom + 10 : 16)}px`;
    attuale.elemento.style.width = `${Math.round(larghezza)}px`;
    if (prima !== [attuale.elemento.style.left, attuale.elemento.style.top, attuale.elemento.style.width].join() && prima !== ',,') riarma();
    confermaSopraLaCarta();
  }
  /**
   * Owner 25/10/2026 (consigliata, revisione a blocco 6 REV6-C1): con altre carte in fila, la riga di conferma del «Consenti» appena
   *   dato resta a schermo per i suoi secondi SOPRA la carta successiva (prima la carta nuova la toglieva nello stesso giro: 0
   *   fotogrammi su 92). Senza spazio sopra, sotto la carta. La carta resta dov'è: è lei che si arma e si preme.
   */
  function confermaSopraLaCarta() {
    if (!conferma || !attuale || conferma.richiestaId === attuale.r.richiestaId) return;
    const carta = attuale.elemento.getBoundingClientRect?.();
    const riga = conferma.elemento.getBoundingClientRect?.();
    if (!carta || !riga) return;
    const alta = finestra.innerHeight ?? doc.documentElement?.clientHeight ?? 0;
    const sopra = carta.top - riga.height - 8;
    const top = sopra >= 8 ? sopra : Math.min(carta.bottom + 8, Math.max(8, alta - riga.height - 8));
    conferma.elemento.style.left = attuale.elemento.style.left;
    conferma.elemento.style.width = attuale.elemento.style.width;
    conferma.elemento.style.top = `${Math.round(top)}px`;
    conferma.elemento.dataset.sopraLaCarta = sopra >= 8 ? 'sopra' : 'sotto';
  }
  function nascondi(id) {
    nascoste.add(id);
    togli();
    aggiorna(ultime);
    ancora()?.focus?.();
  }
  function togliConferma() {
    if (!conferma) return;
    timer.clearTimeout(conferma.timer);
    conferma.elemento.remove();
    conferma = null;
  }
  /* la riga di conferma prende il posto della carta (stessa ancora, stessa larghezza); una carta nuova che arriva le si mette SOTTO
     (owner 25/10, REV6-C1: prima la sostituiva e la conferma non si vedeva mai) */
  function mostraConferma(r, sessionId) {
    togliConferma();
    const posto = attuale?.r.richiestaId === r.richiestaId ? attuale.elemento.getBoundingClientRect?.() : null;
    const { elemento, conSessione } = creaRigaConferma(doc, r, {
      sessionId,
      onGestisci: (id, x) => { togliConferma(); onGestisci?.(id, x); },
      onApri: (sid, x) => { togliConferma(); onApri?.(sid, x); },
    });
    elemento.classList.add('talos-remoto-conferma--sospesa');
    doc.body.append(elemento);
    const larghezza = Math.max(280, Math.min(460, (finestra.innerWidth ?? 460) - 32));
    const a = ancora()?.getBoundingClientRect?.();
    const sinistra = posto?.width ? posto.left : a ? Math.max(16, Math.min(a.left, (finestra.innerWidth ?? 0) - larghezza - 16)) : 16;
    elemento.style.left = `${Math.round(sinistra)}px`;
    elemento.style.top = `${Math.round(posto?.height ? posto.top : a ? a.bottom + 10 : 16)}px`;
    elemento.style.width = `${Math.round(posto?.width || larghezza)}px`;
    conferma = { richiestaId: r.richiestaId, elemento, conSessione, timer: timer.setTimeout(togliConferma, durataConfermaMs) };
  }
  async function rispondi(r, consenti) {
    const esito = await (consenti ? api.consenti(r.richiestaId) : api.nega(r.richiestaId));
    if (consenti) mostraConferma(r, esito?.sessionId ?? sessioniDegliEventi.get(r.richiestaId) ?? null);
    sessioniDegliEventi.delete(r.richiestaId);
    risposte.add(r.richiestaId);
    aggiorna(ultime);
    dopo?.(r, consenti ? 'consentita' : 'negata');
  }
  /** `consent.closed {esito:'consentita', sessionId}` dallo stream: la riga di conferma, se è a schermo, dice «ha aperto una conversazione». */
  function chiusa(richiestaId, { esito, sessionId } = {}) {
    if (esito !== 'consentita' || typeof sessionId !== 'string' || !sessionId) return;
    if (conferma?.richiestaId === richiestaId) conferma.conSessione(sessionId);
    else { sessioniDegliEventi.set(richiestaId, sessionId); if (sessioniDegliEventi.size > 50) sessioniDegliEventi.delete(sessioniDegliEventi.keys().next().value); }
  }
  function mostra(r) {
    togli();
    /* REV6-C1 (owner 25/10): la conferma di un'ALTRA richiesta resta e va sopra la carta nuova (`confermaSopraLaCarta`, da `posiziona`) */
    if (conferma?.richiestaId === r.richiestaId) togliConferma();
    const { elemento, aggiornaScadenza, arma, disarma } = creaCartaConsenso(doc, r, { ora: orologio(), armata: false, onConsenti: () => rispondi(r, true), onNonOra: () => rispondi(r, false), onPiuTardi: () => nascondi(r.richiestaId) });
    elemento.classList.add('talos-remoto-consenso--sospesa');
    elemento.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); nascondi(r.richiestaId); } });
    doc.body.append(elemento);
    attuale = { r, elemento, aggiornaScadenza, arma, disarma };
    posiziona();
    riarma();
    conto = timer.setInterval(() => attuale?.aggiornaScadenza(orologio()), 1000);
  }
  function aggiorna(consensi) {
    ultime = (Array.isArray(consensi) ? consensi : []).filter(richiestaValida).filter((r) => !risposte.has(r.richiestaId))
      .sort((a, b) => (Date.parse(a.scadeAlle) || 0) - (Date.parse(b.scadeAlle) || 0));
    for (const r of ultime) if (!avvisate.has(r.richiestaId)) { avvisate.add(r.richiestaId); avvisa?.(r); }
    const daMostrare = ultime.find((r) => !nascoste.has(r.richiestaId));
    if (!daMostrare) { togli(); return false; }
    if (attuale?.r.richiestaId !== daMostrare.richiestaId) mostra(daMostrare);
    else posiziona();
    return true;
  }
  /** Il gesto sull'icona: le carte nascoste con Esc tornano, e il fuoco va sulla carta (mai su «Consenti»). */
  function riapri() {
    for (const r of ultime) nascoste.delete(r.richiestaId);
    const c = aggiorna(ultime);
    attuale?.elemento.focus();
    return c;
  }
  finestra.addEventListener?.('resize', posiziona);
  finestra.addEventListener?.('focus', riarma);
  /* revisione a blocco 3 (24/10/2026, S4): una finestra coperta e riportata in vista SENZA un evento `focus` (una notifica, un'altra
     finestra tolta di mezzo) riparte da capo come col fuoco: chi torna a guardare ha di nuovo il suo secondo prima di «Allow» */
  doc.addEventListener?.('visibilitychange', () => { if (doc.visibilityState === 'visible') riarma(); });
  return { aggiorna, riapri, togli, chiusa, inAttesa: () => ultime.length };
}
