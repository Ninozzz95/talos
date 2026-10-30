import { afterEach, describe, expect, it } from 'vitest'
import { effectScope, nextTick } from 'vue'
import { useConversazioneR4 } from '@/composables/useConversazioneR4'
import { applicaEventoR4, creaConversazioneR4 } from '@/lib/harness/r4/eventiR4'
import type { TalosR4ClientePonte } from '@/lib/harness/r4/clienteR4'

/**
 * ⛔ Contratto col Desktop (27/10/2026, cura del «ancora al lavoro»): ogni 15 s il PC manda su ogni iscrizione remota viva
 * `{type:'CUSTOM', name:'talos.battito', value:{}}` SENZA `_sequenza` (mai salvato, mai rigiocato). Il ponte lo passa come
 * `data: <JSON>` senza riga `id:` (`ponteRemotoR4.ts`). Deve passare in silenzio anche sulle versioni già pubblicate: nessuna riga,
 * nessun guasto, `ultimaSequenza` ferma, il giro com'era.
 */
type Ascoltatore = (dati: Record<string, unknown>) => void
function clienteFinto() {
    const ascoltatori: Record<string, Ascoltatore[]> = {}
    const flussi: { id: string; percorso: string }[] = []
    const ponte: TalosR4ClientePonte = {
        richiesta: async () => ({ stato: 200, corpo: '{"ok":true,"data":{}}' }),
        apriFlusso: async (f) => { flussi.push(f) },
        chiudiFlusso: async () => {},
        addListener: async (evento, ascoltatore) => {
            ;(ascoltatori[evento] ??= []).push(ascoltatore)
            return { remove: async () => { ascoltatori[evento] = (ascoltatori[evento] ?? []).filter((a) => a !== ascoltatore) } }
        },
    }
    const pezzo = (testo: string) => { for (const a of [...(ascoltatori['r4Pezzo'] ?? [])]) a({ id: flussi.at(-1)!.id, testo }) }
    return { ponte, pezzo, flussi }
}
let scope = effectScope()
afterEach(() => { scope.stop(); scope = effectScope() })
const monta = (opzioni: Parameters<typeof useConversazioneR4>[0]) => scope.run(() => useConversazioneR4(opzioni))!
const aspetta = async () => {
    for (let i = 0; i < 5; i++) {
        await new Promise((fatto) => setTimeout(fatto, 0))
        await nextTick()
    }
}

const BATTITO = { type: 'CUSTOM', name: 'talos.battito', value: {} }
const dalPonte = (evento: Record<string, unknown>) => `data: ${JSON.stringify(evento)}\n\n`
const avvio = { type: 'RunStarted', threadId: 't1', runId: 'r1', input: { consegna: 'Ciao' }, timestamp: 1793122180000, _sequenza: 7 }
const testo = [
    { type: 'TextMessageStart', messageId: 'm1', role: 'assistant', _sequenza: 8 },
    { type: 'TextMessageContent', messageId: 'm1', delta: 'Lavoro', _sequenza: 9 },
]

describe('il battito del PC (talos.battito) passa in silenzio', () => {
    it('BAT-01 nel riduttore: lo stesso stato, a giro vivo e a giro fermo', () => {
        let c = creaConversazioneR4()
        expect(applicaEventoR4(c, BATTITO)).toEqual(c)
        c = applicaEventoR4(c, avvio)
        for (const e of testo) c = applicaEventoR4(c, e)
        expect(applicaEventoR4(c, BATTITO)).toEqual(c)
    })

    it('BAT-02 dal ponte, a giro vivo: nessuna riga, nessun errore, la sequenza ferma, il giro continua', async () => {
        const c = clienteFinto()
        const conv = monta({ cliente: c.ponte, cartella: '/w', sessioneId: 's1', attesaRiapertura: () => 0 })
        await conv.apri()
        c.pezzo(dalPonte({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: {} }) + dalPonte(avvio) + testo.map(dalPonte).join(''))
        await aspetta()
        const prima = { messaggi: conv.messaggi.value.length, sequenza: conv.ultimaSequenza.value, testo: conv.sorgente.testo.value }
        c.pezzo(dalPonte(BATTITO))
        c.pezzo(dalPonte(BATTITO))
        await aspetta()
        expect(conv.messaggi.value.length).toBe(prima.messaggi)
        expect(conv.ultimaSequenza.value).toBe(9)
        expect(conv.ultimaSequenza.value).toBe(prima.sequenza)
        expect(conv.sorgente.testo.value).toBe(prima.testo)
        expect(conv.errore.value).toBeNull()
        expect(conv.sorgente.sending.value).toBe(true)
        expect(c.flussi).toHaveLength(1)
    })

    it('BAT-03 dal ponte, a giro fermo: nessuna riga, nessun «al lavoro»', async () => {
        const c = clienteFinto()
        const conv = monta({ cliente: c.ponte, cartella: '/w', sessioneId: 's1', attesaRiapertura: () => 0 })
        await conv.apri()
        c.pezzo(dalPonte({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: {} }))
        await aspetta()
        const messaggi = conv.messaggi.value.length
        c.pezzo(dalPonte(BATTITO))
        await aspetta()
        expect(conv.messaggi.value.length).toBe(messaggi)
        expect(conv.ultimaSequenza.value).toBeNull()
        expect(conv.sorgente.sending.value).toBe(false)
        expect(conv.errore.value).toBeNull()
    })
})
