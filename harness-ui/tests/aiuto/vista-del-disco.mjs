import { readFileSync } from 'node:fs';

/*
 * 14/11/2026 — terzo giro dell'affitto, «mai riscrivere»: l'ORACOLO della regola V per le prove, scritto a parte dal codice
 *   (`numeraLaVista` in `src/rinumerazione-giornale.mjs`). Il diario non si riscrive più: i numeri scritti nelle righe possono ripetersi
 *   (le righe di un altro processo coi suoi numeri), e quelli che ogni lettore di questa versione vede si ricavano dal contenuto.
 *   1) Le righe «adozione» `{tipo:'adozione', inizi, primo}` danno alla riga numerata PRIMA di loro che comincia al byte `inizi[p]` il
 *      numero `primo + p`; la prima adozione nell'ordine del disco vince. 2) Le altre righe numerate, nell'ordine del disco: il loro
 *      numero se nessuno l'ha preso, se no il primo libero sopra il più alto visto fin lì.
 *   ⇒ i record numerati nell'ordine del disco, col `_sequenza` della vista (copie: il file non si tocca).
 */
export function vistaDelDisco(percorso) {
  const righe = [];
  let pos = 0;
  for (const testo of readFileSync(percorso).toString('utf8').split('\n')) {
    const inizio = pos;
    pos += Buffer.byteLength(testo, 'utf8') + 1;
    if (!testo.trim()) continue;
    try { righe.push({ inizio, r: JSON.parse(testo) }); } catch { /* una mezza riga in coda */ }
  }
  const perInizio = new Map(righe.map((x) => [x.inizio, x]));
  const numero = new Map();
  const usati = new Set();
  for (const ad of righe.filter((x) => x.r?.tipo === 'adozione' && Array.isArray(x.r.inizi) && Number.isSafeInteger(x.r.primo))) {
    ad.r.inizi.forEach((inizio, p) => {
      const x = perInizio.get(inizio);
      if (!x || x.inizio >= ad.inizio || !Number.isSafeInteger(x.r?._sequenza) || numero.has(x)) return;
      numero.set(x, ad.r.primo + p); usati.add(ad.r.primo + p);
    });
  }
  let massimo = 0;
  for (const x of righe) {
    if (!Number.isSafeInteger(x.r?._sequenza)) continue;
    if (!numero.has(x)) {
      let n = x.r._sequenza;
      if (usati.has(n)) { n = massimo + 1; while (usati.has(n)) n += 1; }
      usati.add(n); numero.set(x, n);
    }
    massimo = Math.max(massimo, numero.get(x));
  }
  return righe.filter((x) => numero.has(x)).map((x) => ({ ...x.r, _sequenza: numero.get(x) }));
}

/** Le righe del diario nell'ordine del disco, quelle numerate col numero della vista (le altre come sono, le «adozione» tolte). */
export function righeDellaVista(percorso) {
  const vista = vistaDelDisco(percorso);
  let k = 0;
  const tutte = [];
  for (const testo of readFileSync(percorso, 'utf8').split('\n')) {
    if (!testo.trim()) continue;
    let r;
    try { r = JSON.parse(testo); } catch { continue; }
    if (r?.tipo === 'adozione' && Array.isArray(r.inizi)) continue;
    tutte.push(Number.isSafeInteger(r?._sequenza) ? vista[k++] : r);
  }
  return tutte;
}
