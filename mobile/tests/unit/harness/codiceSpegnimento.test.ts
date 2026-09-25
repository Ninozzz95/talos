import { afterEach, describe, expect, it } from 'vitest'
import { createServer, get, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { creaSpegnimento } from '../../../android/app/src/main/assets/talos-harness-ui/harness-ui/src/spegnimento.mjs'

/**
 * ⛔ Difetto 6 del ledger B3, trovato sul Pad il 24/09/2026: dopo reinstallazione e riavvio dell'app restavano DUE
 * server del Codice. Il plugin manda SIGTERM al vecchio, ma lo spegnimento era `server.close(() => process.exit(0))`, e
 * `close()` chiude solo le connessioni INATTIVE (Node, `http.Server.close`, https://nodejs.org/api/http.html, letto il
 * 24/09/2026): un flusso di eventi aperto dall'app un istante prima teneva il processo vivo per sempre, e l'app attaccata
 * al codice vecchio. Cura: `closeAllConnections()` subito DOPO `close()` (come la stessa pagina raccomanda) e una rete
 * di sicurezza che esce comunque.
 */

const serverAperti: Server[] = []
afterEach(async () => {
    for (const server of serverAperti.splice(0)) {
        server.closeAllConnections()
        await new Promise((ok) => server.close(() => ok(undefined)))
    }
})

/** Un server con una rotta a flusso continuo, come `/api/v1/sessions/:id/events`: risponde e non chiude mai. */
async function serverConFlusso(): Promise<{ server: Server, porta: number }> {
    const server = createServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
        res.write('data: {"type":"RunStarted"}\n\n')
    })
    serverAperti.push(server)
    await new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(undefined)))
    return { server, porta: (server.address() as AddressInfo).port }
}

/** Apre il flusso e aspetta il primo evento: da qui la connessione è ATTIVA, come quella dell'app sul Pad. */
async function apriFlusso(porta: number): Promise<IncomingMessage> {
    return new Promise((ok, ko) => {
        const richiesta = get({ host: '127.0.0.1', port: porta, path: '/events' }, (risposta) => {
            risposta.once('data', () => ok(risposta))
        })
        richiesta.on('error', ko)
    })
}

function entro<T>(promessa: Promise<T>, ms: number, cosa: string): Promise<T> {
    return Promise.race([
        promessa,
        new Promise<T>((_ok, ko) => setTimeout(() => ko(new Error(`${cosa}: niente dopo ${ms} ms`)), ms)),
    ])
}

describe('lo spegnimento del server del Codice', () => {
    it('SPEGNI-01 con un flusso di eventi aperto il server esce comunque, subito, e il flusso si chiude', async () => {
        const { server, porta } = await serverConFlusso()
        const flusso = await apriFlusso(porta)
        const chiuso = new Promise((ok) => flusso.once('close', () => ok(undefined)))
        let codiceUscita: number | null = null
        const uscito = new Promise<number>((ok) => {
            const spegni = creaSpegnimento({ server, esci: (codice: number) => { codiceUscita = codice; ok(codice) } })
            spegni()
        })

        expect(await entro(uscito, 1000, 'uscita')).toBe(0)
        await entro(chiuso, 1000, 'chiusura del flusso')
        expect(codiceUscita).toBe(0)
    })

    it('SPEGNI-02 se qualcosa tiene vivo il processo, la rete di sicurezza esce con codice 1', async () => {
        const chiamate: number[] = []
        // Un server il cui `close` non richiama mai: il caso in cui nessuna connessione si chiude.
        const bloccato = { close: () => undefined, closeAllConnections: () => undefined }
        const spegni = creaSpegnimento({
            server: bloccato as never,
            esci: (codice: number) => chiamate.push(codice),
            attesaMassimaMs: 30,
        })

        spegni()
        await new Promise((ok) => setTimeout(ok, 80))

        expect(chiamate).toEqual([1])
    })

    it('SPEGNI-03 SIGINT e SIGTERM insieme spengono UNA volta sola', async () => {
        let chiusure = 0
        let fermate = 0
        const server = { close: (cb: () => void) => { chiusure += 1; cb() }, closeAllConnections: () => undefined }
        const spegni = creaSpegnimento({ server: server as never, fermaAltro: () => { fermate += 1 }, esci: () => undefined })

        spegni()
        spegni()

        expect([chiusure, fermate]).toEqual([1, 1])
    })

    it('SPEGNI-04 server.mjs usa questo spegnimento per SIGINT e SIGTERM, con lo scheduler fermato', () => {
        const sorgente = readFileSync(resolve(__dirname,
            '../../../android/app/src/main/assets/talos-harness-ui/harness-ui/server.mjs'), 'utf8')
        expect(sorgente).toMatch(/const spegni = creaSpegnimento\(\{\s*server,\s*fermaAltro: \(\) => automationScheduler\.ferma\(\)\s*\}\)/)
        expect(sorgente).toContain("process.once('SIGINT', spegni)")
        expect(sorgente).toContain("process.once('SIGTERM', spegni)")
        expect(sorgente).not.toContain('server.close(() => process.exit(0))')
    })
})
