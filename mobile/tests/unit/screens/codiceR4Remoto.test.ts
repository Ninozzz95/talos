// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { TalosR4ClientePonte } from '@/lib/harness/r4/clienteR4'
import type { TalosMobileModelProfileView } from '@/components/chat/mobileChatTypes'

/**
 * ⛔ CLIENT DEL CONTROLLO REMOTO, fetta R-M4 (ledger `LEDGER-CLIENT-REMOTO-MOBILE-2026-10-20.md`): la schermata del Codice sulla
 * sessione di un PC accoppiato (`/computer/:pcId/codice/:id`), col ponte remoto al posto del client del r4 del telefono.
 * ⛔ SICUREZZA: in remoto il telefono non spinge MAI al PC una chiave, l'accesso ChatGPT o il motore locale.
 */
const SESSIONE = '33333333-3333-4333-8333-333333333333'
const profilo = (provider: string, model: string): TalosMobileModelProfileView => ({
    id: `${provider}:${model}`, provider: provider as TalosMobileModelProfileView['provider'], model, display_name: `Nome ${model}`, status: 'untested',
    has_secret: true, effort_levels: ['off', 'low', 'medium', 'high'], supports_thinking: true, show_in_composer: true, capabilities: null, probe_ok: null,
})
const GLM = profilo('openrouter', 'z-ai/glm-4.7-flash')
const LOCALE = profilo('local', 'gemma.gguf')
const PIANO = profilo('chatgpt', 'gpt-5')

const stato = vi.hoisted(() => ({
    params: { pcId: 'pc-uno', id: '33333333-3333-4333-8333-333333333333' } as Record<string, string>,
    query: {} as Record<string, string>,
    locali: [] as { metodo: string; percorso: string; corpo?: string }[],
    remote: [] as { metodo: string; percorso: string; corpo?: string }[],
    flussiRemoti: [] as { id: string; percorso: string }[],
    remotoGuasto: false,
    attesaPonte: null as null | Promise<void>,
    ponteChiuso: false,
    sostituzioni: [] as unknown[],
    accessi: 0,
    aperture: 0,
    chiavi: 0,
    // D-RM4-3 (Pad 20/10): «Aggiorna» del foglio; `attesaFornitori` tiene ferma la lettura dei fornitori del PC (la rotella)
    aggiornamentiTelefono: 0,
    attesaFornitori: null as null | Promise<void>,
    nuovoModelloPc: false,
    // ⛔ revisione avversariale R-M4 (21/10/2026): ciò che il telefono salva, le rotte spinte, il conto del piano, la risposta del PC
    spinte: [] as unknown[],
    shellSalvate: [] as Record<string, unknown>[],
    registrati: [] as (number | null)[],
    ascoltatoriRemoti: {} as Record<string, ((d: Record<string, unknown>) => void)[]>,
    modelloSessione: 'deepseek:deepseek-v4-pro',
    hook: [] as unknown[],
    rispondi: null as null | ((r: { metodo: string; percorso: string; corpo?: string }) => { stato: number; corpo: string } | null),
    chat: null as null | { profiles: { value: TalosMobileModelProfileView[] }; refreshingModels: { value: boolean } },
}))

function ponteFinto(registro: { metodo: string; percorso: string; corpo?: string }[], flussi: { id: string; percorso: string }[]): TalosR4ClientePonte {
    return {
        richiesta: async (r) => {
            registro.push(r)
            const scelta = stato.rispondi?.(r)
            if (scelta) return scelta
            const ok = (d: unknown) => ({ stato: 200, corpo: JSON.stringify(d) })
            if (r.metodo === 'GET' && r.percorso === '/api/v1/sessions') {
                return ok({ ok: true, data: { items: [{ sessionId: SESSIONE, nome: 'Sul PC', permessi: 'Full access', permessiPerAttrezzo: {}, modello: stato.modelloSessione, reasoning: { effort: 'high' } }] } })
            }
            if (r.metodo === 'GET' && r.percorso === `/api/v1/sessions/${SESSIONE}/hooks`) return ok({ ok: true, data: { hooks: stato.hook } })
            // R-M4c: i fornitori e i modelli DEL PC (forme di r4 2297237fd), solo dal ponte remoto
            if (r.metodo === 'GET' && r.percorso === '/api/v1/providers' && registro === stato.remote) {
                if (stato.attesaFornitori) await stato.attesaFornitori
                return ok({ ok: true, data: { items: [{ id: 'anthropic', label: 'Anthropic', requiresKey: true, keyConfigured: true }] } })
            }
            if (r.metodo === 'GET' && r.percorso === '/api/v1/providers/anthropic/models' && registro === stato.remote) {
                return ok({ ok: true, data: { provider: 'anthropic', modelli: [{ id: 'anthropic:claude-pc', nome: 'Claude del PC', reasoning: { supportedEfforts: ['low', 'high'] } },
                    { id: 'deepseek:deepseek-v4-pro', nome: 'DeepSeek del PC' },
                    ...(stato.nuovoModelloPc ? [{ id: 'anthropic:claude-nuovo', nome: 'Claude nuovo del PC' }] : [])] } })
            }
            return ok({ ok: true, data: {} })
        },
        apriFlusso: async (f) => { flussi.push(f) },
        chiudiFlusso: async () => undefined,
        apriTerminale: async () => undefined,
        scriviTerminale: async () => undefined,
        ridimensionaTerminale: async () => undefined,
        chiudiTerminale: async () => undefined,
        addListener: async (evento, ascoltatore) => {
            if (registro === stato.remote) (stato.ascoltatoriRemoti[evento] ??= []).push(ascoltatore as (d: Record<string, unknown>) => void)
            return { remove: async () => undefined }
        },
    }
}

vi.mock('vue-router', async () => {
    const { reactive } = await import('vue')
    const rotta = reactive({ params: stato.params, query: stato.query })
    return { useRoute: () => rotta, useRouter: () => ({ push: (r: unknown) => { stato.spinte.push(r) }, replace: (r: unknown) => { stato.sostituzioni.push(r) } }) }
})
vi.mock('@/lib/harness/terminalePonte', () => ({ talosR4Pronto: async () => ({ disponibile: true, acceso: true, porta: 4178, cartella: '/data/w' }) }))
vi.mock('@/services/secureKeyStore', () => ({ getProviderKey: async () => { stato.chiavi += 1; return 'sk-telefono' } }))
vi.mock('@/services/chatgptAccesso', () => ({
    talosChatgpt: () => ({ accessoValido: async () => { stato.accessi += 1; return { accessToken: 'tok-telefono', scadeAlle: 1_900_000_000_000 } } }),
}))
vi.mock('@/lib/chat/providers/localAdapter', () => ({ talosApriPerIlCodice: async () => { stato.aperture += 1; return { esito: 'aperto', nCtx: 32768 } } }))
vi.mock('@/services/localEngine', () => ({ talosMotoreOspite: async () => ({ pronto: true, socketPath: '/x', chiave: 'c'.repeat(64), modello: 'gemma.gguf', nCtx: 32768 }) }))
vi.mock('@/services/chatgptConsumi', () => ({ talosConsumiChatgpt: () => ({ registra: (token: number | null) => { stato.registrati.push(token) } }) }))
vi.mock('@/components/chat/TalosMobileChatgptPastiglia.vue', async () => {
    const { h } = await import('vue')
    return { __esModule: true, default: { render: () => h('span', { 'data-testid': 'talos-chatgpt-pill' }) } }
})
vi.mock('@/stores/chatController', async () => {
    const { ref, reactive } = await import('vue')
    const chat = {
        profiles: ref<TalosMobileModelProfileView[]>([]), discoveryProblems: ref([]), refreshingModels: ref(false),
        endpoints: reactive<Record<string, string | null>>({}), selectedModelId: ref<string | null>(null), effort: ref('medium'),
        refreshConfiguredProviders: async () => { stato.aggiornamentiTelefono += 1 },
    }
    stato.chat = chat as never
    return { useChatController: () => chat }
})
vi.mock('@/lib/harness/r4/clienteR4', () => ({ talosClienteR4: () => ponteFinto(stato.locali, []) }))
vi.mock('@/lib/remoto/pluginRemoto', () => ({ pluginRemoto: () => ({}) }))
vi.mock('@/lib/remoto/sessioneRemota', () => ({
    apriPonteRemoto: async () => {
        if (stato.attesaPonte) await stato.attesaPonte
        if (stato.remotoGuasto) throw Object.assign(new Error('x'), { code: 'CONNECT_FAILED' })
        return { ponte: ponteFinto(stato.remote, stato.flussiRemoti), chiudi: async () => { stato.ponteChiuso = true } }
    },
}))
vi.mock('@/stores/settings', () => ({
    useSettingsStore: () => ({
        state: {
            chat_layout: { message_style: 'sections', bubble_scale: 'large' },
            shell: { debug_diagnostics: false, streaming_animation: 'fade', composer_shape: 'calm', composer_plus: 'dropdown', codice_model: null, codice_effort: null },
            voice: { dictation_language: 'auto' },
        },
        setShell: async (parte: Record<string, unknown>) => { stato.shellSalvate.push(parte) },
    }),
}))
vi.mock('@/composables/useTalosMobileDictation', async () => {
    const { ref } = await import('vue')
    return { useTalosMobileDictation: () => ({ visible: ref(true), status: ref('idle'), level: ref(0), error: ref(''), errorCode: ref(null), toggle: vi.fn(), cancel: vi.fn(), finisci: vi.fn() }) }
})

import CodiceR4Screen from '@/screens/CodiceR4Screen.vue'
import TalosMobileComposer from '@/components/chat/TalosMobileComposer.vue'
import TalosCodiceR4Header from '@/components/codice/TalosCodiceR4Header.vue'
import TalosCodiceR4ComandiSheet from '@/components/codice/TalosCodiceR4ComandiSheet.vue'
import TalosCodiceR4Viste from '@/components/codice/TalosCodiceR4Viste.vue'
import TalosCodiceR4Terminale from '@/components/codice/TalosCodiceR4Terminale.vue'
import TalosCodiceR4File from '@/components/codice/TalosCodiceR4File.vue'
import TalosCodiceR4Processi from '@/components/codice/TalosCodiceR4Processi.vue'
import type { ProcessoGrezzoR4 } from '@/lib/harness/r4/processiR4'

async function asciuga() { for (let i = 0; i < 5; i++) { await flushPromises(); await vi.dynamicImportSettled() } }
async function schermata() {
    stato.chat!.profiles.value = [GLM, LOCALE, PIANO]
    const w = mount(CodiceR4Screen, { attachTo: document.body, global: { stubs: { teleport: true } } })
    await asciuga()
    return w
}
const azzera = () => {
    stato.locali.length = 0; stato.remote.length = 0; stato.flussiRemoti.length = 0; stato.sostituzioni.length = 0
    stato.remotoGuasto = false; stato.ponteChiuso = false; stato.accessi = 0; stato.aperture = 0; stato.chiavi = 0
    stato.aggiornamentiTelefono = 0; stato.attesaFornitori = null; stato.nuovoModelloPc = false
    stato.spinte.length = 0; stato.shellSalvate.length = 0; stato.registrati.length = 0; stato.ascoltatoriRemoti = {}
    stato.modelloSessione = 'deepseek:deepseek-v4-pro'; stato.hook = []; stato.rispondi = null
    for (const k of Object.keys(stato.query)) delete stato.query[k]
}

describe('il Codice sulla sessione di un PC', () => {
    it('REM-01 tutto passa dal ponte remoto: la sessione e il suo flusso; al client del r4 del telefono non arriva niente', async () => {
        azzera()
        const w = await schermata()
        expect(stato.remote.some((r) => r.metodo === 'GET' && r.percorso === '/api/v1/sessions')).toBe(true)
        expect(stato.flussiRemoti.some((f) => f.percorso.startsWith(`/api/v1/sessions/${SESSIONE}/events`))).toBe(true)
        expect(stato.locali).toEqual([])
        w.unmount()
        await asciuga()
        expect(stato.ponteChiuso).toBe(true)
    })

    it('REM-02 ⛔ scegliere un modello in remoto: nessuna chiave, nessun accesso, nessun motore locale va al PC; solo `/settings`', async () => {
        for (const p of [GLM, PIANO, LOCALE]) {
            azzera()
            const w = await schermata()
            w.getComponent(TalosMobileComposer).vm.$emit('selectModelProfile', p.id)
            await asciuga()
            const tutte = [...stato.remote, ...stato.locali]
            // R-M4c: LEGGERE i modelli del PC (`GET /providers/<id>/models`) è il selettore del PC; scrivere chiavi o accessi mai
            expect(tutte.filter((r) => r.metodo !== 'GET' && /\/providers\/|\/key|\/access/u.test(r.percorso)), p.id).toEqual([])
            expect(tutte.filter((r) => /\/key|\/access|\/runtime/u.test(r.percorso)), p.id).toEqual([])
            expect(stato.accessi + stato.aperture + stato.chiavi, p.id).toBe(0)
            expect(stato.locali, p.id).toEqual([])
            w.unmount()
            await asciuga()
        }
    })

    it('REM-04 senza una sessione del PC e senza una cartella scelta: nessuna sessione nuova, si torna al computer e lo si dice', async () => {
        azzera()
        delete stato.params.id
        const w = await schermata()
        expect(stato.remote.some((r) => r.percorso === '/api/v1/sessions/custom')).toBe(false)
        expect(stato.sostituzioni).toContainEqual({ name: 'computer-item', params: { pcId: 'pc-uno' } })
        // una cartella che non rispetta la regola degli id del PC vale come nessuna cartella
        stato.query.cartella = '../casa'
        const w2 = await schermata()
        expect(stato.sostituzioni.filter((x) => JSON.stringify(x) === JSON.stringify({ name: 'computer-item', params: { pcId: 'pc-uno' } }))).toHaveLength(2)
        stato.params.id = SESSIONE
        w.unmount()
        w2.unmount()
    })

    it('REM-05 Q2 (owner 20/10 «fra le cartelle ammesse»): la sessione nuova parte con la cartella del PC per id, mai la cartella del telefono', async () => {
        azzera()
        delete stato.params.id
        stato.query.cartella = 'r4-remoto'
        // in locale la sessione nuova partirebbe dalla scelta della chat: in remoto quella scelta (un profilo del telefono) non conta
        stato.chat!.selectedModelId.value = GLM.id
        const w = await schermata()
        expect(stato.sostituzioni).not.toContainEqual({ name: 'computer-item', params: { pcId: 'pc-uno' } })
        await w.get('[data-testid="talos-composer-prompt"]').setValue('ciao dal telefono')
        w.getComponent(TalosMobileComposer).vm.$emit('send')
        await asciuga()
        const avvio = stato.remote.find((r) => r.metodo === 'POST' && r.percorso === '/api/v1/sessions/custom')
        expect(avvio).toBeTruthy()
        const corpo = JSON.parse(avvio!.corpo!)
        expect(corpo.cartellaId).toBe('r4-remoto')
        expect(corpo).not.toHaveProperty('cartellaLibera')
        expect(corpo.consegna).toBe('ciao dal telefono')
        // Q1: il modello di una sessione nuova in remoto non viene dai profili del telefono (lo decide il PC finché non c'è l'elenco del PC)
        expect(corpo).not.toHaveProperty('modello')
        expect(stato.locali).toEqual([])
        stato.chat!.selectedModelId.value = null
        stato.params.id = SESSIONE
        w.unmount()
    })

    it('REM-06 C1 (revisione del Desktop 20/10; owner 24/09 «Compatta ora» chiede conferma): niente /compact prima del sì', async () => {
        azzera()
        const w = await schermata()
        w.getComponent(TalosCodiceR4Header).vm.$emit('compatta')
        await asciuga()
        expect(stato.remote.some((r) => r.percorso.endsWith('/compact'))).toBe(false)
        const conferma = document.querySelector<HTMLButtonElement>('[data-testid="talos-codice-r4-compatta-conferma"]')
        expect(conferma).toBeTruthy()
        conferma!.click()
        await asciuga()
        expect(stato.remote.filter((r) => r.metodo === 'POST' && r.percorso === `/api/v1/sessions/${SESSIONE}/compact`)).toHaveLength(1)
        // anche dal foglio dei comandi («/compact»): prima la domanda
        w.getComponent(TalosCodiceR4Header).vm.$emit('comandi')
        await asciuga()
        w.getComponent(TalosCodiceR4ComandiSheet).vm.$emit('comando', 'compatta')
        await asciuga()
        expect(stato.remote.filter((r) => r.percorso.endsWith('/compact'))).toHaveLength(1)
        expect(document.querySelector('[data-testid="talos-codice-r4-compatta-conferma"]')).toBeTruthy()
        w.unmount()
    })

    it('REM-07 C2 (revisione del Desktop 20/10): aprire la sessione del PC non chiede mai il Doctor (sul PC lancia comandi)', async () => {
        azzera()
        const w = await schermata()
        expect(stato.remote.filter((r) => r.percorso.startsWith('/api/v1/doctor'))).toEqual([])
        w.unmount()
    })

    it('REM-08 Q1 (owner 20/10 «Quelli del PC»): il foglio dei modelli ha i modelli del PC, non i profili del telefono; la scelta va al PC', async () => {
        azzera()
        // un avviso dei modelli del TELEFONO non c'entra col PC: il foglio in remoto non lo mostra
        ;(stato.chat as unknown as { discoveryProblems: { value: unknown[] } }).discoveryProblems.value = [{ message: 'chiave del telefono scaduta' }]
        const w = await schermata()
        await vi.waitFor(() => {
            const ids = (w.getComponent(TalosMobileComposer).props('modelProfiles') as TalosMobileModelProfileView[]).map((p) => p.id)
            if (!ids.includes('pc:anthropic:claude-pc')) throw new Error(`ancora: ${ids.join(',')}`)
        })
        const ids = (w.getComponent(TalosMobileComposer).props('modelProfiles') as TalosMobileModelProfileView[]).map((p) => p.id)
        // nessun profilo del telefono nel foglio (GLM, il motore locale, il piano ChatGPT del telefono)
        expect(ids.filter((id) => [GLM.id, LOCALE.id, PIANO.id].includes(id))).toEqual([])
        expect(w.getComponent(TalosMobileComposer).props('discoveryProblems')).toEqual([])
        // la pastiglia: il modello della sessione del PC è uno di quelli del PC, col suo nome
        expect(w.getComponent(TalosMobileComposer).props('selectedModelProfileId')).toBe('pc:deepseek:deepseek-v4-pro')
        w.getComponent(TalosMobileComposer).vm.$emit('selectModelProfile', 'pc:anthropic:claude-pc')
        await asciuga()
        const impostazioni = stato.remote.filter((r) => r.metodo === 'POST' && r.percorso === `/api/v1/sessions/${SESSIONE}/settings`)
        expect(impostazioni).toHaveLength(1)
        expect(JSON.parse(impostazioni[0].corpo!).modello).toBe('anthropic:claude-pc')
        expect(stato.remote.filter((r) => /\/key|\/access/u.test(r.percorso))).toEqual([])
        expect(stato.accessi + stato.aperture + stato.chiavi).toBe(0)
        ;(stato.chat as unknown as { discoveryProblems: { value: unknown[] } }).discoveryProblems.value = []
        w.unmount()
    })

    /** Il foglio dei modelli aperto dalla pastiglia del compositore, come lo apre chi tocca (compositore → foglio → selettore). */
    async function apriIlFoglio(w: Awaited<ReturnType<typeof schermata>>) {
        await w.get('[data-testid="talos-composer-model-chip"]').trigger('click')
        await asciuga()
    }
    const lettureDeiFornitori = () => stato.remote.filter((r) => r.metodo === 'GET' && r.percorso === '/api/v1/providers').length
    const idNelFoglio = (w: Awaited<ReturnType<typeof schermata>>) => (w.getComponent(TalosMobileComposer).props('modelProfiles') as TalosMobileModelProfileView[]).map((p) => p.id)

    it('CMR-02 ⛔ D-RM4-3 (Pad 20/10, «Aggiorna» non faceva niente): in remoto rilegge i modelli DEL PC sul ponte aperto, con la rotella del PC', async () => {
        azzera()
        // la rotella del TELEFONO (la sua scoperta dei fornitori) non c'entra col PC: in remoto non si vede
        stato.chat!.refreshingModels.value = true
        const w = await schermata()
        await vi.waitFor(() => { if (!idNelFoglio(w).includes('pc:anthropic:claude-pc')) throw new Error('modelli del PC non ancora letti') })
        expect(lettureDeiFornitori()).toBe(1)
        expect(w.getComponent(TalosMobileComposer).props('refreshingModels')).toBe(false)
        let rilascia!: () => void
        stato.attesaFornitori = new Promise<void>((r) => { rilascia = r })
        stato.nuovoModelloPc = true
        await apriIlFoglio(w)
        await w.get('[aria-label="Refresh model catalog"]').trigger('click')
        await asciuga()
        // una lettura nuova sul ponte remoto, e intanto la rotella dice che si sta rileggendo il PC
        expect(lettureDeiFornitori()).toBe(2)
        expect(w.getComponent(TalosMobileComposer).props('refreshingModels')).toBe(true)
        // un secondo «Aggiorna» mentre il PC risponde non apre una seconda lettura
        w.getComponent(TalosMobileComposer).vm.$emit('refreshModels')
        await asciuga()
        expect(lettureDeiFornitori()).toBe(2)
        rilascia()
        stato.attesaFornitori = null
        await asciuga()
        expect(w.getComponent(TalosMobileComposer).props('refreshingModels')).toBe(false)
        expect(idNelFoglio(w)).toContain('pc:anthropic:claude-nuovo')
        // la scoperta dei fornitori del telefono non parte, e al client del r4 del telefono non arriva niente
        expect(stato.aggiornamentiTelefono).toBe(0)
        expect(stato.locali).toEqual([])
        stato.chat!.refreshingModels.value = false
        w.unmount()
    })

    it('CMR-03 D-RM4-3: in remoto il foglio non offre il Laboratorio modelli (è quello del TELEFONO); «Aggiorna» resta', async () => {
        azzera()
        const w = await schermata()
        await apriIlFoglio(w)
        expect(w.find('[aria-label="Refresh model catalog"]').exists()).toBe(true)
        expect(w.find('[aria-label="Open Model Lab"]').exists()).toBe(false)
        w.unmount()
    })

    it('CMR-04 ⛔ D-RM4-4 (Pad 20/10, schermata vuota): in remoto la scheda Terminale resta e dice che il terminale si usa dal computer', async () => {
        azzera()
        const w = await schermata()
        const viste = w.getComponent(TalosCodiceR4Viste)
        // la disposizione resta quella del PC: la scheda c'è
        expect(viste.text()).toContain('Terminal')
        viste.vm.$emit('scegli', 'terminale')
        await asciuga()
        const avviso = w.get('[data-testid="talos-codice-r4-terminale-solo-dal-pc"]')
        expect(avviso.attributes('role')).toBe('status')
        expect(avviso.isVisible()).toBe(true)
        expect(avviso.text()).toBe('The terminal is used on the computer.')
        // il terminale del PC non passa dal telefono: nessuna shell montata, nessuna frase del terminale locale
        expect(w.findComponent(TalosCodiceR4Terminale).exists()).toBe(false)
        expect(w.find('[data-testid="talos-codice-r4-terminale-senza-sessione"]').exists()).toBe(false)
        viste.vm.$emit('scegli', 'chat')
        await asciuga()
        expect(w.find('[data-testid="talos-codice-r4-terminale-solo-dal-pc"]').exists()).toBe(false)
        w.unmount()
    })

    it('REM-09 RA-05 (revisione 21/10): uscire mentre il canale si apre ⇒ appena aperto si chiude, e nessuna sessione parte', async () => {
        azzera()
        let sblocca: () => void = () => undefined
        stato.attesaPonte = new Promise((ok) => { sblocca = ok })
        stato.chat!.profiles.value = [GLM, LOCALE, PIANO]
        const w = mount(CodiceR4Screen, { attachTo: document.body, global: { stubs: { teleport: true } } })
        await flushPromises()
        w.unmount()
        sblocca()
        stato.attesaPonte = null
        await asciuga()
        expect(stato.ponteChiuso).toBe(true)
        expect(stato.flussiRemoti).toEqual([])
        expect(stato.remote.filter((r) => r.percorso.includes('/events'))).toEqual([])
    })

    it('REM-03 il PC non si raggiunge: si torna al dettaglio del computer, il client del telefono resta muto', async () => {
        azzera()
        stato.remotoGuasto = true
        const w = await schermata()
        expect(stato.sostituzioni).toContainEqual({ name: 'computer-item', params: { pcId: 'pc-uno' } })
        expect(stato.locali).toEqual([])
        w.unmount()
    })
})

/**
 * ⛔ Revisione avversariale della fetta R-M4 (21/10/2026): in remoto la schermata guidava ancora cose del TELEFONO (le sue impostazioni,
 * il suo piano ChatGPT, il suo elenco delle sessioni) e offriva azioni che il PC rifiuta. Regola «no fake feature»: ciò che si fa solo
 * dal PC si vede spento, col perché («Solo dal computer»). Il locale resta com'era (`codiceR4Modello`, `codiceR4Screen`, `codiceR4Header`).
 */
describe('il Codice sulla sessione di un PC: revisione avversariale R-M4', () => {
    const SOLO_DAL_PC = 'Only from the computer'
    const manda = (testo: string) => {
        const flusso = stato.flussiRemoti.at(-1)!
        for (const a of stato.ascoltatoriRemoti.r4Pezzo ?? []) a({ id: flusso.id, testo })
    }
    const uso = (giri: number, p: number) => `data: {"type":"StateDelta","delta":[{"op":"replace","path":"/usage","value":{"prompt_tokens":${p},"completion_tokens":0,"giri":${giri}}}]}`
    const rifiutoDelResume = (errore: Record<string, unknown>) => {
        stato.rispondi = (r) => (r.metodo === 'POST' && r.percorso.endsWith('/resume')
            ? { stato: 400, corpo: JSON.stringify({ ok: false, error: errore }) } : null)
    }
    async function inviaDalCompositore(w: Awaited<ReturnType<typeof schermata>>, testo: string) {
        await w.get('[data-testid="talos-composer-prompt"]').setValue(testo)
        w.getComponent(TalosMobileComposer).vm.$emit('send')
        await asciuga()
    }

    it('RRV-07 ⛔ RA-07: scegliere modello e livello in remoto non tocca le impostazioni del TELEFONO (il suo Codice tiene la sua ultima scelta)', async () => {
        azzera()
        const w = await schermata()
        await vi.waitFor(() => {
            const ids = (w.getComponent(TalosMobileComposer).props('modelProfiles') as TalosMobileModelProfileView[]).map((p) => p.id)
            if (!ids.includes('pc:anthropic:claude-pc')) throw new Error('modelli del PC non ancora letti')
        })
        w.getComponent(TalosMobileComposer).vm.$emit('selectModelProfile', 'pc:anthropic:claude-pc')
        await asciuga()
        w.getComponent(TalosMobileComposer).vm.$emit('selectEffort', 'low')
        await asciuga()
        // le due scelte sono arrivate al PC…
        expect(stato.remote.filter((r) => r.metodo === 'POST' && r.percorso === `/api/v1/sessions/${SESSIONE}/settings`)).toHaveLength(2)
        // …e nessuna è finita nelle impostazioni del telefono
        expect(stato.shellSalvate.filter((s) => 'codice_model' in s || 'codice_effort' in s)).toEqual([])
        w.unmount()
    })

    it('RRV-08 ⛔ RA-08: una sessione del PC con un modello `chatgpt:` non mostra il piano del telefono né conta i suoi giri nel suo conto', async () => {
        azzera()
        stato.modelloSessione = 'chatgpt:gpt-5'
        const w = await schermata()
        expect(w.find('[data-testid="talos-chatgpt-pill"]').exists()).toBe(false)
        // un rifiuto del piano detto dal PC si legge con le parole del PC (i suoi Fornitori), non con quelle del telefono («Modelli, sotto OpenAI»)
        rifiutoDelResume({ code: 'CHATGPT_NON_COLLEGATO', message: 'x' })
        await inviaDalCompositore(w, 'ciao')
        expect(w.get('[data-testid="talos-codice-r4-errore"]').text()).toBe('No ChatGPT account is connected: use “Continue with ChatGPT” in Providers')
        // un giro dal vivo sul PC: due chiamate al modello, poi un'altra; nel conto del piano del telefono non entra niente
        manda(['data: {"type":"CUSTOM","name":"talos.fine-rigiocata","value":{}}', 'data: {"type":"RunStarted","runId":"r1","input":{}}', uso(2, 3000), uso(3, 4000), ''].join(String.fromCharCode(10, 10)))
        await asciuga()
        await new Promise((x) => setTimeout(x, 20))
        expect(stato.registrati).toEqual([])
        w.unmount()
    })

    it('RRV-10 ⛔ RA-10: ← in remoto torna al dettaglio del computer, non all\'elenco delle sessioni del TELEFONO', async () => {
        azzera()
        const w = await schermata()
        w.getComponent(TalosCodiceR4Header).vm.$emit('indietro')
        await asciuga()
        expect(stato.spinte).toEqual([{ name: 'computer-item', params: { pcId: 'pc-uno' } }])
        w.unmount()
    })

    it('RRV-11a ⛔ RA-11: gli allegati (file, galleria, fotocamera) si vedono spenti col perché', async () => {
        azzera()
        const w = await schermata()
        const compositore = w.getComponent(TalosMobileComposer)
        expect(compositore.props('attachmentsAvailable')).toBe(false)
        expect(compositore.props('attachmentDisabledReason')).toBe(SOLO_DAL_PC)
        w.unmount()
    })

    it('RRV-11b ⛔ RA-11: ⌘ e «•••» spengono duplica, esporta e condividi col perché; le altre voci restano', async () => {
        azzera()
        const w = await schermata()
        w.getComponent(TalosCodiceR4Header).vm.$emit('comandi')
        await asciuga()
        for (const id of ['duplica', 'esporta', 'condividi']) {
            const voce = w.get(`[data-comando="${id}"]`)
            expect(voce.attributes('disabled'), id).toBeDefined()
            expect(voce.text(), id).toContain(SOLO_DAL_PC)
        }
        for (const id of ['rinomina', 'riprendi', 'compatta', 'albero', 'hook', 'doctor']) {
            expect(w.get(`[data-comando="${id}"]`).attributes('disabled'), id).toBeUndefined()
            expect(w.get(`[data-comando="${id}"]`).text(), id).not.toContain(SOLO_DAL_PC)
        }
        w.getComponent(TalosCodiceR4ComandiSheet).vm.$emit('close')
        await asciuga()
        await w.get('[data-testid="talos-codice-r4-altro"]').trigger('click')
        await asciuga()
        for (const id of ['esporta', 'condividi']) {
            const voce = w.get(`[data-testid="talos-codice-r4-${id}"]`)
            expect(voce.attributes('disabled'), id).toBeDefined()
            expect(voce.text(), id).toContain(SOLO_DAL_PC)
        }
        expect(w.get('[data-testid="talos-codice-r4-hook"]').attributes('disabled')).toBeUndefined()
        w.unmount()
    })

    it('RRV-D11 D-RM4-11 (Pad 21/10): in remoto «Nuova sessione» dice che la cartella si sceglie sul computer, non «nella stessa cartella»', async () => {
        azzera()
        const w = await schermata()
        w.getComponent(TalosCodiceR4Header).vm.$emit('comandi')
        await asciuga()
        const voce = w.get('[data-comando="nuova"]').text()
        expect(voce).toContain('Choose a folder on the computer')
        expect(voce).not.toContain('same folder')
        w.unmount()
    })

    it('RRV-11c ⛔ RA-11: un hook del PC si legge, «Fida» è spento col perché e non parte niente', async () => {
        azzera()
        stato.hook = [{ id: 'formatta', eventi: ['PostToolUse'], fidato: false }]
        const w = await schermata()
        w.getComponent(TalosCodiceR4Header).vm.$emit('hook')
        await asciuga()
        const fida = w.get('[data-hook="formatta"] button')
        expect(fida.attributes('disabled')).toBeDefined()
        expect(fida.text()).toBe(SOLO_DAL_PC)
        await fida.trigger('click')
        await asciuga()
        expect(stato.remote.filter((r) => r.percorso.endsWith('/trust'))).toEqual([])
        w.unmount()
    })

    it('RRV-11d ⛔ RA-11: nel pannello ▤ la scheda File non offre l\'albero della cartella del PC e lo dice; nessuna lettura /tree', async () => {
        azzera()
        const w = await schermata()
        w.getComponent(TalosCodiceR4Header).vm.$emit('pannello')
        await asciuga()
        await w.get('[data-scheda="file"]').trigger('click')
        await asciuga()
        expect(w.get('[data-testid="talos-codice-r4-file-solo-dal-pc"]').text()).toBe('The folder’s files are browsed on the computer.')
        expect(w.findComponent(TalosCodiceR4File).exists()).toBe(false)
        expect(stato.remote.filter((r) => r.percorso.includes('/tree'))).toEqual([])
        // e la scheda Processi riceve il perché (le sue azioni spente: RRV-11e)
        await w.get('[data-scheda="processi"]').trigger('click')
        await asciuga()
        expect(w.getComponent(TalosCodiceR4Processi).props('soloDalPc')).toBe(SOLO_DAL_PC)
        w.unmount()
    })

    it('RRV-11f ⛔ RA-11: anche nella colonna ▤ del Codice largo (tablet) la scheda File lo dice invece dell\'albero', async () => {
        azzera()
        const osservatori: { richiamo: () => void; elementi: Element[] }[] = []
        vi.stubGlobal('ResizeObserver', class {
            elementi: Element[] = []
            constructor(public richiamo: () => void) { osservatori.push(this) }
            observe(e: Element) { this.elementi.push(e) }
            unobserve() {}
            disconnect() { this.elementi = [] }
        })
        try {
            const w = await schermata()
            const riga = w.get('[data-testid="talos-codice-r4-riga"]').element as HTMLElement
            riga.getBoundingClientRect = () => ({ width: 1032, height: 800, top: 0, left: 0, right: 1032, bottom: 800, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
            for (const o of osservatori) if (o.elementi.includes(riga)) o.richiamo()
            await asciuga()
            w.getComponent(TalosCodiceR4Header).vm.$emit('pannello')
            await asciuga()
            const colonna = w.get('[data-testid="talos-codice-r4-colonna"]')
            await colonna.get('[data-scheda="file"]').trigger('click')
            await asciuga()
            expect(colonna.get('[data-testid="talos-codice-r4-file-solo-dal-pc"]').text()).toBe('The folder’s files are browsed on the computer.')
            expect(colonna.findComponent(TalosCodiceR4File).exists()).toBe(false)
            w.unmount()
        } finally {
            vi.unstubAllGlobals()
        }
    })

    it('RRV-11e ⛔ RA-11: i processi del PC si leggono; le loro azioni («…», «Ferma tutti») sono spente col perché', async () => {
        const processo = (id: string): ProcessoGrezzoR4 => ({
            id, comando: 'npm test', descrizione: '', stato: 'in-corso', chi: 'agente', giro: 1, avviatoA: Date.now(), ricevutoA: Date.now(),
            famiglia: 'test', durataMs: null, uscita: null, cwd: null,
        })
        const azione = vi.fn(async () => ({ ok: true as const }))
        const monta = (soloDalPc?: string) => mount(TalosCodiceR4Processi, {
            props: { processi: [processo('a'), processo('b')], azione, caricaRisorse: async () => null, ...(soloDalPc ? { soloDalPc } : {}) },
        })
        const remoto = monta(SOLO_DAL_PC)
        expect(remoto.get('[data-processo="a"] [data-azione="menu"]').attributes('disabled')).toBeDefined()
        expect(remoto.get('[data-testid="talos-codice-r4-processi-ferma-tutti"]').attributes('disabled')).toBeDefined()
        expect(remoto.get('[data-testid="talos-codice-r4-processi-solo-dal-pc"]').text()).toBe('Stopping or managing a command is done on the computer.')
        remoto.unmount()
        // in locale tutto come prima
        const locale = monta()
        expect(locale.get('[data-processo="a"] [data-azione="menu"]').attributes('disabled')).toBeUndefined()
        expect(locale.get('[data-testid="talos-codice-r4-processi-ferma-tutti"]').attributes('disabled')).toBeUndefined()
        expect(locale.find('[data-testid="talos-codice-r4-processi-solo-dal-pc"]').exists()).toBe(false)
        locale.unmount()
    })

    it('RRV-D8 ⛔ D-RM4-8: la chiave che manca è quella del COMPUTER, e si collega dal PC (non dalle impostazioni del telefono)', async () => {
        azzera()
        const w = await schermata()
        rifiutoDelResume({ code: 'CONFIG_INVALID', message: 'x', reason: 'provider-key-missing-named', params: { provider: 'DeepSeek' } })
        await inviaDalCompositore(w, 'ciao')
        expect(w.get('[data-testid="talos-codice-r4-errore"]').text()).toBe('The DeepSeek key is missing on the computer: connect it on the PC.')
        rifiutoDelResume({ code: 'CONFIG_INVALID', message: 'x', reason: 'provider-key-missing' })
        await inviaDalCompositore(w, 'ancora')
        expect(w.get('[data-testid="talos-codice-r4-errore"]').text()).toBe('The key is missing on the computer: connect it on the PC.')
        w.unmount()
    })
})
