import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * ⛔⛔ D-RM4-1 (sicurezza, visto dal vivo il 20/10/2026): la sonda della consegna (`talosAscoltaLaConsegna`) scriveva l'indirizzo
 * INTERO nel diario, e il diario finisce nel logcat di Android (`TalosOrecchio: web: …`). Aperta col collegamento del controllo
 * remoto (`talos-remote:1?pc=…&relay=…&t=<gettone monouso>&exp=…`), il gettone stava nel log di sistema, leggibile da `adb logcat`
 * e da ogni segnalazione di guasto. ⇒ Nel diario va solo lo schema e la rotta: i valori della query e del frammento mai, nemmeno
 * i nomi dei parametri. Queste prove leggono il diario VERO (`talosDettaturaDiario`: le stesse righe che `talosDettaturaAnnota`
 * passa al ponte verso il logcat), sulle due strade (freddo e caldo).
 * ⛔ Il diario NON si finge con `vi.mock('@/services/dictation')`: misurato il 20/10/2026, l'import dinamico dentro la richiamata
 * di `appUrlOpen` riceveva il modulo vero anche col finto registrato, e la prova a caldo guardava un diario dove la riga non
 * arrivava mai (rossa per la ragione sbagliata).
 */
const GETTONE = 'GETTONESEGRETO0123456789'
const QR = `talos-remote:1?pc=pc-uno&relay=wss%3A%2F%2Frelay.esempio%2Fr&t=${GETTONE}&exp=4000000000`

let lancio: string | null = null
let caldo: (e: { url: string }) => void = () => {}

vi.mock('@capacitor/app', () => ({
    App: {
        getLaunchUrl: vi.fn(async () => (lancio ? { url: lancio } : undefined)),
        addListener: vi.fn(async (_e: string, cb: (e: { url: string }) => void) => { caldo = cb; return { remove: async () => {} } }),
    },
}))

/** Le righe del diario senza l'ora davanti (`12:34:56.789 consegna: …`). */
async function righe(): Promise<string[]> {
    const { talosDettaturaDiario } = await import('@/services/dictation')
    return talosDettaturaDiario().map((r) => r.replace(/^\S+ /u, ''))
}

beforeEach(() => {
    vi.resetModules()
    lancio = null
})

describe('⛔ D-RM4-1 la sonda della consegna non scrive segreti nel diario', () => {
    it('CNS-RED-01 la funzione pura: del collegamento remoto resta solo «talos-remote:1?…»', async () => {
        const { talosIndirizzoPerIlDiario } = await import('@/lib/barra/consegna')
        expect(talosIndirizzoPerIlDiario(QR)).toBe('talos-remote:1?…')
        // la consegna della barra resta diagnosticabile: schema e rotta, senza l'id della conversazione
        expect(talosIndirizzoPerIlDiario('talos://chat?sessione=abc-123')).toBe('talos://chat?…')
        // senza query non c'è niente da togliere, e il diario non finge che ci fosse
        expect(talosIndirizzoPerIlDiario('talos://chat')).toBe('talos://chat')
        expect(talosIndirizzoPerIlDiario(null)).toBe('-')
        expect(talosIndirizzoPerIlDiario(undefined)).toBe('-')
        expect(talosIndirizzoPerIlDiario('')).toBe('-')
    })

    it('CNS-RED-02 anche il frammento e le credenziali nell\'autorità restano fuori', async () => {
        const { talosIndirizzoPerIlDiario } = await import('@/lib/barra/consegna')
        expect(talosIndirizzoPerIlDiario(`talos-remote:1#t=${GETTONE}`)).toBe('talos-remote:1?…')
        expect(talosIndirizzoPerIlDiario(`https://utente:${GETTONE}@esempio.it/via`)).toBe('https://esempio.it/via')
        expect(talosIndirizzoPerIlDiario(`https://utente:${GETTONE}@esempio.it/via?x=1`)).toBe('https://esempio.it/via?…')
    })

    it('CNS-RED-03 a freddo (`getLaunchUrl`): il gettone non arriva al diario', async () => {
        lancio = QR
        const { talosAscoltaLaConsegna } = await import('@/lib/barra/consegna')
        await talosAscoltaLaConsegna(async () => {})
        await vi.waitFor(async () => expect((await righe()).some((r) => r.startsWith('consegna: freddo'))).toBe(true))
        expect(await righe()).toContain('consegna: freddo url=talos-remote:1?…')
        expect((await righe()).join('\n')).not.toContain(GETTONE)
    })

    it('CNS-RED-04 a caldo (`appUrlOpen`): il gettone non arriva al diario', async () => {
        const { talosAscoltaLaConsegna } = await import('@/lib/barra/consegna')
        await talosAscoltaLaConsegna(async () => {})
        caldo({ url: QR })
        await vi.waitFor(async () => expect((await righe()).some((r) => r.startsWith('consegna: caldo'))).toBe(true))
        expect(await righe()).toContain('consegna: caldo url=talos-remote:1?…')
        expect((await righe()).join('\n')).not.toContain(GETTONE)
    })

    it('CNS-RED-05 la consegna della barra continua a funzionare: la rotta letta dall\'indirizzo VERO, non da quello del diario', async () => {
        const { talosAscoltaLaConsegna } = await import('@/lib/barra/consegna')
        const apri = vi.fn(async () => {})
        await talosAscoltaLaConsegna(apri)
        caldo({ url: 'talos://chat?sessione=abc-123' })
        await vi.waitFor(() => expect(apri).toHaveBeenCalledWith('abc-123'))
        await vi.waitFor(async () => expect(await righe()).toContain('consegna: caldo url=talos://chat?…'))
        expect((await righe()).join('\n')).not.toContain('abc-123')
    })
})
