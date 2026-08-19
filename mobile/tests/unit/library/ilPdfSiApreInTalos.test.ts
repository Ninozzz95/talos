import { describe, expect, it } from 'vitest'
import { talosNeedsExternalOpen } from '@/lib/documents/openable'

/**
 * ⛔⛔⛔ PDF-APRE-IL-FOGLIO-DI-CONDIVISIONE-01 — «Apri» non apriva: CONDIVIDEVA.
 *
 * ## Fotografato sul Pad il 2026-08-20
 *
 * Libreria → un PDF → «Apri». Quello che si è aperto è il **foglio di
 * condivisione di Android**: «Condividi 1 file», con in fila i contatti veri
 * della persona — tre volti di WhatsApp — e poi Drive, Gmail, Telegram.
 *
 * ⛔ Non è una scomodità: è un comando che fa una cosa diversa da quella che
 * dice, e la cosa che fa mette il file **a un tocco dall'uscire dal telefono**,
 * verso una persona reale. Il rischio non è teorico: la fila dei contatti è la
 * prima riga del foglio, e il primo volto è sotto il pollice.
 *
 * ## Perché succedeva
 *
 * `talosNeedsExternalOpen` rispondeva `true` per tutto ciò che non è testo,
 * JSON o immagine — e un PDF non è nessuno dei tre. La regola nasceva da un
 * caso giusto (owner 2026-07-26: un `.xlsx` che non si apriva, perché un
 * foglio di calcolo non è testo e il visore interno mostrerebbe qualcosa di
 * sottilmente falso).
 *
 * Ma per il PDF la premessa non vale: **il visore ce l'abbiamo**, si chiama
 * `TalosMobilePdfViewer.vue`, rende le pagine col renderer di Android e lo
 * usava una sola scheda azione. La Libreria non lo chiamava mai.
 *
 * ⇒ Un formato che sappiamo mostrare si mostra in casa. Fuori ci va solo ciò
 * che davvero non sappiamo rendere.
 */

describe('PDF-APRE-IL-FOGLIO-DI-CONDIVISIONE-01 il PDF si apre in TALOS', () => {
    it('⛔ un PDF NON viene consegnato a un\'app esterna', () => {
        expect(talosNeedsExternalOpen('application/pdf')).toBe(false)
    })

    it('testo, JSON e immagini restano interni, com\'erano', () => {
        expect(talosNeedsExternalOpen('text/plain')).toBe(false)
        expect(talosNeedsExternalOpen('text/markdown')).toBe(false)
        expect(talosNeedsExternalOpen('application/json')).toBe(false)
        expect(talosNeedsExternalOpen('image/png')).toBe(false)
    })

    it('⛔ e al contrario: ciò che NON sappiamo rendere continua ad andare fuori', () => {
        // Il caso vero del 2026-07-26, che questa regola deve continuare a servire.
        expect(talosNeedsExternalOpen(
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )).toBe(true)
        expect(talosNeedsExternalOpen(
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        )).toBe(true)
        expect(talosNeedsExternalOpen('application/zip')).toBe(true)
    })
})
