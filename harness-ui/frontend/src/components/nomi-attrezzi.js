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
import { t } from './lingua.js';

export const NOMI_UMANI_ATTREZZI = Object.freeze({
  elenca: 'elenco della cartella',
  cerca: 'ricerca nei file',
  leggi: 'lettura di un file',
  scrivi: 'scrittura di un file',
  // ⛔ BC-59 (owner 17/09): nella riga attività si leggeva «file_edit…». L'attrezzo esiste nel kernel
  //    dal 16/09 (`talosHarness.mjs:2768`) e non era mai entrato qui: un nome tecnico a schermo.
  file_edit: 'modifica di un file',
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
  research_deposit: 'consegna del rapporto di ricerca', // 12/09: visto «research_deposit…» a schermo nel giro L8 — un nome tecnico in UI viola la regola del 04/09
});

/**
 * Il nome per una persona, o `null` se non lo conosciamo.
 * @param {string} id l'id tecnico, cioè il nome che riceve il modello
 * @param {Record<string,string>} [catalogo] traduzioni per la lingua corrente,
 *   con le stesse chiavi: la mappa resta una, cambiano i valori (decisione H21)
 */
function nomeUmanoAttrezzoItaliano(id, catalogo = null) {
  const chiave = String(id ?? '');
  if (catalogo && Object.prototype.hasOwnProperty.call(catalogo, chiave)) return catalogo[chiave];
  return Object.prototype.hasOwnProperty.call(NOMI_UMANI_ATTREZZI, chiave) ? NOMI_UMANI_ATTREZZI[chiave] : null;
}

/** Il nome umano nella lingua dei menu (P-i18n 06/09): la tabella resta italiana, la traduzione la dà t(). */
export function nomeUmanoAttrezzo(id, catalogo = null) {
  return t(nomeUmanoAttrezzoItaliano(id, catalogo));
}

/**
 * Il ripiego quando un attrezzo non ha ancora un nome nostro (attrezzo creato dalla persona, MCP, skill).
 *
 * ⛔ 17/09 — due regole dell'owner del 04/09 si toccano qui: «niente nomi tecnici a schermo» e «ripiego ONESTO:
 *   mai un'etichetta inventata». Restituire l'id grezzo rompeva la prima; «attrezzo senza nome» rompeva la
 *   seconda e nascondeva perfino il nome che la PERSONA ha dato a un attrezzo suo. ⇒ Il ripiego è il nome stesso,
 *   reso leggibile e niente di più: `converti_pdf` → «converti pdf», `mcp__github__create_issue` →
 *   «create issue (github)». L'id intero resta nel `title`, come dettaglio secondario.
 */
export function nomeDiRipiegoAttrezzo(id) {
  const grezzo = typeof id === 'string' ? id.trim() : '';
  if (!grezzo) return '';
  const mcp = /^mcp__([^_](?:.*?[^_])?)__(.+)$/u.exec(grezzo);
  const leggibile = (testo) => testo.replace(/[_-]+/gu, ' ').replace(/\s+/gu, ' ').trim();
  return mcp ? `${leggibile(mcp[2])} (${leggibile(mcp[1])})` : leggibile(grezzo);
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

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * C10 — LA DESCRIZIONE NOSTRA, IN ITALIANO.
 *
 * Owner, decisione C10: «Descrizione **nostra in italiano**; quella del kernel
 * resta visibile come "testo inviato al modello"». L'audit del 06/09: ❌ «Le
 * righe mostrano solo l'inglese del kernel: "Lists the files of the workspace,
 * with their sizes…"».
 *
 * ⛔ NON sono traduzioni. Il testo del kernel è scritto PER IL MODELLO: dice
 * quando chiamare l'attrezzo, cosa non fare, quale id passare. A una persona
 * che guarda l'elenco serve un'altra cosa — che cosa fa questo attrezzo al suo
 * computer e ai suoi dati. Due destinatari, due testi.
 *
 * ⛔ E il testo del kernel NON si tocca: è il contratto col modello (regola
 * dell'owner del 04/09). Qui si aggiunge, non si sostituisce: il grezzo resta
 * visibile nel pannello di dettaglio, etichettato.
 *
 * ⛔ Quello che non ha una descrizione nostra torna `null`, e la superficie
 * mostra l'inglese del kernel dicendo che è quello: mai una frase inventata.
 */
export const DESCRIZIONI_ATTREZZI = Object.freeze({
  elenca: 'Guarda quali file ci sono nella cartella del progetto, ai primi livelli.',
  cerca: 'Trova file in tutto il progetto, anche in fondo, per nome o per il testo che contengono.',
  leggi: 'Legge un file del progetto.',
  scrivi: 'Riscrive un file del progetto per intero. È una modifica al tuo disco.',
  // ⛔ BC-59 — la differenza con `scrivi` è la sola cosa che conta per chi legge: questo cambia un
  //    pezzo e lascia il resto com'è. Se il pezzo non si trova, o si trova due volte, non scrive niente.
  file_edit: 'Cambia una parte di un file che esiste già e lascia il resto com’è. Se il testo da sostituire non si trova, o compare più di una volta, non scrive niente e lo dice.',
  prova: 'Lancia la suite di test del progetto ed è il giudice: il compito è finito quando passa.',
  shell: 'Esegue un comando nel terminale, dentro la cartella del progetto. È l’attrezzo che può fare qualunque cosa: installare, spostare, cancellare.',
  naviga: 'Apre una pagina web pubblica e ne legge il contenuto. Solo lettura, solo http e https.',
  web_search: 'Cerca sul web e riporta le pagine trovate con titolo, indirizzo e data dichiarata dalla fonte.',
  artifact_create: 'Costruisce una paginetta interattiva e la mostra dentro la chat.',
  document_create: 'Crea un documento vero (PDF, Word, foglio di calcolo, presentazione) e lo salva nel progetto.',
  time_now: 'Chiede che ora e che giorno è su questo computer, invece di indovinarlo.',
  delega_sottotask: 'Affida un pezzo di lavoro a una sessione figlia, che lavora in una cartella sua e riporta solo il risultato.',
  generate_image: 'Genera un’immagine da una descrizione e la salva nel progetto come file vero.',
  library_list: 'Elenca i file della Libreria del progetto.',
  library_search: 'Cerca fra i file della Libreria e riporta i pezzi che corrispondono.',
  library_read: 'Legge un file della Libreria.',
  library_file_origin: 'Dice da dove viene un file della Libreria: se è stato generato o portato dentro, da quale modello e quando.',
  library_rename: 'Cambia il nome a un file della Libreria.',
  library_delete: 'Toglie un file dalla Libreria. Non si torna indietro.',
  library_export: 'Salva una copia di un file della Libreria dentro il progetto, come file visibile.',
  library_context_policy_update: 'Cambia quanto della Libreria può entrare nelle conversazioni.',
  notes_list: 'Elenca le tue note, dalla più aggiornata.',
  notes_create: 'Scrive una nota per te.',
  notes_update: 'Cambia il titolo o il testo di una nota che esiste già.',
  notes_delete: 'Cancella una tua nota, per sempre.',
  tasks_list: 'Elenca le tue attività, con stato e priorità.',
  tasks_create: 'Aggiunge un’attività alla tua lista.',
  tasks_complete: 'Segna un’attività come fatta, o la rimette in corso.',
  tasks_update: 'Cambia titolo, dettaglio o priorità di un’attività che esiste già.',
  tasks_delete: 'Cancella un’attività, per sempre.',
  memory_search: 'Cerca fra le cose che hai chiesto a TALOS di ricordare.',
  memory_write: 'Salva una cosa che hai chiesto tu di ricordare per le prossime conversazioni.',
  memory_update: 'Corregge un ricordo che esiste già, invece di aggiungerne un secondo che dice il contrario.',
  memory_delete: 'Fa dimenticare un ricordo, così non viene più usato.',
  research_list: 'Elenca le ricerche approfondite fatte su questo progetto e com’è finita ognuna.',
  research_start: 'Avvia una ricerca approfondita: cerca sul web, legge le fonti e scrive un rapporto. Dura minuti e consuma credito vero.',
  research_read: 'Legge il rapporto scritto da una ricerca finita.',
  research_rename: 'Cambia solo l’etichetta di una ricerca: non rifà niente.',
  research_pause: 'Ferma una ricerca in corso tenendo quello che ha già raccolto.',
  research_resume: 'Riprende una ricerca in pausa da dove si era fermata.',
  research_cancel: 'Ferma una ricerca per sempre. Quello che ha raccolto resta leggibile.',
  research_delete: 'Cancella una ricerca e il suo rapporto, per sempre.',
  research_deposit: 'Deposita il rapporto della ricerca, con le affermazioni e le fonti, nel posto della ricerca.',
  tool_create: 'Costruisce un attrezzo nuovo, descritto a parole, che TALOS potrà chiamare da qui in avanti.',
});

/**
 * La descrizione nostra di un attrezzo, o `null` se non l'abbiamo scritta.
 * ⛔ `null` NON si sostituisce con l'inglese qui dentro: chi disegna deve poter
 * dire «questo è il testo del kernel», e non può se le due cose si confondono.
 */
export function descrizioneAttrezzo(id) {
  const chiave = String(id ?? '');
  return Object.prototype.hasOwnProperty.call(DESCRIZIONI_ATTREZZI, chiave) ? DESCRIZIONI_ATTREZZI[chiave] : null;
}

/** Gli id senza una descrizione nostra: il debito di C10, misurato invece che dichiarato chiuso. */
export function attrezziSenzaDescrizione(ids) {
  return [...new Set(ids || [])].filter((id) => descrizioneAttrezzo(id) === null);
}
