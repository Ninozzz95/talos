import { afterEach, describe, expect, it } from 'vitest'
import { effectScope, nextTick } from 'vue'
import { useConversazioneR4 } from '@/composables/useConversazioneR4'
import type { TalosR4ClientePonte } from '@/lib/harness/r4/clienteR4'

/**
 * ⛔ Difetto dal vivo (owner 27/10/2026, Server-PC «ciao-2», OnePlus13 collegato): sul PC il giro finisce con la carta d'errore del
 * piano ChatGPT, «da riprendere», «2 in coda», e il PC resta fermo; DENTRO la sessione sul dispositivo il giro sembra ancora al
 * lavoro (pulsante ferma / riga viva). L'ordine del caso dell'owner (dal Desktop): «Continua» dal dispositivo, il riassunto del
 * contesto che parte, Skip dal PC, la sua fine «saltato», RunError CHATGPT_ERRORE, la coda con l'avviso di un comando in sottofondo
 * finito più un messaggio della persona. Forme degli eventi: `agent-service.mjs:1418-1460` @ r4 6a4fc5e2b (compattazione) e il
 * registro della sessione e7ce3dea sulla 4177 (RunStarted, coda con la voce `origine:'sfondo'`).
 */
type Ascoltatore = (dati: Record<string, unknown>) => void
function clienteFinto() {
    const ascoltatori: Record<string, Ascoltatore[]> = {}
    const flussi: { id: string; percorso: string }[] = []
    const ponte: TalosR4ClientePonte = {
        richiesta: async () => ({ stato: 200, corpo: '{"ok":true,"data":{"sessionId":"s1"}}' }),
        apriFlusso: async (f) => { flussi.push(f) },
        chiudiFlusso: async () => {},
        addListener: async (evento, ascoltatore) => {
            ;(ascoltatori[evento] ??= []).push(ascoltatore)
            return { remove: async () => { ascoltatori[evento] = (ascoltatori[evento] ?? []).filter((a) => a !== ascoltatore) } }
        },
    }
    const pezzo = (testo: string) => { for (const a of [...(ascoltatori['r4Pezzo'] ?? [])]) a({ id: flussi.at(-1)!.id, testo }) }
    return { ponte, pezzo }
}
const aspetta = async () => {
    for (let i = 0; i < 5; i++) {
        await new Promise((fatto) => setTimeout(fatto, 0))
        await nextTick()
    }
}
let scope = effectScope()
afterEach(() => { scope.stop(); scope = effectScope() })
const monta = (opzioni: Parameters<typeof useConversazioneR4>[0]) => scope.run(() => useConversazioneR4(opzioni))!

const sse = (evento: Record<string, unknown>) => `data: ${JSON.stringify(evento)}\n\n`
const AT = '2026-10-27T17:29:40.000Z'
const avvio = sse({ type: 'RunStarted', threadId: 't1', runId: 'r2', input: { consegna: 'Continua', seguito: true }, timestamp: 1793122180000, _sequenza: 40 })
const inizio = sse({ type: 'CUSTOM', name: 'talos.compattazione', value: { fase: 'inizio', giro: 1, tokenPrima: 230000, soglia: 196608, motivo: null }, _sequenza: 41 })
const progresso = sse({ type: 'CUSTOM', name: 'talos.compattazione-progresso', value: { fase: 'riassunto', motivo: null, trascorsoMs: 4000 } })
const fineSaltata = sse({ type: 'CUSTOM', name: 'talos.compattazione', value: { fase: 'fine', giro: 1, compattato: true, tokenPrima: 230000, tokenDopo: 41000, misura: 'stimato', coveredThrough: 30, at: AT, modello: null, motivo: null, ripiego: true, ragione: 'saltato' }, _sequenza: 42 })
const guasto = sse({ type: 'RunError', message: 'The ChatGPT plan did not complete the answer.', code: 'CHATGPT_ERRORE', timestamp: 1793122240000, _sequenza: 43 })
const annullata = sse({ type: 'CUSTOM', name: 'talos.compattazione', value: { fase: 'annullata', at: AT, coveredThrough: 30, motivo: 'giro-fallito' }, _sequenza: 44 })
const coda = sse({ type: 'CUSTOM', name: 'talos.coda', value: { voci: [
    { id: 'v1', testo: 'The background command `npm run build` completed (exit code 0). Its full output is in C:\\p\\.talos\\processi-sfondo\\c1.log.', origine: 'sfondo', toolCallId: 'c1',
        sfondo: { comando: 'npm run build', esito: 'riuscito', codice: 0, segnale: null, file: 'C:\\p\\.talos\\processi-sfondo\\c1.log' } },
    { id: 'v2', testo: 'Poi aggiorna il README', immagini: 0 },
], inPausa: false } })
const fineStoria = sse({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: {} })

function fermo(conv: ReturnType<typeof monta>): void {
    expect(conv.inCorso.value).toBeNull()
    expect(conv.inviando.value).toBe(false)
    expect(conv.sorgente.sending.value).toBe(false)
    expect(conv.rigaViva.value).toBeNull()
    expect(conv.coda.value.voci).toHaveLength(2)
}

describe('il caso dell’owner: errore del piano ChatGPT dopo un riassunto saltato, 2 in coda', () => {
    it('ALD-01 dal vivo, giro partito dal dispositivo («Continua»): dopo l’errore il dispositivo è fermo, senza riga viva', async () => {
        const c = clienteFinto()
        const conv = monta({ cliente: c.ponte, cartella: '/w', sessioneId: 's1', attesaRiapertura: () => 0 })
        await conv.apri()
        c.pezzo(fineStoria)
        expect(await conv.invia('Continua')).toBe(true)
        c.pezzo(avvio)
        c.pezzo(inizio)
        expect(conv.rigaViva.value).not.toBeNull()
        c.pezzo(progresso)
        c.pezzo(fineSaltata)
        c.pezzo(guasto)
        c.pezzo(annullata)
        c.pezzo(coda)
        await aspetta()
        fermo(conv)
    })

    it('ALD-02 lo stesso ordine tutto in un pezzo', async () => {
        const c = clienteFinto()
        const conv = monta({ cliente: c.ponte, cartella: '/w', sessioneId: 's1', attesaRiapertura: () => 0 })
        await conv.apri()
        c.pezzo(fineStoria)
        expect(await conv.invia('Continua')).toBe(true)
        c.pezzo(avvio + inizio + progresso + fineSaltata + guasto + annullata + coda)
        await aspetta()
        fermo(conv)
    })

    it('ALD-03 riaperta dopo: la storia lo racconta, poi la coda', async () => {
        const c = clienteFinto()
        const conv = monta({ cliente: c.ponte, cartella: '/w', sessioneId: 's1', attesaRiapertura: () => 0 })
        await conv.apri()
        c.pezzo(avvio + inizio + fineSaltata + guasto + annullata + fineStoria + coda)
        await aspetta()
        fermo(conv)
    })

    it('ALD-04 il progresso effimero arrivato DOPO l’errore non riaccende niente', async () => {
        const c = clienteFinto()
        const conv = monta({ cliente: c.ponte, cartella: '/w', sessioneId: 's1', attesaRiapertura: () => 0 })
        await conv.apri()
        c.pezzo(fineStoria + avvio + inizio + guasto + progresso + coda)
        await aspetta()
        fermo(conv)
    })
})
