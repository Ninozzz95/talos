/*
 * ⛔⛔⛔ I RIFIUTI DEL REGISTRO DELLE SESSIONI: UN CODICE, UN MOTIVO, UNA FRASE INGLESE, E L'ITALIANO NEL DIZIONARIO (corsia K2,
 *   owner 03/10/2026: «ogni singola parola nella app deve essere sia in inglese che in italiano»; decisione «L'interfaccia, dal
 *   codice»). Google AIP-193 «Errors» (google.aip.dev/193, letta il 03/10/2026): la coppia (dominio, reason) è l'identità
 *   stabile dell'errore, i valori viaggiano a parte.
 *
 * Questa prova tiene INSIEME le tre metà del contratto:
 *   · il REGISTRO (`session-registry.mjs`): ogni `rifiuto(code, reason, inglese)` che scrive nel sorgente;
 *   · il DIZIONARIO (`frontend/src/i18n/testi/errori.js`): per ogni (code, reason) la voce `errori.<CODICE>.<motivo_con_trattini_bassi>`
 *     con LO STESSO inglese e un italiano che è la frase di prima, parola per parola;
 *   · il RISOLUTORE (`testoErroreServer`): dato il rifiuto, dice la frase nella lingua della persona.
 * ⛔ Se l'inglese cambiasse da una parte sola, `testoErroreServer` non riconoscerebbe più la frase e la persona leggerebbe
 *   l'inglese del server dentro un'interfaccia italiana: nessun errore, nessun rosso. Ogni controllo si prova anche AL CONTRARIO.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { AREE, TESTI } from '../frontend/src/i18n/testi/index.js';
import { impostaLingua } from '../frontend/src/components/lingua.js';
import { testoErroreServer } from '../frontend/src/components/errori.js';
import { eFraseItaliana } from '../frontend/scripts/cancello/testi-a-schermo.mjs';

/*
 * LA TABELLA «frase italiana di prima → code + reason + frase inglese». È anche il documento che va alla CLI: l'italiano è
 * ESATTAMENTE quello che il registro diceva prima di K2 (le tre voci in `NUOVE` non avevano un italiano: erano già inglesi).
 */
const TABELLA = [
  ['MODE_WORKFLOW_RETIRED', 'workflow-mode-retired', 'La modalità Workflow non esiste più: scegli Normale o Piano', 'Workflow mode no longer exists: choose Normal or Plan'],
  ['QUERY_INVALID', 'operating-mode-unknown', 'Modalità operativa non riconosciuta', 'Operating mode not recognized'],
  ['SERVER_SHUTTING_DOWN', 'server-shutting-down', 'Il server si sta spegnendo: riprova fra qualche secondo, quando sarà ripartito.', 'The server is shutting down: try again in a few seconds, once it is back.'],
  ['NOT_FOUND', 'session-not-found', 'Sessione non trovata', 'Session not found'],
  ['NOT_FOUND', 'session-deleted', 'Sessione non trovata: è stata eliminata', 'Session not found: it was deleted'],
  ['RUNTIME_NOT_AVAILABLE', 'local-runtime-or-model-unavailable', 'Runtime locale o modello non disponibile', 'Local runtime or model not available'],
  ['CONFIG_INVALID', 'provider-unavailable', 'Il fornitore di questo modello non è disponibile.', 'The provider of this model is not available.'],
  ['CONFIG_INVALID', 'provider-key-missing', 'Manca la chiave: collegala dalle impostazioni dei fornitori.', 'The key is missing: connect it from the provider settings.'],
  ['CONFIG_INVALID', 'provider-key-missing-named', 'Manca la chiave di {provider}: collegala dalle impostazioni dei fornitori.', 'The {provider} key is missing: connect it from the provider settings.'],
  ['CONFIG_INVALID', 'server-api-key-missing', 'Chiave API non configurata sul server (OPENROUTER_API_KEY)', 'API key not configured on the server (OPENROUTER_API_KEY)'],
  ['SESSION_STORE_FS_UNSUPPORTED', 'session-not-started-disk-unsupported', 'La sessione non è stata avviata: il disco della cartella dati non supporta ciò che serve per salvarla.', 'The session was not started: the disk of the data folder does not support what is needed to save it.'],
  ['SESSION_STORE_HEADER_FAILED', 'session-not-started-save-failed', 'La sessione non è stata avviata perché il suo salvataggio iniziale non è riuscito.', 'The session was not started because its initial save failed.'],
  ['SESSION_STORE_WRITE_FAILED', 'fork-not-saved', 'Il fork non è stato creato: non è stato possibile salvare la sua conversazione.', 'The fork was not created: its conversation could not be saved.'],
  ['SESSION_NOT_READY', 'closing-turn-retry', 'La sessione sta chiudendo il giro: riprova appena il giro è concluso.', 'The session is closing its turn: try again as soon as the turn is over.'],
  ['SESSION_NOT_READY', 'concluded-use-resume', 'La sessione è già conclusa: usa resume(), non la coda', 'The session is already concluded: use resume(), not the queue'],
  ['SESSION_NOT_READY', 'interrupted-by-restart-queue', 'Questa sessione è stata interrotta da un riavvio del server: un messaggio in coda qui non verrebbe mai consegnato. Avvia una sessione nuova.', 'This session was interrupted by a server restart: a queued message here would never be delivered. Start a new session.'],
  ['QUERY_INVALID', 'queue-message-empty', 'Il messaggio in coda non può essere vuoto', 'The queued message cannot be empty'],
  ['SESSION_STORE_WRITE_FAILED', 'queue-message-not-saved-to-disk', 'Non è stato possibile salvare il messaggio in coda su disco: non è stato accodato. Conserva la diagnosi.', 'The queued message could not be saved to disk: it was not queued. Keep the diagnosis.'],
  ['NOT_FOUND', 'queue-message-gone', 'Questo messaggio non è più in coda', 'This message is no longer in the queue'],
  ['QUERY_INVALID', 'operation-id-invalid', 'Identità operazione non valida', 'Invalid operation identity'],
  ['QUERY_INVALID', 'start-parameters-unsignable', 'I parametri dell’avvio non si possono firmare', 'The start parameters cannot be signed'],
  ['START_OPERATION_CONFLICT', 'operation-id-conflict', 'La stessa identità operazione è già associata a un avvio diverso', 'The same operation identity is already tied to a different start'],
  ['QUERY_INVALID', 'one-folder-required', 'Serve una sola cartella per questa sessione', 'Exactly one folder is needed for this session'],
  ['WORKSPACE_LAUNCH_NOT_AVAILABLE', 'folder-link-unavailable', 'Il collegamento alla cartella non è disponibile', 'The folder link is not available'],
  ['WORKSPACE_NOT_AVAILABLE', 'folder-link-unavailable', 'Il collegamento alla cartella non è disponibile', 'The folder link is not available'],
  ['QUERY_INVALID', 'step-link-invalid', 'Il legame del passo non è valido', 'The step link is not valid'],
  ['SESSION_STORE_UNAVAILABLE', 'workflow-step-needs-store', 'Un passo di Workflow ha bisogno del registro delle sessioni su disco', 'A Workflow step needs the session registry on disk'],
  ['QUERY_INVALID', 'step-assignment-invalid', 'La consegna del passo non è valida', 'The step assignment is not valid'],
  ['QUERY_INVALID', 'step-model-invalid', 'Il modello del passo non è valido', 'The step model is not valid'],
  ['WORKFLOW_ROOT_SESSION_NOT_FOUND', 'workflow-root-session-gone', 'La sessione che ha proposto il Workflow non esiste più', 'The session that proposed the Workflow no longer exists'],
  ['SESSION_NOT_READY', 'settings-being-saved', 'Le impostazioni dei comandi stanno venendo salvate: riprova fra un momento.', 'The command settings are being saved: try again in a moment.'],
  ['INTERNAL_ERROR', 'workflow-step-not-started', 'Il passo non è partito', 'The step did not start'],
  // automazioni a due porte (08/10/2026): voci nuove, dichiarate in `NUOVE`
  ['SESSION_STORE_UNAVAILABLE', 'automation-run-needs-store', 'Un giro di automazione ha bisogno del registro delle sessioni su disco', 'An automation run needs the session registry on disk'],
  ['QUERY_INVALID', 'automation-run-link-invalid', 'Il legame del giro di automazione non è valido', 'The automation run link is not valid'],
  ['INTERNAL_ERROR', 'automation-run-not-started', 'Il giro dell\'automazione non è partito', 'The automation run did not start'],
  ['QUERY_INVALID', 'permission-request-not-automation', 'Questa richiesta non è una bozza di automazione da modificare', 'This request is not an automation draft that can be edited'],
  ['NOT_FOUND', 'source-session-not-found', 'Sessione origine non trovata', 'Source session not found'],
  ['SESSION_NOT_READY', 'closing-turn-history-pending', 'La sessione sta chiudendo il giro: la sua cronologia non è ancora pronta. Riprova appena il giro è concluso.', 'The session is closing its turn: its history is not ready yet. Try again as soon as the turn is over.'],
  ['SESSION_NOT_READY', 'source-running', 'La sessione origine è ancora in corso: aspetta che concluda prima di forkarla', 'The source session is still running: wait for it to finish before forking it'],
  ['SESSION_NOT_READY', 'source-last-turn-open', 'L’ultimo giro della sessione origine non si è chiuso: riprendila prima di forkarla.', 'The last turn of the source session did not close: resume it before forking it.'],
  ['SESSION_NOT_READY', 'source-interrupted-by-restart', 'La sessione origine è stata interrotta da un riavvio del server e non ha una conversazione da ereditare: avvia una sessione nuova.', 'The source session was interrupted by a server restart and has no conversation to inherit: start a new session.'],
  ['SESSION_NOT_READY', 'source-no-conversation', 'La sessione origine non ha una conversazione da ereditare', 'The source session has no conversation to inherit'],
  ['FORK_POINT_COMPACTED', 'fork-point-compacted', 'Quel giro è dentro una parte compattata della conversazione: non può più essere il punto del fork.', 'That turn is inside a compacted part of the conversation: it can no longer be the fork point.'],
  ['FORK_POINT_NOT_FOUND', 'fork-point-not-found', 'Il punto del fork non è stato trovato con certezza in questa conversazione: forka la conversazione intera.', 'The fork point was not found with certainty in this conversation: fork the whole conversation instead.'],
  ['SESSION_NOT_READY', 'running-wait-resume', 'La sessione è ancora in corso: aspetta che concluda prima di riprenderla', 'The session is still running: wait for it to finish before resuming it'],
  ['SESSION_NOT_READY', 'delegation-notice-mismatch', 'La notifica di delega non corrisponde alla coda durevole.', 'The delegation notice does not match the durable queue.'],
  ['HISTORY_RECOVERY_AMBIGUOUS', 'interrupted-turn-events-ambiguous', 'Gli eventi del giro interrotto non possono essere associati con certezza. Nessun dato è stato modificato.', 'The events of the interrupted turn cannot be matched with certainty. No data was changed.'],
  ['SESSION_NOT_READY', 'interrupted-write-message', 'Questa sessione è stata interrotta: scrivi un nuovo messaggio per riprenderla in sicurezza.', 'This session was interrupted: write a new message to resume it safely.'],
  ['SESSION_NOT_READY', 'interrupted-by-restart-resume', 'Questa sessione è stata interrotta da un riavvio del server e non può essere ripresa: avvia una sessione nuova.', 'This session was interrupted by a server restart and cannot be resumed: start a new session.'],
  ['SESSION_NOT_READY', 'no-conversation-to-resume', 'Questa sessione non ha una conversazione da riprendere', 'This session has no conversation to resume'],
  ['HISTORY_RECOVERY_AMBIGUOUS', 'damaged-tool-call', 'Lo storico contiene una chiamata danneggiata che non può essere associata con certezza al suo risultato. Nessun dato è stato modificato.', 'The history contains a damaged call that cannot be matched with certainty to its result. No data was changed.'],
  ['SESSION_NOT_READY', 'question-call-missing', 'La storia salvata non contiene la chiamata della domanda: il giro non può ripartire da qui. Scrivi un messaggio per continuare.', 'The saved history does not contain the question call: the turn cannot restart from here. Write a message to continue.'],
  ['SESSION_STORE_AMBIGUOUS', 'queue-uncertain', 'Il registro di questa sessione ha una coda incerta e non accetta scritture: nessun messaggio è stato salvato e nessun giro è partito. Conserva la diagnosi prima di riprovare.', 'The registry of this session has an uncertain queue and accepts no writes: no message was saved and no turn started. Keep the diagnosis before trying again.'],
  ['SESSION_STORE_AMBIGUOUS', 'queue-uncertain-with-backup', 'Il registro di questa sessione ha una coda incerta e non accetta scritture: nessun messaggio è stato salvato e nessun giro è partito. Conserva la diagnosi prima di riprovare. Copia di sicurezza: {backup}.', 'The registry of this session has an uncertain queue and accepts no writes: no message was saved and no turn started. Keep the diagnosis before trying again. Backup copy: {backup}.'],
  ['SESSION_STORE_WRITE_FAILED', 'new-message-not-saved', 'Non è stato possibile salvare il nuovo messaggio. Riprova senza chiudere la sessione.', 'The new message could not be saved. Try again without closing the session.'],
  ['QUERY_INVALID', 'no-valid-setting', 'Nessuna impostazione valida da aggiornare', 'No valid setting to update'],
  ['DELEGATION_READ_ONLY', 'delegation-read-only', 'Questa delega è di sola lettura. Per eseguire modifiche avvia una nuova delega esplicita dalla sessione padre.', 'This delegation is read-only. To make changes, start a new explicit delegation from the parent session.'],
  ['SESSION_NOT_READY', 'mode-change-while-running', 'La modalità di lavoro si cambia fra un giro e l’altro, non mentre il modello sta lavorando', 'The working mode is changed between turns, not while the model is working'],
  ['SESSION_MODEL_UNKNOWN', 'model-unknown-query', 'Non so quale modello usa questa sessione, quindi non lo chiamo.', 'I do not know which model this session uses, so I am not calling it.'],
  ['MODEL_CALL_FAILED', 'model-call-failed', 'Il modello non ha risposto: {detail}', 'The model did not respond: {detail}'],
  ['MODEL_CALL_FAILED', 'model-call-failed-unknown', 'Il modello non ha risposto: errore sconosciuto', 'The model did not respond: unknown error'],
  ['SESSION_NOT_READY', 'running-wait-compact', 'La sessione è ancora in corso: aspetta che concluda prima di compattarla', 'The session is still running: wait for it to finish before compacting it'],
  ['SESSION_NOT_READY', 'last-turn-open-compact', 'L’ultimo giro non si è chiuso: la sua conversazione è in sospeso. Scrivi un messaggio per riprenderla, poi compatta.', 'The last turn did not close: its conversation is pending. Write a message to resume it, then compact.'],
  ['SESSION_NOT_READY', 'interrupted-by-restart-compact', 'Questa sessione è stata interrotta da un riavvio del server e non ha una conversazione da compattare: avvia una sessione nuova.', 'This session was interrupted by a server restart and has no conversation to compact: start a new session.'],
  ['SESSION_NOT_READY', 'no-conversation-to-compact', 'Questa sessione non ha una conversazione da compattare', 'This session has no conversation to compact'],
  ['SESSION_NOT_READY', 'compaction-in-progress', 'Una compattazione è già in corso per questa sessione. Attendi il risultato prima di riprovare.', 'A compaction is already in progress for this session. Wait for the result before trying again.'],
  ['SESSION_STORE_AMBIGUOUS', 'registry-unverifiable', 'Il registro della sessione non è verificabile. Conserva la diagnosi prima di riprovare.', 'The session registry cannot be verified. Keep the diagnosis before trying again.'],
  ['SESSION_NOT_READY', 'changed-during-registry-check', 'La sessione è cambiata durante la verifica del registro.', 'The session changed during the registry check.'],
  ['SESSION_STORE_AMBIGUOUS', 'registry-header-missing', 'Il registro della sessione non contiene un’intestazione ripristinabile. Non compattare questa sessione; conserva la diagnosi.', 'The session registry does not contain a restorable header. Do not compact this session; keep the diagnosis.'],
  ['SESSION_NOT_READY', 'changed-during-summary', 'La sessione è cambiata mentre veniva preparato il riassunto. Nessuna cronologia è stata sostituita.', 'The session changed while the summary was being prepared. No history was replaced.'],
  ['SESSION_NOT_READY', 'changed-during-compaction-job', 'La sessione è cambiata mentre il job di compattazione era in corso. Il contesto potrebbe essere stato aggiornato: verifica la tab Contesto prima di riprovare.', 'The session changed while the compaction job was running. The context may have been updated: check the Context tab before trying again.'],
  ['SESSION_MODEL_UNKNOWN', 'model-unknown-compact', 'Non so quale modello usare per compattare questa sessione, quindi non la compatto.', 'I do not know which model to use to compact this session, so I am not compacting it.'],
  ['SESSION_STORE_WRITE_FAILED', 'summary-invalid-result', 'Il riassunto non ha restituito un risultato valido. La cronologia originale resta disponibile.', 'The summary did not return a valid result. The original history remains available.'],
  ['SESSION_STORE_WRITE_FAILED', 'summary-invalid-history', 'Il riassunto non contiene una cronologia valida. La cronologia originale resta disponibile.', 'The summary does not contain a valid history. The original history remains available.'],
  ['SESSION_NOT_READY', 'changed-during-summary-save', 'La sessione è cambiata mentre il riassunto attendeva il salvataggio. Nessuna cronologia è stata sostituita.', 'The session changed while the summary was waiting to be saved. No history was replaced.'],
  ['SESSION_STORE_AMBIGUOUS', 'save-outcome-uncertain-stop', 'L’esito del salvataggio è incerto. Interrompi i tentativi e verifica il registro prima di riprovare.', 'The outcome of the save is uncertain. Stop trying and check the registry before trying again.'],
  ['SESSION_STORE_WRITE_FAILED', 'summary-not-saved', 'Il riassunto non è stato salvato. La cronologia originale resta disponibile; riprova.', 'The summary was not saved. The original history remains available; try again.'],
  ['NOT_FOUND', 'hook-not-found', 'Hook "{hookId}" non trovato in .harness-ui-hooks.json', 'Hook "{hookId}" not found in .harness-ui-hooks.json'],
  ['NOT_FOUND', 'mcp-server-not-found', 'Server MCP "{serverId}" non trovato in .harness-ui-mcp.json', 'MCP server "{serverId}" not found in .harness-ui-mcp.json'],
  ['LIBRARY_NOT_FOUND', 'library-entry-not-found', 'Questa voce della Libreria non esiste', 'This Library entry does not exist'],
  ['NOT_FOUND', 'forged-tool-not-found', 'Tool forgiato "{id}" non trovato in .tool-forge-store/', 'Forged tool "{id}" not found in .tool-forge-store/'],
  ['FORGE_INVALID', 'tool-manifest-invalid', 'Il manifest dello strumento non è valido: {detail}', 'The tool manifest is not valid: {detail}'],
  ['FORGE_INVALID', 'tool-manifest-invalid-shape', 'Il manifest dello strumento non è valido: forma non ammessa', 'The tool manifest is not valid: shape not allowed'],
  ['NOT_FOUND', 'plugin-not-found', 'Plugin "{pluginId}" non trovato in .harness-ui-plugins/', 'Plugin "{pluginId}" not found in .harness-ui-plugins/'],
  ['DOVE_NON_VALIDO', 'where-choice-invalid', 'Scelta non valida: attesi "wsl2", "windows" o null.', 'Invalid choice: expected "wsl2", "windows" or null.'],
  ['SCELTA_NON_VALIDA', 'boolean-choice-invalid', 'Scelta non valida: atteso true o false.', 'Invalid choice: expected true or false.'],
  ['SESSION_NOT_READY', 'interrupted-by-restart-direct-command', 'Questa sessione è stata interrotta da un riavvio del server: un comando diretto qui richiederebbe scrivere sopra una cronologia che non concluderà mai. Avvia una sessione nuova.', 'This session was interrupted by a server restart: a direct command here would require writing over a history that will never conclude. Start a new session.'],
  ['APPROVAL_NOT_PENDING', 'permission-request-expired', 'Questa richiesta di permesso non è più in attesa', 'This permission request is no longer pending'],
  ['APPROVAL_ANSWER_FORBIDDEN', 'permission-answer-outside-chain', 'Solo la sessione che ha chiesto, o una che l’ha avviata, può rispondere a questa richiesta di permesso', 'Only the session that asked, or one that started it, can answer this permission request'],
  ['QUERY_INVALID', 'permission-request-no-folder', 'Questa richiesta non ha una cartella da consentire per la sessione', 'This request has no folder to allow for the session'],
  ['QUESTION_NOT_PENDING', 'question-expired', 'Questa domanda non è più in attesa', 'This question is no longer pending'],
  ['QUESTION_ANSWER_NOT_SAVED', 'answer-not-saved-question-open', 'La risposta non è stata salvata: la domanda resta aperta, puoi riprovare.', 'The answer was not saved: the question stays open, you can try again.'],
  ['QUESTION_ANSWER_NOT_SAVED', 'answer-not-saved-question-closed', 'La risposta non è stata salvata: la domanda è stata chiusa senza risposta.', 'The answer was not saved: the question was closed without an answer.'],
  ['ELICITATION_NOT_PENDING', 'request-not-awaiting-answer', 'Questa richiesta non aspetta più una risposta', 'This request no longer waits for an answer'],
  ['PLAN_NOT_PENDING', 'plan-not-awaiting-choice', 'Questo piano non aspetta più una scelta', 'This plan no longer waits for a choice'],
  ['PLAN_STALE', 'plan-outdated', 'Il piano a schermo non è più l’ultimo: approva la versione aggiornata', 'The plan on screen is no longer the latest: approve the updated version'],
  ['PLAN_DECISION_NOT_SAVED', 'plan-choice-not-saved', 'La scelta sul piano non è stata salvata: il piano aspetta ancora, puoi riprovare.', 'The plan choice was not saved: the plan is still waiting, you can try again.'],
  ['SESSION_NOT_READY', 'redirect-cancelled-by-stop', 'Il reindirizzamento è stato annullato dallo stop', 'The redirect was cancelled by the stop'],
  ['SESSION_NOT_READY', 'not-running-cannot-redirect', 'La sessione non è in corso e non può essere reindirizzata', 'The session is not running and cannot be redirected'],
  ['QUERY_INVALID', 'redirect-empty', 'Il reindirizzamento non può essere vuoto', 'The redirect cannot be empty'],
  ['SESSION_NOT_READY', 'redirect-already-waiting', 'Un reindirizzamento è già in attesa del prossimo confine sicuro', 'A redirect is already waiting for the next safe boundary'],
  ['SESSION_STORE_WRITE_FAILED', 'redirect-message-not-saved', 'Non è stato possibile salvare il messaggio in coda. Riprova senza chiudere la sessione.', 'The queued message could not be saved. Try again without closing the session.'],
  ['SESSION_NOT_READY', 'redirect-cancelled-before-start', 'Il reindirizzamento è stato annullato prima dell’avvio', 'The redirect was cancelled before it started'],
  ['NOT_FOUND', 'project-not-found', 'Progetto non trovato', 'Project not found'],
  ['SESSION_NOT_READY', 'workspace-unavailable', 'Workspace della sessione non disponibile', 'The session workspace is not available'],
  ['QUERY_INVALID', 'session-name-invalid', 'Nome non valido: serve 1-80 caratteri', 'Invalid name: 1-80 characters are needed'],
  ['QUERY_INVALID', 'message-reference-invalid', 'Riferimento del messaggio non valido', 'Invalid message reference'],
  ['SESSION_STILL_RUNNING', 'still-working-wait', 'La sessione sta ancora lavorando: aspetta la fine del giro, o fermalo.', 'The session is still working: wait for the end of the turn, or stop it.'],
  ['NOT_FOUND', 'message-not-found', 'Messaggio non trovato in questa sessione', 'Message not found in this session'],
  ['SESSION_NOT_READY', 'delete-rollback-in-progress', 'La sessione sta tornando com’era dopo un’eliminazione non riuscita: riprova fra un momento.', 'The session is returning to how it was after a failed deletion: try again in a moment.'],
  ['SESSION_STILL_RUNNING', 'running-stop-before-delete', 'Sessione ancora in corso — fermala prima di eliminarla', 'Session still running — stop it before deleting it'],
  ['SESSION_NOT_READY', 'command-output-being-saved', 'Il risultato del comando sta venendo salvato: riprova fra un momento.', 'The command result is being saved: try again in a moment.'],
  ['COMPACTION_NOT_FOUND', 'compaction-id-not-found', 'Nessuna compattazione con questo identificativo da annullare', 'No compaction with this identifier to cancel'],
  ['SESSION_NOT_READY', 'running-wait-cancel-compaction', 'La sessione è ancora in corso: la compattazione si annulla fra un giro e l’altro', 'The session is still running: a compaction is cancelled between turns'],
  ['SESSION_NOT_READY', 'compaction-changed-during-cancel', 'La compattazione è cambiata mentre l’annullamento attendeva il salvataggio. Niente è stato annullato.', 'The compaction changed while the cancellation was waiting to be saved. Nothing was cancelled.'],
  ['SESSION_STORE_AMBIGUOUS', 'save-outcome-uncertain', 'L’esito del salvataggio è incerto. Conserva la diagnosi prima di riprovare.', 'The outcome of the save is uncertain. Keep the diagnosis before trying again.'],
  ['SESSION_STORE_WRITE_FAILED', 'redirect-correction-not-saved', 'Non è stato possibile salvare la correzione. Riprova senza chiudere la sessione.', 'The correction could not be saved. Try again without closing the session.'],
  ['SESSION_INTERRUPTED', 'redirect-interrupted-by-restart', 'Il server è stato riavviato prima che il reindirizzamento potesse concludersi.', 'The server was restarted before the redirect could finish.'],
  ['SESSION_STORE_WRITE_FAILED', 'compaction-cancel-not-saved', 'L’annullamento non è stato salvato su disco: la compattazione resta attiva.', 'The cancellation was not saved to disk: the compaction stays active.'],
];
const NUOVE = new Set(['fork-not-saved', 'fork-point-compacted', 'fork-point-not-found', 'permission-answer-outside-chain',
  // automazioni a due porte (08/10/2026): nate in inglese, senza un italiano «di prima»
  'automation-run-needs-store', 'automation-run-link-invalid', 'automation-run-not-started', 'permission-request-not-automation']);
const chiaveDizionario = (code, reason) => `${code}.${reason.replace(/-/gu, '_')}`;
const voce = (chiave, lingua) => AREE.errori[lingua][chiave];

/* Il sorgente del registro: ogni chiamata `rifiuto(<code>, '<reason>', '<inglese>'`. Il codice è un letterale, tranne dove la riga dichiara il suo ripiego. */
const CODICI_DI_RIPIEGO = {
  'provider-unavailable': ['CONFIG_INVALID'],
  'provider-key-missing': ['CONFIG_INVALID'],
  'provider-key-missing-named': ['CONFIG_INVALID'],
  'folder-link-unavailable': ['WORKSPACE_LAUNCH_NOT_AVAILABLE', 'WORKSPACE_NOT_AVAILABLE'],
  'workflow-step-not-started': ['INTERNAL_ERROR'],
  'workflow-step-not-resumed': ['INTERNAL_ERROR'], // C3 tappa 2b: la ripresa del passo che `resume` rifiuta senza un codice suo
  'automation-run-not-started': ['INTERNAL_ERROR'],
};
function rifiutiDelSorgente() {
  const sorgente = readFileSync(new URL('../src/session-registry.mjs', import.meta.url), 'utf8');
  const trovati = [];
  const re = /rifiuto\(\s*([^,()]+(?:\([^)]*\))?[^,()]*?)\s*,\s*'([a-z0-9-]+)'\s*,\s*'((?:[^'\\]|\\.)*)'/gu;
  for (const m of sorgente.matchAll(re)) {
    const letterale = /^'([A-Z][A-Z0-9_]*)'$/u.exec(m[1].trim());
    const codici = letterale ? [letterale[1]] : CODICI_DI_RIPIEGO[m[2]];
    assert.ok(codici, `il codice di rifiuto('${m[1].trim()}', '${m[2]}') non è un letterale e non ha un ripiego dichiarato`);
    const inglese = m[3].replace(/\\'/gu, "'");
    for (const code of codici) trovati.push({ code, reason: m[2], inglese });
  }
  /* Revisione K2 (03/10/2026): anche il reindirizzamento fallito porta code + reason + message inglese, scritti con letterali
     dentro `runRedirectFailed({ … })`. Un blocco senza `reason` letterale (il messaggio di un altro modulo) non conta. */
  for (const blocco of sorgente.matchAll(/runRedirectFailed\(\{([^}]*)\}\)/gu)) {
    const code = /code: '([A-Z][A-Z0-9_]*)'/u.exec(blocco[1])?.[1];
    const reason = /reason: '([a-z0-9-]+)'/u.exec(blocco[1])?.[1];
    const inglese = /message: '((?:[^'\\]|\\.)*)'/u.exec(blocco[1])?.[1];
    if (code && reason && inglese !== undefined) trovati.push({ code, reason, inglese: inglese.replace(/\\'/gu, "'") });
  }
  return trovati;
}

test('RIFIUTI-REG-01 — ogni rifiuto scritto nel registro ha la sua voce nel dizionario, con LO STESSO inglese e un italiano non vuoto', () => {
  const rifiuti = rifiutiDelSorgente();
  const distinti = new Map(rifiuti.map((r) => [`${r.code}|${r.reason}`, r]));
  assert.ok(distinti.size >= 100, `i rifiuti sono tanti (${distinti.size}): un sorgente non letto non deve passare per verde`);
  const senzaVoce = [...distinti.values()].filter((r) => voce(chiaveDizionario(r.code, r.reason), 'en') === undefined).map((r) => `${r.code} ${r.reason}`);
  assert.deepEqual(senzaVoce, [], 'rifiuti del registro senza voce nel dizionario');
  const diversi = [...distinti.values()].filter((r) => voce(chiaveDizionario(r.code, r.reason), 'en') !== r.inglese)
    .map((r) => `${r.code} ${r.reason}: registro «${r.inglese}» ≠ dizionario «${voce(chiaveDizionario(r.code, r.reason), 'en')}»`);
  assert.deepEqual(diversi, [], 'l\'inglese del registro e quello del dizionario devono essere identici');
  const senzaItaliano = [...distinti.values()].filter((r) => { const it = voce(chiaveDizionario(r.code, r.reason), 'it'); return typeof it !== 'string' || it.trim() === '' || it === r.inglese; })
    .map((r) => `${r.code} ${r.reason}`);
  assert.deepEqual(senzaItaliano, [], 'italiano mancante o identico all\'inglese');
});

test('RIFIUTI-REG-02 — AL CONTRARIO: una voce di motivo del dizionario senza il suo rifiuto nel registro è un residuo; un inglese cambiato da una parte sola si vede', () => {
  const attese = new Set(rifiutiDelSorgente().map((r) => chiaveDizionario(r.code, r.reason)));
  const FORMA_MOTIVO = /^[A-Z][A-Z0-9_]*\.(?!(?:message|title|explanation|action)$)[a-z][a-z0-9_]*$/u;
  const residui = Object.keys(AREE.errori.en).filter((k) => FORMA_MOTIVO.test(k) && !attese.has(k));
  assert.deepEqual(residui, [], 'voci di motivi che il registro non dice più');
  // il confronto morde davvero: un inglese diverso, anche di una virgola, non coincide
  const [primo] = rifiutiDelSorgente();
  assert.notEqual(voce(chiaveDizionario(primo.code, primo.reason), 'en'), primo.inglese + '.');
});

test('RIFIUTI-REG-03 — l\'italiano del dizionario è la frase di PRIMA, parola per parola (la tabella data alla CLI), e ogni riga ha il suo rifiuto', () => {
  const nelSorgente = new Set(rifiutiDelSorgente().map((r) => `${r.code}|${r.reason}`));
  assert.ok(TABELLA.length >= 100);
  for (const [code, reason, it, en] of TABELLA) {
    const chiave = chiaveDizionario(code, reason);
    assert.equal(voce(chiave, 'it'), it, `italiano di ${chiave}`);
    assert.equal(voce(chiave, 'en'), en, `inglese di ${chiave}`);
    assert.ok(nelSorgente.has(`${code}|${reason}`), `la riga ${chiave} della tabella non ha il suo rifiuto nel registro`);
    assert.match(reason, /^[a-z0-9]+(?:-[a-z0-9]+)*$/u, 'il motivo è kebab-case');
  }
  // dentro lo stesso codice due motivi non hanno la stessa frase inglese: il confronto con il server sceglierebbe il primo
  const perCodice = new Map();
  for (const [code, reason, , en] of TABELLA) {
    const chiaveFrase = `${code}|${en}`;
    assert.ok(!perCodice.has(chiaveFrase), `${code}: «${en}» è già del motivo ${perCodice.get(chiaveFrase)}, non anche di ${reason}`);
    perCodice.set(chiaveFrase, reason);
  }
  // AL CONTRARIO: le tre voci nuove non hanno un italiano «di prima» (erano inglesi): sono dichiarate, non nascoste
  for (const reason of NUOVE) assert.ok(TABELLA.some(([, r]) => r === reason), reason);
});

test('RIFIUTI-REG-04 — il server non dice più una parola italiana nei rifiuti del registro (le frasi per la persona stanno nel dizionario)', () => {
  const italiane = rifiutiDelSorgente().filter((r) => eFraseItaliana(r.inglese) || /[àèìòù]/u.test(r.inglese)).map((r) => `${r.code} ${r.reason}: ${r.inglese}`);
  assert.deepEqual(italiane, []);
  assert.equal(eFraseItaliana('Sessione non trovata'), true, 'il rilevatore vede davvero l\'italiano');
});

test('RIFIUTI-REG-05 — il risolutore: con il motivo, senza il motivo (cliente che non lo copia) e nelle due lingue, la frase dei SESSION_NOT_READY è quella giusta', () => {
  const casi = TABELLA.filter(([code]) => code === 'SESSION_NOT_READY');
  assert.ok(casi.length >= 25);
  for (const [code, reason, it, en] of casi) {
    const problema = { code, message: 'Session not ready for this action', explanation: en, title: 'Session not ready' };
    impostaLingua('it');
    assert.equal(testoErroreServer({ ...problema, reason }).explanation, it, `${reason} con motivo`);
    assert.equal(testoErroreServer(problema).explanation, it, `${reason} senza motivo: il confronto con l'inglese basta`);
    impostaLingua('en');
    assert.equal(testoErroreServer({ ...problema, reason }).explanation, en, `${reason} in inglese`);
  }
  impostaLingua('it');
});

test('RIFIUTI-REG-06 — AL CONTRARIO: una frase che nessuna voce conosce resta quella del server (mai una chiave grezza), e un motivo di un altro codice non copre la frase', () => {
  impostaLingua('it');
  const sconosciuta = testoErroreServer({ code: 'SESSION_NOT_READY', message: 'x', explanation: 'A brand new reason of the server', reason: 'brand-new-reason' });
  assert.equal(sconosciuta.explanation, 'A brand new reason of the server');
  assert.ok(!/^errori\./u.test(sconosciuta.explanation));
  const [, , , enAltroCodice] = TABELLA.find(([c, r]) => c === 'NOT_FOUND' && r === 'session-not-found');
  const altroCodice = testoErroreServer({ code: 'SESSION_NOT_READY', message: 'x', explanation: enAltroCodice, reason: 'session-not-found' });
  assert.equal(altroCodice.explanation, enAltroCodice, 'la voce NOT_FOUND non copre un SESSION_NOT_READY');
  // un valore dentro la frase si rimette nella lingua della persona
  const conValore = testoErroreServer({ code: 'NOT_FOUND', message: 'x', explanation: 'Hook "pre" not found in .harness-ui-hooks.json', reason: 'hook-not-found', params: { hookId: 'pre' } });
  assert.equal(conValore.explanation, 'Hook "pre" non trovato in .harness-ui-hooks.json');
});

test('RIFIUTI-REG-07 — il registro vero: un rifiuto porta code + reason + frase inglese, e il codice è quello di sempre', () => {
  const registro = createSessionRegistry({ modello: 'm', chiave: 'k' });
  const manca = registro.accodaMessaggio('non-esiste', 'ciao');
  assert.equal(manca.code, 'NOT_FOUND');
  assert.equal(manca.reason, 'session-not-found');
  assert.equal(manca.erroreAvvio, 'Session not found');
  assert.equal(manca.params, undefined, 'senza valori nella frase non c\'è params');
  assert.equal(TESTI.en[`errori.${manca.code}.session_not_found`], manca.erroreAvvio);
  const ripreso = registro.resume('non-esiste');
  assert.deepEqual([ripreso.code, ripreso.reason], ['NOT_FOUND', 'session-not-found']);
});
