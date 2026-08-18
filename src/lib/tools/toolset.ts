import { createTalosMemoryWriteTools } from '@/lib/tools/memoryWriteTools'
import { createTalosDeviceTools } from '@/lib/tools/deviceTools'
import { createTalosPrivilegedTools } from '@/lib/tools/privilegedTools'
import { createTalosPrivilegedSources } from '@/lib/device/privilegedSources'
import { createTalosNotificationTools } from '@/lib/tools/notificationTools'
import { createTalosSchermoTools } from '@/lib/tools/schermoTools'
import { talosCodiceTools } from '@/lib/kernel/codiceTools'
import { talosIntentiTools } from '@/lib/tools/intentiTools'
import { createTalosLibraryWriteTools } from '@/lib/tools/libraryWriteTools'
import { createTalosNotesWriteTools } from '@/lib/tools/notesWriteTools'
import { createTalosTasksWriteTools } from '@/lib/tools/tasksWriteTools'
import { talosBytesToBase64 } from '@/lib/bytesToBase64'
import { createTalosCalendarTools } from '@/lib/tools/calendarioTools'
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
import {
    TALOS_TOOL_SECURITY_FALLBACK,
    talosForbidsPersistentGrant,
    type TalosToolChainState,
    type TalosToolSecurity,
} from '@/lib/tools/security'
import { TALOS_TOOL_SECURITY } from '@/lib/tools/securityCatalog'
import type { TalosToolAction } from '@/lib/tools/permissionTypes'
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
    requestConsent?(request: TalosToolConsentRequest): Promise<boolean | 'busy' | 'unanswered'>
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
     * ⭐ Il TELEFONO: torcia, volume, sveglie, voce, e la schermata giusta.
     *
     * Assente sul web, dove non c'e' un telefono da toccare — e li' i tool non
     * devono nemmeno comparire: offrire «accendi la torcia» a un browser
     * insegna che TALOS promette cose che non fa.
     */
    device?(): import('@/lib/tools/deviceTools').TalosDeviceToolSources | null
    /**
     * T2 — le capacità che passano dalla shell via Shizuku, o dal pannello di
     * sistema quando la shell non c'è. Assente fuori da Android, e allora il
     * gruppo sparisce intero invece di offrire sei tool che falliranno sempre.
     */
    privileged?(): import('@/lib/tools/privilegedTools').TalosPrivilegedToolSources | null
    /**
     * ⛔ Le notifiche hanno la LORO sorgente, separata dal privilegiato.
     *
     * Non passano da nessun ponte: si accendono dalla pagina di sistema. Se
     * dipendessero da `privileged`, sparirebbero su un telefono dove il ponte
     * non c'è — cioè esattamente su questo, dove sono la capacità più grande
     * che resta.
     */
    notifications?(): import('@/lib/tools/notificationTools').TalosNotificationSources | null
    /**
     * ⭐⭐ Il pilota dello schermo: TALOS usa un'app al posto della persona.
     *
     * Assente dove non c'è uno schermo da guidare — e allora il tool non
     * compare affatto, invece di esistere e fallire sempre. È la stessa regola
     * del gruppo del telefono: offrire una capacità che non c'è insegna al
     * modello che TALOS promette cose che non fa.
     */
    schermo?(): import('@/lib/tools/schermoTools').TalosSchermoToolSources | null

    /**
     * ⭐⭐⭐ Lo spazio di lavoro del codice.
     *
     * ⛔ Assente finché la persona non ha aperto un progetto: senza, gli attrezzi
     * del codice non compaiono affatto. Un attrezzo che c'è e fallisce sempre
     * insegna al modello a provarci lo stesso — e a raccontare l'esito.
     */
    codice?(): import('@/lib/kernel/codiceTools').TalosFontiCodice | null
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
    requestConsent(request: TalosToolConsentRequest): Promise<boolean | 'busy' | 'unanswered'>
    /**
     * ⛔ B2 — quello che serve sapere di un tool per METTERLO IN UN PIANO.
     *
     * Sta qui e non nel controller perché qui vivono già le tre cose che
     * servono insieme: la definizione del tool, il catalogo di sicurezza e i
     * permessi vivi. Ricostruirle altrove significherebbe tenere allineate due
     * risposte alla stessa domanda — e la prima che si disallinea è quella che
     * nessuno guarda.
     *
     * `null` per un nome che non esiste: chi chiede lo tratterà come il caso
     * più prudente, che è l'unico modo sicuro di non sapere.
     */
    describe(
        name: string,
        permissions: Partial<TalosToolPermissions> | undefined,
        enabledTools: Readonly<TalosAgentToolEnabled>,
    ): {
        title: string
        security: TalosToolSecurity
        actions: readonly TalosToolAction[]
        /** Falso quando un permesso lo nega o l'interruttore è spento. */
        allowed: boolean
        /** Vero se, da solo, avrebbe fatto comparire una scheda di consenso. */
        asks: boolean
        /** Da confermare uno per uno: fuori dal piano. */
        critical: boolean
    } | null
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

    /**
     * I file che si possono CONSEGNARE a un'altra app.
     *
     * ⛔ Non riusa `libraryEntries`: quello rende `{id, displayName, mediaType}`
     * — abbastanza per elencare, niente per mandare. Manca `private_uri`, che è
     * l'unica cosa che il ponte nativo può trasformare in un `content://`.
     *
     * ⛔⛔ E NON ingoia più l'errore — era una bugia, ed è stata misurata.
     *
     * Qui c'era `catch { return [] }`, con scritto accanto che il tool avrebbe
     * detto «non c'è nessun file», «che è vero da dove sta lui». NON è vero:
     * `[]` significa DUE cose diverse — la Libreria è vuota, oppure non sono
     * riuscito a guardarla — e il tool le raccontava tutte e due come la prima.
     *
     * MISURATO sul Pad il 2026-08-17, con `nota-talos.txt` presente in DUE
     * copie: TALOS ha risposto «il file nota-talos.txt che menzioni **non è
     * presente nella mia Library**». Una frase su un fatto che non aveva
     * verificato, detta con la sicurezza di chi ha guardato.
     *
     * ⇒ L'errore SALE. Chi lo prende è `invia_file`, che sa dire la terza cosa:
     * «non sono riuscito a leggere la Libreria». È la stessa lezione di CIECO
     * non è FALLITO e dei tre stati dentro un `ok:false`.
     */
    async function fileDaMandare() {
        return (await librarySummaries()).map((file) => ({
            id: file.id,
            nome: file.display_name,
            tipo: file.media_type,
            percorso: file.private_uri,
        }))
    }

    /**
     * ⭐⭐ Il file che sta sul TELEFONO, scelto dalla persona nel selettore di
     * sistema — owner 2026-08-13.
     *
     * ⛔ Import PIGRO del selettore: è lo stesso modulo che gli allegati usano,
     * e caricarlo all'avvio lo farebbe pagare a chi apre l'app senza mandare
     * niente. Qui siamo già dentro una chiamata di tool.
     *
     * ⛔ E rende `null` per DUE casi diversi che qui coincidono: la persona ha
     * annullato, oppure il file scelto non ha un `content://` da rigirare. Il
     * secondo non dovrebbe accadere col selettore di sistema; se accadesse,
     * mandare un `file://` farebbe esplodere l'app di destinazione con un
     * difetto che sembra suo ed è nostro.
     */
    async function fileDalTelefono() {
        const { createNativeFilePicker } = await import('@/services/nativeFilePicker')
        const scelti = await createNativeFilePicker().pickFiles()
        const primo = scelti[0]
        if (!primo || primo.source.kind !== 'native-uri') return null
        if (!primo.source.uri.startsWith('content://')) return null
        return {
            nome: primo.name,
            tipo: primo.declaredMediaType,
            uri: primo.source.uri,
        }
    }

    const sources: TalosToolSources = {
        listLibraryEntries: libraryEntries,
        listLibraryDocs: libraryDocs,
        async readLibraryDoc(id) {
            const summaries = await librarySummaries()
            const summary = summaries.find((entry) => entry.id === id)
            if (!summary) return null
            // A8 — l'origine viaggia col documento: e' l'unica cosa che
            // distingue un file tuo da uno preso dalla rete, e finora si
            // fermava qui.
            const origine = parseTalosFileProvenance(
                (summary.metadata as { provenance?: unknown } | undefined)?.provenance,
            )?.origin

            // An image has no extracted text, and returning null for it is what
            // made the Library able to FIND a photo and not look at it.
            if (summary.media_type.startsWith('image/') && deps.readVaultFileBytes) {
                const file = await deps.readVaultFileBytes(id)
                requireLibraryEnabled()
                if (file) {
                    return {
                        name: summary.display_name,
                        text: '',
                        origin: origine ?? null,
                        image: { base64: talosBytesToBase64(file.bytes), mediaType: file.mediaType },
                    }
                }
            }

            const text = await deps.readVaultFileText(id)
            requireLibraryEnabled()
            return text === null ? null : { name: summary.display_name, text, origin: origine ?? null }
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
                // A8 — la provenienza registrata quando la nota e' nata.
                contentOrigin: note.content_origin,
            }))
        },
        async listTasks() {
            return (await deps.repository.listTasks()).map((task) => ({
                id: task.id,
                title: task.title,
                status: task.status,
                priority: task.priority,
                description: task.description,
                contentOrigin: task.content_origin,
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
                .map((entry) => ({
                    title: entry.memory.title,
                    content: entry.memory.content,
                    contentOrigin: entry.memory.content_origin,
                }))
        },
        now,
    }

    /*
     * ⭐⭐⭐ IL CALENDARIO, senza condizioni — 2026-08-14.
     *
     * Come i modelli locali qui sotto: non c'è niente da cablare, perché la
     * porta è il PROVIDER del telefono e il permesso è la sua serratura. Se la
     * persona non l'ha dato, il tool lo dice — e dirlo è precisamente ciò che
     * mancava il giorno in cui TALOS rispondeva «non hai impegni» avendo
     * guardato le proprie note.
     */
    const calendarTools = createTalosCalendarTools(
        async (da, a, conFestivita) => {
            const { talosLeggiCalendario } = await import('@/lib/device/calendario')
            return talosLeggiCalendario(da, a, conFestivita)
        },
        async (input) => {
            const { talosScriviInCalendario } = await import('@/lib/device/calendario')
            return talosScriviInCalendario(input)
        },
        async (input) => {
            const { talosModificaInCalendario } = await import('@/lib/device/calendario')
            return talosModificaInCalendario(input)
        },
    )

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
    const tutti = [...all, ...libraryExports, ...policyTools, ...modelTools, ...calendarTools]
    return {
        tools: tutti,
        isEnabled,
        describe(name, permissions, enabledTools) {
            const tool = tutti.find((riga) => riga.name === name)
            if (!tool) return null
            const actions = talosToolRequiredActions(tool)
            /*
             * Il catalogo di sicurezza si legge QUI e non dall'esecutore: il
             * predefinito prudente vale anche per un tool che non l'ha
             * dichiarato, e un piano che mostrasse come innocuo un tool
             * sconosciuto sarebbe la bugia peggiore di questa schermata.
             */
            const security: TalosToolSecurity =
                TALOS_TOOL_SECURITY[name as keyof typeof TALOS_TOOL_SECURITY]
                ?? TALOS_TOOL_SECURITY_FALLBACK
            /*
             * `allowed` guarda ENTRAMBE le porte, come fa l'esecutore:
             * l'interruttore del tool e i tre stati del permesso. Se ne
             * guardasse una sola, il piano mostrerebbe come approvabile un
             * passo che poi verrebbe rifiutato — cioè una promessa che il
             * codice non mantiene.
             */
            const allowed = isEnabled(name, enabledTools)
                && actions.every((action) => decideTalosToolPermission(action, permissions) !== 'deny')
            /*
             * Critico = si conferma uno per uno, e non entra nel piano.
             *
             * Due strade portano qui: il rischio effettivo più alto, e un tool
             * che chiede conferma SEMPRE per contratto. La seconda esiste
             * perché alcune cose sono gravi a prescindere dal numero.
             */
            /*
             * ⛔ IL SECONDO CANCELLO: qui il veto veniva chiamato con UN SOLO
             * argomento, quindi `sempreConsentibile` arrivava `undefined` e
             * l'eccezione dichiarata nel catalogo non contava niente. Una
             * firma con parametri facoltativi rende questo errore silenzioso:
             * il codice compila, e la regola si applica a metà.
             */
            const critical = tool.confirmation === 'always'
                || talosForbidsPersistentGrant(
                    security.risk,
                    actions,
                    security.sempreConsentibile,
                )
            /*
             * «Avrebbe chiesto?» si legge dalla STESSA funzione che decide
             * davvero, non da una regola parallela: se un giorno la grammatica
             * cambiasse, due letture diverse diventerebbero due comportamenti
             * diversi, e quello che nessuno guarda resterebbe indietro.
             */
            const asks = tool.confirmation === 'always'
                || actions.some((action) => decideTalosToolPermission(action, permissions) === 'ask')
            return { title: tool.title, security, actions, allowed, asks, critical }
        },
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
            /*
             * Il valore iniettato vince; altrimenti si costruisce qui — vedi il
             * perché sotto, accanto ai tool privilegiati.
             *
             * ⛔ Decide la PRESENZA della funzione, non il valore che rende:
             * con `deps.privileged?.() ?? …` un test che passa `() => null` per
             * dire «qui non c'è telefono» si vedrebbe restituire la sorgente
             * vera dal ripiego, e proverebbe il contrario di ciò che chiede.
             */
            const privilegiate = deps.privileged
                ? deps.privileged()
                : createTalosPrivilegedSources()
            return [
                ...all,
                ...libraryExports,
                ...policyTools,
                ...modelTools,
                ...calendarTools,
                ...(web ? createTalosWebTools(web) : []),
                ...(research ? createTalosResearchTools(research) : []),
                ...(memoryWrite ? createTalosMemoryWriteTools(memoryWrite) : []),
                ...(deps.device?.() ? createTalosDeviceTools(deps.device()!) : []),
                /*
                 * ⛔ La sorgente PRIVILEGIATA si costruisce QUI, non nel
                 * controller della chat.
                 *
                 * MISURATO il 2026-08-10: `chatController` importava
                 * `createTalosPrivilegedSources` staticamente, e quel modulo è
                 * nel pezzo d'AVVIO — che ha meno di cento byte di margine
                 * (compito #51). Aggiungere una riga al ponte del telefono
                 * faceva diventare rossa la build, che è un accoppiamento
                 * assurdo: il codice che apre un'app non deve pesare sul primo
                 * disegno della chat.
                 *
                 * ⇒ `toolset.ts` è già un pezzo caricato a richiesta, e
                 * costruire la sorgente qui la porta con sé. La cucitura resta:
                 * chi passa `deps.privileged` (i test, o un domani un'altra
                 * piattaforma) vince sul valore predefinito.
                 */
                ...(privilegiate ? createTalosPrivilegedTools(privilegiate) : []),
                ...(deps.notifications?.() ? createTalosNotificationTools(deps.notifications()!) : []),
                // ⭐⭐ Il motore degli intent: 25 capacità in un tool solo.
                /*
                 * ⛔ Le fonti dei file viaggiano SEMPRE col ponte del telefono, e
                 * `fileDaMandare` rende `[]` quando la libreria è spenta invece
                 * di lanciare: così `invia_file` dice «non c'è nessun file»,
                 * che è vero da dove sta lui, invece di far fallire l'intero
                 * messaggio o di sparire senza spiegazione.
                 */
                ...(deps.device?.() ? talosIntentiTools({
                    fileDellaLibreria: fileDaMandare,
                    fileDalTelefono,
                }) : []),
                ...(deps.schermo?.() ? createTalosSchermoTools(deps.schermo()!) : []),
                ...(deps.codice?.() ? talosCodiceTools(deps.codice()!) : []),
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
                    const [{ talosNotify }, { talosT }, { talosAvvisoDiTool }] = await Promise.all([
                        import('@/stores/notificationCentre'),
                        import('@/i18n'),
                        import('@/lib/tools/avvisoDiTool'),
                    ])
                    talosNotify({
                        // Per TOOL e non per esecuzione: dieci letture della
                        // Libreria restano una riga che dice «dieci volte».
                        key: `tool:${row.tool}`,
                        channel: 'jobs',
                        weight: row.status === 'failed' ? 'notable' : 'log',
                        /*
                         * ⛔ NON `row.tool` e NON `row.error`.
                         *
                         * Owner 2026-08-10, screenshot dal telefono: il toast
                         * diceva «Say so and offer to open the system page. Do
                         * not retry.» — una riga scritta per il MODELLO, in
                         * inglese, sullo schermo di chi possiede il telefono.
                         * Il motivo per esteso, e la regola, stanno in
                         * `avvisoDiTool.ts`.
                         */
                        ...talosAvvisoDiTool(row, talosT),
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
