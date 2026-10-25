/*
 * ⭐ 22/10/2026 (streaming fluido) — UN TURNO SI SALTA FUORI VISTA SOLO DOPO IL SUO PRIMO DISEGNO.
 *
 * `styles/streaming-fluido.css` mette `content-visibility: auto` sui turni chiusi: fuori vista non si impaginano e non si
 * dipingono, e la loro altezza è quella che il browser RICORDA (`contain-intrinsic-size: auto 360px`). Ma un'altezza si ricorda
 * solo se il turno è stato disegnato normalmente almeno una volta; altrimenti vale la stima, 360 px (MDN `contain-intrinsic-size`:
 * «allows the size of the element to be stored if the element is ever "normally rendered"… otherwise the specified <length>»,
 * letto il 22/10/2026). È la trappola che Hermes documenta (`apps/desktop/src/components/assistant-ui/thread/list.tsx:345-357`,
 * clone `8237c7f8`).
 * ⛔ Misurato il 22/10/2026, prova «lo streaming porta l'ultimo output verso il centro»: diciotto turni da 90 px montati fuori
 *   vista valevano 360 px l'uno; entrando in vista si accorciavano, lo scorrimento massimo calava da 5.481 a 2.511 px sotto lo
 *   scrittore che segue il testo (che non sale mai, per non far ballare la vista) e la coda del testo restava al 38% della vista
 *   invece che a metà. Succede a ogni turno montato fuori vista: la storia rigiocata di una sessione riaperta, per prima.
 * ⇒ Il turno nasce senza `data-disegnato` (quindi senza `content-visibility`): il primo fotogramma lo impagina per intero, come
 *   prima del 22/10, e il browser ne ricorda l'altezza vera. Il fotogramma dopo riceve il segno e da lì si salta fuori vista con
 *   quell'altezza. Un turno che in quei fotogrammi non ha un riquadro (la chat nascosta da un'altra sezione) aspetta il prossimo
 *   giro: meglio impaginato in più che saltato con un'altezza finta.
 */

export const SEGNO_DISEGNATO = 'data-disegnato';

/**
 * Segna i turni di `conversazione` (figli `.talos-turn`) dopo il loro primo disegno, ora e quando ne arrivano di nuovi.
 * Restituisce la funzione che smette.
 */
export function segnaTurniDisegnati(conversazione, finestra = globalThis.window) {
  if (!conversazione || typeof finestra?.MutationObserver !== 'function' || typeof finestra.requestAnimationFrame !== 'function') return () => {};
  const inAttesa = new Set();
  let programmato = false;
  let attivo = true;

  const segna = () => {
    programmato = false;
    if (!attivo) return;
    for (const turno of inAttesa) {
      if (!turno.isConnected) { inAttesa.delete(turno); continue; }
      if (turno.getClientRects().length === 0) continue; // nessun riquadro: non è stato disegnato, si riprova al prossimo giro
      turno.setAttribute(SEGNO_DISEGNATO, '');
      inAttesa.delete(turno);
    }
  };
  /* il primo fotogramma DISEGNA i turni nuovi (e il browser ne ricorda l'altezza), il secondo li segna */
  const programma = () => {
    if (programmato || inAttesa.size === 0) return;
    programmato = true;
    finestra.requestAnimationFrame(() => finestra.requestAnimationFrame(segna));
  };
  const aggiungi = (nodo) => {
    if (nodo?.nodeType === 1 && nodo.classList.contains('talos-turn') && !nodo.hasAttribute(SEGNO_DISEGNATO)) inAttesa.add(nodo);
  };

  for (const figlio of conversazione.children) aggiungi(figlio);
  programma();
  const osservatore = new finestra.MutationObserver((lista) => {
    for (const record of lista) for (const nodo of record.addedNodes) aggiungi(nodo);
    programma();
  });
  osservatore.observe(conversazione, { childList: true });
  return () => { attivo = false; osservatore.disconnect(); inAttesa.clear(); };
}
