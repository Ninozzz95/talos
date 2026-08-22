import { describe, expect, it } from 'vitest'
import {
    talosResearchIndependentSources,
    talosResearchRegistrableHost,
} from '@/lib/research/researchIndependence'

/**
 * ⛔⛔ INDIPENDENZA-03 — tre fonti che ripetono la stessa non fanno tre prove.
 *
 * ## Perché serve, e non è pedanteria accademica
 *
 * Un rapporto che dice «sostenuta da 3 fonti» sta facendo una promessa
 * numerica. Se quelle tre fonti sono tre siti che riprendono lo stesso
 * comunicato, il 3 è **falso**: la prova è una sola, ripetuta tre volte, e chi
 * legge decide con più fiducia di quanta ne meriti il fatto.
 *
 * È il modo più comune in cui una notizia sbagliata si consolida — e un agente
 * che cerca sul web ci cade più facilmente di una persona, perché i primi
 * risultati di una ricerca sono spesso proprio le riprese.
 *
 * ## Come si misura, con quello che abbiamo davvero
 *
 * Senza chiedere niente in più alla rete: **il dominio registrabile**, e le
 * origini che una fonte cita a sua volta quando il raccoglitore le ha viste.
 *
 * 1. Due pagine dello stesso dominio non sono due fonti.
 * 2. Una fonte che cita **una sola** altra origine è una ripresa di quella, e
 *    conta insieme a lei.
 * 3. ⛔ Una fonte che cita **più** origini diverse non è una ripresa: è un
 *    lavoro che ha messo insieme più cose, e resta indipendente. Sbagliare
 *    questo verso punirebbe proprio le fonti migliori.
 *
 * ⇒ Il numero che si mostra è quello dei gruppi, non quello degli URL.
 */

describe('talosResearchRegistrableHost', () => {
    it('toglie il www e la porta', () => {
        expect(talosResearchRegistrableHost('https://www.example.com/a/b?c=1')).toBe('example.com')
        expect(talosResearchRegistrableHost('https://example.com:8443/a')).toBe('example.com')
    })

    it('un sottodominio non è un dominio diverso', () => {
        expect(talosResearchRegistrableHost('https://blog.example.com/a')).toBe('example.com')
        expect(talosResearchRegistrableHost('https://a.b.c.example.com/')).toBe('example.com')
    })

    it('⛔ i suffissi a due livelli non si tagliano a metà', () => {
        // `bbc.co.uk` è il dominio: `co.uk` da solo non è una fonte.
        expect(talosResearchRegistrableHost('https://www.bbc.co.uk/news/x')).toBe('bbc.co.uk')
        expect(talosResearchRegistrableHost('https://www.repubblica.it/x')).toBe('repubblica.it')
    })

    it('un indirizzo che non è un indirizzo non diventa un dominio', () => {
        expect(talosResearchRegistrableHost('non un url')).toBeNull()
        expect(talosResearchRegistrableHost('')).toBeNull()
    })
})

describe('INDIPENDENZA-03 le riprese non contano come prove separate', () => {
    it('⛔ tre pagine dello stesso dominio contano UNA', () => {
        const esito = talosResearchIndependentSources([
            { url: 'https://example.com/uno' },
            { url: 'https://example.com/due' },
            { url: 'https://blog.example.com/tre' },
        ])

        expect(esito.total).toBe(3)
        expect(esito.independent).toBe(1)
    })

    it('⛔ tre fonti che citano la STESSA origine contano UNA', () => {
        const esito = talosResearchIndependentSources([
            { url: 'https://tg1.it/a', cites: ['https://agenzia.example/comunicato'] },
            { url: 'https://tg2.it/b', cites: ['https://agenzia.example/comunicato'] },
            { url: 'https://tg3.it/c', cites: ['https://www.agenzia.example/comunicato'] },
        ])

        expect(esito.independent).toBe(1)
        expect(esito.groups).toHaveLength(1)
        expect(esito.groups[0]?.origin).toBe('agenzia.example')
        expect(esito.groups[0]?.sources).toHaveLength(3)
    })

    it('⛔ e al contrario: chi cita PIÙ origini resta indipendente', () => {
        // È il lavoro che mette insieme più cose: punirlo sarebbe il verso
        // sbagliato, e toglierebbe valore proprio alle fonti migliori.
        const esito = talosResearchIndependentSources([
            { url: 'https://rassegna.it/a', cites: ['https://uno.example/x', 'https://due.example/y'] },
            { url: 'https://altro.it/b', cites: ['https://uno.example/x'] },
        ])

        expect(esito.independent).toBe(2)
    })

    it('fonti davvero distinte restano distinte', () => {
        const esito = talosResearchIndependentSources([
            { url: 'https://uno.example/a' },
            { url: 'https://due.example/b' },
            { url: 'https://tre.example/c' },
        ])

        expect(esito.independent).toBe(3)
    })

    it('una fonte che cita sé stessa non diventa una ripresa di sé stessa', () => {
        const esito = talosResearchIndependentSources([
            { url: 'https://example.com/a', cites: ['https://example.com/b'] },
            { url: 'https://altro.example/c' },
        ])

        expect(esito.independent).toBe(2)
    })

    it('⛔ un elenco vuoto è ZERO, non uno', () => {
        const esito = talosResearchIndependentSources([])
        expect(esito.total).toBe(0)
        expect(esito.independent).toBe(0)
        expect(esito.groups).toHaveLength(0)
    })

    it('un indirizzo illeggibile non inventa un gruppo', () => {
        const esito = talosResearchIndependentSources([
            { url: 'non un url' },
            { url: 'https://uno.example/a' },
        ])

        expect(esito.independent).toBe(1)
    })
})
