// @vitest-environment jsdom
/**
 * SFONDO-01..03 — owner 28/10/2026: «con lo switch attivato non si muovono, restano statiche… se lo switch è acceso, animato anche
 * coi messaggi». Misurato sul Pad (vc343): la tela si disegna, ma `App.vue` la fermava in Chat appena c'erano messaggi
 * (`paused = chat && chatHasMessages`, dal 02/09). Ora si ferma solo mentre si scorre, e riparte 220 ms dopo, come il desktop
 * (`app.js:20595-20602`).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { effectScope } from 'vue'
import { TALOS_RIPRESA_SFONDO_MS, useTalosPausaSfondoScorrimento } from '@/composables/useTalosPausaSfondoScorrimento'

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe('SFONDO lo sfondo animato anche coi messaggi', () => {
    it('SFONDO-01 App.vue non ferma più lo sfondo per i messaggi della Chat: lo ferma la pausa di scorrimento dello sfondo', () => {
        const app = readFileSync(resolve(__dirname, '../../../src/App.vue'), 'utf8')
        const sfondo = readFileSync(resolve(__dirname, '../../../src/components/talos/workspace/TalosMobileBackground.vue'), 'utf8')
        expect(app).not.toMatch(/chatHasMessages/u)
        expect(app).not.toMatch(/<TalosMobileBackground[^>]*:paused=/u)
        // nel chunk dello sfondo, non in quello dell'avvio (tetto 669.000)
        expect(app).not.toMatch(/useTalosPausaSfondoScorrimento/u)
        expect(sfondo).toMatch(/useTalosPausaSfondoScorrimento\(\)/u)
        expect(sfondo).toMatch(/props\.paused \|\| fermoPerScorrimento\.value/u)
    })

    it('SFONDO-02 uno scorrimento lo ferma; 220 ms dopo l\'ultimo riparte, e ogni scorrimento sposta la ripresa', () => {
        vi.useFakeTimers()
        const scope = effectScope()
        const inPausa = scope.run(() => useTalosPausaSfondoScorrimento())!
        expect(inPausa.value).toBe(false)
        document.dispatchEvent(new Event('scroll'))
        expect(inPausa.value).toBe(true)
        vi.advanceTimersByTime(TALOS_RIPRESA_SFONDO_MS - 20)
        document.dispatchEvent(new Event('wheel'))
        vi.advanceTimersByTime(TALOS_RIPRESA_SFONDO_MS - 20)
        expect(inPausa.value).toBe(true)
        vi.advanceTimersByTime(40)
        expect(inPausa.value).toBe(false)
        scope.stop()
    })

    it('SFONDO-03 allo smontaggio nessun ascoltatore resta e nessun tempo scatta', () => {
        vi.useFakeTimers()
        const aggiunti: string[] = []
        const tolti: string[] = []
        const add = vi.spyOn(document, 'addEventListener').mockImplementation(function (this: Document, tipo: string) { aggiunti.push(tipo) } as never)
        const rem = vi.spyOn(document, 'removeEventListener').mockImplementation(function (this: Document, tipo: string) { tolti.push(tipo) } as never)
        const scope = effectScope()
        scope.run(() => useTalosPausaSfondoScorrimento())
        scope.stop()
        expect(add).toHaveBeenCalled()
        expect(rem).toHaveBeenCalled()
        expect(tolti.sort()).toEqual(aggiunti.sort())
        expect(vi.getTimerCount()).toBe(0)
    })
})
