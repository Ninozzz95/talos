/*
 * NavItem — la voce dei «Luoghi» nella sidebar, come nel mockup.
 *
 * Secondo componente della Fase 2. Il markup è il blocco `data-c="NavItem"`
 * del mockup, byte per byte:
 *
 *   <button class="talos-nav-item" data-c="NavItem" data-vaia="board">
 *     <svg class="i"><use href="#i-grid"/></svg>
 *     <span class="talos-nav-item__label">Board</span>
 *     <span class="talos-nav-item__count">69</span>
 *   </button>
 *
 * ⛔ Il conteggio è un DATO: viene da una rotta vera (gli attrezzi da
 * `/api/v1/tools`, le sessioni da `/api/v1/sessions`, le liste della sessione
 * aperta da `/api/v1/sessions/:id/{library,memory,tasks,notes,research,tool-forge}`,
 * le automazioni da `/api/v1/automations`). Quando il dato non c'è — nessuna
 * sessione aperta, rotta che fallisce — il conteggio NON si scrive: né uno
 * zero finto né il numero del mockup. Il badge assente è uno stato onesto.
 *
 * Ricerca 05/09/2026: il conteggio resta TESTO VISIBILE dentro il pulsante,
 * letto insieme all'etichetta — niente `aria-label` che duplichi un testo
 * visibile (non viene tradotto dai browser e sovrascrive il nome accessibile:
 * aditus.io/aria/aria-label, web-accessibility-checker.com «ARIA labels best
 * practices»); il badge come `aria-hidden` + nome nell'aria-label è la forma
 * per i pulsanti SOLO icona (opensource.ebay.com/evo-web icon-button), non per
 * una voce con etichetta. Un'altra scelta nota mostra i
 * conteggi di memoria come uso percentuale; qui i numeri sono dimensioni di
 * liste, come nel mockup approvato.
 *
 * Elemento a Light DOM, CSS globale del mockup (blog.master.dev/light-dom-only).
 */

/** I Luoghi del mockup, nell'ordine e con le icone dello sprite. */
export const LUOGHI = Object.freeze([
  { vaia: 'capability', icona: 'i-list', etichetta: 'Capability' },
  { vaia: 'board', icona: 'i-grid', etichetta: 'Board' },
  { vaia: 'libreria', icona: 'i-files', etichetta: 'Libreria' },
  { vaia: 'memoria', icona: 'i-brain', etichetta: 'Memoria' },
  { vaia: 'attivita', icona: 'i-check-sq', etichetta: 'Attività' },
]);

/** I Luoghi sotto «Altro» (il disclosure `#luoghiAltri`). `note` non ha una schermata sua: solo il conteggio. */
export const LUOGHI_ALTRI = Object.freeze([
  { conteggio: 'note', icona: 'i-doc', etichetta: 'Note' },
  { vaia: 'ricerca', icona: 'i-globe', etichetta: 'Ricerca approfondita' },
  { vaia: 'officina', icona: 'i-code', etichetta: 'Officina attrezzi' },
  { vaia: 'automazioni', icona: 'i-clock', etichetta: 'Automazioni' },
]);

const SVG_NS = 'http://www.w3.org/2000/svg';

function icona(documentObj, nome) {
  const svg = documentObj.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'i');
  const use = documentObj.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#${nome}`);
  svg.append(use);
  return svg;
}

/**
 * Crea la voce. `conteggio` è un numero ≥ 0, oppure `null`/`undefined` per
 * «non lo so» (nessun badge).
 * @param {{vaia?:string, conteggio?:string, icona:string, etichetta:string, id?:string}} luogo
 * @param {{document?:Document, conteggio?:number|null, corrente?:boolean, onApri?:(e:Event)=>void}} opzioni
 */
export function creaNavItem(luogo, opzioni = {}) {
  const documentObj = opzioni.document || globalThis.document;
  const voce = documentObj.createElement('button');
  voce.type = 'button';
  voce.className = 'talos-nav-item';
  voce.setAttribute('data-c', 'NavItem');
  if (luogo.vaia) voce.dataset.vaia = luogo.vaia;
  if (luogo.conteggio) voce.dataset.conteggio = luogo.conteggio;
  if (luogo.id) voce.id = luogo.id;
  if (opzioni.corrente) voce.setAttribute('aria-current', 'page');
  const etichetta = documentObj.createElement('span');
  etichetta.className = 'talos-nav-item__label';
  etichetta.textContent = luogo.etichetta;
  voce.append(icona(documentObj, luogo.icona), etichetta);
  impostaConteggioNav(voce, opzioni.conteggio);
  if (typeof opzioni.onApri === 'function') voce.addEventListener('click', opzioni.onApri);
  return voce;
}

/**
 * Scrive (o toglie) il badge di conteggio su una voce già montata — è ciò che
 * il monolite chiama quando i dati arrivano. `null` toglie il badge.
 * @param {Element} voce il `.talos-nav-item`
 * @param {number|null|undefined} conteggio
 */
export function impostaConteggioNav(voce, conteggio) {
  if (!voce) return;
  let badge = voce.querySelector('.talos-nav-item__count');
  if (!Number.isFinite(conteggio) || conteggio < 0) {
    badge?.remove();
    return;
  }
  if (!badge) {
    badge = voce.ownerDocument.createElement('span');
    badge.className = 'talos-nav-item__count';
    voce.append(badge);
  }
  badge.textContent = String(Math.trunc(conteggio));
}

/**
 * Aggiorna i badge di tutti i Luoghi in una radice: `conteggi` è una mappa
 * `{ board: 74, capability: 43, note: null, … }` per `data-vaia` o `data-conteggio`.
 * Le chiavi assenti NON si toccano (un dato non ancora arrivato non cancella
 * quello precedente); `null` esplicito toglie il badge.
 */
export function aggiornaConteggiNav(radice, conteggi) {
  for (const [chiave, valore] of Object.entries(conteggi || {})) {
    const voce = radice.querySelector(`.talos-nav-item[data-vaia="${chiave}"], .talos-nav-item[data-conteggio="${chiave}"]`);
    if (voce) impostaConteggioNav(voce, valore);
  }
}
