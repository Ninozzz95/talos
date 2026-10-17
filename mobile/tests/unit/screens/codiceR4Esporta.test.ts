// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { TalosR4ClientePonte } from '@/lib/harness/r4/clienteR4'
import type { TalosMobileModelProfileView } from '@/components/chat/mobileChatTypes'

/**
 * ⛔ K3-C Esporta e Condividi (ledger `LEDGER-K3-ESPORTA-CONDIVIDI-2026-10-17.md`; owner 17/10: «Markdown + JSON, come il desktop»,
 * consegna «Come la chat: tutte e tre», «Condividi» con «Un tocco: la trascrizione Markdown»). L'export è quello VERO del Pad
 * (`export-701c6c0d2.json`), la trascrizione attesa è il golden del desktop (`trascrizione-golden-701c6c0d2.json`).
 */
const fixture = (nome: string) => JSON.parse(readFileSync(resolve(__dirname, '..', '..', 'fixtures', 'r4', nome), 'utf8'))
const risposta = fixture('export-701c6c0d2.json').risposta
const golden = fixture('trascrizione-golden-701c6c0d2.json')
const SESSIONE = '33333333-3333-4333-8333-333333333333'

const stato = vi.hoisted(() => ({
    richieste: [] as { metodo: string; percorso: string }[],
    rispostaExport: null as null | { stato: number; corpo: string },
    consegnati: [] as { fileName: string; content: string; contentType: string }[],
    copiati: [] as string[],
    salvati: [] as { name: string; mediaType: string; text: string }[],
    params: { id: '33333333-3333-4333-8333-333333333333' } as Record<string, string>,
    annulla: false,
}))
vi.mock('vue-router', async () => {
    const { reactive } = await import('vue')
    const rotta = reactive({ params: stato.params })
    return { useRoute: () => rotta, useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }
})
vi.mock('@/lib/harness/terminalePonte', () => ({ talosR4Pronto: async () => ({ disponibile: true, acceso: true, porta: 4178, cartella: '/w' }) }))
vi.mock('@/services/secureKeyStore', () => ({ getProviderKey: async () => null }))
vi.mock('@/services/sessionExportDelivery', () => ({
    deliverTalosSessionExport: async (a: { fileName: string; content: string; contentType: string }) => {
        // come Capacitor Share quando la persona chiude il foglio di Android senza scegliere
        if (stato.annulla) throw new Error('Share canceled')
        stato.consegnati.push(a)
        return 'shared'
    },
}))
vi.mock('@/services/clipboard', () => ({ writeTalosClipboardText: async (t: string) => { stato.copiati.push(t) } }))
vi.mock('@/stores/chatController', async () => {
    const { ref, reactive } = await import('vue')
    const chat = {
        profiles: ref<TalosMobileModelProfileView[]>([]), discoveryProblems: ref([]), refreshingModels: ref(false),
        endpoints: reactive<Record<string, string | null>>({}), selectedModelId: ref<string | null>(null), effort: ref('medium'),
        chat: { activeSession: ref(null), exportSnapshot: vi.fn() },
        attachments: { saveGenerated: async (f: { name: string; mediaType: string; text: string }) => { stato.salvati.push(f) } },
    }
    return { useChatController: () => chat }
})
vi.mock('@/lib/harness/r4/clienteR4', () => ({
    talosClienteR4: (): TalosR4ClientePonte => ({
        richiesta: async (r) => {
            stato.richieste.push(r)
            const ok = (d: unknown) => ({ stato: 200, corpo: JSON.stringify(d) })
            if (r.metodo === 'GET' && r.percorso === '/api/v1/sessions') return ok({ ok: true, data: { items: [{ sessionId: SESSIONE, nome: 'Aspetta che finisca il comando', permessi: 'Full access', permessiPerAttrezzo: {}, modello: 'lmstudio:finto', reasoning: null }] } })
            if (r.percorso.endsWith('/export')) return stato.rispostaExport ?? ok(risposta)
            return ok({ ok: true, data: {} })
        },
        apriFlusso: async () => undefined,
        chiudiFlusso: async () => undefined,
        apriTerminale: async () => undefined,
        scriviTerminale: async () => undefined,
        ridimensionaTerminale: async () => undefined,
        chiudiTerminale: async () => undefined,
        addListener: async () => ({ remove: async () => undefined }),
    }),
}))
vi.mock('@/stores/settings', () => ({
    useSettingsStore: () => ({
        state: {
            chat_layout: { message_style: 'sections', bubble_scale: 'large' },
            shell: { debug_diagnostics: false, streaming_animation: 'fade', composer_shape: 'calm', composer_plus: 'dropdown', codice_model: null, codice_effort: null, image_attachment_consent: 'ask' },
            voice: { dictation_language: 'auto' },
        },
        setShell: async () => undefined,
    }),
}))
vi.mock('@/composables/useTalosMobileDictation', async () => {
    const { ref } = await import('vue')
    return { useTalosMobileDictation: () => ({ visible: ref(true), status: ref('idle'), level: ref(0), error: ref(''), errorCode: ref(null), toggle: vi.fn(), cancel: vi.fn(), finisci: vi.fn() }) }
})

import CodiceR4Screen from '@/screens/CodiceR4Screen.vue'
import TalosCodiceR4Header from '@/components/codice/TalosCodiceR4Header.vue'

async function asciuga() { for (let i = 0; i < 10; i++) { await flushPromises(); await vi.dynamicImportSettled() } }
async function schermata() {
    const w = mount(CodiceR4Screen, { attachTo: document.body, global: { stubs: { teleport: true } } })
    await asciuga()
    return w
}
async function comando(w: ReturnType<typeof mount>, id: string) {
    w.getComponent(TalosCodiceR4Header).vm.$emit('comandi')
    await asciuga()
    const voce = document.querySelector(`[data-comando="${id}"]`) as HTMLButtonElement | null
    expect(voce, `voce ${id}`).not.toBeNull()
    voce!.click()
    await asciuga()
}
const clic = async (selettore: string) => { (document.querySelector(selettore) as HTMLElement).click(); await asciuga() }
const exportChiesti = () => stato.richieste.filter((r) => r.percorso === `/api/v1/sessions/${SESSIONE}/export`)

afterEach(() => {
    document.body.innerHTML = ''
    stato.richieste = []
    stato.rispostaExport = null
    stato.consegnati = []
    stato.copiati = []
    stato.salvati = []
    stato.annulla = false
})

describe('Esporta e Condividi nel Codice su r4 (K3-C)', () => {
    it('ESP-01 «Esporta» apre il foglio della chat coi due formati del desktop; il Markdown è la trascrizione del desktop; Copia, Condividi o salva, Libreria', async () => {
        const w = await schermata()
        await comando(w, 'esporta')
        const foglio = document.querySelector('[data-testid="talos-export-sheet"]')
        expect(foglio).not.toBeNull()
        const generatori = [...document.querySelectorAll('[data-testid="talos-export-sheet"] article button')].map((b) => b.getAttribute('aria-label'))
        expect(generatori).toEqual(['Export Markdown transcript', 'Export raw session JSON'])
        await clic('[data-testid="talos-export-sheet"] article button[aria-label="Export Markdown transcript"]')
        expect(exportChiesti()).toHaveLength(1)
        expect(document.querySelector('[data-testid="talos-session-export-preview"]')?.textContent).toBe(golden.uscite.en.vera)
        await clic('[aria-label="Copy Markdown transcript"]')
        expect(stato.copiati).toEqual([golden.uscite.en.vera])
        await clic('[data-testid="talos-export-share"]')
        expect(stato.consegnati).toEqual([{ fileName: `talos-session-${risposta.data.sessionId}.md`, content: golden.uscite.en.vera, contentType: 'text/markdown' }])
        await clic('[data-testid="talos-export-save-library"]')
        expect(stato.salvati).toMatchObject([{ name: `talos-session-${risposta.data.sessionId}.md`, mediaType: 'text/markdown', text: golden.uscite.en.vera }])
        w.unmount()
    })

    it('ESP-02 il JSON è il grezzo di `/export`, byte per byte', async () => {
        const w = await schermata()
        await comando(w, 'esporta')
        await clic('[data-testid="talos-export-sheet"] article button[aria-label="Export raw session JSON"]')
        expect(document.querySelector('[data-testid="talos-session-export-preview"]')?.textContent).toBe(JSON.stringify(risposta.data, null, 2))
        await clic('[data-testid="talos-export-share"]')
        expect(stato.consegnati[0]).toMatchObject({ fileName: `talos-session-${risposta.data.sessionId}.json`, contentType: 'application/json' })
        w.unmount()
    })

    it('ESP-03 «Condividi» con un tocco consegna la trascrizione Markdown; sotto la voce c\'è l\'avviso su cosa contiene', async () => {
        const w = await schermata()
        w.getComponent(TalosCodiceR4Header).vm.$emit('comandi')
        await asciuga()
        expect(document.querySelector('[data-comando="condividi"]')?.textContent)
            .toContain('The transcript also holds the tool output and the files read: check it before sending it.')
        ;(document.querySelector('[data-comando="condividi"]') as HTMLElement).click()
        await asciuga()
        expect(stato.consegnati).toEqual([{ fileName: `talos-session-${risposta.data.sessionId}.md`, content: golden.uscite.en.vera, contentType: 'text/markdown' }])
        expect(document.querySelector('[data-testid="talos-export-sheet"]')).toBeNull()
        w.unmount()
    })

    it('ESP-04 un rifiuto di `/export` si dice e niente parte', async () => {
        stato.rispostaExport = { stato: 404, corpo: JSON.stringify({ ok: false, error: { code: 'NOT_FOUND', message: 'Session not found' } }) }
        const w = await schermata()
        await comando(w, 'condividi')
        expect(stato.consegnati).toEqual([])
        expect(w.get('[data-testid="talos-codice-r4-errore"]').attributes('data-codice')).toBe('NOT_FOUND')
        await comando(w, 'esporta')
        await clic('[data-testid="talos-export-sheet"] article button[aria-label="Export Markdown transcript"]')
        expect(document.querySelector('[data-testid="talos-session-export-preview"]')).toBeNull()
        expect(document.querySelector('[data-testid="talos-export-sheet"] [role="alert"]')?.textContent).toContain('Session not found')
        w.unmount()
    })

    /*
     * Pad 17/10: il foglio si chiamava «Esporta chat» anche nel Codice, e chiudendo il foglio di Android senza scegliere compariva
     * «Share canceled» come errore (anche nella chat). Chi annulla non ha sbagliato niente.
     */
    it('ESP-06 il foglio si chiama «Esporta la sessione»; annullare il foglio di Android non è un errore', async () => {
        stato.annulla = true
        const w = await schermata()
        await comando(w, 'esporta')
        expect(document.querySelector('[data-testid="talos-export-sheet"]')?.textContent).toContain('Export session')
        expect(document.querySelector('[data-testid="talos-export-sheet"]')?.textContent).not.toContain('Export chat')
        await clic('[data-testid="talos-export-sheet"] article button[aria-label="Export Markdown transcript"]')
        await clic('[data-testid="talos-export-share"]')
        expect(document.querySelector('[data-testid="talos-export-sheet"] [role="alert"]')).toBeNull()
        await comando(w, 'condividi')
        expect(w.find('[data-testid="talos-codice-r4-errore"]').exists()).toBe(false)
        w.unmount()
    })

    it('ESP-05 dal menu ••• della testata le due voci fanno lo stesso', async () => {
        const w = await schermata()
        w.getComponent(TalosCodiceR4Header).vm.$emit('condividi')
        await asciuga()
        expect(stato.consegnati).toHaveLength(1)
        w.getComponent(TalosCodiceR4Header).vm.$emit('esporta')
        await asciuga()
        expect(document.querySelector('[data-testid="talos-export-sheet"]')).not.toBeNull()
        w.unmount()
    })
})
