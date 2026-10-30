/*
 * PANNELLO v2 — PAGINE E PIEGHE, la parte PURA (owner 29/10 sera, chiarito con AskUserQuestion: «tutto paginabile e comprimibile, e
 * ogni scheda sta nello schermo»). Niente DOM qui: le funzioni che le prove unitarie leggono.
 *
 * ⭐ Da dove viene la forma:
 *   · le pagine sono quelle che la scheda Agenti ha GIÀ («Precedente · 1–25 di 40 · Successiva», `components/inspector.js:1530-1592`,
 *     `nav.talos-agenti-pagine` con `aria-label` «Pagine degli agenti», parole `agenti.delegations.previous/next/pageRange`): qui la
 *     stessa barra per OGNI elenco, ma la dimensione della pagina non è più fissa (25): si calcola dallo spazio;
 *   · le pieghe sono quelle delle card del Contesto (`talos-inspector-card__comprimi`, `aria-expanded`, scelta ricordata in
 *     `localStorage` con try/catch: `montaCardContesto`, `legacy/app.js:2638-2662`).
 *
 * Il calcolo dello spazio è un «riempimento ad acqua» (water-filling): ogni sezione aperta ha almeno UNA riga, poi le righe libere
 * vanno una alla volta alla sezione che ne mostra meno, finché lo spazio basta. Una sezione che non mostra tutto paga anche la sua
 * barra delle pagine; quando arriva a mostrare tutto, la barra le viene restituita. Così nessuna sezione sparisce e la più lunga
 * non mangia le altre.
 */

/**
 * Divide lo spazio della colonna fra le sezioni APERTE.
 * @param {{ spazio:number, sezioni:{chiave:string, totale:number, altezzaRiga:number}[], altezzaPager:number }} p
 * @returns {Map<string, number>} chiave → righe per pagina (almeno 1 per ogni sezione non vuota)
 */
export function dividiLoSpazio({ spazio, sezioni, altezzaPager = 36 }) {
  const dim = new Map();
  const vive = sezioni.filter((s) => s.totale > 0);
  for (const s of sezioni) dim.set(s.chiave, s.totale > 0 ? 1 : 0);
  let resto = Number.isFinite(spazio) ? spazio : Infinity;
  /* il minimo: una riga ciascuna, più la barra se ne ha più di una */
  for (const s of vive) resto -= s.altezzaRiga + (s.totale > 1 ? altezzaPager : 0);
  for (;;) {
    let scelta = null;
    let costo = 0;
    for (const s of vive) {
      const n = dim.get(s.chiave);
      if (n >= s.totale) continue;
      /* l'ultima riga che manca restituisce la barra delle pagine: costa meno */
      const c = s.altezzaRiga - (n + 1 === s.totale ? altezzaPager : 0);
      if (c > resto) continue;
      if (!scelta || n < dim.get(scelta.chiave)) { scelta = s; costo = c; }
    }
    if (!scelta) break;
    dim.set(scelta.chiave, dim.get(scelta.chiave) + 1);
    resto -= costo;
  }
  return dim;
}

/** La pagina (da 0) che contiene la voce di posto `indice`. */
export function paginaDi(indice, dimensione) {
  return dimensione > 0 && indice > 0 ? Math.floor(indice / dimensione) : 0;
}

/** Dove sta la voce `chiave` fra `chiavi`: la sua pagina, o `null` se non c'è (filtrata via, o chiave estranea). */
export function paginaCheContiene(chiavi, chiave, dimensione) {
  const i = chiavi.indexOf(chiave);
  return i < 0 ? null : paginaDi(i, dimensione);
}

/** La finestra di una pagina, con la pagina riportata dentro i limiti. `da`/`a` contano da 1, come «1–8 di 30». */
export function intervallo(pagina, dimensione, totale) {
  const dimensioneVera = Math.max(1, dimensione || 1);
  const ultima = Math.max(0, Math.ceil(totale / dimensioneVera) - 1);
  const p = Math.min(Math.max(0, pagina || 0), ultima);
  const inizio = p * dimensioneVera;
  return { pagina: p, ultima, inizio, fine: Math.min(inizio + dimensioneVera, totale), da: totale ? inizio + 1 : 0, a: Math.min(inizio + dimensioneVera, totale), totale };
}

/**
 * Le pieghe ricordate, per scheda: `{ [scheda]: { chiuse: [chiave], aperte: [chiave] } }` sotto una chiave sola. `chiuse` = sezioni
 * (nascono aperte), `aperte` = pieghe tratteggiate (nascono chiuse). Uno storage illeggibile vale «mai scelto».
 */
export const CHIAVE_PIEGHE = 'talos.harness.desktop.pannello.pieghe.v1';
export function leggiPieghe(storage, scheda) {
  try {
    const tutto = JSON.parse(storage?.getItem(CHIAVE_PIEGHE) || '{}');
    const mio = tutto && typeof tutto === 'object' && !Array.isArray(tutto) ? tutto[scheda] : null;
    return { chiuse: new Set(Array.isArray(mio?.chiuse) ? mio.chiuse : []), aperte: new Set(Array.isArray(mio?.aperte) ? mio.aperte : []) };
  } catch {
    return { chiuse: new Set(), aperte: new Set() };
  }
}
export function salvaPieghe(storage, scheda, { chiuse, aperte }) {
  try {
    let tutto = {};
    try { const v = JSON.parse(storage?.getItem(CHIAVE_PIEGHE) || '{}'); if (v && typeof v === 'object' && !Array.isArray(v)) tutto = v; } catch { /* si riparte da vuoto */ }
    tutto[scheda] = { chiuse: [...chiuse], aperte: [...aperte] };
    storage?.setItem(CHIAVE_PIEGHE, JSON.stringify(tutto));
    return true;
  } catch {
    return false; // la piega resta com'è per questa volta: una preferenza non salvata non rompe la scheda
  }
}

/**
 * ⭐ 29/10 sera (revisione D) — i NUMERI sulle schede sono un'aggiunta: quando la fila non entra nella colonna cedono loro, mai i
 * nomi di oggi. Livelli: 0 = numeri e segni · 1 = senza numeri (restano anello e pallino) · 2 = senza niente. `sborda(livello)` dice
 * se a quel livello la fila esce dalla colonna. Torna il primo livello che sta; se nemmeno il 2 sta, torna 2 (e la fila scorre come
 * oggi, `index.css:1940`).
 */
export const LIVELLI_CONTI = Object.freeze(['', 'senza-numeri', 'senza-conti']);
export function livelloContiSchede(sborda) {
  for (let i = 0; i < LIVELLI_CONTI.length; i += 1) if (!sborda(i)) return i;
  return LIVELLI_CONTI.length - 1;
}
