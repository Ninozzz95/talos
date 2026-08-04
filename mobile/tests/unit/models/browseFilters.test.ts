import { describe, expect, it } from 'vitest'
import { talosApplyBrowseFilters, talosModelPassesFilter } from '@/lib/models/browseFilters'

const GB = 1024 * 1024 * 1024
const LIBERA = 4.4 * GB

const m = (id: string, task: string | null = null, tags: string[] = []) => ({ id, task, tags })

/**
 * Owner 2026-08-04, mockup approvato: cinque chip — Ci sta · Chat · Codice ·
 * Q4 · Licenza libera.
 *
 * Non le faccette del Hub: ognuno di questi risponde a una domanda che si fa
 * chi mette un modello su un TELEFONO.
 */
describe('i filtri della lista', () => {
    it('«ci sta» usa la memoria di QUESTO dispositivo', () => {
        // È l'unico filtro che nessun altro catalogo può avere.
        expect(talosModelPassesFilter(m('Llama-3.2-3B-Instruct-Q4_K_M'), 'fits', LIBERA)).toBe(true)
        expect(talosModelPassesFilter(m('Qwen3-Coder-30B-A3B-Q4_K_M'), 'fits', LIBERA)).toBe(false)
    })

    it('un modello che non dice la sua taglia NON viene nascosto', () => {
        /**
         * Verrebbe escluso per un dato mancante, non per una sua
         * caratteristica, e chi guarda non avrebbe modo di capire perché è
         * sparito. «Non lo so» non è «non ci sta».
         */
        expect(talosModelPassesFilter(m('mistral-instruct'), 'fits', LIBERA)).toBe(true)
    })

    it('«licenza libera» non nasconde chi la licenza non la dichiara', () => {
        // Stessa ragione: un silenzio non è un divieto.
        expect(talosModelPassesFilter(m('x/y', null, []), 'open-licence', LIBERA)).toBe(true)
        expect(talosModelPassesFilter(m('x/y', null, ['license:apache-2.0']), 'open-licence', LIBERA)).toBe(true)
        expect(talosModelPassesFilter(m('x/y', null, ['license:other']), 'open-licence', LIBERA)).toBe(false)
    })

    it('i filtri si SOMMANO, non si uniscono', () => {
        /**
         * Chi accende «codice» e «ci sta» vuole i modelli di codice che
         * entrano, non l'unione dei due insiemi. È la lettura che chiunque dà a
         * due interruttori accesi insieme.
         */
        const lista = [
            m('Qwen3-Coder-30B-A3B-Q4_K_M'),   // codice, ma non ci sta
            m('Qwen3-Coder-3B-Q4_K_M'),        // codice e ci sta
            m('Llama-3.2-3B-Instruct-Q4_K_M'), // ci sta, ma non è codice
        ]
        const esito = talosApplyBrowseFilters(lista, ['code', 'fits'], LIBERA)
        expect(esito.map((x) => x.id)).toEqual(['Qwen3-Coder-3B-Q4_K_M'])
    })

    it('senza filtri accesi la lista è intera', () => {
        // La capienza resta un'etichetta su tutte le righe: il filtro è un
        // gesto in più, non il modo normale di guardare la lista.
        const lista = [m('a-3B-Q4_K_M'), m('b-70B-Q8_0')]
        expect(talosApplyBrowseFilters(lista, [], LIBERA)).toHaveLength(2)
    })
})
