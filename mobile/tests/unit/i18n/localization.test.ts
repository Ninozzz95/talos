import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createI18n } from 'vue-i18n'
import {
    TALOS_INTRO_LANGUAGE_PAGE_ENABLED,
    parseTalosLocaleMode,
    resolveTalosLocale,
} from '@/lib/localizationPolicy'
import { TALOS_EN_MESSAGES } from '@/i18n/locales/en'
import { TALOS_IT_MESSAGES } from '@/i18n/locales/it'

function leaves(value: unknown, prefix = ''): Map<string, string> {
    const result = new Map<string, string>()
    if (!value || typeof value !== 'object' || Array.isArray(value)) return result
    for (const [key, child] of Object.entries(value)) {
        const path = prefix ? `${prefix}.${key}` : key
        if (typeof child === 'string') result.set(path, child)
        else for (const [nested, text] of leaves(child, path)) result.set(nested, text)
    }
    return result
}

describe('TALOS locale policy', () => {
    it('I18N-01 resolves supported system locale families without region drift', () => {
        expect(resolveTalosLocale('system', ['it-IT', 'en-US'])).toBe('it')
        expect(resolveTalosLocale('system', ['en-GB', 'it-IT'])).toBe('en')
        expect(resolveTalosLocale('it', ['en-US'])).toBe('it')
    })

    it('I18N-02 fails closed to system mode and English for unsupported values', () => {
        expect(parseTalosLocaleMode('fr')).toBe('system')
        expect(parseTalosLocaleMode({})).toBe('system')
        expect(resolveTalosLocale('system', ['fr-FR', 'de-DE'])).toBe('en')
        expect(resolveTalosLocale('system', [])).toBe('en')
    })

    it('I18N-04 keeps Italian and English catalogs structurally exact', () => {
        const english = leaves(TALOS_EN_MESSAGES)
        const italian = leaves(TALOS_IT_MESSAGES)

        expect([...italian.keys()].sort()).toEqual([...english.keys()].sort())
        expect(english.size).toBeGreaterThan(100)
        for (const [key, value] of italian) {
            expect(value.trim(), key).not.toBe('')
            expect(value.match(/\{[A-Za-z0-9_]+\}/g)?.sort() ?? [], key).toEqual(
                english.get(key)?.match(/\{[A-Za-z0-9_]+\}/g)?.sort() ?? [],
            )
        }
    })

    it('C45-RED-12A applies the installed-model singular and plural in both locales', () => {
        const local = createI18n({
            legacy: false,
            locale: 'en',
            messages: { en: TALOS_EN_MESSAGES, it: TALOS_IT_MESSAGES },
        })

        expect(local.global.t('localModels.installedCount', { count: 1 })).toBe('1 model')
        expect(local.global.t('localModels.installedCount', { count: 2 })).toBe('2 models')
        local.global.locale.value = 'it'
        expect(local.global.t('localModels.installedCount', { count: 1 })).toBe('1 modello')
        expect(local.global.t('localModels.installedCount', { count: 2 })).toBe('2 modelli')
    })

    it('ONBOARD-UNIFIED-01 keeps the first language page behind one reversible policy seam', () => {
        expect(TALOS_INTRO_LANGUAGE_PAGE_ENABLED).toBe(true)
    })

    it('ANDROID-LOCALE-02 advertises exactly the two complete application locales', () => {
        const config = readFileSync(
            resolve(process.cwd(), 'android/app/src/main/res/xml/locales_config.xml'),
            'utf8',
        )
        const advertised = [...config.matchAll(/android:name="([^"]+)"/g)]
            .map(match => match[1])

        expect(advertised).toEqual(['en', 'it'])
    })

    it('ANDROID-LOCALE-RESTORE-01 opts Android 12 and lower into official AndroidX locale storage', () => {
        const manifest = readFileSync(
            resolve(process.cwd(), 'android/app/src/main/AndroidManifest.xml'),
            'utf8',
        )
        const service = manifest.match(
            /<service\b(?=[^>]*android:name="androidx\.appcompat\.app\.AppLocalesMetadataHolderService")(?=[^>]*android:enabled="false")(?=[^>]*android:exported="false")[^>]*>([\s\S]*?)<\/service>/,
        )

        expect(service?.[1]).toMatch(
            /<meta-data\b(?=[^>]*android:name="autoStoreLocales")(?=[^>]*android:value="true")[^>]*\/>/,
        )
    })
})
