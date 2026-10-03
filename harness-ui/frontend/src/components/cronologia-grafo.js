/** Immutable event order; seeks never merge future/live fields into historical nodes. */
import { t } from './lingua.js'; // 03/10/2026: questi errori arrivano a schermo nel grafo delle deleghe
export function creaCronologiaGrafo(currentId) {
  const records = [], bySeq = new Map(); let partial = false, rootId = null;
  let atIndex = -1, nodes = new Map();
  function aggiungi(items) {
    if (!Array.isArray(items)) throw Error(t('agenti.timeline.error.invalid'));
    let expected = records.at(-1)?.record.seq ?? 0, root = rootId;
    const fresh = []; let gap = false, when = records.at(-1)?.when ?? 0;
    for (const item of items) {
      if (item?.schema !== 'talos.agent-timeline.v1' || !Number.isSafeInteger(item.seq) || item.seq < 1 || !item.node?.sessionId || !Number.isFinite(Date.parse(item.at))) throw Error(t('agenti.timeline.error.invalidEvent'));
      root ??= item.rootId;
      if (root !== item.rootId) throw Error(t('agenti.timeline.error.otherSession'));
      const known = bySeq.get(item.seq);
      if (known) { if (JSON.stringify(known.record) !== JSON.stringify(item)) throw Error(t('agenti.timeline.error.inconsistentEvent')); continue; }
      if (item.seq <= expected) throw Error(t('agenti.timeline.error.invalidOrder'));
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
