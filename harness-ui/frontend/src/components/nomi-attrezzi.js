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
  ask_user_question: 'domanda alla persona',
  present_plan: 'piano da approvare', // 24/09/2026, decisione owner 36
  request_plan_mode: 'richiesta della modalità Piano',
  /* Integrazione 23/09: gli attrezzi di piano e di dialogo fra agenti arrivati col ramo Workflow. */
  workflow_plan_propose: 'proposta di workflow', // 25/09/2026: non «piano di lavoro», il nome rifiutato dall'owner il 17/09
  workflow_status: 'stato del workflow',
  process_output: 'Risultato del comando',
  workflow_output: 'lettura del risultato di un passo',
  workflow_control: 'controllo del workflow',
  ask_parent: 'domanda all’agente che l’ha avviato',
  answer_parent_question: 'risposta all’agente che l’ha avviato',
  ask_child: 'domanda a un sotto-agente',
  answer_child_question: 'risposta a un sotto-agente',
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
  notes_search: 'ricerca fra le note',
  notes_read: 'lettura di una nota',
  notes_create: 'scrittura di una nota',
  notes_update: 'modifica di una nota',
  notes_delete: 'eliminazione di una nota',
  tasks_list: 'elenco delle attività',
  tasks_search: 'ricerca fra le attività',
  tasks_create: 'creazione di un’attività',
  tasks_complete: 'chiusura di un’attività',
  tasks_update: 'modifica di un’attività',
  tasks_delete: 'eliminazione di un’attività',
  memory_list: 'elenco della memoria', // 27/09/2026, decisione owner: le letture delle sezioni
  memory_search: 'ricerca nella memoria',
  memory_write: 'scrittura in memoria',
  memory_update: 'correzione di una memoria',
  memory_delete: 'eliminazione di una memoria',
  research_list: 'elenco delle ricerche',
  research_search: 'ricerca fra le ricerche',
  conversation_search: 'ricerca nelle conversazioni',
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

/**
 * ⭐⭐ BC-78.4, 17/09/2026 — DA DOVE VIENE UN AVVISO DELLA SCANSIONE DEI PLUGIN, in parole.
 *
 * Il difetto: nel pannello Estensioni si leggeva «`tool:check_notes`: legge una credenziale e la
 * manda in rete nello stesso comando». Quel `tool:` e quel nome col trattino basso arrivano dal
 * server (`src/session-registry.mjs` costruisce `origine: \`tool:${t.nome}\``), che questa corsia non
 * tocca e che NON deve cambiare: è il contratto, e il nome dell'attrezzo è quello che l'autore del
 * plugin gli ha dato.
 *
 * ⇒ Si traduce QUI, dove si legge, con la stessa regola di tutto il resto di questo file: il
 *   prefisso diventa una parola («attrezzo», «gancio») e il nome si rende leggibile con il ripiego
 *   onesto che già esiste — mai inventato, mai nascosto. L'origine grezza resta come dettaglio
 *   secondario nel `title`, come vuole la regola dell'owner del 04/09.
 *
 * @param {string} origine per esempio `tool:check_notes` o `hook:pre-commit`
 * @returns {string} «attrezzo check notes», «gancio pre commit», o il testo reso leggibile
 */
export function origineAvvisoPlugin(origine) {
  const grezzo = typeof origine === 'string' ? origine.trim() : '';
  if (!grezzo) return '';
  const diviso = /^(tool|hook):(.+)$/u.exec(grezzo);
  if (!diviso) return nomeDiRipiegoAttrezzo(grezzo);
  const nome = diviso[1] === 'tool'
    ? (nomeUmanoAttrezzo(diviso[2]) || nomeDiRipiegoAttrezzo(diviso[2]))
    : nomeDiRipiegoAttrezzo(diviso[2]);
  return `${t(diviso[1] === 'tool' ? 'attrezzo' : 'gancio')} ${nome}`;
}

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * R4 — LA TASSONOMIA DELLE SPECIE (24/09/2026, fase 2 del segmento compatto).
 *
 * Le parole con cui la riga del segmento CONTA ciò che l'agente ha fatto. Stanno qui, accanto ai nomi
 * umani, perché la regola dell'owner del 04/09 vale anche per loro: un posto solo.
 *
 * ⛔ Nate da tre difetti misurati sul prodotto il 23/09 (documento di fase 1, §2.2): un `elenca` contato
 *   come «ricerca completata» (`legacy/app.js:11493`, `cerca || elenca → 'cercato'`), una `file_edit`
 *   riuscita detta «1 altra azione» (`:11505`, cadeva nel `default`), e un comando fallito assente dalla
 *   riga. Decisioni dell'owner 23-24/09 (D1): tassonomia per specie — elenco ≠ ricerca, modifica ≠
 *   «altra azione» — niente «completate» (ridondante), forma breve per quando la riga non ci sta, e mai
 *   un conteggio troncato con «…».
 * ⭐ Letto nel codice di Hermes (`apps/desktop/src/components/assistant-ui/tool/run-summary.ts:31-42`,
 *   clone `65ad529` del 24/09/2026): `CATEGORY_ORDER = ['edit','explore','run','delegate','other']` con
 *   il commento «Clause order is fixed so the same run always reads the same way, whichever category
 *   happens to be live», e `CATEGORY_COPY` con `noun` singolare/plurale e i verbi `past`/`present`.
 *   La FORMA è quella (ordine fisso, parole per specie, due tempi del verbo); si adatta, non si incolla:
 *   Hermes mette elenco, ricerca, lettura e web sotto «Explored N files» (`:41-49`), e proprio quello è
 *   il difetto da non ripetere.
 * ⛔ Un attrezzo che non sta in tabella non diventa «altro»: si chiama col suo nome umano
 *   (`nomeUmanoAttrezzo`) o col ripiego onesto (`nomeDiRipiegoAttrezzo`) — mai l'id tecnico.
 * ⛔ Le parole restano italiane qui e passano da `t()` dove si leggono, come i nomi umani.
 */
export const SPECIE_ATTREZZI = Object.freeze({
  lettura: Object.freeze({ icona: 'i-eye', uno: 'file letto', molti: 'file letti', breve: ['letto', 'letti'], fallitoUno: 'lettura non riuscita', fallitoMolti: 'letture non riuscite', filtro: 'Letture' }),
  ricerca: Object.freeze({ icona: 'i-search', uno: 'ricerca', molti: 'ricerche', breve: ['ricerca', 'ricerche'], fallitoUno: 'ricerca non riuscita', fallitoMolti: 'ricerche non riuscite', filtro: 'Ricerche' }),
  elenco: Object.freeze({ icona: 'i-folder', uno: 'cartella elencata', molti: 'cartelle elencate', breve: ['elenco', 'elenchi'], fallitoUno: 'elenco non riuscito', fallitoMolti: 'elenchi non riusciti', filtro: 'Elenchi' }),
  modifica: Object.freeze({ icona: 'i-edit', uno: 'file modificato', molti: 'file modificati', breve: ['modifica', 'modifiche'], fallitoUno: 'modifica non riuscita', fallitoMolti: 'modifiche non riuscite', filtro: 'Modifiche' }),
  creazione: Object.freeze({ icona: 'i-code', uno: 'file creato', molti: 'file creati', breve: ['nuovo', 'nuovi'], fallitoUno: 'creazione non riuscita', fallitoMolti: 'creazioni non riuscite', filtro: 'Nuovi file' }),
  scrittura: Object.freeze({ icona: 'i-code', uno: 'file scritto', molti: 'file scritti', breve: ['scritto', 'scritti'], fallitoUno: 'scrittura non riuscita', fallitoMolti: 'scritture non riuscite', filtro: 'Scritture' }),
  comando: Object.freeze({ icona: 'i-terminal', uno: 'comando', molti: 'comandi', breve: ['comando', 'comandi'], fallitoUno: 'comando non riuscito', fallitoMolti: 'comandi non riusciti', filtro: 'Comandi' }),
  test: Object.freeze({ icona: 'i-check-sq', uno: 'giro di test', molti: 'giri di test', breve: ['test', 'test'], fallitoUno: 'giro di test non riuscito', fallitoMolti: 'giri di test non riusciti', filtro: 'Test' }),
  'ricerca-web': Object.freeze({ icona: 'i-globe', uno: 'ricerca sul web', molti: 'ricerche sul web', breve: ['sul web', 'sul web'], fallitoUno: 'ricerca sul web non riuscita', fallitoMolti: 'ricerche sul web non riuscite', filtro: 'Web' }),
  pagina: Object.freeze({ icona: 'i-web', uno: 'pagina aperta', molti: 'pagine aperte', breve: ['pagina', 'pagine'], fallitoUno: 'pagina non aperta', fallitoMolti: 'pagine non aperte', filtro: 'Pagine' }),
  delega: Object.freeze({ icona: 'i-user', uno: 'delega', molti: 'deleghe', breve: ['delega', 'deleghe'], fallitoUno: 'delega non riuscita', fallitoMolti: 'deleghe non riuscite', filtro: 'Deleghe' }),
});

/** L'ordine fisso delle specie nella riga: chi legge trova sempre le stesse cose nello stesso posto. */
export const ORDINE_SPECIE = Object.freeze(Object.keys(SPECIE_ATTREZZI));

/** Il verbo della voce: al passato (fatto) e al presente (in corso, frase viva del segmento — D11). */
export const VERBI_ATTREZZI = Object.freeze({
  leggi: ['Letto', 'Legge'], cerca: ['Cercato', 'Cerca'], elenca: ['Elencato', 'Elenca'],
  file_edit: ['Modificato', 'Modifica'], scrivi: ['Scritto', 'Scrive'], shell: ['Eseguito', 'Esegue'],
  prova: ['Test eseguiti', 'Esegue i test'], web_search: ['Cercato sul web', 'Cerca sul web'], naviga: ['Aperto', 'Apre'],
  delega_sottotask: ['Delegato', 'Delega'],
});

/**
 * La specie di un attrezzo. `scrivi` si precisa quando arriva il suo StateDelta (`add` → creazione,
 * `replace` → modifica); senza, resta «scrittura». Un attrezzo ignoto torna `altro:<id>`: l'id resta
 * dentro la chiave perché `fraseSpecie` lo trasformi nel nome umano, mai in «altra azione».
 * @param {string} nome l'id tecnico dell'attrezzo
 * @param {string} [operazione] l'`op` dello StateDelta, per `scrivi`
 */
export function specieAttrezzo(nome, operazione) {
  switch (String(nome ?? '')) {
    case 'leggi': return 'lettura';
    case 'cerca': return 'ricerca';
    case 'elenca': return 'elenco';
    case 'file_edit': return 'modifica';
    case 'scrivi': return operazione === 'add' ? 'creazione' : operazione === 'replace' ? 'modifica' : 'scrittura';
    case 'shell': return 'comando';
    case 'prova': return 'test';
    case 'web_search': return 'ricerca-web';
    case 'naviga': return 'pagina';
    case 'delega_sottotask': return 'delega';
    default: return `altro:${String(nome ?? '')}`;
  }
}

/** Il nome per una persona di un attrezzo, senza mai cadere sull'id: nome umano, poi ripiego leggibile. */
export function nomeLeggibileAttrezzo(nome) {
  return nomeUmanoAttrezzo(nome) || nomeDiRipiegoAttrezzo(nome) || t('attrezzo');
}

/**
 * «2 cartelle elencate», «1 comando non riuscito», in forma breve «2 elenchi». Per una specie
 * `altro:<id>` la frase è il nome umano, con «×N» quando sono più d'una.
 * @param {string} specie
 * @param {number} n
 * @param {{fallito?:boolean, breve?:boolean}} [forma]
 */
export function fraseSpecie(specie, n, { fallito = false, breve = false } = {}) {
  const s = SPECIE_ATTREZZI[specie];
  if (s) {
    const parola = fallito ? (n === 1 ? s.fallitoUno : s.fallitoMolti) : breve ? s.breve[n === 1 ? 0 : 1] : (n === 1 ? s.uno : s.molti);
    return `${n} ${t(parola)}`;
  }
  const nome = nomeLeggibileAttrezzo(String(specie).replace(/^altro:/, ''));
  const molti = n > 1 ? ` ×${n}` : '';
  return fallito ? `${nome} ${t('non riuscita')}${molti}` : `${nome}${molti}`;
}

/** L'icona di una specie nello sprite; `i-bolt` per ciò che non ha una specie sua. */
export function iconaSpecie(specie) {
  return SPECIE_ATTREZZI[specie]?.icona || 'i-bolt';
}

/** [passato, presente] del verbo; per un attrezzo senza verbo nostro, il suo nome umano in tutti e due i tempi. */
export function verboAttrezzo(nome) {
  const verbi = VERBI_ATTREZZI[nome];
  if (verbi) return [t(verbi[0]), t(verbi[1])];
  const leggibile = nomeLeggibileAttrezzo(nome);
  return [leggibile, leggibile];
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
  ask_user_question: 'Mette in pausa il giro e chiede alla persona una decisione che non si può ricavare dai file o dal sistema.',
  present_plan: 'In modalità Piano, presenta il piano finito e aspetta la tua scelta: procedere (chiedendo conferma, accettando le modifiche o in una conversazione nuova) o continuare a pianificare.',
  request_plan_mode: 'Chiede di passare alla modalità Piano dal giro successivo. Il cambio avviene solo dopo la conclusione riuscita e il salvataggio della sessione.',
  workflow_plan_propose: 'Propone un workflow a fasi da rivedere e approvare: non lo approva e non lo avvia.',
  workflow_status: 'Legge lo stato dei workflow della sessione o il dettaglio di un run, senza modificarli.',
  process_output: 'Legge una parte del risultato conservato di un comando, senza eseguirlo di nuovo.',
  workflow_output: 'Legge un risultato testuale di un passo concluso; se i risultati sono più di uno, mostra gli ID da scegliere. Per un file binario mostra solo i metadati.',
  workflow_control: 'Chiede di mettere in pausa, riprendere o fermare un workflow della sessione e ne restituisce la ricevuta.',
  ask_parent: 'Un sotto-agente chiede un fatto o una decisione all’agente che lo ha avviato, e aspetta la risposta.',
  answer_parent_question: 'Un sotto-agente risponde a una domanda dell’agente che lo ha avviato.',
  ask_child: 'Manda una domanda a un sotto-agente; la risposta arriva dopo, senza fermare il giro.',
  answer_child_question: 'Risponde a una domanda arrivata da un sotto-agente.',
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
  notes_search: 'Cerca fra le tue note per parole.', // 27/09/2026, decisione owner: le letture delle sezioni
  notes_read: 'Legge per intero una delle tue note.',
  notes_create: 'Scrive una nota per te.',
  notes_update: 'Cambia il titolo o il testo di una nota che esiste già.',
  notes_delete: 'Cancella una tua nota, per sempre.',
  tasks_list: 'Elenca le tue attività, con stato e priorità.',
  tasks_search: 'Cerca fra le tue attività per parole.',
  tasks_create: 'Aggiunge un’attività alla tua lista.',
  tasks_complete: 'Segna un’attività come fatta, o la rimette in corso.',
  tasks_update: 'Cambia titolo, dettaglio o priorità di un’attività che esiste già.',
  tasks_delete: 'Cancella un’attività, per sempre.',
  memory_list: 'Elenca tutto ciò che hai chiesto a TALOS di ricordare.',
  memory_search: 'Cerca fra le cose che hai chiesto a TALOS di ricordare.',
  memory_write: 'Salva una cosa che hai chiesto tu di ricordare per le prossime conversazioni.',
  memory_update: 'Corregge un ricordo che esiste già, invece di aggiungerne un secondo che dice il contrario.',
  memory_delete: 'Fa dimenticare un ricordo, così non viene più usato.',
  research_list: 'Elenca le ricerche approfondite fatte su questo progetto e com’è finita ognuna.',
  research_search: 'Cerca fra le ricerche approfondite di questo progetto per parole.',
  conversation_search: 'Guarda la Board, cerca nelle altre conversazioni e le legge.',
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
