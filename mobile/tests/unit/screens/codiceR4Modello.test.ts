// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { TalosR4ClientePonte } from '@/lib/harness/r4/clienteR4'
import type { TalosMobileModelProfileView } from '@/components/chat/mobileChatTypes'
import { clampMobileEffortFor } from '@/lib/mobileEffort'

/**
 * ⛔ K3-C Scelta del modello (ledger `LEDGER-K3-MODELLO-2026-10-16.md`; owner 16/10: profili dell'app con la chiave unica, il
 * ragionamento come il desktop, la sessione nuova dall'ultima scelta del Codice, la chiave alla scelta e a ogni invio, tolta in r4
 * se l'app non l'ha). Le risposte di r4 sono quelle VERE registrate sul Pad (`modello-2161afb32.json`).
 */
const vere = JSON.parse(readFileSync(resolve(__dirname, '..', '..', 'fixtures', 'r4', 'modello-2161afb32.json'), 'utf8'))
const SESSIONE = '33333333-3333-4333-8333-333333333333'

const profilo = (provider: string, model: string, altro: Partial<TalosMobileModelProfileView> = {}): TalosMobileModelProfileView => ({
    id: `${provider}:${model}`, provider: provider as TalosMobileModelProfileView['provider'], model, display_name: `Nome ${model}`, status: 'untested',
    has_secret: true, effort_levels: ['off', 'low', 'medium', 'high'], supports_thinking: true, show_in_composer: true, capabilities: null, probe_ok: null, ...altro,
})
const DEEPSEEK = profilo('deepseek', 'deepseek-v4-pro')
const GLM = profilo('openrouter', 'z-ai/glm-4.7-flash', { effort_levels: ['off', 'low', 'medium'] })
const LOCALE = profilo('local', 'gemma.gguf')
const PIANO = profilo('chatgpt', 'gpt-5')

const stato = vi.hoisted(() => ({
    ascoltatori: {} as Record<string, ((d: Record<string, unknown>) => void)[]>,
    flussi: [] as { id: string; percorso: string }[],
    richieste: [] as { metodo: string; percorso: string; corpo?: string }[],
    rispondi: null as null | ((r: { metodo: string; percorso: string; corpo?: string }) => { stato: number; corpo: string } | null),
    sessione: { modello: 'deepseek:deepseek-v4-pro', reasoning: { effort: 'high' } } as Record<string, unknown>,
    fornitori: [] as Record<string, unknown>[],
    chiavi: {} as Record<string, string>,
    params: { id: '33333333-3333-4333-8333-333333333333' } as Record<string, string>,
    shell: { codice_model: null as string | null, codice_effort: null as string | null },
    setShell: [] as Record<string, unknown>[],
    chat: null as null | { profiles: { value: TalosMobileModelProfileView[] }; selectedModelId: { value: string | null }; effort: { value: string } },
}))
vi.mock('vue-router', async () => {
    const { reactive } = await import('vue')
    const rotta = reactive({ params: stato.params })
    return { useRoute: () => rotta, useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }
})
vi.mock('@/lib/harness/terminalePonte', () => ({ talosR4Pronto: async () => ({ disponibile: true, acceso: true, porta: 4178, cartella: '/data/w' }) }))
vi.mock('@/services/secureKeyStore', () => ({ getProviderKey: async (p: string) => stato.chiavi[p] ?? null }))
vi.mock('@/stores/chatController', async () => {
    const { ref, reactive } = await import('vue')
    const chat = {
        profiles: ref<TalosMobileModelProfileView[]>([]),
        discoveryProblems: ref([]),
        refreshingModels: ref(false),
        endpoints: reactive<Record<string, string | null>>({}),
        selectedModelId: ref<string | null>(null),
        effort: ref('medium'),
    }
    stato.chat = chat as never
    return { useChatController: () => chat }
})
vi.mock('@/lib/harness/r4/clienteR4', () => ({
    talosClienteR4: (): TalosR4ClientePonte => ({
        richiesta: async (r) => {
            stato.richieste.push(r)
            const scelta = stato.rispondi?.(r)
            if (scelta) return scelta
            const ok = (d: unknown) => ({ stato: 200, corpo: JSON.stringify(d) })
            if (r.metodo === 'GET' && r.percorso === '/api/v1/sessions') return ok({ ok: true, data: { items: [{ sessionId: SESSIONE, nome: 'Prova', permessi: 'Full access', permessiPerAttrezzo: {}, ...stato.sessione }] } })
            if (r.metodo === 'GET' && r.percorso === '/api/v1/providers') return ok({ ok: true, data: { items: stato.fornitori } })
            if (r.percorso.endsWith('/key/remove')) return ok(vere.togliChiave.d)
            if (r.percorso.endsWith('/key')) return ok(vere.chiave.d)
            if (r.percorso.endsWith('/settings')) return ok(vere.impostazioni.d)
            if (r.percorso.endsWith('/custom')) return ok({ ok: true, data: { sessionId: SESSIONE } })
            return ok({ ok: true, data: {} })
        },
        apriFlusso: async (f) => { stato.flussi.push(f) },
        chiudiFlusso: async () => undefined,
        apriTerminale: async () => undefined,
        scriviTerminale: async () => undefined,
        ridimensionaTerminale: async () => undefined,
        chiudiTerminale: async () => undefined,
        addListener: async (evento, a) => {
            ;(stato.ascoltatori[evento] ??= []).push(a)
            return { remove: async () => { stato.ascoltatori[evento] = (stato.ascoltatori[evento] ?? []).filter((x) => x !== a) } }
        },
    }),
}))
vi.mock('@/stores/settings', () => ({
    useSettingsStore: () => ({
        state: {
            chat_layout: { message_style: 'sections', bubble_scale: 'large' },
            shell: { debug_diagnostics: false, streaming_animation: 'fade', composer_shape: 'calm', composer_plus: 'dropdown', ...stato.shell },
            voice: { dictation_language: 'auto' },
        },
        setShell: async (patch: Record<string, unknown>) => { stato.setShell.push(patch) },
    }),
}))
vi.mock('@/composables/useTalosMobileDictation', async () => {
    const { ref } = await import('vue')
    return { useTalosMobileDictation: () => ({ visible: ref(true), status: ref('idle'), level: ref(0), error: ref(''), errorCode: ref(null), toggle: vi.fn(), cancel: vi.fn(), finisci: vi.fn() }) }
})

import CodiceR4Screen from '@/screens/CodiceR4Screen.vue'
import TalosMobileComposer from '@/components/chat/TalosMobileComposer.vue'

async function asciuga() { for (let i = 0; i < 5; i++) { await flushPromises(); await vi.dynamicImportSettled() } }
async function schermata(profili: TalosMobileModelProfileView[] = [DEEPSEEK, GLM, LOCALE, PIANO]) {
    stato.chat!.profiles.value = profili
    const w = mount(CodiceR4Screen, { attachTo: document.body, global: { stubs: { teleport: true } } })
    await asciuga()
    return w
}
const compositore = (w: ReturnType<typeof mount>) => w.getComponent(TalosMobileComposer)
const scritte = () => stato.richieste.filter((r) => r.metodo === 'POST').map((r) => `${r.percorso} ${r.corpo ?? ''}`)

afterEach(() => {
    document.body.innerHTML = ''
    stato.ascoltatori = {}
    stato.flussi = []
    stato.richieste = []
    stato.rispondi = null
    stato.sessione = { modello: 'deepseek:deepseek-v4-pro', reasoning: { effort: 'high' } }
    stato.fornitori = []
    stato.chiavi = {}
    stato.params.id = SESSIONE
    stato.shell.codice_model = null
    stato.shell.codice_effort = null
    stato.setShell = []
    stato.chat!.selectedModelId.value = null
    stato.chat!.effort.value = 'medium'
})

describe('la scelta del modello nel Codice su r4 (K3-C)', () => {
    it('CMO-01 la pastiglia dice il modello e il livello della sessione; il foglio ha i profili della chat che r4 raggiunge, e la frase per gli altri', async () => {
        const w = await schermata()
        const c = compositore(w)
        expect(c.props('selectedModelProfileId')).toBe('deepseek:deepseek-v4-pro')
        expect(c.props('selectedEffort')).toBe('high')
        expect((c.props('modelProfiles') as TalosMobileModelProfileView[]).map((p) => p.id)).toEqual(['deepseek:deepseek-v4-pro', 'openrouter:z-ai/glm-4.7-flash'])
        expect(c.props('discoveryProblems')).toEqual([{ message: 'On-device models and the ChatGPT plan are not available in Code yet.' }])
        w.unmount()
    })

    it('CMO-02 un modello della sessione che l\'app non ha resta nella pastiglia col nome di r4; nessuna frase se non c\'è niente di escluso', async () => {
        stato.sessione = { modello: 'lmstudio:finto', reasoning: null }
        const w = await schermata([DEEPSEEK, GLM])
        const c = compositore(w)
        expect(c.props('selectedModelProfileId')).toBe('r4:lmstudio:finto')
        expect((c.props('modelProfiles') as TalosMobileModelProfileView[])[0]).toMatchObject({ id: 'r4:lmstudio:finto', display_name: 'lmstudio:finto' })
        expect(c.props('selectedEffort')).toBe('off')
        expect(c.props('discoveryProblems')).toEqual([])
        w.unmount()
    })

    it('CMO-03 scegliere: la chiave dell\'app va in r4, poi `/settings` col livello riportato; la pastiglia cambia dopo; la scelta si ricorda', async () => {
        stato.chiavi = { openrouter: 'sk-or-app' }
        stato.fornitori = [{ ...vere.prima, id: 'openrouter' }]
        const w = await schermata()
        const c = compositore(w)
        c.vm.$emit('selectModelProfile', GLM.id)
        await asciuga()
        const livello = clampMobileEffortFor(GLM, 'high')
        expect(livello).not.toBe('high') // GLM non regge «high»… quindi il livello si riporta
        expect(scritte()).toEqual([
            '/api/v1/providers/openrouter/key {"key":"sk-or-app"}',
            `/api/v1/sessions/${SESSIONE}/settings {"modello":"z-ai/glm-4.7-flash","reasoning":{"effort":"${livello === 'off' ? 'none' : livello}"}}`,
        ])
        expect(c.props('selectedModelProfileId')).toBe(GLM.id)
        expect(stato.setShell).toEqual([{ codice_model: GLM.id, codice_effort: livello }])
        w.unmount()
    })

    it('CMO-04 un rifiuto di r4 lascia il modello di prima, non si ricorda, e la riga dice il perché con le parole del desktop', async () => {
        stato.rispondi = (r) => (r.percorso.endsWith('/settings') ? { stato: 400, corpo: JSON.stringify(vere.modelloStorto.d) } : null)
        const w = await schermata()
        compositore(w).vm.$emit('selectModelProfile', GLM.id)
        await asciuga()
        expect(compositore(w).props('selectedModelProfileId')).toBe(DEEPSEEK.id)
        expect(stato.setShell).toEqual([])
        expect(w.get('[data-testid="talos-codice-r4-errore"]').text()).toBe('The chosen model has a name this server does not recognize: choose it again from the model pill')
        w.unmount()
    })

    it('CMO-05 prima di ogni invio la chiave: l\'app non ha quella di DeepSeek e r4 sì ⇒ si toglie, poi `resume`; il rifiuto di r4 si dice col nome del fornitore', async () => {
        stato.fornitori = [vere.dopoChiave]
        stato.rispondi = (r) => (r.percorso.endsWith('/resume') ? { stato: vere.invioSenzaChiave.stato, corpo: JSON.stringify(vere.invioSenzaChiave.d) } : null)
        const w = await schermata()
        await w.get('[data-testid="talos-composer-prompt"]').setValue('Esegui i test')
        compositore(w).vm.$emit('send')
        await asciuga()
        expect(scritte()).toEqual([
            '/api/v1/providers/deepseek/key/remove {}',
            `/api/v1/sessions/${SESSIONE}/resume {"messaggio":"Esegui i test"}`,
        ])
        expect(w.get('[data-testid="talos-codice-r4-errore"]').text()).toBe('The DeepSeek key is missing: connect it from the provider settings.')
        w.unmount()
    })

    it('CMO-06 il livello dal foglio: `/settings {reasoning}` e si ricorda; «off» è «none» per r4', async () => {
        const w = await schermata()
        compositore(w).vm.$emit('selectEffort', 'off')
        await asciuga()
        expect(scritte()).toEqual([`/api/v1/sessions/${SESSIONE}/settings {"reasoning":{"effort":"none"}}`])
        expect(compositore(w).props('selectedEffort')).toBe('off')
        expect(stato.setShell).toEqual([{ codice_effort: 'off' }])
        w.unmount()
    })

    it('CMO-07 una sessione nuova parte dall\'ultima scelta del Codice; senza, da quella della chat; la creazione porta modello e livello', async () => {
        stato.params.id = ''
        stato.shell.codice_model = GLM.id
        stato.shell.codice_effort = 'low'
        stato.chiavi = { openrouter: 'sk-or-app' }
        stato.fornitori = [{ ...vere.dopoChiave, id: 'openrouter' }]
        const w = await schermata()
        expect(compositore(w).props('selectedModelProfileId')).toBe(GLM.id)
        await w.get('[data-testid="talos-composer-prompt"]').setValue('Ciao')
        compositore(w).vm.$emit('send')
        await asciuga()
        const custom = stato.richieste.find((r) => r.percorso.endsWith('/custom'))!
        expect(JSON.parse(custom.corpo!)).toMatchObject({ consegna: 'Ciao', modello: 'z-ai/glm-4.7-flash', reasoning: { effort: 'low' } })
        expect(stato.richieste.findIndex((r) => r.percorso.endsWith('/openrouter/key'))).toBeLessThan(stato.richieste.indexOf(custom))
        w.unmount()

        // nessuna scelta del Codice: quella della chat, col livello riportato al modello
        stato.richieste = []
        stato.shell.codice_model = null
        stato.shell.codice_effort = null
        stato.chat!.selectedModelId.value = DEEPSEEK.id
        stato.chat!.effort.value = 'max'
        const w2 = await schermata()
        expect(compositore(w2).props('selectedModelProfileId')).toBe(DEEPSEEK.id)
        expect(compositore(w2).props('selectedEffort')).toBe(clampMobileEffortFor(DEEPSEEK, 'max'))
        w2.unmount()
    })
})
