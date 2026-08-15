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
