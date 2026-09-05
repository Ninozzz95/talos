/*
 * I nomi degli attrezzi: UN POSTO SOLO.
 *
 * ⛔⛔ Regola dell'owner, 04/09/2026: «mai `web_search`, `tool_create`,
 * `document_create` a schermo; mappa nome-tecnico → nome-umano in UN posto
 * solo, il grezzo al più come dettaglio secondario, e **mai** toccare i nomi
 * che riceve il modello — sono il contratto col kernel».
 *
 * ⇒ Da qui NON passa niente che vada verso il modello. Questo modulo è
 * unidirezionale: id tecnico → parole per una persona. L'id resta l'identità
 * ovunque nel sistema (richieste, permessi, ricevute, eventi); il nome è solo
 * ciò che si legge. Confermato dalla ricerca del 05/09/2026: l'id è
 * l'identificatore interno, il nome è per chi guarda, e **la ricerca deve
 * accettare tutti e due** — chi conosce `web_search` lo digiterà.
 * Fonti: medium.com/@srinathperera/thinking-deeply-about-ids-names-and-renaming-029410b727b7 ·
 * medium.com/uncountable-engineering/universal-id-to-name-mapping-for-the-frontend-and-backend-663d49b7a588
 *
 * ⛔ `nomeUmanoAttrezzo` torna `null` quando non conosce un id, invece di
 * restituire l'id stesso: così chi chiama DEVE decidere cosa mostrare, e un
 * attrezzo nuovo non scivola a schermo col suo nome tecnico senza che nessuno
 * se ne accorga. Restituire l'id sarebbe comodo e romperebbe la regola in
 * silenzio, proprio nel caso in cui serve saperlo.
 */
export const NOMI_UMANI_ATTREZZI = Object.freeze({
  elenca: 'elenco della cartella',
  cerca: 'ricerca nei file',
  leggi: 'lettura di un file',
  scrivi: 'scrittura di un file',
  prova: 'esecuzione dei test',
  shell: 'comando nel terminale',
  naviga: 'apertura di una pagina web',
  web_search: 'ricerca sul web',
  artifact_create: 'creazione di un artefatto',
  document_create: 'creazione di un documento',
  generate_image: 'generazione di un’immagine',
  delega_sottotask: 'delega a un sotto-agente',
  time_now: 'data e ora',
  tool_create: 'creazione di un attrezzo nuovo',
  library_list: 'elenco della Libreria',
  library_search: 'ricerca in Libreria',
  library_read: 'lettura di un file di Libreria',
  library_file_origin: 'origine di un file di Libreria',
  library_rename: 'rinomina di un file di Libreria',
  library_delete: 'eliminazione di un file di Libreria',
  library_export: 'copia di un file di Libreria nel workspace',
  library_context_policy_update: 'regole d’uso della Libreria',
  notes_list: 'elenco delle note',
  notes_create: 'scrittura di una nota',
  notes_update: 'modifica di una nota',
  notes_delete: 'eliminazione di una nota',
  tasks_list: 'elenco delle attività',
  tasks_create: 'creazione di un’attività',
  tasks_complete: 'chiusura di un’attività',
  tasks_update: 'modifica di un’attività',
  tasks_delete: 'eliminazione di un’attività',
  memory_search: 'ricerca nella memoria',
  memory_write: 'scrittura in memoria',
  memory_update: 'correzione di una memoria',
  memory_delete: 'eliminazione di una memoria',
  research_list: 'elenco delle ricerche',
  research_start: 'avvio di una ricerca approfondita',
  research_read: 'lettura del rapporto di ricerca',
  research_rename: 'rinomina di una ricerca',
  research_pause: 'pausa di una ricerca',
  research_resume: 'ripresa di una ricerca',
  research_cancel: 'annullamento di una ricerca',
  research_delete: 'eliminazione di una ricerca',
});

/**
 * Il nome per una persona, o `null` se non lo conosciamo.
 * @param {string} id l'id tecnico, cioè il nome che riceve il modello
 * @param {Record<string,string>} [catalogo] traduzioni per la lingua corrente,
 *   con le stesse chiavi: la mappa resta una, cambiano i valori (decisione H21)
 */
export function nomeUmanoAttrezzo(id, catalogo = null) {
  const chiave = String(id ?? '');
  if (catalogo && Object.prototype.hasOwnProperty.call(catalogo, chiave)) return catalogo[chiave];
  return Object.prototype.hasOwnProperty.call(NOMI_UMANI_ATTREZZI, chiave) ? NOMI_UMANI_ATTREZZI[chiave] : null;
}

/** Gli id tecnici per cui non abbiamo ancora un nome: un debito che si misura. */
export function attrezziSenzaNome(ids, catalogo = null) {
  return [...new Set(ids || [])].filter((id) => nomeUmanoAttrezzo(id, catalogo) === null);
}

/**
 * La ricerca accetta il nome umano E l'id tecnico.
 *
 * ⛔ Cercare solo per nome umano punirebbe chi l'attrezzo lo conosce davvero:
 * chi ha letto una ricevuta o un log scrive `web_search`, non «ricerca sul
 * web». Il grezzo resta un dettaglio secondario a schermo, ma la ricerca lo
 * deve trovare.
 */
export function corrispondeARicerca(id, query, catalogo = null) {
  const q = String(query ?? '').trim().toLowerCase();
  if (q === '') return true;
  const nome = nomeUmanoAttrezzo(id, catalogo);
  return String(id ?? '').toLowerCase().includes(q) || (nome !== null && nome.toLowerCase().includes(q));
}
