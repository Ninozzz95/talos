/*
 * Il disegnatore del `grafico` (interfaccia generativa, catalogo v1): disegno nostro coi token del tema, nessuna libreria.
 * Copiato dal bozzetto approvato:
 *   - `barre`: la griglia `.gr` (`bozzetto-ui-generativa/pc.js:31`, `stile-pc.css:31-40`): nome, pista, barra d'accento, valore scritto;
 *   - `linee`: l'SVG `.gc-svg` con l'asse e la `polyline` (`pc3.js:76`, `stile-pc3.css:53-61`), valore scritto sull'ultimo punto;
 *   - `torta`: la ciambella di `circle` con `stroke-dasharray` (`pc3.js:77`, `stile-pc3.css:62-65`) e la legenda accanto.
 * Regole dei grafici (skill dataviz, 02/11/2026): una serie sola senza legenda, dalla seconda in su legenda sempre; il testo resta
 * nell'inchiostro del testo, il colore sta solo sui segni; i colori di stato (successo, attenzione, pericolo) non fanno da serie.
 * ⛔ `descrizione` (obbligatoria nel catalogo) è il nome del `role="img"`; a schermo la stessa frase sta sotto, nascosta ai lettori di
 *   schermo per non leggerla due volte.
 */
import { el, lista, numero, svg } from './comune.js';

const conUnita = (y, unita) => {
  const n = numero(y);
  if (!unita) return n;
  return unita === '%' ? `${n}%` : `${n} ${unita}`;
};
const classeSerie = (k) => `gu-s${k + 1}`;

function legenda(doc, voci) {
  const l = el(doc, 'div', 'gu-legenda');
  l.setAttribute('aria-hidden', 'true');
  for (const [k, testo] of voci) {
    const v = el(doc, 'span', 'gu-legenda__voce');
    v.append(el(doc, 'i', ['gu-legenda__segno', classeSerie(k)].join(' ')), el(doc, 'span', '', testo));
    l.append(v);
  }
  return l;
}

function barre(doc, serie, unita) {
  const g = el(doc, 'div', 'gr gu-barre');
  const tutti = serie.flatMap((s) => lista(s.punti).map((p) => Math.abs(Number(p.y) || 0)));
  const massimo = Math.max(0, ...tutti) || 1;
  const xs = [];
  for (const s of serie) for (const p of lista(s.punti)) if (!xs.includes(p.x)) xs.push(p.x);
  for (const x of xs) {
    let primo = true; // il nome della x sulla prima barra del gruppo, anche se la prima serie non ha quel punto
    serie.forEach((s, k) => {
      const p = lista(s.punti).find((q) => q.x === x);
      if (!p) return;
      const riga = el(doc, 'div', 'gr__riga');
      riga.dataset.serie = String(k);
      const nome = el(doc, 'span', 'gr__n', primo ? String(x) : '');
      primo = false;
      const pista = el(doc, 'span', 'gr__pista');
      const barra = el(doc, 'span', ['gr__barra', classeSerie(k), p.y < 0 ? 'gr__barra--meno' : ''].filter(Boolean).join(' '));
      barra.style.width = `${(Math.abs(p.y) / massimo) * 100}%`;
      pista.append(barra);
      riga.append(nome, pista, el(doc, 'span', 'gr__v', conUnita(p.y, unita)));
      g.append(riga);
    });
  }
  return g;
}

const L = 300, A = 120, M = { s: 8, d: 44, su: 18, giu: 20 };
function linee(doc, serie, unita) {
  const s = svg(doc, 'svg', { class: 'gc-svg gu-linee', viewBox: `0 0 ${L} ${A}`, 'aria-hidden': 'true', focusable: 'false' });
  const ys = serie.flatMap((x) => lista(x.punti).map((p) => Number(p.y) || 0));
  const lo = Math.min(0, ...ys), hi = Math.max(0, ...ys);
  const ampiezza = hi - lo || 1;
  const xs = [];
  for (const x of serie) for (const p of lista(x.punti)) if (!xs.includes(p.x)) xs.push(p.x);
  const px = (x) => M.s + (xs.length < 2 ? (L - M.s - M.d) / 2 : (xs.indexOf(x) / (xs.length - 1)) * (L - M.s - M.d));
  const py = (y) => M.su + (1 - (y - lo) / ampiezza) * (A - M.su - M.giu);
  s.append(svg(doc, 'path', { class: 'gc-asse', d: `M${M.s} ${py(0)}H${L - M.d}` }));
  serie.forEach((x, k) => {
    const punti = lista(x.punti);
    if (!punti.length) return;
    s.append(svg(doc, 'polyline', { class: `gc-serie ${classeSerie(k)}${k >= 3 ? ' gu-tratteggio' : ''}`, points: punti.map((p) => `${px(p.x).toFixed(1)},${py(p.y).toFixed(1)}`).join(' ') }));
    for (const p of punti) {
      const c = svg(doc, 'circle', { class: `gc-punto ${classeSerie(k)}`, cx: px(p.x).toFixed(1), cy: py(p.y).toFixed(1), r: 3 });
      const titolo = svg(doc, 'title');
      titolo.textContent = `${x.nome} · ${p.x}: ${conUnita(p.y, unita)}`;
      c.append(titolo);
      s.append(c);
    }
    const ultimo = punti[punti.length - 1];
    const etichetta = svg(doc, 'text', { class: 'gc-etic gu-etic--fine', x: (px(ultimo.x) + 6).toFixed(1), y: (py(ultimo.y) + 3).toFixed(1) });
    etichetta.textContent = conUnita(ultimo.y, unita);
    s.append(etichetta);
  });
  if (xs.length) {
    const primo = svg(doc, 'text', { class: 'gc-etic gu-etic--x', x: M.s, y: A - 4 });
    primo.textContent = String(xs[0]);
    s.append(primo);
    if (xs.length > 1) {
      const fine = svg(doc, 'text', { class: 'gc-etic gu-etic--x gu-etic--fine-x', x: L - M.d, y: A - 4 });
      fine.textContent = String(xs[xs.length - 1]);
      s.append(fine);
    }
  }
  return s;
}

const R = 30, CIRC = 2 * Math.PI * R;
function torta(doc, serie, unita) {
  const punti = lista(serie[0]?.punti);
  const valori = punti.map((p) => Math.max(0, Number(p.y) || 0));
  const totale = valori.reduce((a, b) => a + b, 0);
  const riga = el(doc, 'div', 'gu-torta');
  const s = svg(doc, 'svg', { class: 'gc-svg gc-svg--q', viewBox: '0 0 90 90', 'aria-hidden': 'true', focusable: 'false' });
  s.append(svg(doc, 'circle', { class: 'gc-torta-sfondo', cx: 45, cy: 45, r: R }));
  let fatto = 0;
  punti.forEach((p, k) => {
    if (!totale || !valori[k]) return;
    const lungo = (valori[k] / totale) * CIRC;
    // 2 di fondo fra una fetta e l'altra (regola dei segni: si vede dove finisce una e comincia l'altra)
    const fetta = svg(doc, 'circle', { class: `gc-torta ${classeSerie(k)}`, cx: 45, cy: 45, r: R, 'stroke-dasharray': `${Math.max(0, lungo - (punti.length > 1 ? 2 : 0)).toFixed(2)} ${CIRC.toFixed(2)}`, 'stroke-dashoffset': (-fatto).toFixed(2) });
    const titolo = svg(doc, 'title');
    titolo.textContent = `${p.x}: ${conUnita(p.y, unita)}`;
    fetta.append(titolo);
    s.append(fetta);
    fatto += lungo;
  });
  const quota = (k) => (totale ? `${numero(Math.round((valori[k] / totale) * 1000) / 10)}%` : '—');
  riga.append(s, legenda(doc, punti.map((p, k) => [k, `${p.x} · ${conUnita(p.y, unita)} · ${quota(k)}`])));
  return riga;
}

/**
 * @param {object} blocco l'albero del lettore (`tipo: 'grafico'`), anche parziale
 * @param {{ document: Document }} opzioni
 */
export function disegnaGrafico(blocco, { document: doc } = {}) {
  const serie = lista(blocco.serie).filter((s) => s && Array.isArray(s.punti));
  const radice = el(doc, 'div', `gu-grafico gu-grafico--${blocco.forma || 'barre'}`);
  const figura = el(doc, 'div', 'gu-figura');
  figura.setAttribute('role', 'img');
  if (blocco.descrizione) figura.setAttribute('aria-label', blocco.descrizione);
  if (blocco.forma === 'linee') figura.append(linee(doc, serie, blocco.unita));
  else if (blocco.forma === 'torta') figura.append(torta(doc, serie, blocco.unita));
  else figura.append(barre(doc, serie, blocco.unita));
  radice.append(figura);
  if (blocco.forma !== 'torta' && serie.length > 1) radice.append(legenda(doc, serie.map((s, k) => [k, s.nome ?? ''])));
  if (blocco.descrizione) {
    const nota = el(doc, 'p', 'gr__nota gu-descrizione', blocco.descrizione);
    nota.setAttribute('aria-hidden', 'true');
    radice.append(nota);
  }
  return radice;
}
