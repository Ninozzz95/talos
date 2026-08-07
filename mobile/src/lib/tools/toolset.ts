import { createTalosMemoryWriteTools } from '@/lib/tools/memoryWriteTools'
import { createTalosLibraryWriteTools } from '@/lib/tools/libraryWriteTools'
import { createTalosNotesWriteTools } from '@/lib/tools/notesWriteTools'
import { createTalosTasksWriteTools } from '@/lib/tools/tasksWriteTools'
import { talosBytesToBase64 } from '@/lib/bytesToBase64'
import {
    createTalosReadTools,
    type TalosLibraryListEntry,
    type TalosToolSources,
} from '@/lib/tools/readTools'
import { parseTalosFileProvenance } from '@/lib/files/provenance'
import { createTalosWebTools, type TalosWebToolSources } from '@/lib/search/webTools'
import {
    createTalosResearchTools,
    type TalosResearchToolSources,
} from '@/lib/tools/researchTools'
import { createTalosDocumentTools, type TalosDocumentToolSources } from '@/lib/documents/documentTools'
import { createTalosImageTools, type TalosImageToolSources } from '@/lib/images/imageTools'
import {
    createTalosLibraryExportTools,
    type TalosLibraryExportCandidate,
} from '@/lib/tools/libraryExportTools'
import {
    createTalosLibraryContextPolicyTools,
    type TalosLibraryContextPolicyToolSources,
} from '@/lib/tools/libraryContextPolicyTools'
import { createTalosLocalModelTools } from '@/lib/models/modelTools'
import type { TalosToolAuditRow } from '@/lib/tools/executor'
import type { TalosToolConsentRequest } from '@/lib/tools/executor'
import { decideTalosToolPermission, type TalosToolPermissions } from '@/lib/tools/permissionTypes'
import {
    isTalosAgentToolEnabled,
    type TalosAgentToolEnabled,
} from '@/lib/tools/toolControls'
import { talosToolRequiredActions, type TalosToolDefinition } from '@/lib/tools/registry'
import type { LibraryDoc } from '@/lib/chat/libraryContext'
import type { TalosChatRepository } from '@/repositories/chatRepository'
import {
    isTalosLibraryFileShared,
    parseVaultOrigin,
    talosLibraryFileType,
} from '@/lib/vaultLibrary'
import { talosChainFor, talosSetChain } from '@/lib/tools/chainStore'
import type { TalosToolChainState } from '@/lib/tools/security'
import { newTalosMobileId } from '@/lib/mobileIds'
import type {
    TalosDeviceFileSaveInput,
    TalosDeviceFileSaveResult,
} from '@/services/saveVaultFileToDevice'

/**
 * Everything the tool suite needs, assembled from what the app already owns.
 *
 * It lives in its own module so the chat controller does not grow another
 * responsibility (debt A2 is a god-object that this project is trying to shrink,
 * not feed), and so the audit row — which is the record a run can be explained
 * from afterwards — is written in exactly one place.
 */
/** Bytes to base64, in chunks: one huge spread argument blows the stack. */
export interface TalosToolsetDeps {
    repository: TalosChatRepository
    readVaultFileText(fileId: string): Promise<string | null>
    /**
     * The bytes of a Library file, for the ones there is nothing to read in.
     *
     * Owner 2026-07-27: TALOS could find an image in the Library and not look
     * at it — "per questa immagine non c'è nessun estratto testuale" — while
     * knowing perfectly well how to see one attached to a message. Absent means
     * this build cannot fetch bytes, and the tool says so instead of pretending
     * the file is empty.
     */
    readVaultFileBytes?(fileId: string): Promise<{ bytes: Uint8Array; mediaType: string } | null>
    /** Asks the human. Absent means: nothing can be confirmed, so writes fail closed. */
    requestConsent?(request: TalosToolConsentRequest): Promise<boolean | 'busy'>
    /** Session id → title, so a search result can say which chat it came from. */
    sessionTitles?(): Promise<Map<string, string>>
    /**
     * The user's "let chats use your Library" switch. When it is off the
     * ambient injection reads nothing, so the Library tools must not exist
     * either — otherwise the tools are a way around the opt-out.
     */
    libraryEnabled?(): boolean
    /**
     * Quanto accesso ha il modello alla Libreria, con la stessa grammatica di
     * ogni altra autorizzazione — owner 2026-08-03.
     *
     * `allow` legge · `ask` legge chiedendo la prima volta · `deny` non viene
     * nemmeno offerto, cosi' il modello non promette una ricerca che non fara'.
     *
     * Assente ricade su `libraryEnabled()`, che era un booleano: acceso →
     * `allow`, spento → **`ask`** e non `deny`, perche' chi ha spento ha detto
     * «non attaccarmela a ogni messaggio», non «mai guardarla».
     */
    libraryAccess?(): 'allow' | 'ask' | 'deny'
    /** Se il modello puo' scrivere in memoria: stessa grammatica di sopra. */
    memoryWriteAccess?(): 'allow' | 'ask' | 'deny'
    memoryWrite?(): import('@/lib/tools/memoryWriteTools').TalosMemoryWriteSources | null
    /**
     * La Libreria, in scrittura: rinominare e togliere.
     *
     * Owner 2026-08-07: la chat sapeva solo INSERIRE e leggere. Sta dietro allo
     * stesso interruttore della lettura (`libraryAccess`), perche' un modello
     * che non puo' vedere la Libreria non deve poterla nemmeno svuotare.
     */
    libraryWrite?(): import('@/lib/tools/libraryWriteTools').TalosLibraryWriteSources | null
    /**
     * Le note, in scrittura. Owner 2026-08-05: ogni funzione deve avere le
     * DUE porte, e questa aveva solo la lettura (`notes_list`).
     */
    notesWrite?(): import('@/lib/tools/notesWriteTools').TalosNotesWriteSources | null
    /** Le attività, in scrittura: stesso buco delle note, funzione accanto. */
    tasksWrite?(): import('@/lib/tools/tasksWriteTools').TalosTasksWriteSources | null
    /**
     * F1 — the web tools, present only when a search source is configured.
     *
     * D3: with nothing chosen the model does not receive the schemas at all, so
     * it cannot promise a search it will not perform. Absent here means absent
     * to the model — the same shape as the Library opt-out above.
     */
    web?(): TalosWebToolSources | null
    /**
     * «Che ricerche ho fatto?» — owner 2026-08-03, per chiudere il blocco
     * Ricerca. Assente quando non c'e' un giornale da leggere: assente qui vuol
     * dire assente per il modello, come per i tool web.
     */
    research?(): TalosResearchToolSources | null
    /**
     * F2 — making documents. A `write`, so the permission gate governs it and
     * D12's "ask once per conversation" applies.
     */
    documents?(): TalosDocumentToolSources | null
    /**
     * Drawing. A `write` like documents: it spends the user's money and puts a
     * file on the device, so the permission gate governs it. Absent when no
     * configured provider can draw, in which case the tool is never offered
     * rather than offered and failing.
     */
    images?(): TalosImageToolSources | null
    /**
     * Durable user-visible Save-As. Absent means the current platform has no
     * honest export boundary, so `library_export` is not advertised.
     */
    saveVaultFileToDevice?(
        input: TalosDeviceFileSaveInput,
    ): Promise<TalosDeviceFileSaveResult>
    /** Dedicated policy mutation stays reachable while Library reads are off. */
    libraryContextPolicy?: TalosLibraryContextPolicyToolSources
    now?(): string
}

export interface TalosToolset {
    /** Every tool that exists. Never advertise this list — see `offer`. */
    tools: TalosToolDefinition<never>[]
    /** Live Agent Tools plus global Library policy, shared by offer and execution. */
    isEnabled(
        name: string,
        enabledTools: Readonly<TalosAgentToolEnabled>,
    ): boolean
    /**
     * What may be offered to the model RIGHT NOW. Evaluated per send, not at
     * construction: the toolset is built once and memoised, so a permission
     * or Library switch flipped in Settings must take effect on the next
     * message rather than on the next launch.
     *
     * The same list is used to look a call up before running it, so a tool the
     * user has withdrawn cannot be reached by replaying an older call either.
     */
    offer(
        permissions: Partial<TalosToolPermissions> | undefined,
        enabledTools: Readonly<TalosAgentToolEnabled>,
    ): TalosToolDefinition<never>[]
    requestConsent(request: TalosToolConsentRequest): Promise<boolean | 'busy'>
    audit(row: TalosToolAuditRow, sessionId: string | null): Promise<void>
    /**
     * La catena della conversazione, esposta DA QUI e non importata dal
     * controller.
     *
     * Motivo misurato: `chatController` sta nel grafo d'avvio, e tirarci dentro
     * anche il registro delle catene aveva ridotto il margine del tetto a **tre
     * byte** — cioè alla prima riga scritta da chiunque, sfondato. Questo file
     * è già un chunk dinamico: qui non costa niente.
     */
    chainFor(sessionId: string | null): TalosToolChainState
    setChain(sessionId: string | null, next: TalosToolChainState): void
}

export async function createTalosToolset(deps: TalosToolsetDeps): Promise<TalosToolset> {
    const now = deps.now ?? (() => new Date().toISOString())
    const libraryAccess = (): 'allow' | 'ask' | 'deny' => {
        try {
            if (deps.libraryAccess) return deps.libraryAccess()
            if (!deps.libraryEnabled) return 'allow'
            // Il booleano vecchio: spento vuol dire «non attaccarmela a ogni
            // messaggio», non «mai guardarla». Quindi `ask`, e il cartellino
            // chiede la prima volta.
            return deps.libraryEnabled() ? 'allow' : 'ask'
        } catch {
            // Una sorgente rotta non puo' allargare l'accesso al Vault.
            return 'deny'
        }
    }
    const libraryAllowed = (): boolean => libraryAccess() !== 'deny'
    /**
     * Non piu' un rifiuto: un tool offerto che fallisce sempre e' peggio di uno
     * assente, perche' il modello lo promette e poi non lo mantiene. Il
     * permesso `read` decide PRIMA, e su «nega» il tool non viene offerto.
     *
     * Resta come funzione perche' `library_context_enabled` continua a
     * governare l'iniezione ambientale, che e' un'altra cosa e ha ragione di
     * avere il suo interruttore.
     */
    const requireLibraryEnabled = (): void => {
        // Solo `deny` rifiuta: `ask` e' governato dal cartellino di consenso,
        // che chiede PRIMA di eseguire invece di fallire dopo.
        if (!libraryAllowed()) throw new Error('TALOS_LIBRARY_DISABLED')
    }
    /**
     * I tool della Libreria NON sono un caso speciale, e trattarli come tale
     * era il difetto.
     *
     * Owner 2026-08-03, con uno screenshot: «che cosa ho nella libreria» →
     * «non ho uno strumento per elencare il contenuto della tua Libreria,
     * posso solo CREARE documenti al suo interno». Misurato sul corpo davvero
     * inviato: partivano tredici tool e nessuno della Libreria — su DeepSeek
     * come su OpenAI, quindi non era del provider.
     *
     * Qui c'era un filtro che toglieva ogni `library_*` quando
     * `library_context_enabled` era falso. Ma quell'interruttore vuol dire
     * «attacca la mia Libreria a OGNI messaggio»: ambientale, costosa, spenta
     * di serie per scelta. Legarci anche i tool significava che chi non vuole
     * l'iniezione automatica perde pure il modo di CHIEDERE — e restava un
     * modello capace di creare un documento nella Libreria e incapace di dire
     * cosa contiene.
     *
     * La protezione non sparisce: cambia di posto, e va dove l'owner ha chiesto
     * che stesse — la stessa grammatica di ogni altra autorizzazione. I tool
     * della Libreria sono tool di `read`, quindi `tools.read` li governa gia'
     * con i suoi tre stati: **consenti** (leggono), **chiedi** (predefinito: il
     * cartellino compare alla prima chiamata, e «consenti sempre» scrive
     * l'autorizzazione per QUEL tool), **nega** (non vengono nemmeno offerti,
     * quindi il modello non promette una ricerca che non fara').
     *
     * Non serviva una quarta impostazione: bastava smettere di trattarli
     * diversamente da tutti gli altri.
     */
    const isEnabled = (
        name: string,
        enabledTools: Readonly<TalosAgentToolEnabled>,
    ): boolean => isTalosAgentToolEnabled(name, enabledTools)
        && (
            name === 'library_context_policy_update'
            || !name.startsWith('library_')
            // Su `deny` spariscono; su `ask` restano, ed e' il cartellino a
            // decidere. Prima sparivano anche su `ask`, ed era il difetto.
            || libraryAllowed()
        )

    /**
     * Explicit Library tools search what the Library surface promises:
     * available uploaded AND generated files the user still shares with chat.
     *
     * This deliberately differs from AMBIENT injection, which remains
     * uploaded-only so model-authored output is never fed back into every later
     * turn automatically. Explicit search is still bounded by the global
     * switch, this per-file opt-out, read-only permissions, and the executor's
     * untrusted-data wrapper.
     */
    async function librarySummaries() {
        requireLibraryEnabled()
        const summaries = await deps.repository.listVaultFileSummaries()
        requireLibraryEnabled()
        return summaries
            .filter((file) => file.status === 'available')
            .filter((file) => isTalosLibraryFileShared(file.metadata))
    }

    async function libraryEntries(): Promise<TalosLibraryListEntry[]> {
        const summaries = await librarySummaries()
        const titles = deps.sessionTitles ? await deps.sessionTitles() : new Map<string, string>()
        requireLibraryEnabled()
        return summaries.map((file) => {
            const originSessionId = (file.metadata as { origin_session_id?: string | null }).origin_session_id ?? null
            return {
                id: file.id,
                displayName: file.display_name,
                mediaType: file.media_type,
                fileType: talosLibraryFileType(file),
                origin: parseVaultOrigin(file.metadata),
                originSessionId,
                originSessionTitle: originSessionId ? (titles.get(originSessionId) ?? null) : null,
                createdAt: file.created_at,
                updatedAt: file.updated_at,
            } satisfies TalosLibraryListEntry
        })
    }

    async function libraryDocs(): Promise<LibraryDoc[]> {
        // Explicit content search is the one operation allowed to transfer the
        // complete extracted corpus. Browse and ambient context stay on
        // summaries; otherwise every ordinary send would pay this bridge cost.
        requireLibraryEnabled()
        const rows = await deps.repository.listVaultFiles()
        requireLibraryEnabled()
        const files = rows
            .filter((file) => file.status === 'available')
            .filter((file) => isTalosLibraryFileShared(file.metadata))
        const titles = deps.sessionTitles ? await deps.sessionTitles() : new Map<string, string>()
        requireLibraryEnabled()
        return files.map((file) => {
            const originSessionId = (file.metadata as { origin_session_id?: string | null }).origin_session_id ?? null
            return {
                id: file.id,
                displayName: file.display_name,
                origin: parseVaultOrigin(file.metadata),
                originSessionId,
                originSessionTitle: originSessionId ? (titles.get(originSessionId) ?? null) : null,
                createdAt: file.created_at,
                text: file.extracted_text ?? '',
            } satisfies LibraryDoc
        })
    }

    /** Metadata-only candidates, under the same per-file agent-read policy. */
    async function libraryExportCandidates(): Promise<TalosLibraryExportCandidate[]> {
        requireLibraryEnabled()
        const summaries = await deps.repository.listVaultFileSummaries()
        requireLibraryEnabled()
        return summaries
            .filter((file) => file.status === 'available')
            .filter((file) => isTalosLibraryFileShared(file.metadata))
            .map((file) => ({
                id: file.id,
                displayName: file.display_name,
                mediaType: file.media_type,
            }))
    }

    const sources: TalosToolSources = {
        listLibraryEntries: libraryEntries,
        listLibraryDocs: libraryDocs,
        async readLibraryDoc(id) {
            const summaries = await librarySummaries()
            const summary = summaries.find((entry) => entry.id === id)
            if (!summary) return null

            // An image has no extracted text, and returning null for it is what
            // made the Library able to FIND a photo and not look at it.
            if (summary.media_type.startsWith('image/') && deps.readVaultFileBytes) {
                const file = await deps.readVaultFileBytes(id)
                requireLibraryEnabled()
                if (file) {
                    return {
                        name: summary.display_name,
                        text: '',
                        image: { base64: talosBytesToBase64(file.bytes), mediaType: file.mediaType },
                    }
                }
            }

            const text = await deps.readVaultFileText(id)
            requireLibraryEnabled()
            return text === null ? null : { name: summary.display_name, text }
        },
        /**
         * The second door of famiglia B, over the same Library the other tools
         * see: bounded by the global switch, by the per-file opt-out, and by the
         * incognito withdrawal of the whole `library` group.
         *
         * The prompt reference is deliberately dropped on the way out. The
         * record keeps it so a person can find their way back; a model asking
         * about a file has no use for an id it cannot resolve, and every field
         * handed over is a field that can be repeated somewhere else.
         */
        async readFileOrigin(id) {
            const summaries = await librarySummaries()
            const summary = summaries.find((entry) => entry.id === id)
            if (!summary) return null
            const metadata = summary.metadata as {
                provenance?: unknown
                origin_session_id?: string | null
            }
            const record = parseTalosFileProvenance(metadata.provenance)
            const sessionId = record?.originSessionId ?? metadata.origin_session_id ?? null
            const titles = deps.sessionTitles ? await deps.sessionTitles() : new Map<string, string>()
            requireLibraryEnabled()
            return {
                name: summary.display_name,
                origin: record?.origin ?? 'unknown',
                model: record?.model ?? null,
                provider: record?.provider ?? null,
                createdAt: record?.createdAt ?? null,
                originSessionTitle: sessionId ? titles.get(sessionId) ?? null : null,
                sourceUrl: record?.sourceUrl ?? null,
            }
        },
        async listNotes() {
            return (await deps.repository.listNotes()).map((note) => ({
                id: note.id,
                title: note.title,
                content: note.content,
                updated_at: note.updated_at,
            }))
        },
        async listTasks() {
            return (await deps.repository.listTasks()).map((task) => ({
                id: task.id,
                title: task.title,
                status: task.status,
                priority: task.priority,
                description: task.description,
            }))
        },
        async searchMemories(query) {
            const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
            const memories = await deps.repository.listMemories()
            return memories
                .filter((memory) => memory.status === 'active')
                .map((memory) => {
                    const haystack = `${memory.title} ${memory.content}`.toLowerCase()
                    const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0)
                    return { memory, score }
                })
                .filter((entry) => entry.score > 0)
                .sort((left, right) => right.score - left.score)
                .map((entry) => ({ title: entry.memory.title, content: entry.memory.content }))
        },
        now,
    }

    const all = createTalosReadTools(sources)
    const readExportBytes = deps.readVaultFileBytes
    const saveExport = deps.saveVaultFileToDevice
    const libraryExports = readExportBytes && saveExport
        ? createTalosLibraryExportTools({
            listCandidates: libraryExportCandidates,
            async exportById(fileId) {
                // TOCTOU boundary: the candidate can be deleted or withdrawn
                // while consent/picker UI is open. Re-list immediately before
                // touching decrypted bytes.
                const allowed = (await libraryExportCandidates())
                    .find((candidate) => candidate.id === fileId)
                if (!allowed) return null
                const file = await readExportBytes(fileId)
                requireLibraryEnabled()
                if (!file) throw new Error('TALOS_FILE_EXPORT_SOURCE_MISSING')
                return saveExport({
                    displayName: allowed.displayName,
                    mediaType: file.mediaType,
                    bytes: file.bytes,
                })
            },
        })
        : []
    const policyTools = deps.libraryContextPolicy
        ? createTalosLibraryContextPolicyTools(deps.libraryContextPolicy, { now })
        : []
    /**
     * The second door onto the on-device models.
     *
     * Unconditional, unlike its neighbours: nothing has to be wired in, because
     * it drives the SAME store the Model Lab section drives. That is what makes
     * a download started from chat appear in the section, in the progress bar
     * and in the notification — one of everything, and no seam to get wrong.
     */
    const modelTools = createTalosLocalModelTools()
    return {
        tools: [...all, ...libraryExports, ...policyTools, ...modelTools],
        isEnabled,
        offer(permissions, enabledTools) {
            // Evaluated per send, like the permissions: the toolset is memoised,
            // so a search source configured a minute ago must govern THIS
            // message rather than the next launch.
            const web = deps.web?.() ?? null
            const research = deps.research?.() ?? null
            // Su «nega» non viene nemmeno offerto: un tool che il modello
            // promette e poi non puo' eseguire e' peggio di uno assente.
            const memoryWrite = (deps.memoryWriteAccess?.() ?? 'ask') === 'deny'
                ? null
                : deps.memoryWrite?.() ?? null
            // Sotto lo stesso opt-out della lettura: `libraryAccess` su
            // «nega» toglie il gruppo intero, non solo meta'.
            const libraryWrite = (deps.libraryAccess?.() ?? 'ask') === 'deny'
                ? null
                : deps.libraryWrite?.() ?? null
            const notesWrite = deps.notesWrite?.() ?? null
            const tasksWrite = deps.tasksWrite?.() ?? null
            const documents = deps.documents?.() ?? null
            const images = deps.images?.() ?? null
            return [
                ...all,
                ...libraryExports,
                ...policyTools,
                ...modelTools,
                ...(web ? createTalosWebTools(web) : []),
                ...(research ? createTalosResearchTools(research) : []),
                ...(memoryWrite ? createTalosMemoryWriteTools(memoryWrite) : []),
                ...(libraryWrite ? createTalosLibraryWriteTools(libraryWrite) : []),
                ...(notesWrite ? createTalosNotesWriteTools(notesWrite) : []),
                ...(tasksWrite ? createTalosTasksWriteTools(tasksWrite) : []),
                ...(documents ? createTalosDocumentTools(documents) : []),
                ...(images ? createTalosImageTools(images) : []),
            ]
                .filter((tool) => isEnabled(tool.name, enabledTools))
                // SF-MAJOR: the gate refused at EXECUTION but the schemas were
                // advertised anyway, so "never" meant the model called a tool,
                // was refused, and tried again — up to five billed round trips
                // for one message that could never succeed. A tool the policy
                // always denies is not offered at all.
                .filter((tool) => talosToolRequiredActions(tool)
                    .every((action) => decideTalosToolPermission(action, permissions) !== 'deny'))
        },
        // Fail CLOSED: with no consent surface wired, an "ask" permission is a
        // refusal, never an implicit yes.
        requestConsent: deps.requestConsent ?? (async () => false),
        chainFor(sessionId) {
            return talosChainFor(sessionId)
        },
        setChain(sessionId, next) {
            talosSetChain(sessionId, next)
        },
        async audit(row, sessionId) {
            /*
             * Il registro delle notifiche, dallo STESSO punto in cui si scrive
             * la riga di audit.
             *
             * Owner 2026-08-06: «ogni funzione, TOOL, download, installazione
             * deve avere notifica». Qui passa ogni esecuzione di ogni tool.
             *
             * Peso `log`: un tool andato a buon fine non interrompe nessuno.
             * Una conversazione ne esegue anche dieci, e dieci toast sarebbero
             * il muro che la ricerca dice di evitare — ma la TRACCIA c'è, ed è
             * il punto: chi apre il campanello vede cosa ha fatto TALOS al posto
             * suo. Un tool FALLITO invece si vede: è l'unico esito su cui
             * qualcuno potrebbe dover fare qualcosa.
             *
             * PRIMA del `return` su `sessionId` assente: un tool eseguito fuori
             * da una sessione è comunque un tool eseguito, e sparire perché non
             * c'è una riga di audit da scrivere sarebbe la stessa disattenzione
             * che ha lasciato metà delle azioni senza avviso.
             *
             * Agganciato QUI e non nell'esecutore: importare lo store da
             * `executor.ts` tira il grafo delle notifiche nel chunk d'avvio —
             * MISURATO, 656.667 byte contro 600.000. Questo file è già un chunk
             * dinamico, quindi non costa niente.
             */
            void (async () => {
                try {
                    const { talosNotify } = await import('@/stores/notificationCentre')
                    talosNotify({
                        // Per TOOL e non per esecuzione: dieci letture della
                        // Libreria restano una riga che dice «dieci volte».
                        key: `tool:${row.tool}`,
                        channel: 'jobs',
                        weight: row.status === 'failed' ? 'notable' : 'log',
                        title: row.tool,
                        ...(row.status === 'failed' && row.error ? { body: row.error } : {}),
                        at: Date.now(),
                    })
                } catch {
                    // Notificare non puo' rompere un tool che ha gia' risposto.
                }
            })()
            if (!sessionId) return
            await deps.repository.appendToolActivity({
                id: newTalosMobileId(),
                session_id: sessionId,
                message_id: null,
                operation: `tool.${row.tool}`,
                status: row.status === 'succeeded' ? 'succeeded' : 'failed',
                payload: {
                    action: row.action,
                    required_actions: [...row.requiredActions],
                    input: row.input,
                    outcome: row.status,
                },
                evidence: {
                    contract: 'talos.mobile.tool.activity.v1',
                    ...(row.evidence ?? {}),
                    ...(row.error ? { error: row.error } : {}),
                },
                created_at: now(),
            })
        },
    }
}
