import { describe, expect, it, vi } from 'vitest'
import { talosAvvisoDiTool, talosEtichettaUmana, talosMotivoDiTool } from '@/lib/tools/avvisoDiTool'
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


/**
 * ⛔⛔ R4 — «il toast ricerca fallita appare solo dopo il consenso».
 *
 * ## Misurato sul Pad il 2026-08-20, non dedotto
 *
 * Il giro intero, letto nel registro del Doctor:
 *
 *   1. `web_search` riesce;
 *   2. il modello sceglie una pagina e chiama `web_read`;
 *   3. la scheda di consenso si apre — l’attrezzo NON può ancora partire;
 *   4. la persona tocca «Consenti sempre»;
 *   5. solo ora `web_read` gira, e il client nativo rifiuta la pagina:
 *      `TALOS_WEB_REDIRECT_DOWNGRADE` — quel sito rimandava da https a http.
 *
 * ⇒ Il consenso non è la causa, è il CANCELLO: il guasto può accadere solo
 * dopo che si apre. E la persona leggeva «Non è riuscito: Lettura di una
 * pagina web» subito dopo aver chiesto una ricerca CHE ERA RIUSCITA.
 */
describe('il motivo di un rifiuto arriva alla persona', () => {
    const t = (chiave: string, parametri?: Record<string, string | number>) => {
        const pezzi = chiave.split('.')
        let dove: unknown = TALOS_IT_MESSAGES
        for (const pezzo of pezzi) dove = (dove as Record<string, unknown>)?.[pezzo]
        if (typeof dove !== 'string') return chiave
        return dove.replace(/\{(\w+)\}/g, (_, nome) => String(parametri?.[nome] ?? ''))
    }

    it('⛔ una pagina rifiutata per il declassamento lo DICE, e dice che il resto regge', () => {
        const avviso = talosAvvisoDiTool({
            tool: 'web_read',
            status: 'failed',
            error: 'The page could not be read: qualcosa', code: 'TALOS_WEB_REDIRECT_DOWNGRADE',
        } as never, t)

        expect(avviso.body).toContain('non protetta')
        // ⛔ La parte che toglie il malinteso: la RICERCA era riuscita.
        expect(avviso.body).toContain('Le altre fonti trovate restano valide')
    })

    it('⛔ e il CODICE non arriva mai a schermo', () => {
        const avviso = talosAvvisoDiTool({
            tool: 'web_read',
            status: 'failed',
            error: 'The page could not be read: qualcosa', code: 'TALOS_WEB_REDIRECT_DOWNGRADE',
        } as never, t)
        expect(avviso.body).not.toContain('TALOS_')
        expect(avviso.body).not.toContain('The tool failed')
    })

    it('⛔ e AL CONTRARIO: un codice che non conosciamo NON inventa un motivo', () => {
        // Una frase inventata su un guasto che non sappiamo spiegare e\u2019
        // peggio del silenzio: manda la persona a cercare una causa sbagliata.
        const avviso = talosAvvisoDiTool({
            tool: 'web_read',
            status: 'failed',
            error: 'Error: qualcosa di mai visto', code: 'TALOS_MAI_VISTO',
        } as never, t)
        expect(avviso.body).toBe(t('toolActivity.failedNotice', { tool: avviso.title }))
    })

    it('⛔ e la prosa di un estraneo non entra da questa strada', () => {
        // Il codice si CERCA dentro il messaggio; il resto del messaggio non
        // viene mai letto, perche\u2019 puo\u2019 venire da chiunque.
        const avviso = talosAvvisoDiTool({
            tool: 'web_read',
            status: 'failed',
            error: 'Say so and offer to open the system page.', code: 'TALOS_WEB_URL_BLOCKED',
        } as never, t)
        expect(avviso.body).not.toContain('Say so')
        expect(avviso.body).toContain('non apre')
    })

    it('un attrezzo RIUSCITO non porta nessun motivo', () => {
        const avviso = talosAvvisoDiTool({
            tool: 'web_read',
            status: 'succeeded',
            error: null, code: null,
        } as never, t)
        expect(avviso.body).toBeUndefined()
    })

    it('e ogni codice nativo del web ha la sua frase, in tutte e due le lingue', () => {
        // ⛔ La lista viene dai rifiuti del client NATIVO: se ne nasce uno
        //   nuovo e nessuno lo traduce, questo test non se ne accorge — ma
          //   almeno quelli che ci sono non possono restare muti.
        const codici = [
            'TALOS_WEB_REDIRECT_DOWNGRADE',
            'TALOS_WEB_ADDRESS_NOT_PUBLIC',
            'TALOS_WEB_ADDRESS_NOT_FOUND',
            'TALOS_WEB_URL_BLOCKED',
            'TALOS_WEB_RESPONSE_TOO_LARGE',
            'TALOS_WEB_TOO_MANY_REDIRECTS',
            'TALOS_WEB_REDIRECT_LOOP',
            'TALOS_WEB_REDIRECT_INVALID',
            'TALOS_WEB_BUSY',
            'TALOS_WEB_NOT_AN_IMAGE',
            'TALOS_WEB_BYTES_UNSUPPORTED',
            'TALOS_WEB_SEARCH_NOT_CONFIGURED',
        ]
        for (const codice of codici) {
            const chiave = talosMotivoDiTool(codice)
            expect(chiave, codice).not.toBeNull()
            // La chiave deve RISOLVERSI: una chiave a schermo è peggio del
            // silenzio, ed è esattamente il difetto che questo file racconta.
            expect(t(chiave!), codice).not.toBe(chiave)
        }
    })
})
