// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { computed, reactive } from 'vue'

/**
 * ⛔ #24, owner 23/10/2026 dal Pad: «il testo lagga un casino». Misurato su vc159 mentre Spark scriveva una pagina HTML: frame
 * da 39 ms continui. Causa (`TalosMobileStreamingReply.vue` `syncTail`): un «a capo» nella coda fa ripartire il parse INTERO della
 * risposta, e il recinto aperto si ricostruisce col `v-html`. Dentro un blocco di codice ogni riga finisce con un a capo: il costo
 * cresce col file (O(n²)). Il desktop l'ha curato in 3cf97a30d: il recinto aperto CRESCE SUL POSTO e il parse intero non riparte a
 * ogni riga. Questi test fissano il contratto lato dispositivo; la cura importa i moduli del desktop a uno SHA fissato.
 */

const conta = vi.hoisted(() => ({ parse: 0 }))
vi.mock('@/lib/streamingMarkdown', async (originale) => {
    const vero = await originale<typeof import('@/lib/streamingMarkdown')>()
    return {
        ...vero,
        stabilizeStreamingTalosMarkdown: (testo: string) => {
            conta.parse += 1
            return vero.stabilizeStreamingTalosMarkdown(testo)
        },
    }
})
vi.mock('@/stores/chatController', () => ({
    useChatController: () => ({
        chat: { state: reactive({ sending: false, streamingText: '', streamingReasoning: null, streamingConfini: null, streamingSessionId: null }), activeSession: { value: null } },
        toolActivity: { value: [] },
    }),
}))
const appunti = vi.hoisted(() => ({ copiati: [] as string[] }))
vi.mock('@/services/clipboard', () => ({
    writeTalosClipboardText: async (testo: string) => { appunti.copiati.push(testo) },
}))
vi.mock('@/stores/settings', () => ({
    useSettingsStore: () => ({ state: { shell: { streaming_animation: 'fade' } } }),
}))

import TalosMobileStreamingReply from '@/components/chat/TalosMobileStreamingReply.vue'
import { TALOS_SORGENTE_STREAMING, type TalosSorgenteStreaming } from '@/lib/chat/sorgenteStreaming'

const riga = (i: number) => `    .sezione-${i} { padding: 1rem; color: #c9a227; }`

function monta(inizio = 'Ecco la pagina.\n\n```css\n' + riga(0) + '\n' + riga(1) + '\n') {
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

describe('il blocco di codice aperto cresce sul posto (#24, parità con il desktop 3cf97a30d)', () => {
    it('STREAM-RECINTO-01 trenta righe nuove in un recinto aperto non ricostruiscono il <pre>: è lo stesso elemento e contiene l\'ultima riga', async () => {
        const { w, giro } = monta()
        // il <pre> del recinto aperto: finché la riga d'apertura non è arrivata intera, il blocco è ancora quello del parse
        await vi.waitFor(() => expect(w.find('[data-testid="talos-stream-fence"] pre').exists()).toBe(true), { timeout: 5000 })
        const pre = w.find('[data-testid="talos-stream-fence"] pre').element
        for (let i = 2; i < 32; i += 1) {
            giro.testo += riga(i) + '\n'
            await new Promise((fatto) => setTimeout(fatto, 20))
        }
        await vi.waitFor(() => expect(w.text()).toContain('.sezione-31'), { timeout: 8000 })
        expect(pre.isConnected).toBe(true)
        expect(pre.textContent).toContain('.sezione-31')
        w.unmount()
    }, 20_000)

    // ⛔ Regressione della #24 vista sul Pad (vc161, 23/10): nel blocco a mano il cursore ambra di scrittura era sparito, e solo lo
    // Stop diceva che il codice stava ancora arrivando. Il cursore torna FRATELLO DOPO il nodo di testo, mai dentro: e la via veloce
    // di `appendData` deve restare viva col cursore accanto (stesso nodo di testo, cursore sempre ultimo).
    it('STREAM-RECINTO-08 il cursore di scrittura sta in fondo al codice in arrivo, e il nodo di testo resta lo stesso', async () => {
        const { w, giro } = monta()
        await vi.waitFor(() => expect(w.find('[data-testid="talos-stream-fence"] code').exists()).toBe(true), { timeout: 5000 })
        const code = w.find('[data-testid="talos-stream-fence"] code').element
        const cursore = () => code.querySelector('[data-testid="talos-stream-caret"]')
        await vi.waitFor(() => expect(cursore()).not.toBeNull(), { timeout: 5000 })
        const nodo = code.firstChild
        expect(nodo?.nodeType).toBe(Node.TEXT_NODE)
        expect(cursore()?.previousSibling).toBe(nodo)
        expect(code.lastChild).toBe(cursore())
        expect(cursore()?.getAttribute('aria-hidden')).toBe('true')
        const aggiunte = vi.spyOn(Text.prototype, 'appendData')
        for (let i = 2; i < 8; i += 1) {
            giro.testo += riga(i) + '\n'
            await new Promise((fatto) => setTimeout(fatto, 20))
        }
        await vi.waitFor(() => expect(code.textContent).toContain('.sezione-7'), { timeout: 8000 })
        // la via veloce: lo stesso nodo di testo è cresciuto, il cursore è ancora l'ultimo e non è entrato nel testo
        expect(code.firstChild).toBe(nodo)
        expect(code.lastChild).toBe(cursore())
        expect(code.querySelectorAll('[data-testid="talos-stream-caret"]')).toHaveLength(1)
        // e il codice è cresciuto per AGGIUNTA, non riscrivendo tutto il nodo
        expect(aggiunte.mock.contexts.filter((nodoToccato) => nodoToccato === nodo).length).toBeGreaterThan(0)
        aggiunte.mockRestore()
        w.unmount()
    }, 20_000)

    it('STREAM-RECINTO-02 trenta righe nuove in un recinto aperto non fanno trenta parse interi della risposta', async () => {
        const { w, giro } = monta()
        await vi.waitFor(() => expect(w.find('pre').exists()).toBe(true), { timeout: 5000 })
        conta.parse = 0
        for (let i = 2; i < 32; i += 1) {
            giro.testo += riga(i) + '\n'
            await new Promise((fatto) => setTimeout(fatto, 20))
        }
        await vi.waitFor(() => expect(w.text()).toContain('.sezione-31'), { timeout: 8000 })
        // il recinto aperto non chiede il parse intero a ogni riga; qualche parse di confine è ammesso
        expect(conta.parse).toBeLessThanOrEqual(3)
        w.unmount()
    }, 20_000)

    it('STREAM-RECINTO-04 un recinto con ~~~ o con quattro apici resta sul percorso di sempre: nessun blocco a mano, codice intero', async () => {
        for (const [apre, chiude] of [['~~~js', '~~~'], ['````js', '````']] as const) {
            const { w, giro } = monta(`Prova.\n\n${apre}\nconst a = 1\n`)
            await vi.waitFor(() => expect(w.find('pre').exists()).toBe(true), { timeout: 5000 })
            giro.testo += 'const b = 2\n'
            await vi.waitFor(() => expect(w.find('pre').text()).toContain('const b = 2'), { timeout: 5000 })
            expect(w.find('[data-testid="talos-stream-fence"]').exists(), apre).toBe(false)
            // l'ultima parola resta trattenuta finché il giro scrive: dopo c'è altro testo, come in una risposta vera
            giro.testo += `${chiude}\n\nFine. Poi il resto della risposta`
            await vi.waitFor(() => expect(w.text()).toContain('Fine.'), { timeout: 5000 })
            expect(w.findAll('pre')).toHaveLength(1)
            expect(w.find('pre').text()).toBe('const a = 1\nconst b = 2')
            w.unmount()
        }
    }, 20_000)

    it('STREAM-RECINTO-05 il blocco a mano ha la forma del blocco finale; mentre arriva «Copia» è spento con «Incoming…», dopo copia tutto', async () => {
        const { w, giro } = monta()
        await vi.waitFor(() => expect(w.find('[data-testid="talos-stream-fence"]').exists()).toBe(true), { timeout: 5000 })
        const radice = w.find('[data-testid="talos-mobile-message-content"]').element
        const aMano = w.find('[data-testid="talos-stream-fence"]').element
        expect(aMano.parentElement).toBe(radice)
        expect(radice.lastElementChild).toBe(aMano)
        expect(aMano.className).toBe('talos-message-block')
        const copia = w.find('[data-testid="talos-stream-fence"] .talos-code-block > .talos-code-block-header > button[type="button"][data-talos-copy-code]')
        expect(copia.exists()).toBe(true)
        // revisione del Desktop 23/10 (voce 1b) e bozzetto dei blocchi: c'è, nello stesso posto, ma SPENTO e dice «Incoming…»;
        // ogni pulsante della testata (anche il ⋯ dei blocchi, dove c'è) è spento finché il codice non è intero
        expect(copia.text()).toBe('Incoming…')
        for (const pulsante of w.findAll('[data-testid="talos-stream-fence"] .talos-code-block-header > button')) {
            expect((pulsante.element as HTMLButtonElement).disabled).toBe(true)
        }
        appunti.copiati.length = 0
        await copia.trigger('click')
        await new Promise((fatto) => setTimeout(fatto, 50))
        expect(appunti.copiati).toEqual([])
        // stessa voce per chi legge con lo screen reader del blocco finale (renderer di talosMessageMarkdown.ts)
        giro.testo += '```\n\nFine. Poi il resto della risposta'
        await vi.waitFor(() => expect(w.find('[data-testid="talos-stream-fence"]').exists()).toBe(false), { timeout: 5000 })
        const finale = w.find('.talos-code-block-header > button[data-talos-copy-code]')
        expect(copia.attributes('aria-label')).toBe(finale.attributes('aria-label'))
        expect((finale.element as HTMLButtonElement).disabled).toBe(false)
        expect(w.find('.talos-code-block-header > span').text()).toBe('css')
        // dopo la chiusura «Copia» copia il codice INTERO
        await finale.trigger('click')
        await vi.waitFor(() => expect(appunti.copiati).toHaveLength(1))
        expect(appunti.copiati[0]).toBe(riga(0) + '\n' + riga(1) + '\n')
        w.unmount()
    }, 20_000)

    // Revisione del Desktop 23/10 (voce 1a): il blocco a mano legge la lingua con `languageClass`, come il blocco finale.
    // Prima «```Python» si leggeva «Python» e diventava «python» alla chiusura, «```c#» passava da «c#» a «code»: uno scatto.
    it.each([
        ['```Python', 'python'],
        ['```c#', 'code'],
    ])('STREAM-RECINTO-09 «%s»: la stessa etichetta prima e dopo la chiusura', async (apertura, etichetta) => {
        const { w, giro } = monta(`Ecco.\n\n${apertura}\nx = 1\ny = 2\n`)
        await vi.waitFor(() => expect(w.find('[data-testid="talos-stream-fence"]').exists()).toBe(true), { timeout: 5000 })
        const prima = w.find('[data-testid="talos-stream-fence"] .talos-code-block-header > span').text()
        giro.testo += '```\n\nFine. Poi il resto della risposta'
        await vi.waitFor(() => expect(w.find('[data-testid="talos-stream-fence"]').exists()).toBe(false), { timeout: 5000 })
        const dopo = w.find('.talos-code-block-header > span').text()
        expect(prima).toBe(etichetta)
        expect(dopo).toBe(etichetta)
        w.unmount()
    }, 20_000)

    it('STREAM-RECINTO-07 la riga d\'apertura che arriva a pezzi: il blocco a mano nasce solo con la riga intera, e porta la lingua giusta', async () => {
        const { w, giro } = monta('Ecco la pagina.\n\n```')
        await new Promise((fatto) => setTimeout(fatto, 400))
        // «```» senza a capo non è ancora un recinto aperto: niente blocco a mano
        expect(w.find('[data-testid="talos-stream-fence"]').exists()).toBe(false)
        giro.testo += 'css\n' + riga(0) + '\n'
        await vi.waitFor(() => expect(w.find('[data-testid="talos-stream-fence"]').exists()).toBe(true), { timeout: 5000 })
        expect(w.find('[data-testid="talos-stream-fence"] .talos-code-block-header > span').text()).toBe('css')
        expect(w.find('[data-testid="talos-stream-fence"] code').classes()).toContain('language-css')
        w.unmount()
    }, 20_000)

    it('STREAM-RECINTO-06 alla chiusura il blocco a mano lascia il posto al blocco del parse: uno solo, stesso codice, il testo dopo al suo posto', async () => {
        const { w, giro } = monta()
        await vi.waitFor(() => expect(w.find('[data-testid="talos-stream-fence"]').exists()).toBe(true), { timeout: 5000 })
        giro.testo += '```\n\nFatto: due regole. Poi il resto della risposta'
        await vi.waitFor(() => expect(w.text()).toContain('Fatto: due regole.'), { timeout: 5000 })
        expect(w.find('[data-testid="talos-stream-fence"]').exists()).toBe(false)
        expect(w.findAll('pre')).toHaveLength(1)
        // il codice intero, rientri compresi, e la frase dopo il codice NON dentro il riquadro del codice
        expect(w.find('pre').element.textContent).toBe(riga(0) + '\n' + riga(1) + '\n')
        const blocchi = w.findAll('[data-testid="talos-mobile-message-content"] > .talos-message-block')
        expect(blocchi.at(-1)?.text()).toContain('Fatto: due regole.')
        w.unmount()
    }, 20_000)

    // Bozzetto dei blocchi (owner 23/10, «quattro consigliate»): la testata ha lingua · «Copia» · «⋯» anche mentre arriva, così
    // alla chiusura non spunta un pulsante nuovo; il ⋯ è spento e non apre niente finché il codice non è intero.
    it('STREAM-RECINTO-11 mentre arriva la testata ha «Copia» e «⋯» come il blocco finale, tutti e due spenti', async () => {
        const { w } = monta()
        await vi.waitFor(() => expect(w.find('[data-testid="talos-stream-fence"]').exists()).toBe(true), { timeout: 5000 })
        const pulsanti = w.findAll('[data-testid="talos-stream-fence"] .talos-code-block-header > button')
        expect(pulsanti.map((p) => p.attributes('data-talos-copy-code') !== undefined ? 'copia' : p.attributes('data-talos-code-menu') !== undefined ? 'menu' : '?')).toEqual(['copia', 'menu'])
        const altro = pulsanti[1]!
        expect((altro.element as HTMLButtonElement).disabled).toBe(true)
        expect(altro.attributes('aria-haspopup')).toBe('menu')
        expect(altro.attributes('aria-label')).toBe('More code actions')
        await altro.trigger('click')
        await new Promise((fatto) => setTimeout(fatto, 50))
        expect(document.body.querySelector('[data-testid="talos-row-actions-menu"]')).toBeNull()
        w.unmount()
    }, 20_000)

    // Revisione del Desktop 23/10: una risposta troncata col recinto mai chiuso non resta «In arrivo…» per sempre.
    it('STREAM-RECINTO-10 il giro finisce col recinto ancora aperto: il blocco a mano (spento) se ne va', async () => {
        const { w, giro } = monta()
        await vi.waitFor(() => expect(w.find('[data-testid="talos-stream-fence"]').exists()).toBe(true), { timeout: 5000 })
        giro.testo = ''
        await vi.waitFor(() => expect(w.find('[data-testid="talos-stream-fence"]').exists()).toBe(false), { timeout: 5000 })
        expect(document.body.querySelector('[data-talos-copy-code][disabled]')).toBeNull()
        // il giro dopo parte pulito: un blocco solo, col codice nuovo e non con quello del giro troncato
        giro.testo = 'Altro.\n\n```js\nuno()\n'
        // il recinto nasce col codice VUOTO e il rivelatore lo riempie nei fotogrammi dopo: il codice si aspetta, non si legge una
        // volta sola (rosso nella CI della desktop 0.1.38 il 26/10, run 40284783220: «expected '' to be 'uno()\n'»)
        await vi.waitFor(() => expect(w.find('[data-testid="talos-stream-fence"] code').element?.textContent).toBe('uno()\n'), { timeout: 5000 })
        expect(w.findAll('[data-testid="talos-stream-fence"]')).toHaveLength(1)
        w.unmount()
    }, 20_000)
})
