import { describe, expect, it } from 'vitest'
import { talosTranslatableErrorMessage } from '@/i18n/uiErrors'
import { TalosMobileProviderError } from '@/lib/chat/providerErrors'

/**
 * Translating an error must not change the error.
 *
 * `escapeParameter` is on in the i18n plugin — a value from outside can never
 * smuggle markup into a translated string — and vue-i18n implements it by
 * escaping the values of the parameter object IT IS HANDED, in place. Handing
 * it the error's own parameters therefore rewrites them: after one call, a path
 * is no longer `/storage/…` but `&#x2F;storage&#x2F;…` for every later reader.
 *
 * That is not theoretical. On 2026-08-01 a folder-permission message was shown
 * on a tablet with the path escaped into unreadability, and it stayed that way
 * after the path had been taken OUT of the interpolated sentence — because
 * rendering the sentence had already spoiled the object the path came from.
 *
 * The fake translator below escapes exactly the way vue-i18n does, in place, so
 * this test fails against a version that passes the parameters directly.
 */
describe('translating an error', () => {
    it('leaves the error’s own parameters untouched', () => {
        const path = '/storage/emulated/0/Android/data/ai.talos/files/models'
        const error = new TalosMobileProviderError({
            provider: 'local',
            operation: 'list_models',
            message: 'TALOS_LOCAL_MODELS_UNREADABLE',
            uiMessageKey: 'models.localModelsUnreadable',
            uiMessageParameters: { path },
        })

        const escapingTranslate = (key: string, parameters?: Record<string, unknown>): string => {
            // vue-i18n's own behaviour: mutate the object it was given.
            if (parameters) {
                for (const [name, value] of Object.entries(parameters)) {
                    if (typeof value === 'string') parameters[name] = value.replaceAll('/', '&#x2F;')
                }
            }
            return `${key}: ${String(parameters?.path ?? '')}`
        }

        talosTranslatableErrorMessage(error, escapingTranslate as never)

        expect(error.uiMessageParameters?.path).toBe(path)
    })
})
