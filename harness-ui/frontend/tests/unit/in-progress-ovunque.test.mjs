/*
 * Decisione 97 dell'owner (03/11/2026 sera): nell'inglese dell'app OGNI ETICHETTA DI STATO che diceva «running» dice «in progress»
 *   (processi, agenti, sessioni, rami, deleghe, passi, ricerche, attrezzi). Allarga la regola del 29/10 («ogni stato running è
 *   in progress», `testi/agenti.js`, `timeline.stillRunning`) e la decisione 85 (il filtro dei processi, `pannello.en.js`).
 *   L'italiano non cambia; le chiavi non cambiano.
 * La prova legge TUTTI i dizionari inglesi (le aree di `testi/`, il pannello compreso, e `en.js` con le sue categorie annidate):
 *   ogni valore che contiene la parola «running» deve stare nell'elenco qui sotto, con lo stesso testo. L'elenco ha solo i VERBI
 *   («Running the tests…», «running 1 command…»: eseguire), il senso di ACCESO («Check that the service is running») e le FRASI
 *   intere, dove «running» è il predicato di una frase («This command is still running: stop it first», «The running turn stops»).
 *   Un'etichetta di stato nuova che dicesse «running», o una voce dell'elenco cambiata in etichetta, fa diventare rossa la prova.
 * Fonti: `Downloads/TALOS/desktop/in-corso/FONTI-RESIDUI-85-2026-11-03.md`, sezione «Decisione 97».
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { AREE } from '../../src/i18n/testi/index.js';
import EN from '../../src/i18n/en.js';

/* «eseguire»: il verbo, non lo stato. */
const VERBI = [
  ['app.activity.commandOne', 'running {n} command…'],
  ['app.activity.commandMany', 'running {n} commands…'],
  ['app.toolLine.runningTests', 'Running the tests…'],
  ['app.toolLine.runningCommandOf', 'Running {comando}…'],
  ['app.toolLine.runningCommand', 'Running command…'],
  ['app.automations.v2.deleteConsequence', 'It stops running and its history is removed. The chats of past runs stay.'],
  ['processi.output.readFailedCanRetry', 'Reading failed. You can retry without running the command again.'],
  ['processi.output.readFailedPressRefresh', 'Reading failed. Press Refresh to retry without running the command again.'],
  ['processi.session.helpInterrupted', 'Interrupted because the process died: nobody is running it. Write a message to resume it.'],
  ['sezioni.automations.v2.card.why', 'Creating, changing, turning on or running an automation always asks you first. Pausing and stopping do not.'],
  ['varie.tools.name.runTests', 'running the tests'],
  ['varie.tools.description.processOutput', 'Reads a part of the stored result of a command, without running it again.'],
  ['varie.tools.description.automationControl', 'Pauses, resumes, runs now or stops an automation; resuming and running ask you first.'],
  ['varie.tools.verb.shell.present', 'Running'],
  ['varie.tools.verb.runTests.present', 'Running the tests'],
  ['errori.turno.modelloNonDisponibile.perche', 'The model was retired, or is kept for accounts that already used it: the provider refused the request without running it.'],
  ['modello.chat.iAmRunningThe', 'I am running the full suite to see whether anything regressed…'],
  ['en.js › attrezzi › esecuzione dei test', 'running the tests'],
  ['en.js › attivita › esecuzione di 1 comando…', 'running 1 command…'],
  ['en.js › attivita › esecuzione di {n} comandi…', 'running {n} commands…'],
  ['en.js › attivita › Esegue', 'Running'],
  ['en.js › attivita › Esegue i test', 'Running the tests'],
];

/* «acceso»: un servizio, un motore, TALOS stesso che è avviato. */
const ACCESO = [
  ['chat.improve.error.runtimeOff', 'The local runtime for this chat is not running. Start it from Model Lab, then retry.'],
  ['chat.toast.serverUnreachable', 'The server is not responding. Check that TALOS is running and retry.'],
  ['modelli.runtime.unreachableDetail', 'The service did not respond. Check that it is running in Doctor and retry.'],
  ['varie.browser.remedy.service', 'Check that the service is running.'],
  ['errori.REMOTE_UNAVAILABLE.remote_not_running', 'Remote control is not running on this computer.'],
  ['errori.RUNTIME_UNREACHABLE.action', 'Check in Doctor that it is running and try again.'],
  ['errori.turno.rete.rimedio2', 'If the model is local, check that the runtime is running in the Model Lab.'],
  ['modello.capability.trustingAuthorizesThisDeclaration', 'Trusting authorizes this declaration. It does not prove that it is running. Changes to the checked content require new trust.'],
  ['en.js › browser › Controlla che il servizio sia acceso.', 'Check that the service is running.'],
  ['modelli.fonti.nonAcceso', '{nome} is not running on this computer'],
];

/* Frasi intere: «running» è il predicato o l'attributo del giro in una frase (il brief della decisione 97 le esclude). */
const FRASI = [
  ['app.composer.redirectOrQueue', '“{testo}” — the turn is running: redirect now or queue it?'],
  ['app.queue.noActiveSessionBody', 'A follow-up can only be queued during a running session — open “New” first.'],
  ['app.sessions.deleteBlockedOne', 'A Workflow for this conversation is still running: cancel it before deleting the conversation.'],
  ['app.sessions.deleteBlockedMany', '{n} Workflows for this conversation are still running: cancel them before deleting it.'],
  ['chat.message.stopAndRetryHint', 'The running turn stops'],
  ['chat.message.branchStopFailed', 'The running turn did not stop, so no branch was opened. Try again, or wait for it to finish.'],
  ['chat.foot.status.unknownRunning', 'cannot tell whether the turn is still running'],
  ['chat.queue.steerNowTitle', 'Brings it into the running turn, as a correction'],
  ['processi.output.stateBackground', 'Moved to the background: this is what it printed until then. What it prints next goes to its output file; the Processes tab shows whether it is still running.'],
  ['processi.output.stateBackgroundLimited', 'Moved to the background after the storage limit was reached: part of what it printed until then was not kept. What it prints next goes to its output file; the Processes tab shows whether it is still running.'],
  ['sezioni.research.action.pause.conflict', 'It is not running right now: only a running research can be paused.'],
  ['sezioni.research.action.resume.conflict', 'There is nothing to resume: it is either still running or already finished.'],
  ['sezioni.research.plan.futureNote', 'When a research declares its lines of inquiry, you will find them here with what each one produced — and on a running research this will be the place to approve or change them before it starts.'],
  ['varie.tools.description.researchPause', 'Stops a running research, keeping what it has already gathered.'],
  ['errori.GIT_FETCH_RUNNING.message', 'A fetch is already running'],
  ['errori.PROCESS_NOT_RUNNING.message', 'This command is no longer running'],
  ['errori.PROCESS_STILL_RUNNING.message', 'This command is still running: stop it first'],
  ['errori.SESSION_STILL_RUNNING.message', 'Session still running — stop it before deleting it'],
  ['errori.WORKFLOW_RUN_NOT_FINISHED.message', 'A Workflow in this conversation is still running — cancel it before deleting it'],
  ['errori.SESSION_LEASED.explanation', 'This chat is running in another TALOS process on this computer, and only one can write to it at a time.'],
  ['errori.PROCESS_NOT_RUNNING.explanation', 'This command is no longer running: it finished on its own, or someone already stopped it.'],
  ['errori.DELEGATION_STATE_CONFLICT.explanation', 'The agent is not in the right state: only a running agent can be paused, only a paused one resumed, only a failed or stopped one retried. Nothing was changed.'],
  ['errori.turno.punto.inCorso', 'while “{nome}” was running'],
  ['errori.turno.giriEsauriti.perche', 'Every message has a cap on model requests: it exists so an agent is not left running forever.'],
  ['errori.GOAL_STATE_CONFLICT.goal_check_running', 'The checks of the goal are already running'],
  ['errori.GOAL_STATE_CONFLICT.goal_changed_during_check', 'The goal changed while its checks were running: the result was not saved'],
  ['errori.SESSION_NOT_READY.source_running', 'The source session is still running: wait for it to finish before forking it'],
  ['errori.SESSION_NOT_READY.running_wait_resume', 'The session is still running: wait for it to finish before resuming it'],
  ['errori.SESSION_NOT_READY.running_wait_compact', 'The session is still running: wait for it to finish before compacting it'],
  ['errori.SESSION_NOT_READY.changed_during_compaction_job', 'The session changed while the compaction job was running. The context may have been updated: check the Context tab before trying again.'],
  ['errori.SESSION_NOT_READY.not_running_cannot_redirect', 'The session is not running and cannot be redirected'],
  ['errori.SESSION_STILL_RUNNING.running_stop_before_delete', 'Session still running — stop it before deleting it'],
  ['errori.SESSION_NOT_READY.running_wait_cancel_compaction', 'The session is still running: a compaction is cancelled between turns'],
  ['modello.chat.bringsItIntoThe', 'Brings it into the running turn, as a correction'],
  ['modello.chat.writeEnterSteersThe', 'Write… Enter steers the running turn, Ctrl+Enter queues'],
  ['modello.chat.theTurnIsRunning', 'The turn is running: choose what to do with the message'],
  ['modello.chat.theTurnIsRunning2', 'The turn is running. Should I steer it with this message now or queue it?'],
  ['modello.deleteSession.theSessionIsStill', 'The session is still running. Stop it from the chat before deleting it.'],
  ['modello.stopTurn.theStopDidNot', 'The stop did not succeed. The turn is still running.'],
  ['server.metrics.closeOpen', 'the turn is still running: it has no closing reason yet, and giving one now would be a prediction'],
  ['errori.SESSION_NOT_READY.domanda_gia_in_corso', 'A side question is already running for this session.'],
  ['app.workspace.alert.offlineBody', 'Running work resumes when the connection is back.'],
];

/* Le etichette di stato della decisione 97, col testo inglese nuovo. */
const STATI = [
  ['app.status.toolRunning', 'Tool in progress'],
  ['app.activity.searchingOne', '{n} search in progress…'],
  ['app.activity.searchingMany', '{n} searches in progress…'],
  ['app.activity.runningOne', '{n} step in progress…'],
  ['app.activity.runningMany', '{n} steps in progress…'],
  ['app.sessions.running', 'Session in progress'],
  ['app.branches.currentRunning', 'current session · in progress'],
  ['app.branches.branchRunning', 'branch · in progress'],
  ['app.delegations.stateRunning', 'Delegation · in progress'],
  ['app.delegations.lowerRunning', 'delegation · in progress'],
  ['chat.activity.runningOne', '{n} in progress'],
  ['chat.activity.runningMany', '{n} in progress'],
  ['chat.run.otherWindow', 'In progress in another TALOS window: pause, cancel or retry it there.'],
  ['chat.run.confirm.runningOne', 'The step in progress stops immediately.'],
  ['chat.run.confirm.runningMany', 'The {n} steps in progress stop immediately.'],
  ['processi.process.stopAllQuestionOne', 'Stop the command in progress now?'],
  ['processi.process.stopAllQuestionMany', 'Stop the {n} commands in progress now?'],
  ['modelli.provider.testing', 'Test in progress…'],
  ['modelli.download.running', 'In progress'],
  ['modelli.download.runningCount', '{n} in progress'],
  ['modelli.detail.running', 'In progress…'],
  ['github.pullRequest.checks.runningOne', '1 in progress'],
  ['github.pullRequest.checks.runningMany', '{n} in progress'],
  ['modello.sidebar.runningClaudeOpus5', 'in progress · claude-opus-5'],
  ['modello.lab.1Running', '1 in progress'],
  ['pannello.agenti.contoInCorsoOne', '{n} in progress'],
  ['pannello.agenti.contoInCorsoMany', '{n} in progress'],
  ['pannello.agenti.inCorsoDa', 'In progress for'],
  ['pannello.processi.titoloOne', '{n} process in progress'],
  ['pannello.processi.titoloMany', '{n} processes in progress'],
  ['pannello.processi.titoloNessuno', 'Nothing in progress'],
  ['pannello.processi.accesiOne', '{n} in progress'],
  ['pannello.processi.accesiMany', '{n} in progress'],
  ['pannello.processi.fermaTutti', 'Stop all in progress'],
  ['pannello.processi.fermaTuttiDomandaOne', 'Stop {n} command in progress?'],
  ['pannello.processi.fermaTuttiDomandaMany', 'Stop {n} commands in progress?'],
  ['pannello.processi.nessunoAcceso', 'Nothing is in progress right now.'],
  ['en.js › terminale › in corso', 'in progress'],
  ['en.js › attivita › 1 ricerca in corso…', '1 search in progress…'],
  ['en.js › attivita › {n} ricerche in corso…', '{n} searches in progress…'],
  ['en.js › attivita › 1 attività in corso…', '1 step in progress…'],
  ['en.js › attivita › {n} attività in corso…', '{n} steps in progress…'],
  ['en.js › github › 1 in corso', '1 in progress'],
  ['en.js › github › {n} in corso', '{n} in progress'],
  ['en.js › github › in corso', 'in progress'],
  ['app.queue.followUpQueuedBody', 'Write normally in the composer: a message during a run in progress is queued automatically, without this switch.'], // decisione 98 (owner 03/11 sera)
  ['app.automations.v2.runStartedBody', '«{nome}» is in progress. Its result lands in the history.'], // decisione 98 (owner 03/11 sera)
  ['chat.run.note.cancelling', 'Cancelling: the steps in progress are stopping.'], // decisione 98 (owner 03/11 sera)
  ['chat.run.note.pausing', 'Pause requested: the steps in progress finish, no new steps start.'], // decisione 98 (owner 03/11 sera)
  ['chat.run.ack.cancelRequested', 'Cancellation requested: the steps in progress stop.'], // decisione 98 (owner 03/11 sera)
  ['errori.PROCESS_STILL_RUNNING.title', 'Command still in progress'], // decisione 98 (owner 03/11 sera)
  ['modello.board.whatIsRunningHow', 'What is in progress, how it went'], // decisione 98 (owner 03/11 sera)
];

/** Ogni voce inglese, come [chiave, valore]: le aree di `testi/` (chiave pubblica) e le categorie annidate di `en.js`. */
function vociInglesi() {
  const voci = new Map();
  for (const [area, testi] of Object.entries(AREE)) {
    for (const [chiave, valore] of Object.entries(testi.en || {})) voci.set(`${area}.${chiave}`, valore);
  }
  const scorri = (oggetto, percorso) => {
    for (const [chiave, valore] of Object.entries(oggetto)) {
      if (valore && typeof valore === 'object') scorri(valore, `${percorso} › ${chiave}`);
      else voci.set(`${percorso} › ${chiave}`, valore);
    }
  };
  scorri(EN, 'en.js');
  return voci;
}

const PERMESSE = new Map([...VERBI, ...ACCESO, ...FRASI]);
const DICE_RUNNING = /\brunning\b/iu;

test('IP97-01 nessuna etichetta di stato inglese dice più «running»: restano solo i verbi, «acceso» e le frasi elencate', () => {
  const fuori = [];
  for (const [chiave, valore] of vociInglesi()) {
    if (!DICE_RUNNING.test(String(valore))) continue;
    if (PERMESSE.get(chiave) !== valore) fuori.push(`${chiave} = ${JSON.stringify(valore)}`);
  }
  assert.deepEqual(fuori, [], `voci inglesi che dicono ancora «running» e non sono un verbo, «acceso» o una frase elencata:\n${fuori.join('\n')}`);
});

test('IP97-02 le etichette di stato della decisione 97 dicono «in progress», col testo esatto', () => {
  const voci = vociInglesi();
  const diverse = STATI.filter(([chiave, atteso]) => voci.get(chiave) !== atteso)
    .map(([chiave, atteso]) => `${chiave}: ${JSON.stringify(voci.get(chiave))} invece di ${JSON.stringify(atteso)}`);
  assert.deepEqual(diverse, [], diverse.join('\n'));
});

test('IP97-03 l\'elenco dei permessi non è vecchio: ogni voce esiste ancora, dice «running» e ha lo stesso testo', () => {
  const voci = vociInglesi();
  const vecchie = [...PERMESSE].filter(([chiave, valore]) => voci.get(chiave) !== valore || !DICE_RUNNING.test(valore))
    .map(([chiave]) => chiave);
  assert.deepEqual(vecchie, [], 'voci da togliere dall\'elenco (cambiate o sparite)');
  assert.equal(PERMESSE.size, VERBI.length + ACCESO.length + FRASI.length, 'una chiave è in due elenchi');
  assert.ok(STATI.every(([chiave]) => !PERMESSE.has(chiave)), 'un\'etichetta di stato è anche fra i permessi');
});
