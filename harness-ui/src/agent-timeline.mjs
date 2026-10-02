/** Ordered, append-only graph projection. Chat events remain the execution evidence. */
/*
 * ⭐ 02/10/2026 — LA FINESTRA IN MEMORIA (decisione owner: «ultimi 500 in RAM, il resto dal file»). Prima ogni record restava in
 *   RAM per sempre: misurato col registro vero, 800 giri = 9.604 record, 144 MB di heap. Ora in RAM restano gli ultimi
 *   `finestra` record per radice; quelli più vecchi si rileggono dal file della sessione (dove `write` li ha già messi) quando
 *   qualcuno li chiede — la riproduzione all'indietro. Hermes tiene in RAM 1.000 eventi per run e oltre non recupera
 *   (`gateway/platforms/api_server_runs.py:116-151`); qui oltre la finestra si recupera, e quando il file non dà tutto lo si
 *   dice (errore o copertura `partial`), mai con un buco silenzioso (open-design #5411: un cursore più vecchio del buffer
 *   perdeva eventi senza dirlo).
 * ⛔ Senza archivio (`persistent` falso) i record usciti dalla finestra sono persi: la copertura diventa `partial`, dichiarata.
 * ⭐ Il grafo legge la cronologia a pagine (250): per non riscandire il file a ogni pagina, i record più vecchi letti dal disco
 *   restano accanto alla radice per `durataDisco` ms dall'ultimo uso, poi si lasciano andare.
 */
export const FINESTRA_CRONOLOGIA = 500;
export const DURATA_CACHE_DISCO_MS = 30_000;
export function creaTimelineAgenti({ write, clock, persistent, leggiDalDisco = null, finestra = FINESTRA_CRONOLOGIA, durataDisco = DURATA_CACHE_DISCO_MS }) {
  const streams = new Map();
  const schema = 'talos.agent-timeline.v1';
  const state = rootId => streams.get(rootId);
  const nuovo = (coverage) => ({ items: [], seq: 0, coverage, persisted: persistent, pending: Promise.resolve(), disco: null, discoTimer: null });
  function registra(rootId, node, event, { complete = false, partial = false, sourceSeq = null } = {}) {
    let s = state(rootId);
    if (!s) { s = nuovo(complete ? 'complete' : 'partial'); streams.set(rootId, s); }
    if (partial) s.coverage = 'partial';
    const record = { tipo: 'grafo-agenti', schema, rootId, seq: ++s.seq, at: clock().toISOString(),
      coverage: s.coverage, event, sourceSeq, node: structuredClone(node) };
    s.items.push(record);
    if (persistent) {
      // Invoke now: session-store owns serialization and the per-file write queue.
      let saving; try { saving = Promise.resolve(write(rootId, record)); } catch (e) { saving = Promise.reject(e); }
      const checked = saving.catch(() => { s.persisted = false; s.coverage = 'partial'; });
      s.pending = Promise.all([s.pending, checked]).then(() => undefined);
    }
    if (s.items.length > finestra) {
      s.items.splice(0, s.items.length - finestra);
      if (!persistent) s.coverage = 'partial';
    }
    return record;
  }
  /* Un record letto (al ripristino o dal file) vale solo se è di questa radice e ben formato. */
  const valido = (r, rootId) => r?.schema === schema && r.rootId === rootId && Number.isSafeInteger(r.seq)
    && Boolean(r.node?.sessionId) && Number.isFinite(Date.parse(r.at));
  function ripristina(rootId, records) {
    if (!records.length) return;
    const s = nuovo('complete');
    for (const r of records) {
      const previous = s.seq;
      if (Number.isSafeInteger(r.seq) && r.seq > s.seq) s.seq = r.seq;
      if (!valido(r, rootId) || r.seq <= previous) { s.coverage = 'partial'; continue; }
      if (r.seq !== previous+1 || r.coverage !== 'complete') s.coverage = 'partial';
      s.items.push(structuredClone(r));
      // la finestra vale anche qui: un file con migliaia di record non torna in RAM per intero
      if (s.items.length > finestra * 2) s.items.splice(0, s.items.length - finestra);
    }
    if (s.items.length > finestra) s.items.splice(0, s.items.length - finestra);
    streams.set(rootId, s);
  }
  function trattieni(s) {
    clearTimeout(s.discoTimer);
    s.discoTimer = setTimeout(() => { s.disco = null; s.discoTimer = null; }, durataDisco);
    s.discoTimer.unref?.();
  }
  /* I record più vecchi della finestra, dal file: una lettura sola per una serie di pagine (vedi `durataDisco`). */
  async function vecchiDalDisco(rootId, s, primoInRam) {
    if (s.disco && s.disco.finoA >= primoInRam) { trattieni(s); return s.disco.records; }
    const records = [];
    await leggiDalDisco(rootId, (r) => {
      if (r?.tipo !== 'grafo-agenti' || !valido(r, rootId)) return undefined;
      if (r.seq >= primoInRam) return false; // da qui in poi risponde la RAM
      if (r.seq > (records.at(-1)?.seq ?? 0)) records.push(r);
      return undefined;
    });
    s.disco = { records, finoA: primoInRam };
    trattieni(s);
    return records;
  }
  async function leggi(rootId, { after = 0, through, limit = 250 } = {}) {
    const s = state(rootId); const end = through ?? s?.seq ?? 0;
    if (![after,end,limit].every(Number.isSafeInteger) || after < 0 || end < after || end > (s?.seq ?? 0) || limit < 1 || limit > 500) {
      return { erroreAvvio: 'Intervallo della cronologia non valido', code: 'QUERY_INVALID' };
    }
    await s?.pending;
    const inRam = s?.items ?? [];
    const primoInRam = inRam[0]?.seq ?? ((s?.seq ?? 0) + 1);
    let prima = [], coverage = s?.coverage ?? 'unavailable';
    if (s && after + 1 < primoInRam && persistent && typeof leggiDalDisco === 'function') {
      try { prima = (await vecchiDalDisco(rootId, s, primoInRam)).filter(r => r.seq > after && r.seq <= end); }
      catch { return { erroreAvvio: 'La parte più vecchia della cronologia non si legge dal file della sessione', code: 'TIMELINE_READ_FAILED' }; }
      // il file deve dare OGNI record fra `after` e la finestra: se ne manca uno, la risposta non si dice completa
      const finoA = Math.min(end, primoInRam - 1);
      if (prima.length !== finoA - after || prima.some((r, i) => r.seq !== after + 1 + i)) coverage = 'partial';
    }
    const available = [...prima, ...inRam.filter(r => r.seq > after && r.seq <= end)];
    const items = available.slice(0, limit);
    const last = items.at(-1)?.seq ?? after;
    return { schema, rootId, coverage, persisted: s?.persisted ?? persistent,
      through: end, next: available.length > items.length ? last : null, items: structuredClone(items) };
  }
  return { registra, ripristina, leggi, stato: state };
}
