import { describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import {
    createTalosReadTools,
} from '@/lib/tools/readTools'
import { createTalosResearchTools } from '@/lib/tools/researchTools'
import { createTalosMemoryWriteTools } from '@/lib/tools/memoryWriteTools'
import { createTalosNotesWriteTools } from '@/lib/tools/notesWriteTools'
import { createTalosTasksWriteTools } from '@/lib/tools/tasksWriteTools'
import { createTalosWebTools } from '@/lib/search/webTools'
import { createTalosDocumentTools } from '@/lib/documents/documentTools'
import { createTalosImageTools } from '@/lib/images/imageTools'
import { createTalosLibraryExportTools } from '@/lib/tools/libraryExportTools'
import { createTalosLibraryContextPolicyTools } from '@/lib/tools/libraryContextPolicyTools'
import { createTalosLocalModelTools } from '@/lib/models/modelTools'
import {
    talosToolRequiredActions,
    talosToolsForAnthropic,
    talosToolsForGemini,
    talosToolsForOpenAi,
} from '@/lib/tools/registry'
import {
    TALOS_DEFAULT_AGENT_TOOL_ENABLED,
    isTalosAgentToolId,
    isTalosAgentToolEnabled,
    parseTalosAgentToolEnabled,
} from '@/lib/tools/toolControls'
import { TALOS_AGENT_TOOL_CONTROLS } from '@/lib/tools/toolControlCatalog'

function everyExecutableTool() {
    return [
        ...createTalosReadTools({
            listLibraryEntries: vi.fn(async () => []),
            listLibraryDocs: vi.fn(async () => []),
            readLibraryDoc: vi.fn(async () => null),
            listNotes: vi.fn(async () => []),
            listTasks: vi.fn(async () => []),
            searchMemories: vi.fn(async () => []),
            now: () => '2026-07-28T00:00:00.000Z',
        }),
        /*
         * `research_list` e `memory_write` mancavano da QUESTA lista, e per
         * questo il test non si era mai accorto che mancassero anche dal
         * catalogo — un controllo di copertura che non conosce due dei suoi
         * oggetti non copre niente, e nel frattempo quei due tool non
         * comparivano né fra gli interruttori né nella pagina dei permessi.
         *
         * Scovato il 2026-08-06 da un secondo test, che confronta il catalogo
         * con l'elenco VERO degli id invece che con una lista scritta a mano.
         *
         * L'ordine è quello di `toolset.ts`, che è la fonte: lettura, ricerca,
         * memoria, note, attività, documenti, immagini.
         */
        ...createTalosResearchTools({
            list: vi.fn(async () => []),
        } as never),
        ...createTalosMemoryWriteTools({
            create: vi.fn(async () => ({ id: 'm1', title: 'x' })),
        } as never),
        ...createTalosNotesWriteTools({
            create: vi.fn(async () => ({ id: 'n1', title: 'x' })),
            update: vi.fn(async () => ({ id: 'n1', title: 'x' })),
            remove: vi.fn(async () => {}),
        }),
        ...createTalosTasksWriteTools({
            create: vi.fn(async () => ({ id: 't1', title: 'x' })),
            setStatus: vi.fn(async () => ({ id: 't1', title: 'x' })),
            remove: vi.fn(async () => {}),
        }),
        ...createTalosWebTools({
            search: vi.fn(async () => []),
            read: vi.fn(async () => null),
            rememberSearch: vi.fn(async () => ({
                policy: 'stored' as const,
                saved: 0,
                skipped: 0,
                failed: 0,
            })),
            remember: vi.fn(async () => {}),
        }),
        ...createTalosDocumentTools({
            generate: vi.fn(),
            verify: vi.fn(),
            save: vi.fn(),
            diagnostics: () => false,
        } as never),
        ...createTalosImageTools({
            provider: vi.fn(() => 'gemini'),
            generate: vi.fn(),
            save: vi.fn(),
        }),
        ...createTalosLibraryExportTools({
            listCandidates: vi.fn(async () => []),
            exportById: vi.fn(),
        } as never),
        ...createTalosLibraryContextPolicyTools({
            read: vi.fn(),
            replace: vi.fn(),
        } as never),
        // The second door onto the on-device models. It takes no sources: it
        // drives the same store the Model Lab section drives, which is what
        // makes a download started from chat land in both places.
        ...createTalosLocalModelTools(),
    ]
}

describe('Agent Tools control registry', () => {
    it('AGENT-TOOLS-01 exactly matches every executable factory and action set', () => {
        const executable = everyExecutableTool()
        const ids = TALOS_AGENT_TOOL_CONTROLS.map((control) => control.id)

        expect(new Set(ids).size).toBe(ids.length)
        expect(ids).toEqual(executable.map((tool) => tool.name))
        for (const tool of executable) {
            const control = TALOS_AGENT_TOOL_CONTROLS.find((entry) => entry.id === tool.name)
            expect(control?.actions, tool.name).toEqual(talosToolRequiredActions(tool))
            expect(isTalosAgentToolId(tool.name), tool.name).toBe(true)
            if (isTalosAgentToolId(tool.name)) {
                expect(typeof TALOS_DEFAULT_AGENT_TOOL_ENABLED[tool.name], tool.name).toBe('boolean')
            }
        }
    })

    it('AGENT-TOOLS-02 preserves current flows, sanitizes values, and fails unknown tools closed', () => {
        expect(TALOS_DEFAULT_AGENT_TOOL_ENABLED.library_context_policy_update).toBe(false)
        expect(Object.entries(TALOS_DEFAULT_AGENT_TOOL_ENABLED)
            .filter(([id]) => id !== 'library_context_policy_update')
            .every(([, value]) => value)).toBe(true)

        const parsed = parseTalosAgentToolEnabled({
            library_search: false,
            web_search: 'yes',
            future_shell: true,
        })

        expect(parsed.library_search).toBe(false)
        expect(parsed.web_search).toBe(true)
        expect(parsed).not.toHaveProperty('future_shell')
        expect(parsed.library_context_policy_update).toBe(false)
        expect(Object.keys(parsed)).toHaveLength(34)
        expect(isTalosAgentToolEnabled('library_search', parsed)).toBe(false)
        expect(isTalosAgentToolEnabled('future_shell', parsed)).toBe(false)
    })

    it('P1-CTX-COMPAT-09 keeps every pre-existing public tool contract byte-compatible', () => {
        const tools = everyExecutableTool()
            .filter((tool) => tool.name !== 'library_context_policy_update')
        /**
         * Pinned per surface rather than as one hash over all four.
         *
         * A single digest made every provider dialect share one number, so
         * repairing the schema for ONE provider forced an update to a value
         * that also stood for the other three — and the reviewer of that commit
         * could not tell from the diff whether Anthropic had moved too. Which
         * is precisely what happened on 2026-07-30: Gemini refused
         * `enum: [1]` (its enum is string-only), the fix changed the Gemini
         * dialect alone, and the combined hash could not say so.
         *
         * Split, the guard answers the question it exists to answer.
         */
        const digestOf = (value: unknown): string =>
            createHash('sha256').update(JSON.stringify(value)).digest('hex')

        const controlPlaneOf = (list: typeof tools) => list.map((tool) => ({
            name: tool.name,
            title: tool.title,
            actions: talosToolRequiredActions(tool),
        }))
        const controlPlane = controlPlaneOf(tools)

        /**
         * Re-pinned 2026-07-31, twice: first for `library_file_origin`, then
         * for the four `local_model*` tools — the second door onto the
         * on-device models.
         *
         * Proven both times, not assumed. Excluding the new tools reproduced
         * all four previous digests byte for byte, so nothing about the
         * pre-existing contracts moved — which is the only question this guard
         * exists to answer, and the reason the four are pinned separately.
         */
        /**
         * Ri-fissati 2026-08-05/06 per i SEI tool di scrittura di note e
         * attività — `notes_*` prima, `tasks_*` subito dopo, per la stessa
         * ragione: entrambe le funzioni si potevano solo elencare. Il blocco
         * «senza i nuovi» qui sotto li esclude tutti e sei insieme.
         *
         * Nota storica dei tre tool di SCRITTURA delle note —
         * `notes_create`, `notes_update`, `notes_delete` — la seconda porta che
         * mancava alla funzione (owner: «devono avere i propri tool di lettura e
         * scrittura da chat»).
         *
         * **Dimostrato, non assunto**, come le due volte precedenti: togliendo i
         * tre nuovi si riproducono TUTTI E SETTE i digest precedenti byte per
         * byte. Cioè nessun contratto preesistente si è mosso, che è l'unica
         * domanda a cui questa guardia serve a rispondere. La prova è qui sotto
         * e resta eseguibile: se un giorno un tool vecchio cambiasse insieme a
         * uno nuovo, sarebbe questo blocco a cadere, non quello in fondo.
         */
        const withoutNotesWrite = tools.filter((tool) => ![
            'notes_create', 'notes_update', 'notes_delete',
            'tasks_create', 'tasks_complete', 'tasks_delete',
            // 2026-08-06: `research_list` e `memory_write` non erano MAI stati
            // in questa lista, pur esistendo da settimane — quindi rispetto ai
            // digest storici sono «nuovi» esattamente come lo erano gli altri.
            'research_list', 'memory_write',
        ].includes(tool.name))
        expect(digestOf(controlPlaneOf(withoutNotesWrite)))
            .toBe('369a6da1a52e717bbe9e92b780151ac3da57352d21177064cf399a81356fff67')

        /*
         * Ri-fissato 2026-08-06 per `research_list` e `memory_write`, che
         * esistevano da settimane ma non erano MAI entrati in questa lista —
         * quindi la guardia non li ha mai guardati, e nel frattempo non
         * comparivano neppure fra gli interruttori né nell'elenco dei permessi.
         *
         * **Dimostrato, non assunto**, come le volte precedenti: il blocco qui
         * sopra li esclude e riproduce `294015f4…` byte per byte. Nessun
         * contratto preesistente si è mosso; è cresciuta la lista, non il
         * contratto.
         */
        expect(digestOf(controlPlane))
            .toBe('695e00014a662d6eeb3440a53a36eb310b1491de9e588e6084a33fe9552587e4')
        /**
         * Re-pinned 2026-08-01 for the three DIALECT digests only — the control
         * plane above did not move, which is the proof that nothing structural
         * changed: only two descriptions did.
         *
         * Why they changed is worth keeping. `web_search` and `web_read` used to
         * end their description with "so this requires outbound and write
         * permission". A description is sent TO THE MODEL, and a model told that
         * a tool needs permissions it cannot inspect will explain the
         * permissions to the user instead of calling the tool. That is exactly
         * what it did: the tool was offered, the policy said `ask`, and the
         * answer was a polite lecture about Settings. The model is not the
         * permission gate — the gate is, and it asks the user at call time.
         */
        /**
         * Ripinnati 2026-08-04 per `generate_image`, che ha guadagnato
         * `from_image` — l'immagine da cui partire invece di disegnare da zero.
         *
         * **Tutti e tre i dialetti si sono mossi, il piano di controllo NO.** È
         * esattamente la lettura che questa separazione esiste per permettere:
         * il contratto pubblico (nome, titolo, azioni richieste) è identico, e
         * a cambiare è solo lo schema degli argomenti — cioè si è aggiunto un
         * parametro opzionale, non si è toccato cosa il tool può fare né quali
         * permessi pretende.
         *
         * Se il piano di controllo si fosse mosso insieme a loro, la domanda da
         * farsi sarebbe stata un'altra.
         */
        /*
         * Ri-fissate 2026-08-04: `generate_image` ha guadagnato `mask` — DOVE
         * modificare. Tutti e tre i dialetti si sono mossi, come dev'essere: e'
         * lo stesso contratto tradotto tre volte. Il piano di controllo NO: se
         * si fosse mosso anche lui, la domanda da farsi sarebbe stata un'altra.
         */
        /**
         * Ri-fissate 2026-08-05 per C45-RED-08K: il runtime ora ammette due
         * download attivi più coda, quindi la descrizione data al modello non
         * può continuare a dichiararne uno. Ricostruire la sola descrizione
         * precedente deve riprodurre tutti e tre i digest precedenti: è la
         * prova automatica che nomi e input schema non si sono mossi insieme.
         */
        const previousDownloadDescription = 'Start downloading one model file set onto this device. Call '
            + 'local_model_inspect first and tell the user what it will cost them in space and '
            + 'data before asking. Only one download runs at a time.'
        const beforeDescriptionUpdate = withoutNotesWrite.map((tool) => (
            tool.name === 'local_model_download'
                ? { ...tool, description: previousDownloadDescription }
                : tool
        ))
        expect(digestOf(talosToolsForAnthropic(beforeDescriptionUpdate as never)))
            .toBe('75d9782cd2c555ac0fd7ca0fa9eb59b666ea0e834d7d0907615a919bd7e46ec6')
        expect(digestOf(talosToolsForOpenAi(beforeDescriptionUpdate as never)))
            .toBe('b0681b4eb5360b75fef3ed62c5db431e0976098c1cf89aec9e3745003de25819')
        expect(digestOf(talosToolsForGemini(beforeDescriptionUpdate as never)))
            .toBe('be971a4fccdb1a4ce451a12783f87a84b5e721b9fa7a4f4361508bb1508336c0')

        // Gli stessi tre dialetti SENZA i tool nuovi: identici a ieri.
        expect(digestOf(talosToolsForAnthropic(withoutNotesWrite as never)))
            .toBe('8903bcf9aad1954b61d2bed23eacc170c0259b78fa0a293cef0927129373d3f5')
        expect(digestOf(talosToolsForOpenAi(withoutNotesWrite as never)))
            .toBe('9291e14e238147c8459bef3a66a0f9dae841130b40fb67f927bcf67e9969b058')
        expect(digestOf(talosToolsForGemini(withoutNotesWrite as never)))
            .toBe('61745afe6d79da05fa2d982bc4cc3bd9256305f66d4caaa15f3d386772565e62')

        // E con i tre nuovi dentro: il contratto pubblico di oggi.
        expect(digestOf(talosToolsForAnthropic(tools as never)))
            .toBe('93acd6b8b8939ecaaf9b140acbbfa30f43a5aaf4ea7400df067af6ca2c89d55e')
        expect(digestOf(talosToolsForOpenAi(tools as never)))
            .toBe('34a3b23679ba860c822a69418c3be0abac6a8f7953234b18fcc6401580c4b0f9')
        expect(digestOf(talosToolsForGemini(tools as never)))
            .toBe('d15af88ca43d2ea3bdb1d9401bb0759ef6ad18fdb4ff7687a0028aa51445635a')
    })
})
