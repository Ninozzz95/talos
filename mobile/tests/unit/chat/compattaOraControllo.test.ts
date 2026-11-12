// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

vi.mock('@/stores/chatController', () => ({
    useChatController: () => ({
        chat: {
            state: { sending: false, streamingText: null, streamingSessionId: null },
            activeSession: { value: { id: 's1', title: 'A' } },
        },
        toolActivity: { value: [] as Array<{ name: string; detail: string | null }> },
    }),
}))

import { createChatStore, type ChatCompletion, type ChatStoreOptions } from '@/stores/chat'
import { createMemoryChatRepository } from '@/repositories/memoryChatRepository'
import TalosMobileMessageList from '@/components/chat/TalosMobileMessageList.vue'
import { talosTestT } from '../../helpers/talosTestI18n'

/*
 * Telefono 0.1.48, giudice v1585 — misura del Tester sulla 381: con 6 scambi «Compact now» risponde «Nothing to gain» dopo
 * 9,9-11,0 s senza chiamare il modello, e per tutto quel tempo lo schermo resta vuoto. Regola dell'owner del 01/11: ogni cosa
 * che può essere pesante ha il suo indicatore. Al tocco compare SUBITO «Checking…» / «Controllo…» e resta fino all'esito;
 * se il riassunto parte, la riga diventa quella di sempre («Summarizing the conversation…»).
 */
type Misura = NonNullable<ChatStoreOptions['misuraRichiesta']>
const LUNGA = 'con tutti i dettagli del caso, le alternative considerate e i numeri che servono. '.repeat(20)

async function chatDiSeiScambi() {
    let n = 0
    const complete: ChatCompletion = vi.fn(async () => ({ text: `risposta ${++n} ${LUNGA}`, finishReason: 'stop' as const }))
    const lenta = { accesa: false, ferma: false, sblocca: () => undefined as void }
    const misura = vi.fn<Misura>(async ({ turni }) => {
        if (lenta.accesa) await new Promise<void>((r) => { lenta.ferma = true; lenta.sblocca = r })
        return { token: Math.ceil(turni.reduce((s, t) => s + t.content.length, 0) / 4) + 500, misura: 'motore' as const }
    })
    const store = createChatStore(complete, {
        repository: createMemoryChatRepository(), translate: talosTestT('en'), misuraRichiesta: misura,
        riassumiConversazione: async () => ({ ok: true as const, testo: 'RIASSUNTO' }),
    })
    await store.initialize()
    for (let i = 0; i < 6; i += 1) await store.send(`domanda ${i}`)
    return { store, lenta, sessione: store.activeSession.value!.id }
}

describe('Telefono 0.1.48 — «Compatta ora» dice subito che sta controllando (giudice v1585)', () => {
    it('COMP-CTRL-01 al tocco lo store segna SUBITO il controllo, che resta fino all\'esito e poi si spegne', async () => {
        const { store, lenta, sessione } = await chatDiSeiScambi()
        expect(store.state.compattazioneControllo).toEqual([])
        lenta.accesa = true
        const esito = store.compattaOra(sessione)
        expect(store.state.compattazioneControllo).toEqual([sessione])
        await vi.waitFor(() => expect(lenta.ferma).toBe(true))
        await flushPromises()
        expect(store.state.compattazioneControllo).toEqual([sessione])
        // un secondo tocco mentre controlla non parte una seconda volta
        expect(await store.compattaOra(sessione)).toEqual({ ok: false, motivo: 'occupato' })
        lenta.accesa = false
        lenta.sblocca()
        await esito
        expect(store.state.compattazioneControllo).toEqual([])
    })

    it('COMP-CTRL-02 anche quando il controllo fallisce l\'indicatore si spegne', async () => {
        const { store, sessione } = await chatDiSeiScambi()
        const esito = store.compattaOra(`${sessione}-che-non-esiste`)
        expect(await esito).toEqual({ ok: false, motivo: 'chat-inesistente' })
        expect(store.state.compattazioneControllo).toEqual([])
    })

    it('COMP-CTRL-03 la lista mostra «Checking…» durante il controllo e «Summarizing…» durante il riassunto', async () => {
        const lista = mount(TalosMobileMessageList, { props: { messages: [], sending: false } })
        await lista.setProps({ compattazioneControllo: true })
        await flushPromises(); await vi.dynamicImportSettled(); await flushPromises()
        const riga = lista.get('[data-testid="talos-compaction-progress"]')
        expect(riga.attributes('data-phase')).toBe('checking')
        expect(riga.text()).toContain('Checking…')
        expect(riga.text()).not.toContain('Summarizing')
        await lista.setProps({ compattazioneControllo: false, compattazioneInCorso: true })
        await flushPromises(); await vi.dynamicImportSettled(); await flushPromises()
        expect(lista.get('[data-testid="talos-compaction-progress"]').attributes('data-phase')).toBe('summarizing')
        await lista.setProps({ compattazioneInCorso: false })
        await flushPromises()
        expect(lista.find('[data-testid="talos-compaction-progress"]').exists()).toBe(false)
    })

    it('COMP-CTRL-04 le parole in inglese e in italiano, e lo schermo della chat porta il controllo alla lista', () => {
        expect(talosTestT('en')('chat.compaction.checking')).toBe('Checking…')
        expect(talosTestT('it')('chat.compaction.checking')).toBe('Controllo…')
        const schermo = readFileSync(resolve(process.cwd(), 'src/screens/ChatScreen.vue'), 'utf8')
        expect(schermo).toContain(`:compattazione-controllo="chat.state.compattazioneControllo.includes(chat.activeSession.value?.id ?? '')"`)
    })

    /*
     * Revisore A, ripasso v1589 punto 8 (giudice v1598 d): il blocco valeva per tutta l'app. Durante il controllo della chat A,
     * «Compatta ora» su B rispondeva «occupato» con l'avviso falso «Wait for TALOS to finish the answer», e B non mostrava niente.
     * «Occupato» è per CHAT: B parte e mostra il suo «Controllo…»; un secondo tocco su A resta «occupato».
     */
    it('COMP-CTRL-05 durante il controllo di A, «Compatta ora» su B funziona e B mostra il suo «Controllo…»', async () => {
        const { store, lenta, sessione: a } = await chatDiSeiScambi()
        await store.createSession('B')
        for (let i = 0; i < 6; i += 1) await store.send(`b ${i}`)
        const b = store.activeSession.value!.id
        expect(b).not.toBe(a)
        lenta.accesa = true
        const pa = store.compattaOra(a)
        await vi.waitFor(() => expect(lenta.ferma).toBe(true))
        lenta.accesa = false
        const sbloccaA = lenta.sblocca
        const pb = store.compattaOra(b)
        expect(store.state.compattazioneControllo).toEqual([a, b])
        expect(await store.compattaOra(a)).toEqual({ ok: false, motivo: 'occupato' })
        const eb = await pb
        expect(eb).not.toEqual({ ok: false, motivo: 'occupato' })
        expect(store.state.compattazioneControllo).toEqual([a])
        sbloccaA()
        await pa
        expect(store.state.compattazioneControllo).toEqual([])
    })

    /* Revisore A, ripasso v1589 punto 2 (P2): il controllo che GETTA (disco che fallisce) spegne lo stesso «Controllo…». */
    it('COMP-CTRL-06 un controllo che getta spegne l\'indicatore e «Compatta ora» resta usabile', async () => {
        let getta = false
        const base = createMemoryChatRepository()
        const repository = new Proxy(base, {
            get(t, k) {
                const v = Reflect.get(t, k)
                if (k === 'listMessages') {
                    return async (...a: unknown[]) => {
                        if (getta) throw new Error('SQLITE_IOERR')
                        return (v as (...x: unknown[]) => unknown).apply(t, a)
                    }
                }
                return typeof v === 'function' ? v.bind(t) : v
            },
        })
        const store = createChatStore(vi.fn<ChatCompletion>(async () => ({ text: `risposta ${LUNGA}`, finishReason: 'stop' as const })), {
            repository, translate: talosTestT('en'),
            misuraRichiesta: async ({ turni }) => ({ token: 500 + Math.ceil(turni.reduce((n, t) => n + t.content.length, 0) / 4), misura: 'motore' as const }),
            riassumiConversazione: async () => ({ ok: true as const, testo: 'R' }),
        })
        await store.initialize()
        for (let i = 0; i < 6; i += 1) await store.send(`a ${i}`)
        const a = store.activeSession.value!.id
        getta = true
        await expect(store.compattaOra(a)).rejects.toThrow('SQLITE_IOERR')
        expect(store.state.compattazioneControllo).toEqual([])
        getta = false
        expect(await store.compattaOra(a)).not.toEqual({ ok: false, motivo: 'occupato' })
    })

    /*
     * Con l'«occupato» per chat due controlli possono arrivare al riassunto insieme: il riassunto resta uno alla volta (la barra di
     * A non la spegne B). B controlla mentre A riassume: quando B arriva al riassunto risponde «occupato» e A finisce col suo.
     */
    it('COMP-CTRL-07 due controlli insieme: il secondo che arriva al riassunto mentre il primo riassume è «occupato»', async () => {
        const ferme = new Map<string, () => void>()
        let fermaMisuraDi: string | null = null
        let fermaRiassunto = false
        let sbloccaRiassunto: () => void = () => undefined
        const misura = vi.fn<Misura>(async ({ sessionId, turni }) => {
            if (sessionId === fermaMisuraDi) await new Promise<void>((r) => { ferme.set(sessionId, r) })
            return { token: Math.ceil(turni.reduce((s, t) => s + t.content.length, 0) / 4) + 500, misura: 'motore' as const }
        })
        const riassumi = vi.fn(async () => {
            if (fermaRiassunto) await new Promise<void>((r) => { sbloccaRiassunto = r })
            return { ok: true as const, testo: 'RIASSUNTO' }
        })
        let n = 0
        const store = createChatStore(vi.fn<ChatCompletion>(async () => ({ text: `risposta ${++n} ${LUNGA}`, finishReason: 'stop' as const })), {
            repository: createMemoryChatRepository(), translate: talosTestT('en'), misuraRichiesta: misura, riassumiConversazione: riassumi,
        })
        await store.initialize()
        for (let i = 0; i < 6; i += 1) await store.send(`a ${i}`)
        const a = store.activeSession.value!.id
        await store.createSession('B')
        for (let i = 0; i < 6; i += 1) await store.send(`b ${i}`)
        const b = store.activeSession.value!.id
        fermaMisuraDi = b
        const pb = store.compattaOra(b)
        await vi.waitFor(() => expect(ferme.has(b)).toBe(true))
        fermaMisuraDi = null
        fermaRiassunto = true
        const pa = store.compattaOra(a)
        await vi.waitFor(() => expect(store.state.compattazioneInCorso).toBe(a))
        ferme.get(b)!()
        expect(await pb).toEqual({ ok: false, motivo: 'occupato' })
        expect(store.state.compattazioneInCorso).toBe(a)
        sbloccaRiassunto()
        expect(await pa).toMatchObject({ ok: true, compattato: true })
        expect(riassumi).toHaveBeenCalledTimes(1)
        expect(store.state.compattazioneControllo).toEqual([])
    })
})
