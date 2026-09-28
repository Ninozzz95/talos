/*
 * ⭐ Refactor dei grafi (decisioni owner 24-31, 26/09/2026) — la SORGENTE DATI del diagramma: tutto ciò che la tela, la vista
 *   Tempo, la riproduzione e il dettaglio leggono, dalle rotte VERE (`workflow-graph-client.js`), caricato solo quando serve.
 *
 *   · panoramica e revisione: sempre (poche centinaia di byte, ETag);
 *   · righe: per PAGINA di fase (50, come il server), chieste per indice — una griglia di 1.120 passi carica solo le pagine
 *     delle celle che si vedono (Airflow `onlyRenderVisibleElements`, ricerca 10×4 del 25/09 §4);
 *   · archi: solo quelli delle fasi aperte come sottografo (decisione 30);
 *   · storia degli stati: tutta, a pagine di 1.000, poi solo la coda nuova a ogni rilettura (decisione 29: la riproduzione
 *     è fedele; ed è anche l'unica sorgente degli stati di OGNI passo, righe caricate o no);
 *   · discendenze: una lettura per passo e verso, tenuta (è strutturale: non cambia con gli stati).
 *   Il prototipo aveva tutto in memoria (una scena costruita nel worker); qui ogni cosa ha la sua rotta e il suo momento.
 */
import { spostaConteggi } from './comuni.js';
import { asseDelTempo, creaRiproduttore, tentativiDallaStoria } from './tempo-modello.js';

export const PAGINA = 50;
const CONCORRENZA = 4;

export function creaFonte({ client, sorgente, onCambio = () => {} }) {
  const f = {
    sorgente, panoramica: null, meta: null, revisione: null, graphVersion: null,
    righe: new Map(), // nodeId → riga (la più ricca che si è letta: con modello e compito se la pagina li porta)
    posto: new Map(), // nodeId → { phaseId, indice }
    celle: new Map(), // phaseId → Array(total) di nodeId
    pagine: new Map(), // `${phaseId}:${n}` → Promise
    archi: { chiave: null, items: [], promessa: null },
    storia: { items: [], inCorso: null, versione: 0 },
    discendenze: new Map(),
  };
  let coda = [];
  let inVolo = 0;
  let cache = { versione: -1 };

  function azzeraStruttura() {
    f.righe.clear(); f.posto.clear(); f.celle.clear(); f.pagine.clear();
    f.archi = { chiave: null, items: [], promessa: null };
    f.discendenze.clear();
  }

  /** Panoramica (sempre) e revisione (una volta): se la struttura del grafo è cambiata, righe e archi si rileggono. */
  async function panoramica() {
    const [{ data, meta }, revisione] = await Promise.all([client.panoramica(f.sorgente), f.revisione ? f.revisione : client.revisione(f.sorgente)]);
    /* ⛔ 26/09/2026, prova nel browser (WF-UI-LIVE-HEADER): una rilettura partita PRIMA di un fotogramma e arrivata DOPO
       riportava indietro i conteggi che il fotogramma aveva appena spostato (la testata tornava al 40% con la card già
       «Concluso»), fino alla rilettura successiva. Una panoramica più vecchia di ciò che è già stato applicato non vince. */
    const vecchia = f.panoramica && data.graphVersion === f.panoramica.graphVersion
      && Number.isSafeInteger(data.lastSeq) && Number.isSafeInteger(f.panoramica.lastSeq) && data.lastSeq < f.panoramica.lastSeq;
    if (vecchia) { f.revisione = revisione; return f.panoramica; }
    if (f.graphVersion !== null && data.graphVersion !== f.graphVersion) azzeraStruttura();
    f.graphVersion = data.graphVersion ?? null;
    f.panoramica = data; f.meta = meta; f.revisione = revisione;
    for (const g of data.groups) {
      const celle = f.celle.get(g.phaseId);
      if (!celle || celle.length !== g.total) f.celle.set(g.phaseId, Array.from({ length: g.total }));
    }
    return data;
  }

  function registra(phaseId, pagina) {
    const celle = f.celle.get(phaseId);
    pagina.items.forEach((riga, i) => {
      const indice = (pagina.offset ?? 0) + i;
      const prima = f.righe.get(riga.nodeId);
      // il modello scelto e il compito arrivano solo con le pagine «arricchite»: una pagina povera non li cancella
      f.righe.set(riga.nodeId, { ...prima, ...riga, model: riga.model ?? prima?.model, taskPreview: riga.taskPreview ?? prima?.taskPreview });
      f.posto.set(riga.nodeId, { phaseId, indice });
      if (celle && indice < celle.length) celle[indice] = riga.nodeId;
    });
  }
  /** La pagina `n` di una fase (50 righe). `arricchisci`: anche modello scelto e anteprima del compito (una lettura in più). */
  function pagina(phaseId, n, { arricchisci = false } = {}) {
    const chiave = `${phaseId}:${n}${arricchisci ? '+' : ''}`;
    if (!f.pagine.has(chiave)) {
      const promessa = client.gruppo(f.sorgente, phaseId, { offset: n * PAGINA, limit: PAGINA, arricchisci })
        .then((p) => { registra(phaseId, p); return p; }, (errore) => { f.pagine.delete(chiave); throw errore; });
      f.pagine.set(chiave, promessa);
    }
    return f.pagine.get(chiave);
  }
  /** Le righe di una fase aperta come sottografo (al più SOGLIA_GRIGLIA: una pagina), con modello e compito. */
  async function righeFase(phaseId) {
    await pagina(phaseId, 0, { arricchisci: true });
    return (f.celle.get(phaseId) ?? []).filter(Boolean).map((id) => f.righe.get(id));
  }
  /** Le celle da `da` ad `a` di una griglia: le pagine che mancano si chiedono, al più CONCORRENZA alla volta. */
  function chiedi(phaseId, da, a) {
    const celle = f.celle.get(phaseId);
    if (!celle) return;
    for (let n = Math.floor(Math.max(0, da) / PAGINA); n <= Math.floor(Math.min(celle.length - 1, a) / PAGINA); n += 1) {
      if (f.pagine.has(`${phaseId}:${n}`) || f.pagine.has(`${phaseId}:${n}+`) || coda.some((x) => x.phaseId === phaseId && x.n === n)) continue;
      coda.push({ phaseId, n });
    }
    svuota();
  }
  function svuota() {
    while (inVolo < CONCORRENZA && coda.length) {
      const { phaseId, n } = coda.shift();
      inVolo += 1;
      pagina(phaseId, n).then(() => onCambio('righe'), () => {}).finally(() => { inVolo -= 1; svuota(); });
    }
  }
  /** Dimentica le richieste di celle non ancora partite (un gruppo si è chiuso, la vista si è spostata). */
  const dimentica = () => { coda = []; };

  async function archiPer(fasi) {
    const chiave = [...fasi].sort().join('\u0000');
    if (f.archi.chiave === chiave && f.archi.promessa) return f.archi.promessa;
    const promessa = client.archi(f.sorgente, fasi).then((items) => { if (f.archi.chiave === chiave) f.archi.items = items; return items; });
    f.archi = { chiave, items: [], promessa };
    return promessa;
  }

  /** La storia degli stati: la prima volta tutta, poi solo la coda nuova. Solo un run ne ha una. */
  async function aggiornaStoria() {
    if (f.sorgente.tipo !== 'run') return false;
    if (f.storia.inCorso) return f.storia.inCorso;
    f.storia.inCorso = (async () => {
      try {
        const nuova = await client.storia(f.sorgente, { offset: f.storia.items.length });
        if (!nuova.items.length) return false;
        f.storia.items.push(...nuova.items);
        f.storia.versione += 1;
        return true;
      } finally { f.storia.inCorso = null; }
    })();
    return f.storia.inCorso;
  }
  /* ciò che si ricava dalla storia, rifatto solo quando la storia cresce */
  function derivati() {
    if (cache.versione === f.storia.versione && cache.gruppi === f.panoramica?.groups) return cache;
    const items = f.storia.items;
    const ultimo = new Map();
    const faseDi = new Map();
    for (const v of items) if (v.scope === 'node') { ultimo.set(v.nodeId, v.state); if (v.phaseId) faseDi.set(v.nodeId, v.phaseId); }
    const gruppi = f.panoramica?.groups ?? [];
    const tentativi = tentativiDallaStoria(items);
    // la campata di ogni fase (vista Tempo): dal primo inizio all'ultima fine dei suoi tentativi; `a` null se qualcuno lavora
    const campate = new Map();
    for (const [nodeId, elenco] of tentativi) {
      const fase = faseDi.get(nodeId);
      if (!fase) continue;
      const c = campate.get(fase) ?? { da: Infinity, a: -Infinity, aperta: false };
      for (const t of elenco) { c.da = Math.min(c.da, t.da); if (t.a === null) c.aperta = true; else c.a = Math.max(c.a, t.a); }
      campate.set(fase, c);
    }
    for (const c of campate.values()) if (c.aperta) c.a = null;
    cache = { versione: f.storia.versione, gruppi, ultimo, tentativi, campate, rip: creaRiproduttore(items, gruppi) };
    return cache;
  }
  const inizioDelRun = () => f.storia.items[0]?.at ?? f.sorgente.createdAt ?? null;

  /** Lo stato di un passo: dal vivo (`t` null) la riga se c'è, poi la storia; in riproduzione solo la storia. */
  function statoDi(nodeId, t = null) {
    if (!nodeId) return null;
    if (t === null) return f.righe.get(nodeId)?.state ?? derivati().ultimo.get(nodeId) ?? (f.storia.items.length ? 'pending' : null);
    return derivati().rip.al(t).statoDi(nodeId);
  }
  function conteggi(phaseId, t = null) {
    if (t === null) {
      const g = f.panoramica?.groups.find((x) => x.phaseId === phaseId);
      return g ? { counts: g.counts ?? {}, total: g.total, terminated: g.terminated ?? 0, attention: g.attention ?? 0, progress: g.progress ?? null } : null;
    }
    return derivati().rip.al(t).conteggi(phaseId);
  }
  const statoDelRunAl = (t) => derivati().rip.al(t).statoDelRun();
  const passiAl = (t, insieme) => (t === null ? [...derivati().ultimo].filter(([, s]) => insieme.has(s)).map(([id]) => id) : derivati().rip.al(t).passiIn(insieme));

  /** I passi a monte o a valle di uno (una lettura per passo e verso, tenuta). */
  function discendenza(nodeId, verso) {
    const chiave = `${nodeId}|${verso}`;
    if (!f.discendenze.has(chiave)) {
      f.discendenze.set(chiave, client.discendenza(f.sorgente, nodeId, verso).then((ids) => new Set(ids), (errore) => { f.discendenze.delete(chiave); throw errore; }));
    }
    return f.discendenze.get(chiave);
  }

  /**
   * Un fotogramma `run-update` (F3-51d): le righe toccate cambiano in loco, e i conteggi della loro fase si spostano con loro
   * (`spostaConteggi`, F3-52). Ritorna gli id toccati. La storia la porta la rilettura (al più una al secondo).
   */
  function applicaFotogramma(fotogramma) {
    const toccati = [];
    const cambi = [];
    for (const nuova of fotogramma.nodes ?? []) {
      const prima = f.righe.get(nuova.nodeId);
      cambi.push({ phaseId: nuova.phaseId ?? prima?.phaseId, da: prima?.state ?? derivati().ultimo.get(nuova.nodeId), a: nuova.state });
      if (prima) f.righe.set(nuova.nodeId, { ...prima, ...nuova, model: prima.model, taskPreview: prima.taskPreview });
      toccati.push(nuova.nodeId);
    }
    if (f.panoramica?.groups) spostaConteggi(f.panoramica.groups, cambi);
    if (f.panoramica) Object.assign(f.panoramica, { status: fotogramma.status ?? f.panoramica.status, terminated: fotogramma.terminated ?? f.panoramica.terminated,
      attention: fotogramma.attention ?? f.panoramica.attention, lastSeq: fotogramma.lastSeq ?? f.panoramica.lastSeq,
      pauseRequested: fotogramma.pauseRequested === true, cancelRequested: fotogramma.cancelRequested === true });
    return toccati;
  }

  return {
    get panoramica() { return f.panoramica; },
    get meta() { return f.meta; },
    get revisione() { return f.revisione; },
    get storia() { return f.storia.items; },
    get versioneStoria() { return f.storia.versione; },
    get archiCaricati() { return f.archi.items; },
    caricaPanoramica: panoramica, pagina, righeFase, chiedi, dimentica, archiPer, aggiornaStoria, discendenza, applicaFotogramma,
    riga: (nodeId) => f.righe.get(nodeId) ?? null,
    cella: (phaseId, indice) => { const id = f.celle.get(phaseId)?.[indice]; return id ? f.righe.get(id) ?? null : null; },
    posto: (nodeId) => f.posto.get(nodeId) ?? null,
    righeCaricate: () => [...f.righe.values()],
    statoDi, conteggi, statoDelRunAl, passiAl, inizioDelRun,
    tentativi: () => derivati().tentativi,
    campata: (phaseId) => derivati().campate.get(phaseId) ?? null,
    asse: (adesso) => asseDelTempo(derivati().tentativi, { inizio: inizioDelRun() ?? adesso, adesso }),
  };
}
