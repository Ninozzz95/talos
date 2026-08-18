import { afterEach, describe, expect, it, vi } from 'vitest'
import { createServer, type Server } from 'node:http'
import { talosFetchStream } from '@/lib/chat/providers/streamShared'
import { createTalosMobileHttpTransport } from '@/lib/chat/httpTransport'

/**
 * ⛔⛔⛔ «QUESTA RICHIESTA RESTA LOCALE» NON È «L'URL DI PARTENZA ERA LOCALE».
 *
 * TALOS permette endpoint in chiaro verso indirizzi privati, perché un modello
 * che gira sul computer della persona parla HTTP e basta. La classificazione
 * dell'indirizzo configurato è già accorta: rifiuta i NOMI, perché un nome lo
 * risolve qualcun altro e può rispondere con un indirizzo pubblico.
 *
 * Ma guardava **solo il primo salto**. `fetch()` segue i redirect per
 * impostazione predefinita, quindi bastava che quel server locale rispondesse
 * `302 Location: https://qualcuno.example` e il prompt — con le sue intestazioni
 * di autorizzazione — usciva dalla classe di rete autorizzata. In chiaro non
 * c'è nemmeno il TLS a coprire il resto.
 *
 * ⇒ Questi test non guardano un flag: montano DUE server veri e controllano se
 * il corpo arriva al secondo. È l'unica forma che non si può soddisfare
 * scrivendo la parola giusta nel posto sbagliato.
 */

const aperti: Server[] = []

afterEach(async () => {
    await Promise.all(aperti.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))))
})

function serviamo(gestore: Parameters<typeof createServer>[1]): Promise<{ url: string }> {
    const server = createServer(gestore)
    aperti.push(server)
    return new Promise((risolvi) => {
        server.listen(0, '127.0.0.1', () => {
            const porta = (server.address() as { port: number }).port
            risolvi({ url: `http://127.0.0.1:${porta}` })
        })
    })
}

describe('⛔⛔ un redirect non porta il prompt fuori dalla rete autorizzata', () => {
    it('lo streaming si ferma al 30x, e il secondo server non vede niente', async () => {
        const arrivati: string[] = []
        const altrove = await serviamo((_richiesta, risposta) => {
            arrivati.push('il corpo è arrivato al secondo server')
            risposta.end('ok')
        })
        const locale = await serviamo((_richiesta, risposta) => {
            risposta.writeHead(302, { Location: altrove.url })
            risposta.end()
        })

        await expect(talosFetchStream({
            url: locale.url,
            headers: { Authorization: 'Bearer una-chiave-vera' },
            body: { messages: [{ role: 'user', content: 'un segreto' }] },
            onText: () => {},
        } as never)).rejects.toThrow()

        expect(arrivati).toEqual([])
        /*
         * ⛔ Il criterio è QUESTO, non «la chiamata è fallita»: un prompt
         * destinato a un modello locale non deve lasciare la classe di rete
         * autorizzata passando per un salto che nessuno ha guardato.
         */
    })

    it('⭐ e senza redirect lo streaming funziona come sempre', async () => {
        const pezzi: string[] = []
        const locale = await serviamo((_richiesta, risposta) => {
            risposta.writeHead(200, { 'Content-Type': 'text/event-stream' })
            risposta.end('data: [DONE]\n\n')
        })

        await talosFetchStream({
            url: locale.url,
            headers: {},
            body: {},
            onText: (c: string) => pezzi.push(c),
        } as never)
        expect(pezzi.join('')).toContain('[DONE]')
        // ⛔ La cura non deve rompere il caso normale, o si scopre in produzione.
    })
})

describe('⛔⛔ e il trasporto nativo chiede di NON seguirli', () => {
    it('passa `disableRedirects` a ogni richiesta', async () => {
        const spia = vi.fn(async () => ({ status: 200, data: {} }))
        await createTalosMobileHttpTransport(spia as never).request({
            url: 'http://127.0.0.1:11434/api/chat',
            method: 'POST',
            headers: {},
            data: {},
        } as never)

        expect(spia).toHaveBeenCalledWith(expect.objectContaining({ disableRedirects: true }))
        /*
         * ⛔ Qui la prova è per forza strutturale: il ponte nativo non gira su
         * questa macchina. Il comportamento vero si guarda sul dispositivo — è
         * la ragione per cui il test di sopra monta server veri e questo no, e
         * i due non vanno confusi.
         */
    })

    it('⛔ e non lo lascia disattivare da chi chiama', async () => {
        const spia = vi.fn(async () => ({ status: 200, data: {} }))
        await createTalosMobileHttpTransport(spia as never).request({
            url: 'http://127.0.0.1:11434/api/chat',
            method: 'POST',
            headers: {},
            data: {},
            disableRedirects: false,
        } as never)

        expect(spia).toHaveBeenCalledWith(expect.objectContaining({ disableRedirects: true }))
        // ⛔ Un confine che si può spegnere da fuori non è un confine.
    })
})
