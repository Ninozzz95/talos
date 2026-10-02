// @vitest-environment jsdom
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount } from '@vue/test-utils'
import { createTalosI18n } from '@/i18n'
import TalosMobileCompactionRow from '@/components/chat/TalosMobileCompactionRow.vue'
import TalosMobileCompactionProgress from '@/components/chat/TalosMobileCompactionProgress.vue'

/*
 * ⭐⭐ P4-ter passo 2 (02/10/2026) — la compattazione si vede nella chat come nel Codice (decisione owner «Nella
 * conversazione»), con le parole del desktop (`AVM-integrazione-r4` @ 3ecf7651d, app.js:46930-46935).
 */
type Composer = { mergeLocaleMessage(locale: string, messages: object): void, locale: { value: string } }
let lingua = 'en'
beforeAll(async () => {
    const global = (await createTalosI18n()).global as unknown as Composer
    const { TALOS_IT_MESSAGES } = await import('@/i18n/locales/it')
    global.mergeLocaleMessage('it', { chat: { compaction: (TALOS_IT_MESSAGES as { chat: { compaction: object } }).chat.compaction } })
    lingua = global.locale.value
    global.locale.value = 'it'
})
afterAll(async () => {
    ((await createTalosI18n()).global as unknown as Composer).locale.value = lingua
})

describe('P4-ter passo 2 — la riga della compattazione nella chat', () => {
    it('CHAT-COMP-UI-01 separatore coi numeri come il desktop e UN solo «Annulla»', async () => {
        const riga = mount(TalosMobileCompactionRow, { props: { tokenPrima: 14_273, tokenDopo: 2_526, annullata: false } })
        const gruppo = riga.get('[data-testid="talos-compaction-row"]')
        // ⛔ Non role="separator": i figli sarebbero presentazionali e il lettore di schermo perderebbe «Annulla».
        expect(gruppo.attributes('role')).toBe('group')
        expect(gruppo.attributes('aria-labelledby')).toBeTruthy()
        expect(riga.text()).toContain('Conversazione riassunta · 14.273 → 2526 token')
        const bottoni = riga.findAll('button')
        expect(bottoni.map((b) => b.text())).toEqual(['Annulla'])
        await bottoni[0]!.trigger('click')
        expect(riga.emitted('annulla')).toHaveLength(1)
    })

    it('CHAT-COMP-UI-02 annullata: la frase del desktop e nessuna azione', () => {
        const riga = mount(TalosMobileCompactionRow, { props: { tokenPrima: 14_273, tokenDopo: 2_526, annullata: true } })
        expect(riga.text()).toContain('Riassunto annullato · la conversazione intera torna al modello')
        expect(riga.findAll('button')).toHaveLength(0)
    })

    it('CHAT-COMP-UI-03 durante: una riga di stato che si legge, con la barra (ferma col movimento ridotto)', () => {
        const riga = mount(TalosMobileCompactionProgress)
        const stato = riga.get('[data-testid="talos-compaction-progress"]')
        expect(stato.attributes('role')).toBe('status')
        expect(stato.text()).toContain('Riassumo la conversazione…')
        expect(stato.find('.talos-compaction-bar').exists()).toBe(true)
        const sorgente = readFileSync(resolve(process.cwd(), 'src/components/chat/TalosMobileCompactionProgress.vue'), 'utf8')
        expect(sorgente).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none[\s\S]*width: 100%/)
    })
})
