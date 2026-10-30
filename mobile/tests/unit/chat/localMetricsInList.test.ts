// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * ⭐⭐⭐ FASE 2 — L'ULTIMO PONTE.
 *
 * ⛔ Perché questo file esiste separato dagli altri due: la misura è provata,
 * la riga è provata, il legame è provato — e in questo progetto un valore è
 * già morto proprio all'ultimo passaggio, con tutti i pezzi verdi («il valore
 * che muore all'ultimo ponte»). Qui si prova la cosa che nessuno dei tre
 * prova: che la lista MONTI davvero la riga quando la risposta compare.
 *
 * ⛔ E il verso contrario nello stesso file: una risposta senza misure — cioè
 * ogni risposta di un fornitore a chiave — non deve portare nessuna riga.
 */

vi.mock('@/services/clipboard', () => ({ writeTalosClipboardText: vi.fn() }))
vi.mock('@/stores/chatController', () => ({
    useChatController: () => ({
        chat: {
            state: { sending: false, streamingText: null, streamingSessionId: null },
            activeSession: { value: { id: 's1', title: 'A' } },
        },
        toolActivity: { value: [] as Array<{ name: string; detail: string | null }> },
    }),
}))

import TalosMobileMessageList from '@/components/chat/TalosMobileMessageList.vue'
import type { TalosMobileMessageView } from '@/components/chat/mobileChatTypes'

const { talosRegistraMisuraLocale, talosScordaMisureLocali } =
    await import('@/lib/chat/providers/localTrace')
const { talosScordaLegameMisure } = await import('@/components/chat/useTalosLocalMetrics')

function messaggio(id: string, role: 'user' | 'assistant'): TalosMobileMessageView {
    return {
        id,
        role,
        content: role === 'user' ? 'Ciao' : 'Ciao a te.',
        state: 'persisted',
        created_at: '2026-09-10T10:00:00.000Z',
        model_profile_id: 'local:/models/qwen.gguf',
        run_id: null,
        metadata: {},
    }
}

const SELETTORE = '[data-testid="talos-local-metrics"]'

/**
 * ⛔ Il 2026-09-10 la riga è passata a `defineAsyncComponent` perché statica
 * faceva sforare il tetto del grafo d'avvio (misurato: 2.432 byte). Questo test
 * è diventato ROSSO nello stesso momento, ed è il motivo per cui esiste: senza,
 * lo spostamento avrebbe tolto la riga dallo schermo in silenzio, con build
 * verde e tetto rientrato.
 *
 * `flushPromises()` da solo NON basta: svuota i microtask, ma l'`import()` di
 * un componente pigro è un caricamento di modulo che vitest traccia a parte.
 * Serve `vi.dynamicImportSettled()`, e poi un secondo giro perché Vue ridisegni
 * col componente arrivato.
 * Fonte: vue-test-utils «Asynchronous Behavior»
 * (test-utils.vuejs.org/guide/advanced/async-suspense) e vitest-dev/vitest
 * #1328 «vue: dynamic component imports are not resolved», letti il 2026-09-10.
 */
async function attendiIlPigro(): Promise<void> {
    await flushPromises()
    await vi.dynamicImportSettled()
    await flushPromises()
}

describe('FASE-2 — la riga compare nella lista dei messaggi', () => {
    beforeEach(() => {
        talosScordaMisureLocali()
        talosScordaLegameMisure()
    })

    it('PONTE-01 la risposta locale che arriva porta con sé la sua riga di velocità', async () => {
        const vista = mount(TalosMobileMessageList, {
            props: { messages: [messaggio('u1', 'user')], sending: false },
        })
        await flushPromises()
        expect(vista.find(SELETTORE).exists()).toBe(false)

        // Il motore locale ha appena finito: le misure sono in coda.
        talosRegistraMisuraLocale({
            traceId: 't1',
            finishedAt: Date.now(),
            firstVisibleMs: 351,
            tokensPerSecond: 9.69,
            msPerToken: 103.2,
            producedTokens: 42,
            promptTokens: 120,
            prefillMs: 300,
            engineFirstTokenMs: 351,
            reusedTokens: 0,
            partialTrimRefused: false,
            prefixOutcome: 'reused',
        })
        await vista.setProps({
            messages: [messaggio('u1', 'user'), messaggio('a1', 'assistant')],
        })
        await attendiIlPigro()

        const riga = vista.find(SELETTORE)
        expect(riga.exists()).toBe(true)
        /*
         * ⛔ Si prova con cio' che una persona vede DI SERIE. «351 ms to first
         * token» dal 2026-09-10 sta dietro «Mostra dettagli tecnici», e questa
         * prova riguarda il PONTE — che la misura arrivi dal motore fino alla
         * lista — non quanto se ne mostra.
         */
        expect(riga.text()).toContain('9.7 tokens/sec')
        expect(riga.text()).not.toContain('351 ms to first token')
    })

    it('PONTE-02 AL CONTRARIO: una risposta senza misure — un fornitore a chiave — non porta nessuna riga', async () => {
        const vista = mount(TalosMobileMessageList, {
            props: { messages: [messaggio('u1', 'user')], sending: false },
        })
        await flushPromises()
        // Nessuna registrazione: solo l'adattatore locale misura.
        await vista.setProps({
            messages: [messaggio('u1', 'user'), messaggio('a1', 'assistant')],
        })
        await attendiIlPigro()

        expect(vista.find(SELETTORE).exists()).toBe(false)
    })

    /*
     * ⛔ Pad, 27/10/2026, prova dal vivo con la CLI: una risposta del modello locale nella Chat, poi la risposta di una sessione
     * del PC nel Codice remoto — e sotto quella del PC compariva «Velocità di questa risposta su questo dispositivo 26.4 token
     * al secondo». La misura sta in una coda unica e se la prendeva la prima lista che vedeva comparire una risposta. Il Codice
     * non genera mai con l'adattatore locale (il kernel genera da sé, locale o sul PC): la sua lista non lega e non consuma.
     */
    it('PONTE-03 la lista del Codice non si prende la misura della Chat, e la lascia alla Chat', async () => {
        const vista = mount(TalosMobileMessageList, {
            props: { messages: [messaggio('u1', 'user')], sending: false, senzaMisureLocali: true },
        })
        await flushPromises()
        const misura = {
            traceId: 't-chat', finishedAt: Date.now(), firstVisibleMs: 351, tokensPerSecond: 26.4, msPerToken: 37.9,
            producedTokens: 42, promptTokens: 120, prefillMs: 300, engineFirstTokenMs: 351, reusedTokens: 0,
            partialTrimRefused: false, prefixOutcome: 'reused' as const,
        }
        talosRegistraMisuraLocale(misura)
        await vista.setProps({ messages: [messaggio('u1', 'user'), messaggio('a1', 'assistant')] })
        await attendiIlPigro()

        expect(vista.find(SELETTORE).exists()).toBe(false)
        vista.unmount()

        // La Chat, quando la sua risposta compare, la trova ancora.
        const chat = mount(TalosMobileMessageList, { props: { messages: [messaggio('u2', 'user')], sending: false } })
        await flushPromises()
        await chat.setProps({ messages: [messaggio('u2', 'user'), messaggio('a2', 'assistant')] })
        await attendiIlPigro()
        expect(chat.find(SELETTORE).text()).toContain('26.4 tokens/sec')
    })
})

describe('PONTE-03b — il Codice monta la lista senza misure locali', () => {
    it('CodiceR4Screen passa senza-misure-locali alla sua lista', () => {
        const sorgente = readFileSync(resolve(__dirname, '..', '..', '..', 'src', 'screens', 'CodiceR4Screen.vue'), 'utf8')
        const lista = sorgente.match(/<TalosMobileMessageList[\s\S]*?>/)?.[0] ?? ''
        expect(lista).toMatch(/\ssenza-misure-locali\s/)
    })
})
