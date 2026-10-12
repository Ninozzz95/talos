/*
 * LA CONFERMA PRIMA DI APRIRE UN LINK DELLA CHAT — owner 11/10/2026, «Clic + conferma del sito».
 *
 * Il clic su un link di una risposta (o di un proprio messaggio) non apre subito: mostra DOVE porta — il sito in evidenza e
 * l'indirizzo intero — e chiede. «Apri sempre senza chiedere i link verso questo sito» ricorda la scelta per quel sito soltanto
 * (`link-esterni.js`, `creaSitiFidati`); un sito fidato si apre al clic, come in Hermes.
 * ⛔ Pezzi esistenti, nessuna veste nuova: la modale è `apriModale` (`modale-td.js`, la stessa delle conferme), il testo `td-prose` /
 *   `td-subtle`, il piede `td-detail-footer`, l'interruttore `talos-switch`.
 * ⛔ Il fuoco parte da «Annulla»: un Invio di troppo non apre niente (stessa regola di `confermaModale`).
 * ⛔ Un indirizzo `http://` (non cifrato) non si apre da qui: lo si dice, e resta «Copia link». Il guscio desktop apre solo `https`
 *   (`desktop/runtime.mjs`, `apribileNelBrowserDelSistema`): una modale che promette un'apertura che poi non avviene sarebbe peggio.
 *
 * ⭐ DUE PORTE — owner 12/10/2026 (mockup approvato, `mockup-link-due-porte-2026-10-12`): il link si apre nella scheda Browser di
 *   TALOS oppure nel browser del computer.
 *   - Due pulsanti, sempre nello stesso posto: «Apri in TALOS», «Apri nel browser». In evidenza quello usato l'ultima volta: il
 *     posto non cambia mai, cambia solo l'enfasi (un pulsante che si sposta fa sbagliare chi ha già imparato dov'è).
 *   - «Non chiedermi più dove aprirli»: da lì in poi la domanda sul SITO resta, ma con un pulsante solo verso la destinazione scelta.
 *   - Un sito fidato ricorda anche DOVE si apre.
 *   - Le pagine di chiavi e di account (`paginaSoloNelSistema`) e ogni link quando la scheda Browser non c'è (`puoInTalos`)
 *     hanno il solo «Apri nel browser».
 *   Senza `destinazioni` (chi ospita non ha una scheda Browser) la domanda è quella dell'11/10: una porta sola.
 */
import { t } from './lingua.js';
import { apriModale, chiudiModale } from './modale-td.js';
import { leggiLinkEsterno, paginaSoloNelSistema } from './link-esterni.js';

function nodo(doc, tag, classe, testo) {
  const n = doc.createElement(tag);
  if (classe) n.className = classe;
  if (testo !== undefined && testo !== null) n.textContent = String(testo);
  return n;
}

/** Una riga con l'interruttore del prodotto, la sua frase e, sotto, una riga piccola che spiega. */
function rigaInterruttore(doc, { dato, frase, sotto = null }) {
  const riga = nodo(doc, 'label', 'talos-link-conferma__fidati');
  const interruttore = nodo(doc, 'input', 'talos-switch');
  interruttore.type = 'checkbox'; interruttore.setAttribute('role', 'switch'); interruttore.dataset.c = 'Switch'; interruttore.dataset[dato] = '';
  const testo = nodo(doc, 'span', null, frase);
  if (sotto) testo.append(nodo(doc, 'span', 'td-subtle talos-link-conferma__sotto', sotto));
  riga.append(interruttore, testo);
  return { riga, interruttore };
}

/**
 * Apre il link, chiedendo prima se il sito non è fidato. Torna `'aperto'`, `'chiesto'` o `'rifiutato'` (non è un indirizzo web).
 * `apri(indirizzo, destinazione)` e `copia(indirizzo)` li dà chi ospita (la chat): qui non si tocca né `window` né gli appunti.
 * `destinazione` è `'talos'` o `'sistema'`; `destinazioni` è `creaDestinazioneDeiLink()`; `puoInTalos()` dice se la scheda Browser c'è.
 */
export function apriLinkEsterno(indirizzo, { fidati, destinazioni = null, puoInTalos = () => true, apri, copia = null, document: doc = globalThis.document } = {}) {
  const letto = leggiLinkEsterno(indirizzo);
  if (!letto) return 'rifiutato';
  const delicata = paginaSoloNelSistema(letto.indirizzo);
  let talosC = false;
  try { talosC = Boolean(destinazioni) && !delicata && puoInTalos() === true; } catch { talosC = false; }
  if (letto.sicuro && fidati?.fidato(letto.sito)) {
    apri(letto.indirizzo, talosC && fidati.destinazione?.(letto.sito) === 'talos' ? 'talos' : 'sistema');
    return 'aperto';
  }

  const dove = nodo(doc, 'p', 'td-prose talos-link-conferma__dove');
  dove.append(doc.createTextNode(t('chat.link.goesTo')), doc.createTextNode(' '), nodo(doc, 'strong', 'talos-link-conferma__sito', letto.sito));
  const intero = nodo(doc, 'p', 'td-subtle talos-link-conferma__indirizzo', letto.indirizzo);
  intero.dataset.linkIndirizzo = '';
  const pezzi = [dove, intero];

  const fissa = talosC ? destinazioni.fissa() : null;
  let sempre = null;
  let nonChiedere = null;
  if (letto.sicuro) {
    const fidato = rigaInterruttore(doc, { dato: 'linkFidati', frase: t('chat.link.trust', { site: letto.sito }), sotto: talosC && !fissa ? t('chat.link.trustWhere') : null }); // con una porta sola non c'è un «dove» da ricordare
    sempre = fidato.interruttore;
    pezzi.push(fidato.riga);
    if (talosC && !fissa) {
      const dovunque = rigaInterruttore(doc, { dato: 'linkNonChiedere', frase: t('chat.link.dontAskWhere'), sotto: t('chat.link.dontAskWhereHelp') });
      nonChiedere = dovunque.interruttore;
      pezzi.push(dovunque.riga);
    }
    if (delicata && destinazioni) {
      const nota = nodo(doc, 'p', 'td-subtle talos-link-conferma__avviso', t('chat.link.onlySystem'));
      nota.setAttribute('role', 'note'); nota.dataset.linkSoloSistema = '';
      pezzi.push(nota);
    }
  } else {
    const avviso = nodo(doc, 'p', 'td-subtle talos-link-conferma__avviso', t('chat.link.notSecure'));
    avviso.setAttribute('role', 'note');
    pezzi.push(avviso);
  }

  const piede = nodo(doc, 'div', 'td-detail-footer');
  const annulla = nodo(doc, 'button', 'talos-button talos-button--secondary talos-button--sm', t('chat.common.cancel'));
  annulla.type = 'button';
  annulla.addEventListener('click', () => chiudiModale());
  piede.append(annulla);
  if (typeof copia === 'function') {
    const copiaLink = nodo(doc, 'button', 'talos-button talos-button--ghost talos-button--sm', t('chat.link.copy'));
    copiaLink.type = 'button'; copiaLink.dataset.linkCopia = '';
    copiaLink.addEventListener('click', () => { chiudiModale(); copia(letto.indirizzo); });
    piede.append(copiaLink);
  }
  if (letto.sicuro) {
    /* quali porte: tutte e due finché si sceglie; una sola se la destinazione è fissata, o se in TALOS non si può */
    const porte = !talosC ? ['sistema'] : fissa ? [fissa] : ['talos', 'sistema'];
    const inEvidenza = porte.length === 1 ? porte[0] : destinazioni.ultima();
    for (const porta of porte) {
      const primario = porta === inEvidenza;
      const conferma = nodo(doc, 'button', `talos-button talos-button--${primario ? 'primary' : 'secondary'} talos-button--sm`, t(porta === 'talos' ? 'chat.link.openInTalos' : 'chat.link.open'));
      conferma.type = 'button'; conferma.dataset.linkApri = porta;
      conferma.addEventListener('click', () => {
        if (sempre?.checked) fidati?.aggiungi(letto.sito, porta);
        if (talosC) {
          if (nonChiedere?.checked) destinazioni.fissaSu(porta);
          else destinazioni.ricorda(porta);
        }
        chiudiModale();
        apri(letto.indirizzo, porta);
      });
      piede.append(conferma);
    }
  }
  pezzi.push(piede);
  apriModale(t('chat.link.title'), pezzi, { document: doc });
  /* `apriModale` mette il fuoco sul PRIMO controllo del corpo, che qui sarebbe l'interruttore: lo si porta su «Annulla», la via
     d'uscita (trovato dalla prova LINK-CONFERMA-01: il commento lo prometteva e il codice no). */
  annulla.focus?.({ preventScroll: true });
  return 'chiesto';
}

/**
 * Il clic sui link della chat, delegato sul documento: solo dentro `dentro` (la conversazione), col tasto principale o con quello
 * centrale (che da solo aprirebbe una finestra nuova senza chiedere).
 * ⛔ `auxclick` scatta per OGNI tasto non principale, anche il DESTRO (UI Events, «auxclick»; letto l'11/10/2026 su MDN): il destro
 *   resta al menu contestuale, e la domanda non deve comparire sopra di esso.
 */
export function montaClicSuiLink({ documento = globalThis.document, dentro = '#conversation', ...opzioni } = {}) {
  const suLink = (evento) => {
    if (evento.type === 'auxclick' && evento.button !== 1) return;
    const Elemento = documento.defaultView?.Element ?? globalThis.Element;
    const ancora = evento.target instanceof Elemento ? evento.target.closest('a.talos-link-esterno[data-link-esterno]') : null;
    if (!ancora || !ancora.closest(dentro)) return;
    evento.preventDefault();
    apriLinkEsterno(ancora.dataset.linkEsterno, { ...opzioni, document: documento });
  };
  documento.addEventListener('click', suLink);
  documento.addEventListener('auxclick', suLink);
  return () => { documento.removeEventListener('click', suLink); documento.removeEventListener('auxclick', suLink); };
}
