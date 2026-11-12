import { describe, expect, it, vi } from 'vitest'
import { createChatStore, type ChatCompletion, type ChatStoreOptions } from '@/stores/chat'
import { createMemoryChatRepository } from '@/repositories/memoryChatRepository'
import { talosTestT } from '../../helpers/talosTestI18n'

/*
 * Telefono 0.1.48 — Tester R3 sul tablet con la 381 (voce 5) e giudice v1603: uscendo da una chat e rientrando mentre la
 * conversazione si riassume, il testo della risposta restava due volte sotto il messaggio finito per quasi tutto il riassunto
 * (97,4 s su 100,7 in orizzontale, 96,5 su 99,9 in verticale). Causa nel codice: le righe del giro (la risposta salvata e ciò che
 * il giro aggiunge dopo, la riga del riassunto compresa) aspettano in `righeDelGiro` e le porta a schermo `lasciaLaBolla` alla FINE
 * del giro, che arriva dopo `await compattaDopoLaRisposta`; nel frattempo la bolla scrive ancora la risposta. Una chat riletta dal
 * disco in quel tempo (rientro) aveva già la risposta salvata: due copie fino alla fine del riassunto.
 */
type Riassumi = NonNullable<ChatStoreOptions['riassumiConversazione']>
const LUNGA = 'con tutti i dettagli del caso, le alternative considerate e i numeri che servono. '.repeat(10)

describe('Telefono 0.1.48 — il testo non resta doppio rientrando durante il riassunto (giudice v1603)', () => {
    it('DOPPIO-01 uscita e rientro mentre si riassume: la risposta è a schermo una volta sola, e una sola alla fine', async () => {
        let n = 0
        // La risposta SCORRE nella bolla, come sul dispositivo.
        const complete: ChatCompletion = vi.fn(async (_turni, stream) => {
            const text = `risposta ${++n} ${LUNGA}`
            stream?.onChunk(text)
            return { text, finishReason: 'stop' as const }
        })
        const fermo = { attivo: false, sblocca: () => undefined as void }
        const riassumi = vi.fn<Riassumi>(async () => {
            if (fermo.attivo) await new Promise<void>((r) => { fermo.sblocca = r })
            return { ok: true as const, testo: 'RIASSUNTO' }
        })
        const finestra = { accesa: false }
        const store = createChatStore(complete, {
            repository: createMemoryChatRepository(), translate: talosTestT('en'), riassumiConversazione: riassumi,
            misuraRichiesta: async ({ turni }) => ({ token: Math.ceil(turni.reduce((s, t) => s + t.content.length, 0) / 4) + 300, misura: 'motore' as const }),
            // Oltre la soglia subito dopo la risposta: la compattazione parte prima che il giro finisca.
            finestraPerCompattazione: vi.fn(() => (finestra.accesa ? { finestraToken: 4_096, riservaUscita: 512, tettoToken: null, promptTokens: 3_400 } : null)),
        })
        await store.initialize()
        for (let i = 0; i < 10; i += 1) await store.send(`domanda ${i}`)
        const a = store.activeSession.value!.id
        await store.createSession('B')
        const b = store.activeSession.value!.id
        await store.selectSession(a)
        finestra.accesa = true
        fermo.attivo = true
        const invio = store.send('ancora una')
        await vi.waitFor(() => expect(riassumi).toHaveBeenCalledTimes(1))
        const testo = 'risposta 11 '
        const copie = () => store.messages.filter((m) => m.content.startsWith(testo)).length
            + (store.state.streamingSessionId === store.activeSession.value?.id && (store.state.streamingText ?? '').startsWith(testo) ? 1 : 0)
        expect(copie()).toBe(1)
        await store.selectSession(b)
        await store.selectSession(a)
        expect(store.activeSession.value?.id).toBe(a)
        expect(copie()).toBe(1)
        fermo.attivo = false
        fermo.sblocca()
        await invio
        expect(store.state.streamingText).toBeNull()
        expect(store.messages.filter((m) => m.content.startsWith(testo))).toHaveLength(1)
    })
})
