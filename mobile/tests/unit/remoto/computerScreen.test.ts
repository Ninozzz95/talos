// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { codiceDiAccoppiamento } from '@/lib/remoto/filoRemoto'
import type { PluginComputer } from '@/lib/remoto/computerRemoti'

/**
 * ⛔ CLIENT DEL CONTROLLO REMOTO, fetta R-M3: la sezione «Computer» (owner 20/10/2026, nome e testi del mockup v5 approvato il 17/10).
 * Montata col composabile vero (`useComputerRemoti`) sopra un plugin finto: nessun telefono nelle prove.
 */
// La prima prova compila la schermata (import dinamico): sotto carico supera i 5 s di serie (visto il 20/10). Tetto dichiarato,
// come `routeWiring.test.ts`.
vi.setConfig({ testTimeout: 30_000 })
const GETTONE = 'AAAAAAAAAAAAAAAAAAAAAA'
const QR = `talos-remote:1?pc=pc-uno&t=${GETTONE}&exp=4000000000`
const push = vi.fn()
let plugin: PluginComputer | null = null
let emetti: (evento: string, e: unknown) => void = () => {}
let computer: Array<{ pcId: string, nome: string | null, relay: string | null, accoppiatoAlle: number }> = []

vi.mock('vue-router', () => ({ useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }), useRoute: () => ({ params: {} }) }))
vi.mock('@/i18n', () => ({
    useTalosI18n: () => ({
        // come quello vero (`escapeParameter: true`): la «/» di una data diventa un'entità, che `{{ }}` stamperebbe tale e quale
        t: (key: string, p?: Record<string, unknown>) => (p ? `${key}${JSON.stringify(p).replace(/\//gu, '&#x2F;')}` : key),
        tTesto: (key: string, p?: Record<string, unknown>) => (p ? `${key}${JSON.stringify(p)}` : key),
        locale: { value: 'it' },
    }),
}))
vi.mock('@/lib/remoto/pluginRemoto', () => ({ pluginRemoto: () => plugin }))

function pluginFinto(): PluginComputer {
    const ascolti = new Map<string, Set<(e: never) => void>>()
    emetti = (evento, e) => { for (const cb of ascolti.get(evento) ?? []) (cb as (x: unknown) => void)(e) }
    return {
        accoppia: vi.fn(async () => ({ canale: 'c1', telefonoId: 'tel-uno' })),
        concludiAccoppiamento: vi.fn(async () => { computer = [{ pcId: 'pc-uno', nome: 'Studio', relay: null, accoppiatoAlle: 1 }] }),
        collega: vi.fn(async () => ({ canale: 'c2' })),
        invia: vi.fn(async () => {}),
        chiudi: vi.fn(async () => {}),
        percorso: vi.fn(async () => ({ tipo: 'diretto', rttMs: 11 })),
        elenco: vi.fn(async () => ({ computer })),
        dimentica: vi.fn(async () => ({ dimenticato: true })),
        nomeDelTelefono: vi.fn(async () => ({ nome: 'Pad' })),
        scansiona: vi.fn(async () => ({ testo: QR })),
        addListener: vi.fn(async (evento: string, cb: (e: never) => void) => {
            if (!ascolti.has(evento)) ascolti.set(evento, new Set())
            ascolti.get(evento)!.add(cb)
            return { remove: async () => { ascolti.get(evento)!.delete(cb) } }
        }) as PluginComputer['addListener'],
    }
}

/** Il PC risponde solo dopo il saluto del telefono: si aspetta `pair.hello` (il codice si calcola con `crypto.subtle`, asincrono). */
async function salutato() {
    await vi.waitFor(() => {
        const inviati = (plugin!.invia as ReturnType<typeof vi.fn>).mock.calls.map((c) => JSON.parse(c[0].json))
        if (!inviati.some((m) => m.t === 'pair.hello')) throw new Error('nessun pair.hello')
    })
}

async function monta() {
    const { default: ComputerScreen } = await import('@/screens/ComputerScreen.vue')
    const vista = mount(ComputerScreen)
    await flushPromises()
    return vista
}

beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()
    computer = []
    plugin = pluginFinto()
})

describe('la sezione «Computer»', () => {
    it('CSC-01 senza computer: titolo, riga del mockup, stato vuoto con «Collega un computer»', async () => {
        const v = await monta()
        expect(v.text()).toContain('computer.title')
        expect(v.text()).toContain('computer.subtitle')
        expect(v.get('[data-testid="talos-computer-empty"]').text()).toContain('computer.emptyTitle')
        // UN solo «Collega un computer»: quello dello stato vuoto (l'intestazione lo mostra solo quando c'è un elenco)
        expect(v.findAll('[data-testid="talos-computer-connect"]')).toHaveLength(1)
    })

    it('CSC-02 con computer: una riga per computer che apre il dettaglio', async () => {
        computer = [{ pcId: 'pc-uno', nome: 'Studio', relay: null, accoppiatoAlle: 1_760_000_000_000 }]
        const v = await monta()
        const riga = v.get('[data-testid="talos-computer-row"]')
        expect(riga.text()).toContain('Studio')
        // ⛔ dal Pad, 20/10/2026: «Collegato il 20&#x2F;10» — la data passava dal `t` che fa l'escape dei parametri
        expect(riga.text()).not.toContain('&#x')
        await riga.trigger('click')
        expect(push).toHaveBeenCalledWith({ name: 'computer-item', params: { pcId: 'pc-uno' } })
    })

    it('CSC-03 collega: scanner → «Conferma sul computer» col numero → collegato, e il computer nell\'elenco', async () => {
        const v = await monta()
        await v.get('[data-testid="talos-computer-connect"]').trigger('click')
        await salutato()
        const codice = await codiceDiAccoppiamento('pc-uno', 'tel-uno', GETTONE)
        emetti('remoto-messaggio', { canale: 'c1', json: JSON.stringify({ v: 1, t: 'pair.code', codice, pc: { id: 'pc-uno', nome: 'Studio' } }) })
        await flushPromises()
        const conferma = v.get('[data-testid="talos-computer-confirm"]')
        expect(conferma.text()).toContain('computer.confirmTitle')
        expect(v.get('[data-testid="talos-computer-code"]').text().replace(/\s/gu, '')).toBe(codice)
        emetti('remoto-messaggio', { canale: 'c1', json: JSON.stringify({ v: 1, t: 'pair.ok', pc: { nome: 'Studio' } }) })
        await flushPromises()
        expect(v.get('[data-testid="talos-computer-paired"]').text()).toContain('Studio')
        await v.get('[data-testid="talos-computer-paired-done"]').trigger('click')
        await flushPromises()
        expect(v.get('[data-testid="talos-computer-row"]').text()).toContain('Studio')
    })

    it('CSC-04 «Il numero è diverso: annulla» manda pair.cancel e torna indietro senza errori', async () => {
        const v = await monta()
        await v.get('[data-testid="talos-computer-connect"]').trigger('click')
        await salutato()
        const codice = await codiceDiAccoppiamento('pc-uno', 'tel-uno', GETTONE)
        emetti('remoto-messaggio', { canale: 'c1', json: JSON.stringify({ v: 1, t: 'pair.code', codice, pc: { id: 'pc-uno' } }) })
        await flushPromises()
        await v.get('[data-testid="talos-computer-code-different"]').trigger('click')
        await flushPromises()
        const inviati = (plugin!.invia as ReturnType<typeof vi.fn>).mock.calls.map((c) => JSON.parse(c[0].json))
        expect(inviati.at(-1)).toEqual({ v: 1, t: 'pair.cancel' })
        expect(v.find('[data-testid="talos-computer-confirm"]').exists()).toBe(false)
        expect(v.find('[data-testid="talos-computer-error"]').exists()).toBe(false)
    })

    it('CSC-05 un rifiuto del PC si dice con la sua frase, con «Riprova»', async () => {
        const v = await monta()
        await v.get('[data-testid="talos-computer-connect"]').trigger('click')
        await salutato()
        emetti('remoto-messaggio', { canale: 'c1', json: JSON.stringify({ v: 1, t: 'error', code: 'PAIR_REJECTED' }) })
        await flushPromises()
        expect(v.get('[data-testid="talos-computer-error"]').text()).toContain('computer.errors.rejected')
        expect(v.find('[data-testid="talos-computer-retry"]').exists()).toBe(true)
    })

    it('CSC-06 scanner chiuso dalla persona: nessun accoppiamento, nessun errore', async () => {
        plugin!.scansiona = vi.fn(async () => { throw Object.assign(new Error('x'), { code: 'CANCELLED' }) })
        const v = await monta()
        await v.get('[data-testid="talos-computer-connect"]').trigger('click')
        await flushPromises()
        expect(plugin!.accoppia).not.toHaveBeenCalled()
        expect(v.find('[data-testid="talos-computer-error"]').exists()).toBe(false)
    })

    it('CSC-08 un collegamento talos-remote: aperto sul telefono avvia l\'accoppiamento senza scanner', async () => {
        const { qrRemotoInAttesa } = await import('@/lib/remoto/linkRemoto')
        qrRemotoInAttesa.value = QR
        await monta()
        await salutato()
        expect(plugin!.scansiona).not.toHaveBeenCalled()
        expect(plugin!.accoppia).toHaveBeenCalledWith({ pcId: 'pc-uno', relay: null })
        expect(qrRemotoInAttesa.value).toBeNull()
    })

    /*
     * ⛔ D-RM4-2 (20/10/2026): con la sezione su un ERRORE un collegamento `talos-remote:` aperto dopo veniva ignorato in silenzio
     * (la persona apre il collegamento e non succede niente): la guardia era «fase diversa da inattivo», e l'errore e il «Collegato»
     * di prima contavano come un accoppiamento in corso. In corso sono solo `collego` e `conferma`: quelli non si interrompono, e il
     * collegamento arrivato nel frattempo parte quando finiscono, invece di restare in memoria fino alla prossima apertura della sezione.
     */
    const QR_NUOVO = 'talos-remote:1?pc=pc-uno&t=BBBBBBBBBBBBBBBBBBBBBB&exp=4000000000'

    it('CSC-LNK-01 sulla schermata d\'ERRORE un collegamento nuovo avvia l\'accoppiamento', async () => {
        const { qrRemotoInAttesa } = await import('@/lib/remoto/linkRemoto')
        const v = await monta()
        await v.get('[data-testid="talos-computer-connect"]').trigger('click')
        await salutato()
        emetti('remoto-messaggio', { canale: 'c1', json: JSON.stringify({ v: 1, t: 'error', code: 'PAIR_REJECTED' }) })
        await flushPromises()
        expect(v.find('[data-testid="talos-computer-error"]').exists()).toBe(true)
        qrRemotoInAttesa.value = QR_NUOVO
        await flushPromises()
        expect(plugin!.accoppia).toHaveBeenCalledTimes(2)
        expect(qrRemotoInAttesa.value).toBeNull()
        expect(v.find('[data-testid="talos-computer-error"]').exists()).toBe(false)
        expect(v.find('[data-testid="talos-computer-connecting"]').exists()).toBe(true)
    })

    it('CSC-LNK-02 sul «Collegato» di prima un collegamento nuovo avvia l\'accoppiamento', async () => {
        const { qrRemotoInAttesa } = await import('@/lib/remoto/linkRemoto')
        const v = await monta()
        await v.get('[data-testid="talos-computer-connect"]').trigger('click')
        await salutato()
        const codice = await codiceDiAccoppiamento('pc-uno', 'tel-uno', GETTONE)
        emetti('remoto-messaggio', { canale: 'c1', json: JSON.stringify({ v: 1, t: 'pair.code', codice, pc: { id: 'pc-uno', nome: 'Studio' } }) })
        await flushPromises()
        emetti('remoto-messaggio', { canale: 'c1', json: JSON.stringify({ v: 1, t: 'pair.ok', pc: { nome: 'Studio' } }) })
        await flushPromises()
        expect(v.find('[data-testid="talos-computer-paired"]').exists()).toBe(true)
        qrRemotoInAttesa.value = QR_NUOVO
        await flushPromises()
        expect(plugin!.accoppia).toHaveBeenCalledTimes(2)
        expect(qrRemotoInAttesa.value).toBeNull()
        expect(v.find('[data-testid="talos-computer-paired"]').exists()).toBe(false)
        expect(v.find('[data-testid="talos-computer-connecting"]').exists()).toBe(true)
    })

    it('CSC-LNK-03 durante la CONFERMA il collegamento nuovo aspetta; finita la conferma, parte', async () => {
        const { qrRemotoInAttesa } = await import('@/lib/remoto/linkRemoto')
        const v = await monta()
        await v.get('[data-testid="talos-computer-connect"]').trigger('click')
        await salutato()
        const codice = await codiceDiAccoppiamento('pc-uno', 'tel-uno', GETTONE)
        emetti('remoto-messaggio', { canale: 'c1', json: JSON.stringify({ v: 1, t: 'pair.code', codice, pc: { id: 'pc-uno' } }) })
        await flushPromises()
        qrRemotoInAttesa.value = QR_NUOVO
        await flushPromises()
        // il numero sullo schermo resta quello del giro in corso, e il collegamento non è stato consumato
        expect(plugin!.accoppia).toHaveBeenCalledTimes(1)
        expect(v.get('[data-testid="talos-computer-code"]').text().replace(/\s/gu, '')).toBe(codice)
        expect(qrRemotoInAttesa.value).toBe(QR_NUOVO)
        await v.get('[data-testid="talos-computer-code-different"]').trigger('click')
        await flushPromises()
        expect(plugin!.accoppia).toHaveBeenCalledTimes(2)
        expect(qrRemotoInAttesa.value).toBeNull()
        expect(v.find('[data-testid="talos-computer-connecting"]').exists()).toBe(true)
    })

    it('CSC-LNK-04 mentre COLLEGA il collegamento nuovo non interrompe il giro in corso', async () => {
        const { qrRemotoInAttesa } = await import('@/lib/remoto/linkRemoto')
        const v = await monta()
        await v.get('[data-testid="talos-computer-connect"]').trigger('click')
        await salutato()
        expect(v.find('[data-testid="talos-computer-connecting"]').exists()).toBe(true)
        qrRemotoInAttesa.value = QR_NUOVO
        await flushPromises()
        expect(plugin!.accoppia).toHaveBeenCalledTimes(1)
        expect(qrRemotoInAttesa.value).toBe(QR_NUOVO)
        expect(v.find('[data-testid="talos-computer-connecting"]').exists()).toBe(true)
    })

    it('CSC-07 fuori dall\'app Android (nessun plugin) la sezione lo dice e non offre azioni finte', async () => {
        plugin = null
        const v = await monta()
        expect(v.text()).toContain('computer.onlyInApp')
        expect(v.find('[data-testid="talos-computer-connect"]').exists()).toBe(false)
    })
})
