import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { analyzeTalosMobileAttachment } from '@/lib/chat/attachmentAnalysis'

/**
 * ⛔⛔ PDF-NON-SI-ALLEGA-01 — «TALOS non ha potuto esaminare questo file.»
 *
 * FOTOGRAFATO sul Pad il 2026-08-20, allegando un PDF da 20,5 kB — un rapporto
 * generato da TALOS stesso il giorno prima:
 *
 * ```
 *   ⚠ Uno o più file richiedono attenzione prima di inviare il messaggio.
 *   Che cos e il formato GGUF e chi lo …
 *   Impossibile aggiungere il file
 *   TALOS non ha potuto esaminare questo file.
 * ```
 *
 * ⛔ E il messaggio è tutto quello che si sa, perché `boundedCode()` nel worker
 * riduce QUALSIASI errore a `TALOS_ATTACHMENT_ANALYSIS_FAILED`. La causa vera
 * non arriva a nessuno: né alla persona, né a chi deve ripararlo.
 *
 * Questo test tiene il PDF vero — non uno costruito a tavolino, che è
 * esattamente il modo in cui un difetto così sfugge — e pretende che
 * l'estrazione riesca.
 */

const PDF = new URL('./fixture/rapporto.pdf', import.meta.url)

describe('PDF-NON-SI-ALLEGA-01 un PDF vero si allega', () => {
    it('⛔ estrae il testo invece di fallire', async () => {
        const bytes = new Uint8Array(readFileSync(PDF))
        const analisi = await analyzeTalosMobileAttachment({
            name: 'rapporto.pdf',
            declaredMediaType: 'application/pdf',
            bytes,
        } as never)

        expect(analisi.extension).toBe('pdf')
        expect(analisi.extractedText ?? '').toContain('GGUF')
    })

    it('dichiara quante pagine ha', async () => {
        const bytes = new Uint8Array(readFileSync(PDF))
        const analisi = await analyzeTalosMobileAttachment({
            name: 'rapporto.pdf',
            declaredMediaType: 'application/pdf',
            bytes,
        } as never)

        expect(analisi.pageCount).toBeGreaterThan(0)
    })
})
