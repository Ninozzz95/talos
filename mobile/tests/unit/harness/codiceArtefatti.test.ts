/*
 * ⛔⛔ 70-B (30/09/2026 notte, contratto desktop 70 + ART-ROTTO) — gli artefatti del Codice, come quelli della chat.
 * Owner: «Riuso della chat» — il server salva l'HTML su disco nella sua cartella di stato, la rotta è dietro il segreto
 * del 70-A, «Apri» porta nella finestra isolata della chat. Ledger
 * `.claude/ragionamento/LEDGER-70B-ARTEFATTI-CODICE-2026-09-30.md`.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { createServer as creaServerHttp } from 'node:http'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { avviaSessione } from '../../../android/app/src/main/assets/talos-harness-ui/harness-ui/src/agent-service.mjs'
import { createHttpApp } from '../../../android/app/src/main/assets/talos-harness-ui/harness-ui/src/http-app.mjs'
import * as archivio from '../../../android/app/src/main/assets/talos-harness-ui/harness-ui/src/artifact-store.mjs'

type Evento = { type: string, content?: string, isError?: boolean, id?: string, titolo?: string }

const cartelle: string[] = []
afterEach(() => {
    for (const cartella of cartelle.splice(0)) rmSync(cartella, { recursive: true, force: true })
})
function cartellaNuova(prefisso: string) {
    const cartella = mkdtempSync(join(tmpdir(), prefisso))
    cartelle.push(cartella)
    return cartella
}

const creaArchivio = (cartella: string) =>
    (archivio as unknown as { creaArchivioArtefatti(o: { cartella: string }): { salva(id: string, html: string): void, leggi(id: string): string | null } })
        .creaArchivioArtefatti({ cartella })

const ID = '3f2b8c1e-9a4d-4e7b-8c21-5d6f7a8b9c0d'
const SEGRETO = 'e'.repeat(64)

describe('ART70 — gli artefatti del Codice sul telefono', () => {
    it('ART70-01 un giro con artifact_create crea l’artefatto: evento ArtifactCreated e il modello legge «created»', async () => {
        const cartella = cartellaNuova('codice-art70-')
        const eventi: Evento[] = []
        const salvati: Array<[string, string]> = []
        let chiamate = 0
        const fetchFinta = async () => {
            chiamate += 1
            const delta = chiamate === 1
                ? { tool_calls: [{ index: 0, id: 'c1', type: 'function', function: { name: 'artifact_create', arguments: JSON.stringify({ titolo: 'Vendite', html: '<!doctype html><p>ok</p>' }) } }] }
                : { content: 'fatto' }
            return new Response(`data: ${JSON.stringify({ choices: [{ delta }] })}\n\ndata: [DONE]\n\n`, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
        }
        await avviaSessione({
            cartella, task: { consegna: 'prova' }, modello: 'x', chiave: 'chiave-finta-mai-usata-in-rete',
            onEvento: (e: Evento) => eventi.push(e),
            strumentiEstesi: ['artifact_create'],
            creaFetchMultiProviderFn: () => fetchFinta,
            politicaRagionamentoFn: async () => null,
            leggiContestoWorkspaceFn: () => ({}),
            salvaArtefattoFn: (id: string, html: string) => { salvati.push([id, html]) },
        } as never)
        const creato = eventi.find((e) => e.type === 'ArtifactCreated')
        expect(creato).toMatchObject({ titolo: 'Vendite' })
        // ⛔ OSS70B-EVENTO-01 (01/10/2026, owner «Dall'evento dell'artefatto»): il modello che ha fatto il giro viaggia con l'evento.
        expect(creato).toMatchObject({ modello: 'x' })
        expect(salvati).toEqual([[creato?.id, '<!doctype html><p>ok</p>']])
        const esito = eventi.find((e) => e.type === 'ToolCallResult')
        expect(esito?.isError).toBe(false)
        expect(esito?.content).toContain('created')
        // L'HTML non viaggia nell'evento dell'artefatto (contratto desktop 70); gli argomenti scritti dal modello restano
        // in ToolCallArgs come per ogni attrezzo.
        expect(JSON.stringify(creato)).not.toContain('<p>ok</p>')
    })

    it('ART70-02 l’archivio sta su disco: un secondo archivio sulla stessa cartella lo rilegge (riavvio del server)', () => {
        const cartella = cartellaNuova('codice-art70-disco-')
        creaArchivio(cartella).salva(ID, '<p>durevole</p>')
        expect(creaArchivio(cartella).leggi(ID)).toBe('<p>durevole</p>')
        expect(readdirSync(cartella)).toEqual([`${ID}.html`])
        expect(readFileSync(join(cartella, `${ID}.html`), 'utf8')).toBe('<p>durevole</p>')
    })

    it('ART70-02b un id che non ha la forma di un UUID non diventa mai un file', () => {
        const cartella = cartellaNuova('codice-art70-id-')
        const a = creaArchivio(cartella)
        for (const id of ['../fuori', 'a/b', '', 'non-un-uuid', `${ID}.html`]) {
            expect(() => a.salva(id, '<p>x</p>'), id).toThrow()
            expect(a.leggi(id), id).toBeNull()
        }
        expect(a.leggi('00000000-0000-4000-8000-000000000000')).toBeNull()
        expect(readdirSync(cartella)).toEqual([])
    })

    it('ART70-03 la rotta GET /api/v1/artifacts/<id>: JSON col segreto, 401 senza, 404 se manca, 400 se l’id non è valido', async () => {
        const cartella = cartellaNuova('codice-art70-rotta-')
        const a = creaArchivio(cartella)
        a.salva(ID, '<p>grafico</p>')
        const app = createHttpApp({
            campaignService: { list: async () => [], get: async () => null }, staticHandler: async () => null,
            segreto: SEGRETO, leggiArtefattoFn: a.leggi,
        } as never)
        const server = creaServerHttp(app as never)
        await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok))
        try {
            const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
            const conSegreto = { Authorization: `Bearer ${SEGRETO}` }
            const trovato = await fetch(`${base}/api/v1/artifacts/${ID}`, { headers: conSegreto })
            expect(trovato.status).toBe(200)
            expect(trovato.headers.get('content-type')).toMatch(/^application\/json/)
            expect((await trovato.json() as { data: { html: string } }).data.html).toBe('<p>grafico</p>')
            expect((await fetch(`${base}/api/v1/artifacts/${ID}`)).status).toBe(401)
            expect((await fetch(`${base}/api/v1/artifacts/00000000-0000-4000-8000-000000000000`, { headers: conSegreto })).status).toBe(404)
            expect((await fetch(`${base}/api/v1/artifacts/non-un-uuid`, { headers: conSegreto })).status).toBe(400)
        } finally {
            server.close()
        }
    })

    it('ART70-05 server.mjs crea l’archivio nella cartella di stato e lo dà al registro e all’app HTTP', () => {
        const sorgente = readFileSync(join(__dirname, '../../../android/app/src/main/assets/talos-harness-ui/harness-ui/server.mjs'), 'utf8')
        expect(sorgente).toMatch(/creaArchivioArtefatti\(\{\s*cartella: join\(config\.cartellaStato .*'artifacts'\)/)
        expect(sorgente).toMatch(/salvaArtefattoFn: archivioArtefatti\.salva/)
        expect(sorgente).toMatch(/leggiArtefattoFn: archivioArtefatti\.leggi/)
    })
})
