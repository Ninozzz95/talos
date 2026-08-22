import { describe, expect, it } from 'vitest'
import {
    talosApplyBrowseFilters,
    talosModelHasQ4Variant,
    talosModelIsChatCapable,
    talosModelIsCodeOriented,
    talosModelPassesFilter,
} from '@/lib/models/browseFilters'

const GB = 1024 * 1024 * 1024
const LIBERA = 4.4 * GB
const DEVICE = {
    availableRamBytes: LIBERA,
    lowMemoryThresholdBytes: 0,
    freeStorageBytes: 40 * GB,
}

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
        expect(talosModelPassesFilter(m('Llama-3.2-3B-Instruct-Q4_K_M'), 'fits', DEVICE)).toBe(true)
        expect(talosModelPassesFilter(m('Qwen3-Coder-30B-A3B-Q4_K_M'), 'fits', DEVICE)).toBe(false)
    })

    it('«gira qui» non include un modello la cui taglia è sconosciuta', () => {
        /**
         * Il filtro positivo promette un risultato noto. La riga resta visibile
         * a filtro spento con «Da verificare», ma non può entrare in «Gira qui»
         * per assenza di prova.
         */
        expect(talosModelPassesFilter(m('mistral-instruct'), 'fits', DEVICE)).toBe(false)
    })

    it('«gira qui» non trasforma lo storage non misurato in successo', () => {
        expect(talosModelPassesFilter(
            m('Llama-3.2-3B-Instruct-Q4_K_M'),
            'fits',
            { ...DEVICE, freeStorageBytes: null },
        )).toBe(false)
    })

    it('il disco viene giudicato con la stessa riserva del download', () => {
        expect(talosModelPassesFilter(
            m('Llama-3.2-3B-Instruct-Q4_K_M'),
            'fits',
            // 3B Q4_K_M = 1.800.000.000 byte; un byte sotto file + 1 GiB.
            { ...DEVICE, freeStorageBytes: 1_800_000_000 + GB - 1 },
        )).toBe(false)
    })

    it('«gira qui» usa la stessa variante Hugging Face mostrata dalla riga', () => {
        const misleadingSmallName = {
            ...m('owner/model-1B-Q4_K_M'),
            browseVariant: {
                fileBytes: 20 * GB,
                workingBytes: 24 * GB,
                estimated: false,
            },
        }
        const nameCannotEstimateIt = {
            ...m('microsoft/Phi-4-mini-instruct'),
            browseVariant: {
                fileBytes: 1.5 * GB,
                workingBytes: 2 * GB,
                estimated: false,
            },
        }

        expect(talosModelPassesFilter(misleadingSmallName, 'fits', DEVICE)).toBe(false)
        expect(talosModelPassesFilter(nameCannotEstimateIt, 'fits', DEVICE)).toBe(true)
    })

    it('non inventa una Q4 dal nome quando il client ha dichiarato variante nulla', () => {
        expect(talosModelPassesFilter({
            ...m('owner/model-3B-Q4_K_M'),
            browseVariant: null,
        }, 'fits', DEVICE)).toBe(false)
    })

    it('Chat richiede tag conversational oppure un chat template reale', () => {
        expect(talosModelIsChatCapable(m('plain/generator', 'text-generation'))).toBe(false)
        expect(talosModelIsChatCapable(m('plain/model', null, ['conversational']))).toBe(true)
        expect(talosModelIsChatCapable({ ...m('plain/model'), hasChatTemplate: true })).toBe(true)
        expect(talosModelIsChatCapable(m('owner/chat-in-name'))).toBe(false)
    })

    it('Orientato al codice resta una euristica TALOS conservativa', () => {
        expect(talosModelIsCodeOriented(m('Qwen/Qwen2.5-Coder-7B-GGUF'))).toBe(true)
        expect(talosModelIsCodeOriented(m('owner/model', null, ['code-generation']))).toBe(true)
        expect(talosModelIsCodeOriented(m('owner/encode-model'))).toBe(false)
        expect(talosModelIsCodeOriented(m('owner/codebook-model'))).toBe(false)
    })

    it('Q4 viene dalla variante sibling canonica e mai dal nome repository', () => {
        expect(talosModelHasQ4Variant({
            ...m('owner/model-Q4_K_M'),
            browseVariant: {
                fileBytes: GB,
                workingBytes: 2 * GB,
                estimated: false,
                quantisation: 'Q8_0',
            },
        })).toBe(false)
        expect(talosModelHasQ4Variant({
            ...m('owner/model-without-quant-in-name'),
            browseVariant: {
                fileBytes: GB,
                workingBytes: 2 * GB,
                estimated: false,
                quantisation: 'Q4_K_M',
            },
        })).toBe(true)
        expect(talosModelHasQ4Variant({ ...m('owner/model-Q4_K_M'), browseVariant: null })).toBe(false)
    })

    it('licenza permissiva è una promessa positiva e fail-closed', () => {
        expect(talosModelPassesFilter(m('x/y', null, []), 'open-licence', DEVICE)).toBe(false)
        expect(talosModelPassesFilter(m('x/y', null, ['license:apache-2.0']), 'open-licence', DEVICE)).toBe(true)
        expect(talosModelPassesFilter(m('x/y', null, ['license:other']), 'open-licence', DEVICE)).toBe(false)
        expect(talosModelPassesFilter(m('x/y', null, ['license:openrail']), 'open-licence', DEVICE)).toBe(false)
        expect(talosModelPassesFilter(m('x/y', null, ['license:llama3.1']), 'open-licence', DEVICE)).toBe(false)
        expect(talosModelPassesFilter(m('x/y', null, ['license:cc-by-4.0']), 'open-licence', DEVICE)).toBe(false)
        expect(talosModelPassesFilter({
            ...m('x/y', null, ['license:apache-2.0']),
            licence: 'other',
        }, 'open-licence', DEVICE)).toBe(false)
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
        const esito = talosApplyBrowseFilters(lista, ['code', 'fits'], DEVICE)
        expect(esito.map((x) => x.id)).toEqual(['Qwen3-Coder-3B-Q4_K_M'])
    })

    it('senza filtri accesi la lista è intera', () => {
        // La capienza resta un'etichetta su tutte le righe: il filtro è un
        // gesto in più, non il modo normale di guardare la lista.
        const lista = [m('a-3B-Q4_K_M'), m('b-70B-Q8_0')]
        expect(talosApplyBrowseFilters(lista, [], DEVICE)).toHaveLength(2)
    })
})
