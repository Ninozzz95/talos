import { describe, expect, it } from 'vitest'
import {
    parseTalosDictationLanguageMode,
    resolveTalosDictationLanguageTag,
} from '@/lib/dictationPolicy'

describe('dictation language policy', () => {
    /**
     * ⛔ RISCRITTO il 2026-08-10, e non per farlo passare: il mondo e' cambiato.
     * `system`, `en` e `it` erano le uniche tre voci del menu', e la piu'
     * innocua delle tre ha fatto perdere all'owner una dettatura intera. Adesso
     * il default e' l'automatico e le lingue le dichiara il dispositivo — i
     * casi nuovi stanno in `linguaDettaturaAutomatica.test.ts`.
     */
    it('DICT-POLICY-01 i valori del vecchio mondo diventano automatico', () => {
        expect(parseTalosDictationLanguageMode('system')).toBe('auto')
        expect(parseTalosDictationLanguageMode('en')).toBe('auto')
        expect(parseTalosDictationLanguageMode('it')).toBe('auto')
        expect(parseTalosDictationLanguageMode('fr')).toBe('auto')
        expect(parseTalosDictationLanguageMode({ language: 'it' })).toBe('auto')

        expect(resolveTalosDictationLanguageTag('auto')).toBeUndefined()
        expect(resolveTalosDictationLanguageTag('system')).toBeUndefined()
        expect(resolveTalosDictationLanguageTag('en-US')).toBe('en-US')
        expect(resolveTalosDictationLanguageTag('it-IT')).toBe('it-IT')
    })
})
