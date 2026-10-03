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
import { t, tn } from './lingua.js';

/* ⛔ Le voci di queste due tabelle sono CHIAVI del dizionario (`varie.tools.name.*`, `varie.tools.description.*`), non frasi:
   le chiavi della mappa (l'id dell'attrezzo) sono il contratto col kernel e NON si toccano; il testo lo dà `t()` nella lingua
   corrente, a ogni uso. Un test di copertura legge questo blocco come testo, perciò restano due tabelle di stringhe. */
export const NOMI_UMANI_ATTREZZI = Object.freeze({
  elenca: 'varie.tools.name.list',
  cerca: 'varie.tools.name.search',
  leggi: 'varie.tools.name.read',
  scrivi: 'varie.tools.name.write',
  // ⛔ BC-59 (owner 17/09): nella riga attività si leggeva «file_edit…». L'attrezzo esiste nel kernel
  //    dal 16/09 (`talosHarness.mjs:2768`) e non era mai entrato qui: un nome tecnico a schermo.
  file_edit: 'varie.tools.name.fileEdit',
  prova: 'varie.tools.name.runTests',
  shell: 'varie.tools.name.shell',
  naviga: 'varie.tools.name.browse',
  web_search: 'varie.tools.name.webSearch',
  artifact_create: 'varie.tools.name.artifactCreate',
  document_create: 'varie.tools.name.documentCreate',
  generate_image: 'varie.tools.name.generateImage',
  delega_sottotask: 'varie.tools.name.delegateSubtask',
  time_now: 'varie.tools.name.timeNow',
  ask_user_question: 'varie.tools.name.askUserQuestion',
  present_plan: 'varie.tools.name.presentPlan', // 24/09/2026, decisione owner 36
  request_plan_mode: 'varie.tools.name.requestPlanMode',
  /* Integrazione 23/09: gli attrezzi di piano e di dialogo fra agenti arrivati col ramo Workflow. */
  workflow_plan_propose: 'varie.tools.name.workflowPlanPropose', // 25/09/2026: non «piano di lavoro», il nome rifiutato dall'owner il 17/09
  workflow_status: 'varie.tools.name.workflowStatus',
  process_output: 'varie.tools.name.processOutput',
  workflow_output: 'varie.tools.name.workflowOutput',
  workflow_control: 'varie.tools.name.workflowControl',
  ask_parent: 'varie.tools.name.askParent',
  answer_parent_question: 'varie.tools.name.answerParentQuestion',
  ask_child: 'varie.tools.name.askChild',
  list_children: 'varie.tools.name.listChildren',
  stop_child: 'varie.tools.name.stopChild',
  answer_child_question: 'varie.tools.name.answerChildQuestion',
  tool_create: 'varie.tools.name.toolCreate',
  library_list: 'varie.tools.name.libraryList',
  library_search: 'varie.tools.name.librarySearch',
  library_read: 'varie.tools.name.libraryRead',
  library_file_origin: 'varie.tools.name.libraryFileOrigin',
  library_rename: 'varie.tools.name.libraryRename',
  library_delete: 'varie.tools.name.libraryDelete',
  library_export: 'varie.tools.name.libraryExport',
  library_context_policy_update: 'varie.tools.name.libraryContextPolicyUpdate',
  notes_list: 'varie.tools.name.notesList',
  notes_search: 'varie.tools.name.notesSearch',
  notes_read: 'varie.tools.name.notesRead',
  notes_create: 'varie.tools.name.notesCreate',
  notes_update: 'varie.tools.name.notesUpdate',
  notes_delete: 'varie.tools.name.notesDelete',
  tasks_list: 'varie.tools.name.tasksList',
  tasks_search: 'varie.tools.name.tasksSearch',
  tasks_create: 'varie.tools.name.tasksCreate',
  tasks_complete: 'varie.tools.name.tasksComplete',
  tasks_update: 'varie.tools.name.tasksUpdate',
  tasks_delete: 'varie.tools.name.tasksDelete',
  memory_list: 'varie.tools.name.memoryList', // 27/09/2026, decisione owner: le letture delle sezioni
  memory_search: 'varie.tools.name.memorySearch',
  memory_write: 'varie.tools.name.memoryWrite',
  memory_update: 'varie.tools.name.memoryUpdate',
  memory_delete: 'varie.tools.name.memoryDelete',
  research_list: 'varie.tools.name.researchList',
  research_search: 'varie.tools.name.researchSearch',
  conversation_search: 'varie.tools.name.conversationSearch',
  research_start: 'varie.tools.name.researchStart',
  research_read: 'varie.tools.name.researchRead',
  research_rename: 'varie.tools.name.researchRename',
  research_pause: 'varie.tools.name.researchPause',
  research_resume: 'varie.tools.name.researchResume',
  research_cancel: 'varie.tools.name.researchCancel',
  research_delete: 'varie.tools.name.researchDelete',
  research_deposit: 'varie.tools.name.researchDeposit', // 12/09: visto «research_deposit…» a schermo nel giro L8 — un nome tecnico in UI viola la regola del 04/09
});

/**
 * Il nome per una persona, o `null` se non lo conosciamo.
 * @param {string} id l'id tecnico, cioè il nome che riceve il modello
 * @param {Record<string,string>} [catalogo] traduzioni per la lingua corrente,
 *   con le stesse chiavi: la mappa resta una, cambiano i valori (decisione H21)
 */
/** Il nome umano nella lingua corrente: la tabella dice la VOCE di dizionario, il testo lo dà t(). `null` se l'id non è in tabella. */
export function nomeUmanoAttrezzo(id, catalogo = null) {
  const chiave = String(id ?? '');
  if (catalogo && Object.prototype.hasOwnProperty.call(catalogo, chiave)) return catalogo[chiave];
  return Object.prototype.hasOwnProperty.call(NOMI_UMANI_ATTREZZI, chiave) ? t(NOMI_UMANI_ATTREZZI[chiave]) : null;
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
  return t(diviso[1] === 'tool' ? 'varie.tools.plugin.originTool' : 'varie.tools.plugin.originHook', { name: nome });
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
 * ⛔ Le parole stanno nel dizionario (`varie.tools.kind.*`): ogni voce è una frase INTERA col suo `{n}`, perché l'ordine delle parole
 *   lo decide la lingua; qui si tiene solo la chiave.
 */
export const SPECIE_ATTREZZI = Object.freeze({
  lettura: Object.freeze({ icona: 'i-eye', uno: 'varie.tools.kind.reading.one', molti: 'varie.tools.kind.reading.many', breve: ['varie.tools.kind.reading.shortOne', 'varie.tools.kind.reading.shortMany'], fallitoUno: 'varie.tools.kind.reading.failedOne', fallitoMolti: 'varie.tools.kind.reading.failedMany', filtro: 'varie.tools.kind.reading.filter' }),
  ricerca: Object.freeze({ icona: 'i-search', uno: 'varie.tools.kind.search.one', molti: 'varie.tools.kind.search.many', breve: ['varie.tools.kind.search.shortOne', 'varie.tools.kind.search.shortMany'], fallitoUno: 'varie.tools.kind.search.failedOne', fallitoMolti: 'varie.tools.kind.search.failedMany', filtro: 'varie.tools.kind.search.filter' }),
  elenco: Object.freeze({ icona: 'i-folder', uno: 'varie.tools.kind.listing.one', molti: 'varie.tools.kind.listing.many', breve: ['varie.tools.kind.listing.shortOne', 'varie.tools.kind.listing.shortMany'], fallitoUno: 'varie.tools.kind.listing.failedOne', fallitoMolti: 'varie.tools.kind.listing.failedMany', filtro: 'varie.tools.kind.listing.filter' }),
  modifica: Object.freeze({ icona: 'i-edit', uno: 'varie.tools.kind.edit.one', molti: 'varie.tools.kind.edit.many', breve: ['varie.tools.kind.edit.shortOne', 'varie.tools.kind.edit.shortMany'], fallitoUno: 'varie.tools.kind.edit.failedOne', fallitoMolti: 'varie.tools.kind.edit.failedMany', filtro: 'varie.tools.kind.edit.filter' }),
  creazione: Object.freeze({ icona: 'i-code', uno: 'varie.tools.kind.creation.one', molti: 'varie.tools.kind.creation.many', breve: ['varie.tools.kind.creation.shortOne', 'varie.tools.kind.creation.shortMany'], fallitoUno: 'varie.tools.kind.creation.failedOne', fallitoMolti: 'varie.tools.kind.creation.failedMany', filtro: 'varie.tools.kind.creation.filter' }),
  scrittura: Object.freeze({ icona: 'i-code', uno: 'varie.tools.kind.writing.one', molti: 'varie.tools.kind.writing.many', breve: ['varie.tools.kind.writing.shortOne', 'varie.tools.kind.writing.shortMany'], fallitoUno: 'varie.tools.kind.writing.failedOne', fallitoMolti: 'varie.tools.kind.writing.failedMany', filtro: 'varie.tools.kind.writing.filter' }),
  comando: Object.freeze({ icona: 'i-terminal', uno: 'varie.tools.kind.command.one', molti: 'varie.tools.kind.command.many', breve: ['varie.tools.kind.command.shortOne', 'varie.tools.kind.command.shortMany'], fallitoUno: 'varie.tools.kind.command.failedOne', fallitoMolti: 'varie.tools.kind.command.failedMany', filtro: 'varie.tools.kind.command.filter' }),
  test: Object.freeze({ icona: 'i-check-sq', uno: 'varie.tools.kind.test.one', molti: 'varie.tools.kind.test.many', breve: ['varie.tools.kind.test.shortOne', 'varie.tools.kind.test.shortMany'], fallitoUno: 'varie.tools.kind.test.failedOne', fallitoMolti: 'varie.tools.kind.test.failedMany', filtro: 'varie.tools.kind.test.filter' }),
  'ricerca-web': Object.freeze({ icona: 'i-globe', uno: 'varie.tools.kind.webSearch.one', molti: 'varie.tools.kind.webSearch.many', breve: ['varie.tools.kind.webSearch.shortOne', 'varie.tools.kind.webSearch.shortMany'], fallitoUno: 'varie.tools.kind.webSearch.failedOne', fallitoMolti: 'varie.tools.kind.webSearch.failedMany', filtro: 'varie.tools.kind.webSearch.filter' }),
  pagina: Object.freeze({ icona: 'i-web', uno: 'varie.tools.kind.page.one', molti: 'varie.tools.kind.page.many', breve: ['varie.tools.kind.page.shortOne', 'varie.tools.kind.page.shortMany'], fallitoUno: 'varie.tools.kind.page.failedOne', fallitoMolti: 'varie.tools.kind.page.failedMany', filtro: 'varie.tools.kind.page.filter' }),
  delega: Object.freeze({ icona: 'i-user', uno: 'varie.tools.kind.delegation.one', molti: 'varie.tools.kind.delegation.many', breve: ['varie.tools.kind.delegation.shortOne', 'varie.tools.kind.delegation.shortMany'], fallitoUno: 'varie.tools.kind.delegation.failedOne', fallitoMolti: 'varie.tools.kind.delegation.failedMany', filtro: 'varie.tools.kind.delegation.filter' }),
});

/** L'ordine fisso delle specie nella riga: chi legge trova sempre le stesse cose nello stesso posto. */
export const ORDINE_SPECIE = Object.freeze(Object.keys(SPECIE_ATTREZZI));

/** Il verbo della voce: al passato (fatto) e al presente (in corso, frase viva del segmento — D11). */
export const VERBI_ATTREZZI = Object.freeze({
  leggi: ['varie.tools.verb.read.past', 'varie.tools.verb.read.present'],
  cerca: ['varie.tools.verb.search.past', 'varie.tools.verb.search.present'],
  elenca: ['varie.tools.verb.list.past', 'varie.tools.verb.list.present'],
  file_edit: ['varie.tools.verb.fileEdit.past', 'varie.tools.verb.fileEdit.present'],
  scrivi: ['varie.tools.verb.write.past', 'varie.tools.verb.write.present'],
  shell: ['varie.tools.verb.shell.past', 'varie.tools.verb.shell.present'],
  prova: ['varie.tools.verb.runTests.past', 'varie.tools.verb.runTests.present'],
  web_search: ['varie.tools.verb.webSearch.past', 'varie.tools.verb.webSearch.present'],
  naviga: ['varie.tools.verb.browse.past', 'varie.tools.verb.browse.present'],
  delega_sottotask: ['varie.tools.verb.delegateSubtask.past', 'varie.tools.verb.delegateSubtask.present'],
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
  return nomeUmanoAttrezzo(nome) || nomeDiRipiegoAttrezzo(nome) || t('varie.tools.fallbackName');
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
    // le frasi sono intere e portano il numero (`{n}`): la forma la sceglie il plurale della lingua
    if (fallito) return tn(s.fallitoUno, s.fallitoMolti, n);
    return breve ? tn(s.breve[0], s.breve[1], n) : tn(s.uno, s.molti, n);
  }
  const nome = nomeLeggibileAttrezzo(String(specie).replace(/^altro:/, ''));
  if (fallito) return n > 1 ? t('varie.tools.other.failedMany', { name: nome, n }) : t('varie.tools.other.failedOne', { name: nome });
  return n > 1 ? t('varie.tools.other.many', { name: nome, n }) : nome;
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
 * C10 — LA DESCRIZIONE NOSTRA, NELLA LINGUA DELL'INTERFACCIA (italiano e inglese).
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
  elenca: 'varie.tools.description.list',
  cerca: 'varie.tools.description.search',
  leggi: 'varie.tools.description.read',
  scrivi: 'varie.tools.description.write',
  // ⛔ BC-59 — la differenza con `scrivi` è la sola cosa che conta per chi legge: questo cambia un
  //    pezzo e lascia il resto com'è. Se il pezzo non si trova, o si trova due volte, non scrive niente.
  file_edit: 'varie.tools.description.fileEdit',
  prova: 'varie.tools.description.runTests',
  shell: 'varie.tools.description.shell',
  naviga: 'varie.tools.description.browse',
  web_search: 'varie.tools.description.webSearch',
  artifact_create: 'varie.tools.description.artifactCreate',
  document_create: 'varie.tools.description.documentCreate',
  time_now: 'varie.tools.description.timeNow',
  ask_user_question: 'varie.tools.description.askUserQuestion',
  present_plan: 'varie.tools.description.presentPlan',
  request_plan_mode: 'varie.tools.description.requestPlanMode',
  workflow_plan_propose: 'varie.tools.description.workflowPlanPropose',
  workflow_status: 'varie.tools.description.workflowStatus',
  process_output: 'varie.tools.description.processOutput',
  workflow_output: 'varie.tools.description.workflowOutput',
  workflow_control: 'varie.tools.description.workflowControl',
  ask_parent: 'varie.tools.description.askParent',
  answer_parent_question: 'varie.tools.description.answerParentQuestion',
  ask_child: 'varie.tools.description.askChild',
  list_children: 'varie.tools.description.listChildren',
  stop_child: 'varie.tools.description.stopChild',
  answer_child_question: 'varie.tools.description.answerChildQuestion',
  delega_sottotask: 'varie.tools.description.delegateSubtask',
  generate_image: 'varie.tools.description.generateImage',
  library_list: 'varie.tools.description.libraryList',
  library_search: 'varie.tools.description.librarySearch',
  library_read: 'varie.tools.description.libraryRead',
  library_file_origin: 'varie.tools.description.libraryFileOrigin',
  library_rename: 'varie.tools.description.libraryRename',
  library_delete: 'varie.tools.description.libraryDelete',
  library_export: 'varie.tools.description.libraryExport',
  library_context_policy_update: 'varie.tools.description.libraryContextPolicyUpdate',
  notes_list: 'varie.tools.description.notesList',
  notes_search: 'varie.tools.description.notesSearch', // 27/09/2026, decisione owner: le letture delle sezioni
  notes_read: 'varie.tools.description.notesRead',
  notes_create: 'varie.tools.description.notesCreate',
  notes_update: 'varie.tools.description.notesUpdate',
  notes_delete: 'varie.tools.description.notesDelete',
  tasks_list: 'varie.tools.description.tasksList',
  tasks_search: 'varie.tools.description.tasksSearch',
  tasks_create: 'varie.tools.description.tasksCreate',
  tasks_complete: 'varie.tools.description.tasksComplete',
  tasks_update: 'varie.tools.description.tasksUpdate',
  tasks_delete: 'varie.tools.description.tasksDelete',
  memory_list: 'varie.tools.description.memoryList',
  memory_search: 'varie.tools.description.memorySearch',
  memory_write: 'varie.tools.description.memoryWrite',
  memory_update: 'varie.tools.description.memoryUpdate',
  memory_delete: 'varie.tools.description.memoryDelete',
  research_list: 'varie.tools.description.researchList',
  research_search: 'varie.tools.description.researchSearch',
  conversation_search: 'varie.tools.description.conversationSearch',
  research_start: 'varie.tools.description.researchStart',
  research_read: 'varie.tools.description.researchRead',
  research_rename: 'varie.tools.description.researchRename',
  research_pause: 'varie.tools.description.researchPause',
  research_resume: 'varie.tools.description.researchResume',
  research_cancel: 'varie.tools.description.researchCancel',
  research_delete: 'varie.tools.description.researchDelete',
  research_deposit: 'varie.tools.description.researchDeposit',
  tool_create: 'varie.tools.description.toolCreate',
});

/**
 * La descrizione nostra di un attrezzo, o `null` se non l'abbiamo scritta.
 * ⛔ `null` NON si sostituisce con l'inglese qui dentro: chi disegna deve poter
 * dire «questo è il testo del kernel», e non può se le due cose si confondono.
 */
export function descrizioneAttrezzo(id) {
  const chiave = String(id ?? '');
  return Object.prototype.hasOwnProperty.call(DESCRIZIONI_ATTREZZI, chiave) ? t(DESCRIZIONI_ATTREZZI[chiave]) : null;
}

/** Gli id senza una descrizione nostra: il debito di C10, misurato invece che dichiarato chiuso. */
export function attrezziSenzaDescrizione(ids) {
  return [...new Set(ids || [])].filter((id) => descrizioneAttrezzo(id) === null);
}
