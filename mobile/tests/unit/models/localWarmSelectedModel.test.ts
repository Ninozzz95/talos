import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { talosTestT } from '../../helpers/talosTestI18n'

/**
 * ⛔⛔⛔ 2026-09-10 — «UN RISCALDAMENTO CHE NON PARTE IN SILENZIO È UN DIFETTO».
 *
 * Parole dell'owner, lo stesso giorno in cui il modello locale è risultato
 * freddo due minuti dopo essere stato scelto: 32,0 s alla prima parola contro i
 * 351 ms di PocketPal. Le tre spiegazioni possibili — il cancello termico, il
 * sondaggio GPU, un percorso morto — erano **indistinguibili fra loro**, perché
 * ognuna produceva esattamente lo stesso niente: nessun avviso, nessuno stato,
 * nessun contatore, un `catch {}` su ogni ramo.
 *
 * ⇒ Questo file prova la METÀ VISIBILE della cura, ramo per ramo. Le frasi
 * asserite qui sono quelle vere, risolte dal catalogo inglese di produzione: se
 * qualcuno toglie una chiave, questi test diventano rossi invece di lasciare a
 * schermo il nome della chiave.
 *
 * ⛔ E il cancello termico NON si toglie: si dichiara. Il test qui sotto lo
 * verifica al VERSO CONTRARIO — col cancello che respinge, lo stato dev'essere
 * DETTO, non silenzioso.
 */

const t = talosTestT('en')

const deviceCapacity = vi.hoisted(() => ({
    talosMeasureDevice: vi.fn(),
    talosCurrentThermalState: vi.fn(async () => 'none' as const),
}))
vi.mock('@/services/deviceCapacity', () => deviceCapacity)

const localEngine = vi.hoisted(() => ({
    talosWarmLocalModel: vi.fn(),
}))
vi.mock('@/services/localEngine', () => localEngine)

vi.mock('@/i18n', () => ({
    talosT: (key: string, parameters?: Record<string, string | number>) => t(key, parameters),
}))

const { talosWarmSelectedLocalModel } = await import('@/lib/models/localWarmSelectedModel')
const { talosLocalWarmState, __resetTalosLocalWarmStateForTests } =
    await import('@/lib/models/localWarmState')
const { useTalosMobileToasts, __resetToastsForTests } = await import('@/stores/toasts')

/** Il Pad dell'owner come lo misura davvero: fresco, con memoria in abbondanza. */
const PAD_SANO = {
    totalRamBytes: 12_000_000_000,
    availableRamBytes: 4_300_000_000,
    lowMemoryThresholdBytes: 300_000_000,
    freeStorageBytes: 60_000_000_000,
    abiSupported: true,
    thermal: 'none' as const,
    memoryBandwidthBytesPerSecond: 60_000_000_000,
    deviceModel: 'pad',
    androidSdk: 36,
    cpuCores: 8,
    cpuCapacities: [792, 792, 792, 792, 792, 792, 1024, 1024],
}

const MODELLO = '/storage/emulated/0/Download/LFM2.5-2.6B-Q4_0.gguf'

function messaggi(): string[] {
    return useTalosMobileToasts().items.value.map((toast) => toast.message)
}

/**
 * ⛔ I moduli di questa funzione arrivano da `import()` dinamici: la prima
 * chiamata li RISOLVE davvero (lettura dal disco), e sotto timer finti quel
 * lavoro non avanza — il `setTimeout` dell'avviso non è ancora stato piazzato
 * quando i test provano a farlo scattare. Un giro a vuoto con i timer veri li
 * mette in cache; da lì in poi tutto si risolve in microtask e i timer finti
 * misurano ciò che devono misurare.
 */
beforeAll(async () => {
    deviceCapacity.talosMeasureDevice.mockResolvedValue(PAD_SANO)
    localEngine.talosWarmLocalModel.mockResolvedValue({ opened: false, why: 'already-open' })
    await talosWarmSelectedLocalModel('/scaldamoduli.gguf')
})

beforeEach(() => {
    __resetToastsForTests()
    __resetTalosLocalWarmStateForTests()
    deviceCapacity.talosMeasureDevice.mockReset()
    localEngine.talosWarmLocalModel.mockReset()
    deviceCapacity.talosMeasureDevice.mockResolvedValue(PAD_SANO)
})

afterEach(() => {
    vi.useRealTimers()
    __resetToastsForTests()
})

describe('l’apertura anticipata SI VEDE mentre succede', () => {
    it('dice che sta caricando, col nome del modello e non col percorso', async () => {
        vi.useFakeTimers()
        let concludi!: (esito: unknown) => void
        localEngine.talosWarmLocalModel.mockImplementation(
            () => new Promise((resolve) => { concludi = resolve }),
        )

        const corsa = talosWarmSelectedLocalModel(MODELLO)
        await vi.advanceTimersByTimeAsync(500)

        expect(messaggi()).toContain(
            'Loading LFM2.5-2.6B-Q4_0… this can take a while the first time.',
        )
        // ⛔ Il percorso non compare MAI a schermo.
        expect(messaggi().join(' ')).not.toContain('/storage/')
        expect(talosLocalWarmState().value.phase).toBe('opening')

        concludi({ opened: true, ms: 31_000, withoutMeasuredProfiles: false })
        await corsa
    })

    it('quando è pronto lo dice, e nomina il tempo dell’APERTURA', async () => {
        vi.useFakeTimers()
        let concludi!: (esito: unknown) => void
        localEngine.talosWarmLocalModel.mockImplementation(
            () => new Promise((resolve) => { concludi = resolve }),
        )

        const corsa = talosWarmSelectedLocalModel(MODELLO)
        await vi.advanceTimersByTimeAsync(500)
        concludi({ opened: true, ms: 31_000, withoutMeasuredProfiles: false })
        await corsa

        expect(messaggi()).toContain(
            'LFM2.5-2.6B-Q4_0 is ready — it took 31 seconds to load.',
        )
        expect(messaggi()).not.toContain(
            'Loading LFM2.5-2.6B-Q4_0… this can take a while the first time.',
        )
        // ⛔ 31 secondi di DISCO. Non è il tempo alla prima parola, e lo stato
        // li tiene separati apposta: sommarli fa sembrare lento il motore
        // quando è lento il disco.
        expect(talosLocalWarmState().value).toMatchObject({ phase: 'ready', openMs: 31_000 })
    })

    /**
     * ⛔ AL CONTRARIO — un avviso che compare e sparisce nello stesso battito è
     * peggio di nessun avviso: insegna a ignorare gli avvisi veri.
     */
    it('AL CONTRARIO — un’apertura lampo non mostra niente del tutto', async () => {
        localEngine.talosWarmLocalModel.mockResolvedValue({
            opened: true, ms: 90, withoutMeasuredProfiles: false,
        })

        await talosWarmSelectedLocalModel(MODELLO)

        expect(messaggi()).toEqual([])
        expect(talosLocalWarmState().value).toMatchObject({ phase: 'ready', openMs: 90 })
    })

    it('AL CONTRARIO — un modello già in memoria non annuncia un’apertura che non c’è stata', async () => {
        localEngine.talosWarmLocalModel.mockResolvedValue({ opened: false, why: 'already-open' })

        await talosWarmSelectedLocalModel(MODELLO)

        expect(messaggi()).toEqual([])
        expect(talosLocalWarmState().value).toMatchObject({ phase: 'ready', openMs: null })
    })
})

/**
 * ⛔⛔ IL CANCELLO NON SI TOGLIE — SI DICHIARA.
 *
 * Owner 10/09: «Un riscaldamento che non parte per calore è una scelta
 * legittima; un riscaldamento che non parte in silenzio è un difetto».
 */
describe('quando il cancello ambientale respinge, lo DICE', () => {
    it('telefono troppo caldo: lo nomina, e dice cosa succederà lo stesso', async () => {
        deviceCapacity.talosMeasureDevice.mockResolvedValue({ ...PAD_SANO, thermal: 'severe' })

        await talosWarmSelectedLocalModel(MODELLO)

        expect(messaggi()).toContain(
            'Holding off on loading LFM2.5-2.6B-Q4_0 — the phone is too warm right now.'
            + ' It will load when you send your first message.',
        )
        expect(talosLocalWarmState().value).toMatchObject({ phase: 'skipped', refusal: 'too-warm' })
        expect(localEngine.talosWarmLocalModel).not.toHaveBeenCalled()
    })

    it('poca memoria libera: una frase diversa, perché è una causa diversa', async () => {
        deviceCapacity.talosMeasureDevice.mockResolvedValue({
            ...PAD_SANO, availableRamBytes: 200_000_000,
        })

        await talosWarmSelectedLocalModel(MODELLO)

        expect(messaggi()).toContain(
            'Holding off on loading LFM2.5-2.6B-Q4_0 — this phone is short on free memory right now.'
            + ' It will load when you send your first message.',
        )
        expect(talosLocalWarmState().value).toMatchObject({ phase: 'skipped', refusal: 'low-memory' })
    })

    /**
     * ⛔ Il caso che il 10/09 nessuno poteva escludere: se il dispositivo non
     * si lascia misurare, il cancello respinge — ed è giusto. Quello che non
     * era giusto è che respingesse senza dirlo.
     */
    it('dispositivo che non si lascia misurare: respinge, e non tace', async () => {
        deviceCapacity.talosMeasureDevice.mockResolvedValue(null)

        await talosWarmSelectedLocalModel(MODELLO)

        expect(messaggi()).toContain(
            'Holding off on loading LFM2.5-2.6B-Q4_0 — this phone will not say how warm it is,'
            + ' so TALOS is not loading it in the background.'
            + ' It will load when you send your first message.',
        )
        expect(talosLocalWarmState().value)
            .toMatchObject({ phase: 'skipped', refusal: 'unknown-heat' })
    })

    /**
     * ⛔ AL CONTRARIO — sul Pad dell'owner, coi numeri veri misurati il 10/09
     * (fresco, 4,3 GB liberi), il cancello NON respinge. È la prova che scagiona
     * la prima delle tre spiegazioni: il riscaldamento non è saltato per questo.
     */
    it('AL CONTRARIO — col Pad fresco e la memoria libera il cancello LASCIA PASSARE', async () => {
        localEngine.talosWarmLocalModel.mockResolvedValue({
            opened: true, ms: 90, withoutMeasuredProfiles: false,
        })

        await talosWarmSelectedLocalModel(MODELLO)

        expect(localEngine.talosWarmLocalModel).toHaveBeenCalledWith(MODELLO)
        expect(talosLocalWarmState().value.phase).toBe('ready')
    })
})

describe('un anticipo fallito non resta un silenzio', () => {
    it('lo dice, e dice che il modello si aprirà comunque', async () => {
        vi.useFakeTimers()
        let concludi!: (esito: unknown) => void
        localEngine.talosWarmLocalModel.mockImplementation(
            () => new Promise((resolve) => { concludi = resolve }),
        )

        const corsa = talosWarmSelectedLocalModel(MODELLO)
        await vi.advanceTimersByTimeAsync(500)
        concludi({ opened: false, why: 'failed' })
        await corsa

        expect(messaggi()).toContain(
            'Could not load LFM2.5-2.6B-Q4_0 ahead of time.'
            + ' It will load when you send your first message.',
        )
        expect(talosLocalWarmState().value.phase).toBe('failed')
    })

    /**
     * ⛔ Il chiamante è `void import(…).then(…)` senza `.catch`: un rifiuto di
     * qui diventerebbe una Promise non gestita, cioè un guasto invisibile —
     * esattamente la malattia che questa consegna cura.
     */
    it('AL CONTRARIO — non rifiuta MAI, nemmeno se il ponte esplode', async () => {
        localEngine.talosWarmLocalModel.mockRejectedValue(new Error('TALOS_LLAMA_UNAVAILABLE'))

        await expect(talosWarmSelectedLocalModel(MODELLO)).resolves.toBeUndefined()
    })
})
