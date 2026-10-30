#!/usr/bin/env node
/**
 * ⛔ K3-C3a2 — i testi che il server r4 manda alla persona (`<campo>Chiave`, area `server`), presi dal dizionario del desktop
 * al COMMIT fissato, mai dall'albero di lavoro (stessa regola di `copia-r4.mjs`). Il risultato è un JSON con la provenienza:
 * `{ origine: { commit, percorso, sha256 }, it, en }`. Le regole per dirli stanno in `src/lib/harness/r4/testiServerR4.ts`.
 *
 * K3-C2b: anche le chiavi `doctor.*` dell'area `varie` (i testi del Doctor), filtrate per prefisso; il prefisso entra nella provenienza.
 *
 * Uso: node scripts/kernel-r4/testi-server-r4.mjs --r4 <checkout r4> --commit <sha> --uscita <file.json> [--area server|varie-doctor|processi-inspector|varie-pannello|modello-inspector|processi-scheda|kernel-prova|errori-processi|agenti-scheda|varie-attrezzi|app-risultato-delega|chat-risultato-delega|errori-punti|app-file|errori-file|app-terminale|processi-terminale|modello-viste|app-approvazione|chat-approvazione|kernel-approvazione|chat-permessi|chat-domande|errori-domande|chat-coda|agenti-coda|errori-fermato|chat-nota|errori-modello|app-allegati|app-trascrizione|errori-motivi|chat-piano|app-piano|modello-permessi|errori-piano|errori-generici|varie-esiti|app-esiti|app-impostazioni|errori-remoti|sezioni-automazioni|app-coordinazione|varie-fornitori|errori-sessioni|errori-chatgpt|errori-locale|errori-kernel|errori-turno-no|chat-comando|app-attivita]
 */
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const PERCORSO_TESTI_SERVER = 'harness-ui/frontend/src/i18n/testi/server.js'
export const PERCORSO_TESTI_VARIE = 'harness-ui/frontend/src/i18n/testi/varie.js'
export const PERCORSO_TESTI_PROCESSI = 'harness-ui/frontend/src/i18n/testi/processi.js'
export const PERCORSO_TESTI_MODELLO = 'harness-ui/frontend/src/i18n/testi/modello.js'
export const PERCORSO_TESTI_KERNEL = 'harness-ui/frontend/src/i18n/testi/kernel.js'
export const PERCORSO_TESTI_ERRORI = 'harness-ui/frontend/src/i18n/testi/errori.js'
export const PERCORSO_TESTI_AGENTI = 'harness-ui/frontend/src/i18n/testi/agenti.js'
export const PERCORSO_TESTI_APP = 'harness-ui/frontend/src/i18n/testi/app.js'
export const PERCORSO_TESTI_CHAT = 'harness-ui/frontend/src/i18n/testi/chat.js'
export const PERCORSO_TESTI_SEZIONI = 'harness-ui/frontend/src/i18n/testi/sezioni.js'
/** Le regole che riconoscono i messaggi del kernel (`MESSAGGI_DEL_KERNEL`): codice, non dizionario. */
export const PERCORSO_REGOLE_ERRORI = 'harness-ui/frontend/src/components/errori.js'

const AREE = {
    server: { percorso: PERCORSO_TESTI_SERVER, prefisso: null },
    'varie-doctor': { percorso: PERCORSO_TESTI_VARIE, prefisso: 'doctor.' },
    // K3-C3b, il pannello ▤: le righe dell'inspector, il riuso della cache e il riassunto dei file
    'processi-inspector': { percorso: PERCORSO_TESTI_PROCESSI, prefisso: 'inspector.' },
    'varie-pannello': { percorso: PERCORSO_TESTI_VARIE, prefisso: ['usage.', 'review.'] },
    'modello-inspector': { percorso: PERCORSO_TESTI_MODELLO, prefisso: 'inspector.' },
    // K3-C3b-2, le schede Processi e Agenti del pannello ▤, e le frasi delle prove che la riga di un processo riusa
    'processi-scheda': { percorso: PERCORSO_TESTI_PROCESSI, prefisso: ['process.', 'agents.'] },
    'kernel-prova': { percorso: PERCORSO_TESTI_KERNEL, prefisso: 'prova.' },
    // il perché di un «Ferma / Sfonda / Togli» rifiutato (409, 404), con le parole del desktop (`errori.js`, `<CODICE>.message`)
    'errori-processi': { percorso: PERCORSO_TESTI_ERRORI, prefisso: ['PROCESS_NOT_RUNNING.', 'PROCESS_STILL_RUNNING.', 'NOT_FOUND.message'] },
    // K3-C3b-2b, la scheda Agenti: i gruppi per richiesta, i conti, le pagine (`agenti.js`), e i nomi umani degli attrezzi
    'agenti-scheda': { percorso: PERCORSO_TESTI_AGENTI, prefisso: ['workflow.request', 'graph.agent', 'graph.finishedOf', 'graph.toCheck', 'delegations.', 'agent.noTaskRecorded', 'rail.agentsTitle'] },
    'varie-attrezzi': { percorso: PERCORSO_TESTI_VARIE, prefisso: 'tools.name.' },
    // K3-RISDEL, il riquadro del risultato di un sotto-agente nella conversazione (`appendRisultatoDelega`, `descriviRisultatoDelega`)
    'app-risultato-delega': { percorso: PERCORSO_TESTI_APP, prefisso: ['delegations.result', 'common.showAll', 'common.showLess'] },
    'chat-risultato-delega': { percorso: PERCORSO_TESTI_CHAT, prefisso: ['queue.subAgent', 'child.stoppedOnRequest', 'child.pausedOnRequest'] },
    'errori-punti': { percorso: PERCORSO_TESTI_ERRORI, prefisso: 'turno.punto.' },
    // K3-FILE, l'albero dei file del pannello ▤: le parole del desktop (`app.files.*`, `app.common.*`, i fogli) e i rifiuti dei file
    'app-file': { percorso: PERCORSO_TESTI_APP, prefisso: ['files.', 'common.', 'sheets.renameFile.', 'sheets.deleteFile.', 'sheets.create.'] },
    'errori-file': { percorso: PERCORSO_TESTI_ERRORI, prefisso: ['FILE_EXISTS.', 'FILE_NOT_FOUND.', 'NOT_A_FILE.', 'FOLDER_INVALID.'] },
    // K3-TERM T3, la vista Terminale del Codice: le parole del Terminale del desktop e i nomi delle due viste
    'app-terminale': { percorso: PERCORSO_TESTI_APP, prefisso: 'terminal.' },
    'processi-terminale': { percorso: PERCORSO_TESTI_PROCESSI, prefisso: 'terminal.' },
    'modello-viste': { percorso: PERCORSO_TESTI_MODELLO, prefisso: ['chat.chat', 'chat.terminal'] },
    // K3-AP1, la carta delle approvazioni: le parole della carta, dell'esito, del contenuto sospetto e dei nomi dei permessi
    'app-approvazione': { percorso: PERCORSO_TESTI_APP, prefisso: 'approval.' },
    'chat-approvazione': { percorso: PERCORSO_TESTI_CHAT, prefisso: ['approval.', 'common.approved', 'common.fromAnotherWindow'] },
    'kernel-approvazione': { percorso: PERCORSO_TESTI_KERNEL, prefisso: ['luogo.', 'motivo.', 'contenutoSospetto.'] },
    'chat-permessi': { percorso: PERCORSO_TESTI_CHAT, prefisso: ['foot.permission.', 'foot.activeOf'] }, // K3 automazioni: anche il nome umano dei modelli (`nomeModelloUmano`)
    // K3-AP2, la carta delle domande di TALOS (`user-question-dock.js`): le parole della carta, della revisione e della ricevuta
    'chat-domande': { percorso: PERCORSO_TESTI_CHAT, prefisso: ['question.', 'common.back'] },
    // K3-C Accoda, la coda del Codice: le frasi delle voci di sistema (`coda-messaggi.js`) e le parole degli stati di un run Workflow
    'chat-coda': { percorso: PERCORSO_TESTI_CHAT, prefisso: ['queue.agentResultPrefix', 'queue.workflowOutcomePrefix', 'queue.backgroundEndPrefix', 'queue.agentMessage', 'queue.workflow', 'queue.questionFromSubAgent', 'queue.answerFromSubAgent', 'queue.questionFromMainAgent', 'background.'] },
    'agenti-coda': { percorso: PERCORSO_TESTI_AGENTI, prefisso: 'workflow.runState.' },
    // K3 Stop come il desktop (owner 16/10): la nota d'accento «Hai fermato il giro.» (`errori.js` famiglia `fermato`, `creaNotaErrore`)
    'errori-fermato': { percorso: PERCORSO_TESTI_ERRORI, prefisso: ['turno.fermato.', 'turno.vestizione.fermato.'] },
    'chat-nota': { percorso: PERCORSO_TESTI_CHAT, prefisso: 'note.serverText' },
    // K3-C Scelta del modello: i rifiuti di `/settings` e dell'invio senza chiave, con le parole del desktop (`testoErroreServer`)
    // K3-C Allegati A2/A3: le parole degli allegati e le frasi per il modello (`allegaFile`, `testoConAllegati`, `perIlModello`)
    'app-allegati': { percorso: PERCORSO_TESTI_APP, prefisso: 'attachments.' },
    // K3-C Esporta e Condividi: la trascrizione Markdown (`costruisciTrascrizioneMarkdown`) e le parole dell'esportazione
    'app-trascrizione': { percorso: PERCORSO_TESTI_APP, prefisso: ['transcript.', 'sessions.export', 'sessions.noneToExport', 'sessions.menu.exportTranscript'] },
    'errori-modello': { percorso: PERCORSO_TESTI_ERRORI, prefisso: ['CONFIG_INVALID.message', 'CONFIG_INVALID.provider_key_missing', 'CONFIG_INVALID.provider_unavailable', 'MODEL_ID_INVALID.message', 'REASONING_INVALID.message', 'PROVIDER_INVALID.message'] },
    // il perché di una risposta rifiutata (`POST /question`), con le parole del desktop (`errori.js`, `<CODICE>.message`)
    'errori-domande': { percorso: PERCORSO_TESTI_ERRORI, prefisso: ['QUESTION_NOT_PENDING.message', 'QUESTION_ANSWER_FORBIDDEN.message', 'QUESTION_ANSWER_NOT_SAVED.message', 'QUERY_INVALID.message', 'NOT_FOUND.message'] },
    // K3 pin r4 701c6c0d2: la frase del MOTIVO che il server pubblica per la persona (`fraseDelMotivo` di `errori.js`; i motivi di
    // `public-problem.mjs` MOTIVI_CON_FRASE_PER_LA_PERSONA: i rifiuti dell'albero, la chiave che manca, i terminali senza sessione)
    'errori-motivi': { percorso: PERCORSO_TESTI_ERRORI, prefisso: ['QUERY_INVALID.', 'CONFIG_INVALID.provider_key_missing', 'TERMINAL_LIMIT_REACHED.standalone_terminals_in_use'] },
    // K3 piano (ledger `LEDGER-K3-PIANO-2026-10-17.md`): la carta del piano (`plan-artifact.js`), la fascia e l'avviso
    // (`index.template.html:623-632`), il modo di lavoro e il foglio dei permessi (`legacy/app.js:9955`, `#veloPermessi`), gli
    // errori della scelta (`testoErroreServer`: le voci dei motivi e del codice, confrontate sull'inglese del server)
    'chat-piano': { percorso: PERCORSO_TESTI_CHAT, prefisso: ['plan.', 'common.approved', 'common.cancel'] },
    'app-piano': { percorso: PERCORSO_TESTI_APP, prefisso: ['plan.activeNextTurn', 'plan.updated', 'plan.planFirst', 'plan.workNormally', 'permissions.workModeLabel',
        'permissions.workModeHint', 'permissions.workModeUpdated', 'permissions.modeNotApplied', 'permissions.modeChangeHint', 'permissions.policyUpdated',
        'permissions.choiceNotApplied'] },
    'modello-permessi': { percorso: PERCORSO_TESTI_MODELLO, prefisso: ['permissions.howMuchTalosCan', 'permissions.permissionsTheyApplyTo', 'permissions.permissionLevel',
        'permissions.readOnly', 'permissions.lowRisk', 'permissions.readsTheProjectAnd', 'permissions.writesToTheProject', 'permissions.mediumRisk',
        'permissions.writesOnItsOwn', 'permissions.recommended', 'permissions.asksFirst', 'permissions.asksYouToConfirm', 'permissions.fullAccess',
        'permissions.veryHighRisk', 'permissions.filesAndNetworkWithout', 'permissions.close', 'chat.theNextMessageWill', 'chat.planUpdated',
        'chat.goToThePlan', 'chat.dismiss'] },
    // K3 automazioni, fornitori e Coordinazione (ledger `LEDGER-K3-AUTOMAZIONI-FORNITORI-COORDINAZIONE-2026-10-17.md`): le carte
    // `automazione-carta.js` e `fornitori-carta.js`, le parole di `automazioni-v2.js`, la sezione Coordinazione del foglio dei permessi
    'sezioni-automazioni': { percorso: PERCORSO_TESTI_SEZIONI, prefisso: ['automations.v2.card.', 'automations.v2.when.', 'automations.v2.day.',
        'automations.v2.sheet.name', 'automations.v2.sheet.when', 'automations.v2.sheet.repeat', 'automations.v2.row.instructions',
        'automations.v2.row.folder', 'automations.v2.row.permissions', 'automations.v2.row.repeat', 'automations.v2.row.nextNone',
        'automations.row.model', 'automations.modelServerDefault', 'automations.interval.unknown', 'common.dateNotRecorded'] },
    'app-coordinazione': { percorso: PERCORSO_TESTI_APP, prefisso: ['automations.coordination', 'sheets.permissions.coordination', 'permissions.coordinationOn',
        'permissions.coordinationOff'] },
    'varie-fornitori': { percorso: PERCORSO_TESTI_VARIE, prefisso: 'providerCard.' },
    // K3 Revisione (ledger `LEDGER-K3-REVISIONE-2026-10-17.md`): la scheda «Review», lo stato vuoto e «Copia i diff»
    // (`index.template.html:789-832`), le parole delle copie (`legacy/app.js:28745`, `uiSchedeReview`); le altre sono in `varie-pannello`
    'modello-revisione': { percorso: PERCORSO_TESTI_MODELLO, prefisso: ['review.review', 'review.copyAllDiffsTo', 'review.copyTheDiffs', 'review.changedFiles',
        'review.noFileWrittenSo', 'review.whenTalosWritesOr'] },
    'app-revisione': { percorso: PERCORSO_TESTI_APP, prefisso: ['review.', 'common.pathCopied', 'common.copyFailed'] },
    'errori-piano': { percorso: PERCORSO_TESTI_ERRORI, prefisso: ['PLAN_', 'NOT_FOUND.', 'ORIGIN_FORBIDDEN.', 'INTERNAL_ERROR.', 'QUERY_INVALID.message'] },
    // revisione del blocco 10, F-R1: codici del PC che arrivavano al telefono in inglese (r4 1c547775e; estratti a r4 c5ce4e453, i loro .message arrivano col blocco 11)
    'errori-generici': { percorso: PERCORSO_TESTI_ERRORI, prefisso: ['PROVIDER_KEY_MISSING.', 'DELEGATION_READ_ONLY.', 'FORGE_INVALID.', 'HISTORY_RECOVERY_AMBIGUOUS.', 'START_OPERATION_CONFLICT.'] },
    // ESITO-RIGA (Pad, 27/10/2026, parità col PC): le parole di una riga d'attrezzo non riuscita (`riassuntoAttrezzoConcluso`, `app.js:16140`)
    'varie-esiti': { percorso: PERCORSO_TESTI_VARIE, prefisso: ['tools.kind.reading.failedOne', 'tools.kind.search.failedOne', 'tools.kind.listing.failedOne', 'tools.kind.writing.failedOne', 'tools.kind.command.failedOne', 'tools.kind.page.failedOne'] },
    'app-esiti': { percorso: PERCORSO_TESTI_APP, prefisso: ['activity.stepFailed', 'activity.duplicateSkipped'] },
    // IMPOSTAZIONE-RIFIUTATA (Desktop 27/10/2026): l'avviso di una scelta delle impostazioni che il PC non ha salvato (`sincronizzaImpostazioniSessione`)
    'app-impostazioni': { percorso: PERCORSO_TESTI_APP, prefisso: ['settings.preferenceNotSaved'] },
    // CENSIMENTO G (b), FRASI-UNICHE (Desktop 27/10/2026): i codici che le scritture remote rendono e che arrivavano in inglese; gli ultimi otto
    // li ha aggiunti il Desktop (r4 79ea996de, ramo cura/blocco-11), ogni voce inglese è il testo LETTERALE del server
    'errori-remoti': { percorso: PERCORSO_TESTI_ERRORI, prefisso: ['APPROVAL_ANSWER_FORBIDDEN.', 'APPROVAL_NOT_PENDING.', 'NOT_ALLOWED_REMOTELY.', 'RUNTIME_NOT_AVAILABLE.',
        'SESSION_CHANGED_ELSEWHERE.', 'SESSION_LEASED.', 'SESSION_STORE_AMBIGUOUS.', 'SESSION_STORE_WRITE_FAILED.', 'CONSENT_NOT_PENDING.', 'REMOTE_CONSENTS_UNREADABLE.',
        'OUTPUT_SESSION_BUSY.', 'WORKFLOW_STORE_IO.', 'OPERATION_FAILED.', 'BAD_MESSAGE.', 'TOO_LARGE.', 'UNKNOWN_OPERATION.', 'VERSION_UNSUPPORTED.', 'REMOTE_FOLDERS_FILE.',
        // blocco 11 del Desktop (r4 6a4fc5e2b): le voci col testo LETTERALE delle rotte del ponte remoto (guardia dei letterali, 27/10)
        'CONSENT_REQUIRED.', 'FILE_GONE.', 'FOLDER_NOT_LISTED.', 'REMOTE_UNAVAILABLE.', 'REMOTE_STORE_BUSY.',
        'NOT_FOUND.device_session_not_found', 'NOT_FOUND.consent_request_not_found', 'NOT_FOUND.bridge_route'] },
    // ELENCO-R4 (ledger `LEDGER-ELENCO-SESSIONI-R4-2026-10-18.md`): il perché di una rinomina o di un'eliminazione rifiutata dall'elenco
    // delle sessioni. La busta di r4 porta un `message` generico («Invalid query», «Operation failed», misurato sul Pad): conta il motivo.
    'errori-sessioni': { percorso: PERCORSO_TESTI_ERRORI, prefisso: ['SESSION_STILL_RUNNING.', 'WORKFLOW_RUN_NOT_FINISHED.', 'SESSION_NOT_READY.',
        'NOT_FOUND.session_not_found', 'NOT_FOUND.session_deleted', 'QUERY_INVALID.session_name_invalid'] },
    // ⛔ CHATGPT NEL CODICE (ledger `LEDGER-CHATGPT-NEL-CODICE-2026-10-18.md`): i codici del piano che r4 manda (custode, giro, rotte).
    // Quelli che nomina un posto del desktop («in Fornitori») li dice la frase del telefono (`models.chatgptErrors`), che vince.
    'errori-chatgpt': { percorso: PERCORSO_TESTI_ERRORI, prefisso: 'CHATGPT_' },
    // ⛔ CODICE COL MOTORE LOCALE (ledger `LEDGER-CODICE-MOTORE-LOCALE-2026-10-18.md`, r4 0f3f90f8e): i rifiuti della fonte `locale-ospite`
    // (la spinta) e del motore dell'app durante il giro (occupato, nessun modello, modello cambiato, non risponde)
    'errori-locale': { percorso: PERCORSO_TESTI_ERRORI, prefisso: ['LOCAL_GUEST_', 'kernel.motoreOspite'] },
    // ⛔ D-0147-ERR-2 (Pad, 27/10, Desktop: «una tabella sola»): K3 scrive i messaggi del kernel in INGLESE e il desktop li dice nella
    // lingua dell'interfaccia (`components/errori.js` `MESSAGGI_DEL_KERNEL`). Qui TUTTE le voci `kernel.*` E le regole stesse, prese
    // dallo stesso commit: il telefono non ne tiene una copia a mano che invecchia (sostituisce `errori-kernel-locale-r4.json`).
    'errori-kernel': { percorso: PERCORSO_TESTI_ERRORI, prefisso: 'kernel.', regole: { percorso: PERCORSO_REGOLE_ERRORI, tabella: 'MESSAGGI_DEL_KERNEL' } },
    // ⛔ T8, il corpo della riga d'attrezzo (ledger `LEDGER-T8-CORPO-DELLA-RIGA-2026-10-27.md`, r4 79ea996de): la frase del NO del kernel
    // (`spiegaRifiutoAttrezzo`), il verdetto e il posto di un comando (`esito-comando.js`), le parole del corpo (`app.js` :23425-23636)
    'errori-turno-no': { percorso: PERCORSO_TESTI_ERRORI, prefisso: ['turno.no.', 'turno.rifiuto.'] },
    'chat-comando': { percorso: PERCORSO_TESTI_CHAT, prefisso: ['command.where.', 'command.outcome.'] },
    'app-attivita': { percorso: PERCORSO_TESTI_APP, prefisso: ['activity.noOutput', 'activity.outputLabel', 'activity.diagnosticsLabel', 'activity.moreLinesOne',
        'activity.moreLinesMany', 'activity.characters', 'activity.failedOne', 'activity.failedMany', 'activity.interruptedOne', 'activity.interruptedMany',
        'activity.arg.'] },
}

/** Un dizionario d'area di r4 a quel commit (`export default { it: {…}, en: {…} }`), letto come modulo; con `prefisso` (uno o più), solo quelle chiavi. */
export async function estraiTestiR4({ r4, commit, percorso, prefisso = null }) {
    const completo = execFileSync('git', ['-C', r4, 'rev-parse', '--verify', `${commit}^{commit}`], { encoding: 'utf8' }).trim()
    const sorgente = execFileSync('git', ['-C', r4, 'show', `${completo}:${percorso}`])
    const cartella = mkdtempSync(join(tmpdir(), 'testi-r4-'))
    try {
        const file = join(cartella, 'testi.mjs')
        writeFileSync(file, sorgente)
        const { default: testi } = await import(pathToFileURL(file).href)
        if (!testi || typeof testi.it !== 'object' || typeof testi.en !== 'object') throw new Error(`${percorso}: forma inattesa`)
        const prefissi = prefisso === null ? null : [].concat(prefisso)
        const filtra = (voci) => (prefissi ? Object.fromEntries(Object.entries(voci).filter(([k]) => prefissi.some((p) => k.startsWith(p)))) : voci)
        const origine = { commit: completo, percorso, sha256: createHash('sha256').update(sorgente).digest('hex') }
        return { origine: prefisso ? { ...origine, prefisso } : origine, it: filtra(testi.it), en: filtra(testi.en) }
    } finally {
        rmSync(cartella, { recursive: true, force: true })
    }
}

/**
 * Una tabella di regole del desktop (`const <tabella> = [ { chiave, re, parametri? }, … ];`) a quel commit, come DATI: per ogni voce
 * la chiave, la sorgente e i flag dell'espressione, e i nomi dei parametri che `parametri` produce. La tabella si valuta in un contesto vuoto con un `t` finto: nessun import, nessun effetto. Fallisce se la tabella non c'è o cambia forma.
 * ⛔ Revisione del blocco 8 (Desktop, F-R2): `node:vm` NON è un confine di sicurezza; qui va bene perché il testo è un file del
 * nostro repo a un commit fissato. Tutto (tabella E chiamate a `parametri`) gira DENTRO il contesto, sotto lo stesso tetto di 1 s,
 * ed esce come JSON: oggetti di questo contesto, nessuna funzione che torna fuori.
 */
export function estraiRegoleR4({ r4, commit, percorso, tabella }) {
    const completo = execFileSync('git', ['-C', r4, 'rev-parse', '--verify', `${commit}^{commit}`], { encoding: 'utf8' }).trim()
    const sorgente = execFileSync('git', ['-C', r4, 'show', `${completo}:${percorso}`], { encoding: 'utf8' })
    const testa = `const ${tabella} = [`
    const da = sorgente.indexOf(testa)
    if (da < 0) throw new Error(`${percorso}: manca ${tabella}`)
    const a = sorgente.indexOf('\n];', da)
    if (a < 0) throw new Error(`${percorso}: ${tabella} senza fine`)
    const testoTabella = sorgente.slice(da + testa.length - 1, a + 2)
    // i nomi dei parametri dal loro COMPORTAMENTO: la funzione su un risultato finto (il `t` finto rende la chiave)
    const comeDati = `JSON.stringify((${testoTabella}).map((v) => ({
        chiave: v && v.chiave, re: Object.prototype.toString.call(v && v.re) === '[object RegExp]',
        sorgente: v && v.re && v.re.source, flag: v && v.re && v.re.flags,
        parametri: v && typeof v.parametri === 'function' ? Object.keys(v.parametri(['', '1', '2', '3']) || {}) : [],
    })))`
    const voci = JSON.parse(runInNewContext(comeDati, { t: (chiave) => chiave }, { timeout: 1000 }))
    if (!Array.isArray(voci) || voci.length === 0) throw new Error(`${percorso}: ${tabella} vuota o non è un elenco`)
    const regole = voci.map((v, i) => {
        if (typeof v?.chiave !== 'string' || v.re !== true) throw new Error(`${percorso}: ${tabella}[${i}] senza chiave o re`)
        return { chiave: v.chiave, sorgente: v.sorgente, flag: v.flag, parametri: v.parametri }
    })
    return { origine: { commit: completo, percorso, tabella, sha256: createHash('sha256').update(sorgente).digest('hex') }, regole }
}

/** Il dizionario `server` di r4 a quel commit. */
export function estraiTestiServerR4({ r4, commit }) {
    return estraiTestiR4({ r4, commit, percorso: PERCORSO_TESTI_SERVER })
}

function argomento(nome, riserva) {
    const i = process.argv.indexOf(`--${nome}`)
    if (i < 0 || !process.argv[i + 1]) {
        if (riserva !== undefined) return riserva
        throw new Error(`manca --${nome}`)
    }
    return process.argv[i + 1]
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const area = AREE[argomento('area', 'server')]
    if (!area) throw new Error(`area sconosciuta: ${argomento('area')}`)
    const { regole: tabellaRegole, ...dizionario } = area
    const testi = await estraiTestiR4({ r4: argomento('r4'), commit: argomento('commit'), ...dizionario })
    if (tabellaRegole) {
        const { origine, regole } = estraiRegoleR4({ r4: argomento('r4'), commit: argomento('commit'), ...tabellaRegole })
        Object.assign(testi, { origineRegole: origine, regole })
    }
    writeFileSync(argomento('uscita'), `${JSON.stringify(testi, null, 2)}\n`)
    console.log(`${Object.keys(testi.it).length} voci da ${testi.origine.commit.slice(0, 9)} (sha256 ${testi.origine.sha256.slice(0, 12)}…)`)
}
