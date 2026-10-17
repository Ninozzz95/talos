import { afterEach, describe, expect, it } from 'vitest'
import { effectScope, nextTick } from 'vue'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { useConversazioneR4 } from '@/composables/useConversazioneR4'
import type { TalosR4ClientePonte } from '@/lib/harness/r4/clienteR4'
import { TALOS_METADATA_PIANO } from '@/lib/harness/r4/pianoChiave'

/**
 * ⛔ K3 piano (ledger `LEDGER-K3-PIANO-2026-10-17.md`): il modo, il permesso e la scelta sul piano dal composable del Codice su r4.
 * Prima della sessione il modo e il permesso scelti partono con la prima richiesta (`/custom`, `http-app.mjs:2365`); dopo,
 * `POST /:id/settings` (`:2671`). La scelta sul piano è `POST /:id/plan-decision` (`:7677`): la carta dice il motivo da sé, l'errore
 * del Codice non si tocca. Un `talos.impostazioni-sessione` dal vivo cambia modo e permesso; uno della storia no (la verità di
 * adesso è la voce della sessione, `GET /sessions`).
 */
interface Richiesta { metodo: string; percorso: string; corpo?: string }
type Ascoltatore = (dati: Record<string, unknown>) => void

function clienteFinto(rispondi: (r: Richiesta) => { stato: number; corpo: string } = () => ({ stato: 200, corpo: '{"ok":true,"data":{}}' })) {
    const ascoltatori: Record<string, Ascoltatore[]> = {}
    const flussi: { id: string; percorso: string }[] = []
    const richieste: Richiesta[] = []
    const ponte: TalosR4ClientePonte = {
        richiesta: async (r) => { richieste.push(r); return rispondi(r) },
        apriFlusso: async (f) => { flussi.push(f) },
        chiudiFlusso: async () => {},
        addListener: async (evento, ascoltatore) => {
            ;(ascoltatori[evento] ??= []).push(ascoltatore)
            return { remove: async () => { ascoltatori[evento] = (ascoltatori[evento] ?? []).filter((a) => a !== ascoltatore) } }
        },
    }
    const pezzo = (testo: string) => { for (const a of [...(ascoltatori.r4Pezzo ?? [])]) a({ id: flussi.at(-1)!.id, testo }) }
    return { ponte, flussi, richieste, pezzo }
}
const aspetta = async () => { for (let i = 0; i < 5; i++) { await new Promise((fatto) => setTimeout(fatto, 0)); await nextTick() } }
let scope = effectScope()
afterEach(() => { scope.stop(); scope = effectScope() })
const monta = (opzioni: Parameters<typeof useConversazioneR4>[0]) => scope.run(() => useConversazioneR4(opzioni))!
const sse = (dati: Record<string, unknown>[]) => dati.map((d) => `data: ${JSON.stringify(d)}\n\n`).join('')
const busta = (code: string, message: string, extra: Record<string, unknown> = {}) => JSON.stringify({ ok: false, error: { code, message, ...extra } })

const FIXTURE = resolve(__dirname, '..', '..', 'fixtures', 'r4')
const eventoPiano = readFileSync(resolve(FIXTURE, 'r4-701c6c0d2-piano-vivo.sse'), 'utf8').split('\n')
    .filter((l) => l.startsWith('data: ') && l.includes('"talos.plan"')).map((l) => JSON.parse(l.slice(6)) as { value: Record<string, unknown> })[0]

describe('il modo, il permesso e la scelta sul piano nel Codice su r4', () => {
    it('UCP-01 prima della sessione modo e permesso scelti partono con la prima richiesta; senza scelta, niente', async () => {
        const risposte = (r: Richiesta) => (r.percorso === '/api/v1/sessions/custom' ? { stato: 200, corpo: '{"ok":true,"data":{"sessionId":"s9"}}' } : { stato: 404, corpo: '{}' })
        const scelto = clienteFinto(risposte)
        const conv = monta({ cliente: scelto.ponte, cartella: '/w', attesaRiapertura: () => 0 })
        expect(await conv.impostaModo('piano')).toEqual({ ok: true })
        expect(await conv.impostaPermesso('On request')).toEqual({ ok: true })
        expect(scelto.richieste).toHaveLength(0)
        expect(conv.modalita.value).toBe('piano')
        expect(conv.politica.value.permessi).toBe('On request')
        await conv.invia('Prepara un piano')
        expect(JSON.parse(scelto.richieste[0].corpo!)).toMatchObject({ consegna: 'Prepara un piano', modalitaOperativa: 'piano', permessi: 'On request' })

        scope.stop(); scope = effectScope()
        const libero = clienteFinto(risposte)
        const conv2 = monta({ cliente: libero.ponte, cartella: '/w', attesaRiapertura: () => 0 })
        await conv2.invia('Ciao')
        const corpo = JSON.parse(libero.richieste[0].corpo!)
        expect(corpo).not.toHaveProperty('modalitaOperativa')
        expect(corpo).not.toHaveProperty('permessi')
    })

    it('UCP-02 con la sessione: /settings, e lo stato cambia solo al 2xx; un rifiuto torna con le parole del server, l\'errore del Codice resta', async () => {
        let rifiuta = false
        const c = clienteFinto((r) => (r.percorso.endsWith('/settings')
            ? (rifiuta ? { stato: 409, corpo: busta('SESSION_NOT_READY', 'Session not ready for this action', { reason: 'mode-between-turns' }) } : { stato: 200, corpo: '{"ok":true,"data":{"updated":true}}' })
            : { stato: 200, corpo: '{"ok":true,"data":{"items":[]}}' }))
        const conv = monta({ cliente: c.ponte, cartella: '/w', sessioneId: 's1', attesaRiapertura: () => 0 })
        await aspetta()
        expect(await conv.impostaModo('piano')).toEqual({ ok: true })
        const settings = c.richieste.filter((r) => r.percorso.endsWith('/settings'))
        expect(settings[0]).toEqual({ metodo: 'POST', percorso: '/api/v1/sessions/s1/settings', corpo: JSON.stringify({ modalitaOperativa: 'piano' }) })
        expect(conv.modalita.value).toBe('piano')
        expect(await conv.impostaPermesso('Full access')).toEqual({ ok: true })
        expect(c.richieste.filter((r) => r.percorso.endsWith('/settings'))[1].corpo).toBe(JSON.stringify({ permessi: 'Full access' }))
        expect(conv.politica.value.permessi).toBe('Full access')
        rifiuta = true
        const no = await conv.impostaModo('normale')
        expect(no.ok).toBe(false)
        expect((no as { messaggio: string }).messaggio).toBeTruthy()
        expect(conv.modalita.value).toBe('piano')
        expect((await conv.impostaPermesso('Read only')).ok).toBe(false)
        expect(conv.politica.value.permessi).toBe('Full access')
        expect(conv.errore.value).toBeNull()
    })

    it('UCP-03 la scelta sul piano: la rotta e il corpo esatti; un rifiuto torna con la sua busta, un guasto senza; l\'errore del Codice resta', async () => {
        let risposta: 'ok' | 'stale' | 'guasto' = 'ok'
        const c = clienteFinto((r) => {
            if (!r.percorso.endsWith('/plan-decision')) return { stato: 200, corpo: '{"ok":true,"data":{"items":[]}}' }
            if (risposta === 'guasto') throw new Error('SocketException')
            return risposta === 'ok' ? { stato: 200, corpo: '{"ok":true,"data":{"ok":true}}' }
                : { stato: 409, corpo: busta('PLAN_STALE', 'The plan on screen is no longer the latest: read the updated version and choose on that one', { reason: 'plan-outdated' }) }
        })
        const conv = monta({ cliente: c.ponte, cartella: '/w', sessioneId: 's1', attesaRiapertura: () => 0 })
        await aspetta()
        const corpo = { requestId: 'r1', decisione: 'continua-a-pianificare' as const, hash: `sha256:${'a'.repeat(64)}`, feedback: 'Aggiungi i test' }
        expect(await conv.decidiPiano(corpo)).toEqual({ ok: true })
        expect(c.richieste.at(-1)).toEqual({ metodo: 'POST', percorso: '/api/v1/sessions/s1/plan-decision', corpo: JSON.stringify(corpo) })
        risposta = 'stale'
        expect(await conv.decidiPiano(corpo)).toEqual({ ok: false, errore: { code: 'PLAN_STALE', message: 'The plan on screen is no longer the latest: read the updated version and choose on that one', reason: 'plan-outdated' } })
        risposta = 'guasto'
        expect(await conv.decidiPiano(corpo)).toEqual({ ok: false, errore: null })
        expect(conv.errore.value).toBeNull()
    })

    it('UCP-04 il modo dalla voce della sessione; un `talos.impostazioni-sessione` dal vivo lo cambia, uno della storia no', async () => {
        const c = clienteFinto((r) => (r.percorso === '/api/v1/sessions'
            ? { stato: 200, corpo: JSON.stringify({ ok: true, data: { items: [{ sessionId: 's1', modalitaOperativa: 'piano', permessi: 'Workspace write' }] } }) }
            : { stato: 200, corpo: '{"ok":true,"data":{}}' }))
        const conv = monta({ cliente: c.ponte, cartella: '/w', sessioneId: 's1', attesaRiapertura: () => 0 })
        await conv.apri()
        await aspetta()
        expect(conv.modalita.value).toBe('piano')
        expect(conv.politica.value.permessi).toBe('Workspace write')
        // nella storia: niente cambia
        c.pezzo(sse([{ type: 'CUSTOM', name: 'talos.impostazioni-sessione', value: { modalitaOperativa: 'normale', permessi: 'Full access', motivo: 'piano-approvato' } }]))
        expect(conv.modalita.value).toBe('piano')
        expect(conv.politica.value.permessi).toBe('Workspace write')
        // dal vivo: il sì al piano riporta Normale e «Chiede prima»
        c.pezzo(sse([{ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: {} },
            { type: 'CUSTOM', name: 'talos.impostazioni-sessione', value: { modalitaOperativa: 'normale', permessi: 'On request', motivo: 'piano-approvato' } }]))
        expect(conv.modalita.value).toBe('normale')
        expect(conv.politica.value.permessi).toBe('On request')
    })

    it('UCP-05 una proposta di questa sessione diventa la carta del piano, anche nella sessione appena creata', async () => {
        const sessione = String(eventoPiano.value.sessionId)
        const c = clienteFinto((r) => (r.percorso === '/api/v1/sessions/custom' ? { stato: 200, corpo: JSON.stringify({ ok: true, data: { sessionId: sessione } }) } : { stato: 404, corpo: '{}' }))
        const conv = monta({ cliente: c.ponte, cartella: '/w', attesaRiapertura: () => 0 })
        await conv.invia('Prepara un piano per slugify')
        await aspetta()
        c.pezzo(sse([{ type: 'RunStarted', runId: 'g1', input: { consegna: 'Prepara un piano per slugify' } }, eventoPiano]))
        const carta = conv.messaggi.value.find((m) => m.metadata[TALOS_METADATA_PIANO])
        expect(carta?.id).toBe(`piano:${String(eventoPiano.value.planId)}`)
    })
})
