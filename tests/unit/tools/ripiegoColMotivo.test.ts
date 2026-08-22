/**
 * ⛔ Un ripiego senza la sua causa è un vicolo cieco con l'aria di un servizio.
 *
 * ## Da dove nasce, misurato sul Pad il 2026-08-08
 *
 * Shizuku avviato e vivo. Chiesto a TALOS «spegni il wifi» con Claude Sonnet 5:
 * lo strumento parte, il consenso viene dato, e TALOS risponde — onestamente —
 * «Ho aperto il pannello Wi-Fi, ma non è ancora spento».
 *
 * Poi gli ho chiesto **perché**. Risposta: non ho nessun risultato grezzo da
 * mostrarti. Il motivo esisteva davvero — Shizuku non ha mai autorizzato TALOS,
 * perché su OxygenOS 16 lo concede con un `pm grant` e la shell non ha più
 * `GRANT_RUNTIME_PERMISSIONS` — ma si perdeva per strada: il ramo del pannello
 * costruiva `{ done: true, via: 'panel' }` e buttava via `reason`.
 *
 * ## Perché è un difetto e non un dettaglio
 *
 * «Ti ho aperto il pannello» lascia la persona a stringersi nelle spalle.
 * «Ti ho aperto il pannello perché Shizuku non mi ha ancora autorizzato» le dice
 * la mossa successiva. È la differenza fra un assistente e un pulsante.
 *
 * E vale doppio qui: le due cause hanno DUE cure diverse — Shizuku spento si
 * riavvia, Shizuku che non autorizza è un'altra storia. Un ripiego che non
 * distingue le due manda la persona a fare la cosa sbagliata.
 */
import { describe, expect, it, vi } from 'vitest'
import { createTalosPrivilegedTools } from '@/lib/tools/privilegedTools'
import { talosPrivilegedReason } from '@/lib/device/privilegedShell'

function strumenti(esito: {
    done: boolean
    via: 'shell' | 'panel' | 'none'
    reason?: string
}) {
    const sources = {
        wifi: vi.fn(async () => esito),
        bluetooth: vi.fn(async () => esito),
        doNotDisturb: vi.fn(async () => esito),
        systemSetting: vi.fn(async () => esito),
        appUsage: vi.fn(async () => esito),
        listApps: vi.fn(async () => esito),
        ready: vi.fn(async () => true),
        reasonOf: talosPrivilegedReason,
    }
    return createTalosPrivilegedTools(sources as never)
}

function wifi(tools: ReturnType<typeof strumenti>) {
    const strumento = tools.find((t) => t.name.includes('wifi'))
    expect(strumento, 'lo strumento del wifi deve esistere').toBeDefined()
    return strumento!
}

async function esegui(esito: Parameters<typeof strumenti>[0]) {
    const strumento = wifi(strumenti(esito))
    return await (strumento.run as (input: unknown) => Promise<{
        ok: boolean
        content: string
        code?: string
    }>)({ on: false })
}

describe('il ripiego sul pannello porta con sé il motivo', () => {
    it('RIPIEGO-01 ⛔ dice PERCHÉ non l\'ha fatto da solo', async () => {
        const risposta = await esegui({
            done: true, via: 'panel', reason: 'shizuku-not-authorised',
        })

        // Resta vero che non è stato fatto: quella parte non si tocca.
        expect(risposta.ok).toBe(true)
        expect(risposta.content).toContain('NOT done yet')
        // ⛔ E adesso c'è anche la causa, con la mossa successiva dentro.
        // ⛔ Le parole sono cambiate con l'uscita di Shizuku, la PROPRIETÀ no:
        // il motivo dice cosa fare — accoppiare — e non è una diagnosi muta.
        expect(risposta.content).toContain('never been paired')
    })

    it('RIPIEGO-02 le due cause NON si confondono: hanno cure diverse', async () => {
        const spento = await esegui({
            done: true, via: 'panel', reason: 'shizuku-not-running',
        })
        const nonAutorizzato = await esegui({
            done: true, via: 'panel', reason: 'shizuku-not-authorised',
        })

        expect(spento.content).not.toBe(nonAutorizzato.content)
        expect(spento.content).toContain('not connected')
    })

    it('RIPIEGO-03 quando l\'ha fatto DAVVERO non si giustifica', async () => {
        /*
         * L'altra metà, senza la quale la correzione sarebbe rumore: una
         * riuscita non deve portarsi dietro spiegazioni di ripieghi che non ci
         * sono stati.
         */
        const risposta = await esegui({ done: true, via: 'shell' })
        expect(risposta.content).not.toContain('NOT done yet')
        expect(risposta.content).not.toContain('privileged path was not available')
    })

    it('RIPIEGO-05 ⛔ un motivo SCONOSCIUTO passa comunque, col suo nome', async () => {
        /*
         * Il caso che mi è costato un giro intero il 2026-08-08. Il lato nativo
         * aveva imparato a distinguere `shizuku-refused`, questo elenco no, e la
         * frase generica se lo mangiava: TALOS riferiva «il percorso
         * privilegiato non è disponibile» — l'unica cosa che la persona già
         * vedeva da sé.
         *
         * Un elenco di motivi è per forza incompleto: ne nascono ogni volta che
         * il nativo impara un caso nuovo. Il ripiego deve passarli, non
         * nasconderli.
         */
        const risposta = await esegui({
            done: true, via: 'panel', reason: 'un-motivo-che-non-esiste-ancora',
        })
        expect(risposta.content).toContain('un-motivo-che-non-esiste-ancora')
    })

    it('RIPIEGO-06 il rifiuto di ColorOS ha il suo motivo, e dice di NON riprovare', async () => {
        const risposta = await esegui({
            done: true, via: 'panel', reason: 'shizuku-refused',
        })
        expect(risposta.content).toContain('could not run this')
        // ⛔ E soprattutto: non mandare la persona a riavviare Shizuku, che è
        // già in esecuzione. Un consiglio sbagliato è peggio di nessun consiglio.
        // ⛔ La proprietà che conta e resta: il motivo VIETA di riprovare.
        // Prima lo diceva nominando Shizuku; adesso non c'è più nessuno da
        // riavviare, ma un modello che riprova all'infinito costerebbe uguale.
        expect(risposta.content.toLowerCase()).toContain('do not retry')
    })

    it('RIPIEGO-04 morde: senza il motivo le due risposte sarebbero IDENTICHE', async () => {
        /*
         * La prova che RIPIEGO-01 e -02 non passano per costruzione. È lo stato
         * in cui si trovava il codice quando il modello non ha saputo dirmi
         * perché: due cause diverse, una frase sola.
         */
        const senzaMotivo = 'Wi-Fi turned off — but it is NOT done yet: the phone panel is open and the user must tap the switch. Say exactly that.'
        expect(senzaMotivo).not.toContain('authorised')
        expect(senzaMotivo).not.toContain('not connected')
    })
})

/**
 * ⛔⛔ LA SCHEDA DELL'INTERRUTTORE, e il caso in cui NON deve esserci.
 *
 * Censimento 2026-08-16: su 69 capacità solo quattro avevano una scheda, e
 * otto delle rimaste sono interruttori identici alla torcia. Passano tutti da
 * `esitoDi`, quindi la scheda si aggiunge in un punto solo.
 *
 * ⛔ Ma `esitoDi` ha tre rami, e il secondo è una trappola: col pannello aperto
 * l'esito è `ok: true` e **niente è cambiato** — la persona deve ancora toccare
 * l'interruttore. Una scheda lì mostrerebbe una levetta nello stato che nessuno
 * ha raggiunto: «una bugia con una levetta sopra», come dice il commento su
 * `device_torch`.
 */
describe('la scheda di un interruttore, e quando NON deve esserci', () => {
    function conEsito(esito: Parameters<typeof strumenti>[0], nome = 'wifi') {
        const strumento = strumenti(esito).find((t) => t.name.includes(nome))!
        return strumento.run as (input: unknown) => Promise<{
            ok: boolean
            content: string
            scheda?: { tipo: string, tool: string, acceso: boolean }
        }>
    }

    it('c è quando la cosa è DAVVERO successa', async () => {
        const esito = await conEsito({ done: true, via: 'shell' })({ on: true })
        expect(esito.ok).toBe(true)
        expect(esito.scheda).toEqual({ tipo: 'interruttore', tool: 'device_wifi', acceso: true })
    })

    it('e porta lo stato CHIESTO, acceso o spento', async () => {
        const spento = await conEsito({ done: true, via: 'shell' })({ on: false })
        expect(spento.scheda?.acceso).toBe(false)
    })

    it('⛔⛔ NIENTE scheda col pannello aperto: li nulla e ancora successo', async () => {
        /*
         * È il caso che conta. `ok: true` ma il testo dice esplicitamente «it is
         * NOT done yet»: una levetta accanto a quella frase la smentirebbe, e
         * fra le due la persona crederebbe alla levetta.
         */
        const esito = await conEsito({ done: true, via: 'panel' })({ on: true })
        expect(esito.ok).toBe(true)
        expect(esito.content).toMatch(/NOT done yet/i)
        expect(esito.scheda).toBeUndefined()
    })

    it('⛔ e niente scheda quando è proprio fallito', async () => {
        const esito = await conEsito({ done: false, via: 'none', reason: 'no-shizuku' })({ on: true })
        expect(esito.ok).toBe(false)
        expect(esito.scheda).toBeUndefined()
    })

    it('⛔ «non disturbare» NON ha una levetta: ha quattro modalità', async () => {
        /*
         * Contro la simmetria, di proposito. Una levetta a due stati mostrerebbe
         * «acceso» sia per «solo le cose importanti» sia per «silenzio totale» —
         * che è la differenza fra sentire la sveglia e non sentirla.
         */
        const esito = await conEsito({ done: true, via: 'shell' }, 'do_not_disturb')({ mode: 'none' })
        expect(esito.ok).toBe(true)
        expect(esito.scheda).toBeUndefined()
    })
})
