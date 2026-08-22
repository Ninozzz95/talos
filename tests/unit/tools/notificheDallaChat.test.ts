/**
 * ⭐ LE NOTIFICHE DALLA CHAT — e la promessa sugli OTP, che non deve sparire.
 *
 * ## Da dove nasce
 *
 * È metà di ciò che fa Gemini, e su questo telefono è la capacità grande che
 * resta raggiungibile: non passa da nessun ponte privilegiato — si accende
 * dalla pagina di sistema — e il ponte, su OxygenOS 16, non si accenderà mai.
 *
 * ## ⛔ La frase che questo file difende più di ogni altra cosa
 *
 * Owner 2026-08-08, sui codici a due fattori che Android 15 ci oscura:
 * **«lo deve dire»**.
 *
 * Sta nella `description` dello strumento e non solo in un commento, per una
 * ragione precisa: **la descrizione è l'unica cosa che il MODELLO legge**. Se il
 * limite vivesse solo nella nostra documentazione, TALOS potrebbe promettere a
 * voce di cercare un codice che non vedrà mai — e una promessa mancata su un
 * codice di accesso è il momento peggiore possibile per scoprire un limite.
 *
 * Se un domani qualcuno accorciasse quella descrizione «per pulizia», qui si
 * rompe qualcosa e c'è scritto perché.
 */
import { describe, expect, it, vi } from 'vitest'
import { createTalosNotificationTools } from '@/lib/tools/notificationTools'
import { talosNotificationReason } from '@/lib/device/notificationsBridge'

function strumenti(overrides: Record<string, unknown> = {}) {
    const sources = {
        status: vi.fn(async () => ({ granted: true, connected: true })),
        list: vi.fn(async () => ({ ok: true, notifications: [] })),
        reply: vi.fn(async () => ({ ok: true })),
        dismiss: vi.fn(async () => ({ ok: true })),
        reasonOf: talosNotificationReason,
        ...overrides,
    }
    return { tools: createTalosNotificationTools(sources as never), sources }
}

function strumento(nome: string, overrides: Record<string, unknown> = {}) {
    const { tools, sources } = strumenti(overrides)
    const trovato = tools.find((t) => t.name === nome)
    expect(trovato, `manca ${nome}`).toBeDefined()
    return {
        sources,
        esegui: (input: unknown) => (trovato!.run as (i: unknown) => Promise<{
            ok: boolean
            content: string
            code?: string
        }>)(input),
    }
}

describe('le notifiche dalla chat', () => {
    it('NOTIFICHE-01 ⛔ la promessa sugli OTP è DENTRO la descrizione, dove la legge il modello', () => {
        const { tools } = strumenti()
        const elenco = tools.find((t) => t.name === 'device_notifications_list')!

        const descrizione = elenco.description.toLowerCase()
        // Le tre cose che quella frase deve contenere, e ognuna serve:
        expect(descrizione, 'deve nominare i codici').toContain('code')
        expect(descrizione, 'deve dire che Android li nasconde').toContain('hides')
        // ⛔ E deve vietare esplicitamente di INVENTARNE uno. Senza questa, un
        // modello servizievole tira a indovinare un codice di accesso.
        expect(descrizione).toContain('do not guess')
    })

    it('NOTIFICHE-02 rispondere è `write` E `outbound`', () => {
        /*
         * ⛔ Rispondere manda un testo FUORI dal telefono, a una persona vera.
         * Trattarlo come una scrittura locale vorrebbe dire far uscire un
         * messaggio sotto un permesso che parla d'altro.
         */
        const { tools } = strumenti()
        const risposta = tools.find((t) => t.name === 'device_notification_reply')!

        expect(risposta.requiredActions).toContain('write')
        expect(risposta.requiredActions).toContain('outbound')
        // E chiede SEMPRE, qualunque cosa dica la politica generale: un
        // messaggio a una persona non si manda per conto di una preferenza.
        expect(risposta.confirmation).toBe('always')
    })

    it('NOTIFICHE-03 ⛔ le due cause di «non posso leggere» restano DISTINTE', async () => {
        /*
         * «Non hai concesso l'accesso» si cura con un viaggio nelle
         * impostazioni; «Android non mi ha ancora collegato» si cura
         * aspettando. Confonderle manda la persona a fare la cosa sbagliata —
         * la stessa lezione del ripiego privilegiato.
         */
        const senzaPermesso = strumento('device_notifications_list', {
            status: vi.fn(async () => ({ granted: false, connected: false })),
        })
        const nonCollegato = strumento('device_notifications_list', {
            status: vi.fn(async () => ({ granted: true, connected: false })),
        })

        const a = await senzaPermesso.esegui({})
        const b = await nonCollegato.esegui({})

        expect(a.ok).toBe(false)
        expect(b.ok).toBe(false)
        expect(a.content).not.toBe(b.content)
        expect(a.code).toBe('TALOS_NOTIFICATIONS_NOT_GRANTED')
        expect(b.code).toBe('TALOS_NOTIFICATIONS_LISTENER_NOT_CONNECTED')
    })

    it('NOTIFICHE-04 non si legge NIENTE finché il permesso non c’è', async () => {
        // La metà che conta per la fiducia: il controllo sta PRIMA della
        // lettura, non dopo. Un tool che legge e poi decide ha già letto.
        const { sources, esegui } = strumento('device_notifications_list', {
            status: vi.fn(async () => ({ granted: false, connected: false })),
        })

        await esegui({})
        expect(sources.list).not.toHaveBeenCalled()
    })

    it('NOTIFICHE-05 una notifica senza campo di risposta lo DICE, non prova un’altra strada', async () => {
        const { esegui } = strumento('device_notification_reply', {
            reply: vi.fn(async () => ({ ok: false, reason: 'no-reply-field' })),
        })

        const risposta = await esegui({ key: 'k', text: 'ciao' })

        expect(risposta.ok).toBe(false)
        expect(risposta.content).toContain('no reply field')
        expect(risposta.content).toContain('instead of pretending')
    })

    it('NOTIFICHE-06 la chiave della notifica arriva al modello, o non potrebbe rispondere', async () => {
        const { esegui } = strumento('device_notifications_list', {
            list: vi.fn(async () => ({
                ok: true,
                notifications: [{
                    key: '0|com.whatsapp|1|null|10123',
                    package: 'com.whatsapp',
                    postedAt: 1,
                    title: 'Maria',
                    text: 'Arrivi?',
                    clearable: true,
                    canReply: true,
                }],
            })),
        })

        const risposta = await esegui({})

        expect(risposta.content).toContain('0|com.whatsapp|1|null|10123')
        expect(risposta.content).toContain('Maria')
        expect(risposta.content).toContain('(can reply)')
    })

    it('NOTIFICHE-07 morde: senza la frase, la descrizione non direbbe niente sui codici', () => {
        /*
         * La prova che NOTIFICHE-01 non passa per costruzione: una descrizione
         * scritta come si scrivono di solito — cosa fa il tool e basta — non
         * contiene nessuna delle tre parole, e lascerebbe il modello libero di
         * promettere un codice.
         */
        const senzaPromessa = 'List the notifications currently on the phone, newest first.'
        expect(senzaPromessa.toLowerCase()).not.toContain('hides')
        expect(senzaPromessa.toLowerCase()).not.toContain('do not guess')
    })
})
