import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryChatRepository } from '@/repositories/memoryChatRepository'
import type { TalosChatRepository } from '@/repositories/chatRepository'

/**
 * ⭐⭐⭐ 30/8 — il ponte verso Note/Attività/Memoria/Libreria del telefono
 * per il kernel dell'harness. Owner, correggendo un errore: quei sistemi
 * esistono già, maturi e testati (`@/lib/tools/toolset.ts` — la chat
 * normale li ha da settimane) — questo file NON li ricostruisce, legge
 * la STESSA `productionChatRepository`. Stesso schema di
 * `codiceSessions.test.ts`: la SAME in-memory repository che l'app usa
 * per le chat effimere, un'implementazione REALE dell'interfaccia, non
 * un mock scritto a mano.
 */
const repo = vi.hoisted(() => ({ current: null as TalosChatRepository | null }))
vi.mock('@/repositories/productionChatRepositorySingleton', () => ({
    get productionChatRepository() { return repo.current },
}))

import {
    listCodiceNotes,
    listCodiceTasks, createCodiceTask, setCodiceTaskStatus, updateCodiceTask, deleteCodiceTask,
    searchCodiceMemories, createCodiceMemory, updateCodiceMemoryByTitle, deleteCodiceMemoryByTitle,
    listCodiceLibraryEntries, readCodiceLibraryDoc, renameCodiceLibraryFile, deleteCodiceLibraryFile,
    searchCodiceLibrary, readCodiceLibraryFileOrigin,
    listCodiceResearch, readCodiceResearchReport,
} from '@/lib/harness/codiceDati'

beforeEach(() => {
    repo.current = createMemoryChatRepository()
})

describe('codiceDati (30/8) — il ponte verso i dati del telefono per il kernel dell\'harness', () => {
    it('listCodiceNotes torna le note VERE, forma pulita per il kernel (id/title/content/updatedAt)', async () => {
        await repo.current?.createNote({
            id: 'n1', title: 'Spesa', content: 'latte, pane', created_at: '2026-08-30T00:00:00.000Z',
        })

        const note = await listCodiceNotes()

        expect(note).toEqual([
            { id: 'n1', title: 'Spesa', content: 'latte, pane', updatedAt: '2026-08-30T00:00:00.000Z' },
        ])
    })

    it('⛔ AL CONTRARIO — zero note salvate: un array vuoto VERO, mai un errore, mai un dato inventato', async () => {
        await expect(listCodiceNotes()).resolves.toEqual([])
    })

    it('listCodiceNotes rispecchia OGNI nota, non solo la prima — nessun tetto silenzioso', async () => {
        await repo.current?.createNote({ id: 'n1', title: 'Uno', content: 'a', created_at: '2026-08-30T00:00:00.000Z' })
        await repo.current?.createNote({ id: 'n2', title: 'Due', content: 'b', created_at: '2026-08-30T00:01:00.000Z' })
        await repo.current?.createNote({ id: 'n3', title: 'Tre', content: 'c', created_at: '2026-08-30T00:02:00.000Z' })

        const note = await listCodiceNotes()

        // ⛔ Trovato con un fallimento reale, non assunto: la repository torna
        // le note più recenti PER PRIME (stesso ordine di listCodiceSessions,
        // verificato in codiceSessions.test.ts) — questo file è un passthrough
        // puro, non riordina niente di suo, quindi eredita quell'ordine.
        expect(note.map((n) => n.id)).toEqual(['n3', 'n2', 'n1'])
    })

    describe('Attività — round trip vero, nessuna pianificazione esposta (di proposito, vedi la nota d\'apertura del file)', () => {
        it('createCodiceTask → listCodiceTasks → setCodiceTaskStatus → updateCodiceTask → deleteCodiceTask, ogni passo sulla riga vera', async () => {
            const creata = await createCodiceTask({ title: 'Comprare il pane', description: null, priority: 'normal' })
            expect(creata).toMatchObject({ title: 'Comprare il pane', status: 'todo', priority: 'normal' })

            expect((await listCodiceTasks()).map((t) => t.id)).toEqual([creata.id])

            const fatta = await setCodiceTaskStatus(creata.id, 'done')
            expect(fatta.status).toBe('done')

            const rinominata = await updateCodiceTask(creata.id, { title: 'Comprare pane e latte', priority: 'high' })
            expect(rinominata).toMatchObject({ title: 'Comprare pane e latte', priority: 'high', status: 'done' })

            await deleteCodiceTask(creata.id)
            expect(await listCodiceTasks()).toEqual([])
        })

        it('⛔ AL CONTRARIO — zero attività salvate: un array vuoto VERO', async () => {
            await expect(listCodiceTasks()).resolves.toEqual([])
        })
    })

    describe('Memoria — nessun id, si opera per titolo (stesso limite di sources.searchMemories sulla chat)', () => {
        it('createCodiceMemory → searchCodiceMemories la trova → updateCodiceMemoryByTitle la cambia → deleteCodiceMemoryByTitle la toglie', async () => {
            await createCodiceMemory({ title: 'Preferenza caffè', content: 'lo beve senza zucchero' })

            expect(await searchCodiceMemories('zucchero')).toEqual([{ title: 'Preferenza caffè', content: 'lo beve senza zucchero' }])
            // ⛔ AL CONTRARIO — un termine assente non trova nulla, mai un fallback generoso
            expect(await searchCodiceMemories('parola-mai-scritta-da-nessuna-parte')).toEqual([])

            const aggiornata = await updateCodiceMemoryByTitle('Preferenza caffè', { content: 'lo beve con un cucchiaino di zucchero' })
            expect(aggiornata).toEqual({ title: 'Preferenza caffè' })
            expect(await searchCodiceMemories('cucchiaino')).toEqual([{ title: 'Preferenza caffè', content: 'lo beve con un cucchiaino di zucchero' }])

            expect(await deleteCodiceMemoryByTitle('Preferenza caffè')).toBe(true)
            expect(await searchCodiceMemories('cucchiaino')).toEqual([])
        })

        it('⛔ AL CONTRARIO — un titolo che non esiste: update torna null, delete torna false, mai un errore generico', async () => {
            expect(await updateCodiceMemoryByTitle('Titolo mai scritto', { content: 'x' })).toBeNull()
            expect(await deleteCodiceMemoryByTitle('Titolo mai scritto')).toBe(false)
        })
    })

    describe('Libreria — solo testo, il ramo immagine torna un avviso invece del binario', () => {
        it('listCodiceLibraryEntries → readCodiceLibraryDoc → renameCodiceLibraryFile → deleteCodiceLibraryFile, sulla riga vera', async () => {
            await repo.current?.createVaultFile({
                id: 'f1', display_name: 'ricetta.txt', media_type: 'text/plain', size_bytes: 12,
                private_uri: 'file:///f1', status: 'available', trust: 'untrusted',
                sha256: null, extracted_text: 'farina, acqua, sale', failure_code: null, created_at: '2026-08-30T00:00:00.000Z',
            })

            expect(await listCodiceLibraryEntries()).toEqual([{ id: 'f1', displayName: 'ricetta.txt', mediaType: 'text/plain' }])
            expect(await readCodiceLibraryDoc('f1')).toEqual({ name: 'ricetta.txt', text: 'farina, acqua, sale' })

            const rinominato = await renameCodiceLibraryFile('f1', 'ricetta-pane.txt')
            expect(rinominato).toEqual({ id: 'f1', name: 'ricetta-pane.txt' })

            expect(await deleteCodiceLibraryFile('f1')).toBe(true)
            expect(await listCodiceLibraryEntries()).toEqual([])
        })

        it('⛔ AL CONTRARIO — un file immagine: readCodiceLibraryDoc torna un avviso, mai il testo vuoto letto come "nessun contenuto"', async () => {
            await repo.current?.createVaultFile({
                id: 'f2', display_name: 'foto.jpg', media_type: 'image/jpeg', size_bytes: 900,
                private_uri: 'file:///f2', status: 'available', trust: 'untrusted',
                sha256: null, extracted_text: null, failure_code: null, created_at: '2026-08-30T00:00:00.000Z',
            })

            const doc = await readCodiceLibraryDoc('f2')
            expect(doc?.name).toBe('foto.jpg')
            expect(doc?.text).toMatch(/immagine/)
        })

        it('⛔ AL CONTRARIO — un id che non esiste: read/rename/delete tornano tutti onestamente "niente qui", mai un errore generico', async () => {
            expect(await readCodiceLibraryDoc('mai-esistito')).toBeNull()
            expect(await renameCodiceLibraryFile('mai-esistito', 'x')).toBeNull()
            expect(await deleteCodiceLibraryFile('mai-esistito')).toBe(false)
        })
    })

    /**
     * ⭐⭐⭐ 2/9 — chiude il gap trovato ispezionando
     * `lane/harness-mobile-bridge-kernel`: due attrezzi REALI della chat
     * normale (readTools.ts), mai collegati qui prima d'ora.
     */
    describe('Libreria — ricerca e provenienza (2/9, gap chiuso contro la chat normale)', () => {
        it('searchCodiceLibrary classifica per pertinenza, il titolo pesa più del corpo', async () => {
            await repo.current?.createVaultFile({
                id: 'f1', display_name: 'note.txt', media_type: 'text/plain', size_bytes: 10,
                private_uri: 'file:///f1', status: 'available', trust: 'untrusted',
                sha256: null, extracted_text: 'una menzione isolata di quarzo qui dentro', failure_code: null,
                created_at: '2026-09-01T00:00:00.000Z',
            })
            await repo.current?.createVaultFile({
                id: 'f2', display_name: 'quarzo.txt', media_type: 'text/plain', size_bytes: 10,
                private_uri: 'file:///f2', status: 'available', trust: 'untrusted',
                sha256: null, extracted_text: 'proprietà del quarzo rosa', failure_code: null,
                created_at: '2026-09-02T00:00:00.000Z',
            })

            const trovati = await searchCodiceLibrary('quarzo')

            expect(trovati.map((h) => h.id)).toEqual(['f2', 'f1'])
            expect(trovati[0]).toMatchObject({ id: 'f2', displayName: 'quarzo.txt', mediaType: 'text/plain' })
            expect(trovati[0].excerpt).toContain('quarzo')
        })

        it('⛔ AL CONTRARIO — un termine che non compare in nessun file: nessun risultato, mai un fallback per recency', async () => {
            await repo.current?.createVaultFile({
                id: 'f1', display_name: 'note.txt', media_type: 'text/plain', size_bytes: 10,
                private_uri: 'file:///f1', status: 'available', trust: 'untrusted',
                sha256: null, extracted_text: 'niente a che fare con la ricerca', failure_code: null,
                created_at: '2026-09-01T00:00:00.000Z',
            })

            expect(await searchCodiceLibrary('parola-mai-scritta-da-nessuna-parte')).toEqual([])
        })

        it('readCodiceLibraryFileOrigin legge la provenienza vera dal file generato', async () => {
            await repo.current?.createVaultFile({
                id: 'f3', display_name: 'grafico.png', media_type: 'image/png', size_bytes: 500,
                private_uri: 'file:///f3', status: 'available', trust: 'untrusted',
                sha256: null, extracted_text: null, failure_code: null, created_at: '2026-09-02T10:00:00.000Z',
                metadata: {
                    provenance: {
                        schema: 1, origin: 'generated', createdAt: '2026-09-02T10:00:00.000Z',
                        model: 'gemini-3.7-flash', provider: 'google', modelVersion: null,
                        originSessionId: 's1', promptMessageId: 'm1', toolName: 'generate_image',
                        sourceUrl: null, perceptualHash: null, seal: null,
                    },
                },
            })

            expect(await readCodiceLibraryFileOrigin('f3')).toEqual({
                name: 'grafico.png', origin: 'generated', model: 'gemini-3.7-flash', provider: 'google',
                createdAt: '2026-09-02T10:00:00.000Z', sourceUrl: null,
            })
        })

        it('⛔ AL CONTRARIO — un file SENZA provenienza registrata: origin "unknown", mai un dato inventato', async () => {
            await repo.current?.createVaultFile({
                id: 'f4', display_name: 'appunto.txt', media_type: 'text/plain', size_bytes: 5,
                private_uri: 'file:///f4', status: 'available', trust: 'untrusted',
                sha256: null, extracted_text: 'x', failure_code: null, created_at: '2026-09-02T00:00:00.000Z',
            })

            expect(await readCodiceLibraryFileOrigin('f4')).toEqual({
                name: 'appunto.txt', origin: 'unknown', model: null, provider: null, createdAt: null, sourceUrl: null,
            })
        })

        it('⛔ AL CONTRARIO — un id che non esiste: null, non un errore', async () => {
            expect(await readCodiceLibraryFileOrigin('mai-esistito')).toBeNull()
        })
    })

    /**
     * ⭐⭐⭐ 30/8 — terzo passo dello stesso giorno: Ricerca, SOLO lettura.
     * Il giornale e il file di Libreria sono seminati con le STESSE
     * funzioni di scrittura del repository (`appendResearchEvent`/
     * `upsertResearchRun`/`createVaultFile`) che la stazione userebbe
     * davvero — non un fixture inventato a mano, il formato del rapporto
     * (fence `talos-research-report` + JSON) è quello vero letto in
     * `researchReport.ts`.
     */
    describe('Ricerca — SOLO lettura, il rapporto ricostruito dal giornale + il file di Libreria', () => {
        async function seminaRicerca(overrides: { conRapporto?: boolean } = {}) {
            const { conRapporto = true } = overrides
            // ⛔ status/updated_at qui sono quelli che una riga "sul disco"
            // avrebbe — MA listCodiceResearch legge lo status dalla
            // ricostruzione via `talosResearchReplay`, non da questa riga
            // (la riga è solo l'indice per trovare l'id, verificato leggendo
            // researchRuntime.ts's `all()`): la riga stessa non decide nulla.
            await repo.current?.upsertResearchRun({
                id: 'r1', session_id: 's1', question: 'Quali fornitori convengono?', depth: 'deep', engine: 'device',
                status: 'done', started_at: '2026-08-29T00:00:00.000Z', updated_at: '2026-08-29T00:10:00.000Z',
            })
            const eventi: Array<{ kind: string, payload: object }> = [
                { kind: 'run_started', payload: { kind: 'run_started', at: '2026-08-29T00:00:00.000Z', id: 'r1', sessionId: 's1', question: 'Quali fornitori convengono?', depth: 'deep', engine: 'device' } },
            ]
            if (conRapporto) {
                let rapportoId = ''
                await repo.current?.createVaultFile({
                    id: 'rapporto-r1', display_name: 'Quali fornitori convengono? — rapporto.md', media_type: 'text/markdown',
                    size_bytes: 100, private_uri: 'file:///rapporto-r1', status: 'available', trust: 'untrusted',
                    sha256: null, failure_code: null, created_at: '2026-08-29T00:09:00.000Z',
                    extracted_text: [
                        '# Quali fornitori convengono?',
                        '',
                        'Il fornitore A costa meno, il fornitore B consegna prima.',
                        '',
                        '```talos-research-report',
                        JSON.stringify({
                            version: 1, question: 'Quali fornitori convengono?', summary: 'Il fornitore A costa meno, il fornitore B consegna prima.', judge: null,
                            claims: [
                                { text: 'Il fornitore A costa il 12% in meno', sourceIndex: 1, passage: 'prezzo scontato del 12%', checks: {} },
                                { text: 'Il fornitore B consegna in 2 giorni', sourceIndex: 2, passage: 'consegna in 48 ore', checks: {} },
                            ],
                            sources: [],
                        }),
                        '```',
                        '',
                    ].join('\n'),
                })
                rapportoId = 'rapporto-r1'
                eventi.push(
                    { kind: 'step_started', payload: { kind: 'step_started', at: '2026-08-29T00:08:00.000Z', stepId: 'synthesis', branchId: 'b1', stepKind: 'synthesise' } },
                    { kind: 'step_finished', payload: { kind: 'step_finished', at: '2026-08-29T00:09:00.000Z', stepId: 'synthesis', spend: { tokens: 500, searches: 0, pages: 0 }, resultRef: rapportoId } },
                )
            }
            // Un run_finished su una ricerca senza sintesi conclusa sarebbe
            // un giornale che mente (finita, ma senza rapporto) — qui si
            // emette SOLO quando il rapporto c'è davvero, come farebbe la
            // stazione vera.
            if (conRapporto) eventi.push({ kind: 'run_finished', payload: { kind: 'run_finished', at: '2026-08-29T00:10:00.000Z' } })
            for (const [indice, evento] of eventi.entries()) {
                await repo.current?.appendResearchEvent({ run_id: 'r1', seq: indice, kind: evento.kind, at: '2026-08-29T00:00:00.000Z', payload_json: JSON.stringify(evento.payload) })
            }
        }

        it('listCodiceResearch → readCodiceResearchReport: il rapporto vero, ricostruito dal giornale + Libreria', async () => {
            await seminaRicerca()

            const elenco = await listCodiceResearch()
            expect(elenco).toEqual([{ id: 'r1', title: 'Quali fornitori convengono?', status: 'done', startedAt: '2026-08-29T00:00:00.000Z' }])

            const rapporto = await readCodiceResearchReport('r1')
            expect(rapporto).toContain('# Quali fornitori convengono?')
            expect(rapporto).toContain('Il fornitore A costa meno, il fornitore B consegna prima.')
            expect(rapporto).toContain('1. Il fornitore A costa il 12% in meno')
            expect(rapporto).toContain('2. Il fornitore B consegna in 2 giorni')
        })

        it('⛔ AL CONTRARIO — zero ricerche salvate: un array vuoto VERO', async () => {
            await expect(listCodiceResearch()).resolves.toEqual([])
        })

        it('⛔ AL CONTRARIO — un id che non esiste: readCodiceResearchReport torna null, mai un rapporto inventato', async () => {
            await expect(readCodiceResearchReport('mai-esistita')).resolves.toBeNull()
        })

        it('⛔ AL CONTRARIO — una ricerca ancora in corso, senza passo di sintesi concluso: null, non un rapporto a metà', async () => {
            await seminaRicerca({ conRapporto: false })

            // 'planning': lo status vero subito dopo run_started, prima di
            // qualunque passo — non 'running', verificato leggendo il
            // reducer invece di assumerlo (talosResearchApply, run_started).
            const elenco = await listCodiceResearch()
            expect(elenco).toEqual([{ id: 'r1', title: 'Quali fornitori convengono?', status: 'planning', startedAt: '2026-08-29T00:00:00.000Z' }])
            await expect(readCodiceResearchReport('r1')).resolves.toBeNull()
        })
    })
})
