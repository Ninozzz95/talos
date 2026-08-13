import { describe, expect, it, vi } from 'vitest'
import { talosAvvisoDiTool, talosEtichettaUmana } from '@/lib/tools/avvisoDiTool'
import { createTalosToolset } from '@/lib/tools/toolset'
import {
    talosOnNotificationAndroid,
    talosOnNotificationToast,
    talosResetNotificationCentre,
} from '@/stores/notificationCentre'
import { TALOS_IT_MESSAGES } from '@/i18n/locales/it'

/**
 * ⛔⛔ La riga scritta per il MODELLO finiva sullo schermo della PERSONA.
 *
 * Owner 2026-08-10, screenshot dal telefono. Sopra il compositore, un riquadro:
 *
 * > «The user has not turned on notification access for TALOS yet. Say so and
 * > offer to open the system page. Do not retry.»
 *
 * È il testo di `notificationsBridge.ts`, giusto lì e sbagliato qui: `audit()`
 * pubblicava `body: row.error` e `title: row.tool`, e il centro notifiche li
 * consegnava al toast e alla notifica di Android.
 *
 * ⛔ Questo test morde perché controlla ciò che NON deve esserci: se qualcuno
 * rimettesse `row.error` nel corpo — che è la cosa comoda da fare — la prima
 * riga qui sotto diventa rossa con la frase vera dello screenshot dentro.
 */
const ERRORE_DEL_MODELLO
    = 'The user has not turned on notification access for TALOS yet. '
        + 'Say so and offer to open the system page. Do not retry.'

/** Il traduttore vero, non uno finto: le chiavi devono esistere DAVVERO. */
const t = (chiave: string, parametri?: Record<string, string | number>): string => {
    const valore = chiave.split('.').reduce<unknown>(
        (nodo, passo) => (nodo as Record<string, unknown> | undefined)?.[passo],
        TALOS_IT_MESSAGES as unknown,
    )
    if (typeof valore !== 'string') return chiave
    return valore.replace(/\{(\w+)\}/g, (_, nome: string) => String(parametri?.[nome] ?? `{${nome}}`))
}

describe('⛔ l\'avviso di un tool parla alla persona, non al modello', () => {
    const caduto = {
        tool: 'device_notifications_list',
        status: 'failed' as const,
        error: ERRORE_DEL_MODELLO,
    }

    it('il caso visto sul telefono: il testo del modello NON esce', () => {
        const avviso = talosAvvisoDiTool(caduto, t)
        expect(avviso.body).not.toContain('Do not retry')
        expect(avviso.body).not.toContain(ERRORE_DEL_MODELLO)
        expect(JSON.stringify(avviso)).not.toContain('Do not retry')
    })

    it('e nemmeno il nome INTERNO del tool: si usa l\'etichetta che la persona vede', () => {
        const avviso = talosAvvisoDiTool(caduto, t)
        expect(avviso.title).toBe('Le tue notifiche')
        expect(JSON.stringify(avviso)).not.toContain('device_notifications_list')
    })

    /*
     * ⛔⛔ QUESTO TEST CUSTODIVA UNA PROMESSA CHE L'APP NON PUÒ MANTENERE.
     *
     * Diceva «il corpo dice cosa è successo **e dove sta il perché**», e
     * pretendeva la frase «Il motivo è nella chat». VISTO sul Pad il
     * 2026-08-13: il toast compare quando lo strumento fallisce — cioè **prima**
     * che il modello abbia scritto una sola parola — e nello scatto la chat
     * conteneva soltanto due righe ripiegate, «Azione in un'altra app… 1s» e
     * «Ragionamento… 15s», senza nessuna spiegazione. Il compositore era ancora
     * sul quadrato di stop: stava generando.
     *
     * ⇒ Era una frase sicura su un evento futuro. Se il modello poi spiega, la
     * promessa è vera un secondo dopo; se non spiega, è un rimando al nulla —
     * e in entrambi i casi è falsa **nell'istante in cui la persona la legge**.
     * Stessa famiglia di «Aggiungi una chiave API» detto a chi le chiavi ce le
     * ha: si afferma con sicurezza una cosa che non si sa.
     *
     * Adesso il corpo dice il FATTO e basta. Meno utile, e vero.
     */
    it('⛔ il corpo dice il fatto e NON promette un perché che non controlliamo', () => {
        const corpo = talosAvvisoDiTool(caduto, t).body
        expect(corpo).toBe('Non è riuscito: Le tue notifiche.')
        expect(corpo).not.toMatch(/chat/i)
    })

    it('⛔ un tool RIUSCITO non ha corpo: dieci esecuzioni non fanno dieci frasi', () => {
        const avviso = talosAvvisoDiTool(
            { tool: 'device_torch', status: 'succeeded' },
            t,
        )
        expect(avviso.body).toBeUndefined()
        expect(avviso.title).not.toBe('device_torch')
    })

    it('⛔ e nemmeno «denied» o «refused_busy»: solo il fallimento parla', () => {
        expect(talosAvvisoDiTool({ tool: 'device_torch', status: 'denied' }, t).body)
            .toBeUndefined()
        expect(talosAvvisoDiTool({ tool: 'device_torch', status: 'refused_busy' }, t).body)
            .toBeUndefined()
    })
})

/**
 * ⛔⛔ E ADESSO IL CHIAMANTE, che è dove il difetto viveva davvero.
 *
 * I casi qui sopra provano una funzione pura: se qualcuno rimettesse
 * `body: row.error` **dentro `toolset.audit()`** resterebbero tutti verdi, e la
 * frase inglese tornerebbe sul telefono dell'owner senza che nessuno se ne
 * accorga. Questo caso attraversa la strada vera — `audit()` → centro notifiche
 * → le due superfici umane (toast e notifica di Android) — e afferma
 * l'invariante dove conta: **su nessuna delle due** può comparire il testo
 * scritto per il modello.
 */
describe('⛔ la strada vera: audit() → centro notifiche → schermo', () => {
    it('nessuna delle due superfici umane riceve il testo del modello', async () => {
        talosResetNotificationCentre()
        const arrivati: string[] = []
        const raccogli = (evento: { title: string, body?: string }): void => {
            arrivati.push(`${evento.title}\n${evento.body ?? ''}`)
        }
        talosOnNotificationToast(raccogli)
        talosOnNotificationAndroid(raccogli)

        const toolset = await createTalosToolset({
            repository: {} as never,
            readVaultFileText: vi.fn(async () => null),
            readVaultFileBytes: vi.fn(async () => null),
            requestConsent: vi.fn(async () => true),
            sessionTitles: vi.fn(async () => new Map<string, string>()),
            libraryEnabled: () => true,
            web: () => ({}) as never,
            documents: () => ({}) as never,
            images: () => ({}) as never,
            saveVaultFileToDevice: vi.fn(async () => ({}) as never),
            libraryContextPolicy: {} as never,
        })
        // `sessionId` nullo: la riga di audit vuole un repository vero, l'avviso
        // no — ed è l'avviso la cosa sotto esame.
        await toolset.audit(
            {
                tool: 'device_notifications_list',
                action: 'read',
                requiredActions: ['read'],
                status: 'failed',
                input: {},
                error: ERRORE_DEL_MODELLO,
            },
            null,
        )
        // L'avviso parte staccato (`void (async () => …)`), con tre import
        // dinamici dentro: si aspetta che arrivi invece di dare per scontato
        // che sia già arrivato — un test che guarda troppo presto passa sempre.
        await vi.waitFor(() => expect(arrivati.length).toBeGreaterThan(0))

        for (const riga of arrivati) {
            expect(riga).not.toContain('Do not retry')
            expect(riga).not.toContain('device_notifications_list')
        }
    })
})

describe('l\'etichetta umana, e i suoi due ripieghi', () => {
    it('un tool senza etichetta resta RICONOSCIBILE col suo nome', () => {
        // Una riga misteriosa è peggio di una tecnica: un tool nuovo senza
        // etichetta è una nostra mancanza, non un motivo per tacere.
        expect(talosEtichettaUmana('tool_inventato_oggi', t)).toBe('tool_inventato_oggi')
    })

    it('⛔ e una CHIAVE non tradotta non arriva mai a schermo', () => {
        // `talosT` restituisce la chiave quando manca la traduzione: se il
        // controllo sparisse, la persona leggerebbe `toolActivity.deviceTorch`.
        const traduttoreMuto = (chiave: string): string => chiave
        expect(talosEtichettaUmana('device_torch', traduttoreMuto))
            .not.toContain('toolActivity.')
    })
})
