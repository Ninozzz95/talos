import { describe, expect, it } from 'vitest'
import { costruisciCatalogo, risolviSimbolo, type TalosSorgente } from '@/lib/kernel/catalogo'

/**
 * ⭐⭐⭐ IL PARSE È IL COLLO, non il lookup.
 *
 * Misurato sul sorgente vero di TALOS: **452 file, 4,56 MB, 514 ms** per
 * costruire il catalogo — e una risoluzione costa **0,0146 ms**. Il rapporto è
 * 35.000 a 1. Su un telefono quei 514 ms diventano secondi, spesi **prima** che
 * la persona veda la scheda di consenso: un'attesa muta su una domanda che non
 * le è ancora stata fatta.
 *
 * ⛔ E la prova del riuso è per IDENTITÀ, non col cronometro: un test che
 * misura millisecondi diventa rosso sulla macchina di qualcun altro, e allora
 * qualcuno alza la soglia finché non prova più niente.
 */

const A = 'src/a.ts'
const B = 'src/b.ts'
const base: TalosSorgente[] = [
    { percorso: A, testo: 'export function alfa() { return 1 }\n' },
    { percorso: B, testo: 'export const beta = 2\n' },
]

describe('il catalogo riusa ciò che non è cambiato', () => {
    it('⭐ un file identico NON si ri-analizza', async () => {
        const primo = await costruisciCatalogo(base)
        const secondo = await costruisciCatalogo(base, { precedente: primo })
        expect(secondo.perFile.get(A)!.nomi).toBe(primo.perFile.get(A)!.nomi)
        expect(secondo.perFile.get(B)!.nomi).toBe(primo.perFile.get(B)!.nomi)
    })

    it('⛔⛔ e il riuso REGGE AL SECONDO GIRO: la cache non decade', async () => {
        /*
         * ⛔ Il difetto che questo test esiste per prendere: se la voce riusata
         * non ricorda il proprio testo, il giro dopo non la riconosce più e
         * ri-analizza tutto. Resta CORRETTO — e per questo non lo vede nessuno:
         * i 508 ms tornano in silenzio, e la cache sembra esserci.
         *
         * ⇒ L'ha trovato una mutazione, non un ragionamento: tutti gli altri
         * test facevano UNA sola ricostruzione, e una cache che decade dopo la
         * prima generazione li passa tutti.
         */
        const primo = await costruisciCatalogo(base)
        const secondo = await costruisciCatalogo(base, { precedente: primo })
        const terzo = await costruisciCatalogo(base, { precedente: secondo })
        expect(terzo.perFile.get(A)!.nomi).toBe(primo.perFile.get(A)!.nomi)
        expect(terzo.perFile.get(B)!.nomi).toBe(primo.perFile.get(B)!.nomi)

        const quarto = await costruisciCatalogo(base, { precedente: terzo })
        expect(quarto.perFile.get(A)!.nomi).toBe(primo.perFile.get(A)!.nomi)
    })

    it('⛔ ma un file CAMBIATO si ri-analizza, e il vecchio nome sparisce', async () => {
        const primo = await costruisciCatalogo(base)
        const dopo = await costruisciCatalogo([
            { percorso: A, testo: 'export function gamma() { return 1 }\n' }, base[1]!,
        ], { precedente: primo })

        expect(dopo.perFile.get(A)!.nomi).not.toBe(primo.perFile.get(A)!.nomi)
        expect(risolviSimbolo(dopo, 'gamma', A).stato).toBe('presente')
        expect(risolviSimbolo(dopo, 'alfa', A).stato).toBe('assente')
        // ⛔ Un catalogo che tiene il nome vecchio autorizza a modificare una
        // funzione che non c'è più: peggio di non avere catalogo.
        expect(dopo.perFile.get(B)!.nomi).toBe(primo.perFile.get(B)!.nomi)
    })

    it('⛔ un file CANCELLATO sparisce, dai file e dai nomi', async () => {
        const primo = await costruisciCatalogo(base)
        const dopo = await costruisciCatalogo([base[0]!], { precedente: primo })
        expect(dopo.perFile.has(B)).toBe(false)
        expect(risolviSimbolo(dopo, 'beta', B).stato).not.toBe('presente')
    })

    it('⛔ un file NUOVO entra', async () => {
        const primo = await costruisciCatalogo(base)
        const dopo = await costruisciCatalogo(
            [...base, { percorso: 'src/c.ts', testo: 'export class Delta {}\n' }], { precedente: primo })
        expect(risolviSimbolo(dopo, 'Delta', 'src/c.ts').stato).toBe('presente')
    })

    it('⛔⛔ un file ILLEGGIBILE che torna leggibile si ri-analizza', async () => {
        // Il caso che un digest ingenuo sbaglia: `null` non è una stringa, e
        // confrontarlo con `undefined` di un file mai visto darebbe un falso
        // riuso — un file diventerebbe permanentemente vuoto.
        const cieco = await costruisciCatalogo([{ percorso: A, testo: null }])
        expect(risolviSimbolo(cieco, 'alfa', A).stato).toBe('ignoto')
        const visto = await costruisciCatalogo([base[0]!], { precedente: cieco })
        expect(risolviSimbolo(visto, 'alfa', A).stato).toBe('presente')
    })

    it('⛔⛔ e il riuso NON cambia il risultato: identico a una costruzione fredda', async () => {
        const primo = await costruisciCatalogo(base)
        const cambiato: TalosSorgente[] = [
            { percorso: A, testo: 'export function gamma() { return 1 }\nexport type Eps = 1\n' },
            base[1]!,
        ]
        const caldo = await costruisciCatalogo(cambiato, { precedente: primo })
        const freddo = await costruisciCatalogo(cambiato)

        const chiavi = (c: typeof caldo) => [...c.perNome.entries()]
            .map(([n, dove]) => `${n}:${[...dove].sort().join(',')}`).sort()
        expect(chiavi(caldo)).toEqual(chiavi(freddo))
        // ⛔ È l'invariante che rende la cache non pericolosa: se il risultato
        // caldo divergesse anche una volta, la velocità sarebbe comprata con
        // una bugia intermittente — la peggiore da inseguire.
    })
})
