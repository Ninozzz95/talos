// @vitest-environment jsdom
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createTalosI18n } from '@/i18n'

vi.mock('@/stores/chatController', () => ({
    useChatController: () => ({
        chat: {
            state: { sending: false, streamingText: null, streamingSessionId: null },
            activeSession: { value: { id: 's1', title: 'A' } },
        },
        toolActivity: { value: [] as Array<{ name: string; detail: string | null }> },
    }),
}))

import { conversazioneDaEventi } from '@/lib/harness/r4/eventiR4'
import { TALOS_METADATA_FIGLIE_FERMATE as CHIAVE_DEL_PEZZO } from '@/lib/harness/r4/fermaTuttoR4'
import { TALOS_METADATA_FIGLIE_FERMATE } from '@/lib/harness/r4/figlieFermateChiave'
import { TALOS_METADATA_FERMATO } from '@/lib/harness/r4/fermatoChiave'
import TalosCodiceR4RigaDiSistema from '@/components/codice/TalosCodiceR4RigaDiSistema.vue'
import TalosMobileMessageList from '@/components/chat/TalosMobileMessageList.vue'
import type { TalosMobileMessageView } from '@/components/chat/mobileChatTypes'

/*
 * ⛔ «Ferma tutto» (owner 29/10/2026; ledger `LEDGER-FERMA-TUTTO-MOBILE-2026-10-29.md`, righe 9-11; contratto §1, §5 e §6): l'evento
 * DUREVOLE `CUSTOM talos.figlie-fermate { quante, ids, da, chatFerma? }` diventa una riga `system` del Codice (come la nota dello Stop),
 * la lista la disegna con `TalosCodiceR4FiglieFermate`, uguale anche alla rigiocata.
 * Aggiunta del Desktop all'OK (29/10 notte; PC SAF-UI-03 + STOP-AG-08): tre casi, e solo l'ultimo dice «anche» —
 *   · `chatFerma: true` (a chat ferma lavoravano solo gli agenti) → «Fermati N agenti»;
 *   · `da: 'modello'` (il giro del modello non si ferma) → «Fermati N agenti» + «Fermati dal modello su richiesta»;
 *   · `da: 'persona'` senza `chatFerma` (si è fermata anche la chat) → «Fermati anche N agenti».
 */
type Composer = { locale: { value: string } }
let lingua = 'en'
beforeAll(async () => {
    const global = (await createTalosI18n()).global as unknown as Composer
    lingua = global.locale.value
    global.locale.value = 'it'
})
afterAll(async () => {
    ((await createTalosI18n()).global as unknown as Composer).locale.value = lingua
})

const evento = (value: unknown, sequenza?: number) => ({ type: 'CUSTOM', name: 'talos.figlie-fermate', value, ...(sequenza ? { _sequenza: sequenza } : {}) })
const righe = (eventi: Record<string, unknown>[]) => conversazioneDaEventi(eventi).messaggi.filter((m) => m.metadata[TALOS_METADATA_FIGLIE_FERMATE])

describe('FT-EV — l’evento durevole diventa la riga del Codice', () => {
    it('FT-EV-01 una riga `system` con la voce letta da `voceFiglieFermateR4`; la stessa alla rigiocata, una volta sola', () => {
        const eventi = [
            { type: 'RunStarted', runId: 'r1', input: { consegna: 'Prepara la release' }, _sequenza: 1 },
            evento({ quante: 3, ids: ['a', 'b', 'a1'], da: 'persona' }, 2),
            { type: 'RunError', runId: 'r1', code: 'fermato', message: '⛔ stopped on request.', _sequenza: 3 },
        ]
        const [riga, ...altre] = righe(eventi)
        expect(altre).toEqual([])
        expect([riga!.role, riga!.state, riga!.content]).toEqual(['system', 'persisted', ''])
        expect(riga!.metadata[TALOS_METADATA_FIGLIE_FERMATE]).toEqual({ quante: 3, ids: ['a', 'b', 'a1'], da: 'persona', chatFerma: false })
        expect(riga!.metadata.origine).toBe('r4')
        // e lo Stop della chat ha la sua nota, come oggi
        expect(conversazioneDaEventi(eventi).messaggi.some((m) => m.metadata[TALOS_METADATA_FERMATO])).toBe(true)
        // rigiocata: identica; lo stesso evento consegnato due volte (riapertura del flusso) non raddoppia la riga
        expect(conversazioneDaEventi(eventi).messaggi).toEqual(conversazioneDaEventi(eventi).messaggi)
        expect(righe([...eventi, evento({ quante: 3, ids: ['a', 'b', 'a1'], da: 'persona' }, 2)])).toHaveLength(1)
    })
    it('FT-EV-02 nessuna riga per zero agenti o per un evento storto; la chiave della lista è quella del pezzo', () => {
        expect(righe([evento({ quante: 0, ids: [] }, 1), evento(null, 2), evento({ quante: 'tre' }, 3)])).toEqual([])
        expect(TALOS_METADATA_FIGLIE_FERMATE).toBe(CHIAVE_DEL_PEZZO)
    })
})

describe('FT-RIGA — «anche» solo se si è fermata anche la chat (aggiunta del Desktop)', () => {
    const disegna = (value: unknown) => {
        const [riga] = righe([evento(value, 1)])
        return mount(TalosCodiceR4RigaDiSistema, { props: { message: riga! } })
    }
    it('FT-RIGA-01 `chatFerma: true` → «Fermati 2 agenti», la coda, niente «dal modello»', () => {
        const r = disegna({ quante: 2, ids: ['a', 'b'], da: 'persona', chatFerma: true })
        expect(r.get('[data-testid="talos-codice-r4-figlie-fermate"]').attributes('role')).toBe('status')
        expect(r.get('[data-parte="cosa"]').text()).toBe('Fermati 2 agenti')
        expect(r.get('[data-parte="perche"]').text()).toBe('I loro risultati restano in coda e partono col tuo prossimo messaggio')
        expect(r.find('[data-parte="da"]').exists()).toBe(false)
    })
    it('FT-RIGA-02 `da: \'modello\'` senza `chatFerma` → «Fermati 3 agenti» e «Fermati dal modello su richiesta»', () => {
        const r = disegna({ quante: 3, ids: ['a', 'b', 'c'], da: 'modello' })
        expect(r.get('[data-parte="cosa"]').text()).toBe('Fermati 3 agenti')
        expect(r.get('[data-parte="da"]').text()).toBe('Fermati dal modello su richiesta')
    })
    it('FT-RIGA-03 `da: \'persona\'` senza `chatFerma` (si è fermata anche la chat) → «Fermati anche 3 agenti»', () => {
        const r = disegna({ quante: 3, ids: ['a', 'b', 'c'], da: 'persona' })
        expect(r.get('[data-parte="cosa"]').text()).toBe('Fermati anche 3 agenti')
        expect(r.find('[data-parte="da"]').exists()).toBe(false)
    })
})

describe('FT-LISTA — la lista della chat la disegna come riga del Codice', () => {
    it('FT-LISTA-01 la riga passa dal filtro `delCodiceR4` alla riga del Codice, non alla riga di stato generica', async () => {
        const [riga] = righe([evento({ quante: 2, ids: ['a', 'b'], da: 'persona', chatFerma: true }, 1)])
        const utente: TalosMobileMessageView = { id: 'u1', role: 'user', content: 'Ciao', state: 'persisted', created_at: '2026-10-29T20:00:00.000Z', model_profile_id: null, run_id: null, metadata: {} }
        const lista = mount(TalosMobileMessageList, { props: { messages: [utente, riga!], sending: false } })
        await flushPromises(); await vi.dynamicImportSettled(); await flushPromises()
        expect(lista.get('[data-testid="talos-codice-r4-figlie-fermate"] [data-parte="cosa"]').text()).toBe('Fermati 2 agenti')
    })
})
