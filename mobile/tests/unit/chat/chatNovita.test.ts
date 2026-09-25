import { describe, expect, it } from 'vitest'
import {
    talosLeggiRegistroViste,
    talosNuovaRisposta,
    talosPotaRegistro,
    talosSegnaVista,
    type TalosArchivioViste,
    type TalosRegistroViste,
} from '@/lib/chat/chatNovita'
import type { TalosLocalChatSession } from '@/repositories/chatRepository'

/**
 * A3-84 seconda parte (owner 25/09 10:20): «nuova risposta» su una chat che ha risposto mentre eri altrove, finché
 * non la apri (Open WebUI mette i non letti in cima; il desktop TALOS lo dice per 60 s, `SEGNALE_NOVITA_MS`).
 */

function sessione(id: string, ultimo: Partial<NonNullable<TalosLocalChatSession['last_message']>> | null): TalosLocalChatSession {
    return {
        id, title: id, surface: 'chat', mode: 'verified_execution', persistence_mode: 'persistent',
        active_model_profile_id: null, metadata: {}, created_at: '2026-09-25T08:00:00.000Z',
        updated_at: '2026-09-25T08:00:00.000Z', has_messages: true,
        last_message: ultimo === null ? null : {
            role: 'assistant', state: 'persisted', interrupted: false, model_profile_id: 'glm', created_at: '2026-09-25T09:00:00.000Z',
            ...ultimo,
        },
    }
}

const REGISTRO: TalosRegistroViste = { base: '2026-09-25T07:00:00.000Z', viste: { a: '2026-09-25T08:30:00.000Z' } }

describe('A3-84 · nuova risposta', () => {
    it('NOVITA-01 una risposta arrivata DOPO l\'ultima volta che l\'hai aperta è nuova; una di prima no', () => {
        expect(talosNuovaRisposta(sessione('a', {}), REGISTRO, null)).toBe(true)
        expect(talosNuovaRisposta(sessione('a', { created_at: '2026-09-25T08:10:00.000Z' }), REGISTRO, null)).toBe(false)
    })

    it('NOVITA-02 le chat mai aperte contano dalla BASE: il primo avvio non accende tutto l\'elenco', () => {
        expect(talosNuovaRisposta(sessione('b', { created_at: '2026-09-25T06:00:00.000Z' }), REGISTRO, null)).toBe(false)
        expect(talosNuovaRisposta(sessione('b', { created_at: '2026-09-25T07:30:00.000Z' }), REGISTRO, null)).toBe(true)
    })

    it('NOVITA-03 solo una RISPOSTA completa: domanda, errore, risposta a metà o fermata non sono novità', () => {
        expect(talosNuovaRisposta(sessione('a', { role: 'user' }), REGISTRO, null)).toBe(false)
        expect(talosNuovaRisposta(sessione('a', { role: 'system', state: 'failed' }), REGISTRO, null)).toBe(false)
        expect(talosNuovaRisposta(sessione('a', { state: 'pending' }), REGISTRO, null)).toBe(false)
        expect(talosNuovaRisposta(sessione('a', { interrupted: true }), REGISTRO, null)).toBe(false)
        expect(talosNuovaRisposta(sessione('a', null), REGISTRO, null)).toBe(false)
        expect(talosNuovaRisposta(sessione('a', { created_at: null }), REGISTRO, null)).toBe(false)
    })

    it('NOVITA-04 la chat che stai guardando non è mai «nuova»', () => {
        expect(talosNuovaRisposta(sessione('a', {}), REGISTRO, 'a')).toBe(false)
    })

    it('NOVITA-05 aprirla la segna vista adesso; potare tiene solo le chat che esistono', () => {
        const dopo = talosSegnaVista(REGISTRO, 'a', new Date('2026-09-25T09:05:00.000Z'))
        expect(dopo.viste.a).toBe('2026-09-25T09:05:00.000Z')
        expect(talosNuovaRisposta(sessione('a', {}), dopo, null)).toBe(false)
        expect(REGISTRO.viste.a).toBe('2026-09-25T08:30:00.000Z')
        expect(talosPotaRegistro({ base: REGISTRO.base, viste: { a: 'x', morta: 'y' } }, new Set(['a'])).viste).toEqual({ a: 'x' })
    })
})

describe('A3-84 · il registro sul telefono', () => {
    function archivio(iniziale: string | null): TalosArchivioViste & { scritto: string | null } {
        const memoria = { scritto: iniziale }
        return {
            get scritto() { return memoria.scritto },
            leggi: async () => memoria.scritto,
            scrivi: async (valore: string) => { memoria.scritto = valore },
        }
    }

    it('NOVITA-06 la prima volta nasce la base (adesso) e si salva', async () => {
        const vuoto = archivio(null)
        const registro = await talosLeggiRegistroViste(vuoto, new Date('2026-09-25T10:00:00.000Z'))
        expect(registro).toEqual({ base: '2026-09-25T10:00:00.000Z', viste: {} })
        expect(JSON.parse(vuoto.scritto!)).toEqual(registro)
    })

    it('NOVITA-07 un registro salvato si rilegge; uno illeggibile riparte da una base nuova senza cadere', async () => {
        const buono = archivio(JSON.stringify(REGISTRO))
        expect(await talosLeggiRegistroViste(buono, new Date())).toEqual(REGISTRO)
        const rotto = archivio('{non json')
        const ripartito = await talosLeggiRegistroViste(rotto, new Date('2026-09-25T10:00:00.000Z'))
        expect(ripartito).toEqual({ base: '2026-09-25T10:00:00.000Z', viste: {} })
        const storto = archivio(JSON.stringify({ base: 3, viste: { a: 5, b: '2026-09-25T08:00:00.000Z' } }))
        expect(await talosLeggiRegistroViste(storto, new Date('2026-09-25T10:00:00.000Z')))
            .toEqual({ base: '2026-09-25T10:00:00.000Z', viste: { b: '2026-09-25T08:00:00.000Z' } })
    })

    it('NOVITA-08 se l\'archivio non risponde, niente novità inventate: la base è adesso', async () => {
        const guasto: TalosArchivioViste = { leggi: async () => { throw new Error('PREFS_DOWN') }, scrivi: async () => undefined }
        expect(await talosLeggiRegistroViste(guasto, new Date('2026-09-25T10:00:00.000Z')))
            .toEqual({ base: '2026-09-25T10:00:00.000Z', viste: {} })
    })
})
