import { z } from 'zod'
import { defineTalosTool, type TalosToolDefinition } from '@/lib/tools/registry'
import {
    talosResearchCardOf,
    type TalosResearchBucket,
} from '@/lib/research/researchCard'
import type { TalosResearchRun } from '@/lib/research/researchRun'

/**
 * «Che ricerche ho fatto?» — la domanda che la chat non sapeva rispondere.
 *
 * Owner 2026-08-03: «per concludere il blocco research dobbiamo fare la stessa
 * cosa che abbiamo fatto per la libreria … chiedendo alla chat quali sono le
 * mie ricerche. **Non dobbiamo inventarci nulla**, mi raccomando.»
 *
 * E infatti non si inventa: la forma e' quella di `library_list` — filtri
 * dichiarati, pagina piccola, un `next_page_token` opaco — perche' un modello
 * che ha imparato a sfogliare la Libreria deve poter sfogliare le ricerche
 * senza imparare una seconda grammatica.
 *
 * ## I due metodi che NON vanno confusi
 *
 * Owner, subito dopo: «mi raccomando **non mi schiamo i due metodi**. La
 * Libreria deve rispondere ai prompt riguardo alla libreria, e quelli della
 * ricerca… quelli della ricerca. Sembra una cosa scontata, ma non lo e'.»
 *
 * Non lo e' davvero, perche' **i rapporti di ricerca SONO file di Libreria**:
 * `library_list` li elenca, e li elenca come documenti. Quindi le descrizioni
 * qui sotto dicono per differenza quando usare l'uno e quando l'altro — e' la
 * sola cosa che impedisce al modello di rispondere «che ricerche ho fatto»
 * sfogliando la Libreria e trovando anche le ricette della spesa.
 */

export interface TalosResearchToolSources {
    /** Le esecuzioni, dalla stessa fonte che alimenta la stazione. */
    list(): Promise<readonly TalosResearchRun[]>
    /** Se una sta girando adesso: il giornale non lo sa, il registro si'. */
    isRunning(id: string): boolean
    /**
     * Avvia e torna SUBITO con l'id, come fa la stazione.
     *
     * ⛔ Non aspetta la fine, ed e' l'unica scelta possibile: una ricerca dura
     * minuti, e un tool che restituisce fra dieci minuti tiene occupato il giro
     * di conversazione per tutto quel tempo — la chat sembrerebbe bloccata e il
     * modello non potrebbe dire nemmeno «l'ho avviata».
     */
    start(input: { question: string, depth: 'quick' | 'deep' | 'exhaustive' }): Promise<{ id: string }>
    /** Il rapporto, gia' ridotto a testo. `null` se non c'e' o non si legge. */
    report(runId: string): Promise<string | null>
    /** L'etichetta mostrata nell'elenco. `null` rimette la domanda. */
    rename(runId: string, title: string | null): Promise<void>
    /** Ferma e tiene tutto: si riprende. */
    pause(runId: string): Promise<void>
    /** Riprende una ricerca messa in pausa. */
    resume(runId: string): Promise<void>
    /** Ferma per sempre. Cio' che e' stato raccolto resta leggibile. */
    cancel(runId: string): Promise<void>
    /** Elimina la ricerca e i dossier che ha scritto. */
    remove(runId: string): Promise<void>
}

const DEPTHS = ['quick', 'deep', 'exhaustive'] as const

/** L'assenza si dice per quello che e', o il modello riprova identico. */
function mancante(id: string) {
    return {
        ok: false as const,
        content: 'There is no research with that id. Call research_list to see the current ones.',
        evidence: { error_code: 'TALOS_RESEARCH_NOT_FOUND', id },
    }
}

function fallito(code: string, message: string, failure: unknown) {
    return {
        ok: false as const,
        content: message,
        evidence: {
            error_code: code,
            detail: failure instanceof Error ? failure.message : String(failure),
        },
    }
}

/** Il vocabolario della stazione, non uno nuovo: sono le stesse linguette. */
const BUCKETS = ['all', 'running', 'paused', 'unfinished', 'done', 'cancelled', 'failed'] as const

function riga(card: {
    id: string
    question: string
    bucket: TalosResearchBucket
    startedAt: string
    done: number
    total: number
}): string {
    const avanzamento = card.total > 0 ? ` ${card.done}/${card.total}` : ''
    return `${card.question} — ${card.bucket}${avanzamento} — ${card.startedAt.slice(0, 10)} — id ${card.id}`
}

export function createTalosResearchTools(
    sources: TalosResearchToolSources,
): TalosToolDefinition<never>[] {
    return [
        defineTalosTool({
            name: 'research_list',
            title: 'Browse deep researches',
            /**
             * La descrizione fa un lavoro solo, ed e' distinguersi da
             * `library_list`: i rapporti stanno in Libreria, quindi senza
             * questa riga il modello risponderebbe alla domanda sbagliata con
             * lo strumento sbagliato — e sembrerebbe pure che funzioni.
             */
            description: 'List the deep researches the user has run, with how each one ended and how far it got. Use this whenever the user asks about their researches — what they investigated, which ones are still running, which failed. Do NOT use library_list for that: research reports are saved as Library files, so library_list finds them mixed in with every other document and cannot say whether a research finished, was paused, or failed.',
            action: 'read',
            input: z.object({
                status: z.enum(BUCKETS).default('all')
                    .describe('Filter by how it ended. `running` and `paused` are the ones still worth acting on.'),
                page_size: z.number().int().min(1).max(20).default(10)
                    .describe('Maximum entries in this page.'),
                offset: z.number().int().min(0).default(0)
                    .describe('How many to skip. Newest first, so 0 is the most recent.'),
            }),
            async run(input) {
                let runs: readonly TalosResearchRun[]
                try {
                    runs = await sources.list()
                } catch {
                    return {
                        ok: false,
                        content: 'The research journal could not be read on this device.',
                        evidence: { error_code: 'TALOS_RESEARCH_LIST_UNAVAILABLE' },
                    }
                }

                const cards = runs.map((run) => talosResearchCardOf(run, {
                    isRunning: sources.isRunning(run.id),
                    standing: null,
                }))
                const filtrate = input.status === 'all'
                    ? cards
                    : cards.filter((card) => card.bucket === input.status)
                // Le piu' recenti per prime: «che ricerche ho fatto» quasi
                // sempre vuol dire «le ultime», e chi cerca una vecchia scorre.
                const ordinate = [...filtrate].sort((a, b) => b.startedAt.localeCompare(a.startedAt))
                const pagina = ordinate.slice(input.offset, input.offset + input.page_size)

                if (ordinate.length === 0) {
                    // «Nessuna» e «nessuna di quel tipo» sono frasi diverse, e
                    // dire la prima quando vale la seconda manda a rifare una
                    // ricerca che esiste gia'.
                    return {
                        ok: true,
                        content: input.status === 'all'
                            ? 'No deep research has been run on this device yet.'
                            : `No research matches the status "${input.status}", though others exist.`,
                        evidence: { listed: [], returned: 0, total: cards.length },
                    }
                }

                return {
                    ok: true,
                    content: pagina.map(riga).join('\n'),
                    evidence: {
                        listed: pagina.map((card) => card.id),
                        returned: pagina.length,
                        total: ordinate.length,
                        next_offset: input.offset + pagina.length < ordinate.length
                            ? input.offset + pagina.length
                            : null,
                    },
                }
            },
        }) as TalosToolDefinition<never>,

        defineTalosTool({
            name: 'research_start',
            title: 'Start a deep research',
            /**
             * ⛔ La descrizione deve distinguerlo da `web_search`, ed e' la
             * riga che decide se questo tool serve o fa danni: una ricerca
             * approfondita costa minuti e chiamate a pagamento, e usarla per
             * «che tempo fa» sarebbe sprecare entrambi.
             */
            description: [
                'Start a deep research: TALOS plans several lines of enquiry, searches, reads the sources and writes a report with verified claims.',
                'It takes MINUTES and spends real search credit. Use it only when the user asks to investigate, compare or produce a documented answer — "research this", "dig into", "write me a report on".',
                'For a single fact or a quick check, use web_search instead: it answers in seconds and costs almost nothing.',
                'This returns as soon as the research has started, not when it is finished. Tell the user it is running and that they can ask about it later.',
            ].join(' '),
            action: 'write',
            /*
             * ⛔ Anche `outbound`, e non e' una formalita': avviare una ricerca
             * manda la DOMANDA a un motore di ricerca esterno. Chi ha messo i
             * permessi di rete su «chiedi» deve essere chiesto qui, non
             * scoprire dopo che la sua domanda e' uscita dal dispositivo.
             */
            requiredActions: ['outbound'],
            input: z.object({
                question: z.string().min(1).max(500)
                    .describe('What to investigate, as a question. This is also the name the research will carry.'),
                depth: z.enum(DEPTHS).default('deep')
                    .describe('quick = a few lines of enquiry; deep = the usual; exhaustive = many, and much slower. Do not choose exhaustive unless the user asked for thoroughness.'),
            }),
            async run(input) {
                try {
                    const { id } = await sources.start({
                        question: input.question.trim(),
                        depth: input.depth,
                    })
                    return {
                        ok: true,
                        content: `Started the research «${input.question.trim()}» (id ${id}). `
                            + 'It runs in the background and keeps going even if the app is closed.',
                        evidence: { id, depth: input.depth },
                    }
                } catch (failure) {
                    return fallito('TALOS_RESEARCH_START_FAILED', 'That research could not be started on this device.', failure)
                }
            },
        }) as TalosToolDefinition<never>,

        defineTalosTool({
            name: 'research_read',
            title: 'Read a research report',
            description: [
                'Read the report a finished deep research wrote, with its claims and how each one was verified.',
                'Use this when the user asks what a research found — do not answer from the title alone, which says what was asked and not what was learnt.',
            ].join(' '),
            action: 'read',
            input: z.object({
                id: z.string().min(1).describe('The research id, from research_list.'),
            }),
            async run(input) {
                let testo: string | null
                try {
                    testo = await sources.report(input.id)
                } catch (failure) {
                    return fallito('TALOS_RESEARCH_READ_FAILED', 'That report could not be read on this device.', failure)
                }
                if (testo === null) {
                    /*
                     * Tre casi diversi che qui arrivano identici — non c'e', non
                     * ha finito, non si legge — e dirne uno solo manderebbe a
                     * rifare una ricerca che magari sta ancora girando. Quindi
                     * si dice cosa fare, non cosa e' successo.
                     */
                    return {
                        ok: false,
                        content: 'There is no readable report for that research: it may still be running, '
                            + 'or it may have stopped before writing one. Call research_list to see how it ended.',
                        evidence: { error_code: 'TALOS_RESEARCH_REPORT_UNAVAILABLE', id: input.id },
                    }
                }
                return { ok: true, content: testo, evidence: { id: input.id } }
            },
        }) as TalosToolDefinition<never>,

        defineTalosTool({
            name: 'research_rename',
            title: 'Rename a research',
            description: [
                'Change the label a research carries in the list.',
                'This changes the name only — it does not change what was investigated or re-run anything.',
            ].join(' '),
            action: 'write',
            input: z.object({
                id: z.string().min(1).describe('The research id, from research_list.'),
                title: z.string().min(1).max(200).nullable()
                    .describe('The new label. Send null to go back to showing the question.'),
            }),
            async run(input) {
                try {
                    await sources.rename(input.id, input.title === null ? null : input.title.trim())
                    return {
                        ok: true,
                        content: input.title === null
                            ? 'That research shows its question again.'
                            : `Renamed that research to «${input.title.trim()}».`,
                        evidence: { id: input.id, title: input.title },
                    }
                } catch (failure) {
                    return failure instanceof Error && failure.message.includes('NOT_FOUND')
                        ? mancante(input.id)
                        : fallito('TALOS_RESEARCH_RENAME_FAILED', 'That research could not be renamed.', failure)
                }
            },
        }) as TalosToolDefinition<never>,

        defineTalosTool({
            name: 'research_pause',
            title: 'Pause a research',
            /**
             * ⛔ Separato da `research_cancel` e non un `mode` dentro un tool
             * solo: «mettila in pausa» e «annullala» sono due intenzioni che una
             * persona esprime in modo diverso, e un tool che chiede quale delle
             * due sceglierebbe male proprio quando conta — annullare non si
             * disfa. Stessa ragione per cui `tasks_complete` esiste accanto a
             * `tasks_update`.
             */
            description: [
                'Stop a running research, keeping everything it has collected so far. It can be resumed later with research_resume.',
                'Use this when the user wants it to stop for now. If they want it stopped for good, use research_cancel.',
            ].join(' '),
            action: 'write',
            input: z.object({
                id: z.string().min(1).describe('The research id, from research_list.'),
            }),
            async run(input) {
                try {
                    await sources.pause(input.id)
                    return {
                        ok: true,
                        content: 'That research is paused. Everything it collected is kept, and it can be resumed.',
                        evidence: { id: input.id },
                    }
                } catch (failure) {
                    return failure instanceof Error && failure.message.includes('NOT_FOUND')
                        ? mancante(input.id)
                        : fallito('TALOS_RESEARCH_PAUSE_FAILED', 'That research could not be paused.', failure)
                }
            },
        }) as TalosToolDefinition<never>,

        defineTalosTool({
            name: 'research_resume',
            title: 'Resume a research',
            description: [
                'Carry on a research that was paused or left unfinished, from where it stopped.',
                'The ones worth resuming show as paused or unfinished.',
                'It does not start over — what was already collected is not searched again.',
            ].join(' '),
            action: 'write',
            // Riprendere significa continuare a cercare: esce dal dispositivo
            // come l'avvio, e chiede lo stesso permesso.
            requiredActions: ['outbound'],
            input: z.object({
                id: z.string().min(1).describe('The research id, from research_list.'),
            }),
            async run(input) {
                try {
                    await sources.resume(input.id)
                    return {
                        ok: true,
                        content: 'That research is running again, from where it had stopped.',
                        evidence: { id: input.id },
                    }
                } catch (failure) {
                    return failure instanceof Error && failure.message.includes('NOT_FOUND')
                        ? mancante(input.id)
                        : fallito('TALOS_RESEARCH_RESUME_FAILED', 'That research could not be resumed.', failure)
                }
            },
        }) as TalosToolDefinition<never>,

        defineTalosTool({
            name: 'research_cancel',
            title: 'Stop a research for good',
            description: [
                'Stop a research for good. What it already collected stays readable; nothing more is searched or paid for.',
                'Prefer research_pause when the user only wants it to stop for now: a cancelled research cannot be resumed.',
            ].join(' '),
            action: 'write',
            input: z.object({
                id: z.string().min(1).describe('The research id, from research_list.'),
            }),
            async run(input) {
                try {
                    await sources.cancel(input.id)
                    return {
                        ok: true,
                        content: 'That research is stopped for good. What it collected is still readable.',
                        evidence: { id: input.id },
                    }
                } catch (failure) {
                    return failure instanceof Error && failure.message.includes('NOT_FOUND')
                        ? mancante(input.id)
                        : fallito('TALOS_RESEARCH_CANCEL_FAILED', 'That research could not be stopped.', failure)
                }
            },
        }) as TalosToolDefinition<never>,

        defineTalosTool({
            name: 'research_delete',
            title: 'Delete a research',
            description: [
                'Delete a research and the report it wrote, permanently.',
                'Say which one you are about to delete before doing it.',
                'Prefer research_cancel for one that is merely unwanted: a stopped research is still a record, a deleted one is gone along with its sources.',
            ].join(' '),
            action: 'write',
            input: z.object({
                id: z.string().min(1).describe('The research id, from research_list.'),
            }),
            async run(input) {
                try {
                    await sources.remove(input.id)
                    return {
                        ok: true,
                        content: 'That research and its report have been deleted.',
                        evidence: { id: input.id },
                    }
                } catch (failure) {
                    return failure instanceof Error && failure.message.includes('NOT_FOUND')
                        // Gia' assente e' l'esito voluto, ottenuto da altri.
                        ? {
                            ok: true,
                            content: 'There was no research with that id — nothing to delete.',
                            evidence: { id: input.id, already_absent: true },
                        }
                        : fallito('TALOS_RESEARCH_DELETE_FAILED', 'That research could not be deleted.', failure)
                }
            },
        }) as TalosToolDefinition<never>,
    ]
}
