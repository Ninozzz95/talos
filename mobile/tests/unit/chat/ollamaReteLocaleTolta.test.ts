import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * OLLAMA-RETE-01..07 (ASS-148, parte Ollama; owner 29/10 «Frase + pulsante», OK del Desktop con due allargamenti). Su Android 17, se la
 * persona toglie «Rete locale», Ollama sul server di casa fallisce con un errore di rete qualunque. Ora, se l'errore è di RETE (mai una
 * risposta HTTP arrivata), l'indirizzo è della rete di casa e il permesso è davvero tolto, la chat dice la causa vera e offre il pulsante.
 */
const finto = vi.hoisted(() => ({ bloccata: true, chiamate: 0 }))
vi.mock('@/lib/network/reteLocaleBloccata', () => ({
    talosReteLocaleBloccata: async () => { finto.chiamate += 1; return finto.bloccata },
}))

import { ollamaAdapter } from '@/lib/chat/providers/ollamaAdapter'
import { talosHostDellaReteDiCasa } from '@/lib/network/reteDiCasa'
import { talosChatFaultText } from '@/lib/chat/erroreLeggibile'
import { TALOS_EN_MESSAGES } from '@/i18n/locales/en'
import { TALOS_IT_MESSAGES } from '@/i18n/locales/it'

const reteGiu = { request: vi.fn(async () => { throw new Error('Network request failed') }) }
const risposta500 = { request: vi.fn(async () => ({ status: 500, data: { error: 'boom' } })) }

beforeEach(() => { finto.bloccata = true; finto.chiamate = 0 })

describe('OLLAMA-RETE la rete locale tolta, vista dalla chat', () => {
    it('OLLAMA-RETE-01 rete di casa: privati IPv4, 169.254/16, fc00::/7, fe80::/10 e i nomi .local; mai il loopback né internet', () => {
        for (const h of ['192.168.1.10', '10.0.0.4', '172.20.1.1', '169.254.3.4', 'fd12:3456::1', 'fe80::1', '[fe80::1]', 'ollama.local', 'NAS.LOCAL', '::ffff:192.168.1.5', '[::ffff:10.0.0.4]']) {
            expect(talosHostDellaReteDiCasa(h), h).toBe(true)
        }
        for (const h of ['127.0.0.1', 'localhost', '::1', '8.8.8.8', 'api.ollama.com', 'local', 'nas.lan', '172.32.0.1', '::ffff:8.8.8.8', '::ffff:127.0.0.1']) {
            expect(talosHostDellaReteDiCasa(h), h).toBe(false)
        }
    })

    it('OLLAMA-RETE-02 errore di rete + rete di casa + permesso tolto ⇒ il codice della causa vera', async () => {
        const errore = await ollamaAdapter.listModels({ endpoint: 'http://192.168.1.10:11434' }, reteGiu).catch((e: unknown) => e) as Error & { cause?: Error }
        expect(errore.message).toBe('TALOS_PROVIDER_LOCAL_NETWORK_BLOCKED')
        // la causa vera resta attaccata (nota del Desktop)
        expect(errore.cause?.message).toBe('Network request failed')
    })

    it('OLLAMA-RETE-03 col permesso presente l\'errore resta quello di prima', async () => {
        finto.bloccata = false
        await expect(ollamaAdapter.listModels({ endpoint: 'http://192.168.1.10:11434' }, reteGiu)).rejects.toThrow('Network request failed')
    })

    it('OLLAMA-RETE-04 loopback e indirizzi fuori casa non chiedono nemmeno il permesso', async () => {
        await expect(ollamaAdapter.listModels({ endpoint: 'http://127.0.0.1:11434' }, reteGiu)).rejects.toThrow('Network request failed')
        await expect(ollamaAdapter.listModels({ endpoint: 'https://ollama.example.com' }, reteGiu)).rejects.toThrow('Network request failed')
        expect(finto.chiamate).toBe(0)
    })

    it('OLLAMA-RETE-05 una risposta HTTP arrivata vuol dire che la rete funziona: niente conversione', async () => {
        await expect(ollamaAdapter.listModels({ endpoint: 'http://192.168.1.10:11434' }, risposta500)).rejects.not.toThrow('TALOS_PROVIDER_LOCAL_NETWORK_BLOCKED')
        expect(finto.chiamate).toBe(0)
    })

    it('OLLAMA-RETE-06 la chat dice la causa con una frase, in italiano e in inglese', () => {
        const t = (k: string) => k
        const testo = talosChatFaultText({ message: 'TALOS_PROVIDER_LOCAL_NETWORK_BLOCKED', layer: 'provider', provider: 'ollama', nextAction: null } as never, t)
        expect(testo.message).toBe('chat.faultLocalNetworkBlocked')
        expect(testo.nextAction).toBe('chat.faultLocalNetworkBlockedNext')
        const it_ = TALOS_IT_MESSAGES.chat as Record<string, string>
        const en = TALOS_EN_MESSAGES.chat as Record<string, string>
        expect(it_.faultLocalNetworkBlocked).toMatch(/Rete locale/u)
        expect(en.faultLocalNetworkBlocked).toMatch(/Local network/u)
        expect(it_.openAppPermissions && en.openAppPermissions).toBeTruthy()
    })

    it('OLLAMA-RETE-07 la scheda d\'errore ha il pulsante «Apri i permessi» solo per questo codice', () => {
        const s = readFileSync(resolve(__dirname, '../../../src/components/chat/TalosMobileStatusMessage.vue'), 'utf8')
        const b = readFileSync(resolve(__dirname, '../../../src/components/chat/TalosMobileFaultOpenPermissions.vue'), 'utf8')
        expect(b).toMatch(/data-testid="talos-mobile-fault-open-permissions"/u)
        expect(b).toMatch(/talosApriPermessiApp\(\)/u)
        expect(s).toMatch(/<ApriIPermessi v-if="apreIPermessi" \/>/u)
        expect(s).toMatch(/TALOS_PROVIDER_LOCAL_NETWORK_BLOCKED/u)
    })
})
