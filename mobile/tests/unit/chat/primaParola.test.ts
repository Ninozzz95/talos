// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { computed, nextTick, reactive } from 'vue'

/**
 * PP-01..05 — R4 delle righe in corso (owner 27/10/2026 «ogni riga in corso deve essere animata e con un counter di secondi…
 * nulla deve fare sembrare la ui bloccata»; bozzetto approvato il 28/10, scene 3a/6/7). Prima della prima parola la coda mostrava
 * solo l'orb: ora dice cosa succede coi secondi dall'ora dell'evento. «Messaggio inviato, aspetto il computer» fino al via del giro;
 * poi la scala del desktop a 0, 5 e 12 s (`legacy/app.js:14031`, frasi `wait.*`); mentre il testo scorre, «Sta scrivendo · Ns»
 * accanto al nome. Una sorgente senza `attesa` resta com'era.
 */

const mock = vi.hoisted(() => ({ state: null as unknown as Record<string, unknown> }))
vi.mock('@/stores/chatController', () => ({
    useChatController: () => ({
        chat: { state: mock.state, activeSession: { value: { id: 'chat-1', title: 'A' } } },
        toolActivity: { value: [] },
    }),
}))
vi.mock('@/stores/settings', () => ({
    useSettingsStore: () => ({ state: { shell: { streaming_animation: 'fade' } } }),
}))

import TalosMobileStreamingReply from '@/components/chat/TalosMobileStreamingReply.vue'
import TalosRigaInCorso from '@/components/chat/TalosRigaInCorso.vue'
import { TALOS_SORGENTE_STREAMING, type TalosSorgenteStreaming } from '@/lib/chat/sorgenteStreaming'

const montati: { unmount(): void }[] = []
type Attesa = NonNullable<NonNullable<TalosSorgenteStreaming['attesa']>['value']>
function monta(attesa: Attesa | null, testo = '') {
    mock.state = reactive({ sending: false, streamingText: null, streamingReasoning: null, streamingConfini: null, streamingSessionId: null })
    const stato = reactive({ attesa, testo })
    const sorgente: TalosSorgenteStreaming = {
        sending: computed(() => true),
        testo: computed(() => stato.testo),
        ragionamento: computed(() => ''),
        confini: computed(() => []),
        attivi: computed(() => []),
        attesa: computed(() => stato.attesa),
    }
    const w = mount(TalosMobileStreamingReply, { global: { provide: { [TALOS_SORGENTE_STREAMING as symbol]: sorgente } } })
    montati.push(w)
    return { w, stato }
}

beforeEach(() => { vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] }) })
// l'orologio della riga è uno solo per tutta l'app (`useTalosTrascorso`): ogni prova smonta, così il battito riparte col suo orologio
afterEach(() => { for (const w of montati.splice(0)) w.unmount(); vi.useRealTimers() })

describe('PP la prima parola e il testo che scorre', () => {
    it('PP-01 messaggio partito verso il computer: «Message sent, waiting for the computer» coi secondi dal tocco', () => {
        const dal = Date.now()
        const { w } = monta({ fase: 'inviato', dal, chi: 'computer' })
        const riga = w.getComponent(TalosRigaInCorso)
        expect(riga.props('testo')).toBe('Message sent, waiting for the computer')
        // owner 28/10: l'orb è l'unico segno animato dell'attesa (regola del 13/09), la riga porta solo frase e secondi
        expect(riga.props('segno')).toBe('nessuno')
        expect(riga.find('.talos-line-loader-node').exists()).toBe(false)
        expect(riga.props('inizio')).toBe(dal)
    })

    it('PP-02 giro partito: la scala del desktop a 0, 5 e 12 s dall\'ora del giro', async () => {
        const { w } = monta({ fase: 'giro', dal: Date.now(), chi: 'computer' })
        const testo = () => w.getComponent(TalosRigaInCorso).props('testo')
        expect(testo()).toBe('TALOS is processing the response…')
        vi.advanceTimersByTime(5_000); await nextTick()
        expect(testo()).toBe('The model is still working on it…')
        vi.advanceTimersByTime(7_000); await nextTick()
        expect(testo()).toBe('It is taking longer than usual — hold on…')
    })

    it('PP-03 ATTESA-DA-CAPO: rimontata a 20 s dal giro, la scala non riparte', () => {
        const dal = Date.now() - 20_000
        const { w } = monta({ fase: 'giro', dal, chi: null })
        const riga = w.getComponent(TalosRigaInCorso)
        expect(riga.props('testo')).toBe('It is taking longer than usual — hold on…')
        expect(riga.props('inizio')).toBe(dal)
    })

    it('PP-04 il testo scorre: niente più riga d\'attesa, «Writing · Ns» accanto al nome dall\'ora del giro', async () => {
        const dal = Date.now() - 18_000
        const { w, stato } = monta({ fase: 'giro', dal, chi: null })
        stato.testo = 'Ecco la risposta che arriva'
        await vi.advanceTimersByTimeAsync(1_000)
        await nextTick()
        expect(w.findComponent(TalosRigaInCorso).exists()).toBe(false)
        expect(w.get('[data-testid="talos-message-meta"]').text()).toBe('Writing · 19s')
    })

    it('PP-05 senza `attesa` (una sorgente di prima): solo l\'orb, come oggi; in locale «Message sent»', () => {
        const { w } = monta(null)
        expect(w.findComponent(TalosRigaInCorso).exists()).toBe(false)
        expect(w.find('[data-testid="talos-mobile-typing"]').exists()).toBe(true)
        const locale = monta({ fase: 'inviato', dal: Date.now(), chi: null })
        expect(locale.w.getComponent(TalosRigaInCorso).props('testo')).toBe('Message sent')
    })
})
