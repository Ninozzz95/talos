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
    // ⛔ CHATGPT NEL CODICE: il custode della chat (finto); `guasto` = il codice con cui rifiuta
    accessi: [] as { almenoMs: number; forzaRinnovo?: boolean }[],
    guastoPiano: null as string | null,
    registrati: [] as (number | null)[],
    // ⛔ CODICE COL MOTORE LOCALE: l'apertura per il Codice e l'endpoint dell'app (finti)
    apertura: { esito: 'aperto', nCtx: 32768 } as Record<string, unknown>,
    aperture: [] as string[],
    // 22/10: un'apertura che resta in corso finché il test non la scioglie (il modello vero impiega secondi)
    attesaApertura: null as null | Promise<void>,
    ospite: { pronto: true, socketPath: '/data/user/0/ai.talos.dev/files/locale-ospite/motore.sock', chiave: 'c'.repeat(64), modello: 'gemma.gguf', nCtx: 32768 } as Record<string, unknown>,
    // D-RM4-3 (Pad 20/10): «Aggiorna» e «Laboratorio modelli» del foglio, come nella chat
    aggiornamenti: 0,
    spinte: [] as unknown[],
    chat: null as null | { profiles: { value: TalosMobileModelProfileView[] }; selectedModelId: { value: string | null }; effort: { value: string }; refreshingModels: { value: boolean } },
}))
vi.mock('vue-router', async () => {
    const { reactive } = await import('vue')
    const rotta = reactive({ params: stato.params })
    return { useRoute: () => rotta, useRouter: () => ({ push: (r: unknown) => { stato.spinte.push(r) }, replace: vi.fn() }) }
})
vi.mock('@/lib/harness/terminalePonte', () => ({ talosR4Pronto: async () => ({ disponibile: true, acceso: true, porta: 4178, cartella: '/data/w' }) }))
vi.mock('@/services/secureKeyStore', () => ({ getProviderKey: async (p: string) => stato.chiavi[p] ?? null }))
vi.mock('@/services/chatgptAccesso', () => ({
    talosChatgpt: () => ({
        accessoValido: async (o: { almenoMs: number; forzaRinnovo?: boolean }) => {
            stato.accessi.push(o)
            if (stato.guastoPiano) throw Object.assign(new Error('No ChatGPT account is connected.'), { code: stato.guastoPiano })
            return { accessToken: o.forzaRinnovo ? 'tok-nuovo' : 'tok-app', scadeAlle: 1_900_000_000_000 }
        },
    }),
}))
vi.mock('@/lib/chat/providers/localAdapter', () => ({
    talosApriPerIlCodice: async (path: string) => { stato.aperture.push(path); if (stato.attesaApertura) await stato.attesaApertura; return stato.apertura },
}))
vi.mock('@/services/localEngine', () => ({ talosMotoreOspite: async () => stato.ospite }))
vi.mock('@/services/chatgptConsumi', () => ({
    talosConsumiChatgpt: () => ({ registra: (token: number | null) => { stato.registrati.push(token) } }),
}))
vi.mock('@/components/chat/TalosMobileChatgptPastiglia.vue', async () => {
    const { h } = await import('vue')
    return { __esModule: true, default: { render: () => h('span', { 'data-testid': 'talos-chatgpt-pill' }) } }
})
vi.mock('@/stores/chatController', async () => {
    const { ref, reactive } = await import('vue')
    const chat = {
        profiles: ref<TalosMobileModelProfileView[]>([]),
        discoveryProblems: ref([]),
        refreshingModels: ref(false),
        endpoints: reactive<Record<string, string | null>>({}),
        selectedModelId: ref<string | null>(null),
        effort: ref('medium'),
        refreshConfiguredProviders: async () => { stato.aggiornamenti += 1 },
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
import TalosCodiceR4Viste from '@/components/codice/TalosCodiceR4Viste.vue'

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
    stato.accessi = []
    stato.guastoPiano = null
    stato.registrati = []
    stato.apertura = { esito: 'aperto', nCtx: 32768 }
    stato.aperture = []
    stato.attesaApertura = null
    stato.ospite = { pronto: true, socketPath: '/data/user/0/ai.talos.dev/files/locale-ospite/motore.sock', chiave: 'c'.repeat(64), modello: 'gemma.gguf', nCtx: 32768 }
    stato.chat!.selectedModelId.value = null
    stato.chat!.effort.value = 'medium'
    stato.chat!.refreshingModels.value = false
    stato.aggiornamenti = 0
    stato.spinte = []
})

describe('la scelta del modello nel Codice su r4 (K3-C)', () => {
    it('CMO-01 la pastiglia dice il modello e il livello della sessione; il foglio ha i profili della chat che r4 raggiunge, e la frase per gli altri', async () => {
        const w = await schermata()
        const c = compositore(w)
        expect(c.props('selectedModelProfileId')).toBe('deepseek:deepseek-v4-pro')
        expect(c.props('selectedEffort')).toBe('high')
        // ⛔ CHATGPT NEL CODICE e CODICE COL MOTORE LOCALE (owner 18/10, «il Codice è identico alla chat»): tutti i profili della chat
        expect((c.props('modelProfiles') as TalosMobileModelProfileView[]).map((p) => p.id)).toEqual(['deepseek:deepseek-v4-pro', 'openrouter:z-ai/glm-4.7-flash', 'local:gemma.gguf', 'chatgpt:gpt-5'])
        expect(c.props('discoveryProblems')).toEqual([])
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

    /*
     * ⛔ CHATGPT NEL CODICE (ledger `LEDGER-CHATGPT-NEL-CODICE-2026-10-18.md`): un solo accesso, quello della chat. Il custode dell'app
     * dà il token (valido almeno 10 minuti) e r4 lo riceve con la sua scadenza, alla scelta e prima di ogni giro; mai una chiave.
     */
    it('CMO-08 scegliere il piano: il token del custode della chat va in r4 (solo token e scadenza), poi `/settings` con `chatgpt:`', async () => {
        const w = await schermata()
        compositore(w).vm.$emit('selectModelProfile', PIANO.id)
        await asciuga()
        expect(stato.accessi).toEqual([{ almenoMs: 600_000 }])
        expect(scritte()[0]).toBe('/api/v1/providers/chatgpt/access {"accessToken":"tok-app","scadeAlle":1900000000000}')
        expect(scritte()[1]).toMatch(new RegExp(`^/api/v1/sessions/${SESSIONE}/settings [{]"modello":"chatgpt:gpt-5"`))
        expect(scritte().some((x) => x.includes('/key'))).toBe(false)
        expect(compositore(w).props('selectedModelProfileId')).toBe(PIANO.id)
        w.unmount()
    })

    it('CMO-09 un invio col piano che r4 rifiuta per il token da rinnovare: rinnovo forzato nel custode, nuova spinta, lo stesso invio una volta', async () => {
        stato.sessione = { modello: 'chatgpt:gpt-5', reasoning: { effort: 'medium' } }
        let rifiuti = 1
        stato.rispondi = (r) => (r.percorso.endsWith('/resume') && rifiuti-- > 0
            ? { stato: 409, corpo: JSON.stringify({ ok: false, error: { code: 'CHATGPT_TOKEN_DA_RINNOVARE', message: 'The ChatGPT access token must be renewed by the app.' } }) }
            : null)
        const w = await schermata()
        await w.get('[data-testid="talos-composer-prompt"]').setValue('Esegui i test')
        compositore(w).vm.$emit('send')
        await asciuga()
        expect(stato.accessi).toEqual([{ almenoMs: 600_000 }, { almenoMs: 600_000, forzaRinnovo: true }])
        expect(scritte()).toEqual([
            '/api/v1/providers/chatgpt/access {"accessToken":"tok-app","scadeAlle":1900000000000}',
            `/api/v1/sessions/${SESSIONE}/resume {"messaggio":"Esegui i test"}`,
            '/api/v1/providers/chatgpt/access {"accessToken":"tok-nuovo","scadeAlle":1900000000000}',
            `/api/v1/sessions/${SESSIONE}/resume {"messaggio":"Esegui i test"}`,
        ])
        expect(w.find('[data-testid="talos-codice-r4-errore"]').exists()).toBe(false)
        w.unmount()
    })

    it("CMO-10 la chat non è collegata: r4 dimentica l'accesso, l'invio non parte e la riga dice dove accedere, con le parole del telefono", async () => {
        stato.sessione = { modello: 'chatgpt:gpt-5', reasoning: { effort: 'medium' } }
        stato.guastoPiano = 'CHATGPT_NON_COLLEGATO'
        const w = await schermata()
        await w.get('[data-testid="talos-composer-prompt"]').setValue('Esegui i test')
        compositore(w).vm.$emit('send')
        await asciuga()
        expect(scritte()).toEqual(['/api/v1/providers/chatgpt/access/remove {}'])
        expect(w.get('[data-testid="talos-codice-r4-errore"]').text()).toBe('No ChatGPT account is connected: sign in in Models, under OpenAI.')
        w.unmount()
    })

    it('CMO-11 un codice del piano che manda r4 si dice con le parole del desktop; uno che il telefono dice già, con quelle della chat', async () => {
        stato.sessione = { modello: 'chatgpt:gpt-5', reasoning: { effort: 'medium' } }
        stato.rispondi = (r) => (r.percorso.endsWith('/resume')
            ? { stato: 409, corpo: JSON.stringify({ ok: false, error: { code: 'CHATGPT_CUSTODE_NON_APP', message: 'x' } }) }
            : null)
        const w = await schermata()
        await w.get('[data-testid="talos-composer-prompt"]').setValue('Esegui i test')
        compositore(w).vm.$emit('send')
        await asciuga()
        expect(w.get('[data-testid="talos-codice-r4-errore"]').text()).toBe('This server keeps its own ChatGPT sign-in: it does not take a token from an app')
        w.unmount()
    })
    it('CMO-12 col modello del piano il compositore ha la pastiglia «Piano ChatGPT» come la chat, e i giri del Codice entrano nel suo conto', async () => {
        stato.sessione = { modello: 'chatgpt:gpt-5', reasoning: { effort: 'medium' } }
        const w = await schermata()
        expect(w.find('[data-testid="talos-chatgpt-pill"]').exists()).toBe(true)
        // un giro dal vivo: due chiamate al modello, poi un'altra
        const flusso = stato.flussi.at(-1)!
        const manda = (testo: string) => (stato.ascoltatori.r4Pezzo ?? []).forEach((a) => a({ id: flusso.id, testo }))
        const uso = (giri: number, p: number) => `data: {"type":"StateDelta","delta":[{"op":"replace","path":"/usage","value":{"prompt_tokens":${p},"completion_tokens":0,"giri":${giri}}}]}`
        manda(['data: {"type":"CUSTOM","name":"talos.fine-rigiocata","value":{}}', 'data: {"type":"RunStarted","runId":"r1","input":{}}', uso(2, 3000), uso(3, 4000), ''].join(String.fromCharCode(10, 10)))
        await vi.waitFor(() => expect(stato.registrati).toEqual([3000, null, 1000]))
        w.unmount()

        // un altro fornitore: niente pastiglia
        stato.sessione = { modello: 'deepseek:deepseek-v4-pro', reasoning: { effort: 'high' } }
        const w2 = await schermata()
        expect(w2.find('[data-testid="talos-chatgpt-pill"]').exists()).toBe(false)
        // …e i suoi giri non entrano nel conto del piano
        stato.registrati = []
        const flusso2 = stato.flussi.at(-1)!
        ;(stato.ascoltatori.r4Pezzo ?? []).forEach((a) => a({ id: flusso2.id, testo: ['data: {"type":"CUSTOM","name":"talos.fine-rigiocata","value":{}}', 'data: {"type":"RunStarted","runId":"r1","input":{}}', uso(1, 500), ''].join(String.fromCharCode(10, 10)) }))
        await asciuga()
        await new Promise((x) => setTimeout(x, 20))
        expect(stato.registrati).toEqual([])
        w2.unmount()
    })

    /*
     * ⛔ CODICE COL MOTORE LOCALE (owner 18/10/2026; ledger `LEDGER-CODICE-MOTORE-LOCALE-2026-10-18.md`): il modello della chat si apre con
     * la finestra del Codice (minimo 16k), l'app avvia l'endpoint sul socket privato e lo spinge a r4 (solo i campi del contratto), poi
     * `/settings` con `locale-ospite:<nome del file>`. Alla scelta e prima di ogni giro, come la chiave degli altri fornitori.
     */
    it('CMO-13 scegliere il modello locale: apertura per il Codice, spinta dell’endpoint, poi `/settings` con `locale-ospite:`', async () => {
        const w = await schermata()
        compositore(w).vm.$emit('selectModelProfile', LOCALE.id)
        await asciuga()
        expect(stato.aperture).toEqual(['gemma.gguf'])
        const spinta = { socketPath: '/data/user/0/ai.talos.dev/files/locale-ospite/motore.sock', chiave: 'c'.repeat(64), modello: 'gemma.gguf', nCtx: 32768, capacita: { tools: true } }
        expect(scritte()[0]).toBe(`/api/v1/providers/locale-ospite/access ${JSON.stringify(spinta)}`)
        expect(scritte()[1]).toMatch(new RegExp(`^/api/v1/sessions/${SESSIONE}/settings [{]"modello":"locale-ospite:gemma.gguf"`))
        expect(scritte().some((x) => x.includes('/key'))).toBe(false)
        expect(stato.setShell).toEqual([{ codice_model: LOCALE.id, codice_effort: expect.any(String) }])
        w.unmount()
    })

    /*
     * Pad 22/10/2026 16:08 (foto): dopo il tocco su un modello locale il foglio restava com'era per i secondi dell'apertura (la spunta
     * sul modello di prima, nessun segno): la persona crede che il tocco non sia arrivato e tocca ancora. Come PocketPal
     * (`ModelCard.tsx:594-603`) e Gallery (`ModelInitializationStatus.kt:50-80`), la riga toccata dice che il modello si sta aprendo;
     * un secondo tocco intanto non apre una seconda volta.
     */
    it('CMO-13b mentre il modello locale si apre il foglio lo dice sulla riga toccata, e un secondo tocco non riapre', async () => {
        let sciogli: () => void = () => undefined
        stato.attesaApertura = new Promise<void>((ok) => { sciogli = ok })
        const w = await schermata()
        compositore(w).vm.$emit('selectModelProfile', LOCALE.id)
        await asciuga()
        expect(compositore(w).props('openingModelProfileId')).toBe(LOCALE.id)
        compositore(w).vm.$emit('selectModelProfile', LOCALE.id)
        await asciuga()
        expect(stato.aperture).toEqual(['gemma.gguf'])
        sciogli()
        await asciuga()
        expect(compositore(w).props('openingModelProfileId')).toBeNull()
        expect(scritte().some((x) => x.includes('"modello":"locale-ospite:gemma.gguf"'))).toBe(true)
        w.unmount()
    })

    /* Revisione avversaria 22/10, rilievo 5: durante l'apertura un invio partirebbe col modello di prima, in gara con l'apertura. */
    it('CMO-13c mentre il modello si apre non si invia e non si accoda', async () => {
        let sciogli: () => void = () => undefined
        stato.attesaApertura = new Promise<void>((ok) => { sciogli = ok })
        const w = await schermata()
        expect(compositore(w).props('canSend')).toBe(true)
        compositore(w).vm.$emit('selectModelProfile', LOCALE.id)
        await asciuga()
        expect(compositore(w).props('canSend')).toBe(false)
        expect(compositore(w).props('canQueue')).toBe(false)
        // anche un invio che arriva lo stesso (tastiera, evento) non parte
        const prima = stato.richieste.length
        compositore(w).vm.$emit('update:prompt', 'scrivi un test')
        compositore(w).vm.$emit('send')
        await asciuga()
        expect(stato.richieste.slice(prima).some((r) => /\/(resume|custom)$/.test(r.percorso))).toBe(false)
        sciogli()
        await asciuga()
        expect(compositore(w).props('canSend')).toBe(true)
        w.unmount()
    })

    /* Rilievo 5, a giro vivo: «Accoda» c'è; mentre il modello scelto si apre, il testo accodato partirebbe col modello di prima. */
    it('CMO-13e a giro vivo, mentre il modello scelto si apre, «Accoda» non c\'è', async () => {
        const w = await schermata()
        const flusso = stato.flussi.at(-1)!
        ;(stato.ascoltatori.r4Pezzo ?? []).forEach((a) => a({ id: flusso.id, testo: ['data: {"type":"CUSTOM","name":"talos.fine-rigiocata","value":{}}', 'data: {"type":"RunStarted","runId":"r1","input":{}}', ''].join(String.fromCharCode(10, 10)) }))
        await asciuga()
        expect(compositore(w).props('canQueue')).toBe(true)
        let sciogli: () => void = () => undefined
        stato.attesaApertura = new Promise<void>((ok) => { sciogli = ok })
        compositore(w).vm.$emit('selectModelProfile', LOCALE.id)
        await asciuga()
        expect(compositore(w).props('canQueue')).toBe(false)
        sciogli()
        await asciuga()
        w.unmount()
    })

    /* Rilievo 6: l'apertura appartiene alla sua sessione; cambiando sessione il segno sparisce e la scelta vecchia non si ricorda. */
    it('CMO-13d cambiare sessione durante l\'apertura toglie il segno e la scelta vecchia non diventa l\'ultima del Codice', async () => {
        let sciogli: () => void = () => undefined
        stato.attesaApertura = new Promise<void>((ok) => { sciogli = ok })
        const w = await schermata()
        compositore(w).vm.$emit('selectModelProfile', LOCALE.id)
        await asciuga()
        expect(compositore(w).props('openingModelProfileId')).toBe(LOCALE.id)
        // la rotta reattiva del finto vue-router (scrivere su `stato.params` non sveglierebbe l'osservatore della schermata)
        const { useRoute } = await import('vue-router')
        useRoute().params.id = '44444444-4444-4444-8444-444444444444'
        await asciuga()
        expect(compositore(w).props('openingModelProfileId')).toBeNull()
        sciogli()
        await asciuga()
        expect(stato.setShell).toEqual([])
        expect(compositore(w).props('openingModelProfileId')).toBeNull()
        w.unmount()
    })

    it('CMO-14 un modello che sul telefono non arriva a 24k: niente spinta, il modello resta quello di prima, e la riga dice perché', async () => {
        stato.apertura = { esito: 'troppo-piccolo', massimo: 9216 }
        const w = await schermata()
        compositore(w).vm.$emit('selectModelProfile', LOCALE.id)
        await asciuga()
        expect(scritte()).toEqual([])
        expect(compositore(w).props('selectedModelProfileId')).toBe('deepseek:deepseek-v4-pro')
        expect(w.get('[data-testid="talos-codice-r4-errore"]').text())
            .toBe('On this device this model cannot open with the 24k tokens of context Code needs (at most 9k). Choose a smaller model.')
        w.unmount()
    })

    it('CMO-15 un template che non sa chiamare attrezzi: niente spinta, e la riga dice perché', async () => {
        stato.apertura = { esito: 'senza-attrezzi' }
        const w = await schermata()
        compositore(w).vm.$emit('selectModelProfile', LOCALE.id)
        await asciuga()
        expect(scritte()).toEqual([])
        expect(w.get('[data-testid="talos-codice-r4-errore"]').text())
            .toBe("This model's template cannot call tools, so in Code it could not read or change files. Choose a model that supports tools.")
        w.unmount()
    })

    it('CMO-16 l’endpoint non è pronto (il modello si è chiuso): r4 lo dimentica e la riga dice le parole del desktop', async () => {
        stato.ospite = { pronto: false }
        const w = await schermata()
        compositore(w).vm.$emit('selectModelProfile', LOCALE.id)
        await asciuga()
        expect(scritte()).toEqual(['/api/v1/providers/locale-ospite/access/remove {}'])
        expect(w.get('[data-testid="talos-codice-r4-errore"]').text()).toBe('No local model is open in the app: open one from the model picker.')
        w.unmount()
    })

    it('CMO-17 prima di ogni invio col modello locale: apertura e spinta di nuovo, poi il giro', async () => {
        stato.sessione = { modello: 'locale-ospite:gemma.gguf', reasoning: null }
        const w = await schermata()
        expect(compositore(w).props('selectedModelProfileId')).toBe(LOCALE.id)
        await w.get('[data-testid="talos-composer-prompt"]').setValue('Esegui i test')
        compositore(w).vm.$emit('send')
        await asciuga()
        expect(stato.aperture).toEqual(['gemma.gguf'])
        const i = scritte().findIndex((x) => x.startsWith('/api/v1/providers/locale-ospite/access '))
        expect(i).toBeGreaterThanOrEqual(0)
        expect(scritte().slice(i + 1).some((x) => x.includes(`/api/v1/sessions/${SESSIONE}/`))).toBe(true)
        w.unmount()
    })

    it('CMR-01 ⛔ D-RM4-3 (Pad 20/10, i due tasti del foglio non facevano niente): in locale «Aggiorna» e «Laboratorio modelli» come nella chat', async () => {
        const w = await schermata()
        // la rotella è quella della chat (la sua scoperta dei fornitori), come `ChatScreen`
        stato.chat!.refreshingModels.value = true
        await asciuga()
        expect(compositore(w).props('refreshingModels')).toBe(true)
        stato.chat!.refreshingModels.value = false
        await w.get('[data-testid="talos-composer-model-chip"]').trigger('click')
        await asciuga()
        const richiestePrima = stato.richieste.length
        await w.get('[aria-label="Refresh model catalog"]').trigger('click')
        await asciuga()
        expect(stato.aggiornamenti).toBe(1)
        // in locale «Aggiorna» è la scoperta dei fornitori dell'app (quella della chat), non una lettura del r4
        expect(stato.richieste).toHaveLength(richiestePrima)
        await w.get('[aria-label="Open Model Lab"]').trigger('click')
        await asciuga()
        expect(stato.spinte).toEqual([{ name: 'settings-models' }])
        w.unmount()
    })

    it('CMR-05 D-RM4-4: in locale la scheda Terminale non ha l\'avviso del PC', async () => {
        const w = await schermata()
        w.getComponent(TalosCodiceR4Viste).vm.$emit('scegli', 'terminale')
        await asciuga()
        expect(w.find('[data-testid="talos-codice-r4-terminale-solo-dal-pc"]').exists()).toBe(false)
        w.unmount()
    })

    it('CMO-18 un file di modello con un nome che r4 non accetta: nessuna apertura né spinta, e la riga dice come rinominarlo', async () => {
        const strano = profilo('local', '/data/models/gemma 3 (copia).gguf')
        const w = await schermata([DEEPSEEK, strano])
        compositore(w).vm.$emit('selectModelProfile', strano.id)
        await asciuga()
        expect(stato.aperture).toEqual([])
        expect(scritte()).toEqual([])
        expect(w.get('[data-testid="talos-codice-r4-errore"]').text())
            .toBe('Code cannot use a model file named "gemma 3 (copia).gguf": rename it using only letters, numbers, dots, dashes or underscores.')
        w.unmount()
    })
})
