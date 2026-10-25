// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { PluginComputer } from '@/lib/remoto/computerRemoti'

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
        // D-MOCK-8: il titolo dice QUALE PC, col codice breve (`pc-uno` → «pc-u»)
        expect(avvisi.map((a) => a.title)).toEqual(['computer.forgetOffline{"name":"Studio · pc-u"}'])
    })

    /*
     * Mockup remoto approvato dall'owner il 23/10, tavola 2: le Impostazioni del PC hanno notifiche, collegamento e «Dimentica».
     * Le prove delle sessioni (CIS-06, 10, 14) sono passate alla lista del Codice (`codiceDove.test.ts`, DOVE-05/06); quelle della
     * cartella di una sessione nuova (CIS-07, 08, 11, 12) al componente estratto (`nuovaSessioneSulPc.test.ts`, NSP-01..04).
     */
    it('CIS-15 tavola 2: lo stato sotto il nome e «Apri le sessioni nel Codice», che apre il Codice filtrato su questo PC', async () => {
        const v = await monta()
        expect(v.get('[data-testid="talos-computer-status"]').text()).toContain('computer.online')
        await v.get('[data-testid="talos-computer-open-codice"]').trigger('click')
        expect(push).toHaveBeenCalledWith({ name: 'harness', query: { dove: 'pc-uno' } })
    })

    it('CIS-16 tavola 2: nel Collegamento il codice del PC, le prime 4 cifre del suo id in minuscolo', async () => {
        const v = await monta()
        const riga = v.get('[data-testid="talos-computer-code-short"]')
        expect(riga.text()).toContain('computer.pcCode')
        expect(riga.text()).toContain('pc-u')
    })

    it('CIS-17 ⛔ verso contrario, tavola 2: la sezione «Sessioni su questo computer» non c\'è più, né «Nuova sessione»', async () => {
        const v = await monta()
        await flushPromises()
        expect(v.text()).not.toContain('computer.sessions')
        expect(v.find('[data-testid="talos-computer-session"]').exists()).toBe(false)
        expect(v.find('[data-testid="talos-computer-new-session"]').exists()).toBe(false)
        // nessuna lettura delle sessioni da qui: il dettaglio fa solo il ping
        const richieste = (plugin.invia as ReturnType<typeof vi.fn>).mock.calls.map((c) => JSON.parse(c[0].json)).filter((m) => m.t === 'req')
        expect(richieste.map((m) => m.op)).not.toContain('sessions.list')
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
