import type {
    TalosChatRepository,
    TalosLocalFileAuthorityGrant,
    TalosLocalVaultFile,
} from '@/repositories/chatRepository'
import { talosIsEphemeralSessionId } from '@/lib/chat/ephemeralSession'
import type { TalosMobileInputPart } from '@/lib/chat/attachmentContracts'
import type {
    TalosAttachmentAnalysisClient,
} from '@/services/attachmentAnalysisClient'
import { talosLogDeviceIssue } from '@/lib/talosDeviceLog'
import type { TalosAttachmentFileStore } from '@/services/attachmentFileStore'
import type { TalosPickedFile } from '@/services/nativeFilePicker'

/**
 * ⭐⭐ SE QUESTA RIGA PROMETTE UN FILE SU DISCO.
 *
 * ## ⛔ La domanda giusta, dopo che quella sbagliata è costata 22 falsi
 *
 * La prima difesa chiedeva «questa riga ha un file su disco?» e marcava
 * `failed` tutte quelle che rispondevano no. Sul Pad ne ha marcate **22 sane**:
 * `existsPrivate` diceva il vero, era la DOMANDA a essere sbagliata.
 *
 * ⇒ La domanda giusta è: **questa riga promette un file, e la promessa regge?**
 * E la risposta non va inventata — sta già nel contratto dello schema, letta
 * nelle due sole strade che creano una riga (MISURATE il 2026-08-10):
 *
 * ```
 *   pending   + private_uri ''    la riga nasce PRIMA dei byte, per contratto
 *   available + percorso pieno    IL FILE C'È — l'unica che promette qualcosa
 *   failed    + private_uri ''    la copia è fallita, ed è dichiarato
 *   revoked                       tolto apposta
 * ```
 *
 * ⛔ E una premessa del compito è caduta strada facendo: si credeva che i
 * documenti GENERATI vivessero «come testo estratto, senza file per
 * costruzione». Falso, misurato sul Pad: «Salva nella Libreria» su una risposta
 * scrive `files/talos-vault/files/<id>.md` — 61 byte, visti con `run-as`. Anche
 * il ripiego dell'analisi fallita tiene i byte: perde il testo cercabile, non
 * il file.
 */
export function talosRigaPrometteUnFile(riga: {
    readonly status: string
    readonly private_uri: string
}): boolean {
    return riga.status === 'available' && riga.private_uri.trim() !== ''
}

/** What only the caller knows about a file's origin (famiglia B). */
export interface TalosProvenanceInput {
    model?: string | null
    provider?: string | null
    modelVersion?: string | null
    promptMessageId?: string | null
    toolName?: string | null
}

/**
 * Where a generated file came from: the chat, and what made it.
 *
 * `model` and `provider` are REQUIRED — nullable, but required. A caller that
 * does not know has to say so in writing, and a layer that forgets to pass them
 * on does not compile. That is deliberate: the facts live in the chat
 * controller, four layers above the write, and "four layers above" is exactly
 * where `{ ephemeral: true }` was silently dropped twice this week. A test can
 * only catch that after someone writes the test; the compiler catches it now.
 *
 * `sessionId` stays optional because ABSENT and NULL mean different things to
 * the caller below: absent means "use the chat I am in", null means "none".
 */
export interface TalosGeneratedOrigin extends TalosProvenanceInput {
    sessionId?: string | null
    model: string | null
    provider: string | null
}

export interface TalosVaultTrayItem {
    file: TalosLocalVaultFile
    grant: TalosLocalFileAuthorityGrant
}

export interface TalosGeneratedSourceLink {
    url: string
    title: string
}

export interface TalosGeneratedTextInput {
    name: string
    mediaType: string
    text: string
    kind?: 'document' | 'web_source'
    sourceUrl?: string | null
    /**
     * A search call owns one compact dossier but can project many openable
     * source rows. Kept typed instead of hiding another shape in metadata.
     */
    sourceLinks?: readonly TalosGeneratedSourceLink[]
}

export interface TalosVaultService {
    /** originSessionId (owner 2026-07-25): the chat the file was uploaded in, so the
     *  Library can group by chat and the model knows a doc's origin. */
    ingest(file: TalosPickedFile, originSessionId?: string | null): Promise<TalosVaultTrayItem>
    /** Owner 2026-07-24: persist a chat-generated artifact into the Library as a
     *  reusable document (origin='generated', searchable via extracted text). */
    createGenerated(input: TalosGeneratedTextInput, origin: TalosGeneratedOrigin): Promise<TalosVaultTrayItem>
    /**
     * A generated file whose content is BYTES, not text.
     *
     * F2 shipped without this and it was a real defect: `createGenerated`
     * encodes a string, so an xlsx saved through it became a text file named
     * `.xlsx` containing a placeholder sentence. The generator was producing
     * valid documents and the sink was throwing them away — nothing in the
     * Library would open, because there was nothing there to open.
     */
    createGeneratedBinary(
        input: { name: string; mediaType: string; bytes: Uint8Array },
        origin: TalosGeneratedOrigin,
    ): Promise<TalosVaultTrayItem>
    /** Owner 2026-07-25: raw bytes of an available file for in-Library preview
     *  (image thumbnails / open). Null if unavailable. */
    readFilePreview(fileId: string): Promise<{ bytes: Uint8Array; mediaType: string } | null>
    createGrant(fileId: string): Promise<TalosLocalFileAuthorityGrant>
    revokeGrant(grantId: string): Promise<void>
    resolveMessageParts(messageId: string): Promise<TalosMobileInputPart[]>
    listFiles(): Promise<TalosLocalVaultFile[]>
    /** Perf review: the boot path must not pull every document body into memory. */
    listSummaries(): Promise<TalosLocalVaultFile[]>
    /** Full extracted text for ONE file (never list the corpus to read one). */
    readFileText(fileId: string): Promise<string | null>
    /**
     * Debt S7: the per-document opt-out from model context was honoured by the
     * injection path and writable from nowhere. Merges the flag into the
     * existing metadata — see the implementation for why that matters.
     */
    setFileShared(fileId: string, shared: boolean): Promise<void>
    deleteFile(fileId: string): Promise<void>
    reconcilePending(): Promise<void>
}

export interface TalosVaultServiceOptions {
    repository: TalosChatRepository
    fileStore: TalosAttachmentFileStore
    analysisClient: TalosAttachmentAnalysisClient
    idFactory?: () => string
    now?: () => string
}

function failureCode(error: unknown): string {
    if (error instanceof Error && /^TALOS_ATTACHMENT_[A-Z0-9_]+$/.test(error.message)) {
        return error.message
    }
    return 'TALOS_ATTACHMENT_ANALYSIS_FAILED'
}

/** The fingerprint still gets computed when the analysis that used to do it fails. */
async function sha256Hex(bytes: Uint8Array): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', bytes as unknown as ArrayBuffer)
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function extensionOf(name: string): string {
    return name.split('.').at(-1)?.trim().toLowerCase() ?? ''
}

function base64FromBytes(bytes: Uint8Array): string {
    let binary = ''
    const chunkSize = 32_768
    for (let index = 0; index < bytes.length; index += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
    }
    return btoa(binary)
}

export function createTalosVaultService(options: TalosVaultServiceOptions): TalosVaultService {
    const idFactory = options.idFactory ?? (() => crypto.randomUUID())
    const now = options.now ?? (() => new Date().toISOString())

    async function createGrant(fileId: string): Promise<TalosLocalFileAuthorityGrant> {
        const file = await options.repository.getVaultFile(fileId)
        if (!file) throw new Error('TALOS_VAULT_FILE_NOT_FOUND')
        if (file.status !== 'available') throw new Error('TALOS_VAULT_FILE_UNAVAILABLE')
        return options.repository.createFileAuthorityGrant({
            id: idFactory(),
            vault_file_id: file.id,
            permissions: ['model.read', 'browser.upload'],
            label: file.display_name,
            created_at: now(),
        })
    }

    async function failPendingFile(
        fileId: string,
        privateUri: string,
        error: unknown,
    ): Promise<never> {
        if (privateUri) {
            try {
                await options.fileStore.deletePrivate(privateUri)
            } catch {
                // The failed row remains recoverable; no private path is exposed to the UI.
            }
        }
        const code = failureCode(error)
        try {
            await options.repository.updateVaultFile(fileId, {
                status: 'failed',
                private_uri: '',
                sha256: null,
                extracted_text: null,
                failure_code: code,
            })
        } catch {
            // Preserve the bounded ingestion error if storage recovery also fails.
        }
        throw new Error(code)
    }

    async function ingestFile(
        pickedFile: TalosPickedFile,
        origin: 'uploaded' | 'generated',
        originSessionId: string | null,
        kind: 'document' | 'web_source' = 'document',
        /**
         * Where a saved page came from.
         *
         * Owner 2026-07-27 wants sources to appear in the Library as openable
         * links. The address used to live only inside the markdown prose, which
         * meant reading every file to find it — slow, and a guess. Here it is a
         * fact the Library can render.
         */
        sourceUrl: string | null = null,
        sourceLinks: readonly TalosGeneratedSourceLink[] = [],
        /**
         * Famiglia B: what the CALLER knows and this function cannot — which
         * model made it, and which message carried the prompt.
         *
         * One optional bag rather than four more positional parameters: the
         * knowledge lives in the chat controller and only there, and threading
         * it through every layer would make every layer know about models.
         */
        provenance: TalosProvenanceInput = {},
    ): Promise<TalosVaultTrayItem> {
        const fileId = idFactory()
        await options.repository.createVaultFile({
            id: fileId,
            display_name: pickedFile.name,
            media_type: pickedFile.declaredMediaType || 'application/octet-stream',
            size_bytes: pickedFile.sizeBytes,
            private_uri: '',
            status: 'pending',
            trust: 'untrusted',
            sha256: null,
            extracted_text: null,
            failure_code: null,
            created_at: now(),
        })
        let privateUri = ''
        // Held outside the try: the degraded path below still has to fingerprint
        // exactly the bytes that were written.
        let copiedBytes: Uint8Array | null = null
        /**
         * Owner 2026-07-31: «spegnere il libretto in modalità incognito, e tutto
         * quello che creeremo in futuro che potrà identificare la persona».
         *
         * A file OUTLIVES the chat that made it — it is kept in the Library on
         * purpose. So a file made in a temporary chat must not carry that chat
         * with it: the session id would be a thread back to a conversation the
         * user was promised had vanished, and a record would point at a prompt
         * that no longer exists.
         *
         * The `origin_session_id` line is OLDER than this feature and was
         * leaking the same way. Closed here too, rather than left as the tidy
         * version's blind spot.
         */
        const anonymous = originSessionId !== null && talosIsEphemeralSessionId(originSessionId)
        const keptSessionId = anonymous ? null : originSessionId

        /**
         * The origin metadata, built ONCE for every path that writes it.
         *
         * Found by an adversarial review, 2026-07-31: the rescue path below —
         * the one that keeps a generated file whose analysis failed — wrote its
         * own copy of this bag, and the anonymity rule lived only in the copy
         * beside it. A picture drawn in an incognito chat on a phone where
         * extraction timed out kept `tmp-…` on disk forever, while the chat it
         * named was destroyed on exit exactly as promised. The same copy also
         * dropped the whole provenance record for ORDINARY chats, so the
         * feature disappeared precisely on the devices slow enough to lose it.
         *
         * One builder, so a rule applied here is applied everywhere. This
         * codebase keeps re-learning the same lesson: a thing written twice
         * will diverge, and the copy that diverges is never the one you are
         * looking at.
         */
        function originMetadata(extras: Record<string, unknown>): Record<string, unknown> {
            return {
                origin,
                origin_session_id: keptSessionId,
                kind,
                // Famiglia B. The typed record lives beside the loose keys
                // rather than replacing them: the old ones are read by code
                // written before this existed, and breaking them to be tidy
                // would be a migration nobody asked for.
                // No record at all when anonymous: a half-filled one still says
                // "a model made this, in a session", and the whole point is that
                // nothing traces back.
                ...(anonymous ? {} : { provenance: {
                    schema: 1 as const,
                    origin: sourceUrl ? 'downloaded' : origin,
                    createdAt: options.now?.() ?? new Date().toISOString(),
                    model: provenance.model ?? null,
                    provider: provenance.provider ?? null,
                    modelVersion: provenance.modelVersion ?? null,
                    originSessionId: keptSessionId,
                    promptMessageId: provenance.promptMessageId ?? null,
                    toolName: provenance.toolName ?? null,
                    sourceUrl,
                    perceptualHash: null,
                    seal: null,
                } }),
                ...(sourceUrl ? { source_url: sourceUrl } : {}),
                ...(sourceLinks.length
                    ? { source_links: sourceLinks.map((link) => ({ ...link })) }
                    : {}),
                ...extras,
            }
        }
        try {
            const copy = await options.fileStore.copyToPrivate(pickedFile, fileId)
            privateUri = copy.privateUri
            copiedBytes = copy.bytes
            const analysis = await options.analysisClient.analyze({
                bytes: copy.bytes,
                name: pickedFile.name,
                declaredMediaType: pickedFile.declaredMediaType,
            })
            const file = await options.repository.updateVaultFile(fileId, {
                private_uri: privateUri,
                status: 'available',
                sha256: analysis.sha256,
                extracted_text: analysis.extractedText,
                failure_code: null,
                metadata: originMetadata({
                    extension: analysis.extension,
                    page_count: analysis.pageCount,
                }),
            })
            const grant = await createGrant(file.id)
            return { file, grant }
        } catch (error) {
            if (origin === 'generated' && privateUri !== '' && copiedBytes !== null) {
                /**
                 * A document TALOS made, and already verified by REOPENING it,
                 * is not lost because we could not read it back a second time.
                 *
                 * Owner's R39 trace named this at last:
                 * `TALOS_ATTACHMENT_ANALYSIS_FAILED`. The analysis exists to
                 * inspect what a USER brings in — refusing the unintelligible
                 * is right for those. Applying the same rule to our own output
                 * threw away a correct PDF sitting on disk, three times, and
                 * sent the model off offering DOCX instead. What is actually
                 * lost when extraction fails is the searchable text, and that
                 * is a feature, not the file.
                 */
                talosLogDeviceIssue(
                    'TALOS_VAULT_GENERATED_ANALYSIS',
                    `${pickedFile.name}: ${error instanceof Error ? error.message : String(error)}`,
                )
                const file = await options.repository.updateVaultFile(fileId, {
                    private_uri: privateUri,
                    status: 'available',
                    sha256: await sha256Hex(copiedBytes),
                    extracted_text: '',
                    failure_code: null,
                    metadata: originMetadata({
                        extension: extensionOf(pickedFile.name),
                        page_count: null,
                        // Recorded, so the Library can say the document is not
                        // searchable rather than returning nothing for every
                        // query and looking broken.
                        analysis_failed: failureCode(error),
                    }),
                })
                const grant = await createGrant(file.id)
                return { file, grant }
            }
            return failPendingFile(fileId, privateUri, error)
        }
    }

    return {
        ingest: (pickedFile, originSessionId = null) => ingestFile(pickedFile, 'uploaded', originSessionId),
        async createGenerated(
            { name, mediaType, text, kind, sourceUrl, sourceLinks },
            origin,
        ) {
            // A chat-generated document flows through the SAME ingestion pipeline
            // (private copy + analysis → searchable extracted text + sha256), only
            // marked origin='generated'. Built from a web-blob so it needs no picker.
            const bytes = new TextEncoder().encode(text)
            return ingestFile({
                name,
                declaredMediaType: mediaType,
                sizeBytes: bytes.byteLength,
                source: { kind: 'web-blob', blob: new Blob([bytes], { type: mediaType }) },
            }, 'generated', origin.sessionId ?? null, kind, sourceUrl ?? null, sourceLinks ?? [], origin)
        },
        async createGeneratedBinary({ name, mediaType, bytes }, origin) {
            // The same ingestion pipeline: private copy, analysis, sha256. Only
            // the source differs — real bytes rather than an encoded string.
            return ingestFile({
                name,
                declaredMediaType: mediaType,
                sizeBytes: bytes.byteLength,
                source: { kind: 'web-blob', blob: new Blob([bytes as BlobPart], { type: mediaType }) },
            }, 'generated', origin.sessionId ?? null, undefined, null, [], origin)
        },
        createGrant,
        async readFileText(fileId) {
            const file = await options.repository.getVaultFile(fileId)
            return file?.extracted_text ?? null
        },
        async readFilePreview(fileId) {
            const file = await options.repository.getVaultFile(fileId)
            if (!file || file.status !== 'available' || !file.private_uri) return null
            const bytes = await options.fileStore.readPrivate(file.private_uri)
            return { bytes, mediaType: file.media_type }
        },
        revokeGrant: (grantId) => options.repository.revokeFileAuthorityGrant(grantId),
        async resolveMessageParts(messageId) {
            const bindings = await options.repository.listMessageAttachments(messageId)
            const parts: TalosMobileInputPart[] = []
            for (const binding of bindings) {
                if (binding.grant_status !== 'active' || !binding.permissions.includes('model.read')) {
                    throw new Error('TALOS_ATTACHMENT_AUTHORITY_INVALID')
                }
                const file = await options.repository.getVaultFile(binding.vault_file_id)
                if (!file || file.status !== 'available' || !file.sha256) {
                    throw new Error('TALOS_VAULT_FILE_UNAVAILABLE')
                }
                if (['image/png', 'image/jpeg', 'image/webp'].includes(file.media_type)) {
                    const bytes = await options.fileStore.readPrivate(file.private_uri)
                    if (bytes.byteLength !== file.size_bytes) {
                        throw new Error('TALOS_ATTACHMENT_SIZE_MISMATCH')
                    }
                    parts.push({
                        type: 'image',
                        attachmentId: binding.id,
                        name: binding.display_name,
                        mediaType: file.media_type as 'image/png' | 'image/jpeg' | 'image/webp',
                        base64: base64FromBytes(bytes),
                        sha256: file.sha256,
                    })
                    continue
                }
                if (file.extracted_text === null) throw new Error('TALOS_ATTACHMENT_TEXT_UNAVAILABLE')
                parts.push({
                    type: 'document_text',
                    attachmentId: binding.id,
                    name: binding.display_name,
                    mediaType: file.media_type,
                    text: file.extracted_text,
                    sha256: file.sha256,
                })
            }
            return parts
        },
        listFiles: () => options.repository.listVaultFiles(),
        async listSummaries() {
            const rows = await options.repository.listVaultFileSummaries()
            // Same shape as listFiles; the body is replaced by its bounded preview
            // (the Library hydrates the full text only when a doc is opened).
            return rows.map(({ text_preview: preview, ...rest }) => ({ ...rest, extracted_text: preview }))
        },
        async setFileShared(fileId, shared) {
            const file = await options.repository.getVaultFile(fileId)
            if (!file) throw new Error('TALOS_VAULT_FILE_NOT_FOUND')
            // MERGE, never replace. `updateVaultFile` overwrites the metadata
            // bag wholesale, and `origin` + `origin_session_id` live in that
            // same bag — writing the flag alone would erase where the document
            // came from, and `parseVaultOrigin` fails closed to 'uploaded', so
            // a TALOS-generated file would start looking like one the user had
            // uploaded and become eligible for injection.
            await options.repository.updateVaultFile(fileId, {
                metadata: { ...file.metadata, library_shared: shared },
            })
        },
        async deleteFile(fileId) {
            const file = await options.repository.getVaultFile(fileId)
            if (!file) throw new Error('TALOS_VAULT_FILE_NOT_FOUND')
            await options.repository.deleteVaultFile(fileId)
            if (file.private_uri) await options.fileStore.deletePrivate(file.private_uri)
        },
        async reconcilePending() {
            // Round 3: the boot path must not pull every document body — pending
            // rows are found from summaries, and only they are re-analysed.
            const pending = (await options.repository.listVaultFileSummaries())
                .filter((file) => file.status === 'pending')
            for (const file of pending) {
                try {
                    if (!file.private_uri) throw new Error('TALOS_ATTACHMENT_PRIVATE_COPY_MISSING')
                    const bytes = await options.fileStore.readPrivate(file.private_uri)
                    const analysis = await options.analysisClient.analyze({
                        bytes,
                        name: file.display_name,
                        declaredMediaType: file.media_type,
                    })
                    await options.repository.updateVaultFile(file.id, {
                        status: 'available',
                        sha256: analysis.sha256,
                        extracted_text: analysis.extractedText,
                        failure_code: null,
                        /**
                         * MERGED, never replaced. Found by an adversarial
                         * review 2026-07-31: this wrote a four-key bag and
                         * dropped everything else — including `library_shared`,
                         * whose ABSENCE means shared. A file the user had
                         * withdrawn from the model would have come back into
                         * its reach, and a generated file would have been
                         * relabelled `uploaded` and so become injectable.
                         *
                         * Unreachable today, because a pending row always has an
                         * empty `private_uri` and is failed rather than
                         * reconciled. Fixed anyway: `setFileShared` twenty lines
                         * below explains at length why merging is mandatory, and
                         * this sat under that comment not doing it.
                         */
                        metadata: {
                            ...file.metadata,
                            extension: analysis.extension,
                            page_count: analysis.pageCount,
                        },
                    })
                } catch (error) {
                    try {
                        await failPendingFile(file.id, file.private_uri, error)
                    } catch {
                        // Continue reconciling independent pending files.
                    }
                }
            }

            /*
             * ⛔⛔ LE RIGHE CHE PROMETTONO UN FILE E NON CE L'HANNO.
             *
             * È la difesa che il 2026-08-08 aveva marcato VENTIDUE righe sane e
             * che era stata ritirata. Torna adesso perché la domanda è cambiata:
             * non più «questa riga ha un file su disco?» — a cui `pending` e
             * `failed` rispondono «no» essendo perfettamente sane — ma «questa
             * riga PROMETTE un file, e la promessa regge?».
             *
             * La regola non è stata inventata: è già nel contratto dello schema,
             * e si legge nelle strade che scrivono (MISURATE il 2026-08-10,
             * leggendole tutte — sono due sole a creare una riga):
             *
             *   riga appena creata      pending   private_uri ''   nessun file, per contratto
             *   copia riuscita          available percorso pieno   IL FILE C'È
             *   copia fallita           failed    private_uri ''   nessun file, e lo dice
             *   analisi fallita         available byte tenuti      il file c'è, manca il testo
             *   ripristino (85203e76)   byte scritti PRIMA della riga
             *
             * ⇒ Solo `available` con un percorso non vuoto promette qualcosa.
             * Tutto il resto non va nemmeno cercato: cercarlo era l'errore.
             */
            const promesse = (await options.repository.listVaultFileSummaries())
                .filter(talosRigaPrometteUnFile)
            for (const file of promesse) {
                let cè = true
                try {
                    cè = await options.fileStore.existsPrivate(file.private_uri)
                } catch {
                    /*
                     * ⛔ Se non si riesce nemmeno a CHIEDERE, non si accusa.
                     * Un errore del deposito non è la prova che il file manchi,
                     * e marcare su un dubbio è come sono nati i ventidue falsi.
                     */
                    continue
                }
                if (cè) continue
                try {
                    await options.repository.updateVaultFile(file.id, {
                        status: 'failed',
                        private_uri: '',
                        failure_code: 'TALOS_VAULT_FILE_MISSING',
                    })
                } catch {
                    // Una riga che non si riesce a marcare non ferma le altre.
                }
            }
        },
    }

    /*
     * ⛔⛔ QUI C'ERA UNA DIFESA CHE FACEVA PIÙ DANNO DEL DIFETTO.
     *
     * ✅ 2026-08-10 — È TORNATA, dentro `reconcilePending`, con la DOMANDA
     * cambiata: non «questa riga ha un file?» ma «questa riga PROMETTE un file,
     * e la promessa regge?». Vedi `talosRigaPrometteUnFile` in cima al file:
     * la regola era già nel contratto dello schema e non andava inventata.
     *
     * ⛔ E una premessa scritta qui sotto è FALSA, misurata il 2026-08-10:
     * i documenti generati NON vivono «senza file per costruzione». «Salva
     * nella Libreria» su una risposta scrive
     * `files/talos-vault/files/<id>.md` — 61 byte, visti con `run-as` sul Pad.
     * Resta scritta perché è ciò che credevo quando ho fatto il danno, ed è la
     * parte che spiega perché l'ho fatto.
     *
     * Il racconto originale, che vale ancora come lezione:
     *
     * ## Cosa doveva fare
     *
     * Accorgersi delle righe della Libreria il cui file non c'è più — il caso
     * di `button_a.png`, quattro righe e tre file, contato sul Pad il
     * 2026-08-08 — e marcarle `failed` così che l'elenco lo dicesse.
     *
     * ## Cosa ha fatto davvero, MISURATO sul dispositivo
     *
     * **22 righe marcate** su una Libreria quasi tutta sana. I nomi lo
     * spiegano: erano DOCUMENTI creati dentro l'app, che una riga ce l'hanno e
     * un file su disco no — per costruzione, non per guasto. Vivono come testo
     * estratto. `existsPrivate` dice il vero: quel percorso non esiste. È la
     * DOMANDA a essere sbagliata.
     *
     * ## Perché ritirata e non aggiustata al volo
     *
     * Una Libreria che grida «il file non c'è più» su ventidue voci sane è
     * peggio di una che tace su una guasta: chi la legge impara che l'avviso
     * mente, e il giorno che dice il vero non gli crede più. Un allarme che
     * sbaglia è un allarme spento.
     *
     * ## E la lezione sul test, che è la parte da ricordare
     *
     * `ORFANA-02` esiste apposta per impedire questo, e PASSAVA. Passava perché
     * la mia finzione di `existsPrivate` rispondeva «sì» per ogni file sano,
     * mentre quella vera risponde «no» anche per le righe che un file non
     * l'hanno mai avuto. Il test difendeva l'idea che avevo del mondo, non il
     * mondo.
     *
     * ## Cosa serve prima di riprovare
     *
     * Un modo per sapere quali righe DEVONO avere un file: probabilmente un
     * campo che distingua un file acquisito da un documento generato. Va
     * cercato nei dati veri del dispositivo, non dedotto. Solo allora la
     * domanda è giusta, e solo allora il segno in `TalosMobileLibraryFileRow`
     * — che resta, ed è corretto quando lo stato è davvero `failed` — dirà il
     * vero.
     */
}
