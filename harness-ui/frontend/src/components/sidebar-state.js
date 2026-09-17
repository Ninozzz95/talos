/** Desktop sidebar state. Server facts, local reading/pins and connection health stay separate. */
import { statoSessione, nomeLeggibileSessione, nomeModello, ordinaSessioniAdAlbero } from './session-item.js';
import { giriDellaSessione, spiegaGiriFermati } from './consumo-sessione.js';

export const SIDEBAR_SCHEMA = 'talos.sidebar.v1';
export const SIDEBAR_PREFS = 'talos-desktop-sidebar-v1';
export const FILTRI_SIDEBAR = Object.freeze({ tutte: 'Tutte', attive: 'Attive', attenzione: 'Da vedere', concluse: 'Concluse', fissate: 'Fissate' });
const validCount = n => Number.isSafeInteger(n) && n >= 0;
const validId = id => typeof id === 'string' && id.length > 0 && id.length <= 200;
const finiteTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const phaseLabels = { avvio: ['in corso', 'i-play'], ragionamento: ['ragiona', 'i-brain'],
  risposta: ['risponde', 'i-send'], strumento: ['strumenti', 'i-code'], approvazione: ['aspetta te', 'i-user'] };
const toolNames = { shell: 'Terminale', scrivi: 'Scrittura file', leggi: 'Lettura file', elenca: 'Esplora file',
  cerca: 'Ricerca nei file', web_search: 'Ricerca web', naviga: 'Browser', delega_sottotask: 'Delega',
  tasks_complete: 'Completa attività', document_create: 'Crea documento' };

export function statoSidebar(row) {
  if (row?.inAttesaApprovazione === true) return { key: 'attesa', label: 'aspetta te', icon: 'i-user', tone: 'warning', active: true, attention: true };
  if (typeof row?.conclusa !== 'boolean') return { key: 'sconosciuto', label: 'stato non disponibile', icon: 'i-ignoto', tone: 'muted', active: false, attention: false };
  const base = statoSessione(row);
  if (base.classe === 'vivo' || (row.interrotta !== true && row.attivitaSidebar?.comandiAttivi > 0)) {
    const command = row.attivitaSidebar?.comandiAttivi > 0;
    const phase = row.attivitaSidebar?.fase;
    const [label, icon] = command ? ['terminale attivo', 'i-terminal'] : phaseLabels[phase] || phaseLabels.avvio;
    return { key: command ? 'comando' : phaseLabels[phase] ? phase : 'vivo', label, icon,
      tone: phase === 'approvazione' ? 'warning' : 'live', active: true, attention: phase === 'approvazione' };
  }
  const icons = { errore: 'i-x', fermata: 'i-stop', interrotto: 'i-stop', successo: 'i-check', ignoto: 'i-ignoto' };
  return { key: base.classe, label: base.testo, icon: icons[base.classe] || 'i-clock',
    tone: base.tono || 'muted', active: false, attention: base.classe === 'errore' };
}

export function durataSidebar(from, now, to = null) {
  if (!finiteTime(from)) return null;
  const end = to === null ? now : finiteTime(to) ? Date.parse(to) : NaN;
  const seconds = Math.floor((end - Date.parse(from)) / 1000);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m`;
}

export function modelloRigaSidebar(row, { now = Date.now(), current = false, unread = 0, pinned = false, childrenActive = 0, fresh = true, nomeDistintivo = null } = {}) {
  const state = statoSidebar(row);
  const a = row.attivitaSidebar;
  const name = `${row.nome || nomeDistintivo || row.taskDelega || nomeLeggibileSessione(row.taskId)}${row.forkDa ? ' · ramo' : ''}`;
  const model = nomeModello(row.modello);
  const tool = typeof a?.strumento === 'string' && a.strumento ? toolNames[a.strumento] || a.strumento : null;
  const { giri, fermati } = giriDellaSessione(row);
  const elapsed = a && (state.active ? fresh : finiteTime(a.terminataAlle))
    ? durataSidebar(state.key === 'comando' ? a.comandoAlle : a.iniziataAlle, now, state.active ? null : a.terminataAlle) : null;
  const age = a && finiteTime(a.ultimoEventoAlle) ? durataSidebar(a.ultimoEventoAlle, now) : null;
  let detail = state.key === 'strumento' && tool ? tool : model || '';
  if (a?.coda > 0 && !state.active) detail = `${a.coda} in coda${a.codaInPausa ? ' · in pausa' : ''}`;
  else if (childrenActive > 0 && !state.active) detail = `${childrenActive} sotto-agent${childrenActive === 1 ? 'e attivo' : 'i attivi'}`;
  const facts = [name, `${fresh ? '' : 'Dati non aggiornati · '}${state.label}`];
  if (model) facts.push(`Modello: ${model}`);
  if (a && elapsed) facts.push(`${state.active ? 'Giro attivo da' : 'Durata ultimo giro'}: ${elapsed}`);
  if (tool && state.active) facts.push(`Strumento richiesto: ${tool} (la richiesta può essere ancora in preparazione)`);
  if (a && validCount(a.chiamate)) facts.push(`${a.chiamate} chiamate a strumenti nella sessione`);
  if (a && validCount(a.fileModificati)) facts.push(`${a.fileModificati} file modificati dagli eventi registrati`);
  if (a?.recente?.tipo === 'file' && typeof a.recente.nome === 'string') facts.push(`Ultima modifica: ${a.recente.nome}`);
  if (a?.coda > 0) facts.push(`${a.coda} messaggi in coda${a.codaInPausa ? ', in pausa' : ''}`);
  if (childrenActive > 0) facts.push(`${childrenActive} sotto-agenti attivi`);
  if (validCount(giri)) facts.push(`${giri} giri nella sessione${fermati ? ` · ${spiegaGiriFermati(fermati)}` : ''}`);
  if (age) facts.push(`Ultimo evento: ${age} fa`);
  if (unread > 0) facts.push(`${unread} rispost${unread === 1 ? 'a non letta' : 'e non lette'}`);
  if (pinned) facts.push('Fissata in questa sidebar');
  return { name, state, model, detail, elapsed, age, giri: validCount(giri) ? giri : null, current, unread, pinned,
    tooltip: facts.join('\n'), accessibleName: `${name}, ${state.label}${unread ? `, ${unread} non lett${unread === 1 ? 'a' : 'e'}` : ''}` };
}

function validRows(items) {
  if (!Array.isArray(items)) return false;
  const ids = new Set();
  for (const row of items) {
    if (!row || typeof row !== 'object' || Array.isArray(row) || !validId(row.sessionId) || ids.has(row.sessionId)) return false;
    ids.add(row.sessionId);
  }
  return true;
}
const structuralKey = row => JSON.stringify([row.nome, row.taskId, row.taskDelega, row.modello, row.padreId,
  row.avviataAlle, row.ultimaRispostaAlle, row.conclusa, row.interrotta, row.inAttesaApprovazione,
  row.ultimoEsito, row.motivoChiusura, row.attivitaSidebar?.comandiAttivi > 0]);

export function leggiPreferenzeSidebar(value) {
  try {
    const data = typeof value === 'string' ? JSON.parse(value) : value;
    const pinned = new Set((Array.isArray(data?.pinned) ? data.pinned : []).filter(validId).slice(0, 1000));
    const read = new Map((Array.isArray(data?.read) ? data.read : []).filter(pair => Array.isArray(pair) && validId(pair[0]) && validCount(pair[1])).slice(-1000));
    const filter = Object.hasOwn(FILTRI_SIDEBAR, data?.filter) ? data.filter : 'tutte';
    return { pinned, read, filter };
  } catch { return { pinned: new Set(), read: new Map(), filter: 'tutte' }; }
}

export function creaStatoSidebar({ preferences = null, normalize = row => row } = {}) {
  const rows = new Map(), hashes = new Map();
  const local = leggiPreferenzeSidebar(preferences);
  let epoch = null, revision = -1, synced = false, loaded = false, authoritative = false;
  let freshness = 'caricamento';
  let generation = 0, preferenceGeneration = 0;
  function setItems(items, snapshot, baseline = !loaded) {
    const changed = new Set(), removed = new Set(); let structure = false;
    const present = new Set(items.map(row => row.sessionId));
    if (snapshot) for (const id of rows.keys()) if (!present.has(id)) { rows.delete(id); hashes.delete(id); const removedPin = local.pinned.delete(id), removedRead = local.read.delete(id);
        if (removedPin || removedRead) preferenceGeneration++; removed.add(id); structure = true; }
    for (const incoming of items) {
      const row = normalize(incoming), id = row.sessionId, hash = JSON.stringify(row), previous = rows.get(id);
      if (hashes.get(id) === hash) continue;
      if (!previous || structuralKey(previous) !== structuralKey(row)) structure = true;
      rows.set(id, row); hashes.set(id, hash); changed.add(id);
      if (!local.read.has(id) && validCount(row.attivitaSidebar?.risposte)) { local.read.set(id, baseline ? row.attivitaSidebar.risposte : 0); preferenceGeneration++; }
    }
    loaded = true;
    return { changed, removed, structure };
  }
  const api = {
    rows,
    local,
    get freshness() { return freshness; },
    get synced() { return synced; },
    get loaded() { return loaded; },
    get revision() { return revision; },
    get epoch() { return epoch; },
    get generation() { return generation; },
    get preferenceGeneration() { return preferenceGeneration; },
    connection(status) { freshness = status; if (status !== 'live') synced = false; },
    apply(message) {
      if (!message || message.schema !== SIDEBAR_SCHEMA || !validId(message.epoch)
        || !validCount(message.revision) || !['snapshot', 'delta', 'heartbeat'].includes(message.kind)) return { invalid: true };
      if (message.kind === 'snapshot') {
        if (!validRows(message.items) || (synced && epoch === message.epoch && message.revision < revision)) return { invalid: true };
        const result = setItems(message.items, true, !authoritative); authoritative = true;
        epoch = message.epoch; revision = message.revision; synced = true; freshness = 'live'; generation++;
        return { ...result, accepted: true, snapshot: true };
      }
      if (!synced || epoch !== message.epoch) return { invalid: true };
      if (message.kind === 'heartbeat') return message.revision === revision ? { accepted: true, heartbeat: true } : { invalid: true };
      if (message.revision <= revision) return { duplicate: true };
      if (message.revision !== revision + 1 || !validRows(message.items)
        || !Array.isArray(message.removed) || message.removed.some(id => !validId(id))
        || message.items.some(row => message.removed.includes(row.sessionId))) return { invalid: true };
      const result = setItems(message.items, false);
      if (message.resources === true) result.resources = true;
      for (const id of message.removed) {
        if (rows.delete(id)) { result.removed.add(id); result.structure = true; }
        hashes.delete(id); const removedPin = local.pinned.delete(id), removedRead = local.read.delete(id);
        if (removedPin || removedRead) preferenceGeneration++;
      }
      revision = message.revision; generation++;
      return { ...result, accepted: true };
    },
    applyRest(items, requestedGeneration) {
      // REST may have begun before a newer SSE snapshot/delta arrived.
      if (synced || requestedGeneration !== generation) return { ignored: true };
      if (!validRows(items)) return { invalid: true };
      const result = setItems(items, true); freshness = 'stale'; generation++;
      return { ...result, accepted: true, snapshot: true };
    },
    unread(id) {
      const count = rows.get(id)?.attivitaSidebar?.risposte;
      return validCount(count) ? Math.max(0, count - (local.read.get(id) ?? 0)) : 0;
    },
    markRead(id) {
      const count = rows.get(id)?.attivitaSidebar?.risposte;
      if (!validCount(count) || local.read.get(id) === count) return false;
      local.read.set(id, count); preferenceGeneration++; return true;
    },
    togglePin(id) { if (!rows.has(id)) return false; if (local.pinned.has(id)) local.pinned.delete(id); else local.pinned.add(id); preferenceGeneration++; return true; },
    preferences() {
      return JSON.stringify({ pinned: [...local.pinned].filter(id => rows.has(id)).slice(0, 1000),
        read: [...local.read].filter(([id]) => rows.has(id)).slice(-1000), filter: local.filter });
    },
  };
  return api;
}

/** Filter whole rows. Ancestors of matching children remain as explicit context. */
export function selezionaRigheSidebar(state, { query = '', filter = state.local.filter } = {}) {
  const list = [...state.rows.values()];
  // Retain the existing root/child ordering policy; pin an entire tree, not an orphaned child.
  const ordered = ordinaSessioniAdAlbero(list.map(row => typeof row.conclusa === 'boolean' ? row : { ...row, conclusa: true }))
    .map(item => ({ ...item, sessione: state.rows.get(item.sessione.sessionId) }));
  const rootFor = new Map(), pinnedRoots = new Set(); let root = null;
  for (const item of ordered) {
    if (item.profondita === 0) root = item.sessione.sessionId;
    rootFor.set(item.sessione.sessionId, root);
    if (state.local.pinned.has(item.sessione.sessionId)) pinnedRoots.add(root);
  }
  const groups = new Map();
  for (const item of ordered) { const id = rootFor.get(item.sessione.sessionId); if (!groups.has(id)) groups.set(id, []); groups.get(id).push(item); }
  const sorted = [...groups].sort(([a], [b]) => Number(pinnedRoots.has(b)) - Number(pinnedRoots.has(a))).flatMap(([, group]) => group);
  const q = query.trim().toLocaleLowerCase('it');
  const matched = new Set();
  for (const row of list) {
    const status = statoSidebar(row);
    const searchable = [row.nome, row.taskId, row.taskDelega, nomeModello(row.modello), status.label, row.attivitaSidebar?.strumento].filter(Boolean).join(' ').toLocaleLowerCase('it');
    const fits = filter === 'attive' ? status.active : filter === 'attenzione' ? status.attention || state.unread(row.sessionId) > 0
      : filter === 'concluse' ? !status.active && row.conclusa === true : filter === 'fissate' ? pinnedRoots.has(rootFor.get(row.sessionId)) : true;
    if (fits && (!q || searchable.includes(q))) matched.add(row.sessionId);
  }
  const visible = new Set(matched);
  for (const id of matched) {
    let parent = state.rows.get(id)?.padreId; const visited = new Set([id]);
    while (validId(parent) && state.rows.has(parent) && !visited.has(parent)) {
      visible.add(parent); visited.add(parent); parent = state.rows.get(parent).padreId;
    }
  }
  return sorted.map(item => ({ ...item, hidden: !visible.has(item.sessione.sessionId), context: !matched.has(item.sessione.sessionId) }));
}
