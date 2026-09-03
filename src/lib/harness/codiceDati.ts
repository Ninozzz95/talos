import { newTalosMobileId } from '@/lib/mobileIds'
import type { TalosLocalNote, TalosLocalTask, TalosLocalMemory } from '@/repositories/chatRepository'
import { productionChatRepository } from '@/repositories/productionChatRepositorySingleton'
import { talosResearchReplay, talosResearchRecover, type TalosResearchRun, type TalosResearchEvent } from '@/lib/research/researchRun'
import { talosResearchReportRefOf } from '@/lib/research/researchCard'
import { talosResearchParseReport } from '@/lib/research/researchReport'
import { rankLibraryDocs, type LibraryDoc } from '@/lib/chat/libraryContext'
import { parseVaultOrigin } from '@/lib/vaultLibrary'
import { parseTalosFileProvenance } from '@/lib/files/provenance'

/**
 * Codice (Harness) — dati del telefono che il modello dell'harness può
 * leggere e scrivere: Note, Attività, Memoria, Libreria, Ricerca
 * approfondita (quest'ultima SOLO in lettura, vedi la nota in fondo —
 * la fetta scritta per prima li dichiarava "4 sistemi + Ricerca
 * rimandata": la riduzione giornale→testo non viveva nel repository
 * ma in funzioni pure altrove, trovate leggendo `chatController.ts`
 * DAVVERO invece di fermarsi al primo grep a vuoto). Owner 30/8,
 * correggendo un mio errore: questi sistemi ESISTONO GIÀ, sono maturi
 * e testati (vedi
 * `@/lib/tools/toolset.ts` — `listNotes`/`listTasks`/`searchMemories`/i
 * `library_*` tool della chat normale) — non andavano RICOSTRUITI
 * portando le fasi del lane desktop (FASE N, store+backend+frontend
 * nuovi), andavano COLLEGATI al kernel dell'harness (`talosHarness.mjs`),
 * che prima di stanotte non li offriva affatto.
 *
 * ⛔ Lives OUTSIDE `chatController.ts`/il composable dell'intera chat,
 * stesso motivo di `codiceSessions.ts` accanto: `HarnessSessionScreen.vue`
 * non deve MAI importare quel composable (CODE-COMPOSER-SINGLE-SOURCE-01
 * vieta anche solo scriverne il nome in quel file — trovato per errore
 * stanotte, vedi il commento in HarnessSessionScreen.vue). Questo file e
 * quello importano la STESSA `productionChatRepository` — una sola
 * connessione SQLite, mai una seconda.
 *
 * ⛔ Local-first: legge/scrive l'SQLite on-device diretto. Nessuna rete,
 * nessun PC — vedi [[mobile-app-local-first-requirement]].
 *
 * ⭐ Scritture DELIBERATAMENTE più semplici delle loro gemelle in
 * `@/lib/tools/*WriteTools.ts`: quelle hanno una `verify()` con recupero
 * dopo un errore di rete (arXiv 2608.02645, "verified tool calls") perché
 * vivono dentro l'esecutore A5 della chat — il kernel dell'harness non
 * ha quell'infrastruttura (nessun `document_create` ce l'ha, ed è lo
 * stesso schema che questi seguono), quindi qui ci si ferma a
 * create/update/remove/find onesti, senza il ramo "verificato dopo
 * l'errore". Non un taglio nascosto: dichiarato, come ogni altro confine
 * di questa prima fetta.
 *
 * ⛔ Task: ESCLUSA di proposito la pianificazione (`schedule_json`/
 * `instruction`/`last_run_at`) — stesso confine che `tasksWriteTools.ts`
 * si è già dato ("Cosa NON c'è qui, di proposito"), non un'invenzione
 * mia: un'attività che parte da sola non è ancora una funzione della
 * chat normale, quindi non lo è nemmeno qui.
 *
 * ⛔ Memoria: `searchCodiceMemories` NON restituisce un id — stessa
 * forma di `sources.searchMemories` in `toolset.ts` (verificato, non
 * assunto: `readTools.ts` conferma `{title, content, contentOrigin}`,
 * senza id). `memory_update`/`memory_delete` nel kernel erediteranno
 * la STESSA limitazione che la chat normale ha già, non una regressione
 * introdotta qui.
 *
 * ⭐ Libreria: `listCodiceLibraryEntries` NON pagina (a differenza di
 * `library_list` sulla chat, che ha `page_token`/`page_size`) — un tetto
 * fisso (50 voci) basta per un agente di coding, la paginazione è
 * un'esigenza da conversazione lunga. `readCodiceLibraryDoc` restituisce
 * SOLO testo — niente immagini: il formato dei risultati-tool del
 * kernel (`talosHarness.mjs`) è sempre una stringa, mai una parte
 * multimediale.
 *
 * ⭐ Ricerca approfondita: SOLO lettura (elenco + rapporto di una
 * ricerca già fatta) — AVVIARNE una nuova resta escluso, stesso
 * principio già in vigore sulla chat (`AVVIANO_UNA_RICERCA`, offerta
 * solo con un motore di ricerca configurato): il kernel dell'harness
 * non ha oggi un motore configurato per questo scopo, offrire
 * `research_start` fallirebbe sempre.
 *
 * ⭐⭐⭐ 2/9 — `searchCodiceLibrary`/`readCodiceLibraryFileOrigin`
 * aggiunte dopo un'ispezione di `lane/harness-mobile-bridge-kernel`
 * (owner: "dimmi tu quale è meglio, fai attenzione"): quella lane ha
 * un `talosHarness.mjs` DIVERGENTE con Note/Attività/Memoria uguali ma
 * con un proprio store file-based GLOBALE — non collegato al vero
 * repository del telefono, verosimilmente pensato per un'esecuzione
 * standalone di TALOS-BANCO senza un device reale attaccato (ipotesi
 * NON verificata di persona: quella lane resta letta in sola lettura,
 * mai eseguita). Per QUESTO kernel (embedded, sul device vero) la
 * scelta resta collegare il repository vero, non copiare il loro store
 * — ma la loro Libreria aveva 8 tool contro i nostri 4: verificato che
 * `library_search`/`library_file_origin` sono REALI e già spedite sulla
 * chat normale (semplice gap mio, chiuso qui), mentre `library_export`
 * (apre il picker Salva-con-nome di sistema — un'interruzione UI, non
 * un dato) e `library_context_policy_update` (richiede `confirmation:
 * 'always'` e un `sessionId` di chat normale che l'harness non ha)
 * restano deliberatamente FUORI — stesso principio di research_start,
 * non un'omissione. Memoria: `title` invece di `id` resta corretto,
 * NON un difetto — verificato allo stesso modo (`sources.searchMemories`
 * in `toolset.ts` non restituisce id nemmeno sulla chat normale).
 */

// ============================== Note ==============================

export interface TalosCodiceNota {
    id: string
    title: string
    content: string
    updatedAt: string
}

export async function listCodiceNotes(): Promise<TalosCodiceNota[]> {
    const note: TalosLocalNote[] = await productionChatRepository.listNotes()
    return note.map((n) => ({ id: n.id, title: n.title, content: n.content, updatedAt: n.updated_at }))
}

export async function createCodiceNote(input: { title: string, content: string }): Promise<TalosCodiceNota> {
    const saved = await productionChatRepository.createNote({
        id: newTalosMobileId(),
        title: input.title,
        content: input.content,
        created_at: new Date().toISOString(),
    })
    return { id: saved.id, title: saved.title, content: saved.content, updatedAt: saved.updated_at }
}

export async function updateCodiceNote(id: string, patch: { title?: string, content?: string }): Promise<TalosCodiceNota> {
    const saved = await productionChatRepository.updateNote({ id, ...patch })
    return { id: saved.id, title: saved.title, content: saved.content, updatedAt: saved.updated_at }
}

export async function deleteCodiceNote(id: string): Promise<void> {
    await productionChatRepository.deleteNote(id)
}

// ============================ Attività =============================

export interface TalosCodiceTask {
    id: string
    title: string
    description: string | null
    status: 'todo' | 'doing' | 'done'
    priority: 'low' | 'normal' | 'high'
    updatedAt: string
}

function mappaTask(t: TalosLocalTask): TalosCodiceTask {
    return { id: t.id, title: t.title, description: t.description, status: t.status, priority: t.priority, updatedAt: t.updated_at }
}

export async function listCodiceTasks(): Promise<TalosCodiceTask[]> {
    return (await productionChatRepository.listTasks()).map(mappaTask)
}

export async function createCodiceTask(input: { title: string, description: string | null, priority: 'low' | 'normal' | 'high' }): Promise<TalosCodiceTask> {
    const saved = await productionChatRepository.createTask({
        id: newTalosMobileId(),
        title: input.title,
        description: input.description,
        run_id: null,
        priority: input.priority,
        created_at: new Date().toISOString(),
    })
    return mappaTask(saved)
}

export async function setCodiceTaskStatus(id: string, status: 'todo' | 'doing' | 'done'): Promise<TalosCodiceTask> {
    const saved = await productionChatRepository.setTaskStatus(id, status)
    return mappaTask(saved)
}

export async function updateCodiceTask(id: string, patch: { title?: string, description?: string | null, priority?: 'low' | 'normal' | 'high' }): Promise<TalosCodiceTask> {
    const saved = await productionChatRepository.updateTask(id, patch)
    return mappaTask(saved)
}

export async function deleteCodiceTask(id: string): Promise<void> {
    await productionChatRepository.deleteTask(id)
}

// ============================= Memoria ==============================

export interface TalosCodiceMemoria {
    title: string
    content: string
}

export async function searchCodiceMemories(query: string): Promise<TalosCodiceMemoria[]> {
    const termini = query.toLowerCase().split(/\s+/).filter(Boolean)
    const memorie = await productionChatRepository.listMemories()
    return memorie
        .filter((m) => m.status === 'active')
        .map((m) => {
            const testo = `${m.title} ${m.content}`.toLowerCase()
            const punteggio = termini.reduce((tot, t) => tot + (testo.includes(t) ? 1 : 0), 0)
            return { m, punteggio }
        })
        .filter((r) => r.punteggio > 0)
        .sort((a, b) => b.punteggio - a.punteggio)
        .map((r) => ({ title: r.m.title, content: r.m.content }))
}

/** Stesso motivo di `TalosMemoryWriteSources.create`: la memoria non torna un id, solo il titolo. */
export async function createCodiceMemory(input: { title: string, content: string }): Promise<{ title: string }> {
    const saved: TalosLocalMemory = await productionChatRepository.createMemory({
        id: newTalosMobileId(),
        scope_type: 'global',
        scope_id: null,
        kind: 'preference',
        title: input.title,
        content: input.content,
        source: null,
        metadata: {},
        created_at: new Date().toISOString(),
    })
    return { title: saved.title }
}

/** Stesso motivo di `deleteCodiceMemoryByTitle`: nessun id dal modello, si risolve per titolo prima di chiamare `updateMemory`. */
export async function updateCodiceMemoryByTitle(title: string, patch: { title?: string, content?: string }): Promise<{ title: string } | null> {
    const memorie = await productionChatRepository.listMemories()
    const trovata = memorie.find((m) => m.status === 'active' && m.title === title)
    if (!trovata) return null
    const saved = await productionChatRepository.updateMemory(trovata.id, patch)
    return { title: saved.title }
}

export async function deleteCodiceMemoryByTitle(title: string): Promise<boolean> {
    const memorie = await productionChatRepository.listMemories()
    const trovata = memorie.find((m) => m.status === 'active' && m.title === title)
    if (!trovata) return false
    await productionChatRepository.deleteMemory(trovata.id)
    return true
}

// ============================ Libreria ==============================

export interface TalosCodiceFileLibreria {
    id: string
    displayName: string
    mediaType: string
}

const TETTO_LIBRERIA = 50

export async function listCodiceLibraryEntries(): Promise<TalosCodiceFileLibreria[]> {
    const riepiloghi = await productionChatRepository.listVaultFileSummaries()
    return riepiloghi
        .filter((f) => f.status === 'available')
        .slice(0, TETTO_LIBRERIA)
        .map((f) => ({ id: f.id, displayName: f.display_name, mediaType: f.media_type }))
}

/**
 * Solo testo — niente immagini, il kernel dell'harness non ha un formato
 * "parte immagine" nei risultati tool. `getVaultFile` (non
 * `listVaultFileSummaries`, che non porta `extracted_text`) è la STESSA
 * fonte che `toolset.ts` legge per `library_read` sulla chat normale.
 */
export async function readCodiceLibraryDoc(id: string): Promise<{ name: string, text: string } | null> {
    const file = await productionChatRepository.getVaultFile(id)
    if (!file || file.status !== 'available') return null
    if (file.media_type.startsWith('image/')) {
        return { name: file.display_name, text: '(questo file è un\'immagine: il kernel dell\'harness non può ancora leggerne il contenuto visivo)' }
    }
    return { name: file.display_name, text: file.extracted_text ?? '' }
}

export async function renameCodiceLibraryFile(id: string, displayName: string): Promise<{ id: string, name: string } | null> {
    const file = await productionChatRepository.getVaultFile(id)
    if (!file) return null
    const dopo = await productionChatRepository.updateVaultFile(id, { display_name: displayName })
    return { id: dopo.id, name: dopo.display_name }
}

export async function deleteCodiceLibraryFile(id: string): Promise<boolean> {
    const file = await productionChatRepository.getVaultFile(id)
    if (!file) return false
    await productionChatRepository.deleteVaultFile(id)
    return true
}

export interface TalosCodiceLibrarySearchHit {
    id: string
    displayName: string
    mediaType: string
    excerpt: string
}

const TETTO_RICERCA_LIBRERIA = 20

/**
 * Trovato leggendo `library_search` in `readTools.ts` (2/9, chiudendo il
 * gap contro `lane/harness-mobile-bridge-kernel`): a differenza degli
 * altri metodi di Libreria qui sopra, la ricerca vera legge il TESTO
 * completo (`listVaultFiles`, non `listVaultFileSummaries`) — la stessa
 * scelta della chat normale, commentata lì come "the one operation
 * allowed to transfer the complete extracted corpus". `rankLibraryDocs`
 * (import diretto: e' una funzione pura di scoring, non il motore della
 * chat — stessa distinzione già fatta per `talosResearchReplay` ecc.)
 * fa lo stesso ranking BM25-lite che la chat usa.
 *
 * ⛔ Semplificato rispetto al gemello della chat: nessuna pagina/
 * `next_offset`, un tetto fisso (20) — stesso principio di
 * `listCodiceLibraryEntries` (un agente di coding non scorre pagine).
 * `originSessionId`/`originSessionTitle` restano `null`: risolverli
 * vuole la mappa titoli-sessione della chat normale, che questo ponte
 * non ha (stessa onesta riduzione già presa per `readCodiceLibraryFileOrigin`
 * sotto).
 */
export async function searchCodiceLibrary(query: string, limit = 5): Promise<TalosCodiceLibrarySearchHit[]> {
    const file = await productionChatRepository.listVaultFiles()
    const mediaTypeOf = new Map(file.map((f) => [f.id, f.media_type]))
    const docs: LibraryDoc[] = file
        .filter((f) => f.status === 'available')
        .map((f) => ({
            id: f.id,
            displayName: f.display_name,
            origin: parseVaultOrigin(f.metadata),
            originSessionId: null,
            originSessionTitle: null,
            createdAt: f.created_at,
            text: f.extracted_text ?? '',
        }))
    const tetto = Math.max(1, Math.min(limit, TETTO_RICERCA_LIBRERIA))
    return rankLibraryDocs(docs, query)
        .filter(({ score }) => score > 0)
        .slice(0, tetto)
        .map(({ doc }) => ({
            id: doc.id,
            displayName: doc.displayName,
            mediaType: mediaTypeOf.get(doc.id) ?? 'application/octet-stream',
            excerpt: doc.text.slice(0, 240),
        }))
}

export interface TalosCodiceFileOrigin {
    name: string
    origin: 'uploaded' | 'generated' | 'downloaded' | 'unknown'
    model: string | null
    provider: string | null
    createdAt: string | null
    sourceUrl: string | null
}

/**
 * Stessa fonte di `readFileOrigin` in `toolset.ts` (`metadata.provenance`,
 * `parseTalosFileProvenance` — un parser puro, REFUSED su un record
 * corrotto invece di inventare un default, per costruzione). ⛔ Riduzione
 * onesta: niente `originSessionTitle` — risolvere il titolo della
 * sessione normale che ha generato il file non è un'operazione che
 * questo ponte fa altrove (stesso motivo già dichiarato per Note/
 * Attività/Memoria: il kernel dell'harness non conosce le sessioni
 * della chat normale).
 */
export async function readCodiceLibraryFileOrigin(id: string): Promise<TalosCodiceFileOrigin | null> {
    const file = await productionChatRepository.getVaultFile(id)
    if (!file) return null
    const record = parseTalosFileProvenance((file.metadata as { provenance?: unknown } | null)?.provenance)
    return {
        name: file.display_name,
        origin: record?.origin ?? 'unknown',
        model: record?.model ?? null,
        provider: record?.provider ?? null,
        createdAt: record?.createdAt ?? null,
        sourceUrl: record?.sourceUrl ?? null,
    }
}

// ============================= Ricerca ==============================

/**
 * ⭐ 30/8 — seconda occhiata, dopo aver letto DAVVERO `chatController.ts`
 * (solo lettura, mai import: la riduzione è fatta di funzioni pure,
 * portate qui una per una). La nota precedente diceva "nessun metodo
 * rapporto-già-ridotto nel repository" — vero, ma la riduzione non vive
 * nel repository: vive in tre funzioni pure che il repository non deve
 * conoscere, esattamente come `searchCodiceMemories` già rifà la STESSA
 * logica di `sources.searchMemories` invece di importarla:
 *
 * 1. `talosResearchReplay(eventi)` (`researchRun.ts`) — il giornale
 *    grezzo (`readResearchJournal`) → un `TalosResearchRun` intero
 *    (title/question/status/steps), la STESSA ricostruzione che
 *    `researchRuntime.ts`.`all()` fa per la stazione — copiata qui,
 *    non importata (importerebbe l'intero motore open/pause/resume,
 *    inutile per una fetta SOLO lettura).
 * 2. `talosResearchReportRefOf(run)` (`researchCard.ts`) — trova il
 *    passo di sintesi concluso e il suo `resultRef`: l'id del file di
 *    Libreria dove il rapporto è scritto (i rapporti SONO file di
 *    Libreria, per scelta dell'owner 2026-08-03 — `researchTools.ts`
 *    lo dice alla lettera).
 * 3. `talosResearchParseReport(testo)` (`researchReport.ts`) — il testo
 *    del file → `{summary, claims[]}` strutturato.
 *
 * Stesso principio di sempre: SOLO lettura (elenco + rapporto di una
 * ricerca già fatta) — avviarne una nuova resta escluso, il kernel
 * dell'harness non ha un motore di ricerca configurato per questo
 * scopo, `research_start` fallirebbe sempre.
 */
export interface TalosCodiceRicerca {
    id: string
    title: string
    status: string
    startedAt: string
}

async function ricostruisciCodiceRicerca(runId: string): Promise<TalosResearchRun | null> {
    const voci = await productionChatRepository.readResearchJournal(runId)
    const eventi = voci.map((v) => JSON.parse(v.payload_json) as TalosResearchEvent)
    const run = talosResearchReplay(eventi)
    if (!run) return null
    // Stesso `at` che la stazione userebbe: un passo rimasto "in corso"
    // perché il processo è morto a metà si legge come interrotto, mai
    // come ancora vivo — la stessa onestà di `talosResearchRecover` lì.
    return talosResearchRecover(run, new Date().toISOString())
}

export async function listCodiceResearch(): Promise<TalosCodiceRicerca[]> {
    const righe = await productionChatRepository.listResearchRuns()
    const ricostruite: TalosResearchRun[] = []
    for (const riga of righe) {
        const run = await ricostruisciCodiceRicerca(riga.id)
        if (run) ricostruite.push(run)
    }
    return ricostruite
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
        .map((run) => ({ id: run.id, title: run.title ?? run.question, status: run.status, startedAt: run.startedAt }))
}

/**
 * Il rapporto ridotto a testo — STESSA forma di `chatController.ts`
 * (`# titolo`, riga vuota, sommario, riga vuota, affermazioni numerate).
 * `null` per i tre casi che si leggono identici da fuori (non c'è, non
 * ha finito, non si legge) — stesso principio di `research_read` sulla
 * chat: si dice cosa fare, mai cosa è successo di preciso.
 */
export async function readCodiceResearchReport(runId: string): Promise<string | null> {
    const run = await ricostruisciCodiceRicerca(runId)
    if (!run) return null
    const ref = talosResearchReportRefOf(run)
    if (!ref) return null
    const file = await productionChatRepository.getVaultFile(ref)
    if (!file?.extracted_text) return null
    const record = talosResearchParseReport(file.extracted_text)
    if (!record) return null
    return [
        `# ${run.title ?? run.question}`,
        '',
        record.summary,
        '',
        ...record.claims.map((claim, index) => `${index + 1}. ${claim.text}`),
    ].join('\n')
}
