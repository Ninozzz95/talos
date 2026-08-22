// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { TALOS_MOBILE_ROUTES } from '@/lib/mobileRoutes'
import {
    talosNotifications,
    talosOnNotificationAndroid,
    talosOnNotificationToast,
    talosResetNotificationCentre,
} from '@/stores/notificationCentre'

/**
 * Le tre creazioni a mano lasciano la STESSA traccia.
 *
 * Owner 2026-08-06: «ogni funzione, tool, download, installazione deve avere
 * notifica toast e Android». La risposta per queste tre non è «nessuna
 * notifica» — è peso `log`: nel registro sì, in faccia no. Chi ha appena premuto
 * «Crea» sta guardando lo schermo e la conferma ce l'ha già, e un avviso che non
 * aggiunge niente insegna a ignorare anche quelli che aggiungono.
 *
 * Il test guarda ENTRAMBE le metà — che la riga finisca nel registro, e che
 * nessuna delle due superfici che interrompono venga toccata. Metà sola
 * lascerebbe passare sia il silenzio totale sia il toast di troppo.
 */

const create = {
    notes: vi.fn(async () => undefined),
    memories: vi.fn(async () => undefined),
    tasks: vi.fn(async () => undefined),
}

vi.mock('@/stores/chatController', () => ({
    useChatController: () => ({
        notes: { create: create.notes },
        memories: { create: create.memories },
        tasks: { create: create.tasks },
    }),
}))

const toast = vi.fn()
const android = vi.fn()

function router() {
    return createRouter({
        history: createMemoryHistory(),
        routes: TALOS_MOBILE_ROUTES.map((r) => ({
            path: r.path, name: r.name, component: { template: '<div />' },
        })),
    })
}

beforeEach(() => {
    talosResetNotificationCentre()
    toast.mockClear()
    android.mockClear()
    Object.values(create).forEach((fn) => fn.mockClear())
    talosOnNotificationToast(toast)
    talosOnNotificationAndroid(android)
})

afterEach(() => {
    talosOnNotificationToast(null)
    talosOnNotificationAndroid(null)
    document.body.innerHTML = ''
})

const casi = [
    { nome: 'nota', modulo: () => import('@/screens/NoteNewScreen.vue'), titolo: 'talos-note-title', corpo: 'talos-note-content', salva: 'talos-note-save', chiave: 'note:created:Una cosa nuova' },
    { nome: 'memoria', modulo: () => import('@/screens/MemoryNewScreen.vue'), titolo: 'talos-memory-title', corpo: 'talos-memory-content', salva: 'talos-memory-save', chiave: 'memory:created:Una cosa nuova' },
    { nome: 'attività', modulo: () => import('@/screens/TaskNewScreen.vue'), titolo: 'talos-task-title', corpo: 'talos-task-description', salva: 'talos-task-save', chiave: 'task:created:Una cosa nuova' },
]

describe('le creazioni a mano lasciano traccia senza interrompere', () => {
    it.each(casi)('$nome', async ({ modulo, titolo, corpo, salva, chiave }) => {
        const r = router()
        await r.push('/')
        await r.isReady()
        const { default: Screen } = await modulo()
        const wrapper = mount(Screen, { global: { plugins: [r] } })

        await wrapper.find(`[data-testid="${titolo}"]`).setValue('Una cosa nuova')
        // Nota e memoria vogliono anche il contenuto: senza, il tasto resta
        // spento ed è giusto così — una memoria senza corpo non è una memoria.
        await wrapper.find(`[data-testid="${corpo}"]`).setValue('Il corpo della cosa.')
        // Il `submit` sul modulo e non il click sul tasto: in jsdom premere un
        // bottone di invio non fa partire il form, e il test resterebbe verde
        // per il motivo sbagliato.
        expect(wrapper.find(`[data-testid="${salva}"]`).attributes('disabled')).toBeUndefined()
        await wrapper.find('form').trigger('submit')
        await flushPromises()

        const riga = talosNotifications.entries.find((e) => e.key === chiave)
        expect(riga).toBeDefined()
        expect(riga?.weight).toBe('log')
        // Il corpo dice COSA è stato creato: un registro di righe identiche non
        // si rilegge, e questo registro esiste per essere riletto.
        expect(riga?.body).toBe('Una cosa nuova')
        // E nessuna delle due superfici che interrompono si è mossa.
        expect(toast).not.toHaveBeenCalled()
        expect(android).not.toHaveBeenCalled()
    })
})
