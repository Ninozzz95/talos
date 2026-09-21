import { describe, expect, it } from 'vitest'
import {
    talosResearchBibtex,
    talosResearchRis,
} from '@/lib/research/researchCitationExport'

/**
 * ⛔⛔ EXPORT-06 — le fonti escono in un formato che un gestore sa leggere.
 *
 * Oggi il rapporto esce in Markdown e PDF, che sono per una persona. Chi fa un
 * lavoro serio con delle fonti le mette in Zotero, Mendeley, EndNote — e quei
 * programmi parlano **BibTeX** e **RIS**. Senza, ogni riferimento va ricopiato
 * a mano, ed è il punto in cui una bibliografia si sporca.
 *
 * ## ⛔ Cosa NON esce
 *
 * Una citazione descrive una PAGINA, non chi l'ha letta. Non escono: la query
 * che l'ha trovata, il modello che l'ha giudicata, l'identificativo della
 * ricerca, la chat da cui viene. Un file di bibliografia finisce in una
 * cartella condivisa, in un allegato, in un repository — ed è il posto meno
 * controllato in cui un dato personale possa arrivare.
 *
 * ## E le chiavi non si scontrano
 *
 * Due fonti dello stesso dominio nello stesso anno produrrebbero la stessa
 * chiave BibTeX, e un file con due chiavi uguali non è un file valido: il
 * gestore ne butta una, in silenzio. Le chiavi si disambiguano.
 */

const FONTI = [
    {
        url: 'https://www.example.com/articolo',
        title: 'Il titolo dell’articolo',
        publishedAt: '2026-03-14',
        accessedAt: '2026-08-20',
    },
    {
        url: 'https://bbc.co.uk/news/x',
        title: 'Another headline',
        publishedAt: null,
        accessedAt: '2026-08-20',
    },
]

describe('EXPORT-06 BibTeX', () => {
    it('una voce per fonte, col tipo giusto per una pagina web', () => {
        const testo = talosResearchBibtex(FONTI)
        expect(testo.match(/@misc\{/g)).toHaveLength(2)
    })

    it('porta i campi obbligatori: titolo, url e data di consultazione', () => {
        const testo = talosResearchBibtex(FONTI)
        expect(testo).toContain('title = {Il titolo dell’articolo}')
        expect(testo).toContain('url = {https://www.example.com/articolo}')
        expect(testo).toContain('urldate = {2026-08-20}')
    })

    it('l\'anno c\'è quando la fonte lo dichiara, e manca quando non lo dichiara', () => {
        const testo = talosResearchBibtex(FONTI)
        expect(testo).toContain('year = {2026}')
        // La seconda non ha data di pubblicazione: non se ne inventa una.
        expect(testo.match(/year = \{/g)).toHaveLength(1)
    })

    it('⛔ le chiavi non si scontrano fra fonti dello stesso dominio e anno', () => {
        const testo = talosResearchBibtex([
            { url: 'https://example.com/a', title: 'A', publishedAt: '2026-01-01', accessedAt: '2026-08-20' },
            { url: 'https://example.com/b', title: 'B', publishedAt: '2026-01-01', accessedAt: '2026-08-20' },
        ])
        const chiavi = [...testo.matchAll(/@misc\{([^,]+),/g)].map((m) => m[1])
        expect(chiavi).toHaveLength(2)
        expect(new Set(chiavi).size).toBe(2)
    })

    it('⛔ le graffe nel titolo non rompono il file', () => {
        const testo = talosResearchBibtex([
            { url: 'https://example.com/a', title: 'Un {titolo} con \\graffe', publishedAt: null, accessedAt: '2026-08-20' },
        ])
        expect(testo).not.toContain('{titolo}')
        expect(testo).toContain('title = {Un titolo con graffe}')
    })

    it('⛔ NON esce niente della persona né della ricerca', () => {
        const testo = talosResearchBibtex([{
            url: 'https://example.com/a',
            title: 'A',
            publishedAt: null,
            accessedAt: '2026-08-20',
            // Campi che il chiamante potrebbe passare per sbaglio: si ignorano.
            query: 'quanto guadagna Antonino',
            researchId: 'ric-9',
        } as never])
        expect(testo).not.toContain('Antonino')
        expect(testo).not.toContain('ric-9')
    })
})

describe('EXPORT-06 RIS', () => {
    it('ogni voce apre col tipo e chiude con ER', () => {
        const testo = talosResearchRis(FONTI)
        expect(testo.match(/^TY {2}- ELEC$/gm)).toHaveLength(2)
        expect(testo.match(/^ER {2}- $/gm)).toHaveLength(2)
    })

    it('porta titolo, url e data di consultazione', () => {
        const testo = talosResearchRis(FONTI)
        expect(testo).toContain('TI  - Il titolo dell’articolo')
        expect(testo).toContain('UR  - https://www.example.com/articolo')
        expect(testo).toContain('Y2  - 2026/08/20')
    })

    it('la data di pubblicazione c\'è solo se dichiarata', () => {
        const testo = talosResearchRis(FONTI)
        expect(testo).toContain('PY  - 2026')
        expect(testo.match(/^PY {2}- /gm)).toHaveLength(1)
    })

    it('⛔ un a capo dentro un titolo non spezza il record', () => {
        const testo = talosResearchRis([
            { url: 'https://example.com/a', title: 'Prima riga\nseconda riga', publishedAt: null, accessedAt: '2026-08-20' },
        ])
        expect(testo).toContain('TI  - Prima riga seconda riga')
        expect(testo.match(/^ER {2}- $/gm)).toHaveLength(1)
    })

    it('⛔ e al contrario: nessuna fonte produce un file VUOTO, non un record vuoto', () => {
        expect(talosResearchRis([])).toBe('')
        expect(talosResearchBibtex([])).toBe('')
    })
})
