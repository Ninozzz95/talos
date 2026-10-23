// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { ATTESA_CONTROLLO_MS, type PluginComputer } from '@/lib/remoto/computerRemoti'

/**
 * ⛔ CLIENT DEL CONTROLLO REMOTO, fetta R-M3: il dettaglio di un computer collegato (mockup v5: Stato, Percorso, Collegato, «Dimentica
 * questo computer» con conferma). Lo stato è quello VERO di adesso (`controlla`: collega, ping, percorso), mai inventato.
 */
// La prima prova compila la schermata (import dinamico): sotto carico supera i 5 s di serie (visto il 20/10). Tetto dichiarato,
// come `routeWiring.test.ts`.
vi.setConfig({ testTimeout: 30_000 })
const push = vi.fn()
const replace = vi.fn()
let plugin: PluginComputer
let pong = true
let cartellePc: Array<{ id: string, nome: string }> = []
// ⛔ RA-12 (revisione avversariale R-M4, 21/10/2026): l'elenco delle sessioni che il PC rifiuta, le cartelle che non arrivano mai
let sessioniGuaste = false
let cartelleMute = false
let sessioniMute = false

vi.mock('vue-router', () => ({ useRouter: () => ({ push, replace, back: vi.fn() }), useRoute: () => ({ params: { pcId: 'pc-uno' } }) }))
vi.mock('@/i18n', () => ({
    useTalosI18n: () => ({
        // come quello vero (`escapeParameter: true`): la «/» di una data diventa un'entità, che `{{ }}` stamperebbe tale e quale
        t: (key: string, p?: Record<string, unknown>) => (p ? `${key}${JSON.stringify(p).replace(/\//gu, '&#x2F;')}` : key),
        tTesto: (key: string, p?: Record<string, unknown>) => (p ? `${key}${JSON.stringify(p)}` : key),
        locale: { value: 'it' },
    }),
}))
vi.mock('@/lib/remoto/pluginRemoto', () => ({ pluginRemoto: () => plugin }))
const avvisi: Array<{ title: string }> = []
vi.mock('@/stores/notificationCentre', () => ({ talosNotify: (e: { title: string }) => { avvisi.push(e) } }))

function pluginFinto(): PluginComputer {
    const ascolti = new Map<string, Set<(e: never) => void>>()
    const emetti = (evento: string, e: unknown) => { for (const cb of ascolti.get(evento) ?? []) (cb as (x: unknown) => void)(e) }
    return {
        accoppia: vi.fn(async () => ({ canale: 'c1', telefonoId: 't' })),
        concludiAccoppiamento: vi.fn(async () => {}),
        collega: vi.fn(async () => ({ canale: 'c2' })),
        invia: vi.fn(async ({ canale, json }) => {
            const m = JSON.parse(json)
            if (m.t === 'ping' && pong) queueMicrotask(() => emetti('remoto-messaggio', { canale, json: JSON.stringify({ v: 1, t: 'pong', s: m.s }) }))
            // le sessioni nella forma vera di r4 (`elencoSessioniR4.ts`); ogni altra richiesta (pc.forget) risponde come `index.mjs`
            // `progetto` è il NOME della cartella (visto sul 4178 il 20/10); `projects.list` come `custom-task.mjs:84`
            const data = m.op === 'sessions.list'
                ? { items: [{ sessionId: 's1', nome: 'Sito vetrina', avviataAlle: '2026-10-20T18:00:00.000Z', progetto: 'Altra' }] }
                : m.op === 'projects.list' ? { items: cartellePc } : { dimenticato: true }
            if (m.t === 'req' && m.op === 'sessions.list' && sessioniGuaste) {
                queueMicrotask(() => emetti('remoto-messaggio', { canale, json: JSON.stringify({ v: 1, t: 'res', n: m.n, ok: false, code: 'RATE_LIMITED', message: 'x' }) }))
                return
            }
            if (m.t === 'req' && m.op === 'projects.list' && cartelleMute) return
            if (m.t === 'req' && m.op === 'sessions.list' && sessioniMute) return
            if (m.t === 'req') queueMicrotask(() => emetti('remoto-messaggio', { canale, json: JSON.stringify({ v: 1, t: 'res', n: m.n, ok: true, data }) }))
        }),
        chiudi: vi.fn(async () => {}),
        percorso: vi.fn(async () => ({ tipo: 'diretto', rttMs: 11 })),
        elenco: vi.fn(async () => ({ computer: [{ pcId: 'pc-uno', nome: 'Studio', relay: null, accoppiatoAlle: 1_760_000_000_000 }] })),
        dimentica: vi.fn(async () => ({ dimenticato: true })),
        nomeDelTelefono: vi.fn(async () => ({ nome: 'Pad' })),
        scansiona: vi.fn(async () => ({ testo: '' })),
        addListener: vi.fn(async (evento: string, cb: (e: never) => void) => {
            if (!ascolti.has(evento)) ascolti.set(evento, new Set())
            ascolti.get(evento)!.add(cb)
            return { remove: async () => { ascolti.get(evento)!.delete(cb) } }
        }) as PluginComputer['addListener'],
    }
}

async function monta() {
    const { default: ComputerItemScreen } = await import('@/screens/ComputerItemScreen.vue')
    const vista = mount(ComputerItemScreen)
    await vi.waitFor(() => { if (vista.find('[data-testid="talos-computer-checking"]').exists()) throw new Error('ancora in controllo') })
    await flushPromises()
    return vista
}

beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    pong = true
    sessioniGuaste = false
    cartelleMute = false
    sessioniMute = false
    avvisi.length = 0
    cartellePc = [{ id: 'r4-remoto', nome: 'r4 remoto' }, { id: 'altra', nome: 'Altra' }]
    plugin = pluginFinto()
})

describe('il dettaglio di un computer', () => {
    it('CIS-01 nome, stato vero «in linea», percorso diretto coi ms, data del collegamento', async () => {
        const v = await monta()
        expect(v.text()).toContain('Studio')
        expect(v.get('[data-testid="talos-computer-status"]').text()).toContain('computer.online')
        expect(v.get('[data-testid="talos-computer-path"]').text()).toContain('computer.pathDirect{"ms":11}')
        // dal Pad, 20/10/2026: «Collegato — Collegato il 20/10» ripeteva la parola: nella riga solo la data
        const da = v.get('[data-testid="talos-computer-since"]').text()
        expect(da).toContain('computer.since')
        expect(da).not.toContain('computer.pairedOn')
        expect(da).toMatch(/\d{2}\/\d{2}/u)
    })

    it('CIS-02 un PC spento o lontano ⇒ «non in linea» con la sua frase, e «Riprova» rifà il controllo', async () => {
        plugin.collega = vi.fn(async () => { throw Object.assign(new Error('x'), { code: 'CONNECT_FAILED' }) })
        const v = await monta()
        expect(v.get('[data-testid="talos-computer-status"]').text()).toContain('computer.offline')
        expect(v.text()).toContain('computer.errors.unreachable')
        // il primo controllo ritenta già una volta per rete (RCM-08): «Riprova» ne fa uno nuovo, quindi altre chiamate
        const prima = (plugin.collega as ReturnType<typeof vi.fn>).mock.calls.length
        await v.get('[data-testid="talos-computer-recheck"]').trigger('click')
        await flushPromises()
        expect((plugin.collega as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(prima)
    })

    it('CIS-03 «Dimentica questo computer» chiede conferma; confermato: plugin, poi l\'elenco', async () => {
        const v = await monta()
        await v.get('[data-testid="talos-computer-forget"]').trigger('click')
        await flushPromises()
        expect(document.body.textContent).toContain('computer.forgetBody')
        expect(plugin.dimentica).not.toHaveBeenCalled()
        ;(document.querySelector('[data-testid="talos-computer-forget-confirm"]') as HTMLButtonElement).click()
        await flushPromises()
        expect(plugin.dimentica).toHaveBeenCalledWith({ pcId: 'pc-uno' })
        expect(replace).toHaveBeenCalledWith({ name: 'computer' })
    })

    it('CIS-05 il PC spento non riceve «Dimentica»: le chiavi si cancellano lo stesso, e un avviso dice di revocarlo dal PC', async () => {
        plugin.collega = vi.fn(async () => { throw Object.assign(new Error('x'), { code: 'CONNECT_FAILED' }) })
        const v = await monta()
        await v.get('[data-testid="talos-computer-forget"]').trigger('click')
        await flushPromises()
        ;(document.querySelector('[data-testid="talos-computer-forget-confirm"]') as HTMLButtonElement).click()
        await vi.waitFor(() => { if (!replace.mock.calls.length) throw new Error('ancora qui') })
        expect(plugin.dimentica).toHaveBeenCalledWith({ pcId: 'pc-uno' })
        expect(avvisi.map((a) => a.title)).toEqual(['computer.forgetOffline'])
    })

    it('CIS-06 in linea: le sessioni del PC, e una sessione si apre nella schermata del Codice sul canale remoto', async () => {
        const v = await monta()
        await vi.waitFor(() => { if (!v.find('[data-testid="talos-computer-session"]').exists()) throw new Error('ancora niente') })
        const riga = v.get('[data-testid="talos-computer-session"]')
        expect(riga.text()).toContain('Sito vetrina')
        await riga.trigger('click')
        expect(push).toHaveBeenCalledWith({ name: 'computer-codice', params: { pcId: 'pc-uno', id: 's1' } })
    })

    it('CIS-07 Q2 (owner 20/10 «fra le cartelle ammesse»): «Nuova sessione» mostra le cartelle del PC, preselezionata quella dell\'ultima sessione; «Apri» va al Codice con la cartella', async () => {
        const v = await monta()
        await vi.waitFor(() => { if (!v.find('[data-testid="talos-computer-new-session"]').exists()) throw new Error('ancora niente') })
        await v.get('[data-testid="talos-computer-new-session"]').trigger('click')
        await vi.waitFor(() => { if (!v.find('[data-testid="talos-computer-folder"]').exists()) throw new Error('ancora niente') })
        const righe = v.findAll('[data-testid="talos-computer-folder"]')
        expect(righe.map((x) => [x.text(), x.attributes('aria-checked')])).toEqual([['r4 remoto', 'false'], ['Altra', 'true']])
        expect(righe.every((x) => x.attributes('role') === 'radio')).toBe(true)
        // aperto l'elenco, «Nuova sessione» non si ripete: si apre o si annulla
        expect(v.find('[data-testid="talos-computer-new-session"]').exists()).toBe(false)
        await righe[0].trigger('click')
        expect(v.findAll('[data-testid="talos-computer-folder"]').map((x) => x.attributes('aria-checked'))).toEqual(['true', 'false'])
        await v.get('[data-testid="talos-computer-open-session"]').trigger('click')
        expect(push).toHaveBeenCalledWith({ name: 'computer-codice', params: { pcId: 'pc-uno' }, query: { cartella: 'r4-remoto' } })
    })

    it('CIS-08 Q2: nessuna cartella aperta al telefono ⇒ lo dice e non c\'è niente da aprire; senza una scelta «Apri» è spento', async () => {
        cartellePc = []
        const v = await monta()
        await vi.waitFor(() => { if (!v.find('[data-testid="talos-computer-new-session"]').exists()) throw new Error('ancora niente') })
        await v.get('[data-testid="talos-computer-new-session"]').trigger('click')
        await vi.waitFor(() => { if (!v.text().includes('computer.noFolders')) throw new Error('ancora niente') })
        expect(v.find('[data-testid="talos-computer-open-session"]').exists()).toBe(false)

        cartellePc = [{ id: 'r4-remoto', nome: 'r4 remoto' }] // nessuna col nome dell'ultima sessione: niente preselezione
        const w = await monta()
        await vi.waitFor(() => { if (!w.find('[data-testid="talos-computer-new-session"]').exists()) throw new Error('ancora niente') })
        await w.get('[data-testid="talos-computer-new-session"]').trigger('click')
        await vi.waitFor(() => { if (!w.find('[data-testid="talos-computer-folder"]').exists()) throw new Error('ancora niente') })
        expect(w.get('[data-testid="talos-computer-folder"]').attributes('aria-checked')).toBe('false')
        expect(w.get('[data-testid="talos-computer-open-session"]').attributes('disabled')).toBeDefined()
    })

    it('CIS-09 Q2: un PC non in linea non offre una sessione nuova', async () => {
        plugin.collega = vi.fn(async () => { throw Object.assign(new Error('x'), { code: 'CONNECT_FAILED' }) })
        const v = await monta()
        expect(v.find('[data-testid="talos-computer-new-session"]').exists()).toBe(false)
    })

    it('CIS-10 ⛔ RA-12: l\'elenco delle sessioni che non si legge non diventa «nessuna sessione»: lo dice, e «Riprova» lo rilegge', async () => {
        sessioniGuaste = true
        const v = await monta()
        await vi.waitFor(() => { if (!v.find('[data-testid="talos-computer-sessions-error"]').exists()) throw new Error('ancora niente') })
        expect(v.text()).not.toContain('computer.sessionsEmpty')
        expect(v.get('[data-testid="talos-computer-sessions-error"]').text()).toContain('computer.errors.')
        // senza un elenco vero non si apre una sessione nuova (la cartella preselezionata viene dall'elenco)
        expect(v.find('[data-testid="talos-computer-new-session"]').exists()).toBe(false)
        sessioniGuaste = false
        await v.get('[data-testid="talos-computer-sessions-retry"]').trigger('click')
        await vi.waitFor(() => { if (!v.find('[data-testid="talos-computer-session"]').exists()) throw new Error('ancora niente') })
        expect(v.find('[data-testid="talos-computer-sessions-error"]').exists()).toBe(false)
        expect(v.get('[data-testid="talos-computer-session"]').text()).toContain('Sito vetrina')
    })

    it('CIS-11 ⛔ RA-12: le cartelle che il PC non manda mai non lasciano «Nuova sessione» spento per sempre: dopo il tetto lo dice', async () => {
        cartelleMute = true
        const v = await monta()
        await vi.waitFor(() => { if (!v.find('[data-testid="talos-computer-new-session"]').exists()) throw new Error('ancora niente') })
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
        try {
            await v.get('[data-testid="talos-computer-new-session"]').trigger('click')
            await flushPromises()
            expect(v.get('[data-testid="talos-computer-new-session"]').attributes('disabled')).toBeDefined()
            await vi.advanceTimersByTimeAsync(ATTESA_CONTROLLO_MS)
            await flushPromises()
        } finally {
            vi.useRealTimers()
        }
        expect(v.text()).toContain('computer.errors.timeout')
        expect(v.get('[data-testid="talos-computer-new-session"]').attributes('disabled')).toBeUndefined()
    })

    it('CIS-14 ⛔ RA-12: un elenco delle sessioni che il PC non manda mai, dopo il tetto lo dice con «Riprova»', async () => {
        sessioniMute = true
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
        let v: Awaited<ReturnType<typeof mount>>
        try {
            const { default: ComputerItemScreen } = await import('@/screens/ComputerItemScreen.vue')
            v = mount(ComputerItemScreen)
            for (let i = 0; i < 10; i++) await flushPromises()
            expect(v.get('[data-testid="talos-computer-status"]').text()).toContain('computer.online')
            expect(v.find('[data-testid="talos-computer-sessions-error"]').exists()).toBe(false)
            await vi.advanceTimersByTimeAsync(ATTESA_CONTROLLO_MS)
            await flushPromises()
        } finally {
            vi.useRealTimers()
        }
        expect(v.get('[data-testid="talos-computer-sessions-error"]').text()).toBe('computer.errors.timeout')
        sessioniMute = false
        await v.get('[data-testid="talos-computer-sessions-retry"]').trigger('click')
        await vi.waitFor(() => { if (!v.find('[data-testid="talos-computer-session"]').exists()) throw new Error('ancora niente') })
    })

    it('CIS-12 ⛔ RA-13: senza cartelle aperte al telefono c\'è «Annulla», che riporta «Nuova sessione»', async () => {
        cartellePc = []
        const v = await monta()
        await vi.waitFor(() => { if (!v.find('[data-testid="talos-computer-new-session"]').exists()) throw new Error('ancora niente') })
        await v.get('[data-testid="talos-computer-new-session"]').trigger('click')
        await vi.waitFor(() => { if (!v.text().includes('computer.noFolders')) throw new Error('ancora niente') })
        expect(v.find('[data-testid="talos-computer-new-session"]').exists()).toBe(false)
        await v.get('[data-testid="talos-computer-folders-cancel"]').trigger('click')
        expect(v.text()).not.toContain('computer.noFolders')
        expect(v.find('[data-testid="talos-computer-new-session"]').exists()).toBe(true)
    })

    it('CIS-13 ⛔ D-RM4-9: «Dimentica questo computer» ha la coppia di pericolo del tema, non il contorno grigio della variante outline', async () => {
        const v = await monta()
        const classi = v.get('[data-testid="talos-computer-forget"]').classes()
        expect(classi).toEqual(expect.arrayContaining(['border', 'border-[var(--talos-danger-border)]', 'bg-[var(--talos-danger-soft)]', 'text-[var(--talos-danger)]']))
        // la variante outline porta `dark:bg-input/30 dark:border-input`, che nel tema scuro vincono: il pulsante tornava grigio
        expect(classi.filter((c) => c.startsWith('dark:bg-') || c.startsWith('dark:border-'))).toEqual([])
    })

    it('CIS-04 un computer che il telefono non ricorda più ⇒ lo dice e riporta all\'elenco', async () => {
        plugin.elenco = vi.fn(async () => ({ computer: [] }))
        const v = await monta()
        expect(v.text()).toContain('computer.notFound')
        expect(plugin.collega).not.toHaveBeenCalled()
    })
})
