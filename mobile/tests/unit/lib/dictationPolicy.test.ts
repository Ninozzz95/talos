import { describe, expect, it } from 'vitest'
import {
    parseTalosDictationLanguageMode,
    resolveTalosDictationLanguageTag,
} from '@/lib/dictationPolicy'

describe('dictation language policy', () => {
    it('DICT-POLICY-01 parses only reviewed modes and resolves bounded BCP 47 tags', () => {
        expect(parseTalosDictationLanguageMode('system')).toBe('system')
        expect(parseTalosDictationLanguageMode('en')).toBe('en')
        expect(parseTalosDictationLanguageMode('it')).toBe('it')
        expect(parseTalosDictationLanguageMode('fr')).toBe('system')
        expect(parseTalosDictationLanguageMode({ language: 'it' })).toBe('system')

        expect(resolveTalosDictationLanguageTag('system')).toBeUndefined()
        expect(resolveTalosDictationLanguageTag('en')).toBe('en-US')
        expect(resolveTalosDictationLanguageTag('it')).toBe('it-IT')
    })
})
