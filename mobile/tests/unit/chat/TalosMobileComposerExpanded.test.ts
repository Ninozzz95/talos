// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import TalosMobileComposerExpanded from '@/components/chat/TalosMobileComposerExpanded.vue'

/**
 * Owner 2026-08-27 — "espandi il composer a tutto schermo per i testi più
 * grandi". Nessuna logica di invio duplicata: `canSubmit`/`sending` arrivano
 * già calcolati dal composer normale, questo componente si limita a
 * mostrarli sullo stesso `prompt` (lo stesso v-model, non una copia) e a
 * inoltrare gli eventi — questi test provano solo quel contratto, non
 * rifanno le regole di invio già coperte altrove.
 *
 * Query dirette sul DOM, non `wrapper.find`: il componente è teleportato a
 * `body` (stesso schema di `TalosMobileComposerSheet.vue`, vedi
 * `TalosMobileComposerSheet.test.ts`), e VTU non attraversa il Teleport
 * quando si cerca dal wrapper.
 */
function withAppRoot(): HTMLElement {
    const app = document.createElement('div')
    app.id = 'app'
    const opener = document.createElement('button')
    opener.id = 'opener'
    app.append(opener)
    document.body.append(app)
    opener.focus()
    return app
}

afterEach(() => {
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
})

function mountExpanded(overrides: Record<string, unknown> = {}) {
    withAppRoot()
    return mount(TalosMobileComposerExpanded, {
        attachTo: document.body,
        props: { prompt: '', sending: false, canSubmit: false, ...overrides },
    })
}

function root(): HTMLElement {
    return document.querySelector('[data-testid="talos-composer-expanded"]') as HTMLElement
}

async function settle(): Promise<void> {
    await new Promise((resolve) => window.setTimeout(resolve, 0))
}

describe('TalosMobileComposerExpanded', () => {
    it('mostra il prompt corrente in una textarea grande', () => {
        const wrapper = mountExpanded({ prompt: 'un messaggio lungo' })
        const textarea = root().querySelector('textarea') as HTMLTextAreaElement
        expect(textarea.value).toBe('un messaggio lungo')
        wrapper.unmount()
    })

    it('digitando emette update:prompt col nuovo testo, non una copia interna', async () => {
        const wrapper = mountExpanded()
        const textarea = root().querySelector('textarea') as HTMLTextAreaElement
        textarea.value = 'nuovo testo'
        textarea.dispatchEvent(new Event('input', { bubbles: true }))
        await settle()
        expect(wrapper.emitted('update:prompt')).toEqual([['nuovo testo']])
        wrapper.unmount()
    })

    it('il pulsante collassa emette close', async () => {
        const wrapper = mountExpanded()
        const collapse = root().querySelector('[data-testid="talos-composer-collapse"]') as HTMLElement
        collapse.click()
        await settle()
        expect(wrapper.emitted('close')).toHaveLength(1)
        wrapper.unmount()
    })

    it('Escape emette close, come le altre superfici modali del composer', async () => {
        const wrapper = mountExpanded()
        root().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
        await settle()
        expect(wrapper.emitted('close')).toHaveLength(1)
        wrapper.unmount()
    })

    it('con testo inviabile, il bottone manda send e mostra la freccia', async () => {
        const wrapper = mountExpanded({ prompt: 'ciao', canSubmit: true })
        const action = root().querySelector('[data-testid="talos-composer-expanded-action"]') as HTMLButtonElement
        expect(action.disabled).toBe(false)
        action.click()
        await settle()
        expect(wrapper.emitted('send')).toHaveLength(1)
        expect(wrapper.emitted('stop')).toBeUndefined()
        wrapper.unmount()
    })

    it('senza niente da inviare il bottone è disabilitato e non manda niente', async () => {
        const wrapper = mountExpanded({ prompt: '', canSubmit: false })
        const action = root().querySelector('[data-testid="talos-composer-expanded-action"]') as HTMLButtonElement
        expect(action.disabled).toBe(true)
        action.click()
        await settle()
        expect(wrapper.emitted('send')).toBeUndefined()
        wrapper.unmount()
    })

    it('mentre sta generando il bottone ferma invece di mandare — MAI i due insieme', async () => {
        const wrapper = mountExpanded({ prompt: 'ciao', sending: true, canSubmit: true })
        const action = root().querySelector('[data-testid="talos-composer-expanded-action"]') as HTMLButtonElement
        // Prova inversa: durante l'invio il bottone resta cliccabile (ferma),
        // non si blocca come quando manca testo da inviare.
        expect(action.disabled).toBe(false)
        action.click()
        await settle()
        expect(wrapper.emitted('stop')).toHaveLength(1)
        expect(wrapper.emitted('send')).toBeUndefined()
        wrapper.unmount()
    })

    it('è una vera superficie modale: inerte l\'app dietro, focus torna all\'apertore alla chiusura', async () => {
        const app = withAppRoot()
        const wrapper = mount(TalosMobileComposerExpanded, {
            attachTo: document.body,
            props: { prompt: '', sending: false, canSubmit: false },
        })
        expect(app.hasAttribute('inert')).toBe(true)
        wrapper.unmount()
        expect(app.hasAttribute('inert')).toBe(false)
        expect(document.activeElement?.id).toBe('opener')
    })
})
