import { afterEach, describe, expect, it } from 'vitest'
import {
    __talosNovitaPerLeProve,
    talosCaricaNovita,
    talosChatNuova,
    talosGuardaChat,
    talosRegistroNovita,
} from '@/stores/chatNovita'
import type { TalosLocalChatSession } from '@/repositories/chatRepository'

/** A3-84 seconda parte — lo stato condiviso di «nuova risposta» (owner 25/09: «finché non la apri»). */

function risposta(id: string, alle: string): TalosLocalChatSession {
    return {
        id, title: id, surface: 'chat', mode: 'verified_execution', persistence_mode: 'persistent',
        active_model_profile_id: null, metadata: {}, created_at: alle, updated_at: alle, has_messages: true,
        last_message: { role: 'assistant', state: 'persisted', interrupted: false, model_profile_id: null, created_at: alle },
    }
}

function archivio(iniziale: string) {
    const stato = { scritto: iniziale }
    return { stato, leggi: async () => stato.scritto, scrivi: async (valore: string) => { stato.scritto = valore } }
}

afterEach(() => __talosNovitaPerLeProve(null))

describe('A3-84 · stato di «nuova risposta»', () => {
    it('NOVITA-S-01 prima del caricamento niente è nuovo; dopo, la risposta arrivata dopo la base sì', async () => {
        __talosNovitaPerLeProve(archivio(JSON.stringify({ base: '2026-09-19T08:00:00.000Z', viste: {} })))
        const chat = risposta('a', '2026-09-20T09:00:00.000Z')
        expect(talosChatNuova(chat)).toBe(false)
        await talosCaricaNovita()
        expect(talosChatNuova(chat)).toBe(true)
    })

    it('NOVITA-S-02 guardarla la segna vista e la scrive; smettere di guardarla non la riaccende', async () => {
        const finto = archivio(JSON.stringify({ base: '2026-09-19T08:00:00.000Z', viste: { vecchia: '2026-09-19T08:00:00.000Z' } }))
        __talosNovitaPerLeProve(finto)
        const chat = risposta('a', '2026-09-20T09:00:00.000Z')
        await talosGuardaChat('a', new Set(['a']))
        expect(talosChatNuova(chat)).toBe(false)
        expect(Object.keys(talosRegistroNovita.value!.viste)).toEqual(['a'])
        expect(JSON.parse(finto.stato.scritto).viste.a).toBeDefined()
        await talosGuardaChat(null)
        expect(talosChatNuova(chat)).toBe(false)
    })
})
