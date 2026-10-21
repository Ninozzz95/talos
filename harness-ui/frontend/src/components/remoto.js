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
export function disegnaTelefoni(contenitore, stato, { onRevoca, onCollega, onCambiaRelay, lingua = 'it', ora = Date.now(), document: doc = globalThis.document } = {}) {
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
