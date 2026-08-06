import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Tornando indietro da una scheda modello, la schermata deve essere COM'ERA.
 *
 * ## Perché questo test guarda lo store e non il componente
 *
 * Perché il difetto vive esattamente lì. Aprire un modello è una **rotta**: al
 * ritorno il componente si rimonta da capo, e qualunque `ref` locale riparte
 * dal valore iniziale. Un test che monta il componente e legge i suoi ref non
 * può vedere il difetto — il montaggio è proprio la cosa che lo causa.
 *
 * ## La storia, che vale più della regola
 *
 * Owner 2026-08-06: «ho impostato un filtro dei modelli locali, torno indietro
 * col pulsante freccia in alto a sinistra e si resettano i filtri. Anzi mi va
 * addirittura resettando i filtri sulla tab questo dispositivo».
 *
 * Avevo già spostato nello store i filtri del Hub, la ricerca e l'ordinamento —
 * e avevo lasciato indietro **la tab attiva** e **il filtro «entra in
 * memoria»**, che erano nati locali qualche ora prima. Dal punto di vista di
 * chi usa l'app, il difetto dichiarato chiuso era ancora tutto lì: tornava
 * sulla tab del dispositivo, col filtro spento.
 *
 * La regola che ne esce: **tutto ciò che la schermata ricorda sta nello store.**
 * Se un valore sopravvive a un giro di andata e ritorno nella testa di chi lo
 * ha impostato, deve sopravvivere anche nel codice.
 */

vi.mock('@/services/localModelCatalogue', () => ({}))

beforeEach(() => {
    vi.resetModules()
})

describe('quello che la schermata dei modelli ricorda', () => {
    it('sopravvive a un giro sulla scheda di un modello e ritorno', async () => {
        const store = await import('@/stores/localModels')

        // 1. Ci si mette sul Hub, si accende un filtro, si apre la ricerca.
        store.talosSetBrowseTab('hub')
        store.talosSetBrowseFilters(['fits', 'q4'])
        store.talosSetBrowseSearchOpen(true)
        // …e sul dispositivo si tiene solo quello che ci sta.
        store.talosSetInstalledFitsOnly(true)
        // ⛔ I DUE che l'owner usa davvero, e che la prima correzione aveva
        // lasciato indietro: l'autore e la fascia di peso. Sono menu a tendina,
        // non pillole — e sono quelli con cui si restringe sul serio.
        store.talosSetBrowseProvider('unsloth')
        store.talosSetBrowseWeightBand('1-4b')
        store.talosSetInstalledQuery('qwen')

        // 2. Si apre la scheda di un modello e la si chiude — è la rotta che
        //    rimonta il componente, cioè il gesto che azzerava tutto.
        store.talosCloseModelRepo()

        // 3. Tutto com'era.
        expect(store.talosLocalModels.browseTab).toBe('hub')
        expect(store.talosLocalModels.browseFilters).toEqual(['fits', 'q4'])
        expect(store.talosLocalModels.browseSearchOpen).toBe(true)
        expect(store.talosLocalModels.installedFitsOnly).toBe(true)
        expect(store.talosLocalModels.browseProvider).toBe('unsloth')
        expect(store.talosLocalModels.browseWeightBand).toBe('1-4b')
        expect(store.talosLocalModels.installedQuery).toBe('qwen')
    })

    /**
     * I valori iniziali contano quanto la memoria: si parte da «questo
     * dispositivo» perché «che modelli ho» viene prima di «cosa potrei
     * prendere», e con nessun filtro acceso perché nascondere qualcosa a chi
     * apre per la prima volta è il modo di far credere che manchi.
     */
    it('parte dal dispositivo, senza filtri e con la ricerca chiusa', async () => {
        const store = await import('@/stores/localModels')
        expect(store.talosLocalModels.browseTab).toBe('installed')
        expect(store.talosLocalModels.browseFilters).toEqual([])
        expect(store.talosLocalModels.browseSearchOpen).toBe(false)
        expect(store.talosLocalModels.installedFitsOnly).toBe(false)
        expect(store.talosLocalModels.browseProvider).toBe('')
        expect(store.talosLocalModels.browseWeightBand).toBe('')
        expect(store.talosLocalModels.installedQuery).toBe('')
    })

    /**
     * Lo stato è esposto in sola lettura: scriverci direttamente non funziona e
     * **non dice niente**. È il modo in cui la prima correzione di questo stesso
     * difetto era rimasta senza effetto — i filtri non si accendevano e nessun
     * errore lo segnalava.
     */
    it('lo stato non si lascia scrivere da fuori: si passa dalle funzioni', async () => {
        const store = await import('@/stores/localModels')
        const scritto = store.talosLocalModels as unknown as { browseTab: string }
        try { scritto.browseTab = 'hub' } catch { /* readonly: può anche lanciare */ }
        expect(store.talosLocalModels.browseTab).toBe('installed')
        store.talosSetBrowseTab('hub')
        expect(store.talosLocalModels.browseTab).toBe('hub')
    })
})
