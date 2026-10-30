// @vitest-environment jsdom
/**
 * FORMA-01..04 — owner 27/10/2026: «Unico, tolgo le forme». Il compositore ha UNA forma (quella del mockup approvato): a riposo una
 * riga, aperto col fuoco; il «+» apre sempre il cassetto. Le tre prop di forma (`drawerMode`, `immersiveComposer`, `plusDropdown`) e
 * la loro traduzione `talosComposerFlags` non esistono più, e le schermate non leggono più `composer_shape`/`composer_plus`.
 * ⛔ I valori salvati restano LEGGIBILI (`talosComposerFromLegacy`, i due «Exists»): un salvataggio vecchio non si rompe, e tornare
 * indietro col revert ritrova la scelta di chi l'aveva fatta.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import TalosMobileComposer from '@/components/chat/TalosMobileComposer.vue'
import * as composerStyle from '@/lib/composerStyle'
import type { TalosMobileModelProfileView } from '@/components/chat/mobileChatTypes'
import { __resetSettingsStoreForTests } from '@/stores/settings'

const luna: TalosMobileModelProfileView = {
    id: 'chatgpt:gpt-6-luna', provider: 'chatgpt', model: 'gpt-6-luna', display_name: 'GPT-6-Luna', status: 'healthy', has_secret: true,
    effort_levels: ['off', 'low', 'medium', 'high'], supports_thinking: true, show_in_composer: true, capabilities: null, probe_ok: true,
}
let w: VueWrapper | null = null
afterEach(() => { w?.unmount(); w = null; document.body.innerHTML = ''; __resetSettingsStoreForTests() })

const sorgente = (p: string) => readFileSync(resolve(__dirname, '../../../src', p), 'utf8')

describe('FORMA la forma unica del compositore', () => {
    it('FORMA-01 senza nessuna prop di forma è compatto a riposo e si apre col fuoco', async () => {
        w = mount(TalosMobileComposer, {
            attachTo: document.body,
            global: { stubs: { teleport: true } },
            props: {
                prompt: '', modelProfiles: [luna], routingProfiles: [], selectedModelProfileId: luna.id, selectedRoutingProfileId: null,
                selectedEffort: 'high', thinking: true, canSend: true, sending: false, sendDisabledReason: '', dictationSupported: true, docked: true,
            },
        })
        const radice = () => w!.get('[data-testid="talos-mobile-composer"]').attributes('data-talos-composer-compact')
        expect(radice()).toBe('true')
        expect(w.find('[data-testid="talos-composer-model-chip"]').exists()).toBe(false)
        ;(w.get('[data-testid="talos-composer-prompt"]').element as HTMLTextAreaElement).focus()
        await flushPromises()
        expect(radice()).toBe('false')
        expect(w.find('[data-testid="talos-composer-model-chip"]').exists()).toBe(true)
    })

    it('FORMA-02 il compositore non dichiara più le tre prop di forma', () => {
        const props = Object.keys((TalosMobileComposer as { props?: Record<string, unknown> }).props ?? {})
        for (const p of ['drawerMode', 'immersiveComposer', 'plusDropdown']) expect(props, p).not.toContain(p)
    })

    it('FORMA-03 Chat, Codice r4 e Codice di oggi non leggono più la forma', () => {
        for (const file of ['screens/ChatScreen.vue', 'screens/CodiceR4Screen.vue', 'screens/HarnessSessionScreen.vue']) {
            const s = sorgente(file)
            expect(s, file).not.toContain('talosComposerFlags')
            expect(s, file).not.toMatch(/:(drawer-mode|immersive-composer|plus-dropdown)=/u)
        }
    })

    it('FORMA-04 composerStyle tiene solo la lettura dei salvataggi', () => {
        expect('talosComposerFlags' in composerStyle).toBe(false)
        expect('talosComposerHasPlus' in composerStyle).toBe(false)
        expect(composerStyle.talosComposerFromLegacy({ composer_shape: 'classic', composer_plus: 'menu' })).toEqual({ shape: 'classic', plus: 'menu' })
        expect(composerStyle.talosComposerShapeExists('compact')).toBe(true)
        expect(composerStyle.talosComposerPlusExists('drawer')).toBe(true)
    })
})
