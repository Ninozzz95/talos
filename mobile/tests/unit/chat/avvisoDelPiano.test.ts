import { describe, expect, it, vi } from 'vitest'
import { talosAttendiPianoConAvviso } from '@/lib/chat/avvisoDelPiano'
import type { TalosNotificationEvent } from '@/lib/notifications/notificationCentre'

/**
 * N0 (21/10/2026), D-N0-1 — il piano da approvare chiamava DOPO la risposta.
 *
 * In `chatController` la notifica `demanding` partiva dopo l'`await` della decisione: chi non guardava il telefono non veniva
 * mai chiamato, e TALOS restava fermo ad aspettare. E stava sul canale `chat` (DEFAULT) invece di `attention` (HIGH).
 */
const traduci = (chiave: string, parametri?: Record<string, string | number>) =>
    parametri ? `${chiave}${JSON.stringify(parametri)}` : chiave

function prepara() {
    const avvisi: TalosNotificationEvent[] = []
    let rispondi: (d: { admitted: readonly string[], cancelled: boolean }) => void = () => {}
    const chiedi = vi.fn(() => new Promise<{ admitted: readonly string[], cancelled: boolean }>((r) => { rispondi = r }))
    const attesa = talosAttendiPianoConAvviso({
        piano: { id: 'p1', steps: [{}, {}, {}] },
        sessionId: 's9',
        translate: traduci,
        chiedi,
        notify: (e) => { avvisi.push(e) },
    })
    return { avvisi, chiedi, attesa, rispondi: (d: { admitted: readonly string[], cancelled: boolean }) => rispondi(d) }
}

describe('N0 il piano chiama mentre aspetta, non dopo', () => {
    it('N0-06 la chiamata parte PRIMA della risposta, esigente e sul canale di chi deve decidere', async () => {
        const { avvisi, chiedi } = prepara()
        await new Promise((r) => { setTimeout(r, 0) })
        expect(chiedi).toHaveBeenCalledTimes(1)
        expect(avvisi).toHaveLength(1)
        expect(avvisi[0]).toMatchObject({
            key: 'plan:p1',
            channel: 'attention',
            weight: 'demanding',
            surface: 'chat:s9',
            title: 'chat.plan.title{"count":3}',
            body: 'chat.plan.nothingDoneYet',
        })
    })

    it('N0-07 dopo la risposta, l\'esito sulla stessa voce e la decisione restituita com\'era', async () => {
        const { avvisi, attesa, rispondi } = prepara()
        rispondi({ admitted: ['a', 'b'], cancelled: false })
        await expect(attesa).resolves.toEqual({ admitted: ['a', 'b'], cancelled: false })
        expect(avvisi).toHaveLength(2)
        expect(avvisi[1]).toMatchObject({
            key: 'plan:p1',
            // revisione avversaria (3): l'esito è una notizia, non una domanda ⇒ non sul canale con suono
            channel: 'chat',
            weight: 'notable',
            title: 'chat.plan.approvedTitle',
            body: 'chat.plan.approvedBody{"count":2}',
        })
    })

    it('N0-07c un piano già chiuso prima di aprirsi (seconda domanda, Stop) non chiama nessuno', async () => {
        const avvisi: TalosNotificationEvent[] = []
        const decisione = await talosAttendiPianoConAvviso({
            piano: { id: 'p2', steps: [{}] },
            sessionId: 's9',
            translate: traduci,
            chiedi: () => new Promise((r) => { r({ admitted: [], cancelled: true }) }),
            notify: (e) => { avvisi.push(e) },
        })
        expect(decisione.cancelled).toBe(true)
        expect(avvisi.some((e) => e.weight === 'demanding')).toBe(false)
    })

    it('N0-07b annullato: l\'esito lo dice', async () => {
        const { avvisi, attesa, rispondi } = prepara()
        rispondi({ admitted: [], cancelled: true })
        await attesa
        expect(avvisi[1].title).toBe('chat.plan.cancelledTitle')
    })
})
