/*
 * scorciatoie.js — le combinazioni di tasti dell'app, con l'etichetta giusta per la piattaforma.
 *
 * Nasce dall'audit delle decisioni del 06/09: la pillola del modello disegnava «Ctrl ⇧ M» e quel
 * tasto non apriva niente, il pulsante Impostazioni prometteva «Ctrl ,» e nemmeno; e la palette
 * mostrava i simboli del Mac (⌘N, ⌘R, ⌘T) su Windows. Una scorciatoia scritta a schermo è una
 * promessa: o funziona, o non si scrive.
 *
 * Ricerca 06/09/2026 (Sasha Maximova, «J, K, or how to choose keyboard shortcuts for web
 * applications»; Till Sanders, «Boy, was it hard to implement proper keyboard shortcuts»;
 * JetBrains, «Shortcut keys for web applications»):
 *   1. non si rubano le combinazioni del browser (Ctrl+N/O/S/P/W/T): le nostre sono Ctrl+K,
 *      Ctrl+Shift+M, Ctrl+, e Ctrl+/ , tutte libere in Chrome;
 *   2. il modificatore si SCRIVE come lo chiama la piattaforma: ⌘ su Apple, Ctrl altrove;
 *   3. la scorciatoia non deve scattare mentre si scrive in un campo, tranne quelle che servono
 *      proprio lì (l'invio del composer, che resta gestito dal composer).
 */

/** Vero su Mac. `userAgentData.platform` è la via nuova, `navigator.platform` il ripiego. */
export function suApple(nav = globalThis.navigator) {
  const p = String(nav?.userAgentData?.platform || nav?.platform || '').toLowerCase();
  return p.includes('mac') || p.includes('ios') || p.includes('iphone') || p.includes('ipad');
}

/** «⌘K» su Apple, «Ctrl K» altrove. Accetta sia «⌘K» sia «Ctrl+K» sia «mod+K». */
export function etichettaTasto(combo, { apple = suApple() } = {}) {
  const testo = String(combo || '').trim();
  if (!testo) return '';
  const parti = testo
    .replace(/⌘/g, 'mod ')
    .replace(/\bCtrl\b/gi, 'mod')
    .replace(/\bCmd\b/gi, 'mod')
    .replace(/\bShift\b/gi, '⇧')
    .split(/[+\s]+/)
    .filter(Boolean);
  return parti.map((p) => (p === 'mod' ? (apple ? '⌘' : 'Ctrl') : p)).join(apple ? '' : ' ');
}

/**
 * Riscrive i `kbd` di una radice con l'etichetta della piattaforma corrente.
 * ⛔ Tocca solo i testi che contengono un modificatore: «Esc», «↑ ↓», «Invio» restano com'erano.
 * @returns {number} quanti ne ha cambiati
 */
export function normalizzaTastiScritti(radice = globalThis.document, { apple = suApple() } = {}) {
  let cambiati = 0;
  for (const nodo of radice.querySelectorAll('kbd')) {
    const testo = (nodo.textContent || '').trim();
    if (!/⌘|ctrl|cmd|shift/i.test(testo)) continue;
    const nuovo = etichettaTasto(testo, { apple });
    if (nuovo && nuovo !== testo) { nodo.textContent = nuovo; cambiati += 1; }
  }
  return cambiati;
}

/**
 * Il registro delle scorciatoie globali. `azioni` è una mappa id → funzione: chi non la passa
 * non collega quella riga (così una scorciatoia esiste solo se ha davvero qualcosa dietro).
 */
export const SCORCIATOIE = Object.freeze([
  { id: 'comandi', combo: 'mod K', area: 'Ovunque', nome: 'Apri i comandi' },
  { id: 'nuova', combo: 'mod N', area: 'Ovunque', nome: 'Nuova sessione' },
  { id: 'modello', combo: 'mod ⇧ M', area: 'Chat', nome: 'Cambia il modello' },
  { id: 'impostazioni', combo: 'mod ,', area: 'Ovunque', nome: 'Apri le impostazioni' },
  { id: 'scorciatoie', combo: 'mod /', area: 'Ovunque', nome: 'Mostra le scorciatoie' },
  { id: 'terminale', combo: 'mod `', area: 'Sessione', nome: 'Mostra o nascondi il terminale' },
  { id: 'terminaleNuovo', combo: 'mod ⇧ `', area: 'Sessione', nome: 'Nuova scheda del terminale' },
]);

/** Riconosce quale scorciatoia è stata premuta. Torna l'id, o null. */
export function riconosci(evento, { apple = suApple() } = {}) {
  if (!evento) return null;
  const mod = apple ? evento.metaKey : evento.ctrlKey;
  if (!mod || evento.altKey) return null;
  const tasto = String(evento.key || '').toLowerCase();
  if (evento.shiftKey) {
    if (tasto === 'm') return 'modello';
    if (tasto === '`' || tasto === '~') return 'terminaleNuovo';
    return null;
  }
  if (tasto === 'k') return 'comandi';
  if (tasto === 'n') return 'nuova';
  if (tasto === ',') return 'impostazioni';
  if (tasto === '/') return 'scorciatoie';
  if (tasto === '`') return 'terminale';
  return null;
}

/**
 * Monta il pannello delle scorciatoie (`#veloScorciatoie`) dal registro: una riga per scorciatoia, con
 * il nome, l'area e la combinazione già scritta per la piattaforma; la ricerca in cima filtra.
 * Decisioni D10-D12 (owner 04/09: pannello con ricerca, raggruppate per area, aperto da `Ctrl+/`).
 * Idempotente.
 */
export function montaScorciatoie(velo, { apple = suApple(), righe = SCORCIATOIE } = {}) {
  if (!velo) return 0;
  const d = velo.ownerDocument;
  const elenco = velo.querySelector('#elencoScorciatoie');
  const vuoto = velo.querySelector('#scorciatoieVuote');
  const cerca = velo.querySelector('#cercaScorciatoia');
  if (!elenco) return 0;
  const disegna = (filtro = '') => {
    const q = String(filtro).trim().toLocaleLowerCase('it');
    const viste = righe.filter((r) => !q || `${r.nome} ${r.area} ${r.combo}`.toLocaleLowerCase('it').includes(q));
    elenco.replaceChildren(...viste.map((r) => {
      const riga = d.createElement('button');
      riga.type = 'button';
      riga.className = 'talos-list-row';
      riga.setAttribute('role', 'listitem');
      riga.dataset.scorciatoia = r.id;
      const testo = d.createElement('span'); testo.className = 'talos-list-row__text';
      const titolo = d.createElement('span'); titolo.className = 'talos-list-row__title'; titolo.textContent = r.nome;
      const sub = d.createElement('span'); sub.className = 'talos-list-row__sub'; sub.textContent = r.area;
      testo.append(titolo, sub);
      const aside = d.createElement('span'); aside.className = 'talos-list-row__aside';
      const tasto = d.createElement('kbd'); tasto.className = 'talos-kbd'; tasto.textContent = etichettaTasto(r.combo, { apple });
      aside.append(tasto);
      riga.append(testo, aside);
      return riga;
    }));
    if (vuoto) vuoto.hidden = viste.length > 0;
    return viste.length;
  };
  if (cerca && !cerca.dataset.collegato) {
    cerca.dataset.collegato = 'si';
    cerca.addEventListener('input', () => disegna(cerca.value));
  }
  return disegna(cerca?.value || '');
}
