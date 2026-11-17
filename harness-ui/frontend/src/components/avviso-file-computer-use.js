/*
 * ⛔ Decisione 374, giro 2, punto 9 (revisore C, C3; giudice 08/11/2026 11:42): quando TALOS rimette le impostazioni del computer use
 *   cambiate fuori da lui (o non ci riesce, o le trova cambiate all'avvio, o non può leggere la versione approvata), la persona lo
 *   deve VEDERE nella chat a cui l'evento appartiene. Il server manda `talos.file-computer-use-ripristinati` sul flusso della sessione
 *   del comando (o, senza comando in corso, di chi ha controllato): qui si disegna e basta.
 *
 * La forma è quella della riga del controllo delle scritture spento (avviso-controllo-spento.js:46-84), sorella della «finestra
 * allargata» (context-separator.js): una riga, «Dettagli» con parole semplici, il testo del server (coi nomi dei file) solo sotto
 * «Dettagli tecnici». Il caso si sceglie dai CAMPI dell'evento (`file`, `copie`, `nonRimessi`, `altreChiavi`), mai dal testo inglese.
 * Una riga per avviso (`idAvviso`): l'evento ripetuto o la rigiocata della storia la AGGIORNANO, mai la raddoppiano (il server
 * riusa lo stesso id per tutto il giro e rimanda solo se il contenuto cambia, C5).
 */
import { t } from './lingua.js';

export const EVENTO_FILE_COMPUTER_USE = 'talos.file-computer-use-ripristinati';
/* le copie che il server tiene per file (COPIE_PER_FILE in src/computer-use/file-approvati.mjs); vale se l'evento non dice `max` */
const COPIE_PER_FILE_PREDEFINITE = 10;
const CHIAVE_AVVIO = 'server.computerUseFiles.setAsideAtStart';
/* giro 5 (C2): all'avvio messo da parte, ma il computer use NON resta spento (era cambiato solo l'elenco dei luoghi, o è già riacceso) */
const CHIAVE_AVVIO_SPOSTATI = 'server.computerUseFiles.movedAsideAtStart';
const CHIAVE_CHIUSI = 'server.computerUseFiles.fingerprintUnreadable';
const CHIAVE_TOLTE = 'server.computerUseFiles.oldCopiesRemoved';

const elenco = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x) : []);

/** Il valore dell'evento, ridotto ai casi; `null` se non è questo evento o non ha un id. */
export function leggiAvvisoFileComputerUse(evento) {
  if (!evento || evento.type !== 'CUSTOM' || evento.name !== EVENTO_FILE_COMPUTER_USE) return null;
  const v = evento.value;
  if (!v || typeof v !== 'object' || typeof v.idAvviso !== 'string' || !v.idAvviso) return null;
  const altre = Array.isArray(v.altreChiavi) ? v.altreChiavi.filter((a) => a && typeof a.chiave === 'string') : [];
  const trova = (chiave) => altre.find((a) => a.chiave === chiave) ?? null;
  const tolte = trova(CHIAVE_TOLTE);
  const max = Number.isSafeInteger(tolte?.params?.max) && tolte.params.max > 0 ? tolte.params.max : COPIE_PER_FILE_PREDEFINITE;
  const restaSpento = trova(CHIAVE_AVVIO) !== null;
  const allAvvio = restaSpento || trova(CHIAVE_AVVIO_SPOSTATI) !== null;
  return {
    idAvviso: v.idAvviso,
    rimessi: elenco(v.file).length > 0,
    copie: elenco(v.copie).length > 0,
    nonRimessi: elenco(v.nonRimessi).length > 0,
    allAvvio,
    ...(allAvvio ? { restaSpento } : {}),
    chiusi: trova(CHIAVE_CHIUSI) !== null,
    copieTolte: tolte !== null,
    ...(tolte !== null ? { massimo: max } : {}),
    testo: typeof v.testo === 'string' ? v.testo : '',
  };
}

/** Le parole della riga e dei dettagli, senza DOM (servono anche all'esportazione della conversazione). */
export function testiAvvisoFileComputerUse(valore) {
  const v = valore ?? {};
  let riga;
  if (v.chiusi) riga = t('chat.computerUseFiles.rowLocked');
  else if ((v.rimessi && v.copie) || v.allAvvio) riga = t('chat.computerUseFiles.row');
  else if (v.rimessi) riga = t('chat.computerUseFiles.rowPutBack');
  else riga = t('chat.computerUseFiles.rowNotPutBack');
  const frasi = [];
  if (v.rimessi) frasi.push(t('chat.computerUseFiles.detailsPutBack'));
  if (v.rimessi && v.copie) frasi.push(t('chat.computerUseFiles.detailsKept'));
  if (v.allAvvio) frasi.push(t(v.restaSpento === false ? 'chat.computerUseFiles.detailsMovedAtStart' : 'chat.computerUseFiles.detailsAtStart'));
  if (v.nonRimessi) frasi.push(t('chat.computerUseFiles.detailsNotPutBack'));
  if (v.chiusi) frasi.push(t('chat.computerUseFiles.detailsLocked'));
  if (v.copieTolte) frasi.push(t('chat.computerUseFiles.detailsOldCopies', { max: v.massimo ?? COPIE_PER_FILE_PREDEFINITE }));
  return { riga, dettagli: frasi.join(' ') };
}

/** Riempie i dettagli: le parole semplici, poi (se c'è) il testo del server sotto «Dettagli tecnici». */
function riempiDettagli(doc, dettagli, testi, valore) {
  dettagli.replaceChildren(doc.createTextNode(testi.dettagli));
  if (valore.testo) {
    const tecnico = doc.createElement('details'); tecnico.className = 'talos-system-note__tecnico';
    const titolo = doc.createElement('summary'); titolo.textContent = t('chat.note.serverText');
    const grezzo = doc.createElement('pre'); grezzo.className = 'talos-system-note__grezzo'; grezzo.textContent = valore.testo;
    tecnico.append(titolo, grezzo);
    dettagli.append(tecnico);
  }
}

/** La riga nella conversazione: una per (chat, avviso); se c'è già si aggiorna al posto suo. */
export function aggiornaRigaAvvisoFileComputerUse(container, valore, { sessionId, document: doc = container?.ownerDocument ?? globalThis.document, inserisci = null } = {}) {
  if (!container || !sessionId || !valore) return null;
  const chiave = `${sessionId}|${valore.idAvviso}`;
  const testi = testiAvvisoFileComputerUse(valore);
  for (const nodo of container.querySelectorAll('[data-avviso-file-computer-use]')) {
    if (nodo.dataset.avvisoFileComputerUse !== chiave) continue;
    const row = nodo.querySelector('.talos-context-separator');
    row?.setAttribute('aria-label', testi.riga);
    const span = nodo.querySelector('span');
    if (span) span.textContent = testi.riga;
    const dettagli = nodo.querySelector('.talos-window-note__details');
    if (dettagli) riempiDettagli(doc, dettagli, testi, valore);
    return nodo;
  }
  const gruppo = doc.createElement('div');
  gruppo.className = 'talos-window-note talos-computer-use-files-note';
  gruppo.dataset.avvisoFileComputerUse = chiave; gruppo.dataset.contextSession = sessionId;
  const row = doc.createElement('div');
  row.className = 'talos-context-separator talos-context-separator--window';
  row.setAttribute('role', 'group'); row.setAttribute('aria-label', testi.riga);
  const span = doc.createElement('span'); span.textContent = testi.riga;
  const dettagli = doc.createElement('div');
  dettagli.className = 'talos-window-note__details'; dettagli.hidden = true;
  dettagli.id = `file-cu-${Math.abs([...chiave].reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0)).toString(36)}`;
  riempiDettagli(doc, dettagli, testi, valore);
  const button = doc.createElement('button');
  button.type = 'button'; button.className = 'talos-button talos-button--ghost talos-button--sm';
  button.textContent = t('chat.context.separator.details');
  button.setAttribute('aria-expanded', 'false'); button.setAttribute('aria-controls', dettagli.id);
  button.addEventListener('click', () => {
    const apri = dettagli.hidden;
    dettagli.hidden = !apri;
    button.setAttribute('aria-expanded', String(apri));
    button.textContent = t(apri ? 'chat.context.separator.hide' : 'chat.context.separator.details');
  });
  row.append(span, button);
  gruppo.append(row, dettagli);
  if (typeof inserisci === 'function') inserisci(gruppo); else container.append(gruppo);
  return gruppo;
}
