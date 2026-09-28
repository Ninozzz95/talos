/*
 * ⭐ Refactor dei grafi (decisioni owner 24 e 29, 26/09/2026) — il TEMPO del run, condiviso da vista Tempo e riproduzione.
 *
 * Tutto viene dalla STORIA PUBBLICA DEGLI STATI (`GET …/history`, scritta dal riduttore stesso, `workflowStateChanges`): la
 * riproduzione è FEDELE (decisione 29), non ricostruita dagli orari di inizio e fine delle righe come nel prototipo. Ogni
 * passo parte `pending` (`initialState`) e le voci si applicano in ordine di sequenza.
 *
 * L'asse comprime i tempi MORTI (Temporal UI `collapseIdleTime`; ricerca 10×4 del 25/09, §1): l'unione degli intervalli in
 * cui almeno un passo lavorava; un buco più lungo di VUOTO_MINIMO_MS diventa largo VUOTO_COMPRESSO_MS e porta la sua durata
 * vera in etichetta. La riproduzione corre sullo stesso asse: un'ora di pausa non costa un'ora di attesa a chi guarda.
 */
export const VUOTO_MINIMO_MS = 3 * 60_000;
export const VUOTO_COMPRESSO_MS = 90_000;
export const TERMINALI = new Set(['succeeded', 'failed', 'cancelled', 'skipped', 'superseded']);
export const ATTENZIONE = new Set(['failed', 'uncertain', 'reconciling']);
/* un TENTATIVO è il tratto in cui il passo lavora: dall'avvio dell'attività (`running`) finché non ne esce; `uncertain` e
   `reconciling` sono ancora quel tentativo (il suo esito si sta accertando), `leased` è l'istante prima dell'avvio */
const AL_LAVORO = new Set(['running', 'uncertain', 'reconciling']);

const ms = (iso) => Date.parse(iso);

/**
 * I tentativi di ogni passo, dalla storia: `Map nodeId → [{ da, a, esito }]`, `a` null se è ancora in corso, `esito` lo stato
 * in cui il passo esce dal tentativo (`succeeded`, `failed`, `retry_wait` = ritentato…).
 */
export function tentativiDallaStoria(voci) {
  const aperti = new Map();
  const tentativi = new Map();
  for (const voce of voci) {
    if (voce.scope !== 'node') continue;
    const lavora = AL_LAVORO.has(voce.state);
    const aperto = aperti.get(voce.nodeId);
    if (lavora && !aperto) {
      const t = { da: ms(voce.at), a: null, esito: null };
      aperti.set(voce.nodeId, t);
      if (!tentativi.has(voce.nodeId)) tentativi.set(voce.nodeId, []);
      tentativi.get(voce.nodeId).push(t);
    } else if (!lavora && aperto) {
      aperto.a = ms(voce.at);
      aperto.esito = voce.state;
      aperti.delete(voce.nodeId);
    }
  }
  return tentativi;
}

/** L'asse compresso, dai tentativi: da `inizio` ad `adesso` (istanti ISO o ms). */
export function asseDelTempo(tentativi, { inizio, adesso }) {
  const t0 = typeof inizio === 'number' ? inizio : ms(inizio);
  const t1 = Math.max(t0, typeof adesso === 'number' ? adesso : ms(adesso));
  const intervalli = [];
  for (const elenco of tentativi.values()) for (const t of elenco) intervalli.push([t.da, t.a ?? t1]);
  intervalli.sort((x, y) => x[0] - y[0]);
  const attivi = [];
  for (const [a, b] of intervalli) {
    const u = attivi.at(-1);
    if (u && a <= u[1]) u[1] = Math.max(u[1], b); else attivi.push([a, b]);
  }
  const segmenti = [];
  let cursore = t0, asse = 0;
  const aggiungi = (da, a) => {
    if (a <= da) return;
    const compresso = a - da > VUOTO_MINIMO_MS && !attivi.some(([x, y]) => x < a && y > da);
    const lunghezza = compresso ? VUOTO_COMPRESSO_MS : a - da;
    segmenti.push({ da, a, asseDa: asse, asseA: asse + lunghezza, compresso });
    asse += lunghezza;
  };
  for (const [a, b] of attivi) {
    if (a > cursore) aggiungi(cursore, a);
    aggiungi(Math.max(a, cursore), b);
    cursore = Math.max(cursore, b);
  }
  if (t1 > cursore) aggiungi(cursore, t1);
  const trova = (valore, chiaveA) => {
    let lo = 0, hi = segmenti.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (segmenti[mid][chiaveA] < valore) lo = mid + 1; else hi = mid; }
    return segmenti[Math.max(0, lo)];
  };
  return {
    t0, t1, segmenti, lunghezza: asse, vuoti: segmenti.filter((s) => s.compresso),
    /** da un istante vero alla posizione sull'asse compresso */
    versoAsse(t) {
      if (!segmenti.length || t <= t0) return 0;
      if (t >= t1) return asse;
      const s = trova(t, 'a');
      return s.asseDa + ((t - s.da) / Math.max(1, s.a - s.da)) * (s.asseA - s.asseDa);
    },
    /** dalla posizione sull'asse all'istante vero */
    dalAsse(u) {
      if (!segmenti.length || u <= 0) return t0;
      if (u >= asse) return t1;
      const s = trova(u, 'asseA');
      return s.da + ((u - s.asseDa) / Math.max(1, s.asseA - s.asseDa)) * (s.a - s.da);
    },
  };
}

/**
 * Chi riproduce: gli stati del run e di ogni passo a un istante, e i conteggi per fase, applicando le voci in ordine. Avanti
 * è incrementale (una riproduzione scorre in avanti a ogni fotogramma); indietro si riparte dall'inizio (un trascinamento
 * all'indietro: al più una passata sulla storia).
 * `fasi`: i gruppi della panoramica (`phaseId`, `total`), per i conteggi iniziali — tutti i passi partono `pending`.
 */
export function creaRiproduttore(voci, fasi) {
  const iniziali = () => new Map(fasi.map((g) => [g.phaseId, { pending: g.total }]));
  let stati, conteggi, run, cursore, istante;
  const azzera = () => { stati = new Map(); conteggi = iniziali(); run = null; cursore = 0; istante = -Infinity; };
  azzera();
  const faseDi = new Map();
  function applica(voce) {
    if (voce.scope === 'run') { run = voce.state; return; }
    const prima = stati.get(voce.nodeId) ?? 'pending';
    stati.set(voce.nodeId, voce.state);
    const fase = voce.phaseId ?? faseDi.get(voce.nodeId);
    if (voce.phaseId) faseDi.set(voce.nodeId, voce.phaseId);
    const c = conteggi.get(fase);
    if (!c) return;
    c[prima] = (c[prima] ?? 0) - 1;
    if (c[prima] <= 0) delete c[prima];
    c[voce.state] = (c[voce.state] ?? 0) + 1;
  }
  return {
    /** Porta la riproduzione all'istante `t` (ms): tutte le voci con ora ≤ t sono applicate. */
    al(t) {
      if (t < istante) azzera();
      while (cursore < voci.length && ms(voci[cursore].at) <= t) applica(voci[cursore++]);
      istante = t;
      return this;
    },
    statoDi: (nodeId) => stati.get(nodeId) ?? 'pending',
    statoDelRun: () => run,
    conteggi(phaseId) {
      const counts = { ...(conteggi.get(phaseId) ?? {}) };
      const total = fasi.find((g) => g.phaseId === phaseId)?.total ?? 0;
      let terminated = 0, attention = 0;
      for (const [s, n] of Object.entries(counts)) { if (TERMINALI.has(s)) terminated += n; if (ATTENZIONE.has(s)) attention += n; }
      return { counts, total, terminated, attention, progress: total ? terminated / total : null };
    },
    /** I passi in un certo insieme di stati, adesso (per il percorso: chi ha un problema). */
    passiIn(insieme) { return [...stati].filter(([, s]) => insieme.has(s)).map(([id]) => id); },
  };
}
