/*
 * R5.13, seconda metà (24/10/2026 notte) — MANDARE UN FILE A UN DISPOSITIVO, lato finestra. Bozzetti approvati dall'owner con tutte le
 * consigliate D1-D8 (`lavoro-desktop-2026-10-24/bozzetti-r513/`, `RAPPORTO-DESKTOP-4.md`): il risultato è quello dei bozzetti, coi
 * pezzi veri del prodotto e nessuna veste nuova.
 *   · la carta di `remote_device_send_file` (bozzetti 2b, 3a): la carta di casa con la scheda del file (senza link) e la riga del
 *     dispositivo (`rigaTelefonoInChat`), «Invia» / «Non inviare»; con più dispositivi la frase dice «uno dei tuoi N» (D3);
 *   · la riga di stato sotto la scheda del file (4a, 4b): inviato · in scaricamento con la percentuale · scaricato con l'ora; non in
 *     linea in giallo (D2); file cambiato in rosso con «Invia di nuovo» visibile SOLO lì (D6); troppo grande in rosso;
 *   · le voci del menu del file (1a, 1b, 2a): «Invia a <dispositivo>» con uno solo, «Invia a un dispositivo…» e la scelta con più
 *     d'uno, nessuna voce senza dispositivi (D4).
 * ⛔ «Dispositivo», mai «telefono», in ogni parola nuova (owner).
 */
import { t } from './lingua.js';
import { creaFileScaricabile } from './conversazione.js';
import { rigaTelefonoInChat } from './telefoni-chat.js';

/* «visto ieri», «visto oggi», o la data: la parola del bozzetto 2a (la riga d'aiuto è corta; l'ora sta già in Dispositivi collegati) */
function quandoRelativo(ms, { lingua = 'it', ora = Date.now() } = {}) {
  const d = new Date(ms); const oggi = new Date(ora); const ieri = new Date(ora); ieri.setDate(ieri.getDate() - 1);
  if (d.toDateString() === oggi.toDateString()) return t('remoto.sendFile.when.today');
  if (d.toDateString() === ieri.toDateString()) return t('remoto.sendFile.when.yesterday');
  return new Intl.DateTimeFormat(lingua, { day: '2-digit', month: '2-digit' }).format(d);
}

function nodo(doc, tag, classe, testo) {
  const n = doc.createElement(tag);
  if (classe) n.className = classe;
  if (testo !== undefined && testo !== null) n.textContent = String(testo);
  return n;
}

/** La scheda del file per la carta: la scheda vera dei file pronti, senza «Scarica» (nella carta si decide, non si scarica). */
function schedaSenzaLink(doc, file) {
  const s = creaFileScaricabile({ allegato: { nome: file?.nome, byte: file?.dimensione } }, { document: doc, indirizzo: '' });
  s.querySelector('.talos-file-scaricabile__assente')?.remove();
  s.classList.add('talos-invio-file__scheda');
  return s;
}

/** Il blocco della carta: il file, poi il dispositivo come nell'elenco dei dispositivi collegati. */
export function creaBloccoCartaInvioFile(doc, azione) {
  const blocco = nodo(doc, 'div', 'talos-approval__automazione talos-telefoni-chat talos-invio-file');
  blocco.dataset.invioFile = '';
  const v = azione?.telefono ?? {};
  blocco.append(schedaSenzaLink(doc, azione?.file), rigaTelefonoInChat(doc, { id: v.idCorto, nome: v.nome, inLinea: v.inLinea, ultimaVoltaAlle: v.ultimaVoltaAlle }));
  return blocco;
}

export function testiCartaInvioFile(azione) {
  const device = azione?.telefono?.nome || t('remoto.confirm.unnamed');
  const n = Number.isSafeInteger(azione?.dispositivi) ? azione.dispositivi : 1;
  const molti = n > 1;
  return {
    badge: t('remoto.sendFile.card.badge'),
    bersaglio: azione?.file?.nome || '',
    perche: molti ? t('remoto.sendFile.card.whyMany', { device, n }) : t('remoto.sendFile.card.why', { device }),
    motivo: '',
    nota: t(molti ? 'remoto.sendFile.card.noteMany' : 'remoto.sendFile.card.note'),
  };
}

/** L'ora «20:31» dello scarico, nella lingua della persona. */
function ora(ms, lingua) {
  try { return new Date(ms).toLocaleTimeString(lingua === 'en' ? 'en-GB' : 'it-IT', { hour: '2-digit', minute: '2-digit' }); } catch { return ''; }
}

/**
 * Lo stato di un'offerta in parole: `{tono, testo, rimanda}`. `tono` è quello di `talos-dot` (`''` neutro, `live`, `success`,
 * `warning`, `danger`); `rimanda` dice se «Invia di nuovo» si vede (solo dopo un file cambiato, D6).
 * `dispositivo`: `{nome, inLinea}` dallo stato del remoto (se non c'è più, il nome resta quello di ripiego).
 */
export function statoOfferta(offerta, dispositivo = null, { lingua = 'it' } = {}) {
  const device = dispositivo?.nome || t('remoto.confirm.unnamed');
  if (offerta?.stato === 'cambiato') return { tono: 'danger', testo: t('remoto.sendFile.state.gone', { device }), rimanda: true };
  if (offerta?.stato === 'scaricato') return { tono: 'success', testo: t('remoto.sendFile.state.downloaded', { device, time: ora(offerta.scaricatoAlle, lingua) }), rimanda: false };
  if (offerta?.stato === 'in-scaricamento') return { tono: 'live', testo: t('remoto.sendFile.state.downloading', { device, p: Math.max(0, Math.min(100, Number(offerta.percentuale) || 0)) }), rimanda: false };
  /* D2: fuori linea è un'attesa, non un errore — giallo */
  if (dispositivo && dispositivo.inLinea === false) return { tono: 'warning', testo: t('remoto.sendFile.state.offline', { device }), rimanda: false };
  return { tono: '', testo: t('remoto.sendFile.state.sent', { device }), rimanda: false };
}

/** Il troppo grande sulla scheda (4b): rosso, mai «Invia di nuovo» (rimandarlo darebbe lo stesso rifiuto). */
export function statoTroppoGrande(misura) {
  return { tono: 'danger', testo: t('remoto.sendFile.state.tooLarge', { size: misura }), rimanda: false };
}

/**
 * Scrive (o riscrive) la riga di stato sotto nome e misura della scheda, col pallino vero; e «Invia di nuovo» accanto a «Scarica»
 * solo quando `stato.rimanda` (D6). `onRimanda()` è il clic; la scheda resta quella, cambia solo la riga.
 */
export function mettiStatoSullaScheda(scheda, stato, { onRimanda = null } = {}) {
  if (!scheda) return;
  const doc = scheda.ownerDocument || globalThis.document;
  const testo = scheda.querySelector('.talos-file-scaricabile__testo');
  if (!testo) return;
  let riga = testo.querySelector('[data-invio-stato]');
  if (!riga) { riga = nodo(doc, 'span', 'talos-file-scaricabile__misura talos-invio-file__stato'); riga.dataset.invioStato = ''; testo.append(riga); }
  riga.dataset.tono = stato?.tono || '';
  riga.replaceChildren(nodo(doc, 'span', `talos-dot talos-dot--sm${stato?.tono ? ` talos-dot--${stato.tono}` : ''}`), doc.createTextNode(stato?.testo ?? ''));
  let rimanda = scheda.querySelector(':scope > [data-invio-rimanda]');
  if (stato?.rimanda && typeof onRimanda === 'function') {
    if (!rimanda) {
      rimanda = nodo(doc, 'button', 'talos-button talos-button--secondary talos-button--sm', t('remoto.sendFile.again'));
      rimanda.type = 'button';
      rimanda.dataset.invioRimanda = '';
      testo.after(rimanda);
    }
    rimanda.onclick = () => onRimanda();
  } else rimanda?.remove();
}

/**
 * Il «⋯» della scheda del file (D1), accanto a «Scarica»: lo stesso pulsante dei messaggi (`talos-icon-button`, `i-more`,
 * `aria-haspopup=menu`). `onApri(pulsante)` apre il menu. Non si duplica.
 */
export function aggiungiPiuAllaScheda(scheda, { nome, onApri }) {
  if (!scheda || scheda.querySelector(':scope > [data-file-piu]')) return null;
  const doc = scheda.ownerDocument || globalThis.document;
  const etichetta = t('remoto.sendFile.more', { file: nome || '' });
  const b = nodo(doc, 'button', 'talos-button talos-button--ghost talos-icon-button talos-button--sm');
  b.type = 'button';
  b.title = etichetta;
  b.setAttribute('aria-label', etichetta);
  b.setAttribute('aria-haspopup', 'menu');
  b.setAttribute('aria-expanded', 'false');
  b.dataset.filePiu = '';
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'i i--sm'); svg.setAttribute('aria-hidden', 'true');
  const uso = doc.createElementNS('http://www.w3.org/2000/svg', 'use'); uso.setAttribute('href', '#i-more'); svg.append(uso);
  b.append(svg);
  b.addEventListener('click', () => onApri?.(b));
  scheda.append(b);
  return b;
}

/**
 * Le voci «Invia a …» per il menu del file, nella forma di `apriMenuContestuale` (`[testo, fai, abilitato, aiuto, extra]`).
 *   · nessun dispositivo ⇒ nessuna voce (D4);
 *   · uno ⇒ «Invia a <nome>» (`onInvia(dispositivo)`);
 *   · più d'uno ⇒ «Invia a un dispositivo…», che chiama `onScegli()` (il menu diventa la scelta, bozzetto 2a).
 */
export function vociInvio(dispositivi, { onInvia, onScegli }) {
  const vivi = (dispositivi ?? []).filter((v) => v && !v.revocatoAlle);
  if (!vivi.length) return [];
  if (vivi.length === 1) return [[t('remoto.sendFile.menu.one', { device: vivi[0].nome || t('remoto.confirm.unnamed') }), () => onInvia(vivi[0]), true, '', { icona: 'i-phone' }]];
  return [[t('remoto.sendFile.menu.many'), () => onScegli(), true, '', { icona: 'i-phone' }]];
}

/** La scelta del dispositivo (bozzetto 2a): titolo «Invia <file> a», una voce per dispositivo col pallino e lo stato sotto. */
export function vociSceltaDispositivo(dispositivi, { nomeFile, onInvia, lingua = 'it', adesso = Date.now() }) {
  const vivi = (dispositivi ?? []).filter((v) => v && !v.revocatoAlle);
  return {
    titolo: t('remoto.sendFile.menu.chooseTitle', { file: nomeFile || '' }),
    voci: vivi.map((v) => {
      const quando = Number.isFinite(v.ultimaVoltaAlle) ? quandoRelativo(v.ultimaVoltaAlle, { lingua, ora: adesso }) : '';
      const aiuto = v.inLinea ? t('remoto.sendFile.menu.online') : quando ? t('remoto.sendFile.menu.offlineSeen', { when: quando }) : t('remoto.sendFile.menu.offline');
      return [v.nome || t('remoto.confirm.unnamed'), () => onInvia(v), true, aiuto, { tono: v.inLinea ? 'success' : 'warning' }];
    }),
  };
}

/** Dall'esito dell'attrezzo («Sent "x" (13 bytes) to "Pad" (id …): … (offer ID).») nome del file, del dispositivo e id dell'offerta. */
export function datiDallEsitoInvio(testo) {
  /* REV6-F3 (25/10/2026): l'esito porta anche `path "…"`, il percorso DENTRO la cartella risolto dal server (assente negli esiti di prima) */
  const m = /^Sent ("(?:[^"\\]|\\.)*") \([^)]*\) to ("(?:[^"\\]|\\.)*") \(id [^)]*\):.* \(offer ([A-Za-z0-9_-]+)(?:, path ("(?:[^"\\]|\\.)*"))?\)\.(?: Full access: done without asking the person\.)?$/u.exec(String(testo ?? '')); // B-5 (blocco 7): ancorato alla fine
  if (!m) return null;
  try { return { nome: JSON.parse(m[1]), dispositivo: JSON.parse(m[2]), offertaId: m[3], relativo: m[4] ? JSON.parse(m[4]) : null }; } catch { return null; }
}

/**
 * Owner 25/10/2026 (consigliata, revisione a blocco 6 REV6-F6): un invio fallito si dice con una FRASE del dizionario, in inglese e in
 *   italiano; il testo del motore resta solo nel dettaglio tecnico a richiesta. Qui i rifiuti noti di `remote_device_send_file`
 *   (`session-registry.mjs`, ramo dell'attrezzo, e il «no» della persona sulla carta): la chiave della frase, o `generic` per tutto il
 *   resto — mai il testo grezzo come unica spiegazione.
 */
const RIFIUTI_INVIO = [
  [/not available on this computer/u, 'unavailable'],
  [/has no folder to send from/u, 'noFolder'],
  [/No device is paired/u, 'noDevice'],
  [/paired devices: say which one|paired device has the id|must be the short id from remote_phones/u, 'whichDevice'], // B-6: mai sulle parole fra virgolette
  [/not in this conversation's folder/u, 'outside'],
  [/is a folder, not a file/u, 'folder'],
  [/There is no file at|must be the path of a file in this conversation/u, 'missing'],
  [/grew over 25 MB/u, 'grew'],
  [/changed after the card was shown|not the one shown on the card/u, 'changed'],
  /* B-6 (revisione a blocco 7): la carta non c'è più (il server si è riavviato fra la carta e il sì): non è «è cambiato», è «chiedi di
     nuovo». ⛔ A9-3 (revisione a blocco 9): «This call has no id» NON è qui — è un guasto della chiamata, e «chiedi di nuovo» non
     aiuta: va alla frase generica, col testo nel dettaglio tecnico */
  [/No card was shown/u, 'cardLost'],
];
export function chiaveDelRifiutoInvio(testo) {
  /* B-6: senza le parti fra virgolette — un file chiamato «not in this conversation's folder.md» non decide la frase */
  const s = String(testo ?? '').replace(/"(?:[^"\\]|\\.)*"/gu, '""');
  for (const [re, chiave] of RIFIUTI_INVIO) if (re.test(s)) return chiave;
  return 'generic';
}

/** Dal rifiuto «FILE_TOO_LARGE: "x" is 31.2 MB (32715571 bytes) …» il nome e i byte. */
export function datiDalTroppoGrande(testo) {
  const m = /FILE_TOO_LARGE: ("(?:[^"\\]|\\.)*") is [^(]*\((\d+) bytes\)(?: at ("(?:[^"\\]|\\.)*"))?/u.exec(String(testo ?? ''));
  if (!m) return null;
  try { return { nome: JSON.parse(m[1]), byte: Number(m[2]), relativo: m[3] ? JSON.parse(m[3]) : null }; } catch { return null; }
}
