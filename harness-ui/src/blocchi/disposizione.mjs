// La disposizione del blocco `diagramma` (interfaccia generativa, catalogo v2, scena 9 / FE-082, 05/11/2026).
//
// Un layered layout alla Sugiyama ridotto all'osso, scritto a mano: (1) le frecce che chiudono un ciclo si TAGLIANO dal calcolo dei
// livelli (visita in profondità: la freccia verso un nodo ancora aperto è una freccia all'indietro; si disegna lo stesso), (2) livello
// di ogni nodo = cammino più lungo dalle sorgenti, (3) UNA passata di baricentro per ridurre gli incroci, (4) coordinate a griglia,
// dall'alto in basso (la chat scorre in verticale). Con ≤ 12 nodi e ≤ 16 frecce non serve altro.
// ⛔ Nessun pacchetto: il ripiego nominato, se un giorno servissero nodi fittizi e meno incroci, è d3-dag (`sugiyama()`,
//   github.com/erikbrinkman/d3-dag), oggi NON usato.
//
// Puro e senza dipendenze (niente DOM): lo leggono il disegnatore del PC e l'esportazione in SVG, che così coincidono.

export const NODO = Object.freeze({ larghezza: 150, altezza: 40 });
const SPAZIO = Object.freeze({ x: 28, y: 44, margine: 12 });
/** Quanto un anello su sé stesso esce a destra del suo nodo. */
const ANELLO = 16;

/**
 * @param {{ id: string }[]} nodi
 * @param {{ da: string, a: string }[]} frecce
 * @returns {{ posizioni: Map<string, {x:number,y:number}>, frecce: { da: string, a: string, indietro: boolean, punti: number[][] }[],
 *   larghezza: number, altezza: number }} `x`,`y` è l'angolo in alto a sinistra del nodo; i punti di una freccia vanno da bordo a bordo
 */
export function disponiDiagramma(nodi, frecce) {
  const ids = [];
  for (const n of Array.isArray(nodi) ? nodi : []) if (n && typeof n.id === 'string' && !ids.includes(n.id)) ids.push(n.id);
  const valide = (Array.isArray(frecce) ? frecce : []).filter((f) => f && ids.includes(f.da) && ids.includes(f.a));

  // (1) frecce all'indietro: visita in profondità nell'ordine dato (deterministica)
  const uscite = new Map(ids.map((id) => [id, []]));
  valide.forEach((f, i) => uscite.get(f.da).push(i));
  const stato = new Map(); // 1 aperto, 2 chiuso
  const indietro = new Set();
  const visita = (id) => {
    stato.set(id, 1);
    for (const i of uscite.get(id)) {
      const a = valide[i].a;
      if (stato.get(a) === 1) indietro.add(i);
      else if (!stato.has(a)) visita(a);
    }
    stato.set(id, 2);
  };
  for (const id of ids) if (!stato.has(id)) visita(id);

  // (2) cammino più lungo sul grafo senza le frecce tagliate (ora aciclico): rilassamento ripetuto, al più |nodi| giri
  const livello = new Map(ids.map((id) => [id, 0]));
  for (let giro = 0; giro < ids.length; giro += 1) {
    let cambiato = false;
    valide.forEach((f, i) => {
      if (indietro.has(i)) return;
      if (livello.get(f.a) < livello.get(f.da) + 1) { livello.set(f.a, livello.get(f.da) + 1); cambiato = true; }
    });
    if (!cambiato) break;
  }
  const livelli = [];
  for (const id of ids) (livelli[livello.get(id)] ||= []).push(id);

  // (3) una passata di baricentro, dall'alto: ordina ogni livello per la posizione media dei predecessori
  for (let l = 1; l < livelli.length; l += 1) {
    if (!livelli[l]) continue;
    const prima = new Map((livelli[l - 1] || []).map((id, k) => [id, k]));
    const baricentro = new Map(livelli[l].map((id, k) => {
      const da = valide.filter((f, i) => !indietro.has(i) && f.a === id && prima.has(f.da)).map((f) => prima.get(f.da));
      return [id, da.length ? da.reduce((s, x) => s + x, 0) / da.length : k];
    }));
    livelli[l] = livelli[l].map((id, k) => [id, baricentro.get(id), k]).sort((p, q) => p[1] - q[1] || p[2] - q[2]).map((p) => p[0]);
  }

  // (4) coordinate: ogni livello centrato sulla larghezza del più largo
  const piuLargo = Math.max(1, ...livelli.map((l) => (l ? l.length : 0)));
  const larghezza = 2 * SPAZIO.margine + piuLargo * NODO.larghezza + (piuLargo - 1) * SPAZIO.x;
  const posizioni = new Map();
  livelli.forEach((l, k) => {
    if (!l) return;
    const occupata = l.length * NODO.larghezza + (l.length - 1) * SPAZIO.x;
    const x0 = (larghezza - occupata) / 2;
    l.forEach((id, j) => posizioni.set(id, { x: x0 + j * (NODO.larghezza + SPAZIO.x), y: SPAZIO.margine + k * (NODO.altezza + SPAZIO.y) }));
  });
  /* (5) un anello su sé stesso esce di ANELLO a destra del nodo: sul nodo più a destra uscirebbe dalla tela (tagliato a schermo e
   * nell'SVG). La tela si allarga A DESTRA quanto basta a tenerlo col suo margine; i nodi restano dove sono, e un diagramma senza
   * anelli (o con anelli lontani dal bordo) ha la larghezza di prima. */
  let tela = larghezza;
  for (const f of valide) if (f.da === f.a) tela = Math.max(tela, posizioni.get(f.da).x + NODO.larghezza + ANELLO + SPAZIO.margine);
  const altezza = 2 * SPAZIO.margine + Math.max(1, livelli.length) * NODO.altezza + Math.max(0, livelli.length - 1) * SPAZIO.y;

  const percorsi = valide.map((f, i) => {
    const p = posizioni.get(f.da);
    const q = posizioni.get(f.a);
    const cx = (r) => r.x + NODO.larghezza / 2;
    let punti;
    if (f.da === f.a) {
      // un anello sul lato destro del nodo
      const d = p.x + NODO.larghezza;
      punti = [[d, p.y + 10], [d + ANELLO, p.y + 10], [d + ANELLO, p.y + NODO.altezza - 10], [d, p.y + NODO.altezza - 10]];
    } else if (q.y > p.y) punti = [[cx(p), p.y + NODO.altezza], [cx(q), q.y]];
    else if (q.y < p.y) punti = [[cx(p), p.y], [cx(q), q.y + NODO.altezza]];
    else punti = q.x > p.x ? [[p.x + NODO.larghezza, p.y + NODO.altezza / 2], [q.x, q.y + NODO.altezza / 2]] : [[p.x, p.y + NODO.altezza / 2], [q.x + NODO.larghezza, q.y + NODO.altezza / 2]];
    return { da: f.da, a: f.a, indietro: indietro.has(i), punti };
  });
  return { posizioni, frecce: percorsi, larghezza: tela, altezza };
}
