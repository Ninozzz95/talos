/*
 * ⭐⭐ 15/11/2026 — LA NOTA DELLA RIGA IN ATTESA (settimo giro dell'affitto, owner 23:55, giudice v1919-v1921; revisore 2 del giro 6).
 *   Quando un'altra finestra di TALOS tiene la chat, una riga arrivata in ritardo aspetta sul disco e si aggiunge appena la chat si
 *   libera (server: `session-registry.mjs`, evento `CUSTOM` `talos.riga-in-attesa`, `value: { id, stato, sequenza?, message,
 *   messageChiave }`). Prima la pagina la disegnava come una carta d'errore rossa («Il giro si è interrotto per un errore · Riprova il
 *   giro», testo chiuso sotto «Dettagli tecnici»), DUE volte dopo un ricollegamento, e la «salvata» chiudeva il giro a schermo.
 *   ⛔ Niente interfaccia inventata: è la nota di sistema che la conversazione usa già per il salvataggio — la nota del journal riparato
 *   (`compattazione-legacy.js`, `creaNotaJournalRiparato`), cioè `creaNotaSistema` (`conversazione.js`) con il badge «Nota» e il tono
 *   informativo — e, come `aggiornaNotaJournalRiparato`, è idempotente per chiave: UNA nota per riga (la chiave è l'`id` della riga),
 *   che passa da «aspetta» a «salvata» sul posto. La frase è quella del server nella lingua dell'interfaccia (`testoDelCampo`: la
 *   chiave `server.sessionPersistence.*`, o la frase inglese se la chiave manca), sempre visibile, mai sotto un dettaglio.
 */
import { creaNotaSistema } from './conversazione.js';
import { t } from './lingua.js';
import { testoDelCampo } from './testo-server.js';

export const EVENTO_RIGA_IN_ATTESA = 'talos.riga-in-attesa';
const STATO_SALVATA = 'adottata';

/* 21/11/2026 (ottavo giro del salvataggio): la frase di una nota «aspetta» ha due forme, «resta su questo computer» e «il disco non l'ha
   presa» (`server.sessionPersistence.lateLineWaitingNotOnDisk`); la chiave dice quale è a schermo, e la stessa nota cambia frase sul posto */
const chiave = (valore) => (typeof valore?.messageChiave === 'string' ? valore.messageChiave : '');
function scriviStato(nota, valore) {
  nota.dataset.statoRiga = valore.stato === STATO_SALVATA ? STATO_SALVATA : 'in-attesa';
  nota.dataset.chiaveRiga = chiave(valore);
  const testo = nota.querySelector('.assistant-copy');
  if (testo) testo.textContent = testoDelCampo(valore, 'message');
}

/**
 * 21/11/2026 (ottavo giro, revisore 2 del giro 7, forma cw): una chat pronta che torna porta con sé le sue note «aspetta», ma il ritorno
 * (`?after=`) non rimanda niente per una riga salvata nel frattempo, e la nota restava «aspetta» con la riga già salvata (30 su 30).
 * Si tolgono le note «aspetta» della colonna che torna: quelle delle righe che aspettano ancora le rimanda il server all'iscrizione
 * (`iscriviti`), le altre restano via. Le note «salvata» restano. Come Claude Code, che non lascia un pannello fermo su «Running» dopo
 * una ripresa (`CHANGELOG.md:5136`).
 * @returns {number} quante note tolte
 */
export function togliNoteInAttesa(container) {
  if (!container?.querySelectorAll) return 0;
  let tolte = 0;
  for (const nodo of [...container.querySelectorAll('[data-riga-in-attesa]')]) if (nodo.dataset.statoRiga !== STATO_SALVATA) { nodo.remove(); tolte += 1; }
  return tolte;
}

/**
 * Disegna o aggiorna la nota di UNA riga in attesa. `inserisci(nota)` decide dove va la prima volta (accanto alle altre note del
 * salvataggio); i doppioni si cercano nella colonna intera: un ricollegamento che rimanda lo stato non aggiunge niente.
 * Una nota «aspetta» arrivata dopo la «salvata» della stessa riga non la riporta indietro.
 * @returns {HTMLElement|null}
 */
export function aggiornaNotaRigaInAttesa(container, valore, { inserisci = null, document: doc = container?.ownerDocument ?? globalThis.document } = {}) {
  if (!container || typeof valore?.id !== 'string' || !valore.id) return null;
  for (const nodo of container.querySelectorAll('[data-riga-in-attesa]')) {
    if (nodo.dataset.rigaInAttesa !== valore.id) continue;
    if (valore.stato === STATO_SALVATA && nodo.dataset.statoRiga !== STATO_SALVATA) scriviStato(nodo, valore);
    else if (valore.stato !== STATO_SALVATA && nodo.dataset.statoRiga !== STATO_SALVATA && nodo.dataset.chiaveRiga !== chiave(valore)) scriviStato(nodo, valore);
    return nodo;
  }
  const nota = creaNotaSistema({ tipo: 'info', badge: t('chat.note.badge'), testo: testoDelCampo(valore, 'message') }, { document: doc });
  nota.dataset.rigaInAttesa = valore.id;
  nota.dataset.statoRiga = valore.stato === STATO_SALVATA ? STATO_SALVATA : 'in-attesa';
  nota.dataset.chiaveRiga = chiave(valore);
  if (typeof inserisci === 'function') inserisci(nota); else container.append(nota);
  return nota;
}
