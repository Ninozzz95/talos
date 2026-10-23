// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'

const ascolti: Record<string, () => void> = {}
vi.mock('@capacitor/app', () => ({
    App: { addListener: vi.fn(async (evento: string, cb: () => void) => { ascolti[evento] = cb; return { remove: async () => undefined } }) },
}))
const uscita = vi.fn(async () => undefined)
vi.mock('@/services/appUpdates', async (originale) => ({
    ...(await originale<typeof import('@/services/appUpdates')>()),
    talosUscitaPerAggiornamento: () => uscita(),
}))

import { talosApplicaStatoAggiornamenti, talosAzzeraAggiornamentiPerTest } from '@/services/appUpdates'
import { talosAvviaCablaggioAggiornamenti, talosLavoriInCorso, talosMomentoCalmo } from '@/lib/updates/avvioAggiornamenti'
import { talosSegnaleAggiornamento } from '@/lib/updates/segnaleAggiornamento'

/*
 * Owner 22/10/2026 (1): il cassetto sale da solo SOLO in un momento calmo — la chat non scrive, il Codice non lavora, nessun
 * modello si scarica, la persona è sulla chat — e una volta sola per ciascuna cosa da dire; chiuso, resta il segnale.
 * (3): «Al prossimo avvio» s'installa all'uscita da TALOS, solo se niente lavora.
 */
const chatScrive = ref(false)
const fuori = ref(false)
const occupazione = { chatAlLavoro: () => chatScrive.value, fuoriDallaChat: () => fuori.value }
let stacca: (() => void) | null = null

beforeEach(() => {
    localStorage.clear()
    chatScrive.value = false
    fuori.value = false
    Object.assign(talosSegnaleAggiornamento, { visibile: false, fallita: false, aperto: false, codiceAlLavoro: false })
})
afterEach(() => {
    stacca?.()
    stacca = null
    talosAzzeraAggiornamentiPerTest()
    uscita.mockClear()
})

describe('momento calmo', () => {
    it('UPD-BUSY-01 chat che scrive, Codice al lavoro: si contano', () => {
        expect(talosLavoriInCorso(occupazione)).toBe(0)
        chatScrive.value = true
        talosSegnaleAggiornamento.codiceAlLavoro = true
        expect(talosLavoriInCorso(occupazione)).toBe(2)
    })

    it('UPD-BUSY-02 calmo solo sulla chat, visibile e senza lavori', () => {
        expect(talosMomentoCalmo(occupazione)).toBe(true)
        expect(talosMomentoCalmo(occupazione, false)).toBe(false)
        fuori.value = true
        expect(talosMomentoCalmo(occupazione)).toBe(false)
        fuori.value = false
        talosSegnaleAggiornamento.codiceAlLavoro = true
        expect(talosMomentoCalmo(occupazione)).toBe(false)
    })
})

describe('il cassetto sale da solo', () => {
    it('UPD-BUSY-03 pronta mentre la chat scrive: aspetta la fine, poi sale una volta sola', async () => {
        stacca = await talosAvviaCablaggioAggiornamenti(occupazione)
        chatScrive.value = true
        talosApplicaStatoAggiornamenti({ fase: 'PRONTA', versione: '0.1.44' })
        await nextTick()
        expect(talosSegnaleAggiornamento.visibile).toBe(true)
        expect(talosSegnaleAggiornamento.aperto).toBe(false)

        chatScrive.value = false
        await nextTick()
        expect(talosSegnaleAggiornamento.aperto).toBe(true)

        // chiuso dalla persona: resta il segnale, e non risale da solo per la stessa versione
        talosSegnaleAggiornamento.aperto = false
        chatScrive.value = true
        await nextTick()
        chatScrive.value = false
        await nextTick()
        expect(talosSegnaleAggiornamento.aperto).toBe(false)
        expect(talosSegnaleAggiornamento.visibile).toBe(true)
    })

    it('UPD-BUSY-04 fuori dalla chat non sale; tornata sulla chat sì', async () => {
        fuori.value = true
        stacca = await talosAvviaCablaggioAggiornamenti(occupazione)
        talosApplicaStatoAggiornamenti({ fase: 'PRONTA', versione: '0.1.44' })
        await nextTick()
        expect(talosSegnaleAggiornamento.aperto).toBe(false)
        fuori.value = false
        await nextTick()
        expect(talosSegnaleAggiornamento.aperto).toBe(true)
    })

    it('UPD-BUSY-05 la scartata ha il segnale «fallita» e sale una volta per il suo motivo', async () => {
        stacca = await talosAvviaCablaggioAggiornamenti(occupazione)
        talosApplicaStatoAggiornamenti({ fase: 'FALLITA', versione: '0.1.44', motivo: 'firma' })
        await nextTick()
        expect(talosSegnaleAggiornamento.fallita).toBe(true)
        expect(talosSegnaleAggiornamento.aperto).toBe(true)
    })

    it('UPD-BUSY-06 all\'uscita da TALOS si chiede l\'installazione solo se niente lavora', async () => {
        stacca = await talosAvviaCablaggioAggiornamenti(occupazione)
        chatScrive.value = true
        ascolti.pause?.()
        expect(uscita).not.toHaveBeenCalled()
        chatScrive.value = false
        ascolti.pause?.()
        expect(uscita).toHaveBeenCalledTimes(1)
    })
})
