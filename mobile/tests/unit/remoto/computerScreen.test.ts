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
// UI-111 (owner 29/10): sul tablet il «+» di Computer porta la parola, come «+ Aggiungi file» della Libreria
const tablet = vi.hoisted(() => ({ valore: false }))
vi.mock('@/composables/useTalosTabletLayout', async () => {
    const { ref } = await import('vue')
    const isTablet = ref(false)
    return { useTalosTabletLayout: () => { isTablet.value = tablet.valore; return { isTablet } } }
})

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
    localStorage.clear()
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

    it('CSC-02 con computer: un riquadro per computer, il nome apre il dettaglio (mockup remoto 23/10, tavola 1)', async () => {
        computer = [{ pcId: 'pc-uno', nome: 'Studio', relay: null, accoppiatoAlle: 1_760_000_000_000 }]
        const v = await monta()
        const riquadro = v.get('[data-testid="talos-computer-card"]')
        expect(riquadro.text()).toContain('Studio')
        // ⛔ dal Pad, 20/10/2026: «Collegato il 20&#x2F;10» — la data passava dal `t` che fa l'escape dei parametri
        expect(riquadro.text()).not.toContain('&#x')
        await riquadro.get('[data-testid="talos-computer-card-name"]').trigger('click')
        expect(push).toHaveBeenCalledWith({ name: 'computer-item', params: { pcId: 'pc-uno' } })
    })

    /*
     * ⛔ UI-111 «Liste coerenti» (mockup v2.1 approvato dall'owner il 29/10 sera, voce 5): accanto al titolo la scritta «Collega»
     * diventa il «+» quadrato delle altre sezioni (`ContextScreen.vue:1146-1156`), col suo nome per chi ascolta. Stesse condizioni.
     */
    it('COMPUTER-LISTE-01 con un elenco, accanto al titolo il «+» quadrato col nome «Collega un computer»; tocca e collega', async () => {
        computer = [{ pcId: 'pc-uno', nome: 'Studio', relay: null, accoppiatoAlle: 1_760_000_000_000 }]
        const v = await monta()
        const piu = v.get('header [data-testid="talos-computer-connect"]')
        expect(piu.attributes('aria-label')).toBe('computer.connect')
        expect(piu.text()).toBe('')
        expect(piu.find('svg.lucide-plus').exists()).toBe(true)
        expect(piu.classes()).toEqual(expect.arrayContaining(['size-12', 'p-0', 'rounded-[var(--talos-radius-control)]', 'bg-[var(--talos-accent)]', 'text-[var(--talos-accent-text)]']))
        await piu.trigger('click')
        expect(plugin!.scansiona).toHaveBeenCalled()
    })

    it('COMPUTER-LISTE-02 sul tablet il pulsante accanto al titolo porta la parola: «+ Collega un computer», come la Libreria', async () => {
        computer = [{ pcId: 'pc-uno', nome: 'Studio', relay: null, accoppiatoAlle: 1_760_000_000_000 }]
        tablet.valore = true
        try {
            const v = await monta()
            const piu = v.get('header [data-testid="talos-computer-connect"]')
            expect(piu.text()).toBe('computer.connect')
            expect(piu.find('svg.lucide-plus').exists()).toBe(true)
            expect(piu.classes()).toEqual(expect.arrayContaining(['min-h-12', 'gap-2', 'px-5', 'text-sm', 'font-medium']))
            expect(piu.classes()).not.toContain('size-12')
            await piu.trigger('click')
            expect(plugin!.scansiona).toHaveBeenCalled()
        } finally {
            tablet.valore = false
        }
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
        expect(v.get('[data-testid="talos-computer-card"]').text()).toContain('Studio')
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

    /*
     * Revisione del blocco 9, B-R1 (Desktop, 27/10/2026): il PC ora manda `PAIR_EXPIRED` sul filo per un QR scaduto (prima sempre
     * `PAIR_TOKEN_INVALID`). La frase «scaduto» compare davvero; quella del gettone che non vale resta la sua.
     */
    it('CSC-05b il PC dice PAIR_EXPIRED ⇒ la frase del QR scaduto, non quella del gettone', async () => {
        const v = await monta()
        await v.get('[data-testid="talos-computer-connect"]').trigger('click')
        await salutato()
        emetti('remoto-messaggio', { canale: 'c1', json: JSON.stringify({ v: 1, t: 'error', code: 'PAIR_EXPIRED' }) })
        await flushPromises()
        const errore = v.get('[data-testid="talos-computer-error"]').text()
        expect(errore).toContain('computer.errors.expired')
        expect(errore).not.toContain('computer.errors.tokenInvalid')
        // revisione del Desktop 27/10: niente «Riprova» su un link morto; l'azione principale apre lo scanner per un QR nuovo
        const azione = v.get('[data-testid="talos-computer-retry"]')
        expect(azione.text()).toBe('computer.scanNewQr')
        await azione.trigger('click')
        await flushPromises()
        expect(plugin!.scansiona).toHaveBeenCalledTimes(2)
    })

    it('CSC-05c ⛔ verso contrario: PAIR_TOKEN_INVALID tiene la sua frase, non quella del QR scaduto', async () => {
        const v = await monta()
        await v.get('[data-testid="talos-computer-connect"]').trigger('click')
        await salutato()
        emetti('remoto-messaggio', { canale: 'c1', json: JSON.stringify({ v: 1, t: 'error', code: 'PAIR_TOKEN_INVALID' }) })
        await flushPromises()
        const errore = v.get('[data-testid="talos-computer-error"]').text()
        expect(errore).toContain('computer.errors.tokenInvalid')
        expect(errore).not.toContain('computer.errors.expired')
        // ⛔ verso contrario: qui l'azione resta «Riprova»
        expect(v.get('[data-testid="talos-computer-retry"]').text()).toBe('computer.retry')
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

    /*
     * Fetta C del mockup remoto, D-REM-2 (owner via Desktop (3), 24/10/2026: «Proponi di dimenticare»): appena accoppiato un PC, le voci
     * vecchie (stesso nome, stesso ponte, spente) si propongono UNA volta, con Sì e No. Niente sparisce senza il sì.
     */
    async function accoppiaStudio(vecchie: Array<{ pcId: string, nome: string | null, relay: string | null }>, pcOk: Record<string, unknown> = {}) {
        plugin!.concludiAccoppiamento = vi.fn(async () => {
            computer = [{ pcId: 'pc-uno', nome: 'Studio', relay: null, accoppiatoAlle: 2 }, ...vecchie.map((v) => ({ ...v, accoppiatoAlle: 1 }))]
        })
        // le voci vecchie non rispondono più; il PC nuovo sì
        plugin!.collega = vi.fn(async ({ pcId }: { pcId: string }) => {
            if (pcId !== 'pc-uno') throw Object.assign(new Error('x'), { code: 'UNREACHABLE' })
            return { canale: 'c2' }
        }) as PluginComputer['collega']
        const v = await monta()
        await v.get('[data-testid="talos-computer-connect"]').trigger('click')
        await salutato()
        const codice = await codiceDiAccoppiamento('pc-uno', 'tel-uno', GETTONE)
        emetti('remoto-messaggio', { canale: 'c1', json: JSON.stringify({ v: 1, t: 'pair.code', codice, pc: { id: 'pc-uno', nome: 'Studio' } }) })
        await flushPromises()
        emetti('remoto-messaggio', { canale: 'c1', json: JSON.stringify({ v: 1, t: 'pair.ok', pc: { nome: 'Studio', ...pcOk } }) })
        await flushPromises()
        return v
    }

    it('DOPPI-UI-01 appena accoppiato un PC propone di dimenticare le voci vecchie; «Sì» le dimentica tutte', async () => {
        const v = await accoppiaStudio([{ pcId: 'pc-due', nome: 'Studio', relay: null }, { pcId: 'pc-tre', nome: 'Studio', relay: null }])
        await vi.waitFor(() => { if (!v.find('[data-testid="talos-computer-old-entries"]').exists()) throw new Error('ancora niente') })
        expect(v.get('[data-testid="talos-computer-old-entries"]').text()).toContain('computer.oldEntriesTitle{"count":2,"name":"Studio"}')
        expect(plugin!.dimentica).not.toHaveBeenCalled()
        await v.get('[data-testid="talos-computer-old-entries-yes"]').trigger('click')
        await vi.waitFor(() => { if ((plugin!.dimentica as ReturnType<typeof vi.fn>).mock.calls.length < 2) throw new Error('non ancora') })
        expect((plugin!.dimentica as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0].pcId).sort()).toEqual(['pc-due', 'pc-tre'])
        await flushPromises()
        expect(v.find('[data-testid="talos-computer-old-entries"]').exists()).toBe(false)
    }, 40_000)

    it('DOPPI-UI-02 «No» non dimentica niente e la domanda non torna', async () => {
        const v = await accoppiaStudio([{ pcId: 'pc-due', nome: 'Studio', relay: null }])
        await vi.waitFor(() => { if (!v.find('[data-testid="talos-computer-old-entries"]').exists()) throw new Error('ancora niente') })
        await v.get('[data-testid="talos-computer-old-entries-no"]').trigger('click')
        await flushPromises()
        expect(plugin!.dimentica).not.toHaveBeenCalled()
        expect(v.find('[data-testid="talos-computer-old-entries"]').exists()).toBe(false)
        const { domandaDoppiGiaFatta } = await import('@/lib/remoto/ricordiDelPc')
        expect(domandaDoppiGiaFatta('pc-uno')).toBe(true)
    }, 40_000)

    it('DOPPI-UI-03 ⛔ verso contrario: senza voci vecchie (nome diverso) nessuna domanda', async () => {
        const v = await accoppiaStudio([{ pcId: 'pc-due', nome: 'Portatile', relay: null }])
        await vi.waitFor(() => { if (v.find('[data-computer-stato="leggo"]').exists()) throw new Error('ancora in lettura') }, { timeout: 15_000 })
        await flushPromises()
        expect(v.find('[data-testid="talos-computer-old-entries"]').exists()).toBe(false)
    }, 40_000)

    /* D-MOCK-6 (24/10/2026): l'owner ha detto sì a «4 voci» senza vederle; la proposta elenca ciascuna col suo codice breve. */
    it('DOPPI-UI-06 la proposta elenca le voci vecchie col loro codice breve', async () => {
        const v = await accoppiaStudio([{ pcId: '31ab0001', nome: 'Studio', relay: null }, { pcId: '2d3c0001', nome: 'Studio', relay: null }])
        await vi.waitFor(() => { if (!v.find('[data-testid="talos-computer-old-entries"]').exists()) throw new Error('ancora niente') })
        const voci = v.findAll('[data-testid="talos-computer-old-entry"]')
        expect(voci.map((voce) => voce.attributes('data-pc-id'))).toEqual(['31ab0001', '2d3c0001'])
        expect(voci.map((voce) => voce.text())).toEqual([expect.stringContaining('31ab'), expect.stringContaining('2d3c')])
    }, 40_000)

    /* Owner 24/10/2026 «Sì, adesso»: le voci di un PC col portachiavi di prova (desktop f1199ace0) sono segnate e vengono per prime. */
    it('DOPPI-UI-07 una voce «di prova» è segnata ed è la prima della proposta', async () => {
        const { ricordaEffimero } = await import('@/lib/remoto/ricordiDelPc')
        ricordaEffimero('2d3c0001', true)
        const v = await accoppiaStudio([{ pcId: '31ab0001', nome: 'Studio', relay: null }, { pcId: '2d3c0001', nome: 'Studio', relay: null }])
        await vi.waitFor(() => { if (!v.find('[data-testid="talos-computer-old-entries"]').exists()) throw new Error('ancora niente') })
        const voci = v.findAll('[data-testid="talos-computer-old-entry"]')
        expect(voci.map((voce) => voce.attributes('data-pc-id'))).toEqual(['2d3c0001', '31ab0001'])
        expect(voci[0]!.find('[data-testid="talos-computer-test-tag"]').exists()).toBe(true)
        expect(voci[1]!.find('[data-testid="talos-computer-test-tag"]').exists()).toBe(false)
    }, 40_000)

    /* ⛔ D-MOCK-13, owner 24/10/2026 «No, solo un PC vero propone»: il PC «di prova» appena accoppiato non propone le voci spente. */
    it('DOPPI-UI-12 ⛔ un PC «di prova» appena accoppiato non propone di dimenticare le voci spente col suo nome', async () => {
        const v = await accoppiaStudio([{ pcId: '287c0001', nome: 'Studio', relay: null }], { effimero: true })
        await vi.waitFor(() => { if (v.find('[data-computer-stato="leggo"]').exists()) throw new Error('ancora in lettura') }, { timeout: 15_000 })
        await flushPromises()
        expect(v.find('[data-testid="talos-computer-old-entries"]').exists()).toBe(false)
        expect(plugin!.dimentica).not.toHaveBeenCalled()
    }, 40_000)

    it('DOPPI-UI-13 ⛔ un PC «di prova» IN LINEA non propone; un PC vero sì, con la voce di prova spenta per prima', async () => {
        const { ricordaEffimero } = await import('@/lib/remoto/ricordiDelPc')
        ricordaEffimero('27ba0001', true)
        const spenti = vi.fn(async () => { throw Object.assign(new Error('x'), { code: 'UNREACHABLE' }) }) as unknown as PluginComputer['collega']
        // il PC di prova risponde, la voce vera col suo nome è spenta: nessuna proposta
        computer = [{ pcId: '27ba0001', nome: 'Studio', relay: null, accoppiatoAlle: 2 }, { pcId: '287c0001', nome: 'Studio', relay: null, accoppiatoAlle: 1 }]
        plugin!.collega = spenti
        tornaInLinea('27ba0001')
        let v = await monta()
        await vi.waitFor(() => { if (v.find('[data-computer-stato="leggo"]').exists()) throw new Error('ancora in lettura') }, { timeout: 15_000 })
        await flushPromises()
        expect(v.get('[data-testid="talos-computer-card"][data-pc-id="27ba0001"]').attributes('data-computer-stato')).toBe('inLinea')
        expect(v.find('[data-testid="talos-computer-old-entries"]').exists()).toBe(false)
        v.unmount()
        // ⛔ verso contrario: un PC vero in linea propone, e la voce di prova (spenta) viene per prima
        vi.resetModules()
        computer = [
            { pcId: 'b8510001', nome: 'Studio', relay: null, accoppiatoAlle: 3 },
            { pcId: '287c0001', nome: 'Studio', relay: null, accoppiatoAlle: 1 },
            { pcId: '27ba0001', nome: 'Studio', relay: null, accoppiatoAlle: 2 },
        ]
        plugin!.collega = spenti
        tornaInLinea('b8510001')
        v = await monta()
        await vi.waitFor(() => { if (!v.find('[data-testid="talos-computer-old-entries"]').exists()) throw new Error('ancora niente') }, { timeout: 15_000 })
        expect(v.findAll('[data-testid="talos-computer-old-entry"]').map((e) => e.attributes('data-pc-id'))).toEqual(['27ba0001', '287c0001'])
    }, 40_000)

    /*
     * ⛔ Dal Pad, vc307 (27/10/2026): due PC veri in linea col nome e il ponte uguali (b851 e 0632, tutti DESKTOP-BJ9I7OU su n0) e una
     * voce spenta (287c, l'identità vecchia di 0632). Nome e ponte non li distinguono: la guardia è «spenta adesso». Il Desktop: un PC
     * vivo col nome e il ponte uguali non si propone MAI.
     */
    it('DOPPI-UI-16 ⛔ un altro PC vero IN LINEA col nome e il ponte uguali non è mai fra le voci vecchie; quella spenta sì', async () => {
        computer = [
            { pcId: 'b8510001', nome: 'Studio', relay: null, accoppiatoAlle: 3 },
            { pcId: '06320001', nome: 'Studio', relay: null, accoppiatoAlle: 2 },
            { pcId: '287c0001', nome: 'Studio', relay: null, accoppiatoAlle: 1 },
        ]
        plugin!.collega = vi.fn(async () => { throw Object.assign(new Error('x'), { code: 'UNREACHABLE' }) }) as unknown as PluginComputer['collega']
        tornaInLinea('b8510001', '06320001')
        const v = await monta()
        await vi.waitFor(() => { if (!v.find('[data-testid="talos-computer-old-entries"]').exists()) throw new Error('ancora niente') }, { timeout: 15_000 })
        expect(v.get('[data-testid="talos-computer-card"][data-pc-id="06320001"]').attributes('data-computer-stato')).toBe('inLinea')
        expect(v.findAll('[data-testid="talos-computer-old-entry"]').map((e) => e.attributes('data-pc-id'))).toEqual(['287c0001'])
    }, 40_000)

    it('DOPPI-UI-08 ⛔ verso contrario: desktop accoppiato accanto alla CLI spenta dello stesso PC, nessuna proposta', async () => {
        const { ricordaProgramma } = await import('@/lib/remoto/ricordiDelPc')
        ricordaProgramma('pc-due', 'TALOS CLI')
        const v = await accoppiaStudio([{ pcId: 'pc-due', nome: 'Studio', relay: null }], { programma: 'TALOS desktop' })
        await vi.waitFor(() => { if (v.find('[data-computer-stato="leggo"]').exists()) throw new Error('ancora in lettura') }, { timeout: 15_000 })
        await flushPromises()
        expect(v.find('[data-testid="talos-computer-old-entries"]').exists()).toBe(false)
    }, 40_000)

    /*
     * ⛔ Revisione del blocco 4, M-1 (S3): la proposta legge chi è in linea UNA volta; il «Sì» dimenticava le voci così com'erano allora.
     * Una voce tornata a rispondere fra la proposta e il sì (il ledger: b851 «tornato in linea alle 13:38») si dimenticava lo stesso.
     * Al «Sì» ogni candidata si rilegge (`riepilogo`, col suo tetto): chi risponde resta, e la schermata lo dice.
     */
    /** Le voci `pcIds` tornano a rispondere: il `collega` finto ora riesce e il PC risponde al ping e all'elenco delle sessioni. */
    function tornaInLinea(...pcIds: string[]) {
        const collega = plugin!.collega
        plugin!.collega = vi.fn(async (a: { pcId: string }) => (pcIds.includes(a.pcId) ? { canale: `c-${a.pcId}` } : collega(a))) as PluginComputer['collega']
        plugin!.invia = vi.fn(async ({ canale, json }: { canale: string, json: string }) => {
            if (!pcIds.some((pcId) => canale === `c-${pcId}`)) return
            const m = JSON.parse(json)
            if (m.t === 'ping') queueMicrotask(() => emetti('remoto-messaggio', { canale, json: JSON.stringify({ v: 1, t: 'pong', s: m.s }) }))
            if (m.t !== 'req') return
            queueMicrotask(() => emetti('remoto-messaggio', { canale, json: JSON.stringify({ v: 1, t: 'res', n: m.n, ok: true, data: { items: [] } }) }))
        }) as PluginComputer['invia']
    }

    it('DOPPI-UI-09 ⛔ una voce tornata in linea fra la proposta e il «Sì» non si dimentica, e la schermata lo dice', async () => {
        const v = await accoppiaStudio([{ pcId: 'pc-due', nome: 'Studio', relay: null }, { pcId: 'pc-tre', nome: 'Studio', relay: null }])
        await vi.waitFor(() => { if (!v.find('[data-testid="talos-computer-old-entries"]').exists()) throw new Error('ancora niente') })
        expect(v.findAll('[data-testid="talos-computer-old-entry"]')).toHaveLength(2)
        tornaInLinea('pc-due')
        await v.get('[data-testid="talos-computer-old-entries-yes"]').trigger('click')
        // durante il ricontrollo il «Sì» non si preme due volte
        expect(v.get('[data-testid="talos-computer-old-entries-yes"]').attributes('disabled')).toBeDefined()
        await vi.waitFor(() => { if (v.find('[data-testid="talos-computer-old-entries"]').exists()) throw new Error('proposta ancora aperta') }, { timeout: 15_000 })
        await flushPromises()
        expect((plugin!.dimentica as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0].pcId)).toEqual(['pc-tre'])
        expect(v.get('[data-testid="talos-computer-old-entries-answered"]').text())
            .toBe('computer.oldEntriesAnswered{"count":1,"names":"Studio · pc-d"}')
        expect(v.get('[data-testid="talos-computer-card"][data-pc-id="pc-due"]').attributes('data-computer-stato')).toBe('inLinea')
    }, 40_000)

    it('DOPPI-UI-10 ⛔ verso contrario: se al «Sì» nessuna risponde, si dimenticano tutte e nessuna frase in più', async () => {
        const v = await accoppiaStudio([{ pcId: 'pc-due', nome: 'Studio', relay: null }, { pcId: 'pc-tre', nome: 'Studio', relay: null }])
        await vi.waitFor(() => { if (!v.find('[data-testid="talos-computer-old-entries"]').exists()) throw new Error('ancora niente') })
        await v.get('[data-testid="talos-computer-old-entries-yes"]').trigger('click')
        await vi.waitFor(() => { if (v.find('[data-testid="talos-computer-old-entries"]').exists()) throw new Error('proposta ancora aperta') }, { timeout: 15_000 })
        await flushPromises()
        expect((plugin!.dimentica as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0].pcId).sort()).toEqual(['pc-due', 'pc-tre'])
        expect(v.find('[data-testid="talos-computer-old-entries-answered"]').exists()).toBe(false)
    }, 40_000)

    it('DOPPI-UI-11 se al «Sì» rispondono TUTTE: nessuna dimenticata, la frase al plurale, e la domanda si segna fatta come col «No»', async () => {
        const v = await accoppiaStudio([{ pcId: 'pc-due', nome: 'Studio', relay: null }, { pcId: 'pc-tre', nome: 'Studio', relay: null }])
        await vi.waitFor(() => { if (!v.find('[data-testid="talos-computer-old-entries"]').exists()) throw new Error('ancora niente') })
        tornaInLinea('pc-due', 'pc-tre')
        await v.get('[data-testid="talos-computer-old-entries-yes"]').trigger('click')
        // la proposta non resta aperta per sempre: si chiude anche se non c'era niente da dimenticare
        await vi.waitFor(() => { if (v.find('[data-testid="talos-computer-old-entries"]').exists()) throw new Error('proposta ancora aperta') }, { timeout: 15_000 })
        await flushPromises()
        expect(plugin!.dimentica).not.toHaveBeenCalled()
        expect(v.get('[data-testid="talos-computer-old-entries-answered"]').text())
            .toBe('computer.oldEntriesAnswered{"count":2,"names":"Studio · pc-d, Studio · pc-t"}')
        const { domandaDoppiGiaFatta } = await import('@/lib/remoto/ricordiDelPc')
        expect(domandaDoppiGiaFatta('pc-uno')).toBe(true)
        for (const pcId of ['pc-due', 'pc-tre']) {
            expect(v.get(`[data-testid="talos-computer-card"][data-pc-id="${pcId}"]`).attributes('data-computer-stato')).toBe('inLinea')
        }
    }, 40_000)

    /*
     * Revisione del blocco 4, riserve S4: `dimenticaSoloQui(...).catch(() => undefined)` taceva. Una voce che non si dimentica lo dice;
     * se non se ne dimentica NESSUNA la domanda non si segna come fatta, e la proposta resta per riprovare.
     */
    function dimenticaFallisceSu(...pcIds: string[]) {
        plugin!.dimentica = vi.fn(async ({ pcId }: { pcId: string }) => {
            if (pcIds.includes(pcId)) throw Object.assign(new Error('x'), { code: 'STORE_FAILED' })
            return { dimenticato: true }
        }) as PluginComputer['dimentica']
    }

    it('DOPPI-UI-14 una voce che non si dimentica lo dice; le altre sì, e la domanda si segna fatta', async () => {
        const v = await accoppiaStudio([{ pcId: 'pc-due', nome: 'Studio', relay: null }, { pcId: 'pc-tre', nome: 'Studio', relay: null }])
        await vi.waitFor(() => { if (!v.find('[data-testid="talos-computer-old-entries"]').exists()) throw new Error('ancora niente') })
        dimenticaFallisceSu('pc-tre')
        await v.get('[data-testid="talos-computer-old-entries-yes"]').trigger('click')
        await vi.waitFor(() => { if (!v.find('[data-testid="talos-computer-old-entries-failed"]').exists()) throw new Error('niente') }, { timeout: 15_000 })
        expect(v.get('[data-testid="talos-computer-old-entries-failed"]').text()).toBe('computer.oldEntriesForgetFailed{"count":1,"names":"Studio · pc-t"}')
        const { domandaDoppiGiaFatta } = await import('@/lib/remoto/ricordiDelPc')
        expect(domandaDoppiGiaFatta('pc-uno')).toBe(true)
        expect(v.find('[data-testid="talos-computer-old-entries"]').exists()).toBe(false)
    }, 40_000)

    it('DOPPI-UI-15 ⛔ se non se ne dimentica NESSUNA: lo dice, la domanda non si segna e la proposta resta per riprovare', async () => {
        const v = await accoppiaStudio([{ pcId: 'pc-due', nome: 'Studio', relay: null }, { pcId: 'pc-tre', nome: 'Studio', relay: null }])
        await vi.waitFor(() => { if (!v.find('[data-testid="talos-computer-old-entries"]').exists()) throw new Error('ancora niente') })
        dimenticaFallisceSu('pc-due', 'pc-tre')
        await v.get('[data-testid="talos-computer-old-entries-yes"]').trigger('click')
        await vi.waitFor(() => { if (!v.find('[data-testid="talos-computer-old-entries-failed"]').exists()) throw new Error('niente') }, { timeout: 15_000 })
        await flushPromises()
        expect(v.get('[data-testid="talos-computer-old-entries-failed"]').text())
            .toBe('computer.oldEntriesForgetFailed{"count":2,"names":"Studio · pc-d, Studio · pc-t"}')
        const { domandaDoppiGiaFatta } = await import('@/lib/remoto/ricordiDelPc')
        expect(domandaDoppiGiaFatta('pc-uno')).toBe(false)
        expect(v.find('[data-testid="talos-computer-old-entries"]').exists()).toBe(true)
        expect(v.get('[data-testid="talos-computer-old-entries-yes"]').attributes('disabled')).toBeUndefined()
    }, 40_000)

    it('CSC-EFF-01 pc.effimero di pair.ok resta sul dispositivo e il riquadro dice «di prova»; ⛔ senza, niente', async () => {
        const v = await accoppiaStudio([], { effimero: true })
        await v.get('[data-testid="talos-computer-paired-done"]').trigger('click')
        await flushPromises()
        const { leggiRicordo } = await import('@/lib/remoto/ricordiDelPc')
        expect(leggiRicordo('pc-uno').effimero).toBe(true)
        const scheda = v.get('[data-testid="talos-computer-card"][data-pc-id="pc-uno"]')
        expect(scheda.get('[data-testid="talos-computer-test-tag"]').text()).toBe('computer.testEntry')
        v.unmount()
        localStorage.clear()
        computer = [{ pcId: 'pc-uno', nome: 'Studio', relay: null, accoppiatoAlle: 1 }]
        const w = await monta()
        expect(w.find('[data-testid="talos-computer-test-tag"]').exists()).toBe(false)
    }, 40_000)

    /* Fetta C, Desktop (3) 24/10: `pc.programma` di `pair.ok` distingue il desktop dalla CLI sullo stesso PC; il riquadro lo mostra. */
    it('CSC-PROG-01 il programma del PC arrivato con pair.ok resta sul dispositivo e compare nel riquadro', async () => {
        const v = await monta()
        await v.get('[data-testid="talos-computer-connect"]').trigger('click')
        await salutato()
        const codice = await codiceDiAccoppiamento('pc-uno', 'tel-uno', GETTONE)
        emetti('remoto-messaggio', { canale: 'c1', json: JSON.stringify({ v: 1, t: 'pair.code', codice, pc: { id: 'pc-uno', nome: 'Studio' } }) })
        await flushPromises()
        emetti('remoto-messaggio', { canale: 'c1', json: JSON.stringify({ v: 1, t: 'pair.ok', pc: { nome: 'Studio', programma: 'TALOS desktop' } }) })
        await flushPromises()
        await v.get('[data-testid="talos-computer-paired-done"]').trigger('click')
        await flushPromises()
        expect(v.get('[data-testid="talos-computer-card-program"]').text()).toBe('TALOS desktop')
        const { leggiRicordo } = await import('@/lib/remoto/ricordiDelPc')
        expect(leggiRicordo('pc-uno').programma).toBe('TALOS desktop')
    })

    it('CSC-PROG-02 ⛔ verso contrario: un PC accoppiato prima, senza programma ricordato, non mostra niente al suo posto', async () => {
        computer = [{ pcId: 'pc-uno', nome: 'Studio', relay: null, accoppiatoAlle: 1 }]
        const v = await monta()
        expect(v.find('[data-testid="talos-computer-card-program"]').exists()).toBe(false)
    })
})
