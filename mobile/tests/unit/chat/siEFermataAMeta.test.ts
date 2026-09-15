// @vitest-environment jsdom
/**
 * ⛔⛔ LA RISPOSTA CHE SEMBRA TRONCATA — rilievo #16b dell'owner.
 *
 * ## Il difetto
 *
 * Owner, dagli screenshot del 12 agosto: una risposta in chat appariva
 * **troncata a metà frase** («nessuna app può») «senza che si capisca se sia
 * finita, interrotta o tagliata dal rendering».
 *
 * Tre cause con lo stesso aspetto, e TALOS ne sapeva dire una sola:
 *
 * | com'è finita | chi lo diceva, PRIMA |
 * |---|---|
 * | il modello ha finito | niente da dire |
 * | ha esaurito la lunghezza | ⛔ **nessuno** |
 * | il rendering l'ha tagliata | `messageMarkdown.truncated`, già a schermo |
 *
 * `finishReason` arrivava al controller e **moriva lì**: nessuno lo scriveva
 * accanto alla risposta. L'unico caso trattato era `length` con testo **vuoto**
 * (`emptyProviderResponse`) — cioè proprio quello in cui non c'è niente da
 * leggere a metà.
 *
 * ## Ciò che questo file difende
 *
 * 1. Con `stopped_at_limit`, sotto la risposta compare la riga che lo dice.
 * 2. ⛔ Senza, **non compare niente**: un avviso su ogni risposta insegnerebbe
 *    a dubitare anche di quelle intere, che è il danno opposto e più grande.
 * 3. La riga non sostituisce la risposta: il testo del modello resta.
 */
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TalosMobileMessageList from '@/components/chat/TalosMobileMessageList.vue'
import { TALOS_METADATA_TRONCATA } from '@/lib/tools/tracciaAzione'

function risposta(metadata: Record<string, unknown>) {
    return {
        id: 'm1',
        role: 'assistant',
        content: 'Su questo telefono nessuna app può',
        createdAt: new Date('2026-08-15T10:00:00Z').toISOString(),
        status: 'complete',
        metadata,
    }
}

function lista(metadata: Record<string, unknown>) {
    return mount(TalosMobileMessageList, {
        props: { messages: [risposta(metadata)] as never, sending: false },
        global: { stubs: { teleport: true } },
    })
}

describe('⛔ una risposta fermata dal limite lo DICE', () => {
    it('col fatto nei metadati, la riga compare sotto la risposta', () => {
        const w = lista({ [TALOS_METADATA_TRONCATA]: true })
        const avviso = w.find('[data-testid="talos-risposta-troncata"]')
        expect(avviso.exists()).toBe(true)
        expect(avviso.text().length, 'la riga deve dire qualcosa').toBeGreaterThan(10)
        // ⛔ E NON sostituisce la risposta: la frase del modello resta.
        expect(w.text()).toContain('nessuna app può')
    })

    it('⛔ senza il fatto, NESSUN avviso: il dubbio non si semina', () => {
        expect(lista({}).find('[data-testid="talos-risposta-troncata"]').exists()).toBe(false)
        // E nemmeno una risposta con ALTRI metadati lo accende per sbaglio.
        expect(lista({ used_library: ['x'] })
            .find('[data-testid="talos-risposta-troncata"]').exists()).toBe(false)
    })

    /*
     * ⛔ `false` è una risposta finita normalmente, non «forse». Se un giorno il
     * controller scrivesse la chiave sempre, con `true`/`false`, un controllo
     * di sola presenza mostrerebbe l'avviso su OGNI risposta.
     */
    it('⛔ il fatto FALSO non accende niente', () => {
        expect(lista({ [TALOS_METADATA_TRONCATA]: false })
            .find('[data-testid="talos-risposta-troncata"]').exists()).toBe(false)
    })
})
