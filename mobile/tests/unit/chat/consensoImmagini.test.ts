import { describe, expect, it } from 'vitest'
import {
    talosImageSendDecision,
    type TalosImageSendInput,
} from '@/lib/chat/consensoImmagini'

/**
 * ⛔ Il buco del 12/09/2026: `attachExisting` allegava alla chat un file GIÀ nel
 * Vault senza chiedere niente. Un'immagine archiviata ieri partiva oggi verso
 * OpenRouter senza il cartellino «esce dal telefono».
 *
 * La cura non è una chiamata in più su quella porta: è spostare la guardia
 * sull'INVIO, che è il gesto di cui si chiede il permesso — Android, *App
 * permissions best practices*, letto 12/09/2026.
 *
 * Le tre prove al contrario chieste dal coordinatore stanno qui, una per una,
 * e la più importante è la seconda: un consenso che compare due volte è un
 * consenso che si impara a chiudere senza leggere.
 */
function caso(patch: Partial<TalosImageSendInput> = {}): TalosImageSendInput {
    return {
        imageCount: 1,
        provider: 'openrouter',
        alreadyAnsweredForDraft: false,
        stance: 'ask',
        ...patch,
    }
}

describe('un’immagine che sta per partire verso un modello remoto', () => {
    it('(a) dal Vault, verso un modello remoto → si chiede', () => {
        expect(talosImageSendDecision(caso())).toBe('ask')
    })

    it('(a) e un «nega» memorizzato ferma l’invio invece di mandarlo monco', () => {
        expect(talosImageSendDecision(caso({ stance: 'deny' }))).toBe('refuse')
    })

    it('(b) appena scelta, col consenso già dato → NESSUNA seconda domanda', () => {
        expect(talosImageSendDecision(caso({ alreadyAnsweredForDraft: true }))).toBe('send')
    })

    it('(c) modello locale → nessuna domanda, nemmeno con «chiedi»', () => {
        expect(talosImageSendDecision(caso({ provider: 'local' }))).toBe('send')
    })

    it('(c) e nemmeno con «nega»: non c’è niente da negare, non esce nulla', () => {
        expect(talosImageSendDecision(caso({ provider: 'local', stance: 'deny' }))).toBe('send')
    })

    it('«sempre» non chiede più niente', () => {
        expect(talosImageSendDecision(caso({ stance: 'allow' }))).toBe('send')
    })

    it('un messaggio di solo testo non fa comparire nessun cartellino', () => {
        for (const stance of ['ask', 'deny', 'allow'] as const) {
            expect(talosImageSendDecision(caso({ imageCount: 0, stance }))).toBe('send')
        }
    })

    /**
     * ⛔ Il caso che il difetto originario NON copriva: provider ignoto. Non è
     * «locale», quindi la foto può uscire, quindi si chiede. Un `null` trattato
     * come locale sarebbe il buco rifatto con un altro nome.
     */
    it('provider ignoto non vale come locale', () => {
        expect(talosImageSendDecision(caso({ provider: null }))).toBe('ask')
    })

    it('più immagini non cambiano la decisione, solo il conteggio del cartellino', () => {
        expect(talosImageSendDecision(caso({ imageCount: 4 }))).toBe('ask')
    })
})
