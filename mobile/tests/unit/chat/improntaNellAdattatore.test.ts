import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { anthropicAdapter } from '@/lib/chat/providers/anthropicAdapter'
import {
    talosDimenticaIlProfilo,
    talosUltimoProfilo,
} from '@/lib/tools/improntaDelProfilo'
import type { TalosMobileHttpTransport } from '@/lib/chat/httpTransport'
import type { TalosToolDefinition } from '@/lib/tools/registry'

/**
 * ⭐⭐ L'IMPRONTA LA CALCOLA IL CHIAMANTE, o non la calcola nessuno.
 *
 * `improntaDelProfilo.test.ts` prova la funzione. Questo prova che qualcuno la
 * USI: un modulo giusto che nessuno chiama e' un difetto che questo progetto
 * ha gia' pagato piu' volte, e un test sulla sola funzione pura resterebbe
 * verde per sempre anche dopo aver staccato la chiamata.
 *
 * ⛔ E prova la cosa per cui l'impronta esiste: che un PERMESSO cambiato — cioe'
 * un attrezzo in meno — si veda come cache persa. La cache dei prompt combacia
 * per prefisso esatto e gli attrezzi stanno davanti a tutto, quindi togliere un
 * attrezzo a conversazione aperta azzera l'intero prefisso.
 */
function trasporto() {
    const request = vi.fn().mockResolvedValue({
        status: 200,
        data: { model: 'claude-a', stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] },
    })
    return { request, transport: { request } as TalosMobileHttpTransport }
}

function attrezzo(nome: string, azione: 'read' | 'write' | 'outbound'): TalosToolDefinition<never> {
    return {
        name: nome,
        title: nome,
        description: `fa ${nome}`,
        action: azione,
        input: z.object({}) as never,
        run: async () => ({ ok: true }),
    } as unknown as TalosToolDefinition<never>
}

const MODELLO = {
    id: 'claude-a', provider: 'anthropic' as const, displayName: 'Claude A',
    chatCompatibility: 'supported' as const, inputModalities: ['text'],
    outputModalities: ['text'], supportedParameters: [],
}

async function unGiro(tools: ReadonlyArray<TalosToolDefinition<never>>) {
    const { transport } = trasporto()
    await anthropicAdapter.complete({
        model: MODELLO as never,
        turns: [{ role: 'user', content: 'ciao' }],
        effort: 'off',
        thinking: false,
        tools: tools as never,
    } as never, { apiKey: 'sentinel' }, transport)
}

beforeEach(() => {
    talosDimenticaIlProfilo()
    vi.restoreAllMocks()
})

describe('l impronta del profilo, dentro l adattatore', () => {
    it('dopo una richiesta il profilo ESISTE, e dice cosa ha visto il modello', async () => {
        expect(talosUltimoProfilo()).toBeNull()
        await unGiro([attrezzo('time_now', 'read'), attrezzo('send_message', 'outbound')])
        const profilo = talosUltimoProfilo()
        expect(profilo).not.toBeNull()
        expect(profilo?.attrezzi).toEqual(['time_now', 'send_message'])
        expect(profilo?.poteri).toEqual({ read: 1, write: 0, outbound: 1, execute: 0 })
        expect(profilo?.impronta).toMatch(/^[0-9a-f]{8}$/)
        expect(profilo?.tokenStimati).toBeGreaterThan(0)
    })

    it('⛔ un attrezzo in meno = cache persa, e viene DETTO', async () => {
        const avviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
        await unGiro([attrezzo('time_now', 'read'), attrezzo('send_message', 'outbound')])
        const primaImpronta = talosUltimoProfilo()?.impronta
        // La persona toglie il potere «outbound»: l'attrezzo sparisce dall'offerta.
        await unGiro([attrezzo('time_now', 'read')])
        expect(talosUltimoProfilo()?.impronta).not.toBe(primaImpronta)
        expect(avviso).toHaveBeenCalledTimes(1)
        expect(String(avviso.mock.calls[0][0])).toContain('send_message')
    })

    it('⛔ AL CONTRARIO: due richieste identiche NON gridano al lupo', async () => {
        /*
         * La meta' che rende il test capace di mordere. Se l'avviso partisse a
         * ogni messaggio, sarebbe rumore — e il rumore si smette di leggerlo,
         * che e' il modo piu' sicuro di non accorgersi della volta vera.
         */
        const avviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const stessi = [attrezzo('time_now', 'read'), attrezzo('send_message', 'outbound')]
        await unGiro(stessi)
        await unGiro(stessi)
        await unGiro(stessi)
        expect(avviso).not.toHaveBeenCalled()
    })
})
