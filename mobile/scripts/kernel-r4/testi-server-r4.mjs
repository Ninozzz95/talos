#!/usr/bin/env node
/**
 * ⛔ K3-C3a2 — i testi che il server r4 manda alla persona (`<campo>Chiave`, area `server`), presi dal dizionario del desktop
 * al COMMIT fissato, mai dall'albero di lavoro (stessa regola di `copia-r4.mjs`). Il risultato è un JSON con la provenienza:
 * `{ origine: { commit, percorso, sha256 }, it, en }`. Le regole per dirli stanno in `src/lib/harness/r4/testiServerR4.ts`.
 *
 * K3-C2b: anche le chiavi `doctor.*` dell'area `varie` (i testi del Doctor), filtrate per prefisso; il prefisso entra nella provenienza.
 *
 * Uso: node scripts/kernel-r4/testi-server-r4.mjs --r4 <checkout r4> --commit <sha> --uscita <file.json> [--area server|varie-doctor|processi-inspector|varie-pannello|modello-inspector|processi-scheda|kernel-prova|errori-processi|agenti-scheda|varie-attrezzi|app-risultato-delega|chat-risultato-delega|errori-punti|app-file|errori-file|app-terminale|processi-terminale|modello-viste|app-approvazione|chat-approvazione|kernel-approvazione|chat-permessi|chat-domande|errori-domande|chat-coda|agenti-coda|errori-fermato|chat-nota|errori-modello|app-allegati|app-trascrizione|errori-motivi|chat-piano|app-piano|modello-permessi|errori-piano|sezioni-automazioni|app-coordinazione|varie-fornitori|errori-sessioni]
 */
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
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
    // ELENCO-R4 (ledger `LEDGER-ELENCO-SESSIONI-R4-2026-10-18.md`): il perché di una rinomina o di un'eliminazione rifiutata dall'elenco
    // delle sessioni. La busta di r4 porta un `message` generico («Invalid query», «Operation failed», misurato sul Pad): conta il motivo.
    'errori-sessioni': { percorso: PERCORSO_TESTI_ERRORI, prefisso: ['SESSION_STILL_RUNNING.', 'WORKFLOW_RUN_NOT_FINISHED.', 'SESSION_NOT_READY.',
        'NOT_FOUND.session_not_found', 'NOT_FOUND.session_deleted', 'QUERY_INVALID.session_name_invalid'] },
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
    const testi = await estraiTestiR4({ r4: argomento('r4'), commit: argomento('commit'), ...area })
    writeFileSync(argomento('uscita'), `${JSON.stringify(testi, null, 2)}\n`)
    console.log(`${Object.keys(testi.it).length} voci da ${testi.origine.commit.slice(0, 9)} (sha256 ${testi.origine.sha256.slice(0, 12)}…)`)
}
