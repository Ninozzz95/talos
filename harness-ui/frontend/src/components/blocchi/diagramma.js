/*
 * Il disegnatore di `diagramma` (interfaccia generativa, catalogo v2, scena 9, ledger G-C UIG-9): nodi e frecce in un SVG costruito
 * con `comune.svg` (mai markup), disposto da `src/blocchi/disposizione.mjs` (a strati: cammino più lungo e un passaggio di
 * baricentro; un ciclo si taglia sulla freccia all'indietro, disegnata ad ansa). Le frecce portano un `marker` (MDN «<marker>»,
 * https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/marker, letta il 05/11/2026) con un id unico per disegno,
 * perché due diagrammi nella stessa pagina non si rubino la punta.
 * Accessibilità: `role="img"` e come nome il ripiego testuale del blocco (la stessa lettura del testo copiato); il testo dei nodi usa
 * i token di testo, la forma il bordo del tema. Un testo più lungo di un nodo si accorcia a punti di codice (mai a metà di una
 * coppia surrogata) e il testo intero resta nel `<title>` del nodo.
 */
import { disponiDiagramma, NODO } from '../../../../src/blocchi/disposizione.mjs';
import { ripiegoTestuale } from '../../../../src/blocchi/catalogo.mjs';
import { el, linguaDeiNumeri, lista, svg } from './comune.js';

const CARATTERI_NEL_NODO = 20;
let progressivo = 0;

/** Un testo a misura di nodo, contato in punti di codice. */
export function testoNelNodo(testo, massimo = CARATTERI_NEL_NODO) {
  const punti = Array.from(String(testo ?? ''));
  return punti.length <= massimo ? punti.join('') : `${punti.slice(0, massimo - 1).join('').trimEnd()}…`;
}

/**
 * @param {object} blocco l'albero del lettore (`tipo: 'diagramma'`), anche parziale
 * @param {{ document: Document }} opzioni
 */
export function disegnaDiagramma(blocco, { document: doc } = {}) {
  const nodi = lista(blocco.nodi).filter((n) => n && typeof n.id === 'string');
  const ids = new Set(nodi.map((n) => n.id));
  const frecce = lista(blocco.frecce).filter((f) => f && ids.has(f.da) && ids.has(f.a));
  const radice = el(doc, 'div', 'gu-diagramma');
  const d = disponiDiagramma(nodi, frecce);
  const marcatore = `gu-punta-${(progressivo += 1)}`;
  const s = svg(doc, 'svg', { class: 'gu-diagramma__svg', viewBox: `0 0 ${d.larghezza} ${d.altezza}`, width: d.larghezza, height: d.altezza, role: 'img' });
  s.setAttribute('aria-label', nodi.length ? ripiegoTestuale({ ...blocco, nodi, frecce }, { lingua: linguaDeiNumeri() }) : '');
  const defs = svg(doc, 'defs');
  const m = svg(doc, 'marker', { id: marcatore, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' });
  m.append(svg(doc, 'path', { d: 'M0,0 L10,5 L0,10 z', class: 'gu-diagramma__punta' }));
  defs.append(m);
  s.append(defs);
  d.frecce.forEach((f, i) => {
    const g = svg(doc, 'g', { class: f.indietro ? 'gu-diagramma__freccia gu-diagramma__freccia--indietro' : 'gu-diagramma__freccia' });
    g.append(svg(doc, 'polyline', { points: f.punti.map((p) => p.join(',')).join(' '), 'marker-end': `url(#${marcatore})` }));
    const testo = frecce[i]?.testo;
    if (testo) {
      const [a, b] = [f.punti[0], f.punti[f.punti.length - 1]];
      const scritta = svg(doc, 'text', { x: (a[0] + b[0]) / 2 + 4, y: (a[1] + b[1]) / 2, class: 'gu-diagramma__etichetta' });
      scritta.textContent = testoNelNodo(testo);
      g.append(scritta);
    }
    s.append(g);
  });
  for (const n of nodi) {
    const p = d.posizioni.get(n.id);
    if (!p) continue;
    const g = svg(doc, 'g', { class: 'gu-diagramma__nodo' });
    const titolo = svg(doc, 'title');
    titolo.textContent = n.testo ?? '';
    g.append(titolo, svg(doc, 'rect', { x: p.x, y: p.y, width: NODO.larghezza, height: NODO.altezza, rx: 8 }));
    const scritta = svg(doc, 'text', { x: p.x + NODO.larghezza / 2, y: p.y + NODO.altezza / 2, 'text-anchor': 'middle', 'dominant-baseline': 'central' });
    scritta.textContent = testoNelNodo(n.testo);
    g.append(scritta);
    s.append(g);
  }
  radice.append(s);
  return radice;
}
