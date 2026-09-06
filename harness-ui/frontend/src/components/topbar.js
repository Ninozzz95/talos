/*
 * Topbar — la testata della sessione, come nel mockup.
 *
 * Quarto componente della Fase 2. Il blocco `data-c="Topbar"` del mockup:
 *
 *   <div class="talos-topbar" data-c="Topbar">
 *     <div class="talos-topbar__title"><h1>W1-02 registro processi</h1><svg class="i"><use href="#i-chev"/></svg></div>
 *     <span class="talos-topbar__path">~/Desktop/projects/AVM-harness-desktop</span>
 *     <div class="talos-tabs" data-c="Tabs"><div class="talos-tabs__list" role="tablist" data-vistetab>
 *       <button class="talos-tabs__tab" role="tab" data-vaia="chat" aria-selected="true">Chat</button>
 *       <button … data-vaia="terminale">Terminale <span class="talos-tabs__count">2</span></button>
 *       <button … data-vaia="review">Review <span class="talos-tabs__count">3</span></button>
 *     </div></div>
 *     <div class="talos-topbar__actions">… IconButton …</div>
 *   </div>
 *
 * Il markup resta quello del template (il monolite lo trova per id: #sessionTitle,
 * #resumeSessionBtn…): questo modulo lo AGGIORNA dai dati, non lo ricrea.
 *   · titolo = il nome della sessione (state.session, la stessa parola della sidebar);
 *   · percorso = la cartella della sessione (`cartellaAssoluta`). ⛔ 06/09, owner: «la testata in alto
 *     non deve avere la scritta C:\Users\…\progetto-1» — a schermo va il NOME della cartella, il
 *     percorso intero resta nel suggerimento (`title`), che è dove serve quando serve. La app non
 *     conosce la home dell'utente, quindi non si inventa nessun «~»; senza cartella il tratto NON si scrive;
 *   · i conteggi delle schede = le schede del terminale aperte e i file toccati
 *     della review; a zero il badge non c'è (il mockup lo mostra solo quando > 0).
 *
 * Ricerca 05/09/2026 — WAI-ARIA APG «Tabs Pattern» (w3.org/WAI/ARIA/apg/patterns/tabs):
 * attivazione automatica al focus solo se il pannello si mostra senza latenza,
 * roving tabindex (uno solo a tabindex=0). Le viste Chat/Terminale/Review sono
 * già nel DOM: attivazione automatica, come fa la regia del mockup (portata in
 * app.js con selezionaTab). Nessun aria-label che duplichi il testo visibile.
 */

/**
 * Il nome della cartella da mostrare in testata: l'ultimo tratto del percorso.
 * ⛔ 06/09 — la testata mostrava `C:\Users\…\scratchpad\banco-umano\progetto-1` per intero: una riga di
 * testo lunga quanto mezza finestra che spingeva le viste fuori dal centro. Il percorso intero non si perde:
 * va nel suggerimento. Un testo che NON è un percorso (la Review ci scrive «3 file modificati · +112 −2»)
 * resta com'è: si taglia solo se ci sono separatori di cartella.
 */
export function nomeCartella(percorso) {
  const testo = String(percorso || '').trim();
  if (!testo || !/[\\/]/.test(testo)) return testo;
  const parti = testo.replace(/[\\/]+$/, '').split(/[\\/]+/).filter(Boolean);
  return parti.length ? parti[parti.length - 1] : testo;
}

/** Scrive (o toglie) il badge di conteggio di una scheda della testata. */
export function impostaConteggioScheda(tab, conteggio) {
  if (!tab) return;
  let badge = tab.querySelector('.talos-tabs__count');
  if (!Number.isFinite(conteggio) || conteggio <= 0) {
    if (badge) {
      // il mockup separa etichetta e badge con uno spazio: via anche quello
      if (badge.previousSibling?.nodeType === 3) badge.previousSibling.textContent = badge.previousSibling.textContent.replace(/\s+$/u, '');
      badge.remove();
    }
    return;
  }
  if (!badge) {
    badge = tab.ownerDocument.createElement('span');
    badge.className = 'talos-tabs__count';
    tab.append(tab.ownerDocument.createTextNode(' '), badge);
  }
  badge.textContent = String(Math.trunc(conteggio));
}

/**
 * Aggiorna la testata dai dati del monolite.
 * @param {Element} topbar il `.talos-topbar`
 * @param {{titolo?:string, percorso?:string|null, schedeTerminale?:number, fileReview?:number}} dati
 */
export function aggiornaTopbar(topbar, dati = {}) {
  if (!topbar) return;
  const h1 = topbar.querySelector('.talos-topbar__title h1');
  if (h1 && typeof dati.titolo === 'string' && h1.textContent !== dati.titolo) h1.textContent = dati.titolo;
  const percorso = topbar.querySelector('.talos-topbar__path');
  if (percorso && 'percorso' in dati) { // chi non passa il percorso non lo tocca (la Review ci scrive il sommario dei file)
    const testo = typeof dati.percorso === 'string' && dati.percorso.trim() ? dati.percorso.trim() : '';
    percorso.textContent = nomeCartella(testo);
    percorso.title = testo;
    percorso.hidden = testo === '';
  }
  if ('schedeTerminale' in dati) impostaConteggioScheda(topbar.querySelector('[role="tab"][data-vaia="terminale"]'), dati.schedeTerminale);
  if ('fileReview' in dati) impostaConteggioScheda(topbar.querySelector('[role="tab"][data-vaia="review"]'), dati.fileReview);
}
