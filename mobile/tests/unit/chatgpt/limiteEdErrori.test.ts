// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { ATTESA_LIMITE_DEL_PIANO_MS, attesaDelLimiteDelPiano, erroreDelPiano } from '@/lib/chatgpt/richiesta'

/**
 * N15 (mobile, 13/10/2026): le due regole del piano che il file portato dal desktop non copre da solo.
 * Fonte: errors-and-recovery — il limite d'uso è una PAUSA con «Manage usage», mai «piano esaurito» e mai un cambio di
 * strada di pagamento; il 429 su questa strada è il limite d'uso del piano.
 */
describe('N15 — limite d uso ed errori del piano', () => {
    it('N15-LIMITE-01: senza indicazioni si aspetta 30 minuti; con Retry-After si aspetta quello; oltre 24 ore non si aspetta', () => {
        expect(attesaDelLimiteDelPiano(null)).toBe(ATTESA_LIMITE_DEL_PIANO_MS)
        expect(attesaDelLimiteDelPiano({})).toBe(30 * 60 * 1000)
        expect(attesaDelLimiteDelPiano({ 'retry-after': '120' })).toBe(120_000)
        expect(attesaDelLimiteDelPiano(new Headers({ 'retry-after-ms': '2500' }))).toBe(2500)
        expect(attesaDelLimiteDelPiano({ 'retry-after': '0' })).toBe(1000)
        expect(attesaDelLimiteDelPiano({ 'retry-after': String(25 * 60 * 60) })).toBeNull()
        expect(attesaDelLimiteDelPiano({ 'retry-after': 'domani' })).toBe(ATTESA_LIMITE_DEL_PIANO_MS)
    })

    it('N15-ERRORI-01: il 429 è il limite del piano e non è «riprova subito»; il codice di OpenAI vince sullo stato', () => {
        const limite = erroreDelPiano({ statusCode: 429, responseBody: '{}', responseHeaders: { 'x-request-id': 'req_1' } })
        expect(limite).toMatchObject({ code: 'CHATGPT_LIMITE_DEL_PIANO', transitorio: false, stato: 429, idRichiesta: 'req_1', fornitore: 'chatgpt' })
        const nonAmmesso = erroreDelPiano({ statusCode: 400, responseBody: JSON.stringify({ error: { code: 'subscription_sharing_unsupported_capability', param: 'temperature' } }) })
        expect(nonAmmesso).toMatchObject({ code: 'CHATGPT_RICHIESTA_NON_AMMESSA', parametro: 'temperature', transitorio: false })
        expect(erroreDelPiano({ statusCode: 401 }).code).toBe('CHATGPT_ACCESSO_NON_VALIDO')
        expect(erroreDelPiano({ statusCode: 503 })).toMatchObject({ code: 'CHATGPT_SERVIZIO_NON_DISPONIBILE', transitorio: true })
    })

    it('N15-ERRORI-02 AL CONTRARIO: un guasto ignoto resta ignoto, un errore già nostro o uno Stop passano intatti, nessun segreto nel messaggio', () => {
        expect(erroreDelPiano({ statusCode: 500 })).toMatchObject({ code: 'CHATGPT_ERRORE', transitorio: true })
        expect(erroreDelPiano({ statusCode: 418 })).toMatchObject({ code: 'CHATGPT_ERRORE', transitorio: false })
        const nostro = Object.assign(new Error('x'), { code: 'CHATGPT_STATO_DIVERSO' })
        expect(erroreDelPiano(nostro)).toBe(nostro)
        const stop = Object.assign(new Error('stop'), { name: 'AbortError' })
        expect(erroreDelPiano(stop)).toBe(stop)
        const conSegreto = erroreDelPiano({ statusCode: 401, responseBody: JSON.stringify({ error: { message: 'Bearer SEGRETO-ACCESSO' } }) })
        expect(conSegreto.message).not.toContain('SEGRETO')
    })
})
