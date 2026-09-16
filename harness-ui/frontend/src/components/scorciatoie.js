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
  /* ⛔ 16/09: `kbd` NON basta. Le combinazioni del composer sono `<span class="talos-kbd">` (la
     pill del modello, «Ctrl ⇧ M», e «Ctrl ↵» del bivio): guardando un markup solo, su un Mac
     restavano scritte col tasto sbagliato. Si legge la CLASSE oltre al tag, come fa il CSS. */
  for (const nodo of radice.querySelectorAll('kbd, .talos-kbd')) {
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

/*
 * ⭐⭐⭐ 16/09/2026, P0/A punto 2 — «a volte apre una scheda nuova del browser».
 *
 * Root cause: la palette dei comandi ANNUNCIAVA «Ctrl T», «Ctrl B» e «Ctrl R» e `riconosci()` non
 * conosceva nessuna delle tre. Chi legge l'etichetta e preme i tasti li consegna al browser:
 * scheda nuova, preferiti, ricarica. La guardia che c'era già (`SCORCIATOIE-REGISTRO`, 06/09) non
 * poteva vederlo: guardava il REGISTRO — le combinazioni che ESISTONO — e mai quelle che
 * l'interfaccia PROMETTE. La promessa sta nel markup, e nessuno la leggeva.
 *
 * Ricerca 16/09/2026, alla fonte: su Windows Chrome NON consegna affatto alla pagina Ctrl+N,
 * Ctrl+T e Ctrl+W, quindi `preventDefault()` su quelle è inerte per specifica (W3C
 * public-webapps, discussione UI Events «browsers MAY ignore calls of preventDefault() when key
 * combinations are important for UI»; Microsoft Learn, «browser default action for Ctrl+P cannot
 * be prevented»). ⇒ Una combinazione così non si «gestisce meglio»: NON SI ANNUNCIA.
 */

/**
 * Le combinazioni che il browser si prende PRIMA della pagina: annunciarle è una promessa che non
 * può essere mantenuta, nemmeno con `preventDefault()`.
 * ⛔ `mod N` NON è in questa lista, ed è una scelta dichiarata, non una dimenticanza: sta nel
 *   registro, è implementata (`createNewSession`) e nel guscio Electron — dove TALOS si consegna —
 *   arriva davvero alla pagina. In una scheda di Chrome se la prende il browser: è un limite noto,
 *   e cambiarla è una decisione di prodotto dell'owner, non di questo cancello.
 */
export const COMBO_RISERVATE_AL_BROWSER = Object.freeze(['mod T', 'mod W', 'mod ⇧ T', 'mod ⇧ W', 'mod ⇧ N']);

/**
 * Le combinazioni annunciate che un gestore DIVERSO dal registro globale onora davvero.
 * Ogni riga porta il suo perché: senza motivo è un'eccezione che nasconde un difetto.
 */
export const COMBO_GESTITE_ALTROVE = Object.freeze({
  'mod ↵': 'il composer, non il registro globale: accoda il messaggio invece di inviarlo (legacy/invio-durante-il-giro.js, decidiInvio)',
});

/**
 * La forma canonica di una combinazione: «Ctrl T», «⌘T» e «mod T» diventano tutte `mod T`.
 * Torna stringa vuota quando non c'è un modificatore — «Esc», «↑ ↓», «D» non sono promesse globali.
 */
export function normalizzaCombo(combo) {
  const parti = String(combo || '')
    .replace(/⌘/gu, 'mod ')
    .replace(/\bCtrl\b/giu, 'mod')
    .replace(/\bCmd\b/giu, 'mod')
    .replace(/\bShift\b/giu, '⇧')
    .split(/[+\s]+/u)
    .filter(Boolean)
    .map((pezzo) => (pezzo.length === 1 && /[a-z]/u.test(pezzo) ? pezzo.toUpperCase() : pezzo));
  if (!parti.includes('mod') && !parti.includes('⇧')) return '';
  return parti.join(' ');
}

/**
 * Ogni combinazione ANNUNCIATA dentro una radice, con quante volte compare.
 * ⛔ Si leggono sia i `<kbd>` sia i `<span class="talos-kbd">`: il progetto usa tutti e due per
 *   dire la stessa cosa, e guardarne uno solo lascia fuori proprio la pill del modello.
 * @returns {Map<string, number>} combinazione canonica → quante volte è scritta
 */
export function combinazioniAnnunciate(radice = globalThis.document) {
  const conteggio = new Map();
  for (const nodo of radice.querySelectorAll('kbd, .talos-kbd')) {
    const combo = normalizzaCombo((nodo.textContent || '').trim());
    if (combo) conteggio.set(combo, (conteggio.get(combo) ?? 0) + 1);
  }
  return conteggio;
}

/**
 * Le combinazioni scritte a schermo che NESSUNO gestisce: né il registro globale né un'esenzione
 * dichiarata. È la lista che deve restare vuota — ogni riga qui dentro è una promessa rotta.
 * @returns {string[]} in ordine alfabetico
 */
export function scorciatoieSenzaGestore(radice = globalThis.document, { righe = SCORCIATOIE, esenti = COMBO_GESTITE_ALTROVE } = {}) {
  const gestite = new Set(righe.map((riga) => normalizzaCombo(riga.combo)));
  return [...combinazioniAnnunciate(radice).keys()]
    .filter((combo) => !gestite.has(combo) && !Object.hasOwn(esenti, combo))
    .sort();
}

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
