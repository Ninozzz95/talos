import { createHash } from 'node:crypto';

const diagnostics = new Map();
export const MESSAGES = Object.freeze({
  CONFIG_INVALID: { title: 'Configuration not ready', explanation: 'Part of the configuration needed to complete this operation is missing.', action: 'Open Doctor and follow the checks listed, then try again.' },
  TASK_CATALOG_UNAVAILABLE: { title: 'Task list unavailable', explanation: 'The service that provides the tasks is not connected yet.', action: 'Check Doctor or set up the tasks service, then try again.' },
  RUNTIME_NOT_AVAILABLE: { title: 'Local service unavailable', explanation: 'No local service ready could be found.', action: 'Open Doctor to see what is missing, or choose an online service.' },
  WORKFLOW_STORE_UNAVAILABLE: { title: 'Workflow unavailable', explanation: 'The Workflow registry is not set up on this server.', action: 'Set up the Workflow store and restart TALOS.' },
  WORKFLOW_PROPOSAL_NOT_FOUND: { title: 'Workflow plan not found', explanation: 'This proposal does not belong to an available session or no longer exists.', action: 'Reopen the session and choose a verifiable proposal.' },
  WORKFLOW_DEFINITION_HASH_MISMATCH: { title: 'Workflow plan changed', explanation: 'The fingerprint to approve does not match the saved proposal.', action: 'Reload the proposal, read it and approve its current fingerprint.' },
  WORKFLOW_COMMAND_CONFLICT: { title: 'Workflow command already used', explanation: 'This identifier is already tied to a different command.', action: 'Re-read the receipt before creating a new command.' },
  WORKFLOW_APPROVAL_CONFLICT: { title: 'Workflow plan already approved', explanation: 'A different approval has already been recorded for this version.', action: 'Reload the proposal to see the approved state.' },
  WORKFLOW_STORE_NEEDS_ATTENTION: { title: 'Workflow store needs checking', explanation: 'The approval cannot be confirmed with a durable receipt.', action: 'Do not blindly repeat the command; keep the evidence and check the store.' },
  WORKFLOW_APPROVAL_ORIGIN_FORBIDDEN: { title: 'Workflow approval blocked', explanation: 'The request comes from a window other than TALOS.', action: 'Go back to the proposal open in TALOS and confirm from there.' },
  // F3-51c (25/09/2026): Avvia e i controlli del run (Pausa, Riprendi, Annulla, Riprova).
  WORKFLOW_RUNTIME_NOT_READY: { title: 'Start not available yet', explanation: 'The Workflow engine is not ready on this server: nothing was started or changed.', action: 'Open Doctor to see what is missing, then try again.' },
  WORKFLOW_RUN_STATE_CONFLICT: { title: 'Command not applicable now', explanation: 'The Workflow is not in the right state for this command: nothing was changed.', action: 'Reload the Workflow and choose among the commands available right now.' },
  WORKFLOW_DEFINITION_NOT_APPROVED: { title: 'Workflow not approved', explanation: 'Only the approved version of a Workflow can be started.', action: 'Read the proposal and approve it, then start it.' },
  WORKFLOW_START_UNSUPPORTED: { title: 'Workflow cannot start here', explanation: 'Some steps cannot be run on this server yet, or would write to the project: nothing was started.', action: 'Ask for a proposal with read-only steps only.' },
  WORKFLOW_COMMAND_ORIGIN_FORBIDDEN: { title: 'Workflow command blocked', explanation: 'The request comes from a window other than TALOS.', action: 'Go back to the Workflow open in TALOS and try again from there.' },
  // 23/09/2026: la risposta a una domanda si conferma solo dopo il salvataggio (riparazione Ask D2).
  QUESTION_ANSWER_NOT_SAVED: { title: 'Answer not saved', explanation: 'TALOS could not save your answer to disk, so the question was closed without using it.', action: 'Check the data folder space in Doctor and answer again when TALOS asks you.' },
  // 24/09/2026, decisioni owner 36-39: la scelta sul piano approvabile.
  PLAN_NOT_PENDING: { title: 'Plan already decided', explanation: 'The session has moved on: this plan no longer waits for a choice.', action: 'Reload the session and look at the plan you see now, if there is one.' },
  PLAN_STALE: { title: 'Plan updated', explanation: 'TALOS presented a newer version of the plan: your choice applied to the old one.', action: 'Read the updated plan and choose on that one.' },
  PLAN_DECISION_NOT_SAVED: { title: 'Choice not saved', explanation: 'TALOS could not save your choice to disk: the plan is still waiting.', action: 'Check the data folder space in Doctor and choose again.' },
  PLAN_APPROVAL_ORIGIN_FORBIDDEN: { title: 'Plan choice blocked', explanation: 'The request comes from a window other than TALOS.', action: 'Go back to the plan open in TALOS and choose from there.' },
  // 23/09/2026 (F3-10): un solo selettore Normale / Piano.
  MODE_WORKFLOW_RETIRED: { title: 'Mode no longer available', explanation: 'Workflow mode has been removed: you now work in Normal or Plan, and Workflow is a tool the model uses when needed.', action: 'Choose Normal or Plan and try again.' },
  RUNTIME_UNREACHABLE: { title: 'Local service unreachable', explanation: 'The local service did not respond.', action: 'Check in Doctor that it is running and try again.' },
  PATH_NOT_ALLOWED: { title: 'Path not allowed', explanation: 'The chosen path is outside the authorized area.', action: 'Choose a folder inside the open project.' },
  PROCESS_POLICY_REJECTED: { title: 'Operation blocked for safety', explanation: 'The requested command is not covered by the current permissions.', action: 'Check the session permission and try again only if you recognize the command.' },
  /*
   * ⛔ 07/9, O-49 — senza una voce qui la busta portava la copia di INTERNAL_ERROR:
   * «Si è verificato un problema imprevisto» e «Apri Doctor». Falso due volte: non è
   * imprevisto, ed è l’unica cosa che Doctor non può spiegare. La scheda del permesso
   * è semplicemente vecchia — si ricarica la sessione e si guarda cosa chiede adesso.
   */
  APPROVAL_NOT_PENDING: { title: 'Permission request expired', explanation: 'The session has moved on: that question no longer waits for an answer.', action: 'Reload the session and answer the request you see now, if there is one.' },
  APPROVAL_ANSWER_FORBIDDEN: { title: 'Answer not allowed from here', explanation: 'This permission request belongs to an agent that this session did not start.', action: 'Open the session that started the agent, or the agent itself, and answer from there.' },
  // C2-Q (08/10/2026): the same rule for a child's question to the person
  QUESTION_ANSWER_FORBIDDEN: { title: 'Answer not allowed from here', explanation: 'This question belongs to an agent that this session did not start.', action: 'Open the session that started the agent, or the agent itself, and answer from there.' },
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
  SESSION_NOT_READY: { title: 'Session not ready', explanation: 'This session cannot accept the requested action in its current state.', action: 'If it was interrupted by a restart, start a new session: the conversation stays readable here.' },
  SESSION_STORE_WRITE_FAILED: { title: 'History save failed', explanation: 'The summary was not confirmed because the new history was not saved. The original messages remain available.', action: 'Try compacting again. If the problem persists, use the diagnostic reference in Doctor.' },
  /*
   * ⛔ 23/09/2026, EXFAT — il testo diceva «Controlla spazio e permessi» per OGNI guasto della
   * testata, anche su una chiavetta exFAT dove `fs.link` fallisce con EISDIR (nodejs/node#65817,
   * «EISDIR actively misleads»): la causa indicata era falsa. Il codice generico non conosce la
   * causa, quindi non ne afferma nessuna; il disco senza collegamenti ha il suo codice qui sotto.
   */
  SESSION_STORE_HEADER_FAILED: { title: 'Session not started', explanation: 'The new session was not started because its initial file was not created and verified in the sessions folder.', action: 'Try again. If the problem persists, the server log gives the cause detected from the disk: use the diagnostic reference in Doctor.' },
  SESSION_STORE_FS_UNSUPPORTED: { title: 'Disk not suitable for sessions', explanation: 'The new session was not started because the file system of the disk holding the sessions folder does not support the safe file creation TALOS uses.', action: 'Move the TALOS data folder to an internal NTFS-formatted disk, then try again.' },
  SESSION_STORE_DELETE_FAILED: { title: 'Session deletion failed', explanation: 'The session was not deleted and remains available.', action: 'Check the storage space and permissions, then try again. If the problem persists, use the diagnostic reference in Doctor.' },
  SESSION_STORE_AMBIGUOUS: { title: 'Save state needs checking', explanation: 'The outcome of the save is uncertain: we do not know which part of the history was saved.', action: 'Do not retry compaction in this session. Keep the diagnostic reference and check the log with Doctor.' },
  /*
   * ⛔⛔ 12/09, L5 — LA STESSA VORAGINE DI O-49, e per questo sono qui il giorno stesso in cui
   * nascono i codici. Senza una voce in questa mappa una risposta cade sulla copia di
   * INTERNAL_ERROR, e a schermo una ricerca cancellata dieci secondi fa diventa «Si è verificato
   * un problema imprevisto · Apri Doctor, copia il riferimento»: falso due volte — non è
   * imprevisto, ed è l'unica cosa che Doctor non può spiegare. Misurato interrogando la rotta
   * vera prima di scrivere queste righe, non dedotto.
   * ⛔ Nessuna di queste è un guasto: sono tre no diversi, e ognuna dice COSA FARE.
   */
  RESEARCH_NOT_FOUND: { title: 'Research not found', explanation: 'This deep research is no longer in the project: it may have been deleted.', action: 'Go back to the list of researches: it shows the ones that exist now.' },
  RESEARCH_CONFLICT: { title: 'Action not possible now', explanation: 'This research is not in the state the action requires — for example it is already stopped, or already finished.', action: 'Reopen the research card: it says how it is right now.' },
  ELICITATION_NOT_PENDING: { title: 'Request already closed', explanation: 'The server no longer waits for this answer: it was given from another window, or the session stopped.', action: 'Look at the card in the chat: it says how it ended.' },
  ELICITATION_ANSWER_INVALID: { title: 'Invalid answer', explanation: 'What you wrote does not match what the server asked.', action: 'Check the fields of the card and send again.' },
  PROCESS_NOT_RUNNING: { title: 'Command already finished', explanation: 'This command is no longer running: it finished on its own, or someone already stopped it.', action: 'Look at the row in the Processes tab: it says how it ended.' },
  RESEARCH_RECHECK_UNAVAILABLE: { title: 'Source check not possible', explanation: 'To recheck the sources a report with the cited passages is needed, and this research has none.', action: 'New researches have it: this one can be redone, or left as it is.' },
  RESEARCH_INVALID: { title: 'Invalid request', explanation: 'The research identifier does not have an allowed form.', action: 'Open the research from the list instead of typing the address by hand.' },
  INTERNAL_ERROR: { title: 'Operation failed', explanation: 'An unexpected problem occurred during the operation.', action: 'Open Doctor, copy the reference and try again.' },
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

/**
 * I valori che una frase pubblica contiene (un nome, un numero), per l'interfaccia che la dice nella sua lingua (decisione
 * owner 03/10/2026, «L'interfaccia, dal codice»): un oggetto piatto di testi e numeri, coi nomi dei segnaposto del dizionario.
 * Il `message` inglese li contiene già. Torna `null` se l'errore non ne porta: mai un oggetto vuoto, mai valori annidati.
 * ⛔ Passano SOLO testi e numeri, e solo quelli che l'errore dichiara in `params`: niente che non sia stato scelto per la persona.
 */
export function paramsPubblici(error) {
  const grezzi = error?.params;
  if (!grezzi || typeof grezzi !== 'object' || Array.isArray(grezzi)) return null;
  const fuori = {};
  for (const [nome, valore] of Object.entries(grezzi)) {
    if (/^[a-zA-Z0-9_]+$/u.test(nome) && (typeof valore === 'string' || (typeof valore === 'number' && Number.isFinite(valore)))) fuori[nome] = valore;
  }
  return Object.keys(fuori).length > 0 ? fuori : null;
}

export function toPublicProblem(error, { requestId = '', operation = '' } = {}) {
  const code = safeCode(error);
  const copy = MESSAGES[code] ?? MESSAGES.INTERNAL_ERROR;
  const doctorReference = referenceFor(code, requestId, operation);
  diagnostics.set(doctorReference, Object.freeze({ code, operation: String(operation || 'operation'), requestId: String(requestId || ''), detail: safeDiagnosticDetail(error) }));
  const vero = MESSAGGIO_GIA_PER_LA_PERSONA.has(code) ? messaggioPubblicabile(error?.message) : '';
  const params = paramsPubblici(error);
  return { title: copy.title, explanation: vero || copy.explanation, action: copy.action, doctorReference, ...(params ? { params } : {}) };
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
