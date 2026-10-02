import { createHash } from 'node:crypto';

const diagnostics = new Map();
const MESSAGES = Object.freeze({
  CONFIG_INVALID: { title: 'Configurazione non pronta', explanation: 'Manca una parte della configurazione necessaria per completare questa operazione.', action: 'Apri Doctor e segui i controlli indicati, poi riprova.' },
  TASK_CATALOG_UNAVAILABLE: { title: 'Elenco attività non disponibile', explanation: 'Il servizio che fornisce le attività non è ancora collegato.', action: 'Controlla Doctor o configura il servizio delle attività, poi riprova.' },
  RUNTIME_NOT_AVAILABLE: { title: 'Servizio locale non disponibile', explanation: 'Non è stato possibile trovare un servizio locale pronto.', action: 'Apri Doctor per vedere cosa manca oppure scegli un servizio online.' },
  WORKFLOW_STORE_UNAVAILABLE: { title: 'Workflow non disponibile', explanation: 'Il registro Workflow non è configurato su questo server.', action: 'Configura l’archivio Workflow e riavvia TALOS.' },
  WORKFLOW_PROPOSAL_NOT_FOUND: { title: 'Piano Workflow non trovato', explanation: 'Questa proposta non appartiene a una sessione disponibile o non esiste più.', action: 'Riapri la sessione e scegli una proposta verificabile.' },
  WORKFLOW_DEFINITION_HASH_MISMATCH: { title: 'Piano Workflow cambiato', explanation: 'L’impronta da approvare non coincide con la proposta salvata.', action: 'Ricarica la proposta, leggila e approva la sua impronta attuale.' },
  WORKFLOW_COMMAND_CONFLICT: { title: 'Comando Workflow già usato', explanation: 'Questo identificativo è già associato a un comando diverso.', action: 'Rileggi la ricevuta prima di creare un nuovo comando.' },
  WORKFLOW_APPROVAL_CONFLICT: { title: 'Piano Workflow già approvato', explanation: 'Una diversa approvazione è già stata registrata per questa versione.', action: 'Ricarica la proposta per vedere lo stato approvato.' },
  WORKFLOW_STORE_NEEDS_ATTENTION: { title: 'Archivio Workflow da verificare', explanation: 'L’approvazione non può essere confermata con una ricevuta durevole.', action: 'Non ripetere alla cieca il comando; conserva l’evidenza e verifica l’archivio.' },
  WORKFLOW_APPROVAL_ORIGIN_FORBIDDEN: { title: 'Approvazione Workflow bloccata', explanation: 'La richiesta proviene da una finestra diversa da TALOS.', action: 'Torna alla proposta aperta in TALOS e conferma da lì.' },
  // F3-51c (25/09/2026): Avvia e i controlli del run (Pausa, Riprendi, Annulla, Riprova).
  WORKFLOW_RUNTIME_NOT_READY: { title: 'Avvio non ancora disponibile', explanation: 'Il motore dei Workflow non è pronto su questo server: niente è stato avviato né cambiato.', action: 'Apri Doctor per vedere cosa manca, poi riprova.' },
  WORKFLOW_RUN_STATE_CONFLICT: { title: 'Comando non applicabile ora', explanation: 'Il Workflow non è nello stato giusto per questo comando: niente è stato cambiato.', action: 'Ricarica il Workflow e scegli fra i comandi disponibili adesso.' },
  WORKFLOW_DEFINITION_NOT_APPROVED: { title: 'Workflow non approvato', explanation: 'Si può avviare solo la versione approvata di un Workflow.', action: 'Leggi la proposta e approvala, poi avviala.' },
  WORKFLOW_START_UNSUPPORTED: { title: 'Workflow non avviabile qui', explanation: 'Alcuni passi non si possono ancora eseguire su questo server, o scriverebbero nel progetto: niente è stato avviato.', action: 'Chiedi una proposta con soli passi in sola lettura.' },
  WORKFLOW_COMMAND_ORIGIN_FORBIDDEN: { title: 'Comando Workflow bloccato', explanation: 'La richiesta proviene da una finestra diversa da TALOS.', action: 'Torna al Workflow aperto in TALOS e riprova da lì.' },
  // 23/09/2026: la risposta a una domanda si conferma solo dopo il salvataggio (riparazione Ask D2).
  QUESTION_ANSWER_NOT_SAVED: { title: 'Risposta non salvata', explanation: 'TALOS non è riuscito a salvare la tua risposta sul disco, quindi la domanda è stata chiusa senza usarla.', action: 'Controlla lo spazio della cartella dati in Doctor e rispondi di nuovo quando TALOS te lo richiede.' },
  // 24/09/2026, decisioni owner 36-39: la scelta sul piano approvabile.
  PLAN_NOT_PENDING: { title: 'Piano già deciso', explanation: 'La sessione è andata avanti: questo piano non aspetta più una scelta.', action: 'Ricarica la sessione e guarda il piano che vedi adesso, se ce n’è uno.' },
  PLAN_STALE: { title: 'Piano aggiornato', explanation: 'TALOS ha presentato una versione più nuova del piano: la scelta valeva per quella vecchia.', action: 'Leggi il piano aggiornato e scegli su quello.' },
  PLAN_DECISION_NOT_SAVED: { title: 'Scelta non salvata', explanation: 'TALOS non è riuscito a salvare la tua scelta sul disco: il piano aspetta ancora.', action: 'Controlla lo spazio della cartella dati in Doctor e scegli di nuovo.' },
  PLAN_APPROVAL_ORIGIN_FORBIDDEN: { title: 'Scelta sul piano bloccata', explanation: 'La richiesta proviene da una finestra diversa da TALOS.', action: 'Torna al piano aperto in TALOS e scegli da lì.' },
  // 23/09/2026 (F3-10): un solo selettore Normale / Piano.
  MODE_WORKFLOW_RETIRED: { title: 'Modalità non più disponibile', explanation: 'La modalità Workflow è stata tolta: ora si lavora in Normale o in Piano, e il Workflow è uno strumento che il modello usa quando serve.', action: 'Scegli Normale o Piano e riprova.' },
  RUNTIME_UNREACHABLE: { title: 'Servizio locale non raggiungibile', explanation: 'Il servizio locale non ha risposto.', action: 'Controlla che sia avviato in Doctor e riprova.' },
  PATH_NOT_ALLOWED: { title: 'Percorso non consentito', explanation: 'Il percorso scelto è fuori dall’area autorizzata.', action: 'Scegli una cartella dentro il progetto aperto.' },
  PROCESS_POLICY_REJECTED: { title: 'Operazione bloccata per sicurezza', explanation: 'Il comando richiesto non rientra nelle autorizzazioni correnti.', action: 'Controlla il permesso della sessione e riprova solo se riconosci il comando.' },
  /*
   * ⛔ 07/9, O-49 — senza una voce qui la busta portava la copia di INTERNAL_ERROR:
   * «Si è verificato un problema imprevisto» e «Apri Doctor». Falso due volte: non è
   * imprevisto, ed è l’unica cosa che Doctor non può spiegare. La scheda del permesso
   * è semplicemente vecchia — si ricarica la sessione e si guarda cosa chiede adesso.
   */
  APPROVAL_NOT_PENDING: { title: 'Richiesta di permesso scaduta', explanation: 'La sessione è andata avanti: quella domanda non aspetta più una risposta.', action: 'Ricarica la sessione e rispondi alla richiesta che vedi adesso, se ce n’è una.' },
  /*
   * ⛔⛔ 07/9, owner bloccato: «la sessione e ancora bloccata, non riesco a inviare messaggi e
   * spunta errore toast». `SESSION_NOT_READY` NON era in questa mappa, quindi cadeva su
   * INTERNAL_ERROR e a schermo arrivava «Si e verificato un problema imprevisto» — mentre il
   * registro aveva gia scritto la frase giusta e AZIONABILE: «Questa sessione e stata interrotta
   * da un riavvio del server e non puo essere ripresa: avvia una sessione nuova».
   * ⇒ Il codice piu utile della mappa e quello che dice COSA FARE. Qui la spiegazione generica
   *   resta come rete, ma il motivo VERO del registro passa in `explanation` (vedi `problemFor`):
   *   una porta chiusa senza indicazione di dove sia quella aperta e il modo migliore per bloccare
   *   una persona su una schermata.
   */
  SESSION_NOT_READY: { title: 'Sessione non pronta', explanation: 'Questa sessione non puo accettare l’azione richiesta nello stato in cui si trova.', action: 'Se e stata interrotta da un riavvio, avvia una sessione nuova: la conversazione resta leggibile qui.' },
  SESSION_STORE_WRITE_FAILED: { title: 'Salvataggio della cronologia non riuscito', explanation: 'Il riassunto non è stato confermato perché la nuova cronologia non è stata salvata. I messaggi originali restano disponibili.', action: 'Riprova la compattazione. Se il problema persiste, usa il riferimento diagnostico in Doctor.' },
  /*
   * ⛔ 23/09/2026, EXFAT — il testo diceva «Controlla spazio e permessi» per OGNI guasto della
   * testata, anche su una chiavetta exFAT dove `fs.link` fallisce con EISDIR (nodejs/node#65817,
   * «EISDIR actively misleads»): la causa indicata era falsa. Il codice generico non conosce la
   * causa, quindi non ne afferma nessuna; il disco senza collegamenti ha il suo codice qui sotto.
   */
  SESSION_STORE_HEADER_FAILED: { title: 'Sessione non avviata', explanation: 'La nuova sessione non è stata avviata perché il suo file iniziale non è stato creato e verificato nella cartella delle sessioni.', action: 'Riprova. Se il problema persiste, il registro del server indica la causa rilevata dal disco: usa il riferimento diagnostico in Doctor.' },
  SESSION_STORE_FS_UNSUPPORTED: { title: 'Disco non adatto alle sessioni', explanation: 'La nuova sessione non è stata avviata perché il file system del disco che contiene la cartella delle sessioni non supporta la creazione sicura dei file che TALOS usa.', action: 'Sposta la cartella dati di TALOS su un disco interno formattato NTFS, poi riprova.' },
  SESSION_STORE_DELETE_FAILED: { title: 'Eliminazione della sessione non riuscita', explanation: 'La sessione non è stata eliminata e resta disponibile.', action: 'Controlla lo spazio e i permessi di archiviazione, poi riprova. Se il problema persiste, usa il riferimento diagnostico in Doctor.' },
  SESSION_STORE_AMBIGUOUS: { title: 'Stato del salvataggio da verificare', explanation: 'L’esito del salvataggio è incerto: non sappiamo quale parte della cronologia sia stata salvata.', action: 'Non riprovare la compattazione in questa sessione. Conserva il riferimento diagnostico e verifica il registro con Doctor.' },
  /*
   * ⛔⛔ 12/09, L5 — LA STESSA VORAGINE DI O-49, e per questo sono qui il giorno stesso in cui
   * nascono i codici. Senza una voce in questa mappa una risposta cade sulla copia di
   * INTERNAL_ERROR, e a schermo una ricerca cancellata dieci secondi fa diventa «Si è verificato
   * un problema imprevisto · Apri Doctor, copia il riferimento»: falso due volte — non è
   * imprevisto, ed è l'unica cosa che Doctor non può spiegare. Misurato interrogando la rotta
   * vera prima di scrivere queste righe, non dedotto.
   * ⛔ Nessuna di queste è un guasto: sono tre no diversi, e ognuna dice COSA FARE.
   */
  RESEARCH_NOT_FOUND: { title: 'Ricerca non trovata', explanation: 'Questa ricerca approfondita non è più nel progetto: può essere stata eliminata.', action: 'Torna all’elenco delle ricerche: mostra quelle che ci sono adesso.' },
  RESEARCH_CONFLICT: { title: 'Azione non possibile adesso', explanation: 'Questa ricerca non è nello stato che l’azione richiede — per esempio è già ferma, o è già finita.', action: 'Riapri la scheda della ricerca: dice come sta in questo momento.' },
  ELICITATION_NOT_PENDING: { title: 'Richiesta già chiusa', explanation: 'Il server non aspetta più questa risposta: è stata data da un’altra finestra, o la sessione si è fermata.', action: 'Guarda la scheda nella chat: dice com’è finita.' },
  ELICITATION_ANSWER_INVALID: { title: 'Risposta non valida', explanation: 'Quello che hai scritto non corrisponde a ciò che il server ha chiesto.', action: 'Controlla i campi della scheda e invia di nuovo.' },
  PROCESS_NOT_RUNNING: { title: 'Comando già finito', explanation: 'Questo comando non è più in corso: è finito da solo, o qualcuno l’ha già fermato.', action: 'Guarda la riga nella scheda Processi: dice come è finito.' },
  RESEARCH_RECHECK_UNAVAILABLE: { title: 'Controllo delle fonti non possibile', explanation: 'Per ricontrollare le fonti serve un rapporto con i passaggi citati, e questa ricerca non ne ha.', action: 'Le ricerche nuove lo portano: questa si può rifare, oppure lasciarla com’è.' },
  RESEARCH_INVALID: { title: 'Richiesta non valida', explanation: 'L’identificativo della ricerca non ha una forma ammessa.', action: 'Apri la ricerca dall’elenco invece di comporre l’indirizzo a mano.' },
  INTERNAL_ERROR: { title: 'Operazione non riuscita', explanation: 'Si è verificato un problema imprevisto durante l’operazione.', action: 'Apri Doctor, copia il riferimento e riprova.' },
});

function safeCode(error) {
  return typeof error?.code === 'string' && /^[A-Z0-9_]+$/u.test(error.code) ? error.code : 'INTERNAL_ERROR';
}

function referenceFor(code, requestId, operation) {
  return `doctor-${createHash('sha256').update(`${code}|${requestId || ''}|${operation || ''}`).digest('hex').slice(0, 12)}`;
}

function safeDiagnosticDetail(error) {
  if (typeof error?.message !== 'string') return '';
  return error.message
    .replace(/\b(?:sk|pk)-[A-Za-z0-9_-]+\b/giu, '[redacted]')
    .replace(/\bsecret\b/giu, '[redacted]')
    .replace(/\bTALOS_[A-Z0-9_]+\b/gu, '[setting]')
    .replace(/\b[A-Za-z]:\\[^\r\n;]+/gu, '[path]')
    .replace(/\/(?:Users|home|tmp|var|data)\/[^\r\n; ]+/giu, '[path]')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 240);
}

/*
 * ⛔⛔ 07/9 — I codici il cui `message` e GIA scritto per una persona, e non per un log.
 * Il registro, per una sessione che non puo ripartire, dice: «Questa sessione e stata interrotta da
 * un riavvio del server e non puo essere ripresa: avvia una sessione nuova» — una frase che dice
 * cosa e successo E cosa fare. Quella frase veniva BUTTATA e sostituita con «Si e verificato un
 * problema imprevisto», e l'owner e rimasto bloccato su una schermata senza sapere dove fosse
 * l'uscita.
 * ⛔ La sostituzione generica esiste per una ragione buona — un messaggio d'errore grezzo puo
 *   portare percorsi, id, dettagli interni — e resta il comportamento predefinito. Qui si dichiara
 *   la sola eccezione: i codici dove chi ha scritto il messaggio lo ha scritto PER lo schermo.
 *   Aggiungerne uno vuol dire prendersi la responsabilita che quel testo sia leggibile e privo di
 *   dettagli interni: si guarda ogni `erroreAvvio` di quel codice prima di metterlo qui.
 */
const MESSAGGIO_GIA_PER_LA_PERSONA = new Set(['SESSION_NOT_READY']);

/** Un testo del registro e pubblicabile solo se e corto e non porta percorsi o identificatori. */
function messaggioPubblicabile(testo) {
  const t = String(testo || '').trim();
  if (t.length < 12 || t.length > 240) return '';
  if (/[\/]{1}[\w.-]+[\/]|[0-9a-f]{8}-[0-9a-f]{4}/i.test(t)) return ''; // percorsi o id: restano nel log
  return t;
}

export function toPublicProblem(error, { requestId = '', operation = '' } = {}) {
  const code = safeCode(error);
  const copy = MESSAGES[code] ?? MESSAGES.INTERNAL_ERROR;
  const doctorReference = referenceFor(code, requestId, operation);
  diagnostics.set(doctorReference, Object.freeze({ code, operation: String(operation || 'operation'), requestId: String(requestId || ''), detail: safeDiagnosticDetail(error) }));
  const vero = MESSAGGIO_GIA_PER_LA_PERSONA.has(code) ? messaggioPubblicabile(error?.message) : '';
  return { title: copy.title, explanation: vero || copy.explanation, action: copy.action, doctorReference };
}

export function logDiagnosticProblem(error, { requestId = '', operation = '', logger = console } = {}) {
  const publicProblem = toPublicProblem(error, { requestId, operation });
  const code = safeCode(error);
  try { logger?.warn?.(`[${publicProblem.doctorReference}] ${operation || 'operation'} (${code})`); } catch { /* un logger guasto non cambia l’esito dell’operazione */ }
  return publicProblem.doctorReference;
}

export function getDiagnosticProblem(reference) {
  const detail = diagnostics.get(reference);
  return detail ? { ...detail } : null;
}
