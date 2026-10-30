/*
 * ⛔ Owner 29/10/2026 notte («Una volta per chat», CONTRATTO-CONTROLLO-SPENTO): quando il controllo delle scritture non può giudicare
 *   (sul telefono manca il compilatore TypeScript, o il controllo si rompe) la scrittura passa come sempre, ma la chat lo DICE, una
 *   volta. La decisione «una volta» la prende il server (`talos.controllo-spento` arriva solo la prima volta, e di nuovo dopo una
 *   scrittura controllata): qui si disegna e basta, anche alla rigiocata, dove l'evento è lo stesso.
 *
 * La forma è la riga leggera della «finestra allargata» (`aggiornaRigaFinestraLocale`, context-separator.js): una riga sola e
 * «Dettagli» per chi vuole sapere perché. Semplice a primo sguardo (owner 22/10), il testo del server solo sotto «Testo del server»
 * come le note d'errore. Il motivo si sceglie dal CODICE (lista chiusa del contratto §3), mai dal testo inglese del server.
 */
import { t } from './lingua.js';
import { suUnaRiga } from './testo-a-schermo.js';

export const EVENTO_CONTROLLO_SPENTO = 'talos.controllo-spento';
export const CODICI_CONTROLLO_SPENTO = Object.freeze(['compilatore-assente', 'libreria-assente', 'errore-interno']);
const CHIAVE_MOTIVO = Object.freeze({
  'compilatore-assente': 'chat.writeCheck.reasonCompiler',
  'libreria-assente': 'chat.writeCheck.reasonLibrary',
  'errore-interno': 'chat.writeCheck.reasonInternal',
});

/** Il valore dell'evento, ripulito; `null` se non è un evento del controllo spento. Un codice sconosciuto vale «errore interno». */
export function leggiControlloSpento(evento) {
  if (!evento || evento.type !== 'CUSTOM' || evento.name !== EVENTO_CONTROLLO_SPENTO) return null;
  const v = evento.value;
  if (!v || typeof v !== 'object') return null;
  const percorso = typeof v.percorso === 'string' && v.percorso && !v.percorso.startsWith('/') && !/^[A-Za-z]:/u.test(v.percorso) ? suUnaRiga(v.percorso) : null;
  return {
    codice: CODICI_CONTROLLO_SPENTO.includes(v.codice) ? v.codice : 'errore-interno',
    perche: typeof v.perche === 'string' ? v.perche : '',
    percorso,
    chiave: `${v.runId ?? ''}|${v.giro ?? ''}|${percorso ?? ''}`,
  };
}

/** Le parole della riga e dei dettagli, senza DOM (servono anche all'esportazione della conversazione). */
export function testiControlloSpento(valore) {
  const motivo = t(CHIAVE_MOTIVO[valore?.codice] ?? CHIAVE_MOTIVO['errore-interno']);
  return {
    riga: valore?.percorso ? t('chat.writeCheck.rowFile', { file: valore.percorso }) : t('chat.writeCheck.row'),
    dettagli: t('chat.writeCheck.details', { motivo }),
  };
}

/** La riga nella conversazione; una sola per evento (la rigiocata non la duplica). */
export function aggiornaRigaControlloSpento(container, valore, { sessionId, document: doc = container?.ownerDocument ?? globalThis.document, inserisci = null } = {}) {
  if (!container || !sessionId || !valore) return null;
  const chiave = `${sessionId}|${valore.chiave}`;
  for (const nodo of container.querySelectorAll('[data-controllo-spento]')) if (nodo.dataset.controlloSpento === chiave) return nodo;
  const testi = testiControlloSpento(valore);
  const gruppo = doc.createElement('div');
  gruppo.className = 'talos-window-note talos-write-check-note';
  gruppo.dataset.controlloSpento = chiave; gruppo.dataset.contextSession = sessionId; gruppo.dataset.codice = valore.codice;
  const row = doc.createElement('div');
  row.className = 'talos-context-separator talos-context-separator--window';
  row.setAttribute('role', 'group'); row.setAttribute('aria-label', testi.riga);
  const span = doc.createElement('span'); span.textContent = testi.riga;
  const dettagli = doc.createElement('div');
  dettagli.className = 'talos-window-note__details'; dettagli.hidden = true;
  dettagli.id = `controllo-${Math.abs([...chiave].reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0)).toString(36)}`;
  /* il testo sta DIRETTAMENTE nel contenitore dei dettagli (come la riga sorella): un <p> dentro prenderebbe lo stile dei paragrafi della chat */
  dettagli.append(doc.createTextNode(testi.dettagli));
  if (valore.perche) {
    const tecnico = doc.createElement('details'); tecnico.className = 'talos-system-note__tecnico';
    const titolo = doc.createElement('summary'); titolo.textContent = t('chat.note.serverText');
    const grezzo = doc.createElement('pre'); grezzo.className = 'talos-system-note__grezzo'; grezzo.textContent = valore.perche;
    tecnico.append(titolo, grezzo);
    dettagli.append(tecnico);
  }
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
