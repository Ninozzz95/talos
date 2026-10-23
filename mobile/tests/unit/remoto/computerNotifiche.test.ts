// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { PluginComputer } from '@/lib/remoto/computerRemoti'

/**
 * ⛔ R-M5a (ledger `LEDGER-CLIENT-REMOTO-MOBILE-2026-10-20.md`, 21/10/2026): la riga «Notifiche da questo computer» (owner R-M5 Q3:
 * dopo l'accoppiamento e nella scheda del computer, con «Prova la notifica»). Il composabile è quello vero, sopra un plugin finto.
 */
vi.setConfig({ testTimeout: 30_000 })
const stato = { accesa: false, iscrizione: false, google: true, vapid: true, consentite: true, daMandare: false, permesso: 'granted', esitoProva: { esito: 'inviata' } as Record<string, unknown> }
let plugin: PluginComputer
const apriImpostazioni = vi.fn(async () => {})

vi.mock('@/i18n', () => ({
    useTalosI18n: () => ({
        t: (key: string) => key,
        tTesto: (key: string, p?: Record<string, unknown>) => (p ? `${key}${JSON.stringify(p)}` : key),
        locale: { value: 'it' },
    }),
}))
vi.mock('@/lib/remoto/pluginRemoto', () => ({ pluginRemoto: () => plugin }))
vi.mock('@/services/devicePermissions', () => ({
    requestTalosNotifications: async () => stato.permesso,
    openTalosAppSettings: (k: string) => apriImpostazioni(k),
}))

function pluginFinto(): PluginComputer {
    const ascolti = new Map<string, Set<(e: never) => void>>()
    const emetti = (evento: string, e: unknown) => { for (const cb of ascolti.get(evento) ?? []) (cb as (x: unknown) => void)(e) }
    return {
        accoppia: vi.fn(), concludiAccoppiamento: vi.fn(),
        collega: vi.fn(async () => ({ canale: 'c2' })),
        invia: vi.fn(async ({ canale, json }) => {
            const m = JSON.parse(json)
            if (m.t !== 'req') return
            const data = m.op === 'device.wake.test' ? stato.esitoProva : { sveglia: m.args?.sveglia !== null }
            queueMicrotask(() => emetti('remoto-messaggio', { canale, json: JSON.stringify({ v: 1, t: 'res', n: m.n, ok: true, data }) }))
        }),
        chiudi: vi.fn(async () => {}),
        percorso: vi.fn(async () => ({ tipo: 'diretto', rttMs: 11 })),
        elenco: vi.fn(async () => ({ computer: [] })),
        dimentica: vi.fn(async () => ({ dimenticato: true })),
        nomeDelTelefono: vi.fn(async () => ({ nome: 'Pad' })),
        scansiona: vi.fn(),
        svegliaStato: vi.fn(async () => ({ accesa: stato.accesa, iscrizione: stato.iscrizione, daMandare: stato.daMandare, errore: null, google: stato.google, vapid: stato.vapid, consentite: stato.consentite })),
        svegliaAttiva: vi.fn(async () => {
            stato.accesa = true; stato.iscrizione = true
            return { iscrizione: { endpoint: 'https://fcm.googleapis.com/fcm/send/x', keys: { p256dh: 'B', auth: 'A' } } }
        }),
        svegliaMandata: vi.fn(async () => {}),
        svegliaDisattiva: vi.fn(async () => { stato.accesa = false; stato.iscrizione = false }),
        svegliaProva: vi.fn(async () => {}),
        svegliaRimanda: vi.fn(async () => {}),
        addListener: vi.fn(async (evento: string, cb: (e: never) => void) => {
            if (!ascolti.has(evento)) ascolti.set(evento, new Set())
            ascolti.get(evento)!.add(cb)
            return { remove: async () => { ascolti.get(evento)!.delete(cb) } }
        }) as PluginComputer['addListener'],
    }
}

async function monta() {
    const { default: Notifiche } = await import('@/components/remoto/TalosComputerNotifiche.vue')
    const w = mount(Notifiche, { props: { pcId: 'pc-uno' } })
    await flushPromises()
    return w
}

const interruttore = (w: Awaited<ReturnType<typeof monta>>) => w.get('[data-testid="talos-computer-notifications-switch"]')

describe('«Notifiche da questo computer» (R-M5a)', () => {
    beforeEach(() => {
        Object.assign(stato, { accesa: false, iscrizione: false, google: true, vapid: true, consentite: true, daMandare: false, permesso: 'granted', esitoProva: { esito: 'inviata' } })
        plugin = pluginFinto()
        vi.resetModules()
    })

    it('CNO-01 spente: interruttore spento e niente «Prova»; acceso ⇒ registrazione e iscrizione al PC, poi «Prova la notifica»', async () => {
        const w = await monta()
        expect(interruttore(w).attributes('aria-checked')).toBe('false')
        expect(w.find('[data-testid="talos-computer-notifications-test"]').exists()).toBe(false)
        await interruttore(w).trigger('click')
        await flushPromises()
        expect(plugin.svegliaAttiva).toHaveBeenCalledWith({ pcId: 'pc-uno' })
        expect(plugin.svegliaMandata).toHaveBeenCalled()
        expect(interruttore(w).attributes('aria-checked')).toBe('true')
        await w.get('[data-testid="talos-computer-notifications-test"]').trigger('click')
        await flushPromises()
        expect(plugin.svegliaProva).toHaveBeenCalledWith({ pcId: 'pc-uno' })
        expect(w.get('[data-testid="talos-computer-notifications-note"]').text()).toBe('computer.notifications.sent')
    })

    it('CNO-02 la prova troppo presto dice quanti secondi aspettare', async () => {
        Object.assign(stato, { accesa: true, iscrizione: true, esitoProva: { esito: 'troppo-presto', attendiMs: 4200 } })
        const w = await monta()
        await w.get('[data-testid="talos-computer-notifications-test"]').trigger('click')
        await flushPromises()
        expect(w.get('[data-testid="talos-computer-notifications-note"]').text()).toBe('computer.notifications.tooSoon{"seconds":5}')
    })

    it('CNO-03 senza il permesso di Android: la frase e «Apri le impostazioni» sulla pagina delle notifiche', async () => {
        stato.permesso = 'denied'
        const w = await monta()
        await interruttore(w).trigger('click')
        await flushPromises()
        expect(plugin.svegliaAttiva).not.toHaveBeenCalled()
        expect(w.get('[data-testid="talos-computer-notifications-note"]').text()).toBe('computer.notifications.denied')
        await w.get('[data-testid="talos-computer-notifications-settings"]').trigger('click')
        expect(apriImpostazioni).toHaveBeenCalledWith('notifications')
        expect(interruttore(w).attributes('aria-checked')).toBe('false')
    })

    it('CNO-04 senza Google Play services l\'interruttore è spento e lo dice; spegnere toglie la sveglia', async () => {
        stato.google = false
        const w = await monta()
        expect(interruttore(w).attributes('disabled')).toBeDefined()
        expect(w.text()).toContain('computer.notifications.unavailable')

        Object.assign(stato, { accesa: true, iscrizione: true, google: true })
        plugin = pluginFinto()
        vi.resetModules()
        const v = await monta()
        await interruttore(v).trigger('click')
        await flushPromises()
        expect(plugin.svegliaDisattiva).toHaveBeenCalledWith({ pcId: 'pc-uno' })
        expect(interruttore(v).attributes('aria-checked')).toBe('false')
    })

    it('CNO-05 senza la chiave del PC la riga è spenta e lo dice; accese ma bloccate da Android: frase e impostazioni; in attesa del PC: lo dice', async () => {
        stato.vapid = false
        const w = await monta()
        expect(interruttore(w).attributes('disabled')).toBeDefined()
        expect(w.get('[data-testid="talos-computer-notifications-no-key"]').text()).toBe('computer.notifications.noWakeKey')

        Object.assign(stato, { vapid: true, accesa: true, iscrizione: true, consentite: false, daMandare: true })
        plugin = pluginFinto()
        vi.resetModules()
        const v = await monta()
        expect(v.get('[data-testid="talos-computer-notifications-blocked"]').text()).toBe('computer.notifications.denied')
        expect(v.get('[data-testid="talos-computer-notifications-pending"]').text()).toBe('computer.notifications.pendingPc')
        await v.get('[data-testid="talos-computer-notifications-settings"]').trigger('click')
        expect(apriImpostazioni).toHaveBeenCalledWith('notifications')
    })
})
