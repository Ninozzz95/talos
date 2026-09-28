/*
 * ⭐ Refactor dei grafi (decisioni owner 24-31, 26/09/2026) — la TELA della vista Dipendenze, portata dal prototipo approvato
 *   (`prototypes/grafi-v2/tela.js`, commit ab51d6166) sui dati veri.
 *
 * Pan e zoom: `XYPanZoom` di `@xyflow/system` (MIT, il nucleo senza framework di React Flow e Svelte Flow; letto nel clone
 * 3d35b57 del 24/09: `onTransformChange` arriva a ogni trasformazione, anche animata). La rotella NON zooma a scatti continui:
 * passi del 10% attorno al puntatore, con la percentuale in testata (Argo Workflows PR #16273; decisione owner 31).
 * Scala: nel DOM solo ciò che si vede, con un margine (Airflow `onlyRenderVisibleElements`; Dagster); livello di dettaglio
 * sotto zoom 0,55 (card compatte) e sotto 0,3 i passi passano su una tela `canvas` come blocchi di colore (decisione 31).
 * Minimappa: `XYMinimap`. Stato: colore + icona + parola, mai il colore da solo (WCAG 1.4.1); in esecuzione il bordo RUOTA
 * (n8n `_canvasNodeStyles.scss:57-92`), calmo e mai fermo col movimento ridotto (regola di casa del 24/09).
 * Nel prodotto le celle di una griglia sono PIGRE: la loro riga arriva con la sua pagina (`fonte.js`); finché non c'è, la
 * cella è uno scheletro che lo dice («Carico…») e la tela chiede le pagine delle celle che si vedono.
 */
import { XYMinimap, XYPanZoom } from '@xyflow/system';

import { conteggiFase, iconaDellaFase, iconaDelPasso, ICONA_TONO, STATI_PASSO } from './comuni.js';

const SVG = 'http://www.w3.org/2000/svg';
export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 2;
export const LOD_COMPATTO = 0.55;
export const LOD_PUNTINI = 0.3;
const MARGINE_VISIBILE = 240;
const TROPPI_ARCHI = 400;
const FAMIGLIE = [
  ['conclusi', 'Conclusi', 'ok'], ['inCorso', 'In esecuzione', 'corso'], ['inAttesa', 'In attesa', 'attesa'], ['errori', 'Errori', 'errore'],
];
const tonoDi = (stato) => STATI_PASSO[stato]?.tono ?? 'neutro';
const parolaDi = (stato) => STATI_PASSO[stato]?.parola ?? 'Stato sconosciuto';
const conCifre = new Intl.NumberFormat('it-IT', { useGrouping: 'always' });

/** Passo di zoom a scatti del 10% (Argo): dal valore attuale al multiplo di 0,1 successivo, nel verso chiesto. */
export function prossimoZoom(k, verso) {
  const passo = 0.1;
  const n = verso > 0 ? Math.floor(k / passo + 1e-6) + 1 : Math.ceil(k / passo - 1e-6) - 1;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(n * passo * 10) / 10));
}

export function creaTela(host, opzioni) {
  const d = host.ownerDocument;
  const finestra = d.defaultView;
  const { icona, onSeleziona, onGruppo, onZoom, onDisegnati, onMancano } = opzioni;
  const el = (tag, classe, testo) => { const n = d.createElement(tag); if (classe) n.className = classe; if (testo != null) n.textContent = testo; return n; };
  const svg = (tag, attributi = {}) => { const n = d.createElementNS(SVG, tag); for (const [k, v] of Object.entries(attributi)) n.setAttribute(k, v); return n; };

  const tela = el('div', 'gv-tela');
  tela.tabIndex = 0;
  tela.setAttribute('role', 'group');
  tela.setAttribute('aria-roledescription', 'diagramma');
  tela.setAttribute('aria-label', 'Diagramma delle dipendenze. Frecce per spostarsi fra gli agenti, Invio per il dettaglio, più e meno per lo zoom, zero per adattare.');
  const mondo = el('div', 'gv-mondo');
  const fili = svg('svg', { class: 'gv-fili', 'aria-hidden': 'true' });
  const defs = svg('defs');
  for (const [id, classe] of [['gv-freccia', 'gv-freccia'], ['gv-freccia-fatto', 'gv-freccia gv-freccia--fatto'], ['gv-freccia-fronte', 'gv-freccia gv-freccia--fronte'], ['gv-freccia-focus', 'gv-freccia gv-freccia--focus']]) {
    const m = svg('marker', { id, viewBox: '0 0 8 8', refX: '7', refY: '4', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' });
    m.append(svg('path', { d: 'M0 0 L8 4 L0 8 z', class: classe }));
    defs.append(m);
  }
  fili.append(defs);
  const gFili = svg('g');
  fili.append(gFili);
  const strato = { blocchi: el('div', 'gv-blocchi'), nodi: el('div', 'gv-nodi') };
  const cartaSessione = el('div', 'gv-sessione');
  cartaSessione.dataset.coordinatore = 'true';
  mondo.append(fili, strato.blocchi, cartaSessione, strato.nodi);
  const lod = el('canvas', 'gv-lod');
  lod.setAttribute('aria-hidden', 'true');
  const etichette = el('div', 'gv-etichette');
  etichette.setAttribute('aria-hidden', 'true');
  const minimappa = el('div', 'gv-minimappa nowheel');
  minimappa.setAttribute('aria-hidden', 'true');
  const miniSvg = svg('svg', { class: 'gv-minimappa-svg' });
  const miniBlocchi = svg('g');
  const miniVista = svg('path', { class: 'gv-minimappa-fuori', 'fill-rule': 'evenodd' });
  const miniCornice = svg('rect', { class: 'gv-minimappa-vista' });
  miniSvg.append(miniBlocchi, miniVista, miniCornice);
  minimappa.append(miniSvg);
  const annuncio = el('p', 'gv-sr');
  annuncio.setAttribute('role', 'status');
  tela.append(mondo, lod, etichette, minimappa, annuncio);
  host.append(tela);

  let disp = null;
  let vista = { x: 0, y: 0, zoom: 1 };
  let dati = null;
  let evidenza = { percorso: false, focus: null, query: '', selezionato: null };
  const montati = new Map(); // chiave del passo (nodeId, o `cella:fase:i`) → elemento
  const pool = [];
  const blocchiVivi = new Map();
  const filiVivi = new Map();
  let conteggioArchi = 0;
  let richiesta = null;
  let animazione = null;
  let morta = false;

  /* ——— pan e zoom ——— */
  const pz = XYPanZoom({
    domNode: tela, minZoom: ZOOM_MIN, maxZoom: ZOOM_MAX,
    translateExtent: [[-Infinity, -Infinity], [Infinity, Infinity]], viewport: vista,
    onDraggingChange: (sta) => tela.classList.toggle('gv-tela--trascina', sta),
    onPanZoomStart: () => tela.classList.add('gv-tela--muove'),
    onPanZoomEnd: () => { tela.classList.remove('gv-tela--muove'); programma(); },
  });
  pz.update({
    noWheelClassName: 'nowheel', noPanClassName: 'nopan', preventScrolling: true, panOnScroll: false, panOnScrollSpeed: 0.5,
    panOnScrollMode: 'free', panOnDrag: true, zoomOnScroll: false, zoomOnPinch: false, zoomOnDoubleClick: false,
    panActivationKeyPressed: false, zoomActivationKeyPressed: false, userSelectionActive: false, lib: 'gv',
    connectionInProgress: false, paneClickDistance: 2, selectionOnDrag: false,
    onTransformChange: ([x, y, zoom]) => { vista = { x, y, zoom }; applica(); },
  });
  function applica() {
    mondo.style.transform = `translate(${vista.x}px, ${vista.y}px) scale(${vista.zoom})`;
    // la griglia di puntini dello sfondo segue pan e zoom (come il Background di React Flow)
    tela.style.setProperty('--gv-x', `${vista.x}px`);
    tela.style.setProperty('--gv-y', `${vista.y}px`);
    tela.style.setProperty('--gv-k', String(vista.zoom));
    const livello = vista.zoom < LOD_PUNTINI ? 'puntini' : vista.zoom < LOD_COMPATTO ? 'compatto' : 'pieno';
    if (tela.dataset.lod !== livello) tela.dataset.lod = livello;
    onZoom?.(vista.zoom);
    programma();
  }
  function programma() {
    if (richiesta || morta) return;
    richiesta = (finestra?.requestAnimationFrame ?? setTimeout)(() => { richiesta = null; if (!morta) { disegnaVisibili(); disegnaMinimappa(); } });
  }
  /* rotella: passi del 10% attorno al puntatore (anche il pizzico del trackpad, che arriva come rotella con ctrl) */
  let accumulo = 0;
  let ultimoScatto = 0;
  tela.addEventListener('wheel', (e) => {
    if (e.target.closest?.('.nowheel')) return;
    e.preventDefault(); e.stopImmediatePropagation();
    accumulo += e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    const adesso = finestra?.performance?.now?.() ?? Date.now();
    if (Math.abs(accumulo) < (e.ctrlKey ? 12 : 40) || adesso - ultimoScatto < 70) return;
    ultimoScatto = adesso;
    const verso = accumulo < 0 ? 1 : -1;
    accumulo = 0;
    const r = tela.getBoundingClientRect();
    zoomAttorno(prossimoZoom(vista.zoom, verso), e.clientX - r.left, e.clientY - r.top, 90);
  }, { capture: true, passive: false });
  function zoomAttorno(k, px, py, durata = 160) {
    const wx = (px - vista.x) / vista.zoom, wy = (py - vista.y) / vista.zoom;
    return pz.setViewport({ x: px - wx * k, y: py - wy * k, zoom: k }, { duration: movimentoRidotto() ? 0 : durata });
  }
  const movimentoRidotto = () => finestra?.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

  /* ——— disegno dei blocchi (colonne delle fasi) e della sessione principale ——— */
  function segmentata(counts, totale) {
    const barra = el('span', 'gv-segmenti');
    barra.setAttribute('role', 'img');
    const c = conteggiFase(counts);
    const parti = FAMIGLIE.map(([chiave, parola, tono]) => ({ n: c[chiave], parola, tono })).concat([{ n: c.annullati, parola: 'Annullati', tono: 'neutro' }]).filter((p) => p.n > 0);
    barra.setAttribute('aria-label', parti.map((p) => `${p.parola} ${conCifre.format(p.n)}`).join(', ') || 'nessun passo');
    for (const p of parti) {
      const s = el('span', 'gv-segmento');
      s.dataset.tono = p.tono;
      s.style.flexGrow = String(p.n);
      s.style.minWidth = '2px'; // Airflow `SegmentedStateBar.tsx`: minimo 2 px, anche per un solo passo su mille
      barra.append(s);
    }
    if (!totale) barra.append(el('span', 'gv-segmento gv-segmento--vuoto'));
    return barra;
  }
  const percento = (c) => (c?.progress === null || c?.progress === undefined ? '—' : `${Math.floor(c.progress * 100)}%`);
  function riempiTestaFase(testa, g, b) {
    testa.replaceChildren();
    const c = dati.conteggi(g.phaseId) ?? { counts: {}, terminated: 0, attention: 0, total: g.total, progress: null };
    const riga = el('div', 'gv-testa-riga');
    const ic = el('span', 'gv-testa-icona'); ic.append(icona(iconaDellaFase(g)));
    const nome = el('span', 'gv-testa-nome talos-wfg__fase-nome', `Fase ${g.order + 1} — ${g.label}`);
    nome.title = `Fase ${g.order + 1} — ${g.label}`; // il nome intero anche quando due righe non bastano
    const perc = el('span', 'gv-testa-perc', percento(c));
    const chiudi = el('button', 'gv-testa-chiudi nopan');
    chiudi.type = 'button';
    chiudi.setAttribute('aria-label', `Chiudi il gruppo ${g.label}`);
    chiudi.dataset.focusKey = `chiudi:${g.phaseId}`;
    chiudi.append(icona('i-chevron', 'gv-gira'));
    chiudi.addEventListener('click', (e) => { e.stopPropagation(); onGruppo?.(g.phaseId, false, b); });
    riga.append(ic, nome, perc, chiudi);
    const sotto = el('div', 'gv-testa-sotto');
    sotto.append(segmentata(c.counts, g.total), el('span', 'gv-testa-conto', `${conCifre.format(c.terminated)} di ${conCifre.format(g.total)} terminati${c.attention ? ` · ${c.attention} da guardare` : ''}`));
    testa.append(riga, sotto);
  }
  function riempiCartaGruppo(carta, g) {
    carta.replaceChildren();
    const c = dati.conteggi(g.phaseId) ?? { counts: {}, terminated: 0, attention: 0, total: g.total, progress: null };
    const conti = conteggiFase(c.counts);
    const ic = el('span', 'talos-wfg__gruppo-icona'); ic.append(icona(iconaDellaFase(g)));
    const nome = el('span', 'talos-wfg__gruppo-nome', `Fase ${g.order + 1} — ${g.label}`);
    const conto = el('span', 'talos-wfg__gruppo-conto', `${conCifre.format(g.total)} ${g.total === 1 ? 'agente' : 'agenti'}`);
    const barra = el('span', 'gv-gruppo-barra');
    barra.append(segmentata(c.counts, g.total), el('span', 'talos-wfg__barra-valore', percento(c)));
    const dl = el('dl', 'talos-wfg__conti');
    for (const [chiave, parola, tono] of FAMIGLIE) {
      const r = el('div', 'talos-wfg__conto');
      const dt = el('dt'); const punto = el('span', conti[chiave] > 0 ? 'talos-wfg__punto' : 'talos-wfg__punto talos-wfg__punto--vuoto'); punto.dataset.tono = conti[chiave] > 0 ? tono : 'neutro'; dt.append(punto, parola);
      r.append(dt, el('dd', null, conCifre.format(conti[chiave])));
      dl.append(r);
    }
    const apri = el('span', 'gv-gruppo-apri', 'Apri qui');
    carta.append(ic, nome, conto, barra, dl, apri);
    carta.setAttribute('aria-label', `Fase ${g.order + 1}, ${g.label}: ${conCifre.format(g.total)} agenti, ${c.progress === null || c.progress === undefined ? '' : `${Math.floor(c.progress * 100)}% terminati, `}premi Invio per aprire il gruppo qui`);
    carta.dataset.tono = c.attention > 0 ? 'errore' : conti.inCorso > 0 ? 'corso' : g.total > 0 && conti.conclusi === g.total ? 'ok' : 'attesa';
  }
  function disegnaBlocchi() {
    strato.blocchi.replaceChildren();
    blocchiVivi.clear();
    for (const b of disp.blocchi) {
      const g = dati.panoramica.groups.find((x) => x.phaseId === b.phaseId);
      if (b.tipo === 'gruppo') {
        const carta = el('button', 'talos-wfg__gruppo gv-gruppo nopan');
        carta.type = 'button';
        carta.dataset.blocco = b.id;
        carta.dataset.phaseId = b.phaseId;
        carta.dataset.focusKey = `gruppo:${b.phaseId}`;
        posiziona(carta, b.x, b.y, b.w, b.h);
        riempiCartaGruppo(carta, g);
        carta.addEventListener('click', () => onGruppo?.(b.phaseId, true, b));
        strato.blocchi.append(carta);
        blocchiVivi.set(b.id, { carta, g, b });
      } else {
        const corsia = el('section', 'gv-corsia');
        corsia.dataset.forma = b.tipo;
        corsia.dataset.blocco = b.id;
        corsia.dataset.phaseId = b.phaseId;
        corsia.setAttribute('aria-label', `Fase ${g.order + 1}: ${g.label}`);
        posiziona(corsia, b.x, b.y, b.w, b.h);
        const testa = el('header', 'gv-testa talos-wfg__fase');
        riempiTestaFase(testa, g, b);
        corsia.append(testa);
        strato.blocchi.append(corsia);
        blocchiVivi.set(b.id, { corsia, testa, g, b });
      }
    }
    const s = disp.sessione;
    posiziona(cartaSessione, s.x, s.y, s.w, s.h);
    riempiSessione();
  }
  function riempiSessione() {
    cartaSessione.replaceChildren();
    const sessione = dati.sessione();
    const ic = el('span', 'talos-wfg__coordinatore-icona'); ic.append(icona('i-coordina'));
    const corpo = el('span', 'talos-wfg__coordinatore-corpo');
    const riga = el('span', 'talos-wfg__coordinatore-riga');
    const st = dati.statoRun();
    const pill = el('span', 'talos-wfg__pill'); pill.dataset.tono = st.tono;
    if (ICONA_TONO[st.tono]) pill.append(icona(ICONA_TONO[st.tono], 'talos-wfg__pill-icona'));
    pill.append(el('span', null, st.parola));
    riga.append(pill);
    if (sessione.durata) riga.append(el('span', 'talos-wfg__passo-durata', sessione.durata));
    corpo.append(el('span', 'talos-wfg__coordinatore-nome', sessione.titolo));
    corpo.append(riga);
    if (sessione.sotto) corpo.append(el('span', 'talos-wfg__passo-modello', sessione.sotto));
    cartaSessione.append(ic, corpo);
    cartaSessione.setAttribute('aria-label', `Sessione principale: ${sessione.titolo}, coordina il workflow`);
  }
  function posiziona(n, x, y, w, h) {
    n.style.transform = `translate(${x}px, ${y}px)`;
    if (w != null) n.style.width = `${w}px`;
    if (h != null) n.style.height = `${h}px`;
  }

  /* ——— gli archi ——— */
  function percorsoSvg(punti) {
    // angoli arrotondati di 6 px: gli archi ortogonali leggono meglio (ELK dà i punti, la curva la mettiamo noi)
    if (punti.length < 2) return '';
    let dd = `M${punti[0][0]} ${punti[0][1]}`;
    for (let i = 1; i < punti.length - 1; i += 1) {
      const [x0, y0] = punti[i - 1], [x1, y1] = punti[i], [x2, y2] = punti[i + 1];
      const r = Math.min(6, Math.hypot(x1 - x0, y1 - y0) / 2, Math.hypot(x2 - x1, y2 - y1) / 2);
      const ax = x1 - Math.sign(x1 - x0) * r, ay = y1 - Math.sign(y1 - y0) * r;
      const bx = x1 + Math.sign(x2 - x1) * r, by = y1 + Math.sign(y2 - y1) * r;
      dd += ` L${ax} ${ay} Q${x1} ${y1} ${bx} ${by}`;
    }
    const ult = punti.at(-1);
    return `${dd} L${ult[0]} ${ult[1]}`;
  }
  function disegnaFili() {
    gFili.replaceChildren();
    filiVivi.clear();
    fili.setAttribute('width', String(disp.larghezza));
    fili.setAttribute('height', String(disp.altezza));
    fili.setAttribute('viewBox', `0 0 ${disp.larghezza} ${disp.altezza}`);
    // l'albero della sessione: giù dalla sessione, una sbarra orizzontale, una freccia su ogni colonna (struttura R4)
    const s = disp.sessione;
    const barra = s.y + s.h + 36;
    const centri = disp.blocchi.map((b) => b.x + b.w / 2);
    gFili.append(svg('path', { class: 'gv-albero', d: `M${s.x + s.w / 2} ${s.y + s.h} V${barra} M${Math.min(...centri, s.x + s.w / 2)} ${barra} H${Math.max(...centri, s.x + s.w / 2)}` }));
    for (const c of centri) gFili.append(svg('path', { class: 'gv-albero', d: `M${c} ${barra} V${disp.cima - 2}`, 'marker-end': 'url(#gv-freccia)' }));
    conteggioArchi = disp.archi.length;
    for (const a of disp.archi) {
      const p = svg('path', { class: `gv-arco gv-arco--${a.livello}`, d: percorsoSvg(a.punti), 'marker-end': 'url(#gv-freccia)' });
      p.dataset.id = a.id;
      filiVivi.set(a.id, { p, a, box: scatola(a.punti) });
      gFili.append(p);
      if (a.conto) {
        const [x1, y1] = a.punti[1], [, y2] = a.punti[2] ?? a.punti[1];
        const etichetta = svg('g', { class: 'gv-arco-conto', transform: `translate(${x1} ${(y1 + y2) / 2})` });
        const testo = svg('text', { 'text-anchor': 'middle', 'dominant-baseline': 'central' });
        testo.textContent = conCifre.format(a.conto);
        const w = 12 + 7 * testo.textContent.length;
        etichetta.append(svg('rect', { x: String(-w / 2), y: '-10', width: String(w), height: '20', rx: '10' }), testo);
        const titolo = svg('title'); titolo.textContent = `${conCifre.format(a.conto)} dipendenze fra le due fasi`;
        etichetta.append(titolo);
        gFili.append(etichetta);
      }
    }
  }
  const scatola = (punti) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of punti) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    return { x0, y0, x1, y1 };
  };

  /* ——— i passi: solo i visibili, con il livello di dettaglio ——— */
  function mondoVisibile() {
    const r = tela.getBoundingClientRect();
    const m = MARGINE_VISIBILE / vista.zoom;
    return { x0: -vista.x / vista.zoom - m, y0: -vista.y / vista.zoom - m, x1: (r.width - vista.x) / vista.zoom + m, y1: (r.height - vista.y) / vista.zoom + m, w: r.width, h: r.height };
  }
  const rigaDi = (chiave, pos) => (pos.forma === 'mini' ? dati.cella(pos.phaseId, pos.indice) : dati.riga(chiave));
  function cartaPasso() {
    const carta = pool.pop() ?? (() => {
      const b = el('button', 'gv-passo nopan'); b.type = 'button';
      b.addEventListener('click', () => { if (b.dataset.nodoId) onSeleziona?.(b.dataset.nodoId); });
      b.addEventListener('dblclick', (e) => e.stopPropagation());
      return b;
    })();
    return carta;
  }
  function riempiPasso(carta, riga, pos) {
    if (!riga) {
      // la sua pagina non è ancora arrivata: uno scheletro che lo dice, senza inventare nome né stato
      if (carta.dataset.firma === 'carica') return;
      carta.dataset.firma = 'carica';
      delete carta.dataset.nodoId; delete carta.dataset.focusKey;
      carta.dataset.tono = 'neutro'; carta.dataset.forma = pos.forma; carta.dataset.carica = 'true';
      delete carta.dataset.stato;
      carta.replaceChildren(el('span', 'gv-passo-scheletro'));
      carta.setAttribute('aria-label', 'Carico questo agente…');
      carta.disabled = true;
      return;
    }
    carta.disabled = false;
    delete carta.dataset.carica;
    carta.dataset.nodoId = riga.nodeId;
    carta.dataset.focusKey = `passo:${riga.nodeId}`;
    const stato = dati.statoDi(riga.nodeId) ?? riga.state;
    const tono = tonoDi(stato);
    const durata = dati.durataDi(riga.nodeId, stato);
    const firma = `${riga.nodeId}|${stato}|${pos.forma}|${durata}|${tela.dataset.lod}|${riga.label}`;
    carta.dataset.stato = stato;
    carta.dataset.tono = tono;
    carta.dataset.forma = pos.forma;
    if (carta.dataset.firma === firma) return;
    carta.dataset.firma = firma;
    carta.replaceChildren();
    const testa = el('span', 'gv-passo-testa');
    const punto = el('span', 'talos-wfg__punto'); punto.dataset.tono = tono;
    testa.append(punto, el('span', 'gv-passo-nome', riga.label), el('span', 'gv-passo-durata', durata ?? '—'));
    const pill = el('span', 'talos-wfg__pill gv-passo-pill'); pill.dataset.tono = tono;
    if (ICONA_TONO[tono]) pill.append(icona(ICONA_TONO[tono], 'talos-wfg__pill-icona'));
    pill.append(el('span', null, parolaDi(stato)));
    if (pos.forma === 'mini') carta.append(testa, pill);
    else {
      const ruolo = el('span', 'gv-passo-ruolo'); ruolo.append(icona(iconaDelPasso(riga)));
      const modello = dati.modelloDi(riga);
      carta.append(testa);
      if (modello) carta.append(el('span', 'gv-passo-modello', modello));
      carta.append(pill, ruolo);
    }
    carta.setAttribute('aria-label', `${riga.label}, ${parolaDi(stato)}${durata ? `, ${durata}` : ''}`);
  }
  function disegnaVisibili() {
    if (!disp || !dati) return;
    const v = mondoVisibile();
    const puntini = vista.zoom < LOD_PUNTINI;
    const visibili = new Set();
    const mancano = new Map(); // phaseId → [minimo, massimo] degli indici di cella senza riga
    for (const [chiave, pos] of disp.passi) {
      if (pos.x + pos.w < v.x0 || pos.x > v.x1 || pos.y + pos.h < v.y0 || pos.y > v.y1) continue;
      if (pos.forma === 'mini' && !dati.cella(pos.phaseId, pos.indice)) {
        const m = mancano.get(pos.phaseId) ?? [Infinity, -Infinity];
        mancano.set(pos.phaseId, [Math.min(m[0], pos.indice), Math.max(m[1], pos.indice)]);
      }
      if (!puntini) visibili.add(chiave);
    }
    for (const [chiave, carta] of montati) {
      if (visibili.has(chiave)) continue;
      carta.remove(); montati.delete(chiave);
      if (pool.length < 400) { delete carta.dataset.firma; pool.push(carta); }
    }
    for (const chiave of visibili) {
      let carta = montati.get(chiave);
      const pos = disp.passi.get(chiave);
      if (!carta) {
        carta = cartaPasso();
        posiziona(carta, pos.x, pos.y, pos.w, pos.h);
        montati.set(chiave, carta);
        strato.nodi.append(carta);
      }
      const riga = rigaDi(chiave, pos);
      riempiPasso(carta, riga, pos);
      segnaEvidenza(carta, riga?.nodeId ?? null);
    }
    // archi: tutti se sono pochi; altrimenti solo quelli con la scatola nella vista (Dagster, sopra i 50 archi)
    for (const { p, box } of filiVivi.values()) {
      const dentro = conteggioArchi <= TROPPI_ARCHI || !(box.x1 < v.x0 || box.x0 > v.x1 || box.y1 < v.y0 || box.y0 > v.y1);
      p.style.display = dentro ? '' : 'none';
    }
    disegnaPuntini(v, puntini);
    disegnaEtichette();
    for (const [phaseId, [da, a]] of mancano) onMancano?.(phaseId, da, a);
    onDisegnati?.({ nodi: montati.size, totale: disp.passi.size, puntini, archi: conteggioArchi });
  }
  /* sotto LOD_PUNTINI: rettangoli di colore su una tela in coordinate dello schermo */
  let tavolozza = null;
  function colori() {
    if (tavolozza) return tavolozza;
    const prova = el('span', 'gv-sonda');
    tela.append(prova);
    tavolozza = {};
    const stile = (n) => finestra.getComputedStyle(n).color;
    for (const tono of ['ok', 'corso', 'attesa', 'avviso', 'errore', 'neutro']) { prova.dataset.tono = tono; tavolozza[tono] = stile(prova); }
    prova.dataset.tono = 'accento'; tavolozza.accento = stile(prova);
    prova.remove();
    return tavolozza;
  }
  function disegnaPuntini(v, attivo) {
    const dpr = finestra?.devicePixelRatio ?? 1;
    lod.width = Math.round(v.w * dpr); lod.height = Math.round(v.h * dpr);
    lod.style.width = `${v.w}px`; lod.style.height = `${v.h}px`;
    const c = lod.getContext?.('2d');
    if (!c) return;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, v.w, v.h);
    if (!attivo) return;
    const col = colori();
    const k = vista.zoom;
    for (const [chiave, pos] of disp.passi) {
      if (pos.x + pos.w < v.x0 || pos.x > v.x1 || pos.y + pos.h < v.y0 || pos.y > v.y1) continue;
      const riga = rigaDi(chiave, pos);
      const stato = riga ? dati.statoDi(riga.nodeId) ?? riga.state : null;
      c.globalAlpha = !riga ? 0.35 : spentoDa(riga.nodeId) ? 0.18 : 1;
      c.fillStyle = col[tonoDi(stato)] ?? col.neutro;
      const x = pos.x * k + vista.x, y = pos.y * k + vista.y, w = Math.max(2, pos.w * k), h = Math.max(2, pos.h * k);
      c.beginPath();
      if (c.roundRect) c.roundRect(x, y, w, h, Math.min(4, h / 3)); else c.rect(x, y, w, h);
      c.fill();
      if (riga && evidenza.selezionato === riga.nodeId) { c.globalAlpha = 1; c.lineWidth = 2; c.strokeStyle = col.accento; c.stroke(); }
    }
    c.globalAlpha = 1;
  }
  /* sotto LOD_COMPATTO le testate delle fasi diventano illeggibili: il loro nome si ripete in coordinate dello schermo */
  function disegnaEtichette() {
    etichette.replaceChildren();
    if (vista.zoom >= LOD_COMPATTO) return;
    for (const b of disp.blocchi) {
      const x = b.x * vista.zoom + vista.x, y = b.y * vista.zoom + vista.y;
      const g = dati.panoramica.groups.find((q) => q.phaseId === b.phaseId);
      const t = el('span', 'gv-etichetta', `${g.label} · ${percento(dati.conteggi(b.phaseId))}`);
      t.title = t.textContent;
      // ⛔ foto del 26/09 a 29%: le etichette dei gruppi chiusi si sovrapponevano; ognuna sta nella larghezza della sua colonna
      t.style.maxWidth = `${Math.max(40, (b.w + 60) * vista.zoom)}px`;
      t.style.transform = `translate(${Math.max(8, x)}px, ${Math.max(8, y - 24)}px)`;
      etichette.append(t);
    }
  }

  /* ——— percorso, focus e ricerca ——— */
  function spentoDa(id) {
    const e = evidenza;
    if (!id) return false;
    if (e.focus && !e.focus.insieme.has(id)) return true;
    if (e.query && !dati.corrisponde(id, e.query)) return true;
    if (e.percorso) {
      const s = dati.statoDi(id);
      return !['succeeded', 'running', 'leased', 'waiting_human', 'retry_wait', 'failed', 'uncertain'].includes(s) && !dati.bloccatoDaProblema(id);
    }
    return false;
  }
  function segnaEvidenza(carta, id) {
    carta.dataset.spento = String(spentoDa(id));
    carta.setAttribute('aria-pressed', String(Boolean(id) && evidenza.selezionato === id));
    if (id && evidenza.percorso && dati.bloccatoDaProblema(id)) carta.dataset.bloccato = 'true'; else delete carta.dataset.bloccato;
    if (id && evidenza.focus?.nodeId === id) carta.dataset.fuoco = 'true'; else delete carta.dataset.fuoco;
  }
  function classificaArchi() {
    for (const { p, a } of filiVivi.values()) {
      let tipo = 'normale';
      if (a.livello === 'passo') {
        const sa = dati.statoDi(a.da), sb = dati.statoDi(a.a);
        if (sa === 'succeeded' && sb === 'succeeded') tipo = 'fatto';
        else if (sa === 'succeeded' && ['running', 'leased', 'waiting_human', 'retry_wait'].includes(sb)) tipo = 'fronte';
        else if (['failed', 'uncertain', 'waiting_human'].includes(sa) || (evidenza.percorso && dati.bloccatoDaProblema(a.a) && (dati.bloccatoDaProblema(a.da) || ['failed', 'uncertain', 'waiting_human'].includes(sa)))) tipo = 'bloccato';
        else if (!['succeeded', 'running', 'leased'].includes(sb)) tipo = 'futuro';
      }
      const inFocus = evidenza.focus && evidenza.focus.insieme.has(a.da) && evidenza.focus.insieme.has(a.a);
      p.dataset.tipo = tipo;
      p.dataset.spento = String(Boolean((evidenza.focus && !inFocus) || (evidenza.percorso && !['fatto', 'fronte', 'bloccato'].includes(tipo)) || (evidenza.query && a.livello === 'passo' && !(dati.corrisponde(a.da, evidenza.query) && dati.corrisponde(a.a, evidenza.query)))));
      p.setAttribute('marker-end', `url(#${inFocus ? 'gv-freccia-focus' : tipo === 'fatto' ? 'gv-freccia-fatto' : tipo === 'fronte' ? 'gv-freccia-fronte' : 'gv-freccia'})`);
      if (inFocus) p.dataset.focus = 'true'; else delete p.dataset.focus;
    }
  }

  /* ——— minimappa ——— */
  let mini = null;
  function disegnaMinimappa() {
    if (!disp) return;
    const r = tela.getBoundingClientRect();
    const W = disp.larghezza, H = disp.altezza;
    // si vede quando serve: il grafo non entra nella vista, e non è una scena piccola (a 14 passi basta «Adatta»)
    const entra = (W * vista.zoom <= r.width + 1 && H * vista.zoom <= r.height + 1 && vista.x >= -1 && vista.y >= -1) || disp.passi.size + disp.blocchi.length <= 25;
    minimappa.hidden = entra;
    if (entra || !r.width) return;
    const mw = 156, mh = Math.max(56, Math.min(104, (H / W) * mw));
    minimappa.style.width = `${mw}px`; minimappa.style.height = `${mh}px`;
    const pad = Math.max(W, H) * 0.04;
    miniSvg.setAttribute('viewBox', `${-pad} ${-pad} ${W + pad * 2} ${H + pad * 2}`);
    miniSvg.setAttribute('width', String(mw)); miniSvg.setAttribute('height', String(mh));
    if (miniBlocchi.dataset.firma !== `${W}x${H}:${disp.blocchi.length}`) {
      miniBlocchi.dataset.firma = `${W}x${H}:${disp.blocchi.length}`;
      miniBlocchi.replaceChildren();
      for (const b of disp.blocchi) {
        const rect = svg('rect', { x: b.x, y: b.y, width: b.w, height: b.h, rx: Math.max(W, H) * 0.004, class: 'gv-mini-blocco' });
        rect.dataset.blocco = b.id;
        miniBlocchi.append(rect);
      }
      miniBlocchi.append(svg('rect', { x: disp.sessione.x, y: disp.sessione.y, width: disp.sessione.w, height: disp.sessione.h, class: 'gv-mini-sessione' }));
    }
    for (const rect of miniBlocchi.querySelectorAll('.gv-mini-blocco')) {
      const b = disp.blocchi.find((q) => q.id === rect.dataset.blocco);
      const c = b && dati.conteggi(b.phaseId);
      rect.dataset.tono = !c ? 'neutro' : c.attention ? 'errore' : conteggiFase(c.counts).inCorso ? 'corso' : c.terminated === c.total ? 'ok' : 'attesa';
    }
    const vx = -vista.x / vista.zoom, vy = -vista.y / vista.zoom, vw = r.width / vista.zoom, vh = r.height / vista.zoom;
    const e = Math.max(W, H) * 4;
    miniVista.setAttribute('d', `M${-e} ${-e} h${e * 3} v${e * 3} h${-e * 3} z M${vx} ${vy} h${vw} v${vh} h${-vw} z`);
    miniCornice.setAttribute('x', String(vx)); miniCornice.setAttribute('y', String(vy));
    miniCornice.setAttribute('width', String(Math.max(1, vw))); miniCornice.setAttribute('height', String(Math.max(1, vh)));
    if (!mini) mini = XYMinimap({ domNode: miniSvg, panZoom: pz, getTransform: () => [vista.x, vista.y, vista.zoom], getViewScale: () => (W + pad * 2) / mw });
    mini.update({ translateExtent: [[-Infinity, -Infinity], [Infinity, Infinity]], width: r.width, height: r.height, pannable: true, zoomable: true, zoomStep: 1, inversePan: false });
  }

  /* ——— tastiera: frecce fra gli agenti (vicino nella direzione), Invio dettaglio, +/−/0 ——— */
  tela.addEventListener('keydown', (e) => {
    if (e.target !== tela && !e.target.classList?.contains('gv-passo')) return;
    const r = tela.getBoundingClientRect();
    if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomAttorno(prossimoZoom(vista.zoom, 1), r.width / 2, r.height / 2); return; }
    if (e.key === '-') { e.preventDefault(); zoomAttorno(prossimoZoom(vista.zoom, -1), r.width / 2, r.height / 2); return; }
    if (e.key === '0') { e.preventDefault(); api.adatta(); return; }
    const direzioni = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] };
    if (direzioni[e.key]) {
      e.preventDefault();
      const [dx, dy] = direzioni[e.key];
      const da = disp.passi.get(dati.chiaveDi(evidenza.selezionato));
      let migliore = null, punteggio = Infinity;
      const cx = da ? da.x + da.w / 2 : (-vista.x + r.width / 2) / vista.zoom, cy = da ? da.y + da.h / 2 : (-vista.y + r.height / 2) / vista.zoom;
      for (const [chiave, p] of disp.passi) {
        const riga = rigaDi(chiave, p);
        if (!riga || riga.nodeId === evidenza.selezionato) continue;
        const px = p.x + p.w / 2 - cx, py = p.y + p.h / 2 - cy;
        const avanti = px * dx + py * dy;
        if (da && avanti <= 1) continue;
        const laterale = Math.abs(px * dy) + Math.abs(py * dx);
        const s = Math.abs(avanti) + laterale * 2.2;
        if (s < punteggio) { punteggio = s; migliore = riga.nodeId; }
      }
      if (migliore) { onSeleziona?.(migliore); api.vaiA(migliore, { soloSeFuori: true }); }
      return;
    }
    if (e.key === 'Enter' && evidenza.selezionato) { e.preventDefault(); onSeleziona?.(evidenza.selezionato, { apri: true }); }
  });

  /* ——— l'API ——— */
  const api = {
    elemento: tela,
    get zoom() { return vista.zoom; },
    /** La vista corrente, in copia: chi la legge sa se nel frattempo qualcuno ha mosso la tela. */
    get vista() { return { ...vista }; },
    get disposizione() { return disp; },
    impostaDati(nuovi) { dati = nuovi; tavolozza = null; },
    /** Una disposizione nuova. Con `da` (il blocco da cui nasce l'apertura) le card crescono da lì (FLIP; niente col movimento ridotto). */
    imposta(nuova, { da = null } = {}) {
      const vecchi = new Map([...blocchiVivi.values()].map((v) => [v.b.phaseId, v.b]));
      disp = nuova;
      for (const carta of montati.values()) { carta.remove(); delete carta.dataset.firma; pool.push(carta); }
      montati.clear();
      disegnaBlocchi();
      disegnaFili();
      classificaArchi();
      miniBlocchi.dataset.firma = '';
      disegnaVisibili();
      disegnaMinimappa();
      if (movimentoRidotto() || !vecchi.size) return;
      // FLIP: ogni colonna parte da dov'era; le card di un gruppo appena aperto nascono dalla sua carta
      clearTimeout(animazione);
      tela.classList.add('gv-tela--anima');
      for (const [, v] of blocchiVivi) {
        const prima = vecchi.get(v.b.phaseId);
        const n = v.carta ?? v.corsia;
        if (!prima) continue;
        n.style.transition = 'none';
        n.style.transform = `translate(${prima.x}px, ${prima.y}px)`;
      }
      for (const [chiave, carta] of montati) {
        const pos = disp.passi.get(chiave);
        const origine = da && pos.phaseId === da.phaseId ? da : null;
        if (!origine) continue;
        carta.style.transition = 'none';
        carta.style.opacity = '0';
        carta.style.transform = `translate(${origine.x + 6}px, ${origine.y + 30}px) scale(.9)`;
      }
      mondo.getBoundingClientRect();
      for (const [, v] of blocchiVivi) { const n = v.carta ?? v.corsia; n.style.transition = ''; n.style.transform = `translate(${v.b.x}px, ${v.b.y}px)`; }
      for (const [chiave, carta] of montati) { const pos = disp.passi.get(chiave); carta.style.transition = ''; carta.style.opacity = ''; carta.style.transform = `translate(${pos.x}px, ${pos.y}px)`; }
      animazione = setTimeout(() => tela.classList.remove('gv-tela--anima'), 420);
    },
    /** Gli stati sono cambiati (vivo o riproduzione): si rinfrescano i visibili, gli archi, le testate e la minimappa. */
    aggiorna() {
      if (!disp || !dati) return;
      for (const [, v] of blocchiVivi) { if (v.carta) riempiCartaGruppo(v.carta, v.g); else riempiTestaFase(v.testa, v.g, v.b); }
      riempiSessione();
      classificaArchi();
      disegnaVisibili();
      miniBlocchi.dataset.firma += '·';
      disegnaMinimappa();
    },
    impostaEvidenza(nuova) { evidenza = { ...evidenza, ...nuova }; if (!disp || !dati) return; classificaArchi(); disegnaVisibili(); },
    adatta({ anima = true } = {}) {
      if (!disp) return undefined;
      const r = tela.getBoundingClientRect();
      const k = Math.min(1, Math.max(ZOOM_MIN, Math.min((r.width - 48) / disp.larghezza, (r.height - 48) / disp.altezza)));
      return pz.setViewport({ x: (r.width - disp.larghezza * k) / 2, y: Math.max(16, (r.height - disp.altezza * k) / 2), zoom: k }, { duration: anima && !movimentoRidotto() ? 220 : 0 });
    },
    /** Tutta la larghezza nella vista, con la cima in alto; `false` (e niente si muove) se lo zoom scenderebbe sotto `minimo`. */
    adattaInLarghezza({ minimo = LOD_COMPATTO } = {}) {
      if (!disp) return false;
      const r = tela.getBoundingClientRect();
      const k = Math.min(1, (r.width - 48) / disp.larghezza);
      if (k < minimo) return false;
      pz.setViewport({ x: (r.width - disp.larghezza * k) / 2, y: 16, zoom: k }, { duration: 0 });
      return true;
    },
    zoomA(k) { const r = tela.getBoundingClientRect(); return zoomAttorno(k, r.width / 2, r.height / 2); },
    passo(verso) { const r = tela.getBoundingClientRect(); return zoomAttorno(prossimoZoom(vista.zoom, verso), r.width / 2, r.height / 2); },
    /** Porta un passo (o un blocco) nella vista; con `soloSeFuori` non si muove se lo si vede già. */
    vaiA(id, { soloSeFuori = false, zoom = null, durata = 260 } = {}) {
      const p = disp?.passi.get(dati?.chiaveDi(id) ?? id) ?? disp?.blocchi.find((b) => b.id === id || b.phaseId === id);
      if (!p) return;
      const r = tela.getBoundingClientRect();
      const k = zoom ?? Math.max(vista.zoom, 0.8);
      const sx = p.x * vista.zoom + vista.x, sy = p.y * vista.zoom + vista.y;
      if (soloSeFuori && sx > 24 && sy > 24 && sx + p.w * vista.zoom < r.width - 24 && sy + p.h * vista.zoom < r.height - 24) return;
      pz.setViewport({ x: r.width / 2 - (p.x + p.w / 2) * k, y: r.height / 2 - (p.y + Math.min(p.h, 200) / 2) * k, zoom: k }, { duration: movimentoRidotto() ? 0 : durata });
      annuncio.textContent = dati?.riga(id)?.label ?? '';
    },
    /** Un blocco in alto a sinistra (o al centro, se è più stretto della vista), a uno zoom leggibile. */
    mostraInAlto(id, k = 0.8) {
      const b = disp?.blocchi.find((q) => q.id === id || q.phaseId === id);
      if (!b) return undefined;
      const r = tela.getBoundingClientRect();
      // ⛔ foto del 26/09 (scene 200 e 5.000 nel prodotto): se il blocco non entra, a sinistra resta il suo CORRIDOIO — lì sta
      //   il contatore dell'arco fuso in entrata, che col blocco a filo del bordo usciva tagliato (a 5.000 si leggeva «0»)
      const x = b.w * k < r.width - 48 ? (r.width - b.w * k) / 2 - b.x * k : 24 + 64 * k - b.x * k;
      return pz.setViewport({ x, y: 24 - (b.y - 56) * k, zoom: k }, { duration: 0 });
    },
    ridisegna() { disegnaVisibili(); disegnaMinimappa(); },
    distruggi() { morta = true; clearTimeout(animazione); pz.destroy(); mini?.destroy(); osservatore?.disconnect?.(); tela.remove(); },
  };
  const Osservatore = finestra?.ResizeObserver;
  const osservatore = Osservatore ? new Osservatore(() => programma()) : null;
  osservatore?.observe(tela);
  return api;
}
