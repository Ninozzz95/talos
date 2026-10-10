// Server-owned capability ceiling, persisted in the existing task journal.
// This is not an OS sandbox: journals and application caches still persist.
const SCHEMA = 'talos.delegation.v1';
const LETTURE = new Set([
  'elenca', 'cerca', 'leggi', 'naviga', 'web_search', 'time_now', 'carica_skill', 'process_output',
  'library_find', 'library_read', 'library_file_origin',
  'notes_find', 'notes_read', 'tasks_find', // C5: *_find accorpa l'elenco e la ricerca della sezione
  'memory_find', 'research_find', 'research_read',
  'conversation_search', 'ask_parent', 'answer_parent_question',
]);

/** Missing metadata is legacy; present but invalid metadata fails closed. */
export function modalitaDelega(task) {
  if (!task || typeof task !== 'object' || !Object.hasOwn(task, 'contrattoDelega')) return null;
  const c = task.contrattoDelega;
  if (!c || Array.isArray(c) || c.schema !== SCHEMA
    || !['lettura', 'modifica'].includes(c.modalita)
    || Object.keys(c).some(k => !['schema', 'modalita'].includes(k))) return 'invalida';
  return c.modalita;
}

export function delegaLimitata(task) {
  const modo = modalitaDelega(task);
  return modo !== null && modo !== 'modifica';
}

export function consenteAttrezzoDelega(task, nome) {
  const modo = modalitaDelega(task);
  if (modo === 'invalida') return false;
  return modo !== 'lettura' || LETTURE.has(nome);
}
