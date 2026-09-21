/** Ordered, append-only graph projection. Chat events remain the execution evidence. */
export function creaTimelineAgenti({ write, clock, persistent }) {
  const streams = new Map();
  const schema = 'talos.agent-timeline.v1';
  const state = rootId => streams.get(rootId);
  function registra(rootId, node, event, { complete = false, partial = false, sourceSeq = null } = {}) {
    let s = state(rootId);
    if (!s) { s = { items: [], seq: 0, coverage: complete ? 'complete' : 'partial', persisted: persistent, pending: Promise.resolve() }; streams.set(rootId, s); }
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
    return record;
  }
  function ripristina(rootId, records) {
    if (!records.length) return;
    const s = { items: [], seq: 0, coverage: 'complete', persisted: persistent, pending: Promise.resolve() };
    for (const r of records) {
      const previous = s.seq;
      if (Number.isSafeInteger(r.seq) && r.seq > s.seq) s.seq = r.seq;
      if (r.schema !== schema || r.rootId !== rootId || !Number.isSafeInteger(r.seq) || r.seq <= previous || !r.node?.sessionId || !Number.isFinite(Date.parse(r.at))) { s.coverage = 'partial'; continue; }
      if (r.seq !== previous+1 || r.coverage !== 'complete') s.coverage = 'partial';
      s.items.push(structuredClone(r));
    }
    streams.set(rootId, s);
  }
  async function leggi(rootId, { after = 0, through, limit = 250 } = {}) {
    const s = state(rootId); const end = through ?? s?.seq ?? 0;
    if (![after,end,limit].every(Number.isSafeInteger) || after < 0 || end < after || end > (s?.seq ?? 0) || limit < 1 || limit > 500) {
      return { erroreAvvio: 'Intervallo della cronologia non valido', code: 'QUERY_INVALID' };
    }
    await s?.pending;
    const available = (s?.items ?? []).filter(r => r.seq > after && r.seq <= end);
    const items = available.slice(0, limit);
    const last = items.at(-1)?.seq ?? after;
    return { schema, rootId, coverage: s?.coverage ?? 'unavailable', persisted: s?.persisted ?? persistent,
      through: end, next: available.length > items.length ? last : null, items: structuredClone(items) };
  }
  return { registra, ripristina, leggi, stato: state };
}
