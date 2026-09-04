#!/usr/bin/env node
/**
 * ⛔⛔⛔⛔ IL CANCELLO DELLA RICERCA WEB.
 *
 * Owner, 2026-09-04, dopo la SECONDA violazione della stessa regola nello
 * stesso giorno:
 *
 * > «puoi fare in modo che l'hook ti imponga di fare una ricerca web ad ogni
 * > passo implementativo e fix? questa cosa deve essere enforced, perché dati
 * > i precedenti sono sicuro che verrà violata ancora»
 *
 * Ha ragione sui precedenti. Le due violazioni del 04/09:
 *  1. **delegando**: ho girato la regola a un agente e poi ho scritto io un
 *     brief tecnico senza cercare. La ricerca fatta dopo ha mostrato che il
 *     pulsante «+» promette una cosa e ne apre un'altra.
 *  2. **scrivendo codice**: la cura di W0-07 presa dalla mia diagnosi. La
 *     ricerca fatta dopo ha aggiunto due vincoli che non conoscevo (stream
 *     persistente, `fsync`).
 *
 * In entrambi i casi non mancava la soluzione: mancavano i VINCOLI. E in
 * entrambi i casi ero sicuro di sapere già. ⇒ Una regola che si applica
 * quando *credo* di non averne bisogno non può vivere nella mia memoria:
 * deve essere un cancello.
 *
 * ## Cosa fa
 *
 * Prima di ogni scrittura su **codice di prodotto**, guarda nel transcript se
 * da quando l'owner ha parlato l'ultima volta è stata fatta almeno una
 * ricerca — `WebSearch`, `WebFetch`, o la CLI `ctx7` (le regole globali
 * dicono di usarla per la documentazione di una libreria). Se non c'è,
 * **nega** e dice cosa cercare.
 *
 * ## Cosa NON blocca, e perché
 *
 * - `.claude/**` (ledger, guide, memoria, e questi stessi hook): sono
 *   documenti. Bloccarli impedirebbe perfino di riparare questo file.
 * - I file fuori dal codice di prodotto (`*.md`, `.gitignore`, dati di prova).
 * - Le scritture nella cartella temporanea di sessione (script usa-e-getta).
 *
 * ⛔ I test NON sono esclusi: scrivere un test è un passo implementativo, e
 * il modo in cui un test morde dipende da come lo fanno gli altri.
 *
 * ## Il limite, dichiarato
 *
 * Legge il transcript della sessione che sta scrivendo. Se un agente
 * delegato scrive nel proprio transcript, il cancello guarda quello — quindi
 * vale anche per lui, ma solo se Claude Code gli passa il suo file. Se un
 * giorno non lo passasse, il cancello lascerebbe passare: per questo la
 * regola resta anche nel prompt di ogni agente, e non solo qui.
 */

import { readFileSync } from 'node:fs'

import { eventiDelTurno } from './cancelli.mjs'

/**
 * ⛔⛔ 04/9, POCHE ORE DOPO AVERLO SCRITTO — questo cancello **negava sempre**
 * a un agente delegato. `eventiDelTurno` azzera il conto a ogni messaggio
 * `user` con contenuto testuale, e nel transcript di un agente **ogni
 * risultato di strumento ha quella forma**: il conto ripartiva da zero dopo
 * ogni chiamata, quindi nessuna ricerca risultava mai fatta. L'agente su
 * W1-02 lo ha scoperto lavorando: aveva fatto sei ricerche vere e ha dovuto
 * aggirare il cancello scrivendo i file con uno script.
 *
 * ⇒ Un cancello che nega anche a chi ha obbedito insegna solo ad aggirarlo.
 * Qui si guarda una **finestra recente** del transcript invece del solo turno:
 * se una ricerca c'è fra le ultime N voci, vale. Nella sessione principale il
 * turno corrente sta comunque dentro la finestra; nel transcript di un agente
 * la finestra sopravvive ai falsi azzeramenti.
 */
export function eventiRecenti(testoTranscript, finestra = 300) {
    const righe = String(testoTranscript ?? '').split('\n').filter(Boolean)
    const eventi = []
    for (const riga of righe.slice(-finestra)) {
        let voce
        try { voce = JSON.parse(riga) } catch { continue }
        const contenuto = voce?.message?.content
        if (!Array.isArray(contenuto)) continue
        for (const parte of contenuto) {
            if (parte?.type !== 'tool_use') continue
            eventi.push({ name: parte.name, command: parte?.input?.command ?? parte?.input?.file_path ?? '' })
        }
    }
    return eventi
}

/** Estensioni che sono codice eseguibile del prodotto. */
const ESTENSIONI_CODICE = ['.mjs', '.js', '.cjs', '.ts', '.tsx', '.jsx', '.vue', '.css', '.html', '.java', '.kt', '.py']

/** Cartelle esenti: documenti e appunti, mai codice che gira per l'owner. */
const ESENTI = ['/.claude/', '\\.claude\\', '/appdata/local/temp/', '\\appdata\\local\\temp\\', '/talos-ricerche/', '\\talos-ricerche\\']

/** Gli strumenti che contano come «ho cercato». */
const RICERCHE = ['WebSearch', 'WebFetch']

export function eCodiceDiProdotto(percorso) {
    const p = String(percorso ?? '').toLowerCase()
    if (p === '') return false
    if (ESENTI.some((e) => p.includes(e))) return false
    return ESTENSIONI_CODICE.some((e) => p.endsWith(e))
}

/** Una riga di Bash che invoca `ctx7` è una ricerca di documentazione, non un comando qualunque. */
export function eRicerca(evento) {
    if (RICERCHE.includes(evento?.name)) return true
    return evento?.name === 'Bash' && /\bctx7\b/.test(String(evento?.command ?? ''))
}

export function serveRicerca({ strumento, percorso, eventi }) {
    const scrittura = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(strumento)
    if (!scrittura) return false
    if (!eCodiceDiProdotto(percorso)) return false
    return !(eventi ?? []).some(eRicerca)
}

const MOTIVO = [
    '⛔ RICERCA WEB MANCANTE — regola dell\'owner, resa un cancello il 04/09 dopo due violazioni in un giorno.',
    '',
    'Stai per scrivere codice di prodotto e da quando l\'owner ha parlato non risulta NESSUNA ricerca',
    '(WebSearch, WebFetch o la CLI ctx7).',
    '',
    'Cerca PRIMA, anche se sei sicuro di sapere già come si fa: le due volte che è successo non',
    'mancava la soluzione, mancavano i vincoli (il pulsante che prometteva un\'altra cosa; lo stream',
    'persistente e l\'fsync che la coda di scrittura da sola non copre).',
    '',
    'Cosa cercare, in concreto: come risolvono questo stesso problema i concorrenti dell\'ultimo mese',
    '(Hermes Agent è il primo nome), quali vincoli dichiarano, e quale numero rende il risultato',
    'verificabile. Poi cita fonte e data nel ledger e nel commit.',
].join('\n')

function leggiStdin() {
    return new Promise((resolve) => {
        let dati = ''
        process.stdin.setEncoding('utf8')
        process.stdin.on('data', (pezzo) => { dati += pezzo })
        process.stdin.on('end', () => resolve(dati))
        setTimeout(() => resolve(dati), 4000)
    })
}

function nega(motivo) {
    console.log(JSON.stringify({
        hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: motivo,
        },
    }))
}

async function principale() {
    let input
    try { input = JSON.parse(await leggiStdin()) } catch { process.exit(0) }

    const strumento = input?.tool_name ?? ''
    const percorso = input?.tool_input?.file_path ?? input?.tool_input?.notebook_path ?? ''

    let transcript = ''
    try { transcript = readFileSync(input?.transcript_path ?? '', 'utf8') } catch { transcript = '' }
    // ⛔ Transcript illeggibile: NON si blocca. Un cancello che nega per un file che non riesce
    // ad aprire diventa un muro cieco, e un muro cieco viene aggirato invece che rispettato.
    if (transcript === '') process.exit(0)

    // Vale la ricerca più recente delle due letture: il turno (sessione principale)
    // oppure la finestra (agente delegato, dove il turno si azzera di continuo).
    const eventi = [...eventiDelTurno(transcript), ...eventiRecenti(transcript)]
    if (serveRicerca({ strumento, percorso, eventi })) {
        nega(MOTIVO)
        process.exit(0)
    }
    process.exit(0)
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
    principale()
}
