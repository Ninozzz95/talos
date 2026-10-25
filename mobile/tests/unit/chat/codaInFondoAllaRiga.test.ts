// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { computed, reactive } from 'vue'

/**
 * ⛔ D-VIS-9 (23/10/2026, prova da utente vero «Marco» con luna 6 al massimo, foto `tmp/live/stream/tails.png`): mentre la risposta
 * arriva l'ultima riga si RIMESCOLA. «Dentro un campo tra virgoletteontenuto: ven |, virgole e a capo sono c»: le parole nuove
 * compaiono in mezzo alla riga, dentro il grassetto o dentro il codice in linea, prima del testo che invece viene dopo.
 * Causa (`TalosMobileStreamingReply.vue` `tailTarget`): la coda scende nell'ULTIMO ELEMENTO del blocco (`children` conta solo gli
 * elementi), anche quando dopo di lui c'è ancora testo semplice. La coda va sempre IN FONDO alla riga.
 */
vi.mock('@/stores/chatController', () => ({
    useChatController: () => ({
        chat: { state: reactive({ sending: false, streamingText: '', streamingReasoning: null, streamingConfini: null, streamingSessionId: null }), activeSession: { value: null } },
        toolActivity: { value: [] },
    }),
}))
vi.mock('@/stores/settings', () => ({
    useSettingsStore: () => ({ state: { shell: { streaming_animation: 'fade' } } }),
}))

import TalosMobileStreamingReply from '@/components/chat/TalosMobileStreamingReply.vue'
import { TALOS_SORGENTE_STREAMING, type TalosSorgenteStreaming } from '@/lib/chat/sorgenteStreaming'

function monta(inizio: string) {
    const giro = reactive({ testo: inizio })
    const sorgente: TalosSorgenteStreaming = {
        sending: computed(() => true),
        testo: computed(() => giro.testo),
        ragionamento: computed(() => ''),
        confini: computed(() => []),
        attivi: computed(() => []),
    }
    const w = mount(TalosMobileStreamingReply, { attachTo: document.body, global: { provide: { [TALOS_SORGENTE_STREAMING as symbol]: sorgente } } })
    return { w, giro }
}

/** Il testo dell'ultimo blocco come lo legge chi guarda: nell'ordine del DOM, senza il cursore. */
const ultimaRiga = (w: ReturnType<typeof monta>['w']) =>
    (w.findAll('[data-testid="talos-mobile-message-content"] li').at(-1)?.element.textContent ?? '').replace(/\s+/g, ' ').trim()

describe('la coda delle parole nuove va in fondo alla riga (D-VIS-9)', () => {
    for (const [nome, inizio, seguito, attesa] of [
        ['dopo un grassetto', '1. **Dentro un campo tra virgolette**, virgole e a capo sono ', 'contenuto normale e poi', 'Dentro un campo tra virgolette, virgole e a capo sono contenuto normale e poi'],
        ['dopo un codice in linea', '1. Due virgolette consecutive (`""`) dentro un campo quotato, le consuma entrambe e ', 'aggiunge una sola virgoletta al', 'Due virgolette consecutive ("") dentro un campo quotato, le consuma entrambe e aggiunge una sola virgoletta al'],
    ] as const) {
        it(`STREAM-CODA-01 ${nome}: le parole nuove compaiono dopo il testo che c'è già, mai in mezzo`, async () => {
            const { w, giro } = monta(`Il lettore:\n\n${inizio}`)
            await vi.waitFor(() => expect(ultimaRiga(w)).toContain(inizio.slice(3, 20).replace(/\*|`/g, '')), { timeout: 5000 })
            // ogni fotografia del DOM mentre le parole arrivano: la riga deve essere sempre un INIZIO della frase vera
            const fotografie: string[] = []
            const osservatore = new MutationObserver(() => fotografie.push(ultimaRiga(w)))
            osservatore.observe(w.find('[data-testid="talos-mobile-message-content"]').element, { childList: true, subtree: true, characterData: true })
            giro.testo += seguito + ' altro testo ancora'
            await vi.waitFor(() => expect(ultimaRiga(w)).toContain(attesa), { timeout: 5000 })
            osservatore.disconnect()
            const completa = attesa + ' altro testo ancora'
            // qui si guarda l'ORDINE delle parole: i segni grezzi `**` e `` ` `` nella coda sono D-VIS-10 (STREAM-CODA-03, passo 2)
            const senzaSegni = (f: string) => f.replace(/\*\*|`/g, '').replace(/\s+/g, ' ').trim()
            const fuoriPosto = fotografie.map(senzaSegni).filter((f) => f.length > 0 && !completa.startsWith(f) && !f.startsWith(completa))
            expect(fuoriPosto, fuoriPosto[0]).toEqual([])
            w.unmount()
        }, 20_000)
    }

    // ⛔ D-VIS-10, NON curato qui (revisione del Desktop, 23/10): finché il parse non arriva, la coda mostra i segni del markdown
    // grezzi («**Dentro un campo tra»). Lo curano i moduli del desktop (`chiudiInArrivo`/`confineDiRivelazione`) al passo 2 di #24.
    // `it.fails`: oggi passa PERCHÉ il difetto c'è; quando il passo 2 lo cura diventa rosso, e allora si toglie `.fails`.
    it.fails('STREAM-CODA-03 (D-VIS-10, passo 2) la coda non mostra mai i segni grezzi del markdown', async () => {
        const { w, giro } = monta('Il lettore:\n\n1. Un campo ')
        await vi.waitFor(() => expect(ultimaRiga(w)).toContain('Un campo'), { timeout: 5000 })
        const fotografie: string[] = []
        const osservatore = new MutationObserver(() => fotografie.push(ultimaRiga(w)))
        osservatore.observe(w.find('[data-testid="talos-mobile-message-content"]').element, { childList: true, subtree: true, characterData: true })
        giro.testo += '**tra virgolette** resta intero e poi altro testo ancora'
        await vi.waitFor(() => expect(ultimaRiga(w)).toContain('tra virgolette resta intero'), { timeout: 5000 })
        osservatore.disconnect()
        w.unmount()
        expect(fotografie.filter((f) => f.includes('**'))).toEqual([])
    }, 20_000)

    /** L'ultimo paragrafo come lo legge chi guarda; un a capo dentro il paragrafo conta come uno spazio. */
    const ultimoParagrafo = (w: ReturnType<typeof monta>['w']) =>
        (w.findAll('[data-testid="talos-mobile-message-content"] p').at(-1)?.element.textContent ?? '').replace(/\s+/g, ' ').trim()

    for (const [nome, inizio] of [
        ['dopo uno spazio', 'Il parser legge un campo '],
        ['dopo un a capo dentro il paragrafo (revisione del Desktop)', 'Il parser legge un campo\n'],
    ] as const) {
        it(`STREAM-CODA-02 ${nome}: la parola nuova non si attacca a quella prima`, async () => {
            const { w, giro } = monta(inizio)
            await vi.waitFor(() => expect(ultimoParagrafo(w)).toContain('Il parser legge un'), { timeout: 5000 })
            const fotografie: string[] = []
            const osservatore = new MutationObserver(() => fotografie.push(ultimoParagrafo(w)))
            osservatore.observe(w.find('[data-testid="talos-mobile-message-content"]').element, { childList: true, subtree: true, characterData: true })
            giro.testo += 'quotato alla volta e poi altro testo ancora'
            await vi.waitFor(() => expect(ultimoParagrafo(w)).toContain('quotato alla volta e poi'), { timeout: 5000 })
            osservatore.disconnect()
            const completa = 'Il parser legge un campo quotato alla volta e poi altro testo ancora'
            const fuoriPosto = fotografie.filter((f) => f.length > 0 && !completa.startsWith(f) && !f.startsWith(completa))
            expect(fuoriPosto, fuoriPosto[0]).toEqual([])
            w.unmount()
        }, 20_000)
    }
})
