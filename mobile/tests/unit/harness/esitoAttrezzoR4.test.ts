import { describe, expect, it } from 'vitest'
import { esitoAttrezzoFallito, esitoDellaChiamataR4, esitoDichiaraFallimento } from '@/lib/harness/r4/esitoAttrezzoR4'
import { talosSequenzaDaMetadata } from '@/lib/chat/sequenzaDelTurno'

/**
 * ESITO-RIGA: la decisione del PC portata 1:1 da r4 @ c5ce4e453. FALLITI e RIUSCITI sono quelli di
 * `harness-ui/frontend/tests/unit/esito-dichiara-fallimento.test.mjs` (ESITO-FAIL-01/02), copiati tali e quali: se il PC cambia la
 * regola, chi ripinna r4 rifà questa lista.
 */
const FALLITI: [string, string][] = [
    ['workflow_plan_propose', 'workflow_plan_propose failed [WORKFLOW_DEFINITION_INVALID]: phase "p2" has no nodes'],
    ['workflow_plan_propose', 'workflow_plan_propose failed [QUERY_INVALID]: expected exactly one "draft" object (title, objective, phases, nodes) and a valid tool call identity.'],
    ['notes_create', 'notes_create failed: title is required'],
    ['ask_user_question', 'ask_user_question failed [QUERY_INVALID]: questions must be an array'],
    ['web_search', 'search failed: blocked by policy'],
    ['delega_sottotask', 'delegation failed: child limit reached'],
    ['workflow_plan_propose', 'REFUSED. workflow_plan_propose requires the root agent with a planning store. Nothing was proposed.'],
    ['leggi', 'ERROR: file not found'],
]

const RIUSCITI: [string, string][] = [
    ['workflow_plan_propose', '{"schema":"talos.workflow-proposal-receipt.v1","workflowId":"902e47a4-b29b-854e-8cd6-8f5d1bb43acd","version":1,"status":"proposed","preflight":{"errors":[],"warnings":[]}}'],
    ['leggi', 'notes_create failed: this line is inside a log file'],
    ['cerca', 'build failed: src/a.mjs:12'],
    ['notes_create', '{"id":"n-1","title":"ok"}'],
    ['notes_create', 'notes_create failed to be slow, all good'],
]

describe('ESITO-RIGA — la decisione del PC', () => {
    it('ESITO-FAIL-01 un esito «<attrezzo> failed…» o un no del kernel è un fallimento', () => {
        for (const [nome, testo] of FALLITI) expect(esitoDichiaraFallimento(nome, testo), `${nome}: ${testo.slice(0, 60)}`).toBe(true)
    })

    it('ESITO-FAIL-02 AL CONTRARIO: una ricevuta, un file che nomina un altro attrezzo, un «failed» senza contratto restano riusciti', () => {
        for (const [nome, testo] of RIUSCITI) expect(esitoDichiaraFallimento(nome, testo), `${nome}: ${testo.slice(0, 60)}`).toBe(false)
    })

    it('ESITO-RIGA-01 il comando dal codice d\'uscita: fermato non è fallito, senza intestazione non è un comando', () => {
        expect(esitoAttrezzoFallito('shell', 'exit 1 [sandbox: none]\nnope')).toBe(true)
        expect(esitoAttrezzoFallito('shell', 'exit null\n')).toBe(true)
        expect(esitoAttrezzoFallito('shell', 'exit -1\n')).toBe(true)
        expect(esitoAttrezzoFallito('shell', 'exit 0 [sandbox: wsl2 (Linux in WSL as nino; …)]\nok')).toBe(false)
        expect(esitoAttrezzoFallito('shell', 'exit 130\n')).toBe(false)
        expect(esitoAttrezzoFallito('shell', 'exit 137\n')).toBe(false)
        expect(esitoAttrezzoFallito('shell', 'REFUSED. not a header')).toBe(false)
        // le righe per il modello prima dell'intestazione non nascondono il codice
        expect(esitoAttrezzoFallito('shell', '[shell output: stdout and stderr combined in arrival order; stream identity is not preserved]\nexit 2\nx')).toBe(true)
        expect(esitoAttrezzoFallito('prova', 'ℹ fail 3')).toBe(true)
        expect(esitoAttrezzoFallito('prova', 'ℹ fail 0')).toBe(false)
    })

    it('ESITO-RIGA-02 l\'ordine del PC: doppione, interrotta, non eseguita, errore', () => {
        expect(esitoDellaChiamataR4('leggi', { content: 'ERROR: x', duplicate: true })).toBe('doppione')
        expect(esitoDellaChiamataR4('shell', { content: 'exit 124\n', isError: true })).toBe('interrotta')
        expect(esitoDellaChiamataR4('prova', { content: 'NOT RUN: NO_TESTS_RAN' })).toBe('non-eseguita')
        expect(esitoDellaChiamataR4('remote_phone_pair', { content: 'REFUSED. Remote control is off on this computer.' })).toBe('non-eseguita')
        expect(esitoDellaChiamataR4('remote_device_send_file', { content: 'REFUSED. FILE_TOO_LARGE: 40 MB' })).toBe('non-eseguita')
        expect(esitoDellaChiamataR4('remote_device_send_file', { content: 'REFUSED. DEVICE_OFFLINE: gone' })).toBe('errore')
        expect(esitoDellaChiamataR4('leggi', { content: 'ciao' })).toBeUndefined()
    })

    it('ESITO-RIGA-03 la ricevuta prima del testo; effect_unknown lascia decidere il testo', () => {
        expect(esitoDellaChiamataR4('scrivi', { content: 'Wrote 3 bytes', receipt: { status: 'denied' } })).toBe('errore')
        expect(esitoDellaChiamataR4('scrivi', { content: 'Wrote 3 bytes', receipt: { consentito: false } })).toBe('errore')
        expect(esitoDellaChiamataR4('scrivi', { content: 'Wrote 3 bytes', receipt: { status: 'failed' } })).toBe('errore')
        expect(esitoDellaChiamataR4('scrivi', { content: 'REFUSED. x', receipt: { status: 'succeeded', consentito: true } })).toBeUndefined()
        expect(esitoDellaChiamataR4('scrivi', { content: 'REFUSED. x', receipt: { status: 'effect_unknown' } })).toBe('errore')
        expect(esitoDellaChiamataR4('scrivi', { content: 'Wrote 3 bytes', receipt: { status: 'effect_unknown' } })).toBeUndefined()
        expect(esitoDellaChiamataR4('scrivi', { content: 'Wrote 3 bytes', isError: true })).toBe('errore')
        expect(esitoDellaChiamataR4('scrivi', { content: 'REFUSED. x', isError: false })).toBe('errore')
    })

    it('ESITO-RIGA-04 riletto dal disco: un esito noto resta, uno storto si toglie e la riga resta', () => {
        const letta = talosSequenzaDaMetadata([{ tipo: 'attrezzi', attrezzi: [
            { name: 'scrivi', detail: 'a.txt', esito: 'errore' },
            { name: 'scrivi', detail: 'b.txt', esito: 'boh' },
            { name: 'shell', detail: 'ls', esito: 'interrotta' },
        ] }])
        expect(letta).toEqual([{ tipo: 'attrezzi', attrezzi: [
            { name: 'scrivi', detail: 'a.txt', esito: 'errore' },
            { name: 'scrivi', detail: 'b.txt' },
            { name: 'shell', detail: 'ls', esito: 'interrotta' },
        ] }])
    })
})
