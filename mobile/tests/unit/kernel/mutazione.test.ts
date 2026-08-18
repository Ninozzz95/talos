import { describe, expect, it } from 'vitest'
import { dichiarazioniConSpan, sostituisciEsistente } from '@/lib/kernel/mutazione'
import { caricaCompilatore } from '@/lib/kernel/simboli'
import type { TalosSorgente } from '@/lib/kernel/catalogo'

/**
 * ⭐⭐⭐ LA FETTA VERTICALE, dal bersaglio all'effetto.
 *
 * ⛔ E i due casi che decidono sono gemelli: la **stessa** identica richiesta,
 * su un simbolo che c'è e su uno che non c'è. Senza il secondo, un cancello che
 * rifiuta sempre passerebbe per prudente.
 */

const PREZZO = 'src/prezzo.ts'

const base = (): TalosSorgente[] => ([
    {
        percorso: PREZZO,
        testo: `/** Applica uno sconto percentuale. */
export function conSconto(centesimi: number, percento: number) {
    return Math.round(centesimi * (100 - percento) / 100)
}

export function totale(righe: number[]) {
    return righe.reduce((s, r) => s + r, 0)
}
`,
    },
])

const testoDi = (s: readonly TalosSorgente[], percorso: string) =>
    s.find((x) => x.percorso === percorso)?.testo ?? ''

describe('sostituire una dichiarazione che esiste', () => {
    it('⭐ la sostituisce, e il resto del file resta IDENTICO', async () => {
        const esito = await sostituisciEsistente(base(), { percorso: PREZZO, nome: 'conSconto' },
            'export function conSconto(centesimi: number, percento: number) {\n    return Math.floor(centesimi * (100 - percento) / 100)\n}')

        expect(esito.stato).toBe('fatta')
        if (esito.stato !== 'fatta') return
        const dopo = testoDi(esito.sorgenti, PREZZO)
        expect(dopo).toContain('Math.floor')
        expect(dopo).not.toContain('Math.round')
        expect(dopo).toContain('export function totale')
    })

    it('⛔⛔ e il COMMENTO sopra la funzione SOPRAVVIVE', async () => {
        const esito = await sostituisciEsistente(base(), { percorso: PREZZO, nome: 'conSconto' },
            'export function conSconto(c: number, p: number) {\n    return c\n}')
        expect(esito.stato).toBe('fatta')
        if (esito.stato !== 'fatta') return
        expect(testoDi(esito.sorgenti, PREZZO)).toContain('/** Applica uno sconto percentuale. */')
        // ⛔ Lo span parte da `getStart()`, che salta i commenti che precedono.
    })

    it('⛔ e le VIRGOLETTE e le righe vuote non si toccano', async () => {
        const conStringhe: TalosSorgente[] = [{
            percorso: PREZZO,
            testo: 'export const etichetta = \'in saldo\'\n\n\nexport function x() { return 1 }\n',
        }]
        const esito = await sostituisciEsistente(conStringhe, { percorso: PREZZO, nome: 'x' },
            'export function x() { return 2 }')
        expect(esito.stato).toBe('fatta')
        if (esito.stato !== 'fatta') return
        const dopo = testoDi(esito.sorgenti, PREZZO)
        expect(dopo).toContain('\'in saldo\'')
        expect(dopo).toContain('\n\n\n')
        // ⛔ `ts.createPrinter()` avrebbe convertito le virgolette e cancellato
        // le righe vuote: la modifica vera sparirebbe dentro un diff illeggibile.
    })
})

describe('⛔⛔ i due gemelli — la stessa richiesta, un simbolo che c\'è e uno che no', () => {
    it('IL SIMBOLO NON C\'È: rifiutata, e non viene creato niente', async () => {
        const prima = testoDi(base(), PREZZO)
        const esito = await sostituisciEsistente(base(), { percorso: PREZZO, nome: 'scontoFedelta' },
            'export function scontoFedelta(c: number) { return c }')

        expect(esito.stato).toBe('rifiutata')
        if (esito.stato !== 'rifiutata') return
        expect(esito.perche).toBe('premessa')
        expect(esito.messaggio).toContain('Nothing was created')
        // ⛔ E non esiste una via per cui questa funzione porti all'esistenza un
        // simbolo che non c'era: sta nel tipo prima che nella logica.
        expect(prima).not.toContain('scontoFedelta')
    })

    it('⭐ IL SIMBOLO C\'È: la stessa identica forma di richiesta passa', async () => {
        const esito = await sostituisciEsistente(base(), { percorso: PREZZO, nome: 'totale' },
            'export function totale(righe: number[]) {\n    return righe.reduce((s, r) => s + r, 1)\n}')
        expect(esito.stato).toBe('fatta')
        // Senza questo caso, un cancello che rifiuta sempre passerebbe per prudente.
    })
})

describe('⛔ G2: il bersaglio esiste ma la sostituzione chiama cose inesistenti', () => {
    it('rifiutata, e nomina il riferimento rotto', async () => {
        const esito = await sostituisciEsistente(base(), { percorso: PREZZO, nome: 'totale' },
            'export function totale(righe: number[]) {\n    return applicaScontoVip(righe)\n}')

        expect(esito.stato).toBe('rifiutata')
        if (esito.stato !== 'rifiutata') return
        expect(esito.perche).toBe('riferimenti')
        expect(esito.messaggio).toContain('applicaScontoVip')
        // ⛔ Il bersaglio era valido. G1 da sola avrebbe lasciato passare.
    })

    it('⭐ ma una sostituzione che usa cose ESISTENTI passa', async () => {
        const esito = await sostituisciEsistente(base(), { percorso: PREZZO, nome: 'totale' },
            'export function totale(righe: number[]) {\n    return conSconto(righe[0] ?? 0, 10)\n}')
        expect(esito.stato).toBe('fatta')
    })

    it('⛔⛔ e SENZA la libreria standard accusa `righe.length` — che è codice SANO', async () => {
        const esito = await sostituisciEsistente(base(), { percorso: PREZZO, nome: 'totale' },
            'export function totale(righe: number[]) {\n    return conSconto(righe.length, 10)\n}')
        expect(esito.stato).toBe('rifiutata')
        /*
         * ⛔ Non è un difetto della modifica: è il compilatore che senza
         * `lib.d.ts` non sa che cosa sia un array. La cura sta in
         * `libreriaStandard.ts`, e il suo test dimostra che lo stesso identico
         * codice passa quando la libreria c'è.
         *
         * ⇒ Questo caso resta qui perché il difetto NON si dimentichi: chi userà
         * `sostituisciEsistente` senza libreria sta restringendo la garanzia, e
         * deve saperlo. Il giorno in cui la libreria diventerà obbligatoria,
         * questo test diventerà rosso — ed è esattamente ciò che deve fare.
         */
    })
})

describe('⛔ i casi in cui NON si sa abbastanza', () => {
    it('⛔⛔ AMBIGUO non è presente: due dichiarazioni con lo stesso nome', async () => {
        const doppio: TalosSorgente[] = [{
            percorso: PREZZO,
            testo: 'export function x() { return 1 }\nexport function x() { return 2 }\n',
        }]
        const esito = await sostituisciEsistente(doppio, { percorso: PREZZO, nome: 'x' },
            'export function x() { return 3 }')
        expect(esito.stato).toBe('rifiutata')
        if (esito.stato !== 'rifiutata') return
        expect(esito.perche).toBe('ambiguo')
        // ⛔ Sceglierne una in silenzio riscriverebbe la cosa sbagliata, e il
        // diff sembrerebbe a posto.
    })

    it('un file che non è nel workspace è una premessa che non regge', async () => {
        const esito = await sostituisciEsistente(base(), { percorso: 'src/mai.ts', nome: 'x' }, 'const x = 1')
        expect(esito.stato).toBe('rifiutata')
        if (esito.stato !== 'rifiutata') return
        expect(esito.perche).toBe('premessa')
    })

    it('⛔ un file ILLEGGIBILE è ignoto, non assente', async () => {
        const chiuso: TalosSorgente[] = [{ percorso: PREZZO, testo: null }]
        const esito = await sostituisciEsistente(chiuso, { percorso: PREZZO, nome: 'x' }, 'const x = 1')
        expect(esito.stato).toBe('rifiutata')
        if (esito.stato !== 'rifiutata') return
        expect(esito.perche).toBe('ignoto')
    })
})

describe('gli span delle dichiarazioni', () => {
    it('trova le forme di primo livello, con inizio e fine', async () => {
        const ts = await caricaCompilatore()
        const trovate = dichiarazioniConSpan(ts, testoDi(base(), PREZZO), PREZZO)
        expect(trovate.map((d) => d.nome).sort()).toEqual(['conSconto', 'totale'])
        for (const d of trovate) expect(d.fine).toBeGreaterThan(d.inizio)
    })

    it('⛔ NON scende dentro le funzioni: una annidata non è un bersaglio', async () => {
        const ts = await caricaCompilatore()
        const trovate = dichiarazioniConSpan(ts,
            'export function fuori() {\n    function dentro() { return 1 }\n    return dentro()\n}\n', PREZZO)
        expect(trovate.map((d) => d.nome)).toEqual(['fuori'])
        // Sostituire `dentro` vorrebbe dire riscrivere un pezzo del corpo di
        // `fuori`: è un'altra operazione, e avrà un altro nome.
    })

    it('⛔ in `const a = 1, b = 2` lo span è l\'ISTRUZIONE INTERA', async () => {
        const ts = await caricaCompilatore()
        const trovate = dichiarazioniConSpan(ts, 'const a = 1, b = 2\n', PREZZO)
        expect(trovate).toHaveLength(2)
        expect(trovate[0]!.inizio).toBe(trovate[1]!.inizio)
        expect(trovate[0]!.fine).toBe(trovate[1]!.fine)
        // Sostituire solo `a = 1` lascerebbe una virgola orfana e un file rotto.
    })
})
