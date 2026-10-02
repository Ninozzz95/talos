import { describe, expect, it } from 'vitest'

import {
    TALOS_NPU_TERMS_VERSION,
    talosNpuTermsCanonical,
    talosNpuTermsLocale,
    talosNpuTermsSha256,
    talosNpuTermsText,
} from '@/lib/models/npuTerms'

/**
 * ⛔ PKLA Qualcomm 2.1 b (owner, 01/10/2026) — il testo che l'utente accetta è
 * un contratto: quello approvato dall'owner, parola per parola.
 */
describe('le condizioni Qualcomm dell\'NPU', () => {
    it('NPU-TXT-01 la versione in vigore è quella approvata', () => {
        expect(TALOS_NPU_TERMS_VERSION).toBe('npu-qualcomm-v1')
    })

    /**
     * NPU-TXT-02 — l'impronta del testo approvato. Se questo test cade, il testo
     * è cambiato: o si torna a quello approvato, o l'owner approva il nuovo e
     * si alza `TALOS_NPU_TERMS_VERSION` (nuova accettazione per tutti).
     */
    it('NPU-TXT-02 il testo è identico a quello approvato, in tutte e due le lingue', async () => {
        expect(await talosNpuTermsSha256(talosNpuTermsText('it')))
            .toBe('2f75bf38696bc0514af69beccf252ade9a30e208aab6b705dcad4c9c600fa727')
        expect(await talosNpuTermsSha256(talosNpuTermsText('en')))
            .toBe('2705c09ecd2302c916203dde70663c0e73ed504c1198fd679c59c59d21f83136')
    })

    it('NPU-TXT-03 otto punti, numerati, con divieti, garanzia, esportazione e revoca', () => {
        const it = talosNpuTermsCanonical(talosNpuTermsText('it'))
        expect(talosNpuTermsText('it').items).toHaveLength(8)
        for (const parola of ['1. Uso consentito.', '2. Divieti.', '5. Nessuna garanzia.', '7. Leggi sull\'esportazione.', '8. Revoca.']) {
            expect(it).toContain(parola)
        }
    })

    it('NPU-TXT-04 l\'italiano a chi usa l\'app in italiano, l\'inglese a tutti gli altri', () => {
        expect(talosNpuTermsLocale('it-IT')).toBe('it')
        expect(talosNpuTermsLocale('en')).toBe('en')
        expect(talosNpuTermsLocale('de')).toBe('en')
        expect(talosNpuTermsText('fr').accept).toBe('Accept and turn on the NPU')
    })
})
