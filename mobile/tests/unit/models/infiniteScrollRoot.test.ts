import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(
    process.cwd(),
    'src/components/talos/models/TalosMobileLocalModels.vue',
), 'utf8')

/**
 * Lo scorrimento infinito deve scattare da solo, e per farlo l'osservatore deve
 * guardare il contenitore giusto — **nel momento giusto**.
 *
 * ## Il difetto, misurato
 *
 * Owner 2026-08-06: «infinite scroll non funziona, devo premere manualmente
 * carica altri». Una prima correzione aveva già trovato metà della causa —
 * l'osservatore guardava la finestra mentre la lista scorre dentro un pannello
 * — e non bastava.
 *
 * MISURATO sul Pad il 2026-08-06 sera, scheda Hugging Face aperta: la
 * sentinella era **visibile a schermo**, e un `IntersectionObserver` attaccato
 * in quell'istante con gli stessi parametri scattava subito con
 * `isIntersecting: true`. Quello dell'app non chiamava niente. Dieci risultati,
 * e «Carica altri» come unica strada.
 *
 * ## La causa: la radice si sceglie UNA VOLTA SOLA
 *
 * `contenitoreCheScorre` cerca il primo antenato che scorre **davvero**
 * (`scrollHeight > clientHeight`), e quella condizione dipende da quanto
 * contenuto c'è dentro. Nell'istante in cui la sentinella compare il contenuto
 * spesso non è ancora arrivato: nessun antenato scorre, la radice diventa la
 * finestra — e resta la finestra per sempre, anche dopo che il pannello ha
 * cominciato a scorrere.
 *
 * ⛔ Osservare una volta al comparire della sentinella non basta: bisogna
 * riosservare quando cambia ciò che rende scorrevole il contenitore.
 */
describe('lo scorrimento infinito guarda il contenitore giusto, quando è giusto', () => {
    it('sceglie il primo antenato che scorre DAVVERO, non il primo che potrebbe', () => {
        // `overflow: auto` su un contenitore che sta tutto dentro non scorre, e
        // sceglierlo come radice significa non vedere mai la sentinella entrare.
        expect(source).toContain('if (scorre && nodo.scrollHeight > nodo.clientHeight) return nodo')
    })

    it('⛔ riosserva quando cambia ciò che rende scorrevole il contenitore', () => {
        // Il difetto vive fra le due righe: la sentinella compare prima dei
        // risultati, quindi la radice scelta allora è quasi sempre la sbagliata.
        expect(source).toMatch(/watch\(\s*\n?\s*\(\) => \[store\.results\.length, store\.browseTab, visibleResultCount\.value\][^]*osserva\(\)/)
    })

    it('e riosserva anche quando la sentinella compare', () => {
        expect(source).toContain('watch(sentinellaPagina, () => { osserva() })')
    })

    /**
     * Il guardiano che impedisce il ciclo infinito quando i filtri nascondono
     * tutto: la sentinella resta visibile proprio perché non c'è niente sopra
     * di lei, e ogni pagina che arriva ne chiederebbe subito un'altra.
     */
    it('non insegue pagine che i filtri nascondono comunque', () => {
        expect(source).toContain('if (store.results.length > 0 && visibleResultCount.value === 0) return')
    })

    /**
     * ⛔ MISURATO sul Pad in viewport telefono: col filtro «da 1 a 4 miliardi»
     * passavano **tre** risultati, e tre righe non riempiono uno schermo. La
     * sentinella restava sempre in vista, ogni pagina ne chiedeva un'altra, e
     * lo spinner girava senza fermarsi mai.
     *
     * Il guardiano precedente copriva solo lo zero, e tre non è zero. La cura
     * generalizzata: se il caricamento automatico smette di portare qualcosa da
     * vedere, si ferma.
     */
    it('si arrende dopo qualche pagina che non porta niente da vedere', () => {
        expect(source).toContain('const PAGINE_A_VUOTO_PRIMA_DI_FERMARSI = 3')
        expect(source).toMatch(/pagineSenzaGuadagno \+= 1[^]*caricamentoAutomaticoEsausto\.value = true/)
        // Arrendersi vuol dire staccare l'osservatore, non solo alzare una bandiera.
        expect(source).toMatch(/caricamentoAutomaticoEsausto\.value = true[^]*osservatorePagina\?\.disconnect\(\)/)
    })

    /**
     * E riparte quando la domanda cambia: essersi arresi su una taglia non dice
     * niente su un'altra.
     */
    it('riprende quando i filtri cambiano', () => {
        expect(source).toMatch(/store\.browseWeightBand, store\.browseProvider[^]*riprendiCaricamentoAutomatico\(\)/)
        expect(source).toContain('caricamentoAutomaticoEsausto.value = false')
    })

    /**
     * Il comando esplicito resta: la ricerca sconsiglia lo scorrimento infinito
     * PURO per i compiti mirati, e cercare un modello da scaricare è mirato.
     * Serve anche a chi naviga da tastiera o con lo screen reader.
     */
    it('il comando esplicito non sparisce', () => {
        expect(source).toContain('data-testid="talos-models-page-sentinel"')
        expect(source).toMatch(/loadMore\(\)/)
    })
})
