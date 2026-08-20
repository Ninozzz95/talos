#!/usr/bin/env node
/**
 * Le prove dei cancelli.
 *
 * ⛔ Ogni regola si prova nei DUE versi: che fermi quando deve, e che LASCI
 * PASSARE quando non c'entra. Il secondo verso conta di più — un cancello che
 * blocca troppo si fa spegnere, e un cancello spento difende zero.
 */
import { decidiCancello, TAVOLA } from './cancelli.mjs'

let falliti = 0
const prova = (nome, condizione) => {
    if (condizione) return
    falliti += 1
    console.error(`  ⛔ ${nome}`)
}

const CODICE = 'C:\\x\\mobile\\src\\lib\\tools\\intentiTools.ts'
const scrittura = (file, extra = {}) => ({
    tool_name: 'Edit',
    tool_input: { file_path: file, new_string: 'const a = 1', ...extra },
})
const fermato = (input, eventi = []) => decidiCancello(input, eventi) !== null
const perche = (input, eventi = []) => decidiCancello(input, eventi)
    ?.hookSpecificOutput?.permissionDecisionReason ?? ''

console.log('la ricerca prima di implementare')
prova('ferma una modifica al codice senza ricerca',
    fermato(scrittura(CODICE)))
prova('e dice PERCHE, col numero',
    /73%|33%/.test(perche(scrittura(CODICE))))
prova('lascia passare se la ricerca c e stata',
    !fermato(scrittura(CODICE), [{ name: 'WebSearch', command: '' }]))
prova('e vale anche una WebFetch',
    !fermato(scrittura(CODICE), [{ name: 'WebFetch', command: '' }]))

console.log('e NON si mette in mezzo dove non c entra')
prova('un test non e codice di produzione',
    !fermato(scrittura('C:\\x\\mobile\\tests\\unit\\a.test.ts')))
prova('un documento nemmeno',
    !fermato(scrittura('C:\\x\\mobile\\docs\\piano.md')))
prova('il banco nemmeno',
    !fermato(scrittura('C:\\x\\banco\\sonda.mjs')))
prova('lo scratchpad nemmeno',
    !fermato(scrittura('C:\\Temp\\claude\\scratchpad\\nota.txt')))
prova('e nemmeno uno strumento che LEGGE',
    !fermato({ tool_name: 'Read', tool_input: { file_path: CODICE } }))
prova('ne uno che esegue',
    !fermato({ tool_name: 'Bash', tool_input: { command: 'npm test' } }))

console.log('la via d uscita, che si DICHIARA')
prova('passa se ho dichiarato SENZA RICERCA e il perche',
    !fermato({ ...scrittura(CODICE), last_assistant_message: '⛔ SENZA RICERCA: e un rinominare' }))
prova('⛔ ma NON vale per le altre regole',
    fermato({
        tool_name: 'Write',
        tool_input: { file_path: 'C:\\x\\CHANGELOG.md', content: 'Il messaggio è stato inviato' },
        last_assistant_message: '⛔ SENZA RICERCA: no',
    }, [{ name: 'WebSearch', command: '' }]))

console.log('lo screenshot si guarda')
const conRicerca = [{ name: 'WebSearch', command: '' }]
prova('ferma se lo screenshot e stato preso e mai aperto',
    fermato(scrittura(CODICE), [...conRicerca, { name: 'Bash', command: 'adb exec-out screencap -p > a.png' }]))
prova('passa se poi e stato APERTO',
    !fermato(scrittura(CODICE), [
        ...conRicerca,
        { name: 'Bash', command: 'adb exec-out screencap -p > a.png' },
        { name: 'Read', command: 'C:\\tmp\\a.png' },
    ]))
prova('e non chiede niente se nessuno screenshot e stato preso',
    !fermato(scrittura(CODICE), conRicerca))

console.log('fuori si scrive in inglese')
const pubblico = (testo) => ({
    tool_name: 'Write',
    tool_input: { file_path: 'C:\\x\\CHANGELOG.md', content: testo },
})
prova('ferma l italiano nel CHANGELOG',
    fermato(pubblico('Il messaggio non è stato inviato'), conRicerca))
prova('ferma anche «perché»',
    fermato(pubblico('non parte perché manca il permesso'), conRicerca))
prova('lascia passare l inglese',
    !fermato(pubblico('The message was not sent because the permission is missing'), conRicerca))
/*
 * ⛔ IL VERSO CHE CONTA: un file INTERNO in italiano deve passare. Se questa
 * diventasse rossa vorrebbe dire che il cancello ha invaso la lingua di casa.
 */
prova('e l italiano nei documenti interni NON si tocca',
    !fermato({
        tool_name: 'Write',
        tool_input: { file_path: 'C:\\x\\mobile\\docs\\piano.md', content: 'Il piano è questo' },
    }, conRicerca))

console.log('la tavola dice la verita su se stessa')
prova('ogni riga dichiara DOVE e difesa',
    TAVOLA.every((r) => ['qui', 'altrove', 'giudizio'].includes(r.dove)))
prova('ogni riga rimanda a una memoria',
    TAVOLA.every((r) => typeof r.memoria === 'string' && r.memoria.length > 0))
prova('le regole di QUI hanno tutte un motivo e le due funzioni',
    TAVOLA.filter((r) => r.dove === 'qui')
        .every((r) => typeof r.quando === 'function'
            && typeof r.soddisfatta === 'function'
            && typeof r.motivo === 'string' && r.motivo.length > 40))
/*
 * ⛔ E le righe «giudizio» NON devono avere le funzioni: se qualcuno un giorno
 * gliele aggiungesse, il cancello comincerebbe a indovinare su cose che non
 * sono osservabili — ed e proprio cio che questo file dichiara di non fare.
 */
prova('e quelle di giudizio non fingono di essere osservabili',
    TAVOLA.filter((r) => r.dove !== 'qui').every((r) => r.quando === undefined))

if (falliti > 0) {
    console.error(`\n⛔ ${falliti} prove rosse`)
    process.exit(1)
}
console.log('\n✓ tutte verdi')
