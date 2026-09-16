/*
 * BANCO — la scheda «Processi» PRIMA e DOPO, sullo stesso scenario. P0-E punto 9, 16/09/2026.
 *
 * ⛔ NON è un test: non finisce in `.test.mjs`, quindi `scripts/run-node-tests.mjs` (che filtra
 *   `file.endsWith('.test.mjs')`) non lo raccoglie. Si lancia a mano:
 *       node tests/unit/inspector-banco-processi.mjs
 *
 * ⛔ Il «PRIMA» è il codice VERO di `aggiornaInspector` al commit 4c58c961, copiato qui sotto riga
 *   per riga (`disegnaProcessiPrima`). Misurare il dopo contro una ricostruzione approssimativa del
 *   prima darebbe un numero che non smentisce niente.
 *
 * Scenario, uguale per i due: 1.000 processi finti, poi UN evento nuovo (un processo che arriva in
 * testa) — che è esattamente ciò che succede a ogni `ToolCallStart` in una sessione vera. Tre giri,
 * si riporta la MEDIANA.
 */

import { disegnaProcessi, datiProcesso, TETTO_PROCESSI } from '../../src/components/inspector.js';

/* ───────────────────────────── un DOM finto che CONTA, uguale per i due rami ─── */
function documentoFinto() {
  const conto = { creati: 0 };
  const crea = (tag) => {
    const attributi = new Map();
    conto.creati += 1;
    const nodo = {
      tag, tagName: String(tag).toUpperCase(), classi: new Set(), dataset: {}, figli: [], ascolti: [],
      padre: null, testoProprio: '', hidden: false, type: '', value: '', tabIndex: -1, id: '', contoReplace: 0,
      get children() { return nodo.figli.filter((f) => f && f.classi); },
      get className() { return [...nodo.classi].join(' '); },
      set className(v) { nodo.classi = new Set(String(v).split(/\s+/).filter(Boolean)); },
      classList: { add: (...c) => c.forEach((x) => nodo.classi.add(x)), remove: (...c) => c.forEach((x) => nodo.classi.delete(x)), toggle: () => {}, contains: (c) => nodo.classi.has(c) },
      get textContent() { return nodo.testoProprio !== '' ? nodo.testoProprio : nodo.figli.map((f) => f.textContent ?? '').join(''); },
      set textContent(v) { nodo.testoProprio = String(v); nodo.figli = []; },
      setAttribute: (k, v) => attributi.set(k, String(v)),
      getAttribute: (k) => (attributi.has(k) ? attributi.get(k) : null),
      removeAttribute: (k) => attributi.delete(k),
      append: (...x) => { for (const y of x) { if (y && typeof y === 'object') y.padre = nodo; nodo.figli.push(y); } },
      appendChild: (x) => { nodo.append(x); return x; },
      insertBefore: (nuovo, rif) => {
        if (nuovo.padre) nuovo.padre.figli = nuovo.padre.figli.filter((f) => f !== nuovo);
        nuovo.padre = nodo;
        const i = rif ? nodo.figli.indexOf(rif) : -1;
        if (i < 0) nodo.figli.push(nuovo); else nodo.figli.splice(i, 0, nuovo);
        return nuovo;
      },
      replaceChildren: (...x) => { nodo.contoReplace += 1; for (const f of nodo.figli) if (f && typeof f === 'object') f.padre = null; nodo.figli = []; nodo.append(...x); },
      remove: () => { if (nodo.padre) nodo.padre.figli = nodo.padre.figli.filter((f) => f !== nodo); nodo.padre = null; },
      get isConnected() { return nodo.padre !== null; },
      addEventListener: (t, m) => nodo.ascolti.push({ t, m }),
      removeEventListener: () => {},
      focus: () => {},
      querySelectorAll: (sel) => {
        const cerca = (n, fuori) => { for (const f of n.figli ?? []) { if (!f || !f.classi) continue; if (sel.startsWith('.') ? f.classi.has(sel.slice(1)) : f.tag === sel) fuori.push(f); cerca(f, fuori); } return fuori; };
        return cerca(nodo, []);
      },
      querySelector: (sel) => nodo.querySelectorAll(sel)[0] ?? null,
    };
    return nodo;
  };
  return {
    conto,
    createElement: crea,
    createElementNS: (_ns, tag) => crea(tag),
    createTextNode: (t) => { conto.creati += 1; return { testoProprio: String(t), figli: [], get textContent() { return this.testoProprio; } }; },
    createDocumentFragment: () => crea('#fragment'),
  };
}

const nodi = (n, c = 0) => { c += 1; for (const f of n.figli ?? []) if (f && typeof f === 'object') c = nodi(f, c); return c; };

/* ─────────────────────── il PRIMA: `aggiornaInspector` al commit 4c58c961 ─── */
const num = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 });
function el(d, tag, classe, testo) { const n = d.createElement(tag); if (classe) n.className = classe; if (testo != null) n.textContent = testo; return n; }
function datiProcessoPrima(p = {}) {
  const durata = Number.isFinite(p.durataMs) ? `${num.format(p.durataMs / 1000)} s` : null;
  const misura = [durata, p.stato !== 'in-corso' && Number.isFinite(p.uscita) ? `uscita ${p.uscita}` : null].filter(Boolean).join(' · ') || (p.stato === 'in-corso' ? '' : '—');
  const chi = `${p.chi === 'tu' ? 'tu' : 'agente'} · ${p.chi === 'tu' ? 'terminale' : `giro ${p.giro ?? '—'}`}`;
  const fermo = Number.isFinite(p.fermoDaMs) && p.fermoDaMs >= 60_000 ? `Nessuna uscita da ${Math.round(p.fermoDaMs / 1000)} secondi. Il processo è vivo: potrebbe aspettare un input. TALOS non lo ferma da solo.` : null;
  return { comando: p.comando || '—', stato: p.stato || 'ok', chi, misura, fermo };
}
function disegnaProcessiPrima(d, processi, lista) {
  processi.replaceChildren();
  if (!lista.length) {
    const vuoto = el(d, 'div', 'talos-card talos-inspector-card'); vuoto.dataset.c = 'EmptyState';
    const head = el(d, 'div', 'talos-inspector-card__head'); head.appendChild(el(d, 'b', '', 'Processi'));
    vuoto.append(head, el(d, 'p', 'talos-inspector__hint', 'Nessun comando eseguito in questa sessione.'));
    processi.appendChild(vuoto);
  }
  for (const p of lista) {
    const dp = datiProcessoPrima(p);
    const card = el(d, 'div', 'talos-card talos-process'); card.dataset.c = 'ProcessRow'; card.dataset.stato = dp.stato;
    card.appendChild(el(d, 'div', 'talos-process__cmd', dp.comando));
    const meta = el(d, 'div', 'talos-process__meta');
    if (dp.stato === 'in-corso') meta.appendChild(el(d, 'span', 'talos-badge talos-badge--accent talos-badge--sm', 'In corso'));
    else meta.appendChild(el(d, 'span', `talos-dot talos-dot--${dp.stato === 'errore' ? 'danger' : 'success'}`));
    meta.append(el(d, 'span', '', dp.chi), el(d, 'span', 'talos-grow'), el(d, 'span', 'talos-mono talos-measure', dp.misura));
    card.appendChild(meta);
    if (dp.fermo) card.appendChild(el(d, 'div', 'talos-process__stall', dp.fermo));
    processi.appendChild(d.createTextNode('\n'));
    processi.appendChild(card);
  }
}

/* ────────────────────────────────────────────────────────── lo scenario ─── */
const COMANDI = [
  'npm run verify:all --workspace=@talos/harness-ui', 'git status --short', 'node --test tests/unit/inspector.test.mjs',
  'docker compose up -d', 'pytest -q tests/', 'curl -sS https://registry.npmjs.org/shell-quote/latest',
  'grep -rn "talos-process" src/styles/index.css', 'cargo build --release', 'go test ./...', './gradlew assembleDebug',
];
const MILLE = Array.from({ length: 1_000 }, (_, i) => ({
  id: `p${i}`, comando: COMANDI[i % COMANDI.length], chi: 'agente', giro: 1 + (i % 9),
  stato: i % 7 === 0 ? 'fallito' : 'riuscito', durataMs: 100 + (i % 900), uscita: i % 7 === 0 ? 1 : 0, avviatoA: 1_700_000_000_000 + i * 1_000,
}));
const NUOVO = { id: 'nuovo', comando: 'git push --force-with-lease', chi: 'agente', giro: 10, stato: 'in-corso', avviatoA: 1_700_000_900_000 };

const mediana = (v) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];

function giro(quale) {
  const d = documentoFinto();
  const rail = d.createElement('div');
  const t0 = performance.now();
  if (quale === 'prima') disegnaProcessiPrima(d, rail, MILLE); else disegnaProcessi(d, rail, MILLE);
  const primaPassata = performance.now() - t0;
  const nodiDopoPrima = nodi(rail);
  const creatiPrima = d.conto.creati;

  const conUno = [NUOVO, ...MILLE];
  const t1 = performance.now();
  if (quale === 'prima') disegnaProcessiPrima(d, rail, conUno); else disegnaProcessi(d, rail, conUno);
  const evento = performance.now() - t1;
  return { primaPassata, evento, nodi: nodiDopoPrima, creatiPerEvento: d.conto.creati - creatiPrima };
}

const esiti = {};
for (const quale of ['prima', 'dopo']) {
  const giri = [giro(quale), giro(quale), giro(quale)];
  esiti[quale] = {
    nodiScheda: giri[0].nodi,
    msPrimaPassata: Number(mediana(giri.map((g) => g.primaPassata)).toFixed(2)),
    msPerUnEventoNuovo: Number(mediana(giri.map((g) => g.evento)).toFixed(2)),
    nodiCreatiPerUnEventoNuovo: mediana(giri.map((g) => g.creatiPerEvento)),
  };
}

console.log(JSON.stringify({
  scenario: '1.000 processi, poi UN evento nuovo in testa; tre giri, mediana',
  tetto: TETTO_PROCESSI,
  prima: esiti.prima,
  dopo: esiti.dopo,
  rapporti: {
    nodiScheda: Number((esiti.prima.nodiScheda / esiti.dopo.nodiScheda).toFixed(1)),
    msPerUnEventoNuovo: Number((esiti.prima.msPerUnEventoNuovo / Math.max(esiti.dopo.msPerUnEventoNuovo, 0.001)).toFixed(1)),
    nodiCreatiPerUnEventoNuovo: Number((esiti.prima.nodiCreatiPerUnEventoNuovo / Math.max(esiti.dopo.nodiCreatiPerUnEventoNuovo, 1)).toFixed(1)),
  },
  /* Un controllo di sanità: il «dopo» deve avere davvero le righe che dice. */
  righeMostrate: (() => { const d = documentoFinto(); const r = d.createElement('div'); return disegnaProcessi(d, r, MILLE).mostrati; })(),
  unaRigaPreparata: Object.keys(datiProcesso(MILLE[0])).length,
}, null, 2));
