// @vitest-environment jsdom

/**
 * ⛔⛔⛔ 3/9 — owner, urgente: v0.1.23 pubblicata mostrava "Codice" come
 * presente (la barra tablet, guardando solo il nome della rotta) mentre il
 * contenuto diceva onestamente "not available" — un APK di release non ha
 * MAI il plugin nativo che regge Codice. Il guard (router/index.ts) è
 * l'unico punto che impedisce di ARRIVARE sulla rotta senza disponibilità,
 * qualunque sia la via (URL diretto, rotta ripristinata al boot,
 * navigazione programmatica). Questo test naviga il router VERO
 * (`@/router`, non un router ricostruito a mano per il test): il guard è
 * verificato dov'è, non in una copia che potrebbe disallinearsi.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Capacitor } from '@capacitor/core'
import { router } from '@/router'

describe('router — guard su /harness e /harness/:id', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('⛔⛔⛔ HARNESS-GUARD-01 Codice non disponibile su questa build: /harness reindirizza a chat', async () => {
        vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(false)
        await router.push({ name: 'harness' })
        expect(router.currentRoute.value.name).toBe('chat')
    })

    it('⛔⛔⛔ HARNESS-GUARD-01B stesso rifiuto per una sessione specifica, non solo per l\'elenco', async () => {
        vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(false)
        await router.push({ name: 'harness-session', params: { id: 'new' } })
        expect(router.currentRoute.value.name).toBe('chat')
    })

    it('⛔ HARNESS-GUARD-02 AL CONTRARIO — Codice disponibile: nessun reindirizzo, la rotta vera si apre', async () => {
        vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(true)
        await router.push({ name: 'harness' })
        expect(router.currentRoute.value.name).toBe('harness')
    })

    it('⛔ HARNESS-GUARD-03 AL CONTRARIO — una rotta che non è Harness non viene mai toccata dal guard, anche a build indisponibile', async () => {
        vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(false)
        await router.push({ name: 'memory' })
        expect(router.currentRoute.value.name).toBe('memory')
    })
})
