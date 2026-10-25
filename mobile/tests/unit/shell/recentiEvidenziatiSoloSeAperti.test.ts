// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import type { TalosLocalChatSession } from '@/repositories/chatRepository'
import TalosMobileSidebar from '@/components/shell/TalosMobileSidebar.vue'

/**
 * ⛔ Owner 23/10/2026 sera, dal Pad: mentre era nel Codice, a sinistra restava evidenziata la chat «Ciao, ho un a…» e sembrava
 * quella aperta. Decisione: la riga dei Recenti è evidenziata SOLO se quella conversazione è sullo schermo (mobile e desktop).
 */
const sessions: TalosLocalChatSession[] = [
    {
        id: 'chat-2', title: 'Release review', surface: 'chat', mode: 'verified_execution',
        persistence_mode: 'persistent', active_model_profile_id: null, metadata: {},
        created_at: '2026-07-22T10:01:00.000Z', updated_at: '2026-07-22T10:03:00.000Z',
    },
    {
        id: 'chat-1', title: 'Architecture notes', surface: 'chat', mode: 'verified_execution',
        persistence_mode: 'persistent', active_model_profile_id: null, metadata: {},
        created_at: '2026-07-22T10:00:00.000Z', updated_at: '2026-07-22T10:02:00.000Z',
    },
]

const proto = HTMLDialogElement.prototype as unknown as { showModal?: () => void, close?: () => void }
if (typeof proto.showModal !== 'function') proto.showModal = function (this: HTMLDialogElement) { this.setAttribute('open', '') }
if (typeof proto.close !== 'function') proto.close = function (this: HTMLDialogElement) { this.removeAttribute('open') }

const montate: Array<{ unmount(): void }> = []
afterEach(() => {
    for (const w of montate.splice(0)) w.unmount()
    document.body.innerHTML = ''
})

async function montaSu(rotta: string) {
    const vuota = { template: '<div />' }
    const router = createRouter({
        history: createMemoryHistory(),
        routes: [
            { path: '/chat', name: 'chat', component: vuota },
            { path: '/chats', name: 'chats', component: vuota },
            { path: '/codice', name: 'codice-r4', component: vuota },
            { path: '/impostazioni', name: 'settings', component: vuota },
        ],
    })
    await router.push({ name: rotta })
    await router.isReady()
    const w = mount(TalosMobileSidebar, {
        attachTo: document.body,
        global: { plugins: [router] },
        props: { open: true, sessions, activeSessionId: 'chat-2', busy: false, creatingSession: false },
    })
    montate.push(w)
    await flushPromises()
    return w
}

// la barra vive in un <dialog>: le righe si cercano nel documento, come in `TalosMobileSidebar.test.ts`
const evidenziate = (_w: Awaited<ReturnType<typeof montaSu>>) => {
    const righe = [...document.body.querySelectorAll<HTMLElement>('.recent-row')]
    expect(righe.length).toBeGreaterThan(0)
    return righe.filter((r) => r.getAttribute('aria-current') === 'page').map((r) => r.getAttribute('aria-label'))
}

describe('Recenti evidenziati solo se la chat è sullo schermo (owner 23/10)', () => {
    it('SIDEBAR-EVID-01 in Chat la conversazione aperta è evidenziata', async () => {
        expect(evidenziate(await montaSu('chat'))).toHaveLength(1)
    })

    // vc165 sul Pad (23/10): sulla LISTA delle chat la conversazione non è sullo schermo, quindi niente riga accesa
    it.each(['chats', 'codice-r4', 'settings'])('SIDEBAR-EVID-01 in «%s» nessuna riga dei Recenti è evidenziata', async (rotta) => {
        expect(evidenziate(await montaSu(rotta))).toEqual([])
    })
})
