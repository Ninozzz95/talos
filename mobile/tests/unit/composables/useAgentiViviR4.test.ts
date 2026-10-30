import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { useAgentiViviR4 } from '@/composables/useAgentiViviR4'

/*
 * ⛔ «Ferma tutto» (owner 29/10/2026; scheda `mockup/ferma-tutto/pezzi/SCHEDA-DI-CONSEGNA.md`, voce 1; ledger, riga 8): il numero del
 * contratto per la SCHERMATA del Codice, anche col pannello chiuso — gli agenti vivi di tutto il sottoalbero (`figlieAlLavoroR4`), dalle
 * stesse tre sorgenti del pannello fuse per `sessionId` (l'ultima vince): l'elenco `GET /api/v1/sessions`, i figli `GET /:id/children`,
 * le istantanee dal vivo `talos.agenti`. Si rilegge quando il pannello si rilegge: all'apertura, a ogni giro finito, quando una figlia
 * nasce o finisce dal vivo.
 */
const flush = async () => { for (let i = 0; i < 4; i += 1) { await Promise.resolve(); await nextTick() } }
let scope = effectScope()
afterEach(() => { scope.stop(); scope = effectScope() })

function monta(sorgenti: { sessioni?: unknown; figli?: unknown } = {}) {
    const radice = ref<string | null>('chat')
    const giriFiniti = ref(0)
    const inDiretta = ref<{ radice: string; agente: Record<string, unknown> }[]>([])
    const caricaSessioni = vi.fn(async () => (sorgenti.sessioni === undefined ? [
        { sessionId: 'chat', conclusa: true },
        { sessionId: 'a', padreId: 'chat', conclusa: false },
        { sessionId: 'a1', padreId: 'a', conclusa: false },
        { sessionId: 'altra', padreId: 'un-altra-chat', conclusa: false },
    ] : sorgenti.sessioni) as Record<string, unknown>[] | null)
    const caricaFigli = vi.fn(async () => (sorgenti.figli === undefined ? [
        { sessionId: 'b', conclusa: false, inAttesaApprovazione: true },
        { sessionId: 'c', conclusa: true },
    ] : sorgenti.figli) as Record<string, unknown>[] | null)
    const vivi = scope.run(() => useAgentiViviR4({ radice, inDiretta, giriFiniti, caricaSessioni, caricaFigli }))!
    return { vivi, radice, giriFiniti, inDiretta, caricaSessioni, caricaFigli }
}

describe('AV — gli agenti vivi della schermata', () => {
    it('AV-01 tutto il sottoalbero dalle tre sorgenti: nipoti, figli senza `padreId` (di questa chat), chi aspetta; non i finiti né le altre chat', async () => {
        const { vivi } = monta()
        await flush()
        expect(vivi.vivi.value).toEqual(['a', 'b', 'a1'])
        expect(vivi.quanti.value).toBe(3)
    })

    it('AV-02 l’istantanea dal vivo vince e rilegge: una figlia appena finita non conta più; uno di un’altra chat non entra', async () => {
        const { vivi, inDiretta, caricaSessioni } = monta()
        await flush()
        const letture = caricaSessioni.mock.calls.length
        inDiretta.value = [{ radice: 'chat', agente: { sessionId: 'a', padreId: 'chat', conclusa: true } }, { radice: 'altra', agente: { sessionId: 'b', padreId: 'chat', conclusa: true } }]
        await flush()
        expect(vivi.vivi.value).toEqual(['b', 'a1'])
        expect(caricaSessioni.mock.calls.length).toBeGreaterThan(letture)
    })

    it('AV-03 a ogni giro finito e su richiesta (dopo uno Stop) si rilegge; una lettura non riuscita lascia il numero di prima', async () => {
        const { vivi, giriFiniti, caricaFigli, caricaSessioni } = monta()
        await flush()
        expect(caricaFigli).toHaveBeenCalledTimes(1)
        giriFiniti.value = 1
        await flush()
        expect(caricaFigli).toHaveBeenCalledTimes(2)
        caricaSessioni.mockResolvedValueOnce(null)
        caricaFigli.mockResolvedValueOnce(null)
        await vivi.rileggi()
        expect(vivi.quanti.value).toBe(3)
        caricaFigli.mockResolvedValueOnce([{ sessionId: 'b', conclusa: false, interrotta: true }])
        caricaSessioni.mockResolvedValueOnce([{ sessionId: 'a', padreId: 'chat', conclusa: false, interrotta: true }, { sessionId: 'a1', padreId: 'a', conclusa: false }])
        await vivi.rileggi()
        expect(vivi.quanti.value).toBe(1)
    })

    it('AV-04 senza sessione (una bozza) nessuno e nessuna lettura; cambiando sessione si ricomincia', async () => {
        const { vivi, radice, caricaSessioni, caricaFigli } = monta()
        radice.value = null
        await flush()
        expect(vivi.quanti.value).toBe(0)
        const letture = caricaSessioni.mock.calls.length
        caricaFigli.mockResolvedValue([])
        radice.value = 'altra-chat'
        await flush()
        expect(caricaSessioni.mock.calls.length).toBeGreaterThan(letture)
        expect(vivi.quanti.value).toBe(0)
    })
})
