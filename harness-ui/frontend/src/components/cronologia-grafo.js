/** Immutable event order; seeks never merge future/live fields into historical nodes. */
export function creaCronologiaGrafo(currentId) {
  const records = [], bySeq = new Map(); let partial = false, rootId = null;
  let atIndex = -1, nodes = new Map();
  function aggiungi(items) {
    if (!Array.isArray(items)) throw Error('Cronologia non valida');
    let expected = records.at(-1)?.record.seq ?? 0, root = rootId;
    const fresh = []; let gap = false, when = records.at(-1)?.when ?? 0;
    for (const item of items) {
      if (item?.schema !== 'talos.agent-timeline.v1' || !Number.isSafeInteger(item.seq) || item.seq < 1 || !item.node?.sessionId || !Number.isFinite(Date.parse(item.at))) throw Error('Evento della cronologia non valido');
      root ??= item.rootId;
      if (root !== item.rootId) throw Error('Cronologia di un’altra sessione');
      const known = bySeq.get(item.seq);
      if (known) { if (JSON.stringify(known.record) !== JSON.stringify(item)) throw Error('Evento della cronologia incoerente'); continue; }
      if (item.seq <= expected) throw Error('Ordine della cronologia non valido');
      gap ||= item.seq !== expected+1; expected = item.seq;
      when = Math.max(when, Date.parse(item.at));
      fresh.push({ record: structuredClone(item), when });
    }
    rootId = root; partial ||= gap;
    for (const entry of fresh) { records.push(entry); bySeq.set(entry.record.seq, entry); }
  }
  function frame(index) {
    if (!Number.isSafeInteger(index) || index < 0 || index >= records.length) return null;
    if (index < atIndex) { atIndex = -1; nodes = new Map(); }
    while (atIndex < index) { const r = records[++atIndex].record; nodes.set(r.node.sessionId, r.node); }
    const entry = records[index];
    return { quando: entry.when, event: entry.record.event, seq: entry.record.seq,
      dati: { corrente: structuredClone(nodes.get(currentId) || { sessionId: currentId }),
        sessioni: structuredClone([...nodes.values()]), figli: [], aggiornato: entry.record.at } };
  }
  return { aggiungi, frame, get length() { return records.length; }, get lastSeq() { return records.at(-1)?.record.seq ?? 0; }, get partial() { return partial; } };
}
