// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { TalosMobileMessageView } from '@/components/chat/mobileChatTypes'

/**
 * STATO-PIGRA-01..03 (29/10, OK del Desktop). La scheda d'errore della chat si carica a richiesta: insieme a `erroreLeggibile` e
 * `talosMessageState`, che usa solo lei, sono circa 7 KB fuori dal pezzo d'avvio (tetto 669.000 byte; il pulsante di Ollama, ASS-148,
 * lo sforava di 395). ⛔ Condizione del Desktop: una scheda che mostra un errore non può dipendere da un caricamento che a sua volta può
 * fallire (pezzo vecchio dopo un aggiornamento, poca memoria, WebView ricaricata a metà). Quindi una riga minima, sincrona, col testo
 * già leggibile e il ruolo giusto: mentre carica E se il caricamento fallisce. Mai una riga vuota.
 */
const carica = vi.hoisted(() => ({ fallisce: false }))
vi.mock('@/components/chat/caricaSchedaDiStato', async (originale) => {
    const vero = await originale<typeof import('@/components/chat/caricaSchedaDiStato')>()
    return {
        caricaSchedaDiStato: () => (carica.fallisce ? Promise.reject(new Error('pezzo vecchio dopo un aggiornamento')) : vero.caricaSchedaDiStato()),
    }
})

import TalosMobileStatusMessagePigra from '@/components/chat/TalosMobileStatusMessagePigra.vue'

function message(metadata: Record<string, unknown> = {}): TalosMobileMessageView {
    return {
        id: 'system-1', role: 'system', content: 'Provider failed.', created_at: '2026-07-22T12:00:00.000Z', state: 'failed',
        model_profile_id: 'deepseek:deepseek-chat', run_id: null, metadata,
    }
}
const errore = { chat_error: { layer: 'provider', code: 'PROVIDER_HTTP_429', message: 'Rate limit exceeded.', next_action: 'Wait, then retry.' } }

describe('STATO-PIGRA la scheda d\'errore a richiesta', () => {
    it('STATO-PIGRA-01 mentre carica c\'è già la riga minima, col testo e il ruolo giusto', () => {
        const w = mount(TalosMobileStatusMessagePigra, { props: { message: message(errore) } })
        const riga = w.get('[data-testid="talos-mobile-status-minima"]')
        expect(riga.attributes('role')).toBe('alert')
        expect(riga.text()).toContain('Rate limit exceeded.')
    })

    it('STATO-PIGRA-02 se il caricamento fallisce l\'errore resta visibile, e una nota senza errore resta una nota', async () => {
        carica.fallisce = true
        const w = mount(TalosMobileStatusMessagePigra, { props: { message: message(errore) } })
        await flushPromises()
        expect(w.get('[data-testid="talos-mobile-status-minima"]').text()).toContain('Rate limit exceeded.')
        const nota = mount(TalosMobileStatusMessagePigra, { props: { message: message() } })
        await flushPromises()
        const r = nota.get('[data-testid="talos-mobile-status-minima"]')
        expect(r.attributes('role')).toBe('status')
        expect(r.text()).toContain('Provider failed.')
        carica.fallisce = false
    })

    it('STATO-PIGRA-03 caricata, è la scheda vera', async () => {
        const w = mount(TalosMobileStatusMessagePigra, { props: { message: message(errore) } })
        await flushPromises()
        await flushPromises()
        expect(w.find('[data-testid="talos-mobile-controlled-fault"]').exists()).toBe(true)
        expect(w.find('[data-testid="talos-mobile-status-minima"]').exists()).toBe(false)
    })
})
