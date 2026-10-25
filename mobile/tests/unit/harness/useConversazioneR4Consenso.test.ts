import { afterEach, describe, expect, it } from 'vitest'
import { effectScope, nextTick } from 'vue'
import { useConversazioneR4 } from '@/composables/useConversazioneR4'
import { creaPonteRemotoR4, type ClientePerIlPonte } from '@/lib/remoto/ponteRemotoR4'

/**
 * ⛔ D-MOCK-11 (dal vivo, 24/10/2026; contratto `CONTRATTO-DISPOSITIVI-CARTELLE-FILE-RISORSE-2026-10-23.md`, parte 1, punti 2-3): il
 * Codice sul PC, sopra il ponte remoto VERO (`ponteRemotoR4.ts`) e un PC finto che parla le operazioni del canale.
 *   · una sessione nuova in una cartella non consentita: `session.start` risponde `attesa-consenso`, il dispositivo aspetta
 *     (`consent.wait`) e su `consentita` apre la sessione che il PC ha avviato da sé (`sessionId`);
 *   · una scrittura in una sessione che c'è già: `CONSENT_REQUIRED {cartellaId, nome}` ⇒ «Chiedi al PC» (`consent.request`), poi la
 *     stessa attesa. Mai solo l'errore.
 */
type Risposta = unknown | Error | Promise<unknown>
function pcFinto(rispondi: (op: string, args: Record<string, unknown>) => Risposta) {
    const chiamate: Array<{ op: string, args: Record<string, unknown> }> = []
    const cliente: ClientePerIlPonte = {
        richiesta: async (op, args) => {
            chiamate.push({ op, args })
            const r = await rispondi(op, args)
            if (r instanceof Error) throw r
            return r ?? {}
        },
        iscrivi: async () => ({ sub: 's1', disiscrivi: async () => {} }),
        onChiuso: () => {},
    }
    return { ponte: creaPonteRemotoR4(cliente), chiamate, ops: () => chiamate.map((c) => c.op) }
}
const rifiuto = (code: string, extra: Record<string, unknown> = {}) => Object.assign(new Error(code), { code }, extra)
const IN_ATTESA = { stato: 'attesa-consenso', richiestaId: 'rq-12345678', scadeAlle: '2026-10-24T10:02:00.000Z', attesaMs: 120_000 }
const aspetta = async () => {
    for (let i = 0; i < 8; i++) {
        await new Promise((fatto) => setTimeout(fatto, 0))
        await nextTick()
    }
}

let scope = effectScope()
afterEach(() => { scope.stop(); scope = effectScope() })
const monta = (opzioni: Parameters<typeof useConversazioneR4>[0]) => scope.run(() => useConversazioneR4(opzioni))!

describe('il consenso del PC nel Codice remoto (D-MOCK-11)', () => {
    it('CONS-DISP-03 sessione nuova in una cartella non consentita: «Conferma sul computer», poi la sessione che il PC ha avviato', async () => {
        let consenti: (v: unknown) => void = () => {}
        const pc = pcFinto((op) => {
            if (op === 'session.start') return IN_ATTESA
            if (op === 'consent.wait') return new Promise((ok) => { consenti = ok })
            return {}
        })
        const conv = monta({ cliente: pc.ponte, cartella: '', cartellaId: 'c-1', attesaRiapertura: () => 0 })
        const partito = conv.invia('rifai il README')
        await aspetta()
        expect(conv.attesaConsenso.value).toMatchObject({ scadeAlle: expect.any(Number) })
        expect(conv.sessioneId.value).toBeNull()
        consenti({ esito: 'consentita', sessionId: 's-9' })
        await expect(partito).resolves.toBe(true)
        expect(conv.sessioneId.value).toBe('s-9')
        expect(conv.attesaConsenso.value).toBeNull()
        expect(conv.errore.value).toBeNull()
        // una partenza sola: il PC ha avviato lui, il dispositivo non rimanda `session.start`
        expect(pc.ops().filter((op) => op === 'session.start')).toHaveLength(1)
        expect(pc.chiamate.find((c) => c.op === 'consent.wait')?.args).toEqual({ richiestaId: 'rq-12345678' })
    })

    it.each([
        [{ esito: 'negata' }, 'CONSENT_DENIED'],
        [{ esito: 'scaduta' }, 'CONSENT_EXPIRED'],
    ])('CONS-DISP-03b sessione nuova: %o lo dice (%s), la sessione non c\'è e il messaggio torna al compositore', async (fine, code) => {
        const pc = pcFinto((op) => (op === 'session.start' ? IN_ATTESA : op === 'consent.wait' ? fine : {}))
        const conv = monta({ cliente: pc.ponte, cartella: '', cartellaId: 'c-1', attesaRiapertura: () => 0 })
        await expect(conv.invia('rifai il README')).resolves.toBe(false)
        expect(conv.errore.value?.code).toBe(code)
        expect(conv.sessioneId.value).toBeNull()
        expect(conv.attesaConsenso.value).toBeNull()
        expect(conv.inviando.value).toBe(false)
    })

    it('CONS-DISP-03c sessione nuova: 3 richieste già in attesa sul PC ⇒ la frase del consenso, non un guasto qualunque', async () => {
        const pc = pcFinto((op) => (op === 'session.start' ? rifiuto('RATE_LIMITED') : {}))
        const conv = monta({ cliente: pc.ponte, cartella: '', cartellaId: 'c-1', attesaRiapertura: () => 0 })
        await expect(conv.invia('ciao')).resolves.toBe(false)
        expect(conv.errore.value).toMatchObject({ code: 'RATE_LIMITED', reason: 'consent-rate-limited' })
    })

    it('CONS-DISP-04 scrittura senza consenso: «Chiedi al PC» manda `consent.request` con la cartella del rifiuto, poi l\'attesa', async () => {
        let attese = 0
        const pc = pcFinto((op) => {
            if (op === 'session.send') return rifiuto('CONSENT_REQUIRED', { reason: 'consent-required', params: { cartellaId: 'c-1', nome: 'talos' }, stato: 403 })
            if (op === 'consent.request') return IN_ATTESA
            if (op === 'consent.wait') return ++attese === 1 ? { esito: 'scaduta' } : { esito: 'consentita' }
            return {}
        })
        const conv = monta({ cliente: pc.ponte, cartella: '', sessioneId: 's1', attesaRiapertura: () => 0 })
        await expect(conv.invia('ciao')).resolves.toBe(false)
        expect(conv.errore.value).toMatchObject({ code: 'CONSENT_REQUIRED', params: { cartellaId: 'c-1', nome: 'talos' } })
        expect(conv.consensoDaChiedere.value).toEqual({ cartellaId: 'c-1', nome: 'talos' })

        // il PC non risponde: «Il PC non ha risposto», e «Riprova» richiede per la STESSA cartella
        await expect(conv.chiediConsenso()).resolves.toBe('scaduta')
        expect(conv.errore.value?.code).toBe('CONSENT_EXPIRED')
        await expect(conv.chiediConsenso()).resolves.toBe('consentita')
        expect(conv.errore.value).toBeNull()
        expect(conv.attesaConsenso.value).toBeNull()
        expect(pc.chiamate.filter((c) => c.op === 'consent.request').map((c) => c.args)).toEqual([{ cartellaId: 'c-1' }, { cartellaId: 'c-1' }])
    })

    it('CONS-DISP-04b la richiesta rifiutata dal PC (cartella sparita) lo dice con il suo codice; senza cartella da chiedere non parte niente', async () => {
        const pc = pcFinto((op) => {
            if (op === 'session.send') return rifiuto('CONSENT_REQUIRED', { reason: 'consent-required', params: { cartellaId: 'c-1', nome: 'talos' } })
            if (op === 'consent.request') return rifiuto('FOLDER_NOT_LISTED', { reason: 'folder-not-listed' })
            return {}
        })
        const conv = monta({ cliente: pc.ponte, cartella: '', sessioneId: 's1', attesaRiapertura: () => 0 })
        await expect(conv.chiediConsenso()).resolves.toBe('errore')
        expect(pc.ops()).not.toContain('consent.request')
        await conv.invia('ciao')
        await expect(conv.chiediConsenso()).resolves.toBe('errore')
        expect(conv.errore.value?.code).toBe('FOLDER_NOT_LISTED')
    })
})
