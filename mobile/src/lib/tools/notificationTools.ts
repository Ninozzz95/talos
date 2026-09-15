/**
 * ⭐ LE NOTIFICHE DALLA CHAT — leggerle, rispondere, toglierle.
 *
 * ## Perché queste tre e non di più
 *
 * È **metà di ciò che fa Gemini**, e sono le tre cose che una persona fa
 * davvero con una notifica: la guarda, risponde, la toglie di mezzo. Tutto il
 * resto (silenziare un'app, cambiare canale, riprogrammare) è configurazione, e
 * la configurazione si fa nelle impostazioni, non dicendola a un assistente.
 *
 * ## ⛔ Ciò che TALOS NON può leggere, scritto DOVE LO LEGGE IL MODELLO
 *
 * Da Android 15 le notifiche sensibili — i codici a due fattori — sono oscurate
 * a chi non ha `RECEIVE_SENSITIVE_NOTIFICATIONS`, che a un'app come la nostra
 * non sarà dato. Owner 2026-08-08: «lo deve dire».
 *
 * Sta nella descrizione dello strumento e non solo in un commento, per una
 * ragione precisa: la descrizione è l'unica cosa che il **modello** legge. Se il
 * limite stesse solo nella nostra documentazione, TALOS potrebbe promettere a
 * voce di cercare un codice che non vedrà mai — e una promessa mancata su un
 * codice di accesso è il momento peggiore per scoprire un limite.
 */
import { z } from 'zod'
import { defineTalosTool, type TalosToolDefinition } from '@/lib/tools/registry'

export interface TalosNotificationSources {
    status(): Promise<{ granted: boolean, connected: boolean }>
    list(limit: number): Promise<{
        ok: boolean
        reason?: string
        notifications?: readonly {
            key: string
            package: string
            postedAt: number
            title: string | null
            text: string | null
            clearable: boolean
            canReply: boolean
        }[]
    }>
    reply(key: string, text: string): Promise<{ ok: boolean, reason?: string }>
    dismiss(key: string): Promise<{ ok: boolean, reason?: string }>
    reasonOf(reason: string | undefined): string
}

/**
 * ⛔ Un solo posto che decide se si può leggere, e che distingue le due cause.
 *
 * «Non hai concesso l'accesso» e «l'accesso c'è ma Android non mi ha ancora
 * collegato» hanno due cure diverse: la prima è un viaggio nelle impostazioni,
 * la seconda è aspettare qualche secondo. Confonderle manda la persona a fare
 * la cosa sbagliata — la stessa lezione del ripiego privilegiato.
 */
async function pronto(sources: TalosNotificationSources): Promise<string | null> {
    const stato = await sources.status()
    if (!stato.granted) return 'not-granted'
    if (!stato.connected) return 'listener-not-connected'
    return null
}

export function createTalosNotificationTools(
    sources: TalosNotificationSources,
): TalosToolDefinition<never>[] {
    return [
        defineTalosTool({
            name: 'device_notifications_list',
            action: 'read',
            title: 'Read the notifications on screen',
            description: [
                'List the notifications currently on the phone, newest first.',
                'Each one says whether it can be replied to.',
                // ⛔ Il limite, dichiarato al modello. Non è una nota a piè di
                // pagina: è ciò che gli impedisce di promettere l'impossibile.
                'IMPORTANT: Android hides sensitive notifications from TALOS — one-time',
                'passcodes and two-factor codes are never visible here, by design, and no',
                'retry or permission will reveal them. If the user asks for a code, say',
                'plainly that TALOS cannot read codes, and do not guess one.',
            ].join(' '),
            input: z.object({
                limit: z.number().int().min(1).max(50).optional(),
            }),
            async run(input) {
                const problema = await pronto(sources)
                if (problema) {
                    return {
                        ok: false,
                        content: sources.reasonOf(problema),
                        code: `TALOS_NOTIFICATIONS_${problema.toUpperCase().replace(/-/g, '_')}`,
                    }
                }
                const esito = await sources.list(input.limit ?? 20)
                if (!esito.ok) {
                    return {
                        ok: false,
                        content: sources.reasonOf(esito.reason),
                        code: `TALOS_NOTIFICATIONS_${(esito.reason ?? 'failed').toUpperCase().replace(/-/g, '_')}`,
                    }
                }
                const righe = esito.notifications ?? []
                if (righe.length === 0) {
                    return { ok: true, content: 'No notifications on screen right now.' }
                }
                /*
                 * Una riga per notifica, con la CHIAVE davanti: è ciò che serve
                 * per rispondere, e senza il modello dovrebbe indovinarla.
                 */
                const testo = righe.map((riga) => [
                    `[${riga.key}]`,
                    riga.package,
                    riga.title ? `— ${riga.title}` : '',
                    riga.text ? `: ${riga.text}` : '',
                    riga.canReply ? '(can reply)' : '(no reply field)',
                ].filter(Boolean).join(' ')).join('\n')
                return { ok: true, content: testo }
            },
        }) as TalosToolDefinition<never>,

        defineTalosTool({
            name: 'device_notification_reply',
            /*
             * ⛔ `write` E `outbound`, e la seconda è quella che conta.
             *
             * Rispondere a una notifica manda un testo FUORI dal telefono, a una
             * persona vera. Nella nostra grammatica quello è `outbound`, e
             * trattarlo come una semplice scrittura locale vorrebbe dire far
             * uscire un messaggio sotto un permesso che parla d'altro.
             */
            action: 'write',
            requiredActions: ['write', 'outbound'],
            title: 'Reply to a notification',
            description: [
                'Reply to a notification that offers a reply field, using the key from',
                'the notification list. The text goes to the app that posted it — it is a',
                'real message to a real person, so say exactly what you are about to send',
                'before sending it. If the notification has no reply field, say so instead',
                'of trying another way.',
            ].join(' '),
            input: z.object({
                key: z.string().min(1),
                text: z.string().min(1),
            }),
            confirmation: 'always',
            async run(input) {
                const problema = await pronto(sources)
                if (problema) {
                    return {
                        ok: false,
                        content: sources.reasonOf(problema),
                        code: `TALOS_NOTIFICATIONS_${problema.toUpperCase().replace(/-/g, '_')}`,
                    }
                }
                const esito = await sources.reply(input.key, input.text)
                if (!esito.ok) {
                    return {
                        ok: false,
                        content: sources.reasonOf(esito.reason),
                        code: `TALOS_NOTIFICATIONS_${(esito.reason ?? 'failed').toUpperCase().replace(/-/g, '_')}`,
                    }
                }
                return { ok: true, content: 'Reply sent.' }
            },
        }) as TalosToolDefinition<never>,

        defineTalosTool({
            name: 'device_notification_dismiss',
            action: 'write',
            title: 'Dismiss a notification',
            description: [
                'Remove a notification from the shade, using the key from the list.',
                'Notifications belonging to something still running cannot be dismissed:',
                'hiding them would hide that it is running.',
            ].join(' '),
            input: z.object({ key: z.string().min(1) }),
            async run(input) {
                const problema = await pronto(sources)
                if (problema) {
                    return {
                        ok: false,
                        content: sources.reasonOf(problema),
                        code: `TALOS_NOTIFICATIONS_${problema.toUpperCase().replace(/-/g, '_')}`,
                    }
                }
                const esito = await sources.dismiss(input.key)
                if (!esito.ok) {
                    return {
                        ok: false,
                        content: sources.reasonOf(esito.reason),
                        code: `TALOS_NOTIFICATIONS_${(esito.reason ?? 'failed').toUpperCase().replace(/-/g, '_')}`,
                    }
                }
                return { ok: true, content: 'Notification dismissed.' }
            },
        }) as TalosToolDefinition<never>,
    ]
}
