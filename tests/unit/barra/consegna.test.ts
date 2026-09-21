import { describe, expect, it } from 'vitest'
import { talosConsegnaLaSessione, talosSessioneDaAprire } from '@/lib/barra/consegna'

/**
 * ⛔ IL PASSAGGIO DI CONSEGNE — e questi casi mordono sul fallire CHIUSO.
 *
 * Owner 2026-08-11: «quando faccio "apri in TALOS" si deve aprire la chat
 * aggiornata col testo che ho inviato». L'id viaggia nell'indirizzo perché barra
 * e app sono due WebView diverse.
 *
 * ⛔ Un indirizzo è un dato che arriva da FUORI: qualunque app può mandare un
 * intent alla nostra. Se questa funzione fosse permissiva, un indirizzo altrui
 * potrebbe far saltare la persona su una conversazione che non stava guardando —
 * e nel mezzo di una dettatura sarebbe anche peggio. Per questo la maggior parte
 * dei casi qui sotto verificano ciò che NON deve passare.
 */
describe('⛔ la consegna dalla barra all\'app', () => {
    it('⭐ l\'indirizzo giusto consegna l\'id', () => {
        expect(talosSessioneDaAprire('talos://chat?sessione=abc-123')).toBe('abc-123')
    })

    it('⭐ l\'id passa anche con altri parametri intorno', () => {
        expect(talosSessioneDaAprire('talos://chat?voce=1&sessione=xyz&nodi=9')).toBe('xyz')
    })

    it('⛔ uno SCHEMA diverso non passa, anche se il resto è identico', () => {
        expect(talosSessioneDaAprire('https://chat?sessione=abc')).toBeNull()
    })

    it('⛔ un altro indirizzo NOSTRO non passa: la barra non è la chat', () => {
        expect(talosSessioneDaAprire('talos://barra?voce=1&sessione=abc')).toBeNull()
    })

    it('⛔ senza id non si apre niente invece di aprire a caso', () => {
        expect(talosSessioneDaAprire('talos://chat')).toBeNull()
        expect(talosSessioneDaAprire('talos://chat?sessione=')).toBeNull()
        expect(talosSessioneDaAprire('talos://chat?sessione=%20%20')).toBeNull()
    })

    it('⛔ spazzatura e vuoto falliscono chiusi, non lanciano', () => {
        expect(talosSessioneDaAprire('non un indirizzo')).toBeNull()
        expect(talosSessioneDaAprire('')).toBeNull()
        expect(talosSessioneDaAprire(null)).toBeNull()
        expect(talosSessioneDaAprire(undefined)).toBeNull()
    })
})

/**
 * ⛔⛔ SCEGLIERE LA CONVERSAZIONE NON È APRIRLA.
 *
 * Owner 2026-08-12: «quando premo "vai alla chat" dall'assistente non va alla
 * chat, va all'applicazione». RIPRODOTTO sul Pad: app lasciata su Impostazioni →
 * Motore di ricerca, barra aperta dalla home, «Apri in TALOS» → TALOS si apre
 * **su Impostazioni**. La conversazione giusta era selezionata e nessuno la
 * stava guardando.
 *
 * ⛔ E i dieci casi qui sopra erano tutti verdi: provano il PARSER, e il parser
 * non aveva niente che non andasse. Metà del lavoro succedeva nel chiamante, e
 * il chiamante non lo esercitava nessuno — la lezione di
 * `righe-per-il-modello-sullo-schermo`, pagata una seconda volta.
 */
describe('⛔ la consegna APRE la chat, non solo la sceglie', () => {
    function scena(rottaCorrente: string) {
        const fatti: string[] = []
        return {
            fatti,
            chat: {
                init: async () => { fatti.push('init') },
                selectSession: async (id: string) => { fatti.push(`select:${id}`) },
            },
            navigazione: {
                currentRoute: { value: { name: rottaCorrente } },
                push: async (d: { name: string }) => { fatti.push(`push:${d.name}`) },
            },
        }
    }

    it('⭐ da un\'ALTRA schermata: sceglie la conversazione E ci porta', async () => {
        const { fatti, chat, navigazione } = scena('settings')

        await talosConsegnaLaSessione(chat, navigazione, 'abc-123')

        // L'ordine conta: si sceglie prima, così la chat che compare è già quella
        // giusta invece di lampeggiare sulla precedente.
        expect(fatti).toEqual(['init', 'select:abc-123', 'push:chat'])
    })

    it('⛔ se siamo GIÀ sulla chat non ci si rispinge sopra', async () => {
        // Una seconda voce nella cronologia farebbe sì che il tasto indietro non
        // torni indietro: il verso contrario di questa funzione.
        const { fatti, chat, navigazione } = scena('chat')

        await talosConsegnaLaSessione(chat, navigazione, 'abc-123')

        expect(fatti).toEqual(['init', 'select:abc-123'])
    })

    it('⛔ una navigazione RIFIUTATA non fa saltare l\'avvio', async () => {
        const { chat, navigazione } = scena('settings')
        navigazione.push = async () => { throw new Error('guardia') }

        // Non deve lanciare: la conversazione è già quella giusta, e un'eccezione
        // qui morirebbe dentro un `void` all'avvio dell'app, invisibile.
        await expect(talosConsegnaLaSessione(chat, navigazione, 'abc-123')).resolves.toBeUndefined()
    })
})
