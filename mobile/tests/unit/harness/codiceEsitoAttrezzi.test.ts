import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// Il server importa il kernel col percorso del telefono: `vitest.config.ts` lo mappa sul kernel spedito nell'APK.
import { avviaSessione } from '../../../android/app/src/main/assets/talos-harness-ui/harness-ui/src/agent-service.mjs'
import { createSessionRegistry } from '../../../android/app/src/main/assets/talos-harness-ui/harness-ui/src/session-registry.mjs'

/**
 * ⛔ ESITO65 (30/09/2026) — consegna desktop 65 (RECEIPT25), ledger
 * `.claude/ragionamento/LEDGER-65-ESITO-ATTREZZI-2026-09-30.md`. Dal kernel al server: il fallimento di un attrezzo
 * arriva sull'evento `ToolCallResult` come `isError` (lo stesso nome di MCP 2025-11-25), perché AG-UI non ha un campo
 * di errore nel verso agente→client. E un artefatto troppo grande non si racconta più come «created» (owner 30/09,
 * «Curo anche questo»).
 */

type Evento = { type: string, content?: string, isError?: boolean, toolCallId?: string }

const cartelle: string[] = []
afterEach(() => {
    for (const cartella of cartelle.splice(0)) rmSync(cartella, { recursive: true, force: true })
})

/** Un fornitore finto che parla SSE come OpenRouter: una risposta per chiamata, nell'ordine. */
function fornitoreSse(...delta: Array<Record<string, unknown>>) {
    let chiamate = 0
    return async () => {
        const scelto = delta[Math.min(chiamate, delta.length - 1)]
        chiamate += 1
        const corpo = `data: ${JSON.stringify({ choices: [{ delta: scelto }] })}\n\ndata: [DONE]\n\n`
        return new Response(corpo, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
    }
}

const chiamataAttrezzo = (nome: string, argomenti: Record<string, unknown>) => ({
    tool_calls: [{ index: 0, id: 'c1', type: 'function', function: { name: nome, arguments: JSON.stringify(argomenti) } }],
})

async function sessione(nome: string, argomenti: Record<string, unknown>, opzioni: Record<string, unknown>) {
    const cartella = mkdtempSync(join(tmpdir(), 'codice-esito65-'))
    cartelle.push(cartella)
    const eventi: Evento[] = []
    const fetchFinta = fornitoreSse(chiamataAttrezzo(nome, argomenti), { content: 'fatto' })
    await avviaSessione({
        cartella, task: { consegna: 'prova' }, modello: 'x', chiave: 'chiave-finta-mai-usata-in-rete',
        onEvento: (e: Evento) => eventi.push(e),
        strumentiEstesi: [nome],
        creaFetchMultiProviderFn: () => fetchFinta,
        politicaRagionamentoFn: async () => null,
        leggiContestoWorkspaceFn: () => ({}),
        salvaArtefattoFn: () => undefined,
        ...opzioni,
    })
    return eventi
}

describe('ESITO65 — il server porta il fallimento di un attrezzo fino alla UI', () => {
    it('ESITO65-SERVER-01 una nota che non si cancella arriva come ToolCallResult con isError:true', async () => {
        const eventi = await sessione('notes_delete', { id: 'x' }, {
            eliminaNotaFn: async () => { throw new Error('TALOS_NOTE_NOT_FOUND') },
        })
        const risultato = eventi.find((e) => e.type === 'ToolCallResult')
        expect(risultato).toMatchObject({ content: 'notes_delete failed: TALOS_NOTE_NOT_FOUND', isError: true })
    })

    it('ESITO65-SERVER-02 un attrezzo riuscito arriva con isError:false', async () => {
        const eventi = await sessione('notes_create', { title: 'Spesa', content: 'latte' }, {
            creaNotaFn: async (input: { title: string }) => ({ id: 'n1', title: input.title }),
        })
        expect(eventi.find((e) => e.type === 'ToolCallResult')).toMatchObject({ content: 'saved: "Spesa" (id: n1)', isError: false })
    })

    it('ESITO65-ART-02 un artefatto oltre il tetto non viene creato e il modello lo sa', async () => {
        const html = `<p>${'x'.repeat(400_001)}</p>`
        const eventi = await sessione('artifact_create', { titolo: 'Grande', html }, {})
        expect(eventi.some((e) => e.type === 'ArtifactCreated')).toBe(false)
        expect(eventi.find((e) => e.type === 'ToolCallResult')).toMatchObject({
            content: 'artifact_create failed: the page is larger than the limit (400 KB): nothing was created.',
            isError: true,
        })
    })
})

/*
 * ⛔ ART-ROTTO (30/09/2026, trovato scrivendo ESITO65-ART-03): sul telefono ogni `artifact_create` finiva con
 * «error: artifactCreated is not defined» (import mancante dal 03/09), e la scheda avrebbe aperto un iframe su
 * `/api/v1/artifacts/<id>`, rotta che il server del telefono non ha. Owner 30/09: «Tolgo ora, completo nella 70» —
 * nessuna funzione finta: il modello non se lo vede offrire finché la rotta protetta non esiste.
 *
 * ⛔ 70-B (30/09/2026 notte, owner «Riuso della chat»): la rotta protetta c'è, la scheda apre la finestra isolata della
 * chat. ART-ROTTO-01 («non si offre») diventa ART-ROTTO-02 («si offre di nuovo, e il salvataggio arriva alla sessione»):
 * cambio voluto, ledger `.claude/ragionamento/LEDGER-70B-ARTEFATTI-CODICE-2026-09-30.md`.
 */
describe('ART-ROTTO — il Codice del telefono offre artifact_create solo quando lo sa mostrare', () => {
    it('ART-ROTTO-02 una sessione del telefono offre di nuovo artifact_create e riceve dove salvarlo', async () => {
        const salvaArtefattoFn = () => undefined
        const ricevuti: Array<Record<string, unknown>> = []
        const registro = createSessionRegistry({
            cartellaStore: '/finta',
            chiave: 'chiave-finta-mai-usata-in-rete',
            registraRigaFn: async () => undefined,
            elencaSessioniPersistiteFn: async () => [],
            preparaEsecuzioneLiberaFn: () => ({ cartella: '/finta/workspace', task: { consegna: 'ciao' }, comandoProva: null }),
            avviaSessioneFn: async (argomenti: Record<string, unknown>) => {
                ricevuti.push(argomenti)
                return { threadId: 't', runId: 'r', ok: true, esito: { comeFinita: 'concluso' }, erroreInterno: null }
            },
            salvaArtefattoFn,
        } as never)
        registro.avviaLibero({ cartellaId: 'workspace', consegna: 'ciao', modello: 'z-ai/glm-5.3-flash', mobile: true } as never)
        await new Promise((ok) => setTimeout(ok, 0))
        const offerti = ricevuti[0]?.strumentiEstesi as string[]
        expect(offerti).toContain('artifact_create')
        expect(offerti).toEqual(expect.arrayContaining(['web_search', 'document_create', 'time_now', 'notes_create', 'generate_image']))
        expect(ricevuti[0]?.salvaArtefattoFn).toBe(salvaArtefattoFn)
    })
})
