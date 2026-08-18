import { describe, expect, it } from 'vitest'
import { cancelloSemantico, introdotte, riferimentiNonRisolti } from '@/lib/kernel/semantica'
import type { TalosSorgente } from '@/lib/kernel/catalogo'

/**
 * ⛔⛔⛔ LA GARANZIA G2: la modifica non introduce riferimenti che non esistono.
 *
 * G1 — «non tocchi ciò che non c'è» — **non la implica**. Il bersaglio può
 * esistere e la sostituzione chiamare una funzione inventata. Sono due
 * garanzie, e prometterne una avendo l'altra è la bugia più facile.
 *
 * ⛔ E il confronto è **differenziale**: pretendere che il progetto compili
 * pulito prima e dopo escluderebbe quasi ogni codebase vera.
 */

const alberi = (file: Record<string, string>): TalosSorgente[] =>
    Object.entries(file).map(([percorso, testo]) => ({ percorso, testo }))

const PREZZO = '/prezzo.ts'
const USO = '/uso.ts'

const BASE = {
    [PREZZO]: 'export function conSconto(c: number) { return c }\n',
    [USO]: 'import { conSconto } from "./prezzo"\nexport const x = conSconto(10)\n',
}

describe('il cancello semantico', () => {
    it('⛔⛔ una modifica che chiama una funzione INESISTENTE è respinta', async () => {
        const dopo = {
            ...BASE,
            [USO]: 'import { conSconto } from "./prezzo"\nexport const x = applicaScontoVip(10)\n',
        }
        const esito = await cancelloSemantico(alberi(BASE), alberi(dopo))
        expect(esito.stato).toBe('assente')
        expect(esito.stato === 'assente' && esito.perche).toContain('applicaScontoVip')
    })

    it('⭐ e una modifica LEGITTIMA passa', async () => {
        const dopo = {
            ...BASE,
            [USO]: 'import { conSconto } from "./prezzo"\nexport const x = conSconto(20)\n',
        }
        expect((await cancelloSemantico(alberi(BASE), alberi(dopo))).stato).toBe('presente')
    })

    it('⛔⛔ DIFFERENZIALE: un errore che c\'era GIÀ non blocca la modifica', async () => {
        const sporco = {
            ...BASE,
            '/vecchio.ts': 'export const rotto = giaRottoDaSempre()\n',
        }
        const dopo = {
            ...sporco,
            [USO]: 'import { conSconto } from "./prezzo"\nexport const x = conSconto(20)\n',
        }
        const esito = await cancelloSemantico(alberi(sporco), alberi(dopo))
        expect(esito.stato).toBe('presente')
        // Pretendere un progetto pulito escluderebbe quasi ogni codebase vera.
    })

    it('⛔ ma un errore NUOVO in un progetto già sporco viene visto', async () => {
        const sporco = {
            ...BASE,
            '/vecchio.ts': 'export const rotto = giaRottoDaSempre()\n',
        }
        const dopo = {
            ...sporco,
            [USO]: 'import { conSconto } from "./prezzo"\nexport const x = ancheQuestoNonEsiste(1)\n',
        }
        const esito = await cancelloSemantico(alberi(sporco), alberi(dopo))
        expect(esito.stato).toBe('assente')
        expect(esito.stato === 'assente' && esito.perche).toContain('ancheQuestoNonEsiste')
    })

    it('⭐⭐ segue gli ALIAS: un re-export con rinomina NON è un riferimento rotto', async () => {
        const conAlias = {
            [PREZZO]: 'export function conSconto(c: number) { return c }\n',
            '/riesporta.ts': 'export { conSconto as sconto } from "./prezzo"\n',
            [USO]: 'import { sconto } from "./riesporta"\nexport const x = sconto(10)\n',
        }
        const esito = await cancelloSemantico(alberi(conAlias), alberi(conAlias))
        expect(esito.stato).toBe('presente')
        // ⛔ Un catalogo puramente sintattico direbbe che `sconto` non è
        // dichiarato in nessun file: è `conSconto`, rinominato in transito.
    })

    it('⛔ e un alias verso qualcosa che NON esiste viene visto', async () => {
        const rotto = {
            [PREZZO]: 'export function conSconto(c: number) { return c }\n',
            '/riesporta.ts': 'export { scontoFedelta as sconto } from "./prezzo"\n',
            [USO]: 'import { sconto } from "./riesporta"\nexport const x = sconto(10)\n',
        }
        const esito = await cancelloSemantico(alberi(BASE), alberi(rotto))
        expect(esito.stato).toBe('assente')
    })

    it('⛔ un modulo che non esiste è un riferimento non risolto', async () => {
        const dopo = {
            ...BASE,
            [USO]: 'import { qualcosa } from "./mai-esistito"\nexport const x = qualcosa(1)\n',
        }
        expect((await cancelloSemantico(alberi(BASE), alberi(dopo))).stato).toBe('assente')
    })
})

describe('il confronto a multiset', () => {
    const d = (codice: number, messaggio: string) => ({ codice, file: '/a.ts', messaggio })

    it('⛔⛔ DUE errori identici prima e TRE dopo: il terzo è nuovo', () => {
        const nuove = introdotte(
            [d(2304, 'Cannot find name X'), d(2304, 'Cannot find name X')],
            [d(2304, 'Cannot find name X'), d(2304, 'Cannot find name X'), d(2304, 'Cannot find name X')],
        )
        expect(nuove).toHaveLength(1)
        // ⛔ Con un confronto a INSIEME il terzo sparirebbe — ed è esattamente
        // il caso di una funzione duplicata dalla modifica.
    })

    it('lo stesso identico insieme non introduce niente', () => {
        expect(introdotte([d(2304, 'X')], [d(2304, 'X')])).toHaveLength(0)
    })

    it('⭐ e un errore RIMOSSO non conta come introdotto', () => {
        expect(introdotte([d(2304, 'X'), d(2339, 'Y')], [d(2304, 'X')])).toHaveLength(0)
    })
})

describe('cosa NON entra nel giudizio', () => {
    it('⛔⛔ la POSIZIONE non fa parte dell\'impronta', async () => {
        /*
         * Una modifica legittima sposta gli offset di tutto ciò che viene dopo.
         * Se la posizione entrasse nell'impronta, ogni errore preesistente
         * sembrerebbe nuovo, e il cancello rifiuterebbe qualunque cosa in un
         * progetto che ha anche un solo errore vecchio.
         */
        const prima = {
            '/a.ts': 'export const rotto = nonEsiste()\n',
        }
        const dopo = {
            '/a.ts': '// una riga in più, che sposta tutto\n// e un\'altra\nexport const rotto = nonEsiste()\n',
        }
        const esito = await cancelloSemantico(alberi(prima), alberi(dopo))
        expect(esito.stato).toBe('presente')
    })

    it('un file illeggibile non partecipa e non fa esplodere niente', async () => {
        const conNull: TalosSorgente[] = [
            { percorso: PREZZO, testo: BASE[PREZZO]! },
            { percorso: '/chiuso.ts', testo: null },
        ]
        expect((await cancelloSemantico(conNull, conNull)).stato).toBe('presente')
    })

    it('un albero vuoto non introduce niente', async () => {
        expect(await riferimentiNonRisolti([])).toEqual([])
    })
})
