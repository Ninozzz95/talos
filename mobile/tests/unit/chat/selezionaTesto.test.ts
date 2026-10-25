// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import TalosMobileMessageList from '@/components/chat/TalosMobileMessageList.vue'
import sorgenteLista from '@/components/chat/TalosMobileMessageList.vue?raw'
import type { TalosMobileMessageView } from '@/components/chat/mobileChatTypes'

/*
 * Bug in coda (24/10/2026, foto 97): un tocco prolungato sul messaggio apriva «Azioni messaggio» E la selezione di Android. Owner
 * 24/10 «Come Happy» (`MarkdownView.tsx:38-63`, `markdownCopyV2`): il tocco prolungato apre SOLO le azioni; nel menu «Seleziona
 * testo» apre il messaggio intero in un foglio dove il testo si seleziona. Sempre presente, come Copia e Ascolta (Chat e Codice).
 */
function messaggio(role: 'user' | 'assistant', id: string, content: string): TalosMobileMessageView {
    return { id, role, content, state: 'persisted', created_at: '2026-10-24T10:00:00.000Z', model_profile_id: null, run_id: null, metadata: {} }
}

async function lista(props: Record<string, unknown> = {}) {
    const w = mount(TalosMobileMessageList, {
        attachTo: document.body,
        props: {
            messages: [messaggio('user', 'u1', 'Leggi NOTA.md e dimmi cosa dice'), messaggio('assistant', 'a1', 'La nota dice **ciao**.')],
            sending: false, ...props,
        },
        global: { stubs: { teleport: true } },
    })
    await vi.dynamicImportSettled()
    await flushPromises()
    return w
}

async function apriFoglio(w: Awaited<ReturnType<typeof lista>>, indice: number) {
    await w.findAll('[data-testid="talos-message-overflow"]')[indice]!.trigger('click')
    await flushPromises()
}

afterEach(() => { document.body.innerHTML = '' })

describe('«Seleziona testo» al posto della selezione di Android', () => {
    it('SELEZ-01 la voce c\'è per l\'utente e per l\'assistente, anche quando chi monta la lista non dà altre azioni (Codice)', async () => {
        const w = await lista({ azioni: [] })
        expect(w.findAll('[data-testid="talos-message-overflow"]')).toHaveLength(2)
        await apriFoglio(w, 0)
        expect(document.body.querySelector('[data-testid="talos-message-select-text"]')).not.toBeNull()
        w.unmount()
    }, 15_000) // revisione del blocco 3 (S4): 7,6 s sotto il carico della suite intera, verde da sola

    it('SELEZ-02 «Seleziona testo» apre il foglio col testo intero, selezionabile, e «Chiudi» lo chiude', async () => {
        const w = await lista()
        await apriFoglio(w, 0)
        document.body.querySelector<HTMLElement>('[data-testid="talos-message-select-text"]')!.click()
        await vi.dynamicImportSettled()
        await flushPromises()
        const testo = document.body.querySelector<HTMLElement>('[data-testid="talos-message-select-sheet-text"]')
        expect(testo?.textContent).toBe('Leggi NOTA.md e dimmi cosa dice')
        expect(testo?.className).toMatch(/select-text/u)
        document.body.querySelector<HTMLElement>('[data-testid="talos-message-select-sheet-close"]')!.click()
        await flushPromises()
        expect(document.body.querySelector('[data-testid="talos-message-select-sheet-text"]')).toBeNull()
        w.unmount()
    })

    it('SELEZ-05 nel foglio il testo è quello reso, senza i simboli del Markdown (owner 24/10 «Testo reso, pulito»)', async () => {
        const w = await lista()
        await apriFoglio(w, 1)
        document.body.querySelector<HTMLElement>('[data-testid="talos-message-select-text"]')!.click()
        await vi.dynamicImportSettled()
        await flushPromises()
        expect(document.body.querySelector('[data-testid="talos-message-select-sheet-text"]')?.textContent).toBe('La nota dice ciao.')
        w.unmount()
    })

    it('SELEZ-03 dopo un dito il menu di sistema (contextmenu) è bloccato; ⛔ col mouse no', async () => {
        const w = await lista()
        const articolo = w.findAll('[data-message-kind]')[0]!.element as HTMLElement
        const PE = (globalThis.PointerEvent ?? MouseEvent) as typeof PointerEvent
        const tocco = new PE('pointerdown', { bubbles: true, clientX: 5, clientY: 5 })
        Object.defineProperty(tocco, 'pointerType', { value: 'touch' })
        articolo.dispatchEvent(tocco)
        const menuDito = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
        articolo.dispatchEvent(menuDito)
        expect(menuDito.defaultPrevented).toBe(true)
        const mouse = new PE('pointerdown', { bubbles: true, clientX: 5, clientY: 5 })
        Object.defineProperty(mouse, 'pointerType', { value: 'mouse' })
        articolo.dispatchEvent(mouse)
        const menuMouse = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
        articolo.dispatchEvent(menuMouse)
        expect(menuMouse.defaultPrevented).toBe(false)
        w.unmount()
    })

    it('SELEZ-04 col dito il testo del messaggio non si seleziona da sé (la selezione sta nel foglio)', () => {
        expect(sorgenteLista).toMatch(/@media \(pointer: coarse\)\s*\{[^}]*\.talos-chat-message[^{]*\{[^}]*user-select:\s*none/u)
    })
})
